'use strict';

// mergeStateJson: the pure 3-way merge of .planning/state.json (TRD 59-01, tests 1-10).
// Hand-built fixtures only; no I/O, no git.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const { mergeStateJson, canonicalJson } = require('./state-merge.cjs');
const { stateDoc, decision, stateText } = require('./__fixtures__/state-merge-fixtures.cjs');

/** Merge three state objects and return the parsed result, failing the test on {ok:false}. */
function merged(base, ours, theirs) {
  const r = mergeStateJson(stateText(base), stateText(ours), stateText(theirs));
  assert.strictEqual(r.ok, true, `merge failed: ${r.reason}`);
  return { value: JSON.parse(r.text), text: r.text, notes: r.notes };
}

const d0 = decision('58', 'base decision', 'why');
const d1 = decision('59', 'ours decision');
const d2 = decision('59', 'theirs decision');

describe('mergeStateJson: arrays (decisions, blockers, session_log)', () => {
  test('1. both sides append a different decision: base, then ours additions, then theirs additions', () => {
    const base = stateDoc({ decisions: [d0] });
    const ours = stateDoc({ decisions: [d0, d1] });
    const theirs = stateDoc({ decisions: [d0, d2] });
    assert.deepStrictEqual(merged(base, ours, theirs).value.decisions, [d0, d1, d2]);
  });

  test('2. the same entry added on both sides appears once (keys compare in sorted order)', () => {
    const base = stateDoc({ decisions: [d0] });
    const sameOurs = { rationale: null, summary: 'shared', objective: '59' };
    const sameTheirs = { objective: '59', summary: 'shared', rationale: null };
    const r = merged(base, stateDoc({ decisions: [d0, sameOurs] }), stateDoc({ decisions: [d0, sameTheirs] }));
    assert.strictEqual(r.value.decisions.length, 2);
    assert.strictEqual(r.value.decisions[1].summary, 'shared');
  });

  test('2b. entries repeated inside one side are kept; only theirs additions are deduplicated against ours', () => {
    const base = stateDoc({ decisions: [d0] });
    const ours = stateDoc({ decisions: [d0, d1, d1] });
    const theirs = stateDoc({ decisions: [d0, d2] });
    assert.deepStrictEqual(merged(base, ours, theirs).value.decisions, [d0, d1, d1, d2]);
  });

  test('3. blockers: an entry theirs removed (ours left it) is removed; ours add and theirs remove both apply', () => {
    const b1 = 'waiting on credentials';
    const b2 = 'flaky CI';
    const b3 = 'needs review';
    const dropped = merged(
      stateDoc({ blockers: [b1, b2] }),
      stateDoc({ blockers: [b1, b2] }),
      stateDoc({ blockers: [b2] }),
    );
    assert.deepStrictEqual(dropped.value.blockers, [b2]);

    const both = merged(
      stateDoc({ blockers: [b1, b2] }),
      stateDoc({ blockers: [b1, b2, b3] }),
      stateDoc({ blockers: [b1] }),
    );
    assert.deepStrictEqual(both.value.blockers, [b1, b3]);
  });

  test('3b. an entry ours removed and theirs left stays removed', () => {
    const r = merged(
      stateDoc({ blockers: ['a', 'b'] }),
      stateDoc({ blockers: ['b'] }),
      stateDoc({ blockers: ['a', 'b', 'c'] }),
    );
    assert.deepStrictEqual(r.value.blockers, ['b', 'c']);
  });
});

describe('mergeStateJson: numbers and dates', () => {
  test('4. metrics counters sum both deltas onto the base; one-sided change takes that side', () => {
    const base = stateDoc({ metrics: { jobs_completed: 2, jobs_failed: 0, sessions: 5 } });
    const ours = stateDoc({ metrics: { jobs_completed: 3, jobs_failed: 1, sessions: 5 } });
    const theirs = stateDoc({ metrics: { jobs_completed: 4, jobs_failed: 0, sessions: 5 } });
    const r = merged(base, ours, theirs);
    assert.strictEqual(r.value.metrics.jobs_completed, 5);
    assert.strictEqual(r.value.metrics.jobs_failed, 1);
    assert.strictEqual(r.value.metrics.sessions, 5);
  });

  test('4b. metrics counters that both sides raised by the same amount still sum both deltas', () => {
    // Two parallel executors each finishing one job leave jobs_completed equal on both sides (base + 1).
    // The equal-values shortcut would keep that single +1 and lose a completed job.
    const base = stateDoc({ metrics: { jobs_completed: 2, jobs_failed: 0, sessions: 0 } });
    const both = stateDoc({ metrics: { jobs_completed: 3, jobs_failed: 0, sessions: 0 } });
    const r = merged(base, both, both);
    assert.strictEqual(r.value.metrics.jobs_completed, 4);
    assert.strictEqual(r.value.metrics.jobs_failed, 0);
  });

  test('4c. a counter absent from the base and equal on both sides is kept once, not doubled', () => {
    const base = stateDoc();
    const withExtra = (n) => { const d = stateDoc(); d.metrics.retries = n; return d; };
    assert.strictEqual(merged(base, withExtra(1), withExtra(1)).value.metrics.retries, 1);
  });

  test('5. other numbers changed on both sides take the max', () => {
    const base = stateDoc({ current_job: 2, progress_pct: 20 });
    const ours = stateDoc({ current_job: 3, progress_pct: 40 });
    const theirs = stateDoc({ current_job: 4, progress_pct: 60 });
    const r = merged(base, ours, theirs);
    assert.strictEqual(r.value.current_job, 4);
    assert.strictEqual(r.value.progress_pct, 60);
  });

  test('6. last_activity takes the later date; a status changed differently keeps ours and says so', () => {
    const base = stateDoc({ last_activity: '2026-10-01', status: 'executing' });
    const ours = stateDoc({ last_activity: '2026-10-05', status: 'verifying' });
    const theirs = stateDoc({ last_activity: '2026-10-06', status: 'blocked' });
    const r = merged(base, ours, theirs);
    assert.strictEqual(r.value.last_activity, '2026-10-06');
    assert.strictEqual(r.value.status, 'verifying');
    assert.ok(r.notes.some((n) => n.includes('status')), `no note names status: ${JSON.stringify(r.notes)}`);
  });

  test('6b. the later date wins whichever side holds it', () => {
    const base = stateDoc({ last_activity: '2026-10-01' });
    const r = merged(base, stateDoc({ last_activity: '2026-10-07' }), stateDoc({ last_activity: '2026-10-03' }));
    assert.strictEqual(r.value.last_activity, '2026-10-07');
  });
});

