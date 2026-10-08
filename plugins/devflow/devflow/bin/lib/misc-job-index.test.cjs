'use strict';

/**
 * Regression coverage for `df-tools objective-job-index` gap_closure (TRD 70-01, TOOL-07).
 *
 * Root cause under test: the job object had no `gap_closure` key, so
 * `execute-objective --gaps-only` ("skip non-gap_closure plans") had nothing to
 * filter on and every job read as null.
 *
 * Test list (spawned CLI under a fake HOME, project root as cwd). Objective `07-x`
 * holds 07-01-a-TRD.md (gap_closure: true), 07-02-b-TRD.md (no key) and
 * 07-03-c-TRD.md (gap_closure: false). Objective `08-legacy` holds only legacy JOB
 * files, 08-01-JOB.md (gap_closure: true) and 08-02-JOB.md (no key): findPlanFiles
 * indexes JOB files only when an objective has no TRD files, so a legacy JOB cannot
 * share an objective with a TRD.
 *   16. The three TRDs report gap_closure true, false, false: booleans, strictEqual.
 *   17. Every job object has the key, and the legacy JOB files report true and false.
 *   18. jobs.filter(j => j.gap_closure).map(j => j.id) is exactly ['07-01-a'] for the TRD
 *       objective and ['08-01'] for the legacy one, the --gaps-only selection.
 *
 * Fixtures are hand-built in __fixtures__/cli-defects-fixtures.cjs; the project is a
 * mkdtemp directory and the real ~/.claude is never read.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { makeProject, trdText, runDfTools, cleanupAll } = require('./__fixtures__/cli-defects-fixtures.cjs');

afterEach(cleanupAll);

function indexes() {
  const dir = makeProject({
    objectives: {
      '07-x': {
        '07-01-a-TRD.md': trdText({ objective: '07-x', trd: '01', wave: 1, gap_closure: true }),
        '07-02-b-TRD.md': trdText({ objective: '07-x', trd: '02', wave: 1 }),
        '07-03-c-TRD.md': trdText({ objective: '07-x', trd: '03', wave: 2, gap_closure: false }),
      },
      '08-legacy': {
        '08-01-JOB.md': trdText({ objective: '08-legacy', job: '01', wave: 1, gap_closure: true }),
        '08-02-JOB.md': trdText({ objective: '08-legacy', job: '02', wave: 1 }),
      },
    },
  });
  const run = (objective) => {
    const r = runDfTools(['objective-job-index', objective], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json, r.stdout);
    return r.json;
  };
  return { trd: run('07'), legacy: run('08') };
}

function byId(index, id) {
  const job = index.jobs.find(j => j.id === id);
  assert.ok(job, `job ${id} missing from ${JSON.stringify(index.jobs.map(j => j.id))}`);
  return job;
}

describe('objective-job-index gap_closure (TRD 70-01)', () => {
  let trd;
  let legacy;
  beforeEach(() => { ({ trd, legacy } = indexes()); });

  test('16. a TRD reports gap_closure true, false when the key is absent, false when it says false', () => {
    assert.strictEqual(byId(trd, '07-01-a').gap_closure, true);
    assert.strictEqual(byId(trd, '07-02-b').gap_closure, false);
    assert.strictEqual(byId(trd, '07-03-c').gap_closure, false);
  });

  test('17. every job object has the key, including legacy JOB files', () => {
    assert.equal(trd.jobs.length, 3);
    assert.equal(legacy.jobs.length, 2);
    for (const job of [...trd.jobs, ...legacy.jobs]) {
      assert.ok('gap_closure' in job, `${job.id} has no gap_closure key`);
      assert.equal(typeof job.gap_closure, 'boolean', job.id);
    }
    assert.strictEqual(byId(legacy, '08-01').gap_closure, true);
    assert.strictEqual(byId(legacy, '08-02').gap_closure, false);
  });

  test('18. the --gaps-only selection is exactly the gap_closure jobs', () => {
    assert.deepEqual(trd.jobs.filter(j => j.gap_closure).map(j => j.id), ['07-01-a']);
    assert.deepEqual(legacy.jobs.filter(j => j.gap_closure).map(j => j.id), ['08-01']);
  });
});
