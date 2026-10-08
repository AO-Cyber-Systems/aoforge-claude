'use strict';

/**
 * audit-cli.cjs — TRD 39-01
 *
 * Thin CLI front-end for `aof-tools context` and `aof-tools session-audit`,
 * wiring `lib/context-audit.cjs` (TRD 29-04) and `lib/session-audit.cjs`
 * (TRD 31-03) into the dispatcher for the first time. It also fronts
 * `aof-tools telemetry` (TRD 61-04): `--scan` feeds a session audit into
 * `lib/telemetry.cjs`, and any flag it does not understand is an error.
 *
 * `output()`/`error()` (lib/helpers.cjs) call `process.exit`, so logic that
 * needs those semantics can only be tested by spawning a child process. This
 * module keeps everything else pure: each `run*` returns `{ok, result, text}`
 * or `{ok:false, message}`, and the dispatcher's `case` block only maps that
 * onto `output`/`error`. Flag parsing, transcript-root resolution and `--raw`
 * formatting all live here so they are unit-testable in-process.
 *
 * `context-audit.cjs` and `transcript-export.cjs` both export a function
 * named `collect`/`analyze`-adjacent names; imports below stay namespaced
 * (`contextAudit.analyze`, `sessionAudit.analyze`) rather than destructured,
 * so a rename or collision elsewhere never shadows the wrong module here.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const contextAudit = require('./context-audit.cjs');
const sessionAudit = require('./session-audit.cjs');
const transcriptExport = require('./transcript-export.cjs');
const overrideLib = require('./override.cjs');
const telemetry = require('./telemetry.cjs');

/** `--limit` default for the scanning commands when the flag is omitted. */
const DEFAULT_LIMIT = 150;

/**
 * Default transcript root. Read at CALL time, never cached at module load —
 * HOME-isolated tests (and the CLI's own spawned HOME override) depend on
 * `os.homedir()` being re-evaluated on every invocation.
 */
function defaultTranscriptRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Parse `argv` against `{values, bools}`.
 *
 * Value flags consume the following token; a value flag with nothing after it
 * is an error. A purely-numeric value (`/^\d+$/`) is coerced to a `Number` —
 * `--limit 20` yields the number `20`, while non-numeric values (`--limit
 * abc`, `--since 2099-01-01`) stay strings for their own validators to
 * accept/reject. Unknown `--x` flags and stray positional tokens are both
 * errors, named in the message.
 *
 * @param {string[]} argv
 * @param {{values: string[], bools: string[]}} spec
 * @returns {{ok:true, [flag: string]: string|number|true} | {ok:false, message:string}}
 */
function parseAuditArgs(argv, spec) {
  const values = (spec && spec.values) || [];
  const bools = (spec && spec.bools) || [];
  const flags = { ok: true };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (typeof tok !== 'string' || !tok.startsWith('--')) {
      return { ok: false, message: `unexpected argument: ${tok}` };
    }
    if (values.includes(tok)) {
      const val = argv[i + 1];
      if (val === undefined) return { ok: false, message: `${tok} requires a value` };
      flags[tok.slice(2)] = /^\d+$/.test(val) ? Number(val) : val;
      i += 1;
    } else if (bools.includes(tok)) {
      flags[tok.slice(2)] = true;
    } else {
      return { ok: false, message: `unknown flag: ${tok}` };
    }
  }
  return flags;
}

/**
 * `flags.root` wins over the default. Existence is the only check — this is
 * a read-only command, so a missing root is the one way resolution can fail.
 */
function resolveRoot(flags) {
  const root = (flags && flags.root) || defaultTranscriptRoot();
  return fs.existsSync(root)
    ? { ok: true, root }
    : { ok: false, message: `transcript root not found: ${root}` };
}

function validateLimit(limit) {
  if (limit === undefined) return { ok: true };
  if (typeof limit === 'number' && Number.isInteger(limit) && limit >= 0) return { ok: true };
  return { ok: false, message: '--limit must be a non-negative integer' };
}

