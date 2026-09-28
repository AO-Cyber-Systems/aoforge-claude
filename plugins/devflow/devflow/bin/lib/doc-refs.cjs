'use strict';

// doc-refs.cjs — the single resolver for stale command references (objective 38, TRD 38-01).
//
// Command-rename knowledge lives in exactly one place: skill-route.cjs's DEPRECATION_MAP
// (renamed commands) and REMOVED_COMMANDS (commands dropped with no replacement). This module
// imports both and declares no mapping of its own — every later TRD in objective 38 (38-07 doc
// staleness gate, 38-08 migration, 38-09 CI test) calls resolveToken/scanText/rewriteText here
// rather than re-declaring rename logic.
//
// CommonJS, synchronous fs, no new npm dependencies (runtime model, TRD 38-01).

const fs = require('fs');
const path = require('path');
const { DEPRECATION_MAP, REMOVED_COMMANDS } = require('./skill-route.cjs');

class DocRefsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocRefsError';
  }
}

// Slash-anchored: matches "/devflow:name" or "/df:name" only when the leading "/" is not
// itself preceded by an identifier character, so a token can never be torn out of a larger
// word. Capture group 2 is "the token" everywhere in this module — the bare command name,
// greedy over [a-z0-9-]+, so "/devflow:progress-bar" captures "progress-bar", never "progress".
const TOKEN_RE = /(?<![A-Za-z0-9_])\/(devflow|df):([a-z][a-z0-9-]*)/g;

const IGNORE_START = 'doc-refs:ignore-start';
const IGNORE_END = 'doc-refs:ignore-end';

// ─── resolveToken ───────────────────────────────────────────────────────────────

/**
 * Classify one (prefix, name) pair. Precedence (must_haves truth 2):
 *   removed -> renamed (either prefix) -> prefix (/df: of a non-mapped name) -> unknown
 *   (only when liveSkills is given and lacks the name) -> ok.
 */
function resolveToken(prefix, name, { liveSkills } = {}) {
  if (REMOVED_COMMANDS.includes(name)) {
    return { kind: 'removed', replacement: null };
  }
  if (Object.prototype.hasOwnProperty.call(DEPRECATION_MAP, name)) {
    return { kind: 'renamed', replacement: '/devflow:' + DEPRECATION_MAP[name] };
  }
  if (prefix === 'df') {
    return { kind: 'prefix', replacement: '/devflow:' + name };
  }
  if (liveSkills && !liveSkills.has(name)) {
    return { kind: 'unknown', replacement: null };
  }
  return { kind: 'ok', replacement: null };
}

// ─── shared scan plumbing (scanText + rewriteText walk the same token stream) ────

// 0-based character offset each line starts at. lineStarts.length === text.split('\n').length,
// so line index i pairs with rawLines[i] from the same split.
function _lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

// Binary search for the last line start <= offset -> 0-based line index.
function _lineIndexForOffset(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Which 0-based line indices fall inside a doc-refs:ignore-start/ignore-end region
 * (inclusive of both marker lines). Markers are matched by substring on any line, so they
 * work inside Markdown, YAML or JS comments alike. Throws DocRefsError if a region is
 * never closed.
 */
function _ignoredLines(rawLines) {
  const ignored = new Set();
  let openLine = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const hasStart = line.includes(IGNORE_START);
    const hasEnd = line.includes(IGNORE_END);
    if (openLine === -1 && hasStart) {
      ignored.add(i);
      openLine = i;
      if (hasEnd) openLine = -1; // start and end on the same line
      continue;
    }
    if (openLine !== -1) {
      ignored.add(i);
      if (hasEnd) openLine = -1;
    }
  }
  if (openLine !== -1) {
    throw new DocRefsError(
      `Unclosed ${IGNORE_START} (no matching ${IGNORE_END}) starting at line ${openLine + 1}`,
    );
  }
  return ignored;
}

// ─── scanText ────────────────────────────────────────────────────────────────────

