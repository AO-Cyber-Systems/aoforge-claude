---
objective: 43-stack-drafter-rules
trd: "05"
job: 43-05
subsystem: stack-drafter
tags: [stack-draft, stack-evidence, primary-component, manifest-less, gap-closure, SDR-08]
requires: ["43-01", "43-04"]
provides:
  - "stack-draft: literal D3 rule (no supported root area -> extends general, every supported area is a component, a lone sub-area included); pickPrimaryComponent (exported) with the go-first tie-break; primary-component candidates fill root keys with their own cwd; single-component build/test/lint fallback with cwd; off_primary gate"
  - "stack-evidence: effectiveArea pseudo-area for a non-root cwd in no language area; script-dir language area for a root-invoked script"
  - "stack-drafter-fixtures: manifestlessShellShape, recipeWrapsComponentShape, componentMakefileShape; e2e 22, 23, 24"
affects: ["43-06 fleet rollout (the 11-golden suite)"]
tech-stack:
  added: []
  patterns:
    - "the primary component is a draft-time heuristic: runner + CI evidence count, then go > flutter > dart > other, then shallower path, then lexical"
    - "new facts stay evidence item fields read by stack-draft (D20 purity kept: stack-draft requires only stack-classify)"
    - "a tier root has no primary component and behaves exactly as before"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.test.cjs
decisions:
  - "Script-dir area is the LANGUAGE area of the script's own directory only. A script in a helper dir that is no language area (`./scripts/build.sh`, `bash t0-conformance/selftest.sh`, `./scripts/eden/build.sh`) keeps '' and stays a root command. The pseudo-area applies to a non-root CWD only (see Deviations 2)."
  - "A primary-component candidate that runs the SAME tool as the component tier's default keeps that tier's scoped/apply forms, exactly as the old lone-sub-area re-emit did (e2e 14 still asserts `scoped`)."
  - "A cwd that does not exist is no pseudo-area: the item stays a candidate that stack-draft reports as cwd_missing (TRD 42-14), not a sub_area note."
  - "The primary_component note is an info note with `tag: 'primary_component'` and `area` = the component dir, so reports and tests can find it without parsing text."
metrics:
  duration: "~18m"
  completed: 2026-10-03
  tasks: 3
  files: 7
tokens_input: 25760151
tokens_output: 126356
tokens_cache_read: 25458434
tokens_cache_write: 301475
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 05: Multi-stack and manifest-less roots, primary component placement (D3, D6, D2) Summary

A root with no supported manifest is now `extends: general` with every supported area as a component, and the primary component (most runner + CI evidence, go-first on ties) supplies the root build/test/lint with their own cwd; sub-dir cwds and sub-dir scripts that belong to no language area are `sub_area` notes instead of root keys.

## Progress
- [x] Task 1: Literal manifest-less rule and primary-component selection (D3 + D6 selection) — a7fea63e
- [x] Task 2: Primary-component candidates fill root keys; single-component fallback; off_primary gate (D6) — 979d93a0
- [x] Task 3: Effective-area facts (D2) and e2e shapes; re-baseline e2e 4/11/14 — 70bbe678

## What changed

### stack-draft.cjs (pure, D20 intact)
- **D3, literal rule.** `components` is every supported area with `dir !== ''`; `extendsId` is the root area's tier or `general`. `single` and `singleCwd` are gone. An explicit `--extends` sets the root and leaves the components alone.
- **D6, primary component.** `pickPrimaryComponent(components, items)` (exported) returns `{ path, profile, score }`. Score is the runner + CI items whose `effectiveArea` is the component. Order: score desc, `PRIMARY_ORDER = go, flutter, dart` (others last), shallower path, lexical. The go-first comment records the 2026-10-02 user decision. Only a `general` root has a primary; it is noted as an info note tagged `primary_component`.
- **Placement.** Items whose effectiveArea is the primary go to `primaryByKey` (own cwd kept: `make build` in `go/` is `{ run: make build, cwd: go }`; a root `just test-go` whose recipe does the `cd` keeps no cwd). A key with a root-area candidate uses it; the primary's candidates for that key become component notes. A key with none takes the primary's, ranked with the same logic. Non-primary component items stay notes. Key order is first-seen evidence order.
- **Single-component fallback.** With exactly one component, a root build/test/lint nothing else supplied is the component tier's runnable default with `cwd` = the component dir. Never format/fix/audit/codegen/tidy, never with 2+ components. A narrow-only test in that case takes the fallback instead of `discover`.
- **off_primary gate.** A root-area candidate whose scope stacks are ALL owned by a non-primary component's tier family (via `TIER_STACKS`) is an `off_primary` note ("tool stack flutter belongs to component app/, not the primary component svc/"). Shell, neutral generators, unknown tools, node/docker and the primary's own stack are never gated.

