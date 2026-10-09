---
objective: 43-stack-drafter-rules
kind: plugin
work: bugfix
status: registered
milestone: v1.4
requirements: [SDR-08, SDR-03]
gap_closure: v1.4-MILESTONE-AUDIT
---

# Objective 43 — Stack drafter rules (follow-up to 42)

Registered 2026-09-29. Objective 42's two gap cycles were exhausted with 11 fleet drafts still wrong; the user chose to hand-fix those rows for the rollout (`42-codebase-aware-stack-drafter/overrides/*.STACK.md` are the expected outputs) and fix the drafter here so future `stack init` / `/devflow:adopt` runs produce them unaided.

## Gap closure (v1.4 audit, 2026-10-01)

Promoted from registered candidate to the v1.4 gap-closure objective by `milestones/v1.4-MILESTONE-AUDIT.md`. It closes:

- **SDR-08** (partial: 3/33 fleet repos ran `stack verify --run`) via defects 8 and 10.
- **SDR-03 hardening**: `--run` safety must be effect-based, not key-based (defect 8), with a post-run porcelain delta guard inside `runCommands` and a stub-`flutter` regression fixture.
- Objective 42 truth "real-repo drafts are correct without hand edits" (partial) via defects 1-7.
- 42 debt: defects 9 and 11.

Re-audit after completion: `/devflow:milestone audit`.

## Defects (each override file is a golden fixture shape — hand-build fixtures, don't copy repo content)

1. **Aggregate targets rejected as off-stack.** A root task-runner target whose body fans out to backend + frontend (devflowops `make build/test/lint`: `build: frontend backend`) is classified `off_stack` and dropped; the drafter then picks a CI variant (`go build -o gitea_no_gcc`) or a single leg (`make lint-spell`). Aggregate targets that include the primary stack must win.
2. **Sub-area filter only protects Go roots.** In a `general` root with components, sub-area commands still become root keys (aocore `build=bash portal/build.sh`, politihub `build=./build.sh @infra/tiles`). Root keys for a multi-stack root should come from the primary component's runner (e.g. `make build @go`) or stay absent.
3. **Root without a manifest takes a single subfolder's language.** devcluster (bash + one Go tool) and EdenDocs (C++/JS autotools + a Go sidecar) drafted `extends: go` with every command in the subfolder. No root manifest ⇒ `extends: general` + the subfolder as a component.
4. **Environment/scenario targets proposed as test/e2e/build.** eden-biz `e2e=make e2e-stack-up` (brings up a live stack), EdenDocs `build=wopi-e2e.sh`, eden-biz `test=` a single migration-check script. Classify stack bring-up / scenario scripts into their own keys, never `test`/`build`.
5. **Internal Taskfile tasks verified as resolvable.** `internal: true` tasks (ao-terminal `go:mod:tidy`, `npm:install`) can't be invoked from the CLI but `stack verify` reports `resolved`. Treat them as `target_missing` (not invocable) and never propose them.
6. **Thin coverage when a justfile/Makefile recipe wraps a component command.** navigators `just test-go` (`cd navigators-go && go test ./...`) and aodex `go/Makefile` targets were dropped, leaving only e2e / `discover`.
7. **`df-tools commit` gitignore check is directory-level** (misses a `.planning/` rule when the dir has tracked files) — same fix as 42-12's file-level preflight.
8. `stack verify --run` safe keys are not read-only: `flutter analyze --fatal-infos` rewrites analysis_options.yaml (adds analyzer.exclude) and runs an implicit pub get that bumps pubspec.lock. Run Flutter/Dart gates with `--no-pub` / against a temp copy, or refuse them under --run.

9. **`stack mcp` drops Flutter tools in mixed Flutter + pure-Dart repos.** The `dart` server entry is keyed once, so the pure-Dart component's `--disable flutter` args win and the Flutter MCP tools (hot_reload, widget_inspector, dtd) are disabled for the Flutter component. Flutter args must win when any component is Flutter. (Found by 42-VERIFICATION.)
10. **Run the gates for real.** After defect 8 is fixed, do a read-only `stack verify --run` pass over the 30 fleet repos that were only resolve-checked in 42-11, and record results in each STACK-REPORT.md (42-VERIFICATION gap 2).
11. **`df-tools verify artifacts` can't parse `must_haves`** in objective 42's TRDs, so the verifier had to check artifacts by hand.

## Success

Re-drafting each of the 11 override repos' shapes from fixtures yields commands equivalent to the override files; the full fleet dry run shows no row needing a hand-fix.
