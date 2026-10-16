'use strict';

// Doctor check: legacy-planning-layout (objective 72, TRD 72-15, INST-03; objective 78, TRD 78-01, SC-3/SC-4).
//
// A project the rename has not fully reached. Three advisories, each naming its manual fix or AOForge 3.0.x (the last
// release line with migrations 0012-0014):
//
//   W066  legacy-planning-dir     both planning directories exist (the legacy one is ignored): the user decides what
//                                 to keep. A legacy-only project never reaches this check: doctor-cli resolves no
//                                 project for it and prints the one legacy-layout message as a note instead (a root
//                                 handed over directly still gets W066 with that message's fix).
//   W067  legacy-config-key       `.aoforge/config.json` carries the pre-rename stamp key: alone (rename it) or beside
//                                 the new one (delete it; 3.1 never merges or removes it)
//   W069  legacy-claude-md-block  the project CLAUDE.md holds a managed block under the pre-rename markers (rename the
//                                 two marker comments; the next upgrade refreshes the block)
//
// KEEP, report-only (decided in TRD 78-01). A project still on the pre-rename directory, a stale config key or old
// CLAUDE.md markers is exactly the "old layout" SC-4 must name; the detection reads two directories and two files
// and makes nothing work under the old name. Every fix is a manual edit or the 3.0.x path, so there is no single
// command: no fix_command, and each finding carries its fix text in the line.
//
// The detection is planning-layout.cjs, the same functions validate health Checks 21-23 call, so the doctor and
// validate report the same text; validate's output is never parsed here. This check OWNS W066/W067/W069 in the
// doctor: 22-validate-health.cjs lists them in DEFERRED, so each shows once, here.

const { legacyPlanningIssue, legacyConfigKeyIssue, legacyClaudeMdIssue } = require('../planning-layout.cjs');
const { NAMES } = require('../legacy-names.cjs');

/** [{code, message, fix, layout?}] for the project: W066, then W067, then W069. */
function findingsFor(root) {
  const out = [];
  const layout = legacyPlanningIssue(root);
  if (layout) out.push({ code: layout.code, layout: layout.layout, message: layout.message, fix: layout.fix });
  for (const issue of [legacyConfigKeyIssue(root), legacyClaudeMdIssue(root)]) {
    if (issue) out.push({ code: issue.code, message: issue.message, fix: issue.fix });
  }
  return out;
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const findings = findingsFor(ctx.projectRoot);
  const details = { findings };
  if (findings.length === 0) {
    return {
      severity: 'ok',
      finding: `the project uses ${NAMES.planningDir}/, the "${NAMES.configKey}" config key and ${NAMES.blockTag} markers`,
      fixable: false,
      details,
    };
  }

  const finding = findings.map((f) => `${f.code} ${f.message} (fix: ${f.fix})`).join('; ');
  return { severity: 'warn', finding, fixable: false, details };
}

module.exports = {
  id: 'legacy-planning-layout',
  title: 'Project on the pre-rename planning directory, config key or CLAUDE.md markers',
  scope: 'project',
  run,
};
