'use strict';

// regex-escape.repo.test.cjs (TRD 56-01, ONUM-01) — every regex escape in production df-tools and hooks goes through
// lib/text-escape.cjs.
//
// Objective 54 created text-escape.cjs (escapeRegExp, objectiveNumPattern, mdCell). Objective 56 builds regexes from
// objective numbers, labels and ids, so it needs one escape that CI enforces. This guard walks every production .cjs / .js
// file under devflow/bin and hooks/ and fails, naming file:line, on a hand-rolled escape:
//   meta-escape  a '\\$&' replacement. A backslash-prefixed whole-match back-reference exists only to escape regex
//                metacharacters, e.g. s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').
//   dot-escape   a partial, dot-only escape: .replace('.', '\\.') or .replace(/\./g, '\\.').
// Skipped: test files (*.test.cjs / *.test.js keep their own local helpers; test helpers are not modules), __fixtures__/,
// node_modules/, comment lines, and lib/text-escape.cjs itself. That exemption is by path, so a copy of the canonical
// escape under any other name or directory is still reported.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIB = __dirname;                                       // plugins/devflow/devflow/bin/lib
const BIN = path.resolve(LIB, '..');                         // plugins/devflow/devflow/bin
const HOOKS = path.resolve(LIB, '..', '..', '..', 'hooks');  // plugins/devflow/hooks
const PLUGIN = path.resolve(LIB, '..', '..', '..');          // plugins/devflow: failure messages are relative to it

