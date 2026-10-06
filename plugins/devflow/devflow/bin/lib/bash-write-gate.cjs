'use strict';

/**
 * bash-write-gate.cjs — TRD 60-03
 *
 * The decision the edit gate makes about a Bash command: of the files it
 * writes (bash-write-detect.cjs, 60-02), which does the gate stop, and which
 * pass. It is the ONE decision shared by the hook (60-04, live file system and
 * git) and the transcript replay (60-05, historical predicates), so both make
 * the same call from the same code. The predicates are injected for that reason.
 *
 *   evaluateBashWrites(cmd, { cwd, projectRoot, home, isOutside, isDirectory, isTracked })
 *     -> { writes, gated, passed }
 *
 *   writes  what detectBashWrites reported, untouched
 *   gated   absolute paths of tracked project files the command writes, each once,
 *           in command order
 *   passed  [{ path, form, reason }] for every write that is not gated
 *
 * Pass reasons, checked in this order for each target:
 *   unresolvable     the target cannot be resolved statically ($VAR, backticks)
 *   outside-project  not under the project root (tmp, scratchpad, other repos)
 *   planning         any `.planning` segment below the project root
 *   markdown         `*.md`
 *   untracked        a candidate that git does not track (new files, ignored files)
 *
 * What is left after those four is a candidate, and ONE tracked-set lookup turns
 * candidates into `gated` (tracked) or `untracked` (passed). The lookup is not
 * made when there is no candidate, so a command that only touches tmp or
 * markdown never costs a git call.
 *
 * cp and mv into a directory (trailing slash, -t, `.`, or a destination that
 * isDirectory says exists) are judged on <dir>/<basename(source)>, the file that
 * is actually written.
 *
 * The defaults fail open: with no `isTracked` nothing is tracked, so nothing is
 * gated; with no `isDirectory` a bare destination is a file. A gate that cannot
 * ask git must not stop work.
 *
 * Mirrors gate-edits.js for Edit/Write (planning artifact, markdown doc) but does
 * not require it: this lib is mirrored to ~/.claude/devflow without hooks/.
 */

const path = require('path');

const { detectBashWrites } = require('./bash-write-detect.cjs');

/** Order-preserving unique. */
function unique(list) {
  return [...new Set(list)];
}

/** True when `abs` is not inside `projectRoot`. */
function defaultIsOutside(projectRoot) {
  return (abs) => {
    const rel = path.relative(projectRoot, abs);
    return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  };
}

/**
 * The files one detected write lands on. A cp or mv into a directory lands each
 * source under it; every other write lands on its own path. A null entry is a
 * target that cannot be resolved.
 */
function targetsOf(w, isDirectory) {
  const copiesInto = (w.form === 'cp' || w.form === 'mv') && w.path && (w.into || isDirectory(w.path));
  if (copiesInto) {
    return (w.sources || []).map((s) => (s ? path.join(w.path, path.basename(s)) : null));
  }
  return [w.path];
}

/**
 * @param {string} cmd
 * @param {{
 *   cwd?: string,
 *   projectRoot?: string,
 *   home?: string,
 *   isOutside?: (abs: string) => boolean,
 *   isDirectory?: (abs: string) => boolean,
 *   isTracked?: (abs: string[]) => Set<string>,
 * }} [ctx] projectRoot defaults to cwd; isOutside to the path.relative test
 * @returns {{
 *   writes: Array<object>,
 *   gated: string[],
 *   passed: Array<{path: string|null, form: string, reason: string}>,
 * }}
 */
function evaluateBashWrites(cmd, ctx = {}) {
  const { cwd, home, isDirectory = () => false, isTracked = () => new Set() } = ctx;
  const projectRoot = ctx.projectRoot || cwd;
  const isOutside = ctx.isOutside || defaultIsOutside(projectRoot);

  const writes = detectBashWrites(cmd, { cwd, home });
  const passed = [];
  const candidates = [];

  for (const w of writes) {
    for (const target of targetsOf(w, isDirectory)) {
      if (target === null) {
        passed.push({ path: null, form: w.form, reason: 'unresolvable' });
      } else if (isOutside(target)) {
        passed.push({ path: target, form: w.form, reason: 'outside-project' });
      } else if (path.relative(projectRoot, target).split(path.sep).includes('.planning')) {
        passed.push({ path: target, form: w.form, reason: 'planning' });
      } else if (/\.md$/i.test(target)) {
        passed.push({ path: target, form: w.form, reason: 'markdown' });
      } else {
        candidates.push({ path: target, form: w.form });
      }
    }
  }

  const tracked = candidates.length > 0 ? isTracked(unique(candidates.map((c) => c.path))) : new Set();
  const gated = unique(candidates.filter((c) => tracked.has(c.path)).map((c) => c.path));
  for (const c of candidates) {
    if (!tracked.has(c.path)) passed.push({ path: c.path, form: c.form, reason: 'untracked' });
  }

  return { writes, gated, passed };
}

module.exports = { evaluateBashWrites };
