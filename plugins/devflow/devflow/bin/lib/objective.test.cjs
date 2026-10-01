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
 *   4. (TOOL-02) The fix for 3 over-corrected: on the narrative schema it
 *      wrote nothing at all, so the running log never gained the completed
 *      objective, and `state_updated` was `fs.existsSync(statePath)` — true
 *      even though nothing was written.
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

function statusLine(state) {
  return state.split('\n').find(l => l.startsWith('**Status:**')) || null;
}

function removeLines(text, re) {
  const lines = text.split('\n');
  const removed = lines.filter(l => re.test(l));
  const rest = lines.filter(l => !re.test(l)).join('\n');
  return { rest, removed };
}

function readState(project) {
  return fs.readFileSync(path.join(project, '.planning', 'STATE.md'), 'utf-8');
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
  // TOOL-02 (TRD 40-02) tightened this from "byte-identical" to "byte-identical
  // apart from exactly one appended **Objective complete:** 12 log line". The
  // intent is unchanged: narrative content survives and **Status:** is never
  // re-derived. Only the running log gains one line.
  test('does not reset **Status:** to "Ready to plan"; narrative content survives apart from one appended log line', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    run(['objective', 'complete', '12'], project);

    const state = fs.readFileSync(path.join(project, '.planning', 'STATE.md'), 'utf-8');
    assert.doesNotMatch(state, /\*\*Status:\*\*\s*Ready to plan/, 'STATE.md Status regressed to "Ready to plan"');
    assert.doesNotMatch(state, /\*\*Status:\*\*\s*Milestone complete/, 'STATE.md Status was clobbered with the legacy template value');
    assert.equal(statusLine(state), statusLine(NARRATIVE_STATE), 'the free-text **Status:** line must be byte-identical');

    const { rest, removed } = removeLines(state, /^\*\*Objective complete:\*\* 12 — /);
    assert.equal(removed.length, 1, `expected exactly one appended objective-12 log line, got ${removed.length}`);
    assert.equal(rest, NARRATIVE_STATE, 'apart from the one appended log line, narrative STATE.md must be left untouched — this project does not use the legacy Current Objective/Current Job schema');
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

    // TOOL-02: the flag reports an actual write, not file existence.
    assert.equal(result.json.state_updated, true);
    assert.equal(result.json.state_update_reason, null);
  });

  test('TOOL-02: a second run that changes nothing reports state_updated false (unchanged)', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), TEMPLATE_STATE, 'utf-8');

    const first = run(['objective', 'complete', '12'], project);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.state_updated, true);
    const afterFirst = readState(project);

    const second = run(['objective', 'complete', '12'], project);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readState(project), afterFirst, 'second run must not rewrite an already-advanced legacy STATE.md');
    assert.equal(second.json.state_updated, false);
    assert.equal(second.json.state_update_reason, 'unchanged');
  });
});

describe('objective complete — Jobs-line leading-count seed (quick-20)', () => {
  const SEEDED_ROADMAP = FIVE_COLUMN_ROADMAP.replace(
    '**Jobs:** 10 TRDs in 4 waves (planned 2026-01-15; 12-04',
    '**Jobs:** 0/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04'
  );

  test('fixture sanity: the seed replace actually changed the string', () => {
    assert.notEqual(SEEDED_ROADMAP, FIVE_COLUMN_ROADMAP);
    assert.match(SEEDED_ROADMAP, /\*\*Jobs:\*\* 0\/10 complete — 10 TRDs in 4 waves/);
  });

  test('14: objective complete 12 — leading count replaced in place, no "jobs" inserted', () => {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), SEEDED_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), NARRATIVE_STATE, 'utf-8');

    run(['objective', 'complete', '12'], project);

    const roadmap = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.equal(
      jobsLine(roadmap, 12),
      '**Jobs:** 10/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)'
    );
  });
});

