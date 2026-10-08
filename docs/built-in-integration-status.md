# Claude Code built-in integration status

This is the living inventory of Claude Code's built-in tools and hook events and of how far AOForge uses each (BLTN-06, Phase J issue #35, J5). It is the per-built-in view; [built-in-sweep.md](built-in-sweep.md) is the per-prompt record of the Objective 62 conversions (BLTN-01 to BLTN-03), and the rules those conversions follow are in [references/built-ins.md](../plugins/aoforge/aoforge/references/built-ins.md). Every status below was decided from a search of the shipped skills, agents, workflows, hooks and aof-tools code, not from a name alone, and [builtin-status.repo.test.cjs](../plugins/aoforge/aoforge/bin/lib/builtin-status.repo.test.cjs) holds the document to the tree.

Last reviewed: 2026-10-06
Next review: 2027-01-04
Claude Code: 2.1.292 (tools and hooks references fetched 2026-10-06)

Statuses: adopted (a shipped flow, agent or hook uses it; Where says where) · partial (used in some places, under a legacy name, declared but barely used, or dependent on an opt-in) · not adopted · candidate (worth adopting; see Candidates) · n/a (does not fit a planning plugin).

## Tools

46 tools in the reviewed tools reference. Where lists repo paths, and for a tool at least one of them names it (or its legacy name) as a word.

