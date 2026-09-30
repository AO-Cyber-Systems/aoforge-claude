'use strict';

// gh-issue.cjs (TRD 46-05, GSF-02 / GSF-01 / GSF-05) — find or create an objective's GitHub issue
// without ever duplicating one.
//
// A run context (`createRunContext`) carries the repo, the in-memory v3 mapping and a per-run scan
// cache. This module MUTATES `runCtx.mapping` and never writes the mapping file: the caller (46-07)
// persists once, after the run. Every gh call goes through gh-client (ghRead / ghWrite / ghPaginate),
// so there is one spawn site and one rate-limit policy.
//
// This file grows across the TRD's tasks: the run context, label and milestone bootstrap first, then
// the resolution chain (mapping -> frontmatter -> marker scan -> title scan -> create).

const fs = require('fs');
const path = require('path');
const client = require('./gh-client.cjs');
const mappingLib = require('./gh-mapping.cjs');
const milestoneLib = require('./gh-milestone.cjs');

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

module.exports = {
  createRunContext,
  ensureObjectiveLabel,
  ensureMilestone,
  ensureObjectiveMilestone,
};
