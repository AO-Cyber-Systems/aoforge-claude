---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/todo-session.cjs
  - plugins/devflow/devflow/bin/lib/todo-session.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/task-tools.cassette.jsonl
  - plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/todowrite.cassette.jsonl
autonomous: true
requirements: [BLTN-04]
must_haves:
  truths:
    - "replayTranscript(text) turns a Claude Code session transcript into the session's todo items, from both task-list families: TaskCreate/TaskUpdate (the default) and TodoWrite (CLAUDE_CODE_ENABLE_TASKS=0)"
    - "An item is a DevFlow todo when its TaskCreate metadata carries devflow_todo or its subject/content starts with `Todo: `; flow progress tasks (`Plan: ...`, `Micro: ...`) are never items"
    - "Every item has a stable stem: metadata devflow_todo, else a `[todo:<stem>]` suffix, else `<UTC date of the record>-<slug(title)>`, the same naming `todo add` uses, so replaying the same transcript twice yields identical items"
    - "Only tool calls with a non-error result are applied: a disabled-tool error, a use with no result yet (transcript cut at Stop), sidechain records and unknown task ids are counted in stats and never become or change items"
    - "replayTranscript never throws, on any string input"
    - "The record shapes are checked against the real host: either recorded cassettes from a live `claude -p` run replay to the expected items, or the SUMMARY records why the capture was skipped"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/todo-session.cjs
      provides: "TODO_PREFIX, STEM_RE, parseTodoSubject, formatTodoSubject, deriveStem, replayTranscript (pure, no fs)"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs
      provides: "hand-built record builders: assistantToolUse, userToolResult, taskCreate, taskCreateDisabled, taskUpdate, todoWrite, userText, assistantText, transcriptOf, T0"
    - path: plugins/devflow/devflow/bin/lib/todo-session.test.cjs
      provides: "the replay contract tests (cassettes when present, then hand-built cases)"
  key_links:
    - "deriveStem -> helpers.cjs generateSlugInternal + the UTC date of the record, matching planning-entity-verbs todoAdd's `${dateOf(now)}-${generateSlugInternal(title)}`"
    - "TRD 63-02 (todo-sync.cjs) consumes replayTranscript items; TRD 63-04's flows write `Todo: <title>` subjects with metadata {devflow_todo: <stem>} and `[todo:<stem>]` TodoWrite suffixes that this parser reads"
---

# TRD 63-01: Session todo replay (BLTN-04, part 1)

<objective>
Read a Claude Code session transcript and return the session's todo items, so the Stop-hook sync (63-02, 63-03) can
merge them into the durable archive without losing or duplicating any.

DevFlow cannot ask Claude Code for the session task list from a hook: the docs give hooks only `transcript_path` and
`session_id`, and the on-disk task store (`~/.claude/tasks/<list-id>/`) is undocumented and absent on this machine.
The transcript is documented enough and already parsed by DevFlow (`session-audit.cjs`, `token-usage.cjs`): every
`TaskCreate`, `TaskUpdate` and `TodoWrite` call is an assistant `tool_use` block, and its result (with the assigned
task id) is on the next user record. Replaying those pairs gives the session list exactly.

Purpose: one pure, deterministic parser that both the hook and the CLI share. Identity (the stem) is decided here, so
idempotency of the whole sync rests on this TRD.
Output: `todo-session.cjs`, its tests, hand-built record builders and (best effort) two recorded cassettes from the
real host.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── todo-session.cjs                               ← CREATE
├── todo-session.test.cjs                          ← CREATE
└── __fixtures__/
    ├── todo-transcript-fixtures.cjs               ← CREATE
    └── todo-transcripts/
        ├── task-tools.cassette.jsonl              ← CREATE (only if the live capture succeeds)
        └── todowrite.cassette.jsonl               ← CREATE (only if the live capture succeeds)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Pure library: no `fs`, no spawn, no stdout in `todo-session.cjs`. It takes transcript TEXT. Reading files is 63-02's job.
- CommonJS, synchronous, Node built-ins only. Tests use `node:test` + `node:assert/strict`, adjacent `.test.cjs`.
- Fixtures are hand-built factory functions (constraint `no_llm_test_data`). The two cassettes are recordings of the
  real host (allowed as recorded cassettes) and are trimmed and sanitized, never edited to change behaviour.
