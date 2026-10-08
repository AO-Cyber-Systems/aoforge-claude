---
objective: 66-executor-token-stamp
trd: "03"
subsystem: estimation
tags: [execute-objective, continuation, token-stamp, EST-09, workflow-prose, trd-identify]

requires:
  - objective: 66-executor-token-stamp
    provides: "66-01 tokens coverage subcommand (read by the aggregate_results line and test 8)"
  - objective: 57-token-usage
    provides: "trd-identify.identifyTrd, token-usage.identifyExecutorTrd, indexExecutorTranscripts and tokensForTrd"
provides:
  - "execute-objective checkpoint_handling: an unconditional never-inline rule with its reason"
  - "an explicit continuation Task( spawn whose PLAN_ID line carries the short {trd_id}"
  - "a {trd_id} placeholder (short id) distinct from the slug {plan_id}, defined in execute_waves item 4"
  - "a **Token stamp:** line in the aggregate_results report, with a fail-soft and a no-backfill clause"
  - "executor-token-stamp.repo.test.cjs: 9 contract tests"
affects: [66-04, execute-objective]

tech-stack:
  added: []
  patterns:
    - "fill-and-identify: a workflow spawn prompt is filled with literal values and run through the real identifiers"
    - "the PLAN_ID line takes the short id; --id on exec-context check keeps the slug the worktree was provisioned under"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs
  modified:
    - plugins/devflow/devflow/workflows/execute-objective.md

key-decisions:
  - "PLAN_ID: carries {trd_id} ({objective_number}-{plan_number}); {plan_id} (the slug) stays on exec-context --id, worktree and branch names"
  - "The continuation description, tokens stamp and summary post all take {trd_id}, so the continuation is identifiable on every tier and its commands accept the id"
  - "The no-backfill sentence sits before the report template, not after it, because the template block's fences are unbalanced and a sentence after it would sit inside an unclosed fence"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-08
tokens_input: 8714425
tokens_output: 51623
tokens_cache_read: 8550099
tokens_cache_write: 164208
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 66 TRD 03: Every TRD runs in an executor; continuation prompts name their TRD; the report shows stamp coverage Summary

