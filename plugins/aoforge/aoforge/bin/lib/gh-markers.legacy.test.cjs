'use strict';

// Test list (TRD 72-11, objective 72, INST-03): a store-mode repository that has not been rebranded keeps its
// GitHub markers and labels in the old `devflow` namespace. Every reader accepts them; every writer emits `aoforge`.
//
// 1. The legacy issue id line reads like the AOForge one: extractMarker, indexByMarker (a legacy and an AOForge
//    claim on one id are two claims, never a silent winner), and the TRD / entity body codecs (id + file lines).
// 2. A legacy comment marker `kind=state` gives the same { id, kind }, isStateComment and findCommentsByMarker find
//    it; gh-cache materialises a quick task whose body and summary comment are both in the legacy namespace.
// 3. A legacy multi-part comment (`part=1/2`, `part=2/2`, legacy file line) is reassembled exactly like the new form.
// 4. A legacy begin/end section: mergeManaged replaces it in place with AOForge markers, the body holds exactly one
//    section of that name and the text outside it is byte-identical.
//    4b. Merging the content a legacy section already holds is no change: no write only to rename a marker.
//    4c. When a merge does change the body, every written legacy section is rewritten in the AOForge form.
//    4d. extractSection reads a legacy section; section content carrying a legacy marker is refused.
//    4e. A legacy PR body: its PR marker is recognised (no second marker line, no second section).
//    4f. gh setup replaces the legacy PR-template block in place instead of appending a second one.
// 5. A legacy dir marker inside a legacy wiki section is parsed.
// 6. Writers emit only the AOForge namespace: markerLine, commentMarker, prMarker, buildWikiSection, buildPrBody,
//    the TRD and entity codecs, partLine and scopeMarker; withCommentMarker restamps a legacy first line.
// 7. Label union: the AOForge objective label lists #1 and #3, the legacy one #2 and #3 -> the lookup yields #1, #2
//    and #3 once each (gh-issue scan, gh-cache remote model, the flusher's marker scan); a configured label
//    (`github.labels.objective: 'custom'`) is the only one queried.
// 8. In-progress label: `summary post` removes it in both forms; `trd start` adds the AOForge form only; a
//    configured label is the only one removed.
//
// Hermetic: the fake GitHub through the gh-client seam, temp projects, hermeticEnv() for HOME and the outbox. No
// network, no real ~/.claude, no port.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ghBody = require('./gh-body.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghComments = require('./gh-comments.cjs');
const cache = require('./gh-cache.cjs');
const client = require('./gh-client.cjs');
const issueLib = require('./gh-issue.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const verbs = require('./planning-verbs.cjs');
const setup = require('./gh-setup.cjs');
const F = require('./__fixtures__/legacy-gh-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

const OLD = 'devflow';

/** How many times `needle` occurs in `hay`. */
const count = (hay, needle) => hay.split(needle).length - 1;

// ─── 1. Issue id line ────────────────────────────────────────────────────────

describe('1. the legacy issue id line', () => {
  test('1a. extractMarker reads it exactly like the AOForge line', () => {
    const legacy = F.legacyIssueBody({ id: '46' });
    assert.deepEqual(ghBody.extractMarker(legacy), { id: '46', kind: null });
    assert.deepEqual(ghBody.extractMarker(legacy), ghBody.extractMarker(`${ghBody.markerLine('46')}\n`));
    assert.deepEqual(ghBody.extractMarker(F.legacyIssueBody({ id: '046' })), { id: '46', kind: null }, 'canonical id');
  });

  test('1b. indexByMarker maps legacy and AOForge bodies alike; one id claimed in both namespaces is a duplicate', () => {
    const idx = ghBody.indexByMarker([
      { number: 5, body: F.legacyIssueBody({ id: '46' }) },
      { number: 6, body: `${ghBody.markerLine('47')}\n` },
      { number: 7, body: 'no marker' },
    ]);
    assert.deepEqual(idx, { byId: { 46: 5, 47: 6 }, duplicates: {}, unmarked: [7] });

    const both = ghBody.indexByMarker([
      { number: 5, body: F.legacyIssueBody({ id: '46' }) },
      { number: 8, body: `${ghBody.markerLine('46')}\n` },
    ]);
    assert.deepEqual(both, { byId: {}, duplicates: { 46: [5, 8] }, unmarked: [] });
  });

  test('1c. the TRD and entity body codecs read the legacy id and file lines', () => {
    const text = '# TRD 07-01 alpha\n\nDo the thing.\n';
    assert.deepEqual(ghTrd.decodeTrdBody(F.legacyTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })), {
      ok: true, id: '7-01', file: '07-01-alpha-TRD.md', text,
    });
    assert.deepEqual(
      ghTrd.decodeTrdBody(F.legacyTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })),
      ghTrd.decodeTrdBody(ghTrd.encodeTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })),
    );
    assert.deepEqual(ghTrd.decodeEntityBody(F.legacyEntityBody({ id: 'todo-2026-07-31-a', file: 'todos/pending/2026-07-31-a.md', text: '# A\n' })), {
      ok: true, id: 'todo-2026-07-31-a', file: 'todos/pending/2026-07-31-a.md', text: '# A\n',
    });
    assert.equal(ghTrd.parseFileLine(`<!-- ${OLD}:file=07-01-alpha-SUMMARY.md -->`), '07-01-alpha-SUMMARY.md');
  });
});

