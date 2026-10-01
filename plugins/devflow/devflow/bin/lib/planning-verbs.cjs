'use strict';

/**
 * planning-verbs.cjs — the planning verbs every skill and agent calls to write a planning artifact (objective 48,
 * GWP-01). One primitive, `writeThrough`, with two branches, and the core verbs on top of it.
 *
 * INVARIANT (D-01): with `github.store` off (`local` mode, planning-mode.cjs) a verb writes exactly the file today's
 * prose writes: same path under the MAIN checkout's `.planning/`, the same bytes as its input. It makes zero gh calls,
 * writes no outbox journal and no ledger. Size and bulk findings are warnings only.
 *
 * STORE mode (`github.enabled && github.store`): the verb validates, writes the cache file atomically, records the
 * ledger (D-15), enqueues its op(s), and flushes unless `noFlush`. Only after a flush that DRAINED the journal
 * (status `flushed`) does it record the cache baseline and forget the ledger entry: a baseline taken at enqueue time
 * would let `gh pull --all` overwrite the new local file with the old remote one (48-RESEARCH pitfall 1).
 *
 * A write the verb did NOT queue (`plan put-trd --no-push`, or an enqueue that failed) is recorded with the
 * `(not queued)` verb mark (gh-store-cli UNQUEUED_MARK). W055 stays quiet (the hash matches), but no flush settles
 * it, because GitHub does not have it yet. The next verb that queues the file (or `plan push`) clears the mark.
 *
 * Every verb resolves the MAIN checkout first (D-14), so a call from a worktree writes the main `.planning/` and uses
 * the main journal, ledger and cache index.
 *
 * Results are plain objects, never printed (the CLI is 48-15):
 *   {ok, mode, rel, path, warnings, queued?, flush?, prose?, note?, error?, refused?, exit}
 * `exit` is gh-store-cli's EXIT: 0 ok, 1 error, 2 halted for a human, 3 ops still pending (offline, rate limited).
 *
 * gh only through the 47 libraries (the gh-client seam), git only through gh-wiki (via the flusher). No spawn here.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const planningMode = require('./planning-mode.cjs');
const planningPaths = require('./planning-paths.cjs');
const ledger = require('./planning-ledger.cjs');
const trdBulk = require('./trd-bulk.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const ghCache = require('./gh-cache.cjs');
const ghComments = require('./gh-comments.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const storeCli = require('./gh-store-cli.cjs');
const { atomicWrite } = require('./sync-state.cjs');

const { EXIT, UNQUEUED_MARK } = storeCli;
const { LOCAL, STORE } = planningMode;

const DRAFTS_DIR = 'devflow-drafts';
const NO_ISSUE_RE = /has no issue yet/;

// gh-hierarchy's TRD_FILE_RE and resolveObjectiveDir, which it does not export: the same regex and the same
// ghMapping.resolveObjective call, so a file a push would skip is refused here too.
const TRD_FILE_RE = /^(\d+(?:\.\d+)?-\d+)(?:-(.*))?-TRD\.md$/;
// gh-trd's SAFE_FILE_RE (the devflow:file header rule): a plain file name, no directory part.
const SAFE_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

// ─── Small helpers ───────────────────────────────────────────────────────────

const unique = (list) => [...new Set(list)];

/** A failed result: nothing (more) happened. `base` carries mode/rel/path when they are known. */
function fail(error, base = {}, extra = {}) {
  return { ok: false, mode: null, rel: null, path: null, warnings: [], ...base, ...extra, error, exit: EXIT.ERROR };
}

/** The MAIN checkout root (D-14), or null when there is no `.planning/` above `root`. */
function mainRoot(root) {
  return planningMode.resolveMainRoot(root);
}

/** `rel` as a safe `.planning/`-relative path; throws TypeError (planning-paths' rule) for anything unsafe. */
function safeRel(rel) {
  planningPaths.classify(rel);
  return rel;
}

const planningFile = (main, rel) => path.join(main, '.planning', ...rel.split('/'));

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const unqueued = (verb) => `${verb || 'verb'}${UNQUEUED_MARK}`;
const isUnqueued = (verb) => typeof verb === 'string' && verb.endsWith(UNQUEUED_MARK);

