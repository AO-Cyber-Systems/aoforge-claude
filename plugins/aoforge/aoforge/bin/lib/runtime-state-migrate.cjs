'use strict';

// runtime-state-migrate.cjs (objective 72, TRD 72-07, INST-03): carry the user's runtime state from the old runtime
// home (compat.legacyRuntimeHome, `~/.claude/<LEGACY.runtimeDir>/`) to the new one (compat.runtimeHome,
// `~/.claude/aoforge/`) once, on the first AOForge session. hooks/sync-runtime.js calls it after a good mirror, and
// before its fast-path exit when the marker is missing and the old home exists.
//
// The copy/move split, and why:
//   COPY  calibration.json, audit.log, transcript-index.jsonl, stacks/, state/** except state/outbox
//         The old copy stays where it is and is the backup. The old plugin keeps reading and writing its home until
//         it is disabled (72-21), and none of these is unsafe to hold twice. state/ carries the estimate run state
//         and history (EST-11), the awareness cache, hook markers, the progress guard and the transcript-export stamp.
//   MOVE  state/outbox, backups/
//         The outbox is moved and never copied: a copy would leave the same queued GitHub writes in both homes, and
//         both plugins would flush them. backups/ is hundreds of MB, and one copy of a backup is enough.
//         A move is per child (one outbox file, one repository's backup directory, the registry), so an entry of the
//         same name already under the new home is never replaced: that child stays in the old home and is listed in
//         `skipped`. A cross-device rename (EXDEV) falls back to copy, verify (the same files with the same sizes),
//         then remove the source, and the child is also listed in `moved_by_copy`.
// Everything else in the old home is left alone: the old plugin's mirror (workflows, references, templates, bin,
// schemas, stack-profiles), locks/, and its version, digest and notices files. Nothing under the new home is ever
// overwritten (COPYFILE_EXCL), and nothing under the old home is removed except a moved child. Cleaning up the old
// home is a doctor fix (72-15) once the old plugin is disabled.
//
// The marker `<new home>/.legacy-state-migrated.json` = { from, at, copied, moved, skipped[, moved_by_copy] } is
// written last, so a failure part-way leaves no marker and the next session retries: a copy skips what is already
// there, and a moved child is gone from the source. With no old home nothing is written at all.
//
// userHome is always injected: this module never resolves the operating system's home directory itself.

const fs = require('fs');
const path = require('path');
const { runtimeHome, legacyRuntimeHome } = require('./compat.cjs');

const MARKER_FILE = '.legacy-state-migrated.json';

/** Copied from the old home to the new one (relative to each home). The MOVE entries inside them are left out. */
const COPY_ENTRIES = Object.freeze(['calibration.json', 'audit.log', 'transcript-index.jsonl', 'stacks', 'state']);

/** Moved, child by child, from the old home to the new one. */
const MOVE_ENTRIES = Object.freeze(['state/outbox', 'backups']);

const join = (root, rel) => path.join(root, ...rel.split('/'));

/** lstat that reports absence (ENOENT, or a non-directory on the way) as null; any other error propagates. */
function lstatOrNull(p, fsImpl) {
  try {
    return fsImpl.lstatSync(p);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

function assertHome(userHome) {
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome)) {
    throw new TypeError(`runtime-state-migrate: userHome must be an absolute path (got ${JSON.stringify(userHome)})`);
  }
}

/** True when the old runtime home is a directory and the new home has no migration marker. */
function migrationPending({ userHome, fsImpl = fs }) {
  assertHome(userHome);
  const from = lstatOrNull(legacyRuntimeHome(userHome), fsImpl);
  if (!from || !from.isDirectory()) return false;
  return lstatOrNull(path.join(runtimeHome(userHome), MARKER_FILE), fsImpl) === null;
}

/**
 * Copy `src` to `dst` (a file, a symlink, or a directory walked recursively), never replacing anything at `dst`.
 * `rel` names `src` in the result lists; a rel in `ctx.leaveOut` is not walked (the MOVE entries).
 */
function copyTree(src, dst, rel, ctx) {
  if (ctx.leaveOut.has(rel)) return;
  const { fsImpl } = ctx;
  const st = lstatOrNull(src, fsImpl);
  if (!st) return;
  const existing = lstatOrNull(dst, fsImpl);

  if (st.isDirectory()) {
    if (existing && !existing.isDirectory()) {
      ctx.skipped.push(rel);
      return;
    }
    fsImpl.mkdirSync(dst, { recursive: true });
    for (const name of fsImpl.readdirSync(src).sort()) {
      copyTree(path.join(src, name), path.join(dst, name), `${rel}/${name}`, ctx);
    }
    return;
  }
  if (existing) {
    ctx.skipped.push(rel);
    return;
  }
  if (st.isSymbolicLink()) {
    fsImpl.symlinkSync(fsImpl.readlinkSync(src), dst);
    ctx.copied.push(rel);
    return;
  }
  if (!st.isFile()) return; // a socket or a fifo is not state
  try {
    fsImpl.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      ctx.skipped.push(rel);
      return;
    }
    throw err;
  }
  ctx.copied.push(rel);
}

