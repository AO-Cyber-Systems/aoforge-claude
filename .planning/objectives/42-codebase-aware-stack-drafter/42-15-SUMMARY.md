---
objective: 42-codebase-aware-stack-drafter
trd: "15"
job: 42-15
subsystem: stack-drafter
tags: [stack-init, root-override, d3, gap-closure, e2e]
requires: ["42-13", "42-14"]
provides:
  - "stack-classify.toolStack / TOOL_STACKS / TIER_STACKS / NEUTRAL_STACK"
  - "stack-evidence item.bodyStacks / bodyScopes / effectiveArea (nested runner calls followed)"
  - "stack-draft root-override policy: off_stack / sub_area / mixed_stack notes"
  - "D1-D5 end-to-end suite (e2e 12-17) over git-backed invented shapes"
affects: ["42-11"]
tech-stack:
  added: []
  patterns:
    - "tool -> stack knowledge is data in stack-classify; stack-draft only consumes toolStack/TIER_STACKS"
    - "placement by where a body RUNS (effectiveArea), not where the command is invoked"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
decisions:
  - "D3 gate: for a key the extends profile supplies with a runnable run, a root candidate overrides only when some body invocation that classifies to the key runs a TIER_STACKS tool at the root (or the single area). An opaque/unknown body is non-matching. Others become off_stack notes, and the default applies."
  - "Placement uses effectiveArea for every key. An unsupported sub-area is one sub_area note per (area, key). A component effectiveArea gets the existing component note. So an attachable key (e2e/lint_helm/lint_docker) from an unsupported sub-area is no longer placed at the root."
  - "Nested runner calls (task:, make -C, npm --prefix), prerequisites-only targets and readable scripts are followed, bounded to depth 6 and cycle-safe. The BODY decides the stack, never the runner or the target name."
  - "Language-neutral generators (buf, protoc, sqlc) are NEUTRAL_STACK and match any tier (TRD Task 2 recovery; found by the fleet preview)."
  - "Keys the profile does not supply stay ungated (truth 4), so ao-terminal deps = `task init`: a root npm install plus go mod tidy plus the docs install. That is not the docs-only install, but it is not go-only either."
metrics:
  duration: "~1 session"
  completed: 2026-09-29
---

# Objective 42 TRD 15: Root-override policy (D3), D1-D5 end to end, 42-11 re-run hand-off Summary

Repo-root commands now cover the repo's primary stack. The drafter reads where each command's
body runs (`effectiveArea`) and which stacks it runs (`bodyStacks` / `bodyScopes`), following
nested `task:`, `make -C` and `npm --prefix` calls to the real tools. A node sub-area can no
longer take over a Go repo's root `test` or `deps`. It becomes an `off_stack` or `sub_area` note, and
the go profile's default applies. D1-D5 are proven end to end through the CLI.

## What changed

- **stack-classify.** `TOOL_STACKS` (data) and `toolStack(inv)` map go, dart, flutter, node, rust,
  python, helm, docker and neutral to their tools. `toolStack` skips a leading `VAR=` or `{{ }}` template
  token, and returns null for opaque wrappers (scripts, shells, make/task/just). Also added:
  `TIER_STACKS = { go: [go], dart: [dart], flutter: [dart, flutter] }` and `NEUTRAL_STACK`.
- **stack-evidence.** Each item's body expands into leaf "units", each an invocation plus the dir
  it runs in. The dir comes from a `cd x &&`, a Taskfile `dir:`, the `-C` / `--prefix` / `-d` of a
  runner call, a CI working-directory, or a script's cwd. Every item carries `bodyStacks`,
  `bodyScopes` and `effectiveArea`, judged over the units that classify to the item's key. If no
  unit classifies, all units are used (the "tools alone" recovery).
- **stack-draft.**
  - Placement is by `effectiveArea`:
    - root or the single area: root candidate
    - component: component note
    - unsupported sub-area: a `sub_area` note, for any key
  - For profile-supplied runnable keys, the stack gate keeps only on-stack root candidates. The
    rest get `off_stack` notes, deduplicated per command.
  - A chosen mixed body gets a `mixed_stack` note.
  - With `extends: general` or an unknown tier, the gate does nothing.
  - Items without the new fields (hand-built, pre-42-15) are read through `toolStack` over their
    body, command and tool.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The D3 gate over-blocked language-neutral codegen**
