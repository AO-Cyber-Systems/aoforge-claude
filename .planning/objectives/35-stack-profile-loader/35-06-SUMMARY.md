---
objective: 35-stack-profile-loader
trd: "06"
subsystem: agents
tags: [stack-profile, planner, executor, validation-gates, generated-files]

# Dependency graph
requires:
  - objective: 35-stack-profile-loader (TRD 35-03)
    provides: "`df-tools stack resolve` / `stack command <key>` / `stack context <slice>` CLI surface"
  - objective: 35-stack-profile-loader (TRD 35-04)
    provides: "`stack init` (profile authoring) so a project can have a `.planning/STACK.md` for the profile to resolve against"
provides:
  - "planner.md: `<validation_gates>` filled from `df-tools stack command <key> --raw` per `gates.task` key, with a codebase-scrape fallback restricted to keys that resolve to `discover` or when `stack` is an unknown command"
  - "executor.md: loads `stack context executor --raw` once in load_project_state, runs the profile `loop` after each edit and `gates.task` before each commit, refuses to hand-edit generated files, and proposes discovered commands via a new SUMMARY `## Discovered commands` section"
affects: ["35-08 (next wave edits planner.md Step 4 — untouched here)", future TRDs executed under a project with a real `.planning/STACK.md`]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Profile-first, scrape-fallback: every new instruction names its degrade path (`discover` -> codebase scrape; unknown `stack` command -> today's behaviour) rather than assuming the profile CLI exists"
    - "`not_available` is a first-class gate outcome distinct from PASS/FAIL — a command the executor could not find or run is reported, never silently treated as passing"

key-files:
  created: []
  modified:
    - plugins/devflow/agents/planner.md
    - plugins/devflow/agents/executor.md

key-decisions:
  - "Did not add a `</step>` after the new load_project_state block — the original step's closing tag already sits after the Flutter UI bootstrap detector section (line 157 post-edit); adding one early would have orphaned the Flutter section from the step and left a stray unmatched `</step>` later in the file. Caught via `grep -n \"<step\\|</step>\"` diff before committing."
  - "Discovered-commands SUMMARY block uses the same single-level ```markdown fence convention as the adjacent Task Evidence / Validation Gate Results blocks (not a doubly-nested fence) — matches existing file convention rather than the TRD's own display-only outer fence."

requirements-completed: ["STK-06"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: ~25min
completed: 2026-09-27
tokens_input: 3569296
tokens_output: 18472
tokens_cache_read: 3509744
tokens_cache_write: 59450
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 35 TRD 06: Planner and executor read the stack profile Summary

**planner.md fills `<validation_gates>` from `df-tools stack command <key> --raw` per `gates.task` key (codebase scrape only where a key resolves to `discover`); executor.md loads the stack slice once, runs the profile `loop`/`gates.task` with `not_available` (never PASS) for missing commands, refuses to hand-edit generated files, and proposes discovered commands in a new SUMMARY section — Flutter prose in both files is byte-identical to before.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- planner.md: replaced the 3 anchor lines (STACK.md note, `<validation_gates>` procedure, success checklist line) with profile-driven wording; codebase-scrape fallback preserved for `discover` keys and for an unknown `stack` command (older mirror)
- executor.md: added a "Stack profile (load once)" block at the end of `load_project_state` (before the Flutter UI bootstrap detector), a new "## Stack loop, task gates and generated files" section right after `execute_tasks` item 3 (before Flutter UI per-task verification) covering the generated-file guard / inner loop / task gates / discovered commands, a "Discovered commands" SUMMARY evidence block, and a new success-criteria checklist line
- Both Flutter UI sections in both files left byte-identical — verified via unchanged `rg -c -i flutter` counts (planner.md: 20, executor.md: 56) and a diff showing additions only for executor.md

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planner.md — profile-driven validation gates | `node --test plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs` | 0 | PASS (25/25) |
| 2: executor.md — stack slice, loop, task gates, generated guard, Discovered commands | `node --test plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs` | 0 | PASS (8/8) |

Grep evidence (from each task's `<done>` list):

| Check | Result |
|---|---|
| `rg -n "stack command <key> --raw" planner.md` | matches (line 1008) |
| `rg -n 'populated from \`df-tools stack command\` for each \`gates.task\` key' planner.md` | matches (line 1158) |
| `rg -n "Populate from STACK.md with runnable lint/test/build commands" planner.md` | no match (removed) |
| `rg -n "validation_gates populated with runnable commands from STACK.md \(when available\)" planner.md` | no match (removed) |
| `rg -c -i flutter planner.md` | 20 (== baseline) |
| `rg -n "stack context executor --raw" executor.md` | matches (line 100, in load_project_state, before Flutter bootstrap heading at 106) |
| `rg -n "^## Stack loop, task gates and generated files" executor.md` (228) `<` `^## Flutter UI per-task verification` (238) | true |
| `rg -n "^## Discovered commands" executor.md` | matches (line 952) |
| `rg -n "not_available" executor.md` | matches (3 occurrences) |
| `rg -n "Never write \`.planning/STACK.md\` yourself" executor.md` | matches (line 236) |
| `rg -c -i flutter executor.md` | 56 (== baseline) |
| `git diff executor.md \| rg "^-[^-]"` | empty (additions only) |

## Task Commits

1. **Task 1: planner.md — profile-driven validation gates** - `8439305` (feat)
2. **Task 2: executor.md — stack slice, loop, task gates, generated guard, Discovered commands** - `4ba46b3` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

_Note: both tasks are `type="auto"`, not TDD — TRD is `type: standard` prose, verified by rg/grep on exact wording plus the existing agent-prose test suites._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| fast verify | `node --test plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs` | 0 | PASS (33/33) |
| wave regression gate | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | PASS (baseline-relative — see below) |

## Discovered commands

None — this TRD edits agent prose only; no project commands were discovered or run against a target codebase.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all `must_haves.truths` from TRD frontmatter — planner fallback wording, planner checklist line, executor stack-context load + loop/gates behavior with `not_available`/skip-on-`none`, generated-file guard pointing to `stack command <generated.regenerate>`, `## Discovered commands` SUMMARY section with no executor-side STACK.md write, degrade-to-today's-behaviour on unknown `stack` command or no STACK.md, byte-identical Flutter sections, executor-isolation + flutter-ui-scope suites passing)
- **Gate failures:** None (the one observed failure in the full run is pre-existing per baseline TSV — see below)

## Regression Gate (baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
Output: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/35-06-full-run.txt` (session scratchpad, not committed)

**Observed totals (informational):** tests 3581, suites 500, pass 3548, fail 1, cancelled 0, skipped 32, todo 0.

**Every failure, classified:**

| File:line | Name | Classification |
|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** — exact match against `.planning/objectives/35-stack-profile-loader/baseline-failures.tsv` line 5 (`file:line<TAB>name`). Per the TRD's known-not-a-regression note (a), this is one of the devflow-watch/handoff-e2e daemon PID-lifecycle-class failures the orchestrator reproduced on a clean base-`0fb49ae` worktree with none of objective 35's code. |

No other failures observed in this run. No re-run was required (the single failure matched the TSV directly, so step 3 of the gate procedure applied and step 4's re-run branch was not reached). No test in the diffed files (`plugins/devflow/agents/planner.md`, `plugins/devflow/agents/executor.md`) appears anywhere in the failing-tests list. `baseline-failures.tsv` was not edited.

**Result: PASS — 0 regressions.**

## Deviations from Plan

None — TRD executed exactly as written. One self-caught authoring slip during Task 2 (added an erroneous `</step>` closing tag that would have orphaned the Flutter UI bootstrap detector section from `load_project_state`) was caught and reverted before commit via `grep -n "<step\|</step>"` structural check; no stray tag reached the committed diff.

## Self-Check

- `plugins/devflow/agents/planner.md` — FOUND
- `plugins/devflow/agents/executor.md` — FOUND
- Commit `8439305` — FOUND (`git log --oneline --all | grep 8439305`)
- Commit `4ba46b3` — FOUND (`git log --oneline --all | grep 4ba46b3`)

## Self-Check: PASSED
