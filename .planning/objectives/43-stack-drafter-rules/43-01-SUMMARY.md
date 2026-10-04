---
objective: 43-stack-drafter-rules
trd: "01"
job: 43-01
subsystem: stack-drafter
tags: [stack-runners, stack-evidence, makefile, taskfile, gap-closure, SDR-08]
requires: []
provides:
  - "stack-runners parseMakefile: simple $(VAR) / ${VAR} expansion in recipe lines from ?= := ::= = assignments (depth <= 3)"
  - "stack-runners parseTaskfile / collectTask: `internal` flag on tasks and runner targets"
  - "stack-runners hasTarget: false for an internal Taskfile task or its alias (stack verify reports target_missing)"
  - "stack-evidence readRunnerTargets: internal targets are never candidates (the index still holds their bodies)"
affects: ["43-02", "43-04", "43-05", "43-06 fleet rollout"]
tech-stack:
  added: []
  patterns:
    - "expansion belongs in the parser: bodies, hasTarget and dependency expansion all share one expanded text"
    - "flag, don't delete: internal tasks stay in parsed.tasks and ctx.index; only the candidate push filters them"
key-files:
  created:
    - .planning/objectives/43-stack-drafter-rules/43-01-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/stack-runners.cjs
    - plugins/devflow/devflow/bin/lib/stack-runners.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-runner-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
decisions:
  - "A reference that cycles (`A = $(A) x`, `A = $(B)` / `B = $(A)`) or chains past three variables stays verbatim as a WHOLE, so it is never half-expanded. Nested calls return null when anything inside was blocked; the top-level call never does, so sibling references on the same line still expand."
  - "A value that contains an unknown reference is still substituted (`GO := go$(SUF)` gives `go$(SUF)`). Only cycles and the depth bound block."
  - "`$$` is consumed as a token and kept as written, so `$$(GO)` and `$${GO}` are never read as references, while `$$$(GO)` is `$$` plus a real reference (`$$go`)."
  - "`+=` and `!=` define nothing. `?=` keeps the first definition; `:=`, `::=` and `=` take the later one."
  - "`internal` accepts `true` and `\"true\"` only (via yamlScalar); a templated or any other value is not provably internal, so it stays false."
  - "hasTarget returns false, not 'unknown', for an internal task even when the Taskfile has `includes:`: the task was found, it just is not invocable."
metrics:
  duration: "~9m wall clock (split across two turns)"
  completed: 2026-10-03
  tasks: 2
  files: 7
---

# Objective 43 TRD 01: Runner readers - Make variable expansion (D1) and internal Taskfile tasks (D5) Summary

`parseMakefile` now expands simple `$(VAR)` / `${VAR}` references from the Makefile's own assignments, so an aggregate target whose Go leg runs `$(GO) build` drafts `make build/test/lint`. Taskfile tasks marked `internal: true` are flagged through parse, `hasTarget` and the candidate list, so they are never proposed and `stack verify` reports them `target_missing`.

## What changed

### D1: Make variable expansion (Task 1)
- `stack-runners.cjs` `parseMakefile` matches assignments (`[export|override] NAME ?=|::=|:=|= value`) before `MAKE_RULE`, so `GO := go` can never be read as a rule. Values lose an unescaped trailing `# comment`.
- `expandMakeVars` runs after the whole scan, because make expands recipes lazily and a variable defined below its rule still applies. It substitutes `$(NAME)` / `${NAME}` for plain identifiers present in the map, bounded at three variables deep.
- Left verbatim: `$$...`, `$(shell ...)`, `$(call ...)`, `$(V:a=b)`, `$(wildcard ...)`, anything with a space, comma or colon, undefined names, cycles and over-deep chains.
- The return shape `{ targets, hasInclude, deps, defaultGoal }` is unchanged and nothing new is exported.

### D5: internal Taskfile tasks (Task 2)
- `readTaskProps` reads `internal:` (default false); `parseTaskfile` and `collectTask` carry it onto tasks and runner targets.
- `hasTarget` `case 'task'` finds the task by name or alias and returns `!task.internal`. An unmatched name keeps the includes / false logic.
- `stack-evidence.cjs` `readRunnerTargets` does `if (t.internal === true) continue;` at the candidate push only. `ctx.index`, `dependedOnIndex` and `targetUnits` are untouched, so a public task that depends on or calls an internal one still expands its body (E13c / E13d prove it through `bodyStacks`).
- `stack-verify.cjs` needed no edit: `checkRunner` already maps `hasTarget === false` to `target_missing`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two existing expectations encoded the D5 bug**
- **Found during:** Task 2 RED
- **Issue:** The existing fixtures mark `build:relay:internal` (taskfileDepsShape) and `build:agent:internal` (terminalShape) `internal: true`, and two tests asserted that these were proposed. E13 in `stack-evidence.test.cjs` used `build:relay:internal` as its "called from cmds, not listed in any deps" leaf. e2e 11 asserted an `alternate` note for `task build:agent:internal`.
- **Fix:** Per the TRD's error-recovery rule (update only when the old expectation encoded the bug), both were changed in the RED commit so they fail before the fix. E13 now asserts `build:relay:internal` is NOT an item and uses `build:relay:quickdev` (the same leaf shape without the flag) for the `dependedOn: false` / `bodyInvocations` checks; its file-order check uses the same task, which sits before `build:bundle` in the file but after it by name. e2e 11 asserts no note names `build:agent:internal` and that `task build:agent:quickdev` is still an `alternate`. The fixtures themselves are unchanged.
- **Files modified:** `stack-evidence.test.cjs`, `stack-drafter-e2e.test.cjs`
- **Commit:** 7b454b89

