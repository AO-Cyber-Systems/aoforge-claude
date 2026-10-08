---
objective: 71-stack-drafter-and-verify-policy
trd: "03"
subsystem: stack-verify
tags: [stack-verify, run-policy, services, ci-reader, github-actions, flag-guard]

requires:
  - objective: 43-stack-verify-run-guard
    provides: runOne key policy, deny list, effect guard and the `--run` result shape this policy slots into
provides:
  - "`stack verify --run` skips a gate with a service signal as `env_required` and never spawns it"
  - "`--allow-services` (only with `--run`) runs it; `run.services_allowed` lists the signals and `--raw` appends ` services=allowed`"
  - "`RUN_POLICY.services` states the policy, frozen"
  - "stack-ci steps carry `services` (job service containers) and `envNames` (env names in scope)"
affects: [71-05-dogfood-and-docs, stack-drafter, stack-report]

tech-stack:
  added: []
  patterns:
    - "static signal layers (text, CI job, test env file) instead of probing a port"
    - "a policy finding type ranked in FINDING_ORDER (service after unverifiable, before skip)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/flag-spec.cjs

key-decisions:
  - "A service finding's reason is exactly `env_required` (no `body:` prefix), ranked after `unverifiable` and before `skip`; a deny is returned alone and still wins"
  - "Detection is static (text, CI job, test env file); nothing connects to a port or probes a host"
  - "The CI layer matches an exact command + cwd; a hand-edited command that differs from CI is not matched (documented limit)"
  - "A skip detail joins every signal found, not only the first; it names files, jobs, services and variables, never a URL or value"

patterns-established:
  - "Env files apply to the keys in RUN_POLICY.services.envFileKeys (test, e2e) only"

requirements-completed: [SDR-10]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 13min
completed: 2026-10-08
tokens_input: 15615506
tokens_output: 78500
tokens_cache_read: 15402885
tokens_cache_write: 212439
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 71 TRD 03: `stack verify --run` never reaches a service silently Summary

**`stack verify --run` now skips any gate whose text, CI job or test env file names a service as `env_required`, and `--allow-services` is the marked, explicit opt-in.**

## Progress
- [x] Task 1: Fixture builders: a committed scratch repo and a CI workflow with services — 658b5e6a
- [x] Task 2: CI steps carry their job's service containers and the env names in scope — RED fccb7cfa, GREEN ee1b73fe
- [x] Task 3: The `env_required` policy, the three signal layers and `--allow-services` — RED b1744e82, GREEN cc7b5421

## Accomplishments

- `stack-ci.cjs`: every step carries `services` (the job's block `services:` names, sorted) and `envNames` (workflow, job and step env names in scope, sorted; a service container's own `env:` and a `services:` under `with:` are not job state).
- `stack-verify.cjs`: a service finding from the gate's own text (command, one-level runner body, wrapper script), `serviceSignals(item, ctx)` for the CI layer and test env files, the `runOne` skip and opt-in, `parseVerifyArgs --allow-services`, `rawTable` ` services=allowed`, the header paragraph, and `RUN_POLICY.services`.
- `flag-spec.cjs`: the `stack verify` bools include `--allow-services`, so the flag guard and the parser agree.
- Fixtures: `gitRepo({ files, modes })` and `serviceWorkflow({ job, services, env, defaultsCwd, runs })`, both hand-built.
- The trades situation (CI job `services: postgres` running the same `test` command) is case 1 to 3 end to end through the spawned CLI.

Limits worth knowing (also in the module header): the CI layer matches an exact command and cwd, so a hand-edited STACK.md command that differs from CI text is not matched; the job `services:` flow spelling (`services: { ... }`) is not read; detection is static, so a service reached through a name this policy does not know is not seen.

## Task Commits

1. Task 1: `658b5e6a` test(71-03): verify fixtures for service-backed gates
2. Task 2: `fccb7cfa` test (RED), `ee1b73fe` feat (GREEN)
3. Task 3: `b1744e82` test (RED), `cc7b5421` feat (GREEN)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The TRD's loopback regex could not match `[::1]`**
- **Found during:** Task 3 (writing case 6b)
- **Issue:** `\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b` puts `\b` before the group; between a space and `[` there is no word boundary, so `svc-suite --addr [::1]:6379` was invisible.
- **Fix:** `(?<![A-Za-z0-9.-])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b`. The lookbehind also keeps `db.localhost:5432` from matching.
- **Files modified:** `plugins/devflow/devflow/bin/lib/stack-verify.cjs`
- **Commit:** cc7b5421

