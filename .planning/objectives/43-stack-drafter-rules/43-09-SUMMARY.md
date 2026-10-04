---
objective: 43-stack-drafter-rules
trd: "09"
job: 43-09
subsystem: stack-drafter
tags: [stack, drafter, drift-check, ci-env, makefile, realshape, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-08 compareDrift, real-fleet harness and KNOWN_DRIFT ratchet; 43-06 rules R1-R11"
provides:
  - "realshape fixture module + suite (real evidence shapes, invented content), extended by 43-10..43-13"
  - "Makefile rule lines: a `;` after an unescaped `#` is comment text, never an inline recipe"
  - "driftCheckAt: captured `$(git diff …)` and mktemp-snapshot `diff -q` checks read from raw recipe text"
  - "checkFormByName: a body-classified writer under a check-suffixed target name is the key's check form"
  - "stack-ci: workflow/job/step `env:` literals substituted into run lines; steps carry `envSubstituted`"
  - "version/presence probes (`<tool> -v`, `--version`, `version`) are never gate evidence"
affects: ["43-10", "43-11", "43-12", "43-13"]
tech-stack:
  added: []
  patterns:
    - "Realshape fixtures: reproduce a surveyed fleet row's evidence SHAPE with invented names and bodies; RED must equal the real repo's wrong draft"
    - "Drift checks that normalise to nothing are read from the raw recipe text, accepting `$$` and `$`"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-runners.cjs
    - plugins/devflow/devflow/bin/lib/stack-runners.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
key-decisions:
  - "A captured `git diff` counts only when the `-n`/`-z` test reads the captured variable (or wraps the capture inline) and a failing exit follows; a recipe that only shows a diff is not a check"
  - "A snapshot operand is a mktemp-assigned variable, a tmp/snap-named variable, `/tmp/…`, or a `snapshot(s)` directory; the other operand must be an in-tree path"
  - "Env values are substituted only when literal (no `$`, backtick, quote or backslash); a runtime value at an inner level hides the outer literal; variables assigned in the run block or exported to $GITHUB_ENV by an earlier step of the job are never substituted"
  - "A double-quoted word is unquoted only when it held a substitution and is left a shq-safe word, so unrelated quoting in currently matching drafts is untouched"
  - "`-v` stays verbose (not a probe) for runners whose bare invocation runs the suite: pytest, py.test, ginkgo, mypy"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 25min
completed: 2026-10-03
---

# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

**The drafter now reads captured-`git diff` and mktemp-snapshot `diff -q` check targets, check-suffixed generator targets, workflow `env:` literals and install-step version probes the way a reviewer does, closing devflowops.format, devflowops.tidy, aodex.codegen and aocore.lint_helm with no other fleet row moving.**

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — 3a5dee4b
- [x] Task 2 RED: K27 (isDriftCheck raw shapes, driftCheckAt) and E22 (check suffix on writer bodies, captured and snapshot checks) — a625034b
- [x] Task 2 GREEN: captured and snapshot drift checks are the check form; body-key check suffix — cddc1cc3
- [x] Task 3 RED: C14 env substitution, K28 version probes, contract test re-baselined for `envSubstituted` — 8163ec76
- [x] Task 3 GREEN: workflow env literals substituted; version probes are not gates — 741e9ae1
- [x] Fixture text: realshape lines that echoed fleet text rewritten with invented content (shape kept; RED at the wave base re-proved) — 3678f7c7

## Surveyed evidence shape per rule (read-only, 2026-10-03)

Each realshape fixture was built from the survey with invented names, paths, bodies and workflow text. Each one went RED with exactly the wrong draft the real repo produced, which shows the shape was reproduced.

| Rule | Fleet row | Surveyed shape | Fixture | RED draft (fixture = real repo) |
|---|---|---|---|---|
| Help comment `;` | eden-biz e2e_env noise | `e2e-stack-down: ## … (…); idempotent` + a tab recipe; `e2e-db-reset: ## …; biz-api stays up` | unit tests 2p-2r | body units `["idempotent", "bash …"]` |
| Captured diff | devflowops.format, .tidy | `fmt:` = `go run <batch>.go … -w '{file-list}'` + `$(eval …)` + `sed -i` (no gofmt); `fmt-check: fmt` = `diff=$$(git diff --color=always …); if [ -n "$$diff" ]; then …; exit 1; fi`; `tidy:` = `$(GO) mod tidy -compat=…` + `$(MAKE) <license file>`; `tidy-check: tidy` = same captured diff; CI only runs `make --always-make checks-backend` (an aggregate with both checks as prerequisites) | `captureDiffCheckShape` | `test -z "$(gofmt -l .)" (apply: make fmt)`, `go mod tidy -diff (apply: make tidy)` |
| Snapshot verify | aodex.codegen | `general` root, `go/` + `flutter/`; `go/Makefile` `openapi-regen` (`GOTOOLCHAIN=$(X) go generate ./api/...`) and `openapi-verify`, one multi-line recipe: `tmp=$$(mktemp -d) && cp … $$tmp/ && … go generate … && if ! diff -q $$tmp/a a … \|\| ! diff -q …; then …; cp back; rm -rf; exit 1; fi`; CI runs `make openapi-verify` in `go`; flutter CI runs build_runner | `snapshotVerifyShape` (`schema-regen` / `schema-verify`) | `make schema-regen (cwd go)` |
| Env + probe | aocore.lint_helm | workflow `env: CHART_DIR: helm/<chart>` beside a version pin and sha; install step `curl …; sha256sum -c; tar -xzf; sudo install …; kubeconform -v`; `helm lint "${CHART_DIR}/"`; `helm template "${CHART_DIR}/" -f … > rendered.yaml`; `kubeconform -strict … rendered.yaml`; a scope job with step `env:` `${{ }}` values | `workflowEnvChartShape` | `kubeconform -v` (and a `-v` evidence item) |

## The fmt-check / tidy-check drop cause

Their recipe (`out=$$(git diff …); if [ -n "$$out" ]; then echo …; exit 1; fi`) normalises to no invocation at all: an assignment, an `if`, `echo` and `exit`. `driftCheckOf` only searched the normalised invocations for `git diff --exit-code`, so it returned null. `classifyTarget` then hit `if (body.length && b.empty) return null`, so the target produced no evidence item and the draft fell back to the go tier. `classifyHint` already gave format/check and tidy/check, but it was never reached. The fix reads the raw recipe text (`driftCheckAt`) before that return.

## What was built

- **stack-runners.cjs** — `makeCommentAt` and `makeInlineSemi`: a rule line's `;` starts an inline recipe only before the first unescaped `#` (GNU make's own rule). Applied in `makePrereqs` and the rule parser. `t: dep ; echo x # c` keeps `echo x # c`. An escaped `\#` is not a comment.
- **stack-classify.cjs**
  - `driftCheckAt(text)`: the raw-text drift checks, with `$$` or `$`. (a) A captured `git diff` (in `$( )` or backticks, `git -C dir diff` included) whose variable a `-n`/`-z` test reads, or which sits inline in that test. (b) `diff`/`cmp` (`-q -u -s -r` or no flag) of a snapshot path against an in-tree path. Both need a failing exit after them (`exit <n≠0>`, `exit $rc`, `false`). The function returns where the check statement starts.
  - `isDriftCheck` accepts these shapes for a string.
  - `checkFormByName`: `hintForm` for a body-decided writer under a check-suffixed name.
  - `isVersionProbe` runs in `classifyOne` before the table, so no row (kubeconform's bare-tool row, kubectl's e2e_env row) can claim a probe.
