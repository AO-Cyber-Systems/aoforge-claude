'use strict';

// Fixtures for `milestone complete` (TRD 59-04): a project that holds two milestones' objective directories at once, the
// way this repository does, so a test can tell "counted the milestone" from "counted every directory".
//
//   v0.9 (shipped)      Objectives 1–3   -> 01-a, 02-b, 03-c   one TRD and one SUMMARY each
//   v1.0 (in progress)  Objectives 4–6   -> 04-d (2 TRDs, 3 + 2 tasks), 05-e (1 TRD, 1 task), 06-f (cancelled, no TRDs)
//   next milestone      Objective 7      -> 07-g               one TRD, no SUMMARY
//   decoy               Objective 40     -> 40-decoy           one TRD and one SUMMARY, inside no range
//
// Nothing here touches the repository: every project is a temp dir the caller removes with cleanup().

const fs = require('fs');
const os = require('os');
const path = require('path');

/** One auto task element, the same shape `taskElement` in estimate-fixtures.cjs writes. */
function taskElement(index) {
  return [
    '<task type="auto">',
    `  <name>Task ${index}: do the work</name>`,
    '  <files>src/work.js</files>',
    '  <action>Do the work described by this task.</action>',
    '  <verify>node --test</verify>',
    '  <done>Tests pass.</done>',
    '</task>',
  ].join('\n');
}

// The number a directory name starts with ('04-d' -> '04'), used in the TRD and SUMMARY file names.
const dirNumber = (dir) => /^(\d+(?:\.\d+)?)/.exec(dir)[1];

/** A TRD with valid frontmatter, a `<tasks>` wrapper and `taskCount` task elements. */
function trdWithTasks(objectiveDir, nn, taskCount) {
  const lines = ['---', `objective: ${objectiveDir}`, `trd: "${nn}"`, 'type: standard', 'wave: 1', 'depends_on: []', '---', '',
    `# TRD ${dirNumber(objectiveDir)}-${nn}: fixture`, '', '<tasks>', ''];
  for (let i = 1; i <= taskCount; i++) lines.push(taskElement(i), '');
  lines.push('</tasks>', '');
  return lines.join('\n');
}

/** A SUMMARY in the template's shape: frontmatter without `one-liner`, the H1, a blank line, then the bold one-liner. */
function templateSummary(objectiveDir, nn, oneLiner) {
  return ['---', `objective: ${objectiveDir}`, `job: "${nn}"`, 'subsystem: fixture', '---', '',
    `# Objective ${dirNumber(objectiveDir)} TRD ${nn}: Fixture Summary`, '', `**${oneLiner}**`, '',
    '## Progress', '- [x] Task 1: do the work', '', '## Self-Check: PASSED', ''].join('\n');
}

/** A SUMMARY that carries the one-liner as the frontmatter `one-liner:` key (the older shape). */
function frontmatterSummary(objectiveDir, nn, oneLiner) {
  return ['---', `objective: ${objectiveDir}`, `job: "${nn}"`, `one-liner: ${oneLiner}`, '---', '',
    `# Objective ${dirNumber(objectiveDir)} TRD ${nn}: Fixture Summary`, '', '## Self-Check: PASSED', ''].join('\n');
}

const CANCELLED_OBJECTIVE_MD = ['---', 'status: cancelled', '---', '', '# Objective 6: F', '', 'Cancelled before planning.', ''].join('\n');

const ROADMAP_TWO_MILESTONES = [
  '# Roadmap: Fixture',
  '',
  '## Milestones',
  '',
  '- ✅ **v0.9 — Old** — Objectives 1–3 (shipped 2026-01-01)',
  '- 🚧 **v1.0 — Now** — Objectives 4–6 (in progress)',
  '',
  '## Objectives',
  '',
  '### Objective 4: D',
  '**Goal**: D goal.',
  '### Objective 5: E',
  '**Goal**: E goal.',
  '### Objective 6: F',
  '**Goal**: F goal.',
  '### Objective 7: G',
  '**Goal**: G goal.',
  '',
].join('\n');

// Sections only, no `## Milestones` bullet: the shape the df-tools.test.cjs milestone tests use.
const ROADMAP_SECTIONS_ONLY = [
  '# Roadmap v1.0 Now',
  '',
  '### Objective 4: D',
  '**Goal**: D goal.',
  '### Objective 5: E',
  '**Goal**: E goal.',
  '### Objective 6: F',
  '**Goal**: F goal.',
  '',
].join('\n');

