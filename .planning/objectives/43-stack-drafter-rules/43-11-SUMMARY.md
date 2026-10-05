---
objective: 43-stack-drafter-rules
trd: "11"
job: 43-11
subsystem: stack-drafter
tags: [stack, drafter, mixed-aggregate, codegen, drift-check, e2e-env, realshape, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-10 tiered placement and unitAreas; 43-09 realshape suite and drift-check shapes; 43-08 fleet harness and KNOWN_DRIFT ratchet; 43-06 R5 (codegen drift check is run, generator is apply); 43-04 scenario-named e2e_env"
provides:
  - "stack-evidence items carry unitKeys (the distinct keys ALL their units classify to) and runner items carry target.legs (prerequisites, then directly called targets of the same file)"
  - "stack-evidence drift-check items carry driftWriter: { target } (the prerequisite they regenerate through) or { invocation } (the earlier statement of their own recipe)"
  - "stack-classify.envRole(name): 'teardown' (down, stop, teardown, destroy) | 'reset' (reset) | null, whole tokens"
  - "stack-draft mixed_aggregate: for a single-purpose key, a candidate running K plus other keys never fills K while a pure candidate exists"
  - "stack-draft partial_check: a codegen drift check whose writer is a strict leg of the best generator neither fills run nor turns the generator into apply; R5 holds for a check of the generator itself"
  - "stack-draft env_teardown / env_reset: a teardown or reset name fills neither e2e_env nor e2e"
  - "realshape fixtures mixedAggregateCodegenShape, bootstrapTaskShape, partialDriftCheckShape, scenarioStackShape; optional noteStatuses in the realshape suite"
affects: ["43-12", "43-13", "43-15"]
tech-stack:
  added: []
  patterns:
    - "A rule over a key set is judged per tier list inside evaluateKey, before ranking, and leaves a note for every candidate it removes"
    - "Narrow on fleet regression: the literal rule ran against the fleet first, the regressions named the narrowing"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
key-decisions:
  - "The mixed-aggregate rule judges single-purpose keys only. build/test/lint (the canonical entry points, 42-13) and e2e/e2e_env (orchestrations, 43-04 D4) are WHOLE_ENTRY_KEYS and never judged mixed. The literal rule regressed 7 fleet rows; this one narrowing closed all of them"
  - "unitKeys stays literal (all units, prerequisites included) as the TRD specifies; the narrowing is by key, not by unit origin"
  - "An item with no unitKeys counts as pure, so a raw CI line and a name-only target are never demoted"
  - "partial_check needs a known writer: a check with no driftWriter, or whose writer is G itself (G's target, or G's body invocation with redirections stripped), keeps R5"
  - "envRole is a separate export; classifyHint and ENV_TOKENS are unchanged, so `e2e-stack-down` still classifies e2e_env and the drafter reads the role. A declared row is exempt"
  - "ao-terminal.deps is a flag-only residual: the drafter keeps `npm ci --no-audit --no-fund` verbatim; closes 43-15 (the fleet guard allows only 43-NN or out-of-scope, so the decision lives in `residual`)"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true
duration: 22min
completed: 2026-10-03
tokens_input: 32834712
tokens_output: 135091
tokens_cache_read: 32478391
tokens_cache_write: 356049
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 11: Aggregates, codegen target choice and environment targets Summary

**Codegen now goes to the target a reviewer would run: a mixed aggregate loses to its pure leg (`make proto` over `make generate` in justinforme and smartWellness), a drift check of one leg no longer turns eden-biz's `make generate` into an apply, and env teardown/reset targets never fill e2e_env or e2e. The one-shot `task init` no longer passes for deps; ao-terminal's remaining gap is the flag-only `npm ci --no-audit --no-fund` residual.**

## Progress
- [x] Task 1 RED: unitKeys/legs (E23), mixed-aggregate draft tests (M1-M4), realshape mixedAggregateCodegenShape and bootstrapTaskShape, justinforme/smartWellness codegen and ao-terminal deps removed from KNOWN_DRIFT — a7b300c2
- [x] Task 1 GREEN: unitKeys + target.legs in stack-evidence; mixed_aggregate filter in stack-draft, narrowed to single-purpose keys after fleet regression; E13 re-baselined (legs); ao-terminal.deps re-tagged flag-only residual — 73af3619
- [x] Task 2 RED: envRole (K29), driftWriter (E24), partial_check (P1-P5) and env teardown/reset (T1-T5) tests, realshape partialDriftCheckShape and scenarioStackShape, eden-biz.codegen removed from KNOWN_DRIFT — 1d707d02
- [x] Task 2 GREEN: envRole in stack-classify, driftWriter in stack-evidence, env_teardown/env_reset and partial_check in stack-draft — 4089dd92

## Performance

- Duration: about 22 minutes (2026-10-03, 19:38Z to about 20:00Z)
- Tasks: 2 (4 commits, RED then GREEN each)
- Files modified: 9

## What changed

**stack-evidence.cjs**
- `unitKeys` on every item: the distinct keys of all its units (recipe lines, prerequisites transitively, called targets, internal tasks), in first-seen order. Unclassified units add nothing.
- `target.legs` on runner items: the prerequisites that are targets of the same file, then the targets the recipe calls directly (`make x`, a Taskfile `task: x`).
- `driftWriter` on drift-check items, from driftCheckOf: `{ target }` or `{ invocation }`. It reaches CI and docs steps that go through the target too.

**stack-classify.cjs**
- `envRole(name)`. ENV_TOKENS, SCENARIO_TOKENS and classifyHint are unchanged.

**stack-draft.cjs**, all inside `evaluateKey`:
- **env roles.** For e2e_env and e2e, a candidate whose target or invoked name has an envRole becomes an `env_teardown` or `env_reset` note. This runs before the `env_unnamed` rule.
- **mixed aggregates.** For a key that is not in WHOLE_ENTRY_KEYS, a mixed candidate becomes a `mixed_aggregate` note when a pure one exists.
- **R5 refinement.** G is the best-ranked generator:
  - A check whose writer is G itself keeps R5.
  - A check whose writer is a strict leg of G becomes a `partial_check` note. A leg is matched by its target name, or by an invocation found in a leg item's body.
  - Any other check keeps R5.
- stack-draft still requires only stack-classify (D20), stack-profile.cjs is untouched (P11), and no rule names a repo.

## unitKeys of the surveyed aggregates (read-only `stack init`, 2026-10-03)

| Repo | Item | unitKeys | legs | Outcome |
|---|---|---|---|---|
| justinforme | `make generate` | codegen, deps, lint | proto, sqlc, gen-dart | mixed_aggregate note |
| justinforme | `make proto` | codegen | — | **codegen** |
| justinforme | `make sqlc` | codegen | — | pure, ranked after proto |
| justinforme | `make gen-dart` | codegen, deps, lint | proto | **deps** (no pure deps rival) |
| justinforme | `make trd19-acceptance` | deps, lint, test | — | deps candidate, ranked after gen-dart |
| smartWellness | `make generate` / `make proto` / `make sqlc` / `make gen-dart` | same as justinforme | same | codegen `make proto`, deps `make gen-dart` |
| ao-terminal | `task init` | deps, tidy | — | mixed_aggregate note |
| ao-terminal | `npm ci --no-audit --no-fund` (CI) | deps | — | **deps** (flag-only residual) |
| ao-terminal | `go mod download` (CI) | deps | — | pure, ranked after npm ci |
| ao-terminal | `task build:backend` | tidy, build | build:server, build:wsh | **build** (build is exempt) |
| ao-terminal | `task check:ts` | deps, typecheck | npm:install | **typecheck** (no pure rival) |
| eden-biz go/ | `make generate` | codegen | templ, tailwind, buf-generate | **codegen**, cwd go, no apply |
| eden-biz go/ | `make templ-check` | codegen | templ | driftWriter `{ target: templ }`, partial_check note |
| eden-biz go/ | `make build` | codegen, build | generate | **build** (build is exempt) |
| eden-biz root | `make e2e-stack-up` | e2e_env, build | — | **e2e_env** |
| eden-biz root | `make e2e-stack-down` | — | — | env_teardown note |
| eden-biz root | `make e2e-db-reset` | — | — | env_reset note |

`@$(MAKE) gen-dart` in trd19-acceptance is not a leg. normalizeScript drops a command that starts with an expansion, so `$(MAKE) x` adds neither a leg nor units. That was the case before this TRD and it was not changed here.

## KNOWN_DRIFT

| Repo | Before (keys, closes) | After |
|---|---|---|
| aocore | lint, audit (43-12); build, test (43-13) | unchanged |
| eden-biz | codegen (43-11) | **removed**: draft `make generate (cwd go)` equals the committed file |
| justinforme | codegen (43-11) | **removed**: draft `make proto` |
| smartWellness | codegen (43-11) | **removed**: draft `make proto` |
| ao-terminal | deps (43-11): draft `task init` | **re-tagged**: closes `43-15`, residual `flag-only: CI adds --no-audit --no-fund; the reviewed value dropped them by hand`, draft `npm ci --no-audit --no-fund` vs committed `npm ci` |
| aoedge | lint (43-12) | unchanged |
| aoinference | 8 keys (43-14) | unchanged |
| opsCluster | 7 keys (43-14) | unchanged |

eden-biz.e2e_env was already closed by 43-10. It stays closed: the draft keeps `make e2e-stack-up`, `make e2e-stack-down` is now an env_teardown note, and the realshape `scenarioStackShape` guards the shape.

## Residuals and side effects

- **ao-terminal.deps (residual).** The exact draft value is `npm ci --no-audit --no-fund`, from `.github/workflows/ao-build.yml`, step "npm ci (locked)". Under the verbatim principle the drafter never strips a flag. This row is left for the 43-15 decision.
- **eden-biz e2e (draft-only, not a conflict).** It no longer drafts `make e2e-db-reset`, which is now an env_reset note. With tier 1 empty, the e2e key falls through to the primary's other candidate: the CI step `/tmp/cms-e2e -token test-token -v` in `go/`. That binary is built into /tmp, so the step is `script_missing`, and e2e drafts `discover`. The committed file has no e2e, so the harness reports this as a `more_specific` diagnostic and does not fail. A CI step that runs a binary built at runtime belongs to 43-13 (runtime-variable commands rank last).
- No other fleet row moved. The set of `more_specific` diagnostics is identical to the base run, apart from that eden-biz e2e value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression] The mixed-aggregate rule is narrowed to single-purpose keys**
- **Found during:** Task 1 GREEN, the first fleet run of the literal rule.
- **Issue:** The literal rule regressed 7 fleet rows that matched before, plus the realshape workspaceRunnerShape. Each of these build/test/lint entry points runs other keys through its prerequisites or legs, and a pure leg won instead:
  - eden-biz build: `make build` became `make docker-build`
  - ao-terminal build: `task build:backend` became `task build:schema`
  - eden-libs build: became `just build-wasm`
  - aoid test: `just test` became a CI `go test` line
  - devflowops test: became `make test-backend`
  - devflowops lint: `make lint` became `make lint-go`
  - eden-biz e2e_env: became `make e2e-stack-down` (`e2e-stack-up` is [e2e_env, build])
