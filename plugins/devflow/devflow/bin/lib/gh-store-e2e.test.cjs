'use strict';

// gh-store-e2e.test.cjs (TRD 47-13) — objective 47's success criteria, end to end through the public commands
// (`gh sync`, `gh pull --all`, `gh outbox`, `gh trd`) on ONE stateful fake GitHub and ONE local wiki remote.
//
// Test list -> success criterion:
//   SC1  push and rebuild
//        1. hermetic guard: the real ~/.claude/devflow/state store dirs and this repository are never written
//        2. `gh sync 7` -> objective issue, 3 TRD sub-issues (in order), blocked-by 07-03 <- 07-01, issue types and
//           fields, the wiki pages, and the objective body's `wiki` section pins the remote head
//        3. delete the compare set, `gh pull --all` -> every file byte-identical; the hand-written ROADMAP.md is
//           untouched; a generated STATE.md appears
//        4. a second pull writes nothing; a re-sync is zero writes
//   SC2  budget
//        5. a 60,001-character TRD refuses the whole sync before any gh call (nothing exists afterwards);
//           exactly 60,000 syncs with a budget warning
//   SC3  scope comments
//        6. scope n=2, n=1, n=3 -> effective spec ordered 1, 2, 3; `gh trd fold` on the closed TRD
//   SC4  offline queue and remote-edit halt
//        7. offline: freeze + scope are queued; `gh outbox flush` exits 3; nothing written
//        8. reconnect: flush exits 0 and the writes land in journal (enqueue) order
//        9. a human edit since the last pull halts the flush (exit 2) naming the issue; nothing after the halt
//           is written; `resolve --accept-remote` keeps the human's body
//   SC5  degraded repository
//        10. user-owned repo without a wiki: labels + body `meta` instead of types/fields, `docs/devflow/` pages
//        11. pull rebuilds the compare set byte-identically from labels + meta + docs pages
//   12. a wiki with no first page: issues are created, the flush halts at the wiki push, no docs/ fallback
//   13. (gh-seam.repo.test.cjs) the seam guard covers gh-store-cli.cjs
//
// Hermetic: the fake GitHub is installed ONLY through `gh._setRunGh(fake.runGh)` (one call reaches every gh-*
// module through gh-client), the clock is fake, HOME / outbox / cache dirs are temp dirs from `hermeticEnv()`,
// and the wiki is a local bare repo reached over file://. No real GitHub, no network, no port.

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const gh = require('./gh.cjs');
const ghPull = require('./gh-pull.cjs');
const cli = require('./gh-store-cli.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const ghCache = require('./gh-cache.cjs');
const ghTrd = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DIR = STORE_FIXTURE.objectiveDir;
const OBJ_REL = `objectives/${DIR}`;

// The compare set of decision D-25: everything a pull must regenerate byte for byte.
const COMPARE_SET = [
  `${OBJ_REL}/OBJECTIVE.md`,
  `${OBJ_REL}/07-CONTEXT.md`,
  `${OBJ_REL}/07-RESEARCH.md`,
  ...STORE_FIXTURE.trdFiles.map((f) => `${OBJ_REL}/${f}`),
  `${OBJ_REL}/${STORE_FIXTURE.summaryFile}`,
  'PROJECT.md',
  'REQUIREMENTS.md',
];

// ─── Harness ─────────────────────────────────────────────────────────────────

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}

/** An exit that was never called is an exit 0 (gh-pull exits only on failure). */
const exitOf = (r) => (r.code === null ? 0 : r.code);
const json = (r) => JSON.parse(r.stdout);

const needsGit = (t) => (gitAvailable() ? false : (t.skip('git is not available: the wiki cases need it'), true));

/** Per-test state; `useStore()` rebuilds it before every test of the describe it is called in. */
let S;

// The commands under test, exactly as df-tools dispatches them (in-process).
const syncCmd = (root, args = ['7']) => capture(() => gh.cmdGhSync(root, args, false));
const pullAll = (root, args = ['--all']) => capture(() => ghPull.cmdGhPull(root, args, true));
const outboxCmd = (root, args, raw = true) => capture(() => cli.cmdGhOutbox(root, args, raw));
const trdCmd = (root, args, raw = true) => capture(() => cli.cmdGhTrd(root, args, raw));

/**
 * Hermetic env + store project + fake GitHub + fake clock. `wiki` is `'remote'` (a local bare repo behind
 * DEVFLOW_WIKI_REMOTE), `'missing'` (a path that does not exist: an uninitialised wiki) or `'none'` (no wiki
 * is reachable at all; used with `hasWiki:false`, where the docs backend is chosen and the remote is never read).
 * `push: true` runs `gh sync 7` once after setup and keeps the result in `S.pushed`.
 */
