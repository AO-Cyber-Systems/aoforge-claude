---
objective: 38-doc-auto-correction
trd: "04"
subsystem: docs
tags: [workflows, slash-commands, deprecation-map, consolidated-skills]

requires: []
provides:
  - "10 workflow bodies (objective/todo/status/milestone + plan-objective) that print only live command names"
affects: [38-09, 38-11]

tech-stack:
  added: []
  patterns:
    - "Retired command tokens are rewritten 1:1 per skill-route.cjs DEPRECATION_MAP; usage words attached to the token are corrected alongside it"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/add-objective.md
    - plugins/devflow/devflow/workflows/remove-objective.md
    - plugins/devflow/devflow/workflows/add-todo.md
    - plugins/devflow/devflow/workflows/check-todos.md
    - plugins/devflow/devflow/workflows/health.md
    - plugins/devflow/devflow/workflows/progress.md
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/audit-milestone.md
    - plugins/devflow/devflow/workflows/complete-milestone.md
    - plugins/devflow/devflow/workflows/plan-milestone-gaps.md

key-decisions:
  - "remove-objective's decimal example (16.1) became an integer example (9): decimal objectives were dropped in v1.2 and `objective` has no insert subcommand"
  - "progress.md's `/devflow:milestone complete` stays bare (no `{version}`): the source had none, skill-route does not require one, and complete-milestone.md derives v[X.Y] itself"
  - "insert-objective.md (status: legacy) left untouched per TRD key_links"

patterns-established:
  - "Workflow edits for command renames are token-only: `git diff -U0` must show no step, frontmatter or @-reference changes"

requirements-completed:
  - "DOC-04 (workflows, part A): the consolidated skills' own workflow bodies name only live commands"

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 5min
completed: 2026-09-28
---

# Objective 38 TRD 04: Workflow bodies of the consolidated skills (part A) Summary

**39 retired slash-command tokens across 10 workflow bodies rewritten to their live `objective`/`todo`/`status`/`milestone` subcommand forms. `remove-objective`'s usage line now reads `<objective-number>` and uses integer-only examples.**

## Performance

- **Duration:** ~5 min (edits + commits); full regression suite additional
- **Started:** 2026-09-28T12:21:30Z
- **Completed:** 2026-09-28T12:23:31Z (edits committed)
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Every workflow loaded by the four consolidated skills now prints commands that exist.
- Usage and argument hints were checked against the live skills. `objective <add|remove>`, `todo <add|list>` (the area filter passes through as a residual arg), `status [check|pause|resume]` (`--repair` passes through to `check`) and `milestone <new|audit|complete|gaps>` (`{version}` kept wherever it was present).
- The combined must-have `rg` over all 10 files returns nothing.

## Task Commits

1. **Task 1: objective/todo/health/progress workflows** — `4821cc6` (docs)
2. **Task 2: milestone workflows** — `af9a9f8` (docs)

## Rewritten Tokens (file:line old → new)

### Task 1 — `4821cc6`

| File:Line | Old | New |
|---|---|---|
| add-objective.md:17 | `/devflow:add-objective Add authentication` | `/devflow:objective add Add authentication` |
| add-objective.md:18 | `/devflow:add-objective Fix critical performance issues` | `/devflow:objective add Fix critical performance issues` |
| add-objective.md:24 | `Usage: /devflow:add-objective <description>` | `Usage: /devflow:objective add <description>` |
| add-objective.md:25 | `/devflow:add-objective Add authentication system` | `/devflow:objective add Add authentication system` |
| add-objective.md:99 | `/devflow:add-objective <description>` | `/devflow:objective add <description>` |
| remove-objective.md:17 | `/devflow:remove-objective 17` | `/devflow:objective remove 17` |
| remove-objective.md:18 | `/devflow:remove-objective 16.1` → objective = 16.1 | `/devflow:objective remove 9` → objective = 9 |
| remove-objective.md:24 | `Usage: /devflow:remove-objective <phase-number>` | `Usage: /devflow:objective remove <objective-number>` |
| remove-objective.md:25 | `/devflow:remove-objective 17` | `/devflow:objective remove 17` |
| remove-objective.md:58 | `/devflow:pause-work` | `/devflow:status pause` |
| remove-objective.md:151 | `/devflow:progress` | `/devflow:status` |
| add-todo.md:33 | `/devflow:add-todo Add auth token refresh` | `/devflow:todo add Add auth token refresh` |
| add-todo.md:146 | `/devflow:check-todos` | `/devflow:todo list` |
| check-todos.md:27 | `/devflow:add-todo` | `/devflow:todo add` |
| check-todos.md:34 | `/devflow:add-todo` | `/devflow:todo add` |
| check-todos.md:42 | `/devflow:check-todos` | `/devflow:todo list` |
| check-todos.md:43 | `/devflow:check-todos api` | `/devflow:todo list api` |
| check-todos.md:61 | `/devflow:check-todos [area]` | `/devflow:todo list [area]` |
| health.md:87 | `/devflow:health --repair` | `/devflow:status check --repair` |
| health.md:98 | `/devflow:health --repair` | `/devflow:status check --repair` |
| health.md:122 | `/devflow:health --repair` | `/devflow:status check --repair` |
| health.md:205 | `/devflow:health --repair` | `/devflow:status check --repair` |
| progress.md:135 | `/devflow:check-todos` | `/devflow:todo list` |
| progress.md:332 | `/devflow:complete-milestone` | `/devflow:milestone complete` |
| progress.md:362 | `/devflow:new-milestone` | `/devflow:milestone new` |
| plan-objective.md:357 | `/df:plan-objective ${OBJECTIVE}` | `/devflow:plan-objective ${OBJECTIVE}` |

