---
objective: 60-edit-gate-enforces-the-action
job: "03"
subsystem: hooks
tags: [bash-write-gate, edit-gate, git-tracked, severity, fail-open]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "lib/bash-write-detect.cjs detectBashWrites (60-02) and the shared PATH_CASES table (60-01)"
provides:
  - "lib/bash-write-gate.cjs: evaluateBashWrites, gitTrackedSet, realpathDeep, readBashEditGate, effectiveBashMode, recommendDefault, bashGateReason, BASH_GATE_CLASSIFIER, BASH_EDIT_GATE_DEFAULT, FP_THRESHOLD, VALID_BASH_MODES"
  - "lib/__fixtures__/tracked-repo.cjs: makeTrackedRepo, a hermetic git repo with tracked, untracked, ignored and dated-history files"
affects: [60-04, 60-05, 60-06]

tech-stack:
  added: []
  patterns:
    - "One decision, injected predicates: the hook passes live fs and git, the replay passes history"
    - "Fail open: no isTracked means nothing is gated; any git failure is an empty set"
    - "One git call per evaluation, and none when there is no candidate"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
    - plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs
  modified: []

key-decisions:
  - "gitTrackedSet takes an optional `env` so hermetic tests run git without mutating process.env; the hook never passes it (the TRD's error_recovery offered this as one of two options)"
  - "makeTrackedRepo also returns `projectRoot` (the directory holding planningDir), needed to test a nested project"
  - "A rate that is not a finite number in [0, 1] is no evidence, so recommendDefault gives warn (a negative rate included)"
  - "The default isOutside treats only `..` and `../...` as outside, so a file named `..foo` inside the project is not mistaken for an escape"

