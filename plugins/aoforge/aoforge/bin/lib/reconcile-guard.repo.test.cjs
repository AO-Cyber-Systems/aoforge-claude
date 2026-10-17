'use strict';

// Test list (TRD 79-02, objective 79-reconcile-and-release-3-1-0, SC-2 and the guard part of SC-3).
//
// Why this file exists. Objective 78 deleted five compat exports (the environment alias, the two-directory helper, the
// legacy-layout predicate, the legacy runtime home, the user-file resolver) while `main` kept writing code that called them.
// Merging the two lines did not flag the clash: git merges text, not imports, so the tree loaded until a caller ran.
// This guard makes the class impossible to bring back. It reads compat.cjs's real export list from the module (never
// a hard-coded copy), resolves every reference to compat in the tracked source by the module it comes from, and
// fails with file:line and the name. It also forbids a tracked pre-rename planning path, the other way a
// reconcile with `main` can regress.
//
// 1. repo: no tracked path under the pre-rename planning directory (`git ls-files -- <LEGACY.planningDir>` is empty).
// 2. repo: every compat reference in tracked *.cjs / *.js under plugins/ and scripts/ names a current compat export,
//    and no file that mentions compat.cjs defeats the lexer; a failure lists each `file:line name`.
// 3. repo: none of the five removed names is a compat export again or is referenced as one; the message names SC-2 of
//    objective 79 and says to fix the caller, not compat.cjs. The names are built from parts below, so a search of the
//    tree finds no call.
// 4. mutation: a scratch git repo holding a copy of compat.cjs and one file calling a removed export fails the tree
//    check; the same repo with the call removed passes; an unknown name lands in the other list; a tracked
//    pre-rename planning path is reported.
// 5. scanner: destructuring from a compat require, including renames (`{ a: b }`), defaults, multi-line patterns and a
//    require inside a function.
// 6. scanner: a member call or read on `require(...compat.cjs)` directly, including the hooks' fail-open try/catch.
// 7. scanner: a bound identifier (`const compat = require(...)`) then `compat.x` reads and calls, and a destructuring
//    of that identifier.
// 8. scanner: a stack pack's `require('./core.cjs')('compat.cjs')` and `core('compat.cjs')` forms.
// 9. scanner: absence assertions (`'x' in compat`, computed `compat[name]`, `typeof compat.x`,
//    `compat.x === undefined`, `assert.equal(compat.x, undefined)`) are not references; a plain read still is.
// 10. scanner: a same-named export required from planning-layout.cjs, coexistence.cjs or a fixture is not a compat
//    reference, and comments, strings, template bodies and regex literals that spell a require are not references.
//
// The scanner is a small lexer (comments, strings, templates and regex literals are blanked, so a sample require in a
// string is data) plus regexes over what is left. Supported reference forms are the ones present in the tree:
// destructuring, `require(...).name`, a bound identifier and its destructuring, and the pack loader. Not supported (and
// absent from the tree): a quoted destructuring key, assignment destructuring without a declaration, a template-literal
// specifier, aliasing the pack loader under another name.
//
// Runtime model: read-only against the repository; test 4 writes only to its own `mkdtemp` directory, in a git
// repository created with the global and system git configuration turned off and a scratch HOME. A mirror install
// (no README.md and no scripts/ beside the runtime) skips the repo cases 1-3.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { LEGACY } = require('./legacy-names.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT =
  fs.existsSync(path.join(REPO_ROOT, 'README.md')) &&
  fs.existsSync(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'));

/** compat.cjs relative to a repository root. */
const COMPAT_REL = 'plugins/aoforge/aoforge/bin/lib/compat.cjs';

/** The five names objective 78 removed from compat, built from parts so a search of the tree finds no call. */
const [ENV_ALIAS, BOTH_DIRS, IS_LEGACY, LEGACY_HOME, RESOLVE_FILE] = [
  ['alias', 'Legacy', 'Env'],
  ['both', 'Planning', 'Dirs'],
  ['is', 'Legacy', 'Planning'],
  ['legacy', 'Runtime', 'Home'],
  ['resolve', 'User', 'File'],
].map((parts) => parts.join(''));
const REMOVED_NAMES = [ENV_ALIAS, BOTH_DIRS, IS_LEGACY, LEGACY_HOME, RESOLVE_FILE];

const names = (src) => compatRefs(src).map((r) => r.name);
const lines = (rows) => rows.join('\n');

/** A fresh, realpath'd scratch directory. */
function tmpDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// ─── the scanner ─────────────────────────────────────────────────────────────────

const REGEX_AFTER_CHARS = '(,=:[!&|?{};+-*%<>~^}';
const REGEX_AFTER_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const WORD_CHAR = /[\w$\u0080-￿]/;
const COMPAT_PATH = /(^|\/)compat\.cjs$/;

/**
 * Blank the parts of JavaScript source that are not code: comments, string and template bodies, regex literals.
 * Offsets, newlines and delimiters are kept, so a line number in the result is a line number in the source. The one
 * body that stays is a string that is the argument of a call and names compat.cjs, because that string is what a
 * reference is resolved from. `clean` is false when the source ends inside a literal or comment, or a string is
 * unterminated: the result is then not trustworthy.
 *
 * @param {string} text
 * @returns {{ masked: string, clean: boolean }}
 */
function lex(text) {
  const n = text.length;
  const out = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  const openTemplates = []; // the brace depth at which each open `${` closes
  let depth = 0;
  let prev = ''; // the last significant code character: '' at the start, 'a' after a value (word, string, regex)
  let prevWord = '';
  let clean = true;
  let i = 0;

  /** Blank a template body from `from`; stop after the closing backtick or after an opening `${`. */
  const templateBody = (from) => {
    let k = from;
    while (k < n) {
      const c = text[k];
      if (c === '\\') {
        k += 2;
      } else if (c === '`') {
        blank(from, k);
        prev = 'a';
        prevWord = '';
        return k + 1;
      } else if (c === '$' && text[k + 1] === '{') {
        blank(from, k + 2);
        openTemplates.push(depth);
        prev = '{';
        return k + 2;
      } else {
        k++;
      }
    }
    clean = false;
    blank(from, n);
    return n;
  };

  if (text.startsWith('#!')) {
    while (i < n && text[i] !== '\n') i++;
    blank(0, i);
  }

  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      let k = i;
      while (k < n && text[k] !== '\n') k++;
      blank(i, k);
      i = k;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const k = end < 0 ? n : end + 2;
      if (end < 0) clean = false;
      blank(i, k);
      i = k;
    } else if (c === '/') {
      const regexAllowed =
        prev === '' || REGEX_AFTER_CHARS.includes(prev) || (prev === 'a' && REGEX_AFTER_WORDS.has(prevWord));
      let close = -1;
      if (regexAllowed) {
        let k = i + 1;
        let inClass = false;
        while (k < n && text[k] !== '\n') {
          const r = text[k];
          if (r === '\\') {
            k += 2;
            continue;
          }
          if (r === '[') inClass = true;
          else if (r === ']') inClass = false;
          else if (r === '/' && !inClass) {
            close = k;
            break;
          }
          k++;
        }
      }
      if (close < 0) {
        prev = '/';
        i++;
      } else {
        blank(i + 1, close);
        let k = close + 1;
        while (k < n && /[a-z]/.test(text[k])) k++;
        i = k;
        prev = 'a';
        prevWord = '';
      }
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n) {
        const s = text[k];
        if (s === '\\') {
          k += 2;
        } else if (s === c) {
          break;
        } else if (s === '\n') {
          clean = false;
          break;
        } else {
          k++;
        }
      }
      if (k >= n) clean = false;
      const keep = prev === '(' && COMPAT_PATH.test(text.slice(i + 1, k));
      if (!keep) blank(i + 1, k);
      i = k + 1;
      prev = 'a';
      prevWord = '';
    } else if (c === '`') {
      i = templateBody(i + 1);
    } else if (c === '{') {
      depth++;
      prev = '{';
      i++;
    } else if (c === '}') {
      if (openTemplates.length && openTemplates[openTemplates.length - 1] === depth) {
        openTemplates.pop();
        out[i] = ' ';
        i = templateBody(i + 1);
      } else {
        depth--;
        prev = '}';
        i++;
      }
    } else if (WORD_CHAR.test(c)) {
      let k = i + 1;
      while (k < n && WORD_CHAR.test(text[k])) k++;
      prevWord = text.slice(i, k);
      prev = 'a';
      i = k;
    } else {
      prev = c;
      i++;
    }
  }
  return { masked: out.join(''), clean: clean && openTemplates.length === 0 };
}