### stack-evidence.cjs
- `unitArea`: the language area of the unit's cwd; else a non-root in-repo cwd is its own pseudo-area (`infra/tiles/`); else, for a root cwd, the language area of the script's own dir (`bash portal/build.sh` -> `portal/`). `expandCall` stamps each unit of a readable script with the script's dir (innermost wins), so a body that lives in `portal/` is judged there.
- An item with no unit at all (a prerequisites-only target in `engine/compilerplugins`) takes the pseudo-area of its own cwd.
- A `missing` cwd resets a pseudo-area back to the item's own area.

## Re-baselined tests (and why)

| Test | File | Why the old assertion was replaced |
|---|---|---|
| D15c | stack-draft.test.cjs | Asserted `extends go` plus `cwd` re-emit of every tier key for a lone sub-area: the replaced promotion. Now general + one component, build/test/lint fallback, no format/fix/audit/codegen/typecheck. |
| D17b | stack-draft.test.cjs | Asserted a component-only command is only a note. Now the primary component's candidates are root keys with cwd and the non-primary component's stay notes. Its expected `test` includes the go tier `scoped` (same tool as the tier default). |
| e2e 4 | stack-drafter-e2e.test.cjs | aoinference-shaped: now general + component `control-plane/`; build/test/lint `make X` cwd `control-plane`; no echo; no tidy/format/fix/audit/codegen. |
| e2e 14 | stack-drafter-e2e.test.cjs | Checkout path: still cwd `go`, never `svcrepo/`, now under general + component `go/`; build and lint fall back with cwd `go`. |
| G2 | stack-report.test.cjs | NOT in the TRD's expected list. Asserted report `components: []` for one supported sub-area, the replaced promotion. The report equals the draft's components, now `["svc/"]`. |
| D26 | stack-draft.test.cjs | NOT in the expected list. It ran a CI step in `go` with NO areas, so the placed `cwd: go` relied on a non-area cwd being a root candidate. A cwd in no area is now a sub_area pseudo-area, so the test models `go/` as the language area it is; the expected test gains the tier `scoped`. |
| D31b | stack-draft.test.cjs | NOT changed. A go ROOT plus a flutter component is a tier root: no primary, behaviour unchanged. The non-primary case is asserted by new D31c. |
| e2e 11 | stack-drafter-e2e.test.cjs | NOT changed. ao-terminal-shaped has a root `go.mod`, so it is a tier root. |
| e2e 1 | stack-drafter-e2e.test.cjs | No assertion changed. Its draft moved toward the aocore golden: `lint`, `test`, `audit` now come from `svc/` with cwd (the golden has them from `go/` with cwd) and `lint_helm` is kept. |

stack-init.test.cjs needed no change: none of its cases asserted a promoted lone sub-area.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 carries the placement and fallback, not only selection**
- **Found during:** Task 1
- **Issue:** Removing the lone-sub-area promotion immediately broke D15c, D17b, D21b-style cases, e2e 4, e2e 14 and stack-report G2 until primary placement and the single-component fallback existed. A GREEN commit with failing tests is not allowed.
- **Fix:** Task 1's GREEN commit (a7fea63e) also holds the `primaryByKey` placement, the fallback and the re-baselines of D15c, D17b, e2e 4, e2e 14, G2. Task 2 therefore holds the off_primary gate; its RED commit (ecb160ec) has one genuinely failing test (D17h) and guards D17d-i, D31c that passed at once. Task 3 holds the effective-area facts and e2e 22-24.
- **Commits:** a7fea63e, ecb160ec, 979d93a0

**2. [Rule 1 - Bug] The TRD contradicts itself on script directories; resolved toward the goldens**
- **Found during:** Task 3
- **Issue:** Task 3 step 2 and test 15 say `./scripts/build.sh` (scripts/ not an area) -> pseudo-area `scripts/`. But the anti-patterns, the must_have ("takes the area of the script's own directory"), e2e 22 (`bash t0-conformance/selftest.sh` is a root test) and the 43-06 goldens (EdenDocs `./scripts/eden/build.sh` is the root build) need those scripts to stay root commands.
- **Fix:** a root-invoked script takes `areaFor(dirname)` only: `bash portal/build.sh` -> `portal/`, `./scripts/build.sh` -> '' (E18d asserts this). The pseudo-area applies to a non-root cwd (politihub `infra/tiles`, `make -C docs`).
- **Files modified:** stack-evidence.cjs, stack-evidence.test.cjs
- **Commit:** 70bbe678

