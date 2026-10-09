---
objective: 43-stack-drafter-rules
trd: "10"
job: 43-10
subsystem: stack-drafter
tags: [stack, drafter, primary-component, tiered-placement, workspace-root, realshape, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-09 realshape suite and fixtures; 43-08 compareDrift, fleet harness and KNOWN_DRIFT ratchet; 43-05/43-06 primary component and root product rules"
provides:
  - "pickPrimaryComponent weighs build/test/lint (canonical-key) evidence: a CI step through a runner lifts a component only when it serves a canonical key, then the canonical count decides, then all evidence, then go-first"
  - "tiered root/primary placement: (1) root task-runner recipes wherever they run, (2) the primary's own runner targets with their own cwd, (3) other root-area candidates, (4) the primary's other candidates; an unresolved tier falls through before `discover`"
  - "shadowed note (with an image_build detail for an image-only build) for a root candidate the primary's runner supersedes"
  - "workspace root: a root runner with a build/test/lint recipe running in 2+ areas has no primary component (root_workspace note), no off_primary gate and no fallback"
  - "stack-evidence items carry unitAreas (the distinct areas ALL of an item's units run in)"
  - "realshape fixtures crossStackPrimaryShape, toolDirectPrimaryShape, imageBuildRootShape, workspaceRunnerShape; optional noteTags in the realshape suite"
affects: ["43-11", "43-12", "43-13", "43-15"]
tech-stack:
  added: []
  patterns:
    - "Per-key placement is a walk over tiers, each tier run through one factored pipeline (evaluateKey); a tier that supplies nothing leaves its notes and the next is tried"
    - "The evidence that decides the primary is the build/test/lint evidence; go-first only breaks ties"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-golden-fixtures.cjs
key-decisions:
  - "Tier (1) is every runner item whose runner file sits at the repo root (source runner, TASK_RUNNERS), wherever its body runs; a declared row is tier 1 too, so declared still outranks every source"
  - "Tier (2) is membership by the runner FILE's area (item.area === primary.path), never by effectiveArea, so a go/Makefile target that does `cd .. && buf generate` keeps cwd go"
  - "off_primary filters tiers 1-3 (a recipe or target whose tool stack belongs only to a non-primary component is a note); tier 4 is the primary's own"
  - "A workspace counts the root as an area: unitAreas with 2+ distinct entries on a root-runner build/test/lint recipe. A CI step, a sub-dir runner and a non-canonical key (setup, fmt) never make one"
  - "No repo-specific weight anywhere: no rule names a repo, stack-draft.cjs still requires only stack-classify.cjs (D20), stack-profile.cjs is untouched (P11)"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 21min
completed: 2026-10-03
tokens_input: 30931586
tokens_output: 164952
tokens_cache_read: 30555371
tokens_cache_write: 375965
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 10: Primary component and scope in multi-stack roots Summary

**Multi-stack roots now take their root keys from the component the build/test/lint evidence points to, through its runner first, and a root runner that fans out across areas is the workspace interface: all seven targeted rows close (eden-biz build and test, aodex build, eden-libs build, test, codegen and format), plus politihub's two, with no matching repo moving.**

## Progress
- [x] Task 1 RED: realshape crossStackPrimaryShape and toolDirectPrimaryShape, B1 unit tests, eden-biz build/test removed from KNOWN_DRIFT — 236ccb04
- [x] Task 1 GREEN: primary component is chosen on build/test/lint evidence; D15c note text and the golden eden-biz fixture re-baselined; politihub test row closed — b4f16027
- [x] Task 2 RED: imageBuildRootShape, B2 tier unit tests, D17d re-baselined, aodex.build and politihub.build removed from KNOWN_DRIFT — 60b61146
- [x] Task 2 GREEN: root and primary candidates are tiered by source, unresolved tiers fall through; eden-libs test/codegen/format and eden-biz e2e_env closed as a side effect — 301c56e9
- [x] Task 3 RED: unitAreas tests (E19), workspaceRunnerShape with noteTags, B3 workspace unit tests, eden-libs.build removed from KNOWN_DRIFT — 190b1c2b
- [x] Task 3 GREEN: a root runner that fans out across areas makes a workspace root; evidence items carry unitAreas — 60a58822

## Surveyed shapes and the fixtures built from them (read-only, 2026-10-03)

Each fixture keeps the surveyed competing-candidate structure (per-area counts, which CI steps go through a runner and which key they serve) with invented names and text. Each went RED with the wrong draft the real repo produced.

| Fixture | Fleet rows | Shape kept | RED draft at the wave base (fixture = real repo) |
|---|---|---|---|
| `crossStackPrimaryShape` | eden-biz build, test | go service (9 runner+CI items, 9 canonical, CI runs `go vet/build/test` directly in 3 workflows) vs flutter client (11 items, 7 canonical, one CI step `make <e2e bundle target>` through its Makefile) | primary the client: build `make build-web (cwd client)`, test `make test (cwd client)`, lint, deps and e2e from it |
| `toolDirectPrimaryShape` | politihub test | go service (8 items, 7 canonical, CI direct) vs flutter app (12 items, 6 canonical, three workflows, all raw `flutter`/`dart`) | `flutter build web --release (cwd navigator)`, `flutter test (cwd navigator)` |
| `imageBuildRootShape` | aodex build, politihub build | go service Makefile build/test; the only root build evidence is a release step `docker build … ${{ github.sha }} -f ./ui/Dockerfile ./ui` | build `discover` |
| `workspaceRunnerShape` | eden-libs build (and test, codegen, format) | root justfile fan-out recipes (setup, fmt, test, lint across 4-6 dirs, generate in a nested checkout, a two-line bundle recipe with depended-on recipes, a `package-site` bash recipe ending in `docker build`); package CI runs `dart`/`go` per dir | primary the first Dart package, build `just package-site`, a primary_component note |

Fleet before and after (current checkout against the wave base `d55a4e68`, `stack init` read-only over all 33 repos): only four repos changed primary or notes.

| Repo | Primary before | Primary after | Tuples (viaRunner-canonical, canonical, all) |
|---|---|---|---|
| eden-biz | `flutter/` | `go/` | go (0, 14, 21) vs flutter (old rule 1 via the e2e step, new rule 0; 12, 22) |
| politihub | `flutter-navigators/` | `go/` | go (0, 7, 7) vs flutter-navigators (0, 6, 15) |
| eden-libs | `eden-platform-api-dart/` | none (`root_workspace`) | n/a |
| aodex | `go/` | `go/` (unchanged; the root docker build is now a `shadowed` note with `image_build`) | |
| every other repo | unchanged | unchanged | |

None of the changed repos was a matching one, so no tuple narrowing (error_recovery, B1) was needed, and no repo-specific weight exists.

## Tier that supplied each closed key

| Row | Draft now | Tier / rule |
|---|---|---|
| eden-biz.build | `make build (cwd go)` | primary `go/` by B1; tier 2 (go/Makefile `build`) |
| eden-biz.test | `make test (cwd go)` | primary by B1; tier 2 |
| aodex.build | `make build (cwd go)` | tier 2 beats the root release `docker build … ${{ }}` (tier 3, unverifiable), which is a `shadowed` note with `image_build` |
| eden-libs.build | `just build-flutter-explorer` | workspace, tier 1: the depended-on, high-confidence recipe ranks above `build-docs` (low confidence); `package-docs` is not depended on |
| eden-libs.test | `just test` | tier 1 (closed already by Task 2 under the old primary; kept by the workspace) |
| eden-libs.codegen | `just generate` | tier 1 (as above) |
| eden-libs.format | `discover` with apply `just fmt` | tier 1 apply-only entry (as above) |
| politihub.test (out of scope) | `make test (cwd go)` | primary by B1 (Task 1); tier 2 |
| politihub.build (out of scope) | `make build (cwd go)` | tier 2 over the root deploy `docker buildx build … ${{ github.sha }}` |
| eden-biz.e2e_env (43-11's row) | `make e2e-stack-up` | tier 1: the root Makefile recipe wins wherever its body runs (a sub-area script) |

## What was built

- **stack-draft.cjs**
  - `pickPrimaryComponent`: `viaRunner` counts only CI steps through a task runner whose key is build/test/lint; `canonical` counts build/test/lint items; the sort is viaRunner > 0, canonical, score, PRIMARY_ORDER, depth, path. The `primary_component` note names `canonical of score`.
  - The placement is a walk over four tiers. `evaluateKey(key, list, fromPrimary)` is the former per-key pipeline factored out so it runs once per tier (D3 gate, e2e_env eligibility, rank, repo-wide test, verify walk, apply). A tier that supplies nothing leaves its notes and the next is tried; only when every tier is spent with candidates does the key end as `discover`. off_primary runs once per key over tiers 1-3, so its notes appear even when a lower tier wins.
  - Losing candidates: the primary's own become component notes when a root tier wins (as before); a root CI/docs/manifest candidate beaten by the primary's runner is a `shadowed` note, with an `image_build` detail for an image-only build.
  - `workspaceItem`: a root-runner build/test/lint item with 2+ `unitAreas` makes `primary` null, adds a `root_workspace` info note, drops off_primary and the single-component fallback, and lets every root-runner recipe be a root candidate.
  - The header comments are rewritten for the primary rule, the tiers and the workspace.
- **stack-evidence.cjs**: `scopeOf` also returns `unitAreas` (the distinct areas of ALL units, first-seen order, `[ownArea]` when there is none). `effectiveArea` is unchanged.
- **Tests and fixtures**: the realshape suite goes from 3 to 7 shapes, with an optional `noteTags`; B1a-e, B2a-i and B3a-i in stack-draft.test.cjs; E19a-e in stack-evidence.test.cjs.

## KNOWN_DRIFT before and after

| Before (wave base) | After (43-10) |
|---|---|
| aodex: build (43-10) | removed (entry gone) |
| eden-biz: build, test (43-10); codegen, e2e_env (43-11) | eden-biz: codegen (43-11); reason updated: the draft is now `make templ-check (apply: make generate) (cwd go)` (seeded as `make buf-generate (cwd go)`) because the go component's runner targets are now one tier-2 list |
| eden-libs: build, test, codegen, format (43-10) | removed (entry gone) |
| politihub: build, test (out-of-scope) | removed (entry gone): closed by the same rules |
| every other entry | unchanged |

Rows I could not close: none. The seven rows 43-10 owns are closed. Two rows it did not own closed with them (politihub build and test), and one that 43-11 owned (eden-biz e2e_env), so 43-11's eden-biz entry is now codegen only. The more-specific diagnostics differ from the baseline in two repos. eden-biz lost its `deps` and `lint` rows, and `e2e` is now `make e2e-db-reset`, a root Makefile recipe that the name rule files under e2e. Committed has no e2e, so this is a draft-only row and not a conflict. politihub lost its `codegen` and `deps` rows and keeps `lint` as `go vet ./... (cwd go)`. 43-11 and 43-12 should review the eden-biz `e2e` pick.

## Re-baselined tests

- **stack-draft.test.cjs D15c "a lone non-root area is the one component of a general root…"**: the `primary_component` note text is now `primary component svc/ (go): 2 build/test/lint evidence items of 2`. Reason: the TRD has the note name the canonical and total counts. The primary is unchanged.
- **stack-draft.test.cjs D17d "a root-area candidate for a key beats a primary-component candidate"** (retitled): the old rule is the one 43-10 replaces. A primary runner target (`make test` in `svc/`, tier 2) now beats a root CI script (tier 3), which becomes a `shadowed` note. The assertion that a key with no root candidate still takes the primary one is kept.
- **stack-golden-fixtures.cjs `goldenBizShape` (eden-biz golden)**: the Go and Flutter workflows called `make test`, `make build`, `make analyze` and `make build-web`, which lifted both components through their runner and hid the new rule (the anti-pattern the TRD names). They now run `go test`, `go build`, `flutter analyze`, `flutter test` and `flutter build web` directly, as the surveyed repository's do, and extra Go workflows each run one `go build`. The frozen expectation (`make build`, `make test`, `make generate` with cwd go, `make e2e-stack-up`) is unchanged and the golden suite is 14 of 14. This file is not in the TRD's `files_modified`; see Deviations.
- P1-P7, D17b and D17e-i, D31/D31b/D31c, D37 and the other 43-05/43-06 assertions pass unchanged: their items either use canonical keys or place no root candidate in a competing tier.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The golden eden-biz fixture lifted both components through `make` and went to a flutter primary under B1**
- **Found during:** Task 1 GREEN (golden suite 13 of 14).
- **Issue:** Every CI step in the fixture's go and flutter workflows went through the component's Makefile, so both had CI-through-runner evidence and the flutter component had one more canonical item.
- **Fix:** Made the fixture faithful to the surveyed repository (tools called directly, several Go builds across workflows). The frozen expectation is unchanged.
- **Files modified:** `__fixtures__/stack-golden-fixtures.cjs`
- **Commit:** b4f16027

**2. [Rule 1 - Bug] The first B2 tests used a root `./ci/build.sh` as the tier-3 candidate, which makes the root a product**
- **Found during:** Task 2 GREEN.
- **Issue:** A root build in a stack no component has is `root_product` (43-06), so no component was primary and the tiers never applied.
- **Fix:** The tier-3 candidate is now a root `go build` (the primary's own stack), which keeps the root a non-product.
- **Files modified:** `stack-draft.test.cjs`
- **Commit:** 301c56e9

**3. [Rule 1 - Bug] The E19 Taskfile used `cd x && cmd` lines, which persist across commands**
- **Found during:** Task 3 GREEN.
- **Issue:** The normaliser treats Taskfile `cmds` as one shell script, so the second `cd` was relative to the first and every unit was `svc/`.
- **Fix:** Subshell `(cd x && cmd)` lines, as the justfile fixture and the real fan-out recipes use.
- **Files modified:** `stack-evidence.test.cjs`
- **Commit:** 60a58822

### Interpretations

1. **Declared rows are tier 1.** The TRD lists no tier for a declared row. Declared is the first source in every ranking, so it is placed with the root runner recipes and still outranks every other tier.
2. **Tier (2) is by the runner file's area, tier (1) by the runner file being at the root; both wherever the body runs.** I did not narrow tier 1 (error_recovery) because no matching repo regressed. The visible effect is that root recipes whose body runs in a sub-area are now root candidates (eden-biz `e2e_env` matches the reviewed `make e2e-stack-up`, `e2e` is `make e2e-db-reset`).
3. **The workspace test counts the root as an area** (the literal `unitAreas.length >= 2`). A recipe that runs at the root and in one dir also counts. No fleet repo does that (the scan finds exactly one workspace, eden-libs), and B3i pins a packaging recipe with `['app/', '']`.
4. **Closures landed earlier than the TRD sequence.** eden-libs test, codegen and format closed in Task 2 (a root runner recipe is tier 1 even with a primary), and politihub test closed in Task 1. The Task 3 fleet RED was therefore only eden-libs.build, and the workspace realshape was RED on `build` and the notes. The fleet table was kept ratchet-green at each commit.
5. **Realshape `noteTags`.** The workspace shape has to assert a `root_workspace` note and no `primary_component` note, so the suite gets an optional `{ present, absent }` field (guarded in the table test). The other shapes are untouched.
6. **Test names.** B1a-e, B2a-i and B3a-i (stack-draft) and E19a-e (stack-evidence) cover the TRD's unit items 6, 7, 5 and 8.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test …/stack-draft.test.cjs …/stack-drafter-realshape.test.cjs …/stack-drafter-fleet.test.cjs` (5 fail: B1a, B1c, eden-biz fleet, 2 realshape) | 1 | PASS (RED expected) |
| 1 GREEN | the same plus golden (153 of 153 after the re-baselines); real eden-biz note `primary component go/ (go): 14 build/test/lint evidence items of 21`, politihub `7 of 7` | 0 | PASS |
| 2 RED | the same (9 fail: D17d, B2a, B2b, B2d-f, aodex, politihub, imageBuildRootShape) | 1 | PASS (RED expected) |
| 2 GREEN | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (1288 of 1288) | 0 | PASS |
| 3 RED | evidence, draft, realshape and fleet tests (E19a-e, B3a, B3g, workspaceRunnerShape, eden-libs fleet fail) | 1 | PASS (RED expected) |
| 3 GREEN | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (1303 of 1303; base 1271) | 0 | PASS |
| done check | read-only `stack init` over the 33 fleet repos: eden-biz and politihub primary go, eden-libs `root_workspace`, aodex `shadowed` image_build, every other primary unchanged | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test …/stack-draft.test.cjs …/stack-drafter-realshape.test.cjs …/stack-drafter-fleet.test.cjs` | 1 (5 fail) | FAIL (correct) |
| GREEN (T1) | same plus golden | 0 (153 of 153) | PASS (correct) |
| RED (T2) | same | 1 (9 fail) | FAIL (correct) |
| GREEN (T2) | scoped `stack-*` and `adopt-*` | 0 (1288 of 1288) | PASS (correct) |
| RED (T3) | `node --test …/stack-evidence.test.cjs …/stack-draft.test.cjs …/stack-drafter-realshape.test.cjs …/stack-drafter-fleet.test.cjs` | 1 (E19a-e, B3a, B3g, workspace shape, eden-libs) | FAIL (correct) |
| GREEN (T3) | scoped `stack-*` and `adopt-*` | 0 (1303 of 1303) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none defined for this repo | - | not_available |
| scoped | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (1303 of 1303; 32 new tests) | 0 | PASS |
| golden | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` (14 of 14) | 0 | PASS |
| realshape | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs` (7 shapes and the table guard) | 0 | PASS |
| fleet | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (36 of 36; KNOWN_DRIFT lost the seven targeted rows and three more) | 0 | PASS |
| test | `npm test` after `roadmap update-job-progress 43` (8705 tests: 8672 pass, 1 fail, 32 skipped) | 1 | the one failure is MA-7 (doctl PTY, known environmental); the roadmap-reconcile test did not fail |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - primary chosen on canonical-key evidence (B1: eden-biz and politihub now go);
  - tiered placement with fall-through (B2: aodex and politihub build);
  - workspace root with no primary (B3: eden-libs);
  - `unitAreas` on every item (E19);
  - four realshape fixtures reproduce the surveyed shapes and the harness loses the seven rows with every matching repo still matching.
- `node -e "require('./plugins/devflow/devflow/bin/lib/stack-draft.cjs')"` loads, and stack-draft.cjs requires only `./stack-classify.cjs` (D20 test). stack-profile.cjs is untouched (P11). No drafter rule names a repo, and no fixture text is taken from a fleet repo (the realshape suite guards shape names).
- The fleet repos were read-only. The harness asserts HEAD and porcelain are unchanged per repo, and every manual `stack init` ran without `--write`.

## Self-Check: PASSED

- Files: stack-draft.cjs, stack-evidence.cjs, stack-realshape-fixtures.cjs, stack-fleet-tables.cjs, stack-golden-fixtures.cjs and stack-drafter-realshape.test.cjs exist (checked with `ls`).
- Commits: 236ccb04, b4f16027, 60b61146, 301c56e9, 190b1c2b and 60a58822 are in `git log d55a4e68..HEAD`.
- stack-draft.cjs requires only `./stack-classify.cjs`.
- Every Progress item is ticked and has a hash.
