'use strict';

/**
 * agent-overhead.cjs (TRD 58-02, EST-03) — what the NON-executor DevFlow agents cost, measured from Claude Code
 * subagent transcripts.
 *
 * Executor overhead is already inside the per-task calibration values, so an objective estimate adds the rest: the
 * planner, the plan checker (job-checker), the verifier, the researcher, the integration checker and the roadmapper.
 * One subagent transcript is one spawn. A spawn becomes one sample: wall minutes (first to last record timestamp),
 * tokens (each API message counted once, token-usage.sumUsage) and the per-model split calibrator.cjs needs to price it.
 *
 * Pricing stays in calibrator.cjs: this module must not require it (the calibrator requires this one).
 * Transcripts are found under a projects root the caller passes in. No default root: resolving `~/.claude/projects`
 * is the CLI's job, so a test can never reach the real one by accident.
 */

const { forEachRecord } = require('./context-audit.cjs');
const { sumUsage } = require('./token-usage.cjs');

/** The six non-executor agents whose spawns count as objective overhead. The debugger is ad hoc work, not overhead. */
const OVERHEAD_AGENTS = Object.freeze([
  'integration-checker', 'job-checker', 'objective-researcher', 'planner', 'roadmapper', 'verifier',
]);

const AGENT_PREFIX_RE = /^(?:devflow:|df-)/;

/**
 * `devflow:planner` / `df-planner` → `planner`. Only a DevFlow-prefixed name that is one of OVERHEAD_AGENTS counts;
 * executors, debuggers, general-purpose and every other agent are null.
 *
 * @param {*} agentType  meta.json `agentType`
 * @returns {string|null}
 */
function normalizeAgentType(agentType) {
  if (typeof agentType !== 'string' || !AGENT_PREFIX_RE.test(agentType)) return null;
  const name = agentType.replace(AGENT_PREFIX_RE, '');
  return OVERHEAD_AGENTS.includes(name) ? name : null;
}

const QUICK_RE = /^\s*quick\b/i;

/** True for a spawn whose meta.json description starts with `Quick` (`Quick plan: fix X`). */
function isQuickSpawn(meta) {
  return !!meta && typeof meta.description === 'string' && QUICK_RE.test(meta.description);
}

/**
 * Wall minutes of one transcript: the first to the last record timestamp. Records whose timestamp is not a parseable
 * string are skipped; fewer than two usable timestamps (or an unreadable file) is null.
 *
 * A resumed agent keeps one transcript, so its span includes any idle gap. That is recorded wall time and is kept.
 * Timestamps are parsed from the data, never read from the clock.
 *
 * @param {string} file  a transcript .jsonl path
 * @returns {number|null}
 */
function transcriptSpanMinutes(file) {
  let min = Infinity;
  let max = -Infinity;
  let seen = 0;
  forEachRecord(file, (row) => {
    if (!row || typeof row !== 'object' || typeof row.timestamp !== 'string') return;
    const t = Date.parse(row.timestamp);
    if (!Number.isFinite(t)) return;
    seen++;
    if (t < min) min = t;
    if (t > max) max = t;
  });
  return seen < 2 ? null : (max - min) / 60000;
}

/** The pricing shape of one usage block: `tokens_input` is fresh input plus both cache counts (SUMMARY convention). */
function tokenShare(u) {
  return {
    tokens_input: u.input + u.cache_creation + u.cache_read,
    tokens_output: u.output,
    tokens_cache_read: u.cache_read,
    tokens_cache_write: u.cache_creation,
  };
}

/**
 * One spawn's measurements. `tokens_*` are null (and `by_model` is `{}`) when the transcript has no assistant usage:
 * such a spawn is not a token sample, but its wall minutes are kept.
 *
 * @param {string} file  a transcript .jsonl path
 * @returns {{minutes: number|null, tokens_input: number|null, tokens_output: number|null,
 *   tokens_cache_read: number|null, tokens_cache_write: number|null,
 *   by_model: Object<string, {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write}>}}
 */
function spawnSample(file) {
  const minutes = transcriptSpanMinutes(file);
  const usage = sumUsage(file);
  if (usage.messages === 0) {
    return { minutes, tokens_input: null, tokens_output: null, tokens_cache_read: null, tokens_cache_write: null, by_model: {} };
  }
  const by_model = {};
  for (const model of Object.keys(usage.by_model).sort()) by_model[model] = tokenShare(usage.by_model[model]);
  return { minutes, ...tokenShare(usage), by_model };
}

module.exports = {
  OVERHEAD_AGENTS,
  normalizeAgentType,
  isQuickSpawn,
  transcriptSpanMinutes,
  spawnSample,
};
