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
// The apply half (TRD 50-11) consumes the actions this module produces:
//
//   renderTemplates(cfg, ver)     the two local files with {{checks_workflow}} / {{devflow_ref}} filled in  (impure: reads templates)
//   applySetup(root, actions, d)  actions -> outcomes; GitHub writes via gh-client.ghWrite, local files via fs
//
// An action is `{kind, target, status, desc, payload?, request?, file?}`:
//
//   status   create | update | exists | skip | manual | conflict | advisory
//   payload  the data a create/update sends (an object, for the dry-run to print)
//   request  `{args, input?}`: the gh argv and the exact stdin (`--input -`, compact JSON text) the apply step
//            sends through gh-client, so the dry-run prints exactly what apply sends
//   file     `{path, content}` for a local file the apply step writes into the working tree (never committed)
//
// The read and plan functions never write anything. `applySetup` is the one writer: every GitHub write goes through
// `client.ghWrite` with the action's own `request` (what the dry-run printed is what is sent), and the seam guard lists
// this module as guarded but not in NO_DIRECT_WRITE for that reason.

const { CONTEXTS } = require('./gh-check.cjs');
const fs = require('fs');
const path = require('path');
const client = require('./gh-client.cjs');
const capability = require('./gh-capability.cjs');
const ghProject = require('./gh-project.cjs');
const outbox = require('./gh-outbox.cjs');

// ─── The desired default-branch ruleset ───────────────────────────────────────

/** The one ruleset setup manages. Renaming it orphans every ruleset already created under the old name. */
const SETUP_RULESET_NAME = 'devflow: default branch';

const DEFAULT_BRANCH_REF = '~DEFAULT_BRANCH';
const MERGE_METHODS = ['MERGE', 'SQUASH', 'REBASE'];
const DEFAULT_MERGE_METHOD = 'SQUASH';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Repository admins may bypass the ruleset (55-01). The workflow pull request cannot pass checks that only exist once
 * it is merged, and with `bypass_actors: []` GitHub reports `current_user_can_bypass: never`: nothing could merge it.
 * `always` is the mode verified live against a ruleset with a merge_queue rule. Role id 5 is "Repository admin".
 */
const ADMIN_BYPASS = Object.freeze({ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' });
/** The repository-admin role, in any bypass_mode: the actor is compared, never the mode (a team may tighten it). */
const isAdminBypass = (a) => isObject(a) && a.actor_type === 'RepositoryRole' && Number(a.actor_id) === ADMIN_BYPASS.actor_id;

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
    bypass_actors: [clone(ADMIN_BYPASS)],
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
 * one pins). Extra rules, extra contexts, tuned merge-queue numbers and extra bypass actors are the user's and never
 * count against it. A ruleset that is not `active` enforces nothing, so it does not satisfy. One bypass actor is
 * needed, not optional (55-01): the repository-admin role, in any `bypass_mode`. Without it nobody can merge the
 * workflow pull request. The mode is never compared, so a team that tightened it to `pull_request` is not rewritten.
 */
function rulesetSatisfies(existing, desired) {
  if (!isObject(existing) || !Array.isArray(existing.rules)) return false;
  if (existing.enforcement !== 'active') return false;
  if (existing.target !== undefined && existing.target !== desired.target) return false;
  if (!includeOf(existing).includes(DEFAULT_BRANCH_REF)) return false;
  if (!(Array.isArray(existing.bypass_actors) ? existing.bypass_actors : []).some(isAdminBypass)) return false;

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
 * include list, and enforcement becomes `active`. Bypass actors are still the user's and are never removed or
 * reordered, but the repository-admin entry is something DevFlow needs (55-01): when none is listed, in any mode, a
 * copy of `ADMIN_BYPASS` is appended after the user's actors, once. Only the writable fields are returned (no id or
 * server metadata, so `current_user_can_bypass` never reaches a PUT), and `existing` is never mutated. With no
 * existing ruleset the union is a copy of `desired`.
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
  const bypassActors = Array.isArray(existing.bypass_actors) ? clone(existing.bypass_actors) : [];
  if (!bypassActors.some(isAdminBypass)) bypassActors.push(clone(ADMIN_BYPASS));
  return {
    name: desired.name,
    target: existing.target || desired.target,
    enforcement: 'active',
    bypass_actors: bypassActors,
    conditions: {
      ...(isObject(existing.conditions) ? clone(existing.conditions) : {}),
      ref_name: { ...clone(refName), include, exclude: Array.isArray(refName.exclude) ? clone(refName.exclude) : [] },
    },
    rules,
  };
}

