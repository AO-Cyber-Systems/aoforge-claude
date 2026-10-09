'use strict';

// planning-entity-verbs.test.cjs (TRD 48-12) — the verbs for everything that is not an objective document: todos,
// debug sessions, quick tasks, decisions and milestones.
//
// LOCAL mode first (github.store off, the D-01 invariant): each verb writes exactly the file today's code path writes
// (cmdTodoComplete through `aof-tools todo complete`, decision-queue addDecision/resolveDecision, the debugger and quick
// layouts, the MILESTONES.md entry), with zero gh calls, no outbox journal and no ledger. Then STORE mode against one
// stateful fake GitHub and one local wiki remote, with a `gh pull --all` round trip into a wiped cache.
//
// Test list (TRD 48-12):
//   local   1 todo add / complete parity   2 decision open / answer parity   3 debug + quick layouts
//           4 MILESTONES.md insert then replace
//   store   5 todo add -> aoforge:todo issue, pull rebuilds it, check-todos lists it   6 todo complete -> closed
//           7 debug put: native Debug type, labels-only fallback; debug resolve closes it
//           8 quick put + quick summary -> summary comment + closed, pull rebuilds both
//           9 decision open blocks its TRD, decision answer -> answer comment + closed, pull writes ## Answer
//           10 milestone put -> native milestone + wiki page; complete closes it; offline -> exit 1, zero writes
//
// Hermetic: hermeticEnv() temp HOME / outbox / cache dirs, the fake installed through the gh-client seam, a fake
// clock, the wiki is a local bare repo over file://, OS notifications disabled. No real GitHub, never ~/.claude.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ev = require('./planning-entity-verbs.cjs');
const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const ledger = require('./planning-ledger.cjs');
const mappingLib = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghCache = require('./gh-cache.cjs');
const decisionQueue = require('./decision-queue.cjs');
const checkTodos = require('./check-todos.cjs');
const milestoneStore = require('./gh-milestone-store.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { MILESTONES_LEGACY_UNPREFIXED, MILESTONES_PATCH_ONLY } = require('./__fixtures__/milestone-complete-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DEFAULT_TYPES = [
  { id: 1, name: 'Objective', is_enabled: true },
  { id: 2, name: 'TRD', is_enabled: true },
  { id: 3, name: 'Decision', is_enabled: true },
];
const WITH_ENTITY_TYPES = [...DEFAULT_TYPES, { id: 4, name: 'Debug', is_enabled: true }, { id: 5, name: 'Quick', is_enabled: true }];

// Hand-written texts shaped like this repo's real files (shape only).
const TODO_TEXT = [
  '---',
  'created: 2026-10-01T12:00:00.000Z',
  'title: Fix thing',
  'area: tooling',
  'files: []',
  '---',
  '',
  '## Problem',
  '',
  'The thing is broken.',
  '',
  '## Solution',
  '',
  'Fix the thing.',
  '',
].join('\n');

const DEBUG_TEXT = [
  '---',
  'status: investigating',
  'trigger: "flush halts on a todo issue"',
  'created: 2026-10-01T12:00:00Z',
  '---',
  '',
  '# Debug: flush halts on a todo issue',
  '',
  '## Current Focus',
  '',
  'hypothesis: the label scan misses entity markers',
  '',
].join('\n');

const QUICK_JOB = [
  '---',
  'quick: 12',
  'slug: fix-x',
  '---',
  '',
  '# Quick 12: fix x',
  '',
  '<task type="auto">',
  '  <name>Fix x</name>',
  '</task>',
  '',
].join('\n');

const QUICK_SUMMARY = ['# Quick 12 Summary', '', 'Fixed x in one commit.', ''].join('\n');

const MILESTONE_ENTRY = [
  '## v1.4 Planning Write Path (Shipped: 2026-10-01)',
  '',
  '**Delivered:** Every planning write goes through a verb, and GitHub is the store when `github.store` is on.',
  '',
  '**Key accomplishments:**',
  '- Entity verbs for todos, debug sessions, quick tasks, decisions and milestones',
  '',
].join('\n');

// ─── Harness ─────────────────────────────────────────────────────────────────

let S;

function useProject({ store = false, sync = false, types = DEFAULT_TYPES } = {}) {
  beforeEach((t) => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store });
    const fake = createFakeGitHub({ ...project.fakeOptions, types });
    const clock = { t: T0 };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();

    const savedRemote = process.env.AOFORGE_WIKI_REMOTE;
    const savedNotifier = process.env.NOTIFIER_DISABLE;
    process.env.NOTIFIER_DISABLE = '1';
    let restoreGit = () => {};
    let remote = null;
    if (gitAvailable()) {
      restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
      remote = createWikiRemote();
      process.env.AOFORGE_WIKI_REMOTE = remote.remoteUrl;
    }
    S = { envh, project, root: project.root, fake, clock, remote, restoreGit, savedRemote, savedNotifier, extra: [] };
    if (store && !gitAvailable()) {
      t.skip('git is not available: store-mode verbs push wiki pages');
      return;
    }
    if (sync) {
      const r = gh.syncObjective('7', S.root);
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.AOFORGE_WIKI_REMOTE;
    else process.env.AOFORGE_WIKI_REMOTE = S.savedRemote;
    if (S.savedNotifier === undefined) delete process.env.NOTIFIER_DISABLE;
    else process.env.NOTIFIER_DISABLE = S.savedNotifier;
    for (const p of S.extra) fs.rmSync(p, { recursive: true, force: true });
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (...rel) => path.join(S.root, '.aoforge', ...rel.join('/').split('/'));
const readRel = (rel) => fs.readFileSync(planning(rel), 'utf8');
const exists = (rel) => fs.existsSync(planning(rel));
const journalExists = () => fs.existsSync(outbox.journalPath(S.root));
const ledgerExists = () => fs.existsSync(ledger.ledgerPath(S.root));
const ledgerEntries = () => ledger.readLedger(S.root).entries;
const cacheIndex = () => outbox.readCacheIndex(S.root);
const entity = (id) => mappingLib.getEntity(mappingLib.readMappingV3(S.root), id);
const issueOf = (id) => S.fake.issues.find((i) => i.number === entity(id).issue_number);
const commentsOn = (number) => S.fake.comments.filter((c) => c.issue_number === number || c.issueNumber === number);

/** A second bare project (a `.aoforge/` dir only), cleaned up with the test. */
function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entity-verbs-ref-'));
  fs.mkdirSync(path.join(dir, '.aoforge'), { recursive: true });
  S.extra.push(dir);
  return dir;
}

function assertLocalInvariant() {
  assert.equal(S.fake.calls().length, 0, `zero gh calls, got ${JSON.stringify(S.fake.calls())}`);
  assert.equal(journalExists(), false, 'no outbox journal');
  assert.equal(ledgerExists(), false, 'no ledger');
}

function assertStoreClean(r, rel) {
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.exit, 0, JSON.stringify(r));
  assert.equal(r.mode, 'store');
  assert.ok(Object.hasOwn(cacheIndex(), rel), `${rel} baselined after the drained flush`);
  assert.equal(cacheIndex()[rel], ghTrd.contentHash(readRel(rel)));
  assert.equal(Object.hasOwn(ledgerEntries(), rel), false, `${rel} forgotten in the ledger`);
}

