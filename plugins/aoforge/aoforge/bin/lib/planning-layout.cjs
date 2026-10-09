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
//
// W067 legacy-config-key (TRD 72-08) lives here too: config.json records its upgrades only under the legacy stamp key,
// and migration 0013 renames it. validate health Check 22 and the doctor's legacy-planning-layout check (TRD 72-15,
// which owns W066/W067 in the doctor) both call legacyConfigKeyIssue, so the two report the same text.

const fs = require('fs');
const path = require('path');
const { isLegacyPlanning, bothPlanningDirs, planningRoot, planningRel } = require('./compat.cjs');
const { NAMES, LEGACY, SHIM_REMOVAL } = require('./legacy-names.cjs');

const CODE = 'W066';
const MIGRATION_ID = '0012';
const CONFIG_CODE = 'W067';
const CONFIG_MIGRATION_ID = '0013';

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

/**
 * The W067 issue for `root`, or null. Only the legacy stamp key present (both keys: the runner reads the new one and
 * 0013 merges them, so that is not W067). An absent or unreadable config.json is validate's Check 3 (E005/W003), so
 * it is null here.
 * @param {string} root
 * @returns {{code: string, message: string, fix: string}|null}
 */
function legacyConfigKeyIssue(root) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(planningRoot(root), 'config.json'), 'utf-8'));
  } catch {
    return null;
  }
  const has = (k) => cfg && typeof cfg === 'object' && !Array.isArray(cfg) && Object.prototype.hasOwnProperty.call(cfg, k);
  if (!has(LEGACY.configKey) || has(NAMES.configKey)) return null;
  return {
    code: CONFIG_CODE,
    message: `legacy-config-key: ${planningRel(root, 'config.json')} records its upgrades under the legacy "${LEGACY.configKey}" `
      + `key instead of "${NAMES.configKey}"; AOForge reads it for one release (until ${SHIM_REMOVAL})`,
    fix: `Run \`aof-tools upgrade --apply --only ${CONFIG_MIGRATION_ID}\` (or start a session: the upgrade hook renames it)`,
  };
}

/** The issue as one advisory line: `W066 <message> (fix: <fix>)`. */
function advisoryLine(issue) {
  return `${issue.code} ${issue.message} (fix: ${issue.fix})`;
}

module.exports = {
  CODE,
  MIGRATION_ID,
  CONFIG_CODE,
  CONFIG_MIGRATION_ID,
  legacyPlanningIssue,
  legacyConfigKeyIssue,
  advisoryLine,
};