- **stack-evidence.cjs** — `driftCheckOf(t, body, cwd, index)` takes the raw body. When no `git diff --exit-code` invocation is found, it uses `rawDriftCheck`: the earlier recipe lines plus the check line's own prefix, with the dangling `&& if !` trimmed. It then looks for a writer there, or else in a prerequisite. `classifyTarget` applies `checkFormByName` to the body result.
- **stack-ci.cjs**
  - Workflow, job and step `env:` (block and flow) literals are collected.
  - `substituteEnv` is quote-aware: single quotes are literal, `\$` stays, and only `$NAME` and `${NAME}` are replaced. Outside quotes a value must be a safe word. A double-quoted word that held a substitution and is left a safe word is unquoted.
  - Precedence is step, then job, then workflow.
  - Names assigned in the run block, and names an earlier step of the job wrote to `$GITHUB_ENV`, are runtime and never substituted.
  - Steps carry `envSubstituted: [names]`.
- **Realshape module + suite** — `REALSHAPE = { name: { build, tools, expect, absent, extraAllowed, noEvidence } }`. The suite asserts:
  - compareDrift has no row (conflict or more_specific) outside `extraAllowed`;
  - `absent` keys are not drafted;
  - no evidence item runs a `noEvidence` command;
  - the draft validates.

  A table guard requires every shape name to end in `Shape` and to carry no FLEET repo name.

