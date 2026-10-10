#!/usr/bin/env node
'use strict';

/**
 * ci-cloudflare-target: say, in a public CI log, which Cloudflare account a Pages deploy
 * targets (objective 74, TRD 74-02, OPS-03).
 *
 * Background. Every docs deploy from main failed with `Project not found [code: 8000007]`,
 * including for a project that exists. The likeliest cause is that the org secret
 * CLOUDFLARE_ACCOUNT_ID names a different account from the one the Pages project lives in,
 * or that CLOUDFLARE_API_TOKEN cannot see this one. A secret cannot be read back, so this
 * script asks the Cloudflare API instead, with the same two secrets the deploy uses:
 *
 *   GET /client/v4/accounts/{id}                 the configured account's name
 *   GET /client/v4/accounts?per_page=50          the accounts the token can see
 *   GET /client/v4/accounts/{id}/pages/projects  the account's Pages project names
 *
 * What it guarantees:
 *
 *   1. IT PRINTS NAMES, NEVER IDS. The repository is public, so its Actions logs are
 *      public. Ids are compared inside the process and never written; the other accounts
 *      the token can see are reported as a COUNT, not by name. Every line, and every error
 *      message the API or the network hands back, passes through `scrub`, which replaces
 *      the account id and token it was given and any 32-hex run (the shape of an account
 *      id) before anything reaches stdout or stderr.
 *
 *   2. IT IS A DIAGNOSTIC, NOT A GATE. Missing secrets (a fork's pull request has none),
 *      an API error and a dead network are each reported and exit 0. The deploy step is
 *      the gate. Only a usage error (no --project) exits 1.
 *
 *   3. IT IS READ-ONLY: three GET requests, no write.
 *
 * Usage:  node scripts/ci-cloudflare-target.cjs --project <pages-project-name>
 * Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment.
 */

const API_BASE = 'https://api.cloudflare.com';
const LINE_PREFIX = 'cloudflare target: ';
const REQUEST_TIMEOUT_MS = 15000;
// The Pages list is paginated; ask for a page big enough that one request normally holds
// every project, and say so when the API reports more than it returned.
const PROJECTS_PER_PAGE = 100;
const USAGE = 'usage: node scripts/ci-cloudflare-target.cjs --project <name>';

// ─── scrubbing ───────────────────────────────────────────────────────────────

/**
 * Remove anything that must not reach a public log. Each given secret becomes
 * `<redacted>` (longest first, so one secret containing another leaves no remnant), then
 * every run of 32 hex characters, the shape of a Cloudflare account id, becomes `<id>`.
 * Empty and non-string secrets are ignored.
 */
function scrub(text, secrets = []) {
  let cleaned = String(text);
  const known = secrets
    .filter((s) => typeof s === 'string' && s !== '')
    .sort((a, b) => b.length - a.length);
  for (const secret of known) cleaned = cleaned.split(secret).join('<redacted>');
  return cleaned.replace(/[0-9a-f]{32}/gi, '<id>');
}

// ─── the report (pure) ───────────────────────────────────────────────────────

/** A section that never got an answer: the fetch threw, or the body was not JSON. */
function unreachable(section) {
  return !section || typeof section.error === 'string';
}

function unreachableLine(section) {
  return `Cloudflare API unreachable: ${section && section.error ? section.error : 'no response'}`;
}

/** `code 10000 Authentication error`, for each error in a failed envelope. */
function failureText(envelope) {
  const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
  if (errors.length === 0) return 'code unknown';
  return errors
    .map((e) => [`code ${e && e.code !== undefined ? e.code : 'unknown'}`, e && e.message].filter(Boolean).join(' '))
    .join('; ');
}

/**
 * Turn the three API answers into the lines to print.
 *
 * Each of `account`, `accounts` and `projects` is a Cloudflare envelope
 * (`{ success, errors, result }`) or `{ error: <message> }` when the call itself failed.
 * `accountVisible` and `projectPresent` are true, false, or null when the answer could not
 * be had. Every returned line has been scrubbed.
 */
