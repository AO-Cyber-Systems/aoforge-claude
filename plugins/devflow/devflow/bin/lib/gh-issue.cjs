'use strict';

// gh-issue.cjs (TRD 46-05, GSF-02 / GSF-01 / GSF-05) — find or create an objective's GitHub issue
// without ever duplicating one.
//
// A run context (`createRunContext`) carries the repo, the in-memory v3 mapping and a per-run scan
// cache. This module MUTATES `runCtx.mapping` and never writes the mapping file: the caller (46-07)
// persists once, after the run. Every gh call goes through gh-client (ghRead / ghWrite / ghPaginate),
// so there is one spawn site and one rate-limit policy.
//
// Resolution order for one objective (`findOrCreateObjectiveIssue`); ONLY the last step creates, so
// deleting .gh-mapping.json and re-running yields zero duplicates (GSF-02, success criterion 2):
//   1. mapping.conflicts[id]          -> needs_human, no gh calls
//   2. mapping entry                  -> verified by one `issue view` (marker id must match)
//   3. OBJECTIVE.md github_issue      -> same repo only, verified the same way
//   4. marker scan                    -> one `issue list` per run, indexed by devflow:id
//   5. title scan                     -> unmarked `[Objective N]` issues only
//   6. create                         -> label + milestone ensured first
// Duplicates, conflicts and unreadable state are errors, never a create.

