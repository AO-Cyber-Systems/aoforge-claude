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

// ─── Scope comments and effective spec (tests 9-14) ──────────────────────────

// A GitHub REST comment, subset: { id, body }. Built by hand — the marker is
// spelled out, not produced by the module under test.
function scopeComment(id, n, text) {
  return { id, body: `<!-- devflow:scope n=${n} -->\n${text}` };
}

describe('scopeMarker / buildScopeComment', () => {
  test('9. scopeMarker is the locked form', () => {
    assert.strictEqual(ghTrd.scopeMarker(2), '<!-- devflow:scope n=2 -->');
  });

  test('9. scopeMarker rejects anything but a positive integer', () => {
    for (const bad of [0, -1, 1.5, '2', NaN, undefined, null]) {
      assert.throws(() => ghTrd.scopeMarker(bad), TypeError, `n=${String(bad)}`);
    }
  });

  test('9. buildScopeComment joins marker and text', () => {
    assert.strictEqual(ghTrd.buildScopeComment(2, 'why'), '<!-- devflow:scope n=2 -->\nwhy');
  });

  test('9. a comment of exactly 60,000 chars is allowed; 60,001 overflows', () => {
    const overhead = ghTrd.scopeMarker(1).length + 1;
    const fits = ghTrd.buildScopeComment(1, 'x'.repeat(60000 - overhead));
    assert.strictEqual(typeof fits, 'string');
    assert.strictEqual(fits.length, 60000);

    const over = ghTrd.buildScopeComment(1, 'x'.repeat(60001 - overhead));
    assert.strictEqual(over.ok, false);
    assert.strictEqual(over.overflow, true);
    assert.strictEqual(over.chars, 60001);
  });

  test('9. text of 60,000+ chars overflows', () => {
    const over = ghTrd.buildScopeComment(3, 'x'.repeat(60000));
    assert.strictEqual(over.ok, false);
    assert.strictEqual(over.overflow, true);
  });

  test('9. buildScopeComment requires string text', () => {
    assert.throws(() => ghTrd.buildScopeComment(1, undefined), TypeError);
  });

  test('9. the built comment parses back to the same n and text', () => {
    const c = ghTrd.buildScopeComment(4, 'line1\n\nline2\n');
    const { scopes, errors } = ghTrd.parseScopeComments([{ id: 1, body: c }]);
    // n=4 with nothing before it is a gap, but the scope itself parses
    assert.strictEqual(scopes.length, 1);
    assert.strictEqual(scopes[0].n, 4);
    assert.strictEqual(scopes[0].text, 'line1\n\nline2\n');
    assert.strictEqual(scopes[0].body, c);
    assert.deepStrictEqual(errors, ['gap before n=4']);
  });
});

describe('parseScopeComments', () => {
  test('10. orders strictly by n, not by comment order or id', () => {
    const { scopes, errors } = ghTrd.parseScopeComments([
      scopeComment(30, 2, 'second'),
      scopeComment(10, 1, 'first'),
      scopeComment(20, 3, 'third'),
    ]);
    assert.deepStrictEqual(
      scopes.map((s) => [s.n, s.comment_id, s.text]),
      [
        [1, 10, 'first'],
        [2, 30, 'second'],
        [3, 20, 'third'],
      ]
    );
    assert.deepStrictEqual(errors, []);
  });

  test('10. non-scope comments are ignored', () => {
    const { scopes, errors } = ghTrd.parseScopeComments([
      { id: 1, body: 'LGTM' },
      { id: 2, body: '<!-- devflow:id=47-01 kind=summary -->\nsummary text' },
      scopeComment(3, 1, 'real scope'),
      { id: 4, body: 'prose first\n<!-- devflow:scope n=2 -->\nnot on the first line' },
      { id: 5, body: '' },
      { id: 6 },
      null,
    ]);
    assert.deepStrictEqual(scopes.map((s) => s.n), [1]);
    assert.deepStrictEqual(errors, []);
  });

  test('10. leading whitespace before the marker is tolerated; CRLF bodies are normalised', () => {
    const { scopes } = ghTrd.parseScopeComments([
      { id: 1, body: '  <!-- devflow:scope  n=1 -->\r\nwhy\r\nmore' },
    ]);
    assert.strictEqual(scopes.length, 1);
    assert.strictEqual(scopes[0].text, 'why\nmore');
    assert.strictEqual(scopes[0].body, '  <!-- devflow:scope  n=1 -->\nwhy\nmore');
  });

  test('10. a marker-only comment has empty text', () => {
    const { scopes } = ghTrd.parseScopeComments([{ id: 1, body: '<!-- devflow:scope n=1 -->' }]);
    assert.strictEqual(scopes[0].text, '');
  });

  test('11. a gap is reported', () => {
    const { scopes, errors } = ghTrd.parseScopeComments([scopeComment(1, 1, 'a'), scopeComment(2, 3, 'c')]);
    assert.deepStrictEqual(scopes.map((s) => s.n), [1, 3]);
    assert.ok(errors.includes('gap before n=3'), JSON.stringify(errors));
  });

  test('11. scopes that do not start at n=1 report the gap', () => {
    const { errors } = ghTrd.parseScopeComments([scopeComment(1, 2, 'b')]);
    assert.ok(errors.includes('gap before n=2'), JSON.stringify(errors));
  });

  test('11. a duplicate n keeps the first by comment id and names the duplicate', () => {
    const { scopes, errors } = ghTrd.parseScopeComments([
      scopeComment(21, 2, 'later duplicate'),
      scopeComment(10, 1, 'one'),
      scopeComment(20, 2, 'earlier duplicate'),
    ]);
    assert.deepStrictEqual(scopes.map((s) => [s.n, s.comment_id, s.text]), [
      [1, 10, 'one'],
      [2, 20, 'earlier duplicate'],
    ]);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /duplicate n=2/);
    assert.match(errors[0], /20/);
    assert.match(errors[0], /21/);
  });

  test('11. n=0 is invalid and skipped', () => {
    const { scopes, errors } = ghTrd.parseScopeComments([scopeComment(1, 0, 'zero')]);
    assert.deepStrictEqual(scopes, []);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /n=0/);
  });

  test('comment id Infinity (a not-yet-posted comment) sorts last among duplicates', () => {
    const { scopes } = ghTrd.parseScopeComments([
      scopeComment(Infinity, 1, 'pending'),
      scopeComment(7, 1, 'posted'),
    ]);
    assert.strictEqual(scopes[0].comment_id, 7);
  });

  test('parseScopeComments requires an array', () => {
    assert.throws(() => ghTrd.parseScopeComments(undefined), TypeError);
  });
});

