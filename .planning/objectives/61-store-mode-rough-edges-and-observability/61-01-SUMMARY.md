---
objective: 61-store-mode-rough-edges-and-observability
trd: "01"
subsystem: health
tags: [checks-workflow, gh-setup, validate-health, doctor, w062, stor-03]

requires: []
provides:
  - "lib/checks-pin.cjs: parseWorkflowPins(text), parseReleaseRef(ref), pinStatus(pins, installedVersion), readWorkflowPin(root), collectPinFindings({projectRoot, installedVersion}); the one definition of WORKFLOW_PATH, MANAGED_HEADER and DEFAULT_CHECKS_WORKFLOW"
  - "validate health Check 17: W062 warning (never repairable) for a managed .github/workflows/devflow.yml pinned to a release older than installedVer || runningVer"
  - "doctor project check 26 `checks-workflow-pin` (report-only, fix_command `node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply`); doctor check 22 defers W062"
affects: [61-06, 61-07, 61-09]

tech-stack:
  added: []
  patterns:
    - "One pure collector, two thin renderers: validate health Check 17 and doctor check 26 both call checks-pin.collectPinFindings, and check 22 defers the code check 26 owns"
    - "A dependency-free leaf module (fs and path only) owns constants that a heavier module (gh-setup) imports, so a later reverse require can never be circular"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/checks-pin.cjs
    - plugins/devflow/devflow/bin/lib/checks-pin.test.cjs
    - plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/README.md

key-decisions:
  - "When the two pins disagree, the W062 message names the oldest stale ref and lists only the stale fields that pin it, so the parenthesis never claims a field pins a ref it does not"
  - "Doctor check 26's stale finding appends the github.checks_workflow @ref caveat, because the doctor's human output shows only the finding and the fix_command, never the W062 fix text"
  - "pinStatus reports 'ahead' when any compared pin is newer and none is older; a mixed current/ahead pair is 'ahead'"
  - "readWorkflowPin treats ENOTDIR like ENOENT (absent); any other read error throws and both callers report it (validate as W062 checks-pin-check-failed, doctor as a warn)"

requirements-completed: [STOR-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-06
tokens_input: 12103510
tokens_output: 63881
tokens_cache_read: 11890038
tokens_cache_write: 213308
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 61 TRD 01: Stale checks-workflow pins in validate health and doctor Summary

**A new fs-only module, `checks-pin.cjs`, parses the two DevFlow pins in the managed `.github/workflows/devflow.yml` and compares them as three integers against the installed plugin. `validate health` Check 17 reports a stale pin as W062, and doctor check 26 `checks-workflow-pin` reports it with the `gh setup --apply` command. Doctor check 22 defers W062, so the problem shows once.**

## Progress
- [x] Task 1: checks-pin.cjs, the pin parser and the stale decision — RED 0add0fd8, GREEN 25e70912
- [x] Task 2: validate health Check 17 (W062) — RED 75cb6015, GREEN 56753f3a
- [x] Task 3: doctor check 26-checks-workflow-pin and the W062 deferral — RED 50862dca, GREEN a631fccc

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-06T19:22Z
- **Completed:** 2026-10-06T19:33Z
- **Tasks:** 3
- **Files modified:** 10 (5 created, 5 modified)

## What was built

- `checks-pin.cjs` requires only `fs` and `path`. It now holds the single definition of `WORKFLOW_PATH`, `MANAGED_HEADER` and `DEFAULT_CHECKS_WORKFLOW`. `gh-setup.cjs` imports all three in one line and still exports `WORKFLOW_PATH`. A test scans the source for both rules: checks-pin requires only fs and path, and gh-setup no longer defines any of the three constants.
- **Decision.** `managed` uses planWorkflow's rule (a header in the first 5 lines). The `devflow-ref` pin is always compared. The `uses` @ref is compared only when its path is DevFlow's default reusable workflow. Only release-shaped refs (`v?X.Y.Z`) are compared, as integers. A branch, a SHA, a fork's own ref, an unmanaged file and an absent file never warn.
- **Check 17** sits directly after Check 16, so 61-07 can append Check 18 after it. It compares against `installedVer || runningVer` from Check 11. It is a local file read with no gh or git call. It is never repairable, and when it cannot run it reports `checks-pin-check-failed` under W062.
- **Doctor check 26** compares against `helpers.installedPlugin({homeDir: ctx.userHome})`, falling back to `ctx.pluginVersion`. Each ok state has its own one-line finding: absent, not managed, branch/SHA pin (not compared), current, ahead, and a non-release version (not compared). `details` carries `pins`, `installed`, `version_source`, `compared` and `stale`, plus `code` and `fix` when the pin is stale. The check has no `fix()`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: checks-pin.cjs | `node --test checks-pin.test.cjs gh-setup.test.cjs gh-setup-cli.test.cjs` (147 tests) | 0 | PASS |
| 2: Check 17 (W062) | `node --test validate-checks-pin.test.cjs validate.test.cjs validate-gh-health.test.cjs` (112 tests); `df-tools validate health --raw` in this repo shows no W062 | 0 | PASS |
| 3: doctor check 26 + deferral | `node --test doctor-checks/26-checks-workflow-pin.test.cjs doctor-checks/21-22-project.test.cjs doctor.e2e.test.cjs` (38 tests); `df-tools doctor --json` lists `checks-workflow-pin` severity ok ("no .github/workflows/devflow.yml ...", installed 2.13.1, source installed-plugin) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task gate, scoped) | `node --test checks-pin.test.cjs validate-checks-pin.test.cjs doctor-checks/26-checks-workflow-pin.test.cjs doctor-checks/21-22-project.test.cjs` (62 tests) | 0 | PASS |
| test (full suite) | `npm test` (10,177 tests: 10,115 pass, 50 skipped, 12 fail) | 1 | PASS for this TRD: none of the 12 failures loads a module it touched (see below) |

