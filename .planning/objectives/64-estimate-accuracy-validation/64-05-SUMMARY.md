---
objective: 64-estimate-accuracy-validation
trd: "05"
subsystem: estimation
tags: [estimate, backtest, EST-08, accuracy-report, calibration]

requires:
  - objective: 64-estimate-accuracy-validation (64-03)
    provides: frozen calibration 5cf42c4b proof, token backfill of 59-63, actuals audit
  - objective: 64-estimate-accuracy-validation (64-04)
    provides: the `estimate backtest` verb

provides:
  - "EST-08 verdict (not met) on out-of-sample evidence, from one rerunnable verb: agent minutes median ratio 1.51 (SC2 fail), cost 0.86 (pass), P90 coverage passes for both"
  - "64-ACCURACY-REPORT.md: per-objective and per-TRD tables, flagged classes, rolling and window diagnostics, defects, reproduce commands"
  - "Two pending todos: recalibrate estimate minutes; ship the executor token stamp"

affects: [64-06 docs, EST-08 traceability, objective 64 completion]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
    - .planning/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md
    - .planning/todos/pending/ship-executor-token-stamp-forward-stamp-8-of-41.md
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "The verdict is the frozen-calibration run alone; the rolling and window runs are labelled secondary because those calibrations never existed at the time (the window run prints EST-08 met and is not the verdict)"
  - "No estimator code, threshold or input was changed; the miscalibrated classes and follow-ups are recorded instead"
  - "EST-08 stays unchecked with a traceability status naming the report and the todo; requirements mark-complete was not run"

patterns-established: []

requirements-completed: []  # EST-08 not met: no mark-complete

verification:
  gates_defined: 1
  gates_passed: 1           # npm test exit 0 (10963 tests, 0 fail)
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 9min
completed: 2026-10-07
tokens_input: 14176770
tokens_output: 77274
tokens_cache_read: 13797682
tokens_cache_write: 378900
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 05: Out-of-sample backtest and accuracy report Summary

**EST-08 is not met: on the five objectives built after the engine shipped, the agent-minute median estimate runs 1.51 times the actual (SC2 fail), cost passes (0.86), P90 covers both (minutes 5 of 5 objectives and 40 of 41 TRDs; cost 4 of 5 and 34 of 41), and the report names the miscalibrated classes with two follow-up todos.**

## Performance

- **Duration:** about 9 min of execution (plus the full `npm test` gate in the main checkout)
- **Started:** 2026-10-07T12:30:29Z (preflight claim)
- **Completed:** 2026-10-07
- **Tasks:** 3 of 3
- **Files modified:** 4 repository files (the report, REQUIREMENTS.md, two todos) plus this SUMMARY; no production code

## Progress
- [x] Task 1: Primary out-of-sample backtest of 59-63 on the frozen calibration, plus the in-sample reference — 489d7b76
- [x] Task 2: Rolling leave-future-out and window diagnostics from git snapshots — c4e923a3
- [x] Task 3: Write 64-ACCURACY-REPORT.md, set EST-08's status, record the follow-up, commit — 81e3d01c

## Primary result

Command (repository df-tools, scratch output; hashes re-checked first and unchanged: live and frozen calibration
`5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`, 63 run state `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`):

`node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json [--raw]`

JSON `line` (verbatim): `Backtest 59, 60, 61, 62, 63: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 40 of 41 TRDs) · cost median ratio 0.86 (4 of 5, P90 4 of 5, 34 of 41) · EST-08 not met`

`verdict.est08` = `"not met"`; `verdict.sc2` = {agent_minutes: fail, cost_usd: pass}; `verdict.sc3` = {agent_minutes: pass, cost_usd: pass}; `follow_up_required: true`.

| Metric | Compared | Median ratio | Pooled ratio | In band (0.70-1.30) | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.51 (1.514) | 1.45 (1.448) | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 4 of 5 (80%) |
| Cost | 5 | 0.86 (0.862) | 0.84 (0.839) | 4 of 5 | 4 of 5 (80%) | 34 of 41 (83%) | 2 of 5 (40%) |