| Tool | Status | Where | Since | Notes |
|---|---|---|---|---|
| `Agent` | adopted | `plugins/aoforge/skills/execute-objective/SKILL.md`, `plugins/aoforge/aoforge/workflows/execute-objective.md` | pre-62 | AOForge still writes the legacy name `Task` (16 skill declarations, `Task(` calls in workflows). Alias accepted: the sub-agents doc says the tool was renamed to Agent in v2.1.63 and `Task(...)` references still work. Rename is a cleanup candidate. |
| `Artifact` | not adopted | | | Hits in the tree are table headings, not the tool. |
| `AskUserQuestion` | adopted | `plugins/aoforge/skills/build/SKILL.md`, `docs/built-in-sweep.md` | 62 | Every discrete choice in 25 skills and the executor; the sweep converted 121 prompts. |
| `Bash` | adopted | `plugins/aoforge/skills/build/SKILL.md`, `plugins/aoforge/agents/executor.md` | pre-62 | Declared by 32 skills and 13 agents; aof-tools is invoked through it. |
| `CronCreate` | not adopted | | | No flow schedules a task. See the ScheduleWakeup candidate. |
| `CronDelete` | not adopted | | | As CronCreate. |
| `CronList` | not adopted | | | As CronCreate. |
| `Edit` | adopted | `plugins/aoforge/agents/executor.md`, `plugins/aoforge/skills/quick/SKILL.md` | pre-62 | Declared by 7 skills and 3 agents; gate-edits.js guards it. |
| `EndConversation` | n/a | | | Ends the session on abuse; nothing for a planning flow to do. |
| `EnterPlanMode` | adopted | `plugins/aoforge/skills/plan-objective/SKILL.md`, `docs/built-in-sweep.md` | 62 | Draft review in plan-objective, new-project and milestone complete (BLTN-02), plus build. |
| `EnterWorktree` | not adopted | | | Worktrees are provisioned by `aof-tools exec-context worktree` and removed by the wave merge in execute-objective. |
| `ExitPlanMode` | adopted | `plugins/aoforge/aoforge/workflows/build.md`, `plugins/aoforge/aoforge/workflows/new-project.md`, `plugins/aoforge/aoforge/bin/lib/builtin-audit.cjs` | 62 | Called in the workflows, never declared in `allowed-tools`: its permission prompt is the plan approval (builtin-audit FORBIDDEN_ALLOWED). |
| `ExitWorktree` | not adopted | | | As EnterWorktree. |
| `Glob` | partial | `plugins/aoforge/agents/executor.md`, `plugins/aoforge/skills/build/SKILL.md` | pre-62 | Declared by 15 skills and 12 agents, but the tools reference says it is absent by default on macOS, Linux and WSL; the executor searches with `rg` through Bash. |
| `Grep` | partial | `plugins/aoforge/agents/executor.md`, `plugins/aoforge/skills/build/SKILL.md` | pre-62 | Declared by 14 skills and 12 agents; same default-absent caveat as Glob. |
| `ListAgents` | not adopted | | | Lists SendMessage targets; the orchestrator already holds each executor's task id. |
| `ListMcpResourcesTool` | not adopted | | | AOForge uses MCP tools, not MCP resources. |
| `LSP` | not adopted | | | Go and Dart code intelligence goes through `mcp__gopls__*` and `mcp__dart__*`, set up by `stack mcp`. |
| `Monitor` | partial | `plugins/aoforge/agents/executor.md` | pre-62 | The executor prompt says to wait on a long run with Monitor or an until-loop. No agent declares it, and it was disabled in the 63-03 session. |
| `NotebookEdit` | not adopted | | | Only session-audit.cjs names it, to classify edit calls in transcripts. |
| `PowerShell` | not adopted | | | `wrappers/powershell.cjs` is aof-tools' own pwsh dispatch wrapper, not this tool. |
| `PushNotification` | candidate | | | End of a long build or wave run. See Candidates. |
| `Read` | adopted | `plugins/aoforge/skills/build/SKILL.md`, `plugins/aoforge/agents/executor.md` | pre-62 | Declared by 31 skills and 13 agents. |
| `ReadMcpResourceTool` | not adopted | | | As ListMcpResourcesTool. |
| `RemoteTrigger` | n/a | | | Creates claude.ai Routines; outside a project-local planning plugin. |
| `ReportFindings` | candidate | | | Verifier and security-audit findings. See Candidates. |
| `ScheduleWakeup` | candidate | | | A "check the build every N minutes" flow (Phase J J5). See Candidates. |
| `SendFeedback` | n/a | | | Drafts Claude Code feedback; not an AOForge concern. |
| `SendMessage` | adopted | `plugins/aoforge/aoforge/workflows/execute-objective.md`, `plugins/aoforge/agents/executor.md` | pre-62 | execute-objective resumes a truncated executor with up to three SendMessage calls. |
| `SendUserFile` | not adopted | | | Reports and evidence stay in the repo and the SUMMARY. |
| `ShareOnboardingGuide` | n/a | | | Backs `/team-onboarding`. |
| `Skill` | adopted | `plugins/aoforge/skills/flow/SKILL.md`, `plugins/aoforge/skills/status/SKILL.md` | pre-62 | `flow` calls `Skill(skill="aoforge:{name}")`. `status` still declares the legacy `SlashCommand`, and transition.md and new-project.md still write `SlashCommand("/aoforge:...")`. Alias status unverified: neither the tools reference nor the skills doc mentions it. Rename is a cleanup candidate. |
| `SubagentHandback` | n/a | | | Provided by the host to subagents in auto mode; no flow calls it. |
| `TaskCreate` | adopted | `plugins/aoforge/skills/build/SKILL.md`, `plugins/aoforge/skills/todo/SKILL.md` | 62 | Progress tasks in six flows (BLTN-01); the session store for `/aoforge:todo add` (63). Provided by default only on some models, so every block says "if available". |
| `TaskGet` | partial | `plugins/aoforge/aoforge/bin/lib/builtin-audit.cjs` | 62 | builtin-audit recognises it, but no flow calls it. TaskList carries no metadata, so TaskGet is the call for reading a todo's stem if a flow needs it. |
| `TaskList` | adopted | `plugins/aoforge/aoforge/workflows/check-todos.md`, `plugins/aoforge/skills/todo/SKILL.md` | 63 | `/aoforge:todo list` reads the session list; build declares it. |
| `TaskOutput` | partial | `plugins/aoforge/aoforge/workflows/execute-objective.md` | pre-62 | Blocks on a background executor. The tools reference marks it deprecated in favor of `Read` on the output file, so moving to that is a cleanup candidate. |
| `TaskStop` | not adopted | | | No flow stops a background task. |
| `TaskUpdate` | adopted | `plugins/aoforge/skills/build/SKILL.md`, `plugins/aoforge/skills/todo/SKILL.md` | 62 | Progress tasks (BLTN-01) and in-session todo status (63). |
| `TodoWrite` | partial | `plugins/aoforge/skills/todo/SKILL.md`, `plugins/aoforge/aoforge/workflows/add-todo.md`, `plugins/aoforge/aoforge/workflows/check-todos.md` | 63 | The session list when the Task tools are off. Disabled by default in favor of the Task tools (`CLAUDE_CODE_ENABLE_TASKS=0` brings it back), so it depends on that opt-in. The audit counts `TodoWrite(` as a use. |
| `ToolSearch` | adopted | `plugins/aoforge/aoforge/workflows/adopt.md`, `plugins/aoforge/aoforge/workflows/map-codebase.md` | pre-62 | Probes for the gopls and Dart MCP tools before using them. |
| `WaitForMcpServers` | not adopted | | | The MCP probe does not wait for a server still connecting. |
| `WebFetch` | partial | `plugins/aoforge/agents/objective-researcher.md`, `plugins/aoforge/agents/planner.md` | pre-62 | Declared by 3 agents and plan-objective; the prose names it only in the declaration. |
| `WebSearch` | adopted | `plugins/aoforge/agents/objective-researcher.md`, `plugins/aoforge/skills/research-objective/SKILL.md` | pre-62 | A named tier in the researchers' source hierarchy (Context7, official docs, WebSearch). |
| `Workflow` | not adopted | | | The word in the tree is AOForge's own `workflows/` prompt files, not this tool. |
| `Write` | adopted | `plugins/aoforge/agents/executor.md`, `plugins/aoforge/skills/build/SKILL.md` | pre-62 | Declared by 21 skills and 10 agents; under `.planning/` it is replaced by the planning verbs in store mode. |