// ─── planSetup ────────────────────────────────────────────────────────────────

const WORKFLOW_PATH = '.github/workflows/devflow.yml';
const PR_TEMPLATE_PATH = '.github/pull_request_template.md';
const MANAGED_HEADER = /^#\s*devflow:managed\b/;
const PR_START = '<!-- devflow:pr-template:start -->';
const PR_END = '<!-- devflow:pr-template:end -->';

// Issue fields need this dated header on create (50-RESEARCH, State of the Art).
const ISSUE_FIELDS_API_VERSION = '2026-03-10';

// Same colour and description as gh-outbox-flush's ensureLabel, so a label made here and one made on first use look alike.
const LABEL_COLOR = '1d76db';
const LABEL_DESCRIPTION = 'DevFlow tracking';

const TYPE_COLORS = Object.freeze({ Objective: 'purple', TRD: 'blue', Decision: 'yellow', Debug: 'red', Quick: 'gray' });

// Open Question 3 (LOW confidence, unverified against the live API): the option shape. Applying retries as `text`
// on a 422 (TRD 50-11), so a wrong guess here degrades to body metadata rather than failing setup.
const FIELD_OPTIONS = Object.freeze({
  work: ['feature', 'port', 'refactor', 'foundation', 'bugfix', 'prototype', 'spike'],
  kind: ['api', 'app', 'library', 'ui-lib', 'cli', 'plugin'],
});
const FIELD_DESCRIPTIONS = Object.freeze({ work: 'DevFlow work type', kind: 'DevFlow project kind' });

const REPO_SETTINGS = Object.freeze({ has_wiki: true, delete_branch_on_merge: true });

const action = (kind, target, status, desc, extra = {}) => ({ kind, target, status, desc, ...extra });

/** `gh api -X <method> <endpoint> [-H h]... --input -` plus the compact JSON that goes to stdin. */
function apiRequest(method, endpoint, payload, headers = []) {
  return {
    args: ['api', '-X', method, endpoint, ...headers.flatMap((h) => ['-H', h]), '--input', '-'],
    input: JSON.stringify(payload),
  };
}

/** The label names setup ensures: the role labels (objective, trd, decision, todo, debug, quick), then any other configured one. */
function labelNames(github) {
  const configured = isObject(github) && isObject(github.labels) ? github.labels : {};
  const defaults = {
    objective: 'devflow:objective',
    trd: 'devflow:trd',
    decision: 'devflow:decision',
    ...Object.fromEntries(Object.entries(outbox.ENTITY_ROLES).map(([role, def]) => [role, def.label])),
  };
  const names = Object.entries(defaults).map(([role, def]) => (typeof configured[role] === 'string' && configured[role] !== '' ? configured[role] : def));
  for (const [role, value] of Object.entries(configured)) {
    if (!Object.hasOwn(defaults, role) && typeof value === 'string' && value !== '') names.push(value);
  }
  return [...new Set(names)];
}

/**
 * The degraded sentence of gh-capability for `key` ('types' | 'fields') on a repo whose org endpoints cannot be used
 * (a User owner, or an organization whose endpoint did not answer): one source for the text `outbox status` prints.
 */
function degradedSentence(state, key) {
  const caps = {
    repo: state.repo,
    owner_type: state.ownerType || 'unknown',
    push: true,
    org_types: { available: false, enabled: [] },
    issue_fields: { available: false, ids: {} },
    sub_issues: 'ok',
    dependencies: 'ok',
    wiki: 'ok',
  };
  const keys = capability.resolveModes(caps).degraded;
  return capability.describeDegraded(caps)[keys.indexOf(key)];
}

function planRepoSettings(state) {
  const meta = isObject(state.meta) ? state.meta : {};
  const payload = {};
  for (const [key, want] of Object.entries(REPO_SETTINGS)) if (meta[key] !== want) payload[key] = want;
  const target = `repos/${state.repo}`;
  if (Object.keys(payload).length === 0) return [action('repo-settings', target, 'exists', 'wiki enabled and head branches deleted after merge')];
  // Nothing set up yet reads as create; a repository that already has one of the two settings reads as update.
  const status = Object.keys(payload).length === Object.keys(REPO_SETTINGS).length ? 'create' : 'update';
  return [action('repo-settings', target, status, `set ${Object.keys(payload).join(' and ')} to true`, {
    payload,
    request: apiRequest('PATCH', target, payload),
  })];
}

