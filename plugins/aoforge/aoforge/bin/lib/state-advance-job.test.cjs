'use strict';

/**
 * `aof-tools state advance-job [--objective <N>]` (TRD 59-02, PLMB-01).
 *
 * Root cause under test: advance-job read its counters from state.json, then STATE.md.
 * In a narrative project state.json holds `current_job: 0, total_jobs: 0` and STATE.md
 * has no `**Current Job:**` field, so every call hit `currentJob >= totalJobs` (0 >= 0)
 * and rewrote `**Status:**` to "Objective complete — ready for verification" after the
 * first TRD of every objective.
 *
 * The fix makes the position a fact read from disk: with `--objective N`, count
 * objective N's TRDs and the TRDs that have a SUMMARY. Without it, a project with no
 * usable counters writes nothing and says `no_position`.
 *
 * Test list (spawned CLI is the outermost layer; hand-built projects in os.tmpdir()):
 *   1.  Narrative STATE.md, objective 07 with TRDs 01-04 and SUMMARYs 01, 02 ->
 *       Status `Executing objective 7 — 2/4 TRDs complete`, nothing else but Last
 *       Activity changes, state.json carries objective/job/total/status.
 *   2.  All four SUMMARYs -> `Objective 7 executed — 4/4 TRDs complete, ready for
 *       verification`, state.json status `ready_for_verification`.
 *   3.  The reported bug: state.json 0/0, narrative STATE.md, no --objective ->
 *       nothing written, `{advanced:false, reason:'no_position', hint}`. 3b: no
 *       counters at all gives the same answer.
 *   4.  Legacy schema + --objective -> Current Job, Total Jobs in Objective and Status.
 *   5.  Named TRD (`07-02-beta-TRD.md`) pairs with `07-02-SUMMARY.md` (NN-MM key).
 *   6.  Lookup exactness: `07-alpha` and `70-other` both exist; --objective 7 -> 07-alpha.
 *   7.  Idempotent: a second run with no new SUMMARY changes nothing.
 *   8.  --objective 99 (no directory) -> exit 1, stderr names 99, nothing touched.
 *   9.  An objective with no TRDs -> `{advanced:false, reason:'no_trds'}`, nothing written.
 *   10. Store mode + --objective -> STATE.md byte-identical, state.json carries the
 *       four fields, `target: 'state.json'`.
 *   11. --objective with no value (or followed by a flag) -> exit 1 with usage.
 *   12. --raw prints the status key.
 *   13. Legacy control: the 48-13 counters (2/4), no --objective -> unchanged result.
 *   14. The pre-59 call shape `cmdStateAdvanceJob(cwd, raw)` still works.
 *
 * Fixtures: lib/__fixtures__/state-position-fixtures.cjs. The repo's own .aoforge/ is
 * never touched; aof-tools is spawned with the temp project as cwd under a fake HOME.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { narrativeState, legacyState, positionProject } = require('./__fixtures__/state-position-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const STATE_CJS = path.join(__dirname, 'state.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const fn = cleanup.pop();
    fn();
  }
});

function project(spec) {
  const p = positionProject(spec);
  cleanup.push(() => p.cleanup());
  return p;
}

function fakeHomeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-advance-home-'));
  cleanup.push(() => fs.rmSync(home, { recursive: true, force: true }));
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

function mask(s) {
  return s.replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>');
}

function edit(src, from, to) {
  assert.ok(src.includes(from), `fixture anchor missing: ${from}`);
  return src.replace(from, to);
}

function exists(p, rel) {
  return fs.existsSync(path.join(p.root, '.aoforge', rel));
}

const FOUR_TRDS = [{ nn: '01' }, { nn: '02' }, { nn: '03' }, { nn: '04' }];
const STORE_CONFIG = { github: { enabled: true, store: true } };

describe('state advance-job --objective: position from disk (PLMB-01)', () => {
  test('1. narrative STATE.md: Executing objective 7 — 2/4 TRDs complete', () => {
    const state = narrativeState({});
    const p = project({ state, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02'] }] });
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    const want = edit(state, '**Status:** Planning objective 7', '**Status:** Executing objective 7 — 2/4 TRDs complete');
    assert.equal(mask(p.read('STATE.md')), mask(want));
    const sj = JSON.parse(p.read('state.json'));
    assert.equal(sj.current_objective, '07');
    assert.equal(sj.current_job, 2);
    assert.equal(sj.total_jobs, 4);
    assert.equal(sj.status, 'executing');
    assert.deepEqual(r.json, {
      advanced: true,
      objective: '07',
      previous_job: 0,
      current_job: 2,
      total_jobs: 4,
      status: 'executing',
      status_text: 'Executing objective 7 — 2/4 TRDs complete',
      state_md_updated: true,
    });
  });

  test('2. every TRD has a SUMMARY: ready for verification', () => {
    const state = narrativeState({});
    const p = project({ state, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02', '03', '04'] }] });
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    const want = edit(state, '**Status:** Planning objective 7',
      '**Status:** Objective 7 executed — 4/4 TRDs complete, ready for verification');
    assert.equal(mask(p.read('STATE.md')), mask(want));
    assert.equal(JSON.parse(p.read('state.json')).status, 'ready_for_verification');
    assert.equal(r.json.status, 'ready_for_verification');
    assert.equal(r.json.current_job, 4);
  });

  test('3. the reported bug: state.json 0/0 and no --objective writes nothing', () => {
    const state = narrativeState({});
    const stateJson = { current_objective: null, current_job: 0, total_jobs: 0, status: null };
    const p = project({ state, stateJson, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01'] }] });
    const jsonBefore = p.read('state.json');
    const r = run(['state', 'advance-job'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(p.read('STATE.md'), state);
    assert.equal(p.read('state.json'), jsonBefore);
    assert.equal(r.json.advanced, false);
    assert.equal(r.json.reason, 'no_position');
    assert.match(r.json.hint, /--objective/);
  });

  test('3b. no counters anywhere gives the same no_position answer', () => {
    const state = narrativeState({});
    const p = project({ state, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01'] }] });
    const r = run(['state', 'advance-job'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(p.read('STATE.md'), state);
    assert.equal(exists(p, 'state.json'), false);
    assert.equal(r.json.advanced, false);
    assert.equal(r.json.reason, 'no_position');
    assert.match(r.json.hint, /--objective/);
  });

  test('4. legacy schema + --objective: Current Job, Total Jobs and Status from disk', () => {
    const state = legacyState({ objective: 7, currentJob: 2, totalJobs: 4 });
    const p = project({ state, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02', '03'] }] });
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    let want = edit(state, '**Current Job:** 2', '**Current Job:** 3');
    want = edit(want, '**Status:** Planning', '**Status:** Executing objective 7 — 3/4 TRDs complete');
    assert.equal(mask(p.read('STATE.md')), mask(want));
    assert.equal(r.json.current_job, 3);
    assert.equal(r.json.total_jobs, 4);
  });

  test('5. a named TRD pairs with NN-MM-SUMMARY.md on the NN-MM key', () => {
    const state = narrativeState({});
    const p = project({
      state,
      objectives: [{ dir: '07-alpha', trds: [{ nn: '01' }, { nn: '02', slug: 'beta' }], summaries: ['02'] }],
    });
    assert.ok(exists(p, 'objectives/07-alpha/07-02-beta-TRD.md'));
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.current_job, 1);
    assert.equal(r.json.total_jobs, 2);
    assert.match(p.read('STATE.md'), /\*\*Status:\*\* Executing objective 7 — 1\/2 TRDs complete/);
  });

  test('6. lookup exactness: 7 selects 07-alpha, never 70-other', () => {
    const state = narrativeState({});
    const p = project({
      state,
      objectives: [
        { dir: '07-alpha', trds: [{ nn: '01' }, { nn: '02' }], summaries: ['01'] },
        { dir: '70-other', trds: [{ nn: '01' }, { nn: '02' }, { nn: '03' }], summaries: ['01', '02', '03'] },
      ],
    });
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.objective, '07');
    assert.equal(r.json.current_job, 1);
    assert.equal(r.json.total_jobs, 2);
    assert.match(p.read('STATE.md'), /\*\*Status:\*\* Executing objective 7 — 1\/2 TRDs complete/);
  });

  test('7. idempotent: a second run with no new SUMMARY changes nothing', () => {
    const p = project({
      state: narrativeState({}),
      objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02'] }],
    });
    const first = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(first.json.advanced, true);
    const stateAfterFirst = p.read('STATE.md');
    const second = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(p.read('STATE.md'), stateAfterFirst);
    assert.equal(second.json.state_md_updated, false);
    assert.equal(second.json.advanced, false);
    assert.equal(second.json.previous_job, 2);
    assert.equal(second.json.current_job, 2);
  });

  test('7b. a SUMMARY landing between runs advances and reports the previous count', () => {
    const p = project({
      state: narrativeState({}),
      objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02'] }],
    });
    run(['state', 'advance-job', '--objective', '7'], p.root);
    fs.writeFileSync(path.join(p.root, '.aoforge', 'objectives', '07-alpha', '07-03-SUMMARY.md'), '# s\n', 'utf-8');
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.json.advanced, true);
    assert.equal(r.json.previous_job, 2);
    assert.equal(r.json.current_job, 3);
    assert.match(p.read('STATE.md'), /\*\*Status:\*\* Executing objective 7 — 3\/4 TRDs complete/);
  });

  test('8. --objective 99 (no directory): exit 1 naming 99, nothing touched', () => {
    const state = narrativeState({});
    const stateJson = { current_objective: '07', current_job: 1, total_jobs: 4, status: 'executing' };
    const p = project({ state, stateJson, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01'] }] });
    const jsonBefore = p.read('state.json');
    const r = run(['state', 'advance-job', '--objective', '99'], p.root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /99/);
    assert.equal(p.read('STATE.md'), state);
    assert.equal(p.read('state.json'), jsonBefore);
  });

  test('9. an objective with no TRDs: no_trds, nothing written', () => {
    const state = narrativeState({});
    const stateJson = { current_objective: null, current_job: 0, total_jobs: 0, status: null };
    const p = project({ state, stateJson, objectives: [{ dir: '07-alpha', trds: [], summaries: [] }] });
    const jsonBefore = p.read('state.json');
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.advanced, false);
    assert.equal(r.json.reason, 'no_trds');
    assert.equal(p.read('STATE.md'), state);
    assert.equal(p.read('state.json'), jsonBefore);
  });

  test('10. store mode: STATE.md byte-identical, state.json carries the position', () => {
    const state = narrativeState({});
    const p = project({
      state,
      config: STORE_CONFIG,
      objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02'] }],
    });
    const r = run(['state', 'advance-job', '--objective', '7'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(p.read('STATE.md'), state);
    const sj = JSON.parse(p.read('state.json'));
    assert.equal(sj.current_objective, '07');
    assert.equal(sj.current_job, 2);
    assert.equal(sj.total_jobs, 4);
    assert.equal(sj.status, 'executing');
    assert.equal(r.json.target, 'state.json');
    assert.equal(r.json.state_md_updated, false);
  });

  test('11. --objective without a value is a usage error', () => {
    const state = narrativeState({});
    const p = project({ state, objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01'] }] });
    const bare = run(['state', 'advance-job', '--objective'], p.root);
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /--objective requires an objective number/);
    const flagged = run(['state', 'advance-job', '--objective', '--raw'], p.root);
    assert.equal(flagged.status, 1);
    assert.match(flagged.stderr, /--objective requires an objective number/);
    assert.equal(p.read('STATE.md'), state);
    assert.equal(exists(p, 'state.json'), false);
  });

  test('12. --raw prints the status key', () => {
    const p = project({
      state: narrativeState({}),
      objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02'] }],
    });
    assert.equal(run(['state', 'advance-job', '--objective', '7', '--raw'], p.root).stdout, 'executing');
    const done = project({
      state: narrativeState({}),
      objectives: [{ dir: '07-alpha', trds: FOUR_TRDS, summaries: ['01', '02', '03', '04'] }],
    });
    assert.equal(run(['state', 'advance-job', '--objective', '7', '--raw'], done.root).stdout, 'ready_for_verification');
  });
});

describe('state advance-job without --objective: the legacy counter path is intact', () => {
  const COUNTERS = {
    current_objective: '7',
    current_job: 2,
    total_jobs: 4,
    progress_pct: 0,
    status: 'Planning',
    last_activity: '2026-01-01',
    metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
    decisions: [],
    blockers: [],
    session_log: [],
  };

  test('13. counters 2/4 advance to 3/4 exactly as before', () => {
    const state = legacyState({ objective: 7, currentJob: 2, totalJobs: 4 });
    const p = project({ state, stateJson: COUNTERS, objectives: [{ dir: '07-x', trds: [{ nn: '01' }], summaries: [] }] });
    const r = run(['state', 'advance-job'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { advanced: true, previous_job: 2, current_job: 3, total_jobs: 4 });
    let want = edit(state, '**Current Job:** 2', '**Current Job:** 3');
    want = edit(want, '**Status:** Planning', '**Status:** Ready to execute');
    assert.equal(mask(p.read('STATE.md')), mask(want));
  });

  test('13b. counters at the end of the objective still say ready for verification', () => {
    const state = legacyState({ objective: 7, currentJob: 4, totalJobs: 4 });
    const p = project({ state, stateJson: Object.assign({}, COUNTERS, { current_job: 4 }) });
    const r = run(['state', 'advance-job'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { advanced: false, reason: 'last_job', current_job: 4, total_jobs: 4, status: 'ready_for_verification' });
    assert.match(p.read('STATE.md'), /\*\*Status:\*\* Objective complete — ready for verification/);
  });

  test('14. the pre-59 call shape cmdStateAdvanceJob(cwd, raw) still works', () => {
    const state = legacyState({ objective: 7, currentJob: 2, totalJobs: 4 });
    const p = project({ state, stateJson: COUNTERS });
    const script = `require(${JSON.stringify(STATE_CJS)}).cmdStateAdvanceJob(${JSON.stringify(p.root)}, true)`;
    const r = spawnSync(process.execPath, ['-e', script], { env: fakeHomeEnv(), encoding: 'utf-8', timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'true');
  });
});