// ─── Ledger + baseline ───────────────────────────────────────────────────────

/** Record `text` for `rel` in the ledger; a failure is a warning (the file is already written). */
function recordLedger(main, rel, text, verb, warnings) {
  try {
    ledger.record(main, rel, text, { verb });
  } catch (e) {
    warnings.push(`ledger not updated for ${rel}: ${e.message}`);
  }
}

/**
 * Clear the `(not queued)` mark of every rel in `rels` whose bytes still match its ledger entry: the op just queued
 * carries them now, so the flush that drains it may settle them.
 */
function promote(main, rels, warnings) {
  let entries;
  try {
    ({ entries } = ledger.readLedger(main));
  } catch {
    return;
  }
  for (const rel of rels) {
    const e = entries[rel];
    if (!e || !isUnqueued(e.verb)) continue;
    const text = readOrNull(planningFile(main, rel));
    if (text === null || ghTrd.contentHash(text) !== e.hash) continue;
    recordLedger(main, rel, text, e.verb.slice(0, -UNQUEUED_MARK.length), warnings);
  }
}

/** After a DRAINED flush: baseline what GitHub now holds and drop those rels from the ledger. Never fails the verb. */
function settle(main, rels, warnings) {
  try {
    const rec = ghCache.recordCacheBaseline(main, rels);
    ledger.forget(main, unique([...rec.recorded, ...rec.missing]));
  } catch (e) {
    warnings.push(`cache baseline not recorded: ${e.message}`);
  }
}

// ─── Enqueue + flush ─────────────────────────────────────────────────────────

/** The part of an enqueue answer a caller needs: seqs, never the whole op list. */
function queuedSummary(q) {
  return { enqueued: Array.isArray(q.enqueued) ? q.enqueued : [], coalesced: Array.isArray(q.coalesced) ? q.coalesced : [] };
}

/**
 * Run `enqueue(main)` and, unless `noFlush`, flush. `covers` are the rels the queued op(s) carry to GitHub; after a
 * drained flush they are baselined and forgotten. `rel`/`text`/`verb` describe the file this verb wrote (if any):
 * when the enqueue fails, that write is re-marked `(not queued)` so no later flush settles it.
 */
function enqueueAndFlush(main, base, { enqueue, covers = [], rel = null, text = null, verb = null, noFlush, noWait }) {
  const warnings = base.warnings;
  let q;
  try {
    q = enqueue(main);
  } catch (e) {
    q = { ok: false, error: e.message };
  }
  if (!q || q.ok === false) {
    if (rel !== null) recordLedger(main, rel, text, unqueued(verb), warnings);
    const why = (q && (q.error || q.message || q.refused)) || 'the enqueue failed';
    const extra = q && q.refused ? { refused: q.refused } : {};
    return { ...base, ok: false, ...extra, error: rel !== null ? `${rel} was written but not queued: ${why}` : why, exit: EXIT.ERROR };
  }
  for (const w of q.warnings || []) warnings.push(typeof w === 'string' ? w : w.message || String(w));
  if (q.skipped) {
    if (rel !== null) recordLedger(main, rel, text, unqueued(verb), warnings);
    warnings.push(`not queued: ${q.reason || 'skipped'}`);
    return { ...base, ok: true, exit: EXIT.OK };
  }

  const rels = unique([...(rel !== null ? [rel] : []), ...covers, ...(q.covers || [])]);
  promote(main, rels, warnings);
  const queued = queuedSummary(q);
  if (noFlush) {
    return {
      ...base,
      ok: true,
      queued,
      note: 'queued only (no flush); run `df-tools gh outbox flush` to write it to GitHub',
      exit: EXIT.OK,
    };
  }

  const flushed = storeCli.flushResult(main, flushLib.flush(main, { wait: noWait !== true }));
  if (flushed.payload.status === 'flushed') settle(main, rels, warnings);
  const out = { ...base, ok: flushed.payload.ok, queued, flush: flushed.payload, prose: flushed.prose.trimEnd(), exit: flushed.code };
  if (flushed.code === EXIT.ERROR) out.error = flushed.payload.error || 'the flush failed';
  return out;
}

