'use strict';

/**
 * GitHub integration for AOForge.
 *
 * One-way push from .aoforge/ -> GitHub via the `gh` CLI. Planning files
 * remain authoritative; if GitHub is unavailable or this module fails the
 * caller must continue without error.
 *
 * Issue ids are persisted to .aoforge/.gh-mapping.json in the v3 shape owned by gh-mapping.cjs
 * (`objectives: { "<id>": { issue_id, state_comment_id, verified_at } }`). Every gh invocation goes through
 * gh-client (ghRead / ghWrite); every command sits behind gh-client.requireEnabled (TRD 46-08).
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
const { output, execGit } = require('./helpers.cjs');
const { hasHelpFlag } = require('./help.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { boldLabelPattern } = require('./text-escape.cjs');
const { recordSync, hashFrontmatter } = require('./sync-state.cjs');
const client = require('./gh-client.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');
const objectiveNameLib = require('./objective-name.cjs');
const { planningRoot } = require('./compat.cjs');

// ─── Test injection + per-process cache (TRD 01-02) ──────────────────────────

// The seam is gh-client's (TRD 46-07/46-08): gh.cjs owns no spawn site, and every gh call here is
// client.ghRead / client.ghWrite. `_setRunGh(fn)` installs `fn` on gh-client (null restores the real
// spawn); the exported `_runGh` is a pure forwarder to whatever gh-client currently runs.
const _clientRunGh = (...a) => client._runGh(...a);
function _setRunGh(fn) {
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
 *   - offline:        true when the failed `gh auth status` was a network outage, not a credential problem
 *                     (TRD 47-12: store mode queues work offline instead of failing)
 */
class GhAuthError extends Error {
  constructor({ message, remediation, scopes_missing = [], offline = false }) {
    super(message);
    this.name = 'GhAuthError';
    this.remediation = remediation;
    this.scopes_missing = scopes_missing;
    this.offline = offline === true;
  }
}

/**
 * True when a failed gh result is a network outage rather than a missing binary or a bad credential.
 * `gh-outbox-flush.classifyFailure` owns the classification (status null / network wording); a missing
 * binary also reports status null, so it is excluded, and gh's own "error connecting to" wording is added.
 */
