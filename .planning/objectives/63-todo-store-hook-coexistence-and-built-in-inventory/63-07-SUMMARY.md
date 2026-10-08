---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "07"
subsystem: docs
tags: [dogfood, docs, changelog, user-guide, full-suite, uat, bltn-04, bltn-05, bltn-06]

requires:
  - objective: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: "63-01 to 63-06: session todo replay, todo sync library and CLI, todo-sync Stop hook, todo skill on the task list, coexistence suite, built-in inventory"
provides:
  - "dogfood evidence D1-D7 for SC1-SC3 outside the unit tests, plus a five-item UAT list for /devflow:verify-work 63"
  - "CHANGELOG [Unreleased], USER-GUIDE (a todo section, a hooks-table row, a Your own hooks section), help.md and one CLAUDE.md clause describing the shipped behaviour"
  - "a green full suite: handoff-e2e MA-7 made hermetic, site/data/devflow.json regenerated"
affects: [verify-work 63]

tech-stack:
  added: []
  patterns:
    - "Live Claude Code runs are best effort: an authentication failure is recorded with its first output line and handed to UAT, never faked"

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/devflow/bin/handoff-e2e.test.cjs
    - site/data/devflow.json

key-decisions:
  - "The two live Claude Code runs (D3, D4) were skipped after one try each: a scratch HOME cannot reach the macOS login keychain, so both stopped at 'Not logged in'. The docs describe what the tests and the CLI/hook dogfood show and leave the live behaviour to UAT, as the TRD requires"
  - "MA-7 was made hermetic rather than left failing: the cause is the developer shell's DIGITALOCEAN_ACCESS_TOKEN, which makes the real doctl finish `auth init` without prompting; the daemon spawn now drops it. A test-only change in its own commit"
  - "No code change was needed anywhere else: no dogfood finding required a fix"

requirements-completed: [BLTN-04, BLTN-05, BLTN-06]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: false
  test_pairing: true

duration: 14min
completed: 2026-10-07
tokens_input: 16333344
tokens_output: 60297
tokens_cache_read: 16147856
tokens_cache_write: 185280
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 63 TRD 07: Dogfood, document, full suite Summary

**The session todo store, the todo-sync Stop hook, the hook coexistence suite and the built-in inventory are shown working outside the unit tests (CLI and hook dogfood, 215 coexistence tests, 25 inventory tests), written into CHANGELOG, USER-GUIDE, help.md and CLAUDE.md, and the full suite is green (10,835 tests, 10,801 pass, 0 fail, 34 skipped); the two live Claude Code runs could not authenticate and are on the UAT list.**

## Progress
- [x] Task 1: Dogfood (scratchpad only) — 37bbd537 (SUMMARY checkpoint only: the task changes no repo file)
- [x] Task 2: Documentation — f2aad1af
- [x] Task 3: Full suite — 56a4de7c (MA-7 hermetic), 5fda5508 (site/data regenerated)

## Dogfood evidence (Task 1)

All runs used a scratch HOME / scratch git project under the session scratchpad. `git status --porcelain` before and after is byte-identical (only the nine pre-existing untracked `.gitkeep` files). Scratch HOME, projects and scripts removed afterwards.

