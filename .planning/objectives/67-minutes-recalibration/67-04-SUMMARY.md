---
objective: 67-minutes-recalibration
job: "04"
subsystem: estimation
tags: [EST-10, validation, positive-controls, minutes-method, ship-rule]

requires:
  - objective: 67-minutes-recalibration
    provides: "DECISION-003 (d888f55790f4b7144a33c514767467627bced9ba): method {minutes: trd_level, window_objectives: 10, through_objective: 66}, fallback task_sum, protocol V1-V6"
  - objective: 67-minutes-recalibration
    provides: "67-02 calibrate v3 (--minutes, --through, method block) and 67-03 estimator trd_level minutes"
provides:
  - "67-VALIDATION.md: PC1 and PC2 reproduced; one score of task_sum against trd_level on 46-66 of the decision snapshot; ship_default true; method_selected trd_level"
  - "frozen method {minutes: trd_level, window_objectives: 10, through_objective: 66} for 67-05 (calibrate default) and 67-09 (frozen EST-11 calibration)"
affects: [67-05, 67-09]

tech-stack:
  added: []
  patterns:
    - "controls before scores: the instrument reproduces the last published result on the old path before the new path is scored"
    - "splice, do not retype: the validation document takes the harness markdown verbatim by script"

key-files:
  created:
    - .planning/objectives/67-minutes-recalibration/67-VALIDATION.md
  modified: []

key-decisions:
  - "ship_default is true because the new method's own verdict is met; the rule's improved clause is false (agent-minutes median 1.021 old, 1.051 new). Reported as the rule returned it; no other reading is applied"
  - "Scratch is a subdirectory of the session scratchpad instead of a bare mktemp -d (outside the repository and ~/.claude either way)"

requirements-completed: []

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 9min
completed: 2026-10-08
tokens_input: 7095109
tokens_output: 54605
tokens_cache_read: 6938411
tokens_cache_write: 156578
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 04: Positive controls, then the once-only validation of the frozen method Summary

**Both positive controls reproduced (PC1 digest `fdf60e66…`, all 53 PC2 cells equal); one score of `task_sum` against `trd_level` over objectives 46-66 of the decision snapshot returned EST-08 `met` for both methods, and the unchanged ship rule returned `ship_default: true` ("the new method meets EST-08"), so the frozen method is `{minutes: trd_level, window_objectives: 10, through_objective: 66}`. The rule's `improved` clause is `false`: the agent-minutes median ratio is 1.021 old and 1.051 new.**

## Progress
- [x] Task 1: Positive controls PC1 and PC2 on the task-sum path — f0e46e5f
- [x] Task 2: Score once: old (task_sum) against new (trd_level) on cuts of 46-66 of the decision snapshot — 5de8dec8
- [x] Task 3: Write and commit 67-VALIDATION.md — ca0daada

## Scratch

`/private/tmp/claude-501/-Users-justin-dev-devflow-claude/479a0889-ce59-4c31-8887-a62c6f15eab4/scratchpad/s67-04` (a subdirectory of the session scratchpad rather than a bare `mktemp -d`; outside the repository and outside `~/.claude`). It holds the snapshots, the 47 calibration files (5 pc2, 42 validation), `pc1.json`, `pc2.json/md`, `score.json/md`, the three `sub-*.json/md` and the scripts.

## Precondition (all held before anything ran)

- DECISION_SHA `d888f55790f4b7144a33c514767467627bced9ba` (last commit on `DECISION-003.md`) is an ancestor of HEAD (`merge-base --is-ancestor` exit 0).
- `git log --oneline -- …/67-VALIDATION.md` printed nothing.
- `CALIBRATION_VERSION = 3` (calibrator.cjs:16) and `KNOWN_MINUTES_METHODS` (estimate.cjs:57) found; the six test files named in the TRD: 290 tests, 290 pass, 0 fail.
- `~/.claude/devflow/calibration.json` hashed to `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`; `git status --short plugins scripts` printed nothing.

## Positive controls (Task 1)