Per objective (all five `reconstructed`; ratio = p50 / actual; actuals on the SUMMARY basis, priced tokens for cost):

| Objective | TRDs | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|
| 59 | 7 | 1h 48m / 5h 34m | 1h 24m | 1.29 | yes | $20.59 / $29.43 | $23.88 | 0.86 | yes |
| 60 | 7 | 1h 52m / 5h 25m | 1h 14m | 1.51 | yes | $22.55 / $32.37 | $19.79 | 1.14 | yes |
| 61 | 9 | 2h 28m / 6h 41m | 1h 10m | 2.11 | yes | $27.92 / $40.55 | $27.57 | 1.01 | yes |
| 62 | 11 | 2h 37m / 8h 14m | 1h 36m | 1.63 | yes | $29.28 / $41.18 | $45.75 | 0.64 | no |
| 63 | 7 | 1h 46m / 5h 31m | 1h 52m | 0.95 | yes | $20.56 / $30.50 | $27.16 | 0.76 | yes |

Wall time (63, prospective run state; reported, never judged): execution-only estimate 1h 37m / 4h 50m, reconstructed
1h 37m / 4h 50m (`Reproduced yes`), actual 1h 51m, ratio 0.87, within P90. Waves: 1 (63-01, 63-05) 20 min / 1h 07m vs 19
min (1.06, covered); 2 (63-02) 15 / 54 vs 12 (1.19, covered); 3 (63-03, 63-04) 16 / 43 vs 8 (1.92, covered); 4 (63-06)
10 / 37 vs 51 (0.19, **not covered**); 5 (63-07) 25 / 1h 43m vs 19 (1.30, covered). 59-62: no run state recorded.

TRDs whose P90 did not cover the actual: minutes, 63-06 (p50 9.5, P90 36.6, actual 45); cost, 59-05 ($2.28 / $3.41 vs
$5.06), 62-02 ($1.74 / $3.36 vs $5.99), 62-08 ($2.18 / $3.13 vs $5.95), 62-09 ($2.18 / $3.13 vs $4.30), 62-10 ($3.04 /
$6.08 vs $8.33), 62-11 ($2.18 / $3.13 vs $4.04), 63-01 ($2.28 / $3.41 vs $4.01). TRDs inside the +-30% band: minutes 13
of 41, cost 25 of 41.

Miscalibrated classes (the verb's flags): minutes code_tdd (41 tasks, 1.80, biased_high), prompt_tdd (19, 1.88,
biased_high), test (13, 0.68, biased_low), other (9, 2.54, biased_high), prompt (3, 0.53, biased_low); cost prompt_tdd
(19, 0.78, coverage 68%, p90_too_narrow), test (13, 0.81, 69%, p90_too_narrow), test_tdd (5, 0.65, biased_low), prompt (3,
0.27, 33%, biased_low and p90_too_narrow). Exclusions: none.

Margins worth stating: cost objective coverage is 4 of 5, exactly the 80% target; cost TRD coverage 34 of 41 passes
with one TRD to spare at 33 of 41 (80.5%) and fails at 32 (78.0%).

## In-sample reference

`estimate backtest 55,56,57 --calibration <frozen> --raw` (these objectives are inside the frozen calibration, so this
is a reference, not out of sample). The estimates and the cost columns match 58-10's table to the printed digit. The
minute actuals differ for 55 and 56: 58-10 summed the TRDs that had minutes, while the verb compares an objective only
when every TRD has minutes (55 is excluded because of 55-06) and reads 56 at 36 min against 58-10's 27.

