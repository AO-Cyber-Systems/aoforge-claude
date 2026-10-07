'use strict';

/**
 * estimate-run-fixtures.cjs — objective 64, TRD 64-02 (EST-08)
 *
 * Hand-built estimate run-state literals for the run-history tests. No generated data, no
 * property-based library, and never the real ~/.claude: nothing here reads or writes a file.
 *
 *   objective63Run()   Objective 63's real run state, key for key and digit for digit. Written
 *                      with JSON.stringify(state, null, 2) + '\n' it is the exact file the
 *                      planner preserved (sha256 08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee).
 *   finishedRun(over)  a small finished run (one wave) with overrides.
 *   liveRun(over)      a small unfinished run (one wave running) with overrides.
 *
 * Every builder returns a fresh object, so a test may mutate its copy.
 */

const OBJECTIVE_63_SHA256 = '08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee';

/** Objective 63's run state, verbatim (a float digit or a key order changed breaks the sha256). */
function objective63Run() {
  return {
    version: 1,
    objective: '63',
    started_at: '2026-10-06T23:55:36.062Z',
    updated_at: '2026-10-07T01:46:41.099Z',
    finished_at: '2026-10-07T01:46:41.099Z',
    estimate: {
      line: 'Objective 63 estimate: 1h 43m median (P90 5h 04m) wall · $22.08 (P90 $34.02) · 7 TRDs left in 5 waves · confidence low',
      wall_minutes: { p50: 96.61616043566684, p90: 290.40059551531397 },
      confidence: 'low',
    },
    waves: [
      {
        wave: 1,
        trds: ['63-01', '63-05'],
        p50: 19.738206139394915,
        p90: 67.31643574086333,
        started_at: '2026-10-06T23:56:09.280Z',
        finished_at: '2026-10-07T00:14:43.608Z',
        actual_minutes: 18.572133333333333,
      },
      {
        wave: 2,
        trds: ['63-02'],
        p50: 14.5,
        p90: 54.100000000000016,
        started_at: '2026-10-07T00:15:05.024Z',
        finished_at: '2026-10-07T00:27:16.835Z',
        actual_minutes: 12.19685,
      },
      {
        wave: 3,
        trds: ['63-03', '63-04'],
        p50: 16.21765152054369,
        p90: 42.59996074545397,
        started_at: '2026-10-07T00:27:17.554Z',
        finished_at: '2026-10-07T00:35:44.197Z',
        actual_minutes: 8.44405,
      },
      {
        wave: 4,
        trds: ['63-06'],
        p50: 9.500000000000002,
        p90: 36.60000000000001,
        started_at: '2026-10-07T00:35:54.113Z',
        finished_at: '2026-10-07T01:26:30.878Z',
        actual_minutes: 50.61275,
      },
      {
        wave: 5,
        trds: ['63-07'],
        p50: 25.000000000000007,
        p90: 102.50000000000001,
        started_at: '2026-10-07T01:26:34.071Z',
        finished_at: '2026-10-07T01:45:52.070Z',
        actual_minutes: 19.299983333333333,
      },
    ],
  };
}

/**
 * A finished one-wave run. `over` replaces any top-level key, so a test can change just
 * `objective`, `started_at`, `finished_at`, `waves` or `estimate`.
 */
function finishedRun(over = {}) {
  const startedAt = over.started_at || '2026-10-01T10:00:00.000Z';
  const finishedAt = over.finished_at || '2026-10-01T10:30:00.000Z';
  return {
    version: 1,
    objective: '80',
    started_at: startedAt,
    updated_at: finishedAt,
    finished_at: finishedAt,
    estimate: {
      line: 'Objective 80 estimate: 20m median (P90 1h 00m) wall · confidence low',
      wall_minutes: { p50: 20, p90: 60 },
      confidence: 'low',
    },
    waves: [
      {
        wave: 1,
        trds: ['80-01'],
        p50: 20,
        p90: 60,
        started_at: startedAt,
        finished_at: finishedAt,
        actual_minutes: 30,
      },
    ],
    ...over,
  };
}

/** An unfinished one-wave run (the wave is running). `over` replaces any top-level key. */
function liveRun(over = {}) {
  const startedAt = over.started_at || '2026-10-02T10:00:00.000Z';
  return {
    version: 1,
    objective: '81',
    started_at: startedAt,
    updated_at: startedAt,
    finished_at: null,
    estimate: {
      line: 'Objective 81 estimate: 20m median (P90 1h 00m) wall · confidence low',
      wall_minutes: { p50: 20, p90: 60 },
      confidence: 'low',
    },
    waves: [
      {
        wave: 1,
        trds: ['81-01'],
        p50: 20,
        p90: 60,
        started_at: startedAt,
        finished_at: null,
        actual_minutes: null,
      },
    ],
    ...over,
  };
}

module.exports = { OBJECTIVE_63_SHA256, objective63Run, finishedRun, liveRun };