function useStore({ wiki = 'remote', push = false, fake: fakeOverrides = {}, project: projectOverrides = {} } = {}) {
  beforeEach((t) => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store: true, ...projectOverrides });
    const fake = createFakeGitHub({ ...project.fakeOptions, ...fakeOverrides });
    const clock = { t: T0, sleeps: [] };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.sleeps.push(ms); clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();

    const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
    let restoreGit = () => {};
    let remote = null;
    if (gitAvailable()) restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
    if (wiki === 'remote' && gitAvailable()) {
      remote = createWikiRemote();
      process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;
    } else {
      process.env.DEVFLOW_WIKI_REMOTE = pathToFileURL(path.join(envh.root, 'no-wiki.git')).href;
    }
    S = { envh, project, root: project.root, fake, clock, remote, restoreGit, savedRemote, pushed: null };

    if (push) {
      if (!gitAvailable() && wiki === 'remote') { t.skip('git is not available: the wiki cases need it'); return; }
      S.pushed = syncCmd(S.root);
      assert.equal(exitOf(S.pushed), 0, S.pushed.stdout + S.pushed.stderr);
    }
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
    else process.env.DEVFLOW_WIKI_REMOTE = S.savedRemote;
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (...rel) => path.join(S.root, '.planning', ...rel);
const issueByNumber = (n) => S.fake.issues.find((i) => i.number === n);
const getJson = (endpoint) => JSON.parse(S.fake.runGh(['api', endpoint]).stdout);
const mappingNow = () => mappingLib.readMappingV3(S.root);
const trdNumber = (id) => mappingLib.getTrd(mappingNow(), id).issue_number;
const objectiveNumber = () => mappingLib.getEntry(mappingNow(), '7').issue_id;
const journalOps = () => outbox.readJournal(S.root).journal.ops;

/** `{ rel: Buffer }` for each file under .planning/ (null when absent). */
function snapshot(rels) {
  const out = {};
  for (const rel of rels) {
    const file = planning(rel);
    out[rel] = fs.existsSync(file) ? fs.readFileSync(file) : null;
  }
  return out;
}

function wipe(rels) {
  for (const rel of rels) fs.rmSync(planning(rel), { force: true });
}

function assertSameBytes(before, afterSnap) {
  for (const rel of Object.keys(before)) {
    assert.ok(afterSnap[rel] !== null, `${rel} was regenerated`);
    assert.ok(before[rel].equals(afterSnap[rel]), `${rel} is byte-identical after the pull`);
  }
}

// ─── 1. Hermetic guard ───────────────────────────────────────────────────────

// The real, per-user state the store would write into if an env override were missed. Only the directories the
// store modules own are compared: other live sessions legitimately write elsewhere under .../state.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const REAL_STATE = path.join(os.userInfo().homedir, '.claude', 'devflow', 'state');
const STORE_STATE_DIRS = ['outbox', 'gh-project'];