- No property-based testing libraries (`no_property_based_default`); descriptive `test('...')` names, no `.feature` files.
- One plain command per Bash call (the worktree guard refuses compound commands it cannot verify).
- Never use port 8080 for anything.

<embedded_context>

<research_context>
Host contract, from the Claude Code docs (fetched 2026-10-06, Claude Code 2.1.292) and this machine's transcripts:

**Tool inputs** (Agent SDK TypeScript reference, "Tool Input Types"):
```typescript
type TaskCreateInput = { subject: string; description: string; activeForm?: string; metadata?: Record<string, unknown> };
type TaskUpdateInput = { taskId: string; status?: "pending" | "in_progress" | "completed" | "deleted";
  subject?: string; description?: string; activeForm?: string; addBlocks?: string[]; addBlockedBy?: string[];
  owner?: string; metadata?: Record<string, unknown> };
type TodoWriteInput = { todos: Array<{ content: string; status: "pending" | "in_progress" | "completed"; activeForm: string }> };
```
**Tool outputs** ("Tool Output Types"): `TaskCreateOutput = { task: { id: string; subject: string } }`;
`TaskUpdateOutput = { success: boolean; taskId: string; updatedFields: string[]; error?: string; statusChange?: { from: string; to: string } }`;
`TodoWriteOutput = { oldTodos: [...]; newTodos: [...] }`.

**Todo-tracking guide:** "The assigned task ID isn't in the `TaskCreate` input. Claude Code delivers each tool's
structured output on the user message that carries its `tool_result` block, in the `tool_use_result` field." And:
"Claude Code repairs some close-but-incorrect key names before execution, mapping `id` or `task_id` to `taskId` and
`active_form` to `activeForm`, but that repair is not reflected in the stream. Read `TaskUpdate` input fields
defensively." Deletion is `TaskUpdate` with `status: "deleted"`.

**Availability:** since v2.1.268 the task-tracking tools (`TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList`,
`TodoWrite`) are provided by default only on Claude 3.x, Opus 4-4.7, Sonnet 4-4.6 and Haiku 4.5. Elsewhere set
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, or name a task tool in `--allowedTools`. Wherever they exist you get the four
Task tools, or `TodoWrite` instead with `CLAUDE_CODE_ENABLE_TASKS=0`. A skill's `allowed-tools` does NOT opt in:
transcript `db5a1b3b…jsonl` (2.1.288) shows the build skill's `allowedTools` listing TaskCreate, and the next
TaskCreate failing "No such tool available: TaskCreate. TaskCreate is disabled for this session".

**Stop hook caveat** (hooks reference): "the transcript file isn't guaranteed to include the final message at Stop
time on all versions." A tool call's result line may therefore be missing at a given Stop; the next Stop sees it.
</research_context>

<codebase_examples>
Real transcript JSONL lines on this machine (keys `toolUseResult` camelCase in the file; the SDK stream calls the
same object `tool_use_result`). Trimmed from `~/.claude/projects/-Users-justin-dev-devflow-claude/db5a1b3b-b666-49ba-baf0-9d5728ce9908.jsonl`:

```json
{"type":"assistant","isSidechain":false,"timestamp":"2026-10-06T18:52:21.699Z","sessionId":"db5a1b3b-…","version":"2.1.288",
 "message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01F9VHgixjcfZCBoEezaDiJi","name":"TaskCreate",
 "input":{"subject":"Plan Objective 61","description":"Creating TRDs for Objective 61: …","activeForm":"Planning Objective 61"},
 "caller":{"type":"direct"}}]}}
{"type":"user","isSidechain":false,"timestamp":"2026-10-06T18:52:21.701Z","sessionId":"db5a1b3b-…","version":"2.1.288",
 "toolUseResult":"Error: No such tool available: TaskCreate. TaskCreate is disabled for this session, in subagents as well as here.",
 "message":{"role":"user","content":[{"type":"tool_result","content":"<tool_use_error>Error: No such tool available: TaskCreate. …</tool_use_error>",
 "is_error":true,"tool_use_id":"toolu_01F9VHgixjcfZCBoEezaDiJi"}]}}
```
Other record types in the same file (`attachment`, `system`, plain user text, assistant text) carry no task calls and
are skipped. Subagent records may appear with `isSidechain: true`.

