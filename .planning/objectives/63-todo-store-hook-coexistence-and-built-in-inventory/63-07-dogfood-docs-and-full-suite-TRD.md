---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "07"
type: standard
wave: 5
depends_on: ["63-06"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - plugins/devflow/devflow/workflows/help.md
autonomous: true
requirements: [BLTN-04, BLTN-05, BLTN-06]
must_haves:
  truths:
    - "Each success criterion is observed outside the unit tests: the todo sync and Stop hook on a scratch DevFlow project (add, complete, repeat with no change), the coexistence suite's numbers, the inventory test, and best-effort live Claude Code runs of /devflow:todo with the task tools on and of a user-level hook beside DevFlow's"
    - "Anything a headless run cannot show is handed to `/devflow:verify-work 63` as numbered UAT items"
    - "CHANGELOG [Unreleased], USER-GUIDE and help.md describe the shipped behaviour: the session task list as the todo store, `df-tools todo sync`, the todo-sync hook and its escape, how to turn the task tools on, the coexistence guarantees and the five hook fixes, and the inventory; CLAUDE.md grows by at most one clause"
    - "Full `npm test` passes except failures proven pre-existing on base commit eccc2916"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 63"
    - path: docs/USER-GUIDE.md
      provides: "the todo section, the hooks table row, a coexistence paragraph, a link to the inventory"
  key_links:
    - "doc-refs.repo.test.cjs keeps every /devflow: reference valid; planning-writes.repo.test.cjs audits help.md"
---

# TRD 63-07: Dogfood, document, full suite

<objective>
Close objective 63.

1. **Dogfood** (scratchpad only): observe SC1-SC3 outside the unit tests, with two best-effort live Claude Code runs.
2. **Document**: CHANGELOG, USER-GUIDE, help.md, one CLAUDE.md clause.
3. **Run everything**: full `npm test`, with each failure proven pre-existing on the base commit.

Purpose: the objective's claims are shown and written down. Output: doc edits, the dogfood evidence and UAT list in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- No code, skill or workflow changes except help.md documentation text. A dogfood finding that needs a code fix is a
  Rule 1 deviation: fix it minimally with its test, and list it in the SUMMARY.
- Live runs use a scratch HOME and a scratch project only, never this repo's `.planning/` and never the real
  `~/.claude` (a `--plugin-dir` run fires the checkout's sync-runtime hook, which mirrors into `$HOME/.claude/devflow`).
  Remove every scratch artifact afterwards; `git status --porcelain` in the checkout must show only what it showed before.
- Each live run is tried once (a second try only after a fixable setup mistake). A failure is recorded with its first
  output line and becomes a UAT item; it never blocks the TRD.
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<codebase_examples>
62-10's live-run form and its failure (62-10-SUMMARY D4):
```
HOME=<scratch> CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p --plugin-dir <checkout>/plugins/devflow --output-format stream-json --verbose --dangerously-skip-permissions "/devflow:micro ..."
-> "Not logged in · Please run /login" (a scratch HOME holds no credentials). The init event still listed the plugin
   and, with the variable, TaskCreate, TaskGet, TaskList, TaskStop and TaskUpdate.
```
This time copy `~/.claude.json` (account state) into the scratch HOME before the run; on macOS the OAuth credential
lives in the login keychain, not under HOME, so the run may authenticate. Copying a local file within this machine is
fine. If it still says Not logged in, skip and hand over to UAT.

CHANGELOG [Unreleased] uses `### Added` / `### Changed` / `### Fixed` with wrapped bullets that name the file and the
behaviour (see the gate-bash-writes entry at the top). USER-GUIDE hooks table row form:
```
| `auto-continue.js` | Stop | While a DevFlow skill is active and nothing runs in the background, blocks once ... | `DEVFLOW_SKIP_AUTOCONTINUE=1` |
```
USER-GUIDE already has `### Progress, plan mode and questions` (line ~351) with "Turning the task tools on"
(`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`); link to it rather than repeating it.
</codebase_examples>

<anti_patterns>
- Do not claim the live behaviour in the docs if the live runs were skipped; describe what the tests show and leave the
  rest to UAT.
- Do not grow CLAUDE.md beyond one clause (it is resident in every session); detail goes in USER-GUIDE.
- Do not run `npm test` in a way that touches the real `~/.claude` beyond what the suite already does.
</anti_patterns>

<error_recovery>
- A full-suite failure: do not stash or check out the base in this checkout; run the failing file on the base commit
  in a temporary worktree (`git worktree add <scratch>/base eccc2916`, run `node --test <file>`
  there, then `git worktree remove <scratch>/base`). Pre-existing on base = record it; otherwise fix it.
- doc-refs or planning-writes fails on new doc text: reword (help.md is audited for direct planning-write instructions).
</error_recovery>

</embedded_context>

<context>
@CHANGELOG.md
@docs/USER-GUIDE.md
@plugins/devflow/devflow/workflows/help.md
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-01-SUMMARY.md
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-03-SUMMARY.md
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-05-SUMMARY.md
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-06-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood (scratchpad only)</name>
  <files>(none in the repo: evidence goes in the SUMMARY)</files>
  <action>
Record `git status --porcelain` of the checkout first. Then, writing an evidence table (# | SC | run | result) for the SUMMARY:

- **D1 (SC1, CLI):** make a scratch local-mode git project with `todo-archive-fixtures.cjs` `makeTodoProject({git: true})`
  (via `node -e`, print the root). Write a transcript with `todo-transcript-fixtures.cjs`: one metadata todo created,
  one derived-stem todo created, then the first completed. Run `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <proj> todo sync --transcript <t> --raw`
  three times (with `--dry-run` first): show added/completed on the first real run and nothing on the second; list the files.
- **D2 (SC1, hook):** pipe a Stop payload naming the same kind of transcript into `node <checkout>/plugins/devflow/hooks/todo-sync.js`
  in a fresh scratch project; show the systemMessage, then the silent second Stop.
- **D3 (SC1, live, best effort):** scratch HOME with `~/.claude.json` copied in; scratch DevFlow project as in D1.
  From the project: `HOME=<scratch-home> CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p --plugin-dir <checkout>/plugins/devflow --output-format stream-json --verbose --dangerously-skip-permissions "/devflow:todo add Probe the session todo store" > d3.stream.jsonl`.
  Look for: a TaskCreate tool_use with subject `Todo: ` and `metadata.devflow_todo`, the archive file, the commit.
  Then resume the same session (`-r <session_id>` from the init event) with "Mark the todo task you created completed
  with TaskUpdate, then stop." and look for the todo in `todos/completed/` and the DevFlow systemMessage.
  Also run the 63-01 replay over the D3 transcript (`todo sync --transcript <it> --dry-run --raw`) as a real-host check.
- **D4 (SC2, live, best effort):** same scratch HOME, plus `--settings <scratch>/user-hooks.json` registering a
  user-level Stop hook (a node script printing `{"systemMessage":"user stop hook ran"}`) and a user-level PreToolUse
  `Bash` hook that exits 1 with a stderr line. Prompt: "Run `git status` once with Bash, then stop." Look for: the Bash
  call ran, both systemMessages, and no DevFlow hook error.
- **D5 (SC2, suite):** `node --test plugins/devflow/hooks/hook-coexistence.test.js`: registrations, runs, wall time.
- **D6 (SC3):** `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` and row counts by status
  from the inventory.
- **D7:** this repo: `node plugins/devflow/devflow/bin/df-tools.cjs todo sync --transcript <this executor's own transcript if findable, else skip> --dry-run --raw`
  shows no todo items and nothing planned against the 6 real pending todos.

Write the UAT handoff list for `/devflow:verify-work 63` (interactive, cannot be headless):
1. With `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, `/devflow:todo add <x>` shows a `Todo: <x>` task in the Ctrl+T list and a
   todo file is committed.
2. Asking Claude to finish that todo marks the task completed; when the turn ends the todo is in `todos/completed/`
   and the `DevFlow: todo sync` message shows.
3. `/devflow:todo list` shows the in-session status and commits any sync it made; "Work on it now" puts the todo
   in progress in the task list.
4. Without the variable (the default on newer models), `/devflow:todo add` and `list` behave as before.
5. With the user's own `~/.claude/hooks/guard-kube-context.py` PreToolUse hook active, a session that runs Bash shows
   no DevFlow hook error notice.
Finally restore: remove the scratch HOME, projects and scripts; compare `git status --porcelain` with the first record.
  </action>
  <verify>The SUMMARY has the D1-D7 table with commands and results, the UAT list, and the before/after `git status --porcelain` comparison showing no new changes from the dogfood.</verify>
  <done>Every SC has outside-the-tests evidence or a recorded reason plus a UAT item.</done>
  <recovery>If a live run leaves a process running (`claude` waiting), kill it by PID; if it wrote under the real `~/.claude`, note exactly what in the SUMMARY.</recovery>
</task>

<task type="auto">
  <name>Task 2: Documentation</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md, plugins/devflow/devflow/workflows/help.md</files>
  <action>
**CHANGELOG [Unreleased]:**
- Added: `/devflow:todo` keeps todos in the session task list (TaskCreate/TaskUpdate/TaskList, or TodoWrite with
  `CLAUDE_CODE_ENABLE_TASKS=0`) with the todo files / GitHub issues as the durable archive; `df-tools todo sync
  (--transcript ... | --session <id>)`; `hooks/todo-sync.js` (Stop, `DEVFLOW_SKIP_TODO_SYNC=1`); the hook coexistence
  suite (`hooks/hook-coexistence.test.js`, nine user-hook behaviours, documented composition model);
  `docs/built-in-integration-status.md` and its repo test.
- Changed: `/devflow:todo add` order (session item, then archive) and `list` (sync first, in-session status; "Work on it
  now" completes with the session task when task tools exist); builtin-audit counts `TodoWrite(`; references/built-ins.md §5.
- Fixed: route-intent, changelog-on-tag, gate-interactive, gate-edits and guard-no-progress no longer exit 1 on a
  non-object hook payload (plus any other hook 63-05 fixed).

**USER-GUIDE:** in the todo area (near the command table at line ~186, or a new `### Todos and the session task list`
after `### Progress, plan mode and questions`): how add/list work with and without task tools (link to "Turning the
task tools on"), what the Stop hook does and says, `todo sync` for a manual merge, the commit behaviour (the hook never
commits; `list` commits; store mode queues for gh-flush), the forward-only merge (deleting a session task never removes
an archive todo; completed todos are not reopened), limits (subagent tasks ignored; a shared `CLAUDE_CODE_TASK_LIST_ID`
list: completions of tasks created in another session are not seen). Hooks table: a `todo-sync.js` row. Under
`## Hooks and what they enforce`: a short "Your own hooks" paragraph (they run in parallel with DevFlow's; DevFlow's
hooks exit 0, emit one JSON object or nothing, never `continue: false`, never lift your deny or block; the suite that
checks this). A link to `docs/built-in-integration-status.md`.

**help.md** (Todo Management): `add` also adds a `Todo:` item to the session task list when the session has task tools;
`list` merges the session into the archive first and shows in-session status. Keep the planning-writes wording rules.

**CLAUDE.md:** in the Planning verbs bullet change `todo add|complete` to `todo add|complete|sync` and add the clause
"(`todo sync` merges a session's task-list todos into the archive; the todo-sync Stop hook runs it)". Nothing else.
  </action>
  <verify>`rg -n -e "todo sync" -e "todo-sync" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md plugins/devflow/devflow/workflows/help.md` matches in each; `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes.</verify>
  <done>The shipped behaviour is documented where users and maintainers look; ratchets green.</done>
</task>

<task type="auto">
  <name>Task 3: Full suite</name>
  <files>(none unless a failure needs a fix)</files>
  <action>
Run `npm test`. Record totals (tests, pass, fail, skipped). For each failure, prove pre-existing on `eccc2916` with the
temporary-worktree procedure in error_recovery, or fix it (Rule 1) and re-run. Known pre-existing: MA-7 (doctl).
Run `npm run docs:data` and keep only intended generated changes (if any are tracked). Commit doc changes
(`docs(63-07): ...`) before the SUMMARY.
  </action>
  <verify>`npm test` totals in the SUMMARY; every failure is listed with its base-commit proof.</verify>
  <done>The suite is green apart from proven pre-existing failures.</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- SUMMARY: D1-D7 evidence, UAT list, `npm test` totals with failure provenance, before/after `git status`.
- `rg -n "built-in-integration-status" docs/USER-GUIDE.md CHANGELOG.md` matches.
</verification>

<success_criteria>
- SC1-SC3 are evidenced, documented, and the full suite holds.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-07-SUMMARY.md`
</output>
