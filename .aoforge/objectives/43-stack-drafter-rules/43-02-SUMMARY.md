---
objective: 43-stack-drafter-rules
job: 43-02
subsystem: stack-profile
tags: [stack-verify, run-guard, git, flutter, dart, side-effects, tdd]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: stack-verify.cjs runCommands/RUN_POLICY and the key allow list this TRD hardens
provides:
  - "stack verify --run snapshots the git work tree around every spawned command and restores what it changed"
  - "run.mutated / run.restored / run.unrestored / run.mutated_unknown / run.rewritten report fields"
  - "halt rule: one mutation skips the remaining Dart/Flutter items in the root as side-effect-unsafe"
  - "--no-pub prevention for single direct flutter analyze|test, with needs-pub-get instead of pub get"
  - "side-effect-unproven refusal of Dart/Flutter gates outside a git work tree"
affects: [43-07, stack-verify, stack-drafter]

tech-stack:
  added: []
  patterns:
    - "effect guard authoritative, key policy and --no-pub only reduce how often it fires"
    - "compare content hashes of every porcelain-listed path, never status codes"
    - "git calls go through opts.git || spawnSync, never opts.spawn"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs

key-decisions:
  - "Hash with one git hash-object --no-filters --stdin-paths call, falling back to a git-compatible blob SHA-1 in node only for paths containing a newline"
  - "A path clean before the run is restored with git checkout HEAD -- <p> (which also resets a staged index); a path dirty before is rewritten from bytes saved before the run (<= 1 MB)"
  - "Dart/Flutter detection covers dart, flutter, fvm, puro, melos, very_good and dcm, looking through env/sudo/time prefixes, cd chains, launchers and sh -c"
  - "needs-pub-get looks next to the command cwd, and for a pub-workspace member (resolution: workspace) climbs to the workspace root's package config"

requirements-completed: [SDR-03, SDR-08]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-03
tokens_input: 9334056
tokens_output: 96456
tokens_cache_read: 9129209
tokens_cache_write: 204729
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 02: Effect-based `stack verify --run` guard Summary

**`stack verify --run` now snapshots the git work tree (porcelain `-z -uall` plus a content hash per listed path) before and after every spawned gate, restores any changed path byte-exact including pre-dirty user edits, halts the remaining Dart/Flutter gates in the root, and prevents flutter's implicit `pub get` with `--no-pub`.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-03T14:57:23Z
- **Completed:** 2026-10-03T15:11:00Z
- **Tasks:** 2 of 2 (plus one small follow-up commit, see Deviations)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Reproduced objective 42's incident against a real spawn: a stub `flutter` that appends `analyzer.exclude` to a pre-dirty `analysis_options.yaml` and rewrites `pubspec.lock` is detected, both files are restored byte-equal, the user's uncommitted edit survives, `git status --porcelain` is identical before and after, and the second flutter item is skipped without the stub running a second time.
- The guard is tool-agnostic (a non-flutter `sh -c 'echo x >> README.md'` is reported and restored) but only Dart/Flutter items are halted afterwards, and gitignored writes (`build/`, `.dart_tool/`) are never reported.
- Edge cases covered with real git: added (untracked and staged) files, deleted tracked files, a command that reverts the user's pre-dirty edit, a pre-dirty file over 1 MB (`restored: false`, path listed), and an unreadable after-snapshot (`mutated_unknown`, root halted).
- Prevention: a single direct `flutter analyze|test` gets ` --no-pub` appended to the executed text only (`run.rewritten` records it, `it.command` is never modified); with no resolved `.dart_tool/package_config.json` the item is skipped `needs-pub-get` and `pub get` is never run.
- Outside a git work tree a Dart/Flutter gate is refused `side-effect-unproven`; other tools keep today's behaviour.

## Task Commits