/** Exactly 5 lines, `\n`-joined. See TRD 39-01 for the fixed shape. */
function formatContextRaw(summary) {
  const c = summary.composition || {};
  const t = summary.targets || {};
  const side = (summary.context_per_turn && summary.context_per_turn.subagent) || {};
  const main = (summary.context_per_turn && summary.context_per_turn.main_thread) || {};
  const status = (t.read_share_pct || 0) < 40 ? 'ok' : 'OVER';
  return [
    `files_scanned: ${summary.files_scanned}`,
    `composition: tool_results ${c.tool_results_pct}%, tool_inputs ${c.tool_inputs_pct}%, assistant_text ${c.assistant_text_pct}%, images ${c.images_pct}%`,
    `read_share: ${t.read_share_pct}% of tool-result tokens (target < 40%: ${status})`,
    `context/turn subagent: p50 ${side.p50 || 0}, p90 ${side.p90 || 0}, over_200k ${side.over_200k_pct || 0}%`,
    `context/turn main_thread: p50 ${main.p50 || 0}, p90 ${main.p90 || 0}, over_200k ${main.over_200k_pct || 0}%`,
  ].join('\n');
}

/**
 * 2 fixed lines (TRD 39-01) + the edit_gate line (quick 31); the by-period and
 * sample lines appear only when denials > 0; the bash_edit_gate line (TRD 60-05)
 * is always last. `\n`-joined, so 4 lines with no denials. A summary without
 * `edit_gate_bypass` or `bash_edit_gate` is treated as zeros.
 */
function formatSessionAuditRaw(summary) {
  const g = summary.edit_gate_bypass || {};
  const n = k => Number(g[k]) || 0;
  const denials = n('denials');
  const lines = [
    `files_scanned: ${summary.files_scanned}, sessions: ${summary.sessions}, sessions_with_blocks: ${summary.sessions_with_blocks} (${summary.sessions_with_blocks_pct}%)`,
    `verdict: ${summary.verdict}`,
    `edit_gate: denials ${denials}, bypasses ${n('bypasses')}, routed ${n('routed')}, abandoned ${n('abandoned')}, bypass_rate ${n('bypass_rate')}`,
  ];
  if (denials > 0) {
    const byPeriod = g.by_period || {};
    const periods = Object.keys(byPeriod).sort();
    if (periods.length) {
      const cells = periods.map(p => {
        const x = byPeriod[p];
        return `${p} ${x.denials}/${x.bypasses}/${x.routed}/${x.abandoned}`;
      });
      lines.push(`edit_gate_by_period: ${cells.join(', ')} (denials/bypasses/routed/abandoned)`);
    }
    for (const s of Array.isArray(g.sample) ? g.sample : []) {
      lines.push(`edit_gate_bypass_sample: ${s.file} <- ${String(s.command).slice(0, 120)}`);
    }
  }
  const b = summary.bash_edit_gate || {};
  const bn = k => Number(b[k]) || 0;
  const rate = typeof b.false_positive_rate === 'number' ? b.false_positive_rate : 'n/a';
  const threshold = typeof b.threshold === 'number' ? b.threshold : 0.02;
  const mode = b.recommended_default || 'warn';
  lines.push(
    `bash_edit_gate: ambient_bash_calls ${bn('ambient_bash_calls')}, would_deny ${bn('would_deny')}, `
    + `false_positive_rate ${rate} (upper bound), threshold ${threshold}, recommended_default ${mode}`
  );
  return lines.join('\n');
}

/**
 * `aof-tools context` — context-window composition from session transcripts.
 * @param {{argv?: string[]}} [opts]
 * @returns {{ok:true, result:object, text:string} | {ok:false, message:string}}
 */
function runContext({ argv = [] } = {}) {
  const parsed = parseAuditArgs(argv, { values: ['--limit', '--root'], bools: [] });
  if (!parsed.ok) return parsed;
  const limitCheck = validateLimit(parsed.limit);
  if (!limitCheck.ok) return limitCheck;
  const rootResult = resolveRoot(parsed);
  if (!rootResult.ok) return rootResult;
  const limit = parsed.limit === undefined ? DEFAULT_LIMIT : parsed.limit;
  const result = contextAudit.analyze([rootResult.root], { limit: limit || undefined });
  return { ok: true, result, text: formatContextRaw(result) };
}

/**
 * `aof-tools session-audit` — classify blocking events in session transcripts.
 * @param {{argv?: string[]}} [opts]
 * @returns {{ok:true, result:object, text:string} | {ok:false, message:string}}
 */
