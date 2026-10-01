'use strict';

// gh-capability.cjs (TRD 47-06) — GST-08 (automatic degraded mode) and the type/field half of GST-01.
//
// One probe learns what the target repo supports; one pure function turns that into the store's
// operating modes. Nothing here writes to GitHub: every call is a `ghRead`, and the only git is the
// wiki probe, which stays behind gh-wiki's seam.
//
//   const caps = detectCapabilities(cwd, { probeIssue })   // {ok:true, repo, owner_type, push, ...}
//   const modes = resolveModes(caps)                      // {types, fields, hierarchy, pages, writable, ...}
//   describeDegraded(caps)                                // one sentence per capability that fell back
//
// A 403 or 404 on any single capability probe degrades that capability and never fails detection. Only
// the repository read itself is fatal (a push to a repository we cannot see cannot work).
//
// Degraded modes (what each fallback is, so 47-07/47-09 know what to write):
//   types      native -> a `devflow:type/<name>` label plus a body meta line, per type
//   fields     native -> a managed `meta` body section (`work: feature`, `kind: plugin`)
//   hierarchy  native -> a managed task list `- [ ] #N` in the objective body
//   pages      wiki   -> docs/devflow/<Page>.md in the working tree (only when the wiki is DISABLED);
//                        a wiki that exists but is uninitialised or unreachable is `blocked`, never `docs`

const fs = require('fs');
const path = require('path');
const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const ghProject = require('./gh-project.cjs');
const { atomicWrite } = require('./sync-state.cjs');

const REQUIRED_TYPES = Object.freeze(['Objective', 'TRD', 'Decision']);
const REQUIRED_FIELDS = Object.freeze(['work', 'kind']);

/**
 * D-07 (LOW confidence): where the org's issue-field DEFINITIONS are listed. This is the only place the
 * path appears, and `listFieldDefinitions` is the only reader. A wrong path degrades to `fields:'meta'`
 * rather than failing; a human can confirm the real path later with one `gh api` call and change this line.
 */
const ISSUE_FIELDS_PATH = 'orgs/{owner}/issue-fields';

// ─── Classifying a gh read ────────────────────────────────────────────────────

const OFFLINE_RE = /could not resolve host|connection refused|timed out|network is unreachable|dial tcp/i;
const RATE_LIMIT_RE = /rate limit/i;

function textOf(r) {
  return `${(r && r.stderr) || ''}\n${(r && r.stdout) || ''}`;
}

/** The HTTP status `gh api` prints on failure (`gh: Not Found (HTTP 404)`), or null. */
function httpStatus(r) {
  const m = /HTTP (\d{3})/.exec(textOf(r));
  return m ? Number(m[1]) : null;
}

/**
 * `ok`        2xx.
 * `offline`   no answer at all (no status, or a network error): says nothing about the capability.
 * `absent`    a definitive 403/404/410: the capability is not there for us.
 * `transient` anything else (5xx, a rate limit, a 2xx we could not parse): degrade for now, but the
 *             answer is not worth remembering.
 */
function classify(r) {
  if (r && r.ok) return 'ok';
  if (!r || r.status === null || r.status === undefined || OFFLINE_RE.test(textOf(r))) return 'offline';
  if (RATE_LIMIT_RE.test(textOf(r))) return 'transient';
  const code = httpStatus(r);
  if (code === 403 || code === 404 || code === 410) return 'absent';
  return 'transient';
}

/** `gh api <path>` parsed as JSON. `{kind, r, json?, unparseable?}`; an unparseable 2xx is `transient`. */
function readJson(apiPath) {
  const r = client.ghRead(['api', apiPath]);
  const kind = classify(r);
  if (kind !== 'ok') return { kind, r };
  try {
    return { kind: 'ok', r, json: JSON.parse(r.stdout) };
  } catch {
    return { kind: 'transient', r, unparseable: true };
  }
}