describe('effectiveSpec', () => {
  const TEXT = '# TRD\n\nbody\n';
  const C1 = scopeComment(10, 1, 'first change');
  const C2 = scopeComment(20, 2, 'second change');
  const C3 = scopeComment(30, 3, 'third change');

  test('12. effective spec = text + comments in n order, each preceded by a blank line', () => {
    // supplied out of order on purpose
    const eff = ghTrd.effectiveSpec(TEXT, [C3, C1, C2]);
    assert.strictEqual(eff.text, TEXT + '\n\n' + C1.body + '\n\n' + C2.body + '\n\n' + C3.body);
    assert.deepStrictEqual(eff.applied, [1, 2, 3]);
    assert.strictEqual(eff.overflow, false);
    assert.deepStrictEqual(eff.errors, []);
  });

  test('12. with no scope comments the effective spec is the text itself', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [{ id: 1, body: 'chatter' }]);
    assert.strictEqual(eff.text, TEXT);
    assert.deepStrictEqual(eff.applied, []);
  });

  test('12. chars without id/file is the effective text length', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [C1]);
    assert.strictEqual(eff.chars, eff.text.length);
  });

  test('12. chars with id and file is the encoded body length', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [C1], { id: ID, file: FILE });
    assert.strictEqual(eff.chars, ghTrd.encodeTrdBody({ id: ID, file: FILE, text: eff.text }).length);
  });

  test('12. a duplicate n applies only the kept comment and surfaces the error', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [scopeComment(5, 1, 'kept'), scopeComment(6, 1, 'dropped')]);
    assert.deepStrictEqual(eff.applied, [1]);
    assert.ok(eff.text.includes('kept'));
    assert.ok(!eff.text.includes('dropped'));
    assert.strictEqual(eff.errors.length, 1);
  });

  test('13. foldedThrough skips scopes the body already contains', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [C1, C2, C3], { foldedThrough: 2 });
    assert.deepStrictEqual(eff.applied, [3]);
    assert.strictEqual(eff.text, TEXT + '\n\n' + C3.body);
  });

  test('13. foldedThrough covering every scope applies nothing', () => {
    const eff = ghTrd.effectiveSpec(TEXT, [C1, C2], { foldedThrough: 2 });
    assert.deepStrictEqual(eff.applied, []);
    assert.strictEqual(eff.text, TEXT);
  });

  test('14. an effective spec whose encoded body exceeds 60,000 chars overflows; the spec is still returned', () => {
    // encoded base is 59,990 chars; the scope comment pushes it over
    const base = textOfEncodedLength(59990);
    const c = scopeComment(1, 1, 'tiny change');
    const eff = ghTrd.effectiveSpec(base, [c], { id: ID, file: FILE });
    assert.strictEqual(eff.overflow, true);
    assert.ok(eff.chars > 60000);
    assert.strictEqual(eff.text, base + '\n\n' + c.body);
    assert.deepStrictEqual(eff.applied, [1]);
  });

  test('14. exactly 60,000 encoded chars does not overflow', () => {
    // pick the comment text length so the encoded effective body is exactly 60,000
    const c0 = scopeComment(1, 1, '');
    const base = textOfEncodedLength(60000 - 2 - c0.body.length);
    const eff = ghTrd.effectiveSpec(base, [c0], { id: ID, file: FILE });
    assert.strictEqual(eff.chars, 60000);
    assert.strictEqual(eff.overflow, false);
  });

  test('effectiveSpec requires string text and an array of comments', () => {
    assert.throws(() => ghTrd.effectiveSpec(undefined, []), TypeError);
    assert.throws(() => ghTrd.effectiveSpec('x', undefined), TypeError);
  });
});

// ─── spec-rev log (tests 15-19) ──────────────────────────────────────────────

const H1 = 'sha256:' + 'a'.repeat(64);
const H2 = 'sha256:' + 'b'.repeat(64);
const H3 = 'sha256:' + 'c'.repeat(64);
const T1 = '2026-10-01T10:00:00Z';
const T2 = '2026-10-02T09:00:00Z';
const T3 = '2026-10-03T12:00:00Z';

const TABLE_HEAD = '| rev | at | event | hash | chars |\n|---|---|---|---|---|\n';

