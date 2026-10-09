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
    assert.strictEqual(ghBody.markerLine('46'), '<!-- aoforge:id=46 -->');
    assert.strictEqual(ghBody.commentMarker('46', 'state'), '<!-- aoforge:id=46 kind=state -->');
  });

  test('1b: markerLine accepts decimal and TRD-form ids', () => {
    assert.strictEqual(ghBody.markerLine('2.1'), '<!-- aoforge:id=2.1 -->');
    assert.strictEqual(ghBody.markerLine('0'), '<!-- aoforge:id=0 -->');
    assert.strictEqual(ghBody.markerLine('46-02'), '<!-- aoforge:id=46-02 -->');
  });

  test('1c: markerLine writes the canonical id (leading zeros dropped)', () => {
    assert.strictEqual(ghBody.markerLine('046'), '<!-- aoforge:id=46 -->');
    assert.strictEqual(ghBody.markerLine('02.1'), '<!-- aoforge:id=2.1 -->');
    assert.strictEqual(ghBody.markerLine(46), '<!-- aoforge:id=46 -->');
  });

  test('1d: an id extractMarker could not read back is refused, not written', () => {
    assert.throws(() => ghBody.markerLine('not-an-id'), /invalid/i);
    assert.throws(() => ghBody.markerLine(''), /invalid/i);
    assert.throws(() => ghBody.commentMarker('46', 'Bad Kind'), /invalid/i);
  });

  test('2: extractMarker returns id and kind, null when there is no marker', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=2.1 -->\nfoo'), { id: '2.1', kind: null });
    assert.deepStrictEqual(
      ghBody.extractMarker('<!-- aoforge:id=46 kind=verification -->\nbody'),
      { id: '46', kind: 'verification' }
    );
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=46-02 -->'), { id: '46-02', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=0 -->'), { id: '0', kind: null });
    assert.strictEqual(ghBody.extractMarker('no marker here'), null);
    assert.strictEqual(ghBody.extractMarker(''), null);
    assert.strictEqual(ghBody.extractMarker(null), null);
    assert.strictEqual(ghBody.extractMarker(undefined), null);
  });

  test('2b: extractMarker tolerates extra whitespace inside the comment', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!--   aoforge:id=46   kind=state   -->'), { id: '46', kind: 'state' });
  });

  test('3: withCommentMarker prefixes the marker line', () => {
    assert.strictEqual(
      ghBody.withCommentMarker('46', 'comment', 'hello'),
      '<!-- aoforge:id=46 kind=comment -->\nhello'
    );
  });

  test('3b: withCommentMarker leaves a body that already carries a marker for the same id unchanged', () => {
    const already = '<!-- aoforge:id=46 kind=state -->\nhello';
    assert.strictEqual(ghBody.withCommentMarker('46', 'state', already), already);
    assert.strictEqual(ghBody.withCommentMarker('46', 'comment', already), already);
  });

  test('3c: withCommentMarker still prefixes when the existing marker belongs to another id', () => {
    const other = '<!-- aoforge:id=45 kind=state -->\nhello';
    const out = ghBody.withCommentMarker('46', 'state', other);
    assert.ok(out.startsWith('<!-- aoforge:id=46 kind=state -->\n'));
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
    assert.ok(s.footer.startsWith('_Tracked by [AOForge]('));
    assert.ok(s.footer.includes('`.aoforge/objectives/46-github-sync-foundations/`'));

    const viaDir = ghBody.buildObjectiveSections(makeState({ dir: '46-dir-name', objectiveId: '46-other' }));
    assert.ok(viaDir.footer.includes('`.aoforge/objectives/46-dir-name/`'));

    const viaObjectiveId = ghBody.buildObjectiveSections(makeState({ dir: undefined }));
    assert.ok(viaObjectiveId.footer.includes('`.aoforge/objectives/46-github-sync-foundations/`'));
  });

  test('4g2 (55-04): state.store swaps the footer for the store text; without the flag it is today\'s footer', () => {
    const storeFooter = ghBody.buildObjectiveSections({ ...makeState(), store: true }).footer;
    assert.strictEqual(
      storeFooter,
      '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude). ' +
        'This issue is the source of truth (store mode); `.aoforge/` in a checkout is a local cache rebuilt from it._'
    );
    assert.ok(!storeFooter.includes('in this repo'));
    assert.ok(!storeFooter.includes('.aoforge/objectives/'));

    // Mirror mode is byte-identical to the pre-55-04 footer, with the flag absent, false or any other value.
    const mirror = ghBody.buildObjectiveSections(makeState()).footer;
    assert.strictEqual(
      mirror,
      '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude). ' +
        'Source of truth: `.aoforge/objectives/46-github-sync-foundations/` in this repo._'
    );
    assert.strictEqual(ghBody.buildObjectiveSections({ ...makeState(), store: false }).footer, mirror);
    assert.strictEqual(ghBody.buildObjectiveSections({ ...makeState(), store: 'yes' }).footer, mirror);

    // Only the footer differs: the other three sections do not depend on the flag.
    const withStore = ghBody.buildObjectiveSections({ ...makeState(), store: true });
    const without = ghBody.buildObjectiveSections(makeState());
    for (const name of ['summary', 'criteria', 'trds']) assert.strictEqual(withStore[name], without[name], name);
  });

  test('4h: section content never carries managed-section markers of its own', () => {
    const s = ghBody.buildObjectiveSections(makeState());
    for (const name of ghBody.SECTION_ORDER) assert.ok(!s[name].includes('aoforge:begin'), name);
    for (const name of ghBody.SECTION_ORDER) assert.ok(!s[name].includes('aoforge:end'), name);
  });
});

// ─── Task 1: sticky state comment ────────────────────────────────────────────

describe('state comment', () => {
  const ISO = '2026-09-30T12:00:00Z';

  test('15: buildStateComment starts with the new marker and keeps the sticky content', () => {
    const out = ghBody.buildStateComment('46', makeState(), ISO);
    const lines = out.split('\n');
    assert.strictEqual(lines[0], '<!-- aoforge:id=46 kind=state -->');
    assert.deepStrictEqual(lines.slice(1), [
      '**AOForge state — last synced 2026-09-30T12:00:00Z**',
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
      '**AOForge state — last synced 2026-09-30T12:00:00Z**',
      '',
      '- Wave: 1',
      '- TRDs: 2/5',
      '- SUMMARY count: 2',
    ]);
  });

  test('16: isStateComment recognises the new marker and the legacy df:state marker', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- aoforge:id=46 kind=state -->\nstuff', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\nWave: 2', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\nWave: 2', '12'), true, 'legacy marker has no id');
  });

  test('16b: isStateComment rejects other kinds, other ids and unmarked bodies', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- aoforge:id=46 kind=verification -->\nstuff', '46'), false);
    assert.strictEqual(ghBody.isStateComment('<!-- aoforge:id=45 kind=state -->\nstuff', '46'), false);
    assert.strictEqual(ghBody.isStateComment('just a human comment', '46'), false);
    assert.strictEqual(ghBody.isStateComment('', '46'), false);
    assert.strictEqual(ghBody.isStateComment(null, '46'), false);
  });

  test('16c: isStateComment only trusts the first line', () => {
    const quoted = 'Someone pasted this:\n<!-- aoforge:id=46 kind=state -->\nstuff';
    assert.strictEqual(ghBody.isStateComment(quoted, '46'), false);
    const legacyQuoted = 'Someone pasted this:\n<!-- df:state -->\nstuff';
    assert.strictEqual(ghBody.isStateComment(legacyQuoted, '46'), false);
  });

  test('16d: isStateComment tolerates CRLF from the REST API and compares canonical ids', () => {
    assert.strictEqual(ghBody.isStateComment('<!-- aoforge:id=46 kind=state -->\r\nstuff', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- df:state -->\r\nWave: 2', '46'), true);
    assert.strictEqual(ghBody.isStateComment('<!-- aoforge:id=46 kind=state -->\nstuff', '046'), true);
  });

  test('16e: a state comment built by buildStateComment is recognised by isStateComment', () => {
    assert.strictEqual(ghBody.isStateComment(ghBody.buildStateComment('2.1', makeState({ number: '2.1' }), ISO), '2.1'), true);
  });
});

