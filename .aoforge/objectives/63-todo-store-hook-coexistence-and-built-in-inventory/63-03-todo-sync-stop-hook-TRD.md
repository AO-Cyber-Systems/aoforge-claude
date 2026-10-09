---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "03"
type: standard
wave: 3
depends_on: ["63-02", "63-05"]
files_modified:
  - plugins/devflow/hooks/todo-sync.js
  - plugins/devflow/hooks/todo-sync.test.js
  - plugins/devflow/hooks/hooks.json
  - plugins/devflow/hooks/planning-writes.audit.test.js
  - plugins/devflow/hooks/hook-coexistence.test.js
  - CLAUDE.md
  - scripts/gen-docs-data.cjs
autonomous: true
requirements: [BLTN-04, BLTN-05]
must_haves:
  truths:
    - "At every Stop in a DevFlow project, the session's /devflow:todo items found in the transcript are merged into the archive (local `.planning/todos/`, or queued for the GitHub store) without the user doing anything"
    - "A second Stop over the same transcript changes nothing and prints nothing; a transcript with no todo items is a fast no-op"
    - "The hook never blocks: it never emits `decision` or `continue`, exits 0 on every path, makes no gh call (store writes are queued with noFlush for gh-flush), keeps no state of its own and writes nothing under `.planning/` except todo files through the verbs"
    - "It tells the user what it did in one `systemMessage` (archived / completed counts, uncommitted paths in local mode, queued in store mode, or a failure line) and says nothing when nothing changed"
    - "DEVFLOW_SKIP_TODO_SYNC=1, a non-DevFlow directory, malformed stdin, an unreadable transcript or a missing bundled library all produce no output and exit 0"
    - "It is registered on Stop, documented in CLAUDE.md's hook inventory, and covered by the planning-writes audit and the 63-05 coexistence matrix"
  artifacts:
    - path: plugins/devflow/hooks/todo-sync.js
      provides: "Stop hook; exports run(payload, {env, pluginRoot}) -> output object | null"
    - path: plugins/devflow/hooks/hooks.json
      provides: "Stop group gains `node ${CLAUDE_PLUGIN_ROOT}/hooks/todo-sync.js`"
  key_links:
    - "todo-sync.js -> <pluginRoot>/devflow/bin/lib/todo-sync.cjs syncTodos(cwd, {transcripts: [transcript_path], sessionId, noFlush: true}) in-process (63-02)"
    - "todo-sync.js -> <pluginRoot>/devflow/bin/lib/planning-mode.cjs resolveMainRoot for the DevFlow-project check"
    - "hook-inventory.test.cjs pins the CLAUDE.md bullet; planning-writes.audit.test.js and hook-coexistence.test.js pin the RUNS entries"
---

# TRD 63-03: The todo-sync Stop hook (BLTN-04, part 3)

<objective>
Run the 63-02 merge at every Stop, so todos added or completed through the session task list reach the durable
archive without a command.

```
DEVFLOW_SKIP_TODO_SYNC=1                          -> exit, no output
stdin JSON not a plain object                     -> exit
hook_event_name !== 'Stop'                        -> exit
transcript_path not a non-empty string            -> exit
cwd = payload.cwd || process.cwd(); resolveMainRoot(cwd) null (not a DevFlow project) -> exit
text = read transcript (error -> exit)
prefilter: text has '"TaskCreate"' | '"TaskUpdate"' | '"TodoWrite"'  AND  ('Todo: ' | 'devflow_todo')  else exit
r = syncTodos(cwd, { transcripts: [transcript_path], sessionId: payload.session_id, noFlush: true })
lines:  r.added.length      -> `todo sync: archived N todo(s) from this session`
        r.completed.length  -> `todo sync: completed N todo(s)`
        local && r.pending_commit.length -> `todo sync: not committed yet: <paths> (/devflow:todo list commits them)`
        store && writes queued -> `todo sync: queued for GitHub; gh-flush sends them`
        !r.ok -> `todo sync failed: <first warning>; nothing is lost, the session task list still holds them`
emit { systemMessage: lines.map(l => `DevFlow: ${l}`).join('\n') } only when lines is non-empty
```
Runs on `stop_hook_active` too (idempotent and cheap). Not on SessionEnd: its hooks get 1.5 s by default and "Timeouts
set on plugin-provided hooks don't" raise that budget, so a store-mode sync could be cut mid-write; Stop already runs
after every completed turn. Not on SubagentStop: subagents do not own todos.

Purpose: SC1's "a Stop-hook sync merges them into a durable archive".
Output: the hook, its tests, its registration and the three inventory/audit entries every new hook needs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Pattern: `gh-flush.js` (bundled libs resolved from `CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..')`, in-process
  `require`, top-level try/catch, `process.exitCode = 0`). Require the libs only after the cheap exits.