function listTree(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${path.relative(dir, p)}:${fs.statSync(p).size}`);
    }
  };
  walk(dir);
  return out.sort();
}

function hermeticSnapshot() {
  const snap = { state: {}, repo: {} };
  for (const d of STORE_STATE_DIRS) snap.state[d] = listTree(path.join(REAL_STATE, d));
  // Where a store test with a confused cwd would write: the wiki clone and docs pages of THIS repository.
  for (const rel of ['.planning/wiki', 'docs/devflow']) snap.repo[rel] = fs.existsSync(path.join(REPO_ROOT, rel));
  return snap;
}

let HERMETIC_BEFORE;
before(() => { HERMETIC_BEFORE = hermeticSnapshot(); });

describe('1. the suite is hermetic', () => {
  useStore({ wiki: 'remote' });

  test('1a. every location a store command can write to points into a temp directory', () => {
    const tmp = fs.realpathSync(os.tmpdir());
    for (const key of ['HOME', 'DEVFLOW_OUTBOX_DIR', 'DEVFLOW_GH_CACHE_DIR']) {
      const value = process.env[key];
      assert.ok(fs.realpathSync(path.dirname(value)).startsWith(tmp), `${key} (${value}) is under ${tmp}`);
      assert.ok(!value.startsWith(REAL_STATE), `${key} is not under the real state dir`);
    }
    assert.ok(fs.realpathSync(S.root).startsWith(tmp), 'the project root is a temp dir');
    assert.notEqual(S.root, REPO_ROOT, 'never this repository');
  });
});

after(() => {
  const now = hermeticSnapshot();
  assert.deepEqual(now.state, HERMETIC_BEFORE.state, 'the real ~/.claude/devflow/state outbox / gh-project listing did not change');
  assert.deepEqual(now.repo, HERMETIC_BEFORE.repo, 'this repository gained no wiki clone and no docs/devflow');
});

// ─── SC1 push (test 2) ───────────────────────────────────────────────────────

describe('SC1 push: gh sync 7 on an organisation repo with a wiki', () => {
  useStore({ push: true });

  test('2. objective issue, 3 ordered TRD sub-issues, blocked-by edge, types and fields, wiki pages, pinned wiki sha', (t) => {
    if (needsGit(t)) return;
    const res = JSON.parse(S.pushed.stdout);
    assert.equal(res.ok, true, S.pushed.stdout);
    assert.equal(res.hierarchy.outbox, 'flushed', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'pushed');

    const obj = objectiveNumber();
    const objective = issueByNumber(obj);
    assert.ok(objective.labels.includes('devflow:objective'), `labels: ${objective.labels}`);

    const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
    assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers, 'sub-issues in TRD order');

    const gamma = issueByNumber(numbers[2]);
    const blockedBy = getJson(`repos/o/r/issues/${numbers[2]}/dependencies/blocked_by`);
    assert.deepEqual(blockedBy.map((i) => i.id), [1_000_000 + numbers[0]], 'blocked-by is 7-01\'s REST id, never its number');
    assert.equal(gamma.title, '[TRD 07-03] gamma', 'the TRD issue title is the zero-padded key and the slug');

    for (const n of numbers) assert.equal(issueByNumber(n).type, 'TRD', `#${n} has the TRD issue type`);
    assert.equal(objective.type, 'Objective');
    const fields = getJson(`repos/o/r/issues/${obj}/issue-field-values`);
    const names = Object.fromEntries(getJson('orgs/o/issue-fields').map((f) => [f.id, f.name]));
    const byName = Object.fromEntries(fields.map((f) => [names[f.field_id], f.value]));
    assert.equal(byName.work, 'feature', JSON.stringify(fields));
    assert.equal(byName.kind, 'plugin', JSON.stringify(fields));

    const home = S.remote;
    assert.equal(home.readRemotePage('Objective-7-store-demo'), fs.readFileSync(planning(OBJ_REL, 'OBJECTIVE.md'), 'utf8'),
      'the objective page is OBJECTIVE.md as it is on disk');
    for (const page of ['Project', 'Requirements', 'Roadmap']) assert.equal(typeof home.readRemotePage(page), 'string', `${page} page`);
    assert.equal(home.readRemotePage('Project'), STORE_FIXTURE.project);
    assert.equal(home.readRemotePage('Requirements'), STORE_FIXTURE.requirements);

    const wikiSection = bodyLib.extractSection(objective.body, 'wiki');
    assert.ok(wikiSection.includes(home.headSha().slice(0, 7)), `the wiki section pins the remote head:\n${wikiSection}`);
  });
});

// ─── SC1 pull and idempotence (tests 3-4) ────────────────────────────────────

describe('SC1 pull: the cache rebuilds from GitHub alone', () => {
  useStore({ push: true });

  test('3. delete the compare set, gh pull --all -> byte-identical files; ROADMAP.md untouched; generated STATE.md', (t) => {
    if (needsGit(t)) return;
    const original = snapshot(COMPARE_SET);
    for (const [rel, buf] of Object.entries(original)) assert.ok(buf !== null, `${rel} existed after the push`);
    const roadmapBefore = fs.readFileSync(planning('ROADMAP.md'));
    const config = fs.readFileSync(planning('config.json'));
    assert.equal(fs.existsSync(planning('STATE.md')), false, 'the fixture has no STATE.md');

    wipe(COMPARE_SET);
    const writesBefore = S.fake.writes().length;
    const r = pullAll(S.root);
    const res = json(r);
    assert.equal(res.ok, true, r.stdout + r.stderr);
    // The fixture's hand-written ROADMAP.md is the one thing a pull must leave alone and say so; nothing else
    // needs a look, so the exit is 2 ("rebuilt, one file needs attention") and the attention list is exactly that.
    assert.equal(exitOf(r), 2, r.stdout);
    assert.deepEqual(res.hand_maintained, ['ROADMAP.md']);
    assert.equal(res.attention.length, 1, JSON.stringify(res.attention));
    assert.match(res.attention[0], /ROADMAP\.md.*hand-maintained/);
    assert.deepEqual(res.errors, []);
    for (const rel of COMPARE_SET) assert.ok(res.written.includes(rel), `${rel} was written`);

    assertSameBytes(original, snapshot(COMPARE_SET));
    assert.ok(fs.readFileSync(planning('ROADMAP.md')).equals(roadmapBefore), 'ROADMAP.md is the hand-written file, untouched');
    assert.ok(fs.readFileSync(planning('config.json')).equals(config), 'config.json is kept');
    const state = fs.readFileSync(planning('STATE.md'), 'utf8');
    assert.ok(state.startsWith(`${ghCache.GENERATED_HEADER}\n`), 'STATE.md is generated, by header');
    assert.equal(S.fake.writes().length, writesBefore, 'a pull never writes to GitHub');
  });

  test('4. a second pull writes nothing; a re-sync writes nothing to GitHub', (t) => {
    if (needsGit(t)) return;
    wipe(COMPARE_SET);
    const first = pullAll(S.root);
    assert.equal(json(first).ok, true, first.stdout);

    const after1 = snapshot(COMPARE_SET);
    const second = pullAll(S.root);
    assert.deepEqual(json(second).written, [], second.stdout);
    assert.deepEqual(json(second).errors, []);
    assertSameBytes(after1, snapshot(COMPARE_SET));

    const writesBefore = S.fake.writes().length;
    const again = syncCmd(S.root);
    assert.equal(exitOf(again), 0, again.stdout + again.stderr);
    const writes = S.fake.writes().slice(writesBefore).map((a) => a.join(' '));
    assert.deepEqual(writes, [], `an unchanged re-sync writes nothing to GitHub:\n${writes.join('\n')}`);
  });
});