## Hook events

33 events in the reviewed hooks reference. AOForge registers seven in `plugins/aoforge/hooks/hooks.json`; the test requires each of them to be adopted here and each adopted row to be registered.

| Event | Status | Where | Since | Notes |
|---|---|---|---|---|
| `SessionStart` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/sync-runtime.js`, `plugins/aoforge/hooks/upgrade-project.js`, `plugins/aoforge/hooks/awareness-cache-populate.js`, `plugins/aoforge/hooks/classify-session.js` | pre-62 | Runtime mirror, project upgrade, awareness cache, session classification. |
| `Setup` | not adopted | | | The mirror and the upgrade run on SessionStart. |
| `InstructionsLoaded` | not adopted | | | |
| `UserPromptSubmit` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/route-intent.js`, `plugins/aoforge/hooks/route-results.js` | pre-62 | Skill routing reminders and queued handoff results. |
| `UserPromptExpansion` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/gate-skill-requires.js` | pre-62 | Refuses a typed skill whose `requires:` tool is missing. |
| `MessageDisplay` | n/a | | | |
| `PreToolUse` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/gate-commits.js`, `plugins/aoforge/hooks/gate-edits.js`, `plugins/aoforge/hooks/gate-bash-writes.js`, `plugins/aoforge/hooks/changelog-on-tag.js`, `plugins/aoforge/hooks/gate-interactive.js`, `plugins/aoforge/hooks/guard-no-progress.js` | pre-62 | The gates, the changelog-on-tag check, the interactive-command check and the no-progress guard. |
| `PermissionRequest` | not adopted | | | |
| `PostToolUse` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/gh-flush.js` | pre-62 | Store mode: flushes the outbox after `aof-tools commit`. |
| `PostToolUseFailure` | not adopted | | | guard-no-progress deliberately ignores tool errors (TRD 28-04). |
| `PostToolBatch` | not adopted | | | |
| `PermissionDenied` | not adopted | | | |
| `Notification` | not adopted | | | |
| `SubagentStart` | not adopted | | | |
| `SubagentStop` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/verify-commits.js`, `plugins/aoforge/hooks/gate-executor-stop.js` | pre-62 | verify-commits.js and gate-executor-stop.js block with a top-level `decision`/`reason`; verify-commits.js nested them in `hookSpecificOutput` until objective 70 (63-05 finding, closed). |
| `TaskCreated` | candidate | | | Instant todo capture in sessions with the Task tools. See Candidates. |
| `TaskCompleted` | candidate | | | Instant todo completion; todo-sync runs at Stop today. See Candidates. |
| `Stop` | adopted | `plugins/aoforge/hooks/hooks.json`, `plugins/aoforge/hooks/verify-completion.js`, `plugins/aoforge/hooks/auto-continue.js`, `plugins/aoforge/hooks/gh-flush.js`, `plugins/aoforge/hooks/todo-sync.js` | 63 | todo-sync.js (63-03) merges the session's todos into the archive; the other three predate 62. |
| `StopFailure` | not adopted | | | |
| `TeammateIdle` | n/a | | | Agent teams are not used. |
| `ConfigChange` | not adopted | | | |
| `CwdChanged` | not adopted | | | |
| `DirectoryAdded` | not adopted | | | |
| `FileChanged` | not adopted | | | |
| `WorktreeCreate` | not adopted | | | Worktrees come from `aof-tools exec-context worktree`. |
| `WorktreeRemove` | not adopted | | | As WorktreeCreate. |
| `PreCompact` | not adopted | | | |
| `PostCompact` | not adopted | | | |
| `PreModelSwitch` | not adopted | | | |
| `PostModelSwitch` | not adopted | | | |
| `SessionEnd` | not adopted | | | Its default hook timeout is 1.5 s and a plugin hook's timeout does not raise it, which is why todo-sync is on Stop (see the header of `todo-sync.js`). |
| `Elicitation` | n/a | | | |
| `ElicitationResult` | n/a | | | |

