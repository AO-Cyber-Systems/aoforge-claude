---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "06"
type: standard
wave: 4
depends_on: ["63-03", "63-04", "63-05"]
files_modified:
  - docs/built-in-integration-status.md
  - plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs
autonomous: true
requirements: [BLTN-06]
must_haves:
  truths:
    - "docs/built-in-integration-status.md lists every Claude Code built-in tool and hook event of the reviewed version (2.1.292 or the version current at execution) with DevFlow's adoption status, the files that show it, the objective it came in, and notes"
    - "The statuses match the tree after Objectives 62-63: every built-in a skill or agent declares (legacy names mapped) is adopted or partial, every hook event in hooks.json is adopted and every adopted event is registered, and each adopted or partial row cites existing files that name the built-in"
    - "The document carries Last reviewed / Next review dates, the Claude Code version reviewed, a quarterly review procedure, the candidates for adoption (including Phase J's J5 list), and the adoption history of Objectives 62 and 63"
    - "A repo test holds the document to the tree and to its pinned built-in lists, so a new built-in, a dropped one, a new hook registration or a stale citation fails CI until the inventory is updated"
  artifacts:
    - path: docs/built-in-integration-status.md
      provides: "BLTN-06 living inventory"
    - path: plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs
      provides: "inventory <-> tree checks, pinned REQUIRED_TOOLS / REQUIRED_EVENTS, sensitivity tests"
  key_links:
    - "builtin-status.repo.test.cjs -> plugins/devflow/hooks/hooks.json (registered events), skills/*/SKILL.md allowed-tools, agents/*.md tools, builtin-audit.cjs BUILTINS"
    - "docs/built-in-sweep.md (62) is the per-prompt record of BLTN-01..03; this inventory is the per-built-in view and links to it"
---

# TRD 63-06: The built-in integration inventory (BLTN-06)

<objective>
Write `docs/built-in-integration-status.md`: a living inventory of Claude Code's built-ins and DevFlow's adoption of
each, matching the tree after Objectives 62 and 63, plus a repo test that keeps it matching.

