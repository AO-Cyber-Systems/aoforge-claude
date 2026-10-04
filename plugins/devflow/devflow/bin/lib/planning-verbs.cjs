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
 * ONE exception, local mode only (TRD 53-01): `summary post|checkpoint` write the checkout that holds the caller
 * (planning-mode.resolveCheckoutRoot), so an executor in a linked worktree writes its own `.planning/` and commits the
 * SUMMARY on its `df/exec-*` branch. Writing main there left an untracked copy that made the wave merge refuse to
 * overwrite it (objective 52, five times). Visibility is unaffected: gate-executor-stop scans every worktree and the
 * orchestrator reads a parallel plan's SUMMARY from that plan's worktree. Store mode keeps the rule above: the cache,
 * `.trd-progress/`, journal, ledger and outbox are single-writer files in the main checkout.
 *
 * Verb -> file -> store-mode op(s):
 *   plan put-trd          objectives/<dir>/<NN-MM-slug>-TRD.md   hierarchy push of the objective (none with noPush)
 *   plan push             (no file)                             hierarchy push of the objective
 *   objective put         objectives/<dir>/OBJECTIVE.md         gh.syncObjective (find-or-create, body patch, hierarchy)
 *                                                               + wiki-push of the objective page
 *   objective set-status  OBJECTIVE.md `status:`                as objective put, + patch-issue for complete
 *                                                               (closed/completed), cancelled (closed/not_planned),
 *                                                               reopened (open). `complete` queues NO close while the
 *                                                               objective's PR is unmerged (49-11: it closes on merge)
 *   summary post          objectives/<dir>/<prefix>-SUMMARY.md   upsert-comment kind=summary on the TRD issue,
 *                                                               patch-issue labels_remove [in_progress], and with a PR
 *                                                               upsert-pr (summary `TRDs complete k/N`, no title)
 *   summary checkpoint    local: the SUMMARY file; store: .trd-progress/<trd>.md (runtime, never queued, D-12)
 *   verification post     objectives/<dir>/<NN>-VERIFICATION.md  upsert-comment kind=verification on the objective;
 *                                                               with a PR: post-status devflow/verification (passed ->
 *                                                               success + pr-ready + upsert-pr-comment wiki-diff,
 *                                                               gaps_found -> failure, human_needed -> pending)
 *   doc put               any rel with a wiki page              wiki-push of that page
 * A wiki-push coalesces on its one target (`{store:'pages'}`, latest payload wins), so every verb that queues one
 * unions its pages with the pending op's; a pending objective patch-issue is merged the same way.
 *
 * D-16: gh.syncObjective's own direct writes (find-or-create of the objective issue, the sticky state comment,
 * Project fields, the `github_issue:` frontmatter write-back) stay direct. They are 46's idempotent sync, not
 * planning-file writes; routing them through the outbox would add a second writer of the same objects. When the
 * write-back changes OBJECTIVE.md, the ledger is re-recorded with the new bytes, because the verb's own pipeline
 * wrote them.
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
const client = require('./gh-client.cjs');
const ghCache = require('./gh-cache.cjs');
const ghComments = require('./gh-comments.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghWiki = require('./gh-wiki.cjs');
const { extractFrontmatter, setFrontmatterField } = require('./frontmatter.cjs');
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

  if (rel !== null) {
    // The enqueue may rewrite the file itself (gh.syncObjective's github_issue write-back, D-16).
    const now = readOrNull(planningFile(main, rel));
    if (now !== null && now !== text) recordLedger(main, rel, now, verb, warnings);
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
 * writeThrough(root, {rel, text, verb, enqueue, covers, noFlush, noWait, warnings, writeRoot}) — the one write primitive.
 *
 *   local  atomic write of `<main>/.planning/<rel>` (directories created), nothing else. `writeRoot` (the summary verbs
 *          only, 53-01) names another checkout to write instead of `<main>`; store mode ignores it.
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
  // `writeRoot` redirects the LOCAL write only; store mode always writes the cache under main (D-14).
  const target = mode === LOCAL && typeof o.writeRoot === 'string' && o.writeRoot !== '' ? o.writeRoot : main;
  const file = planningFile(target, rel);
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

// ─── Op builders that respect coalescing ─────────────────────────────────────

/** The pending op of `kind` on `target` (the one an enqueue would coalesce into), or null. */
function pendingOp(main, kind, target) {
  try {
    const { journal } = outbox.readJournal(main);
    const key = JSON.stringify(target);
    return journal.ops.find((op) => op.status === 'pending' && op.kind === kind && JSON.stringify(op.target) === key) || null;
  } catch {
    return null;
  }
}

/** A wiki-push of `pages`, unioned with the pending wiki-push (they share one target, so the latest payload wins). */
function wikiPushOp(main, pages, message) {
  const target = { store: 'pages' };
  const prior = pendingOp(main, 'wiki-push', target);
  const before = prior && prior.payload && Array.isArray(prior.payload.pages) ? prior.payload.pages : [];
  return { kind: 'wiki-push', target, payload: { pages: unique([...before, ...pages]), message } };
}

/** A patch-issue on the objective, merged over a pending one so its fields (type, labels) are not lost. */
function patchIssueOp(main, id, payload) {
  const target = { id };
  const prior = pendingOp(main, 'patch-issue', target);
  const before = prior && prior.payload && typeof prior.payload === 'object' ? prior.payload : {};
  return { kind: 'patch-issue', target, payload: { ...before, ...payload } };
}

// ─── objective put / set-status ──────────────────────────────────────────────

const STATUSES = Object.freeze(['planned', 'in_progress', 'verifying', 'complete', 'cancelled', 'reopened']);

/** The issue change each status carries in store mode; the others only change the frontmatter. */
const STATUS_PATCH = Object.freeze({
  complete: Object.freeze({ state: 'closed', state_reason: 'completed' }),
  cancelled: Object.freeze({ state: 'closed', state_reason: 'not_planned' }),
  reopened: Object.freeze({ state: 'open' }),
});

/**
 * The store-mode enqueue of an OBJECTIVE.md write: gh.syncObjective (deferFlush: it queues the hierarchy, whose
 * patch-body is the one writer of the objective body), a wiki-push of the objective page, and `patch` (a status
 * change) as a patch-issue after them, so the issue closes only once its body is current.
 */
function objectiveEnqueue(main, target, rel, patch, syncFn) {
  const sync = typeof syncFn === 'function' ? syncFn : require('./gh.cjs').syncObjective;
  const s = sync(target.id, main, { deferFlush: true });
  if (!s || s.ok === false) {
    return { ok: false, error: (s && (s.message || s.error || s.reason)) || 'objective sync failed', refused: s && s.refused };
  }
  const ops = [wikiPushOp(main, [rel], `devflow: objective ${target.id}`)];
  if (patch) ops.push(patchIssueOp(main, target.id, patch));
  const q = outbox.enqueue(main, ops);
  if (!q.ok) return { ok: false, error: q.error };
  const plan = ghHierarchy.planPush(main, target.id);
  return { ...q, warnings: [...(s.warnings || [])], covers: plan.ok ? pushedRels(plan) : [rel] };
}

function writeObjective(main, target, text, o, { verb, patch = null } = {}) {
  const rel = `objectives/${target.dir}/OBJECTIVE.md`;
  return writeThrough(main, {
    rel,
    text,
    verb,
    enqueue: (m) => objectiveEnqueue(m, target, rel, patch, o.syncObjective),
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
  });
}

/**
 * objectivePut(root, {id, text, noFlush, noWait}) — `objective put`: write OBJECTIVE.md. Store mode syncs the
 * objective issue (find-or-create) and pushes its page. `syncObjective` may be injected (tests).
 */
function objectivePut(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  if (typeof o.text !== 'string') return fail('objective put needs the OBJECTIVE.md text');
  const target = objectiveTarget(main, o.id);
  if (target.error) return fail(target.error);
  return writeObjective(main, target, o.text, o, { verb: 'objective put' });
}

/** `text` with its frontmatter `status:` set, through frontmatter.setFrontmatterField (one frontmatter grammar). */
function withStatus(text, status) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-status-'));
  const tmp = path.join(dir, 'OBJECTIVE.md');
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    const r = setFrontmatterField(tmp, 'status', status);
    if (!r.ok) return { error: r.error };
    if (r.warning) return { error: 'OBJECTIVE.md has no frontmatter block, so its status cannot be set' };
    return { text: fs.readFileSync(tmp, 'utf8') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * objectiveSetStatus(root, {id, status, noFlush, noWait}) — `objective set-status`.
 *
 * Local: set `status:` in OBJECTIVE.md (nothing else changes); `complete` also returns `{delegate:'objective
 * complete'}` so the CLI runs today's cmdObjectiveComplete. Store: the same frontmatter write through objective put,
 * plus a patch-issue for complete / cancelled / reopened.
 */
function objectiveSetStatus(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (!STATUSES.includes(o.status)) {
    return fail(`unknown objective status ${JSON.stringify(o.status === undefined ? null : o.status)}; expected one of: ${STATUSES.join(', ')}`);
  }
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  const target = objectiveTarget(main, o.id);
  if (target.error) return fail(target.error);
  const rel = `objectives/${target.dir}/OBJECTIVE.md`;
  const current = readOrNull(planningFile(main, rel));
  if (current === null) return fail(`${rel} does not exist`, { rel });
  const next = withStatus(current, o.status);
  if (next.error) return fail(next.error, { rel });

  const { mode } = planningMode.planningMode(main);
  if (mode === LOCAL) {
    const r = writeThrough(main, { rel, text: next.text, verb: 'objective set-status' });
    return o.status === 'complete' && r.ok ? { ...r, delegate: 'objective complete' } : r;
  }
  // GPR-04 (49 Pitfall 3): while the objective's PR is unmerged the issue stays open. The PR body carries `Closes #obj`,
  // so GitHub closes it on merge; closing at verify time would close it before the work reached the default branch.
  const deferred = o.status === 'complete' ? unmergedPr(main, target.id) : null;
  const patch = STATUS_PATCH[o.status] && !deferred ? { ...STATUS_PATCH[o.status] } : null;
  const r = writeObjective(main, target, next.text, o, { verb: 'objective set-status', patch });
  if (!deferred) return r;
  // objective.cjs prints `warnings` but not `close_deferred`, so the reason is stated in both places.
  const note = `the objective issue stays open until ${deferred} merges (close deferred)`;
  return { ...r, close_deferred: deferred, warnings: [...(r.warnings || []), note] };
}

/** The objective's `prs` entry (49-02: branch, base, number, wiki_base_sha, merged_at, ...), or null: no PR on record. */
function prOnRecord(main, id) {
  try {
    return ghMapping.getPr(ghMapping.readMappingV3(main), id);
  } catch {
    return null;
  }
}

/** `pr #N` (or `pr (branch B)` before the PR exists) when the objective has a PR on record that has not merged; else null. */
function unmergedPr(main, id) {
  const entry = prOnRecord(main, id);
  if (!entry || entry.merged_at) return null;
  return entry.number ? `pr #${entry.number}` : `pr (branch ${entry.branch})`;
}

// ─── summary post / checkpoint, verification post ────────────────────────────

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The zero-padded objective prefix of a directory name (`07-store-demo` -> `07`). */
function dirPrefix(target) {
  const m = /^(\d+(?:\.\d+)?)-/.exec(target.dir);
  return m ? m[1] : target.id;
}

/** `{id, objective:{id,dir}, prefix}` for a TRD id in any spelling, or `{error}`. `prefix` is the file prefix (07-01). */
function trdTarget(main, trd) {
  const id = ghMapping.toTrdId(trd);
  if (id === null || /-d\d+$/.test(id)) {
    return { error: `invalid TRD id ${JSON.stringify(trd === undefined ? null : trd)} (expected <objective>-<NN>, e.g. 07-01)` };
  }
  const objective = objectiveTarget(main, id.replace(/-\d+$/, ''));
  if (objective.error) return { error: objective.error };
  const files = listDir(path.join(main, '.planning', 'objectives', objective.dir));
  const trdFile = files.find((f) => {
    const m = TRD_FILE_RE.exec(f);
    return m && ghMapping.toTrdId(m[1]) === id;
  });
  const prefix = trdFile ? TRD_FILE_RE.exec(trdFile)[1] : `${dirPrefix(objective)}-${id.slice(id.lastIndexOf('-') + 1)}`;
  return { id, objective, prefix, files };
}

/** A caller-named file must be a plain file name. */
function checkFileName(file, what) {
  return typeof file === 'string' && SAFE_FILE_RE.test(file) ? null : `${what} must be a plain file name, got ${JSON.stringify(file)}`;
}

/** The SUMMARY file of a TRD: the caller's, else the existing `<prefix>-[...-]SUMMARY.md`, else `<prefix>-SUMMARY.md`. */
function summaryFileOf(t, file) {
  if (file !== undefined && file !== null) return file;
  const re = new RegExp(`^${escapeRe(t.prefix)}-(?:.*-)?SUMMARY\\.md$`);
  return t.files.find((f) => re.test(f)) || `${t.prefix}-SUMMARY.md`;
}

/**
 * The checkout a summary verb writes (TRD 53-01). Local mode: the one holding `root`, so a linked worktree commits its own
 * SUMMARY. Store mode: `main`, always (D-14: cache, `.trd-progress/`, journal, ledger and outbox are single-writer there).
 */
function summaryWriteRoot(root, main) {
  if (planningMode.planningMode(main).mode !== LOCAL) return main;
  return planningMode.resolveCheckoutRoot(root) || main;
}

/** The SUMMARY file name, chosen from the WRITE root's objective dir so a worktree's committed `NN-MM-<slug>-SUMMARY.md` is reused. */
function summaryNameIn(writeRoot, t, file) {
  const files = listDir(path.join(writeRoot, '.planning', 'objectives', t.objective.dir));
  return summaryFileOf({ ...t, files }, file);
}

// ─── PR hooks of summary post / verification post (objective 49, GPR-03) ─────
//
// Every op below is built inside the `enqueue` callback of writeThrough, which local mode never calls: that is what
// keeps D-01 (a local verb makes zero gh calls and reads no mapping).

// gh-comments' default for `github.labels.in_progress` (its enqueueTrdStart); the same label `gh trd start` adds.
const IN_PROGRESS_LABEL = 'devflow:in-progress';
const VERIFY_CONTEXT = 'devflow/verification';
const STATUS_DESCRIPTION_MAX = 140; // gh-outbox's post-status limit
const NO_WIKI_CHANGES = 'No wiki pages changed during this objective.';
// A TRD's SUMMARY file: `<obj>-<NN>[-slug]-SUMMARY.md`.
const SUMMARY_FILE_RE = /^(\d+(?:\.\d+)?-\d+)(?:-.*)?-SUMMARY\.md$/;
// VERIFICATION frontmatter `status:` -> the commit status state.
const VERDICT_STATE = Object.freeze({ passed: 'success', gaps_found: 'failure', human_needed: 'pending' });

/** The label `gh trd start` put on a TRD issue: `github.labels.in_progress`, else the default. */
function inProgressLabel(main) {
  let configured = null;
  try {
    const gate = client.requireEnabled(main);
    configured = gate.labels && gate.labels.in_progress;
  } catch {
    configured = null;
  }
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : IN_PROGRESS_LABEL;
}

/**
 * A patch-issue taking `label` off the TRD issue, merged over a pending patch-issue on the same target (they
 * coalesce, latest payload wins). A pending `labels_add` of the same label is dropped: the flusher never removes a
 * label the same op adds, so a `trd start` that was never flushed would otherwise win over the completion.
 */
function removeLabelOp(main, id, label) {
  const target = { id };
  const prior = pendingOp(main, 'patch-issue', target);
  const before = prior && prior.payload && typeof prior.payload === 'object' ? prior.payload : {};
  const payload = { ...before, labels_remove: unique([...(before.labels_remove || []), label]) };
  const added = (before.labels_add || []).filter((l) => l !== label);
  if (added.length > 0) payload.labels_add = added;
  else delete payload.labels_add;
  return { kind: 'patch-issue', target, payload };
}

/** An upsert-pr merged over a pending one (latest payload wins on coalesce): a queued creation keeps its title and wiki. */
function upsertPrOp(main, id, payload) {
  const target = { id };
  const prior = pendingOp(main, 'upsert-pr', target);
  const before = prior && prior.payload && typeof prior.payload === 'object' ? prior.payload : {};
  return { kind: 'upsert-pr', target, payload: { ...before, ...payload } };
}

/** `{done, total}`: the TRDs of the objective (TRD files and mapped TRDs, plus `trdId`) and how many have a SUMMARY. */
function trdProgress(main, objective, trdId) {
  const total = new Set([trdId]);
  const done = new Set([trdId]); // the SUMMARY being posted is already in the cache
  for (const f of listDir(path.join(main, '.planning', 'objectives', objective.dir))) {
    const trd = TRD_FILE_RE.exec(f);
    const trdFileId = trd ? ghMapping.toTrdId(trd[1]) : null;
    if (trdFileId !== null) total.add(trdFileId);
    const sum = SUMMARY_FILE_RE.exec(f);
    const sumId = sum ? ghMapping.toTrdId(sum[1]) : null;
    if (sumId !== null && sumId.replace(/-\d+$/, '') === objective.id) {
      done.add(sumId);
      total.add(sumId);
    }
  }
  try {
    for (const id of ghMapping.listTrds(ghMapping.readMappingV3(main), objective.id)) total.add(id);
  } catch {
    // an unreadable mapping only means the file listing decides
  }
  return { done: done.size, total: total.size };
}

/**
 * The store-mode enqueue of `summary post`: the TRD's `summary` comment, the in-progress label coming off the TRD
 * issue and, when the objective has a PR that has not merged, a refresh of the PR's summary section
 * (`TRDs complete k/N`). One outbox.enqueue, so one flush applies all three. The refresh carries the branch and base
 * from `prs[obj]` and NO title (49-05: the title is create-only; the remote title is kept). `note.pr_refresh` says why
 * no refresh was queued.
 */
function summaryEnqueue(main, t, file, text, note) {
  let payloadText;
  try {
    payloadText = ghComments.fileCommentText(file, text);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const ops = [
    { kind: 'upsert-comment', target: { id: t.id, kind: 'summary' }, payload: { mode: 'replace', text: payloadText } },
    removeLabelOp(main, t.id, inProgressLabel(main)),
  ];
  const entry = prOnRecord(main, t.objective.id);
  if (entry && entry.merged_at) {
    note.pr_refresh = 'skipped (pr merged)';
  } else if (entry && (!entry.branch || !entry.base)) {
    note.pr_refresh = 'skipped (no branch on record)';
  } else if (entry) {
    const { done, total } = trdProgress(main, t.objective, t.id);
    ops.push(upsertPrOp(main, t.objective.id, { branch: entry.branch, base: entry.base, summary: `TRDs complete ${done}/${total}` }));
  }
  return outbox.enqueue(main, ops);
}

/** `text` at most STATUS_DESCRIPTION_MAX characters, ending in `...` when it was cut. */
function fitDescription(text) {
  return text.length <= STATUS_DESCRIPTION_MAX ? text : `${text.slice(0, STATUS_DESCRIPTION_MAX - 3)}...`;
}

/** The commit-status description for a verdict: `Objective 7 verified (12/12 must-haves)`. */
function verdictDescription(id, state, score) {
  const head = { success: 'verified', failure: 'verification found gaps', pending: 'needs human verification' }[state];
  const lead = `Objective ${id} ${head}`;
  return fitDescription(score === null ? lead : `${lead} (${score})`);
}

/** A fence of backticks longer than any run inside `text`, so a diff that quotes a fence cannot end its own block. */
function fenceFor(text) {
  const longest = (text.match(/`+/g) || []).reduce((n, run) => Math.max(n, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The wiki-diff comment op: the diff of the local wiki clone since `prs[obj].wiki_base_sha`. No base on record (pages
 * mode, or no wiki at `gh pr start`) or no clone: no op, since the pages are already among the PR's files. A diff that
 * cannot be read is a warning, never a failed verify.
 */
function wikiDiffOp(main, id, entry, warnings) {
  if (!entry.wiki_base_sha) return null;
  const d = ghWiki.diff(main, entry.wiki_base_sha);
  if (typeof d !== 'string') {
    if (d && d.reason !== 'no-wiki-clone') warnings.push(`wiki diff not posted: ${d.error || d.reason}`);
    return null;
  }
  let text = NO_WIKI_CHANGES;
  if (d.trim() !== '') {
    const fence = fenceFor(d);
    text = `## Wiki changes during objective ${id}\n\n${fence}diff\n${d.trimEnd()}\n${fence}`;
  }
  return { kind: 'upsert-pr-comment', target: { id, kind: 'wiki-diff' }, payload: { mode: 'replace', text } };
}

/**
 * The store-mode enqueue of `verification post`: the sticky `verification` comment and, when the objective has a PR
 * that has not merged, the verdict on the PR. The verdict is the VERIFICATION frontmatter `status:`:
 *   passed        post-status success (`Objective <id> verified (<score>)`), pr-ready, and the wiki-diff comment
 *   gaps_found    post-status failure; the PR stays a draft
 *   human_needed  post-status pending
 * The status carries no sha: the flusher resolves the PR head at flush (49-10), so `gh pr sync` first (the prose does)
 * and the status lands on the pushed tip. Every op is idempotent, so a status on every verify pass is safe.
 */
function verificationEnqueue(main, target, file, text) {
  let payloadText;
  try {
    payloadText = ghComments.fileCommentText(file, text);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const id = target.id;
  const ops = [{ kind: 'upsert-comment', target: { id, kind: 'verification' }, payload: { mode: 'replace', text: payloadText } }];
  const warnings = [];
  const entry = prOnRecord(main, id);
  if (entry && !entry.merged_at) {
    const fm = extractFrontmatter(text);
    const status = typeof fm.status === 'string' ? fm.status.trim() : '';
    const state = VERDICT_STATE[status];
    if (!state) {
      warnings.push(
        `VERIFICATION has no recognised \`status:\` in its frontmatter (got ${status === '' ? 'none' : JSON.stringify(status)}; `
        + `expected ${Object.keys(VERDICT_STATE).join(', ')}), so no status was posted on the PR`
      );
    } else {
      const score = fm.score !== undefined && String(fm.score).trim() !== '' ? String(fm.score).trim() : null;
      ops.push({
        kind: 'post-status',
        target: { id, context: VERIFY_CONTEXT },
        payload: { state, description: verdictDescription(id, state, score) },
      });
      if (state === 'success') {
        ops.push({ kind: 'pr-ready', target: { id }, payload: {} });
        const diff = wikiDiffOp(main, id, entry, warnings);
        if (diff) ops.push(diff);
      }
    }
  }
  const q = outbox.enqueue(main, ops);
  return warnings.length > 0 ? { ...q, warnings: [...(q.warnings || []), ...warnings] } : q;
}

/**
 * summaryPost(root, {trd, text, file?, noFlush, noWait}) — `summary post`: write the TRD's SUMMARY (local mode: in the
 * checkout holding `root`, a linked worktree included; store mode: the main cache, 53-01); store mode queues
 * it as the TRD issue's `summary` comment, takes the in-progress label off the TRD issue, refreshes the objective
 * PR's summary section when it has one (`pr_refresh` says why it did not), and removes the `.trd-progress/<trd>.md`
 * checkpoint.
 */
function summaryPost(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  if (typeof o.text !== 'string') return fail('summary post needs the SUMMARY text');
  const t = trdTarget(main, o.trd);
  if (t.error) return fail(t.error);
  const writeRoot = summaryWriteRoot(root, main);
  const name = summaryNameIn(writeRoot, t, o.file);
  const bad = checkFileName(name, 'the SUMMARY file');
  if (bad) return fail(bad);
  const rel = `objectives/${t.objective.dir}/${name}`;

  const note = {};
  const r = writeThrough(main, {
    rel,
    text: o.text,
    writeRoot,
    verb: 'summary post',
    enqueue: (m) => summaryEnqueue(m, t, name, o.text, note),
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
  });
  if (r.mode === STORE && readOrNull(r.path) === o.text) {
    fs.rmSync(planningFile(main, `.trd-progress/${t.id}.md`), { force: true });
  }
  return note.pr_refresh ? { ...r, pr_refresh: note.pr_refresh } : r;
}

/**
 * summaryCheckpoint(root, {trd, text, file?}) — per-task progress (D-12). Local: the SUMMARY file, exactly as
 * summary post writes it (the checkout holding `root`, 53-01). Store: `.planning/.trd-progress/<trd>.md`, a runtime file: no ledger, never queued (80
 * writes/min is GitHub's budget; a comment per task would spend it). `summary post` replaces it at the end.
 */
function summaryCheckpoint(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  if (typeof o.text !== 'string') return fail('summary checkpoint needs the SUMMARY text');
  const t = trdTarget(main, o.trd);
  if (t.error) return fail(t.error);
  const { mode } = planningMode.planningMode(main);
  if (mode === LOCAL) {
    const writeRoot = summaryWriteRoot(root, main);
    const name = summaryNameIn(writeRoot, t, o.file);
    const bad = checkFileName(name, 'the SUMMARY file');
    if (bad) return fail(bad);
    return writeThrough(main, { rel: `objectives/${t.objective.dir}/${name}`, text: o.text, writeRoot, verb: 'summary checkpoint' });
  }
  const rel = `.trd-progress/${t.id}.md`;
  const file = planningFile(main, rel);
  try {
    atomicWrite(file, o.text);
  } catch (e) {
    return fail(`could not write ${file}: ${e.message}`, { mode, rel, path: file });
  }
  return { ok: true, mode, rel, path: file, warnings: [], exit: EXIT.OK };
}

/**
 * verificationPost(root, {objective, text, file?, noFlush, noWait}) — `verification post`: write the objective's
 * VERIFICATION (the existing one, else `<NN>-VERIFICATION.md`); store mode queues the sticky `verification` comment.
 */
function verificationPost(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const main = mainRoot(root);
  if (!main) return fail(`no .planning/ directory at or above ${root}`);
  if (typeof o.text !== 'string') return fail('verification post needs the VERIFICATION text');
  const target = objectiveTarget(main, o.objective);
  if (target.error) return fail(target.error);
  const existing = listDir(path.join(main, '.planning', 'objectives', target.dir)).find((f) => /^(?:\d+(?:\.\d+)?-)?VERIFICATION\.md$/.test(f));
  const name = o.file !== undefined && o.file !== null ? o.file : existing || `${dirPrefix(target)}-VERIFICATION.md`;
  const bad = checkFileName(name, 'the VERIFICATION file');
  if (bad) return fail(bad);
  return writeThrough(main, {
    rel: `objectives/${target.dir}/${name}`,
    text: o.text,
    verb: 'verification post',
    enqueue: (m) => verificationEnqueue(m, target, name, o.text),
    noFlush: o.noFlush === true,
    noWait: o.noWait === true,
  });
}

// ─── doc put ─────────────────────────────────────────────────────────────────

/** Why doc put will not write `rel`, naming its class and the verb that owns it. */
function docRefusal(rel, c) {
  const article = /^[aeiou]/.test(c.class) ? 'an' : 'a';
  const head = `doc put writes wiki documents only; ${rel} is ${article} ${c.class} file`;
  if (c.verb) return `${head}, written by \`df-tools ${c.verb}\` (${c.hint})`;
  return `${head} (runtime state, not a planning document)`;
}

/**
 * docPut(root, {rel, text, message?, noFlush, noWait}) — `doc put`: any planning document with a wiki page
 * (gh-wiki.pageForCachePath) that no other verb owns. Store mode queues a wiki-push of its page.
 */
function docPut(root, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  let c;
  try {
    c = planningPaths.classify(o.rel);
  } catch (e) {
    return fail(e.message);
  }
  const rel = o.rel;
  if (ghWiki.pageForCachePath(rel) === null || c.verb !== 'doc put') return fail(docRefusal(rel, c), { rel });
  if (typeof o.text !== 'string') return fail('doc put needs the document text', { rel });
  const message = typeof o.message === 'string' && o.message.trim() !== '' ? o.message : `devflow: doc put ${rel}`;
  return writeThrough(root, {
    rel,
    text: o.text,
    verb: 'doc put',
    enqueue: (m) => outbox.enqueue(m, [wikiPushOp(m, [rel], message)]),
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
  STATUSES,
  writeThrough,
  putTrd,
  planPush,
  objectivePut,
  objectiveSetStatus,
  summaryPost,
  summaryCheckpoint,
  verificationPost,
  docPut,
  draftPath,
};
