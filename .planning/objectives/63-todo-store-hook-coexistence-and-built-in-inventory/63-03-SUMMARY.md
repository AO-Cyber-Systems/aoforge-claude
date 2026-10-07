---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
job: "03"
subsystem: hooks
tags: [hooks, stop-hook, todo, sync, idempotent, store-mode, bltn-04, bltn-05]

requires:
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-02 syncTodos library (in-process merge of replayed session todos into the archive)"
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-05 coexistence matrix (a registration with no RUNS entry fails it)"
provides:
  - "todo-sync.js: Stop hook, exports run(payload, {env, pluginRoot}) -> {systemMessage} | null"
  - "todo-sync.js registered on Stop (after gh-flush), with its CLAUDE.md bullet, HOOK_DOCS row, audit RUNS entry and coexistence RUNS entry"
affects: [63-04 todo skill on the task list, 63-07 dogfood docs and full-suite run]

tech-stack:
  added: []
  patterns:
    - "A Stop hook that calls the bundled library in-process (no df-tools spawn), prefilters the transcript text before loading it, and speaks through one systemMessage or not at all"
    - "Only a run that wrote something reports the uncommitted files, so an idempotent rerun is silent even though the files are still uncommitted"

key-files:
  created:
    - plugins/devflow/hooks/todo-sync.js
    - plugins/devflow/hooks/todo-sync.test.js
  modified:
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/planning-writes.audit.test.js
    - plugins/devflow/hooks/hook-coexistence.test.js
    - CLAUDE.md
    - scripts/gen-docs-data.cjs

key-decisions:
  - "The 'not committed yet' line is emitted only when this run added or completed something. The TRD pseudocode gated it on pending_commit alone, which would print on the second Stop (the file is still uncommitted) and break the must-have that a rerun prints nothing"
  - "A throw from syncTodos itself becomes the one failure line (the library did load); only a missing or unloadable bundled library is silence"
  - "The DevFlow-project check (resolveMainRoot, whose module has no dependencies) runs before the transcript is read, so a non-DevFlow Stop never reads the transcript"

requirements-completed: [BLTN-04, BLTN-05]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-07
---

# Objective 63 TRD 03: The todo-sync Stop hook Summary

**A Stop hook merges the session's `/devflow:todo` items into the archive in-process through the 63-02 library, reports once, stays silent on a rerun, never blocks, and is registered with its inventory, audit and coexistence entries.**

## Progress
- [x] Task 1: todo-sync.js (RED then GREEN) — 8074ccab (RED), f5ba1678 (GREEN)
- [x] Task 2: Register the hook and add its inventory, audit and coexistence entries — 9fdd59e2

## Accomplishments
- `todo-sync.js` follows the pseudocode: skip env, non-object stdin, non-Stop event, missing `transcript_path`, no `.planning/` above the cwd, unreadable transcript and the cheap prefilter (a task call AND `Todo: ` or `devflow_todo`) all exit 0 silently; only then is `todo-sync.cjs` loaded and `syncTodos(cwd, {transcripts, sessionId, noFlush: true})` called.
- Output is one `{systemMessage}` of `DevFlow: todo sync: ...` lines: `archived N todo(s) from this session`, `completed N todo(s)`, `not committed yet: <paths> (/devflow:todo list commits them)` (local mode), `queued for GitHub; gh-flush sends them` (store mode), or `todo sync failed: <first warning>; nothing is lost, the session task list still holds them`. No `decision`, `continue` or `stopReason` key, ever.
- A second Stop over the same transcript prints nothing and leaves the file bytes and mtime alone (test 2). Store mode queues the `upsert-issue` for `todo-<stem>` and the gh shim records zero calls (test 9). A TodoWrite todo is archived (test 12). A failed write (read-only `.planning/`) is the single failure line with exit 0 (test 11).
- Registered after gh-flush in the one Stop group, with the CLAUDE.md bullet, the `HOOK_DOCS` row, a planning-writes audit entry (with a new `expectStdout` check so the audit cannot pass on a transcript the hook never read) and a `todo-sync.js@Stop` coexistence entry (`expect: 'context'`, no `normalize` needed: the message holds only project-relative paths).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: todo-sync.js (RED then GREEN) | `node --test plugins/devflow/hooks/todo-sync.test.js` (13/13); `rg -n "decision\|continue:\|stopReason\|spawn\|exec(File)?Sync" plugins/devflow/hooks/todo-sync.js` prints only the header comment line | 0 | PASS |
| 2: register and inventory entries | `node --test hook-inventory.test.cjs planning-writes.audit.test.js hook-coexistence.test.js doctor-checks/11-12-install.test.cjs todo-sync.test.js` (310/310); `rg -n "todo-sync.js" hooks.json CLAUDE.md scripts/gen-docs-data.cjs` matches in each | 0 | PASS |

## Task Commits

