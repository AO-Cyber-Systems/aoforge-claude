'use strict';

// Which objectives a milestone covers (moved from estimate-milestone.cjs in TRD 59-04: one selection for estimates and
// for `milestone complete`). A milestone's scope is the ROADMAP.md bullet this repo and templates/roadmap.md write under
// `## Milestones`:
//
//   - 🚧 **v1.5 — Gate & Plumbing** — Objectives 55–64 (in progress)
//   - ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
//
// The bullet is parsed by roadmap.cjs (parseMilestoneBullets, pickMilestone: the same reader getMilestoneInfo uses);
// this module reads only the "Objectives A–B, C" text of it. A number inside the bounds is an objective only when it has
// an objective directory or a `### Objective N:` section in ROADMAP.md; the others (killed or never created) are
// `absent`.
//
// Objective directories resolve through helpers.cjs (the objective 56 rule, TRD 68-02 / TOOL-05): a directory is the
// directory of objective N only when helpers.objectiveDirMatches(name, normalizeObjectiveName(N)) holds, which is the
// test `find-objective` applies. So `04-d` is objective 4, while an unpadded `4-d` or a hyphen-less `04x` is not.
//
// roadmap.cjs requires this module lazily (inside cmdMilestoneComplete), because this module requires roadmap.cjs.

const fs = require('fs');
const path = require('path');

const { parseMilestoneBullets, pickMilestone } = require('./roadmap.cjs');
const { getArchivedObjectiveDirs } = require('./objective.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const {
  objectiveDirMatches,
  normalizeObjectiveName,
  parseObjectiveDirName,
  canonicalObjectiveNumber,
} = require('./helpers.cjs');

// A single number or an `A–B` range (en dash, em dash or hyphen); decimals are objective numbers like 4.1.
const NUM = String.raw`\d+(?:\.\d+)?`;
const ITEM = String.raw`${NUM}(?:\s*[–—-]\s*${NUM})?`;
// The comma-separated list that follows "Objective(s)", read as a prefix: it stops at the first thing that is not part
// of the list, so "(shipped 2026-05-06)" or " — in progress" never leaks into it.
const OBJECTIVES_TEXT_RE = new RegExp(String.raw`\bObjectives?\s+(${ITEM}(?:\s*,\s*${ITEM})*)`, 'i');
const ITEM_RE = new RegExp(String.raw`^(${NUM})(?:\s*[–—-]\s*(${NUM}))?$`);
const SECTION_RE = /^#{2,4}[ \t]*Objective[ \t]+(\d+(?:\.\d+)?):[ \t]*(.+?)[ \t]*$/gim;

// A range wider than this is a typo, not a milestone; enumerating it would hang the estimate.
const MAX_RANGE_WIDTH = 1000;

const byNumber = (a, b) => parseFloat(a) - parseFloat(b);

/**
 * The objective numbers named by the trailing text of a milestone bullet: `{ranges: [[lo, hi], ...], singles: [n, ...]}`
 * in the order written, or null when the text names none ("no objectives yet", an empty bullet). Parsing stops at the
 * first `(` or other text that is not a list of numbers.
 * @param {string} rest  the bullet's `rest` (everything after the closing `**`)
 */
function milestoneObjectiveNumbers(rest) {
  const m = OBJECTIVES_TEXT_RE.exec(String(rest));
  if (!m) return null;
  const ranges = [];
  const singles = [];
  for (const item of m[1].split(',')) {
    const parts = ITEM_RE.exec(item.trim());
    if (!parts) continue;
    const lo = parseFloat(parts[1]);
    if (parts[2] === undefined) {
      singles.push(lo);
    } else {
      const hi = parseFloat(parts[2]);
      ranges.push(lo <= hi ? [lo, hi] : [hi, lo]);
    }
  }
  return ranges.length === 0 && singles.length === 0 ? null : { ranges, singles };
}

