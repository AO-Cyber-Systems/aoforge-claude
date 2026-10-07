---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
job: "01"
subsystem: planning-todos
tags: [todo, transcript, replay, taskcreate, todowrite, stem, cassette]

requires:
  - objective: 53-worktree-and-health-hygiene
    provides: the `todo add` naming (`<UTC date>-<slug>`) that deriveStem reproduces
provides:
  - "todo-session.cjs: pure replayTranscript(text) -> { items, stats } over both task-list families (TaskCreate/TaskUpdate and TodoWrite)"
  - "parseTodoSubject / formatTodoSubject / deriveStem / TODO_PREFIX / STEM_RE: the `Todo: <title> [todo:<stem>]` grammar and the stable stem"
  - "todo-transcript-fixtures.cjs: hand-built record builders in the observed host shape"
  - "three recorded cassettes from Claude Code 2.1.292"
affects: [63-02 todo-sync merge and CLI, 63-03 Stop hook, 63-04 todo skill on the task list, 63-07 dogfood]

tech-stack:
  added: []
  patterns:
    - "Replay (tool_use, tool_result) pairs; apply a call only when its result is present and not an error"
    - "Identity is the stem, never the host task id: metadata devflow_todo, then the [todo:<stem>] suffix, then <UTC date of the record>-<slug>"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/todo-session.cjs
    - plugins/devflow/devflow/bin/lib/todo-session.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/task-tools.cassette.jsonl
    - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/todowrite.cassette.jsonl
    - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/todowrite-clear.cassette.jsonl
  modified: []

key-decisions:
  - "A completed TodoWrite item that drops out of the next snapshot stays completed; only unfinished items become deleted (live probe: the host forgets an all-completed list, so a cleared list is not a deletion)"
  - "A TaskUpdate whose structured result says success:false is not applied (counted in errors_skipped)"
  - "TaskCreate falls back to the observed `Task #<id> created successfully` text only when the structured result is absent"
  - "A todo with no explicit stem and no usable timestamp is skipped and counted (no_stem_skipped): a stem derived from now would break idempotency"

requirements-completed: [BLTN-04]

verification:
  gates_defined: 2
  gates_passed: 1           # scoped test passes; the full `npm test` has 10 environmental daemon/handoff failures unrelated to this TRD
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 11min
completed: 2026-10-06
tokens_input: 13079905
tokens_output: 85957
tokens_cache_read: 12848404
tokens_cache_write: 231329
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 63 TRD 01: Session todo replay Summary

**A pure transcript replay that turns TaskCreate/TaskUpdate and TodoWrite calls into stable-stem todo items, with its record shapes checked against three live Claude Code 2.1.292 recordings.**

## Progress
- [x] Task 1: Record the host contract and build the transcript fixture builders — 59cb2f10
- [x] Task 2: replayTranscript and the todo subject grammar (RED then GREEN) — bb1466d5 (RED), d83fc48d (GREEN)

## Host contract (observed, Claude Code 2.1.292, model claude-sonnet-5-5)