| # | SC | Run | Result |
|---|---|---|---|
| D1 | SC1 CLI | `df-tools --cwd <git scratch project> todo sync --transcript <t> [--dry-run] --raw` over a transcript with one metadata todo (`devflow_todo`), one derived-stem todo, then the first completed | Dry run: `added` 2, `completed` 1, `changed_paths` `[]`, no file written. First real run: `added` `[2026-10-06-probe-metadata-todo, 2026-10-06-probe-derived-stem-todo]`, `completed` `[2026-10-06-probe-metadata-todo]`; files `todos/completed/2026-10-06-probe-metadata-todo.md` and `todos/pending/2026-10-06-probe-derived-stem-todo.md`; `pending_commit` names both, nothing committed. Second real run: `added` `[]`, `completed` `[]`, `changed_paths` `[]` (idempotent). PASS |
| D2 | SC1 hook | Stop payload (`hook_event_name`, `session_id`, `transcript_path`, `cwd`) into `hooks/todo-sync.js` in a fresh scratch project, twice | First Stop, exit 0, 54 ms: one `systemMessage`: `DevFlow: todo sync: archived 2 todo(s) from this session` / `completed 1 todo(s)` / `not committed yet: <both paths> (/devflow:todo list commits them)`. Second Stop, exit 0, 51 ms: empty stdout, empty stderr. `git log` in the scratch project shows only the fixture commit (the hook never commits). PASS |
| D3 | SC1 live | `HOME=<scratch> CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p --plugin-dir <checkout>/plugins/devflow --output-format stream-json --verbose --dangerously-skip-permissions "/devflow:todo add Probe the session todo store"`, scratch HOME holding a copy of `~/.claude.json` | SKIPPED, handed to UAT. First output line: `Not logged in · Please run /login` (exit 1, 3.2 s). `~/.claude/.credentials.json` does not exist: the OAuth credential is in the login keychain, which a scratch HOME cannot reach, so there was no fixable setup mistake and no second try. The init event did list the plugin (`devflow@inline` 2.13.2) and `TaskCreate`, `TaskGet`, `TaskList`, `TaskStop`, `TaskUpdate` with the variable on; the four SessionStart hooks of the plugin all exited 0 (sync-runtime mirrored into the scratch HOME). The `-r <session_id>` resume and the 63-01 replay over a live D3 transcript were therefore not run (the replay is covered by D1 and D7 and the 63-01 cassettes of the real host). |
| D4 | SC2 live | Same scratch HOME plus `--settings <scratch>/user-hooks.json` (user Stop hook printing `{"systemMessage":"user stop hook ran"}`, user PreToolUse `Bash` hook exiting 1 with a stderr line), prompt `Run git status once with Bash, then stop.` | SKIPPED, handed to UAT. Same first output line `Not logged in · Please run /login` (exit 1, 2.3 s); the model never ran, so no Bash call and no Stop. Same SessionStart result as D3. |
| D5 | SC2 suite | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 215 tests, 215 pass, 0 fail, 7.7 s (limit 60 s). 21 registered script/event pairs (the 20 of 63-05 plus `todo-sync.js@Stop`), nine user-hook stubs, 8 model tests, 3 table tests, 63 rows for tests 10-12 (21 x 3), 120 degraded-input (20 registrations x 6 inputs), 21 duplicate-copy. PASS |
| D6 | SC3 | `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs`, then the status counts from `docs/built-in-integration-status.md` | 25 tests, 25 pass, 0 fail. Tools (46): 15 adopted, 7 partial, 3 candidate, 16 not adopted, 5 n/a. Hook events (33): 7 adopted, 2 candidate, 20 not adopted, 4 n/a. Other surfaces (18): 8 adopted, 5 partial, 1 candidate, 4 not adopted. Counts equal 63-06's. PASS |
| D7 | SC1 | `df-tools --cwd <this repo> todo sync --transcript <this executor's own transcript> --dry-run --raw` | Exit 0, `todo_items` 0, `skipped: "no session todos"`, `added`/`completed`/`changed_paths` all `[]`. The six real pending todos (`.planning/todos/pending`, six files) were not touched. PASS |

Side note on the real `~/.claude`: `~/.claude/devflow/.devflow-notices.json` has an mtime of 21:18 local, ten minutes before the first live run (21:28), so it comes from this executor session's own ambient hooks, not from the dogfood (every live run had `HOME=<scratch>`).

## UAT handoff list for `/devflow:verify-work 63` (interactive, cannot be headless)

