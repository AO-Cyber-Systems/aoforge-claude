'use strict';

/**
 * gh-check-cli.cjs — the check runner the Actions workflow runs (objective 50, GEN-05, IO half).
 *
 *   node gh-check-cli.cjs linked-issue
 *
 * It reads the event (`GITHUB_EVENT_PATH`), fetches what the pure checks in gh-check.cjs need through
 * gh-client, and posts the verdict as a COMMIT STATUS with the exact required context. This settles research
 * Open Question 2 on the DevFlow side: a ruleset's required-status rule matches a status context by name,
 * whatever the job or workflow is called, so nesting through `workflow_call` (`<caller job> / <called job>`)
 * cannot break the match the way it can for a check run named after a job. The job also exits non-zero on a
 * failure, for visibility.
 *
 * Environment (all from the Actions runner; `gh` is preinstalled there and authenticates from `GH_TOKEN`,
 * which token is the workflow's choice, see 50-10):
 *   GITHUB_EVENT_PATH   the event payload (required)
 *   GITHUB_EVENT_NAME   pull_request | pull_request_target | merge_group; inferred from the payload when unset
 *   GITHUB_REPOSITORY   `owner/repo`; the payload's repository.full_name when unset
 *   GITHUB_SERVER_URL, GITHUB_RUN_ID   together with the repository they form the status `target_url`
 *
 * Events:
 *   pull_request (not closed)  the PR is the payload's, the status goes on `pull_request.head.sha`.
 *   merge_group                the PR number comes from `merge_group.head_ref` (prNumberFromQueueRef), the PR is
 *                              read with `GET pulls/{n}`, the status goes on `merge_group.head_sha`. Under the
 *                              SAME context, so one required rule covers the PR and the queue.
 *   pull_request closed        the checks exit 0 without posting; nothing is left to gate.
 *   anything else              exit 0 with a notice.
 *
 * Result of `main({argv, env})`: `{ code, state, description, details }` with `state` one of success | failure |
 * error (a status was decided or attempted) or skipped (nothing to do). Exit codes: 0 success or skipped, 1
 * failure or error. An internal error (a gh call that failed, an unreadable event, anything thrown) posts state
 * `error` with the message on the head sha, best effort, and exits 1: a required check must never hang
 * waiting for a context that never comes, and the runner never throws.
 *
 * Not here on purpose: `requireEnabled(cwd)` (there is no DevFlow config on the runner's cwd) and any read of the
 * caller's checkout (in store mode `.planning/` is not in git; the head's config is read through the contents API).
 * Every GitHub call goes through gh-client, so the gh-seam repo test guards this file.
 */

const fs = require('fs');
const client = require('./gh-client.cjs');
const check = require('./gh-check.cjs');

const { CONTEXTS } = check;

// GitHub's commit-status description limit.
const DESCRIPTION_MAX = 140;

const USAGE = 'usage: gh-check-cli.cjs <linked-issue>';

// ─── Small helpers ───────────────────────────────────────────────────────────

function clip(text, max) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 3))}...`;
}

const result = (code, state, description, details = []) => ({ code, state, description, details });
const skipped = (description) => result(0, 'skipped', description);

function failureText(r) {
  return `${r.error || ''}\n${r.stderr || ''}\n${r.stdout || ''}`;
}

/** The first non-empty line of what a failed gh call said. */
function why(r) {
  const line = failureText(r).split('\n').map((l) => l.trim()).find(Boolean);
  return line || 'gh failed';
}

const isNotFound = (r) => /\b404\b|not found/i.test(failureText(r));

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET one REST resource. -> {json} | {missing:true} (404); anything else is thrown. */
function getJson(apiPath, what) {
  const r = client.ghRead(['api', apiPath]);
  if (!r.ok) {
    if (isNotFound(r)) return { missing: true };
    throw new Error(`could not ${what}: ${why(r)}`);
  }
  const json = parseJson(r.stdout);
  if (json === null || typeof json !== 'object') throw new Error(`could not ${what}: unparseable response`);
  return { json };
}

// ─── The event ───────────────────────────────────────────────────────────────

function readEvent(env) {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is not set: this runs inside GitHub Actions');
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  } catch (e) {
    throw new Error(`cannot read the event at ${eventPath}: ${e.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`the event at ${eventPath} is not a JSON object`);
  return payload;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PR_EVENTS = new Set(['pull_request', 'pull_request_target']);