function isOfflineResult(r) {
  if (!r || typeof r !== 'object') return false;
  const text = `${r.stderr || ''}\n${r.stdout || ''}\n${r.error || ''}`;
  if (/command not found|ENOENT/i.test(text)) return false;
  if (/error connecting to/i.test(text)) return true;
  return require('./gh-outbox-flush.cjs').classifyFailure(r) === 'offline';
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
  const r = client.ghRead(['auth', 'status']);

  if (!r.ok) {
    const stderr = r.stderr || '';
    const offline = isOfflineResult(r);

    // No gh binary: the spawn reports status:null on ENOENT, or stderr says "command not found"
    if (r.status === null || /command not found|ENOENT/i.test(stderr)) {
      throw new GhAuthError({
        message: 'GitHub CLI (gh) is not installed.',
        remediation: 'Install gh from https://cli.github.com',
        offline,
      });
    }

    // Expired token (must check before "not authenticated" catch-all)
    if (/expired/i.test(stderr)) {
      throw new GhAuthError({
        message: 'GitHub CLI token has expired.',
        remediation: 'gh auth refresh',
        offline,
      });
    }

    // Not authenticated (default for any other ok:false)
    throw new GhAuthError({
      message: 'GitHub CLI is not authenticated.',
      remediation: 'gh auth login',
      offline,
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
 * Reads through client.ghRead, so a fake installed with _setRunGh answers it.
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

  const r = client.ghRead(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);

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

  const r = client.ghRead([
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
  const idR = client.ghRead(['api', 'graphql', '-f', `query=${idQuery}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!idR.ok) return { ok: false, error: idR.stderr || 'failed to look up issue node ID' };

  let issueId;
  try {
    issueId = JSON.parse(idR.stdout).data.repository.issue.id;
  } catch {
    return { ok: false, error: 'failed to parse issue node ID from response' };
  }

  // Step 2: Add issue to project via mutation
  const mutation = `mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`;
  const r = client.ghWrite(['api', 'graphql', '-f', `query=${mutation}`, '-F', `projectId=${projectId}`, '-F', `contentId=${issueId}`]);
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
    const r = client.ghRead(['api', 'graphql', '-f', `query=${q}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
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
  const r = client.ghWrite(['api', 'graphql', '-f', `query=${mutation}`, '-F', `issueId=${parentId}`, '-F', `subIssueId=${childId}`]);
  if (!r.ok) return { ok: false, error: r.stderr || 'addSubIssue mutation failed' };

  return { ok: true };
}

/**
 * CLI entry point for `aof-tools gh resolve <objectiveId>`.
 * Reads OBJECTIVE.md + PROJECT.md from cwd, calls resolveChain, writes JSON.
 *
 * Hard-fails on missing/expired/insufficient auth (SC-8, TRD 01-03):
 * requireGhAuth(['project', 'read:project', 'repo']) is called before any gh API
 * calls. On failure, structured JSON error is written to stderr and process exits 1.
 * Stdout stays clean so downstream JSON consumers are not corrupted.
 */
function cmdGhResolve(cwd, objectiveId, raw, argv) {
  const USAGE = 'Usage: aof-tools gh resolve <objectiveId> [--raw]\n' +
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

  // The enabled gate (TRD 46-08): disabled -> skipped, exit 0, zero gh calls.
  if (!gateOrSkip(cwd, raw)) return;

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

  // Any spelling of the objective (2, 02, 02-name); an exact directory name still works.
  const resolvedObj = mappingLib.resolveObjective(cwd, objectiveId);
  const objDirName = resolvedObj && resolvedObj.dir ? resolvedObj.dir : objectiveId;
  const objPath = path.join(planningRoot(cwd), 'objectives', objDirName, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    process.stderr.write(`Error: objective not found: ${objectiveId}\n`);
    process.stderr.write(`  expected: ${objPath}\n`);
    process.stderr.write(`  Hint: run \`aof-tools gh resolve --help\` for usage.\n`);
    process.exit(1);
    return;
  }

  const objContent = fs.readFileSync(objPath, 'utf-8');
  const objFm = extractFrontmatter(objContent) || {};
  objFm._objectiveId = objectiveId;

  const projectPath = path.join(planningRoot(cwd), 'PROJECT.md');
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
  client.emitResult(result, raw, prettyJson);
}

/**
 * `gh status`: the enabled gate, then gh presence (`gh --version`) and auth (`gh auth status`) through the
 * gh-client seam — never `which`, so tests stay hermetic and the one seam sees every gh invocation.
 */
function ghStatus(cwd) {
  const gate = client.requireEnabled(cwd);
  if (gate.skipped) return { enabled: false, reason: gate.reason };
  const version = client.ghRead(['--version']);
  if (!version.ok) {
    return { enabled: false, reason: 'gh CLI not installed (https://cli.github.com)' };
  }
  const auth = client.ghRead(['auth', 'status']);
  if (!auth.ok) {
    return { enabled: false, reason: 'gh not authenticated — run `gh auth login`' };
  }
  return { enabled: true, repo: gate.repo, labels: gate.labels || {}, milestone_prefix: gate.milestone_prefix || 'v' };
}

// ─── ROADMAP parsing ─────────────────────────────────────────────────────────

// `**Goal:**` and `**Goal**:` (the v1.5 ROADMAP form) both read.
const GOAL_RE = new RegExp(boldLabelPattern('Goal') + '\\s*([^\\n]+)', 'i');

function listObjectives(cwd) {
  const roadmapPath = path.join(planningRoot(cwd), 'ROADMAP.md');
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
    const goalMatch = section.match(GOAL_RE);
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

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdGhStatus(cwd, raw) {
  const status = ghStatus(cwd);
  output(status, raw, status.enabled ? 'enabled' : status.reason);
}

/**
 * `aof-tools gh sync-objectives` — DEPRECATED alias of `gh sync --all` (TRD 46-08). One stderr line, then
 * the one sync implementation. The rename lives in skill-route.cjs DF_TOOLS_DEPRECATIONS.
 */
function cmdGhSyncObjectives(cwd, raw) {
  const { DF_TOOLS_DEPRECATIONS } = require('./skill-route.cjs');
  process.stderr.write(`Note: \`gh sync-objectives\` is deprecated; use \`${DF_TOOLS_DEPRECATIONS['gh sync-objectives']}\`.\n`);
  cmdGhSync(cwd, ['--all'], raw);
}

// ─── Targets: objective first, `#N` forces a raw issue (TRD 46-08) ────────────

/**
 * resolveTarget(cwd, target, mapping) — the issue a `comment` / `close-issue` target names.
 *   "#N"                          -> { ok, issue:N, id:null }           (raw issue, forced)
 *   any objective spelling        -> { ok, issue:<mapped issue_id>, id } (mapping v3)
 *   an objective with no mapping  -> { ok:false, error: 'no GitHub issue for objective …; run gh sync …' }
 *   digits that are no objective  -> { ok, issue:N, id:null }           (numeric fallback)
 *   anything else                 -> { ok:false, error }
 * Ambiguity rule: a bare number is tried as an objective id BEFORE it is read as an issue number.
 */
function resolveTarget(cwd, target, mapping) {
  const t = String(target == null ? '' : target).trim();
  const forced = /^#(\d+)$/.exec(t);
  if (forced) return { ok: true, issue: Number(forced[1]), id: null };
  const resolved = t === '' ? null : mappingLib.resolveObjective(cwd, t);
  if (resolved) {
    const entry = mappingLib.getEntry(mapping, resolved.id);
    if (entry && entry.issue_id) return { ok: true, issue: entry.issue_id, id: resolved.id };
    return { ok: false, error: `no GitHub issue for objective ${resolved.id}; run gh sync ${resolved.id}` };
  }
  if (/^\d+$/.test(t)) return { ok: true, issue: Number(t), id: null };
  return { ok: false, error: `unknown objective or issue: ${JSON.stringify(t)} (use #N for a raw issue number)` };
}

// The enabled gate as a command result: `skipped` (exit 0, zero gh calls) or the gate itself.
function gateOrSkip(cwd, raw) {
  const gate = client.requireEnabled(cwd);
  if (gate.skipped) {
    client.emitResult({ ok: false, skipped: true, reason: gate.reason }, raw, '');
    return null;
  }
  return gate;
}

// Read mapping v3 (legacy v1/v2 files are migrated in memory) and resolve a target against it.
function resolveCommandTarget(cwd, target) {
  const report = mappingLib.readMappingV3WithReport(cwd);
  if (report.error) return { ok: false, error: report.error };
  return resolveTarget(cwd, target, report.mapping);
}

// `comment` argv: positionals <target> <body>, plus `--kind <k>` / `--kind=<k>` anywhere after the target.
function parseCommentArgs(argv) {
  const positional = [];
  let kind = null;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] == null ? '' : String(argv[i]);
    if (tok === '--kind') kind = argv[++i] == null ? '' : String(argv[i]);
    else if (tok.startsWith('--kind=')) kind = tok.slice('--kind='.length);
    else positional.push(tok);
  }
  return { target: positional[0], body: positional[1], kind };
}

/**
 * `aof-tools gh comment <objective|#issue> <body|@file:path> [--kind k]`.
 * Accepts the argv array (`cmdGhComment(cwd, args, raw)`) or the legacy positional shape
 * (`cmdGhComment(cwd, target, body, raw)`). A comment on a known objective opens with
 * `<!-- aoforge:id=<id> kind=<kind> -->` (kind defaults to `comment`); a raw `#N` with no objective is
 * posted as written (`marker:false`). Exit 1 on any failure; `skipped` (github disabled) exits 0.
 */
function cmdGhComment(cwd, argsOrTarget, bodyOrRaw, maybeRaw) {
  let target;
  let body;
  let kind;
  let raw;
  if (Array.isArray(argsOrTarget)) {
    ({ target, body, kind } = parseCommentArgs(argsOrTarget));
    raw = bodyOrRaw;
  } else {
    target = argsOrTarget;
    body = bodyOrRaw;
    raw = maybeRaw;
  }

  const gate = gateOrSkip(cwd, raw);
  if (!gate) return;
  const fail = (error, extra = {}) => client.emitResult({ ok: false, error, ...extra }, raw, '');
  if (!target || body === undefined) {
    fail('Usage: gh comment <objective|#issue> <body|@file:path> [--kind k]');
    return;
  }

  let text = String(body);
  if (text.startsWith('@file:')) {
    const filePath = text.slice('@file:'.length);
    if (!fs.existsSync(filePath)) {
      fail(`File not found: ${filePath}`);
      return;
    }
    text = fs.readFileSync(filePath, 'utf-8');
  }

  const t = resolveCommandTarget(cwd, target);
  if (!t.ok) {
    fail(t.error);
    return;
  }

  let finalBody = text;
  if (t.id) {
    try {
      finalBody = bodyLib.withCommentMarker(t.id, kind || 'comment', text);
    } catch (e) {
      fail(e.message, { issue: t.issue });
      return;
    }
  }

  const r = client.ghWrite(['issue', 'comment', String(t.issue), '--repo', gate.repo, '--body', finalBody]);
  client.emitResult({
    ok: r.ok,
    issue: t.issue,
    id: t.id,
    kind: t.id ? (kind || 'comment') : null,
    marker: Boolean(t.id),
    error: r.ok ? null : (r.error || r.stderr || r.stdout || 'gh issue comment failed'),
    url: r.ok ? r.stdout : null,
  }, raw, '');
}

/**
 * `aof-tools gh close-issue <objective|#issue> [comment]`. Same target resolution as `comment`; the
 * closing comment of a known objective carries a `kind=close` marker. Exit 1 on failure.
 */
function cmdGhCloseIssue(cwd, target, comment, raw) {
  const gate = gateOrSkip(cwd, raw);
  if (!gate) return;
  const t = resolveCommandTarget(cwd, target);
  if (!t.ok) {
    client.emitResult({ ok: false, error: t.error }, raw, '');
    return;
  }
  const args = ['issue', 'close', String(t.issue), '--repo', gate.repo];
  if (comment) args.push('--comment', t.id ? bodyLib.withCommentMarker(t.id, 'close', comment) : String(comment));
  const r = client.ghWrite(args);
  client.emitResult({
    ok: r.ok,
    issue: t.issue,
    id: t.id,
    marker: Boolean(t.id && comment),
    error: r.ok ? null : (r.error || r.stderr || r.stdout || 'gh issue close failed'),
  }, raw, '');
}

function cmdGhSyncRelease(cwd, tag, raw) {
  const gate = gateOrSkip(cwd, raw);
  if (!gate) return;
  if (!tag) {
    client.emitResult({ ok: false, error: 'Usage: gh sync-release <tag>' }, raw, '');
    return;
  }

  // Find previous tag
  const prevTag = execGit(cwd, ['describe', '--tags', '--abbrev=0', `${tag}^`]);
  const prev = prevTag.exitCode === 0 && prevTag.stdout ? prevTag.stdout : null;
  const range = prev ? `${prev}..${tag}` : tag;

  // Pull SUMMARY.md and metadata commits in range
  const log = execGit(cwd, ['log', range, '--no-merges', '--pretty=format:%h|%s', '--name-only', '-z']);
  const logOk = log.exitCode === 0 && Boolean(log.stdout);

  const lines = [`# Release ${tag}`, '', prev ? `Changes since ${prev}.` : 'Initial release.', ''];

  // Group commits by type prefix (feat/fix/docs/etc)
  const groups = { feat: [], fix: [], perf: [], refactor: [], chore: [], docs: [], other: [] };
  if (logOk) {
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
  if (logOk) {
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

  // Edit the release when it exists, else create it. Every call goes through the gh-client seam.
  const existing = client.ghRead(['release', 'view', tag, '--repo', gate.repo]);
  const r = existing.ok
    ? client.ghWrite(['release', 'edit', tag, '--repo', gate.repo, '--notes-file', tmpNotes])
    : client.ghWrite(['release', 'create', tag, '--repo', gate.repo, '--title', tag, '--notes-file', tmpNotes]);

  client.emitResult({
    ok: r.ok, tag, prev_tag: prev, range, notes_file: tmpNotes,
    action: existing.ok ? 'edited' : 'created',
    error: r.ok ? null : (r.error || r.stderr || r.stdout || 'gh release failed'),
    url: r.ok ? r.stdout : null,
  }, raw, '');
}

// ─── TRD 01-04: syncObjective helpers + orchestrator ─────────────────────────

/**
 * readMappingV2(cwd) — kept for importers; v3 only (TRD 46-08). Returns the v3 mapping (legacy v1/v2 files
 * are migrated in memory; nothing is written).
 */
function readMappingV2(cwd) {
  return mappingLib.readMappingV3(cwd);
}

/**
 * writeMappingV2(cwd, mapping) — kept for importers; v3 only (TRD 46-08). Any legacy-shaped mapping is
 * migrated first, so the file on disk is always v3. Returns writeMappingV3's `{ok, path}` | `{ok:false, error}`.
 */
function writeMappingV2(cwd, mapping) {
  return mappingLib.writeMappingV3(cwd, mappingLib.migrateMapping(mapping).mapping);
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
  // Same text as gh-body.buildObjectiveSections: `state.store === true` names the issue as the record.
  lines.push(
    '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude). ' +
      (state.store === true
        ? 'This issue is the source of truth (store mode); `.aoforge/` in a checkout is a local cache rebuilt from it._'
        : `Source of truth: \`.aoforge/objectives/${objId}/\` in this repo._`)
  );
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
  lines.push(`**AOForge state — last synced ${isoTimestamp}**`);
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
 * `aoforge:id=<id> kind=state` marker or the legacy `<!-- df:state -->`. Null when absent or unreadable.
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
  const objDir = path.join(planningRoot(projectRoot), 'objectives', objectiveId);
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
  const git = execGit(projectRoot, ['log', '-1', '--pretty=%h|%s', '--', objDir]);
  let last_commit = null;
  if (git.exitCode === 0 && git.stdout) {
    const [sha, ...rest] = git.stdout.split('|');
    last_commit = { sha, subject: rest.join('|') };
  }

  // Branch
  const branchR = execGit(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchR.exitCode === 0 && branchR.stdout ? branchR.stdout : null;

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
    // ROADMAP name, then the OBJECTIVE.md title heading, then the directory slug without its number prefix.
    // A fresh store has no ROADMAP entry (the view is generated from the issues), so the directory name must
    // never be the title: `[Objective 1] 01-hello-cli`. The PR title takes the same chain (objective-name.cjs, STOR-02).
    name: objectiveNameLib.objectiveDisplayName({
      roadmapName: found && found.name,
      objDir,
      dirName: objectiveId,
      number,
    }),
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
  const projectPath = path.join(planningRoot(projectRoot), 'PROJECT.md');
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

// ─── Authoritative store (TRD 47-12) ─────────────────────────────────────────
//
// `github.store: true` opts a project into the store push path: objective 46's find-or-create still owns the
// objective issue, but its body edit, the TRD sub-issues, edges, comments and wiki pages go through the
// outbox (gh-hierarchy.pushHierarchy -> gh-outbox-flush.flush). Every new step below is reached only through
// `storeEnabled(cfg)` (via `plan`, which stays null otherwise), so a project without the flag behaves exactly
// as it did in objective 46. Still direct writes in store mode, deferred to objective 48: the objective-issue
// create, the label/milestone bootstraps, the sticky state comment and Project v2 fields (idempotent).

/** Strict boolean: the string "true" is not store mode. */
function storeEnabled(cfg) {
  return Boolean(cfg && cfg.github && cfg.github.store === true);
}

const OFFLINE_WARNING = 'offline: state comment and Project fields not updated (GitHub is unreachable); '
  + 'the hierarchy was queued, run `aof-tools gh outbox flush` once online';

/** `.aoforge/`-relative paths of every file a push of `plan` carried to GitHub (the pull-side baseline). */
function pushedCachePaths(plan) {
  const base = `objectives/${plan.objective.dir}`;
  const rels = plan.trds.map((t) => `${base}/${t.file}`);
  for (const s of plan.summaries) rels.push(`${base}/${s.file}`);
  if (plan.verification) rels.push(`${base}/${plan.verification.file}`);
  for (const rel of plan.pages) rels.push(rel);
  return [...new Set(rels)];
}

/**
 * The `Roadmap` page (D-28): rendered from the issues as GitHub holds them, never from the local ROADMAP.md,
 * and written only after a flush that completed. Conflicts and read failures are warnings: the page is a view,
 * the next complete sync refreshes it. -> {status:'pushed'|'unchanged'|'skipped', warnings:[string]}
 */
function pushRoadmapPage(projectRoot, modes) {
  const skipped = (why) => ({ status: 'skipped', warnings: [`Roadmap page not refreshed: ${why}`] });
  const pages = modes && modes.pages;
  if (pages !== 'wiki' && pages !== 'docs') {
    return skipped(pages === 'blocked' ? (modes.pages_message || 'the wiki is not available') : 'no page backend was detected');
  }
  const cacheLib = require('./gh-cache.cjs');
  const wikiLib = require('./gh-wiki.cjs');
  const model = cacheLib.readRemoteModel(projectRoot, { pagesMode: pages });
  if (!model || model.ok !== true) return skipped(`could not read the issues (${model && model.error ? model.error : 'no answer'})`);
  let text;
  try {
    text = cacheLib.renderRoadmap(model);
  } catch (e) {
    return skipped(e.message);
  }
  if (pages === 'wiki') {
    const cloned = wikiLib.ensureClone(projectRoot, {});
    if (!cloned.ok) return skipped(`could not open the wiki clone (${cloned.error})`);
  }
  const store = wikiLib.openStore(projectRoot, { mode: pages });
  const written = store.writePage('Roadmap', text);
  if (!written.ok) return skipped(`could not write the page (${written.error})`);
  if (!written.changed) return { status: 'unchanged', warnings: [] };
  const pushed = store.push({ message: 'aoforge: refresh the Roadmap page' });
  if (!pushed.ok) {
    const why = pushed.conflict ? 'the wiki has a rebase conflict' : (pushed.error || 'the push failed');
    return { status: 'skipped', warnings: [`Roadmap page written locally but not pushed: ${why}`] };
  }
  return { status: 'pushed', warnings: [] };
}

/** 46's sections without `trds`: the store derives that one (native line / task list). */
function storeObjectiveSections(sections) {
  const { trds: _derived, ...rest } = sections;
  return rest;
}

/**
 * The Roadmap page is a wiki commit made AFTER the flush, so the objective body's `wiki` section (the revision
 * of the clone at patch time) is one commit behind it, and the next unchanged sync would patch it for no
 * reason. Re-queue just the objective `patch-body` op(s) and flush once more so a sync ends converged:
 * the following unchanged `gh sync` performs zero writes. Only needed for the wiki backend.
 * -> [warning]
 */
function refreshWikiRevisions(projectRoot, entries) {
  const hierarchyLib = require('./gh-hierarchy.cjs');
  const ops = entries.flatMap(({ plan, sections }) => hierarchyLib
    .buildOps(plan, { objectiveSections: storeObjectiveSections(sections) })
    .filter((op) => op.kind === 'patch-body' && op.target && op.target.id === plan.objective.id));
  if (ops.length === 0) return [];
  const queued = require('./gh-outbox.cjs').enqueue(projectRoot, ops);
  if (!queued.ok) return [`objective wiki revision not refreshed: ${queued.error}`];
  const flush = require('./gh-outbox-flush.cjs').flush(projectRoot, { wait: true });
  if (flush.status === 'flushed') return [];
  return [`objective wiki revision not refreshed: the outbox is ${flush.status}${flush.reason ? ` (${flush.reason})` : ''}`];
}

/**
 * After a flush that completed: refresh the Roadmap page, then record the cache baseline of every pushed file
 * so a later `pull --all` can tell "untouched locally" from "edited locally".
 * `entries` are `{plan, sections}` per pushed objective. -> {roadmap_page, warnings}
 */
function completeStorePush(projectRoot, modes, entries) {
  const warnings = [];
  const roadmap = pushRoadmapPage(projectRoot, modes);
  warnings.push(...roadmap.warnings);
  if (roadmap.status === 'pushed' && modes && modes.pages === 'wiki') warnings.push(...refreshWikiRevisions(projectRoot, entries));
  try {
    const cacheLib = require('./gh-cache.cjs');
    const rels = [...new Set(entries.flatMap((e) => pushedCachePaths(e.plan)))];
    const rec = cacheLib.recordCacheBaseline(projectRoot, rels);
    if (rec.invalid.length > 0) warnings.push(`cache baseline skipped unsafe paths: ${rec.invalid.join(', ')}`);
  } catch (e) {
    warnings.push(`cache baseline not recorded: ${e.message}`);
  }
  return { roadmap_page: roadmap.status, warnings };
}

/** What a flush that did not complete means for the sync result: a marker plus a warning, never a failure. */
function flushNotice(flush) {
  if (flush.status === 'halted') {
    const h = flush.halted || {};
    return `outbox halted (${h.reason || 'unknown'}${h.detail ? `: ${h.detail}` : ''}); see \`aof-tools gh outbox status\``;
  }
  if (flush.status === 'pending') {
    return `outbox pending${flush.reason ? ` (${flush.reason})` : ''}; \`aof-tools gh outbox flush\` finishes the job`;
  }
  if (flush.status === 'running') return 'another outbox flush is running; the queued ops will be applied by it';
  return null;
}

/**
 * Queue the objective's hierarchy (and flush it unless `deferFlush`). One body writer: 46's summary/criteria/
 * footer go in as `objectiveSections` (`trds` is derived by the store as the native line / task list).
 * -> {ok:true, hierarchy:{enqueued, coalesced, ops, outbox, degraded}, outbox?, roadmap_page?, modes, warnings, flush?}
 *  | {ok:false, error, message?, warnings}
 */
function pushStoreHierarchy(projectRoot, resolved, sections, plan, opts = {}) {
  const hierarchyLib = require('./gh-hierarchy.cjs');
  const res = hierarchyLib.pushHierarchy(projectRoot, resolved.id, {
    objectiveSections: storeObjectiveSections(sections),
    flush: opts.deferFlush !== true,
    flushOptions: { wait: true },
  });
  if (res.skipped) {
    return { ok: true, hierarchy: { enqueued: 0, coalesced: 0, ops: 0, outbox: 'skipped', degraded: [] }, modes: null, warnings: [`store push skipped: ${res.reason}`] };
  }
  const warnings = [...(res.warnings || [])];
  if (res.flush) for (const w of res.flush.warnings || []) warnings.push(w.message || String(w));
  if (!res.ok) {
    const flushError = res.flush && res.flush.status === 'error' ? res.flush.error : null;
    return {
      ok: false,
      error: res.refused || (flushError ? 'outbox_flush_failed' : 'store_push_failed'),
      message: res.message || res.error || flushError || 'the hierarchy push failed',
      refused: res.refused,
      warnings,
    };
  }

  const out = {
    ok: true,
    modes: res.modes,
    hierarchy: {
      enqueued: res.enqueued.length,
      coalesced: res.coalesced.length,
      ops: res.ops,
      outbox: res.flush ? res.flush.status : 'queued',
      degraded: res.degraded,
    },
    warnings,
    flush: res.flush || null,
  };
  if (!res.flush) return out;

  const notice = flushNotice(res.flush);
  if (res.flush.status === 'flushed') {
    const done = completeStorePush(projectRoot, res.modes, [{ plan, sections }]);
    out.roadmap_page = done.roadmap_page;
    warnings.push(...done.warnings);
  } else {
    out.roadmap_page = 'skipped';
    if (notice) {
      out.outbox = res.flush.status;
      warnings.push(notice);
      warnings.push('Roadmap page not refreshed: the outbox has not finished; the next complete sync refreshes it');
    }
  }
  return out;
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
function syncObjective(objectiveArg, projectRoot, opts = {}) {
  const issueLib = require('./gh-issue.cjs');
  const milestoneLib = require('./gh-milestone.cjs');
  const { setFrontmatterField } = require('./frontmatter.cjs');

  // 1. Enabled gate + run context (zero gh calls). `opts.runCtx` is a context shared by `syncAll`: one
  //    label bootstrap, one marker scan and one auth check per scope set for the whole run, and the
  //    mapping is written once by the caller at the end instead of here.
  const shared = opts.runCtx || null;
  const runCtx = shared || issueLib.createRunContext(projectRoot);
  if (runCtx.skipped) return { ok: false, skipped: true, reason: runCtx.reason, warnings: [] };
  if (runCtx.ok === false) return { ok: false, error: runCtx.error, warnings: [] };

  const warnings = [];
  const allWarnings = (chain) => [...new Set([...runCtx.warnings, ...((chain && chain.warnings) || []), ...warnings])];

  // 2. Any spelling of the objective.
  const resolved = mappingLib.resolveObjective(projectRoot, objectiveArg);
  if (!resolved) return { ok: false, error: `objective not found: ${objectiveArg}`, warnings: allWarnings() };

  const objPath = resolved.dir
    ? path.join(planningRoot(projectRoot), 'objectives', resolved.dir, 'OBJECTIVE.md')
    : null;
  let objFm = {};
  if (objPath && fs.existsSync(objPath)) {
    try { objFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {}; } catch { objFm = {}; }
  }
  objFm._objectiveId = resolved.id;

  // 2b. Store mode (opt-in): the budget / cycle gate runs on local files only, BEFORE any gh call, so an
  //     over-budget TRD means no issue at all is created, not even the objective issue (SC2). `plan` stays
  //     null outside store mode and for an objective with no directory yet (nothing to push).
  const storeMode = storeEnabled(client.readConfig(projectRoot));
  let plan = null;
  if (storeMode) {
    if (!resolved.dir) {
      warnings.push(`store: objective ${resolved.id} has no directory under .aoforge/objectives yet; its hierarchy was not pushed`);
    } else {
      plan = require('./gh-hierarchy.cjs').planPush(projectRoot, resolved.id);
      if (!plan.ok) {
        return {
          ok: false,
          error: plan.error || plan.message,
          ...(plan.refused ? { refused: plan.refused } : {}),
          ...(plan.message ? { message: plan.message } : {}),
          ...(plan.over ? { over: plan.over } : {}),
          warnings: allWarnings(),
        };
      }
    }
  }

  // 3. Auth before any other gh call; project scopes only when a project resolves (Pitfall 13).
  const projectFm = readProjectFrontmatter(projectRoot);
  const projectCtx = { github_repo: projectFm.github_repo || null, org_project: projectFm.org_project || null };
  const orgProject = objFm.org_project || projectCtx.org_project || null;
  const scopes = orgProject ? ['project', 'read:project', 'repo'] : ['repo'];
  const authKey = scopes.join(',');
  let offline = Boolean(storeMode && runCtx._offline);
  if (!offline && (!Array.isArray(runCtx._authChecked) || !runCtx._authChecked.includes(authKey))) {
    try {
      requireGhAuth(scopes);
      runCtx._authChecked = [...(runCtx._authChecked || []), authKey];
    } catch (e) {
      // Store mode queues work while GitHub is unreachable; every other auth failure is still a hard error.
      if (!(storeMode && e && e.name === 'GhAuthError' && e.offline === true)) throw e;
      offline = true;
      runCtx._offline = true;
    }
  }
  const chain = offline ? { org_project: null, warnings: [] } : resolveChain(objFm, projectCtx);

  // 4. Disk state and the managed sections.
  const state = resolved.dir ? readObjectiveState(resolved.dir, projectRoot) : roadmapOnlyState(projectRoot, resolved);
  const sections = bodyLib.buildObjectiveSections({ ...state, objectiveId: resolved.id, dir: resolved.dir, store: storeMode });
  const initial = bodyLib.mergeManaged('', sections, resolved.id);
  if (!initial.ok) return { ok: false, error: initial.error, warnings: allWarnings(chain) };

  // 4b. Offline (store mode): an objective that already has an issue still gets its hierarchy queued; the
  //     live 46 steps (marker scan, state comment, Project fields) are skipped. An unmapped objective cannot
  //     be created offline, so that is an error.
  const offlineResult = () => {
    const mapped = mappingLib.getEntry(runCtx.mapping, resolved.id);
    if (!mapped || !plan) {
      const why = !mapped
        ? `objective ${resolved.id} has no issue yet; it cannot be created offline`
        : `objective ${resolved.id} has no directory, so there is nothing to queue`;
      return { ok: false, error: 'offline', message: `GitHub is unreachable and ${why}`, warnings: allWarnings(chain) };
    }
    warnings.push(OFFLINE_WARNING);
    const queued = pushStoreHierarchy(projectRoot, resolved, sections, plan, { deferFlush: true });
    for (const w of queued.warnings) warnings.push(w);
    if (!queued.ok) return { ok: false, error: queued.error, message: queued.message, issue_number: mapped.issue_id, warnings: allWarnings(chain) };
    return {
      ok: true,
      issue_number: mapped.issue_id,
      issue_source: 'mapping',
      created: false,
      issue_updated: false,
      comment_action: 'skipped',
      comment_id: null,
      project_fields_updated: [],
      frontmatter_written: false,
      mapping_written: false,
      hierarchy: { ...queued.hierarchy, outbox: 'pending' },
      roadmap_page: 'skipped',
      outbox: 'pending',
      chain,
      state,
      warnings: allWarnings(chain),
      _store: { plan, sections, modes: queued.modes },
    };
  };
  if (offline) return offlineResult();

  // 5. Find or create (the only create path; duplicates and conflicts are errors, never a create).
  const found = issueLib.findOrCreateObjectiveIssue(runCtx, resolved, { name: state.name, createBody: initial.body });
  if (!found.ok) {
    if (plan && mappingLib.getEntry(runCtx.mapping, resolved.id) && isOfflineResult({ error: found.message, stderr: found.stderr })) {
      runCtx._offline = true;
      return offlineResult();
    }
    return { ...found, warnings: allWarnings(chain) };
  }

  const repo = runCtx.repo;
  const n = found.issue_number;
  const issueRef = `${repo}#${n}`;

  // 6. Merge managed sections; edit only when one changed. Human text outside sections is kept.
  let issueUpdated = false;
  let finalBody = found.body || '';
  // Store mode: the flusher's `patch-body` is the ONE writer of the objective body (see 10b), so this
  // direct edit is skipped; a second writer would fight it over the same managed sections.
  if (!found.created && !plan) {
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
  // Store mode persists even under a shared run context: pushHierarchy and the flusher read the mapping from
  // disk, and a TRD entry the flusher writes must never be overwritten by a stale in-memory copy afterwards
  // (the flush therefore always runs AFTER this write).
  const wm = shared && !plan ? { ok: false, deferred: true } : mappingLib.writeMappingV3(projectRoot, runCtx.mapping);
  if (!wm.ok && !wm.deferred) warnings.push(`mapping not written: ${wm.error}`);

  // 10b. Store mode: queue the hierarchy and (unless the caller defers to flush once) flush it. A completed
  //      flush refreshes the Roadmap page and the cache baseline. `halted` / `pending` are the outbox's
  //      report, not a sync failure.
  let stored = null;
  if (plan) {
    stored = pushStoreHierarchy(projectRoot, resolved, sections, plan, { deferFlush: opts.deferFlush === true });
    for (const w of stored.warnings) warnings.push(w);
    if (!stored.ok) {
      return {
        ok: false,
        error: stored.error,
        message: stored.message,
        ...(stored.refused ? { refused: stored.refused } : {}),
        issue_number: n,
        warnings: allWarnings(chain),
      };
    }
  }

  // 11. Sync-state under the same id. The baseline's gh_updated_at must be GitHub's own updatedAt, read
  //     after the last write above: pull's "GitHub unchanged since last sync" check compares it verbatim,
  //     so local now would make every pull after a push look like drift (46-09). A failed read degrades to
  //     local now with a warning; the sync itself already succeeded. In store mode the flusher edits the
  //     objective body, so this runs after the flush (a deferred flush runs it from `syncAll` via finalize).
  const recordBaseline = (sink) => {
    let ghUpdatedAt = nowIso;
    const live = client.ghRead(['issue', 'view', String(n), '--repo', repo, '--json', 'updatedAt']);
    try {
      const parsed = live.ok ? JSON.parse(live.stdout) : null;
      if (parsed && typeof parsed.updatedAt === 'string' && parsed.updatedAt) ghUpdatedAt = parsed.updatedAt;
      else sink.push(`sync-state baseline uses local time: could not read updatedAt for #${n}`);
    } catch {
      sink.push(`sync-state baseline uses local time: could not read updatedAt for #${n}`);
    }
    try {
      let diskFm = {};
      if (objPath && fs.existsSync(objPath)) diskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
      const ms = milestoneLib.resolveObjectiveMilestone(projectRoot, resolved.dir, runCtx.prefix);
      recordSync(projectRoot, resolved.id, {
        issue_ref: issueRef,
        etag: null,
        gh_updated_at: ghUpdatedAt,
        label_set: [runCtx.label],
        assignees: [],
        milestone: ms.title || null,
        status: 'open',
        last_synced_at: nowIso,
        last_synced_disk_hash: hashFrontmatter(diskFm),
      });
    } catch (e) {
      sink.push(`sync-state not recorded: ${e.message}`);
    }
  };
  const deferred = Boolean(stored && opts.deferFlush === true);
  if (!deferred) recordBaseline(warnings);

  const result = {
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
  if (stored) {
    result.hierarchy = stored.hierarchy;
    if (stored.roadmap_page) result.roadmap_page = stored.roadmap_page;
    if (stored.outbox) result.outbox = stored.outbox;
    if (deferred) {
      result._store = {
        plan,
        sections,
        modes: stored.modes,
        finalize: () => {
          const sink = [];
          recordBaseline(sink);
          return sink;
        },
      };
    }
  }
  return result;
}

/**
 * cmdGhSyncObjective(cwd, objectiveArg, raw) — CLI entry for `aof-tools gh sync <objective>`.
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
    if (renderAuthError(e)) return;
    throw e;
  }
}

/** A GhAuthError as structured JSON on stderr + exit 1. Returns false (and does nothing) for any other error. */
function renderAuthError(e) {
  if (!e || e.name !== 'GhAuthError') return false;
  process.stderr.write(JSON.stringify({
    error: e.message,
    remediation: e.remediation,
    scopes_missing: e.scopes_missing,
  }, null, 2) + '\n');
  process.exit(1);
  return true;
}

// One line per objective in a `sync --all` result; the full chain/state stay out of the JSON.
function summarizeSync(entry, r) {
  const out = { id: entry.id, dir: entry.dir, ok: r.ok === true };
  if (r.ok) {
    Object.assign(out, {
      issue_number: r.issue_number,
      created: r.created,
      issue_updated: r.issue_updated,
      comment_action: r.comment_action,
    });
    if (r.hierarchy) out.hierarchy = r.hierarchy;
    if (r.outbox) out.outbox = r.outbox;
  } else {
    out.error = r.error || 'sync failed';
    if (r.message) out.message = r.message;
    if (r.refused) out.refused = r.refused;
    if (r.over) out.over = r.over;
    if (r.issue_number) out.issue_number = r.issue_number;
  }
  out.warnings = r.warnings || [];
  return out;
}

/**
 * syncAll(root) — `gh sync --all`: every objective (listObjectiveIndex: dirs ∪ ROADMAP headers, numeric
 * order) through ONE run context, so the label bootstrap, the marker scan and the auth check happen once.
 * A failing objective does not stop the rest. The mapping is written once, at the end.
 *
 * Store mode (`github.store: true`, TRD 47-12): every objective only ENQUEUES its hierarchy; after the loop and
 * the final mapping write the outbox is flushed ONCE, and a completed flush refreshes the Roadmap page and the
 * cache baseline. The result then also carries `hierarchy: {outbox, objectives}` and `roadmap_page`.
 *
 * Returns { ok: failed === 0, repo, results: [{id, dir, ok, ...}], failed, mapping_written, warnings }
 *       | { ok:false, skipped:true, reason, results:[], failed:0 }  (github disabled; zero gh calls)
 * Throws GhAuthError (after persisting what was synced) when gh is missing or unauthenticated.
 */
function syncAll(root) {
  const issueLib = require('./gh-issue.cjs');
  const runCtx = issueLib.createRunContext(root);
  if (runCtx.skipped) return { ok: false, skipped: true, reason: runCtx.reason, results: [], failed: 0 };
  if (runCtx.ok === false) return { ok: false, error: runCtx.error, results: [], failed: 0 };

  const results = [];
  const stores = [];
  const storeMode = storeEnabled(client.readConfig(root));
  const index = mappingLib.listObjectiveIndex(root);
  for (const entry of index) {
    let r;
    try {
      r = syncObjective(entry.id, root, { runCtx, deferFlush: storeMode });
    } catch (e) {
      if (e && e.name === 'GhAuthError') {
        if (results.some((x) => x.ok)) mappingLib.writeMappingV3(root, runCtx.mapping);
        throw e;
      }
      r = { ok: false, error: (e && e.message) || String(e), warnings: [] };
    }
    const row = summarizeSync(entry, r);
    results.push(row);
    if (r._store) stores.push({ row, store: r._store });
  }

  const warnings = [...runCtx.warnings];
  if (index.length === 0) warnings.push('no objectives found (.aoforge/objectives/ and ROADMAP.md are empty)');
  const wm = mappingLib.writeMappingV3(root, runCtx.mapping);
  if (!wm.ok) warnings.push(`mapping not written: ${wm.error}`);
  const failed = results.filter((x) => !x.ok).length;
  const out = { ok: failed === 0, repo: runCtx.repo, results, failed, mapping_written: wm.ok === true, warnings: [...new Set(warnings)] };

  // Store mode: one flush for the whole run, after the final mapping write (the flusher writes TRD entries
  // into the mapping on disk and a stale in-memory copy must never overwrite them).
  if (storeMode && stores.length > 0) finishStoreRun(root, out, stores);
  return out;
}

/**
 * The single flush of a store-mode `sync --all`: flush, then (only when it completed) the Roadmap page and the
 * cache baseline, then each objective's sync-state baseline. Mutates `out` and the per-objective rows.
 */
function finishStoreRun(root, out, stores) {
  const flush = require('./gh-outbox-flush.cjs').flush(root, { wait: true });
  out.hierarchy = { outbox: flush.status, objectives: stores.length };
  const note = (message) => { out.warnings = [...new Set([...out.warnings, message])]; };
  for (const w of flush.warnings || []) note(w.message || String(w));

  const label = (row) => { if (row.hierarchy) row.hierarchy = { ...row.hierarchy, outbox: flush.status }; };
  for (const { row } of stores) label(row);

  if (flush.status === 'error') {
    out.ok = false;
    out.error = 'outbox_flush_failed';
    note(`outbox flush failed: ${flush.error || 'unknown error'}`);
    out.roadmap_page = 'skipped';
    return;
  }
  if (flush.status !== 'flushed') {
    const notice = flushNotice(flush);
    if (notice) {
      out.outbox = flush.status;
      for (const { row } of stores) if (row.ok && !row.outbox) row.outbox = flush.status;
      note(notice);
    }
    out.roadmap_page = 'skipped';
    note('Roadmap page not refreshed: the outbox has not finished; the next complete sync refreshes it');
    return;
  }

  const modes = (stores.find((x) => x.store.modes) || { store: {} }).store.modes || null;
  const done = completeStorePush(root, modes, stores.map((x) => ({ plan: x.store.plan, sections: x.store.sections })));
  out.roadmap_page = done.roadmap_page;
  for (const w of done.warnings) note(w);
  for (const { row, store } of stores) {
    if (typeof store.finalize !== 'function') continue;
    row.warnings = [...new Set([...(row.warnings || []), ...store.finalize()])];
  }
}

const SYNC_USAGE = [
  'Usage: aof-tools gh sync [<objective>|--all] [--raw]',
  '  gh sync <objective>  push one objective (any spelling: 2, 02, 02-name) to its GitHub issue',
  '  gh sync --all        push every objective through one run context (bare `gh sync` does the same)',
  '  Exit 1 when any objective failed; a project with github.enabled off is skipped with exit 0.',
  '  `gh sync-objectives` is a deprecated alias of `gh sync --all`.',
].join('\n') + '\n';

/**
 * cmdGhSync(cwd, args, raw) — `aof-tools gh sync [<objective>|--all]`. `--help` anywhere prints usage and
 * exits 0 (issue #100 finding 4). `--all` or no positional -> syncAll; else cmdGhSyncObjective.
 */
function cmdGhSync(cwd, args, raw) {
  const list = (Array.isArray(args) ? args : [args]).filter((a) => a !== undefined && a !== null).map(String);
  if (hasHelpFlag(list)) {
    process.stdout.write(SYNC_USAGE);
    process.exit(0);
    return;
  }
  const positional = list.filter((a) => !a.startsWith('-'));
  if (list.includes('--all') || positional.length === 0) {
    let result;
    try {
      result = syncAll(cwd);
    } catch (e) {
      if (renderAuthError(e)) return;
      throw e;
    }
    client.emitResult(result, raw, '');
    return;
  }
  cmdGhSyncObjective(cwd, positional[0], raw);
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

    const r = client.ghRead(args);
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
 * Reads through client.ghRead, so a fake installed with _setRunGh answers it.
 *
 * @param {string} issueRef - full issue ref, e.g. "owner/repo#NN"
 * @returns {{ ok: bool, status: number, stdout: string, stderr: string }}
 *   stdout is JSON: { state: 'OPEN' | 'CLOSED', closed: bool }
 */
function readIssueState(issueRef) {
  return client.ghRead(['issue', 'view', issueRef, '--json', 'state,closed']);
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

  // TRD 46-08 — one push command:
  syncAll,
  storeEnabled,
  cmdGhSync,
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

  // TRD 06-01: expose _runGh as a callable so external modules can invoke the injected mock
  // without capturing the value at require-time. A forwarder to gh-client's current runGh.
  _runGh: _clientRunGh,
};
