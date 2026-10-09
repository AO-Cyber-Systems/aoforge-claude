'use strict';

/**
 * Tests for the objective PR title (TRD 61-03, STOR-02): `gh pr start` titles the PR `Objective <N>: <name>`, where the
 * name comes from the same chain as the objective issue's title (lib/objective-name.cjs): the ROADMAP name, then the
 * OBJECTIVE.md heading, then the directory slug without its number prefix.
 *
 * Before 61-03 the PR title fell back from ROADMAP straight to the directory slug, so a fresh store (no ROADMAP entry;
 * the view is generated from the issues) produced `Objective 2: goodbye-cli` beside the issue `[Objective 2] Goodbye CLI`.
 *
 * Test list:
 *   4  fresh store (no ROADMAP entry), OBJECTIVE.md `# Objective 7: Goodbye CLI` -> PR `Objective 7: Goodbye CLI`
 *   5  a ROADMAP name still wins over the OBJECTIVE.md heading
 *   6  no ROADMAP entry and no `# ` heading -> `Objective 7: store-demo`, never `07-store-demo`
 *   7  the issue name (gh.readObjectiveState) and the PR title's name are the same string
 *   8  `gh pr sync` after a start sends no title, so a title a human edited on GitHub is kept
 *
 * Hermetic, as gh-pr.test.cjs builds it: the project, the outbox and the capability cache live under os.tmpdir()
 * (hermeticEnv); GitHub is the in-memory fake installed through gh-client's seam; git is a local bare `origin` plus a
 * clone on `main`, and the project root IS that clone. The clock never really sleeps. OBJECTIVE.md and ROADMAP text are
 * literals. Nothing touches the real ~/.claude, a real remote or port 8080.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const bodyLib = require('./gh-body.cjs');
const gh = require('./gh.cjs');
const prLib = require('./gh-pr.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');

const GIT = gitAvailable();
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const OBJECTIVE_DIR = '07-store-demo';
const BRANCH = `df/objective-${OBJECTIVE_DIR}`; // objective_branch_template with the fixture's directory name

// A ROADMAP with no entry for objective 7, as a fresh store's generated view has.
const ROADMAP_WITHOUT_OBJECTIVE = '# Roadmap: Store Demo\n\n## Objectives\n\n_No objectives yet._\n';

let S = null;

/** Make every branch origin holds known to the fake, as GitHub knows what was pushed to it. */
function syncRefs() {
  let out = '';
  try {
    out = S.g.git(S.g.origin, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']);
  } catch (_) {
    return; // origin is gone
  }
  for (const line of out.split('\n')) {
    const [name, sha] = line.trim().split(' ');
    if (name && sha) S.fake.pushRef(name, sha);
  }
}

/**
 * A git clone with a store-shaped `.aoforge/` cache inside it (untracked, so a test may edit it and still start), a fake
 * GitHub whose `main` is the clone's tip, and the objective issued and mapped. No TRDs are mapped: the title does not
 * depend on them.
 */
function setup() {
  const envh = hermeticEnv();
  const g = makeGitRemote();
  const project = makeStoreProject({ store: true, hasWiki: false });
  fs.cpSync(path.join(project.root, '.aoforge'), path.join(g.work, '.aoforge'), { recursive: true });
  project.cleanup();
  const root = g.work;

  const c0 = g.git(root, ['rev-parse', 'HEAD']);
  const fake = createFakeGitHub({
    repo: 'o/r', hasWiki: false, refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name),
  });
  const clock = { t: T0 };
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  S = { envh, g, root, fake, c0, clock, objN: null };
  client._setRunGh((args, opts) => {
    syncRefs();
    return fake.runGh(args, opts);
  });

  const body = bodyLib.mergeManaged('', { summary: 'Mine', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, '7').body;
  S.objN = fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['aoforge:objective'], assignees: ['alice'] });
  const mapping = mappingLib.readMappingV3(root);
  mappingLib.setEntry(mapping, '7', { issue_id: S.objN });
  assert.ok(mappingLib.writeMappingV3(root, mapping).ok);
  return S;
}

afterEach(() => {
  if (!S) return;
  client._resetClient();
  S.g.cleanup();
  S.envh.restore();
  S = null;
});

const planning = (...parts) => path.join(S.root, '.aoforge', ...parts);
const writeRoadmap = (text) => fs.writeFileSync(planning('ROADMAP.md'), text);
const writeObjective = (text) => fs.writeFileSync(planning('objectives', OBJECTIVE_DIR, 'OBJECTIVE.md'), text);
const prRecords = () => S.fake.issues.filter((i) => i.pr);
const upsertOps = () => outbox.readJournal(S.root).journal.ops.filter((o) => o.kind === 'upsert-pr');

/** The fresh store of a live run: no ROADMAP entry for the objective, and an OBJECTIVE.md that names it. */
function freshStore(heading) {
  setup();
  writeRoadmap(ROADMAP_WITHOUT_OBJECTIVE);
  writeObjective(heading);
}

function start() {
  const r = prLib.startObjectivePr(S.root, '7');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.flush.status, 'flushed', JSON.stringify(r.flush));
  assert.equal(prRecords().length, 1, 'exactly one PR');
  return r;
}

describe('61-03 objective PR title', { skip: GIT ? false : 'git is not available' }, () => {
  test('4. a fresh store (no ROADMAP entry) titles the PR from OBJECTIVE.md\'s heading, not the directory slug', () => {
    freshStore('# Objective 7: Goodbye CLI\n');
    start();
    assert.equal(prRecords()[0].title, 'Objective 7: Goodbye CLI');
    assert.equal(prRecords()[0].pr.head.ref, BRANCH);
  });

  test('5. a ROADMAP name still wins over the OBJECTIVE.md heading', () => {
    setup(); // the fixture's ROADMAP carries `### Objective 7: Store demo`
    writeObjective('# Objective 7: Heading name\n');
    start();
    assert.equal(prRecords()[0].title, 'Objective 7: Store demo');
  });

  test('6. no ROADMAP entry and no heading in OBJECTIVE.md: the bare slug, never the numbered directory name', () => {
    freshStore('Just a paragraph, no title heading.\n');
    start();
    assert.equal(prRecords()[0].title, 'Objective 7: store-demo');
  });

  test('7. the objective issue and the PR read alike: both take their name from one chain', () => {
    freshStore('# Objective 7: Goodbye CLI\n');
    start();
    const issueName = gh.readObjectiveState(OBJECTIVE_DIR, S.root).name;
    assert.equal(issueName, 'Goodbye CLI');
    assert.equal(prRecords()[0].title, `Objective 7: ${issueName}`);
  });

  test('8. gh pr sync sends no title, so a title edited on GitHub is kept', () => {
    freshStore('# Objective 7: Goodbye CLI\n');
    start();
    assert.equal(upsertOps().length, 1, 'start queued one upsert-pr');

    prRecords()[0].title = 'Edited by a human';
    const r = prLib.syncObjectivePr(S.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.flush.status, 'flushed', JSON.stringify(r.flush));

    const synced = upsertOps();
    assert.equal(synced.length, 2, 'sync queued a second upsert-pr');
    assert.equal(synced[1].payload.title, undefined, 'a sync never carries a title');
    assert.equal(prRecords().length, 1, 'still one PR');
    assert.equal(prRecords()[0].title, 'Edited by a human', 'the remote title is not overwritten');
  });
});
