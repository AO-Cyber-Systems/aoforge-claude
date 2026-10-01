'use strict';

// gh-hierarchy.cjs (TRD 47-09, GST-01 / GST-02) — turn ONE local objective into the ordered outbox ops that
// build its GitHub hierarchy:
//
//   Objective issue (type + fields, or labels + a `meta` section)
//     -> TRD sub-issues (one issue per TRD file, body = the 47-01 encoding of the file)
//          -> blocked-by edges (from `depends_on`, else from wave order)
//          -> SUMMARY comments, the objective's VERIFICATION comment
//     -> the reference pages (wiki, or docs/devflow/ when the wiki is disabled)
//     -> ONE `patch-body` of the objective (criteria with preserved ticks + derived wiki/trds/meta sections)
//
// Nothing here writes to GitHub. Every write is an outbox op (47-03) that the flusher (47-07) applies, so a
// push made offline is replayable and mode-independent: the flusher applies native types/fields or falls
// back to labels/meta per the capabilities it detects. Reads of GitHub are limited to capability detection
// and the orphan report.
//
// Layout of this file: pure planning (no gh, no outbox) first, then `pushHierarchy`, then the Decision and
// orphan helpers. The budget check (60,000 characters per TRD body, 100 TRDs per objective) runs inside
// `planPush`, so an oversized TRD refuses the WHOLE objective before the first op is queued (SC2).
//
// Objective-issue creation is NOT done here: 46's `findOrCreateObjectiveIssue` owns it (two create paths
// caused 46's duplicate-issue bugs), so the objective must already be in the mapping.

const fs = require('fs');
const path = require('path');

