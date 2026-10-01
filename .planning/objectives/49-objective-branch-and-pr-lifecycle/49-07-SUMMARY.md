---
objective: 49-objective-branch-and-pr-lifecycle
trd: "07"
subsystem: github-store
tags: [commit, trailer, refs, gpr-02, store-mode, worktree, conventional-commits]

requires:
  - objective: 49-objective-branch-and-pr-lifecycle
    provides: "49-02: the v3 mapping accessors (getTrd / getEntry) this module reads; no `prs` map is needed here"
provides:
  - "commit-trailer.cjs: parseScope(subject), refsFor(mainRoot, message) -> {issue, id, reason}, applyRefs(message, issue)"
  - "`df-tools commit` appends a final `Refs #<issue>` paragraph in store mode, resolved from the MAIN checkout's mapping"
  - "commit result carries `refs: <issue>` or `refs: null` + `refs_reason` in store mode (no `refs` key in local mode or on --amend)"
affects: [49-09, 49-14, 50]

tech-stack:
  added: []
  patterns:
    - "scope -> id -> mapping: TRD ids via toTrdId (strict), objective ids only when the scope is a bare number, never a slug"
    - "store-only branch placed after every early return in cmdCommit, so local mode and skipped commits never reach it"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/commit-trailer.cjs
    - plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs

key-decisions:
  - "Trailer format is the literal paragraph `Refs #N` appended as `\\n\\nRefs #N`; objective 50's `devflow/linked-issue` check must match `^Refs #\\d+$` because git interpret-trailers (default `:` separator) will not parse it"
  - "An objective scope is `^\\d+(\\.\\d+)?$` only. `toObjectiveId` alone would accept `49-demo` and `49-02` as objective 49 (its ID_RE tolerates a `-slug` tail), so TRD ids are tried first with the strict `toTrdId` and a slug scope resolves to nothing"
  - "A message that already has any `Refs #N` line (whole-line match) is returned unchanged, whichever N it names"
  - "refsFor re-checks store mode itself (reason `not store mode`) on top of cmdCommit's check, so the module is safe to call from 49-09 without remembering the gate"
  - "Failure never blocks: every unresolved case is `{issue: null, id, reason}` and the commit proceeds"

patterns-established:
  - "A reason vocabulary for an unresolved trailer: `not store mode`, `no scope`, `unrecognised scope`, `mapping unreadable`, `no mapping entry`"

