---
title: "Advanced execution"
weight: 40
lede: "Parallel worktrees, chained skills, and handing TTY-bound commands to your own shell."
---

{{< commands group="workstreams,flow,handoff" >}}

## /aoforge:workstreams

Runs independent *objectives* in parallel using git worktrees, then merges them
back. This is a level above wave parallelism — waves parallelise jobs inside one
objective; workstreams parallelise whole objectives.

```text
/aoforge:workstreams setup      # provision worktrees for independent objectives
/aoforge:workstreams status     # what's running where
/aoforge:workstreams run        # execute across the workstreams
/aoforge:workstreams merge      # merge completed streams back
```

Configuration:

```json
{
  "workstreams": {
    "worktree_prefix": "../{project}-ws-",
    "branch_prefix": "df/ws-",
    "merge_strategy": "squash"
  }
}
```

`setup` runs a dependency analysis first — objectives that touch the same modules
are not eligible, because the merge would conflict. Under the hood:

```bash
aof-tools workstreams analyze     # which objectives can run independently
aof-tools workstreams provision   # create the worktrees and branches
aof-tools workstreams reconcile   # resolve state after merges
```

{{< callout title="User-typed only, and genuinely advanced" type="warn" >}}
`/aoforge:workstreams` carries `disable-model-invocation: true`. It creates and
merges git worktrees, and a bad merge strategy across three concurrent streams is
a real mess to unpick. Use it when you have several genuinely independent
objectives and the wall-clock saving matters.
{{< /callout >}}

## /aoforge:flow

Chains skills into one request.

```text
/aoforge:flow build objective 4 then sync to github
/aoforge:flow research, plan, then build objective 6
```

It parses the described sequence and invokes each skill in order, passing state
between them. Use it when you already know the sequence and would rather not type
three commands and wait between each.

## /aoforge:handoff

Hands a command that needs a TTY or your shell environment over to your actual
shell.

```text
/aoforge:handoff gh auth login
/aoforge:handoff mise install
```

### Why this exists

Some commands cannot run in an agent's non-interactive Bash: TTY-interactive auth
(`gh auth login`, `doctl auth init`, `aws sso login`, `op signin`, `npm login`),
password prompts, and shell-flow tools that depend on sourced rc files
(`nvm use`, `pyenv shell`, `conda activate`, `direnv allow`, `mise use`,
`asdf shell`).

Without a mechanism, Claude has to stop and ask you to paste `! cmd`, which breaks
both its flow and yours.

### With the watcher running

```bash
aoforge-watch start     # start the daemon for this project
aoforge-watch status
```

Now the `gate-interactive` hook intercepts those commands, queues them, and denies
the Bash call with "queued for daemon — continue with other work." The daemon runs
the command in your interactive shell; the `route-results` hook injects the result
into Claude's next turn. Claude never asks you to paste anything.

### Without the watcher

The handoff skill prints the command for you to run with `! cmd`. Still useful —
it recognises which commands need this and does not waste a turn failing first.

See the [handoff guide](/docs/guides/handoff/) for the daemon's allowlist,
auto-launch, multi-project watching and PTY support.
