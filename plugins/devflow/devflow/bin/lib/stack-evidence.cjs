'use strict';

// stack-evidence.cjs — command evidence for `df-tools stack init` (TRD 35-04, recomposed in 42-07).
//
// `collectEvidence(root, { from })` returns every command the repository itself declares or runs,
// as STRUCTURED items:
//
//   { key, command, form, source, sourceFile, cwd, area, runner, confidence, weak, tool }
//
//   key         what the command does, by TOOL SEMANTICS (stack-classify), never an English token
//   command     the text to run, runnable from `cwd` (a runner target is `make test` in its own dir)
//   form        check | apply | build | mutate (stack-classify)
//   source      declared | runner | ci | manifest | docs — the kind of evidence, in preference order
//   sourceFile  the repo-relative file the item came from
//   cwd         repo-relative directory the command runs in; null = the repo root
//   area        the longest detected language area dir (`svc/`) containing cwd; '' = the root
//   runner      make | task | just | npm | script when the command goes through one, else null
//   confidence  high (a recognised tool) | low (only a target/script NAME said what it does)
//   weak        reasons the gate looks stricter than it is (`--no-fatal-infos`, `continue-on-error`)
//   tool        the tool that decided the key (`gosec`, `go`), for the drafter's collapse rules
//   bodyInvocations  the normalised command texts the item REALLY runs: a runner target's recipe
//               (also for a CI step that calls it), a wrapper script's lines, else [command].
//               stack-draft judges test breadth over these (TRD 42-13).
//   cwdStatus   ok | external | missing | nested_repo | ignored | untracked (TRD 42-14): whether
//               cwd is a real, tracked, non-ignored dir of THIS repo (stack-detect.cwdHygiene;
//               `external` = a CI step inside another repo's checkout). stack-draft places only ok
//               items; the rest become `cwd_<status>` notes (`missing` goes through verify).
//   bodyStacks  stack-classify.toolStack of each body invocation that classifies to `key` (a nested
//               runner call / readable script is followed to what it runs); with none, of every
//               body invocation (the tools alone). [] = unknown. (TRD 42-15)
//   bodyScopes  [{ stack, area }]: each of those stacks with the area it runs in (mixed bodies)
//   effectiveArea  the area the body really runs in: from a `cd x &&`, a Taskfile `dir:`, `make -C`
//               / `npm --prefix`, a CI working-directory or a script's cwd; else `area`. stack-draft
//               never places an item whose effectiveArea is an unsupported sub-area at the root.
//               A non-root cwd that is in NO language area is its own pseudo-area (`infra/tiles/`), so
//               the drafter files it as a `sub_area` note. A script run from the root with no `cd`
//               takes the language area of its own directory (`bash portal/build.sh` -> `portal/`);
//               one in a root-level helper dir that is no language area keeps '' (TRD 43-05, D2).
//   scenarioNamed  true (only then present) when the item's key (e2e or e2e_env) was carried by the NAME
//               of its target or script (`make e2e-stack-up`, `docs-e2e.sh`), not only by its body.
//               stack-draft ranks a scenario-named e2e_env above a body-only one (TRD 43-04, D4).
//   singlePurpose  true (only then present) when the item runs a script named `check-*`, `verify-*` or
//               `*_test.sh`: one check, not the repo's suite. stack-draft reads it (TRD 43-04, D4).
//   target      runner and manifest items only: { name, deps, isDefault, dependedOn, order } —
//               dependedOn is true when another target in the same file lists it in its deps;
//               order is its position in that file. stack-draft's canonical ranking reads it.
//
// It composes the 42-03..05 readers instead of scraping lines: `.planning/<from>/STACK.md`
// Commands rows (declared), stack-runners targets whose BODY is normalised and classified
// (runner, and package.json scripts as manifest), stack-ci workflow steps (ci; a `make x` or
// `./scripts/x.sh` step is classified by the body it runs), and TESTING.md fenced blocks (docs).
// Shell text always goes through stack-shell.normalizeScript first, so a `\` continuation is one
// command and a comment, `echo`, `test -f x || {` or `${{ }}` fragment is never an item.
//
// This module MAY name file formats; stack-profile.cjs (the loader) stays free of them (P11).