const { extractFrontmatter } = require('./frontmatter.cjs');
const client = require('./gh-client.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghWiki = require('./gh-wiki.cjs');
const ghMilestone = require('./gh-milestone.cjs');
const ghComments = require('./gh-comments.cjs');
const ghCapability = require('./gh-capability.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');

// ─── Small helpers ───────────────────────────────────────────────────────────

const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fmtNumber = (n) => n.toLocaleString('en-US');

/** `7-01` -> `07-01`, `2.1-03-d1` -> `02.1-03-d1`: the display form used in issue titles and messages. */
function padId(id) {
  return String(id).replace(/^\d+/, (m) => m.padStart(2, '0'));
}

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

const nonEmpty = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

// ─── Objective and TRD discovery ─────────────────────────────────────────────

// `07-01-alpha-TRD.md` -> prefix `07-01`, slug `alpha`; `07-01-TRD.md` has no slug. A letter suffix such as
// `10-04a` is not a TRD id (gh-mapping's id form is strict), so that file is skipped with a warning.
const TRD_FILE_RE = /^(\d+(?:\.\d+)?-\d+)(?:-(.*))?-TRD\.md$/;

/** `{prefix, slug}` of a TRD file name, or null when it is not one. */
function parseTrdFile(file) {
  const m = TRD_FILE_RE.exec(file);
  return m ? { prefix: m[1], slug: m[2] || '' } : null;
}

/** `{id, dir}` of an objective that has a directory; throws naming the objective otherwise. */
function resolveObjectiveDir(root, objectiveArg) {
  const resolved = ghMapping.resolveObjective(root, objectiveArg);
  const label = String(objectiveArg === undefined ? null : objectiveArg).trim();
  if (!resolved) throw new Error(`objective ${label} is not known (no ROADMAP entry or directory under .planning/objectives)`);
  if (!resolved.dir) throw new Error(`objective ${resolved.id} has no directory under .planning/objectives yet`);
  return { id: resolved.id, dir: resolved.dir };
}

/**
 * A dependency entry as written in `depends_on` -> canonical TRD id, or null. Accepts `07-01` and the slug
 * form `07-01-alpha` (also a `...-TRD.md` file name); the `-NN` part must end the number.
 */
function normaliseDependency(raw) {
  const m = /^(\d+(?:\.\d+)?-\d+)(?=$|-)/.exec(String(raw === undefined || raw === null ? '' : raw).trim());
  return m ? ghMapping.toTrdId(m[1]) : null;
}

function dependencyList(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * readObjectiveTrds(root, objectiveArg, {warnings}) — the TRD files of an objective, `[{id, file, text, wave,
 * depends_on}]` sorted by id. `text` is the file exactly as written (never trimmed). `depends_on` holds
 * canonical TRD ids. Files that are not TRDs of THIS objective, or whose `depends_on` entries are not TRD
 * ids, are skipped with a message pushed onto `warnings`. Throws for an unknown objective.
 */
function readObjectiveTrds(root, objectiveArg, { warnings = [] } = {}) {
  const { id: objectiveId, dir } = resolveObjectiveDir(root, objectiveArg);
  const base = path.join(root, '.planning', 'objectives', dir);
  const out = [];
  for (const file of listFiles(base)) {
    if (!file.endsWith('-TRD.md')) continue;
    const parts = parseTrdFile(file);
    const id = parts ? ghMapping.toTrdId(parts.prefix) : null;
    if (id === null) {
      warnings.push(`${file}: not a TRD file name (expected <objective>-<NN>-<slug>-TRD.md); skipped`);
      continue;
    }
    if (ghMapping.toObjectiveId(id.replace(/-\d+$/, '')) !== objectiveId) {
      warnings.push(`${file}: belongs to another objective than ${objectiveId}; skipped`);
      continue;
    }
    const text = fs.readFileSync(path.join(base, file), 'utf8');
    let fm = {};
    try {
      fm = extractFrontmatter(text) || {};
    } catch {
      fm = {};
    }
    let wave = parseInt(String(fm.wave === undefined ? '1' : fm.wave), 10);
    if (!Number.isInteger(wave) || wave < 1) {
      warnings.push(`${file}: wave ${JSON.stringify(fm.wave)} is not a positive integer; treated as wave 1`);
      wave = 1;
    }
    const dependsOn = [];
    for (const raw of dependencyList(fm.depends_on)) {
      const dep = normaliseDependency(raw);
      if (dep === null) warnings.push(`${file}: depends_on entry ${JSON.stringify(raw)} is not a TRD id; ignored`);
      else if (!dependsOn.includes(dep)) dependsOn.push(dep);
    }
    out.push({ id, file, text, wave, depends_on: dependsOn });
  }
  return out.sort((a, b) => natural(a.id, b.id));
}

// ─── Wave edges ──────────────────────────────────────────────────────────────

/**
 * waveEdges(trds, {warnings}) — the blocked-by edges `[{blocker, blocked}]` of an objective (D-16).
 *
 * One edge per `depends_on` id (`07-01` and `07-01-alpha` both normalise to the canonical id). A TRD in wave
 * N > 1 with an EMPTY `depends_on` is blocked by every TRD of the nearest lower wave. A dependency on a TRD
 * that is not in `trds` (another objective, or a typo) is ignored with a message pushed onto `warnings`.
 * A cycle throws an Error (code `CYCLE`) naming the TRDs on it. Sorted by blocked, then blocker.
 */
function waveEdges(trds, { warnings = [] } = {}) {
  const list = Array.isArray(trds) ? trds : [];
  const ids = new Set(list.map((t) => t.id));
  const waves = [...new Set(list.map((t) => t.wave))].sort((a, b) => a - b);
  const idsOfWave = new Map(waves.map((w) => [w, list.filter((t) => t.wave === w).map((t) => t.id)]));

  const edges = new Map();
  const add = (blocker, blocked) => edges.set(`${blocker}\u0000${blocked}`, { blocker, blocked });

  for (const t of list) {
    const declared = dependencyList(t.depends_on);
    if (declared.length === 0) {
      const lower = waves.filter((w) => w < t.wave);
      if (lower.length > 0) {
        for (const blocker of idsOfWave.get(lower[lower.length - 1])) add(blocker, t.id);
      }
      continue;
    }
    for (const raw of declared) {
      const dep = normaliseDependency(raw);
      if (dep === null || !ids.has(dep)) {
        warnings.push(`${t.id} depends on ${JSON.stringify(raw)}, which is not a TRD of this objective; no blocked-by edge`);
        continue;
      }
      add(dep, t.id);
    }
  }

  const sorted = [...edges.values()].sort((a, b) => natural(a.blocked, b.blocked) || natural(a.blocker, b.blocker));

  // Peel every TRD that blocks nothing still in the set, and every TRD blocked by nothing still in the set,
  // until stable: what is left lies on a cycle.
  const rest = new Set(sorted.flatMap((e) => [e.blocker, e.blocked]));
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...rest]) {
      const blocksSomething = sorted.some((e) => e.blocker === id && rest.has(e.blocked));
      const isBlocked = sorted.some((e) => e.blocked === id && rest.has(e.blocker));
      if (!blocksSomething || !isBlocked) {
        rest.delete(id);
        changed = true;
      }
    }
  }
  if (rest.size > 0) {
    const err = new Error(`dependency cycle among TRDs: ${[...rest].sort(natural).join(', ')}`);
    err.code = 'CYCLE';
    throw err;
  }
  return sorted;
}

