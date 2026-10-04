'use strict';

// Tests for decision-repair (TRD 53-06, item 53-8): detect and repair a resolved decision whose multi-line
// `resolution` was flattened by the pre-objective-52 one-line frontmatter writer.
//
// no_llm_test_data: every fixture is a literal built from the exact pre-52 on-disk shapes (frontmatter.cjs
// before 4ab2e30a wrote each string on one line, quoted only when it held `:` or `#`, and never escaped a
// newline). Nothing is generated and nothing here touches the filesystem, git or the network.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyDecision, repairDecision } = require('./decision-repair.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

const RESOLVED_AT = '2026-10-04T13:49:05.343Z';
const RESOLVED_AT_LINE = `resolved_at: "${RESOLVED_AT}"`;

const HEAD_LINES = [
  '---',
  'id: DECISION-007',
  'objective: 52',
  'wave: 1',
  'trd: 52-05',
  'type: "checkpoint:decision"',
  'created: "2026-10-04T13:40:00.000Z"',
  'status: resolved',
  'blocks: []',
  'independent: []',
  'recommendation:',
];

// The body carries a `---` rule on purpose: a repair that truncated at the first inner `---` would lose it.
const BODY =
  '\n\n## Decision: Pick an option\n\n**Context:** Which one?\n\n---\n\n## To Resolve\n\nReply: `/devflow:decide DECISION-007 <choice>`\n';

/** A whole decision file: head, the given resolution lines, resolved_at, the closing `---`, then the body. */
function decisionFile(resolutionLines, { resolvedAt = RESOLVED_AT_LINE } = {}) {
  const tail = resolvedAt === null ? [] : [resolvedAt];
  return [...HEAD_LINES, ...resolutionLines, ...tail, '---'].join('\n') + BODY;
}

// The 52-05 reproduction: answer `Option B.\nReason: second line with colon\n---\nthird line\n` run through the
// pre-52 writer. It holds `:`, so the whole value is wrapped in one pair of quotes.
const QUOTED_LINES = ['resolution: "Option B.', 'Reason: second line with colon', '---', 'third line', '"'];
const QUOTED_ANSWER = 'Option B.\nReason: second line with colon\n---\nthird line';
const QUOTED = decisionFile(QUOTED_LINES);

const UNQUOTED = decisionFile(['resolution: first line', 'second line']);

const REAL_PARSE = extractFrontmatter;

describe('classifyDecision / repairDecision: the 52-05 quoted shape (test 4)', () => {
  test('classifies as repairable and recovers the full answer', () => {
    const r = classifyDecision(QUOTED);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, QUOTED_ANSWER);
  });

  test('the repaired text re-parses to the answer, keeps resolved_at and drops the stray Reason key', () => {
    const r = repairDecision(QUOTED);
    assert.equal(r.ok, true, r.reason);
    const fm = extractFrontmatter(r.text);
    assert.equal(fm.resolution, QUOTED_ANSWER);
    assert.equal(fm.resolved_at, RESOLVED_AT);
    assert.equal(Object.prototype.hasOwnProperty.call(fm, 'Reason'), false);
    assert.equal(fm.id, 'DECISION-007');
    assert.equal(fm.status, 'resolved');
    assert.equal(fm.trd, '52-05');
  });

  test('the body from `## Decision` on is byte-identical, including its own `---` rule', () => {
    const r = repairDecision(QUOTED);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.text.slice(r.text.indexOf('## Decision')), QUOTED.slice(QUOTED.indexOf('## Decision')));
    assert.ok(r.text.includes('\n---\n\n## To Resolve'), 'the horizontal rule inside the body survives');
  });

  test('the rebuilt file is exactly the 52-05 block-scalar shape', () => {
    const expected =
      [
        ...HEAD_LINES,
        'resolution: |-',
        '  Option B.',
        '  Reason: second line with colon',
        '  ---',
        '  third line',
        RESOLVED_AT_LINE,
        '---',
      ].join('\n') + BODY;
    assert.equal(repairDecision(QUOTED).text, expected);
  });

  test('a repaired file is intact, and repairing it again is a refusal that changes nothing', () => {
    const fixed = repairDecision(QUOTED).text;
    assert.equal(classifyDecision(fixed).state, 'intact');
    const again = repairDecision(fixed);
    assert.equal(again.ok, false);
    assert.equal(again.text, undefined);
  });

  test('a quoted answer whose closing quote trails the last line (no final newline) is recovered', () => {
    const text = decisionFile(['resolution: "x: 1', 'y: 2"']);
    const r = classifyDecision(text);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, 'x: 1\ny: 2');
    assert.equal(extractFrontmatter(repairDecision(text).text).resolution, 'x: 1\ny: 2');
  });

  test('a quoted single-line answer left with a stray quote line is recovered as one line', () => {
    // answer `a: b\n`, written as `resolution: "a: b` / `"`. Its first line alone does not read back.
    const text = decisionFile(['resolution: "a: b', '"']);
    const r = classifyDecision(text);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, 'a: b');
    assert.equal(extractFrontmatter(repairDecision(text).text).resolution, 'a: b');
  });

  test('lines the answer holds with leading spaces and blank lines in the middle round-trip', () => {
    const text = decisionFile(['resolution: "Plan:', '  indented line', '', 'last', '"']);
    const r = classifyDecision(text);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, 'Plan:\n  indented line\n\nlast');
    assert.equal(extractFrontmatter(repairDecision(text).text).resolution, r.answer);
  });
});

