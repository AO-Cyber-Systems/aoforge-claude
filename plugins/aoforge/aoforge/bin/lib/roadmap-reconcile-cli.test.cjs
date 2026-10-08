'use strict';

/*
TEST LIST — TRD 09-03 CLI + flag parser + render summary
=========================================================

Group CLI (subprocess-based, exercising aof-tools sync-roadmap):
- CLI1: default mode + clean fixture → exit 0, "No drift detected"
- CLI2: default mode + drift fixture → exit 0, ROADMAP file rewritten
- CLI3: --dry-run flag → exit 0, ROADMAP unchanged on disk, JSON output has changes
- CLI4: --raw flag + drift fixture → raw human-readable text output to stdout
- CLI5: --interactive in non-TTY → warning on stderr + falls back to write mode
- CLI6: ROADMAP missing → warning emitted, exit 0 (graceful)

Group FP (_parseFlags unit tests):
- FP1: --dry-run → { flags: { 'dry-run': true }, positional: [] }
- FP2: --interactive --raw → both flags true
- FP3: empty args → { flags: {}, positional: [] }
- FP4: unknown --flag treated as boolean flag

Group RS (_renderSummary unit tests):
- RS1: empty result → 'No drift detected. ROADMAP matches disk truth.'
- RS2: 1 change → includes kind + obj + trd + before/after lines
- RS3: warnings → 'Warnings: N' line + per-warning detail
- RS4: mixed changes + warnings → both sections present
*/

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const { _parseFlags, _renderSummary } = require('./roadmap-reconcile-cli.cjs');

// ─── Group CLI — subprocess-based tests ──────────────────────────────────────

test('CLI1: default mode + clean fixture → exit 0, "No drift detected"', () => {
  // Build fixture where all TRDs are already correctly [x] with SUMMARY and status is
  // already 'complete' so no rollup change fires either
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'complete 2026-05-04',  // already complete → no rollup change
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: 'x', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Output should say no drift (human-readable)
    const out = r.stdout;
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch {}
    const noDrift = out.includes('No drift detected') ||
      (parsed && parsed.changes_count === 0);
    assert.ok(noDrift, `expected zero drift in output: ${out}`);
  } finally {
    cleanup();
  }
});

test('CLI2: default mode + drift fixture → exit 0, ROADMAP file rewritten with [x]', () => {
  // Build fixture where ROADMAP shows [ ] but SUMMARY exists (drift)
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(before.includes('- [ ]'), 'fixture starts with unchecked TRD');

    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);

    const after = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(after.includes('- [x]'), 'ROADMAP was rewritten with [x]');
    assert.ok(!after.includes('- [ ] 01-01'), 'no longer unchecked');
  } finally {
    cleanup();
  }
});

test('CLI3: --dry-run flag → exit 0, ROADMAP unchanged on disk, JSON output has changes', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const before = fs.readFileSync(roadmapPath, 'utf-8');

    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);

    // ROADMAP must NOT be written in dry-run
    const after = fs.readFileSync(roadmapPath, 'utf-8');
    assert.strictEqual(before, after, 'ROADMAP.md unchanged in dry-run mode');

    // JSON output should show changes
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.ok(parsed.changes_count > 0, 'changes_count > 0');
    assert.strictEqual(parsed.mode, 'dry-run', 'mode is dry-run');
  } finally {
    cleanup();
  }
});

test('CLI4: --raw flag + drift fixture → human-readable text output to stdout', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run', '--raw'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // --raw produces human-readable text, not JSON
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch {}
    assert.ok(parsed === null, '--raw output should not be JSON');
    assert.ok(r.stdout.length > 0, 'has output');
  } finally {
    cleanup();
  }
});

test('CLI5: --interactive in non-TTY → warning on stderr + falls back to write mode', () => {
  // In subprocess (non-TTY), --interactive should warn and fall back to write mode
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--interactive'], {
      encoding: 'utf-8',
      cwd: projectRoot,
      // stdin is not a TTY in spawnSync
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Warning should appear on stderr
    assert.ok(
      r.stderr.includes('non-TTY') || r.stderr.includes('falling back'),
      `expected non-TTY warning in stderr: ${r.stderr}`,
    );
    // Write mode applied — ROADMAP should be updated
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(content.includes('- [x]'), 'write mode applied after non-TTY fallback');
  } finally {
    cleanup();
  }
});

