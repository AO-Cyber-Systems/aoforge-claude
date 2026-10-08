---
objective: 42-codebase-aware-stack-drafter
trd: "06"
job: 42-06
subsystem: stack-drafter
tags: [stack-verify, command-verification, deny-policy, run-policy, body-expansion]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-01 STACK_EXTENSIONS lazy dispatch for `stack verify`, 42-03 stack-shell.normalizeScript, 42-04 stack-runners.readRunners/hasTarget"
provides:
  - "stack-verify.verifyCommand(cmd, {root, cwd, env, home, which, fs}) -> {status, detail, tool}: resolved | binary_missing | target_missing | script_missing | unverifiable"
  - "stack-verify.resolveBinary(name, {env, home, fs}): PATH plus GOPATH/bin, ~/go/bin, ~/.local/bin, ~/.maestro/bin, mise shims"
  - "stack-verify.RUN_POLICY + runCommands(items, opts): safe-key executor with a deny policy applied to the command AND its expanded body"
  - "stack-verify.verifyStack / cli: `df-tools stack verify [--run] [--include] [--keys] [--timeout] [--draft]`"
  - "fixture module: fakeBin/fakeHome stub dirs, verifyRepo, bodyRepo"
affects: [42-07, 42-11]

tech-stack:
  added: []
  patterns:
    - "refuse-unless-proven-safe: deny regexes run over the command and over every body/script it would run; anything unprovable is refused as unverifiable-body"
    - "one-level expansion: runner body -> wrapper script scanned; script -> nothing further expanded"
    - "injectable which/fs/spawn; tests use stub executables on a fake PATH, never real tools"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
  modified: []

key-decisions:
  - "stack-profile.cjs is not edited: 42-01's STACK_EXTENSIONS dispatch loads stack-verify.cjs lazily, and stack-verify requires stack-profile lazily inside verifyStack (no load-time cycle)"
  - "Default output is JSON; `--raw` prints the compact `key[@component] status` table (Task 3 spec). The Test-list text says `--raw` gives JSON, which conflicts with the raw-table spec; the raw table won"
  - "Refusal reasons: policy skips are not-included / not-selected / key-not-runnable / never-run-key / mutating-form / no-command / not-resolved / cwd-outside-repo; body refusals are body:<deny-reason> and unverifiable-body; a release- or server-named runner target is deploy-target / server-target"
  - "Precedence when several findings apply: deny > name-deny > unverifiable-body > skip; a body deny beats the target-name deny, so `make deploy-check` reports body:kubectl-apply"
  - "Opt-in keys are always gated by --include, even when named in --keys; --include cannot promote a non-opt-in key (fix, tidy) to runnable"
  - "Component views report only commands they override (compared with the root's command object), so inherited commands are not repeated per component; cwd is renderCommand's, as-is (undefined today, 42-05 will set it)"

patterns-established:
  - "Static resolution outranks nothing: a command whose static check is *_missing is never spawned (`not-resolved`)"

requirements-completed: [SDR-03]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 2 sessions (turn-limited; resumed once)
completed: 2026-09-28
tokens_input: 9778470
tokens_output: 159667
tokens_cache_read: 9459121
tokens_cache_write: 319230
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 42 TRD 06: Command verification (`stack verify [--run]`) Summary

**Deterministic resolvability check (binary / make-task-just target / npm script / wrapper script) plus an opt-in `--run` executor that refuses anything on a deny list, including what a make/task/just target, npm script or wrapper script would run.**

## Commits

| Phase | Commit | Message |
|---|---|---|
| Task 1 RED | 529a79a | test(42-06): add failing tests for stack-verify static resolver |
| Task 1 GREEN | be4e2c0 | feat(42-06): add stack-verify static resolver (verifyCommand, resolveBinary) |
| Task 2 RED | 810ce6a | test(42-06): add failing tests for stack-verify --run policy and executor |
| Task 2 GREEN | a1495f9 | feat(42-06): add stack-verify --run policy, body expansion and executor |
| Task 3 RED | 4ce84ac | test(42-06): add failing tests for the stack verify CLI |
| Task 3 GREEN | 656285f | feat(42-06): add stack verify CLI (static, --run, --draft, components) |

## What was built

