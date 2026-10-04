#!/usr/bin/env node

/**
 * DevFlow Executor Completion Gate (SubagentStop hook) — TRD 44-04, AUT-02
 *
 * Purpose: a `devflow:executor` that stops NATURALLY while its TRD has no
 * `<id>-SUMMARY.md` gets exactly one more turn to finish the work or to write
 * and commit the `## Progress` checkpoint. The hook does that by printing
 * a top-level `{"decision":"block","reason":"..."}`.
 *
 * Verified harness facts (Claude Code 2.1.284, OBJECTIVE.md of objective 44):
 *   - SubagentStop `decision:block` on a natural stop makes the subagent
 *     continue, with `reason` as its next instruction.
 *   - The re-stop payload carries `stop_hook_active: true`. That flag is the
 *     once-guard, so this hook never keeps a marker or counter file.
 *   - A `maxTurns` stop does NOT fire SubagentStop at all. That path is handled
 *     by execute-objective's INCOMPLETE outcome (TRD 44-01), not here.
 *   - The block shape is TOP-LEVEL `{decision, reason}`. It is deliberately not
 *     the `hookSpecificOutput`-nested form used by verify-commits.js.
 *
 * TRD identification reads ONLY the first user prompt of the agent transcript
 * (`agent_transcript_path`), bounded to the first 1 MiB. Later tool output
 * mentions other TRDs, so it is never authoritative.
 *
 * Fail-open contract: every path that is not a confident "this executor's TRD
 * has no SUMMARY anywhere" exits 0 with NO output. That includes any error,
 * a non-executor agent, no `.planning/`, an unidentifiable or ambiguous TRD,
 * an unreadable transcript, and a deliberate structured stop.
 *
 * Escape hatch: DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1.
 *
 * Registration: SubagentStop in hooks.json. That is done by TRD 44-09, because
 * hooks.json is a shared hot spot.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ─── TRD identification ───────────────────────────────────────────────────────

const ID = String.raw`\d+(?:\.\d+)?-\d+`;
const ID_END = String.raw`(?![\w-])`;

// Line-anchored, so an embedded TRD quoting "`PLAN_ID: 77-09`" in prose never counts.
const PLAN_ID_RE = new RegExp(String.raw`^[ \t]*PLAN_ID:[ \t]*(${ID})${ID_END}`, 'gm');
// `--id` only counts inside an `exec-context check` command line.
const EXEC_ID_RE = new RegExp(String.raw`exec-context[ \t]+check\b[^\n]*?[ \t]--id(?:=|[ \t]+)(${ID})${ID_END}`, 'g');
const TRD_PATH_RE = new RegExp(String.raw`(?<![\w.-])(${ID})-TRD\.md\b`, 'g');
const FM_OBJECTIVE_RE = /^[ \t]*objective:[ \t]*["']?(\d+(?:\.\d+)?)(?:-[^\s"']*)?["']?[ \t]*$/gm;
const FM_TRD_RE = /^[ \t]*trd:[ \t]*["']?(\d+)["']?[ \t]*$/gm;
const REPO_ROOT_RE = /^[ \t]*REPO_ROOT:[ \t]*(\S+)/m;

function capturesOf(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

function unique(list) {
  return [...new Set(list)];
}

/** Ids implied by embedded TRD frontmatter: `<NN of objective:>-<trd>`. */
function frontmatterIds(text) {
  const objectives = unique(capturesOf(FM_OBJECTIVE_RE, text));
  const trds = unique(capturesOf(FM_TRD_RE, text).map((t) => (t.length === 1 ? `0${t}` : t)));
  const ids = [];
  for (const o of objectives) for (const t of trds) ids.push(`${o}-${t}`);
  return unique(ids);
}

/**
 * Identify the TRD an executor was spawned for, from its first user prompt.
 *
 * Sources, strongest first. The first source that yields ANY id is chosen;
 * if it yields more than one distinct id the prompt is ambiguous → null.
 *   1. The explicit dispatch declaration: `PLAN_ID: <id>` lines together with
 *      `exec-context check ... --id <id>`. Both name the plan the orchestrator
 *      dispatched, so a disagreement between them is a contradiction and
 *      means ambiguous, not "first wins".
 *   2. `<id>-TRD.md` paths.
 *   3. Embedded TRD frontmatter: `objective: NN-slug` + `trd: "MM"` → `NN-MM`.
 *
 * @param {string} text
 * @returns {{id: string, repoRoot: string|null}|null}
 */
function identifyTrd(text) {
  if (typeof text !== 'string' || !text) return null;

  const rootMatch = REPO_ROOT_RE.exec(text);
  const repoRoot = rootMatch && path.isAbsolute(rootMatch[1]) ? rootMatch[1] : null;

  const tiers = [
    unique([...capturesOf(PLAN_ID_RE, text), ...capturesOf(EXEC_ID_RE, text)]),
    unique(capturesOf(TRD_PATH_RE, text)),
    frontmatterIds(text),
  ];

  for (const ids of tiers) {
    if (ids.length === 0) continue;
    if (ids.length > 1) return null; // ambiguous → fail open
    return { id: ids[0], repoRoot };
  }
  return null;
}

// ─── Bounded transcript read ──────────────────────────────────────────────────

function textOfContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
}

/**
 * Parse one JSONL line. Returns the prompt text (or null for an empty one)
 * when the record is the user record, `undefined` to keep scanning.
 */
function userTextOfLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let rec;
  try { rec = JSON.parse(trimmed); } catch { return undefined; } // garbage line: skip
  if (!rec || typeof rec !== 'object' || rec.type !== 'user') return undefined;
  const text = textOfContent(rec.message && rec.message.content);
  return text || null;
}

/**
 * Text of the FIRST `type:'user'` record in a JSONL transcript.
 *
 * Reads at most `maxBytes` (default 1 MiB) via openSync + readSync, parses
 * only complete lines, and stops at the first user record. A final line
 * without a trailing newline counts as complete only when EOF was reached
 * inside the budget. Any failure → null.
 *
 * @param {string} filePath
 * @param {{maxBytes?: number, fsImpl?: object, chunkSize?: number}} [opts]
 * @returns {string|null}
 */
function readFirstUserPrompt(filePath, { maxBytes = 1 << 20, fsImpl = fs, chunkSize = 64 * 1024 } = {}) {
  if (typeof filePath !== 'string' || !filePath) return null;

  let fd;
  try { fd = fsImpl.openSync(filePath, 'r'); } catch { return null; }

  try {
    const buf = Buffer.alloc(Math.max(0, maxBytes));
    let filled = 0;
    let lineStart = 0;
    let eof = false;

    for (;;) {
      const view = buf.subarray(0, filled);
      let nl;
      while ((nl = view.indexOf(0x0a, lineStart)) !== -1) {
        const found = userTextOfLine(view.toString('utf8', lineStart, nl));
        if (found !== undefined) return found;
        lineStart = nl + 1;
      }

      if (eof) {
        if (lineStart < filled) {
          const found = userTextOfLine(view.toString('utf8', lineStart, filled));
          if (found !== undefined) return found;
        }
        return null;
      }
      if (filled >= buf.length) return null; // budget spent, no complete user line

      const want = Math.min(chunkSize, buf.length - filled);
      const n = fsImpl.readSync(fd, buf, filled, want, filled);
      if (!n) eof = true;
      else filled += n;
    }
  } catch {
    return null;
  } finally {
    try { fsImpl.closeSync(fd); } catch { /* ignore */ }
  }
}

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
 * True when any `<root>/.planning/objectives/<dir>/<id>-SUMMARY.md` or
 * `<id>-<slug>-SUMMARY.md` exists (TRD 53-02: the same pairing rule as
 * roadmap-reconcile and the df-tools readers; `<id>-SUMMARY.md` stays the name
 * the executor is told to write). The id is matched whole: `07-010-SUMMARY.md`
 * and `07-01x-SUMMARY.md` do not count for `07-01`.
 * A root without (or with an unreadable) `.planning/objectives` is skipped.
 * Content is NOT inspected: a `## Progress`-only checkpoint counts as present.
 *
 * Self-contained on purpose (fast hook, no df-tools lib require): the pairing
 * regex is inlined rather than shared with `helpers.trdKey`.
 *
 * @param {string} id
 * @param {string[]} roots
 * @param {object} [fsImpl]
 * @returns {boolean}
 */
function summaryExists(id, roots, fsImpl = fs) {
  if (!id || !Array.isArray(roots)) return false;
  const file = `${id}-SUMMARY.md`;
  // The id is escaped so a decimal id's dot is literal.
  const paired = new RegExp(`^${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-.+)?-SUMMARY\\.md$`);
  for (const root of roots) {
    if (typeof root !== 'string' || !root) continue;
    const objectivesDir = path.join(root, '.planning', 'objectives');
    let entries;
    try { entries = fsImpl.readdirSync(objectivesDir); } catch { continue; }
    for (const entry of entries) {
      const dir = path.join(objectivesDir, String(entry));
      // Exact-name fast path first: it needs no directory listing, so a fsImpl
      // seam without readdirSync on objective dirs keeps working.
      try {
        if (fsImpl.existsSync(path.join(dir, file))) return true;
      } catch { /* fall through to the listing */ }
      try {
        if (fsImpl.readdirSync(dir).some((f) => paired.test(String(f)))) return true;
      } catch { /* not a directory, or unreadable: skip entry */ }
    }
  }
  return false;
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

const SKIP_ENV = 'DEVFLOW_SKIP_EXECUTOR_STOP_GATE';
const EXECUTOR_AGENT_TYPE = 'devflow:executor';

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
    `DevFlow: you are stopping, but TRD ${id} has no ${id}-SUMMARY.md.`,
    'If work remains, continue it now (commit each finished task with df-tools commit).',
    ...checkpoint,
    'If you stopped on purpose (checkpoint, escalation, exec-context hard stop), repeat that',
    'structured return verbatim and stop without writing files.',
    'Never use port 8080.',
  ].join(' ');
}

/**
 * Decide whether to block this SubagentStop. Returns `{block: true, reason}`
 * or null. Checks run cheapest-first, and every one of them fails OPEN:
 *   env skip → agent_type → stop_hook_active → no .planning → deliberate stop
 *   → unreadable transcript → unidentifiable TRD → SUMMARY exists.
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
  if (summaryExists(trd.id, roots, fsImpl)) return null;

  return { block: true, reason: blockReason(trd.id, summaryRelPath(trd.id, roots, fsImpl)) };
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
  trdDirFor,
  summaryRelPath,
  blockReason,
  isDeliberateStop,
  decide,
  gitWorktrees,
  parseWorktreePorcelain,
  findProjectRoot,
  gitRoots,
};
