'use strict';

// backup-prune.cjs — retention for ~/.claude/devflow/backups/<slug>-<hash8>/<ts>/ (objective 37,
// ADP-05). A pure policy function (planPrune), a throttled runner (runThrottled/runPrune) and a
// repo registry (register). `userHome` is always injected by the caller — this module never
// resolves the operator's home directory itself, so a test can never touch the real one.

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({ retain_days: 14, keep_min: 5 });
const THROTTLE_MS = 24 * 60 * 60 * 1000;

// A repo backup dir looks like <slug>-<hash8> (upgrade.cjs repoKey). `legacy-*` and `global-*`
// (written by global-upgrade.cjs) contain uppercase T/Z from an ISO timestamp so they never match
// this on their own, but the prefixes are excluded explicitly too (belt and braces).
const REPO_DIR_RE = /^[a-z0-9-]+-[0-9a-f]{8}$/;

// <ts> = now.toISOString().replace(/[:.]/g, '-'), optionally suffixed '-N' on a name collision
// (see upgrade.cjs backupDirFor).
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-(\d+))?$/;

function backupsRoot(userHome) {
  return path.join(userHome, '.claude', 'devflow', 'backups');
}

// ─── parseBackupTime ────────────────────────────────────────────────────────────

/**
 * parseBackupTime(name) -> { time, suffix } | null
 * `time` is epoch ms (UTC); `suffix` is 0 for the un-suffixed name, else the collision number.
 * Returns null for anything that isn't a real calendar/clock timestamp (round-trips through
 * Date.UTC and rejects silent overflow, e.g. month 13 rolling into next January).
 */
function parseBackupTime(name) {
  const m = TS_RE.exec(name);
  if (!m) return null;
  const [, yStr, moStr, dStr, hStr, miStr, sStr, msStr, suffixStr] = m;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = Number(sStr);
  const ms = Number(msStr);
  const time = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (Number.isNaN(time)) return null;

  const check = new Date(time);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== mi ||
    check.getUTCSeconds() !== s ||
    check.getUTCMilliseconds() !== ms
  ) {
    return null;
  }

  const suffix = suffixStr !== undefined ? Number(suffixStr) : 0;
  return { time, suffix };
}

// ─── planPrune (pure) ───────────────────────────────────────────────────────────

/**
 * planPrune({ repos, now, retainDays, keepMin }) -> { remove, keep, unparsed }
 *
 * `repos` is a flat list of backup entries: { repo, name, dir, time, suffix }, where `time` is
 * epoch ms or null/undefined for an entry whose name didn't parse. Per repo, entries are sorted
 * newest-first (time descending; a suffix tie — same nominal timestamp — orders ascending, so the
 * un-suffixed name is "newest" and higher suffixes are progressively "older", per upgrade.cjs's
 * collision-numbering scheme). The newest `keepMin` PARSEABLE entries are always kept; of the
 * rest, an entry is removed iff `now - time > retainDays * 86400000`. Unparseable entries are
 * never counted toward `keepMin` and never removed. Pure: no fs access, no mutation of `repos`.
 */
function planPrune({ repos, now, retainDays, keepMin }) {
  const byRepo = new Map();
  for (const entry of repos) {
    if (!byRepo.has(entry.repo)) byRepo.set(entry.repo, []);
    byRepo.get(entry.repo).push(entry);
  }

  const nowMs = now.getTime();
  const retainMs = retainDays * 24 * 60 * 60 * 1000;
  const remove = [];
  const keep = [];
  const unparsed = [];

  for (const entries of byRepo.values()) {
    const parseable = [];
    for (const e of entries) {
      if (e.time === null || e.time === undefined) unparsed.push(e);
      else parseable.push(e);
    }
    parseable.sort((a, b) => (b.time - a.time) || ((a.suffix || 0) - (b.suffix || 0)));

    parseable.forEach((entry, idx) => {
      if (idx < keepMin) {
        keep.push(entry);
        return;
      }
      const age = nowMs - entry.time;
      if (age > retainMs) remove.push(entry);
      else keep.push(entry);
    });
  }

  remove.sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.time - b.time));

  return { remove, keep, unparsed };
}

module.exports = {
  DEFAULTS,
  THROTTLE_MS,
  REPO_DIR_RE,
  parseBackupTime,
  planPrune,
};