const fs = require('fs');
const path = require('path');
const { normalizeScript } = require('./stack-shell.cjs');
const { classifyInvocation, classifyHint, toolStack } = require('./stack-classify.cjs');
const { parseWorkflows } = require('./stack-ci.cjs');
const { readRunners } = require('./stack-runners.cjs');
const { detectAreas, cwdHygiene } = require('./stack-detect.cjs');
const { describeInvocation } = require('./stack-verify.cjs');

const STANDARD_KEYS = ['build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps'];

/** Evidence kinds, most trusted first. The drafter ranks candidates by this before anything else. */
const SOURCE_RANK = Object.freeze({ declared: 0, runner: 1, ci: 2, manifest: 3, docs: 4, detected: 5 });

// Profile command keys (schema `^[a-z][a-z0-9_]*$`).
const KEY_RE = /^[a-z][a-z0-9_]*$/;
const MAX_SCRIPT_BYTES = 64 * 1024;
const RUNNER_MAX_DEPTH = 2;

// ─── legacy token classifier (35-04) ──────────────────────────────────────────
//
// Kept for callers of the old export; collectEvidence no longer uses it. Its English-token
// matching is what classified `# run the tests` as test and `gosec -fmt` as format.

const TOKEN_MAP = [
  ['test', /\btests?\b/],
  ['lint', /\blint\b/],
  ['format', /\b(fmt|format)\b/],
  ['build', /\bbuild\b/],
  ['typecheck', /\btype-?check\b/],
  ['audit', /\baudit\b/],
  ['codegen', /\b(generate|codegen)\b/],
  ['fix', /\bfix\b/],
];

/** classifyCommand(cmd, hint) -> a STANDARD_KEYS member or null. LEGACY: use stack-classify. */
function classifyCommand(cmd, hint) {
  if (hint) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(hint)) return key;
    }
  }
  if (cmd) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(cmd)) return key;
    }
  }
  return null;
}

// ─── path helpers ─────────────────────────────────────────────────────────────

function rel(projectRoot, full) {
  return path.relative(projectRoot, full).split(path.sep).join('/');
}

/** A clean repo-relative posix dir, or null for the root ('', '.', './'). */
function normDir(dir) {
  if (dir === null || dir === undefined) return null;
  const raw = String(dir).replace(/\\/g, '/');
  if (raw === '') return null;
  const norm = path.posix.normalize(raw).replace(/\/+$/, '');
  return norm === '.' || norm === '' ? null : norm;
}

/** `dir` joined onto `base` (both repo-relative); null = the root. */
function joinDir(base, dir) {
  const b = normDir(base);
  const d = dir === null || dir === undefined ? null : String(dir);
  if (!d) return b;
  if (path.posix.isAbsolute(d)) return normDir(d);
  return normDir(b ? path.posix.join(b, d) : d);
}

/** The longest language-area dir (`svc/`) that contains `cwd`; '' when none does. */
function areaFor(cwd, areaDirs) {
  const c = cwd ? `${cwd}/` : '';
  let best = '';
  for (const d of areaDirs) {
    if (d && c.startsWith(d) && d.length > best.length) best = d;
  }
  return best;
}

function shq(s) {
  const str = String(s);
  return /^[\w@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, `'\\''`)}'`;
}

function safeNormalize(text, cwd) {
  try {
    return normalizeScript(String(text), { cwd: cwd || null });
  } catch (_) {
    return [];
  }
}

function safeDescribe(inv) {
  try {
    return describeInvocation(inv);
  } catch (_) {
    return { kind: 'binary', tool: inv.tool };
  }
}

function readSmall(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_SCRIPT_BYTES) return null;
    return fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return null;
  }
}

// ─── classification of bodies and runner calls ────────────────────────────────

/**
 * The first classified invocation of a body (runner recipe lines, a script file). `empty` is true
 * when the body normalises to nothing at all (only comments, echo, control words): such a body
 * runs no gate, so the target is not evidence even if its NAME sounds like one.
 */
