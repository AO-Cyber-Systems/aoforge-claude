'use strict';

/**
 * Transcript export schedule — objective 61, TRD 61-05, OBS-03.
 *
 * `df-tools transcript-export` keeps a compact per-session index
 * (~/.claude/devflow/transcript-index.jsonl) before Claude Code's retention deletes the transcripts
 * it was built from. The 2026-08-18 audit lost 164 sessions that way. The command only helps if
 * someone runs it, and nobody did: the index did not exist while ~/.claude/projects held 3.6 GB.
 * This module decides WHEN it runs; hooks/upgrade-project.js (SessionStart, step 0b) is its only
 * caller and owns HOW (a detached child running the bundled df-tools).
 *
 * Throttle: at most once per THROTTLE_MS (24 h), from a stamp at
 *   <home>/.claude/devflow/state/transcript-export/last-run.json   { "last_run_at": "<ISO>" }
 * That is the `state/` convention of progress-guard, awareness and hook markers; it is never
 * inside a repository. It mirrors backup-prune.runThrottled: a missing or unparseable stamp means
 * run, and a stamp that is THROTTLE_MS old or older means run. A stamp more than FUTURE_SKEW_MS in
 * the future also means run, because a clock moved back must not freeze the export for days.
 *
 * Claim, then spawn: `runScheduled` writes the stamp BEFORE it spawns, so two sessions starting
 * together start one export, not two. A child that dies leaves the window claimed; the next window
 * catches up, because the export is incremental (a session already indexed at the same size is
 * skipped). A spawn that throws propagates to the hook's try/catch with the claim standing, so a
 * broken spawn is retried at most daily.
 *
 * The escape DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1 skips only this export; it neither implies nor is
 * implied by DEVFLOW_SKIP_PRUNE or DEVFLOW_SKIP_UPGRADE.
 */

const fs = require('fs');
const path = require('path');

const THROTTLE_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const SKIP_ENV = 'DEVFLOW_SKIP_TRANSCRIPT_EXPORT';

function claudeDir(userHome) {
  return path.join(userHome, '.claude');
}

function projectsDir(userHome) {
  return path.join(claudeDir(userHome), 'projects');
}

function indexPath(userHome) {
  return path.join(claudeDir(userHome), 'devflow', 'transcript-index.jsonl');
}

function stampPath(userHome) {
  return path.join(claudeDir(userHome), 'devflow', 'state', 'transcript-export', 'last-run.json');
}

/**
 * readStamp(userHome) -> { last_run_at, time } | null
 * null for a missing file, invalid JSON, a missing or non-string `last_run_at`, or an unparseable
 * date. Every one of those means "run" to `decide`, never "throttled".
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
  if (!parsed || typeof parsed.last_run_at !== 'string') return null;
  const time = Date.parse(parsed.last_run_at);
  if (Number.isNaN(time)) return null;
  return { last_run_at: parsed.last_run_at, time };
}

/**
 * decide({ userHome, now, env }) -> { run: true } | { run: false, reason }
 * reason is one of 'skip-env' | 'no-transcripts' | 'throttled', checked in that order. Reads the
 * stamp; writes nothing.
 */
function decide({ userHome, now = new Date(), env = process.env }) {
  if (env && env[SKIP_ENV] === '1') return { run: false, reason: 'skip-env' };

  let hasTranscripts = false;
  try {
    hasTranscripts = fs.statSync(projectsDir(userHome)).isDirectory();
  } catch { /* absent: nothing to index */ }
  if (!hasTranscripts) return { run: false, reason: 'no-transcripts' };

  const stamp = readStamp(userHome);
  if (stamp !== null) {
    const age = now.getTime() - stamp.time;
    const inFuture = -age > FUTURE_SKEW_MS;
    if (!inFuture && age < THROTTLE_MS) return { run: false, reason: 'throttled' };
  }
  return { run: true };
}

/**
 * claim({ userHome, now }) -> void
 * Writes the stamp through `<file>.<pid>.tmp` and a rename, creating the state directory. The
 * temp file is removed if the rename fails, so nothing is left behind.
 */
function claim({ userHome, now = new Date() }) {
  const file = stampPath(userHome);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ last_run_at: now.toISOString() }) + '\n');
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw e;
  }
}

/**
 * exportArgs({ dfTools, userHome }) -> string[]
 * The argv (after the node binary) of the export child. `--root` and `--out` are explicit so the
 * child does not depend on its own os.homedir(). Never `--full`: the raw copy is opt-in and large.
 */
function exportArgs({ dfTools, userHome }) {
  return [dfTools, 'transcript-export', '--root', projectsDir(userHome), '--out', indexPath(userHome)];
}

/**
 * runScheduled({ userHome, now, env, dfTools, spawnChild }) -> { spawned: false, reason } | { spawned: true, args }
 * decide -> claim -> spawnChild(args). `spawnChild` is injected by the hook (a detached, unref'd
 * child) so the library never spawns anything itself. A throw from `spawnChild` propagates after
 * the claim was written.
 */
function runScheduled({ userHome, now = new Date(), env = process.env, dfTools, spawnChild }) {
  const d = decide({ userHome, now, env });
  if (!d.run) return { spawned: false, reason: d.reason };
  claim({ userHome, now });
  const args = exportArgs({ dfTools, userHome });
  spawnChild(args);
  return { spawned: true, args };
}

module.exports = {
  THROTTLE_MS,
  FUTURE_SKEW_MS,
  SKIP_ENV,
  stampPath,
  readStamp,
  decide,
  claim,
  exportArgs,
  runScheduled,
};
