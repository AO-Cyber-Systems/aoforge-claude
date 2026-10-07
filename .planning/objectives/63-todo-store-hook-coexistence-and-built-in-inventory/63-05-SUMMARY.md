---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "05"
subsystem: hooks
tags: [hooks, coexistence, claude-code, node-test, fixtures, bltn-05]

requires: []
provides:
  - "hook-runner.js: a cited model of Claude Code's documented hook composition (classifyOutput, composeEvent, runParallel)"
  - "coexistence-fixtures.js: hermetic DevFlow world, per-event payload builders, nine user-hook stubs"
  - "hook-coexistence.test.js: the model's own tests, then a matrix over all 20 registered script/event pairs"
  - "five hooks that exit 0 and print nothing on a non-object payload"
affects: [63-03 todo-sync Stop hook (must add a RUNS entry), 63-07 docs and full-suite run]

tech-stack:
  added: []
  patterns:
    - "Model-then-matrix: encode the documented composition rules once, with the doc sentence beside each rule, then run every real hook through it"
    - "A registration with no table entry fails the suite (hooks.json is read, as planning-writes.audit.test.js does)"
    - "Non-vacuous expectations: each RUNS entry declares the outcome its solo run must reach (deny, ask, block, context, output, silent)"

key-files:
  created:
    - plugins/devflow/hooks/__fixtures__/hook-runner.js
    - plugins/devflow/hooks/__fixtures__/coexistence-fixtures.js
    - plugins/devflow/hooks/hook-coexistence.test.js
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/changelog-on-tag.js
    - plugins/devflow/hooks/gate-interactive.js
    - plugins/devflow/hooks/gate-edits.js
    - plugins/devflow/hooks/guard-no-progress.js

key-decisions:
  - "The model follows the hooks reference as fetched on 2026-10-06 (v2.1.292), including its exit-2 per-event table: exit 2 blocks on PreToolUse, UserPromptSubmit, UserPromptExpansion, Stop and SubagentStop, and is a non-blocking error on SessionStart and PostToolUse"
  - "user-slow runs with a 700 ms timeout (it sleeps 1500 ms), so the documented 'cancelled, output discarded' rule is exercised without slowing the suite"
  - "gate-skill-requires runs with an empty PATH so the refusal branch is reached on any machine, whether or not gh is installed"
  - "verify-commits.js is left alone: its tests pin a hookSpecificOutput.decision shape that the documented SubagentStop contract does not read (see Findings)"

patterns-established:
  - "RUNS entry fields: expect, world, env, normalize, sharedHome/warmup, inProcess, writesState, readsStdin"
  - "Overlap-in-time (not a wall-clock bound) to prove handlers ran concurrently, so a loaded machine cannot flake it"

requirements-completed: [BLTN-05]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 17min
completed: 2026-10-07
---

# Objective 63 TRD 05: Hook coexistence suite Summary

**A cited model of Claude Code's hook composition, and a 205-test matrix that runs all 20 registered DevFlow script/event pairs beside nine user-hook behaviours; it found and fixed five hooks that exit 1 on a `null` payload.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-06T23:56:46Z
- **Completed:** 2026-10-07T00:14Z
- **Tasks:** 3/3
- **Files modified:** 8 (3 created, 5 modified) plus this SUMMARY and ROADMAP.md

## Accomplishments

