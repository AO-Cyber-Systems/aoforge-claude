'use strict';

// TRD 59-04: `milestone complete` counts only its own milestone's objectives.
//
//   Scope fallbacks (milestone-scope.cjs)
//     S1  sectionObjectives(cwd): every `### Objective N:` section that has a directory, cancelled ones flagged
//     S2  sectionObjectives(cwd): a section with no directory is left out; no ROADMAP.md is no sections
//     S3  currentDirObjectives(cwd): every directory under .aoforge/objectives, in number order, cancelled ones flagged
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
//   `milestone complete --dry-run` (TRD 68-01, task 2)
//     D1  prints the plan to stderr, writes nothing, creates no directory
//     D2  the JSON carries the real run's counts and would_write
//     D3  milestone_entry is the text a real run adds
//     D4  the audit and --archive-objectives moves are listed, not performed
//     D5  parity: a real run's written/moved/kept equal the dry run's would_*
//     D6  a STATE.md that would not change is not planned
//
//   `milestone complete` run twice (TRD 68-01, task 3)
//     R7  one MILESTONES.md entry and the first run's archive bytes survive a second run
//     R8  an archive is never overwritten, even when ROADMAP.md changed in between
//     R9  1.0 and v1.0 name one milestone: one entry, one archive set
//     R10 an entry `milestone put` wrote survives byte for byte
//     R11 a legacy `## 1.0` entry counts; a `## v1.0.1` entry does not
//     R12 --archive-objectives twice moves nothing; an occupied destination is kept, not a crash
//     R13 an audit file with an occupied destination stays where it is
//
// Nothing here touches the repository's own .aoforge/: every project is a temp dir from the fixture builder.

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
  AUDIT_V1_0,
  MILESTONES_WITH_PUT_ENTRY,
  MILESTONES_LEGACY_UNPREFIXED,
  MILESTONES_PATCH_ONLY,
  templateSummary,
  makeMilestoneProject,
  planningTree,
} = require('./__fixtures__/milestone-complete-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

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

/** Runs `aof-tools milestone complete <args>` against the project with a fake HOME; returns `{status, stdout, stderr}`. */
function completeRaw(p, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-milestone-home-'));
  homes.push(home);
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', p.root, 'milestone', 'complete', ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Like completeRaw, but asserts exit 0; `json` is the parsed stdout. */
function complete(p, args) {
  const r = completeRaw(p, args);
  assert.equal(r.status, 0, `milestone complete failed: ${r.stderr}`);
  return { stdout: r.stdout, stderr: r.stderr, json: JSON.parse(r.stdout) };
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
    '.aoforge/objectives/04-d',
    '.aoforge/objectives/05-e',
    '.aoforge/objectives/06-f',
    '.aoforge/objectives/07-g',
  ]);
  assert.deepEqual(got.map((e) => e.status_hint), ['dir', 'dir', 'cancelled', 'dir']);
});

test('S2. sectionObjectives: a section without a directory is left out, and no ROADMAP.md means no sections', () => {
  const withExtra = project(TWO_MILESTONE_SPEC, { roadmap: `${ROADMAP_TWO_MILESTONES}### Objective 8: H\n**Goal**: H goal.\n` });
  assert.deepEqual(numbers(scope.sectionObjectives(withExtra.root)), ['4', '5', '6', '7']);

  const bare = project(TWO_MILESTONE_SPEC, { roadmap: false });
  assert.deepEqual(scope.sectionObjectives(bare.root), []);
});

