'use strict';

// TRD 59-04: `milestone complete` counts only its own milestone's objectives.
//
//   Scope fallbacks (milestone-scope.cjs)
//     S1  sectionObjectives(cwd): every `### Objective N:` section that has a directory, cancelled ones flagged
//     S2  sectionObjectives(cwd): a section with no directory is left out; no ROADMAP.md is no sections
//     S3  currentDirObjectives(cwd): every directory under .planning/objectives, in number order, cancelled ones flagged
//     S4  currentDirObjectives(cwd): names come from ROADMAP sections, else from the directory slug
//
// Nothing here touches the repository's own .planning/: every project is a temp dir from the fixture builder.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const scope = require('./milestone-scope.cjs');
const { TWO_MILESTONE_SPEC, ROADMAP_TWO_MILESTONES, makeMilestoneProject } = require('./__fixtures__/milestone-complete-fixtures.cjs');

const projects = [];
function project(...args) {
  const p = makeMilestoneProject(...args);
  projects.push(p);
  return p;
}
afterEach(() => {
  while (projects.length > 0) projects.pop().cleanup();
});

const numbers = (entries) => entries.map((e) => e.number);

// ─── Scope fallbacks ──────────────────────────────────────────────────────────

test('S1. sectionObjectives: every ### Objective section that has a directory, in the selection entry shape', () => {
  const p = project();
  const got = scope.sectionObjectives(p.root);
  assert.deepEqual(numbers(got), ['4', '5', '6', '7']);
  assert.deepEqual(got.map((e) => e.name), ['D', 'E', 'F', 'G']);
  assert.deepEqual(got.map((e) => e.dir), [
    '.planning/objectives/04-d',
    '.planning/objectives/05-e',
    '.planning/objectives/06-f',
    '.planning/objectives/07-g',
  ]);
  assert.deepEqual(got.map((e) => e.status_hint), ['dir', 'dir', 'cancelled', 'dir']);
});

test('S2. sectionObjectives: a section without a directory is left out, and no ROADMAP.md means no sections', () => {
  const withExtra = project(TWO_MILESTONE_SPEC, { roadmap: `${ROADMAP_TWO_MILESTONES}### Objective 8: H\n**Goal**: H goal.\n` });
  assert.deepEqual(numbers(scope.sectionObjectives(withExtra.root)), ['4', '5', '6', '7']);

  const bare = project(TWO_MILESTONE_SPEC, { roadmap: false });
  assert.deepEqual(scope.sectionObjectives(bare.root), []);
});

test('S3. currentDirObjectives: every directory under .planning/objectives in number order, cancelled ones flagged', () => {
  const p = project();
  const got = scope.currentDirObjectives(p.root);
  assert.deepEqual(numbers(got), ['1', '2', '3', '4', '5', '6', '7', '40']);
  assert.deepEqual(got.map((e) => e.status_hint), ['dir', 'dir', 'dir', 'dir', 'dir', 'cancelled', 'dir', 'dir']);
  assert.equal(got[7].dir, '.planning/objectives/40-decoy');
});

test('S4. currentDirObjectives: names come from ROADMAP sections, else from the directory slug', () => {
  const p = project();
  const byNumber = Object.fromEntries(scope.currentDirObjectives(p.root).map((e) => [e.number, e.name]));
  assert.equal(byNumber['4'], 'D'); // a ROADMAP section names it
  assert.equal(byNumber['1'], 'a'); // no section: the slug
  assert.equal(byNumber['40'], 'decoy');

  const bare = project(TWO_MILESTONE_SPEC, { roadmap: false });
  assert.equal(scope.currentDirObjectives(bare.root).find((e) => e.number === '4').name, 'd');
});
