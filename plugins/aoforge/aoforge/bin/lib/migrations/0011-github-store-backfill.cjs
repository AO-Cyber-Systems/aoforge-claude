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
//   4  drain             writes    a bounded flush loop inside the budgets; the hour budget, the per-run write budget,
//                                  offline or maxOps stop it resumably (`pending`), a halt stops it (`halted`); only a
//                                  drained flush settles the verb-write ledger (baselines)
//   5  verify            reads     `gh pull --all` (exit 0 or 2) and the orphan report per objective: every TRD file has
//                                  an issue and every TRD issue a file, linked under its objective; any gap: `verify`
//   6  hand-off                    0010.migrate in-process: gitignore and untrack the cache, the store-mode commit steps
//
// Confirm-only, never from a bare `--apply` or the SessionStart hook. `detect` is local and offline (zero gh calls, no
// writes), because `upgrade --check` runs it on every project:
//   GitHub disabled or no repo  -> not applicable (D-01 parity: a local project sees nothing)
//   store off + github.mirror_only true
//                               -> skipped (52-04): the project recorded that it keeps mirror mode; only boolean true
//                                  opts out, and only while the store is off
//   store off                   -> applies; the reason is the plan summary (planImport dry run: objective and TRD
//                                  counts, history closes, the request estimate), the pointer to the full plan and
//                                  the opt-out (`config-set github.mirror_only true`)
//   store on                    -> applies while the journal holds pending/blocked ops, a cache file has no baseline,
//                                  or 0010 still applies (the last phase hands off to it); else "already on GitHub"
//
// `apply` THROWS when `migrate` stops short (err.refusal = {code, details, ...}), exactly like 0010, so the runner
// reports a failure and never stamps 0011. Codes: preflight, pending (not an error: the rest resumes), halted, verify,
// handoff (0010 refused). An apply that completes also records 0010 in the stamp: it ran in-process, and the runner
// stamps only what it ran itself.
//
// Test hooks: ctx.options.{now, sleep, maxOps} (the drain's clock, sleep and op cap; `now` also books live writes); the
// CLI never sets them. `userHome` always comes from ctx, never os.homedir().

const fs = require('fs');
const path = require('path');

const planningMode = require('../planning-mode.cjs');
const planningPaths = require('../planning-paths.cjs');
const planningImport = require('../planning-import.cjs');
const outbox = require('../gh-outbox.cjs');
const backfill = require('../gh-backfill.cjs');
const client = require('../gh-client.cjs');
const ghCapability = require('../gh-capability.cjs');
const { TRD_MAX_CHARS } = require('../gh-trd.cjs');
const upgrade = require('../upgrade.cjs');
const { mdCell } = require('../text-escape.cjs');

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

const APPLY_COMMAND = '`aof-tools upgrade --apply --only 0011 --confirm`';
const DRY_RUN_COMMAND = '`aof-tools planning import --dry-run`';
const NOT_ENABLED = 'GitHub integration not enabled';
const COMPLETE = 'already on GitHub (backfill complete)';
// 52-04: the recorded opt-out (github.mirror_only: true), honoured only while the store is off.
const MIRROR_ONLY = 'mirror mode kept (github.mirror_only: true): the GitHub store backfill is opted out. ' +
  `To migrate later, run \`aof-tools config-set github.mirror_only false\`, then ${APPLY_COMMAND}.`;
const KEEP_MIRROR = ' To keep mirror mode instead: `aof-tools config-set github.mirror_only true`.';
const CONFIG_REL = '.planning/config.json';
// P5: the partial window between the store switch and the end of the migration.
const PARTIAL_WINDOW = 'until the migration finishes, the project is in store mode: the edit gate denies cache edits and ' +
  '`aof-tools commit` refuses the default branch';
// P7: `gh setup` is never folded into 0011; its order is printed instead.
const SETUP_NOTE = 'next, `aof-tools gh setup` (not part of this migration): commit the change above through a pull ' +
  'request first; then run `aof-tools gh setup --apply`, merge its workflow pull request with a one-time admin bypass ' +
  '(the required checks exist only once the workflow is on the default branch), and only then require the checks';
const STATUS_HINT = '`aof-tools gh outbox status` shows the queue';
/** Bounded: a drain that keeps meeting minute-budget or short retry-after waits stops after this many flushes. */
const DRAIN_ROUNDS = 20;
/** A rate-limit retry-after up to this long is slept through (on the injected sleep); a longer one stops the apply. */
const SHORT_WAIT_MS = 60 * 1000;
/**
 * A local file GitHub must hold an issue for: a TRD (a pull orphan here is a gap). OBJECTIVE.md is not: pull reads it
 * from a wiki page, so its orphan is a page question (an attention item), and a missing objective issue surfaces in
 * reportOrphans instead.
 */
