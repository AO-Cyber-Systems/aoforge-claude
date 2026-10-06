'use strict';

/**
 * telemetry.cjs — TRD 31-01
 *
 * One view over the signals objectives 27-30 started emitting, so a drifting
 * run is visible without a forensic transcript audit.
 *
 * Sources, all local and already being written:
 *   .planning/.override-log.jsonl   — structured gate overrides (TRD 30-04)
 *   ~/.claude/devflow/state/progress-guard/<session>.json — stuck-loop detection state, one
 *                                     file per session, filtered to this project (TRD 28-04;
 *                                     moved out of .planning/ in quick task 25)
 *   session transcripts             — blocking events (TRD 31-03)
 *   doc-staleness.collect()         — documentation-staleness W05x issues (TRD 38-07, merged here TRD 38-11)
 *
 * Deliberately read-only and cheap: it aggregates what exists rather than
 * instrumenting anything new. The expensive part (transcript scanning) is
 * opt-in via `sessions`, so the default call is fast enough for a status view.
 */

const fs = require('fs');
const path = require('path');
const { readOverrides } = require('./override.cjs');
const store = require('./progress-guard-store.cjs');

/** The `blocks` section of the result, from a session-audit report. */
function summarizeBlocks(sessionReport) {
  return {
    total: sessionReport.total_events,
    devflow_owned: sessionReport.devflow_owned_events,
    sessions_with_blocks_pct: sessionReport.sessions_with_blocks_pct,
    top: Object.entries(sessionReport.by_category || {}).slice(0, 5)
      .map(([category, n]) => ({ category, events: n })),
  };
}

/** The advisory sentences a session-audit report contributes. */
function blockAdvisories(sessionReport) {
  if (!(sessionReport.devflow_owned_events > 0)) return [];
  return [
    `${sessionReport.devflow_owned_events} DevFlow-owned blocks in this window — ` +
    `objectives 27/30 target these; re-check after the plugin cache re-syncs`,
  ];
}

/**
 * @param {object} opts
 * @param {string|null} opts.planningDir
 * @param {object} [opts.sessionReport] - optional output of session-audit analyze()
 * @param {string|null} [opts.userHome] - passed through to doc-staleness's manifest detection
 * @param {string} [opts.progressGuardDir] - where per-session guard files live (default: store.stateDir())
 * @returns {object}
 */
function collect({ planningDir, sessionReport, userHome = null, progressGuardDir = store.stateDir() }) {
  const out = { overrides: null, progress_guard: null, blocks: null, docs: null, advisories: [] };
  if (!planningDir) {
    const notProject = 'no .planning/ — not a DevFlow project';
    // Blocks come from transcripts, not .planning/, so a scan outside a project still reports them.
    // Without a report this early return is byte-identical to what it always was.
    if (!sessionReport) return { ...out, advisories: [notProject] };
    return { ...out, blocks: summarizeBlocks(sessionReport), advisories: [notProject, ...blockAdvisories(sessionReport)] };
  }

  // --- overrides -----------------------------------------------------------
  const ov = readOverrides({ planningDir, limit: 5 });
  out.overrides = { total: ov.total, by_gate: ov.by_gate, recent: ov.entries };
  for (const r of ov.needs_rescoping || []) {
    out.advisories.push(
      `gate "${r.gate}" overridden ${r.overrides}x — a gate fought repeatedly is mis-scoped, not a user problem`
    );
  }

  // --- progress guard ------------------------------------------------------
  // Per-session files are shared across every project on the machine, so keep only this
  // project's. No fallback to the legacy .planning/.progress-guard.json: migration 0008
  // untracks it, so it is dead and stale, and reading it would report ghost streaks.
  try {
    const dirOfProject = path.dirname(planningDir);
    let project = dirOfProject;
    try { project = fs.realpathSync(dirOfProject); } catch { /* keep the raw path */ }
    const sessions = store.listSessions(progressGuardDir)
      .filter((s) => s.project === project)
      .map((s) => ({ session: s.session, streak: (s.guard && s.guard.streak) || 0, updated: s.updated }))
      .sort((a, b) => b.streak - a.streak);
    out.progress_guard = { sessions_tracked: sessions.length, worst_streak: sessions[0] ? sessions[0].streak : 0 };
    if (out.progress_guard.worst_streak >= 3) {
      out.advisories.push(
        `a session repeated the same call ${out.progress_guard.worst_streak}x — check for a stuck loop`
      );
    }
  } catch { out.progress_guard = { sessions_tracked: 0, worst_streak: 0 }; }

  // --- blocking events (opt-in; caller supplies the scan) ------------------
  if (sessionReport) {
    out.blocks = summarizeBlocks(sessionReport);
    out.advisories.push(...blockAdvisories(sessionReport));
  }

  // --- documentation staleness (TRD 38-11) ----------------------------------
  // Inline require (not top-of-file) deliberately: it lets tests replace
  // require.cache['./doc-staleness.cjs'] to exercise the failure path below.
  try {
    const { collect: collectDocs } = require('./doc-staleness.cjs');
    const projectRoot = path.dirname(planningDir);
    const { issues, checked } = collectDocs({ projectRoot, userHome });
    out.docs = { checked, count: issues.length };
    for (const i of issues) {
      out.advisories.push(`docs: ${i.code} ${i.message} — ${i.fix}`);
    }
  } catch (e) {
    out.advisories.push(`docs: staleness check failed — ${e.message}`);
  }

  if (!out.advisories.length) out.advisories.push('nothing needs attention');
  return out;
}

module.exports = { collect };