**Live capture succeeded for both families, one run each, no retries.** Real HOME, no `--plugin-dir`, run from an empty
scratch directory (the installed plugin's five SessionStart hooks ran and all exited 0). Each run was driven by `claude -p ... --output-format
stream-json --verbose`; the cassettes were then cut from the session's on-disk transcript
(`~/.claude/projects/<project-key>/<session_id>.jsonl`), not from the stream, because the Stop hook reads the file.

| Run | Env | `init.tools` carried | Session id (transcript file) |
|---|---|---|---|
| task tools | `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` | `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop` (no `TodoWrite`) | `344a57ac-8990-4258-affb-cd9d9ee7c3f9` |
| TodoWrite | `CLAUDE_CODE_ENABLE_TASKS=0` + `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` | `TodoWrite`, `TaskStop` (none of the four Task tools) | `504bf3ac-c20d-4a68-9e4f-961d41b08d95` |
| TodoWrite, finished then cleared | same | same | `e2a7b2a3-7a01-4681-93fc-a452feab7f3f` |

Shapes seen on disk (each content block is its own record; an assistant `tool_use` record is followed by a user
`tool_result` record, tens of milliseconds later; two parallel TaskCreate calls were two assistant records, then two user records):

- **TaskCreate input** `{subject, description, metadata?, activeForm?}`; the model did not send `activeForm` when not asked. `metadata` passes through as an object.
- **TaskCreate result**: user record `toolUseResult: {"task": {"id": "1", "subject": "<subject>"}}` (id is a **string**), tool_result text `Task #1 created successfully: <subject>`. Exactly the documented `TaskCreateOutput`.
- **TaskUpdate input** `{taskId: "1", status: "completed"}`; result `toolUseResult: {"success": true, "taskId": "1", "updatedFields": ["status"], "statusChange": {"from": "pending", "to": "completed"}}`, text `Updated task #1 status`. No `error` key on success.
- **TaskList result** `toolUseResult: {"tasks": [{id, subject, status, blockedBy}]}` (ignored by replay; useful to a later cross-check).
- **TodoWrite result** `toolUseResult: {"oldTodos": [...], "newTodos": [...]}`, text `Todos have been modified successfully. ...`. `newTodos` is the list as written.
- **Transcript key spelling**: `toolUseResult` (camelCase) on disk; the stream-json output calls it `tool_use_result`. Replay reads both.
- **Disabled-tool shape** (pre-existing transcripts, 2.1.283 to 2.1.292, e.g. this session's own planning run): `tool_result.is_error: true`, text `<tool_use_error>Error: No such tool available: TaskCreate. TaskCreate is disabled for this session, in subagents as well as here.</tool_use_error>`, `toolUseResult` is a bare string. Matches the fixture builder `taskCreateDisabled`.

Evidence that no other shape exists yet: `rg -l '"name":"TodoWrite"' ~/.claude/projects` finds no pre-existing transcript, and
every pre-existing `TaskCreate` call with a result in `~/.claude/projects` (four transcripts, one of them a subagent
transcript: `db5a1b3b-...`, this session's own `612140cb-...`, a `videoArchive` session and subagent `a907abc7...`) is the
disabled-tool error (Claude Code 2.1.283 to 2.1.292). The
successful shapes above come only from the three probe sessions.

**Differences from the documented types:** none for TaskCreate/TaskUpdate/TodoWrite.

**Two facts the plan did not have, found by the probes:**
1. TodoWrite `oldTodos` forgets an all-completed list (`oldTodos: []` on the call after a single item was completed), while `newTodos` still carries the completed item as written. Replay therefore never reads `oldTodos`.
2. A model that finishes a TodoWrite list and then writes `todos: []` is clearing, not deleting, so replay keeps `completed` items completed when they drop out of a snapshot (key decision 1). Recorded as `todowrite-clear.cassette.jsonl`.

The text fallback for TaskCreate ids exists only for the exact observed form `Task #<id> created successfully` and only
when `toolUseResult` is absent; the structured result is always preferred.

Cassettes (sanitized: `sessionId` -> `cassette-session`, scratch path -> `/tmp/todo-contract`, `$HOME` -> `/home/user`; no
`/Users/` string remains; only task-call records kept; behaviour never edited):
`task-tools.cassette.jsonl` (8 records), `todowrite.cassette.jsonl` (4), `todowrite-clear.cassette.jsonl` (6).

## Accomplishments
- `replayTranscript(text)` returns `{items, stats}` for both families; pure, no `fs` or `child_process` import, never throws (4000 mutated-cassette fuzz runs and the `21` case: none threw, `stats.error` never set).
- Identity rests on the stem: metadata `devflow_todo`, else `[todo:<stem>]` suffix, else `<UTC date of the result record>-<slug>`, the same name `todo add` gives (test 23 asks the real `todoAdd`).
- Only calls with a present, non-error result take effect; disabled-tool errors, cut transcripts, sidechain records, failed updates and unknown ids are counted in `stats`, never applied.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Record the host contract and build the fixture builders | `node -e "...transcriptOf(taskCreate(...))...length"` prints `2`; `rg -c '"TaskCreate"' task-tools.cassette.jsonl` = 2; `rg -n '/Users/' __fixtures__/todo-transcripts/` prints nothing | 0 | PASS |
| 2: replayTranscript and the grammar (RED then GREEN) | `node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` (30 tests, 0 skipped); `node --test .../helpers.test.cjs` (18 pass); `rg -n "require\('(fs\|child_process)'\)" todo-session.cjs` prints nothing | 0 | PASS |

## Task Commits

1. **Task 1: cassettes and fixture builders** - `59cb2f10` (test)
2. **Task 2 RED: failing replay suite** - `bb1466d5` (test)
3. **Task 2 GREEN: replayTranscript and grammar** - `d83fc48d` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` | 0 | PASS (30/30) |
| test (full, run 1) | `npm --prefix <worktree> test` | 1 | 10516 tests, 10455 pass, 50 skipped, 11 fail (2 mine, fixed; 9 environmental) |
| test (full, run 2, final tree) | `npm --prefix <worktree> test` | 1 | 10516 tests, 10456 pass, 50 skipped, 10 fail, all in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` (environmental, none touches this TRD) |

The 11 failures of the first full run, by cause:
- **2 caused by this TRD, fixed before the commit** (Rule 1): `gh-project.test.cjs` X2 (a repo guard that rejects any lib module whose text contains `__fixtures__`; my header comment named the directory, reworded; the file now passes 35/35), and `roadmap-reconcile.test.cjs` E2E1 (the ROADMAP line for 63-01 was unchecked while its SUMMARY existed; `roadmap update-job-progress 63` ticked it and the file now passes 63/63). A second full run after the fixes is recorded under Post-TRD Verification.
- **9 (run 1) or 10 (run 2) environmental, not touching any file of this TRD**: 3 or 4 in `devflow-watch.test.cjs` and 6 in `handoff-e2e.test.cjs` (daemon start/stop, handoff pipeline, daemon reaping); the exact count of the first group varies run to run. In this worktree the daemon exits 3 with `failed to spawn shell` before writing its PID file; the same `devflow-watch.test.cjs` passes 22/22 in the main checkout at the same base. Not investigated further; flagged for 63-07's full-suite pass.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` | 1 | FAIL (correct: `Cannot find module './todo-session.cjs'`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` | 0 | PASS (correct: 30/30) |

No REFACTOR commit: nothing to clean once green.

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (the X2 guard)
- **Must-haves verified:** 6/6 (both families replay; todo marker rules; stable stems and idempotent replay; only non-error results applied; never throws; shapes checked against the real host)
- **Gate failures:** none from this TRD. Run 2 on the final tree: 10 environmental daemon/handoff tests (see Validation Gate Results); `todo-session.test.cjs` 30/30, `gh-project.test.cjs` 35/35 and `roadmap-reconcile.test.cjs` 63/63 pass.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/todo-session.cjs` - the pure replay, the subject grammar and `deriveStem`
- `plugins/devflow/devflow/bin/lib/todo-session.test.cjs` - 30 named tests (the 23 of the test list, plus 24-30)
- `plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs` - deterministic record builders and the cassette paths
- `plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/*.cassette.jsonl` - three recordings of the real host

## Decisions Made
See `key-decisions`. For 63-02: an item's `key` is `task:<id>` or `todowrite:<stem>`; **two items can share a stem** if a flow creates the same todo twice in one session, so the merge must fold by stem (the replay does not collapse them); `status` can be `deleted`; `created_at` and `updated_at` are the timestamps of the result record, and `updated_at` moves on every TodoWrite snapshot that lists the item.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A repo guard rejected a comment naming the fixtures directory**
- **Found during:** Task 2 (full-suite gate)
- **Issue:** `gh-project.test.cjs` X2 fails any non-test lib module whose text includes `__fixtures__`; the header comment of `todo-session.cjs` did.
- **Fix:** reworded the comment.
- **Files modified:** `plugins/devflow/devflow/bin/lib/todo-session.cjs`
- **Verification:** `node --test .../gh-project.test.cjs` 35/35.

**2. [Rule 2 - Missing critical functionality] Completed items cleared from a TodoWrite list were turned into deletions**
- **Found during:** Task 2 (third live probe, run to answer the question "what does TodoWrite carry when everything is done")
- **Issue:** the plan's rule "absent from the next snapshot becomes deleted" would flip a finished todo to `deleted` the moment the model (or the host) clears the list, losing the completion.
- **Fix:** only unfinished (pending/in_progress) items become `deleted`; a `completed` item that drops out stays `completed`. Test 30 and cassette test 29.
- **Files modified:** `todo-session.cjs`, `todo-session.test.cjs`, `todo-transcript-fixtures.cjs`, new `todowrite-clear.cassette.jsonl`.

**3. [Rule 2 - Missing critical functionality] Four guards the plan did not list**
- A TaskUpdate result with `success: false` is not applied (the documented output has `success` and `error`), counted in `errors_skipped` (test 24).
- TaskCreate id text fallback for the one observed form, only when the structured result is absent (test 25); a result with no readable id is counted in `unresolved_uses`.
- A todo that has no explicit stem and whose record has no usable timestamp is skipped and counted in `stats.no_stem_skipped` instead of being emitted with a null stem (test 28).
- The SDK stream spelling `tool_use_result` is read like `toolUseResult` (test 26).

**4. [Rule 1 - Bug] `requirements mark-complete BLTN-04` ran too early and was reverted**
- **Found during:** state updates after the SUMMARY post
- **Issue:** this TRD is "BLTN-04, part 1" (the replay parser). BLTN-04 as written (`/devflow:todo` on the task list with a Stop-hook sync into a durable archive) is also carried by 63-02, 63-03, 63-04 and 63-07, so ticking it here would show a requirement as Complete with the sync and the skill still unbuilt.
- **Fix:** reverted the uncommitted `.planning/REQUIREMENTS.md` tick; BLTN-04 stays Pending until the last TRD that carries it (63-07) marks it. `requirements-completed: [BLTN-04]` in the frontmatter records this TRD's contribution only.
- **Files modified:** none committed.

Also: `replayTranscript(text)` takes no `opts` (the plan's signature had one that nothing used), and TodoWrite items have `source: 'todowrite'`, `task_id: null`.

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 2 Rule 2). **Impact on plan:** all necessary for correctness; no scope creep beyond one extra cassette and seven extra tests.

## Issues Encountered
- `Monitor` is disabled in this session, so long waits used a foreground until-loop with a timeout.
- The full suite's 9 daemon/handoff failures are an environment limit of this worktree (see Validation Gate Results).

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
63-02 can import `replayTranscript` and `deriveStem` as is. The only open risk is the one the TRD already names: the Stop hook may read a transcript missing the final result line, which replay reports as `unresolved_uses` and picks up at the next Stop.

## Self-Check: PASSED

- Created files all present: `todo-session.cjs`, `todo-session.test.cjs`, `todo-transcript-fixtures.cjs`, and the three `*.cassette.jsonl`.
- Commits found: `59cb2f10`, `bb1466d5`, `d83fc48d`.
- No `/Users/` in the cassettes; no `__fixtures__`, `fs` or `child_process` reference in `todo-session.cjs`.

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-06*