/** Wipe `rels` from the cache and run `gh pull --all`; the files must come back byte for byte. */
function assertPullRebuilds(rels) {
  const want = Object.fromEntries(rels.map((rel) => [rel, readRel(rel)]));
  for (const rel of rels) fs.rmSync(planning(rel));
  const pulled = ghCache.pullAll(S.root);
  assert.equal(pulled.ok, true, JSON.stringify(pulled));
  for (const rel of rels) assert.equal(readRel(rel), want[rel], `pull rebuilds ${rel} byte-identically`);
}

// ─── local parity (tests 1-4) ────────────────────────────────────────────────

describe('48-12 local mode writes today\'s files (github.store off)', () => {
  useProject({ store: false });

  test('1: todo add names the file <date>-<slug>; todo complete is byte-identical to `aof-tools todo complete`', () => {
    const r = ev.todoAdd(S.root, { text: TODO_TEXT, now: T0 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.mode, 'local');
    assert.equal(r.rel, 'todos/pending/2026-10-01-fix-thing.md');
    assert.equal(readRel('todos/pending/2026-10-01-fix-thing.md'), TODO_TEXT);

    const ref = tempProject();
    fs.mkdirSync(path.join(ref, '.aoforge', 'todos', 'pending'), { recursive: true });
    fs.writeFileSync(path.join(ref, '.aoforge', 'todos', 'pending', '2026-10-01-fix-thing.md'), TODO_TEXT);
    const cli = spawnSync(process.execPath, [DF_TOOLS, 'todo', 'complete', '2026-10-01-fix-thing.md'], { cwd: ref, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);

    const c = ev.todoComplete(S.root, { stem: '2026-10-01-fix-thing' });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(c.rel, 'todos/completed/2026-10-01-fix-thing.md');
    assert.equal(exists('todos/pending/2026-10-01-fix-thing.md'), false);
    assert.equal(
      readRel('todos/completed/2026-10-01-fix-thing.md'),
      fs.readFileSync(path.join(ref, '.aoforge', 'todos', 'completed', '2026-10-01-fix-thing.md'), 'utf8'),
    );
    assert.equal(ev.todoComplete(S.root, { stem: 'nope' }).ok, false, 'a missing todo is an error');
    assertLocalInvariant();
  });

  test('2: decision open / answer write the same files as decision-queue addDecision / resolveDecision', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: T0 });
    const opts = {
      objective: '7',
      trd: '7-01',
      wave: 1,
      title: 'A or B?',
      context: 'Pick the store key format.',
      options: [{ name: 'A', label: 'A', pros: '', cons: '' }, { name: 'B', label: 'B', pros: '', cons: '' }],
      recommendation: 'B',
      created: '2026-10-01T12:00:00.000Z',
    };
    const ref = tempProject();
    decisionQueue.addDecision(ref, opts);

    const r = ev.decisionOpen(S.root, opts);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.id, 'DECISION-001');
    assert.equal(r.rel, 'decisions/pending/DECISION-001.md');
    const refFile = (d) => fs.readFileSync(path.join(ref, '.aoforge', 'decisions', d, 'DECISION-001.md'), 'utf8');
    assert.equal(readRel('decisions/pending/DECISION-001.md'), refFile('pending'));

    decisionQueue.resolveDecision(ref, 'DECISION-001', 'B');
    const a = ev.decisionAnswer(S.root, { id: 'DECISION-001', text: 'B' });
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.rel, 'decisions/resolved/DECISION-001.md');
    assert.equal(readRel('decisions/resolved/DECISION-001.md'), refFile('resolved'));
    assert.equal(exists('decisions/pending/DECISION-001.md'), false);

    const noTrd = ev.decisionOpen(S.root, { question: 'Keep the old name?' });
    assert.equal(noTrd.ok, true, 'local mode needs no TRD id');
    assert.equal(noTrd.id, 'DECISION-002');
    assert.equal(ev.decisionAnswer(S.root, { id: 'DECISION-404', text: 'x' }).ok, false);
    assertLocalInvariant();
  });

  // TRD 52-05: a multi-line answer used to keep only its first line (and lose resolved_at at a `---` line).
  test('52-05 #1: CLI `decision answer --from` keeps a multi-line answer whole; a one-line file answer stays one line', () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.aoforge', 'config.json'), '{}\n');
    const run = (...args) => spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NOTIFIER_DISABLE: '1' },
    });
    const ans = path.join(dir, 'ans.md');
    fs.writeFileSync(ans, 'Option B.\nReason: second line with colon\n---\n  indented line\n\nlast\n');

    let r = run('decision', 'open', '52-01', '--question', 'Pick?');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = run('decision', 'answer', 'DECISION-001', '--from', ans);
    assert.equal(r.status, 0, r.stderr + r.stdout);

    const file = path.join(dir, '.aoforge', 'decisions', 'resolved', 'DECISION-001.md');
    const fm = extractFrontmatter(fs.readFileSync(file, 'utf8'));
    assert.equal(fm.resolution, 'Option B.\nReason: second line with colon\n---\n  indented line\n\nlast');
    assert.equal(fm.status, 'resolved');
    assert.match(String(fm.resolved_at), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(Object.hasOwn(fm, 'Reason'), false, 'no spurious key from an answer line');

    // A one-line answer read from a file ends in a newline; it is written as `resolution: <answer>`, not a block.
    fs.writeFileSync(ans, 'Option A\n');
    r = run('decision', 'open', '52-01', '--question', 'Again?');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = run('decision', 'answer', 'DECISION-002', '--from', ans);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const one = fs.readFileSync(path.join(dir, '.aoforge', 'decisions', 'resolved', 'DECISION-002.md'), 'utf8');
    assert.match(one, /\nresolution: Option A\n/);
  });

  test('52-05 #2: decision answer normalises CRLF and trailing whitespace before resolving', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: T0 });
    const opts = { objective: '7', trd: '7-01', wave: 1, title: 'A or B?', context: 'c', recommendation: 'B', created: '2026-10-01T12:00:00.000Z' };
    assert.equal(ev.decisionOpen(S.root, opts).ok, true);
    const a = ev.decisionAnswer(S.root, { id: 'DECISION-001', text: 'a\r\nb\r\n' });
    assert.equal(a.ok, true, JSON.stringify(a));
    const raw1 = readRel('decisions/resolved/DECISION-001.md');
    assert.equal(raw1.includes('\r'), false, 'no CR on disk');
    assert.equal(extractFrontmatter(raw1).resolution, 'a\nb');

    assert.equal(ev.decisionOpen(S.root, opts).ok, true);
    assert.equal(ev.decisionAnswer(S.root, { id: 'DECISION-002', text: 'a\nb  \r\n\r\n' }).ok, true);
    assert.equal(extractFrontmatter(readRel('decisions/resolved/DECISION-002.md')).resolution, 'a\nb', 'trailing whitespace trimmed');

    // `B\r\n` is the declared option B: written as a plain `resolution: B`, with no "not in declared options" warning.
    fs.writeFileSync(planning('decisions/pending/DECISION-003.md'), '---\nid: DECISION-003\nstatus: pending\noptions: [A, B]\n---\n\n## Decision: A or B?\n');
    const writes = [];
    t.mock.method(process.stderr, 'write', (chunk) => { writes.push(String(chunk)); return true; });
    assert.equal(ev.decisionAnswer(S.root, { id: 'DECISION-003', text: 'B\r\n' }).ok, true);
    t.mock.restoreAll();
    assert.match(readRel('decisions/resolved/DECISION-003.md'), /\nresolution: B\n/);
    assert.deepEqual(writes.filter((w) => w.includes('not in declared options')), []);
    assertLocalInvariant();
  });

  test('3: debug put / resolve and quick put / summary use the debugger and quick layouts', () => {
    const d = ev.debugPut(S.root, { slug: 'x', text: DEBUG_TEXT });
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.equal(readRel('debug/x.md'), DEBUG_TEXT);
    const dr = ev.debugResolve(S.root, { slug: 'x' });
    assert.equal(dr.ok, true, JSON.stringify(dr));
    assert.equal(exists('debug/x.md'), false);
    assert.equal(readRel('debug/resolved/x.md'), DEBUG_TEXT);

    const q = ev.quickPut(S.root, { n: 12, slug: 'fix-x', text: QUICK_JOB });
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.equal(readRel('quick/12-fix-x/12-JOB.md'), QUICK_JOB);
    const qs = ev.quickSummary(S.root, { n: 12, text: QUICK_SUMMARY });
    assert.equal(qs.ok, true, JSON.stringify(qs));
    assert.equal(readRel('quick/12-fix-x/12-SUMMARY.md'), QUICK_SUMMARY);
    assert.equal(ev.quickSummary(S.root, { n: 99, text: 'x' }).ok, false, 'no quick dir for 99');
    assertLocalInvariant();
  });

  test('4: milestone put inserts the entry after `# Milestones`, a second put replaces it', () => {
    fs.writeFileSync(planning('MILESTONES.md'), '# Milestones\n\n## v1.3 Old (Shipped: 2026-09-28)\n\nold body\n');
    const r = ev.milestonePut(S.root, { version: 'v1.4', text: MILESTONE_ENTRY });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(readRel('MILESTONES.md'), `# Milestones\n\n${MILESTONE_ENTRY}\n## v1.3 Old (Shipped: 2026-09-28)\n\nold body\n`);

    const revised = '## v1.4 Planning Write Path (Shipped: 2026-10-02)\n\nRevised.\n';
    assert.equal(ev.milestonePut(S.root, { version: 'v1.4', text: revised }).ok, true);
    assert.equal(readRel('MILESTONES.md'), `# Milestones\n\n${revised}\n## v1.3 Old (Shipped: 2026-09-28)\n\nold body\n`);

    fs.rmSync(planning('MILESTONES.md'));
    assert.equal(ev.milestonePut(S.root, { version: 'v1.4', text: revised }).ok, true);
    assert.equal(readRel('MILESTONES.md'), `# Milestones\n\n${revised}`);
    assert.equal(ev.milestoneComplete(S.root, { version: 'v1.4' }).delegate, 'milestone complete');
    assertLocalInvariant();
  });

  test('68-06 #6: milestone put v1.0 replaces a legacy `## 1.0` entry instead of adding a second', () => {
    fs.writeFileSync(planning('MILESTONES.md'), MILESTONES_LEGACY_UNPREFIXED);
    const text = '## v1.0 Revised (Shipped: 2026-10-08)\n\nRevised notes.\n';
    const r = ev.milestonePut(S.root, { version: 'v1.0', text });
    assert.equal(r.ok, true, JSON.stringify(r));
    const out = readRel('MILESTONES.md');
    assert.equal(out.match(/^## +v?1\.0(?:\s|$)/gm).length, 1, `exactly one entry for the version:\n${out}`);
    assert.ok(out.includes('## v1.0 Revised'), out);
    assert.ok(!out.includes('## 1.0 Old'), 'the legacy section was replaced');
    assert.ok(!out.includes('Old A shipped'), 'its body went with it');
    assertLocalInvariant();
  });

  test('68-06 #7: milestone put v1.0 inserts beside a v1.0.1 entry and leaves it byte-identical', () => {
    fs.writeFileSync(planning('MILESTONES.md'), MILESTONES_PATCH_ONLY);
    const text = '## v1.0 Initial (Shipped: 2025-01-01)\n\nInitial notes.\n';
    const r = ev.milestonePut(S.root, { version: 'v1.0', text });
    assert.equal(r.ok, true, JSON.stringify(r));
    const patch = MILESTONES_PATCH_ONLY.slice(MILESTONES_PATCH_ONLY.indexOf('## v1.0.1'));
    assert.equal(readRel('MILESTONES.md'), `# Milestones\n\n${text}\n${patch}`);
    assertLocalInvariant();
  });

  test('68-06 #8: entryWithHeading keeps a text whose first line already heads the version, either spelling', () => {
    assert.equal(ev.entryWithHeading('## 1.0 Old\n\nx', 'v1.0'), '## 1.0 Old\n\nx');
    assert.equal(ev.entryWithHeading('## v1.0 New\n\nx', 'v1.0'), '## v1.0 New\n\nx');
    assert.equal(ev.entryWithHeading('## v1.0.1 Patch\n\nx', 'v1.0'), '## v1.0\n\n## v1.0.1 Patch\n\nx');
    assert.equal(ev.entryWithHeading('Shipped it.', 'v1.0'), '## v1.0\n\nShipped it.');
  });

  test('entityIdFor delegates to planning-paths', () => {
    assert.equal(ev.entityIdFor('todos/pending/2026-10-01-fix-thing.md'), 'todo-2026-10-01-fix-thing');
    assert.equal(ev.entityIdFor('debug/resolved/x.md'), 'debug-x');
    assert.equal(ev.entityIdFor('quick/12-fix-x/12-SUMMARY.md'), 'quick-12');
    assert.equal(ev.entityIdFor('objectives/07-store-demo/OBJECTIVE.md'), null);
  });
});