**3. [Rule 3 - Blocking] e2e 22 uses Makefile recipes, not raw CI lines**
- **Found during:** Task 3
- **Issue:** stack-classify has no row for `shellcheck` and no hint for the name `selftest`, so the TRD's CI lines `shellcheck ...` and `bash t0-conformance/selftest.sh` are not evidence at all. Adding classifier rows is outside this TRD's file list and would change drafts fleet-wide (a root `shellcheck` candidate beats the primary's lint).
- **Fix:** `manifestlessShellShape` carries a root Makefile whose `lint` runs shellcheck and whose `test` runs the self-test. The shape still proves what e2e 22 is for: shell root candidates are never gated, they beat the go fallback, and build is the fallback `go build ./...` cwd `tools/proxy`.
- **Commit:** c4352a53

**4. [Rule 2 - Missing critical] scoped/apply kept for same-tool primary candidates**
- **Issue:** The old lone-sub-area path kept the tier's `scoped`/`apply` for a same-tool candidate (D15d, e2e 14). The TRD did not carry that over; dropping it would lose `scoped` for single-component repos.
- **Fix:** `formEntry` (the primary component's tier entry) is the reference for sameTool/scoped/apply when the chosen candidate is a primary one.
- **Commit:** a7fea63e

**5. [Rule 1 - Bug] A missing cwd and a unit-less item**
- A cwd that does not exist reverts to the item's own area (E18f), so it stays a `cwd_missing` candidate. An item with no unit (EdenDocs `make build` in `engine/compilerplugins`) takes the pseudo-area of its cwd (E18b2); found by the read-only EdenDocs spot check.
- **Commit:** 70bbe678

## Findings for 43-06 (fleet goldens, not fixed here)

- **politihub:** the primary is `flutter-navigators/` (most CI evidence), not `go/`. The golden wants `make build` / `make test` cwd `go`. The score-first rule (binding in this TRD) picks the flutter component; go-first only breaks ties. 43-06 decides: weight by canonical keys, or HAND_ONLY.
- **EdenDocs:** `engine/compilerplugins` is now a `sub_area` note (D2 fixed). Root build is `./scripts/eden/build-deps.sh` (a build-named CI script), the golden has `./scripts/eden/build.sh`.
- **devcluster:** components `[tools/devproxy/ go]` and `./bin/build.sh` / `./bin/test.sh` root keys match the shape; lint is the single-component fallback `go vet ./...` cwd `tools/devproxy` because `shellcheck` and the `selftest` name are not classified (see Deviation 3).
- **aoinference:** `codegen: make generate` (cwd `control-plane`) is an evidence-backed primary candidate, so it is a root key; it is not a tier-default re-emit.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: literal rule + primary selection | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs plugins/devflow/devflow/bin/lib/stack-init.test.cjs` | 0 (101 pass) | PASS |
| 2: primary placement, fallback, off_primary | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs` | 0 (73 pass) | PASS |
| 3: effective-area facts + e2e | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (bcf80268) | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs` | 1 (7 fail: D15c, D17b, P1-P5) | FAIL (correct) |
| GREEN 1 (a7fea63e) | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs plugins/devflow/devflow/bin/lib/stack-init.test.cjs` | 0 | PASS (correct) |
| RED 2 (ecb160ec) | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs` | 1 (D17h off_primary) | FAIL (correct) |
| GREEN 2 (979d93a0) | `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs` | 0 (73 pass) | PASS (correct) |
| RED 3 (c4352a53) | `node --test plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs` + e2e 24 | 1 (E18a/b/c/e, e2e 24) | FAIL (correct) |
| GREEN 3 (70bbe678) | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (1151 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none | - | not_available (no lint command for this repo) |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (baseline 1128 tests, final 1151, 0 fail) | PASS |
| build | none | - | not_available |

`npm test` over the whole repo: 8553 tests, 2 fail, neither from this TRD. `MA-7 doctl auth init` (handoff PTY mock) is environmental. `E2E1: SELF-TEST roadmap reconcile` reports `43-05-TRD.md` unchecked while its SUMMARY exists, and clears when ROADMAP is updated at TRD completion.

## Read-only spot checks (no `--write`; `git status --porcelain` fingerprint identical before and after)

| Repo | Result |
|---|---|
| aoinference | `extends general`, component `control-plane/ go`; build/lint/test `make X` cwd `control-plane` (+ codegen `make generate`); primary note names `control-plane/` |
| devcluster | `extends general`, component `tools/devproxy/ go`; `./bin/build.sh` and `./bin/test.sh` root keys; lint fallback `go vet ./...` cwd `tools/devproxy` |
| navigators | `extends general`, components flutter + go; `test: just test-go` with NO cwd, `codegen: just generate`, `e2e: maestro test .maestro`; primary `navigators-go/` (3 evidence items) |
| politihub, EdenDocs (extra) | see Findings for 43-06 |

## Discovered commands

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (literal rule, primary pick, primary candidates with own cwd, single-component fallback, D2 pseudo-area and script-dir area, D20 purity and re-baselined tests)
- Gate failures: None

## Self-Check: PASSED

- Files: stack-draft.cjs, stack-evidence.cjs, their tests, stack-drafter-fixtures.cjs, stack-drafter-e2e.test.cjs, stack-report.test.cjs all FOUND.
- Commits: bcf80268, a7fea63e, ecb160ec, 979d93a0, c4352a53, 70bbe678 all FOUND.
- `pickPrimaryComponent` exported; stack-draft.cjs requires only stack-classify.cjs (no fs, no stack-profile).
