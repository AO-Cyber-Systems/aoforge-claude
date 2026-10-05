---
objective: 42-codebase-aware-stack-drafter
trd: "08"
job: 42-08
subsystem: stack-drafter
tags: [stack-report, ci-cd, recommendations, adopt, sdr-06]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-01 lazy STACK_EXTENSIONS dispatch; 42-03 stack-shell/stack-ci/stack-classify WEAK_MARKERS; 42-04 stack-runners; 42-05 stack-detect.detectAreas; 42-06 stack-verify.describeInvocation; 42-07 draftProfile notes"
provides:
  - "stack-report.buildRecords(root, {areas}) -> invocation records {origin, scope, file, job?, target?, runner?, ciFile?, cwd, area, text, tool, continueOnError, weakMarkers, scheduled}"
  - "stack-report.REPORT_CHECKS: all 33 research §4 IDs as data"
  - "stack-report.computeFindings({areas, records, notes, root}) / renderReport(findings, meta) / buildReport({projectRoot, userHome, draft, now, verifyOpts, verify}) / writeReport / cli"
  - "df-tools stack report [--write] [--draft] [--raw] (via STACK_EXTENSIONS.report; stack-profile.cjs untouched)"
  - "adopt report writes STACK-REPORT.md when absent, links it, one medium row per gap"
affects: [42-11 fleet rollout (uses stack report --draft --raw)]

tech-stack:
  added: []
  patterns:
    - "Every source (CI step, uses: action, runner target, wrapper script) becomes one record shape; checks are regex data over records"
    - "scope ci vs local: a CI step's make/task/just/npm call expands into the target body (depth <= 2, cycle guard runner|dir|name) and stays ci scope"
    - "Proposals only: the only file the report ever writes is .planning/STACK-REPORT.md"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-report.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-report-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-report.test.cjs

key-decisions:
  - "With no CI at all, CI-gate rows fold into one CI-MISSING info row that lists the baseline gates per stack (no wall of gaps); FLUT-MAESTRO and DOCKER-PIN still evaluate"
  - "Records at the repo root ('' area) count toward every area; a record under svc/ counts only for svc/ (false gaps are worse than a missed one)"
  - "DART-ANALYZE: absent -> weak; --no-fatal-* -> weak; plain `dart analyze` without --fatal-infos -> info; plain `flutter analyze` (infos fatal by default) -> no row"
  - "DART-OUTDATED, FLUT-GOLDEN and JS-CI fire only when triggered (pub outdated used as a gate, --exclude-tags golden, npm install), never on absence"
  - "GO-COVER / DART-COVER apply only when CI already runs the tests; JS-TYPE only with tsconfig.json; JS-E2E only when playwright/cypress is configured"
  - "GO-VULN present but in no scheduled workflow is weak (new CVEs need no code change)"
  - "LOCAL-MIRROR is one gap per area naming every STACK.md key whose gate runs only in CI"
  - "Default output is the markdown; the global --raw prints the JSON result (the TRD's `--raw prints JSON`)"
  - "DART-COVER for pure Dart proposes `dart test --coverage=coverage` (Q8 verified)"

patterns-established:
  - "Finding {id, severity, component, finding, evidence[], proposal, snippet?}; DRAFT-NOTE-<key> rows also carry note {key, candidate, status, source}"

requirements-completed: [SDR-06]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: ~45min
completed: 2026-09-29
tokens_input: 13371442
tokens_output: 125612
tokens_cache_read: 13106398
tokens_cache_write: 264909
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 42 TRD 08: Recommendations report (`.planning/STACK-REPORT.md`) Summary

**`df-tools stack report` normalises CI steps, `uses:` actions, runner targets and wrapper scripts into one invocation-record model. It evaluates the full 33-row research catalogue against the detected areas and emits `.planning/STACK-REPORT.md`, which lists gap/weak/info proposals plus the drafter's notes. It never edits CI, runners or STACK.md. `adopt report` writes the report when it is absent, links it, and adds one medium row per gap.**

## Performance

- **Duration:** about 45 min, including one resume at the turn limit
- **Tasks:** 3/3, each committed RED then GREEN (6 commits)
- **Files:** 3 created, 2 modified

## Accomplishments

