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

describe('48-14 store mode: objective ops route through the planning verbs', () => {
  const NEW_OBJECTIVE = [
    '---',
    'objective: 08-foo-bar',
    'status: planned',
    '---',
    '',
    '# Objective 8: Foo bar',
    '',
    '**Goal:** [To be planned]',
    '**Depends on:** Objective 7',
    '**Jobs:** 0 jobs',
    '',
    'Jobs:',
    '- [ ] TBD (run /devflow:plan-objective 8 to break down)',
    '',
  ].join('\n');

  test('2: objective add "Foo bar" -> dir + OBJECTIVE.md through objective put; ROADMAP untouched; offline create is reported', () => {
    withProject({ store: true }, (p) => {
      const r = p.run(['objective', 'add', 'Foo bar']);
      // Objective 8 has no issue yet and GitHub is unreachable: the verb writes and ledgers the file but cannot
      // create the issue offline, so it says so with exit 1 (48-11 objectivePut semantics).
      assert.equal(r.status, 1, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.objective_number, 8);
      assert.equal(out.padded, '08');
      assert.equal(out.slug, 'foo-bar');
      assert.equal(out.directory, '.planning/objectives/08-foo-bar');
      assert.equal(out.roadmap, 'generated (gh pull --all)');
      assert.equal(out.published, false);
      assert.equal(out.verb.mode, 'store');
      assert.equal(out.verb.rel, 'objectives/08-foo-bar/OBJECTIVE.md');
      assert.match(out.verb.error, /cannot be created offline/);
      assert.match(out.hint, /gh sync 8/);

      assert.equal(p.read('objectives/08-foo-bar/OBJECTIVE.md'), NEW_OBJECTIVE);
      assert.equal(p.read('ROADMAP.md'), STORE_FIXTURE.roadmap, 'ROADMAP.md is a generated view in store mode');
      assert.equal(fs.existsSync(p.planning('STATE.md')), false);
      const entry = p.ledgerEntries()['objectives/08-foo-bar/OBJECTIVE.md'];
      assert.ok(entry, 'the OBJECTIVE.md write is in the verb ledger');
      assert.equal(entry.verb, 'objective put (not queued)');
      assert.ok(p.ghCalls().length > 0, 'store mode went through the objective sync');
      assert.equal(p.journalOps().filter((op) => op.target && op.target.id === '8').length, 0, 'nothing queued for an issue that does not exist');
    });
  });

  test('2b: objective add numbers from the objective dirs when the generated ROADMAP.md is absent', () => {
    withProject({ store: true }, (p) => {
      fs.rmSync(p.planning('ROADMAP.md'));
      const r = p.run(['objective', 'add', 'Foo bar']);
      const out = JSON.parse(r.stdout);
      assert.equal(out.objective_number, 8);
      assert.equal(p.read('objectives/08-foo-bar/OBJECTIVE.md'), NEW_OBJECTIVE);
      assert.equal(fs.existsSync(p.planning('ROADMAP.md')), false);
    });
  });

  test('2c: objective add of a mapped objective number queues the objective ops (exit 3 pending)', () => {
    // Remove objective 7's directory and ROADMAP entry so add re-uses number 7, which the fixture maps to an issue.
    withProject({ store: true }, (p) => {
      fs.rmSync(p.planning(OBJ7), { recursive: true });
      const roadmap = '# Roadmap: Store Demo\n\n### Objective 6: Prior\n';
      fs.writeFileSync(p.planning('ROADMAP.md'), roadmap);
      const r = p.run(['objective', 'add', 'Store demo']);
      assert.equal(r.status, 3, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.published, true);
      assert.equal(out.verb.flush, 'pending');
      assert.equal(p.read('ROADMAP.md'), roadmap);
      const kinds = p.journalOps().map((op) => op.kind);
      assert.ok(kinds.includes('patch-body'), `objective body queued: ${kinds}`);
      assert.ok(kinds.includes('wiki-push'), `objective page queued: ${kinds}`);
      const wiki = p.journalOps().find((op) => op.kind === 'wiki-push');
      assert.ok(wiki.payload.pages.includes('objectives/07-store-demo/OBJECTIVE.md'));
      assert.equal(p.ledgerEntries()['objectives/07-store-demo/OBJECTIVE.md'].verb, 'objective put');
    });
  });

  test('3: objective remove 7 --confirm is refused; nothing deleted, no gh call', () => {
    withProject({ store: true }, (p) => {
      const before = p.snapshot();
      const r = p.run(['objective', 'remove', '7', '--confirm']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /objective remove is refused in store mode: deletes are never automatic/);
      assert.match(r.stderr, /df-tools objective set-status 7 cancelled/);
      assert.deepEqual(p.snapshot(), before);
      assert.deepEqual(p.ghCalls(), []);
      assert.deepEqual(p.journalOps(), []);
    });
  });

  test('3b: objective remove --force --confirm is refused too', () => {
    withProject({ store: true }, (p) => {
      const before = p.snapshot();
      const r = p.run(['objective', 'remove', '7', '--confirm', '--force']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /deletes are never automatic/);
      assert.deepEqual(p.snapshot(), before);
    });
  });

  test('4: objective complete 7 -> objective set-status complete: patch-issue closed/completed queued; ROADMAP/STATE/REQUIREMENTS untouched', () => {
    withProject({ store: true }, (p) => {
      const r = p.run(['objective', 'complete', '7']);
      assert.equal(r.status, 3, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.completed, true);
      assert.equal(out.completed_objective, '7');
      assert.equal(out.objective_name, 'store-demo');
      assert.equal(out.jobs_executed, '1/3');
      assert.equal(out.date, todayIso());
      assert.equal(out.roadmap_updated, false);
      assert.equal(out.state_updated, false);
      assert.equal(out.roadmap, 'generated (gh pull --all)');
      assert.equal(out.verb.rel, `${OBJ7}/OBJECTIVE.md`);
      assert.equal(out.verb.flush, 'pending');
      assert.equal(out.verb.exit, 3);

      const patch = p.journalOps().find((op) => op.kind === 'patch-issue');
      assert.ok(patch, 'a patch-issue op is queued');
      assert.deepEqual(patch.target, { id: '7' });
      assert.equal(patch.payload.state, 'closed');
      assert.equal(patch.payload.state_reason, 'completed');

      assert.match(p.read(`${OBJ7}/OBJECTIVE.md`), /^status: complete$/m);
      assert.equal(p.read('ROADMAP.md'), STORE_FIXTURE.roadmap);
      assert.equal(p.read('REQUIREMENTS.md'), STORE_FIXTURE.requirements);
      assert.equal(fs.existsSync(p.planning('STATE.md')), false);
      assert.equal(p.ledgerEntries()[`${OBJ7}/OBJECTIVE.md`].verb, 'objective set-status');
    });
  });

  test('4b: objective insert is deprecated in store mode too (exit 1, nothing written, no gh call)', () => {
    withProject({ store: true }, (p) => {
      const before = p.snapshot();
      const r = p.run(['objective', 'insert', '7', 'Foo bar']);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /deprecated in v1\.2/);
      assert.deepEqual(p.snapshot(), before);
      assert.deepEqual(p.ghCalls(), []);
    });
  });
});

