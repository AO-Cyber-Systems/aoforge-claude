'use strict';

// Doctor check: legacy-planning-layout (objective 72, TRD 72-15, INST-03).
//
// A project the rename has not reached yet. Two advisories, each naming the migration that fixes it:
//
//   W066  legacy-planning-dir   only the legacy planning directory exists (AOForge reads it for one release):
//                               fix_command `aof-tools upgrade --apply --only 0012`. Or both directories exist (an
//                               unfinished move; the legacy one is ignored): no command, the user decides what to keep.
//   W067  legacy-config-key     config.json records its upgrades only under the legacy stamp key:
//                               fix_command `aof-tools upgrade --apply --only 0013`.
//
// The detection is planning-layout.cjs (legacyPlanningIssue, legacyConfigKeyIssue), the same functions validate health
// Checks 21 and 22 call, so the doctor and validate report the same text; validate's output is never parsed here.
// This check OWNS W066/W067 in the doctor: 22-validate-health.cjs lists them in DEFERRED, so each shows once, here.
// 21-pending-migrations also reports 0012/0013 as pending upgrade migrations (it reports any pending migration); this
// check adds the W-code view and the exact command for each.
//
// REPORT-ONLY. It never exports `fix`: the directory move is a `git mv` (an index change the user commits, with the
// migration's own backup and dirty-tree guards), and the upgrade hook applies both migrations on the next session.

const { legacyPlanningIssue, legacyConfigKeyIssue, MIGRATION_ID, CONFIG_MIGRATION_ID } = require('../planning-layout.cjs');
const { NAMES } = require('../legacy-names.cjs');

const DF_TOOLS = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const applyOnly = (id) => `${DF_TOOLS} upgrade --apply --only ${id}`;

/** [{code, message, fix, fix_command?, layout?}] for the project, W066 first. */
function findingsFor(root) {
  const out = [];
  const layout = legacyPlanningIssue(root);
  if (layout) {
    const f = { code: layout.code, layout: layout.layout, message: layout.message, fix: layout.fix };
    if (layout.layout === 'legacy') f.fix_command = applyOnly(MIGRATION_ID);
    out.push(f);
  }
  const key = legacyConfigKeyIssue(root);
  if (key) out.push({ code: key.code, message: key.message, fix: key.fix, fix_command: applyOnly(CONFIG_MIGRATION_ID) });
  return out;
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const findings = findingsFor(ctx.projectRoot);
  const details = { findings };
  if (findings.length === 0) {
    return {
      severity: 'ok',
      finding: `the project uses ${NAMES.planningDir}/ and the "${NAMES.configKey}" config key`,
      fixable: false,
      details,
    };
  }

  // A finding with no command (both directories) carries its manual fix in the line itself.
  const finding = findings
    .map((f) => (f.fix_command ? `${f.code} ${f.message}` : `${f.code} ${f.message} (fix: ${f.fix})`))
    .join('; ');
  const result = { severity: 'warn', finding, fixable: false, details };
  const commands = findings.filter((f) => f.fix_command).map((f) => f.fix_command);
  if (commands.length) result.fix_command = commands.join(' && ');
  return result;
}

module.exports = {
  id: 'legacy-planning-layout',
  title: 'Project on the legacy planning directory or config key',
  scope: 'project',
  run,
};
