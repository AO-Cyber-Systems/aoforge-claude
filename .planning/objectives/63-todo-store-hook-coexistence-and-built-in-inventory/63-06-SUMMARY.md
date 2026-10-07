---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
job: "06"
subsystem: docs
tags: [built-ins, inventory, repo-test, hooks, bltn-06]

requires:
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-03 todo-sync Stop hook registered; 63-04 TodoWrite counted by builtin-audit and declared by the todo skill; 63-05 coexistence suite"
provides:
  - "docs/built-in-integration-status.md: 46 tool rows, 33 hook event rows, 18 other-surface rows, candidates, review procedure, adoption history of Objectives 62 and 63"
  - "builtin-status.repo.test.cjs: inventory <-> tree checks, pinned REQUIRED_TOOLS and REQUIRED_EVENTS, 13 sensitivity tests"
affects: [63-07 dogfood docs and full-suite run]

tech-stack:
  added: []
  patterns:
    - "Pure parsers and check functions at the top of a repo test, each check returning error strings, so a synthetic snippet can prove it fails"
    - "Pinned name lists in the test, updated together with the document; no clock check, the review cadence lives in the document's dates"

key-files:
  created:
    - docs/built-in-integration-status.md
    - plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs
  modified: []

key-decisions:
  - "TodoWrite is partial, not adopted: it is used only when CLAUDE_CODE_ENABLE_TASKS=0 brings it back, which the status legend calls dependent on an opt-in. The Task tools stay adopted (every block says 'if available')"
  - "TaskGet is partial: builtin-audit recognises it (so check 8 requires a live status) but no flow calls it"
  - "The Phase J J5 mcp__ccd_session__* tools are candidates in prose only, not table rows: they are absent from the public tools reference, so the document says to confirm they exist before adopting"
  - "BLTN-06 is not ticked in REQUIREMENTS.md: 63-07 also lists it and is the last TRD to carry it, the rule 63-01 to 63-04 followed for BLTN-04"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-10-07
tokens_input: 10086717
tokens_output: 73202
tokens_cache_read: 9388860
tokens_cache_write: 697721
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 63 TRD 06: The built-in integration inventory Summary

**A 46-tool, 33-event inventory of Claude Code's built-ins with an evidence-backed DevFlow status for each, held to the tree and to pinned name lists by a 25-test repo test that has no clock check.**

## Progress
- [x] Task 1: builtin-status.repo.test.cjs (RED) — 82218e68
- [x] Task 2: docs/built-in-integration-status.md (GREEN) — 035f8918

