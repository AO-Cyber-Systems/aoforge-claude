'use strict';

// Test list (TRD 78-03, objective 78, SC-2): 3.1.0 reads GitHub markers in the AOForge namespace only. A body, comment,
// TRD or entity written in the pre-rename `devflow` namespace is plain text to every shared reader; `gh rebrand`
// (72-16, kept) is the one tool that still reads it, to rewrite it (gh-rebrand.legacy.test.cjs).
//
// 1. The legacy issue id line is not a marker: extractMarker -> null (an AOForge one is `{ id, kind }`, no `legacy`
//    key); indexByMarker counts a legacy body as unmarked, so a legacy and an AOForge claim on one id are one claim.
//    1c. gh-trd: the legacy TRD, entity, file, scope and part lines are not parsed; the AOForge ones are.
// 2. A legacy comment marker `kind=state` is not a marker: no isStateComment, no findCommentsByMarker hit.
//    2b. gh-cache materialise rejects a quick task whose body and summary comment are legacy (no cache file).
//    2c. gh-cache materialise of an objective whose body uses legacy markers: no directory, so no cache file from it;
//        an AOForge objective beside it still materialises.
// 3. A legacy multi-part comment is not found (decodeFileComment -> notFound).
// 4. A legacy begin/end section is plain text: mergeManaged keeps it byte for byte, stamps the AOForge id line and
//    appends the AOForge section; extractSection does not read it; section content may carry a legacy-looking
//    marker (it is plain content now) while an AOForge marker in content is still refused.
//    4e. A legacy PR body has no PR marker: a PR merge stamps the AOForge one and appends its sections.
//    4f. gh setup refuses the PR-template step when the file holds the legacy block (conflict, names
//        `aof-tools gh rebrand --apply`, file byte-identical after apply); an AOForge block is refreshed in place and a
//        file with no block gets one appended, as before.
// 5. A legacy dir marker is not read, inside a legacy or an AOForge wiki section.
// 6. Writers emit only the AOForge namespace; withCommentMarker adds an AOForge marker line above a legacy first line
//    for the same id instead of restamping it.
// 7. Label union (TRD 72-11 behaviour, removed by 78-09): the AOForge objective label lists #1 and #3, the legacy one
//    #2 and #3 -> the lookup yields #1, #2 and #3 once each (gh-issue scan, gh-cache remote model, the flusher's marker
//    scan); a configured label is the only one queried. The bodies are AOForge-marked here (an old issue AOForge 3.0
//    rewrote while its label stayed old): a legacy body is unmarked since 78-03 (case 1).
//    7e. `gh orphans` (gh-hierarchy reportOrphans) lists a legacy-labelled, unlinked TRD issue.
// 8. In-progress label (planning-verbs, 78-09's): `summary post` removes it in both forms; `trd start` adds the
//    AOForge form only; a configured label is the only one removed.
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

/** An empty remote model with `fields` set, the shape cache.materialize reads. */
const remoteModel = (fields) => ({
  ok: true, repo: 'o/r', pages: {}, pages_report: { mode: 'wiki', skipped: false },
  objectives: [], trds: [], decisions: [], todos: [], debugs: [], quicks: [], ...fields,
});

// ─── 1. Issue id line ────────────────────────────────────────────────────────

