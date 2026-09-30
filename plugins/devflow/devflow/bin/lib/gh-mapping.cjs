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

// ─── Mapping v3: pure conversion ──────────────────────────────────────────────

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Top-level fields this module owns. Anything else is carried through untouched (additive fields from a
// later objective survive a read-modify-write); `milestone_id` is the legacy field and is dropped.
const KNOWN_TOP_LEVEL = new Set(['version', 'repo', 'milestones', 'objectives', 'trds', 'conflicts', 'milestone_id']);

/** An empty v3 mapping. */
function emptyMapping() {
  return { version: MAPPING_VERSION, milestones: {}, objectives: {}, trds: {} };
}

// Key-order-independent JSON, used only to decide whether a conversion changed anything.
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isPlainObject(v)) {
    const parts = Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

// Positive integer from a number or a numeric string, else null. GitHub issue and comment ids.
function coerceId(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim()) && Number(v.trim()) > 0) return Number(v.trim());
  return null;
}

function readLegacyEntry(val) {
  if (isPlainObject(val)) {
    return {
      issue_id: coerceId(val.issue_id),
      state_comment_id: coerceId(val.state_comment_id),
      verified_at: typeof val.verified_at === 'string' && val.verified_at !== '' ? val.verified_at : null,
    };
  }
  return { issue_id: coerceId(val), state_comment_id: null, verified_at: null }; // v1: a bare issue number
}