**PC1.** Pre-59 snapshot (`git archive 401a9145^ .planning`: 61 objective directories, last `58-estimation-engine-and-surfacing`; leak check `^(59|6[0-9])-` printed nothing), `estimate-window-eval.cjs report --eval 46-58 --grid 10,15,20,30,40 --label pre59`. `shasum -a 256 pc1.json` printed `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`: equal to the frozen digest.

**PC2.** Five window-10 cuts with `--minutes task_sum`. Every pc2 file is `version: 3`, `method.minutes: task_sum`, window 10, `through_objective: null`. Calibration sizes equal 64-VALIDATION section 1 (90/200/83, 82/187/68, 76/178/55, 75/174/48, 80/186/45 TRDs, tasks, tasks with tokens). Comparison against 64-VALIDATION section 3 (53 cells), expected, got, equal:

| Cell | Expected | Got | Equal |
|---|---|---|---|
| 59 minutes p50 | 80.6 | 80.6 | yes |
| 59 minutes P90 | 223.4 | 223.4 | yes |
| 59 minutes actual | 84 | 84 | yes |
| 59 minutes ratio | 0.959 | 0.959 | yes |
| 59 cost p50 | 19.0268 | 19.0268 | yes |
| 59 cost P90 | 25.7994 | 25.7994 | yes |
| 59 cost actual | 23.8786 | 23.8786 | yes |
| 59 cost ratio | 0.797 | 0.797 | yes |
| 60 minutes p50 | 91.6 | 91.6 | yes |
| 60 minutes P90 | 214.4 | 214.4 | yes |
| 60 minutes actual | 74 | 74 | yes |
| 60 minutes ratio | 1.238 | 1.238 | yes |
| 60 cost p50 | 19.9731 | 19.9731 | yes |
| 60 cost P90 | 28.2953 | 28.2953 | yes |
| 60 cost actual | 19.7921 | 19.7921 | yes |
| 60 cost ratio | 1.009 | 1.009 | yes |
| 61 minutes p50 | 100.6 | 100.6 | yes |
| 61 minutes P90 | 224.9 | 224.9 | yes |
| 61 minutes actual | 70 | 70 | yes |
| 61 minutes ratio | 1.437 | 1.437 | yes |
| 61 cost p50 | 25.9458 | 25.9458 | yes |
| 61 cost P90 | 37.5934 | 37.5934 | yes |
| 61 cost actual | 27.5684 | 27.5684 | yes |
| 61 cost ratio | 0.941 | 0.941 | yes |
| 62 minutes p50 | 133.8 | 133.8 | yes |
| 62 minutes P90 | 285.2 | 285.2 | yes |
| 62 minutes actual | 96 | 96 | yes |
| 62 minutes ratio | 1.394 | 1.394 | yes |
| 62 cost p50 | 30.3968 | 30.3968 | yes |
| 62 cost P90 | 44.0281 | 44.0281 | yes |
| 62 cost actual | 45.7525 | 45.7525 | yes |
| 62 cost ratio | 0.664 | 0.664 | yes |
| 63 minutes p50 | 78.1 | 78.1 | yes |
| 63 minutes P90 | 171.8 | 171.8 | yes |
| 63 minutes actual | 112 | 112 | yes |
| 63 minutes ratio | 0.697 | 0.697 | yes |
| 63 cost p50 | 18.0529 | 18.0529 | yes |
| 63 cost P90 | 27.8531 | 27.8531 | yes |
| 63 cost actual | 27.1594 | 27.1594 | yes |
| 63 cost ratio | 0.665 | 0.665 | yes |
| summary minutes median | 1.238 | 1.238 | yes |
| summary minutes pooled | 1.112 | 1.112 | yes |
| summary minutes in band | 2 | 2 | yes |
| summary minutes P90 objectives covered (coverage) | 1 | 1 | yes |
| summary minutes TRDs compared | 41 | 41 | yes |
| summary minutes TRD coverage | 0.9756 | 0.9756 | yes |
| summary cost median | 0.797 | 0.797 | yes |
| summary cost pooled | 0.787 | 0.787 | yes |
| summary cost in band | 3 | 3 | yes |
| summary cost P90 objectives covered (coverage) | 0.8 | 0.8 | yes |
| summary cost TRDs compared | 41 | 41 | yes |
| summary cost TRD coverage | 0.7805 | 0.7805 | yes |
| verdict est08 | not met | not met | yes |