- Never a `decision`, `continue` or `stopReason` key; `auto-continue.js` owns the one Stop block.
- No state file, no dotfile anywhere under `.planning/`; no detached child; no spawn of gh or df-tools.
- The three entries are not optional: a hook registered without a CLAUDE.md bullet fails `hook-inventory.test.cjs`,
  without an audit RUNS entry fails `planning-writes.audit.test.js` test 10a, without a coexistence RUNS entry fails
  `hook-coexistence.test.js` test 9. Add them in this TRD, in the same commit as the registration.
- Fixtures: reuse `todo-transcript-fixtures.cjs` (63-01) and `todo-archive-fixtures.cjs` (63-02); add no new builders.
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<codebase_examples>
gh-flush.js shape to follow (trimmed):
```js
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function parsePayload(text) {
  try { const p = JSON.parse(text); return p !== null && typeof p === 'object' && !Array.isArray(p) ? p : null; }
  catch { return null; }
}
function emit(isStop, lines) {
  if (lines.length === 0) return;
  const text = lines.map((l) => `DevFlow: ${l}`).join('\n');
  process.stdout.write(`${JSON.stringify(isStop ? { systemMessage: text } : { ... })}\n`);
}
function main() {
  if (process.env.DEVFLOW_SKIP_GH_FLUSH_HOOK === '1') return;
  const payload = parsePayload(readStdin()); if (!payload) return;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  const lib = path.join(pluginRoot, 'devflow', 'bin', 'lib');
  const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd();
  const planningMode = require(path.join(lib, 'planning-mode.cjs'));
  ...
}
if (require.main === module) {
  try { main(); } catch { /* fail open: a hook must never block the developer */ }
  process.exitCode = 0;
}
```
CLAUDE.md `### Hooks` → `**Observability (warn-only):**` bullet style (the gh-flush line):
```
- `gh-flush.js` — PostToolUse(Bash) + Stop; store mode only: flushes the outbox after `df-tools commit` and at Stop, reports pending/halted writes on both and cache drift (W055) at Stop only; never blocks, fails open. Escape: `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`
```
planning-writes.audit.test.js RUNS entry shape (the transcript goes in the world's home):
```js
'gh-flush.js': [
  { label: 'session stop', payload: stop() },
],
```
gen-docs-data.cjs HOOK_DOCS row shape: `'<file>': ['<Group>', '<purpose>', '<escape or null>']`.
</codebase_examples>

<anti_patterns>
- Do not shell out to `df-tools todo sync`: an extra node start per Stop for nothing; call the library.
- Do not read the transcript twice to save a require: the prefilter read is the cheap exit; `syncTodos` reads again only
  when there is something to do (5 MB transcripts read in ~4 ms on this machine).
- Do not flush the outbox here. gh-flush runs at the same Stop (in parallel) and after each `df-tools commit`.
- Do not commit. A commit at an arbitrary Stop can trigger a signing prompt; the list flow commits (63-04).
</anti_patterns>

<error_recovery>
- planning-writes audit fails on `todo-sync.js` with a dotfile diff: something in the merge path writes a runtime
  dotfile under `.planning/`; find it (likely a lib cache) and move it out of the repo or remove it; never extend the allowlist.
- The coexistence matrix shows output differing between solo and paired runs: the message includes a temp path that
  differs per world; give the RUNS entry a `normalize` that replaces the world root, with a comment.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/hooks/gh-flush.js
@plugins/devflow/hooks/hooks.json
@plugins/devflow/devflow/bin/lib/todo-sync.cjs
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-02-SUMMARY.md
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-05-SUMMARY.md
</context>

## Test list

Outermost first: the hook spawned as Claude Code runs it (stdin JSON, temp world, hermetic env), then `run()`.

1. Local-mode git project, archive empty, transcript with a metadata todo (`Todo: Add auth token refresh`) pending:
   exit 0, stdout one JSON object `{systemMessage}` naming `archived 1` and the uncommitted
   `.planning/todos/pending/<stem>.md`; the file exists with 63-02's text.
2. Same payload again: exit 0, no stdout, file bytes and mtime unchanged.
3. Archive has the stem pending, the transcript completes it: message says `completed 1`; the todo is in `todos/completed/`.
4. Transcript with only progress tasks (`Plan: X`, `Micro: y`) and no `Todo: ` text: no stdout, nothing written
   (`git status --porcelain` empty).
5. Not a DevFlow project (no `.planning/` up the tree): no stdout.
6. `DEVFLOW_SKIP_TODO_SYNC=1`: no stdout, nothing written.
7. stdin `''`, `'{bad'`, `'null'`, `'[]'`; `transcript_path` missing, `7`, or a path that does not exist;
   `hook_event_name: 'SubagentStop'`: exit 0, no stdout.
8. `CLAUDE_PLUGIN_ROOT` pointing at a directory without `devflow/bin/lib/todo-sync.cjs`: exit 0, no stdout.
9. Store-mode project (`makeStoreProject({store: true})`, `hermeticEnv`, a `gh` shim first on PATH that records any
   call and exits 1): the cache file is written, the outbox journal holds the upsert for `todo-<stem>`, the message
   says `queued`, and the shim recorded no call.
10. `stop_hook_active: true` behaves like false (still merges once, still idempotent).
11. Every output in 1-10 has no `decision`, `continue` or `stopReason` key.
12. Registration: hooks.json Stop group lists `node ${CLAUDE_PLUGIN_ROOT}/hooks/todo-sync.js`; `hook-inventory.test.cjs`,
    `planning-writes.audit.test.js` and `hook-coexistence.test.js` pass with the new entries.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: todo-sync.js (RED then GREEN)</name>
  <files>plugins/devflow/hooks/todo-sync.test.js, plugins/devflow/hooks/todo-sync.js</files>
  <action>
RED: tests 1-11 in `todo-sync.test.js`. Spawn `process.execPath [hooks/todo-sync.js]` with `input:
JSON.stringify(payload)`, `cwd` the fixture project, env `{PATH, HOME: <temp>, CLAUDE_PLUGIN_ROOT: <repo plugins/devflow>}`
(+ hermeticEnv's vars for test 9). Build projects with `todo-archive-fixtures.cjs` (`git: true` for 1-3) and
transcripts with `todo-transcript-fixtures.cjs`. Commit failing.

GREEN: write the hook per the objective's pseudocode with a header comment in gh-flush's style (what, when, the cheap
exits, never blocks, no state, why not SessionEnd/SubagentStop, the escape). Export `run(payload, {env, pluginRoot})`
returning the output object or null; `main()` reads stdin, calls `run`, writes the JSON line. Detect queued store
writes from the result (`r.mode === 'store'` and `r.added.length + r.completed.length > 0`). Commit GREEN.
  </action>
  <verify>`node --test plugins/devflow/hooks/todo-sync.test.js` passes; `rg -n "decision|continue:|stopReason|spawn|exec(File)?Sync" plugins/devflow/hooks/todo-sync.js` finds only comments.</verify>
  <done>Tests 1-11 pass; the hook merges, reports once, and is silent and harmless on every other path.</done>
</task>

<task type="auto">
  <name>Task 2: Register the hook and add its inventory, audit and coexistence entries</name>
  <files>plugins/devflow/hooks/hooks.json, plugins/devflow/hooks/planning-writes.audit.test.js, plugins/devflow/hooks/hook-coexistence.test.js, CLAUDE.md, scripts/gen-docs-data.cjs</files>
  <action>
1. hooks.json: append `{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/todo-sync.js" }` to the
   existing Stop group's `hooks` array (after gh-flush). No matcher, no timeout field (consistent with the others).
2. planning-writes.audit.test.js `RUNS`: `'todo-sync.js': [{ label: 'session todo archived and completed', payload: (ctx) => ... }]`
   where the payload is `stop()` with `transcript_path` set to a transcript the entry writes into `ctx.world.home`
   (one metadata todo created and completed, via `todo-transcript-fixtures.cjs`). No `expectChanged` (it must change
   no dotfile). Add a comment like the gh-flush one: what it writes (todo files, not dotfiles) and that it keeps no state.
3. hook-coexistence.test.js `RUNS`: `'todo-sync.js@Stop'` with the same kind of transcript in the world home, so its
   solo output is the `archived` message; add `normalize` only if the message carries a world-specific path.
4. CLAUDE.md `### Hooks`, under `**Observability (warn-only):**` after the gh-flush bullet, ONE line:
   ``- `todo-sync.js` — Stop; merges the session's `/devflow:todo` items (TaskCreate/TaskUpdate or TodoWrite calls in the transcript) into the todo archive with `todo sync`'s library (`.planning/todos/`, or queued for the GitHub store); idempotent, never blocks, keeps no state, fails open. Escape: `DEVFLOW_SKIP_TODO_SYNC=1` ``
5. scripts/gen-docs-data.cjs HOOK_DOCS: `'todo-sync.js': ['Observability', '<one or two sentences, same facts>', 'DEVFLOW_SKIP_TODO_SYNC=1']`.
Commit (`feat(63-03): register the todo-sync Stop hook`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs` passes; `node scripts/gen-docs-data.cjs` runs without error (revert any generated data files it writes if they are tracked and unrelated, or keep them if the repo tracks them as generated output; check `git status`).</verify>
  <done>The hook fires on Stop, and every inventory, audit and coexistence check knows about it.</done>
  <recovery>If `node scripts/gen-docs-data.cjs` rewrites tracked site data, run `git diff --stat` and keep only the todo-sync change, restoring the rest with `git checkout -- <file>` per file.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/hooks/todo-sync.test.js</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/todo-sync.test.js plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` green.
- `rg -n "todo-sync.js" plugins/devflow/hooks/hooks.json CLAUDE.md scripts/gen-docs-data.cjs` matches in each.
</verification>

<success_criteria>
- Todos the session adds or completes are in the archive after the turn ends, every time, once.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-03-SUMMARY.md`
</output>
