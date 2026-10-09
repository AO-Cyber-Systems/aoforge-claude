'use strict';

// gh-backfill.cjs (TRD 51-03, GMD-01 / GMD-02) — the pure core of the GitHub backfill (objective 51).
//
//   parseProgress / progressStateOf   the ROADMAP `## Progress` table: which rows say Complete or Cancelled
//   historyOf(root)                   every objective: shipped | cancelled | open, every TRD: done | deferred |
//                                     cancelled | open, from local files only
//   historyOps(root, ids)             `patch-issue` close ops for finished work, so the backfill closes the
//                                     issues of shipped history instead of opening them (gap G1)
//   COST / estimate / renderEstimate  an upper-bound request estimate, priced before any write (gap G3)
//   hasPendingOps(root)               resume detection: pending / blocked / halted ops in the outbox journal
//   recordLiveWrites(root, n, now)    book writes made outside the outbox into the budget window (gap G5)
//
// Nothing here calls gh or git, and nothing is enqueued or flushed: the callers (planImport in 51-05, migration
// 0011 in 51-06/07) own queuing. The one write is recordLiveWrites' journal update. TRD and objective ids are derived exactly as gh-hierarchy's push derives them
// (`readObjectiveTrds` + `findSummaries`), so every close op targets an issue the hierarchy creates.

const fs = require('fs');
const path = require('path');

