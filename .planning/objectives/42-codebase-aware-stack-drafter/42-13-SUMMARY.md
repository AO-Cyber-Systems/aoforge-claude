---
objective: 42-codebase-aware-stack-drafter
trd: "13"
job: 42-13
subsystem: stack-drafter
tags: [stack-runners, stack-classify, stack-evidence, stack-draft, stack-init, gap-closure]
requires: ["42-04", "42-07", "42-12"]
provides:
  - "stack-runners targets[].deps / isDefault / order (Make, Taskfile, justfile; npm + scripts carry the neutral values)"
  - "stack-classify.testBreadth(inv) -> { breadth, reason, fitsKey, detail, tool } over the TEST_BREADTH per-tool spec table"
  - "stack-evidence items: bodyInvocations[] on every item; target { name, deps, isDefault, dependedOn, order } on runner/manifest items"
  - "stack-draft: narrow-test filtering (narrow / breadth-unknown notes), canonical runner ranking for build/test/lint (alternate notes)"
affects: ["42-11 rollout re-run"]
tech-stack:
  added: []
  patterns:
    - "tool knowledge as data: per-tool arg spec (value flags, compile-only, run-filter, tags + tagMode, defaults, stopAt) in stack-classify; stack-draft only reads testBreadth results"
    - "canonical tuple inserted after the source rank and gated to build/test/lint; source order within a runner file replaces the alphabetical index as the tiebreak"
key-files:
  created:
    - .planning/objectives/42-codebase-aware-stack-drafter/42-13-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-runner-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-runners.cjs
    - plugins/devflow/devflow/bin/lib/stack-runners.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
decisions:
  - "Only a spec `defaults` positional is broad (go: none, `.`, `./...`; dart/flutter also `test/`; pytest also `tests/`). A package sub-tree (`./pkg/x/...`) is narrow single-path. The first cut exempted `X/...`; the real ao-terminal preview then drafted `go test ./pkg/aoegress/...`, so the exemption was removed (TRD rule taken literally)."
  - "go `-tags` narrows only for an integration/e2e tag (build tags ADD files); dart/flutter `-t/--tags` and pytest `-m` are selections and narrow unless negated (`not …`)."
  - "A templated/variable positional (`{{args}}`, `$(PKGS)`) is pass-through and never narrows, so `test *args: dart test {{args}}` stays broad."
  - "Canonical tuple order: [source] + [bare name, default target, depended-on, `:` segments, variant token] + [confidence, weak] + source order in the same file. Confidence sits after the canonical tuple (so a hint-only `build:backend` beats a high-confidence `build:agent:internal`) but before source order."
  - "The canonical tuple applies to any item carrying `target` (runner AND manifest/package.json items), still only within one source rank."
  - "Alternates are emitted only when the chosen candidate is itself a runner/manifest target, and only for later-ranked candidates that `verify` resolves."
  - "A CI step that calls a runner target (or a readable wrapper script) carries that body as bodyInvocations, so `make test` -> `go test -c …` is judged narrow too."
  - "`order` (position in the runner file) was added to stack-runners targets: readRunners output is sorted by name, so without it the source-order tiebreak would be alphabetical."
metrics:
  duration: "~1h15m"
  completed: 2026-09-29
  tasks: 3
  files: 11
---

# Objective 42 TRD 13: Broad repo-wide `test` and canonical runner targets Summary

This TRD closes two gaps from the 42-11 dry-run review:

- **G2.** A narrow CI command (compile-only `go test -c -o …`, `-run`, an integration tag, one package or sub-tree) can no longer become the repo-wide `test`. Each narrow candidate is now a `narrow` note under the key it fits.
- **G3.** Task-runner picks for build/test/lint are now canonical. On ao-terminal, `task build:backend` now wins over `task build:wsh:internal`, and every losing target is listed as an `alternate` note.

## HAND-OFF (required)

**42-11 Task 1 must be RE-RUN to regenerate 42-ROLLOUT.md (the current dry-run table predates 42-12/42-13) before the Task 2 checkpoint is re-presented.**

## What changed

### stack-runners.cjs (Task 1)
- **Make.** Prerequisites become `deps`, including order-only ones after `|`. A target-specific variable line such as `test: X += y` is not treated as a prerequisite list. The default target is `.DEFAULT_GOAL` (any assignment operator), else the first target whose name does not start with `.`. `_parseMakefile().targets` keeps its `{ name, body }` shape; `deps` and `defaultGoal` are returned alongside it.
- **Taskfile.** `deps:` is read in flow form (`[a, "b"]`, `{task: c}`) and in block form (`- x`, `- task: x` with `vars:` under it). The `default` task is the default.
- **justfile.** Dependencies after the recipe colon are read as `gen`, `(lint "strict")` or post-dependencies after `&&`. The default is the recipe named `default`, else the first recipe.
- **Every target** now carries `deps`, `isDefault` and `order`. For npm scripts and script files the values are `[]`, `false` and their index.