describe('classifyDecision / repairDecision: unquoted multi-line (test 5)', () => {
  test('recovers `first line\\nsecond line`', () => {
    const r = classifyDecision(UNQUOTED);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, 'first line\nsecond line');
  });

  test('the repaired file holds a `|-` block and the original resolved_at', () => {
    const r = repairDecision(UNQUOTED);
    assert.equal(r.ok, true, r.reason);
    assert.ok(r.text.includes('resolution: |-\n  first line\n  second line\nresolved_at: '));
    const fm = extractFrontmatter(r.text);
    assert.equal(fm.resolution, 'first line\nsecond line');
    assert.equal(fm.resolved_at, RESOLVED_AT);
    assert.equal(r.text.slice(r.text.indexOf('## Decision')), UNQUOTED.slice(UNQUOTED.indexOf('## Decision')));
  });

  test('CRLF line endings inside the answer are normalised to LF', () => {
    // An answer read from a CRLF file went in raw: the answer lines end `\r\n`, the frontmatter lines `\n`.
    const text = decisionFile(['resolution: first line\r', 'second line\r', '\r']);
    const r = classifyDecision(text);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, 'first line\nsecond line');
    const out = repairDecision(text);
    assert.equal(out.ok, true, out.reason);
    assert.equal(out.text.includes('\r'), false);
  });

  test('an unquoted answer that merely starts with a quote keeps it', () => {
    const text = decisionFile(['resolution: "A" is best', 'second']);
    const r = classifyDecision(text);
    assert.equal(r.state, 'repairable');
    assert.equal(r.answer, '"A" is best\nsecond');
    assert.equal(extractFrontmatter(repairDecision(text).text).resolution, '"A" is best\nsecond');
  });
});

describe('classifyDecision: intact shapes are never repaired (test 6)', () => {
  const LONG =
    'Kill. Killed 2026-10-01 by user decision (GMD-04). The GitHub store already covers most of its value ' +
    '(the issue graph, the linked branch and the one PR per objective).';

  test("DECISION-002's shape: one line, a blank line, then resolved_at", () => {
    const text = decisionFile([`resolution: ${LONG}`, '']);
    assert.equal(classifyDecision(text).state, 'intact');
    const r = repairDecision(text);
    assert.equal(r.ok, false);
    assert.equal(r.text, undefined);
  });

  test('a `|-` block scalar with indented lines', () => {
    const text = decisionFile(['resolution: |-', '  line one', '  Reason: line two']);
    assert.equal(classifyDecision(text).state, 'intact');
  });

  test('every block indicator form is intact', () => {
    for (const ind of ['|', '|-', '|+', '>', '>-', '>+']) {
      const text = decisionFile([`resolution: ${ind}`, '  some answer']);
      assert.equal(classifyDecision(text).state, 'intact', `indicator ${ind}`);
    }
  });

  test('a plain `resolution: B`', () => {
    assert.equal(classifyDecision(decisionFile(['resolution: B'])).state, 'intact');
  });

  test('a quoted single line is intact', () => {
    assert.equal(classifyDecision(decisionFile(['resolution: "a: b"'])).state, 'intact');
  });

  test('no resolution key, and a pending shape, are not flattened decisions', () => {
    const noResolution = [...HEAD_LINES, '---'].join('\n') + BODY;
    assert.equal(classifyDecision(noResolution).state, 'intact');
    assert.equal(classifyDecision('no frontmatter here\nresolution: x\n').state, 'intact');
  });

  test('a `resolution:` line in the body is never mistaken for the frontmatter key', () => {
    const text = [...HEAD_LINES, 'resolved_at: "2026-10-04T13:49:05.343Z"', '---'].join('\n') +
      '\n\nresolution: not a key\nsecond line\n';
    assert.equal(classifyDecision(text).state, 'intact');
  });

  test('a single-line resolution without resolved_at is intact', () => {
    assert.equal(classifyDecision(decisionFile(['resolution: B'], { resolvedAt: null })).state, 'intact');
  });
});

