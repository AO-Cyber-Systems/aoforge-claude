---
objective: 62-built-in-sweep
trd: "04"
subsystem: skills-and-workflows
tags: [built-ins, progress, AskUserQuestion, TaskCreate, TaskUpdate, micro, quick, debug, verify-work, BLTN-01, BLTN-03]
requires: ["62-01", "62-02", "62-03"]
provides:
  - micro, quick, debug and verify-work report progress with TaskCreate/TaskUpdate (in_progress and completed)
  - every discrete choice in the four flows is an AskUserQuestion with options; free text stays prose
  - the micro-quick-debug and verify-work sweep baselines are empty and deleted
affects: ["62-10"]
tech-stack:
  added: []
  patterns:
    - "**Progress tracking (if available):** blocks: create, in_progress at stage start, completed (with a result description) at stage end, deleted when skipped"
    - "Runtime-list AskUserQuestion: up to 4 entries as options, more typed under Other"
    - "Free text asked in plain prose; a flagged free-text line outside a fence takes a builtin-audit allow marker, an in-fence line is reworded out of menu shape"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/micro.md
    - plugins/devflow/skills/micro/SKILL.md
    - plugins/devflow/devflow/workflows/quick.md
    - plugins/devflow/skills/quick/SKILL.md
    - plugins/devflow/skills/debug/SKILL.md
    - plugins/devflow/devflow/workflows/verify-work.md
    - plugins/devflow/devflow/workflows/diagnose-issues.md
    - plugins/devflow/skills/verify-work/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/micro-quick-debug.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json
decisions:
  - "debug CHECKPOINT REACHED follows inventory row BS-008 (human-verify asks Verify: Approved / Issues found) over the TRD's error_recovery note (prose for human-verify)"
  - "verify-work with more than 4 active UAT sessions: the user types another session's objective under Other, not a row number, because an objective number under Other already means start a new session"
metrics:
  duration: 8min
  completed: 2026-10-06
tokens_input: 10146387
tokens_output: 59961
tokens_cache_read: 9923518
tokens_cache_write: 222723
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 04: Progress and questions in micro, quick, debug and verify-work Summary

micro, quick, debug and verify-work now show per-stage TaskCreate/TaskUpdate progress through in_progress and completed, ask every discrete choice with an AskUserQuestion that has options, and ask free text (descriptions, symptoms, the UAT answer) in plain prose; both of the TRD's sweep baselines are gone.

## Progress
- [x] Task 1: micro, quick and debug — progress, plain-text descriptions, AskUserQuestion choices — RED fc90671e, GREEN 9ad824d4
- [x] Task 2: verify-work progress through in_progress and completed — RED 43a880e5, GREEN 0aad3406
- [x] Task 3: The verify group's prompts — RED 99d505ee, GREEN b529db5d

## Accomplishments

- **micro** (`workflows/micro.md`): step 1 asks "One-line description of the change?" in plain text (the no-options AskUserQuestion call is gone). One `Micro: ${DESCRIPTION}` task, created only after `micro start` returns ok and set in_progress at once. It completes after `micro commit` and is deleted on `micro abort`. A success-criteria line was added. skills/micro declares TaskCreate and TaskUpdate.
- **quick** (`workflows/quick.md`): step 1 asks "What do you want to do?" in plain text. Step 5 creates `Plan: ${DESCRIPTION}`, `Check plan` (--full), `Execute: ${DESCRIPTION}` and `Verify` (--full) in order. Each goes in_progress at the start of steps 5, 5.5, 6 and 6.5, and completes at the step's end; Verify carries `$VERIFICATION_STATUS` as its description. The old single `Quick Task:` task and its step-8 close are gone. The max-iterations stop is a `Plan check` AskUserQuestion (Force proceed / Abort, no recommendation). `gaps_found` is a `Gaps` AskUserQuestion (Re-run executor (Recommended) / Accept as-is), with `$VERIFICATION_STATUS = "Gaps"` recorded as before. skills/quick declares TaskCreate and TaskUpdate.
- **debug** (`skills/debug/SKILL.md`), with headers `Session`, `Ready?`, `Root cause`, `Next step`, `Checkpoint` and `Verify`:
  - Step 1 is a runtime-list `Session` question. Sessions are the options; a new issue is typed under Other.
  - New step 2f is `Ready?` (Investigate (Recommended) / Add more detail).
  - ROOT CAUSE FOUND asks `Root cause` (Fix now (Recommended) / Plan fix / Manual fix).
  - INVESTIGATION INCONCLUSIVE asks `Next step` (Continue investigating (Recommended) / Add more context / Manual investigation).
  - CHECKPOINT REACHED is asked by checkpoint type: decision is a `Checkpoint` question with the checkpoint's options, human-verify is a `Verify` question, and human-action stays prose.
  - The freeform symptom questions 2c-2e stay prose.
  - Progress tasks: `Gather symptoms` (completed on Investigate), `Investigate: {slug}` (in_progress at spawn), one `Hypothesis: {hypothesis}` per continuation round (completed when the round returns), and `Fix: {slug}` on Fix now.
  - allowed-tools gains TaskCreate and TaskUpdate.
