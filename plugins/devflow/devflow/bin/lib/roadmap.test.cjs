'use strict';

/**
 * Regression coverage for `df-tools roadmap update-job-progress <N>`.
 *
 * Root cause under test (roadmap-progress-row-corruption): the Progress-table
 * regex in cmdRoadmapUpdateJobProgress was written for the OLDER 4-column
 * table shape (`| Objective | Plans | Status | Completed |`) and never
 * updated when ROADMAP.md gained a Milestone column
 * (`| Objective | Milestone | Plans | Status | Completed |`, the shape
 * documented in devflow/templates/roadmap.md's "Milestone-Grouped Roadmap"
 * section and used by every real post-v1.0 ROADMAP.md). Run against a
 * 5-column table, the old regex shifted every value one column left/right:
 * Milestone got overwritten with the Plans fraction, Plans got overwritten
 * with the Status text, Status got the date, and the real Completed column
 * was never touched.
 *
 * The `**Jobs:**` planning-detail line had the same class of bug: the whole
 * line was replaced with a bare "N/M jobs complete", discarding hand-authored
 * wave/requirement-ID annotations.
 *
 * Fixtures below mirror this repo's real ROADMAP.md: 5-column Progress
 * table, `<details>`-collapsed milestone blocks with duplicate objective
 * numbers in checklist form, and suffixed TRD ids (12-04a/b/c).
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const { computeJobsLineText } = require('./roadmap-progress.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function tmpProject() {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-roadmap-progress-')));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives'), { recursive: true });
  return dir;
}

function fakeHomeEnv() {
  const home = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-roadmap-progress-home-')));
  return Object.assign({}, process.env, { HOME: home });
}

function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    env: fakeHomeEnv(),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// Objective 12 dir with 10 TRDs (incl. suffixed 04a/04b/04c) and `count` SUMMARYs.
function writeObjective12Dir(project, summaryCount) {
  const dir = path.join(project, '.planning', 'objectives', '12-objective-under-test');
  fs.mkdirSync(dir, { recursive: true });
  const ids = ['01', '02', '03', '04a', '04b', '04c', '05', '06', '07', '08'];
  ids.forEach((id, i) => {
    fs.writeFileSync(path.join(dir, `12-${id}-TRD.md`), `# TRD ${id}\n`, 'utf-8');
    if (i < summaryCount) {
      fs.writeFileSync(path.join(dir, `12-${id}-SUMMARY.md`), `# Summary ${id}\n`, 'utf-8');
    }
  });
  return dir;
}

const FIVE_COLUMN_ROADMAP = `# Roadmap: Test Project

## Milestones

- ✅ **v1.0** — Objectives 1-8 (shipped 2026-01-01)
- 📋 **v1.1 — not yet planned**

## Objectives

<details>
<summary>✅ v1.0 — SHIPPED 2026-01-01</summary>

- [x] Objective 1: Foundation (3/3 plans)
- [x] Objective 1: Duplicate marker from parallel session (2/2 plans) <!-- duplicate number, parallel session -->
- [x] Objective 8: Wrap-up (2/2 plans)

</details>

### Objective 11: Prior objective

**Goal:** Something before the one under test.
**Depends on:** Objective 8
**Jobs:** 2/2 complete

Jobs:
- [x] 11-01-TRD.md — Wave 1: first
- [x] 11-02-TRD.md — Wave 1: second

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 1, 8 (2 objectives) | v1.0 | 5/5 | Complete | 2026-01-01 |
| 11. Prior objective | v1.1 | 2/2 | Complete | 2026-02-01 |
| 12. Objective under test | v1.1 | 9/10 | In Progress | — |
| 13. Next objective | v1.1 | 0/— | Registered | — |

### Objective 12: Objective under test

**Goal:** Exercise the Progress-table + Jobs-line writers.
**Depends on:** Objective 11 (same branch).
**Source:** synthetic fixture. **Decisions (user):** none.
**Jobs:** 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)

Jobs:
- [x] 12-01-TRD.md — Wave 1: first
- [x] 12-02-TRD.md — Wave 1: second
- [x] 12-03-TRD.md — Wave 2: third
- [x] 12-04a-TRD.md — Wave 2: fourth-a
- [x] 12-04b-TRD.md — Wave 2: fourth-b
- [x] 12-04c-TRD.md — Wave 2: fourth-c
- [x] 12-05-TRD.md — Wave 3: fifth
- [x] 12-06-TRD.md — Wave 3: sixth
- [x] 12-07-TRD.md — Wave 4: seventh
- [ ] 12-08-TRD.md — Wave 4: eighth

### Objective 13: Next objective

**Goal:** Comes after the one under test.
**Depends on:** Objective 12
**Jobs:** 0 jobs

Jobs:
- [ ] TBD (run /devflow:plan-objective 13 to break down)
`;

// Older, single-milestone 4-column shape (no Milestone column at all).
const FOUR_COLUMN_ROADMAP = `# Roadmap: Test Project

## Objectives

### Objective 12: Objective under test

**Goal:** Exercise the Progress-table + Jobs-line writers.
**Jobs:** 10 TRDs in 4 waves (planned 2026-01-15; notes about wave rebalancing)

Jobs:
- [x] 12-01-TRD.md — Wave 1: first
- [x] 12-02-TRD.md — Wave 1: second
- [x] 12-03-TRD.md — Wave 2: third
- [x] 12-04a-TRD.md — Wave 2: fourth-a
- [x] 12-04b-TRD.md — Wave 2: fourth-b
- [x] 12-04c-TRD.md — Wave 2: fourth-c
- [x] 12-05-TRD.md — Wave 3: fifth
- [x] 12-06-TRD.md — Wave 3: sixth
- [x] 12-07-TRD.md — Wave 4: seventh
- [ ] 12-08-TRD.md — Wave 4: eighth

## Progress

| Objective | Plans | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Prior objective | 2/2 | Complete | 2026-02-01 |
| 12. Objective under test | 9/10 | In Progress | - |
`;

function progressRow(roadmap, objectiveNum) {
  const line = roadmap.split('\n').find(l => l.trim().startsWith(`| ${objectiveNum}.`));
  return line ? line.trim() : null;
}

function jobsLine(roadmap, objectiveNum) {
  const lines = roadmap.split('\n');
  const headerIdx = lines.findIndex(l => new RegExp(`^#{2,4}\\s*Objective\\s+${objectiveNum}:`).test(l));
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (/^#{2,4}\s*Objective\s+\d/.test(lines[i])) break;
    if (/^\*\*Jobs:\*\*/.test(lines[i])) return lines[i];
  }
  return null;
}

