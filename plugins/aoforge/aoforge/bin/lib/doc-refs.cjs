'use strict';

// doc-refs.cjs — the single resolver for stale command references (objective 38, TRD 38-01).
//
// Command-rename knowledge lives in exactly one place: skill-route.cjs's DEPRECATION_MAP
// (renamed commands), REMOVED_COMMANDS (commands dropped with no replacement) and
// NAMESPACE_RENAMES (the legacy slash namespaces, objective 72). This module imports all three
// and declares no mapping of its own — every later TRD in objective 38 (38-07 doc staleness
// gate, 38-08 migration, 38-09 CI test) and objective 72 (72-13, the legacy command forms) calls
// resolveToken/scanText/rewriteText here rather than re-declaring rename logic.
//
// Command forms read here (TRD 72-13):
//   /<current>:<name>   the current namespace (NAMES.slug)
//   /<legacy>:<name>    every NAMESPACE_RENAMES key: the legacy plugin namespace and the short one
//   /<short>-<name>     the dash form of the pre-plugin install (LEGACY.commandDash). A dash token is
//                       read only when <name> is a known command (a live skill, a DEPRECATION_MAP key
//                       or a removed command) and the slash does not follow an identifier character,
//                       `.`, `/` or `~` — so file names and paths that merely start the same way are
//                       never findings.
//
// CommonJS, synchronous fs, no new npm dependencies (runtime model, TRD 38-01).

const fs = require('fs');
const path = require('path');
const { DEPRECATION_MAP, REMOVED_COMMANDS, NAMESPACE_RENAMES } = require('./skill-route.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

class DocRefsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocRefsError';
  }
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Every namespace a command reference can be typed under: the current one, then each legacy one.
const NAMESPACES = Object.freeze([NAMES.slug, ...Object.keys(NAMESPACE_RENAMES)]);

// Slash-anchored: matches "/<namespace>:name" only when the leading "/" is not itself preceded
// by an identifier character, so a token can never be torn out of a larger word. Capture group 2
// is "the token" everywhere in this module — the bare command name, greedy over [a-z0-9-]+, so
// "/aoforge:progress-bar" captures "progress-bar", never "progress".
const TOKEN_RE = new RegExp(
  `(?<![A-Za-z0-9_])\\/(${NAMESPACES.map(escapeRegExp).join('|')}):([a-z][a-z0-9-]*)`,
  'g',
);

// The dash form (legacy short namespace only). Capture group 1 is the bare name. The lookbehind
// is wider than TOKEN_RE's: after `.`, `/` or `~` the slash is part of a path.
const DASH_NS = LEGACY.commandDash.slice(1, -1);
const DASH_RE = new RegExp(`(?<![A-Za-z0-9_./~])${escapeRegExp(LEGACY.commandDash)}([a-z][a-z0-9-]*)`, 'g');

const IGNORE_START = 'doc-refs:ignore-start';
const IGNORE_END = 'doc-refs:ignore-end';

// ─── resolveToken ───────────────────────────────────────────────────────────────

/**
 * Classify one (prefix, name) pair. Precedence (must_haves truth 2):
 *   removed -> renamed (any namespace) -> prefix (a legacy namespace of a non-mapped name) ->
 *   unknown (only when liveSkills is given and lacks the name) -> ok.
 */
function resolveToken(prefix, name, { liveSkills } = {}) {
  if (REMOVED_COMMANDS.includes(name)) {
    return { kind: 'removed', replacement: null };
  }
  if (hasOwn(DEPRECATION_MAP, name)) {
    return { kind: 'renamed', replacement: NAMES.commandNs + DEPRECATION_MAP[name] };
  }
  if (hasOwn(NAMESPACE_RENAMES, prefix)) {
    return { kind: 'prefix', replacement: NAMES.commandNs + name };
  }
  if (liveSkills && !liveSkills.has(name)) {
    return { kind: 'unknown', replacement: null };
  }
  return { kind: 'ok', replacement: null };
}

// ─── known commands (the dash form's filter) ────────────────────────────────────

// The plugin root when this module runs from a plugin tree — the source checkout or the plugin
// cache: lib -> bin -> runtime dir -> plugin root, recognised by its manifest. The home mirror has
// no manifest above it, so there the dash form knows only the renamed and removed commands.
function _bundledSkillsDir() {
  const root = path.resolve(__dirname, '..', '..', '..');
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
    if (manifest && manifest.name === NAMES.slug) return path.join(root, 'skills');
  } catch {
    // no manifest: not a plugin tree
  }
  return null;
}

let _defaultLiveSkills = null;

/** The bundled plugin's live skill names (cached), or an empty set outside a plugin tree. */
function defaultLiveSkills() {
  if (_defaultLiveSkills === null) {
    const dir = _bundledSkillsDir();
    _defaultLiveSkills = dir ? liveSkillNames(dir) : new Set();
  }
  return new Set(_defaultLiveSkills);
}

