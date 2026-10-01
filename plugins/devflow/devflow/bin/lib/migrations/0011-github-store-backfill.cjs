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
const { spawnSync } = require('child_process');

const planningMode = require('../planning-mode.cjs');
const planningPaths = require('../planning-paths.cjs');
const planningImport = require('../planning-import.cjs');
const outbox = require('../gh-outbox.cjs');
const backfill = require('../gh-backfill.cjs');
const client = require('../gh-client.cjs');
const ghCapability = require('../gh-capability.cjs');
const { TRD_MAX_CHARS } = require('../gh-trd.cjs');
const upgrade = require('../upgrade.cjs');

const LEGACY_TRD_RE = /^objectives\/[^/]+\/(\d+(?:\.\d+)?-\d+)-TRD-(.+)\.md$/;
const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];
const REBASE = 'a rebase in progress: finish it (`git rebase --continue`) or abort it (`git rebase --abort`), then re-run';
// [file in the per-worktree git dir, blocker]
const IN_PROGRESS = [
  ['MERGE_HEAD', 'a merge in progress (MERGE_HEAD): finish it (`git merge --continue`) or abort it (`git merge --abort`), then re-run'],
  ['rebase-merge', REBASE],
  ['rebase-apply', REBASE],
  ['CHERRY_PICK_HEAD', 'a cherry-pick in progress (CHERRY_PICK_HEAD): finish it (`git cherry-pick --continue`) or abort it ' +
    '(`git cherry-pick --abort`), then re-run'],
  ['REVERT_HEAD', 'a revert in progress (REVERT_HEAD): finish it (`git revert --continue`) or abort it (`git revert --abort`), then re-run'],
];

const APPLY_COMMAND = '`df-tools upgrade --apply --only 0011 --confirm`';
const DRY_RUN_COMMAND = '`df-tools planning import --dry-run`';
const NOT_ENABLED = 'GitHub integration not enabled';
const COMPLETE = 'already on GitHub (backfill complete)';
const CONFIG_REL = '.planning/config.json';
// P5: the partial window between the store switch and the end of the migration.
const PARTIAL_WINDOW = 'until the migration finishes, the project is in store mode: the edit gate denies cache edits and ' +
  '`df-tools commit` refuses the default branch';
const NOT_YET = 'drain lands in TRD 51-07: until then `df-tools gh outbox flush` drains the queue and ' +
  '`df-tools gh outbox status` shows it';

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

function gitEnv() {
  const env = { ...process.env };
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  return env;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv(), input: '', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  return { status: r.status, out: (r.stdout || '').trim() };
}

/** The in-progress git operations (per-worktree git dir), one blocker each; rebase-merge/-apply share one. */
function gitOperationBlockers(main) {
  const r = git(main, ['rev-parse', '--git-dir']);
  if (r.status !== 0 || !r.out) return [];
  const gitDir = path.resolve(main, r.out);
  const out = [];
  for (const [name, text] of IN_PROGRESS) {
    if (fs.existsSync(path.join(gitDir, name)) && !out.includes(text)) out.push(text);
  }
  return out;
}

function journalBlockers(main, ctx) {
  const j = journalState(main, ctx);
  if (j.unreadable !== null) {
    return [`outbox: the journal is unreadable (${j.unreadable}): move it aside (\`df-tools gh outbox status\` names it), then re-run`];
  }
  const resolve = '`df-tools gh outbox resolve <seq> --accept-remote|--overwrite`';
  const out = [];
  if (j.halted) {
    out.push(`outbox: halted (${j.halted.reason || 'unknown reason'}): look at it with \`df-tools gh outbox status\`, ` +
      `resolve it with ${resolve}, then re-run`);
  }
  if (j.blocked) {
    out.push(`outbox: ${j.blocked} blocked op(s): resolve each with ${resolve} (\`df-tools gh outbox status\` lists them), then re-run`);
  }
  return out;
}

function legacyBlockers(main) {
  const out = [];
  for (const rel of planningPaths.listByClass(path.join(main, '.planning')).runtime) {
    const m = LEGACY_TRD_RE.exec(rel);
    if (m) out.push(`${rel}: legacy TRD name has no GitHub home; rename it to ${m[1]}-${m[2]}-TRD.md`);
  }
  return out;
}

function oversizeBlockers(plan) {
  return (Array.isArray(plan.refused) ? plan.refused : []).map((x) => {
    const chars = Number.isFinite(x.chars) ? `${x.chars.toLocaleString('en-US')} chars is ` : '';
    return `${x.rel}: ${chars}over the ${TRD_MAX_CHARS.toLocaleString('en-US')}-char TRD budget; ${x.hint || planningImport.BUDGET_HINT}`;
  });
}