Phase J (#35, J5) asked for this file and a quarterly review: "Living inventory of Claude Code built-ins and DevFlow's
adoption state. Quarterly review: scan deferred-tools list for new candidates." "Living" is made concrete here: the
test pins the built-in names of the reviewed Claude Code version and checks the document against the tree in both
directions. Calendar staleness is NOT a CI failure (an unrelated PR must not fail because a quarter passed); the
document's dates and procedure carry the review cadence.

Purpose: SC3. Output: the document and its test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Every status is evidence-based: run the searches, read the hits, then decide. Never infer adoption from a name alone.
- Re-fetch the two references at execution time (`curl -sL https://code.claude.com/docs/en/tools-reference.md` and
  `curl -sL https://code.claude.com/docs/en/hooks.md` into the scratchpad) and reconcile the pinned lists below with
  them; record the Claude Code version (`claude --version`) and fetch date in the document. If the docs moved on,
  the fetched lists win and the SUMMARY lists the differences.
- The test has no clock check. No network in the test.
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<research_context>
**Tools** (tools reference table, fetched 2026-10-06, Claude Code 2.1.292), 46 names:
`Agent, Artifact, AskUserQuestion, Bash, CronCreate, CronDelete, CronList, Edit, EndConversation, EnterPlanMode,
EnterWorktree, ExitPlanMode, ExitWorktree, Glob, Grep, ListAgents, ListMcpResourcesTool, LSP, Monitor, NotebookEdit,
PowerShell, PushNotification, Read, ReadMcpResourceTool, RemoteTrigger, ReportFindings, ScheduleWakeup, SendFeedback,
SendMessage, SendUserFile, ShareOnboardingGuide, Skill, SubagentHandback, TaskCreate, TaskGet, TaskList, TaskOutput,
TaskStop, TaskUpdate, TodoWrite, ToolSearch, WaitForMcpServers, WebFetch, WebSearch, Workflow, Write`.
Facts from the same page worth a note: `Glob` and `Grep` are "Absent by default on macOS, Linux, and WSL"; `TaskOutput`
is "Deprecated in favor of `Read` on the task's output file path"; `TodoWrite` is "Disabled by default in favor of
`TaskCreate`, `TaskGet`, `TaskList`, and `TaskUpdate`. Set `CLAUDE_CODE_ENABLE_TASKS=0` to re-enable it"; task-tracking
tools are default only on Claude 3.x, Opus 4-4.7, Sonnet 4-4.6, Haiku 4.5 since v2.1.268, else
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` (or naming one in `--allowedTools`); `ExitPlanMode` is "Permission required: Yes".

**Hook events** (hooks reference headings, same date), 33 names:
`SessionStart, Setup, InstructionsLoaded, UserPromptSubmit, UserPromptExpansion, MessageDisplay, PreToolUse,
PermissionRequest, PostToolUse, PostToolUseFailure, PostToolBatch, PermissionDenied, Notification, SubagentStart,
SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle, ConfigChange, CwdChanged, DirectoryAdded,
FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact, PreModelSwitch, PostModelSwitch, SessionEnd,
Elicitation, ElicitationResult`.
DevFlow registers (hooks.json after 63-03): SessionStart, Stop, SubagentStop, UserPromptSubmit, UserPromptExpansion,
PreToolUse, PostToolUse. `SessionEnd` default timeout is 1.5 s and plugin hook timeouts do not raise it (why todo-sync
is not on it). `TaskCreated` / `TaskCompleted` fire only in sessions with the Task tools: a candidate for instant todo
completion.

**Legacy names declared in DevFlow frontmatter today** (union of agents' `tools:` and skills' `allowed-tools`): `Task`
(16 declarations; the old name of `Agent`) and `SlashCommand` (1; the old name of `Skill`). Verify in the sub-agents and
skills docs whether Claude Code still accepts each alias, and note it in the row (the test maps aliases to the
built-in). Other declared built-ins: Bash, Read, Write, Glob, Grep, AskUserQuestion, Edit, TaskCreate, TaskUpdate,
TaskList, WebFetch, WebSearch, EnterPlanMode, Skill; after 63-04 also TodoWrite.

Phase J J5 candidates: `mcp__ccd_session__mark_chapter` (mark phase boundaries in long sessions),
`mcp__ccd_session__spawn_task` (verifier spins off an out-of-scope concern), `ScheduleWakeup` (a `/devflow:loop`-style
"check the build every N minutes"), `mcp__ccd_session_mgmt__list_sessions` (resume could surface prior sessions). Add
any found in this review (for example `PushNotification` at the end of a long build, `ReportFindings` for verifier and
security-audit findings, `TaskCompleted` for instant todo completion, `${CLAUDE_PLUGIN_DATA}` instead of the
`~/.claude/devflow/` mirror).
</research_context>

<codebase_examples>
How 62 recorded built-in work (docs/built-in-sweep.md head): `Status: closed (TRD 62-10)...`, a columns paragraph,
then a pipe table. Mirror that tone: plain, factual, every claim backed by a path.

Repo-test pattern to mirror (hook-inventory.test.cjs): pure parser functions at the top of the test file
(`hooksSection`, `parseBullets`, `registeredScripts`), checks over the real tree, and a sensitivity test over a
hand-written synthetic snippet; `REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..')` and
`IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'))` to skip on a mirror install.

Frontmatter readers already in the repo: builtin-audit.cjs has an `allowed-tools` reader (inline comma form and YAML
list form, both used: `allowed-tools: Read, Write, ..., TaskList` in build, a `- Read` list in todo). Reuse it rather
than writing another: `splitFrontmatter` and `parseToolList` are exported.
</codebase_examples>

<anti_patterns>
- Do not mark a built-in `adopted` because it appears in a reference or a comment only; cite where a flow, agent or
  hook actually uses or declares it.
- Do not copy the tool descriptions from the docs into the table; one short note of what DevFlow does with it.
- Do not add a date-based failure to the test.
- Do not let the document drift into a design doc: candidates get one line each and a follow-up pointer.
</anti_patterns>

<error_recovery>
- A declared built-in has no honest status other than "declared but unused" (for example `WebSearch` in an agent that
  never searches): mark it `partial` with that note; the test only needs adopted|partial for declared ones.
- The alias check is ambiguous in the docs: keep the alias mapping in the test and say "alias accepted per <doc
  section>" or "alias status unverified" in the Notes cell; list it as a candidate cleanup.
</error_recovery>

</embedded_context>

<context>
@docs/built-in-sweep.md
@plugins/devflow/devflow/references/built-ins.md
@plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs
@plugins/devflow/devflow/bin/lib/builtin-audit.cjs
@plugins/devflow/hooks/hooks.json
</context>

## Test list

`builtin-status.repo.test.cjs`, outermost first:
1. The document exists and has `Last reviewed: YYYY-MM-DD`, `Next review: YYYY-MM-DD` (after Last reviewed, at most
   100 days later) and `Claude Code: <x.y.z>` lines, and the sections `## Tools`, `## Hook events`, `## Other
   surfaces`, `## Candidates`, `## Review procedure`, `## Adoption history`.
2. Every REQUIRED_TOOLS name has exactly one `## Tools` row and every row names a REQUIRED_TOOLS name.
3. Every REQUIRED_EVENTS name has exactly one `## Hook events` row and every row names a REQUIRED_EVENTS name.
4. Every Status cell (all three tables) is one of `adopted`, `partial`, `not adopted`, `candidate`, `n/a`.
5. Every `adopted` or `partial` row cites at least one repo path in Where; each path exists; for Tools rows, at least
   one cited file contains the tool name or its legacy alias as a word.
6. Tree → document: every built-in declared in any skill's `allowed-tools` or any agent's `tools:` (ALIASES
   `{Task: 'Agent', SlashCommand: 'Skill'}` applied, `mcp__*` ignored) has an `adopted` or `partial` row.
7. Every event registered in hooks.json is `adopted`, and every `adopted` hook-event row is registered in hooks.json.
8. Every builtin-audit `BUILTINS` name is `adopted` or `partial`.
9. Every `candidate` row has a non-empty Notes cell, and the `## Candidates` section names each candidate row.
10. Sensitivity (synthetic snippets): a missing tool row, an unknown status, an adopted row citing a missing path, and
    an adopted hook event that is not registered each produce the matching error.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: builtin-status.repo.test.cjs (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs</files>
  <action>
Write tests 1-10 with pure parsers at the top: `section(md, heading)`, `parseTable(sectionText)` → rows of cells
(first cell's backticked name, Status, Where paths = every backticked token containing `/`, Since, Notes),
`declaredBuiltins(repoRoot)` (skills `allowed-tools` + agents `tools:`, aliases mapped, `mcp__*` dropped),
`registeredEvents(hooksJson)`. Pin `REQUIRED_TOOLS` and `REQUIRED_EVENTS` (the lists above, reconciled with the
fetched docs) with a comment: the Claude Code version and date they were taken from, and that a review updates them
together with the document. Header comment: what is checked, why there is no clock check, how to review. Run: fails
(no document). Commit RED (`test(63-06): ...`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` fails on the missing document (and the sensitivity test 10 passes).</verify>
  <done>The test encodes SC3's "matching the state after Objectives 62-63" as checks against the tree.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: docs/built-in-integration-status.md (GREEN)</name>
  <files>docs/built-in-integration-status.md</files>
  <action>
For each tool and event: `rg -n -w "<Name>" plugins/devflow/skills plugins/devflow/agents plugins/devflow/devflow/workflows plugins/devflow/hooks plugins/devflow/devflow/bin`
(one call per name or one scripted loop in the scratchpad), read the hits, decide the status. Write:

```
# Claude Code built-in integration status

<one paragraph: what this is (BLTN-06, Phase J #35), how it relates to docs/built-in-sweep.md and references/built-ins.md>

Last reviewed: <date>
Next review: <date + ~90 days>
Claude Code: <version> (tools and hooks references fetched <date>)

Statuses: adopted (a shipped flow, agent or hook uses it; Where says where) · partial (used in some places, under a
legacy name, declared but barely used, or dependent on an opt-in) · not adopted · candidate (worth adopting; see
Candidates) · n/a (does not fit a planning plugin).

## Tools
| Tool | Status | Where | Since | Notes |
(46 rows, alphabetical)

## Hook events
| Event | Status | Where | Since | Notes |
(33 rows; DevFlow's events cite hooks.json and the scripts on them)

## Other surfaces
| Surface | Status | Where | Notes |
(plan mode; skill frontmatter allowed-tools / disallowed-tools; skill string substitutions incl. ${CLAUDE_SESSION_ID};
 ${CLAUDE_PLUGIN_ROOT} / ${CLAUDE_PLUGIN_DATA}; plugin hooks.json and plugin.json statusLine (and that a user-level
 statusLine setting is a separate surface); subagent isolation: worktree; run_in_background; task-list env vars
 CLAUDE_CODE_ENABLE_TODO_TOOLS / CLAUDE_CODE_ENABLE_TASKS / CLAUDE_CODE_TASK_LIST_ID; /goal; /loop and scheduled
 tasks; agent teams; headless -p; .mcp.json servers)

## Candidates
(one line each: what, why, the follow-up, e.g. "capture with /devflow:todo add")

## Review procedure
(numbered steps: fetch the two references; diff names against REQUIRED_TOOLS / REQUIRED_EVENTS in
 builtin-status.repo.test.cjs; update rows and the pinned lists together; re-run the searches for changed rows; bump the
 dates and version; run `node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs`; commit)

## Adoption history
- Objective 62 (built-in sweep): TaskCreate/TaskUpdate progress in six flows, plan-mode draft reviews in three,
  AskUserQuestion for every discrete choice; see docs/built-in-sweep.md.
- Objective 63: the session task list (TaskCreate/TaskUpdate/TaskList or TodoWrite) as /devflow:todo's in-session
  store, `df-tools todo sync` and the todo-sync Stop hook; the hook coexistence suite; this inventory.
```
Run the test until green; fix the document, not the test, unless a check is wrong (then say why in the SUMMARY).
Commit (`docs(63-06): ...`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes.</verify>
  <done>Every built-in of the reviewed version has an evidence-backed row; the test is green and would fail on drift.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- The repo test is green; its sensitivity test shows each check can fail.
- Spot check five rows by hand (one adopted tool, one partial, one candidate, one adopted event, one not-adopted
  event) against `rg` output, recorded in the SUMMARY.
</verification>

<success_criteria>
- SC3: the inventory lists the built-ins and DevFlow's adoption of each, as the tree stands after Objectives 62-63,
  and CI keeps it that way.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-06-SUMMARY.md`
</output>