The naming `todo add` uses (`planning-entity-verbs.cjs`):
```js
function dateOf(now) { return (Number.isFinite(now) ? new Date(now) : new Date()).toISOString().split('T')[0]; }
const stem = o.stem !== undefined && o.stem !== null ? cleanStem(o.stem)
  : `${dateOf(o.now)}-${generateSlugInternal(title || '') || 'todo'}`;
// helpers.cjs
function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```
Transcript-reading precedent (session-audit.cjs): split on `\n`, skip blank lines, `try { JSON.parse } catch { continue }`.
</codebase_examples>

<anti_patterns>
- Do not read `~/.claude/tasks/` or `~/.claude/todos/`: undocumented, absent on this machine, and keyed by list ids
  that `CLAUDE_CODE_TASK_LIST_ID` can share across sessions.
- Do not apply a tool call on its `tool_use` alone. The id of a created task exists only in the result, and an
  errored or missing result means the call did not take effect (or not yet).
- Do not key identity on the task id across sessions: ids are per task list. The stem is the identity.
- Do not use "now" for a derived stem. Use the record's timestamp, so replaying on a later day gives the same stem.
- Do not guess a text format for the TaskCreate result. Use the structured result; add a text fallback only if the
  live cassette shows the result text and its id format.
</anti_patterns>

<error_recovery>
- `claude -p` answers `Not logged in` / errors on quota / the tools do not appear in the init event: record the exact
  first line in the SUMMARY, create no cassette files, and continue with the hand-built tests (the cassette tests skip
  when the files are absent). Do not retry more than once.
- The model in the probe run does something other than asked (extra tasks, different subjects): keep the recording if
  it still contains at least one marked TaskCreate with a result and one TaskUpdate to completed; otherwise re-run
  once with the same prompt, then fall back as above.
- The transcript of the probe run is not where expected: `ls ~/.claude/projects/*/<session_id>.jsonl` (the glob
  expands to full paths, so directory names starting with `-` are safe).
</error_recovery>

</embedded_context>

<context>
@.planning/ROADMAP.md
@plugins/devflow/devflow/bin/lib/session-audit.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

## Test list

Outermost first. Every case is a named `test('...')` in `todo-session.test.cjs`.

Host contract (cassettes; each test skips with a reason when its cassette file is absent):
1. `task-tools.cassette.jsonl` replays to exactly one todo item, title `Probe alpha`, stem `2026-10-06-probe-alpha`
   (stem_source `metadata`), status `completed`; the unmarked `Plan: probe beta` task is not an item.
2. `todowrite.cassette.jsonl` replays to one todo item, title `Probe gamma`, stem `2026-10-06-probe-gamma` (stem_source
   `subject`), status `completed`; `Plan: probe delta` is not an item.

Task tools (hand-built):
3. A TaskCreate with `metadata.devflow_todo` and subject `Todo: Add auth token refresh` gives one item, stem from the
   metadata, status `pending`, `task_id` from the result, `created_at` the result record's timestamp.
4. A TaskCreate `Todo: Fix the modal z-index` with no metadata gives stem `<UTC date of T0>-fix-the-modal-z-index`,
   stem_source `derived`; replaying the same text a second time gives deep-equal items.
5. Non-todo TaskCreates (`Plan: X`, `Micro: fix typo`, `todo: lowercase prefix`) give no items.
6. TaskUpdate `in_progress` then `completed` moves the item to `completed`; `updated_at` is the last applied result's timestamp.
7. TaskUpdate input keyed `id`, keyed `task_id`, and a numeric id (`3` vs `"3"`) are all applied.
8. TaskUpdate `deleted` sets status `deleted` (the item stays in the output, flagged).
9. A TaskUpdate subject change keeps the item's stem and title as created (renames never change identity).
10. A TaskUpdate for an id no TaskCreate in this transcript produced is ignored; `stats.unknown_task_updates` is 1.
11. The disabled-tool TaskCreate shape (is_error result) gives no item; `stats.errors_skipped` is 1.
12. A TaskCreate whose result line is missing (cut transcript) gives no item and a TaskUpdate without a result is not
    applied; `stats.unresolved_uses` counts both.
