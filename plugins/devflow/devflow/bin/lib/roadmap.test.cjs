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

/**
 * TRD 40-01 (TOOL-01): getMilestoneInfo reports the in-progress milestone.
 *
 * Root cause: the old implementation returned the FIRST `v\d+\.\d+` in
 * ROADMAP.md, which is the oldest shipped milestone (v1.1 on this repo), and
 * its name regex latched onto an unrelated `### 📋 v1.4 candidates` heading.
 * `init milestone-op` therefore reported "v1.1 / candidates" while v1.3 was in
 * flight. The fix parses the `## Milestones` bullet list and picks by status:
 * in progress (🚧, or trailing text `in progress` / `current`), then the
 * highest shipped ✅, then the lowest planned 📋. The legacy first-match
 * regexes remain only as the fallback for roadmaps with no parsable section.
 *
 * Fixtures are hand-built and cover all three bullet shapes the codebase
 * emits: this repo's `**v1.3 — Name**`, templates/roadmap.md's
 * `**v1.0 MVP** - ...` and adopt.cjs's `**v0.1 — Adopted** (date, current)`.
 */
describe('getMilestoneInfo — status-aware ## Milestones parsing', () => {
  const { getMilestoneInfo } = require('./roadmap.cjs');

  // Writes `roadmapText` as .planning/ROADMAP.md in a fresh tmp project (or
  // writes nothing when it is null) and returns getMilestoneInfo(project).
  function milestoneInfoFor(roadmapText) {
    const project = tmpProject();
    if (roadmapText !== null) {
      fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), roadmapText, 'utf-8');
    }
    return getMilestoneInfo(project);
  }

  test('1: this repo\'s shape (✅ v1.1, ✅ v1.2, 🚧 v1.3, 📋 v1.4, later "### 📋 v1.4 candidates" heading) → the 🚧 v1.3 entry', () => {
    const roadmap = [
      '# Roadmap: DevFlow Claude',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)',
      '- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)',
      '- 🚧 **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (in progress; audit 2026-09-28 gaps_found → 39–41)',
      '- 📋 **v1.4 — not yet planned** — candidate: Objective 26 (moved from v1.3 2026-09-28; kill candidate)',
      '',
      'Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (contains both v1.1 and v1.2 detail).',
      '',
      '## Objectives',
      '',
      '<details>',
      '<summary>✅ v1.1 — SHIPPED 2026-05-06</summary>',
      '',
      '- [x] Objective 1: Foundation',
      '',
      '</details>',
      '',
      '### 📋 v1.4 candidates',
      '',
      '### Objective 26: GitHub issue auto-build monitor',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(roadmap), {
      version: 'v1.3',
      name: 'Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction',
    });
  });

  test('2: no 🚧 entry → the highest ✅ shipped version, compared numerically (out-of-order bullets; v1.10 > v1.9)', () => {
    const outOfOrder = [
      '# Roadmap: T',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.2 — Second** — Objectives 5-8 (shipped 2026-02-01)',
      '- ✅ **v1.1 — First** — Objectives 1-4 (shipped 2026-01-01)',
      '',
      '## Objectives',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(outOfOrder), { version: 'v1.2', name: 'Second' });

    const numeric = [
      '# Roadmap: T',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.9 — Nine** — Objectives 1-4 (shipped 2026-01-01)',
      '- ✅ **v1.10 — Ten** — Objectives 5-8 (shipped 2026-02-01)',
      '',
      '## Objectives',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(numeric), { version: 'v1.10', name: 'Ten' });

    // Empty bold name (`**v1.0**`) gives the 'milestone' placeholder name.
    assert.deepEqual(milestoneInfoFor(FIVE_COLUMN_ROADMAP), { version: 'v1.0', name: 'milestone' });
  });

  test('3: only 📋 planned entries (v2.0, v1.5) → the lowest planned version', () => {
    const roadmap = [
      '# Roadmap: T',
      '',
      '## Milestones',
      '',
      '- 📋 **v2.0 — Later** — Objectives 9-12 (planned)',
      '- 📋 **v1.5 — Sooner** — Objectives 5-8 (planned)',
      '',
      '## Objectives',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(roadmap), { version: 'v1.5', name: 'Sooner' });
  });

  test('4: templates/roadmap.md shape (`**v1.0 MVP** - ...`) → 🚧 v1.1 [Name]; ✅ v1.0 MVP alone → v1.0 MVP', () => {
    const template = [
      '# Roadmap: T',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.0 MVP** - Objectives 1-4 (shipped YYYY-MM-DD)',
      '- 🚧 **v1.1 [Name]** - Objectives 5-6 (in progress)',
      '- 📋 **v2.0 [Name]** - Objectives 7-10 (planned)',
      '',
      '## Objectives',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(template), { version: 'v1.1', name: '[Name]' });

    const mvpOnly = [
      '# Roadmap: T',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.0 MVP** - Objectives 1-4 (shipped YYYY-MM-DD)',
      '',
      '## Objectives',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(mvpOnly), { version: 'v1.0', name: 'MVP' });
  });

  test('5: adopt.cjs scaffold shape (no emoji, `(date, current)`) → v0.1 Adopted', () => {
    const roadmap = [
      '# Roadmap: adopted-repo',
      '',
      '## Milestones',
      '',
      '- **v0.1 — Adopted** (2026-01-01, current): no objectives yet.',
      '',
      '## Objectives',
      '',
      'None yet. Add one with `/devflow:objective add`.',
      '',
      '## Progress',
      '',
      '| Objective | Milestone | Plans | Status | Completed |',
      '|---|---|---|---|---|',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(roadmap), { version: 'v0.1', name: 'Adopted' });
  });

  test('6: no `## Milestones` section → legacy first-match fallback unchanged (`## v2.3: Legacy Name`)', () => {
    const roadmap = [
      '# Roadmap: T',
      '',
      '## v2.3: Legacy Name',
      '',
      '### Objective 1: Foundation',
      '',
    ].join('\n');
    assert.deepEqual(milestoneInfoFor(roadmap), { version: 'v2.3', name: 'Legacy Name' });
  });

  test('7: no ROADMAP.md → { version: "v1.0", name: "milestone" }', () => {
    assert.deepEqual(milestoneInfoFor(null), { version: 'v1.0', name: 'milestone' });
  });
});

