'use strict';

// gh-setup.cjs (TRD 50-09) — the read + plan half of `df-tools gh setup` (GEN-04).
//
// Compute, without changing anything, what a repository needs for DevFlow enforcement and how that differs
// from what it has:
//
//   readSetupState(root)   gh READS only -> a plain state snapshot            (impure: gh reads, local files)
//   planSetup(state)       state -> an ordered list of actions                (pure)
//   renderPlan(actions)    actions -> the dry-run text, exact payloads        (pure)
//
// The apply half (`applySetup`, the command) is TRD 50-11 and consumes the actions this module produces. An
// action is `{kind, target, status, desc, payload?, request?, file?}`:
//
//   status   create | update | exists | skip | manual | conflict | advisory
//   payload  the data a create/update sends (an object, for the dry-run to print)
//   request  `{args, input?}`: the gh argv and the exact stdin (`--input -`, compact JSON text) the apply step
//            sends through gh-client, so the dry-run prints exactly what apply sends
//   file     `{path, content}` for a local file the apply step writes into the working tree (never committed)
//
// This module never writes to GitHub (apply does); the seam guard lists it as guarded.

const { CONTEXTS } = require('./gh-check.cjs');

// ─── The desired default-branch ruleset ───────────────────────────────────────

/** The one ruleset setup manages. Renaming it orphans every ruleset already created under the old name. */
const SETUP_RULESET_NAME = 'devflow: default branch';

const DEFAULT_BRANCH_REF = '~DEFAULT_BRANCH';
const MERGE_METHODS = ['MERGE', 'SQUASH', 'REBASE'];
const DEFAULT_MERGE_METHOD = 'SQUASH';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A positive integer, or null. A numeric string counts: the config template ships `app_id` as a string. */
function positiveInt(value) {
  const n = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `github.pr.merge_method` in the form a merge_queue rule wants: MERGE | SQUASH | REBASE, SQUASH when unknown. */
function queueMergeMethod(value) {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return MERGE_METHODS.includes(upper) ? upper : DEFAULT_MERGE_METHOD;
}

/**
 * The ruleset DevFlow wants on the default branch (50-RESEARCH "Code Examples"). `enforcement: 'active'` because
 * `evaluate` is Enterprise-only, and none of the branch-name / commit-message pattern rules (also Enterprise-only)
 * appear. Approvals stay at 0: an objective is one PR, often by a solo developer, and a team raises the count in
 * GitHub (setup never lowers it).
 *
 * @param {{mergeMethod?:string, appId?:number|string, mergeQueue?:boolean}} [opts]
 *   `appId` pins each required check to that GitHub App (`integration_id`); without a positive integer nothing is
 *   pinned. `mergeQueue:false` leaves the merge_queue rule out (a plan that cannot have one).
 */
function desiredRuleset({ mergeMethod, appId, mergeQueue = true } = {}) {
  const pin = positiveInt(appId);
  const requiredChecks = [CONTEXTS.linkedIssue, CONTEXTS.planningConsistency]
    .map((context) => (pin === null ? { context } : { context, integration_id: pin }));
  const rules = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
      },
    },
    {
      type: 'required_status_checks',
      parameters: { strict_required_status_checks_policy: false, required_status_checks: requiredChecks },
    },
  ];
  if (mergeQueue !== false) {
    rules.push({
      type: 'merge_queue',
      parameters: {
        check_response_timeout_minutes: 60,
        grouping_strategy: 'ALLGREEN',
        max_entries_to_build: 5,
        max_entries_to_merge: 5,
        merge_method: queueMergeMethod(mergeMethod),
        min_entries_to_merge: 1,
        min_entries_to_merge_wait_minutes: 5,
      },
    });
  }
  return {
    name: SETUP_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: [DEFAULT_BRANCH_REF], exclude: [] } },
    rules,
  };
}

const ruleOf = (ruleset, type) => (Array.isArray(ruleset && ruleset.rules) ? ruleset.rules.find((r) => r && r.type === type) : undefined);
const paramsOf = (rule) => (rule && isObject(rule.parameters) ? rule.parameters : {});
const checksOf = (rule) => (Array.isArray(paramsOf(rule).required_status_checks) ? paramsOf(rule).required_status_checks : []);
const approvalsOf = (rule) => {
  const n = paramsOf(rule).required_approving_review_count;
  return Number.isInteger(n) ? n : 0;
};
const includeOf = (ruleset) => {
  const include = isObject(ruleset && ruleset.conditions) && isObject(ruleset.conditions.ref_name) ? ruleset.conditions.ref_name.include : undefined;
  return Array.isArray(include) ? include : [];
};

