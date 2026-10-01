'use strict';

// Unit tests for lib/gh-trd.cjs — the TRD issue-body codec, the scope budget,
// scope comments + effective spec, the spec-rev log, fold, and the numbered-parts
// splitter.
//
// gh-trd.cjs is a pure module: no gh calls, no fs. Every test here uses
// hand-written strings (`'x'.repeat(n)` for size boundaries) — no gh mock, no
// fixtures, no generated data.

const { test, describe } = require('node:test');
const assert = require('node:assert');

const ghTrd = require('./gh-trd.cjs');
const ghBody = require('./gh-body.cjs');

// ─── Hand-built factories ────────────────────────────────────────────────────

const ID = '47-01';
const FILE = '47-01-x-TRD.md';

function makeTrd(overrides) {
  return Object.assign(
    { id: ID, file: FILE, text: '---\nobjective: 47\n---\n\n# TRD\n\nbody\n' },
    overrides
  );
}

// The two header lines, built here by hand (NOT via the module under test) so the
// size helpers below are independent of the code they measure.
function header(id, file) {
  return `<!-- devflow:id=${id} -->\n<!-- devflow:file=${file} -->\n`;
}

// A text that makes the ENCODED body exactly `n` chars long.
function textOfEncodedLength(n, id = ID, file = FILE) {
  const overhead = header(id, file).length;
  assert.ok(n >= overhead, 'requested length is shorter than the header');
  return 'x'.repeat(n - overhead);
}

function trdOfEncodedLength(n, id = ID, file = FILE) {
  return { id, file, text: textOfEncodedLength(n, id, file) };
}

// ─── Constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  test('budget thresholds and limits', () => {
    assert.strictEqual(ghTrd.TRD_TARGET_CHARS, 40000);
    assert.strictEqual(ghTrd.TRD_MAX_CHARS, 60000);
    assert.strictEqual(ghTrd.COMMENT_MAX_CHARS, 60000);
    assert.strictEqual(ghTrd.MAX_TRDS_PER_OBJECTIVE, 100);
  });
});

// ─── Encoding and hashing (tests 1-5) ────────────────────────────────────────