function runSessionAudit({ argv = [] } = {}) {
  const parsed = parseAuditArgs(argv, { values: ['--limit', '--root', '--since'], bools: [] });
  if (!parsed.ok) return parsed;
  const limitCheck = validateLimit(parsed.limit);
  if (!limitCheck.ok) return limitCheck;
  if (parsed.since !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(String(parsed.since))) {
    return { ok: false, message: '--since must be an ISO date (YYYY-MM-DD)' };
  }
  const rootResult = resolveRoot(parsed);
  if (!rootResult.ok) return rootResult;
  const limit = parsed.limit === undefined ? DEFAULT_LIMIT : parsed.limit;
  const result = sessionAudit.analyze([rootResult.root], {
    limit: limit || undefined,
    since: parsed.since,
  });
  return { ok: true, result, text: formatSessionAuditRaw(result) };
}

/**
 * `aof-tools telemetry` — the read-only project view (overrides, stuck-loop state, documentation
 * staleness) and, with `--scan`, a session audit of blocking events folded into it.
 *
 * Every token is either understood or an error, never dropped: `--limit`, `--since` and `--root`
 * only mean something to the scan, so they are rejected without it. Without `--scan` this is
 * exactly `collect({planningDir, userHome})`: `blocks` stays null, there is no `scan` key and no
 * transcript is read, so a status view that calls plain `telemetry` stays fast.
 *
 * `--scan` reads transcripts, not `.planning/`, so it still reports blocks outside an AOForge
 * project (`collect` handles the null `planningDir`).
 *
 * @param {{argv?: string[], cwd: string, userHome?: string}} opts
 * @returns {{ok:true, result:object, text:string} | {ok:false, message:string}}
 */
function runTelemetry({ argv = [], cwd, userHome = os.homedir() }) {
  const parsed = parseAuditArgs(argv, { values: ['--limit', '--root', '--since'], bools: ['--scan'] });
  if (!parsed.ok) return parsed;
  if (!parsed.scan && (parsed.limit !== undefined || parsed.root !== undefined || parsed.since !== undefined)) {
    return { ok: false, message: '--limit, --since and --root need --scan' };
  }

  const planningDir = fs.existsSync(path.join(cwd, '.planning')) ? path.join(cwd, '.planning') : null;

  if (!parsed.scan) {
    const result = telemetry.collect({ planningDir, userHome });
    return { ok: true, result, text: result.advisories.join('\n') };
  }

  const limitCheck = validateLimit(parsed.limit);
  if (!limitCheck.ok) return limitCheck;
  if (parsed.since !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(String(parsed.since))) {
    return { ok: false, message: '--since must be an ISO date (YYYY-MM-DD)' };
  }
  const rootResult = resolveRoot(parsed);
  if (!rootResult.ok) return rootResult;
  const limit = parsed.limit === undefined ? DEFAULT_LIMIT : parsed.limit;
  const since = parsed.since === undefined ? null : String(parsed.since);

  const report = sessionAudit.analyze([rootResult.root], { limit: limit || undefined, since: since || undefined });
  const result = telemetry.collect({ planningDir, sessionReport: report, userHome });
  result.scan = { root: rootResult.root, limit, since, files_scanned: report.files_scanned };
  const scanLine =
    `scan: ${report.files_scanned} transcripts, ${report.total_events} blocks ` +
    `(${report.aoforge_owned_events} AOForge-owned)`;
  return { ok: true, result, text: [scanLine, ...result.advisories].join('\n') };
}

/**
 * Default `transcript-export` index path. Read at CALL time (same reasoning
 * as `defaultTranscriptRoot`) — HOME-isolated tests depend on it.
 */
function defaultIndexPath() {
  return path.join(os.homedir(), '.claude', 'aoforge', 'transcript-index.jsonl');
}

/** Exactly one line: `indexed N, skipped N, copied N of N sessions -> <out>`. */
function formatExportRaw(result) {
  return `indexed ${result.indexed}, skipped ${result.skipped}, copied ${result.copied} of ${result.sessions} sessions -> ${result.out}`;
}

