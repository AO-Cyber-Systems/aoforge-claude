---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
job: "02"
subsystem: planning-todos
tags: [todo, sync, merge, archive, cli, idempotent, store-mode]

requires:
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-01 replayTranscript: a transcript in, stable-stem todo items out"
  - objective: 48-planning-write-path
    provides: "todoAdd / todoComplete verb functions (local files and devflow:todo issues)"
provides:
  - "todo-sync.cjs: readArchive, normalizeTitle, planSync (pure), buildTodoText, resolveSessionTranscript, syncTodos"
  - "df-tools todo sync (--transcript <path>... | --session <id>) [--projects-root] [--dry-run] [--no-flush] [--no-wait] [--raw]"
  - "todo-archive-fixtures.cjs: hand-built local-mode projects with pending/completed/done todos and a projects root"
affects: [63-03 todo-sync Stop hook, 63-04 todo skill on the task list, 63-07 dogfood]

tech-stack:
  added: []
  patterns:
    - "A pure planner (planSync) between a reader (readArchive) and an applier that only calls the existing verb functions through the module object"
    - "Monotonic merge: absent -> pending -> completed; a session deletion or pending status never moves an archive todo backwards"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/todo-sync.cjs
    - plugins/devflow/devflow/bin/lib/todo-sync.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Items that name one stem fold into one op set; the furthest status wins (completed > in_progress > pending > deleted) and the first seen wins a tie, so the archived bytes do not depend on transcript order"
  - "pending_commit is every changed .md todo under .planning/todos that git reports (not only the files this run wrote), so a no-op rerun in the list flow still names what the Stop hook wrote and left uncommitted"
  - "The CLI prints its own human report: report()'s generic headline would read the result's `skipped` list as a skip (the same reason planning import prints its own)"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 11min
completed: 2026-10-07
tokens_input: 10366551
tokens_output: 90169
tokens_cache_read: 10171430
tokens_cache_write: 194991
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 63 TRD 02: Todo sync merge and CLI Summary

**A pure planner plus an applier merges a session's replayed todos into the archive through `todo add` / `todo complete`, monotonically and idempotently, in local and store mode, behind `df-tools todo sync`.**

## Progress
- [x] Task 1: Archive fixture builders — 9a96ba3d
- [x] Task 2: todo-sync.cjs (planSync, readArchive, buildTodoText, syncTodos) RED then GREEN — fe49ee19 (RED), 52b51b2a (GREEN)
- [x] Task 3: `df-tools todo sync` CLI and help (RED then GREEN) — 421ee769 (RED), be5bcd59 (GREEN)

