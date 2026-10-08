---
objective: 71-stack-drafter-and-verify-policy
job: "01"
subsystem: stack-drafter
tags: [stack-init, drafter, self-test, buf-lint, declared-target, realshape]
requires:
  - objective: 43-stack-drafter
    provides: assembleDraft ranking, declaredTarget narrowing 1 (43-12), realshape suite and fleet harness
provides:
  - "a self-test step never fills a key while a sibling step runs the same entry point as the gate (self_test note)"
  - "a lint target that runs the tier default plus unconditional linters of other tools is the lint entry point (declared_linters info note)"
  - "stack-classify linterToolOf and AUX_LINTERS (buf lint) without classifying buf lint"
affects: [71-02 fleet tables and guards, 71-05 dogfood and docs]
tech-stack:
  added: []
  patterns:
    - "pool filter after the mixed-aggregate filter and before rank() in evaluateKey"
    - "auxiliary linter table read only by a lint-target widening, never by classifyInvocation"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
key-decisions:
  - "buf lint stays out of CLASSIFY_TABLE: AUX_LINTERS is read only by linterToolOf, so stack-evidence unitKeys and the mixed-aggregate codegen pick are unchanged"
  - "A self-test is judged by a sibling that runs the same named entry point at the same cwd without the argument; with no gate sibling it still fills its key"
  - "Unconditional means no || in the extra invocation's text; an optional linter (|| echo ...) keeps lint inherited"
requirements-completed: [SDR-09]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 10min
completed: 2026-10-08
tokens_input: 12247308
tokens_output: 63301
tokens_cache_read: 12054308
tokens_cache_write: 192842
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 71 TRD 01: Drafter self-test and declared linters Summary

The stack drafter now picks a gate script over its own `--self-test` step, and keeps a `lint:` target that runs the tier default plus unconditional linters (`buf lint`, `golangci-lint run ./...`) as the lint entry point.

## Progress
- [x] Task 1: Realshape fixture builders for the self-test gate, the proto lint target and the guarded linter — d46f502c
- [x] Task 2: A self-test step never fills a key while its gate sibling exists — 95a1d153 (RED), 4f15b920 (GREEN)
- [x] Task 3: A lint target that runs the default plus unconditional linters is the lint entry point — 715a696c (RED), dc8f7b34 (GREEN)

## What changed

**Self-test rule (`stack-draft.cjs`).** `selfTestIndexes` / `selfTestArgs` read the self-test words of a candidate's command (`--self-test`, `--selftest`, `--self-test=<x>`, `--selftest-<case>`, a bare `selftest`), never the program, a shell's script (`bash scripts/x.sh`) or a word equal to the runner target / script name (`make selftest`). `sameEntryPoint` compares the named entry point (`nameOf`) at the same cwd, else the command once the self-test words are removed. In `evaluateKey`, after the mixed-aggregate filter and before `rank()`, a candidate with self-test words and a gate sibling (same entry point, no self-test words) becomes a `self_test` note; a declared row is never filtered; with no sibling nothing changes. It holds for every key, at a tier root and in a general root's primary component (cwd kept).