function summarizeTarget({ account, accounts, projects }, { accountId, project, token }) {
  const secrets = [accountId, token];
  const lines = [];
  const add = (line) => lines.push(scrub(line, secrets));

  // The configured account, by name.
  if (unreachable(account)) add(unreachableLine(account));
  else if (account.success !== true) add(`account: could not be read: ${failureText(account)}`);
  else add(`account: ${(account.result && account.result.name) || '(unnamed)'} (named by CLOUDFLARE_ACCOUNT_ID)`);

  // Is it among the accounts this token can see? Others are counted, never named.
  let accountVisible = null;
  if (unreachable(accounts)) {
    add(unreachableLine(accounts));
  } else if (accounts.success !== true) {
    add(`accounts the token can see could not be listed: ${failureText(accounts)}`);
  } else {
    const list = Array.isArray(accounts.result) ? accounts.result : [];
    accountVisible = list.some((a) => a && a.id === accountId);
    add(`other accounts the token can see: ${list.filter((a) => !(a && a.id === accountId)).length}`);
    if (!accountVisible) {
      add('the token cannot see the configured account: CLOUDFLARE_ACCOUNT_ID names an account outside this token\'s reach');
    }
  }
  if (accountVisible === null && !unreachable(account) && account.success === true) accountVisible = true;

  // The Pages projects, and whether the one we deploy to is among them.
  let projectPresent = null;
  if (unreachable(projects)) {
    add(unreachableLine(projects));
  } else if (projects.success !== true) {
    add(`Pages projects could not be listed: ${failureText(projects)}`);
  } else {
    const names = (Array.isArray(projects.result) ? projects.result : []).map((p) => p && p.name).filter(Boolean);
    const info = projects.result_info;
    const total = info && Number.isFinite(info.total_count) ? info.total_count : names.length;
    const partial = total > names.length;
    add(`Pages projects in this account (${names.length}${partial ? ` of ${total}` : ''}): ${names.join(', ') || 'none'}`);
    if (partial) add(`listing is partial: ${names.length} of ${total}`);
    if (names.includes(project)) {
      projectPresent = true;
      add(`${project}: present`);
    } else if (partial) {
      add(`${project}: not in the ${names.length} project(s) listed`);
    } else {
      projectPresent = false;
      add(`${project}: ABSENT in this account`);
      add(`to create it: Cloudflare dashboard > Workers & Pages > Create > Pages > Direct upload; project name ${project}, production branch main`);
    }
  }

  return { lines: [...new Set(lines)], accountVisible, projectPresent };
}

// ─── the API ─────────────────────────────────────────────────────────────────

/** One GET. Resolves to the parsed envelope, or `{ error }`; it never rejects. */
async function get(fetchImpl, pathAndQuery, token) {
  try {
    const res = await fetchImpl(`${API_BASE}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body;
    try {
      body = await res.json();
    } catch {
      return { error: `HTTP ${res.status}, response was not JSON` };
    }
    if (body === null || typeof body !== 'object') return { error: `HTTP ${res.status}, unexpected response` };
    return body;
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

/** `--project <name>` or `--project=<name>`; null when absent, empty or mixed with other arguments. */
function parseProject(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i];
    } else if (arg.startsWith('--project=')) {
      project = arg.slice('--project='.length);
    } else {
      return null;
    }
  }
  return project ? project : null;
}

/**
 * Run the report. Resolves to the exit code: 0 for every outcome of the check itself, 1
 * for a usage error only. `io` injects `env`, `fetch`, `out` and `err` so a test needs no
 * network, no process environment and no console.
 */
async function main(argv = process.argv.slice(2), io = {}) {
  const env = io.env || process.env;
  const fetchImpl = io.fetch || globalThis.fetch;
  const out = io.out || ((line) => console.log(line));
  const err = io.err || ((line) => console.error(line));

  const project = parseProject(argv);
  if (!project) {
    err(USAGE);
    return 1;
  }

  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const say = (line) => out(`${LINE_PREFIX}${scrub(line, [accountId, token])}`);

  if (!token || !accountId) {
    say('Cloudflare secrets are not available to this run (a fork\'s pull request, or unset): nothing to check');
    return 0;
  }

  say(`checking the deploy target for Pages project ${project}`);
  const account = `/client/v4/accounts/${encodeURIComponent(accountId)}`;
  const [accountAnswer, accountsAnswer, projectsAnswer] = await Promise.all([
    get(fetchImpl, account, token),
    get(fetchImpl, '/client/v4/accounts?per_page=50', token),
    get(fetchImpl, `${account}/pages/projects?per_page=${PROJECTS_PER_PAGE}`, token),
  ]);

  const report = summarizeTarget(
    { account: accountAnswer, accounts: accountsAnswer, projects: projectsAnswer },
    { accountId, project, token }
  );
  for (const line of report.lines) say(line);
  return 0;
}

module.exports = { scrub, summarizeTarget, main };

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      // A diagnostic never fails the job; the deploy step is the gate.
      console.error(`${LINE_PREFIX}${scrub(e && e.message ? e.message : e, [process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN])}`);
      process.exitCode = 0;
    }
  );
}