// ─── Probes ───────────────────────────────────────────────────────────────────

/** The repository read. Fatal on any failure; offline is flagged so a caller can fall back to a cache. */
function readRepo(repo) {
  const res = readJson(`repos/${repo}`);
  if (res.kind === 'ok') {
    const j = res.json;
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      return { ok: false, error: `repository ${repo}: unparseable answer from gh` };
    }
    return { ok: true, data: j };
  }
  if (res.unparseable) return { ok: false, error: `repository ${repo}: unparseable answer from gh` };
  if (res.kind === 'absent' && httpStatus(res.r) === 404) {
    return { ok: false, error: `repository ${repo} not found or not accessible` };
  }
  const error = textOf(res.r).trim() || `gh api repos/${repo} failed`;
  return { ok: false, error, offline: res.kind === 'offline' };
}

/** Org issue types: `{available, enabled}` where `enabled` is the REQUIRED_TYPES that exist and are enabled. */
function probeOrgTypes(owner) {
  const res = readJson(`orgs/${owner}/issue-types`);
  if (res.kind !== 'ok' || !Array.isArray(res.json)) {
    return { value: { available: false, enabled: [] }, transient: res.kind !== 'absent', offline: res.kind === 'offline' };
  }
  const enabled = REQUIRED_TYPES.filter((name) => res.json.some((t) => t && t.name === name && t.is_enabled !== false));
  return { value: { available: true, enabled }, transient: false, offline: false };
}

/**
 * D-07: the org's issue-field definitions, matched case-insensitively against REQUIRED_FIELDS. Any
 * non-2xx or unparseable answer, and any missing required field, means `available:false`.
 * `{value:{available, ids, missing?}, transient, offline}`; `transient` marks an answer not worth caching,
 * `offline` that there was no answer at all.
 */
function readFieldDefinitions(owner) {
  const res = readJson(ISSUE_FIELDS_PATH.replace('{owner}', owner));
  if (res.kind !== 'ok' || !Array.isArray(res.json)) {
    return { value: { available: false, ids: {} }, transient: res.kind !== 'absent', offline: res.kind === 'offline' };
  }
  const ids = {};
  for (const name of REQUIRED_FIELDS) {
    const def = res.json.find((f) => f && typeof f.name === 'string' && f.name.toLowerCase() === name);
    if (def && def.id !== undefined && def.id !== null) ids[name] = def.id;
  }
  const missing = REQUIRED_FIELDS.filter((name) => !(name in ids));
  const value = missing.length === 0 ? { available: true, ids } : { available: false, ids, missing };
  return { value, transient: false, offline: false };
}

/** The org's issue-field definitions: `{available, ids, missing?}`. Never throws. */
function listFieldDefinitions(owner) {
  return readFieldDefinitions(owner).value;
}

/**
 * Sub-issues and blocked-by on a KNOWN issue. A 404 is ambiguous (no such endpoint, or no such issue), so
 * a 404 is only believed after the issue itself reads back; otherwise the answer is `unknown`.
 * `{sub_issues, dependencies, transient, offline}`.
 */
function probeIssueApis(repo, number) {
  let existence = null;
  let offline = false;
  const issueExists = () => {
    if (existence === null) {
      const k = classify(client.ghRead(['api', `repos/${repo}/issues/${number}`]));
      if (k === 'offline') offline = true;
      existence = k === 'ok' ? 'yes' : (k === 'absent' ? 'no' : 'unknown');
    }
    return existence === 'yes';
  };
  let transient = false;
  const one = (tail) => {
    const r = client.ghRead(['api', `repos/${repo}/issues/${number}/${tail}?per_page=1`]);
    const kind = classify(r);
    if (kind === 'ok') return 'ok';
    if (kind === 'absent' && (httpStatus(r) !== 404 || issueExists())) return 'absent';
    if (kind === 'offline') offline = true;
    transient = true;
    return 'unknown';
  };
  const sub = one('sub_issues');
  const deps = one('dependencies/blocked_by');
  return { sub_issues: sub, dependencies: deps, transient, offline };
}