describe('1. the legacy issue id line is not a marker', () => {
  test('1a. extractMarker: legacy -> null; AOForge -> { id, kind } with no legacy key', () => {
    assert.equal(ghBody.extractMarker(F.legacyIssueBody({ id: '46' })), null);
    assert.equal(ghBody.extractMarker(F.legacyIssueBody({ id: '046' })), null);
    const own = ghBody.extractMarker(`${ghBody.markerLine('46')}\n`);
    assert.deepEqual(own, { id: '46', kind: null });
    assert.deepEqual(Object.keys(own).sort(), ['id', 'kind']);
    const comment = ghBody.extractMarker(`${ghBody.commentMarker('46', 'state')}\nx`);
    assert.deepEqual(Object.keys(comment).sort(), ['id', 'kind']);
  });

  test('1b. indexByMarker: a legacy body is unmarked, so a legacy and an AOForge claim on one id are one claim', () => {
    const idx = ghBody.indexByMarker([
      { number: 5, body: F.legacyIssueBody({ id: '46' }) },
      { number: 6, body: `${ghBody.markerLine('47')}\n` },
      { number: 7, body: 'no marker' },
    ]);
    assert.deepEqual(idx, { byId: { 47: 6 }, duplicates: {}, unmarked: [5, 7] });

    const both = ghBody.indexByMarker([
      { number: 5, body: F.legacyIssueBody({ id: '46' }) },
      { number: 8, body: `${ghBody.markerLine('46')}\n` },
    ]);
    assert.deepEqual(both, { byId: { 46: 8 }, duplicates: {}, unmarked: [5] });
  });

  test('1c. gh-trd: legacy TRD, entity, file, scope and part lines are not parsed; AOForge ones are', () => {
    const text = '# TRD 07-01 alpha\n\nDo the thing.\n';
    assert.equal(ghTrd.decodeTrdBody(F.legacyTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })).ok, false);
    assert.deepEqual(ghTrd.decodeTrdBody(ghTrd.encodeTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })), {
      ok: true, id: '7-01', file: '07-01-alpha-TRD.md', text,
    });

    const entity = { id: 'todo-2026-07-31-a', file: 'todos/pending/2026-07-31-a.md', text: '# A\n' };
    assert.equal(ghTrd.decodeEntityBody(F.legacyEntityBody(entity)).ok, false);
    assert.deepEqual(ghTrd.decodeEntityBody(ghTrd.encodeEntityBody(entity)), { ok: true, ...entity });

    assert.equal(ghTrd.parseFileLine(`<!-- ${OLD}:file=07-01-alpha-SUMMARY.md -->`), null);
    assert.equal(ghTrd.parseFileLine(ghTrd.fileLine('07-01-alpha-SUMMARY.md')), '07-01-alpha-SUMMARY.md');

    const legacyScope = ghTrd.parseScopeComments([F.legacyScopeComment({ n: 1 })]);
    assert.deepEqual(legacyScope, { scopes: [], errors: [] });
    const ownScope = ghTrd.parseScopeComments([{ id: 9301, body: ghTrd.buildScopeComment(1, 'Also cover x.\n') }]);
    assert.deepEqual(ownScope.scopes.map((s) => [s.n, s.text]), [[1, 'Also cover x.\n']]);

    const legacyParts = ghTrd.joinParts([`<!-- ${OLD}:part=1/2 -->\nA`, `<!-- ${OLD}:part=2/2 -->\nB`]);
    assert.equal(legacyParts.ok, false);
    assert.match(legacyParts.error, /no part line/);
    const ownParts = ghTrd.joinParts([`${ghTrd.partLine(2, 2)}\nB`, `${ghTrd.partLine(1, 2)}\nA`]);
    assert.deepEqual(ownParts, { ok: true, text: 'AB', missing: [] });
  });
});

// ─── 2. Comment markers ──────────────────────────────────────────────────────