- **Static resolver.** `verifyCommand` normalises with `stack-shell.normalizeScript`, checks the first invocation, and also every make/task/just/npm-family token in a compound command. The worst status wins (`*_missing` > `unverifiable` > `resolved`). Runner targets use `stack-runners.hasTarget`; an include-expanded Makefile yields `unverifiable`, never `target_missing`. It also covers `cd`, env prefixes, `npx` (installed, declared, else `unverifiable`/low), `go run <path>`, `bash x.sh` (existence only), `./x.sh` (existence plus the exec bit), and shell builtins such as `test -z "$(gofmt -l .)"`, which check the inner tool. Command text that normalises to nothing is `unverifiable`, never `resolved`.
- **`--run` policy.** Default keys `format lint typecheck build`; opt-in `test e2e audit sast lint_helm lint_docker`; never `codegen deps` or any `*.apply` key or apply-form command. 23 deny regexes (git/docker/kubectl/helm/terraform/gh/goreleaser/npm/pub/cargo/python/gem/maven/deploy CLIs, servers/watchers, container run, `--push`, and any `8080` -> `port-8080-forbidden`). `docker build` is skipped as `container-build`.
- **Body expansion, before any spawn.** The deny/skip regexes run over the raw text of the command, of the body of every make/task/just target and npm-family script it invokes (plus npm `pre<name>`/`post<name>` hooks), and of every wrapper script (`./x.sh`, `bash x.sh`, `bin/x`), including wrappers referenced from inside a runner body. Expansion is one level: a runner body's wrapper is scanned, but anything a wrapper or a runner body invokes beyond that (another script, another runner target, `$(MAKE) x`) is refused as `unverifiable-body`.
- **Executor.** `spawnSync('sh', ['-c', cmd])` with an injectable spawn, per-item timeout (`--timeout`, else the profile `timeout_s`, else 300 s), `killSignal: SIGKILL`, stdin ignored, last-40-line tail. A timeout records `{exit_code: null, timed_out: true}` and the batch continues.
- **CLI.** `--run`, `--include`, `--keys`, `--timeout`, `--draft`. Read-only in both modes: `--draft` verifies `initProfile({write:false})`; `.planning/STACK.md` is never created. Exit 1 when any command is missing or a run failed; `discover`, `none` and `unverifiable` do not fail.

## Deviations from Plan

### Auto-fixed / auto-added (Rules 1-3)

**1. [Rule 2 - Missing critical safety] Prerequisites, opaque constructs and launchers are treated as unexpandable**
- **Found during:** Task 2 design; the launcher gap was found after the Task 3 GREEN work.
- **Issue:** the TRD's one-level expansion reads only target bodies, but three other things run code the body scan cannot see.
  - **Prerequisites:** make `build: push`, just `build: gen`, and Taskfile `deps:` run other targets first.
  - **Constructs stack-shell drops or hides:** `$(GO) push`, `source x.sh`, `eval`, a shell fed a heredoc, command substitution running a script, and a Taskfile `defer:` line.
  - **Launchers:** `timeout 60 ./scripts/release.sh`, `nice make build`, `doppler run -- ./x.sh`.
- **Fix:**
  - Any target with prerequisites or `deps:` is refused as `unverifiable-body`.
  - Any command starting with an expansion, and `source`, `.`, `eval`, heredoc-into-shell and command substitution that runs a script or runner, are refused as `unverifiable-body`.
  - A Taskfile task's raw YAML block is deny-scanned, so `defer:` lines are seen.
  - Launchers (`timeout nice ionice xargs stdbuf setsid caffeinate watch unbuffer chronic`, and `doppler dotenv direnv mise asdf op aws-vault` with or without `--`) are unwrapped, and `sh -c '<string>'` is analysed recursively.
- **Files modified:** stack-verify.cjs, stack-verify.test.cjs. All inside the TRD's `files_modified`.
- **Commits:** a1495f9 (policy), 656285f (launchers).

**2. [Rule 2 - Missing critical safety] Wrapper scripts are read in full through `fs`, not through `readRunners` script entries**
- **Issue:** `readRunners` script entries keep only conventionally named scripts, drop comments and truncate to 40 lines, so a `git push` on line 50 would be missed. The TRD allows "readRunners' script entries when present, else fs".
- **Fix:** always read the whole file (up to 1 MiB; a binary or larger file is `unverifiable-body`). `readRunners` (maxDepth 2) is used only to find runner targets and their bodies.

