'use strict';

// Test list (TRD 48-03, GWP-05 — written before the implementation):
//
// 1. Encoded length: a 100-char TRD named 07-01-a-TRD.md -> chars === encodeTrdBody({id:'7-01', ...}).length,
//    status ok. A file name that does not parse falls back to raw text.length with a note.
// 2. Budget boundaries (encoded): 39,999 ok; 40,000 warn; 60,000 warn; 60,001 over.
// 3. One fenced block of exactly 8,000 content chars -> no finding; 8,001 -> {kind:'block', line, chars:8001}.
// 4. `~~~` fences and a ```js info string are measured; an unclosed fence runs to EOF; nested different-char
//    fences and shorter same-char fences are content.
// 5. 45,000 encoded with 18,000 fenced (40.0%) -> no share finding; 18,100 fenced -> {kind:'share', share:0.402...}.
// 6. 30,000 encoded with 80% fenced -> no share finding (below the 40,000 floor).
// 7. Prose that says "inline fixtures" with no fence -> zero findings.
// 8. checkTrd never returns passed:false for bulk alone; passed:false only when the budget status is over.
//
// Fixtures are hand-built strings: `'x'.repeat(n)` padding, sized against the real encoded header.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ghTrd = require('./gh-trd.cjs');
const trdBulk = require('./trd-bulk.cjs');

const ID = '7-01';
const FILE = '07-01-a-TRD.md';
// Length of the two header lines encodeTrdBody prepends (id line + file line, each with its newline).
const HEADER_CHARS = ghTrd.encodeTrdBody({ id: ID, file: FILE, text: '' }).length;

/** A fenced block: opener (marker + info), the content, the closing marker, each on its own line. */
function fence(content, marker = '```', info = '') {
  return `${marker}${info}\n${content}\n${marker}\n`;
}

/**
 * A TRD text whose ENCODED body (header included) is exactly `total` chars: a heading, then `parts`
 * verbatim, then prose padding of 'p' characters.
 */
function sized(total, parts = []) {
  const head = '# TRD 07-01: sized\n\n' + parts.join('');
  const pad = total - HEADER_CHARS - head.length;
  if (pad < 0) throw new Error(`sized(${total}) cannot fit ${head.length} chars of parts`);
  return head + 'p'.repeat(pad);
}

function encodedLength(text) {
  return ghTrd.encodeTrdBody({ id: ID, file: FILE, text }).length;
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('trd-bulk constants', () => {
  test('thresholds are the U-2 values', () => {
    assert.strictEqual(trdBulk.BULK_BLOCK_MAX, 8000);
    assert.strictEqual(trdBulk.BULK_SHARE_MAX, 0.40);
    assert.strictEqual(trdBulk.BULK_SHARE_MIN_CHARS, 40000);
  });

  test('module is pure: no fs, no child_process; requires only gh-trd.cjs', () => {
    const src = fs.readFileSync(path.join(__dirname, 'trd-bulk.cjs'), 'utf8');
    const requires = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.deepStrictEqual(requires, ['./gh-trd.cjs']);
  });
});

// ─── 1. Encoded length ────────────────────────────────────────────────────────

describe('1. checkTrd measures the encoded body', () => {
  test('a 100-char TRD -> chars equals the encoded body length, status ok', () => {
    const text = '# TRD 07-01\n\n' + 'a'.repeat(87);
    assert.strictEqual(text.length, 100);

    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.chars, ghTrd.encodeTrdBody({ id: '7-01', file: FILE, text }).length);
    assert.notStrictEqual(r.chars, text.length, 'must measure the encoded body, never the file');
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.passed, true);
    assert.strictEqual(r.trd, '7-01');
    assert.deepStrictEqual(r.bulk, []);
    assert.deepStrictEqual(r.messages, []);
  });

  test('an explicit id gives the same measurement', () => {
    const text = '# TRD 07-01\n\n' + 'a'.repeat(87);
    const r = trdBulk.checkTrd({ id: '07-01', file: FILE, text });
    assert.strictEqual(r.chars, encodedLength(text));
    assert.strictEqual(r.trd, '07-01');
  });

  test('a CRLF file is measured after normalisation, like the posted body', () => {
    const text = '# TRD 07-01\r\n\r\nbody\r\n';
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.chars, encodedLength(text));
  });

  test('a file name that does not parse falls back to raw text.length and adds a note', () => {
    const text = '# notes\n\n' + 'a'.repeat(91);
    const r = trdBulk.checkTrd({ file: '01-notes-TRD.md', text });
    assert.strictEqual(r.chars, text.length);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.trd, '01-notes-TRD.md');
    assert.match(r.note, /does not parse/);
    assert.ok(r.messages.some((m) => /does not parse/.test(m)), 'the note is also a message');
  });
});

// ─── 2. Budget boundaries ─────────────────────────────────────────────────────

