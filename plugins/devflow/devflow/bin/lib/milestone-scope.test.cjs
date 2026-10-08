'use strict';

// Tests for TRD 68-02 (TOOL-05): milestone-scope.cjs resolves objective directories through the shared helpers
// (helpers.parseObjectiveDirName, objectiveDirMatches, normalizeObjectiveName: the objective 56 rule), so
// `milestone complete`, `estimate milestone` and `tokens coverage --milestone` pick the directory `find-objective` picks.
//
// Every project is a hand-built temp dir (never this repository's .planning/); each test removes its own.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const scope = require('./milestone-scope.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { makeMilestoneProject, TWO_MILESTONE_SPEC } = require('./__fixtures__/milestone-complete-fixtures.cjs');
const { scopeProject, bulletRoadmap } = require('./__fixtures__/milestone-scope-fixtures.cjs');

const toPosix = (p) => p.split(path.sep).join('/');
const numbersOf = (entries) => entries.map((e) => e.number);

test('5. milestone-scope.cjs has no directory parser of its own: it uses the shared helpers', () => {
  const source = fs.readFileSync(path.join(__dirname, 'milestone-scope.cjs'), 'utf-8');
  assert.doesNotMatch(source, /\bDIR_RE\b/, 'no DIR_RE');
  assert.doesNotMatch(source, /function\s+canonical\b/, 'no local canonical()');
  assert.doesNotMatch(source, /\/\^\(\\d\+/, 'no regular-expression literal beginning /^(\\d+');
  const names = ['objectiveDirMatches', 'normalizeObjectiveName', 'parseObjectiveDirName'];
  for (const name of names) {
    const destructured = new RegExp(String.raw`const\s*\{[^}]*\b${name}\b[^}]*\}\s*=\s*require\('\./helpers\.cjs'\)`);
    assert.match(source, destructured, `${name} comes from require('./helpers.cjs')`);
  }
});

test('6. every current directory milestone-scope reports is the one find-objective returns', () => {
  const project = makeMilestoneProject(TWO_MILESTONE_SPEC);
  try {
    const entries = scope.currentDirObjectives(project.root);
    assert.ok(entries.length >= 8, `expected every fixture directory, got ${numbersOf(entries)}`);
    for (const entry of entries) {
      const found = findObjectiveInternal(project.root, entry.number);
      assert.ok(found, `find-objective finds objective ${entry.number}`);
      assert.strictEqual(entry.dir, toPosix(found.directory), `objective ${entry.number}`);
    }
  } finally {
    project.cleanup();
  }
});

test('6b. a stray second directory of one number resolves to the same one find-objective picks (sorted, first wins)', () => {
  const project = scopeProject({
    roadmap: bulletRoadmap('4', [{ num: '4', title: 'D' }]),
    current: ['04-b', '04-a'],
  });
  try {
    const [entry] = scope.currentDirObjectives(project.root);
    assert.strictEqual(entry.dir, '.planning/objectives/04-a');
    assert.strictEqual(entry.dir, toPosix(findObjectiveInternal(project.root, '4').directory));
  } finally {
    project.cleanup();
  }
});

test('7. decimal objectives stay exact: 4.1 is 04.1-one and never 04.10-ten', () => {
  const sections = [{ num: '4.1', title: 'One' }, { num: '4.10', title: 'Ten' }];
  const project = scopeProject({
    roadmap: bulletRoadmap('4.1, 4.10', sections),
    current: ['04.1-one', '04.10-ten'],
  });
  const onlyFirst = scopeProject({
    roadmap: bulletRoadmap('4.1', sections),
    current: ['04.1-one', '04.10-ten'],
  });
  try {
    const both = scope.selectMilestoneObjectives(project.root);
    const dirOf = (entries, number) => entries.find((e) => e.number === number)?.dir;
    assert.strictEqual(dirOf(both.objectives, '4.1'), '.planning/objectives/04.1-one');
    assert.strictEqual(dirOf(both.objectives, '4.10'), '.planning/objectives/04.10-ten');
    assert.strictEqual(dirOf(scope.currentDirObjectives(project.root), '4.1'), '.planning/objectives/04.1-one');
    assert.strictEqual(dirOf(scope.currentDirObjectives(project.root), '4.10'), '.planning/objectives/04.10-ten');
    assert.strictEqual(dirOf(scope.sectionObjectives(project.root), '4.1'), '.planning/objectives/04.1-one');
    assert.strictEqual(dirOf(scope.sectionObjectives(project.root), '4.10'), '.planning/objectives/04.10-ten');

    const one = scope.selectMilestoneObjectives(onlyFirst.root);
    assert.deepStrictEqual(numbersOf(one.objectives), ['4.1']);
    assert.strictEqual(one.objectives[0].dir, '.planning/objectives/04.1-one');
  } finally {
    project.cleanup();
    onlyFirst.cleanup();
  }
});

test('8. an unpadded directory is not objective 4: find-objective cannot find it, so there is no dir', () => {
  const project = scopeProject({
    roadmap: bulletRoadmap('4', [{ num: '4', title: 'D' }]),
    current: ['4-d'],
  });
  try {
    assert.strictEqual(findObjectiveInternal(project.root, '4'), null, 'find-objective does not find 4-d');
    const { objectives } = scope.selectMilestoneObjectives(project.root);
    assert.deepStrictEqual(objectives, [{ number: '4', name: 'D', dir: null, status_hint: 'no_dir' }]);
  } finally {
    project.cleanup();
  }
});

test('8b. a hyphen-less 04x is not an objective directory either', () => {
  const project = scopeProject({
    roadmap: bulletRoadmap('4', [{ num: '4', title: 'D' }]),
    current: ['04x'],
  });
  try {
    assert.strictEqual(findObjectiveInternal(project.root, '4'), null, 'find-objective does not find 04x');
    const { objectives } = scope.selectMilestoneObjectives(project.root);
    assert.deepStrictEqual(objectives, [{ number: '4', name: 'D', dir: null, status_hint: 'no_dir' }]);
    assert.deepStrictEqual(scope.currentDirObjectives(project.root), []);
  } finally {
    project.cleanup();
  }
});

test('9. entries under .planning/objectives/ that are not objective directories are not listed', () => {
  const project = scopeProject({
    current: ['01-a'],
    extra: {
      '.planning/objectives/README.md': '# Objectives\n',
      '.planning/objectives/.gitkeep': '',
      '.planning/objectives/notes/x.md': 'scratch\n',
    },
  });
  try {
    assert.deepStrictEqual(numbersOf(scope.currentDirObjectives(project.root)), ['1']);
  } finally {
    project.cleanup();
  }
});

test('10. an archived directory serves an objective only when no current directory has its number', () => {
  const roadmap = bulletRoadmap('1', [{ num: '1', title: 'A' }]);
  const archivedOnly = scopeProject({ roadmap, archived: { 'v0.9': ['01-a'] } });
  const both = scopeProject({ roadmap, current: ['01-current'], archived: { 'v0.9': ['01-a'] } });
  try {
    const fromArchive = scope.selectMilestoneObjectives(archivedOnly.root).objectives;
    assert.strictEqual(fromArchive[0].dir, '.planning/milestones/v0.9-objectives/01-a');
    const fromCurrent = scope.selectMilestoneObjectives(both.root).objectives;
    assert.strictEqual(fromCurrent[0].dir, '.planning/objectives/01-current');
    assert.strictEqual(fromCurrent[0].dir, toPosix(findObjectiveInternal(both.root, '1').directory));
  } finally {
    archivedOnly.cleanup();
    both.cleanup();
  }
});

test('11. roadmapSections is exported and maps canonical numbers to section titles', () => {
  assert.strictEqual(typeof scope.roadmapSections, 'function');
  const sections = scope.roadmapSections(bulletRoadmap('4, 4.1', [{ num: '04', title: 'D' }, { num: '4.1', title: 'One' }]));
  assert.ok(sections instanceof Map);
  assert.strictEqual(sections.get('4'), 'D');
  assert.strictEqual(sections.get('4.1'), 'One');
});