/**
 * Phase 0 (no gh, no writes): every local blocker with its fix, or []. `opts.plan` reuses a planImport dry run.
 * Not a git work tree, a merge/rebase/cherry-pick in progress, a halted, blocked or unreadable journal, legacy-named
 * TRDs (no GitHub home; 0010 would refuse them later anyway), TRDs over the 60,000-char budget (planImport refuses
 * their objective, so they would never get a baseline and 0010 would refuse).
 */
function preflightLocal(ctx, opts = {}) {
  const main = mainOf(ctx);
  const out = [];
  const inside = git(main, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.out !== 'true') {
    out.push(`not a git work tree (${main}): run the migration in the project's git checkout`);
  } else {
    out.push(...gitOperationBlockers(main));
  }
  out.push(...journalBlockers(main, ctx));
  out.push(...legacyBlockers(main));
  const plan = opts.plan || planningImport.planImport(main, { dryRun: true });
  if (!plan.ok) out.push(`the backfill plan could not be computed: ${plan.error}`);
  else out.push(...oversizeBlockers(plan));
  return out;
}

/**
 * Phase 1 (apply only; GitHub reads, zero writes): gh auth, capability detection (as pushHierarchy does) and the wiki.
 * A wiki with no first page would halt the drain twenty minutes in (gh-outbox-flush DEFAULT_WIKI_BLOCK); refusing here
 * costs nothing. A disabled wiki refuses too: the backfill's reference text belongs in the wiki (51-06 test 5).
 */
function preflightRemote(ctx) {
  const main = mainOf(ctx);
  try {
    require('../gh.cjs').requireGhAuth(['repo']);
  } catch (e) {
    if (!e || e.name !== 'GhAuthError') throw e;
    if (e.offline) return ['GitHub could not be reached (`gh auth status` failed on the network): the backfill starts online; re-run when connected'];
    return [`gh: ${e.message} Fix: \`${e.remediation}\`, then re-run`];
  }
  const caps = ghCapability.detectCapabilities(main, { refresh: true });
  if (!caps.ok) return [`GitHub: ${caps.error}`];
  if (caps.offline) return ['GitHub could not be reached while detecting what the repository supports: re-run when connected'];
  const modes = ghCapability.resolveModes(caps);
  const out = [];
  if (!modes.writable) {
    out.push(`no push permission on ${caps.repo} (a read-only token): authenticate as an account with write access ` +
      '(`gh auth login`, or `gh auth refresh -h github.com -s repo`), then re-run');
  }
  if (caps.wiki === 'disabled') {
    out.push(`the wiki is disabled on ${caps.repo}: enable it (Settings > General > Features > Wikis), create its first ` +
      'page in the GitHub web UI, then re-run');
  } else if (caps.wiki === 'uninitialised') {
    out.push(`the wiki has no first page: create the first wiki page in the GitHub web UI (https://github.com/${caps.repo}/wiki), then re-run`);
  } else if (caps.wiki === 'unavailable') {
    const detail = caps.wiki_detail ? ` (${String(caps.wiki_detail).trim()})` : '';
    out.push(`the wiki repository could not be reached${detail}: check \`github.wiki.remote\` (or DEVFLOW_WIKI_REMOTE) and your ` +
      'git credentials, then re-run');
  }
  return out;
}

/** The indent config.json is written with (its first indented key), so a rewrite keeps the file's own style. */
function indentOf(text) {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1] : 2;
}

/**
 * Phase 2: `github.store = true` in the main checkout's .planning/config.json, every other key and the trailing newline
 * kept. Already on -> `{changed:false}` and nothing written. Otherwise the project is backed up first (upgrade.backup,
 * plus `0011-config.json.before`), so the rollback note can name the exact backup.
 * @returns {{changed:boolean, rel:string, backup:string|null}}
 */
