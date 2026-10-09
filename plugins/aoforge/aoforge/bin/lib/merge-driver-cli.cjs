'use strict';

/**
 * merge-driver-cli.cjs: `aof-tools merge-driver` (TRD 59-01, PLMB-02).
 *
 * Parallel wave merges conflict on `.aoforge/state.json` and `.aoforge/STATE_ARCHIVE.md`. This command
 * registers a merge for each so a wave merge completes without a conflict:
 *
 *   state-json <base> <ours> <theirs>   the git merge driver entry point: a JSON-aware 3-way merge
 *                                       (lib/state-merge.cjs) written into <ours>. Diagnostics go to
 *                                       stderr; stdout stays empty because git runs this inside `git merge`.
 *   install [--check]                   register the driver, idempotently, in places that are never
 *                                       committed: `info/attributes` (the repository's COMMON git dir, so
 *                                       every linked worktree shares it) and repo-local config.
 *                                       STATE_ARCHIVE.md uses git's built-in `merge=union` (append-only),
 *                                       so it needs no driver. `--check` writes nothing.
 *   uninstall                           the undo for install: removes exactly the managed attributes block
 *                                       and the `merge.aoforge-state-json` config section.
 *   resolve <path>                      the fallback for a merge that already stopped (driver not installed
 *                                       at merge time): merge the index stages of state.json (JSON-aware) or
 *                                       STATE_ARCHIVE.md (union) and stage the result.
 *
 * The recorded driver is a fail-safe `sh` wrapper (driverCommand): when the aof-tools binary, or node, is
 * missing, or when a side is unparsable, it runs `git merge-file`, so git reports an ordinary text
 * conflict with markers and MERGE_HEAD instead of aborting the merge. It points at a binary that outlives
 * wave worktrees (driverBinPath).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { output, error } = require('./helpers.cjs');
const { escapeRegExp } = require('./text-escape.cjs');
const { mergeStateJson } = require('./state-merge.cjs');
const { PLANNING_DIR_NAMES, isPlanningDirName, planningDirLabel } = require('./compat.cjs');

const BEGIN_MARKER = '# >>> aoforge merge drivers (aof-tools merge-driver install)';
const END_MARKER = '# <<< aoforge merge drivers';
// One pair of lines per planning-directory name, so a project still on the legacy directory merges the same way.
const BLOCK_LINES = [
  BEGIN_MARKER,
  ...PLANNING_DIR_NAMES.flatMap((dir) => [
    `**/${dir}/state.json merge=aoforge-state-json`,
    `**/${dir}/STATE_ARCHIVE.md merge=union`,
  ]),
  END_MARKER,
];

const DRIVER_NAME = 'aoforge-state-json';
const CONFIG_SECTION = `merge.${DRIVER_NAME}`;
const CONFIG_LABEL = 'AOForge state.json 3-way merge';

const USAGE = 'Usage: aof-tools merge-driver <install [--check]|uninstall|resolve <path>|state-json <base> <ours> <theirs>>';

// ── the driver string and the binary it records ──────────────────────────────

/**
 * The fail-safe wrapper git runs (through `sh -c`, from the repository top level, with %O %A %B replaced
 * by temp file paths). A missing binary, a missing node, or an exit 1 from an unparsable side falls
 * through to `git merge-file`, which writes conflict markers into %A and exits non-zero.
 */
function driverCommand(bin) {
  if (bin.includes("'")) {
    throw new Error(`Cannot record a merge driver for a path containing a single quote: ${bin}`);
  }
  return `{ [ -f '${bin}' ] && node '${bin}' merge-driver state-json %O %A %B; } || git merge-file -L ours -L base -L theirs %A %O %B`;
}

/**
 * The aof-tools.cjs the driver should record. Unchanged when the running copy lives outside the current
 * checkout (the ~/.claude/aoforge mirror) or in the main checkout itself; mapped to the same relative
 * path under the MAIN checkout when it lives inside a linked worktree (that tree is removed after its
 * wave merge). Throws, naming both paths, when the main checkout has no copy there.
 */
function driverBinPath({ runningBin, checkoutTop, mainRoot, exists }) {
  const rel = path.relative(checkoutTop, runningBin);
  const insideCheckout = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  if (!insideCheckout || checkoutTop === mainRoot) return runningBin;

  const mapped = path.join(mainRoot, rel);
  if (!exists(mapped)) {
    throw new Error(
      `Cannot record a merge driver for ${runningBin}: it lives in a linked worktree (${checkoutTop}) that will be removed, ` +
      `and the main checkout has no copy at ${mapped}. Run install from the main checkout or from the ~/.claude/aoforge mirror.`,
    );
  }
  return mapped;
}

// ── git plumbing ─────────────────────────────────────────────────────────────

const MAX_BUFFER = 64 * 1024 * 1024;

/** Raw result: stdout is NOT trimmed (file contents must survive byte for byte). */
function gitRaw(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8', maxBuffer: MAX_BUFFER });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: (r.stderr || '').trim(),
    error: r.error,
  };
}

function git(dir, args) {
  const r = gitRaw(dir, args);
  return { ...r, stdout: r.stdout.trim() };
}

function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/** Where this repository lives: the checkout we stand in, the main checkout, and the shared attributes file. */
function repoFacts(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0) {
    error(`Not inside a git repository work tree (cwd: ${cwd}).\n${top.stderr}`);
  }
  const checkoutTop = realpath(top.stdout);

  let common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.exitCode !== 0) {
    // git older than 2.31 has no --path-format: resolve the relative answer against cwd ourselves.
    common = git(cwd, ['rev-parse', '--git-common-dir']);
    if (common.exitCode === 0) common = { ...common, stdout: path.resolve(cwd, common.stdout) };
  }
  let mainRoot = checkoutTop;
  if (common.exitCode === 0) {
    const commonDir = realpath(common.stdout);
    if (path.basename(commonDir) === '.git') mainRoot = path.dirname(commonDir);
  }

  const attr = git(cwd, ['rev-parse', '--git-path', 'info/attributes']);
  if (attr.exitCode !== 0) error(`Could not locate info/attributes: ${attr.stderr}`);
  // Relative in a main checkout (`.git/info/attributes`), absolute in a linked worktree: resolve against cwd.
  return { checkoutTop, mainRoot, attributesPath: path.resolve(cwd, attr.stdout) };
}

function configGet(cwd, key) {
  const r = git(cwd, ['config', '--local', '--get', key]);
  return r.exitCode === 0 ? r.stdout : null;
}

function configSet(cwd, key, value) {
  const r = git(cwd, ['config', '--local', key, value]);
  if (r.exitCode !== 0) error(`git config ${key} failed: ${r.stderr}`);
}

// ── the managed attributes block ─────────────────────────────────────────────

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}

/** Index range [begin, end] of the managed block in `lines`, or null. A begin without an end is refused. */
function locateBlock(lines, file) {
  const begin = lines.findIndex((l) => l.trim() === BEGIN_MARKER);
  if (begin === -1) return null;
  const end = lines.findIndex((l, i) => i > begin && l.trim() === END_MARKER);
  if (end === -1) {
    error(`${file} has the aoforge begin marker but no end marker; fix it by hand, then rerun.\nExpected end marker: ${END_MARKER}`);
  }
  return { begin, end };
}

/** `text` with the managed block replaced in place, or appended when absent. */
function withBlock(text, file) {
  const lines = text.split('\n');
  const loc = locateBlock(lines, file);
  if (loc) {
    lines.splice(loc.begin, loc.end - loc.begin + 1, ...BLOCK_LINES);
    return lines.join('\n');
  }
  const head = text !== '' && !text.endsWith('\n') ? text + '\n' : text;
  return head + BLOCK_LINES.join('\n') + '\n';
}

/** `text` with exactly the managed block removed; every other line is kept. */
function withoutBlock(text, file) {
  const lines = text.split('\n');
  const loc = locateBlock(lines, file);
  if (!loc) return text;
  lines.splice(loc.begin, loc.end - loc.begin + 1);
  return lines.join('\n');
}

// ── install / uninstall ──────────────────────────────────────────────────────

function cmdInstall(cwd, rest, raw) {
  const check = rest.includes('--check');
  const facts = repoFacts(cwd);

  let bin;
  let driver;
  try {
    bin = driverBinPath({
      runningBin: realpath(path.join(__dirname, '..', 'aof-tools.cjs')),
      checkoutTop: facts.checkoutTop,
      mainRoot: facts.mainRoot,
      exists: fs.existsSync,
    });
    driver = driverCommand(bin);
  } catch (e) {
    error(e.message);
  }

  const attrText = readIfExists(facts.attributesPath);
  const attributesOk = withBlock(attrText, facts.attributesPath) === attrText;
  const driverOk = configGet(cwd, `${CONFIG_SECTION}.driver`) === driver
    && configGet(cwd, `${CONFIG_SECTION}.name`) === CONFIG_LABEL;

  if (check) {
    const installed = attributesOk && driverOk;
    output({
      installed,
      attributes_ok: attributesOk,
      driver_ok: driverOk,
      attributes_path: facts.attributesPath,
      driver,
    }, raw, String(installed));
    return;
  }

  if (!attributesOk) {
    fs.mkdirSync(path.dirname(facts.attributesPath), { recursive: true });
    fs.writeFileSync(facts.attributesPath, withBlock(attrText, facts.attributesPath), 'utf-8');
  }
  if (!driverOk) {
    configSet(cwd, `${CONFIG_SECTION}.name`, CONFIG_LABEL);
    configSet(cwd, `${CONFIG_SECTION}.driver`, driver);
  }
  const changed = !attributesOk || !driverOk;
  output({
    installed: true,
    changed,
    attributes_path: facts.attributesPath,
    driver,
    bin,
  }, raw, changed ? 'changed' : 'unchanged');
}

function cmdUninstall(cwd, raw) {
  const facts = repoFacts(cwd);

  const attrText = readIfExists(facts.attributesPath);
  const stripped = withoutBlock(attrText, facts.attributesPath);
  const attributesChanged = stripped !== attrText;
  if (attributesChanged) fs.writeFileSync(facts.attributesPath, stripped, 'utf-8');

  const present = git(cwd, ['config', '--local', '--get-regexp', `^${escapeRegExp(CONFIG_SECTION)}\\.`]);
  const configChanged = present.exitCode === 0;
  if (configChanged) {
    const removed = git(cwd, ['config', '--local', '--remove-section', CONFIG_SECTION]);
    if (removed.exitCode !== 0) error(`git config --remove-section ${CONFIG_SECTION} failed: ${removed.stderr}`);
  }

  const changed = attributesChanged || configChanged;
  output({ installed: false, changed, attributes_path: facts.attributesPath }, raw, changed ? 'changed' : 'unchanged');
}

// ── state-json (the driver entry point) ──────────────────────────────────────

function readFileOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function cmdStateJson(rest) {
  const [baseFile, oursFile, theirsFile] = rest;
  if (!baseFile || !oursFile || !theirsFile) {
    error(`merge-driver state-json needs <base> <ours> <theirs>.\n${USAGE}`);
  }
  const base = readFileOrNull(baseFile) ?? '';
  const ours = readFileOrNull(oursFile);
  const theirs = readFileOrNull(theirsFile);
  if (ours === null) error(`cannot read ours: ${oursFile}`);
  if (theirs === null) error(`cannot read theirs: ${theirsFile}`);

  const merged = mergeStateJson(base, ours, theirs);
  if (!merged.ok) error(merged.reason);

  for (const note of merged.notes) process.stderr.write(`merge-driver state-json: ${note}\n`);
  fs.writeFileSync(oursFile, merged.text, 'utf-8');
}

// ── resolve ──────────────────────────────────────────────────────────────────

/** 'json' for <planning dir>/state.json, 'union' for <planning dir>/STATE_ARCHIVE.md (either name), null otherwise. */
function strategyFor(rel) {
  const parts = rel.split('/');
  if (!isPlanningDirName(parts[parts.length - 2])) return null;
  const name = parts[parts.length - 1];
  if (name === 'state.json') return 'json';
  if (name === 'STATE_ARCHIVE.md') return 'union';
  return null;
}

/** `git merge-file -p --union` over three texts. Returns {text} or {failure}; cleans its temp files. */
function unionMerge(top, oursText, baseText, theirsText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-resolve-'));
  try {
    const oursFile = path.join(dir, 'ours');
    const baseFile = path.join(dir, 'base');
    const theirsFile = path.join(dir, 'theirs');
    fs.writeFileSync(oursFile, oursText);
    fs.writeFileSync(baseFile, baseText);
    fs.writeFileSync(theirsFile, theirsText);
    const r = spawnSync('git', ['merge-file', '-p', '--union', oursFile, baseFile, theirsFile], {
      cwd: top, encoding: 'utf-8', maxBuffer: MAX_BUFFER,
    });
    // With --union conflicts are resolved, so the exit status is 0; a negative status (255) or 127 is an error.
    if (r.error || r.status === null || r.status > 126) {
      return { failure: `git merge-file --union failed (${r.error ? r.error.message : `exit ${r.status}`}): ${(r.stderr || '').trim()}` };
    }
    return { text: r.stdout };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function cmdResolve(cwd, rest, raw) {
  const arg = rest[0];
  if (!arg) error(`merge-driver resolve needs a path.\n${USAGE}`);
  const facts = repoFacts(cwd);
  const top = facts.checkoutTop;

  const rel = path.relative(top, path.resolve(top, arg)).split(path.sep).join('/');
  const strategy = rel.startsWith('..') ? null : strategyFor(rel);
  if (!strategy) {
    error(`merge-driver resolve supports only state.json and STATE_ARCHIVE.md under ${planningDirLabel()}; got ${arg}`);
  }

  const stage = (n) => {
    const r = gitRaw(top, ['show', `:${n}:${rel}`]);
    return r.exitCode === 0 ? r.stdout : null;
  };
  const ours = stage(2);
  const theirs = stage(3);
  if (ours === null || theirs === null) {
    error(`no conflicted stages for ${rel}: there is no merge stopped on this file (ours and theirs stages are missing).`);
  }
  const base = stage(1) ?? ''; // missing when both branches added the file

  let text;
  let notes = [];
  if (strategy === 'json') {
    const merged = mergeStateJson(base, ours, theirs);
    if (!merged.ok) error(`cannot merge ${rel}: ${merged.reason}`);
    text = merged.text;
    notes = merged.notes;
  } else {
    const merged = unionMerge(top, ours, base, theirs);
    if (merged.failure) error(`cannot merge ${rel}: ${merged.failure}`);
    text = merged.text;
  }

  fs.writeFileSync(path.join(top, rel), text, 'utf-8');
  const added = git(top, ['add', '--', rel]);
  if (added.exitCode !== 0) error(`git add ${rel} failed: ${added.stderr}`);

  output({ resolved: true, path: rel, strategy, staged: true, notes }, raw, 'resolved');
}

// ── routing ──────────────────────────────────────────────────────────────────

function cmdMergeDriver(cwd, args, raw) {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'state-json':
      cmdStateJson(rest);
      return;
    case 'install':
      cmdInstall(cwd, rest, raw);
      return;
    case 'uninstall':
      cmdUninstall(cwd, raw);
      return;
    case 'resolve':
      cmdResolve(cwd, rest, raw);
      return;
    default:
      error(`Unknown merge-driver subcommand${sub ? ': ' + sub : ''}. Available: install, uninstall, resolve, state-json\n${USAGE}`);
  }
}

module.exports = { cmdMergeDriver, driverCommand, driverBinPath };
