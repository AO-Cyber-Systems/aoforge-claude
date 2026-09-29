---
objective: 44-autonomy-hardening
trd: "08"
job: 44-08
subsystem: df-tools job index + doc-refs CI gate
tags: [autonomy, progress-checkpoint, objective-job-index, task_count, doc-refs, legacy-agent-paths, AUT-01, AUT-03]
requires: ["44-01", "44-02", "44-06"]
provides:
  - "objective-job-index: a SUMMARY with `## Progress` and no `## Self-Check` is a checkpoint -> has_summary:false, listed in incomplete"
  - "objective-job-index: task_count counts real `<task>` XML elements (line-start, outside code fences), else legacy `## Task N` headings"
  - "doc-refs.cjs: scanLegacyAgentPaths(text) -> [{line, token}] and LEGACY_AGENT_PATH_RE"
  - "doc-refs.repo.test.cjs tests 11-14: CI gate against `~/.claude/agents/<name>.md` read instructions, with LEGACY_AGENT_EXEMPT"
affects: [execute-objective discover_and_group_plans, execute-objective model selection by task_count, 44-09]
tech-stack:
  added: []
  patterns:
    - "checkpoint-vs-final SUMMARY: Progress without Self-Check = checkpoint; neither heading = old-style final"
    - "gate-specific exemption list layered on the shared EXEMPT through effectiveScanSet({ extraExclude })"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs
    - plugins/devflow/devflow/bin/lib/doc-refs.cjs
    - plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs
decisions:
  - "task_count counts `<task` only at line start and outside ``` / ~~~ fences; the TRD's suggested bare /<task\\b/g over-counted 8 of 250 repo TRDs (44-08: 5 vs 2, 14-01: 11 vs 3), and task_count picks the executor model tier"
  - "An unreadable SUMMARY stays complete (the pre-44-08 behaviour), so a read error can never re-run a finished TRD"
  - "A `## Self-Check: FAILED` SUMMARY is final (complete), matching execute-objective 5c"
  - "The LEGACY gate reuses effectiveScanSet() through a new optional { extraExclude } parameter, so walkFiles' own exclude globs apply LEGACY_AGENT_EXEMPT; existing callers are unchanged"
  - "Scope: only objective-job-index is checkpoint-aware; roadmap analyze, progress bars and verify-completion.js still count any SUMMARY file"
metrics:
  duration: 7min
  tasks: 2
  files: 4
  completed: 2026-09-29
---

# Objective 44 TRD 08: Checkpoint-aware job index and the legacy agent-path CI guard — Summary

**`objective-job-index` now treats a Progress-only SUMMARY as an unfinished TRD, so a re-run of execute-objective resumes it instead of skipping it. It also counts real `<task>` elements, so `task_count` is no longer 0 for every modern TRD. A new doc-refs CI gate fails when any shipped text tells an agent to read `~/.claude/agents/<name>.md`.**

## Progress

- [x] Task 1 RED: job index checkpoint-aware + XML task_count tests — b9b34f8
- [x] Task 1 GREEN: misc.cjs cmdObjectiveJobIndex — c3a3f26
- [x] Task 2 RED: LEGACY agent-path gate tests (doc-refs.repo.test.cjs 11-14) — 5b7ca9e
- [x] Task 2 GREEN: doc-refs.cjs scanLegacyAgentPaths + LEGACY_AGENT_PATH_RE — 732e0e2
- [x] Validation gates, `npm test`, final SUMMARY with Self-Check (this commit)

## What changed

**Task 1: `lib/misc.cjs` `cmdObjectiveJobIndex` (b9b34f8 RED, c3a3f26 GREEN)**
- `_isCheckpointOnlySummary(text)` = `/^##\s+Progress\b/m` and not `/^##\s+Self-Check\b/m`. `completedJobIds` is now built only from SUMMARY files that are not checkpoint-only. Each file is read synchronously, and an unreadable file counts as complete.
- Old-style SUMMARYs (neither heading) stay complete. I checked all of them: in this repo, every SUMMARY that has `## Progress` (44-01, 02, 03, 04, 06) also has `## Self-Check`, so no historical objective flips to incomplete.
- `task_count = _countTaskElements(content) || <## Task N count>`. `_countTaskElements` strips fenced blocks, then counts `^[ \t]*<task\b` (m flag). `<tasks>` and `</task>` never match.
- New tests in `describe('objective-job-index command')`:
  - checkpoint vs final vs old-style, plus a Self-Check: FAILED final;
  - 3 `<task>` elements -> 3;
  - legacy JOB -> 2;
  - both forms -> XML wins;
  - inline and fenced mentions don't count.

