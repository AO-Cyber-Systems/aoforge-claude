'use strict';

// repo-state-delegation.test.cjs — TDD test suite for TRD 37-04 (ADP-01: the three heuristics
// delegate to repo-state.cjs). Test list (outermost CLI JSON first):
//
//   1. `init new-project --raw` spawned in a go-service fixture (fake HOME) -> is_brownfield:true,
//      needs_codebase_map:true, has_package_file:true, has_existing_code:true,
//      repo_state.state in {brownfield, scratch}, repo_state.signals.primary_lang === 'go'.
//   2. Same in the empty fixture -> is_brownfield:false, needs_codebase_map:false,
//      repo_state.state === 'greenfield'.
//   3. Same in the aoforge fixture after writeMappedDocs -> needs_codebase_map:false,
//      repo_state.state === 'aoforge'.
//   4. A code file nested 5 levels deep (a/b/c/d/e/x.go), no manifest -> is_brownfield:true (the
//      old -maxdepth 3 would have said false; intentional, recorded in SUMMARY).
//   5. `detect brownfield-map --raw` in the aoforge fixture with source_file_count driven to
//      exactly 50 -> should_offer_map:true; at exactly 49 -> false.
//   6. `project-state --raw` in each fixture -> output keys are exactly the legacy eight plus
//      `state`.
//   7. Parity (library): getProjectState(root, {userHome:null}) code_files/primary_lang/
//      is_substantive equal detectRepoState(root, {userHome:null}).signals/derived, and .state
//      equal, for each fixture kind.
//   8. Parity: brownfield-detector.countSourceFiles === repo-state.countSourceFiles and
//      project-state.countSourceFiles === repo-state.countSourceFiles (same function objects).
//   9. Source check: the EXCLUDE / EXTS set declarations appear only in repo-state.cjs among lib/*.cjs.
//  10. Existing suites untouched: project-state.test.cjs, brownfield-detector.test.cjs,
//      init.test.cjs, classifier.test.cjs, hooks/classify-session.test.js pass — run via this
//      TRD's `<verify>` command alongside this file, not re-executed here.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { makeFixture, writeMappedDocs, makeFakeHome } = require('./__fixtures__/adopt-fixtures.cjs');

const projectState = require('./project-state.cjs');
const brownfieldDetector = require('./brownfield-detector.cjs');
const repoState = require('./repo-state.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

let parent;
let home;

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'df-repo-delegation-parent-'));
  home = makeFakeHome();
});

