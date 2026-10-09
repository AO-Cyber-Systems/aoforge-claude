'use strict';

// git-busy.cjs — "is a git operation in progress here?" (objective 72, TRD 72-08).
//
// One list, shared by the SessionStart upgrade hook (which never commits during an operation) and migration 0012
// (which never moves the planning directory during one). The markers live in the per-worktree git dir, so each is
// resolved with `git rev-parse --git-path <name>`; a linked worktree's rebase is its own.

const fs = require('fs');
const path = require('path');

// git-path name -> operation, checked in this order.
const BUSY_MARKERS = Object.freeze([
  Object.freeze(['rebase-merge', 'rebase']),
  Object.freeze(['rebase-apply', 'rebase']),
  Object.freeze(['MERGE_HEAD', 'merge']),
  Object.freeze(['CHERRY_PICK_HEAD', 'cherry-pick']),
  Object.freeze(['REVERT_HEAD', 'revert']),
  Object.freeze(['BISECT_LOG', 'bisect']),
]);

/**
 * The operation in progress in `root`'s work tree, or null.
 *
 * @param {string} root  a directory inside the work tree
 * @param {function(string[]): {ok: boolean, out: string}} git  runs `git <args>` in `root`, never throws
 * @returns {'rebase'|'merge'|'cherry-pick'|'revert'|'bisect'|null}  null also when git cannot answer
 */
function busyOperation(root, git) {
  const r = git(['rev-parse', ...BUSY_MARKERS.flatMap(([name]) => ['--git-path', name])]);
  if (!r || !r.ok) return null;
  const lines = String(r.out).split('\n').filter(Boolean);
  for (let i = 0; i < BUSY_MARKERS.length && i < lines.length; i++) {
    if (fs.existsSync(path.resolve(root, lines[i]))) return BUSY_MARKERS[i][1];
  }
  return null;
}

module.exports = { BUSY_MARKERS, busyOperation };
