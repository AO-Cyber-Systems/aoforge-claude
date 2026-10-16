---
objective: 64-estimate-accuracy-validation
job: "02"
subsystem: estimation
tags: [estimate, run-state, run-history, status-line, text-format]

requires:
  - objective: 58-estimation-engine
    provides: estimate-run-store.cjs (one run file per repo, read by the status line), estimate-cli run verbs, estimate-format
provides:
  - "Out-of-repo run history: <state dir>/history/<repo-key>/<objective>-<started_at>.json, written by finish and by a run replacing a finished one"
  - "run-store history API: historyDir, historyPath, archiveRunState, listRunHistory, latestRun"
  - "Richer run state: estimate.execution, estimate.total, estimate.calibration {path, version, data_as_of, samples, inputs_digest}"
  - "estimate objective N --all --line|--table renders a done objective's estimate"
  - "__fixtures__/estimate-run-fixtures.cjs (objective63Run, finishedRun, liveRun)"
affects: [64-04 estimate backtest (reads latestRun), 64-05 EST-08 verdict, 64-06 docs]

tech-stack:
  added: []
  patterns:
    - "archive-before-overwrite: a finished run is archived before anything replaces it, archive failure aborts the verb and leaves the live state"
    - "optional keys on a version-1 schema: old states still read, the status line ignores new keys"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-run-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
    - plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs

key-decisions:
  - "Only finished runs are archived; an abandoned unfinished run is still overwritten as before"
  - "STATE_VERSION stays 1: execution, total and calibration are optional keys, so Objective 63's real run state still reads"
  - "A failed archive aborts start/wave --start/finish with 'could not archive the run history: ...' and leaves the live state untouched"
  - "finish archives even when the run was already finished (idempotent), which covers a run finished before this TRD shipped"

patterns-established:
  - "history file name is sanitize(objective)-sanitize(started_at).json with the store's own allowlist sanitizer"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 18min
completed: 2026-10-07
tokens_input: 13262511
tokens_output: 66349
tokens_cache_read: 12944750
tokens_cache_write: 317573
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 02: Run history and --all text fix Summary