// ─── TRD 53-02: incomplete_jobs pairs on the NN-MM key ───────────────────────

describe('53-02: findObjectiveInternal incomplete_jobs pairs a named TRD with either summary name', () => {
  const { findObjectiveInternal } = require('./objective.cjs');

  function projectWith(files) {
    const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-pairing-')));
    const dir = path.join(root, '.planning', 'objectives', '07-demo');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of files) fs.writeFileSync(path.join(dir, name), '# x\n');
    return root;
  }

  test('a named TRD with a short-name summary is not in incomplete_jobs', () => {
    const root = projectWith(['07-01-alpha-TRD.md', '07-01-SUMMARY.md']);
    assert.deepEqual(findObjectiveInternal(root, '07').incomplete_jobs, []);
  });

  test('a named TRD with a long-name summary is not in incomplete_jobs', () => {
    const root = projectWith(['07-02-beta-TRD.md', '07-02-beta-SUMMARY.md']);
    assert.deepEqual(findObjectiveInternal(root, '07').incomplete_jobs, []);
  });

  test('a named TRD with no summary stays in incomplete_jobs, by file name', () => {
    const root = projectWith(['07-03-gamma-TRD.md', '07-01-alpha-TRD.md', '07-01-SUMMARY.md']);
    assert.deepEqual(findObjectiveInternal(root, '07').incomplete_jobs, ['07-03-gamma-TRD.md']);
  });

  test('07-1 and 07-10 do not pair: another TRD\'s summary does not complete the TRD', () => {
    const root = projectWith(['07-1-x-TRD.md', '07-10-SUMMARY.md']);
    assert.deepEqual(findObjectiveInternal(root, '07').incomplete_jobs, ['07-1-x-TRD.md']);
  });

  test('legacy shapes still pair: NN-MM-TRD / NN-MM-JOB / bare TRD.md', () => {
    assert.deepEqual(findObjectiveInternal(projectWith(['07-01-TRD.md', '07-01-SUMMARY.md']), '07').incomplete_jobs, []);
    assert.deepEqual(findObjectiveInternal(projectWith(['07-01-JOB.md', '07-01-SUMMARY.md']), '07').incomplete_jobs, []);
    assert.deepEqual(findObjectiveInternal(projectWith(['TRD.md', 'SUMMARY.md']), '07').incomplete_jobs, []);
  });
});

