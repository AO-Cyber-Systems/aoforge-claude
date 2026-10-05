---
objective: 59-state-and-merge-plumbing
job: "04"
subsystem: milestone-complete
tags: [milestone, scope, accomplishments, state-updated]
requires:
  - phase: 59-01
    provides: wave base (state merge driver); no code dependency
provides:
  - "milestone complete counts only the objectives its ROADMAP bullet names (PLMB-04)"
  - "milestone-scope.cjs: shared milestone objective selection plus section and directory fallbacks"
  - "state_updated reports a real STATE.md change (PLMB-05, milestone half)"
affects: [59-07 dogfood (scratch-copy run of milestone complete v1.4)]
tech-stack:
  added: []
  patterns: ["lazy require in roadmap.cjs to break the roadmap <-> milestone-scope cycle"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/milestone-scope.cjs
    - plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
key-decisions:
  - "Selection moved verbatim out of estimate-milestone.cjs; estimate-milestone re-exports it, its tests are unedited"
  - "A one-liner is the frontmatter one-liner, else the FIRST NON-BLANK line under the H1 when it is a bold-only line not starting with '['"
  - "A scope error (implausible range) now fails the command before any archive write instead of being swallowed"
requirements-completed: [PLMB-04, PLMB-05]
duration: 10min
completed: 2026-10-05
---

# Objective 59 TRD 04: milestone complete scope Summary

**`milestone complete vX.Y` now counts, lists and archives only the objectives the ROADMAP bullet for vX.Y names, reads real one-liners and task counts, and reports `state_updated` truthfully.**

## Progress
- [x] Task 1: Two-milestone fixture builder — 7eff858a
- [x] Task 2: Move milestone selection into milestone-scope.cjs — 5feacc3e (refactor), 1e75139e (RED), a34e3c2f (GREEN)
- [x] Task 3: Scoped stats, true one-liners and task counts, truthful state_updated — 8ac7335f (RED), e67dd32d (GREEN)

## What changed

- `milestone-scope.cjs` (new): `selectMilestoneObjectives` and `milestoneObjectiveNumbers` moved out of `estimate-milestone.cjs` unchanged, plus `sectionObjectives(cwd)` (every `### Objective N:` section with a directory) and `currentDirObjectives(cwd)` (every current objective directory, named by section else slug). `estimate-milestone.cjs` requires it and re-exports the two names.
- `roadmap.cjs` `cmdMilestoneComplete`:
  - scope from `completionScope`: bullet (`milestone bullet`), else sections (`roadmap sections`), else directories (`objective directories`);
  - jobs from the scoped directories, tasks from the opening task tags of the TRDs (the `<tasks>` wrapper never counts), accomplishments from `summaryOneLiner` (frontmatter `one-liner`, else the bold line under the H1, placeholders starting `[` skipped);
  - base entry line: `**Objectives completed:** N objectives (4, 5), J plans, T tasks`, and `0 objectives, 0 plans, 0 tasks` for none;
  - STATE.md is rewritten only when its bytes change, and `state_updated` says exactly that;
  - `--archive-objectives` moves only counted and cancelled directories that live under `.planning/objectives/`.
- New output keys: `objective_numbers`, `cancelled`, `absent`, `scope_source`. Existing keys unchanged.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | `node -e "require(.../milestone-complete-fixtures.cjs).makeMilestoneProject() ..."` lists 01-a..07-g and 40-decoy | 0 | PASS |
| 2: move + fallbacks | `node --test estimate-milestone.test.cjs milestone-complete.test.cjs` (16 estimate tests green before and after the move, unedited; S1-S4 RED then GREEN) | 0 | PASS |
| 3: scoped stats | `node --test milestone-complete.test.cjs estimate-milestone.test.cjs` (31 pass) and `node --test --test-name-pattern "milestone complete" df-tools.test.cjs` (3 pass, unedited) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (S1-S4) | `node --test milestone-complete.test.cjs` | 1 | FAIL: `scope.sectionObjectives is not a function` (correct) |
| GREEN (S1-S4) | `node --test estimate-milestone.test.cjs milestone-complete.test.cjs` | 0 | PASS (correct) |
| RED (tests 1-10) | `node --test milestone-complete.test.cjs` | 1 | FAIL: 9 of 10 failed on counts (8 objectives, 0 tasks); test 8 failed after being strengthened with a real one-liner beside the placeholder (correct) |
| GREEN (tests 1-10) | `node --test milestone-complete.test.cjs estimate-milestone.test.cjs` | 0 | PASS: 31 tests (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test milestone-complete.test.cjs estimate-milestone.test.cjs` | 0 | PASS |
| test (regression) | `node --test --test-name-pattern "milestone complete" df-tools.test.cjs`, `planning-verbs-cli.test.cjs`, `roadmap.test.cjs` | 0 | PASS |
| test (full) | `npm --prefix <worktree> test` | 1 | 9691 pass, 12 fail, 50 skipped; none caused by this TRD (see below) |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

Full-suite failures, all outside this TRD's files:
- `roadmap-reconcile E2E1` and `stack-drafter-fleet github-enterprise-migration`: the known baseline failures.
- 10 devflow-watch / handoff e2e tests: the worktree has no `node_modules`, so the daemon cannot load `node-pty` ("failed to spawn shell: node-pty not installed", confirmed from the daemon log). The same foreground-daemon test passes in the main checkout. Environmental to the worktree; two of them (C-1, C-2) passed on a re-run, so the set is also timing-sensitive.

## Deviations from Plan

None - TRD executed as written. Choices within the plan, for the record:

- **summaryOneLiner reads the first non-blank line under the H1**, not the first matching line anywhere after it. The TRD sentence is ambiguous; the stricter reading cannot pick up a stray bold line further down a SUMMARY. Of 408 SUMMARYs in this repo, 280 use the bold-line shape; 48 start with a bold label followed by text (mostly `**One-liner:** text`), 70 with plain text and 10 with a heading, and those contribute nothing (outside the TRD's two stated sources). Follow-up if wanted: also read the `**One-liner:** text` form.
- **Errors are no longer swallowed** in the stats and archive steps (the old `catch {}` blocks). A scope error or an unreadable TRD now stops the command; the scope is computed before anything is written.
- Test 8 was strengthened (a real one-liner beside the placeholder) because the weaker form already passed on the old code and could not go RED.
- **Only PLMB-04 was marked complete** in REQUIREMENTS.md. PLMB-05 is also about `objective remove` `roadmap_updated` (TRD 59-05); this TRD delivers its `milestone complete` half, so it is left pending for 59-05 to close. Also `state advance-job` reported `last_job` / `update-progress` found no Progress field (this worktree's STATE.md does not track objective 59's position), so STATE.md's position fields did not change (only the session fields, via `record-session`); STATE_ARCHIVE.md carries the metric and decision.
- A direct `devflow-watch start --foreground` run while diagnosing the daemon failures appended two lines to the real `~/.devflow/devflow-watch.log`; no daemon was left running.

## Discovered commands

None (stack profile `general`: `npm test`, scoped `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (counts scoped to the bullet; base entry line and accomplishments; cancelled reported, archive limited to the milestone; `scope_source` fallbacks; truthful `state_updated`)
- Gate failures: none attributable to this TRD (baseline failures and worktree-environment failures listed above)

## For 59-07

`milestone complete v1.4` on a scratch copy of this repo reports `objective_numbers` from the v1.4 bullet, `cancelled`, `absent` and `scope_source`; compare its entry with the hand-written v1.4 entry (13 objectives, 158 TRDs). The entry now says "plans" (the existing wording), so expect `13 objectives (42, ..., 54), J plans, T tasks`, and an accomplishments list drawn only from the bold-line and frontmatter shapes.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/milestone-scope.cjs
- FOUND: plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs
- FOUND commits: 7eff858a, 5feacc3e, 1e75139e, a34e3c2f, 8ac7335f, e67dd32d
