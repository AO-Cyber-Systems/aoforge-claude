#!/usr/bin/env node

/**
 * AOForge Handoff Result Routing (UserPromptSubmit)
 *
 * When the aoforge-watch daemon completes a queued command, it writes a
 * record to .aoforge-handoff/done/<id>.json. On the user's next prompt,
 * this hook injects any unconsumed completions into Claude's context as
 * additionalContext, so Claude can resume the deferred work without the
 * user pasting `! cmd`.
 *
 * Closes the loop for Approach B (watcher daemon) — without this hook,
 * watcher results would sit in done/ unread.
 *
 * Delivery is shared (TRD 73-02): selection, the exactly-once claim, rendering
 * and the consumed mark live in aoforge/bin/lib/handoff-results.cjs, the same
 * library inject-handoff-results.js (PostToolUse / Stop) delivers through.
 * Claude Code runs hooks in parallel, so a record is taken by creating
 * done/<id>.claim with O_EXCL; a process that loses the claim renders nothing
 * for that record, and a record claimed but never marked consumed (a crash in
 * between) is not delivered again.
 *
 * This hook is the catch-all: it takes every fresh, unclaimed, unconsumed
 * record whatever session or agent it was queued by (mode 'all'), so the
 * user's next prompt delivers anything no other hook delivered. It does not
 * read the hook payload.
 *
 * Behaviour:
 *   - Walk up from cwd looking for .aoforge-handoff/done/ (mirrors
 *     route-intent.js's findPlanningDir pattern)
 *   - Skip records older than AOFORGE_HANDOFF_RESULT_TTL_MS (default 1h)
 *   - Skip records already marked consumed or already claimed
 *   - Render the records as compact markdown additionalContext
 *   - Mark each emitted record consumed:true (consumed_by: route-results)
 *     so they don't re-inject
 *   - Special-case rejected/timeout/error statuses with phrasing that
 *     tells Claude NOT to retry the rejected/timed-out command
 *
 * Truncation: each record's stdout+stderr capped at MAX_OUTPUT_CHARS and the
 * whole block at MAX_RENDER_CHARS to bound additionalContext size.
 *
 * Upgrade notices (TRD 36-05): unconsumed notices from the project's
 * .aoforge/.aoforge-notices.json and ~/.claude/aoforge/.aoforge-notices.json
 * are appended to the SAME additionalContext and marked consumed, so each is
 * emitted once. AOFORGE_SKIP_NOTICES=1 suppresses only the notices (they stay
 * unconsumed); AOFORGE_SKIP_HANDOFF_RESULTS=1 suppresses only handoff results.
 *
 * Emits nothing when:
 *   - No .aoforge-handoff/done/ directory in cwd or any parent (or all records
 *     consumed, claimed or stale), AND no unconsumed notices
 *   - Both escape hatches are set
 *
 * Defensive: never throws, never blocks the user prompt. Malformed JSON
 * in done/ is silently skipped.
 */

'use strict';

const path = require('path');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// TRD 72-06: the planning directory is `.aoforge/`, or for one release a legacy one (compat.cjs resolves which).
const { findProjectRoot } = require('../aoforge/bin/lib/compat.cjs');

// TRD 73-02: handoff selection, claim, rendering and the consumed mark live in the shared delivery library.
const {
  DEFAULT_TTL_MS,
  MAX_OUTPUT_CHARS,
  findHandoffDir,
  isStale,
  selectUnconsumed,
  truncate,
  renderRecord,
  renderResults,
  markConsumed,
  takeResults,
} = require('../aoforge/bin/lib/handoff-results.cjs');

function emit(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

// Nearest ancestor (inclusive) holding a `.aoforge/` directory → that project root, else null.
function findPlanningDir(start) {
  return findProjectRoot(start, { maxUp: Infinity });
}

// Unconsumed upgrade notices (TRD 36-05): project `.aoforge/.aoforge-notices.json` plus the
// global `~/.claude/aoforge/.aoforge-notices.json`, each taken (marked consumed) exactly once.
// notices.cjs is resolved from the BUNDLED plugin; when it is absent there are no notices.
function collectNotices() {
  if (process.env.AOFORGE_SKIP_NOTICES === '1') return '';
  let notices;
  try {
    notices = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'notices.cjs'));
  } catch {
    return '';
  }
  try {
    const files = [];
    const projectRoot = findPlanningDir(process.cwd());
    if (projectRoot) files.push(notices.projectNoticesPath(projectRoot));
    const home = require('os').homedir();
    if (home) files.push(notices.globalNoticesPath(home));
    return notices.renderNotices(notices.takeUnconsumed(files));
  } catch {
    return '';
  }
}

// The catch-all delivery: every fresh, unclaimed, unconsumed record, whatever its address. takeResults has
// already claimed, rendered and marked them by the time it returns.
function collectHandoff() {
  if (process.env.AOFORGE_SKIP_HANDOFF_RESULTS === '1') return null;
  const taken = takeResults({ cwd: process.cwd(), mode: 'all', by: 'route-results' });
  return taken ? taken.text : null;
}

function main() {
  const handoffText = collectHandoff();
  const noticeText = collectNotices();

  const parts = [];
  if (handoffText) parts.push(handoffText);
  if (noticeText) parts.push(noticeText);
  if (parts.length === 0) return;

  emit(parts.join('\n\n'));
}

if (require.main === module) {
  main();
}

module.exports = {
  findHandoffDir,
  findPlanningDir,
  selectUnconsumed,
  renderRecord,
  renderResults,
  markConsumed,
  truncate,
  isStale,
  DEFAULT_TTL_MS,
  MAX_OUTPUT_CHARS,
};