function planLabels(state) {
  const have = new Set((Array.isArray(state.labels) ? state.labels : []).map((n) => String(n).toLowerCase()));
  return labelNames(state.github).map((name) => (have.has(name.toLowerCase())
    ? action('label', name, 'exists', `label ${name} exists`)
    : action('label', name, 'create', `create label ${name}`, {
      request: { args: ['label', 'create', name, '--repo', state.repo, '--color', LABEL_COLOR, '--description', LABEL_DESCRIPTION] },
    })));
}

function planIssueTypes(state) {
  if (state.ownerType !== 'Organization' || !Array.isArray(state.types)) {
    return [action('issue-type', 'all', 'skip', degradedSentence(state, 'types'))];
  }
  const endpoint = `orgs/${state.owner}/issue-types`;
  return [...capability.REQUIRED_TYPES, ...capability.OPTIONAL_TYPES].map((name) => {
    const found = state.types.find((t) => t && t.name === name);
    if (!found) {
      const payload = { name, is_enabled: true, description: `DevFlow ${name.toLowerCase()} issue`, color: TYPE_COLORS[name] };
      return action('issue-type', name, 'create', `create the ${name} issue type`, { payload, request: apiRequest('POST', endpoint, payload) });
    }
    if (found.is_enabled !== false) return action('issue-type', name, 'exists', `issue type ${name} is enabled`);
    if (found.id === undefined || found.id === null) {
      return action('issue-type', name, 'skip', `issue type ${name} is disabled but its id is unknown, so it cannot be enabled`);
    }
    const payload = { name, is_enabled: true };
    return action('issue-type', name, 'update', `enable the ${name} issue type`, {
      payload,
      request: apiRequest('PUT', `${endpoint}/${encodeURIComponent(String(found.id))}`, payload),
    });
  });
}

function planIssueFields(state) {
  if (state.ownerType !== 'Organization' || !Array.isArray(state.fields)) {
    return [action('issue-field', 'all', 'skip', degradedSentence(state, 'fields'))];
  }
  const endpoint = capability.ISSUE_FIELDS_PATH.replace('{owner}', state.owner);
  return capability.REQUIRED_FIELDS.map((name) => {
    const found = state.fields.find((f) => f && typeof f.name === 'string' && f.name.toLowerCase() === name);
    if (found) return action('issue-field', name, 'exists', `issue field ${name} exists${found.data_type ? ` (${found.data_type})` : ''}`);
    const payload = {
      name,
      data_type: 'single_select',
      description: FIELD_DESCRIPTIONS[name],
      options: FIELD_OPTIONS[name].map((option, i) => ({ name: option, color: 'gray', priority: i + 1 })),
    };
    return action('issue-field', name, 'create', `create the ${name} issue field (single select: ${FIELD_OPTIONS[name].join(', ')})`, {
      payload,
      request: apiRequest('POST', endpoint, payload, [`X-GitHub-Api-Version: ${ISSUE_FIELDS_API_VERSION}`]),
    });
  });
}

const localText = (state, key) => (isObject(state.local) && typeof state.local[key] === 'string' ? state.local[key] : null);

function planWorkflow(state) {
  const want = state.templates.workflow;
  const have = localText(state, 'workflow');
  if (have === null) {
    return action('workflow', WORKFLOW_PATH, 'create', 'add the DevFlow checks workflow', { file: { path: WORKFLOW_PATH, content: want } });
  }
  if (have === want) return action('workflow', WORKFLOW_PATH, 'exists', 'the DevFlow checks workflow is current');
  if (have.split(/\r?\n/).slice(0, 5).some((line) => MANAGED_HEADER.test(line))) {
    return action('workflow', WORKFLOW_PATH, 'update', 'refresh the managed DevFlow checks workflow', { file: { path: WORKFLOW_PATH, content: want } });
  }
  return action('workflow', WORKFLOW_PATH, 'conflict',
    `${WORKFLOW_PATH} exists without the "# devflow:managed" header, so it is left alone; merge the DevFlow checks workflow into it by hand or remove it and re-run`);
}

/** The managed PR-template block: the template text from its start marker to its end marker (markers added when absent). */
function managedBlock(text) {
  const start = text.indexOf(PR_START);
  const end = text.indexOf(PR_END);
  if (start >= 0 && end > start) return text.slice(start, end + PR_END.length);
  return `${PR_START}\n${text.replace(/^\n+/, '').replace(/\s+$/, '')}\n${PR_END}`;
}