## KNOWN_DRIFT before and after

| Before (43-08 seed) | After (43-09) |
|---|---|
| devflowops: format, tidy (43-09) | removed (entry gone) |
| aodex: codegen (43-09); build (43-10) | aodex: build (43-10) |
| aocore: lint_helm (43-09); lint, audit (43-12); build, test (43-13) | aocore: lint, audit (43-12); build, test (43-13) |
| every other entry | unchanged |

Rows I could not close: none. No other row was reported as closed by the ratchet, and no new conflict appeared. The more-specific diagnostics are identical to the 43-08 baseline in every repo except eden-biz `e2e`, which is still more specific. That row changed from `draft only make e2e-db-reset` to `draft only make e2e-build-web (cwd flutter)` because the help-comment fix removed the fake `biz-api stays up` unit from `e2e-db-reset`. eden-biz's e2e_env row (43-11) still conflicts: the draft now has no e2e_env, against the committed `make e2e-stack-up`. It stays in KNOWN_DRIFT for 43-11, and the `idempotent` noise it depended on is gone.

## Re-baselined tests

- **stack-ci.test.cjs C11 "step records carry exactly the contracted fields"** — the field list gains `envSubstituted`, and the test asserts it is `[]` for a step with no env. Reason: TRD 43-09 adds the field to the step record so a report can say which env names were substituted. This is the same kind of change as 42-14 adding `checkouts` and `external`.

No other assertion changed. stack-classify K25d ("isDriftCheck is `git diff` with --exit-code or --quiet, nothing else") keeps its exact assertions and still passes. Its title predates the raw-text shapes, which K27 covers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The captured-diff rule accepted any `-n`/`-z` test in the text**
- **Found during:** Task 3 (reviewing the Task 2 diff before the final run)
- **Issue:** `d=$(git diff); echo "$d"; [ -n "$KEY" ] || exit 1` read as a drift check, although the test reads another variable.
- **Fix:** `captureIsTested` requires the emptiness test to read the captured variable (`$X`, `$$X`, `${X}`), or the capture to sit inline in the test. Added the negative to K27c.
- **Files modified:** stack-classify.cjs, stack-classify.test.cjs
- **Commit:** 741e9ae1

**2. [Rule 1 - Bug] Some realshape fixture lines were too close to fleet text**
- **Found during:** final review against the binding rule "copy no line or name from a fleet repo".
- **Issue:** Several lines in the first fixture version kept fleet wording:
  - workflowEnvChartShape: the kubeconform tarball name, the `sudo install -m 0755 … /usr/local/bin/…` line, the `sha256sum -c -` line, the `ci/test-values.yaml` path and the `grep -c '^kind:'` echo;
  - captureDiffCheckShape: `--no-print-directory`, `--always-make` and the `grep -Eo` version probe;
  - snapshotVerifyShape: `GOTOOLCHAIN=$(…) go generate ./api/...` and the `api/` paths.
- **Fix:** Rewrote those lines with invented text: `wget`/`shasum`/`sudo mv`, `values-smoke.yaml`, `make -s`, `make -B`, `awk`, `GOFLAGS=$(GEN_FLAGS) go generate ./wire/...`, and a `wire/` package. The structural tokens stay: a bare `kubeconform -v` after the install, the env-quoted `helm lint`, the captured `git diff` with `-n` and `exit 1`, the mktemp snapshot with `diff -q` and `exit 1`, and the aggregate CI target.
- **Proof the shape held:** The rewritten fixtures and suite were copied into a `git archive` extract of the wave base (422f2300) and run there. All three went RED with exactly the real repos' wrong drafts. On the current tree they are GREEN.
- **Files modified:** `__fixtures__/stack-realshape-fixtures.cjs`
- **Commit:** 3678f7c7

### Interpretations

1. **Test names.** The TRD's unit items are named by suite: runners 2p-2r (2g-2o were taken), classify K27 (drift shapes) and K28 (probes), evidence E22, ci C14.
2. **Extra negatives.** These pin the conservative edges:
   - K27c: `|| true` is not a failing exit; neither side is a snapshot; not a git diff; another variable;
   - K28b: `pytest -v`, `ginkgo -v`, `go test -v ./...` still classify;
   - E22d: `build-verify` stays a build, and `fmt-show` (shows a diff, never fails) is not evidence;
   - C14: `$GITHUB_ENV` exports, single quotes, metacharacters keep the quotes.
