'use strict';

// TRD 56-03 (ONUM-04) — lib/requirement-ids.cjs: requirement IDs from a ROADMAP Requirements line.
// An ID is taken only from an ID-shaped list item; free text yields none. Every case below is a hand-built literal
// copied from a real v1.2 / v1.4 / v1.5 ROADMAP shape (no generated or property-based inputs).
//
// Test list (TRD 56-03):
//  11 plain comma list                      12 F1 / F1-CONFIG / C1 shapes
//  13 hyphenated words and ✅ markers        14 free text 'none (...)' yields nothing
//  15 TBD / N/A / - / empty / lowercase      16 mixed line with parenthetical notes
//  17 ranges                                18 objective-scoped numeric IDs
//  19 de-duplication                         20 roadmapRequirementIds label forms
//  21 block form bullets                     22 the value never crosses a newline

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { extractRequirementIds, roadmapRequirementIds } = require('./requirement-ids.cjs');

/** Build a literal ROADMAP section from its parts. */
function section({ label = '**Requirements:**', value = '', bullets = [], after = '' } = {}) {
  const lines = ['### Objective 99: T', '', '**Goal:** something', label + (value ? ' ' + value : '')];
  for (const b of bullets) lines.push(b);
  if (after) {
    lines.push('');
    lines.push(after);
  }
  return lines.join('\n') + '\n';
}

describe('56-03 extractRequirementIds', () => {
  test('11 a plain comma list gives every ID', () => {
    assert.deepEqual(extractRequirementIds('ONUM-01, ONUM-02, ONUM-03, ONUM-04'), [
      'ONUM-01',
      'ONUM-02',
      'ONUM-03',
      'ONUM-04',
    ]);
  });

  test('12 letter-digit and hyphenated shapes, with and without surrounding brackets', () => {
    assert.deepEqual(extractRequirementIds('[F1, F1-CONFIG, F2]'), ['F1', 'F1-CONFIG', 'F2']);
    assert.deepEqual(extractRequirementIds('[C1, C2]'), ['C1', 'C2']);
    assert.deepEqual(extractRequirementIds('F1, F2'), ['F1', 'F2']);
  });

  test('13 hyphenated words and trailing non-ASCII markers are IDs', () => {
    assert.deepEqual(extractRequirementIds('[PTY-BACKEND, TOKEN-PASSING, GATE-PTY-MESSAGE]'), [
      'PTY-BACKEND',
      'TOKEN-PASSING',
      'GATE-PTY-MESSAGE',
    ]);
    assert.deepEqual(extractRequirementIds('[DAEMON-NOTIFICATIONS ✅, DAEMON-AUTO-LAUNCH ✅]'), [
      'DAEMON-NOTIFICATIONS',
      'DAEMON-AUTO-LAUNCH',
    ]);
    assert.deepEqual(extractRequirementIds('REQ-10-03, R-1, PHASE-B1'), ['REQ-10-03', 'R-1', 'PHASE-B1']);
  });

  test('14 free text with a parenthetical gives no IDs', () => {
    assert.deepEqual(
      extractRequirementIds(
        'none (tech debt; see `.aoforge/objectives/53-worktree-and-health-hygiene/OBJECTIVE.md`)',
        { objective: '53' }
      ),
      []
    );
  });

  test('15 placeholders, empty input and lowercase IDs give no IDs', () => {
    assert.deepEqual(extractRequirementIds('TBD'), []);
    assert.deepEqual(extractRequirementIds('N/A'), []);
    assert.deepEqual(extractRequirementIds('-'), []);
    assert.deepEqual(extractRequirementIds(''), []);
    assert.deepEqual(extractRequirementIds('req-01, onum-01'), []);
  });

  test('16 a mixed line takes only the leading ID of each item', () => {
    const line =
      'SDR-08 (confirm each proposed command runs), SDR-03 hardening (`stack verify --run` side-effect safe); defects in `.aoforge/x`';
    assert.deepEqual(extractRequirementIds(line), ['SDR-08', 'SDR-03']);
  });

  test('16b a comma inside parentheses or backticks does not start a new item', () => {
    assert.deepEqual(extractRequirementIds('A-01 (see B-02, C-03), D-04'), ['A-01', 'D-04']);
    assert.deepEqual(extractRequirementIds('A-01 `x, B-02` note, D-04'), ['A-01', 'D-04']);
  });

  test('16c bold or backtick-wrapped IDs are accepted', () => {
    assert.deepEqual(extractRequirementIds('**ONUM-01**, `ONUM-02`'), ['ONUM-01', 'ONUM-02']);
  });

  test('16d a token that is only a prefix of a longer word is not an ID', () => {
    assert.deepEqual(extractRequirementIds('F1X, ABCDEFGHI1, ONUM-01x'), []);
  });

  describe('17 ranges', () => {
    test('17a GWP-01..GWP-05 expands inclusive', () => {
      assert.deepEqual(extractRequirementIds('GWP-01..GWP-05 (see `x`)'), [
        'GWP-01',
        'GWP-02',
        'GWP-03',
        'GWP-04',
        'GWP-05',
      ]);
    });

    test('17b DOC-01..07 expands with the start token zero-pad width', () => {
      assert.deepEqual(extractRequirementIds('DOC-01..07'), [
        'DOC-01',
        'DOC-02',
        'DOC-03',
        'DOC-04',
        'DOC-05',
        'DOC-06',
        'DOC-07',
      ]);
    });

    test('17c F1..F3 expands letter-digit IDs', () => {
      assert.deepEqual(extractRequirementIds('F1..F3'), ['F1', 'F2', 'F3']);
    });

    test('17d a descending range, an over-50 range and differing prefixes give the two endpoints', () => {
      assert.deepEqual(extractRequirementIds('A-05..A-02'), ['A-05', 'A-02']);
      assert.deepEqual(extractRequirementIds('A-01..A-99'), ['A-01', 'A-99']);
      assert.deepEqual(extractRequirementIds('A-01..B-03'), ['A-01', 'B-03']);
    });

    test('17e a range keeps its width across a digit-count change and sits next to other items', () => {
      assert.deepEqual(extractRequirementIds('GWP-08..GWP-10, X-1'), ['GWP-08', 'GWP-09', 'GWP-10', 'X-1']);
    });

    test('17f a 50-item range expands, a 51-item range gives endpoints', () => {
      assert.equal(extractRequirementIds('A-01..A-50').length, 50);
      assert.deepEqual(extractRequirementIds('A-01..A-51'), ['A-01', 'A-51']);
    });
  });

  describe('18 objective-scoped numeric IDs', () => {
    test('accepted only for this objective', () => {
      assert.deepEqual(extractRequirementIds('55-1, 55-2', { objective: '55' }), ['55-1', '55-2']);
      assert.deepEqual(extractRequirementIds('55-1, 55-2', { objective: '56' }), []);
      assert.deepEqual(extractRequirementIds('55-1, 55-2'), []);
    });

    test('zero-tolerant objective', () => {
      assert.deepEqual(extractRequirementIds('55-1, 55-2', { objective: '055' }), ['55-1', '55-2']);
      assert.deepEqual(extractRequirementIds('055-1', { objective: '55' }), ['055-1']);
    });

    test('a date is never an ID', () => {
      assert.deepEqual(extractRequirementIds('2026-10, 53-02', { objective: '56' }), []);
    });
  });

  test('19 duplicates collapse, first-seen order kept', () => {
    assert.deepEqual(extractRequirementIds('F1, F1'), ['F1']);
    assert.deepEqual(extractRequirementIds('F2, F1, F2'), ['F2', 'F1']);
  });
});

