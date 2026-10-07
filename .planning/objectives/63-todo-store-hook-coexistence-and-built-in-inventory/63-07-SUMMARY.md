---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "07"
subsystem: docs
tags: [dogfood, docs, changelog, user-guide, full-suite]
status: in-progress
---

# Objective 63 TRD 07: Dogfood, document, full suite Summary

## Progress
- [x] Task 1: Dogfood (scratchpad only) — (this commit)
- [ ] Task 2: Documentation — next step: edit CHANGELOG.md [Unreleased] (Added/Changed/Fixed entries for objective 63), then docs/USER-GUIDE.md, CLAUDE.md `todo add|complete|sync`, help.md Todo Management
- [ ] Task 3: Full suite — next step: run `npm test`, prove each failure on the base commit in a temporary worktree, regenerate site/data/devflow.json

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
