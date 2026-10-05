---
objective: 55-store-live-smoke-fixes
trd: "02"
subsystem: github-store
tags: [ci, sparse-checkout, outbox, wiki, regression-first]
requires: []
provides:
  - "devflow-checks.yml sparse checkout includes plugins/devflow/devflow/references in all three jobs"
  - "guard test that rebuilds the workflow's sparse checkout and runs gh-check-cli from it"
  - "gh outbox flush retries a halted blocked wiki-push once per flush, with no resolve"
affects: [55-01, 55-06, 55-08]
tech-stack:
  added: []
  patterns:
    - "Repo test parses the workflow as lines (no YAML dependency) and derives the runner's module closure from its requires"
    - "Retry inside the flush lock before the loop: one attempt per flush, never a loop"
key-files:
  created: []
  modified:
    - .github/workflows/devflow-checks.yml
    - plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
decisions:
  - "Keep the helpers.cjs model-profiles.json read and fix the checkout list instead (helpers.cjs is shared by nearly every module)"
  - "retryBlockedWiki re-queues only a halted, blocked wiki-push; remote-edit halts and every other blocked kind keep their resolve step"
metrics:
  duration: "~7 min"
  completed: 2026-10-05
---

# Objective 55 TRD 02: Required checks load from their sparse checkout; a blocked wiki push retries on flush Summary

The reusable workflow now checks out `references/` beside `bin/` (the runner no longer dies with ENOENT on `model-profiles.json`), a new guard test proves the runner loads from exactly what the workflow checks out, and `gh outbox flush` retries a halted blocked wiki-push once per flush so "create the first wiki page, then flush" works without `resolve`.

## Progress
- [x] Task 1: Sparse-checkout guard test, then add references/ to all three jobs — 6d5c0b56 (RED), de10c719 (GREEN)
- [x] Task 2: Flush retries a halted blocked wiki-push once — 339240a0 (RED), e237c8d8 (GREEN)

## What changed

**55-4 (checks).** `.github/workflows/devflow-checks.yml`: all three `sparse-checkout:` values (linked-issue, planning-consistency, reconcile) are now a `|` block listing `plugins/devflow/devflow/bin` and `plugins/devflow/devflow/references`, with one header paragraph saying why. `devflow-workflows.repo.test.cjs` gained the describe `55-02 the check runner loads from the workflow's sparse checkout`:
1. the three lists contain both directories and are equal,
2. a temp copy holding only the first list's paths runs `gh-check-cli.cjs <check>` for all three checks on a hand-built closed, unmerged `pull_request` event: exit 0, no `ENOENT` / `Cannot find module`,
3. the closure of relative requires (regex over each file, so the lazy `require('./gh-hierarchy.cjs')` is included; not hard-coded) all loads in one child `node -e` from the copy.