### stack-classify.cjs (Tasks 1 and 3)
- `testBreadth(inv)` returns `{ breadth, reason, fitsKey, detail, tool }`. It returns null when the invocation is not a test runner.
  - It reads the `TEST_BREADTH` table: go, gotestsum (args after `--`), dart, flutter, the npm/pnpm/yarn/bun test verb, jest, vitest, pytest, cargo and ginkgo.
  - Reasons, most decisive first: `compile-only`, `run-filter`, `tag`, `suite-path`, `single-path`.
  - `fitsKey` is `integration` or `e2e` when a tag or path segment names that suite (`integration_test` counts as e2e, the Flutter convention). Otherwise it is `test`.
- These flags never narrow: `-race`, `-short`, `-count`, `-v`, `-timeout`, `-json`, `-coverprofile`, and non-suite `-tags`.

### stack-evidence.cjs (Task 1)
- Every item has `bodyInvocations`:
  - a runner target's normalised recipe;
  - for a CI or docs step that calls a runner target or a readable script, that body;
  - otherwise `[command]`.
- Runner and manifest items carry `target: { name, deps, isDefault, dependedOn, order }`. `dependedOn` is true when another target in the same file lists this name (or one of its aliases) in `deps`.

### stack-draft.cjs (Task 2)
- **`test`.** A candidate is narrow when some invocation in its body is narrow and none is broad.
  - Narrow candidates are removed before selection and become `narrow` notes under `fitsKey`. They never create a new command key.
  - If none remain, a runnable parent `test` is inherited; a single non-root area keeps its `cwd`. With no parent test, the key becomes `discover`.
  - A chosen test whose breadth cannot be read is kept and noted `breadth-unknown`.
- **build/test/lint.** Candidates are ordered by the canonical tuple (see decisions). `VARIANT_TOKENS` is data at the top of the module.
- **Alternates.** When a runner target wins, every later-ranked runner candidate that `verify` resolves becomes `note(c, key, 'alternate', 'canonical pick: <chosen>')`.
- Non-runner source order (declared > runner > ci > manifest > docs) is unchanged, and so are other keys. No existing assembleDraft or e2e expectation changed.

### Fixtures and e2e (Task 3)
- `terminalShape()` is a git-backed, ao-terminal-shaped repo with invented names:
  - `.gitignore: dist/`, with a tracked `dist/scaffoldapp/go.mod`;
  - `frontend/` and `docs/` package.json files;
  - a Taskfile with `build:agent:internal` listed first (a real `go build`, depended on by the `build:agent` fan-out), `build:agent:quickdev`, `build:backend` (a `task:` fan-out that `package` depends on), `build:frontend`, `build:macos` and `dev`;
  - `guard.yml` running `go test -c -o /tmp/guard.test ./tests/guard/` and `go test ./pkg/guardnet/...`.
- **e2e 11** checks: `extends: go`, no `dist/` component, no `test` key, `build = task build:backend`, `narrow` notes for both guard commands, an `alternate` note for `task build:agent:internal`, `validation.ok`, and notes present in the `--raw` output.
- **RED proof for e2e 11.** The test was run against the base-commit lib (3f633f1) in a scratch copy. It failed with `test = go test -c -o /tmp/guard.test ./tests/guard/`, the observed ao-terminal gap.

## Real-repo smoke: ao-terminal (read-only)

`node plugins/devflow/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/ao-terminal stack init --raw`. No `--write` was used, and `git -C ao-terminal status --porcelain` was unchanged (only the pre-existing `?? .planning/.progress-guard.json`).

| Key | Before 42-13 | After 42-13 |
|---|---|---|
| components | `tsunami/` (go) (no `dist/`, fixed by 42-12) | `tsunami/` (go), no `dist/` |
| build | `task build:wsh:internal` | **`task build:backend`** (20 alternates noted) |
| test | `go test -c -o /tmp/egress.test ./tests/egress/` | **`npm test`** (see finding below) |
| typecheck / deps / codegen / tidy | `task check:ts` / `task docs:npm:install` / `task generate` / `go mod tidy -diff` + `task go:mod:tidy` | unchanged |

Narrow notes (8):
- compile-only: `go test -c -o /tmp/egress.test ./tests/egress/`
- run-filter (×2): `go test ./tests/egress/ -run TestLayer3SandboxCanary …`
- single-path: `go test ./pkg/aoegress/...` and `go test -tags egressnegtest ./pkg/aoegress/...`
- single-path, from TESTING.md: `go test ./pkg/ijson/...`, `./pkg/aiusechat/...`, `./pkg/filestore/...`