// ─── writeThrough ────────────────────────────────────────────────────────────

/**
 * writeThrough(root, {rel, text, verb, enqueue, covers, noFlush, noWait, warnings}) — the one write primitive.
 *
 *   local  atomic write of `<main>/.planning/<rel>` (directories created), nothing else.
 *   store  atomic write -> ledger.record(rel, text, {verb}) -> `enqueue(main)` -> flush unless `noFlush`
 *          -> on a drained flush, baseline + forget `rel` and `covers`.
 *
 * `enqueue(main)` returns 47's enqueue shape (`{ok, enqueued, coalesced, warnings?, covers?, skipped?}`); null means
 * "write the cache only" (recorded `(not queued)`). A failing enqueue leaves the file written and in the ledger and
 * returns exit 1 with the error.
 */
function writeThrough(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const warnings = Array.isArray(o.warnings) ? [...o.warnings] : [];
  let rel;
  try {
    rel = safeRel(o.rel);
  } catch (e) {
    return fail(e.message, { warnings });
  }
  if (typeof o.text !== 'string') return fail(`text must be a string, got ${o.text === null ? 'null' : typeof o.text}`, { rel, warnings });
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`, { rel, warnings });

  const { mode } = planningMode.planningMode(main);
  const file = planningFile(main, rel);
  const base = { mode, rel, path: file, warnings };
  try {
    atomicWrite(file, o.text);
  } catch (e) {
    return fail(`could not write ${file}: ${e.message}`, base);
  }
  if (mode === LOCAL) return { ...base, ok: true, exit: EXIT.OK };

  const verb = typeof o.verb === 'string' && o.verb !== '' ? o.verb : null;
  const enqueue = typeof o.enqueue === 'function' ? o.enqueue : null;
  recordLedger(main, rel, o.text, enqueue ? verb : unqueued(verb), warnings);
  if (!enqueue) return { ...base, ok: true, exit: EXIT.OK };
  return enqueueAndFlush(main, base, {
    enqueue,
    covers: Array.isArray(o.covers) ? o.covers : [],
    rel,
    text: o.text,
    verb,
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
  });
}

// ─── Hierarchy (plan put-trd / plan push) ────────────────────────────────────

/** `.planning/`-relative paths of everything a hierarchy push of `plan` carries to GitHub. */
function pushedRels(plan) {
  const base = `objectives/${plan.objective.dir}`;
  const rels = plan.trds.map((t) => `${base}/${t.file}`);
  for (const s of plan.summaries || []) rels.push(`${base}/${s.file}`);
  if (plan.verification) rels.push(`${base}/${plan.verification.file}`);
  for (const p of plan.pages || []) rels.push(p);
  return unique(rels);
}

/** Queue the whole hierarchy of one objective (no flush): 47's pushHierarchy, plus the rels it covers. */
function hierarchyEnqueue(main, objectiveId) {
  const plan = ghHierarchy.planPush(main, objectiveId);
  const covers = plan.ok ? pushedRels(plan) : [];
  const r = ghHierarchy.pushHierarchy(main, objectiveId);
  if (!r.ok) return { ok: false, error: r.error || r.message || `hierarchy push refused (${r.refused})`, refused: r.refused };
  return { ...r, covers };
}

/** `{id, dir}` of the objective, or `{error}`. */
function objectiveTarget(main, objective) {
  const resolved = ghMapping.resolveObjective(main, objective);
  const label = String(objective === undefined ? null : objective).trim();
  if (!resolved) return { error: `objective ${label} is not known (no ROADMAP entry or directory under .planning/objectives)` };
  if (!resolved.dir) return { error: `objective ${resolved.id} has no directory under .planning/objectives yet` };
  return { id: resolved.id, dir: resolved.dir };
}

/**
 * putTrd(root, {objective, file, text, noPush, noFlush, noWait}) — `plan put-trd` (GWP-05, D-06, D-11).
 *
 * `file` must be a TRD file name of `objective`. Budget and bulk (trd-bulk.checkTrd) are warnings in local mode; in
 * store mode a TRD over 60,000 encoded chars is refused before anything is written. Store mode also refuses a FROZEN
 * TRD (its body is fixed; changes are scope comments); when the freeze state cannot be read it warns and proceeds.
 * Enqueue = the objective's hierarchy push, unless `noPush` (write the cache only; `plan push` queues it later).
 */
function putTrd(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  if (typeof o.text !== 'string') return fail('plan put-trd needs the TRD text');
  const target = objectiveTarget(main, o.objective);
  if (target.error) return fail(target.error);

  const file = o.file;
  const m = typeof file === 'string' && SAFE_FILE_RE.test(file) ? TRD_FILE_RE.exec(file) : null;
  const parts = m ? { prefix: m[1] } : null;
  if (!parts) return fail(`${JSON.stringify(file)} is not a TRD file name (expected <objective>-<NN>[-<slug>]-TRD.md)`);
  const trdId = ghMapping.toTrdId(parts.prefix);
  if (trdId === null || ghMapping.toObjectiveId(trdId.replace(/-\d+$/, '')) !== target.id) {
    return fail(`${file} is not a TRD of objective ${target.id}`);
  }

  const rel = `objectives/${target.dir}/${file}`;
  const { mode } = planningMode.planningMode(main);
  const base = { mode, rel, path: planningFile(main, rel) };
  const chk = trdBulk.checkTrd({ file, text: o.text });
  const warnings = [...chk.messages];

  if (mode === STORE && chk.status === 'over') {
    return fail(chk.messages[0], { ...base, warnings }, { refused: 'budget', chars: chk.chars });
  }
  if (mode === STORE) {
    const st = ghComments.readTrdState(main, trdId);
    if (st.ok) {
      const editable = ghTrd.assertEditable({ specRev: st.specRevText });
      if (!editable.ok) {
        const shown = parts.prefix;
        return fail(
          `TRD ${shown} is frozen: its body must not be edited after freeze. Record the change as a scope comment: ` +
            `\`df-tools gh trd scope ${shown} <body|@file:path>\``,
          { ...base, warnings },
          { refused: 'frozen' },
        );
      }
    } else if (!NO_ISSUE_RE.test(String(st.error))) {
      warnings.push(`freeze state unknown (offline); proceeding: ${st.error}`);
    }
  }

  return writeThrough(main, {
    rel,
    text: o.text,
    verb: 'plan put-trd',
    enqueue: o.noPush === true ? null : (m) => hierarchyEnqueue(m, target.id),
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
    warnings,
  });
}

