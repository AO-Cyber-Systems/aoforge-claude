'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation).
// Fixed `now = new Date('2026-09-28T00:00:00Z')` in every case (fixture_strategy: generators;
// no_llm_test_data — every fixture below is hand-built, never LLM-generated test data).
//
// W051 (STACK.md review age):
//   1. provenance.reviewed "2026-09-01" (27 days before fixed now, default 90-day threshold)
//      -> no W051; checked.stack_review === 'ok'.
//   2. provenance.reviewed "2026-06-01" (119 days) -> one W051 whose message contains '119' and '90'.
//   3. No provenance -> W051 "has no provenance.reviewed". reviewed: "someday" -> W051 "unparseable".
//   4. config.docs.stack_review_stale_days: 200 with the case-2 date -> no W051.
//   5. No STACK.md -> no W051; skipped:no-stack.
//
// W052 (STACK.md language drift):
//   6. go.mod fixture + STACK.md languages:[go] -> no W052.
//   7. go.mod fixture + languages:[python] -> W052 naming go and python.
//   8. package.json+tsconfig.json fixture (detects typescript) + languages:[javascript] -> no W052
//      (typescript<->javascript alias).
//   9. go.mod fixture + STACK.md without languages -> no W052; skipped:no-declared-languages.
//
// W053 (codebase-map commits-behind, real git fixture history):
//   10. writeMappedDocs committed, then 3 commits touching src/ -> no W053 (3 <= 50 default).
//   11. config.docs.codebase_map_stale_commits: 2 with the case-10 history -> W053 naming 3 and 2.
//   12. After the map commit, 5 commits touching only .planning/STATE.md, threshold 2 -> no W053
//       (.planning is excluded).
//   13. Maps written but never committed -> skipped:maps-not-committed, no issue. A non-git dir
//       with maps -> skipped:not-a-git-repo.
//   14. _setRunGit(() => { throw new Error('boom') }) -> skipped:git-failed, no throw.
//
// W050 (removed-command references in live project docs):
//   15. STATE.md with a removed-command reference under '## Current Position' -> one W050; the
//       same reference only under '## Session Log' -> none.
//   16. CLAUDE.md DEVFLOW block containing a removed-command reference -> W050; the same
//       reference outside the block -> none.
//   17. STATE.md with a renamed (not removed) reference -> no W050.
//
// General:
//   18. Every returned issue has code/message/fix strings and no `repairable: true`; a fixture
//       snapshot is byte-identical before and after collect() (collect() never writes).

