'use strict';

// Unit tests for lib/gh-body.cjs — markers, managed-section builder, comment
// helpers, indexByMarker, parseTitleNumber and mergeManaged.
//
// gh-body.cjs is a pure module: no gh calls, no fs. Every test here uses
// hand-written body strings — no gh mock, no fixtures, no generated data.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ghBody = require('./gh-body.cjs');

// ─── Shared state factory ────────────────────────────────────────────────────

function makeState(overrides) {
  return Object.assign(
    {
      number: '46',
      name: 'GitHub sync foundations',
      goal: 'Make GitHub a reliable system of record',
      trd_done: 2,
      trd_total: 5,
      current_wave: 1,
      last_commit: { sha: 'abc1234', subject: 'feat(46-01): add gh client' },
      success_criteria: [
        { id: 'SC-1', text: 'Re-running sync creates no duplicates', done: true },
        { id: 'SC-2', text: 'Human edits survive a sync', done: false },
      ],
      trds: [
        { name: '46-01-gh-client', brief: 'rate-limited gh client', done: true },
        { name: '46-02-gh-mapping', brief: 'v3 mapping', done: false },
      ],
      summary_count: 2,
      branch: 'feat/github-sync',
      objectiveId: '46-github-sync-foundations',
      dir: '46-github-sync-foundations',
    },
    overrides || {}
  );
}

// ─── Task 1: markers ─────────────────────────────────────────────────────────

describe('markers', () => {
  test('1: markerLine and commentMarker build the exact marker text', () => {
    assert.strictEqual(ghBody.markerLine('46'), '<!-- devflow:id=46 -->');
    assert.strictEqual(ghBody.commentMarker('46', 'state'), '<!-- devflow:id=46 kind=state -->');
  });

  test('1b: markerLine accepts decimal and TRD-form ids', () => {
    assert.strictEqual(ghBody.markerLine('2.1'), '<!-- devflow:id=2.1 -->');
    assert.strictEqual(ghBody.markerLine('0'), '<!-- devflow:id=0 -->');
    assert.strictEqual(ghBody.markerLine('46-02'), '<!-- devflow:id=46-02 -->');
  });

  test('1c: markerLine writes the canonical id (leading zeros dropped)', () => {
    assert.strictEqual(ghBody.markerLine('046'), '<!-- devflow:id=46 -->');
    assert.strictEqual(ghBody.markerLine('02.1'), '<!-- devflow:id=2.1 -->');
    assert.strictEqual(ghBody.markerLine(46), '<!-- devflow:id=46 -->');
  });

  test('1d: an id extractMarker could not read back is refused, not written', () => {
    assert.throws(() => ghBody.markerLine('not-an-id'), /invalid/i);
    assert.throws(() => ghBody.markerLine(''), /invalid/i);
    assert.throws(() => ghBody.commentMarker('46', 'Bad Kind'), /invalid/i);
  });

  test('2: extractMarker returns id and kind, null when there is no marker', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!-- devflow:id=2.1 -->\nfoo'), { id: '2.1', kind: null });
    assert.deepStrictEqual(
      ghBody.extractMarker('<!-- devflow:id=46 kind=verification -->\nbody'),
      { id: '46', kind: 'verification' }
    );
    assert.deepStrictEqual(ghBody.extractMarker('<!-- devflow:id=46-02 -->'), { id: '46-02', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- devflow:id=0 -->'), { id: '0', kind: null });
    assert.strictEqual(ghBody.extractMarker('no marker here'), null);
    assert.strictEqual(ghBody.extractMarker(''), null);
    assert.strictEqual(ghBody.extractMarker(null), null);
    assert.strictEqual(ghBody.extractMarker(undefined), null);
  });

  test('2b: extractMarker tolerates extra whitespace inside the comment', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!--   devflow:id=46   kind=state   -->'), { id: '46', kind: 'state' });
  });

  test('3: withCommentMarker prefixes the marker line', () => {
    assert.strictEqual(
      ghBody.withCommentMarker('46', 'comment', 'hello'),
      '<!-- devflow:id=46 kind=comment -->\nhello'
    );
  });

  test('3b: withCommentMarker leaves a body that already carries a marker for the same id unchanged', () => {
    const already = '<!-- devflow:id=46 kind=state -->\nhello';
    assert.strictEqual(ghBody.withCommentMarker('46', 'state', already), already);
    assert.strictEqual(ghBody.withCommentMarker('46', 'comment', already), already);
  });

  test('3c: withCommentMarker still prefixes when the existing marker belongs to another id', () => {
    const other = '<!-- devflow:id=45 kind=state -->\nhello';
    const out = ghBody.withCommentMarker('46', 'state', other);
    assert.ok(out.startsWith('<!-- devflow:id=46 kind=state -->\n'));
    assert.ok(out.endsWith(other));
  });
});