/** `disabled` (has_wiki false), `ok`, `uninitialised` or `unavailable`, via gh-wiki's git seam. */
function probeWiki(cwd, env, hasWiki) {
  if (hasWiki === false) return { state: 'disabled', detail: null, offline: false };
  const p = wiki.probeRemote(wiki.resolveWikiRemote(cwd, { env }), { cwd });
  if (p.state === 'ok') return { state: 'ok', detail: null, offline: false };
  return { state: p.state, detail: p.stderr || p.error || null, offline: Boolean(p.offline) };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/** The injectable clock: a number (ms), a Date, a function returning either, or nothing (real time). */
function nowMs(now) {
  const v = typeof now === 'function' ? now() : now;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return Date.now();
}

function parseProbeIssue(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const WIKI_BLOCKED = new Set(['uninitialised', 'unavailable']);

/** True when a failing wiki is something the user fixes out of band, so the answer must not be remembered. */
function isBlockedWiki(state) {
  return WIKI_BLOCKED.has(state);
}

// ─── The cache ────────────────────────────────────────────────────────────────

/**
 * D-22: `<gh cache dir>/capabilities/<owner>__<repo>.json`. The directory is gh-project's (override
 * `DEVFLOW_GH_CACHE_DIR`, default `~/.claude/devflow/state/gh-project`), so this never lands in the repo.
 * Every character outside `[A-Za-z0-9_.-]` becomes `_`, so a slug cannot leave the directory.
 */
function cachePath(repo, env = process.env) {
  const name = String(repo).split('/').map((seg) => seg.replace(/[^A-Za-z0-9_.-]/g, '_')).join('__');
  return path.join(ghProject.cacheDir(env), 'capabilities', `${name}.json`);
}

/** A record we wrote and can still serve: right repo, a real timestamp and every field `resolveModes` reads. */
function isUsableRecord(repo, r) {
  return Boolean(r) && typeof r === 'object' && !Array.isArray(r)
    && r.repo === repo
    && typeof r.checked_at === 'string' && !Number.isNaN(Date.parse(r.checked_at))
    && typeof r.owner_type === 'string' && typeof r.push === 'boolean'
    && r.org_types && typeof r.org_types === 'object'
    && r.issue_fields && typeof r.issue_fields === 'object'
    && typeof r.wiki === 'string';
}

/** The cached record for `repo`, or null (missing, corrupt, another repo's, malformed). The TTL is NOT applied here. */
function readCachedCapabilities(repo, env = process.env) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath(repo, env), 'utf-8'));
  } catch {
    return null;
  }
  return isUsableRecord(repo, parsed) ? parsed : null;
}