// ─── Reference pages ─────────────────────────────────────────────────────────

/**
 * REFERENCE_PAGES(root, dir) — the `.planning/`-relative cache files an objective push publishes as pages:
 * `PROJECT.md`, `REQUIREMENTS.md`, `codebase/*.md`, then the objective's `OBJECTIVE.md`, `*CONTEXT.md` and
 * `*RESEARCH.md`. Only files that exist AND map to a wiki page (gh-wiki's page table) are named. The
 * `Roadmap` page is rendered from issues after a flush (47-10 / 47-12), never from here.
 */
function REFERENCE_PAGES(root, dir) {
  const planning = path.join(root, '.planning');
  const out = [];
  const add = (rel) => {
    if (ghWiki.pageForCachePath(rel) !== null && fs.existsSync(path.join(planning, ...rel.split('/')))) out.push(rel);
  };
  add('PROJECT.md');
  add('REQUIREMENTS.md');
  for (const f of listFiles(path.join(planning, 'codebase'))) if (f.endsWith('.md')) add(`codebase/${f}`);
  const rel = `objectives/${dir}`;
  add(`${rel}/OBJECTIVE.md`);
  for (const f of listFiles(path.join(planning, 'objectives', dir))) if (f !== 'OBJECTIVE.md') add(`${rel}/${f}`);
  return out;
}

// ─── planPush ────────────────────────────────────────────────────────────────

const DEFAULT_LABELS = Object.freeze({ trd: 'devflow:trd', decision: 'devflow:decision' });

function configuredLabels(root) {
  const cfg = client.readConfig(root);
  const gh = cfg && isObject(cfg.github) ? cfg.github : {};
  const labels = isObject(gh.labels) ? gh.labels : {};
  return {
    trd: nonEmpty(labels.trd) || DEFAULT_LABELS.trd,
    decision: nonEmpty(labels.decision) || DEFAULT_LABELS.decision,
  };
}

