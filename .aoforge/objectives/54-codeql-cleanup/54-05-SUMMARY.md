---
objective: 54-codeql-cleanup
trd: "05"
subsystem: tests
tags: [codeql, js/shell-command-injection-from-environment, execFileSync, spawnSync, test-refactor]

requires:
  - objective: 54-codeql-cleanup
    provides: "TRD 54-04 converted the other five test files; this TRD is part 2 of group G"
provides:
  - "decision-queue, flutter-ui-scope and project-hygiene tests spawn df-tools as execFileSync(process.execPath, [script, ...argv]) with no shell"
  - "flutter-ui-scope Case E3 captures stdout and stderr together via spawnSync, without 2>&1"
  - "ui-spec-cli gateFails runs the gate idiom in a real sh with a constant script; node binary, df-tools and argv are positional parameters"
affects: [54-09-changelog-suite-push, 54-10-codeql-verify-and-dismiss]

tech-stack:
  added: []
  patterns:
    - "Spawn df-tools with an argv array, never a shell string; when a real sh is the thing under test, keep the -c script constant and pass variable parts as $0 / \"$@\""

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/decision-queue.test.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs
    - plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
    - plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs

key-decisions:
  - "54-05: gateFails keeps sh (the claim is about sh's `||`) and moves everything variable to positional parameters, rather than switching to spawnSync(process.execPath) and testing status !== 0"
  - "54-05: GATE_SENTINEL stays interpolated into GATE_SCRIPT, since it is the constant 'GATE_FAILED'; inlining the literal is the fallback if CodeQL still flags it (decided at 54-10 after the scan)"

requirements-completed: ["54-G"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: not_applicable

duration: 20min
completed: 2026-10-04
tokens_input: 3090979
tokens_output: 23280
tokens_cache_read: 3009043
tokens_cache_write: 81864
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 54 TRD 05: execFileSync in the CLI test files Summary

**Four test files (decision-queue, flutter-ui-scope, project-hygiene, ui-spec-cli) no longer interpolate `__dirname`/tmpdir-derived paths into a shell string: df-tools is spawned with an argv array, and the one test that must use `sh` keeps it with a constant script and positional parameters. Every assertion is unchanged and each file's counts equal its baseline.**

## Progress
- [x] Task 1: execFileSync in decision-queue, flutter-ui-scope and project-hygiene tests (alerts 96-100, 107-109, 112-113) — 3e48f99b
- [x] Task 2: gateFails keeps a real sh but passes everything variable as positional parameters (alert 122) — 79c79918

## What changed

- `decision-queue.test.cjs`: `runCli(tmpDir, argv)` takes an array and calls `execFileSync(process.execPath, [DF_TOOLS, 'decision-queue', ...argv])`. The four callers were unquoted into arrays (`'option-a,option-b'` stays one element). Case 22's `assert.throws` call and the import were converted too.
- `flutter-ui-scope.test.cjs`: E1 and E2 convert one to one. E3 uses `spawnSync` and concatenates `stdout + stderr`, so the `2>&1` and the try/catch are gone. The local import is now `{ execFileSync, spawnSync }`.
- `project-hygiene.test.cjs`: the five calls (check, no subcommand, bogus, move, move 05-foo) keep their `cwd` and `stdio: 'pipe'`; the import is `execFileSync`.
- `ui-spec-cli.test.cjs`: `GATE_SCRIPT` is `"$0" "$@" >/dev/null 2>&1 || echo GATE_FAILED`; `gateFails(argv)` calls `spawnSync('sh', ['-c', GATE_SCRIPT, process.execPath, DF_TOOLS, ...argv])`. The three callers in Case G1 are arrays, with the `JSON.stringify` quoting dropped. The doc comment states the positional-parameter contract.

No production code was touched and no tests were added or removed.

## Deviations from Plan

None - TRD executed exactly as written.

The `rg "\bexecSync\b"` check over the four files returns one line, a pre-existing doc comment at `ui-spec-cli.test.cjs:33` that explains why `runArm` uses `spawnSync`. It is not a call and was left alone (out of scope: no assertion, no code).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: execFileSync in decision-queue, flutter-ui-scope, project-hygiene | `node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs` | 0 (83 pass, 0 fail, 0 skipped) | PASS |
| 2: gateFails positional parameters | `node --test plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs` | 0 (34 pass, 0 fail, 0 skipped) | PASS |

Baseline versus after, per file (pass/fail/skip): decision-queue 23/0/0 → 23/0/0; flutter-ui-scope 25/0/0 → 25/0/0; project-hygiene 35/0/0 → 35/0/0; ui-spec-cli 34/0/0 → 34/0/0.

Case G1 holds both halves: the unchecked `projects-rail.md` fails the gate, and the same spec with `--patterns` passes it. Both outcomes through a real `sh` show the binary is actually run (a wrong `$0`/`$@` order would flip one half).

`rg -n "node \$\{(DF_TOOLS|dfTools)\}"` over the four files prints nothing. `git diff --stat 8ff8401a HEAD` touches the four test files and this SUMMARY only.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the four files above | 0 | PASS |
| test (full) | `npm test` | not run | not_available |

The full `npm test` is deliberately not run here: the dispatch scopes this TRD to its own files and runs the full suite once in TRD 54-09. It is not reported as a pass.

## Discovered commands

None - the stack profile supplies `node --test {files}`.

## Authentication gates

None.

## Execution note

The first `exec-context check` ran from the shell's default directory, the main checkout, and returned SHARED INDEX because TRD 54-04 holds the claim there. It was re-run against the worktree with the global `--cwd` flag, as the dispatch specified ("from your worktree"), and passed: `checkout` was `/Users/justin/dev/.df-worktrees/devflow-claude/54-05`, branch `df/exec-54-05`, base visible. No claim was released or modified. All later df-tools calls used `--cwd` on the worktree, and git calls used `git -C`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (no-shell spawn in three files; E3 without `2>&1` still asserting flutter-ui-scope; gateFails constant script with positional parameters; assertions and counts unchanged)
- Gate failures: None. Full `npm test` is deferred to 54-09.
- CodeQL: alerts 96-100, 107-109, 112, 113 and 122 have no remaining source pattern in the working tree. Closure is confirmed against a fresh scan in TRD 54-10.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/decision-queue.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
- FOUND: .planning/objectives/54-codeql-cleanup/54-05-SUMMARY.md
- FOUND commit 3e48f99b (Task 1)
- FOUND commit 79c79918 (Task 2)
