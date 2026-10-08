'use strict';

// Migration 0010 — store-gitignore (TRD 48-10, GWP-04, U-1, D-17).
//
// In GitHub store mode (planning-mode.cjs: `github.enabled === true && github.store === true`) GitHub is the source of
// truth and `.planning/` is a cache. U-1 fixes what stays in git: exactly `.planning/config.json` and
// `.planning/STACK.md`. Everything else is gitignored through one managed `.gitignore` block —
//
//   # >>> aoforge store (0010) >>>
//   .planning/*
//   !.planning/config.json
//   !.planning/STACK.md
//   # <<< aoforge store (0010) <<<
//
// — and every other tracked `.planning/` path is removed from the INDEX ONLY. Working files are never deleted, moved or
// rewritten. `.planning/*` (not `.planning/`) is deliberate: a directory rule hides config.json too, and a fresh clone
// could then not even tell it is a store-mode project.
//
// Why confirm-only, never auto: `upgrade-project.js` applies `auto` migrations on SessionStart and commits them. Applied
// at the wrong moment this migration drops every planning document from git; that must be a person's decision, made
// once everything is safely on GitHub. In local mode (this repository's mode) `detect` is never applicable, and `apply`
// re-checks the mode itself, so even a direct call cannot untrack a local project.
//
// Preconditions (apply only, all local — the migration never runs `gh` and never pulls):
//   1. the outbox journal for this root has no `pending` or `blocked` op and is not halted (TRD 51-04: a pending-only
//      journal makes `detect` defer instead, so the runner skips 0010 and reaches a resumable 0011 backfill);
//   2. every cache-class file on disk hashes (gh-trd contentHash) to its cache-index baseline, i.e. GitHub holds it;
//   3. no tracked TRD carries the legacy name `NN-MM-TRD-<slug>.md`. 47's TRD parser cannot read that shape (48-01
//      classifies it runtime), so it has no GitHub home; untracking it would quietly take a real TRD out of the
//      repository. It is refused with the rename that gives it a home (`NN-MM-<slug>-TRD.md`).
// Any failure refuses with every blocker listed and writes nothing in the project.
//
// Runtime-class files (workstreams/, STATE_ARCHIVE.md, quick-dir extras, ...) have no GitHub home either; by D-17 they
// are untracked like the rest and reported as `local_only` ("kept on this machine only after untrack").
//
// Lessons reused from 0008: "is it ignored" is decided by `git check-ignore --no-index` with the user's global excludes
// switched off, never by string-matching `.gitignore`; git runs with redirect variables scrubbed; removal is
// `rm --cached` with literal pathspecs; and the follow-up `aof-tools commit` records staged removals with a whole-index
// commit (lib/misc.cjs cmdCommit, which 48-10 also taught to skip ignored, unknown planning paths per path). That
// commit is printed as STORE_COMMIT_STEPS (TRD 51-04): branch, logged gate escape, push, pull request, and (TRD 52-01)
// the `gh pr start` route for a linked branch, built by commit-steps.cjs like every other printed commit follow-up.
//
// managed-block.cjs is not used for the markers: its START/END markers are fixed HTML comments, and in a .gitignore a
// `<!-- ... -->` line is a pattern, not a comment. The block helper here keeps the same guarantees (bytes outside the
// block are preserved; two blocks or an unterminated block refuse).
//
// Scope: the ROOT `.planning/` only. Store mode is a root-level config; nested `**/.planning/` dirs are out of scope.
//
// Exports: `apply` is the upgrade-runner adapter (a refusal THROWS, so the runner reports it as failed, halts later
// writes and never stamps 0010 as applied). `migrate` returns the full report or `{applied:false, refused, details}`.
// `discover` is shared with doctor check 24.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const planningMode = require('../planning-mode.cjs');
const planningPaths = require('../planning-paths.cjs');
const outbox = require('../gh-outbox.cjs');
const ghTrd = require('../gh-trd.cjs');
const upgrade = require('../upgrade.cjs');
const { branchCommitSteps, commitCommand } = require('../commit-steps.cjs');

