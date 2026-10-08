'use strict';

// Fixtures for objective-directory resolution (TRD 68-02): small temp projects whose directory names are chosen to tell
// "resolved like find-objective" from "resolved by a looser local parser" (an unpadded `4-d`, a `04.10-ten` beside
// `04.1-one`, archived `01-a` beside a current `01-*`).
//
// Built on makeMilestoneProject (imported read-only from milestone-complete-fixtures.cjs, which belongs to TRD 68-01).
// Nothing here touches the repository: every project is a temp dir the caller removes with cleanup().

const { makeMilestoneProject, trdWithTasks } = require('./milestone-complete-fixtures.cjs');

// The number a directory name starts with ('04.1-one' -> '04.1'), used in the TRD file names exactly as
// makeMilestoneProject does.
const dirNumber = (dir) => /^(\d+(?:\.\d+)?)/.exec(dir)[1];

/**
 * A ROADMAP.md text with a milestone bullet and one `### Objective N: Title` section per entry of `sections`.
 * @param {string} bulletObjectivesText  the text after "Objectives " in the bullet, e.g. '4.1, 4.10' or '4–6'
 * @param {{num: string, title: string}[]} [sections]
 */
function bulletRoadmap(bulletObjectivesText, sections = []) {
  const lines = [
    '# Roadmap: Fixture',
    '',
    '## Milestones',
    '',
    `- 🚧 **v1.0 — Now** — Objectives ${bulletObjectivesText} (in progress)`,
    '',
    '## Objectives',
    '',
  ];
  for (const { num, title } of sections) lines.push(`### Objective ${num}: ${title}`, `**Goal**: ${title} goal.`);
  lines.push('');
  return lines.join('\n');
}

/**
 * A temp project with the given objective directories. Each directory holds one `<NN>-01-TRD.md`.
 * @param {object} [spec]
 * @param {string} [spec.roadmap]  ROADMAP.md text; no ROADMAP.md is written when absent
 * @param {string[]} [spec.current]  directory names under `.planning/objectives/`
 * @param {Object<string, string[]>} [spec.archived]  `{ 'v0.9': ['01-a'] }` -> `.planning/milestones/v0.9-objectives/01-a/`
 * @param {Object<string, string>} [spec.extra]  further files, `{ relPath: text }` (a README.md, a notes/ directory, ...)
 * @returns {{root: string, read: Function, exists: Function, write: Function, cleanup: Function}} the makeMilestoneProject handle
 */
function scopeProject({ roadmap, current = [], archived = {}, extra = {} } = {}) {
  const project = makeMilestoneProject(
    {
      roadmap,
      objectives: current.map((dir) => ({ dir, trds: [{ nn: '01', tasks: 1 }] })),
    },
    { roadmap: typeof roadmap === 'string', state: false },
  );
  for (const [version, dirs] of Object.entries(archived)) {
    for (const dir of dirs) {
      project.write(`.planning/milestones/${version}-objectives/${dir}/${dirNumber(dir)}-01-TRD.md`, trdWithTasks(dir, '01', 1));
    }
  }
  for (const [rel, text] of Object.entries(extra)) project.write(rel, text);
  return project;
}

module.exports = { bulletRoadmap, scopeProject };