function ensureStoreSwitch(ctx) {
  const main = mainOf(ctx);
  if (planningMode.isStoreMode(main)) return { changed: false, rel: CONFIG_REL, backup: null };
  const file = path.join(main, '.planning', 'config.json');
  const text = fs.readFileSync(file, 'utf-8');
  const cfg = JSON.parse(text);
  if (!cfg || typeof cfg !== 'object' || !cfg.github || typeof cfg.github !== 'object' || Array.isArray(cfg.github)) {
    throw new Error(`${CONFIG_REL} has no github block to switch`);
  }
  const backup = upgrade.backup({ projectRoot: main, userHome: ctx.userHome });
  fs.writeFileSync(path.join(backup, '0011-config.json.before'), text);
  cfg.github.store = true;
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, indentOf(text))}${text.endsWith('\n') ? '\n' : ''}`);
  return { changed: true, rel: CONFIG_REL, backup };
}

/** The clock live writes are booked at: ctx.options.now (a test hook: ms or a function), else the gh client's. */
function nowOf(ctx) {
  const n = ctx && ctx.options ? ctx.options.now : undefined;
  if (typeof n === 'function') return n();
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return client.now();
}

/**
 * Phase 3: queue the backfill exactly once. While the journal holds any op (pitfall P3) the import is NOT re-run: its
 * ops are the ones still pending. Otherwise `planImport({noFlush})` queues every create and then the history closes, and
 * the live writes it made outside the outbox (objective creates, milestones) are booked into the journal's budget
 * window so the drain paces around them (G5).
 * @returns {{ok:true, skipped:boolean, pending:number, live_writes:number, report:object|null}
 *   | {ok:false, error:string, live_writes:number, report:object}}
 */
function queue(ctx) {
  const main = mainOf(ctx);
  const opts = outboxOpts(ctx);
  const p = backfill.hasPendingOps(main, opts);
  if (p.any) return { ok: true, skipped: true, pending: p.pending, live_writes: 0, report: null };
  const before = client.writeCount();
  let report;
  try {
    report = planningImport.planImport(main, { noFlush: true });
  } catch (e) {
    report = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  const live = client.writeCount() - before;
  backfill.recordLiveWrites(main, live, nowOf(ctx), opts);
  if (!report.ok) return { ok: false, error: report.error || 'planning import failed', live_writes: live, report };
  return { ok: true, skipped: false, pending: backfill.hasPendingOps(main, opts).pending, live_writes: live, report };
}

function queueNote(q) {
  if (q.skipped) return `queue: already queued: ${q.pending} outbox op(s) pending; not re-imported (resume)`;
  const r = q.report;
  const counts = Object.entries(r.queued || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${k}`);
  const closes = r.estimate ? r.estimate.history_closes || 0 : 0;
  if (counts.length === 0 && closes === 0) return 'queue: nothing to backfill';
  return `queue: queued ${counts.join(', ') || 'the history closes'} and ${plural(closes, 'history close')} ` +
    `(${q.pending} outbox op(s) pending); ${plural(q.live_writes, 'live write')} booked into the budget window; ` +
    `estimate: ${backfill.renderEstimate(r.estimate)}`;
}

function rollbackNote(sw, ctx, main) {
  if (sw.backup) return `rollback: set github.store to false (the backup is at ${sw.backup})`;
  let where;
  try {
    where = path.join(ctx.userHome, '.claude', 'devflow', 'backups', upgrade.repoKey(main));
  } catch {
    where = path.join(String(ctx.userHome), '.claude', 'devflow', 'backups');
  }
  return `rollback: set github.store to false (the backups are under ${where})`;
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
  // Phase 0: local preflight. The dry run lists what apply would refuse on today, but never refuses itself.
  const local = preflightLocal(ctx, { plan });
  if (ctx.dryRun) return { applied: false, dryRun: true, changed: [], notes: planText(plan, local) };
  if (local.length) return stop('preflight', local);

  // Phase 1: remote preflight (reads only).
  const remote = preflightRemote(ctx);
  if (remote.length) return stop('preflight', remote);

  // Phase 2: the store switch. From here until the migration finishes the project is in store mode (P5).
  const sw = ensureStoreSwitch(ctx);
  const changed = sw.changed ? [CONFIG_REL] : [];
  const switched = [
    sw.changed ? 'store switch: github.store set to true in .planning/config.json' : 'store switch: github.store already true',
    PARTIAL_WINDOW,
    rollbackNote(sw, ctx, main),
  ];

  // Phase 3: queue (once; resume-aware).
  const q = queue(ctx);
  if (!q.ok) return stop('preflight', [`planning import failed: ${q.error}`, ...switched], { changed });
  const stayLocal = q.report ? stayLocalRows(q.report) : [];
  const notes = stayLocal.length
    ? ['will stay local:', '  | file | why |', '  |---|---|', ...stayLocal.map(([rel, why]) => `  | ${cell(rel)} | ${cell(why)} |`)]
    : [];

  // Phases 4-6 (drain, verify, the 0010 hand-off) land in TRD 51-07.
  return stop('not_implemented', [queueNote(q), ...switched, NOT_YET], { changed, notes });
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
