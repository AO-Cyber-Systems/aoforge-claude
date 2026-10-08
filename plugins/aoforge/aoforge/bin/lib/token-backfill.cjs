'use strict';

// token-backfill.cjs (TRD 57-04, EST-07) — recover token usage for historical TRDs from the transcripts that survive.
//
//   planBackfill(opts)            a dry run: one executor-transcript index, then every SUMMARY classified as
//                                 already_stamped, recovered (with the fields it would add) or unrecovered (with a reason).
//                                 Writes nothing.
//   applyBackfill(plan, opts)     stamps the six token fields onto each recovered SUMMARY through the `summary post`
//                                 verb (planning-verbs.summaryPost), so local mode writes the file byte for byte and
//                                 store mode queues the write (D-01). Only SUMMARY frontmatter changes.
//   formatBackfillReport(plan, applied)   the fixed text report `aof-tools tokens backfill` prints (57-06).
//
// Retention deletes transcripts, so `unrecovered: no_transcript` is the normal outcome for old history: it is counted and
// reported, never an error.
//
// Scope (v1): `<checkout>/.planning/objectives/*` only. Archived objectives under `.planning/milestones/*-objectives/` are
// not resolved by summaryPost and are skipped.
//
// Two roots, always passed explicitly (never guessed from process.cwd()):
//   repoRoot       the MAIN checkout. Executor transcripts name it (REPO_ROOT line, cwd), even for a worktree run.
//   checkoutRoot   the checkout whose `.planning/` is read and written. Inside a linked worktree it is the worktree, so the
//                  stamped SUMMARYs are committed on that branch; in the main checkout the two are equal.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { trdKey } = require('./helpers.cjs');
const ghMapping = require('./gh-mapping.cjs');
const planningMode = require('./planning-mode.cjs');
const verbs = require('./planning-verbs.cjs');
const tu = require('./token-usage.cjs');

/** Written into `tokens_source` so a backfilled figure is never mistaken for a live one. */
const BACKFILL_SOURCE = 'backfill';

/** The block `setFrontmatterField` edits: the first `---` ... `---` at the start of the file. */
const FRONTMATTER_BLOCK_RE = /^---\n[\s\S]+?\n---/;

/** Sorted names of the directories (`wantDirs`) or files directly in `dir`; [] when it cannot be listed. */
function sortedNames(dir, wantDirs) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => (wantDirs ? e.isDirectory() : e.isFile())).map((e) => e.name).sort();
}