The 12 full-suite failures, none from this TRD's modules:

- **`devflow-watch.test.cjs` (4) and `handoff-e2e.test.cjs` (6).** The daemon log says `Cannot find module 'node-pty'`. This worktree has no `node_modules`; the main checkout has `node_modules/node-pty`. Run alone, the two files fail the same 11 tests, and neither requires a lib module this TRD changed.
- **`stack-drafter-fleet.test.cjs` (1).** It drafts the sibling repo `~/dev/github-enterprise-migration` on disk, which now differs from that repo's committed STACK.md (lint and test commands). The result depends on the machine.
- **`roadmap-reconcile.test.cjs` E2E1 (1).** It is a self-test of this repo's ROADMAP. It reports `trd_summary_exists` for 61-01: the per-task checkpoint created `61-01-SUMMARY.md` before the ROADMAP box was ticked. The `roadmap update-job-progress` state step after this post ticks it.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test checks-pin.test.cjs` | 1 | FAIL: Cannot find module './checks-pin.cjs' (correct) |
| GREEN (T1) | `node --test checks-pin.test.cjs gh-setup.test.cjs gh-setup-cli.test.cjs` | 0 | PASS, 147 tests (correct) |
| RED (T2) | `node --test validate-checks-pin.test.cjs` | 1 | FAIL: 3 of 6 (tests 9, 11, check-failed); the 3 "no W062" cases pass trivially (correct) |
| GREEN (T2) | `node --test validate-checks-pin.test.cjs validate.test.cjs validate-gh-health.test.cjs` | 0 | PASS, 112 tests (correct) |
| RED (T3) | `node --test doctor-checks/26-checks-workflow-pin.test.cjs`; `node --test --test-name-pattern "contract\|16\." doctor-checks/21-22-project.test.cjs` | 1, 1 | FAIL: module missing; DEFERRED lacks W062 and W062 sets severity warn (correct) |
| GREEN (T3) | `node --test doctor-checks/26-checks-workflow-pin.test.cjs doctor-checks/21-22-project.test.cjs doctor.e2e.test.cjs` | 0 | PASS, 38 tests (correct) |

## Deviations from Plan

None that change behaviour. Points the next TRDs should know:

1. **The verification grep is not exact.** `rg -n "W062" plugins/devflow/devflow/bin/lib --glob '!*.test.*'` lists checks-pin.cjs, validate.cjs and 22-validate-health.cjs, as the TRD expects. It also lists two comment lines in `26-checks-workflow-pin.cjs` and the README row, and the TRD itself requires that README row ("owns W062, which `22` defers"). The code is still emitted from one place: `checks-pin.cjs` builds the finding, and `validate.cjs` adds only its own check-failed line. Check 26 takes `code` from the finding and never spells `'W062'` in code.
2. **Tests added beyond the numbered list (1-16):**
   - a source-scan structure test: checks-pin requires only fs and path, and gh-setup defines none of the three constants;
   - parsing: CRLF text, the split at the last `@`, and a header below line 5;
   - the W062 message when the two refs disagree;
   - error paths: an unreadable workflow path in all three layers (check-failed in validate, a warn in doctor, a throw from `readWorkflowPin`);
   - doctor: a no-project ok and a non-release running version.

   Each covers a behaviour the TRD's gotchas or anti-patterns already describe.

## Discovered commands

None. The project STACK.md supplied `test` (`npm test`, scoped `node --test {files}`).

## Flutter UI Evidence

Not applicable (TRD is `type: standard`).

## Notes for 61-06 and 61-07

- **61-06** prints `require('./checks-pin.cjs').parseWorkflowPins(text).lines`. These are the trimmed `uses:` and `devflow-ref:` lines in file order, and only the first of each. gh-setup.cjs already requires checks-pin.cjs, so add `parseWorkflowPins` to that existing destructure. Do not add a second require.
- **61-07** goes after Check 17 in `validate.cjs`, before the `Perform repairs if requested` block. The DEFERRED header comment in `22-validate-health.cjs` is now one line per owner, so W063 takes one more line. The DEFERRED pin in `21-22-project.test.cjs` is the single `assert.deepEqual(health.DEFERRED, [...])` in `validate-health: contract`. Its comment lists owners the same way, and the W062 classify case is test 16 in `validate-health: spawn contract (test 14)`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5:
  - W062 names the file, the ref and the installed version.
  - Doctor check 26 is a warn with the `gh setup --apply` fix_command, and check 22 defers W062.
  - Current, ahead, branch/SHA, unmanaged and absent produce no warning.
  - The installed version comes from `installedPlugin`, falling back to the running engine.
  - The fix text names `gh setup --apply` and the `github.checks_workflow` @ref caveat.
- Gate failures: None from this TRD. The scoped task gate passes. The 12 full-suite failures are listed under Validation Gate Results.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/checks-pin.cjs, checks-pin.test.cjs, validate-checks-pin.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.cjs, 26-checks-workflow-pin.test.cjs
- FOUND: 0add0fd8, 25e70912 (Task 1 RED, GREEN); 75cb6015, 56753f3a (Task 2 RED, GREEN); 50862dca, a631fccc (Task 3 RED, GREEN)
- Working tree clean after the Task 3 commit; `checks-pin.cjs` requires only fs and path