/** 'pull_request' | 'merge_group' | null (anything else). The event name wins; the payload shape is the fallback. */
function eventKind(env, payload) {
  const name = env.GITHUB_EVENT_NAME;
  if (name) {
    if (name === 'merge_group') return isObject(payload.merge_group) ? 'merge_group' : null;
    if (PR_EVENTS.has(name)) return isObject(payload.pull_request) ? 'pull_request' : null;
    return null;
  }
  if (isObject(payload.merge_group)) return 'merge_group';
  if (isObject(payload.pull_request)) return 'pull_request';
  return null;
}

// ─── Posting ─────────────────────────────────────────────────────────────────

/** `owner/repo` -> the Actions run page, or null when the run id (or repository) is unknown. */
function targetUrl(repo, env) {
  const server = env.GITHUB_SERVER_URL;
  const run = env.GITHUB_RUN_ID;
  return server && run && repo ? `${server}/${repo}/actions/runs/${run}` : null;
}

/** POST one commit status on `ctx.sha` under `ctx.context`. Thrown on failure. */
function postStatus(ctx, state, description) {
  const body = { state, context: ctx.context, description: clip(description, DESCRIPTION_MAX) };
  const url = targetUrl(ctx.repo, ctx.env);
  if (url) body.target_url = url;
  const r = client.ghWrite(['api', '--method', 'POST', `repos/${ctx.repo}/statuses/${ctx.sha}`, '--input', '-'], {
    input: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`could not post ${ctx.context} on ${String(ctx.sha).slice(0, 7)}: ${why(r)}`);
}

/** Post the verdict of a pure check and turn it into the runner's result. */
function publish(ctx, verdict) {
  postStatus(ctx, verdict.state, verdict.description);
  return result(verdict.state === 'success' ? 0 : 1, verdict.state, verdict.description, verdict.details || []);
}

/** Anything that went wrong: best-effort `error` status (when a status is owed and the sha is known), exit 1. */
function failed(ctx, e) {
  const message = (e && e.message) || String(e);
  if (ctx.context && ctx.repo && ctx.sha) {
    try {
      postStatus(ctx, 'error', message);
    } catch {
      // best effort: the exit code still reports the failure
    }
  }
  return result(1, 'error', clip(message, DESCRIPTION_MAX), [message]);
}

// ─── Reading what the checks need ────────────────────────────────────────────

/** Map<number, issue|null> of the given issue numbers: null is a 404, a PR comes back with `pull_request`. */
function fetchIssues(repo, numbers) {
  const issues = new Map();
  for (const n of numbers) {
    const got = getJson(`repos/${repo}/issues/${n}`, `read #${n}`);
    issues.set(n, got.missing ? null : got.json);
  }
  return issues;
}

/** The PR's commits (REST shape). A 404 is no commits: they only add notes, never a verdict. */
function fetchCommits(repo, prNumber) {
  const r = client.ghPaginate(`repos/${repo}/pulls/${prNumber}/commits`);
  if (r.ok) return r.items;
  if (isNotFound(r)) return [];
  throw new Error(`could not read the commits of #${prNumber}: ${why(r)}`);
}

/** The event's default branch, or `GET repos/{repo}` when it carries none. */
function defaultBranchOf(repo, payload) {
  const fromEvent = isObject(payload.repository) ? payload.repository.default_branch : null;
  if (typeof fromEvent === 'string' && fromEvent !== '') return fromEvent;
  const got = getJson(`repos/${repo}`, `read ${repo}`);
  if (got.missing || typeof got.json.default_branch !== 'string') throw new Error(`could not tell the default branch of ${repo}`);
  return got.json.default_branch;
}

/**
 * Which pull request, at which sha, a status check judges. Fills `ctx.repo` and `ctx.sha` as soon as they are
 * known so an error later on still lands on the right commit.
 * -> {skip: reason} | {pr, defaultBranch, headSha}
 */
function resolveTarget(ctx) {
  const payload = readEvent(ctx.env);
  const kind = eventKind(ctx.env, payload);
  if (kind === null) {
    const name = ctx.env.GITHUB_EVENT_NAME || 'this';
    return { skip: `${name} event is not a pull_request or merge_group event: nothing to check` };
  }
  ctx.repo = ctx.env.GITHUB_REPOSITORY || (isObject(payload.repository) ? payload.repository.full_name : null);
  if (!ctx.repo) throw new Error('cannot tell the repository: GITHUB_REPOSITORY is not set and the event names none');

  if (kind === 'pull_request') {
    const pr = payload.pull_request;
    if (payload.action === 'closed') return { skip: 'pull request closed: nothing to check' };
    if (!isObject(pr.head) || typeof pr.head.sha !== 'string' || pr.head.sha === '') throw new Error('the pull_request event has no head sha');
    ctx.sha = pr.head.sha;
    return { pr, headSha: pr.head.sha, defaultBranch: defaultBranchOf(ctx.repo, payload) };
  }

  const group = payload.merge_group;
  if (typeof group.head_sha !== 'string' || group.head_sha === '') throw new Error('the merge_group event has no head sha');
  ctx.sha = group.head_sha;
  const n = check.prNumberFromQueueRef(group.head_ref);
  if (n === null) throw new Error(`merge queue ref ${group.head_ref} names no pull request`);
  const got = getJson(`repos/${ctx.repo}/pulls/${n}`, `read pull request #${n}`);
  if (got.missing) throw new Error(`pull request #${n} named by the merge queue was not found`);
  const pr = got.json;
  return {
    pr,
    headSha: isObject(pr.head) && typeof pr.head.sha === 'string' ? pr.head.sha : group.head_sha,
    defaultBranch: defaultBranchOf(ctx.repo, payload),
  };
}

// ─── The checks ──────────────────────────────────────────────────────────────

function runLinkedIssue(ctx) {
  const target = resolveTarget(ctx);
  if (target.skip) return skipped(target.skip);
  const { pr, defaultBranch } = target;
  const { counted } = check.parseClosingRefs(pr.body, ctx.repo);
  const issues = fetchIssues(ctx.repo, counted);
  const commits = fetchCommits(ctx.repo, pr.number);
  return publish(ctx, check.linkedIssue({ pr, repo: ctx.repo, defaultBranch, issues, commits }));
}

const CHECKS = {
  'linked-issue': { context: CONTEXTS.linkedIssue, run: runLinkedIssue },
};

// ─── Entry ───────────────────────────────────────────────────────────────────

/**
 * main({argv, env}) — run one check. Never throws; see the header for the result shape and exit codes.
 */
function main({ argv = [], env = process.env } = {}) {
  const name = argv[0];
  const spec = Object.hasOwn(CHECKS, name || '') ? CHECKS[name] : null;
  if (!spec) return result(1, 'error', `${USAGE}${name ? ` (unknown check ${JSON.stringify(name)})` : ''}`);
  const ctx = { env, name, context: spec.context, repo: null, sha: null };
  try {
    return spec.run(ctx);
  } catch (e) {
    return failed(ctx, e);
  }
}

if (require.main === module) {
  const r = main({ argv: process.argv.slice(2), env: process.env });
  const out = r.code === 0 ? process.stdout : process.stderr;
  out.write(`${r.state}: ${r.description}\n`);
  for (const line of r.details) out.write(`  ${line}\n`);
  process.exit(r.code);
}

module.exports = { main, CHECKS: Object.keys(CHECKS) };