**3. [Rule 3 - Ambiguity] `--raw` output**
- The Test list says `stack verify --raw` gives JSON; Task 3 says the raw value is a compact `key status` table. The CLI prints JSON by default and the table under `--raw`; the tests parse JSON without `--raw` and check the table separately.

**4. [Rule 1 - Test defects, fixed in the tests]**
- **Real tools on the test PATH:** an early CLI test PATH included `/bin:/usr/bin`, which leaked the real `make`, so the `binary_missing` cases resolved. `runVerify` now uses only the stub dir plus an `sh` symlink, and the slow stub is a shell-builtin busy loop (no `sleep` on that PATH).
- **Wrong fixture for `npm run build`:** a "safe commands" row used `npm run build` in an empty repo, where "no target to expand" is correctly `unverifiable-body`. The row was removed; `npm run check` covers the clean-npm case against a real fixture.

### Known limits (documented, not weakened)

- `unverifiable-body` refuses, by design, gates whose Makefile uses `include` or `$(MAKE)`/prerequisite chains, and gates that start with a variable such as `$(GO) test`. The result carries `skipped: 'unverifiable-body'` so 42-11 can count them.
- Wrapper scripts run by a non-shell interpreter (`node scripts/x.js`, `python x.py`) are not expanded; only their command text is scanned.
- Deny-list false positives refuse rather than run, on purpose. A target named for a release or server (`build-release`, `run`) is refused by name unless its body already reveals a more specific deny reason. A `-l label=x` argument to `kubectl get` matches the `kubectl ... label` mutation regex. Test names containing `dev` (`npm run build:dev`) match the server regex.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures + static resolver | `node --test plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` (37/37 after GREEN) | 0 | PASS |
| 2: --run policy and executor | `node --test plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` (68/68 after GREEN) | 0 | PASS |
| 3: `stack verify` CLI | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (662/662) | 0 | PASS |

`stack-verify.test.cjs` ends at 88 tests, 0 skipped.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED T1 | `node --test .../stack-verify.test.cjs` (module absent) | 1 | FAIL (correct) |
| GREEN T1 | same | 0 | PASS (correct) |
| RED T2 | same (68 tests, 31 failing) | 1 | FAIL (correct) |
| GREEN T2 | same (68/68) | 0 | PASS (correct) |
| RED T3 | same (86 tests, 17 failing) | 1 | FAIL (correct) |
| GREEN T3 | same (88/88, incl. the launcher rows added afterwards) | 0 | PASS (correct) |

The launcher-wrapper rows were added after the Task 3 RED commit and failed (87/88) before the unwrap fix, then passed (88/88).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | n/a | n/a |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (662 tests, 662 pass) | 0 | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs stack verify --raw` in the worktree: `test resolved` (npm test); `build/lint/format/fix/typecheck/codegen none`; `audit discover`; `git status --porcelain` clean | 0 | PASS |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test`: 4749 tests, 4716 pass, 1 fail, 32 skipped | 1 | PASS (only the known failure) |

Baseline at WAVE_BASE was 4661 tests, 4628 pass, 1 fail, 32 skipped; the delta is the 88 new tests. The single failure is the pre-existing `handoff pipeline - PTY-path mock auth (TRD 19-05)` suite (MA-7), untouched. No roadmap-reconcile failure appeared.

## Flutter/other gates

Not applicable (`type: standard`).

## Post-TRD Verification

- Auto-fix cycles used: 0 (the test-defect fixes above were corrections during GREEN, not gate failures)
- Must-haves verified: 7/7
  - `verifyCommand` statuses and detail.
  - Binary lookup dirs.
  - `hasTarget` and `unverifiable` handling.
  - `stack verify` / `--run` JSON with no file written.
  - Deny policy on the command and the expanded body.
  - Safe-key policy.
  - `--draft`.
- Gate failures: None beyond the known MA-7 baseline failure

## Self-Check

Files exist (checked below) and all six commits are on `df/exec-42-06`.

## Self-Check: PASSED