/** Best effort: a cache that cannot be written costs one extra probe next time, never a failed detection. */
function writeCache(repo, env, record) {
  try {
    atomicWrite(cachePath(repo, env), `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // intentionally ignored
  }
}

/** Delete the cached answer for `repo`. `{ok:true, removed}`; only an unexpected fs error is `ok:false`. */
function invalidate(repo, env = process.env) {
  try {
    fs.unlinkSync(cachePath(repo, env));
    return { ok: true, removed: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, removed: false };
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/** `github.project_cache_ttl_minutes`, falling back to gh-project's default for anything that is not a number >= 0. */
function ttlMinutes(cwd) {
  const cfg = client.readConfig(cwd);
  const v = cfg && cfg.github && cfg.github.project_cache_ttl_minutes;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : ghProject.DEFAULT_TTL_MINUTES;
}

function isFresh(record, now, ttl) {
  const age = now - Date.parse(record.checked_at);
  return age >= 0 && age < ttl * 60 * 1000;
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * The probes themselves. `{ok:true, record}`, `{ok:false, error}`, or `{ok:false, offline:true}` when any
 * probe got no answer at all (a half-probed repo says nothing reliable about its capabilities).
 */
function probeLive(cwd, repo, env, probeIssue, now) {
  const meta = readRepo(repo);
  if (!meta.ok) return meta.offline ? { ok: false, offline: true } : { ok: false, error: meta.error };
  const data = meta.data;

  const owner = repo.split('/')[0];
  const ownerType = data.owner && typeof data.owner.type === 'string' ? data.owner.type : 'unknown';
  const push = Boolean(data.permissions && data.permissions.push);
  let final = true;

  let orgTypes = { available: false, enabled: [] };
  let issueFields = { available: false, ids: {} };
  if (ownerType === 'Organization') {
    const t = probeOrgTypes(owner);
    if (t.offline) return { ok: false, offline: true };
    orgTypes = t.value;
    if (t.transient) final = false;
    const f = readFieldDefinitions(owner);
    if (f.offline) return { ok: false, offline: true };
    issueFields = f.value;
    if (f.transient) final = false;
  }

  let subIssues = 'unknown';
  let dependencies = 'unknown';
  if (probeIssue !== null) {
    const p = probeIssueApis(repo, probeIssue);
    if (p.offline) return { ok: false, offline: true };
    subIssues = p.sub_issues;
    dependencies = p.dependencies;
    if (p.transient) final = false;
  } else {
    final = false;
  }

  const w = probeWiki(cwd, env, data.has_wiki);
  if (w.offline) return { ok: false, offline: true };
  if (isBlockedWiki(w.state)) final = false;
  if (!push) final = false;

  const record = {
    repo,
    owner_type: ownerType,
    push,
    private: Boolean(data.private),
    org_types: orgTypes,
    issue_fields: issueFields,
    sub_issues: subIssues,
    dependencies,
    wiki: w.state,
    wiki_detail: w.detail,
    checked_at: new Date(now).toISOString(),
    stale: false,
    provisional: false,
    final,
  };
  record.degraded = degradedOf(record);
  return { ok: true, record };
}

/**
 * The answer when GitHub cannot be reached. A cache (of any age) is returned as it was written, flagged
 * `stale`; with none, the defaults are `provisional`: every capability native, which the flusher
 * re-detects before it executes anything. Neither is ever written to disk.
 */
function offlineAnswer(repo, env, now) {
  const cached = readCachedCapabilities(repo, env);
  if (cached) {
    const record = { ...cached, stale: true, provisional: false, final: false };
    record.degraded = degradedOf(record);
    return { ok: true, ...record, offline: true, cached: true };
  }
  const record = {
    repo,
    owner_type: 'unknown',
    push: true,
    private: false,
    org_types: { available: true, enabled: [...REQUIRED_TYPES] },
    issue_fields: { available: true, ids: {} },
    sub_issues: 'unknown',
    dependencies: 'unknown',
    wiki: 'unknown',
    wiki_detail: null,
    checked_at: new Date(now).toISOString(),
    stale: false,
    provisional: true,
    final: false,
    degraded: [],
  };
  return { ok: true, ...record, offline: true, cached: false };
}

/**
 * Probe the repo once and describe what it supports. The answer is cached per repo for
 * `github.project_cache_ttl_minutes` (default 360); `refresh:true` bypasses the cache.
 *
 * @param {string} cwd project root (the repo comes from `client.resolveRepo(cwd)`)
 * @param {{probeIssue?:number|string, refresh?:boolean, now?:number|Date|(()=>number), env?:object}} [opts]
 *   `probeIssue` an issue that is known to exist (the objective issue); sub-issues and dependencies are
 *   only probed against it. Without one they are `unknown` (treated as native) and the answer is not final.
 *   `now` is the clock (ms, Date or a function); `env` replaces `process.env` for the cache and wiki lookups.
 * @returns {{ok:true, repo:string, owner_type:string, push:boolean, private:boolean,
 *   org_types:{available:boolean, enabled:string[]}, issue_fields:{available:boolean, ids:object, missing?:string[]},
 *   sub_issues:'ok'|'absent'|'unknown', dependencies:'ok'|'absent'|'unknown',
 *   wiki:'ok'|'disabled'|'uninitialised'|'unavailable'|'unknown', wiki_detail:string|null,
 *   checked_at:string, stale:boolean, provisional:boolean, final:boolean, degraded:string[],
 *   cached:boolean, offline?:true}
 *   | {ok:false, error:string}}
 *   `final` is true only for an answer worth remembering: every probe gave a definitive answer, the repo
 *   is writable and the wiki is not blocked on a step the user has yet to take; only those are cached.
 *   `cached` is true when the answer came from disk. `offline` is set (with `stale` or `provisional`) when
 *   GitHub could not be reached. A missing or inaccessible repository is `ok:false`, never offline.
 */
function detectCapabilities(cwd, opts = {}) {
  const env = opts.env || process.env;
  const repo = client.resolveRepo(cwd);
  if (!repo) {
    return {
      ok: false,
      error: 'github.repo is not set (need an owner/name in .planning/config.json github.repo or PROJECT.md github_repo)',
    };
  }
  const now = nowMs(opts.now);

  if (!opts.refresh) {
    const cached = readCachedCapabilities(repo, env);
    if (cached && isFresh(cached, now, ttlMinutes(cwd))) {
      return { ok: true, ...cached, degraded: degradedOf(cached), cached: true };
    }
  }

  const live = probeLive(cwd, repo, env, parseProbeIssue(opts.probeIssue), now);
  if (live.ok) {
    if (live.record.final) writeCache(repo, env, live.record);
    return { ok: true, ...live.record, cached: false };
  }
  if (live.offline) return offlineAnswer(repo, env, now);
  return { ok: false, error: live.error };
}

// ─── Modes (pure) ─────────────────────────────────────────────────────────────

function typesByName(caps) {
  const on = caps.org_types && caps.org_types.available === true && Array.isArray(caps.org_types.enabled)
    ? caps.org_types.enabled
    : [];
  const out = {};
  for (const name of REQUIRED_TYPES) out[name] = on.includes(name) ? 'native' : 'labels';
  return out;
}

function fieldsMode(caps) {
  return caps.issue_fields && caps.issue_fields.available === true ? 'native' : 'meta';
}

function pagesMode(caps) {
  if (caps.wiki === 'disabled') return 'docs';
  if (isBlockedWiki(caps.wiki)) return 'blocked';
  return 'wiki';
}

/** Capabilities that fell back, in a fixed order: types, fields, sub_issues, dependencies, wiki. */
function degradedOf(caps) {
  const out = [];
  if (Object.values(typesByName(caps)).some((m) => m !== 'native')) out.push('types');
  if (fieldsMode(caps) !== 'native') out.push('fields');
  if (caps.sub_issues === 'absent') out.push('sub_issues');
  if (caps.dependencies === 'absent') out.push('dependencies');
  if (pagesMode(caps) !== 'wiki') out.push('wiki');
  return out;
}

const SENTENCES = {
  types(caps) {
    const byName = typesByName(caps);
    const missing = REQUIRED_TYPES.filter((n) => byName[n] !== 'native');
    if (caps.owner_type && caps.owner_type !== 'Organization') {
      return `Issue types are only available on organization-owned repositories and ${caps.repo || 'this repository'} is not one, so DevFlow records ${REQUIRED_TYPES.join(', ')} as devflow:type/<name> labels.`;
    }
    if (!caps.org_types || caps.org_types.available !== true) {
      return `The organization's issue types could not be read, so DevFlow records ${REQUIRED_TYPES.join(', ')} as devflow:type/<name> labels.`;
    }
    return `Issue types not enabled for the organization: ${missing.join(', ')}; DevFlow records those as devflow:type/<name> labels instead.`;
  },
  fields(caps) {
    const names = REQUIRED_FIELDS.join(' and ');
    if (caps.owner_type && caps.owner_type !== 'Organization') {
      return `Issue fields are only available on organization-owned repositories, so DevFlow records ${names} in the body meta section.`;
    }
    const missing = caps.issue_fields && Array.isArray(caps.issue_fields.missing) ? caps.issue_fields.missing : [];
    if (missing.length > 0) {
      return `Issue fields not defined for the organization: ${missing.join(', ')}; DevFlow records ${names} in the body meta section instead.`;
    }
    return `Issue fields ${names} could not be read for the organization, so DevFlow records them in the body meta section.`;
  },
  sub_issues(caps) {
    return `Sub-issues are not available on ${caps.repo || 'this repository'}, so TRDs are linked from a task list in the objective body.`;
  },
  dependencies(caps) {
    return `Issue dependencies are not available on ${caps.repo || 'this repository'}, so blocked-by relations are not recorded on GitHub.`;
  },
  wiki(caps) {
    if (caps.wiki === 'disabled') {
      return `The wiki is disabled on ${caps.repo || 'this repository'}, so wiki pages are written to docs/devflow/ in the working tree.`;
    }
    if (caps.wiki === 'uninitialised') {
      return 'The wiki has no first page yet: create the first wiki page in the GitHub web UI, then run `df-tools gh outbox flush`; wiki pushes are blocked until then.';
    }
    const detail = caps.wiki_detail ? String(caps.wiki_detail).trim() : '';
    return `The wiki repository could not be reached${detail ? ` (${detail})` : ''}; wiki pushes are blocked until it can be.`;
  },
};