### Finding for the 42-11 re-run (not fixed here)
- `test` now resolves to `npm test`, the root `package.json` running `vitest`.
  - It is broad, so it meets the TRD's verification bar ("no `test` override (or a broad one)").
  - It only covers the frontend, and it replaces the go profile's `go test -race ./...`.
- It wins because the manifest source rank (3) beats the docs `go test ./...` from TESTING.md (4). Every CI Go test candidate is now correctly narrow.
- Preferring the extended tier's ecosystem for `test` in a mixed-language root area would be a new ranking policy that no TRD specifies, so it was left alone. The rollout reviewer should decide per repo, or plan a follow-up TRD.
- The alternate list for `build` is long on a large Taskfile (20 entries). It is correct, but noisy in the notes block.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Package sub-tree treated as broad**
- **Found during:** Task 3 (real-repo smoke)
- **Issue:** My first cut exempted `X/...` patterns from narrowing, reading the must-have "a single package/file path". ao-terminal then drafted `test = go test ./pkg/aoegress/...`.
- **Fix:** Only spec `defaults` are broad; any other positional is `single-path`. The ginkgo `-r` exemption was removed for the same reason. `./cmd/...` moved from the broad to the narrow table. The shape was added to `terminalShape()`, as the TRD recovery rule asks.
- **Files modified:** stack-classify.cjs, stack-classify.test.cjs, stack-drafter-fixtures.cjs, stack-drafter-e2e.test.cjs
- **Commits:** 7337758 (RED), be9e261 (GREEN)

### Scope notes (no extra files touched)
- **Extra target field.** `order` was added to runner targets beyond the TRD's `deps`/`isDefault`. Without it, the "source order" tiebreak would have been alphabetical.
- **Manifest items in the canonical tuple.** Manifest (package.json) items carry `target` and take part in the canonical tuple. It is still applied only within one source rank.
- **CI bodies.** CI and docs steps that call a runner target or a script carry that body as `bodyInvocations`. The TRD said `[command]`; the body gives strictly more signal and is `[command]` when no body is readable.
- **Task 3 e2e was not a fresh RED.** It passed first time on the Tasks 1-2 lib, so its RED was proven against the base-commit lib in a scratch copy, as described above.
- All edits stayed inside `files_modified`. No 42-12 file was touched (stack-detect, stack-report and stack-profile are unchanged).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: runner deps/isDefault + testBreadth + evidence metadata | `node --test stack-runners.test.cjs stack-classify.test.cjs stack-evidence.test.cjs` | 0 (294/294) | PASS |
| 2: narrow-test filtering + canonical ranking | `node --test stack-draft.test.cjs` | 0 (38/38) | PASS |
| 3: ao-terminal-shaped e2e | `node --test stack-*.test.cjs adopt-*.test.cjs` | 0 | PASS |
| 3: sub-tree fix | `node --test stack-classify.test.cjs stack-drafter-e2e.test.cjs stack-draft.test.cjs` | 0 (275/275) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED T1 | `node --test stack-runners/classify/evidence.test.cjs` | 1 (67 fail / 227 pass) | FAIL (correct) |
| GREEN T1 | same | 0 (294 pass) | PASS (correct) |
| RED T2 | `node --test stack-draft.test.cjs` | 1 (13 fail) | FAIL (correct) |
| GREEN T2 | same | 0 (38 pass) | PASS (correct) |
| RED T3 (base lib) | e2e 11 against the 3f633f1 lib copy | 1 | FAIL (correct) |
| RED T3b | `--test-name-pattern "guardnet\|cmd/...\|ao-terminal-shaped"` | 1 (4 fail) | FAIL (correct) |
| GREEN T3b | classify + draft + e2e | 0 (275 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs'` | 0 | PASS |
| build | `df-tools --cwd ao-terminal stack init --raw` (read-only) | 0 | PASS: G1-G3 closed (see finding) |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm --prefix <worktree> test` | 1 (tests 5029, pass 4996, fail 1, skipped 32) | PASS: only the known handoff-e2e MA-7 fails (baseline 4942/4909/1/32; +87 tests) |

## Post-TRD Verification

- Auto-fix cycles used: 1 (sub-tree narrowing)
- Must-haves verified: 7/7
- Gate failures: none beyond the known handoff-e2e MA-7 (PTY-path mock auth). The run finished before this SUMMARY existed, so roadmap-reconcile E2E1 was green. It may flip once this SUMMARY lands with ROADMAP unticked, which is expected until the orchestrator ticks it after merge.

## Self-Check: PASSED

- Files: all 11 files_modified exist and are committed; this SUMMARY is at `.planning/objectives/42-codebase-aware-stack-drafter/42-13-SUMMARY.md`
- Commits on df/exec-42-13: d13a0ad, 687f8d0, 91d8c55, 0408837, 1141798, 7337758, be9e261