## Other surfaces

| Surface | Status | Where | Notes |
|---|---|---|---|
| Plan mode draft review | adopted | `plugins/aoforge/aoforge/references/built-ins.md`, `docs/built-in-sweep.md` | plan-objective, new-project, milestone complete and build; skipped on `--auto`. |
| Skill `allowed-tools` | adopted | `plugins/aoforge/skills/build/SKILL.md` | Every skill declares one; builtin-audit checks the declaration against the workflows the skill reaches. |
| Skill `disallowed-tools` | partial | `plugins/aoforge/skills/adopt/SKILL.md` | Only the adopt skill uses it. |
| `${CLAUDE_SESSION_ID}` string substitution | adopted | `plugins/aoforge/skills/todo/SKILL.md` | The todo skill carries the session id in its context so the workflows can run `todo sync --session`. |
| `${CLAUDE_PLUGIN_ROOT}` | adopted | `plugins/aoforge/hooks/hooks.json` | Every hook command. Skill `@path` references cannot use it, hence the sync-runtime mirror at `~/.claude/aoforge/`. |
| `${CLAUDE_PLUGIN_DATA}` | candidate | | Would replace the `~/.claude/aoforge/` mirror for state and runtime files. See Candidates. |
| Plugin hooks (`hooks.json`) | adopted | `plugins/aoforge/hooks/hooks.json` | 21 script and event registrations, covered by the hook coexistence suite. |
| Plugin `statusLine` | adopted | `plugins/aoforge/.claude-plugin/plugin.json`, `plugins/aoforge/hooks/statusline.js` | Declared in the manifest. A user-level `statusLine` setting is a separate surface that AOForge does not touch. |
| Subagent isolation: worktree | not adopted | | Isolation is explicit, through `exec-context worktree`, so the base commit is stated rather than inferred (issue #86). |
| `run_in_background` | adopted | `plugins/aoforge/aoforge/workflows/execute-objective.md` | Parallel executors in a wave. |
| `CLAUDE_CODE_ENABLE_TODO_TOOLS` | partial | `plugins/aoforge/skills/todo/SKILL.md`, `plugins/aoforge/aoforge/references/built-ins.md` | Documented as the opt-in that turns the task tools on for newer models; AOForge never sets it. |
| `CLAUDE_CODE_ENABLE_TASKS` | partial | `plugins/aoforge/aoforge/bin/lib/builtin-audit.cjs` | Named as the switch that makes TodoWrite the session store. Never set by a flow. |
| `CLAUDE_CODE_TASK_LIST_ID` | not adopted | | No flow sets or reads it; the archive, not a named task list, carries todos between sessions. |
| `/goal` | not adopted | | No mention in the tree. |
| `/loop` and scheduled tasks | partial | `plugins/aoforge/aoforge/workflows/help.md` | help.md documents `/loop 10m /aoforge:status` as something to type; no flow starts a loop. |
| Agent teams | not adopted | | No mention in the tree. |
| Headless `claude -p` | adopted | `plugins/aoforge/aoforge/references/unattended-operation.md` | The documented way to run an objective without a terminal; `/aoforge:adopt` is unattended by design. |
| `.mcp.json` servers | partial | `plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs` | `stack mcp --write` is the only writer and is opt-in; this repo has no `.mcp.json`. |

## Candidates

One line each: what, why, and the follow-up. Capture a follow-up with `/aoforge:todo add`.

- `PushNotification`: tell the user a long build or wave run has finished. Follow-up: add one call to execute-objective's final report when the run is long.
- `ReportFindings`: hand the verifier's and security-audit's findings to the host as a structured list instead of printing them. Follow-up: try it in security-audit first.
- `ScheduleWakeup`: a "check the build every N minutes" flow, so a long run is polled without the user typing `/loop`. Phase J J5.
- `TaskCreated` and `TaskCompleted`: capture and complete a todo the moment the task is created or finished, instead of at Stop. They fire only in sessions with the Task tools, so todo-sync at Stop stays as the fallback.
- `${CLAUDE_PLUGIN_DATA}`: keep runtime state out of the `~/.claude/aoforge/` mirror. Follow-up: find which state lives there beyond the mirrored files.
- `mcp__ccd_session__mark_chapter` (Phase J J5): mark phase boundaries in long sessions. Not in the public tools reference; confirm it exists in the session before adopting.
- `mcp__ccd_session__spawn_task` (Phase J J5): the verifier spins off an out-of-scope concern as its own task. Same caveat.
- `mcp__ccd_session_mgmt__list_sessions` (Phase J J5): resume could surface earlier sessions. Same caveat.
- Cleanup, not adoption: rename the legacy `Task` to `Agent` and `SlashCommand` to `Skill` in frontmatter and prose; move execute-objective from the deprecated `TaskOutput` to `Read` on the output file.

## Review procedure

Every quarter, or when Claude Code ships a minor version that touches tools or hooks:

1. Fetch the two references: `curl -sL https://code.claude.com/docs/en/tools-reference.md` and `curl -sL https://code.claude.com/docs/en/hooks.md`. Note `claude --version`.
2. Diff the tool and event names against `REQUIRED_TOOLS` and `REQUIRED_EVENTS` in `plugins/aoforge/aoforge/bin/lib/builtin-status.repo.test.cjs`.
3. For a new name, add a row; for a dropped one, delete its row. Update the two pinned lists in the test and the rows in this document together, never one without the other.
4. For every changed row, re-run the search (`rg -n -w "<Name>" plugins/aoforge`), read the hits, and set the status from what a flow, agent or hook actually does.
5. Re-check Candidates: adopt what is worth it as its own objective, drop what no longer applies.
6. Bump Last reviewed, Next review (about 90 days on) and the Claude Code version, then run `node --test plugins/aoforge/aoforge/bin/lib/builtin-status.repo.test.cjs`.
7. Commit the document and the test together.

The test has no clock check, so a late review does not fail CI; the dates above are the reminder.

## Adoption history

- Objective 62 (built-in sweep): TaskCreate and TaskUpdate progress in six flows, plan-mode draft reviews in three, AskUserQuestion for every discrete choice, the `allowed-tools` declarations that go with them. See [built-in-sweep.md](built-in-sweep.md).
- Objective 63: the session task list (TaskCreate, TaskUpdate and TaskList, or TodoWrite) as `/aoforge:todo`'s in-session store, `aof-tools todo sync` and the todo-sync Stop hook, the hook coexistence suite, and this inventory.
