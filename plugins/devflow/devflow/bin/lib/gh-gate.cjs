'use strict';

/**
 * gh-gate.cjs — the commit gate decision (objective 50, GEN-01).
 *
 * In store mode a commit should land on an objective's linked branch, never on the default branch or on a branch
 * no PR entry names. This module answers "may this commit land here?" offline: no `gh`, no `git fetch`, no writes.
 *
 *   evaluateGate({branch, mainBranch, defaultBranch, prs, env})   pure; plain strings and the `listPrs` pairs
 *     -> { allow: true, objective }                     a linked branch, or an executor branch inheriting one
 *      | { allow: false, reason, message }              reason: default_branch | unlinked_branch | detached_head
 *      | { allow: true, escaped: true, reason, message }   DEVFLOW_SKIP_GH_GATE=1 overrode the refusal
 *
 * A branch is LINKED when the mapping's `prs` map has an entry whose `branch` equals it and that has no `merged_at`.
 * `gh pr start` writes that entry only after it has created the GitHub linked branch, so a local hit is enough and the
 * gate works with no network. Recording the override (`df-tools override --gate gh`) is the caller's job (50-06): this
 * module stays pure so it can be called from anywhere.
 */

const ghMapping = require('./gh-mapping.cjs');

/** The one variable that overrides a refusal. Only the string "1" counts. */
const ESCAPE_ENV = 'DEVFLOW_SKIP_GH_GATE';

/** `df/exec-<id>`: a worktree executor's branch (exec-context.cjs). It merges back into the objective branch. */
const EXEC_BRANCH_RE = /^df\/exec-/;

const START_HINT = 'run `df-tools gh pr start <objective>` and commit on its branch, or set DEVFLOW_SKIP_GH_GATE=1 (logged)';

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * The usable PR entries as `{objective, entry}`. `prs` is `listPrs` output (`[objectiveId, entry]` pairs); a plain
 * `{id: entry}` map is tolerated too. An entry with no branch, or a key that is no objective id, is skipped.
 */
function usableEntries(prs) {
  const pairs = Array.isArray(prs) ? prs : isPlainObject(prs) ? Object.entries(prs) : [];
  const out = [];
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const [key, entry] = pair;
    if (!isPlainObject(entry) || typeof entry.branch !== 'string' || entry.branch === '') continue;
    const objective = ghMapping.toObjectiveId(key);
    if (objective === null) continue;
    out.push({ objective, entry });
  }
  return out;
}

/**
 * How `branch` stands with the PR entries: `{live}` the objective of an unmerged entry that names it, else
 * `{merged}` the objective of a merged entry that names it, else `{}`. A live entry wins over a merged one.
 */
function linkOf(branch, entries) {
  if (typeof branch !== 'string' || branch === '') return {};
  let merged = null;
  for (const { objective, entry } of entries) {
    if (entry.branch !== branch) continue;
    if (!entry.merged_at) return { live: objective };
    if (merged === null) merged = objective;
  }
  return merged === null ? {} : { merged };
}

function refuse(reason, message) {
  return { allow: false, reason, message };
}

/** The refusal for a branch that is not linked, worded for what is actually wrong with it. */
function unlinked(branch, link) {
  if (link.merged !== undefined) {
    return refuse(
      'unlinked_branch',
      `Branch ${branch} belongs to objective ${link.merged}, whose PR is merged. Start the next objective: ${START_HINT}.`,
    );
  }
  return refuse('unlinked_branch', `Branch ${branch} is not linked to an objective PR. To link it, ${START_HINT}.`);
}

/**
 * Decide whether a store-mode commit may land on `branch`.
 *
 * @param {object} input
 * @param {string|null} input.branch         the checked-out branch; null/'' for a detached HEAD
 * @param {string|null} [input.mainBranch]   the MAIN checkout's branch (an executor branch inherits its objective)
 * @param {string|null} [input.defaultBranch] the repository's default branch, null when unknown
 * @param {Array}       [input.prs]          `ghMapping.listPrs(mapping)` output
 * @param {object}      [input.env]          the environment (DEVFLOW_SKIP_GH_GATE)
 */
function evaluateGate({ branch, mainBranch, defaultBranch, prs, env } = {}) {
  const verdict = decide({ branch, mainBranch, defaultBranch, entries: usableEntries(prs) });
  if (verdict.allow) return verdict;
  if (isPlainObject(env) && env[ESCAPE_ENV] === '1') return { ...verdict, allow: true, escaped: true };
  return verdict;
}

function decide({ branch, mainBranch, defaultBranch, entries }) {
  if (typeof branch !== 'string' || branch === '') {
    return refuse(
      'detached_head',
      `HEAD is detached, so a commit here would belong to no branch. Check out a linked objective branch (${START_HINT}).`,
    );
  }

  if (typeof defaultBranch === 'string' && defaultBranch !== '' && branch === defaultBranch) {
    return refuse('default_branch', `Refusing to commit on ${branch}, the default branch. To get a linked branch, ${START_HINT}.`);
  }

  const own = linkOf(branch, entries);
  if (own.live !== undefined) return { allow: true, objective: own.live };

  if (EXEC_BRANCH_RE.test(branch)) {
    const main = linkOf(mainBranch, entries);
    if (main.live !== undefined) return { allow: true, objective: main.live };
    const where = typeof mainBranch === 'string' && mainBranch !== '' ? mainBranch : 'an unknown branch';
    return refuse(
      'unlinked_branch',
      `Executor branch ${branch} inherits its objective from the main checkout, which is on ${where}, not a linked objective branch. ` +
        `Check out the objective branch in the main checkout first (${START_HINT}).`,
    );
  }

  return unlinked(branch, own);
}

module.exports = { evaluateGate, ESCAPE_ENV };