3. **`$GITHUB_ENV` exports** (from error_recovery): a name an earlier step of the same job writes to `$GITHUB_ENV` is runtime for the rest of that job. Another job is unaffected.
4. **No separate RED commit for the help-comment unit tests.** TRD step 5 names one commit (`fix(43-09): …`). Test 2p was run RED before the fix (output in TDD Evidence). The task's RED commit is the realshape scaffold 633bbd2c.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: realshape + harness | `node --test …/stack-drafter-realshape.test.cjs` (3 shapes fail with the real repos' drafts) / `node --test …/stack-drafter-fleet.test.cjs` (fails on exactly aocore.lint_helm, aodex.codegen, devflowops.format, devflowops.tidy) | 1 / 1 | PASS (RED is the expected result) |
| 1 GREEN: help comments | `node --test …/stack-runners.test.cjs` (73 of 73) | 0 | PASS |
| 1 done check | read-only `stack init` on eden-biz: `make e2e-stack-down` body is `["bash flutter/web_e2e/scripts/e2e-stack-down.sh"]` (no `idempotent`) | 0 | PASS |
| 2 GREEN | `node --test …/stack-classify.test.cjs …/stack-evidence.test.cjs …/stack-drafter-realshape.test.cjs …/stack-drafter-fleet.test.cjs` (realshape items 2-3 and harness devflowops/aodex green; only the Task 3 targets red) | 1 | PASS for Task 2 scope |
| 3 GREEN | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (1271 of 1271) | 0 | PASS |
| fixture text | rewritten realshape suite run inside a `git archive` extract of 422f2300 (3 shapes RED with the real repos' drafts) / on HEAD (4 of 4) | 1 / 0 | PASS |
| 3 done check | read-only `stack init` on aocore: lint_helm evidence is `helm lint helm/aocore-gateway/` plus the two `kubeconform -strict` runs; no `-v` item; draft `lint_helm: helm lint helm/aocore-gateway/` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test …/stack-drafter-realshape.test.cjs` | 1 (3 fail) | FAIL (correct) |
| RED (T1 unit) | `node --test --test-name-pattern="2[pqr]\." …/stack-runners.test.cjs` | 1 (2p fails; 2q, 2r pin unchanged behaviour) | FAIL (correct) |
| GREEN (T1) | `node --test …/stack-runners.test.cjs` | 0 | PASS (correct) |
| RED (T2) | `node --test --test-name-pattern="K27\|E22" …` | 1 (6 fail; K27c, E22d negatives pass) | FAIL (correct) |
| GREEN (T2) | same, plus realshape items 2-3 | 0 | PASS (correct) |
| RED (T3) | `node --test --test-name-pattern="K28\|C14\|contracted fields" …` | 1 (7 fail; K28b passes) | FAIL (correct) |
| GREEN (T3) | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (1271 of 1271) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none defined for this repo | - | not_available |
| scoped | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (1271 of 1271) | 0 | PASS |
| stack-* | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` (1180 of 1180: 1158 + 22 new) | 0 | PASS |
| golden | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` (14 of 14) | 0 | PASS |
| fleet | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (36 of 36) | 0 | PASS |
| test | `npm test` after `roadmap update-job-progress 43`, run on 741e9ae1 and again on 3678f7c7 (8673 tests: 8640 pass, 1 fail, 32 skipped) | 1 | the one failure is MA-7 (doctl PTY, known environmental); E2E1 did not fail |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - help-comment `;`;
  - captured and snapshot diffs as the check form;
  - check suffix on a body writer;
  - env literals with quote handling and runtime values left alone;
  - version probes never evidence;
  - realshape per rule, with KNOWN_DRIFT minus exactly four rows and every matching repo still matching.
- `grep -nE "aocore|aodex|devflowops|eden-biz"` over stack-runners, stack-ci, stack-classify and stack-evidence finds no match in the 43-09 diff. stack-draft.cjs still requires only stack-classify.cjs (D20), and stack-profile.cjs is untouched (P11).
- The fleet repos were read-only. Each harness run asserts that HEAD and porcelain are unchanged. Every manual `stack init` ran without `--write`.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs (KNOWN_DRIFT without the four rows)
- FOUND commits: 633bbd2c, 3a5dee4b, a625034b, cddc1cc3, 8163ec76, 741e9ae1, 3678f7c7
- Untracked docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md and objectives/*/.gitkeep were not staged