**execute-objective now forbids running a TRD inline, spawns continuation executors from an explicit prompt whose `PLAN_ID:` line carries the short `{trd_id}` (so `identifyTrd` attributes it and its transcript is summed with the initial executor's), and prints a `**Token stamp:**` coverage line in every objective report.**

## Progress
- [x] Task 1: Never-inline rule and the explicit continuation spawn (tests 1-7) - RED c02cfd12, GREEN fd3f20d9
- [x] Task 2: Token-stamp line in aggregate_results (tests 8-9), then the full suite - RED daa9cb4b, GREEN 43860d4e

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-08T12:31:36Z
- **Tasks:** 2 of 2, four commits (two RED, two GREEN)
- **Files changed:** 2 (1 created, 1 modified)

## Accomplishments

- `checkpoint_handling` opens with **Every TRD runs in an executor, checkpoints included.** It says never to execute a TRD's tasks yourself, never to write a TRD's SUMMARY yourself, and gives the reason: `tokens stamp` reads the executor's own transcript, so a TRD run inline (65-02, 65-03) can never be stamped.
- The dangling `continuation-prompt.md` reference is gone. Branch 3 step 6 carries a fenced `Task(` for `subagent_type="executor"` with `description="Execute TRD {trd_id} (continuation)"`, `<checkpoint_reply>`, `<completed_tasks>`, `<resume_instructions>`, item 4's execution_context, plan_content, repo_and_base and worktree_protocol blocks, and a success_criteria block that stamps before it posts. Branch 1 and Branch 2 point at it.
- `execute_waves` item 4 defines `{trd_id}` (the short id, `{objective_number}-{plan_number}`) against the slug `{plan_id}`, and its `PLAN_ID:` line now carries `{trd_id}`.
- `aggregate_results` prints `**Token stamp:**` from `df-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw` (omitted if it fails), and says the orchestrator never runs `tokens backfill --write` to raise the number.
- Filled with literal values, both the item-4 prompt and the continuation prompt are identified as `77-02` by `identifyTrd` and `identifyExecutorTrd`; an initial plus a continuation transcript sum to `2 * 1370` output tokens under one TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: never-inline rule and continuation spawn | `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` (tests 1-7 pass) plus the related prose tests (205 pass) | 0 | PASS |
| 1: no dangling template | `rg -n "continuation-prompt\.md" plugins/devflow` finds only this test file's own comments and assertions; no `.md` mentions it and `templates/continuation-prompt.md` does not exist (test 2) | 0 | PASS |
| 2: aggregate token stamp line | `node --test` on executor-token-stamp, estimate-surfacing, builtin-audit, builtin-sweep, planning-writes, state-merge-wiring, executor-isolation, pr-lifecycle-prose and doc-refs repo tests (197 pass) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (tests 1-7) | `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` | 1 (7 of 7 fail) | FAIL (correct) |
| GREEN (tests 1-7) | `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` | 0 (7 pass) | PASS (correct) |
| RED (tests 8-9) | `node --test --test-name-pattern "^(8\|9)\. " plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` | 1 (test 8 fails; test 9 is matcher sensitivity and passes alone) | FAIL (correct) |
| GREEN (tests 8-9) | `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` and the eight related prose tests | 0 (9 pass; 197 across the set) | PASS (correct) |

No REFACTOR commit was needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` | 0 | PASS |
| test (full, before the roadmap update) | `npm --prefix /Users/justin/dev/devflow-claude test` (11140 tests, 11106 pass, 1 fail, 33 skipped) | 1 | The single failure is `roadmap-reconcile` E2E1: 66-03 has a SUMMARY while its ROADMAP box was unticked. Cleared by `roadmap update-job-progress 66` (see Issues Encountered) |
| test (full, after the roadmap update) | `npm --prefix /Users/justin/dev/devflow-claude test` (11140 tests, 11106 pass, 0 fail, 34 skipped) | 0 | PASS |

## Smoke run on this repository

The repository copy, which is what the line runs after the next release (the installed 2.14.0 runtime has no `coverage`):

`node plugins/devflow/devflow/bin/df-tools.cjs tokens coverage --objective 66 --raw`

```
objective 66 forward-stamped 2/2 = 1 (target 95%: met) · live 2 · backfill 0 · unlabeled 0 · missing 0 · in progress 1 (not counted)
  66-03 in progress
```

66-01 and 66-02 read `live`. 66-03 is in progress at the moment of the run (its checkpoint SUMMARY has no Self-Check yet) and is stamped when this SUMMARY is posted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The PLAN_ID line (and the stamp, post and description) used the slug `{plan_id}`, which `trd-identify` cannot read**
- **Found during:** dispatch (orchestrator finding from wave 1, confirmed in the 66-02 SUMMARY) and test 4.
- **Issue:** `{plan_id}` expands to the id `objective-job-index` reports, which carries the slug. `trd-identify.identifyTrd`'s `ID_END` `(?![\w-])` rejects `PLAN_ID: 66-01-tokens-coverage-command`, and `token-usage.identifyExecutorTrd`'s tier-2 and tier-3 patterns reject it too. With a slug-only `PLAN_ID:` the stop gate fails open and `tokens stamp` cannot attribute the transcript. Item 4 had this defect before this TRD, and the TRD's own continuation sketch would have copied it.
- **Fix:** defined `{trd_id}` as `{objective_number}-{plan_number}` in `execute_waves` item 4. The `PLAN_ID:` line in both prompts takes `{trd_id}`. In the continuation prompt the `description`, `tokens stamp` and `summary post` take it as well (a slug is not a valid TRD id for those commands). `exec-context check --id {plan_id}` keeps the slug: it must equal the id `exec-context worktree --id <plan_id>` provisioned, `executor-isolation.test.cjs` test 10 pins it, and the identifier simply does not capture a slug there.
- **Test changes versus the TRD text:** tests 3, 4, 5 and 7 pin `{trd_id}` where the TRD wrote `{plan_id}` (`description="Execute TRD {trd_id} (continuation)"`, `PLAN_ID:    {trd_id}`, `tokens stamp {trd_id} --draft`, `summary post {trd_id} --from`). Test 4 and 6 fill `{plan_id}` with a realistic slug (`77-02-fixture-slug`) and `{trd_id}` with `77-02`, so a regression to the slug on the PLAN_ID line fails the test. Test 5 is no longer a pure regression pin: it fails against the old item 4 and passes now.
- **Files modified:** plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs
- **Commits:** fd3f20d9 (workflow), c02cfd12 (tests)
- `trd-identify.cjs` was not touched.

### Other notes (not defects)

- The no-backfill sentence sits before the report template, not after it as the TRD sketched. The existing `aggregate_results` fences are unbalanced (the template's outer fence is closed by the inner Pending Decisions fence, so the last fence opens a block that never closes), and a sentence after the template would sit inside that block. I did not repair the fences (outside this TRD). The wording also avoids the phrase pair that `planning-writes` reads as a SUMMARY write instruction: an earlier draft with "stamps written when the SUMMARY is published" failed `planning-writes.repo.test.cjs` and `pr-lifecycle-prose.repo.test.cjs` test 8, and was reworded to "live stamps made at publish time".
- The TRD's verify line says `rg -n "continuation-prompt\.md" plugins/devflow` finds nothing. It finds this TRD's test file, which has to name the string to look for it. Test 2 scans `.md` files only, and no `.md` mentions it.
- The 66-02 SUMMARY recommends changing either `PLAN_ID` or `identifyTrd`. Only the first was done, per the dispatch.
- `requirements mark-complete EST-09` was NOT run. EST-09 completes only when 66-04 records the measured coverage; the dispatch lists only `state` and `roadmap` verbs.

## Issues Encountered

- The first full `npm test` showed one failure, `roadmap-reconcile` E2E1: a SUMMARY for 66-03 exists (the in-progress checkpoint) while its ROADMAP box is `[ ]`. This is the same state 66-01 and 66-02 reported. `roadmap update-job-progress 66` ticks the box.
- This run was sequential in the main checkout, so `node_modules` was present and the `node-pty` daemon tests that failed in the wave-1 worktrees ran and passed.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the planning-writes wording, Task 2) plus the Rule 1 id fix above
- Must-haves verified: 4/4 (never-inline rule with reason, explicit continuation spawn with no dangling template, both prompts identified and two transcripts summed, aggregate token line with fail-soft and no-backfill clauses)
- Gate failures: None in this TRD's code. E2E1 cleared by the roadmap update.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs, plugins/devflow/devflow/workflows/execute-objective.md
- FOUND commits: c02cfd12, fd3f20d9, daa9cb4b, 43860d4e
