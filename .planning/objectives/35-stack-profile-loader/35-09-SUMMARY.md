---
objective: 35-stack-profile-loader
job: "09"
subsystem: detection
tags: [stack-profile, dart, kotlin, swift, org-profiles, detectManifest, brownfield, codebase-mapper]

# Dependency graph
requires:
  - objective: 35-04
    provides: "listOrgProfiles({userHome}) reading installed org-tier profiles from <userHome>/.claude/devflow/stacks/*.md"
  - objective: 35-05
    provides: "validate.cjs Check 12 already calling detectManifest(cwd, {userHome: homeDir}) ahead of this TRD"
provides:
  - "stackProfile.detectMarkers({userHome}) — unions all installed org profiles' `detect` lists into [{marker, profile, languages}]"
  - "stackProfile.matchMarkersAt(root, markers) — filters markers against a root directory's entries"
  - "project-state.cjs detectManifest recognizes Dart/Kotlin/Swift manifests and falls back to org-profile markers"
  - "brownfield-detector.cjs and project-state.cjs countSourceFiles recognize .dart/.kt/.kts/.swift, plus org-marker *.ext extensions"
  - "init.cjs cmdInitNewProject and cmdInitSecurityAudit recognize Dart/Kotlin/Swift and org-profile languages"
  - "codebase-mapper.md tech-focus command list covers pubspec.yaml/Gemfile/gradle manifests and points at STACK.md's Commands table"
