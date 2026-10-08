---
objective: 72-install-and-naming-cleanup
job: "01"
subsystem: planning
tags: [requirements, roadmap, aoforge-rename, est-11, run-state]

requires: []
provides:
  - "run state for objective 72 recorded before any other 72 TRD (EST-11 gate)"
  - "REQUIREMENTS.md: INST-01 rewritten to the /aoforge: scope, INST-02..INST-06 added and mapped to Objective 72"
  - "ROADMAP.md: Objective 72 rescoped to the AOForge rename (title, goal, six requirement ids, six success criteria)"
affects: [72-02, 72-03, 72-26, 75-estimation-retest]

tech-stack:
  added: []
  patterns: ["REQUIREMENTS.md via planning draft + doc put; ROADMAP.md (generated) via targeted Edit hunks in local mode"]

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Run state for 72 was already recorded when this TRD started (started_at 2026-10-08T22:24:56.615Z), so Task 1 took the idempotent path and asked nothing."
  - "No requirement is marked complete: INST-01 is only rescoped here and is delivered by later TRDs, so requirements-completed is empty and `requirements mark-complete` was not run."

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 3min
completed: 2026-10-08
tokens_input: 3069174
tokens_output: 20228
tokens_cache_read: 2958734
tokens_cache_write: 110370
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 72 TRD 01: Rescope INST-01 and the Objective 72 roadmap entry Summary

**Planning documents now describe the AOForge rename scope: INST-01 rewritten, INST-02..INST-06 added, Objective 72's roadmap entry rewritten, and the EST-11 run state for 72 confirmed recorded before any other 72 TRD runs.**

run_state: recorded 2026-10-08T22:24:56.615Z

## Progress
- [x] Task 1: Gate: record the run-state estimate for 72 before anything else runs — (no repo files; run state already recorded)
- [x] Task 2: Rewrite INST-01 and add INST-02..INST-06 in REQUIREMENTS.md — bf12644a
- [x] Task 3: Rewrite the Objective 72 roadmap entry — fe0ae9f4

## Run state (Task 1)

The pre-check found `~/.claude/devflow/state/estimates/devflow-claude-d3dccfe9.json` already holding objective `72`,
`started_at` `2026-10-08T22:24:56.615Z` and `finished_at` `null`. That is the TRD's idempotent path, so no
`estimate start` call, no recalibration and no question were needed. The file was not edited.

Two facts the estimate scoring should know:

- The recorded `estimate.line` reads `No estimate: objective 72 has no minutes data in the calibration; run df-tools calibrate`
  (`wall_minutes: null`, `confidence: none`). The per-wave p50 and P90 figures in `waves` are present for 17 of 18 waves
  (wave 11, TRD 72-19, has null p50 and p90). Objective 75 should read this as a recorded run state with no objective-level estimate.
- The calibration it names already carries the frozen DECISION-003 method block (`trd_level`, window 10, through objective 66),
  so option (a) of the checkpoint (regenerate with the frozen method) had nothing left to change. I did not run `calibrate`
  and made no backup.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: run-state gate | `node -e` on the state file prints objective 72, non-null `started_at`, null `finished_at` | 0 | PASS |
| 2: REQUIREMENTS.md | `rg -n -e 'INST-0[1-6]' .planning/REQUIREMENTS.md` (6 requirement lines, 6 traceability rows; `git diff --stat`: 13 insertions, 3 deletions) | 0 | PASS |
| 3: ROADMAP.md | `git diff -U0 .planning/ROADMAP.md` (hunks only at lines 115, 117, 126 and the 72 section); `roadmap get-objective 72 --raw` prints the new title and goal | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node plugins/devflow/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/devflow-claude validate requirements --objective 72 --raw` | 0 | PASS |

The TRD names `node ~/.claude/devflow/bin/df-tools.cjs validate requirements`, but the installed runtime (2.15.0) answers
`Unknown validate subcommand. Available: consistency, health, docs` (exit 1), because the verb is unreleased and the mirror
lags. The same verb from the repo source ran clean: `requirements-completed agrees with VERIFICATION (0 objectives, 0 requirements checked)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale REQUIREMENTS.md draft reseeded from the live file**
- **Found during:** Task 2
- **Issue:** `planning draft REQUIREMENTS.md` returned an existing draft from 2026-10-07 that differed from the live file (pre-completion checkboxes and statuses, no base marker). `doc put` from it would have reverted the REL/EST/TOOL/SDR completion marks.
- **Fix:** Copied the live file over the draft (`cmp` equal), then applied the three edits to the draft and published with `doc put`. The resulting diff against the live file is exactly the intended 13 insertions and 3 deletions.
- **Files modified:** .planning/REQUIREMENTS.md
- **Commit:** bf12644a

**2. [Rule 3 - Blocking] Validation gate run from the repo source CLI**
- **Found during:** Task 2 verification
- **Issue:** The installed 2.15.0 runtime has no `validate requirements`.
- **Fix:** Ran the same verb from `plugins/devflow/devflow/bin/df-tools.cjs` in this checkout (exit 0).
- **Files modified:** none
- **Commit:** n/a

### Wording follow-on (inside the permitted bounds)

In the v1.6 sequencing paragraph, "run after the scored five for the same reason" referred to the claim that the scored five
are agent-only, which no longer holds for 72. I reworded it to "run after the scored five because their minutes are dominated
by human wait time". It is inside the paragraph the TRD allows editing.

### Notes

- `summary checkpoint` and `summary post` accept only the short id `72-01` (the long name is rejected as an invalid TRD id) and write `72-01-SUMMARY.md`, which is the path the TRD's `<output>` names.
- `requirements-completed` is empty on purpose. The TRD lists `requirements: [INST-01]`, but its anti-patterns forbid marking any requirement complete, and this TRD only rewrites the text. I did not run `requirements mark-complete`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (run state recorded; INST-01..06 in REQUIREMENTS.md with traceability rows and coverage 30; ROADMAP 72 title, requirements and six criteria; v1.6 intro and list line updated; no change outside the three bounded regions)
- Gate failures: None (the one gate ran from the repo source CLI, see above)

## Self-Check: PASSED

- FOUND: .planning/REQUIREMENTS.md, .planning/ROADMAP.md
- FOUND: commits bf12644a, fe0ae9f4
