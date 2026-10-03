---
objective: 43-stack-drafter-rules
verified: 2026-10-03T00:00:00Z
status: gaps_found
score: 34/36 must-haves verified
gaps:
  - truth: "Re-drafting each of the 11 override repos' shapes yields commands equivalent to the override files; the full fleet dry run shows no row needing a hand-fix (OBJECTIVE.md Success)"
    status: failed
    reason: "Real-fleet dry run: 12 conflict rows (14 drift incl. 2 more-specific). 43-06 golden suite passes only on invented fixtures; real repos expose rules the fixtures do not."
    artifacts:
      - path: plugins/devflow/devflow/bin/lib/stack-draft.cjs
        issue: "root-key selection for multi-stack roots and codegen/deps/test ranking still diverge on real evidence"
      - path: plugins/devflow/devflow/bin/lib/stack-evidence.cjs
        issue: "target/script classification diverges on real Makefiles, justfiles, workflows"
    missing:
      - "Drafter defects below (aocore, aodex, eden-biz, eden-libs, ao-terminal, aoedge, devflowops, justinforme, smartWellness)"
      - "Re-run dry run on those repos, plus politihub (skipped, HEAD moved) and refresh stale committed STACK.md for aoinference and opsCluster"
  - truth: "SDR-08: every fleet repo has a real `stack verify --run` result"
    status: partial
    reason: "32/33 recorded; politihub skipped because HEAD changed after approval. Also 19 of 98 red gates are host-toolchain or deps-not-installed (inconclusive; cgo link fails on 9 repos' build, 2 repos' test)."
    artifacts:
      - path: .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md
        issue: "politihub row is head-changed"
    missing:
      - "Re-run politihub at HEAD bede7bd6f3a9 under a fresh approval"
      - "Fix host linker (CLT vs macOS 27 SDK), install trades node_modules, re-run host-blocked rows"
---

# Objective 43: Stack drafter rules Verification Report

**Goal:** Fix the drafter defects objective 42's rollout hand-fixed so re-drafting matches the 11 override files.
**Status:** gaps_found. SDR-03 hardening is verified and effective. SDR-08 and the Success line are not met.

## What is verified

- **43-01..43-05 truths:** the named functions and rules exist and are wired (expandMakeVars and the Taskfile `internal` flag in stack-runners; snapshot/restore and the halt rule in stack-verify; e2e_env in stack-classify; pickPrimaryComponent and primary_component in stack-draft; `ignoredPaths` in the misc.cjs commit gate). All have tests.
- **43-06:** the golden suite passes on invented fixtures. HAND_ONLY governance held: 2 user-confirmed keys plus 10 additions, all accepted at the checkpoint. CHANGELOG and CLAUDE.md are updated.
- **43-07 safety (SDR-03):** across 32 repos there were 0 harness deltas, 0 unrestored mutations and no HEAD moves. This was the first live run of the effect guard on aocore, aofamily and aoid, and it held. 161 gates ran with no fleet write.
- **`npm test`:** 8564 pass, 1 fail, 32 skipped. The one failure is MA-7 doctl, the known environmental failure. No regression.

## Failed or partial

1. **Success line not met.** 12 conflict rows remain. The golden suite's pass says the drafter matches the fixtures. It does not say the drafter matches the repos.
2. **SDR-08 partial.** politihub was not run (HEAD moved). 19 red gates are inconclusive for host or deps reasons.

## Drift row classification (32 evaluated: 18 match, 14 drift)