/** A way to reach compat: `require('<...>/compat.cjs')`, a pack's `require('<...>/core.cjs')('compat.cjs')` or `core('compat.cjs')`. */
const SRC = String.raw`(?:require\(\s*['"](?:[^'"\n]*\/)?compat\.cjs['"]\s*\)|(?:require\(\s*['"][^'"\n]*['"]\s*\)|\bcore)\s*\(\s*['"]compat\.cjs['"]\s*\))`;
const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keys of a destructuring pattern body (the left side of `a: b`), each with its offset in the masked text. */
function patternKeys(body, base) {
  const keys = [];
  let pos = 0;
  for (const part of body.split(',')) {
    const lead = part.length - part.trimStart().length;
    const key = new RegExp(`^(${IDENT})`).exec(part.slice(lead));
    if (key && !part.trimStart().startsWith('...')) keys.push({ name: key[1], offset: base + pos + lead });
    pos += part.length + 1;
  }
  return keys;
}

/** `typeof compat.x`, `compat.x === undefined`, `assert.equal(compat.x, undefined)`: a probe for absence, not a use. */
function isAbsenceProbe(masked, start, end) {
  if (/\btypeof\s*$/.test(masked.slice(Math.max(0, start - 16), start))) return true;
  const after = masked.slice(end, end + 48);
  return /^\s*[!=]==?\s*(?:undefined|void\s*0)\b/.test(after) || /^\s*,\s*undefined\s*\)/.test(after);
}

