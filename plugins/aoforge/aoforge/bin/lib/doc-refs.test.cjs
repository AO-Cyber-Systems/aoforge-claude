'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation;
// TRD 38-01, objective 38-doc-auto-correction):
//
// 1. (Removed by TRD 78-02: a pre-rename namespace is no longer a command reference; see
//    doc-refs.legacy.test.cjs.)
// 2. resolveToken('aoforge','health') -> {kind:'renamed', replacement:'/aoforge:status check'}.
// 3. resolveToken('aoforge','add-objective') -> renamed /aoforge:objective add;
//    ('aoforge','check-todos') -> /aoforge:todo list; ('aoforge','progress') -> /aoforge:status.
// 4. resolveToken('aoforge','update') and ('aoforge','reapply-patches') -> {kind:'removed', replacement:null}.
// 5. resolveToken('aoforge','status', {liveSkills:new Set(['status'])}) -> ok;
//    ('aoforge','nope', {liveSkills}) -> unknown; without liveSkills -> ok.
// 6. scanText on the three prose lines "progress: Present status to user", "Update progress bar",
//    "status: in_progress" -> [].
// 7. scanText('see /aoforge:progress-bar') with no liveSkills -> [] (full-token match, not a
//    prefix of "progress").
// 8. scanText reports line/col (1-based) for "x /aoforge:health" on line 3.
// 9. Ignore region: tokens between "doc-refs:ignore-start" and "doc-refs:ignore-end" are not
//    reported; an ignore-start with no end -> throws DocRefsError.
// 10. rewriteText('Run /aoforge:health --repair') -> text 'Run /aoforge:status check --repair',
//     one change {from:'/aoforge:health', to:'/aoforge:status check', line:1}.
// 11. rewriteText leaves /aoforge:update untouched and lists it under removed.
// 12. rewriteText preserves CRLF and everything around the token
//     ("a\r\n/aoforge:progress\r\n" -> "a\r\n/aoforge:status\r\n").
// 13. Idempotence: for a hand-written 6-line sample mixing all kinds, a second rewriteText pass
//     has zero changes.
// 14. liveSkillNames(tmp) where tmp has a/SKILL.md, b/SKILL.md and c/ (no SKILL.md) -> Set{a,b}.
// 15. walkFiles(tmp, {include:['**/*.md'], exclude:['**/*.test.js', 'x/**']}) returns sorted
//     posix relative paths and honours both lists (hand-built 5-file tree).
// 16. Guard: doc-refs.cjs source declares no string literal equal to any DEPRECATION_MAP value
//     (it imports, never re-declares). Assert none of 'status check', 'todo list', 'objective add'
//     appear as literals.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveToken,
  scanText,
  rewriteText,
  liveSkillNames,
  walkFiles,
  TOKEN_RE,
  DocRefsError,
} = require('./doc-refs.cjs');

// ─── Fixture generators (hand-written content, generated tmp trees — no LLM data) ──────

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Builds a tmp tree of skill directories: { name: true|false } -> dir with SKILL.md if true.
function makeSkillsTree(spec) {
  const dir = makeTmpDir('doc-refs-skills-');
  for (const [name, hasSkillMd] of Object.entries(spec)) {
    const sub = path.join(dir, name);
    fs.mkdirSync(sub, { recursive: true });
    if (hasSkillMd) fs.writeFileSync(path.join(sub, 'SKILL.md'), '# skill\n');
  }
  return dir;
}

// Builds a tmp tree of files from a list of relative posix paths.
function makeFileTree(relPaths) {
  const dir = makeTmpDir('doc-refs-walk-');
  for (const rel of relPaths) {
    const full = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `content of ${rel}\n`);
  }
  return dir;
}

// ─── Group RT: resolveToken ─────────────────────────────────────────────────────

describe('resolveToken', () => {
  test('RT2: renamed command -> renamed', () => {
    assert.deepStrictEqual(
      resolveToken('aoforge', 'health'),
      { kind: 'renamed', replacement: '/aoforge:status check' },
    );
  });

  test('RT3: more renamed mappings', () => {
    assert.deepStrictEqual(
      resolveToken('aoforge', 'add-objective'),
      { kind: 'renamed', replacement: '/aoforge:objective add' },
    );
    assert.deepStrictEqual(
      resolveToken('aoforge', 'check-todos'),
      { kind: 'renamed', replacement: '/aoforge:todo list' },
    );
    assert.deepStrictEqual(
      resolveToken('aoforge', 'progress'),
      { kind: 'renamed', replacement: '/aoforge:status' },
    );
  });

  test('RT4: removed commands -> removed, replacement null', () => {
    assert.deepStrictEqual(
      resolveToken('aoforge', 'update'),
      { kind: 'removed', replacement: null },
    );
    assert.deepStrictEqual(
      resolveToken('aoforge', 'reapply-patches'),
      { kind: 'removed', replacement: null },
    );
  });

  test('RT5: liveSkills gates unknown vs ok', () => {
    assert.deepStrictEqual(
      resolveToken('aoforge', 'status', { liveSkills: new Set(['status']) }),
      { kind: 'ok', replacement: null },
    );
    assert.deepStrictEqual(
      resolveToken('aoforge', 'nope', { liveSkills: new Set(['status']) }),
      { kind: 'unknown', replacement: null },
    );
    assert.deepStrictEqual(
      resolveToken('aoforge', 'nope'),
      { kind: 'ok', replacement: null },
    );
  });
});