describe('roadmap update-job-progress — 5-column table (Milestone column present)', () => {
  test('updates only Plans + Status on objective 12’s row; Milestone, Objective 11/13 rows untouched', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10); // all 10 TRDs summarized -> Complete

    const result = run(['roadmap', 'update-job-progress', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.updated, true);
    assert.equal(result.json.summary_count, 10);
    assert.equal(result.json.job_count, 10);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const row12 = progressRow(roadmap, 12);

    // Milestone column must survive byte-identical — this is the column that
    // used to get clobbered with the Plans fraction.
    assert.match(row12, /\|\s*v1\.1\s*\|/, `Milestone column dropped/corrupted: ${row12}`);
    // Plans column must show the real fraction, not the Status text.
    assert.match(row12, /\|\s*10\/10\s*\|/, `Plans column wrong: ${row12}`);
    // Status column must show Complete, not a date.
    assert.match(row12, /\|\s*Complete\s*\|/, `Status column wrong: ${row12}`);

    // Sibling rows (11 and 13) must be untouched.
    assert.equal(progressRow(roadmap, 11), '| 11. Prior objective | v1.1 | 2/2 | Complete | 2026-02-01 |');
    assert.equal(progressRow(roadmap, 13), '| 13. Next objective | v1.1 | 0/— | Registered | — |');
  });

  test('preserves hand-authored **Jobs:** detail instead of wiping it', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);

    run(['roadmap', 'update-job-progress', '12'], project);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const line = jobsLine(roadmap, 12);
    assert.ok(line, 'Jobs line for objective 12 not found');
    assert.match(line, /^\*\*Jobs:\*\*\s*10\/10 jobs complete/, `counter prefix missing: ${line}`);
    assert.match(line, /10 TRDs in 4 waves/, `original planning detail was wiped: ${line}`);
    assert.match(line, /04a\/04b\/04c/, `wave-split annotation was wiped: ${line}`);

    // Objective 11's Jobs line (a different objective, appearing earlier in
    // the file) must be untouched by the update targeted at objective 12.
    const line11 = jobsLine(roadmap, 11);
    assert.equal(line11, '**Jobs:** 2/2 complete');
  });

  test('duplicate "Objective 1" checklist entries inside the collapsed <details> block are never touched', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);

    run(['roadmap', 'update-job-progress', '12'], project);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.match(roadmap, /- \[x\] Objective 1: Foundation \(3\/3 plans\)/);
    assert.match(roadmap, /- \[x\] Objective 1: Duplicate marker from parallel session \(2\/2 plans\) <!-- duplicate number, parallel session -->/);
  });

  test('partial completion (9/10) sets status In Progress and leaves Completed column as "—"', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 9);

    const result = run(['roadmap', 'update-job-progress', '12'], project);
    assert.equal(result.json.status, 'In Progress');

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const row12 = progressRow(roadmap, 12);
    assert.match(row12, /\|\s*v1\.1\s*\|/, `Milestone column dropped/corrupted: ${row12}`);
    assert.match(row12, /\|\s*9\/10\s*\|/, `Plans column wrong: ${row12}`);
    assert.match(row12, /\|\s*In Progress\s*\|/, `Status column wrong: ${row12}`);
    assert.match(row12, /\|\s*—\s*\|$/, `Completed column should stay untouched placeholder: ${row12}`);
  });
});

