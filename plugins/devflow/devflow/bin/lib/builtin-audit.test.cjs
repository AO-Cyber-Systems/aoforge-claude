'use strict';

// Test list (TRD 62-01, objective 62-built-in-sweep, BLTN-01..03).
// Written before builtin-audit.cjs. Hand-written strings only (every literal is copied by hand
// from a real DevFlow file or written for the case); tests 16 and 19 build temp trees.
//
// Prompt scanner
//  1.  `Proceed? (y/n)` -> one prose-choice finding { line: 1, kind, text }; allowed/badMarkers empty.
//  2.  Each positive literal yields exactly one prose-choice finding (one per line, not per trigger).
//  3.  Negatives yield no finding (field lines, negated offers, headings, table rows).
//  4.  Window: a non-negated AskUserQuestion within 12 lines above or 6 below satisfies a prompt.
//  5.  A negated mention does not satisfy.
//  6.  A finding inside a fenced block counts the same as prose.
//  7.  Markers: allow on the line above or at the end of the line; stale and short markers are bad.
//  8.  ask-without-options.
//  9.  header-too-long.
// 10.  too-many-options.
// 11.  A line carrying two problems reports both kinds, sorted by line then kind.
//
// Declarations, progress, plan mode, scan set (added with Task 3)
// 12.  splitFrontmatter.   13. parseToolList.   14. builtinsUsed.   15. workflowRefs.
// 16.  skillCoverage (temp tree).   17. progressCounts.   18. planModeSpans.
// 19.  scanSet (temp tree).   20. groupOf and GROUPS.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const audit = require('./builtin-audit.cjs');
const { scanPrompts } = audit;
const { askCall, askProse } = require('./__fixtures__/builtin-audit-fixtures.cjs');

const kinds = (text) => scanPrompts(text).findings.map((f) => f.kind);
const filler = (n, at) => {
  // n lines of neutral text; `at` maps a 1-based line number to replacement text.
  const out = [];
  for (let i = 1; i <= n; i++) out.push(at[i] !== undefined ? at[i] : 'Step detail.');
  return out.join('\n');
};

const MARKER = '<!-- builtin-audit: allow free-text: the answer is an open-ended description -->';
const MARKER_REASON = 'free-text: the answer is an open-ended description';
const TYPE_PASS = '→ Type "pass" or describe what\'s wrong';

describe('scanPrompts: prose-choice', () => {
  test('1. Proceed? (y/n) is one finding with line, kind and trimmed text', () => {
    const r = scanPrompts('Proceed? (y/n)');
    assert.deepEqual(r.findings, [{ line: 1, kind: 'prose-choice', text: 'Proceed? (y/n)' }]);
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, []);
  });

  describe('2. positive literals', () => {
    const positives = [
      "Does this capture what you're building? (yes / adjust)",
      'Otherwise show the draft and ask: "Write this as .planning/STACK.md? (yes / edit / skip)".',
      '(yes / wait / adjust scope)',
      'Ask: "Push tag to remote? (y/n)"',
      'Reply with a number to resume, or provide an objective number to start new.',
      'Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.',
      TYPE_PASS,
      'Offer: 1) Force proceed, 2) Abort',
      '**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.',
      '- Offer options:',
      'Options:',
      'MUST present 3 options:',
      'Ask user if they want to run repairs:',
      'Ask the user which decision they want to resolve and which option to pick.',
      'Wait for user decision.',
      'Wait for user confirmation before creating worktrees.',
      'Check if session exists for that objective. If yes, offer to resume or restart.',
      '- User picks number to resume OR describes new issue',
      // plan-objective.md step 10 bullet, copied whole.
      '- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual',
    ];
    for (const literal of positives) {
      test(literal.slice(0, 70), () => {
        const r = scanPrompts(literal);
        assert.equal(r.findings.length, 1, JSON.stringify(r.findings));
        assert.equal(r.findings[0].kind, 'prose-choice');
        assert.equal(r.findings[0].line, 1);
      });
    }
  });

  describe('3. negatives', () => {
    const negatives = [
      '- options:',
      '  - "Nothing happens" — Expected action produces no result',
      '    question: "Verify work satisfies requirements after each objective? (adds tokens/time)",',
      '      { label: "Approve", description: "Commit and continue" },',
      'Do NOT offer to plan the next sequential objective — this worktree only owns its assigned objectives.',
      'Subcommand options:',
      '`planning mode` prints `local` or `store`.',
      '| Option | Meaning |',
    ];
    for (const literal of negatives) {
      test(literal.trim().slice(0, 70), () => {
        assert.deepEqual(scanPrompts(literal).findings, []);
      });
    }
  });

  describe('4. window', () => {
    test('prompt 7 lines below the mention is satisfied, 13 lines below is not', () => {
      assert.equal(scanPrompts(filler(8, { 1: 'Use AskUserQuestion:', 8: 'Wait for user response.' })).findings.length, 0);
      assert.equal(scanPrompts(filler(14, { 1: 'Use AskUserQuestion:', 14: 'Wait for user response.' })).findings.length, 1);
    });
    test('mention 5 lines below the prompt is satisfied, 7 lines below is not', () => {
      assert.equal(scanPrompts(filler(6, { 1: 'Wait for user response.', 6: 'Use AskUserQuestion:' })).findings.length, 0);
      assert.equal(scanPrompts(filler(8, { 1: 'Wait for user response.', 8: 'Use AskUserQuestion:' })).findings.length, 1);
    });
  });

  describe('5. negated mentions', () => {
    test('"no AskUserQuestion" on the prompt line does not satisfy it', () => {
      assert.equal(scanPrompts('Wait for user response (plain text, no AskUserQuestion).').findings.length, 1);
    });
    test('"Never call AskUserQuestion here." two lines above a prompt does not satisfy it', () => {
      const r = scanPrompts('Never call AskUserQuestion here.\nStep detail.\nProceed? (y/n)');
      assert.deepEqual(
        r.findings.map((f) => [f.line, f.kind]),
        [[3, 'prose-choice']],
      );
    });
  });

  test('6. a finding inside a fenced block counts the same as prose', () => {
    const r = scanPrompts('```\nReply with a number to view details, or:\n```');
    assert.deepEqual(r.findings, [
      { line: 2, kind: 'prose-choice', text: 'Reply with a number to view details, or:' },
    ]);
  });
});

