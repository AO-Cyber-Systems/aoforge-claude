'use strict';

// TRD 59-04: `milestone complete` counts only its own milestone's objectives.
//
//   Scope fallbacks (milestone-scope.cjs)
//     S1  sectionObjectives(cwd): every `### Objective N:` section that has a directory, cancelled ones flagged
//     S2  sectionObjectives(cwd): a section with no directory is left out; no ROADMAP.md is no sections
//     S3  currentDirObjectives(cwd): every directory under .planning/objectives, in number order, cancelled ones flagged
//     S4  currentDirObjectives(cwd): names come from ROADMAP sections, else from the directory slug
//
//   `milestone complete` (spawns the real binary, fake HOME)
//     1   v1.0 counts objectives 4 and 5 only: stats, cancelled and scope_source
//     2   the base MILESTONES.md entry: counts line and exactly the milestone's accomplishments
//     3   the <tasks> wrapper is never counted as a task
//     4   no bullet for the version: every ROADMAP section that has a directory (roadmap sections)
//     5   no ROADMAP.md: every current objective directory (objective directories)
//     6   --archive-objectives moves only the milestone's directories
//     7   state_updated is true only when STATE.md's bytes changed (PLMB-05)
//     8   a template placeholder one-liner contributes nothing
//     9   the scope is exact: 40-decoy is objective 40, not 4
//     10  a milestone whose objectives have no directories is a truthful zero
//
// Nothing here touches the repository's own .planning/: every project is a temp dir from the fixture builder.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scope = require('./milestone-scope.cjs');
const {
  TWO_MILESTONE_SPEC,
  ROADMAP_TWO_MILESTONES,
  ROADMAP_SECTIONS_ONLY,
  STATE_NARRATIVE,
  templateSummary,
  makeMilestoneProject,
} = require('./__fixtures__/milestone-complete-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

const projects = [];
const homes = [];
function project(...args) {
  const p = makeMilestoneProject(...args);
  projects.push(p);
  return p;
}
afterEach(() => {
  while (projects.length > 0) projects.pop().cleanup();
  while (homes.length > 0) fs.rmSync(homes.pop(), { recursive: true, force: true });
});

/** Runs `df-tools milestone complete <args>` against the project with a fake HOME; `json` is the parsed stdout. */
function complete(p, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-milestone-home-'));
  homes.push(home);
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', p.root, 'milestone', 'complete', ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, `milestone complete failed: ${r.stderr}`);
  return { stdout: r.stdout, json: JSON.parse(r.stdout) };
}

const withObjective = (dir, objective) => ({ ...TWO_MILESTONE_SPEC, objectives: [{ dir, ...objective }] });

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

// ─── milestone complete ───────────────────────────────────────────────────────

const MILESTONES = '.planning/MILESTONES.md';

test('1. milestone complete v1.0 counts only the objectives its ROADMAP bullet names', () => {
  const p = project();
  const { json } = complete(p, ['v1.0', '--name', 'Now']);
  assert.equal(json.version, 'v1.0');
  assert.equal(json.name, 'Now');
  assert.equal(json.objectives, 2);
  assert.deepEqual(json.objective_numbers, ['4', '5']);
  assert.equal(json.jobs, 3);
  assert.equal(json.tasks, 6);
  assert.deepEqual(json.cancelled, ['6']);
  assert.deepEqual(json.absent, []);
  assert.equal(json.scope_source, 'milestone bullet');
  assert.deepEqual(json.accomplishments, ['Alpha shipped', 'Beta shipped', 'Gamma shipped']);
});

test('2. the base MILESTONES.md entry counts the milestone and lists exactly its accomplishments', () => {
  const p = project();
  complete(p, ['v1.0', '--name', 'Now']);
  const text = p.read(MILESTONES);
  assert.ok(text.includes('**Objectives completed:** 2 objectives (4, 5), 3 plans, 6 tasks'), text);
  const list = text.split('**Key accomplishments:**\n')[1].split('\n\n---')[0];
  assert.equal(list, '- Alpha shipped\n- Beta shipped\n- Gamma shipped');
  for (const stranger of ['Old A', 'Old B', 'Old C', 'Decoy']) assert.ok(!text.includes(stranger), `${stranger} leaked into the entry`);
});

test('3. a TRD with the <tasks> wrapper and three task elements counts 3 tasks', () => {
  const p = project(withObjective('04-d', { trds: [{ nn: '01', tasks: 3, summary: { oneLiner: 'Alpha shipped' } }] }));
  assert.ok(p.read('.planning/objectives/04-d/04-01-TRD.md').includes('<tasks>'), 'fixture lost its wrapper');
  const { json } = complete(p, ['v1.0']);
  assert.equal(json.jobs, 1);
  assert.equal(json.tasks, 3);
});

test('4. a version with no ROADMAP bullet takes every ### Objective section that has a directory', () => {
  const p = project(TWO_MILESTONE_SPEC, { roadmap: ROADMAP_SECTIONS_ONLY });
  const { json } = complete(p, ['v1.0', '--name', 'Now']);
  assert.equal(json.scope_source, 'roadmap sections');
  assert.deepEqual(json.objective_numbers, ['4', '5']);
  assert.deepEqual(json.cancelled, ['6']);
  assert.equal(json.jobs, 3);
  assert.equal(json.tasks, 6);
});

test('5. no ROADMAP.md takes every current objective directory', () => {
  const p = project(TWO_MILESTONE_SPEC, { roadmap: false });
  const { json } = complete(p, ['v1.0']);
  assert.equal(json.scope_source, 'objective directories');
  assert.deepEqual(json.objective_numbers, ['1', '2', '3', '4', '5', '7', '40']);
  assert.deepEqual(json.cancelled, ['6']);
  assert.equal(json.objectives, 7);
});

test('6. --archive-objectives moves only the milestone\'s directories', () => {
  const p = project();
  const { json } = complete(p, ['v1.0', '--archive-objectives']);
  assert.equal(json.archived.objectives, true);
  for (const dir of ['04-d', '05-e', '06-f']) {
    assert.ok(p.exists(`.planning/milestones/v1.0-objectives/${dir}`), `${dir} should be archived`);
    assert.ok(!p.exists(`.planning/objectives/${dir}`), `${dir} should have left objectives/`);
  }
  for (const dir of ['01-a', '02-b', '03-c', '07-g', '40-decoy']) {
    assert.ok(p.exists(`.planning/objectives/${dir}`), `${dir} must stay`);
    assert.ok(!p.exists(`.planning/milestones/v1.0-objectives/${dir}`), `${dir} must not be archived`);
  }
});

test('7. state_updated is true only when STATE.md\'s bytes changed', () => {
  const stateRel = '.planning/STATE.md';

  // No Status / Last Activity fields: nothing to replace, so nothing is written and nothing is claimed.
  const bare = project(TWO_MILESTONE_SPEC, { state: '# State\n\nNo tracked fields here.\n' });
  const past = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(bare.root, stateRel), past, past);
  const beforeBytes = bare.read(stateRel);
  const beforeMtime = fs.statSync(path.join(bare.root, stateRel)).mtimeMs;
  assert.equal(complete(bare, ['v1.0']).json.state_updated, false);
  assert.equal(bare.read(stateRel), beforeBytes);
  assert.equal(fs.statSync(path.join(bare.root, stateRel)).mtimeMs, beforeMtime, 'STATE.md was rewritten');

  // With the fields it changes, and says so.
  const tracked = project(TWO_MILESTONE_SPEC, { state: STATE_NARRATIVE });
  assert.equal(complete(tracked, ['v1.0']).json.state_updated, true);
  assert.ok(tracked.read(stateRel).includes('**Status:** v1.0 milestone complete'));

  // The same day again: already current, so nothing changes.
  assert.equal(complete(tracked, ['v1.0']).json.state_updated, false);

  // No STATE.md at all.
  const none = project(TWO_MILESTONE_SPEC, { state: false });
  assert.equal(complete(none, ['v1.0']).json.state_updated, false);
  assert.ok(!none.exists(stateRel));
});