// ─── Task 1: section builder ─────────────────────────────────────────────────

describe('buildObjectiveSections', () => {
  test('4: returns summary, criteria, trds, footer in SECTION_ORDER', () => {
    assert.deepStrictEqual(ghBody.SECTION_ORDER, ['summary', 'criteria', 'trds', 'footer']);
    const s = ghBody.buildObjectiveSections(makeState());
    assert.deepStrictEqual(Object.keys(s), ghBody.SECTION_ORDER);
    for (const name of ghBody.SECTION_ORDER) assert.strictEqual(typeof s[name], 'string');
  });

  test('4b: summary carries title, goal and status line', () => {
    const s = ghBody.buildObjectiveSections(makeState());
    assert.strictEqual(
      s.summary,
      '**Objective 46: GitHub sync foundations**\n\n' +
        '**Goal:** Make GitHub a reliable system of record\n\n' +
        '**Status:** 2/5 TRDs done, current wave 1, last commit abc1234'
    );
  });

  test('4c: summary omits the goal line when there is no goal, and defaults wave and commit', () => {
    const s = ghBody.buildObjectiveSections(makeState({ goal: '', current_wave: 0, last_commit: null }));
    assert.strictEqual(
      s.summary,
      '**Objective 46: GitHub sync foundations**\n\n' +
        '**Status:** 2/5 TRDs done, current wave 1, last commit none'
    );
  });

  test('4d: criteria and trds render checklists', () => {
    const s = ghBody.buildObjectiveSections(makeState());
    assert.strictEqual(
      s.criteria,
      '- [x] SC-1: Re-running sync creates no duplicates\n- [ ] SC-2: Human edits survive a sync'
    );
    assert.strictEqual(
      s.trds,
      '- [x] 46-01-gh-client — rate-limited gh client\n- [ ] 46-02-gh-mapping — v3 mapping'
    );
  });

  test('4e: an item without text or brief renders without a dangling separator', () => {
    const s = ghBody.buildObjectiveSections(
      makeState({
        success_criteria: [{ id: 'SC-1', done: false }],
        trds: [{ name: '46-01-gh-client', done: false }],
      })
    );
    assert.strictEqual(s.criteria, '- [ ] SC-1');
    assert.strictEqual(s.trds, '- [ ] 46-01-gh-client');
  });

  test('4f: empty criteria and trds produce the placeholder', () => {
    const s = ghBody.buildObjectiveSections(makeState({ success_criteria: [], trds: [] }));
    assert.strictEqual(s.criteria, '_None yet._');
    assert.strictEqual(s.trds, '_None yet._');
    const missing = ghBody.buildObjectiveSections(makeState({ success_criteria: undefined, trds: undefined }));
    assert.strictEqual(missing.criteria, '_None yet._');
    assert.strictEqual(missing.trds, '_None yet._');
  });

  test('4g: footer names the objective directory, preferring state.dir over objectiveId', () => {
    const s = ghBody.buildObjectiveSections(makeState());
    assert.ok(s.footer.startsWith('_Tracked by [DevFlow]('));
    assert.ok(s.footer.includes('`.planning/objectives/46-github-sync-foundations/`'));

    const viaDir = ghBody.buildObjectiveSections(makeState({ dir: '46-dir-name', objectiveId: '46-other' }));
    assert.ok(viaDir.footer.includes('`.planning/objectives/46-dir-name/`'));

    const viaObjectiveId = ghBody.buildObjectiveSections(makeState({ dir: undefined }));
    assert.ok(viaObjectiveId.footer.includes('`.planning/objectives/46-github-sync-foundations/`'));
  });

  test('4h: section content never carries managed-section markers of its own', () => {
    const s = ghBody.buildObjectiveSections(makeState());
    for (const name of ghBody.SECTION_ORDER) assert.ok(!s[name].includes('devflow:begin'), name);
    for (const name of ghBody.SECTION_ORDER) assert.ok(!s[name].includes('devflow:end'), name);
  });
});