function classifyBody(text, cwd) {
  const invs = safeNormalize(text, cwd);
  for (const inv of invs) {
    const r = classifyInvocation(inv);
    if (r) return { result: r, inv, empty: false };
  }
  return { result: null, inv: null, empty: invs.length === 0 };
}

// Scenario-class keys: a NAME that says one of these keeps it (TRD 43-04, D4). The body of an `e2e`
// wrapper or an `e2e_env` bring-up starts with whatever it must (`go build`, `docker compose up`),
// so its first classified line says nothing about what the item is.
const SCENARIO_KEYS = new Set(['e2e', 'e2e_env']);

/**
 * keyFromName(name, hit) -> hit with the name's scenario key, or hit unchanged.
 *
 * `hit` is a classifyBody result (`{ result, inv }`). When `name` classifies to a scenario-class key
 * that differs from the body's, the name wins: the item keeps the body's tool and weak markers (for
 * scope and the drafter's collapse rules) but is low confidence (the key came from a name) and is not
 * `resolvesTo` the body line it is no longer judged by. A name with no such key, or a body that
 * already agrees, changes nothing.
 */
function keyFromName(name, hit) {
  const named = name ? classifyHint(name) : null;
  if (!named || !SCENARIO_KEYS.has(named.key) || named.key === hit.result.key) {
    return { ...hit.result, resolvesTo: hit.inv.text };
  }
  return { key: named.key, form: named.form, tool: hit.result.tool, weak: hit.result.weak, confidence: named.confidence };
}

/** How a runner target is invoked from ITS OWN directory (`make test`, `pnpm run lint`, `./bin/test.sh`). */
function localInvocation(t) {
  const q = shq(t.name);
  switch (t.runner) {
    case 'make': return `make ${q}`;
    case 'task': return `task ${q}`;
    case 'just': return `just ${q}`;
    case 'npm': {
      const m = t.manager || 'npm';
      return t.name === 'test' && m !== 'bun' ? `${m} test` : `${m} run ${q}`;
    }
    case 'script': return `./${t.name}`;
    default: return t.invocation;
  }
}

function hintFor(t) {
  if (t.runner !== 'script') return t.name;
  return path.posix.basename(String(t.name)).replace(/\.[^.]+$/, '');
}

/**
 * classifyTarget(target) -> classification | null. The BODY decides the key and form; the target
 * name is a low-confidence tiebreaker only when the body is empty (prerequisites only) or runs
 * nothing the classifier recognises. A body that normalises to nothing (`@echo done`) is not a gate.
 * One exception (TRD 43-04): a name that carries a scenario-class key (`e2e`, `e2e_env`) keeps it
 * over the body's first classified line (see keyFromName).
 */
function classifyTarget(t) {
  const cwd = normDir(t.cwd) || normDir(t.dir);
  const body = Array.isArray(t.body) ? t.body : [];
  const b = classifyBody(body.join('\n'), cwd);
  if (b.result) return keyFromName(hintFor(t), b);
  if (body.length && b.empty) return null;
  return classifyInvocation(localInvocation(t), { hint: hintFor(t) });
}

/** The normalised invocation texts of a runner target's body (what the target actually runs). */
function targetInvocations(t) {
  const cwd = normDir(t.cwd) || normDir(t.dir);
  const body = Array.isArray(t.body) ? t.body : [];
  return safeNormalize(body.join('\n'), cwd).map((i) => i.text);
}

/** file -> Set of every target name some target in that file lists in its deps. */
function dependedOnIndex(targets) {
  const byFile = new Map();
  for (const t of targets) {
    if (!byFile.has(t.file)) byFile.set(t.file, new Set());
    for (const d of Array.isArray(t.deps) ? t.deps : []) byFile.get(t.file).add(d);
  }
  return byFile;
}

