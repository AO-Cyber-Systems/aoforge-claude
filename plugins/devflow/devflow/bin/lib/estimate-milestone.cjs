'use strict';

// The milestone layer of the estimator (TRD 58-07, EST-03). A milestone's scope is the ROADMAP.md bullet this repo and
// templates/roadmap.md write under `## Milestones`:
//
//   - 🚧 **v1.5 — Gate & Plumbing** — Objectives 55–64 (in progress)
//   - ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
//
// The bullet is parsed by roadmap.cjs (parseMilestoneBullets, pickMilestone: the same reader getMilestoneInfo uses);
// this module reads only the "Objectives A–B, C" text of it. A number inside the bounds is an objective only when it has
// an objective directory or a `### Objective N:` section in ROADMAP.md; the others (killed or never created) are
// `absent`.
//
// A milestone estimate composes what is left of its objectives. Done and cancelled (OBJECTIVE.md `status: cancelled`)
// objectives are counted and left out; a planned or partial objective is estimated from its remaining TRDs
// (estimate-rollup.cjs estimateObjective), an objective with no TRDs, or only a ROADMAP section, from the unplanned
// fallback (estimateUnplanned). Objectives run one after another, so each metric of the total is one correlated sum of
// the objectives' fitted totals plus one integration-checker spawn, in one flat list (estimate-math: nesting a
// correlated sum inside another is not associative). Nothing is rounded here; the CLI (58-08) rounds once, at output.
//
// A milestone estimate is
//   {version, name, range_source, objectives, counts, overhead, total, confidence, weakest, notes, missing, method}
// where each of `objectives` is {number, name, dir, status, trds, total, confidence, weakest} (`total` is null for a
// done or cancelled objective, `trds` also for a cancelled one), `counts` is {done, planned, partial, unplanned,
// cancelled, absent}, `overhead` lists the integration-checker entry (estimate-rollup objectiveOverhead) and `total` is
// {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd}, each `{p50, p90}` or null (no data).

const fs = require('fs');
const path = require('path');

const em = require('./estimate-math.cjs');
const est = require('./estimate.cjs');
const rollup = require('./estimate-rollup.cjs');
const { parseMilestoneBullets, pickMilestone } = require('./roadmap.cjs');
const { getArchivedObjectiveDirs } = require('./objective.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { loadConfig } = require('./config.cjs');

// A single number or an `A–B` range (en dash, em dash or hyphen); decimals are objective numbers like 4.1.
const NUM = String.raw`\d+(?:\.\d+)?`;
const ITEM = String.raw`${NUM}(?:\s*[–—-]\s*${NUM})?`;
// The comma-separated list that follows "Objective(s)", read as a prefix: it stops at the first thing that is not part
// of the list, so "(shipped 2026-05-06)" or " — in progress" never leaks into it.
const OBJECTIVES_TEXT_RE = new RegExp(String.raw`\bObjectives?\s+(${ITEM}(?:\s*,\s*${ITEM})*)`, 'i');
const ITEM_RE = new RegExp(String.raw`^(${NUM})(?:\s*[–—-]\s*(${NUM}))?$`);
const SECTION_RE = /^#{2,4}[ \t]*Objective[ \t]+(\d+(?:\.\d+)?):[ \t]*(.+?)[ \t]*$/gim;
const DIR_RE = /^(\d+(?:\.\d+)?)-?(.*)$/;

// A range wider than this is a typo, not a milestone; enumerating it would hang the estimate.
const MAX_RANGE_WIDTH = 1000;

/** A number as written ('04', '4.1') in the one form used to compare and list objectives: no leading zeros on the integer part. */
function canonical(text) {
  const [int, dec] = String(text).split('.');
  return dec === undefined ? String(parseInt(int, 10)) : `${parseInt(int, 10)}.${dec}`;
}

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

/** True when `n` lies in one of `ranges` (inclusive) or equals one of `singles`. */
function inScope(n, { ranges, singles }) {
  return singles.includes(n) || ranges.some(([lo, hi]) => n >= lo && n <= hi);
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
    const key = canonical(m[1]);
    if (!sections.has(key)) sections.set(key, m[2]);
  }
  return sections;
}