- **verify-work** (`workflows/verify-work.md`, `diagnose-issues.md`, skills/verify-work):
  - Each `Test {n}/{total}` task goes in_progress before its box is shown. It completes with `description="{pass | issue: severity | skipped}"`.
  - `resume_from_file` makes tasks again only for `[pending]` tests.
  - `Diagnose {N} UAT issues` goes in_progress at once and completes only after the root causes are recorded.
  - A new `Plan gap closure` task completes when the plans pass the checker, or on Force proceed, Abandon, or PLANNING INCONCLUSIVE.
  - In diagnose-issues.md, each gap task goes in_progress at spawn, and an inconclusive diagnosis completes too.
  - Prompts:
    - The active-sessions table is followed by a `UAT session` runtime-list question; the Reply sentence and its "Wait for user response." are gone.
    - `$ARGUMENTS` with an existing session asks `UAT session` (Resume (Recommended) / Restart).
    - The revision loop asks `Max retries` (Force proceed / Provide guidance / Abandon), with routing for all three.
    - The two in-fence `Type "pass"` lines now read `→ Pass, or describe what's wrong`.
    - `Wait for user response (plain text, no AskUserQuestion).` carries a free-text allow marker.
  - skills/verify-work declares AskUserQuestion, TaskCreate and TaskUpdate after Task.
- `verify-objective.md` has no rows, so it needed no change.

## Inventory rows resolved

| Row | Group | Kind | Resolution |
|---|---|---|---|
| BS-001 | micro-quick-debug | ask-misuse | micro.md step 1 is a plain-text ask; re-prompt kept |
| BS-002 | micro-quick-debug | ask-misuse | quick.md step 1 is a plain-text ask; the remaining `AskUserQuestion(` openers in quick.md all have options |
| BS-003 | micro-quick-debug | choice | `Plan check` AskUserQuestion: Force proceed / Abort, no recommendation |
| BS-004 | micro-quick-debug | choice | `Gaps` AskUserQuestion: Re-run executor (Recommended) / Accept as-is; `$VERIFICATION_STATUS = "Gaps"` recorded as before |
| BS-005 | micro-quick-debug | choice | `Session` runtime-list AskUserQuestion (bullet form); new issue under Other |
| BS-006 | micro-quick-debug | choice (manual) | `Ready?` AskUserQuestion: Investigate (Recommended) / Add more detail (back to step 2) |
| BS-007 | micro-quick-debug | choice (x2) | `Root cause` and `Next step` AskUserQuestion with routing for every label |
| BS-008 | micro-quick-debug | choice (manual) | Checkpoint by type: `Checkpoint` (decision options), `Verify` (Approved (Recommended) / Issues found), human-action prose |
| BS-009 | verify-work | choice | `UAT session` runtime-list AskUserQuestion; Reply sentence deleted from the printed table |
| BS-010 | verify-work | choice (x2) | Both "Wait for user response." lines replaced by the UAT session and Max retries questions |
| BS-011 | verify-work | choice | `UAT session` AskUserQuestion: Resume (Recommended) / Restart → resume_from_file / create_uat_file |
| BS-012 | verify-work | free-text (x2) | In-fence lines reworded to `→ Pass, or describe what's wrong` (no marker inside a printed fence) |
| BS-013 | verify-work | free-text | Allow marker on the line above; the answer stays plain text |
| BS-014 | verify-work | choice | `Max retries` AskUserQuestion: Force proceed / Provide guidance / Abandon |

Progress flows resolved: `micro`, `quick`, `debug`, `verify-work`. allowed-tools pairs resolved: `quick:TaskCreate`, `quick:TaskUpdate`, `verify-work:TaskCreate`, `verify-work:TaskUpdate` (plus the micro/debug pairs and verify-work:AskUserQuestion, which the edits would otherwise have introduced).

## Deviations from Plan

### Deviations from a Conversion cell or the TRD text

**1. BS-008 human-verify follows the inventory, not the TRD's error_recovery note**
- The TRD's error_recovery says human-verify answers stay prose; the BS-008 Conversion cell says `Verify`: Approved (Recommended) / Issues found. The binding rules say to follow the inventory where they differ, so the cell was followed; "Issues found" then takes the description in plain text.