1. **Task 1 RED:** `79bb7aff` test(43-02): add failing effect-guard regression for stack verify --run
2. **Task 1 GREEN:** `40d468e5` feat(43-02): effect-based guard around stack verify --run spawns
3. **Task 2 RED:** `61f8d265` test(43-02): add failing --no-pub rewrite and needs-pub-get tests
4. **Task 2 GREEN:** `60cf2ea2` feat(43-02): --no-pub prevention for flutter analyze/test and needs-pub-get
5. **Follow-up:** `671364d7` feat(43-02): show mutated and halted gates in the stack verify --raw table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Contract change] Existing deny-set test ran `dart analyze` / `flutter analyze` in a plain temp dir**
- **Found during:** Task 1 GREEN (first run of stack-verify.test.cjs)
- **Issue:** "safe commands are not caught by the deny set" executed those two commands in a non-git mkdtemp and expected them to run. TRD test 9 deliberately refuses exactly that (`side-effect-unproven`), so the test and the TRD contradict.
- **Fix:** Removed the two commands from that plain-tempdir list with a comment. Their "not denied" property is still proved inside a git work tree by a new real-spawn test (`dart analyze`, `dart format`, `flutter analyze`), and their refusal outside one is proved by test 9.
- **Files modified:** stack-verify.test.cjs, stack-verify-run-guard.test.cjs
- **Commit:** 40d468e5

**2. [Rule 3 - Blocking] Test 1's `--no-pub` assertions belong to Task 2, not Task 1**
- **Found during:** Task 1 GREEN
- **Issue:** The TRD splits the effect guard (Task 1) from the `--no-pub` rewrite (Task 2), but its test 1 asserts `run.rewritten` and the stub's `--no-pub` argument. Task 1 could not go green on its own without folding in Task 2.
- **Fix:** Task 1 asserts the guard behaviour only (stub invoked once). The rewrite assertions were re-added in Task 2's RED commit as tests 1b and 1c.
- **Commit:** 40d468e5 (re-scope), 61f8d265 (re-added)

**3. [Rule 2 - Missing critical functionality] A mutation was invisible in `stack verify --raw`**
- **Found during:** final review after Task 2
- **Issue:** `run.mutated` appears only in the JSON; the compact `--raw` table printed `run=0` for a gate that had changed files.
- **Fix:** `rawTable` appends ` mutated=<n>` (` restored=false` when not put back, ` mutated=unknown` when unreadable). Test added.
- **Files modified:** stack-verify.cjs, stack-verify-run-guard.test.cjs
- **Commit:** 671364d7

**4. [Rule 2 - Missing critical functionality] `needs-pub-get` understands pub workspaces**
- **Found during:** Task 2 design
- **Issue:** Checking only `<cwd>/.dart_tool/package_config.json` would skip every pub-workspace member (`resolution: workspace`, Dart 3.6+), whose config lives at the workspace root, making `--run` useless on those repos in 43-07.
- **Fix:** For a member only, climb to the repo root looking for the config. Test added.
- **Commit:** 60cf2ea2

### Other departures from the TRD text