affects: [35-stack-profile-loader wave 5 and later, codebase-mapper, /devflow:map-codebase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "detectMarkers({userHome}) as the single union point between built-in per-detector language lists and installed org-profile `detect` markers — stack-profile.cjs itself stays language-neutral (enforced by rg grep)."
    - "New MANIFEST_LANG / EXTS entries are strictly APPENDED, never inserted or reordered, to preserve first-match language resolution for all pre-existing repos."
    - "Library functions take userHome as an explicit parameter; only CLI entry points read os.homedir()."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/project-state.cjs
    - plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/agents/codebase-mapper.md

key-decisions:
  - "MANIFEST_LANG and EXTS additions appended after existing entries (never reordered) so every pre-existing detector result for existing repos is unchanged."
  - "detectMarkers/matchMarkersAt live in stack-profile.cjs and stay stack-neutral; only the three detector files (project-state, init, brownfield-detector) are permitted to name languages (neutrality exception, verified via rg)."
  - "brownfield-detector.countSourceFiles gained an optional {extraExts} parameter rather than a second EXTS set, keeping the two files' base EXTS sets identical (D11)."

patterns-established:
  - "Detector CLI entry points resolve os.homedir() once and pass {userHome} down to pure functions — never read the real home inside library code, so tests can mkdtemp a fake home."

requirements-completed:
  - "STK-09: the three detectors know Dart, Kotlin and Swift and union their built-in markers with installed org profiles' `detect` lists through one exported detectMarkers(); a Dart-only repo is detected as Dart by all three"

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~70min
completed: 2026-09-27
---

# Objective 35 TRD 09: Detectors know Dart/Kotlin/Swift and read org-profile markers Summary

**`detectMarkers({userHome})` unions built-in Dart/Kotlin/Swift manifest lists across project-state, init, and brownfield-detector with installed org profiles' `detect` markers, with a Dart-only repo now recognized by all three detectors and codebase-mapper's tech scan covering pubspec/Gemfile/gradle.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 completed
- **Files modified:** 5 (1 new test file, 4 modified source/doc files)

## Accomplishments
- `stackProfile.detectMarkers({userHome})` + `matchMarkersAt(root, markers)` added to stack-profile.cjs — the single union point between built-in detector lists and installed org-profile `detect` markers, with stack-profile.cjs itself verified to stay language-neutral.
- `project-state.detectManifest`, `init.cjs` (`cmdInitNewProject` + `cmdInitSecurityAudit`), and `brownfield-detector.cjs` all recognize Dart (`pubspec.yaml`, `.dart`), Kotlin (`build.gradle.kts`, `.kt`, `settings.gradle.kts`, `build.gradle`→java), and Swift (`Package.swift`, `.swift`), plus any org-profile marker/extension.
- `codebase-mapper.md`'s tech-focus exploration reads `.planning/STACK.md`, lists pubspec.yaml/Gemfile/gradle manifests, and directs findings into STACK.md's `## Commands` table.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: detectMarkers + project-state (D1-D4,D7-D9,D11) | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs plugins/devflow/devflow/bin/lib/project-state.test.cjs plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS |
| 2: init.cjs + brownfield CLI extra exts (D5,D6,D10) | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs` | 0 | PASS |
| 3: codebase-mapper tech command list | `rg -n "pubspec.yaml Gemfile build.gradle" plugins/devflow/agents/codebase-mapper.md` (+ `cat .planning/STACK.md` and `## Commands` rg checks) | 0 | PASS |

## Task Commits

Each task was committed atomically, with strict TDD (RED then GREEN) for Tasks 1 and 2:

1. **Task 1 RED** — `fb3230c` (test): detectors for dart/kotlin/swift and org markers (D1-D4, D7-D9, D11)
2. **Task 1 GREEN** — `607234b` (feat): detectMarkers and project-state detection
3. **Task 2 RED** — `48efd51` (test): init and brownfield CLI detect dart (D5, D6, D10 appended)
4. **Task 2 GREEN** — `4c3c7dc` (feat): init and brownfield detectors read org markers
5. **Task 3** — `45fc859` (docs): codebase-mapper lists pubspec, Gemfile and gradle manifests

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Fast verify (6 suites) | `node --test plugins/devflow/devflow/bin/lib/{stack-detectors,project-state,brownfield-detector,init,stack-profile,validate}.test.cjs` | 0 | PASS (168/168, 14 suites, 0 fail, 0 skipped) |
| Neutrality | `rg -n -i "golang\|gofmt\|\bdart\b\|flutter\|pubspec\|\bnpm\b\|cargo\|pytest\|rails\|gradle\|swift\|kotlin" plugins/devflow/devflow/bin/lib/stack-profile.cjs` | 1 (no matches) | PASS |
| Full regression gate | see "Regression Gate" below | n/a | PASS (0 regressions) |

## TDD Evidence

**Task 1** (`stack-detectors.test.cjs` D1-D4, D7-D9, D11 against `detectMarkers`/`detectManifest`):

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs` (before `detectMarkers`/`matchMarkersAt`/MANIFEST_LANG additions existed) | non-zero | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs plugins/devflow/devflow/bin/lib/project-state.test.cjs plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS (correct) |

**Task 2** (`stack-detectors.test.cjs` D5, D6, D10 appended, exercising `init.cjs` + brownfield CLI via `spawnSync` with `HOME=fake`):

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs` (before init.cjs/brownfield CLI wiring existed) | non-zero | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs` | 0 | PASS (correct) |

Task 3 is `type="auto"` (non-TDD, doc-only) per its TRD task declaration — no RED/GREEN cycle applies.

## Post-TRD Verification

- **Auto-fix cycles used:** 0 — every RED phase failed as expected and every GREEN phase passed on first attempt; no debugging iterations were needed.
- **Must-haves verified:** 7/7 (all `must_haves.truths` from TRD frontmatter — detectMarkers shape/neutrality, Dart-repo detection across all three detectors, Kotlin/Swift recognition, org-only-marker detection, MANIFEST_LANG append-only ordering, EXTS-set identity, codebase-mapper command list — each covered by a specific D-test or the Task 3 rg checks).
- **Gate failures:** None attributable to this TRD's changes (see Regression Gate below).

## Baseline-overlap re-check (project-state.test.cjs cases 21a, 23, 26, 29)

Per the TRD's gotcha, these four cases are listed in `baseline-failures.tsv` as environment-dependent (git/signing-sensitive) and this TRD edits `project-state.cjs`, so their output was re-checked explicitly rather than assumed:

```
✔ case 21a: real git repo with backdated commit → returns integer ≥ 7
✔ case 23: brownfield substantive (git+manifest+50 files, no planning) → is_substantive:true
✔ case 26: declined project → previously_declined:true, decline_expires:non-null
✔ case 29: subprocess smoke — df-tools project-state <brownfield> --raw → valid JSON
```

All four **pass** in this environment (they are baseline-listed as failing elsewhere, not here). None of the four failure/pass paths touch `detectManifest` or `EXTS` — case 21a exercises git commit dating, 23/26/29 exercise brownfield/decline/subprocess plumbing unrelated to manifest detection. No regression introduced by this TRD's `detectManifest`/EXTS changes.

## Regression Gate (baseline-relative)

Full suite: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`, output written only to the session scratchpad (never the repo).

**Totals:** 3592 tests, 3558 pass, 2 fail, 32 skipped.

| Failure | Classification | Evidence |
|---|---|---|
| `handoff-e2e.test.cjs:795` — MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN | Pre-existing (exact match in `baseline-failures.tsv`) | Listed verbatim in `.planning/objectives/35-stack-profile-loader/baseline-failures.tsv`; part of the pre-supplied daemon/PID-lifecycle family (category a) reproduced on a clean base-0fb49ae worktree containing none of objective 35's code. `git diff --stat <base>..HEAD` confirms this TRD touches none of `devflow-watch.test.cjs`/`handoff-e2e.test.cjs`. |
| `roadmap-reconcile.test.cjs:984` — E2E1 self-test | Environment/orchestrator-owned drift, not a regression (category b) | Matches the pre-supplied description exactly: 35-08's SUMMARY.md exists on disk with an unticked ROADMAP checkbox, which is orchestrator-owned drift ticked after the wave completes, not code this TRD wrote. `git diff --stat <base>..HEAD` confirms this TRD touches none of `roadmap-reconcile.cjs` or `ROADMAP.md`. |

**Gate result: PASS — 0 true regressions.** Both failures were individually re-run and confirmed to match the two explicitly pre-supplied "known not-a-regression" categories, with no code overlap between this TRD's 5 changed files and either failing test's subject matter.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs` - New: D1-D11 test list covering detectMarkers, matchMarkersAt, and Dart/Kotlin/Swift/org-marker detection across all three detectors and the CLI entry points
- `plugins/devflow/devflow/bin/lib/stack-profile.cjs` - Added `detectMarkers({userHome})` and `matchMarkersAt(root, markers)`, exported alongside `listOrgProfiles`; stays language-neutral
- `plugins/devflow/devflow/bin/lib/project-state.cjs` - `MANIFEST_LANG` appended with pubspec.yaml/dart, build.gradle.kts/kotlin, settings.gradle.kts/kotlin, build.gradle/java, Package.swift/swift; `EXTS` appended with .dart/.kt/.kts/.swift; `detectManifest(rootDir, {userHome})` falls back to `matchMarkersAt(rootDir, detectMarkers({userHome}))`; `getProjectState` threads `userHome`; `cmdProjectState` passes `os.homedir()`
- `plugins/devflow/devflow/bin/lib/brownfield-detector.cjs` - `EXTS` appended identically to project-state.cjs; `countSourceFiles(root, {extraExts})` accepts extra extensions; `cmdDetectBrownfieldMap` derives `extraExts` from matched `*.ext` org-profile markers via `detectMarkers`/`matchMarkersAt`; exports `countSourceFiles`
- `plugins/devflow/devflow/bin/lib/init.cjs` - `cmdInitNewProject`'s `find` name-list and `hasPackageFile` extended for Dart/Kotlin/Swift/org markers; `cmdInitSecurityAudit`'s `stack` array extended for Dart/Kotlin/Swift plus org-profile languages via `detectMarkers({userHome: os.homedir()})`
- `plugins/devflow/agents/codebase-mapper.md` - Tech-focus exploration now reads `.planning/STACK.md` first, lists pubspec.yaml/Gemfile/gradle manifests, and directs findings into STACK.md's `## Commands` table

## Decisions Made
- MANIFEST_LANG/EXTS additions are strictly appended (never inserted mid-list or reordered) so first-match language resolution — and therefore every existing detector result — is unchanged for pre-existing repos.
- `brownfield-detector.countSourceFiles` took an optional `{extraExts}` parameter rather than a parallel EXTS set, so the two files' base EXTS sets remain provably identical (D11's regex-extraction equality test).
- `detectMarkers`/`matchMarkersAt` were placed in stack-profile.cjs (not the detector files) as the one union point, keeping the neutrality boundary at exactly the three detector files per the TRD's runtime model.

