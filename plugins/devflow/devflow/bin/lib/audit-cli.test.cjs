'use strict';

/**
 * audit-cli.test.cjs — TRD 39-01
 *
 * `lib/context-audit.cjs` (TRD 29-04) and `lib/session-audit.cjs` (TRD 31-03)
 * were implemented and unit-tested but unreachable from the dispatcher — this
 * module is their CLI front-end. `output()`/`error()` in lib/helpers.cjs call
 * `process.exit`, so the parsing/formatting logic lives here as pure `run*`
 * functions instead of inline in the dispatcher's `case` blocks, which makes
 * it testable in-process. The CLI-spawn tests (added in Task 2) then exercise
 * the whole path including the dispatcher wiring.
 *
 * All fixture transcript rows are hand-built (fixture_strategy: generators —
 * no LLM-generated or property-based test data), and every row carries an
 * explicit `timestamp`: session-audit's `--since` filter is a no-op on a row
 * with no timestamp (`opts.since && row.timestamp && ...`), so a fixture with
 * missing timestamps would silently defeat the since-filter tests.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

/** Spawn the real binary, HOME-isolated (TRD 39-01 error_recovery: HOME must
 * reach the child via `env`, and `--cwd` must be used — never a bare `cwd:`). */
function runCli(args, cwd, home) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', cwd, ...args], {
    encoding: 'utf-8', timeout: 30000, env: { ...process.env, HOME: home },
  });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// ─── Fixture builders ──────────────────────────────────────────────────────

function makeFixtureHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-home-'));
}