describe('2. legacy comment markers are not markers', () => {
  test('2a. kind=state: no marker, no isStateComment, no findCommentsByMarker hit', () => {
    const [c] = F.legacyComment({ id: '46', kind: 'state', parts: ['**State**'] });
    assert.equal(ghBody.extractMarker(c.body), null);
    assert.equal(ghBody.isStateComment(c.body, '46'), false);
    assert.deepEqual(ghBody.findCommentsByMarker([{ id: 1, body: 'a human comment' }, c], '46', 'state'), []);
    const own = { id: 2, body: `${ghBody.commentMarker('46', 'state')}\n**State**` };
    assert.equal(ghBody.isStateComment(own.body, '46'), true);
    assert.deepEqual(ghBody.findCommentsByMarker([c, own], '46', 'state').map((f) => f.comment.id), [2]);
  });

  test('2b. gh-cache rejects a quick task whose body and summary comment are legacy: no cache file', () => {
    const job = '# Quick 12: fix x\n\n- [ ] fix x\n';
    const summary = F.legacyComment({ id: 'quick-12', kind: 'summary', parts: [`<!-- ${OLD}:file=12-SUMMARY.md -->\n# Quick 12 summary\n`] });
    const issue = {
      id: 'quick-12', number: 80, rest_id: 2000080, title: '[quick-12]', state: 'closed', updated_at: '2026-07-31T00:00:00Z',
      body: F.legacyEntityBody({ id: 'quick-12', file: 'quick/12-fix-x/12-JOB.md', text: job }),
      comments: summary.map((c) => ({ ...c, updated_at: '2026-07-31T00:00:09Z' })),
    };
    const r = cache.materialize(remoteModel({ quicks: [issue] }));
    assert.deepEqual(r.files, {});
    assert.deepEqual(r.rejected.map((x) => [x.kind, x.number]), [['quick', 80]]);
  });

  test('2c. gh-cache: a legacy objective body gives no directory and no file; an AOForge one still materialises', () => {
    const legacyWiki = `<!-- ${OLD}:dir=07-store-demo -->\nDetail: [Objective-7-store-demo](https://github.com/o/r/wiki/Objective-7-store-demo/abc1234) (revision \`abc1234\`)`;
    const legacy = {
      id: '7', number: 70, title: '[Objective 7] Store demo', state: 'open',
      body: F.legacyIssueBody({ id: '7', sections: { summary: 's', wiki: legacyWiki } }),
      comments: F.legacyComment({ id: '7', kind: 'verification', parts: [`<!-- ${OLD}:file=07-VERIFICATION.md -->\n# V7\n`] }),
    };
    const wiki = ghBody.buildWikiSection({ dir: '08-next', page: 'Objective-8-next', url: 'https://github.com/o/r/wiki/x', sha: 'abc1234' });
    const own = {
      id: '8', number: 80, title: '[Objective 8] Next', state: 'open',
      body: ghBody.mergeManaged('', { summary: 's', wiki }, '8').body,
      comments: [{ id: 9500, body: `${ghBody.commentMarker('8', 'verification')}\n${ghTrd.fileLine('08-VERIFICATION.md')}\n# V8\n` }],
    };
    const r = cache.materialize(remoteModel({ objectives: [legacy, own] }));
    assert.deepEqual(r.files, { 'objectives/08-next/08-VERIFICATION.md': '# V8\n' });
    assert.deepEqual(r.no_dir, [{ id: '7', number: 70 }]);
    assert.deepEqual(r.rejected, []);
  });
});

// ─── 3. Multi-part comments ──────────────────────────────────────────────────

describe('3. a legacy multi-part comment', () => {
  test('3. is not found; the AOForge form of the same comment is reassembled', () => {
    const one = 'First paragraph.\n\n';
    const two = 'Second paragraph.\n';
    const legacy = F.legacyComment({ id: '7-01', kind: 'summary', parts: [`<!-- ${OLD}:file=07-01-alpha-SUMMARY.md -->\n${one}`, two] });
    const got = ghComments.decodeFileComment([legacy[1], { id: 1, body: 'looks good' }, legacy[0]], '7-01', 'summary');
    assert.equal(got.ok, false);
    assert.equal(got.notFound, true);

    const marker = ghBody.commentMarker('7-01', 'summary');
    const fresh = [
      { id: 9201, body: `${marker}\n${ghTrd.partLine(2, 2)}\n${two}` },
      { id: 9200, body: `${marker}\n${ghTrd.partLine(1, 2)}\n${ghTrd.fileLine('07-01-alpha-SUMMARY.md')}\n${one}` },
    ];
    const own = ghComments.decodeFileComment([...legacy, ...fresh], '7-01', 'summary');
    assert.equal(own.ok, true, own.error);
    assert.equal(own.file, '07-01-alpha-SUMMARY.md');
    assert.equal(own.text, one + two);
  });
});

// ─── 4. Sections ─────────────────────────────────────────────────────────────

