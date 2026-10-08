#!/usr/bin/env node

/**
 * AOForge Bash Write Gate (PreToolUse, Bash) — TRD 60-04, DECISION-001
 *
 * The Edit gate (gate-edits.js) stops a direct Edit/Write of tracked source in ambient mode, and
 * a Bash `echo x > src/a.js` did the same job unchecked. This hook closes that gap: in an AOForge
 * project in ambient mode, a Bash command that writes a tracked project file is denied (or asked,
 * see Severity) exactly like the Edit it replaces.
 *
 * Decision order, cheapest first, so the common Bash call costs one regex (first match exits):
 *
 *    1. AOFORGE_SKIP_EDIT_GATE=1                           -> allow
 *    2. not a Bash call, or no command                     -> allow
 *    3. !mayWrite(cmd)  (no fs, no git)                    -> allow
 *    4. no .planning/ above the payload cwd                -> allow (not an AOForge project)
 *    5. mode = least of gates.editGate, gates.bashEditGate -> 'off' allows
 *    6. agent_type aoforge:*                               -> allow
 *    7. a live skill marker, local or main checkout        -> allow
 *    8. evaluateBashWrites (git asked once, and only if an in-project candidate exists)
 *       nothing gated                                      -> allow
 *    9. a fresh override marker (consumed HERE, see below) -> allow
 *   10. emit deny (strict) or ask (warn) naming the files
 *
 * Why a separate hook and not a Bash branch inside gate-edits.js:
 *   - gate-edits.js's Edit/Write path stays byte-identical. It is the most-fired gate and its test
 *     file pins it, including shouldGate returning noop for Bash.
 *   - Fail-open boundaries stay independent. A crash while parsing a strange Bash command can
 *     never affect Edit/Write gating, and gate-commits is untouched.
 *   - The Bash rule has its own severity knob and default (gates.bashEditGate), while
 *     gates.editGate still softens or disables it.
 *   - The escapes are the Edit gate's own code anyway. This file requires gate-edits.js's
 *     exported helpers (it runs main() only under require.main === module), so "the same escapes
 *     as Edit/Write" is true by construction, not by copy.
 *
 * Escapes (all of them gate-edits' own helpers):
 *   - AOFORGE_SKIP_EDIT_GATE=1 in the hook environment
 *   - a live skill marker in this project's .planning/ or the MAIN checkout's, so worktree-isolated
 *     agents are not denied by a marker they cannot see (an expired marker does not count)
 *   - the payload's agent_type starting with `aoforge:` (allowed in warn mode too, never asked)
 *   - a fresh override marker, written by route-intent.js when the prompt says "skip aoforge" or
 *     "just edit". It is single-turn, and consumed ONLY by a write that would otherwise be gated:
 *     gate-edits consumes it on every Edit/Write, but a Bash call is far more often an `ls`, and
 *     an ordinary command must not eat the user's one override.
 *   - gates.editGate off, or gates.bashEditGate off
 *
 * Never gated (60-02 detector, 60-03 gate): a command that only MENTIONS a write (heredoc body,
 * quoted argument, comment), a write under .planning/, *.md, a file git does not track, a path
 * outside the project (tmp, scratchpad, another repo), and a target that cannot be resolved
 * statically ($VAR, backticks). The detector's known false negatives are listed in
 * bash-write-detect.cjs (for example a heredoc piped into an interpreter).
 *
 * Severity: the LEAST severe of gates.editGate and gates.bashEditGate (off < warn < strict). An
 * unset or invalid bashEditGate is BASH_EDIT_GATE_DEFAULT. strict emits permissionDecision
 * 'deny', warn emits 'ask'. gates.editGate warn therefore softens a strict Bash rule to 'ask', and
 * off disables it.
 *
 * Fail open: this hook exits 0 on every path and writes nothing to stderr. If the aoforge libs are
 * not next to hooks/ (a partial install), or anything throws, it allows. A gate that cannot decide
 * must not stop work.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

const LIB_DIR = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');

/** undefined = not loaded yet; null = unavailable (fail open); else the helper bundle. */
let libs;

/**
 * The helpers this hook decides with, required lazily so a missing or broken module is a
 * fail-open allow rather than a crash at require time.
 */
function loadLibs() {
  if (libs !== undefined) return libs;
  try {
    const edits = require('./gate-edits.js');
    const override = require('./lib/edit-override.js');
    const detect = require(path.join(LIB_DIR, 'bash-write-detect.cjs'));
    const gate = require(path.join(LIB_DIR, 'bash-write-gate.cjs'));
    libs = {
      findPlanningDir: edits.findPlanningDir,
      sharedPlanningDir: edits.sharedPlanningDir,
      hasSkillActiveMarker: edits.hasSkillActiveMarker,
      readEditGateMode: edits.readEditGateMode,
      isAoforgeAgent: edits.isAoforgeAgent,
      isOutsideProject: edits.isOutsideProject,
      consumeEditOverrideMarker: override.consumeEditOverrideMarker,
      mayWrite: detect.mayWrite,
      evaluateBashWrites: gate.evaluateBashWrites,
      gitTrackedSet: gate.gitTrackedSet,
      effectiveBashMode: gate.effectiveBashMode,
      readBashEditGate: gate.readBashEditGate,
      bashGateReason: gate.bashGateReason,
    };
  } catch {
    libs = null;
  }
  return libs;
}

function isDirectory(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The hook decision for one PreToolUse payload.
 *
 * @param {object} input the PreToolUse payload
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, deps?: object}} [ctx]
 *   cwd   the process cwd, used only when the payload carries no absolute cwd
 *   env   the environment to read AOFORGE_SKIP_EDIT_GATE from
 *   deps  overrides for any helper named in loadLibs (tests inject findPlanningDir, gitTrackedSet)
 * @returns {{hookSpecificOutput: object}|null} the output to write, or null to allow
 */
function run(input, { cwd: processCwd = process.cwd(), env = process.env, deps = {} } = {}) {
  if (env.AOFORGE_SKIP_EDIT_GATE === '1') return null;

  if (!input || input.tool_name !== 'Bash') return null;
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || command.trim() === '') return null;

  const base = loadLibs();
  if (!base) return null;
  const d = { ...base, ...deps };

  if (!d.mayWrite(command)) return null;

  // The payload cwd is the session's working directory, and what relative targets mean.
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : processCwd;
  const planningDir = d.findPlanningDir(cwd);
  if (!planningDir) return null;

  const mode = d.effectiveBashMode(d.readEditGateMode(planningDir), d.readBashEditGate(planningDir));
  if (mode === 'off') return null;

  if (d.isAoforgeAgent(input.agent_type)) return null;
  if (d.hasSkillActiveMarker(planningDir, d.sharedPlanningDir(cwd))) return null;

  const projectRoot = path.dirname(planningDir);
  const result = d.evaluateBashWrites(command, {
    cwd,
    projectRoot,
    isOutside: (abs) => d.isOutsideProject(projectRoot, abs),
    isDirectory,
    isTracked: (abs) => d.gitTrackedSet(projectRoot, abs),
  });
  if (result.gated.length === 0) return null;

  // Only now, with a write that would be stopped, is the one-shot override spent.
  if (d.consumeEditOverrideMarker(planningDir)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: mode === 'warn' ? 'ask' : 'deny',
      permissionDecisionReason: d.bashGateReason(result.gated, projectRoot, mode),
    },
  };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  try {
    const input = JSON.parse(readStdin() || '{}');
    const out = run(input);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // Fail open: a gate bug must never block the user's command.
  }
}

if (require.main === module) main();

module.exports = { run };