**Task 2: `lib/doc-refs.cjs` + `lib/doc-refs.repo.test.cjs` (5b7ca9e RED, 732e0e2 GREEN)**
- `LEGACY_AGENT_PATH_RE = /@?~\/\.claude\/agents\/[A-Za-z0-9_-]+\.md/g` and `scanLegacyAgentPaths(text) -> [{line, token}]` (1-based lines; the token keeps a leading `@`). They are separate from `scanText`/`rewriteText`, so migration 0007 never rewrites agent paths.
- `LEGACY_AGENT_EXEMPT` = [`plugins/devflow/devflow/bin/lib/global-upgrade.cjs`, with its reason]. The shared EXEMPT already covers `__fixtures__/**` (upgrade-fixtures.cjs) and `**/*.test.cjs` (upgrade.test.cjs).
- `effectiveScanSet({ extraExclude = [] } = {})`. The new `legacyAgentScanSet()`, `findLegacyAgentFindings()` and `formatLegacyFailureMessage()` print `file:line  token` plus the exemption table.
- Tests 11-14 in `describe('LEGACY: agent-path read instructions')` are listed in the header Test list:
  - 11: the gate;
  - 12: exemption sanity;
  - 13: sensitivity. It fires on the three historical shapes and not on the `~/.claude/agents/df-*` glob, including the real USER-GUIDE.md;
  - 14: scope. The LEGACY set equals `effectiveScanSet()` minus LEGACY_AGENT_EXEMPT. Legacy workflows, fixtures and tests are excluded, and the 44-01/44-02 files are scanned.
- The dispatch asked me to check execute-objective.md:818. `rg "claude/agents" plugins/` finds nothing there, because 44-01 removed it. The only hits in shipped text are the `df-*` globs in global-upgrade.cjs, upgrade-fixtures.cjs, upgrade.test.cjs and USER-GUIDE.md, and none of them match the regex.

## Deviations from Plan

**1. [Rule 1 - Bug] The suggested `/<task\b/g` over-counts tasks**
- **Found during:** Task 1 (a survey of all 250 TRDs in `.planning/objectives`)
- **Issue:** A bare `/<task\b/g` also counts prose that mentions a task tag in backticks, and XML examples inside code fences. It read 5 for 44-08-TRD.md (2 real tasks), 4 for 44-01 (2) and 11 for 14-01 (3), and it was wrong for 8 of 250 TRDs. execute-objective uses `task_count` to choose the executor model (<=2 sonnet, >5 opus), so over-counting sends small TRDs to a bigger tier.
- **Fix:** Count only `<task` at the start of a line (indent allowed), after stripping ``` / ~~~ fenced blocks. All 250 TRDs now have a non-zero count, and every one of the 8 that changed moved to its true count. There is an extra test for it: "task_count ignores inline `<task` mentions and fenced XML examples". The must-have ("counts `<task ...>` XML elements") is met more precisely than with the suggested regex.
- **Files:** plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs. **Commits:** b9b34f8, c3a3f26

**2. [Scope addition] Self-Check: FAILED fixture and a real-file negative in test 13**
- The test list names three SUMMARY cases. I added a fourth, `## Self-Check: FAILED` -> complete, to pin agreement with execute-objective 5c, where `final` = PASSED|FAILED.
- Test 13 also checks that the real docs/USER-GUIDE.md still contains the `df-*` glob and produces zero findings.

## Observations for follow-up (not fixed, out of scope)

