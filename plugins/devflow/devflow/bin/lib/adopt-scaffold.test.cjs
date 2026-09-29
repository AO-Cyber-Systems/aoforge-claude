'use strict';

// adopt-scaffold.test.cjs — `df-tools adopt scaffold` (objective 37, TRD 07, ADP-03).
//
// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Local helper `readyFixture(kind)` = makeFixture(kind) -> spawn `adopt begin` -> writeMappedDocs
// -> writeProjectMd({kind: api/app/cli, defaultWork: 'feature'}) for go-service/flutter-app/node-cli.
// All spawns: `[DF_TOOLS, '--cwd', root, ...]`, env `gitEnv(fakeHome)`.
//
// Outermost — the produced project is valid:
//   1. go-service: `adopt scaffold` exit 0; STATE.md/ROADMAP.md/STACK.md/config.json/state.json
//      exist; CLAUDE.md has exactly one `DEVFLOW:START v=<template version> src=claude-md` block;
//      config.json `devflow.version` === checkout plugin.json version.
//   2. go-service: `stack validate` exit 0; `validate health --raw` errors empty; `roadmap analyze
//      --raw` objectives is [].
//   3. flutter-app and node-cli: same three checks.
//   4. registry has repoKey(root); a backup dir under <home>/.claude/devflow/backups/<key>/ exists.
//   5. marker has steps.scaffolded:true and scaffold.stack.ok:true.
//
// Idempotency / resume:
//   6. a second scaffold -> created:[], snapshot identical, upgrade.backup:null; a third scaffold's
//      marker.scaffold (minus `at`) is stable relative to the second's.
//   7. deleting .planning/ROADMAP.md -> scaffold recreates only that file; every other file
//      byte-identical.
//   8. PROJECT.md bytes identical before and after both runs.
//
// CLAUDE.md placements:
//   9. no CLAUDE.md -> created; content is exactly the rendered block + '\n'.
//   10. CLAUDE.md with plain committed content -> block prepended; original bytes follow verbatim.
//   11. CLAUDE.md already holding one current-version block with a custom overview -> left alone.
//   12. CLAUDE.md with two DEVFLOW blocks -> exit 1, stderr names CLAUDE.md, nothing written.
//
// Refusals:
//   13. PROJECT.md missing / invalid kind / invalid default_work -> exit 1 naming the problem,
//       nothing written.
//   14. on main without begin -> exit 3, route from preflight, nothing written.
//
// Pure renderers (exact literal expectations):
//   15. renderState({...}) equals the expected STATE.md string.
//   16. renderRoadmap({...}) equals the expected ROADMAP.md string (no `### Objective` heading).
//
// Local date (TRD 42-01, SDR-07):
//   17. in-process scaffold with an injected `now` at LOCAL 23:30 on 2026-09-28 -> STATE.md,
//       ROADMAP.md and STACK.md provenance.reviewed all carry 2026-09-28 (never the UTC date).

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const {
  makeFixture,
  makeFakeHome,
  gitEnv,
  snapshot,
  writeMappedDocs,
  writeProjectMd,
} = require('./__fixtures__/adopt-fixtures.cjs');

const { renderState, renderRoadmap, scaffold } = require('./adopt.cjs');
const stackProfile = require('./stack-profile.cjs');
const { repoKey } = require('./upgrade.cjs');
const { loadClaudeMdTemplate } = require('./migrations/0005-claude-md-block.cjs');
const managedBlock = require('./managed-block.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const PLUGIN_JSON_PATH = path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

let spawnedTmpRoots = [];
function mkdtemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnedTmpRoots.push(dir);
  return dir;
}

let fakeHome;

function run(argv, cwd, env) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd, encoding: 'utf-8', timeout: 30000, env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

function runAdopt(fixture, sub, extraArgs = []) {
  const r = run(['--cwd', fixture, 'adopt', sub, ...extraArgs], mkdtemp('df-adopt-spawn-'), gitEnv(fakeHome));
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* left null on parse failure */ }
  return { ...r, report };
}

function runRaw(argv) {
  return run(argv, mkdtemp('df-verify-spawn-'), gitEnv(fakeHome));
}

const KIND_FOR = { 'go-service': 'api', 'flutter-app': 'app', 'node-cli': 'cli' };
const NAME_FOR = { 'go-service': 'Orders Service', 'flutter-app': 'Habit Tracker', 'node-cli': 'Todo CLI' };