describe('roadmap update-job-progress — 4-column table (no Milestone column; older shape)', () => {
  test('still updates Plans + Status + Completed correctly with no Milestone column to misalign against', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FOUR_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);

    const result = run(['roadmap', 'update-job-progress', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.updated, true);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const row12 = progressRow(roadmap, 12);
    assert.match(row12, /\|\s*10\/10\s*\|/, `Plans column wrong: ${row12}`);
    assert.match(row12, /\|\s*Complete\s*\|/, `Status column wrong: ${row12}`);

    const line = jobsLine(roadmap, 12);
    assert.match(line, /^\*\*Jobs:\*\*\s*10\/10 jobs complete/);
    assert.match(line, /10 TRDs in 4 waves/, `original planning detail was wiped: ${line}`);
  });
});

/**
 * quick-20: `computeJobsLineText` replaces its leading count instead of
 * prepending a second one.
 *
 * A `**Jobs:**` value that STARTS with a machine-written count fragment
 * (`N/M complete`, `N/M jobs executed`, `N/M TRDs executed`, ...) must have
 * ONLY its `N/M` numbers replaced — the author's own noun and verb, and
 * every byte after the fragment, survive untouched. Only when there is no
 * leading count at all does the function fall back to prepending
 * `N/M jobs complete — ` (today's existing behavior for hand-authored
 * detail with no machine-owned prefix).
 */