function planPrTemplate(state) {
  const block = managedBlock(state.templates.prTemplate);
  const have = localText(state, 'prTemplate');
  const write = (content) => ({ file: { path: PR_TEMPLATE_PATH, content } });
  if (have === null) return action('pr-template', PR_TEMPLATE_PATH, 'create', 'add the pull request template', write(`${block}\n`));
  const start = have.indexOf(PR_START);
  const end = start >= 0 ? have.indexOf(PR_END, start) : -1;
  if (start >= 0 && end > start) {
    if (have.slice(start, end + PR_END.length) === block) return action('pr-template', PR_TEMPLATE_PATH, 'exists', 'the DevFlow block of the pull request template is current');
    return action('pr-template', PR_TEMPLATE_PATH, 'update', 'refresh the DevFlow block of the pull request template, leaving the rest of the file alone',
      write(`${have.slice(0, start)}${block}${have.slice(end + PR_END.length)}`));
  }
  const kept = have.replace(/\s+$/, '');
  return action('pr-template', PR_TEMPLATE_PATH, 'update', 'append the DevFlow block to the existing pull request template',
    write(kept === '' ? `${block}\n` : `${kept}\n\n${block}\n`));
}

function planRuleset(state) {
  const gh = isObject(state.github) ? state.github : {};
  const pr = isObject(gh.pr) ? gh.pr : {};
  const queueRejected = isObject(state.record) && state.record.merge_queue === false;
  const desired = desiredRuleset({ mergeMethod: pr.merge_method, appId: gh.app_id, mergeQueue: !queueRejected });
  const base = `repos/${state.repo}/rulesets`;
  const target = SETUP_RULESET_NAME;

  let main;
  if (!Array.isArray(state.rulesets)) {
    const why = isObject(state.readErrors) && state.readErrors.rulesets ? ` (${state.readErrors.rulesets})` : '';
    main = action('ruleset', target, 'skip', `the repository's rulesets could not be read${why}, so the default-branch ruleset was not planned`);
  } else {
    const existing = state.rulesets.find((r) => r && r.name === SETUP_RULESET_NAME);
    if (!existing) {
      main = action('ruleset', target, 'create', 'create the default-branch ruleset', { payload: desired, request: apiRequest('POST', base, desired) });
    } else if (!Array.isArray(existing.rules)) {
      main = action('ruleset', target, 'skip', `ruleset ${existing.id} exists but its rules could not be read, so it is left alone`);
    } else if (rulesetSatisfies(existing, desired)) {
      main = action('ruleset', target, 'exists', `ruleset ${existing.id} already enforces what DevFlow needs`);
    } else {
      const payload = unionRuleset(existing, desired);
      main = action('ruleset', target, 'update',
        `update ruleset ${existing.id} to add what DevFlow needs (its other rules, contexts, approvals and bypass actors are kept; the repository-admin bypass is added when missing)`,
        { payload, request: apiRequest('PUT', `${base}/${encodeURIComponent(String(existing.id))}`, payload) });
    }
  }

  const out = [main];
  if (positiveInt(gh.app_id) === null) {
    out.push(action('advisory', 'ruleset', 'advisory',
      'required checks are not pinned to an App; anyone with write access can post these contexts (set github.app_id to pin them)'));
  }
  if (queueRejected) {
    out.push(action('advisory', 'ruleset', 'advisory',
      'merge queue unavailable on this repository (the ruleset was rejected with a merge_queue rule), so it is left out; run setup with --refresh to try again'));
  }
  return out;
}

function planWiki(state) {
  const url = `https://github.com/${state.repo}/wiki`;
  switch (state.wiki) {
    case 'ok':
      return action('wiki', 'wiki', 'exists', 'the wiki has its first page');
    case 'uninitialised':
      return action('wiki', 'wiki', 'manual', `create the first wiki page in the web UI (${url}); wiki pushes are blocked until then`);
    case 'disabled':
      return action('wiki', 'wiki', 'skip', 'the wiki is disabled; the repository-settings action enables it (has_wiki), then create the first wiki page in the web UI');
    case 'unavailable':
      return action('wiki', 'wiki', 'skip', 'the wiki could not be reached; DevFlow writes wiki pages to docs/devflow/ in the working tree');
    default:
      return action('wiki', 'wiki', 'skip', 'the wiki state could not be determined');
  }
}

