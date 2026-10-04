---
objective: 43-stack-drafter-rules
trd: "13"
job: 43-13
subsystem: stack-drafter
tags: [stack, drafter, build-breadth, narrow-build, runtime-var, ci-variant, realshape, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-12 wrapper rule and the GOVERNING tier entry; 43-10 per-tier evaluateKey and primary-component tiers; 43-09 realshape suite and workflow env substitution (assignedNames); 43-08 fleet harness and KNOWN_DRIFT ratchet; 42-13 testBreadth and the narrow-test filter"
provides:
  - "stack-classify buildBreadth(inv) -> { breadth: broad|narrow|unknown, reason?, detail?, packages?, tool? } for `go build` (a `...` operand or no operand without -o is broad; an explicit package or a lone -o output is narrow; a variable operand, another tool or no build is unknown; redirections are never operands), BUILD_BREADTH_REASONS"
  - "stack-draft narrow-build filter: a non-runner, non-declared build candidate whose build invocations are all narrow is a `narrow` note when the tier's candidates build 2+ different packages or a broad build stands beside it; when nothing is left the governing default applies (primary tier default with its cwd; inherited at a tier root; in a general root the primary's default, deferred until no later tier supplies build) with an info note tagged `narrow_fallback`"
  - "stack-ci step.runtimeVars: names a run block assigns at run time (command substitution, export / declare -x, read, for, and names derived from those); expandsAny(text, names)"
  - "stack-evidence: a CI item expanding one of its step's runtimeVars carries `runtimeVar: true`"
  - "stack-draft rankOf: a runtime-var element after confidence (plain 0, runtime 1); a runtime-var candidate the plain pick displaced is a `runtime_var` note"
  - "realshape ciVariantComponentShape asserts build `go build ./...` and test = the light lane (both cwd go), a `narrow_fallback` tag and `narrow` / `runtime_var` statuses"
affects: ["43-15"]
tech-stack:
  added: []
  patterns:
    - "Narrow on fleet regression with a structural reason, and record the data that named each narrowing"
    - "A rule only filters when a governing default exists to fall back to"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
key-decisions:
  - "The narrow-build filter was narrowed once on the fleet. As written ('never fills build') it regressed eden-platform-go.build, a go tier root whose only CI build, `go build ./cmd/aoid`, is the committed value. Rule kept: narrow variants are filtered only when the candidates build TWO OR MORE DIFFERENT packages between them, or a broad build stands beside them. Reason: one package that is the only thing CI builds is the repo's product build (a deliberate choice); one of several single-binary builds is an arbitrary pick, and the whole-module default is the build. The TRD's suggested recovery (limit narrow to sub-package operands) would not have helped: `./cmd/aoid` is a sub-package operand"
  - "The filter acts only when a governing default exists (primary tier default, the root extends default, or the primary's default in a general root). With none (a general root without a primary, a flutter/dart build whose default is discover) nothing is filtered and today's behaviour stands"
  - "Runner targets and declared rows are never filtered: `task build:backend` (bootstrapTaskShape) and NB3 `make build-all` stay"
  - "runtimeVars also covers a name assigned FROM a runtime name (`PKG=\"${line%%=*}\"` inside `while read -r line`), as the value is equally unknown before the run. A plain literal (`OUT=dist`, `IFS=`), a `${{ }}` value and an env-substituted name are not runtime"
  - "The displaced runtime-var lane gets its own note status `runtime_var` (not `alternate`) so the realshape assertion proves the heavy lane was the one displaced"
  - "aocore.test is a flag-only residual for the 43-15 decision: the plain CI lane wins verbatim (42-07 verbatim principle); no general rule derives the hand-edited flags"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true
duration: 53min
completed: 2026-10-03
---

# Objective 43 TRD 13: CI variants never displace the canonical build and test Summary

**aocore's `go/` component now drafts build `go build ./...` (cwd go) instead of the first of four single-binary CI variants, and test the plain `go test -short ./... -race -coverprofile=coverage.out -timeout 5m` (cwd go) instead of the heavy lane that expands a `$(…)`-assigned `${SKIP}`. aocore.build is closed; aocore.test is a named flag-only residual for 43-15. Across all 33 fleet repos only those two drafted values changed; fleet 36/36.**

## Progress
- [x] Task 1 RED: K31 buildBreadth (stack-classify), NB1-NB7 narrow builds (stack-draft), realshape ciVariantComponentShape build expectation (single-binary variants in three workflows and a db-tests script building two binaries), aocore.build removed from KNOWN_DRIFT — 39bf0b85
- [x] Task 1 GREEN: buildBreadth (redirections are never operands), the narrow-build filter with tier-default fallback and `narrow_fallback` note; narrowed on the fleet to "two or more different packages, or a broad build beside"; fleet 36/36, only aocore.build changed — 75fedd1d
- [x] Task 2 RED: C16 runtimeVars (stack-ci; step-contract field list re-baselined with `runtimeVars`), E25 runtimeVar (stack-evidence), RT1-RT4 runtime rank (stack-draft), ciVariantComponentShape heavy lane with `SKIP="$(…)"`, e2e/-run/fuzz lanes and a coverage-floor loop, test expectation the light lane; aocore.test removed from KNOWN_DRIFT — 42f7794f
- [x] Task 2 GREEN: runtimeVarsOf + step.runtimeVars (stack-ci), runtimeVar (stack-evidence), the rank element after confidence and the `runtime_var` note (stack-draft); aocore.test re-tagged as the flag-only residual for 43-15 with its exact draft value — 05de18a7

## Performance
- Duration: 53min (20:22Z claim to 21:15Z, last task commit)
- Tasks: 2 (4 commits, RED then GREEN each)
- Files modified: 10 source/test/fixture files plus this SUMMARY

## Rows: the rule and the variants it displaced

| Row | Before (draft) | After (draft) | Committed | Rule | Displaced |
|---|---|---|---|---|---|
| aocore.build | `go build -tags dev -o /tmp/dev-edge ./cmd/dev-edge` (cwd go) | `go build ./...` (cwd go) | `go build ./...` (cwd go) — closed | narrow-build filter: the primary's CI build candidates build five different packages (`cmd/dev-edge`, `cmd/server`, `cmd/migrate`, `cmd/tenant-provision`, `scripts/ci-db-backed-seed`); all are `narrow` notes, nothing is left, so the go tier default applies with the primary's cwd (`narrow_fallback` note) | `go build -tags dev -o /tmp/dev-edge ./cmd/dev-edge` (flutter-heavy.yml), `go build -o /tmp/aocore-server ./cmd/server` (flutter-heavy.yml and go-heavy.yml), `go build ./cmd/server` (go.yml), `./scripts/ci-db-backed-tests.sh` (go.yml; builds three binaries to /tmp) |
| aocore.test | `go test -short -p 1 ./... -race -skip "${SKIP}" -coverprofile=unit.out -timeout 35m` (cwd go) | `go test -short ./... -race -coverprofile=coverage.out -timeout 5m` (cwd go) | `go test -short -race ./... -timeout 5m` (cwd go) — residual | runtime-var rank: the go-heavy.yml step assigns `SKIP="$(./scripts/print-skip-regex.sh --class …)"` before the lane, so the lane ranks after the plain go.yml lane (same source, name, confidence) | the heavy `-p 1 … -skip "${SKIP}" …` lane, now a `runtime_var` note |

**Residual (aocore.test, closes 43-15).** Exact draft value: `go test -short ./... -race -coverprofile=coverage.out -timeout 5m` (cwd go, scoped `go test -race {packages}`). It differs from the reviewed `go test -short -race ./... -timeout 5m` only in flag order and the `-coverprofile=coverage.out` flag. Per the verbatim principle (42-07) the drafter never rewrites flags, and no general rule derives the hand-edited value, so the row is re-tagged `residual: 'flag-only: flag order and -coverprofile differ from the CI lane; no general rule derives the hand-edited value'`. The harness still checks it drifts.

## What changed

- **stack-classify.cjs**: `buildBreadth(inv)` and `BUILD_BREADTH_REASONS` (`package-path`, `single-output`). A `...` operand (`./...`, `./cmd/...`) or no operand without `-o` is broad; an explicit package operand (`./cmd/x`, `.`) or an operand-less `-o` build is narrow and lists `packages`; a template/variable operand, another tool (`flutter build web`), a non-build go command or junk is `unknown`. Flags never decide breadth; a redirection (`2>&1`, `> build.log`) is never an operand.
- **stack-draft.cjs** (still pure, still requires only `./stack-classify.cjs`):
  - `buildInvocationsOf`, `narrowBuildOf`, `broadBuild`; the build filter and `narrow_fallback` in `evaluateKey`; the deferred general-root fallback in the per-key loop.
  - `rankOf` gains the runtime-var element after confidence; `compareRank`; the `runtime_var` note for a runtime-var candidate that, ranked as plain, would have tied or beaten the pick.
  - Header documents both rules and the fleet narrowing.
- **stack-ci.cjs**: `runtimeVarsOf(text)` (with `wordAt`, `unquoteSingle`, `expandsAny`); every step carries `runtimeVars` ([] for a `uses:` step); `expandsAny` is exported.
- **stack-evidence.cjs**: `readCi` sets `runtimeVar` from `expandsAny(inv.text, step.runtimeVars)`; `push` copies `runtimeVar: true`.
- **Fixtures**: ciVariantComponentShape gains a flutter.yml e2e job building the api to /tmp (step cwd go), a db-tests job running `go/scripts/db-backed-tests.sh` (builds `cmd/migrate` and `cmd/seed`), go-nightly e2e/`-run`/fuzz lanes, a `while read -r line` coverage-floor loop, the heavy lane's `SKIP="$(../scripts/print-skips.sh …)"`, and go.yml's `-run=Fuzz` seeds lane. All content is invented; the shape keeps aocore's structure (workflow order, single-binary builds in three workflows, a script building several binaries, a command-substitution variable in the heavy lane).

## Fleet survey (read-only, before and after)

Every fleet repo was drafted at the base, after Task 1 and after Task 2, and the full `commands` maps were diffed:

- Base -> Task 1: only `aocore.build` changed. New `narrow` build notes (no command change): devflow (`go build -o /tmp/devflow ./cmd/devflow` beside the broad `go build ./...`) and eden-press (three CI scripts beside the broad `go build ./...`).
- Task 1 -> Task 2: only `aocore.test` changed. No other key of any repo moved under the new rank element.
- The narrowing: before it, `eden-platform-go.build` (tier root, one CI build `go build ./cmd/aoid` = committed) would have been inherited as `go build ./...`. With "2+ different packages or a broad build beside", it is kept (NB4 guards it).
- Runner targets untouched: ao-terminal `task build:backend` still matches (and bootstrapTaskShape still asserts it).

**eden-biz `e2e` (carried from 43-11).** Still drafts `discover`. The CI step runs `/tmp/cms-e2e -token test-token -v`, a literal path to a binary an earlier step built. It expands no runtime-assigned variable and is not a `build` candidate, so neither rule covers it. Recorded, not changed. It is a draft-only diagnostic, not a KNOWN_DRIFT conflict.

## KNOWN_DRIFT before and after

| Repo | Before (43-12) | After (43-13) |
|---|---|---|
| aocore | `build`, `test` — closes 43-13 | `test` — closes 43-15, residual flag-only (exact draft value in `reason`) |
| ao-terminal | `deps` — 43-15, residual flag-only | unchanged |
| aoinference | 8 keys — 43-14 (stale committed file) | unchanged |
| opsCluster | 7 keys — 43-14 (stale committed file) | unchanged |

`aocore.build` was removed. KNOWN_DRIFT now holds only the two stale-file repos (43-14) and two named flag-only residuals (43-15).

## Re-baselined tests

- **stack-ci.test.cjs `step records carry exactly the contracted fields`**: the contract field list gains `runtimeVars` and asserts `runtimeVars: []` for a plain step. Reason: the step record has a new field (TRD 43-13 test 4), as 43-09 added `envSubstituted`.
- **stack-drafter-realshape `ciVariantComponentShape`**: `extraAllowed` went from `['build', 'test']` to `[]`, with build and test expectations, `noteStatuses` gaining `narrow` and `runtime_var`, and `noteTags` `narrow_fallback`. Reason: this is the expectation 43-12 left for 43-13 to add.
- **stack-fleet-tables KNOWN_DRIFT.aocore**: re-scoped from `[build, test]` (43-13) to `[test]` (43-15, residual). Reason: build closed; test is the flag-only residual above.
- No other existing test changed. Golden stays 14/14 with no re-baseline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildBreadth read a redirection as a package operand**
- **Found during:** Task 1 GREEN (fleet diff: an eden-press note listed `2>&1` as a package)
- **Issue:** `go build -o /dev/null ./cmd/x 2>&1` reported packages `./cmd/x, 2>&1`. Two different "packages" could trip the 2+-packages condition.
- **Fix:** redirection words, and a detached operator's target, are skipped; K31b gained two cases.
- **Files modified:** stack-classify.cjs, stack-classify.test.cjs
- **Commit:** 75fedd1d

**2. [Fleet narrowing] The narrow-build filter applies only to several packages or beside a broad build**
- **Found during:** Task 1 GREEN design survey (all go build evidence across the fleet, read-only)
- **Issue:** As literally specified ("never fills build"), the filter would have turned eden-platform-go's matching `go build ./cmd/aoid` into the inherited `go build ./...`.
- **Fix:** see key-decisions. One narrowing was needed, not two, so the rule stays.
- **Commit:** 75fedd1d

**3. [Rule 2 - Correctness] runtimeVars includes names derived from runtime names**
- **Found during:** Task 2 survey of the aocore coverage-floor loop (`PKG="${line%%=*}"` inside `while read -r line`)
- **Fix:** a second pass marks an assignment runtime when its value expands a runtime name (C16b). It is not needed for aocore.test (the heavy lane's `SKIP` is a direct command substitution).
- **Commit:** 05de18a7

None of these widened ACCEPTED or named a repo in a rule.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test …stack-classify.test.cjs …stack-draft.test.cjs …stack-drafter-realshape.test.cjs …stack-drafter-fleet.test.cjs` | 1 (8 failing: K31a-c, NB1, NB2, NB5, ciVariantComponentShape, aocore) | FAIL (correct) |
| 1 GREEN | same | 0 (522/522) | PASS |
| 2 RED | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 1 (10 failing: contract fields, C16a-d, RT1, RT4, E25a, ciVariantComponentShape, aocore) | FAIL (correct) |
| 2 GREEN | same | 0 (1381/1381) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | Task 1 verify | 1 | FAIL (correct): realshape `conflict: build: committed go build ./... (cwd go) vs draft go build -o /tmp/harbor-api ./cmd/harbor-api (cwd go)`; fleet `aocore` new build conflict |
| Task 1 GREEN | Task 1 verify | 0 | PASS (correct) |
| Task 2 RED | Task 2 verify | 1 | FAIL (correct): realshape `conflict: test: … vs draft go test -short -p 1 ./... -race -skip "${SKIP}" …` |
| Task 2 GREEN | Task 2 verify | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | — | — | not_available (TRD: no lint command) |
| scoped | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 | PASS: 1381/1381 (1361 before + 20 new) |
| golden | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` | 0 | PASS: 14/14 |
| realshape + fleet | `node --test …stack-drafter-realshape.test.cjs …stack-drafter-fleet.test.cjs` | 0 | PASS: realshape 13 shapes + guard; fleet 36/36 |
| test | `npm test` (run after `roadmap update-job-progress`) | 0 | PASS: 8783 tests, 8750 pass, 0 fail, 33 skipped; the known environmental MA-7 failure did not occur in this run |

## Post-TRD Verification

- Auto-fix cycles used: 1 (the redirection operand)
- Must-haves verified: 4/4 (buildBreadth; the narrow-build filter with fallback, runner targets exempt; runtime-var rank; realshape build + test and the harness lost aocore.build with aocore.test re-tagged as the flag-only residual with its exact draft value)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-classify.cjs, stack-ci.cjs, stack-evidence.cjs, stack-draft.cjs, __fixtures__/stack-realshape-fixtures.cjs, __fixtures__/stack-fleet-tables.cjs, and the 43-13 SUMMARY
- FOUND commits: 39bf0b85, 75fedd1d, 42f7794f, 05de18a7 (`git log 43590fad..HEAD`)
- D20: stack-draft.cjs still requires only `./stack-classify.cjs` (the purity test passes). P11: stack-profile.cjs is not in `git diff --stat 43590fad..HEAD`
- No rule names a fleet repo (the only repo names in stack-draft.cjs are the pre-existing 43-05 PRIMARY_ORDER comment)
- Untracked docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md and objectives/*/.gitkeep were never staged