const GITIGNORE_REL = '.gitignore';
const BLOCK_START = '# >>> aoforge store (0010) >>>';
const BLOCK_END = '# <<< aoforge store (0010) <<<';
const LEGACY_TRD_RE = /^objectives\/[^/]+\/(\d+(?:\.\d+)?-\d+)-TRD-(.+)\.md$/;
const RM_BATCH = 200;
const LOCAL_ONLY_NOTE = 'kept on this machine only after untrack (no GitHub home)';
// TRD 51-04 (G6): the follow-up commit. 0010 only ever applies in store mode, where `aof-tools commit` refuses the default
// branch and any branch no objective PR names (objective 50's gate), so a bare commit line would always exit 1. Print
// the sequence that works instead: a new branch, the logged escape (gate `gh` in .planning/.override-log.jsonl), push,
// and a pull request. Self-contained so 51-07 can print it after 0011 as well.
// TRD 52-01: built by the shared commit-steps builder, which adds the linked-branch route (`aof-tools gh pr start
// <objective>`, then the bare command). Still a string constant computed once at load: 0011 dedupes its notes on
// `tenNotes.includes(m0010().STORE_COMMIT_STEPS)`.
const STORE_BRANCH = 'aoforge-store-cache';
const STORE_COMMIT_STEPS = branchCommitSteps({
  branch: STORE_BRANCH,
  reason: 'store migration',
  command: commitCommand('chore: gitignore the planning cache (store mode)', ['.gitignore', '.planning/']),
});
const REMEDY = 'Get everything onto GitHub first: run `aof-tools planning import`, `aof-tools gh outbox flush` and ' +
  '`aof-tools gh pull --all`, then re-run `aof-tools upgrade --apply --only 0010 --confirm`.';
// A path the block must ignore; used to verify the written rules (it need not exist).
const PROBE_IGNORED = '.planning/objectives/00-probe/00-01-probe-TRD.md';

const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function gitEnv() {
  const env = { ...process.env };
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  return env;
}

function git(ctx, args, input) {
  const r = spawnSync('git', args, {
    cwd: ctx.projectRoot,
    env: gitEnv(),
    input: input === undefined ? '' : input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), error: r.error };
}

const splitZ = (text) => text.split('\0').filter(Boolean);

