'use strict';

// stack-runners.cjs — pure structural reader of task-runner targets and their bodies
// (TRD 42-04, SDR-02 / SDR-01).
//
// `readRunners(root, { maxDepth, exec })` finds Makefile / Taskfile / justfile / package.json
// scripts / conventional shell scripts in the repo root and (by default) one level down, and
// returns each target with the LOGICAL lines of its body. It does not classify: 42-07 runs the
// bodies through stack-shell.normalizeScript and stack-classify. `hasTarget` answers "does this
// runner target exist?" for 42-06's command verification.
//
// Static parsing is the contract (macOS ships GNU Make 3.81, so there is no `make -pn`). The
// optional `exec` enrichment only ever ADDS names the static pass could not see, and only runs
// through the injected function — nothing in this module spawns a process.
//
// Requires only fs/path.

const fs = require('fs');
const path = require('path');

/** Runner file names per runner, in preference order (GNU make prefers GNUmakefile). */
const RUNNER_FILES = Object.freeze({
  make: Object.freeze(['GNUmakefile', 'makefile', 'Makefile']),
  task: Object.freeze(['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml']),
  just: Object.freeze(['justfile', 'Justfile', '.justfile']),
  npm: Object.freeze(['package.json']),
});

/** Directories never entered when looking for runner files. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  'third_party',
  '.worktrees',
  '.dart_tool',
  'build',
]);

// ─── filesystem helpers ───────────────────────────────────────────────────────

function readDir(abs) {
  try {
    return fs.readdirSync(abs, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

function readText(abs) {
  try {
    return fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return null;
  }
}

/** First name from `names` that is a non-directory entry in `entries`, else null. */
function pickFile(entries, names) {
  const files = new Set(entries.filter((e) => !e.isDirectory()).map((e) => e.name));
  for (const name of names) if (files.has(name)) return name;
  return null;
}

function joinRel(dir, name) {
  return dir ? `${dir}/${name}` : name;
}

/** Normalise a caller-supplied dir to '' (root) or a clean posix relative path. */
function normDir(dir) {
  const raw = String(dir == null ? '' : dir).replace(/\\/g, '/');
  const norm = path.posix.normalize(raw === '' ? '.' : raw);
  return norm === '.' ? '' : norm.replace(/\/+$/, '');
}

/** Absolute path of `rel` under `root`, or null when it would escape `root`. */
function insideRoot(root, rel) {
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (back === '') return abs;
  if (back === '..' || back.startsWith(`..${path.sep}`) || path.isAbsolute(back)) return null;
  return abs;
}

/** Quote for a shell command line only when needed. */
function shq(s) {
  const str = String(s);
  return /^[\w@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, `'\\''`)}'`;
}

/**
 * Directories to inspect: the root and every non-skipped directory down to `maxDepth`
 * (root = depth 0). Symlinked directories are not followed.
 */
function listDirs(root, maxDepth) {
  const out = [];
  const visit = (rel, depth) => {
    const abs = rel ? path.join(root, rel) : root;
    const entries = readDir(abs);
    out.push({ rel, abs, entries });
    if (depth >= maxDepth) return;
    const subdirs = entries
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
      .map((e) => e.name)
      .sort();
    for (const name of subdirs) visit(joinRel(rel, name), depth + 1);
  };
  visit('', 0);
  return out;
}

// ─── Makefile ─────────────────────────────────────────────────────────────────

// `.PHONY`, `.SUFFIXES`, `.DEFAULT`, `.PRECIOUS`, ... are directives, not targets.
const MAKE_SPECIAL = /^\.[A-Z][A-Z_]*$/;