/** Another workflow that names a required check but never runs on merge_group would leave the merge queue waiting forever. */
function planMergeGroup(state) {
  const others = isObject(state.local) && Array.isArray(state.local.otherWorkflows) ? state.local.otherWorkflows : [];
  const out = [];
  for (const wf of others) {
    if (!wf || typeof wf.text !== 'string') continue;
    const named = [CONTEXTS.linkedIssue, CONTEXTS.planningConsistency].filter((c) => wf.text.includes(c));
    if (named.length > 0 && !wf.text.includes('merge_group')) {
      out.push(action('advisory', wf.file, 'advisory',
        `${wf.file} names ${named.join(' and ')} but has no merge_group trigger, so the merge queue never receives the check; add \`merge_group:\` to its \`on:\` (setup never rewrites it)`));
    }
  }
  return out;
}

/**
 * The ordered action list for a repository, from a state snapshot (`readSetupState`'s `state`, plus the rendered
 * `templates` the apply layer supplies). Pure: it reads nothing, writes nothing and mutates nothing.
 *
 * Order: repo settings, labels, issue types, issue fields, workflow file, PR template, ruleset (and its advisories),
 * the wiki check, then one advisory per other workflow that names a required check without a merge_group trigger.
 *
 * @param {{repo:string, owner?:string, ownerType:string, meta?:object, github?:object, rulesets:object[]|null,
 *   labels:string[]|null, types:object[]|null, fields:object[]|null, wiki:string, local?:object,
 *   templates:{workflow:string, prTemplate:string}, record?:object, readErrors?:object}} state
 */
function planSetup(state) {
  if (!isObject(state)) throw new TypeError('planSetup needs a state snapshot');
  if (!isObject(state.templates) || typeof state.templates.workflow !== 'string' || typeof state.templates.prTemplate !== 'string') {
    throw new TypeError('planSetup needs state.templates {workflow, prTemplate}: the rendered text of the two local files');
  }
  const s = state.owner ? state : { ...state, owner: String(state.repo).split('/')[0] };
  return [
    ...planRepoSettings(s),
    ...planLabels(s),
    ...planIssueTypes(s),
    ...planIssueFields(s),
    planWorkflow(s),
    planPrTemplate(s),
    ...planRuleset(s),
    planWiki(s),
    ...planMergeGroup(s),
  ];
}

// ─── renderPlan ───────────────────────────────────────────────────────────────

const STATUS_ORDER = ['create', 'update', 'exists', 'skip', 'manual', 'conflict', 'advisory'];

/** An argv word as a shell would need it written, so the printed `gh ...` line can be pasted. */
function shellWord(arg) {
  const text = String(arg);
  return /^[A-Za-z0-9_./:=@%+,~-]+$/.test(text) ? text : `'${text.replace(/'/g, '\'\\\'\'')}'`;
}

const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * The dry-run text: one line per action (`[status] kind target - desc`) and, under every create or update, the gh
 * command that apply will run, its exact JSON body (pretty-printed) and the local file it will write. Pure.
 */
