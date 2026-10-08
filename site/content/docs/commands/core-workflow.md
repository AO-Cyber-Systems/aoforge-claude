---
title: "Core workflow"
weight: 10
lede: "The commands that plan, build and verify. These are the ones you use daily."
---

{{< commands group="new-project,discuss-objective,research-objective,plan-objective,execute-objective,build,verify-work,quick,micro,debug" >}}

## Choosing a tier

The single biggest cost lever in AOForge is picking the right entry point.

| Scope | Command | What runs |
|---|---|---|
| Sub-30 LOC, one file | `/aoforge:micro` | No agents. ~2k token floor. |
| Under 5 files, under 200 LOC, no new abstractions | `/aoforge:quick` | One executor. No planner, no verifier. |
| Multi-file feature, more than one subsystem | `/aoforge:build` | Full plan → execute → verify |
| Something is broken | `/aoforge:debug` | Structured investigation with persistent state |

## /aoforge:build

The workhorse. Chains planning, execution and verification with gates in between.

```text
/aoforge:build 4
/aoforge:build "add rate limiting to the public API"
/aoforge:build 4 --pause --model budget
```

{{< triggers name="build" >}}

| Flag | Effect |
|---|---|
| `--pause` | Stop after planning so you can review before execution |
| `--skip-research` | Skip the research agent — use on familiar ground |
| `--work TYPE` | Override the objective's work type |
| `--tdd POSTURE` | Override the derived TDD posture |
| `--depth LEVEL` | `quick` / `standard` / `comprehensive` |
| `--model PROFILE` | `quality` / `balanced` / `budget` for this run only |

The last four override the [intent model](/docs/concepts/intent-model/) resolution
for this run without changing any files.

## /aoforge:plan-objective

Planning on its own, when you want to review before committing to execution.

```text
/aoforge:plan-objective 4
/aoforge:plan-objective 4 --research --depth comprehensive
/aoforge:plan-objective 4 --gaps          # plan gap-closure work after verification
```

Runs `objective-researcher` → `planner` → `job-checker`. The job-checker is the
part worth knowing about: it reads the plan *before* it executes and asks whether
running it would actually achieve the objective's goal. Disable it with
`workflow.job_check: false` if you find it redundant on a familiar project.

## /aoforge:execute-objective

Execution on its own, against plans that already exist.

```text
/aoforge:execute-objective 4
/aoforge:execute-objective 4 --gaps-only   # only the gap-closure jobs
```

Groups jobs into [waves](/docs/concepts/waves/) and dispatches each to an
`executor` in a fresh window and its own git worktree.

## /aoforge:verify-work

```text
/aoforge:verify-work 4
```

Tests against the objective's goal, not against the task list. Produces
`VERIFICATION.md` and `UAT.md`. Backend-aware: web surfaces are driven through
Playwright, Flutter through Maestro.

If it finds gaps, the objective's status becomes `gaps_found`; plan the follow-up
with `/aoforge:plan-objective 4 --gaps`.

## /aoforge:quick

```text
/aoforge:quick "add a --json flag to the status command"
/aoforge:quick --full     # forces the full quick pipeline
```

One executor, atomic commits, no planning ceremony. If the change turns out to be
bigger than the cutoff, it tells you and suggests `/aoforge:build`.

## /aoforge:micro

```text
/aoforge:micro "rename userId to accountId in auth.go"
```

The cheapest path. No agents at all. It has its own commit flow:

```bash
aof-tools micro start "<description>"
aof-tools micro commit [--files <path>...]
aof-tools micro abort
```

## /aoforge:debug

```text
/aoforge:debug "login redirects to 404 after password reset"
```

A different loop from build. The `debugger` agent works a structured scientific
method — hypothesis, prediction, experiment, evidence — and writes it all to
`.planning/debug/`. That persistence is the point: a hard bug outlives a context
window, and starting over from scratch each session is how bugs stay unfixed.

Resolved sessions archive to `.planning/debug/resolved/`.

{{< triggers name="debug" >}}
