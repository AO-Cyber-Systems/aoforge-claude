'use strict';

/**
 * GitHub integration for DevFlow.
 *
 * One-way push from .planning/ -> GitHub via the `gh` CLI. Planning files
 * remain authoritative; if GitHub is unavailable or this module fails the
 * caller must continue without error.
 *
 * Issue/milestone IDs are persisted to .planning/.gh-mapping.json:
 *
 *   { "milestone_id": 12, "objectives": { "1": 42, "2.1": 43 } }
 *
 * TRD 01-02 extensions:
 *   resolveChain(frontmatter, projectCtx) — walks objective → [Roadmap] issue →
 *     org Project, returns structured result with per-field provenance.
 *   findRoadmapIssue(repo) — searches for [Roadmap] parent issue in repo.
 *   addToProject(issueRef, projectId) — adds issue to a Project v2.
 *   linkSubIssue(parentRef, childRef) — links child as sub-issue of parent.
 *   cmdGhResolve(cwd, objectiveId, raw) — CLI entry point for `gh resolve`.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output } = require('./helpers.cjs');
const { hasHelpFlag } = require('./help.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { recordSync, hashFrontmatter } = require('./sync-state.cjs');
const client = require('./gh-client.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');

const MAPPING_REL = path.join('.planning', '.gh-mapping.json');

function readConfig(cwd) {
  const cfgPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function readMapping(cwd) {
  const p = path.join(cwd, MAPPING_REL);
  if (!fs.existsSync(p)) return { milestone_id: null, objectives: {} };
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { milestone_id: m.milestone_id || null, objectives: m.objectives || {} };
  } catch {
    return { milestone_id: null, objectives: {} };
  }
}

function writeMapping(cwd, mapping) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(cwd, MAPPING_REL), JSON.stringify(mapping, null, 2) + '\n');
}

function runGh(args, opts = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

// ─── Test injection + per-process cache (TRD 01-02) ──────────────────────────

// Test injection hook — production code always calls _runGh; tests inject a mock.
// Existing functions (cmdGhSyncObjectives etc.) keep using runGh directly (back-compat).
// TRD 46-07: the seam is gh-client's. The local default forwards to gh-client, so an injection made
// directly on gh-client (gh-pull._setRunGh, tests) is also what gh.cjs sees; `_setRunGh(fn)` installs
// `fn` on BOTH (the remaining legacy call sites here still read the local `_runGh` until 46-08).
const _clientRunGh = (...a) => client._runGh(...a);
let _runGh = _clientRunGh;
function _setRunGh(fn) {
  _runGh = (fn != null) ? fn : _clientRunGh;
  client._setRunGh(fn);
}

// ─── Auth + error handling (TRD 01-03) ───────────────────────────────────────

/**
 * Structured error thrown by requireGhAuth when gh is missing, unauthenticated,
 * or has insufficient scopes.
 *
 * Shape: { name: 'GhAuthError', message, remediation, scopes_missing }
 *   - message:       human-readable failure description
 *   - remediation:   runnable shell command string (no placeholders)
 *   - scopes_missing: array of missing scope strings (empty for non-scope failures)
 */
class GhAuthError extends Error {
  constructor({ message, remediation, scopes_missing = [] }) {
    super(message);
    this.name = 'GhAuthError';
    this.remediation = remediation;
    this.scopes_missing = scopes_missing;
  }
}

/**
 * Parse token scopes from `gh auth status` stdout.
 * Returns array of scope strings; empty array if no scopes line found.
 *
 * Handles both gh output formats:
 *   - Modern (2.40+):  - Token scopes: 'repo', 'gist', 'project'
 *   - Older:           - Token scopes: "repo", "gist"
 *   - Multiline:       - Token scopes: 'repo',\n      'gist'
 */
function parseScopes(stdout) {
  if (!stdout) return [];

  // Match the line starting with "Token scopes:" and capture everything until
  // we reach a line that doesn't start with whitespace+quote (handles multiline).
  // Strategy: find "Token scopes:" then extract all quoted tokens from that point.
  const scopesIdx = stdout.indexOf('Token scopes:');
  if (scopesIdx === -1) return [];

  // Grab text from "Token scopes:" to end of the section
  // Stop at the next line that starts with "  -" (another field) or end of string
  const rest = stdout.slice(scopesIdx);
  const nextField = rest.match(/\n\s+-\s+\w/);
  const scopeSection = nextField ? rest.slice(0, nextField.index) : rest;

  // Extract all quoted tokens — strip both single and double quotes
  const scopes = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(scopeSection)) !== null) {
    scopes.push(m[1]);
  }
  return scopes;
}

/**
 * Hard-fail auth check. Throws GhAuthError when:
 *   - gh binary is missing (ok:false, status:null or stderr contains 'command not found')
 *   - not authenticated (ok:false, stderr contains 'not logged in' / 'hosts')
 *   - token has expired (ok:false, stderr contains 'expired')
 *   - authenticated but missing required scopes
 *
 * Returns silently (undefined) when gh is installed, authenticated, and has all
 * required scopes. Callers that need hard-fail use this; graceful-skip callers
 * (cmdGhSyncObjectives etc.) continue using ghStatus() — back-compat preserved.
 *
 * @param {string[]} requiredScopes - scope strings that must be present
 */
function requireGhAuth(requiredScopes = []) {
  const r = _runGh(['auth', 'status']);

  if (!r.ok) {
    const stderr = r.stderr || '';

    // No gh binary: spawnSync sets status:null on ENOENT, or stderr says "command not found"
    if (r.status === null || /command not found|ENOENT/i.test(stderr)) {
      throw new GhAuthError({
        message: 'GitHub CLI (gh) is not installed.',
        remediation: 'Install gh from https://cli.github.com',
      });
    }

    // Expired token (must check before "not authenticated" catch-all)
    if (/expired/i.test(stderr)) {
      throw new GhAuthError({
        message: 'GitHub CLI token has expired.',
        remediation: 'gh auth refresh',
      });
    }

    // Not authenticated (default for any other ok:false)
    throw new GhAuthError({
      message: 'GitHub CLI is not authenticated.',
      remediation: 'gh auth login',
    });
  }

  // Authenticated — check that all required scopes are present.
  // GitHub scope inheritance: 'project' covers 'read:project'; 'repo' covers 'public_repo'.
  const scopes = parseScopes(r.stdout);
  const SCOPE_SUPERSET = { 'read:project': ['project'] };
  const missing = requiredScopes.filter((s) => {
    if (scopes.includes(s)) return false; // exact match
    const supersets = SCOPE_SUPERSET[s] || [];
    if (supersets.some(sup => scopes.includes(sup))) return false; // covered by broader scope
    return true; // genuinely missing
  });

  if (missing.length > 0) {
    throw new GhAuthError({
      message: `GitHub CLI is missing required scopes: ${missing.join(', ')}`,
      // CRITICAL: comma-joined form with -h github.com first, per verifier briefings
      remediation: `gh auth refresh -h github.com -s ${missing.join(',')}`,
      scopes_missing: missing,
    });
  }
  // OK — all scopes present; return silently
}

// Per-process in-memory cache for resolveChain (SC-3).
// Module-scope Map; dies with the process. NEVER persisted to disk.
let _cachedChains = new Map();
function _resetCache() { _cachedChains = new Map(); }

// ─── Resolver helpers (TRD 01-02) ────────────────────────────────────────────

/**
 * Resolve a frontmatter field's ref value and compute its provenance.
 * Handles: full ref (owner/repo#N), shorthand (#N), absent.
 * Returns { value, provenance, warning? }.
 */