// Does an OBJECTIVE.md `github_issue` value name issue #`issueId`? Accepts "owner/repo#31",
// ".../issues/31" and a bare "31". When both the ref and the mapping name a repo and they differ, it is
// somebody else's issue #31 and does not count.
function claimsIssue(ref, issueId, repo) {
  if (typeof ref !== 'string') return false;
  const s = ref.trim();
  let m = s.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  if (m) return Number(m[2]) === issueId && (!repo || m[1].toLowerCase() === repo.toLowerCase());
  m = s.match(/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\s*$/);
  if (m) return Number(m[2]) === issueId && (!repo || m[1].toLowerCase() === repo.toLowerCase());
  m = s.match(/^#?(\d+)$/);
  return m ? Number(m[1]) === issueId : false;
}

// The v2 writer keyed objectives by parseInt(dirPrefix), so objective 2.1 was stored under "2". Undo that
// ONLY when a single decimal objective of the same integer part names this issue in its OBJECTIVE.md and
// no objective with the key's own id does. Anything else keeps the key: the first-sync marker check is the
// authority, this function never guesses.
function repairCollapsedKey(id, issueId, index, repo) {
  if (id.includes('.') || !index.length) return id; // a decimal id was never collapsed
  const claimants = index.filter((e) => claimsIssue(e.github_issue, issueId, repo));
  if (claimants.length === 0 || claimants.some((e) => e.id === id)) return id;
  const candidates = claimants.filter((e) => e.id.startsWith(`${id}.`));
  return candidates.length === 1 ? candidates[0].id : id;
}

const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Convert any v1 / v2 / mixed / v3 mapping into the one v3 shape. PURE: no I/O, input never mutated.
 *
 *   migrateMapping(raw, index = []) -> { mapping, changed, conflicts, notes, error? }
 *
 * `index` is `listObjectiveIndex(cwd)` (used only to repair parseInt-collapsed keys).
 * - null/undefined `raw` -> an empty v3, changed false. `version > 3` -> `{ error, mapping: null }`.
 * - Legacy `milestone_id` is dropped with a note: a bare number has no title to key it by, and the current
 *   milestone is re-resolved by title on the next sync (GSF-05).
 * - Each objective key goes through `toObjectiveId` (dir names, padded numbers), then the collapse repair.
 * - Keys that land on one id: the same issue merges; different issues go to `conflicts[id]` and are
 *   OMITTED from `objectives` — nobody picks a winner here.
 * - Idempotent: a v3 input takes the same path, so migrate(migrate(x).mapping) equals migrate(x).mapping.
 */
function migrateMapping(raw, index = []) {
  const notes = [];
  if (raw === null || raw === undefined) return { mapping: emptyMapping(), changed: false, conflicts: {}, notes };
  if (!isPlainObject(raw)) {
    return { mapping: null, changed: false, conflicts: {}, notes, error: 'mapping must be a JSON object' };
  }

  const version = raw.version === undefined ? 0 : Number(raw.version);
  if (!Number.isFinite(version)) {
    return { mapping: null, changed: false, conflicts: {}, notes, error: `invalid mapping version ${JSON.stringify(raw.version)}` };
  }
  if (version > MAPPING_VERSION) {
    return {
      mapping: null, changed: false, conflicts: {}, notes,
      error: `unsupported mapping version ${version} (this DevFlow reads up to ${MAPPING_VERSION}); refusing to convert`,
    };
  }

  const repo = typeof raw.repo === 'string' && raw.repo.trim() !== '' ? raw.repo.trim() : null;
  const out = { version: MAPPING_VERSION };
  if (repo) out.repo = repo;
  out.milestones = isPlainObject(raw.milestones) ? clone(raw.milestones) : {};
  out.objectives = {};
  out.trds = isPlainObject(raw.trds) ? clone(raw.trds) : {};
  for (const k of Object.keys(raw)) if (!KNOWN_TOP_LEVEL.has(k)) out[k] = clone(raw[k]);

  if (raw.milestone_id !== undefined && raw.milestone_id !== null && raw.milestone_id !== '') {
    notes.push(`dropped milestone_id ${JSON.stringify(raw.milestone_id)}: a bare number has no title to key it by (the current milestone is re-resolved by title on the next sync)`);
  }

  // Conflicts already recorded in a v3 mapping carry forward (keys normalised; entries de-duplicated).
  const conflicts = {};
  const addConflicts = (id, entries) => {
    const list = conflicts[id] || (conflicts[id] = []);
    for (const e of entries) {
      if (!list.some((x) => x.legacy_key === e.legacy_key && x.issue_id === e.issue_id)) list.push(e);
    }
  };
  if (isPlainObject(raw.conflicts)) {
    for (const [k, list] of Object.entries(raw.conflicts)) {
      if (Array.isArray(list)) addConflicts(toObjectiveId(k) ?? k, clone(list));
    }
  }

  const groups = new Map(); // id -> [{ legacy_key, issue_id, state_comment_id, verified_at }]
  const source = isPlainObject(raw.objectives) ? raw.objectives : {};
  for (const [key, val] of Object.entries(source)) {
    let id = toObjectiveId(key);
    if (id === null) {
      notes.push(`dropped objective key ${JSON.stringify(key)}: not an objective id`);
      continue;
    }
    const entry = readLegacyEntry(val);
    if (entry.issue_id === null) {
      notes.push(`skipped objective ${JSON.stringify(key)}: no usable issue_id`);
      continue;
    }
    const repaired = repairCollapsedKey(id, entry.issue_id, index, repo);
    if (repaired !== id) {
      notes.push(`re-keyed objective "${key}" -> "${repaired}": its OBJECTIVE.md github_issue names #${entry.issue_id}`);
      id = repaired;
    }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ legacy_key: key, ...entry });
  }

  for (const [id, list] of groups) {
    // Sorted so the result never depends on object enumeration order (integer-like keys enumerate first).
    list.sort((a, b) => a.issue_id - b.issue_id || cmpText(a.legacy_key, b.legacy_key));
    const issues = [...new Set(list.map((e) => e.issue_id))];
    if (issues.length === 1) {
      out.objectives[id] = {
        issue_id: issues[0],
        state_comment_id: list.map((e) => e.state_comment_id).find((v) => v !== null) ?? null,
        verified_at: list.map((e) => e.verified_at).filter((v) => v !== null).sort().pop() ?? null,
      };
      if (list.length > 1) notes.push(`merged ${list.length} keys for objective ${id}: all name issue #${issues[0]}`);
    } else {
      addConflicts(id, list.map(({ legacy_key, issue_id, state_comment_id }) => ({ legacy_key, issue_id, state_comment_id })));
      notes.push(`conflict: objective ${id} maps to issues ${issues.map((n) => `#${n}`).join(', ')}; no winner picked`);
    }
  }
  if (Object.keys(conflicts).length) out.conflicts = conflicts;

  return { mapping: out, changed: canonicalJson(raw) !== canonicalJson(out), conflicts, notes };
}