requirements-completed: [GATE-01, GATE-03, GATE-04, GATE-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-06
---

# Objective 60 TRD 03: The Bash write gate decision Summary

**`lib/bash-write-gate.cjs` decides which detected Bash writes land on a tracked project file (gated) and which pass with a named reason, holds the strict-vs-warn rule as code (`FP_THRESHOLD = 0.02`, `recommendDefault`) and the editGate-softens-Bash severity rule, and asks git once per evaluation, failing open.**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-10-06
- **Tasks:** 3/3 (five commits: Task 1 is a fixture, Tasks 2 and 3 are each RED then GREEN)
- **Files modified:** 3 (all created)

## Progress
- [x] Task 1: Hermetic tracked-repo fixture builder — 1bcb9e05
- [x] Task 2: evaluateBashWrites and target classification (tests 1-4) — 141038c1 (RED), be0a4b47 (GREEN)
- [x] Task 3: Severity, strict-vs-warn rule, reason text and live tracked check (tests 5-10) — e14eb112 (RED), a44e2e8e (GREEN)

## Accomplishments

- `evaluateBashWrites(cmd, { cwd, projectRoot, home, isOutside, isDirectory, isTracked })` returns `{ writes, gated, passed }`. Each target passes as `unresolvable`, `outside-project`, `planning` (any `.planning` segment below the project root), `markdown`, or becomes a candidate. One `isTracked` call turns candidates into `gated` or `untracked`, and it is not made when there is no candidate. `cp` and `mv` into a directory (trailing slash, `-t`, `.`, or an existing directory) are judged on `<dir>/<basename(source)>`.
- Fail-open defaults: no `isTracked` gates nothing, no `isDirectory` treats a bare destination as a file.
- `effectiveBashMode(editGate, bashEditGate)` is the least severe of the two (`off < warn < strict`); an unknown editGate counts as strict, a null or invalid bashEditGate is `BASH_EDIT_GATE_DEFAULT`. The lib never reads `gates.editGate`.
- `readBashEditGate(planningDir)` returns the mode verbatim or null, and never throws.
- GATE-05 rule is code: `FP_THRESHOLD = 0.02`, `recommendDefault(rate)`; `BASH_EDIT_GATE_DEFAULT = 'warn'` until 60-06 sets it from the measurement.
- `bashGateReason` gives the one-line strict (`denied`) or warn (`needs approval`) text with the first three relative paths then `(+N more)`; `BASH_GATE_CLASSIFIER` matches both and not the Edit/Write denial.
- `gitTrackedSet(root, absPaths, { timeoutMs, env })`: one `git --literal-pathspecs -C <root> ls-files -z -- <rels>`, rels taken from `realpathDeep` of the root and each target (macOS `/var` vs `/private/var` both work), no `--full-name` (a nested project works), empty set on any failure.
- `makeTrackedRepo` builds the hermetic repo, including dated history for the 60-05 replay.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builder | `node -e "...makeTrackedRepo({files, untracked, history})..."` (the TRD's command) | 0, printed `.planning/config.json,old.js,src/a.js true` | PASS |
| 2: Classification | `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` (26 tests, all 14 PATH_CASES) | 0 | PASS |
| 3: Severity, reason, tracked check | `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` (81 tests) | 0 | PASS |

## Task Commits

1. **Task 1** - `1bcb9e05` (test): fixture builder
2. **Task 2 RED** - `141038c1` (test): `node --test` exited 1 with `Cannot find module './bash-write-gate.cjs'`
3. **Task 2 GREEN** - `be0a4b47` (feat)
4. **Task 3 RED** - `e14eb112` (test): the new tests for tests 5-10 failing with `... is not a function` (tests 1-4 stayed green)
5. **Task 3 GREEN** - `a44e2e8e` (feat)

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` (module missing) | 1 | FAIL (correct) |
| GREEN (Task 2) | same | 0 | PASS (correct), 26 tests |
| RED (Task 3) | same, tests 5-10 added | 1 | FAIL (correct), new exports undefined |
| GREEN (Task 3) | same | 0 | PASS (correct), 81 tests |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task: test | `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` | 0 | PASS (81 tests, 0 fail, 0 skipped) |
| regression | `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/devflow/bin/lib/shell-words.test.cjs` | 0 | PASS (148 tests) |
| verification | `rg -n "BASH_EDIT_GATE_DEFAULT = 'warn'" .../bash-write-gate.cjs` | 0 | one match (line 148) |
| verification | `rg -n "editGate" .../bash-write-gate.cjs` | 0 | comments and parameter names only, no config read of `gates.editGate` |
| objective: test (full) | `npm test` | not run | Owned by 60-07 per the dispatch |

## Deviations from Plan

None - TRD executed as written. Small additions inside its contract:

- `gitTrackedSet` takes an `env` option (the TRD's error_recovery allowed it); the hook never passes it, and one test runs without it under `applyGitTestEnv` to cover the hook path.
- `makeTrackedRepo` returns `projectRoot` beside the TRD's `{ root, home, env, git, run, cleanup }`.
- Beyond the TRD's test list: a tracked file named `:(top)magic.js` (pathspec magic must be a name). Mutation check: with `--literal-pathspecs` removed, that test fails, so the flag is pinned. The TRD's `src/[x].js` case alone cannot pin it, because tracked names are mapped back by exact name.

## Notes

- `BASH_EDIT_GATE_DEFAULT = 'warn'` stays until 60-06 sets it from `recommendDefault(false_positive_rate)`.
- `realpathDeep` resolves the target leaf too (as the TRD specifies): a tracked symlink is judged on what it points at, which is what a write through it changes.
- 60-04's hook should pass `isTracked: (abs) => gitTrackedSet(root, abs)` and `isDirectory` over `fs.statSync`, as test 10 does.

## Discovered commands

None. The stack profile (`general`) names `npm test` and `node --test {files}`, and the scoped form was used as given.

## Flutter UI Evidence

Not applicable (non-UI TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - every PATH_CASES entry yields its expected gated list and passed reasons (all 14)
  - `.planning/`, `*.md`, outside-root, untracked and unresolvable targets pass with named reasons
  - `cp`/`mv` into a directory is judged on `<dir>/<basename(source)>`
  - `gitTrackedSet` asks git once, handles symlinked spellings, and fails open
  - `effectiveBashMode` is the least severe of editGate and bashEditGate
  - `FP_THRESHOLD = 0.02`, `recommendDefault`, and `BASH_EDIT_GATE_DEFAULT = 'warn'` live in one place
- Gate failures: None

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/bash-write-gate.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs`
- FOUND commits: `1bcb9e05`, `141038c1`, `be0a4b47`, `e14eb112`, `a44e2e8e`