/**
 * Copy `src` (a file, a symlink or a directory) to `dst` without replacing anything already at `dst`; a directory is
 * merged. Returns the copied and skipped paths, named relative to `src` under `rel`. Shared with state-rekey.cjs.
 */
function copyNoClobber(src, dst, { fsImpl = fs, rel = '.' } = {}) {
  const ctx = { fsImpl, leaveOut: new Set(), copied: [], skipped: [] };
  copyTree(src, dst, rel, ctx);
  return { copied: ctx.copied, skipped: ctx.skipped };
}

/** Sorted `[rel, kind, size]` of everything under `p` (p itself included), for the EXDEV verification. */
function listing(p, fsImpl) {
  const out = [];
  (function walk(cur, rel) {
    const st = fsImpl.lstatSync(cur);
    if (st.isDirectory()) {
      out.push([rel, 'dir', 0]);
      for (const name of fsImpl.readdirSync(cur)) walk(path.join(cur, name), `${rel}/${name}`);
    } else {
      out.push([rel, st.isSymbolicLink() ? 'link' : 'file', st.size]);
    }
  })(p, '.');
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** EXDEV fallback: copy `src` to the absent `dst`, verify the copy, then remove `src`. A bad copy is removed again. */
function moveByCopy(src, dst, rel, ctx) {
  const { fsImpl } = ctx;
  copyNoClobber(src, dst, { fsImpl, rel });
  if (JSON.stringify(listing(src, fsImpl)) !== JSON.stringify(listing(dst, fsImpl))) {
    fsImpl.rmSync(dst, { recursive: true, force: true });
    throw new Error(`moving ${rel} across devices: the copy did not match the source, nothing was removed`);
  }
  fsImpl.rmSync(src, { recursive: true, force: true });
}

/** Move each child of the old `rel` directory into the new one; a child already present there stays and is skipped. */
function moveChildren(srcDir, dstDir, rel, ctx) {
  const { fsImpl } = ctx;
  const st = lstatOrNull(srcDir, fsImpl);
  if (!st || !st.isDirectory()) return;
  const existing = lstatOrNull(dstDir, fsImpl);
  if (existing && !existing.isDirectory()) {
    ctx.skipped.push(rel);
    return;
  }
  fsImpl.mkdirSync(dstDir, { recursive: true });
  for (const name of fsImpl.readdirSync(srcDir).sort()) {
    const childRel = `${rel}/${name}`;
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    if (lstatOrNull(dst, fsImpl)) {
      ctx.skipped.push(childRel);
      continue;
    }
    try {
      fsImpl.renameSync(src, dst);
    } catch (err) {
      if (!err || err.code !== 'EXDEV') throw err;
      moveByCopy(src, dst, childRel, ctx);
      ctx.movedByCopy.push(childRel);
    }
    ctx.moved.push(childRel);
  }
}

/**
 * Carry the old runtime home's state to the new one, once.
 *
 * @param {{userHome: string, now?: Date, fsImpl?: typeof fs}} opts
 * @returns {{ran: false, reason: 'no-legacy-runtime'|'already-migrated', marker?: string}
 *          |{ran: true, from: string, at: string, copied: string[], moved: string[], skipped: string[],
 *            moved_by_copy: string[], marker: string}}
 */
function migrateLegacyRuntime({ userHome, now = new Date(), fsImpl = fs } = {}) {
  assertHome(userHome);
  const from = legacyRuntimeHome(userHome);
  const to = runtimeHome(userHome);
  const marker = path.join(to, MARKER_FILE);

  const fromSt = lstatOrNull(from, fsImpl);
  if (!fromSt || !fromSt.isDirectory()) return { ran: false, reason: 'no-legacy-runtime' };
  if (lstatOrNull(marker, fsImpl)) return { ran: false, reason: 'already-migrated', marker };

  const ctx = { fsImpl, leaveOut: new Set(MOVE_ENTRIES), copied: [], moved: [], skipped: [], movedByCopy: [] };
  fsImpl.mkdirSync(to, { recursive: true });
  for (const rel of COPY_ENTRIES) copyTree(join(from, rel), join(to, rel), rel, ctx);
  for (const rel of MOVE_ENTRIES) moveChildren(join(from, rel), join(to, rel), rel, ctx);

  const record = {
    from,
    at: now.toISOString(),
    copied: [...ctx.copied].sort(),
    moved: [...ctx.moved].sort(),
    skipped: [...ctx.skipped].sort(),
  };
  const movedByCopy = [...ctx.movedByCopy].sort();
  if (movedByCopy.length > 0) record.moved_by_copy = movedByCopy;
  fsImpl.writeFileSync(marker, `${JSON.stringify(record, null, 2)}\n`);

  return { ran: true, ...record, moved_by_copy: movedByCopy, marker };
}

module.exports = { migrateLegacyRuntime, migrationPending, copyNoClobber, COPY_ENTRIES, MOVE_ENTRIES, MARKER_FILE };