const { test, describe, afterEach, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { makeProject, profileMd, goShapedRepo, cleanup } = require('./__fixtures__/stack-profile-fixtures.cjs');
const {
  makeFixture,
  writeMappedDocs,
  makeFakeHome,
  gitEnv,
  snapshot,
  diffSnapshots,
} = require('./__fixtures__/adopt-fixtures.cjs');

const { collect, DEFAULTS, _setRunGit, _resetRunGit } = require('./doc-staleness.cjs');

const NOW = new Date('2026-09-28T00:00:00Z');

function issuesFor(result, code) {
  return result.issues.filter((i) => i.code === code);
}

// ─── W051 — STACK.md review age ────────────────────────────────────────────────

describe('doc-staleness — W051 STACK.md review age', () => {
  let root;
  afterEach(() => { cleanup(root); root = undefined; });

  test('1. reviewed 27 days ago (default 90-day threshold) -> ok, no W051', () => {
    root = makeProject({ stackMd: profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2026-09-01"\n' }) });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W051'), []);
    assert.strictEqual(r.checked.stack_review, 'ok');
  });

  test('2. reviewed 119 days ago (default 90-day threshold) -> one W051 naming 119 and 90', () => {
    root = makeProject({ stackMd: profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2026-06-01"\n' }) });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W051');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /119/);
    assert.match(issues[0].message, /90/);
    assert.strictEqual(r.checked.stack_review, 'stale');
  });

  test('3a. no provenance at all -> W051 "has no provenance.reviewed"', () => {
    root = makeProject({ stackMd: profileMd({ yaml: 'schema: 1\n' }) });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W051');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /has no provenance\.reviewed/);
  });

  test('3b. reviewed "someday" -> W051 "unparseable"', () => {
    root = makeProject({ stackMd: profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "someday"\n' }) });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W051');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /unparseable/);
  });

  test('4. config.docs.stack_review_stale_days 200 with the case-2 date -> no W051', () => {
    root = makeProject({ stackMd: profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2026-06-01"\n' }) });
    const r = collect({ projectRoot: root, now: NOW, config: { docs: { stack_review_stale_days: 200 } } });
    assert.deepStrictEqual(issuesFor(r, 'W051'), []);
    assert.strictEqual(r.checked.stack_review, 'ok');
  });

  test('5. no STACK.md -> no W051; skipped:no-stack', () => {
    root = makeProject({});
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W051'), []);
    assert.strictEqual(r.checked.stack_review, 'skipped:no-stack');
  });
});

// ─── W052 — STACK.md language drift ────────────────────────────────────────────

describe('doc-staleness — W052 STACK.md language drift', () => {
  let root;
  afterEach(() => { cleanup(root); root = undefined; });

  test('6. go.mod + languages:[go] -> no W052', () => {
    root = makeProject({
      stackMd: profileMd({ yaml: 'schema: 1\nlanguages: [go]\nprovenance:\n  reviewed: "2026-09-01"\n' }),
      files: goShapedRepo(),
    });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W052'), []);
    assert.strictEqual(r.checked.stack_drift, 'ok');
  });

  test('7. go.mod + languages:[python] -> W052 naming go and python', () => {
    root = makeProject({
      stackMd: profileMd({ yaml: 'schema: 1\nlanguages: [python]\nprovenance:\n  reviewed: "2026-09-01"\n' }),
      files: goShapedRepo(),
    });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W052');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /go/);
    assert.match(issues[0].message, /python/);
    assert.strictEqual(r.checked.stack_drift, 'stale');
  });

  test('8. package.json+tsconfig.json (detects typescript) + languages:[javascript] -> no W052 (alias)', () => {
    root = makeProject({
      stackMd: profileMd({ yaml: 'schema: 1\nlanguages: [javascript]\nprovenance:\n  reviewed: "2026-09-01"\n' }),
      files: { 'package.json': '{}\n', 'tsconfig.json': '{}\n' },
    });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W052'), []);
    assert.strictEqual(r.checked.stack_drift, 'ok');
  });

  test('9. go.mod + STACK.md without languages -> no W052; skipped:no-declared-languages', () => {
    root = makeProject({
      stackMd: profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2026-09-01"\n' }),
      files: goShapedRepo(),
    });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W052'), []);
    assert.strictEqual(r.checked.stack_drift, 'skipped:no-declared-languages');
  });
});

// ─── W053 — codebase-map commits-behind (real git fixture history) ────────────

describe('doc-staleness — W053 codebase-map commits-behind', () => {
  let parent;
  let home;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doc-staleness-parent-'));
    home = makeFakeHome();
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    _resetRunGit();
  });

  function git(root, args) {
    return execFileSync('git', ['-C', root, ...args], {
      env: gitEnv(home),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  }
  function commitAll(root, message) {
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', message]);
  }

  test('10. maps committed, then 3 commits touching src/ -> no W053 (3 <= 50 default)', () => {
    const root = makeFixture('empty', { parent, home });
    writeMappedDocs(root);
    commitAll(root, 'add codebase maps');
    for (let i = 0; i < 3; i++) {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', `f${i}.txt`), `${i}\n`);
      commitAll(root, `touch src f${i}`);
    }
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W053'), []);
    assert.strictEqual(r.checked.codebase_map, 'ok');
  });

  test('11. threshold 2 with the case-10 history -> W053 naming 3 and 2', () => {
    const root = makeFixture('empty', { parent, home });
    writeMappedDocs(root);
    commitAll(root, 'add codebase maps');
    for (let i = 0; i < 3; i++) {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', `f${i}.txt`), `${i}\n`);
      commitAll(root, `touch src f${i}`);
    }
    const r = collect({ projectRoot: root, now: NOW, config: { docs: { codebase_map_stale_commits: 2 } } });
    const issues = issuesFor(r, 'W053');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /3/);
    assert.match(issues[0].message, /2/);
    assert.strictEqual(r.checked.codebase_map, 'stale');
  });

  test('12. after the map commit, 5 commits touching only .planning/STATE.md, threshold 2 -> no W053 (.planning excluded)', () => {
    const root = makeFixture('empty', { parent, home });
    writeMappedDocs(root);
    commitAll(root, 'add codebase maps');
    fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), 'line 0\n');
    commitAll(root, 'seed STATE.md');
    for (let i = 1; i <= 5; i++) {
      fs.appendFileSync(path.join(root, '.planning', 'STATE.md'), `line ${i}\n`);
      commitAll(root, `touch STATE.md ${i}`);
    }
    const r = collect({ projectRoot: root, now: NOW, config: { docs: { codebase_map_stale_commits: 2 } } });
    assert.deepStrictEqual(issuesFor(r, 'W053'), []);
    assert.strictEqual(r.checked.codebase_map, 'ok');
  });

  test('13a. maps written but never committed -> skipped:maps-not-committed, no issue', () => {
    const root = makeFixture('empty', { parent, home });
    writeMappedDocs(root);
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W053'), []);
    assert.strictEqual(r.checked.codebase_map, 'skipped:maps-not-committed');
  });

  test('13b. a non-git dir with maps -> skipped:not-a-git-repo', () => {
    const root = fs.mkdtempSync(path.join(parent, 'nogit-'));
    writeMappedDocs(root);
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W053'), []);
    assert.strictEqual(r.checked.codebase_map, 'skipped:not-a-git-repo');
  });

  test('14. _setRunGit throwing -> skipped:git-failed, no throw', () => {
    const root = makeFixture('empty', { parent, home });
    writeMappedDocs(root);
    commitAll(root, 'add codebase maps');
    _setRunGit(() => { throw new Error('boom'); });
    let r;
    assert.doesNotThrow(() => { r = collect({ projectRoot: root, now: NOW, config: {} }); });
    assert.deepStrictEqual(issuesFor(r, 'W053'), []);
    assert.strictEqual(r.checked.codebase_map, 'skipped:git-failed');
  });
});

// ─── W050 — removed-command references in live project docs ───────────────────

describe('doc-staleness — W050 removed-command references', () => {
  let root;
  afterEach(() => { cleanup(root); root = undefined; });

  test('15a. STATE.md: a removed-command reference under Current Position -> one W050', () => {
    const state = '# Project State\n\n## Current Position\n\nrun /devflow:update to refresh.\n\n## Session Log\n';
    root = makeProject({ files: { '.planning/STATE.md': state } });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W050');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /STATE\.md/);
    assert.match(issues[0].message, /\/devflow:update/);
    assert.match(issues[0].message, /removed/);
    assert.strictEqual(r.checked.removed_refs, 'stale');
  });

  test('15b. STATE.md: the same reference only under Session Log -> none', () => {
    const state = '# Project State\n\n## Current Position\n\nnothing stale here.\n\n## Session Log\n\nrun /devflow:update to refresh.\n';
    root = makeProject({ files: { '.planning/STATE.md': state } });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W050'), []);
    assert.strictEqual(r.checked.removed_refs, 'ok');
  });

  test('16a. CLAUDE.md DEVFLOW block: a removed-command reference -> W050', () => {
    const claude = '<!-- DEVFLOW:START v=1 -->\nSee /devflow:reapply-patches for details.\n<!-- DEVFLOW:END -->\n';
    root = makeProject({ files: { 'CLAUDE.md': claude } });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    const issues = issuesFor(r, 'W050');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /CLAUDE\.md/);
    assert.match(issues[0].message, /\/devflow:reapply-patches/);
    assert.strictEqual(r.checked.removed_refs, 'stale');
  });

  test('16b. CLAUDE.md: the same reference outside the block -> none', () => {
    const claude = 'See /devflow:reapply-patches above this block.\n\n<!-- DEVFLOW:START v=1 -->\nnothing stale here.\n<!-- DEVFLOW:END -->\n';
    root = makeProject({ files: { 'CLAUDE.md': claude } });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W050'), []);
    assert.strictEqual(r.checked.removed_refs, 'ok');
  });

  test('17. STATE.md: a renamed (not removed) reference -> no W050', () => {
    const state = '# Project State\n\n## Current Position\n\nrun /df:health to check.\n\n## Session Log\n';
    root = makeProject({ files: { '.planning/STATE.md': state } });
    const r = collect({ projectRoot: root, now: NOW, config: {} });
    assert.deepStrictEqual(issuesFor(r, 'W050'), []);
    assert.strictEqual(r.checked.removed_refs, 'ok');
  });
});

// ─── General ────────────────────────────────────────────────────────────────────

describe('doc-staleness — general', () => {
  test('18. every issue has code/message/fix strings, no repairable:true; collect() never writes', () => {
    const state = '# Project State\n\n## Current Position\n\nrun /devflow:update to refresh.\n\n## Session Log\n';
    const root = makeProject({
      stackMd: profileMd({ yaml: 'schema: 1\nlanguages: [python]\nprovenance:\n  reviewed: "2026-06-01"\n' }),
      files: { '.planning/STATE.md': state, ...goShapedRepo() },
    });
    try {
      const before = snapshot(root);
      const r = collect({ projectRoot: root, now: NOW, config: {} });
      const after = snapshot(root);

      assert.ok(r.issues.length >= 3, 'expected W050 + W051 + W052 issues from this fixture');
      for (const issue of r.issues) {
        assert.strictEqual(typeof issue.code, 'string');
        assert.strictEqual(typeof issue.message, 'string');
        assert.strictEqual(typeof issue.fix, 'string');
        assert.notStrictEqual(issue.repairable, true);
      }
      assert.deepStrictEqual(diffSnapshots(before, after), []);
    } finally {
      cleanup(root);
    }
  });

  test('DEFAULTS is exported with the documented shape', () => {
    assert.deepStrictEqual(DEFAULTS, { stack_review_stale_days: 90, codebase_map_stale_commits: 50 });
  });
});