**2. BS-009, more than 4 sessions: the user types an objective, not a row number**
- The runtime-list rule says "type a number under Other". Here an objective number under Other already means "start a new session", so a row number would be ambiguous. The prose says the user may type another session's objective under Other: an active session's objective resumes it, and any other objective number starts a new one.

**3. Routing added where none existed (BS-003, BS-004, BS-014)**
- quick's `Offer: 1) Force proceed, 2) Abort` and `gaps_found` offer, and verify-work's Max retries offer, had no `If "<label>"` routing to keep.
  - Force proceed continues to the next step.
  - quick's Abort stops with the plan left in place.
  - Re-run executor returns to step 6 with the VERIFICATION gaps, then verifies again.
  - Provide guidance takes the direction in plain text and re-runs planner and checker.
  - Abandon exits.
- This is the minimal routing the option descriptions already stated.

**4. Progress completions the inventory left unspecified**
- debug's `Investigate` completes on ROOT CAUSE FOUND or on Manual investigation (the inventory names no completion point).
- verify-work's `Plan gap closure` also completes on Force proceed, Abandon and PLANNING INCONCLUSIVE, and diagnose-issues gap tasks also complete on an inconclusive return. No task is left in_progress on any exit path.

### Auto-fixed Issues

**1. [Rule 1 - Bug] planning-writes guard flagged the resume progress line**
- **Found during:** Task 2
- **Issue:** "Re-create ... for this UAT" in `resume_from_file` is a write verb within 80 characters of the `UAT` artifact token with no df-tools verb nearby, so planning-writes.repo.test.cjs flagged it.
- **Fix:** Reworded to "a resumed session starts with no tasks for these tests. Make a task again only for each test still `result: [pending]`".
- **Files modified:** plugins/devflow/devflow/workflows/verify-work.md
- **Commit:** 0aad3406

Kept as is: skills/micro still declares AskUserQuestion though micro.md no longer calls it (the inventory's Remove column is `-`; a declared-but-unused tool is not a ratchet failure).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: micro, quick, debug | `node --test builtin-sweep.repo.test.cjs micro.test.cjs` (72/72); `rg -n "AskUserQuestion\(" micro.md quick.md` shows only quick.md:259 and :394, both with options; micro-quick-debug.json gone | 0 | PASS |
| 2: verify-work progress | `node --test builtin-sweep.repo.test.cjs` (16/16, no verify-work progress or allowed-tools entry); `rg -c in_progress verify-work.md` = 4 | 0 | PASS |
| 3: verify prompts | `node --test builtin-sweep.repo.test.cjs` (16/16); verify-work.json gone; prose suite 148/148 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test builtin-sweep.repo.test.cjs` (tests 2, 5, 7, 9a fail naming the 7 prompts, 3 flows, 2 quick pairs, BS-001..005/007) | 1 | FAIL (correct) |
| Task 1 GREEN | `node --test builtin-sweep.repo.test.cjs micro.test.cjs` | 0 | PASS (correct) |
| Task 2 RED | `node --test builtin-sweep.repo.test.cjs` (test 5 names verify-work; test 7 names verify-work:TaskCreate/TaskUpdate) | 1 | FAIL (correct) |
| Task 2 GREEN | `node --test builtin-sweep.repo.test.cjs` | 0 | PASS (correct) |
| Task 3 RED | `node --test builtin-sweep.repo.test.cjs` (test 2 names the 8 prompts; 9a names BS-009..014) | 1 | FAIL (correct) |
| Task 3 GREEN | `node --test builtin-sweep.repo.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task (scoped) | `node --test builtin-audit.test.cjs builtin-sweep.repo.test.cjs micro.test.cjs` — 168 tests, 168 pass | 0 | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' adopt-skill-contract.test.cjs` — 148 tests, 148 pass | 0 | PASS |

Gate commands came from the TRD's `<validation_gates>`; nothing was discovered.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the planning-writes rewording, applied once)
- Must-haves verified: 7/7 (micro one task with in_progress/completed/deleted; quick per-step tasks; debug symptom/investigate/hypothesis/fix tasks; verify-work per-test in_progress/completed, diagnose, gap planning, resume; plain-text descriptions; every discrete choice an AskUserQuestion; both baselines deleted and the four skills declare their built-ins)
- Gate failures: None
- Files changed outside `files_modified`: none (verify-objective.md was in scope and needed no change)

## Self-Check: PASSED

- FOUND commits: fc90671e, 9ad824d4, 43a880e5, 0aad3406, 99d505ee, b529db5d
- GONE (as required): builtin-sweep-baseline/micro-quick-debug.json, builtin-sweep-baseline/verify-work.json
- FOUND modified: workflows/micro.md, workflows/quick.md, workflows/verify-work.md, workflows/diagnose-issues.md, skills/micro, skills/quick, skills/debug, skills/verify-work