### Task 2 — `af9a9f8`

| File:Line | Old | New |
|---|---|---|
| audit-milestone.md:202 | `/devflow:complete-milestone {version}` | `/devflow:milestone complete {version}` |
| audit-milestone.md:239 | `/devflow:plan-milestone-gaps` | `/devflow:milestone gaps` |
| audit-milestone.md:247 | `/devflow:complete-milestone {version}` | `/devflow:milestone complete {version}` |
| audit-milestone.md:277 | `/devflow:complete-milestone {version}` | `/devflow:milestone complete {version}` |
| audit-milestone.md:281 | `/devflow:plan-milestone-gaps` | `/devflow:milestone gaps` |
| complete-milestone.md:86 | `/devflow:audit-milestone` | `/devflow:milestone audit` |
| complete-milestone.md:651 | `/devflow:new-milestone` | `/devflow:milestone new` |
| complete-milestone.md:701 | `/devflow:new-milestone` | `/devflow:milestone new` |
| plan-milestone-gaps.md:5 | `/devflow:audit-milestone` | `/devflow:milestone audit` |
| plan-milestone-gaps.md:5 | `/devflow:add-objective` | `/devflow:objective add` *(not in TRD inventory; see Deviations)* |
| plan-milestone-gaps.md:28 | `/devflow:audit-milestone` | `/devflow:milestone audit` |
| plan-milestone-gaps.md:184 | `/devflow:audit-milestone` | `/devflow:milestone audit` |
| plan-milestone-gaps.md:185 | `/devflow:complete-milestone {version}` | `/devflow:milestone complete {version}` |

Total: 26 tokens (Task 1) + 13 tokens (Task 2) = 39. `git diff --stat` for the pair: 10 files, 38 insertions, 38 deletions (`git diff --shortstat 828b0b0 HEAD`). The line counts are symmetric, so no lines were added or removed. plan-milestone-gaps.md:5 carries two tokens on one line.

## Files Created/Modified

- `plugins/devflow/devflow/workflows/add-objective.md`: `objective add` usage and examples
- `plugins/devflow/devflow/workflows/remove-objective.md`: `objective remove <objective-number>`, integer examples, `status pause`, `status`
- `plugins/devflow/devflow/workflows/add-todo.md`: `todo add`, `todo list`
- `plugins/devflow/devflow/workflows/check-todos.md`: `todo add`, `todo list [area]`
- `plugins/devflow/devflow/workflows/health.md`: `status check --repair`
- `plugins/devflow/devflow/workflows/progress.md`: `todo list`, `milestone complete`, `milestone new`
- `plugins/devflow/devflow/workflows/plan-objective.md`: `/df:` → `/devflow:`
- `plugins/devflow/devflow/workflows/audit-milestone.md`: `milestone complete {version}`, `milestone gaps`
- `plugins/devflow/devflow/workflows/complete-milestone.md`: `milestone audit`, `milestone new`
- `plugins/devflow/devflow/workflows/plan-milestone-gaps.md`: `milestone audit`, `milestone complete {version}`, `objective add`

## Decisions Made

