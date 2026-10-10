'use strict';

/**
 * Hand-written builders for scripts/ruleset-check.test.cjs (TRD 74-03).
 *
 * Nothing here talks to GitHub. The approved ruleset is the real file in
 * .github/rulesets/main.json; every other shape is that file plus the fields the
 * server adds when a ruleset is applied, or one deliberate deviation from it.
 *
 *   approvedRuleset()      the file, parsed (a fresh copy on every call)
 *   appliedRuleset(over)   what GET repos/<r>/rulesets/<id> returns for it: the approved
 *                          text plus server metadata, then `over` merged on top
 *   orgRulesetSummary()    the organisation "Private Repos" entry in the rulesets list
 *   rulesetSummary(r)      the list entry a repository ruleset gets
 *   checkRuns(list)        the body of GET commits/<sha>/check-runs
 *   fakeGh(routes)         a recording `gh(args)` runner keyed by the args joined by spaces
 */

const fs = require('fs');
const path = require('path');

const RULESET_FILE = path.resolve(__dirname, '..', '..', '.github', 'rulesets', 'main.json');
const REPO = 'AO-Cyber-Systems/aoforge-claude';
const APPLIED_ID = 900001;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function approvedRuleset() {
  return JSON.parse(fs.readFileSync(RULESET_FILE, 'utf8'));
}

/** The approved ruleset as the server returns it, with `overrides` merged on top (shallow). */
function appliedRuleset(overrides = {}) {
  return {
    ...approvedRuleset(),
    id: APPLIED_ID,
    node_id: 'RRS_lACqUmVwb3NpdG9yec4AAAAB',
    source_type: 'Repository',
    source: REPO,
    _links: {
      self: { href: `https://api.github.com/repos/${REPO}/rulesets/${APPLIED_ID}` },
      html: { href: `https://github.com/${REPO}/rules/${APPLIED_ID}` },
    },
    created_at: '2026-10-10T03:00:00.000-04:00',
    updated_at: '2026-10-10T03:00:00.000-04:00',
    current_user_can_bypass: 'pull_requests_only',
    ...overrides,
  };
}

/** The applied ruleset with the pull_request rule's parameters replaced by `parameters`. */
function withPullRequestParameters(ruleset, parameters) {
  const copy = clone(ruleset);
  const rule = copy.rules.find((r) => r.type === 'pull_request');
  rule.parameters = parameters;
  return copy;
}

/** The applied ruleset with a rule type removed. */
function withoutRule(ruleset, type) {
  const copy = clone(ruleset);
  copy.rules = copy.rules.filter((r) => r.type !== type);
  return copy;
}

/** The applied ruleset with its required status checks replaced by `checks`. */
function withRequiredChecks(ruleset, checks) {
  const copy = clone(ruleset);
  const rule = copy.rules.find((r) => r.type === 'required_status_checks');
  rule.parameters.required_status_checks = checks;
  return copy;
}

function orgRulesetSummary() {
  return {
    id: 11490149,
    name: 'Private Repos',
    target: 'repository',
    source_type: 'Organization',
    source: 'AO-Cyber-Systems',
    enforcement: 'active',
    node_id: 'RRS_lACqUmVwb3NpdG9yec4AALEL',
    _links: { self: { href: 'https://api.github.com/orgs/AO-Cyber-Systems/rulesets/11490149' } },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function rulesetSummary(ruleset) {
  return {
    id: ruleset.id,
    name: ruleset.name,
    target: ruleset.target,
    source_type: ruleset.source_type,
    source: ruleset.source,
    enforcement: ruleset.enforcement,
    node_id: ruleset.node_id,
    _links: ruleset._links,
    created_at: ruleset.created_at,
    updated_at: ruleset.updated_at,
  };
}

/** `list` is [{ name, appId }] ; the body is shaped like GET /commits/<sha>/check-runs. */
function checkRuns(list) {
  return {
    total_count: list.length,
    check_runs: list.map((r) => ({ name: r.name, app: { id: r.appId } })),
  };
}

/** A route reply: status 0 with a JSON body. */
function ok(body) {
  return { status: 0, stdout: typeof body === 'string' ? body : JSON.stringify(body) };
}

/** A route reply for a failed gh call. */
function fail(stderr, status = 1) {
  return { status, stdout: '', stderr };
}

/**
 * A recording `gh(args) -> { status, stdout, stderr }`. `routes` maps `args.join(' ')` to a reply object,
 * or to a function of args. An unrouted call answers status 1 and is recorded like any other.
 */
function fakeGh(routes) {
  const calls = [];
  const gh = (args) => {
    const line = args.join(' ');
    calls.push(line);
    const route = routes[line];
    if (route === undefined) return { status: 1, stdout: '', stderr: `fakeGh: no route for "${line}"` };
    return typeof route === 'function' ? route(args) : route;
  };
  gh.calls = calls;
  return gh;
}

module.exports = {
  REPO,
  APPLIED_ID,
  RULESET_FILE,
  approvedRuleset,
  appliedRuleset,
  withPullRequestParameters,
  withoutRule,
  withRequiredChecks,
  orgRulesetSummary,
  rulesetSummary,
  checkRuns,
  ok,
  fail,
  fakeGh,
};
