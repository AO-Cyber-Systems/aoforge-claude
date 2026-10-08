#!/usr/bin/env node

/**
 * AOForge Executor Completion Gate (SubagentStop hook) — TRD 44-04, AUT-02
 *
 * Purpose: an `aoforge:executor` that stops NATURALLY while its TRD has no
 * `<id>-SUMMARY.md` gets exactly one more turn to finish the work or to write
 * and commit the `## Progress` checkpoint. The hook does that by printing
 * a top-level `{"decision":"block","reason":"..."}`.
 *
 * Second, once-only reason to block (TRD 66-02, EST-09): the TRD's FINAL SUMMARY
 * (one with a `## Self-Check` heading) exists but its frontmatter carries no
 * `tokens_input` / `tokens_output`. Objective 64's 64-09 and 64-10 ran `summary
 * post` without `tokens stamp` although their transcripts exist, so the stamp
 * step is now checked where the executor stops. The reason names the exact
 * `planning draft`, `tokens stamp` and `summary post` commands. A `## Progress`
 * checkpoint is never blocked, and the hook reads no transcript: whether one
 * exists is `tokens stamp`'s job.
 *
 * Verified harness facts (Claude Code 2.1.284, OBJECTIVE.md of objective 44):
 *   - SubagentStop `decision:block` on a natural stop makes the subagent
 *     continue, with `reason` as its next instruction.
 *   - The re-stop payload carries `stop_hook_active: true`. That flag is the
 *     once-guard, so this hook never keeps a marker or counter file.
 *   - A `maxTurns` stop does NOT fire SubagentStop at all. That path is handled
 *     by execute-objective's INCOMPLETE outcome (TRD 44-01), not here.
 *   - The block shape is TOP-LEVEL `{decision, reason}`, the same shape
 *     verify-commits.js uses since objective 70.
 *
 * TRD identification reads ONLY the first user prompt of the agent transcript
 * (`agent_transcript_path`), bounded to the first 1 MiB. Later tool output
 * mentions other TRDs, so it is never authoritative. `identifyTrd` and
 * `readFirstUserPrompt` live in aoforge/bin/lib/trd-identify.cjs (TRD 57-01),
 * shared with the aof-tools token reader; this hook requires and re-exports them.
 *
 * Fail-open contract: every path that is not a confident "this executor's TRD
 * has no SUMMARY anywhere" or "its final SUMMARY has no token fields" exits 0
 * with NO output. That includes any error, a non-executor agent, no `.planning/`,
 * an unidentifiable or ambiguous TRD, an unreadable transcript, a deliberate
 * structured stop, an unreadable SUMMARY, a checkpoint-only SUMMARY (no
 * `## Self-Check`) and any final SUMMARY that carries both token fields.
 *
 * Escape hatch: AOFORGE_SKIP_EXECUTOR_STOP_GATE=1.
 *
 * Registration: SubagentStop in hooks.json. That is done by TRD 44-09, because
 * hooks.json is a shared hot spot.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { escapeRegExp } = require('../aoforge/bin/lib/text-escape.cjs');

// ─── TRD identification ───────────────────────────────────────────────────────

// Moved to lib/trd-identify.cjs (TRD 57-01) so aof-tools can use it: the runtime mirror does not ship hooks/.
// Re-exported below as the same function objects.
const { identifyTrd, readFirstUserPrompt } = require('../aoforge/bin/lib/trd-identify.cjs');

// ─── Candidate roots + SUMMARY lookup ─────────────────────────────────────────

/** Walk up from `start` to the nearest directory containing `name`. */
function findUp(start, name, fsImpl = fs) {
  let dir = path.resolve(start);
  for (;;) {
    try {
      if (fsImpl.existsSync(path.join(dir, name))) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Project root: the nearest ancestor (or self) holding `.planning/`. */
function findProjectRoot(start, fsImpl = fs) {
  return findUp(start, '.planning', fsImpl);
}

/**
 * The git checkout root holding `start`, and its MAIN checkout. In a linked
 * worktree `.git` is a file (`gitdir: /main/.git/worktrees/<name>`); the fs-only
 * resolution mirrors gate-edits.js `sharedPlanningDir` (reimplemented, not
 * imported: TRD 44-03 owns gate-edits.js).
 *
 * @returns {{gitRoot: string|null, mainRoot: string|null}}
 */
function gitRoots(start, fsImpl = fs) {
  const gitRoot = findUp(start, '.git', fsImpl);
  if (!gitRoot) return { gitRoot: null, mainRoot: null };
  let mainRoot = gitRoot;
  try {
    const raw = String(fsImpl.readFileSync(path.join(gitRoot, '.git'), 'utf8'));
    const m = /^gitdir:\s*(.+)$/m.exec(raw);
    if (m) {
      const gitdir = m[1].trim();
      const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
      const idx = gitdir.indexOf(marker);
      if (idx !== -1) mainRoot = gitdir.slice(0, idx);
    }
  } catch {
    // `.git` is a directory → this already is the main checkout
  }
  return { gitRoot, mainRoot };
}

/**
 * Every root whose `.planning/objectives/` may hold the SUMMARY:
 * the project roots of `cwd` and `repoRoot`, their git checkouts and main
 * checkouts, `repoRoot` itself, and each entry of ONE `gitWorktrees` call
 * (for `repoRoot`, else for cwd's checkout). De-duplicated by real path.
 *
 * @param {{cwd?: string, repoRoot?: string|null, gitWorktrees?: Function, fsImpl?: object}} opts
 * @returns {string[]}
 */
function candidateRoots({ cwd, repoRoot = null, gitWorktrees = () => [], fsImpl = fs } = {}) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return;
    const resolved = path.resolve(p);
    let key = resolved;
    try { key = fsImpl.realpathSync(resolved); } catch { /* nonexistent: keep resolved */ }
    if (seen.has(key)) return;
    seen.add(key);
    out.push(resolved);
  };

  let worktreeBase = typeof repoRoot === 'string' && path.isAbsolute(repoRoot) ? repoRoot : null;

  for (const start of [cwd, repoRoot]) {
    if (typeof start !== 'string' || !start || !path.isAbsolute(start)) continue;
    add(findProjectRoot(start, fsImpl));
    const { gitRoot, mainRoot } = gitRoots(start, fsImpl);
    add(gitRoot);
    add(mainRoot);
    if (!worktreeBase && gitRoot) worktreeBase = gitRoot;
  }
  add(repoRoot);

  if (worktreeBase) {
    let worktrees = [];
    try { worktrees = gitWorktrees(worktreeBase) || []; } catch { worktrees = []; }
    if (Array.isArray(worktrees)) for (const w of worktrees) add(w);
  }

  return out;
}

/**
 * Every `<root>/.planning/objectives/<dir>/<id>-SUMMARY.md` or
 * `<id>-<slug>-SUMMARY.md` that exists, as absolute paths in `roots` order
 * (TRD 66-02; TRD 53-02 set the pairing rule: the same as roadmap-reconcile and
 * the aof-tools readers; `<id>-SUMMARY.md` stays the name the executor is told to
 * write). The id is matched whole: `07-010-SUMMARY.md` and `07-01x-SUMMARY.md`
 * do not count for `07-01`. A file reached through two roots is listed once.
 * A root without (or with an unreadable) `.planning/objectives` is skipped.
 * Content is NOT inspected here.
 *
 * Kept light on purpose (fast hook): the only aof-tools lib it requires is the
 * dependency-free text-escape.cjs, and the pairing regex is inlined rather than
 * shared with `helpers.trdKey`.
 *
 * @param {string} id
 * @param {string[]} roots
 * @param {object} [fsImpl]
 * @returns {string[]}
 */
function summaryFiles(id, roots, fsImpl = fs) {
  const out = [];
  if (!id || !Array.isArray(roots)) return out;
  const seen = new Set();
  const add = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    out.push(file);
  };
  const file = `${id}-SUMMARY.md`;
  // The id is escaped so a decimal id's dot is literal.
  const paired = new RegExp(`^${escapeRegExp(id)}(?:-.+)?-SUMMARY\\.md$`);
  for (const root of roots) {
    if (typeof root !== 'string' || !root) continue;
    const objectivesDir = path.resolve(root, '.planning', 'objectives');
    let entries;
    try { entries = fsImpl.readdirSync(objectivesDir); } catch { continue; }
    for (const entry of entries) {
      const dir = path.join(objectivesDir, String(entry));
      // Exact-name fast path first: it needs no directory listing, so a fsImpl
      // seam without readdirSync on objective dirs keeps working.
      try {
        if (fsImpl.existsSync(path.join(dir, file))) add(path.join(dir, file));
      } catch { /* fall through to the listing */ }
      try {
        for (const f of fsImpl.readdirSync(dir)) {
          if (paired.test(String(f))) add(path.join(dir, String(f)));
        }
      } catch { /* not a directory, or unreadable: skip entry */ }
    }
  }
  return out;
}