/**
 * Every reference to a compat export in `text`, resolved by the module it comes from.
 * @param {string} text
 * @returns {{ refs: Array<{line: number, name: string}>, clean: boolean }}
 */
function scan(text) {
  if (!text.includes('compat.cjs')) return { refs: [], clean: true };
  const { masked, clean } = lex(text);
  const starts = [0];
  for (let k = masked.indexOf('\n'); k >= 0; k = masked.indexOf('\n', k + 1)) starts.push(k + 1);
  const lineAt = (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const found = new Map();
  const add = (offset, name) => found.set(`${offset}:${name}`, { offset, line: lineAt(offset), name });

  const pattern = (re) => {
    for (const m of masked.matchAll(re)) {
      const base = m.index + m[0].indexOf('{') + 1;
      for (const key of patternKeys(m[1], base)) add(key.offset, key.name);
    }
  };
  pattern(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${SRC}`, 'g'));

  for (const m of masked.matchAll(new RegExp(`${SRC}\\s*(?:\\?\\.|\\.)\\s*(${IDENT})`, 'g'))) {
    const offset = m.index + m[0].length - m[1].length;
    if (!isAbsenceProbe(masked, m.index, m.index + m[0].length)) add(offset, m[1]);
  }

  const bound = new Set();
  for (const m of masked.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+(${IDENT})\s*=\s*${SRC}(?!\s*[.(\[])`, 'g'))) {
    bound.add(m[1]);
  }
  // The module path inside a require is not a use of the identifier named like its file (`compat.cjs`).
  const uses = bound.size ? masked.replace(new RegExp(SRC, 'g'), (s) => s.replace(/[^\n]/g, ' ')) : masked;
  for (const id of bound) {
    const e = escapeRe(id);
    pattern(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${e}(?![\w$.(\[])`, 'g'));
    for (const m of uses.matchAll(new RegExp(String.raw`(?<![\w$.])${e}\s*(?:\?\.|\.)\s*(${IDENT})`, 'g'))) {
      const offset = m.index + m[0].length - m[1].length;
      if (!isAbsenceProbe(uses, m.index, m.index + m[0].length)) add(offset, m[1]);
    }
  }
  const refs = [...found.values()].sort((a, b) => a.offset - b.offset).map(({ line, name }) => ({ line, name }));
  return { refs, clean };
}

/** Every reference to a compat export in `text`: `[{ line, name }]`. */
function compatRefs(text) {
  return scan(text).refs;
}

// ─── the tree check ──────────────────────────────────────────────────────────────

/** Tracked regular files under `root` matching `pathspecs`, posix paths; git runs without inherited repository variables. */
function trackedPaths(root, pathspecs) {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
  const r = spawnSync('git', ['ls-files', '-z', '--', ...pathspecs], { cwd: root, env, maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${r.error ? r.error.message : String(r.stderr).trim()}`);
  }
  return r.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      try {
        return fs.lstatSync(path.join(root, rel)).isFile();
      } catch {
        return false;
      }
    });
}