const fs = require('fs');
const path = require('path');
const client = require('./gh-client.cjs');
const mappingLib = require('./gh-mapping.cjs');
const milestoneLib = require('./gh-milestone.cjs');
const bodyLib = require('./gh-body.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validNumber = (v) => Number.isInteger(v) && v > 0;

// ─── Run context ─────────────────────────────────────────────────────────────

function readProjectName(cwd, repo) {
  for (const name of ['PROJECT.md', 'project.md']) {
    const file = path.join(cwd, '.planning', name);
    if (!fs.existsSync(file)) continue;
    try {
      const m = /^#[ \t]+([^\n]+)/m.exec(fs.readFileSync(file, 'utf-8'));
      if (m && m[1].trim() !== '') return m[1].trim();
    } catch {
      // unreadable: fall through to the repo name
    }
  }
  return repo.split('/')[1] || repo;
}

/**
 * One run's shared state. Makes no gh calls.
 *
 *   -> { cwd, repo, label, prefix, mapping, conflicts, warnings, projectName, _scan, _labelEnsured }
 *    | the `skipped` result of requireEnabled, unchanged (github disabled or no repo)
 *    | { ok:false, error } when the mapping file is newer than this DevFlow can read
 *
 * `conflicts` IS `mapping.conflicts` (one object), so a conflict recorded during the run is persisted
 * with the mapping.
 */
function createRunContext(cwd) {
  const gate = client.requireEnabled(cwd);
  if (gate.skipped) return gate;

  const report = mappingLib.readMappingV3WithReport(cwd);
  if (report.error) return { ok: false, error: report.error };

  const mapping = report.mapping;
  if (!isObject(mapping.milestones)) mapping.milestones = {};
  if (!isObject(mapping.objectives)) mapping.objectives = {};
  if (!isObject(mapping.conflicts)) mapping.conflicts = {};

  const warnings = [...report.warnings];
  if (typeof mapping.repo === 'string' && mapping.repo.toLowerCase() !== gate.repo.toLowerCase()) {
    warnings.push(`mapping was written for ${mapping.repo} but the configured repo is ${gate.repo}; mapped issue numbers are verified before use`);
  }

  return {
    cwd,
    repo: gate.repo,
    label: (gate.labels && gate.labels.objective) || 'devflow:objective',
    prefix: gate.milestone_prefix,
    mapping,
    conflicts: mapping.conflicts,
    warnings,
    projectName: readProjectName(cwd, gate.repo),
    _scan: null,
    _labelEnsured: false,
  };
}

// ─── Label (once per run) ────────────────────────────────────────────────────

/**
 * Create the objective label once per run. `gh label create` on an existing label exits non-zero;
 * that is success here. A real failure is returned, recorded as a warning, and NOT remembered, so the
 * next call retries.
 * @returns {{ok:true, created:boolean} | {ok:false, error:string}}
 */
function ensureObjectiveLabel(runCtx) {
  if (runCtx._labelEnsured) return { ok: true, created: false };
  const r = client.ghWrite([
    'label', 'create', runCtx.label, '--repo', runCtx.repo,
    '--color', '0e8a16', '--description', 'DevFlow objective tracking',
  ]);
  if (r.ok) {
    runCtx._labelEnsured = true;
    return { ok: true, created: true };
  }
  if (/already exists/i.test(`${r.stderr}\n${r.stdout}`)) {
    runCtx._labelEnsured = true;
    return { ok: true, created: false };
  }
  const error = r.error || r.stderr || r.stdout || 'gh label create failed';
  runCtx.warnings.push(`could not create label ${runCtx.label}: ${error}`);
  return { ok: false, error };
}

// ─── Milestone (title-keyed cache) ───────────────────────────────────────────

/**
 * The milestone NUMBER for `title`, from `mapping.milestones[title]`, else by creating it, else (create
 * refused, typically 422 already_exists) by looking it up in the paginated milestone list. Null when
 * there is no title or no number can be produced; a warning is recorded in that case and nothing is
 * cached. The cache is keyed by TITLE, so a different milestone is a different key.
 *
 * `gh issue create --milestone` takes the TITLE; the REST endpoints take the NUMBER. This function
 * answers the number.
 */
function ensureMilestone(runCtx, title) {
  if (!title) return null;
  const cache = runCtx.mapping.milestones;
  if (Object.prototype.hasOwnProperty.call(cache, title) && validNumber(cache[title])) return cache[title];

  const create = client.ghWrite([
    'api', `repos/${runCtx.repo}/milestones`,
    '-f', `title=${title}`,
    '-f', `description=DevFlow milestone for ${runCtx.projectName}`,
  ]);
  let reason = create.error || create.stderr || create.stdout || 'create failed';
  if (create.ok) {
    try {
      const n = JSON.parse(create.stdout).number;
      if (validNumber(n)) {
        cache[title] = n;
        return n;
      }
    } catch {
      // fall through to the lookup
    }
    reason = 'create returned no milestone number';
  }

  // Any refused create falls back to a lookup by title: a 422 "already_exists" is the common case, and
  // a lookup is harmless (read-only) for every other failure.
  const list = client.ghPaginate(`repos/${runCtx.repo}/milestones?state=all`);
  if (list.ok) {
    const found = list.items.find((m) => m && m.title === title);
    if (found && validNumber(found.number)) {
      cache[title] = found.number;
      return found.number;
    }
  } else {
    reason = `${reason}; lookup failed: ${list.error}`;
  }
  runCtx.warnings.push(`could not resolve milestone ${title}: ${reason}`);
  return null;
}

/**
 * The milestone for one resolved objective: the title from gh-milestone, the number from the cache or
 * a create. No milestone resolved is not an error: title and number are null and a warning names the
 * objective. Never defaults to a version.
 *
 *   resolved = { id, dir, roadmapNumber }
 *   -> { title, number, version, source: 'objective' | 'roadmap' | 'none' }
 */
function ensureObjectiveMilestone(runCtx, resolved) {
  const r = milestoneLib.resolveObjectiveMilestone(runCtx.cwd, resolved.dir, runCtx.prefix);
  if (r.warning) runCtx.warnings.push(`Objective ${resolved.id}: ${r.warning}`);
  if (!r.title) return { title: null, number: null, version: null, source: r.source };
  return { title: r.title, number: ensureMilestone(runCtx, r.title), version: r.version, source: r.source };
}

// ─── Reading an issue ────────────────────────────────────────────────────────

/** The issue number from the URL `gh issue create` prints (the last `/issues/N`), or null. */
function parseIssueUrl(stdout) {
  if (typeof stdout !== 'string') return null;
  const all = [...stdout.matchAll(/\/issues\/(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/**
 * One `issue view` of issue `number`.
 *   -> { ok:true, issue:{number,title,body,state} }
 *    | { ok:false, notFound:true, error }     the issue does not exist
 *    | { ok:false, notFound:false, error }    it could not be asked (network, rate limit, permissions)
 * Callers must not treat the last case as "missing": that is how duplicates get created.
 */
function verifyIssue(runCtx, number) {
  const r = client.ghRead(['issue', 'view', String(number), '--repo', runCtx.repo, '--json', 'number,title,body,state']);
  if (!r.ok) {
    return {
      ok: false,
      notFound: /could not resolve to an issue|HTTP 404/i.test(`${r.stderr}\n${r.stdout}`),
      error: r.error || r.stderr || r.stdout || 'gh issue view failed',
    };
  }
  let issue;
  try {
    issue = JSON.parse(r.stdout);
  } catch {
    return { ok: false, notFound: false, error: 'unparseable gh issue view output' };
  }
  if (!isObject(issue) || !validNumber(issue.number)) {
    return { ok: false, notFound: false, error: 'gh issue view returned no issue number' };
  }
  return {
    ok: true,
    issue: { number: issue.number, title: String(issue.title ?? ''), body: String(issue.body ?? ''), state: issue.state },
  };
}

/**
 * The objective issues of the repo, listed ONCE per run (the result, including a failure, is cached on
 * the run context). List-and-scan on purpose: issue bodies are read locally, never queried through
 * GitHub's index, which lags and does not reliably see HTML comments.
 *
 *   -> { ok:true, issues, byId, duplicates, unmarked, titleById }   titleById: unmarked issues by title number
 *    | { ok:false, error }
 */
function scanObjectiveIssues(runCtx) {
  if (runCtx._scan) return runCtx._scan;
  const r = client.ghRead([
    'issue', 'list', '--repo', runCtx.repo, '--label', runCtx.label,
    '--state', 'all', '--limit', '1000', '--json', 'number,title,body',
  ]);
  let scan;
  let issues = null;
  if (r.ok) {
    try {
      issues = JSON.parse(r.stdout);
    } catch {
      issues = null;
    }
  }
  if (!r.ok) {
    scan = { ok: false, error: r.error || r.stderr || r.stdout || 'gh issue list failed' };
  } else if (!Array.isArray(issues)) {
    scan = { ok: false, error: 'unparseable gh issue list output' };
  } else {
    const idx = bodyLib.indexByMarker(issues);
    const titleById = {};
    const byNumber = new Map(issues.map((i) => [i.number, i]));
    for (const n of idx.unmarked) {
      const tid = bodyLib.parseTitleNumber(byNumber.get(n).title);
      if (tid !== null) (titleById[tid] = titleById[tid] || []).push(n);
    }
    for (const list of Object.values(titleById)) list.sort((a, b) => a - b);
    scan = { ok: true, issues, byId: idx.byId, duplicates: idx.duplicates, unmarked: idx.unmarked, titleById };
  }
  runCtx._scan = scan;
  return scan;
}

// ─── Reference parsing ───────────────────────────────────────────────────────

const OBJECTIVE_ID = /^\d+(?:\.\d+)?$/;

/** `owner/repo#31` | `.../owner/repo/issues/31` | `#31` | `31` -> { repo|null, number }, else null. */
function parseIssueRef(ref) {
  if (typeof ref !== 'string') return null;
  const s = ref.trim();
  let m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(s);
  if (m) return { repo: m[1], number: Number(m[2]) };
  m = /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\s*$/.exec(s);
  if (m) return { repo: m[1], number: Number(m[2]) };
  m = /^#?(\d+)$/.exec(s);
  return m ? { repo: null, number: Number(m[1]) } : null;
}

function readIssueRef(cwd, dir) {
  if (!dir) return null;
  try {
    const text = fs.readFileSync(path.join(cwd, '.planning', 'objectives', dir, 'OBJECTIVE.md'), 'utf-8');
    return parseIssueRef(extractFrontmatter(text).github_issue);
  } catch {
    return null;
  }
}

// ─── Candidate checking and mapping repair ───────────────────────────────────

/**
 * Does the issue belong to objective `id`? Its marker decides; with no marker its `[Objective N]` title
 * decides; with neither it is accepted (needs_marker: the caller writes the marker).
 */
function classify(issue, id) {
  const idx = bodyLib.indexByMarker([{ number: issue.number, body: issue.body }]);
  const markerId = Object.keys(idx.byId)[0];
  if (markerId !== undefined) {
    return markerId === id ? { kind: 'match', needs_marker: false } : { kind: 'other', otherId: markerId, via: 'marker' };
  }
  const titleId = bodyLib.parseTitleNumber(issue.title);
  if (titleId === null || titleId === id) return { kind: 'match', needs_marker: true };
  return { kind: 'other', otherId: titleId, via: 'title' };
}

const claimWord = (via) => (via === 'marker' ? 'marked' : 'titled');

/** verifyIssue + classify -> { status: 'hit'|'other'|'gone'|'error', ... }. */
function checkCandidate(runCtx, id, number) {
  const v = verifyIssue(runCtx, number);
  if (!v.ok) return v.notFound ? { status: 'gone' } : { status: 'error', error: v.error };
  const c = classify(v.issue, id);
  if (c.kind === 'match') return { status: 'hit', issue: v.issue, needs_marker: c.needs_marker };
  return { status: 'other', issue: v.issue, otherId: c.otherId, via: c.via };
}

function addUnique(list, entry) {
  if (!list.some((e) => e.legacy_key === entry.legacy_key && e.issue_id === entry.issue_id)) list.push(entry);
}

/**
 * The mapping entry `fromId` -> issue `n` is wrong: the issue belongs to `toId`. Move it there (state
 * comment with it) when `toId` is free; drop the stale key when `toId` already names the same issue;
 * otherwise two issues claim `toId`, so record both in conflicts and let a human decide.
 */
function rekeyEntry(runCtx, fromId, toId, n, via, warn) {
  const objs = runCtx.mapping.objectives;
  const old = objs[fromId] || {};
  delete objs[fromId];
  if (!OBJECTIVE_ID.test(toId)) {
    warn(`mapping entry "${fromId}" -> #${n} dropped: the issue is ${claimWord(via)} for "${toId}", which is not an objective`);
    return;
  }
  const taken = Object.prototype.hasOwnProperty.call(objs, toId) ? objs[toId] : null;
  if (taken === null) {
    objs[toId] = { issue_id: n, state_comment_id: old.state_comment_id ?? null, verified_at: old.verified_at ?? null };
    warn(`mapping entry "${fromId}" -> #${n} re-keyed to "${toId}": the issue is ${claimWord(via)} for objective ${toId}`);
    return;
  }
  if (taken.issue_id === n) {
    warn(`mapping entry "${fromId}" dropped: #${n} is already mapped to "${toId}"`);
    return;
  }
  const list = runCtx.conflicts[toId] || (runCtx.conflicts[toId] = []);
  addUnique(list, { legacy_key: toId, issue_id: taken.issue_id, state_comment_id: taken.state_comment_id ?? null });
  addUnique(list, { legacy_key: fromId, issue_id: n, state_comment_id: old.state_comment_id ?? null });
  warn(`objective ${toId} is claimed by both #${taken.issue_id} (mapping) and #${n} (${claimWord(via)} for it); needs a human`);
}

/** Point `id` at `number`, keeping the state comment and verified_at only when it is the same issue. */
function recordHit(runCtx, id, number) {
  const existing = mappingLib.getEntry(runCtx.mapping, id);
  const same = existing !== null && existing.issue_id === number;
  mappingLib.setEntry(runCtx.mapping, id, {
    issue_id: number,
    state_comment_id: same ? existing.state_comment_id : null,
    verified_at: same ? existing.verified_at : null,
  });
}

const slugFromDir = (dir) => (dir ? String(dir).replace(/^[\d.]+-/, '') : '');

// ─── The resolution chain ────────────────────────────────────────────────────

/**
 * Find objective `resolved.id`'s issue, or create it when every other source misses.
 *
 *   resolved = { id, dir, roadmapNumber }                 (from gh-mapping)
 *   opts     = { name, createBody }                       createBody must already carry the marker
 *   -> { ok:true, issue_number, source, created, needs_marker, body, title, warnings }
 *    | { ok:false, error, message, warnings, ... }
 *
 * `source` is one of mapping | frontmatter | marker | title | created. Errors: needs_human,
 * verify_failed, scan_failed, duplicate_marker, duplicate_title, create_failed, create_unparseable,
 * invalid_objective. Mutates `runCtx.mapping` in memory only; the caller persists it.
 */
function findOrCreateObjectiveIssue(runCtx, resolved, opts = {}) {
  const id = mappingLib.toObjectiveId(resolved && resolved.id);
  // Every warning raised while resolving this objective (including the label/milestone helpers', which
  // write to runCtx.warnings directly) is reported on the result as well as kept on the run context.
  const start = runCtx.warnings.length;
  const collected = () => runCtx.warnings.slice(start);
  const warn = (m) => { runCtx.warnings.push(m); };
  const fail = (extra) => ({ ok: false, ...extra, warnings: collected() });
  if (id === null) return fail({ error: 'invalid_objective', message: `unrecognised objective ${JSON.stringify(resolved && resolved.id)}` });

  const hit = (source, issue, needsMarker) => {
    recordHit(runCtx, id, issue.number);
    return {
      ok: true, issue_number: issue.number, source, created: false, needs_marker: needsMarker,
      body: issue.body, title: issue.title, warnings: collected(),
    };
  };

  // 1. Known conflict: a human decides. No gh calls.
  const conflict = Object.prototype.hasOwnProperty.call(runCtx.conflicts, id) ? runCtx.conflicts[id] : null;
  if (Array.isArray(conflict) && conflict.length > 0) {
    return fail({
      error: 'needs_human',
      message: `objective ${id} maps to more than one issue (${conflict.map((e) => `#${e.issue_id}`).join(', ')}); resolve .planning/.gh-mapping.json conflicts by hand`,
      conflicts: conflict,
    });
  }

  const tried = new Set();

  // 2. Mapping entry, verified.
  const entry = mappingLib.getEntry(runCtx.mapping, id);
  if (entry) {
    tried.add(entry.issue_id);
    const c = checkCandidate(runCtx, id, entry.issue_id);
    if (c.status === 'hit') return hit('mapping', c.issue, c.needs_marker);
    if (c.status === 'error') {
      return fail({ error: 'verify_failed', message: `could not verify mapped issue #${entry.issue_id}: ${c.error}`, issue_number: entry.issue_id });
    }
    if (c.status === 'gone') {
      delete runCtx.mapping.objectives[id];
      warn(`mapped issue #${entry.issue_id} not found`);
    } else {
      rekeyEntry(runCtx, id, c.otherId, entry.issue_id, c.via, warn);
    }
  }

  // 3. OBJECTIVE.md github_issue (same repo only).
  const ref = readIssueRef(runCtx.cwd, resolved.dir);
  if (ref) {
    if (ref.repo && ref.repo.toLowerCase() !== runCtx.repo.toLowerCase()) {
      warn(`github_issue points at another repo (${ref.repo}#${ref.number}); ignored`);
    } else if (!tried.has(ref.number)) {
      tried.add(ref.number);
      const c = checkCandidate(runCtx, id, ref.number);
      if (c.status === 'hit') return hit('frontmatter', c.issue, c.needs_marker);
      if (c.status === 'error') {
        return fail({ error: 'verify_failed', message: `could not verify github_issue #${ref.number}: ${c.error}`, issue_number: ref.number });
      }
      if (c.status === 'gone') warn(`github_issue #${ref.number} not found`);
      else warn(`github_issue #${ref.number} is ${claimWord(c.via)} for objective ${c.otherId}; ignored`);
    }
  }

  // 4. Marker scan (one list per run).
  const scan = scanObjectiveIssues(runCtx);
  if (!scan.ok) return fail({ error: 'scan_failed', message: `could not list ${runCtx.label} issues: ${scan.error}` });
  const dupes = scan.duplicates[id];
  if (dupes) {
    return fail({
      error: 'duplicate_marker',
      message: `issues ${dupes.map((n) => `#${n}`).join(', ')} all carry devflow:id=${id}; remove or re-marker the extras, then re-run`,
      issues: dupes,
    });
  }
  const byNumber = (n) => scan.issues.find((i) => i.number === n);
  if (scan.byId[id] !== undefined) return hit('marker', byNumber(scan.byId[id]), false);

  // 5. Title scan, unmarked issues only.
  const titled = scan.titleById[id] || [];
  if (titled.length > 1) {
    return fail({
      error: 'duplicate_title',
      message: `issues ${titled.map((n) => `#${n}`).join(', ')} are all titled [Objective ${id}] and carry no marker; keep one, then re-run`,
      issues: titled,
    });
  }
  if (titled.length === 1) return hit('title', byNumber(titled[0]), true);

  // 6. Create: the only step that may.
  const name = opts.name || slugFromDir(resolved.dir) || `objective ${id}`;
  const title = `[Objective ${resolved.roadmapNumber || id}] ${name}`;
  const createBody = typeof opts.createBody === 'string' && opts.createBody !== '' ? opts.createBody : bodyLib.markerLine(id);
  ensureObjectiveLabel(runCtx); // a failure is already a warning; the create below reports a real problem
  const ms = ensureObjectiveMilestone(runCtx, resolved);
  const build = (milestone) => [
    'issue', 'create', '--repo', runCtx.repo, '--title', title, '--body', createBody, '--label', runCtx.label,
    ...(milestone ? ['--milestone', milestone] : []),
  ];
  const useMilestone = ms.title && ms.number ? ms.title : null;

  let r = client.ghWrite(build(useMilestone));
  // gh resolves the milestone before it creates anything, so a milestone failure left no issue behind.
  if (!r.ok && useMilestone && /milestone/i.test(`${r.stderr}\n${r.stdout}`)) {
    delete runCtx.mapping.milestones[useMilestone];
    const again = ensureMilestone(runCtx, useMilestone);
    warn(`cached milestone ${useMilestone} was stale; re-ensured it and retrying the create once`);
    r = client.ghWrite(build(again ? useMilestone : null));
  }
  if (!r.ok) {
    const stderr = r.stderr || r.error || r.stdout || 'gh issue create failed';
    return fail({ error: 'create_failed', message: `could not create the issue for objective ${id}: ${stderr}`, stderr });
  }
  const number = parseIssueUrl(r.stdout);
  if (number === null) {
    return fail({
      error: 'create_unparseable',
      message: 'gh issue create succeeded but printed no issue URL; check GitHub for a new issue before re-running (the marker scan will find it)',
      stdout: r.stdout,
    });
  }

  // A later objective in this run must see the new issue, and must not re-find it by accident.
  scan.issues.push({ number, title, body: createBody });
  scan.byId[id] = number;
  recordHit(runCtx, id, number);
  return {
    ok: true, issue_number: number, source: 'created', created: true, needs_marker: false,
    body: createBody, title, warnings: collected(),
  };
}

module.exports = {
  createRunContext,
  ensureObjectiveLabel,
  ensureMilestone,
  ensureObjectiveMilestone,
  parseIssueUrl,
  verifyIssue,
  scanObjectiveIssues,
  findOrCreateObjectiveIssue,
};