- **Record model (`buildRecords`).** CI records come from `parseWorkflows`, including `uses:<owner/repo>` records. A CI `make`/`task`/`just`/npm-script call expands into its target body; those records stay `scope: 'ci'` and carry `ciFile`/`job`. Expansion is capped at depth 2 and has a cycle guard, so a self-calling target stops. A wrapper script run as `./scripts/x.sh` or `bash x.sh` is read once. Local runner-target bodies have `scope: 'local'`. Each record carries `weakMarkers` (the stack-classify WEAK_MARKERS plus `bare gofmt -l`), `continueOnError` and `scheduled`.
- **Catalogue (`REPORT_CHECKS`).** All 33 IDs are data: `ci`/`weak` regexes plus the optional `sequence` (generator then `git diff --exit-code`), `all` (for helm lint plus kubeconform), `trigger`, `applies`, `requiresCi` and `anywhere`. Two small evaluators handle DOCKER-PIN (FROM lines not pinned by digest, stage aliases ignored) and CI-HYGIENE (permissions, SHA pins, timeout-minutes, concurrency).
- **Findings, render and CLI.** Findings are sorted by severity, then component, then id, then text. The frontmatter follows the documented format. The Gaps, Weak, Info and Draft notes tables escape `|`. `--write` writes only STACK-REPORT.md, `--draft` reports against the in-memory draft, and the output is byte-identical when the date is injected.
- **adopt integration.** The stack-report module is loaded lazily and its date comes from the adopt marker. A present STACK-REPORT.md is never overwritten, and the gap rows are recomputed on every run.

## Q8 outcome (dart test --coverage)

The check ran live on 2026-09-29, with dart from /opt/homebrew and package:test 1.32.0 taken from the offline pub cache. `dart test --coverage=coverage` **exits 0 and writes VM JSON** (`coverage/test/probe_test.dart.vm.json`), not lcov. The DART-COVER proposal for pure Dart is therefore `dart test --coverage=coverage`, and the text notes that the output is VM JSON, which package:coverage formats to lcov. Flutter keeps `flutter test --coverage`. Test 14 re-runs the probe (`dart pub get --offline`, about 4s) and skips when dart or the cached package:test is absent. It never fails on the outcome.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 9db2c16 | test(42-08): add stack-report fixtures and failing invocation-record tests |
| 1 | GREEN | 62152fe | feat(42-08): build normalised invocation records for stack report |
| 2 | RED | c08a22a | test(42-08): add failing tests for report catalogue, findings, render and CLI |
| 2 | GREEN | cb04050 | feat(42-08): stack report catalogue, findings, render and CLI |
| 3 | RED | 55efe50 | test(42-08): add failing adopt report stack-report integration test |
| 3 | GREEN | 90b2f76 | feat(42-08): adopt report writes and links STACK-REPORT.md with gap rows |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + record model | `node --test plugins/devflow/devflow/bin/lib/stack-report.test.cjs` (7r, 5/5) | 0 | PASS |
| 2: catalogue, findings, render, CLI | `node --test plugins/devflow/devflow/bin/lib/stack-report.test.cjs` (21/21) | 0 | PASS |
| 3: adopt integration | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (823/823) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED T1 | `node --test .../stack-report.test.cjs` (5/5 fail: module missing) | 1 | FAIL (correct) |
| GREEN T1 | same (5/5) | 0 | PASS (correct) |
| RED T2 | same (14 of 21 fail) | 1 | FAIL (correct) |
| GREEN T2 | same (21/21) | 0 | PASS (correct) |
| RED T3 | `node --test --test-name-pattern "42-08/13" .../adopt-report.test.cjs` | 1 | FAIL (correct) |
| GREEN T3 | stack/adopt subset (823/823) | 0 | PASS (correct) |