## Accomplishments
- `syncTodos(cwd, opts)` replays each transcript (63-01), plans against the MAIN checkout's archive and applies the plan through `entity.todoAdd` / `entity.todoComplete`. The module contains no file write, rename, unlink or rm (a test reads the source to prove it), and no gh call of its own.
- Idempotent and monotonic: a second identical sync adds nothing, completes nothing, and leaves the file bytes and mtime alone (test 2); the same todo in two transcripts folds into one op set whatever the order (test 11); a completed archive todo is never reopened and a session deletion never removes anything (test 9 table).
- Byte parity (D-01): a sync completion produces the same bytes as `df-tools todo complete` on an identical copy (library test 3 and CLI test 3), and with `github.store` off it makes zero gh calls and writes no journal or ledger.
- Store mode (fake GitHub): an add queues one `upsert-issue` for `todo-<stem>` with role `todo`, a completion queues the close, a rerun queues nothing and makes no gh call (test 14); a flushed add plus completion leaves a closed `devflow:todo` issue.
- A failed op (a completion whose pending file vanished after planning) is a warning, the other ops still apply, and the result is `ok:false`, `exit:1` (test 15).
- `df-tools todo sync` reads `--transcript <path>` (repeatable, `--flag=value` too) or `--session <id>` (resolved under `--projects-root`, else `$CLAUDE_CONFIG_DIR/projects`, else `~/.claude/projects`, read at call time). An unsubstituted `${CLAUDE_SESSION_ID}` or a non-id is a usage error before any search.
- Checked against the three real 63-01 cassettes: each syncs to one archived and completed todo, and a combined rerun is a no-op.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Archive fixture builders | `node -e "...makeTodoProject({todos:[{stem:'2026-10-05-a',title:'A',state:'completed'}]})...split('\n')[0]"` prints `completed: 2026-10-05`; the git and projects-root options checked by a second inline run | 0 | PASS |
| 2: todo-sync.cjs (RED then GREEN) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` (library tests 43/43); `rg -n "writeFileSync\|renameSync\|unlinkSync\|rmSync" todo-sync.cjs` prints nothing | 0 | PASS |
| 3: CLI and help (RED then GREEN) | `node --test todo-sync.test.cjs planning-verbs-cli.test.cjs help.test.cjs help-delegation.test.cjs planning-entity-verbs.test.cjs planning-writes.repo.test.cjs` (57 + 89 pass); `node plugins/devflow/devflow/bin/df-tools.cjs todo sync` exits 1 printing the usage line | 0 | PASS |

## Task Commits

1. **Task 1: archive fixture builders** - `9a96ba3d` (test)
2. **Task 2 RED: failing library tests** - `fe49ee19` (test)
3. **Task 2 GREEN: todo-sync.cjs** - `52b51b2a` (feat)
4. **Task 3 RED: failing CLI tests** - `421ee769` (test)
5. **Task 3 GREEN: todo sync CLI, help, header** - `be5bcd59` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` | 0 | PASS (57/57) |
| test (verification set) | `node --test todo-sync.test.cjs planning-verbs-cli.test.cjs planning-entity-verbs.test.cjs planning-writes.repo.test.cjs help.test.cjs help-delegation.test.cjs todo-session.test.cjs gh-project.test.cjs` | 0 | PASS |
| test (full) | `npm --prefix /Users/justin/dev/devflow-claude test` | 1 | 10778 tests, 10744 pass, 32 skipped, 2 fail (see below) |

The 2 failures of the full run, neither caused by this TRD's code:
- `roadmap-reconcile.test.cjs` E2E1 (self-test): the ROADMAP line for 63-02 is unchecked while its SUMMARY exists. Resolved by `roadmap update-job-progress 63` in the state step below; the same test failed identically for 63-01 until its roadmap line was ticked.
- `handoff-e2e.test.cjs` MA-7 (`doctl auth init` with `DIGITALOCEAN_TOKEN` unset): the test expects the auth to fail, but `/opt/homebrew/bin/doctl` is installed here and the mocked run reports `done`, exit 0. It also fails when run alone. It touches no file this TRD changed (not run against the base commit).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (library) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` | 1 | FAIL (correct: `Cannot find module './todo-sync.cjs'`) |
| GREEN (library) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` | 0 | PASS (43/43; one test, `normalizeTitle`, needed a one-line implementation fix first, see Deviations) |
| RED (CLI) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` | 1 | FAIL (correct: 14 CLI tests, `Unknown todo subcommand`/missing usage; the unchanged-verb assertions passed) |
| GREEN (CLI) | `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` | 0 | PASS (57/57) |

No REFACTOR commit: nothing to clean once green.

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (`normalizeTitle`, a test-driven fix before the GREEN commit)
- **Must-haves verified:** 5/5 (merge through the verbs in both modes; monotonic and idempotent; deletions never remove and completions never reopen; nothing to merge writes nothing and makes no gh call, local bytes identical to the verbs; result names `added`, `completed`, `changed_paths`, `pending_commit` and keeps going past a failed op)
- **Gate failures:** none from this TRD (2 in the full run, both noted above)

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/todo-sync.cjs` - reader, pure planner, todo text, session transcript lookup, the sync
- `plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` - 57 tests: library (local and store), planner table, archive reading, text, and the CLI
- `plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs` - local project, todo file text, transcript and projects-root builders
- `plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs` - `todo sync` branch, `flagValues`, the human report, `Available: add, complete, sync`
- `plugins/devflow/devflow/bin/lib/help.cjs` - `todo` usage and summary
- `plugins/devflow/devflow/bin/df-tools.cjs` - header usage line