/** The ranking metadata of a runner target (TRD 42-13): stack-draft's canonical ordering reads it. */
function targetMeta(t, depended) {
  const names = [t.name, ...(Array.isArray(t.aliases) ? t.aliases : [])];
  const set = depended.get(t.file);
  return {
    name: t.name,
    deps: Array.isArray(t.deps) ? [...t.deps] : [],
    isDefault: t.isDefault === true,
    dependedOn: !!set && names.some((n) => set.has(n)),
    order: Number.isInteger(t.order) ? t.order : 0,
  };
}

function buildRunnerIndex(targets) {
  const index = new Map();
  for (const t of targets) {
    if (t.runner === 'script') continue;
    const dir = normDir(t.dir) || '';
    for (const name of [t.name, ...(Array.isArray(t.aliases) ? t.aliases : [])]) {
      const k = `${t.runner}|${dir}|${name}`;
      if (!index.has(k)) index.set(k, t);
    }
  }
  return index;
}

/**
 * A CI (or docs) invocation -> { cls, runner, bodyInvocations? }. A `make x` / `npm run x` /
 * `task x` step is classified by the target body it runs; a wrapper script by its file's text;
 * anything else by its own tool. With no body to read, the target or script NAME is the
 * (low-confidence) hint. `bodyInvocations` is what the step really runs when that is a body this
 * reader could see (a target's recipe, a script's lines); otherwise the caller uses the command.
 */
function classifyStep(inv, index, projectRoot) {
  const d = safeDescribe(inv);
  if (d.kind === 'runner') {
    const name = Array.isArray(d.names) && d.names.length === 1 ? d.names[0] : null;
    const target = name && !d.unresolvable ? index.get(`${d.runner}|${normDir(d.dir) || ''}|${name}`) : null;
    if (target) return { cls: classifyTarget(target), runner: d.runner, bodyInvocations: targetInvocations(target) };
    const direct = classifyInvocation(inv, { hint: name || undefined });
    return { cls: direct, runner: d.runner };
  }
  if (d.kind === 'script' && d.file) {
    const fileRel = joinDir(d.cwd, d.file);
    const text = fileRel ? readSmall(path.join(projectRoot, fileRel)) : null;
    const hint = path.posix.basename(String(d.file)).replace(/\.[^.]+$/, '');
    if (text !== null) {
      const b = classifyBody(text, normDir(inv.cwd));
      const bodyInvocations = safeNormalize(text, normDir(inv.cwd)).map((i) => i.text);
      if (b.result) return { cls: keyFromName(hint, b), runner: 'script', bodyInvocations };
      if (b.empty) return { cls: null, runner: 'script' };
    }
    return { cls: classifyInvocation(inv, { hint }), runner: 'script' };
  }
  return { cls: classifyInvocation(inv), runner: null };
}

// ─── body units: what an item really runs, and where (TRD 42-15, D3) ──────────
//
// A unit is one leaf invocation of an item's body with the directory it runs in. A runner call
// that names a known target (`task build:daemon`, `make -C ui lint`, `npm --prefix ui test`) is
// replaced by that target's body, run in the target's own dir / `dir:`; a prerequisites-only
// target runs its deps; a readable wrapper script runs its lines. Bounded and cycle-safe.

const MAX_EXPAND_DEPTH = 6;

/** The dir of a repo-relative script file; null for a root-level script or one outside the repo. */
function scriptDirOfFile(fileRel) {
  if (!fileRel || path.posix.isAbsolute(fileRel) || fileRel === '..' || fileRel.startsWith('../')) return null;
  const dir = path.posix.dirname(fileRel);
  return dir === '.' ? null : dir;
}

/** The dir the script file of a leaf invocation (`bash x/y.sh`, `./x/y.sh`) lives in, or null. */
function scriptDirOf(inv) {
  const d = safeDescribe(inv);
  if (d.kind !== 'script' || !d.file) return null;
  return scriptDirOfFile(joinDir(d.cwd, d.file));
}

/** The dir a leaf invocation runs in: a runner's `-C` / `--prefix` / `-d` dir, else its own cwd. */
function unitCwd(inv) {
  const d = safeDescribe(inv);
  if (d.kind === 'runner') return normDir(d.dir);
  return normDir(inv.cwd);
}

