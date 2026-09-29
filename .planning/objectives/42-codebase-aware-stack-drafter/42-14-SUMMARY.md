---
objective: 42-codebase-aware-stack-drafter
trd: "14"
job: 42-14
subsystem: stack-drafter
tags: [stack-init, ci, cwd, gitignore, gap-closure]
requires: ["42-12", "42-13"]
provides:
  - "stack-ci.normaliseWorkingDirectory + per-step checkouts/external"
  - "stack-verify cwd_missing status (counted as missing)"
  - "stack-detect.cwdHygiene / defaultLsFiles"
  - "stack-evidence item.cwdStatus"
  - "stack-draft cwd_<status> notes"
  - "stack init ignored check on both stack files, preview and write"
affects: ["42-15"]
tech-stack:
  added: []
  patterns:
    - "one batched git spawn per concern (check-ignore --no-index --stdin, ls-files -z) with injectable filters"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-ci-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-detect.cjs
    - plugins/devflow/devflow/bin/lib/stack-detect.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
decisions:
  - "A hygiene `missing` cwd stays a draft candidate that checks as cwd_missing (never inherits the tier default there), so it ends as discover + note like a verify cwd_missing; ignored/untracked/nested_repo/external are excluded outright as notes."
  - "`untracked` is only reported when the repo tracks something among the queried dirs and its top-level files (ls-files adds a `:(glob)*` pathspec); a fresh `git init` reports ok."
  - "Outside git, cwdHygiene uses the static IGNORED_DIR_FALLBACK/scaffold list; inside git only git decides `ignored`."
  - "The basename fallback strip applies only when the job has no self-checkout path; a cwd outside the self checkout is kept raw (verify cwd_missing catches a wrong guess)."
metrics:
  duration: "~1 session (resumed once)"
  completed: 2026-09-29
---

# Objective 42 TRD 14: Command cwd hygiene and the file-level ignore check Summary

CI `working-directory` is now normalised against the job's own `actions/checkout path:`, and a cwd
inside a sibling `repository:` checkout is marked external. Every evidence item carries a
`cwdStatus`, so a command at an ignored, untracked, nested-repo, external or missing directory is
never placed. `stack init` checks both stack files with `check-ignore --no-index`, in preview as well
as write. This closes D1, D2, D4 and D5.

## What changed

- **D1 (stack-ci, stack-verify).** Each step now records `checkouts: [{ path, repository }]`, read
  from `actions/checkout` `with:` in either the block or the flow-map spelling. It also records its
  own `external` flag. `normaliseWorkingDirectory(raw, { root, repoName, selfCheckoutPath,
  otherCheckoutPaths })` strips `${{ github.workspace }}/` and `./`. It then marks a cwd inside
  another checkout as external, and strips the self-checkout `path:`. Only when the job has no self
  path does it strip a repo-basename prefix, and only if `<root>/<basename>` does not exist. The raw
  cwd seeds the `run:` block, so a `cd` composes against the directory CI actually used. Each
  invocation cwd is then normalised on its own. `verifyCommand` checks a non-empty cwd first and
  returns `cwd_missing`. That status joins `MISSING_STATUSES`, so `stack verify` counts it as
  missing, exits 1, and `--run` skips it.
- **D2 + D4 (stack-detect, stack-evidence, stack-draft).** `cwdHygiene(root, { isIgnored, lsFiles })`
  returns a memoised `status(cwd)` with a `prime(cwds)` method. The answer is one of
  ok / external / missing / nested_repo / ignored / untracked. `missing` and `nested_repo` are
  decided on disk (a `.git` dir or file in any segment) and never reach git. `ignored` comes from
  42-12's `defaultIsIgnored` (`--no-index`), batched over the cwds and their ancestors. `untracked`
  comes from one `defaultLsFiles` spawn. `collectEvidence` primes the hygiene once with every
  distinct cwd, then sets `cwdStatus`, or `external` for CI steps inside a sibling checkout.
  `assembleDraft` turns ignored/untracked/nested_repo/external items into `cwd_<status>` notes
  before placement. A `missing` item checks as `cwd_missing` and never inherits the tier default at
  that cwd. The existing unresolved path then gives it `discover` plus a note.
- **D5 (stack-profile).** `ignoredTargets` runs one
  `git -C root check-ignore --no-index --stdin -z` over `.planning/STACK.md` and
  `.planning/STACK-REPORT.md` for every `initProfile` result, preview and write. There is one
  warning per ignored file, the result is never fatal, and no git means `[]`. `helpers.isGitIgnored`
  is unchanged. P11 neutrality holds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing contract tests extended rather than weakened**