function _resolveRef(fmValue, projectCtxRepo, fieldName) {
  if (!fmValue) return { value: null, provenance: 'absent' };

  // Full ref: contains slash before #NN (owner/repo#N pattern)
  if (typeof fmValue === 'string' && /^[^/]+\/[^#]+#\d+$/.test(fmValue)) {
    return { value: fmValue, provenance: 'frontmatter' };
  }

  // Shorthand: starts with # followed by digits
  if (typeof fmValue === 'string' && /^#\d+$/.test(fmValue)) {
    if (projectCtxRepo && /^[^/]+\/[^/]+$/.test(projectCtxRepo)) {
      // Valid owner/repo — expand
      return { value: `${projectCtxRepo}${fmValue}`, provenance: 'frontmatter' };
    }
    // Missing or malformed github_repo
    if (projectCtxRepo) {
      return {
        value: fmValue,
        provenance: 'frontmatter',
        warning: `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo "${projectCtxRepo}" is malformed (expected owner/name format)`,
      };
    }
    return {
      value: fmValue,
      provenance: 'frontmatter',
      warning: `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo is missing`,
    };
  }

  // Unrecognized format — pass through with warning
  return {
    value: fmValue,
    provenance: 'frontmatter',
    warning: `Unrecognized ${fieldName} format: ${fmValue}`,
  };
}

/**
 * Walk a parent issue ref via GraphQL to find roadmap_issue + milestone.
 * Returns { roadmap_issue, milestone, provenance: { roadmap_issue, milestone }, warnings }.
 * Uses _runGh so tests can inject a mock.
 */
function _walkParent(parentIssueRef) {
  if (!parentIssueRef || !/^[^/]+\/[^#]+#\d+$/.test(parentIssueRef)) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [],
    };
  }

  const m = parentIssueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  const [, owner, repo, num] = m;

  const query = `query($owner: String!, $name: String!, $number: Int!) {\n    repository(owner: $owner, name: $name) {\n      issue(number: $number) {\n        title\n        projectItems(first: 5) {\n          nodes {\n            project { id title }\n            fieldValues(first: 10) {\n              nodes {\n                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }\n                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }\n              }\n            }\n          }\n        }\n      }\n    }\n  }`;

  const r = _runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);

  if (!r.ok) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Walk to ${parentIssueRef} failed: ${r.stderr || 'unknown gh error'}`],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Walk response not valid JSON: ${r.stdout.slice(0, 100)}`],
    };
  }

  const issue = parsed && parsed.data && parsed.data.repository && parsed.data.repository.issue;
  if (!issue) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Issue ${parentIssueRef} not found in walk response`],
    };
  }

  const isRoadmap = typeof issue.title === 'string' && issue.title.includes('[Roadmap]');
  const projectItems = (issue.projectItems && issue.projectItems.nodes) || [];
  const item = projectItems[0] || null;

  // Extract known field values from project item
  const fields = {};
  if (item) {
    for (const fv of ((item.fieldValues && item.fieldValues.nodes) || [])) {
      const fieldName = fv.field && fv.field.name;
      if (!fieldName) continue;
      fields[fieldName] = fv.name || fv.text || null;
    }
  }

  const milestone = item ? {
    draft_or_issue_ref: parentIssueRef,
    title: (item.project && item.project.title) || null,
    product: fields.Product || null,
    quarter: fields.Quarter || null,
    status: fields.Status || null,
  } : null;

  return {
    roadmap_issue: isRoadmap ? parentIssueRef : null,
    milestone,
    provenance: {
      roadmap_issue: isRoadmap ? 'walked_from_parent' : 'absent',
      milestone: milestone ? 'walked_from_parent' : 'absent',
    },
    warnings: [],
  };
}

// ─── Public resolver functions (TRD 01-02) ───────────────────────────────────

/**
 * Find the [Roadmap] parent issue for a repo.
 * Returns 'owner/repo#NN' or null.
 */
function findRoadmapIssue(repo) {
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return null;

  const r = _runGh([
    'issue', 'list',
    '--repo', repo,
    '--state', 'open',
    '--search', '[Roadmap] in:title',
    '--json', 'number,title',
    '--limit', '5',
  ]);

  if (!r.ok) return null;

  let arr;
  try { arr = JSON.parse(r.stdout); } catch { return null; }

  if (!Array.isArray(arr) || arr.length === 0) return null;

  // Sort ascending by number — lowest number wins (deterministic)
  arr.sort((a, b) => a.number - b.number);
  return `${repo}#${arr[0].number}`;
}

/**
 * Walk an objective's frontmatter through the full org chain.
 * Returns { objective, github_issue, parent_issue, roadmap_issue,
 *           org_initiative, org_project, milestone, provenance, warnings }.
 *
 * Provenance vocabulary: 'frontmatter' | 'inherited_from_project' |
 *   'walked_from_parent' | 'absent' | 'cached'
 *
 * SC-3: per-process in-memory cache; second call with same key returns
 * cached result with walked/inherited fields marked 'cached'.
 */