const ISSUE_FILE_RE = /^objectives\/[^/]+\/[^/]+-TRD\.md$/;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  // The wiki clone is never a cache file (gh-cache.listOwnedLocal): nothing baselines it.
  return planningPaths.listByClass(path.join(main, '.planning')).cache
    .filter((rel) => !rel.startsWith('wiki/') && !Object.hasOwn(index, rel));
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
  else lines.push('will stay local:', '  | file | why |', '  |---|---|', ...rows.map(([rel, why]) => `  | ${mdCell(rel)} | ${mdCell(why)} |`));
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
    // Checked before the dry run: an opted-out project pays nothing. With the store on the key is ignored (below), so a
    // backfill in flight is never hidden.
    if (gate.config && gate.config.mirror_only === true) return { applies: false, reason: MIRROR_ONLY };
    const plan = planningImport.planImport(main, { dryRun: true });
    const summary = plan.ok ? planSentence(plan) : `the plan could not be computed (${plan.error})`;
    return {
      applies: true,
      reason: `GitHub backfill not started (github.store is off): ${summary}. Full plan: ${DRY_RUN_COMMAND}; ` +
        `run it with ${APPLY_COMMAND}.${KEEP_MIRROR}`,
    };
  }

  const j = journalState(main, ctx);
  if (j.unreadable !== null || j.pending || j.blocked || j.halted) {
    return {
      applies: true,
      reason: `GitHub backfill in progress: ${journalPhrase(j)}. Resume it with ${APPLY_COMMAND}; ` +
        '`aof-tools gh outbox status` shows the queue.',
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

/**
 * A git read through objective-branch's runGit, the named git seam (gh-seam test 20: this migration spawns nothing,
 * TRD 51-08). The variables that would redirect git at another repository are unset for the child (an undefined env
 * value is dropped by child_process), so the answer is about `cwd`.
 */
function git(cwd, args) {
  const unset = Object.fromEntries(GIT_REDIRECT_VARS.map((key) => [key, undefined]));
  const r = require('../objective-branch.cjs').runGit(args, { cwd, env: unset });
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
    return [`outbox: the journal is unreadable (${j.unreadable}): move it aside (\`aof-tools gh outbox status\` names it), then re-run`];
  }
  const resolve = '`aof-tools gh outbox resolve <seq> --accept-remote|--overwrite`';
  const out = [];
  if (j.halted) {
    out.push(`outbox: halted (${j.halted.reason || 'unknown reason'}): look at it with \`aof-tools gh outbox status\`, ` +
      `resolve it with ${resolve}, then re-run`);
  }
  if (j.blocked) {
    out.push(`outbox: ${j.blocked} blocked op(s): resolve each with ${resolve} (\`aof-tools gh outbox status\` lists them), then re-run`);
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
    out.push(`the wiki repository could not be reached${detail}: check \`github.wiki.remote\` (or AOFORGE_WIKI_REMOTE) and your ` +
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

/** The migration's clock: ctx.options.now (a test hook: ms or a function), else the gh client's injectable clock. */
function clockOf(ctx) {
  const n = ctx && ctx.options ? ctx.options.now : undefined;
  if (typeof n === 'function') return n;
  if (typeof n === 'number' && Number.isFinite(n)) return () => n;
  return () => client.now();
}

/** The time live writes are booked at. */
function nowOf(ctx) {
  return clockOf(ctx)();
}

/** The drain's sleep: ctx.options.sleep (a test hook), else the gh client's injectable sleep. */
function sleepOf(ctx) {
  const s = ctx && ctx.options ? ctx.options.sleep : undefined;
  return typeof s === 'function' ? s : (ms) => client.sleep(ms);
}

/** ctx.options.maxOps (a test hook): the most ops this apply flushes, across every round of the drain. */
function maxOpsOf(ctx) {
  const m = ctx && ctx.options ? ctx.options.maxOps : undefined;
  return Number.isInteger(m) && m >= 0 ? m : null;
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
  const based = recordObjectiveBases(ctx);
  return {
    ok: true, skipped: false, pending: backfill.hasPendingOps(main, opts).pending, live_writes: live, report, based,
  };
}

/**
 * Phase 3 (after the import): the objective issues the import created or found LIVE (outside the outbox) get their
 * remote-edit base now. The flush records a base only after it writes, so without this an objective's first queued
 * body patch has no base and ADOPTS whatever GitHub holds: a human edit of the managed sections between an
 * interrupted run and its resume would be merged over silently instead of halting (TRD 51-08). One paginated list
 * of the objective label, reads only; an objective that already has a base keeps it.
 * @returns {{ok:true, recorded:number} | {ok:false, error:string}}
 */
function recordObjectiveBases(ctx) {
  const main = mainOf(ctx);
  const ghMapping = require('../gh-mapping.cjs');
  const flushLib = require('../gh-outbox-flush.cjs');
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { ok: false, error: gate.reason };
  const mapping = ghMapping.readMappingV3(main);
  const wanted = new Map();
  for (const [id, e] of Object.entries(mapping.objectives || {})) {
    if (e && Number.isInteger(e.issue_id) && !outbox.getBase(main, id)) wanted.set(e.issue_id, id);
  }
  if (wanted.size === 0) return { ok: true, recorded: 0 };
  const configured = gate.labels && typeof gate.labels.objective === 'string' && gate.labels.objective !== ''
    ? gate.labels.objective : 'aoforge:objective';
  const r = client.ghPaginate(`repos/${gate.repo}/issues?labels=${encodeURIComponent(configured)}&state=all`);
  if (!r.ok) return { ok: false, error: `could not list ${configured} issues: ${r.error || 'gh api failed'}` };
  let recorded = 0;
  for (const issue of r.items) {
    if (!issue || !wanted.has(issue.number)) continue;
    const set = outbox.setBase(main, wanted.get(issue.number), flushLib.baseFromIssue(issue, null));
    if (set.ok) recorded += 1;
  }
  return { ok: true, recorded };
}

/**
 * Phase 3b (a resume only): the mapping is state too. When `.planning/.gh-mapping.json` lost entries after the queue
 * phase (deleted, or a run killed between an issue create and the mapping write), the ops still queued that address an
 * issue by id (links, edges, comments, closes, fields) would block with "has no issue yet" and halt the drain. Every
 * AOForge issue carries its `aoforge:id` marker, so each id GitHub has and the mapping lacks is re-adopted by marker:
 * one paginated list per AOForge label, reads only. An entry the mapping still has always wins; an id two issues claim
 * is left out, never guessed (its ops then block and the drain stops `halted` for a human).
 * @returns {{ok:true, adopted:string[], duplicates:string[]} | {ok:false, error:string}}
 */
function readoptMapping(ctx) {
  const main = mainOf(ctx);
  const ghMapping = require('../gh-mapping.cjs');
  const ghBody = require('../gh-body.cjs');
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { ok: false, error: gate.reason };
  const read = ghMapping.readMappingV3WithReport(main);
  if (read.error) return { ok: false, error: read.error };
  const mapping = read.mapping;
  const configured = gate.labels && typeof gate.labels === 'object' ? gate.labels : {};
  const labelOf = (role, fallback) => (typeof configured[role] === 'string' && configured[role] !== '' ? configured[role] : fallback);
  const lists = [
    labelOf('objective', 'aoforge:objective'),
    labelOf('trd', 'aoforge:trd'),
    labelOf('decision', 'aoforge:decision'),
    ...Object.keys(outbox.ENTITY_ROLES).map((role) => labelOf(role, outbox.ENTITY_ROLES[role].label)),
  ];
  const adopted = [];
  const duplicates = [];
  for (const label of [...new Set(lists)]) {
    const r = client.ghPaginate(`repos/${gate.repo}/issues?labels=${encodeURIComponent(label)}&state=all`);
    if (!r.ok) return { ok: false, error: `could not list ${label} issues: ${r.error || r.stderr || 'gh api failed'}` };
    const issues = r.items.filter((i) => i && typeof i === 'object' && !i.pull_request && Number.isInteger(i.number));
    const restOf = new Map(issues.map((i) => [i.number, i.id]));
    const index = ghBody.indexByMarker(issues.map((i) => ({ number: i.number, body: typeof i.body === 'string' ? i.body : '' })));
    for (const id of Object.keys(index.duplicates)) if (!duplicates.includes(id)) duplicates.push(id);
    for (const [id, number] of Object.entries(index.byId)) {
      const tid = ghMapping.toTrdId(id);
      const ent = tid === null ? ghMapping.toEntityId(id) : null;
      const oid = tid === null && ent === null ? ghMapping.toObjectiveId(id) : null;
      const rest = restOf.get(number);
      if (tid !== null) {
        if (ghMapping.getTrd(mapping, tid) || !Number.isInteger(rest)) continue;
        ghMapping.setTrd(mapping, tid, { issue_number: number, rest_id: rest });
      } else if (ent !== null) {
        if (ghMapping.getEntity(mapping, ent.id) || !Number.isInteger(rest)) continue;
        ghMapping.setEntity(mapping, ent.id, { issue_number: number, rest_id: rest });
      } else if (oid !== null) {
        if (ghMapping.getEntry(mapping, oid)) continue;
        ghMapping.setEntry(mapping, oid, { issue_id: number });
      } else {
        continue;
      }
      adopted.push(id);
    }
  }
  if (adopted.length) {
    const w = ghMapping.writeMappingV3(main, mapping);
    if (!w.ok) return { ok: false, error: `could not save .planning/.gh-mapping.json: ${w.error}` };
  }
  return { ok: true, adopted, duplicates };
}

function readoptNote(r) {
  if (!r.ok) return `mapping: could not check it against GitHub (${r.error}); the drain goes on with it as it is`;
  const dup = r.duplicates.length
    ? `; left out, two issues claim each (a human must close all but one): ${r.duplicates.join(', ')}` : '';
  if (r.adopted.length === 0) return `mapping: complete${dup}`;
  return `mapping: re-adopted ${plural(r.adopted.length, 'issue')} from GitHub by aoforge:id marker (the mapping had ` +
    `lost them): ${r.adopted.join(', ')}${dup}`;
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
    where = path.join(ctx.userHome, '.claude', 'aoforge', 'backups', upgrade.repoKey(main));
  } catch {
    where = path.join(String(ctx.userHome), '.claude', 'aoforge', 'backups');
  }
  return `rollback: set github.store to false (the backups are under ${where})`;
}

// ─── phase 4: drain ─────────────────────────────────────────────────────────────

/** The client's per-run write budget is spent: no wait inside this process frees it (a new run starts at zero). */
const runBudgetSpent = () => client.writeCount() >= client.WRITE_BUDGET_PER_RUN;

/** `{remaining, total}` ops in the journal. Done ops are pruned past 200, so `total` also counts every seq handed out. */
function opCounts(main, ctx, at) {
  const st = outbox.status(main, { ...outboxOpts(ctx), now: at });
  const remaining = st.pending + st.blocked;
  const total = Math.max(remaining + st.done, Number.isInteger(st.next_seq) ? st.next_seq - 1 : 0);
  return { remaining, total };
}

/**
 * Why a flush stopped short and when to come back: `{reason, budget, wait_ms, resume_at}`. A rate limit raised by
 * the client's own per-run cap is reported as a budget stop: a new run may start at once (`run`) unless the journal's
 * rolling hour or minute window is also spent, whose wait it then reports.
 */
function stopInfo(main, ctx, res, at) {
  let reason = res.status === 'pending' ? res.reason || 'pending' : res.status;
  let budget = res.budget || null;
  let wait = Number.isFinite(res.wait_ms) ? Math.max(0, res.wait_ms) : null;
  if (reason === 'rate_limited' && runBudgetSpent()) {
    const b = outbox.budgetCheck(outbox.readJournal(main, { ...outboxOpts(ctx), now: at }).journal, at);
    reason = 'budget';
    budget = b.ok ? 'run' : b.reason;
    wait = b.ok ? 0 : Math.max(0, b.wait_ms);
  } else if (reason === 'rate_limited' && Number.isFinite(res.retry_after)) {
    wait = Math.max(0, res.retry_after - at);
  }
  return { reason, budget, wait_ms: wait, resume_at: wait === null ? null : new Date(at + wait).toISOString() };
}

const BUDGET_WHY = {
  hour: `GitHub's hourly write budget (${outbox.BUDGET.hour}/h) is spent`,
  minute: `the per-minute write budget (${outbox.BUDGET.minute}/min) is spent`,
  run: `this run's write budget (${client.WRITE_BUDGET_PER_RUN} gh writes) is spent`,
};

function whyText(info, res) {
  switch (info.reason) {
    case 'budget': return BUDGET_WHY[info.budget] || 'a write budget is spent';
    case 'offline': return 'GitHub could not be reached';
    case 'rate_limited': return 'GitHub rate limited the writes';
    case 'retry_after': return 'an earlier failure asked for a delay that has not passed yet';
    case 'max_ops': return 'the op limit for this apply (maxOps) was reached';
    case 'pending': return `GitHub is not ready for the next op yet${res.detail ? ` (${res.detail})` : ''}`;
    case 'running': return 'another flush holds the outbox lock';
    case 'rounds': return `the drain used all ${DRAIN_ROUNDS} of its flushes`;
    case 'error': return `the flush failed (${res.error || 'unknown error'}); the work stays queued`;
    default: return res.reason || res.error || `the flush ended ${res.status}`;
  }
}

/**
 * Phase 4: drain the outbox inside the budgets: up to DRAIN_ROUNDS flushes with `wait:true`. Each result goes through
 * gh-store-cli.flushResult, which settles the verb-write ledger ONLY on a drained (`flushed`) flush, exactly as
 * `gh outbox flush` does, so a partial flush never baselines anything.
 *   continue  pending on the minute budget; a rate limit whose retry-after is <= 60 s (slept through)
 *   stop      the hour budget, the per-run write budget, offline, maxOps, a longer retry-after, a busy lock or an error
 *             -> `{ok:false, code:'pending'}`; a halt -> `{ok:false, code:'halted'}`. Never sleeps through the hour.
 */
function drain(ctx) {
  const main = mainOf(ctx);
  const flushLib = require('../gh-outbox-flush.cjs');
  const storeCli = require('../gh-store-cli.cjs');
  const now = clockOf(ctx);
  const sleep = sleepOf(ctx);
  const maxOps = maxOpsOf(ctx);
  let done = 0;
  let res = null;
  let prose = '';
  // Every exit below but `continue` is a `break` or a return, so `round` reaches DRAIN_ROUNDS only when the loop ran
  // out of flushes while still allowed to continue (TRD 51-08: a retry-after too long to sleep through broke out
  // early and was misreported as 'rounds').
  let round = 0;
  for (; round < DRAIN_ROUNDS; round++) {
    const opts = { wait: true, now, sleep };
    if (maxOps !== null) opts.maxOps = Math.max(0, maxOps - done);
    try {
      res = flushLib.flush(main, opts);
    } catch (e) {
      res = { status: 'error', done: [], warnings: [], error: e && e.message ? e.message : String(e) };
    }
    const cli = storeCli.flushResult(main, res);
    prose = cli.prose.trim();
    done += Array.isArray(res.done) ? res.done.length : 0;
    if (res.status === 'flushed') {
      return { ok: true, done, settled: cli.payload.settled || [], settle_warning: cli.payload.settle_warning || null, prose };
    }
    if (res.status === 'halted') return { ok: false, code: 'halted', done, res, prose };
    if (res.status !== 'pending' || runBudgetSpent()) break;
    if (res.reason === 'budget' && res.budget === 'minute') continue;
    if (res.reason === 'rate_limited' || res.reason === 'retry_after') {
      let wait = SHORT_WAIT_MS;
      if (res.reason === 'retry_after' && Number.isFinite(res.wait_ms)) wait = res.wait_ms;
      else if (Number.isFinite(res.retry_after)) wait = res.retry_after - now();
      if (wait <= SHORT_WAIT_MS) {
        if (wait > 0) sleep(wait);
        continue;
      }
    }
    break;
  }
  const exhausted = round === DRAIN_ROUNDS;
  const info = exhausted ? { ...stopInfo(main, ctx, res, now()), reason: 'rounds' } : stopInfo(main, ctx, res, now());
  return { ok: false, code: 'pending', done, res, prose, ...info, why: whyText(info, res) };
}

/**
 * Phase 4b (after a drained flush): an objective's structural body sections (`wiki`, whose `aoforge:dir` marker is how
 * `gh pull` places the objective's TRDs; `trds`; `meta`) reach GitHub in its one queued patch-body. When a human edit
 * halted that op and it was resolved `--accept-remote`, the op was dropped whole, so the objective stayed unplaceable
 * and verify could never pass (TRD 51-08). Each objective with an issue whose GitHub body lacks its `aoforge:dir`
 * marker gets the same patch-body re-queued (gh-hierarchy.buildOps) with NO caller sections: summary, criteria and
 * footer stay as GitHub has them, so the accepted human edit survives. Reads: one list of the objective label.
 * @returns {{ok:true, repaired:string[]} | {ok:false, error:string}}
 */
function repairObjectiveBodies(ctx) {
  const main = mainOf(ctx);
  const ghMapping = require('../gh-mapping.cjs');
  const ghHierarchy = require('../gh-hierarchy.cjs');
  const ghBody = require('../gh-body.cjs');
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { ok: false, error: gate.reason };
  const mapping = ghMapping.readMappingV3(main);
  const local = ghMapping.listObjectiveIndex(main).filter((o) => o.dir && ghMapping.getEntry(mapping, o.id));
  if (local.length === 0) return { ok: true, repaired: [] };
  const label = gate.labels && typeof gate.labels.objective === 'string' && gate.labels.objective !== ''
    ? gate.labels.objective : 'aoforge:objective';
  const r = client.ghPaginate(`repos/${gate.repo}/issues?labels=${encodeURIComponent(label)}&state=all`);
  if (!r.ok) return { ok: false, error: `could not list ${label} issues: ${r.error || 'gh api failed'}` };
  const byNumber = new Map(r.items.filter((i) => i && Number.isInteger(i.number)).map((i) => [i.number, i]));
  const ops = [];
  const repaired = [];
  for (const o of local) {
    const issue = byNumber.get(ghMapping.getEntry(mapping, o.id).issue_id);
    if (!issue || ghBody.parseDirMarker(typeof issue.body === 'string' ? issue.body : '') === o.dir) continue;
    const plan = ghHierarchy.planPush(main, o.id);
    if (!plan.ok) continue; // verify names the objective
    const op = ghHierarchy.buildOps(plan).find((x) => x.kind === 'patch-body');
    if (!op) continue;
    ops.push(op);
    repaired.push(o.id);
  }
  if (ops.length) {
    const q = outbox.enqueue(main, ops, { now: nowOf(ctx) });
    if (!q.ok) return { ok: false, error: q.error || 'could not queue the repair' };
  }
  return { ok: true, repaired };
}

function minutesText(ms) {
  const min = Math.ceil(ms / 60000);
  return min >= 120 ? `~${Math.round(min / 60)} h` : `~${min} min`;
}

/** The `pending` stop: not an error; how much remains, why, and when (and how) it resumes. */
function pendingDetails(d, counts) {
  let resume;
  if (d.wait_ms === null) {
    resume = `resume once that clears: run ${APPLY_COMMAND} again, or keep working and let the gh-flush hook drain it; ${STATUS_HINT}`;
  } else if (d.wait_ms === 0) {
    resume = `resume now: run ${APPLY_COMMAND} again, or keep working and let the gh-flush hook drain it; ${STATUS_HINT}`;
  } else {
    resume = `resume at ${d.resume_at} (in ${minutesText(d.wait_ms)}): run ${APPLY_COMMAND} again then, or keep working ` +
      `and let the gh-flush hook drain it; ${STATUS_HINT}`;
  }
  return [
    `not an error: ${counts.remaining} of ${counts.total} ops remain (${d.why}); ${plural(d.done, 'op')} written to GitHub by this apply`,
    resume,
  ];
}

/** The `halted` stop: a human must look first. */
function haltedDetails(d, counts) {
  const h = (d.res && d.res.halted) || {};
  const seq = Number.isInteger(h.seq) ? h.seq : '<seq>';
  const on = d.res && Number.isInteger(d.res.issue_number) ? ` on #${d.res.issue_number}` : '';
  return [
    `the outbox halted at op ${seq} (${h.reason || 'blocked'}${h.detail ? `: ${h.detail}` : ''})${on}; ` +
      `${counts.remaining} of ${counts.total} ops remain and nothing done is lost`,
    `look at it with \`aof-tools gh outbox status\`, resolve it with \`aof-tools gh outbox resolve ${seq} ` +
      `--accept-remote|--overwrite\`, then re-run ${APPLY_COMMAND}`,
  ];
}

function drainNote(d) {
  const settled = d.settled.length ? `; ${plural(d.settled.length, 'file')} baselined (the ledger settled)` : '';
  const warn = d.settle_warning ? `; warning: ${d.settle_warning}` : '';
  return `drain: ${plural(d.done, 'op')} written to GitHub by this apply; the outbox is empty${settled}${warn}`;
}

// ─── phase 5: verify ────────────────────────────────────────────────────────────

/**
 * Phase 5 (after a drained flush): GitHub must hold the local plan before 0010 untracks the cache.
 *   `gh pull --all`  gh-cache.pullAll, the library behind the command (its hand-maintained ROADMAP/STATE protection
 *                    intact): exit 0 and exit 2 (rebuilt, attention items listed in the notes) pass; exit 1 refuses
 *   per objective    a TRD (or OBJECTIVE.md) file with no issue (a pull orphan), a TRD issue with no file
 *                    (reportOrphans missing_local, pull orphan_trds), a TRD issue not linked under its objective
 *                    (reportOrphans unlinked), an objective with TRDs but no issue
 * @returns {{gaps:string[], notes:string[]}}
 */
function verify(ctx) {
  const main = mainOf(ctx);
  const ghCache = require('../gh-cache.cjs');
  const ghHierarchy = require('../gh-hierarchy.cjs');
  const ghMapping = require('../gh-mapping.cjs');
  let pulled;
  try {
    pulled = ghCache.pullAll(main, {});
  } catch (e) {
    pulled = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  if (!pulled.ok) return { gaps: [`\`gh pull --all\` failed (exit 1): ${pulled.error || pulled.reason || 'unknown error'}`], notes: [] };

  const exit = pulled.attention.length > 0 || pulled.errors.length > 0 ? 2 : 0;
  const notes = [`verify: \`gh pull --all\` exit ${exit}: ${pulled.written.length} written, ${pulled.skipped.length} unchanged`];
  for (const a of pulled.attention) notes.push(`  - ${a}`);
  for (const e of pulled.errors) notes.push(`  - error: ${e}`);
  for (const n of pulled.notes) notes.push(`  - note: ${n}`);

  const gaps = [];
  for (const rel of pulled.orphans.filter((r) => ISSUE_FILE_RE.test(r))) gaps.push(`.planning/${rel}: GitHub has no issue for it`);
  for (const x of pulled.orphan_trds || []) gaps.push(`TRD issue #${x.number} (${x.id}): no objective to place it under`);
  const mapping = ghMapping.readMappingV3(main);
  let objectives = 0;
  for (const o of ghMapping.listObjectiveIndex(main).filter((x) => x.dir)) {
    let trds;
    try {
      trds = ghHierarchy.readObjectiveTrds(main, o.id);
    } catch (e) {
      gaps.push(`objective ${o.id}: ${e.message}`);
      continue;
    }
    if (trds.length === 0 && !ghMapping.getEntry(mapping, o.id)) continue;
    objectives += 1;
    const rep = ghHierarchy.reportOrphans(main, o.id);
    if (!rep.ok) {
      gaps.push(`objective ${o.id}: ${rep.error}`);
      continue;
    }
    for (const x of rep.unlinked) gaps.push(`TRD issue #${x.number} (${x.id}) is not linked under objective ${o.id}`);
    for (const x of rep.missing_local) gaps.push(`TRD issue #${x.number} (${x.id}) has no TRD file locally`);
  }
  notes.push(`verify: ${plural(objectives, 'objective')} checked for orphans: ${gaps.length ? plural(gaps.length, 'gap') : 'none'}`);
  return { gaps, notes };
}

/**
 * Phase 5b: files the confirmed plan keeps local (planImport's kept_local: a decision with no `trd:`, a document no
 * wiki page maps to) have no GitHub home, so no drained flush ever baselines them, and 0010 would refuse them as "not
 * on GitHub yet" forever. The user confirmed the plan that lists them (the will-stay-local table, OQ5: they block
 * nothing), so they are baselined as they are: 0010 untracks them with the rest of the cache, they stay on disk and in
 * the backup, and `gh pull --all` keeps listing them as local-only orphans. Anything the import would still QUEUE is a
 * real gap: nothing is baselined and the apply refuses `verify`.
 * @returns {{gaps:string[], kept:string[]}}
 */
function settleLocalOnly(ctx) {
  const main = mainOf(ctx);
  const plan = planningImport.planImport(main, { dryRun: true });
  if (!plan.ok) return { gaps: [`the backfill plan could not be recomputed: ${plan.error}`], kept: [] };
  const queued = Object.entries(plan.queued || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${k}`);
  if (queued.length) {
    return { gaps: [`GitHub does not hold everything yet: the import would still queue ${queued.join(', ')} (${DRY_RUN_COMMAND} lists them)`], kept: [] };
  }
  const cache = new Set(planningPaths.listByClass(path.join(main, '.planning')).cache);
  const index = outbox.readCacheIndex(main, outboxOpts(ctx));
  const kept = [...new Set((plan.kept_local || []).map((x) => x.rel))].filter((rel) => cache.has(rel) && !Object.hasOwn(index, rel));
  if (kept.length) require('../gh-cache.cjs').recordCacheBaseline(main, kept);
  return { gaps: [], kept };
}

// ─── phase 6: the 0010 hand-off ─────────────────────────────────────────────────

/**
 * The runner stamps only what it ran; 0010 ran in-process, so its id joins `aoforge.migrations_applied` (the record
 * of what ran) before the runner writes 0011's stamp over the same block.
 */
function recordHandoff(main) {
  const cfg = JSON.parse(fs.readFileSync(path.join(main, CONFIG_REL), 'utf-8'));
  const prev = cfg && cfg.aoforge && typeof cfg.aoforge === 'object' && !Array.isArray(cfg.aoforge) ? cfg.aoforge : {};
  const applied = Array.isArray(prev.migrations_applied) ? prev.migrations_applied.map(String) : [];
  if (applied.includes('0010')) return;
  upgrade.writeStamp(main, { ...prev, migrations_applied: [...applied, '0010'].sort() });
}

// ─── migrate / apply ────────────────────────────────────────────────────────────

/**
 * A typed stop: `refused` is the one-line message the runner reports; `notes` the same, one item per line. `extra`
 * carries the machine-readable fields (a `pending` stop: reason, budget, remaining, total, wait_ms, resume_at).
 */
function stop(code, details, { changed = [], notes = [], extra = {} } = {}) {
  const shown = details.slice(0, 20);
  const more = details.length > shown.length ? `; and ${details.length - shown.length} more` : '';
  const verb = code === 'preflight' ? 'refused' : 'stopped';
  const refused = `0011 ${verb} (${code}): ${shown.join('; ')}${more}`;
  return {
    ...extra,
    applied: false,
    refused,
    code,
    details,
    changed,
    notes: [`0011 ${verb} (${code}):`, ...details.map((d) => `  - ${d}`), ...notes].join('\n'),
  };
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
    ? ['will stay local:', '  | file | why |', '  |---|---|', ...stayLocal.map(([rel, why]) => `  | ${mdCell(rel)} | ${mdCell(why)} |`)]
    : [];

  // Phase 3b (a resume only): re-adopt by marker whatever the mapping lost since the queue phase.
  const readopted = q.skipped ? readoptMapping(ctx) : null;
  const queued = readopted ? [queueNote(q), readoptNote(readopted)] : [queueNote(q)];

  // Phase 4: drain inside the budgets. A stop leaves everything resumable: done ops stay done, the rest stays queued,
  // and the ledger is settled only by a drained flush.
  let d = drain(ctx);
  // Phase 4b (after a drained flush): an objective body that lost its derived sections gets them back, then drains.
  const repaired = d.ok ? repairObjectiveBodies(ctx) : null;
  if (repaired && repaired.ok && repaired.repaired.length) {
    queued.push(`repair: re-queued the derived sections (wiki, trds, meta) of ${plural(repaired.repaired.length, 'objective')} ` +
      `whose GitHub body lost its aoforge:dir marker (a dropped body patch): ${repaired.repaired.join(', ')}; ` +
      'the summary, criteria and footer stay as GitHub has them');
    const d2 = drain(ctx);
    d = d2.ok ? { ...d2, done: d.done + d2.done, settled: [...d.settled, ...d2.settled] } : { ...d2, done: d.done + d2.done };
  } else if (repaired && !repaired.ok) {
    queued.push(`repair: could not check the objective bodies (${repaired.error}); verify reports any gap`);
  }
  if (!d.ok) {
    const counts = opCounts(main, ctx, clockOf(ctx)());
    const tail = [...queued, ...switched];
    const more = [...notes, d.prose];
    if (d.code === 'halted') return stop('halted', [...haltedDetails(d, counts), ...tail], { changed, notes: more });
    return stop('pending', [...pendingDetails(d, counts), ...tail], {
      changed,
      notes: more,
      extra: {
        reason: d.reason, budget: d.budget, remaining: counts.remaining, total: counts.total, done: d.done,
        wait_ms: d.wait_ms, resume_at: d.resume_at,
      },
    });
  }

  // Phase 5: verify. Any gap refuses, and 0010 does not run (it must never untrack what GitHub does not hold).
  const v = verify(ctx);
  if (v.gaps.length) {
    return stop('verify', [
      ...v.gaps,
      'fix each gap on GitHub or locally (`aof-tools gh orphans <objective>` lists them; `aof-tools gh sync <objective>` ' +
        `re-pushes one), then re-run ${APPLY_COMMAND}`,
      ...switched,
    ], { changed, notes: [...notes, drainNote(d), ...v.notes] });
  }

  // Phase 5b: the files the confirmed plan keeps local get their baseline, so 0010 can untrack them with the rest.
  const keep = settleLocalOnly(ctx);
  if (keep.gaps.length) {
    return stop('verify', [...keep.gaps, `then re-run ${APPLY_COMMAND}`, ...switched], {
      changed, notes: [...notes, drainNote(d), ...v.notes],
    });
  }
  if (keep.kept.length) {
    v.notes.push(`kept local (in the plan you confirmed): ${plural(keep.kept.length, 'file')} GitHub does not hold, ` +
      `baselined so the cache can be untracked; they stay on disk and in the backup: ${keep.kept.join(', ')}`);
  }

  // Phase 6: the hand-off to 0010 (gitignore and untrack the cache), in-process.
  const r10 = m0010().migrate(ctx);
  if (r10.refused) {
    const details = Array.isArray(r10.details) && r10.details.length ? r10.details : [r10.refused];
    return stop('handoff', [...details.map((x) => `0010: ${x}`), ...switched], {
      changed, notes: [...notes, drainNote(d), ...v.notes, r10.refused],
    });
  }
  const tenNotes = String(r10.notes || '');
  return {
    applied: true,
    changed: [...new Set([...changed, ...(r10.changed || [])])],
    handoff: r10.applied === true ? '0010' : null,
    notes: [
      ...queued,
      switched[0],
      drainNote(d),
      ...v.notes,
      `0010: ${tenNotes}`,
      ...(tenNotes.includes(m0010().STORE_COMMIT_STEPS) ? [] : [m0010().STORE_COMMIT_STEPS]),
      SETUP_NOTE,
      ...notes,
    ].join('\n'),
  };
}

/**
 * Upgrade-runner adapter: a stop THROWS, so the runner reports it as failed and never stamps 0011. A completed apply
 * that ran 0010 records it in the stamp (recordHandoff).
 */
function apply(ctx) {
  const res = migrate(ctx);
  if (res.refused) {
    const err = new Error(res.refused);
    err.refusal = res;
    throw err;
  }
  if (res.handoff === '0010' && !ctx.dryRun) recordHandoff(mainOf(ctx));
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