test('S3. currentDirObjectives: every directory under .aoforge/objectives in number order, cancelled ones flagged', () => {
  const p = project();
  const got = scope.currentDirObjectives(p.root);
  assert.deepEqual(numbers(got), ['1', '2', '3', '4', '5', '6', '7', '40']);
  assert.deepEqual(got.map((e) => e.status_hint), ['dir', 'dir', 'dir', 'dir', 'dir', 'cancelled', 'dir', 'dir']);
  assert.equal(got[7].dir, '.aoforge/objectives/40-decoy');
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

const MILESTONES = '.aoforge/MILESTONES.md';

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
  assert.ok(p.read('.aoforge/objectives/04-d/04-01-TRD.md').includes('<tasks>'), 'fixture lost its wrapper');
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
    assert.ok(p.exists(`.aoforge/milestones/v1.0-objectives/${dir}`), `${dir} should be archived`);
    assert.ok(!p.exists(`.aoforge/objectives/${dir}`), `${dir} should have left objectives/`);
  }
  for (const dir of ['01-a', '02-b', '03-c', '07-g', '40-decoy']) {
    assert.ok(p.exists(`.aoforge/objectives/${dir}`), `${dir} must stay`);
    assert.ok(!p.exists(`.aoforge/milestones/v1.0-objectives/${dir}`), `${dir} must not be archived`);
  }
});