// ─── store (tests 5-10) ──────────────────────────────────────────────────────

describe('48-12 store mode: todos', () => {
  useProject({ store: true });

  test('5: todo add -> aoforge:todo issue + mapping entity + baseline; pull rebuilds it; check-todos lists it', () => {
    const r = ev.todoAdd(S.root, { text: TODO_TEXT, now: T0 });
    const rel = 'todos/pending/2026-10-01-fix-thing.md';
    assertStoreClean(r, rel);
    const issue = issueOf('todo-2026-10-01-fix-thing');
    assert.ok(issue, 'mapped under entities');
    assert.ok(issue.labels.includes('aoforge:todo'));
    assert.equal(issue.title, 'Fix thing');
    assert.ok(!issue.type, 'a todo has no issue type');
    assert.equal(issue.body, ghTrd.encodeEntityBody({ id: 'todo-2026-10-01-fix-thing', file: rel, text: TODO_TEXT }));

    assertPullRebuilds([rel]);
    const listed = checkTodos._fetchLocalTodos(S.root);
    assert.ok(JSON.stringify(listed).includes('Fix thing'), 'check-todos lists the rebuilt todo (U-3)');
  });

  test('6: todo complete -> issue closed/completed, header path moved; pull puts it in completed/', () => {
    assert.equal(ev.todoAdd(S.root, { text: TODO_TEXT, stem: 'fix-thing' }).exit, 0);
    const r = ev.todoComplete(S.root, { stem: 'fix-thing', now: T0 });
    const rel = 'todos/completed/fix-thing.md';
    assertStoreClean(r, rel);
    assert.equal(exists('todos/pending/fix-thing.md'), false);
    assert.equal(readRel(rel), `completed: 2026-10-01\n${TODO_TEXT}`);
    assert.equal(Object.hasOwn(cacheIndex(), 'todos/pending/fix-thing.md'), false, 'old baseline dropped');
    const issue = issueOf('todo-fix-thing');
    assert.equal(issue.state, 'CLOSED');
    assert.equal(issue.stateReason, 'completed');
    assert.equal(ghTrd.decodeEntityBody(issue.body).file, rel);
    assertPullRebuilds([rel]);
  });
});

