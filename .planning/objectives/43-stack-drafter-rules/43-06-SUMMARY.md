---
objective: 43-stack-drafter-rules
trd: "06"
job: 43-06
subsystem: stack-drafter
tags: [stack, drafter, golden, tdd]
requires: ["43-02", "43-03", "43-05"]
provides:
  - "golden equivalence suite for the 11 objective-42 override shapes (stack-drafter-golden.test.cjs)"
  - "11 invented golden-shape builders + GOLDEN / HAND_ONLY / KEY_ALIASES / EXTRA_ALLOWED tables"
  - "general drafter rules closing every canonical divergence (11 rules, below)"
affects: ["43-07"]
tech-stack:
  added: []
  patterns:
    - "golden fixtures model the override's provenance sources with invented content; expected = the frozen override"
    - "comparison of the EFFECTIVE command (draft entry, else the extends tier's)"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-golden-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - CHANGELOG.md
    - CLAUDE.md
decisions:
  - "politihub primary resolved by a general rule: a component whose CI goes through its task runner ranks first (P7); P1-P6 unchanged"
  - "a general root that builds itself in a stack no component has is a product: its components are sidecars, no primary, no fallback"
  - "e2e_env needs a scenario name (or a declared row); body-only bring-ups are env_unnamed notes (D34b re-baselined)"
  - "the name rank (target named for the key) applies to every key, not only build/test/lint (D25i re-baselined)"
  - "HAND_ONLY grew by 10 author-named, non-canonical keys; pending user acceptance at 43-07"
metrics:
  duration: "~65 min"
  completed: "2026-10-03"
tokens_input: 51028482
tokens_output: 223068
tokens_cache_read: 50260685
tokens_cache_write: 767461
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 06: Golden equivalence for all 11 override shapes Summary

`stack init` now re-drafts all eleven objective-42 override shapes from invented fixtures: `extends`, the components set and every canonical key's run/apply/cwd match the frozen overrides. Eleven general rules got there (none names a repo). Only ten author-named, non-canonical keys are left, and they are listed for user acceptance.

## Progress
- [x] Task 1: Golden fixtures and equivalence suite (RED) — 71acf0f0
- [x] Task 2: Close residual divergences with general rules (GREEN) — 84588fa0, 54da814b, 030ed34c, b884752b, caddcd4e, fa8d62be, fb7f561a, 6fce7ec9, 9658a0df, 9e2a17e7, 77614b14
- [x] Task 3: Docs and the full suite — 03bc7c60

## Per-golden status