describe('mergeStateJson: keys', () => {
  test('7. a key added on one side is kept; a key deleted on one side and unchanged on the other is deleted', () => {
    const base = Object.assign(stateDoc(), { legacy: 1, stale: 'x' });
    const ours = Object.assign(stateDoc(), { stale: 'x', metrics_log: [] }); // deleted legacy, added metrics_log
    const theirs = Object.assign(stateDoc(), { legacy: 1, extra_flag: true }); // deleted stale, added extra_flag
    const r = merged(base, ours, theirs);
    assert.ok(!('legacy' in r.value), 'legacy should be deleted');
    assert.ok(!('stale' in r.value), 'stale should be deleted');
    assert.deepStrictEqual(r.value.metrics_log, []);
    assert.strictEqual(r.value.extra_flag, true);
  });

  test('7b. a key deleted on one side but changed on the other is kept', () => {
    const base = Object.assign(stateDoc(), { legacy: 1 });
    const ours = stateDoc(); // deleted
    const theirs = Object.assign(stateDoc(), { legacy: 9 }); // changed
    assert.strictEqual(merged(base, ours, theirs).value.legacy, 9);
  });

  test('8. an empty or whitespace base (file added on both sides) is treated as {}', () => {
    const ours = stateDoc({ decisions: [d1], current_job: 1 });
    const theirs = stateDoc({ decisions: [d2], current_job: 2 });
    for (const blank of ['', '  \n\t ']) {
      const r = mergeStateJson(blank, stateText(ours), stateText(theirs));
      assert.strictEqual(r.ok, true);
      const value = JSON.parse(r.text);
      assert.deepStrictEqual(value.decisions, [d1, d2]);
      assert.strictEqual(value.current_job, 2);
    }
  });

  test('8b. an unparsable base is treated as {} and noted', () => {
    const r = mergeStateJson('{ not json', stateText(stateDoc({ decisions: [d1] })), stateText(stateDoc({ decisions: [d2] })));
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(JSON.parse(r.text).decisions, [d1, d2]);
    assert.ok(r.notes.some((n) => n.toLowerCase().includes('base')), `no note about the base: ${JSON.stringify(r.notes)}`);
  });
});

describe('mergeStateJson: output and failure', () => {
  test('9. output is JSON.stringify(merged, null, 2) with no trailing newline: byte-identical to writeStateJson', () => {
    const base = stateDoc({ decisions: [d0] });
    const ours = stateDoc({ decisions: [d0, d1] });
    const theirs = stateDoc({ decisions: [d0, d2] });
    const r = merged(base, ours, theirs);
    assert.strictEqual(r.text, stateText(stateDoc({ decisions: [d0, d1, d2] })));
    assert.ok(!r.text.endsWith('\n'));
  });

  test('9b. ours key order comes first, then keys only theirs has', () => {
    const base = { a: 1 };
    const ours = { z: 1, a: 1 };
    const theirs = { a: 1, m: 2 };
    const r = mergeStateJson(JSON.stringify(base), JSON.stringify(ours), JSON.stringify(theirs));
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(Object.keys(JSON.parse(r.text)), ['z', 'a', 'm']);
  });

  test('10. unparsable ours or theirs, or a top level that is not a plain object: {ok:false, reason}, never throws', () => {
    const good = stateText(stateDoc());
    const cases = [
      ['{ nope', good],
      [good, '{ nope'],
      ['', good],
      ['[1, 2]', good],
      [good, '"a string"'],
      [good, 'null'],
      [good, '42'],
    ];
    for (const [ours, theirs] of cases) {
      let r;
      assert.doesNotThrow(() => { r = mergeStateJson(good, ours, theirs); });
      assert.strictEqual(r.ok, false, `expected failure for ${JSON.stringify([ours, theirs])}`);
      assert.strictEqual(typeof r.reason, 'string');
      assert.ok(r.reason.length > 0);
    }
  });
});

describe('canonicalJson', () => {
  test('equal values with different key order canonicalize identically; different values do not', () => {
    assert.strictEqual(canonicalJson({ b: 1, a: [{ y: 1, x: 2 }] }), canonicalJson({ a: [{ x: 2, y: 1 }], b: 1 }));
    assert.notStrictEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
    assert.notStrictEqual(canonicalJson(undefined), canonicalJson(null));
  });
});
