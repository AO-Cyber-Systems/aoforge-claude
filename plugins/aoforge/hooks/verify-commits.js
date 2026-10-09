#!/usr/bin/env node

/**
 * AOForge Commit Verification Hook (SubagentStop hook)
 *
 * Triggers when an executor subagent completes.
 * Verifies that git commits were actually made (checks for recent commits).
 *
 * In autonomous mode: if no recent commits and mid-execution, block once per
 * agent (per-agent marker file) to give the subagent a retry with actionable
 * feedback. The second SubagentStop for the same agent always allows stop.
 *
 * Output shape (objective 70, TRD 70-02, TOOL-08): the block is the TOP-LEVEL
 * {"decision":"block","reason":"…"} of "Stop decision control"
 * (https://code.claude.com/docs/en/hooks, checked 2026-10-08): "SubagentStop hooks
 * use the same decision control format as Stop hooks". Before objective 70 it was
 * nested as hookSpecificOutput.{hookEventName,decision,reason}; the docs allow only
 * hookEventName and additionalContext inside hookSpecificOutput, so that block never
 * took effect. hooks/__fixtures__/hook-output-schema.js models the schema and
 * verify-commits.test.js pins the shape against it.
 *
 * Scope: only agent_type "aoforge:executor" is blocked. SubagentStop has no matcher
 * in hooks.json, and planners, checkers, Explore and internal agents commit nothing
 * by design. Now that the block is effective it would otherwise stop all of them.
 *
 * The marker lives OUTSIDE the repo (objective 45, TRD 45-10, SC1): in the hook
 * marker store, $AOFORGE_HOOK_MARKER_DIR else
 * ~/.claude/aoforge/state/hook-markers/<repo-key>/autonomous-retry-<agent>.
 * It used to be <project>/.aoforge/.autonomous-retry-<agent>, which the file
 * watcher attached to every later tool result and left the repo dirty. Stale
 * (>1h) markers are swept from the store directory; leftover in-tree markers from
 * older versions are neither read nor written (the doctor cleans them).
 *
 * In non-autonomous mode (yolo/interactive): warn-only via stderr (existing
 * behavior preserved verbatim).
 *
 * Hook type: SubagentStop (fires when a subagent finishes)
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// TRD 72-06: the planning directory is `.aoforge/`, or for one release a legacy one (compat.cjs resolves which).
const { findProjectRoot, planningRoot } = require('../aoforge/bin/lib/compat.cjs');
const store = require('../aoforge/bin/lib/hook-marker-store.cjs');

const RETRY_PREFIX = 'autonomous-retry-';

/** The agent type the retry-once block applies to; same value as gate-executor-stop.js. */
const EXECUTOR_AGENT_TYPE = 'aoforge:executor';

const BLOCK_REASON = 'AOForge autonomous mode: executor produced no commits in the last 10 minutes during mid-execution work. Retry once: re-read your TRD/plan file, check git status for uncommitted work, commit completed tasks atomically, and write SUMMARY.md. If genuinely blocked, return a structured failure report instead of stopping silently. Never use port 8080 for anything — use 8091.';

// ─── AOForge project detection ────────────────────────────────────────────────

function findPlanningDir() {
  const root = findProjectRoot(process.cwd(), { maxUp: Infinity });
  return root ? planningRoot(root) : null;
}

// ─── Git commit check ─────────────────────────────────────────────────────────

function hasRecentCommits() {
  try {
    const result = spawnSync(
      'git',
      ['log', '--oneline', '--since=10 minutes ago'],
      { encoding: 'utf8', timeout: 5000 },
    );

    // git binary not found or hard failure
    if (result.error) return null;

    // "not a git repository" — not applicable, silent no-op
    if (result.status !== 0) {
      const stderr = (result.stderr || '').toLowerCase();
      if (stderr.includes('not a git repository')) return null;
      // Empty repo ("no commits yet") or other git error — treat as no recent commits
      return false;
    }

    return result.stdout.trim().length > 0;
  } catch {
    return null; // git unavailable
  }
}