13. Records with `isSidechain: true` are ignored; `stats.sidechain_skipped` counts their task calls.
14. An invalid metadata stem (`../etc`, `x/y`, empty) falls back to the subject suffix, then to the derived stem.

TodoWrite (hand-built):
15. A snapshot with `Todo: Probe gamma [todo:2026-10-06-probe-gamma]` pending gives an item with that stem; a later
    snapshot with the same content `completed` completes it.
16. The `newTodos` of the result is used when present; `input.todos` when the result has none.
17. An item present in one snapshot and absent from the next becomes `deleted`.
18. Content without a suffix gets a derived stem from the timestamp of the first snapshot that contained it.
19. A content rename that keeps the `[todo:<stem>]` suffix is the same item (title updated, stem kept).

Both, and robustness:
20. A transcript with both families gives items from each, in order of first appearance.
21. `replayTranscript` never throws and returns `{items: [], stats}` for `''`, `'null'`, `'[]'`, non-JSON lines,
    records with no `message`, `message.content` a string, tool_use blocks with `input: null`.

Subject grammar:
22. `parseTodoSubject('Todo: Add X')` → `{title: 'Add X', stem: null}`; with ` [todo:2026-10-06-add-x]` → stem set
    and title without the suffix; `'Plan: Y'`, `'Todo:'`, `'Todo:  '` → null; `formatTodoSubject('Add X',
    '2026-10-06-add-x')` round-trips through `parseTodoSubject`.
23. `deriveStem('Add auth token refresh', '2026-10-06T23:59:59.000Z')` is `2026-10-06-add-auth-token-refresh`, equal to
    `todoAdd`'s naming for the same title and UTC instant; a title with no slug characters gives `<date>-todo`.

<tasks>

<task type="auto">
  <name>Task 1: Record the host contract and build the transcript fixture builders</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/task-tools.cassette.jsonl, plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/todowrite.cassette.jsonl</files>
  <action>
**1a. Live capture (best effort, scratchpad only).** Make an empty scratch directory under the session scratchpad
(e.g. `<scratchpad>/todo-contract`). From that directory, run ONE plain command per Bash call:

```
CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p "Use TaskCreate to create two tasks. First: subject 'Todo: Probe alpha', description 'contract probe', metadata {\"devflow_todo\": \"2026-10-06-probe-alpha\"}. Second: subject 'Plan: probe beta', description 'progress probe'. Then use TaskUpdate to set the first task to completed, using the id TaskCreate returned. Then call TaskList. Do nothing else." --model sonnet --max-turns 8 --output-format stream-json --verbose --allowedTools "TaskCreate,TaskUpdate,TaskList" > task-tools.stream.jsonl
```
then the TodoWrite family:
```
CLAUDE_CODE_ENABLE_TASKS=0 CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p "Use TodoWrite to write a list of two items: content 'Todo: Probe gamma [todo:2026-10-06-probe-gamma]' status pending activeForm 'Probing gamma', and content 'Plan: probe delta' status in_progress activeForm 'Planning delta'. Then call TodoWrite again with the same two items and the first one completed. Do nothing else." --model sonnet --max-turns 8 --output-format stream-json --verbose --allowedTools "TodoWrite" > todowrite.stream.jsonl
```
Use the real HOME and NO `--plugin-dir` (a scratch HOME is not logged in, see 62-10 D4; the installed plugin's hooks
are no-ops in a non-DevFlow directory). If the CLI rejects the comma list, pass the tool names as separate arguments
at the END of the command. Take `session_id` from the stream's `{"type":"system","subtype":"init"}` line, and check
that its `tools` list includes the tools asked for. Find the transcript with `ls ~/.claude/projects/*/<session_id>.jsonl`.

