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
//   issue   { number, title, body, labels:[name], milestone:title|null, assignees:[login],
//             state:'OPEN'|'CLOSED', createdAt, updatedAt }
//   comment { id, issue_number, body, user:{login}, created_at, updated_at, html_url }
// `--json` output converts to gh's shape (labels -> [{name}], milestone -> {number,title}).
// `updatedAt` comes from an internal counter clock that advances 1 s per mutation, so it is an ISO
// string that strictly increases and never depends on wall time.

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
const API_VALUE_FLAGS = ['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--jq', '-q'];
const API_BOOL_FLAGS = ['--paginate', '--slurp'];

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
 * @returns {{runGh:Function, issues:object[], comments:object[], milestones:object[], labels:string[],
 *   calls:()=>string[][], writes:()=>string[][], failNext:Function, humanEditBody:Function,
 *   seedIssue:Function, seedComment:Function, seedMilestone:Function}}
 */
function createFakeGitHub({ repo = 'o/r', scopes = ['repo', 'project', 'read:project'], commentPageSize = 30, graphql = null } = {}) {
  const issues = [];
  const comments = [];
  const milestones = []; // { number, title, description, state }
  const labels = [];     // names
  const log = [];        // every argv runGh saw, in order
  const failures = [];   // { test, response }
  let clock = 0;
  let nextIssue = 1;
  let nextMilestone = 1;
  let nextComment = 1000;

  const tick = () => new Date(BASE_TIME + (++clock) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const issueUrl = (n) => `https://github.com/${repo}/issues/${n}`;

  // ─── Store helpers (also the test-facing seeding API) ─────────────────────

  function ensureLabel(name) {
    if (!labels.includes(name)) labels.push(name);
  }

  function addMilestone(title, description = '') {
    const m = { number: nextMilestone++, title, description, state: 'open' };
    milestones.push(m);
    return m;
  }

  function addIssue({ title, body = '', labels: labelNames = [], milestone = null, state = 'OPEN', assignees = [] }) {
    for (const l of labelNames) ensureLabel(l);
    const at = tick();
    const issue = {
      number: nextIssue++, title, body, labels: [...labelNames], milestone, assignees: [...assignees],
      state, createdAt: at, updatedAt: at,
    };
    issues.push(issue);
    return issue;
  }

  function addComment(issueNumber, body) {
    const at = tick();
    const id = nextComment++;
    const c = {
      id, issue_number: issueNumber, body, user: { login: 'devflow-bot' }, created_at: at, updated_at: at,
      html_url: `${issueUrl(issueNumber)}#issuecomment-${id}`,
    };
    comments.push(c);
    return c;
  }

  const findIssue = (n) => issues.find((i) => i.number === Number(n));

  function seedIssue(spec) {
    return addIssue(spec).number;
  }
  function seedComment(issueNumber, body) {
    return addComment(issueNumber, body).id;
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
      issue.updatedAt = tick();
      return ok(`✓ Closed issue ${repo}#${issue.number} (${issue.title})`);
    }

    // reopen
    issue.state = 'OPEN';
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

  function runApi(args) {
    const p = parseArgs(args, 1, API_VALUE_FLAGS, API_BOOL_FLAGS);
    if (p.unknown.length || p.pos.length !== 1) return unsupported(args);
    // `api graphql` is answered by the caller's handler (46-07): graphql(argv) -> stdout string | full
    // result object | null (unsupported). Without a handler GraphQL stays unsupported.
    if (p.pos[0] === 'graphql') {
      const out = typeof graphql === 'function' ? graphql(args) : null;
      if (out === null || out === undefined) return unsupported(args);
      return typeof out === 'string' ? ok(out) : out;
    }
    const fields = fieldMap(p);
    const explicit = flagOne(p, '-X') || flagOne(p, '--method');
    const method = (explicit || (Object.keys(fields).length ? 'POST' : 'GET')).toUpperCase();

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
        const made = addMilestone(title, fields.description || '');
        return ok(JSON.stringify(made));
      }
      if (method === 'GET') {
        const state = qs.get('state') || 'open';
        const rows = milestones.filter((x) => state === 'all' || x.state === state).map((x) => ({ ...x }));
        return respondList(rows, p, qs);
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

    return unsupported(args);
  }

  // ─── Dispatcher ────────────────────────────────────────────────────────────

  function dispatch(args) {
    if (args.length === 1 && args[0] === '--version') {
      return ok('gh version 2.50.0 (2026-01-01)\nhttps://github.com/cli/cli/releases/tag/v2.50.0');
    }
    if (args[0] === 'auth' && args[1] === 'status' && args.length === 2) {
      const list = scopes.map((s) => `'${s}'`).join(', ');
      return ok([
        'github.com',
        '  ✓ Logged in to github.com account devflow-bot (keyring)',
        '  - Active account: true',
        '  - Git operations protocol: https',
        '  - Token: gho_************************************',
        `  - Token scopes: ${list}`,
      ].join('\n'));
    }
    if (args[0] === 'issue') return runIssue(args);
    if (args[0] === 'label') return runLabel(args);
    if (args[0] === 'api') return runApi(args);
    return unsupported(args);
  }

  function runGh(args) {
    const argv = Array.isArray(args) ? args.map(String) : [];
    log.push(argv);
    const at = failures.findIndex((f) => f.test(argv));
    if (at >= 0) {
      const [{ response }] = failures.splice(at, 1);
      return { ...response };
    }
    return dispatch(argv);
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

  return {
    runGh,
    issues,
    comments,
    milestones,
    labels,
    calls: () => log.map((a) => a.slice()),
    writes: () => log.filter((a) => isWriteArgs(a)).map((a) => a.slice()),
    failNext,
    humanEditBody,
    seedIssue,
    seedComment,
    seedMilestone,
  };
}

module.exports = { createFakeGitHub };