test('CLI6: ROADMAP missing → warning emitted, exit 0 (graceful)', () => {
  // Build tmpdir with no ROADMAP.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cli6-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  // No ROADMAP.md written

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Should have emitted warning about missing ROADMAP
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.ok(parsed.warnings_count > 0 || parsed.warnings.length > 0, 'warning present');
    const hasRoadmapWarning = (parsed.warnings || []).some(w => w.kind === 'roadmap_missing');
    assert.ok(hasRoadmapWarning, 'roadmap_missing warning present');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Group FP — _parseFlags unit tests ───────────────────────────────────────

test('FP1: --dry-run → { flags: { "dry-run": true }, positional: [] }', () => {
  const result = _parseFlags(['--dry-run']);
  assert.deepStrictEqual(result.flags, { 'dry-run': true });
  assert.deepStrictEqual(result.positional, []);
});

test('FP2: --interactive --raw → both flags true', () => {
  const result = _parseFlags(['--interactive', '--raw']);
  assert.strictEqual(result.flags['interactive'], true);
  assert.strictEqual(result.flags['raw'], true);
});

test('FP3: empty args → { flags: {}, positional: [] }', () => {
  const result = _parseFlags([]);
  assert.deepStrictEqual(result.flags, {});
  assert.deepStrictEqual(result.positional, []);
});

test('FP4: unknown --flag treated as boolean flag', () => {
  const result = _parseFlags(['--unknown-flag']);
  assert.strictEqual(result.flags['unknown-flag'], true);
});

// ─── Group RS — _renderSummary unit tests ────────────────────────────────────

test('RS1: empty result → "No drift detected. ROADMAP matches disk truth."', () => {
  const result = _renderSummary({ changes: [], warnings: [] });
  assert.strictEqual(result, 'No drift detected. ROADMAP matches disk truth.');
});

test('RS2: 1 change → includes kind + obj + trd + before/after lines', () => {
  const result = _renderSummary({
    changes: [{
      kind: 'trd_summary_exists',
      objective_num: '01',
      trd_id: '01-01',
      before: '- [ ] 01-01-foo-TRD.md — some desc',
      after: '- [x] 01-01-foo-TRD.md — some desc',
    }],
    warnings: [],
  });
  assert.ok(result.includes('trd_summary_exists'), 'kind present');
  assert.ok(result.includes('01'), 'objective_num present');
  assert.ok(result.includes('01-01'), 'trd_id present');
  assert.ok(result.includes('- [ ]'), 'before line');
  assert.ok(result.includes('- [x]'), 'after line');
});

test('RS3: warnings → "Warnings: N" line + per-warning detail', () => {
  const result = _renderSummary({
    changes: [],
    warnings: [{ kind: 'trd_orphan_warning', message: 'missing TRD file for 01-01' }],
  });
  assert.ok(result.includes('Warnings: 1'), 'warnings count');
  assert.ok(result.includes('trd_orphan_warning'), 'warning kind');
});

test('RS4: mixed changes + warnings → both sections present', () => {
  const result = _renderSummary({
    changes: [{
      kind: 'trd_summary_exists',
      objective_num: '01',
      trd_id: '01-01',
      before: '- [ ] 01-01-foo-TRD.md — desc',
      after: '- [x] 01-01-foo-TRD.md — desc',
    }],
    warnings: [{ kind: 'trd_orphan_warning', message: 'orphan' }],
  });
  assert.ok(result.includes('Drift corrected'), 'changes section');
  assert.ok(result.includes('Warnings:'), 'warnings section');
});

// ─── TRD 48-13: sync-roadmap — local characterization + store mode ───────────
//
// sync-roadmap modes (cmdSyncRoadmapRoute): default `write` and `--interactive`
// (which falls back to write without a TTY) WRITE ROADMAP.md; `--dry-run` is
// read-only.
//
// 4c. Local mode: write mode ticks exactly the drifted TRD line (bytes pinned).
// 9.  Store mode: write / --interactive / --raw are no-ops (exit 0, message names
//     `gh pull --all`, ROADMAP.md byte-identical); --dry-run is unchanged.
// 10. github.enabled without github.store → local behaviour.

const SR_ROADMAP = `# Roadmap: Test Project

## Objective Details

### Objective 7: Seven

**Status:** in flight

- [ ] 07-01-alpha-TRD.md — first
- [ ] 07-02-beta-TRD.md — second
`;

const SR_STORE_MESSAGE = 'ROADMAP.md is generated in store mode; run `aof-tools gh pull --all`';

const srDirs = [];
require('node:test').afterEach(() => {
  while (srDirs.length) fs.rmSync(srDirs.pop(), { recursive: true, force: true });
});

function srProject(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-sync-roadmap-'));
  srDirs.push(dir);
  const obj = path.join(dir, '.planning', 'objectives', '07-seven');
  fs.mkdirSync(obj, { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), SR_ROADMAP, 'utf-8');
  fs.writeFileSync(path.join(obj, '07-01-alpha-TRD.md'), '# a\n', 'utf-8');
  fs.writeFileSync(path.join(obj, '07-02-beta-TRD.md'), '# b\n', 'utf-8');
  fs.writeFileSync(path.join(obj, '07-01-alpha-SUMMARY.md'), '# s\n\n## Self-Check: PASSED\n', 'utf-8');
  if (config) {
    fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  }
  return dir;
}

function srRun(args, cwd) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-sync-roadmap-home-'));
  srDirs.push(home);
  const r = spawnSync(process.execPath, [DF_TOOLS, 'sync-roadmap', ...args], {
    cwd,
    env: Object.assign({}, process.env, { HOME: home }),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* raw text */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function srRoadmap(dir) {
  return fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf-8');
}

const SR_TICKED = SR_ROADMAP.replace('- [ ] 07-01-alpha-TRD.md', '- [x] 07-01-alpha-TRD.md');

test('48-13 4c: local write mode ticks exactly the drifted TRD line', () => {
  const dir = srProject();
  const r = srRun([], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.mode, 'write');
  assert.strictEqual(r.json.changes_count, 1);
  assert.notStrictEqual(SR_TICKED, SR_ROADMAP);
  assert.strictEqual(srRoadmap(dir), SR_TICKED);

  const rawDir = srProject();
  const raw = srRun(['--raw'], rawDir);
  assert.strictEqual(raw.stdout,
    'Drift corrected: 1 change(s)\n  [trd_summary_exists] obj=7 trd=07-01\n' +
    '    - - [ ] 07-01-alpha-TRD.md — first\n    + - [x] 07-01-alpha-TRD.md — first');
  assert.strictEqual(srRoadmap(rawDir), SR_TICKED);
});

test('48-13 4d: local --dry-run reports the change and leaves ROADMAP.md alone', () => {
  const dir = srProject();
  const r = srRun(['--dry-run'], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.mode, 'dry-run');
  assert.strictEqual(r.json.changes_count, 1);
  assert.strictEqual(srRoadmap(dir), SR_ROADMAP);
});

const SR_STORE = { github: { enabled: true, store: true, repo: 'o/r' } };

test('48-13 9a: store mode write (default) is a no-op naming gh pull --all', () => {
  const dir = srProject(SR_STORE);
  const r = srRun([], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.json, { updated: false, skipped: 'store-mode', message: SR_STORE_MESSAGE });
  assert.strictEqual(srRoadmap(dir), SR_ROADMAP);
});

test('48-13 9b: store mode --interactive (no TTY) is the same no-op, no write-mode fallback', () => {
  const dir = srProject(SR_STORE);
  const r = srRun(['--interactive'], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.skipped, 'store-mode');
  assert.doesNotMatch(r.stderr, /falling back to write mode/);
  assert.strictEqual(srRoadmap(dir), SR_ROADMAP);
});

test('48-13 9c: store mode --raw prints `skipped`', () => {
  const dir = srProject(SR_STORE);
  const r = srRun(['--raw'], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'skipped');
  assert.strictEqual(srRoadmap(dir), SR_ROADMAP);
});

test('48-13 9d: store mode --dry-run runs unchanged', () => {
  const local = srProject();
  const store = srProject(SR_STORE);
  const a = srRun(['--dry-run'], local);
  const b = srRun(['--dry-run'], store);
  assert.strictEqual(b.status, 0, b.stderr);
  assert.strictEqual(b.json.mode, 'dry-run');
  assert.strictEqual(b.json.changes_count, 1);
  assert.strictEqual(b.stdout.split(store).join('<P>'), a.stdout.split(local).join('<P>'));
  assert.strictEqual(srRoadmap(store), SR_ROADMAP);
});

test('48-13 10: github.enabled without github.store → local write', () => {
  const dir = srProject({ github: { enabled: true, repo: 'o/r' } });
  const r = srRun([], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.json.mode, 'write');
  assert.strictEqual(srRoadmap(dir), SR_TICKED);
});
