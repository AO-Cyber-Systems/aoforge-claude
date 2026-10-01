'use strict';

// gh-fake.cjs (TRD 46-05) — a stateful, in-memory fake GitHub for objective 46's tests.
//
// Hand-built fixture: no network, no real `gh`. It implements exactly the `gh` argv shapes DevFlow
// uses, keeps issues / comments / milestones / labels in memory, and answers in the shape real `gh`
// does (`--json` fields, `gh api` payloads, URLs on stdout). Install it ONLY through the client seam:
//
//     require('../gh-client.cjs')._setRunGh(fake.runGh)
//
// so a test that passes proves every call went through gh-client.
//
// Extending: an argv shape the fake does not implement returns
// `{ok:false, status:1, stderr:'[gh-fake] unsupported: <argv>'}` so a gap is loud, never a quiet
// success. Add the shape HERE (not in a test) when a later TRD (46-07, 46-08, 46-09) needs it, and add
// a case to gh-fake.test.cjs. Only long flags are implemented (plus gh api's -X/-f/-F/-H/-q); an
// unknown flag is also "unsupported" — notably `--search`, because DevFlow must list-and-scan.
//
// Storage shape (the `issues` array is live; tests may read it):
//   issue   { number, id, title, body, labels:[name], milestone:title|null, assignees:[login],
//             state:'OPEN'|'CLOSED', stateReason, type:name|null, owner, parent:number|null,
//             subIssues:[number] (link order), blockedBy:[number], fieldValues:[{field_id,value}],
//             createdAt, updatedAt }
//   `id` is GitHub's database id: ALWAYS `1_000_000 + number`, never the number (47 Pitfall 1). Sub-issue
//   and dependency endpoints take only that id, so a caller that sends a number gets a 404.
//   comment { id, issue_number, body, user:{login}, created_at, updated_at, html_url }
//   milestone { number, title, description, state:'open'|'closed', due_on:string|null, closed_at:string|null }
// `--json` output converts to gh's shape (labels -> [{name}], milestone -> {number,title}).
// `updatedAt` comes from an internal counter clock that advances 1 s per mutation, so it is an ISO
// string that strictly increases and never depends on wall time. It is ONE field: gh `--json updatedAt`
// and REST `updated_at` read the same value, and DevFlow's own link / dependency / comment / label
// writes advance it exactly as GitHub does, so `updated_at` alone is never a remote-edit signal.
//
// REST (objective 47): `runGh(args, opts)` reads `opts.input` as the JSON body of `gh api --input -`.
// Routes: repos/o/r/issues (POST, GET), .../issues/{n} (GET, PATCH), .../sub_issues (GET, POST),
// .../sub_issue (DELETE), .../parent (GET), .../dependencies/blocked_by (GET, POST) and
// .../blocked_by/{id} (DELETE), .../dependencies/blocking (GET), .../issue-field-values (GET, POST, PUT),
// plus repos/o/r (GET), orgs/{o}/issue-types and orgs/{o}/issue-fields. GraphQL stays caller-handled.
// Milestones (48-05): repos/o/r/milestones (POST, GET) and repos/o/r/milestones/{n} (GET, PATCH by NUMBER:
// title, description, state, due_on; closing stamps closed_at, reopening clears it).
// What the repo can do is configured per fake (`ownerType`, `hasWiki`, `push`, `types`, `fields`,
// `subIssuesApi`), and `setOffline(true)` turns every call into a network outage.
//
// Pull requests (objective 49, TRD 49-01). A PR is an ISSUE RECORD in `issues` carrying a `pr` object, drawn
// from the same `nextIssue` counter, so an issue and a PR never share a number and PR comments are issue
// comments (49 Pitfall 9). Its issue `state` is the PR state ('OPEN' | 'CLOSED'); `pr` holds the rest:
//   pr { head:{ref, sha}, base:{ref}, draft, merged, mergedAt, mergeSha, mergeMethod, queued, author }
// DevFlow drives PRs through `gh api` only (REST + GraphQL), so the fake has routes, not `pr` argv nouns:
//   user (GET), repos/o/r (GET: default_branch, node_id 'R_1'), repos/o/r/pulls (GET head=<owner>:<branch>,
//   state, base; POST), pulls/{n} (GET, PATCH title/body/state/base), pulls/{n}/merge (PUT merge_method).
// `gh issue list` never shows a PR (as gh does); REST `issues` lists them (as GitHub does) with `pull_request`.
// `GET pulls/{n}` also reports `queued` (a fake-only field: whether the PR sits in the merge queue).
// Branches: `refs` = `{name: sha}`, seeded with `{[defaultBranch]: BASE_SHA}` (option `defaultBranch`, default
// 'main'; option `refs` adds more). `pushRef(name, sha)` stands in for a `git push` the test made.
// Comments carry an author: API-posted ones use the fake viewer (option `viewer`, default 'devflow-bot');
// `seedComment(n, body, {login})` seeds another. Seeded issue `assignees` already appear on the issue.
// `humanMergePr(n, {method})` is the human clicking merge (no call recorded).
//
// Setup and check routes (objective 50, TRD 50-01). Every one is a REST shape `gh api` uses; write bodies come
// from `--input -` (`opts.input`) or `-f`/`-F`. Repo level (a non-admin token, option `isAdmin:false`, is refused
// with 403 on every write below; reads still work):
//   repos/o/r/rulesets (GET list = summaries {id,name,target,enforcement}; POST), rulesets/{id} (GET the full
//   object; PUT patches only the fields it names). Stored as {id,name,target,enforcement,conditions,bypass_actors,
//   rules}, ids from 9001; name and enforcement are required and a name is unique. A `merge_queue` rule is refused
//   with 422 when `mergeQueueAllowed:false` (a plan without merge queues), on POST and on PUT, storing nothing.
//   repos/o/r (PATCH has_wiki, delete_branch_on_merge; any other field is a loud gap), repos/o/r/labels (GET: the
//   labels `gh label create` made, with colour and description).
// Org level (404 for a User owner or another org, 403 when `orgAdmin:false`):
//   orgs/{o}/issue-types (POST {name,is_enabled,description,color}) and issue-types/{id} (PUT patches). A created
//   type gets id 'IT_<n>' and joins the same list GET and `issue.type` read. orgs/{o}/issue-fields (POST
//   {name,data_type,description,visibility,options?}) REQUIRES the header `X-GitHub-Api-Version: 2026-03-10` passed
//   as `-H` (400 without it) and refuses `options` with 422 when `fieldOptionsAccepted:false`; the row joins the
//   list `detectCapabilities` and issue-field-values read.
// Check inputs, seeded by option and readable live on the fake: `prCommits` = {<prNumber>: [message, ...]} answers
// repos/o/r/pulls/{n}/commits as [{sha, commit:{message}}] (paginated like any list); `files` = {<ref>: {<path>:
// <text>}} answers repos/o/r/contents/<path>?ref=<ref> as a base64 file, 404 when the ref or path is not seeded.

const crypto = require('node:crypto');
const { isWriteArgs } = require('../gh-client.cjs');

const BASE_TIME = Date.parse('2026-01-01T00:00:00Z');

const ISSUE_JSON_KEYS = new Set([
  'number', 'title', 'body', 'state', 'url', 'labels', 'assignees', 'milestone',
  'createdAt', 'updatedAt', 'closedAt',
]);

// Value-taking flags per command family. Anything else is "unsupported".
const ISSUE_VALUE_FLAGS = {
  create: ['--repo', '--title', '--body', '--label', '--milestone', '--assignee'],
  view: ['--repo', '--json'],
  list: ['--repo', '--label', '--state', '--limit', '--json'],
  edit: ['--repo', '--title', '--body', '--add-label', '--remove-label', '--milestone'],
  comment: ['--repo', '--body'],
  close: ['--repo', '--comment'],
  reopen: ['--repo'],
};
const LABEL_CREATE_FLAGS = ['--repo', '--color', '--description'];
const API_VALUE_FLAGS = ['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--jq', '-q', '--input'];
const API_BOOL_FLAGS = ['--paginate', '--slurp'];

const ISSUE_ID_OFFSET = 1_000_000; // id = ISSUE_ID_OFFSET + number: an id is never a number
const MAX_SUB_ISSUES = 100;        // GitHub: 100 sub-issues per parent, closed ones count
const BASE_SHA = `base${'0'.repeat(36)}`; // the default branch's tip when nothing else is seeded (40 chars)
const MERGE_METHODS = ['merge', 'squash', 'rebase'];

// What gh prints, and how it exits, when the network is down: no HTTP status, no exit code of its own.
const OFFLINE_RESPONSE = {
  ok: false,
  status: null,
  stdout: '',
  stderr: 'error connecting to api.github.com: dial tcp: lookup api.github.com: could not resolve host',
};

const ok = (stdout = '') => ({ ok: true, status: 0, stdout, stderr: '' });
const fail = (stderr, stdout = '') => ({ ok: false, status: 1, stdout, stderr });

/**
 * Parse `args` from index `start`: positionals, flag values (repeatable) and boolean flags.
 * `unknown` lists every flag that is not declared, so the caller can refuse it loudly.
 */