| Objective | Agent min p50 / P90 today | Actual today (58-10) | Ratio today (58-10) | Cost p50 / P90 | Actual | Ratio today (58-10) |
|---|---|---|---|---|---|---|
| 55 | 2h 14m / 6h 36m (133.6 / 395.7) | excluded, 55-06 has no minutes (68, 6 of 8 TRDs) | n/a (1.96) | $21.66 / $32.67 | $23.06 | 0.94 (0.94) |
| 56 | 1h 15m / 3h 39m (74.6 / 218.5) | 36 (27, 4 of 5 TRDs) | 2.07 (2.76) | $15.83 / $23.58 | $15.72 | 1.01 (1.01) |
| 57 | 1h 49m / 5h 03m (109.5 / 302.7) | 72 (72) | 1.52 (1.52) | $22.61 / $32.81 | $21.41 | 1.06 (1.06) |

Verdict block of the in-sample run: agent minutes `insufficient (2 objectives compared, 3 needed)`, cost SC2 pass (median
1.01, 3 of 3 in band) and SC3 pass (3 of 3 objectives, 20 of 20 TRDs). Even in sample, minutes run high (median 1.80 over
two objectives; code_tdd 1.64 and doc 2.67 flagged biased_high).

## Rolling leave-future-out (secondary, not the verdict)

For each N: `git archive --format=tar -o <scratch>/cut-N.tar <first>^ .planning`, extract, `calibrate --paths <scratch>/cut-N
--no-overhead --out <scratch>/cal-cut-N.json --raw`, `estimate backtest N --calibration <scratch>/cal-cut-N.json`.
Every calibrate exit 0; every backtest exit 0; the live calibration stayed `5cf42c4b…` after each step. These
calibrations never existed at the time (built with today's `calibrate` over the old data, and the snapshots carry only
the token fields stamped at that moment: 59 and 60 have none, so 237 to 243 TRDs with tokens throughout).

| Obj | Cutoff (first commit^) | Calibration | Agent min p50 / P90 | Actual | Ratio | In band | Covered | Cost p50 / P90 | Actual | Ratio | In band | Covered | TRDs covered (min / cost) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 59 | 401a9145^ | 324 TRDs, 749 tasks | 108.4 / 334.3 | 84 | 1.291 | yes | yes | $20.04 / $28.48 | $23.88 | 0.839 | yes | yes | 7 of 7 / 6 of 7 |
| 60 | 05a5b5f4^ | 331 TRDs, 766 tasks | 99.8 / 288.0 | 74 | 1.348 | no | yes | $21.19 / $29.63 | $19.79 | 1.071 | yes | yes | 7 of 7 / 7 of 7 |
| 61 | d7b9c938^ | 338 TRDs, 784 tasks | 123.0 / 383.9 | 70 | 1.758 | no | yes | $27.37 / $39.61 | $27.57 | 0.993 | yes | yes | 9 of 9 / 8 of 9 |
| 62 | 9ad19b1c^ | 347 TRDs, 805 tasks | 141.6 / 403.9 | 96 | 1.475 | no | yes | $29.13 / $41.16 | $45.75 | 0.637 | no | no | 11 of 11 / 6 of 11 |
| 63 | 26e4e57f^ | 358 TRDs, 831 tasks | 82.8 / 294.1 | 112 | 0.739 | yes | yes | $19.43 / $29.51 | $27.16 | 0.715 | yes | yes | 6 of 7 / 5 of 7 |

Aggregate of the five rolling rows (`estimate-backtest.cjs` `summarize(rows, classRows(rows))` in a scratch script; the
rows were rounded at output, so medians are at 3-decimal precision; the SC labels are what the code-pinned rules give
these rows, shown for comparison only):

| Metric | Median ratio | Pooled | In band | P90 covers objectives | P90 covers TRDs | SC2 | SC3 | Flagged classes |
|---|---|---|---|---|---|---|---|---|
| Agent minutes | 1.348 | 1.274 | 2 of 5 | 5 of 5 | 40 of 41 (97.6%) | fail | pass | code_tdd (41, 1.59, high), prompt_tdd (19, 1.88, high), prompt (3, 0.53, low) |
| Cost | 0.839 | 0.813 | 4 of 5 | 4 of 5 (80%) | 32 of 41 (78.0%) | pass | fail | prompt_tdd (19, 0.78, 68%), test (13, 0.78, 69%), code (6, 0.70, 17%), test_tdd (5, 0.65, low), prompt (3, 0.27, 33%) |