// TOOL-02 (TRD 40-02): on a narrative STATE.md, `objective complete` used to
// write nothing at all while reporting `state_updated: fs.existsSync(statePath)`
// — true whenever the file existed. That is why objectives 37-39 never reached
// this repo's running `**Objective complete:** N — ...` log. It now appends one
// log line after the last existing one (idempotent, never touching Status) and
// reports whether a write actually happened.
describe('objective complete — narrative log append + truthful state_updated (TOOL-02)', () => {
  const LOG_12 = /^\*\*Objective complete:\*\* 12 — /;

  function narrativeProject({ roadmap = FIVE_COLUMN_ROADMAP, state = NARRATIVE_STATE } = {}) {
    const project = tmpProject();
    if (roadmap !== null) {
      fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), roadmap, 'utf-8');
    }
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    if (state !== null) {
      fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), state, 'utf-8');
    }
    return project;
  }

  test('1: inserts one **Objective complete:** 12 line directly after the last log line; state_updated true', () => {
    const project = narrativeProject();

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.state_updated, true);
    assert.equal(result.json.state_update_reason, null);

    const original = NARRATIVE_STATE.split('\n');
    const idx11 = original.findIndex(l => l.startsWith('**Objective complete:** 11 — '));
    assert.ok(idx11 >= 0, 'fixture sanity: objective 11 log line present');

    const lines = readState(project).split('\n');
    const inserted = lines[idx11 + 1];
    assert.match(
      inserted,
      /^\*\*Objective complete:\*\* 12 — .+ \(completed \d{4}-\d{2}-\d{2}, 10\/10 TRDs\)$/,
      `line after the objective 11 log line is not the new log line: ${inserted}`
    );

    const expected = original.slice();
    expected.splice(idx11 + 1, 0, inserted);
    assert.equal(lines.join('\n'), expected.join('\n'), 'STATE.md must equal the original plus exactly one inserted line');
  });

  test('2: the title comes from the ROADMAP `### Objective 12:` heading', () => {
    const project = narrativeProject();

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);

    const logLine = readState(project).split('\n').find(l => LOG_12.test(l));
    assert.equal(logLine, `**Objective complete:** 12 — Objective under test (completed ${result.json.date}, 10/10 TRDs)`);
  });

  test('2b: a trailing ✅ on the ROADMAP heading is stripped from the title', () => {
    const roadmap = FIVE_COLUMN_ROADMAP.replace(
      '### Objective 12: Objective under test\n',
      '### Objective 12: Objective under test ✅\n'
    );
    assert.notEqual(roadmap, FIVE_COLUMN_ROADMAP, 'fixture sanity: heading replace applied');
    const project = narrativeProject({ roadmap });

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);

    const logLine = readState(project).split('\n').find(l => LOG_12.test(l));
    assert.equal(logLine, `**Objective complete:** 12 — Objective under test (completed ${result.json.date}, 10/10 TRDs)`);
  });

  test('2c: with no ROADMAP heading the title falls back to objective_name with hyphens as spaces', () => {
    const project = narrativeProject({ roadmap: null });

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.state_updated, true);

    const logLine = readState(project).split('\n').find(l => LOG_12.test(l));
    assert.equal(logLine, `**Objective complete:** 12 — objective under test (completed ${result.json.date}, 10/10 TRDs)`);
  });

  test('4: idempotent — a second run writes nothing and reports already_logged', () => {
    const project = narrativeProject();

    const first = run(['objective', 'complete', '12'], project);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.state_updated, true);
    const afterFirst = readState(project);

    const second = run(['objective', 'complete', '12'], project);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.state_updated, false);
    assert.equal(second.json.state_update_reason, 'already_logged');

    const afterSecond = readState(project);
    assert.equal(afterSecond, afterFirst, 'second run must leave STATE.md byte-identical');
    assert.equal(afterSecond.split('\n').filter(l => LOG_12.test(l)).length, 1);
  });

  test('5: narrative STATE.md with no log line at all is left byte-identical (no_log_anchor)', () => {
    const NO_ANCHOR_STATE = `# STATE.md

**Building:** Test Project
**Milestone:** v1.1 — in flight
**Status:** v1.1 in flight — objectives 1–11 complete; next 12 (Objective under test, in progress)

## Session Continuity

Last session: 2026-01-20
`;
    const project = narrativeProject({ state: NO_ANCHOR_STATE });

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(project), NO_ANCHOR_STATE, 'no anchor — nothing may be written, not even at end-of-file');
    assert.equal(result.json.state_updated, false);
    assert.equal(result.json.state_update_reason, 'no_log_anchor');
  });

  test('6: missing STATE.md reports state_missing and still exits 0', () => {
    const project = narrativeProject({ state: null });

    const result = run(['objective', 'complete', '12'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(project, '.planning', 'STATE.md')), false, 'STATE.md must not be created');
    assert.equal(result.json.state_updated, false);
    assert.equal(result.json.state_update_reason, 'state_missing');
  });

  test('decimal objective 12.1 is not mistaken for an already-logged objective 12', () => {
    const roadmap = `${FIVE_COLUMN_ROADMAP}
### Objective 12.1: Hotfix insert

**Goal:** Decimal objective inserted after 12.
`;
    const state = NARRATIVE_STATE.replace(
      '**Status:**',
      '**Objective complete:** 12 — Objective under test (verified 2026-01-21, 10/10 TRDs)\n**Status:**'
    );
    assert.notEqual(state, NARRATIVE_STATE, 'fixture sanity: objective 12 log line added');
    const project = narrativeProject({ roadmap, state });
    const dir = path.join(project, '.planning', 'objectives', '12.1-hotfix-insert');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '12.1-01-TRD.md'), '# TRD 01\n', 'utf-8');
    fs.writeFileSync(path.join(dir, '12.1-01-SUMMARY.md'), '# Summary 01\n', 'utf-8');

    const result = run(['objective', 'complete', '12.1'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.state_updated, true, `state_update_reason: ${result.json.state_update_reason}`);

    const lines = readState(project).split('\n');
    const idx12 = lines.findIndex(l => LOG_12.test(l));
    assert.equal(lines[idx12 + 1], `**Objective complete:** 12.1 — Hotfix insert (completed ${result.json.date}, 1/1 TRDs)`);
  });

  test('zero-padded input is normalized: `07` writes `7 —`, and a later `7` is already_logged', () => {
    const project = tmpProject();
    const dir = path.join(project, '.planning', 'objectives', '07-seventh');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '07-01-TRD.md'), '# TRD 01\n', 'utf-8');
    fs.writeFileSync(path.join(dir, '07-01-SUMMARY.md'), '# Summary 01\n', 'utf-8');
    const state = `# STATE.md

**Objective complete:** 6 — Sixth (verified 2026-01-01)
**Status:** in flight
`;
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), state, 'utf-8');

    const first = run(['objective', 'complete', '07'], project);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.state_updated, true);
    assert.equal(
      readState(project),
      `# STATE.md

**Objective complete:** 6 — Sixth (verified 2026-01-01)
**Objective complete:** 7 — seventh (completed ${first.json.date}, 1/1 TRDs)
**Status:** in flight
`
    );

    const second = run(['objective', 'complete', '7'], project);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.state_updated, false);
    assert.equal(second.json.state_update_reason, 'already_logged');
  });
});