- **Found during:** Task 3 fleet preview.
- **Issue:** eden-circle and justin-donnaruma-us-go lost `codegen: make proto` (`buf generate` /
  `sqlc generate`) to `off_stack` ("tool stack unknown"). Codegen then fell back to the go
  profile's `go generate ./...`, which neither repo uses.
- **Fix:** Added `TOOL_STACKS.neutral` (buf, protoc, sqlc) and `NEUTRAL_STACK`, which the gate
  accepts for any tier. This is the TRD Task 2 recovery path: the case was added to test 13, plus
  draft test D30c and e2e 12.
- **Commits:** b5570f5 (RED), 6690677 (GREEN)

**2. [Design] Attachable keys from an unsupported sub-area are now notes**
- Truth 2 says a sub-area candidate is "never a root command for ANY key". The 42-07 rule that
  sent e2e/lint_helm/lint_docker from any non-component area to the root is therefore narrowed:
  from an unsupported sub-area they are now `sub_area` notes. Root-area attachables are unchanged
  (D32). The aocore-shaped e2e 1 already accepts a playwright note, so no existing test changed.
- In the same way, commands in unsupported areas are now `sub_area` notes, one per (area, key)
  and unverified. Before, they were per-area notes carrying a verify status.

**3. [Design] Interpretation of "script path dir"**
- A wrapper script's units run in the caller's cwd plus any `cd` inside the script. The script
  file's own directory is not used as the cwd, because shells do not chdir to it.

### Characterisation tests (green at RED time, by design)

- D30, D32 and D32b (the stack-matching override, keys the profile does not supply, and extends
  general) describe today's behaviour and must stay green.
- The Task 3 e2e suite (c369ef1) was written after the implementation landed. As a RED proof, it
  was run against the pre-42-15 `stack-draft.cjs`. 12 (D3 terminal) and 13 (D3 positive control)
  failed. 14-17 (D1/D2/D4/D5, closed by 42-14) passed, which is expected. The committed file was
  restored afterwards.

### Observations for the 42-11 re-run (not fixed here: outside 42-15's files or by design)

- **ao-terminal build notes.** `build:server:*` show `off_stack (tool stack unknown)` because
  stack-runners does not parse the nested `cmd: { cmd: …, for: … }` Taskfile form. That is a
  42-13 file. `task build:backend` still wins through `build:wsh` → `go build`.
- **ao-terminal deps.** `deps` is now `task init`, which runs a root `npm install`, `go mod tidy`
  and the docs install. `deps` is not a go-profile key, so it is ungated (truth 4). It is no
  longer the docs-only install.
- **ao-terminal test.** `test` is `go test ./...` from `.planning/codebase/TESTING.md`. That is
  a go-stack, broad override, so it is allowed.

## Real-repo read-only previews (`stack init` without `--write`, `stack report --draft --raw`)

Every preview exited 0 with `validation.ok`. `git status --porcelain` was identical before and
after for all six repos:

| Repo | Porcelain (hash, lines) |
|---|---|
| ao-terminal | c654f11232a2, 1 |
| eden-biz | bcddb5cedb10, 9 |
| eden-circle | 4258255c98dc, 36 |
| eden-libs | f4f0a6ca0388, 75 |
| quanta-local | clean |
| justin-donnaruma-us-go | clean |

Before is the 42-ROLLOUT.md row. After is this preview.

- **ao-terminal.**
  - Before: `test=npm test`, `deps=task docs:npm:install`.
  - After: `test=go test ./...` (go-stack), `deps=task init`, `build=task build:backend`,
    `codegen=task generate`.
  - Notes: `npm test` and `npm run coverage` are `off_stack`. `task docs:npm:install` and
    `task tsunami:frontend:build` are `sub_area`.
- **eden-biz.**
  - Before: root build/deps/test/lint at `eden-biz/go` and `eden-biz/flutter` cwds.
  - After: no `eden-biz/` prefix. The only cwd is `go`, for `codegen: make buf-generate`, whose
    body `cd .. && buf generate` runs at the root. Component commands are component notes.
- **eden-circle.**
  - Before: `lint=go vet ./... (cwd eden-circle)`.
  - After: no lint override (the go default applies). `build=make build`, `test=make test`,
    `codegen=make proto`.
  - `make web-e2ee-worker` (`dart compile js`) is `off_stack`.