**55-3 (wiki).** `gh-outbox-flush.cjs`: new `retryBlockedWiki(root, clock)`, called inside the lock before the loop in `flush()`. When `journal.halted.reason === 'blocked'` and the halted op is a `wiki-push` with status `blocked`, it does `markPending(root, seq, {error: null})` + `clearHalted(root)`. The wiki handler then runs once: it publishes if the wiki exists, otherwise it blocks and halts exactly as before (exit 2). The `flush` JSDoc records the exception. `resolveHalt`, `gh-capability.cjs` (the "never remember an uninitialised wiki" rule) and the capability message are untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A pre-existing test pinned the buggy single-line sparse-checkout**
- **Found during:** Task 1 (after the workflow fix)
- **Issue:** `gh-enforcement.e2e.test.cjs` test 10c asserted `sparse-checkout: plugins/devflow/devflow/bin` on one line and was titled "the runner needs nothing outside plugins/devflow/devflow/bin". That is the bug, and the test failed once the workflow was fixed. The TRD's Task 1 recovery note covers exactly this ("update it to the block form; that line was the bug"), but the file is not in `files_modified`.
- **Fix:** the first assertion now matches the two-directory block form; the title and a comment say `references/` is checked out for `model-profiles.json`. The second half of 10c (no JS module loaded from outside `bin`) is unchanged and still true, because `model-profiles.json` is read as data, not required.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs`
- **Commit:** de10c719

### Process notes

- The first `exec-context check` was run from the main checkout (the session cwd), where it correctly reported SHARED INDEX against 55-01. Re-run with `--cwd` set to the assigned worktree it passed (`checkout` = the worktree, `is_worktree: true`). No claim was released or touched; all work happened in `/Users/justin/dev/.df-worktrees/devflow-claude/55-02`.
- Test 18h (blocked non-wiki op is not re-executed) passes before the fix by design: it is a guard that the retry does not widen to other op kinds.
- Test 18g counts `git clone` calls through `wiki._setRunGit` (an attempt on a missing remote is one clone) rather than adding an outbox API.

## RED evidence

Task 1, before the workflow fix (`devflow-workflows.repo.test.cjs`, 5 failures, 14 pre-existing passes):

```
AssertionError: lists plugins/devflow/devflow/references: ["plugins/devflow/devflow/bin"]
Error: ENOENT: no such file or directory, open '/private/var/folders/.../df-sparse-A0GPcF/.devflow/plugins/devflow/devflow/references/model-profiles.json'
    at Object.<anonymous> (.../.devflow/plugins/devflow/devflow/bin/lib/helpers.cjs:11:42)
```

Task 2, before the flush fix: 18g `the second flush made exactly one more attempt: retried, not looped: 1 !== 2`; 12b `flush exits 2 !== 0` with the halt unchanged (`reason: "blocked"`, "The wiki has no first page yet ...").

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: guard test + sparse-checkout fix | `node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 0 (19/19) | PASS |
| 1: pre-existing pin (deviation 1) | `node --test plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs` | 0 (12/12) | PASS |
| 2: flush retry | `node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (263/263) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 1 (5 fail, 14 pass) | FAIL (correct) |
| GREEN (task 1) | same | 0 (19 pass) | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="18g\|18h\|12b" gh-outbox-flush.test.cjs gh-store-e2e.test.cjs` | 1 (18g, 12b fail; 18h guard passes) | FAIL (correct) |
| GREEN (task 2) | the three task-2 files | 0 (263 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, TRD gate) | `node --test devflow-workflows.repo.test.cjs gh-outbox-flush.test.cjs gh-store-e2e.test.cjs` | 0 (180/180) | PASS |
| neighbouring suites | `node --test hooks/gh-flush.test.js gh-store-cli gh-seam.repo gh-health gh-capability planning-verbs gh-sync-store` | 0 (258/258) | PASS |
| test (full `npm test`) | not run, per dispatch constraint (targeted files only) | n/a | not_available |

## Discovered commands

None. The stack profile is `general`; scoped tests use `node --test {files}` as declared.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one Rule 3 edit, no retries)
- Must-haves verified: 5/5 (all three sparse sets list bin + references; the sparse copy runs all three checks to exit 0 with clean stderr; the whole relative-require closure loads from the copy; the halted blocked wiki-push is retried by a plain flush and ends `done` with exit 0; with the wiki still missing flush halts `blocked` after exactly one attempt, and a blocked `upsert-issue` is not re-executed)
- Gate failures: None
- Open item for later TRDs: a repository pinned to `v2.13.1` keeps the broken reusable workflow until it re-pins (55-01 / 55-06 / 55-08 own that path).

## Self-Check: PASSED

- FOUND: `.github/workflows/devflow-checks.yml`, `devflow-workflows.repo.test.cjs`, `gh-outbox-flush.cjs`, `gh-outbox-flush.test.cjs`, `gh-store-e2e.test.cjs`, `gh-enforcement.e2e.test.cjs`
- FOUND commits: 6d5c0b56, de10c719, 339240a0, e237c8d8