// ─── 2. Comment markers ──────────────────────────────────────────────────────

describe('2. legacy comment markers', () => {
  test('2a. kind=state: the same { id, kind }; isStateComment and findCommentsByMarker find it', () => {
    const [c] = F.legacyComment({ id: '46', kind: 'state', parts: ['**State**'] });
    assert.deepEqual(ghBody.extractMarker(c.body), { id: '46', kind: 'state' });
    assert.equal(ghBody.isStateComment(c.body, '46'), true);
    assert.equal(ghBody.isStateComment(c.body, '47'), false);
    const found = ghBody.findCommentsByMarker([{ id: 1, body: 'a human comment' }, c], '46', 'state');
    assert.equal(found.length, 1);
    assert.equal(found[0].comment.id, c.id);
  });

  test('2b. gh-cache materialises a quick task whose body and summary comment are legacy', () => {
    const job = '# Quick 12: fix x\n\n- [ ] fix x\n';
    const summary = F.legacyComment({ id: 'quick-12', kind: 'summary', parts: [`<!-- ${OLD}:file=12-SUMMARY.md -->\n# Quick 12 summary\n`] });
    const issue = {
      id: 'quick-12', number: 80, rest_id: 2000080, title: '[quick-12]', state: 'closed', updated_at: '2026-07-31T00:00:00Z',
      body: F.legacyEntityBody({ id: 'quick-12', file: 'quick/12-fix-x/12-JOB.md', text: job }),
      comments: summary.map((c) => ({ ...c, updated_at: '2026-07-31T00:00:09Z' })),
    };
    const r = cache.materialize({
      ok: true, repo: 'o/r', pages: {}, pages_report: { mode: 'wiki', skipped: false },
      objectives: [], trds: [], decisions: [], todos: [], debugs: [], quicks: [issue],
    });
    assert.deepEqual(r.rejected, []);
    assert.deepEqual(r.files, { 'quick/12-fix-x/12-JOB.md': job, 'quick/12-fix-x/12-SUMMARY.md': '# Quick 12 summary\n' });
  });
});

// ─── 3. Multi-part comments ──────────────────────────────────────────────────