describe('normalise and contentHash', () => {
  test('1. normalise converts CRLF to LF and nothing else', () => {
    assert.strictEqual(ghTrd.normalise('a\r\nb\r\n'), 'a\nb\n');
    // never trims, never touches trailing newlines or lone CR
    assert.strictEqual(ghTrd.normalise('  a\n\n\n'), '  a\n\n\n');
    assert.strictEqual(ghTrd.normalise('a\rb'), 'a\rb');
    assert.strictEqual(ghTrd.normalise(''), '');
  });

  test('1. contentHash of LF and CRLF variants is equal and sha256-shaped', () => {
    const lf = ghTrd.contentHash('a\nb\n');
    const crlf = ghTrd.contentHash('a\r\nb\r\n');
    assert.strictEqual(lf, crlf);
    assert.match(lf, /^sha256:[0-9a-f]{64}$/);
  });

  test('1. contentHash differs when trailing newline differs', () => {
    assert.notStrictEqual(ghTrd.contentHash('a\n'), ghTrd.contentHash('a'));
  });

  test('1. contentHash is the well-known sha256 of the normalised text', () => {
    // sha256("abc")
    assert.strictEqual(
      ghTrd.contentHash('abc'),
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('normalise and contentHash reject non-strings', () => {
    assert.throws(() => ghTrd.normalise(undefined), TypeError);
    assert.throws(() => ghTrd.contentHash(null), TypeError);
  });
});

describe('encodeTrdBody', () => {
  test('2. starts with the two header lines; line 1 equals gh-body.markerLine', () => {
    const body = ghTrd.encodeTrdBody(makeTrd());
    const lines = body.split('\n');
    assert.strictEqual(lines[0], ghBody.markerLine('47-01'));
    assert.strictEqual(lines[0], '<!-- devflow:id=47-01 -->');
    assert.strictEqual(lines[1], '<!-- devflow:file=47-01-x-TRD.md -->');
  });

  test('2. the file text follows the header verbatim', () => {
    const t = makeTrd({ text: '# T\n\nline\n' });
    assert.strictEqual(ghTrd.encodeTrdBody(t), header(ID, FILE) + '# T\n\nline\n');
  });

  test('2. the id marker is canonicalised exactly like gh-body (leading zeros dropped)', () => {
    const body = ghTrd.encodeTrdBody(makeTrd({ id: '047-01' }));
    assert.strictEqual(body.split('\n')[0], ghBody.markerLine('047-01'));
    assert.strictEqual(body.split('\n')[0], '<!-- devflow:id=47-01 -->');
  });

  test('encode normalises CRLF input to LF', () => {
    const body = ghTrd.encodeTrdBody(makeTrd({ text: 'a\r\nb\r\n' }));
    assert.strictEqual(body, header(ID, FILE) + 'a\nb\n');
  });

  test('encode throws TypeError for an invalid id, file or text', () => {
    assert.throws(() => ghTrd.encodeTrdBody(makeTrd({ id: 'nope' })), TypeError);
    assert.throws(() => ghTrd.encodeTrdBody(makeTrd({ file: '../x.md' })), TypeError);
    assert.throws(() => ghTrd.encodeTrdBody(makeTrd({ text: 42 })), TypeError);
  });
});

describe('decodeTrdBody', () => {
  const TEXTS = {
    'trailing newline': '# T\n\nbody\n',
    'no trailing newline': '# T\n\nbody',
    frontmatter: '---\nobjective: 47\ntrd: "01"\nwave: 1\n---\n\n# TRD 47-01\n',
    empty: '',
    'leading blank lines': '\n\n# T\n',
    'comment-like first line': '<!-- not a header -->\nbody\n',
  };

  for (const [label, text] of Object.entries(TEXTS)) {
    test(`3. round trip is exact: ${label}`, () => {
      const dec = ghTrd.decodeTrdBody(ghTrd.encodeTrdBody({ id: ID, file: FILE, text }));
      assert.deepStrictEqual(dec, { ok: true, id: ID, file: FILE, text });
    });
  }

  test('3. CRLF input round-trips to LF', () => {
    const dec = ghTrd.decodeTrdBody(ghTrd.encodeTrdBody({ id: ID, file: FILE, text: 'a\r\nb\r\n' }));
    assert.strictEqual(dec.ok, true);
    assert.strictEqual(dec.text, 'a\nb\n');
  });

  test('3. a CRLF-mangled body (as GitHub may return it) still decodes', () => {
    const body = ghTrd.encodeTrdBody({ id: ID, file: FILE, text: 'a\nb\n' }).replace(/\n/g, '\r\n');
    const dec = ghTrd.decodeTrdBody(body);
    assert.strictEqual(dec.ok, true);
    assert.strictEqual(dec.text, 'a\nb\n');
  });

  test('4. a body without the header is not ok', () => {
    const dec = ghTrd.decodeTrdBody('hello');
    assert.strictEqual(dec.ok, false);
    assert.match(dec.error, /not a devflow TRD body/);
  });

  test('4. a body with only the id line is not ok', () => {
    assert.strictEqual(ghTrd.decodeTrdBody('<!-- devflow:id=47-01 -->\nsome text\n').ok, false);
    assert.strictEqual(ghTrd.decodeTrdBody('<!-- devflow:id=47-01 -->').ok, false);
  });

  test('4. a comment marker (kind=...) on line 1 is not a TRD body header', () => {
    const body = `<!-- devflow:id=47-01 kind=summary -->\n<!-- devflow:file=${FILE} -->\ntext\n`;
    assert.strictEqual(ghTrd.decodeTrdBody(body).ok, false);
  });

  test('4. the file line must come second, not first', () => {
    const body = `<!-- devflow:file=${FILE} -->\n<!-- devflow:id=47-01 -->\ntext\n`;
    assert.strictEqual(ghTrd.decodeTrdBody(body).ok, false);
  });

  test('4. an unsafe file name in the header is not ok', () => {
    const body = '<!-- devflow:id=47-01 -->\n<!-- devflow:file=../evil.md -->\ntext\n';
    assert.strictEqual(ghTrd.decodeTrdBody(body).ok, false);
  });

  test('4. decode never throws on non-string input', () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      const dec = ghTrd.decodeTrdBody(bad);
      assert.strictEqual(dec.ok, false);
    }
  });

  test('4. an empty-text body whose trailing newline was stripped still decodes', () => {
    const dec = ghTrd.decodeTrdBody('<!-- devflow:id=47-01 -->\n<!-- devflow:file=47-01-x-TRD.md -->');
    assert.deepStrictEqual(dec, { ok: true, id: ID, file: FILE, text: '' });
  });
});

describe('fileLine / parseFileLine', () => {
  test('5. parseFileLine reads the file name', () => {
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file=47-01-x-TRD.md -->'), '47-01-x-TRD.md');
  });

  test('5. fileLine builds the line parseFileLine reads', () => {
    assert.strictEqual(ghTrd.fileLine(FILE), `<!-- devflow:file=${FILE} -->`);
    assert.strictEqual(ghTrd.parseFileLine(ghTrd.fileLine(FILE)), FILE);
  });

  test('5. parseFileLine rejects names containing / or ..', () => {
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file=a/b.md -->'), null);
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file=../b.md -->'), null);
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file=a..b.md -->'), null);
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file=a\\b.md -->'), null);
  });

  test('5. parseFileLine rejects a line that is not a file line', () => {
    assert.strictEqual(ghTrd.parseFileLine('hello'), null);
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:id=47-01 -->'), null);
    assert.strictEqual(ghTrd.parseFileLine('<!-- devflow:file= -->'), null);
    assert.strictEqual(ghTrd.parseFileLine(undefined), null);
  });

  test('5. fileLine throws TypeError for an unsafe name', () => {
    assert.throws(() => ghTrd.fileLine('a/b.md'), TypeError);
    assert.throws(() => ghTrd.fileLine('..'), TypeError);
    assert.throws(() => ghTrd.fileLine(''), TypeError);
    assert.throws(() => ghTrd.fileLine('x --> y'), TypeError);
  });
});

// ─── Budget (tests 6-8) ──────────────────────────────────────────────────────

describe('budget', () => {
  test('textOfEncodedLength really produces the requested encoded length', () => {
    for (const n of [100, 40000, 60000, 60001]) {
      assert.strictEqual(ghTrd.encodeTrdBody(trdOfEncodedLength(n)).length, n);
    }
  });

  test('6. boundaries on the encoded body: 39,999 ok; 40,000 warn; 60,000 warn; 60,001 over', () => {
    const at = (n) => ghTrd.budget(ghTrd.encodeTrdBody(trdOfEncodedLength(n)));
    assert.deepStrictEqual(at(39999), { chars: 39999, status: 'ok' });
    assert.deepStrictEqual(at(40000), { chars: 40000, status: 'warn' });
    assert.deepStrictEqual(at(60000), { chars: 60000, status: 'warn' });
    assert.deepStrictEqual(at(60001), { chars: 60001, status: 'over' });
  });

  test('6. the budget is measured on the encoded body, not on the file text', () => {
    // The text alone is 59,990 chars (under the limit); the header pushes the body over it.
    const t = makeTrd({ text: 'x'.repeat(59990) });
    assert.strictEqual(ghTrd.budget(t.text).status, 'warn');
    assert.strictEqual(ghTrd.budget(ghTrd.encodeTrdBody(t)).status, 'over');
  });

  test('budget throws TypeError for a non-string body', () => {
    assert.throws(() => ghTrd.budget(undefined), TypeError);
  });
});

describe('checkObjectiveBudgets', () => {
  test('7. one over-budget TRD refuses the objective and is named', () => {
    const trds = [
      trdOfEncodedLength(1000, '47-01', '47-01-a-TRD.md'),
      trdOfEncodedLength(60001, '47-02', '47-02-b-TRD.md'),
      trdOfEncodedLength(2000, '47-03', '47-03-c-TRD.md'),
    ];
    const res = ghTrd.checkObjectiveBudgets(trds);
    assert.strictEqual(res.ok, false);
    assert.deepStrictEqual(res.over, [{ id: '47-02', chars: 60001 }]);
    assert.deepStrictEqual(res.warn, []);
    assert.match(res.error, /47-02/);
  });

  test('7. lists ALL over-budget TRDs, not the first only', () => {
    const trds = [
      trdOfEncodedLength(60002, '47-01', '47-01-a-TRD.md'),
      trdOfEncodedLength(100, '47-02', '47-02-b-TRD.md'),
      trdOfEncodedLength(70000, '47-03', '47-03-c-TRD.md'),
    ];
    const res = ghTrd.checkObjectiveBudgets(trds);
    assert.strictEqual(res.ok, false);
    assert.deepStrictEqual(res.over, [
      { id: '47-01', chars: 60002 },
      { id: '47-03', chars: 70000 },
    ]);
    assert.match(res.error, /47-01/);
    assert.match(res.error, /47-03/);
  });

  test('7. warn-band TRDs are collected separately and do not refuse', () => {
    const trds = [
      trdOfEncodedLength(40000, '47-01', '47-01-a-TRD.md'),
      trdOfEncodedLength(60000, '47-02', '47-02-b-TRD.md'),
      trdOfEncodedLength(39999, '47-03', '47-03-c-TRD.md'),
    ];
    const res = ghTrd.checkObjectiveBudgets(trds);
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.over, []);
    assert.deepStrictEqual(res.warn, [
      { id: '47-01', chars: 40000 },
      { id: '47-02', chars: 60000 },
    ]);
    assert.strictEqual(res.error, undefined);
  });

  test('7. an over-budget TRD and a warn TRD together: over refuses, warn is still listed', () => {
    const res = ghTrd.checkObjectiveBudgets([
      trdOfEncodedLength(45000, '47-01', '47-01-a-TRD.md'),
      trdOfEncodedLength(60001, '47-02', '47-02-b-TRD.md'),
    ]);
    assert.strictEqual(res.ok, false);
    assert.deepStrictEqual(res.over, [{ id: '47-02', chars: 60001 }]);
    assert.deepStrictEqual(res.warn, [{ id: '47-01', chars: 45000 }]);
  });

  test('7. a small objective passes cleanly', () => {
    const res = ghTrd.checkObjectiveBudgets([makeTrd(), makeTrd({ id: '47-02', file: '47-02-y-TRD.md' })]);
    assert.deepStrictEqual(res, { ok: true, over: [], warn: [], invalid: [] });
  });

  test('8. 101 TRDs are refused; 100 are not', () => {
    const many = (n) =>
      Array.from({ length: n }, (_, i) => {
        const k = String(i + 1).padStart(2, '0');
        return { id: `47-${k}`, file: `47-${k}-t-TRD.md`, text: 'x' };
      });
    const refused = ghTrd.checkObjectiveBudgets(many(101));
    assert.strictEqual(refused.ok, false);
    assert.match(refused.error, /100/);
    assert.strictEqual(ghTrd.checkObjectiveBudgets(many(100)).ok, true);
  });

  test('a TRD that cannot be encoded is reported as invalid and refuses the objective', () => {
    const res = ghTrd.checkObjectiveBudgets([makeTrd(), { id: '47-02', file: 'a/b.md', text: 'x' }]);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.invalid.length, 1);
    assert.strictEqual(res.invalid[0].id, '47-02');
    assert.match(res.error, /47-02/);
  });

  test('checkObjectiveBudgets requires an array', () => {
    assert.throws(() => ghTrd.checkObjectiveBudgets(undefined), TypeError);
  });
});
