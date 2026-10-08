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
const objectiveNameLib = require('./objective-name.cjs');
const { loadConfig } = require('./config.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { getRoadmapObjectiveInternal } = require('./roadmap.cjs');

const { extractFrontmatter } = require('./frontmatter.cjs');

const fs = require('fs');
const path = require('path');

// ─── Results ─────────────────────────────────────────────────────────────────

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const skippedResult = (reason) => ({ ok: true, skipped: true, reason });

// The one refusal text for a local linked branch with commits origin lacks (TRD 55-03). It is built in objective-branch
// so planning-verbs.cjs (`verification post`) can use it without requiring this module.
const unpushedRefusal = branchLib.unpushedRefusal;

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

/**
 * The objective's display name for the PR title (STOR-02): ROADMAP's heading, then OBJECTIVE.md's title heading, then the
 * directory slug without its number prefix, then `objective <id>`. It is the chain the objective issue's title uses
 * (objective-name.cjs), so the two read alike; a fresh store has no ROADMAP entry, and the directory name is never the title.
 */
function objectiveName(root, id, info) {
  const fromRoadmap = getRoadmapObjectiveInternal(root, id);
  const directory = info && info.directory ? info.directory : null;
  return objectiveNameLib.objectiveDisplayName({
    roadmapName: fromRoadmap && fromRoadmap.objective_name,
    objDir: directory ? path.join(root, directory) : null,
    dirName: directory ? path.basename(directory) : null,
    number: id,
  });
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
    return fail(`objective ${id} is not in the GitHub mapping: run aof-tools gh sync ${id} first`);
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

// ─── sync ────────────────────────────────────────────────────────────────────

/** `TRDs complete k/N` from the cached plan files and SUMMARYs of the objective, or null when it has no directory. */
function summaryLine(root, id) {
  const info = findObjectiveInternal(root, id);
  if (!info) return null;
  const total = info.jobs.length;
  return `TRDs complete ${total - info.incomplete_jobs.length}/${total}`;
}

/**
 * syncObjectivePr(root, obj, {flush, wait}) — `gh pr sync`: push the objective branch and queue `upsert-pr` with
 * `{branch, base, summary}` from `prs[obj]` (no title: the title is create-only, the remote one is kept; `closes` is
 * derived at flush time). A failed push is reported and the op is still queued; the result is then `pending`.
 *
 * -> {ok:true, objective, branch, base, push:{ok, error?}, summary, queued, flush, pending, pr}
 *  | {ok:true, skipped:true, reason} | {ok:false, error}
 */
function syncObjectivePr(root, objArg, opts = {}) {
  const gate = storeGate(root);
  if (gate.result) return gate.result;

  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return fail(`${JSON.stringify(objArg)} is not an objective id`);
  const recorded = mappingLib.getPr(mappingLib.readMappingV3(root), id);
  if (!recorded || !recorded.branch || !recorded.base) {
    return fail(`objective ${id} has no objective branch yet: run aof-tools gh pr start ${id} first`);
  }

  const pushed = branchLib.push(root, recorded.branch);
  const push = pushed.ok ? { ok: true } : { ok: false, error: pushed.error || pushed.stderr || 'git push failed' };

  const summary = summaryLine(root, id);
  const payload = { branch: recorded.branch, base: recorded.base, ...(summary !== null ? { summary } : {}) };
  const q = outbox.enqueue(root, [{ kind: 'upsert-pr', target: { id }, payload }]);
  if (!q.ok) return fail(`could not queue the pull request refresh: ${q.error || q.reason || 'the enqueue failed'}`);

  const flush = flushNow(root, opts);
  const stored = mappingLib.getPr(mappingLib.readMappingV3(root), id);
  const flushFailed = flush !== null && flush.status === 'error';
  return {
    ok: !flushFailed,
    ...(flushFailed ? { error: flush.error || 'the flush failed' } : {}),
    objective: id,
    branch: recorded.branch,
    base: recorded.base,
    push,
    summary,
    queued: q.enqueued,
    flush,
    pending: !push.ok || (flush !== null && flush.status === 'pending'),
    pr: stored && Number.isInteger(stored.number) ? { number: stored.number, url: stored.url || null } : null,
  };
}

// ─── status ──────────────────────────────────────────────────────────────────

const VERIFICATION_CONTEXT = 'aoforge/verification';
const MERGE_QUEUE_QUERY = 'query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){'
  + ' pullRequest(number:$n){ mergeQueueEntry { state } } } }';

/**
 * prStatus(root, obj) — `gh pr status`: reads only. The branch, the PR (state: none | queued | draft | ready | merged |
 * closed, `in_merge_queue`), the latest `aoforge/verification` commit status of the PR head, the issues the PR should
 * close (from the mapping) against the ones its body does, and the pending scope changes per TRD. A failed read of the
 * PR itself is a failure; a failed read of a side fact (status, merge queue, one TRD) is listed in `errors`.
 *
 * -> {ok:true, objective, started, branch, base, issue, pr, verification, closes, closes_missing, pending_scopes,
 *      queued_ops, errors} | {ok:true, skipped:true, reason} | {ok:false, error}
 */
function prStatus(root, objArg) {
  const gate = storeGate(root);
  if (gate.result) return gate.result;
  const { repo } = gate;

  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return fail(`${JSON.stringify(objArg)} is not an objective id`);
  const mapping = mappingLib.readMappingV3(root);
  const entry = mappingLib.getEntry(mapping, id);
  const recorded = mappingLib.getPr(mapping, id);
  const closes = closesFor(root, id);
  const errors = [];

  const ops = outbox.readJournal(root).journal.ops.filter((o) => o.status !== 'done' && o.target
    && (o.target.id === id || String(o.target.id).startsWith(`${id}-`)));
  const upsertQueued = ops.some((o) => o.kind === 'upsert-pr' && o.target.id === id);

  const out = {
    ok: true,
    objective: id,
    started: Boolean(recorded && recorded.branch),
    branch: recorded ? recorded.branch : null,
    base: recorded ? recorded.base || null : null,
    issue: entry ? entry.issue_id : null,
    pr: { number: null, url: null, state: upsertQueued ? 'queued' : 'none', draft: null, merged: false, in_merge_queue: false, head_sha: null },
    verification: null,
    closes,
    closes_missing: [],
    pending_scopes: {},
    queued_ops: ops.length,
    errors,
  };

  if (recorded && Number.isInteger(recorded.number)) {
    const r = client.ghRead(['api', `repos/${repo}/pulls/${recorded.number}`]);
    if (!r.ok) return fail(`could not read pull request #${recorded.number}: ${failureText(r)}`);
    const pr = parseJson(r.stdout);
    if (!pr || !Number.isInteger(pr.number)) return fail(`pull request #${recorded.number} came back unreadable from GitHub`);
    const merged = pr.merged === true || (typeof pr.merged_at === 'string' && pr.merged_at !== '');
    let state = 'ready';
    if (merged) state = 'merged';
    else if (pr.state === 'closed') state = 'closed';
    else if (pr.draft === true) state = 'draft';
    out.pr = {
      number: pr.number,
      url: pr.html_url || recorded.url || null,
      state,
      draft: pr.draft === true,
      merged,
      in_merge_queue: pr.queued === true,
      head_sha: pr.head && typeof pr.head.sha === 'string' ? pr.head.sha : null,
    };

    const inBody = new Set([...String(pr.body || '').matchAll(/Closes #(\d+)/g)].map((m) => Number(m[1])));
    out.closes_missing = closes.filter((n) => !inBody.has(n));

    if (out.pr.head_sha) {
      const s = client.ghRead(['api', `repos/${repo}/commits/${out.pr.head_sha}/status`]);
      if (!s.ok) {
        errors.push(`could not read the commit status of ${out.pr.head_sha}: ${failureText(s)}`);
      } else {
        const rows = (parseJson(s.stdout) || {}).statuses;
        const row = Array.isArray(rows) ? rows.find((x) => x && x.context === VERIFICATION_CONTEXT) : null;
        out.verification = row
          ? { state: row.state, description: row.description || null, updated_at: row.updated_at || row.created_at || null }
          : null;
      }
    }

    if (state === 'draft' || state === 'ready') {
      const [owner, name] = repo.split('/');
      const q = client.ghRead(['api', 'graphql', '-f', `query=${MERGE_QUEUE_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${pr.number}`]);
      if (q.ok) {
        const entryNode = ((((parseJson(q.stdout) || {}).data || {}).repository || {}).pullRequest || {}).mergeQueueEntry;
        if (entryNode) out.pr.in_merge_queue = true;
      }
      // a failed or unsupported queue read leaves in_merge_queue as REST reported it
    }
  }

  for (const tid of mappingLib.listTrds(mapping, id)) {
    const spec = comments.readEffectiveSpec(root, tid);
    if (spec.skipped) continue;
    if (!spec.ok) {
      errors.push(`could not read TRD ${tid}: ${spec.error}`);
      continue;
    }
    if (Array.isArray(spec.pending) && spec.pending.length > 0) {
      out.pending_scopes[tid] = spec.pending.map((p) => ({ n: p.n, author: p.author }));
    }
  }
  return out;
}

// ─── reconcile ───────────────────────────────────────────────────────────────

/**
 * The pull request as GitHub holds it, normalised: `state` is merged | closed | draft | ready, `queued` is the REST flag
 * (a real merge queue answers through GraphQL, see `inMergeQueue`). `merged` is read from `merged`/`merged_at` itself:
 * a `pr-merge` that returned ok only enqueued the PR when the base branch has a merge queue.
 * -> {ok:true, pr:{number, url, state, draft, merged, merged_at, head_sha, base, queued}} | {ok:false, error}
 */
function readPull(repo, number) {
  const r = client.ghRead(['api', `repos/${repo}/pulls/${number}`]);
  if (!r.ok) return fail(`could not read pull request #${number}: ${failureText(r)}`);
  const pr = parseJson(r.stdout);
  if (!pr || !Number.isInteger(pr.number)) return fail(`pull request #${number} came back unreadable from GitHub`);
  const mergedAt = typeof pr.merged_at === 'string' && pr.merged_at !== '' ? pr.merged_at : null;
  const merged = pr.merged === true || mergedAt !== null;
  let state = 'ready';
  if (merged) state = 'merged';
  else if (pr.state === 'closed') state = 'closed';
  else if (pr.draft === true) state = 'draft';
  return {
    ok: true,
    pr: {
      number: pr.number,
      url: pr.html_url || null,
      state,
      draft: pr.draft === true,
      merged,
      merged_at: mergedAt,
      head_sha: pr.head && typeof pr.head.sha === 'string' && pr.head.sha !== '' ? pr.head.sha : null,
      base: pr.base && typeof pr.base.ref === 'string' && pr.base.ref !== '' ? pr.base.ref : null,
      queued: pr.queued === true,
    },
  };
}

/** Is the open PR waiting in the base branch's merge queue? A failed or unsupported read is `false`. */
function inMergeQueue(repo, pr) {
  if (pr.queued) return true;
  const [owner, name] = repo.split('/');
  const q = client.ghRead(['api', 'graphql', '-f', `query=${MERGE_QUEUE_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${pr.number}`]);
  if (!q.ok) return false;
  return Boolean(((((parseJson(q.stdout) || {}).data || {}).repository || {}).pullRequest || {}).mergeQueueEntry);
}

/**
 * The issues the objective's PR closes, as `{id, number}` for the outbox's `patch-issue` target: the objective, then each
 * mapped TRD in id order. The same set `closesFor` derives, with the mapping ids the flusher resolves.
 */
function closeTargets(root, objArg) {
  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return [];
  const mapping = mappingLib.readMappingV3(root);
  const entry = mappingLib.getEntry(mapping, id);
  if (!entry || !Number.isInteger(entry.issue_id)) return [];
  const out = [{ id, number: entry.issue_id }];
  for (const tid of mappingLib.listTrds(mapping, id)) {
    const t = mappingLib.getTrd(mapping, tid);
    if (t && t.role === 'trd' && Number.isInteger(t.issue_number)) out.push({ id: tid, number: t.issue_number });
  }
  return out;
}

/** `{ok:true, state:'open'|'closed'}` for one issue, or `{ok:false, error}`. */
function issueStateOf(repo, number) {
  const r = client.ghRead(['api', `repos/${repo}/issues/${number}`]);
  if (!r.ok) return fail(`could not read issue #${number}: ${failureText(r)}`);
  const issue = parseJson(r.stdout);
  if (!issue || typeof issue.state !== 'string') return fail(`issue #${number} came back unreadable from GitHub`);
  return { ok: true, state: issue.state.toLowerCase() };
}

/**
 * The Project the objective moves on: its OBJECTIVE.md `org_project`, else PROJECT.md's (the order `gh sync` resolves
 * the chain in). Null when none is configured.
 */
function projectIdFor(root, id) {
  const read = (file) => {
    try {
      return extractFrontmatter(fs.readFileSync(file, 'utf8')) || {};
    } catch (_) {
      return {};
    }
  };
  const info = findObjectiveInternal(root, id);
  const objective = info && info.directory ? read(path.join(root, info.directory, 'OBJECTIVE.md')) : {};
  const project = read(path.join(root, '.planning', 'PROJECT.md'));
  const value = objective.org_project || project.org_project;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Merge `patch` into `prs[id]`, re-reading the mapping first (a cache pull may have rewritten it). A warning text on failure, else null. */
function recordPr(root, id, patch) {
  try {
    const mapping = mappingLib.readMappingV3(root);
    mappingLib.setPr(mapping, id, patch);
    const w = mappingLib.writeMappingV3(root, mapping);
    return w.ok ? null : `could not record the reconcile in the mapping: ${w.error}`;
  } catch (e) {
    return `could not record the reconcile in the mapping: ${e.message}`;
  }
}

/** The two collaborators a reconcile calls that are not this module's: tests substitute them through `opts.deps`. */
function defaultDeps(deps) {
  const d = deps || {};
  return {
    updateProjectFields: d.updateProjectFields || ((...a) => require('./gh.cjs').updateProjectFields(...a)),
    pullAll: d.pullAll || ((...a) => require('./gh-cache.cjs').pullAll(...a)),
  };
}

/**
 * The local half of a reconcile, run only after GitHub is reconciled: leave the checkout on the default branch at
 * origin's tip, then delete the objective branch and this objective's `df/exec-<obj>-*` branches. A squash merge
 * leaves every one of them "unmerged" to git, so `-d` always refuses; the delete is forced, and it is gated twice.
 * First ancestry: the branch tip is an ancestor of the merged PR's head sha, so everything on it was in the PR.
 * Failing that (TRD 55-05), content: merging the tip into the updated default branch would change nothing
 * (objective-branch.contentMerged), as when the default branch was merged into the branch after the last push or a
 * commit was re-made through the squash. A branch with a change the default branch lacks (unpushed or unmerged work),
 * one that conflicts with it, or one neither check can decide, is kept and reported. A dirty tracked tree skips
 * everything.
 * -> {local, deleted, kept, warnings, changed}
 */
function reconcileLocal(root, { id, branch, base, headSha }) {
  const out = { local: 'done', deleted: [], kept: [], warnings: [], changed: false };
  const clean = branchLib.isTrackedClean(root);
  if (!clean.ok) {
    out.local = `error: could not read the git status: ${clean.error}`;
    out.warnings.push(`the local steps were skipped: ${out.local}`);
    return out;
  }
  if (!clean.clean) {
    out.local = 'skipped (dirty tree)';
    out.warnings.push(`tracked files have uncommitted changes (${clean.files.join(', ')}): the local steps (switch to the default branch, `
      + 'branch cleanup, cache pull) were skipped; commit or stash them and run the reconcile again');
    return out;
  }

  const synced = branchLib.syncDefault(root, base || undefined);
  if (!synced.ok) {
    out.local = `error: could not move the checkout to the default branch: ${synced.error}`;
    out.warnings.push(`the local steps were skipped: ${out.local}`);
    return out;
  }
  out.changed = Boolean(synced.switched || synced.updated);

  const listed = branchLib.listLocal(root, `df/exec-${id}-*`);
  if (!listed.ok) out.warnings.push(`could not list the local df/exec-${id}-* branches: ${listed.error}`);
  const names = [...new Set([...(branch ? [branch] : []), ...(listed.ok ? listed.branches : [])])];
  const keep = (name, reason, warning) => {
    out.kept.push({ branch: name, reason });
    out.warnings.push(warning);
  };
  for (const name of names) {
    if (name === synced.branch) continue;
    const tip = branchLib.branchTip(root, name);
    if (!tip.ok) {
      keep(name, `could not read the branch: ${tip.error}`, `${name} was kept: could not read its tip (${tip.error})`);
      continue;
    }
    if (!tip.sha) continue; // never existed locally (a clone that did not make the branch)
    if (!headSha) {
      keep(name, 'the merged PR has no head sha to compare with', `${name} was kept: the merged pull request has no head sha to compare it with`);
      continue;
    }
    const anc = branchLib.isAncestor(root, tip.sha, headSha);
    if (!anc.ok) {
      keep(name, `could not compare with the merged head (${anc.error})`,
        `${name} was kept: its tip could not be compared with the merged head ${headSha.slice(0, 8)} (${anc.error}); the merged head may not be fetched here`);
      continue;
    }
    if (!anc.ancestor) {
      // Not in the PR head's history. A squash merge, or a merge of the default branch made locally after the last push,
      // leaves such a tip whose changes are nevertheless on the default branch: merging it there would add nothing.
      // Only that is deleted. A change the default branch lacks, a conflict, and anything the check cannot decide
      // (an older git, a missing object) keep the branch: keeping is safe, deleting work is not.
      const content = branchLib.contentMerged(root, tip.sha, synced.sha);
      if (!(content.ok && content.merged)) {
        const conflict = content.ok && content.conflict ? ` (it conflicts with ${synced.branch})` : '';
        keep(name, 'not in the merged PR',
          `${name} was kept: its tip is not in the merged pull request${conflict} (unpushed or unmerged work); delete it with git branch -D ${name} once you are sure`);
        continue;
      }
    }
    const del = branchLib.deleteLocal(root, name, { force: true });
    if (del.ok) {
      out.deleted.push(name);
      out.changed = true;
    } else {
      keep(name, `could not delete: ${del.error}`, `${name} was kept: ${del.error}`);
    }
  }
  return out;
}

/**
 * reconcileObjectivePr(root, obj, {flush, wait, deps}) — `gh pr reconcile`: bring GitHub and the checkout to the merged state.
 *
 * Reads the PR first (merged or closed is read from `merged`/`merged_at`, never inferred from an earlier `pr-merge`): open
 * (queued or not) is `pending` with nothing written, closed unmerged is an error. On a merged PR: every issue in the
 * PR's closes set is read and each one still open is closed with `patch-issue` (the closing-keyword cap is documented
 * and unconfirmed beyond it, so closure is verified, never assumed); the remote branch is deleted with `delete-branch`
 * (only now that the merge is confirmed, and only when it still exists, so a repeat writes nothing); the queue is
 * flushed. Only when GitHub is reconciled do the Project (Status Done), the checkout and the cache follow: switch
 * to the default branch at origin's tip, ancestry-then-content-gated force delete of the objective and `df/exec-<obj>-*` branches,
 * `pullAll`. `prs[obj].merged_at` is recorded; `reconciled_at` once every step finished, so a run that skipped or
 * failed one is finished by running it again. Re-running changes nothing.
 *
 * -> {ok:true, objective, repo, pr, base, branch, closed, already_closed, remote_branch, project, local, default_branch,
 *      deleted_local, kept, pulled, reconciled, already_reconciled, queued, flush, warnings}
 *  | {ok:true, pending:true, objective, pr, reason}
 *  | {ok:true, skipped:true, reason} | {ok:false, error}
 */
function reconcileObjectivePr(root, objArg, opts = {}) {
  const gate = storeGate(root);
  if (gate.result) return gate.result;
  const { repo } = gate;
  const deps = defaultDeps(opts.deps);

  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return fail(`${JSON.stringify(objArg)} is not an objective id`);
  const report = mappingLib.readMappingV3WithReport(root);
  if (report.error) return fail(`the GitHub mapping is unreadable: ${report.error}`);
  const recorded = mappingLib.getPr(report.mapping, id);
  if (!recorded || !Number.isInteger(recorded.number)) {
    return fail(`objective ${id} has no pull request yet: run aof-tools gh pr start ${id} first`);
  }
  const entry = mappingLib.getEntry(report.mapping, id);
  const wasReconciled = typeof recorded.reconciled_at === 'string';

  // ── Reads, before anything is queued or changed. ──
  const got = readPull(repo, recorded.number);
  if (!got.ok) return fail(`${got.error}; nothing was changed`);
  const pr = got.pr;
  if (pr.state === 'closed') {
    return fail(`pull request #${pr.number} for objective ${id} was closed without merging; nothing was closed or deleted. `
      + 'Reopen it or start the objective again');
  }
  if (!pr.merged) {
    const queued = inMergeQueue(repo, pr);
    const where = queued ? 'is waiting in the merge queue' : `is still open (${pr.state})`;
    return {
      ok: true,
      pending: true,
      objective: id,
      pr: { number: pr.number, url: pr.url, state: pr.state, in_merge_queue: queued },
      reason: `pull request #${pr.number} ${where}; run aof-tools gh pr reconcile ${id} again after it merges`,
    };
  }

  // The merge is a fact now: record `merged_at` before anything that can stop the run, so a planning verb that keys on it
  // sees the merge even when GitHub could not be reconciled yet. `reconciled_at` is recorded only when every step is done.
  const warnings = [];
  if (!recorded.merged_at) {
    const noted = recordPr(root, id, { merged_at: pr.merged_at || new Date().toISOString() });
    if (noted) warnings.push(noted);
  }

  const targets = closeTargets(root, id);
  const stragglers = [];
  const alreadyClosed = [];
  for (const t of targets) {
    const s = issueStateOf(repo, t.number);
    if (!s.ok) return fail(`${s.error}; nothing was changed`);
    (s.state === 'closed' ? alreadyClosed : stragglers).push(t);
  }
  const branch = recorded.branch || null;
  let branchGone = true;
  if (branch && !branchProblem(branch) && branch !== pr.base) {
    const remote = remoteRefSha(repo, branch);
    if (!remote.ok) return fail(`${remote.error}; nothing was changed`);
    branchGone = remote.sha === null;
  }

  // ── GitHub first: a failed flush must leave the local branches to retry from. ──
  const ops = stragglers.map((t) => ({ kind: 'patch-issue', target: { id: t.id }, payload: { state: 'closed', state_reason: 'completed' } }));
  if (!branchGone) ops.push({ kind: 'delete-branch', target: { id }, payload: { branch } });
  if (ops.length > 0) {
    const q = outbox.enqueue(root, ops);
    if (!q.ok) return fail(`could not queue the reconcile writes: ${q.error || q.reason || 'the enqueue failed'}`);
  }
  const flush = flushNow(root, opts);

  const result = {
    objective: id,
    repo,
    pr: { number: pr.number, url: pr.url, state: 'merged', merged_at: pr.merged_at },
    base: pr.base,
    branch,
    closed: stragglers.map((t) => t.number),
    already_closed: alreadyClosed.map((t) => t.number),
    remote_branch: branchGone ? 'already gone' : 'deleted',
    queued: ops.length,
    flush,
  };
  const github = flush === null ? ops.length === 0 : flush.status === 'flushed';
  if (!github) {
    return {
      ok: flush === null || flush.status !== 'error',
      ...(flush !== null && flush.status === 'error' ? { error: flush.error || 'the flush failed' } : {}),
      ...result,
      project: 'not run',
      local: 'not run',
      default_branch: pr.base,
      deleted_local: [],
      kept: [],
      pulled: false,
      reconciled: false,
      already_reconciled: false,
      warnings: [...warnings, 'GitHub is not reconciled yet: the Project, the checkout and the cache were left alone; run the reconcile again'],
    };
  }

  // ── The Project. Best effort: closure and branch cleanup are the load-bearing parts. ──
  let project = 'none';
  const projectId = projectIdFor(root, id);
  let work = ops.length > 0;
  if (projectId !== null && entry && Number.isInteger(entry.issue_id)) {
    if (wasReconciled) {
      project = 'already done';
    } else {
      const ttl = ((client.readConfig(root) || {}).github || {}).project_cache_ttl_minutes;
      try {
        const u = deps.updateProjectFields(`${repo}#${entry.issue_id}`, projectId, { Status: 'Done' }, { ttlMinutes: ttl });
        if (u && u.ok) {
          project = 'done';
          work = true;
          for (const w of u.warnings || []) warnings.push(w);
          for (const e of u.errors || []) warnings.push(`project field ${e.field} not updated: ${e.error}`);
        } else {
          project = `error: ${(u && u.error) || 'the Project update failed'}`;
          warnings.push(`the Project was not moved to Done (${project.slice('error: '.length)}); run the reconcile again once it is fixed`);
        }
      } catch (e) {
        project = `error: ${e.message}`;
        warnings.push(`the Project was not moved to Done (${e.message}); run the reconcile again once it is fixed`);
      }
    }
  }

  // ── The checkout and the cache. ──
  const local = reconcileLocal(root, { id, branch, base: pr.base, headSha: pr.head_sha });
  warnings.push(...local.warnings);
  if (local.changed) work = true;
  let pulled = false;
  let pullFailed = false;
  if (local.local === 'done' && (!wasReconciled || work)) {
    try {
      const p = deps.pullAll(root, {});
      if (p && p.ok) {
        pulled = true;
        for (const a of p.attention || []) warnings.push(`gh pull --all: ${a}`);
      } else {
        pullFailed = true;
        warnings.push(`the cache was not refreshed (${(p && p.error) || 'gh pull --all failed'}); run aof-tools gh pull --all`);
      }
    } catch (e) {
      pullFailed = true;
      warnings.push(`the cache was not refreshed (${e.message}); run aof-tools gh pull --all`);
    }
  }

  // ── Record. `reconciled_at` means every step finished. ──
  const complete = local.local === 'done' && !project.startsWith('error') && !pullFailed;
  if (complete && !wasReconciled) {
    const noted = recordPr(root, id, { reconciled_at: new Date().toISOString() });
    if (noted) warnings.push(noted);
  }

  return {
    ok: true,
    ...result,
    project,
    local: local.local,
    default_branch: pr.base,
    deleted_local: local.deleted,
    kept: local.kept,
    pulled,
    reconciled: complete,
    already_reconciled: wasReconciled && !work,
    warnings,
  };
}

// ─── merge ───────────────────────────────────────────────────────────────────

// Duplicated from gh-outbox.cjs MERGE_METHODS (not exported); `github.pr.merge_method` is validated against it.
const MERGE_METHODS = ['squash', 'merge', 'rebase'];
const DEFAULT_MERGE_METHOD = 'squash';

/** `github.pr.merge_method` when it is a known method, else squash. A merge queue ignores it. */
function mergeMethodFromConfig(root) {
  const github = (client.readConfig(root) || {}).github || {};
  const pr = github.pr && typeof github.pr === 'object' ? github.pr : {};
  return MERGE_METHODS.includes(pr.merge_method) ? pr.merge_method : DEFAULT_MERGE_METHOD;
}

/** The latest `aoforge/verification` status on `sha`: `{ok:true, verification:{state, description}|null}` or `{ok:false, error}`. */
function verificationAt(repo, sha) {
  if (!sha) return fail('the pull request has no head sha to read the verification status of');
  const s = client.ghRead(['api', `repos/${repo}/commits/${sha}/status?per_page=100`]);
  if (!s.ok) return fail(`could not read the commit status of ${sha.slice(0, 7)}: ${failureText(s)}`);
  const rows = (parseJson(s.stdout) || {}).statuses;
  const row = Array.isArray(rows) ? rows.find((x) => x && x.context === VERIFICATION_CONTEXT) : null;
  return { ok: true, verification: row ? { state: row.state, description: row.description || null } : null };
}

/**
 * mergeObjectivePr(root, obj, {flush, wait, deps}) — `gh pr merge`: merge a verified objective's PR, through the merge
 * queue where the repository has one, and reconcile when it merged.
 *
 * Online-required: the PR and its `aoforge/verification` status are read before anything is queued. A draft PR, a PR
 * closed unmerged, a local linked branch with commits origin lacks (TRD 55-03: refused naming `gh pr sync`, never
 * pushed from here; no guard when the branch is not in this clone or has no branch on record), and a PR whose head has
 * no `success` verification status are refused (objective 50 owns enforcement and the escapes; there is no bypass
 * here). Then `pr-merge {method}` is queued (`github.pr.merge_method`, default
 * squash) and flushed, and the PR is READ again: a returned `pr-merge` only means the PR was merged or, with a queue,
 * enqueued. Merged: `reconcileObjectivePr` runs in this call. Enqueued: `pending`, to be reconciled after the queue
 * merges it. An already merged PR goes straight to the reconcile.
 *
 * -> {ok:true, merged:true, method, ...<reconcileObjectivePr result>}
 *  | {ok:true, merged:false, pending, objective, pr, method, reason, queued, flush, warnings}
 *  | {ok:true, skipped:true, reason} | {ok:false, error}
 */
function mergeObjectivePr(root, objArg, opts = {}) {
  const gate = storeGate(root);
  if (gate.result) return gate.result;
  const { repo } = gate;

  const id = mappingLib.toObjectiveId(objArg);
  if (id === null) return fail(`${JSON.stringify(objArg)} is not an objective id`);
  const recorded = mappingLib.getPr(mappingLib.readMappingV3(root), id);
  if (!recorded || !Number.isInteger(recorded.number)) {
    return fail(`objective ${id} has no pull request yet: run aof-tools gh pr start ${id} first`);
  }

  const got = readPull(repo, recorded.number);
  if (!got.ok) return fail(`${got.error}; gh pr merge needs to be online, nothing was queued`);
  const pr = got.pr;
  const what = `pull request #${pr.number} for objective ${id}`;

  const reconciled = (method, mergeFlush) => {
    const rec = reconcileObjectivePr(root, id, opts);
    if (rec.skipped) return rec;
    if (!rec.ok) {
      return { ...rec, merged: true, error: `${what} merged, but the reconcile failed: ${rec.error}; run aof-tools gh pr reconcile ${id}` };
    }
    return { ...rec, merged: true, method, merge_flush: mergeFlush };
  };

  if (pr.state === 'merged') return reconciled(null, null);
  if (pr.state === 'closed') {
    return fail(`${what} was closed without merging; reopen it or start the objective again`);
  }
  if (pr.state === 'draft') return fail(`PR is still a draft; run verification first (${what})`);

  // TRD 55-03: the PR head is what gets merged. Commits that exist only on the local linked branch are not in it, so
  // the verification status above would certify code the merge does not carry. Refuse; `gh pr sync` is the remedy.
  // No branch on record (a PR recorded before 49-04) leaves nothing to compare, so there is no guard.
  const ahead = recorded.branch ? branchLib.unpushedCommits(root, recorded.branch) : null;
  if (ahead && !ahead.ok) return fail(`could not tell whether ${recorded.branch} has unpushed commits: ${ahead.error}; nothing was queued`);
  if (ahead && ahead.count > 0) return fail(unpushedRefusal(id, recorded.branch, ahead));

  const v = verificationAt(repo, pr.head_sha);
  if (!v.ok) return fail(`${v.error}; nothing was queued`);
  if (!v.verification || v.verification.state !== 'success') {
    const seen = v.verification ? `its latest status is ${v.verification.state}` : 'none has been posted';
    return fail(`${what} has no success ${VERIFICATION_CONTEXT} status on its head ${pr.head_sha.slice(0, 7)} (${seen}); run verification first`);
  }

  const method = mergeMethodFromConfig(root);
  const q = outbox.enqueue(root, [{ kind: 'pr-merge', target: { id }, payload: { method } }]);
  if (!q.ok) return fail(`could not queue the merge: ${q.error || q.reason || 'the enqueue failed'}`);

  const flush = flushNow(root, opts);
  const base = {
    objective: id,
    pr: { number: pr.number, url: pr.url, state: pr.state },
    method,
    merged: false,
    queued: q.enqueued,
    flush,
    warnings: [],
  };
  const afterReconcile = `run aof-tools gh pr reconcile ${id}`;
  if (flush === null) {
    return { ok: true, ...base, pending: true, reason: `the merge is queued, not sent (--no-flush); flush the outbox, then ${afterReconcile}` };
  }
  if (flush.status !== 'flushed') {
    return {
      ok: flush.status !== 'error',
      ...(flush.status === 'error' ? { error: flush.error || 'the flush failed' } : {}),
      ...base,
      pending: flush.status === 'pending',
      reason: `the merge was not sent (${flush.status}); once the outbox flushes, ${afterReconcile}`,
    };
  }

  const after = readPull(repo, pr.number);
  if (!after.ok) {
    return { ok: true, ...base, pending: true, reason: `the merge was sent but ${after.error}; ${afterReconcile} to finish`, warnings: [after.error] };
  }
  if (after.pr.merged) return reconciled(method, flush);
  const queued = inMergeQueue(repo, after.pr);
  return {
    ok: true,
    ...base,
    pr: { number: pr.number, url: pr.url, state: queued ? 'queued' : after.pr.state },
    pending: true,
    reason: `${what} was ${queued ? 'added to the merge queue' : 'sent for merging'} and is not merged yet; ${afterReconcile} after the queue merges it`,
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
  syncObjectivePr,
  prStatus,
  reconcileObjectivePr,
  mergeObjectivePr,
  unpushedRefusal,
};
