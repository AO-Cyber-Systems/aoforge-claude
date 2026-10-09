'use strict';

/**
 * Fixtures for `objective remove` (date and metadata preservation, TOOL-03) and the next-objective lookup of
 * `objective complete` (TOOL-04), TRD 68-04.
 *
 * Hand-built temp projects only. `objective remove` cascade-renumbers every objective above the removed one, so none of
 * these helpers ever touches this repository's own `.aoforge/`.
 *
 * objective-flags-fixtures.cjs deliberately carries no dates (a date is exactly what the old renumber pass rewrote), so
 * the dated ROADMAPs live here. `flagsProject` is imported from it read-only.
 */

const fs = require('fs');
const path = require('path');

const { flagsProject } = require('./objective-flags-fixtures.cjs');

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * A ROADMAP with, per objective, a checkbox line, a progress-table row and a `### Objective N:` section, with dates and
 * the other per-objective metadata a renumber must leave alone. The table comes before the sections, as in this
 * repository's ROADMAP, so removing the LAST section cannot swallow it.
 *
 * `extras` (the second argument) are lines appended verbatim in a `## Notes` block between the progress table and the
 * first section. They sit before the sections on purpose: a removed last section runs to the end of the file and would
 * take trailing lines with it. Lines that belong to one objective go in that objective's own `extras`.
 *
 * @param {Array<{num: number|string, name: string, done?: boolean, completed?: string, milestone?: string,
 *   plans?: string, requirements?: string, dependsOn?: number|string, trds?: string[], extras?: string[]}>} objectives
 *   `completed` is the completion date (checkbox suffix and progress-table cell); `trds` are TRD ids (`'01'`) written as
 *   `- [x] NN-01-slug-TRD.md — text (NN-01's note)` lines of the objective's section.
 * @param {string[]} [extras]
 * @returns {string}
 */
function datedRoadmap(objectives, extras = []) {
  const lines = ['# Roadmap: Dated Project', '', '## Objectives', ''];

  for (const o of objectives) {
    const suffix = o.done && o.completed ? ` (completed ${o.completed})` : '';
    lines.push(`- [${o.done ? 'x' : ' '}] Objective ${o.num}: ${o.name}${suffix}`);
  }

  lines.push(
    '',
    '## Progress',
    '',
    '| Objective | Milestone | Plans | Status | Completed |',
    '|---|---|---|---|---|'
  );
  for (const o of objectives) {
    const milestone = o.milestone || 'v1.0';
    const plans = o.plans || '0/1';
    lines.push(`| ${o.num}. ${o.name} | ${milestone} | ${plans} | ${o.done ? 'Complete' : 'Planned'} | ${o.completed || '—'} |`);
  }

  if (extras.length) lines.push('', '## Notes', '', ...extras);

  for (const o of objectives) {
    const slug = String(o.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    lines.push('', `### Objective ${o.num}: ${o.name}`, '', `**Goal**: Exercise objective ${o.num}.`);
    if (o.requirements) lines.push(`**Requirements**: ${o.requirements}`);
    if (o.dependsOn !== undefined) lines.push(`**Depends on**: Objective ${o.dependsOn}`);
    for (const id of o.trds || []) {
      const key = `${pad2(o.num)}-${id}`;
      lines.push(`- [x] ${key}-${slug}-TRD.md — text (${key}'s note)`);
    }
    for (const line of o.extras || []) lines.push(line);
  }

  return lines.join('\n') + '\n';
}

/**
 * A temp project with a ROADMAP, objective directories and a STATE.md.
 *
 * @param {object} opts
 * @param {string|null} opts.roadmap  ROADMAP.md text; `null` omits the file
 * @param {Array<{dir: string, cancelled?: boolean, trds?: string[], summaries?: string[]}>} [opts.dirs]
 *   objective directories (`trds` / `summaries` as in flagsProject); `cancelled` writes an OBJECTIVE.md with
 *   `status: cancelled`
 * @param {string} [opts.state]       STATE.md text (flagsProject's default when omitted)
 * @returns the flagsProject handle: `{root, read, mtime, cleanup}`
 */
function datedProject({ roadmap = null, dirs = [], state } = {}) {
  const opts = { roadmap, objectives: dirs };
  if (state !== undefined) opts.state = state;
  const handle = flagsProject(opts);
  for (const d of dirs) {
    if (!d.cancelled) continue;
    // Written into the returned root after it is built: flagsProject has no way to express a cancelled objective.
    fs.writeFileSync(
      path.join(handle.root, '.aoforge', 'objectives', d.dir, 'OBJECTIVE.md'),
      '---\nstatus: cancelled\n---\n\n# Cancelled objective\n',
      'utf-8'
    );
  }
  return handle;
}

/** The sorted ISO date and timestamp tokens (`2026-10-08`, `2026-10-08T12:30:00Z`) of a text: the multiset a renumber must keep. */
function isoDates(text) {
  return (String(text).match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?/g) || []).sort();
}

/** A legacy-schema STATE.md (told apart by `**Current Objective:**`), as `objective complete` advances it. */
const LEGACY_STATE = [
  '# Project State',
  '',
  '**Current Objective:** 2',
  '**Status:** In progress',
  '**Current Job:** 01',
  '**Last Activity:** 2026-01-01',
  '',
].join('\n');

module.exports = { datedRoadmap, datedProject, isoDates, LEGACY_STATE };
