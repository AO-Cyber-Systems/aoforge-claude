---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
job: "04"
subsystem: planning-todos
tags: [todo, skill, task-list, taskcreate, todowrite, built-ins, builtin-audit]

requires:
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-01 parseTodoSubject / deriveStem grammar (Todo: prefix, [todo:<stem>] suffix, devflow_todo metadata)"
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-02 df-tools todo sync --session <id> --raw with pending_commit"
provides:
  - "/devflow:todo add puts the todo in the session task list (TaskCreate or TodoWrite) before the archive write"
  - "/devflow:todo list syncs the session into the archive first, reads TaskList, shows (in progress this session), and Work on it now is in_progress in the session"
  - "builtin-audit counts TodoWrite( as a built-in use"
  - "references/built-ins.md section 5 (Todo store) and todo-skill.repo.test.cjs pinning the flow contract"
affects: [63-03 todo-sync Stop hook, 63-06 built-in inventory, 63-07 dogfood]

tech-stack:
  added: []
  patterns:
    - "Session-first, archive-second: the session item is written before the archive so a cut-off turn is recovered by the Stop-hook sync"
    - "Skill context carries the session id (Session: ${CLAUDE_SESSION_ID}); workflows read it from there and never hold the placeholder"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs
  modified:
    - plugins/devflow/skills/todo/SKILL.md
    - plugins/devflow/devflow/workflows/add-todo.md
    - plugins/devflow/devflow/workflows/check-todos.md
    - plugins/devflow/devflow/references/built-ins.md
    - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
    - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs

key-decisions:
  - "Work on it now with task tools sets the session task in_progress and leaves the archive todo pending until the session task completes; without task tools it completes the archive todo at once, as before"
  - "The zero-todo exit moved from init_context to the end of session_view, so a todo that exists only in the session list (sync skipped) is not hidden behind 'No pending todos'"
  - "requirements mark-complete BLTN-04 is not run: 63-07 is the last TRD carrying BLTN-04, as 63-01 decided"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-10-07
tokens_input: 6889970
tokens_output: 39757
tokens_cache_read: 6753557
tokens_cache_write: 136311
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 63 TRD 04: Todo skill on the task list Summary

**`/devflow:todo` now adds to and reads from the session task list when the session has one (TaskCreate/TaskList, or TodoWrite), keeps the todo files or issues as the archive behind it, and is unchanged when the session has no task tools.**

## Progress
- [x] Task 1: Pin the contract (RED) and add TodoWrite to builtin-audit — 9b9bd093 (RED), 84e74293 (audit)
- [x] Task 2: Skill, workflows and convention (GREEN) — 77a8fa07

## Accomplishments
- **add:** a new `session_item` step sits between the draft and a new `archive_todo` step (the unchanged `todo add --from "$DRAFT"`). It calls `TaskCreate(subject="Todo: [title]", ..., metadata={devflow_todo: "[date]-[slug]"})`, or the `TodoWrite` form with content `Todo: [title] [todo:[date]-[slug]]`, and says to skip the step with neither tool. Both forms parse with `parseTodoSubject` from 63-01 (checked by hand: title and stem come back).
- **list:** `init_context` runs `todo sync --session <session id> --raw` first (skipped when the Session line is empty or starts with `$`) and commits exactly `pending_commit` through `df-tools commit`. A new `session_view` step reads `TaskList()` (or the TodoWrite list), `list_todos` shows `(in progress this session)` and a `This session, not archived yet:` tail, and the success criteria gain the sync and the status.
- **Work on it now:** `TaskUpdate(taskId=..., status="in_progress")` (creating the task first when the list lacks it), TodoWrite form, archive todo stays pending and the Stop hook or the next list carries the completion; with neither tool it is `todo complete` and update_state/git_commit as today. The other three actions and every AskUserQuestion routing are unchanged.
- **Skill:** `allowed-tools` gains TaskCreate, TaskUpdate, TaskList, TodoWrite; `<objective>` describes the session store and the archive; built-ins.md joins `<execution_context>`; `<context>` carries `Session: ${CLAUDE_SESSION_ID}`.
- **Convention and audit:** `references/built-ins.md` section 5 (83 lines in total, under the 140 limit) states subject, identity, lifecycle, merge direction, who writes and the no-task-tools case. `builtin-audit.cjs` lists `TodoWrite` in `BUILTINS`.
- **Contract test:** `todo-skill.repo.test.cjs` (6 tests) pins the skill declarations, the placeholder rule, the add/list ordering and forms, the single-owner rule for `Todo: ` subjects and the convention section; plus `builtin-audit.test.cjs` 14d.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Pin the contract (RED) and the audit change | RED: `node --test .../todo-skill.repo.test.cjs` fails tests 1, 2, 3, 4, 6 and `.../builtin-audit.test.cjs` fails 14d; after the audit edit `node --test .../builtin-audit.test.cjs .../builtin-sweep.repo.test.cjs` passes (114/114) | 0 | PASS |
| 2: Skill, workflows and convention (GREEN) | `node --test todo-skill.repo.test.cjs builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs builtin-audit.test.cjs` all green (todo-skill 6/6); `wc -l built-ins.md` = 83; `rg 'subject="Todo: '` matches only add-todo.md and check-todos.md | 0 | PASS |

## Task Commits

