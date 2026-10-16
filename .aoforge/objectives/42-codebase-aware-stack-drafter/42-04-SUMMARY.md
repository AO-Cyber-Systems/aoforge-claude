---
objective: 42-codebase-aware-stack-drafter
trd: "04"
job: 42-04
subsystem: stack-drafter
tags: [makefile, taskfile, justfile, package-json, task-runners, static-parse, hasTarget]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: none (wave 1, independent of 42-01 and 42-03)
provides:
  - "stack-runners.readRunners(root, {maxDepth, exec}) -> targets[] with logical body lines and root-runnable invocations"
  - "stack-runners.hasTarget(root, {runner, dir, name}) -> true | false | 'unknown' for 42-06 command verification"
  - "RUNNER_FILES and SKIP_DIRS exports"
  - "hand-built fixture module for Makefile / Taskfile / justfile / package.json / bin scripts repos"
affects: [42-06, 42-07]

tech-stack:
  added: []
  patterns:
    - "pure structural reader: fs/path only, no process spawn; optional enrichment only through an injected exec"
    - "indentation line reader for Taskfile YAML (no yaml-lite), unknown shapes skipped"
    - "hasTarget three-valued answer: 'unknown' when includes/imports make the static parse incomplete"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-runners.cjs
    - plugins/devflow/devflow/bin/lib/stack-runners.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-runner-fixtures.cjs
  modified: []

key-decisions:
  - "Non-root invocations are runnable from the repo root for every runner, not only make: `make -C d t`, `task -d d t`, `just --justfile d/justfile t`, `npm --prefix d ...`, `pnpm -C d ...`, `yarn --cwd d ...`, `bun --cwd d run ...`, `./d/bin/x.sh`"
  - "bun always uses `bun run test` (`bun test` is bun's own runner and ignores the package.json script)"
  - "runner is 'npm' for the whole npm family; the inferred manager is the extra `manager` field. hasTarget accepts npm, pnpm, yarn and bun as the runner spelling"
  - "hasTarget returns 'unknown' for Taskfile `includes:` and justfile `import`/`mod` (same reasoning as Makefile `include`), and for an unrecognised runner"
  - "Conventional script target `name` is the path inside dir (`bin/test.sh`), since bin/test.sh and scripts/test.sh can coexist; `dir` is the base directory"
  - "Extras only where they apply: cwd (task dir:), manager (npm), executable (script), via:'exec' (names found only by injected exec)"

patterns-established:
  - "Bodies are raw logical lines (continuations joined, @/-/+ prefixes stripped, comments dropped); classification stays in 42-07 via stack-shell + stack-classify"

requirements-completed: [SDR-02, SDR-01]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 30min
completed: 2026-09-28
tokens_input: 10562130
tokens_output: 118467
tokens_cache_read: 10356159
tokens_cache_write: 205842
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 42 TRD 04: Task-runner reader (Make / Task / just / npm-family / conventional scripts) Summary

**A pure static reader that returns Makefile, Taskfile, justfile, package.json and bin/scripts targets with their logical bodies and repo-root-runnable invocations, plus a three-valued `hasTarget` (true / false / 'unknown') for command verification.**

## Performance

- **Duration:** about 30 min of active work (the executor was resumed once after a turn limit)
- **Started:** 2026-09-29T02:29:01Z
- **Completed:** 2026-09-29 (UTC)
- **Tasks:** 3 of 3
- **Files created:** 3 (stack-runners.cjs 897 lines, stack-runners.test.cjs 721 lines, stack-runner-fixtures.cjs 292 lines); none modified

## Accomplishments