describe('56-03 roadmapRequirementIds', () => {
  test('20a the v1.5 colon-outside-bold label is found', () => {
    assert.deepEqual(
      roadmapRequirementIds(section({ label: '**Requirements**:', value: 'ONUM-01, ONUM-02' })),
      { found: true, ids: ['ONUM-01', 'ONUM-02'] }
    );
  });

  test('20b the classic colon-inside-bold label is found', () => {
    assert.deepEqual(roadmapRequirementIds(section({ value: 'ONUM-01' })), { found: true, ids: ['ONUM-01'] });
  });

  test('20c a section without the label is not found', () => {
    assert.deepEqual(roadmapRequirementIds('### Objective 99: T\n\n**Goal:** x\n'), { found: false, ids: [] });
    assert.deepEqual(roadmapRequirementIds(''), { found: false, ids: [] });
  });

  test('20d a label with only free text is found with no IDs', () => {
    const value = 'none (tech debt; see `.aoforge/objectives/99-test/OBJECTIVE.md`)';
    assert.deepEqual(roadmapRequirementIds(section({ value }), { objective: '99' }), { found: true, ids: [] });
  });

  test('20e the label is matched case-insensitively', () => {
    assert.deepEqual(roadmapRequirementIds(section({ label: '**requirements:**', value: 'F1' })), {
      found: true,
      ids: ['F1'],
    });
  });

  test('20f the objective number reaches the scoped-numeric rule', () => {
    assert.deepEqual(roadmapRequirementIds(section({ value: '55-1, 55-2' }), { objective: '55' }), {
      found: true,
      ids: ['55-1', '55-2'],
    });
    assert.deepEqual(roadmapRequirementIds(section({ value: '55-1, 55-2' }), { objective: '04' }), {
      found: true,
      ids: [],
    });
  });

  test('21 block form takes each bullet leading ID and ignores prose', () => {
    const text = section({
      bullets: [
        '- REQ-10-01: TRD frontmatter schema … `platform: [mobile, web]` …',
        '- REQ-10-04: RED-GREEN ordering enforced …',
      ],
      after: '**Plans:** 2',
    });
    assert.deepEqual(roadmapRequirementIds(text), { found: true, ids: ['REQ-10-01', 'REQ-10-04'] });
  });

  test('21b block form stops at the first non-bullet line and accepts * bullets', () => {
    const text = section({
      bullets: ['* A-01: first', '- A-02: second', 'prose line', '- A-03: not part of the list'],
    });
    assert.deepEqual(roadmapRequirementIds(text), { found: true, ids: ['A-01', 'A-02'] });
  });

  test('21c block form with no bullets is found with no IDs', () => {
    assert.deepEqual(roadmapRequirementIds(section({ after: '**Plans:** 2' })), { found: true, ids: [] });
  });

  test('22 the inline value never crosses a newline', () => {
    const text = '### Objective 99: T\n**Requirements:** none\n- X-01 something\n';
    assert.deepEqual(roadmapRequirementIds(text), { found: true, ids: [] });
  });

  test('22b CRLF line endings are tolerated', () => {
    const text = '### Objective 99: T\r\n**Requirements:** ONUM-01, ONUM-02\r\n**Plans:** 2\r\n';
    assert.deepEqual(roadmapRequirementIds(text), { found: true, ids: ['ONUM-01', 'ONUM-02'] });
  });
});