// ─── Task 1: lookup by marker ────────────────────────────────────────────────

describe('indexByMarker', () => {
  test('17: maps id to issue number and lists unmarked issues', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- aoforge:id=2 -->\nfirst' },
      { number: 4, body: '<!-- aoforge:id=2.1 -->' },
      { number: 5, body: 'none' },
    ]);
    assert.deepStrictEqual(r, { byId: { '2': 3, '2.1': 4 }, duplicates: {}, unmarked: [5] });
  });

  test('17b: two issues carrying the same id are reported, never picked', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- aoforge:id=2 -->' },
      { number: 9, body: '<!-- aoforge:id=2 -->\nmore' },
      { number: 4, body: '<!-- aoforge:id=2.1 -->' },
    ]);
    assert.deepStrictEqual(r.duplicates, { '2': [3, 9] });
    assert.strictEqual('2' in r.byId, false);
    assert.strictEqual(r.byId['2.1'], 4);
  });

  test('17c: duplicate numbers are listed in ascending order regardless of input order', () => {
    const r = ghBody.indexByMarker([
      { number: 9, body: '<!-- aoforge:id=2 -->' },
      { number: 3, body: '<!-- aoforge:id=2 -->' },
    ]);
    assert.deepStrictEqual(r.duplicates, { '2': [3, 9] });
  });

  test('17d: the same issue appearing twice (page overlap) is not a duplicate', () => {
    const r = ghBody.indexByMarker([
      { number: 3, body: '<!-- aoforge:id=2 -->' },
      { number: 3, body: '<!-- aoforge:id=2 -->' },
    ]);
    assert.deepStrictEqual(r, { byId: { '2': 3 }, duplicates: {}, unmarked: [] });
  });

  test('17e: comment-kind markers do not count as an issue-body marker', () => {
    const r = ghBody.indexByMarker([{ number: 7, body: '<!-- aoforge:id=46 kind=state -->\nx' }]);
    assert.deepStrictEqual(r, { byId: {}, duplicates: {}, unmarked: [7] });
  });

  test('17f: keys are canonical ids, and null bodies or empty input are handled', () => {
    const r = ghBody.indexByMarker([
      { number: 11, body: '<!-- aoforge:id=046 -->' },
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

// ─── Task 2: mergeManaged ────────────────────────────────────────────────────

const { mergeManaged, MAX_BODY_CHARS } = ghBody;

// Short section texts keep the expected bodies below readable byte for byte.
const SECTIONS = { summary: 'S1', criteria: 'C1', trds: 'T1', footer: 'F1' };

const FRESH =
  '<!-- aoforge:id=46 -->\n' +
  '<!-- aoforge:begin summary -->\nS1\n<!-- aoforge:end summary -->\n\n' +
  '<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->\n\n' +
  '<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->\n\n' +
  '<!-- aoforge:begin footer -->\nF1\n<!-- aoforge:end footer -->\n';

// A managed body with a human paragraph above, between and below the sections.
// The paragraphs carry trailing spaces, a tab and a missing final newline on
// purpose: nothing about them may be normalised.
const HUMAN_TOP = 'Reviewer note:  keep the trailing spaces  \n\tand this tab-indented line\n';
const HUMAN_MID = 'Design question: should the footer move?\n';
const HUMAN_BOTTOM = 'Human TODO after the footer (no trailing newline)';

function humanBody(status) {
  return (
    '<!-- aoforge:id=46 -->\n' +
    HUMAN_TOP +
    `<!-- aoforge:begin summary -->\n${status}\n<!-- aoforge:end summary -->\n\n` +
    '<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->\n' +
    HUMAN_MID +
    '<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->\n\n' +
    '<!-- aoforge:begin footer -->\nF1\n<!-- aoforge:end footer -->\n' +
    HUMAN_BOTTOM
  );
}

function withSummary(status) {
  return Object.assign({}, SECTIONS, { summary: status });
}

describe('mergeManaged', () => {
  test('5: an empty or missing body yields the marker and all four sections in order', () => {
    assert.deepStrictEqual(mergeManaged('', SECTIONS, '46'), { ok: true, body: FRESH, changed: true, warnings: [] });
    for (const empty of [null, undefined, '  \n\t\n']) {
      const r = mergeManaged(empty, SECTIONS, '46');
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.body, FRESH);
      assert.strictEqual(r.changed, true);
    }
  });

  test('5b: real objective sections land in SECTION_ORDER under the marker', () => {
    const r = mergeManaged(null, ghBody.buildObjectiveSections(makeState()), '46');
    assert.ok(r.body.startsWith('<!-- aoforge:id=46 -->\n<!-- aoforge:begin summary -->\n'));
    const at = ghBody.SECTION_ORDER.map((n) => r.body.indexOf(`<!-- aoforge:begin ${n} -->`));
    assert.ok(at.every((i) => i >= 0), 'every section present');
    assert.deepStrictEqual(at.slice().sort((a, b) => a - b), at, 'sections in order');
  });

  test('5c: sections the caller did not supply are skipped', () => {
    const r = mergeManaged('', { summary: 'S1' }, '46');
    assert.strictEqual(r.body, '<!-- aoforge:id=46 -->\n<!-- aoforge:begin summary -->\nS1\n<!-- aoforge:end summary -->\n');
  });

  test('6: new status text changes only the summary inner text', () => {
    const before = mergeManaged('', ghBody.buildObjectiveSections(makeState({ trd_done: 2 })), '46').body;
    const r = mergeManaged(before, ghBody.buildObjectiveSections(makeState({ trd_done: 3 })), '46');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.strictEqual(r.body, before.replace('2/5 TRDs done', '3/5 TRDs done'));
    assert.notStrictEqual(r.body, before);
  });

  test('7: human text above, between and below the sections survives two consecutive merges byte for byte', () => {
    const original = humanBody('status 0');
    const m1 = mergeManaged(original, withSummary('status 1'), '46');
    const m2 = mergeManaged(m1.body, withSummary('status 2'), '46');

    assert.strictEqual(m1.ok, true);
    assert.strictEqual(m2.ok, true);
    assert.strictEqual(m1.body, humanBody('status 1'));
    assert.strictEqual(m2.body, humanBody('status 2'));

    for (const merged of [m1.body, m2.body]) {
      for (const human of [HUMAN_TOP, HUMAN_MID, HUMAN_BOTTOM]) {
        assert.ok(merged.includes(human), `human text kept: ${JSON.stringify(human)}`);
        assert.strictEqual(merged.split(human).length, 2, 'and not duplicated');
      }
      const top = merged.indexOf(HUMAN_TOP);
      const summaryBegin = merged.indexOf('<!-- aoforge:begin summary -->');
      const criteriaEnd = merged.indexOf('<!-- aoforge:end criteria -->');
      const mid = merged.indexOf(HUMAN_MID);
      const trdsBegin = merged.indexOf('<!-- aoforge:begin trds -->');
      const footerEnd = merged.indexOf('<!-- aoforge:end footer -->');
      const bottom = merged.indexOf(HUMAN_BOTTOM);
      assert.ok(top < summaryBegin && summaryBegin < criteriaEnd && criteriaEnd < mid);
      assert.ok(mid < trdsBegin && trdsBegin < footerEnd && footerEnd < bottom);
    }

    const again = mergeManaged(m2.body, withSummary('status 2'), '46');
    assert.strictEqual(again.changed, false);
  });

  test('8: merging the same sections twice reports changed:false and an identical body', () => {
    const first = mergeManaged('', SECTIONS, '46');
    const second = mergeManaged(first.body, SECTIONS, '46');
    assert.strictEqual(first.changed, true);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.body, first.body);
    assert.deepStrictEqual(second.warnings, []);
  });

  test('8b: a managed body written by real sections is stable under a second merge', () => {
    const sections = ghBody.buildObjectiveSections(makeState());
    const first = mergeManaged('', sections, '46');
    const second = mergeManaged(first.body, sections, '46');
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.body, first.body);
  });

  test('9: a missing trds section is appended at the end and earlier content is untouched', () => {
    const existing =
      '<!-- aoforge:id=46 -->\n' +
      '<!-- aoforge:begin summary -->\nS0\n<!-- aoforge:end summary -->\n\n' +
      '<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->\n\n' +
      '<!-- aoforge:begin footer -->\nF1\n<!-- aoforge:end footer -->\n';
    const r = mergeManaged(existing, SECTIONS, '46');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.deepStrictEqual(r.warnings, []);
    assert.strictEqual(
      r.body,
      existing.replace('S0', 'S1') + '\n<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->'
    );
  });

  test('10: a malformed section (begin without end) gets a fresh pair, a warning, and keeps its text', () => {
    const existing =
      '<!-- aoforge:id=46 -->\n' +
      '<!-- aoforge:begin summary -->\nS1\n<!-- aoforge:end summary -->\n\n' +
      '<!-- aoforge:begin criteria -->\nhand-written criteria, no end marker\n\n' +
      '<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->\n\n' +
      '<!-- aoforge:begin footer -->\nF1\n<!-- aoforge:end footer -->\n';
    const r = mergeManaged(existing, SECTIONS, '46');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.deepStrictEqual(r.warnings, ['malformed section criteria']);
    assert.ok(r.body.startsWith(existing), 'original text retained in place');
    assert.strictEqual(
      r.body,
      existing + '\n<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->'
    );
  });

  test('10b: a dangling begin marker never widens the next merge into a pair that eats text', () => {
    const existing =
      '<!-- aoforge:id=46 -->\n' +
      '<!-- aoforge:begin criteria -->\nhand-written criteria, no end marker\n\n' +
      '<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->\n';
    const first = mergeManaged(existing, SECTIONS, '46');
    const second = mergeManaged(first.body, SECTIONS, '46');
    assert.ok(second.body.includes('hand-written criteria, no end marker'));
    assert.ok(second.body.includes('<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->'));
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.body, first.body);
  });

  test('10c: an end marker that precedes its begin is malformed too', () => {
    const existing =
      '<!-- aoforge:id=46 -->\n<!-- aoforge:end criteria -->\nstray\n<!-- aoforge:begin criteria -->\nopen-ended\n';
    const r = mergeManaged(existing, { criteria: 'C1' }, '46');
    assert.deepStrictEqual(r.warnings, ['malformed section criteria']);
    assert.ok(r.body.startsWith(existing));
    assert.ok(r.body.endsWith('<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->'));
  });

  test('11: a body whose marker names a different id is refused, not overwritten', () => {
    const existing = '<!-- aoforge:id=45 -->\nsomeone else\'s issue';
    const r = mergeManaged(existing, SECTIONS, '46');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'body marker aoforge:id=45 does not match 46');
    assert.strictEqual('body' in r, false);
  });

  test('11b: an invalid id is refused', () => {
    const r = mergeManaged('', SECTIONS, 'not-an-id');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /invalid/i);
  });

  test('12: a legacy body with no markers is kept whole and the managed sections are appended below it', () => {
    const LEGACY =
      '**Objective 46: GitHub sync foundations**\n\n' +
      '**Goal:** old goal\n\n' +
      '**Status:** 1/5 TRDs done, current wave 1, last commit none\n\n' +
      '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude)._';
    const r = mergeManaged(LEGACY, SECTIONS, '46');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.strictEqual(
      r.body,
      '<!-- aoforge:id=46 -->\n' +
        LEGACY +
        '\n\n<!-- aoforge:begin summary -->\nS1\n<!-- aoforge:end summary -->' +
        '\n\n<!-- aoforge:begin criteria -->\nC1\n<!-- aoforge:end criteria -->' +
        '\n\n<!-- aoforge:begin trds -->\nT1\n<!-- aoforge:end trds -->' +
        '\n\n<!-- aoforge:begin footer -->\nF1\n<!-- aoforge:end footer -->'
    );
    assert.strictEqual(r.body.split('\n')[0], '<!-- aoforge:id=46 -->');
  });

  test('12b: the legacy-migrated body is stable under a second merge', () => {
    const first = mergeManaged('**Objective 46: x**\n\nold text\n', SECTIONS, '46');
    const second = mergeManaged(first.body, SECTIONS, '46');
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.body, first.body);
  });

  test('13: a CRLF body equal to the LF merge output reports changed:false', () => {
    const crlf = FRESH.replace(/\n/g, '\r\n');
    const r = mergeManaged(crlf, SECTIONS, '46');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.body, crlf, 'an unchanged body comes back as the caller passed it');
  });

  test('13b: a changing merge on a CRLF body keeps the human CRLF bytes intact', () => {
    const crlf = humanBody('status 0').replace(/\n/g, '\r\n');
    const r = mergeManaged(crlf, withSummary('status 1'), '46');
    assert.strictEqual(r.changed, true);
    assert.strictEqual(r.body, humanBody('status 1').replace(/\n/g, '\r\n'));
    assert.ok(r.body.includes(HUMAN_TOP.replace(/\n/g, '\r\n')));
    assert.strictEqual(/(?<!\r)\n/.test(r.body), false, 'no bare LF introduced');
  });

  test('14: a merged body of 60,000 or more characters is refused', () => {
    assert.strictEqual(MAX_BODY_CHARS, 60000);
    const r = mergeManaged('x'.repeat(60000), SECTIONS, '46');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /60000/);
  });

  test('14b: the limit is on the merged body, human text included, and is exact', () => {
    const baseLength = mergeManaged('', SECTIONS, '46').body.length;
    const justUnder = mergeManaged('', withSummary('x'.repeat(MAX_BODY_CHARS - baseLength + 2 - 1)), '46');
    assert.strictEqual(justUnder.ok, true);
    assert.strictEqual(justUnder.body.length, MAX_BODY_CHARS - 1);
    const atLimit = mergeManaged('', withSummary('x'.repeat(MAX_BODY_CHARS - baseLength + 2)), '46');
    assert.strictEqual(atLimit.ok, false);
    assert.match(atLimit.error, /60000/);
  });

  test('15: only the first well-formed pair per name changes; a pasted second copy is left alone', () => {
    const pasted = '<!-- aoforge:begin summary -->\nhuman pasted this copy\n<!-- aoforge:end summary -->\n';
    const existing =
      '<!-- aoforge:id=46 -->\n' +
      '<!-- aoforge:begin summary -->\nS0\n<!-- aoforge:end summary -->\n' +
      pasted;
    const r = mergeManaged(existing, { summary: 'S1' }, '46');
    assert.strictEqual(r.body, '<!-- aoforge:id=46 -->\n<!-- aoforge:begin summary -->\nS1\n<!-- aoforge:end summary -->\n' + pasted);
    assert.deepStrictEqual(r.warnings, []);
  });

  test('15b: a marker a human moved off line 1 is honoured, not duplicated', () => {
    const existing = 'Intro from a human\n<!-- aoforge:id=46 -->\n';
    const r = mergeManaged(existing, { summary: 'S1' }, '46');
    assert.strictEqual(r.body.split('aoforge:id=46').length, 2);
    assert.ok(r.body.startsWith('Intro from a human\n'));
  });

  test('15c: a comment-kind marker in an issue body does not count as the issue marker', () => {
    const existing = '<!-- aoforge:id=45 kind=state -->\npasted from a comment\n';
    const r = mergeManaged(existing, { summary: 'S1' }, '46');
    assert.strictEqual(r.ok, true);
    assert.ok(r.body.startsWith('<!-- aoforge:id=46 -->\n<!-- aoforge:id=45 kind=state -->\n'));
  });

  test('15d: section content that contains a managed-section marker is refused', () => {
    for (const evil of ['a <!-- aoforge:end summary --> b', 'a <!-- aoforge:begin footer --> b']) {
      const r = mergeManaged('', { summary: evil }, '46');
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /summary/);
    }
  });

  test('15e: non-string section content is refused', () => {
    const r = mergeManaged('', { summary: 42 }, '46');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /summary/);
  });
});