// ─── Task 1: sticky state comment ────────────────────────────────────────────

describe('state comment', () => {
  const ISO = '2026-09-30T12:00:00Z';

  test('15: buildStateComment starts with the new marker and keeps the sticky content', () => {
    const out = ghBody.buildStateComment('46', makeState(), ISO);
    const lines = out.split('\n');
    assert.strictEqual(lines[0], '<!-- devflow:id=46 kind=state -->');
    assert.deepStrictEqual(lines.slice(1), [
      '**DevFlow state — last synced 2026-09-30T12:00:00Z**',
      '',
      '- Wave: 1',
      '- TRDs: 2/5',
      '- SUMMARY count: 2',
      '- Last commit: abc1234 — feat(46-01): add gh client',
      '- Branch: feat/github-sync',
    ]);
  });

  test('15b: buildStateComment drops the commit and branch lines when absent', () => {
    const out = ghBody.buildStateComment('46', makeState({ last_commit: null, branch: '', current_wave: 0 }), ISO);
    assert.deepStrictEqual(out.split('\n').slice(1), [
      '**DevFlow state — last synced 2026-09-30T12:00:00Z**',
      '',
      '- Wave: 1',
      '- TRDs: 2/5',
      '- SUMMARY count: 2',
    ]);
  });

  test('16: isStateComment recognises the new marker and the legacy df:state marker', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- devflow:id=46 kind=state -->\nstuff', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\nWave: 2', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\nWave: 2', '12'), true, 'legacy marker has no id');
  });

  test('16b: isStateComment rejects other kinds, other ids and unmarked bodies', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- devflow:id=46 kind=verification -->\nstuff', '46'), false);
    assert.strictEqual(ghBody.isStateComment('<!-- devflow:id=45 kind=state -->\nstuff', '46'), false);
    assert.strictEqual(ghBody.isStateComment('just a human comment', '46'), false);
    assert.strictEqual(ghBody.isStateComment('', '46'), false);
    assert.strictEqual(ghBody.isStateComment(null, '46'), false);
  });

  test('16c: isStateComment only trusts the first line', () => {
    const quoted = 'Someone pasted this:\n<!-- devflow:id=46 kind=state -->\nstuff';
    assert.strictEqual(ghBody.isStateComment(quoted, '46'), false);
    const legacyQuoted = 'Someone pasted this:\n<!-- df:state -->\nstuff';
    assert.strictEqual(ghBody.isStateComment(legacyQuoted, '46'), false);
  });

  test('16d: isStateComment tolerates CRLF from the REST API and compares canonical ids', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- devflow:id=46 kind=state -->\r\nstuff', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\r\nWave: 2', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- devflow:id=46 kind=state -->\nstuff', '046'), true);
  });

  test('16e: a state comment built by buildStateComment is recognised by isStateComment', () => {
    assert.strictEqual(ghBody.isStateComment(ghBody.buildStateComment('2.1', makeState({ number: '2.1' }), ISO), '2.1'), true);
  });
});

// ─── Task 1: lookup by marker ────────────────────────────────────────────────