/** True when `name` is a command the dash form may refer to. */
function _isKnownCommand(name, liveSkills) {
  return REMOVED_COMMANDS.includes(name) || hasOwn(DEPRECATION_MAP, name) || liveSkills.has(name);
}

/**
 * Every command token in `text`, in text order: [{index, full, prefix, name}]. Colon tokens of
 * every namespace, plus dash tokens whose name is a known command (`known`, a Set of live skill
 * names; the bundled plugin's when omitted).
 */
function _tokens(text, known) {
  const tokens = [];
  const colon = new RegExp(TOKEN_RE.source, 'g');
  let m;
  while ((m = colon.exec(text)) !== null) {
    tokens.push({ index: m.index, full: m[0], prefix: m[1], name: m[2] });
  }
  const live = known || defaultLiveSkills();
  const dash = new RegExp(DASH_RE.source, 'g');
  while ((m = dash.exec(text)) !== null) {
    if (!_isKnownCommand(m[1], live)) continue;
    tokens.push({ index: m.index, full: m[0], prefix: DASH_NS, name: m[1] });
  }
  tokens.sort((a, b) => a.index - b.index);
  return tokens;
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
 * `liveSkills` classifies a current-namespace token as unknown and is the dash form's set of
 * known commands; without it, unknown is never reported and the dash form uses the bundled
 * plugin's skills.
 */
function scanText(text, { liveSkills } = {}) {
  const rawLines = text.split('\n');
  const ignored = _ignoredLines(rawLines);
  const lineStarts = _lineStarts(text);
  const results = [];
  for (const t of _tokens(text, liveSkills)) {
    const lineIdx = _lineIndexForOffset(lineStarts, t.index);
    if (ignored.has(lineIdx)) continue;
    const { kind, replacement } = resolveToken(t.prefix, t.name, { liveSkills });
    if (kind === 'ok') continue;
    results.push({
      line: lineIdx + 1,
      col: t.index - lineStarts[lineIdx] + 1,
      token: t.name,
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
 * the output has zero changes. `liveSkills` is only the dash form's set of known commands
 * (default: the bundled plugin's skills); it never makes a token unknown here.
 */
function rewriteText(text, { liveSkills } = {}) {
  const rawLines = text.split('\n');
  const ignored = _ignoredLines(rawLines);
  const lineStarts = _lineStarts(text);
  const changes = [];
  const removed = [];
  let result = '';
  let cursor = 0;
  for (const t of _tokens(text, liveSkills)) {
    if (t.index < cursor) continue;
    const lineIdx = _lineIndexForOffset(lineStarts, t.index);
    if (ignored.has(lineIdx)) continue;
    const { kind, replacement } = resolveToken(t.prefix, t.name);
    if (kind === 'removed') {
      removed.push({ token: t.name, line: lineIdx + 1 });
      continue;
    }
    if (kind === 'renamed' || kind === 'prefix') {
      result += text.slice(cursor, t.index);
      result += replacement;
      cursor = t.index + t.full.length;
      changes.push({ from: t.full, to: replacement, line: lineIdx + 1 });
    }
    // ok/unknown (unknown cannot occur here — no liveSkills is passed): leave untouched.
  }
  result += text.slice(cursor);
  return { text: result, changes, removed };
}

// ─── scanLegacyAgentPaths ────────────────────────────────────────────────────────
//
// Objective 44 (AUT-03, TRD 44-08). Agents ship inside the plugin, and a typed subagent gets
// its definition as the system prompt; global-upgrade moves the legacy home-directory copies
// into a backup. A spawn prompt telling an agent to read "<home>/.claude/agents/<name>.md"
// therefore spends a turn on a Read that fails. This matches a concrete <name>.md, with or
// without a leading "@"; a glob naming the legacy location ("agents/df-*") never matches.
//
// Deliberately NOT part of scanText/rewriteText: those power migration 0007's rewrite, which
// must never touch agent paths. The CI gate (doc-refs.repo.test.cjs tests 11-14) calls this.
const LEGACY_AGENT_PATH_RE = /@?~\/\.claude\/agents\/[A-Za-z0-9_-]+\.md/g;

/** Every legacy agent-path token in `text`: [{line, token}], 1-based lines (as scanText). */
function scanLegacyAgentPaths(text) {
  const results = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(LEGACY_AGENT_PATH_RE.source, 'g');
    let m;
    while ((m = re.exec(lines[i])) !== null) {
      results.push({ line: i + 1, token: m[0] });
    }
  }
  return results;
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
  globToRegExp: _globToRegExp,
  TOKEN_RE,
  DASH_RE,
  NAMESPACES,
  DocRefsError,
  scanLegacyAgentPaths,
  LEGACY_AGENT_PATH_RE,
};