## Accomplishments
- **The test** (`builtin-status.repo.test.cjs`) implements TRD checks 1 to 10 plus 1b (J5 candidates and the Objective 62 and 63 history are present), 1c (the review procedure names the test file and both pinned lists) and a pinned-list sanity test. It reuses `splitFrontmatter` and `parseToolList` from `builtin-audit.cjs` and `escapeRegExp` from `text-escape.cjs`. Sensitivity tests (13) run on synthetic snippets, so they hold on any checkout.
- **The document** was written from searches, not names. A scratchpad script counted which non-test files in skills, agents, workflows, hooks, df-tools and references name each built-in as a word, and every ambiguous hit was read (for example `Artifact` and `Workflow` are table headings and prose, `PowerShell` is df-tools' own pwsh wrapper, `NotebookEdit` is only classified by session-audit).
- **Statuses.** Tools (46): 15 adopted, 7 partial (Glob, Grep, Monitor, TaskGet, TaskOutput, TodoWrite, WebFetch), 3 candidates (PushNotification, ReportFindings, ScheduleWakeup), 16 not adopted, 5 n/a. Events (33): 7 adopted (exactly the keys of `hooks.json`), 2 candidates (TaskCreated, TaskCompleted), 20 not adopted, 4 n/a. Other surfaces (18): 8 adopted, 5 partial, 1 candidate (`${CLAUDE_PLUGIN_DATA}`), 4 not adopted.
- **Aliases.** `Task` becomes `Agent`: alias accepted, the sub-agents doc says the tool was renamed in v2.1.63 and `Task(...)` still works. `SlashCommand` becomes `Skill`: alias status unverified (no mention in the tools reference, skills doc or permissions doc); the row says so and a cleanup line sits in Candidates.
- **Docs reconciled.** The tools reference (46 names) and hooks reference (33 events) fetched on 2026-10-06 with Claude Code 2.1.292 match the TRD's pinned lists exactly: no differences.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: test (RED) | `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` | 1 | PASS (RED: 11 document-dependent tests fail on the missing file; sensitivity group and pinned-list test pass, 14 of 25) |
| 2: document (GREEN) | `node --test builtin-status.repo.test.cjs doc-refs.repo.test.cjs builtin-sweep.repo.test.cjs hook-inventory.test.cjs` | 0 | PASS (61/61; builtin-status alone 25/25) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` | 0 | PASS (25/25) |
| test (full) | `npm test` | 1 | 10835 tests, 10802 pass, 32 skipped, 1 fail (below) |

The one failure of the final full run is `handoff-e2e.test.cjs` MA-7 (`doctl auth init with unset DIGITALOCEAN_TOKEN`). It reproduces when the file is run alone. The test spawns the machine's own `doctl` (`/opt/homebrew/bin/doctl`), which exits 0 with empty stderr where the test expects a failure path. This TRD adds a document and a new test file and touches nothing that test reads. I did not run it against the base commit, so "pre-existing" is an inference from that, not a measurement.

The first full run, before `roadmap update-job-progress 63`, also failed `roadmap-reconcile.test.cjs` E2E1: the checkpoint SUMMARY existed while the ROADMAP line for 63-06 was unticked. That is the same self-test failure 63-01 to 63-05 recorded; it passed on the second run once the line was ticked.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` | 1 | FAIL (correct: every document test fails on `docs/built-in-integration-status.md is missing`) |
| GREEN | same | 0 | PASS (25/25 on the first run of the finished document) |

No REFACTOR commit. One RED-phase fix before the commit: the header sensitivity test asserted no `/review/i` error, which also matched the missing `## Review procedure` section; narrowed to the three header lines.

Mutation check on the real document (backup in the scratchpad, restored afterwards): marking `SessionEnd` adopted, `Stop` candidate, pointing a cited path at a missing file and deleting the `TaskGet` row made tests 2, 5, 7 and 8 fail, naming each cause.

## Spot checks against `rg` (TRD verification)

| Row | Status | Evidence |
|---|---|---|
| `TaskList` (adopted tool) | adopted | `check-todos.md:43` calls `TaskList()`; `skills/todo/SKILL.md:16` declares it |
| `TaskOutput` (partial tool) | partial | one call, `execute-objective.md:510`; the tools reference marks it deprecated for `Read` |
| `ScheduleWakeup` and `TaskCompleted` (candidates) | candidate | 0 hits outside the test file |
| `Stop` (adopted event) | adopted | `hooks.json:54` registers `todo-sync.js` in the Stop group |
| `PreCompact` and `PostCompact` (not-adopted events) | not adopted | 1 hit, the pinned list in the test |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 4/4 (every pinned tool and event has a row; statuses match the tree after 62 and 63; dates, version, procedure, candidates and history present; the repo test fails on a missing row, unknown status, stale citation or unregistered adopted event)
- **Gate failures:** the one unrelated MA-7 failure above

## Files Created/Modified
- `docs/built-in-integration-status.md` - the inventory (new)
- `plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` - the test (new)

## Decisions Made
See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong declaration counts in my first draft of the notes**
- **Found during:** Task 2 (checking the written notes against a script that counts declarations separately for skills and agents)
- **Issue:** I had written four counts from file-hit totals instead of declarations: AskUserQuestion 26 skills (25), Read 32 (31), Write 22 (21), and 20 hook registrations (21, now that todo-sync is registered). One note said Monitor was unavailable in the 63-04 session, which 63-04's SUMMARY does not say (only 63-03 reports it disabled).
- **Fix:** corrected all five and added `changelog-on-tag.js` and `gate-interactive.js` to the PreToolUse row's Where, which the notes already mentioned.
- **Files modified:** `docs/built-in-integration-status.md`
- **Commit:** 035f8918 (the fixes went in before the commit)

### Other deviations from the TRD text
- **Three tests beyond the TRD's ten:** 1b, 1c and the pinned-list sanity test, each from a must-have (J5 candidates and history, the review procedure naming the test, the 46 and 33 counts).
- **J5 `mcp__ccd_session__*` tools are not table rows.** They are not in the fetched tools reference, so the Candidates section lists them with a "confirm it exists in the session before adopting" caveat.
- **Other surfaces has four columns** (no Since), as the TRD's table spec says; the test reads columns by header name, so both shapes parse.

## Issues Encountered
- The TRD's research context calls the ScheduleWakeup idea "`/devflow:loop`-style". No such command exists, so the document describes it as a check-the-build-every-N-minutes flow instead.
- The statuses TodoWrite=partial and Glob/Grep=partial are judgment calls the status legend supports; a reviewer who reads "partial" as "weak" may want to reword the legend.

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
63-07 should regenerate `site/data/devflow.json` (63-03 left it stale on purpose), run the full suite, tick BLTN-04, BLTN-05 and BLTN-06 in REQUIREMENTS.md, and decide whether to fix the MA-7 environment dependence (it needs `doctl` absent or unauthenticated). When a built-in is added or dropped, or a hook is registered, `builtin-status.repo.test.cjs` fails until `docs/built-in-integration-status.md` and the pinned lists are updated together.

## Self-Check: PASSED

- Created files present: `docs/built-in-integration-status.md`, `plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs`.
- Commits found in `git log`: `82218e68`, `035f8918`.
- `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs`: 25/25.

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-07*