/** `{canonical number: {dir, slug}}` of the objective directories, current ones first and archived ones only when no current directory has the number. */
function objectiveDirectories(cwd) {
  const found = new Map();
  const add = (name, rel) => {
    const m = DIR_RE.exec(name);
    if (!m) return;
    const key = canonical(m[1]);
    if (found.has(key)) return;
    found.set(key, { dir: rel.split(path.sep).join('/'), slug: m[2] || null });
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
    candidates = [...known].filter((n) => inScope(parseFloat(n), scope));
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

// ─── The estimate ─────────────────────────────────────────────────────────────

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The note that says an unplanned objective is estimated from history, not from a plan (or that there is no history). */
function unplannedNote(entry, estimate) {
  const where = entry.dir === null ? 'in the ROADMAP but has no directory yet' : 'unplanned (no TRDs)';
  const how = estimate.history === null
    ? 'no objective_level history to estimate from'
    : `estimated from ${plural(estimate.history.objectives, 'objective')} of history, not from a plan`;
  return `${entry.number} (${entry.name}): ${where}; ${how}`;
}

/**
 * Estimates what is left of a milestone: its remaining objectives plus one integration checker (see the header).
 * @param {object} cal  a loaded calibration (estimate.loadCalibration().calibration)
 * @param {string} cwd  project root
 * @param {{version?: string, parallel?: boolean}} [opts]  `version` names the milestone ('v1.0' or '1.0'; the current
 *   one when omitted); `parallel` overrides `parallelization` from `.planning/config.json` for every objective
 * @throws {Error} what selectMilestoneObjectives throws
 */
function estimateMilestone(cal, cwd, { version, parallel } = {}) {
  const selection = selectMilestoneObjectives(cwd, { version });
  const isParallel = typeof parallel === 'boolean' ? parallel : loadConfig(cwd).parallelization !== false;

  const counts = { done: 0, planned: 0, partial: 0, unplanned: 0, cancelled: 0, absent: selection.absent.length };
  const objectives = [];
  const remaining = []; // the entries that still cost something, with the estimate behind each
  const notes = [];
  const missing = [];

  for (const o of selection.objectives) {
    if (o.status_hint === 'cancelled') {
      counts.cancelled += 1;
      objectives.push({ number: o.number, name: o.name, dir: o.dir, status: 'cancelled', trds: null, total: null, confidence: 'n/a', weakest: null });
      continue;
    }
    // An objective with no directory is a section only: it has nothing to read TRDs from, so it goes straight to the
    // unplanned fallback (estimateObjective throws for it).
    const estimate = o.status_hint === 'no_dir'
      ? rollup.estimateUnplanned(cal, { objective: o.number, name: o.name, dir: null, parallel: isParallel })
      : rollup.estimateObjective(cal, cwd, o.number, { parallel: isParallel });
    counts[estimate.status] += 1;
    const entry = {
      number: o.number,
      name: estimate.name,
      dir: estimate.dir,
      status: estimate.status,
      trds: estimate.trds,
      total: estimate.status === 'done' ? null : estimate.total,
      confidence: estimate.confidence,
      weakest: estimate.weakest,
    };
    objectives.push(entry);
    if (estimate.status === 'done') continue;

    remaining.push({ entry, estimate });
    if (estimate.status === 'unplanned') notes.push(unplannedNote(entry, estimate));
    for (const m of estimate.missing) missing.push(`${entry.number}: ${m}`);
  }

  let overhead = [];
  let total = rollup.zeroTotals();
  let verdict = { confidence: 'n/a', weakest: null };

  if (remaining.length === 0) {
    notes.unshift('no objectives left');
  } else {
    // One integration checker audits the milestone after its last objective.
    const agent = rollup.objectiveOverhead(cal, ['integration-checker']);
    overhead = agent.entries;
    missing.push(...agent.missing);

    total = {};
    for (const key of rollup.TOTAL_KEYS) {
      const parts = remaining.map(({ entry }) => em.fitQuantiles(entry.total[key]));
      for (const e of overhead) parts.push(rollup.entryDist(e, key));
      total[key] = rollup.stat(em.sumCorrelated(parts));
    }

    const components = remaining.map(({ entry }) => ({
      name: entry.number,
      label: entry.confidence,
      p50: entry.total.wall_minutes === null ? null : entry.total.wall_minutes.p50,
      status: entry.status,
    }));
    for (const e of overhead) components.push(rollup.overheadComponent(e));
    verdict = est.overallConfidence(components);
    if (agent.missing.length > 0) {
      verdict = rollup.capAt(verdict, 'low', { name: 'agent overhead (no data for integration-checker)', label: 'low', p50: null });
    }
  }

  if (selection.absent.length > 0) {
    notes.push(`${plural(selection.absent.length, 'number')} in the milestone range have no objective directory or ROADMAP section (killed or never created): ${selection.absent.join(', ')}`);
  }

  return {
    version: selection.version,
    name: selection.name,
    range_source: selection.range_source,
    objectives,
    counts,
    overhead,
    total,
    confidence: verdict.confidence,
    weakest: verdict.weakest,
    notes,
    missing,
    method: rollup.METHOD,
  };
}

module.exports = {
  milestoneObjectiveNumbers,
  selectMilestoneObjectives,
  estimateMilestone,
};