// ─── STATE.md mid-execution check ─────────────────────────────────────────────

function isMidExecution(planningDir) {
  try {
    const stateFile = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(stateFile)) return false;
    const content = fs.readFileSync(stateFile, 'utf8');
    return content.includes('Executing') || content.includes('In progress');
  } catch {
    return false;
  }
}

// ─── Autonomous mode detection ────────────────────────────────────────────────

function isAutonomousMode(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.mode === 'autonomous';
  } catch {
    return false;
  }
}

// ─── Stdin payload parsing ────────────────────────────────────────────────────

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parsePayload() {
  try { return JSON.parse(readStdin() || '{}'); } catch { return {}; }
}

// ─── Per-agent retry marker ───────────────────────────────────────────────────

/**
 * Return the path for the per-agent retry marker file, in the hook marker store
 * (never under .aoforge/). The project root is the directory that contains
 * `planningDir`.
 * agentId is sanitized: only alphanumeric, underscore, hyphen kept.
 * This prevents path traversal attacks since agent_id is external input.
 *
 * @param {string} planningDir
 * @param {string} agentId
 * @param {NodeJS.ProcessEnv} [env] resolves AOFORGE_HOOK_MARKER_DIR; defaults to process.env
 */
function retryMarkerPath(planningDir, agentId, env = process.env) {
  const sanitized = String(agentId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return store.markerFile(path.dirname(planningDir), RETRY_PREFIX + sanitized, { env });
}

// ─── Stale marker cleanup ─────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Remove autonomous-retry-* markers older than 1 hour from this project's store
 * directory. Safety net so markers never accumulate indefinitely.
 *
 * @param {string} planningDir
 * @param {NodeJS.ProcessEnv} [env]
 */
function cleanStaleMarkers(planningDir, env = process.env) {
  try {
    const dir = store.markerDir(path.dirname(planningDir), { env });
    store.cleanStale(dir, Date.now(), STALE_THRESHOLD_MS, RETRY_PREFIX);
  } catch {
    // Silently fail — never block the hook
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) return; // Not an AOForge project

  try {
    // Clean up stale retry markers first (safety net, runs on every SubagentStop)
    cleanStaleMarkers(planningDir);

    const recent = hasRecentCommits();

    // If git is unavailable (null) or commits exist, nothing to do
    if (recent === null || recent === true) return;

    // No recent commits — check if we're mid-execution
    if (!isMidExecution(planningDir)) return;

    if (isAutonomousMode(planningDir)) {
      // ── Autonomous retry-once path ──────────────────────────────────────
      const payload = parsePayload();

      // Only the executor is expected to commit. Planners, checkers, Explore and
      // internal agents commit nothing by design, and SubagentStop has no matcher.
      if (payload.agent_type !== EXECUTOR_AGENT_TYPE) return;

      const agentId = String(payload.agent_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      const marker = retryMarkerPath(planningDir, agentId);

      if (fs.existsSync(marker)) {
        // Retry already consumed for this agent — allow stop silently
        return;
      }

      // First time: create marker and block with actionable feedback. The write comes
      // first and may throw (unwritable home): the outer catch then lets the stop through,
      // so a marker that cannot be recorded never turns into an endless block.
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, String(Date.now()), 'utf8');

      process.stdout.write(JSON.stringify({ decision: 'block', reason: BLOCK_REASON }));
    } else {
      // ── Non-autonomous warn-only path (preserved verbatim) ───────────────
      console.error('\n⚠ AOForge: No git commits found in last 10 minutes.');
      console.error('  If an executor was running, this may indicate a silent failure.');
      console.error('  Check the SUMMARY.md for the current objective.\n');
    }
  } catch {
    // Silently fail — hook should never block
  }
}

if (require.main === module) main();

module.exports = {
  EXECUTOR_AGENT_TYPE,
  findPlanningDir,
  hasRecentCommits,
  isMidExecution,
  isAutonomousMode,
  retryMarkerPath,
  cleanStaleMarkers,
};
