'use strict';

// gh-mapping.cjs (TRD 46-02, GSF-01) — one objective identity, one mapping shape.
//
// Before this module the GitHub sync had two defects rooted in identity:
//   1. `.planning/.gh-mapping.json` existed in two shapes (v1: bare issue numbers, v2: objects), and a
//      reader of one fed the other's value into `gh issue edit` as "[object Object]".
//   2. Three key spaces named the same objective three ways — the ROADMAP number ("2.1"), the directory
//      prefix run through parseInt ("02.1-foo" -> 2, colliding with objective 2) and the directory name —
//      so `pull` never found the entries `push` wrote.
//
// This module is the only place either is decided:
//   - `toObjectiveId` / `resolveObjective` / `listObjectiveIndex`: the canonical objective id, which is the
//     ROADMAP number with leading zeros stripped ("046" -> "46", "02.1-foo" -> "2.1", "00-x" -> "0").
//   - `migrateMapping`: a PURE converter from any v1/v2/mixed mapping to the one v3 shape. Idempotent.
//   - `readMappingV3` converts lazily in memory and never writes. `writeMappingV3` is atomic, sorts keys
//     numerically, and refuses to touch a mapping (or a file on disk) whose version is above 3.
//   - `normalizeSyncStateKeys`: the same id normalisation for `.gh-sync-state.json`, which keeps
//     `version: 1` on disk and only changes its keys.
//
// v3 (write exactly this; `issue_id`/`state_comment_id` keep their v2 names so an older reader of the
// same file still finds `objectives[k].issue_id`):
//   { "version": 3, "repo": "owner/name", "milestones": { "v1.4": 7 },
//     "objectives": { "46": { "issue_id": 123, "state_comment_id": 456, "verified_at": null } },
//     "trds": {} }
// plus a top-level `conflicts` block only when non-empty (see migrateMapping).
//
// Scope: these are OBJECTIVE ids. A TRD id such as "46-02" is reserved for objective 47's `trds` map and
// reads here as objective 46 with slug "02" — `trds` keys are out of scope and untouched.
//
// Never `parseInt` a directory prefix anywhere else: `parseInt("02.1")` is 2. The one legitimate use is
// the integer part inside `toObjectiveId`, plus numeric sorting.

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./sync-state.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

const MAPPING_VERSION = 3;
const MAPPING_REL = path.join('.planning', '.gh-mapping.json');

// ─── Objective identity ───────────────────────────────────────────────────────

const ID_RE = /^(\d+)(\.\d+)?(?:-.*)?$/;

/**
 * Canonical objective id for any spelling of an objective, or null for junk.
 *   46 | "046" | "46-github-sync-foundations" -> "46"     "2.1" | "02.1-foo" -> "2.1"
 *   "0" | "00-refine-defaults-table"          -> "0"      "abc" | "" | null   -> null
 * The decimal part is kept verbatim ("02.10" -> "2.10"): 2.10 is the tenth insert, not 2.1.
 */
function toObjectiveId(arg) {
  const m = String(arg ?? '').trim().match(ID_RE);
  if (!m) return null;
  // Integer part only: parseInt on "02" is exactly right here, and is what strips the padding.
  return String(parseInt(m[1], 10)) + (m[2] || '');
}

/** Numeric compare of two canonical ids: integer part, then decimal part ("2" < "2.1" < "2.2" < "2.10"). */
function compareIds(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const ia = parseInt(pa[0], 10);
  const ib = parseInt(pb[0], 10);
  if (Number.isNaN(ia) || Number.isNaN(ib)) {
    // Not a canonical id: sort after every real one, then by text, so ordering stays total and stable.
    if (Number.isNaN(ia) && !Number.isNaN(ib)) return 1;
    if (!Number.isNaN(ia) && Number.isNaN(ib)) return -1;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  if (ia !== ib) return ia - ib;
  const da = pa.length > 1 ? parseInt(pa[1], 10) : -1;
  const db = pb.length > 1 ? parseInt(pb[1], 10) : -1;
  return da - db;
}

/**
 * Every objective the project knows about: the union of `.planning/objectives/<dir>` and the ROADMAP
 * `### Objective N:` headers, deduped by id (the directory wins), sorted numerically.
 *
 *   [{ id, dir, roadmapNumber, github_issue }]
 *
 * `dir` is the directory NAME (null for a ROADMAP-only objective that has no directory yet).
 * `roadmapNumber` is the number exactly as the ROADMAP header spells it, falling back to `id` (which is
 * the ROADMAP number by definition) when the objective has a directory but no header.
 * `github_issue` is the OBJECTIVE.md frontmatter value as written (e.g. "owner/repo#31"), or null.
 */
function listObjectiveIndex(cwd) {
  const byId = new Map();

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  if (fs.existsSync(objectivesDir)) {
    const names = fs.readdirSync(objectivesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of names) {
      const id = toObjectiveId(name);
      if (id === null || byId.has(id)) continue; // first directory (sorted) wins a duplicate id
      byId.set(id, { id, dir: name, roadmapNumber: id, github_issue: readGithubIssue(path.join(objectivesDir, name)) });
    }
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const headerRe = /^#{2,4}[ \t]*Objective[ \t]+([\d.]+):/gim;
    let m;
    while ((m = headerRe.exec(content)) !== null) {
      const id = toObjectiveId(m[1]);
      if (id === null) continue;
      const existing = byId.get(id);
      if (existing) {
        existing.roadmapNumber = m[1];
      } else {
        byId.set(id, { id, dir: null, roadmapNumber: m[1], github_issue: null });
      }
    }
  }

  return [...byId.values()].sort((a, b) => compareIds(a.id, b.id));
}

// extractFrontmatter turns a bare `github_issue:` into {} — anything that is not a non-empty string is null.
function readGithubIssue(objectiveDir) {
  const file = path.join(objectiveDir, 'OBJECTIVE.md');
  if (!fs.existsSync(file)) return null;
  let fm;
  try {
    fm = extractFrontmatter(fs.readFileSync(file, 'utf-8'));
  } catch (_) {
    return null;
  }
  const v = fm.github_issue;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Resolve ANY spelling of an objective ("46", "046", "46-github-sync-foundations", "02.1-foo") to
 * `{ id, dir, roadmapNumber }`, or null when the objective is unknown. Use `.id` for the mapping and
 * sync-state, `.dir` for file paths, `.roadmapNumber` for `roadmap get-objective`.
 */
function resolveObjective(cwd, arg) {
  const id = toObjectiveId(arg);
  if (id === null) return null;
  const hit = listObjectiveIndex(cwd).find((e) => e.id === id);
  return hit ? { id: hit.id, dir: hit.dir, roadmapNumber: hit.roadmapNumber } : null;
}

module.exports = {
  MAPPING_VERSION,
  MAPPING_REL,
  toObjectiveId,
  compareIds,
  listObjectiveIndex,
  resolveObjective,
};
