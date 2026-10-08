#!/usr/bin/env node

/**
 * AOForge Skill Requires Gate (UserPromptExpansion + PreToolUse, Skill) — TRD 61-08, STOR-04 part 2
 *
 * A skill declares the external tools it cannot run without in its SKILL.md frontmatter
 * (`requires: [gh]`, TRD 61-02). A skill cannot refuse itself, because by the time its body runs the model
 * is already executing it, so this hook refuses the START of the skill when a required tool is not on PATH.
 *
 * Decision order, cheapest first, so an unrelated slash command costs one object check (first match exits):
 *
 *    1. input is not an object, or its event is neither UserPromptExpansion nor PreToolUse   -> allow
 *    2. UserPromptExpansion whose expansion_type is present and is not 'slash_command'        -> allow
 *    3. AOFORGE_SKIP_SKILL_REQUIRES=1                                                         -> allow
 *    4. name = skillNameFromInvocation(input)   (null for anything that is not an aoforge skill start) -> allow
 *    5. readSkillRequires(skillsDir, name): not found, an error, or no tools                  -> allow
 *    6. missingTools(tools, env) is empty                                                     -> allow
 *    7. reason = refusalReason(name, missing), then
 *         UserPromptExpansion -> { decision: 'block', reason }   shown to the user, the turn ends
 *         PreToolUse(Skill)   -> { hookSpecificOutput: { hookEventName: 'PreToolUse',
 *                                  permissionDecision: 'deny', permissionDecisionReason: reason } }
 *                                Claude sees the reason and relays it
 *
 * Why two events. The Claude Code hooks reference says a PreToolUse hook on the `Skill` tool "fires only
 * when Claude calls the tool, but typing `/skillname` directly bypasses `PreToolUse`. `UserPromptExpansion`
 * fires on that direct path." So one script is registered on both, and the output shape follows the event.
 *
 * Why no UserPromptExpansion matcher. The matcher is the command name, and whether a plugin skill's
 * `command_name` carries the `aoforge:` prefix is not documented. skillNameFromInvocation accepts only
 * `/aoforge:<name>` in `prompt` or `aoforge:<name>` in `command_name`, so the filtering happens in code. The
 * cost is one short node process per slash command.
 *
 * Not project-scoped. A missing `gh` breaks /aoforge:gh-sync in any directory, so there is no .planning/
 * lookup here. The hook is read-only: it writes no file and spawns nothing (the PATH lookup is stat-only).
 *
 * Fail open. This hook exits 0 on every path and writes nothing to stderr. Malformed or empty input, a
 * missing aoforge lib (a partial install: the lib is loaded lazily, so its absence is an allow), an invalid
 * `requires:` value or any exception allows. A gate that cannot decide must not stop work.
 *
 * Escape: AOFORGE_SKIP_SKILL_REQUIRES=1 in the environment Claude Code is launched from. A hook runs in
 * Claude Code's own process, so an inline command prefix never reaches it.
 *
 * See aoforge/bin/lib/skill-requires.cjs (TRD 61-02) for the lookup and the refusal text, and doctor check
 * `skill-requires` for the report-only view of the same declarations.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LIB_PATH = path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'skill-requires.cjs');
const DEFAULT_SKILLS_DIR = path.join(__dirname, '..', 'skills');

/** Used only when the lib cannot be loaded; the lib's own SKIP_ENV is the source of truth otherwise. */
const SKIP_ENV_FALLBACK = 'AOFORGE_SKIP_SKILL_REQUIRES';

/** undefined = not loaded yet; null = unavailable (fail open); else the lib. */
let lib;

function loadLib() {
  if (lib !== undefined) return lib;
  try {
    lib = require(LIB_PATH);
  } catch {
    lib = null;
  }
  return lib;
}

/**
 * The hook decision for one payload.
 *
 * @param {object} input the UserPromptExpansion or PreToolUse payload
 * @param {{env?: NodeJS.ProcessEnv, skillsDir?: string}} [opts]
 *   env        the environment the PATH lookup and the escape are read from
 *   skillsDir  the directory holding `<skill>/SKILL.md` (this plugin version's skills by default)
 * @returns {object|null} the output to write, or null to allow
 */
function run(input, { env = process.env, skillsDir = DEFAULT_SKILLS_DIR } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const event = input.hook_event_name;
  if (event !== 'UserPromptExpansion' && event !== 'PreToolUse') return null;
  if (
    event === 'UserPromptExpansion' &&
    input.expansion_type !== undefined &&
    input.expansion_type !== null &&
    input.expansion_type !== 'slash_command'
  ) {
    return null;
  }

  const l = loadLib();
  if (env[l ? l.SKIP_ENV : SKIP_ENV_FALLBACK] === '1') return null;
  if (!l) return null;

  const name = l.skillNameFromInvocation(input);
  if (!name) return null;

  const req = l.readSkillRequires(skillsDir, name);
  if (!req || !req.found || req.error || !Array.isArray(req.tools) || req.tools.length === 0) return null;

  const missing = l.missingTools(req.tools, env);
  if (missing.length === 0) return null;

  const reason = l.refusalReason(name, missing);
  if (event === 'UserPromptExpansion') return { decision: 'block', reason };
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
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
