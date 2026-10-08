'use strict';

// Hand-built `.planning` trees for calibration-inputs tests (TRD 57-02). Literal TRD, SUMMARY and STATE_ARCHIVE text
// written into mkdtemp directories: no generated data, no real repository, no ~/.claude.
//
// spec = {
//   name,                                   // project directory name (the collectProject label)
//   objectives: [{ dir, trds: [{
//     nn, slug,                             // TRD number ('01') and file slug
//     frontmatter: { type, autonomous, gap_closure },   // only the keys given are written
//     tasks: [{ name, type, tdd, files }],  // type defaults to 'auto'; tdd true|false|undefined; files array|string
//     summary: { duration, completed, tokens_input, ... } | null,   // keys are written in the order given
//     summaryName,                          // override the SUMMARY file name
//     noTrd,                                // true: write the SUMMARY only (a summary whose TRD is missing)
//   }] }],
//   stateArchiveRows: ['| Objective 56 P01 | 11min | 3 tasks | 16 files |'],   // omit: no STATE_ARCHIVE.md
//   stateJson: { metrics_log: [...] },      // omit: no state.json
// }

const fs = require('fs');
const os = require('os');
const path = require('path');

function objectiveNumber(dir) {
  const m = /^(\d+(?:\.\d+)?)/.exec(dir);
  return m ? m[1] : dir;
}

function frontmatterLines(obj) {
  return Object.keys(obj).map((k) => {
    const v = obj[k];
    if (k === 'token_model' && typeof v === 'string') return `${k}: "${v}"`;
    return `${k}: ${v}`;
  });
}

function taskElement(task) {
  const type = task.type || 'auto';
  const tdd = task.tdd === true ? ' tdd="true"' : task.tdd === false ? ' tdd="false"' : '';
  const files = Array.isArray(task.files) ? task.files.join(', ') : (task.files || '');
  return [
    `<task type="${type}"${tdd}>`,
    `  <name>${task.name}</name>`,
    `  <files>${files}</files>`,
    '  <action>Do the work described by this task.</action>',
    '  <verify>node --test</verify>',
    '  <done>Tests pass.</done>',
    '</task>',
  ].join('\n');
}

function trdText(dir, trd) {
  const fm = trd.frontmatter || {};
  const lines = ['---', `objective: ${dir}`, `trd: "${trd.nn}"`];
  for (const key of ['type', 'autonomous', 'gap_closure']) {
    if (fm[key] !== undefined) lines.push(`${key}: ${fm[key]}`);
  }
  lines.push('wave: 1', 'depends_on: []', '---', '', `# TRD ${dir}-${trd.nn}: ${trd.slug}`, '', '<tasks>', '');
  for (const task of trd.tasks || []) lines.push(taskElement(task), '');
  lines.push('</tasks>', '');
  return lines.join('\n');
}

function summaryText(dir, trd, summary) {
  const lines = ['---', `objective: ${dir}`, `job: "${trd.nn}"`, ...frontmatterLines(summary), '---', '',
    `# Objective ${dir} TRD ${trd.nn} Summary`, '', 'Work was done.', ''];
  return lines.join('\n');
}

function archiveText(rows) {
  return ['# State Archive', '', '## Decisions', '', '- none', '', '## Performance Metrics', '',
    '| Objective | Duration | Tasks | Files |', '|-----------|----------|-------|-------|', ...rows, ''].join('\n');
}

/** Writes the spec into `<mkdtemp>/<name>` and returns that realpath'd root. Pair with removeCalibrationProject. */
function makeCalibrationProject(spec) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-calibration-')));
  const root = path.join(parent, spec.name || 'project');
  const objectivesDir = path.join(root, '.planning', 'objectives');
  fs.mkdirSync(objectivesDir, { recursive: true });
  for (const objective of spec.objectives || []) {
    const dirPath = path.join(objectivesDir, objective.dir);
    fs.mkdirSync(dirPath, { recursive: true });
    const num = objectiveNumber(objective.dir);
    for (const trd of objective.trds || []) {
      if (!trd.noTrd) {
        fs.writeFileSync(path.join(dirPath, `${num}-${trd.nn}-${trd.slug || 'work'}-TRD.md`), trdText(objective.dir, trd));
      }
      if (trd.summary) {
        fs.writeFileSync(path.join(dirPath, trd.summaryName || `${num}-${trd.nn}-SUMMARY.md`),
          summaryText(objective.dir, trd, trd.summary));
      }
    }
  }
  if (Array.isArray(spec.stateArchiveRows)) {
    fs.writeFileSync(path.join(root, '.planning', 'STATE_ARCHIVE.md'), archiveText(spec.stateArchiveRows));
  }
  if (spec.stateJson) {
    fs.writeFileSync(path.join(root, '.planning', 'state.json'), JSON.stringify(spec.stateJson, null, 2) + '\n');
  }
  return fs.realpathSync(root);
}

/** Removes the mkdtemp parent that makeCalibrationProject created for `root`. */
function removeCalibrationProject(root) {
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
}

function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec));
}

// Tests 1-6 of calibration-inputs.test.cjs; 57-05 reuses it as its second project. 55-old/02 is a gap-closure,
// non-autonomous TRD whose SUMMARY (`~45min`) outranks its metric row (12min); 56-new/02 has no SUMMARY, so its minutes
// come from its metric row.
const ALPHA_SPEC = {
  name: 'alpha',
  objectives: [
    {
      dir: '55-old',
      trds: [
        {
          nn: '01', slug: 'parser', frontmatter: { type: 'standard' },
          tasks: [
            { name: 'Task 1: parser', type: 'auto', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] },
            { name: 'Task 2: guide', type: 'auto', files: ['docs/guide.md'] },
          ],
          summary: { duration: '9min', completed: '2026-09-01' },
        },
        {
          nn: '02', slug: 'checkpointed', frontmatter: { type: 'standard', autonomous: false, gap_closure: true },
          tasks: [
            { name: 'Task 1: skill', type: 'auto', files: ['skills/x/SKILL.md'] },
            { name: 'Task 2: verify', type: 'checkpoint:human-verify', files: [] },
          ],
          summary: { duration: '~45min', completed: '2026-09-02' },
        },
      ],
    },
    {
      dir: '56-new',
      trds: [
        {
          nn: '01', slug: 'tokens', frontmatter: { type: 'tdd' },
          tasks: [
            { name: 'Task 1: reader', type: 'auto', files: ['lib/r.cjs', 'lib/r.test.cjs'] },
            { name: 'Task 2: stamp', type: 'auto', files: ['lib/s.cjs'] },
          ],
          summary: {
            duration: '8min', completed: '2026-10-05',
            tokens_input: 140747, tokens_output: 1370, tokens_cache_read: 121144, tokens_cache_write: 19596,
            token_model: 'claude-opus-5-5',
          },
        },
        {
          nn: '02', slug: 'pending', frontmatter: { type: 'standard' },
          tasks: [{ name: 'Task 1: config', type: 'auto', files: ['package.json'] }],
          summary: null,
        },
      ],
    },
  ],
  stateArchiveRows: [
    '| Objective 55 P02 | 12min | 2 tasks | 3 files |',
    '| Objective 56 P01 | 11min | 3 tasks | 16 files |',
    '| Objective 56 P02 | 7min | 1 tasks | 2 files |',
  ],
};

module.exports = { makeCalibrationProject, removeCalibrationProject, cloneSpec, ALPHA_SPEC };
