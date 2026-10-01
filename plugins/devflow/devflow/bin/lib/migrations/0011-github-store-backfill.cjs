'use strict';

// Migration 0011 — github-store-backfill (objective 51, TRDs 51-06 / 51-07, GMD-01, GMD-02).
//
// Moves an existing local-mode project's planning history onto GitHub (the store of objective 47) and switches it to
// the cache model. It is a re-entrant phase machine over existing library calls. The outbox journal and the cache index
// are its only state, so any phase can be re-run after an interruption:
//
//   0  local preflight   no gh     not a git work tree, a merge/rebase in progress, a halted or blocked journal,
//                                  legacy-named TRDs, TRDs over the 60,000-char budget: refuse, listing every blocker
//                                  with its fix
//   1  remote preflight  reads     gh auth, capability detection (a writable token), the wiki and its first page
//   2  store switch                `github.store: true` in .planning/config.json (idempotent, backed up first)
//   3  queue                       `planImport({noFlush})` exactly once: skipped while the journal holds pending ops
//                                  (P3), live creates booked into the journal's budget window (G5)
//   [51-07]  4 drain, 5 verify, 6 the 0010 hand-off
//
// Confirm-only, never from a bare `--apply` or the SessionStart hook. `detect` is local and offline (zero gh calls, no
// writes), because `upgrade --check` runs it on every project:
//   GitHub disabled or no repo  -> not applicable (D-01 parity: a local project sees nothing)
//   store off                   -> applies; the reason is the plan summary (planImport dry run: objective and TRD
//                                  counts, history closes, the request estimate) and the pointer to the full plan
//   store on                    -> applies while the journal holds pending/blocked ops, a cache file has no baseline,
//                                  or 0010 still applies (the last phase hands off to it); else "already on GitHub"
//
// `apply` THROWS when `migrate` stops short (err.refusal = {code, details, ...}), exactly like 0010, so the runner
// reports a failure and never stamps 0011. Codes: preflight, pending, halted, verify, not_implemented (until 51-07).
//
// Test hooks: ctx.options.{now, sleep, maxOps} (51-07 passes them on to the client and the flush); the CLI never sets
// them. `userHome` always comes from ctx, never os.homedir().

const fs = require('fs');
const path = require('path');

const planningMode = require('../planning-mode.cjs');
const planningPaths = require('../planning-paths.cjs');
const planningImport = require('../planning-import.cjs');
const outbox = require('../gh-outbox.cjs');
const backfill = require('../gh-backfill.cjs');
const client = require('../gh-client.cjs');

const APPLY_COMMAND = '`df-tools upgrade --apply --only 0011 --confirm`';
const DRY_RUN_COMMAND = '`df-tools planning import --dry-run`';
const NOT_ENABLED = 'GitHub integration not enabled';
const COMPLETE = 'already on GitHub (backfill complete)';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cell = (s) => String(s === undefined || s === null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The MAIN checkout: the journal, the cache index and config.json all belong to it (D-14). */
function mainOf(ctx) {
  return planningMode.resolveMainRoot(ctx.projectRoot) || path.resolve(ctx.projectRoot);
}

function outboxOpts(ctx) {
  return ctx && ctx.userHome ? { home: ctx.userHome } : {};
}

function m0010() {
  return require('./0010-store-gitignore.cjs');
}

// ─── local reads (detect and preflight; never a write, never gh) ────────────────

/**
 * `{pending, blocked, halted, unreadable}` for the journal, read straight from disk. outbox.status would quarantine an
 * unparseable journal (a write); detect and the dry run must not write, so this reads raw. A missing journal is empty.
 */
function journalState(main, ctx) {
  const file = outbox.journalPath(main, outboxOpts(ctx));
  const empty = { pending: 0, blocked: 0, halted: null, unreadable: null };
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return empty;
    return { ...empty, unreadable: `${file}: ${e.message}` };
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ...empty, unreadable: file };
  }
  const ops = j && Array.isArray(j.ops) ? j.ops : [];
  return {
    pending: ops.filter((o) => o && o.status === 'pending').length,
    blocked: ops.filter((o) => o && o.status === 'blocked').length,
    halted: (j && j.halted) || null,
    unreadable: null,
  };
}

