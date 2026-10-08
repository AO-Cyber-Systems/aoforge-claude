---
title: "Managing the plan"
weight: 30
lede: "Changing scope mid-milestone: adding objectives, auditing, archiving, and fixing drift."
---

{{< commands group="objective,milestone,list-objective-assumptions,sync-roadmap,cleanup" >}}

{{< callout title="Most of these are user-typed only" type="warn" >}}
`/aoforge:objective`, `/aoforge:milestone` and `/aoforge:cleanup` all carry
`disable-model-invocation: true`. Claude cannot fire them — you type them. They
mutate planning state in ways that are tedious to undo.
{{< /callout >}}

## /aoforge:objective

```text
/aoforge:objective add "add webhook retry with exponential backoff"
/aoforge:objective remove 7
```

Adds or removes an objective in the current milestone's roadmap.

{{< callout title="remove renumbers everything above it" type="danger" >}}
`remove` cascade-renumbers every objective above the one you removed. Objective 8
becomes 7, 9 becomes 8, and so on — including their directory names. If you have
notes, branches or issues referencing objective numbers, they will be wrong
afterwards.

`add` also slugifies the whole description into the directory name, so keep
descriptions short or you get a very long path.
{{< /callout >}}

The `insert` subcommand (decimal objectives like `4.1`) was removed in v1.2. Use
`add` instead.

## /aoforge:milestone

```text
/aoforge:milestone new
/aoforge:milestone audit
/aoforge:milestone gaps
/aoforge:milestone complete
```

**`new`** opens a milestone: fresh requirements scoping and a fresh roadmap inside
an existing project.

**`audit`** checks that every v1 requirement was genuinely delivered — not that
every objective is ticked, but that the requirements those objectives existed to
satisfy are actually met. It reports gaps.

**`gaps`** turns audit findings into gap-closure objectives you can plan and build.

**`complete`** archives the milestone to `MILESTONES.md` and
`.planning/milestones/`, then opens the next.

## /aoforge:list-objective-assumptions

```text
/aoforge:list-objective-assumptions 5
```

Shows what Claude intends to do for an objective **without creating any files**.
Read it before planning; if the intent is wrong, run `/aoforge:discuss-objective`
and correct it there. Far cheaper than discovering the misunderstanding after a
build.

## /aoforge:sync-roadmap

```text
/aoforge:sync-roadmap --dry-run
/aoforge:sync-roadmap
/aoforge:sync-roadmap --interactive
```

Reconciles `ROADMAP.md` checkbox state against on-disk `SUMMARY.md` presence.
Default behaviour silently corrects drift; `--dry-run` previews; `--interactive`
prompts per change.

Run it when work happened outside AOForge, or when the roadmap and reality
disagree about what's done.

## /aoforge:cleanup

```text
/aoforge:cleanup
```

Archives objective directories from completed milestones to reduce clutter. Only
touches completed work, and only when you explicitly ask.