- Makefile reader: root and one level down, recipe bodies with `\` joins and `@`/`-`/`+` prefixes stripped; `.PHONY`, other special targets, variable assignments (`:=`, `::=`, `?=`, `+=`, `=`), pattern rules and `$(...)` targets are not targets; `define` blocks skipped; recipes require a leading tab. Non-root targets invoke as `make -C <dir> <t>`.
- Taskfile reader (indentation reader, not yaml-lite): `:` in task names, `cmd:` / `cmds:` (scalar, flow list, block list, `- cmd:`, `- task:` -> `task other`, block-scalar items), `aliases:` (flow and block), task `dir:` as `cwd`, anchors and comments, unknown shapes skipped.
- justfile reader: recipes with params and `@` prefix, dependencies, `alias a := b`, continuations, shebang recipes; `set`/`export`/`import`/`mod`/`[attr]` lines are not recipes; subshell fan-out bodies preserved.
- package.json scripts with manager inferred from the same-directory lockfile (pnpm > yarn > bun > npm); conventional `bin/` and `scripts/` `.sh` files (test, build, lint, verify, check, fmt, format, e2e) surfaced as `./<path>` targets with an `executable` flag and the first 40 non-comment lines.
- Optional exec enrichment (`task --list-all --json`, `just --dump --dump-format json`) only through an injected synchronous `exec`; adds names missed statically (marked `via: 'exec'`), merges aliases, swallows ENOENT / bad payloads. Tests never spawn a real binary.
- `hasTarget` for make, task, just, the npm family and scripts; dir spellings normalised; a dir that escapes the repo answers false.
- The module requires only `fs` and `path` (asserted by a test), so it stays independent of 42-03 in the same wave.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Runner fixtures + Makefile reader + hasTarget | `node --test plugins/devflow/devflow/bin/lib/stack-runners.test.cjs` | 0 (16 tests) | PASS |
| 2: Taskfile + justfile readers with optional exec enrichment | `node --test plugins/devflow/devflow/bin/lib/stack-runners.test.cjs` | 0 (32 tests) | PASS |
| 3: npm-family manager detection + conventional scripts | `node --test plugins/devflow/devflow/bin/lib/stack-runners.test.cjs` | 0 (47 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/stack-runners.test.cjs` | 1 (MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN (task 1) | same | 0 | PASS (correct) |
| RED (task 2) | same | 1 (14 failing) | FAIL (correct) |
| GREEN (task 2) | same | 0 | PASS (correct) |
| RED (task 3) | same | 1 (13 failing) | FAIL (correct) |
| GREEN (task 3) | same | 0 | PASS (correct) |
| REFACTOR (JSDoc only) | same | 0 | PASS (correct) |

Test-list mapping: cases 1-3, 9, 11 in task 1; 4-6, 10 in task 2; 7-8 in task 3. Each numbered case has extra edge-case tests (`1b`, `2c`-`2f`, `3b`-`3d`, `5b`-`5f`, `6b`-`6d`, `7b`-`7g`, `8b`-`8g`, `9b`-`9c`, `10b`-`10e`).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | n/a | n/a |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (214 tests after task 1) | PASS |
| build | none | n/a | n/a |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test` | 1 (only the known handoff-e2e failure) | PASS (expected) |

Wave gate totals: tests 4325, pass 4292, fail 1, skipped 32, cancelled 0. Baseline before this TRD was tests 4278, pass 4245, fail 1, skipped 32, so the delta is exactly the 47 new tests, all passing. The single top-level failure is the pre-existing `handoff pipeline - PTY-path mock auth (TRD 19-05)` suite (its `MA-7 doctl auth init ...` test), unrelated to this TRD. The worktree has no node_modules, so the run used `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules`; nothing was installed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bun test invocation**
- **Found during:** Task 3
- **Issue:** The TRD says `test` -> `<mgr> test`. For bun that runs bun's built-in test runner and never looks at the package.json `test` script, so the drafted command would be wrong.
- **Fix:** bun uses `bun run test` (and `bun run <name>` for the rest); npm, pnpm and yarn follow the TRD.
- **Files modified:** plugins/devflow/devflow/bin/lib/stack-runners.cjs, stack-runners.test.cjs (test 7c)
- **Commit:** 969372a

**2. [Rule 2 - Missing critical functionality] Root-runnable invocations for non-root targets of every runner**
- **Found during:** Tasks 2 and 3
- **Issue:** The TRD only specifies `make -C <dir> <target>`. A `task test`, `just test` or `npm run build` for a target in a subdirectory would run the root's target (or fail) when executed from the repo root, which is how invocation is consumed.
- **Fix:** `task -d <dir> <t>`, `just --justfile <dir>/justfile <t>`, `npm --prefix <dir>`, `pnpm -C <dir>`, `yarn --cwd <dir>`, `bun --cwd <dir> run`, `./<dir>/bin/x.sh`. Root targets keep the plain forms from the TRD.
- **Commits:** 864025e, 969372a

**3. [Rule 2 - Missing critical functionality] 'unknown' also for Taskfile includes, justfile import/mod, unrecognised runners**
- **Found during:** Task 2
- **Issue:** The TRD only requires 'unknown' for include-expanded Makefiles. The same false `target_missing` would follow for Taskfile `includes:` and justfile `import`/`mod`.
- **Fix:** hasTarget returns 'unknown' when a name is not found statically and the file includes others; it also returns 'unknown' for a runner it does not read.
- **Commit:** 864025e

### Additions beyond the TRD (no behaviour change to specified cases)

- Extra target fields: `cwd` (task `dir:`), `manager` (npm family), `executable` (script), `via: 'exec'`.
- Extra exports `_parseMakefile`, `_parseTaskfile`, `_parseJustfile` for inline-string unit tests (the TRD recovery note suggested splitting the Taskfile reader if it grew).
- exec may return a string, Buffer or `{ stdout }`; private just recipes from the JSON dump are skipped.

### Process note

The preflight `exec-context check` was first run from the main checkout's cwd instead of the worktree, which recorded a 42-04 claim on `/Users/justin/dev/devflow-claude`. It was released with `exec-context release --repo /Users/justin/dev/devflow-claude --id 42-04` and re-run from the worktree, where it passed with `checkout` = the worktree.

## Issues Encountered

- The first background `npm test` run had no `node_modules` in the worktree. It was stopped and re-run with `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules`, as instructed by the orchestrating session. Nothing was installed.

## Notes for consumers (42-06, 42-07)

- `body` is raw logical lines; run it through `stack-shell.normalizeScript` and `stack-classify` in 42-07.
- `hasTarget(root, {runner, dir, name})`: `runner` in make | task | just | npm | pnpm | yarn | bun | script; `name` for scripts is the path inside `dir` (`bin/test.sh`). 'unknown' means unverifiable, not missing.
- `collectEvidence` in stack-evidence.cjs is untouched; its existing tests stay green.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (Makefile bodies and `make -C`; Taskfile names/cmd/cmds/aliases; justfile recipes with params and `@`; package.json manager from lockfile; conventional scripts; optional exec enrichment; hasTarget with 'unknown' for includes)
- Gate failures: none attributable to this TRD (only the pre-existing handoff-e2e MA-7 failure)

## Commits

- 49be0fb test(42-04): add failing tests for Makefile runner reader and hasTarget
- 66c9994 feat(42-04): read Makefile targets with recipe bodies and answer hasTarget
- e8e350f test(42-04): add failing tests for Taskfile and justfile readers and exec enrichment
- 864025e feat(42-04): read Taskfile and justfile targets with optional injected-exec enrichment
- f4794e3 test(42-04): add failing tests for npm-family manager detection and conventional scripts
- 969372a feat(42-04): read package.json scripts with lockfile-inferred manager and conventional bin/scripts
- 1cd4079 refactor(42-04): document runner target shape and extras in readRunners JSDoc

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-runners.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-runners.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-runner-fixtures.cjs
- FOUND: all seven commits above on branch df/exec-42-04 (`git log 51cf0b3..HEAD`)
- stack-evidence.cjs and stack-evidence.test.cjs are untouched; STATE.md and ROADMAP.md are not edited (the orchestrator updates them after merging the wave)