// ─── Group SC: scanText ─────────────────────────────────────────────────────────

describe('scanText', () => {
  test('SC6: bare prose words never match', () => {
    const text = 'progress: Present status to user\nUpdate progress bar\nstatus: in_progress';
    assert.deepStrictEqual(scanText(text), []);
  });

  test('SC7: full-token match — progress-bar is not a prefix of progress', () => {
    assert.deepStrictEqual(scanText('see /aoforge:progress-bar'), []);
  });

  test('SC8: line/col are 1-based', () => {
    const text = 'one\ntwo\nx /aoforge:health';
    const result = scanText(text);
    assert.deepStrictEqual(result, [
      { line: 3, col: 3, token: 'health', kind: 'renamed', replacement: '/aoforge:status check' },
    ]);
  });

  test('SC9a: tokens inside an ignore region are not reported', () => {
    const text = [
      'before /aoforge:health',
      '<!-- doc-refs:ignore-start -->',
      '/aoforge:health inside ignore',
      '<!-- doc-refs:ignore-end -->',
      'after /aoforge:health',
    ].join('\n');
    const result = scanText(text);
    assert.deepStrictEqual(result.map((r) => r.line), [1, 5]);
  });

  test('SC9b: unclosed ignore-start throws DocRefsError', () => {
    const text = 'before\n<!-- doc-refs:ignore-start -->\n/aoforge:health\n';
    assert.throws(() => scanText(text), (err) => err instanceof DocRefsError);
  });
});

// ─── Group RW: rewriteText ───────────────────────────────────────────────────────

describe('rewriteText', () => {
  test('RW10: renamed token is rewritten with args preserved', () => {
    const result = rewriteText('Run /aoforge:health --repair');
    assert.strictEqual(result.text, 'Run /aoforge:status check --repair');
    assert.deepStrictEqual(result.changes, [
      { from: '/aoforge:health', to: '/aoforge:status check', line: 1 },
    ]);
  });

  test('RW11: removed token is left untouched and listed under removed', () => {
    const result = rewriteText('/aoforge:update is gone');
    assert.strictEqual(result.text, '/aoforge:update is gone');
    assert.deepStrictEqual(result.changes, []);
    assert.deepStrictEqual(result.removed, [{ token: 'update', line: 1 }]);
  });

  test('RW12: CRLF and surrounding bytes are preserved', () => {
    const result = rewriteText('a\r\n/aoforge:progress\r\n');
    assert.strictEqual(result.text, 'a\r\n/aoforge:status\r\n');
  });

  test('RW13: idempotent across all kinds', () => {
    const text = [
      'See /aoforge:status for details.',
      'Use /aoforge:health to start.',
      '/aoforge:add-objective X was renamed.',
      '/aoforge:update is gone; no replacement.',
      'prose: progress bar, Update progress bar, in_progress — none of these are tokens.',
      '/aoforge:progress-bar itself is a live doc anchor, not /aoforge:progress.',
    ].join('\n');
    const once = rewriteText(text);
    assert.ok(once.changes.length > 0, 'first pass should rewrite something');
    const twice = rewriteText(once.text);
    assert.deepStrictEqual(twice.changes, []);
  });
});

// ─── Group FW: liveSkillNames + walkFiles ────────────────────────────────────────

describe('liveSkillNames', () => {
  test('LS14: only subdirectories containing SKILL.md are returned', () => {
    const dir = makeSkillsTree({ a: true, b: true, c: false });
    try {
      const names = liveSkillNames(dir);
      assert.deepStrictEqual(names, new Set(['a', 'b']));
    } finally {
      removeTmpDir(dir);
    }
  });
});

describe('walkFiles', () => {
  test('WF15: include and exclude glob lists are both honoured', () => {
    const dir = makeFileTree([
      'a.md',
      'sub/b.md',
      'sub/c.test.js',
      'x/d.md',
      'notes.txt',
    ]);
    try {
      const result = walkFiles(dir, {
        include: ['**/*.md'],
        exclude: ['**/*.test.js', 'x/**'],
      });
      assert.deepStrictEqual(result, ['a.md', 'sub/b.md']);
    } finally {
      removeTmpDir(dir);
    }
  });
});

// ─── Group G: guard ───────────────────────────────────────────────────────────────

describe('guard', () => {
  test('G16: doc-refs.cjs declares no DEPRECATION_MAP value as a literal', () => {
    const src = fs.readFileSync(path.join(__dirname, 'doc-refs.cjs'), 'utf-8');
    for (const literal of ['status check', 'todo list', 'objective add']) {
      assert.ok(!src.includes(literal), `doc-refs.cjs must not declare the literal "${literal}"`);
    }
  });
});

// ─── Group RE: TOKEN_RE sanity (exported for reuse by later TRDs) ────────────────

describe('TOKEN_RE', () => {
  test('RE1: is exported as a RegExp with the expected source', () => {
    assert.ok(TOKEN_RE instanceof RegExp);
    // TRD 78-02: the current namespace only.
    assert.strictEqual(TOKEN_RE.source, '(?<![A-Za-z0-9_])\\/(aoforge):([a-z][a-z0-9-]*)');
  });
});