// ─── 47: store sections ──────────────────────────────────────────────────────

describe('47 store sections', () => {
  const PAGE_URL = 'https://github.com/o/r/wiki/Objective-7-store-demo/1a2b3c4';
  const wikiArgs = (over) =>
    Object.assign(
      { dir: '07-store-demo', page: 'Objective-7-store-demo', url: PAGE_URL, sha: '1a2b3c4' },
      over || {}
    );
  const body46 = () =>
    ghBody.mergeManaged('', ghBody.buildObjectiveSections(makeState({ number: '7', name: 'Store demo' })), '7').body;
  const wikiBlock = (inner) => `<!-- aoforge:begin wiki -->\n${inner}\n<!-- aoforge:end wiki -->`;

  test('1: OPTIONAL_SECTIONS is wiki+meta and SECTION_ORDER is unchanged', () => {
    assert.deepStrictEqual(ghBody.OPTIONAL_SECTIONS, ['wiki', 'meta']);
    assert.deepStrictEqual(ghBody.SECTION_ORDER, ['summary', 'criteria', 'trds', 'footer']);
  });

  test('1b: the section builder output of 46 is unchanged (no wiki/meta unless a caller provides them)', () => {
    const sections = ghBody.buildObjectiveSections(makeState());
    assert.deepStrictEqual(Object.keys(sections), ['summary', 'criteria', 'trds', 'footer']);
    const merged = ghBody.mergeManaged('', sections, '46').body;
    assert.ok(!merged.includes('aoforge:begin wiki'));
    assert.ok(!merged.includes('aoforge:begin meta'));
  });

  test('2: a wiki section is appended at the end; human text and the four 46 sections stay byte-identical', () => {
    const original = body46() + '\nHuman notes live down here.\n';
    const wiki = ghBody.buildWikiSection(wikiArgs());
    const r = ghBody.mergeManaged(original, { wiki }, '7');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.deepStrictEqual(r.warnings, []);
    assert.ok(r.body.startsWith(original), 'everything that was there is untouched, in place');
    assert.strictEqual(r.body, `${original}\n${wikiBlock(wiki)}`);
  });

  test('2b: wiki and meta both ride on a fresh body, after the four 46 sections', () => {
    const sections = Object.assign(ghBody.buildObjectiveSections(makeState({ number: '7' })), {
      wiki: ghBody.buildWikiSection(wikiArgs()),
      meta: ghBody.buildMetaSection({ type: 'Objective' }),
    });
    const r = ghBody.mergeManaged('', sections, '7');
    assert.strictEqual(r.ok, true);
    const at = ['summary', 'criteria', 'trds', 'footer', 'wiki', 'meta'].map((n) => r.body.indexOf(`<!-- aoforge:begin ${n} -->`));
    assert.ok(at.every((i) => i >= 0));
    assert.deepStrictEqual(at.slice().sort((a, b) => a - b), at, 'sections in order');
  });

  test('3: a new sha changes only the wiki inner text; an identical merge is changed:false', () => {
    const first = ghBody.mergeManaged(body46(), { wiki: ghBody.buildWikiSection(wikiArgs()) }, '7');
    const next = ghBody.buildWikiSection(
      wikiArgs({ sha: 'def5678', url: PAGE_URL.replace('1a2b3c4', 'def5678') })
    );
    const second = ghBody.mergeManaged(first.body, { wiki: next }, '7');
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.changed, true);
    assert.strictEqual(second.body, first.body.split('1a2b3c4').join('def5678'));
    assert.ok(second.body.startsWith(body46()), 'the 46 part of the body did not move');

    const third = ghBody.mergeManaged(second.body, { wiki: next }, '7');
    assert.strictEqual(third.changed, false);
    assert.strictEqual(third.body, second.body);
  });

  test('3b: the wiki section is exactly the dir marker line plus a pinned-revision link', () => {
    assert.strictEqual(
      ghBody.buildWikiSection(wikiArgs()),
      '<!-- aoforge:dir=07-store-demo -->\n' +
        'Detail: [Objective-7-store-demo](https://github.com/o/r/wiki/Objective-7-store-demo/1a2b3c4) (revision `1a2b3c4`)'
    );
  });

  test('3c: buildWikiSection refuses a dir, page, url or sha that would not round-trip safely', () => {
    for (const bad of [
      { dir: '' },
      { dir: '../x' },
      { dir: 'a/b' },
      { dir: 'a b' },
      { dir: '07-x -->' },
      { dir: 'a..b' },
      { page: '' },
      { page: 'two words' },
      { page: 'bad]name' },
      { url: 'javascript:alert(1)' },
      { url: 'https://x/y z' },
      { url: 'https://x/y)' },
      { sha: 'xyz' },
      { sha: '' },
    ]) {
      assert.throws(() => ghBody.buildWikiSection(wikiArgs(bad)), TypeError, JSON.stringify(bad));
    }
    assert.throws(() => ghBody.buildWikiSection(), TypeError);
  });

  test('4: parseDirMarker reads the dir back from a merged body, and is null without a wiki section', () => {
    const merged = ghBody.mergeManaged(body46(), { wiki: ghBody.buildWikiSection(wikiArgs()) }, '7').body;
    assert.strictEqual(ghBody.parseDirMarker(merged), '07-store-demo');
    assert.strictEqual(ghBody.parseDirMarker(body46()), null);
    assert.strictEqual(ghBody.parseDirMarker(''), null);
    assert.strictEqual(ghBody.parseDirMarker(null), null);
    assert.strictEqual(ghBody.parseDirMarker(undefined), null);
  });

  test('4b: a dir marker a human pasted outside the wiki section does not count', () => {
    const body = '<!-- aoforge:id=7 -->\n<!-- aoforge:dir=07-pasted -->\nhuman\n';
    assert.strictEqual(ghBody.parseDirMarker(body), null);
  });

  test('4c: an unsafe dir on GitHub is refused on read (it would become a cache path)', () => {
    for (const evil of ['../etc', 'a/b', '/abs', '..', '.hidden-ok-no', 'a b']) {
      const body = `<!-- aoforge:id=7 -->\n${wikiBlock(`<!-- aoforge:dir=${evil} -->\nDetail: x`)}\n`;
      assert.strictEqual(ghBody.parseDirMarker(body), null, evil);
    }
  });

  test('4d: parseDirMarker works on a CRLF body', () => {
    const merged = ghBody.mergeManaged(body46(), { wiki: ghBody.buildWikiSection(wikiArgs()) }, '7').body;
    assert.strictEqual(ghBody.parseDirMarker(merged.replace(/\n/g, '\r\n')), '07-store-demo');
  });

  test('5: buildMetaSection and parseMeta round-trip; missing keys are omitted', () => {
    const text = ghBody.buildMetaSection({ type: 'Objective', work: 'feature', kind: 'plugin' });
    assert.strictEqual(text, 'type: Objective\nwork: feature\nkind: plugin');
    const merged = ghBody.mergeManaged(body46(), { meta: text }, '7').body;
    assert.deepStrictEqual(ghBody.parseMeta(ghBody.extractSection(merged, 'meta')), {
      type: 'Objective',
      work: 'feature',
      kind: 'plugin',
    });

    assert.strictEqual(ghBody.buildMetaSection({ type: 'TRD' }), 'type: TRD');
    assert.strictEqual(ghBody.buildMetaSection({ work: 'bugfix', kind: '' }), 'work: bugfix');
    assert.strictEqual(ghBody.buildMetaSection({}), '');
    assert.deepStrictEqual(ghBody.parseMeta('type: TRD'), { type: 'TRD' });
  });

  test('5b: parseMeta ignores unknown keys and tolerates null', () => {
    assert.deepStrictEqual(ghBody.parseMeta('type: Objective\nowner: nobody\nnot a pair\nkind:   cli  '), {
      type: 'Objective',
      kind: 'cli',
    });
    assert.deepStrictEqual(ghBody.parseMeta(null), {});
    assert.deepStrictEqual(ghBody.parseMeta(''), {});
  });

  test('5c: buildMetaSection refuses a multi-line value', () => {
    assert.throws(() => ghBody.buildMetaSection({ type: 'a\nb' }), TypeError);
    assert.throws(() => ghBody.buildMetaSection({ kind: 7 }), TypeError);
  });

  test('6: extractSection returns the inner text, null when missing or malformed', () => {
    const body = ghBody.mergeManaged('', { summary: 'S1', criteria: 'C1\nC2' }, '7').body;
    assert.strictEqual(ghBody.extractSection(body, 'summary'), 'S1');
    assert.strictEqual(ghBody.extractSection(body, 'criteria'), 'C1\nC2');
    assert.strictEqual(ghBody.extractSection(body, 'footer'), null);
    assert.strictEqual(ghBody.extractSection('<!-- aoforge:begin footer -->\nno end', 'footer'), null);
    assert.strictEqual(ghBody.extractSection('', 'summary'), null);
    assert.strictEqual(ghBody.extractSection(null, 'summary'), null);
    assert.strictEqual(ghBody.extractSection(body.replace(/\n/g, '\r\n'), 'criteria'), 'C1\nC2');
  });

  test('6b: extractSection returns an empty string for an empty section', () => {
    const body = ghBody.mergeManaged('', { meta: '' }, '7').body;
    assert.strictEqual(ghBody.extractSection(body, 'meta'), '');
  });

  test('7: preserveTicks keeps a tick the verifier set; without it the 46 behaviour (untick) stays', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [x] a works\n- [ ] b works' }, '7').body;
    const fresh = { criteria: '- [ ] a works\n- [ ] b works\n- [ ] c new' };

    const kept = ghBody.mergeManaged(existing, fresh, '7', { preserveTicks: true });
    assert.strictEqual(kept.ok, true);
    assert.strictEqual(ghBody.extractSection(kept.body, 'criteria'), '- [x] a works\n- [ ] b works\n- [ ] c new');

    const dropped = ghBody.mergeManaged(existing, fresh, '7');
    assert.strictEqual(ghBody.extractSection(dropped.body, 'criteria'), fresh.criteria);
    const dropped2 = ghBody.mergeManaged(existing, fresh, '7', { preserveTicks: false });
    assert.strictEqual(dropped2.body, dropped.body);
  });

  test('7b: preserveTicks is idempotent: the same push again is changed:false', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [x] a works\n- [ ] b works' }, '7').body;
    const fresh = { criteria: '- [ ] a works\n- [ ] b works' };
    const r = ghBody.mergeManaged(existing, fresh, '7', { preserveTicks: true });
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.body, existing);
  });

  test('7c: preserveTicks never touches other sections and does nothing on a fresh body', () => {
    const fresh = { summary: 'S1', criteria: '- [ ] a works', trds: '- [ ] 7-01' };
    const first = ghBody.mergeManaged('', fresh, '7', { preserveTicks: true });
    assert.strictEqual(ghBody.extractSection(first.body, 'criteria'), '- [ ] a works');
    const ticked = first.body.replace('- [ ] a works', '- [x] a works').replace('- [ ] 7-01', '- [x] 7-01');
    const again = ghBody.mergeManaged(ticked, fresh, '7', { preserveTicks: true });
    assert.strictEqual(ghBody.extractSection(again.body, 'criteria'), '- [x] a works');
    assert.strictEqual(ghBody.extractSection(again.body, 'trds'), '- [ ] 7-01', 'only criteria preserves ticks');
  });

  test('7d: a criterion the new content already ticked stays ticked', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [ ] a works' }, '7').body;
    const r = ghBody.mergeManaged(existing, { criteria: '- [x] a works' }, '7', { preserveTicks: true });
    assert.strictEqual(ghBody.extractSection(r.body, 'criteria'), '- [x] a works');
  });

  test('8: preserveTicks matches by text with whitespace collapsed, not by position', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [x]  a   works\n- [ ] z last' }, '7').body;
    const fresh = { criteria: '- [ ] z last\n- [ ] a works' };
    const r = ghBody.mergeManaged(existing, fresh, '7', { preserveTicks: true });
    assert.strictEqual(ghBody.extractSection(r.body, 'criteria'), '- [ ] z last\n- [x] a works');
  });

  test('8b: preserveTicks accepts an upper-case [X] and a prefixed 46-style line', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [X] SC-1: Re-running sync creates no duplicates' }, '7').body;
    const fresh = { criteria: '- [ ] SC-1: Re-running sync creates no duplicates' };
    const r = ghBody.mergeManaged(existing, fresh, '7', { preserveTicks: true });
    assert.strictEqual(ghBody.extractSection(r.body, 'criteria'), '- [x] SC-1: Re-running sync creates no duplicates');
  });

  test('8c: preserveTicks on a CRLF body keeps CRLF and the tick', () => {
    const existing = ghBody.mergeManaged('', { criteria: '- [x] a works' }, '7').body.replace(/\n/g, '\r\n');
    const r = ghBody.mergeManaged(existing, { criteria: '- [ ] a works' }, '7', { preserveTicks: true });
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.body, existing);
  });

  test('9: buildTrdsSection native mode is a one-line count', () => {
    const trds = [
      { id: '7-01', number: 12, title: 'alpha', done: false },
      { id: '7-02', number: 13, title: 'beta', done: true },
      { id: '7-03', number: 14, title: 'gamma', done: false },
    ];
    assert.strictEqual(ghBody.buildTrdsSection({ mode: 'native', trds }), '3 TRDs, tracked as sub-issues.');
    assert.strictEqual(ghBody.buildTrdsSection({ mode: 'native', trds: trds.slice(0, 1) }), '1 TRD, tracked as sub-issues.');
    assert.strictEqual(ghBody.buildTrdsSection({ mode: 'native', trds: [] }), '_None yet._');
  });

  test('9b: buildTrdsSection tasklist mode renders a sorted task list, ticked when closed', () => {
    const trds = [
      { id: '7-10', number: 21, title: 'ten', done: false },
      { id: '7-02', number: 13, title: 'beta', done: true },
      { id: '7-01', number: 12, title: 'alpha', done: false },
    ];
    assert.strictEqual(
      ghBody.buildTrdsSection({ mode: 'tasklist', trds }),
      '- [ ] #12 7-01 alpha\n- [x] #13 7-02 beta\n- [ ] #21 7-10 ten'
    );
    assert.strictEqual(ghBody.buildTrdsSection({ mode: 'tasklist', trds: [{ id: '7-01', number: 5 }] }), '- [ ] #5 7-01');
    assert.strictEqual(ghBody.buildTrdsSection({ mode: 'tasklist', trds: [] }), '_None yet._');
  });

  test('9c: buildTrdsSection refuses an unknown mode and a tasklist item without an issue number', () => {
    assert.throws(() => ghBody.buildTrdsSection({ mode: 'weird', trds: [] }), TypeError);
    assert.throws(() => ghBody.buildTrdsSection({ trds: [] }), TypeError);
    assert.throws(() => ghBody.buildTrdsSection({ mode: 'tasklist', trds: [{ id: '7-01', title: 'x' }] }), TypeError);
    assert.throws(() => ghBody.buildTrdsSection({ mode: 'tasklist', trds: [{ id: '7-01', number: 0 }] }), TypeError);
  });

  test('9d: a trds section merges like any other and is stable', () => {
    const trds = [{ id: '7-01', number: 12, title: 'alpha', done: false }];
    const sections = { trds: ghBody.buildTrdsSection({ mode: 'tasklist', trds }) };
    const first = ghBody.mergeManaged('', sections, '7');
    const second = ghBody.mergeManaged(first.body, sections, '7');
    assert.strictEqual(second.changed, false);
  });
});