// ─── SC2: the budget gate (test 5) ───────────────────────────────────────────

describe('SC2 budget: an oversized TRD refuses the sync before any gh call', () => {
  useStore({ wiki: 'remote' });

  const bigTrd = (n) => oversizedTrdText(n, { id: '7-04', file: '07-04-big-TRD.md' });
  const addBig = (n) => fs.writeFileSync(planning(OBJ_REL, '07-04-big-TRD.md'), bigTrd(n));

  test('5a. 60,001 characters: exit 1, refused:"budget" naming 7-04, ZERO gh calls, no issue, no journal', (t) => {
    if (needsGit(t)) return;
    addBig(60001);
    const r = syncCmd(S.root);
    assert.equal(exitOf(r), 1, r.stdout + r.stderr);
    const res = JSON.parse(r.stderr);
    assert.equal(res.ok, false);
    assert.equal(res.refused, 'budget');
    assert.ok(JSON.stringify(res).includes('7-04'), `the refusal names 7-04: ${r.stderr}`);
    assert.deepEqual(S.fake.calls(), [], 'not even `gh auth status` was called');
    assert.equal(S.fake.issues.length, 0, 'no issue of any kind exists');
    assert.equal(fs.existsSync(S.envh.env.DEVFLOW_OUTBOX_DIR), false, 'no journal');
    assert.equal(fs.existsSync(planning('wiki')), false, 'no wiki clone');
  });

  test('5b. exactly 60,000 characters: the sync succeeds with a budget warning', (t) => {
    if (needsGit(t)) return;
    addBig(60000);
    const r = syncCmd(S.root);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const res = json(r);
    assert.equal(res.ok, true);
    assert.equal(res.hierarchy.outbox, 'flushed');
    const warned = (res.warnings || []).filter((w) => /TRD 07-04 is 60,000 characters \(target 40,000, limit 60,000\)/.test(w));
    assert.equal(warned.length, 1, `exactly one budget warning names 07-04: ${JSON.stringify(res.warnings)}`);
    const body = issueByNumber(trdNumber('7-04')).body;
    assert.equal(body.length, 60000, 'the stored body is the encoded TRD, exactly at the limit');
  });
});

// ─── SC3: scope comments and fold (test 6) ───────────────────────────────────

const SCOPE_TEXT = {
  a: 'Scope A: the key parser also trims surrounding whitespace before it splits.',
  b: 'Scope B: the key parser rejects an empty string with a TypeError.',
  c: 'Scope C: the key parser accepts decimal objective numbers such as 07.1-01.',
  d: 'Scope D: the wave-ordered listing returns a frozen array.',
};

/** Write `text` to a file in the hermetic temp root and return its `@file:` argument. */
function scopeFile(name) {
  const file = path.join(S.envh.root, `scope-${name}.md`);
  fs.writeFileSync(file, SCOPE_TEXT[name]);
  return `@file:${file}`;
}

const closeTrdOnGithub = (n) => assert.equal(S.fake.runGh(['issue', 'close', String(n), '--repo', 'o/r']).status, 0);
const specRevRows = (n) => {
  const marker = bodyLib.commentMarker('7-01', 'spec-rev');
  const found = S.fake.comments.filter((c) => c.issue_number === n && c.body.includes(marker));
  assert.equal(found.length, 1, 'exactly one spec-rev comment per TRD');
  return ghTrd.parseSpecRev(found[0].body).entries;
};