In the T2 RED commit, 3b and 14 passed by design, and the commit body says so. 3b expects exit 1, and it got exit 1 only because `stack report is not available in this build`. 14 is diagnostic-only.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | n/a | n/a |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (823) | 0 | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo> stack report --raw` (and `--draft --raw`) | 0 | PASS (`git status --porcelain` identical before and after) |
| wave | `npm test` | 1 (known failure only) | PASS (by the wave rule) |

`npm test` reported tests 4916, pass 4883, fail 1, cancelled 0, skipped 32. The baseline was 4894 / 4861 / 1 / 32, so the delta is exactly +22 tests, all passing: 21 in stack-report and 1 in adopt-report. The single failure is the pre-existing `MA-7 doctl auth init ...` case in `handoff pipeline - PTY-path mock auth (TRD 19-05)`.

**Read-only checks:**
- **This repo (`stack report --raw`).** The profile is `general` (file). There are 2 gaps: JS-AUDIT and JS-LINT, which is accurate because the repo has no lint command. The info rows are CI-HYGIENE and a DRAFT-NOTE-area for the unsupported node area.
- **dfip (`--cwd /Users/justin/dev/dfip stack report --draft --raw`).** The profile is `go` (draft), with counts gap 5 / weak 2 / info 7:
  - gaps: GO-FMT, GO-GEN-DRIFT, GO-RACE, GO-VET (vet runs locally but not in CI), GO-VULN;
  - weak: GO-LINT, GO-TIDY;
  - info: CI-HYGIENE, DOCKER-LINT, DOCKER-SCAN, DOCKER-PIN, GO-COVER, GO-FIX, GO-SAST.

  `git -C dfip status --porcelain` was empty before and after. Nothing was written to any fleet repo.

## Deviations from Plan

### Auto-fixed (Rules 1-3)

**1. [Rule 1 - output quality] Finding phrasing and the notes-table header**
- **Found during:** Task 2 GREEN (test 1)
- **Issue:** The generic absent text read "no a failing Go format gate in CI". The Draft notes section printed "None." instead of the documented table header.
- **Fix:** Catalogue `name`s became bare noun phrases, so the text is "CI has no X" and "X runs in CI but is weakened: <reasons>". The notes table always renders its header.
- **Commit:** cb04050

**2. [Rule 2 - design completions the TRD left implicit]**
- `computeFindings` takes an optional `root` so the file-reading rows can work: DOCKER-PIN, CI-HYGIENE, and the config/version-dependent `applies` checks.
- Records carry `scope` (ci|local), `ciFile` and `runner` beyond the TRD's listed fields. This separates "runs in CI through a runner target" from "a developer can run it".
- The fixtures module has 16 builders, not the 12 listed. `sqlcWithDriftShape`, `polyglotShape` and `pureDartShape` were added so every catalogue ID fires in some fixture, and `missingBinaryShape` is re-exported from the drafter fixtures.
- The adopt test is named `42-08/13` because adopt-report.test.cjs already had a test 13.

### Out-of-scope files

None. Only the five files in `files_modified` changed, plus this SUMMARY and ROADMAP.md. STATE.md was not edited.

## Auth Gates

None.

## Known Limitations

- **Areas and root-level CI.** Root-level CI records count for every area, so `golangci-lint run ./svc/...` at the root also satisfies GO-LINT for `tools/`.
- **GO-FMT via golangci-lint.** It is recognised only when `.golangci.*` has a top-level `formatters:` section.
- **Sequence checks (drift and tidy).** They need the generator and `git diff --exit-code` in the same CI job, or the same runner target. A separate workflow per step is not linked.
- **Noise.** CI-HYGIENE fires on most repos. It is one info row per repo at most.

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (phrasing/header)
- **Must-haves verified:** 7/7.
  - `stack report` supports `--write`, `--raw` and `--draft`, and writes nothing else (tests 1-3).
  - The finding shape, sort order and IDs match (test 2 and the catalogue test).
  - present/local/weak detection and the make/script expansion work (tests 5-7, 7r).
  - DRAFT-NOTE rows appear (test 11).
  - Applicability holds (test 4).
  - adopt integration works (42-08/13).
  - `--draft` works (test 3).
  - The key_links are present: the dispatch goes through STACK_EXTENSIONS.report, and stack-profile.cjs is unchanged.
- **Gate failures:** none beyond the known MA-7 handoff-e2e case

## Self-Check

- FOUND: stack-report.cjs, stack-report.test.cjs, __fixtures__/stack-report-fixtures.cjs
- FOUND: commits 9db2c16, 62152fe, c08a22a, cb04050, 55efe50, 90b2f76 on feat/stack-profile-loader

## Self-Check: PASSED