describe('spec-rev: specRevLine / appendSpecRev', () => {
  test('specRevLine renders one table row', () => {
    assert.strictEqual(
      ghTrd.specRevLine(1, { at: T1, event: 'freeze', hash: H1, chars: 18234 }),
      `| 1 | ${T1} | freeze | ${H1} | 18234 |`
    );
  });

  test('specRevLine rejects cells that would break the table', () => {
    const ok = { at: T1, event: 'freeze', hash: H1, chars: 1 };
    assert.throws(() => ghTrd.specRevLine(1, { ...ok, event: 'a | b' }), TypeError);
    assert.throws(() => ghTrd.specRevLine(1, { ...ok, event: 'a\nb' }), TypeError);
    assert.throws(() => ghTrd.specRevLine(1, { ...ok, at: 'x|y' }), TypeError);
    assert.throws(() => ghTrd.specRevLine(1, { ...ok, hash: 'nope' }), TypeError);
    assert.throws(() => ghTrd.specRevLine(1, { ...ok, chars: -1 }), TypeError);
    assert.throws(() => ghTrd.specRevLine(0, ok), TypeError);
  });

  test('15. appending to an empty log creates the table header and row 1', () => {
    const out = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 18234 });
    assert.strictEqual(out, TABLE_HEAD + `| 1 | ${T1} | freeze | ${H1} | 18234 |\n`);
  });

  test('15. null/undefined is treated as an empty log', () => {
    const e = { at: T1, event: 'freeze', hash: H1, chars: 1 };
    assert.strictEqual(ghTrd.appendSpecRev(null, e), ghTrd.appendSpecRev('', e));
    assert.strictEqual(ghTrd.appendSpecRev(undefined, e), ghTrd.appendSpecRev('', e));
  });

  test('15. a second distinct entry becomes rev 2, directly under rev 1', () => {
    const one = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 100 });
    const two = ghTrd.appendSpecRev(one, { at: T2, event: 'scope n=1', hash: H2, chars: 200 });
    assert.strictEqual(
      two,
      TABLE_HEAD +
        `| 1 | ${T1} | freeze | ${H1} | 100 |\n` +
        `| 2 | ${T2} | scope n=1 | ${H2} | 200 |\n`
    );
  });

  test('15. the marker line posted by the caller is preserved and the table is appended after it', () => {
    const marker = '<!-- devflow:id=47-01 kind=spec-rev -->\n';
    const out = ghTrd.appendSpecRev(marker, { at: T1, event: 'freeze', hash: H1, chars: 1 });
    assert.ok(out.startsWith(marker + TABLE_HEAD), out);
    assert.strictEqual(ghTrd.parseSpecRev(out).entries.length, 1);
    // and a later append goes under the existing row, keeping the marker first
    const out2 = ghTrd.appendSpecRev(out, { at: T2, event: 'scope n=1', hash: H2, chars: 2 });
    assert.ok(out2.startsWith(marker + TABLE_HEAD), out2);
    assert.deepStrictEqual(ghTrd.parseSpecRev(out2).entries.map((e) => e.rev), [1, 2]);
  });

  test('15. a log whose trailing newline was stripped in transit still appends cleanly', () => {
    const one = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 1 }).replace(/\n$/, '');
    const two = ghTrd.appendSpecRev(one, { at: T2, event: 'scope n=1', hash: H2, chars: 2 });
    assert.deepStrictEqual(ghTrd.parseSpecRev(two).entries.map((e) => e.rev), [1, 2]);
  });

  test('16. an entry whose event and hash already appear is a no-op (same string back)', () => {
    const one = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 100 });
    const again = ghTrd.appendSpecRev(one, { at: T3, event: 'freeze', hash: H1, chars: 100 });
    assert.strictEqual(again, one);
  });

  test('16. same event with a different hash, or same hash with a different event, is appended', () => {
    const one = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 100 });
    const sameEvent = ghTrd.appendSpecRev(one, { at: T2, event: 'freeze', hash: H2, chars: 100 });
    assert.strictEqual(ghTrd.parseSpecRev(sameEvent).entries.length, 2);
    const sameHash = ghTrd.appendSpecRev(one, { at: T2, event: 'scope n=1', hash: H1, chars: 100 });
    assert.strictEqual(ghTrd.parseSpecRev(sameHash).entries.length, 2);
  });

  test('17. human text after the table survives an append and the new row stays inside the table', () => {
    const table = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 100 });
    const withNote = table + '\nNote from a human: do not edit rows.\n';
    const out = ghTrd.appendSpecRev(withNote, { at: T2, event: 'scope n=1', hash: H2, chars: 200 });
    assert.ok(out.endsWith('\nNote from a human: do not edit rows.\n'));
    assert.ok(
      out.indexOf(`| 2 | ${T2} |`) < out.indexOf('Note from a human'),
      'new row must be above the note'
    );
    assert.deepStrictEqual(ghTrd.parseSpecRev(out).entries.map((e) => e.rev), [1, 2]);
  });

  test('appendSpecRev numbers the next rev after the highest existing rev', () => {
    const text = TABLE_HEAD + `| 1 | ${T1} | freeze | ${H1} | 1 |\n| 5 | ${T2} | scope n=1 | ${H2} | 2 |\n`;
    const out = ghTrd.appendSpecRev(text, { at: T3, event: 'scope n=2', hash: H3, chars: 3 });
    assert.deepStrictEqual(ghTrd.parseSpecRev(out).entries.map((e) => e.rev), [1, 5, 6]);
  });
});

