'use strict';

/**
 * doctor-cli.cjs — TRD 45-04 (DOC-04)
 *
 * Front-end for `df-tools doctor [--fix] [--json] [--path <dir>] [--global]`. The engine
 * (lib/doctor.cjs) runs the checks; this module parses flags, resolves the project, picks the
 * checks dir and renders text.
 *
 * `output()`/`error()` (lib/helpers.cjs) call `process.exit`, so — like audit-cli.cjs — everything
 * here is pure: `runDoctorCli` returns `{ok, result, text, json}` or `{ok:false, message}`, and the
 * dispatcher's `case 'doctor'` only maps that onto output()/error(). A completed run always exits
 * 0 (the health verdict is `result.status`); only usage errors exit 1.
 *
 * `userHome` is injected (the dispatcher passes os.homedir(), which honors HOME), so a spawned
 * test with HOME=<fake home> never reaches the real ~/.claude.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const doctor = require('./doctor.cjs');
const helpers = require('./helpers.cjs');

const DF_TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// TEST-ONLY override of the checks directory. It exists so spawned end-to-end tests can point
// the real dispatcher at a temp dir of stub checks; it is not a user-facing setting.
const CHECKS_DIR_ENV = 'DEVFLOW_DOCTOR_CHECKS_DIR';

const BOOL_FLAGS = { '--fix': 'fix', '--json': 'json', '--global': 'global' };

/**
 * parseDoctorArgs(argv, cwd) -> {ok:true, fix, json, global, path} | {ok:false, message}
 *
 * `--path <dir>` is resolved against `cwd`. A `--path` with no value (or followed by another
 * flag), an unknown flag, a stray positional, and `--path` with `--global` are usage errors.
 */
function parseDoctorArgs(argv, cwd) {
  const out = { ok: true, fix: false, json: false, global: false, path: null };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const tok = list[i];
    if (Object.prototype.hasOwnProperty.call(BOOL_FLAGS, tok)) {
      out[BOOL_FLAGS[tok]] = true;
    } else if (tok === '--path') {
      const val = list[i + 1];
      if (val === undefined || val === '' || String(val).startsWith('--')) {
        return { ok: false, message: '--path requires a value (df-tools doctor --path <dir>)' };
      }
      out.path = path.resolve(cwd || process.cwd(), val);
      i += 1;
    } else if (typeof tok === 'string' && tok.startsWith('-')) {
      return { ok: false, message: `unknown flag: ${tok} (usage: df-tools doctor [--fix] [--json] [--path <dir>] [--global])` };
    } else {
      return { ok: false, message: `unexpected argument: ${tok} (use --path <dir> to name a project)` };
    }
  }
  if (out.global && out.path) {
    return { ok: false, message: '--path and --global cannot be combined: --global runs only machine-level checks' };
  }
  return out;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * resolveProject(cwd, pathArg) -> { projectRoot: string|null, note?: string }
 *
 * With `pathArg`: that directory is the project iff it has a `.planning/` DIRECTORY (no walking).
 * Without: walk up from `cwd` to the nearest ancestor with a `.planning/` directory. The root is
 * returned as a realpath. When none is found, projectRoot is null and `note` says project checks
 * were skipped.
 */
function resolveProject(cwd, pathArg) {
  if (pathArg) {
    if (isDir(path.join(pathArg, '.planning'))) return { projectRoot: realpath(pathArg) };
    return {
      projectRoot: null,
      note: `no .planning/ at ${pathArg}; project checks skipped (global checks only)`,
    };
  }
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    if (isDir(path.join(dir, '.planning'))) return { projectRoot: realpath(dir) };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {
    projectRoot: null,
    note: `no DevFlow project found at or above ${path.resolve(cwd || process.cwd())}; project checks skipped (global checks only)`,
  };
}

const TAG_WIDTH = '[error]'.length;

function tag(label) {
  return `[${label}]`.padEnd(TAG_WIDTH);
}