## Score (Task 2)

Snapshot of DECISION_SHA: 70 objective directories, last `67-minutes-recalibration`; leak check `rg -n "^(6[89]|7[0-2])-"` printed nothing; all 21 eval objectives (46-66) present, none excluded by hand. 42 calibrations (`--through N-1 --window 10 --no-overhead`, `task_sum` and `trd_level`).

**`score.sh` ran once** (exit 0, no mechanical error, no re-run). The three subsets ran after the full-set result was recorded.

Cut check (`check.cjs` exit 0: every file version 3, window 10, `through_objective` = N-1 and at most 65, expected method, last kept objective at most N-1; each old/new pair has equal `samples`, `trd_level`, `task_classes` and `window`; only `inputs_digest` differs, as the method is part of the identity):

| N | set | version | method.minutes | window_objectives | through_objective | window last | samples.trds | trd_level.minutes p50 / p90 |
|---|---|---|---|---|---|---|---|---|
| 46 | old | 3 | task_sum | 10 | 45 | 45-devflow-doctor | 98 | 20 / 55 |
| 46 | new | 3 | trd_level | 10 | 45 | 45-devflow-doctor | 98 | 20 / 55 |
| 47 | old | 3 | task_sum | 10 | 46 | 46-github-sync-foundations | 101 | 20 / 55 |
| 47 | new | 3 | trd_level | 10 | 46 | 46-github-sync-foundations | 101 | 20 / 55 |
| 48 | old | 3 | task_sum | 10 | 47 | 47-github-authoritative-store | 99 | 15 / 45 |
| 48 | new | 3 | trd_level | 10 | 47 | 47-github-authoritative-store | 99 | 15 / 45 |
| 49 | old | 3 | task_sum | 10 | 48 | 48-planning-write-path-migration | 110 | 15 / 45 |
| 49 | new | 3 | trd_level | 10 | 48 | 48-planning-write-path-migration | 110 | 15 / 45 |
| 50 | old | 3 | task_sum | 10 | 49 | 49-objective-branch-and-pr-lifecycle | 120 | 15 / 45 |
| 50 | new | 3 | trd_level | 10 | 49 | 49-objective-branch-and-pr-lifecycle | 120 | 15 / 45 |
| 51 | old | 3 | task_sum | 10 | 50 | 50-github-enforcement-and-setup | 127 | 15 / 45 |
| 51 | new | 3 | trd_level | 10 | 50 | 50-github-enforcement-and-setup | 127 | 15 / 45 |
| 52 | old | 3 | task_sum | 10 | 51 | 51-github-migration-and-docs | 134 | 16 / 45 |
| 52 | new | 3 | trd_level | 10 | 51 | 51-github-migration-and-docs | 134 | 16 / 45 |
| 53 | old | 3 | task_sum | 10 | 52 | 52-store-mode-polish | 126 | 15 / 45 |
| 53 | new | 3 | trd_level | 10 | 52 | 52-store-mode-polish | 126 | 15 / 45 |
| 54 | old | 3 | task_sum | 10 | 53 | 53-worktree-and-health-hygiene | 118 | 14 / 45 |
| 54 | new | 3 | trd_level | 10 | 53 | 53-worktree-and-health-hygiene | 118 | 14 / 45 |
| 55 | old | 3 | task_sum | 10 | 54 | 54-codeql-cleanup | 117 | 14 / 45 |
| 55 | new | 3 | trd_level | 10 | 54 | 54-codeql-cleanup | 117 | 14 / 45 |
| 56 | old | 3 | task_sum | 10 | 55 | 55-store-live-smoke-fixes | 115 | 14 / 40 |
| 56 | new | 3 | trd_level | 10 | 55 | 55-store-live-smoke-fixes | 115 | 14 / 40 |
| 57 | old | 3 | task_sum | 10 | 56 | 56-objective-number-correctness | 110 | 13 / 40 |
| 57 | new | 3 | trd_level | 10 | 56 | 56-objective-number-correctness | 110 | 13 / 40 |
| 58 | old | 3 | task_sum | 10 | 57 | 57-estimation-data-foundation | 103 | 12 / 40 |
| 58 | new | 3 | trd_level | 10 | 57 | 57-estimation-data-foundation | 103 | 12 / 40 |
| 59 | old | 3 | task_sum | 10 | 58 | 58-estimation-engine-and-surfacing | 90 | 11 / 35 |
| 59 | new | 3 | trd_level | 10 | 58 | 58-estimation-engine-and-surfacing | 90 | 11 / 35 |
| 60 | old | 3 | task_sum | 10 | 59 | 59-state-and-merge-plumbing | 82 | 10 / 35 |
| 60 | new | 3 | trd_level | 10 | 59 | 59-state-and-merge-plumbing | 82 | 10 / 35 |
| 61 | old | 3 | task_sum | 10 | 60 | 60-edit-gate-enforces-the-action | 76 | 10 / 28 |
| 61 | new | 3 | trd_level | 10 | 60 | 60-edit-gate-enforces-the-action | 76 | 10 / 28 |
| 62 | old | 3 | task_sum | 10 | 61 | 61-store-mode-rough-edges-and-observability | 75 | 10 / 23 |
| 62 | new | 3 | trd_level | 10 | 61 | 61-store-mode-rough-edges-and-observability | 75 | 10 / 23 |
| 63 | old | 3 | task_sum | 10 | 62 | 62-built-in-sweep | 80 | 9 / 23 |
| 63 | new | 3 | trd_level | 10 | 62 | 62-built-in-sweep | 80 | 9 / 23 |
| 64 | old | 3 | task_sum | 10 | 63 | 63-todo-store-hook-coexistence-and-built-in-inventory | 80 | 9 / 20 |
| 64 | new | 3 | trd_level | 10 | 63 | 63-todo-store-hook-coexistence-and-built-in-inventory | 80 | 9 / 20 |
| 65 | old | 3 | task_sum | 10 | 64 | 64-estimate-accuracy-validation | 81 | 10 / 20 |
| 65 | new | 3 | trd_level | 10 | 64 | 64-estimate-accuracy-validation | 81 | 10 / 20 |
| 66 | old | 3 | task_sum | 10 | 65 | 65-release-v1-5 | 76 | 10 / 19 |
| 66 | new | 3 | trd_level | 10 | 65 | 65-release-v1-5 | 76 | 10 / 19 |

