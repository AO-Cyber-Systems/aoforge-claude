# Built-ins: progress, plan mode and questions

DevFlow skills and workflows use Claude Code's built-in task, plan-mode and question tools instead of ad hoc prose. This is the one rule set for all three. Load it with `@~/.claude/devflow/references/built-ins.md` in a skill's `<execution_context>`.

## 1. Progress

Report each stage of a flow as a task. Create a task when a stage starts, or create every stage up front when the list is known. Set it `in_progress` as the stage starts and `completed` when it ends. Delete the task of a stage the flow skips. The subject is imperative, `activeForm` is present continuous.

```
**Progress tracking (if available):**

TaskCreate(subject="Plan: ${DESCRIPTION}", description="Planning the quick task", activeForm="Planning the quick task")
TaskUpdate(taskId=plan_task_id, status="in_progress")
...
TaskUpdate(taskId=plan_task_id, status="completed")
TaskUpdate(taskId=check_task_id, status="deleted")
```

Head every block `**Progress tracking (if available):**`. Since Claude Code v2.1.268 the task tools are provided by default only on older models (Claude 3.x, Opus 4-4.7, Sonnet 4-4.6, Haiku 4.5); newer models get them with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. Without them, skip the calls: the `DF ►` banners still show the stage.

Progress belongs to the orchestrator. Subagents do not create flow tasks. A skill declares `TaskCreate` and `TaskUpdate` in its `allowed-tools` when its flow (or a workflow it references) calls them.

## 2. Plan-mode draft review

Use plan mode when the user should approve a draft before it is published: a PROJECT.md, a REQUIREMENTS.md, a roadmap, a set of TRDs, a milestone entry. It is not for a strategy summary with nothing to approve.

1. Finish the draft first, and run every command the plan needs. Plan mode blocks edits, and shell commands outside the read-only set prompt.
2. `EnterPlanMode()`.
3. Put the draft in the plan: the full text for a short document, a structured summary with paths for a TRD set or a roadmap. End with an "On approval" list of the exact publish steps (`doc put`, `plan push`, the commit).
4. `ExitPlanMode()`. The user approves, or says "No, keep planning" with feedback.
5. Approved: if the approved plan carries the user's own edits (Ctrl+G opens it in an editor), apply them to the draft, then publish. Approval switches the session's permission mode to the one the user picks.
6. "No, keep planning": add a `## Requested changes` section to the plan stating the feedback concretely, and call `ExitPlanMode()` again. Approving that plan authorises applying the changes (edit the draft, or re-run the agent in revision mode). Then present the revised draft again from step 2.

Never publish, spawn an agent that writes, or commit while in plan mode: approval exits it first.

**Skip rule.** A flow skips the review exactly where it already auto-approves: `--auto`, and `workflow.auto_advance` for flows that chain (plan-objective, milestone complete). new-project keys on `--auto` only, because it writes `workflow.auto_advance: true` into every new config, so keying on it would remove the roadmap approval for every interactive user. Put the skip line (`**Skip if:** ...`) within the 20 lines above `EnterPlanMode()`. A headless (`-p`) run cannot approve a plan, so it uses `--auto`.

**allowed-tools.** Declare `EnterPlanMode`. Never list `ExitPlanMode`: its permission prompt is the plan approval, and pre-approving it could approve the draft unseen.

## 3. Questions

Every discrete choice uses AskUserQuestion. A choice is a question whose answers the flow can enumerate and route.

```
AskUserQuestion([
  {
    header: "Max retries",
    question: "The checker still reports issues after 3 revisions. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Provide guidance", description: "You give direction and the planner retries" },
      { label: "Force proceed", description: "Execute despite the remaining issues" },
      { label: "Abandon", description: "Stop here and plan manually" }
    ]
  }
])
```

- **Limits.** 1-4 questions per call, 2-4 options per question, a header of at most 12 characters, labels of 1-5 words. Never add an "Other" option: the tool always offers one, and the user can always type.
- **Order.** The recommended option comes first and ends with ` (Recommended)`. Recommend the safe option, never a destructive one. Use `multiSelect: true` only for choices that are not exclusive.
- **Keep the flow.** A conversion changes the form, not the outcomes: keep each `If "<label>"` routing and the prompt's gating (a prompt skipped in yolo, autonomous or `--auto` stays skipped).
- **Runtime lists** (sessions, todos, decisions, branches): up to 4 entries become the options. With more than 4, print the numbered list, offer the first 4, and say the user may type a number under Other.
- **Free text** (a description, an issue report, pasted errors, "pass or describe what's wrong") stays prose. Ask it in plain prose and never call AskUserQuestion without options. If the scanner flags the line, add `<!-- builtin-audit: allow free-text: <reason, 20+ chars> -->` on the line or the line above. Inside a fenced block Claude prints to the user the comment would be printed: reword the line out of menu shape instead.
- **Subagents.** A flow a subagent runs (the planner runs discovery-objective.md, the executor runs execute-trd.md) cannot reach the user. It returns a `## CHECKPOINT REACHED` with the options, and the orchestrator asks.
- **Unattended flows** (adopt, `--auto`, `--non-interactive`) never ask. A skill that must never ask lists `disallowed-tools: AskUserQuestion`.
- **allowed-tools.** A skill declares `AskUserQuestion` when its flow, or any workflow it references, calls it.

## 4. Enforcement

`plugins/devflow/devflow/bin/lib/builtin-audit.cjs` finds prose choice prompts, AskUserQuestion schema breaks, undeclared built-ins and plan-mode spans. `plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` runs it over every skill and active workflow in CI. The list of prompts, their planned conversions and the progress and plan-mode plans is `docs/built-in-sweep.md`.

## 5. Todo store

`/devflow:todo` keeps the session task list as the in-session store of a todo and the todo files (or GitHub issues in store mode) as the durable archive. Only the todo flows put a todo in the session list, and they do it in one form so the replay can find it again.

- **Subject.** `Todo: <title>`. The prefix is what marks a task as a todo: a progress task never uses it, and a todo task is never a progress task. The todo flows create no progress tasks.
- **Identity.** The stem is the archive file stem, `<YYYY-MM-DD>-<slug>`. TaskCreate carries it as metadata `{devflow_todo: "<stem>"}`; TodoWrite carries it as the suffix ` [todo:<stem>]` on the item's content (`Todo: <title> [todo:<stem>]`). A todo with neither is matched by its title and its creation date.
- **Lifecycle.** `add` creates the item `pending`, then writes the archive. "Work on it now" sets it `in_progress` and leaves the archive todo pending. Completion is `TaskUpdate` with `status="completed"` (or the TodoWrite item `completed`): the todo-sync Stop hook, or `df-tools todo sync` when `list` runs, carries it into the archive.
- **Merge direction.** The merge only moves forward: a session item missing from the archive is added, a completed one completes its archive todo. A deleted session item never removes an archive todo, a pending one never reopens a completed todo, and a second sync changes nothing.
- **Who writes.** The session list is read from the transcript, so subagents do not create todos: their lists are not the user's session list.
- **No task tools.** On newer models without `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` neither TaskCreate nor TodoWrite exists. The flows then skip the session calls and are archive-only, and "Work on it now" completes the todo at once.

The skill declares `TaskCreate`, `TaskUpdate`, `TaskList` and `TodoWrite`. `plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs` holds the todo flows to this convention.