/** The export list of the compat.cjs inside `root`, read from the module itself. */
function compatExports(root) {
  return Object.keys(require(path.join(root, COMPAT_REL)));
}

/**
 * Check a repository's tracked source against compat.cjs's real export list.
 * `bad`: references to a name compat does not export (and is not one of the five removed names);
 * `removed`: references to one of the five removed names; `legacyPaths`: tracked paths under the pre-rename planning
 * directory; `unlexable`: files that mention compat.cjs and that the lexer could not finish (the scan is blind there).
 *
 * @param {string} root
 * @returns {{bad: Array<{file: string, line: number, name: string}>, removed: Array<{file: string, line: number, name: string}>, legacyPaths: string[], unlexable: string[]}}
 */
function checkTree(root) {
  const exported = new Set(compatExports(root));
  const result = { bad: [], removed: [], legacyPaths: [], unlexable: [] };
  for (const rel of trackedPaths(root, ['plugins', 'scripts'])) {
    if (!/\.c?js$/.test(rel)) continue;
    const { refs, clean } = scan(fs.readFileSync(path.join(root, rel), 'utf8'));
    if (!clean) result.unlexable.push(rel);
    for (const { line, name } of refs) {
      if (REMOVED_NAMES.includes(name)) result.removed.push({ file: rel, line, name });
      else if (!exported.has(name)) result.bad.push({ file: rel, line, name });
    }
  }
  result.legacyPaths = trackedPaths(root, [LEGACY.planningDir]);
  return result;
}

const show = (rows) => rows.map((r) => `  ${r.file}:${r.line} ${r.name}`).join('\n');

// ─── 1-3: the repository ─────────────────────────────────────────────────────────

describe('reconcile guard: the merged tree', { skip: IS_AOFORGE_CHECKOUT ? false : 'not a plugin source checkout' }, () => {
  /** One scan serves cases 2 and 3. */
  let tree = null;
  const scanTree = () => (tree ||= checkTree(REPO_ROOT));

  test('1: no tracked path under the pre-rename planning directory', () => {
    const paths = scanTree().legacyPaths;
    assert.deepEqual(
      paths,
      [],
      `${paths.length} tracked path(s) under ${LEGACY.planningDir}/ (planning records live under .aoforge/; move them with git mv):\n  ${paths.slice(0, 20).join('\n  ')}`,
    );
  });

  test('2: every compat reference in tracked source names a current compat export', () => {
    const { bad, unlexable } = scanTree();
    assert.deepEqual(
      unlexable,
      [],
      `the lexer could not finish ${unlexable.join(', ')}: the compat scan is blind there; fix the lexer or the file`,
    );
    assert.deepEqual(
      bad,
      [],
      `${bad.length} reference(s) to a name compat.cjs does not export (call the current name; do not add the export back):\n${show(bad)}`,
    );
  });

  test('3: none of the five removed names is a compat export again or is used as one (SC-2)', () => {
    const exported = compatExports(REPO_ROOT);
    const back = REMOVED_NAMES.filter((name) => exported.includes(name));
    assert.deepEqual(
      back,
      [],
      `objective 79 SC-2: compat.cjs exports ${back.join(', ')} again. Objective 78 removed it; fix the caller, not compat.cjs`,
    );
    const { removed } = scanTree();
    assert.deepEqual(
      removed,
      [],
      `objective 79 SC-2: ${removed.length} caller(s) use a compat export objective 78 removed. Fix the caller (the current name, or planning-layout / coexistence if it needs to detect the old layout), not compat.cjs:\n${show(removed)}`,
    );
  });
});