Result, read from `score.json`:

| | task_sum (old) | trd_level (new) |
|---|---|---|
| EST-08 | met | met |
| Agent minutes median / pooled | 1.021 / 1.041 | 1.051 / 1.026 |
| Agent minutes in band | 5 of 13 | 7 of 13 |
| Agent minutes P90 covers (objectives / TRDs) | 13 of 13 / 152 of 165 (0.9212) | 13 of 13 / 160 of 165 (0.9697) |
| Cost median / pooled | 0.943 / 0.973 | 0.943 / 0.973 |
| Cost in band | 15 of 18 | 15 of 18 |
| Cost P90 covers (objectives / TRDs) | 17 of 18 / 168 of 192 (0.875) | 17 of 18 / 168 of 192 (0.875) |
| Minutes excluded (incomplete actuals) | 8 of 21 (46, 47, 48, 49, 51, 54, 55, 65) | the same 8 |
| Cost excluded (incomplete actuals) | 3 of 21 (54, 64, 65) | the same 3 |

`ship`: `est08_old` "met", `est08_new` "met", `minutes_median_old` 1.021, `minutes_median_new` 1.051, `improved` false, `regressions` [], `ship_default` **true**, `reason` "the new method meets EST-08". `method_selected`: **trd_level**. Frozen method: `{minutes: trd_level, window_objectives: 10, through_objective: 66}`.