describe('48-12 store mode: debug with native Debug/Quick types', () => {
  useProject({ store: true, types: WITH_ENTITY_TYPES });

  test('7a: debug put -> Debug-typed issue; debug resolve closes it and moves the file', () => {
    assertStoreClean(ev.debugPut(S.root, { slug: 'x', text: DEBUG_TEXT }), 'debug/x.md');
    const issue = issueOf('debug-x');
    assert.equal(issue.type, 'Debug');
    assert.ok(issue.labels.includes('aoforge:debug'));
    assert.equal(issue.title, 'Debug: flush halts on a todo issue');

    assertStoreClean(ev.debugResolve(S.root, { slug: 'x' }), 'debug/resolved/x.md');
    assert.equal(exists('debug/x.md'), false);
    assert.equal(issueOf('debug-x').state, 'CLOSED');
    assertPullRebuilds(['debug/resolved/x.md']);
  });

  test('8: quick put + quick summary -> Quick issue with a summary comment, closed; pull rebuilds both', () => {
    assertStoreClean(ev.quickPut(S.root, { n: 12, slug: 'fix-x', text: QUICK_JOB }), 'quick/12-fix-x/12-JOB.md');
    const issue = issueOf('quick-12');
    assert.equal(issue.type, 'Quick');
    assert.equal(issue.title, 'Quick 12: fix x');

    assertStoreClean(ev.quickSummary(S.root, { n: 12, text: QUICK_SUMMARY }), 'quick/12-fix-x/12-SUMMARY.md');
    assert.equal(issueOf('quick-12').state, 'CLOSED');
    assert.ok(commentsOn(issue.number).some((c) => c.body.startsWith('<!-- aoforge:id=quick-12 kind=summary -->')));
    assertPullRebuilds(['quick/12-fix-x/12-JOB.md', 'quick/12-fix-x/12-SUMMARY.md']);
  });
});

