---
title: "Existing codebases"
weight: 40
lede: "Adopting AOForge on code that already exists — map it first, then plan against reality."
---

AOForge's default assumption is a greenfield project. On an existing codebase, the
roadmapper needs to know what is already there or it will plan work that duplicates
or contradicts it.

## Map first

```text
/aoforge:map-codebase
```

This dispatches `codebase-mapper` agents in parallel, each analysing a different
angle:

- **Stack** — languages, frameworks, build tooling, dependency posture.
- **Architecture** — module boundaries, data flow, entry points.
- **Quality** — test coverage shape, conventions actually followed (not the ones
  in the style guide).
- **Concerns** — things that will bite: coupling, dead code, risky patterns.

Findings land in `.planning/codebase/`.

You can scope it to one area:

```text
/aoforge:map-codebase api
```

### Confidence tagging

Every concern the mapper raises carries an explicit confidence marker:

| Marker | Meaning | Who acts on it |
|---|---|---|
| `VERIFIED` | The agent confirmed it by reading the code | Planners act on it |
| `SUSPECTED` | Pattern-matched but not confirmed | Reported, not acted on |

This exists because an agent that speculates confidently produces plans that fix
imaginary problems. Only `VERIFIED` findings feed the planner.

## Then initialise

```text
/aoforge:new-project
```

`new-project` detects the existing `.planning/codebase/` output and grounds the
roadmap in it — objectives reference real modules, and the requirements reflect
what is already built rather than restating it.

## Security posture

Worth running once on any inherited codebase:

```text
/aoforge:security-audit
```

This works standalone — it does not need `.planning/` to exist. It fans out
`security-auditor` agents across three domains: secrets, auth flows, and dependency
risk, then reports code-level findings against the OWASP Top 10.

Scope it if the codebase is large:

```text
/aoforge:security-audit src/api
/aoforge:security-audit secrets-only
```

Findings carry the same `VERIFIED` / `SUSPECTED` confidence tagging as the mapper.

## Migrating an older AOForge project

Projects created before the [intent model](/docs/concepts/intent-model/) landed
have no `kind` on `PROJECT.md` and no `work` on their objectives. Migrate them:

```text
/aoforge:status check
```

If it reports missing intent frontmatter, the health check offers a migration that
adds it. Migration always backs up to `.planning/.migrate-backup-{timestamp}/`
before writing anything.

## Working with a roadmap that drifted

If objectives were completed outside AOForge — or a `SUMMARY.md` exists for work
whose roadmap checkbox was never ticked — reconcile them:

```text
/aoforge:sync-roadmap --dry-run
```

Previews what would change. Drop `--dry-run` to apply, or use `--interactive` to
approve each change individually. It compares `ROADMAP.md` checkbox state against
on-disk `SUMMARY.md` presence and corrects the roadmap to match reality.