// ─── 47: Decision-form ids and multi-part comment lookup ─────────────────────

describe('47 decision ids and comment lookup', () => {
  const comment = (id, markerId, kind, part, text) => ({
    id,
    body: `${ghBody.commentMarker(markerId, kind)}\n${part ? `<!-- aoforge:part=${part} -->\n` : ''}${text || 'text'}`,
  });

  test('10: the Decision id form 47-01-d1 is a valid marker id', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=47-01-d1 -->'), { id: '47-01-d1', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=47-01-d12 kind=spec -->'), {
      id: '47-01-d12',
      kind: 'spec',
    });
    assert.strictEqual(ghBody.markerLine('47-01-d1'), '<!-- aoforge:id=47-01-d1 -->');
    assert.strictEqual(ghBody.commentMarker('47-01-d1', 'decision'), '<!-- aoforge:id=47-01-d1 kind=decision -->');
  });

  test('10b: leading zeros on the objective part are dropped from a Decision id; the TRD part is kept', () => {
    assert.strictEqual(ghBody.markerLine('047-01-d1'), '<!-- aoforge:id=47-01-d1 -->');
    assert.strictEqual(ghBody.markerLine('07-01-d2'), '<!-- aoforge:id=7-01-d2 -->');
    assert.strictEqual(ghBody.markerLine('2.1-03-d4'), '<!-- aoforge:id=2.1-03-d4 -->');
  });

  test('10c: ids that are not a Decision form are still invalid', () => {
    for (const bad of ['47-d1', '47-01-d', '47-01-d1-2', '47-01-dx', '47-01d1', '47-01-D1', '47.-01-d1']) {
      assert.throws(() => ghBody.markerLine(bad), TypeError, bad);
      assert.strictEqual(ghBody.extractMarker(`<!-- aoforge:id=${bad} -->`), null, bad);
    }
  });

  test('10d: a Decision-id body merges, and a marker for a different Decision is refused', () => {
    const r = ghBody.mergeManaged('', { summary: 'S1' }, '47-01-d1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.body.split('\n')[0], '<!-- aoforge:id=47-01-d1 -->');
    const again = ghBody.mergeManaged(r.body, { summary: 'S1' }, '047-01-d1');
    assert.strictEqual(again.changed, false);
    const other = ghBody.mergeManaged(r.body, { summary: 'S1' }, '47-01-d2');
    assert.strictEqual(other.ok, false);
    assert.match(other.error, /does not match/);
  });

  test('10e: all the 46 marker forms still parse', () => {
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=46 -->'), { id: '46', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=2.1 -->'), { id: '2.1', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=46-02 -->'), { id: '46-02', kind: null });
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=46 kind=state -->'), { id: '46', kind: 'state' });
  });

  test('11: extractMarker ignores the dir and file markers (they have no id=)', () => {
    assert.strictEqual(ghBody.extractMarker('<!-- aoforge:dir=x -->'), null);
    assert.strictEqual(ghBody.extractMarker('<!-- aoforge:file=y -->'), null);
    assert.strictEqual(ghBody.extractMarker('<!-- aoforge:dir=07-store-demo -->\n<!-- aoforge:file=07-01-TRD.md -->'), null);
    assert.deepStrictEqual(
      ghBody.extractMarker('<!-- aoforge:dir=x -->\n<!-- aoforge:id=7 -->\n<!-- aoforge:file=y -->'),
      { id: '7', kind: null }
    );
  });

  test('12: findCommentsByMarker returns every part comment in part order, even if given 2/2 before 1/2', () => {
    const c2 = comment(902, '07-01', 'summary', '2/2', 'second half');
    const c1 = comment(901, '07-01', 'summary', '1/2', 'first half');
    const otherId = comment(5, '07-02', 'summary', '1/1');
    const otherKind = comment(6, '07-01', 'verification', '1/1');
    const human = { id: 7, body: 'LGTM' };
    const issueMarker = { id: 8, body: '<!-- aoforge:id=7-01 -->\nnot a comment kind' };
    const found = ghBody.findCommentsByMarker([c2, otherId, human, c1, otherKind, issueMarker], '07-01', 'summary');
    assert.deepStrictEqual(found, [
      { comment: c1, part: 1, of: 2 },
      { comment: c2, part: 2, of: 2 },
    ]);
  });

  test('12b: the id is compared canonically and part order is numeric (10 after 9, not after 1)', () => {
    const parts = [];
    for (let i = 12; i >= 1; i--) parts.push(comment(1000 + i, '7-01', 'spec', `${i}/12`));
    const found = ghBody.findCommentsByMarker(parts, '007-01', 'spec');
    assert.deepStrictEqual(
      found.map((f) => f.part),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    );
    assert.ok(found.every((f) => f.of === 12));
  });

  test('12c: a comment without a part marker is part 1 of 1; ties break by comment id', () => {
    const a = comment(30, '7-01', 'summary');
    const b = comment(20, '7-01', 'summary');
    const found = ghBody.findCommentsByMarker([a, b], '7-01', 'summary');
    assert.deepStrictEqual(found, [
      { comment: b, part: 1, of: 1 },
      { comment: a, part: 1, of: 1 },
    ]);
  });

  test('12d: the part marker is only read from the line after the marker; a malformed one counts as part 1', () => {
    const late = { id: 1, body: `${ghBody.commentMarker('7-01', 'summary')}\ntext\n<!-- aoforge:part=2/2 -->` };
    const zero = comment(2, '7-01', 'summary', '0/2');
    const over = comment(3, '7-01', 'summary', '3/2');
    const found = ghBody.findCommentsByMarker([late, zero, over], '7-01', 'summary');
    assert.deepStrictEqual(
      found.map((f) => [f.comment.id, f.part, f.of]),
      [
        [1, 1, 1],
        [2, 1, 1],
        [3, 1, 1],
      ]
    );
  });

  test('12e: CRLF comment bodies are read', () => {
    const c2 = { id: 2, body: comment(2, '7-01', 'summary', '2/2').body.replace(/\n/g, '\r\n') };
    const c1 = { id: 1, body: comment(1, '7-01', 'summary', '1/2').body.replace(/\n/g, '\r\n') };
    const found = ghBody.findCommentsByMarker([c2, c1], '7-01', 'summary');
    assert.deepStrictEqual(
      found.map((f) => [f.comment.id, f.part, f.of]),
      [
        [1, 1, 2],
        [2, 2, 2],
      ]
    );
  });

  test('12f: a Decision-form id finds its own comments and not the TRD\'s', () => {
    const trd = comment(1, '47-01', 'summary');
    const dec = comment(2, '47-01-d1', 'summary');
    assert.deepStrictEqual(ghBody.findCommentsByMarker([trd, dec], '47-01-d1', 'summary'), [
      { comment: dec, part: 1, of: 1 },
    ]);
    assert.deepStrictEqual(ghBody.findCommentsByMarker([trd, dec], '47-01', 'summary'), [
      { comment: trd, part: 1, of: 1 },
    ]);
  });

  test('12g: no match, a non-array and missing bodies give []; an invalid id or kind is a TypeError', () => {
    assert.deepStrictEqual(ghBody.findCommentsByMarker([], '7-01', 'summary'), []);
    assert.deepStrictEqual(ghBody.findCommentsByMarker(null, '7-01', 'summary'), []);
    assert.deepStrictEqual(ghBody.findCommentsByMarker([null, { id: 1 }, { id: 2, body: 5 }], '7-01', 'summary'), []);
    assert.throws(() => ghBody.findCommentsByMarker([], 'nope', 'summary'), TypeError);
    assert.throws(() => ghBody.findCommentsByMarker([], '7-01', 'Not Valid'), TypeError);
  });

  test('12h: with no kind, every comment-kind marker for the id matches (issue-body markers still do not)', () => {
    const s = comment(1, '7-01', 'summary');
    const v = comment(2, '7-01', 'verification');
    const issue = { id: 3, body: '<!-- aoforge:id=7-01 -->\nbody' };
    const found = ghBody.findCommentsByMarker([v, issue, s], '7-01');
    assert.deepStrictEqual(
      found.map((f) => f.comment.id),
      [1, 2]
    );
  });
});