describe('classifyDecision / repairDecision: unrecoverable (test 7)', () => {
  // The mangled file re-serialized: the parse stopped at the inner `---`, so resolved_at is gone, and the rest of
  // the answer drifted below the frontmatter.
  const RESERIALIZED =
    [...HEAD_LINES, 'resolution: "Option B.', 'Reason: second line with colon', '---'].join('\n') +
    '\nthird line\n"\n\n## Decision: Pick an option\n';

  test('an unclosed quote with continuation lines and no later resolved_at line', () => {
    const r = classifyDecision(RESERIALIZED);
    assert.equal(r.state, 'unrecoverable');
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  });

  test('repairDecision refuses, returns no text and cannot have changed its input', () => {
    const before = RESERIALIZED;
    const r = repairDecision(RESERIALIZED);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.equal(r.text, undefined);
    assert.equal(RESERIALIZED, before);
  });

  test('a repairable shape with no closing `---` after resolved_at is refused', () => {
    const text = [...HEAD_LINES, 'resolution: first line', 'second line', RESOLVED_AT_LINE].join('\n');
    const c = classifyDecision(text);
    assert.equal(c.state, 'unrecoverable');
    assert.match(c.reason, /frontmatter|---/);
  });

  test('non-text input is refused rather than thrown on', () => {
    assert.equal(classifyDecision(undefined).state, 'unrecoverable');
    assert.equal(repairDecision(null).ok, false);
  });
});

describe('repairDecision: the verification guard (test 8)', () => {
  // DevFlow's own parser round-trips every shape this module can build (52-05), so the guard is exercised through
  // the `parse` seam with stubs, not a natural input.
  const wrongResolution = (t) => ({ ...REAL_PARSE(t), resolution: 'a different answer' });
  const dropsResolvedAt = (t) => {
    const fm = REAL_PARSE(t);
    delete fm.resolved_at;
    return fm;
  };
  const changedResolvedAt = (t) => ({ ...REAL_PARSE(t), resolved_at: '1999-01-01T00:00:00.000Z' });
  const throwing = () => {
    throw new Error('parser exploded');
  };

  test('with the default parser the quoted shape is repairable (control)', () => {
    assert.equal(classifyDecision(QUOTED).state, 'repairable');
    assert.equal(repairDecision(QUOTED).ok, true);
    assert.equal(repairDecision(QUOTED, { parse: REAL_PARSE }).ok, true);
  });

  test('a parser that reads a different resolution makes repair refuse and classify unrecoverable', () => {
    const r = repairDecision(QUOTED, { parse: wrongResolution });
    assert.equal(r.ok, false);
    assert.equal(r.text, undefined);
    assert.match(r.reason, /re-parse|resolution/i);
    const c = classifyDecision(QUOTED, { parse: wrongResolution });
    assert.equal(c.state, 'unrecoverable');
    assert.ok(c.reason);
    assert.equal(c.answer, undefined);
  });

  test('a parser that drops resolved_at makes repair refuse and classify unrecoverable', () => {
    const r = repairDecision(QUOTED, { parse: dropsResolvedAt });
    assert.equal(r.ok, false);
    assert.match(r.reason, /resolved_at/);
    assert.equal(classifyDecision(QUOTED, { parse: dropsResolvedAt }).state, 'unrecoverable');
  });

  test('a parser that changes resolved_at is refused too', () => {
    assert.equal(repairDecision(UNQUOTED, { parse: changedResolvedAt }).ok, false);
    assert.equal(classifyDecision(UNQUOTED, { parse: changedResolvedAt }).state, 'unrecoverable');
  });

  test('a throwing parser is a refusal, not a crash', () => {
    const r = repairDecision(QUOTED, { parse: throwing });
    assert.equal(r.ok, false);
    assert.match(r.reason, /parser exploded/);
    assert.equal(classifyDecision(QUOTED, { parse: throwing }).state, 'unrecoverable');
  });

  test('the seam never affects an intact file', () => {
    const intact = decisionFile(['resolution: B']);
    assert.equal(classifyDecision(intact, { parse: wrongResolution }).state, 'intact');
  });
});

describe('decision-repair stays pure', () => {
  test('the module source requires no fs, child_process or git', () => {
    const src = fs.readFileSync(path.join(__dirname, 'decision-repair.cjs'), 'utf-8');
    assert.doesNotMatch(src, /require\(['"](?:node:)?(?:fs|child_process|os)['"]\)/);
    assert.doesNotMatch(src, /process\.env|execFileSync|execSync|spawnSync/);
  });
});