/**
 * readyFixture(kind) -> absolute fixture root, ready for scaffold: makeFixture(kind) -> spawn
 * `adopt begin` -> writeMappedDocs -> writeProjectMd({kind: intent-kind, defaultWork: 'feature'}).
 */
function readyFixture(kind) {
  const root = makeFixture(kind, { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
  const beginResult = runAdopt(root, 'begin');
  assert.strictEqual(beginResult.status, 0, beginResult.out);
  writeMappedDocs(root);
  writeProjectMd(root, { name: NAME_FOR[kind], kind: KIND_FOR[kind], defaultWork: 'feature' });
  return root;
}

function commitFile(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content, 'utf-8');
  execFileSync('git', ['-C', root, 'add', rel], { env: gitEnv(fakeHome), stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', `add ${rel}`], { env: gitEnv(fakeHome), stdio: 'ignore' });
}

function readFile(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

beforeEach(() => {
  spawnedTmpRoots = [];
  fakeHome = makeFakeHome();
});

afterEach(() => {
  for (const dir of spawnedTmpRoots) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

// ─── Outermost: the produced project is valid (tests 1-5) ─────────────────

describe('df-tools adopt scaffold — outermost validity', () => {
  test('1. go-service: scaffold writes the deterministic files and one versioned CLAUDE.md block', () => {
    const root = readyFixture('go-service');
    const { status, report, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'scaffold', out);
    assert.ok(exists(root, '.planning/STATE.md'));
    assert.ok(exists(root, '.planning/ROADMAP.md'));
    assert.ok(exists(root, '.planning/STACK.md'));
    assert.ok(exists(root, '.planning/config.json'));
    assert.ok(exists(root, '.planning/state.json'));

    const tpl = loadClaudeMdTemplate();
    const claudeMd = readFile(root, 'CLAUDE.md');
    const starts = claudeMd.match(new RegExp(`<!-- DEVFLOW:START v=${tpl.version} src=claude-md -->`, 'g')) || [];
    assert.strictEqual(starts.length, 1, claudeMd);

    const config = JSON.parse(readFile(root, '.planning/config.json'));
    const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf-8'));
    assert.strictEqual(config.devflow.version, pluginJson.version);
  });

  test('2. go-service: scaffolded project passes stack validate, health (no errors), zero objectives', () => {
    const root = readyFixture('go-service');
    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);

    const sv = runRaw(['--cwd', root, 'stack', 'validate']);
    assert.strictEqual(sv.status, 0, sv.out);

    const health = runRaw(['--cwd', root, 'validate', 'health', '--raw']);
    const healthReport = JSON.parse(health.stdout);
    assert.deepStrictEqual(healthReport.errors, [], JSON.stringify(healthReport));

    const roadmap = runRaw(['--cwd', root, 'roadmap', 'analyze', '--raw']);
    const roadmapReport = JSON.parse(roadmap.stdout);
    assert.deepStrictEqual(roadmapReport.objectives, [], JSON.stringify(roadmapReport));
  });

  test('3. flutter-app and node-cli: same three checks', () => {
    for (const kind of ['flutter-app', 'node-cli']) {
      const root = readyFixture(kind);
      const scaffoldResult = runAdopt(root, 'scaffold');
      assert.strictEqual(scaffoldResult.status, 0, `${kind}: ${scaffoldResult.out}`);

      const sv = runRaw(['--cwd', root, 'stack', 'validate']);
      assert.strictEqual(sv.status, 0, `${kind}: ${sv.out}`);

      const health = runRaw(['--cwd', root, 'validate', 'health', '--raw']);
      const healthReport = JSON.parse(health.stdout);
      assert.deepStrictEqual(healthReport.errors, [], `${kind}: ${JSON.stringify(healthReport)}`);

      const roadmap = runRaw(['--cwd', root, 'roadmap', 'analyze', '--raw']);
      const roadmapReport = JSON.parse(roadmap.stdout);
      assert.deepStrictEqual(roadmapReport.objectives, [], kind);
    }
  });

  test('4. the repo is registered with the pruner and a backup dir exists', () => {
    const root = readyFixture('go-service');
    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);

    const regPath = path.join(fakeHome, '.claude', 'devflow', 'backups', '.registry.json');
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
    const key = repoKey(root);
    assert.ok(registry.repos[key], JSON.stringify(registry));

    const backupDir = path.join(fakeHome, '.claude', 'devflow', 'backups', key);
    assert.ok(fs.existsSync(backupDir));
    assert.ok(fs.readdirSync(backupDir).length >= 1);
  });

  test('5. the marker records scaffolded:true and scaffold.stack.ok:true', () => {
    const root = readyFixture('go-service');
    const { report, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(report.marker.steps.scaffolded, true, out);
    assert.strictEqual(report.marker.scaffold.stack.ok, true, JSON.stringify(report.marker.scaffold.stack));
  });

  // TRD 42-07 test 17: the grounded draft's keys and notes reach the marker, so `adopt report`
  // can tell a verified or inherited key from one with no evidence at all.
  test('17. scaffold records evidence_keys, resolved_keys, inherited_keys and notes from the draft', () => {
    const root = readyFixture('go-service');
    const { report, out } = runAdopt(root, 'scaffold');
    const st = report.marker.scaffold.stack;
    assert.strictEqual(st.action, 'written', out);
    for (const field of ['evidence_keys', 'resolved_keys', 'inherited_keys', 'notes']) {
      assert.ok(Array.isArray(st[field]), `scaffold.stack.${field} missing: ${JSON.stringify(st)}`);
    }
    // go-service: Makefile test/lint/build over a go.mod, so the draft extends go.
    for (const key of ['test', 'lint', 'build']) assert.ok(st.evidence_keys.includes(key), JSON.stringify(st.evidence_keys));
    for (const key of st.resolved_keys) assert.ok(st.evidence_keys.includes(key), `resolved ${key} not in evidence_keys`);
    // Every loop key is accounted for: verified, inherited from go, or explained by a note.
    for (const key of ['test', 'lint', 'build']) {
      const covered = st.resolved_keys.includes(key) || st.inherited_keys.includes(key) || st.notes.some((n) => n.key === key);
      assert.ok(covered, `${key}: ${JSON.stringify(st)}`);
    }
  });
});

// ─── Idempotency / resume (tests 6-8) ──────────────────────────────────────

describe('df-tools adopt scaffold — idempotency and resume', () => {
  test('6. a second scaffold creates nothing; the marker summary is stable across repeated no-ops', () => {
    const root = readyFixture('go-service');
    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);

    const before = snapshot(root);
    const second = runAdopt(root, 'scaffold');
    assert.strictEqual(second.status, 0, second.out);
    assert.deepStrictEqual(second.report.created, []);
    assert.strictEqual(second.report.upgrade.backup, null);
    assert.deepStrictEqual(snapshot(root), before);

    const third = runAdopt(root, 'scaffold');
    assert.strictEqual(third.status, 0, third.out);
    const stripAt = (s) => { const { at, ...rest } = s; return rest; };
    assert.deepStrictEqual(stripAt(third.report.marker.scaffold), stripAt(second.report.marker.scaffold));
  });

  test('7. deleting one generated file recreates only that file; everything else byte-identical', () => {
    const root = readyFixture('go-service');
    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);
    const before = snapshot(root);

    fs.unlinkSync(path.join(root, '.planning', 'ROADMAP.md'));
    assert.ok(!exists(root, '.planning/ROADMAP.md'));

    const { status, report, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 0, out);
    assert.deepStrictEqual(report.created, ['.planning/ROADMAP.md']);

    const after = snapshot(root);
    for (const [key, hash] of Object.entries(before)) {
      if (key === '.planning/ROADMAP.md') continue;
      assert.strictEqual(after[key], hash, key);
    }
    assert.ok(after['.planning/ROADMAP.md']);
  });

  test('8. PROJECT.md is byte-identical before and after both scaffold runs', () => {
    const root = readyFixture('go-service');
    const before = readFile(root, '.planning/PROJECT.md');

    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);
    assert.strictEqual(readFile(root, '.planning/PROJECT.md'), before);

    assert.strictEqual(runAdopt(root, 'scaffold').status, 0);
    assert.strictEqual(readFile(root, '.planning/PROJECT.md'), before);
  });
});

// ─── CLAUDE.md placements (tests 9-12) ─────────────────────────────────────

describe('df-tools adopt scaffold — CLAUDE.md placements', () => {
  test('9. no CLAUDE.md: created with exactly the rendered block plus a trailing newline', () => {
    const root = readyFixture('go-service');
    assert.ok(!exists(root, 'CLAUDE.md'));

    const { status, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 0, out);

    const tpl = loadClaudeMdTemplate();
    const overview =
      '# Project Overview\n\n' +
      'See `.planning/PROJECT.md` (what this is, core value) and `.planning/codebase/` (how it is built).\n' +
      'Adopted by `/devflow:adopt`; review `.planning/ADOPT-REPORT.md`.\n\n' +
      tpl.rules;
    const expectedBlock = managedBlock.render(overview, { v: tpl.version, src: 'claude-md' });
    assert.strictEqual(readFile(root, 'CLAUDE.md'), `${expectedBlock}\n`);
  });

  test('10. CLAUDE.md with plain committed content: block prepended, original bytes preserved', () => {
    const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
    const teamNotes = '# Team notes\n\nkeep me\n';
    commitFile(root, 'CLAUDE.md', teamNotes);
    assert.strictEqual(runAdopt(root, 'begin').status, 0);
    writeMappedDocs(root);
    writeProjectMd(root, { name: NAME_FOR['go-service'], kind: KIND_FOR['go-service'], defaultWork: 'feature' });

    const { status, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 0, out);
    const text = readFile(root, 'CLAUDE.md');
    assert.ok(text.startsWith('<!-- DEVFLOW:START'), text);
    assert.ok(text.endsWith(teamNotes), JSON.stringify(text));
  });

  test('11. CLAUDE.md already holding one current-version block: left alone, custom overview kept', () => {
    const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
    const tpl = loadClaudeMdTemplate();
    const customOverview = '# Project Overview\n\nCustom overview text, written by map-codebase.\n\n' + tpl.rules;
    const existingBlock = managedBlock.render(customOverview, { v: tpl.version, src: 'claude-md' });
    commitFile(root, 'CLAUDE.md', `${existingBlock}\n`);
    assert.strictEqual(runAdopt(root, 'begin').status, 0);
    writeMappedDocs(root);
    writeProjectMd(root, { name: NAME_FOR['go-service'], kind: KIND_FOR['go-service'], defaultWork: 'feature' });

    const { status, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 0, out);
    const text = readFile(root, 'CLAUDE.md');
    const starts = text.match(/<!-- DEVFLOW:START/g) || [];
    assert.strictEqual(starts.length, 1, text);
    assert.ok(text.includes('Custom overview text, written by map-codebase.'), text);
  });

  test('12. CLAUDE.md with two DEVFLOW blocks: exit 1, stderr names CLAUDE.md, nothing written', () => {
    const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
    const tpl = loadClaudeMdTemplate();
    const oneBlock = managedBlock.render('# A\n', { v: tpl.version, src: 'claude-md' });
    const twoBlocks = `${oneBlock}\n\n${oneBlock}\n`;
    commitFile(root, 'CLAUDE.md', twoBlocks);
    assert.strictEqual(runAdopt(root, 'begin').status, 0);
    writeMappedDocs(root);
    writeProjectMd(root, { name: NAME_FOR['go-service'], kind: KIND_FOR['go-service'], defaultWork: 'feature' });

    const before = snapshot(root);
    const { status, stderr, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 1, out);
    assert.match(stderr, /CLAUDE\.md/);
    assert.deepStrictEqual(snapshot(root), before);
  });
});

// ─── Refusals (tests 13-14) ─────────────────────────────────────────────────

describe('df-tools adopt scaffold — refusals', () => {
  test('13. refuses on a missing or invalid PROJECT.md before writing anything', () => {
    // 13a: PROJECT.md missing entirely.
    {
      const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
      assert.strictEqual(runAdopt(root, 'begin').status, 0);
      writeMappedDocs(root);
      const before = snapshot(root);
      const { status, stderr, out } = runAdopt(root, 'scaffold');
      assert.strictEqual(status, 1, out);
      assert.match(stderr, /PROJECT\.md/);
      assert.deepStrictEqual(snapshot(root), before);
    }
    // 13b: invalid kind.
    {
      const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
      assert.strictEqual(runAdopt(root, 'begin').status, 0);
      writeMappedDocs(root);
      writeProjectMd(root, { name: 'Orders Service', kind: 'service', defaultWork: 'feature' });
      const before = snapshot(root);
      const { status, stderr, out } = runAdopt(root, 'scaffold');
      assert.strictEqual(status, 1, out);
      assert.match(stderr, /api, app, library, ui-lib, cli, plugin/);
      assert.deepStrictEqual(snapshot(root), before);
    }
    // 13c: invalid default_work.
    {
      const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
      assert.strictEqual(runAdopt(root, 'begin').status, 0);
      writeMappedDocs(root);
      writeProjectMd(root, { name: 'Orders Service', kind: 'api', defaultWork: 'maintenance' });
      const before = snapshot(root);
      const { status, stderr, out } = runAdopt(root, 'scaffold');
      assert.strictEqual(status, 1, out);
      assert.match(stderr, /feature, port, refactor, foundation, bugfix, prototype, spike/);
      assert.deepStrictEqual(snapshot(root), before);
    }
  });

  test('14. on main without begin: exit 3, route from preflight, nothing written', () => {
    const root = makeFixture('go-service', { parent: mkdtemp('df-scaffold-parent-'), home: fakeHome });
    const before = snapshot(root);
    const { status, report, out } = runAdopt(root, 'scaffold');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.route, 'adopt');
    assert.deepStrictEqual(snapshot(root), before);
  });
});

// ─── Pure renderers (tests 15-16) ──────────────────────────────────────────

describe('df-tools adopt scaffold — pure renderers (exact literal expectations)', () => {
  test('15. renderState renders the exact literal STATE.md', () => {
    const text = renderState({ name: 'orders', coreValue: 'Orders are never lost.', date: '2026-09-28', version: '2.10.1' });
    const expected =
      '# Project State\n\n' +
      '## Project Reference\n\n' +
      'See: .planning/PROJECT.md\n\n' +
      '**Core value:** Orders are never lost.\n' +
      '**Current focus:** No objectives yet — add one with /devflow:objective add\n\n' +
      '## Current Position\n\n' +
      '**Current Objective:** None\n' +
      '**Status:** Adopted — no objectives planned\n' +
      '**Last Activity:** 2026-09-28 — adopted by /devflow:adopt (DevFlow v2.10.1)\n\n' +
      '## Blockers\n\n' +
      'None.\n\n' +
      '## Session Log\n\n' +
      '- 2026-09-28: Adopted by /devflow:adopt (DevFlow v2.10.1); see .planning/ADOPT-REPORT.md\n';
    assert.strictEqual(text, expected);
  });

  test('16. renderRoadmap renders the exact literal ROADMAP.md with no Objective heading', () => {
    const text = renderRoadmap({ name: 'orders', date: '2026-09-28' });
    const expected =
      '# Roadmap: orders\n\n' +
      '## Milestones\n\n' +
      '- **v0.1 — Adopted** (2026-09-28, current): no objectives yet.\n\n' +
      '## Objectives\n\n' +
      'None yet. Add one with `/devflow:objective add`.\n\n' +
      '## Progress\n\n' +
      '| Objective | Milestone | Plans | Status | Completed |\n' +
      '|---|---|---|---|---|\n';
    assert.strictEqual(text, expected);
    assert.ok(!/#{2,4}\s*Objective\s+\d/i.test(text), text);
  });
});

// ─── Local date (test 17, TRD 42-01) ───────────────────────────────────────

describe('df-tools adopt scaffold — dates are the LOCAL calendar date', () => {
  test('17. an injected `now` at local 23:30 on 2026-09-28 writes 2026-09-28 into STATE, ROADMAP and STACK', () => {
    const root = readyFixture('go-service');
    // The LOCAL constructor: 23:30 here is already 2026-09-29 in UTC anywhere west of Greenwich,
    // which is exactly the date the UTC-based code used to write.
    const now = new Date(2026, 8, 28, 23, 30);
    const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf-8'));
    const result = scaffold(root, { env: gitEnv(fakeHome), userHome: fakeHome, pluginVersion: pluginJson.version, now });
    assert.strictEqual(result.route, 'scaffold', JSON.stringify(result));

    const state = readFile(root, '.planning/STATE.md');
    assert.ok(state.includes('**Last Activity:** 2026-09-28 '), state);
    assert.ok(state.includes('- 2026-09-28: Adopted by /devflow:adopt'), state);

    const roadmap = readFile(root, '.planning/ROADMAP.md');
    assert.ok(roadmap.includes('(2026-09-28, current)'), roadmap);

    const stack = stackProfile.parseProfile(readFile(root, '.planning/STACK.md'));
    assert.strictEqual(stack.frontmatter.provenance.reviewed, '2026-09-28');
  });
});