## Deviations from Plan

None — TRD executed exactly as written. One internal sequencing note (not a deviation from the delivered result): `stack-detectors.test.cjs` was initially drafted in full (D1-D11 together), then split so D5/D6/D10 were committed as part of Task 2's own RED/GREEN cycle — matching the TRD's task boundaries (Task 1 owns D1-D4/D7-D9/D11; Task 2 owns D5/D6/D10) and preserving atomic per-task commits.

## Issues Encountered
None. All RED phases failed as expected on first run; all GREEN phases passed on first attempt with no debugging cycles.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- Wave 5 detector work for objective 35 is complete: all three detectors (project-state, init, brownfield-detector) union built-in Dart/Kotlin/Swift recognition with installed org-profile markers via the single `detectMarkers({userHome})` entry point.
- `validate.cjs` Check 12 (shipped by 35-05 ahead of this TRD) now exercises a fully wired `detectManifest(cwd, {userHome})` — confirmed no behavior shift via the existing H1-H10 Check 12 suite.
- No blockers for downstream objective-35 waves or for `/devflow:map-codebase`'s tech-focus pass, which now surfaces Dart/Kotlin/Swift/Ruby manifests alongside the pre-existing set.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/stack-profile.cjs` (detectMarkers/matchMarkersAt present)
- FOUND: `plugins/devflow/devflow/bin/lib/project-state.cjs` (MANIFEST_LANG/EXTS additions present)
- FOUND: `plugins/devflow/devflow/bin/lib/brownfield-detector.cjs` (EXTS/extraExts additions present)
- FOUND: `plugins/devflow/devflow/bin/lib/init.cjs` (Dart/Kotlin/Swift/org-marker wiring present)
- FOUND: `plugins/devflow/agents/codebase-mapper.md` (pubspec/Gemfile/gradle + STACK.md/Commands references present)
- FOUND commit `fb3230c` (test: detectors for dart/kotlin/swift and org markers)
- FOUND commit `607234b` (feat: detectMarkers and project-state detection)
- FOUND commit `48efd51` (test: init and brownfield CLI detect dart)
- FOUND commit `4c3c7dc` (feat: init and brownfield detectors read org markers)
- FOUND commit `45fc859` (docs: codebase-mapper lists pubspec, Gemfile and gradle manifests)

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