**Declared linters (`stack-classify.cjs`, `stack-draft.cjs`).** `AUX_LINTERS` (frozen, one entry: `buf lint`) and `linterToolOf(inv)` (a CLASSIFY_TABLE `lint` / `lint_*` row, else AUX_LINTERS) are exported. `buf lint` is NOT in CLASSIFY_TABLE: `classifyInvocation('buf lint')` is still null and `stack-evidence.test.cjs` passes unedited. `declaredLinters(item, key, defaultRun)` is the new widening: lint only, task-runner target named for the key, no prerequisite, the default in the body, and every other invocation an unconditional (`||`-free) linter of a tool other than the default's. `declaredTarget` keeps its whole-body branch first and falls through to `declaredLinters`. After the walk, a chosen target with extras gets a `declared_linters` info note.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders | `node --test .../stack-drafter-realshape.test.cjs` (14 tests; builders not registered yet) | 0 | PASS |
| 2: self-test rule | `node --test stack-draft, stack-drafter-realshape, stack-drafter-golden, stack-drafter-e2e` (218 tests) | 0 | PASS |
| 3: declared linters | `node --test stack-classify, stack-draft, stack-evidence, stack-drafter-realshape, stack-drafter-golden, stack-drafter-e2e` (624 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test --test-name-pattern="ST[1-7]:" stack-draft.test.cjs` plus the `selfTestGateShape` realshape entry: ST1, ST2, ST5, ST7 and the realshape entry failed on the self-test pick (`audit` drafted as `bash scripts/vuln-gate.sh --self-test`); ST3, ST4, ST6 passed | 1 | FAIL (correct) |
| GREEN (Task 2) | same files, 218 tests | 0 | PASS (correct) |
| RED (Task 3) | stack-classify, stack-draft, realshape: K32a/b/d, DT5, DL1, DL2, DL7, `mixedAggregateCodegenShape`, `protoLintTargetShape` failed (10 failures); K32c, DL3-DL6 and `guardedLinterTargetShape` passed | 1 | FAIL (correct) |
| GREEN (Task 3) | six suites, 624 tests | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` | 0 | PASS |
| test (full, worktree) | `DEVFLOW_SKIP_FLEET_HARNESS=1 node --test <all, micro.test.cjs excluded>`: 11377 tests, 11319 pass, 8 fail, 50 skipped | 1 | see below |

The 8 full-suite failures are all `devflow-watch.test.cjs` (2) and `handoff-e2e.test.cjs` (6): the daemon never starts in this worktree because the worktree has no `node_modules`. The same two files pass in the main checkout (22 pass, 0 fail and 10 pass, 0 fail). They touch none of this TRD's files. The 70-03 baseline failure (`roadmap-reconcile.test.cjs` E2E1) did not occur. `micro.test.cjs` was excluded as the TRD advises.

## Fleet read-only check

For TRD 71-02. Nothing was written to any fleet repository: `stack init` without `--write` only prints a preview, and `stack-drafter-fleet.test.cjs` only reads. The fleet work trees carry large unrelated uncommitted changes of their own (aodex, justinforme, smartWellness); none of them shows a STACK.md or STACK-REPORT.md change from these runs. dfip is clean.

- `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (worktree copy): 42 tests, 39 pass, 2 fail, 1 skipped. The only new problems are exactly the two expected rows:
  - `justinforme`: `new conflict: lint: committed \`go vet ./...\` vs draft \`make lint\``
  - `smartWellness`: `new conflict: lint: committed \`go vet ./...\` vs draft \`make lint\``
- `node plugins/devflow/devflow/bin/df-tools.cjs --cwd ~/dev/aodex stack init`: `audit: { run: "bash scripts/check-govulncheck.sh", cwd: "go" }` (the gate step, not `--self-test`).
- `node plugins/devflow/devflow/bin/df-tools.cjs --cwd ~/dev/dfip stack init`: `lint` is in `inheritedKeys`, not drafted (the `golangci-lint run || echo ...` line is optional); only `build: make build` and `test: make test` are drafted.

Both lint rows are the draft being the better entry point: the Makefile `lint:` target runs `go vet ./...` and `buf lint`, while the committed files inherit `go vet ./...` only. They are refresh-pending for 71-02 (record, do not narrow).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture `test:` body did not restate the tier default**
- **Found during:** Task 3 RED
- **Issue:** the TRD specified `test:` -> `go test ./...` in `protoLintTargetShape` and `guardedLinterTargetShape` and expected the draft to be `lint` only. The go tier's test default is `go test -race ./...`, so `go test ./...` differs from it and the drafter correctly drafts `test: make test` (as `declaredDefaultTargetShape` already expects). The TRD's premise ("test/build restate their command word and stay inherited") only holds when the body equals the default.
- **Fix:** both Task 1 builders now use `go test -race ./...` in `test:`. The TRD's observable expectations are unchanged (`protoLintTargetShape` drafts `lint: make lint` only; `guardedLinterTargetShape` drafts nothing and has `lint` absent).
- **Files modified:** `__fixtures__/stack-realshape-fixtures.cjs`
- **Commit:** 715a696c

### Notes (no behaviour change)

- The TRD named the classifier test K31, but K31 already exists (buildBreadth, 43-13). The new cases are K32a-K32d.
- DL7 failed in RED rather than passing already: with no rule `make lint` is inherited on its first candidate and never verified, so no `binary_missing` note exists yet. It pins the intended behaviour after GREEN.
- `summary checkpoint|post` accept `<objective>-<NN>` only, so the SUMMARY is `71-01-SUMMARY.md` (the TRD's output path), not the long TRD name.

## Known blind spots and scope notes

- A make `-` prefix on an extra line (`-golangci-lint run`) is stripped by stack-runners (`[@-]+`), so an ignored-failure linter looks unconditional.
- A `command -v X && X` guard with no `||` has its probe dropped by the body reader, so the guarded linter looks unconditional.
- Not covered by design: a CI-only `buf lint` step with no lint target. The drafter is verbatim (42-07) and there is no single entry point to name; composing `go vet ./... && buf lint` is out of scope.
- `AUX_LINTERS` is a closed list with one entry. A linter not in the table or in AUX_LINTERS is "not a linter", so a target that adds one stays inherited.

## Decisions Made

- `buf lint` is recognised by `linterToolOf` only; adding it to CLASSIFY_TABLE would make it a lint candidate on its own and a mixed-aggregate member in stack-evidence (pinned by stack-evidence.test.cjs).
- The self-test filter reads sibling candidates in the same tier pool, so a primary-component pair and a tier-root pair behave alike and cwd keeps them apart.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the fixture `test:` body, Rule 1)
- Must-haves verified: 7/7 (self-test at tier root and primary component; lone self-test and declared row unchanged; `selfTestGateShape` drafts the gate with a `self_test` note; lint target with unconditional extras fills `make lint` with `declared_linters`; `buf lint` still unclassified and stack-evidence unedited; realshape suite passes with the three shapes; fleet shows only the two expected lint rows)
- Gate failures: None in scope (8 environmental failures in devflow-watch / handoff-e2e, worktree has no node_modules)

## Self-Check: PASSED

- FOUND: stack-draft.cjs, stack-classify.cjs, stack-draft.test.cjs, stack-classify.test.cjs, __fixtures__/stack-realshape-fixtures.cjs
- FOUND commits: d46f502c, 95a1d153, 4f15b920, 715a696c, dc8f7b34 (`git log 9d4fa4b5..HEAD`)
- `rg "'buf', 'lint'"` hits AUX_LINTERS only; `rg "self_test|declared_linters"` hits both rules and the header; stack-evidence.test.cjs is unmodified
