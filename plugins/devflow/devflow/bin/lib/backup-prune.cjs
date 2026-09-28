'use strict';

// backup-prune.cjs — retention for ~/.claude/devflow/backups/<slug>-<hash8>/<ts>/ (objective 37,
// ADP-05). A pure policy function (planPrune), a throttled runner (runThrottled/runPrune) and a
// repo registry (register). `userHome` is always injected by the caller — this module never
// resolves the operator's home directory itself, so a test can never touch the real one.

const fs = require('fs');
const path = require('path');
const upgrade = require('./upgrade.cjs');

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

// ─── config ─────────────────────────────────────────────────────────────────────

function isPositiveInteger(v) {
  return Number.isInteger(v) && v >= 1;
}

/**
 * readRetention(userHome) -> { retain_days, keep_min, warnings }
 * Reads <userHome>/.claude/devflow/global-config.json directly (never global-config.cjs's
 * readConfig — that resolves its path from the real operating-system home dir at load time). A missing file
 * means defaults, silently. A present-but-unparseable file means defaults, with ONE warning for
 * the parse failure. A parseable file with an invalid backups.retain_days/keep_min falls back to
 * the default for that field, with one warning per invalid field.
 */
function readRetention(userHome) {
  const configPath = path.join(userHome, '.claude', 'devflow', 'global-config.json');
  const warnings = [];
  let backups = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          parsed.backups && typeof parsed.backups === 'object' && !Array.isArray(parsed.backups)) {
        backups = parsed.backups;
      }
    } catch (e) {
      warnings.push(`could not parse ${configPath}; using defaults (${e.message})`);
    }
  }

  let retain_days = DEFAULTS.retain_days;
  if (backups.retain_days !== undefined) {
    if (isPositiveInteger(backups.retain_days)) {
      retain_days = backups.retain_days;
    } else {
      warnings.push(`backups.retain_days invalid (${JSON.stringify(backups.retain_days)}); using default ${DEFAULTS.retain_days}`);
    }
  }

  let keep_min = DEFAULTS.keep_min;
  if (backups.keep_min !== undefined) {
    if (isPositiveInteger(backups.keep_min)) {
      keep_min = backups.keep_min;
    } else {
      warnings.push(`backups.keep_min invalid (${JSON.stringify(backups.keep_min)}); using default ${DEFAULTS.keep_min}`);
    }
  }

  return { retain_days, keep_min, warnings };
}

// ─── listBackups ────────────────────────────────────────────────────────────────

/**
 * listBackups(userHome) -> [{ repo, name, dir, time, suffix }]
 * `time`/`suffix` are null for an entry that isn't a real directory (symlink, stray file) or
 * whose name doesn't parse as a timestamp — planPrune treats null `time` as unparsed: never
 * removed, never counted toward keepMin. Only REPO_DIR_RE-shaped, non-legacy/global top-level
 * dirs are descended into; everything else at the backups root (dotfiles, `.registry.json`,
 * `legacy-*`, `global-*`, anything not matching the shape) is never listed or entered.
 */