// ─── 5-10: the scanner on hand-written source ───────────────────────────────────

describe('5: destructuring from a compat require', () => {
  test('5a: every key is named, the left side of a rename, a default is not part of the name, a rest is skipped', () => {
    const src = lines([
      'const a = 1;',
      'const {',
      '  planningRoot,',
      '  planningRel: rel,',
      '  findProjectRoot = null,',
      '  ...rest',
      "} = require('../compat.cjs');",
    ]);
    assert.deepEqual(compatRefs(src), [
      { line: 3, name: 'planningRoot' },
      { line: 4, name: 'planningRel' },
      { line: 5, name: 'findProjectRoot' },
    ]);
  });

  test('5b: a require inside a function is found, with its line', () => {
    const src = lines(['function f() {', "  const { watchStateDir } = require('./lib/compat.cjs');", '  return watchStateDir;', '}']);
    assert.deepEqual(compatRefs(src), [{ line: 2, name: 'watchStateDir' }]);
  });

  test('5c: let and var, double quotes and a deep relative path', () => {
    assert.deepEqual(names('let { userHomeDir } = require("../aoforge/bin/lib/compat.cjs");'), ['userHomeDir']);
    assert.deepEqual(names("var { isUserHome, runtimeHome } = require('./a/b/compat.cjs');"), ['isUserHome', 'runtimeHome']);
  });

  test('5d: a module whose name only ends in compat.cjs is another module', () => {
    assert.deepEqual(names("const { nope } = require('./not-compat.cjs');"), []);
    assert.deepEqual(names("const { nope } = require('./compat.cjs.bak');"), []);
  });
});

describe('6: member access on a compat require', () => {
  test('6a: a call and a read directly on the require', () => {
    const src = lines([
      "const root = require('./lib/compat.cjs').planningRoot(cwd);",
      'const dir = require("./compat.cjs")',
      '  .planningDirName;',
    ]);
    assert.deepEqual(compatRefs(src), [
      { line: 1, name: 'planningRoot' },
      { line: 3, name: 'planningDirName' },
    ]);
  });

  test("6b: the hooks' fail-open try/catch form", () => {
    const src = lines([
      'try {',
      "  require('../aoforge/bin/lib/compat.cjs').someExport();",
      "} catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }",
    ]);
    assert.deepEqual(compatRefs(src), [{ line: 2, name: 'someExport' }]);
  });

  test('6c: optional chaining counts', () => {
    assert.deepEqual(names("const f = require('./compat.cjs')?.watchStateDir;"), ['watchStateDir']);
  });
});

describe('7: a bound identifier', () => {
  test('7a: dot reads and calls are references, with their lines', () => {
    const src = lines([
      "const compat = require('./compat.cjs');",
      'compat.findProjectRoot(dir);',
      'const y = compat.planningRoot;',
      'if (compat?.userDotFile) {}',
    ]);
    assert.deepEqual(compatRefs(src), [
      { line: 2, name: 'findProjectRoot' },
      { line: 3, name: 'planningRoot' },
      { line: 4, name: 'userDotFile' },
    ]);
  });

  test('7b: a property of something else that happens to be called compat is not the module', () => {
    const src = lines(["const compat = require('./compat.cjs');", 'const z = other.compat.nope;', 'const w = notcompat.nope;']);
    assert.deepEqual(compatRefs(src), []);
  });

  test('7c: destructuring the bound identifier is a reference', () => {
    const src = lines(["const compat = require('./compat.cjs');", 'const { runtimeHome, planningRel: rel } = compat;']);
    assert.deepEqual(compatRefs(src), [
      { line: 2, name: 'runtimeHome' },
      { line: 2, name: 'planningRel' },
    ]);
  });

  test('7d: a bound identifier from another module is not tracked', () => {
    assert.deepEqual(names("const compat = require('./planning-layout.cjs');\ncompat.nope();"), []);
  });
});