/**
 * Pure: capabilities in, operating modes out. Never touches gh or git.
 * `unknown` sub-issues, dependencies and wiki read as native (the provisional defaults).
 *
 * @returns {{types:'native'|'labels', types_by_name:Record<string,'native'|'labels'>, fields:'native'|'meta',
 *   hierarchy:'native'|'tasklist', dependencies:'native'|'none', pages:'wiki'|'docs'|'blocked',
 *   pages_message:string|null, writable:boolean, degraded:string[]}}
 */
function resolveModes(caps) {
  if (!caps || typeof caps !== 'object') throw new TypeError('resolveModes needs a capabilities record');
  if (caps.ok === false) throw new TypeError(`resolveModes needs a successful detection: ${caps.error || 'detection failed'}`);
  const byName = typesByName(caps);
  const pages = pagesMode(caps);
  return {
    types: Object.values(byName).every((m) => m === 'native') ? 'native' : 'labels',
    types_by_name: byName,
    fields: fieldsMode(caps),
    hierarchy: caps.sub_issues === 'absent' ? 'tasklist' : 'native',
    dependencies: caps.dependencies === 'absent' ? 'none' : 'native',
    pages,
    pages_message: pages === 'blocked' ? SENTENCES.wiki(caps) : null,
    writable: caps.push !== false,
    degraded: degradedOf(caps),
  };
}

/**
 * One human sentence per degraded capability (the order of `degraded`), preceded by one when the repo is
 * not writable. Used by `gh outbox status`.
 */
function describeDegraded(caps) {
  if (!caps || typeof caps !== 'object') throw new TypeError('describeDegraded needs a capabilities record');
  const out = [];
  if (caps.push === false) {
    out.push(`No push permission on ${caps.repo || 'this repository'}, so DevFlow cannot write to GitHub and refuses to enqueue.`);
  }
  for (const key of degradedOf(caps)) out.push(SENTENCES[key](caps));
  return out;
}

module.exports = {
  REQUIRED_TYPES,
  REQUIRED_FIELDS,
  ISSUE_FIELDS_PATH,
  cachePath,
  listFieldDefinitions,
  detectCapabilities,
  readCachedCapabilities,
  invalidate,
  resolveModes,
  describeDegraded,
};