function renderPlan(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return 'No setup actions.\n';
  const lines = ['DevFlow repository setup plan', ''];
  for (const a of actions) {
    lines.push(`[${a.status}] ${a.kind} ${a.target} - ${a.desc}`);
    if (a.status !== 'create' && a.status !== 'update') continue;
    if (a.request) lines.push(`    gh ${a.request.args.map(shellWord).join(' ')}`);
    if (a.payload !== undefined) {
      for (const l of JSON.stringify(a.payload, null, 2).split('\n')) lines.push(`    ${l}`);
    }
    if (a.file) lines.push(`    write ${a.file.path} (${lineCount(a.file.content)} lines)`);
  }
  const counts = STATUS_ORDER
    .map((status) => [status, actions.filter((a) => a.status === status).length])
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`);
  lines.push('', `Plan: ${actions.length} action${actions.length === 1 ? '' : 's'} (${counts.join(', ')})`);
  return `${lines.join('\n')}\n`;
}

// ─── readSetupState ───────────────────────────────────────────────────────────

/**
 * Where setup remembers what it learned about a repository (written by TRD 50-11, read here): `{merge_queue:false}`
 * after a repository refused a merge_queue rule. `<gh cache dir>/setup/<owner>__<repo>.json`, never inside the repo.
 */
function setupRecordPath(repo, env = process.env) {
  const name = String(repo).split('/').map((seg) => seg.replace(/[^A-Za-z0-9_.-]/g, '_')).join('__');
  return path.join(ghProject.cacheDir(env), 'setup', `${name}.json`);
}

function readSetupRecord(repo, env) {
  try {
    const parsed = JSON.parse(fs.readFileSync(setupRecordPath(repo, env), 'utf-8'));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The text of a failed gh call on one line, for a `readErrors` entry (it carries the HTTP status). */
const failureOf = (r) => String((r && (r.error || r.stderr || r.stdout)) || 'gh api failed').trim().replace(/\s+/g, ' ');

/** A local file's text, or null when it is absent or unreadable. */
function readLocal(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf-8');
  } catch {
    return null;
  }
}

/** Every `.github/workflows/*.yml|yaml` except DevFlow's own, sorted by name, as `{file, text}`. */
function readOtherWorkflows(root) {
  let names;
  try {
    names = fs.readdirSync(path.join(root, '.github', 'workflows'));
  } catch {
    return [];
  }
  return names
    .filter((n) => /\.ya?ml$/i.test(n) && `.github/workflows/${n}` !== WORKFLOW_PATH)
    .sort()
    .map((n) => ({ file: `.github/workflows/${n}`, text: readLocal(root, `.github/workflows/${n}`) }))
    .filter((w) => w.text !== null);
}

/** Our ruleset read by id, so its rules are in hand: the list endpoint returns summaries only. */
function readRulesets(repo, readErrors) {
  const listed = client.ghPaginate(`repos/${repo}/rulesets`);
  if (!listed.ok) {
    readErrors.rulesets = failureOf(listed);
    return null;
  }
  return listed.items.map((summary) => {
    if (!summary || summary.name !== SETUP_RULESET_NAME || summary.id === undefined) return summary;
    const full = client.ghRead(['api', `repos/${repo}/rulesets/${summary.id}`]);
    let body = null;
    if (full.ok) {
      try {
        body = JSON.parse(full.stdout);
      } catch {
        body = null;
      }
    }
    if (isObject(body) && Array.isArray(body.rules)) return { ...summary, ...body };
    readErrors.ruleset = failureOf(full.ok ? { error: 'unparseable ruleset body' } : full);
    return summary;
  });
}

/** One org list (issue types or fields) reduced to the keys setup needs; null with a `readErrors` reason on failure. */
function readOrgList(apiPath, keys, readErrors, label) {
  const listed = client.ghPaginate(apiPath);
  if (!listed.ok) {
    readErrors[label] = failureOf(listed);
    return null;
  }
  return listed.items
    .filter(isObject)
    .map((row) => Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])));
}

/**
 * Snapshot what the repository has, with gh READS only (zero writes, zero git): the repository settings, the
 * rulesets (our own with its full body), the labels, the org's issue types and fields (Organization owners only),
 * the capability probe (always live, `refresh:true`: setup changes the answer), the local workflow files, the setup
 * record and the github config. A read that fails (a 403 on rulesets, types or fields) becomes a `null` with the
 * reason in `readErrors`, which `planSetup` turns into a `skip`; only an unreadable repository fails the whole read.
 * `refresh` ignores the setup record. The rendered `templates` are not read here: the apply layer passes them to
 * `planSetup` beside this state.
 *
 * @returns {{ok:true, state:object} | {ok:false, error:string} | {ok:false, skipped:true, reason:string, error:string}}
 */
function readSetupState(root, { refresh = false, env = process.env } = {}) {
  const gate = client.requireEnabled(root);
  if (gate.skipped) return { ok: false, skipped: true, reason: gate.reason, error: gate.reason };
  const repo = gate.repo;
  const [owner, name] = repo.split('/');

  const metaRead = client.ghRead(['api', `repos/${repo}`]);
  if (!metaRead.ok) {
    const text = failureOf(metaRead);
    return { ok: false, error: /HTTP 404/.test(text) ? `repository ${repo} not found or not accessible` : `repository ${repo}: ${text}` };
  }
  let data;
  try {
    data = JSON.parse(metaRead.stdout);
  } catch {
    data = null;
  }
  if (!isObject(data)) return { ok: false, error: `repository ${repo}: unparseable answer from gh` };

  const caps = capability.detectCapabilities(root, { refresh: true, env });
  if (!caps.ok) return { ok: false, error: caps.error };

  const ownerType = isObject(data.owner) && typeof data.owner.type === 'string' ? data.owner.type : caps.owner_type;
  const readErrors = {};
  const rulesets = readRulesets(repo, readErrors);

  const labelList = client.ghPaginate(`repos/${repo}/labels`);
  if (!labelList.ok) readErrors.labels = failureOf(labelList);
  const labels = labelList.ok ? labelList.items.filter((l) => isObject(l) && typeof l.name === 'string').map((l) => l.name) : null;

  let types = null;
  let fields = null;
  if (ownerType === 'Organization') {
    types = readOrgList(`orgs/${owner}/issue-types`, ['id', 'name', 'is_enabled'], readErrors, 'types');
    fields = readOrgList(capability.ISSUE_FIELDS_PATH.replace('{owner}', owner), ['id', 'name', 'data_type'], readErrors, 'fields');
  }

  return {
    ok: true,
    state: {
      repo,
      owner,
      name,
      ownerType,
      meta: {
        has_wiki: data.has_wiki === true,
        delete_branch_on_merge: data.delete_branch_on_merge === true,
        default_branch: typeof data.default_branch === 'string' && data.default_branch ? data.default_branch : 'main',
        private: data.private === true,
      },
      github: gate.config,
      capabilities: caps,
      rulesets,
      labels,
      types,
      fields,
      wiki: caps.wiki,
      wikiDetail: caps.wiki_detail || null,
      local: {
        workflow: readLocal(root, WORKFLOW_PATH),
        prTemplate: readLocal(root, PR_TEMPLATE_PATH),
        otherWorkflows: readOtherWorkflows(root),
      },
      record: refresh ? {} : readSetupRecord(repo, env),
      readErrors,
    },
  };
}