function writeTranscript(home, project, session, rows) {
  const dir = path.join(home, '.claude', 'projects', project);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${session}.jsonl`);
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return file;
}

function toolUse(id, name, input, extra = {}) {
  return {
    type: 'assistant',
    timestamp: extra.timestamp || '2026-08-01T00:00:00Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: input || {} }] },
  };
}

function toolResult(id, text, opts = {}) {
  return {
    type: 'user',
    timestamp: opts.timestamp || '2026-08-01T00:00:01Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: opts.isError === true }],
    },
  };
}

const {
  parseAuditArgs, defaultTranscriptRoot, runContext, formatContextRaw,
} = require('./audit-cli.cjs');

// ─── Unit tests (in-process, no spawn) — tests 12-15 ───────────────────────

describe('parseAuditArgs()', () => {
  const spec = { values: ['--limit', '--root', '--since'], bools: [] };

  test('12a. parses value flags, coercing purely-numeric values', () => {
    assert.deepEqual(
      parseAuditArgs(['--limit', '20', '--root', '/x'], spec),
      { ok: true, limit: 20, root: '/x' }
    );
  });

  test('12b. a value-flag with nothing following it is an error', () => {
    assert.deepEqual(
      parseAuditArgs(['--root'], spec),
      { ok: false, message: '--root requires a value' }
    );
  });

  test('an unknown flag is rejected by name', () => {
    assert.deepEqual(
      parseAuditArgs(['--bogus'], spec),
      { ok: false, message: 'unknown flag: --bogus' }
    );
  });

  test('a stray positional token is rejected by name', () => {
    assert.deepEqual(
      parseAuditArgs(['nope'], spec),
      { ok: false, message: 'unexpected argument: nope' }
    );
  });
});

describe('defaultTranscriptRoot()', () => {
  test('13. reads os.homedir() at call time, not at module load', () => {
    const originalHome = process.env.HOME;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-fakehome-'));
    try {
      process.env.HOME = tmp;
      assert.equal(defaultTranscriptRoot(), path.join(tmp, '.claude', 'projects'));
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

describe('formatContextRaw()', () => {
  test('14. line 3 renders read_share with the ok/OVER status', () => {
    const summary = {
      files_scanned: 1,
      composition: { tool_results_pct: 50, tool_inputs_pct: 30, assistant_text_pct: 15, images_pct: 5 },
      targets: { read_share_pct: 24.6, read_share_target: 40, read_share_ok: true },
      context_per_turn: {
        subagent: { p50: 0, p90: 0, over_200k_pct: 0 },
        main_thread: { p50: 0, p90: 0, over_200k_pct: 0 },
      },
    };
    const lines = formatContextRaw(summary).split('\n');
    assert.equal(lines[2], 'read_share: 24.6% of tool-result tokens (target < 40%: ok)');
  });
});

describe('runContext() — root resolution', () => {
  test('15. a nonexistent --root fails without creating anything on disk', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-noroot-'));
    const nonexistent = path.join(parent, 'does-not-exist');
    const before = fs.readdirSync(parent);
    const r = runContext({ argv: ['--root', nonexistent] });
    assert.deepEqual(r, { ok: false, message: `transcript root not found: ${nonexistent}` });
    assert.deepEqual(fs.readdirSync(parent), before, 'nothing written to disk');
  });
});

// ─── df-tools context / session-audit (CLI) — TRD 39-01 tests 1-11 ─────────
//
// Wires context-audit.cjs and session-audit.cjs into the dispatcher:
// `df-tools context [--limit N] [--root <dir>] [--raw]` and
// `df-tools session-audit [--since YYYY-MM-DD] [--limit N] [--root <dir>] [--raw]`,
// previously unreachable (`Error: Unknown command: context` / `session-audit`).
describe('df-tools context / session-audit (CLI) — TRD 39-01', () => {
  function tmpCwd() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-cwd-'));
  }

  function cleanup(...dirs) {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }

  test('1. context: exit 0, files_scanned 1, read_share dominated by Read', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolUse('r', 'Read', { file_path: '/x' }),
        toolResult('r', 'x'.repeat(8000)),
        toolUse('b', 'Bash', { command: 'ls' }),
        toolResult('b', 'y'.repeat(400)),
      ]);
      const r = runCli(['context'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.files_scanned, 1);
      assert.equal(json.targets.read_share_ok, false);
      assert.ok(json.targets.read_share_pct > 90, `expected > 90, got ${json.targets.read_share_pct}`);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('2. context --raw: exactly 5 lines', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolUse('r', 'Read', { file_path: '/x' }),
        toolResult('r', 'x'.repeat(8000)),
        toolUse('b', 'Bash', { command: 'ls' }),
        toolResult('b', 'y'.repeat(400)),
      ]);
      const r = runCli(['context', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const lines = r.stdout.split('\n');
      assert.equal(lines.length, 5, `expected 5 lines, got: ${JSON.stringify(lines)}`);
      assert.equal(lines[0], 'files_scanned: 1');
      assert.match(lines[2], /^read_share: /);
      assert.match(lines[2], /\(target < 40%: OVER\)$/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('3. context against an empty HOME (no .claude/projects) fails', () => {
    const cwd = tmpCwd();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-emptyhome-'));
    try {
      const r = runCli(['context'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /transcript root not found: .*\.claude[\/\\]projects/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('4. context --root <dir> scans that dir, ignoring HOME', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    writeTranscript(home, 'proj-a', 'sess-1', [toolResult('x', 'from-home')]);
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-root-'));
    fs.mkdirSync(path.join(rootDir, 'proj-b'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'proj-b', 'sess-a.jsonl'), JSON.stringify(toolResult('a', 'from-root')) + '\n');
    fs.writeFileSync(path.join(rootDir, 'proj-b', 'sess-b.jsonl'), JSON.stringify(toolResult('b', 'from-root')) + '\n');
    try {
      const r = runCli(['context', '--root', rootDir], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.files_scanned, 2, 'must scan --root, not the 1-file HOME default');
    } finally {
      cleanup(cwd, home, rootDir);
    }
  });

  test('5. context --limit abc fails with a specific message', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      const r = runCli(['context', '--limit', 'abc'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--limit must be a non-negative integer/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('6. context --bogus fails naming the unknown flag', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      const r = runCli(['context', '--bogus'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /unknown flag: --bogus/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('7. session-audit: exit 0, sessions 1, verdict is a string', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolResult('x', 'boom: something failed', { isError: true }),
      ]);
      const r = runCli(['session-audit'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.sessions, 1);
      assert.equal(typeof json.verdict, 'string');
    } finally {
      cleanup(cwd, home);
    }
  });

  test('8. session-audit --since 2099-01-01 excludes every (predating) row', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolResult('x', 'boom: something failed', { isError: true }),
      ]);
      const r = runCli(['session-audit', '--since', '2099-01-01'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.total_events, 0);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('9. session-audit --since yesterday fails validation', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      const r = runCli(['session-audit', '--since', 'yesterday'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--since must be an ISO date \(YYYY-MM-DD\)/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('10. session-audit --raw: exactly 2 lines', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolResult('x', 'boom: something failed', { isError: true }),
      ]);
      const r = runCli(['session-audit', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const lines = r.stdout.split('\n');
      assert.equal(lines.length, 2, `expected 2 lines, got: ${JSON.stringify(lines)}`);
      assert.match(lines[0], /^files_scanned: \d+, sessions: \d+, sessions_with_blocks: \d+ \(\d+(\.\d+)?%\)$/);
      assert.match(lines[1], /^verdict: /);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('11. --help on both commands prints their own usage line', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      const ctxHelp = runCli(['context', '--help'], cwd, home);
      assert.equal(ctxHelp.status, 0, `stderr: ${ctxHelp.stderr}`);
      assert.match(ctxHelp.stdout, /df-tools context/);

      const saHelp = runCli(['session-audit', '--help'], cwd, home);
      assert.equal(saHelp.status, 0, `stderr: ${saHelp.stderr}`);
      assert.match(saHelp.stdout, /df-tools session-audit/);
    } finally {
      cleanup(cwd, home);
    }
  });
});