/**
 * True when any SUMMARY of this TRD exists (see `summaryFiles` for the pairing
 * rule and the skipped roots). Content is NOT inspected: a `## Progress`-only
 * checkpoint counts as present.
 *
 * @param {string} id
 * @param {string[]} roots
 * @param {object} [fsImpl]
 * @returns {boolean}
 */
function summaryExists(id, roots, fsImpl = fs) {
  return summaryFiles(id, roots, fsImpl).length > 0;
}

// ─── SUMMARY content: final or checkpoint, stamped or not (TRD 66-02) ─────────

/**
 * True when the SUMMARY's FRONTMATTER (the first `---` ... `---` block) holds
 * both `tokens_input: <digits>` and `tokens_output: <digits>` lines. The lines
 * are anchored at the line start without a `#`, so the template's commented
 * `# tokens_input: N` lines never count. The value's source (`live` or
 * `backfill`) is not inspected: the gate checks presence only. A line regex
 * rather than a YAML parser keeps the hook dependency-free.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasTokenFields(text) {
  if (typeof text !== 'string') return false;
  const m = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return false;
  return /^tokens_input:[ \t]*\d+[ \t]*$/m.test(m[1]) && /^tokens_output:[ \t]*\d+[ \t]*$/m.test(m[1]);
}

/**
 * True for a FINAL SUMMARY: one with a `## Self-Check` heading, which executor.md
 * adds only once the self-check has run. A `## Progress` checkpoint has none.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isFinalSummary(text) {
  return typeof text === 'string' && /^## Self-Check\b/m.test(text);
}

/**
 * The objective dir holding this TRD: the first `<root>/.planning/objectives/<dir>`
 * that contains `<id>-TRD.md`, searched in `roots` order. Mirrors
 * `summaryExists`: a root without (or with an unreadable) `.planning/objectives`
 * is skipped, and any failure yields null (TRD 44-10).
 *
 * @param {string} id
 * @param {string[]} roots
 * @param {object} [fsImpl]
 * @returns {string|null}
 */