afterEach(() => {
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

function runCli(args, cwd) {
  const r = spawnSync('node', [DF_TOOLS, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, HOME: home },
  });
  if (r.status !== 0) {
    throw new Error(`CLI failed (${r.status}): ${args.join(' ')}\nstdout:${r.stdout}\nstderr:${r.stderr}`);
  }
  return JSON.parse(r.stdout.trim());
}

// ─── init new-project — repo_state delegation (tests 1-4) ────────────────────

describe('init new-project — repo_state delegation', () => {
  test('1. go-service fixture -> is_brownfield, needs_codebase_map, repo_state.signals.primary_lang go', () => {
    const root = makeFixture('go-service', { parent, home });
    const json = runCli(['init', 'new-project', '--raw'], root);
    assert.strictEqual(json.is_brownfield, true);
    assert.strictEqual(json.needs_codebase_map, true);
    assert.strictEqual(json.has_package_file, true);
    assert.strictEqual(json.has_existing_code, true);
    assert.ok(['brownfield', 'scratch'].includes(json.repo_state.state), json.repo_state.state);
    assert.strictEqual(json.repo_state.signals.primary_lang, 'go');
  });

  test('2. empty fixture -> not brownfield, no codebase-map need, greenfield', () => {
    const root = makeFixture('empty', { parent, home });
    const json = runCli(['init', 'new-project', '--raw'], root);
    assert.strictEqual(json.is_brownfield, false);
    assert.strictEqual(json.needs_codebase_map, false);
    assert.strictEqual(json.repo_state.state, 'greenfield');
  });

  test('3. aoforge fixture after writeMappedDocs -> no codebase-map need, aoforge', () => {
    const root = makeFixture('aoforge', { parent, home });
    writeMappedDocs(root);
    const json = runCli(['init', 'new-project', '--raw'], root);
    assert.strictEqual(json.needs_codebase_map, false);
    assert.strictEqual(json.repo_state.state, 'aoforge');
  });

  test('4. code file nested 5 levels deep, no manifest -> is_brownfield true (old -maxdepth 3 said false)', () => {
    const root = fs.mkdtempSync(path.join(parent, 'deep-nest-'));
    const deepFile = path.join(root, 'a', 'b', 'c', 'd', 'e', 'x.go');
    fs.mkdirSync(path.dirname(deepFile), { recursive: true });
    fs.writeFileSync(deepFile, 'package e\n', 'utf-8');
    const json = runCli(['init', 'new-project', '--raw'], root);
    assert.strictEqual(json.has_existing_code, true);
    assert.strictEqual(json.has_package_file, false);
    assert.strictEqual(json.is_brownfield, true);
    assert.strictEqual(json.needs_codebase_map, true);
  });
});

// ─── detect brownfield-map — repo_state delegation (test 5) ──────────────────

describe('detect brownfield-map — repo_state delegation', () => {
  test('5. source_file_count at exactly 50 -> should_offer_map true; at 49 -> false', () => {
    const root = makeFixture('aoforge', { parent, home });
    const pkgDir = path.join(root, 'pkg');
    fs.mkdirSync(pkgDir, { recursive: true });

    const before = runCli(['detect', 'brownfield-map', root, '--raw'], parent);
    const base = before.source_file_count;
    const need49 = 49 - base;
    assert.ok(need49 >= 0, `base source_file_count ${base} already >= 49`);

    for (let i = 0; i < need49; i++) {
      fs.writeFileSync(path.join(pkgDir, `f${i}.go`), 'package pkg\n', 'utf-8');
    }
    const json49 = runCli(['detect', 'brownfield-map', root, '--raw'], parent);
    assert.strictEqual(json49.source_file_count, 49);
    assert.strictEqual(json49.should_offer_map, false);

    fs.writeFileSync(path.join(pkgDir, `f${need49}.go`), 'package pkg\n', 'utf-8');
    const json50 = runCli(['detect', 'brownfield-map', root, '--raw'], parent);
    assert.strictEqual(json50.source_file_count, 50);
    assert.strictEqual(json50.should_offer_map, true);
  });
});

// ─── project-state — repo_state delegation (test 6) ───────────────────────────

describe('project-state — repo_state delegation', () => {
  test('6. output keys are exactly the legacy eight plus state, across fixtures', () => {
    const kinds = ['go-service', 'flutter-app', 'node-cli', 'empty', 'aoforge'];
    const expectedKeys = [
      'has_planning', 'has_git', 'git_age_days', 'code_files', 'primary_lang',
      'is_substantive', 'previously_declined', 'decline_expires', 'state',
    ].sort();
    for (const kind of kinds) {
      const root = makeFixture(kind, { parent, home });
      const json = runCli(['project-state', root, '--raw'], parent);
      assert.deepStrictEqual(Object.keys(json).sort(), expectedKeys, kind);
    }
  });
});

// ─── Adapter parity (tests 7-9) ────────────────────────────────────────────────

describe('adapter parity', () => {
  test('7. getProjectState parity with detectRepoState across fixtures', () => {
    const kinds = ['go-service', 'flutter-app', 'node-cli', 'empty', 'aoforge'];
    for (const kind of kinds) {
      const root = makeFixture(kind, { parent, home });
      const ps = projectState.getProjectState(root, { userHome: null });
      const rs = repoState.detectRepoState(root, { userHome: null });
      assert.strictEqual(ps.code_files, rs.signals.code_files, kind);
      assert.strictEqual(ps.primary_lang, rs.signals.primary_lang, kind);
      assert.strictEqual(ps.is_substantive, rs.derived.is_substantive, kind);
      assert.strictEqual(ps.state, rs.state, kind);
    }
  });

  test('8. countSourceFiles is the same function object across all three modules', () => {
    assert.strictEqual(brownfieldDetector.countSourceFiles, repoState.countSourceFiles);
    assert.strictEqual(projectState.countSourceFiles, repoState.countSourceFiles);
  });

  test('9. EXCLUDE / EXTS set declarations live only in repo-state.cjs', () => {
    // Built via concatenation so this test's own source text never contains the literal
    // needle (which would otherwise make the test match itself).
    const needleExclude = ['const', 'EXCLUDE'].join(' ');
    const needleExts = ['const', 'EXTS'].join(' ');
    const selfName = 'repo-state-delegation.test.cjs';

    function listCjsFiles(dir) {
      let files = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files = files.concat(listCjsFiles(full));
        else if (e.isFile() && e.name.endsWith('.cjs') && e.name !== selfName) files.push(full);
      }
      return files;
    }

    const matches = new Set();
    for (const f of listCjsFiles(__dirname)) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes(needleExclude) || content.includes(needleExts)) {
        matches.add(path.basename(f));
      }
    }
    assert.deepStrictEqual([...matches], ['repo-state.cjs']);
  });
});