function resolveChain(frontmatter, projectCtx) {
  frontmatter = frontmatter || {};
  projectCtx = projectCtx || {};

  const cacheKey = `${projectCtx.github_repo || 'no-repo'}#${frontmatter.github_issue || frontmatter._objectiveId || 'no-id'}`;

  if (_cachedChains.has(cacheKey)) {
    const cached = _cachedChains.get(cacheKey);
    // Clone provenance: walked/inherited fields become 'cached'; frontmatter + absent stay as-is
    const cachedProvenance = {};
    for (const [k, v] of Object.entries(cached.provenance)) {
      cachedProvenance[k] = (v === 'walked_from_parent' || v === 'inherited_from_project') ? 'cached' : v;
    }
    return Object.assign({}, cached, { provenance: cachedProvenance });
  }

  const warnings = [];
  const result = {
    objective: frontmatter._objectiveId || null,
    github_issue: null,
    parent_issue: null,
    roadmap_issue: null,
    org_initiative: null,
    org_project: null,
    milestone: null,
    provenance: {},
    warnings,
  };

  // github_issue: frontmatter value → shorthand resolution → absent
  const gi = _resolveRef(frontmatter.github_issue, projectCtx.github_repo, 'github_issue');
  result.github_issue = gi.value;
  result.provenance.github_issue = gi.provenance;
  if (gi.warning) warnings.push(gi.warning);

  // parent_issue: frontmatter value → shorthand resolution → absent
  const pi = _resolveRef(frontmatter.parent_issue, projectCtx.github_repo, 'parent_issue');
  result.parent_issue = pi.value;
  result.provenance.parent_issue = pi.provenance;
  if (pi.warning) warnings.push(pi.warning);

  // org_initiative: frontmatter only (objectives-scoped; not inherited from project per CONTEXT.md)
  if (frontmatter.org_initiative) {
    result.org_initiative = frontmatter.org_initiative;
    result.provenance.org_initiative = 'frontmatter';
  } else {
    result.org_initiative = null;
    result.provenance.org_initiative = 'absent';
  }

  // org_project: frontmatter wins; else inherit from projectCtx; else absent
  if (frontmatter.org_project) {
    result.org_project = frontmatter.org_project;
    result.provenance.org_project = 'frontmatter';
  } else if (projectCtx.org_project) {
    result.org_project = projectCtx.org_project;
    result.provenance.org_project = 'inherited_from_project';
  } else {
    result.org_project = null;
    result.provenance.org_project = 'absent';
  }

  // Walk parent_issue → roadmap_issue + milestone
  if (result.parent_issue && /^[^/]+\/[^#]+#\d+$/.test(result.parent_issue)) {
    const walk = _walkParent(result.parent_issue);
    result.roadmap_issue = walk.roadmap_issue;
    result.milestone = walk.milestone;
    result.provenance.roadmap_issue = walk.provenance.roadmap_issue;
    result.provenance.milestone = walk.provenance.milestone;
    for (const w of walk.warnings) warnings.push(w);
  } else if (projectCtx.github_repo) {
    // Fallback: search for [Roadmap] issue in the repo directly
    const found = findRoadmapIssue(projectCtx.github_repo);
    if (found) {
      result.roadmap_issue = found;
      result.provenance.roadmap_issue = 'walked_from_parent';
      const walk = _walkParent(found);
      result.milestone = walk.milestone;
      result.provenance.milestone = walk.provenance.milestone;
      for (const w of walk.warnings) warnings.push(w);
    } else {
      result.roadmap_issue = null;
      result.provenance.roadmap_issue = 'absent';
      result.provenance.milestone = 'absent';
    }
  } else {
    result.roadmap_issue = null;
    result.provenance.roadmap_issue = 'absent';
    result.provenance.milestone = 'absent';
  }

  _cachedChains.set(cacheKey, result);
  return result;
}

/**
 * Add an issue to a Project v2 by ID.
 * issueRef: 'owner/repo#NN', projectId: 'PVT_...'
 * Returns { ok: true, item_id } or { ok: false, error }.
 */
function addToProject(issueRef, projectId) {
  if (!issueRef || !projectId) {
    return { ok: false, error: 'issueRef and projectId are required' };
  }
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return { ok: false, error: `malformed issueRef: ${issueRef}` };
  const [, owner, repo, num] = m;

  // Step 1: Look up the issue's GitHub-internal node ID
  const idQuery = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
  const idR = _runGh(['api', 'graphql', '-f', `query=${idQuery}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!idR.ok) return { ok: false, error: idR.stderr || 'failed to look up issue node ID' };

  let issueId;
  try {
    issueId = JSON.parse(idR.stdout).data.repository.issue.id;
  } catch {
    return { ok: false, error: 'failed to parse issue node ID from response' };
  }

  // Step 2: Add issue to project via mutation
  const mutation = `mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `projectId=${projectId}`, '-F', `contentId=${issueId}`]);
  if (!r.ok) return { ok: false, error: r.stderr || 'addProjectV2ItemById mutation failed' };

  let item_id;
  try {
    item_id = JSON.parse(r.stdout).data.addProjectV2ItemById.item.id;
  } catch {
    return { ok: false, error: 'failed to parse item ID from addProjectV2ItemById response' };
  }

  return { ok: true, item_id };
}

/**
 * Link childRef as a sub-issue of parentRef using the GitHub addSubIssue mutation.
 * parentRef, childRef: 'owner/repo#NN'
 * Returns { ok: true } or { ok: false, error }.
 */
function linkSubIssue(parentRef, childRef) {
  if (!parentRef || !childRef) {
    return { ok: false, error: 'parentRef and childRef are required' };
  }

  // Helper: look up a GitHub-internal node ID for an issue ref
  function lookupNodeId(ref) {
    const m = ref.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (!m) return null;
    const [, owner, repo, num] = m;
    const q = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
    const r = _runGh(['api', 'graphql', '-f', `query=${q}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
    if (!r.ok) return null;
    try {
      return JSON.parse(r.stdout).data.repository.issue.id;
    } catch {
      return null;
    }
  }

  const parentId = lookupNodeId(parentRef);
  const childId = lookupNodeId(childRef);

  if (!parentId || !childId) {
    return {
      ok: false,
      error: `failed to look up issue IDs: parent=${parentRef} (${parentId ? 'ok' : 'failed'}) child=${childRef} (${childId ? 'ok' : 'failed'})`,
    };
  }

  const mutation = `mutation($issueId: ID!, $subIssueId: ID!) { addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { issue { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `issueId=${parentId}`, '-F', `subIssueId=${childId}`]);
  if (!r.ok) return { ok: false, error: r.stderr || 'addSubIssue mutation failed' };

  return { ok: true };
}

/**
 * CLI entry point for `df-tools gh resolve <objectiveId>`.
 * Reads OBJECTIVE.md + PROJECT.md from cwd, calls resolveChain, writes JSON.
 *
 * Hard-fails on missing/expired/insufficient auth (SC-8, TRD 01-03):
 * requireGhAuth(['project', 'read:project', 'repo']) is called before any gh API
 * calls. On failure, structured JSON error is written to stderr and process exits 1.
 * Stdout stays clean so downstream JSON consumers are not corrupted.
 */
function cmdGhResolve(cwd, objectiveId, raw, argv) {
  const USAGE = 'Usage: df-tools gh resolve <objectiveId> [--raw]\n' +
    '  Walks objective frontmatter through the org chain and prints JSON result.\n' +
    '  Options: --raw  emit compact JSON instead of pretty-print\n';

  // A help flag ANYWHERE in argv is a question, never a target (issue #100
  // finding 4): `gh resolve 12 --help` used to run the resolve — an auth call
  // and an org-chain walk — because only the first positional was inspected.
  const list = Array.isArray(argv) ? argv : [objectiveId].filter(Boolean);
  if (hasHelpFlag(list)) {
    process.stderr.write(USAGE);
    process.exit(0);
    return;
  }
  if (!objectiveId) {
    process.stderr.write(USAGE);
    process.exit(1);
    return;
  }

  // Hard-fail auth check before any gh API calls (SC-8)
  try {
    requireGhAuth(['project', 'read:project', 'repo']);
  } catch (e) {
    if (e.name === 'GhAuthError') {
      // Write structured error to STDERR — stdout stays clean for JSON consumers
      const errPayload = {
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      };
      process.stderr.write(JSON.stringify(errPayload, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e; // Unknown error — propagate up
  }

  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    process.stderr.write(`Error: objective not found: ${objectiveId}\n`);
    process.stderr.write(`  expected: ${objPath}\n`);
    process.stderr.write(`  Hint: run \`df-tools gh resolve --help\` for usage.\n`);
    process.exit(1);
    return;
  }

  const objContent = fs.readFileSync(objPath, 'utf-8');
  const objFm = extractFrontmatter(objContent) || {};
  objFm._objectiveId = objectiveId;

  const projectPath = path.join(cwd, '.planning', 'PROJECT.md');
  let projectFm = {};
  if (fs.existsSync(projectPath)) {
    projectFm = extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  }

  const projectCtx = {
    github_repo: projectFm.github_repo || null,
    org_project: projectFm.org_project || null,
  };

  const result = resolveChain(objFm, projectCtx);
  const prettyJson = JSON.stringify(result, null, 2);
  output(result, raw, prettyJson);
}

function ghStatus(cwd) {
  const cfg = readConfig(cwd);
  const ghCfg = cfg && cfg.github ? cfg.github : null;
  if (!ghCfg || !ghCfg.enabled) {
    return { enabled: false, reason: 'github.enabled is false in .planning/config.json' };
  }
  if (!ghCfg.repo || !/^[^/]+\/[^/]+$/.test(ghCfg.repo)) {
    return { enabled: false, reason: 'github.repo must be set as "owner/name"' };
  }
  const which = spawnSync('which', ['gh'], { encoding: 'utf-8' });
  if (which.status !== 0) {
    return { enabled: false, reason: 'gh CLI not installed (https://cli.github.com)' };
  }
  const auth = _runGh(['auth', 'status']);
  if (!auth.ok) {
    return { enabled: false, reason: 'gh not authenticated — run `gh auth login`' };
  }
  return { enabled: true, repo: ghCfg.repo, labels: ghCfg.labels || {}, milestone_prefix: ghCfg.milestone_prefix || 'v' };
}

// ─── ROADMAP parsing ─────────────────────────────────────────────────────────

function listObjectives(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return [];
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const headerRe = /#{2,4}\s*Objective\s+([\d.]+):\s*([^\n]+)/gi;
  const objectives = [];
  let m;
  while ((m = headerRe.exec(content)) !== null) {
    const num = m[1];
    const name = m[2].trim();
    const headerIdx = m.index;
    const tail = content.slice(headerIdx);
    const next = tail.slice(1).match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = next ? headerIdx + 1 + next.index : content.length;
    const section = content.slice(headerIdx, sectionEnd).trim();
    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const criteriaMatch = section.match(/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
    const successCriteria = criteriaMatch
      ? criteriaMatch[1].trim().split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
      : [];
    objectives.push({
      number: num,
      name,
      goal: goalMatch ? goalMatch[1].trim() : null,
      success_criteria: successCriteria,
    });
  }
  return objectives;
}

function getProjectName(cwd) {
  const projectPath = path.join(cwd, '.planning', 'project.md');
  if (!fs.existsSync(projectPath)) return path.basename(cwd);
  const content = fs.readFileSync(projectPath, 'utf-8');
  const m = content.match(/^#\s+([^\n]+)/m);
  return m ? m[1].trim() : path.basename(cwd);
}

function getMilestoneVersion(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const m = content.match(/v(\d+\.\d+)/);
  return m ? m[0] : null;
}

// ─── Issue / milestone formatting ────────────────────────────────────────────

function formatIssueBody(obj, projectName) {
  const lines = [
    `**Objective ${obj.number}: ${obj.name}**`,
    '',
    obj.goal ? `**Goal:** ${obj.goal}` : null,
    '',
    obj.success_criteria.length
      ? '**Success criteria:**\n' + obj.success_criteria.map(c => `- ${c}`).join('\n')
      : null,
    '',
    `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/\` in this repo._`,
  ].filter(l => l !== null);
  return lines.join('\n');
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdGhStatus(cwd, raw) {
  const status = ghStatus(cwd);
  output(status, raw, status.enabled ? 'enabled' : status.reason);
}

function cmdGhSyncObjectives(cwd, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }

  const objectives = listObjectives(cwd);
  if (objectives.length === 0) {
    output({ ok: false, reason: 'No objectives found in ROADMAP.md' }, raw, '');
    return;
  }

  const mapping = readMapping(cwd);
  const projectName = getProjectName(cwd);
  const milestoneVersion = getMilestoneVersion(cwd) || 'v1.0';
  const milestoneTitle = `${status.milestone_prefix || 'v'}${milestoneVersion.replace(/^v/, '')}`;
  const repo = status.repo;
  const baseLabel = (status.labels && status.labels.objective) || 'devflow:objective';
  const result = { ok: true, repo, milestone: null, objectives: [] };

  // Ensure milestone exists (best-effort — gh has no `milestone create`, use API)
  if (!mapping.milestone_id) {
    const create = _runGh(['api', `repos/${repo}/milestones`, '-f', `title=${milestoneTitle}`, '-f', `description=DevFlow milestone for ${projectName}`]);
    if (create.ok) {
      try {
        const json = JSON.parse(create.stdout);
        mapping.milestone_id = json.number;
        result.milestone = { number: json.number, title: milestoneTitle, created: true };
      } catch {}
    } else if (/already_exists/i.test(create.stderr)) {
      // Look up existing milestone
      const list = _runGh(['api', `repos/${repo}/milestones?state=all`]);
      if (list.ok) {
        try {
          const arr = JSON.parse(list.stdout);
          const found = arr.find(m => m.title === milestoneTitle);
          if (found) {
            mapping.milestone_id = found.number;
            result.milestone = { number: found.number, title: milestoneTitle, created: false };
          }
        } catch {}
      }
    }
  } else {
    result.milestone = { number: mapping.milestone_id, title: milestoneTitle, created: false };
  }

  // Ensure label exists
  _runGh(['label', 'create', baseLabel, '--repo', repo, '--color', '0e8a16', '--description', 'DevFlow objective tracking']);

  for (const obj of objectives) {
    const existingIssue = mapping.objectives[obj.number];
    const title = `[Objective ${obj.number}] ${obj.name}`;
    const body = formatIssueBody(obj, projectName);

    if (existingIssue) {
      const edit = _runGh([
        'issue', 'edit', String(existingIssue),
        '--repo', repo,
        '--title', title,
        '--body', body,
      ]);
      result.objectives.push({
        number: obj.number,
        issue: existingIssue,
        action: edit.ok ? 'updated' : 'failed',
        error: edit.ok ? null : edit.stderr,
      });
    } else {
      const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', baseLabel];
      if (mapping.milestone_id) {
        // gh issue create takes --milestone by title, not number
        args.push('--milestone', milestoneTitle);
      }
      const create = _runGh(args);
      if (create.ok) {
        const m = create.stdout.match(/\/issues\/(\d+)/);
        if (m) {
          mapping.objectives[obj.number] = parseInt(m[1], 10);
          result.objectives.push({ number: obj.number, issue: parseInt(m[1], 10), action: 'created' });
        }
      } else {
        result.objectives.push({ number: obj.number, action: 'failed', error: create.stderr });
      }
    }
  }

  writeMapping(cwd, mapping);

  // TRD 21-02: record sync state for each successfully synced objective so that
  // subsequent `gh pull` calls have a baseline to detect drift against.
  for (const item of result.objectives) {
    if (item.action !== 'created' && item.action !== 'updated') continue;
    const objDir = _findObjectiveDir(cwd, item.number);
    if (!objDir) continue;
    const objPath = path.join(cwd, '.planning', 'objectives', objDir, 'OBJECTIVE.md');
    if (!fs.existsSync(objPath)) continue;
    let diskFm;
    try {
      diskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
    } catch (_) {
      continue;
    }
    const issueRef = `${repo}#${item.issue}`;
    const nowIso = new Date().toISOString();
    try {
      recordSync(cwd, item.number, {
        issue_ref: issueRef,
        etag: null,
        gh_updated_at: nowIso, // approximate; we just wrote
        label_set: [baseLabel], // we just applied this label
        assignees: [],          // push doesn't set assignees
        milestone: milestoneTitle,
        status: 'open',         // push creates as open
        last_synced_at: nowIso,
        last_synced_disk_hash: hashFrontmatter(diskFm),
      });
    } catch (_) {
      // best-effort: do not fail the push if sync state can't be written
    }
  }

  output(result, raw, '');
}

// Best-effort: list .planning/objectives/, find dir whose name starts with the
// (zero-padded) objective number. Falls back to non-padded prefix or exact match.
function _findObjectiveDir(cwd, objectiveNumber) {
  const objDir = path.join(cwd, '.planning', 'objectives');
  if (!fs.existsSync(objDir)) return null;
  const padded = String(objectiveNumber).padStart(2, '0');
  const numStr = String(objectiveNumber);
  let entries;
  try { entries = fs.readdirSync(objDir); } catch (_) { return null; }
  for (const entry of entries) {
    if (entry === padded || entry === numStr) return entry;
    if (entry.startsWith(padded + '-') || entry.startsWith(numStr + '-')) return entry;
  }
  return null;
}

function cmdGhComment(cwd, issueOrObjective, body, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  if (!issueOrObjective || body === undefined) {
    output({ ok: false, reason: 'Usage: gh comment <issue#|objective#> <body|@file:path>' }, raw, '');
    return;
  }

  // Resolve objective number to issue number via mapping
  const mapping = readMapping(cwd);
  let issue = parseInt(issueOrObjective, 10);
  if (!issueOrObjective.match(/^\d+$/) || mapping.objectives[issueOrObjective]) {
    const mapped = mapping.objectives[issueOrObjective];
    if (mapped) issue = mapped;
  }
  if (!issue) {
    output({ ok: false, reason: `No issue mapped for ${issueOrObjective}` }, raw, '');
    return;
  }

  // Body may be @file:/path/to/file.md
  let actualBody = body;
  if (body.startsWith('@file:')) {
    const filePath = body.slice('@file:'.length);
    if (!fs.existsSync(filePath)) {
      output({ ok: false, reason: `File not found: ${filePath}` }, raw, '');
      return;
    }
    actualBody = fs.readFileSync(filePath, 'utf-8');
  }

  const r = runGh(['issue', 'comment', String(issue), '--repo', status.repo, '--body', actualBody]);
  output(
    { ok: r.ok, issue, error: r.ok ? null : r.stderr, url: r.ok ? r.stdout : null },
    raw,
    ''
  );
}

function cmdGhCloseIssue(cwd, objectiveOrIssue, comment, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  const mapping = readMapping(cwd);
  let issue = mapping.objectives[objectiveOrIssue] || parseInt(objectiveOrIssue, 10);
  if (!issue) {
    output({ ok: false, reason: `No issue mapped for ${objectiveOrIssue}` }, raw, '');
    return;
  }
  const args = ['issue', 'close', String(issue), '--repo', status.repo];
  if (comment) args.push('--comment', comment);
  const r = runGh(args);
  output({ ok: r.ok, issue, error: r.ok ? null : r.stderr }, raw, '');
}

function cmdGhSyncRelease(cwd, tag, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  if (!tag) {
    output({ ok: false, reason: 'Usage: gh sync-release <tag>' }, raw, '');
    return;
  }

  // Find previous tag
  const prevTag = spawnSync('git', ['describe', '--tags', '--abbrev=0', `${tag}^`], {
    encoding: 'utf-8', cwd,
  });
  const prev = prevTag.status === 0 ? prevTag.stdout.trim() : null;
  const range = prev ? `${prev}..${tag}` : tag;

  // Pull SUMMARY.md and metadata commits in range
  const log = spawnSync(
    'git',
    ['log', range, '--no-merges', '--pretty=format:%h|%s', '--name-only', '-z'],
    { encoding: 'utf-8', cwd }
  );

  const lines = [`# Release ${tag}`, '', prev ? `Changes since ${prev}.` : 'Initial release.', ''];

  // Group commits by type prefix (feat/fix/docs/etc)
  const groups = { feat: [], fix: [], perf: [], refactor: [], chore: [], docs: [], other: [] };
  if (log.status === 0 && log.stdout) {
    const commitRe = /([a-f0-9]+)\|([^\n\0]+)/g;
    let m;
    while ((m = commitRe.exec(log.stdout)) !== null) {
      const subject = m[2];
      const typeMatch = subject.match(/^(feat|fix|perf|refactor|chore|docs|test)(?:\([^)]+\))?:/);
      const bucket = typeMatch && groups[typeMatch[1]] ? typeMatch[1] : 'other';
      groups[bucket].push({ sha: m[1], subject });
    }
  }

  const labels = { feat: 'Features', fix: 'Fixes', perf: 'Performance', refactor: 'Refactors', chore: 'Chores', docs: 'Docs', other: 'Other' };
  for (const key of ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore', 'other']) {
    if (groups[key].length === 0) continue;
    lines.push(`## ${labels[key]}`, '');
    for (const c of groups[key]) lines.push(`- ${c.subject} (${c.sha})`);
    lines.push('');
  }

  // Append SUMMARY.md highlights from objectives completed in range
  const summaryFiles = [];
  if (log.status === 0 && log.stdout) {
    const filePartRe = /\0([^\0\n]+SUMMARY\.md)/g;
    let m;
    while ((m = filePartRe.exec(log.stdout)) !== null) {
      const f = m[1];
      if (!summaryFiles.includes(f) && fs.existsSync(path.join(cwd, f))) summaryFiles.push(f);
    }
  }
  if (summaryFiles.length > 0) {
    lines.push('## Objectives shipped', '');
    for (const f of summaryFiles) {
      const content = fs.readFileSync(path.join(cwd, f), 'utf-8');
      const titleMatch = content.match(/^#\s+([^\n]+)/m);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(f);
      lines.push(`### ${title}`, '', `_Source: \`${f}\`_`, '');
    }
  }

  const tmpNotes = path.join(require('os').tmpdir(), `df-release-${Date.now()}.md`);
  fs.writeFileSync(tmpNotes, lines.join('\n'));

  // Check if release already exists
  const existing = runGh(['release', 'view', tag, '--repo', status.repo]);
  let r;
  if (existing.ok) {
    r = runGh(['release', 'edit', tag, '--repo', status.repo, '--notes-file', tmpNotes]);
  } else {
    r = runGh(['release', 'create', tag, '--repo', status.repo, '--title', tag, '--notes-file', tmpNotes]);
  }

  output(
    { ok: r.ok, tag, prev_tag: prev, range, notes_file: tmpNotes, action: existing.ok ? 'edited' : 'created', error: r.ok ? null : r.stderr, url: r.ok ? r.stdout : null },
    raw,
    ''
  );
}

// ─── TRD 01-04: syncObjective helpers + orchestrator ─────────────────────────

/**
 * readMappingV2: returns mapping in v2 shape — objectives as { issue_id, state_comment_id }.
 * Migrates v1 shape (objectives: { number: issueId }) on first read.
 * Does NOT write — callers that need to persist use writeMappingV2.
 */
function readMappingV2(cwd) {
  const v1 = readMapping(cwd);
  const out = { milestone_id: v1.milestone_id, objectives: {} };
  for (const [k, v] of Object.entries(v1.objectives)) {
    if (typeof v === 'number') {
      out.objectives[k] = { issue_id: v, state_comment_id: null };
    } else if (typeof v === 'object' && v !== null) {
      out.objectives[k] = { issue_id: v.issue_id, state_comment_id: v.state_comment_id || null };
    }
  }
  return out;
}

/**
 * writeMappingV2: writes v2-shape mapping to disk.
 * Preserves v2 object entries; v1 number entries kept for callers that haven't migrated.
 */
function writeMappingV2(cwd, mapping) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  const out = { milestone_id: mapping.milestone_id, objectives: {} };
  for (const [k, v] of Object.entries(mapping.objectives)) {
    if (typeof v === 'object' && v !== null) {
      out.objectives[k] = { issue_id: v.issue_id, state_comment_id: v.state_comment_id };
    } else {
      out.objectives[k] = v;
    }
  }
  fs.writeFileSync(path.join(cwd, MAPPING_REL), JSON.stringify(out, null, 2) + '\n');
}

/**
 * buildIssueBody(state) — pure function returning canonical markdown body.
 * Input contract: success_criteria and trds arrays are pre-sorted by caller.
 * Deterministic: no timestamps, no Object.keys iteration over unsorted collections.
 */
function buildIssueBody(state) {
  const lines = [];
  lines.push(`**Objective ${state.number}: ${state.name}**`);
  lines.push('');
  if (state.goal) {
    lines.push(`**Goal:** ${state.goal}`);
    lines.push('');
  }
  const sha = state.last_commit && state.last_commit.sha ? state.last_commit.sha : 'none';
  lines.push(`**Status:** ${state.trd_done}/${state.trd_total} TRDs done, current wave ${state.current_wave || 1}, last commit ${sha}`);
  lines.push('');
  if (state.success_criteria && state.success_criteria.length > 0) {
    lines.push('**Success criteria:**');
    for (const sc of state.success_criteria) {
      const mark = sc.done ? 'x' : ' ';
      const text = sc.text ? `: ${sc.text}` : '';
      lines.push(`- [${mark}] ${sc.id}${text}`);
    }
    lines.push('');
  }
  if (state.trds && state.trds.length > 0) {
    lines.push('**TRDs:**');
    for (const t of state.trds) {
      const mark = t.done ? 'x' : ' ';
      const brief = t.brief ? ` — ${t.brief}` : '';
      lines.push(`- [${mark}] ${t.name}${brief}`);
    }
    lines.push('');
  }
  const objId = state.objectiveId || '';
  lines.push(`_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/${objId}/\` in this repo._`);
  return lines.join('\n');
}

/**
 * buildStickyComment(state, isoTimestamp) — pure function building sticky comment body.
 * First line is exactly `<!-- df:state -->` (no trailing space).
 * Pass timestamp explicitly so tests can use a fixed value (deterministic).
 */
function buildStickyComment(state, isoTimestamp) {
  const lines = [];
  lines.push('<!-- df:state -->');
  lines.push(`**DevFlow state — last synced ${isoTimestamp}**`);
  lines.push('');
  lines.push(`- Wave: ${state.current_wave || 1}`);
  lines.push(`- TRDs: ${state.trd_done}/${state.trd_total}`);
  lines.push(`- SUMMARY count: ${state.summary_count}`);
  if (state.last_commit) {
    lines.push(`- Last commit: ${state.last_commit.sha} — ${state.last_commit.subject}`);
  }
  if (state.branch) {
    lines.push(`- Branch: ${state.branch}`);
  }
  return lines.join('\n');
}

// ─── Sticky state comment (TRD 46-07) ───────────────────────────────────────

function parseIssueRef(issueRef) {
  const m = typeof issueRef === 'string' && issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  return m ? { repo: `${m[1]}/${m[2]}`, number: m[3] } : null;
}

// The sticky comment's timestamp line changes on every sync; it alone never justifies a PATCH.
const stripStickyTimestamp = (b) => String(b == null ? '' : b).replace(/\r\n/g, '\n').replace(/last synced [^*\n]*/, 'last synced');

/**
 * One paginated read of every comment on the issue; the state comment is the one with id `knownId`
 * (when it still carries a state marker), else the first whose first line is the state marker for
 * `id` or the legacy `<!-- df:state -->`.
 *   -> { ok:true, comment: {id, body} | null, via: 'mapping' | 'marker' | null } | { ok:false, error }
 */
function locateStickyComment(issueRef, id, knownId) {
  const ref = parseIssueRef(issueRef);
  if (!ref) return { ok: false, error: `malformed issueRef: ${issueRef}` };
  const r = client.ghPaginate(`repos/${ref.repo}/issues/${ref.number}/comments`);
  if (!r.ok) return { ok: false, error: r.error || 'could not list comments' };
  const isState = (c) => c && typeof c.body === 'string' && bodyLib.isStateComment(c.body, id);
  if (knownId) {
    const c = r.items.find((x) => x && x.id === knownId && isState(x));
    if (c) return { ok: true, comment: c, via: 'mapping' };
  }
  const c = r.items.find(isState);
  return { ok: true, comment: c || null, via: c ? 'marker' : null };
}

/**
 * findStickyComment(issueRef, id) — the state comment's id across ALL comment pages, matched by the
 * `devflow:id=<id> kind=state` marker or the legacy `<!-- df:state -->`. Null when absent or unreadable.
 */
function findStickyComment(issueRef, id) {
  const f = locateStickyComment(issueRef, id, null);
  return f.ok && f.comment ? f.comment.id : null;
}

/**
 * upsertStickyComment(issueRef, body, mappingState, id) — edit the state comment in place or create it.
 *   1. comment `mappingState.state_comment_id` (still a state comment)  -> 'edited'
 *   2. else the first state comment by marker                           -> 'edited_via_marker'
 *   3. else POST a new comment                                          -> 'created'
 * A comment whose body differs only in the `last synced` timestamp is not re-PATCHed ('unchanged').
 * Every write goes through gh-client ghWrite.
 * Returns { action: 'created' | 'edited' | 'edited_via_marker' | 'unchanged' | 'failed', comment_id, error? }
 */
function upsertStickyComment(issueRef, body, mappingState = {}, id) {
  const ref = parseIssueRef(issueRef);
  if (!ref) return { action: 'failed', error: `malformed issueRef: ${issueRef}` };
  const known = mappingState && mappingState.state_comment_id ? mappingState.state_comment_id : null;
  const f = locateStickyComment(issueRef, id, known);
  if (!f.ok) return { action: 'failed', error: f.error };

  if (f.comment) {
    const cid = f.comment.id;
    if (stripStickyTimestamp(f.comment.body) === stripStickyTimestamp(body)) {
      return { action: 'unchanged', comment_id: cid };
    }
    const r = client.ghWrite(['api', `repos/${ref.repo}/issues/comments/${cid}`, '-X', 'PATCH', '-f', `body=${body}`]);
    if (!r.ok) return { action: 'failed', comment_id: cid, error: r.error || r.stderr || 'comment PATCH failed' };
    return { action: f.via === 'mapping' ? 'edited' : 'edited_via_marker', comment_id: cid };
  }

  const r = client.ghWrite(['api', `repos/${ref.repo}/issues/${ref.number}/comments`, '-f', `body=${body}`]);
  if (!r.ok) return { action: 'failed', error: r.error || r.stderr || 'comment create failed' };
  let cid = null;
  try {
    const parsed = JSON.parse(r.stdout);
    if (Number.isInteger(parsed.id)) cid = parsed.id;
  } catch {
    const m = /issuecomment-(\d+)/.exec(r.stdout || '');
    if (m) cid = Number(m[1]);
  }
  return { action: 'created', comment_id: cid };
}

/**
 * PRODUCT_ROADMAP_FIELDS — deprecated (TRD 46-07). Field and option ids now come from gh-project live
 * discovery (cached out of the repo); the runtime no longer reads test fixtures. The export is kept as a
 * frozen stub so older requirers do not crash.
 */
const PRODUCT_ROADMAP_FIELDS = Object.freeze({ _captured: false, deprecated: 'use gh-project discovery' });

/**
 * updateProjectFields(issueRef, projectId, fields, opts) — set Project v2 field values by NAME.
 * Delegates to gh-project.updateItemFields: fields and options come from live discovery (TTL cache,
 * one refresh for an unseen option), the issue is added to the project first, and every call runs
 * through gh-client (reads paced as reads, mutations as writes). Unknown fields/options are warnings.
 *   opts: { ttlMinutes, env, now }
 * Returns { ok, item_id, fields_updated, warnings, errors? } | { ok:false, error, fields_updated, warnings }.
 */
function updateProjectFields(issueRef, projectId, fields = {}, opts = {}) {
  const projectLib = require('./gh-project.cjs');
  return projectLib.updateItemFields({
    issueRef,
    projectId,
    fields,
    run: client.ghRun,
    env: opts.env || process.env,
    now: opts.now,
    ttlMinutes: opts.ttlMinutes,
  });
}

/**
 * readObjectiveState(objectiveId, projectRoot) — read disk state for one objective.
 * Returns structured state object used by buildIssueBody + buildStickyComment.
 */
function readObjectiveState(objectiveId, projectRoot) {
  const objDir = path.join(projectRoot, '.planning', 'objectives', objectiveId);
  if (!fs.existsSync(objDir)) {
    throw new Error(`objective directory not found: ${objDir}`);
  }

  const files = fs.readdirSync(objDir).sort();
  const trds = files.filter(f => /-TRD\.md$/.test(f));
  const summaries = files.filter(f => /-SUMMARY\.md$/.test(f));

  // Match TRD → SUMMARY by the `<objective>-<trd>` id prefix (TRD 46-07): a slugged TRD
  // (`46-01-gh-client-TRD.md`) pairs with `46-01-SUMMARY.md` and with `46-01-gh-client-SUMMARY.md`.
  const idPrefix = (f, suffix) => {
    const m = /^(\d+(?:\.\d+)?-\d+)(?:-|$)/.exec(f.replace(suffix, ''));
    return m ? m[1] : f.replace(suffix, '');
  };
  const trdStems = trds.map(f => f.replace(/-TRD\.md$/, ''));
  const summaryStems = new Set(summaries.map(f => idPrefix(f, /-SUMMARY\.md$/)));

  const trdEntries = trdStems.map(stem => {
    let brief = null;
    let wave = 1;
    try {
      const content = fs.readFileSync(path.join(objDir, stem + '-TRD.md'), 'utf-8');
      const fm = extractFrontmatter(content);
      if (fm) {
        brief = fm.title || null;
        wave = parseInt(fm.wave, 10) || 1;
      }
    } catch {}
    return { name: stem + '-TRD.md', done: summaryStems.has(idPrefix(stem, /-TRD\.md$/)), brief, wave };
  });

  // current_wave: max wave among incomplete TRDs; if all done, max wave overall
  let currentWave = 1;
  let maxWave = 1;
  for (const t of trdEntries) {
    if (t.wave > maxWave) maxWave = t.wave;
    if (!t.done && t.wave > currentWave) currentWave = t.wave;
  }
  if (trdEntries.length > 0 && trdEntries.every(t => t.done)) currentWave = maxWave;

  // Last commit touching the objective dir
  const cp = require('child_process');
  const git = cp.spawnSync('git', ['log', '-1', '--pretty=%h|%s', '--', objDir], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });
  let last_commit = null;
  if (git.status === 0 && git.stdout && git.stdout.trim()) {
    const [sha, ...rest] = git.stdout.trim().split('|');
    last_commit = { sha, subject: rest.join('|') };
  }

  // Branch
  const branchR = cp.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });
  const branch = branchR.status === 0 && branchR.stdout ? branchR.stdout.trim() : null;

  // Goal + name + number + success_criteria from ROADMAP.md
  // Canonical id (`02.1-b` -> `2.1`), so a decimal objective never reads the integer one's entry.
  const canonical = mappingLib.toObjectiveId(objectiveId);
  const number = canonical !== null ? canonical : objectiveId;
  const all = listObjectives(projectRoot);
  const found = all.find(o => mappingLib.toObjectiveId(o.number) === number);

  // Done detection for SC: scan SUMMARY file contents for "SC-N" mentions
  const scDone = (scIdx) =>
    summaries.some(s => {
      try {
        return fs.readFileSync(path.join(objDir, s), 'utf-8').includes(`SC-${scIdx + 1}`);
      } catch { return false; }
    });

  const success_criteria = (found && found.success_criteria || []).map((sc, i) => ({
    id: `SC-${i + 1}`,
    text: sc,
    done: scDone(i),
  }));

  return {
    objectiveId,
    number,
    name: found ? found.name : objectiveId,
    goal: found ? found.goal : null,
    success_criteria,
    trds: trdEntries.map(({ name, done, brief }) => ({ name, done, brief })),
    trd_total: trdEntries.length,
    trd_done: trdEntries.filter(t => t.done).length,
    summary_count: summaries.length,
    current_wave: currentWave,
    last_commit,
    branch,
  };
}

/** Minimal state for a ROADMAP-only objective (no directory): name and goal, 0/0 TRDs. */
function roadmapOnlyState(projectRoot, resolved) {
  const roadmap = require('./roadmap.cjs');
  const rm = roadmap.getRoadmapObjectiveInternal(projectRoot, resolved.roadmapNumber || resolved.id);
  return {
    objectiveId: resolved.id,
    number: resolved.id,
    name: (rm && rm.objective_name) || `objective ${resolved.id}`,
    goal: (rm && rm.goal) || null,
    success_criteria: [],
    trds: [],
    trd_total: 0,
    trd_done: 0,
    summary_count: 0,
    current_wave: 1,
    last_commit: null,
    branch: null,
  };
}

function readProjectFrontmatter(projectRoot) {
  const projectPath = path.join(projectRoot, '.planning', 'PROJECT.md');
  if (!fs.existsSync(projectPath)) return {};
  try {
    return extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  } catch {
    return {};
  }
}

/** Status rule (unchanged): all TRDs done -> Done, some -> In Progress, none -> Todo. Quarter from the chain. */
function projectFieldUpdates(state, chain) {
  const fields = {};
  if (state.trd_done === state.trd_total && state.trd_total > 0) fields.Status = 'Done';
  else if (state.trd_done > 0) fields.Status = 'In Progress';
  else fields.Status = 'Todo';
  if (chain.milestone && chain.milestone.quarter) fields.Quarter = chain.milestone.quarter;
  return fields;
}

/**
 * syncObjective(objectiveArg, projectRoot) — push one objective's disk state to GitHub (TRD 46-07).
 *
 * createRunContext (github.enabled gate, mapping v3) -> resolveObjective (any spelling) -> requireGhAuth
 * (project scopes only when org_project resolves) -> readObjectiveState -> gh-issue find-or-create (the
 * only create path; duplicates are errors) -> gh-body mergeManaged + `issue edit` only when a managed
 * section changed -> sticky state comment (all pages, edited in place) -> Project fields via gh-project
 * discovery -> `github_issue` write-back -> mapping v3 written once -> sync-state under the same id.
 *
 * Returns { ok:true, issue_number, issue_source, created, issue_updated, comment_action, comment_id,
 *           project_fields_updated, frontmatter_written, mapping_written, chain, state, warnings }
 *       | { ok:false, skipped:true, reason, warnings }  (github disabled; zero gh calls)
 *       | { ok:false, error, warnings, ... }
 * Throws GhAuthError when gh is missing, unauthenticated or lacks a required scope.
 */
function syncObjective(objectiveArg, projectRoot) {
  const issueLib = require('./gh-issue.cjs');
  const milestoneLib = require('./gh-milestone.cjs');
  const { setFrontmatterField } = require('./frontmatter.cjs');

  // 1. Enabled gate + run context (zero gh calls).
  const runCtx = issueLib.createRunContext(projectRoot);
  if (runCtx.skipped) return { ok: false, skipped: true, reason: runCtx.reason, warnings: [] };
  if (runCtx.ok === false) return { ok: false, error: runCtx.error, warnings: [] };

  const warnings = [];
  const allWarnings = (chain) => [...new Set([...runCtx.warnings, ...((chain && chain.warnings) || []), ...warnings])];

  // 2. Any spelling of the objective.
  const resolved = mappingLib.resolveObjective(projectRoot, objectiveArg);
  if (!resolved) return { ok: false, error: `objective not found: ${objectiveArg}`, warnings: allWarnings() };

  const objPath = resolved.dir
    ? path.join(projectRoot, '.planning', 'objectives', resolved.dir, 'OBJECTIVE.md')
    : null;
  let objFm = {};
  if (objPath && fs.existsSync(objPath)) {
    try { objFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {}; } catch { objFm = {}; }
  }
  objFm._objectiveId = resolved.id;

  // 3. Auth before any other gh call; project scopes only when a project resolves (Pitfall 13).
  const projectFm = readProjectFrontmatter(projectRoot);
  const projectCtx = { github_repo: projectFm.github_repo || null, org_project: projectFm.org_project || null };
  const orgProject = objFm.org_project || projectCtx.org_project || null;
  requireGhAuth(orgProject ? ['project', 'read:project', 'repo'] : ['repo']);
  const chain = resolveChain(objFm, projectCtx);

  // 4. Disk state and the managed sections.
  const state = resolved.dir ? readObjectiveState(resolved.dir, projectRoot) : roadmapOnlyState(projectRoot, resolved);
  const sections = bodyLib.buildObjectiveSections({ ...state, objectiveId: resolved.id, dir: resolved.dir });
  const initial = bodyLib.mergeManaged('', sections, resolved.id);
  if (!initial.ok) return { ok: false, error: initial.error, warnings: allWarnings(chain) };

  // 5. Find or create (the only create path; duplicates and conflicts are errors, never a create).
  const found = issueLib.findOrCreateObjectiveIssue(runCtx, resolved, { name: state.name, createBody: initial.body });
  if (!found.ok) return { ...found, warnings: allWarnings(chain) };

  const repo = runCtx.repo;
  const n = found.issue_number;
  const issueRef = `${repo}#${n}`;

  // 6. Merge managed sections; edit only when one changed. Human text outside sections is kept.
  let issueUpdated = false;
  let finalBody = found.body || '';
  if (!found.created) {
    const merged = bodyLib.mergeManaged(found.body || '', sections, resolved.id);
    if (!merged.ok) {
      return { ok: false, error: merged.error, issue_number: n, warnings: allWarnings(chain) };
    }
    for (const w of merged.warnings || []) warnings.push(w);
    if (merged.changed) {
      const e = client.ghWrite(['issue', 'edit', String(n), '--repo', repo, '--body', merged.body]);
      if (!e.ok) {
        return {
          ok: false, error: `issue edit failed for #${n}: ${e.error || e.stderr || e.stdout || 'gh issue edit failed'}`,
          issue_number: n, warnings: allWarnings(chain),
        };
      }
      issueUpdated = true;
      finalBody = merged.body;
    }
  }

  // 7. Sticky state comment.
  const nowIso = new Date().toISOString();
  const prior = mappingLib.getEntry(runCtx.mapping, resolved.id) || {};
  const stickyBody = bodyLib.buildStateComment(resolved.id, state, nowIso);
  const upsert = upsertStickyComment(issueRef, stickyBody, { state_comment_id: prior.state_comment_id }, resolved.id);
  if (upsert.action === 'failed') warnings.push(`state comment not updated: ${upsert.error}`);

  // 8. Project fields (best effort; failures are warnings).
  let projectUpdate = { fields_updated: [] };
  if (chain.org_project) {
    const cfg = client.readConfig(projectRoot) || {};
    const ttl = cfg.github && cfg.github.project_cache_ttl_minutes;
    projectUpdate = updateProjectFields(issueRef, chain.org_project, projectFieldUpdates(state, chain), { ttlMinutes: ttl });
    for (const w of projectUpdate.warnings || []) warnings.push(w);
    if (projectUpdate.error) warnings.push(`project fields not updated: ${projectUpdate.error}`);
    for (const err of projectUpdate.errors || []) warnings.push(`project field ${err.field} not updated: ${err.error}`);
  }

  // 9. github_issue write-back (only when absent or equal; a differing human value is kept).
  let frontmatterWritten = false;
  if (objPath) {
    const fw = setFrontmatterField(objPath, 'github_issue', issueRef, { ifAbsentOrEqual: true });
    if (!fw.ok) warnings.push(`github_issue not written: ${fw.error}`);
    else if (fw.conflict) {
      warnings.push(`frontmatter_conflict: OBJECTIVE.md github_issue is ${fw.existing} but objective ${resolved.id} syncs to ${issueRef}; the existing value was kept`);
    } else if (fw.warning) warnings.push(fw.warning);
    else frontmatterWritten = Boolean(fw.changed);
  }

  // 10. Mapping v3, written once; verified_at once the body carries this objective's marker.
  const marker = bodyLib.extractMarker(finalBody);
  const verified = Boolean(marker && marker.kind === null && marker.id === resolved.id);
  const entry = mappingLib.getEntry(runCtx.mapping, resolved.id) || {};
  mappingLib.setEntry(runCtx.mapping, resolved.id, {
    issue_id: n,
    state_comment_id: upsert.comment_id || entry.state_comment_id || null,
    verified_at: verified ? (entry.verified_at || nowIso) : null,
  });
  const wm = mappingLib.writeMappingV3(projectRoot, runCtx.mapping);
  if (!wm.ok) warnings.push(`mapping not written: ${wm.error}`);

  // 11. Sync-state under the same id.
  try {
    let diskFm = {};
    if (objPath && fs.existsSync(objPath)) diskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
    const ms = milestoneLib.resolveObjectiveMilestone(projectRoot, resolved.dir, runCtx.prefix);
    recordSync(projectRoot, resolved.id, {
      issue_ref: issueRef,
      etag: null,
      gh_updated_at: nowIso,
      label_set: [runCtx.label],
      assignees: [],
      milestone: ms.title || null,
      status: 'open',
      last_synced_at: nowIso,
      last_synced_disk_hash: hashFrontmatter(diskFm),
    });
  } catch (e) {
    warnings.push(`sync-state not recorded: ${e.message}`);
  }

  return {
    ok: true,
    issue_number: n,
    issue_source: found.source,
    created: found.created,
    issue_updated: issueUpdated,
    comment_action: upsert.action,
    comment_id: upsert.comment_id || null,
    project_fields_updated: projectUpdate.fields_updated || [],
    frontmatter_written: frontmatterWritten,
    mapping_written: wm.ok === true,
    chain,
    state,
    warnings: allWarnings(chain),
  };
}

/**
 * cmdGhSyncObjective(cwd, objectiveArg, raw) — CLI entry for `df-tools gh sync <objective>`.
 * Success and `skipped` (github disabled) go to stdout with exit 0; failures are JSON on stderr + exit 1;
 * a GhAuthError is rendered as structured stderr + exit 1.
 */
function cmdGhSyncObjective(cwd, objectiveId, raw) {
  if (!objectiveId) {
    process.stderr.write(JSON.stringify({ error: 'Usage: gh sync <objectiveId>' }, null, 2) + '\n');
    process.exit(1);
    return;
  }

  try {
    const result = syncObjective(objectiveId, cwd);
    if (!result.ok && !result.skipped) {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(1);
      return;
    }
    client.emitResult(result, raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }
}

// ─── TRD 02-03: walkProject (org Project walker) ────────────────────────────

/**
 * Walk all items in a Project v2 (e.g., the org Product Roadmap).
 * Paginates via GraphQL pageInfo.endCursor until hasNextPage=false.
 *
 * Returns { items: [...], warnings: [...] }.
 *
 * Each item:
 *   { item_type: 'issue'|'draft',
 *     issue_ref: 'owner/repo#NN' | null,
 *     title, body,
 *     product, quarter, status,    // from Project custom fields
 *     sub_issues: [{ ref, title, state }] }
 *
 * sub_issues comes from the GitHub-native trackedIssues field. When totalCount===0,
 * scanOrg (in awareness.cjs) falls back to parsing the issue body for task-list bullets.
 *
 * Auth: caller is responsible for requireGhAuth before invoking. walkProject does
 * not check auth — it's a primitive obj 5/6 also reuse with their own auth context.
 */
function walkProject(projectId) {
  if (!projectId) {
    return { items: [], warnings: ['walkProject: projectId is required'] };
  }

  const items = [];
  const warnings = [];
  let cursor = null;
  let pageCount = 0;
  const MAX_PAGES = 100;

  const query = `query($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            content {
              __typename
              ... on Issue {
                number
                title
                body
                repository { nameWithOwner }
                trackedIssues(first: 20) {
                  totalCount
                  nodes { number title state repository { nameWithOwner } }
                }
              }
              ... on DraftIssue { title body }
            }
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
              }
            }
          }
        }
      }
    }
  }`;

  while (true) {
    if (++pageCount > MAX_PAGES) {
      warnings.push(`walkProject: aborted at ${MAX_PAGES} pages — likely an infinite loop`);
      break;
    }

    const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `projectId=${projectId}`];
    if (cursor) args.push('-F', `cursor=${cursor}`);

    const r = _runGh(args);
    if (!r.ok) {
      warnings.push(`walkProject failed: ${r.stderr || 'unknown gh error'}`);
      break;
    }

    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch {
      warnings.push('walkProject: response JSON parse failed');
      break;
    }

    const node = parsed && parsed.data && parsed.data.node;
    if (!node || !node.items || !Array.isArray(node.items.nodes)) {
      warnings.push('walkProject: unexpected response shape');
      break;
    }

    for (const itemNode of node.items.nodes) {
      const c = itemNode && itemNode.content;
      if (!c) continue;

      const fieldsByName = {};
      for (const fv of (itemNode.fieldValues && itemNode.fieldValues.nodes) || []) {
        const fName = fv.field && fv.field.name;
        if (!fName) continue;
        fieldsByName[fName] = fv.name || fv.text || null;
      }

      if (c.__typename === 'DraftIssue') {
        items.push({
          item_type: 'draft',
          issue_ref: null,
          title: c.title || '',
          body: c.body || '',
          product: fieldsByName.Product || null,
          quarter: fieldsByName.Quarter || null,
          status: fieldsByName.Status || null,
          sub_issues: [],
        });
      } else if (c.__typename === 'Issue') {
        const repo = c.repository && c.repository.nameWithOwner;
        const issue_ref = (repo && c.number) ? `${repo}#${c.number}` : null;
        const sub_issues = ((c.trackedIssues && c.trackedIssues.nodes) || []).map(s => ({
          ref: s.repository && s.number ? `${s.repository.nameWithOwner}#${s.number}` : null,
          title: s.title || '',
          state: s.state || 'OPEN',
        }));
        items.push({
          item_type: 'issue',
          issue_ref,
          title: c.title || '',
          body: c.body || '',
          product: fieldsByName.Product || null,
          quarter: fieldsByName.Quarter || null,
          status: fieldsByName.Status || null,
          sub_issues,
        });
      }
    }

    if (!node.items.pageInfo || !node.items.pageInfo.hasNextPage) break;
    cursor = node.items.pageInfo.endCursor || null;
    if (!cursor) break;
  }

  return { items, warnings };
}

// ─── TRD 05-03: readIssueState ────────────────────────────────────────────────

/**
 * Read the state of a GitHub issue via gh CLI.
 * Routes through _runGh injection hook so tests can mock it transitively.
 *
 * @param {string} issueRef - full issue ref, e.g. "owner/repo#NN"
 * @returns {{ ok: bool, status: number, stdout: string, stderr: string }}
 *   stdout is JSON: { state: 'OPEN' | 'CLOSED', closed: bool }
 */
function readIssueState(issueRef) {
  return _runGh(['issue', 'view', issueRef, '--json', 'state,closed']);
}

module.exports = {
  // EXISTING (preserved unchanged — graceful-skip behavior):
  ghStatus,
  cmdGhStatus,
  cmdGhSyncObjectives,
  cmdGhComment,
  cmdGhCloseIssue,
  cmdGhSyncRelease,

  // NEW in TRD 01-02:
  resolveChain,
  findRoadmapIssue,
  addToProject,
  linkSubIssue,
  cmdGhResolve,

  // NEW in TRD 01-03 — hard-fail auth layer:
  requireGhAuth,
  GhAuthError,

  // NEW in TRD 01-04 — sync orchestrator + helpers:
  buildIssueBody,
  buildStickyComment,
  findStickyComment,
  upsertStickyComment,
  updateProjectFields,
  readObjectiveState,
  syncObjective,
  cmdGhSyncObjective,
  readMappingV2,
  writeMappingV2,
  PRODUCT_ROADMAP_FIELDS,

  // NEW in TRD 02-03 — org Project walker:
  walkProject,

  // NEW in TRD 05-03 — issue state reader for stale detection:
  readIssueState,

  // Test hooks (TRD 01-02):
  _resetCache,
  _setRunGh,

  // TRD 06-01: expose _runGh as a callable so external modules can invoke
  // the injected mock without capturing the value at require-time.
  // CRITICAL: This is a getter wrapper — always delegates to current _runGh value.
  _runGh: (...args) => _runGh(...args),
};