describe('spec-rev: parseSpecRev / isFrozen / assertEditable', () => {
  function logOf(...entries) {
    return entries.reduce((t, e) => ghTrd.appendSpecRev(t, e), '');
  }

  test('17. parseSpecRev returns the entries in order', () => {
    const text = logOf(
      { at: T1, event: 'freeze', hash: H1, chars: 100 },
      { at: T2, event: 'scope n=1', hash: H2, chars: 200 }
    );
    const rev = ghTrd.parseSpecRev(text);
    assert.deepStrictEqual(rev.entries, [
      { rev: 1, at: T1, event: 'freeze', hash: H1, chars: 100 },
      { rev: 2, at: T2, event: 'scope n=1', hash: H2, chars: 200 },
    ]);
    assert.strictEqual(rev.frozen, true);
    assert.strictEqual(rev.folded_through, 0);
    assert.deepStrictEqual(rev.last, rev.entries[1]);
  });

  test('17. folded_through comes from the highest fold row', () => {
    const text = logOf(
      { at: T1, event: 'freeze', hash: H1, chars: 1 },
      { at: T2, event: `fold folded_through=2 from=${H1}`, hash: H2, chars: 2 },
      { at: T3, event: `fold folded_through=3 from=${H2}`, hash: H3, chars: 3 }
    );
    assert.strictEqual(ghTrd.parseSpecRev(text).folded_through, 3);
  });

  test('17. an empty or missing log: no entries, not frozen, nothing folded', () => {
    for (const empty of ['', null, undefined, '<!-- devflow:id=47-01 kind=spec-rev -->\n']) {
      const rev = ghTrd.parseSpecRev(empty);
      assert.deepStrictEqual(rev.entries, []);
      assert.strictEqual(rev.frozen, false);
      assert.strictEqual(rev.folded_through, 0);
      assert.strictEqual(rev.last, null);
    }
  });

  test('17. only rows matching "| <digits> | " are read; the header, separator and prose are ignored', () => {
    const text =
      '<!-- devflow:id=47-01 kind=spec-rev -->\n' +
      TABLE_HEAD +
      `| 1 | ${T1} | freeze | ${H1} | 18234 |\n` +
      '\n| not | a | row |\nfree prose with | pipes |\n| 2 | broken row\n';
    const rev = ghTrd.parseSpecRev(text);
    assert.strictEqual(rev.entries.length, 1);
    assert.strictEqual(rev.entries[0].chars, 18234);
  });

  test('parseSpecRev tolerates CRLF', () => {
    const text = (TABLE_HEAD + `| 1 | ${T1} | freeze | ${H1} | 5 |\n`).replace(/\n/g, '\r\n');
    assert.strictEqual(ghTrd.parseSpecRev(text).entries.length, 1);
  });

  test('18. isFrozen is true once a freeze entry exists', () => {
    assert.strictEqual(ghTrd.isFrozen(''), false);
    assert.strictEqual(ghTrd.isFrozen(logOf({ at: T1, event: 'scope n=1', hash: H1, chars: 1 })), false);
    assert.strictEqual(ghTrd.isFrozen(logOf({ at: T1, event: 'freeze', hash: H1, chars: 1 })), true);
  });

  test('18. assertEditable refuses a frozen TRD and allows an unfrozen one', () => {
    const frozen = ghTrd.assertEditable({ specRev: logOf({ at: T1, event: 'freeze', hash: H1, chars: 1 }) });
    assert.strictEqual(frozen.ok, false);
    assert.strictEqual(frozen.reason, 'frozen');
    assert.match(frozen.error, /frozen/);

    assert.deepStrictEqual(ghTrd.assertEditable({ specRev: '' }), { ok: true });
    assert.deepStrictEqual(ghTrd.assertEditable({}), { ok: true });
    assert.deepStrictEqual(ghTrd.assertEditable(), { ok: true });
  });
});

describe('spec-rev: detectDrift', () => {
  const body = ghTrd.encodeTrdBody(makeTrd());

  test('19. the last logged hash equals the body hash: no drift', () => {
    const log = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: ghTrd.contentHash(body), chars: body.length });
    assert.deepStrictEqual(ghTrd.detectDrift(body, log), { drift: false });
  });

  test('19. a different body hash is drift, with expected and actual', () => {
    const log = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: ghTrd.contentHash(body), chars: body.length });
    const edited = body + 'an edit made on github.com\n';
    assert.deepStrictEqual(ghTrd.detectDrift(edited, log), {
      drift: true,
      expected: ghTrd.contentHash(body),
      actual: ghTrd.contentHash(edited),
    });
  });

  test('19. an empty log is unlogged, not drift', () => {
    assert.deepStrictEqual(ghTrd.detectDrift(body, ''), { drift: false, unlogged: true });
    assert.deepStrictEqual(ghTrd.detectDrift(body, null), { drift: false, unlogged: true });
  });

  test('19. CRLF in the live body does not register as drift', () => {
    const log = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: ghTrd.contentHash(body), chars: body.length });
    assert.deepStrictEqual(ghTrd.detectDrift(body.replace(/\n/g, '\r\n'), log), { drift: false });
  });

  test('scope rows (which hash the effective spec, not the body) never cause false drift', () => {
    let log = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: ghTrd.contentHash(body), chars: body.length });
    log = ghTrd.appendSpecRev(log, { at: T2, event: 'scope n=1', hash: H2, chars: body.length + 50 });
    assert.deepStrictEqual(ghTrd.detectDrift(body, log), { drift: false });
  });

  test('a log holding only scope rows is unlogged', () => {
    const log = ghTrd.appendSpecRev('', { at: T2, event: 'scope n=1', hash: H2, chars: 5 });
    assert.deepStrictEqual(ghTrd.detectDrift(body, log), { drift: false, unlogged: true });
  });

  test('after a fold the fold row is the body reference', () => {
    let log = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: H1, chars: 1 });
    log = ghTrd.appendSpecRev(log, {
      at: T3,
      event: `fold folded_through=1 from=${H1}`,
      hash: ghTrd.contentHash(body),
      chars: body.length,
    });
    assert.deepStrictEqual(ghTrd.detectDrift(body, log), { drift: false });
  });
});

// ─── Fold (tests 20-21) ──────────────────────────────────────────────────────

