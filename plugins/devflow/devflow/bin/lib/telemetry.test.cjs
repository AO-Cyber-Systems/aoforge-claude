'use strict';

/**
 * telemetry.test.cjs — TRD 31-01
 *
 * The advisories are the product here. Raw counts nobody reads are how the
 * original problems stayed invisible for three months; these tests pin that a
 * real signal produces a sentence telling someone what to do about it.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { collect } = require('./telemetry.cjs');
const { recordOverride } = require('./override.cjs');
const stackFx = require('./__fixtures__/stack-profile-fixtures.cjs');

let dir, pd;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-'));
  pd = path.join(dir, '.planning');
  fs.mkdirSync(pd);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('collect() — quiet when nothing is wrong', () => {
  test('a clean project reports nothing needing attention', () => {
    const r = collect({ planningDir: pd });
    assert.deepEqual(r.advisories, ['nothing needs attention']);
    assert.equal(r.overrides.total, 0);
    assert.equal(r.progress_guard.worst_streak, 0);
  });

  test('no planning dir is stated, not crashed', () => {
    const r = collect({ planningDir: null });
    assert.match(r.advisories[0], /not a DevFlow project/);
  });
});

describe('collect() — surfaces real signals as advice', () => {
  test('a repeatedly-overridden gate is called out as mis-scoped', () => {
    for (let i = 0; i < 5; i++) recordOverride({ planningDir: pd, gate: 'edits', reason: `r${i}` });
    const r = collect({ planningDir: pd });
    assert.equal(r.overrides.total, 5);
    assert.ok(r.advisories.some(a => /mis-scoped/.test(a)), 'expected a rescoping advisory');
  });

  test('a stuck loop surfaces from progress-guard state', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), JSON.stringify({
      s1: { guard: { streak: 6, last: 'abc' }, updated: Date.now() },
    }));
    const r = collect({ planningDir: pd });
    assert.equal(r.progress_guard.worst_streak, 6);
    assert.ok(r.advisories.some(a => /stuck loop/.test(a)));
  });

  test('a streak below the warn threshold stays quiet', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), JSON.stringify({
      s1: { guard: { streak: 2 }, updated: Date.now() },
    }));
    const r = collect({ planningDir: pd });
    assert.deepEqual(r.advisories, ['nothing needs attention']);
  });

  test('DevFlow-owned blocks are called out; harness blocks are not', () => {
    const withOwned = collect({
      planningDir: pd,
      sessionReport: { total_events: 10, devflow_owned_events: 4, sessions_with_blocks_pct: 20, by_category: { 'devflow-edit-gate': 4 } },
    });
    assert.ok(withOwned.advisories.some(a => /DevFlow-owned blocks/.test(a)));

    const harnessOnly = collect({
      planningDir: pd,
      sessionReport: { total_events: 10, devflow_owned_events: 0, sessions_with_blocks_pct: 20, by_category: { 'worktree-isolation': 10 } },
    });
    assert.deepEqual(harnessOnly.advisories, ['nothing needs attention'],
      'harness-owned blocks must not be reported as DevFlow debt');
  });

  test('block scanning is opt-in — omitted when no report is supplied', () => {
    assert.equal(collect({ planningDir: pd }).blocks, null);
  });

  test('a corrupt progress-guard file degrades to zeros', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), '{{{ broken');
    const r = collect({ planningDir: pd });
    assert.equal(r.progress_guard.worst_streak, 0);
  });
});

// ─── objective 38 — doc advisories (TRD 38-11 tests 1-3) ───────────────────────────────────
//
// `collect()` also runs doc-staleness.collect() and merges its issues in as `docs:`-prefixed
// advisories, so a stale STACK.md or a broken staleness check is visible from the same one call
// that already surfaces override and progress-guard signals.
describe('collect() — objective 38 — doc advisories', () => {
  test('1. a stale STACK.md surfaces as a docs: W051 advisory', () => {
    fs.writeFileSync(
      path.join(pd, 'STACK.md'),
      stackFx.profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2025-01-01"\n' }),
      'utf-8'
    );
    const r = collect({ planningDir: pd });
    assert.ok(
      r.advisories.some((a) => a.startsWith('docs: W051')),
      `expected a docs: W051 advisory; got ${JSON.stringify(r.advisories)}`
    );
    assert.equal(r.docs.count, 1);
  });

  test('2. a clean project has zero doc advisories', () => {
    const r = collect({ planningDir: pd });
    assert.deepEqual(r.advisories, ['nothing needs attention']);
    assert.equal(r.docs.count, 0);
  });

  test('3. a throwing doc-staleness collect() becomes one advisory; other sections stay populated', () => {
    const docStalenessPath = require.resolve('./doc-staleness.cjs');
    const original = require.cache[docStalenessPath];
    require.cache[docStalenessPath] = {
      id: docStalenessPath,
      filename: docStalenessPath,
      loaded: true,
      exports: { collect: () => { throw new Error('boom'); } },
    };
    try {
      const r = collect({ planningDir: pd });
      const docsAdvisories = r.advisories.filter((a) => a.startsWith('docs:'));
      assert.deepEqual(docsAdvisories, ['docs: staleness check failed — boom']);
      assert.ok(r.overrides, 'overrides section still populated');
      assert.ok(r.progress_guard, 'progress_guard section still populated');
    } finally {
      if (original) require.cache[docStalenessPath] = original;
      else delete require.cache[docStalenessPath];
    }
  });
});

// ─── df-tools telemetry (CLI) — TRD 38-11 tests 4-7 ────────────────────────────────────────
//
// Wires collect() into the dispatcher: `df-tools telemetry [--raw]`, a read-only summary
// command (previously documented in CLAUDE.md but unreachable — `Unknown command: telemetry`).
describe('df-tools telemetry (CLI) — objective 38', () => {
  const { spawnSync } = require('child_process');
  const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

  function makeHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-home-'));
  }

  function runTelemetry(args, cwd, home) {
    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', cwd, 'telemetry', ...args], {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, HOME: home },
    });
    return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  }

  test('4. exit 0 with valid JSON and an advisories array', () => {
    const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-cli-'));
    const cliHome = makeHome();
    fs.mkdirSync(path.join(cliDir, '.planning'));
    try {
      const r = runTelemetry([], cliDir, cliHome);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.ok(Array.isArray(json.advisories), `expected advisories array; got ${r.stdout}`);
    } finally {
      fs.rmSync(cliDir, { recursive: true, force: true });
      fs.rmSync(cliHome, { recursive: true, force: true });
    }
  });

  test('5. --raw stdout lines equal the JSON advisories', () => {
    const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-cli-'));
    const cliHome = makeHome();
    const cliPd = path.join(cliDir, '.planning');
    fs.mkdirSync(cliPd);
    for (let i = 0; i < 5; i++) recordOverride({ planningDir: cliPd, gate: 'edits', reason: `r${i}` });
    fs.writeFileSync(
      path.join(cliPd, 'STACK.md'),
      stackFx.profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2025-01-01"\n' }),
      'utf-8'
    );
    try {
      const jsonR = runTelemetry([], cliDir, cliHome);
      assert.equal(jsonR.status, 0, `stderr: ${jsonR.stderr}`);
      const json = JSON.parse(jsonR.stdout);
      assert.ok(json.advisories.length >= 2, `expected >= 2 advisories; got ${JSON.stringify(json.advisories)}`);

      const rawR = runTelemetry(['--raw'], cliDir, cliHome);
      assert.equal(rawR.status, 0, `stderr: ${rawR.stderr}`);
      assert.deepEqual(rawR.stdout.split('\n'), json.advisories);
    } finally {
      fs.rmSync(cliDir, { recursive: true, force: true });
      fs.rmSync(cliHome, { recursive: true, force: true });
    }
  });

  test('6. no .planning/ -> exit 0, "no .planning/ — not a DevFlow project"', () => {
    const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-cli-'));
    const cliHome = makeHome();
    try {
      const r = runTelemetry(['--raw'], cliDir, cliHome);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.stdout, 'no .planning/ — not a DevFlow project');
    } finally {
      fs.rmSync(cliDir, { recursive: true, force: true });
      fs.rmSync(cliHome, { recursive: true, force: true });
    }
  });

  test('7. --help prints usage, exit 0, no side effects', () => {
    const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-cli-'));
    const cliHome = makeHome();
    try {
      const before = fs.readdirSync(cliDir);
      const r = runTelemetry(['--help'], cliDir, cliHome);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /df-tools telemetry \[--raw\]/);
      assert.deepEqual(fs.readdirSync(cliDir), before, 'no side effects');
    } finally {
      fs.rmSync(cliDir, { recursive: true, force: true });
      fs.rmSync(cliHome, { recursive: true, force: true });
    }
  });
});