describe('2. budget boundaries on the encoded length', () => {
  const cases = [
    [39999, 'ok', true],
    [40000, 'warn', true],
    [60000, 'warn', true],
    [60001, 'over', false],
  ];
  for (const [total, status, passed] of cases) {
    test(`encoded ${total} -> ${status}`, () => {
      const text = sized(total);
      assert.strictEqual(encodedLength(text), total, 'fixture is sized against the real header');
      const r = trdBulk.checkTrd({ file: FILE, text });
      assert.strictEqual(r.chars, total);
      assert.strictEqual(r.status, status);
      assert.strictEqual(r.passed, passed);
    });
  }

  test('warn and over messages tell the planner to split, never to trim', () => {
    const warn = trdBulk.checkTrd({ file: FILE, text: sized(40000) });
    const over = trdBulk.checkTrd({ file: FILE, text: sized(60001) });
    for (const r of [warn, over]) {
      assert.strictEqual(r.messages.length, 1);
      assert.match(r.messages[0], /split/);
      assert.match(r.messages[0], /never trim prose to fit/);
    }
    assert.match(over.messages[0], /60,000/);
    assert.match(warn.messages[0], /40,000/);
  });
});

// ─── 3. Block threshold ───────────────────────────────────────────────────────

describe('3. one fenced block against BULK_BLOCK_MAX', () => {
  test('exactly 8,000 content chars -> no finding', () => {
    const text = '# TRD 07-01\n\n' + fence('x'.repeat(8000));
    const blocks = trdBulk.fencedBlocks(text);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].chars, 8000, 'content excludes the fence lines');
    assert.deepStrictEqual(trdBulk.checkTrd({ file: FILE, text }).bulk, []);
  });

  test('8,001 content chars -> one block finding naming the opening line', () => {
    const text = '# TRD 07-01\n\n' + fence('x'.repeat(8001));
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.bulk.length, 1);
    const f = r.bulk[0];
    assert.strictEqual(f.kind, 'block');
    assert.strictEqual(f.line, 3, 'opening fence is line 3 (1-based)');
    assert.strictEqual(f.chars, 8001);
    assert.strictEqual(f.severity, 'warning');
    assert.match(f.message, /line 3/);
    assert.match(f.message, /move the listing to the repo or wiki and link it; never trim prose to fit/);
    assert.ok(r.messages.includes(f.message), 'bulk messages surface in messages');
  });

  test('multi-line content counts the newlines between lines, not the fence lines', () => {
    const blocks = trdBulk.fencedBlocks('intro\n```\naaa\nbbb\n```\n');
    assert.deepStrictEqual(blocks.map(({ line, chars }) => ({ line, chars })), [{ line: 2, chars: 7 }]);
  });
});

// ─── 4. Fence grammar ─────────────────────────────────────────────────────────