/**
 * Does `existing` already do everything `desired` asks (it may do more)? True when the ruleset is active and
 * targets branches, its include list names `~DEFAULT_BRANCH`, every desired rule type is present, approvals are at
 * least the desired count, and every desired required context is present (pinned to the same App when the desired
 * one pins). Extra rules, extra contexts, tuned merge-queue numbers and bypass actors are the user's and never
 * count against it. A ruleset that is not `active` enforces nothing, so it does not satisfy.
 */
function rulesetSatisfies(existing, desired) {
  if (!isObject(existing) || !Array.isArray(existing.rules)) return false;
  if (existing.enforcement !== 'active') return false;
  if (existing.target !== undefined && existing.target !== desired.target) return false;
  if (!includeOf(existing).includes(DEFAULT_BRANCH_REF)) return false;

  for (const want of desired.rules) {
    const have = ruleOf(existing, want.type);
    if (!have) return false;
    if (want.type === 'pull_request' && approvalsOf(have) < approvalsOf(want)) return false;
    if (want.type === 'required_status_checks') {
      const present = checksOf(have);
      for (const check of checksOf(want)) {
        const found = present.find((c) => c && c.context === check.context);
        if (!found) return false;
        if (check.integration_id !== undefined && found.integration_id !== check.integration_id) return false;
      }
    }
  }
  return true;
}

/**
 * The body an `update` PUTs: the existing ruleset with whatever `desired` needs added, never anything removed.
 * Existing rules keep their order and parameters (approvals only ever rise, a user's strict policy, extra
 * contexts and bypass actors stay), missing desired rules follow in the desired order, `~DEFAULT_BRANCH` joins the
 * include list, and enforcement becomes `active`. Only the writable fields are returned (no id or server metadata),
 * and `existing` is never mutated. With no existing ruleset the union is a copy of `desired`.
 */
function unionRuleset(existing, desired) {
  if (!isObject(existing)) return clone(desired);

  const rules = (Array.isArray(existing.rules) ? existing.rules : []).map(clone);
  for (const want of desired.rules) {
    const at = rules.findIndex((r) => r && r.type === want.type);
    if (at < 0) {
      rules.push(clone(want));
    } else if (want.type === 'pull_request') {
      const params = { ...clone(want.parameters), ...paramsOf(rules[at]) };
      params.required_approving_review_count = Math.max(approvalsOf(rules[at]), approvalsOf(want));
      rules[at] = { ...rules[at], parameters: params };
    } else if (want.type === 'required_status_checks') {
      const checks = checksOf(rules[at]).map(clone);
      for (const check of checksOf(want)) {
        const found = checks.find((c) => c && c.context === check.context);
        if (!found) checks.push(clone(check));
        else if (check.integration_id !== undefined) found.integration_id = check.integration_id;
      }
      rules[at] = { ...rules[at], parameters: { ...clone(want.parameters), ...paramsOf(rules[at]), required_status_checks: checks } };
    }
    // every other rule type: the user's copy stays exactly as it is
  }

  const include = includeOf(existing).slice();
  if (!include.includes(DEFAULT_BRANCH_REF)) include.push(DEFAULT_BRANCH_REF);
  const refName = isObject(existing.conditions) && isObject(existing.conditions.ref_name) ? existing.conditions.ref_name : {};
  return {
    name: desired.name,
    target: existing.target || desired.target,
    enforcement: 'active',
    bypass_actors: Array.isArray(existing.bypass_actors) ? clone(existing.bypass_actors) : clone(desired.bypass_actors),
    conditions: {
      ...(isObject(existing.conditions) ? clone(existing.conditions) : {}),
      ref_name: { ...clone(refName), include, exclude: Array.isArray(refName.exclude) ? clone(refName.exclude) : [] },
    },
    rules,
  };
}

module.exports = {
  SETUP_RULESET_NAME,
  desiredRuleset,
  rulesetSatisfies,
  unionRuleset,
};