function checkLine(r) {
  let line = `${tag(r.severity)} ${r.id} — ${r.finding}`;
  if (r.fixable) line += ' (fixable)';
  else if (r.fix_command && r.severity !== 'ok') line += ` (run: ${r.fix_command})`;
  return line;
}

function fixLine(f) {
  if (f.applied) {
    const parts = [];
    if (f.changed && f.changed.length) parts.push(`changed: ${f.changed.join(', ')}`);
    if (f.backup) parts.push(`backup: ${f.backup}`);
    if (f.notes) parts.push(f.notes);
    return `  [applied] ${f.id} — ${parts.length ? parts.join('; ') : 'done'}`;
  }
  const why = f.refused || 'not applied';
  return `  [refused] ${f.id} — ${why}${f.notes ? `; ${f.notes}` : ''}`;
}

/**
 * renderText(report, notes = []) -> string
 *
 * A header, any notes, one line per check (`[ok]    id — finding`, `[warn]  id — finding
 * (fixable)` or `(run: <fix_command>)`), then — in fix mode — the fixes section, then
 * `status: <status> (…counts)` as the last line.
 */
function renderText(report, notes = []) {
  const lines = [];
  const project = report.scope && report.scope.project ? report.scope.project : 'none (global checks only)';
  lines.push(`df-tools doctor ${report.engine_version} (${report.mode}) — project: ${project}`);
  for (const n of notes || []) lines.push(`note: ${n}`);
  lines.push('');

  if (!report.checks || report.checks.length === 0) {
    lines.push('no checks ran');
  } else {
    for (const r of report.checks) lines.push(checkLine(r));
  }

  const s = report.summary || { ok: 0, warn: 0, error: 0, fixable: 0 };
  if (report.mode === 'fix') {
    lines.push('', 'fixes:');
    if (!report.fixes || report.fixes.length === 0) lines.push('  none attempted');
    else for (const f of report.fixes) lines.push(fixLine(f));
  } else if (s.fixable > 0) {
    lines.push('', `${s.fixable} fixable — run \`df-tools doctor --fix\` to apply the safe fixes`);
  }

  lines.push('', `status: ${report.status} (ok ${s.ok}, warn ${s.warn}, error ${s.error}, fixable ${s.fixable})`);
  return lines.join('\n') + '\n';
}

/**
 * runDoctorCli({cwd, argv, env, userHome, now}) -> {ok:true, result, text, json} | {ok:false, message}
 *
 * `result` is the engine report plus `notes` (project-resolution info). `json` echoes `--json` so
 * the dispatcher knows whether to print JSON or `text`.
 */
function runDoctorCli({ cwd = process.cwd(), argv = [], env = process.env, userHome = os.homedir(), now } = {}) {
  const flags = parseDoctorArgs(argv, cwd);
  if (!flags.ok) return flags;

  if (flags.path && !isDir(flags.path)) {
    return { ok: false, message: `--path ${flags.path} does not exist or is not a directory` };
  }

  const notes = [];
  let projectRoot = null;
  if (!flags.global) {
    const resolved = resolveProject(cwd, flags.path);
    projectRoot = resolved.projectRoot;
    if (resolved.note) notes.push(resolved.note);
  }

  const theEnv = env || {};
  const checksDir = theEnv[CHECKS_DIR_ENV]
    ? path.resolve(cwd, theEnv[CHECKS_DIR_ENV])
    : doctor.DEFAULT_CHECKS_DIR;

  let report;
  try {
    report = doctor.runDoctor({
      projectRoot,
      userHome,
      env: theEnv,
      now,
      fix: flags.fix,
      scope: flags.global ? 'global' : 'all',
      checksDir,
      pluginVersion: helpers.pluginVersion({ homeDir: userHome }),
      dfToolsPath: DF_TOOLS_PATH,
    });
  } catch (e) {
    return { ok: false, message: `doctor could not run: ${e && e.message ? e.message : e}` };
  }

  const result = { ...report, notes };
  return { ok: true, result, text: renderText(report, notes), json: flags.json };
}

module.exports = {
  CHECKS_DIR_ENV,
  parseDoctorArgs,
  resolveProject,
  renderText,
  runDoctorCli,
};