describe('planFold', () => {
  const TEXT = '---\nobjective: 47\n---\n\n# TRD\n\nbody\n';
  const body = ghTrd.encodeTrdBody({ id: ID, file: FILE, text: TEXT });
  const C1 = scopeComment(10, 1, 'first change');
  const C2 = scopeComment(20, 2, 'second change');
  const C3 = scopeComment(30, 3, 'third change');
  const frozenLog = ghTrd.appendSpecRev('', { at: T1, event: 'freeze', hash: ghTrd.contentHash(body), chars: body.length });

  test('20. scopes that fit produce a folded body and a fold entry', () => {
    const res = ghTrd.planFold(body, [C2, C1, C3], frozenLog, T3);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.fits, true);
    const effective = TEXT + '\n\n' + C1.body + '\n\n' + C2.body + '\n\n' + C3.body;
    assert.strictEqual(ghTrd.decodeTrdBody(res.newBody).text, effective);
    assert.deepStrictEqual(res.entry, {
      at: T3,
      event: `fold folded_through=3 from=${ghTrd.contentHash(body)}`,
      hash: ghTrd.contentHash(res.newBody),
      chars: res.newBody.length,
    });
    // header preserved
    assert.strictEqual(ghTrd.decodeTrdBody(res.newBody).id, ID);
    assert.strictEqual(ghTrd.decodeTrdBody(res.newBody).file, FILE);
  });

  test('20. the fold works on a frozen TRD (fold is the one sanctioned post-close edit)', () => {
    assert.strictEqual(ghTrd.isFrozen(frozenLog), true);
    assert.strictEqual(ghTrd.planFold(body, [C1], frozenLog, T3).ok, true);
  });

  test('20. the entry appends to the log and is idempotent', () => {
    const res = ghTrd.planFold(body, [C1, C2], frozenLog, T3);
    const log2 = ghTrd.appendSpecRev(frozenLog, res.entry);
    assert.strictEqual(ghTrd.parseSpecRev(log2).folded_through, 2);
    assert.strictEqual(ghTrd.appendSpecRev(log2, res.entry), log2);
  });

  test('20. nothing to fold is a no-op', () => {
    assert.deepStrictEqual(ghTrd.planFold(body, [], frozenLog, T3), { ok: true, fits: true, noop: true });
    assert.deepStrictEqual(ghTrd.planFold(body, [{ id: 1, body: 'chatter' }], frozenLog, T3), {
      ok: true,
      fits: true,
      noop: true,
    });
  });

  test('20. scopes already folded are not applied again', () => {
    const first = ghTrd.planFold(body, [C1, C2], frozenLog, T2);
    const log2 = ghTrd.appendSpecRev(frozenLog, first.entry);
    // everything folded: a re-run is a no-op
    assert.deepStrictEqual(ghTrd.planFold(first.newBody, [C1, C2], log2, T3), { ok: true, fits: true, noop: true });
    // a later scope n=3 folds on top of the folded body, and only n=3 is added
    const second = ghTrd.planFold(first.newBody, [C1, C2, C3], log2, T3);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.entry.event, `fold folded_through=3 from=${ghTrd.contentHash(first.newBody)}`);
    const text2 = ghTrd.decodeTrdBody(second.newBody).text;
    assert.strictEqual(text2, ghTrd.decodeTrdBody(first.newBody).text + '\n\n' + C3.body);
    assert.strictEqual(text2.split('<!-- devflow:scope n=1 -->').length - 1, 1, 'n=1 appears exactly once');
  });

  test('21. an effective spec over 60,000 does not fit: ok, fits:false, no newBody', () => {
    const big = ghTrd.encodeTrdBody({ id: ID, file: FILE, text: textOfEncodedLength(59990) });
    const res = ghTrd.planFold(big, [scopeComment(1, 1, 'tiny change')], '', T3);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.fits, false);
    assert.ok(!('newBody' in res));
    assert.ok(!('entry' in res));
  });

  test('21. exactly 60,000 encoded chars still fits', () => {
    const c0 = scopeComment(1, 1, '');
    const exact = ghTrd.encodeTrdBody({
      id: ID,
      file: FILE,
      text: textOfEncodedLength(60000 - 2 - c0.body.length),
    });
    const res = ghTrd.planFold(exact, [c0], '', T3);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.fits, true);
    assert.strictEqual(res.newBody.length, 60000);
  });

  test('21. scope errors (gap, duplicate) refuse the fold', () => {
    const gap = ghTrd.planFold(body, [C1, C3], frozenLog, T3);
    assert.strictEqual(gap.ok, false);
    assert.match(gap.error, /gap before n=3/);
    const dup = ghTrd.planFold(body, [C1, scopeComment(11, 1, 'again')], frozenLog, T3);
    assert.strictEqual(dup.ok, false);
    assert.match(dup.error, /duplicate n=1/);
  });

  test('21. a body that is not a devflow TRD is refused', () => {
    const res = ghTrd.planFold('hand written issue', [C1], '', T3);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /not a devflow TRD body/);
  });

  test('planFold requires an array of comments', () => {
    assert.throws(() => ghTrd.planFold(body, undefined, '', T3), TypeError);
  });
});

// ─── Numbered parts (tests 22-24) ────────────────────────────────────────────

const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// Strip the part line from one part (what a comment reader does after dropping the marker).
function partBody(part) {
  return part.replace(/^<!-- devflow:part=\d+\/\d+ -->\n/, '');
}

describe('partLine', () => {
  test('24. partLine(2,3) is the locked form', () => {
    assert.strictEqual(ghTrd.partLine(2, 3), '<!-- devflow:part=2/3 -->');
  });

  test('24. partLine rejects bad indices', () => {
    assert.throws(() => ghTrd.partLine(0, 3), TypeError);
    assert.throws(() => ghTrd.partLine(4, 3), TypeError);
    assert.throws(() => ghTrd.partLine(1.5, 3), TypeError);
    assert.throws(() => ghTrd.partLine(1, 0), TypeError);
  });
});

