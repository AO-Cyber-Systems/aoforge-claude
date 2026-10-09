---
objective: 62-built-in-sweep
job: "01"
subsystem: testing
tags: [builtin-audit, askuserquestion, taskcreate, plan-mode, scanner, ratchet]

requires: []
provides:
  - "builtin-audit.cjs: pure scanner for prose choice prompts, AskUserQuestion schema breaks, built-in declarations, progress wiring and plan-mode draft spans"
  - "builtin-audit-fixtures.cjs: hand-built skillMd, workflowMd, askCall, askProse and makeTree builders"
  - "GROUPS / GROUP_PATHS: the eight-group partition of 34 skills and 40 active workflows between the conversion TRDs"
affects: [62-02, 62-03, 62-04, 62-05, 62-06, 62-07, 62-08, 62-09, 62-11]

tech-stack:
  added: []
  patterns:
    - "Line scanner with a window and an inline allow marker, mirroring planning-audit.cjs (TRD 48-04)"
    - "Call-form detection for built-ins, directive-form detection for AskUserQuestion, uniform 24-character negation guard"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
    - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs
  modified: []

key-decisions:
  - "ExitPlanMode is forbidden in allowed-tools and never reported as missing: its permission prompt is the plan approval, so pre-approving it could approve the draft the user is meant to review"
  - "groupOf returns null (not a default group) for a path the table does not pin, so a legacy workflow or a new unowned file is visible to 62-03"
  - "Negation (never, no, not, without, n't, do not within 24 characters) applies to every built-in mention in builtinsUsed and planModeSpans, not only to AskUserQuestion, so 'Never call X' is not a use"

patterns-established:
  - "badMarkers entries are { line, why: 'short' | 'stale' }; allowed entries are { line (the suppressed line), reason }"
  - "skillCoverage.via[tool] lists the absolute file paths that use the tool, SKILL.md first, workflows in breadth-first order"

requirements-completed: [BLTN-01, BLTN-02, BLTN-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-06
tokens_input: 5404723
tokens_output: 71659
tokens_cache_read: 5236765
tokens_cache_write: 167868
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 62 TRD 01: The built-in audit scanner Summary

**A pure, tested scanner (`builtin-audit.cjs`) that finds prose choice prompts and AskUserQuestion schema breaks, reports undeclared and forbidden built-ins per skill (following workflow references transitively), measures TaskCreate/TaskUpdate wiring and plan-mode draft spans, and partitions all 74 skills and active workflows into eight conversion groups.**

## Progress
- [x] Task 1: Hand-built fixture builders — 809c25d6
- [x] Task 2: scanPrompts — prose prompts, schema checks, markers (tests 1-11) — RED 6b60df87, GREEN 9e3a46c2
- [x] Task 3: Declarations, progress, plan mode, scan set and groups (tests 12-20) — RED 75a68f59, GREEN 6ff86688

## Accomplishments

- `scanPrompts(text)` returns `{ findings, allowed, badMarkers }`. Findings are `prose-choice`, `ask-without-options`, `header-too-long` and `too-many-options`. The 14 starting CHOICE patterns from the TRD matched every test-2 positive and none of the test-3 negatives, with no tuning needed.
- `skillCoverage`, `builtinsUsed`, `workflowRefs`, `splitFrontmatter`, `parseToolList` answer the declaration question. `progressCounts` and `planModeSpans` answer BLTN-01 and BLTN-02 from prose.
- `scanSet(repoRoot)` returns 74 `{ rel, text }` entries on the real repository and every one has exactly one group in `GROUPS`; all 74 `GROUP_PATHS` entries exist in the scan set.
- 79 node tests (20 numbered cases, expanded into sub-tests) pass in about 50 ms. The scan of the real tree (75 files including the legacy workflow) takes about 17 ms, so no backtracking concern.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Hand-built fixture builders | `node -e "const f=require('.../__fixtures__/builtin-audit-fixtures.cjs'); const t=f.makeTree({...}); console.log(readFileSync(t.skillsDir+'/a/SKILL.md','utf8').split('\n')[0]); t.cleanup()"` printed `---` | 0 | PASS |
| 2: scanPrompts (tests 1-11) | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` (51 tests at that point) | 0 | PASS |
| 3: Declarations, progress, plan mode, scan set, groups (tests 12-20) | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` (79 tests) and `scanSet(repo)` count check printed `74 []` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2, 6b60df87) | `node --test .../builtin-audit.test.cjs` | 1 (module `./builtin-audit.cjs` not found) | FAIL (correct) |
| GREEN (Task 2, 9e3a46c2) | `node --test .../builtin-audit.test.cjs` | 0 (51 pass) | PASS (correct) |
| RED (Task 3, 75a68f59) | `node --test .../builtin-audit.test.cjs` | 1 (tests 12-20: `... is not a function`, tests 1-11 still pass) | FAIL (correct) |
| GREEN (Task 3, 6ff86688) | `node --test .../builtin-audit.test.cjs` | 0 (79 pass) | PASS (correct) |

No REFACTOR commit: nothing to clean up after either GREEN.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` | 0 | PASS |

The stack profile is `general`: build, lint, format and typecheck are `none`; the full `npm test` was not run because the TRD scopes the task gate to the new test file and no existing file changed.

## Discovered commands

None. `test` came from the stack profile (`node --test {files}`).

## Deviations from Plan

None - TRD executed exactly as written. Two small additions beyond the numbered tests, both inside the owned files: `GROUP_PATHS` is exported alongside `GROUPS` (test 20c needs it, and 62-03 will want it), and tests 7e, 13e, 13f, 16 sub-cases, 17c and 18e cover marker masking, key isolation, fixture round-trips and edge cases the numbered list implied.

### Pattern conflicts for 62-03 (error_recovery)

None. No test-2 positive collided with a test-3 negative, so no pattern was narrowed or dropped and nothing needs the inventory to classify it `manual`.

## Findings for 62-03 and the conversion TRDs

A smoke run of the scanner on the real tree (not asserted by this TRD) shows the starting state the ratchet will have to move:

- `scanPrompts` finds 71 `prose-choice`, 2 `header-too-long`, 2 `ask-without-options` and 2 `too-many-options` across the 75 files.
- `skillCoverage` reports `missing`: cleanup and flow (AskUserQuestion), execute-objective (TaskUpdate), new-project, plan-objective, quick and verify-work (TaskCreate, TaskUpdate). It reports `forbidden: ExitPlanMode` for build and plan-objective.
- `progressCounts` over the scan set: 19 creates, 13 completes, 0 in_progress.
- `planModeSpans` finds two spans, build.md (enter 78, exit 106) and plan-objective.md (enter 121, exit 132). Both have a skip line naming `--auto`; neither mentions a draft between enter and exit.
- `skills/build/SKILL.md` declares `ExitPlanMode` in an inline `allowed-tools` string, which the forbidden check will flag.

Behaviours the repo test should know: `builtinsUsed` and `planModeSpans` apply the same negation guard as `scanPrompts`; the skip line is any line within the 20 above the enter that contains `--auto`; `mentionsDraft` matches `\bdraft` anywhere from the enter line to the exit line inclusive (to the next enter or end of text when there is no exit).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (truths 1-6 each have a passing test; artifacts exist; `scanSet` returns 74 with every file grouped)
- Gate failures: None
- Files changed outside the TRD's `files_modified`: none (only the three module files and this SUMMARY)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/builtin-audit.cjs
- FOUND: plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs
- FOUND commits: 809c25d6, 6b60df87, 9e3a46c2, 75a68f59, 6ff86688
