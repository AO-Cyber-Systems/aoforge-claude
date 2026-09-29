/**
 * Tests for the auto-continue Stop hook (TRD 44-05, AUT-06).
 *
 *   unit — announcedAction over the hand-written corpus (one test per label),
 *          finalParagraph, isQuestionToUser, isHandoffToUser, hasRunningBackground
 *   e2e  — the hook as a subprocess with real Stop payloads (see bottom)
 *
 * The corpus lives in __fixtures__/stop-fixtures.js and is hand-written.
 * False positives are the main risk: every NOT_ANNOUNCE entry must stay null.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { ANNOUNCE, NOT_ANNOUNCE } = require('./__fixtures__/stop-fixtures.js');
const {
  finalParagraph,
  isQuestionToUser,
  isHandoffToUser,
  announcedAction,
  hasRunningBackground,
} = require('./auto-continue.js');

// ---------------------------------------------------------------------------
// Test list item 6 — every ANNOUNCE entry classifies as an announcement
// ---------------------------------------------------------------------------

describe('announcedAction — ANNOUNCE corpus (non-null)', () => {
  for (const { label, text } of ANNOUNCE) {
    test(label, () => {
      const action = announcedAction(text);
      assert.equal(typeof action, 'string', `expected an announcement for: ${JSON.stringify(text)}`);
      assert.ok(action.length > 0);
      assert.ok(action.length <= 120, `quoted action must be <= 120 chars, got ${action.length}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Test list item 7 — every NOT_ANNOUNCE entry classifies as null
// ---------------------------------------------------------------------------

describe('announcedAction — NOT_ANNOUNCE corpus (null)', () => {
  for (const { label, text } of NOT_ANNOUNCE) {
    test(label, () => {
      assert.equal(announcedAction(text), null, `false positive on: ${JSON.stringify(text)}`);
    });
  }
});

describe('announcedAction — returned sentence', () => {
  test('quotes the announced sentence from the final paragraph', () => {
    assert.match(announcedAction('Tests are green.\n\nWriting the predicate.'), /^Writing the predicate/);
  });

  test('takes the announcement sentence, not the preceding report sentence', () => {
    assert.match(announcedAction('Wave 2 merged. Ready for wave 3 on your word.'), /^Ready for wave 3 on your word/);
  });

  test('a sentence-start match after a full stop inside the final paragraph', () => {
    assert.match(announcedAction('RED is committed. Now writing the implementation.'), /^Now writing the implementation/);
  });

  test('caps the quoted action at 120 characters', () => {
    const long = 'Writing ' + 'the very long predicate name '.repeat(10) + 'now.';
    const action = announcedAction(long);
    assert.equal(typeof action, 'string');
    assert.ok(action.length <= 120, `got ${action.length}`);
    assert.match(action, /^Writing the very long/);
  });

  test('"now" inside a word never matches ("known", "snow")', () => {
    assert.equal(announcedAction('The cause is known. Snow is unrelated.'), null);
  });

  test('lower-case sentence-start words are not announcements', () => {
    assert.equal(announcedAction('running npm test.'), null);
  });

  test('non-string / empty input → null', () => {
    assert.equal(announcedAction(undefined), null);
    assert.equal(announcedAction(null), null);
    assert.equal(announcedAction(42), null);
    assert.equal(announcedAction(''), null);
    assert.equal(announcedAction('   \n\n  '), null);
  });
});

// ---------------------------------------------------------------------------
// finalParagraph / isQuestionToUser / isHandoffToUser
// ---------------------------------------------------------------------------

describe('finalParagraph', () => {
  test('text after the last blank line', () => {
    assert.equal(finalParagraph('one\n\ntwo\nthree'), 'two\nthree');
  });

  test('trailing whitespace is ignored', () => {
    assert.equal(finalParagraph('one\n\ntwo  \n\n  \n'), 'two');
  });

  test('a trailing fenced block is stripped', () => {
    assert.equal(finalParagraph('intro\n\nNow running:\n\n```bash\nnpm test\n\nnpm run build\n```\n'), 'Now running:');
  });

  test('a single paragraph is returned whole', () => {
    assert.equal(finalParagraph('Only one.'), 'Only one.');
  });
});

describe('isQuestionToUser', () => {
  test('last line ends with ?', () => {
    assert.equal(isQuestionToUser('Tests pass.\nShip it?'), true);
  });

  test('ask phrases without a question mark', () => {
    assert.equal(isQuestionToUser('Let me know when the other session is done.'), true);
    assert.equal(isQuestionToUser('I can push now if you want me to.'), true);
  });

  test('a plain announcement is not a question', () => {
    assert.equal(isQuestionToUser('Writing the SUMMARY.'), false);
  });

  test('"on your word" is NOT treated as a question (it auto-continues)', () => {
    assert.equal(isQuestionToUser('Ready for wave 3 on your word.'), false);
  });

  test('a query string is not a question mark', () => {
    assert.equal(isQuestionToUser('Running curl http://localhost:8091/health?full=1 now.'), false);
  });
});

describe('isHandoffToUser', () => {
  test('Next Up heading + /devflow: command', () => {
    assert.equal(isHandoffToUser('## ▶ Next Up\n`/devflow:plan-objective 45`'), true);
  });

  test('Next: + /devflow: command', () => {
    assert.equal(isHandoffToUser('Next: run /devflow:verify-work 44'), true);
  });

  test('Next without a /devflow: command is not a hand-off', () => {
    assert.equal(isHandoffToUser('Next, I\'ll wire the hook into hooks.json.'), false);
  });
});

// ---------------------------------------------------------------------------
// Test list item 8 — hasRunningBackground
// ---------------------------------------------------------------------------

describe('hasRunningBackground', () => {
  test('undefined / null / [] → false', () => {
    assert.equal(hasRunningBackground(undefined), false);
    assert.equal(hasRunningBackground(null), false);
    assert.equal(hasRunningBackground([]), false);
  });

  test('a running task → true', () => {
    assert.equal(hasRunningBackground([{ status: 'running' }]), true);
  });

  test('only completed / failed tasks → false', () => {
    assert.equal(hasRunningBackground([{ status: 'completed' }, { status: 'failed' }]), false);
  });

  test('a running task among finished ones → true', () => {
    assert.equal(
      hasRunningBackground([
        { id: 't1', type: 'agent', status: 'completed', agent_type: 'devflow:executor' },
        { id: 't2', type: 'agent', status: 'running', agent_type: 'devflow:executor' },
      ]),
      true
    );
  });

  test('a not-yet-finished status (pending) counts as running — fail toward no block', () => {
    assert.equal(hasRunningBackground([{ status: 'pending' }]), true);
  });

  test('a non-array value → false', () => {
    assert.equal(hasRunningBackground('running'), false);
  });
});