- **Found during:** Task 1 and Task 3
- **Issue:** Two sets of existing assertions pinned the pre-42-14 contract.
  - stack-ci's "step records carry exactly the contracted fields" test pinned the old key set. The
    TRD adds `checkouts` and `external`.
  - I18a/I18d asserted `ignored: ['.planning/STACK.md']`. The TRD now checks STACK-REPORT.md too, and
    their `.planning/` rule matches it.
- **Fix:** Added the new fields to the contract assertion. Updated I18a/I18d to expect both files and
  both warnings, with a comment giving the reason.
- **Commits:** a5c8798, 3e9436d

**2. [Design] `missing` hygiene is not excluded outright**
- **Found during:** Task 2
- **Issue:** Task 2's action says to exclude every `cwdStatus !== 'ok'` item. The D1 truth and the
  error_recovery section say a wrong cwd guess must end as `discover` plus a note. That only happens
  if a `missing` item stays a candidate.
- **Fix:** `missing` items stay candidates. `check()` returns `cwd_missing` without calling verify,
  and the equivalence walk skips them. They still produce a `cwd_missing` note (test D28b).

**3. [Design] `cwdHygiene` extras**
- The hygiene also returns `external` for absolute cwds and cwds that escape the root (`../x`).
- `defaultLsFiles` adds a `:(glob)*` top-level pathspec so that a fresh repo that tracks nothing
  never reports `untracked`. Without it, the git-backed 42-13 terminal fixture, which tracks only
  `dist/`, would have turned its `frontend/` notes into `cwd_untracked`.

### Characterisation tests (green at RED time, by design)

- D4's `detectAreas` nested-repo regression (the TRD says current code already handles it).
- D28, where verify's `cwd_missing` gives discover plus a note, already worked through the existing
  unresolved path.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: D1 normalise CI cwd + verify cwd_missing | `node --test stack-ci.test.cjs stack-verify.test.cjs` | 0 | PASS |
| 2: D2+D4 cwd hygiene to notes | `node --test stack-detect.test.cjs stack-evidence.test.cjs stack-draft.test.cjs` | 0 | PASS |
| 3: D5 file-level --no-index ignore check | `node --test stack-init.test.cjs stack-profile.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED (a5c8798) | stack-ci + stack-verify tests | 1 (12 fail) | FAIL (correct) |
| T1 GREEN (0eb3ff3) | same | 0 | PASS (correct) |
| T2 RED (aefe951) | stack-detect + stack-evidence + stack-draft tests | 1 (10 fail) | FAIL (correct) |
| T2 GREEN (cdd97d1) | same | 0 | PASS (correct) |
| T3 RED (3e9436d) | stack-init tests | 1 (4 fail) | FAIL (correct) |
| T3 GREEN (b65c0c0) | stack-init + stack-profile tests | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/stack-*.test.cjs lib/adopt-*.test.cjs` | 0 (962/962) | PASS |
| wave | `NODE_PATH=… npm --prefix <worktree> test` | 1 | PASS (only known MA-7 handoff-e2e PTY mock-auth failure) |
| build | `df-tools --cwd /Users/justin/dev/eden-biz stack init --raw` (preview) | 0 | PASS |

Full suite: tests 5057, pass 5024, fail 1 (MA-7, known), skipped 32. The baseline was 5029 / 4996 / 1
/ 32, so this TRD adds 28 tests.

## Fleet read-only previews (no --write)

- **eden-biz.** No `eden-biz/`-prefixed cwd. The `go/`, `flutter/` and other areas are components,
  and per-area commands are noted under them.
- **quanta-local.** `root test: npm test — cwd_ignored (.baseline/api is gitignored; the command is
  never placed)`.
- **justin-donnaruma-us-go.** Both `warning: .planning/STACK.md …` and
  `warning: .planning/STACK-REPORT.md … is gitignored` appear in the preview.
- **Not re-run here (turn budget):** eden-circle (`working-directory: eden-circle` equals the
  self-checkout `path:` and normalises to the root) and eden-libs. 42-15 re-runs the fleet preview.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (D1 normalisation + external; cwd_missing; D2 notes; D4 regression + cwd notes; D5 preview/write; P11 + suite)
- Gate failures: None beyond the known MA-7

## Self-Check: PASSED

- Commits exist: a5c8798, 0eb3ff3, aefe951, cdd97d1, 3e9436d, b65c0c0
- All 13 files_modified touched; no other source file changed.
