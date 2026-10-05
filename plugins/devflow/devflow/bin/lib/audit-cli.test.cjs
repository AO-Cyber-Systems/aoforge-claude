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

// The edit gate's real message shape (quick 31). It contains the override
// phrases, which must never route a denial; only user prompts count.
const GATE_TEXT = 'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied. ' +
  'To proceed, invoke a DevFlow skill, or include "skip devflow" or "just edit" in your prompt.';

/** Write a.go -> gate denial -> Bash heredoc write of the same file (a bypass). */
function bypassRows() {
  return [
    toolUse('e1', 'Write', { file_path: '/repo/src/a.go', content: 'x' }),
    toolResult('e1', GATE_TEXT, { isError: true }),
    toolUse('b1', 'Bash', { command: "cat > /repo/src/a.go <<'EOF'\nx\nEOF" }, { timestamp: '2026-08-01T00:00:02Z' }),
  ];
}

const {
  parseAuditArgs, defaultTranscriptRoot, runContext, formatContextRaw,
  defaultIndexPath, runOverride,
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

  test('10. session-audit --raw: exactly 3 lines', () => {
    // C-2: lines 1-2 are unchanged from TRD 39-01; quick 31 adds the edit_gate line.
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [
        toolResult('x', 'boom: something failed', { isError: true }),
      ]);
      const r = runCli(['session-audit', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const lines = r.stdout.split('\n');
      assert.equal(lines.length, 3, `expected 3 lines, got: ${JSON.stringify(lines)}`);
      assert.match(lines[0], /^files_scanned: \d+, sessions: \d+, sessions_with_blocks: \d+ \(\d+(\.\d+)?%\)$/);
      assert.match(lines[1], /^verdict: /);
      assert.match(lines[2], /^edit_gate: denials 0, bypasses 0, routed 0, abandoned 0, bypass_rate 0$/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('C-1. session-audit JSON carries edit_gate_bypass for a denial followed by a Bash write', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', bypassRows());
      const r = runCli(['session-audit'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      const g = json.edit_gate_bypass;
      assert.ok(g, 'edit_gate_bypass is present');
      assert.deepEqual(
        { denials: g.denials, bypasses: g.bypasses, routed: g.routed, abandoned: g.abandoned, bypass_rate: g.bypass_rate },
        { denials: 1, bypasses: 1, routed: 0, abandoned: 0, bypass_rate: 1 }
      );
      assert.equal(g.sample[0].file, 'a.go');
      assert.equal(json.by_category['devflow-edit-gate'], 1);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('C-3. session-audit --raw with a bypass: 5 lines (edit_gate, by_period, sample)', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', bypassRows());
      const r = runCli(['session-audit', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const lines = r.stdout.split('\n');
      assert.equal(lines.length, 5, `expected 5 lines, got: ${JSON.stringify(lines)}`);
      assert.equal(lines[2], 'edit_gate: denials 1, bypasses 1, routed 0, abandoned 0, bypass_rate 1');
      assert.equal(lines[3], 'edit_gate_by_period: 2026-08 1/1/0/0 (denials/bypasses/routed/abandoned)');
      assert.ok(lines[4].startsWith('edit_gate_bypass_sample: a.go <- cat > /repo/src/a.go'), lines[4]);
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

// ─── df-tools transcript-export (CLI) — TRD 39-02 tests 1-5, 16 (half), 17 ─
describe('df-tools transcript-export (CLI) — TRD 39-02', () => {
  function tmpCwd() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-cwd-'));
  }

  function cleanup(...dirs) {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }

  test('1. no flags: exit 0, {indexed:2, skipped:0, copied:0, sessions:2}, index has 2 lines', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [toolResult('a', 'ok')]);
      writeTranscript(home, 'proj-a', 'sess-2', [toolResult('b', 'ok')]);
      const r = runCli(['transcript-export'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.indexed, 2);
      assert.equal(json.skipped, 0);
      assert.equal(json.copied, 0);
      assert.equal(json.sessions, 2);
      const indexPath = path.join(home, '.claude', 'devflow', 'transcript-index.jsonl');
      const lines = fs.readFileSync(indexPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('2. a re-run is incremental: {indexed:0, skipped:2}, index still has 2 lines', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [toolResult('a', 'ok')]);
      writeTranscript(home, 'proj-a', 'sess-2', [toolResult('b', 'ok')]);
      runCli(['transcript-export'], cwd, home);
      const r = runCli(['transcript-export'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.indexed, 0);
      assert.equal(json.skipped, 2);
      const indexPath = path.join(home, '.claude', 'devflow', 'transcript-index.jsonl');
      const lines = fs.readFileSync(indexPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('3. --out and --full write to custom paths, copied === 2', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-export-'));
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [toolResult('a', 'ok')]);
      writeTranscript(home, 'proj-a', 'sess-2', [toolResult('b', 'ok')]);
      const outFile = path.join(tmp, 'idx.jsonl');
      const rawDir = path.join(tmp, 'raw');
      const r = runCli(['transcript-export', '--out', outFile, '--full', rawDir], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.copied, 2);
      assert.ok(fs.existsSync(outFile), 'custom --out index must exist');
      const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl'));
      assert.equal(rawFiles.length, 2);
    } finally {
      cleanup(cwd, home, tmp);
    }
  });

  test('4. --raw prints exactly one summary line', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      writeTranscript(home, 'proj-a', 'sess-1', [toolResult('a', 'ok')]);
      writeTranscript(home, 'proj-a', 'sess-2', [toolResult('b', 'ok')]);
      const r = runCli(['transcript-export', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const indexPath = path.join(home, '.claude', 'devflow', 'transcript-index.jsonl');
      assert.equal(r.stdout, `indexed 2, skipped 0, copied 0 of 2 sessions -> ${indexPath}`);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('5. an empty HOME fails without creating ~/.claude/devflow/', () => {
    const cwd = tmpCwd();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-emptyhome-'));
    try {
      const r = runCli(['transcript-export'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /transcript root not found/);
      assert.equal(fs.existsSync(path.join(home, '.claude', 'devflow')), false, 'no stray devflow dir');
    } finally {
      cleanup(cwd, home);
    }
  });

  test('16a. --help is side-effect free (no files in cwd or HOME)', () => {
    const cwd = tmpCwd();
    const home = makeFixtureHome();
    try {
      const before = fs.readdirSync(cwd);
      const r = runCli(['transcript-export', '--help'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /df-tools transcript-export/);
      assert.deepEqual(fs.readdirSync(cwd), before);
      assert.equal(fs.existsSync(path.join(home, '.claude', 'devflow')), false);
    } finally {
      cleanup(cwd, home);
    }
  });
});

describe('defaultIndexPath()', () => {
  test('17. reads HOME at call time, not at module load', () => {
    const originalHome = process.env.HOME;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-fakehome2-'));
    try {
      process.env.HOME = tmp;
      assert.equal(defaultIndexPath(), path.join(tmp, '.claude', 'devflow', 'transcript-index.jsonl'));
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

// ─── df-tools override (CLI) — TRD 39-02 tests 6-15, 16 (half) ─────────────
describe('df-tools override (CLI) — TRD 39-02', () => {
  function tmpProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-project-'));
    fs.mkdirSync(path.join(dir, '.planning'));
    return dir;
  }

  function tmpHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-ovhome-'));
  }

  function cleanup(...dirs) {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }

  test('6. record edits gate: exit 0, ok:true, gate:edits, log + marker written', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--gate', 'edits', '--reason', 'hand-fixing generated file'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.ok, true);
      assert.equal(json.gate, 'edits');
      const log = fs.readFileSync(path.join(cwd, '.planning', '.override-log.jsonl'), 'utf8').trim().split('\n');
      assert.equal(log.length, 1);
      assert.ok(fs.existsSync(path.join(cwd, '.planning', '.edit-override')));
    } finally {
      cleanup(cwd, home);
    }
  });

  test('7. record commits gate: marker is null, no marker file written', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--gate', 'commits', '--reason', 'x'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const json = JSON.parse(r.stdout);
      assert.equal(json.marker, null);
      assert.equal(fs.existsSync(path.join(cwd, '.planning', '.edit-override')), false);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('8. an unknown gate is rejected by name, listing the known gates', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--gate', 'gate-edits', '--reason', 'x'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Unknown gate "gate-edits"/);
      assert.match(r.stderr, /edits, commits, changelog/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('9. a missing or blank reason is rejected', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const noReason = runCli(['override', '--gate', 'edits'], cwd, home);
      assert.equal(noReason.status, 1);
      assert.match(noReason.stderr, /A reason is required/);

      const blankReason = runCli(['override', '--gate', 'edits', '--reason', '   '], cwd, home);
      assert.equal(blankReason.status, 1);
      assert.match(blankReason.stderr, /A reason is required/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('10. no .planning/ directory fails', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-noplanning-'));
    const home = tmpHome();
    try {
      const r = runCli(['override', '--gate', 'edits', '--reason', 'x'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /No \.planning\/ directory found/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('11. no flags at all prints usage naming df-tools override --gate', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /df-tools override --gate/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('12. --list combined with --gate is rejected', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--list', '--gate', 'edits'], cwd, home);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--list cannot be combined with --gate\/--reason/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('13. --list is newest-first, respects --limit, --raw prints one line per entry', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      runCli(['override', '--gate', 'edits', '--reason', 'first'], cwd, home);
      runCli(['override', '--gate', 'commits', '--reason', 'second'], cwd, home);

      const listAll = runCli(['override', '--list'], cwd, home);
      assert.equal(listAll.status, 0, `stderr: ${listAll.stderr}`);
      const jsonAll = JSON.parse(listAll.stdout);
      assert.equal(jsonAll.total, 2);
      assert.equal(jsonAll.entries[0].reason, 'second');
      assert.equal(jsonAll.entries[1].reason, 'first');

      const listOne = runCli(['override', '--list', '--limit', '1'], cwd, home);
      const jsonOne = JSON.parse(listOne.stdout);
      assert.equal(jsonOne.entries.length, 1);

      const listRaw = runCli(['override', '--list', '--raw'], cwd, home);
      const lines = listRaw.stdout.split('\n');
      assert.equal(lines.length, 2);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('14. 5 overrides on one gate trigger a needs-rescoping line', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      for (let i = 0; i < 5; i++) {
        runCli(['override', '--gate', 'edits', '--reason', `reason-${i}`], cwd, home);
      }
      const r = runCli(['override', '--list', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /needs rescoping: edits \(5 overrides\)/);
    } finally {
      cleanup(cwd, home);
    }
  });

  test('15. an empty log reports no overrides recorded', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--list', '--raw'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.stdout, 'no overrides recorded');
    } finally {
      cleanup(cwd, home);
    }
  });

  test('16b. --help is side-effect free (no log file created)', () => {
    const cwd = tmpProject();
    const home = tmpHome();
    try {
      const r = runCli(['override', '--help'], cwd, home);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /df-tools override/);
      assert.equal(fs.existsSync(path.join(cwd, '.planning', '.override-log.jsonl')), false);
    } finally {
      cleanup(cwd, home);
    }
  });
});

// ─── runOverride() — pruneLog on success (unit) — TRD 39-02 test 18 ────────
describe('runOverride() — pruneLog on success', () => {
  test('18. a successful record prunes the log to MAX_ENTRIES (500) lines', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'df-audit-prune-'));
    const planningDir = path.join(cwd, '.planning');
    fs.mkdirSync(planningDir);
    try {
      const lines = [];
      for (let i = 0; i < 501; i++) {
        lines.push(JSON.stringify({
          gate: 'edits',
          reason: `seed-${i}`,
          at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
        }));
      }
      fs.writeFileSync(path.join(planningDir, '.override-log.jsonl'), lines.join('\n') + '\n', 'utf8');

      const r = runOverride({ argv: ['--gate', 'edits', '--reason', 'the 502nd'], cwd });
      assert.equal(r.ok, true, JSON.stringify(r));

      const raw = fs.readFileSync(path.join(planningDir, '.override-log.jsonl'), 'utf8');
      const kept = raw.split('\n').filter(l => l.trim());
      assert.equal(kept.length, 500);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