Reading: recalibrating before every objective would have lowered the minutes median from 1.51 to 1.35 and still failed
SC2 (the same two objectives, 59 and 63, are in band and 60, 61 and 62 stay outside it); and it would have made cost SC3 fail (TRD coverage
32 of 41 = 78.0%, against 34 of 41 on the frozen calibration), because 62's eleven TRDs are priced low in both. So
fresher data of the same kind does not cure the minutes bias, and the rolling run is not evidence that EST-08 would
have been met. The `Reproduced` column of the 63 wall row is not meaningful in these runs (and was not used).

## Window 42-58 (secondary, not the verdict)

The pre-59 snapshot restricted to objectives 42-58 (v1.4 onward; `cut-59/.planning/objectives/4[2-9]-*` and `5[0-8]-*`
plus STATE_ARCHIVE.md): `calibrate --paths <scratch>/win-42-58 --no-overhead --out <scratch>/cal-win.json --raw` read
186 TRDs, 449 tasks, 179 with tokens (inputs_digest `sha256:bf347cbd91eed15f2dd0a54c60f11d33652dde47390f87a41caaadb6695bd19a`),
then `estimate backtest 59,60,61,62,63 --calibration <scratch>/cal-win.json --raw`. This is the one window the TRD
specified; no other window was tried.

- Agent minutes: SC2 pass (median ratio 1.27, 3 of 5 in band), SC3 pass (5 of 5 objectives, 40 of 41 TRDs); pooled ratio 1.34.
- Cost: SC2 pass (median 0.91, 5 of 5 in band), SC3 pass (5 of 5 objectives, 35 of 41 TRDs = 85%).
- The verb printed `EST-08: met` for this calibration. It is a diagnostic: a calibration that never existed at the
  time, selected after the frozen run failed, and it is inside the band by 0.03 on the median (the pooled ratio, 1.34,
  is outside it). It is reported as information and does not change the verdict.
- Per objective, agent min ratio / cost ratio: 59 1.08 / 0.91, 60 1.27 / 1.19, 61 1.77 / 1.08, 62 1.91 / 0.71, 63 0.82 / 0.81.
- Classes still flagged in the window: minutes code_tdd 1.65 (high), prompt_tdd 2.63 (high), code 1.44 (high), test 0.41
  (low); cost prompt_tdd (68%), test (69%), test_tdd 0.65, prompt 0.44 (33%). The window lowers the objective p50s
  (59: 1h 31m against 1h 48m on the frozen calibration) while the class tables still flag the same large classes, and
  prompt_tdd (1.88 to 2.63) and test (0.68 to 0.41) get worse. So old history does not explain the class-level bias; a
  recency window moves the objective median inside the band, with the per-class errors in opposite directions. One
  window cannot separate recency from that offsetting.
- 63's wall row `Reproduced: no` (the reconstruction from this calibration is 1h 23m / 3h 34m against the recorded
  1h 37m / 4h 50m), as expected for a calibration other than the frozen one.

## Report, status and follow-up (Task 3)

