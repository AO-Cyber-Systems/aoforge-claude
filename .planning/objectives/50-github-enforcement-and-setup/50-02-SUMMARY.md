---
objective: 50-github-enforcement-and-setup
job: "02"
subsystem: enforcement
tags: [commit-gate, store-mode, offline, override, gh-mapping, objective-branch]

requires:
  - objective: 49-objective-branch-and-pr
    provides: "mapping `prs` map (gh-mapping.listPrs/setPr), objective-branch.cjs git seam (currentBranch, defaultBranch, _setRunGit), planning-mode.resolveMainRoot"
provides:
  - "gh-gate.cjs evaluateGate: pure, offline decision on whether a store-mode commit may land on the current branch (default_branch | unlinked_branch | detached_head, or allow + objective id)"
  - "gh-gate.cjs readGateInputs: offline reader of the gate's four inputs (branch, mainBranch, defaultBranch, prs), mapping read from the MAIN checkout"
  - "`gh` override gate: `df-tools override --gate gh --reason ...` is accepted and logged (env-driven DEVFLOW_SKIP_GH_GATE, no marker)"
affects: [50-06 commit-gate-wiring, 50-12 enforcement-e2e-and-parity]

tech-stack:
  added: []
  patterns:
    - "pure decision function plus a thin never-throwing reader, so the caller (cmdCommit, 50-06) records the override and this module stays side-effect free"
    - "linked = local mapping fact (unmerged prs[<objective>].branch), so the gate works with no network"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-gate.cjs
    - plugins/devflow/devflow/bin/lib/gh-gate.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/override.cjs
    - plugins/devflow/devflow/bin/lib/override.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "A branch is linked when an unmerged `prs` entry names it; a live entry wins over a merged one on the same branch"
  - "`df/exec-*` branches inherit the objective of the main checkout's branch when that is linked; otherwise refused as unlinked_branch naming the main checkout's branch. `df/ws-*` gets no special case"
  - "Escape is the string \"1\" only (not true/yes/1-as-number); an escaped result keeps the overridden reason and message and adds escaped:true; an allowed commit is never marked escaped"
  - "A git failure or non-repository reads as branch null and so as detached_head; an unreadable or too-new mapping reads as no PRs. The gate refuses rather than crashes"

patterns-established:
  - "Offline gate: read-only git via objective-branch.cjs plus a file read; no gh, no fetch, no writes"