describe('SC3 scope comments: effective spec order and fold', () => {
  useStore({ push: true });

  test('6. scope n=2, n=1, n=3 give an effective spec ordered 1, 2, 3; fold on the closed TRD replaces the body', (t) => {
    if (needsGit(t)) return;
    const number = trdNumber('7-01');
    for (const [n, name] of [[2, 'a'], [1, 'b'], [3, 'c']]) {
      const r = trdCmd(S.root, ['scope', '07-01', scopeFile(name), '--n', String(n)]);
      assert.equal(exitOf(r), 0, r.stdout + r.stderr);
      assert.equal(json(r).flush.status, 'flushed', r.stdout);
    }

    const spec = json(trdCmd(S.root, ['spec', '07-01']));
    assert.equal(spec.ok, true);
    assert.deepEqual(spec.applied, [1, 2, 3], 'applied in n order, whatever order they were posted in');
    const pos = (s) => spec.text.indexOf(s);
    assert.ok(pos(SCOPE_TEXT.b) > 0 && pos(SCOPE_TEXT.b) < pos(SCOPE_TEXT.a) && pos(SCOPE_TEXT.a) < pos(SCOPE_TEXT.c), 'text order is b, a, c');
    const expected = STORE_FIXTURE.trds['07-01-alpha-TRD.md']
      + `\n\n${ghTrd.buildScopeComment(1, SCOPE_TEXT.b)}`
      + `\n\n${ghTrd.buildScopeComment(2, SCOPE_TEXT.a)}`
      + `\n\n${ghTrd.buildScopeComment(3, SCOPE_TEXT.c)}`;
    assert.equal(spec.text, expected, 'the effective spec is the body followed by the scope comments in n order');

    // Fold needs a closed TRD: a human closes it on github.com.
    const refused = trdCmd(S.root, ['fold', '07-01']);
    assert.equal(exitOf(refused), 1, 'an open TRD is not folded without --force');
    closeTrdOnGithub(number);
    const oldBody = issueByNumber(number).body;
    const folded = trdCmd(S.root, ['fold', '07-01']);
    assert.equal(exitOf(folded), 0, folded.stdout + folded.stderr);

    const newBody = issueByNumber(number).body;
    assert.notEqual(newBody, oldBody);
    const decoded = ghTrd.decodeTrdBody(newBody);
    assert.equal(decoded.ok, true, JSON.stringify(decoded));
    assert.equal(decoded.text, expected, 'the TRD body is now the effective spec');

    const rows = specRevRows(number);
    const events = rows.map((r) => r.event);
    for (const needle of ['scope n=2', 'scope n=1', 'scope n=3']) {
      assert.ok(events.some((e) => e.includes(needle)), `a spec-rev row for ${needle}: ${JSON.stringify(events)}`);
    }
    const foldRow = rows.find((r) => r.event.startsWith('fold folded_through=3'));
    assert.ok(foldRow, `a fold row: ${JSON.stringify(events)}`);
    assert.equal(foldRow.event, `fold folded_through=3 from=${ghTrd.contentHash(oldBody)}`, 'the before hash is the body that was replaced');
    assert.equal(foldRow.hash, ghTrd.contentHash(newBody), 'the after hash is the new body');
    assert.equal(foldRow.chars, newBody.length);

    const after = json(trdCmd(S.root, ['spec', '07-01']));
    assert.deepEqual(after.applied, [], 'nothing is left to apply after the fold');
    assert.equal(after.foldedThrough, 3);
    assert.equal(after.text, expected, 'the spec is unchanged by folding');
  });
});

// ─── SC4: offline queue, reconnect order, remote-edit halt (tests 7-9) ───────

/** Append a line to a local TRD file: the kind of edit `gh sync` turns into an `upsert-issue`. */
function editTrd(file, line) {
  const abs = planning(OBJ_REL, file);
  fs.writeFileSync(abs, `${fs.readFileSync(abs, 'utf8')}\n${line}\n`);
}

/**
 * The op kinds whose write lands on a known issue. An op's write is the REST call that names its issue:
 * `PATCH repos/o/r/issues/<n>` (body / state) or `POST repos/o/r/issues/<n>/comments`.
 */
function writeFor(op) {
  const id = op.target && op.target.id;
  if (!id || !['upsert-issue', 'patch-body', 'upsert-comment', 'post-scope'].includes(op.kind)) return null;
  const entry = id.includes('-') ? mappingLib.getTrd(mappingNow(), id) : mappingLib.getEntry(mappingNow(), id);
  const n = id.includes('-') ? entry.issue_number : entry.issue_id;
  return (argv) => argv.some((a) => a === `repos/o/r/issues/${n}` || a === `repos/o/r/issues/${n}/comments`);
}

