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

const fs = require('fs');
const path = require('path');
const { forEachRecord } = require('./context-audit.cjs');
const trdIdentify = require('./trd-identify.cjs');
const { sumUsage, repoMatcher, repoMatch } = require('./token-usage.cjs');

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

// ─── Transcript index ─────────────────────────────────────────────────────────

const META_RE = /^agent-(.+)\.meta\.json$/;

/** Sorted names of the directories (or files) directly in `dir`; [] when it cannot be read. */
function sortedNames(dir, directories) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => (directories ? e.isDirectory() : e.isFile()))
    .map((e) => e.name)
    .sort();
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function byCodeUnit(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Every overhead spawn of the given repositories under a Claude Code projects root.
 *
 * Reads exactly `<root>/<key>/<session>/subagents/agent-*.meta.json` (sorted at each level, no deeper walk). A meta file
 * whose agentType normalises to an overhead agent is one spawn; only then is the sibling jsonl's FIRST user record read.
 * A repository claims the spawn by the executor rule (token-usage.repoMatch): a REPO_ROOT line, else the first record's
 * cwd in the repo or its `.df-worktrees`, else a `<repo>/.planning/` path. The project-key directory name is never
 * evidence: keys are lossy.
 *
 * counts: `spawns` = overhead-typed meta files; each is exactly one of `quick` (a planner whose description starts with
 * Quick), `unreadable` (no readable first user record), `foreign` (no listed repository claims it) or `matched`.
 *
 * @param {{root: string, projects?: Array<{root: string, label: string}>}} opts  root is required, never defaulted
 * @returns {{entries: Array<{agent, project, session, agent_id, file}>,
 *   counts: {spawns, matched, foreign, quick, unreadable, by_agent: Object<string, number>}}}
 */
function indexOverheadTranscripts({ root, projects = [] } = {}) {
  if (typeof root !== 'string' || !root) throw new Error('indexOverheadTranscripts: root is required');
  const repos = [...projects]
    .sort((a, b) => byCodeUnit(a.root, b.root))
    .map((p) => ({ label: p.label, repo: repoMatcher(p.root) }));
  const counts = { spawns: 0, matched: 0, foreign: 0, quick: 0, unreadable: 0, by_agent: {} };
  const entries = [];

  for (const key of sortedNames(root, true)) {
    for (const session of sortedNames(path.join(root, key), true)) {
      const subagents = path.join(root, key, session, 'subagents');
      for (const name of sortedNames(subagents, false)) {
        const m = META_RE.exec(name);
        if (!m) continue;
        const meta = readJson(path.join(subagents, name));
        const agent = meta ? normalizeAgentType(meta.agentType) : null;
        if (!agent) continue;
        counts.spawns++;
        if (agent === 'planner' && isQuickSpawn(meta)) { counts.quick++; continue; }

        const agentId = m[1];
        const file = path.join(subagents, `agent-${agentId}.jsonl`);
        const rec = trdIdentify.readFirstUserRecord(file);
        if (!rec) { counts.unreadable++; continue; }
        const prompt = trdIdentify.textOfContent(rec.message && rec.message.content);

        const owner = repos.find((p) => repoMatch(prompt, rec.cwd, p.repo));
        if (!owner) { counts.foreign++; continue; }

        counts.matched++;
        counts.by_agent[agent] = (counts.by_agent[agent] || 0) + 1;
        entries.push({ agent, project: owner.label, session, agent_id: agentId, file });
      }
    }
  }
  counts.by_agent = Object.fromEntries(Object.keys(counts.by_agent).sort().map((k) => [k, counts.by_agent[k]]));
  return { entries, counts };
}

/**
 * One sample per matched overhead spawn: `{agent, project, session, agent_id}` plus spawnSample's measurements. No file
 * path in a sample. Sorted by agent, project, session, agent_id, so two calls over the same tree are deep-equal.
 *
 * @param {{root: string, projects?: Array<{root: string, label: string}>}} opts
 * @returns {{samples: Array<object>, counts: object}}  counts as indexOverheadTranscripts
 */
function collectOverhead({ root, projects = [] } = {}) {
  if (typeof root !== 'string' || !root) throw new Error('collectOverhead: root is required');
  const { entries, counts } = indexOverheadTranscripts({ root, projects });
  const samples = entries.map((e) => ({
    agent: e.agent, project: e.project, session: e.session, agent_id: e.agent_id, ...spawnSample(e.file),
  }));
  samples.sort((a, b) => byCodeUnit(a.agent, b.agent)
    || byCodeUnit(a.project, b.project)
    || byCodeUnit(a.session, b.session)
    || byCodeUnit(a.agent_id, b.agent_id));
  return { samples, counts };
}

module.exports = {
  OVERHEAD_AGENTS,
  normalizeAgentType,
  isQuickSpawn,
  transcriptSpanMinutes,
  spawnSample,
  indexOverheadTranscripts,
  collectOverhead,
};