// '\\$&' in source, in any quote style.
const META_ESCAPE = /(['"`])\\\\\$&\1/;
// .replace('.', '\\.') or .replace(/\./g, '\\.'): a dot-only escape.
const DOT_ESCAPE = /\.replace\(\s*(?:(['"])\.\1|\/\\\.\/g?)\s*,\s*(['"`])\\\\\.\2\s*\)/;
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

const toPosix = (rel) => rel.split(path.sep).join('/');
// The one file allowed to hold the escape, relative to the scanned root (devflow/bin).
const CANONICAL = 'lib/text-escape.cjs';

function skipFile(rel) {
  const parts = rel.split(path.sep);
  return /\.test\.c?js$/.test(rel) || parts.includes('__fixtures__') || parts.includes('node_modules')
    || toPosix(rel) === CANONICAL;
}

/** Every non-comment line of `text` that hand-rolls a regex escape, as { line, kind } (1-based line). */
function findHandRolled(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (isComment(line)) return;
    if (META_ESCAPE.test(line)) hits.push({ line: i + 1, kind: 'meta-escape' });
    else if (DOT_ESCAPE.test(line)) hits.push({ line: i + 1, kind: 'dot-escape' });
  });
  return hits;
}

/**
 * Walk each root recursively and scan every production .cjs / .js file. Returns [{ file, line, kind }] with absolute
 * file paths; pushes each scanned file onto `visited` so a caller can prove the walk is not vacuous.
 */
function scanTree(roots, visited = []) {
  const hits = [];
  const walk = (root, dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__fixtures__' || entry.name === 'node_modules') continue;
        walk(root, abs);
      } else if (entry.isFile() && /\.c?js$/.test(entry.name) && !skipFile(path.relative(root, abs))) {
        visited.push(abs);
        for (const h of findHandRolled(fs.readFileSync(abs, 'utf-8'))) hits.push({ file: abs, ...h });
      }
    }
  };
  for (const root of roots) walk(root, root);
  return hits;
}

// "file:line kind", the file relative to `base`, in '/' form.
const fmt = (hits, base) => hits.map((h) => `${toPosix(path.relative(base, h.file))}:${h.line} ${h.kind}`);

// Hand-built planted lines (the source text a scanned file would hold).
const META_LINE = 'const a = s.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\');';
const META_LINE_DQ = 'const b = x.replace(/[-/\\\\^$*+?.()|[\\]{}]/g, "\\\\$&");';
const DOT_LINE_STR = "const c = n.replace('.', '\\\\.');";
const DOT_LINE_RE = "const d = n.replace(/\\./g, '\\\\.');";
const ALL_FOUR = [META_LINE, META_LINE_DQ, DOT_LINE_STR, DOT_LINE_RE].join('\n');

describe('one regex escape, guarded in CI (TRD 56-01, ONUM-01)', () => {
  const planted = [];
  afterEach(() => {
    while (planted.length) fs.rmSync(planted.pop(), { recursive: true, force: true });
  });

  // { 'lib/bad.cjs': '...' } -> a fresh mkdtemp root holding those files.
  function plantTree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regex-escape-'));
    planted.push(root);
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(root, ...rel.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    return root;
  }

  test('0: the planted lines are the source text they claim to be', () => {
    assert.equal(META_LINE, String.raw`const a = s.replace(/[.*+?^$` + String.raw`{}()|[\]\\]/g, '\\$&');`);
    assert.equal(META_LINE_DQ, String.raw`const b = x.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");`);
    assert.equal(DOT_LINE_STR, String.raw`const c = n.replace('.', '\\.');`);
    assert.equal(DOT_LINE_RE, String.raw`const d = n.replace(/\./g, '\\.');`);
  });

  test('1: no production file under devflow/bin or hooks/ hand-rolls a regex escape', () => {
    const found = fmt(scanTree([BIN, HOOKS]), PLUGIN);
    assert.deepStrictEqual(found, [],
      `hand-rolled regex escape(s); use require('./text-escape.cjs').escapeRegExp instead:\n${found.join('\n')}`);
  });

  test('2: the walk is not vacuous: at least 100 production files, including hooks/ and lib/migrations/', () => {
    const visited = [];
    scanTree([BIN, HOOKS], visited);
    assert.ok(visited.length >= 100, `visited only ${visited.length} files (BIN=${BIN} HOOKS=${HOOKS})`);
    assert.ok(visited.some((f) => f.startsWith(HOOKS + path.sep)), `no file under ${HOOKS} was scanned`);
    assert.ok(visited.some((f) => f.startsWith(path.join(LIB, 'migrations') + path.sep)), 'lib/migrations/ is scanned');
    assert.ok(visited.includes(path.join(LIB, 'state.cjs')), 'lib/state.cjs is scanned');
    assert.ok(visited.includes(path.join(HOOKS, 'gate-executor-stop.js')), 'hooks/gate-executor-stop.js is scanned');
    const tests = visited.filter((f) => /\.test\.c?js$/.test(f) || f.split(path.sep).includes('__fixtures__'));
    assert.deepStrictEqual(tests, [], 'test files and fixtures are never scanned');
  });

  test('3: the exemption is real: lib/text-escape.cjs holds the canonical escape, and the scanner skips it', () => {
    const canonical = path.join(LIB, 'text-escape.cjs');
    const own = findHandRolled(fs.readFileSync(canonical, 'utf-8'));
    assert.ok(own.some((h) => h.kind === 'meta-escape'), "text-escape.cjs still contains the canonical '\\\\$&' escape");
    const visited = [];
    const hits = scanTree([BIN], visited);
    assert.ok(!visited.includes(canonical), 'the scanner skips lib/text-escape.cjs');
    assert.ok(hits.every((h) => h.file !== canonical));
  });

  test('4: a planted hand-rolled escape is reported with its file, line and kind', () => {
    const root = plantTree({
      'lib/bad.cjs': ["'use strict';", META_LINE, '', META_LINE_DQ, DOT_LINE_STR, DOT_LINE_RE, 'module.exports = {};'].join('\n'),
      'hooks/bad-hook.js': ['#!/usr/bin/env node', DOT_LINE_STR].join('\n'),
      // the exemption is by path: the canonical escape under another directory is a copy, and a copy is reported
      'lib/migrations/text-escape.cjs': META_LINE,
    });
    assert.deepStrictEqual(fmt(scanTree([root]), root).sort(), [
      'hooks/bad-hook.js:2 dot-escape',
      'lib/bad.cjs:2 meta-escape',
      'lib/bad.cjs:4 meta-escape',
      'lib/bad.cjs:5 dot-escape',
      'lib/bad.cjs:6 dot-escape',
      'lib/migrations/text-escape.cjs:1 meta-escape',
    ]);
  });

  test('5: tests, fixtures, comments, lib/text-escape.cjs, non-JS files and non-escapes are not reported', () => {
    const root = plantTree({
      'lib/bad.test.cjs': ALL_FOUR,
      'hooks/bad.test.js': ALL_FOUR,
      'lib/__fixtures__/f.cjs': ALL_FOUR,
      'lib/text-escape.cjs': ALL_FOUR,
      'lib/notes.md': ALL_FOUR,
      'lib/ok.cjs': [
        "// objEscaped = objectiveNum.replace('.', '\\\\.') was the old shape",
        '/* ' + DOT_LINE_RE + ' */',
        ' * ' + META_LINE,
        "const page = slug.replace(/\\./g, '_');",
        'const re = new RegExp(escapeRegExp(s));',
        "const v = version.replace('.', '_');",
      ].join('\n'),
    });
    const visited = [];
    assert.deepStrictEqual(fmt(scanTree([root], visited), root), []);
    assert.deepStrictEqual(visited.map((f) => toPosix(path.relative(root, f))), ['lib/ok.cjs'], 'only lib/ok.cjs is scanned');
  });
});