describe('computeJobsLineText — leading count replace vs prepend', () => {
  test('1: leading count-only fragment ("N/M complete") — numbers replaced, tail byte-identical', () => {
    assert.equal(
      computeJobsLineText('0/16 complete — 16 TRDs in 13 waves (x)', '16/16 jobs complete'),
      '16/16 complete — 16 TRDs in 13 waves (x)'
    );
  });

  test('2: count-only fragment followed by a comma — only numbers replaced, tail byte-identical (no "66/66" false match)', () => {
    assert.equal(
      computeJobsLineText(
        '10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (y)',
        '10/10 jobs complete'
      ),
      '10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (y)'
    );
  });

  test('3: count-only fragment, unchanged numbers — regression guard', () => {
    assert.equal(computeJobsLineText('6/6 complete', '6/6 jobs complete'), '6/6 complete');
  });

  test('4: count-only fragment, stale numbers advance — only the numbers change', () => {
    assert.equal(computeJobsLineText('5/6 complete', '6/6 jobs complete'), '6/6 complete');
  });

  test('5: noun+verb fragment ("N/M TRDs executed") keeps the author\'s own noun and verb', () => {
    assert.equal(
      computeJobsLineText('11/11 TRDs executed in 9 waves (two roots)', '16/16 jobs complete'),
      '16/16 TRDs executed in 9 waves (two roots)'
    );
  });

  test('6: the old managed shape ("N/M jobs executed") keeps its own verb, not the counter\'s', () => {
    assert.equal(
      computeJobsLineText('9/10 jobs executed — 10 TRDs in 4 waves (z)', '10/10 jobs complete'),
      '10/10 jobs executed — 10 TRDs in 4 waves (z)'
    );
  });

  test('7: stacked heal — a second leading-count fragment collapses away, keeping the FIRST fragment\'s noun and verb', () => {
    assert.equal(
      computeJobsLineText('15/16 jobs executed — 0/16 complete — 16 TRDs in 13 waves (x)', '16/16 jobs complete'),
      '16/16 jobs executed — 16 TRDs in 13 waves (x)'
    );
  });

  test('8: idempotent — running twice with the same counter gives the same result (cases 1, 2, 7)', () => {
    const counter1 = '16/16 jobs complete';
    const case1 = '0/16 complete — 16 TRDs in 13 waves (x)';
    const once1 = computeJobsLineText(case1, counter1);
    assert.equal(computeJobsLineText(once1, counter1), once1);

    const counter2 = '10/10 jobs complete';
    const case2 = '10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (y)';
    const once2 = computeJobsLineText(case2, counter2);
    assert.equal(computeJobsLineText(once2, counter2), once2);

    const case7 = '15/16 jobs executed — 0/16 complete — 16 TRDs in 13 waves (x)';
    const once7 = computeJobsLineText(case7, counter1);
    assert.equal(computeJobsLineText(once7, counter1), once7);
  });

  test('9: no leading count (free text) — prepends "N/M jobs complete — "', () => {
    assert.equal(
      computeJobsLineText('registered, not planned.', '0/0 jobs complete'),
      '0/0 jobs complete — registered, not planned.'
    );
  });

  test('10: a bare "N waves" with no slash is not a count — prepends', () => {
    assert.equal(
      computeJobsLineText('3 TRDs in 3 waves (sequential — 33-02 and 33-03)', '16/16 jobs complete'),
      '16/16 jobs complete — 3 TRDs in 3 waves (sequential — 33-02 and 33-03)'
    );
  });

  test('11: placeholder "0 jobs" and the empty string both become the bare counter', () => {
    assert.equal(computeJobsLineText('0 jobs', '16/16 jobs complete'), '16/16 jobs complete');
    assert.equal(computeJobsLineText('', '16/16 jobs complete'), '16/16 jobs complete');
  });
});

describe('roadmap update-job-progress — Jobs-line leading-count seed (quick-20)', () => {
  const SEEDED_ROADMAP = FIVE_COLUMN_ROADMAP.replace(
    '**Jobs:** 10 TRDs in 4 waves (planned 2026-01-15; 12-04',
    '**Jobs:** 0/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04'
  );

  test('fixture sanity: the seed replace actually changed the string', () => {
    assert.notEqual(SEEDED_ROADMAP, FIVE_COLUMN_ROADMAP);
    assert.match(SEEDED_ROADMAP, /\*\*Jobs:\*\* 0\/10 complete — 10 TRDs in 4 waves/);
  });

  test('12: all 10 summaries present — leading count replaced in place, no "jobs" inserted; idempotent on rerun', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), SEEDED_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);

    run(['roadmap', 'update-job-progress', '12'], project);
    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.equal(
      jobsLine(roadmap, 12),
      '**Jobs:** 10/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)'
    );
    assert.equal(jobsLine(roadmap, 11), '**Jobs:** 2/2 complete');

    // Second run: byte-identical file (idempotent).
    run(['roadmap', 'update-job-progress', '12'], project);
    const roadmapAgain = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.equal(roadmapAgain, roadmap, 'second run must be byte-identical to the first');
  });

  test('13: 9 of 10 summaries present — leading count replaced with the partial numbers, author\'s own verb kept', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), SEEDED_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 9);

    run(['roadmap', 'update-job-progress', '12'], project);
    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.equal(
      jobsLine(roadmap, 12),
      '**Jobs:** 9/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)'
    );
  });
});
