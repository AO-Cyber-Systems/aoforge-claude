---
objective: 61-store-mode-rough-edges-and-observability
job: "06"
subsystem: gh-setup
tags: [gh-setup, dry-run, workflow-pins, commit-steps, pull-request]

requires:
  - objective: 61-01
    provides: checks-pin.cjs parseWorkflowPins, the one reader of the workflow's uses:/devflow-ref: lines
provides:
  - "gh-setup planWorkflow attaches pins / previous_pins; renderPlan prints them"
  - "commit-steps.branchCommitSteps ends both forms with a runnable gh pr create --head <branch> --fill"
  - "gh-setup-cli dry run previews the follow-up steps (filesLines preview form)"
affects: [objective-61 documentation, docs/USER-GUIDE.md (61-09), gh-sync SKILL.md body (objective 62)]

tech-stack:
  added: []
  patterns:
    - "one pin reader: planWorkflow takes pin lines from checks-pin.parseWorkflowPins, never a second regex"
    - "filesLines(cwd, files, outcomes, { preview }) changes only its first line, so the apply wording stays byte-identical"

key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/commit-steps.cjs
    - plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
    - plugins/devflow/skills/gh-sync/SKILL.md

key-decisions:
  - "A conflict workflow prints no pins: setup leaves that file alone, and pins would imply it will not"
  - "gh pr create has no --base: the default branch is gh's default and naming it would need a GitHub read the steps do not do"
  - "The dry-run preview maps plan statuses to outcome statuses (create to created, update to updated) so filesLines, including its ruleset admin-bypass paragraph, reads a plan the way it reads an apply"

patterns-established:
  - "A printed PR step is a command, built once in commit-steps and shared by gh setup, migration 0010 and doctor check 20"

requirements-completed: [STOR-01]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-06
tokens_input: 6177216
tokens_output: 40134
tokens_cache_read: 6048693
tokens_cache_write: 128417
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 61 TRD 06: setup dry run pins and PR step Summary

**`df-tools gh setup` (the dry run) now prints the workflow's pinned `uses:` and `devflow-ref:` lines (with `was` lines on a re-pin) and previews the follow-up steps, and every printed branch-and-PR sequence ends in a runnable `gh pr create --head <branch> --fill`.**

## Progress
- [x] Task 1: renderPlan prints the workflow pins (tests 1-6) — RED f7deebe4, GREEN feb1b442
- [x] Task 2: A runnable PR-create step in every printed sequence, previewed by the dry run (tests 7-14) — RED f20b8d34, GREEN a7a48359

## What was built

**Pins (Task 1).** `gh-setup.planWorkflow` attaches `pins` (the literal `uses:` and `devflow-ref:` lines from
`checks-pin.parseWorkflowPins(...).lines`) to a create, update and exists workflow action, and `previous_pins` (from the
file now on disk) to an update. Either field is omitted when it would be empty, and a conflict carries neither.
`renderPlan` prints `    <line>` after the `write` line for create and update and directly under the action line for
exists, then `    was <line>` for the previous pins. Every other action renders byte-identically. The action shape comment and
the `renderPlan` doc gained `pins` / `previous_pins`. `gh-setup.cjs` already imported from `checks-pin.cjs` (61-01
handoff), so `parseWorkflowPins` joined that existing import.

