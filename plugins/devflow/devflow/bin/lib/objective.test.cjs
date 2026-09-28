'use strict';

/**
 * Regression coverage for `df-tools objective complete <N>`.
 *
 * Root cause under test (roadmap-progress-row-corruption): same class of bug
 * as roadmap.test.cjs's `update-job-progress` coverage, plus a second,
 * independent bug in the STATE.md block:
 *
 *   1. Progress-table regex assumed the older 4-column shape
 *      (`| Objective | Plans | Status | Completed |`). Run against this
 *      repo's real 5-column shape (`| Objective | Milestone | Plans | Status
 *      | Completed |`), it shifted values one column over: Plans got
 *      overwritten with the literal string "Complete", Status got the date,
 *      and Milestone/Completed were left wrong or untouched.
 *   2. The `**Jobs:**` line was replaced in full, discarding hand-authored
 *      wave/requirement-ID detail.
 *   3. The STATE.md block blindly rewrote `**Status:**` to a short templated
 *      string ("Ready to plan" / "Milestone complete") designed for the
 *      OLD STATE.md schema (`**Current Objective:**`, `**Current Job:**`,
 *      `**Last Activity:**`, ...). Projects that migrated to the narrative
 *      convention (a running `**Objective complete:** N — ...` log plus one
 *      free-text `**Status:**` summary line, and no `**Current Objective:**`
 *      field at all) still have a field literally named `**Status:**`, so it
 *      matched and got clobbered — silently discarding an accumulated
 *      multi-paragraph project summary and regressing status backward to
 *      "Ready to plan" for an objective that had just been completed.
 *
 * Fixtures mirror this repo's real ROADMAP.md/STATE.md: 5-column Progress
 * table, `<details>`-collapsed milestone blocks with duplicate objective
 * numbers, suffixed TRD ids (12-04a/b/c), and a narrative-style STATE.md
 * with no `**Current Objective:**` field.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

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
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-complete-')));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives'), { recursive: true });
  return dir;
}

function fakeHomeEnv() {
  const home = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-complete-home-')));
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

function writeObjective13Dir(project) {
  const dir = path.join(project, '.planning', 'objectives', '13-next-objective');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '13-01-TRD.md'), '# TRD 01\n', 'utf-8');
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
- [x] 12-08-TRD.md — Wave 4: eighth

### Objective 13: Next objective

**Goal:** Comes after the one under test.
**Depends on:** Objective 12
**Jobs:** 0 jobs

Jobs:
- [ ] TBD (run /devflow:plan-objective 13 to break down)
`;

const NARRATIVE_STATE = `# STATE.md

**Building:** Test Project
**Core Value:** exercising STATE.md narrative-schema preservation

**Milestone:** v1.1 — in flight
**Branch:** \`main\`
**Objective complete:** 10 — Something earlier (verified 2026-01-01, 12/12 tests, all SC met)
**Objective complete:** 11 — Prior objective (verified 2026-02-01, 20/20 tests, all SC met)
**Status:** v1.1 in flight — objectives 1–11 complete; next 12 (Objective under test, in progress); last release v0.9.0 (2026-01-01)
`;

const TEMPLATE_STATE = `# STATE.md

**Project:** Test Project

**Current Objective:** 12
**Current Objective Name:** objective under test
**Status:** In progress
**Current Job:** 12-08
**Last Activity:** 2026-01-20
**Last Activity Description:** Working on job 12-08
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

describe('objective complete — ROADMAP.md 5-column table (Milestone column present)', () => {
  test('marks objective 12 Complete without disturbing Milestone or sibling rows', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.completed_objective, '12');

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const row12 = progressRow(roadmap, 12);

    assert.match(row12, /\|\s*v1\.1\s*\|/, `Milestone column dropped/corrupted: ${row12}`);
    assert.match(row12, /\|\s*Complete\s*\|/, `Status column wrong: ${row12}`);
    assert.match(row12, /\|\s*\d{4}-\d{2}-\d{2}\s*\|$/, `Completed date not set: ${row12}`);

    assert.equal(progressRow(roadmap, 11), '| 11. Prior objective | v1.1 | 2/2 | Complete | 2026-02-01 |');
    assert.equal(progressRow(roadmap, 13), '| 13. Next objective | v1.1 | 0/— | Registered | — |');
  });

  test('preserves hand-authored **Jobs:** detail on the completed objective', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    run(['objective', 'complete', '12'], project);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    const line = jobsLine(roadmap, 12);
    assert.ok(line, 'Jobs line for objective 12 not found');
    assert.match(line, /^\*\*Jobs:\*\*\s*10\/10 jobs complete/, `counter prefix missing: ${line}`);
    assert.match(line, /10 TRDs in 4 waves/, `original planning detail was wiped: ${line}`);
    assert.match(line, /04a\/04b\/04c/, `wave-split annotation was wiped: ${line}`);

    assert.equal(jobsLine(roadmap, 11), '**Jobs:** 2/2 complete');
  });

  test('duplicate "Objective 1" checklist entries inside the collapsed <details> block are never touched', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    run(['objective', 'complete', '12'], project);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.match(roadmap, /- \[x\] Objective 1: Foundation \(3\/3 plans\)/);
    assert.match(roadmap, /- \[x\] Objective 1: Duplicate marker from parallel session \(2\/2 plans\) <!-- duplicate number, parallel session -->/);
  });
});

describe('objective complete — STATE.md narrative schema (no **Current Objective:** field)', () => {
  test('does not reset **Status:** to "Ready to plan"; narrative content survives byte-identical', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    run(['objective', 'complete', '12'], project);

    const state = fs.readFileSync(path.join(project, '.planning', 'STATE.md'), 'utf-8');
    assert.doesNotMatch(state, /\*\*Status:\*\*\s*Ready to plan/, 'STATE.md Status regressed to "Ready to plan"');
    assert.doesNotMatch(state, /\*\*Status:\*\*\s*Milestone complete/, 'STATE.md Status was clobbered with the legacy template value');
    assert.equal(state, NARRATIVE_STATE, 'narrative STATE.md must be left untouched — this project does not use the legacy Current Objective/Current Job schema');
  });
});

describe('objective complete — STATE.md legacy/template schema (backward compatibility)', () => {
  test('still advances Current Objective + Status to the documented "Ready to plan" value', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), TEMPLATE_STATE, 'utf-8');

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.next_objective, '13');

    const state = fs.readFileSync(path.join(project, '.planning', 'STATE.md'), 'utf-8');
    assert.match(state, /\*\*Current Objective:\*\*\s*13/);
    assert.match(state, /\*\*Status:\*\*\s*Ready to plan/);
    assert.match(state, /\*\*Current Job:\*\*\s*Not started/);
  });
});
