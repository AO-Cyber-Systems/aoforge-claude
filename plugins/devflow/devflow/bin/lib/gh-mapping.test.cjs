'use strict';

// TRD 46-02 — gh-mapping.cjs (GSF-01): one objective id, one mapping shape (v3).
//
// Hermetic: every project is a hand-built temp directory (fs.mkdtempSync). Nothing here touches this
// repository's .planning/, the real ~/.claude, the network or `gh`.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ghMapping = require('./gh-mapping.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-mapping-'));
  cleanup.push(root);
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });
  return root;
}

function writeRel(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function objectiveMd(name, githubIssue) {
  const lines = ['---', `objective: ${name}`];
  if (githubIssue !== undefined) lines.push(`github_issue: ${githubIssue}`);
  lines.push('---', '', `# Objective ${name}`, '');
  return lines.join('\n');
}

// Dirs 02-a, 02.1-foo, 03-b exist; ROADMAP also lists 10 (no dir yet). Decoy entries under
// objectives/ (a stray file and a non-numeric dir) must never surface as objectives.
function makeIndexedProject() {
  const root = tmpProject();
  writeRel(root, '.planning/ROADMAP.md', [
    '# Roadmap', '',
    '### Objective 2: a', '**Goal:** a', '',
    '### Objective 2.1: foo', '**Goal:** foo', '',
    '### Objective 3: b', '**Goal:** b', '',
    '### Objective 10: z', '**Goal:** z', '',
  ].join('\n'));
  writeRel(root, '.planning/objectives/02-a/OBJECTIVE.md', objectiveMd('02-a', 'o/r#30'));
  writeRel(root, '.planning/objectives/02.1-foo/OBJECTIVE.md', objectiveMd('02.1-foo', 'o/r#31'));
  writeRel(root, '.planning/objectives/03-b/OBJECTIVE.md', objectiveMd('03-b'));
  writeRel(root, '.planning/objectives/.gitkeep', '');
  writeRel(root, '.planning/objectives/scratch/notes.md', 'not an objective\n');
  return root;
}

describe('gh-mapping: objective identity', () => {
  // ─── 1. toObjectiveId table ─────────────────────────────────────────────────

  test('1. toObjectiveId maps every spelling of an objective to ONE canonical id', () => {
    const table = [
      ['46', '46'],
      ['046', '46'],
      ['46-github-sync-foundations', '46'],
      ['2.1', '2.1'],
      ['02.1-foo', '2.1'],
      ['0', '0'],
      ['00-refine-defaults-table', '0'],
      ['  7 ', '7'],
      [46, '46'],
      [2.1, '2.1'],
      ['abc', null],
      ['', null],
      [null, null],
      [undefined, null],
    ];
    for (const [input, expected] of table) {
      assert.equal(ghMapping.toObjectiveId(input), expected, `toObjectiveId(${JSON.stringify(input)})`);
    }
  });

  test('1b. toObjectiveId keeps a decimal part verbatim and rejects malformed numbers', () => {
    assert.equal(ghMapping.toObjectiveId('02.10'), '2.10', '2.10 is the tenth insert, not 2.1');
    assert.equal(ghMapping.toObjectiveId('2.'), null);
    assert.equal(ghMapping.toObjectiveId('2.1.3'), null);
    assert.equal(ghMapping.toObjectiveId('-3'), null);
    assert.equal(ghMapping.toObjectiveId('v46'), null);
  });

  test('1c. a TRD id reads as its objective (trds keys are out of scope for objective ids)', () => {
    // Documented gotcha: "46-02" is objective 46 with slug "02". Objective 47 owns the trds map.
    assert.equal(ghMapping.toObjectiveId('46-02'), '46');
  });

  // ─── 2. resolveObjective ────────────────────────────────────────────────────

  test('2. resolveObjective resolves a number, a padded number and a dir name to the same objective', () => {
    const root = makeIndexedProject();
    const want = { id: '2.1', dir: '02.1-foo', roadmapNumber: '2.1' };
    assert.deepEqual(ghMapping.resolveObjective(root, '02.1'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, '2.1'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, '02.1-foo'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, 2), { id: '2', dir: '02-a', roadmapNumber: '2' });
  });

  test('2b. a ROADMAP-only objective resolves with dir null; an unknown objective resolves to null', () => {
    const root = makeIndexedProject();
    assert.deepEqual(ghMapping.resolveObjective(root, '10'), { id: '10', dir: null, roadmapNumber: '10' });
    assert.equal(ghMapping.resolveObjective(root, '99'), null);
    assert.equal(ghMapping.resolveObjective(root, 'scratch'), null);
    assert.equal(ghMapping.resolveObjective(root, ''), null);
    assert.equal(ghMapping.resolveObjective(root, null), null);
  });

  test('2c. a dir-only objective (not in ROADMAP) still resolves, roadmapNumber falls back to its id', () => {
    const root = tmpProject();
    writeRel(root, '.planning/objectives/07-solo/OBJECTIVE.md', objectiveMd('07-solo'));
    assert.deepEqual(ghMapping.resolveObjective(root, '7'), { id: '7', dir: '07-solo', roadmapNumber: '7' });
  });

  // ─── 3. listObjectiveIndex ──────────────────────────────────────────────────

  test('3. listObjectiveIndex is numerically sorted and reads github_issue from OBJECTIVE.md', () => {
    const root = makeIndexedProject();
    assert.deepEqual(ghMapping.listObjectiveIndex(root), [
      { id: '2', dir: '02-a', roadmapNumber: '2', github_issue: 'o/r#30' },
      { id: '2.1', dir: '02.1-foo', roadmapNumber: '2.1', github_issue: 'o/r#31' },
      { id: '3', dir: '03-b', roadmapNumber: '3', github_issue: null },
      { id: '10', dir: null, roadmapNumber: '10', github_issue: null },
    ]);
  });

  test('3b. an empty github_issue field is null, never an object', () => {
    const root = tmpProject();
    // extractFrontmatter turns a bare `github_issue:` into {} — the index must not leak that.
    writeRel(root, '.planning/objectives/04-x/OBJECTIVE.md', '---\nobjective: 04-x\ngithub_issue:\n---\n\n# x\n');
    const [entry] = ghMapping.listObjectiveIndex(root);
    assert.equal(entry.id, '4');
    assert.equal(entry.github_issue, null);
  });

  test('3c. sort is numeric on both parts (2, 2.1, 2.2, 2.10, 9, 10, 100)', () => {
    const root = tmpProject();
    const names = ['100-h', '10-g', '09-f', '02.10-e', '02.2-d', '02.1-c', '02-b'];
    for (const n of names) writeRel(root, `.planning/objectives/${n}/OBJECTIVE.md`, objectiveMd(n));
    assert.deepEqual(
      ghMapping.listObjectiveIndex(root).map((e) => e.id),
      ['2', '2.1', '2.2', '2.10', '9', '10', '100'],
    );
  });

  test('3d. no .planning at all → empty index, no throw', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-mapping-'));
    cleanup.push(root);
    assert.deepEqual(ghMapping.listObjectiveIndex(root), []);
    assert.equal(ghMapping.resolveObjective(root, '1'), null);
  });
});