- `hook-runner.js` encodes the documented rules, one doc sentence per rule: stdout parsing (JSON, plain text, the multi-line rule, parse failure), exit 2 blocking (not liftable by JSON, event-dependent), other exit codes (valid JSON decides alone, else a non-blocking error), timeouts (output discarded), PreToolUse precedence `deny > defer > ask > allow`, Stop `decision: block` and `continue: false`, and `additionalContext` / `systemMessage` / plain-text context kept per event. `runParallel` spawns every handler at once on one stdin payload, tolerates EPIPE and bounds each handler with SIGKILL.
- The matrix runs every `{script, event}` in `hooks.json` solo and beside each of nine stubs (context, allow, deny, plain text, exit 1, exit 2, garbage JSON, slow, never reads stdin). DevFlow's exit code and normalized stdout are identical solo and paired; the composed result is exactly the sum of both sides in handler order; a DevFlow deny, ask or block is never lifted by a user allow, and a user deny or block is never lifted by DevFlow.
- Every DevFlow run satisfies the output contract: exit 0; empty stdout or one JSON object with only `systemMessage`, `decision`, `reason`, `hookSpecificOutput`, `suppressOutput`; `hookEventName` equal to the event; no string at 10,000 characters; plain text only on SessionStart, UserPromptSubmit and UserPromptExpansion.
- Degraded input (empty, malformed JSON, `null`, `[]`, `"str"`, a nonexistent cwd) is run against every registration, and duplicate copies run at once in one world with every JSON state file checked afterwards (the hook-marker counters, the progress-guard session file, `.devflow-notices.json`).
- Test 13 failed RED on exactly the five scripts the TRD named, each only on `null`; one guard line in each fixed them.
- Sensitivity: a registration added to a copy of `hooks.json` without a RUNS entry is reported (automated as a test), and adding `todo-sync.js` to the real `hooks.json` by hand made test 9 fail naming `todo-sync.js@Stop`; the file was restored.

## Task Commits

1. Task 1: coexistence fixtures — `6f46edd3`
2. Task 2 RED: failing model tests — `6fb025ed`
3. Task 2 GREEN: the model and runner — `6a5b43c3`
4. Task 3 RED: the matrix, failing on five null-payload crashes — `5fba64c5`
5. Task 3 GREEN: five guards and the finished suite — `2195b22b`

## Progress
- [x] Task 1: Coexistence fixtures (world, payloads, user-hook stubs) — 6f46edd3
- [x] Task 2: The composition model, hook-runner.js (RED then GREEN) — RED 6fb025ed, GREEN 6a5b43c3
- [x] Task 3: The coexistence matrix over every registered hook, and the five guards — RED 5fba64c5, GREEN 2195b22b

## Suite numbers (for the objective's record)

- Registrations covered: 20 script/event pairs over 18 scripts (gate-skill-requires and gh-flush are registered on two events each).
- User-hook stubs: 9. Tests: 205 (8 model, 3 table, 60 for tests 10-12, 114 degraded-input, 20 duplicate-copy).
- Hook executions: about 535 (200 DevFlow matrix runs, 180 stub runs, 114 degraded, 40 duplicate, 1 warm-up).
- Wall time: 6-7 s alone, 11-14 s while a sibling executor was running (limit 60 s). Stable over four consecutive runs.
- Hooks changed: route-intent.js, changelog-on-tag.js, gate-interactive.js, gate-edits.js, guard-no-progress.js (the same one-line non-object guard in each, right after the stdin `JSON.parse`). No other hook failed tests 10-14.

## Findings

**verify-commits.js nests `decision` and `reason` inside `hookSpecificOutput`** (`{"hookSpecificOutput":{"hookEventName":"SubagentStop","decision":"block","reason":...}}`). The hooks reference defines SubagentStop decision control as top-level `decision: "block"` with `reason` (the same format as Stop), plus `hookSpecificOutput.additionalContext`. Under the documented model the hook's retry nudge composes to nothing, so it is probably inert in Claude Code today. Not changed here: the TRD limits hook fixes to the null guard, and `verify-commits.test.js` pins the nested shape (lines 176-179, 219, 287, 318, 349). Its RUNS entry uses `expect: 'output'` and carries a comment. Suggested follow-up: confirm against a live SubagentStop, then move the fields to the top level and update its tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Five hooks exited 1 on a `null` payload**
- **Found during:** Task 3 RED (test 13), as the TRD predicted
- **Issue:** `JSON.parse('null')` returns `null`; `input.prompt` / `input.tool_name` then threw a TypeError (exit 1, a `hook error` notice in the transcript)
- **Fix:** `if (!input || typeof input !== 'object' || Array.isArray(input)) return;` after the parse in route-intent.js, changelog-on-tag.js, gate-interactive.js, gate-edits.js, guard-no-progress.js
- **Commit:** 2195b22b

### Other deviations from the TRD text (none changes behaviour of a shipped hook)