// TOOL-02 sibling (TRD 40-02, Rule 1): `objective remove --confirm` had the same
// `state_updated: fs.existsSync(statePath)` defect — it rewrote STATE.md
// unconditionally and reported true even when neither count pattern matched.
describe('objective remove --confirm — truthful state_updated (TOOL-02 sibling)', () => {
  function removableProject(state) {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), FIVE_COLUMN_ROADMAP, 'utf-8');
    writeObjective12Dir(project, 10);
    writeObjective13Dir(project);
    fs.writeFileSync(path.join(project, '.planning', 'STATE.md'), state, 'utf-8');
    return project;
  }

  test('no objective-count field in STATE.md: nothing written, state_updated false', () => {
    const project = removableProject(NARRATIVE_STATE);

    const result = run(['objective', 'remove', '13', '--confirm'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.mutated, true);
    assert.equal(readState(project), NARRATIVE_STATE);
    assert.equal(result.json.state_updated, false);
  });

  test('**Total Objectives:** present: decremented, state_updated true', () => {
    const state = `${TEMPLATE_STATE}**Total Objectives:** 13\n`;
    const project = removableProject(state);

    const result = run(['objective', 'remove', '13', '--confirm'], project);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readState(project), /\*\*Total Objectives:\*\* 12\n/);
    assert.equal(result.json.state_updated, true);
  });
});

// ─── TRD 48-14: objective ops in local mode (characterization) and store mode ─
//
// Local mode (github.store off; here github.enabled is on, which must not matter) is pinned byte for byte BEFORE
// the store branches exist. The `gh` shim answers like an unreachable GitHub; local mode must never call it.