requirements-completed: [GEN-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-01
---

# Objective 50: GitHub Enforcement and Setup, TRD 02: Commit gate decision Summary

**An offline, pure `evaluateGate` plus a never-throwing `readGateInputs` answer "may this store-mode commit land here?" from branch names and the mapping's `prs` map, with the `gh` override gate (`DEVFLOW_SKIP_GH_GATE=1`) registered and logged.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-01T17:10:39Z
- **Completed:** 2026-10-01T17:14:26Z
- **Tasks:** 2 (both TDD, 5 commits)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `evaluateGate({branch, mainBranch, defaultBranch, prs, env})` refuses the default branch, an unlinked or merged-PR branch and a detached HEAD, each with an actionable message naming `gh pr start <objective>` and the logged escape. It allows a branch named by an unmerged `prs` entry and returns that objective id, and lets a `df/exec-*` branch inherit the main checkout's linked branch.
- `readGateInputs(cwd)` reads the four inputs offline from a linked worktree: the mapping comes from the MAIN checkout (a worktree holds none in store mode), and both branches are reported.
- `gh` is a known override gate (`GATES.gh = null`), so `df-tools override --gate gh --reason ...` works through `audit-cli.runOverride` with no other change; confirmed by running the CLI end to end in a temp project with a temp HOME.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: evaluateGate and the gh override gate | `node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs plugins/devflow/devflow/bin/lib/override.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 0 | PASS (75 tests) |
| 2: readGateInputs | `node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs` | 0 | PASS (31 tests) |

## Task Commits

1. **Task 1: evaluateGate and the gh override gate** - `99fab939` (test, RED), `6327985d` (feat, GREEN)
2. **Task 2: readGateInputs** - `1b670cd0` (test, RED), `2a5952eb` (feat, GREEN)
3. **Deviation: gh-seam registration** - `3652b66f` (fix)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs plugins/devflow/devflow/bin/lib/override.test.cjs` | 0 | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/objective-branch.test.cjs` | 0 | PASS (all four suites together: 108 tests) |
| repo seam | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 after fix | PASS (see deviation 1) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../gh-gate.test.cjs .../override.test.cjs` | 1 | FAIL (correct): `Cannot find module './gh-gate.cjs'`; `gh must be a known gate` |
| GREEN (Task 1) | `node --test .../gh-gate.test.cjs .../override.test.cjs .../audit-cli.test.cjs` | 0 | PASS (correct) |
| RED (Task 2) | `node --test .../gh-gate.test.cjs` | 1 | FAIL (correct): 8 reader tests, `readGateInputs is not a function` |
| GREEN (Task 2) | `node --test .../gh-gate.test.cjs` | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (the gh-seam registration, a first-attempt fix)
- **Must-haves verified:** 5/5 (default/unlinked/detached refusals; linked branch returns objective id; `df/exec-*` inheritance and refusal; escape never marks an allowed commit; `gh` is a known override gate)
- **Gate failures:** None remaining. One repo test (`gh-seam.repo.test.cjs` test 23) failed after Task 2 because of the new module and was fixed in `3652b66f`.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh-gate.cjs` - `evaluateGate` (pure) and `readGateInputs` (offline); exports `ESCAPE_ENV`
- `plugins/devflow/devflow/bin/lib/gh-gate.test.cjs` - 23 table-driven decision tests and 8 reader tests (real temp git repos and `git worktree add`; no gh, no network)
- `plugins/devflow/devflow/bin/lib/override.cjs` - `GATES.gh = null`
- `plugins/devflow/devflow/bin/lib/override.test.cjs` - the `gh` gate is known, logged, arms no marker
- `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` - registers `gh-gate.cjs` in `GUARDED` and `NO_DIRECT_WRITE`

## Decisions Made

See key-decisions. In short: linked is a local mapping fact; an executor branch inherits the main checkout's linked objective; only `"1"` escapes; an unreadable mapping or a git failure makes the gate refuse rather than throw.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `gh-seam.repo.test.cjs` test 23 failed on the new module**
- **Found during:** Task 2 (checking repo-wide tests that enumerate `bin/lib`)
- **Issue:** Test 23 requires every `gh-*.cjs` module in `lib/` to be listed in `GUARDED` (and `NO_DIRECT_WRITE` unless it writes). `gh-gate.cjs` is new and unlisted, so a CI-run repo test failed: `unguarded gh-*.cjs module(s): gh-gate.cjs`. No TRD in this objective owns that registration.
- **Fix:** Added `'gh-gate.cjs'` to `GUARDED` and `NO_DIRECT_WRITE`. The module calls neither `gh` nor `git` itself and never writes, so it belongs in both lists.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` (outside this TRD's `files_modified`)
- **Verification:** `gh-seam.repo.test.cjs` 9/9 pass; `planning-writes.repo.test.cjs` 18/18 pass.
- **Committed in:** `3652b66f` (its own commit, so it can be rebased or dropped cleanly)

**2. [Process] Preflight first ran from the main checkout and took a wrong claim**
- **Found during:** preflight
- **Issue:** `exec-context check` was first run with the shell's default cwd (the main checkout), so it reported `checkout: /Users/justin/dev/devflow-claude` and claimed that checkout for plan 50-02 instead of the worktree.
- **Fix:** Released only that claim (`exec-context release --repo <main> --id 50-02`, which clears claims held by id 50-02 only), then re-ran the check with `--cwd <worktree>`, which reported the worktree checkout, branch `df/exec-50-02`, `is_worktree: true`, base visible. No work was done before the correct check.
- **Impact:** None on the code. Noted because the dispatch's example command does not pass `--cwd`, and other executors may do the same.

---

**Total deviations:** 2 (1 Rule 3 auto-fix, 1 process correction)
**Impact on plan:** The Rule 3 fix is necessary to keep the repo suite green; no scope creep. **Merge note for the orchestrator:** `gh-seam.repo.test.cjs` is a shared file. Sibling TRDs in this objective that add `gh-*.cjs` modules (for example the check runner and setup modules) will need the same two-line registration and will touch the same lines (`GUARDED` tail, `NO_DIRECT_WRITE`), so expect a trivial textual conflict; keep both entries.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

50-06 can call `readGateInputs(cwd)` then `evaluateGate({...inputs, env: process.env})` from `cmdCommit`, record the override with `recordOverride({gate: 'gh', ...})` when the result has `escaped: true`, and refuse otherwise using the result's `message`. 50-12 SC1 can exercise it end to end. One behaviour to know: a git failure or a non-repository reads as `branch: null`, which the gate reports as `detached_head` (its message says HEAD is detached).

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/gh-gate.cjs`, `plugins/devflow/devflow/bin/lib/gh-gate.test.cjs`
- FOUND commits on `df/exec-50-02`: `99fab939`, `6327985d`, `1b670cd0`, `2a5952eb`, `3652b66f`
- Worktree clean after the last commit