- **Integer example for `objective remove`.** `16.1` became `9`. Decimal objectives were dropped in v1.2 (help.md:449), and `objective` has no `insert` subcommand.
- **No `{version}` added to progress.md:332.** The source line had none. `skill-route` does not require one, and complete-milestone.md resolves `v[X.Y]` itself (e.g. line 373). Adding an argument would go beyond a token-only change.
- **`insert-objective.md` not edited.** It is `status: legacy` and exempt under 38-09.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Home-mirror df-tools rejects the global `--cwd` flag**
- **Found during:** Preflight
- **Issue:** `node ~/.claude/devflow/bin/df-tools.cjs --cwd <worktree> exec-context check ...` exited 1 with `Error: Unknown command: --cwd`. The `~/.claude/devflow/` mirror is older than the repo source. `sync-runtime` only re-mirrors on a plugin version change, and no version has been bumped.
- **Fix:** Preflight and both commits used the worktree's own `plugins/devflow/devflow/bin/df-tools.cjs`, which supports `--cwd`. Preflight passed (`ok: true`, `base_visible: true`, `is_worktree: true`).
- **Files modified:** none
- **Commit:** n/a

**2. [Rule 2 - Missing coverage] plan-milestone-gaps.md:5 `/devflow:add-objective` missing from the inventory**
- **Found during:** Task 2 (inventory `rg`)
- **Issue:** The TRD inventory listed only the `audit-milestone` token on line 5. The same line also carries `/devflow:add-objective`, which the must-have `rg` matches.
- **Fix:** Rewrote it to `/devflow:objective add` per DEPRECATION_MAP.
- **Files modified:** plugins/devflow/devflow/workflows/plan-milestone-gaps.md
- **Commit:** af9a9f8

### Observations (not changed; out of scope)

- remove-objective.md:16 still describes the argument as "integer or decimal". This is parse-step prose, not a command token, and the must-have limits edits to command tokens and their attached usage words. It is a candidate for a follow-up.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: objective/todo/health/progress workflows | `rg -n '/df:[a-z]\|/devflow:(add-objective\|...\|reapply-patches)\b' <7 files>` | 1 (no matches) | PASS (empty output) |
| 1: diff review | `git diff -U0` | 0 | PASS (26+/26−, token and usage words only) |
| 2: milestone workflows | combined must-have `rg` over all 10 files | 1 (no matches) | PASS (empty output) |
| 2: skill-route tests | `node --test plugins/devflow/devflow/bin/lib/skill-route.test.cjs` | 0 | PASS (80/80) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| must-have rg (10 files) | `rg -n '<must_haves pattern>' <10 workflows>` | 1 (no matches) | PASS |
| skill-route | `node --test plugins/devflow/devflow/bin/lib/skill-route.test.cjs` | 0 | PASS (80 pass / 0 fail) |
| full suite | `npm --prefix <worktree> test` | 1 | PASS vs baseline (8 fail, all listed in baseline-failures.tsv) |

## Regression Tallies (full suite)

`npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/38-04 test` ran at HEAD `af9a9f8`:

- tests 4023 (matches the 4023 baseline) · pass 3965 · fail 8 · skipped 50 · cancelled 0 · duration 75.4s

Every failure is in `baseline-failures.tsv`, and they are all daemon/timing tests:

| Failing test | Baseline entry |
|---|---|
| foreground daemon writes PID file, status reports running, stop kills it | devflow-watch.test.cjs:145 |
| start refuses when daemon already running | devflow-watch.test.cjs:177 |
| write pending → daemon executes → route-results emits result with stdout | handoff-e2e.test.cjs:254 |
| disallowed command produces rejected done record + "Do NOT retry" guidance | handoff-e2e.test.cjs:271 |
| idempotency: route-results emits once, silence on second invocation | handoff-e2e.test.cjs:285 |
| multi-record: 3 queued commands appear in a single injection | handoff-e2e.test.cjs:298 |
| LK-1: teardown reaps the daemon — no devflow-watch outlives withDaemon | handoff-e2e.test.cjs:327 |
| LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight | handoff-e2e.test.cjs:344 |

No failure names a workflow file or help/contract test, so there are 0 regressions. The TSV was not edited.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (rg empty; DEPRECATION_MAP mapping followed; usage/arg hints match live skills; `git diff -U0` token-only)
- Gate failures: None

## Issues Encountered

None beyond the deviations above.

## Next Objective Readiness

- 38-09's CI check can now pass for these 10 workflows.
- 38-11 can add its advisory step to progress.md on top of `af9a9f8`.
- STATE.md and ROADMAP.md were not touched, per the parallel-wave protocol. The orchestrator updates them after the merge.

## Self-Check: PASSED

- FOUND: 4821cc6 (docs(38-04): objective/todo/status workflows name live commands)
- FOUND: af9a9f8 (docs(38-04): milestone workflows name live commands)
- FOUND: all 10 modified workflow files. `git diff --name-only 828b0b0 HEAD` lists exactly the TRD's `files_modified`, with nothing outside it.
- insert-objective.md unchanged (not in the diff)
