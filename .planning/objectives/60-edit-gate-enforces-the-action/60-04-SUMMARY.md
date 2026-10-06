---
objective: 60-edit-gate-enforces-the-action
job: "04"
subsystem: hooks
tags: [bash-write-gate, edit-gate, pretooluse, hook, fail-open, override-marker]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "lib/bash-write-detect.cjs mayWrite (60-02) and lib/bash-write-gate.cjs evaluateBashWrites, gitTrackedSet, effectiveBashMode, readBashEditGate, bashGateReason, BASH_EDIT_GATE_DEFAULT, BASH_GATE_CLASSIFIER, plus __fixtures__/tracked-repo.cjs (60-03)"
provides:
  - "hooks/gate-bash-writes.js: PreToolUse(Bash) hook; exports run(input, {cwd, env, deps}) -> hook output object | null"
  - "hooks.json: the hook registered in the PreToolUse Bash group after gate-interactive"
  - "CLAUDE.md inventory bullet and the planning-writes audit RUNS entry for the hook"
affects: [60-05, 60-06, 60-07]

tech-stack:
  added: []
  patterns:
    - "Separate hook that requires gate-edits.js's exported helpers, so every escape is the Edit gate's own code"
    - "Cheapest-first decision order: one regex (mayWrite) before any fs or git"
    - "One-shot override consumed lazily, only by a write that would otherwise be gated"
    - "Libs loaded lazily inside try/catch, so a partial install is an allow, never a crash"

key-files:
  created:
    - plugins/devflow/hooks/gate-bash-writes.js
    - plugins/devflow/hooks/gate-bash-writes.test.js
  modified:
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/planning-writes.audit.test.js
    - CLAUDE.md

key-decisions:
  - "A separate hook, not a Bash branch in gate-edits.js: the Edit/Write path stays byte-identical (git diff of gate-edits.js and gate-commits.js across this TRD is empty), fail-open boundaries stay independent, and the escapes are shared by construction"
  - "The payload cwd decides (absolute input.cwd, else the process cwd): it is the session's working directory and what relative targets mean"
  - "run() does not catch internally; main() wraps it in try/catch and fails open. loadLibs() catches its own require failures and returns null, so a missing lib is an allow"
  - "deps may override any helper by name (the TRD named gitTrackedSet and findPlanningDir), so the in-process tests spy on exactly the fs-and-git touch points"