function parseArgs(args, start, valueFlags, boolFlags = []) {
  const value = new Set(valueFlags);
  const bool = new Set(boolFlags);
  const pos = [];
  const flags = {};
  const unknown = [];
  for (let i = start; i < args.length; i++) {
    const tok = String(args[i]);
    if (tok.length > 1 && tok.startsWith('-')) {
      const eq = tok.startsWith('--') ? tok.indexOf('=') : -1;
      const name = eq > 0 ? tok.slice(0, eq) : tok;
      if (value.has(name)) {
        const v = eq > 0 ? tok.slice(eq + 1) : args[++i];
        (flags[name] = flags[name] || []).push(v === undefined ? '' : String(v));
      } else if (bool.has(name)) {
        flags[name] = [true];
      } else {
        unknown.push(tok);
      }
    } else {
      pos.push(tok);
    }
  }
  return { pos, flags, unknown };
}

const flagOne = (p, name) => (p.flags[name] ? p.flags[name][p.flags[name].length - 1] : undefined);
const flagList = (p, name) => (p.flags[name] || []).flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);

function matcherFor(match) {
  if (typeof match === 'function') return match;
  if (match instanceof RegExp) return (args) => match.test(args.join(' '));
  const needle = String(match);
  return (args) => args.join(' ').includes(needle);
}

/**
 * @param {{repo?:string, scopes?:string[], commentPageSize?:number}} [opts]
 * `graphql` (optional): handler for `gh api graphql` argv; returns stdout, a full result, or null.
 * `now` (optional, 46-09): `() => ms`, the caller's clock. Every call is stamped with it, and
 *   `writeTimes()` returns the stamps of the mutating calls, aligned with `writes()` (null without a
 *   clock). The caller's clock is the gh-client `_setNow` one, so pacing is checkable in fake time.
 * 47-02 capability options (what the repo and its owner can do):
 *   `ownerType` 'Organization' | 'User'; `hasWiki`; `push` (permissions.push); `isPrivate`;
 *   `types` the org's issue types `[{id,name,is_enabled}]`; `fields` the org's issue-field
 *   definitions `[{id,name,data_type}]`; `subIssuesApi` false answers 404 on every sub-issue route.
 * 49-01 options: `viewer` (the authenticated login: author of API-posted comments, PRs and statuses),
 *   `defaultBranch` (default 'main'), `refs` (extra `{name: sha}` branches beside the default branch),
 *   `onCreateBranch(name, oid)` (called once per successful createLinkedBranch, so a test can mirror the ref
 *   into a temp bare git repo), `mergeQueue` (default false: the default branch has a merge queue),
 *   `closeKeywordCap` (default null: how many closing-keyword links one merge honours; reconcile's straggler path).
 * 50-01 options (setup and check inputs): `rulesets` (seeded `[{name, enforcement, target?, conditions?, bypass_actors?,
 *   rules?}]`, ids from 9001), `mergeQueueAllowed` (default true; false = a merge_queue rule is 422), `isAdmin` (default
 *   true; false = repo-level writes are 403 and permissions.admin is false), `orgAdmin` (default true; false = org
 *   writes are 403), `fieldOptionsAccepted` (default true; false = issue-field `options` are 422),
 *   `deleteBranchOnMerge` (default false, the repo setting), `files` (`{ref: {path: text}}`), `prCommits`
 *   (`{prNumber: [message]}`). NB `mergeQueue` is the GraphQL probe answer (does the branch HAVE a queue);
 *   `mergeQueueAllowed` is whether the plan lets a ruleset ask for one.
 * @returns {{runGh:Function, issues:object[], comments:object[], milestones:object[], labels:string[],
 *   refs:object, statuses:object, calls:()=>string[][], writes:()=>string[][], writeTimes:()=>(number|null)[],
 *   failNext:Function, humanEditBody:Function, seedIssue:Function, seedComment:Function, seedMilestone:Function,
 *   pushRef:Function, humanMergePr:Function}}
 */