/**
 * Normalise the keys of a `.gh-sync-state.json` payload to objective ids. The schema is unchanged
 * (`version: 1`); only keys move. When two keys name one objective the record with the newest
 * `last_synced_at` wins (a tie goes to the record already under the canonical spelling). A key that is not
 * an objective id is left exactly as it is: this is a derived baseline, not something to delete from.
 *
 *   normalizeSyncStateKeys(state) -> { state: { version: 1, objectives }, changed }
 */
function normalizeSyncStateKeys(state) {
  const source = isPlainObject(state) && isPlainObject(state.objectives) ? state.objectives : {};
  const syncedAt = (rec) => {
    const t = Date.parse(isPlainObject(rec) ? rec.last_synced_at : undefined);
    return Number.isNaN(t) ? -Infinity : t;
  };

  const winners = new Map(); // target key -> { key, rec }
  for (const [key, rec] of Object.entries(source)) {
    const target = toObjectiveId(key) ?? key;
    const incumbent = winners.get(target);
    if (!incumbent) { winners.set(target, { key, rec }); continue; }
    const a = syncedAt(rec);
    const b = syncedAt(incumbent.rec);
    if (a > b || (a === b && key === target && incumbent.key !== target)) winners.set(target, { key, rec });
  }

  const objectives = {};
  for (const target of [...winners.keys()].sort(compareIds)) objectives[target] = clone(winners.get(target).rec);
  return {
    state: { version: 1, objectives },
    changed: canonicalJson(source) !== canonicalJson(objectives),
  };
}

// ─── Mapping v3: serialisation, reader, writer ────────────────────────────────

const IND = '  ';
const naturalCompare = (a, b) => a.localeCompare(b, 'en', { numeric: true });