describe('SC4 offline: writes are queued, then flushed in enqueue order', () => {
  useStore({ push: true });

  /** Local edits that `gh sync 7` turns into three writes: two TRD bodies and a new SUMMARY comment. */
  function makeOfflineEdits() {
    editTrd('07-02-beta-TRD.md', 'Offline edit to 07-02.');
    editTrd('07-03-gamma-TRD.md', 'Offline edit to 07-03.');
    fs.writeFileSync(planning(OBJ_REL, '07-02-beta-SUMMARY.md'), STORE_FIXTURE.summary.replace('trd: "01"', 'trd: "02"').replace('Alpha', 'Beta'));
  }

  test('7. offline: the trd verbs refuse (they read GitHub); gh sync queues the local edits; flush exits 3 and writes nothing; status lists the queue in seq order', (t) => {
    if (needsGit(t)) return;
    S.fake.setOffline(true);
    const writesBefore = S.fake.writes().length;

    // freeze / scope / fold compute their rows from what GitHub holds (body hash, effective spec): offline they
    // say so (exit 1) and queue nothing, rather than guess.
    const freeze = trdCmd(S.root, ['freeze', '07-02']);
    assert.equal(exitOf(freeze), 1, freeze.stdout + freeze.stderr);
    assert.match(json(freeze).error, /could not read issue/);
    assert.deepEqual(journalOps().filter((op) => op.status !== 'done'), [], 'a refused verb queued nothing');

    makeOfflineEdits();
    const synced = syncCmd(S.root);
    assert.equal(exitOf(synced), 0, synced.stdout + synced.stderr);
    const res = json(synced);
    assert.equal(res.ok, true);
    assert.equal(res.outbox, 'pending', JSON.stringify(res));
    assert.equal(res.roadmap_page, 'skipped');

    const flush = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(flush), 3, flush.stdout + flush.stderr);
    assert.equal(json(flush).status, 'pending');
    assert.equal(S.fake.writes().length, writesBefore, 'nothing was written while offline');

    const status = json(outboxCmd(S.root, ['status']));
    assert.equal(status.halted, null, 'offline is a wait, not a halt');
    assert.ok(status.pending >= 3, `pending ops: ${status.pending}`);
    const seqs = status.queue.map((op) => op.seq);
    assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'the queue is listed in seq order');
    const targets = status.queue.map((op) => `${op.kind}:${op.target && op.target.id}`);
    assert.ok(targets.includes('upsert-issue:7-02') && targets.includes('upsert-issue:7-03'), `both TRD edits are queued: ${targets}`);
    assert.ok(targets.some((x) => x.startsWith('upsert-comment:7-02')), `the new SUMMARY is queued: ${targets}`);
  });

  test('8. reconnect: flush exits 0 and the writes reach GitHub in journal (enqueue) order', (t) => {
    if (needsGit(t)) return;
    S.fake.setOffline(true);
    makeOfflineEdits();
    assert.equal(json(syncCmd(S.root)).outbox, 'pending');
    const queued = journalOps().filter((op) => op.status !== 'done');
    assert.ok(queued.length >= 3, JSON.stringify(queued.map((o) => [o.seq, o.kind, o.status])));

    S.fake.setOffline(false);
    const before = S.fake.writes().length;
    const flush = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(flush), 0, flush.stdout + flush.stderr);
    const writes = S.fake.writes().slice(before);

    const bySeq = journalOps().filter((op) => queued.some((q) => q.seq === op.seq)).sort((x, y) => x.seq - y.seq);
    for (const op of bySeq) assert.equal(op.status, 'done', `op ${op.seq} (${op.kind}) is done`);

    // Each op that writes to a known issue, taken in seq order, must find its write AFTER the previous one's.
    // An op whose issue was never written (an unchanged TRD: the flusher skips the no-op) matches nothing at all
    // and is passed over; an op whose writes all happened BEFORE the previous op's write is out of order.
    let from = 0;
    const matched = [];
    for (const op of bySeq) {
      const pred = writeFor(op);
      if (!pred) continue;
      if (!writes.some((argv) => pred(argv))) continue;
      const hit = writes.findIndex((argv, i) => i >= from && pred(argv));
      assert.ok(hit >= 0, `op ${op.seq} ${op.kind} ${op.target.id} was written after the previous op's write:\n${writes.map((w) => w.join(' ')).join('\n')}`);
      from = hit + 1;
      matched.push(`${op.kind}:${op.target.id}`);
    }
    for (const key of ['upsert-issue:7-02', 'upsert-issue:7-03', 'upsert-comment:7-02']) {
      assert.ok(matched.includes(key), `${key} was matched to a write, in order: ${matched}`);
    }

    const n02 = trdNumber('7-02');
    const n03 = trdNumber('7-03');
    assert.ok(ghTrd.decodeTrdBody(issueByNumber(n02).body).text.includes('Offline edit to 07-02.'));
    assert.ok(ghTrd.decodeTrdBody(issueByNumber(n03).body).text.includes('Offline edit to 07-03.'));
    assert.ok(S.fake.comments.some((c) => c.issue_number === n02 && /Beta Summary/.test(c.body)), 'the SUMMARY comment is on 7-02');
    const status = json(outboxCmd(S.root, ['status']));
    assert.equal(status.pending, 0);
    assert.equal(status.halted, null);
  });
});