describe('48-12 store mode: debug without the Debug type', () => {
  useProject({ store: true });

  test('7b: labels-only when the org lacks Debug', () => {
    assertStoreClean(ev.debugPut(S.root, { slug: 'y', text: DEBUG_TEXT }), 'debug/y.md');
    const issue = issueOf('debug-y');
    assert.ok(!issue.type, 'no native type');
    assert.ok(issue.labels.includes('aoforge:debug'));
    assert.ok(issue.labels.includes('aoforge:type/debug'));
  });
});

describe('48-12 store mode: decisions', () => {
  useProject({ store: true, sync: true });

  test('9: decision open blocks its TRD; decision answer posts the answer and closes; pull writes ## Answer', () => {
    const r = ev.decisionOpen(S.root, { trd: '7-01', question: 'A or B?' });
    assert.equal(r.id, '7-01-d1');
    assertStoreClean(r, 'decisions/7-01-d1.md');
    assert.equal(readRel('decisions/7-01-d1.md'), 'A or B?\n');
    const issue = S.fake.issues.find((i) => i.number === mappingLib.getTrd(mappingLib.readMappingV3(S.root), '7-01-d1').issue_number);
    assert.equal(issue.type, 'Decision');

    const a = ev.decisionAnswer(S.root, { id: '7-01-d1', text: 'B' });
    assertStoreClean(a, 'decisions/7-01-d1.md');
    assert.equal(readRel('decisions/7-01-d1.md'), 'A or B?\n\n## Answer\n\nB\n');
    const closed = S.fake.issues.find((i) => i.number === issue.number);
    assert.equal(closed.state, 'CLOSED');
    assert.equal(closed.stateReason, 'completed');
    assert.ok(commentsOn(issue.number).some((c) => c.body.startsWith('<!-- aoforge:id=7-01-d1 kind=answer -->')));
    assertPullRebuilds(['decisions/7-01-d1.md']);

    const noTrd = ev.decisionOpen(S.root, { question: 'x?' });
    assert.equal(noTrd.ok, false, 'store mode needs the TRD the decision blocks');
    assert.match(noTrd.error, /TRD/);
  });

  // TRD 52-05 regression guard: the store keeps the answer in the body after `## Answer`, never in frontmatter.
  test('52-05 #3: a multi-line answer round-trips whole through the answer comment and gh pull --all', () => {
    const r = ev.decisionOpen(S.root, { trd: '7-01', question: 'A or B?' });
    assertStoreClean(r, 'decisions/7-01-d1.md');
    const number = mappingLib.getTrd(mappingLib.readMappingV3(S.root), '7-01-d1').issue_number;

    const answer = 'Option B.\nReason: second line with colon\n---\n  indented line\n\nlast';
    const a = ev.decisionAnswer(S.root, { id: '7-01-d1', text: `${answer.replace(/\n/g, '\r\n')}\r\n` });
    assertStoreClean(a, 'decisions/7-01-d1.md');
    assert.equal(readRel('decisions/7-01-d1.md'), `A or B?\n\n## Answer\n\n${answer}\n`);
    const comment = commentsOn(number).find((c) => c.body.startsWith('<!-- aoforge:id=7-01-d1 kind=answer -->'));
    assert.ok(comment, 'the answer comment was posted');
    assert.ok(comment.body.endsWith(answer) || comment.body.endsWith(`${answer}\n`), `full answer in the comment: ${JSON.stringify(comment.body)}`);
    assertPullRebuilds(['decisions/7-01-d1.md']);
  });
});

