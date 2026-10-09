'use strict';

/**
 * Fixtures for the `roadmap_updated` flag of `objective remove` / `objective complete` (TRD 59-05, PLMB-05).
 *
 * Hand-built temp projects only. `objective remove` cascade-renumbers every objective above the removed one, so none of
 * these helpers ever touches this repository's own `.aoforge/`.
 *
 * The ROADMAP text deliberately carries no dates and no `NN-NN` tokens: the renumber pass in `objective remove`
 * rewrites every `NN-NN` it finds for objectives above the removed one, so a date such as `2026-01-01` would change the
 * bytes for a reason unrelated to the objective under test.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * A ROADMAP with, per objective, a checkbox line, a progress-table row and a `### Objective N:` section.
 * The progress table comes before the sections, as in this repository's ROADMAP, so removing the LAST objective's
 * section cannot swallow the table.
 *
 * @param {Array<{num: number|string, name: string, done?: boolean, jobs?: string}>} objectives
 */
function roadmapFor(objectives) {
  const lines = ['# Roadmap: Flags Project', '', '## Objectives', ''];

  for (const o of objectives) {
    lines.push(`- [${o.done ? 'x' : ' '}] Objective ${o.num}: ${o.name}`);
  }

  lines.push(
    '',
    '## Progress',
    '',
    '| Objective | Milestone | Plans | Status | Completed |',
    '|---|---|---|---|---|'
  );
  for (const o of objectives) {
    const jobs = o.jobs || '0/1';
    lines.push(`| ${o.num}. ${o.name} | v1.0 | ${jobs} | ${o.done ? 'Complete' : 'Planned'} | — |`);
  }

  for (const o of objectives) {
    lines.push(
      '',
      `### Objective ${o.num}: ${o.name}`,
      '',
      `**Goal**: Exercise objective ${o.num}.`,
      `**Jobs:** ${o.jobs || '0/1'} jobs complete`
    );
  }

  return lines.join('\n') + '\n';
}

const DEFAULT_STATE = '# STATE.md\n\n**Status:** fixture\n';

/**
 * Build a temp project.
 *
 * @param {object} opts
 * @param {string|null} opts.roadmap     ROADMAP.md text; `null` omits the file
 * @param {Array<{dir: string, trds?: string[], summaries?: string[]}>} [opts.objectives]
 *        objective directories; `trds` / `summaries` are TRD ids (`'01'`) written as `<NN>-<id>-TRD.md` / `-SUMMARY.md`
 * @param {string} [opts.state]          STATE.md text
 * @returns {{root: string, read: (rel: string) => string, mtime: (rel: string) => number, cleanup: () => void}}
 *          `rel` is relative to `<root>/.aoforge`.
 */
function flagsProject(opts = {}) {
  const { roadmap = null, objectives = [], state = DEFAULT_STATE } = opts;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-flags-')));
  const planning = path.join(root, '.aoforge');
  fs.mkdirSync(path.join(planning, 'objectives'), { recursive: true });

  if (roadmap !== null) fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmap, 'utf-8');
  fs.writeFileSync(path.join(planning, 'STATE.md'), state, 'utf-8');

  for (const o of objectives) {
    const dir = path.join(planning, 'objectives', o.dir);
    fs.mkdirSync(dir, { recursive: true });
    const prefix = o.dir.match(/^(\d+(?:\.\d+)?)/)[1];
    for (const id of o.trds || []) {
      fs.writeFileSync(path.join(dir, `${prefix}-${id}-TRD.md`), `# TRD ${id}\n`, 'utf-8');
    }
    for (const id of o.summaries || []) {
      fs.writeFileSync(path.join(dir, `${prefix}-${id}-SUMMARY.md`), `# Summary ${id}\n`, 'utf-8');
    }
  }

  return {
    root,
    read: (rel) => fs.readFileSync(path.join(planning, rel), 'utf-8'),
    mtime: (rel) => fs.statSync(path.join(planning, rel)).mtimeMs,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

module.exports = { roadmapFor, flagsProject };
