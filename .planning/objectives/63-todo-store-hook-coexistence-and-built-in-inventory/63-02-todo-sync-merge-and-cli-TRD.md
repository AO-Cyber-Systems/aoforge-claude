---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "02"
type: standard
wave: 2
depends_on: ["63-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/todo-sync.cjs
  - plugins/devflow/devflow/bin/lib/todo-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [BLTN-04]
must_haves:
  truths:
    - "`df-tools todo sync --transcript <path>` (or `--session <id>`) merges the session's todo items into the durable archive through the existing `todo add` / `todo complete` verb functions: `.planning/todos/` in local mode, the `devflow:todo` issues in store mode"
    - "The merge is monotonic (absent -> pending -> completed, never backwards), so running it any number of times, from the hook and the CLI, over one transcript or several that share items, never duplicates or loses a todo"
    - "A todo the session deleted is never removed from the archive, and a completed archive todo is never reopened"
    - "With nothing to merge the command writes nothing and makes no gh call; with github.store off every write is byte-identical to what `todo add --from` / `todo complete` write (D-01)"
    - "The result names what changed (`added`, `completed`, `changed_paths`), what is left to commit in local mode (`pending_commit`), and keeps going past a failed op with a warning"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/todo-sync.cjs
      provides: "readArchive, normalizeTitle, planSync, buildTodoText, resolveSessionTranscript, syncTodos"
    - path: plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
      provides: "`todo sync` subcommand in cmdTodoVerb"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs
      provides: "hand-built local-mode project with pending/completed todo files and a transcript dir"
  key_links:
    - "todo-sync.cjs -> todo-session.cjs replayTranscript (63-01) for the items; -> planning-entity-verbs.cjs todoAdd/todoComplete for every write (no direct file writes)"
    - "todo-sync.cjs -> planning-mode.cjs resolveMainRoot / planningMode: the archive lives in the MAIN checkout's .planning/"
    - "TRD 63-03's Stop hook calls syncTodos in-process with noFlush; TRD 63-04's list flow calls `df-tools todo sync --session <id> --raw`"
---

# TRD 63-02: Merge session todos into the archive: `todo-sync.cjs` and `df-tools todo sync` (BLTN-04, part 2)

<objective>
Turn 63-01's replayed items into archive writes, idempotently, through the existing todo verbs.

```
df-tools todo sync [--transcript <path>]... [--session <id>] [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait] [--raw]
```

The archive already exists and already speaks both modes: `todo add` writes `.planning/todos/pending/<stem>.md` (and
a `devflow:todo` issue in store mode), `todo complete` moves it to `todos/completed/` (and closes the issue). This TRD
adds no new storage: the sync is a planner (`planSync`, pure) over a reader (`readArchive`) and an applier that calls
`todoAdd` / `todoComplete`.

Purpose: the one merge both the Stop hook (63-03) and `/devflow:todo list` (63-04) run.
Output: `todo-sync.cjs`, the `todo sync` CLI, help text, tests in local and store mode.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                   ← MODIFY (header usage line only)
└── lib/
    ├── todo-sync.cjs                              ← CREATE
    ├── todo-sync.test.cjs                         ← CREATE
    ├── planning-verbs-cli.cjs                     ← MODIFY (cmdTodoVerb: sync)
    ├── help.cjs                                   ← MODIFY (todo usage + summary)
    └── __fixtures__/todo-archive-fixtures.cjs     ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Every archive write goes through `planning-entity-verbs.cjs` `todoAdd` / `todoComplete`. No `fs.writeFileSync`,
  `renameSync` or `unlinkSync` on a `.planning/` path in `todo-sync.cjs` (`rg` check in Task 2's verify).
- D-01: with `github.store` off a sync write is byte-identical to `todo add --from` / `todo complete`, and makes zero gh calls.
- `todo add`, `todo complete` and every other `cmdTodoVerb` path keep their current behaviour and output byte for byte.
- Fixtures are hand-built; no property-based tests; descriptive test names.
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<codebase_examples>
The verb functions to call (planning-entity-verbs.cjs; library, no stdout, results `{ok, mode, rel, path, warnings, queued?, flush?, error?, exit}`):
```js
todoAdd(root, { text, stem, now, noFlush, noWait })   // local: writeThrough(main, {rel: `todos/pending/${stem}.md`, text}); store: + upsert-issue {id: `todo-${stem}`, role: 'todo'}
todoComplete(root, { stem, now, noFlush, noWait })    // reads todos/pending/<stem>.md (fails "Todo not found" if absent), prepends `completed: <date>\n`, moves to todos/completed/
function contextOf(root) {                            // both resolve the MAIN checkout first
  const main = planningMode.resolveMainRoot(root);
  if (!main) return { error: `no .planning/ directory at or above ${root}` };
  return { main, mode: planningMode.planningMode(main).mode };
}
```
The CLI family to extend (planning-verbs-cli.cjs):
```js
const flushOpts = (args) => ({ noFlush: has(args, '--no-flush'), noWait: has(args, '--no-wait') });
function cmdTodoVerb(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  if (sub === 'add') { return withInput('todo add', cwd, rest, raw, io, (text) =>
      entity.todoAdd(cwd, { text, stem: flagValue(rest, '--stem'), ...flushOpts(rest) })); }
  if (sub === 'complete') { ... }
  return unknown('todo', sub, 'add, complete', raw);      // becomes 'add, complete, sync'
}
function report(verb, res, raw, extraProse = null) { ... }  // --raw prints JSON; else headline + warnings + res.prose
```
A real todo file (`.planning/todos/pending/2026-04-27-seamless-interactive-command-handoff.md`):
```
---
created: 2026-04-27T19:10:24.837Z
title: Seamless interactive command handoff
area: tooling
files: []
---

## Problem
...
```
A completed todo starts with `completed: <YYYY-MM-DD>` on the line BEFORE `---` (cmdTodoComplete prepends it), so
frontmatter parsers that require `---` on line 1 (entity `todoTitle`) return null for it. `init todos` reads titles
with `/^title:\s*(.+)$/m`; do the same.

Store-mode test harness to copy (planning-entity-verbs.test.cjs, `useProject` and test 5/6): `hermeticEnv()`,
`makeStoreProject({ store: true })`, `createFakeGitHub(project.fakeOptions)`, `gh._setRunGh(fake.runGh)`,
`client._setNow`/`_setSleep` with a fake clock, `NOTIFIER_DISABLE=1`, restore everything in `afterEach`.
</codebase_examples>

<anti_patterns>
- Do not call `todoAdd` for a stem that exists in pending OR completed: writeThrough overwrites, which would reset a
  hand-edited todo or resurrect a completed one in pending.
- Do not delete or un-complete archive todos from session state. A session `deleted` or `pending` status never moves an
  archive todo backwards.
- Do not dedupe by title for metadata stems: two distinct todos may share a title on different days; only items whose
  stem was derived (no metadata, no suffix) are matched to an existing archive todo by title.
- Do not commit from the library or the CLI. The workflow (63-04) commits `pending_commit` with `df-tools commit --files`.
- Do not use `os.homedir()` at module load for the projects root (HOME-isolated tests): resolve it at call time.
</anti_patterns>

<error_recovery>
- A store-mode test that hangs: an unrestored fake clock/sleep or a real `gh` reached. Every store test passes
  `noFlush: true` or uses the fake through `gh._setRunGh`, and `afterEach` restores `hermeticEnv`.
- `todoComplete` fails because the pending file vanished between read and move (another session completed it): record a
  warning, continue, and leave `ok: false` with `exit: 1` only if at least one op failed.
- A transcript path that does not exist: a warning (`transcript not found: <path>`), not an error, and nothing written.
</error_recovery>

<gotchas>
- `todo complete` through the CLI uses `cmdTodoComplete` (cwd), the library `todoComplete` uses the MAIN checkout. The
  sync calls the library; its local bytes are the same (`completed: <dateOf(now)>\n` + file). Test 3 proves the parity.
- `todos/done/` appears in old USER-GUIDE text and in `importEntity`; treat `done/` files as completed when reading the archive.
- `${CLAUDE_SESSION_ID}` reaches df-tools literally when Claude Code did not substitute it. `--session` must reject a value
  that is not an id with a clear usage error rather than searching for a file named `${CLAUDE_SESSION_ID}.jsonl`.
</gotchas>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/todo-session.cjs
@plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
@plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-01-SUMMARY.md
</context>

## Test list

Outermost first (CLI through `spawnSync(process.execPath, [DF_TOOLS, 'todo', 'sync', ...])`, then the library).

CLI, local mode:
1. A transcript with a metadata todo (`Todo: Add auth token refresh`, stem `2026-10-06-add-auth-token-refresh`,
   pending) and an empty archive: `todo sync --transcript <t> --raw` exits 0, `added` is `[stem]`, and
   `.planning/todos/pending/<stem>.md` holds exactly `buildTodoText(item)`.
2. Running the same command again: exit 0, `added` and `completed` empty, the file's bytes and mtime unchanged.
3. The archive holds the stem pending and the transcript completes it: the file moves to `todos/completed/` and its bytes
   equal what `df-tools todo complete <stem>.md` produces on an identical copy of the project (same fake date via `now`).
4. `--dry-run` reports the same `added`/`completed` lists and writes nothing.
5. `--session <id> --projects-root <dir>` finds `<dir>/<project-dir>/<id>.jsonl`; `--session '${CLAUDE_SESSION_ID}'`
   exits 1 with a usage error naming the unsubstituted placeholder; an unknown id exits 1 with `transcript not found for session <id>`.
6. In a git-initialized project with `commit_docs` true, `pending_commit` lists the new and moved todo paths
   (`.planning/todos/...`); with `commit_docs: false` it is `[]`.
7. Human output (no `--raw`) is one headline plus `added N, completed M` and the pending-commit paths.
8. `todo add` and `todo complete` output and files are unchanged (existing planning-verbs-cli tests stay green), and
   an unknown subcommand lists `add, complete, sync`.

Library:
9. `planSync`: absent+pending → add; absent+in_progress → add; absent+completed → add then complete; pending+completed
   → complete; pending+pending → nothing; completed+pending → nothing (never reopened); absent+deleted → skipped with
   reason; pending+deleted → nothing.
10. Title dedupe: a derived-stem item whose normalized title matches a pending archive todo targets that stem (no add;
    complete when the item is completed); a metadata-stem item with the same title but a new stem is added.
11. Two items with the same target stem (the same todo in two transcripts, a forked session) produce one op set; the
    furthest status wins (completed > in_progress > pending).
12. `readArchive` reads pending, completed and done files, finds the title of a completed file that starts with
    `completed: <date>`, and ignores non-`.md` files and a missing `todos/` directory.
13. `buildTodoText` for a hand-built item is exactly the golden text below; with no description the Problem line names
    the session id; a title with a newline is flattened to one line.
14. Store mode (fake GitHub): a sync add queues one `upsert-issue` for `todo-<stem>` with role `todo`; a sync completion
    queues the upsert and a close; a second identical sync queues nothing new.
15. One failing op (a completion whose pending file was removed after planning) gives a warning, the other ops still
    apply, `ok` false and `exit` 1.
16. A transcript with no todo items returns `skipped: 'no session todos'` style result, writes nothing, and never
    requires the gh modules' flush path.

Golden text for test 13 (item `{title: 'Add auth token refresh', created_at: '2026-10-06T12:00:01.000Z',
description: 'Tokens expire mid-session.'}`):
```
---
created: 2026-10-06T12:00:01.000Z
title: Add auth token refresh
area: general
files: []
---

## Problem

Tokens expire mid-session.

## Solution

TBD
```

<tasks>

<task type="auto">
  <name>Task 1: Archive fixture builders</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs</files>
  <action>
Hand-built builders, no generated data:
```
makeTodoProject({ commitDocs = true, git = false, todos = [] }) -> { root, cleanup }
   temp dir (fs.realpathSync(mkdtemp)), .planning/config.json {commit_docs}, .planning/STATE.md stub,
   each todo {stem, title, state: 'pending'|'completed'|'done', body?} written as today's files
   (completed/done: `completed: 2026-10-05\n` + text); git: init, user.email/name, commit.gpgsign false, add, commit
todoFileText({ title, created = '2026-10-05T10:00:00.000Z', area = 'general', problem = 'P', solution = 'TBD' }) -> string
writeTranscript(dir, name, text) -> abs path                    // text from todo-transcript-fixtures transcriptOf
makeProjectsRoot(sessionId, text) -> { root, transcript }       // <root>/-tmp-scratch-project/<sessionId>.jsonl
```
Reuse `todo-transcript-fixtures.cjs` (63-01) for transcripts; add no new transcript builders here.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/todo-archive-fixtures.cjs'); const p=f.makeTodoProject({todos:[{stem:'2026-10-05-a',title:'A',state:'completed'}]}); console.log(require('fs').readFileSync(p.root+'/.planning/todos/completed/2026-10-05-a.md','utf8').split('\n')[0]); p.cleanup()"` prints `completed: 2026-10-05`.</verify>
  <done>Builders create local projects (optionally git) with pending, completed and done todos in today's exact file shapes, and a projects root holding a session transcript.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: todo-sync.cjs (planSync, readArchive, buildTodoText, syncTodos) RED then GREEN</name>
  <files>plugins/devflow/devflow/bin/lib/todo-sync.test.cjs, plugins/devflow/devflow/bin/lib/todo-sync.cjs</files>
  <action>
RED: library tests 9-16 (and the library side of 1-3, 6), committed failing.

GREEN:
```
RANK = { deleted: -1, pending: 0, in_progress: 1, completed: 2 }
normalizeTitle(t) -> String(t).replace(/^(['"])(.*)\1$/, '$2').toLowerCase().replace(/\s+/g, ' ').trim()

readArchive(main) -> { pending: Map<stem,{title}>, completed: Map<stem,{title}>, byTitle: Map<norm,{stem,state}> }
   dirs: todos/pending (pending), todos/completed and todos/done (completed); *.md only; title via /^title:\s*(.+)$/m;
   a missing dir is empty. Completed wins over pending in byTitle.

planSync(items, archive) -> { ops: [{op:'add', stem, item} | {op:'complete', stem}], skipped: [{stem, title, reason}] }
   targets = Map<stem, {item, status}>    // merge: keep the item with the highest RANK
   for item: stem = item.stem
     if !archive.pending.has(stem) && !archive.completed.has(stem) && item.stem_source === 'derived'
        && (hit = archive.byTitle.get(normalizeTitle(item.title))) -> stem = hit.stem
     merge into targets
   for [stem, {item, status}] in targets order:
     state = completed.has ? 'completed' : pending.has ? 'pending' : 'absent'
     absent  & deleted          -> skipped 'deleted in the session before it was archived'
     absent  & pending|in_progress -> add
     absent  & completed        -> add, complete
     pending & completed        -> complete
     otherwise                  -> nothing

buildTodoText(item, { sessionId }) -> the golden format; title/description flattened to one line each
   (description null -> `Captured in Claude Code session ${sessionId || 'unknown'} through the session task list.`)

resolveSessionTranscript(sessionId, { projectsRoot }) -> { path } | { error, usage? }
   reject unless /^[A-Za-z0-9][A-Za-z0-9-]{7,}$/ (a `${...}` placeholder gets usage: 'session id was not substituted: ...')
   root = projectsRoot || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
   readdir(root) dirs; first `<dir>/<id>.jsonl` that exists (main transcripts only, not subagents/)

syncTodos(cwd, { transcripts = [], sessionId, now, dryRun = false, noFlush = false, noWait = false })
   main = resolveMainRoot(cwd) -> none: { ok: false, error, exit: 1 }
   mode = planningMode(main).mode
   items = []; warnings = []
   for each path: read (missing -> warning) -> replayTranscript(text).items -> push
   todoItems = items (all replayed items are todos); none -> { ok: true, mode, skipped: 'no session todos', added: [], completed: [], ... }
   plan = planSync(todoItems, readArchive(main)); dryRun -> return the plan as the result, no writes
   for op: add -> todoAdd(main, { text: buildTodoText(op.item, {sessionId}), stem: op.stem, now, noFlush, noWait })
           complete -> todoComplete(main, { stem: op.stem, now, noFlush, noWait })
           !r.ok -> warnings.push(`${op.op} ${op.stem}: ${r.error}`), failed++ ; continue
           collect changed_paths (`.planning/${r.rel}`, plus `.planning/${r.from}` for a move), queued counts in store mode
   pending_commit: mode local && loadConfig(main).commit_docs !== false && git available ->
      `git -C <main> status --porcelain -z --untracked-files=all -- .planning/todos` paths, prefixed as repo-relative;
      [] otherwise (never throws; a git failure is a warning)
   return { ok: failed === 0, exit: failed ? 1 : 0, mode, dry_run, transcripts: n, todo_items: n, added, completed,
            skipped: plan.skipped, changed_paths, pending_commit, queued, warnings, prose }
```
`prose` is `added N, completed M` plus `uncommitted: <paths>` when pending_commit is non-empty. Export everything above.
Commit RED and GREEN separately (`test(63-02): ...`, `feat(63-02): ...`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs` passes the library tests; `rg -n "writeFileSync|renameSync|unlinkSync|rmSync" plugins/devflow/devflow/bin/lib/todo-sync.cjs` prints nothing.</verify>
  <done>Library tests 9-16 pass; every write goes through todoAdd/todoComplete; repeated syncs are no-ops.</done>
  <recovery>If store-mode tests fight the fake (unexpected op shapes), assert on the outbox journal entries for `todo-<stem>` (ids and roles) rather than on full op bodies, as 48-12 test 5 does.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: `df-tools todo sync` CLI and help (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/todo-sync.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED: CLI tests 1-8 (spawn df-tools with `cwd` the fixture project and a hermetic env: `HOME` a temp dir), committed failing.

GREEN, in `cmdTodoVerb`:
```js
if (sub === 'sync') {
  const transcripts = flagValues(rest, '--transcript');       // repeated flag; local helper beside flagValue
  const session = flagValue(rest, '--session');
  if (session !== undefined) {
    const r = todoSync.resolveSessionTranscript(session, { projectsRoot: flagValue(rest, '--projects-root') });
    if (r.error) return report('todo sync', usageResult(r.error), raw);
    transcripts.push(r.path);
  }
  if (!transcripts.length) return report('todo sync', usageResult('usage: df-tools todo sync (--transcript <path>... | --session <id>) [--dry-run] [--no-flush] [--no-wait]'), raw);
  return report('todo sync', todoSync.syncTodos(cwd, { transcripts, sessionId: session, dryRun: has(rest, '--dry-run'), ...flushOpts(rest) }), raw);
}
```
`unknown('todo', sub, 'add, complete, sync', raw)`. Lazy-require `todo-sync.cjs` inside the branch so `todo add` /
`todo complete` load nothing new. help.cjs `todo` entry: usage gains `| todo sync (--transcript <path>... | --session <id>) [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait]`;
summary `Add a todo, move one to completed, or merge a session's task-list todos into the archive.` df-tools.cjs header
comment: add `todo sync --session <id>             Merge a session's todos into the archive` under `todo complete`.
Commit RED and GREEN separately.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` passes (skip help.test.cjs if it does not exist); `node plugins/devflow/devflow/bin/df-tools.cjs todo sync` exits 1 with the usage line.</verify>
  <done>All Test list cases pass; existing todo verb tests are unchanged and green.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/todo-sync.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` green.
- Tests 2, 11 and 14 show idempotency in both modes; test 3 shows D-01 byte parity for completion.
</verification>

<success_criteria>
- One CLI and one library call merge any session transcript into the archive, in either mode, monotonically and idempotently.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-02-SUMMARY.md`
</output>