/**
 * `aof-tools transcript-export` — append a compact per-session index of
 * transcripts (and, with `--full`, copy the raw files too).
 *
 * Root resolution runs BEFORE `exportTranscripts` is ever called:
 * `exportTranscripts` unconditionally `mkdirSync(dirname(out))`s before it
 * scans, so calling it against a missing root would create a stray
 * `~/.claude/aoforge/` even on failure.
 *
 * @param {{argv?: string[]}} [opts]
 * @returns {{ok:true, result:object, text:string} | {ok:false, message:string}}
 */
function runTranscriptExport({ argv = [] } = {}) {
  const parsed = parseAuditArgs(argv, { values: ['--out', '--full', '--limit', '--root'], bools: [] });
  if (!parsed.ok) return parsed;
  const limitCheck = validateLimit(parsed.limit);
  if (!limitCheck.ok) return limitCheck;
  const rootResult = resolveRoot(parsed);
  if (!rootResult.ok) return rootResult;
  const out = parsed.out || defaultIndexPath();
  const result = transcriptExport.exportTranscripts({
    roots: [rootResult.root],
    out,
    fullDir: parsed.full,
    limit: parsed.limit || undefined,
  });
  return { ok: true, result, text: formatExportRaw(result) };
}

/** Usage string reused both for the no-mode CLI error and help.cjs. */
const OVERRIDE_USAGE = 'aof-tools override --gate <edits|commits|changelog> --reason "<why>" | --list [--limit N] [--raw]';

/**
 * Exactly one `<at>  <gate>  <reason>` line per entry (newest first, already
 * ordered by `readOverrides`), then any needs-rescoping lines, or a single
 * `no overrides recorded` line when the log is empty.
 */
function formatOverrideRaw(result) {
  const entries = (result && result.entries) || [];
  if (entries.length === 0) return 'no overrides recorded';
  const lines = entries.map(e => `${e.at}  ${e.gate}  ${e.reason}`);
  const rescoping = (result && result.needs_rescoping) || [];
  for (const r of rescoping) lines.push(`needs rescoping: ${r.gate} (${r.overrides} overrides)`);
  return lines.join('\n');
}

/**
 * `aof-tools override` — record a structured, logged gate override
 * (`--gate <g> --reason <why>`), or list recent overrides (`--list`).
 *
 * `planningDir` resolves the same way `telemetry`'s case block does: a plain
 * existence check against `<cwd>/.planning`, with the `null` case handed to
 * `recordOverride`, which owns the "No .planning/ directory found" message.
 * `--list` against a missing `.planning/` is not an error — `readOverrides`
 * returns an empty result and the CLI exits 0.
 *
 * @param {{argv?: string[], cwd: string}} opts
 * @returns {{ok:true, result:object, text:string} | {ok:false, message:string}}
 */
function runOverride({ argv = [], cwd }) {
  const parsed = parseAuditArgs(argv, { values: ['--gate', '--reason', '--limit'], bools: ['--list'] });
  if (!parsed.ok) return parsed;

  const planningDir = fs.existsSync(path.join(cwd, '.planning')) ? path.join(cwd, '.planning') : null;

  if (parsed.list) {
    if (parsed.gate !== undefined || parsed.reason !== undefined) {
      return { ok: false, message: '--list cannot be combined with --gate/--reason' };
    }
    const result = overrideLib.readOverrides({ planningDir, limit: parsed.limit });
    return { ok: true, result, text: formatOverrideRaw(result) };
  }

  if (parsed.gate === undefined) {
    return { ok: false, message: OVERRIDE_USAGE };
  }

  const result = overrideLib.recordOverride({ planningDir, gate: parsed.gate, reason: parsed.reason });
  if (!result.ok) return { ok: false, message: result.message };
  overrideLib.pruneLog(planningDir);
  return {
    ok: true,
    result,
    text: result.marker
      ? `recorded: ${result.gate} — ${result.reason} (marker armed: ${result.marker})`
      : `recorded: ${result.gate} — ${result.reason}`,
  };
}

module.exports = {
  parseAuditArgs,
  defaultTranscriptRoot,
  resolveRoot,
  runContext,
  runSessionAudit,
  runTelemetry,
  formatContextRaw,
  formatSessionAuditRaw,
  DEFAULT_LIMIT,
  defaultIndexPath,
  runTranscriptExport,
  formatExportRaw,
  runOverride,
  formatOverrideRaw,
};