| Golden | RED (Task 1) | Final | Closed by |
|---|---|---|---|
| ao-terminal | test_frontend, bootstrap missing | PASS | HAND_ONLY (both non-canonical) |
| aocore | PASS | PASS | (43-05 rules) |
| aodex | primary flutter/: build/test/deps/lint/e2e from it; codegen inherited; guards | PASS | R2+R3 (openapi-verify is codegen's check), R5 (regen is its apply), R6; guards HAND_ONLY |
| aoedge | acceptance missing | PASS | HAND_ONLY |
| devcluster | test/lint from tools/devproxy; extra e2e_env ./bin/test.sh; cluster_test | PASS | R10 (shellcheck, selftest), R11 (body-only e2e_env); cluster_test HAND_ONLY |
| devflowops | deps, lint.apply, format.run, tidy.run, codegen.run | PASS | R1, R2, R3, R4 |
| eden-biz | PASS | PASS | (43-05 rules; stays green under R6) |
| EdenDocs | build from docker-publish; test = smoke-test.sh; extra lint from wopi-host; smoke, branding | PASS | R4 (build.sh over build-deps.sh), R7, R8, R9; smoke, branding HAND_ONLY |
| navigators | extra e2e_env `just infra`; sqlc | PASS | R11; sqlc HAND_ONLY |
| politihub | primary flutter-navigators/: build/test/deps/lint from it | PASS | R6 |
| quanta-local | extra e2e_env `make up`; preflight, verify | PASS | R11; preflight, verify HAND_ONLY |

## The general rules (Task 2)

| # | Rule | Module | Unit tests |
|---|---|---|---|
| R1 | A check/verify/diff suffix in a name is the check form of format, tidy, codegen and fix. A fix/write/apply suffix is the apply form of lint, format and tidy (`lint-fix`, `tidy-check`). | stack-classify | K25a-c |
| R2 | A target that writes key K (an earlier recipe line, or a prerequisite target) and then fails on `git diff --exit-code` / `--quiet` is K's check form, high confidence (`fmt-check: fmt`, `openapi-verify: openapi-regen`). | stack-classify `isDriftCheck`, stack-evidence | K25d, E19a |
| R3 | A target's prerequisites run before its recipe, so they are part of its units (the gate then sees gofmt at the root). | stack-evidence | E19b |
| R4 | The name rank applies to every key, right after the source. A target or script named for the key ranks first, counting conventional spellings (`fmt`, `generate`/`gen`) and any form suffix. A raw command comes next, and a qualified name (`deps-frontend`, `build-deps.sh`) last. CI and docs steps carry the target or script they go through (`invokedName`). | stack-draft, stack-evidence | D35a-e, E20, D25i/D25i2 |
| R5 | When codegen has a drift-check candidate, the generators are its apply. | stack-draft | D36, D36b |
| R6 | Primary component: a component whose CI steps go through its task runner (make/task/just/npm) ranks first. Then the existing evidence count, then go-first. | stack-draft | P7a-d (P1-P6 unchanged) |
| R7 | A `general` root that builds itself in a stack no component has (and not only by an image build) is a product. Its components are sidecars, so there is no primary component and no single-component fallback (`root_product` note). | stack-draft | D37a-c |
| R8 | An e2e / lint_helm / lint_docker item run from the root is a root candidate even when its script lives in a component. | stack-draft | D37a, D37d |
| R9 | A script whose name carries the whole token `smoke` is single-purpose, so it is never the repo-wide test. | stack-evidence | E21 |
| R10 | `shellcheck` is lint (check). `selftest`/`selftests` are test hint tokens. | stack-classify | K26a-b |
| R11 | `e2e_env` needs a scenario-named candidate or a declared row. A body-only bring-up is an `env_unnamed` note. | stack-draft | D38a-c, D34b |

No rule names a repository, and stack-draft.cjs still requires only stack-classify.cjs (D20 purity holds).

## politihub primary resolution

On the real repo, and in the fixture, `flutter-navigators/` has the most CI evidence. It has its own workflow plus a pages deploy and a release pipeline, all running `flutter` directly. Meanwhile `go/` has a Makefile that its CI calls (`make test`, `make build`). R6 ranks a component whose CI goes through its own task runner first. It encodes OBJECTIVE D2's wording: root keys come "from the primary component's runner (e.g. `make build @go`)". So `go/` is the primary, and the drafted build and test are `make build` / `make test` with cwd `go`.

43-05's P1-P6 stay green. Their items go through no runner, so the evidence count still decides there (P1: three CI items beat one runner item). P7d guards that a runner item alone does not lift a component. Nothing was added to HAND_ONLY for politihub.

## HAND_ONLY additions — need user acceptance (43-07 checkpoint)

The user confirmed the starting set: `devcluster.build` and `aocore.portal_codegen`. Ten additions follow. Each is an author-named, non-canonical key from the TRD's anticipated list, and the drafter emits the canonical keys around it. The table test asserts that HAND_ONLY never covers a canonical key beyond `devcluster.build`.

| Shape.key | Override value | Why no general rule derives it |
|---|---|---|
| ao-terminal.test_frontend | `npx vitest --run` | The root node frontend's suite sits beside the Go root's `test`. The drafter emits one `test` (the tier stack's) and notes the off-stack one. The key name is the author's split. |
| ao-terminal.bootstrap | `task init` | A one-shot setup that only calls internal tasks, so there is no gate a classifier can read. The key name is the author's. |
| aodex.guards | `make check-… check-… check-…` | One CI step runs several boundary checks. Both the grouping and the key name are the author's. |
| aoedge.acceptance | `make acceptance` | Scenario suites against a live edge. It is a non-repo-wide test (an alternate note), and the key is named after the target. |
| devcluster.cluster_test | `./bin/test.sh` | It asserts a live cluster, so it is an `env_unnamed` note, never `test`. The key name is the author's. |
| EdenDocs.smoke | `./scripts/eden/smoke-test.sh` | Single-purpose, so it is a narrow note under test. The key is the author's. |
| EdenDocs.branding | `./scripts/eden/verify-branding.sh` | Runs no gate a classifier reads. The key is the author's. |
| navigators.sqlc | `just sqlc` | A second codegen recipe. The drafter emits one `codegen` (`just generate`), so a key per generator is the author's split. |
| quanta-local.preflight | `make preflight` | Host checks that no classifier reads. The key is the target name. |
| quanta-local.verify | `make verify` | Needs the environment up (a compose run), so it is noted, never `test`. The key is the target name. |

**KEY_ALIASES:** `helm_lint` → `lint_helm` (aocore). The classifier's key for `helm lint` / kubeconform is `lint_helm`; the hand file spelled it `helm_lint`.

**EXTRA_ALLOWED:** empty. No golden draft carries a root key that its override lacks.

## Comparison semantics (the suite)

- For each golden key, the comparison uses the **effective** command: the draft's own entry, else the entry inherited from its `extends` tier (resolved with an empty HOME). This matches what `stack resolve` gives an agent. Example: the override writes `tidy: go mod tidy -diff / go mod tidy` explicitly and the draft inherits exactly that from the go tier.
- Extra root keys are checked on the draft's explicit keys only.
- A guard test checks GOLDEN against the frozen override files (run/apply/cwd, extends, components). It skips when the overrides are not in the checkout.
- Out of scope by design: `when`, `scoped`, `timeout_s`, `loop`, `provenance`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D25i (42-13) re-baselined: the name rank now covers every key**
- **Found during:** Task 2, R4
- **Issue:** D25i pinned "canonical ranking is gated to build/test/lint", so `gen:proto:internal` beat `gen` for codegen. The devflowops golden needs `make generate` over `make generate-backend` and `make deps` over `make deps-frontend`.
- **Fix:** D25i now expects `task gen`. The new D25i2 guards that the rest of the 42-13 tuple (default target, depended-on, segments, variant tokens) and the alternate notes stay build/test/lint only.
- **Commit:** b884752b

**2. [Rule 1 - Bug] D34b (43-04) re-baselined: no `e2e_env` key without a scenario name**
- **Found during:** Task 2, R11
- **Issue:** D34b pinned that a body-only `make infra-up` becomes `e2e_env` when no candidate is flagged. Three goldens (devcluster, navigators, quanta-local) key no body-only bring-up.
- **Fix:** D34b now expects no `e2e_env` key, with both candidates as `env_unnamed` notes. D34, D34c (a declared row still wins) and D34d are unchanged, and e2e 20 (`make e2e-stack-up`) still passes.
- **Commit:** 9e2a17e7

**3. [Rule 1 - Bug] The first R7 draft broke D17g/D17h; refined before commit**
- **Issue:** "A root build candidate means a root product" also caught a root `go build` (D17g) and `flutter build` (D17h), which run a component's own stack.
- **Fix:** A root product must build in a stack no component has, and not only by an image build.
- **Commit:** 6fce7ec9

**4. Test-fixture corrections inside RED→GREEN cycles (assertions unchanged)**
- E20: the smoke script body was only `curl`, which normalises to nothing, so the step was rightly no evidence. It now has a runnable line.
- E21: `smoke.sh` and `api_smoke.sh` carry no key token, so they are not evidence at all. The test now uses test-named smoke scripts and asserts each one is test evidence.
- D37d: the fixture gave the non-primary `app/` more evidence than `svc/`. `svc/` now carries primary evidence, and the test asserts the primary.

**5. Modelling assumption to confirm at 43-07: devcluster's offline gate is a CI workflow**
- The devcluster override lists only `bin/build.sh` and `bin/test.sh` as sources. A drafter cannot derive `test: bash t0-conformance/selftest.sh` and `lint: shellcheck …` without some evidence for them, so the fixture models them as an offline CI workflow (shellcheck plus the self-test). That is the gate the override comment calls "the offline gate". If the real repo has no such workflow, those two keys depend on the real evidence shape.

**6. [Rule 1 - Bug] The CLAUDE.md clause was rephrased so the dispatch-completeness test keeps passing**
- **Found during:** Task 3, `npm test`
- **Issue:** The TRD's clause wrote `` `flutter --no-pub` `` inside the Core Tool "Stack profile" bullet. `dispatch-completeness.test.cjs` reads every backticked span there whose first word is lowercase as a df-tools subcommand, so it reported `flutter: not a COMMANDS key`.
- **Fix:** The clause now reads "Flutter runs with `--no-pub`". The meaning is the same, and a span starting with `--` is not read as a command. CLAUDE.md is still a one-line change.
- **Commit:** 03bc7c60

**7. `requirements mark-complete` skipped**
- There is no `.planning/REQUIREMENTS.md` in this repo. SDR-08, the fleet `stack verify --run` pass, is 43-07's to close; 43-07 lists the same requirements.

### Prior-wave items kept
- 43-05's `./scripts/build.sh` behaviour holds: a script in a non-area helper dir, run from the root, stays a root command (area ''). EdenDocs' `./scripts/eden/build.sh` is the root build, and R7 builds on it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: golden fixtures + suite (RED) | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` | 1 (14 tests: 5 pass, 9 goldens diverge; all 11 load and run) | PASS (RED as specified) |
| 2: general rules (GREEN) | `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs plugins/devflow/devflow/bin/lib/adopt-*.test.cjs` | 0 (1195/1195) | PASS |
| 3: docs + full suite | `npm test`; `grep -n "objective 43" CHANGELOG.md` | 1 (8564 pass, 1 fail: MA-7, known environmental); grep finds lines 170 and 243 | PASS (only the known environmental failure) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (goldens, 71acf0f0) | `node --test …/stack-drafter-golden.test.cjs` | 1 (9 goldens) | FAIL (correct) |
| RED R1-R3 (84588fa0) | `node --test --test-name-pattern="K25\|E19" …` | 1 (6 fail) | FAIL (correct) |
| GREEN R1-R3 (54da814b) | same | 0 | PASS (correct) |
| RED R4-R5 (030ed34c) | `node --test --test-name-pattern="D35\|D36\|E20" …` | 1 (6 fail) | FAIL (correct) |
| GREEN R4-R5 (b884752b) | `node --test …/stack-*.test.cjs` | 1 (goldens only) | PASS for the rule (correct) |
| RED R6 (caddcd4e) | `node --test --test-name-pattern="P7" …` | 1 (P7a) | FAIL (correct) |
| GREEN R6 (fa8d62be) | `node --test …/stack-*.test.cjs` | 1 (goldens only; politihub green) | PASS for the rule (correct) |
| RED R7-R9 (fb7f561a) | `node --test --test-name-pattern="D37\|E21" …` | 1 (4 fail) | FAIL (correct) |
| GREEN R7-R9 (6fce7ec9) | `node --test …/stack-*.test.cjs` | 1 (goldens only) | PASS for the rule (correct) |
| RED R10-R11 (9658a0df) | `node --test --test-name-pattern="K26\|D38" …` | 1 (4 fail) | FAIL (correct) |
| GREEN R10-R11 (9e2a17e7) | `node --test …/stack-*.test.cjs` | 1 (only HAND_ONLY keys left) | PASS for the rule (correct) |
| GREEN goldens (77614b14) | `node --test …/stack-*.test.cjs …/adopt-*.test.cjs` | 0 (1195/1195) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none | - | not_available (no lint command in this repo) |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` (+ adopt-*) | 0 (1195/1195) | PASS |
| wave | `npm test` | 1 (MA-7 only) | PASS apart from the known environmental MA-7 |

**`npm test` totals (final run, after the ROADMAP update):** 8597 tests, 8564 pass, 1 fail, 32 skipped, 0 cancelled.
- The one failure is `MA-7 doctl auth init` (handoff-e2e PTY mock). It is environmental and was named by the orchestrator as known pre-existing.
- The first full run, before the docs fix and the ROADMAP update, had 3 failures: MA-7; `dispatch-completeness` test 5, which my CLAUDE.md clause caused (see Deviation 6) and which is now fixed; and `E2E1 roadmap reconcile`, whose only drift was the `43-06` ROADMAP checkbox, cleared by `roadmap update-job-progress 43`.
- One full stack-* run had a load-induced hang: `CLI: stack verify --run (test 3)` took 329 s and failed. Alone it passes in 177 ms, and it passed in every later full run.

## Discovered commands

None.

## Follow-ups (not in this TRD's files)
- 43-03 left `agents/verifier.md` (~line 321) and `workflows/verify-objective.md` (~line 143) still describing the key-links payload without `unchecked` and the string-link entries. Neither file is in 43-06's list, so both are untouched.
- `verify artifacts` still skips string artifact items silently (noted by 43-03).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. All 11 shapes equal their override modulo HAND_ONLY. HAND_ONLY started at exactly the user's two keys, and the 10 additions are listed with reasons. No rule names a repo and fixture content is invented. CHANGELOG and CLAUDE.md are updated. `npm test` result: see above.
- Gate failures: None beyond the known environmental MA-7.

## Self-Check: PASSED

- Files: stack-golden-fixtures.cjs, stack-drafter-golden.test.cjs, CHANGELOG.md and CLAUDE.md all FOUND.
- Commits: 71acf0f0, 84588fa0, 54da814b, 030ed34c, b884752b, caddcd4e, fa8d62be, fb7f561a, 6fce7ec9, 9658a0df, 9e2a17e7, 77614b14 and 03bc7c60 all FOUND.
- stack-draft.cjs still requires neither `fs` nor stack-profile.cjs (D20).
- `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs`: 14/14, 11 goldens green.
