'use strict';

/**
 * runtime-digest — the content half of the sync-runtime marker (TRD 45-03, DOC-03).
 *
 * `~/.claude/aoforge/.plugin-version` alone cannot tell a same-version content change from
 * a no-op, so a rebuilt plugin (routine on a dev branch, and after an in-place update of an
 * unreleased build) never reached the mirror. `digestTree()` reduces the mirrored set to one
 * `sha256:<hex>` value that is stored beside the version as `.plugin-digest`.
 *
 * Two consumers, and they MUST agree byte for byte, which is why this lives in one module:
 *   1. hooks/sync-runtime.js — compares digestTree(bundled aoforge/) against the marker on
 *      the equal-version fast path, and writes the marker after a good mirror.
 *   2. the doctor runtime-mirror check (45-05) — compares digestTree(bundled) against
 *      digestTree(mirror) and against the marker, to report real content drift.
 *
 * SUBDIRS and MIRROR_EXCLUDE are the mirror's own allowlist and filter. The hook imports them
 * from here rather than keeping copies, so the digest can never cover a different set than the
 * one that is actually copied.
 *
 * The digest is a function of relative path and file bytes ONLY: no mtimes, no permissions, no
 * absolute paths, so it is identical across machines and checkouts. Node builtins only.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Marker file written beside `.plugin-version` after a good mirror. */
const DIGEST_FILE = '.plugin-digest';

/** The runtime subdirectories that are mirrored. Top-level extras (state/, stacks/, ...) are not. */
const SUBDIRS = ['workflows', 'references', 'templates', 'bin', 'schemas', 'stack-profiles'];

/** Entries never mirrored (and so never digested). */
const MIRROR_EXCLUDE = [
  /\.test\.cjs$/,
  /\.test\.js$/,
  /(^|\/)__fixtures__(\/|$)/,
];

/**
 * True if an entry is excluded from the mirror.
 * @param {string} entryName  basename of the entry (file or dir)
 * @param {string} relPath    posix path relative to the SUBDIR root (e.g. "lib/helper.test.cjs")
 */
function shouldExclude(entryName, relPath) {
  return MIRROR_EXCLUDE.some(r => r.test(entryName) || r.test(relPath));
}

/**
 * Collect regular files under `dir` (recursive), pushing `{ rel, abs }` where rel is
 * `<prefix>/<path relative to the subdir root>`. The exclusion filter sees paths relative to the
 * subdir root, exactly as the hook's copyDir computes them. Symlinks and other non-regular
 * entries are skipped, as copyDir skips them.
 */
function walk(dir, prefix, relBase, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // absent or unreadable subdir counts as empty
  }
  for (const entry of entries) {
    const relPath = relBase ? relBase + '/' + entry.name : entry.name;
    if (shouldExclude(entry.name, relPath)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, prefix, relPath, out);
    } else if (entry.isFile()) {
      out.push({ rel: prefix + '/' + relPath, abs });
    }
  }
}

/**
 * Digest the mirrored set under `rootDir`: `sha256:<hex>` over the SUBDIRS files (minus the mirror
 * exclusions) as `path \0 bytes \0`, in sorted posix-path order. A missing subdir is empty and a
 * missing root yields the digest of the empty set; this never throws for absent input.
 * @param {string} rootDir  a bundled `aoforge/` dir or a mirror (`~/.claude/aoforge`)
 * @returns {string} `sha256:` followed by 64 hex characters
 */
function digestTree(rootDir) {
  const files = [];
  for (const sub of SUBDIRS) {
    walk(path.join(rootDir, sub), sub, '', files);
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f.rel);
    hash.update('\0');
    try {
      hash.update(fs.readFileSync(f.abs));
    } catch {
      // A file that vanishes mid-walk contributes its path only; the next run re-digests.
    }
    hash.update('\0');
  }
  return 'sha256:' + hash.digest('hex');
}

/**
 * The trimmed `.plugin-digest` content in `targetDir`, or null when the marker is absent,
 * unreadable or empty.
 * @param {string} targetDir  the mirror root (`~/.claude/aoforge`)
 * @returns {string|null}
 */
function readMarkerDigest(targetDir) {
  try {
    const v = fs.readFileSync(path.join(targetDir, DIGEST_FILE), 'utf8').trim();
    return v === '' ? null : v;
  } catch {
    return null;
  }
}

module.exports = {
  DIGEST_FILE,
  SUBDIRS,
  MIRROR_EXCLUDE,
  shouldExclude,
  digestTree,
  readMarkerDigest,
};