## Decisions Made
See `key-decisions`. For 63-03 and 63-04: `syncTodos` returns `skipped` as the planner's array on a normal run and as the string `'no session todos'` when no transcript held a todo (so do not treat it as a boolean); `queued` is always `{enqueued, coalesced}` counts (zeros locally); with no items to merge it returns before touching git, so `pending_commit` is `[]` there even if earlier sessions left todo files uncommitted; the per-item session id for the Problem line comes from `opts.sessionId`, else the transcript file name when it looks like a session id, else `unknown`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `normalizeTitle` did not strip quotes around a padded title**
- **Found during:** Task 2 (GREEN run)
- **Issue:** the plan's formula strips the surrounding quote pair before trimming, so `'  "Fix the thing"  '` kept its quotes and would not match an archive title read without padding.
- **Fix:** trim first, then strip one quote pair, lowercase, collapse whitespace, trim. A strict superset of the plan's behaviour for every unpadded input.
- **Files modified:** `plugins/devflow/devflow/bin/lib/todo-sync.cjs`
- **Verification:** the normalizeTitle test passes; all 57 tests pass.
- **Commit:** 52b51b2a

**2. [Rule 2 - Missing critical functionality] A write that reached its flush counts as written even when the flush fails**
- **Found during:** Task 2 (designing the op loop)
- **Issue:** in store mode `todoAdd` returns `ok:false` with a `flush` payload when the file and queue entry exist but the flush halted; treating that as "not added" would make the next sync re-plan an add for a file that already exists.
- **Fix:** such an op is recorded in `added` / `completed` and `changed_paths` and still raises a warning and `exit: 1`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/todo-sync.cjs`

**3. [Rule 2 - Missing critical functionality] Four small guards beyond the plan's listing**
- `pending_commit` strips the repository prefix when `.planning/` is not at the repo root, parses `git status -z` rename entries, keeps only `.md` paths, and treats "not a git repository" or a missing git binary as `[]` with no warning (any other git failure is a warning).
- A thrown error inside a verb call becomes a warning for that op instead of aborting the sync.
- The CLI treats a result with no `added` array (usage error, no `.planning/`) with the generic `report()` and prints its own report otherwise.
- Test 19 reads `todo-sync.cjs` itself to prove it has no direct write calls, in addition to the `rg` check.

Also: `makeProjectsRoot` in the fixtures returns a `cleanup` as well as `{root, transcript}`; the CLI help check is `df-tools todo --help` (there is no `help` command).

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 2). **Impact on plan:** none on scope; all necessary for correctness.

## Issues Encountered
- `Monitor` was not used; the full-suite wait used a foreground until-loop on the background task's output file.
- The full suite's MA-7 failure is environmental (a real `doctl` is installed on this machine).

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
63-03 can call `syncTodos(cwd, { transcripts: [transcript_path], sessionId, noFlush: true })` in-process and read `added`, `completed`, `pending_commit` and `queued`; 63-04's list flow can run `df-tools todo sync --session <id> --raw` and commit exactly `pending_commit` with `df-tools commit --files`. Open edge, unchanged from the plan: a derived-stem todo with the same title as an old completed one is treated as already done (the plan's title de-dupe), and in store mode the archive read is the local cache, so a stale cache can re-queue an add that GitHub already holds (the upsert is idempotent by `todo-<stem>`).

## Self-Check: PASSED

- Created files all present: `todo-sync.cjs`, `todo-sync.test.cjs`, `__fixtures__/todo-archive-fixtures.cjs`.
- Commits found: `9a96ba3d`, `fe49ee19`, `52b51b2a`, `421ee769`, `be5bcd59`.
- No direct write call in `todo-sync.cjs`; no `__fixtures__` text in any lib module outside tests (gh-project X2 passes).

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-07*