- **Test 8 (concurrency):** the TRD's "two 300 ms sleepers finish in well under 600 ms" is a wall-clock bound that a loaded machine can miss, and `npm test` runs many files at once. The test now has each child print its start and end timestamps and asserts the two intervals overlap (400 ms sleepers). It still fails if handlers run one after the other.
- **Fixture additions:** `makeWorld` gained `changelog` (so changelog-on-tag reaches its deny) and `stuckGuard` (four prior identical calls, so guard-no-progress reaches its `ask`). Without them those two hooks stayed silent and the matrix would have proved nothing about them. Each RUNS entry also has `expect` so a payload that stops reaching its branch fails the suite.
- **`env` override per RUNS entry:** gate-skill-requires runs with an empty PATH (see key-decisions).
- **State-file check widened:** the retry markers under `hook-markers/` are bare counters with no extension, so every file there must parse as JSON (a number does; an empty or torn write does not). `writesState: true` entries assert that a state file exists, so the check is not vacuous.
- **Test 9 sensitivity automated:** besides the by-hand check, a test adds a registration to a copy of `hooks.json` and asserts it is reported.
- **Exit-2 table:** the TRD's research context gave the stdout and exit-code rules but not the per-event exit-2 table. I read it from the live doc (markdown form of the hooks reference) and encoded the rows for the events DevFlow registers on.

## Auth gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "...makeWorld(); console.log(Object.keys(f.writeUserHooks(w.base)).length)..."` printed `9` | 0 | PASS |
| 2: model (RED) | `node --test --test-name-pattern "composition model" plugins/devflow/hooks/hook-coexistence.test.js` (MODULE_NOT_FOUND for hook-runner.js) | 1 | PASS (RED, correct) |
| 2: model (GREEN) | same command, 8/8 | 0 | PASS |
| 3: matrix (RED) | `node --test plugins/devflow/hooks/hook-coexistence.test.js`, 205 tests, 5 fail: test 13 `null` on exactly the five scripts | 1 | PASS (RED, correct) |
| 3: matrix (GREEN) | same command, 205/205 in 7.0 s | 0 | PASS |
| 3: hook regressions | `node --test route-intent changelog-on-tag gate-interactive gate-edits guard-no-progress planning-writes.audit` test files, 399/399 | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 0 | PASS |
| test (full) | `npm test` (10,691 tests, 10,631 pass, 10 fail, 109 s) | 1 | FAIL, none caused by this TRD (below) |

The 10 `npm test` failures, none in a file this TRD touched:

- **9 devflow-watch tests** (`devflow-watch.test.cjs`, `handoff-pipeline` end to end, leak checks). The daemon logs `node-pty not installed ... Cannot find module 'node-pty'` because this worktree has no `node_modules`. The same file passes 22/22 in the main checkout at the same base commit (26e4e57f).
- **1 reconcile self-test** (`roadmap-reconcile.test.cjs` E2E1) flagged `trd_summary_exists` for 63-05: this TRD's own checkpoint SUMMARY existed while its ROADMAP row was still `[ ]`. After `roadmap update-job-progress 63` ticked the row it passes (1/1).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test --test-name-pattern "composition model" plugins/devflow/hooks/hook-coexistence.test.js` | 1 | FAIL (correct) |
| GREEN (task 2) | same | 0 | PASS (correct) |
| RED (task 3) | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 1 | FAIL on the five named scripts only (correct) |
| GREEN (task 3) | same | 0 | PASS (correct) |

Mutation checks: with the gate-interactive `normalize` disabled, tests 10 and 11 fail (the handoff id is minted per run), so the independence comparison really compares output. Adding a registration to the real `hooks.json` fails test 9 by name.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (independence beside nine stubs; documented composition keeps both sides and never lifts a decision; output contract on every DevFlow run; degraded input including the five fixed scripts; duplicate copies; a registration with no table entry fails the suite)
- Gate failures: the 10 unrelated `npm test` failures listed above

## For the next TRD

63-03 adds `hooks/todo-sync.js` to `hooks.json`. Until it adds a `'todo-sync.js@Stop'` entry to `RUNS` in `hook-coexistence.test.js` (payload `fx.stop()`, `expect: 'silent'` if the hook stays quiet), test 9 and the whole matrix fail by design.

## Discovered commands

None.

## Self-Check: PASSED

Created files exist (`hook-runner.js`, `coexistence-fixtures.js`, `hook-coexistence.test.js`); all five commits (`6f46edd3`, `6fb025ed`, `6a5b43c3`, `5fba64c5`, `2195b22b`) exist in `git log`.