function targetUnits(t, ctx, depth, seen) {
  seen.add(t);
  const cwd = normDir(t.cwd) || normDir(t.dir);
  const body = Array.isArray(t.body) ? t.body : [];
  const invs = safeNormalize(body.join('\n'), cwd);
  const units = expandUnits(invs, ctx, depth, seen);
  if (!invs.length && depth < MAX_EXPAND_DEPTH) {
    // A prerequisites-only target (`build:agent: deps: [build:agent:internal]`) runs its deps.
    for (const dep of Array.isArray(t.deps) ? t.deps : []) {
      const dt = ctx.index.get(`${t.runner}|${normDir(t.dir) || ''}|${dep}`);
      if (dt && !seen.has(dt)) units.push(...targetUnits(dt, ctx, depth + 1, seen));
    }
  }
  return units;
}

/** A runner call or wrapper script -> the units it runs; null when it is a leaf (or unreadable). */
function expandCall(inv, ctx, depth, seen) {
  if (depth >= MAX_EXPAND_DEPTH) return null;
  const d = safeDescribe(inv);
  if (d.kind === 'runner') {
    const name = Array.isArray(d.names) && d.names.length === 1 ? d.names[0] : null;
    if (!name || d.unresolvable) return null;
    const t = ctx.index.get(`${d.runner}|${normDir(d.dir) || ''}|${name}`);
    if (!t) return null;
    return seen.has(t) ? [] : targetUnits(t, ctx, depth + 1, seen);
  }
  if (d.kind === 'script' && d.file) {
    const fileRel = joinDir(d.cwd, d.file);
    if (!fileRel) return null;
    const mark = `script:${fileRel}`;
    if (seen.has(mark)) return [];
    const text = readSmall(path.join(ctx.root, fileRel));
    if (text === null) return null;
    seen.add(mark);
    // Each line the script runs remembers the script's own dir (the innermost script wins), so a body
    // that lives in `portal/` is judged as running in `portal/` (TRD 43-05, D2).
    const dir = scriptDirOfFile(fileRel);
    return expandUnits(safeNormalize(text, normDir(inv.cwd)), ctx, depth + 1, seen)
      .map((u) => (u.scriptDir === undefined ? { ...u, scriptDir: dir } : u));
  }
  return null;
}

/** expandUnits(invs, ctx, depth, seen) -> [{ inv, cwd }] leaf invocations (see the section header). */
function expandUnits(invs, ctx, depth = 0, seen = new Set()) {
  const out = [];
  for (const inv of invs) {
    const nested = expandCall(inv, ctx, depth, seen);
    if (nested) out.push(...nested);
    else out.push({ inv, cwd: unitCwd(inv) });
  }
  return out;
}

/**
 * unitArea(unit, areaDirs) -> the area a leaf unit RUNS in (TRD 43-05, D2).
 *   - the longest language area containing its cwd, when there is one;
 *   - else, for a non-root cwd inside the repo, the cwd itself as a PSEUDO-area (`infra/tiles/`): it is
 *     in no language area, so it is never a root command, and stack-draft files it as a `sub_area` note;
 *   - else (cwd is the root), when the unit runs a script file with no `cd` before it, the language
 *     area of the script's own directory (`bash portal/build.sh` runs in the component `portal/`). A
 *     script at the root or in a helper dir that is no language area keeps '' (a root command).
 */
function unitArea(u, areaDirs) {
  const own = areaFor(u.cwd, areaDirs);
  if (own) return own;
  if (u.cwd) return path.posix.isAbsolute(u.cwd) || u.cwd === '..' || u.cwd.startsWith('../') ? '' : `${u.cwd}/`;
  const dir = u.scriptDir !== undefined ? u.scriptDir : (u.inv ? scriptDirOf(u.inv) : null);
  return dir ? areaFor(dir, areaDirs) : '';
}

/**
 * scopeOf(units, key, itemArea, areaDirs, itemCwd) -> { bodyStacks, bodyScopes, effectiveArea }
 *
 * Judged over the units that classify to `key`; with none (a name-only classification, a body
 * of unknown tools) over every unit — the tools alone (TRD 42-15 recovery). `bodyStacks` are the
 * non-null toolStacks; `bodyScopes` pair each with the area it runs in. `effectiveArea` is the one
 * area those units run in; when they disagree, the item's own area if any unit runs there, else
 * the first unit's area; with no unit at all, the item's own area.
 */