- `64-ACCURACY-REPORT.md` written through `planning draft` + Write + `doc put` (`verdict: not met`; sections Verdict, What
  was compared, Results (the verb's `--raw` report pasted unedited), Miscalibrated classes and follow-up, Secondary
  analyses (rolling, window, in-sample, actuals), Defects found, Status, Reproduce). Every figure is labelled
  reconstructed or prospective; the only prospective figure is 63's wall time.
- `REQUIREMENTS.md` via `doc put`: EST-08 stays `- [ ]` with ` (validated 2026-10-07 against objectives 59-63: not met,
  see 64-ACCURACY-REPORT.md)` and the traceability row reads `Not met: see objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md; follow-up todo recalibrate-estimate-minutes-est-08-not-met`.
  `requirements mark-complete` was not run.
- Todos via `todo add --from`: `recalibrate-estimate-minutes-est-08-not-met` (per-class numbers, the diagnostics,
  three options, next check on the next five objectives) and `ship-executor-token-stamp-forward-stamp-8-of-41`
  (8 of 41 forward-stamped; release the current `agents/executor.md`).
- Extra scratch analyses beyond the TRD list, to give the todo a concrete cause, read-only on the primary JSON: per-class
  median actual share per task against the calibration's p50 (code_tdd 3.3 min against 6.0), and TRD time against task
  count (24 TRDs with two tasks, 17 with three; correlation of actual minutes with task count 0.00, of the estimate 0.76;
  3-task TRDs ratio 1.80, 2-task 1.21). Two task counts is thin evidence and the report says so.

Calibrations built: five rolling (`cal-cut-N.json`, 324 to 358 TRDs) and one window (`cal-win.json`, 186 TRDs), all in the
scratchpad. The live `~/.claude/devflow/calibration.json`, the frozen copy and 63's history file were never written;
hashes re-checked at the end of each task (see Post-TRD Verification).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The REQUIREMENTS.md `planning draft` was stale**
- **Found during:** Task 3 (reading the draft before the Edit)
- **Issue:** `planning draft REQUIREMENTS.md` returned an existing draft (a draft is never replaced) that predates the
  current file: EST-07 unchecked and EST-06/EST-07 `Pending`, where the repository file has them `[x]` and `Complete`. A
  `doc put` from it would have reverted those rows.
- **Fix:** copied the current `.planning/REQUIREMENTS.md` into the scratchpad, edited the two EST-08 lines there and ran
  `doc put REQUIREMENTS.md --from <scratch copy>`. A diff against the current file showed exactly the two intended lines.
  The stale draft was left in place, untouched (see Issues for the orchestrator).
- **Files modified:** `.planning/REQUIREMENTS.md` (two lines)
- **Commit:** 81e3d01c

**2. [Rule 3 - Blocking] Large `estimate backtest` JSON is returned as an `@file:` pointer**
- **Found during:** Task 1 (parsing `bt-primary.json`)
- **Issue:** the default (JSON) output of the five-objective run is above df-tools' inline limit, so redirecting it to a
  file captured `@file:/var/folders/.../df-<ms>.json`, not the JSON.
- **Fix:** copied the referenced file into the scratchpad (`bt-primary-data.json`) before use. The rolling per-objective
  JSONs were small enough to come back inline. The report's Reproduce section says so.
- **Files modified:** none

No production code, estimator code, threshold or input was changed. The `todo add` stems carry no date prefix (they were
passed as `--stem`), unlike the older pending todos.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Primary backtest and in-sample reference | `df-tools estimate backtest 59,60,61,62,63 --calibration <frozen> [--raw]`; `... 55,56,57 --raw`; `shasum -a 256` x3 | 0 | PASS: `verdict.est08` `"not met"` in the JSON (copied from the `@file:`), quoted verbatim above; hashes unchanged |
| 2: Rolling and window diagnostics | five x (`git archive`, `tar -xf`, `calibrate --paths --no-overhead --out`, `estimate backtest N --calibration`); window `calibrate` and `estimate backtest ... --raw`; `shasum -a 256 ~/.claude/devflow/calibration.json` | 0 | PASS: five `cal-cut-N.json` and five `bt-roll-N.json` exist and are recorded, window recorded, live calibration still `5cf42c4b…` |
| 3: Report, status, todos | `rg -n "^verdict:|^## Verdict|^## What was compared|^## Results|^## Secondary analyses|^## Reproduce"` on the report; `rg -n "EST-08" .planning/REQUIREMENTS.md`; `df-tools commit` | 0 | PASS: every section found (`verdict: not met`), EST-08 status matches the report, commit `81e3d01c` lists the report, REQUIREMENTS.md, both todos and the SUMMARY |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (TRD gate and stack `gates.task`) | `npm --prefix /Users/justin/dev/devflow-claude test` (main checkout, run after `roadmap update-job-progress 64`) | 0 | PASS: 10963 tests, 10929 pass, 0 fail, 34 skipped, 143 s |

The suite was run in the main checkout, where `node_modules` (node-pty) exists, so the nine daemon tests that fail in a
fresh worktree (64-02, 64-03) pass here. It was run after the ROADMAP box for 64-05 was ticked, so the `roadmap-reconcile`
E2E1 drift test (64-03, 64-04) did not trip. No code changed in this TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (rows for 59-63 with executor minutes and cost per objective and per TRD, plus 63's wall time and
  waves from the prospective run state; the verdict quoted from `estimate backtest` with the numbers behind each criterion
  and no threshold changed; every figure labelled reconstructed or prospective with the frozen sha256, the 63
  reproduction, the drift list and the current-code caveat; SC2 fails for minutes so the classes and a follow-up todo are
  named and no estimator code changed; EST-08 left unchecked with a traceability status naming the report and the todo;
  the rolling, window, in-sample and actuals analyses are present and labelled secondary)
- Gate failures: None
- End-of-run hashes: `~/.claude/devflow/calibration.json` and the frozen copy `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`; 63 history `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`; the live estimate run state for objective 64 was never touched (no `estimate start|wave|finish`)
- No scratch file committed (`git show --stat 81e3d01c`: the report, REQUIREMENTS.md, two todos, this SUMMARY); the extracted snapshots and tars were deleted, the JSON and markdown results kept in the scratchpad
- `requirements-completed: []`: `requirements mark-complete EST-08` was not run

## Issues for the orchestrator

1. **EST-08 is not met; the local `objective complete 64` will tick `- [ ] **EST-08**` automatically.** The traceability
   status (`Not met: see ...`) survives it, the checkbox does not. Whoever completes Objective 64 must re-open that
   checkbox or record the decision to accept the verdict. Objective 64's own success criteria: 1 met (report), 2 failed for
   agent minutes (1.51), 3 passed (P90 covers); the follow-up todos satisfy the "names the classes and the follow-up" clause.
2. **A stale `REQUIREMENTS.md` draft exists** at `/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/devflow-drafts/devflow-claude-d3dccfe9/REQUIREMENTS.md`
   (EST-07 unchecked, EST-06 and EST-07 `Pending`). `planning draft REQUIREMENTS.md` never replaces an existing draft, so
   any TRD (64-06 included) that edits REQUIREMENTS.md from that path and runs `doc put` would revert those rows. 64-05 used
   a fresh copy instead. Delete that draft, or re-seed it from the repository file, before 64-06 touches REQUIREMENTS.md.
3. **For 64-06 (docs):** the report's headline is the verdict above; describe EST-08 as not met on reconstructed
   estimates, the one prospective figure being 63's wall time. The default JSON of `estimate backtest` (five
   objectives, 141 KB) is returned as an `@file:<temp path>` pointer, not inline; use `--raw` for the report.
4. **The window diagnostic prints `EST-08: met`** (minutes median 1.27, pooled 1.34). It is labelled secondary in the
   report and must not be quoted as the verdict: that calibration never existed at the time and was tried after the frozen
   run failed.
5. **Forward token stamp reached 8 of 41 SUMMARYs;** no installed executor prompt carries the step. Todo
   `ship-executor-token-stamp-forward-stamp-8-of-41`; the fix is a release of the current `agents/executor.md`.
6. **Two pending todos were created:** `recalibrate-estimate-minutes-est-08-not-met` and `ship-executor-token-stamp-forward-stamp-8-of-41`
   (no date prefix, unlike the older ones).

## Self-Check: PASSED

- FOUND: .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md (verdict: not met)
- FOUND: .planning/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md and .planning/todos/pending/ship-executor-token-stamp-forward-stamp-8-of-41.md
- FOUND: 489d7b76, c4e923a3, 81e3d01c (git log 810dbe47..HEAD)
- FOUND: EST-08 unchecked in .planning/REQUIREMENTS.md with the Not met traceability status
- FOUND: live calibration, frozen copy and 63 history file with their recorded sha256
