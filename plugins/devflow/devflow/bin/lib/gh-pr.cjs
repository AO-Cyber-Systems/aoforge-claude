'use strict';

// gh-pr.cjs (TRD 49-09) — the objective branch and its one draft pull request (objective 49, GPR-01).
//
//   startObjectivePr(root, obj, {name, flush, wait})   put the checkout on the objective's linked branch and open the PR
//   syncObjectivePr(root, obj, {flush, wait})          push the branch and refresh the PR's managed sections
//   prStatus(root, obj)                                read-only: branch, PR, verification status, closes, pending scopes
//
// Every function returns `{ok:true, ...}` or `{ok:false, error}`; none throws for a GitHub or git failure. Store mode only:
// with the store off every function returns `{ok:true, skipped:true, reason}` and makes no gh call and no git change.
//
// The seams: all `gh` goes through gh-client, all `git` through objective-branch (49-04), and every PR write that is not
// `createLinkedBranch` goes through the outbox (`upsert-pr`, spec-rev `freeze` rows), which the flusher writes. This module
// is GUARDED but deliberately not NO_DIRECT_WRITE: `createLinkedBranch` is its one direct `ghWrite`. It is synchronous and
// online-required (decision 2): its answer names the branch the local work must land on, and it cannot link a branch that
// already exists, so it cannot be queued and replayed. Nothing else here writes to GitHub.

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const planningMode = require('./planning-mode.cjs');
const branchLib = require('./objective-branch.cjs');
const wikiLib = require('./gh-wiki.cjs');
const comments = require('./gh-comments.cjs');
const trailer = require('./commit-trailer.cjs');
const { loadConfig } = require('./config.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { getRoadmapObjectiveInternal } = require('./roadmap.cjs');

const path = require('path');

// ─── Results ─────────────────────────────────────────────────────────────────

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const skippedResult = (reason) => ({ ok: true, skipped: true, reason });

const failureText = (r) => String((r && (r.stderr || r.error || r.stdout)) || 'unknown error').trim().split('\n')[0];
const isNotFound = (r) => /\b404\b|Not Found/i.test(`${r.stderr || ''} ${r.stdout || ''}`);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

/**
 * The store-mode gate, with ZERO gh calls: `{repo}` when the project is in store mode and github is usable,
 * else `{result}`: skipped (the store is off) or a failure (the store is on but no repository resolves).
 */
function storeGate(root) {
  const mode = planningMode.planningMode(root);
  if (mode.mode !== planningMode.STORE) return { result: skippedResult(`${mode.reason}: gh pr is a store-mode verb`) };
  const g = client.requireEnabled(root);
  if (g.skipped) return { result: fail(g.reason) };
  return { repo: g.repo };
}

// ─── Names and numbers ───────────────────────────────────────────────────────

/** Why `name` is not usable as a git branch name, or null. Same rules as the outbox's `upsert-pr` payload check. */
function branchProblem(name) {
  const ok = typeof name === 'string' && name !== '' && !/[\s\x00-\x1f\x7f~^:?*[\\]/.test(name) && !name.includes('..')
    && !name.startsWith('-') && !name.startsWith('/') && !name.endsWith('/') && !name.endsWith('.') && !name.endsWith('.lock');
  return ok ? null : `${JSON.stringify(name)} is not a usable git branch name`;
}

/**
 * The objective's branch name: `--name`, else the branch already recorded in `prs[obj]`, else `objective_branch_template`
 * rendered exactly as `init execute-objective` renders it (so the two never disagree). Null when the objective has no
 * directory to render from.
 */
function branchNameFor(root, objArg, { name } = {}) {
  if (typeof name === 'string' && name !== '') return name;
  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return null;
  const recorded = mappingLib.getPr(mappingLib.readMappingV3(root), id);
  if (recorded && recorded.branch) return recorded.branch;
  const info = findObjectiveInternal(root, id);
  if (!info) return null;
  return loadConfig(root).objective_branch_template
    .replace('{objective}', info.objective_number)
    .replace('{slug}', info.objective_slug || 'objective');
}

/**
 * The issue numbers the objective's PR closes, derived from the mapping: the objective issue, then every mapped TRD
 * (a Decision is closed when answered, not by the PR) in id order. This is the same derivation the flusher applies at
 * flush time, so a TRD planned later is closed by the next refresh. `[]` for an unmapped objective.
 */
function closesFor(root, objArg) {
  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return [];
  const mapping = mappingLib.readMappingV3(root);
  const entry = mappingLib.getEntry(mapping, id);
  if (!entry || !Number.isInteger(entry.issue_id)) return [];
  const numbers = [entry.issue_id];
  for (const tid of mappingLib.listTrds(mapping, id)) {
    const t = mappingLib.getTrd(mapping, tid);
    if (t && t.role === 'trd' && Number.isInteger(t.issue_number)) numbers.push(t.issue_number);
  }
  return numbers;
}

/** The objective's display name for the PR title: ROADMAP's heading, else the directory slug. */
function objectiveName(root, id, info) {
  const fromRoadmap = getRoadmapObjectiveInternal(root, id);
  if (fromRoadmap && fromRoadmap.objective_name) return fromRoadmap.objective_name;
  return (info && info.objective_name) || `objective ${id}`;
}

// ─── GitHub reads and the one write ──────────────────────────────────────────

const LINKED_QUERY = 'query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){'
  + ' issue(number:$n){ id linkedBranches(first:10){ nodes { ref { name } } } } } }';

const CREATE_MUTATION = 'mutation($issueId: ID!, $oid: GitObjectID!, $name: String!, $repositoryId: ID!) {'
  + ' createLinkedBranch(input:{issueId:$issueId, oid:$oid, name:$name, repositoryId:$repositoryId})'
  + ' { linkedBranch { id ref { name target { oid } } } } }';

/**
 * The branches linked to issue `issueNumber` (a GraphQL query, so a read) and the issue's NODE id, which
 * `createLinkedBranch` needs (never the number or the REST id).
 * -> {ok:true, issue_id, branches:[name]} | {ok:false, error}
 */
function linkedBranchFor(root, issueNumber) {
  const g = client.requireEnabled(root);
  if (g.skipped) return fail(g.reason);
  const [owner, name] = g.repo.split('/');
  const r = client.ghRead(['api', 'graphql', '-f', `query=${LINKED_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${issueNumber}`]);
  if (!r.ok) return fail(`could not read the branches linked to issue #${issueNumber}: ${failureText(r)}`);
  const issue = (((parseJson(r.stdout) || {}).data || {}).repository || {}).issue;
  if (!issue || typeof issue.id !== 'string') return fail(`issue #${issueNumber} came back unreadable from GraphQL`);
  const nodes = issue.linkedBranches && Array.isArray(issue.linkedBranches.nodes) ? issue.linkedBranches.nodes : [];
  const branches = nodes.map((n) => n && n.ref && n.ref.name).filter((n) => typeof n === 'string' && n !== '');
  return { ok: true, issue_id: issue.id, branches };
}

/**
 * Create `name` at `oid` and link it to the issue: the ONE direct GitHub write of this module. `linkedBranch: null`
 * means GitHub did not link anything (a branch of that name already exists); it is a failure, never success.
 * -> {ok:true, branch, oid} | {ok:false, error}
 */
function createLinked(root, { issueId, oid, name, repositoryId }) {
  const r = client.ghWrite(['api', 'graphql', '-f', `query=${CREATE_MUTATION}`, '-f', `issueId=${issueId}`,
    '-f', `oid=${oid}`, '-f', `name=${name}`, '-f', `repositoryId=${repositoryId}`]);
  if (!r.ok) return fail(`could not create the linked branch ${name}: ${failureText(r)}`);
  const linked = ((((parseJson(r.stdout) || {}).data || {}).createLinkedBranch) || {}).linkedBranch;
  if (!linked) {
    return fail(`GitHub did not return a linked branch for ${name} (createLinkedBranch answered null: the name is probably taken); `
      + 'choose another with --name');
  }
  return { ok: true, branch: (linked.ref && linked.ref.name) || name, oid };
}

const refPath = (repo, branch) => `repos/${repo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;

/** The sha of `branch` on GitHub: `{ok:true, sha}`, `{ok:true, sha:null}` when there is no such branch, or `{ok:false, error}`. */
function remoteRefSha(repo, branch) {
  const r = client.ghRead(['api', refPath(repo, branch)]);
  if (r.ok) {
    const sha = ((parseJson(r.stdout) || {}).object || {}).sha;
    return typeof sha === 'string' && sha !== '' ? { ok: true, sha } : fail(`branch ${branch} came back unreadable from GitHub`);
  }
  if (isNotFound(r)) return { ok: true, sha: null };
  return fail(`could not read branch ${branch} on GitHub: ${failureText(r)}`);
}

// ─── Flushing ────────────────────────────────────────────────────────────────

/** Flush the outbox unless `opts.flush === false`; `null` when it was left queued. */
function flushNow(root, opts) {
  if (opts && opts.flush === false) return null;
  return flushLib.flush(root, { wait: !(opts && opts.wait === false) });
}

// ─── start ───────────────────────────────────────────────────────────────────

/** The `upsert-pr` payload's wiki arguments: the page at a pinned revision, or null when there is no wiki clone. */
function wikiArgs(root, repo, info, pinnedSha) {
  const sha = pinnedSha || wikiLib.headSha(root);
  if (!sha || !info) return null;
  const dir = path.basename(info.directory);
  const page = wikiLib.objectivePage(dir);
  if (!page) return null;
  return { dir, page, url: wikiLib.pageRevisionUrl(repo, page, sha), sha };
}

/**
 * startObjectivePr(root, obj, {name, flush, wait}) — `gh pr start`.
 *
 * Online-required (decision 2): every GitHub read and the dirty-tree check come before the first change, so a failure
 * leaves no local branch, no queued op and no remote branch. Then: reuse the issue's linked branch or create one with
 * `createLinkedBranch` at the default branch's tip; switch the checkout to it; make one empty start commit
 * (`chore(<obj>): start objective <obj>` + `Refs #<objective issue>`) when the branch has no commits of its own; push;
 * record `prs[obj]`; queue the TRD freezes (decision 4) and `upsert-pr` (draft, closes, pinned wiki revision); flush.
 * Re-running changes nothing: same branch, no second start commit, no second PR.
 *
 * -> {ok:true, objective, repo, branch, base, issue, created_branch, start_commit, frozen, already_frozen, freeze_errors,
 *      wiki_sha, queued, flush, pr:{number,url}|null, warnings}
 *  | {ok:true, skipped:true, reason} | {ok:false, error}
 */
function startObjectivePr(root, objArg, opts = {}) {
  const gate = storeGate(root);
  if (gate.result) return gate.result;
  const { repo } = gate;

  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return fail(`${JSON.stringify(objArg)} is not an objective id`);

  const report = mappingLib.readMappingV3WithReport(root);
  if (report.error) return fail(`the GitHub mapping is unreadable: ${report.error}`);
  const entry = mappingLib.getEntry(report.mapping, id);
  if (!entry || !Number.isInteger(entry.issue_id)) {
    return fail(`objective ${id} is not in the GitHub mapping: run df-tools gh sync ${id} first`);
  }
  const issue = entry.issue_id;

  const clean = branchLib.isTrackedClean(root);
  if (!clean.ok) return fail(`could not read the git status: ${clean.error}`);
  if (!clean.clean) {
    return fail(`tracked files have uncommitted changes (${clean.files.join(', ')}); commit or stash them before gh pr start`);
  }

  const info = findObjectiveInternal(root, id);
  const wanted = branchNameFor(root, id, { name: opts.name });
  if (wanted === null) return fail(`objective ${id} has no directory under .planning/objectives to name its branch from; pass --name`);
  const problem = branchProblem(wanted);
  if (problem) return fail(`the objective branch ${problem}`);

  // ── Every GitHub read, before anything changes. ──
  const offline = (detail) => `GitHub could not be read, and gh pr start needs to be online (${detail}); nothing was changed`;
  const rr = client.ghRead(['api', `repos/${repo}`]);
  if (!rr.ok) return fail(offline(failureText(rr)));
  const repoJson = parseJson(rr.stdout);
  if (!repoJson || typeof repoJson.default_branch !== 'string' || repoJson.default_branch === '') {
    return fail(`repository ${repo} came back unreadable from GitHub; nothing was changed`);
  }
  const base = repoJson.default_branch;

  const lb = linkedBranchFor(root, issue);
  if (!lb.ok) return fail(offline(lb.error));
  const recorded = mappingLib.getPr(report.mapping, id);
  const reused = lb.branches.length > 0;
  let branch;
  let created = false;
  if (reused) {
    branch = recorded && lb.branches.includes(recorded.branch) ? recorded.branch : lb.branches[0];
  } else {
    branch = wanted;
    const exists = remoteRefSha(repo, branch);
    if (!exists.ok) return fail(offline(exists.error));
    if (exists.sha !== null) {
      return fail(`branch ${branch} already exists on GitHub but is not linked to issue #${issue}, and createLinkedBranch cannot link an existing branch; `
        + 'choose another name with --name <branch>, or delete the remote branch');
    }
    const tip = remoteRefSha(repo, base);
    if (!tip.ok) return fail(offline(tip.error));
    if (tip.sha === null) return fail(`the default branch ${base} was not found on GitHub; nothing was changed`);
    if (typeof repoJson.node_id !== 'string' || repoJson.node_id === '') return fail(`repository ${repo} has no GraphQL node id; nothing was changed`);

    const made = createLinked(root, { issueId: lb.issue_id, oid: tip.sha, name: branch, repositoryId: repoJson.node_id });
    if (!made.ok) return made;
    branch = made.branch;
    created = true;
  }
  const bad = branchProblem(branch);
  if (bad) return fail(`GitHub linked the objective branch ${bad}`);

  // ── Local: the checkout goes to the branch, which gets its start commit once, and is pushed. ──
  const fetched = branchLib.fetchBranch(root, branch);
  if (!fetched.ok) return fail(`could not fetch ${branch}: ${fetched.error}`);
  const switched = branchLib.switchTo(root, branch);
  if (!switched.ok) return fail(`could not switch to ${branch}: ${switched.error}`);
  const baseFetch = branchLib.fetchBranch(root, base);
  if (!baseFetch.ok) return fail(`could not fetch ${base}: ${baseFetch.error}`);

  // "No commits of its own" means HEAD is contained in the default branch; re-running finds the start commit and skips.
  const own = branchLib.isAncestor(root, 'HEAD', `${branchLib.REMOTE}/${base}`);
  if (!own.ok) return fail(`could not compare ${branch} with ${base}: ${own.error}`);
  let startCommit = null;
  if (own.ancestor) {
    const message = trailer.applyRefs(`chore(${id}): start objective ${id}`, issue);
    const made = branchLib.startCommit(root, message);
    if (!made.ok) return fail(`could not make the start commit: ${made.error}`);
    startCommit = made.sha;
  }
  const pushed = branchLib.push(root, branch, { setUpstream: true });
  if (!pushed.ok) return fail(`could not push ${branch}: ${pushed.error}`);

  // ── Record, then queue. ──
  const warnings = [];
  const wiki = wikiArgs(root, repo, info, recorded && recorded.wiki_base_sha);
  if (wiki === null) warnings.push('no wiki clone: the PR body has no pinned wiki revision');
  try {
    const mapping = mappingLib.readMappingV3(root);
    mappingLib.setPr(mapping, id, { branch, base, ...(wiki ? { wiki_base_sha: wiki.sha } : {}) });
    const w = mappingLib.writeMappingV3(root, mapping);
    if (!w.ok) return fail(`could not record the objective branch in the mapping: ${w.error}`);
  } catch (e) {
    return fail(`could not record the objective branch in the mapping: ${e.message}`);
  }

  // The freezes first: they do not depend on the PR, so a PR that has to wait (nothing pushed to compare) never holds them.
  const frozen = [];
  const alreadyFrozen = [];
  const freezeErrors = [];
  for (const tid of mappingLib.listTrds(mappingLib.readMappingV3(root), id)) {
    const f = comments.freezeTrd(root, tid);
    if (f.skipped) continue;
    if (!f.ok) {
      freezeErrors.push({ id: tid, error: f.error });
      warnings.push(`TRD ${tid} was not frozen: ${f.error}`);
    } else if (f.noop) {
      alreadyFrozen.push(tid);
    } else {
      frozen.push(tid);
    }
  }

  const payload = { branch, base, title: `Objective ${id}: ${objectiveName(root, id, info)}`, ...(wiki ? { wiki } : {}) };
  const q = outbox.enqueue(root, [{ kind: 'upsert-pr', target: { id }, payload }]);
  if (!q.ok) return fail(`could not queue the pull request: ${q.error || q.reason || 'the enqueue failed'}`);

  const flush = flushNow(root, opts);
  const stored = mappingLib.getPr(mappingLib.readMappingV3(root), id);
  return {
    ok: flush === null || flush.status !== 'error',
    ...(flush !== null && flush.status === 'error' ? { error: flush.error || 'the flush failed' } : {}),
    objective: id,
    repo,
    branch,
    base,
    issue,
    created_branch: created,
    start_commit: startCommit,
    frozen,
    already_frozen: alreadyFrozen,
    freeze_errors: freezeErrors,
    wiki_sha: wiki ? wiki.sha : null,
    queued: q.enqueued,
    flush,
    pr: stored && Number.isInteger(stored.number) ? { number: stored.number, url: stored.url || null } : null,
    warnings,
  };
}

module.exports = {
  storeGate,
  branchProblem,
  branchNameFor,
  closesFor,
  linkedBranchFor,
  createLinked,
  startObjectivePr,
};