**Finished estimate runs are now archived out of the repository (so a later `estimate start` no longer destroys an earlier objective's prospective estimate), new runs record the execution and total estimates plus the calibration identity, and `estimate objective N --all` renders a done objective's estimate instead of `all TRDs done`.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-07T11:47:13Z
- **Completed:** 2026-10-07T12:05Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (1 created, 6 modified)

## Progress
- [x] Task 1: Run-state fixture builders, then the history store API — e5d6884e
- [x] Task 2: Archive in the run verbs, enrich the estimate block, render a done objective's --all estimate — ef18fcc4

## Accomplishments

- **History API** in `estimate-run-store.cjs` (node builtins plus `./upgrade.cjs` only, nothing read at module load): `historyDir`, `historyPath`, `archiveRunState` (atomic, idempotent, refuses unfinished and non-run values with a reason), `listRunHistory` (sorted by `started_at`, skips malformed, wrong-version, `.tmp` and non-`.json` files, never throws), `latestRun` (history plus the current run file, the current file wins a tie, unfinished runs ignored). Module header documents the layout and the writer rule. `readRunState` and `formatStatusSegment` still read only the one run file.
- **Objective 63's run state archives byte for byte**: the fixture `objective63Run()` written through `archiveRunState` is `63-2026-10-06T23_55_36_062Z.json` with sha256 `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`, the planner's preserved copy.
- **CLI wiring**: `finish` archives the run it closes (and again, idempotently, when already finished); `start` and a `wave --start` that begins a new run go through `replaceRun`, which archives a finished previous run first. An unfinished run is overwritten without being archived. A failing archive returns `{ok: false, message: 'could not archive the run history: ...'}` and writes nothing.
- **Enriched estimate block**: `estimate.execution`, `estimate.total` (unrounded, five metric blocks each) and `estimate.calibration` (`{path, version, data_as_of, samples, inputs_digest}`), all null when there is no usable calibration.
- **`--all` text fix** (58-10 Deviation 1): `objectiveLine`/`objectiveTable` short-circuit on `status === 'done' && !all`. Smoke on the repo source: `estimate objective 63 --all --line --raw` prints `Objective 63 estimate: 1h 43m median (P90 5h 04m) wall · $22.08 (P90 $34.02) · 7 TRDs estimated in 5 waves · confidence low`; without `--all` it prints `Objective 63: all TRDs done (7 of 7)`.
- End-to-end smoke (scratch `DEVFLOW_ESTIMATE_STATE_DIR`, real calibration read-only): `start 64` then `finish 64` left one live run file and one `history/<repo-key>/64-<started_at>.json` whose estimate block carried `execution`, `total` and the calibration with its `inputs_digest`. The real state directory and `calibration.json` were never touched; the scratch dir was removed.

## Task Commits

TDD, one RED then one GREEN commit per behaviour (16 commits):

1. history paths: `1014b150` test, `55647339` feat
2. archiveRunState (+ byte-exact sha256): `f5e913ca` test, `b8a47dbe` feat
3. listRunHistory: `93b0ae4a` test, `8b70503e` feat
4. latestRun + module header: `c7105691` test, `e5d6884e` feat
5. finish archives: `cfc3a5e8` test, `3be67cd4` feat
6. start / wave --start archive a finished previous run: `eeb80870` test, `5f13f400` feat
7. enriched estimate block + CLI header: `8f8a704e` test, `a9eba15b` feat
8. done objective `--all` text + history-aware tree test: `2f80f526` test, `ef18fcc4` fix

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written. Notes on execution, not deviations from the TRD:

- The TRD lists 13 tests for the store and CLI; they were split into finer cases (for example 14a-14d, 15a-15g, 16a-16f, 17a-17i in the store test, 1-5d in the CLI test) so each RED failed for one reason. All named behaviours are covered.
- Cases 3 and 4b (an unfinished run is overwritten without being archived, a live run archives nothing) passed on their first run because they pin existing behaviour; they have no RED commit. All archive-creating behaviours had a failing test first.
- One expected-value mistake in my own test (`assert.equal` on two equal objects) was corrected in the same GREEN cycle; the production code was not changed for it.

## Issues Encountered

- **Full-suite gate is not green, for reasons outside this TRD** (see Validation Gate Results). Nine failures are the devflow-watch daemon and handoff-pipeline tests, which fail to start a daemon shell (`failed to spawn shell`, exit 3) when run from this worktree checkout; the same `devflow-watch.test.cjs` passes from the main checkout. None of them reads an estimate file. The tenth, `roadmap-reconcile` E2E1, reported expected roadmap drift (the 64-02 checkbox was unticked while its SUMMARY existed) and passes after `roadmap update-job-progress 64`.
- A stray `devflow-watch.cjs` daemon (pid 5816, project `/var/folders/.../dfw-e2e-uz5DOH`, started from the main checkout) was already running when I looked; it is not mine and I left it alone.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + history store API | `node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs plugins/devflow/hooks/statusline-estimate.test.js` | 0 | PASS |
| 1: store stays hook-safe | `grep -n "require(" plugins/devflow/devflow/bin/lib/estimate-run-store.cjs` shows only fs, os, path and ./upgrade.cjs | 0 | PASS |
| 2: CLI archive, enriched block, `--all` text | `node --test estimate-cli.test.cjs estimate-format.test.cjs estimate-run-store.test.cjs estimate-surfacing.repo.test.cjs statusline-estimate.test.js planning-writes.audit.test.js` | 0 | PASS |
| 2: `--all` smoke | `df-tools estimate objective 63 --all --line --raw` | 0 | PASS (`7 TRDs estimated in 5 waves`) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test estimate-run-store.test.cjs estimate-cli.test.cjs estimate-format.test.cjs` plus statusline-estimate, planning-writes audit, estimate-surfacing | 0 | PASS |
| test (full) | `npm test` | 1 | FAIL: of 10874 tests, 10814 passed, 10 failed and 50 were skipped (the 10 failures: 9 daemon/handoff worktree-environment failures unrelated to this TRD, and 1 roadmap-reconcile E2E1 that passes after `roadmap update-job-progress 64`) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (history paths) | `node --test estimate-run-store.test.cjs` | 1 | FAIL (correct): `store.historyDir is not a function` |
| GREEN (history paths) | same | 0 | PASS (correct) |
| RED (archiveRunState) | same | 1 | FAIL (correct): `store.archiveRunState is not a function` |
| GREEN (archiveRunState, sha256 of 63) | same | 0 | PASS (correct) |
| RED (listRunHistory) | same | 1 | FAIL (correct) |
| GREEN (listRunHistory) | same | 0 | PASS (correct) |
| RED (latestRun) | same | 1 | FAIL (correct) |
| GREEN (latestRun) | same | 0 | PASS (correct) |
| RED (finish archives) | `node --test estimate-cli.test.cjs` | 1 | FAIL (correct): history directory empty |
| GREEN (finish archives) | same | 0 | PASS (correct) |
| RED (new run archives previous) | same | 1 | FAIL (correct): tests 2, 4, 4c |
| GREEN (new run archives previous) | same | 0 | PASS (correct) |
| RED (enriched estimate block) | same | 1 | FAIL (correct): tests 5-5d |
| GREEN (enriched estimate block) | same | 0 | PASS (correct) |
| RED (done --all text) | `node --test estimate-format.test.cjs estimate-cli.test.cjs` | 1 | FAIL (correct): `all TRDs done` printed |
| GREEN (done --all text) | same | 0 | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (archive layout and idempotence; finish/start/wave --start archive; history readers never throw; enriched estimate block; `--all` text; status-line path unchanged: the store still requires only fs, os, path and ./upgrade.cjs and `readRunState` reads only `<state dir>/<repo-key>.json`)
- Gate failures: full `npm test` (see above), none attributable to this TRD

## Next Phase Readiness

64-04 can read `store.latestRun(mainRoot, N)` for the prospective run of objective N. Objective 63's run is preserved at `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json` (not touched by this TRD). Runs started after this TRD carry `execution`, `total` and `calibration`; Objective 63's does not, so a backtest of 63 can compare wall time only. `requirements-completed` is `[]` by instruction; 64-05 decides EST-08.

## Self-Check: PASSED

All created and modified files exist, all 16 task commits are on branch `df/exec-64-02` (`git rev-list --count 20a4f37d..HEAD`), and the objective 63 sha256 assertion is part of the passing run-store test.
