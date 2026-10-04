---
objective: 43-stack-drafter-rules
trd: "12"
job: 43-12
subsystem: stack-drafter
tags: [stack, drafter, declared-target, wrapper, lint-action, golangci, govulncheck, realshape, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-11 mixed aggregates and bare() (redirection-stripped invocation); 43-10 per-tier evaluateKey and primary-component tiers; 43-09 realshape suite; 43-08 fleet harness and KNOWN_DRIFT ratchet; 43-06 canonicalName and invokedName; 42-07 the tier-default walk"
provides:
  - "stack-draft declaredTarget: a task-runner target named for the key whose WHOLE body is the tier default (no prerequisite) and whose name does not restate the default's command word is kept, not inherited"
  - "stack-draft wraps() + `wrapper` note: a script not named for the key whose body runs the governing default reduces to that default (primary component: the tier entry with the script's cwd; tier root: inherited)"
  - "stack-draft bare() drops a detached redirection target (`> \"$OUT\"`) as well as attached ones"
  - "stack-classify USES_CLI (closed: golangci-lint-action -> `golangci-lint run ./...`, govulncheck-action -> `govulncheck ./...`), lookupUsesCli(ref), isDedicatedLinter(tool)"
  - "stack-ci steps carry `with: { 'working-directory': <normalised> }` (and withExternal) when an action sets it; step.cwd is unchanged"
  - "stack-evidence readCi: a `uses:` step with a USES_CLI entry is a CI item (cwd from with.working-directory, else the step cwd)"
  - "stack-draft rankOf: for lint, a dedicated linter other than the governing default's tool ranks right after the name rank; each displaced default-tool candidate is an `alternate` note"
  - "realshape fixtures declaredDefaultTargetShape and ciVariantComponentShape (lint and audit asserted; 43-13 adds build and test)"
affects: ["43-13", "43-15"]
tech-stack:
  added: []
  patterns:
    - "Narrow on fleet regression with a structural reason, and record the data that named each narrowing"
    - "A 'tool class' is derived from the classification table (lint rows without build/test rows), never from a hand list in the drafter"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
key-decisions:
  - "The declared-target rule was narrowed twice on the fleet. (1) 'Body equals the default' means the WHOLE body: one invocation equal to the default and no prerequisite. A target running the default plus more keeps 42-07's first-invocation equivalence and stays inherited. (2) A target whose name restates the default's own command word (`build:` running `go build ./...`) is a shorthand and stays inherited. Together they restore all 5 regressed rows and keep aoedge.lint closed"
  - "Wrapper reduction does not verify the default (like inheritance and the single-component fallback): the tier's own command is the answer, the script is the evidence that the repo runs it"
  - "A lint tool is DEDICATED when CLASSIFY_TABLE gives it lint and no build/test row. This keeps `dart analyze` (a toolchain driver) from displacing the flutter default, and needs no hand list in stack-draft"
  - "The `go vet ./...` line a dedicated linter displaces is an `alternate` note (TRD test 3: 'the vet line is a note'), not a new status"
  - "A uses-step's cwd is `with.working-directory`, else the step cwd, as the TRD specifies. GitHub does not apply `defaults.run` to `uses:` steps; the fallback matters only for an action without the input, and none in the fleet lacks it"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true
duration: 48min
completed: 2026-10-03
---

# Objective 43 TRD 12: Authored targets, wrappers and lint actions versus the tier default Summary

**aoedge keeps `make lint` (a key-named target is the declared entry point even when it runs exactly `go vet ./...`), aocore's `../scripts/govulncheck-gate.sh` reduces to `govulncheck ./...` (cwd go), and aocore's `golangci/golangci-lint-action` step is drafted as `golangci-lint run ./...` (cwd go) ahead of the `go vet` line. Fleet 36/36, KNOWN_DRIFT down by three rows, with the declared-target rule narrowed twice on the fleet so five matching rows stay matching.**

## Progress
- [x] Task 1 RED: declared-target (DT1-DT4) and wrapper (W1-W5) draft tests, realshape declaredDefaultTargetShape and ciVariantComponentShape (lint held in extraAllowed until Task 2), aoedge.lint and aocore.audit removed from KNOWN_DRIFT — 8bbc2d09
- [x] Task 1 GREEN: declaredTarget (narrowed twice on the fleet: whole body = default with no prerequisite; name does not restate the default's command word), wraps() + `wrapper` note, bare() drops a detached redirection target; DT3 re-baselined, DT5 added — 949a3cfa
- [x] Task 2 RED: K30 (lookupUsesCli, USES_CLI, isDedicatedLinter), C15 (`step.with['working-directory']`), L1-L5 linter preference; ciVariantComponentShape asserts lint and an `alternate` note; aocore.lint removed from KNOWN_DRIFT — a990483c
- [x] Task 2 GREEN: USES_CLI + lookupUsesCli + isDedicatedLinter (stack-classify), `with['working-directory']` (stack-ci), USES_CLI uses steps as CI items (stack-evidence readCi), lint linter preference in rankOf + `alternate` note for the displaced default linter (stack-draft) — cb231fdc

## Performance
- Duration: 48min (20:00Z claim to 20:48Z)
- Tasks: 2 (4 commits, RED then GREEN each)
- Files modified: 9 source/test/fixture files plus this SUMMARY

## Closed keys: the rule and the candidates it displaced

| Row | Before (draft) | After (draft = committed) | Rule | Displaced |
|---|---|---|---|---|
| aoedge.lint | inherited `go vet ./...` | `make lint` | declaredTarget: `lint:` is named for the key, its whole body is `go vet ./...`, no prerequisite, and `lint` is not the default's command word (`vet`) | the walk used to stop at `make lint` (resolvesTo = default) and inherit; the CI `go vet ./...` line, also equal, now ranks below the kept target |
| aocore.audit | `../scripts/govulncheck-gate.sh` (cwd go) | `govulncheck ./...` (cwd go, when deps_changed) | wraps(): a `script` candidate named `govulncheck-gate` (not canonical for audit) whose body runs `govulncheck ./... > "$OUT" 2>&1`, which is the go default once redirections and their detached target are dropped | the wrapper script, now a `wrapper` note (`wraps \`govulncheck ./...\`; audit is that go default, run from go`) |
| aocore.lint | `go vet ./...` (cwd go) | `golangci-lint run ./...` (cwd go) | USES_CLI: the `golangci/golangci-lint-action@<sha>` step is a CI item with cwd from `with: working-directory: go`; linterOf ranks the dedicated linter ahead of the same-source `go vet` line (both raw CI, name rank 1) | `go vet ./...` (cwd go), now an `alternate` note (`dedicated linter pick: golangci-lint run ./...; this runs the go default linter (go)`) |

## What changed

- **stack-draft.cjs** (stays pure, still requires only `./stack-classify.cjs`):
  - `declaredTarget(item, key, defaultRun)` exempts the repo's declared entry point from the walk's "equal to the default -> inherited" stop. `restatesCommand(name, run)` implements narrowing 2.
  - `wraps(item, key, defaultRun)` and a `wrapper` branch in the walk. A primary candidate builds `{ ...formEntry, cwd }` (apply kept when its cwd matches). A root candidate sets `inheritedAt` like an equal candidate. `supplies`/`via` count the wrapper.
  - `bare()` also drops the target of a detached redirection operator (`>`, `>>`, `<`, `&>` followed by a word). It is used on both sides of `writesAs` (43-11) and `wraps`, so it stays symmetric.
  - `rankOf(item, key, defaultTool)` gains `linterOf` right after the name rank (lint only), and `rank()` takes the governing default's tool. `evaluateKey` passes the formEntry run's tool. The shadowed-note and component-note rankings pass their own tier's tool. A dedicated-linter win adds `alternate` notes for the displaced default-tool candidates.
  - The header now carries the declared-target exception (with both narrowings), the wrapper paragraph and the dedicated-linter paragraph.
- **stack-classify.cjs**:
  - `USES_CLI` is a closed, frozen table, and each prefix is also a USES_MAP entry of the same key.
  - `lookupUsesCli(ref)` shares `matchUses` with `lookupUses`.
  - `DEDICATED_LINTERS` / `isDedicatedLinter(tool)` are derived from CLASSIFY_TABLE.
  - The USES_MAP comment now says that only USES_CLI actions become candidates.
- **stack-ci.cjs**:
  - `applyWithKey` reads `working-directory` as a plain scalar (block or flow spelling).
  - Each step carries `with: { 'working-directory': <normalised, null = root> }` (plus `withExternal` when the dir is in another checkout). `cwd` is untouched (C6 still holds).
- **stack-evidence.cjs**: `readCi` pushes a USES_CLI step as a CI item: the command, form and tool come from the table; cwd is `with.working-directory`, else the step cwd; confidence is high; `continue-on-error` is weak. It then goes through cwd hygiene and placement like any CI line, and `invokedName` stays absent (a raw command).

## Fleet narrowings (declared-target rule)

The literal rule ("a key-named runner target equal to the default is kept") closed aoedge.lint and regressed 5 matching rows. Evidence was read read-only with `df-tools --cwd ~/dev/<repo> stack init`:

| Row | Target | Prerequisites | Body | Reviewed | Excluded by |
|---|---|---|---|---|---|
| aoedge.lint | `lint` | none | exactly `go vet ./...` | `make lint` | (kept) |
| dfip.lint | `lint` | none | `go vet ./...`, `golangci-lint run \|\| echo …` | inherited | 1 (body runs more) |
| justinforme.lint | `lint` | none | `go vet ./...`, `buf lint` | inherited | 1 |
| smartWellness.lint | `lint` | none | `go vet ./...`, `buf lint` | inherited | 1 |
| aoid.build | `build` | `portal-build` | `go build ./...` | inherited | 1 (prerequisite) and 2 |
| eden-press.build | `build` | none | exactly `go build ./...` | inherited | 2 (`build` restates `go build`) |

Narrowing 1 is the TRD's own wording read literally ("its body equals the tier default"). Narrowing 2 is the structural difference between eden-press's `build:` over `go build` (a shorthand for the command) and aoedge's `lint:` over `go vet` (an interface the repo owns, which its comment says will take a stronger linter). Two narrowings, both on the first fleet run after GREEN; the rule was not dropped.

## KNOWN_DRIFT

Before (14d51469):
- aocore: `['lint', 'audit']` closes 43-12; `['build', 'test']` closes 43-13
- ao-terminal: `['deps']` closes 43-15 (flag-only residual)
- aoedge: `['lint']` closes 43-12
- aoinference: 8 keys closes 43-14
- opsCluster: 7 keys closes 43-14

After (cb231fdc):
- aocore: `['build', 'test']` closes 43-13
- ao-terminal: `['deps']` closes 43-15 (flag-only residual)
- aoinference: 8 keys closes 43-14
- opsCluster: 7 keys closes 43-14

Removed: aoedge.lint, aocore.audit (Task 1), aocore.lint (Task 2). Nothing re-scoped and no residual added. ACCEPTED is unchanged.

## Residuals and side effects

- **aodex lint** (more_specific, not a conflict) moved from `go vet ./... (cwd go)` to `golangci-lint run ./... (cwd go)`. Its golangci action also sets `working-directory: go`. The committed value is `discover`, so this is information for the 43-15 review, as the TRD expected.
- **aodex audit** is unchanged: `bash scripts/check-govulncheck.sh --self-test (cwd go)` is not reduced, because its body runs `govulncheck -format json ./... >"$TMP_JSON"`, which is not the default. This stays more_specific.
- **Observation for 43-15.** dfip, justinforme and smartWellness inherit `go vet ./...` while their `make lint` also runs `buf lint` / `golangci-lint`. The draft (42-07, unchanged here) and the reviewed files agree, but that lint drops a gate the repo runs. Whether to keep `make lint` there is a user decision, not a drafter rule.
- `ciVariantComponentShape` still drafts build `go build -tags dev -o /tmp/harbor-dev ./cmd/harbor-api` and test `go test -short -p 1 ./... -race -coverprofile=unit.out -timeout 35m` (cwd go). These reproduce the aocore build/test rows exactly; they are in `extraAllowed` for 43-13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The declared-target rule regressed 5 matching fleet rows; it was narrowed twice**
- **Found during:** Task 1 GREEN (fleet harness)
- **Issue:** The literal rule turned aoid.build, dfip.lint, eden-press.build, justinforme.lint and smartWellness.lint from inherited (= reviewed) into `make …` / `just build`.
- **Fix:** `declaredTarget` requires a whole-body match with no prerequisite and a name that does not restate the default's command word (see Fleet narrowings). The TRD's error_recovery suggestion ("only when no CI step runs the default text") would also have excluded aoedge, whose CI runs `go vet ./...`, so it was not used.
- **Files modified:** stack-draft.cjs, stack-draft.test.cjs (DT3 re-baselined, DT5 added)
- **Commit:** 949a3cfa

**2. [Rule 3 - Blocking] Redirection target written apart from its operator**
- **Found during:** Task 1 GREEN (the GOTCHA in the TRD)
- **Issue:** stack-shell does not strip redirections, and 43-11's `bare()` dropped `2>&1` but kept the target of `> "$OUT"`, so `govulncheck ./... > "$OUT" 2>&1` never matched the default.
- **Fix:** `bare()` skips the word after an operator-only redirection token. It is used symmetrically, and P3 (43-11) still passes.
- **Commit:** 949a3cfa

**3. [Interpretation] Keeping each GREEN commit green while the lint half of realshape item 3 waits for Task 2**
- The TRD has Task 1 end with the lint half of `ciVariantComponentShape` still RED. Instead, Task 1 held `lint` in that shape's `extraAllowed` (commented as Task 2's) and split the aocore KNOWN_DRIFT entry to `['lint']`. Task 2 RED removed both, so the lint assertion went RED there. The tests and end state are the same, and no commit claims GREEN with a failing test.

**4. [Interpretation] "A lint tool" and "the vet line is a note"**
- "Lint tool" is a dedicated linter derived from CLASSIFY_TABLE, so a toolchain driver (`dart analyze` against the flutter default) never wins (L4).
- The vet line becomes an `alternate` note only when the dedicated-linter rank decided the pick.

## Re-baselined tests

- **DT3** (stack-draft.test.cjs) is this TRD's own test, written in Task 1 RED as "`make test` (body = `go test -race ./...`) fills test with no scoped form". Narrowing 2 inverts it: a target whose name restates the default's command word stays inherited. The test now asserts that `test:` -> `go test -race ./...` and `build:` -> `go build ./...` are both inherited. The re-baseline is commented in the test.
- No test from 43-01..43-11 or 42-xx changed. D15/D15b (42-07 inheritance), P3 (43-11, `bare`) and all golden fixtures pass unchanged.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Declared targets and wrapper reduction | `node --test …/stack-draft.test.cjs …/stack-drafter-realshape.test.cjs …/stack-drafter-fleet.test.cjs …/stack-drafter-golden.test.cjs` | 0 | PASS (209 tests incl. fleet 36/36, golden 14/14, realshape 13/13) |
| 2: Lint actions with a CLI equivalent and linter preference | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 | PASS (1361/1361) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test --test-name-pattern="declaredDefaultTargetShape\|ciVariantComponentShape" …/stack-drafter-realshape.test.cjs` | 1 | FAIL (correct): lint `make lint` vs `go vet ./...`; audit `govulncheck ./...` vs `../scripts/vuln-gate.sh`; no `wrapper` note |
| T1 RED | `node --test --test-name-pattern="DT[1-4]\|W[1-5]" …/stack-draft.test.cjs` | 1 | FAIL (correct): DT1, DT3, DT4, W1, W2 red; DT2, W3-W5 guards green |
| T1 RED | `node --test --test-name-pattern="aocore\|aoedge" …/stack-drafter-fleet.test.cjs` | 1 | FAIL (correct): 2 new conflicts |
| T1 GREEN | the four suites above + scoped `stack-*`/`adopt-*` | 0 | PASS (1348/1348 scoped) |
| T2 RED | `node --test --test-name-pattern="K30\|C15\|L[1-5]:\|ciVariantComponentShape\|aocore" …` | 1 | FAIL (correct): 11 red (K30a-d, C15a/b/d, L1, L5, aocore, ciVariantComponentShape); C15c, L2-L4 guards green |
| T2 GREEN | scoped `stack-*`/`adopt-*` | 0 | PASS (1361/1361) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | (none) | — | not_available |
| scoped | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 | PASS: 1361 tests (1336 before this TRD + 25 new) |
| test | `npm test` | 1 | PASS but for the known MA-7: 8763 tests, 8730 pass, 1 fail (MA-7 doctl auth init, environmental), 32 skipped; run after `roadmap update-job-progress` |

## Discovered commands

None.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the fleet narrowing of the declared-target rule, two narrowings in one cycle)
- Must-haves verified: 5/5
  - declared target kept: DT1, aoedge.lint, declaredDefaultTargetShape
  - wrapper reduced (primary with cwd, tier root inherited, key-named script not reduced): W1-W5, aocore.audit
  - USES_CLI candidate with with-cwd: K30, C15, aocore.lint
  - linter preference within source; runner target still wins: L1-L5
  - realshape shapes plus the harness losing the 3 rows with every matching repo still matching: fleet 36/36
- Gate failures: None (MA-7 is the known environmental failure)
- stack-draft.cjs requires only `./stack-classify.cjs` (D20); stack-profile.cjs is untouched (P11); no rule names a repository
- Realshape: 13 shapes green; golden 14/14; fleet 36/36

## Next

43-13 closes aocore build/test: `ciVariantComponentShape` already reproduces both variant rows (a nightly dev-tagged build, a 35m `-p 1` coverage test), and 43-13 moves them from `extraAllowed` into the expectation.

## Self-Check: PASSED

- FOUND: stack-draft.cjs, stack-classify.cjs, stack-ci.cjs, stack-evidence.cjs, stack-realshape-fixtures.cjs, stack-fleet-tables.cjs, 43-12-SUMMARY.md
- FOUND commits: 8bbc2d09, 949a3cfa, a990483c, cb231fdc
- FOUND exports: USES_CLI, lookupUsesCli, isDedicatedLinter
- KNOWN_DRIFT has no aoedge entry and no aocore lint/audit entry