function journalPhrase(j) {
  if (j.unreadable !== null) return `the outbox journal is unreadable (${j.unreadable})`;
  const parts = [`${j.pending} outbox op(s) pending`];
  if (j.blocked) parts.push(`${j.blocked} blocked`);
  if (j.halted) parts.push(`halted (${j.halted.reason || 'unknown reason'})`);
  return parts.join(', ');
}

/** Cache-class files (planning-relative) with no cache-index baseline: not on GitHub yet. */
function unbaselined(main, ctx) {
  const index = outbox.readCacheIndex(main, outboxOpts(ctx));
  return planningPaths.listByClass(path.join(main, '.planning')).cache.filter((rel) => !Object.hasOwn(index, rel));
}

// ─── the plan (planning-import dry run) ─────────────────────────────────────────

function stayLocalRows(plan) {
  const rows = [];
  for (const x of Array.isArray(plan.refused) ? plan.refused : []) {
    const chars = Number.isFinite(x.chars) ? `${x.chars.toLocaleString('en-US')} chars, ` : '';
    rows.push([x.rel, `refused: ${chars}over the TRD budget${x.hint ? ` (${x.hint})` : ''}`]);
  }
  for (const x of Array.isArray(plan.kept_local) ? plan.kept_local : []) rows.push([x.rel, x.reason || '']);
  return rows;
}

/** One sentence: what the backfill puts on GitHub and what it costs, or "nothing to backfill". */
function planSentence(plan) {
  const e = plan.estimate || {};
  const stay = stayLocalRows(plan).length;
  if (!e.writes_max) return `nothing to backfill${stay ? ` (${plural(stay, 'file')} will stay local)` : ''}`;
  return `${plural(e.objectives || 0, 'objective')}, ${plural(e.trds || 0, 'TRD')} and ` +
    `${plural(e.history_closes || 0, 'history close')} to put on GitHub: ${backfill.renderEstimate(e)}; ` +
    `${plural(stay, 'file')} will stay local`;
}