- **Test 12 used JSON, not `--raw`.** The TRD says `stack verify --run --raw` shows the JSON, but `--raw` prints the compact table. The CLI test runs without `--raw` for the JSON assertions and a second test covers the `--raw` table.
- **Hashing:** the TRD names `git hash-object --stdin-paths`. It is used (with `--no-filters` so CRLF is not normalised), with a git-compatible node SHA-1 fallback only for paths containing a newline, which `--stdin-paths` cannot carry.
- **Preflight:** my first `exec-context check` ran from the main checkout instead of the worktree and reported `SHARED INDEX` (43-01's claim on the main checkout). I re-ran it from inside the worktree with `--cwd`, which passed (checkout `.df-worktrees/devflow-claude/43-02`, base visible). I did not release 43-01's claim.
- **SUMMARY written with the Write tool** into the worktree and committed, per the dispatch, rather than `summary post` (which writes the main checkout). ROADMAP.md and STATE.md were not touched, per the dispatch.

## Known limitations (reported, not fixed)

- A file over 1 MB that was already dirty before the run cannot be restored from memory: reported `restored: false` with the path in `run.unrestored`, left as the command wrote it.
- The index of a path that was already dirty is not restored (a command that stages a user's uncommitted edit changes the index, not the compared content). Paths that were clean are fully restored, index included.
- Empty directories a command created are left behind (git does not track them), to avoid removing a directory the user had.
- On a timeout `sh` is SIGKILLed but its descendants are not; one that keeps running could write after the after-snapshot.
- The snapshot covers the whole git work tree, not only the component directory, and `status -uall` cost scales with tree size (two snapshots per spawned item, a third only after a mutation).
- Docs that describe `--run` policy (USER-GUIDE and the stack docs) were not updated; this TRD owned only the four code files.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Tree snapshot, diff and restore around the spawn; halt rule | `node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` | 0 (117 tests after the follow-up) | PASS |
| 2: --no-pub prevention and needs-pub-get | `node --test plugins/devflow/devflow/bin/lib/stack-verify.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs` | 0 (117 tests) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` | 0 (950 tests, 0 failed, 0 skipped; run after every code commit and once more at the end) | PASS |
| lint | none | n/a | not_available (profile: none) |
| build | none | n/a | not_available (profile: none) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../stack-verify-run-guard.test.cjs` | 1 (9 of 11 failing: no `mutated`, no halt, no restore) | FAIL (correct) |
| RED (Task 1, test 9) | `node --test --test-name-pattern "43-02 test 9" .../stack-verify.test.cjs` | 1 (`side-effect-unproven` missing) | FAIL (correct) |
| GREEN (Task 1) | `node --test .../stack-verify-run-guard.test.cjs .../stack-verify.test.cjs` | 0 (106 tests) | PASS (correct) |
| RED (Task 2) | `node --test --test-name-pattern "43-02 test (7\|8\|10)\|1b\.\|1c\." ...` | 1 (6 of 11 failing) | FAIL (correct) |
| GREEN (Task 2) | `node --test .../stack-verify.test.cjs .../stack-verify-run-guard.test.cjs` | 0 (116 tests) | PASS (correct) |
| RED (follow-up) | `node --test --test-name-pattern "CLI: stack verify --run with the effect guard" ...` | 1 (`--raw` marker missing) | FAIL (correct) |
| GREEN (follow-up) | both files | 0 (117 tests) | PASS (correct) |

Tests that passed at RED (test 4, test 6, the `go vet` unchanged case, the "not rewritten" cases, 1c) are regression pins for behaviour that must not change.

## Safety of the tests

Every real-spawn test runs a hand-written `#!/bin/sh` stub against a scratch git repo created by `mkdtemp` (`gitDartRepo`), with git run through `spawnSync` and `DEVFLOW_ALLOW_RAW_COMMIT=1` in `env`. No test touches a repository under `~/dev`. The git-dependent describes skip when git is not on PATH. The fixture builders `mutatingToolBin`, `stubCalls`, `gitDartRepo`, `gitAvailable` and `gitIn` are additions only; the `fakeBin` / `fakeHome` signatures are unchanged.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (snapshot around the spawn in `runOne`; mutated plus byte-exact restore including pre-dirty content; halt rule; `--no-pub` plus `needs-pub-get`; `side-effect-unproven` outside a work tree)
- Gate failures: None

## Notes for 43-07

43-07 (the real fleet `--run` pass, SDR-08) needs this code mirrored into `~/.claude/devflow/` (the runtime mirror is stale until `sync-runtime` runs) or must call the repo df-tools. Until then the installed `stack verify --run` still has no effect guard.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-verify.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
- FOUND commits: 79bb7aff, 40d468e5, 61f8d265, 60cf2ea2, 671364d7
- Worktree was clean before the SUMMARY; stack-* suite 950/950 after the last code commit.
