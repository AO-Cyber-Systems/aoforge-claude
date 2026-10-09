---
objective: 50-github-enforcement-and-setup
job: "06"
subsystem: enforcement
tags: [commit-gate, store-mode, override-log, objective-branch, refs-trailer]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: "50-02 gh-gate.cjs evaluateGate/readGateInputs and the `gh` override gate"
  - objective: 49-objective-branch-and-pr
    provides: "commit-trailer.cjs refsFor/applyRefs, the v3 mapping `prs` map, planning-mode.resolveMainRoot"
provides:
  - "`df-tools commit` in store mode refuses the default branch, an unlinked branch and a detached HEAD (exit 1, `reason`, `branch`, `error`) before anything is staged"
  - "DEVFLOW_SKIP_GH_GATE=1 lets the refused commit land, marks the result `gate_escaped: true` and logs a `gate: gh` entry in the MAIN checkout's `.planning/.override-log.jsonl`"
  - "`refsFor(mainRoot, message, {objective})`: an unscoped message on a linked branch references the linked objective's issue"
affects: [50-07 health-and-doctor-reports, 50-12 enforcement-e2e-and-parity, 50-13 docs-and-full-suite]

tech-stack:
  added: []
  patterns:
    - "gate placed after the planning-path filter and before the `git add` loop, so a refusal never touches the index"
    - "an escape is logged only once the commit has landed, to the main checkout, and a log failure is reported in the result rather than blocking the commit"
    - "local mode never loads gh-gate.cjs, commit-trailer.cjs or override.cjs; proven with a Module._load preload in a spawned df-tools"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/commit-trailer.cjs
    - plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs
    - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs

key-decisions:
  - "A merge or a rebase in progress skips the gate (MERGE_HEAD, rebase-merge/, rebase-apply/ in the per-worktree git dir via `rev-parse --absolute-git-dir`); cherry-pick is not skipped"
  - "The escape is logged after the commit lands, not at decision time: an escaped attempt that ends nothing_to_commit or commit_failed logs nothing"
  - "An escaped commit has no linked objective, so an unscoped message stays bare (`refs: null`, `no scope`) exactly as before the gate"
  - "Refusal result is `{committed:false, hash:null, reason, branch, error}`, `branch` null for a detached HEAD, same shape family as merge_in_progress"
  - "A scoped message keeps today's resolution even when its scope has no mapping entry; the objective fallback applies only to `no scope` and `unrecognised scope`"

patterns-established:
  - "Store-mode fixtures that commit on the default branch and are not about the gate take the logged escape (`DEVFLOW_SKIP_GH_GATE=1`) rather than a faked linked branch"

