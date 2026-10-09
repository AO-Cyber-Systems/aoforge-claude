'use strict';

// Doctor check: validate-health (TRD 45-06, DOC-05).
//
// Surfaces `aof-tools validate health` inside the doctor without re-implementing it. validate.cjs
// calls output() (which exits), so it is spawned — `node <dfToolsPath> --cwd <root> validate health`
// with HOME=ctx.userHome, so a test's fake home is what it sees — and its JSON is parsed (never its
// human output). Large output arrives as `@file:<tmp path>`, which is followed.
//
// Codes another doctor check owns are DEFERRED, never double-reported. One line per owner:
//   E006 / W064  skill-active marker — skill-markers (check 23), TRD 69-04
//   E020 / I022  mirror vs. installed plugin — runtime-mirror
//   W040         project behind — pending-migrations
//   W057-W061    store sync health — gh-store-sync, TRD 50-07
//   W062         checks-workflow pin — checks-workflow-pin, TRD 61-01
//   W063         stale pinned model id — model-profiles (check 13), TRD 61-07
// They are listed in details.deferred and never set the severity.
//
//   remaining errors → error; remaining warnings → warn; else ok
//   fixable when a non-deferred error or warning is repairable (validate's repairable_count also counts
//   the deferred ones, so it is recounted here) and `.aoforge/` has no uncommitted changes (fix = the
//   same command with --repair). Info codes never affect severity.

const fs = require('fs');
const { spawnSync } = require('child_process');

const dg = require('../doctor-git.cjs');
const { planningRel, PLANNING_DIR_NAMES } = require('../compat.cjs');
const legacy = require('./20-legacy-runtime-state.cjs');

const DEFERRED = ['E006', 'E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061', 'W062', 'W063', 'W064'];
const DF_TOOLS = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const HEALTH_COMMAND = `${DF_TOOLS} validate health`;
const REPAIR_COMMAND = `${DF_TOOLS} validate health --repair`;
const TIMEOUT_MS = 30000;

function firstLine(text) {
  return String(text || '').trim().split('\n')[0] || '';
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

/** -> {ok:true, json} | {ok:false, error} */
function runHealth(ctx, extraArgs = []) {
  const exec = typeof ctx.exec === 'function' ? ctx.exec : spawnSync;
  const args = [ctx.dfToolsPath, '--cwd', ctx.projectRoot, 'validate', 'health', ...extraArgs];
  const r = exec(process.execPath, args, {
    env: { ...(ctx.env || {}), HOME: ctx.userHome },
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  }) || {};

  let text = String(r.stdout || '').trim();
  try {
    if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object' || !Array.isArray(json.errors) || !Array.isArray(json.warnings)) {
      throw new Error('output is not a validate health report');
    }
    return { ok: true, json };
  } catch (e) {
    const why = firstLine(r.stderr) || (r.error && r.error.message) || e.message;
    return { ok: false, error: `validate health failed (exit ${r.status === undefined ? '?' : r.status}): ${why}` };
  }
}

function classify(json) {
  const isDeferred = (i) => i && DEFERRED.includes(i.code);
  const errors = json.errors.filter((i) => !isDeferred(i));
  const warnings = json.warnings.filter((i) => !isDeferred(i));
  const info = Array.isArray(json.info) ? json.info : [];
  const deferred = uniqueSorted([...json.errors, ...json.warnings, ...info].filter(isDeferred).map((i) => i.code));
  // Only this check's own issues count: validate's repairable_count includes the deferred ones (the
  // skill-marker E006/W064), and running --repair for a problem this check does not report would
  // change files behind another check's back.
  const repairable = [...errors, ...warnings].filter((i) => i && i.repairable === true).length;
  return { errors, warnings, info, deferred, repairable };
}

function planningGuard(ctx) {
  const own = ctx.changedThisRun instanceof Set ? ctx.changedThisRun : new Set(ctx.changedThisRun || []);
  return dg.worktreeGuard(ctx.projectRoot, [...PLANNING_DIR_NAMES], {
    env: ctx.env,
    exclude: (rel) => own.has(rel) || legacy.isLegacyRuntimePath(rel),
  });
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const h = runHealth(ctx);
  if (!h.ok) return { severity: 'error', finding: h.error, fixable: false, fix_command: HEALTH_COMMAND };

  const c = classify(h.json);
  const codes = uniqueSorted([...c.errors, ...c.warnings].map((i) => i.code));
  const details = {
    status: h.json.status,
    codes,
    errors: c.errors,
    warnings: c.warnings,
    info_codes: uniqueSorted(c.info.map((i) => i && i.code).filter(Boolean)),
    deferred: c.deferred,
    repairable_count: c.repairable,
  };

  if (c.errors.length === 0 && c.warnings.length === 0) {
    const tail = c.deferred.length ? ` (deferred to other checks: ${c.deferred.join(', ')})` : '';
    return { severity: 'ok', finding: `validate health: clean${tail}`, fixable: false, details };
  }

  const severity = c.errors.length ? 'error' : 'warn';
  const listed = [...c.errors, ...c.warnings].map((i) => `${i.code} ${i.message}`).join('; ');
  let finding = `validate health: ${c.errors.length} error(s), ${c.warnings.length} warning(s): ${listed}`;

  let fixable = false;
  let fixCommand = HEALTH_COMMAND;
  if (c.repairable > 0) {
    const g = planningGuard(ctx);
    fixable = g.ok;
    if (!g.ok) {
      finding += ` — repair refused: ${g.reason}`;
      fixCommand = REPAIR_COMMAND;
    }
  }

  const result = { severity, finding, fixable, details };
  if (!fixable) result.fix_command = fixCommand;
  return result;
}

function fix(ctx) {
  if (!ctx.projectRoot) return { applied: false, refused: 'no project' };

  const pre = runHealth(ctx);
  if (!pre.ok) return { applied: false, refused: pre.error };
  if (classify(pre.json).repairable === 0) return { applied: false, notes: 'nothing repairable' };
  const g = planningGuard(ctx);
  if (!g.ok) return { applied: false, refused: g.reason };

  const h = runHealth(ctx, ['--repair']);
  if (!h.ok) return { applied: false, refused: h.error };

  const repairs = Array.isArray(h.json.repairs_performed) ? h.json.repairs_performed : [];
  const done = repairs.filter((r) => r && r.success);
  const failedRepairs = repairs.filter((r) => r && !r.success);
  const changed = uniqueSorted(done.filter((r) => typeof r.path === 'string' && r.path).map((r) => planningRel(ctx.projectRoot, r.path)));
  const notes = [];
  if (done.length) notes.push(`repaired: ${done.map((r) => r.action + (r.path ? ` (${r.path})` : '')).join(', ')}`);
  if (failedRepairs.length) notes.push(`failed: ${failedRepairs.map((r) => `${r.action}: ${r.error}`).join('; ')}`);

  if (!done.length) {
    return { applied: false, refused: failedRepairs.length ? `repair failed: ${notes.join('; ')}` : 'validate health performed no repair' };
  }
  return { applied: true, changed, notes: notes.join('; ') };
}

module.exports = {
  id: 'validate-health',
  title: 'validate health findings',
  scope: 'project',
  run,
  fix,
  DEFERRED,
};