// JSON objects iterate integer-like keys first ("2","10") and everything else in insertion order ("2.1"),
// so JSON.stringify cannot produce 2, 2.1, 3, 10. Objects are therefore assembled by hand.
function renderObject(pairs, level) {
  if (pairs.length === 0) return '{}';
  const pad = IND.repeat(level + 1);
  return `{\n${pairs.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${v}`).join(',\n')}\n${IND.repeat(level)}}`;
}

// JSON.stringify output re-indented to sit at `level`.
const renderJson = (value, level) => JSON.stringify(value, null, 2).replace(/\n/g, `\n${IND.repeat(level)}`);

/**
 * Byte-stable text for a v3 mapping: canonical top-level order (version, repo, milestones, objectives,
 * trds, conflicts, extras), objectives and conflicts sorted numerically by id, trailing newline. The file
 * is tracked in git, so stable output means stable diffs.
 */
function serializeMapping(mapping) {
  const sorted = (obj, cmp, level) => Object.keys(obj || {}).sort(cmp).map((k) => [k, renderJson(obj[k], level + 1)]);
  const top = [['version', String(MAPPING_VERSION)]];
  if (typeof mapping.repo === 'string' && mapping.repo !== '') top.push(['repo', JSON.stringify(mapping.repo)]);
  top.push(['milestones', renderObject(sorted(mapping.milestones, naturalCompare, 1), 1)]);
  top.push(['objectives', renderObject(sorted(mapping.objectives, compareIds, 1), 1)]);
  top.push(['trds', renderObject(sorted(mapping.trds, naturalCompare, 1), 1)]);
  if (isPlainObject(mapping.conflicts) && Object.keys(mapping.conflicts).length) {
    top.push(['conflicts', renderObject(sorted(mapping.conflicts, compareIds, 1), 1)]);
  }
  for (const k of Object.keys(mapping).sort()) {
    if (!KNOWN_TOP_LEVEL.has(k) && mapping[k] !== undefined) top.push([k, renderJson(mapping[k], 1)]);
  }
  return `${renderObject(top, 0)}\n`;
}

/**
 * Read `.planning/.gh-mapping.json` as v3, converting lazily IN MEMORY. Never writes.
 *
 *   -> { mapping, conflicts, notes, warnings, changed, exists, error? }
 *
 * Missing file -> empty v3. Unparseable -> empty v3 + a warning. A version above 3 -> empty v3 + `error`
 * (callers must check it before writing; `writeMappingV3` also refuses on its own).
 */
function readMappingV3WithReport(cwd) {
  const report = { mapping: emptyMapping(), conflicts: {}, notes: [], warnings: [], changed: false, exists: false };
  const file = path.join(cwd, MAPPING_REL);
  if (!fs.existsSync(file)) return report;
  report.exists = true;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) {
    report.warnings.push('unparseable .gh-mapping.json');
    return report;
  }
  const r = migrateMapping(raw, listObjectiveIndex(cwd));
  if (r.error) {
    report.error = r.error;
    return report;
  }
  return { ...report, mapping: r.mapping, conflicts: r.conflicts, notes: r.notes, changed: r.changed };
}

/** The v3 mapping for `cwd` (see readMappingV3WithReport for warnings, conflicts and errors). */
function readMappingV3(cwd) {
  return readMappingV3WithReport(cwd).mapping;
}

/**
 * Persist a mapping as v3, atomically (tmp + rename). Returns `{ ok: true, path, notes }` or
 * `{ ok: false, error }`. Refuses — and leaves the disk alone — when the mapping is above version 3, when
 * the file on disk is above version 3 (never a silent downgrade), or when the file on disk cannot be parsed
 * (never overwrite what it cannot read). A legacy-shaped argument is converted first, so the file on disk is
 * always the one shape.
 */
function writeMappingV3(cwd, mapping) {
  if (isPlainObject(mapping) && Number(mapping.version) > MAPPING_VERSION) {
    return { ok: false, error: `refusing to write mapping version ${mapping.version}: this DevFlow writes version ${MAPPING_VERSION}` };
  }
  const file = path.join(cwd, MAPPING_REL);
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (text.trim() !== '') {
      let onDisk;
      try {
        onDisk = JSON.parse(text);
      } catch (_) {
        return { ok: false, error: 'refusing to overwrite an unparseable .gh-mapping.json' };
      }
      if (isPlainObject(onDisk) && Number(onDisk.version) > MAPPING_VERSION) {
        return { ok: false, error: `refusing to overwrite .gh-mapping.json: it is version ${onDisk.version}, newer than the ${MAPPING_VERSION} this DevFlow writes` };
      }
    }
  }
  const r = migrateMapping(mapping, []);
  if (r.error) return { ok: false, error: r.error };
  atomicWrite(file, serializeMapping(r.mapping));
  return { ok: true, path: file, notes: r.notes };
}

/** The entry for any spelling of an objective ("046", "02.1-foo", 46), or null. */
function getEntry(mapping, arg) {
  const id = toObjectiveId(arg);
  if (id === null || !isPlainObject(mapping) || !isPlainObject(mapping.objectives)) return null;
  return hasOwn(mapping.objectives, id) ? mapping.objectives[id] : null;
}

/**
 * Set fields on an objective's entry, in place, and return the mapping. The patch MERGES onto the existing
 * entry (a field the patch names wins, including an explicit null) and the result always has the three v3
 * fields. Throws on an unrecognised objective or when no issue_id results.
 */
function setEntry(mapping, arg, patch) {
  const id = toObjectiveId(arg);
  if (id === null) throw new TypeError(`setEntry: unrecognised objective ${JSON.stringify(arg)}`);
  if (!isPlainObject(mapping.objectives)) mapping.objectives = {};
  const existing = hasOwn(mapping.objectives, id) ? mapping.objectives[id] : {};
  const p = isPlainObject(patch) ? patch : {};
  const pick = (field, fallback) => (hasOwn(p, field) ? p[field] : (existing[field] ?? fallback));
  const issueId = coerceId(pick('issue_id', null));
  if (issueId === null) throw new TypeError(`setEntry: objective ${id} needs a positive integer issue_id`);
  mapping.objectives[id] = {
    issue_id: issueId,
    state_comment_id: coerceId(pick('state_comment_id', null)),
    verified_at: typeof pick('verified_at', null) === 'string' ? pick('verified_at', null) : null,
  };
  return mapping;
}

module.exports = {
  MAPPING_VERSION,
  MAPPING_REL,
  toObjectiveId,
  compareIds,
  listObjectiveIndex,
  resolveObjective,
  emptyMapping,
  migrateMapping,
  normalizeSyncStateKeys,
  serializeMapping,
  readMappingV3,
  readMappingV3WithReport,
  writeMappingV3,
  getEntry,
  setEntry,
};