describe('indexByMarker', () => {
  test('17: maps id to issue number and lists unmarked issues', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- devflow:id=2 -->\nfirst' },
      { number: 4, body: '<!-- devflow:id=2.1 -->' },
      { number: 5, body: 'none' },
    ]);
    assert.deepStrictEqual(r, { byId: { '2': 3, '2.1': 4 }, duplicates: {}, unmarked: [5] });
  });

  test('17b: two issues carrying the same id are reported, never picked', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- devflow:id=2 -->' },
      { number: 9, body: '<!-- devflow:id=2 -->\nmore' },
      { number: 4, body: '<!-- devflow:id=2.1 -->' },
    ]);
    assert.deepStrictEqual(r.duplicates, { '2': [3, 9] });
    assert.strictEqual('2' in r.byId, false);
    assert.strictEqual(r.byId['2.1'], 4);
  });

  test('17c: duplicate numbers are listed in ascending order regardless of input order', () => {
    const r = ghBody.indexByMarker([
      { number: 9, body: '<!-- devflow:id=2 -->' },
      { number: 3, body: '<!-- devflow:id=2 -->' },
    ]);
    assert.deepStrictEqual(r.duplicates, { '2': [3, 9] });
  });

  test('17d: the same issue appearing twice (page overlap) is not a duplicate', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- devflow:id=2 -->' },
      { number: 3, body: '<!-- devflow:id=2 -->' },
    ]);
    assert.deepStrictEqual(r, { byId: { '2': 3 }, duplicates: {}, unmarked: [] });
  });

  test('17e: comment-kind markers do not count as an issue-body marker', () => {
    const r = ghBody.indexByMarker([{ number: 7, body: '<!-- devflow:id=46 kind=state -->\nx' }]);
    assert.deepStrictEqual(r, { byId: {}, duplicates: {}, unmarked: [7] });
  });

  test('17f: keys are canonical ids, and null bodies or empty input are handled', () => {
    const r = ghBody.indexByMarker([
      { number: 11, body: '<!-- devflow:id=046 -->' },
      { number: 12, body: null },
    ]);
    assert.deepStrictEqual(r, { byId: { '46': 11 }, duplicates: {}, unmarked: [12] });
    assert.deepStrictEqual(ghBody.indexByMarker([]), { byId: {}, duplicates: {}, unmarked: [] });
    assert.deepStrictEqual(ghBody.indexByMarker(undefined), { byId: {}, duplicates: {}, unmarked: [] });
  });
});

describe('parseTitleNumber', () => {
  test('18: extracts and normalises the objective number from a title', () => {
    assert.strictEqual(ghBody.parseTitleNumber('[Objective 2.1] foo'), '2.1');
    assert.strictEqual(ghBody.parseTitleNumber('[Objective 046] x'), '46');
    assert.strictEqual(ghBody.parseTitleNumber('[Objective 46] GitHub sync foundations'), '46');
    assert.strictEqual(ghBody.parseTitleNumber('[Objective 0] zero'), '0');
    assert.strictEqual(ghBody.parseTitleNumber('[Objective 02.1] x'), '2.1');
  });

  test('18b: anything that is not an objective title is null', () => {
    assert.strictEqual(ghBody.parseTitleNumber('random'), null);
    assert.strictEqual(ghBody.parseTitleNumber('Objective 46 without brackets'), null);
    assert.strictEqual(ghBody.parseTitleNumber('  [Objective 46] leading space'), null);
    assert.strictEqual(ghBody.parseTitleNumber('[Objective .] broken'), null);
    assert.strictEqual(ghBody.parseTitleNumber(''), null);
    assert.strictEqual(ghBody.parseTitleNumber(null), null);
  });
});

// ─── Module purity ───────────────────────────────────────────────────────────

describe('module purity', () => {
  test('gh-body.cjs imports neither fs nor child_process nor gh-mapping', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-body.cjs'), 'utf8');
    assert.ok(!/require\(\s*['"](?:node:)?fs['"]\s*\)/.test(src), 'must not require fs');
    assert.ok(!/require\(\s*['"](?:node:)?child_process['"]\s*\)/.test(src), 'must not require child_process');
    assert.ok(!/require\(\s*['"]\.\/gh-mapping(?:\.cjs)?['"]\s*\)/.test(src), 'must stay dependency-free');
  });
});
