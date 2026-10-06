'use strict';

/**
 * telemetry-cli.test.cjs — TRD 61-04 (OBS-02)
 *
 * `df-tools telemetry --scan` is documented (site/content/docs/guides/telemetry.md) but the
 * dispatcher's `telemetry` case never read its arguments: `--scan`, `--limit` and any typo were
 * dropped, and the session-audit half of `collect` (`sessionReport`) was unreachable. The command
 * now lives in audit-cli.cjs as `runTelemetry`, the same pure `{ok, result, text}` shape as
 * `runContext` and `runSessionAudit`.
 *
 * Fixtures are hand-built. Transcripts are written into a temp projects root with the
 * bash-replay builders, and every test passes `--root` (or a temp HOME), so nothing here reads
 * the real ~/.claude/projects.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { runTelemetry, DEFAULT_LIMIT } = require('./audit-cli.cjs');
const { collect } = require('./telemetry.cjs');
const { gateDenialRow, writeTranscriptTree } = require('./__fixtures__/bash-replay-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// The edit gate's real denial text. It classifies as `devflow-edit-gate`, a DevFlow-owned category.
const GATE_TEXT = 'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied. ' +
  'To proceed, invoke a DevFlow skill, or include "skip devflow" or "just edit" in your prompt.';

let tmp, project, projects, home, savedGuardEnv;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-cli-'));
  // A DevFlow project (has .planning/), a transcripts root with two sessions, and an empty HOME.
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.planning'), { recursive: true });
  projects = path.join(tmp, 'projects');
  writeTranscriptTree(projects, {
    project: 'proj',
    sessions: {
      s1: [gateDenialRow({ toolUseId: 't1', text: GATE_TEXT, ts: '2026-08-01T00:00:01Z' })],
      s2: [gateDenialRow({ toolUseId: 't2', text: GATE_TEXT, ts: '2026-08-02T00:00:01Z' })],
    },
  });
  home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  // collect() reads per-session guard files from here; never let it reach the real ~/.claude.
  savedGuardEnv = process.env.DEVFLOW_PROGRESS_GUARD_DIR;
  process.env.DEVFLOW_PROGRESS_GUARD_DIR = path.join(tmp, 'pg');
});

afterEach(() => {
  if (savedGuardEnv === undefined) delete process.env.DEVFLOW_PROGRESS_GUARD_DIR;
  else process.env.DEVFLOW_PROGRESS_GUARD_DIR = savedGuardEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Spawn the real binary, HOME-isolated, with `--cwd` (never a bare `cwd:`). */
function runCli(args, cwd) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', cwd, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, HOME: home, DEVFLOW_PROGRESS_GUARD_DIR: path.join(tmp, 'pg') },
  });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

describe('runTelemetry --scan', () => {
  test('1. --scan with --limit runs a session audit: blocks filled, scan echoed', () => {
    const r = runTelemetry({ argv: ['--scan', '--root', projects, '--limit', '5'], cwd: project, userHome: home });
    assert.equal(r.ok, true, r.message);
    assert.ok(r.result.blocks, 'blocks must be non-null');
    assert.ok(r.result.blocks.total >= 1, `expected >= 1 block; got ${JSON.stringify(r.result.blocks)}`);
    assert.deepEqual(r.result.scan, { root: projects, limit: 5, since: null, files_scanned: 2 });
  });

  test('2. --scan without --limit defaults to DEFAULT_LIMIT', () => {
    const r = runTelemetry({ argv: ['--scan', '--root', projects], cwd: project, userHome: home });
    assert.equal(r.ok, true, r.message);
    assert.equal(DEFAULT_LIMIT, 150);
    assert.equal(r.result.scan.limit, 150);
  });

  test('3. --limit 0 means every file; --limit 1 caps it', () => {
    const all = runTelemetry({ argv: ['--scan', '--root', projects, '--limit', '0'], cwd: project, userHome: home });
    assert.equal(all.ok, true, all.message);
    assert.equal(all.result.scan.limit, 0);
    assert.equal(all.result.scan.files_scanned, 2);

    const one = runTelemetry({ argv: ['--scan', '--root', projects, '--limit', '1'], cwd: project, userHome: home });
    assert.equal(one.ok, true, one.message);
    assert.equal(one.result.scan.files_scanned, 1);
  });

  test('3b. --since is echoed and filters events', () => {
    const r = runTelemetry({
      argv: ['--scan', '--root', projects, '--since', '2026-08-02'], cwd: project, userHome: home,
    });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.result.scan.since, '2026-08-02');
    assert.equal(r.result.blocks.total, 1, 'only the 2026-08-02 denial is inside the window');
  });

  test('3c. text leads with the scan line, then the advisories', () => {
    const r = runTelemetry({ argv: ['--scan', '--root', projects], cwd: project, userHome: home });
    assert.equal(r.ok, true, r.message);
    const lines = r.text.split('\n');
    assert.equal(lines[0], 'scan: 2 transcripts, 2 blocks (2 DevFlow-owned)');
    assert.deepEqual(lines.slice(1), r.result.advisories);
  });
});

