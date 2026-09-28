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