/**
 * The canonical numbers of the single (non-range) items of a bullet's "Objectives ..." text, as written: `4.10` stays
 * `'4.10'`. The float in milestoneObjectiveNumbers' `singles` cannot tell 4.10 from 4.1, so a single is matched here by
 * its text (ranges stay numeric).
 * @param {string} rest  the bullet's `rest`
 * @returns {Set<string>}
 */
function singleKeys(rest) {
  const keys = new Set();
  const m = OBJECTIVES_TEXT_RE.exec(String(rest));
  if (!m) return keys;
  for (const item of m[1].split(',')) {
    const parts = ITEM_RE.exec(item.trim());
    if (parts && parts[2] === undefined) keys.add(canonicalObjectiveNumber(parts[1]));
  }
  return keys;
}

/** True when the objective numbered `key` (canonical) is one of the exact `keys` or lies in one of `ranges` (inclusive). */
function inScope(key, { ranges }, keys) {
  const n = parseFloat(key);
  return keys.has(key) || ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

// The integers of the scope, as the numbers a reader would look for a directory or section of.
function scopeIntegers({ ranges, singles }) {
  const out = new Set();
  for (const [lo, hi] of ranges) {
    if (hi - lo > MAX_RANGE_WIDTH) throw new Error(`objective range ${lo}–${hi} in the ROADMAP.md milestone bullet is implausible`);
    for (let n = Math.ceil(lo); n <= Math.floor(hi); n++) out.add(String(n));
  }
  for (const n of singles) {
    if (Number.isInteger(n)) out.add(String(n));
  }
  return out;
}

/** `{canonical number: name}` of every `### Objective N: Name` section of a ROADMAP.md text. The first section of a number wins. */
function roadmapSections(text) {
  const sections = new Map();
  for (const m of text.matchAll(SECTION_RE)) {
    const key = canonicalObjectiveNumber(m[1]);
    if (!sections.has(key)) sections.set(key, m[2]);
  }
  return sections;
}

/** `{canonical number: {dir, slug}}` of the objective directories, current ones first and archived ones only when no current directory has the number. */
function objectiveDirectories(cwd) {
  const found = new Map();
  const add = (name, rel) => {
    const parsed = parseObjectiveDirName(name);
    if (!parsed) return;
    // parseObjectiveDirName proposes the number; objectiveDirMatches confirms it, exactly as find-objective does.
    if (!objectiveDirMatches(name, normalizeObjectiveName(parsed.number))) return;
    const key = canonicalObjectiveNumber(parsed.number);
    if (found.has(key)) return;
    found.set(key, { dir: rel.split(path.sep).join('/'), slug: parsed.slug });
  };
  const current = path.join(cwd, '.planning', 'objectives');
  let entries = [];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const e of entries.filter((d) => d.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    add(e.name, path.join('.planning', 'objectives', e.name));
  }
  for (const a of getArchivedObjectiveDirs(cwd)) add(a.name, path.join(a.basePath, a.name));
  return found;
}

// True when the objective's OBJECTIVE.md frontmatter says `status: cancelled`.
function isCancelled(cwd, dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, dir, 'OBJECTIVE.md'), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw new Error(`cannot read ${path.join(dir, 'OBJECTIVE.md')}: ${err.message}`);
  }
  const status = extractFrontmatter(text).status;
  return typeof status === 'string' && status.trim().toLowerCase() === 'cancelled';
}

/**
 * The objectives a milestone covers, in number order.
 *
 * The milestone is the one named by `version` ('v1.0' or '1.0'), else the current one (roadmap.cjs pickMilestone). Its
 * objectives come from the bullet's "Objectives A–B, C" text (`range_source: 'milestone bullet'`); when the bullet names
 * none, from every `### Objective N:` section of ROADMAP.md (`range_source: 'roadmap sections'`). A number from the
 * bullet is an objective when it has a directory or a section; the integers that have neither are returned in `absent`.
 * @param {string} cwd  project root
 * @param {{version?: string}} [opts]
 * @returns {{version:string, name:string, range_source:'milestone bullet'|'roadmap sections',
 *   objectives:{number:string, name:string, dir:?string, status_hint:'cancelled'|'no_dir'|'dir'}[], absent:string[]}}
 * @throws {Error} `ROADMAP.md not found`, `no milestone in ROADMAP.md`, `milestone <v> not in ROADMAP.md`
 */