| Repo | Class | Defect or reason |
|---|---|---|
| aoinference | stale committed file | The committed STACK.md is the 42 shape (`extends: go`, no components). 43-05 D3 supersedes it: no root-level language area means `extends: general` plus a component. The draft's `discover` for audit, fix, format and tidy is a consequence of that. Refresh the file. |
| opsCluster | stale committed file | Same as aoinference. |
| devcluster | accepted | User decision, remedy (c): `lint` and `test` stay hand-fixed. The repo has no CI workflow and `selftest.sh` needs `yq` and a gitops checkout. |
| aocore | drafter defect | `audit` drafts `scripts/govulncheck-gate.sh` instead of `govulncheck`. `build` drafts `go build -tags dev -o /tmp/dev-edge ./cmd/dev-edge`, a sub-binary, instead of `go build ./...`. `lint` drafts `go vet` instead of `golangci-lint`. `lint_helm` drafts `kubeconform -v` instead of `helm lint`. `test` drafts a CI variant with `-p 1 -skip -coverprofile -timeout 35m`. The rule that prefers a CI or narrow variant over the canonical command is wrong. |
| aodex | drafter defect | `build` drafts `discover` instead of `make build (cwd go)`: a multi-stack root with the primary component's runner is not honoured. `codegen` drafts the apply form `make openapi-regen` as the run command and drops the check form `make openapi-verify` (run and apply swapped). `audit` and `lint` are only more specific. |
| eden-biz | drafter defect | `build` drafts `make build-web (cwd flutter)`: the wrong primary component and a narrow variant. `test` drafts cwd flutter instead of go (primary choice or scope). `codegen` drafts `make buf-generate` instead of `make generate`. `e2e_env` drafts `make e2e-stack-down`: up and down are not told apart. `e2e` drafts `e2e-db-reset`: an env-prep target classified as e2e. |
| eden-libs | drafter defect | `build` drafts `just package-docs` instead of `just build-flutter-explorer`. `codegen` drafts `discover` instead of `just generate`. `format` drafts `discover` instead of the just fmt apply form. `test` drafts `dart test (cwd eden-platform-api-dart)` instead of the root `just test`: a root runner aggregate loses to a component leg. |
| ao-terminal | drafter defect | `deps` drafts `task init` (the bootstrap, already HAND_ONLY) instead of `npm ci`: a bootstrap task is ranked as deps. |
| aoedge | drafter defect | `lint` drafts `go vet ./...` instead of `make lint`: a runner target is dropped for the language default. |
| devflowops | drafter defect | `format` drafts `test -z "$(gofmt -l .)"` instead of `make fmt-check`. `tidy` drafts `go mod tidy -diff` instead of `make tidy-check`. A check-target runner is overridden by the language default, though the apply form `make fmt` is found. |
| justinforme | drafter defect | `codegen` drafts `make generate` instead of `make proto`. `e2e` `smoke-canvass` is extra and only more specific. |
| smartWellness | drafter defect | `codegen` drafts `make generate` instead of `make proto`. The canonical-ranking rule for codegen is wrong. |
| aofamily, EdenDocs | more specific only | They add `deps`, `build` or `lint` where the reviewed file had `discover`. No hand-fix needed. |
| politihub | not evaluated | HEAD moved after the plan was pinned. |

Grouped root causes:
- (a) a language-default or CI-variant command beats an authored runner target: aocore, aoedge, devflowops, eden-libs.
- (b) the primary component or scope is wrong for a multi-stack root: aodex, eden-biz, eden-libs.
- (c) codegen target choice (generate vs proto) and run/apply inversion: aodex, eden-biz, justinforme, smartWellness.
- (d) env and e2e subclassification (up vs down, prep vs e2e): eden-biz.
- (e) bootstrap ranked as deps: ao-terminal.

## Anti-patterns

None blocking in the changed code. The 43-06 verification relied on fixtures the author invented, which cannot expose rules a real repo needs.

## Functional verification

Skipped. This is a CLI objective. The fleet dry run in 43-ROLLOUT.md is the runtime evidence.

## Deployment verification

not_available (not a deployable service).

## Human verification

None remaining beyond the decisions above: whether to fix the drafter (a new TRD for classes a-e) or accept hand-fixes, and the refreshed STACK.md for aoinference and opsCluster.

_Verifier: Claude (verifier)_
