---
objective: 49-objective-branch-and-pr-lifecycle
trd: "08"
subsystem: init
tags: [init, pr-lifecycle, branching-strategy, store-mode, deprecation]

requires:
  - objective: 49-02
    provides: "`prs` mapping map with getPr (branch, number) in the v3 mapping"
provides:
  - "`pr_lifecycle` boolean on `init execute-objective` and `init milestone-op`"
  - "store mode: `objective_branch`, `pr_number`, `branch_name: null`, `branching_strategy_ignored` on execute-objective"
  - "local mode: `pr_lifecycle: false` plus a `deprecations` entry when a legacy strategy is configured"
affects: [49-13]

tech-stack:
  added: []
  patterns:
    - "one `_prLifecycle(cwd, config)` helper decides mode from the MAIN checkout (planningMode) and returns the fields both inits spread"
    - "init tests run the init in-process with process.exit and stdout stubbed, so a `_setRunGh` spy sees every call"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/init.cjs

key-decisions:
  - "Local mode is additive only: every existing field keeps its value (D-01); the new keys are `pr_lifecycle: false` and, when `branching_strategy` is not `none`, `deprecations: [<text>]`"
  - "`branching_strategy` keeps its configured value in the JSON in both modes; store mode only nulls `branch_name`"
  - "`branching_strategy_ignored` and `deprecations` are omitted (not null) when there is nothing to report"
  - "`objective_branch` is `prs[id].branch` when recorded, else the objective_branch_template rendered with the same expression `branch_name` uses; null when the objective is not found and nothing is recorded"
  - "milestone-op carries only `pr_lifecycle` (plus the strategy notice); no branch fields because it has no objective in context"

patterns-established:
  - "Mode for an init comes from planningMode(cwd), which resolves the main checkout first, so a linked worktree's own config.json and (gitignored, absent) mapping never decide it"

requirements-completed: [GPR-06]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-01
---

# Objective 49 TRD 08: Init reports the PR lifecycle Summary

**`init execute-objective` and `init milestone-op` now carry `pr_lifecycle`; in store mode execute-objective also reports the linked objective branch and PR number and nulls `branch_name`, and local mode gets a deprecation notice for `git.branching_strategy` with every existing value unchanged.**

## Performance

- **Duration:** about 12 min
- **Tasks:** 1/1
- **Files modified:** 2 (1 source, 1 new test file)

## Accomplishments

- Workflows can tell from init alone whether to run the linked-branch PR lifecycle or the legacy local branching strategy.
- Store mode (github.enabled and github.store, from the MAIN checkout) returns `pr_lifecycle: true`, `objective_branch`, `pr_number` (or null), `branch_name: null`, and `branching_strategy_ignored: <value>` when a legacy strategy is configured.
- Local mode returns `pr_lifecycle: false` and, for `objective` or `milestone`, `deprecations: ["git.branching_strategy is deprecated: in store mode (github.store) each objective runs on one linked branch and pull request (gh pr start)."]`.
- Init reads only the local mapping: zero gh calls in either mode (spy test across both inits and both modes).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: PR lifecycle fields (tests 1-7) | `node --test plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs plugins/devflow/devflow/bin/lib/init.test.cjs` (18 new + 41 existing, 0 fail) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs` (18 pass) | 0 | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (41 pass, file untouched) | 0 | PASS |
| repo guards | `node --test gh-seam.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs df-tools-deprecations.repo.test.cjs` (35 pass) | 0 | PASS |

Full `npm test` was not run (the worktree has no node_modules, per the dispatch).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test init-pr-lifecycle.test.cjs` | 1 | FAIL (16 of 18 fail on missing `pr_lifecycle` / `objective_branch` / `deprecations`; test 5d "existing fields still present" and test 7 "zero gh calls" pass by design as characterization pins) |
| GREEN | `node --test init-pr-lifecycle.test.cjs` | 0 | PASS (18 pass) |

## Commits

| Commit | Message |
|---|---|
| 70b3a6a3 | test(49-08): init exposes the PR lifecycle |
| f3189ac0 | feat(49-08): init reports pr_lifecycle and the objective branch |

## Contract notes for dependents (49-13 prose)

- Branch on `pr_lifecycle` from `init execute-objective` / `init milestone-op`. Do not re-derive the mode.
- Store mode execute-objective keys: `pr_lifecycle: true`, `objective_branch` (string, or null only when the objective is unresolvable and nothing is recorded), `pr_number` (integer or null), `branch_name: null`, `branching_strategy` (still the configured value), and `branching_strategy_ignored` (present only when the strategy is not `none`).
- Local mode keys: `pr_lifecycle: false`; `branch_name` as before; `deprecations` (array of one string) present only when the strategy is `objective` or `milestone`. `objective_branch` and `pr_number` are absent in local mode, even if a `prs` entry exists.
- `objective_branch` before `gh pr start` has run is the template rendering; after it, the recorded linked branch wins, so prose should read the field every time rather than caching it.
- milestone-op store mode also carries `branching_strategy_ignored` when a strategy is configured (shared helper); it has no `objective_branch` or `pr_number`.

## Deviations from Plan

### Additions beyond the TRD's test list (no behaviour contradicts the TRD)

- Tests 1b (custom `objective_branch_template`), 2b (prs entry without a number), 3b (milestone strategy in store mode), 3c (`github.enabled` without `store` is local), 4b, 5b, 5c (a `prs` entry in a local project is not surfaced), 5d (field-preservation pin), 6b, 6c and test 8 (a linked-worktree fixture with a `.git` file and `commondir`, a local-looking worktree config and no mapping: mode and `prs` come from the main checkout) were added. All were written in the RED commit before the implementation.
- Test 7 passes before the implementation by design (init made no gh calls before either); it stays as a regression guard against a future change that fetches PR state from GitHub inside init.

None of the above were Rule 1-4 deviations. TRD executed as written.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (store fields; milestone-op `pr_lifecycle`; local mode additive with deprecation; zero gh calls)
- Gate failures: None

## Self-Check: PASSED

- Files found: `init.cjs` (modified), `init-pr-lifecycle.test.cjs` (created), both present in the worktree.
- Commits found on `df/exec-49-08`: 70b3a6a3, f3189ac0.