describe('3. a legacy multi-part comment', () => {
  test('3. is reassembled in part order exactly like the AOForge form of the same comment', () => {
    const one = 'First paragraph.\n\n';
    const two = 'Second paragraph.\n';
    const legacy = F.legacyComment({ id: '7-01', kind: 'summary', parts: [`<!-- ${OLD}:file=07-01-alpha-SUMMARY.md -->\n${one}`, two] });
    const shuffled = [legacy[1], { id: 1, body: 'looks good' }, legacy[0]];
    const got = ghComments.decodeFileComment(shuffled, '7-01', 'summary');
    assert.equal(got.ok, true, got.error);
    assert.equal(got.file, '07-01-alpha-SUMMARY.md');
    assert.equal(got.text, one + two);

    const marker = ghBody.commentMarker('7-01', 'summary');
    const fresh = [
      { id: 9200, body: `${marker}\n${ghTrd.partLine(1, 2)}\n${ghTrd.fileLine('07-01-alpha-SUMMARY.md')}\n${one}` },
      { id: 9201, body: `${marker}\n${ghTrd.partLine(2, 2)}\n${two}` },
    ];
    const expected = ghComments.decodeFileComment(fresh, '7-01', 'summary');
    assert.equal(got.text, expected.text);
    assert.equal(got.file, expected.file);
  });
});

// ─── 4. Sections ─────────────────────────────────────────────────────────────

describe('4. legacy begin/end sections', () => {
  const body = F.legacyIssueBody({ id: '46', sections: { summary: 'old summary', footer: 'old footer' } });

  test('4. a changed section is replaced in place with AOForge markers; one section; outside text byte-identical', () => {
    const r = ghBody.mergeManaged(body, { summary: 'new summary' }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.changed, true);
    assert.equal(r.body, [
      `<!-- ${OLD}:id=46 -->`,
      '<!-- aoforge:begin summary -->',
      'new summary',
      '<!-- aoforge:end summary -->',
      '',
      `<!-- ${OLD}:begin footer -->`,
      'old footer',
      `<!-- ${OLD}:end footer -->`,
      '',
      F.HUMAN_TEXT,
    ].join('\n'));
    assert.equal(count(r.body, 'begin summary'), 1);
    assert.equal(count(r.body, 'end summary'), 1);
  });

  test('4b. merging the content the legacy sections already hold is no change (no write to rename a marker)', () => {
    const r = ghBody.mergeManaged(body, { summary: 'old summary', footer: 'old footer' }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.changed, false);
    assert.equal(r.body, body);
  });

  test('4c. a merge that changes the body rewrites every written legacy section in the AOForge form', () => {
    const r = ghBody.mergeManaged(body, { summary: 'new summary', footer: 'old footer' }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.changed, true);
    assert.ok(r.body.includes('<!-- aoforge:begin footer -->\nold footer\n<!-- aoforge:end footer -->'), r.body);
    assert.ok(!r.body.includes(`${OLD}:begin`) && !r.body.includes(`${OLD}:end`), r.body);
    assert.ok(r.body.endsWith(`\n\n${F.HUMAN_TEXT}`));
    assert.equal(ghBody.mergeManaged(r.body, { summary: 'new summary', footer: 'old footer' }, '46').changed, false, 'idempotent');
  });

  test('4d. extractSection reads a legacy section; content carrying a legacy section marker is refused', () => {
    assert.equal(ghBody.extractSection(body, 'summary'), 'old summary');
    assert.equal(ghBody.extractSection(body, 'footer'), 'old footer');
    const r = ghBody.mergeManaged(body, { summary: `x\n<!-- ${OLD}:end footer -->` }, '46');
    assert.equal(r.ok, false);
    assert.match(r.error, /section marker/);
  });

  test('4e. a legacy PR body keeps one PR marker and one closes section when merged', () => {
    const pr = F.legacyPrBody({ objective: '49', closes: [100] });
    assert.deepEqual(ghBody.extractPrMarker(pr), { id: '49' });
    const r = ghBody.mergeManaged(pr, { closes: 'Closes #100\nCloses #101' }, '49', { order: ghBody.PR_SECTION_ORDER, marker: 'pr' });
    assert.equal(r.ok, true, r.error);
    assert.equal(count(r.body, ':pr=49'), 1, r.body);
    assert.equal(count(r.body, 'begin closes'), 1, r.body);
    assert.equal(ghBody.extractSection(r.body, 'closes'), 'Closes #100\nCloses #101');
    const asIssue = ghBody.mergeManaged(pr, { summary: 's' }, '49');
    assert.equal(asIssue.ok, false, 'an issue merge never stamps an id marker onto a legacy PR body');
  });

  test('4f. gh setup replaces the legacy PR-template block in place instead of appending a second one', () => {
    const block = '<!-- aoforge:pr-template:start -->\n## Summary\n\nCloses #\n<!-- aoforge:pr-template:end -->';
    const state = {
      repo: 'o/r', owner: 'o', name: 'r', ownerType: 'Organization',
      meta: { has_wiki: false, delete_branch_on_merge: false, default_branch: 'main' },
      github: { enabled: true, repo: 'o/r' },
      rulesets: [], labels: [], types: [], fields: [], wiki: 'disabled',
      local: { workflow: null, prTemplate: F.legacyPrTemplate(), otherWorkflows: [] },
      templates: { workflow: '# aoforge:managed\nname: AOForge checks\n', prTemplate: `${block}\n` },
      record: {},
    };
    const action = setup.planSetup(state).find((a) => a.kind === 'pr-template');
    assert.equal(action.status, 'update');
    assert.equal(action.file.content, `Team checklist: link the design doc.\n\n${block}\n`);
  });
});