const { storeCliProject } = require('./__fixtures__/store-cli-fixtures.cjs');
const { STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

const OBJ7 = `objectives/${STORE_FIXTURE.objectiveDir}`;
const todayIso = () => new Date().toISOString().split('T')[0];

function withProject(opts, fn) {
  const p = storeCliProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

/** Local mode makes zero gh calls and leaves no outbox journal and no ledger. */
function assertLocalQuiet(p) {
  assert.deepEqual(p.ghCalls(), [], 'local mode never calls gh');
  assert.deepEqual(p.journalOps(), [], 'local mode writes no outbox journal');
  assert.deepEqual(p.ledgerEntries(), {}, 'local mode writes no verb-write ledger');
}

describe('48-14 characterization: objective ops in local mode', () => {
  test('1a: objective add "Foo bar" -> dir + .gitkeep + ROADMAP entry, exact bytes', () => {
    withProject({ store: false }, (p) => {
      const r = p.run(['objective', 'add', 'Foo bar']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, JSON.stringify({
        objective_number: 8,
        padded: '08',
        name: 'Foo bar',
        slug: 'foo-bar',
        directory: '.planning/objectives/08-foo-bar',
      }, null, 2));
      assert.equal(p.read('objectives/08-foo-bar/.gitkeep'), '');
      assert.equal(fs.existsSync(p.planning('objectives/08-foo-bar/OBJECTIVE.md')), false);
      assert.equal(p.read('ROADMAP.md'), STORE_FIXTURE.roadmap + [
        '',
        '### Objective 8: Foo bar',
        '',
        '**Goal:** [To be planned]',
        '**Depends on:** Objective 7',
        '**Jobs:** 0 jobs',
        '',
        'Jobs:',
        '- [ ] TBD (run /devflow:plan-objective 8 to break down)',
        '',
      ].join('\n'));
      assertLocalQuiet(p);
    });
  });

  test('1b: objective insert stays deprecated (exit 1, nothing written)', () => {
    withProject({ store: false }, (p) => {
      const before = p.snapshot();
      const r = p.run(['objective', 'insert', '7', 'Foo bar']);
      assert.equal(r.status, 1);
      assert.equal(r.stdout, `${JSON.stringify({
        error: 'decimal-objective insertion was deprecated in v1.2; use df-tools objective add to append instead',
        removed_in: '12-06',
        recommendation: 'Use `df-tools objective add <description>` to append a new integer objective.',
      }, null, 2)}\n`);
      assert.deepEqual(p.snapshot(), before);
      assertLocalQuiet(p);
    });
  });

  test('1c: objective remove 7 --confirm --force -> dir deleted, ROADMAP section removed, exact bytes', () => {
    withProject({ store: false }, (p) => {
      const r = p.run(['objective', 'remove', '7', '--confirm', '--force']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, JSON.stringify({
        removed: '7',
        dry_run: false,
        confirmed: true,
        mutated: true,
        partial: false,
        directory_deleted: '07-store-demo',
        target_directory: '07-store-demo',
        renamed_directories: [],
        renamed_files: [],
        roadmap_updated: true,
        state_updated: false,
      }, null, 2));
      assert.equal(fs.existsSync(p.planning(OBJ7)), false);
      assert.equal(p.read('ROADMAP.md'), '# Roadmap: Store Demo\n\n## Milestones\n\n- 🚧 **v9.9 Store Demo** - Objective 7 (in progress)\n\n## Objectives\n');
      assertLocalQuiet(p);
    });
  });

  test('1d: objective complete 7 -> REQUIREMENTS ticked from the ROADMAP line, ROADMAP/OBJECTIVE unchanged, exact output', () => {
    withProject({ store: false }, (p) => {
      const r = p.run(['objective', 'complete', '7']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, JSON.stringify({
        completed_objective: '7',
        objective_name: 'store-demo',
        jobs_executed: '1/3',
        next_objective: null,
        next_objective_name: null,
        is_last_objective: true,
        date: todayIso(),
        roadmap_updated: true,
        state_updated: false,
        state_update_reason: 'state_missing',
      }, null, 2));
      assert.equal(p.read('ROADMAP.md'), STORE_FIXTURE.roadmap);
      assert.equal(p.read(`${OBJ7}/OBJECTIVE.md`), STORE_FIXTURE.objective);
      assert.equal(p.read('REQUIREMENTS.md'), STORE_FIXTURE.requirements.replace(/- \[ \] \*\*STO-0/g, '- [x] **STO-0'));
      assert.equal(fs.existsSync(p.planning('STATE.md')), false);
      assertLocalQuiet(p);
    });
  });
});