/**
 * planPush(root, objective, {noFlush, noWait}) — `plan push`: queue the objective's whole hierarchy and flush it.
 * After a drained flush every file the push carried is baselined and forgotten. Local mode: nothing to push.
 */
function planPush(root, objective, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  const { mode } = planningMode.planningMode(main);
  if (mode === LOCAL) return { ok: true, mode, rel: null, path: null, warnings: [], skipped: 'local mode', exit: EXIT.OK };
  const target = objectiveTarget(main, objective);
  if (target.error) return fail(target.error, { mode });
  return enqueueAndFlush(main, { mode, rel: null, path: null, objective: target.id, warnings: [] }, {
    enqueue: (m) => hierarchyEnqueue(m, target.id),
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
  });
}

// ─── Drafts (D-13) ───────────────────────────────────────────────────────────

/**
 * draftPath(root, rel) — where an agent edits a planning file before handing it to a verb with `--from`:
 * `<os.tmpdir()>/devflow-drafts/<repoKey(main)>/<rel>`. The directory is created; the draft is seeded with the
 * current cache file when it exists and the draft does not (an existing draft is never overwritten).
 * Throws TypeError for an unsafe rel.
 */
function draftPath(root, rel) {
  const r = safeRel(rel);
  const main = mainRoot(root) || path.resolve(String(root));
  const file = path.join(os.tmpdir(), DRAFTS_DIR, outbox.repoKey(main), ...r.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const cache = planningFile(main, r);
    if (fs.existsSync(cache)) fs.copyFileSync(cache, file);
  }
  return file;
}

module.exports = {
  DRAFTS_DIR,
  writeThrough,
  putTrd,
  planPush,
  draftPath,
};
