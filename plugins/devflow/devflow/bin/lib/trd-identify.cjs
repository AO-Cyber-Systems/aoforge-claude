'use strict';

/**
 * trd-identify.cjs — which TRD an executor transcript belongs to (moved from hooks/gate-executor-stop.js, TRD 57-01).
 *
 * The SubagentStop gate (hooks/gate-executor-stop.js, TRD 44-04) and the token reader (token-usage.cjs, TRD 57-01) both
 * identify an executor's TRD from the FIRST user prompt of its transcript. The runtime mirror (~/.claude/devflow/) does
 * not ship hooks/, so df-tools cannot require the hook; identification lives here and the hook requires and re-exports
 * it. One source.
 *
 * Requires only fs and path: the hook loads this on every SubagentStop.
 */

const fs = require('fs');
const path = require('path');

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

/**
 * The absolute path on a prompt's `REPO_ROOT:` line, or null (no line, or a relative value).
 *
 * @param {string} text
 * @returns {string|null}
 */
function repoRootOf(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = REPO_ROOT_RE.exec(text);
  return m && path.isAbsolute(m[1]) ? m[1] : null;
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

/** The prompt text of a user record, or null for an empty one. */
function promptOfRecord(rec) {
  return textOfContent(rec.message && rec.message.content) || null;
}

/** The user record itself. */
function wholeRecord(rec) {
  return rec;
}

/**
 * Parse one JSONL line. Returns `pick(rec)` when the record is the user record,
 * `undefined` to keep scanning. `pick` never returns undefined.
 */
function userRecordOfLine(line, pick) {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let rec;
  try { rec = JSON.parse(trimmed); } catch { return undefined; } // garbage line: skip
  if (!rec || typeof rec !== 'object' || rec.type !== 'user') return undefined;
  return pick(rec);
}

/**
 * `pick(rec)` of the FIRST `type:'user'` record in a JSONL transcript.
 *
 * Reads at most `maxBytes` (default 1 MiB) via openSync + readSync, parses
 * only complete lines, and stops at the first user record. A final line
 * without a trailing newline counts as complete only when EOF was reached
 * inside the budget. Any failure → null.
 */
function scanFirstUserRecord(filePath, pick, { maxBytes = 1 << 20, fsImpl = fs, chunkSize = 64 * 1024 } = {}) {
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
        const found = userRecordOfLine(view.toString('utf8', lineStart, nl), pick);
        if (found !== undefined) return found;
        lineStart = nl + 1;
      }

      if (eof) {
        if (lineStart < filled) {
          const found = userRecordOfLine(view.toString('utf8', lineStart, filled), pick);
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

/**
 * Text of the FIRST `type:'user'` record in a JSONL transcript (null for an
 * empty one). Bounded read: see scanFirstUserRecord.
 *
 * @param {string} filePath
 * @param {{maxBytes?: number, fsImpl?: object, chunkSize?: number}} [opts]
 * @returns {string|null}
 */
function readFirstUserPrompt(filePath, opts) {
  return scanFirstUserRecord(filePath, promptOfRecord, opts);
}

/**
 * The parsed FIRST `type:'user'` record of a JSONL transcript (its `cwd`,
 * `sessionId`, `timestamp` and `message` included), or null. Bounded read: see
 * scanFirstUserRecord.
 *
 * @param {string} filePath
 * @param {{maxBytes?: number, fsImpl?: object, chunkSize?: number}} [opts]
 * @returns {object|null}
 */
function readFirstUserRecord(filePath, opts) {
  return scanFirstUserRecord(filePath, wholeRecord, opts);
}

module.exports = {
  identifyTrd,
  readFirstUserPrompt,
  readFirstUserRecord,
  repoRootOf,
  textOfContent,
};