- `cmdObjectiveJobIndex` reads `fm['files-modified']` (with a hyphen), but TRD frontmatter uses `files_modified` (with an underscore). `files_modified` therefore comes back `[]` for every modern TRD (see `objective-job-index 44`), so the execute-objective model-selection rule "files_modified > 8 -> opus" never fires. This bug predates 44-08 and is outside its scope under the deviation rules' scope boundary. It is a one-line fix that needs its own test.
- `LEGACY_AGENT_EXEMPT`'s global-upgrade.cjs entry is currently pre-emptive. That file spells the legacy location as `.claude/agents/df-*`, which the regex does not match, so the exemption removes zero findings today. It passes the "matches >= 1 real path" sanity rule. The TRD and the dispatch both asked for it.
- docs/agent-spawning-convention.md (not in SCAN_INCLUDE) still says agents are "mirrored to `~/.claude/agents/`". That description is stale, but it is not a read instruction, and `{name}` does not match the regex.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test --test-name-pattern="objective-job-index command" df-tools.test.cjs` | 1 (4 of 11 fail: has_summary 77-02 true, task_count 0/3/0) | FAIL (correct) |
| 1 GREEN | same | 0 (11/11) | PASS |
| 1 | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS |
| 1 | `df-tools objective-job-index 44` | 0 (task_count 2,2,3,3,3,3,1,2,3; 44-08 has_summary:false while its SUMMARY was a checkpoint) | PASS |
| 2 RED | `node --test doc-refs.repo.test.cjs` | 1 (11 and 13 fail: `scanLegacyAgentPaths is not a function`; 1-10, 12 and 14 pass) | FAIL (correct) |
| 2 GREEN | `node --test doc-refs.repo.test.cjs doc-refs.test.cjs migrations/0007-doc-refs-fix.test.cjs` | 0 (45/45) | PASS |
| 2 (sensitivity, live) | a legacy read line appended to execute-objective.md, then the gate run, then `git checkout --` | 1 -> `execute-objective.md:1068  ~/.claude/agents/planner.md` | FIRES (correct); file restored |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test --test-name-pattern="objective-job-index command" df-tools.test.cjs` | 1 | FAIL (correct) |
| GREEN (T1) | same | 0 | PASS (correct) |
| RED (T2) | `node --test doc-refs.repo.test.cjs` | 1 | FAIL (correct) |
| GREEN (T2) | `node --test doc-refs.repo.test.cjs doc-refs.test.cjs 0007-doc-refs-fix.test.cjs` | 0 | PASS (correct) |
| REFACTOR | none needed | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | — | N/A |
| test | `node --test df-tools.test.cjs doc-refs.repo.test.cjs doc-refs.test.cjs` | 0 (177/177) | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs objective-job-index 44` | 0 (every 44-NN task_count > 0) | PASS |
| wave | `npm test` | 1 | PASS WITH EXPECTED FAILURES (see below) |

`npm test` ran 5276 tests: **5216 passed, 10 failed, 50 skipped, 0 cancelled.** All 10 failures are in the pre-existing families the dispatch lists:
- 6 in `bin/handoff-e2e.test.cjs`, because node-pty is missing in worktrees;
- 3 in `bin/devflow-watch.test.cjs`: the foreground daemon PID test, "refuses when already running", and multi-project C-2. These are in the same daemon family;
- 1 in `lib/roadmap-reconcile.test.cjs` E2E1. It wants `44-01-TRD.md` and `44-02-TRD.md` ticked in ROADMAP.md because their SUMMARYs exist. The dispatch forbids this executor from editing ROADMAP.md.

This TRD touches none of those files.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5:
  - checkpoint-aware has_summary with back-compat;
  - XML task_count;
  - scanLegacyAgentPaths export;
  - the LEGACY gate with the global-upgrade exemption;
  - green on the merged tree plus sensitivity.
- Gate failures: none attributable to this TRD

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs, plugins/devflow/devflow/bin/lib/doc-refs.cjs, plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs
- FOUND: commits b9b34f8, c3a3f26, 5b7ca9e, 732e0e2 on df/exec-44-08
- STATE.md / ROADMAP.md were deliberately not edited, per the dispatch.