### Additions beyond the written steps

- Two extra tests: 4b (`parseVerifyArgs` unit: the flag, the missing-`--run` error, the unknown-flag message) and 6b (a bare scheme names only the scheme; a bracketed loopback names host:port; neither echoes the URL).
- The skip detail joins every signal found (`; `) rather than only the first. Tests assert `contains`, so this is a superset of the TRD's "first signal".
- `rootRelative` and `squash` helpers in `stack-verify.cjs` (the TRD names `squash` but no such helper existed).

### Process notes

- The first runs of Task 1's verify line and of the Task 2 RED check used a repo-relative path from the session directory, so they ran against the MAIN checkout, not this worktree. Every run after that used absolute worktree paths. The two suites in Task 1's verify line ran again, against the worktree with the new fixtures, as part of Task 3's verify and the full suite.
- While diagnosing the full-suite failures I started `devflow-watch.cjs start --foreground` once from the main checkout (real HOME) to compare against the worktree, then stopped it with `devflow-watch.cjs stop` (reported `stopped`). Nothing else touched outside the worktree.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders | `node --test .../stack-verify-run-guard.test.cjs .../stack-verify.test.cjs` (re-run on the worktree in task 3's verify) | 0 | PASS |
| 2: CI steps | `node --test .../stack-ci.test.cjs stack-evidence stack-drafter-golden stack-drafter-realshape stack-report` (197 tests) | 0 | PASS |
| 3: policy | `node --test .../stack-verify-services.test.cjs stack-verify stack-verify-run-guard stack-cli flag-spec.repo stack-ci` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test .../stack-ci.test.cjs` | 1 | FAIL (correct): the key pin and C18a-d fail on `services` / `envNames` undefined |
| GREEN (task 2) | `node --test .../stack-ci.test.cjs` and the evidence/drafter/report suites | 0 | PASS (correct) |
| RED (task 3) | `node --test .../stack-verify-services.test.cjs` | 1 | FAIL (correct): 15 of 19 fail; 5, 11, 14 and 16 pass because they pin unchanged behaviour |
| GREEN (task 3) | `node --test .../stack-verify-services.test.cjs` | 0 | PASS (19 of 19) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the six suites above | 0 | PASS |
| test (full) | all `npm test` globs minus `micro.test.cjs`, `DEVFLOW_SKIP_FLEET_HARNESS=1` | 1 | 11318 pass, 11 fail, 50 skipped; none caused by this TRD (below) |

The 11 full-suite failures:

- 10 in `devflow-watch.test.cjs` (4) and `handoff-e2e.test.cjs` (6): the daemon exits 3 with `failed to spawn shell` because the PTY backend (`node-pty`) is not installed; this worktree has no `node_modules`. The same `devflow-watch.test.cjs` passes in the main checkout. Neither file is touched by this TRD.
- 1 in `roadmap-reconcile.test.cjs` E2E1: the repo-wide ROADMAP drift check saw this TRD's SUMMARY before its ROADMAP box was ticked. `roadmap update-job-progress 71` ticked `71-03`, and `roadmap-reconcile.test.cjs` then passed in full.

## Discovered commands

None: every command came from the stack profile.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (each truth maps to a passing case: criteria 1 to 3 in cases 1 to 4, signal layers in 6 to 13, precedence in 5, 14 and 16, the step fields in C18a to d, the policy in 17)
- Gate failures: 10 environmental (`node-pty` missing in this worktree: `devflow-watch.test.cjs`, `handoff-e2e.test.cjs`); the 11th (E2E1) cleared after the roadmap update. None in a file this TRD touches.
- State: `state update-progress` reported `updated: false` ("Progress field not found in STATE.md"), which was already the case before this TRD; `state advance-job --objective 71` reports 1/5 TRDs complete.

## Self-Check: PASSED

All six files exist; commits 658b5e6a, fccb7cfa, ee1b73fe, b1744e82 and cc7b5421 are in `git log`; the working tree is clean.