// ─── 54-06: objective remove / complete match through text-escape's objectiveNumPattern ────────────

describe('54-06 objective complete: Requirements lookup is scoped to the objective\'s own section', () => {
  function requirementsProject(roadmap, requirements) {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), roadmap, 'utf-8');
    fs.writeFileSync(path.join(project, '.planning', 'REQUIREMENTS.md'), requirements, 'utf-8');
    for (const [dir, n] of [['01-auth', '01'], ['02-api', '02']]) {
      const d = path.join(project, '.planning', 'objectives', dir);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${n}-01-TRD.md`), '# TRD\n', 'utf-8');
      fs.writeFileSync(path.join(d, `${n}-01-SUMMARY.md`), '# Summary\n', 'utf-8');
    }
    return project;
  }

  const REQUIREMENTS = `# Requirements

- [ ] **R-1**: First
- [ ] **R-2**: Second

## Traceability

| Requirement | Objective | Status |
|---|---|---|
| R-1 | Objective 1 | Pending |
| R-2 | Objective 2 | Pending |
`;

  // Item 4. RED before the fix: the lookup started at the first mention of `Objective 2` (the checklist line
  // at the top) and lazily captured the first `**Requirements:**` after it, which is objective 1's.
  test('4: completing objective 2 ticks R-2 and leaves objective 1\'s R-1 alone', () => {
    const project = requirementsProject(`# Roadmap

- [ ] **Objective 1: Auth**
- [ ] **Objective 2: API**

### Objective 1: Auth

**Goal:** Auth.
**Requirements:** R-1
**Jobs:** 1 jobs

### Objective 2: API

**Goal:** API.
**Requirements:** R-2
**Jobs:** 1 jobs
`, REQUIREMENTS);

    const r = run(['objective', 'complete', '2'], project);
    assert.equal(r.status, 0, r.stderr);

    const req = fs.readFileSync(path.join(project, '.planning', 'REQUIREMENTS.md'), 'utf-8');
    assert.match(req, /^- \[x\] \*\*R-2\*\*: Second$/m, 'R-2 is ticked');
    assert.match(req, /^- \[ \] \*\*R-1\*\*: First$/m, 'R-1 stays unticked');
    assert.match(req, /^\| R-2 \| Objective 2 \| Complete \|$/m, 'R-2 row is Complete');
    assert.match(req, /^\| R-1 \| Objective 1 \| Pending \|$/m, 'R-1 row stays Pending');
  });

  // Item 5. RED before the fix: the free-text line was split on whitespace and each token compiled unescaped,
  // so `(tech` threw "Unterminated group" and `objective complete` crashed.
  test('5: a free-text Requirements line with regex metacharacters does not crash and changes nothing', () => {
    const project = requirementsProject(`# Roadmap

- [ ] **Objective 1: Auth**

### Objective 1: Auth

**Goal:** Auth.
**Requirements:** none (tech debt; see OBJECTIVE.md)
**Jobs:** 1 jobs

### Objective 2: API

**Goal:** API.
**Requirements:** R-2
`, REQUIREMENTS);

    const r = run(['objective', 'complete', '1'], project);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(project, '.planning', 'REQUIREMENTS.md'), 'utf-8'), REQUIREMENTS);
  });
});

describe('54-06 objective remove / complete: a decimal number never reaches 4.10 or 4.1.2', () => {
  function decimalProject(extraRoadmap) {
    const project = tmpProject();
    fs.writeFileSync(path.join(project, '.planning', 'ROADMAP.md'), extraRoadmap, 'utf-8');
    for (const dir of ['04.1-one', '04.10-ten']) {
      fs.mkdirSync(path.join(project, '.planning', 'objectives', dir), { recursive: true });
    }
    return project;
  }

  // Item 6. Regression guard: passes on the unmodified code (every site already had a `:`, `[:\s]` or `\.?\s` after
  // the number); it pins the behaviour across the helper swap.
  test('6: remove 4.1 deletes only 4.1\'s section, checkbox and row (regression guard)', () => {
    const project = decimalProject(`# Roadmap

## Objectives

- [ ] **Objective 4.1: One**
- [ ] **Objective 4.10: Ten**
- [ ] **Objective 4.1.2: Sub**

### Objective 4.1: One

**Goal:** One.

### Objective 4.10: Ten

**Goal:** Ten.

### Objective 4.1.2: Sub

**Goal:** Sub.

## Progress

| Objective | Plans | Status |
|---|---|---|
| 4.1 One | 0/1 | Planned |
| 4.10 Ten | 0/1 | Planned |
| 4.1.2 Sub | 0/1 | Planned |
`);

    const r = run(['objective', 'remove', '4.1', '--confirm'], project);
    assert.equal(r.status, 0, r.stderr);

    const after = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.doesNotMatch(after, /Objective 4\.1: One/, '4.1 checkbox and section are gone');
    assert.doesNotMatch(after, /\| 4\.1 One /, '4.1 row is gone');
    assert.match(after, /^- \[ \] \*\*Objective 4\.10: Ten\*\*$/m, '4.10 checkbox survives');
    assert.match(after, /^- \[ \] \*\*Objective 4\.1\.2: Sub\*\*$/m, '4.1.2 checkbox survives');
    assert.match(after, /^### Objective 4\.10: Ten$/m, '4.10 section survives');
    assert.match(after, /^### Objective 4\.1\.2: Sub$/m, '4.1.2 section survives');
    assert.match(after, /^\| 4\.10 Ten \| 0\/1 \| Planned \|$/m, '4.10 row survives');
    assert.match(after, /^\| 4\.1\.2 Sub \| 0\/1 \| Planned \|$/m, '4.1.2 row survives');
    assert.ok(fs.existsSync(path.join(project, '.planning', 'objectives', '04.10-ten')), '04.10 directory survives');
  });

  // Item 7. Regression guard: the `[:\s]` after the number already rejected 4.1.2.
  test('7: complete 4.1 checks only 4.1\'s checkbox, not 4.1.2 listed first (regression guard)', () => {
    const project = decimalProject(`# Roadmap

- [ ] **Objective 4.1.2: Sub**
- [ ] **Objective 4.10: Ten**
- [ ] **Objective 4.1: One**

### Objective 4.1: One

**Goal:** One.
`);
    const dir = path.join(project, '.planning', 'objectives', '04.1-one');
    fs.writeFileSync(path.join(dir, '04.1-01-TRD.md'), '# TRD\n', 'utf-8');
    fs.writeFileSync(path.join(dir, '04.1-01-SUMMARY.md'), '# Summary\n', 'utf-8');

    const r = run(['objective', 'complete', '4.1'], project);
    assert.equal(r.status, 0, r.stderr);

    const after = fs.readFileSync(path.join(project, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.match(after, /^- \[ \] \*\*Objective 4\.1\.2: Sub\*\*$/m, '4.1.2 stays unchecked');
    assert.match(after, /^- \[ \] \*\*Objective 4\.10: Ten\*\*$/m, '4.10 stays unchecked');
    assert.match(after, /^- \[x\] \*\*Objective 4\.1: One\*\* \(completed \d{4}-\d{2}-\d{2}\)$/m, '4.1 is checked');
  });
});

// ─── 56-02: objective directory lookups are exact (ONUM-02) ──────────────────

describe('56-02 objective directory lookups are exact', () => {
  const { findObjectiveInternal } = require('./objective.cjs');
  const { objectiveDirMatches } = require('./helpers.cjs');

  // Hand-built tree: every directory and file name is written literally by the test.
  //   current:  ['04.1-one', ...]                          under .planning/objectives/
  //   archived: { 'v1.2': ['04.1-one', ...] }              under .planning/milestones/v1.2-objectives/
  //   files:    { '04.10-ten': ['04.10-01-TRD.md'] }       empty named files inside a directory
  function objectiveTree({ current = [], archived = {}, files = {} }) {
    const project = tmpProject();
    const objectives = path.join(project, '.planning', 'objectives');
    for (const dir of current) fs.mkdirSync(path.join(objectives, dir), { recursive: true });
    for (const [version, dirs] of Object.entries(archived)) {
      for (const dir of dirs) {
        fs.mkdirSync(path.join(project, '.planning', 'milestones', `${version}-objectives`, dir), { recursive: true });
      }
    }
    for (const [dir, names] of Object.entries(files)) {
      for (const name of names) fs.writeFileSync(path.join(objectives, dir, name), '');
    }
    return project;
  }

  test('1: only 04.10-ten exists: find-objective 4.1 is not found', () => {
    const project = objectiveTree({ current: ['04.10-ten'] });
    const r = run(['find-objective', '4.1'], project);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.found, false);
    assert.equal(r.json.directory, null);
  });

  test('2: 04.1-one and 04.10-ten exist: find-objective 4.1 is 04.1-one', () => {
    const project = objectiveTree({ current: ['04.1-one', '04.10-ten'] });
    const r = run(['find-objective', '4.1'], project);
    assert.equal(r.json.found, true);
    assert.equal(r.json.directory, path.join('.planning', 'objectives', '04.1-one'));
  });

  test('3: only 04.1-x exists: find-objective 4 is not found', () => {
    const project = objectiveTree({ current: ['04.1-x'] });
    const r = run(['find-objective', '4'], project);
    assert.equal(r.json.found, false);
  });

  test('4: only 045-x exists: find-objective 4 is not found', () => {
    const project = objectiveTree({ current: ['045-x'] });
    const r = run(['find-objective', '4'], project);
    assert.equal(r.json.found, false);
  });

  test('5: a current 04.10-ten is skipped and the archived 04.1-one is returned by findObjectiveInternal', () => {
    const project = objectiveTree({ current: ['04.10-ten'], archived: { 'v1.2': ['04.1-one'] } });
    // find-objective reads the current directory only.
    const r = run(['find-objective', '4.1'], project);
    assert.equal(r.json.found, false);
    const found = findObjectiveInternal(project, '4.1');
    assert.ok(found, 'the archived 04.1-one is reached');
    assert.ok(found.directory.endsWith(path.join('v1.2-objectives', '04.1-one')), found.directory);
    assert.equal(found.archived, 'v1.2');
  });

  test('6: only 04.10-ten exists: objectives list --objective 4.1 is not found', () => {
    const project = objectiveTree({ current: ['04.10-ten'] });
    const r = run(['objectives', 'list', '--objective', '4.1', '--type', 'jobs'], project);
    assert.equal(r.json.objective_dir, null);
    assert.equal(r.json.error, 'Objective not found');
  });

  test('6b: --include-archived strips the [vX.Y] suffix: 04.1-one [v1.2] is selected, 04.10-ten [v1.2] is not', () => {
    const only10 = objectiveTree({ archived: { 'v1.2': ['04.10-ten'] } });
    const miss = run(['objectives', 'list', '--objective', '4.1', '--include-archived'], only10);
    assert.equal(miss.json.error, 'Objective not found');
    const with1 = objectiveTree({ archived: { 'v1.2': ['04.1-one'] } });
    const hit = run(['objectives', 'list', '--objective', '4.1', '--include-archived'], with1);
    assert.equal(hit.json.error, undefined);
    assert.deepEqual(hit.json.directories, ['04.1-one [v1.2]']);
  });

  test('7: only 04.10-ten exists: objective-job-index 4.1 is not found', () => {
    const project = objectiveTree({ current: ['04.10-ten'], files: { '04.10-ten': ['04.10-01-TRD.md'] } });
    const r = run(['objective-job-index', '4.1'], project);
    assert.equal(r.json.error, 'Objective not found');
    assert.deepEqual(r.json.jobs, []);
  });

  test('8: the full directory name resolves to itself, and a non-numeric name still resolves', () => {
    const project = objectiveTree({ current: ['04.1-one', '04.10-ten'] });
    assert.equal(run(['find-objective', '04.1-one'], project).json.directory, path.join('.planning', 'objectives', '04.1-one'));
    assert.equal(findObjectiveInternal(project, '04.1-one').directory, path.join('.planning', 'objectives', '04.1-one'));
    const odd = objectiveTree({ current: ['a(-thing'] });
    assert.equal(findObjectiveInternal(odd, 'a(').directory, path.join('.planning', 'objectives', 'a(-thing'));
  });

  test('9: no production lib file selects a directory with a bare startsWith(normalized|padded)', () => {
    const libRoot = __dirname;
    const offenders = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__fixtures__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (entry.name.endsWith('.cjs') && !entry.name.endsWith('.test.cjs')) {
          const lines = fs.readFileSync(full, 'utf-8').split('\n');
          lines.forEach((line, i) => {
            if (/\.startsWith\(\s*(normalized|padded)\s*\)/.test(line)) {
              offenders.push(`${path.relative(libRoot, full)}:${i + 1}`);
            }
          });
        }
      }
    })(libRoot);
    assert.deepEqual(offenders, []);
  });

  test('10: objectiveDirMatches is the exact name or the name followed by a hyphen', () => {
    assert.equal(objectiveDirMatches('04.1-one', '04.1'), true);
    assert.equal(objectiveDirMatches('04.1', '04.1'), true);
    assert.equal(objectiveDirMatches('04.10-ten', '04.1'), false);
    assert.equal(objectiveDirMatches('04.1-one', '04'), false);
    assert.equal(objectiveDirMatches('045-x', '04'), false);
    assert.equal(objectiveDirMatches('04-a', '04'), true);
  });
});