function listBackups(userHome) {
  const root = backupsRoot(userHome);
  const results = [];
  if (!fs.existsSync(root)) return results;

  const topEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const top of topEntries) {
    if (!top.isDirectory()) continue;
    if (!REPO_DIR_RE.test(top.name)) continue;
    if (top.name.startsWith('legacy-') || top.name.startsWith('global-')) continue;

    const repoDir = path.join(root, top.name);
    let tsEntries;
    try {
      tsEntries = fs.readdirSync(repoDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const tsEntry of tsEntries) {
      const tsDir = path.join(repoDir, tsEntry.name);
      let stat;
      try {
        stat = fs.lstatSync(tsDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        results.push({ repo: top.name, name: tsEntry.name, dir: tsDir, time: null, suffix: null });
        continue;
      }
      const parsed = parseBackupTime(tsEntry.name);
      results.push({
        repo: top.name,
        name: tsEntry.name,
        dir: tsDir,
        time: parsed ? parsed.time : null,
        suffix: parsed ? parsed.suffix : null,
      });
    }
  }
  return results;
}

// ─── runPrune / runThrottled ────────────────────────────────────────────────────

function stampPath(userHome) {
  return path.join(backupsRoot(userHome), '.last-prune.json');
}

function relToBackupsRoot(userHome, dir) {
  return path.relative(backupsRoot(userHome), dir).split(path.sep).join('/');
}

/**
 * readStamp(userHome) -> { last_prune_at, time } | null
 * null for a missing file, invalid JSON, a missing/non-string `last_prune_at`, or an unparseable
 * date — every one of those means "run" to the caller (runThrottled), never "throttled".
 */
function readStamp(userHome) {
  let raw;
  try {
    raw = fs.readFileSync(stampPath(userHome), 'utf-8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.last_prune_at !== 'string') return null;
  const time = Date.parse(parsed.last_prune_at);
  if (Number.isNaN(time)) return null;
  return { last_prune_at: parsed.last_prune_at, time };
}

function writeStamp(userHome, now) {
  fs.mkdirSync(backupsRoot(userHome), { recursive: true });
  fs.writeFileSync(stampPath(userHome), JSON.stringify({ last_prune_at: now.toISOString() }) + '\n');
}

/**
 * runPrune({ userHome, now, dryRun }) -> report
 * Always runs (no throttle check — that's runThrottled's job; the CLI's `--prune` calls this
 * directly so an explicit request always executes). No backups dir → `{skipped: 'no-backups'}`,
 * nothing created, nothing written. Otherwise: plan, remove (unless dryRun), then write the stamp
 * (unless dryRun) — the stamp is written even when some removals failed, so a permanently-stuck
 * entry doesn't make every future session retry the whole repo.
 */
function runPrune({ userHome, now = new Date(), dryRun = false }) {
  const retention = readRetention(userHome);
  const root = backupsRoot(userHome);

  if (!fs.existsSync(root)) {
    return {
      skipped: 'no-backups',
      throttled: false,
      dry_run: dryRun,
      retain_days: retention.retain_days,
      keep_min: retention.keep_min,
      removed: [],
      kept: 0,
      unparsed: [],
      failed: [],
      warnings: retention.warnings,
    };
  }

  const repos = listBackups(userHome);
  const { remove, keep, unparsed } = planPrune({
    repos, now, retainDays: retention.retain_days, keepMin: retention.keep_min,
  });

  const removed = [];
  const failed = [];

  for (const entry of remove) {
    if (dryRun) {
      removed.push(relToBackupsRoot(userHome, entry.dir));
      continue;
    }
    try {
      const rel = path.relative(root, entry.dir);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        failed.push({ path: entry.dir, error: 'refusing to remove a path outside the backups root' });
        continue;
      }
      const lst = fs.lstatSync(entry.dir);
      if (!lst.isDirectory()) {
        failed.push({ path: entry.dir, error: 'refusing to remove — not a real directory (symlink or file)' });
        continue;
      }
      fs.rmSync(entry.dir, { recursive: true, force: true });
      removed.push(relToBackupsRoot(userHome, entry.dir));
    } catch (e) {
      failed.push({ path: entry.dir, error: e.message });
    }
  }

  if (!dryRun) writeStamp(userHome, now);

  return {
    throttled: false,
    dry_run: dryRun,
    retain_days: retention.retain_days,
    keep_min: retention.keep_min,
    removed,
    kept: keep.length,
    unparsed: unparsed.map((e) => relToBackupsRoot(userHome, e.dir)),
    failed,
    warnings: retention.warnings,
  };
}

/**
 * runThrottled({ userHome, now }) -> report | { throttled: true, last_prune_at }
 * At most once per THROTTLE_MS (24h), per the last-prune stamp. A missing/unparseable stamp (or
 * no backups dir at all) means "run" — and the run (re)writes the stamp. Used by
 * hooks/upgrade-project.js every SessionStart; `runPrune` (above) is for an explicit CLI request
 * and is never throttled.
 */
function runThrottled({ userHome, now = new Date() }) {
  const stamp = readStamp(userHome);
  if (stamp !== null && (now.getTime() - stamp.time) < THROTTLE_MS) {
    return { throttled: true, last_prune_at: stamp.last_prune_at };
  }
  return runPrune({ userHome, now, dryRun: false });
}

// ─── register ───────────────────────────────────────────────────────────────────

function registryPath(userHome) {
  return path.join(backupsRoot(userHome), '.registry.json');
}

/**
 * register({ userHome, projectRoot, now }) -> { key, path, created }
 * Records `repos[repoKey] = { path: realpath(projectRoot), registered_at }` in
 * <userHome>/.claude/devflow/backups/.registry.json, creating the backups dir when absent.
 * `repoKey` is upgrade.cjs's `repoKey(projectRoot)` — the same `<slug>-<hash8>` backupDirFor uses,
 * so a registry entry and its backup dir always agree. Re-registering the same repo keeps its
 * original `registered_at` and only rewrites the file when something actually changed.
 */
function register({ userHome, projectRoot, now = new Date() }) {
  const key = upgrade.repoKey(projectRoot);
  const real = fs.realpathSync(projectRoot);
  fs.mkdirSync(backupsRoot(userHome), { recursive: true });

  const regPath = registryPath(userHome);
  let registry = { repos: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.repos && typeof parsed.repos === 'object') {
      registry = parsed;
    }
  } catch {
    // Missing or corrupt registry — start fresh.
  }
  if (!registry.repos || typeof registry.repos !== 'object') registry.repos = {};

  const existing = registry.repos[key];
  const registered_at = (existing && typeof existing.registered_at === 'string')
    ? existing.registered_at
    : now.toISOString();

  const before = JSON.stringify(registry);
  registry.repos[key] = { path: real, registered_at };
  const after = JSON.stringify(registry);

  if (before !== after) {
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
  }

  return { key, path: real, created: !existing };
}

module.exports = {
  DEFAULTS,
  THROTTLE_MS,
  REPO_DIR_RE,
  parseBackupTime,
  readRetention,
  listBackups,
  planPrune,
  runPrune,
  runThrottled,
  register,
};