/** The full plan, as `planning import --dry-run` prints it, plus any blocker apply would refuse on today. */
function planText(plan, blockers = []) {
  if (!plan.ok) return `0011 dry run: the backfill plan could not be computed (${plan.error}). Nothing was written.`;
  const lines = [`0011 dry run: nothing was written and GitHub was not called.${plan.preview
    ? ' Applying switches github.store on, then queues this plan.' : ''}`];
  const counts = Object.entries(plan.queued || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${k}`);
  lines.push(`backfill plan: ${counts.length ? `would queue ${counts.join(', ')}` : 'nothing to backfill'}.`);
  lines.push(`estimate: ${backfill.renderEstimate(plan.estimate)}`);
  if (plan.history) {
    lines.push(`history: ${plan.history.closed_completed} closed (completed), ${plan.history.closed_not_planned} closed (not planned)`);
  }
  const rows = stayLocalRows(plan);
  if (rows.length === 0) lines.push('will stay local: nothing.');
  else lines.push('will stay local:', '  | file | why |', '  |---|---|', ...rows.map(([rel, why]) => `  | ${cell(rel)} | ${cell(why)} |`));
  if (blockers.length) lines.push(`apply would refuse now (${plural(blockers.length, 'blocker')}):`, ...blockers.map((b) => `  - ${b}`));
  lines.push(`full plan: ${DRY_RUN_COMMAND}; apply: ${APPLY_COMMAND}`);
  return lines.join('\n');
}

// ─── detect ─────────────────────────────────────────────────────────────────────

/** Local and offline: zero gh calls, no writes. Called by `upgrade --check` on every project. */
function detect(ctx) {
  const main = mainOf(ctx);
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { applies: false, reason: `${NOT_ENABLED} (${gate.reason})` };

  if (!planningMode.isStoreMode(main)) {
    const plan = planningImport.planImport(main, { dryRun: true });
    const summary = plan.ok ? planSentence(plan) : `the plan could not be computed (${plan.error})`;
    return {
      applies: true,
      reason: `GitHub backfill not started (github.store is off): ${summary}. Full plan: ${DRY_RUN_COMMAND}; ` +
        `run it with ${APPLY_COMMAND}.`,
    };
  }

  const j = journalState(main, ctx);
  if (j.unreadable !== null || j.pending || j.blocked || j.halted) {
    return {
      applies: true,
      reason: `GitHub backfill in progress: ${journalPhrase(j)}. Resume it with ${APPLY_COMMAND}; ` +
        '`df-tools gh outbox status` shows the queue.',
    };
  }
  const missing = unbaselined(main, ctx);
  if (missing.length) {
    const plan = planningImport.planImport(main, { dryRun: true });
    return {
      applies: true,
      reason: `GitHub backfill incomplete: ${plural(missing.length, 'cache file')} not on GitHub yet` +
        `${plan.ok ? `; ${planSentence(plan)}` : ''}. Full plan: ${DRY_RUN_COMMAND}; finish it with ${APPLY_COMMAND}.`,
    };
  }
  const handoff = m0010().detect(ctx);
  if (handoff.applies) {
    return {
      applies: true,
      reason: `GitHub backfill drained; the 0010 hand-off is still ahead (${handoff.reason}). Finish it with ${APPLY_COMMAND}.`,
    };
  }
  return { applies: false, reason: COMPLETE };
}

// ─── phases ─────────────────────────────────────────────────────────────────────

function preflightLocal() {
  throw new Error('0011 preflightLocal lands in TRD 51-06 task 2');
}

function preflightRemote() {
  throw new Error('0011 preflightRemote lands in TRD 51-06 task 2');
}

function ensureStoreSwitch() {
  throw new Error('0011 ensureStoreSwitch lands in TRD 51-06 task 3');
}

function queue() {
  throw new Error('0011 queue lands in TRD 51-06 task 3');
}

// ─── migrate / apply ────────────────────────────────────────────────────────────

/** A typed stop: `refused` is the one-line message the runner reports; `notes` the same, one item per line. */
function stop(code, details, { changed = [], notes = [] } = {}) {
  const shown = details.slice(0, 20);
  const more = details.length > shown.length ? `; and ${details.length - shown.length} more` : '';
  const verb = code === 'preflight' ? 'refused' : 'stopped';
  const refused = `0011 ${verb} (${code}): ${shown.join('; ')}${more}`;
  return { applied: false, refused, code, details, changed, notes: [`0011 ${verb} (${code}):`, ...details.map((d) => `  - ${d}`), ...notes].join('\n') };
}

/**
 * migrate(ctx) -> the dry-run plan, a typed stop (`{applied:false, refused, code, details}`), or
 * `{applied:false, notes}` when not applicable. Never throws on a refusal.
 */
function migrate(ctx) {
  const main = mainOf(ctx);
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { applied: false, changed: [], notes: `not applicable: ${NOT_ENABLED} (${gate.reason})` };

  const plan = planningImport.planImport(main, { dryRun: true });
  if (ctx.dryRun) return { applied: false, dryRun: true, changed: [], notes: planText(plan, []) };

  return stop('not_implemented', ['phases 0-3 land in TRD 51-06 tasks 2-3']);
}

/** Upgrade-runner adapter: a stop THROWS, so the runner reports it as failed and never stamps 0011. */
function apply(ctx) {
  const res = migrate(ctx);
  if (res.refused) {
    const err = new Error(res.refused);
    err.refusal = res;
    throw err;
  }
  return res;
}

module.exports = {
  id: '0011',
  title: 'Backfill planning history into the GitHub store',
  since: '2.13.0',
  safety: 'confirm',
  detect,
  apply,
  migrate,
  preflightLocal,
  preflightRemote,
  ensureStoreSwitch,
  queue,
  journalState,
  planText,
  APPLY_COMMAND,
};