describe('scanPrompts: markers', () => {
  test('7a. a marker on the line above suppresses the finding and is recorded as allowed', () => {
    const r = scanPrompts(`${MARKER}\n${TYPE_PASS}`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, [{ line: 2, reason: MARKER_REASON }]);
    assert.deepEqual(r.badMarkers, []);
  });

  test('7b. a marker at the end of the flagged line suppresses it too', () => {
    const r = scanPrompts(`${TYPE_PASS} ${MARKER}`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, [{ line: 1, reason: MARKER_REASON }]);
    assert.deepEqual(r.badMarkers, []);
  });

  test('7c. a marker above a clean line is a stale bad marker', () => {
    const r = scanPrompts(`${MARKER}\nA clean line.`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'stale' }]);
  });

  test('7d. a marker with the reason "ok" is a short bad marker and the finding stays', () => {
    const r = scanPrompts(`<!-- builtin-audit: allow ok -->\n${TYPE_PASS}`);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].kind, 'prose-choice');
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'short' }]);
  });

  test('7e. the marker text is masked: a reason quoting "Proceed? (y/n)" is never itself a finding', () => {
    const r = scanPrompts('<!-- builtin-audit: allow quoted "Proceed? (y/n)" shown to the reader -->\nA clean line.');
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'stale' }]);
  });
});

describe('scanPrompts: AskUserQuestion schema', () => {
  test('8a. a single-line call with no options is ask-without-options', () => {
    const r = scanPrompts('AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")');
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[1, 'ask-without-options']],
    );
  });

  test('8b. a multi-line call with no options reports the opening line', () => {
    const text = [
      'AskUserQuestion(',
      '  header: "Quick Task",',
      '  question: "What do you want to do?",',
      '  followUp: null',
      ')',
    ].join('\n');
    assert.deepEqual(
      scanPrompts(text).findings.map((f) => [f.line, f.kind]),
      [[1, 'ask-without-options']],
    );
  });

  test('8c. a call with options is clean', () => {
    assert.deepEqual(scanPrompts(askCall({ options: ['A', 'B'] })).findings, []);
  });

  test('8d. a call built with omitOptions is ask-without-options', () => {
    assert.deepEqual(kinds(askCall({ omitOptions: true })), ['ask-without-options']);
  });

  test('8e. prose mentions are never checked for options', () => {
    assert.deepEqual(scanPrompts('Use AskUserQuestion:').findings, []);
  });

  test('9a. a header over 12 characters is header-too-long', () => {
    const r = scanPrompts('    header: "Default work type",');
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[1, 'header-too-long']],
    );
  });

  test('9b. an inline header= over 12 characters is header-too-long (real complete-milestone.md call)', () => {
    const line =
      'AskUserQuestion(header="Archive Objectives", question="Archive objective directories to milestones/?", options: "Yes — move to milestones/v[X.Y]-objectives/" | "Skip — keep objectives in place")';
    assert.deepEqual(
      scanPrompts(line).findings.map((f) => [f.line, f.kind]),
      [[1, 'header-too-long']],
    );
  });

  test('9c. short headers are clean, including exactly 12 characters', () => {
    assert.deepEqual(scanPrompts('header: "Roadmap"').findings, []);
    assert.deepEqual(scanPrompts('header: "Twelve chars"').findings, []);
  });

  test('10a. five options in object form is too-many-options on the question line', () => {
    const r = scanPrompts(askCall({ options: ['A', 'B', 'C', 'D', 'E'] }));
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[4, 'too-many-options']],
    );
  });

  test('10b. four options in object form is clean', () => {
    assert.deepEqual(scanPrompts(askCall({ options: ['A', 'B', 'C', 'D'] })).findings, []);
  });

  test('10c. five bullet options is too-many-options on the question line', () => {
    const r = scanPrompts(askProse({ options: ['A', 'B', 'C', 'D', 'E'] }));
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[3, 'too-many-options']],
    );
  });

  test('10d. a second question restarts the count', () => {
    const text = `${askProse({ options: ['A', 'B', 'C'] })}\n${askProse({ options: ['D', 'E', 'F'] })}`;
    assert.deepEqual(scanPrompts(text).findings, []);
  });

  test('11. a line carrying two problems reports both kinds, sorted by line then kind', () => {
    const call = 'AskUserQuestion(header: "Archive Objectives", question: "Archive now?")';
    const text = filler(10, { 1: 'Wait for user decision.', 10: call });
    const r = scanPrompts(text);
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [
        [1, 'prose-choice'],
        [10, 'ask-without-options'],
        [10, 'header-too-long'],
      ],
    );
  });
});