// `name [name...] :` or `::`, but never `:=` / `::=` (variable assignments). `=` is excluded
// from the name part so `X = a:b` (a colon AFTER the `=`) does not read as a rule.
const MAKE_RULE = /^([^\s:=#][^:=#]*?)\s*(?:::(?!=)|:(?![:=]))(.*)$/;

function endsWithContinuation(line) {
  const m = /\\+$/.exec(line);
  return m !== null && m[0].length % 2 === 1;
}

/**
 * Physical -> logical lines: a line ending in an odd number of backslashes continues on the
 * next one. The backslash and the next line's leading whitespace (a recipe continuation's tab
 * included) collapse to a single space.
 */
function logicalLines(text) {
  const physical = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < physical.length; i++) {
    let line = physical[i];
    while (endsWithContinuation(line) && i + 1 < physical.length) {
      i += 1;
      line = `${line.slice(0, -1).replace(/\s+$/, '')} ${physical[i].replace(/^\s+/, '')}`;
    }
    out.push(line);
  }
  return out;
}

/** A recipe command with its `@` / `-` / `+` prefixes stripped; null for blanks and comments. */
function cleanRecipeText(text) {
  const s = String(text).replace(/^[\s@+-]+/, '').trim();
  return s === '' || s.startsWith('#') ? null : s;
}

/**
 * Parse Makefile text -> `{ targets: [{ name, body }], hasInclude }`.
 *
 * Recipe lines REQUIRE a leading tab (the GNU default; `.RECIPEPREFIX` is not honoured), so a
 * space-indented line is never a recipe line. Variable assignments, `.PHONY` and other special
 * targets, pattern rules (`%`) and targets containing `$(...)` are not targets. `define` blocks
 * are skipped. A target defined twice accumulates its recipes.
 */
function parseMakefile(text) {
  const byName = new Map();
  let hasInclude = false;
  let current = []; // entries receiving recipe lines
  let defineDepth = 0;

  for (const line of logicalLines(text)) {
    if (defineDepth > 0) {
      if (/^(?:(?:export|override|private)\s+)*define\s/.test(line)) defineDepth += 1;
      else if (/^\s*endef\b/.test(line)) defineDepth -= 1;
      continue;
    }
    if (line.startsWith('\t')) {
      const cmd = cleanRecipeText(line.slice(1));
      if (cmd !== null) for (const entry of current) entry.body.push(cmd);
      continue;
    }
    if (/^\s*$/.test(line) || line.startsWith('#')) continue; // blanks/comments keep the recipe open
    if (/^(?:ifeq|ifneq|ifdef|ifndef|else|endif)\b/.test(line)) continue; // conditionals are transparent
    if (/^(?:(?:export|override|private)\s+)*define\s/.test(line)) {
      defineDepth = 1;
      current = [];
      continue;
    }
    if (/^(?:-include|sinclude|include)\s/.test(line)) {
      hasInclude = true;
      current = [];
      continue;
    }
    if (/^\s/.test(line)) { // space-indented, not a recipe line
      current = [];
      continue;
    }

    const rule = MAKE_RULE.exec(line);
    current = [];
    if (!rule) continue;
    const names = rule[1].trim().split(/\s+/)
      .filter((n) => n && !MAKE_SPECIAL.test(n) && !/[%$()]/.test(n));
    if (names.length === 0) continue;
    const rest = rule[2];
    const semi = rest.indexOf(';');
    const inline = semi >= 0 ? cleanRecipeText(rest.slice(semi + 1)) : null;
    for (const name of names) {
      let entry = byName.get(name);
      if (!entry) {
        entry = { name, body: [] };
        byName.set(name, entry);
      }
      if (inline !== null) entry.body.push(inline);
      current.push(entry);
    }
  }
  return { targets: [...byName.values()], hasInclude };
}

function makeInvocation(dir, name) {
  return dir ? `make -C ${shq(dir)} ${shq(name)}` : `make ${shq(name)}`;
}

function collectMake(d, targets) {
  const file = pickFile(d.entries, RUNNER_FILES.make);
  if (!file) return;
  const text = readText(path.join(d.abs, file));
  if (text === null) return;
  for (const t of parseMakefile(text).targets) {
    targets.push({
      runner: 'make',
      dir: d.rel,
      file: joinRel(d.rel, file),
      name: t.name,
      aliases: [],
      body: t.body,
      invocation: makeInvocation(d.rel, t.name),
    });
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

function compareTargets(a, b) {
  for (const key of ['dir', 'runner', 'name']) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}

/**
 * readRunners(root, { maxDepth = 1, exec = null }) ->
 *   [{ runner, dir, file, name, aliases, body, invocation, executable? }]
 *
 * `dir` is the repo-relative directory holding the runner file ('' for the root); `file` is the
 * repo-relative runner file; `invocation` is runnable from the repo root. Sorted by
 * (dir, runner, name). Never throws: an unreadable root or file yields fewer (or no) targets.
 */
function readRunners(root, { maxDepth = 1 } = {}) {
  const depth = Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : 1;
  const abs = path.resolve(String(root));
  const targets = [];
  for (const d of listDirs(abs, depth)) {
    collectMake(d, targets);
  }
  return targets.sort(compareTargets);
}

/**
 * hasTarget(root, { runner, dir, name }) -> true | false | 'unknown'
 *
 * 'unknown' means the static parse cannot decide: the Makefile `include`s other files and the
 * name is not defined in this one, or the runner is not one this module reads.
 */
function hasTarget(root, { runner, dir = '', name } = {}) {
  if (typeof name !== 'string' || name === '') return false;
  const rel = normDir(dir);
  const abs = insideRoot(path.resolve(String(root)), rel);
  if (abs === null) return false;
  const entries = readDir(abs);

  switch (runner) {
    case 'make': {
      const file = pickFile(entries, RUNNER_FILES.make);
      const text = file ? readText(path.join(abs, file)) : null;
      if (text === null) return false;
      const parsed = parseMakefile(text);
      if (parsed.targets.some((t) => t.name === name)) return true;
      return parsed.hasInclude ? 'unknown' : false;
    }
    default:
      return 'unknown';
  }
}

module.exports = {
  readRunners,
  hasTarget,
  RUNNER_FILES,
  SKIP_DIRS,
  // parsers, exported for unit tests
  _parseMakefile: parseMakefile,
};