function filled(v) {
  return (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
}

function frontmatterOf(text) {
  try {
    return extractFrontmatter(text);
  } catch {
    return {};
  }
}

/** The objective part of a `NN-MM` id: `04.1-02` gives `04.1`. */
function objectivePartOf(id) {
  return id.slice(0, id.lastIndexOf('-'));
}

// ─── planBackfill ─────────────────────────────────────────────────────────────

/**
 * Classify every SUMMARY under `<checkoutRoot>/.planning/objectives`. Writes nothing.
 *
 * Per SUMMARY, in this order: no `NN-MM` key gives `unrecovered/unkeyed`; both `tokens_input` and `tokens_output` already
 * present (and not `force`) gives `already_stamped`; otherwise the transcripts decide (`tokensForTrd`, scoped to the
 * SUMMARY's directory, with `sharedNumber` when several directories carry the objective number). A transcript match on a
 * file with no frontmatter block is `unrecovered/no_frontmatter`: apply could not stamp it.
 *
 * @param {{checkoutRoot: string, repoRoot: string, root?: string, force?: boolean}} opts
 *   root: the Claude Code projects root (default `~/.claude/projects`); force: ignore existing token fields
 * @returns {{checkout: string, repo: string, transcripts_root: string,
 *   index_counts: {executor_transcripts: number, identified: number, unidentified: number, ambiguous: number, foreign: number},
 *   entries: Array<{objective_dir: string, file: string, id: string|null,
 *     status: 'already_stamped'|'recovered'|'unrecovered', reason?: string, fields?: Array<[string, string]>}>,
 *   counts: {summaries: number, already_stamped: number, recovered: number, unrecovered: number, by_reason: object}}}
 */
function planBackfill({ checkoutRoot, repoRoot, root, force = false } = {}) {
  if (typeof checkoutRoot !== 'string' || !checkoutRoot) {
    throw new Error('planBackfill: checkoutRoot (the checkout whose .planning/ is read) is required');
  }
  if (typeof repoRoot !== 'string' || !repoRoot) {
    throw new Error('planBackfill: repoRoot (the main checkout, which transcripts name) is required');
  }
  const transcriptsRoot = typeof root === 'string' && root !== '' ? root : tu.defaultTranscriptRoot();
  const index = tu.indexExecutorTranscripts({ root: transcriptsRoot, repoRoot });

  const objectivesDir = path.join(checkoutRoot, '.planning', 'objectives');
  const sharedByObjective = new Map();
  const isShared = (id) => {
    const part = objectivePartOf(id);
    if (!sharedByObjective.has(part)) sharedByObjective.set(part, tu.objectiveDirsFor(checkoutRoot, id).length > 1);
    return sharedByObjective.get(part);
  };

  const entries = [];
  for (const dir of sortedNames(objectivesDir, true)) {
    const summaries = sortedNames(path.join(objectivesDir, dir), false).filter((f) => f.endsWith('-SUMMARY.md'));
    for (const file of summaries) {
      const id = tu.normTrdId(trdKey(file));
      const base = { objective_dir: dir, file, id };
      if (!id) {
        entries.push({ ...base, status: 'unrecovered', reason: 'unkeyed' });
        continue;
      }
      const text = fs.readFileSync(path.join(objectivesDir, dir, file), 'utf8');
      const fm = frontmatterOf(text);
      if (!force && filled(fm.tokens_input) && filled(fm.tokens_output)) {
        entries.push({ ...base, status: 'already_stamped' });
        continue;
      }
      const found = tu.tokensForTrd(index, { id, dir, sharedNumber: isShared(id) });
      if (found.status !== 'recovered') {
        entries.push({ ...base, status: 'unrecovered', reason: found.reason });
        continue;
      }
      if (!FRONTMATTER_BLOCK_RE.test(text)) {
        entries.push({ ...base, status: 'unrecovered', reason: 'no_frontmatter' });
        continue;
      }
      entries.push({ ...base, status: 'recovered', fields: tu.tokenFrontmatterFields(found.totals, BACKFILL_SOURCE) });
    }
  }

  const reasons = {};
  for (const e of entries) {
    if (e.status === 'unrecovered') reasons[e.reason] = (reasons[e.reason] || 0) + 1;
  }
  const by_reason = {};
  for (const k of Object.keys(reasons).sort()) by_reason[k] = reasons[k];
  const countOf = (status) => entries.filter((e) => e.status === status).length;

  return {
    checkout: checkoutRoot,
    repo: repoRoot,
    transcripts_root: transcriptsRoot,
    index_counts: index.counts,
    entries,
    counts: {
      summaries: entries.length,
      already_stamped: countOf('already_stamped'),
      recovered: countOf('recovered'),
      unrecovered: countOf('unrecovered'),
      by_reason,
    },
  };
}

// ─── applyBackfill ────────────────────────────────────────────────────────────

/**
 * Stamp the token fields onto a temp copy of `text` and return the result, so the only write to a `.planning/` file is the
 * verb's. `{ok: false, error}` when the stamp refuses (no frontmatter block, a key that cannot be written).
 */
function stampOnCopy(file, text, fields, force) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-backfill-'));
  try {
    const copy = path.join(tmp, file);
    fs.writeFileSync(copy, text);
    const r = tu.stampTokenFields(copy, fields, { force });
    return r.ok ? { ...r, text: fs.readFileSync(copy, 'utf8') } : r;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Write the planned token fields into every `recovered` SUMMARY of `plan`, in plan order, through `summary post`
 * (planning-verbs.summaryPost): local mode writes the file byte for byte into the checkout holding `checkoutRoot`; store
 * mode writes the main cache and queues one outbox write per SUMMARY. Nothing here writes under `.planning/` itself.
 *
 * Per recovered SUMMARY:
 *   1. the six fields are stamped onto a temp copy; a refusal is `write_failed`
 *   2. a conflicting existing token value without `force` is `skipped` (`token_conflict`): never overwritten, never
 *      half-written. An identical result is `unchanged`
 *   3. summaryPost picks the objective directory from the id alone, so with a shared objective number the SUMMARY is
 *      posted only when `resolveObjective(main, <objective>).dir` is its own directory; otherwise `skipped`
 *      (`ambiguous_objective_dir`) and the file is left alone
 *   4. summaryPost not-ok is `write_failed`; the loop continues
 *
 * @param {object} plan  from planBackfill
 * @param {{checkoutRoot?: string, force?: boolean}} [opts]  checkoutRoot defaults to `plan.checkout`
 * @returns {{written: string[], unchanged: string[],
 *   skipped: Array<{id, file, objective_dir, reason: 'token_conflict'|'ambiguous_objective_dir'}>,
 *   write_failed: Array<{id, file, objective_dir, error: string}>}}  written/unchanged hold TRD ids, in plan order
 */
function applyBackfill(plan, { checkoutRoot, force = false } = {}) {
  if (!plan || !Array.isArray(plan.entries)) throw new Error('applyBackfill: a plan from planBackfill is required');
  const checkout = typeof checkoutRoot === 'string' && checkoutRoot !== '' ? checkoutRoot : plan.checkout;
  if (typeof checkout !== 'string' || !checkout) throw new Error('applyBackfill: checkoutRoot is required');

  const main = planningMode.resolveMainRoot(checkout);
  const result = { written: [], unchanged: [], skipped: [], write_failed: [] };

  for (const entry of plan.entries) {
    if (entry.status !== 'recovered') continue;
    const where = { id: entry.id, file: entry.file, objective_dir: entry.objective_dir };
    const abs = path.join(checkout, '.planning', 'objectives', entry.objective_dir, entry.file);

    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      result.write_failed.push({ ...where, error: `cannot read ${abs}: ${e.message}` });
      continue;
    }

    const stamped = stampOnCopy(entry.file, text, entry.fields, force);
    if (!stamped.ok) {
      result.write_failed.push({ ...where, error: stamped.error });
      continue;
    }
    if (stamped.conflicts.length > 0 && !force) {
      result.skipped.push({ ...where, reason: 'token_conflict' });
      continue;
    }
    if (stamped.text === text) {
      result.unchanged.push(entry.id);
      continue;
    }

    const resolved = main ? ghMapping.resolveObjective(main, objectivePartOf(entry.id)) : null;
    if (!resolved || resolved.dir !== entry.objective_dir) {
      result.skipped.push({ ...where, reason: 'ambiguous_objective_dir' });
      continue;
    }

    const posted = verbs.summaryPost(checkout, { trd: entry.id, text: stamped.text, file: entry.file });
    if (!posted.ok) {
      result.write_failed.push({ ...where, error: posted.error || `summary post failed (exit ${posted.exit})` });
      continue;
    }
    result.written.push(entry.id);
  }
  return result;
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * The text report: two lines from a plan, a third (`written ... failed`) when `applied` (the applyBackfill result) is given.
 * Reasons are listed in sorted key order and a zero count is omitted. No trailing newline.
 *
 * @param {object} plan  from planBackfill
 * @param {{written: Array, unchanged: Array, skipped: Array, write_failed: Array}} [applied]
 * @returns {string}
 */
function formatBackfillReport(plan, applied) {
  const c = plan.counts;
  const ic = plan.index_counts;
  const reasons = Object.keys(c.by_reason || {})
    .filter((k) => c.by_reason[k] > 0)
    .sort()
    .map((k) => `${k} ${c.by_reason[k]}`);
  const unrecovered = `unrecovered ${c.unrecovered}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`;

  const lines = [
    [`summaries ${c.summaries}`, `already stamped ${c.already_stamped}`, `recovered ${c.recovered}`, unrecovered].join(' · '),
    `executor transcripts ${ic.executor_transcripts} (identified ${ic.identified}, unidentified ${ic.unidentified}, `
      + `ambiguous ${ic.ambiguous}, foreign ${ic.foreign})`,
  ];
  if (applied) {
    lines.push(
      [`written ${applied.written.length}`, `unchanged ${applied.unchanged.length}`, `skipped ${applied.skipped.length}`,
        `failed ${applied.write_failed.length}`].join(' · '),
    );
  }
  return lines.join('\n');
}

module.exports = {
  BACKFILL_SOURCE,
  planBackfill,
  applyBackfill,
  formatBackfillReport,
};