function trdDirFor(id, roots, fsImpl = fs) {
  if (!id || !Array.isArray(roots)) return null;
  const file = `${id}-TRD.md`;
  for (const root of roots) {
    if (typeof root !== 'string' || !root) continue;
    const objectivesDir = path.join(root, '.planning', 'objectives');
    let entries;
    try { entries = fsImpl.readdirSync(objectivesDir); } catch { continue; }
    for (const entry of entries) {
      const dir = path.join(objectivesDir, String(entry));
      try {
        if (fsImpl.existsSync(path.join(dir, file))) return dir;
      } catch { /* skip entry */ }
    }
  }
  return null;
}

/**
 * The repo-relative SUMMARY path for this TRD (`.planning/objectives/<dir>/<id>-SUMMARY.md`,
 * forward slashes), or null when the TRD file can't be located.
 *
 * @param {string} id
 * @param {string[]} roots
 * @param {object} [fsImpl]
 * @returns {string|null}
 */
function summaryRelPath(id, roots, fsImpl = fs) {
  const dir = trdDirFor(id, roots, fsImpl);
  if (!dir) return null;
  return ['.planning', 'objectives', path.basename(dir), `${id}-SUMMARY.md`].join('/');
}

// ─── Deliberate stops ─────────────────────────────────────────────────────────