// ─── Module purity───────────────────────────────────────────────────────────

describe('module purity', () => {
  test('gh-body.cjs imports neither fs nor child_process nor gh-mapping', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-body.cjs'), 'utf8');
    assert.ok(!/require\(\s*['"](?:node:)?fs['"]\s*\)/.test(src), 'must not require fs');
    assert.ok(!/require\(\s*['"](?:node:)?child_process['"]\s*\)/.test(src), 'must not require child_process');
    assert.ok(!/require\(\s*['"]\.\/gh-mapping(?:\.cjs)?['"]\s*\)/.test(src), 'must stay dependency-free');
  });
});

// ─── 48-06: entity markers (todo / debug / quick issues) ─────────────────────

describe('48-06 entity markers', () => {
  const trdLib = require('./gh-trd.cjs');

  test('E1. an entity id is a marker id with exactly one spelling', () => {
    assert.strictEqual(ghBody.markerLine('todo-2026-07-31-a'), '<!-- aoforge:id=todo-2026-07-31-a -->');
    assert.strictEqual(ghBody.commentMarker('quick-12', 'summary'), '<!-- aoforge:id=quick-12 kind=summary -->');
    assert.strictEqual(ghBody.commentMarker('debug-x', 'answer'), '<!-- aoforge:id=debug-x kind=answer -->');
    for (const bad of [' todo-a', 'Todo-a', 'todo-', 'quick-x', 'todo-a b', 'note-a']) {
      assert.throws(() => ghBody.markerLine(bad), TypeError, bad);
    }
  });

  test('E2. indexByMarker, findCommentsByMarker and extractMarker read entity markers', () => {
    const body = trdLib.encodeEntityBody({ id: 'todo-a', file: 'todos/pending/a.md', text: 'x\n' });
    const idx = ghBody.indexByMarker([
      { number: 3, body }, { number: 4, body: '<!-- aoforge:id=quick-12 -->\nq' }, { number: 5, body: 'human text' },
    ]);
    assert.deepStrictEqual(idx, { byId: { 'todo-a': 3, 'quick-12': 4 }, duplicates: {}, unmarked: [5] });
    const comments = [
      { id: 1, body: `${ghBody.commentMarker('quick-12', 'summary')}\ndone` },
      { id: 2, body: '<!-- aoforge:id=12 kind=summary -->\nanother issue' },
    ];
    assert.deepStrictEqual(ghBody.findCommentsByMarker(comments, 'quick-12', 'summary').map((f) => f.comment.id), [1]);
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=debug-x kind=answer -->\ntext'), { id: 'debug-x', kind: 'answer' });
  });

  test('E3. the entity grammar is gh-trd ENTITY_ID_RE (duplicated so gh-body stays dependency-free)', () => {
    assert.strictEqual(new RegExp(`^${ghBody.ENTITY_ID_SOURCE}$`).source, trdLib.ENTITY_ID_RE.source);
  });

  test('E4. numeric ids are unchanged (leading zeros dropped, TRD and Decision forms kept)', () => {
    assert.strictEqual(ghBody.markerLine('046'), '<!-- aoforge:id=46 -->');
    assert.strictEqual(ghBody.markerLine('7-01-d1'), '<!-- aoforge:id=7-01-d1 -->');
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:id=07-02 -->'), { id: '7-02', kind: null });
  });
});

// ─── 49-05: the objective PR body ────────────────────────────────────────────

describe('49-05 PR body sections', () => {
  const WIKI = {
    dir: '49-demo', page: 'Objective-49-demo', url: 'https://github.com/o/r/wiki/Objective-49-demo/abc1234', sha: 'abc1234',
  };
  const PR_OPTS = { order: ghBody.PR_SECTION_ORDER, marker: 'pr' };
  const prSections = () => ({
    closes: ghBody.closesSection([120, 121, 122]),
    wiki: ghBody.buildWikiSection(WIKI),
    summary: 'Adds the PR lifecycle.',
  });

  test('1. closesSection is one Closes line per issue, in the order given', () => {
    assert.strictEqual(ghBody.closesSection([120, 121, 122]), 'Closes #120\nCloses #121\nCloses #122');
    assert.strictEqual(ghBody.closesSection([5]), 'Closes #5');
    assert.strictEqual(ghBody.closesSection([7, 3, 7]), 'Closes #7\nCloses #3', 'a number is named once');
    for (const bad of [[], 'Closes #1', [0], [-1], [1.5], ['12'], [null], undefined]) {
      assert.throws(() => ghBody.closesSection(bad), TypeError, JSON.stringify(bad));
    }
  });

  test('1. prMarker is aoforge:pr=<objective id>, never aoforge:id=, and only for an objective id', () => {
    assert.strictEqual(ghBody.prMarker('49'), '<!-- aoforge:pr=49 -->');
    assert.strictEqual(ghBody.prMarker('049'), '<!-- aoforge:pr=49 -->');
    assert.strictEqual(ghBody.prMarker(2.1), '<!-- aoforge:pr=2.1 -->');
    for (const bad of ['49-01', '49-01-d1', 'todo-a', '', 'x', null]) {
      assert.throws(() => ghBody.prMarker(bad), TypeError, String(bad));
    }
  });

  test('1. PR_SECTION_ORDER is closes, wiki, summary', () => {
    assert.deepStrictEqual([...ghBody.PR_SECTION_ORDER], ['closes', 'wiki', 'summary']);
  });

  test('1. buildPrBody opens with the PR marker and renders the sections in PR order', () => {
    const body = ghBody.buildPrBody({ id: '49', sections: { summary: 'S', closes: 'Closes #1', wiki: 'W' } });
    assert.ok(body.startsWith('<!-- aoforge:pr=49 -->\n'), body);
    assert.ok(!body.includes('aoforge:id='), 'never an id marker');
    assert.deepStrictEqual(
      [...body.matchAll(/<!-- aoforge:begin (\w+) -->/g)].map((m) => m[1]),
      ['closes', 'wiki', 'summary'],
    );
    assert.strictEqual(
      ghBody.buildPrBody({ id: '49', sections: { closes: 'Closes #1' } }),
      '<!-- aoforge:pr=49 -->\n<!-- aoforge:begin closes -->\nCloses #1\n<!-- aoforge:end closes -->\n',
    );
    assert.throws(() => ghBody.buildPrBody({ id: '49-01', sections: {} }), TypeError);
  });

  test('1. mergeManaged with PR sections keeps a human paragraph above and below', () => {
    const first = ghBody.buildPrBody({ id: '49', sections: { closes: 'Closes #120\nCloses #121' } });
    const edited = first.replace('<!-- aoforge:pr=49 -->\n', '<!-- aoforge:pr=49 -->\nHuman intro.\n\n').trimEnd() + '\n\nHuman outro.\n';
    const r = ghBody.mergeManaged(edited, { closes: ghBody.closesSection([120, 121, 122]), summary: 'New summary.' }, '49', PR_OPTS);
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.changed, true);
    assert.ok(r.body.startsWith('<!-- aoforge:pr=49 -->\nHuman intro.\n'), r.body);
    assert.ok(r.body.includes('Closes #120\nCloses #121\nCloses #122'));
    assert.ok(r.body.includes('Human outro.'));
    assert.ok(r.body.indexOf('Human outro.') < r.body.indexOf('aoforge:begin summary'), 'a new section is appended after the human text');
    assert.ok(r.body.includes('<!-- aoforge:begin summary -->\nNew summary.\n<!-- aoforge:end summary -->'));
  });

  test('1a. a PR body round-trips: merging its own output is identical and closes is kept', () => {
    const sections = prSections();
    const body = ghBody.buildPrBody({ id: '49', sections });
    const r = ghBody.mergeManaged(body, sections, '49', PR_OPTS);
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.body, body);
    assert.ok(r.body.includes('<!-- aoforge:begin closes -->'));
    assert.deepStrictEqual(ghBody.extractSection(body, 'closes'), 'Closes #120\nCloses #121\nCloses #122');
  });

  test('1a. the same PR body merged without options is refused, as is a PR marker for another objective', () => {
    const sections = prSections();
    const body = ghBody.buildPrBody({ id: '49', sections });
    const plain = ghBody.mergeManaged(body, { summary: 'S' }, '49');
    assert.strictEqual(plain.ok, false);
    assert.match(plain.error, /does not match/);
    assert.match(plain.error, /aoforge:pr=49/);

    const other = ghBody.mergeManaged(body.replace('aoforge:pr=49', 'aoforge:pr=50'), sections, '49', PR_OPTS);
    assert.strictEqual(other.ok, false);
    assert.match(other.error, /aoforge:pr=50/);
    assert.match(other.error, /does not match/);
  });

  test('1a. a PR merge refuses a body carrying an issue marker, and a bad option', () => {
    const issueBody = ghBody.mergeManaged('', { summary: 'S' }, '49').body;
    const r = ghBody.mergeManaged(issueBody, { summary: 'S' }, '49', PR_OPTS);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /aoforge:id=49/);
    assert.match(r.error, /does not match/);
    assert.strictEqual(ghBody.mergeManaged('', {}, '49', { marker: 'weird' }).ok, false);
    assert.strictEqual(ghBody.mergeManaged('', {}, '49', { order: 'closes' }).ok, false);
  });

  test('1a. a human PR description with no marker keeps its text whole and gains the PR marker', () => {
    const r = ghBody.mergeManaged('Please review.\n', { closes: 'Closes #1' }, '49', PR_OPTS);
    assert.strictEqual(r.ok, true, r.error);
    assert.ok(r.body.startsWith('<!-- aoforge:pr=49 -->\nPlease review.\n'), r.body);
    assert.ok(!r.body.includes('aoforge:id='));
  });

  test('1b. mergeManaged with no options is byte-identical to before (objective order, id marker)', () => {
    const r = ghBody.mergeManaged('', { summary: 'S', criteria: '- [ ] a', trds: 'T', footer: 'F' }, '49');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(
      r.body,
      '<!-- aoforge:id=49 -->\n'
      + '<!-- aoforge:begin summary -->\nS\n<!-- aoforge:end summary -->\n\n'
      + '<!-- aoforge:begin criteria -->\n- [ ] a\n<!-- aoforge:end criteria -->\n\n'
      + '<!-- aoforge:begin trds -->\nT\n<!-- aoforge:end trds -->\n\n'
      + '<!-- aoforge:begin footer -->\nF\n<!-- aoforge:end footer -->\n',
    );
    const ignored = ghBody.mergeManaged('', { closes: 'Closes #1', summary: 'S' }, '49');
    assert.ok(!ignored.body.includes('closes'), 'closes is a PR section: the objective order does not write it');
    const mismatch = ghBody.mergeManaged('<!-- aoforge:id=50 -->\nx', { summary: 'S' }, '49');
    assert.strictEqual(mismatch.ok, false);
    assert.match(mismatch.error, /body marker aoforge:id=50 does not match 49/);
    assert.strictEqual(ghBody.mergeManaged('', { summary: 'S' }, '49', {}).body, ghBody.mergeManaged('', { summary: 'S' }, '49').body);
    assert.strictEqual(ghBody.mergeManaged('', { summary: 'S' }, '49', { marker: 'id' }).body, ghBody.mergeManaged('', { summary: 'S' }, '49').body);
  });

  test('2. an id-marker scan never reads aoforge:pr= as an objective, TRD or comment marker', () => {
    const body = ghBody.buildPrBody({ id: '49', sections: prSections() });
    assert.strictEqual(ghBody.extractMarker(body), null);
    assert.deepStrictEqual(ghBody.indexByMarker([{ number: 7, body }]), { byId: {}, duplicates: {}, unmarked: [7] });
    const comments = [{ id: 1, body: `${ghBody.prMarker('49')}\nnot a summary` }];
    assert.deepStrictEqual(ghBody.findCommentsByMarker(comments, '49', 'summary'), []);
    assert.deepStrictEqual(ghBody.extractMarker('<!-- aoforge:pr=49-01 -->'), null);
  });

  test('2. extractPrMarker reads only the PR marker', () => {
    assert.deepStrictEqual(ghBody.extractPrMarker('<!-- aoforge:pr=049 -->\nx'), { id: '49' });
    assert.deepStrictEqual(ghBody.extractPrMarker('text\n<!--aoforge:pr=2.1-->'), { id: '2.1' });
    assert.strictEqual(ghBody.extractPrMarker('<!-- aoforge:id=49 -->'), null);
    assert.strictEqual(ghBody.extractPrMarker('<!-- aoforge:pr=49-01 -->'), null);
    assert.strictEqual(ghBody.extractPrMarker(null), null);
  });
});