describe('4. fence grammar', () => {
  test('a ~~~ fence is measured', () => {
    const blocks = trdBulk.fencedBlocks('~~~\nabc\n~~~\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].line, 1);
    assert.strictEqual(blocks[0].chars, 3);
    assert.strictEqual(blocks[0].fence, '~~~');
  });

  test('a ```js info string is measured', () => {
    const blocks = trdBulk.fencedBlocks('text\n```js\nabcd\n```\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].line, 2);
    assert.strictEqual(blocks[0].chars, 4);
    assert.strictEqual(blocks[0].fence, '```');
  });

  test('an unclosed fence runs to end of text', () => {
    const blocks = trdBulk.fencedBlocks('intro\n```\nabc\ndef\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].line, 2);
    assert.strictEqual(blocks[0].chars, 7);
    assert.strictEqual(blocks[0].closed, false);
  });

  test('an unclosed ~~~ fence of 8,001 chars is a finding', () => {
    const text = '# TRD 07-01\n\n~~~ text\n' + 'x'.repeat(8001);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.deepStrictEqual(r.bulk.map(({ kind, line, chars }) => ({ kind, line, chars })),
      [{ kind: 'block', line: 3, chars: 8001 }]);
  });

  test('a different-char fence inside a block is content', () => {
    const blocks = trdBulk.fencedBlocks('```\n~~~\ninner\n~~~\n```\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].chars, '~~~\ninner\n~~~'.length);
    assert.strictEqual(blocks[0].closed, true);
  });

  test('a shorter same-char fence inside a longer opener is content', () => {
    const blocks = trdBulk.fencedBlocks('````\n```\nx\n```\n````\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].chars, '```\nx\n```'.length);
    assert.strictEqual(blocks[0].fence, '````');
  });

  test('a same-char line carrying an info string does not close the block', () => {
    const blocks = trdBulk.fencedBlocks('```\na\n```js\n```\n');
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].chars, 'a\n```js'.length);
  });

  test('up to three spaces of indent open and close; four do not open', () => {
    assert.strictEqual(trdBulk.fencedBlocks('   ```\nab\n   ```\n')[0].chars, 2);
    assert.deepStrictEqual(trdBulk.fencedBlocks('    ```\nab\n    ```\n'), []);
  });

  test('two blocks are reported in order with their own opening lines', () => {
    const blocks = trdBulk.fencedBlocks('a\n```\nb\n```\nc\n~~~\ndd\n~~~\n');
    assert.deepStrictEqual(blocks.map(({ line, chars }) => ({ line, chars })),
      [{ line: 2, chars: 1 }, { line: 6, chars: 2 }]);
  });
});

// ─── 5. Share threshold ───────────────────────────────────────────────────────

describe('5. fenced share at and above the 40,000 floor', () => {
  test('45,000 encoded with 18,000 fenced (40.0%) -> no share finding', () => {
    const text = sized(45000, [fence('x'.repeat(6000)), fence('x'.repeat(6000)), fence('x'.repeat(6000))]);
    assert.strictEqual(encodedLength(text), 45000);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.status, 'warn');
    assert.deepStrictEqual(r.bulk, []);
  });

  test('45,000 encoded with 18,100 fenced -> one share finding', () => {
    const text = sized(45000, [fence('x'.repeat(6000)), fence('x'.repeat(6000)), fence('x'.repeat(6100))]);
    assert.strictEqual(encodedLength(text), 45000);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.bulk.length, 1);
    const f = r.bulk[0];
    assert.strictEqual(f.kind, 'share');
    assert.ok(f.share > 0.402 && f.share < 0.403, `share ${f.share}`);
    assert.strictEqual(f.fenced, 18100);
    assert.strictEqual(f.chars, 45000);
    assert.strictEqual(f.severity, 'warning');
    assert.match(f.message, /40\.2%/);
    assert.match(f.message, /never trim prose to fit/);
    assert.strictEqual(r.passed, true, 'a share finding never fails the TRD');
  });

  test('bulkFindings: the floor is inclusive at 40,000 encoded chars', () => {
    const text = fence('x'.repeat(7000)) + fence('x'.repeat(7000)) + fence('x'.repeat(6000));
    assert.deepStrictEqual(trdBulk.bulkFindings(text, 39999), []);
    const at = trdBulk.bulkFindings(text, 40000);
    assert.deepStrictEqual(at.map((f) => f.kind), ['share']);
    assert.strictEqual(at[0].share, 0.5);
  });
});

// ─── 6. Below the floor ───────────────────────────────────────────────────────

describe('6. share is not checked below 40,000', () => {
  test('30,000 encoded with 80% fenced -> no share finding', () => {
    const text = sized(30000, [fence('x'.repeat(8000)), fence('x'.repeat(8000)), fence('x'.repeat(8000))]);
    assert.strictEqual(encodedLength(text), 30000);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.status, 'ok');
    assert.deepStrictEqual(r.bulk, []);
  });
});

// ─── 7. Prose is never measured ───────────────────────────────────────────────

describe('7. prose mentioning fixtures is not bulk', () => {
  test('"use inline fixtures" with no fence -> zero findings', () => {
    const text = '# TRD 07-01\n\nUse inline fixtures and sample data for the tests; ' + 'p'.repeat(9000) + '\n';
    assert.deepStrictEqual(trdBulk.fencedBlocks(text), []);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.deepStrictEqual(r.bulk, []);
    assert.deepStrictEqual(r.messages, []);
  });
});

// ─── 8. Bulk only ever warns ──────────────────────────────────────────────────

describe('8. passed:false only for an over-budget TRD', () => {
  test('a small TRD with a 9,000-char block passes with a finding', () => {
    const r = trdBulk.checkTrd({ file: FILE, text: '# TRD 07-01\n\n' + fence('x'.repeat(9000)) });
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.bulk.length, 1);
    assert.strictEqual(r.passed, true);
  });

  test('a warn-budget TRD with block and share findings still passes', () => {
    const text = sized(50000, [fence('x'.repeat(9000)), fence('x'.repeat(9000)), fence('x'.repeat(9000))]);
    const r = trdBulk.checkTrd({ file: FILE, text });
    assert.strictEqual(r.status, 'warn');
    assert.deepStrictEqual(r.bulk.map((f) => f.kind), ['block', 'block', 'block', 'share']);
    assert.strictEqual(r.passed, true);
  });

  test('an over-budget TRD fails whether or not it has bulk', () => {
    assert.strictEqual(trdBulk.checkTrd({ file: FILE, text: sized(60001) }).passed, false);
    const withBulk = sized(60001, [fence('x'.repeat(9000))]);
    assert.strictEqual(trdBulk.checkTrd({ file: FILE, text: withBulk }).passed, false);
  });
});