requirements-completed: [GEN-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-01
tokens_input: 7234739
tokens_output: 61425
tokens_cache_read: 7062073
tokens_cache_write: 172560
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50: GitHub Enforcement and Setup, TRD 06: Commit gate wiring Summary

**`df-tools commit` now refuses a store-mode commit on the default or an unlinked branch before anything is staged, lets `DEVFLOW_SKIP_GH_GATE=1` through with a logged `gate: gh` override in the main checkout, and gives unscoped commits on a linked branch a `Refs #<objective issue>` paragraph; local mode is byte-identical.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-01T17:27:55Z
- **Completed:** 2026-10-01T17:36:00Z
- **Tasks:** 2 (both TDD, 5 commits)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- `cmdCommit` runs the 50-02 gate in store mode after the planning-path filter and before the `git add` loop. A refusal exits 1 with `reason` (`default_branch`, `unlinked_branch`, `detached_head`), the `branch` and an actionable `error`; `git diff --cached` stays empty and HEAD does not move. A wholly ignored `--files` list is still `skipped_gitignored` with exit 0, and a merge or rebase in progress skips the gate.
- The escape (`DEVFLOW_SKIP_GH_GATE=1`, optional `DEVFLOW_SKIP_GH_GATE_REASON`) lets the commit land with `gate_escaped: true` and appends a `gate: gh` entry to the MAIN checkout's `.planning/.override-log.jsonl`, also when the commit is made from a `df/exec-*` worktree. A logging failure is reported as `gate_log_error` and never undoes the commit.
- `refsFor` takes an optional `{objective}`: with no usable scope it references that objective's issue, so every commit on a linked branch (including from an executor worktree whose main checkout is on it) carries a `Refs #`.
- Local mode is unchanged: same result keys, same message bytes, no `gh` call, and `gh-gate.cjs` / `commit-trailer.cjs` / `override.cjs` are never even loaded (verified with a Module._load preload and a gh PATH shim, with a store-mode positive control).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: trailer fallback | `node --test plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs` | 0 | PASS (32 tests, 7 new) |
| 2: gate in cmdCommit | `node --test .../misc-commit-gate.test.cjs .../misc-commit.test.cjs .../commit-failure.test.cjs .../commit-staged-removal.test.cjs` | 0 | PASS (26 new tests; 189 across the run below) |

## Task Commits

1. **Task 1: trailer fallback** - `347c3a4d` (test, RED), `8ff37d99` (feat, GREEN)
2. **Task 2: gate in cmdCommit** - `caf3c083` (test, RED), `7b975eeb` (feat, GREEN)
3. **Deviation: existing store-mode fixtures** - `e76ea231` (test)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../misc-commit-gate.test.cjs .../commit-trailer.test.cjs` | 0 | PASS |
| regression | `node --test .../misc-commit.test.cjs .../commit-failure.test.cjs .../commit-staged-removal.test.cjs .../cwd-flag.test.cjs` | 0 | PASS |
| adjacent | the above plus gh-gate, override, gh-seam.repo, planning-writes.repo, 0010-store-gitignore in one run | 0 | PASS (189 tests, 0 fail) |
| hooks | `node --test plugins/devflow/hooks/upgrade-project.test.js .../gh-flush.test.js .../gate-commits.test.js` | 0 | PASS (142 tests) |
| df-tools | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (153 tests) |
| e2e | `node --test .../planning-verbs.e2e.test.cjs` | 0 | PASS (with the deviation fix) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../commit-trailer.test.cjs` | 1 | FAIL (correct): 6a, 6b, 6f got `no scope`/`unrecognised scope` instead of the objective issue |
| GREEN (Task 1) | `node --test .../commit-trailer.test.cjs` | 0 | PASS (correct) |
| RED (Task 2) | `node --test .../misc-commit-gate.test.cjs` | 1 | FAIL (correct): 15 of 26 failed, every refused commit landed instead; the rest are parity or already-true guards (3, 4a, 5f, 5g, 6b, 6d, 7a, 7c, 8a, 9a, 9b) |
| GREEN (Task 2) | `node --test .../misc-commit-gate.test.cjs` | 0 | PASS (correct, 26/26) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (existing store-mode fixtures, see deviation 1)
- **Must-haves verified:** 6/6 (refusal on default and unlinked branch with an untouched index; commit on the linked branch; commit from a `df/exec-*` worktree; logged escape in the main checkout; objective-issue fallback; local-mode parity)
- **Gate failures:** None remaining. Before the fixture fix, `misc-commit.test.cjs` (9 tests), `0010-store-gitignore.test.cjs` (1) and `planning-verbs.e2e.test.cjs` (setup, cancelling 7) failed; all were store-mode commits on `main`.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/misc.cjs` - `mergeOrRebaseInProgress`; the gate block in `cmdCommit`; escape logging after the commit lands; `gate_escaped`/`gate_log_error` on the committed result; `refsFor(..., {objective})`
- `plugins/devflow/devflow/bin/lib/commit-trailer.cjs` - optional `{objective}` third parameter on `refsFor`
- `plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs` - 7 fallback tests
- `plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs` - 26 spawned-df-tools tests over temp git repos, worktrees, a gh shim and a require preload
- `plugins/devflow/devflow/bin/lib/misc-commit.test.cjs`, `migrations/0010-store-gitignore.test.cjs`, `planning-verbs.e2e.test.cjs` - fixtures take the logged escape (deviation 1)

## Decisions Made

See key-decisions. The escape is recorded after the commit lands so the log reflects overrides that overrode something.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing store-mode commit fixtures commit on `main` and are now refused**
- **Found during:** Task 2 (running the regression suites)
- **Issue:** The TRD's gate and regression lists expect `misc-commit.test.cjs` unchanged, but its 48-10 test 5 and the whole 49-07 describe run `df-tools commit` in store mode on the default branch. The same is true of `migrations/0010-store-gitignore.test.cjs` test 11b and the setup and code commits of `planning-verbs.e2e.test.cjs`. All of them started failing with `default_branch`.
- **Fix:** Each takes the documented logged escape (`DEVFLOW_SKIP_GH_GATE=1`) for its commits only (`dfCommit` gained an `env` option; the 49-07 describe sets and restores the variable in `before`/`after`; the e2e `df()` helper adds it for `commit` calls). An escaped commit has no linked objective, so every existing assertion holds byte for byte; the linked-branch behaviour is covered by the new suite. Committed first (`e76ea231`) so it passes before and after the gate exists.
- **Files modified:** `misc-commit.test.cjs`, `migrations/0010-store-gitignore.test.cjs`, `planning-verbs.e2e.test.cjs` (outside this TRD's `files_modified`)
- **Verification:** the three suites pass 46/46; `planning-verbs.e2e.test.cjs` SC3 (clean `git status` after every verb) still holds with the override log gitignored.
- **Committed in:** `e76ea231`

**2. [Process] Test helper fix inside the GREEN commit**
- **Issue:** `assertRefused` first asserted `git status --porcelain`, whose leading space is lost by the helper's trim, so six refusal tests failed on the assertion rather than on behaviour.
- **Fix:** Asserts `git diff --name-only -- <path>` instead. The fix landed with the GREEN commit (`7b975eeb`) rather than a separate one.

---

**Total deviations:** 2 (1 Rule 3 auto-fix, 1 process note)
**Impact on plan:** The Rule 3 fix is necessary to keep the repo suites green; no scope creep. **Merge note:** the three touched suites are not owned by any sibling TRD in this objective (checked with a grep over the 50-xx TRDs).

## Issues Encountered

**Follow-ups for 50-07 / 50-12 / 50-13 (not fixed here, outside this TRD).** The gate is the intended behaviour, but several shipped paths run `df-tools commit` in a store-mode project and will now be refused on the default branch:

- `migrations/0010-store-gitignore.cjs` prints a follow-up `df-tools commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/` for the user; `doctor-checks/20-legacy-runtime-state.cjs` prints a similar command. In store mode on the default branch both now exit 1 with `default_branch`. The user-facing notes should mention the escape or the objective branch.
- `hooks/upgrade-project.js` `commitChild` shells out to `df-tools commit`. On a store-mode default branch it now gets `committed: false`; the hook already parses the stdout JSON, so its warn notice names `default_branch (Refusing to commit on main, ...)` and leaves the upgrade applied but uncommitted, as for any failed commit (checked by reading `commitChild`; its test suite passes). No change needed, but a store-mode project upgraded on `main` will see that notice each time.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

50-12 SC1 can drive `df-tools --cwd <repo> commit` as a child process against a store-mode repo: on `main` it exits 1 with `reason: default_branch`, on the linked branch (an unmerged `prs[<objective>].branch`) or a `df/exec-*` worktree of it it commits, and with `DEVFLOW_SKIP_GH_GATE=1` it lands with `gate_escaped: true` and a `gate: gh` line in the main checkout's `.planning/.override-log.jsonl`. `misc-commit-gate.test.cjs` has reusable fixtures (`storeRepo`, `addWorktree`, the gh shim and the require preload).

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs`
- FOUND commits on `df/exec-50-06`: `347c3a4d`, `8ff37d99`, `caf3c083`, `e76ea231`, `7b975eeb`
- Worktree clean after the last commit