describe('SC4 remote edit: a human edit since the last pull halts the flush', () => {
  useStore({ push: true });

  test('9. gh sync halts on the edited TRD (exit 2 on flush), names the issue and both resolve commands, writes nothing after the halt', (t) => {
    if (needsGit(t)) return;
    const pulled = pullAll(S.root);
    assert.equal(json(pulled).ok, true, pulled.stdout);

    const n01 = trdNumber('7-01');
    const n02 = trdNumber('7-02');
    const n03 = trdNumber('7-03');
    const humanBody = `${issueByNumber(n02).body}\nA reviewer added this line on github.com.\n`;
    S.fake.humanEditBody(n02, humanBody);
    const untouched03 = issueByNumber(n03).body;

    // Three local edits: 7-01 lands before the halt, 7-02 halts, 7-03 must wait behind it.
    editTrd('07-01-alpha-TRD.md', 'A local change to 07-01 made after the pull.');
    editTrd('07-02-beta-TRD.md', 'A local change to 07-02 made after the pull.');
    editTrd('07-03-gamma-TRD.md', 'A local change to 07-03 made after the pull.');

    const synced = syncCmd(S.root);
    assert.equal(exitOf(synced), 0, synced.stdout + synced.stderr);
    const res = json(synced);
    assert.equal(res.outbox, 'halted', JSON.stringify(res));
    assert.equal(res.hierarchy.outbox, 'halted');
    assert.ok(ghTrd.decodeTrdBody(issueByNumber(n01).body).text.includes('A local change to 07-01'), 'the op before the halt was written');
    assert.equal(issueByNumber(n02).body, humanBody, 'the human body was not overwritten');
    assert.equal(issueByNumber(n03).body, untouched03, 'the op queued after the halt was not written');

    const prose = outboxCmd(S.root, ['status'], false);
    assert.equal(exitOf(prose), 0, 'status reports, it does not fail');
    assert.match(prose.stdout, new RegExp(`#${n02}\\b`), `the halt names the issue:\n${prose.stdout}`);
    assert.match(prose.stdout, /--accept-remote/);
    assert.match(prose.stdout, /--overwrite/);
    const status = json(outboxCmd(S.root, ['status']));
    assert.ok(status.halted, JSON.stringify(status));
    assert.equal(status.halted.issue_number, n02);
    const haltSeq = status.halted.seq;
    for (const op of journalOps().filter((o) => o.seq >= haltSeq)) assert.notEqual(op.status, 'done', `op ${op.seq} (${op.kind}) is not done`);

    const writesAtHalt = S.fake.writes().length;
    const flush = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(flush), 2, flush.stdout + flush.stderr);
    assert.equal(json(flush).status, 'halted');
    assert.equal(S.fake.writes().length, writesAtHalt, 'nothing is written after the halt');

    const resolved = outboxCmd(S.root, ['resolve', String(haltSeq), '--accept-remote']);
    assert.equal(exitOf(resolved), 0, resolved.stdout + resolved.stderr);
    assert.equal(json(resolved).choice, 'accept-remote');
    assert.equal(issueByNumber(n02).body, humanBody, 'accepting the remote keeps the human body');
    const after = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(after), 0, after.stdout + after.stderr);
    assert.equal(issueByNumber(n02).body, humanBody, 'and it stays that way after the queue drains');
    assert.ok(ghTrd.decodeTrdBody(issueByNumber(n03).body).text.includes('A local change to 07-03'), 'the ops behind the halt run once it is resolved');
  });
});

// ─── SC5: a degraded repository (tests 10-11) ────────────────────────────────

const DEGRADED = { wiki: 'none', project: { ownerType: 'User', hasWiki: false } };
const docsPage = (name) => path.join(S.root, 'docs', 'devflow', `${name}.md`);