1. **Task 1 RED: failing hook tests** - `8074ccab` (test)
2. **Task 1 GREEN: todo-sync.js** - `f5ba1678` (feat)
3. **Task 2: registration, inventory, audit and coexistence entries** - `9fdd59e2` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/hooks/todo-sync.test.js` | 0 | PASS (13/13) |
| test (verification set) | `node --test plugins/devflow/hooks/todo-sync.test.js plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs` | 0 | PASS (310/310) |
| test (full) | `npm test` | 1 | 10803 tests, 10743 pass, 50 skipped, 10 fail (none caused by this TRD, below) |

The 10 failures of the full run:
- **9 devflow-watch tests** (`devflow-watch` multi-project CLI, start/stop, LK-1/LK-2, `handoff pipeline`, `route-results` idempotency and multi-record, disallowed-command): this worktree has no `node_modules`, so the daemon cannot load `node-pty`. The same environmental failure 63-05 recorded; none of these files is touched here.
- **1 reconcile self-test** (`roadmap-reconcile.test.cjs` E2E1): this TRD's checkpoint SUMMARY exists while its ROADMAP line is unticked. Resolved by `roadmap update-job-progress 63` in the state step; the same thing happened for 63-01, 63-02 and 63-05.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/todo-sync.test.js` | 1 | FAIL (correct: all 13 fail, `Cannot find module .../todo-sync.js`) |
| GREEN | `node --test plugins/devflow/hooks/todo-sync.test.js` | 0 | PASS (13/13; one expectation, the created-at stamp, corrected first: see Deviations) |

No REFACTOR commit: nothing to clean once green.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (merge at every Stop without user action; rerun and no-todo transcript are silent and write nothing; never blocks, exit 0 everywhere, zero gh calls, no state, only todo files written through the verbs; one systemMessage naming what changed, none when nothing did; escape, non-project, bad stdin, unreadable transcript and missing library are silent; registered, in the CLAUDE.md inventory, the audit and the coexistence matrix)
- **Gate failures:** the 10 unrelated `npm test` failures above

## Files Created/Modified
- `plugins/devflow/hooks/todo-sync.js` - the Stop hook and its `run()` export
- `plugins/devflow/hooks/todo-sync.test.js` - 13 tests: spawned hook, temp projects, hermetic env, gh shim
- `plugins/devflow/hooks/hooks.json` - `todo-sync.js` appended to the Stop group
- `plugins/devflow/hooks/planning-writes.audit.test.js` - `todo-sync.js` RUNS entry and the `expectStdout` check
- `plugins/devflow/hooks/hook-coexistence.test.js` - `todo-sync.js@Stop` RUNS entry and a transcript helper
- `CLAUDE.md` - the hook bullet under Observability
- `scripts/gen-docs-data.cjs` - the `HOOK_DOCS` row

## Decisions Made
See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The TRD's pseudocode would print on a rerun**
- **Found during:** Task 1 (writing test 2)
- **Issue:** the pseudocode emits the "not committed yet" line whenever `pending_commit` is non-empty, but 63-02's `pending_commit` lists every changed todo file git reports, so after a first Stop the file is still uncommitted and the second Stop would print again, against the must-have that a rerun "prints nothing".
- **Fix:** the line is emitted only when this run added or completed something (`added.length + completed.length > 0`), the same condition the TRD gives for the store-mode line.
- **Files modified:** `plugins/devflow/hooks/todo-sync.js`
- **Commit:** f5ba1678

**2. [Rule 1 - Bug] Test expectation: the created-at stamp**
- **Found during:** Task 1 (GREEN run)
- **Issue:** my test 1 expected the file's `created:` to be the TaskCreate call's timestamp; the replay stamps a todo with its creation result's timestamp, which the 63-01 builders place 50 ms later.
- **Fix:** the test expects `2026-10-06T12:00:00.050Z`, with a comment. No hook change.
- **Files modified:** `plugins/devflow/hooks/todo-sync.test.js`
- **Commit:** f5ba1678

### Other deviations from the TRD text

- **`site/data/devflow.json` not kept.** `node scripts/gen-docs-data.cjs` ran clean and rewrote the tracked `site/data/devflow.json`, but 128 changed lines, almost all of them unrelated staleness (hook, reference and command counts, skill tool lists) the earlier objectives never regenerated. It is not in this TRD's file list and 63-04 runs in parallel, so I restored it with `git checkout` rather than ship a mixed diff. The `todo-sync.js` row is in `HOOK_DOCS`, so the next regeneration (63-07's docs pass) picks it up.
- **Added an `expectStdout` option** to the audit test's run loop (3 lines) so the audit entry proves the hook reached its merge. The TRD said no `expectChanged`, which is still true: the entry changes no dotfile.
- **Test 11 and 12 differ from the TRD list.** The TRD's test 11 ("no decision, continue or stopReason on every output") is enforced inside the shared `messageOf` helper that every output-producing test goes through; the number 11 in the file is the failure-line test, and 12 is the TodoWrite case (the TRD's registration test 12 is covered by the three suites in Task 2).

## Issues Encountered
- The gen-docs-data run had unrelated drift (see above); `HOOK_DOCS` has no `gh-flush.js` row either, a pre-existing gap left alone.
- `Monitor` is disabled in this session; the full-suite wait used a foreground until-loop on the log.

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
63-04's list flow can rely on the Stop hook having archived the session's todos (uncommitted, in local mode) and commit exactly `pending_commit` from `df-tools todo sync --session <id> --raw`. 63-07 should regenerate `site/data/devflow.json` and run the full suite. Open edge: two Stop hooks over one world at the same instant can both plan an add; the loser's `todoAdd` fails and prints the failure line (exit 0, nothing lost; covered by the coexistence two-copies test only for output shape).

## Self-Check: PASSED

- Created files present: `plugins/devflow/hooks/todo-sync.js`, `plugins/devflow/hooks/todo-sync.test.js`.
- Commits found in `git log`: `8074ccab`, `f5ba1678`, `9fdd59e2`.
- `rg -n "todo-sync.js"` matches in `hooks.json`, `CLAUDE.md` and `scripts/gen-docs-data.cjs`.

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-07*