describe('4. legacy begin/end sections are plain text', () => {
  const body = F.legacyIssueBody({ id: '46', sections: { summary: 'old summary', footer: 'old footer' } });

  test('4. mergeManaged keeps the legacy text byte for byte, stamps the AOForge id line, appends the section', () => {
    const r = ghBody.mergeManaged(body, { summary: 'new summary' }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.changed, true);
    assert.deepEqual(r.warnings, [], 'a legacy pair is not a malformed AOForge section');
    assert.equal(r.body, `<!-- aoforge:id=46 -->\n${body}\n<!-- aoforge:begin summary -->\nnew summary\n<!-- aoforge:end summary -->`);
    assert.equal(count(r.body, 'aoforge:begin summary'), 1);
    assert.equal(ghBody.extractSection(r.body, 'summary'), 'new summary');
    assert.equal(ghBody.mergeManaged(r.body, { summary: 'new summary' }, '46').changed, false, 'idempotent');
  });

  test('4b. merging the content a legacy section holds still appends the AOForge section', () => {
    const r = ghBody.mergeManaged(body, { summary: 'old summary', footer: 'old footer' }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(r.changed, true);
    assert.ok(r.body.includes(body), 'the legacy text is kept whole');
    assert.ok(r.body.endsWith('<!-- aoforge:begin footer -->\nold footer\n<!-- aoforge:end footer -->'), r.body);
  });

  test('4d. extractSection does not read a legacy section; a legacy-looking marker in content is plain content', () => {
    assert.equal(ghBody.extractSection(body, 'summary'), null);
    assert.equal(ghBody.extractSection(body, 'footer'), null);
    const content = `x\n<!-- ${OLD}:end footer -->`;
    const r = ghBody.mergeManaged(body, { summary: content }, '46');
    assert.equal(r.ok, true, r.error);
    assert.equal(ghBody.extractSection(r.body, 'summary'), content);
    const forged = ghBody.mergeManaged(body, { summary: 'x\n<!-- aoforge:end footer -->' }, '46');
    assert.equal(forged.ok, false);
    assert.match(forged.error, /section marker/);
  });

  test('4e. a legacy PR body has no PR marker: a PR merge stamps the AOForge one and appends its sections', () => {
    const pr = F.legacyPrBody({ objective: '49', closes: [100] });
    assert.equal(ghBody.extractPrMarker(pr), null);
    const r = ghBody.mergeManaged(pr, { closes: 'Closes #100\nCloses #101' }, '49', { order: ghBody.PR_SECTION_ORDER, marker: 'pr' });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.body.startsWith('<!-- aoforge:pr=49 -->\n'), r.body);
    assert.ok(r.body.includes(pr), 'the legacy text is kept whole');
    assert.equal(ghBody.extractSection(r.body, 'closes'), 'Closes #100\nCloses #101');
  });

  describe('4f. gh setup and the PR template', () => {
    const block = '<!-- aoforge:pr-template:start -->\n## Summary\n\nCloses #\n<!-- aoforge:pr-template:end -->';
    const stateWith = (prTemplate) => ({
      repo: 'o/r', owner: 'o', name: 'r', ownerType: 'Organization',
      meta: { has_wiki: false, delete_branch_on_merge: false, default_branch: 'main' },
      github: { enabled: true, repo: 'o/r' },
      rulesets: [], labels: [], types: [], fields: [], wiki: 'disabled',
      local: { workflow: null, prTemplate, otherWorkflows: [] },
      templates: { workflow: '# aoforge:managed\nname: AOForge checks\n', prTemplate: `${block}\n` },
      record: {},
    });
    const prAction = (prTemplate) => setup.planSetup(stateWith(prTemplate)).find((a) => a.kind === 'pr-template');

    for (const [label, template] of [['with a team line', F.legacyPrTemplate()], ['alone', F.legacyPrTemplate({ teamLine: false })]]) {
      test(`4f. the legacy block ${label}: the step is refused, naming gh rebrand --apply; nothing is written`, () => {
        const action = prAction(template);
        assert.equal(action.status, 'conflict');
        assert.equal(action.reason, 'legacy-pr-template');
        assert.equal(action.file, undefined, 'no file is planned');
        assert.ok(action.desc.includes(setup.PR_TEMPLATE_PATH), action.desc);
        assert.ok(action.desc.includes('aof-tools gh rebrand --apply'), action.desc);

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-markers-legacy-setup-'));
        try {
          const file = path.join(root, setup.PR_TEMPLATE_PATH);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, template);
          const applied = setup.applySetup(root, [action], { repo: 'o/r' });
          assert.equal(applied.ok, false);
          assert.deepEqual(applied.outcomes.map((o) => [o.kind, o.status]), [['pr-template', 'conflict']]);
          assert.equal(fs.readFileSync(file, 'utf-8'), template, 'byte-identical');
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    }

    test('4f. an AOForge block is refreshed in place; a file with no block gets one appended (as before)', () => {
      const stale = `Team line.\n\n<!-- aoforge:pr-template:start -->\nold\n<!-- aoforge:pr-template:end -->\nTail.\n`;
      const refreshed = prAction(stale);
      assert.equal(refreshed.status, 'update');
      assert.equal(refreshed.file.content, `Team line.\n\n${block}\nTail.\n`);

      const plain = prAction('Our own template.\n');
      assert.equal(plain.status, 'update');
      assert.equal(plain.file.content, `Our own template.\n\n${block}\n`);
    });
  });
});

// ─── 5. Dir marker ───────────────────────────────────────────────────────────

describe('5. the legacy dir marker', () => {
  test('5. parseDirMarker does not read it, in a legacy or an AOForge wiki section', () => {
    const wiki = `<!-- ${OLD}:dir=07-store-demo -->\nDetail: [Objective-7-store-demo](https://github.com/o/r/wiki/Objective-7-store-demo/abc1234) (revision \`abc1234\`)`;
    assert.equal(ghBody.parseDirMarker(F.legacyIssueBody({ id: '7', sections: { summary: 's', wiki } })), null);
    assert.equal(ghBody.parseDirMarker(ghBody.mergeManaged('', { summary: 's', wiki }, '7').body), null);
    const own = ghBody.buildWikiSection({ dir: '07-store-demo', page: 'Objective-7-store-demo', url: 'https://github.com/o/r/wiki/x', sha: 'abc1234' });
    assert.equal(ghBody.parseDirMarker(ghBody.mergeManaged('', { summary: 's', wiki: own }, '7').body), '07-store-demo');
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

  test('6b. withCommentMarker adds an AOForge marker line above a legacy first line for the same id', () => {
    const [c] = F.legacyComment({ id: '46', kind: 'note', parts: ['hello'] });
    assert.equal(ghBody.withCommentMarker('46', 'comment', c.body), `<!-- aoforge:id=46 kind=comment -->\n${c.body}`);
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
  const pages = F.labelPages({ kind: 'objective', aoforge: [1, 3], legacy: [2, 3], bodies: 'aoforge' });

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

  test('7d. upsert-issue with no mapping finds the legacy-labelled TRD issue by label scan + marker', () => {
    const file = STORE_FIXTURE.trdFiles[0];
    const text = STORE_FIXTURE.trds[file];
    const body = ghTrd.encodeTrdBody({ id: '7-01', file, text });
    fake.seedIssue({ title: `[TRD 07-01] ${file}`, body, labels: [`${OLD}:trd`] });
    const ctx = flushLib.createContext(project.root, {
      modes: { types: 'native', fields: 'native', hierarchy: 'native', pages: 'wiki', writable: true },
      caps: { issue_fields: { available: true, ids: { work: 11, kind: 12 } } },
    });
    assert.ok(!ctx.error, ctx.error);
    const res = flushLib.executeOp(ctx, {
      seq: 1, status: 'pending', kind: 'upsert-issue', target: { id: '7-01', role: 'trd' },
      payload: { title: `[TRD 07-01] ${file}`, body, labels: ['aoforge:trd'], type: 'TRD' },
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(fake.issues.length, 1, 'no second issue');
    assert.equal(mappingLib.getTrd(mappingLib.readMappingV3(project.root), '7-01').issue_number, fake.issues[0].number);
  });

  test('7e. gh orphans lists a legacy-labelled TRD issue that is not linked under its objective', () => {
    const objective = fake.seedIssue({ title: '[Objective 7] Store demo', body: `${ghBody.markerLine('7')}\n`, labels: ['aoforge:objective'] });
    const m = mappingLib.readMappingV3(project.root);
    mappingLib.setEntry(m, '7', { issue_id: objective });
    assert.equal(mappingLib.writeMappingV3(project.root, m).ok, true);
    const ghost = fake.seedIssue({
      title: '[TRD 07-09] ghost',
      body: ghTrd.encodeTrdBody({ id: '7-09', file: '07-09-ghost-TRD.md', text: '# ghost\n' }),
      labels: [`${OLD}:trd`],
    });
    const r = require('./gh-hierarchy.cjs').reportOrphans(project.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.unlinked, [{ id: '7-09', number: ghost }]);
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