// ─── renderTemplates ──────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates', 'github');
const DEFAULT_CHECKS_WORKFLOW = 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml';

/**
 * The two local files setup writes, rendered from `templates/github/` (read relative to this module, so the plugin
 * checkout and the home mirror both work). `{{checks_workflow}}` is `github.checks_workflow`, or the DevFlow reusable
 * workflow pinned to `v<version>` when that is unset or empty; `{{devflow_ref}}` is `v<version>`. GitHub's own `${{ ... }}`
 * expressions are left alone, and a value containing `$&` is inserted literally.
 *
 * @param {object} [cfg] the `github` block of .planning/config.json
 * @param {string} version the plugin version (`2.12.0` or `v2.12.0`)
 * @returns {{workflow:string, prTemplate:string}}
 */
function renderTemplates(cfg, version) {
  if (typeof version !== 'string' || version.trim() === '') throw new TypeError('renderTemplates needs the plugin version');
  const github = isObject(cfg) ? cfg : {};
  const ref = `v${version.trim().replace(/^v/, '')}`;
  const configured = typeof github.checks_workflow === 'string' ? github.checks_workflow.trim() : '';
  const values = { checks_workflow: configured !== '' ? configured : `${DEFAULT_CHECKS_WORKFLOW}@${ref}`, devflow_ref: ref };
  const fill = (body) => body.replace(/\{\{\s*(checks_workflow|devflow_ref)\s*\}\}/g, (_match, key) => values[key]);
  return {
    workflow: fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'devflow.yml'), 'utf-8')),
    prTemplate: fill(fs.readFileSync(path.join(TEMPLATE_DIR, 'pull_request_template.md'), 'utf-8')),
  };
}

// ─── applySetup ───────────────────────────────────────────────────────────────

const ORG_ONLY_NOTE = 'needs an organization owner; DevFlow uses labels and body metadata';
const MERGE_QUEUE_NOTE = 'merge queue unavailable on this plan; the ruleset was applied without it (setup --refresh tries again)';

/** The HTTP status `gh api` prints on failure (`gh: Not Found (HTTP 404)`), or null. */
function httpStatus(r) {
  const m = /HTTP (\d{3})/.exec(`${(r && r.stderr) || ''}\n${(r && r.stdout) || ''}`);
  return m ? Number(m[1]) : null;
}

const send = (request) => client.ghWrite(request.args, { input: request.input });