**2. [Rule 1 - Bug] Wrong path in my own e2e 19 test**
- **Found during:** Task 2 GREEN
- **Issue:** e2e 19 read the bundled go profile from `bin/stack-profiles/go.md`; the directory is `devflow/stack-profiles/`. Every drafter assertion before that line already passed.
- **Fix:** `path.join(__dirname, '..', '..', 'stack-profiles', 'go.md')`, committed with the GREEN change.
- **Commit:** e3abeae9

No other deviations. No existing `stack-runners.test.cjs` expectation changed, so none had encoded the verbatim-`$(GO)` bug.

## Preflight note

My first `exec-context check` ran from the main checkout (cwd), so it reported `checkout` as the main repo and registered a claim for 43-01 there. I re-ran it with `--cwd <worktree>` (passed, `checkout` = the worktree, branch `df/exec-43-01`), then released only the stray id-43-01 claim on the main checkout. All work and commits were made in the worktree.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Make variable expansion (D1) | `node --test .../stack-runners.test.cjs .../stack-drafter-e2e.test.cjs` | 0 | PASS (65 unit, 20 e2e at that point) |
| 2: internal Taskfile tasks (D5) | `node --test .../stack-runners.test.cjs .../stack-evidence.test.cjs .../stack-drafter-e2e.test.cjs` | 0 | PASS (95 unit/evidence, 21 e2e) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../stack-runners.test.cjs` | 1 | FAIL (correct): 2g-2k, 2m, 2n fail on verbatim `$(GO)`; 2l and 2o pass as guards |
| RED (Task 1) | `node --test --test-name-pattern="18:" .../stack-drafter-e2e.test.cjs` | 1 | FAIL (correct): `make build` and `make test` are `off_stack` (tool stack unknown) |
| GREEN (Task 1) | same two commands | 0 | PASS (correct) |
| RED (Task 2) | runners + evidence + e2e | 1 | FAIL (correct): 5g-5k, E13, E13c, E13d, e2e 11, e2e 19 (shows `tidy.apply: task go:mod:tidy` and `deps: task npm:install` drafted from internal tasks) |
| GREEN (Task 2) | runners + evidence + e2e | 0 | PASS (correct) |

Commits: `6944ba46` (RED 1), `1dc6ada7` (GREEN 1), `7b454b89` (RED 2), `e3abeae9` (GREEN 2).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | - | not_available |
| test | `node --test '.../plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` | 0 | PASS (942 tests, 0 failed, 0 skipped; run after each task) |
| build | none | - | not_available |

## Read-only spot check (TRD verification section)

`node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo> stack init --raw` (no `--write`), run with this worktree's df-tools:

- **devflowops:** `build: make build`, `test: make test`, `lint: make lint` (apply `make lint-go-fix`). Before this TRD `make build` and `make test` were `off_stack`.
- **ao-terminal:** no internal task in the draft, candidates or notes; `tidy` is absent, so the go tier's `go mod tidy -diff` / `go mod tidy` applies.
- `git status --porcelain` was identical before and after in both repos (only each repo's pre-existing `.planning/.progress-guard.json`, plus `.dup-detect-log.jsonl` in devflowops).

## Observations for later TRDs (not changed here)

- The devflowops preview still prints `root build: make build - off_stack` and `root test: make test - mixed_stack / breadth-unknown` notes next to the correct `make build` / `make test` commands. Those come from `stack-draft.cjs` (owned by 43-04 and 43-05), not the runner readers. I did not investigate which duplicate candidate produces them.
- ao-terminal's preview drafts `deps: task init`, while the golden has `deps: npm ci` and `bootstrap: task init`. That is placement/classification, outside D1 and D5.
- `scopeOf` was not widened: the TRD's recovery option was unnecessary because e2e 18 passed once `$(GO)` expanded.

## Discovered commands

None. The profile's test command was `node --test` over the touched files, matching the TRD's gates.

## Post-TRD Verification

- Auto-fix cycles used: 0 (two test-side corrections noted under Deviations)
- Must-haves verified: 4/4 (expansion for `?=` `:=` `::=` `=` at depth 3 with `$(shell ...)`/calls/unknowns verbatim; aggregate Make drafts `make build/test/lint`; internal tasks are never candidates and `hasTarget` is false; internal tasks stay in the parsed index so callers still expand)
- Gate failures: None

## Self-Check: PASSED

- All seven modified files exist and match the TRD `files_modified` list; `stack-verify.cjs`, `stack-draft.cjs` and `stack-classify.cjs` are untouched (`git diff --stat 76d816aa..HEAD`).
- Commits found: 6944ba46, 1dc6ada7, 7b454b89, e3abeae9.
- ROADMAP.md and STATE.md were not edited (the orchestrator updates them after the wave merge).