test('7. state_updated is true only when STATE.md\'s bytes changed', () => {
  const stateRel = '.aoforge/STATE.md';

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
  assert.ok(mixed.read('.aoforge/objectives/04-d/04-01-SUMMARY.md').includes(`**${placeholder}**`), 'fixture lost its placeholder');
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
  assert.ok(p.exists('.aoforge/objectives/40-decoy'), '40-decoy must not be archived');
  assert.ok(!p.exists('.aoforge/milestones/v1.0-objectives/40-decoy'));
  assert.ok(p.exists('.aoforge/objectives/05-e'), '05-e is outside this bullet and must stay');
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

// ─── milestone complete --dry-run (TRD 68-01) ─────────────────────────────────

const AUDIT = '.aoforge/v1.0-MILESTONE-AUDIT.md';
const DRY_RUN_FIRST_LINE = 'DRY RUN — nothing has been modified.';
const today = () => new Date().toISOString().split('T')[0];
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sortedPaths = (list) => list.map((e) => (typeof e === 'string' ? e : e.path)).sort();
const sortedMoves = (list) => list.map((m) => `${m.from} -> ${m.to}`).sort();

test('D1. --dry-run prints the plan and leaves .aoforge/ byte-identical, with no new directory', () => {
  const p = project();
  const before = planningTree(p.root);
  const r = completeRaw(p, ['v1.0', '--name', 'Now', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stderr.startsWith(DRY_RUN_FIRST_LINE), `stderr should open with the dry-run banner:\n${r.stderr}`);
  assert.equal(JSON.parse(r.stdout).dry_run, true);
  assert.deepEqual(planningTree(p.root), before);
  assert.ok(!p.exists('.aoforge/milestones'), 'a dry run must not create .aoforge/milestones/');
});

test('D2. the dry-run JSON carries the real run\'s counts and the writes it would make', () => {
  const p = project();
  const { json } = complete(p, ['v1.0', '--name', 'Now', '--dry-run']);
  assert.equal(json.version, 'v1.0');
  assert.equal(json.name, 'Now');
  assert.equal(json.objectives, 2);
  assert.deepEqual(json.objective_numbers, ['4', '5']);
  assert.equal(json.jobs, 3);
  assert.equal(json.tasks, 6);
  assert.deepEqual(json.cancelled, ['6']);
  assert.equal(json.milestones_updated, false);
  assert.equal(json.state_updated, false);
  assert.deepEqual([...json.would_write].sort(byPath), [
    { path: '.aoforge/MILESTONES.md', action: 'create' },
    { path: '.aoforge/STATE.md', action: 'update' },
    { path: '.aoforge/milestones/v1.0-REQUIREMENTS.md', action: 'create' },
    { path: '.aoforge/milestones/v1.0-ROADMAP.md', action: 'create' },
  ]);
  assert.deepEqual(json.would_move, []);
  assert.deepEqual(json.would_keep, []);
  assert.deepEqual(json.warnings, []);
});

test('D3. milestone_entry is the text a following real run adds to MILESTONES.md', () => {
  const fresh = project();
  const dry = complete(fresh, ['v1.0', '--name', 'Now', '--dry-run']).json;
  assert.equal(typeof dry.milestone_entry, 'string');
  complete(fresh, ['v1.0', '--name', 'Now']);
  assert.equal(fresh.read(MILESTONES), `# Milestones\n\n${dry.milestone_entry}`);

  const seeded = project(TWO_MILESTONE_SPEC, { files: { [MILESTONES]: '# Milestones\n\n## v0.9 Old (Shipped: 2026-01-01)\n\n---\n\n' } });
  const existing = seeded.read(MILESTONES);
  const dryAppend = complete(seeded, ['v1.0', '--name', 'Now', '--dry-run']).json;
  assert.deepEqual(dryAppend.would_write.find((w) => w.path === MILESTONES), { path: MILESTONES, action: 'append' });
  complete(seeded, ['v1.0', '--name', 'Now']);
  assert.equal(seeded.read(MILESTONES), `${existing}\n${dryAppend.milestone_entry}`);
});

test('D4. with an audit file and --archive-objectives the dry run lists every move and performs none', () => {
  const p = project(TWO_MILESTONE_SPEC, { files: { [AUDIT]: AUDIT_V1_0 } });
  const before = planningTree(p.root);
  const { json } = complete(p, ['v1.0', '--archive-objectives', '--dry-run']);
  assert.deepEqual(sortedMoves(json.would_move), sortedMoves([
    { from: AUDIT, to: '.aoforge/milestones/v1.0-MILESTONE-AUDIT.md' },
    { from: '.aoforge/objectives/04-d', to: '.aoforge/milestones/v1.0-objectives/04-d' },
    { from: '.aoforge/objectives/05-e', to: '.aoforge/milestones/v1.0-objectives/05-e' },
    { from: '.aoforge/objectives/06-f', to: '.aoforge/milestones/v1.0-objectives/06-f' },
  ]));
  assert.deepEqual(planningTree(p.root), before);
  assert.ok(!p.exists('.aoforge/milestones'), 'a dry run must not create .aoforge/milestones/');
  assert.ok(p.exists(AUDIT) && p.exists('.aoforge/objectives/04-d'), 'nothing may have moved');
});

test('D5. parity: a real run executes the plan the dry run printed', () => {
  const p = project(TWO_MILESTONE_SPEC, { files: { [AUDIT]: AUDIT_V1_0 } });
  const args = ['v1.0', '--name', 'Now', '--archive-objectives'];
  const dry = complete(p, [...args, '--dry-run']).json;
  const real = complete(p, args).json;
  assert.equal(real.dry_run, false);
  assert.deepEqual(sortedPaths(real.written), sortedPaths(dry.would_write));
  assert.deepEqual(sortedMoves(real.moved), sortedMoves(dry.would_move));
  assert.deepEqual(sortedPaths(real.kept), sortedPaths(dry.would_keep));
  assert.equal(real.milestones_reason, null);
  assert.deepEqual(real.warnings, dry.warnings);
  assert.equal(real.milestones_updated, true);
  assert.equal(real.state_updated, true);
});

test('D6. a STATE.md the replacement would leave unchanged is not in would_write', () => {
  const current = ['# State', '', '**Status:** v1.0 milestone complete', `**Last Activity:** ${today()}`,
    '**Last Activity Description:** v1.0 milestone completed and archived', ''].join('\n');
  const p = project(TWO_MILESTONE_SPEC, { state: current });
  const { json } = complete(p, ['v1.0', '--dry-run']);
  assert.ok(!json.would_write.some((w) => w.path === '.aoforge/STATE.md'), JSON.stringify(json.would_write));
  assert.ok(json.would_write.some((w) => w.path === MILESTONES), 'the other writes are still planned');
});

// ─── milestone complete, run again (TRD 68-01) ────────────────────────────────

const ARCHIVE = '.aoforge/milestones';
const entryLines = (text, version) => {
  const digits = version.replace(/^v/, '').replace(/\./g, '\\.');
  return text.split('\n').filter((l) => new RegExp(`^## v?${digits}(?:\\s|$)`).test(l));
};
/** The bytes of every file under .aoforge/milestones/, keyed by project-relative path. */
const archiveBytes = (p) => {
  const tree = planningTree(p.root);
  return Object.fromEntries(Object.keys(tree.files).filter((f) => f.startsWith('milestones/')).sort().map((f) => [f, p.read(`.aoforge/${f}`)]));
};

test('R7. a second run leaves one MILESTONES.md entry and the first run\'s archive files untouched', () => {
  const p = project();
  const first = complete(p, ['v1.0', '--name', 'Now']).json;
  assert.equal(first.milestones_updated, true);
  assert.equal(first.milestones_reason, null);
  const milestonesAfterOne = p.read(MILESTONES);
  const archiveAfterOne = archiveBytes(p);
  const dirsAfterOne = planningTree(p.root).dirs;

  const second = complete(p, ['v1.0', '--name', 'Now']).json;
  assert.equal(second.milestones_updated, false);
  assert.equal(second.milestones_reason, 'entry_exists');
  assert.equal(entryLines(p.read(MILESTONES), 'v1.0').length, 1);
  assert.equal(p.read(MILESTONES), milestonesAfterOne);
  assert.deepEqual(archiveBytes(p), archiveAfterOne);
  assert.deepEqual(planningTree(p.root).dirs, dirsAfterOne);
});

test('R8. an existing archive is kept even when ROADMAP.md changed after the first run', () => {
  const p = project();
  complete(p, ['v1.0', '--name', 'Now']);
  const archived = p.read(`${ARCHIVE}/v1.0-ROADMAP.md`);
  p.write('.aoforge/ROADMAP.md', `${ROADMAP_TWO_MILESTONES}\n## Reorganised for the next milestone\n`);

  const second = complete(p, ['v1.0', '--name', 'Now']).json;
  assert.equal(p.read(`${ARCHIVE}/v1.0-ROADMAP.md`), archived);
  assert.ok(second.kept.some((k) => k.path === `${ARCHIVE}/v1.0-ROADMAP.md` && k.reason === 'exists'), JSON.stringify(second.kept));
  assert.ok(!second.written.includes(`${ARCHIVE}/v1.0-ROADMAP.md`));
});

test('R9. 1.0 and v1.0 name the same milestone: one entry, one archive set', () => {
  const p = project();
  const first = complete(p, ['1.0', '--name', 'Now']).json;
  assert.equal(first.version, 'v1.0');
  complete(p, ['v1.0', '--name', 'Now']);
  assert.equal(entryLines(p.read(MILESTONES), 'v1.0').length, 1);
  assert.ok(p.read(MILESTONES).includes('## v1.0 Now (Shipped:'));
  assert.deepEqual(Object.keys(archiveBytes(p)).sort(), ['milestones/v1.0-REQUIREMENTS.md', 'milestones/v1.0-ROADMAP.md']);
  assert.ok(!p.exists(`${ARCHIVE}/1.0-ROADMAP.md`) && !p.exists(`${ARCHIVE}/1.0-REQUIREMENTS.md`), 'no 1.0-* archive file');
});

test('R10. an entry `milestone put` wrote survives a later complete byte for byte', () => {
  const p = project(TWO_MILESTONE_SPEC, { files: { [MILESTONES]: MILESTONES_WITH_PUT_ENTRY } });
  const { json } = complete(p, ['v1.0', '--name', 'Now']);
  assert.equal(p.read(MILESTONES), MILESTONES_WITH_PUT_ENTRY);
  assert.equal(json.milestones_updated, false);
  assert.equal(json.milestones_reason, 'entry_exists');
  assert.ok(json.kept.some((k) => k.path === MILESTONES && k.reason === 'entry_exists'), JSON.stringify(json.kept));
  assert.equal(complete(p, ['v1.0', '--name', 'Now', '--dry-run']).json.milestone_entry, null);
});

test('R11. a legacy unprefixed entry counts as v1.0; a v1.0.1 entry does not', () => {
  const legacy = project(TWO_MILESTONE_SPEC, { files: { [MILESTONES]: MILESTONES_LEGACY_UNPREFIXED } });
  const kept = complete(legacy, ['v1.0', '--name', 'Now']).json;
  assert.equal(legacy.read(MILESTONES), MILESTONES_LEGACY_UNPREFIXED);
  assert.equal(kept.milestones_reason, 'entry_exists');

  const patch = project(TWO_MILESTONE_SPEC, { files: { [MILESTONES]: MILESTONES_PATCH_ONLY } });
  const appended = complete(patch, ['v1.0', '--name', 'Now']).json;
  assert.equal(appended.milestones_updated, true);
  assert.equal(appended.milestones_reason, null);
  const text = patch.read(MILESTONES);
  assert.ok(text.startsWith(MILESTONES_PATCH_ONLY), 'the patch entry is kept');
  assert.equal(entryLines(text, 'v1.0').length, 1, 'the v1.0 entry is appended once');
  assert.ok(text.includes('## v1.0.1 Patch'));
});

test('R12. --archive-objectives twice moves nothing the second time; an occupied destination is kept, not a crash', () => {
  const p = project();
  const first = complete(p, ['v1.0', '--archive-objectives']).json;
  assert.equal(first.moved.length, 3);
  const second = complete(p, ['v1.0', '--archive-objectives']).json;
  assert.deepEqual(second.moved, []);
  assert.equal(second.objectives, 2, 'the archived directories still count');
  for (const dir of ['04-d', '05-e', '06-f']) assert.ok(p.exists(`${ARCHIVE}/v1.0-objectives/${dir}`), `${dir} stays archived`);

  const clash = project(TWO_MILESTONE_SPEC, { files: { [`${ARCHIVE}/v1.0-objectives/04-d/OBJECTIVE.md`]: '# Already archived\n' } });
  const r = completeRaw(clash, ['v1.0', '--archive-objectives']);
  assert.equal(r.status, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  assert.ok(clash.exists('.aoforge/objectives/04-d'), '04-d stays current');
  assert.equal(clash.read(`${ARCHIVE}/v1.0-objectives/04-d/OBJECTIVE.md`), '# Already archived\n');
  assert.ok(json.kept.some((k) => k.path === '.aoforge/objectives/04-d' && k.reason === 'destination_exists'), JSON.stringify(json.kept));
  assert.equal(json.warnings.length, 1, JSON.stringify(json.warnings));
  assert.ok(json.warnings[0].includes('04-d'), json.warnings[0]);
  assert.deepEqual(sortedMoves(json.moved), sortedMoves([
    { from: '.aoforge/objectives/05-e', to: `${ARCHIVE}/v1.0-objectives/05-e` },
    { from: '.aoforge/objectives/06-f', to: `${ARCHIVE}/v1.0-objectives/06-f` },
  ]));
});

test('R13. an audit file whose destination exists stays where it is', () => {
  const destination = `${ARCHIVE}/v1.0-MILESTONE-AUDIT.md`;
  const p = project(TWO_MILESTONE_SPEC, { files: { [AUDIT]: AUDIT_V1_0, [destination]: '# Earlier audit\n' } });
  const { json } = complete(p, ['v1.0']);
  assert.equal(p.read(AUDIT), AUDIT_V1_0);
  assert.equal(p.read(destination), '# Earlier audit\n');
  assert.ok(json.kept.some((k) => k.path === AUDIT && k.reason === 'destination_exists'), JSON.stringify(json.kept));
  assert.ok(json.warnings.some((w) => w.includes('v1.0-MILESTONE-AUDIT.md')), JSON.stringify(json.warnings));
  assert.deepEqual(json.moved, []);
});

// templateSummary is exercised through the fixture project above; this guards the helper's contract directly.
test('fixture. templateSummary writes the bold one-liner under the H1 and no frontmatter one-liner', () => {
  const text = templateSummary('04-d', '01', 'Alpha shipped');
  assert.ok(/^# Objective 04 TRD 01: .*\n\n\*\*Alpha shipped\*\*\n/m.test(text));
  assert.ok(!/^one-liner:/m.test(text));
});