requirements-completed: [GATE-01, GATE-02, GATE-03, GATE-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-06
---

# Objective 60 TRD 04: The PreToolUse(Bash) hook gate-bash-writes.js Summary

**`hooks/gate-bash-writes.js` denies (strict) or asks (warn) when a Bash command writes a tracked project file in ambient mode, with the Edit gate's own escapes, a one-shot override that only a would-be-gated write consumes, and a fail-open exit 0 on every path. It is registered on PreToolUse(Bash) beside gate-commits.**

## Progress
- [x] Task 1: gate-bash-writes.js with its subprocess and in-process tests (tests 1-10) - 89b7a29f (RED), b3f5449a (GREEN)
- [x] Task 2: Register the hook, CLAUDE.md inventory bullet, planning-writes audit entry - 03da452a

## Accomplishments

- The hook follows the TRD's decision order: `DEVFLOW_SKIP_EDIT_GATE`, then tool and command shape, then `mayWrite` (no fs, no git), then planning-dir lookup from the payload cwd, then `effectiveBashMode(readEditGateMode, readBashEditGate)`, then `devflow:*` agent, then the skill marker (local and main checkout), then `evaluateBashWrites` with live predicates, then the lazy override, then the deny or ask. `ls` costs one regex and exits.
- Severity is the least of `gates.editGate` and `gates.bashEditGate`; strict is `deny`, warn is `ask`. With no `bashEditGate` key the decision follows `BASH_EDIT_GATE_DEFAULT` (currently the `warn` placeholder, so `ask`); the test reads the constant, so 60-06 can change it without touching the test.
- Every escape is gate-edits' own function: `findPlanningDir`, `sharedPlanningDir`, `hasSkillActiveMarker`, `readEditGateMode`, `isDevflowAgent`, `isOutsideProject`, plus `consumeEditOverrideMarker`. gate-edits.js and gate-commits.js are unmodified.
- The override marker is consumed only after `evaluateBashWrites` returns a non-empty `gated`, so an ordinary `ls`, a markdown write or an untracked write leaves it for the next gated write.
- Fail open: with no `devflow/` sibling the hook allows and exits 0 (test 9); malformed stdin, a non-Bash tool, an empty command and a project-less directory all produce no output.
- Registered after `gate-interactive.js` in the Bash group (two-space JSON, nothing else changed), documented with a CLAUDE.md bullet right after gate-edits, and covered by two audit RUNS entries (ambient write, override armed and consumed). The audit's behavioural run shows no changed dotfile other than the `.edit-override` deletion, and its static scan finds no unclassified literal in the hook.
- Smoke against this worktree: `ls -la` and a `.planning/` write give no output; a write to a tracked hook file gives `ask` (the placeholder default). Each spawn took 20-31 ms.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Hook and tests | `node --test plugins/devflow/hooks/gate-bash-writes.test.js` (47 tests) | 0 | PASS |
| 1: No regression | `node --test plugins/devflow/hooks/gate-bash-writes.test.js plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/gate-commits.test.js` (271 tests) | 0 | PASS |
| 1: Untouched | `git diff --stat <base>..HEAD -- plugins/devflow/hooks/gate-edits.js plugins/devflow/hooks/gate-commits.js` | 0, empty | PASS |
| 2: Registration | `node -e "...hooks.PreToolUse.find(matcher==='Bash')..."` printed `gate-commits.js,changelog-on-tag.js,gate-interactive.js,gate-bash-writes.js` | 0 | PASS |
| 2: Inventory and audit | `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/hooks/gate-bash-writes.test.js` (105 tests) | 0 | PASS |
| 2: Other readers of hooks.json | `node --test` over awareness-cache-populate, auto-continue, classify-session, doctor-checks/11-12-install, doctor-cli tests (171 tests) | 0 | PASS |

## Task Commits

1. **Task 1 RED** - `89b7a29f` (test): `node --test` exited 1 with `Cannot find module './gate-bash-writes.js'`
2. **Task 1 GREEN** - `b3f5449a` (feat)
3. **Task 2** - `03da452a` (feat): registration, inventory bullet, audit entry

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/hooks/gate-bash-writes.test.js` (hook missing) | 1 | FAIL (correct) |
| GREEN (Task 1) | same | 0 | PASS (correct), 47 tests |

Mutation checks on the GREEN hook (each restored afterwards, the file is byte-identical to the committed one):

| Mutation | Test that failed |
|---|---|
| consume the override before `evaluateBashWrites` | 6: "a write that is not gated leaves it too" |
| ignore the payload cwd (use the process cwd) | 8: "spawned from the tmp dir, a relative target means the payload cwd" |
| pass `null` for the main checkout's planning dir | 5(b): the worktree write with the marker only in the main checkout |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task: test | `node --test plugins/devflow/hooks/gate-bash-writes.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 0 | PASS (105 tests, 0 fail, 0 skipped) |
| regression | gate-edits and gate-commits tests | 0 | PASS (in the 271-test run) |
| objective: test (full) | `npm test` | not run | Owned by 60-07 per the dispatch |

## Deviations from Plan

None - TRD executed as written. Small additions inside its contract:

- Tests beyond the TRD's list, each pinning a behaviour the design states: an unrecognised `bashEditGate` value takes the default; a devflow agent is allowed in warn mode too (never asked); a write that is not gated (markdown, untracked) leaves the override marker; a Bash call with no `command`; a relative payload cwd falls back to the process cwd; `DEVFLOW_SKIP_EDIT_GATE` read from the `env` passed to `run()`; and a positive control in test 10 (a tracked write calls `gitTrackedSet` exactly once with the resolved absolute path), so the "not called" assertions cannot pass vacuously.
- Test 5(b) also writes `gates.bashEditGate: strict` into the worktree's own config (the worktree checks out the committed `{}`), and carries a no-marker control that denies.

## Notes

- Test 6's `ls -la` case cannot catch an eager consume placed after the `mayWrite` check, because `ls` exits at `mayWrite` first; the extra "not gated" test covers that placement. Together they pin both orders.
- `BASH_EDIT_GATE_DEFAULT` is still the `warn` placeholder. 60-06 sets it from the measured rate, and 60-07 finalises the CLAUDE.md bullet's wording with the measured default.
- `state update-progress` answered `updated: false, reason: "Progress field not found in STATE.md"`: this repo's STATE.md has no Progress field. `state advance-job --objective 60` and `roadmap update-job-progress 60` both applied (4/7 TRDs, 60-04 ticked).
- The SUMMARY was posted in local mode twice, the second time only to correct `duration` (14min to 5min) before the final commit. In local mode that is one file rewritten, with no GitHub write.
- This session runs the installed plugin, which does not have this hook, so nothing here gated the executor's own Bash calls.

## Discovered commands

None. The stack profile (`general`) names `node --test {files}`, and the scoped form was used as given.

## Flutter UI Evidence

Not applicable (non-UI TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - every GATE-01 form (redirect, heredoc opener, tee, sed -i, cp, mv, inline python, inline node, cd then redirect) gets `deny` with a reason that names the file and matches `BASH_GATE_CLASSIFIER`
  - with no `bashEditGate` key the decision follows `BASH_EDIT_GATE_DEFAULT`
  - mentions, `.planning/`, `*.md`, untracked files, tmp, scratchpad and other repos produce no output
  - every escape (marker local and main, agent type, fresh override, env, editGate off, bashEditGate off) allows, editGate warn yields ask, and each has a control
  - the override survives `ls` and is consumed by the first gated write
  - registered on PreToolUse(Bash) beside gate-commits, exits 0 on every path, fails open without its libs
- Gate failures: None

## Self-Check: PASSED

- FOUND: `plugins/devflow/hooks/gate-bash-writes.js`
- FOUND: `plugins/devflow/hooks/gate-bash-writes.test.js`
- FOUND: `plugins/devflow/hooks/hooks.json` entry (registration order printed above)
- FOUND commits: `89b7a29f`, `b3f5449a`, `03da452a`