describe('48-12 store mode: milestones', () => {
  useProject({ store: true });

  test('10: milestone put -> native milestone + wiki page; complete closes it; offline -> exit 1, zero writes', () => {
    const r = ev.milestonePut(S.root, { version: 'v1.4', text: MILESTONE_ENTRY });
    assertStoreClean(r, 'milestones/v1.4.md');
    const title = milestoneStore.milestoneTitleFor(S.root, 'v1.4');
    const m = S.fake.milestones.find((x) => x.title === title);
    assert.ok(m, 'native milestone created');
    assert.ok(m.description.length <= 1000);
    assert.ok(m.description.endsWith('Full notes: https://github.com/o/r/wiki/Milestone-v1_4'), m.description);
    assert.equal(S.remote.readRemotePage('Milestone-v1_4'), MILESTONE_ENTRY);

    fs.mkdirSync(planning('milestones'), { recursive: true });
    fs.writeFileSync(planning('milestones/v1.4-ROADMAP.md'), '# Roadmap archive v1.4\n');
    const c = ev.milestoneComplete(S.root, { version: 'v1.4' });
    assertStoreClean(c, 'milestones/v1.4-ROADMAP.md');
    assert.equal(S.fake.milestones.find((x) => x.title === title).state, 'closed');
    assert.equal(S.remote.readRemotePage('Milestone-v1_4-Roadmap'), '# Roadmap archive v1.4\n');

    const writes = S.fake.writes().length;
    const head = S.remote.headSha();
    S.fake.setOffline(true);
    const off = ev.milestonePut(S.root, { version: 'v1.5', text: '## v1.5 Next\n\nNext.\n' });
    assert.equal(off.ok, false);
    assert.equal(off.exit, 1);
    assert.equal(S.fake.writes().length, writes, 'zero writes offline');
    assert.equal(exists('milestones/v1.5.md'), false);
    assert.equal(S.remote.headSha(), head, 'no wiki commit');
  });

  test('68-06 #4: milestoneComplete({dryRun}) names the close and the archives, with no gh call and no write', () => {
    const put = ev.milestonePut(S.root, { version: 'v1.4', text: MILESTONE_ENTRY });
    assertStoreClean(put, 'milestones/v1.4.md');
    fs.mkdirSync(planning('milestones'), { recursive: true });
    fs.writeFileSync(planning('milestones/v1.4-ROADMAP.md'), '# Roadmap archive v1.4\n');
    fs.writeFileSync(planning('milestones/v1.4-REQUIREMENTS.md'), '# Requirements archive v1.4\n');
    fs.writeFileSync(planning('milestones/v1.5-ROADMAP.md'), '# Another version\n');

    const title = milestoneStore.milestoneTitleFor(S.root, 'v1.4');
    const calls = S.fake.calls().length;
    const writes = S.fake.writes().length;
    const journalOf = () => (journalExists() ? fs.readFileSync(outbox.journalPath(S.root), 'utf8') : null);
    const journal = journalOf();
    const ledgerBefore = JSON.stringify(ledgerEntries());
    const index = JSON.stringify(cacheIndex());
    const head = S.remote.headSha();

    const r = ev.milestoneComplete(S.root, { version: 'v1.4', dryRun: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.mode, 'store');
    assert.equal(r.dry_run, true);
    assert.equal(r.version, 'v1.4');
    assert.equal(r.milestone_title, title);
    assert.equal(r.would_close, true);
    assert.deepEqual(r.would_publish, ['milestones/v1.4-REQUIREMENTS.md', 'milestones/v1.4-ROADMAP.md']);
    assert.deepEqual(r.warnings, []);
    assert.equal(Object.hasOwn(r, 'rel'), false, 'no rel: the headline must not claim a write');

    assert.equal(S.fake.calls().length, calls, 'zero gh calls, reads included');
    assert.equal(S.fake.writes().length, writes);
    assert.equal(S.fake.milestones.find((x) => x.title === title).state, 'open', 'the native milestone is still open');
    assert.equal(journalOf(), journal, 'journal unchanged');
    assert.equal(JSON.stringify(ledgerEntries()), ledgerBefore, 'ledger unchanged');
    assert.equal(JSON.stringify(cacheIndex()), index, 'cache index unchanged');
    assert.equal(S.remote.headSha(), head, 'no wiki commit');
  });

  test('68-06 #5: a non-version still fails with the version error under dryRun', () => {
    const calls = S.fake.calls().length;
    const r = ev.milestoneComplete(S.root, { version: 'nope', dryRun: true });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 1);
    assert.match(r.error, /not a milestone version/);
    assert.equal(S.fake.calls().length, calls);
  });
});