/**
 * Every non-ok token in `text`, with 1-based line/col. Lines inside an ignore region are
 * skipped entirely (an unclosed ignore-start throws DocRefsError before anything is returned).
 */
function scanText(text, { liveSkills } = {}) {
  const rawLines = text.split('\n');
  const ignored = _ignoredLines(rawLines);
  const lineStarts = _lineStarts(text);
  const re = new RegExp(TOKEN_RE.source, 'g');
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, prefix, name] = m;
    const lineIdx = _lineIndexForOffset(lineStarts, m.index);
    if (ignored.has(lineIdx)) continue;
    const { kind, replacement } = resolveToken(prefix, name, { liveSkills });
    if (kind === 'ok') continue;
    results.push({
      line: lineIdx + 1,
      col: m.index - lineStarts[lineIdx] + 1,
      token: name,
      kind,
      replacement,
    });
  }
  return results;
}

// ─── rewriteText ─────────────────────────────────────────────────────────────────

/**
 * Rewrites `prefix` and `renamed` tokens in place; leaves `removed` tokens and ignore
 * regions byte-identical, and preserves every other byte (line endings included) by only
 * ever slicing the original string around matched spans. Idempotent: a second pass over
 * the output has zero changes.
 */
function rewriteText(text) {
  const rawLines = text.split('\n');
  const ignored = _ignoredLines(rawLines);
  const lineStarts = _lineStarts(text);
  const re = new RegExp(TOKEN_RE.source, 'g');
  const changes = [];
  const removed = [];
  let result = '';
  let cursor = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [full, prefix, name] = m;
    const lineIdx = _lineIndexForOffset(lineStarts, m.index);
    if (ignored.has(lineIdx)) continue;
    const { kind, replacement } = resolveToken(prefix, name);
    if (kind === 'removed') {
      removed.push({ token: name, line: lineIdx + 1 });
      continue;
    }
    if (kind === 'renamed' || kind === 'prefix') {
      result += text.slice(cursor, m.index);
      result += replacement;
      cursor = m.index + full.length;
      changes.push({ from: full, to: replacement, line: lineIdx + 1 });
    }
    // ok/unknown (unknown cannot occur here — no liveSkills is passed): leave untouched.
  }
  result += text.slice(cursor);
  return { text: result, changes, removed };
}

// ─── liveSkillNames ──────────────────────────────────────────────────────────────

/** Subdirectory names of `skillsDir` that contain a SKILL.md file. */
function liveSkillNames(skillsDir) {
  const names = new Set();
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))) names.add(e.name);
  }
  return names;
}

// ─── walkFiles ───────────────────────────────────────────────────────────────────

// Tiny glob -> RegExp: supports "**/" (zero or more path segments), a trailing "**" (the
// rest of the path, including slashes), "*" (anything but a slash) and literal segments.
// The include/exclude lists this module is called with are fixed and repo-authored, so
// nothing beyond these three shapes is needed.
function _globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      re += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (glob.startsWith('**', i) && i + 2 === glob.length) {
      re += '.*';
      i += 2;
      continue;
    }
    const ch = glob[i];
    if (ch === '*') {
      re += '[^/]*';
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
    i += 1;
  }
  return new RegExp('^' + re + '$');
}

/**
 * Stack-based walk from `root` (mirrors project-hygiene.cjs's _walkStatsReal pattern — no
 * glob dependency). Returns sorted posix-relative file paths matching every pattern in
 * `include` (when given) and none in `exclude`. Always skips node_modules and .git.
 */
function walkFiles(root, { include = [], exclude = [] } = {}) {
  const includeRe = include.map(_globToRegExp);
  const excludeRe = exclude.map(_globToRegExp);
  const results = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (includeRe.length && !includeRe.some((r) => r.test(rel))) continue;
      if (excludeRe.some((r) => r.test(rel))) continue;
      results.push(rel);
    }
  }
  results.sort();
  return results;
}

module.exports = {
  resolveToken,
  scanText,
  rewriteText,
  liveSkillNames,
  walkFiles,
  TOKEN_RE,
  DocRefsError,
};