function configuredMilestonePrefix(root) {
  const cfg = client.readConfig(root);
  const gh = cfg && isObject(cfg.github) ? cfg.github : {};
  return gh.milestone_prefix || 'v';
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The SUMMARY files of every TRD: `<prefix>-SUMMARY.md` or `<prefix>-<slug>-SUMMARY.md`. */
function findSummaries(base, trds, warnings) {
  const files = listFiles(base);
  const out = [];
  for (const t of trds) {
    const parts = parseTrdFile(t.file);
    if (!parts) continue;
    const re = new RegExp(`^${escapeRe(parts.prefix)}-(?:.*-)?SUMMARY\\.md$`);
    const hits = files.filter((f) => re.test(f));
    if (hits.length === 0) continue;
    if (hits.length > 1) warnings.push(`${t.id}: ${hits.length} SUMMARY files (${hits.join(', ')}); pushing ${hits[0]}`);
    const text = readText(path.join(base, hits[0]));
    if (text !== null) out.push({ trdId: t.id, file: hits[0], text });
  }
  return out;
}

/** The objective-level VERIFICATION file (`VERIFICATION.md` or `<NN>-VERIFICATION.md`), or null. */
function findVerification(base, warnings) {
  const hits = listFiles(base).filter((f) => /^(?:\d+(?:\.\d+)?-)?VERIFICATION\.md$/.test(f));
  if (hits.length === 0) return null;
  if (hits.length > 1) warnings.push(`${hits.length} VERIFICATION files (${hits.join(', ')}); pushing ${hits[0]}`);
  const text = readText(path.join(base, hits[0]));
  return text === null ? null : { file: hits[0], text };
}

/**
 * planPush(root, objectiveArg) — everything a push needs, from local files only (no gh, no outbox).
 *
 * -> {ok:true, objective:{id, dir}, trds, edges, warn:[{id,chars}], warnings:[string], summaries, verification,
 *     pages, work, kind, milestone_title, labels}
 *  | {ok:false, refused:'budget', over:[{id,chars}], invalid:[{id,error}], message}   (nothing may be queued)
 *  | {ok:false, refused:'cycle', error}
 *  | {ok:false, error}                                                                an unknown objective
 *
 * The budget gate is `gh-trd.checkObjectiveBudgets` over every TRD at once: it names EVERY offender (not just
 * the first) and also enforces the 100-TRD limit.
 */
function planPush(root, objectiveArg) {
  const warnings = [];
  let target;
  let trds;
  try {
    target = resolveObjectiveDir(root, objectiveArg);
    trds = readObjectiveTrds(root, target.id, { warnings });
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const check = ghTrd.checkObjectiveBudgets(trds.map(({ id, file, text }) => ({ id, file, text })));
  if (!check.ok) {
    const lines = check.over.map((o) => (
      `TRD ${padId(o.id)} is ${fmtNumber(o.chars)} characters (limit ${fmtNumber(ghTrd.TRD_MAX_CHARS)}): narrow it or move work to a follow-up TRD`
    ));
    for (const i of check.invalid) lines.push(`TRD ${padId(i.id)} cannot be encoded: ${i.error}`);
    if (trds.length > ghTrd.MAX_TRDS_PER_OBJECTIVE) {
      lines.push(`objective ${target.id} has ${trds.length} TRDs; the limit is ${ghTrd.MAX_TRDS_PER_OBJECTIVE}`);
    }
    return { ok: false, refused: 'budget', over: check.over, invalid: check.invalid, message: lines.join('; ') };
  }
  for (const w of check.warn) {
    warnings.push(`TRD ${padId(w.id)} is ${fmtNumber(w.chars)} characters (target ${fmtNumber(ghTrd.TRD_TARGET_CHARS)}, limit ${fmtNumber(ghTrd.TRD_MAX_CHARS)})`);
  }

  let edges;
  try {
    edges = waveEdges(trds, { warnings });
  } catch (e) {
    if (e.code === 'CYCLE') return { ok: false, refused: 'cycle', error: e.message };
    throw e;
  }

  const planning = path.join(root, '.planning');
  const base = path.join(planning, 'objectives', target.dir);
  const objectiveFm = readFrontmatter(path.join(base, 'OBJECTIVE.md'));
  const projectFm = readFrontmatter(path.join(planning, 'PROJECT.md'));
  const milestone = ghMilestone.resolveObjectiveMilestone(root, target.dir, configuredMilestonePrefix(root));
  if (milestone.warning) warnings.push(milestone.warning);

  return {
    ok: true,
    objective: { id: target.id, dir: target.dir },
    trds,
    edges,
    warn: check.warn,
    warnings,
    summaries: findSummaries(base, trds, warnings),
    verification: findVerification(base, warnings),
    pages: REFERENCE_PAGES(root, target.dir),
    work: nonEmpty(objectiveFm.work) || nonEmpty(projectFm.default_work),
    kind: nonEmpty(projectFm.kind),
    milestone_title: milestone.title || null,
    labels: configuredLabels(root),
  };
}

// ─── buildOps ────────────────────────────────────────────────────────────────

/** The sections a caller may hand over. `wiki`, `trds` and `meta` are DERIVED by the flusher, never copied. */
const CALLER_SECTIONS = ['summary', 'criteria', 'footer'];

function callerSections(sections) {
  const out = {};
  if (!isObject(sections)) return out;
  for (const name of CALLER_SECTIONS) if (typeof sections[name] === 'string') out[name] = sections[name];
  return out;
}

function trdTitle(trd) {
  const parts = parseTrdFile(trd.file);
  const slug = parts ? parts.slug : '';
  return slug ? `[TRD ${padId(trd.id)}] ${slug}` : `[TRD ${padId(trd.id)}]`;
}

/**
 * buildOps(plan, {objectiveSections, milestoneTitle, work, kind}) — the ordered outbox ops for a plan:
 *
 *   patch-issue (Objective type), set-fields (work/kind), upsert-issue per TRD (by id), link-sub-issue per TRD,
 *   block per wave edge, upsert-comment per SUMMARY, the VERIFICATION comment, wiki-push, and ONE patch-body.
 *
 * Type and field ops are always emitted: the flusher applies them natively or skips them per the modes it
 * detects (labels / meta), so a push queued offline does not depend on the capabilities of the moment.
 * `objectiveSections` is the 46 builder's `{summary, criteria, footer}`; only those three are used, the
 * `wiki`, `trds` and `meta` sections are derived (one writer for the objective body).
 */
function buildOps(plan, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const objectiveId = plan.objective.id;
  const work = o.work !== undefined ? o.work : plan.work;
  const kind = o.kind !== undefined ? o.kind : plan.kind;
  const milestoneTitle = o.milestoneTitle !== undefined ? o.milestoneTitle : plan.milestone_title;
  const labels = plan.labels || DEFAULT_LABELS;
  const trds = [...plan.trds].sort((a, b) => natural(a.id, b.id));

  const ops = [{ kind: 'patch-issue', target: { id: objectiveId }, payload: { type: 'Objective' } }];

  const values = {};
  if (nonEmpty(work)) values.work = work;
  if (nonEmpty(kind)) values.kind = kind;
  if (Object.keys(values).length > 0) ops.push({ kind: 'set-fields', target: { id: objectiveId }, payload: { values } });

  for (const t of trds) {
    const payload = {
      title: trdTitle(t),
      body: ghTrd.encodeTrdBody({ id: t.id, file: t.file, text: t.text }),
      labels: [labels.trd],
    };
    if (nonEmpty(milestoneTitle)) payload.milestone_title = milestoneTitle;
    payload.type = 'TRD';
    ops.push({ kind: 'upsert-issue', target: { id: t.id, role: 'trd' }, payload });
  }
  for (const t of trds) ops.push({ kind: 'link-sub-issue', target: { parent: objectiveId, child: t.id }, payload: {} });
  for (const e of plan.edges) ops.push({ kind: 'block', target: { blocked: e.blocked, blocker: e.blocker }, payload: {} });

  for (const s of plan.summaries || []) {
    ops.push({
      kind: 'upsert-comment',
      target: { id: s.trdId, kind: 'summary' },
      payload: { mode: 'replace', text: ghComments.fileCommentText(s.file, s.text) },
    });
  }
  if (plan.verification) {
    ops.push({
      kind: 'upsert-comment',
      target: { id: objectiveId, kind: 'verification' },
      payload: { mode: 'replace', text: ghComments.fileCommentText(plan.verification.file, plan.verification.text) },
    });
  }

  if ((plan.pages || []).length > 0) {
    ops.push({
      kind: 'wiki-push',
      target: { store: 'pages' },
      payload: { pages: [...plan.pages], message: `devflow: objective ${objectiveId}` },
    });
  }

  const meta = { type: 'Objective' };
  if (nonEmpty(work)) meta.work = work;
  if (nonEmpty(kind)) meta.kind = kind;
  ops.push({
    kind: 'patch-body',
    target: { id: objectiveId },
    payload: {
      mode: 'managed',
      sections: callerSections(o.objectiveSections),
      preserve_ticks: true,
      derive: { wiki: { dir: plan.objective.dir }, trds: true, meta },
    },
  });
  return ops;
}

// ─── pushHierarchy ───────────────────────────────────────────────────────────

const DISABLED_REASON = 'github.enabled is not true in .planning/config.json';

/**
 * pushHierarchy(root, objectiveArg, {objectiveSections, flush, flushOptions, now}) — queue (and optionally
 * flush) the whole hierarchy of one objective.
 *
 * Order of checks, each BEFORE anything is queued: github enabled, the objective has an issue in the mapping
 * (46's find-or-create owns that), the budget / cycle gate (`planPush`), then capability detection (a
 * read-only token is refused). Then one `outbox.enqueue` of `buildOps(plan)`. `flush:true` drains the queue
 * with the detected modes; a provisional (offline) detection is not used for writing, so the flusher
 * re-detects when it can and the queue stays pending until then.
 *
 * `objectiveSections` is 46's `{summary, criteria, footer}` (gh.cjs `buildObjectiveSections`): this is the
 * single writer of the objective body, and the `wiki`, `trds` and `meta` sections are derived.
 *
 * -> {ok:true, objective, enqueued:[seq], coalesced:[seq], ops, degraded:[...], modes, warnings:[...], flush?}
 *  | {ok:true, skipped:true, reason}                       github is not enabled
 *  | {ok:false, refused:'budget'|'cycle'|'readonly', ...}  nothing was queued
 *  | {ok:false, error}
 * `ok` is false when a requested flush ends in status `error`; `halted` and `pending` are not failures.
 */
function pushHierarchy(root, objectiveArg, opts = {}) {
  const o = isObject(opts) ? opts : {};
  if (!outbox.isEnabled(root)) return { ok: true, skipped: true, reason: DISABLED_REASON, enqueued: [], coalesced: [] };

  let target;
  try {
    target = resolveObjectiveDir(root, objectiveArg);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const entry = ghMapping.getEntry(ghMapping.readMappingV3(root), target.id);
  if (!entry) return { ok: false, error: `objective ${target.id} has no issue yet; run df-tools gh sync ${target.id}` };

  const plan = planPush(root, target.id);
  if (!plan.ok) return plan;

  const caps = ghCapability.detectCapabilities(root, { probeIssue: entry.issue_id });
  if (!caps || caps.ok === false) {
    return { ok: false, error: `could not detect repository capabilities: ${caps && caps.error ? caps.error : 'no answer'}` };
  }
  const modes = ghCapability.resolveModes(caps);
  if (modes.writable === false) {
    return {
      ok: false,
      refused: 'readonly',
      error: 'this token has no push access to the repository (read-only), so nothing was queued',
    };
  }

  const warnings = [...plan.warnings];
  if (caps.provisional === true) {
    warnings.push('capabilities are provisional (GitHub could not be reached); the ops were queued and will be applied by the next flush');
  }

  const ops = buildOps(plan, { objectiveSections: o.objectiveSections });
  const queued = outbox.enqueue(root, ops, { now: o.now });
  if (!queued.ok) return { ok: false, error: queued.error, invalid: queued.invalid };
  if (queued.skipped) return { ok: true, skipped: true, reason: queued.reason, enqueued: [], coalesced: [] };

  const result = {
    ok: true,
    objective: target.id,
    enqueued: queued.enqueued,
    coalesced: queued.coalesced,
    ops: ops.length,
    degraded: caps.degraded || [],
    modes,
    warnings,
  };

  if (o.flush === true) {
    const base = isObject(o.flushOptions) ? { ...o.flushOptions } : {};
    result.flush = flushLib.flush(root, caps.provisional === true ? base : { ...base, modes, caps });
    if (result.flush.status === 'error') result.ok = false;
  }
  return result;
}

module.exports = {
  padId,
  readObjectiveTrds,
  waveEdges,
  planPush,
  buildOps,
  pushHierarchy,
  REFERENCE_PAGES,
};
