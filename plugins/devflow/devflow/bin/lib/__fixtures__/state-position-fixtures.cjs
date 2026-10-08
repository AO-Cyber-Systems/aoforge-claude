'use strict';

/**
 * Hand-built position projects for `state advance-job` (TRD 59-02, PLMB-01).
 *
 * A "position project" is a temp project holding a STATE.md (narrative or legacy
 * schema), an optional state.json and config.json, and objectives whose TRD and
 * SUMMARY files on disk are the facts `state advance-job --objective N` reads.
 *
 *   narrativeState(opts)  -> narrative STATE.md text (no counter fields)
 *   legacyState(opts)     -> the 48-13 CHAR_STATE shape (counter fields)
 *   positionProject(spec) -> { root, read(rel), cleanup() }
 *
 * Nothing here is generated: every byte a test asserts on is written out below.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function narrativeState({ status = 'Planning objective 7', lastActivity = '2026-01-01' } = {}) {
  return [
    '# Project State',
    '',
    '**Objective complete:** 5 (gamma) — 2026-02-01',
    '**Objective complete:** 6 (delta) — 2026-02-15',
    `**Status:** ${status}`,
    `**Last Activity:** ${lastActivity}`,
    '',
    '## Decisions',
    '',
    '- Keep the narrative schema; counters are not carried in STATE.md.',
    '',
  ].join('\n');
}

function legacyState({
  objective = 7,
  currentJob = 2,
  totalJobs = 4,
  status = 'Planning',
} = {}) {
  return [
    '# Project State',
    '',
    '## Current Position',
    '',
    `**Current Objective:** ${objective}`,
    `**Current Job:** ${currentJob}`,
    `**Total Jobs in Objective:** ${totalJobs}`,
    `**Status:** ${status}`,
    '**Last Activity:** 2026-01-01',
    '**Progress:** [░░░░░░░░░░] 0%',
    '',
    '### Blockers/Concerns',
    '',
    '- API key missing',
    '',
  ].join('\n');
}

function trdText(nn, mm, slug) {
  const name = slug || 'work';
  return [
    '---',
    `objective: ${nn}-fixture`,
    `trd: "${mm}"`,
    'type: standard',
    'wave: 1',
    'depends_on: []',
    'files_modified: []',
    'autonomous: true',
    '---',
    '',
    `# TRD ${nn}-${mm}: ${name}`,
    '',
    '<tasks>',
    '<task type="auto">',
    `  <name>Task 1: ${name}</name>`,
    '  <files>src/x.js</files>',
    '  <action>Do the work.</action>',
    '  <verify>true</verify>',
    '  <done>Done.</done>',
    '</task>',
    '</tasks>',
    '',
  ].join('\n');
}

/**
 * @param {object} spec
 * @param {string} [spec.state]      STATE.md text; omitted -> no STATE.md
 * @param {object} [spec.stateJson]  state.json value; omitted -> no state.json
 * @param {object} [spec.config]     config.json value; omitted -> no config.json
 * @param {Array}  [spec.objectives] [{ dir: '07-alpha', trds: [{ nn: '01', slug: 'beta' }], summaries: ['01'] }]
 *   `nn` is the TRD number inside the objective; the objective number is the
 *   numeric prefix of `dir` (`07` in `07-alpha`). A TRD with a `slug` is
 *   written `NN-MM-<slug>-TRD.md`, otherwise `NN-MM-TRD.md`. Each summary number
 *   writes `NN-MM-SUMMARY.md`.
 */
function positionProject({ state, stateJson, config, objectives = [] } = {}) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'df-position-'));
  const root = fs.realpathSync(raw);
  const planning = path.join(root, '.planning');
  fs.mkdirSync(planning, { recursive: true });

  if (state !== undefined) fs.writeFileSync(path.join(planning, 'STATE.md'), state, 'utf-8');
  if (stateJson !== undefined) {
    fs.writeFileSync(path.join(planning, 'state.json'), JSON.stringify(stateJson, null, 2), 'utf-8');
  }
  if (config !== undefined) {
    fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  }

  for (const obj of objectives) {
    const dir = path.join(planning, 'objectives', obj.dir);
    fs.mkdirSync(dir, { recursive: true });
    const prefix = obj.dir.match(/^(\d+(?:\.\d+)?)/)[1];
    for (const trd of obj.trds || []) {
      const file = trd.slug ? `${prefix}-${trd.nn}-${trd.slug}-TRD.md` : `${prefix}-${trd.nn}-TRD.md`;
      fs.writeFileSync(path.join(dir, file), trdText(prefix, trd.nn, trd.slug), 'utf-8');
    }
    for (const nn of obj.summaries || []) {
      fs.writeFileSync(path.join(dir, `${prefix}-${nn}-SUMMARY.md`), `# Summary ${prefix}-${nn}\n`, 'utf-8');
    }
  }

  return {
    root,
    read(rel) {
      return fs.readFileSync(path.join(planning, rel), 'utf-8');
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { narrativeState, legacyState, positionProject };
