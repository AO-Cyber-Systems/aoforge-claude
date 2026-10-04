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

// `.DEFAULT_GOAL := all` (any assignment operator) names the target a bare `make` runs.
const MAKE_DEFAULT_GOAL = /^\.DEFAULT_GOAL\s*(?:::=|:=|\?=|\+=|!=|=)\s*([^\s#]+)/;

// `[export|override] NAME op value` with op `?=`, `::=`, `:=` or `=` (TRD 43-01). `+=` (append) and
// `!=` (shell) are deliberately not definitions: their value is not a literal this reader can use.
const MAKE_ASSIGN = /^(?:(?:export|override)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*(\?=|::=|:=|=)\s*(.*)$/;

// A reference this reader may expand: `$$` (an escaped dollar, kept as written, and consumed here so
// `$$(GO)` is never read as `$(GO)`), `$(NAME)` or `${NAME}` where NAME is a plain identifier.
// `$(shell ...)`, `$(call f,x)`, `$(V:a=b)` and anything else with a space, comma or colon never match.
const MAKE_REF = /\$\$|\$\(([A-Za-z_][A-Za-z0-9_]*)\)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

// How many variables deep one reference may chain (`A -> B -> C` is three).
const MAKE_VAR_DEPTH = 3;

/**
 * Literal substitution of simple variable references from `vars` (name -> value text). Bounded
 * literal substitution only: no `$(shell ...)`, functions, conditionals or target-specific values.
 * An unknown name stays verbatim. A reference that cycles, or chains past MAKE_VAR_DEPTH, stays
 * verbatim as a whole, so `A = $(A) x` is never half-expanded and nothing recurses forever.
 * Nested calls return null when anything inside them was blocked; the top-level call never does.
 */
function expandMakeVars(text, vars, depth = 0, trail = []) {
  let blocked = false;
  const out = String(text).replace(MAKE_REF, (ref, paren, brace) => {
    const name = paren || brace;
    if (name === undefined || !vars.has(name)) return ref;
    const inner = depth >= MAKE_VAR_DEPTH || trail.includes(name)
      ? null
      : expandMakeVars(vars.get(name), vars, depth + 1, [...trail, name]);
    if (inner === null) {
      blocked = true;
      return ref;
    }
    return inner;
  });
  return blocked && depth > 0 ? null : out;
}

/** The index of the first unescaped `#` in `text` (a `\#` is a literal hash), or -1. */
function makeCommentAt(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '#') continue;
    let slashes = 0;
    for (let k = i - 1; k >= 0 && text[k] === '\\'; k--) slashes++;
    if (slashes % 2 === 0) return i;
  }
  return -1;
}

/**
 * The index of the `;` that starts a rule line's inline recipe, or -1 (TRD 43-09). GNU make takes the
 * inline recipe from "an unquoted ; that is not after an unquoted #": in `t: ## help; more`, the `;`
 * is comment text, so `more` never becomes a recipe unit. A `#` AFTER the `;` belongs to the recipe
 * (make passes it to the shell).
 */
function makeInlineSemi(rest) {
  const semi = rest.indexOf(';');
  if (semi < 0) return -1;
  const hash = makeCommentAt(rest);
  return hash >= 0 && hash < semi ? -1 : semi;
}

/**
 * Prerequisite names from the text after a rule's colon: everything before a `;` inline recipe,
 * order-only prerequisites (after `|`) included. A target-specific variable line
 * (`test: GOFLAGS += -v`) has no prerequisites; variable references and patterns are skipped.
 */
function makePrereqs(rest) {
  const semi = makeInlineSemi(rest);
  let part = semi >= 0 ? rest.slice(0, semi) : rest;
  const hash = makeCommentAt(part);
  if (hash >= 0) part = part.slice(0, hash);
  part = part.replace(/\\#/g, '#');
  if (part.includes('=')) return [];
  return part.trim().split(/\s+/).filter((n) => n && n !== '|' && !/[%$()]/.test(n));
}

/**
 * Parse Makefile text -> `{ targets: [{ name, body }], hasInclude, deps: { name: [...] }, defaultGoal }`.
 *
 * Recipe lines REQUIRE a leading tab (the GNU default; `.RECIPEPREFIX` is not honoured), so a
 * space-indented line is never a recipe line. Variable assignments, `.PHONY` and other special
 * targets, pattern rules (`%`) and targets containing `$(...)` are not targets. `define` blocks
 * are skipped. A target defined twice accumulates its recipes and its prerequisites. `deps` maps
 * every target to its prerequisite names; `defaultGoal` is the `.DEFAULT_GOAL` value or null.
 *
 * Simple variable references in recipe lines (`$(GO)`, `${GO}`) are expanded from the Makefile's own
 * `?=` / `:=` / `::=` / `=` assignments, bounded at three levels (see `expandMakeVars`).
 */
function parseMakefile(text) {
  const byName = new Map();
  const depsOf = new Map();
  let hasInclude = false;
  let defaultGoal = null;
  let current = []; // entries receiving recipe lines
  let defineDepth = 0;
  const vars = new Map(); // simple assignments, name -> literal value (TRD 43-01)

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
    const goal = MAKE_DEFAULT_GOAL.exec(line);
    if (goal) {
      defaultGoal = goal[1];
      current = [];
      continue;
    }
    // Checked BEFORE MAKE_RULE so `GO := go` is never read as a rule: `?=` keeps the first
    // definition, `:=` / `::=` / `=` always take the later one (make's last-wins for those).
    const assign = MAKE_ASSIGN.exec(line);
    if (assign) {
      current = [];
      if (assign[2] !== '?=' || !vars.has(assign[1])) {
        vars.set(assign[1], assign[3].replace(/(?<!\\)#.*$/, '').trim());
      }
      continue;
    }

    const rule = MAKE_RULE.exec(line);
    current = [];
    if (!rule) continue;
    const names = rule[1].trim().split(/\s+/)
      .filter((n) => n && !MAKE_SPECIAL.test(n) && !/[%$()]/.test(n));
    if (names.length === 0) continue;
    const rest = rule[2];
    const semi = makeInlineSemi(rest);
    const inline = semi >= 0 ? cleanRecipeText(rest.slice(semi + 1)) : null;
    const prereqs = makePrereqs(rest);
    for (const name of names) {
      let entry = byName.get(name);
      if (!entry) {
        entry = { name, body: [] };
        byName.set(name, entry);
        depsOf.set(name, []);
      }
      const deps = depsOf.get(name);
      for (const p of prereqs) if (!deps.includes(p)) deps.push(p);
      if (inline !== null) entry.body.push(inline);
      current.push(entry);
    }
  }
  // Expanded after the whole scan: make expands a recipe lazily, so a variable defined below the
  // rule still applies, and the parser (not the classifier) owns it so `hasTarget`, bodies and
  // dependency expansion all see the same text.
  const targets = [...byName.values()];
  if (vars.size > 0) {
    for (const entry of targets) entry.body = entry.body.map((cmd) => expandMakeVars(cmd, vars));
  }
  return { targets, hasInclude, deps: Object.fromEntries(depsOf), defaultGoal };
}

function makeInvocation(dir, name) {
  return dir ? `make -C ${shq(dir)} ${shq(name)}` : `make ${shq(name)}`;
}

function collectMake(d, targets) {
  const file = pickFile(d.entries, RUNNER_FILES.make);
  if (!file) return;
  const text = readText(path.join(d.abs, file));
  if (text === null) return;
  const parsed = parseMakefile(text);
  // A bare `make` runs `.DEFAULT_GOAL`, else the first target whose name does not start with `.`.
  const first = parsed.targets.find((t) => !t.name.startsWith('.'));
  const goal = parsed.defaultGoal !== null ? parsed.defaultGoal : (first ? first.name : null);
  parsed.targets.forEach((t, order) => {
    targets.push({
      runner: 'make',
      dir: d.rel,
      file: joinRel(d.rel, file),
      name: t.name,
      aliases: [],
      body: t.body,
      invocation: makeInvocation(d.rel, t.name),
      deps: [...(parsed.deps[t.name] || [])],
      isDefault: t.name === goal,
      order,
    });
  });
}

// ─── Taskfile ─────────────────────────────────────────────────────────────────
//
// A small indentation reader (the stack-ci approach), NOT yaml-lite: Taskfiles use `{{.VAR}}`
// templating and anchors, and task names contain `:`. Unknown shapes are skipped, never thrown.

const PROP_KEY = /^([A-Za-z_<][\w.<-]*)\s*:(?:\s+(.*))?$/;
const BLOCK_SCALAR = /^([|>])[+-]?\d*$/;

function yamlRows(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((raw) => {
    const t = raw.trim();
    return { raw, indent: raw.length - raw.trimStart().length, text: t, blank: t === '' };
  });
}

function significant(row) {
  return !row.blank && !row.text.startsWith('#');
}

function isListItem(text) {
  return text === '-' || text.startsWith('- ');
}

/** A YAML scalar: unquote, or cut a trailing ` # comment` from a plain one. */
function yamlScalar(str) {
  const s = String(str).trim();
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(s);
    if (m) return m[1].replace(/\\(["\\])/g, '$1');
  }
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'/.exec(s);
    if (m) return m[1].replace(/''/g, "'");
  }
  return s.replace(/(^|\s)#.*$/, '').trim();
}

/** `[a, "b, c"]` -> ['a', 'b, c']; null when it is not a flow list. */
function flowItems(str) {
  const m = /^\[(.*)\]\s*(?:#.*)?$/.exec(String(str).trim());
  if (!m) return null;
  const items = [];
  let cur = '';
  let quote = null;
  for (const ch of m[1]) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map(yamlScalar).filter((s) => s !== '');
}

/** The value after a key: an anchor definition and comment-only values count as empty. */
function cleanValue(value) {
  let v = String(value || '').trim();
  if (v.startsWith('#')) return '';
  v = v.replace(/^&\S+\s*/, '');
  return v.startsWith('#') ? '' : v.trim();
}

/** Lines of a `|` (one per line) or `>` (folded to one) block scalar; `#` lines are shell comments. */
function blockScalarLines(style, rows) {
  const filled = rows.filter((r) => !r.blank);
  if (filled.length === 0) return [];
  const base = Math.min(...filled.map((r) => r.indent));
  const lines = filled
    .map((r) => r.raw.slice(base).trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length === 0) return [];
  return style === '>' ? [lines.join(' ')] : lines;
}

/** Body lines for `key: value` where the value may open a block scalar over `rows`. */
function valueLines(value, rows) {
  const v = cleanValue(value);
  if (v === '' || v.startsWith('*') || v.startsWith('{')) return [];
  const block = BLOCK_SCALAR.exec(v);
  if (block) return blockScalarLines(block[1], rows);
  const flow = flowItems(v);
  if (flow) return flow;
  const s = yamlScalar(v);
  return s === '' ? [] : [s];
}

/**
 * Split `rows` into `{ key, value, rows }` entries at `keyIndent`. Deeper rows (and blanks)
 * belong to the entry above; so do same-indent `- item` rows (YAML's compact list form).
 */
function mapEntries(rows, keyIndent, matchKey = matchProp) {
  const entries = [];
  for (const row of rows) {
    const cur = entries[entries.length - 1];
    if (row.blank) {
      if (cur) cur.rows.push(row);
    } else if (row.indent === keyIndent && !row.text.startsWith('#')) {
      const hit = matchKey(row.text);
      if (hit) entries.push({ key: hit.key, value: hit.value, rows: [] });
      else if (cur && isListItem(row.text)) cur.rows.push(row);
    } else if (cur && row.indent > keyIndent) {
      cur.rows.push(row);
    }
  }
  return entries;
}

function matchProp(text) {
  const m = PROP_KEY.exec(text);
  return m ? { key: m[1], value: m[2] || '' } : null;
}

/** A task header: `name:` / `lint:go:` / `"quoted:name":`, with an optional inline value. */
function matchTaskName(text) {
  let m = /^(["'])(.+?)\1:(?:\s+(.*))?$/.exec(text);
  if (m) return { key: m[2], value: m[3] || '' };
  m = /^([^\s#"'&*<[{-][^#]*?):(?:\s+(.*))?$/.exec(text);
  return m ? { key: m[1].trim(), value: m[2] || '' } : null;
}

/** Block-list items (`- x`) in `rows`, each with the column its content starts at. */
function listItems(rows) {
  const first = rows.find((r) => significant(r) && isListItem(r.text));
  if (!first) return [];
  const items = [];
  for (const row of rows) {
    if (row.indent === first.indent && isListItem(row.text)) {
      const inner = row.text.slice(1).trimStart();
      items.push({ text: inner, col: row.indent + (row.text.length - inner.length), rows: [] });
    } else if (items.length > 0 && (row.blank || row.indent > first.indent)) {
      items[items.length - 1].rows.push(row);
    }
  }
  return items;
}

function entriesLines(entries) {
  const out = [];
  for (const e of entries) {
    if (e.key === 'cmd') out.push(...valueLines(e.value, e.rows));
    else if (e.key === 'task') {
      const name = yamlScalar(e.value);
      if (name !== '') out.push(`task ${name}`);
    }
  }
  return out;
}

/** Body lines of one `cmds:` item: a bare command, `- cmd:`, `- task:`, or a block scalar. */
function itemLines(item) {
  const t = item.text;
  if (t === '') {
    const first = item.rows.find(significant);
    return first ? entriesLines(mapEntries(item.rows, first.indent)) : [];
  }
  if (!PROP_KEY.test(t)) return valueLines(t, item.rows);
  const head = { raw: `${' '.repeat(item.col)}${t}`, indent: item.col, text: t, blank: false };
  return entriesLines(mapEntries([head, ...item.rows], item.col));
}

function listValues(entry) {
  const flow = flowItems(cleanValue(entry.value));
  return flow || listItems(entry.rows).map((it) => yamlScalar(it.text)).filter((s) => s !== '');
}

// A `deps:` item is a task name (`- gen`) or a map naming one (`- task: gen` with `vars:` under
// it, or the flow form `{task: gen}`). Anything else (a `vars:` fragment of a split flow map) is
// not a name.
const DEP_TASK = /^\{?\s*task:\s*["']?([^"',}\s]+)/;
const DEP_NAME = /^[^\s{}[\],]+$/;

function depName(text) {
  const m = DEP_TASK.exec(String(text).trim());
  if (m) return m[1];
  const s = yamlScalar(text);
  return DEP_NAME.test(s) ? s : null;
}

/** Task names a Taskfile `deps:` entry lists, flow or block, in order. */
function taskDeps(entry) {
  const flow = flowItems(cleanValue(entry.value));
  const raw = flow || listItems(entry.rows).map((it) => {
    if (it.text !== '') return it.text;
    const first = it.rows.find(significant); // `-` alone, the map on the next line
    return first ? first.text : '';
  });
  const out = [];
  for (const text of raw) {
    const name = depName(text);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** One task's properties from its header value and the rows under it. */
function readTaskProps(value, rows) {
  const task = { body: [], aliases: [], dir: null, deps: [], internal: false };
  const v = cleanValue(value);
  if (v !== '') { // shorthand: `name: go build ./...`, `name: [a, b]`, `name: |`
    task.body = valueLines(v, rows);
    return task;
  }
  const first = rows.find(significant);
  if (!first) return task;
  for (const e of mapEntries(rows, first.indent)) {
    if (e.key === 'cmd') task.body.push(...valueLines(e.value, e.rows));
    else if (e.key === 'cmds') {
      const flow = flowItems(cleanValue(e.value));
      if (flow) task.body.push(...flow);
      else for (const it of listItems(e.rows)) task.body.push(...itemLines(it));
    } else if (e.key === 'aliases') task.aliases.push(...listValues(e));
    else if (e.key === 'deps') task.deps.push(...taskDeps(e));
    else if (e.key === 'dir') {
      const d = yamlScalar(e.value);
      if (d !== '') task.dir = d;
    } else if (e.key === 'internal') {
      // `true` or `"true"` only: a templated or any other value is not provably internal.
      task.internal = yamlScalar(e.value) === 'true';
    }
  }
  return task;
}

/**
 * Parse Taskfile text -> `{ tasks: [{ name, aliases, body, dir, deps, internal }], hasIncludes }`.
 * `dir` is the task's own `dir:` verbatim; `deps` the task names its `deps:` lists; `internal` is
 * true for `internal: true` (a task `task <name>` cannot run from the CLI; it stays in this list
 * because a public task that depends on or calls it still runs its body); `hasIncludes` is true
 * when a top-level `includes:` brings in tasks this reader cannot see.
 */
function parseTaskfile(text) {
  const rows = yamlRows(text);
  const tasks = [];
  let hasIncludes = false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!significant(row) || row.indent !== 0) continue;
    const m = /^([A-Za-z_][\w-]*)\s*:/.exec(row.text);
    if (!m) continue;
    if (m[1] === 'includes') hasIncludes = true;
    if (m[1] !== 'tasks') continue;
    let end = i + 1;
    while (end < rows.length && !(significant(rows[end]) && rows[end].indent === 0)) end += 1;
    const section = rows.slice(i + 1, end);
    const first = section.find(significant);
    if (first) {
      for (const e of mapEntries(section, first.indent, matchTaskName)) {
        const p = readTaskProps(e.value, e.rows);
        tasks.push({ name: e.key, aliases: p.aliases, body: p.body, dir: p.dir, deps: p.deps, internal: p.internal });
      }
    }
    i = end - 1;
  }
  return { tasks, hasIncludes };
}

/** A task-level `dir:` as a repo-relative cwd, or undefined when it is templated or escapes the repo. */
function taskCwd(taskfileDir, value) {
  if (!value) return undefined;
  const v = value.replace(/^\{\{\s*\.(?:ROOT_DIR|TASKFILE_DIR)\s*\}\}\/?/, '');
  if (v.includes('{{') || v.startsWith('/')) return undefined;
  const joined = path.posix.normalize(joinRel(taskfileDir, v === '' ? '.' : v));
  if (joined === '..' || joined.startsWith('../')) return undefined;
  return joined === '.' ? '' : joined;
}

function taskInvocation(dir, name) {
  return dir ? `task -d ${shq(dir)} ${shq(name)}` : `task ${shq(name)}`;
}

// ─── justfile ─────────────────────────────────────────────────────────────────

// `name params: deps`, with an optional `@` quiet prefix. `x := y`, `set shell := ...` and
// `alias a := b` never match: the colon must not be followed by `=` (or `:`).
const JUST_RECIPE = /^@?([A-Za-z_][\w-]*)(?:\s+[^:]*?)?\s*:(?![=:])/;

/** Recipe body lines: comments and a shebang line dropped; `@` / `-` line prefixes stripped. */
function justBody(lines) {
  const trimmed = lines.map((l) => String(l).trim()).filter((l) => l !== '');
  const shebang = trimmed.length > 0 && trimmed[0].startsWith('#!');
  const out = [];
  for (const line of trimmed) {
    if (line.startsWith('#')) continue;
    out.push(shebang ? line : line.replace(/^[@-]+\s*/, ''));
  }
  return out;
}

// A dependency after the recipe colon: `gen`, `(lint "strict")` (a recipe with arguments), and
// the post-dependencies after `&&`, which count too.
const JUST_DEP = /\(\s*([A-Za-z_][\w-]*)[^)]*\)|"(?:[^"\\]|\\.)*"|'[^']*'|([A-Za-z_][\w-]*)/g;

/** Recipe names in the text after a justfile recipe's colon (a trailing `# comment` dropped). */
function justDeps(rest) {
  const out = [];
  const text = String(rest).replace(/\s#.*$/, '');
  for (const m of text.matchAll(JUST_DEP)) {
    const name = m[1] || m[2];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Parse justfile text -> `{ recipes: [{ name, body, deps }], aliases: { alias: target }, hasImport }`.
 * `set`, `export`, `alias`, `import`, `mod` and `[attribute]` lines are not recipes. Bodies keep
 * their shell text as written (a `(cd x && ...)` subshell stays whole). `deps` are the recipe
 * names after the colon, post-dependencies included.
 */
function parseJustfile(text) {
  const recipes = [];
  const aliases = new Map();
  let hasImport = false;
  let current = null;
  for (const line of logicalLines(text)) {
    if (/^[ \t]+\S/.test(line)) {
      if (current) current.raw.push(line);
      continue;
    }
    if (/^\s*$/.test(line) || line.startsWith('#')) continue; // do not end a recipe
    current = null;
    if (line.startsWith('[')) continue; // attribute line
    const alias = /^alias\s+([\w-]+)\s*:=\s*([\w-]+)/.exec(line);
    if (alias) {
      aliases.set(alias[1], alias[2]);
      continue;
    }
    if (/^(?:import|mod)\??(?:\s|$)/.test(line)) {
      hasImport = true;
      continue;
    }
    if (/^(?:set|export|unexport)\s/.test(line)) continue;
    const recipe = JUST_RECIPE.exec(line);
    if (recipe) {
      current = { name: recipe[1], raw: [], deps: justDeps(line.slice(recipe[0].length)) };
      recipes.push(current);
    }
  }
  return {
    recipes: recipes.map((r) => ({ name: r.name, body: justBody(r.raw), deps: r.deps })),
    aliases: Object.fromEntries(aliases),
    hasImport,
  };
}

function justInvocation(dir, file, name) {
  return dir
    ? `just --justfile ${shq(joinRel(dir, file))} ${shq(name)}`
    : `just ${shq(name)}`;
}

// ─── collectors (static parse; exec enrichment adds names, never removes) ─────

function collectTask(d, targets, exec) {
  const file = pickFile(d.entries, RUNNER_FILES.task);
  if (!file) return;
  const text = readText(path.join(d.abs, file));
  if (text === null) return;
  const relFile = joinRel(d.rel, file);
  parseTaskfile(text).tasks.forEach((t, order) => {
    const target = {
      runner: 'task',
      dir: d.rel,
      file: relFile,
      name: t.name,
      aliases: t.aliases,
      body: t.body,
      invocation: taskInvocation(d.rel, t.name),
      deps: t.deps,
      internal: t.internal === true,
      isDefault: t.name === 'default', // a bare `task` runs the task named `default`
      order,
    };
    const cwd = taskCwd(d.rel, t.dir);
    if (cwd !== undefined) target.cwd = cwd;
    targets.push(target);
  });
  if (exec) enrichTask(exec, d, relFile, targets);
}

function collectJust(d, targets, exec) {
  const file = pickFile(d.entries, RUNNER_FILES.just);
  if (!file) return;
  const text = readText(path.join(d.abs, file));
  if (text === null) return;
  const relFile = joinRel(d.rel, file);
  const parsed = parseJustfile(text);
  // A bare `just` runs the recipe named `default`, else the first recipe in the file.
  const named = parsed.recipes.find((r) => r.name === 'default');
  const goal = named ? named.name : (parsed.recipes[0] ? parsed.recipes[0].name : null);
  parsed.recipes.forEach((r, order) => {
    targets.push({
      runner: 'just',
      dir: d.rel,
      file: relFile,
      name: r.name,
      aliases: Object.keys(parsed.aliases).filter((a) => parsed.aliases[a] === r.name),
      body: r.body,
      invocation: justInvocation(d.rel, file, r.name),
      deps: r.deps,
      isDefault: r.name === goal,
      order,
    });
  });
  if (exec) enrichJust(exec, d, file, targets);
}

// ─── exec enrichment ──────────────────────────────────────────────────────────
//
// `exec(cmd, args, { cwd })` is injected and synchronous (like execFileSync); it returns stdout
// as a string, a Buffer or `{ stdout }`. Any throw (ENOENT when the runner is absent included),
// bad JSON or unexpected shape is swallowed: the static result stays as it was.

function execJson(exec, cmd, args, cwd) {
  if (typeof exec !== 'function') return null;
  try {
    const out = exec(cmd, args, { cwd });
    const raw = out && typeof out === 'object' && !Buffer.isBuffer(out) ? out.stdout : out;
    const json = JSON.parse(String(raw));
    return json && typeof json === 'object' ? json : null;
  } catch (_) {
    return null;
  }
}

/** Add a name the static pass missed (marked `via: 'exec'`) or merge aliases into a known one. */
function upsertExec(targets, d, { runner, file, name, aliases, body, invocation }) {
  const known = targets.find((t) => t.runner === runner && t.dir === d.rel && t.name === name);
  if (known) {
    for (const a of aliases) if (a !== name && !known.aliases.includes(a)) known.aliases.push(a);
    return;
  }
  targets.push({
    runner,
    dir: d.rel,
    file,
    name,
    aliases: [...new Set(aliases.filter((a) => a !== name))],
    body,
    invocation,
    deps: [],
    isDefault: name === 'default',
    order: targets.filter((t) => t.file === file).length, // after every statically read target
    via: 'exec',
  });
}

function stringList(v) {
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s !== '') : [];
}

function enrichTask(exec, d, file, targets) {
  const json = execJson(exec, 'task', ['--list-all', '--json'], d.abs);
  if (!json || !Array.isArray(json.tasks)) return;
  for (const t of json.tasks) {
    if (!t || typeof t.name !== 'string' || t.name === '') continue;
    upsertExec(targets, d, {
      runner: 'task',
      file,
      name: t.name,
      aliases: stringList(t.aliases),
      body: [],
      invocation: taskInvocation(d.rel, t.name),
    });
  }
}

/** One just JSON body line: fragments are strings or expression arrays like ["variable","x"]. */
function renderJustLine(line) {
  if (typeof line === 'string') return line;
  if (!Array.isArray(line)) return '';
  return line
    .map((f) => (typeof f === 'string' ? f : `{{${Array.isArray(f) && typeof f[1] === 'string' ? f[1] : ''}}}`))
    .join('');
}

function enrichJust(exec, d, file, targets) {
  const json = execJson(exec, 'just', ['--dump', '--dump-format', 'json'], d.abs);
  if (!json || !json.recipes || typeof json.recipes !== 'object') return;
  const aliasesOf = new Map();
  for (const [alias, a] of Object.entries(json.aliases && typeof json.aliases === 'object' ? json.aliases : {})) {
    if (!a || typeof a.target !== 'string') continue;
    aliasesOf.set(a.target, [...(aliasesOf.get(a.target) || []), alias]);
  }
  for (const [name, r] of Object.entries(json.recipes)) {
    if (!r || typeof r !== 'object' || r.private === true) continue;
    upsertExec(targets, d, {
      runner: 'just',
      file: joinRel(d.rel, file),
      name,
      aliases: aliasesOf.get(name) || [],
      body: Array.isArray(r.body) ? justBody(r.body.map(renderJustLine)) : [],
      invocation: justInvocation(d.rel, file, name),
    });
  }
}

// ─── package.json scripts (npm family) ────────────────────────────────────────

// Lockfile -> manager, in precedence order (pnpm > yarn > bun > npm). Only the lockfile in the
// package's own directory counts; with none (or only package-lock.json) the manager is npm.
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
];

// The flag that points each manager at a package directory below the repo root.
const DIR_FLAG = { npm: '--prefix', pnpm: '-C', yarn: '--cwd', bun: '--cwd' };

function detectManager(entries) {
  const names = new Set(entries.filter((e) => !e.isDirectory()).map((e) => e.name));
  for (const [file, manager] of LOCKFILES) if (names.has(file)) return manager;
  return 'npm';
}

/** `[[name, script]]` for the string-valued scripts of package.json text; [] for anything else. */
function readPackageScripts(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (_) {
    return [];
  }
  const scripts = pkg && typeof pkg === 'object' && !Array.isArray(pkg) ? pkg.scripts : null;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return [];
  return Object.entries(scripts).filter(([, script]) => typeof script === 'string');
}

/**
 * `<mgr> test` for `test`, else `<mgr> run <name>`. bun is the exception: `bun test` is bun's own
 * test runner and never looks at the package.json script, so bun always uses `bun run`.
 */
function npmInvocation(manager, dir, name) {
  const verb = name === 'test' && manager !== 'bun' ? ['test'] : ['run', shq(name)];
  const at = dir ? [DIR_FLAG[manager], shq(dir)] : [];
  return [manager, ...at, ...verb].join(' ');
}

function collectNpm(d, targets) {
  const file = pickFile(d.entries, RUNNER_FILES.npm);
  if (!file) return;
  const text = readText(path.join(d.abs, file));
  if (text === null) return;
  const manager = detectManager(d.entries);
  readPackageScripts(text).forEach(([name, script], order) => {
    targets.push({
      runner: 'npm',
      dir: d.rel,
      file: joinRel(d.rel, file),
      name,
      aliases: [],
      body: [script],
      invocation: npmInvocation(manager, d.rel, name),
      deps: [],
      isDefault: false, // a bare `npm run` lists scripts; it runs none
      order,
      manager,
    });
  });
}

// ─── conventional scripts (bin/ and scripts/) ─────────────────────────────────

const SCRIPT_DIRS = ['bin', 'scripts'];
const CONVENTIONAL_SCRIPTS = new Set(['test', 'build', 'lint', 'verify', 'check', 'fmt', 'format', 'e2e']);
const SCRIPT_BODY_LINES = 40;

/**
 * `<dir>/bin/<n>.sh` and `<dir>/scripts/<n>.sh` for the conventional names. `name` is the path
 * inside `dir`, `file` the repo-relative path, and the invocation `./<file>` (runnable from the
 * repo root). A file without the executable bit is still listed, with `executable: false`.
 */
function collectScripts(d, targets) {
  for (const sub of SCRIPT_DIRS) {
    if (!d.entries.some((e) => e.isDirectory() && e.name === sub)) continue;
    const names = readDir(path.join(d.abs, sub))
      .filter((e) => !e.isDirectory() && e.name.endsWith('.sh') && CONVENTIONAL_SCRIPTS.has(e.name.slice(0, -3)))
      .map((e) => e.name)
      .sort();
    for (const base of names) {
      const abs = path.join(d.abs, sub, base);
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch (_) {
        continue;
      }
      const text = stat.isFile() ? readText(abs) : null;
      if (text === null) continue;
      const file = joinRel(joinRel(d.rel, sub), base);
      targets.push({
        runner: 'script',
        dir: d.rel,
        file,
        name: `${sub}/${base}`,
        aliases: [],
        body: text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#')).slice(0, SCRIPT_BODY_LINES),
        invocation: shq(`./${file}`),
        deps: [],
        isDefault: false,
        order: 0, // one script per file
        executable: (stat.mode & 0o111) !== 0,
      });
    }
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
 *   [{ runner, dir, file, name, aliases, body, invocation, ...extras }]
 *
 * `runner` is make | task | just | npm | script. `dir` is the repo-relative directory holding the
 * runner file ('' for the root); `file` is the repo-relative runner file; `invocation` is
 * runnable from the repo root (`make -C svc test`, `task -d svc test`, `just --justfile
 * svc/justfile test`, `npm --prefix web run build`, `./bin/test.sh`). `body` is the raw logical
 * lines, unclassified. Sorted by (dir, runner, name). Never throws: an unreadable root or file
 * yields fewer (or no) targets.
 *
 * Every target also carries (TRD 42-13):
 *   deps        the target names it depends on: Make prerequisites (order-only included),
 *               Taskfile `deps:` (`- x` and `- task: x`), justfile recipe dependencies
 *   isDefault   true for the target a bare runner invocation runs: Make `.DEFAULT_GOAL` else the
 *               first target, Taskfile `default`, justfile `default` else the first recipe
 *   order       its position in its runner file (the output is sorted by name, so this keeps
 *               the source order a ranking can fall back on)
 *
 * Extras, present only where they apply:
 *   cwd         task   the task's own `dir:`, repo-relative (skipped when templated)
 *   manager     npm    pnpm | yarn | bun | npm, from the lockfile beside package.json
 *   executable  script true when any execute bit is set
 *   via         task, just   'exec' for names only the injected exec enrichment found
 *
 * `exec(cmd, args, { cwd })` is optional and synchronous; see "exec enrichment" below.
 */
function readRunners(root, { maxDepth = 1, exec = null } = {}) {
  const depth = Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : 1;
  const abs = path.resolve(String(root));
  const targets = [];
  for (const d of listDirs(abs, depth)) {
    collectMake(d, targets);
    collectTask(d, targets, exec);
    collectJust(d, targets, exec);
    collectNpm(d, targets);
    collectScripts(d, targets);
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
  const rootAbs = path.resolve(String(root));
  const rel = normDir(dir);
  const abs = insideRoot(rootAbs, rel);
  if (abs === null) return false;
  const entries = readDir(abs);

  switch (runner) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      const file = pickFile(entries, RUNNER_FILES.npm);
      const text = file ? readText(path.join(abs, file)) : null;
      if (text === null) return false;
      return readPackageScripts(text).some(([script]) => script === name);
    }
    case 'script': {
      const target = insideRoot(rootAbs, joinRel(rel, name));
      try {
        return target !== null && fs.statSync(target).isFile();
      } catch (_) {
        return false;
      }
    }
    case 'make': {
      const file = pickFile(entries, RUNNER_FILES.make);
      const text = file ? readText(path.join(abs, file)) : null;
      if (text === null) return false;
      const parsed = parseMakefile(text);
      if (parsed.targets.some((t) => t.name === name)) return true;
      return parsed.hasInclude ? 'unknown' : false;
    }
    case 'task': {
      const file = pickFile(entries, RUNNER_FILES.task);
      const text = file ? readText(path.join(abs, file)) : null;
      if (text === null) return false;
      const parsed = parseTaskfile(text);
      const task = parsed.tasks.find((t) => t.name === name || t.aliases.includes(name));
      // An internal task was found but cannot be invoked from the CLI: false, never 'unknown'.
      if (task) return !task.internal;
      return parsed.hasIncludes ? 'unknown' : false;
    }
    case 'just': {
      const file = pickFile(entries, RUNNER_FILES.just);
      const text = file ? readText(path.join(abs, file)) : null;
      if (text === null) return false;
      const parsed = parseJustfile(text);
      if (parsed.recipes.some((r) => r.name === name) || Object.hasOwn(parsed.aliases, name)) return true;
      return parsed.hasImport ? 'unknown' : false;
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
  _parseTaskfile: parseTaskfile,
  _parseJustfile: parseJustfile,
};