/** What the apply step remembers about a repository: written after a merge_queue rejection, deleted by `--refresh`. */
function writeSetupRecord(repo, record, env) {
  const file = setupRecordPath(repo, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record)}\n`);
}

/** Write a planned local file into the working tree (never committed). Refuses a path that leaves the project. */
function writeLocalFile(root, file) {
  const base = path.resolve(root);
  const abs = path.resolve(base, file.path);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) throw new Error(`${file.path} is outside the project`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.content);
}

/**
 * Send one create/update request. A 422 on a merge_queue rule retries the same request without it; a 422 on a single
 * select field retries it as `text`; a 403/404 on an org endpoint is a skip; anything else is a failure. Returns the
 * outcome fields (status, degraded?, note?, error?) and, when a merge_queue rule was dropped, `mergeQueueDropped`.
 */
function applyRequest(a) {
  const done = a.status === 'create' ? 'created' : 'updated';
  const r = send(a.request);
  if (r.ok) return { status: done };
  const code = httpStatus(r);
  const retry = (payload) => send({ args: a.request.args, input: JSON.stringify(payload) });
  const failed = (res) => ({ status: 'failed', error: failureOf(res) });

  if (a.kind === 'ruleset' && code === 422 && isObject(a.payload) && Array.isArray(a.payload.rules)
    && a.payload.rules.some((rule) => rule && rule.type === 'merge_queue')) {
    const second = retry({ ...a.payload, rules: a.payload.rules.filter((rule) => !(rule && rule.type === 'merge_queue')) });
    return second.ok ? { status: done, degraded: true, note: MERGE_QUEUE_NOTE, mergeQueueDropped: true } : failed(second);
  }
  if (a.kind === 'issue-field' && code === 422 && isObject(a.payload) && Array.isArray(a.payload.options)) {
    const { options: _options, ...rest } = a.payload;
    const second = retry({ ...rest, data_type: 'text' });
    return second.ok
      ? { status: done, degraded: true, note: `field ${a.target} created as text: single-select options were not accepted` }
      : failed(second);
  }
  if ((a.kind === 'issue-type' || a.kind === 'issue-field') && (code === 403 || code === 404)) {
    return { status: 'skipped', note: ORG_ONLY_NOTE };
  }
  // Someone else made the label between the read and this write: the goal is met.
  if (a.kind === 'label' && /already exists/i.test(`${r.stderr || ''}\n${r.stdout || ''}`)) return { status: 'exists' };
  return failed(r);
}

const PASS_THROUGH = Object.freeze({ exists: 'exists', skip: 'skipped', manual: 'manual', conflict: 'conflict', advisory: 'advisory' });

/**
 * Execute a setup plan. Every action is attempted in the plan's order, even after a failure, and each gets one outcome
 * `{kind, target, status, degraded?, note?, error?}` with status `created | updated | exists | skipped | manual |
 * conflict | advisory | failed`. `ok` is false when any outcome is `failed` or `conflict`; degradations (a dropped merge
 * queue, a text field, a skipped org write) and advisories do not fail the run. A conflicting local file is never touched.
 * A merge_queue rejection is recorded at `setupRecordPath(repo)` so the next plan leaves the rule out; `refresh` deletes
 * that record first.
 *
 * @param {string} root the project directory (local files are written under it)
 * @param {object[]} actions the output of planSetup
 * @param {{repo?:string, refresh?:boolean, now?:()=>(string|number), env?:object}} [deps]
 * @returns {{ok:boolean, outcomes:object[]}}
 */
function applySetup(root, actions, deps = {}) {
  if (!Array.isArray(actions)) throw new TypeError('applySetup needs the action list from planSetup');
  const env = deps.env || process.env;
  const gate = deps.repo ? null : client.requireEnabled(root);
  const repo = deps.repo || (gate && gate.repo) || null;
  const stamp = () => {
    const v = typeof deps.now === 'function' ? deps.now() : client.now();
    return typeof v === 'string' ? v : new Date(v).toISOString();
  };
  if (deps.refresh && repo) fs.rmSync(setupRecordPath(repo, env), { force: true });

  const outcomes = [];
  for (const a of actions) {
    const outcome = { kind: a.kind, target: a.target };
    if (a.status === 'create' || a.status === 'update') {
      let r;
      if (a.file) {
        try {
          writeLocalFile(root, a.file);
          r = { status: a.status === 'create' ? 'created' : 'updated' };
        } catch (e) {
          r = { status: 'failed', error: e.message };
        }
      } else if (a.request) {
        r = applyRequest(a);
      } else {
        r = { status: 'failed', error: 'the plan carried neither a request nor a file' };
      }
      if (r.mergeQueueDropped && repo) writeSetupRecord(repo, { merge_queue: false, at: stamp() }, env);
      const { mergeQueueDropped: _dropped, ...fields } = r;
      Object.assign(outcome, fields);
    } else {
      outcome.status = PASS_THROUGH[a.status] || 'skipped';
      if (outcome.status !== 'exists') outcome.note = a.desc;
    }
    outcomes.push(outcome);
  }
  return { ok: outcomes.every((o) => o.status !== 'failed' && o.status !== 'conflict'), outcomes };
}

module.exports = {
  SETUP_RULESET_NAME,
  ADMIN_BYPASS,
  WORKFLOW_PATH,
  PR_TEMPLATE_PATH,
  desiredRuleset,
  rulesetSatisfies,
  unionRuleset,
  planSetup,
  renderPlan,
  setupRecordPath,
  readSetupState,
  renderTemplates,
  applySetup,
};