Write a small extraction script in the scratchpad (not the repo). It keeps, in file order, only the assistant records
with a `tool_use` block named TaskCreate, TaskUpdate, TaskList or TodoWrite (content reduced to those blocks) and the
user records carrying their `tool_result` (content reduced to those blocks, `toolUseResult` kept). Per record keep
only `type`, `isSidechain`, `timestamp`, `sessionId`, `version`, `message.{role,content}`, `toolUseResult`. Sanitize:
`sessionId` → `cassette-session`, every occurrence of the scratch path → `/tmp/todo-contract`, of `$HOME` → `/home/user`.
Write the results to `__fixtures__/todo-transcripts/task-tools.cassette.jsonl` and `todowrite.cassette.jsonl`. Record
in the SUMMARY: Claude Code version, the init `tools` list for each run, the exact result shape seen for TaskCreate
(`toolUseResult` keys, and the tool_result text), and anything that differs from the documented types above. If the
TaskCreate result text carries the id (for example `Task #1 created …`), note the exact form: Task 2 may then add a
text fallback for that form only.

If either run fails, follow error_recovery: no cassette file for that family, and the SUMMARY says why.

**1b. Fixture builders** (`todo-transcript-fixtures.cjs`, hand-built, deterministic):
```
T0 = Date.UTC(2026, 9, 6, 12, 0, 0)            // fixed clock; ts(n) = new Date(T0 + n*1000).toISOString()
assistantToolUse({id, name, input, ts, sidechain=false})        -> assistant record with one tool_use block
userToolResult({toolUseId, ts, content='ok', isError=false, toolUseResult, sidechain=false}) -> user record
taskCreate({subject, description='', activeForm, metadata, taskId, ts, toolUseId, withResult=true}) -> [use, result]
    // result.toolUseResult = { task: { id: String(taskId), subject } }
taskCreateDisabled({subject, ts}) -> [use, result]              // the observed is_error shape and string toolUseResult
taskUpdate({taskId, status, idKey='taskId', subject, ts, withResult=true}) -> [use, result]
    // input[idKey] = taskId; result.toolUseResult = { success: true, taskId: String(taskId), updatedFields: [...], statusChange }
todoWrite({todos, oldTodos=[], ts, resultHasNewTodos=true}) -> [use, result]
userText(text, ts) / assistantText(text, ts) / attachment(ts)    -> noise records
transcriptOf(...groups) -> JSONL text (flatten, JSON.stringify per line, '\n' joined, trailing '\n')
CASSETTES = { taskTools: <abs path>, todoWrite: <abs path> }     // with a provenance comment: how and when recorded
```
Tool-use ids are deterministic (`toolu_fixture_<n>` from a module counter reset by `resetIds()`).
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs'); const t=f.transcriptOf(f.taskCreate({subject:'Todo: A',taskId:1,ts:f.ts(1)})); console.log(t.split('\n').filter(Boolean).length)"` prints `2`. If cassettes were written: `rg -c '"TaskCreate"' plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/task-tools.cassette.jsonl` is at least 1 and `rg -n '/Users/' plugins/devflow/devflow/bin/lib/__fixtures__/todo-transcripts/` prints nothing.</verify>
  <done>The builders produce records in the exact transcript shape; the cassettes exist (sanitized, only task-call records) or the SUMMARY records why the live capture was skipped, with the observed result shapes noted either way.</done>
  <recovery>If the live runs leave files outside the scratchpad, remove them. Nothing in the repo is touched by 1a except the two cassette files.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: replayTranscript and the todo subject grammar (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/todo-session.test.cjs, plugins/devflow/devflow/bin/lib/todo-session.cjs</files>
  <action>
RED: write every test in the Test list (cassette tests skip with `t.skip('cassette not recorded')` when the file is
absent), run them, commit the failing suite (`test(63-01): ...`).

GREEN: implement `todo-session.cjs`:

```
TODO_PREFIX = 'Todo: '                 // case-sensitive
STEM_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
SUFFIX_RE = /\s*\[todo:([^\]\s]+)\]\s*$/

parseTodoSubject(s): string? starts with TODO_PREFIX? rest = s.slice(prefix).trim()
   suffix match -> stem = m[1] if STEM_RE else null; title = rest minus suffix, trimmed
   title === '' -> null; return {title, stem}
formatTodoSubject(title, stem?) -> stem ? `Todo: ${title} [todo:${stem}]` : `Todo: ${title}`
deriveStem(title, iso) -> `${iso.slice(0,10)}-${generateSlugInternal(title) || 'todo'}` (null when iso is not a date)

replayTranscript(text, opts = {}):
  stats = {records, task_creates, task_updates, todowrites, unknown_task_updates, errors_skipped,
           unresolved_uses, sidechain_skipped, malformed_lines}
  pending = Map<toolUseId, {name, input, ts}>
  tasks = Map<taskId, task>        // every created task, todo or not
  todoWriteItems = Map<key, item>  // key = stem (suffix) or content
  for each line: parse (catch -> malformed_lines++); not an object -> skip
    content = rec.message && Array.isArray(rec.message.content) ? ... : skip
    if rec.isSidechain === true: count task-call blocks into sidechain_skipped; continue
    assistant: tool_use blocks named TaskCreate|TaskUpdate|TodoWrite -> pending.set(block.id, {name, input: obj(block.input), ts: rec.timestamp})
    user: tool_result blocks with pending tool_use_id:
      use = pending.get(id); pending.delete(id)
      if block.is_error === true -> errors_skipped++; continue
      structured = rec.toolUseResult ?? rec.tool_use_result   (object only)
      TaskCreate: taskId = structured?.task?.id (String) else (fallback only if Task 1 recorded one) else unresolved
                  meta = use.input.metadata?.devflow_todo; parsed = parseTodoSubject(use.input.subject)
                  todo = (typeof meta === 'string') || parsed !== null
                  stem = STEM_RE.test(meta) ? meta : parsed?.stem ?? deriveStem(title, rec.timestamp)
                  stem_source = 'metadata' | 'subject' | 'derived'
                  title = parsed?.title ?? String(use.input.subject || '').trim()
                  tasks.set(taskId, {todo, item: {key:`task:${taskId}`, source:'task', task_id, title, stem, stem_source,
                            status:'pending', description: use.input.description || null, created_at: ts, updated_at: ts}})
      TaskUpdate: id = input.taskId ?? input.id ?? input.task_id (String); task = tasks.get(id)
                  missing -> unknown_task_updates++; status in the 4 values -> item.status = status; updated_at = ts
      TodoWrite: list = Array.isArray(structured?.newTodos) ? structured.newTodos : input.todos (array) else []
                  seen = set; for each entry with parseTodoSubject(content) !== null:
                    key = parsed.stem ?? content; item = todoWriteItems.get(key) ?? new item (stem = parsed.stem ??
                    deriveStem(parsed.title, ts), stem_source 'subject'|'derived', created_at ts)
                    item.title = parsed.title; item.status = entry.status; item.updated_at = ts; seen.add(key)
                  every existing key not in seen and not already deleted -> status 'deleted', updated_at ts
  unresolved_uses = pending.size at the end
  items = todo tasks' items + TodoWrite items, ordered by created_at then insertion; return {items, stats}
```
Wrap the whole body so that any unexpected throw returns `{items: [], stats}` with `stats.error` set (never throws).
Export `TODO_PREFIX, STEM_RE, parseTodoSubject, formatTodoSubject, deriveStem, replayTranscript`.

Commit GREEN (`feat(63-01): ...`). Refactor only with the suite green.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` passes (cassette tests pass, or skip only when their file is absent); `node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs` still passes.</verify>
  <done>All Test list cases pass; RED and GREEN are separate commits; the module has no fs/child_process import (`rg -n "require\\('(fs|child_process)'\\)" plugins/devflow/devflow/bin/lib/todo-session.cjs` prints nothing).</done>
  <recovery>If a cassette disagrees with the documented types (for example the id is numeric, or the result is only text), the cassette wins: adapt the reader, keep a hand-built test for the documented shape too, and record the difference in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/todo-session.test.cjs` green.
- Replaying any fixture transcript twice gives deep-equal output (test 4).
- The SUMMARY's host-contract section names the Claude Code version and either the recorded cassettes or the skip reason.
</verification>

<success_criteria>
- One pure parser yields stable-stem todo items from both task-list families, ignores everything that did not take effect, and never throws.
- The record shapes it relies on are checked against a real recording, or the gap is written down for 63-07 and UAT.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-01-SUMMARY.md`
</output>