describe('runTelemetry flag handling: nothing is silently ignored', () => {
  for (const argv of [['--limit', '5'], ['--root', '/somewhere'], ['--since', '2026-01-01']]) {
    test(`4. ${argv.join(' ')} without --scan is an error naming --scan`, () => {
      const r = runTelemetry({ argv, cwd: project, userHome: home });
      assert.equal(r.ok, false);
      assert.match(r.message, /--limit, --since and --root need --scan/);
    });
  }

  test('5. an unknown flag and a stray argument are errors', () => {
    assert.deepEqual(runTelemetry({ argv: ['--bogus'], cwd: project, userHome: home }),
      { ok: false, message: 'unknown flag: --bogus' });
    assert.deepEqual(runTelemetry({ argv: ['stray'], cwd: project, userHome: home }),
      { ok: false, message: 'unexpected argument: stray' });
  });

  test('5b. a typo of --scan is an error, not a plain run', () => {
    const r = runTelemetry({ argv: ['--scna'], cwd: project, userHome: home });
    assert.deepEqual(r, { ok: false, message: 'unknown flag: --scna' });
  });

  test('6. a missing transcript root is an error', () => {
    const r = runTelemetry({ argv: ['--scan', '--root', '/nonexistent/x'], cwd: project, userHome: home });
    assert.equal(r.ok, false);
    assert.match(r.message, /transcript root not found/);
  });

  test('7. --since must be an ISO date', () => {
    const r = runTelemetry({ argv: ['--scan', '--since', 'yesterday', '--root', projects], cwd: project, userHome: home });
    assert.equal(r.ok, false);
    assert.match(r.message, /--since must be an ISO date/);
  });

  test('7b. --limit must be a non-negative integer', () => {
    const r = runTelemetry({ argv: ['--scan', '--limit', 'abc', '--root', projects], cwd: project, userHome: home });
    assert.equal(r.ok, false);
    assert.match(r.message, /--limit must be a non-negative integer/);
  });
});

describe('runTelemetry without --scan', () => {
  test('8. no argv is exactly collect(): blocks null, no scan key', () => {
    const r = runTelemetry({ argv: [], cwd: project, userHome: home });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.result.blocks, null);
    assert.equal('scan' in r.result, false);
    const expected = collect({ planningDir: path.join(project, '.planning'), userHome: home });
    assert.deepEqual(r.result, expected);
    assert.equal(r.text, expected.advisories.join('\n'));
  });
});

describe('runTelemetry --scan outside a DevFlow project', () => {
  test('9. blocks still come from transcripts, and the advisory says it is not a project', () => {
    const bare = path.join(tmp, 'bare');
    fs.mkdirSync(bare);
    const r = runTelemetry({ argv: ['--scan', '--root', projects], cwd: bare, userHome: home });
    assert.equal(r.ok, true, r.message);
    assert.ok(r.result.blocks, 'blocks must be non-null without .planning/');
    assert.equal(r.result.blocks.total, 2);
    assert.ok(
      r.result.advisories.some((a) => /not a DevFlow project/.test(a)),
      `advisories: ${JSON.stringify(r.result.advisories)}`
    );
    assert.equal(r.result.overrides, null, 'the .planning/ sections stay null');
  });
});

describe('collect() with a report and no .planning/', () => {
  test('without a report the early return is unchanged', () => {
    const r = collect({ planningDir: null });
    assert.equal(r.blocks, null);
    assert.deepEqual(r.advisories, ['no .planning/ — not a DevFlow project']);
  });
});

describe('df-tools telemetry (CLI)', () => {
  test('10. --scan --root prints JSON carrying blocks and scan', () => {
    const r = runCli(['telemetry', '--scan', '--root', projects], project);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.ok(json.blocks && json.blocks.total >= 1, r.stdout);
    assert.equal(json.scan.root, projects);
    assert.equal(json.scan.files_scanned, 2);
  });

  test('10b. --scan --root --raw prints the scan line first', () => {
    const r = runCli(['telemetry', '--scan', '--root', projects, '--raw'], project);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout.split('\n')[0], /^scan: 2 transcripts, 2 blocks \(2 DevFlow-owned\)$/);
  });

  test('11. an unknown flag exits 1 and names it', () => {
    const r = runCli(['telemetry', '--bogus'], project);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown flag: --bogus/);
  });

  test('11b. --limit without --scan exits 1 and names --scan', () => {
    const r = runCli(['telemetry', '--limit', '5'], project);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--scan/);
  });

  test('12. plain telemetry exits 0 with blocks null (TRD 38-11 test 4 contract)', () => {
    const r = runCli(['telemetry'], project);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.equal(json.blocks, null);
    assert.ok(Array.isArray(json.advisories));
    assert.equal('scan' in json, false);
  });
});