1. **Task 1 RED: failing contract and TodoWrite audit tests** - `9b9bd093` (test)
2. **Task 1 GREEN (audit half): TodoWrite in BUILTINS** - `84e74293` (feat)
3. **Task 2 GREEN: skill, workflows, convention** - `77a8fa07` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs` | 0 | PASS (6/6) |
| test (ratchets) | `node --test todo-skill.repo.test.cjs builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs builtin-audit.test.cjs` | 0 | PASS |
| test (full) | `npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/63-04 test` | 1 | 10785 tests, 10724 pass, 50 skipped, 11 fail (see below) |

The 11 failures of the full run, none caused by this TRD's code:
- `roadmap-reconcile.test.cjs` E2E1 (self-test): the ROADMAP line for 63-04 was unchecked while its SUMMARY existed. Resolved by `roadmap update-job-progress 63` in the state step; the same test failed identically for 63-01 and 63-02 until their lines were ticked. Re-run result after the roadmap update is recorded under Post-TRD Verification.
- 10 in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` (daemon start/stop, handoff pipeline, daemon reaping): environmental. This worktree has no node_modules, so node-pty cannot load (the dispatch named this). Same set as 63-01 and 63-02; none touches a file of this TRD.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (contract) | `node --test plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs` | 1 | FAIL (correct: tests 1, 2, 3, 4, 6 fail on the old prose; test 5 passes at RED, see Deviations) |
| RED (audit) | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` | 1 | FAIL (correct: 14d, `TodoWrite(` not yet counted) |
| GREEN | `node --test todo-skill.repo.test.cjs builtin-audit.test.cjs builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 | PASS |

No REFACTOR commit: nothing to clean once green.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (add puts the session item first in both forms; list syncs, reads the session list and shows status; Work on it now is in_progress and the archive todo stays pending; with no task tools add and list are archive-only and Work on it now completes at once; skill declares the four tools, audit counts `TodoWrite(`, sweep/planning-writes/doc-refs stay green; built-ins.md section 5 exists and no progress task uses `Todo: `)
- **Gate failures:** none from this TRD (see Validation Gate Results)

## Files Created/Modified
- `plugins/devflow/skills/todo/SKILL.md` - four tools declared, session store paragraph, built-ins.md reference, Session line in `<context>`
- `plugins/devflow/devflow/workflows/add-todo.md` - `session_item` and `archive_todo` steps, one success criterion
- `plugins/devflow/devflow/workflows/check-todos.md` - sync in `init_context`, `session_view`, in-session status, in-session Work on it now, two success criteria
- `plugins/devflow/devflow/references/built-ins.md` - `## 5. Todo store`
- `plugins/devflow/devflow/bin/lib/builtin-audit.cjs` - `TodoWrite` in `BUILTINS`, header comment
- `plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` - test 14d
- `plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs` - the contract test (new)

## Decisions Made
See `key-decisions`. For 63-03 and 63-07: the prose writes exactly the three forms the replay reads (`Todo: <title>` subject, `devflow_todo` metadata, `[todo:<stem>]` suffix), the stem is `<date>-<slug>` from the init context `date` and `generate-slug`, and "Work on it now" never completes the archive todo itself when the session has task tools: the Stop hook (63-03) is what closes the loop, so 63-07's dogfood should exercise add, Work on it now, complete, end of turn, then list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The "Work on it now" option description said "mark it complete"**
- **Found during:** Task 2 (editing execute_action)
- **Issue:** both AskUserQuestion option descriptions read `mark it complete, start working`, which is false once the todo stays pending until its session task completes.
- **Fix:** the description is `start working on it` in both calls (true with and without task tools). The label, the option order and every routing are unchanged.
- **Files modified:** `plugins/devflow/devflow/workflows/check-todos.md`
- **Verification:** builtin-sweep tests 3 and 8 pass; no test or document quotes the old description.
- **Commit:** 77a8fa07

**2. [Rule 2 - Missing critical functionality] The zero-todo exit could hide a session-only todo**
- **Found during:** Task 2 (placing session_view after init)
- **Issue:** `init_context` exited on `todo_count` 0 before the session list was read, so with the sync skipped (empty Session line) a todo that exists only in the session list would show "No pending todos".
- **Fix:** the exit block moved unchanged to the end of `session_view` and reads "If `todo_count` is 0 and no `Todo: ` item was read". With no task tools it behaves as before.
- **Files modified:** `plugins/devflow/devflow/workflows/check-todos.md`
- **Commit:** 77a8fa07

**3. [Plan wording] Two RED tests passed at RED**
- Test 5 (no other flow uses a `Todo: ` subject) is a guard that is true on the old tree, and test 1's `skillCoverage` half (no missing built-in) holds until a workflow calls `TodoWrite(`; only its declared-tools half failed. The TRD said tests 1-6 fail on the current prose; the contract is still pinned, the failing set is 1, 2, 3, 4, 6.

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2), 1 plan-wording note. **Impact on plan:** none on scope.

## Issues Encountered
- `Monitor` was not used; the full-suite wait used a foreground until-loop on the background task's output file.
- `built-ins.md` section 5 was appended with a shell append rather than an Edit (a lapse against the context discipline; the file content is what the TRD asked for).

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None - no external service configuration required. A session sees task tools only on the models the host enables them for, or with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; otherwise the flows are archive-only by design.

## Next Objective Readiness
63-03's hook and the skill agree on the three forms. 63-06 should add `TodoWrite` to its built-in inventory (the audit now counts it, and the todo skill is the only user). 63-07 owns the end-to-end dogfood and the BLTN-04 tick.

## Self-Check: PASSED

- Created files present: `todo-skill.repo.test.cjs` (6 tests passing); modified files all present in the commits.
- Commits found: `9b9bd093`, `84e74293`, `77a8fa07`.
- `rg 'subject="Todo: '` over skills and workflows matches only `add-todo.md` and `check-todos.md`; neither workflow contains the literal session placeholder.

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-07*
