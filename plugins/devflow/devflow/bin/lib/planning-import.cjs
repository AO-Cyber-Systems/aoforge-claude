'use strict';

/**
 * planning-import.cjs — `planning import [--dry-run]` (objective 48, D-17, GWP-04): move a project's existing local
 * planning work into the GitHub store.
 *
 * WHY: migration 0010 untracks `.planning/` cache files once `github.store` is on, and it refuses while any cache file
 * has no baseline (the file exists only locally, so untracking it would leave it with no home). Import gives every such
 * file its U-1 home, flushes once, and the drained flush baselines them (gh-store-cli settleLedger), after which 0010
 * can proceed.
 *
 * What is queued (store mode only; local mode returns `{ok:false, error:'planning import needs github.store: true'}`):
 *   objectives   every objective dir with a TRD/OBJECTIVE/SUMMARY/VERIFICATION file lacking a baseline: ONE hierarchy
 *                push each (pushHierarchy, or gh.syncObjective's find-or-create for an objective with no issue yet),
 *                no flush per objective; the files the push carries are ledgered so the final flush baselines them
 *   decisions    a decision-queue file whose frontmatter names a `trd:`: a Decision issue blocking that TRD
 *                (gh-hierarchy.openDecision), plus the answer + close when it carries a `resolution:`; the legacy
 *                DECISION-NNN file is replaced in the cache by `decisions/<trd>-d<k>.md`
 *   entities     todos, debug sessions, quick JOB/SUMMARY files: the same ops the entity verbs queue, closed when the
 *                file's location says so (planning-entity-verbs.importEntity)
 *   documents    PROJECT, REQUIREMENTS, research/, milestones/ archives, codebase/, objective docs: ONE wiki-push
 *   milestones   each `## vX.Y` section of a hand-maintained MILESTONES.md: milestone put (native milestone + page),
 *                then the milestone is closed (MILESTONES.md records shipped milestones only)
 *   history      after every create above: patch-issue closes for the imported objectives' shipped / cancelled work
 *                (gh-backfill.historyOps), so the backfill does not leave finished work open
 * then ONE flush (GitHub's write budget is 80/min; a flush per item would spend it), unless `noFlush`.
 *
 * What stays local (reported, never silently skipped):
 *   refused      TRDs over the 60,000-char budget: their whole objective is refused by 47's budget gate
 *                ("split it or move bulk to a linked file")
 *   kept_local   decision files with no `trd:` (a store Decision must block a TRD), entity files whose stem has no
 *                entity id, documents with no wiki page, and legacy-named TRDs (`NN-MM-TRD-<slug>.md`, which classify
 *                as runtime and no verb owns; rename to `NN-MM-<slug>-TRD.md`)
 *
 * `--dry-run` enqueues nothing, writes nothing and calls no GitHub write, and returns the same report. Import is
 * idempotent: a second run finds every imported file baselined and queues nothing.
 *
 * The backfill plan (objective 51, TRD 51-05, GMD-02): every run also reports
 *   estimate     an upper-bound request estimate of what the run queues (gh-backfill.estimate over the planned ops:
 *                each objective's buildOps, one live create per unmapped objective, the decision and entity ops, the
 *                wiki push, the milestone puts and the history closes) plus `objectives`, `trds`, `history_closes`
 *   history      `{closed_completed, closed_not_planned}`: the shipped / cancelled work of the imported objectives
 *                (gh-backfill.historyOps) whose issues the import closes instead of leaving open
 * A dry run with store OFF but `github.enabled: true` is a PREVIEW (`preview: true`): the same report, so a user sees the
 * whole backfill and its cost before flipping `github.store`. Any other local-mode run still refuses.
 *
 * A library: no spawns, no stdout, no process.exit. `exit` is gh-store-cli's EXIT (0 ok, 1 error, 2 halted, 3 pending).
 */

const fs = require('fs');
const path = require('path');