const { extractFrontmatter } = require('./frontmatter.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const outbox = require('./gh-outbox.cjs');
const planningMode = require('./planning-mode.cjs');
const { planningRoot } = require('./compat.cjs');

// ─── small helpers ───────────────────────────────────────────────────────────

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readFrontmatter(file) {
  const text = readText(file);
  if (text === null) return {};
  try {
    return extractFrontmatter(text) || {};
  } catch {
    return {};
  }
}

/** Markdown emphasis and code ticks stripped, trimmed: `**Complete**` -> `Complete`. */
const plain = (s) => String(s === undefined || s === null ? '' : s).replace(/[*_`]/g, '').trim();

// ─── the ROADMAP Progress table ──────────────────────────────────────────────

const NUM = '\\d+(?:\\.\\d+)?';
// `42. Name`, `2.1. Name`, `Objective 42: Name`.
const NAME_CELL_RE = new RegExp(`^(?:objective\\s+)?(${NUM})[.:]\\s+\\S`, 'i');
// `27–41` with an en dash, an em dash or a hyphen.
const RANGE_RE = new RegExp(`^(${NUM})\\s*[\\u2013\\u2014-]\\s*(${NUM})$`);
const SINGLE_RE = new RegExp(`^(${NUM})$`);
/** A range wider than this is still honoured by `progressStateOf`, it is just not listed in `ids`. */
const MAX_EXPAND = 1000;

/** The cells of a markdown table row, or null when the line is not one. */
function tableCells(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const isSeparatorRow = (cells) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));

/**
 * The objectives a Progress first cell names: `{exact, ranges}`, or null when the cell is none of the shapes.
 *   `42. Name`                          -> exact ['42']
 *   `27–41 (15 objectives)`             -> ranges [[27, 41]]
 *   `0–9, 6, 8, 24 (13 objectives)`     -> ranges [[0, 9]], exact ['6', '8', '24']
 */
function parseObjectiveCell(cell) {
  const c = plain(cell);
  const named = NAME_CELL_RE.exec(c);
  if (named) {
    const id = ghMapping.toObjectiveId(named[1]);
    return id === null ? null : { exact: [id], ranges: [] };
  }
  const list = c.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (list === '') return null;
  const exact = [];
  const ranges = [];
  for (const token of list.split(',').map((s) => s.trim())) {
    const range = RANGE_RE.exec(token);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (!(lo <= hi)) return null;
      ranges.push([lo, hi]);
      continue;
    }
    const single = SINGLE_RE.exec(token);
    if (!single) return null;
    const id = ghMapping.toObjectiveId(single[1]);
    if (id === null) return null;
    if (!exact.includes(id)) exact.push(id);
  }
  return { exact, ranges };
}

/** `complete` | `cancelled` | null for a Progress status cell (`Complete (27-03 deferred)`, `✅ Complete`, ...). */
function statusState(cell) {
  const s = plain(cell).replace(/^[^A-Za-z]+/, '');
  if (/^complete/i.test(s)) return 'complete';
  if (/^cancell?ed/i.test(s)) return 'cancelled';
  return null;
}

/** The integer ids of the ranges (each capped at MAX_EXPAND) plus the exact ids, deduped, in id order. */
function listedIds(exact, ranges) {
  const ids = new Set(exact);
  for (const [lo, hi] of ranges) {
    const from = Math.ceil(lo);
    const to = Math.floor(hi);
    if (to - from > MAX_EXPAND) continue;
    for (let n = from; n <= to; n++) ids.add(String(n));
  }
  return [...ids].sort(ghMapping.compareIds);
}

/** The body lines of every `## Progress` section, outside code fences. */
function progressSections(text) {
  const sections = [];
  let current = null;
  let fenced = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^#{1,2}\s/.test(line)) {
      current = /^##\s+Progress\b/i.test(line) ? [] : null;
      if (current) sections.push(current);
      continue;
    }
    if (current) current.push(line);
  }
  return sections;
}

/**
 * parseProgress(roadmapText) — the rows of the ROADMAP `## Progress` table(s), in table order:
 *
 *   [{cell, status, state: 'complete'|'cancelled'|null, ids, exact, ranges}]
 *
 * `cell` is the first cell as written; `ids` the objectives it names (ranges expanded); `exact` the ones named
 * one by one; `ranges` the `[lo, hi]` pairs. Only a table whose header has a `Status` column is read; a row whose
 * first cell is none of the three shapes is skipped. Total: any input (null, no table) returns `[]`.
 */
function parseProgress(roadmapText) {
  if (typeof roadmapText !== 'string' || roadmapText === '') return [];
  const rows = [];
  for (const lines of progressSections(roadmapText)) {
    let statusIdx = -1;
    for (const line of lines) {
      const cells = tableCells(line);
      if (!cells) {
        statusIdx = -1; // a table ends at its first non-row line
        continue;
      }
      if (isSeparatorRow(cells)) continue;
      const header = cells.findIndex((c) => /^status$/i.test(plain(c)));
      if (header !== -1) {
        statusIdx = header;
        continue;
      }
      if (statusIdx === -1) continue;
      const parsed = parseObjectiveCell(cells[0]);
      if (!parsed) continue;
      const status = cells[statusIdx] === undefined ? '' : cells[statusIdx];
      rows.push({
        cell: cells[0],
        status,
        state: statusState(status),
        ids: listedIds(parsed.exact, parsed.ranges),
        exact: parsed.exact,
        ranges: parsed.ranges,
      });
    }
  }
  return rows;
}

/** 'exact' when the row names `id` one by one, 'range' when one of its ranges covers it, else null. */
function coverage(row, id) {
  if (row.exact.includes(id)) return 'exact';
  const v = Number(id);
  if (!Number.isFinite(v)) return null;
  // `0–9` covers 9.1 too: an integer upper bound takes in that objective's decimal inserts.
  const inRange = row.ranges.some(([lo, hi]) => v >= lo && (Number.isInteger(hi) ? v < hi + 1 : v <= hi));
  return inRange ? 'range' : null;
}

/**
 * progressStateOf(rows, objective) — `complete` | `cancelled` | null for any spelling of an objective. A row that
 * names the objective one by one beats a range row; among equals the later row (the newer entry) wins.
 */
function progressStateOf(rows, objectiveArg) {
  const id = ghMapping.toObjectiveId(objectiveArg);
  if (id === null || !Array.isArray(rows)) return null;
  let exact = null;
  let range = null;
  for (const row of rows) {
    const c = coverage(row, id);
    if (c === 'exact') exact = row;
    else if (c === 'range') range = row;
  }
  const hit = exact || range;
  return hit ? hit.state : null;
}

// ─── historyOf ───────────────────────────────────────────────────────────────

const COMPLETE_STATUSES = new Set(['complete', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

/**
 * The state of one objective and what decided it. An explicit OBJECTIVE.md status wins (`reopened` is an explicit
 * open: a stale Complete row must not close it again), then the Progress row, then "every TRD has a SUMMARY".
 */
function classifyObjective(rawStatus, progressState, trds) {
  const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  if (CANCELLED_STATUSES.has(status)) return { state: 'cancelled', source: 'frontmatter' };
  if (COMPLETE_STATUSES.has(status)) return { state: 'shipped', source: 'frontmatter' };
  if (status === 'reopened') return { state: 'open', source: 'frontmatter' };
  if (progressState === 'cancelled') return { state: 'cancelled', source: 'progress' };
  if (progressState === 'complete') return { state: 'shipped', source: 'progress' };
  if (trds.length > 0 && trds.every((t) => t.summary !== null)) return { state: 'shipped', source: 'summaries' };
  return { state: 'open', source: null };
}

function trdState(summary, objectiveState) {
  if (summary !== null) return 'done';
  if (objectiveState === 'shipped') return 'deferred';
  if (objectiveState === 'cancelled') return 'cancelled';
  return 'open';
}

/** `[{id, file, summary}]` for one objective, paired exactly as a hierarchy push pairs them. */
function objectiveTrds(root, entry, warnings) {
  if (!entry.dir) return [];
  let trds;
  try {
    trds = ghHierarchy.readObjectiveTrds(root, entry.id, { warnings });
  } catch (e) {
    warnings.push(`objective ${entry.id}: ${e.message}`);
    return [];
  }
  const base = path.join(planningRoot(root), 'objectives', entry.dir);
  const summaries = new Map(ghHierarchy.findSummaries(base, trds, warnings).map((s) => [s.trdId, s.file]));
  return trds.map((t) => ({ id: t.id, file: t.file, summary: summaries.has(t.id) ? summaries.get(t.id) : null }));
}

/**
 * historyOf(root) — the local history of every objective the project knows (ROADMAP headers and directories,
 * `ghMapping.listObjectiveIndex`), from local files only:
 *
 *   {objectives: [{id, dir, state: 'shipped'|'cancelled'|'open', source: 'frontmatter'|'progress'|'summaries'|null,
 *                  trds: [{id, file, summary, state: 'done'|'deferred'|'cancelled'|'open'}]}],
 *    warnings: [string]}
 *
 * Shipped: OBJECTIVE.md `status: complete`, a Progress row covering it whose status starts `Complete`, or >= 1 TRD
 * and every TRD summarised. Cancelled: `status: cancelled` or a `Cancelled` Progress row. A TRD is done when it has
 * a SUMMARY, deferred when it has none in a shipped objective, cancelled when it has none in a cancelled one.
 * A file the hierarchy would skip (a legacy name such as `10-04a-...-TRD.md`) is skipped here with a warning.
 */
function historyOf(root) {
  const warnings = [];
  const rows = parseProgress(readText(path.join(planningRoot(root), 'ROADMAP.md')));
  let index;
  try {
    index = ghMapping.listObjectiveIndex(root);
  } catch (e) {
    warnings.push(`objective index: ${e.message}`);
    index = [];
  }
  const objectives = [];
  for (const entry of index) {
    const trds = objectiveTrds(root, entry, warnings);
    const fm = entry.dir ? readFrontmatter(path.join(planningRoot(root), 'objectives', entry.dir, 'OBJECTIVE.md')) : {};
    const { state, source } = classifyObjective(fm.status, progressStateOf(rows, entry.id), trds);
    objectives.push({
      id: entry.id,
      dir: entry.dir,
      state,
      source,
      trds: trds.map((t) => ({ ...t, state: trdState(t.summary, state) })),
    });
  }
  return { objectives, warnings };
}

// ─── historyOps ──────────────────────────────────────────────────────────────

const TRD_CLOSE = Object.freeze({ done: 'completed', deferred: 'not_planned', cancelled: 'not_planned' });
const OBJECTIVE_CLOSE = Object.freeze({ shipped: 'completed', cancelled: 'not_planned' });

const closeOp = (id, reason) => ({ kind: 'patch-issue', target: { id }, payload: { state: 'closed', state_reason: reason } });

/**
 * historyOps(root, ids, {history}) — the `patch-issue` ops that close finished work, in order: objectives by id,
 * each objective's TRD ops (by id) before its own op.
 *
 *   done TRD -> completed            deferred TRD, cancelled objective's un-summarised TRD -> not_planned
 *   shipped objective -> completed   cancelled objective -> not_planned        open work -> no op
 *
 * `ids` selects objectives (any spelling); omitted or null means every objective. Pass the objectives whose
 * hierarchy is queued: a close op for an issue that is never created has nothing to patch. `history` reuses a
 * `historyOf(root)` result. The op target is `{id}`, the only target `outbox.validateOp` accepts for patch-issue.
 */
function historyOps(root, ids, opts = {}) {
  const history = opts && opts.history ? opts.history : historyOf(root);
  const wanted = ids === undefined || ids === null
    ? null
    : new Set((Array.isArray(ids) ? ids : [ids]).map((x) => ghMapping.toObjectiveId(x)).filter((x) => x !== null));
  const ops = [];
  for (const o of history.objectives) {
    if (wanted && !wanted.has(o.id)) continue;
    for (const t of o.trds) {
      if (Object.hasOwn(TRD_CLOSE, t.state)) ops.push(closeOp(t.id, TRD_CLOSE[t.state]));
    }
    if (Object.hasOwn(OBJECTIVE_CLOSE, o.state)) ops.push(closeOp(o.id, OBJECTIVE_CLOSE[o.state]));
  }
  return ops;
}

// ─── estimate (G3) ───────────────────────────────────────────────────────────

/**
 * GitHub writes per op, UPPER bounds (any doubt takes the higher cost). `upsert-issue` is a create plus one
 * amortised label/milestone ensure; `set-fields` is one write per field in `payload.values` (4 when it cannot tell);
 * `wiki-push` is git, not the API; `milestone` is a native milestone put (it writes directly, not through the
 * outbox); `live-create` is a `gh.syncObjective` for an unmapped objective; `unknown` prices every kind not listed
 * here; `read` is reads per op (informational, never paced). 51-05's calibration test pins this table.
 */
const COST = Object.freeze({
  'upsert-issue': 2,
  'link-sub-issue': 1,
  block: 1,
  'upsert-comment': 1,
  'patch-issue': 1,
  'patch-body': 1,
  'set-fields': 4,
  'wiki-push': 0,
  milestone: 2,
  'live-create': 3,
  unknown: 2,
  read: 2,
});

/** The op kinds the table prices; the pseudo-entries `unknown` and `read` are not kinds. */
const PRICED = new Set(Object.keys(COST).filter((k) => k !== 'unknown' && k !== 'read'));
const INVALID_KIND = '(invalid)';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** A count from caller input: a positive finite number rounded UP (an upper bound), anything else 0. */
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : 0);

/** `{kind, writes, unknown}` of one planned op. */
function priceOp(op) {
  if (!isObject(op) || typeof op.kind !== 'string' || op.kind === '') return { kind: INVALID_KIND, writes: COST.unknown, unknown: true };
  if (op.kind === 'set-fields') {
    const values = isObject(op.payload) && isObject(op.payload.values) ? Object.keys(op.payload.values).length : 0;
    return { kind: op.kind, writes: values > 0 ? values : COST['set-fields'], unknown: false };
  }
  if (PRICED.has(op.kind)) return { kind: op.kind, writes: COST[op.kind], unknown: false };
  return { kind: op.kind, writes: COST.unknown, unknown: true };
}

/**
 * estimate({ops, live_creates, wiki_pushes, milestones}) — an honest upper bound of what a backfill costs, before
 * any write. Pure and total: junk input prices as zero, the input is never mutated, it never throws. A bare array
 * is taken as `ops`.
 *
 *   {ops, writes_max, reads_approx, minutes_min, hour_windows, hours_min, by_kind, writes_by_kind,
 *    live_creates, wiki_pushes, milestones, unknown_kinds}
 *
 * Pacing comes from `outbox.BUDGET` (writes per minute and per hour): `minutes_min = ceil(writes / minute)`,
 * `hour_windows = ceil(writes / hour)`, `hours_min = hour_windows - 1` full hourly waits (never below 0).
 */
function estimate(input) {
  const src = Array.isArray(input) ? { ops: input } : isObject(input) ? input : {};
  const list = Array.isArray(src.ops) ? src.ops : [];
  const extras = { 'live-create': count(src.live_creates), 'wiki-push': count(src.wiki_pushes), milestone: count(src.milestones) };

  const byKind = {};
  const writesByKind = {};
  const unknown = new Set();
  const add = (kind, n, writes) => {
    byKind[kind] = (byKind[kind] || 0) + n;
    writesByKind[kind] = (writesByKind[kind] || 0) + writes;
  };
  for (const op of list) {
    const p = priceOp(op);
    if (p.unknown) unknown.add(p.kind);
    add(p.kind, 1, p.writes);
  }
  for (const [kind, n] of Object.entries(extras)) if (n > 0) add(kind, n, n * COST[kind]);

  const ops = Object.values(byKind).reduce((a, b) => a + b, 0);
  const writesMax = Object.values(writesByKind).reduce((a, b) => a + b, 0);
  const hourWindows = Math.ceil(writesMax / outbox.BUDGET.hour);
  return {
    ops,
    writes_max: writesMax,
    reads_approx: ops * COST.read,
    minutes_min: Math.ceil(writesMax / outbox.BUDGET.minute),
    hour_windows: hourWindows,
    hours_min: Math.max(0, hourWindows - 1),
    by_kind: byKind,
    writes_by_kind: writesByKind,
    live_creates: extras['live-create'],
    wiki_pushes: extras['wiki-push'],
    milestones: extras.milestone,
    unknown_kinds: [...unknown].sort(),
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * renderEstimate(e) — the estimate as one line, e.g.
 *   `~540 writes (upper bound) in 612 ops; at 80/min and 450/h at least 1 h of hourly-budget waits`
 * Total: anything that is not an estimate renders as the empty estimate.
 */
function renderEstimate(e) {
  const est = isObject(e) && typeof e.writes_max === 'number' ? e : estimate({});
  const head = `~${est.writes_max} writes (upper bound) in ${est.ops} ops`;
  const pace = `at ${outbox.BUDGET.minute}/min and ${outbox.BUDGET.hour}/h`;
  let tail;
  if (est.writes_max === 0) tail = 'nothing to pace';
  else if (est.hours_min > 0) tail = `${pace} at least ${est.hours_min} h of hourly-budget waits`;
  else tail = `${pace} at least ${est.minutes_min} min, within one hourly budget`;
  const kinds = Array.isArray(est.unknown_kinds) ? est.unknown_kinds : [];
  let line = `${head}; ${tail}`;
  if (kinds.length > 0) {
    const n = kinds.reduce((a, k) => a + ((est.by_kind && est.by_kind[k]) || 0), 0);
    line += `; ${plural(n, 'op')} of unknown kind (${kinds.join(', ')}) priced at ${COST.unknown} writes each`;
  }
  return line;
}

// ─── journal helpers (resume detection, G5 budget bookkeeping) ───────────────

/** The journal belongs to the MAIN checkout (D-14): a worktree shares its main checkout's queue. */
function journalRoot(root) {
  return planningMode.resolveMainRoot(root) || root;
}

/**
 * hasPendingOps(root, opts) — `{pending, blocked, halted, any}` from the outbox journal, without a gh call. `halted`
 * is 1 when the queue is halted (a stored halt, or a blocked op at its head, as `gh outbox status` reports it) else
 * 0. A missing journal is all zeros and is not created. `opts` is passed to the outbox (`env`, `home`, `now`).
 */
function hasPendingOps(root, opts = {}) {
  const s = outbox.status(journalRoot(root), opts);
  const halted = s.halted ? 1 : 0;
  return { pending: s.pending, blocked: s.blocked, halted, any: s.pending + s.blocked + halted > 0 };
}

/**
 * recordLiveWrites(root, n, now, opts) — book `n` GitHub writes made OUTSIDE the outbox (live objective creates,
 * milestone puts) into the journal's budget window at `now`, so the flusher paces the rest of the backfill around
 * them (G5). Read, `outbox.recordWrite` x n, `outbox.writeJournal`. `n <= 0` (or not a number) writes nothing.
 * Call it outside a flush: the flusher holds the journal while it drains.
 *
 * @returns {{ok:true, recorded:number, path?:string}}
 */
function recordLiveWrites(root, n, now = Date.now(), opts = {}) {
  const writes = count(n);
  if (writes === 0) return { ok: true, recorded: 0 };
  const main = journalRoot(root);
  const at = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  const { journal } = outbox.readJournal(main, { ...opts, now: at });
  for (let i = 0; i < writes; i++) outbox.recordWrite(journal, at);
  const file = outbox.writeJournal(main, journal, opts);
  return { ok: true, recorded: writes, path: file };
}

module.exports = {
  parseProgress,
  progressStateOf,
  historyOf,
  historyOps,
  COST,
  estimate,
  renderEstimate,
  hasPendingOps,
  recordLiveWrites,
};