function isWorkTree(ctx) {
  const r = git(ctx, ['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && r.out.trim() === 'true';
}

// ─── the managed .gitignore block ───────────────────────────────────────────────

function blockLines() {
  return [BLOCK_START, ...planningPaths.gitignoreLines(), BLOCK_END];
}

/** Locate the block: null when absent, `{start, end, inner:[lines]}`; throws on two blocks or a missing end marker. */
function readBlock(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((l, i) => { if (l.replace(/\r$/, '') === BLOCK_START) starts.push(i); });
  if (starts.length === 0) return null;
  if (starts.length > 1) throw new Error(`.gitignore holds ${starts.length} "${BLOCK_START}" blocks; refusing to edit it`);
  const end = lines.findIndex((l, i) => i > starts[0] && l.replace(/\r$/, '') === BLOCK_END);
  if (end === -1) throw new Error(`.gitignore has "${BLOCK_START}" with no "${BLOCK_END}"; refusing to edit it`);
  return { start: starts[0], end, inner: lines.slice(starts[0] + 1, end).map((l) => l.replace(/\r$/, '')) };
}

/** `{present, current, error}` for the project's .gitignore. */
function blockState(root) {
  const text = readGitignore(root);
  if (text === null) return { present: false, current: false, error: null };
  try {
    const b = readBlock(text);
    if (!b) return { present: false, current: false, error: null };
    const want = planningPaths.gitignoreLines();
    const current = b.inner.length === want.length && b.inner.every((l, i) => l === want[i]);
    return { present: true, current, error: null };
  } catch (e) {
    return { present: true, current: false, error: e.message };
  }
}

/** `text` with the block replaced in place, or appended newline-safely. Bytes outside the block are kept. */
function upsertBlock(text) {
  const block = blockLines();
  if (text === null || text === '') return `${block.join('\n')}\n`;
  const b = readBlock(text);
  if (b) {
    const lines = text.split('\n');
    return [...lines.slice(0, b.start), ...block, ...lines.slice(b.end + 1)].join('\n');
  }
  const sep = /\n\n$/.test(text) ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${sep}${block.join('\n')}\n`;
}

function readGitignore(root) {
  try {
    return fs.readFileSync(path.join(root, GITIGNORE_REL), 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

function restoreGitignore(root, before) {
  const file = path.join(root, GITIGNORE_REL);
  if (before === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, before);
}

/** Which of `paths` an ignore rule covers (global excludes off; negated matches count as NOT ignored). */
function ignoredSet(ctx, paths) {
  const r = git(ctx, ['-c', `core.excludesFile=${os.devNull}`, 'check-ignore', '--no-index', '--stdin', '-z'],
    paths.map((p) => `${p}\0`).join(''));
  if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore failed: ${r.err || r.status}`);
  return new Set(splitZ(r.out));
}

// ─── discovery ──────────────────────────────────────────────────────────────────

function classOf(rel) {
  try {
    return planningPaths.classify(rel).class;
  } catch {
    return 'runtime';
  }
}

/**
 * The root `.planning/` as git tracks it:
 *   tracked  every tracked `.planning/` path (project-relative)
 *   track    those that stay tracked (class tracked-config)
 *   untrack  everything else (project-relative)
 *   byClass  {cache, generated, runtime}: planning-relative rels of `untrack`
 *   legacy   planning-relative tracked TRDs with the legacy `NN-MM-TRD-<slug>.md` name
 *   block    {present, current, error} for the managed .gitignore block
 * A directory that is not a git work tree tracks nothing.
 */
function discover(ctx) {
  const empty = { cache: [], generated: [], runtime: [] };
  if (!isWorkTree(ctx)) return { tracked: [], track: [], untrack: [], byClass: empty, legacy: [], block: blockState(ctx.projectRoot) };
  const r = git(ctx, ['ls-files', '-z', '--', '.planning']);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.err || r.status}`);
  const tracked = [...new Set(splitZ(r.out).filter((p) => p.startsWith('.planning/')))].sort();
  const track = [];
  const untrack = [];
  const byClass = { cache: [], generated: [], runtime: [] };
  const legacy = [];
  for (const full of tracked) {
    const rel = full.slice('.planning/'.length);
    const cls = classOf(rel);
    if (cls === 'tracked-config') {
      track.push(full);
      continue;
    }
    untrack.push(full);
    byClass[cls].push(rel);
    if (LEGACY_TRD_RE.test(rel)) legacy.push(rel);
  }
  return { tracked, track, untrack, byClass, legacy, block: blockState(ctx.projectRoot) };
}

// ─── detect ─────────────────────────────────────────────────────────────────────

/**
 * What 0010 would do, ignoring the outbox: the pre-51-04 `detect`. `migrate` uses this directly so a direct call still
 * reaches the precondition check and refuses on a pending, blocked or halted journal with the full blocker list.
 */
function assess(ctx) {
  if (!isWorkTree(ctx)) return { applies: false, reason: 'not a git work tree' };
  const mode = planningMode.planningMode(ctx.projectRoot);
  if (mode.mode !== planningMode.STORE) {
    return { applies: false, reason: `local mode (${mode.reason}): .planning/ stays tracked` };
  }
  const found = discover(ctx);
  if (found.untrack.length === 0 && found.block.current) {
    return { applies: false, reason: 'store mode: only config.json and STACK.md are tracked and the .gitignore block is current' };
  }
  const parts = [];
  if (found.untrack.length) {
    const c = found.byClass;
    parts.push(`store mode: ${found.untrack.length} .planning/ path(s) still tracked besides config.json and STACK.md ` +
      `(cache ${c.cache.length}, generated ${c.generated.length}, runtime ${c.runtime.length})`);
  }
  if (found.block.error) parts.push(`.gitignore block unreadable: ${found.block.error}`);
  else if (!found.block.current) parts.push(found.block.present ? '.gitignore block outdated' : '.gitignore block missing');
  if (found.legacy.length) parts.push(`apply is blocked until ${found.legacy.length} legacy TRD name(s) are renamed`);
  return { applies: true, reason: parts.join('; '), tracked: found.untrack.length };
}

/** The deferral reason while the outbox only has pending ops to drain (none blocked, not halted, readable); else null. */
function backfillDeferral(root) {
  const j = journalState(root);
  if (j.unreadable !== null || j.blocked > 0 || j.halted || j.pending === 0) return null;
  return `GitHub backfill in progress: ${j.pending} outbox op(s) pending. Resume it with ` +
    '`aof-tools upgrade --apply --only 0011 --confirm`, or let the gh-flush hook drain it; 0010 runs after the drain.';
}

function detect(ctx) {
  const det = assess(ctx);
  if (!det.applies) return det;
  // TRD 51-04 (G4): a pending-only journal makes 0010 SKIP rather than apply-and-refuse. A refusal is a runner failure,
  // and the runner halts every later migration on a failure, so a resumed 0011 backfill (whose queued ops are exactly
  // these pending ones) could never be reached by a bare `upgrade --apply --confirm`. Any pending op defers, backfill or
  // an ordinary unflushed write: 0010 cannot succeed until the drain either way, and "skipped with a reason" beats
  // "failed". Blocked or halted keep applying (and `migrate` refuses): a human has to act there. Reads the local
  // journal only; no gh call, and nothing here calls into 0011.
  const deferral = backfillDeferral(ctx.projectRoot);
  if (deferral) return { applies: false, reason: deferral, deferred: true, tracked: det.tracked };
  return det;
}

// ─── preconditions ──────────────────────────────────────────────────────────────

/**
 * `{pending, blocked, halted, unreadable}` for this root's outbox journal. A missing journal is empty; `unreadable` is
 * the detail text (null when the journal read and parsed). Local file only; no gh call.
 */
function journalState(root) {
  const file = outbox.journalPath(root);
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

function journalBlockers(root) {
  const j = journalState(root);
  if (j.unreadable !== null) return [`outbox: journal unreadable (${j.unreadable})`];
  const out = [];
  if (j.pending) out.push(`outbox: ${j.pending} pending op(s)`);
  if (j.blocked) out.push(`outbox: ${j.blocked} blocked op(s)`);
  if (j.halted) out.push(`outbox: halted (${j.halted.reason || 'unknown reason'})`);
  return out;
}

function cacheBlockers(root) {
  const index = outbox.readCacheIndex(root);
  const out = [];
  // The wiki clone (`wiki/**`) is read through the page store and is never a cache file (gh-cache.listOwnedLocal):
  // nothing baselines it, so it must not block the switch (objective 51, TRD 51-07).
  for (const rel of planningPaths.listByClass(path.join(root, '.planning')).cache.filter((r) => !r.startsWith('wiki/'))) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, '.planning', ...rel.split('/')), 'utf-8');
    } catch (e) {
      out.push(`${rel}: unreadable (${e.code || e.message})`);
      continue;
    }
    if (!Object.hasOwn(index, rel)) out.push(`${rel}: not on GitHub yet (no baseline)`);
    else if (index[rel] !== ghTrd.contentHash(text)) out.push(`${rel}: changed since last sync`);
  }
  return out;
}

function legacyBlockers(legacy) {
  return legacy.map((rel) => {
    const m = LEGACY_TRD_RE.exec(rel);
    return `${rel}: legacy TRD name has no GitHub home; rename it to ${m[1]}-${m[2]}-TRD.md`;
  });
}

function refusal(refused, details) {
  return { applied: false, refused, details, changed: [], notes: refused };
}

function refusalText(details, hasLegacy) {
  const shown = details.slice(0, 20);
  const more = details.length > shown.length ? `; and ${details.length - shown.length} more` : '';
  const rename = hasLegacy
    ? ' Rename each legacy TRD (NN-MM-TRD-<slug>.md -> NN-MM-<slug>-TRD.md) so it gets a GitHub home.'
    : '';
  return `0010 refused (${details.length} blocker(s)): ${shown.join('; ')}${more}.${rename} ${REMEDY}`;
}

// ─── migrate / apply ────────────────────────────────────────────────────────────

function summary(found) {
  const c = found.byClass;
  return {
    untracked: { cache: c.cache.length, generated: c.generated.length, runtime: c.runtime.length },
    local_only: [...c.runtime],
    local_only_note: LOCAL_ONLY_NOTE,
    gitignore: GITIGNORE_REL,
  };
}

function notesFor(found, gitignoreChanged) {
  const s = summary(found);
  const parts = [
    gitignoreChanged ? 'wrote the store-mode .gitignore block' : '.gitignore block already current',
    `untracked ${found.untrack.length} .planning/ path(s) (cache ${s.untracked.cache}, generated ${s.untracked.generated}, ` +
      `runtime ${s.untracked.runtime})`,
  ];
  if (s.local_only.length) parts.push(`${LOCAL_ONLY_NOTE}: ${s.local_only.join(', ')}`);
  parts.push(STORE_COMMIT_STEPS);
  return parts.join('; ');
}

/** Undo the index removals made so far, put .gitignore back, and say why. */
function rollback(ctx, removed, before, why) {
  if (removed.length) git(ctx, ['--literal-pathspecs', 'reset', '-q', '--', ...removed]);
  restoreGitignore(ctx.projectRoot, before);
  return refusal(`0010 refused: ${why}; the index and .gitignore were restored`, [why]);
}

/**
 * migrate(ctx) -> the full report, `{applied:false, refused, details}` on a refusal, or `{applied:false, notes}` when
 * not applicable. Never throws on a refusal.
 */
function migrate(ctx) {
  // assess, not detect: the 51-04 backfill deferral is for the runner; a direct call still refuses on the journal below.
  const det = assess(ctx);
  if (!det.applies) return { applied: false, changed: [], notes: `not applicable: ${det.reason}` };
  const root = ctx.projectRoot;
  const found = discover(ctx);

  const details = [...journalBlockers(root), ...cacheBlockers(root), ...legacyBlockers(found.legacy)];
  if (found.block.error) details.push(`.gitignore: ${found.block.error}`);
  if (details.length) return refusal(refusalText(details, found.legacy.length > 0), details);

  const gitignoreChanged = !found.block.current;
  const changed = [...(gitignoreChanged ? [GITIGNORE_REL] : []), ...found.untrack];
  if (ctx.dryRun) return { applied: false, dryRun: true, changed, notes: notesFor(found, gitignoreChanged), ...summary(found) };

  // Back up before anything changes: .planning/ + CLAUDE.md (upgrade.backup), the old .gitignore, the path list.
  const before = readGitignore(root);
  const backup = upgrade.backup({ projectRoot: root, userHome: ctx.userHome });
  if (before !== null) fs.writeFileSync(path.join(backup, '0010-gitignore.before'), before);
  fs.writeFileSync(path.join(backup, '0010-untracked.txt'), found.untrack.map((p) => `${p}\n`).join(''));

  if (gitignoreChanged) fs.writeFileSync(path.join(root, GITIGNORE_REL), upsertBlock(before));

  // Verify with git itself: config.json and STACK.md must stay visible, the cache must be ignored.
  const probe = ['.planning/config.json', '.planning/STACK.md', PROBE_IGNORED];
  const ignored = ignoredSet(ctx, probe);
  const hidden = probe.slice(0, 2).filter((p) => ignored.has(p));
  if (hidden.length || !ignored.has(PROBE_IGNORED)) {
    const why = hidden.length
      ? `an existing ignore rule still hides ${hidden.join(' and ')} (a \`.planning/\` directory rule cannot be re-included; remove it)`
      : `the .gitignore block does not ignore ${PROBE_IGNORED}`;
    return { ...rollback(ctx, [], before, why), backup };
  }

  const removed = [];
  for (let i = 0; i < found.untrack.length; i += RM_BATCH) {
    const batch = found.untrack.slice(i, i + RM_BATCH);
    const r = git(ctx, ['--literal-pathspecs', 'rm', '--cached', '--quiet', '--', ...batch]);
    if (r.status !== 0) return { ...rollback(ctx, removed, before, `git rm --cached failed: ${r.err || r.status}`), backup };
    removed.push(...batch);
  }

  return { applied: true, changed, notes: notesFor(found, gitignoreChanged), ...summary(found), backup };
}

/** Upgrade-runner adapter: `{changed, notes}`; a refusal throws so the runner reports it and never stamps 0010. */
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
  id: '0010',
  title: 'Gitignore the planning cache in GitHub store mode',
  since: '2.13.0',
  safety: 'confirm',
  detect,
  apply,
  migrate,
  discover,
  BLOCK_START,
  BLOCK_END,
  LOCAL_ONLY_NOTE,
  STORE_COMMIT_STEPS,
};