describe('splitParts', () => {
  const PARAS = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40)];
  const TEXT = PARAS.join('\n\n');

  test('22. paragraphs of 40 chars split into parts that each fit 100, header included', () => {
    const parts = ghTrd.splitParts(TEXT, 100);
    assert.ok(parts.length > 1);
    parts.forEach((p, i) => {
      assert.ok(p.length <= 100, `part ${i + 1} is ${p.length} chars`);
      assert.ok(p.startsWith(ghTrd.partLine(i + 1, parts.length) + '\n'), `part ${i + 1} header`);
    });
    const joined = ghTrd.joinParts(parts);
    assert.deepStrictEqual(joined, { ok: true, text: TEXT, missing: [] });
  });

  test('22. splits fall on blank-line boundaries when paragraphs fit', () => {
    const parts = ghTrd.splitParts(TEXT, 100);
    for (const p of parts.slice(0, -1)) {
      assert.ok(partBody(p).endsWith('\n\n'), 'a non-final part ends at a paragraph boundary');
    }
    for (const p of parts) assert.match(partBody(p), /^[abcd]/, 'no part starts mid-paragraph');
  });

  test('22. a text under the limit is one part with no part header', () => {
    assert.deepStrictEqual(ghTrd.splitParts('short text', 100), ['short text']);
    assert.deepStrictEqual(ghTrd.splitParts('', 100), ['']);
    assert.deepStrictEqual(ghTrd.joinParts(['short text']), { ok: true, text: 'short text', missing: [] });
  });

  test('22. exactly at the limit is one part; one over is split', () => {
    assert.strictEqual(ghTrd.splitParts('x'.repeat(100), 100).length, 1);
    assert.ok(ghTrd.splitParts('x'.repeat(101), 100).length > 1);
  });

  test('22. reserve counts against each part so the final comment fits', () => {
    const parts = ghTrd.splitParts(TEXT, 100, { reserve: 30 });
    assert.ok(parts.length > 1);
    for (const p of parts) assert.ok(p.length + 30 <= 100, `${p.length} + 30 > 100`);
    assert.strictEqual(ghTrd.joinParts(parts).text, TEXT);
  });

  test('22. reserve can push an otherwise-fitting text into parts', () => {
    const text = 'x'.repeat(80);
    assert.strictEqual(ghTrd.splitParts(text, 100).length, 1);
    assert.ok(ghTrd.splitParts(text, 100, { reserve: 30 }).length > 1);
  });

  test('22. the default limit is COMMENT_MAX_CHARS', () => {
    const text = 'x'.repeat(130000);
    const parts = ghTrd.splitParts(text);
    assert.strictEqual(parts.length, 3);
    for (const p of parts) assert.ok(p.length <= ghTrd.COMMENT_MAX_CHARS);
    assert.strictEqual(ghTrd.joinParts(parts).text, text);
  });

  test('22. text is never trimmed: leading, trailing and repeated newlines survive', () => {
    for (const text of [
      '\n\n' + TEXT + '\n\n\n',
      TEXT + '\n',
      PARAS.join('\n\n\n\n'),
      '   ' + TEXT + '   ',
    ]) {
      const parts = ghTrd.splitParts(text, 100);
      assert.strictEqual(ghTrd.joinParts(parts).text, text);
      for (const p of parts) assert.ok(p.length <= 100);
    }
  });

  test('22. part numbers that roll over to two digits still fit (header width is accounted for)', () => {
    // 10 paragraphs of 72 chars. With a 1-digit header a paragraph plus its
    // separator (74) fits exactly; the 2-digit header ("10/10") is wider, so it must not.
    const text = Array.from({ length: 10 }, (_, i) => String.fromCharCode(97 + i).repeat(72)).join('\n\n');
    const parts = ghTrd.splitParts(text, 100);
    assert.ok(parts.length >= 10);
    for (const p of parts) assert.ok(p.length <= 100, `${p.length} chars`);
    assert.strictEqual(ghTrd.joinParts(parts).text, text);
    assert.ok(parts[0].startsWith(`<!-- devflow:part=1/${parts.length} -->\n`));
  });

  test('23. a single 250-char paragraph with no newline is hard-split losslessly', () => {
    const text = 'x'.repeat(250);
    const parts = ghTrd.splitParts(text, 100);
    assert.ok(parts.length >= 3);
    for (const p of parts) assert.ok(p.length <= 100);
    assert.strictEqual(ghTrd.joinParts(parts).text, text);
  });

  test('23. an oversized paragraph is split at the last newline before the limit when there is one', () => {
    const text = Array.from({ length: 9 }, (_, i) => String(i).repeat(29)).join('\n'); // 29 chars + \n, no blank line
    const parts = ghTrd.splitParts(text, 100);
    assert.ok(parts.length > 1);
    for (const p of parts.slice(0, -1)) {
      assert.ok(partBody(p).endsWith('\n'), 'split lands just after a newline, not mid-line');
    }
    for (const p of parts) assert.ok(p.length <= 100);
    assert.strictEqual(ghTrd.joinParts(parts).text, text);
  });

  test('23. a hard split never cuts a surrogate pair in half', () => {
    for (let lead = 0; lead < 4; lead++) {
      const text = 'x'.repeat(lead) + '\u{1F600}'.repeat(60); // 2 UTF-16 units each
      const parts = ghTrd.splitParts(text, 100);
      for (const p of parts) {
        assert.ok(p.length <= 100);
        assert.ok(!LONE_SURROGATE_RE.test(p), `lead=${lead}: lone surrogate in a part`);
      }
      assert.strictEqual(ghTrd.joinParts(parts).text, text, `lead=${lead}`);
    }
  });

  test('23. text that itself begins with a part line still round-trips', () => {
    const text = ghTrd.partLine(1, 2) + '\nthis is real content\n';
    const parts = ghTrd.splitParts(text, 200);
    assert.deepStrictEqual(ghTrd.joinParts(parts), { ok: true, text, missing: [] });
  });

  test('a limit too small for the part header is refused', () => {
    assert.throws(() => ghTrd.splitParts('x'.repeat(200), 20), RangeError);
    assert.throws(() => ghTrd.splitParts('x'.repeat(200), 100, { reserve: 100 }), RangeError);
  });

  test('splitParts requires a string and a positive integer limit', () => {
    assert.throws(() => ghTrd.splitParts(undefined, 100), TypeError);
    assert.throws(() => ghTrd.splitParts('x', 0), TypeError);
    assert.throws(() => ghTrd.splitParts('x', 10.5), TypeError);
  });
});