describe('8: the pack loader', () => {
  test("8a: require('./core.cjs')('compat.cjs') destructured", () => {
    assert.deepEqual(compatRefs("const { planningRoot, planningRel } = require('./core.cjs')('compat.cjs');"), [
      { line: 1, name: 'planningRoot' },
      { line: 1, name: 'planningRel' },
    ]);
  });

  test("8b: core('compat.cjs') destructured, read as a member and bound", () => {
    const src = lines([
      "const core = require('./core.cjs');",
      'const { watchStateDir } = core("compat.cjs");',
      "core('compat.cjs').runtimeHome(home);",
      "const c = core('compat.cjs');",
      'c.isUserHome(x);',
    ]);
    assert.deepEqual(compatRefs(src), [
      { line: 2, name: 'watchStateDir' },
      { line: 3, name: 'runtimeHome' },
      { line: 5, name: 'isUserHome' },
    ]);
  });

  test("8c: the loader asked for another module is not compat", () => {
    assert.deepEqual(names("const { nope } = require('./core.cjs')('handoff.cjs');\ncore('watcher-state.cjs').nope();"), []);
  });
});

describe('9: absence assertions are not references', () => {
  test('9a: in, computed access and typeof', () => {
    const src = lines([
      "const compat = require('./compat.cjs');",
      'assert.equal("gone" in compat, false);',
      'assert.strictEqual(compat[name], undefined);',
      'assert.equal(typeof compat.gone, "undefined");',
    ]);
    assert.deepEqual(compatRefs(src), []);
  });

  test('9b: a comparison with undefined and an assertion that the value is undefined', () => {
    const src = lines([
      "const compat = require('./compat.cjs');",
      'assert.ok(compat.gone1 === undefined);',
      'assert.ok(compat.gone2 == void 0);',
      'assert.equal(compat.gone3, undefined);',
      'assert.strictEqual(compat.gone4, undefined);',
      "assert.equal(require('./compat.cjs').gone5, undefined);",
    ]);
    assert.deepEqual(compatRefs(src), []);
  });

  test('9c: a plain read next to an absence assertion is still a reference', () => {
    const src = lines([
      "const compat = require('./compat.cjs');",
      'assert.equal(compat.gone, undefined);',
      'assert.equal(compat.planningRoot(root), expected);',
    ]);
    assert.deepEqual(compatRefs(src), [{ line: 3, name: 'planningRoot' }]);
  });
});

describe('10: other modules and non-code are not compat references', () => {
  test('10a: the same names from planning-layout, coexistence and a fixture', () => {
    const src = lines([
      `const { ${IS_LEGACY}, ${BOTH_DIRS} } = require('./planning-layout.cjs');`,
      `const { ${LEGACY_HOME} } = require('./coexistence.cjs');`,
      `const { ${LEGACY_HOME}: fixture } = require('./__fixtures__/legacy-runtime-fixtures.cjs');`,
      "const layout = require('./planning-layout.cjs');",
      `layout.${IS_LEGACY}(root);`,
      `require('./coexistence.cjs').${LEGACY_HOME}(home);`,
    ]);
    assert.deepEqual(compatRefs(src), []);
  });

  test('10b: the same name from compat is a reference (positive control)', () => {
    assert.deepEqual(names(`const { ${IS_LEGACY} } = require('./compat.cjs');`), [IS_LEGACY]);
    assert.deepEqual(names(`require('./compat.cjs').${RESOLVE_FILE}(home);`), [RESOLVE_FILE]);
  });

  test('10c: comments, strings, template bodies and regex literals that spell a require are data', () => {
    const src = lines([
      "// const { gone1 } = require('./compat.cjs');",
      "/* const { gone2 } = require('./compat.cjs'); */",
      'const s = "const { gone3 } = require(\'./compat.cjs\');";',
      "const t = `const { gone4 } = require('./compat.cjs');`;",
      'const u = `${a} const { gone5 } = require("./compat.cjs"); ${b}`;',
      "const re = /const { gone6 } = require\\('\\.\\/compat\\.cjs'\\)/;",
      "const v = 'it\\'s' + \"say \\\"hi\\\"\";",
      "const { real } = require('./compat.cjs');",
    ]);
    assert.deepEqual(compatRefs(src), [{ line: 8, name: 'real' }]);
  });

  test('10d: code inside a template expression is code', () => {
    const src = 'const s = `x ${require("./compat.cjs").inTemplate} y`;';
    assert.deepEqual(compatRefs(src), [{ line: 1, name: 'inTemplate' }]);
  });

  test('10e: a division is not a regex literal (it would swallow the quote of the next string)', () => {
    const src = lines(["const r = (a + b) / 2; const p = 'a/b';", "const { real } = require('./compat.cjs');"]);
    assert.deepEqual(compatRefs(src), [{ line: 2, name: 'real' }]);
  });

  test('10f: a regex literal with a quote or a slash in a class does not open a string', () => {
    const src = lines([
      "const re = /'/; const m = x.match(/[/\"`]+/g);",
      'return /"/.test(y);',
      "const { real } = require('./compat.cjs');",
    ]);
    assert.deepEqual(compatRefs(src), [{ line: 3, name: 'real' }]);
  });
});