1. With `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, `/devflow:todo add <x>` shows a `Todo: <x>` task in the Ctrl+T list and a todo file is committed. (D3 could not authenticate.)
2. Asking Claude to finish that todo marks the task completed; when the turn ends the todo is in `todos/completed/` and the `DevFlow: todo sync` message shows.
3. `/devflow:todo list` shows the in-session status and commits any sync it made; "Work on it now" puts the todo in progress in the task list.
4. Without the variable (the default on newer models), `/devflow:todo add` and `list` behave as before.
5. With the user's own `~/.claude/hooks/guard-kube-context.py` PreToolUse hook active, a session that runs Bash shows no DevFlow hook error notice. (D4 could not authenticate.)

Also for the verify-work session: confirm `verify-commits.js` against a live SubagentStop (see Follow-ups).

## Documentation (Task 2)

- **CHANGELOG [Unreleased]:** Added (the session task list as the todo store; `df-tools todo sync`; `hooks/todo-sync.js` and `DEVFLOW_SKIP_TODO_SYNC=1`; the coexistence suite; `docs/built-in-integration-status.md` and its repo test), Changed (`add` order, `list` sync and status, "Work on it now", `builtin-audit` counting `TodoWrite(`, built-ins.md section 5), Fixed (five hooks that exited 1 on a non-object payload).
- **docs/USER-GUIDE.md:** a new `### Todos and the session task list` (with and without task tools, linking "Turning the task tools on"; the Stop hook and what it says; `todo sync` and `--dry-run`; who commits; the forward-only merge; limits); a `todo-sync.js` row in the hooks table; `### Your own hooks` under `## Hooks and what they enforce` (parallel composition, DevFlow's exit-0 / one-JSON-object / never-`continue: false` / never-lifts-your-deny guarantees, the suite that checks them); the link to `built-in-integration-status.md`; the two todo rows of the command table.
- **help.md** (Todo Management): `add` also adds the `Todo:` session item; `list` syncs first and shows in-session status; one line for `df-tools todo sync` in the planning-verb list. **CLAUDE.md:** `todo add|complete|sync` plus the one clause the TRD gave, nothing else.
- Where the live behaviour was not seen (D3, D4) the text says the tests show it and that the live run is on the verify-work list.

## Full suite (Task 3)

| Run | Tree | tests | pass | fail | skipped | Time |
|---|---|---|---|---|---|---|
| 1 | after Task 2 and before the MA-7 fix, ROADMAP line for 63-07 unticked | 10,835 | 10,801 | 2 | 32 | 145.6 s |
| A (final) | after the MA-7 fix, site data regenerated and `roadmap update-job-progress 63` | 10,835 | 10,801 | 0 | 34 | 146.4 s |

The two failures of run 1, and what became of each:

1. **`handoff-e2e.test.cjs` MA-7 (`doctl auth init` with `DIGITALOCEAN_TOKEN` unset): pre-existing, environmental, fixed hermetically.**
   - *Proof on the base:* in a temporary worktree at `eccc2916` (the main checkout's `node_modules` linked in so the daemon could load node-pty), `node --test --test-name-pattern MA-7 plugins/devflow/devflow/bin/handoff-e2e.test.cjs` fails with the same assertion, `{"status":"done","exit_code":0,"stderr":""}`. The worktree was removed afterwards (`git worktree list` shows only the checkouts that existed before).
   - *Nothing in objective 63 touches it:* `git diff 26e4e57f HEAD` over `handoff-e2e.test.cjs`, `devflow-watch.cjs` and its test, `lib/handoff.cjs` and its test, the handoff cassettes and `inject-handoff-results.js` is empty.
   - *Cause:* this shell exports `DIGITALOCEAN_ACCESS_TOKEN`. The daemon is spawned with `...process.env`, so the real `/opt/homebrew/bin/doctl` finds a token and `auth init` finishes without prompting (exit 0), where the test expects a failure path. `env -u DIGITALOCEAN_ACCESS_TOKEN node --test ... MA-7` takes the test's documented architectural-gap skip path instead.
   - *Fix* (`56a4de7c`, its own commit, test only): `withDaemonAndMocks` drops `DIGITALOCEAN_ACCESS_TOKEN` from the spawned environment, with a comment. The whole file, run with the variable present, is 13 tests, 10 pass, 0 fail, 3 skipped (MA-6-synth, MA-7 and MA-6, each its documented gap path). The same variable made MA-6 pass for the wrong reason in run 1; that is why skipped goes 32 to 34 while pass stays 10,801 (MA-7 fail to skip, MA-6 pass to skip, E2E1 fail to pass).
2. **`roadmap-reconcile.test.cjs` E2E1 (reconcile self-test): not pre-existing, expected ordering.** The ROADMAP line for 63-07 was unticked while this TRD's checkpoint SUMMARY existed, the same state 63-01 to 63-06 each hit. `roadmap update-job-progress 63` ticked it; run A passes it.

`npm run docs:data` rewrote the tracked `site/data/devflow.json` (`5fda5508`): the `todo-sync.js` row from 63-03, plus the accumulated drift 63-03 had reverted (hooks 19 to 22, references 36 to 37, df-tools commands 79 to 83, skill tool lists that gained AskUserQuestion, TaskCreate, TaskUpdate and TodoWrite, new `gate-bash-writes.js` and `gate-skill-requires.js` rows). The diff was read: all generated, no local paths.

## Carry-overs closed

- **Requirements:** BLTN-04, BLTN-05 and BLTN-06 ticked in REQUIREMENTS.md by `requirements mark-complete` (all earlier TRDs deliberately left BLTN-04 and BLTN-06 pending). 63-03's SUMMARY posted `requirements-completed: [BLTN-04, BLTN-05]`; **BLTN-04 was only fully complete at 63-07**, once the skill (63-04), the hook (63-03), the CLI (63-02) and the docs and dogfood here all existed.
- **`site/data/devflow.json`:** regenerated and committed (above).
- **MA-7:** proven pre-existing and made hermetic (above).
- **verify-commits.js:** see Follow-ups.
- **Live runs:** D3 and D4 recorded as skipped with their first output line, and moved to the UAT list.

## Follow-ups (not fixed here)

- **`verify-commits.js` nests `decision` and `reason` inside `hookSpecificOutput` for SubagentStop** (63-05 finding). The documented SubagentStop contract reads top-level `decision: "block"` and `reason`, so the hook's retry nudge probably composes to nothing in Claude Code today. Not in this TRD's scope (the TRD forbids code changes beyond a minimal dogfood fix, and `verify-commits.test.js` pins the nested shape at lines 176-179, 219, 287, 318 and 349). Suggested: confirm against a live SubagentStop, then move the fields to the top level and update those tests.
- **Authenticated live runs** of `/devflow:todo` and of a user hook beside DevFlow's (UAT items 1-5). A future run could pass a long-lived token through `CLAUDE_CODE_OAUTH_TOKEN` into a scratch HOME; that was not done here because it means reading the credential out of the keychain, which the TRD did not ask for.
- **`/devflow:todo` store-mode dogfood** (queue, flush, GitHub issue) was not run live; it is covered by the 63-02 and 63-03 fake-GitHub tests only.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood | D1-D7 above; `git status --porcelain` before and after identical | 0 | PASS (D3 and D4 skipped, recorded and handed to UAT) |
| 2: Documentation | `rg -c -e "todo sync" -e "todo-sync"` matches in CHANGELOG.md (3), docs/USER-GUIDE.md (5), CLAUDE.md (2), help.md (2); `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs hook-inventory.test.cjs builtin-sweep.repo.test.cjs` 46 tests, 46 pass; `rg -n built-in-integration-status docs/USER-GUIDE.md CHANGELOG.md` matches in both | 0 | PASS |
| 3: Full suite | `npm test` run A: 10,835 tests, 10,801 pass, 0 fail, 34 skipped | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 2, ratchets) | `node --test .../doc-refs.repo.test.cjs .../planning-writes.repo.test.cjs .../hook-inventory.test.cjs .../builtin-sweep.repo.test.cjs` | 0 | PASS (46/46) |
| test (task 3, MA-7 file) | `node --test plugins/devflow/devflow/bin/handoff-e2e.test.cjs` | 0 | PASS (10 pass, 3 documented skips) |
| test (full, run 1) | `npm test` | 1 | 10,835 tests, 10,801 pass, 2 fail (MA-7, E2E1), 32 skipped |
| test (full, run A) | `npm test` | 0 | 10,835 tests, 10,801 pass, 0 fail, 34 skipped |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (MA-7 made hermetic, Rule 1)
- **Must-haves verified:** 4/4 (each SC observed outside the unit tests or recorded with a reason; headless gaps handed to UAT as numbered items; CHANGELOG, USER-GUIDE, help.md and the one CLAUDE.md clause written; the full suite passes, the one pre-existing failure proven on the base)
- **Gate failures:** none after the fixes

## Files Created/Modified
- `CHANGELOG.md`, `docs/USER-GUIDE.md`, `CLAUDE.md`, `plugins/devflow/devflow/workflows/help.md` - the documentation
- `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` - four lines: the hermetic environment
- `site/data/devflow.json` - regenerated
- Planning state (ROADMAP.md, STATE.md, STATE_ARCHIVE.md, REQUIREMENTS.md) via df-tools

## Decisions Made
See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] handoff-e2e MA-7 failed on any machine whose shell exports `DIGITALOCEAN_ACCESS_TOKEN`**
- **Found during:** Task 3 (first full run)
- **Issue:** the real doctl found the ambient token and finished `auth init` with exit 0; the test expects the no-token failure path. MA-6 passed for the same wrong reason.
- **Fix:** `delete env.DIGITALOCEAN_ACCESS_TOKEN` in `withDaemonAndMocks`. Proven pre-existing at `eccc2916` first.
- **Files modified:** `plugins/devflow/devflow/bin/handoff-e2e.test.cjs`
- **Commit:** 56a4de7c (separate from the documentation commit, as the dispatch asked)