- **Fix:** `WHOLE_ENTRY_KEYS` = build, test, lint, e2e, e2e_env are never judged mixed. This is narrowing #1 of the two the binding rules allow, and it closed all 8 regressions. Excluding prerequisite units alone would not have been enough: devflowops `lint-go-vet` runs `go build` in its own recipe.
- **Guard test:** M5.
- **Commit:** 73af3619

**2. [Rule 1 - Test bug] RED tests that failed for the wrong reason**
- **Found during:** Task 1 GREEN.
- **Issue and fix, M1 and M4:** under `extends go`, the D3 off_stack gate makes every name-only codegen candidate an off_stack note, so `codegen` was undefined. Both tests now use `extends general` (NO_AREAS).
- **Issue and fix, E23d:** a Taskfile task named `init` whose body is only `task:` calls is not evidence, because the body classifies to nothing and the name carries no key. The task was renamed `bootstrap`. The real ao-terminal `init` runs direct commands, so that shape is unaffected.
- **Commit:** 73af3619

**3. [Rule 3 - Blocking] Task 2 also edits stack-evidence.cjs**
- **Issue:** The Task 2 `<files>` list omits stack-evidence.cjs, but the action ("stack-evidence can expose `item.driftWriter`") and the frontmatter `files_modified` both include it.
- **Fix:** `driftWriter` is set in driftCheckOf and passed through `push`.
- **Commit:** 4089dd92