// executor.md structured returns (## CHECKPOINT REACHED, ## ESCALATION
// REQUESTED) and the exec-context preflight hard stops.
const DELIBERATE_STOP_RE = /CHECKPOINT REACHED|ESCALATION REQUESTED|WRONG REPOSITORY|BASE NOT VISIBLE|SHARED INDEX/;

/**
 * @param {string} text  the executor's last assistant message
 * @returns {boolean}
 */
function isDeliberateStop(text) {
  return typeof text === 'string' && DELIBERATE_STOP_RE.test(text);
}

// ─── git worktree listing (the one git call) ──────────────────────────────────

/** Paths from `git worktree list --porcelain` output (`worktree <path>` lines). */
function parseWorktreePorcelain(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const m = /^worktree (.+)$/.exec(raw.replace(/\r$/, ''));
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Every worktree of the repo at `repoRoot` (main checkout included). Returns []
 * immediately when `<repoRoot>/.git` is absent, and on any git failure: the
 * other candidate roots are still checked.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
function gitWorktrees(repoRoot) {
  try {
    if (typeof repoRoot !== 'string' || !repoRoot) return [];
    if (!fs.existsSync(path.join(repoRoot, '.git'))) return [];
    const r = spawnSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      timeout: 3000,
    });
    if (r.error || r.status !== 0) return [];
    return parseWorktreePorcelain(r.stdout);
  } catch {
    return [];
  }
}

// ─── Decision ─────────────────────────────────────────────────────────────────

const SKIP_ENV = 'AOFORGE_SKIP_EXECUTOR_STOP_GATE';
const EXECUTOR_AGENT_TYPE = 'aoforge:executor';

/**
 * The block reason. With `summaryRel` (the TRD file was located) it names the
 * exact repo-relative SUMMARY path. An agent told only "the TRD's SUMMARY.md"
 * wrote it at the repo root, where neither this gate nor the orchestrator
 * looks (TRD 44-10). Without a path, the wording is unchanged.
 *
 * @param {string} id
 * @param {string|null} [summaryRel]
 * @returns {string}
 */
function blockReason(id, summaryRel = null) {
  const checkpoint = summaryRel
    ? [
      `If you must stop, first write the ## Progress checkpoint to ${summaryRel}`,
      '(a path relative to your checkout root), listing the tasks done with hashes and the next',
      'concrete step. Commit it, then stop.',
    ]
    : [
      "If you must stop, first write the ## Progress checkpoint to the TRD's SUMMARY.md",
      '(tasks done with hashes, the next concrete step) and commit it, then stop.',
    ];
  return [
    `AOForge: you are stopping, but TRD ${id} has no ${id}-SUMMARY.md.`,
    'If work remains, continue it now (commit each finished task with aof-tools commit).',
    ...checkpoint,
    'If you stopped on purpose (checkpoint, escalation, exec-context hard stop), repeat that',
    'structured return verbatim and stop without writing files.',
    'Never use port 8080.',
  ].join(' ');
}

/**
 * The repo-relative and `planning draft` forms of a SUMMARY's location, from the
 * last two segments of its absolute path (`<objective dir>/<file>`): no roots
 * are recomputed.
 *
 * @param {string} file  absolute path of a `<id>-SUMMARY.md`
 * @returns {{summaryRel: string, draftRel: string}}
 */
function summaryLocation(file) {
  const base = path.basename(file);
  const dir = path.basename(path.dirname(file));
  return {
    summaryRel: ['.planning', 'objectives', dir, base].join('/'),
    draftRel: ['objectives', dir, base].join('/'),
  };
}

/**
 * The block reason for a final SUMMARY with no token fields (TRD 66-02, EST-09).
 * It names the three commands that repair it, in order, and says the gate asks
 * once: the once-guard is `stop_hook_active`, so an executor that cannot stamp
 * (no transcript, `stamped: false`) is told to stop rather than loop.
 *
 * @param {string} id
 * @param {string} summaryRel  `.planning/objectives/<dir>/<file>`
 * @param {string} draftRel    `objectives/<dir>/<file>`, the argument of `planning draft`
 * @returns {string}
 */
