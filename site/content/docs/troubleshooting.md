---
title: "Troubleshooting"
weight: 80
lede: "The failures people actually hit, and what to do about each."
---

## A hook blocked my command

The model receives the denial reason and usually corrects itself. When you need to
override deliberately:

```bash
AOFORGE_ALLOW_RAW_COMMIT=1 git commit -m "..."
```

Every gate and its escape hatch is listed on
[gates and enforcement](/docs/configuration/gates/). Prefer a one-off prefix over
an export — an exported escape hatch is a gate you removed.

If you are overriding the same gate repeatedly, log it so the friction is
measurable rather than anecdotal:

```bash
aof-tools override --gate edits --reason "..."
aof-tools override --list
```

### A gate fired on text that only *mentions* a command

`gate-commits` strips heredoc bodies and quoted arguments before matching, so
prose about `git commit` is not gated. `changelog-on-tag` and `gate-interactive`
do not yet do this, so writing documentation containing a version-tag command or
an auth command inside a heredoc can trip them.

Escape with `AOFORGE_SKIP_CHANGELOG_GATE=1` or
`AOFORGE_SKIP_INTERACTIVE_GATE=1` respectively.

## "Project already initialized"

`/aoforge:new-project` found an existing `.planning/PROJECT.md`. That is a safety
check. To genuinely start over, delete `.planning/` first. To add a new phase of
work to an existing project, use `/aoforge:milestone new` instead.

## Quality is dropping in a long session

That is context rot, and the fix is the one AOForge is built around:

```text
/aoforge:status pause
/clear
/aoforge:status resume
```

Clearing between major commands is the intended rhythm, not an emergency measure.
State lives on disk, so the window is safe to throw away.

## Plans seem wrong or misaligned

Almost always the planner making an assumption you would have corrected in
seconds. Two cheap fixes, both before any code is written:

```text
/aoforge:list-objective-assumptions 4    # see the intent, no files created
/aoforge:discuss-objective 4             # record your preferences into CONTEXT.md
```

Then re-plan. Also check whether the `(kind, work)` resolution is what you expect:

```bash
aof-tools intent resolve --objective 4
```

## Execution produced stubs instead of real code

The plan was too ambitious. Jobs should hold two to three tasks. A job larger than
one context window produces scaffolding and `TODO` comments, because that is what
fits.

Re-plan with smaller scope. If the objective itself is too big, split it with
`/aoforge:objective add` — though note that `remove` renumbers, so prefer adding a
narrower objective over restructuring existing ones.

## A subagent reported failure but the work was done

A known Claude Code classification quirk. AOForge's orchestrators spot-check actual
output before reporting failure, but if you see a failure message, check `git log`
before re-running anything — the work may have succeeded and re-running will
duplicate it.

The `verify-commits` SubagentStop hook exists to catch the opposite case: a
subagent that finished without producing any commits.

## I lost track of where I am

```text
/aoforge:status
```

Reads every state file and tells you your position and next action.

## The roadmap disagrees with reality

```text
/aoforge:sync-roadmap --dry-run
/aoforge:sync-roadmap
```

Reconciles checkbox state against on-disk `SUMMARY.md` presence. Use
`--interactive` to approve each change.

For deeper drift:

```bash
aof-tools validate consistency
aof-tools validate health --repair
```

## Costs are too high

In order of impact:

1. **Use a smaller entry point.** `/aoforge:micro` and `/aoforge:quick` exist
   precisely so `/aoforge:build` is not the answer to a one-line fix.
2. **Switch profile:** `/aoforge:set-profile budget`.
3. **Turn off agents you do not need** via `/aoforge:settings` —
   `workflow.research` and `workflow.job_check` are the two worth disabling on
   familiar ground. Keep `verifier`.
4. **Measure it:** `aof-tools context --limit 150` shows where the window actually
   goes.

## Working on something sensitive

```json
{ "planning": { "commit_docs": false } }
```

Then add `.planning/` to `.gitignore`. Planning artifacts stay local and never
reach git.

## An update overwrote my local changes

Plugin updates replace the plugin directory. Local modifications to the plugin's
own files do not survive — that is what the development install is for:

```text
/plugin marketplace add /absolute/path/to/your/clone
```

Your project's `.planning/` is never touched by an update.

## Skills reference a file I cannot find

Look in `~/.claude/aoforge/`, not in the plugin directory. Skills use
`@~/.claude/aoforge/...` paths, populated by the `sync-runtime` hook at session
start. If the mirror looks stale, start a new session — it re-mirrors whenever the
bundled version differs from `.plugin-version`.

## An agent is stuck repeating itself

`guard-no-progress` warns at three identical tool calls and escalates to `ask` at
five. If you see that escalation, the agent is genuinely stuck — redirect it rather
than approving. Disable with `AOFORGE_SKIP_PROGRESS_GUARD=1` if it misfires.

## "This agent is isolated in the worktree…"

That is **Claude Code's** harness guard, not AOForge's. It refuses compound Bash
commands it cannot statically verify, including commands with no git in them, and
no `AOFORGE_*` variable affects it.

The workaround is one plain command per Bash call.