**4. [Survey over TRD text] ao-terminal `init` shape**
- **TRD text:** `init` calls internal tasks.
- **Survey:** the real Taskfile's `init` runs `npm install`, `go mod tidy` and `cd docs && npm install` directly. The internal `npm:install` and `go:mod:tidy` tasks are prerequisites of the build and typecheck tasks.
- **Fix:** bootstrapTaskShape follows the survey. E23d covers the internal-task case at unit level.

**5. [Harness] realshape `noteStatuses`**
- **Issue:** The new notes are statuses, not tags.
- **Fix:** The suite gained an optional `noteStatuses { present, absent }`, alongside `noteTags`, and the table guard checks its shape.

**6. [Fleet guard] `closes` value for the residual**
- **Issue:** The dispatch suggested `closes: '43-15 decision'`, but the guard only accepts `43-NN` or `out-of-scope`.
- **Fix:** The entry uses `closes: '43-15'`, and the decision is described in `residual`.

## Re-baselined tests

- **stack-evidence E13** (`runner items carry target {...}`): the expected `target` now includes `legs: ['gen', 'tidy', 'build:relay:internal']`. legs is new target metadata. `build:daemon` is not a target in that fixture, so it is not a leg.
- No 43-01..43-10 test changed its expected draft. 43-04's `e2e:seed` stays a bring-up, which K29c and T4 pin. D36 (a codegen check with no driftWriter) still gets R5.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test stack-evidence/stack-draft/stack-drafter-realshape/stack-drafter-fleet` | 1 (E23 x6, M1/M3/M4, 2 realshape, 3 fleet rows) | FAIL (correct) |
| 1 GREEN | same + `stack-drafter-golden.test.cjs` | 0 (242/242) | PASS |
| 2 RED | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 1 (14 failing: K29a-c, P1, P4, T1-T3, E24a-c, 2 realshape, eden-biz) | FAIL (correct) |
| 2 GREEN | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 0 (1336/1336) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, a7b300c2) | `node --test` (4 Task 1 files) | 1 | FAIL (correct) |
| GREEN (Task 1, 73af3619) | `node --test` (4 Task 1 files + golden) | 0 | PASS (correct) |
| RED (Task 2, 1d707d02) | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 1 | FAIL (correct) |
| GREEN (Task 2, 4089dd92) | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | — | — | not_available |
| scoped | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 0 | PASS (1336/1336, up from 1303 by 33 new tests) |
| golden | `stack-drafter-golden.test.cjs` | 0 | PASS (14/14) |
| fleet | `stack-drafter-fleet.test.cjs` | 0 | PASS (36/36) |
| realshape | `stack-drafter-realshape.test.cjs` | 0 | PASS (11 shapes + guard) |
| test | `npm test` | 1 | PASS except the known environmental MA-7 (8738 tests: 8705 pass, 1 fail = MA-7 `doctl auth init`, 32 skipped) |

## Post-TRD Verification

- Auto-fix cycles used: 1 (the narrowing)
- Must-haves verified: 5/5. The fifth: ao-terminal.deps is re-tagged as a flag-only residual with its exact draft value.
- Gate failures: none. The only `npm test` failure is MA-7 (handoff-e2e `doctl auth init`), which is environmental and was already failing

## Next

43-12 (declared key targets, wrapper reduction, lint actions with a CLI equivalent) opens with KNOWN_DRIFT at:
- aocore lint/audit and build/test
- ao-terminal deps (residual, 43-15)
- aoedge lint
- aoinference
- opsCluster

## Self-Check: PASSED

- All 6 key implementation and fixture files are present.
- All 4 task commits are present: a7b300c2, 73af3619, 1d707d02 and 4089dd92. Each task has a RED commit followed by a GREEN commit.
- The scoped suite passes 1336/1336, including golden 14/14, fleet 36/36 and realshape 11/11.
- `npm test` has one failure, MA-7, which is environmental.