function scopeOf(units, key, itemAreaOwn, areaDirs, itemCwd = null) {
  // The item's own area: the language area of its cwd, else (a non-root cwd in no area) the pseudo-area.
  const itemArea = itemAreaOwn || unitArea({ cwd: itemCwd }, areaDirs);
  const keyed = units.filter((u) => {
    const c = classifyInvocation(u.inv);
    return !!c && c.key === key;
  });
  const basis = keyed.length ? keyed : units;
  const bodyStacks = [];
  const bodyScopes = [];
  const areas = [];
  for (const u of basis) {
    const area = unitArea(u, areaDirs);
    if (!areas.includes(area)) areas.push(area);
    const stack = toolStack(u.inv);
    if (!stack) continue;
    if (!bodyStacks.includes(stack)) bodyStacks.push(stack);
    if (!bodyScopes.some((s) => s.stack === stack && s.area === area)) bodyScopes.push({ stack, area });
  }
  let effectiveArea = itemArea;
  if (areas.length === 1) effectiveArea = areas[0];
  else if (areas.length > 1 && !areas.includes(itemArea)) effectiveArea = areas[0];
  return { bodyStacks, bodyScopes, effectiveArea };
}

/** The target or script name an invocation goes through (`make x` -> x, `./s/docs-e2e.sh` -> docs-e2e), or null. */
function invocationName(command, cwd) {
  const first = safeNormalize(command, cwd)[0];
  if (!first) return null;
  const d = safeDescribe(first);
  if (d.kind === 'runner') return Array.isArray(d.names) && d.names.length === 1 ? d.names[0] : null;
  if (d.kind === 'script' && d.file) return path.posix.basename(String(d.file)).replace(/\.[^.]+$/, '');
  return null;
}

// ─── single-purpose scripts (TRD 43-04, D4) ───────────────────────────────────

// `check-migrations.sh`, `verify_schema.sh`, `api_test.sh`: one check, not the repo's suite. A script
// named exactly `test.sh`, `check.sh` or `run-tests.sh` is the conventional entry point and is not.
const SINGLE_PURPOSE_RE = /^(?:(?:check|verify)[-_]|.*_test\.sh$)/i;

/** True when `command` directly invokes a script file whose basename is single-purpose. */
function isSinglePurposeScript(command, cwd) {
  const first = safeNormalize(command, cwd)[0];
  if (!first) return false;
  const d = safeDescribe(first);
  return d.kind === 'script' && !!d.file && SINGLE_PURPOSE_RE.test(path.posix.basename(String(d.file)));
}

// ─── readers ──────────────────────────────────────────────────────────────────