// ─── 5. Dir marker ───────────────────────────────────────────────────────────

describe('5. the legacy dir marker', () => {
  test('5. parseDirMarker reads it inside a legacy wiki section', () => {
    const wiki = `<!-- ${OLD}:dir=07-store-demo -->\nDetail: [Objective-7-store-demo](https://github.com/o/r/wiki/Objective-7-store-demo/abc1234) (revision \`abc1234\`)`;
    const body = F.legacyIssueBody({ id: '7', sections: { summary: 's', wiki } });
    assert.equal(ghBody.parseDirMarker(body), '07-store-demo');
    const unsafe = F.legacyIssueBody({ id: '7', sections: { wiki: `<!-- ${OLD}:dir=../escape -->` } });
    assert.equal(ghBody.parseDirMarker(unsafe), null, 'the safe-segment rule still holds');
  });
});

// ─── 6. Writers ──────────────────────────────────────────────────────────────

describe('6. writers emit only the AOForge namespace', () => {
  test('6a. every marker writer', () => {
    const written = [
      ghBody.markerLine('46'),
      ghBody.commentMarker('46', 'state'),
      ghBody.prMarker('49'),
      ghBody.buildWikiSection({ dir: '07-store-demo', page: 'Objective-7-store-demo', url: 'https://github.com/o/r/wiki/x', sha: 'abc1234' }),
      ghBody.buildPrBody({ id: '49', sections: { closes: 'Closes #1', summary: 's' } }),
      ghBody.mergeManaged('', { summary: 's', footer: 'f' }, '46').body,
      ghBody.buildStateComment('46', {}, '2026-10-08T00:00:00Z'),
      ghTrd.encodeTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text: 'x\n' }),
      ghTrd.encodeEntityBody({ id: 'todo-2026-07-31-a', file: 'todos/pending/2026-07-31-a.md', text: 'x\n' }),
      ghTrd.partLine(1, 2),
      ghTrd.scopeMarker(1),
    ];
    for (const text of written) {
      assert.ok(!text.includes(`${OLD}:`), `a writer emitted the legacy namespace: ${text}`);
      assert.match(text, /aoforge:/);
    }
  });

  test('6b. withCommentMarker restamps a legacy first line for the same id in the AOForge form, keeping its kind', () => {
    const [c] = F.legacyComment({ id: '46', kind: 'note', parts: ['hello'] });
    assert.equal(ghBody.withCommentMarker('46', 'comment', c.body), '<!-- aoforge:id=46 kind=note -->\nhello');
    const fresh = '<!-- aoforge:id=46 kind=note -->\nhello';
    assert.equal(ghBody.withCommentMarker('46', 'comment', fresh), fresh, 'an AOForge-stamped body is unchanged');
  });
});

