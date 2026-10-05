---
objective: 37-adopt-existing-repos
trd: "04"
subsystem: detection
tags: [detector, delegation, project-state, brownfield, init, tdd]

# Dependency graph
requires: ["37-01"]
provides:
  - "project-state.cjs, brownfield-detector.cjs, init.cjs cmdInitNewProject: thin adapters over repo-state.cjs's detectRepoState — one detector, three consumers"
  - "repo-state.cjs now owns MANIFEST_LANG/detectManifest/gitAgeDays (moved from project-state.cjs), inverting the 37-01 dependency direction"
  - "repo-state-delegation.test.cjs: parity proof across all three adapters + detectRepoState on the shared adopt fixtures"
affects: ["37-05", "37-08", "37-10", "37-11", "37-12", "37-13"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "downloadsHome option on isScratchDir/collectSignals/detectRepoState — decouples the org-marker userHome from the always-real-home ~/Downloads scratch rule, so project-state.cjs's adapter can keep its legacy Downloads behaviour independent of a null userHome"
    - "adapter re-export by reference (identity) for functions whose signature is unchanged (countSourceFiles, detectManifest, gitAgeDays); wrap only when the legacy public signature differs (isScratchDir)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/repo-state-delegation.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/repo-state.cjs
    - plugins/devflow/devflow/bin/lib/project-state.cjs
    - plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs

key-decisions:
  - "Scratch semantics: getProjectState always evaluates the ~/Downloads rule against the REAL os.homedir(), independent of the userHome option (which only ever drove detectManifest's org-marker fallback). Implemented via a new `downloadsHome` option (defaults to `userHome` for repo-state.test.cjs's existing calls); project-state.cjs's adapter passes `downloadsHome: os.homedir()` explicitly. This exactly reproduces the pre-37-04 production behaviour of hooks/classify-session.js, which calls getProjectState(cwd) with userHome defaulting to null."
  - "init.cjs's `find -maxdepth 3` shell-out is replaced by repo-state's unbounded countSourceFiles walk — a source file nested 5+ directories deep, previously invisible to is_brownfield/needs_codebase_map, is now correctly detected. Intentional behaviour change, covered by repo-state-delegation.test.cjs test 4."
  - "Minor narrowing: legacy init.cjs treated `requirements.txt` as a Python manifest signal directly; repo-state.cjs's MANIFEST_LANG (moved from project-state.cjs, unchanged) only recognizes `pyproject.toml` for Python. A Python project with only requirements.txt now reports has_package_file:false where it previously reported true. No test in the repo references requirements.txt (confirmed via grep); a Python project with actual .py source files still trips is_brownfield via code_files > 0 regardless. Documented here per the TRD's own instruction to record intentional narrowing."
  - "isSubstantive is kept as a standalone exported pure function in project-state.cjs (not migrated) — getProjectState now sources is_substantive from repo-state's derive() instead of calling it directly. Both formulas are identical (verified: repo-state.test.cjs test 23 and project-state.test.cjs cases 1-8 agree); isSubstantive remains exported for direct callers."

patterns-established:
  - "One detector (repo-state.cjs), three thin adapters — MANIFEST_LANG/detectManifest/gitAgeDays live in exactly one place; EXCLUDE/EXTS live in exactly one place (rg -n 'const EXCLUDE|const EXTS' plugins/devflow/devflow/bin/lib/ matches only repo-state.cjs)."

requirements-completed: ["ADP-01"]

# Verification evidence
verification:
  tasks_passed: 2
  tasks_total: 2
  deviations: 4
  auth_gates: 0

metrics:
  duration: "~1h (continuation session)"
  completed: 2026-09-28
tokens_input: 9172499
tokens_output: 76583
tokens_cache_read: 8948606
tokens_cache_write: 223719
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 04: The three heuristics delegate to repo-state Summary

Made `project-state.cjs`, `brownfield-detector.cjs`, and `init.cjs`'s `cmdInitNewProject` thin
adapters over `repo-state.cjs`'s `detectRepoState` — one canonical repo classifier, three
consumers, with the require-cycle inverted so `repo-state.cjs` no longer depends on
`project-state.cjs`.

## What Changed

- **`repo-state.cjs`**: gained `MANIFEST_LANG`, `detectManifest`, `gitAgeDays` (moved verbatim
  from `project-state.cjs`), and a new `downloadsHome` option threaded through `isScratchDir` /
  `collectSignals` / `detectRepoState` (see key-decisions).
- **`project-state.cjs`**: `getProjectState` now calls `repoState.detectRepoState` and returns its
  legacy 8 fields plus the new `state` field. `detectManifest`, `gitAgeDays`, `countSourceFiles`
  are re-exported by reference from `repo-state.cjs` (same function objects). `isScratchDir` is a
  1-line wrapper preserving the module's historical single-argument signature. `isSubstantive`
  remains a standalone pure export. The local `EXCLUDE`/`EXTS` sets are gone.
- **`brownfield-detector.cjs`**: `cmdDetectBrownfieldMap` now calls `repoState.detectRepoState` and
  builds its legacy 5-field output from `derived.should_offer_map` and `signals`. `countSourceFiles`
  is re-exported by reference. Local `EXCLUDE`/`EXTS` sets are gone.
- **`init.cjs`**'s `cmdInitNewProject`: the `find -maxdepth 3` shell-out, the manual org-marker
  lookup, and the manifest-filename OR-chain are replaced by one `detectRepoState(cwd, {userHome})`
  call. Output keeps `has_existing_code`, `has_package_file`, `is_brownfield`,
  `needs_codebase_map` and adds `repo_state: {state, signals}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `stack-detectors.test.cjs` test D11 invalidated by the refactor**
- **Found during:** Task 1 GREEN, pre-verification sweep for hidden regression surfaces (grep
  across `lib/` for `const EXCLUDE|const EXTS`)
- **Issue:** D11 read the raw source text of `project-state.cjs` and `brownfield-detector.cjs` via
  regex looking for a literal `const EXTS = new Set([...])` declaration in each. After delegation,
  neither file declares `EXTS` locally — both re-export `countSourceFiles` from `repo-state.cjs`
  — so the regex match fails outright (not a semantic disagreement, a structural one: the thing
  being compared no longer exists in either file).
- **Fix:** Rewrote D11 to assert function identity instead of textual equality:
  `psCountSourceFiles === repoState.countSourceFiles` and `bfCountSourceFiles ===
  repoState.countSourceFiles` (both already imported at the top of that file). This is a *stronger*
  guarantee than the original text comparison and correctly reflects the single-source-of-truth
  architecture.
- **Files modified:** `plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs`
- **Commit:** eda8ea4

**2. [Rule 1 - Bug] Test 9's own source text tripped its own `rg` needle**
- **Found during:** Task 1 GREEN, running the must-haves check `rg -n "const EXCLUDE|const EXTS"
  plugins/devflow/devflow/bin/lib/` after writing `repo-state-delegation.test.cjs`
- **Issue:** Test 9's header comment and test-name string literally contained the substrings
  `const EXCLUDE` / `const EXTS` (to describe what the test checks), which made the required
  must-haves `rg` check match the test file itself, not just `repo-state.cjs`.
- **Fix:** Reworded the comment and test name to describe the same check without the literal
  contiguous substring (the test body itself already built its search needle via `.join(' ')`
  string concatenation, so only the prose needed changing).
- **Files modified:** `plugins/devflow/devflow/bin/lib/repo-state-delegation.test.cjs`
- **Commit:** 66f9330

Both are pre-existing-test / self-test structural casualties of the intentional refactor, not
behavioral regressions — see the TRD's own `error_recovery` guidance ("an existing suite fails
after delegation → restore exact parity before continuing").

None of the four key-decisions above (scratch semantics, depth-5 behavior, requirements.txt
narrowing, isSubstantive delegation) required a Rule-4 checkpoint — all fell under Rule 1/2
(bug-fix/critical-functionality-preserving) or were explicitly pre-authorized by the TRD text
itself ("pick whichever keeps project-state.test.cjs green ... state which in SUMMARY").

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: project-state.cjs / brownfield-detector.cjs delegate to repo-state | `node --test repo-state-delegation.test.cjs project-state.test.cjs brownfield-detector.test.cjs repo-state.test.cjs validate.test.cjs` | 0 | PASS (134/134) |
| 2: init.cjs `cmdInitNewProject` delegates to repo-state | `node --test repo-state-delegation.test.cjs init.test.cjs classifier.test.cjs classify-session.test.js` | 0 | PASS (114/114) |
| D11 fix confirmation | `node --test stack-detectors.test.cjs` | 0 | PASS (11/11) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (tests 1-9 written against pre-refactor code) | `node --test repo-state-delegation.test.cjs` prior to the adapter rewrite would fail on missing `repo_state`/`state` fields and the depth-5 case | non-zero | FAIL (correct — implementation not yet written) |
| GREEN (after repo-state.cjs/project-state.cjs/brownfield-detector.cjs/init.cjs rewrite) | `node --test repo-state-delegation.test.cjs` | 0 | PASS (9/9) |
| GREEN (full task suites) | see Task Evidence table above | 0 | PASS |

Note: the RED run was validated analytically during implementation (each adapter file was rewritten
directly to the target design informed by the test list, rather than run-fail-fix in strict
lockstep) rather than captured as a literal pre-refactor `node --test` transcript — the GREEN
evidence above is captured directly.

## Regression Gate

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs'
'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (run once from repo root).

- **Observed totals:** 3868 tests, 3835 pass, 1 fail, 32 skipped, 0 cancelled.
- **Failures classified:**

| Test | File:Line | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Baseline** — present verbatim in `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`. Pre-existing, unrelated to this TRD's files. |

- **New/undeclared regressions: 0.** No failure outside the baseline TSV occurred. The four
  `project-state.test.cjs` cases listed in the baseline TSV (21a, 23, 26, 29 — environment-timing
  sensitive) did NOT fail in this run; baseline entries are a tolerance allowlist, not a
  requirement that they always fail.
- `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- Auto-fix cycles used: 2 (both documented above under Deviations)
- Must-haves verified:
  - `getProjectState` keeps its 8 legacy keys + adds `state` — verified by
    `repo-state-delegation.test.cjs` test 6 and `project-state.test.cjs` (unchanged, all green).
  - `project-state.cjs` keeps its 7 exports; `countSourceFiles`/`isScratchDir` are repo-state-backed
    — verified by test 8 (function identity) and `project-state.test.cjs`.
  - `brownfield-detector.cjs` keeps its 5-field output shape — verified by
    `brownfield-detector.test.cjs` (unchanged, all green) and test 5.
  - `init new-project` keeps its 4 legacy fields + adds `repo_state` — verified by tests 1-4;
    `rg -n "maxdepth 3" plugins/devflow/devflow/bin/lib/init.cjs` finds nothing.
  - Parity across all three adapters on the 5 adopt fixtures — verified by test 7.
  - `rg -n "const EXCLUDE|const EXTS" plugins/devflow/devflow/bin/lib/` matches only
    `repo-state.cjs` — verified directly (see command output below) and by test 9.
  - 6/6 must_haves truths: **PASS**
- Gate failures: None outside baseline (see Regression Gate above)

```
$ rg -n "const EXCLUDE|const EXTS" plugins/devflow/devflow/bin/lib/
plugins/devflow/devflow/bin/lib/repo-state.cjs:25:const EXCLUDE = new Set([
plugins/devflow/devflow/bin/lib/repo-state.cjs:36:const EXTS = new Set([
```

## Commits

| Hash | Message |
|---|---|
| eda8ea4 | test(37-04): repo-state adapter parity cases |
| 05b7f17 | refactor(37-04): project-state, brownfield-detector, and init new-project delegate to repo-state |
| 66f9330 | fix(37-04): reword test 9 so it does not self-match the EXCLUDE/EXTS rg check |

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/repo-state-delegation.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/repo-state.cjs` — FOUND (modified)
- `plugins/devflow/devflow/bin/lib/project-state.cjs` — FOUND (modified)
- `plugins/devflow/devflow/bin/lib/brownfield-detector.cjs` — FOUND (modified)
- `plugins/devflow/devflow/bin/lib/init.cjs` — FOUND (modified)
- `plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs` — FOUND (modified)
- Commit eda8ea4 — FOUND in `git log`
- Commit 05b7f17 — FOUND in `git log`
- Commit 66f9330 — FOUND in `git log`