/**
 * TRD 40-01 (TOOL-06): update-job-progress ticks the objective's nested
 * `- [ ] NN-MM-TRD.md — ...` checkboxes from SUMMARY.md presence.
 *
 * Root cause: cmdRoadmapUpdateJobProgress refreshed the Progress row and the
 * `**Jobs:**` counter but never the per-TRD checkbox list. That logic lives in
 * roadmap-reconcile.cjs reconcile(), which only `/devflow:workstreams
 * reconcile` called, so the list drifted after every autonomous TRD (the
 * drift roadmap-reconcile E2E1 catches). The fix runs reconcile() in dry-run
 * and applies ONLY this objective's per-TRD changes: other objectives' lines
 * and every `**Status:**` rollup stay byte-identical.
 */
describe('roadmap update-job-progress — nested TRD checkboxes', () => {
  const NESTED_ROADMAP = [
    '# Roadmap: Test Project',
    '',
    '## Milestones',
    '',
    '- 🚧 **v1.3 — Current** — Objectives 39-40 (in progress)',
    '',
    '## Objectives',
    '',
    '### Objective 39: Sibling objective',
    '',
    '**Goal:** A sibling whose TRD line has real drift but must not be touched.',
    '**Status:** in flight',
    '**Jobs:** 0/1 executed',
    '',
    'Jobs:',
    '- [ ] 39-01-TRD.md — x',
    '',
    '### Objective 40: Objective under test',
    '',
    '**Goal:** Exercise nested TRD checkbox ticking.',
    '**Status:** in flight',
    '**Jobs:** 3 TRDs in 1 wave',
    '',
    'Jobs:',
    '- [ ] 40-01-TRD.md — a',
    '- [ ] 40-02-TRD.md — b',
    '- [ ] 40-03-TRD.md — c',
    '',
    '## Progress',
    '',
    '| Objective | Milestone | Plans | Status | Completed |',
    '|---|---|---|---|---|',
    '| 39. Sibling objective | v1.3 | 0/1 | Planned | — |',
    '| 40. Objective under test | v1.3 | 0/3 | Planned | — |',
    '',
  ].join('\n');

  // `verdicts40` maps a TRD suffix ('01'..'03') to 'PASSED' | 'FAILED'; a
  // missing key means no SUMMARY for that TRD. Objective 39 always has a
  // PASSED 39-01-SUMMARY.md on disk, so reconcile() sees drift there too.
  function writeNestedFixture(verdicts40) {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), NESTED_ROADMAP, 'utf-8');

    const dir40 = path.join(project, '.planning', 'objectives', '40-fixture');
    fs.mkdirSync(dir40, { recursive: true });
    for (const id of ['01', '02', '03']) {
      fs.writeFileSync(path.join(dir40, `40-${id}-TRD.md`), `# TRD 40-${id}\n`, 'utf-8');
      if (verdicts40[id]) {
        fs.writeFileSync(
          path.join(dir40, `40-${id}-SUMMARY.md`),
          `# Summary 40-${id}\n\n## Self-Check: ${verdicts40[id]}\n`,
          'utf-8'
        );
      }
    }

    const dir39 = path.join(project, '.planning', 'objectives', '39-other');
    fs.mkdirSync(dir39, { recursive: true });
    fs.writeFileSync(path.join(dir39, '39-01-TRD.md'), '# TRD 39-01\n', 'utf-8');
    fs.writeFileSync(path.join(dir39, '39-01-SUMMARY.md'), '# Summary 39-01\n\n## Self-Check: PASSED\n', 'utf-8');
    return project;
  }

  function readRoadmap(project) {
    return fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
  }

  // Lines of the `### Objective N:` section, up to the next ##/### heading.
  function sectionLines(roadmap, objectiveNum) {
    const lines = roadmap.split('\n');
    const start = lines.findIndex(l => l.startsWith(`### Objective ${objectiveNum}:`));
    assert.ok(start >= 0, `Objective ${objectiveNum} section not found`);
    const out = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{2,3} /.test(lines[i])) break;
      out.push(lines[i]);
    }
    return out;
  }

  function statusLine(roadmap, objectiveNum) {
    return sectionLines(roadmap, objectiveNum).find(l => l.startsWith('**Status:**'));
  }

  test('8: PASSED SUMMARY → [x], FAILED SUMMARY → [ ] (failed), no SUMMARY → unchanged; output reports the ticks', () => {
    const project = writeNestedFixture({ '01': 'PASSED', '02': 'FAILED' });

    const result = run(['roadmap', 'update-job-progress', '40'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.updated, true);

    const lines40 = sectionLines(readRoadmap(project), 40);
    assert.ok(lines40.includes('- [x] 40-01-TRD.md — a'), `40-01 not ticked:\n${lines40.join('\n')}`);
    assert.ok(lines40.includes('- [ ] 40-02-TRD.md — b (failed)'), `40-02 not marked failed:\n${lines40.join('\n')}`);
    assert.ok(lines40.includes('- [ ] 40-03-TRD.md — c'), `40-03 (no SUMMARY) changed:\n${lines40.join('\n')}`);

    assert.equal(result.json.trd_checkboxes_ticked, 2);
    assert.deepEqual(result.json.trd_checkboxes, ['40-01', '40-02']);

    // Pre-existing output fields are unchanged.
    assert.equal(result.json.objective, '40');
    assert.equal(result.json.job_count, 3);
    assert.equal(result.json.summary_count, 2);
    assert.equal(result.json.status, 'In Progress');
    assert.equal(result.json.complete, false);
  });

  test('9: scoping — objective 39\'s TRD line stays [ ] (section byte-identical) even though its SUMMARY exists', () => {
    const project = writeNestedFixture({ '01': 'PASSED', '02': 'FAILED' });

    run(['roadmap', 'update-job-progress', '40'], project);
    const roadmap = readRoadmap(project);

    assert.deepEqual(sectionLines(roadmap, 39), sectionLines(NESTED_ROADMAP, 39));
    assert.ok(roadmap.split('\n').includes('- [ ] 39-01-TRD.md — x'));

    // Fixture sanity: the drift on 39 is real — reconcile() still proposes it,
    // so the untouched line proves scoping, not an absent change.
    const { reconcile } = require('./roadmap-reconcile.cjs');
    const pending = reconcile({ projectRoot: project, mode: 'dry-run' }).changes;
    assert.ok(
      pending.some(c => c.kind === 'trd_summary_exists' && c.trd_id === '39-01'),
      'fixture must carry real 39-01 drift for this test to prove scoping'
    );
  });

  test('10: rollup suppression — every 40 TRD ticked, yet the **Status:** lines stay byte-identical', () => {
    const project = writeNestedFixture({ '01': 'PASSED', '02': 'PASSED', '03': 'PASSED' });

    const result = run(['roadmap', 'update-job-progress', '40'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.trd_checkboxes_ticked, 3);
    assert.deepEqual(result.json.trd_checkboxes, ['40-01', '40-02', '40-03']);

    const roadmap = readRoadmap(project);
    const lines40 = sectionLines(roadmap, 40);
    for (const l of ['- [x] 40-01-TRD.md — a', '- [x] 40-02-TRD.md — b', '- [x] 40-03-TRD.md — c']) {
      assert.ok(lines40.includes(l), `missing "${l}":\n${lines40.join('\n')}`);
    }

    assert.equal(statusLine(roadmap, 40), '**Status:** in flight');
    assert.equal(statusLine(roadmap, 39), '**Status:** in flight');
    // reconcile's Progress-row rollup (` complete YYYY-MM-DD ` in the last cell) is not applied either.
    assert.doesNotMatch(progressRow(roadmap, 40), /\|\s*complete \d{4}-\d{2}-\d{2}\s*\|/);

    // Fixture sanity: the rollup is real — reconcile() would still change 40's Status line.
    const { reconcile } = require('./roadmap-reconcile.cjs');
    const pending = reconcile({ projectRoot: project, mode: 'dry-run' }).changes;
    assert.ok(
      pending.some(c => c.kind === 'objective_rollup_status' && c.objective_num === '40'),
      'fixture must carry a real 40 rollup for this test to prove suppression'
    );
  });

  test('11: idempotent — a second run leaves ROADMAP.md byte-identical and reports trd_checkboxes_ticked: 0', () => {
    const project = writeNestedFixture({ '01': 'PASSED', '02': 'FAILED' });

    run(['roadmap', 'update-job-progress', '40'], project);
    const first = readRoadmap(project);

    const second = run(['roadmap', 'update-job-progress', '40'], project);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readRoadmap(project), first, 'second run must be byte-identical to the first');
    assert.equal(second.json.trd_checkboxes_ticked, 0);
    assert.deepEqual(second.json.trd_checkboxes, []);
  });
});
