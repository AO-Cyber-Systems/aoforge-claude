---
title: "Commands"
weight: 30
lede: "Every skill, grouped by what you're trying to get done. All tables on these pages are generated from the plugin source."
---

## The complete surface

{{< commands >}}

## A note on who can invoke what

Six skills carry `disable-model-invocation: true`. Claude **cannot** fire them —
you must type them yourself. They all mutate planning state in ways that are
annoying to undo:

| Command | Why it's user-only |
|---|---|
| `/aoforge:objective` | `remove` cascade-renumbers every objective above it |
| `/aoforge:milestone` | archives and transitions milestone state |
| `/aoforge:workstreams` | creates and merges git worktrees |
| `/aoforge:cleanup` | moves objective directories out of the working tree |
| `/aoforge:settings` | rewrites `config.json` |
| `/aoforge:set-profile` | changes the model tier for every agent |

If Claude needs the equivalent operation it uses `aof-tools` directly, or asks you
to type the command.