function tokenBlockReason(id, summaryRel, draftRel) {
  const df = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
  return [
    `AOForge: TRD ${id}'s SUMMARY (${summaryRel}) is final but has no tokens_input/tokens_output.`,
    'Stamp it now, one command per Bash call, passing --cwd <checkout> as for every aof-tools call:',
    `${df} planning draft ${draftRel}`,
    `${df} tokens stamp ${id} --draft <draft path>`,
    `${df} summary post ${id} --from <draft path>`,
    'then commit the SUMMARY with aof-tools commit (local mode).',
    'If tokens stamp reports stamped: false, stop: this gate does not ask twice.',
    'Never type token numbers by hand.',
    'Never use port 8080.',
  ].join(' ');
}

/**
 * Decide whether to block this SubagentStop. Returns `{block: true, reason}`
 * or null. Checks run cheapest-first, and every one of them fails OPEN:
 *   env skip → agent_type → stop_hook_active → no .planning → deliberate stop
 *   → unreadable transcript → unidentifiable TRD → SUMMARY missing → block (44-04)
 *   → unreadable SUMMARY → null → no final SUMMARY (checkpoints only) → null
 *   → any stamped final → null → block (66-02).
 *
 * @param {object} payload  the SubagentStop stdin payload
 * @param {{env?: object, fsImpl?: object, gitWorktrees?: Function, cwd?: string}} [deps]
 * @returns {{block: true, reason: string}|null}
 */
function decide(payload, {
  env = process.env,
  fsImpl = fs,
  gitWorktrees: listWorktrees = gitWorktrees,
  cwd = process.cwd(),
} = {}) {
  if (!payload || typeof payload !== 'object') return null;
  if (env && env[SKIP_ENV] === '1') return null;
  if (payload.agent_type !== EXECUTOR_AGENT_TYPE) return null;
  // The verified once-guard. Any truthy value counts: blocking here could loop the agent.
  if (payload.stop_hook_active) return null;

  const start = path.resolve(typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : cwd);
  if (!findProjectRoot(start, fsImpl)) return null;

  if (isDeliberateStop(payload.last_assistant_message)) return null;

  const prompt = readFirstUserPrompt(payload.agent_transcript_path, { fsImpl });
  if (!prompt) return null;

  const trd = identifyTrd(prompt);
  if (!trd) return null;

  const roots = candidateRoots({ cwd: start, repoRoot: trd.repoRoot, gitWorktrees: listWorktrees, fsImpl });
  const files = summaryFiles(trd.id, roots, fsImpl);
  if (files.length === 0) {
    return { block: true, reason: blockReason(trd.id, summaryRelPath(trd.id, roots, fsImpl)) };
  }

  // TRD 66-02: a SUMMARY exists. Look only at the FINAL ones (`## Self-Check`):
  // a `## Progress` checkpoint is meant to carry no tokens (44-04 semantics).
  const finals = [];
  for (const file of files) {
    let text;
    try { text = String(fsImpl.readFileSync(file, 'utf8')); } catch { return null; } // fail open
    if (isFinalSummary(text)) finals.push({ file, stamped: hasTokenFields(text) });
  }
  if (finals.length === 0) return null;
  if (finals.some((x) => x.stamped)) return null;

  const { summaryRel, draftRel } = summaryLocation(finals[0].file); // roots order: cwd's checkout first
  return { block: true, reason: tokenBlockReason(trd.id, summaryRel, draftRel) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  try {
    const raw = readStdin();
    if (!raw.trim()) return;
    const d = decide(JSON.parse(raw));
    if (d && d.block) {
      // TOP-LEVEL shape — the verified SubagentStop form. Not hookSpecificOutput.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
    }
  } catch {
    // Fail open: exit 0, no output.
  }
}

if (require.main === module) main();

module.exports = {
  identifyTrd,
  readFirstUserPrompt,
  candidateRoots,
  summaryExists,
  summaryFiles,
  hasTokenFields,
  isFinalSummary,
  trdDirFor,
  summaryRelPath,
  blockReason,
  tokenBlockReason,
  isDeliberateStop,
  decide,
  gitWorktrees,
  parseWorktreePorcelain,
  findProjectRoot,
  gitRoots,
};