// ─── 7. Label union ──────────────────────────────────────────────────────────

/** A config-only project with github enabled; `labels` lands in `github.labels`. */
function labelProject(labels) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-markers-legacy-'));
  fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
  const github = { enabled: true, repo: 'o/r' };
  if (labels) github.labels = labels;
  fs.writeFileSync(path.join(root, '.aoforge', 'config.json'), `${JSON.stringify({ github }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, '.aoforge', 'PROJECT.md'), '# Demo\n');
  fs.mkdirSync(path.join(root, 'docs', 'aoforge'), { recursive: true });
  return root;
}

/** The label of every `issues?labels=` list read and every `gh issue list --label` in the fake's call log. */
function labelsQueried(fake) {
  const out = [];
  for (const args of fake.calls()) {
    const line = args.join(' ');
    const rest = /issues\?labels=([^&\s]+)/.exec(line);
    if (rest) out.push(decodeURIComponent(rest[1]));
    const at = args.indexOf('--label');
    if (args[0] === 'issue' && args[1] === 'list' && at >= 0) out.push(args[at + 1]);
  }
  return out;
}

describe('7. label union', () => {
  let envh;
  let root;
  let fake;
  const pages = F.labelPages({ kind: 'objective', aoforge: [1, 3], legacy: [2, 3] });

  function seed(f) {
    for (const issue of pages.issues) f.seedIssue({ title: issue.title, body: issue.body, labels: issue.labels });
  }

  beforeEach(() => {
    envh = hermeticEnv();
    fake = createFakeGitHub({ repo: 'o/r', hasWiki: false, ownerType: 'User' });
    client._setNow(() => 0);
    client._setSleep(() => {});
    client._setRunGh(fake.runGh);
    seed(fake);
    root = null;
  });

  afterEach(() => {
    client._resetClient();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    envh.restore();
  });

  test('7a. gh-issue: the objective scan yields #1, #2 and #3 once each', () => {
    root = labelProject();
    const ctx = issueLib.createRunContext(root);
    const scan = issueLib.scanObjectiveIssues(ctx);
    assert.equal(scan.ok, true, scan.error);
    assert.deepEqual(scan.issues.map((i) => i.number).sort((a, b) => a - b), [1, 2, 3]);
    assert.deepEqual(scan.byId, { 1: 1, 2: 2, 3: 3 });
    assert.deepEqual(labelsQueried(fake).sort(), [pages.labels.aoforge, pages.labels.legacy].sort());
  });

  test('7b. gh-cache: the remote model holds objectives 1, 2 and 3 once each', () => {
    root = labelProject();
    const model = cache.readRemoteModel(root);
    assert.equal(model.ok, true, model.error);
    assert.deepEqual(model.objectives.map((o) => [o.id, o.number]), [['1', 1], ['2', 2], ['3', 3]]);
    assert.deepEqual(model.problems.duplicate_objectives, {});
    const queried = labelsQueried(fake);
    for (const kind of ['objective', 'trd', 'decision', 'todo', 'debug', 'quick']) {
      assert.ok(queried.includes(`aoforge:${kind}`), `aoforge:${kind} listed`);
      assert.ok(queried.includes(`${OLD}:${kind}`), `${OLD}:${kind} listed`);
    }
  });

  test('7c. a configured label is the only one queried', () => {
    root = labelProject({ objective: 'custom' });
    fake.seedIssue({ title: '[Objective 4] custom', body: `${ghBody.markerLine('4')}\n`, labels: ['custom'] });
    const scan = issueLib.scanObjectiveIssues(issueLib.createRunContext(root));
    assert.equal(scan.ok, true, scan.error);
    assert.deepEqual(scan.issues.map((i) => i.number), [4]);
    assert.deepEqual(labelsQueried(fake), ['custom']);

    const model = cache.readRemoteModel(root);
    assert.equal(model.ok, true, model.error);
    assert.deepEqual(model.objectives.map((o) => o.id), ['4']);
    const objectiveLists = labelsQueried(fake).filter((l) => /objective|custom/.test(l));
    assert.deepEqual(objectiveLists, ['custom', 'custom'], 'neither objective default was listed');
  });
});

describe('7d. the flusher adopts a legacy-labelled TRD issue instead of creating a second one', () => {
  let envh;
  let project;
  let fake;

  beforeEach(() => {
    envh = hermeticEnv();
    project = makeStoreProject({ store: true });
    fake = createFakeGitHub(project.fakeOptions);
    client._setNow(() => 0);
    client._setSleep(() => {});
    client._setRunGh(fake.runGh);
  });

  afterEach(() => {
    client._resetClient();
    envh.restore();
    project.cleanup();
  });

  test('7d. upsert-issue with no mapping finds the legacy TRD issue by label scan + marker', () => {
    const file = STORE_FIXTURE.trdFiles[0];
    const text = STORE_FIXTURE.trds[file];
    fake.seedIssue({ title: `[TRD 07-01] ${file}`, body: F.legacyTrdBody({ id: '7-01', file, text }), labels: [`${OLD}:trd`] });
    const ctx = flushLib.createContext(project.root, {
      modes: { types: 'native', fields: 'native', hierarchy: 'native', pages: 'wiki', writable: true },
      caps: { issue_fields: { available: true, ids: { work: 11, kind: 12 } } },
    });
    assert.ok(!ctx.error, ctx.error);
    const res = flushLib.executeOp(ctx, {
      seq: 1, status: 'pending', kind: 'upsert-issue', target: { id: '7-01', role: 'trd' },
      payload: { title: `[TRD 07-01] ${file}`, body: ghTrd.encodeTrdBody({ id: '7-01', file, text }), labels: ['aoforge:trd'], type: 'TRD' },
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(fake.issues.length, 1, 'no second issue');
    assert.equal(mappingLib.getTrd(mappingLib.readMappingV3(project.root), '7-01').issue_number, fake.issues[0].number);
  });
});

// ─── 8. In-progress label ────────────────────────────────────────────────────

describe('8. the in-progress label', () => {
  let envh;
  let project;
  const pending = () => outbox.readJournal(project.root).journal.ops.filter((o) => o.status === 'pending');
  const patchOf = () => pending().find((o) => o.kind === 'patch-issue');

  beforeEach(() => {
    envh = hermeticEnv();
    project = makeStoreProject({ store: true });
  });

  afterEach(() => {
    envh.restore();
    project.cleanup();
  });

  test('8a. summary post removes it in both forms', () => {
    const r = verbs.summaryPost(project.root, { trd: '07-01', text: '# Summary\n', noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(patchOf().payload, { labels_remove: ['aoforge:in-progress', `${OLD}:in-progress`] });
  });

  test('8b. trd start adds the AOForge form only', () => {
    const r = ghComments.enqueueTrdStart(project.root, { trdId: '7-01' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(patchOf().payload, { labels_add: ['aoforge:in-progress'] });
  });

  test('8c. a configured in-progress label is the only one removed', () => {
    const cfgFile = path.join(project.root, '.aoforge', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    cfg.github.labels = { in_progress: 'wip' };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
    const r = verbs.summaryPost(project.root, { trd: '07-01', text: '# Summary\n', noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(patchOf().payload, { labels_remove: ['wip'] });
  });
});
