'use strict';

/**
 * audit-cli.cjs — TRD 39-01
 *
 * Thin CLI front-end for `df-tools context` and `df-tools session-audit`,
 * wiring `lib/context-audit.cjs` (TRD 29-04) and `lib/session-audit.cjs`
 * (TRD 31-03) into the dispatcher for the first time.
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

/** `--limit` default for both commands when the flag is omitted. */
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

/** Exactly 2 lines, `\n`-joined. See TRD 39-01 for the fixed shape. */
function formatSessionAuditRaw(summary) {
  return [
    `files_scanned: ${summary.files_scanned}, sessions: ${summary.sessions}, sessions_with_blocks: ${summary.sessions_with_blocks} (${summary.sessions_with_blocks_pct}%)`,
    `verdict: ${summary.verdict}`,
  ].join('\n');
}

/**
 * `df-tools context` — context-window composition from session transcripts.
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
 * `df-tools session-audit` — classify blocking events in session transcripts.
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

module.exports = {
  parseAuditArgs,
  defaultTranscriptRoot,
  resolveRoot,
  runContext,
  runSessionAudit,
  formatContextRaw,
  formatSessionAuditRaw,
  DEFAULT_LIMIT,
};
