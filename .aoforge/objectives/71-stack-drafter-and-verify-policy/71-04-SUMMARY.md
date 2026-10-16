---
objective: 71-stack-drafter-and-verify-policy
trd: "04"
subsystem: stack-verify
tags: [stack-verify, run-policy, build-outputs, effect-guard, flutter-component]

requires:
  - objective: 71-stack-drafter-and-verify-policy
    provides: 71-03 `gitRepo` fixture and the `--raw` suffix order (`run=`, `services=allowed`) this TRD extends
  - objective: 43-stack-verify-run-guard
    provides: the effect guard (`snapshotTree`/`diffTree`/`restoreTree`/`guardEffects`) this TRD narrows for build outputs
provides:
  - "A `build` gate's new, untracked, unignored files under bin/ build/ dist/ out/ target/ (relative to its cwd) are removed, listed in `run.build_outputs`, kept in `run.mutated`, and do not halt the root"
  - "`--raw` appends ` build_outputs=<n>` after ` mutated=<n>`"
  - "`RUN_POLICY.buildOutputDirs`, frozen"
  - "`componentRepo({ rootFiles, component })` fixture: a non-Dart root beside a Flutter component with a resolved package config"
affects: [71-05-dogfood-and-docs, stack-report]

tech-stack:
  added: []
  patterns:
    - "partition the effect-guard delta (outputs vs others) and halt only on the others or on a failed restore"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs

key-decisions:
  - "Only `build`, only `added` (new to HEAD), only the five directory names, judged on the first path segment relative to the gate's cwd; a modified, deleted or staged-tracked path is never an output"
  - "An output is removed like any other change (stack verify stays read-only); the emptied directory stays because removeNonDir never removes a directory, and git does not list an empty directory"
  - "The halt detail names the first non-output path; an output that could not be removed halts too (run.restored false)"

patterns-established:
  - "Raw suffix order: run=, services=allowed, mutated=, build_outputs="

requirements-completed: [SDR-10]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-08
tokens_input: 7125589
tokens_output: 34625
tokens_cache_read: 7000306
tokens_cache_write: 125165
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 71 TRD 04: A build's own output is restored and reported, not a reason to stop other components' gates Summary

**`stack verify --run` now removes and reports a `build` gate's untracked output under `bin/ build/ dist/ out/ target/` as `build_outputs` without halting the root, so another component's Flutter/Dart gates still run.**

## Progress
- [x] Task 1: Fixture builder for a root build beside a Flutter component — aea0da13
- [x] Task 2: Build outputs are restored, reported and do not halt (in-process) — RED 0752c625, GREEN 5d31ce74
- [x] Task 3: The CLI shows build outputs and runs the other component's gate — RED c869f273, GREEN 1241b09e

## Accomplishments

- `stack-verify.cjs`: `RUN_POLICY.buildOutputDirs` (frozen), `isBuildOutput(it, d)` and a `guardEffects` that partitions the delta. Outputs go to `run.build_outputs` and still appear in `run.mutated`; `ctx.halted` is set only when a non-output path changed or the restore did not fully succeed, and its path is the first non-output path. The module header, the `guardEffects` and `runCommands` doc comments and the `rawTable` doc comment state the rule.
- `rawTable`: ` build_outputs=<n>` after ` mutated=<n>`.
- Fixture: `componentRepo({ rootFiles, component })` (a root `.gitignore` of `.dart_tool/` only, so `bin/` is untracked AND unignored; a Flutter component whose ignored `.dart_tool/package_config.json` exists).
- The objective 43 follow-up situation is case 1 through the spawned CLI: root `build` writes `bin/app`, the `client/` Flutter component's `lint` and `format` gates run (`lint@client/ resolved run=0`), and `git status --porcelain` is identical before and after.

## Task Commits

1. Task 1: `aea0da13` test(71-04): component repo fixture for build outputs
2. Task 2: `0752c625` test (RED), `5d31ce74` feat (GREEN)
3. Task 3: `c869f273` test (RED), `1241b09e` feat (GREEN)

## Deviations from Plan

### Auto-fixed Issues

None.

### Differences from the written steps