function selectMilestoneObjectives(cwd, { version } = {}) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('ROADMAP.md not found');
    throw err;
  }

  const bullets = parseMilestoneBullets(text);
  let bullet;
  if (version === undefined || version === null || version === '') {
    bullet = pickMilestone(bullets);
    if (!bullet) throw new Error('no milestone in ROADMAP.md');
  } else {
    const digits = String(version).trim().replace(/^v/i, '');
    bullet = bullets.find((b) => b.digits === digits);
    if (!bullet) throw new Error(`milestone v${digits} not in ROADMAP.md`);
  }

  const scope = milestoneObjectiveNumbers(bullet.rest);
  const sections = roadmapSections(text);
  const dirs = objectiveDirectories(cwd);

  let candidates;
  const absent = [];
  if (scope === null) {
    candidates = [...sections.keys()];
  } else {
    const known = new Set([...sections.keys(), ...dirs.keys()]);
    const exact = singleKeys(bullet.rest);
    candidates = [...known].filter((n) => inScope(n, scope, exact));
    for (const n of scopeIntegers(scope)) {
      if (!known.has(n)) absent.push(n);
    }
  }

  const objectives = candidates.sort(byNumber).map((number) => {
    const d = dirs.get(number);
    const name = sections.get(number) || (d && d.slug) || number;
    if (!d) return { number, name, dir: null, status_hint: 'no_dir' };
    return { number, name, dir: d.dir, status_hint: isCancelled(cwd, d.dir) ? 'cancelled' : 'dir' };
  });

  return {
    version: `v${bullet.digits}`,
    name: bullet.name || 'milestone',
    range_source: scope === null ? 'roadmap sections' : 'milestone bullet',
    objectives,
    absent: [...new Set(absent)].sort(byNumber),
  };
}

// ─── Fallback scopes (TRD 59-04) ──────────────────────────────────────────────
// `milestone complete` for a version the ROADMAP.md has no bullet for, or a project with no ROADMAP.md at all. Both
// return the entry shape selectMilestoneObjectives does, in number order.

function entryFor(cwd, number, name, d) {
  if (!d) return { number, name, dir: null, status_hint: 'no_dir' };
  return { number, name, dir: d.dir, status_hint: isCancelled(cwd, d.dir) ? 'cancelled' : 'dir' };
}

/** Every `### Objective N:` section of ROADMAP.md that has an objective directory (a section alone has nothing to count); none when there is no ROADMAP.md. */
function sectionObjectives(cwd) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const sections = roadmapSections(text);
  const dirs = objectiveDirectories(cwd);
  return [...sections.keys()]
    .filter((number) => dirs.has(number))
    .sort(byNumber)
    .map((number) => entryFor(cwd, number, sections.get(number), dirs.get(number)));
}

/** Every directory under `.planning/objectives/` (archived milestones' directories are not current), named by its ROADMAP.md section when it has one, else by its slug. */
function currentDirObjectives(cwd) {
  let sections = new Map();
  try {
    sections = roadmapSections(fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const currentPrefix = '.planning/objectives/';
  const dirs = objectiveDirectories(cwd);
  return [...dirs.keys()]
    .filter((number) => dirs.get(number).dir.startsWith(currentPrefix))
    .sort(byNumber)
    .map((number) => {
      const d = dirs.get(number);
      return entryFor(cwd, number, sections.get(number) || d.slug || number, d);
    });
}

module.exports = {
  milestoneObjectiveNumbers,
  roadmapSections,
  selectMilestoneObjectives,
  sectionObjectives,
  currentDirObjectives,
};