// ─── 4: the tree check catches a mutation ────────────────────────────────────────

describe('4: mutation: a scratch repository with one call to a removed export', () => {
  const LIB = 'plugins/aoforge/aoforge/bin/lib';
  const GIT_ENV = (home) => {
    const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
    return env;
  };

  function scratch(callerSource, extraTracked = {}) {
    const root = tmpDir('reconcile-guard-');
    const home = tmpDir('reconcile-guard-home-');
    const git = (...args) => {
      const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', env: GIT_ENV(home) });
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    };
    git('init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(root, LIB), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'compat.cjs'), path.join(root, COMPAT_REL));
    fs.writeFileSync(path.join(root, LIB, 'caller.cjs'), callerSource);
    const tracked = [COMPAT_REL, `${LIB}/caller.cjs`];
    for (const [rel, body] of Object.entries(extraTracked)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
      tracked.push(rel);
    }
    git('add', '--', ...tracked);
    return {
      root,
      rewrite: (source) => fs.writeFileSync(path.join(root, LIB, 'caller.cjs'), source),
      done: () => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      },
    };
  }

  test('4a: a call to a removed export fails the tree check; without the call the same repository passes', () => {
    const s = scratch(`const { planningRoot, ${RESOLVE_FILE} } = require('./compat.cjs');\n`);
    try {
      const bad = checkTree(s.root);
      assert.deepEqual(bad.removed, [{ file: `${LIB}/caller.cjs`, line: 1, name: RESOLVE_FILE }]);
      assert.deepEqual(bad.bad, []);
      assert.deepEqual(bad.legacyPaths, []);

      s.rewrite("const { planningRoot } = require('./compat.cjs');\n");
      assert.deepEqual(checkTree(s.root), { bad: [], removed: [], legacyPaths: [], unlexable: [] });
    } finally {
      s.done();
    }
  });

  test('4b: a name compat never exported is reported in the other list', () => {
    const s = scratch("const compat = require('./compat.cjs');\ncompat.neverExported(1);\n");
    try {
      const r = checkTree(s.root);
      assert.deepEqual(r.bad, [{ file: `${LIB}/caller.cjs`, line: 2, name: 'neverExported' }]);
      assert.deepEqual(r.removed, []);
    } finally {
      s.done();
    }
  });

  test('4c: a tracked pre-rename planning path is reported, and only that', () => {
    const rel = `${LEGACY.planningDir}/STATE.md`;
    const s = scratch("const { planningRoot } = require('./compat.cjs');\n", { [rel]: 'x\n' });
    try {
      const r = checkTree(s.root);
      assert.deepEqual(r.legacyPaths, [rel]);
      assert.deepEqual([r.bad, r.removed, r.unlexable], [[], [], []]);
    } finally {
      s.done();
    }
  });

  test('4d: a file the lexer cannot finish is reported rather than silently skipped', () => {
    const s = scratch("const { planningRoot } = require('./compat.cjs');\nconst open = `never closed;\n");
    try {
      assert.deepEqual(checkTree(s.root).unlexable, [`${LIB}/caller.cjs`]);
    } finally {
      s.done();
    }
  });
});
