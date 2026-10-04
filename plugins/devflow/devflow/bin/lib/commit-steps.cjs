'use strict';

// commit-steps.cjs (objective 52, TRD 52-01) — the one builder for every `df-tools commit` follow-up df-tools prints.
//
// In GitHub store mode objective 50's commit gate (GEN-01, gh-gate.cjs) refuses `df-tools commit` on the default branch
// and on any branch no objective PR names, so a follow-up printed as a bare commit line fails when run as printed. Every
// emitter builds its text here, so the sequences cannot drift apart: `gh setup --apply` (gh-setup-cli.cjs), doctor
// checks 20 and 21, and migration 0010 (whose STORE_COMMIT_STEPS 0011 prints again after a backfill).
//
//   store form (reason given)  new branch → commit with the logged escape (gate `gh` in .planning/.override-log.jsonl)
//                              → push → pull request, plus the linked-branch alternative: on a branch
//                              `df-tools gh pr start <objective>` linked, the bare command is accepted as is.
//   plain form (reason null)   new branch → bare command → push → pull request. Mirror or local mode, where no gate
//                              refuses the commit but the default-branch ruleset still wants a pull request.
//
// The text is static on purpose: it is read later, possibly from another branch, so it never evaluates the gate at
// print time. The module is pure (no fs, no git, no config); callers choose the form with planningMode.isStoreMode(root).

const DF_TOOLS_CMD = 'node ~/.claude/devflow/bin/df-tools.cjs';

// Characters that would change the meaning of a double-quoted shell word: the printed line must run as printed.
const SHELL_UNSAFE_IN_QUOTES = /["$`\\]/;

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/** `node ~/.claude/devflow/bin/df-tools.cjs commit "<message>" --files <files...>`. Throws TypeError on unusable input. */
function commitCommand(message, files) {
  if (!isNonEmptyString(message) || SHELL_UNSAFE_IN_QUOTES.test(message)) {
    throw new TypeError('commitCommand: message must be a non-empty string without ", $, ` or \\');
  }
  if (!Array.isArray(files) || files.length === 0 || !files.every(isNonEmptyString)) {
    throw new TypeError('commitCommand: files must be a non-empty array of non-empty strings');
  }
  return `${DF_TOOLS_CMD} commit "${message}" --files ${files.join(' ')}`;
}

/**
 * The printed follow-up for `command` (usually commitCommand's output), as a `\n`-joined string.
 *   reason: a non-empty string → the store form (six lines; line 3 carries the escape, line 6 the `gh pr start` route)
 *   reason: null or undefined  → the plain form (five lines, no escape)
 * Throws TypeError when `branch` or `command` is not a non-empty string, or `reason` is neither absent nor usable.
 */
function branchCommitSteps({ branch, command, reason } = {}) {
  if (!isNonEmptyString(branch)) throw new TypeError('branchCommitSteps: branch must be a non-empty string');
  if (!isNonEmptyString(command)) throw new TypeError('branchCommitSteps: command must be a non-empty string');

  if (reason === null || reason === undefined) {
    return [
      'commit on a new branch, then merge it through a pull request:',
      `  git switch -c ${branch}`,
      `  ${command}`,
      `  git push -u origin ${branch}`,
      '  then open a pull request for that branch',
    ].join('\n');
  }

  if (!isNonEmptyString(reason) || SHELL_UNSAFE_IN_QUOTES.test(reason)) {
    throw new TypeError('branchCommitSteps: reason must be null, or a non-empty string without ", $, ` or \\');
  }
  return [
    'commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked ' +
      'branches), then merge it through a pull request:',
    `  git switch -c ${branch}`,
    `  DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="${reason}" ${command}`,
    `  git push -u origin ${branch}`,
    '  then open a pull request for that branch',
    `  or, on an objective's linked branch (\`df-tools gh pr start <objective>\`), commit there with: ${command}`,
  ].join('\n');
}

module.exports = { DF_TOOLS_CMD, commitCommand, branchCommitSteps };
