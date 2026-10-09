#!/usr/bin/env node

/**
 * AOForge No-Progress Guard (PreToolUse, all tools) — TRD 28-04
 *
 * Surfaces the case where an agent calls the same tool with the same arguments
 * over and over. Step limits cannot do this: they fire only once the whole
 * budget is spent, so they catch an infinite loop but never a stuck one.
 *
 * Escalation policy this implements (TRD 28-05):
 *   - 3rd identical call  -> warn on stderr. Non-blocking; the agent keeps control.
 *   - 5th identical call  -> permissionDecision 'ask'. The loop is now costing
 *                            more than the interruption, and a human deciding is
 *                            the correct escalation — not a bigger model, which
 *                            cannot fix environment friction.
 *
 * Deliberately NOT wired to tool errors. The 2026-08-18 audit measured a
 * 3.6-4.3% tool-error rate at EVERY model tier, much of it gate false positives.
 * Escalating on raw errors would have spent the whole budget on Opus responding
 * to a mis-scoped worktree guard.
 *
 * Fails open in every direction: any read/parse/write problem returns silently.
 * A guard that breaks the session is worse than no guard.
 *
 * State (quick task 25): one file per session, {guard, updated, project}, under
 * ~/.claude/aoforge/state/progress-guard/<session>.json (override the directory
 * with AOFORGE_PROGRESS_GUARD_DIR). It used to be a single shared
 * <project>/.aoforge/.progress-guard.json, rewritten on every tool call — Claude
 * Code's file watcher attached that whole file (~800 tokens) to every tool result,
 * and concurrent sessions raced on it. The hook still needs a `.aoforge/` above
 * cwd (the guard is AOForge-scoped, and it is how `project` is derived) but never
 * writes there. Files older than SESSION_TTL_MS are pruned on a session's first
 * write only, so the sweep costs one readdir per session, not per call.
 *
 * Escape: AOFORGE_SKIP_PROGRESS_GUARD=1
 */

'use strict';

const fs = require('fs');
const path = require('path');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// TRD 72-06: the planning directory is `.aoforge/`, or for one release a legacy one (compat.cjs resolves which).
const { findProjectRoot, planningRoot } = require('../aoforge/bin/lib/compat.cjs');

// Single source of truth. progress-guard.cjs depends only on node:crypto, so it
// is safe to load from a hook — unlike most of bin/lib, which pulls in
// helpers.cjs and reads JSON at module load. progress-guard-store.cjs follows the
// same rule (fs, os, path only).
const { record, message } = require('../aoforge/bin/lib/progress-guard.cjs');
const store = require('../aoforge/bin/lib/progress-guard-store.cjs');

/** Session files untouched for longer than this are pruned. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Tools whose repetition is normal and not a loop signal. */
const IGNORED_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion']);

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findPlanningDir(start) {
  const root = findProjectRoot(start, { maxUp: Infinity });
  return root ? planningRoot(root) : null;
}

function projectOf(planningDir) {
  const root = path.dirname(planningDir);
  try { return fs.realpathSync(root); } catch { return root; }
}

function main() {
  if (process.env.AOFORGE_SKIP_PROGRESS_GUARD === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  // `null`, an array or a string parses fine but is not a payload (TRD 63-05): exit 0 and say nothing.
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;

  const tool = input.tool_name;
  if (!tool || IGNORED_TOOLS.has(tool)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // not an AOForge project

  const project = projectOf(planningDir);
  const dir = store.stateDir();
  const file = store.sessionFile(dir, input.session_id);
  const now = Date.now();

  let existed = false;
  try { existed = fs.existsSync(file); } catch { /* treat as a first call */ }
  const prior = (store.readSession(file) || {}).guard || null;

  const result = record(prior, { tool, args: input.tool_input || {} });

  // Persistence is best-effort: writeSession never throws, and if the state dir is
  // unusable the trip decision below still stands for this call (prior was null).
  store.writeSession(file, { guard: result.state, updated: now, project });
  if (!existed) {
    try { store.pruneStale(dir, now, SESSION_TTL_MS, file); } catch { /* best effort */ }
  }

  if (!result.tripped) return;

  const text = message(result, tool);

  if (result.level === 'stuck') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: text,
      },
    }));
    return;
  }

  // warn: visible, non-blocking — the agent keeps control of its own loop
  process.stderr.write(`${text}\n`);
}

if (require.main === module) main();

module.exports = { findPlanningDir, IGNORED_TOOLS, SESSION_TTL_MS };