const planningMode = require('./planning-mode.cjs');
const planningPaths = require('./planning-paths.cjs');
const ledger = require('./planning-ledger.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const ghWiki = require('./gh-wiki.cjs');
const ghCache = require('./gh-cache.cjs');
const ghMilestone = require('./gh-milestone.cjs');
const ghMilestoneStore = require('./gh-milestone-store.cjs');
const storeCli = require('./gh-store-cli.cjs');
const verbs = require('./planning-verbs.cjs');
const ev = require('./planning-entity-verbs.cjs');
const backfill = require('./gh-backfill.cjs');

const { EXIT } = storeCli;
const { STORE } = planningMode;

const BUDGET_HINT = 'split it or move bulk to a linked file';
const KINDS = Object.freeze(['objective', 'decision', 'todo', 'debug', 'quick', 'doc', 'milestone']);
const OBJECTIVE_VERBS = new Set(['plan put-trd', 'objective put', 'summary post', 'verification post']);
const ENTITY_VERBS = new Set(['todo add', 'debug put', 'quick put']);
const TRD_FILE_RE = /^(\d+(?:\.\d+)?-\d+)(?:-(.*))?-TRD\.md$/;
const LEGACY_TRD_RE = /^objectives\/([^/]+)\/(\d+(?:\.\d+)?-\d+)-TRD-(.+)\.md$/;
const STORE_DECISION_RE = /^decisions\/\d+(?:\.\d+)?-\d+-d\d+\.md$/;
const OBJECTIVE_DIR_RE = /^(\d+(?:\.\d+)?)(?:-|$)/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unique = (list) => [...new Set(list)];
const zero = () => Object.fromEntries(KINDS.map((k) => [k, 0]));
const planningFile = (main, rel) => path.join(main, '.planning', ...rel.split('/'));

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Frontmatter `key:` value (quotes stripped), or null. */
function frontmatterField(text, key) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const m = fm ? new RegExp(`^${key}:[ \\t]*(.*?)\\s*$`, 'm').exec(fm[1]) : null;
  const v = m ? m[1].replace(/^(['"])(.*)\1$/, '$2').trim() : '';
  return v === '' ? null : v;
}

/** Everything after the frontmatter block. */
function bodyOf(text) {
  const fm = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  return fm ? text.slice(fm[0].length) : text;
}

/** Ledger the bytes a queued op carries, so the drained flush baselines them (settleLedger). */
function recordQueued(main, rel, warnings) {
  const text = readOrNull(planningFile(main, rel));
  if (text === null) return;
  try {
    ledger.record(main, rel, text, { verb: 'planning import' });
  } catch (e) {
    warnings.push(`ledger not updated for ${rel}: ${e.message}`);
  }
}

/** `.planning/`-relative paths a hierarchy push of `plan` carries (planning-verbs' pushedRels). */
function pushedRels(plan) {
  const base = `objectives/${plan.objective.dir}`;
  const rels = plan.trds.map((t) => `${base}/${t.file}`);
  for (const s of plan.summaries || []) rels.push(`${base}/${s.file}`);
  if (plan.verification) rels.push(`${base}/${plan.verification.file}`);
  for (const p of plan.pages || []) rels.push(p);
  return unique(rels);
}

/** The TRD file of `trdId` in an objective dir, as a rel (the dir itself when no file matches). */
function trdRelFor(main, dir, trdId) {
  const want = ghMapping.toTrdId(trdId);
  const file = listDir(path.join(main, '.planning', 'objectives', dir)).find((f) => {
    const m = TRD_FILE_RE.exec(f);
    return m && ghMapping.toTrdId(m[1]) === want;
  });
  return file ? `objectives/${dir}/${file}` : `objectives/${dir}`;
}

/**
 * The outbox op kinds importing one entity file queues (planning-entity-verbs.importEntity's `build`), for the estimate:
 * a todo or debug session is an upsert (+ a close when its location says closed), a quick JOB an upsert, a quick
 * SUMMARY the summary comment + the close.
 */
function entityOpKinds(rel) {
  const e = planningPaths.classify(rel).entity;
  if (!e) return [];
  if (e.role === 'todo' || e.role === 'debug') return e.state === 'closed' ? ['upsert-issue', 'patch-issue'] : ['upsert-issue'];
  if (e.part === 'job') return ['upsert-issue'];
  return ['upsert-comment', 'patch-issue'];
}

/** The ops a decision import queues: openDecision's upsert + block, and decisionAnswer's comment + close when answered. */
const decisionOpKinds = (answered) => (answered ? ['upsert-issue', 'block', 'upsert-comment', 'patch-issue'] : ['upsert-issue', 'block']);

const kindOps = (kinds) => kinds.map((kind) => ({ kind }));

/** `{closed_completed, closed_not_planned}` of a historyOps list. */
function historyCounts(ops) {
  const counts = { closed_completed: 0, closed_not_planned: 0 };
  for (const op of ops) {
    if (op.payload.state_reason === 'completed') counts.closed_completed += 1;
    else counts.closed_not_planned += 1;
  }
  return counts;
}

/**
 * `ops` with each close folded over a PENDING patch-issue on the same id (planning-entity-verbs.closeOp's rule).
 * outbox.enqueue coalesces a pending op of the same kind + target by replacing its payload, so without the fold an
 * objective's close would wipe the `type: Objective` its hierarchy push queued. Folded, the objective is typed and
 * closed by one PATCH at that earlier seq; every TRD close (no pending patch-issue) is appended after the creates.
 */
function foldOverPending(main, ops) {
  let pending = [];
  try {
    pending = outbox.readJournal(main).journal.ops.filter((op) => (
      op.status === 'pending' && op.kind === 'patch-issue' && isObject(op.target) && Object.keys(op.target).length === 1
    ));
  } catch {
    pending = [];
  }
  return ops.map((op) => {
    const prior = pending.find((p) => p.target.id === op.target.id);
    return prior && isObject(prior.payload) ? { ...op, payload: { ...prior.payload, ...op.payload } } : op;
  });
}

/** `github.enabled === true` in the main checkout's config (planning-mode's reader, never an ad hoc parse). */
function githubEnabled(main) {
  const cfg = planningMode.readPlanningConfig(main);
  return isObject(cfg) && isObject(cfg.github) && cfg.github.enabled === true;
}

/** The `## vX.Y` sections of a hand-maintained MILESTONES.md: [{version, text}] (trailing `---` dropped). */
function milestoneSections(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').replace(/\s+$/, '').replace(/\n+-{3,}$/, '').replace(/\s+$/, '');
    out.push({ version: cur.version, text: `${body}\n` });
    cur = null;
  };
  for (const line of lines) {
    if (/^## /.test(line)) {
      close();
      const version = ghMilestone.normaliseVersion(line.slice(3).trim().split(/\s+/)[0]);
      if (version) cur = { version, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  close();
  return out;
}

/**
 * planImport(root, {dryRun, noFlush}) -> {ok, mode, dry_run, preview?, queued:{objective, decision, todo, debug, quick, doc,
 *   milestone}, skipped:[{rel, reason}], kept_local:[{rel, reason}], refused:[{objective, rel, id, chars, hint}],
 *   warnings, estimate?, history?, flush?, prose?, error?, exit}
 *
 *   preview    true on a store-off dry run with github.enabled (absent otherwise)
 *   estimate   {objectives, trds, history_closes, ops, writes_max, reads_approx, minutes_min, hour_windows, hours_min,
 *               by_kind, writes_by_kind, live_creates, wiki_pushes, milestones, unknown_kinds} (gh-backfill.estimate
 *               plus the three counts); in a real run it prices what was actually queued
 *   history    {closed_completed, closed_not_planned}: the close ops of the imported objectives' finished work
 *
 * `noFlush` (migration 0011): queue everything, including the history closes, but skip the flush; `flush` is absent and
 * the ledger stays unsettled until the caller's drained flush settles it.
 */
function planImport(root, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const dryRun = o.dryRun === true;
  const noFlush = o.noFlush === true;
  const report = { ok: true, mode: null, dry_run: dryRun, queued: zero(), skipped: [], kept_local: [], refused: [], warnings: [] };
  const main = planningMode.resolveMainRoot(root);
  if (!main) return { ...report, ok: false, error: `no .planning/ directory at or above ${root}`, exit: EXIT.ERROR };
  report.mode = planningMode.planningMode(main).mode;
  if (report.mode !== STORE) {
    // A preview: what the backfill would queue once the store is switched on. Only a dry run, only with GitHub on.
    if (!(dryRun && githubEnabled(main))) return { ...report, ok: false, error: 'planning import needs github.store: true', exit: EXIT.ERROR };
    report.preview = true;
  }

  const index = outbox.readCacheIndex(main);
  const lists = planningPaths.listByClass(path.join(main, '.planning'));
  const pending = lists.cache.filter((rel) => !Object.prototype.hasOwnProperty.call(index, rel));
  const verbOf = (rel) => planningPaths.classify(rel).verb;
  const covered = new Set();
  const errors = [];
  let queuedAny = false;
  // The backfill plan (51-05): what this run queues, priced by gh-backfill.estimate after step 6.
  const plan = { ops: [], imported: [], trds: 0, liveCreates: 0, wikiPushes: 0, milestones: 0 };

  // 1. Objectives: one hierarchy push each, no flush.
  const dirs = unique(pending.filter((rel) => OBJECTIVE_VERBS.has(verbOf(rel))).map((rel) => rel.split('/')[1])).sort();
  for (const dir of dirs) {
    const m = OBJECTIVE_DIR_RE.exec(dir);
    const resolved = m ? ghMapping.resolveObjective(main, m[1]) : null;
    if (!resolved || resolved.dir !== dir) {
      report.kept_local.push({ rel: `objectives/${dir}`, reason: 'not a known objective directory (no ROADMAP entry resolves to it)' });
      continue;
    }
    const pushPlan = ghHierarchy.planPush(main, resolved.id);
    if (!pushPlan.ok) {
      if (pushPlan.refused === 'budget') {
        for (const over of pushPlan.over || []) {
          report.refused.push({ objective: resolved.id, rel: trdRelFor(main, dir, over.id), id: over.id, chars: over.chars, hint: BUDGET_HINT });
        }
        for (const bad of pushPlan.invalid || []) report.kept_local.push({ rel: trdRelFor(main, dir, bad.id), reason: bad.error });
      } else {
        report.kept_local.push({ rel: `objectives/${dir}`, reason: pushPlan.error || pushPlan.message || `refused (${pushPlan.refused})` });
      }
      continue;
    }
    const objectiveRel = `objectives/${dir}/OBJECTIVE.md`;
    const covers = unique([...(fs.existsSync(planningFile(main, objectiveRel)) ? [objectiveRel] : []), ...pushedRels(pushPlan)]);
    for (const rel of covers) covered.add(rel);
    report.queued.objective += 1;
    // buildOps is pure (no gh, no outbox): the ops the push below queues, for the estimate.
    const mapped = ghMapping.getEntry(ghMapping.readMappingV3(main), resolved.id);
    const planned = () => {
      plan.ops.push(...ghHierarchy.buildOps(pushPlan));
      plan.imported.push(resolved.id);
      plan.trds += pushPlan.trds.length;
      if (!mapped) plan.liveCreates += 1;
    };
    if (dryRun) {
      planned();
      continue;
    }
    let q;
    try {
      q = mapped ? ghHierarchy.pushHierarchy(main, resolved.id) : require('./gh.cjs').syncObjective(resolved.id, main, { deferFlush: true });
    } catch (e) {
      q = { ok: false, error: e.message };
    }
    if (!q || q.ok === false) {
      report.queued.objective -= 1;
      errors.push(`objective ${resolved.id} not queued: ${(q && (q.error || q.message || q.reason)) || 'unknown error'}`);
      continue;
    }
    for (const w of q.warnings || []) report.warnings.push(typeof w === 'string' ? w : w.message || String(w));
    queuedAny = true;
    planned();
    for (const rel of covers) recordQueued(main, rel, report.warnings);
  }

  // 2. Decisions: a decision-queue file naming its TRD becomes a Decision issue blocking it; the rest stay local.
  for (const rel of pending.filter((r) => verbOf(r) === 'decision open')) {
    if (STORE_DECISION_RE.test(rel)) {
      report.skipped.push({ rel, reason: 'a store decision file (written by decision open); its op is already queued' });
      continue;
    }
    const text = readOrNull(planningFile(main, rel));
    const trd = text === null ? null : frontmatterField(text, 'trd');
    if (trd === null) {
      report.kept_local.push({ rel, reason: 'no trd: field; a store Decision must block a TRD, so this decision stays local' });
      continue;
    }
    report.queued.decision += 1;
    const resolution = frontmatterField(text, 'resolution');
    if (dryRun) {
      plan.ops.push(...kindOps(decisionOpKinds(resolution !== null)));
      continue;
    }
    const question = bodyOf(text).trim() !== '' ? bodyOf(text) : text;
    const q = ghHierarchy.openDecision(main, trd, { question });
    if (!q.ok || q.skipped || !q.id) {
      report.queued.decision -= 1;
      report.kept_local.push({ rel, reason: (q && (q.error || q.reason)) || 'the decision was not queued' });
      continue;
    }
    const storeRel = `decisions/${q.id}.md`;
    const questionText = `${question.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd()}\n`;
    const w = verbs.writeThrough(main, { rel: storeRel, text: questionText, verb: 'planning import', enqueue: () => q, noFlush: true });
    if (!w.ok) {
      errors.push(w.error);
      continue;
    }
    queuedAny = true;
    plan.ops.push(...kindOps(decisionOpKinds(false)));
    if (resolution !== null) {
      const a = ev.decisionAnswer(main, { id: q.id, text: resolution, noFlush: true });
      if (!a.ok) errors.push(a.error);
      else plan.ops.push(...kindOps(decisionOpKinds(true).slice(2)));
    }
    ev.removeThrough(main, STORE, rel, report.warnings);
  }

  // 3. Entities: todos, debug sessions, quick JOB/SUMMARY files.
  for (const rel of pending.filter((r) => ENTITY_VERBS.has(verbOf(r)) && !covered.has(r))) {
    const r = ev.importEntity(main, rel, { dryRun });
    if (r.keep) {
      report.kept_local.push({ rel, reason: r.keep });
      continue;
    }
    if (!r.ok) {
      errors.push(r.error || `${rel} was not queued`);
      continue;
    }
    report.queued[r.role] += 1;
    plan.ops.push(...kindOps(entityOpKinds(rel)));
    if (!dryRun) queuedAny = true;
  }

  // 4. Documents: one wiki-push.
  const docs = [];
  for (const rel of pending.filter((r) => verbOf(r) === 'doc put' && !covered.has(r))) {
    if (ghWiki.pageForCachePath(rel) === null) report.kept_local.push({ rel, reason: 'no wiki page maps to this document' });
    else docs.push(rel);
  }
  report.queued.doc += docs.length;
  if (dryRun && docs.length > 0) plan.wikiPushes = 1;
  if (!dryRun && docs.length > 0) {
    const d = ev.docsPut(main, docs, { message: 'devflow: planning import', noFlush: true });
    if (d.ok) {
      queuedAny = true;
      plan.wikiPushes = 1;
    } else {
      report.queued.doc -= docs.length;
      errors.push(d.error);
    }
  }

  // 5. A hand-maintained MILESTONES.md: one milestone put per `## vX.Y` section not yet imported.
  const milestones = readOrNull(planningFile(main, 'MILESTONES.md'));
  if (milestones !== null) {
    if (milestones.startsWith(ghCache.GENERATED_HEADER)) {
      report.skipped.push({ rel: 'MILESTONES.md', reason: 'a generated view (gh pull --all renders it from the milestones)' });
    } else {
      for (const s of milestoneSections(milestones)) {
        const rel = `milestones/${s.version}.md`;
        if (index[rel] === ghTrd.contentHash(s.text)) continue;
        report.queued.milestone += 1;
        if (dryRun) {
          plan.milestones += 1;
          continue;
        }
        const r = ev.milestonePut(main, { version: s.version, text: s.text, noFlush: true });
        if (r.ok) {
          queuedAny = true;
          plan.milestones += 1;
          // MILESTONES.md records shipped milestones only, and milestone put never sets a state: close it here.
          const closed = ghMilestoneStore.closeMilestone(main, s.version);
          if (!closed || closed.ok !== true) {
            report.warnings.push(`milestone ${s.version} was not closed: ${(closed && (closed.error || closed.reason)) || 'unknown error'}`);
          }
        } else {
          report.queued.milestone -= 1;
          errors.push(r.error);
        }
      }
    }
  }

  // 6. Legacy-named TRDs classify as runtime (no verb owns them): reported, never silently skipped.
  for (const rel of lists.runtime) {
    const m = LEGACY_TRD_RE.exec(rel);
    if (m) report.kept_local.push({ rel, reason: `legacy TRD name; rename it to objectives/${m[1]}/${m[2]}-${m[3]}-TRD.md so plan put-trd owns it` });
  }

  // 6b. History (51-05, G1): close the shipped / cancelled work of every objective imported above, and price the run.
  const history = backfill.historyOps(main, plan.imported);
  report.history = historyCounts(history);
  const priced = backfill.estimate({
    ops: [...plan.ops, ...history],
    live_creates: plan.liveCreates,
    wiki_pushes: plan.wikiPushes,
    milestones: plan.milestones,
  });
  report.estimate = { objectives: plan.imported.length, trds: plan.trds, history_closes: history.length, ...priced };
  // Queued after every create above (journal seq order is flush order), state only: no ledger bytes.
  if (!dryRun && history.length > 0) {
    const h = outbox.enqueue(main, foldOverPending(main, history));
    if (!h.ok) errors.push(`history closes not queued: ${h.error}`);
    else if (!h.skipped) queuedAny = true;
  }

  // 7. One flush; a drained flush baselines every ledgered file (gh-store-cli settleLedger). `noFlush` (migration
  //    0011): the caller drains the queue and settles the ledger itself.
  let exit = EXIT.OK;
  if (!dryRun && !noFlush && queuedAny) {
    const flushed = storeCli.flushResult(main, flushLib.flush(main, { wait: true }));
    report.flush = flushed.payload;
    report.prose = flushed.prose.trimEnd();
    exit = flushed.code;
    if (flushed.code === EXIT.ERROR) errors.push(flushed.payload.error || 'the flush failed');
  }
  if (errors.length > 0) {
    report.ok = false;
    report.error = errors.join('; ');
    exit = EXIT.ERROR;
  }
  return { ...report, exit };
}

module.exports = { planImport, milestoneSections, BUDGET_HINT };