- **eden-libs.**
  - Before: `e2e=npm run test:a11y (cwd eden-docs/e2e)`.
  - After: no cwds at all. `go vet` and `go test` in `eden-platform-go` are `cwd_nested_repo`
    notes. The e2e from the `eden-docs/e2e` sub-area is now a `sub_area` note.
- **quanta-local.**
  - Before: `test=npm test (cwd .baseline/api)`.
  - After: only `build=make build`. The test is a `cwd_ignored` note.
- **justin-donnaruma-us-go.**
  - Before: blocked, ignored check false for init.
  - After: `ignored` lists both `.planning/STACK.md` and `.planning/STACK-REPORT.md`, with two
    warnings. It stays blocked (stack-files-gitignored). `codegen=make proto` is kept. The two
    `docker build` CI steps are `off_stack`.

## 42-11 re-run hand-off

42-11 Task 1 must be RE-RUN to regenerate 42-ROLLOUT.md (the current dry run predates 42-14/42-15) before the Task 2 checkpoint is re-presented. Rows expected to change: ao-terminal (test/deps now inherit or stack-matching; off_stack/sub_area notes), eden-biz (cwds `go`/`flutter`, no `eden-biz/` prefix; sibling-checkout steps noted as external), eden-circle (lint cwd no longer `eden-circle`), eden-libs (no cwds inside eden-platform-go/ or eden-ui-flutter/ nested repos), quanta-local (no `.baseline/api` test; cwd_ignored/untracked note), justin-donnaruma-us-go (`ignored` lists both stack files; stays blocked stack-files-gitignored).

The previews above add to this list:

- ao-terminal `deps` is `task init`, not inherited. `deps` is not a go-profile key.
- eden-biz root `test` is now `./go/scripts/check-migrations_test.sh`, noted `breadth-unknown`.
- eden-libs loses its root `e2e`, which ran in the `eden-docs/e2e` sub-area.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: toolStack + evidence bodyStacks/effectiveArea | `node --test stack-classify.test.cjs stack-evidence.test.cjs` | 0 | PASS |
| 2: root-override policy in assembleDraft | `node --test stack-draft.test.cjs` | 0 | PASS |
| 3: D1-D5 e2e, previews, hand-off | `node --test lib/stack-*.test.cjs lib/adopt-*.test.cjs` | 0 (1015/1015) | PASS |

## TDD Evidence

| Phase | Commit | Command | Exit Code | Expected |
|---|---|---|---|---|
| T1 RED | c820240 | classify + evidence tests | 1 (35 fail) | FAIL (correct) |
| T1 GREEN | c81728c | same, plus the stack/adopt gate (997/997) | 0 | PASS (correct) |
| T2 RED | 2c77060 | draft tests | 1 (4 fail) | FAIL (correct) |
| T2 GREEN | 84f148d | draft (50/50), stack/adopt gate (1004/1004) | 0 | PASS (correct) |
| T3 tests | c369ef1 | e2e 12-17 against the pre-42-15 drafter | 1 (12, 13 fail) | FAIL (correct) |
| T3 tests | c369ef1 | e2e 12-17 with 42-15 | 0 | PASS (correct) |
| T3 fix RED | b5570f5 | classify + draft + e2e | 1 (6 fail) | FAIL (correct) |
| T3 fix GREEN | 6690677 | stack/adopt gate (1015/1015) | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/stack-*.test.cjs lib/adopt-*.test.cjs` | 0 (1015/1015) | PASS |
| build | `df-tools --cwd /Users/justin/dev/ao-terminal stack init` (preview) | 0 | PASS |
| wave | `NODE_PATH=… npm --prefix <worktree> test` | 1 | PASS (only the known MA-7 handoff-e2e PTY mock-auth failure) |

Full suite: tests 5110, pass 5077, fail 1 (MA-7, known), skipped 32. The baseline was
5057 / 5024 / 1 / 32, so this TRD adds 53 tests.

## Self-Check: PASSED

- Commits exist: c820240, c81728c, 2c77060, 84f148d, c369ef1, b5570f5, 6690677
- All 8 files_modified are touched. No other source file changed. ROADMAP.md and STATE.md are
  untouched, per the orchestrator protocol.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the neutral-generator over-block)
- Must-haves verified: 6/6
  - D3 policy
  - sub_area for any key
  - off_stack with inherit
  - ungated non-profile keys
  - the ao-terminal-shaped fixture
  - the D1-D5 e2e plus the hand-off
- Gate failures: none beyond the known MA-7
