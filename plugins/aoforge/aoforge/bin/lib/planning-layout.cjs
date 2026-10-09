'use strict';

// planning-layout.cjs — W066 legacy-planning-dir (objective 72, TRD 72-05, INST-03).
//
// A project's planning directory is `.aoforge/` (NAMES.planningDir). For one release AOForge still reads a project
// that has only the legacy directory (LEGACY.planningDir), through compat.cjs. W066 tells the user how to leave it:
//
//   legacy  only the legacy directory exists: run migration 0012 (or start a session, the upgrade hook moves it)
//   both    both exist (an unfinished move): the legacy one is ignored, so whatever is still only there is invisible
//
// `validate health` reports the issue as a warning (Check 21); `init plan-objective` and `init execute-objective` put
// the same text, as one line, in `advisories_warnings`. Nothing here caches a result: migration 0012 moves the
// directory mid-process. Every directory name comes from legacy-names.cjs.

const { isLegacyPlanning, bothPlanningDirs } = require('./compat.cjs');
const { NAMES, LEGACY, SHIM_REMOVAL } = require('./legacy-names.cjs');

const CODE = 'W066';
const MIGRATION_ID = '0012';

/**
 * The W066 issue for `root`, or null when the project uses only the new directory (or has none).
 * @param {string} root
 * @returns {{code: string, message: string, fix: string, layout: 'legacy'|'both'}|null}
 */
function legacyPlanningIssue(root) {
  if (bothPlanningDirs(root)) {
    return {
      code: CODE,
      layout: 'both',
      message: `legacy-planning-dir: ${NAMES.planningDir}/ and ${LEGACY.planningDir}/ both exist; `
        + `the legacy one is ignored (AOForge reads ${NAMES.planningDir}/ only)`,
      fix: `Move anything you still need from ${LEGACY.planningDir}/ into ${NAMES.planningDir}/, `
        + `then remove the legacy directory ${LEGACY.planningDir}/`,
    };
  }
  if (isLegacyPlanning(root)) {
    return {
      code: CODE,
      layout: 'legacy',
      message: `legacy-planning-dir: this project still uses the legacy planning directory ${LEGACY.planningDir}/ `
        + `instead of ${NAMES.planningDir}/; AOForge reads it for one release (until ${SHIM_REMOVAL})`,
      fix: `Run \`aof-tools upgrade --apply --only ${MIGRATION_ID}\` (or start a session: the upgrade hook moves it)`,
    };
  }
  return null;
}

/** The issue as one advisory line: `W066 <message> (fix: <fix>)`. */
function advisoryLine(issue) {
  return `${issue.code} ${issue.message} (fix: ${issue.fix})`;
}

module.exports = { CODE, MIGRATION_ID, legacyPlanningIssue, advisoryLine };
