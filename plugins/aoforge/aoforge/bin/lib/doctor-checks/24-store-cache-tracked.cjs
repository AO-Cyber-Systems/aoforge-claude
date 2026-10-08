'use strict';

// Doctor check: store-cache-tracked (TRD 48-10, GWP-04).
//
// In GitHub store mode `.planning/` is a cache of GitHub, and U-1 keeps only config.json and STACK.md in git. A
// store-mode project that still tracks the rest (or lacks the managed `.gitignore` block) keeps committing a cache
// that GitHub owns. Migration 0010 is the fix, and it is `confirm`-only: it untracks planning documents and has
// preconditions (outbox drained, every cache file baselined) that only a person should decide to satisfy. So this
// check is REPORT-ONLY: it never exports `fix`, and it names the exact command instead.
//
// Discovery is migration 0010's `detect` (never re-implemented here). Local mode, no `.planning/`, or a directory
// that is not a git work tree → ok.

const m0010 = require('../migrations/0010-store-gitignore.cjs');

const FIX_COMMAND = 'aof-tools upgrade --apply --only 0010 --confirm';

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const det = m0010.detect({ projectRoot: ctx.projectRoot, userHome: ctx.userHome, pluginVersion: ctx.pluginVersion, dryRun: true, options: {} });
  if (!det.applies) {
    return { severity: 'ok', finding: `nothing to untrack: ${det.reason}`, fixable: false, details: { reason: det.reason } };
  }

  const n = det.tracked || 0;
  const head = n > 0
    ? `store mode is on but ${n} .planning/ path(s) are still tracked`
    : 'store mode is on but the .planning/ .gitignore block is missing or outdated';
  return {
    severity: 'warn',
    finding: `${head} (${det.reason})`,
    fixable: false,
    fix_command: FIX_COMMAND,
    details: { tracked: n, reason: det.reason },
  };
}

module.exports = {
  id: 'store-cache-tracked',
  title: 'Planning cache still tracked in GitHub store mode',
  scope: 'project',
  run,
  FIX_COMMAND,
};