describe('SC5 degraded: user-owned repository without a wiki', () => {
  useStore({ ...DEGRADED, push: true });

  test('10. labels + body meta instead of types/fields, docs/devflow pages instead of the wiki, native sub-issues and blocked-by', () => {
    const res = JSON.parse(S.pushed.stdout);
    assert.equal(res.ok, true, S.pushed.stdout);
    assert.equal(res.hierarchy.outbox, 'flushed', JSON.stringify(res.hierarchy));

    const obj = objectiveNumber();
    const objective = issueByNumber(obj);
    assert.equal(objective.type, null, 'no issue type on a user-owned repository');
    assert.ok(objective.labels.includes('devflow:objective'));
    assert.deepEqual(bodyLib.parseMeta(bodyLib.extractSection(objective.body, 'meta')), { type: 'Objective', work: 'feature', kind: 'plugin' });
    assert.equal(S.fake.writes().some((argv) => argv.some((a) => /issue-field-values|issue-types|issue-fields/.test(a))), false, 'no issue-field or issue-type write was attempted');

    const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
    for (const n of numbers) {
      assert.equal(issueByNumber(n).type, null, `#${n} has no type`);
      assert.ok(issueByNumber(n).labels.includes('devflow:trd'), `#${n} is labelled devflow:trd: ${issueByNumber(n).labels}`);
    }
    assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers, 'sub-issues are still native');
    assert.deepEqual(getJson(`repos/o/r/issues/${numbers[2]}/dependencies/blocked_by`).map((i) => i.id), [1_000_000 + numbers[0]]);

    for (const page of ['Objective-7-store-demo', 'Project', 'Requirements', 'Roadmap']) {
      assert.ok(fs.existsSync(docsPage(page)), `docs/devflow/${page}.md exists`);
    }
    assert.equal(fs.readFileSync(docsPage('Objective-7-store-demo'), 'utf8'), fs.readFileSync(planning(OBJ_REL, 'OBJECTIVE.md'), 'utf8'));
    assert.equal(fs.readFileSync(docsPage('Project'), 'utf8'), STORE_FIXTURE.project);
    assert.equal(fs.existsSync(planning('wiki')), false, 'no wiki clone');
  });

  test('11. gh pull --all rebuilds the compare set byte-identically from labels, meta and docs pages; the report names the degradations', () => {
    const original = snapshot(COMPARE_SET);
    wipe(COMPARE_SET);
    const r = pullAll(S.root);
    const res = json(r);
    assert.equal(res.ok, true, r.stdout + r.stderr);
    assert.equal(res.pages.mode, 'docs');
    assert.deepEqual(res.errors, []);
    assertSameBytes(original, snapshot(COMPARE_SET));
    assert.ok(fs.existsSync(docsPage('Project')), 'the docs pages are untouched');

    const status = json(outboxCmd(S.root, ['status']));
    const report = status.degraded.join('\n');
    assert.equal(status.degraded.length >= 3, true, report);
    assert.match(report, /types?/i, `issue types are reported as degraded:\n${report}`);
    assert.match(report, /fields?/i, `issue fields are reported as degraded:\n${report}`);
    assert.match(report, /wiki/i, `the wiki is reported as degraded:\n${report}`);
  });
});

// ─── 12: a wiki that has no first page ───────────────────────────────────────

describe('an uninitialised wiki (hasWiki true, no remote yet)', () => {
  useStore({ wiki: 'missing' });

  test('12. issues are created, the flush halts at the wiki push with the web-UI message, nothing falls back to docs/devflow', (t) => {
    if (needsGit(t)) return;
    const r = syncCmd(S.root);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const res = json(r);
    assert.equal(res.ok, true);
    assert.equal(res.outbox, 'halted', JSON.stringify(res));
    assert.ok((res.warnings || []).some((w) => /outbox/.test(w)), `a halted warning is reported: ${JSON.stringify(res.warnings)}`);

    const obj = objectiveNumber();
    const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
    assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers, 'the issues and links were created');

    const status = json(outboxCmd(S.root, ['status']));
    assert.ok(status.halted, JSON.stringify(status));
    assert.equal(status.halted.reason, 'blocked', 'a missing first wiki page blocks the push; it is not a conflict');
    assert.match(JSON.stringify(status.halted), /create the first wiki page in the GitHub web UI/);
    const haltedOp = journalOps().find((op) => op.seq === status.halted.seq);
    assert.equal(haltedOp.kind, 'wiki-push');

    const flush = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(flush), 2, flush.stdout + flush.stderr);
    assert.equal(fs.existsSync(path.join(S.root, 'docs', 'devflow')), false, 'no docs/devflow fallback while the wiki merely lacks a first page');
    assert.equal(fs.existsSync(planning('wiki')), false, 'no wiki clone either');
  });

  test('12b. once the wiki has its first page, `gh outbox flush` publishes the halted wiki push with no `resolve` (55-02)', (t) => {
    if (needsGit(t)) return;
    const r = syncCmd(S.root);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(json(r).outbox, 'halted');
    const before = json(outboxCmd(S.root, ['status']));
    assert.ok(before.halted, JSON.stringify(before));
    assert.equal(before.halted.reason, 'blocked');
    const seq = before.halted.seq;
    assert.equal(journalOps().find((op) => op.seq === seq).kind, 'wiki-push');

    // A human creates the first wiki page in the web UI: the remote now exists and holds one commit.
    const remote = createWikiRemote({ seed: { 'Home.md': '# Home\n' } });
    t.after(() => remote.cleanup());
    process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;

    const flush = outboxCmd(S.root, ['flush']);
    assert.equal(exitOf(flush), 0, flush.stdout + flush.stderr);
    assert.equal(journalOps().find((op) => op.seq === seq).status, 'done', 'the wiki push went through on a plain flush');
    assert.equal(json(outboxCmd(S.root, ['status'])).halted, null, 'no halt is left');
    assert.notEqual(remote.readRemotePage('Project'), null, 'the cache pages reached the wiki');
    assert.equal(fs.existsSync(path.join(S.root, 'docs', 'devflow')), false, 'still no docs/devflow fallback');
  });
});