const STATE_NARRATIVE = [
  '# State',
  '',
  '**Status:** In progress',
  '**Last Activity:** 2025-01-01',
  '**Last Activity Description:** Working',
  '',
].join('\n');

const REQUIREMENTS = ['# Requirements', '', '- [ ] User auth', '- [ ] Dashboard', ''].join('\n');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// An objective is {dir, objectiveMd?, trds: [{nn, tasks, summary?}]}; `summary` is {oneLiner, style: 'template' (default)
// | 'frontmatter'} or absent (no SUMMARY file yet).
const TWO_MILESTONE_SPEC = deepFreeze({
  roadmap: ROADMAP_TWO_MILESTONES,
  state: STATE_NARRATIVE,
  requirements: REQUIREMENTS,
  objectives: [
    { dir: '01-a', trds: [{ nn: '01', tasks: 1, summary: { oneLiner: 'Old A shipped' } }] },
    { dir: '02-b', trds: [{ nn: '01', tasks: 1, summary: { oneLiner: 'Old B shipped' } }] },
    { dir: '03-c', trds: [{ nn: '01', tasks: 1, summary: { oneLiner: 'Old C shipped' } }] },
    { dir: '04-d', trds: [
      { nn: '01', tasks: 3, summary: { oneLiner: 'Alpha shipped' } },
      { nn: '02', tasks: 2, summary: { oneLiner: 'Beta shipped' } },
    ] },
    { dir: '05-e', trds: [{ nn: '01', tasks: 1, summary: { oneLiner: 'Gamma shipped', style: 'frontmatter' } }] },
    { dir: '06-f', objectiveMd: CANCELLED_OBJECTIVE_MD, trds: [] },
    { dir: '07-g', trds: [{ nn: '01', tasks: 2 }] },
    { dir: '40-decoy', trds: [{ nn: '01', tasks: 4, summary: { oneLiner: 'Decoy shipped' } }] },
  ],
});

/**
 * Writes the spec into a temp project and returns `{root, read(rel), exists(rel), write(rel, text), cleanup()}`; `rel` is
 * relative to the project root.
 * @param {object} [spec]  see TWO_MILESTONE_SPEC
 * @param {{roadmap?: boolean|string, state?: boolean|string}} [opts]  `roadmap`/`state`: true (default) writes the spec's
 *   text, a string writes that text instead, false writes no file
 */
function makeMilestoneProject(spec = TWO_MILESTONE_SPEC, { roadmap = true, state = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-milestone-complete-')));
  const planning = path.join(root, '.planning');
  const objectivesDir = path.join(planning, 'objectives');
  fs.mkdirSync(objectivesDir, { recursive: true });

  for (const objective of spec.objectives || []) {
    const dirPath = path.join(objectivesDir, objective.dir);
    fs.mkdirSync(dirPath, { recursive: true });
    if (typeof objective.objectiveMd === 'string') fs.writeFileSync(path.join(dirPath, 'OBJECTIVE.md'), objective.objectiveMd);
    const num = dirNumber(objective.dir);
    for (const trd of objective.trds || []) {
      fs.writeFileSync(path.join(dirPath, `${num}-${trd.nn}-TRD.md`), trdWithTasks(objective.dir, trd.nn, trd.tasks));
      if (trd.summary) {
        const build = trd.summary.style === 'frontmatter' ? frontmatterSummary : templateSummary;
        fs.writeFileSync(path.join(dirPath, `${num}-${trd.nn}-SUMMARY.md`), build(objective.dir, trd.nn, trd.summary.oneLiner));
      }
    }
  }

  const optional = (flag, specText, file) => {
    const text = typeof flag === 'string' ? flag : flag === true ? specText : null;
    if (typeof text === 'string') fs.writeFileSync(path.join(planning, file), text);
  };
  optional(roadmap, spec.roadmap, 'ROADMAP.md');
  optional(state, spec.state, 'STATE.md');
  if (typeof spec.requirements === 'string') fs.writeFileSync(path.join(planning, 'REQUIREMENTS.md'), spec.requirements);

  return {
    root,
    read: (rel) => fs.readFileSync(path.join(root, rel), 'utf-8'),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    write: (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

module.exports = {
  trdWithTasks,
  templateSummary,
  frontmatterSummary,
  CANCELLED_OBJECTIVE_MD,
  ROADMAP_TWO_MILESTONES,
  ROADMAP_SECTIONS_ONLY,
  STATE_NARRATIVE,
  REQUIREMENTS,
  TWO_MILESTONE_SPEC,
  makeMilestoneProject,
};
