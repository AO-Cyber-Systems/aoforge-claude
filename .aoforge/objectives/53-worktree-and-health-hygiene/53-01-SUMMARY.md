---
objective: 53-worktree-and-health-hygiene
trd: "01"
subsystem: planning-verbs
tags: [worktree, summary-verbs, local-mode, executor, merge]
requires: []
provides:
  - "planning-mode.resolveCheckoutRoot(cwd): the checkout (worktree or main) holding cwd when it has .planning/, else resolveMainRoot"
  - "summary checkpoint|post write the current checkout in local mode"
affects: [53-04, 53-07]
tech-stack:
  added: []
  patterns: ["fs-only checkout resolution (no git spawn in planning-mode.cjs)", "real-git worktree E2E fixture"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/planning-mode.cjs
    - plugins/devflow/devflow/bin/lib/planning-mode.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/agents/executor.md
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/execute-trd.md
decisions:
  - "Local mode writes the checkout that commits the SUMMARY; store mode keeps the MAIN checkout (D-14)"
metrics:
  duration: 23min
  completed: 2026-10-04
requirements: ["53-1"]
tokens_input: 10560959
tokens_output: 56835
tokens_cache_read: 10233335
tokens_cache_write: 327472
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 53 TRD 01: Summary verbs write the checkout that commits them

**In local mode `summary checkpoint|post` run from an executor worktree now write that worktree, so the SUMMARY is committed on the `df/exec-*` branch and arrives through `git merge --no-ff` with no untracked main-checkout copy in the way; store mode still writes the main checkout.**

## Progress
- [x] Task 1: resolveCheckoutRoot and local-mode worktree writes for the summary verbs — RED 110add81, GREEN 5007ad5a
- [x] Task 2: executor and orchestrator prose — 88c1d3c2

## What was done

- `planning-mode.resolveCheckoutRoot(cwd)`: walks to the first `.git` holder and returns it (realpath) when it has `.planning/`, else `resolveMainRoot(cwd)`. fs-only, never throws, no git spawn.
- `planning-verbs.cjs`: `writeThrough` takes an optional `writeRoot`, honoured only when `mode === LOCAL`. `summaryPost` and `summaryCheckpoint` compute the write root (`summaryWriteRoot`: store mode returns `main`, local mode `resolveCheckoutRoot(root)`) and choose the file name from THAT root's objective dir (`summaryNameIn`), so a worktree's committed `NN-MM-<slug>-SUMMARY.md` is reused rather than duplicated. The header comment names the one local-mode exception and why.
- `executor.md`, `execute-trd.md`, `execute-objective.md`: a worktree executor commits its SUMMARY with its task commits (local mode); the "orchestrator commits the wave's SUMMARYs after the merge" step is gone (the SUMMARYs arrive with the merges); 5c reads a parallel plan's SUMMARY state from its worktree before the 5b merge, and store mode from the main checkout as before. The "Branch merge protocol" fences and conflict handling are untouched (53-04 owns them).
- gate-executor-stop needed no change: `candidateRoots` already scans every `git worktree list` entry. Test 2 pins it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: resolveCheckoutRoot and local-mode worktree writes | `node --test plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs plugins/devflow/devflow/bin/lib/planning-mode.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs` | 0 (71 pass, 0 fail) | PASS |
| 2: executor and orchestrator prose | `rg -n -i "lands there, not in your tree\|leave the SUMMARY path out\|published to the main checkout\|commits it after the merge\|wave \{N\} summaries" <the three prose files>` | 1 (no output, as required) | PASS |
| 2: prose repo tests | `node --test pr-lifecycle-prose.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs devflow-workflows.repo.test.cjs` | 0 (59 pass, 0 fail) | PASS |

Extra, beyond the TRD's verify lines (they read the edited prose or the touched module): `executor-isolation`, `execute-objective-gh-sync`, `agent-shell-harness`, `planning-audit`, `df-tools-deprecations.repo`, `stack-agent-mcp-contract` (85 pass, 0 fail) and `gh-seam.repo` + `planning-writes.repo` (21 pass).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (110add81) | `node --test summary-worktree.test.cjs planning-mode.test.cjs` | 1 | FAIL (correct): 5a-5g `resolveCheckoutRoot is not a function`; 1, 2, 6 fail because the SUMMARY lands in main (ENOENT in the worktree, a main copy that exists, the named file not overwritten). g1, g2 and 3 pass as guards. |
| GREEN (5007ad5a) | `node --test summary-worktree.test.cjs planning-mode.test.cjs planning-verbs.test.cjs planning-verbs-cli.test.cjs` | 0 | PASS (correct), 71/71 |

No existing planning-verbs or planning-mode test pinned the bug; none was changed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 1) | scoped `node --test` on the four files above | 0 | PASS |
| test (task 2) | scoped `node --test` on the four prose repo tests | 0 | PASS |
| test (objective) | `npm test` | not run | not_available: runs once in 53-07 per the TRD |

