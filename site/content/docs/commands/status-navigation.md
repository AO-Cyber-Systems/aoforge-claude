---
title: "Status and navigation"
weight: 20
lede: "Finding out where you are, what's next, and what everyone else is doing."
---

{{< commands group="status,help,todo,decide,awareness,tui" >}}

## /aoforge:status

The consolidated status command. Four behaviours, one entry point.

```text
/aoforge:status            # progress + the next action
/aoforge:status check      # integrity check across planning files
/aoforge:status pause      # save session context before you stop
/aoforge:status resume     # restore position and continue
```

Both bare (`status resume`) and flag (`status --resume`) forms are accepted.

**`status`** reads every state file and tells you your position and what to do
next. This is the command for "I have no idea where I left off."

**`check`** validates cross-file consistency — roadmap against summaries, state
against objectives — and reports drift. It is also where an intent-model migration
is offered for projects that predate `kind` and `work`.

**`pause` / `resume`** bracket a `/clear`. Pause writes a resume file capturing
what you were mid-thought on; resume restores it. Resume works without a prior
pause — it reconstructs from state files — but pause preserves the nuance.

## /aoforge:todo

```text
/aoforge:todo add "rate limiter should use a sliding window, not fixed"
/aoforge:todo list
```

`add` captures an idea without derailing what you're doing — it lands in
`.aoforge/todos/pending/`. `list` is the morning standup: it merges local todos,
GitHub issues and peer activity into one "what should I work on?" view.

## /aoforge:decide

```text
/aoforge:decide                              # show pending decisions
/aoforge:decide DECISION-003 option-b
```

Resolves a parked `checkpoint:decision` and resumes autonomous execution. See
[checkpoints](/docs/concepts/waves/#checkpoints) for when decisions get parked
rather than answered inline.

## /aoforge:awareness

```text
/aoforge:awareness
/aoforge:awareness --peer-only
/aoforge:awareness --org-only --quarter Q3
/aoforge:awareness --refresh peer
```

Two views, both rendered by default:

- **Peer** — who else is working in this repo, derived from branch activity
  matching `branch_patterns` in config.
- **Org** — progress across the organisation's Product Roadmap project.

The cache is warmed in the background at session start by the
`awareness-cache-populate` hook, with a TTL from `awareness.cache_ttl_minutes`
(10 by default). `--refresh` forces a re-scan; `--no-fetch` skips the git fetch
when you want speed over freshness.

## /aoforge:tui

```text
/aoforge:tui
/aoforge:tui --once        # render one frame and exit
/aoforge:tui --no-color
```

A read-only terminal UI with three stacked panels: parallel sessions, the org tree,
and active initiatives. tmux-safe and reflows on narrow terminals.

## /aoforge:help

```text
/aoforge:help
```

Lists every available command with a one-line description. Useful when you know
AOForge does the thing but not what it's called.