describe('joinParts', () => {
  const p = (i, n, chunk) => `${ghTrd.partLine(i, n)}\n${chunk}`;

  test('24. orders by part index even if given out of order', () => {
    const joined = ghTrd.joinParts([p(3, 3, 'C'), p(1, 3, 'A'), p(2, 3, 'B')]);
    assert.deepStrictEqual(joined, { ok: true, text: 'ABC', missing: [] });
  });

  test('24. reports a missing part', () => {
    const joined = ghTrd.joinParts([p(1, 3, 'A'), p(3, 3, 'C')]);
    assert.strictEqual(joined.ok, false);
    assert.deepStrictEqual(joined.missing, [2]);
    assert.strictEqual(joined.text, null);
  });

  test('24. reports a missing final part', () => {
    const joined = ghTrd.joinParts([p(1, 3, 'A'), p(2, 3, 'B')]);
    assert.strictEqual(joined.ok, false);
    assert.deepStrictEqual(joined.missing, [3]);
  });

  test('a duplicate part index is refused', () => {
    const joined = ghTrd.joinParts([p(1, 2, 'A'), p(1, 2, 'A2'), p(2, 2, 'B')]);
    assert.strictEqual(joined.ok, false);
    assert.match(joined.error, /duplicate part 1/);
  });

  test('disagreeing part counts are refused', () => {
    const joined = ghTrd.joinParts([p(1, 2, 'A'), p(2, 3, 'B')]);
    assert.strictEqual(joined.ok, false);
    assert.match(joined.error, /part count/);
  });

  test('a headerless part mixed with headered parts is refused', () => {
    const joined = ghTrd.joinParts([p(1, 2, 'A'), 'plain']);
    assert.strictEqual(joined.ok, false);
  });

  test('several headerless strings are ambiguous and refused; zero parts are refused', () => {
    assert.strictEqual(ghTrd.joinParts(['a', 'b']).ok, false);
    assert.strictEqual(ghTrd.joinParts([]).ok, false);
  });

  test('joinParts requires an array of strings', () => {
    assert.throws(() => ghTrd.joinParts(undefined), TypeError);
    assert.throws(() => ghTrd.joinParts([1]), TypeError);
  });
});

// ─── Entity codec (48-02, tests 2-4) ─────────────────────────────────────────
//
// Todos, debug sessions and quick tasks are issues whose body is the entity codec:
// an entity id line, a file line carrying the path RELATIVE TO `.planning/`, then
// the file verbatim. It is a separate codec from the TRD one, so neither decoder
// accepts the other's body.