- **RED expectations (Task 2).** The TRD predicted case 6 would already pass at RED. It asserts `build_outputs: ['bin/app']`, so it failed at RED like 3, 4, 5a and 10. Cases 5b, 7, 8 and 9 passed at RED as predicted (they pin that only outputs are exempt).
- **RED expectations (Task 3).** Case 2 (JSON) already passed at RED because Task 2's GREEN had added `run.build_outputs`; only case 1 failed, on exactly the missing ` build_outputs=1` suffix. This is the order the TRD's task split implies.
- **Hermetic `dart` stub (Task 3).** The `flutter` profile's `format` gate is `dart format --output=none --set-exit-if-changed .`. Left unstubbed, the CLI test would run a real `dart` where one is installed and exit 1 (`binary_missing`) where it is not. Case 1/2 put a no-op `dart` stub beside `fakebuild` and `flutter` on PATH.
- **Case 5 split.** Written as `5a` (cwd `svc`, an output) and `5b` (cwd `''`, not an output) so each half fails and passes on its own.

### Process notes

- One early `state advance-job --objective 71` ran before the SUMMARY was posted (it derives from the files on disk, including my checkpoint SUMMARY); it was run again after the post. Its first edits to `.planning/STATE.md` and `.planning/state.json` were left uncommitted until the final commit.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: componentRepo fixture | `node --test .../stack-verify-run-guard.test.cjs .../stack-verify-services.test.cjs` (34 tests); `node -e` check: `git status --porcelain` empty, `client/.dart_tool/package_config.json` exists and is untracked | 0 | PASS |
| 2: in-process cases 3-10 | `node --test .../stack-verify-run-guard.test.cjs .../stack-verify.test.cjs .../stack-verify-services.test.cjs` (147 tests) | 0 | PASS |
| 3: CLI cases 1-2 | `node --test .../stack-verify-run-guard.test.cjs .../stack-cli.test.cjs` (46 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test .../stack-verify-run-guard.test.cjs` | 1 | FAIL (correct): 3, 4, 5a, 6, 10 fail; 5b, 7, 8, 9 and the existing 1-7d and CLI 12 pass |
| GREEN (task 2) | `node --test .../stack-verify-run-guard.test.cjs .../stack-verify.test.cjs .../stack-verify-services.test.cjs` | 0 | PASS (correct) |
| RED (task 3) | `node --test --test-name-pattern="CLI: build outputs" .../stack-verify-run-guard.test.cjs` | 1 | FAIL (correct): case 1 lacks ` build_outputs=1`; case 2 passes |
| GREEN (task 3) | `node --test .../stack-verify-run-guard.test.cjs .../stack-cli.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the suites above | 0 | PASS |
| test (full) | all `npm test` globs minus `micro.test.cjs`, `DEVFLOW_SKIP_FLEET_HARNESS=1` | 1 | 11350 pass, 11 fail, 50 skipped; none caused by this TRD (below) |

The 11 full-suite failures are the same set as the 71-03 baseline:

- 10 in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs`: the daemon needs `node-pty`, and this worktree has no `node_modules`. They pass in the main checkout. Neither file is touched here; I did not start devflow-watch.
- 1 in `roadmap-reconcile.test.cjs` E2E1: the repo-wide ROADMAP drift check saw this TRD's SUMMARY before its ROADMAP box was ticked; `roadmap update-job-progress 71` clears it.

## Discovered commands

None: every command came from the stack profile.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (truth 1: cases 3, 4, 5a and 6; truth 2: CLI case 1; truth 3: cases 5b, 6, 7, 8 and the unchanged test 5; truth 4: case 9 and test 6; truth 5: case 10 and the header paragraph)
- Gate failures: 10 environmental (`node-pty` missing in this worktree), 1 transient (E2E1, cleared by the roadmap update). None in a file this TRD touches.
- `rg -n "buildOutputDirs|isBuildOutput|build_outputs" stack-verify.cjs` hits the policy, the predicate, `guardEffects` and `rawTable`.

## Self-Check: PASSED

The three modified files exist; commits aea0da13, 0752c625, 5d31ce74, c869f273 and 1241b09e are in `git log`; every task has its verify evidence above.