requirements-completed: [GPR-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~4min
completed: 2026-10-01
---

# Objective 49 TRD 07: `Refs #trd` trailer on DevFlow commits Summary

**In store mode `df-tools commit` records every scoped commit with a final `Refs #<issue>` paragraph (TRD scope -> TRD issue, objective scope -> objective issue), resolved from the main checkout's mapping so worktree executors get it too; local mode is byte-identical to before.**

## Performance

- **Duration:** about 4 min
- **Completed:** 2026-10-01T15:29Z
- **Tasks:** 2/2
- **Files:** 4 (1 new source, 1 new test, 1 modified source, 1 modified test)

## Accomplishments

- `commit-trailer.cjs` (files only: config and mapping reads, no gh, no git spawn): `parseScope`, `refsFor`, `applyRefs`.
- `cmdCommit` appends the trailer before building `commitArgs`, in both the pathspec and the staged-removal whole-index form, only when `!amend` and `planningMode.isStoreMode(cwd)`.
- The mapping is read from `planningMode.resolveMainRoot(cwd)`; a real `git worktree add` fixture whose own `.planning/` has no mapping still gets `Refs #102`.
- The result gains `refs` (issue number, or `null` plus `refs_reason`) only in store mode and only on the committed path.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: commit-trailer module (tests 1-3) | `node --test plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs` (25 pass) | 0 | PASS |
| 2: cmdCommit appends the trailer (tests 4-8) | `node --test misc-commit.test.cjs commit-failure.test.cjs commit-staged-removal.test.cjs` (10 new in misc-commit) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test commit-trailer.test.cjs misc-commit.test.cjs` | 0 | PASS |
| regression | `node --test commit-failure.test.cjs commit-staged-removal.test.cjs cwd-flag.test.cjs` (with the above: 75 tests, 0 fail) | 0 | PASS |
| guards | `node --test` the four `*.repo.test.cjs` files (35 pass; includes gh-seam, planning-writes, doc-refs, deprecations) | 0 | PASS |
| df-tools main file | `node --test --test-name-pattern=commit df-tools.test.cjs` (16 pass) | 0 | PASS |

All runs used absolute worktree paths. Full `npm test` was skipped as instructed (the worktree has no `node_modules`).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test commit-trailer.test.cjs` | 1 | FAIL (module not found) |
| GREEN (Task 1) | `node --test commit-trailer.test.cjs` | 0 | PASS (25 pass) |
| RED (Task 2) | `node --test --test-name-pattern="49-07 Refs trailer" misc-commit.test.cjs` | 1 | FAIL (6 of 10: 4a, 4b, 5, 8a, 8b, 8c; no trailer and no `refs` key yet) |
| GREEN (Task 2) | the five commit test files | 0 | PASS (75 pass, 0 fail) |

Commit order is test then implementation for both tasks. In Task 2, tests 4c, 6, 7 and 7b pass before the implementation by design: they are characterization pins (already-present trailer not doubled, `--amend` untouched, local-mode bytes and result keys unchanged) that fail if the implementation over-reaches.

## Commits

| Commit | Message |
|---|---|
| 29e2cfc0 | test(49-07): Refs trailer resolution |
| e63f32f6 | feat(49-07): resolve the Refs trailer from the commit scope |
| ab419e82 | test(49-07): commit adds Refs in store mode |
| 7e22ab5e | feat(49-07): df-tools commit adds Refs #issue in store mode |

## Contract notes for downstream TRDs

- **49-09 (start commit):** `applyRefs(message, issue)` is the message builder; `refsFor(mainRoot, message)` is the lookup. Both are exported from `lib/commit-trailer.cjs`. `refsFor` requires the main root, never a worktree path, and returns `{issue: null, reason}` outside store mode.
- **49-14 (e2e SC2):** assert each objective-branch commit message matches `/^Refs #\d+$/m`. A commit in a store-mode repo whose scope is unmapped carries no trailer by design (`refs: null`).
- **Objective 50 (`devflow/linked-issue`):** match `^Refs #\d+$` on a line of its own. The format is the proposal's literal wording, not a git trailer (`git interpret-trailers` will not list it).
- A TRD that has no issue yet (mapping entry absent) gets no trailer and no objective fallback. That is the TRD's explicit rule ("unknown id -> no trailer") and keeps a TRD commit from silently referencing the wrong issue.
- The `refs_reason` key is an addition beyond the TRD's `refs: null`; the TRD asked for "a reason" without naming the key.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper stripped one trailing newline, not all**
- **Found during:** Task 2 RED run
- **Issue:** `git log --format=%B` ends with the message's newline plus the log newline, so the first draft of `headMessage` left a stray `\n` and made the characterization pins (4c, 7, 7b) fail for the wrong reason.
- **Fix:** strip all trailing newlines (`/\n+$/`) in both helper sites; re-ran RED so only behaviour-related tests fail.
- **Files modified:** misc-commit.test.cjs
- **Commit:** ab419e82 (the fix is in the committed RED)

### Additions beyond the TRD's test list (no behaviour contradicts the TRD)

- `refsFor` also checks store mode itself and returns `reason: 'not store mode'` (the TRD's Task 1 action: "returns null issue in local mode"), plus `mapping unreadable` for a version-above-3 or unparseable mapping. Tests 2j and 2k, and 8c at the CLI level.
- Objective scopes are restricted to bare numbers (`49`, `07.1`). The TRD says "scope `49` or `07.1` -> `toObjectiveId`"; the strictness is needed because `toObjectiveId` would also map `49-demo` to 49 (see key-decisions).
- Tests 4c (no double trailer through the CLI) and 7b (local mode with no `github` block at all) were added beyond the TRD list.

## Known limits

- Test 7 proves local-mode bytes and result keys are unchanged; it cannot observe that the mapping is not read. That is guaranteed structurally: `commit-trailer.cjs` is `require`d only inside the store-mode branch.
- The pre-existing `--amend` usage requires a message argument (`df-tools commit "<msg>" --amend --files ...`; `df-tools commit --amend` is refused by the flag-as-message guard). Unchanged by this TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one test-helper correction before the RED commit)
- Must-haves verified: 5/5 (store-mode trailer for TRD and objective scopes; main-checkout lookup from a real linked worktree; added once and `--amend` untouched; no resolvable scope leaves the message alone with `refs: null` and a reason; local mode bytes and keys identical with the trailer module not loaded)
- Gate failures: None

## Self-Check: PASSED

- Files found: commit-trailer.cjs, commit-trailer.test.cjs, misc.cjs, misc-commit.test.cjs.
- Commits found on `df/exec-49-07` (git log 92bd5656..HEAD): 29e2cfc0, e63f32f6, ab419e82, 7e22ab5e.
- Worktree clean (`git status --short` empty) before this SUMMARY was added.