test('8. a one-liner that is still the template placeholder contributes nothing', () => {
  const placeholder = '[Substantive one-liner describing outcome - NOT "objective complete" or "implementation finished"]';
  // A placeholder next to a real one-liner: only the real one is an accomplishment.
  const mixed = project(withObjective('04-d', { trds: [
    { nn: '01', tasks: 1, summary: { oneLiner: placeholder } },
    { nn: '02', tasks: 1, summary: { oneLiner: 'Beta shipped' } },
  ] }));
  assert.ok(mixed.read('.planning/objectives/04-d/04-01-SUMMARY.md').includes(`**${placeholder}**`), 'fixture lost its placeholder');
  assert.deepEqual(complete(mixed, ['v1.0']).json.accomplishments, ['Beta shipped']);

  // A placeholder alone: nothing recorded.
  const alone = project(withObjective('04-d', { trds: [{ nn: '01', tasks: 1, summary: { oneLiner: placeholder } }] }));
  assert.deepEqual(complete(alone, ['v1.0']).json.accomplishments, []);
  assert.ok(alone.read(MILESTONES).includes('- (none recorded)'));
});

test('9. the scope is exact: 40-decoy shares a leading digit with 4 but is objective 40', () => {
  // The bullet names objective 4 only, so a prefix match on "4" would sweep in 40-decoy (4 tasks, "Decoy shipped").
  const roadmap = ROADMAP_TWO_MILESTONES.replace('Objectives 4–6', 'Objectives 4');
  assert.notEqual(roadmap, ROADMAP_TWO_MILESTONES, 'fixture bullet not rewritten');
  const p = project(TWO_MILESTONE_SPEC, { roadmap });
  const { json } = complete(p, ['v1.0', '--archive-objectives']);
  assert.deepEqual(json.objective_numbers, ['4']);
  assert.equal(json.jobs, 2);
  assert.equal(json.tasks, 5);
  assert.deepEqual(json.accomplishments, ['Alpha shipped', 'Beta shipped']);
  assert.ok(p.exists('.planning/objectives/40-decoy'), '40-decoy must not be archived');
  assert.ok(!p.exists('.planning/milestones/v1.0-objectives/40-decoy'));
  assert.ok(p.exists('.planning/objectives/05-e'), '05-e is outside this bullet and must stay');
});

test('10. a milestone whose objectives have no directory is a truthful zero', () => {
  const roadmap = ROADMAP_TWO_MILESTONES.replace('Objectives 4–6', 'Objectives 90–91');
  const p = project(TWO_MILESTONE_SPEC, { roadmap });
  const { json } = complete(p, ['v1.0']);
  assert.equal(json.objectives, 0);
  assert.deepEqual(json.objective_numbers, []);
  assert.deepEqual(json.absent, ['90', '91']);
  assert.ok(p.read(MILESTONES).includes('**Objectives completed:** 0 objectives, 0 plans, 0 tasks'));
});

// templateSummary is exercised through the fixture project above; this guards the helper's contract directly.
test('fixture. templateSummary writes the bold one-liner under the H1 and no frontmatter one-liner', () => {
  const text = templateSummary('04-d', '01', 'Alpha shipped');
  assert.ok(/^# Objective 04 TRD 01: .*\n\n\*\*Alpha shipped\*\*\n/m.test(text));
  assert.ok(!/^one-liner:/m.test(text));
});