function createFakeGitHub({
  repo = 'o/r', scopes = ['repo', 'project', 'read:project'], commentPageSize = 30, graphql = null, now = null,
  ownerType = 'Organization', hasWiki = true, push = true, isPrivate = false,
  types = [{ id: 1, name: 'Objective', is_enabled: true }, { id: 2, name: 'TRD', is_enabled: true }, { id: 3, name: 'Decision', is_enabled: true }],
  fields = [{ id: 11, name: 'work', data_type: 'single_select' }, { id: 12, name: 'kind', data_type: 'single_select' }],
  subIssuesApi = true,
  viewer = 'devflow-bot', defaultBranch = 'main', refs: seedRefs = {},
  onCreateBranch = null, mergeQueue = false, closeKeywordCap = null,
  rulesets: seedRulesets = [], mergeQueueAllowed = true, isAdmin = true, orgAdmin = true, fieldOptionsAccepted = true,
  deleteBranchOnMerge = false, files = {}, prCommits = {},
} = {}) {
  const [repoOwner, repoName] = repo.split('/');
  // Copies, so a write route never mutates an options array a test shares between fakes.
  const fieldDefs = fields.map((f) => ({ ...f })); // runApi has a local `fields` (the request body), so name the definitions apart
  const typeDefs = types.map((t) => ({ ...t }));
  let wikiEnabled = hasWiki;             // PATCH repos/o/r changes these two (50-01)
  let deleteOnMerge = deleteBranchOnMerge;
  let nextRuleset = 9001;
  let nextTypeSeq = 1;
  const rulesets = [];   // { id, name, target, enforcement, conditions, bypass_actors, rules } (50-01)
  const labelMeta = {};  // label name -> { color, description }, written by `gh label create` (50-01)
  const issues = [];
  const comments = [];
  const milestones = []; // { number, title, description, state, due_on, closed_at }
  const labels = [];     // names
  const refs = { [defaultBranch]: BASE_SHA, ...seedRefs }; // branch name -> tip sha (49-01)
  const statuses = {};   // sha -> commit statuses, newest first (49-01)
  const linked = [];     // { id, issue:number, name } createLinkedBranch records (49-01)
  const log = [];        // every argv runGh saw, in order
  const stamps = [];     // the `now()` reading for each entry of `log` (null without a clock)
  const failures = [];   // { test, response }
  let clock = 0;
  let nextIssue = 1;
  let nextMilestone = 1;
  let nextComment = 1000;
  let nextStatus = 5000;
  let offline = false;

  const tick = () => new Date(BASE_TIME + (++clock) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const issueUrl = (n) => `https://github.com/${repo}/issues/${n}`;

  // ─── Store helpers (also the test-facing seeding API) ─────────────────────

  function ensureLabel(name) {
    if (!labels.includes(name)) labels.push(name);
  }

  function addMilestone(title, description = '') {
    const m = { number: nextMilestone++, title, description, state: 'open', due_on: null, closed_at: null };
    milestones.push(m);
    return m;
  }

  /**
   * Apply a milestone create/edit body (48-05): title, description, state (open|closed), due_on (null or ''
   * clears it). Closing stamps `closed_at`, reopening clears it. Validates first, so a 422 changes nothing.
   * @returns {object|null} a failure response, or null when applied
   */
  function applyMilestoneFields(m, f) {
    if (f.state !== undefined && f.state !== 'open' && f.state !== 'closed') {
      return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'invalid', field: 'state' }], status: '422' }));
    }
    if (f.title !== undefined) {
      if (!f.title) return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'missing_field', field: 'title' }], status: '422' }));
      if (milestones.some((x) => x !== m && x.title === f.title)) {
        return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'already_exists', field: 'title' }], status: '422' }));
      }
      m.title = String(f.title);
    }
    if (f.description !== undefined) m.description = f.description === null ? '' : String(f.description);
    if (f.due_on !== undefined) m.due_on = (f.due_on === null || f.due_on === '') ? null : String(f.due_on);
    if (f.state !== undefined && f.state !== m.state) {
      m.state = f.state;
      m.closed_at = f.state === 'closed' ? tick() : null;
    }
    return null;
  }

  /** `owner` defaults to the repo owner; a test seeds another to exercise the same-owner sub-issue rule. */
  function addIssue({ title, body = '', labels: labelNames = [], milestone = null, state = 'OPEN', assignees = [], type = null, owner = repoOwner }) {
    for (const l of labelNames) ensureLabel(l);
    const at = tick();
    const number = nextIssue++;
    const issue = {
      number, id: ISSUE_ID_OFFSET + number, title, body, labels: [...labelNames], milestone, assignees: [...assignees],
      state, stateReason: state === 'CLOSED' ? 'completed' : null, type, owner,
      parent: null, subIssues: [], blockedBy: [], fieldValues: [],
      createdAt: at, updatedAt: at,
    };
    issues.push(issue);
    return issue;
  }

  /** Every API-posted comment is the viewer's; a seeded one may name another author (49-01). */
  function addComment(issueNumber, body, login = viewer) {
    const at = tick();
    const id = nextComment++;
    const c = {
      id, issue_number: issueNumber, body, user: { login }, created_at: at, updated_at: at,
      html_url: `${issueUrl(issueNumber)}#issuecomment-${id}`,
    };
    comments.push(c);
    return c;
  }

  const findIssue = (n) => issues.find((i) => i.number === Number(n));

  function seedIssue(spec) {
    return addIssue(spec).number;
  }
  /** `{login}` names the author (default: the viewer), so a test can seed a comment by someone else. */
  function seedComment(issueNumber, body, { login } = {}) {
    return addComment(issueNumber, body, login === undefined ? viewer : String(login)).id;
  }
  function seedMilestone(title, description) {
    return addMilestone(title, description).number;
  }

  // ─── gh-shape converters ───────────────────────────────────────────────────

  function toGhIssue(issue, keys) {
    const ms = issue.milestone ? milestones.find((m) => m.title === issue.milestone) : null;
    const full = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      url: issueUrl(issue.number),
      labels: issue.labels.map((name) => ({ name })),
      assignees: issue.assignees.map((login) => ({ login })),
      milestone: issue.milestone ? { number: ms ? ms.number : 0, title: issue.milestone } : null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.state === 'CLOSED' ? issue.updatedAt : null,
    };
    const out = {};
    for (const k of keys) out[k] = full[k];
    return out;
  }

  const toGhComment = (c) => ({ ...c, issue_url: `https://api.github.com/repos/${repo}/issues/${c.issue_number}` });

  const apiIssueUrl = (n) => `https://api.github.com/repos/${repo}/issues/${n}`;

  /** An internal type name -> the `{id, name}` GitHub returns, or null. */
  function typeObject(name) {
    if (!name) return null;
    const t = typeDefs.find((x) => x.name === name);
    return t ? { id: t.id, name: t.name } : null;
  }

  /** The REST (`gh api`) shape of an issue: lower-case state, `id`, `type`, hierarchy and dependency summaries. */
  function toRestIssue(issue) {
    const ms = issue.milestone ? milestones.find((m) => m.title === issue.milestone) : null;
    const children = issue.subIssues.map((n) => findIssue(n)).filter(Boolean);
    const blocking = issues.filter((i) => i.blockedBy.includes(issue.number));
    const completed = children.filter((c) => c.state === 'CLOSED').length;
    const rest = {
      id: issue.id,
      node_id: issue.pr ? `PR_${issue.number}` : `I_${issue.id}`,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state.toLowerCase(),
      state_reason: issue.stateReason,
      url: apiIssueUrl(issue.number),
      html_url: issueUrl(issue.number),
      user: { login: viewer },
      labels: issue.labels.map((name) => ({ name })),
      assignees: issue.assignees.map((login) => ({ login })),
      milestone: issue.milestone ? { number: ms ? ms.number : 0, title: issue.milestone, state: ms ? ms.state : 'open' } : null,
      type: typeObject(issue.type),
      sub_issues_summary: {
        total: children.length,
        completed,
        percent_completed: children.length ? Math.floor((completed / children.length) * 100) : 0,
      },
      issue_dependencies_summary: {
        blocked_by: issue.blockedBy.length,
        total_blocked_by: issue.blockedBy.length,
        blocking: blocking.length,
        total_blocking: blocking.length,
      },
      parent_issue_url: issue.parent ? apiIssueUrl(issue.parent) : null,
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      closed_at: issue.state === 'CLOSED' ? issue.updatedAt : null,
    };
    // GitHub's issues API lists pull requests too, marking them with `pull_request` (and `draft`).
    if (issue.pr) {
      rest.pull_request = { url: apiPullUrl(issue.number), html_url: pullUrl(issue.number) };
      rest.draft = issue.pr.draft;
    }
    return rest;
  }

  // ─── Pull requests (49-01) ─────────────────────────────────────────────────

  const pullUrl = (n) => `https://github.com/${repo}/pull/${n}`;
  const apiPullUrl = (n) => `https://api.github.com/repos/${repo}/pulls/${n}`;
  const findPr = (n) => {
    const issue = findIssue(n);
    return issue && issue.pr ? issue : undefined;
  };

  /**
   * An open PR's head sha follows the branch (a push advances it, as on GitHub); a closed or merged one keeps
   * the sha it ended with.
   */
  function headSha(issue) {
    if (issue.state === 'OPEN' && !issue.pr.merged && refs[issue.pr.head.ref] !== undefined) {
      issue.pr.head.sha = refs[issue.pr.head.ref];
    }
    return issue.pr.head.sha;
  }

  /** The REST `pulls` shape of a PR record. `queued` is fake-only: whether the PR sits in the merge queue. */
  function toRestPull(issue) {
    const pr = issue.pr;
    return {
      id: issue.id,
      node_id: `PR_${issue.number}`,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state.toLowerCase(),
      draft: pr.draft,
      merged: pr.merged,
      merged_at: pr.mergedAt,
      merge_commit_sha: pr.mergeSha,
      queued: pr.queued,
      url: apiPullUrl(issue.number),
      html_url: pullUrl(issue.number),
      user: { login: pr.author },
      labels: issue.labels.map((name) => ({ name })),
      assignees: issue.assignees.map((login) => ({ login })),
      head: { ref: pr.head.ref, sha: headSha(issue), label: `${repoOwner}:${pr.head.ref}` },
      base: { ref: pr.base.ref, label: `${repoOwner}:${pr.base.ref}` },
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      closed_at: issue.state === 'CLOSED' ? issue.updatedAt : null,
    };
  }

  const prOk = (issue) => ok(JSON.stringify(toRestPull(issue)));

  /** `owner:branch` or `branch` -> `{owner, ref}`. */
  function splitHead(head) {
    const s = String(head);
    const at = s.indexOf(':');
    return at > 0 ? { owner: s.slice(0, at), ref: s.slice(at + 1) } : { owner: repoOwner, ref: s };
  }

  /** Validation failure that carries an error message line, as gh prints it for a 422 with `errors[].message`. */
  const refused = (status, message, detail) => fail(`gh: ${message} (HTTP ${status})${detail ? `\n${detail}` : ''}`,
    JSON.stringify({ message, ...(detail ? { errors: [{ resource: 'PullRequest', code: 'custom', message: detail }] } : {}), status: String(status) }));

  /** POST repos/o/r/pulls. */
  function restOpenPull(f) {
    if (typeof f.title !== 'string' || !f.title) return invalid('PullRequest', 'missing_field', 'title');
    if (typeof f.head !== 'string' || !f.head) return invalid('PullRequest', 'missing_field', 'head');
    if (typeof f.base !== 'string' || !f.base) return invalid('PullRequest', 'missing_field', 'base');
    const head = splitHead(f.head);
    if (head.owner !== repoOwner || refs[head.ref] === undefined) return invalid('PullRequest', 'invalid', 'head');
    if (refs[f.base] === undefined) return invalid('PullRequest', 'invalid', 'base');
    if (refs[head.ref] === refs[f.base]) return refused(422, 'Validation Failed', `No commits between ${f.base} and ${head.ref}`);
    if (issues.some((i) => i.pr && i.state === 'OPEN' && i.pr.head.ref === head.ref && i.pr.base.ref === f.base)) {
      return refused(422, 'Validation Failed', `A pull request already exists for ${repoOwner}:${head.ref}.`);
    }
    const issue = addIssue({ title: f.title, body: f.body === undefined || f.body === null ? '' : String(f.body) });
    issue.pr = {
      head: { ref: head.ref, sha: refs[head.ref] },
      base: { ref: f.base },
      draft: toBool(f.draft),
      merged: false,
      mergedAt: null,
      mergeSha: null,
      mergeMethod: null,
      queued: false,
      author: viewer,
    };
    return prOk(issue);
  }

  /** GET repos/o/r/pulls: `head` (`owner:branch`), `base`, `state` (default open; closed includes merged). */
  function restListPulls(p, qs) {
    const state = (qs.get('state') || 'open').toLowerCase();
    const head = qs.get('head') ? splitHead(qs.get('head')) : null;
    const base = qs.get('base');
    const rows = issues
      .filter((i) => i.pr)
      .filter((i) => state === 'all' || i.state.toLowerCase() === state)
      .filter((i) => !head || (head.owner === repoOwner && i.pr.head.ref === head.ref))
      .filter((i) => !base || i.pr.base.ref === base)
      .sort((a, b) => b.number - a.number)
      .map(toRestPull);
    return respondList(rows, p, qs);
  }

  /** PATCH repos/o/r/pulls/{n}: title, body, state, base. A merged PR cannot be reopened. */
  function restPatchPull(issue, f) {
    let changed = false;
    if (f.title !== undefined) {
      if (typeof f.title !== 'string' || !f.title) return invalid('PullRequest', 'invalid', 'title');
      if (issue.title !== f.title) { issue.title = f.title; changed = true; }
    }
    if (f.body !== undefined) {
      const body = f.body === null ? '' : String(f.body);
      if (issue.body !== body) { issue.body = body; changed = true; }
    }
    if (f.base !== undefined) {
      if (refs[f.base] === undefined) return invalid('PullRequest', 'invalid', 'base');
      if (issue.pr.base.ref !== f.base) { issue.pr.base.ref = f.base; changed = true; }
    }
    if (f.state !== undefined) {
      const want = String(f.state).toLowerCase();
      if (want !== 'open' && want !== 'closed') return invalid('PullRequest', 'invalid', 'state');
      const next = want.toUpperCase();
      if (issue.state !== next) {
        if (issue.pr.merged) return refused(422, 'Validation Failed', 'Cannot reopen a merged pull request');
        issue.pr.head.sha = headSha(issue);
        issue.state = next;
        issue.stateReason = next === 'CLOSED' ? 'completed' : 'reopened';
        changed = true;
      }
    }
    if (changed) issue.updatedAt = tick();
    return prOk(issue);
  }

  /**
   * Complete a merge (the REST merge, a queue landing it, or a human clicking the button): the PR is closed
   * and merged. Merging into the DEFAULT branch also closes every open issue the PR body names with a
   * closing keyword (`Closes #N`, `Fixes: #N`, `resolved #N`); `closeKeywordCap` (when set) caps how many of
   * those links GitHub honours, in order of appearance. A merge into any other branch closes nothing.
   */
  function completeMerge(issue, method) {
    const at = tick();
    issue.pr.head.sha = headSha(issue);
    issue.pr.merged = true;
    issue.pr.mergedAt = at;
    issue.pr.mergeSha = `merge${String(issue.number).padStart(35, '0')}`;
    issue.pr.mergeMethod = method;
    issue.pr.queued = false;
    issue.state = 'CLOSED';
    issue.stateReason = 'completed';
    issue.updatedAt = at;
    if (issue.pr.base.ref !== defaultBranch) return;

    const linkedNumbers = [];
    for (const m of String(issue.body || '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?[ \t]+#(\d+)/gi)) {
      const n = Number(m[1]);
      if (!linkedNumbers.includes(n)) linkedNumbers.push(n);
    }
    const honoured = closeKeywordCap === null ? linkedNumbers : linkedNumbers.slice(0, closeKeywordCap);
    for (const n of honoured) {
      const target = findIssue(n);
      if (!target || target.pr || target.state === 'CLOSED') continue;
      target.state = 'CLOSED';
      target.stateReason = 'completed';
      target.updatedAt = tick();
    }
  }

  // ─── Commit statuses and branch refs (49-01) ───────────────────────────────

  const STATUS_STATES = ['error', 'failure', 'pending', 'success'];

  /** POST repos/o/r/statuses/{sha}: GitHub keeps every status, and the latest per context counts. */
  function restPostStatus(sha, f) {
    if (!STATUS_STATES.includes(f.state)) return invalid('Status', 'invalid', 'state');
    const at = tick();
    const entry = {
      id: nextStatus++,
      state: f.state,
      context: f.context === undefined || f.context === null ? 'default' : String(f.context),
      description: f.description === undefined || f.description === null ? null : String(f.description),
      target_url: f.target_url === undefined || f.target_url === null ? null : String(f.target_url),
      created_at: at,
      updated_at: at,
      creator: { login: viewer },
      url: `https://api.github.com/repos/${repo}/statuses/${sha}`,
    };
    (statuses[sha] = statuses[sha] || []).unshift(entry);
    return ok(JSON.stringify(entry));
  }

  /**
   * GET repos/o/r/commits/{sha-or-ref}/status: the latest status per context, newest first, and the combined
   * state: failure if any is failure/error, else pending if there are none or any is pending, else success.
   */
  function restCombinedStatus(shaOrRef) {
    const sha = refs[shaOrRef] !== undefined ? refs[shaOrRef] : shaOrRef;
    const seen = new Set();
    const latest = [];
    for (const s of statuses[sha] || []) {
      if (seen.has(s.context)) continue;
      seen.add(s.context);
      latest.push({ ...s });
    }
    let state = 'success';
    if (latest.some((s) => s.state === 'failure' || s.state === 'error')) state = 'failure';
    else if (latest.length === 0 || latest.some((s) => s.state === 'pending')) state = 'pending';
    return ok(JSON.stringify({
      state,
      sha,
      total_count: latest.length,
      statuses: latest,
      repository: { full_name: repo },
      url: `https://api.github.com/repos/${repo}/commits/${sha}/status`,
    }));
  }

  /** DELETE git/refs/heads/{b}: the branch goes, and so does any issue link to it. */
  function deleteBranch(name) {
    if (refs[name] === undefined) return unprocessable('Reference does not exist');
    delete refs[name];
    for (let i = linked.length - 1; i >= 0; i--) if (linked[i].name === name) linked.splice(i, 1);
    return ok('');
  }

  // ─── Built-in GraphQL (49-01) ──────────────────────────────────────────────

  const REPO_NODE_ID = 'R_1';
  const gqlOk = (data) => ok(JSON.stringify({ data }));
  /** `gh api graphql` exits 1 on `errors`, printing the message to stderr and the body to stdout. */
  const gqlError = (message) => fail(`gh: ${message}`, JSON.stringify({ data: null, errors: [{ message }] }));
  const noNode = (id) => gqlError(`Could not resolve to a node with the global id of '${id}'`);

  /**
   * The value of an input/argument `field` in a GraphQL document: `field:$var` is read from the variables,
   * `field:"literal"` and `field:12` inline; with no mention in the document, a variable named `field`.
   */
  function gqlArg(query, vars, field) {
    const m = new RegExp(`\\b${field}\\s*:\\s*(?:\\$(\\w+)|"([^"]*)"|(\\d+))`).exec(query);
    if (m) return m[1] !== undefined ? vars[m[1]] : (m[2] !== undefined ? m[2] : m[3]);
    return vars[field];
  }

  /** An error when `owner`/`name` name a repository other than this one; null otherwise (or when not given). */
  function gqlWrongRepo(query, vars) {
    const owner = gqlArg(query, vars, 'owner');
    const name = gqlArg(query, vars, 'name');
    if ((owner !== undefined && owner !== repoOwner) || (name !== undefined && name !== repoName)) {
      return gqlError(`Could not resolve to a Repository with the name '${owner}/${name}'.`);
    }
    return null;
  }

  /** A pull request by its GraphQL node id (`PR_<n>`), or undefined. */
  function prByNodeId(id) {
    const m = /^PR_(\d+)$/.exec(String(id));
    return m ? findPr(m[1]) : undefined;
  }

  /**
   * createLinkedBranch: the branch is created at `oid` and linked to the issue. A name that already exists is
   * NOT linked and NOT an error: GitHub answers `linkedBranch: null` (49 Pitfall 2).
   */
  function gqlCreateLinkedBranch(query, vars) {
    const issueId = gqlArg(query, vars, 'issueId');
    const issue = issues.find((i) => !i.pr && `I_${i.id}` === issueId);
    if (!issue) return noNode(issueId);
    const oid = gqlArg(query, vars, 'oid');
    if (!oid) return gqlError('Variable $oid of type GitObjectID! was provided invalid value');
    const repositoryId = gqlArg(query, vars, 'repositoryId');
    if (repositoryId !== undefined && repositoryId !== REPO_NODE_ID) return noNode(repositoryId);
    const given = gqlArg(query, vars, 'name');
    const name = given || `${issue.number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
    if (refs[name] !== undefined) return gqlOk({ createLinkedBranch: { linkedBranch: null } });
    refs[name] = oid;
    const link = { id: `LB_${linked.length + 1}`, issue: issue.number, name };
    linked.push(link);
    if (typeof onCreateBranch === 'function') onCreateBranch(name, oid);
    return gqlOk({ createLinkedBranch: { linkedBranch: { id: link.id, ref: { name, target: { oid } } } } });
  }

  function gqlLinkedBranches(query, vars) {
    const wrong = gqlWrongRepo(query, vars);
    if (wrong) return wrong;
    const n = gqlArg(query, vars, 'number');
    const issue = findIssue(n);
    if (!issue || issue.pr) return gqlError(`Could not resolve to an Issue with the number of ${n}.`);
    const nodes = linked.filter((l) => l.issue === issue.number)
      .map((l) => ({ id: l.id, ref: { name: l.name, target: { oid: refs[l.name] } } }));
    return gqlOk({ repository: { issue: { id: `I_${issue.id}`, linkedBranches: { nodes } } } });
  }

  /** markPullRequestReadyForReview: idempotent, an already-ready PR stays ready. */
  function gqlReady(query, vars) {
    const id = gqlArg(query, vars, 'pullRequestId');
    const issue = prByNodeId(id);
    if (!issue) return noNode(id);
    if (issue.pr.draft) {
      issue.pr.draft = false;
      issue.updatedAt = tick();
    }
    return gqlOk({ markPullRequestReadyForReview: { pullRequest: { id: `PR_${issue.number}`, number: issue.number, isDraft: false } } });
  }

  /** repository.mergeQueue(branch): non-null only for the default branch, and only when the fake has a queue. */
  function gqlMergeQueue(query, vars) {
    const wrong = gqlWrongRepo(query, vars);
    if (wrong) return wrong;
    const branch = gqlArg(query, vars, 'branch');
    return gqlOk({ repository: { mergeQueue: mergeQueue && branch === defaultBranch ? { id: 'MQ_1' } : null } });
  }

  /** enqueuePullRequest: marks the PR queued; it stays open until `humanMergePr` lands it. Re-enqueueing is a no-op. */
  function gqlEnqueue(query, vars) {
    const id = gqlArg(query, vars, 'pullRequestId');
    const issue = prByNodeId(id);
    if (!issue) return noNode(id);
    if (!mergeQueue || issue.pr.base.ref !== defaultBranch) return gqlError('Pull request does not target a branch with a merge queue');
    if (issue.pr.merged || issue.state !== 'OPEN') return gqlError('Pull request is not open');
    if (issue.pr.draft) return gqlError('Pull request is a draft and cannot be added to the merge queue');
    if (!issue.pr.queued) {
      issue.pr.queued = true;
      issue.updatedAt = tick();
    }
    return gqlOk({ enqueuePullRequest: { mergeQueueEntry: { id: `MQE_${issue.number}`, position: 1 } } });
  }

  /**
   * The GraphQL operations objective 49 uses, matched on the document text. Returns null for anything else,
   * which then goes to the caller's `graphql(argv)` handler. Mutations are classified as writes by gh-client
   * from the `mutation` keyword, so `writes()` and `calls()` need no help from here.
   */
  function runGraphql(vars) {
    const query = vars.query;
    if (typeof query !== 'string') return null;
    if (/\bcreateLinkedBranch\s*\(/.test(query)) return gqlCreateLinkedBranch(query, vars);
    if (/\bmarkPullRequestReadyForReview\s*\(/.test(query)) return gqlReady(query, vars);
    if (/\benqueuePullRequest\s*\(/.test(query)) return gqlEnqueue(query, vars);
    if (/\bmergeQueue\s*\(/.test(query)) return gqlMergeQueue(query, vars);
    if (/\blinkedBranches\b/.test(query)) return gqlLinkedBranches(query, vars);
    return null;
  }

  /** PUT repos/o/r/pulls/{n}/merge. */
  function restMergePull(issue, f) {
    const method = f.merge_method === undefined ? 'merge' : String(f.merge_method);
    if (!MERGE_METHODS.includes(method)) return invalid('PullRequest', 'invalid', 'merge_method');
    if (issue.pr.draft) return refused(405, 'Pull Request is still a draft');
    if (issue.pr.merged || issue.state !== 'OPEN') return refused(405, 'Pull Request is not mergeable');
    completeMerge(issue, method);
    return ok(JSON.stringify({ sha: issue.pr.mergeSha, merged: true, message: 'Pull Request successfully merged' }));
  }

  /** `--json a,b` -> key list, or an error result. */
  function jsonKeys(p) {
    const raw = flagList(p, '--json');
    if (raw.length === 0) return { error: fail('[gh-fake] unsupported: this command needs --json') };
    const bad = raw.find((k) => !ISSUE_JSON_KEYS.has(k));
    if (bad) return { error: fail(`Unknown JSON field: "${bad}"`) };
    return { keys: raw };
  }

  const unsupported = (args) => fail(`[gh-fake] unsupported: ${args.join(' ')}`);
  const noRepo = (r) => fail(`GraphQL: Could not resolve to a Repository with the name '${r}'. (repository)`);
  const noIssue = (n) => fail(`GraphQL: Could not resolve to an Issue with the number of ${n}. (repository.issue)`);

  // ─── issue ─────────────────────────────────────────────────────────────────

  function runIssue(args) {
    const sub = args[1];
    const allowed = ISSUE_VALUE_FLAGS[sub];
    if (!allowed) return unsupported(args);
    const p = parseArgs(args, 2, allowed);
    if (p.unknown.length) return unsupported(args);
    const slug = flagOne(p, '--repo');
    if (!slug) return unsupported(args);
    if (slug !== repo) return noRepo(slug);

    if (sub === 'create') {
      const title = flagOne(p, '--title');
      if (title === undefined) return unsupported(args);
      const wanted = flagList(p, '--label');
      const missing = wanted.find((l) => !labels.includes(l));
      if (missing) return fail(`could not add label: '${missing}' not found`);
      const milestone = flagOne(p, '--milestone') || null;
      if (milestone && !milestones.some((m) => m.title === milestone)) {
        return fail(`could not add to milestone '${milestone}': '${milestone}' not found`);
      }
      const issue = addIssue({ title, body: flagOne(p, '--body') || '', labels: wanted, milestone, assignees: flagList(p, '--assignee') });
      return ok(issueUrl(issue.number));
    }

    if (sub === 'list') {
      const { keys, error } = jsonKeys(p);
      if (error) return error;
      const state = (flagOne(p, '--state') || 'open').toLowerCase();
      const wanted = flagList(p, '--label');
      const limit = Number(flagOne(p, '--limit') || 30);
      const rows = issues
        .filter((i) => !i.pr) // gh issue list never shows pull requests
        .filter((i) => state === 'all' || i.state.toLowerCase() === state)
        .filter((i) => wanted.every((l) => i.labels.includes(l)))
        .sort((a, b) => b.number - a.number)
        .slice(0, limit)
        .map((i) => toGhIssue(i, keys));
      return ok(JSON.stringify(rows));
    }

    const number = p.pos[0];
    if (number === undefined) return unsupported(args);
    const issue = findIssue(number);
    if (!issue) return noIssue(number);

    if (sub === 'view') {
      const { keys, error } = jsonKeys(p);
      if (error) return error;
      return ok(JSON.stringify(toGhIssue(issue, keys)));
    }

    if (sub === 'edit') {
      let changed = false;
      const set = (field, value) => {
        if (value !== undefined && issue[field] !== value) {
          issue[field] = value;
          changed = true;
        }
      };
      set('title', flagOne(p, '--title'));
      set('body', flagOne(p, '--body'));
      const add = flagList(p, '--add-label');
      const missing = add.find((l) => !labels.includes(l));
      if (missing) return fail(`could not add label: '${missing}' not found`);
      for (const l of add) if (!issue.labels.includes(l)) { issue.labels.push(l); changed = true; }
      for (const l of flagList(p, '--remove-label')) {
        const at = issue.labels.indexOf(l);
        if (at >= 0) { issue.labels.splice(at, 1); changed = true; }
      }
      const ms = flagOne(p, '--milestone');
      if (ms !== undefined) {
        if (!milestones.some((m) => m.title === ms)) return fail(`could not add to milestone '${ms}': '${ms}' not found`);
        set('milestone', ms);
      }
      if (changed) issue.updatedAt = tick();
      return ok(issueUrl(issue.number));
    }

    if (sub === 'comment') {
      const body = flagOne(p, '--body');
      if (body === undefined) return unsupported(args);
      const c = addComment(issue.number, body);
      issue.updatedAt = c.created_at;
      return ok(c.html_url);
    }

    if (sub === 'close') {
      const note = flagOne(p, '--comment');
      if (note !== undefined) addComment(issue.number, note);
      issue.state = 'CLOSED';
      issue.stateReason = 'completed';
      issue.updatedAt = tick();
      return ok(`✓ Closed issue ${repo}#${issue.number} (${issue.title})`);
    }

    // reopen
    issue.state = 'OPEN';
    issue.stateReason = 'reopened';
    issue.updatedAt = tick();
    return ok(`✓ Reopened issue ${repo}#${issue.number} (${issue.title})`);
  }

  // ─── label ─────────────────────────────────────────────────────────────────

  function runLabel(args) {
    if (args[1] !== 'create') return unsupported(args);
    const p = parseArgs(args, 2, LABEL_CREATE_FLAGS);
    if (p.unknown.length || p.pos.length !== 1) return unsupported(args);
    const slug = flagOne(p, '--repo');
    if (!slug) return unsupported(args);
    if (slug !== repo) return noRepo(slug);
    const name = p.pos[0];
    if (labels.includes(name)) {
      return fail(`label with name "${name}" already exists; use \`--force\` to update its color and description`);
    }
    labels.push(name);
    labelMeta[name] = { color: (flagOne(p, '--color') || 'ededed').replace(/^#/, ''), description: flagOne(p, '--description') || null };
    return ok(`✓ Label "${name}" created in ${repo}`);
  }

  // ─── api ───────────────────────────────────────────────────────────────────

  const notFound = () => fail('gh: Not Found (HTTP 404)', JSON.stringify({ message: 'Not Found', status: '404' }));

  /** Apply --paginate / --slurp / per_page / page to an already-filtered row list. */
  function respondList(rows, p, qs) {
    const paginate = Boolean(p.flags['--paginate']);
    const slurp = Boolean(p.flags['--slurp']);
    if (slurp && !paginate) return fail('the `--slurp` option requires `--paginate`');
    const size = Number(qs.get('per_page')) || commentPageSize;
    if (paginate) {
      const pages = [];
      for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
      if (pages.length === 0) pages.push([]);
      // gh concatenates page documents when they are not slurped: `[..][..]`.
      return ok(slurp ? JSON.stringify(pages) : pages.map((pg) => JSON.stringify(pg)).join(''));
    }
    const page = Number(qs.get('page')) || 1;
    return ok(JSON.stringify(rows.slice((page - 1) * size, page * size)));
  }

  function fieldMap(p) {
    const out = {};
    for (const name of ['-f', '-F', '--field', '--raw-field']) {
      for (const kv of p.flags[name] || []) {
        const eq = kv.indexOf('=');
        if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
    return out;
  }

  // ─── REST helpers (47-02) ──────────────────────────────────────────────────

  const invalid = (resource, code, field) => fail('gh: Validation Failed (HTTP 422)',
    JSON.stringify({ message: 'Validation Failed', errors: [{ resource, code, field }], status: '422' }));
  const unprocessable = (message) => fail(`gh: ${message} (HTTP 422)`, JSON.stringify({ message, status: '422' }));
  const restOk = (issue) => ok(JSON.stringify(toRestIssue(issue)));

  /** `-F` values arrive as strings and `--input` values keep their type: accept either. */
  function toInt(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  }
  const toBool = (v) => v === true || v === 'true';
  const labelNames = (raw) => (Array.isArray(raw) ? raw : [])
    .map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean).map(String);

  /**
   * The type name a repo can actually set, or null (D-08). GitHub silently DROPS a type it cannot set
   * rather than failing the write, so callers must check the response.
   */
  function resolveType(name) {
    if (typeof name !== 'string' || !name) return null;
    if (ownerType !== 'Organization' || !push) return null; // issue types are org-only and need push access
    const t = typeDefs.find((x) => x.name === name && x.is_enabled);
    return t ? t.name : null;
  }

  /** Milestone NUMBER (REST) -> internal title; `undefined` when no such milestone. */
  function milestoneTitle(number) {
    const ms = milestones.find((m) => m.number === toInt(number));
    return ms ? ms.title : undefined;
  }

  function restCreate(f) {
    if (typeof f.title !== 'string' || !f.title) return invalid('Issue', 'missing_field', 'title');
    let milestone = null;
    if (f.milestone !== undefined && f.milestone !== null) {
      milestone = milestoneTitle(f.milestone);
      if (milestone === undefined) return invalid('Issue', 'invalid', 'milestone');
    }
    const issue = addIssue({
      title: f.title,
      body: f.body === undefined || f.body === null ? '' : String(f.body),
      labels: labelNames(f.labels),
      milestone,
      assignees: Array.isArray(f.assignees) ? f.assignees.map(String) : [],
      type: resolveType(f.type),
    });
    return restOk(issue);
  }

  const STATE_REASONS = ['completed', 'not_planned', 'duplicate', 'reopened'];

  function restPatch(issue, f) {
    let changed = false;
    const set = (field, value) => {
      if (JSON.stringify(issue[field]) !== JSON.stringify(value)) { issue[field] = value; changed = true; }
    };
    if (f.title !== undefined) {
      if (typeof f.title !== 'string' || !f.title) return invalid('Issue', 'invalid', 'title');
      set('title', f.title);
    }
    if (f.body !== undefined) set('body', f.body === null ? '' : String(f.body));
    if (f.state_reason !== undefined && f.state_reason !== null && !STATE_REASONS.includes(f.state_reason)) {
      return invalid('Issue', 'invalid', 'state_reason');
    }
    if (f.state !== undefined) {
      const want = String(f.state).toLowerCase();
      if (want !== 'open' && want !== 'closed') return invalid('Issue', 'invalid', 'state');
      const next = want.toUpperCase();
      if (issue.state !== next) {
        issue.state = next;
        issue.stateReason = next === 'CLOSED' ? (f.state_reason || 'completed') : 'reopened';
        changed = true;
      }
    }
    if (f.state_reason && issue.state === 'CLOSED') set('stateReason', f.state_reason);
    if (f.labels !== undefined) {
      const names = labelNames(f.labels);
      for (const l of names) ensureLabel(l);
      set('labels', names);
    }
    if (f.assignees !== undefined) set('assignees', Array.isArray(f.assignees) ? f.assignees.map(String) : []);
    if (f.milestone !== undefined) {
      if (f.milestone === null) set('milestone', null);
      else {
        const title = milestoneTitle(f.milestone);
        if (title === undefined) return invalid('Issue', 'invalid', 'milestone');
        set('milestone', title);
      }
    }
    if (f.type !== undefined) {
      if (f.type === null) set('type', null);
      else {
        const t = resolveType(f.type);
        if (t) set('type', t); // an unsettable type is dropped silently, leaving the issue as it was (D-08)
      }
    }
    if (changed) issue.updatedAt = tick();
    return restOk(issue);
  }

  /** GET repos/o/r/issues: `state` (default open), `labels` (AND), `direction`, then the shared pager. */
  function restList(p, qs) {
    const state = (qs.get('state') || 'open').toLowerCase();
    const wanted = (qs.get('labels') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const dir = (qs.get('direction') || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const rows = issues
      .filter((i) => state === 'all' || i.state.toLowerCase() === state)
      .filter((i) => wanted.every((l) => i.labels.includes(l)))
      .sort((a, b) => dir * (a.number - b.number))
      .map(toRestIssue);
    return respondList(rows, p, qs);
  }

  /** The issue whose database id is `idValue` (never a number), or undefined. */
  const findById = (idValue) => {
    const id = toInt(idValue);
    return id === null ? undefined : issues.find((i) => i.id === id);
  };

  function addSubIssue(parent, f) {
    if (toInt(f.sub_issue_id) === null) return invalid('Issue', 'missing_field', 'sub_issue_id');
    const child = findById(f.sub_issue_id);
    if (!child) return notFound(); // Pitfall 1: a number sent as an id lands here
    if (child.owner !== parent.owner) return unprocessable('Sub-issues must belong to the same repository owner');
    if (child === parent) return unprocessable('An issue cannot be its own sub-issue');
    if (parent.subIssues.includes(child.number)) return unprocessable('Issue may not contain duplicate sub-issues');
    for (let up = parent; up; up = up.parent === null ? null : findIssue(up.parent)) {
      if (up === child) return unprocessable('A sub-issue cannot be an ancestor of its parent');
    }
    if (child.parent !== null && !toBool(f.replace_parent)) return unprocessable('Issue already has a parent');
    if (parent.subIssues.length >= MAX_SUB_ISSUES) return unprocessable(`Issue may not contain more than ${MAX_SUB_ISSUES} sub-issues`);
    if (child.parent !== null) {
      const old = findIssue(child.parent);
      old.subIssues = old.subIssues.filter((n) => n !== child.number);
      old.updatedAt = tick();
    }
    parent.subIssues.push(child.number);
    child.parent = parent.number;
    parent.updatedAt = tick();
    return restOk(parent);
  }

  function removeSubIssue(parent, f) {
    if (toInt(f.sub_issue_id) === null) return invalid('Issue', 'missing_field', 'sub_issue_id');
    const child = findById(f.sub_issue_id);
    if (!child || child.parent !== parent.number) return notFound();
    parent.subIssues = parent.subIssues.filter((n) => n !== child.number);
    child.parent = null;
    parent.updatedAt = tick();
    return restOk(parent);
  }

  function addBlockedBy(issue, f) {
    if (toInt(f.issue_id) === null) return invalid('Issue', 'missing_field', 'issue_id');
    const blocker = findById(f.issue_id);
    if (!blocker) return notFound();
    if (blocker === issue) return unprocessable('An issue cannot block itself');
    if (issue.blockedBy.includes(blocker.number)) return unprocessable('Issue is already blocked by this issue');
    issue.blockedBy.push(blocker.number);
    issue.updatedAt = tick();
    return restOk(issue);
  }

  function removeBlockedBy(issue, idValue) {
    const blocker = findById(idValue);
    if (!blocker || !issue.blockedBy.includes(blocker.number)) return notFound();
    issue.blockedBy = issue.blockedBy.filter((n) => n !== blocker.number);
    issue.updatedAt = tick();
    return restOk(issue);
  }

  /** POST merges `issue_field_values` by field_id; PUT replaces the whole set. Unknown field ids are 422. */
  function writeFieldValues(issue, f, replace) {
    const incoming = f.issue_field_values;
    if (!Array.isArray(incoming)) return invalid('Issue', 'missing_field', 'issue_field_values');
    for (const v of incoming) {
      if (!v || !fieldDefs.some((d) => d.id === toInt(v.field_id))) return invalid('IssueFieldValue', 'invalid', 'field_id');
    }
    const next = replace ? [] : issue.fieldValues.map((v) => ({ ...v }));
    for (const v of incoming) {
      const id = toInt(v.field_id);
      const at = next.findIndex((x) => x.field_id === id);
      if (at >= 0) next[at] = { field_id: id, value: v.value };
      else next.push({ field_id: id, value: v.value });
    }
    if (JSON.stringify(next) !== JSON.stringify(issue.fieldValues)) {
      issue.fieldValues = next;
      issue.updatedAt = tick();
    }
    return ok(JSON.stringify(issue.fieldValues.map((v) => ({ ...v }))));
  }

  // ─── Setup routes (50-01): rulesets, repo settings, labels ─────────────────

  const badRequest = (message) => fail(`gh: ${message} (HTTP 400)`, JSON.stringify({ message, status: '400' }));
  const forbidden = (message) => fail(`gh: ${message} (HTTP 403)`, JSON.stringify({ message, status: '403' }));
  /** Repo-level writes need admin; a bare 403 is a permission error (never classified as a rate limit). */
  const repoAdminDenied = () => (isAdmin ? null : forbidden('Must have admin rights to Repository.'));
  const copy = (v) => JSON.parse(JSON.stringify(v));

  const ENFORCEMENTS = ['disabled', 'active', 'evaluate'];
  const RULESET_FIELDS = ['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules'];
  const rulesetSummary = (r) => ({ id: r.id, name: r.name, target: r.target, enforcement: r.enforcement });

  function addRuleset(body) {
    const r = {
      id: nextRuleset++,
      name: body.name,
      target: body.target || 'branch',
      enforcement: body.enforcement,
      conditions: copy(body.conditions === undefined ? {} : body.conditions),
      bypass_actors: copy(body.bypass_actors === undefined ? [] : body.bypass_actors),
      rules: copy(body.rules === undefined ? [] : body.rules),
    };
    rulesets.push(r);
    return r;
  }
  for (const seed of seedRulesets) addRuleset(seed);

  /** 422 for a ruleset body, or null. `forId` is the ruleset being patched: its own name is not a clash. */
  function rulesetInvalid(body, { create, forId = null }) {
    if (create && !body.name) return invalid('Ruleset', 'missing_field', 'name');
    if (create && body.enforcement === undefined) return invalid('Ruleset', 'missing_field', 'enforcement');
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name)) return invalid('Ruleset', 'invalid', 'name');
    if (body.enforcement !== undefined && !ENFORCEMENTS.includes(body.enforcement)) return invalid('Ruleset', 'invalid', 'enforcement');
    if (body.rules !== undefined && (!Array.isArray(body.rules) || body.rules.some((r) => !r || typeof r.type !== 'string'))) {
      return invalid('Ruleset', 'invalid', 'rules');
    }
    // A plan without merge queues refuses the rule outright (50-RESEARCH Pitfall 4): setup retries without it.
    if (!mergeQueueAllowed && Array.isArray(body.rules) && body.rules.some((r) => r.type === 'merge_queue')) {
      return invalid('Ruleset', 'invalid', 'rules');
    }
    if (body.name !== undefined && rulesets.some((r) => r.name === body.name && r.id !== forId)) {
      return invalid('Ruleset', 'already_exists', 'name');
    }
    return null;
  }

  /** repos/o/r/rulesets (GET list, POST) and repos/o/r/rulesets/{id} (GET, PUT). */
  function restRulesets(method, id, fields, p, qs, args) {
    if (id === undefined) {
      if (method === 'GET') return respondList(rulesets.map(rulesetSummary), p, qs);
      if (method !== 'POST') return unsupported(args);
      const denied = repoAdminDenied();
      if (denied) return denied;
      const bad = rulesetInvalid(fields, { create: true });
      if (bad) return bad;
      return ok(JSON.stringify(addRuleset(fields)));
    }
    if (method !== 'GET' && method !== 'PUT') return unsupported(args);
    if (method === 'PUT') {
      const denied = repoAdminDenied();
      if (denied) return denied;
    }
    const found = rulesets.find((r) => String(r.id) === id);
    if (!found) return notFound();
    if (method === 'PUT') {
      const bad = rulesetInvalid(fields, { create: false, forId: found.id });
      if (bad) return bad;
      for (const key of RULESET_FIELDS) if (fields[key] !== undefined) found[key] = copy(fields[key]);
    }
    return ok(JSON.stringify(found));
  }

  /** The repo meta GET and PATCH both answer with. */
  const repoOk = () => ok(JSON.stringify({
    id: 424242,
    node_id: 'R_1',
    name: repoName,
    full_name: repo,
    owner: { login: repoOwner, type: ownerType },
    private: isPrivate,
    has_wiki: wikiEnabled,
    has_issues: true,
    delete_branch_on_merge: deleteOnMerge,
    html_url: `https://github.com/${repo}`,
    default_branch: defaultBranch,
    permissions: { admin: push && isAdmin, maintain: push, push, triage: true, pull: true },
  }));

  /** PATCH repos/o/r: only the two settings setup writes. Any other field is a loud gap, never a quiet success. */
  function restPatchRepo(fields, args) {
    const gap = Object.keys(fields).find((k) => k !== 'has_wiki' && k !== 'delete_branch_on_merge');
    if (gap !== undefined) return fail(`[gh-fake] unsupported: ${args.join(' ')} (repo field ${gap})`);
    const denied = repoAdminDenied();
    if (denied) return denied;
    if (fields.has_wiki !== undefined) wikiEnabled = toBool(fields.has_wiki);
    if (fields.delete_branch_on_merge !== undefined) deleteOnMerge = toBool(fields.delete_branch_on_merge);
    return repoOk();
  }

  /** GET repos/o/r/labels: what `gh label create` made, in creation order. */
  function restListLabels(p, qs) {
    return respondList(labels.map((name, i) => {
      const meta = labelMeta[name] || { color: 'ededed', description: null };
      return { id: 200_000 + i, node_id: `LA_${200_000 + i}`, name, color: meta.color, default: false, description: meta.description };
    }), p, qs);
  }

  function runApi(args, opts = {}) {
    const p = parseArgs(args, 1, API_VALUE_FLAGS, API_BOOL_FLAGS);
    if (p.unknown.length || p.pos.length !== 1) return unsupported(args);
    // `api graphql`: the operations objective 49 uses are built in (49-01); everything else is answered by
    // the caller's handler (46-07): graphql(argv) -> stdout string | full result object | null (unsupported).
    // Without a handler GraphQL stays unsupported.
    if (p.pos[0] === 'graphql') {
      const builtin = runGraphql(fieldMap(p));
      if (builtin) return builtin;
      const out = typeof graphql === 'function' ? graphql(args) : null;
      if (out === null || out === undefined) return unsupported(args);
      return typeof out === 'string' ? ok(out) : out;
    }
    // `--input -` reads the request body from stdin: runGh hands it over as `opts.input` (JSON). Its
    // values keep their types (arrays, ints), unlike the strings `-f`/`-F` produce. A file path is not
    // implemented, so it stays loudly unsupported.
    let fields = fieldMap(p);
    let hasInput = false;
    const inputFlag = flagOne(p, '--input');
    if (inputFlag !== undefined) {
      if (inputFlag !== '-') return unsupported(args);
      if (opts.input === undefined) return fail('[gh-fake] `--input -` was given but runGh received no opts.input (the request body)');
      let body;
      try {
        body = JSON.parse(opts.input);
      } catch (e) {
        return fail(`[gh-fake] \`--input -\` body is not valid JSON: ${e.message}`);
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return fail('[gh-fake] `--input -` body must be a JSON object');
      }
      fields = { ...fields, ...body };
      hasInput = true;
    }
    const explicit = flagOne(p, '-X') || flagOne(p, '--method');
    const method = (explicit || (hasInput || Object.keys(fields).length ? 'POST' : 'GET')).toUpperCase();

    const [rawPath, query = ''] = p.pos[0].replace(/^\//, '').split('?');
    const qs = new URLSearchParams(query);

    let m = /^repos\/([^/]+\/[^/]+)\/milestones$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      if (method === 'POST') {
        const title = fields.title;
        if (!title) return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'missing_field', field: 'title' }], status: '422' }));
        if (milestones.some((x) => x.title === title)) {
          return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'already_exists', field: 'title' }], status: '422' }));
        }
        if (fields.state !== undefined && fields.state !== 'open' && fields.state !== 'closed') {
          return fail('gh: Validation Failed (HTTP 422)', JSON.stringify({ message: 'Validation Failed', errors: [{ resource: 'Milestone', code: 'invalid', field: 'state' }], status: '422' }));
        }
        const made = addMilestone(title, fields.description || '');
        applyMilestoneFields(made, { state: fields.state, due_on: fields.due_on });
        return ok(JSON.stringify(made));
      }
      if (method === 'GET') {
        const state = qs.get('state') || 'open';
        const rows = milestones.filter((x) => state === 'all' || x.state === state).map((x) => ({ ...x }));
        return respondList(rows, p, qs);
      }
      return unsupported(args);
    }

    // 48-05: one milestone, by NUMBER (REST never addresses a milestone by title).
    m = /^repos\/([^/]+\/[^/]+)\/milestones\/(\d+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      const ms = milestones.find((x) => x.number === Number(m[2]));
      if (!ms) return notFound();
      if (method === 'GET') return ok(JSON.stringify({ ...ms }));
      if (method === 'PATCH') {
        const refused = applyMilestoneFields(ms, fields);
        return refused || ok(JSON.stringify({ ...ms }));
      }
      return unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      const issue = findIssue(m[2]);
      if (!issue) return notFound();
      if (method === 'GET') {
        return respondList(comments.filter((c) => c.issue_number === issue.number).map(toGhComment), p, qs);
      }
      if (method === 'POST') {
        if (fields.body === undefined) return fail('gh: Validation Failed (HTTP 422)');
        const c = addComment(issue.number, fields.body);
        issue.updatedAt = c.created_at;
        return ok(JSON.stringify(toGhComment(c)));
      }
      return unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/issues\/comments\/(\d+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      const c = comments.find((x) => x.id === Number(m[2]));
      if (!c) return notFound();
      if (method === 'GET') return ok(JSON.stringify(toGhComment(c)));
      if (method === 'PATCH') {
        if (fields.body === undefined) return fail('gh: Validation Failed (HTTP 422)');
        if (c.body !== fields.body) {
          c.body = fields.body;
          c.updated_at = tick();
        }
        return ok(JSON.stringify(toGhComment(c)));
      }
      return unsupported(args);
    }

    // ── 47-02: REST issues, hierarchy and dependencies ──

    m = /^repos\/([^/]+\/[^/]+)\/issues$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      if (method === 'POST') return restCreate(fields);
      if (method === 'GET') return restList(p, qs);
      return unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/issues\/(\d+)(?:\/(.+))?$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      const issue = findIssue(m[2]);
      if (!issue) return notFound();
      const tail = m[3];

      if (tail === undefined) {
        if (method === 'GET') return restOk(issue);
        if (method === 'PATCH') return restPatch(issue, fields);
        return unsupported(args);
      }

      if (!subIssuesApi && (tail === 'sub_issues' || tail === 'sub_issue' || tail === 'parent')) return notFound();

      if (tail === 'sub_issues') {
        if (method === 'GET') return respondList(issue.subIssues.map((n) => toRestIssue(findIssue(n))), p, qs);
        if (method === 'POST') return addSubIssue(issue, fields);
        return unsupported(args);
      }
      if (tail === 'sub_issue') {
        if (method === 'DELETE') return removeSubIssue(issue, fields);
        return unsupported(args);
      }
      if (tail === 'parent') {
        if (method !== 'GET') return unsupported(args);
        return issue.parent === null ? notFound() : restOk(findIssue(issue.parent));
      }
      if (tail === 'dependencies/blocked_by') {
        if (method === 'GET') return respondList(issue.blockedBy.map((n) => toRestIssue(findIssue(n))), p, qs);
        if (method === 'POST') return addBlockedBy(issue, fields);
        return unsupported(args);
      }
      const blockedById = /^dependencies\/blocked_by\/(\d+)$/.exec(tail);
      if (blockedById) {
        if (method === 'DELETE') return removeBlockedBy(issue, blockedById[1]);
        return unsupported(args);
      }
      if (tail === 'dependencies/blocking') {
        if (method !== 'GET') return unsupported(args);
        return respondList(issues.filter((i) => i.blockedBy.includes(issue.number)).map(toRestIssue), p, qs);
      }
      if (tail === 'issue-field-values') {
        if (ownerType !== 'Organization') return notFound(); // issue fields are org-level
        if (method === 'GET') return ok(JSON.stringify(issue.fieldValues.map((v) => ({ ...v }))));
        if (method === 'POST' || method === 'PUT') return writeFieldValues(issue, fields, method === 'PUT');
        return unsupported(args);
      }
    }

    // ── 49-01: pull requests and the authenticated user ──

    if (rawPath === 'user') {
      if (method !== 'GET') return unsupported(args);
      return ok(JSON.stringify({ login: viewer, id: 7, type: 'User' }));
    }

    m = /^repos\/([^/]+\/[^/]+)\/pulls$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      if (method === 'POST') return restOpenPull(fields);
      if (method === 'GET') return restListPulls(p, qs);
      return unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/pulls\/(\d+)(\/merge)?$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      const issue = findPr(m[2]);
      if (!issue) return notFound();
      if (m[3]) return method === 'PUT' ? restMergePull(issue, fields) : unsupported(args);
      if (method === 'GET') return prOk(issue);
      if (method === 'PATCH') return restPatchPull(issue, fields);
      return unsupported(args);
    }

    // ── 49-01: commit statuses and branch refs ──

    m = /^repos\/([^/]+\/[^/]+)\/statuses\/([^/]+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      return method === 'POST' ? restPostStatus(m[2], fields) : unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/commits\/(.+)\/status$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      return method === 'GET' ? restCombinedStatus(m[2]) : unsupported(args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/git\/ref\/heads\/(.+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      if (method !== 'GET') return unsupported(args);
      if (refs[m[2]] === undefined) return notFound();
      return ok(JSON.stringify({ ref: `refs/heads/${m[2]}`, node_id: `REF_${m[2]}`, object: { sha: refs[m[2]], type: 'commit' } }));
    }

    m = /^repos\/([^/]+\/[^/]+)\/git\/refs\/heads\/(.+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      return method === 'DELETE' ? deleteBranch(m[2]) : unsupported(args);
    }

    // ── 50-01: setup routes (rulesets, labels) ──

    m = /^repos\/([^/]+\/[^/]+)\/rulesets(?:\/(\d+))?$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      return restRulesets(method, m[2], fields, p, qs, args);
    }

    m = /^repos\/([^/]+\/[^/]+)\/labels$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      return method === 'GET' ? restListLabels(p, qs) : unsupported(args);
    }

    // ── 47-02: repo meta and org-level capabilities ──

    m = /^repos\/([^/]+\/[^/]+)$/.exec(rawPath);
    if (m) {
      if (m[1] !== repo) return notFound();
      if (method === 'PATCH') return restPatchRepo(fields, args);
      if (method !== 'GET') return unsupported(args);
      return repoOk();
    }

    m = /^orgs\/([^/]+)\/(issue-types|issue-fields)$/.exec(rawPath);
    if (m) {
      if (method !== 'GET') return unsupported(args);
      // An org endpoint exists only for an Organization owner, and only for THIS repo's org.
      if (ownerType !== 'Organization' || m[1] !== repoOwner) return notFound();
      const rows = m[2] === 'issue-types' ? typeDefs : fieldDefs;
      return respondList(rows.map((r) => ({ ...r })), p, qs);
    }

    return unsupported(args);
  }

  // ─── Dispatcher ────────────────────────────────────────────────────────────

  function dispatch(args, opts) {
    if (args.length === 1 && args[0] === '--version') {
      return ok('gh version 2.50.0 (2026-01-01)\nhttps://github.com/cli/cli/releases/tag/v2.50.0');
    }
    if (args[0] === 'auth' && args[1] === 'status' && args.length === 2) {
      const list = scopes.map((s) => `'${s}'`).join(', ');
      return ok([
        'github.com',
        `  ✓ Logged in to github.com account ${viewer} (keyring)`,
        '  - Active account: true',
        '  - Git operations protocol: https',
        '  - Token: gho_************************************',
        `  - Token scopes: ${list}`,
      ].join('\n'));
    }
    if (args[0] === 'issue') return runIssue(args);
    if (args[0] === 'label') return runLabel(args);
    if (args[0] === 'api') return runApi(args, opts);
    return unsupported(args);
  }

  /** `opts.input` is the request body of `gh api --input -` (a JSON string). Only `args` are logged. */
  function runGh(args, opts = {}) {
    const argv = Array.isArray(args) ? args.map(String) : [];
    log.push(argv);
    stamps.push(typeof now === 'function' ? now() : null);
    // An outage beats everything else: nothing is served, nothing is mutated and a queued failNext waits.
    if (offline) return { ...OFFLINE_RESPONSE };
    const at = failures.findIndex((f) => f.test(argv));
    if (at >= 0) {
      const [{ response }] = failures.splice(at, 1);
      return { ...response };
    }
    return dispatch(argv, opts || {});
  }

  // ─── Test controls ─────────────────────────────────────────────────────────

  /** The next call matching `match` (function of argv | string | RegExp against argv.join(' ')) returns `response` once. */
  function failNext(match, response = {}) {
    failures.push({
      test: matcherFor(match),
      response: {
        ok: false, stdout: '', stderr: '', ...response,
        status: response.status !== undefined ? response.status : (response.ok ? 0 : 1),
      },
    });
  }

  /** A human edits the issue body on github.com: no DevFlow call is recorded, updatedAt advances. */
  function humanEditBody(number, body) {
    const issue = findIssue(number);
    if (!issue) throw new Error(`gh-fake: no issue #${number}`);
    issue.body = body;
    issue.updatedAt = tick();
  }

  /** While offline every call fails like a network outage (status null) until `setOffline(false)`. Calls are still logged. */
  function setOffline(value) {
    offline = Boolean(value);
  }

  /** A human edits a comment on github.com: no DevFlow call is recorded, the comment's updated_at advances. */
  function humanEditComment(id, body) {
    const c = comments.find((x) => x.id === Number(id));
    if (!c) throw new Error(`gh-fake: no comment #${id}`);
    c.body = body;
    c.updated_at = tick();
  }

  /**
   * A `git push` the test made to its temp remote: set (or advance) branch `name` to `sha`. No gh call is
   * recorded. A PR can only be opened from a ref that exists here, and only when it differs from the base tip.
   */
  function pushRef(name, sha) {
    if (typeof name !== 'string' || !name) throw new Error('gh-fake: pushRef needs a branch name');
    if (typeof sha !== 'string' || !sha) throw new Error('gh-fake: pushRef needs a sha');
    refs[name] = sha;
  }

  /**
   * A human clicks "merge" on github.com (or the merge queue lands the PR): the PR is merged and closed, a
   * queue entry is consumed, and, for a PR into the default branch, each `Closes #N` issue closes (subject to
   * `closeKeywordCap`). No DevFlow call is recorded. `method` is merge | squash | rebase, kept in `pr.mergeMethod`.
   */
  function humanMergePr(number, { method = 'merge' } = {}) {
    if (!MERGE_METHODS.includes(method)) throw new Error(`gh-fake: unknown merge method '${method}'`);
    const issue = findPr(number);
    if (!issue) throw new Error(`gh-fake: no pull request #${number}`);
    if (issue.pr.merged) throw new Error(`gh-fake: pull request #${number} is already merged`);
    if (issue.state !== 'OPEN') throw new Error(`gh-fake: pull request #${number} is closed; a human cannot merge it`);
    completeMerge(issue, method);
  }

  return {
    runGh,
    issues,
    comments,
    milestones,
    labels,
    refs,
    statuses,
    rulesets,
    files,
    prCommits,
    pushRef,
    humanMergePr,
    calls: () => log.map((a) => a.slice()),
    writes: () => log.filter((a) => isWriteArgs(a)).map((a) => a.slice()),
    writeTimes: () => log.flatMap((a, i) => (isWriteArgs(a) ? [stamps[i]] : [])),
    failNext,
    humanEditBody,
    humanEditComment,
    setOffline,
    get ownerType() { return ownerType; },
    get subIssuesApi() { return subIssuesApi; },
    seedIssue,
    seedComment,
    seedMilestone,
  };
}

module.exports = { createFakeGitHub };