**PR step (Task 2).** `commit-steps.branchCommitSteps` builds line 5 of both forms with one `prCreateCommand(branch)`:
`  gh pr create --head <branch> --fill`. Plain form stays 5 lines, store form 6 (line 6 is still the `gh pr start` route),
and the escaped-line count stays 1. Migration 0010, doctor checks 20/21 and `gh setup --apply` print it with no code
change of their own. `gh-setup-cli.filesLines` gained `{ preview: true }`, which changes only the first line
(`After --apply: it writes <files> to the working tree, not committed.`). `dryRun` now takes `cwd` and appends
`previewLines(cwd, actions)` after the `Dry run for ...` line and before any problem line; with no workflow or PR-template
write in the plan it appends nothing. The gh-sync SKILL.md code block quotes `gh pr create --head devflow-store-cache --fill`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: renderPlan pins | `node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/checks-pin.test.cjs` | 0 (128 tests) | PASS |
| 2: PR step and preview | `node --test` on commit-steps, gh-setup-cli, 0010-store-gitignore, doctor-checks/20, planning-writes.repo (with gh-setup) | 0 (204 tests) | PASS |
| 2: old prose gone | `rg -n "then open a pull request for that branch" plugins/devflow` | 1 (no output) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-setup.test.cjs` | 1 (tests 1-4 failed) | FAIL (correct) |
| GREEN (task 1) | `node --test .../gh-setup.test.cjs .../checks-pin.test.cjs` | 0 (128 pass) | PASS (correct) |
| RED (task 2) | `node --test .../commit-steps.test.cjs .../gh-setup-cli.test.cjs` | 1 (6a, 6b, 6c, 9, and CLI tests 10, 12, 13 failed; 11 and 14 already held) | FAIL (correct) |
| GREEN (task 2) | the task gate suites | 0 (204 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test` on gh-setup, gh-setup-cli, commit-steps, 0010-store-gitignore, doctor-checks/20 (plus planning-writes.repo, 0011 apply, doctor 21-22) | 0 (204 pass; 30 more in 0011/21-22) | PASS |
| test (full suite) | `npm test` | 1 (10258 pass, 11 fail, 50 skipped) | see Deferred Issues |

## Deviations from Plan

None - TRD executed exactly as written. Two judgment calls inside the TRD's latitude:

- Tests 7-9 in commit-steps.test.cjs assert the old prose is absent with the shorter `/then open a pull request/`
  rather than the full sentence, so the TRD's `rg "then open a pull request for that branch" plugins/devflow` check stays
  empty even though the tests mention the phrase. The 51-04 constants became `HISTORICAL_0010_LINES_1_TO_4` and
  `HISTORICAL_DOCTOR20_LINES_1_TO_4`.
- `0010-store-gitignore.test.cjs` and `20-legacy-runtime-state.test.cjs` did not assert the old line 5, so neither
  needed an edit (the error-recovery clause did not trigger).

## Deferred Issues

`npm test` shows 11 failures, none in a file this TRD touches:

- `devflow-watch.test.cjs` (2) and `handoff-e2e.test.cjs` (6): the daemon does not start from a `.df-worktrees/...`
  checkout (known environmental).
- `stack-drafter-fleet.test.cjs` (`github-enterprise-migration` draft vs the committed STACK.md in a repository outside
  this checkout): known.
- `roadmap-reconcile.test.cjs` E2E1 (self-test): ROADMAP line for 61-06 is still `[ ]` while this SUMMARY exists;
  resolved by `roadmap update-job-progress`.
- `ui-metrics.test.cjs` computeBaseline "echoes since and paths back": timed 6.7 s under the full suite and passes in
  isolation (16/16). A load flake; the file imports nothing this TRD changed.

## Documentation left for later TRDs

- `docs/USER-GUIDE.md` (lines ~910, 1154, 1159, 1306) still quotes the old prose and says the steps give no PR command;
  owned by 61-09.
- `plugins/devflow/skills/gh-sync/SKILL.md` line ~83 (step 6, `setup`) still says "the printed steps end at 'then open a
  pull request'" and "the dry run does not print" the pins. The TRD allowed only the one code-block line in this file
  (the rest of the body belongs to objective 62), so that prose is now stale and is flagged here for that sweep.

## Discovered commands

None. The stack profile supplied `test` (`node --test {files}` scoped, `npm test` full).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (dry run prints pins for create, update with `was` lines and exists, and in `--raw`; the dry
  run previews the steps ending in `gh pr create --head devflow-setup --fill`; apply, 0010 and doctor 20 share the
  builder's runnable PR step; the dry run still makes zero GitHub writes and writes no local file, test 1 unchanged)
- Gate failures: None in touched files; 11 pre-existing or environmental failures listed under Deferred Issues

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-setup.cjs (`pinFields`, `pins` in renderPlan)
- FOUND: plugins/devflow/devflow/bin/lib/commit-steps.cjs (`prCreateCommand`)
- FOUND: plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs (`previewLines`, `{ preview }`)
- FOUND: plugins/devflow/skills/gh-sync/SKILL.md (`gh pr create --head devflow-store-cache --fill`)
- FOUND commits: f7deebe4, feb1b442, f20b8d34, a7a48359