## Must-haves

1. Local worktree write, nothing under main: test 1 (PASS)
2. Main checkout and non-git dir write what they wrote before: g1, plus 5d and 5e (PASS)
3. Store mode resolves MAIN (cache, `.trd-progress`, ledger, journal, outbox): test 3 and the existing planning-verbs store tests 9, 10 and 15, unchanged (PASS). Store mode is covered by `summary checkpoint` only, as the TRD allowed: a store-mode `summary post` queues a GitHub write.
4. A worktree with no `.planning/` falls back to main: g2 and 5c (PASS)
5. E2E merge: test 1 commits the SUMMARY from the worktree with `df-tools commit` (`committed: true`), then `git merge --no-ff` exits 0, `git ls-files` lists it and `git status --porcelain` is empty (PASS)
6. gate-executor-stop visibility: test 2, with the hook's real `gitWorktrees` (PASS)
7. Prose: the rg check prints nothing (PASS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test expectation named the wrong store-mode progress file**
- **Found during:** Task 1 RED, running test 3
- **Issue:** the TRD and my first draft expected `.trd-progress/07-01.md`. The existing store-mode code names it by the normalized TRD id (`ghMapping.toTrdId`), so the file is `.trd-progress/7-01.md`.
- **Fix:** corrected the test expectation and commented why. No production code changed; store mode is byte-for-byte as before.
- **Files modified:** plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs
- **Commit:** 110add81

### Process notes (not code deviations)

- **Preflight ran in the wrong tree first.** The shell's cwd was the main checkout, so the first `exec-context check` passed there and claimed (main checkout, base) for plan 53-01. I re-ran it with `--cwd <worktree>` (checkout = the worktree, `is_worktree: true`) and released the stray claim with `exec-context release --repo <main> --id 53-01`, which cleared only my own id. That avoided a false SHARED INDEX for siblings. No file in the main checkout was touched.
- **REQUIREMENTS.md does not exist in this tree**, so `requirements mark-complete 53-1` reported `updated: false`. Nothing to mark.
- **STATE.md has no per-TRD position block** (it is a milestone narrative), so `state advance-job` reported `last_job` and `state update-progress` found no Progress field. `update-progress` did recalculate `.planning/state.json` `progress_pct` (98 to 97, the new TRDs are on disk); that file is in the docs commit.
- **Home mirror is 2.12.0 and lacks the summary verbs**, so every df-tools call here used the repo copy in the worktree.

## Main-checkout copy of the SUMMARY

None appeared. The first progress checkpoint (RED commit) was written with the Write tool, because the unfixed verb would have dropped a copy in main. Every later write, both checkpoints and this `summary post`, went through the fixed repo verb from the worktree, and a read-only listing of the main checkout's objective directory after each showed no `53-01-SUMMARY.md`.

## Discovered commands

None. The stack profile is `general`; the scoped test command `node --test {files}` came from it.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one test-expectation correction at RED, no production fix cycle)
- Must-haves verified: 7/7
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs
- FOUND: resolveCheckoutRoot exported from plugins/devflow/devflow/bin/lib/planning-mode.cjs
- FOUND commits: 110add81 (test), 5007ad5a (fix), 88c1d3c2 (docs)
