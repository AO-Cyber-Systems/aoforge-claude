'use strict';

/**
 * 31-awareness-state.cjs — TRD 45-07 (DOC-05)
 *
 * The cross-repo awareness cache (45-01) is per-repo state in `ctx.paths.awarenessDir`, one
 * `<slug>-<hash8>.json` per repo. It is a regenerable cache, so this check prunes freely inside
 * that dir — and only inside it — composing awareness-store's own listing / pruning:
 *
 *   stale      mtime older than 7 days
 *   orphaned   the entry's recorded `project` path no longer exists (an entry with no `project`
 *              is not provably orphaned and is kept — same rule as the store)
 *   oversized  a single entry over 1 MiB (the legacy in-tree cache ran to ~640KB, under the cap)
 *
 * A directory total over 20 MiB is reported too, but a fresh, live, individually-small entry is
 * never deleted just because the dir is big: with nothing removable it stays an unfixable warn.
 */

const fs = require('fs');
const path = require('path');
const store = require('../awareness-store.cjs');

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FILE_CAP = 1024 * 1024;
const DIR_CAP = 20 * 1024 * 1024;

const REASON_ORDER = ['orphaned', 'stale', 'oversized'];

function mib(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Classify every parseable entry. Same stale / orphan predicates as awareness-store.pruneStale;
 * oversized is strictly larger than FILE_CAP.
 * @returns {{ count: number, flagged: Array<{file: string, size: number, reasons: string[]}> }}
 */
function classify(dir, nowMs) {
  const listed = store.listEntries(dir);
  const flagged = [];
  for (const e of listed) {
    const reasons = [];
    if (typeof e.project === 'string' && e.project && !fs.existsSync(e.project)) reasons.push('orphaned');
    if (nowMs - e.mtimeMs > STALE_MS) reasons.push('stale');
    if (e.size > FILE_CAP) reasons.push('oversized');
    if (reasons.length) flagged.push({ file: e.file, size: e.size, reasons });
  }
  return { count: listed.length, flagged };
}

function run(ctx) {
  const dir = ctx.paths.awarenessDir;
  if (!fs.existsSync(dir)) {
    return {
      severity: 'ok',
      finding: 'no awareness state',
      fixable: false,
      details: { dir, count: 0, totalSize: 0, entries: [] },
    };
  }

  const { count, flagged } = classify(dir, ctx.now.getTime());
  const totalSize = store.totalSize(dir);
  const details = {
    dir,
    count,
    totalSize,
    entries: flagged.map((f) => ({ file: path.basename(f.file), size: f.size, reasons: f.reasons })),
  };

  if (flagged.length > 0) {
    const counts = REASON_ORDER
      .map((r) => [r, flagged.filter((f) => f.reasons.includes(r)).length])
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n} ${r}`)
      .join(', ');
    return {
      severity: 'warn',
      finding: `${flagged.length} awareness cache ${flagged.length === 1 ? 'entry' : 'entries'} to prune (${counts})`,
      fixable: true,
      details,
    };
  }

  if (totalSize > DIR_CAP) {
    return {
      severity: 'warn',
      finding: `awareness state is ${mib(totalSize)} MiB, over the ${DIR_CAP / (1024 * 1024)} MiB cap, but every entry is fresh and live`,
      fixable: false,
      fix_command: `rm -f '${dir}'/*.json  # regenerable cache: the next session rebuilds only the entries it needs`,
      details,
    };
  }

  return {
    severity: 'ok',
    finding: `${count} awareness cache ${count === 1 ? 'entry' : 'entries'}, ${mib(totalSize)} MiB, none stale`,
    fixable: false,
    details,
  };
}

function fix(ctx) {
  const dir = ctx.paths.awarenessDir;
  const nowMs = ctx.now.getTime();
  const { flagged } = classify(dir, nowMs);
  if (flagged.length === 0) {
    return { applied: true, changed: [], notes: 'no stale, orphaned or oversized awareness entries to remove' };
  }

  // Stale + orphaned go through the store's own sweep; oversized entries (which that sweep
  // does not know about) are unlinked one by one. Everything removed is a direct `*.json`
  // child of the awareness dir, since it came from the store's listing of that dir.
  store.pruneStale(dir, nowMs, STALE_MS, { orphans: true });
  for (const f of flagged) {
    if (!f.reasons.includes('oversized')) continue;
    try { fs.unlinkSync(f.file); } catch { /* reported below as not removed */ }
  }

  const changed = flagged.filter((f) => !fs.existsSync(f.file)).map((f) => f.file);
  if (changed.length === 0) {
    return { applied: false, refused: `could not remove any awareness entry in ${dir}` };
  }
  const left = flagged.length - changed.length;
  return {
    applied: true,
    changed,
    notes: `removed ${changed.length} awareness cache ${changed.length === 1 ? 'entry' : 'entries'} from ${dir}` +
      (left > 0 ? `; ${left} could not be removed` : ''),
  };
}

module.exports = {
  id: 'awareness-state',
  title: 'Awareness cache state',
  scope: 'global',
  run,
  fix,
  STALE_MS,
  FILE_CAP,
  DIR_CAP,
};