### Other deviations from the TRD text
- **Task 1 has a commit** (`37bbd537`, the SUMMARY checkpoint) although it changes no repo file, so the one-task-one-commit trail and the resume point exist.
- **Base for the MA-7 proof:** the TRD names `eccc2916` and the dispatch named the objective base `26e4e57f`; I ran the test at `eccc2916` and checked the diff against `26e4e57f` (empty for every handoff file).
- **D3's second half** (`-r` resume, the 63-01 replay over a live transcript) and D4 were not run, since the first call could not authenticate (see D3, D4).
- **D7** found this executor's transcript as a subagent transcript under `~/.claude/projects/.../subagents/` and ran the dry run against it.

## Issues Encountered
- Both live runs stopped at `Not logged in · Please run /login`: with `HOME` pointing at a scratch directory the macOS login keychain is out of reach, and there is no file credential at `~/.claude/.credentials.json`.
- `Monitor` was not used; waits were foreground until-loops on the log file.
- The coexistence run printed its full spec output into context (215 lines); later runs used `--test-reporter=dot` or read only the totals.

## Discovered commands
None: the stack profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## User Setup Required
None. For the UAT items: run Claude Code with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` and an installed plugin carrying objective 63.

## Next Objective Readiness
Objective 63 is ready for `/devflow:verify-work 63` with the five UAT items above. The `verify-commits.js` SubagentStop shape is the one open code follow-up. Release (2.13.x, tag, plugin re-sync) is not done here by instruction.

## Self-Check: PASSED

- Modified files present: `CHANGELOG.md`, `docs/USER-GUIDE.md`, `CLAUDE.md`, `plugins/devflow/devflow/workflows/help.md`, `plugins/devflow/devflow/bin/handoff-e2e.test.cjs`, `site/data/devflow.json`, and the inventory the docs link to, `docs/built-in-integration-status.md`.
- Commits found in `git log`: `37bbd537`, `f2aad1af`, `56a4de7c`, `5fda5508`.
- `git status --porcelain` after the dogfood equals the record before it; scratch HOME, projects, scripts and the temporary base worktree are gone.

---
*Objective: 63-todo-store-hook-coexistence-and-built-in-inventory*
*Completed: 2026-10-07*