Subsets (descriptive only; they do not decide): 46-58 old `not met` (agent-minutes median 1.32, SC2 fail), new `met` (1.20); 59-63 both `met` (agent-minutes median 1.24 old, 1.10 new; cost P90 covers 33 of 41 TRDs, 80%, under both); 64-66 both `not met` with SC2/SC3 `insufficient` (2 objectives compared for minutes, 1 for cost; median 0.77 old, 0.84 new).

## 67-VALIDATION.md (Task 3)

Published with `doc put`; one commit (`ca0daada`); DECISION_SHA is its ancestor. `frontmatter get` prints `method_selected: trd_level` and `ship_default: true`. It was assembled by script from the harness output (`score.md`, `score.json`, the two check scripts and the subset files) so no figure is retyped.

## Deviations from Plan

None in the work. Five notes, none of which changed a protocol choice:

1. **Task 1 and Task 2 commits carry the SUMMARY checkpoint only.** The TRD lists their files as "(scratch only)"; to keep one commit per task, each commit holds the refreshed `## Progress` SUMMARY (`f0e46e5f`, `5de8dec8`). Task 3's commit (`ca0daada`) holds 67-VALIDATION.md and the SUMMARY.
2. **Scratch location.** The session scratchpad subdirectory was used instead of `mktemp -d` (same properties).
3. **Both methods meet EST-08 on 46-66.** The validation set does not separate the methods at the verdict level; the rule fired on its first clause. This is reported in 67-VALIDATION.md sections 1, 6 and 8, not weighed.
4. **59-63 under this protocol versus 64's report.** The agent-minutes figures of 59-63 equal the PC2 values at full precision, but the cost p50/P90 differ (for example objective 63 p50: 21.0551 here, 18.0529 in PC2), and the old method's cost TRD coverage on 59-63 is 33 of 41 (80%) here against 32 of 41 (78%) in 64-VALIDATION. The data differ (64's cut is `git archive FIRST^`; this protocol's is the decision snapshot with `--through N-1`). The cause was not investigated.
5. **`~/.claude/devflow/audit.log`** shows a modification within the hour: it is the session routing hook's own log (entries 13:24 to 13:35, before this TRD's claim at 13:55). `calibration.json` and everything else under `~/.claude/devflow` outside `state/` was untouched by this TRD.

Auth gates: none.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Positive controls | `shasum -a 256 <scratch>/pc1.json` equals `fdf60e66…`; `pc2-compare.cjs` (53 cells) | 0 | PASS |
| 1: Positive controls | `git status --short plugins scripts` | 0 (no output) | PASS |
| 2: Score once | `rg -n "^(6[89]\|7[0-2])-" <scratch>/snap-objectives.txt` | 1 (no output, as required) | PASS |
| 2: Score once | `node <scratch>/check.cjs` (42 files) | 0 | PASS |
| 2: Score once | `bash <scratch>/score.sh` (ran once) | 0 | PASS |
| 3: 67-VALIDATION.md | `frontmatter get … --field method_selected` | 0 (`trd_level`) | PASS |
| 3: 67-VALIDATION.md | `git log --oneline -- …/67-VALIDATION.md`; `merge-base --is-ancestor d888f557… ca0daada` | 0 (one commit) | PASS |
| all | `shasum -a 256 ~/.claude/devflow/calibration.json` | 0 (`9ef7d108…`) | PASS |

## Validation Gate Results

No stack gate ran: this TRD changes no code (`git status --short plugins scripts` printed nothing at the start, after Task 1, after Task 2 and at the end), so the inner loop and the task gates have no changed file to check. Recorded as `not_available`, not PASS.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (protocol ran once after the decision commit; PC1 and PC2 passed before scoring; snapshot has no 68-72 and every calibration has `through_objective` at most 65; 67-VALIDATION.md carries the old and new outputs, the ship rule result, `ship_default`, `method_selected` and the frozen method; the live calibration still hashes to `9ef7d108…`)
- Gate failures: None

## Self-Check: PASSED

- FOUND: `.planning/objectives/67-minutes-recalibration/67-VALIDATION.md`
- FOUND: commits `f0e46e5f`, `5de8dec8`, `ca0daada`
- `git status --short plugins scripts` empty; `calibration.json` hash unchanged