// 1. Explicit table: .planning/<from>/STACK.md `## Commands` rows (declared).
function readCommandsTable(projectRoot, from, push, ctx) {
  const full = path.join(projectRoot, '.planning', from, 'STACK.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const sourceFile = rel(projectRoot, full);
  let inSection = false;
  for (const line of text.split('\n')) {
    if (/^##\s+Commands\b/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const m = /^\|\s*([A-Za-z][A-Za-z0-9_-]*)\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'key' || !KEY_RE.test(key)) continue;
    const command = m[2].trim();
    const invs = safeNormalize(command, null);
    if (!invs.length) continue; // an echo / comment / fragment row declares nothing runnable
    const cls = classifyInvocation(command);
    const agrees = cls && cls.key === key;
    push({
      key,
      command,
      form: agrees ? cls.form : 'check',
      source: 'declared',
      sourceFile,
      cwd: null,
      runner: null,
      confidence: 'high',
      weak: agrees ? cls.weak : [],
      tool: agrees ? cls.tool : invs[0].tool,
      units: expandUnits(invs, ctx),
    });
  }
}

// 2. Task runners: Makefile / Taskfile / justfile / scripts (runner) and package.json (manifest).
function readRunnerTargets(targets, push, ctx) {
  const depended = dependedOnIndex(targets);
  for (const t of targets) {
    // TRD 43-01 D5: an `internal: true` Taskfile task cannot be run from the CLI, so it is never a
    // candidate. It stays in ctx.index / `depended` (built from every target) so a public task that
    // depends on or calls it still expands its body.
    if (t.internal === true) continue;
    const cls = classifyTarget(t);
    if (!cls) continue;
    push({
      key: cls.key,
      command: localInvocation(t),
      form: cls.form,
      source: t.runner === 'npm' ? 'manifest' : 'runner',
      sourceFile: t.file,
      cwd: normDir(t.dir),
      runner: t.runner,
      confidence: cls.confidence,
      weak: cls.weak,
      tool: cls.tool,
      resolvesTo: cls.resolvesTo,
      target: targetMeta(t, depended),
      bodyInvocations: targetInvocations(t),
      units: targetUnits(t, ctx, 0, new Set()),
    });
  }
}

// 3. CI: every logical invocation of every workflow step (stack-ci).
function readCi(projectRoot, index, push, ctx) {
  for (const step of parseWorkflows(projectRoot)) {
    for (const inv of step.invocations || []) {
      const { cls, runner, bodyInvocations } = classifyStep(inv, index, projectRoot);
      if (!cls) continue;
      const weak = [...(cls.weak || [])];
      if (step.continueOnError && !weak.includes('continue-on-error')) weak.push('continue-on-error');
      push({
        key: cls.key,
        command: inv.text,
        form: cls.form,
        source: 'ci',
        sourceFile: step.file,
        cwd: normDir(inv.cwd),
        runner,
        confidence: cls.confidence,
        weak,
        tool: cls.tool,
        resolvesTo: cls.resolvesTo,
        bodyInvocations,
        external: inv.external === true || step.external === true,
        units: expandUnits([inv], ctx),
      });
    }
  }
}

// 4. .planning/codebase/TESTING.md fenced bash/sh blocks (docs; from=codebase only).
function readTestingMd(projectRoot, index, push, ctx) {
  const full = path.join(projectRoot, '.planning', 'codebase', 'TESTING.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const sourceFile = rel(projectRoot, full);
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const fence = /^\s*```(\w*)/.exec(raw);
    if (fence) {
      if (cur === null) {
        const lang = fence[1];
        cur = lang === '' || lang === 'bash' || lang === 'sh' || lang === 'shell' ? [] : false;
      } else {
        if (cur) blocks.push(cur.join('\n'));
        cur = null;
      }
      continue;
    }
    if (cur) cur.push(raw);
  }
  for (const block of blocks) {
    for (const inv of safeNormalize(block, null)) {
      const { cls, runner, bodyInvocations } = classifyStep(inv, index, projectRoot);
      if (!cls) continue;
      push({
        key: cls.key,
        command: inv.text,
        form: cls.form,
        source: 'docs',
        sourceFile,
        cwd: normDir(inv.cwd),
        runner,
        confidence: cls.confidence,
        weak: cls.weak,
        tool: cls.tool,
        bodyInvocations,
        units: expandUnits([inv], ctx),
      });
    }
  }
}

/**
 * collectEvidence(projectRoot, { from = 'codebase', areas }) -> items (see the header)
 *
 * Items come back grouped by source in preference order — declared, runner, ci, manifest, docs —
 * and in file order within a source. Every item is kept (a draft shows its work); choosing one per
 * key, verifying it and deciding what reaches the profile is stack-draft.assembleDraft's job.
 * `areas` (detectAreas output) is read when not supplied. Never throws on an unreadable file.
 */
function collectEvidence(projectRoot, { from = 'codebase', areas = null, hygiene = null } = {}) {
  const detected = Array.isArray(areas) ? areas : safeAreas(projectRoot);
  const areaDirs = detected.filter((a) => a && Array.isArray(a.kinds) && a.kinds.length).map((a) => a.dir).filter(Boolean);

  const buckets = { declared: [], runner: [], ci: [], manifest: [], docs: [] };
  const externalItems = new Set();
  const ctx = { root: projectRoot, index: new Map() };
  const push = (raw) => {
    if (!raw || !raw.key || !raw.command) return;
    const cwd = raw.cwd === undefined ? null : raw.cwd;
    const out = {
      key: raw.key,
      command: raw.command,
      form: raw.form || 'check',
      source: raw.source,
      sourceFile: raw.sourceFile,
      cwd,
      area: areaFor(cwd, areaDirs),
      runner: raw.runner || null,
      confidence: raw.confidence || 'high',
      weak: Array.isArray(raw.weak) ? [...raw.weak] : [],
      tool: raw.tool || null,
    };
    if (raw.resolvesTo) out.resolvesTo = raw.resolvesTo;
    if (raw.target) out.target = raw.target;
    if (isSinglePurposeScript(raw.command, cwd)) out.singlePurpose = true;
    if (SCENARIO_KEYS.has(out.key)) {
      const name = invocationName(raw.command, cwd);
      const named = name ? classifyHint(name) : null;
      if (named && named.key === out.key) out.scenarioNamed = true;
    }
    out.bodyInvocations = Array.isArray(raw.bodyInvocations) && raw.bodyInvocations.length
      ? [...raw.bodyInvocations]
      : [raw.command];
    // TRD 42-15: the stacks the body runs and the area it runs in (stack-draft's D3 gate).
    const units = Array.isArray(raw.units) ? raw.units : expandUnits(safeNormalize(raw.command, cwd), ctx);
    Object.assign(out, scopeOf(units, out.key, out.area, areaDirs, cwd));
    if (raw.external === true) externalItems.add(out);
    (buckets[raw.source] || buckets.docs).push(out);
  };

  let targets = [];
  try {
    targets = readRunners(projectRoot, { maxDepth: RUNNER_MAX_DEPTH });
  } catch (_) {
    targets = [];
  }
  const index = buildRunnerIndex(targets);
  ctx.index = index;

  readCommandsTable(projectRoot, from, push, ctx);
  readRunnerTargets(targets, push, ctx);
  readCi(projectRoot, index, push, ctx);
  if (from === 'codebase') readTestingMd(projectRoot, index, push, ctx);

  const all = [...buckets.declared, ...buckets.runner, ...buckets.ci, ...buckets.manifest, ...buckets.docs];

  // cwdStatus (TRD 42-14): `external` for a CI step inside another repo's checkout, else the
  // stack-detect.cwdHygiene verdict, primed ONCE with every distinct cwd (one git batch each).
  const h = typeof hygiene === 'function' ? hygiene : safeHygiene(projectRoot);
  const cwds = [];
  for (const item of all) {
    if (item.cwd && !externalItems.has(item) && !cwds.includes(item.cwd)) cwds.push(item.cwd);
  }
  if (h && typeof h.prime === 'function' && cwds.length) {
    try {
      h.prime(cwds);
    } catch (_) {
      // each cwd is then asked on its own
    }
  }
  for (const item of all) {
    if (externalItems.has(item)) item.cwdStatus = 'external';
    else if (!item.cwd || !h) item.cwdStatus = 'ok';
    else {
      let s = 'ok';
      try {
        s = h(item.cwd) || 'ok';
      } catch (_) {
        s = 'ok';
      }
      item.cwdStatus = s;
    }
    // A cwd that does not exist is no pseudo-area: it stays a candidate that stack-draft reports as
    // cwd_missing (TRD 42-14), not a sub_area note.
    if (item.cwdStatus === 'missing' && item.cwd && item.effectiveArea === `${item.cwd}/`) item.effectiveArea = item.area;
  }
  return all;
}

function safeHygiene(projectRoot) {
  try {
    return cwdHygiene(projectRoot);
  } catch (_) {
    return null;
  }
}

function safeAreas(projectRoot) {
  try {
    return detectAreas(projectRoot);
  } catch (_) {
    return [];
  }
}

module.exports = {
  STANDARD_KEYS,
  SOURCE_RANK,
  classifyCommand,
  collectEvidence,
  localInvocation,
};