describe('entity codec (48-02)', () => {
  const TODO = {
    id: 'todo-2026-07-31-a',
    file: 'todos/pending/2026-07-31-a.md',
    text: '---\ncreated: 2026-07-31\ntitle: a\n---\n\nbody\n',
  };
  const DEBUG = { id: 'debug-login-loop', file: 'debug/login-loop.md', text: '# Debug: login loop\n\n## Symptoms\n' };
  const QUICK = { id: 'quick-12', file: 'quick/12-fix-x/12-JOB.md', text: 'no trailing newline' };

  test('2. encodeEntityBody is the id line, the file line, then the text', () => {
    assert.strictEqual(
      ghTrd.encodeEntityBody(TODO),
      '<!-- devflow:id=todo-2026-07-31-a -->\n' +
        '<!-- devflow:file=todos/pending/2026-07-31-a.md -->\n' +
        '---\ncreated: 2026-07-31\ntitle: a\n---\n\nbody\n'
    );
  });

  test('2. todo, debug and quick bodies round-trip byte-exactly', () => {
    for (const entity of [TODO, DEBUG, QUICK]) {
      const body = ghTrd.encodeEntityBody(entity);
      assert.deepStrictEqual(ghTrd.decodeEntityBody(body), {
        ok: true,
        id: entity.id,
        file: entity.file,
        text: entity.text,
      });
    }
  });

  test('2. a hand-written entity body decodes', () => {
    const body = '<!-- devflow:id=debug-x -->\n<!-- devflow:file=debug/resolved/x.md -->\n# x\n';
    assert.deepStrictEqual(ghTrd.decodeEntityBody(body), {
      ok: true,
      id: 'debug-x',
      file: 'debug/resolved/x.md',
      text: '# x\n',
    });
  });

  test('2. CRLF is normalised on encode and on decode', () => {
    const encoded = ghTrd.encodeEntityBody({ id: 'todo-a', file: 'todos/pending/a.md', text: 'a\r\nb\r\n' });
    assert.strictEqual(encoded, '<!-- devflow:id=todo-a -->\n<!-- devflow:file=todos/pending/a.md -->\na\nb\n');

    const crlfBody = '<!-- devflow:id=todo-a -->\r\n<!-- devflow:file=todos/pending/a.md -->\r\na\r\nb\r\n';
    assert.deepStrictEqual(ghTrd.decodeEntityBody(crlfBody), {
      ok: true,
      id: 'todo-a',
      file: 'todos/pending/a.md',
      text: 'a\nb\n',
    });
  });

  test('2. empty text round-trips, also when the trailing newline was stripped', () => {
    const body = ghTrd.encodeEntityBody({ id: 'quick-3', file: 'quick/3-x/3-JOB.md', text: '' });
    assert.strictEqual(body, '<!-- devflow:id=quick-3 -->\n<!-- devflow:file=quick/3-x/3-JOB.md -->\n');
    const expected = { ok: true, id: 'quick-3', file: 'quick/3-x/3-JOB.md', text: '' };
    assert.deepStrictEqual(ghTrd.decodeEntityBody(body), expected);
    assert.deepStrictEqual(ghTrd.decodeEntityBody(body.slice(0, -1)), expected);
  });

  test('3. decodeTrdBody refuses an entity body', () => {
    for (const entity of [TODO, DEBUG, QUICK]) {
      const dec = ghTrd.decodeTrdBody(ghTrd.encodeEntityBody(entity));
      assert.strictEqual(dec.ok, false, entity.id);
      assert.strictEqual(typeof dec.error, 'string');
    }
  });

  test('3. decodeEntityBody refuses a TRD body', () => {
    const trdBody = ghTrd.encodeTrdBody(makeTrd());
    const dec = ghTrd.decodeEntityBody(trdBody);
    assert.strictEqual(dec.ok, false);
    assert.strictEqual(typeof dec.error, 'string');
    // A hand-written TRD body too, so the refusal does not depend on encodeTrdBody.
    assert.strictEqual(ghTrd.decodeEntityBody(header('47-01', '47-01-x-TRD.md') + 'x\n').ok, false);
  });

  test('3. a human-written body or a non-string is {ok:false, error}', () => {
    for (const body of ['# Bug\n\nthe login loops\n', '', 'one line', null, undefined, 42]) {
      const dec = ghTrd.decodeEntityBody(body);
      assert.strictEqual(dec.ok, false, JSON.stringify(body));
      assert.strictEqual(typeof dec.error, 'string');
    }
  });

  test('3. headers out of order or a bad entity id line are refused', () => {
    const swapped = '<!-- devflow:file=todos/pending/a.md -->\n<!-- devflow:id=todo-a -->\nx\n';
    assert.strictEqual(ghTrd.decodeEntityBody(swapped).ok, false);
    const badId = '<!-- devflow:id=todo- -->\n<!-- devflow:file=todos/pending/a.md -->\nx\n';
    assert.strictEqual(ghTrd.decodeEntityBody(badId).ok, false);
    const noFile = '<!-- devflow:id=todo-a -->\nx\n';
    assert.strictEqual(ghTrd.decodeEntityBody(noFile).ok, false);
  });

  test('3. an entity body whose file path would escape .planning/ is refused', () => {
    for (const file of ['../x.md', '/etc/passwd', 'todos/../x.md', 'todos//x.md', 'todos/', '.skill-active', 'todos/.x', 'a\\b.md']) {
      const body = `<!-- devflow:id=todo-a -->\n<!-- devflow:file=${file} -->\nx\n`;
      assert.strictEqual(ghTrd.decodeEntityBody(body).ok, false, file);
    }
  });

  test('4. encodeEntityBody throws TypeError for an id outside the grammar', () => {
    const bad = ['todo-', 'quick-x', '47-01', 'debug-', 'quick-', 'Todo-a', 'todo-A', 'todo-.a', 'note-a', 'todo-a b', '', null, undefined, 47];
    for (const id of bad) {
      assert.throws(
        () => ghTrd.encodeEntityBody({ id, file: 'todos/pending/a.md', text: 'x' }),
        TypeError,
        JSON.stringify(id)
      );
    }
  });

  test('4. the stem is 1 to 100 chars', () => {
    const ok = 'todo-' + 'a'.repeat(100);
    assert.ok(ghTrd.encodeEntityBody({ id: ok, file: 'todos/pending/a.md', text: '' }).startsWith(`<!-- devflow:id=${ok} -->`));
    assert.throws(
      () => ghTrd.encodeEntityBody({ id: 'todo-' + 'a'.repeat(101), file: 'todos/pending/a.md', text: '' }),
      TypeError
    );
  });

  test('encodeEntityBody throws TypeError for an unsafe file or a non-string text', () => {
    for (const file of ['../x.md', '/abs.md', 'todos//x.md', '', '.hidden', null, undefined]) {
      assert.throws(() => ghTrd.encodeEntityBody({ id: 'todo-a', file, text: '' }), TypeError, JSON.stringify(file));
    }
    for (const text of [null, undefined, 1]) {
      assert.throws(() => ghTrd.encodeEntityBody({ id: 'todo-a', file: 'todos/pending/a.md', text }), TypeError);
    }
  });

  test('ENTITY_ID_RE accepts exactly todo-<stem>, debug-<stem> and quick-<N>', () => {
    assert.ok(ghTrd.ENTITY_ID_RE instanceof RegExp);
    for (const id of ['todo-a', 'todo-2026-07-31-harden-df-tools-health', 'debug-x.y_z', 'quick-12', 'quick-0']) {
      assert.ok(ghTrd.ENTITY_ID_RE.test(id), id);
    }
    for (const id of ['todo-', 'quick-x', '47-01', 'quick-1a', 'trd-a', 'todo-a\n']) {
      assert.ok(!ghTrd.ENTITY_ID_RE.test(id), id);
    }
  });

  test('ENTITY_ID_LINE_RE matches an entity id line and never a TRD id line', () => {
    assert.ok(ghTrd.ENTITY_ID_LINE_RE.test('<!-- devflow:id=quick-12 -->'));
    assert.ok(!ghTrd.ENTITY_ID_LINE_RE.test('<!-- devflow:id=47-01 -->'));
  });

  test('isSafeEntityPath accepts .planning-relative paths of safe segments only', () => {
    for (const p of ['todos/pending/a.md', 'todos/completed/a.md', 'debug/resolved/x.md', 'quick/12-fix-x/12-JOB.md', 'debug/x.md']) {
      assert.strictEqual(ghTrd.isSafeEntityPath(p), true, p);
    }
    for (const p of ['../x.md', '/x.md', 'x/../y.md', 'x//y.md', 'x/', '.x/y.md', 'x/.y', 'x\\y', '', null]) {
      assert.strictEqual(ghTrd.isSafeEntityPath(p), false, String(p));
    }
  });
});
