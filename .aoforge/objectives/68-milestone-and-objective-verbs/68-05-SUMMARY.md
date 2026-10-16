---
objective: 68-milestone-and-objective-verbs
trd: "05"
subsystem: tooling
tags: [df-tools, flag-guard, flag-spec, unknown-flag, repo-test, TOOL-01]

requires:
  - objective: 68-milestone-and-objective-verbs
    provides: "68-03: checkFlags, FLAG_SPEC (planning and state writers), PROBES, specEntries, the dispatcher guard"
provides:
  - "FLAG_SPEC for all 51 commands help.cjs marks mutates: true (138 probe-able entries)"
  - "flag-spec.repo.test.cjs: spec = writing commands, PROBES = spec, reasons on every switched-off rule, every documented invocation accepted, with sensitivity controls"
  - "The spawn test covers the whole spec, including ownParser entries rejected by their own module"
affects: [68-04, 68-07]

tech-stack:
  added: []
  patterns:
    - "A repo test scans the plugin's own prose for df-tools invocations and runs them through the dispatcher's checkFlags (spec cannot drift from the docs)"
    - "Each structural gate is a pure function with a synthetic-input control, so it is shown to fail"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/flag-spec.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs

key-decisions:
  - "decision-queue gets explicit per-subcommand rules, not ownParser: its parser turns any unknown --x into a boolean (`decision-queue list --zz-unknown` exits 0), so the TRD's ownParser premise did not hold"
  - "stack verify gets an explicit rule although its parser rejects too, so the guard answers first and names the entry; stack report and stack mcp stay ownParser"
  - "migrate plan accepts the apply flags (help.cjs documents one flag list for both); plan is read-only and ignores them"
  - "A placeholder (<x>, {x}, ${X}) stays one non-flag token in the extracted argv instead of being dropped, so a value flag still consumes it and the flag after it is still checked"

patterns-established:
  - "A new writing command needs a help.cjs entry with mutates: true, a FLAG_SPEC entry and a PROBES key; flag-spec.repo.test.cjs fails on any of the three missing"
  - "An exemption in the documented-invocation scan must still suppress a finding, so a fixed line takes its entry with it"

requirements-completed: [TOOL-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-08
tokens_input: 17739247
tokens_output: 87843
tokens_cache_read: 17508944
tokens_cache_write: 230103
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 05: Every writing command rejects an unknown flag, and the spec stays in step with the docs Summary

**FLAG_SPEC now covers all 51 writing df-tools commands (138 probe-able entries, 9 `ownParser`), every entry is proven by a spawn probe to exit 1 on an unknown flag with the tree unchanged and no gh call, and a repo test keeps the spec complete against help.cjs and accepting of the 820 documented invocations of writing commands.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-10-08T16:39:02Z
- **Completed:** 2026-10-08T16:55:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `flag-spec.cjs`: 29 more commands (81 more entries) read against their dispatcher arm and handler module: flutter-ui, ui, generate, migrate, upgrade, adopt, doctor, tokens, calibrate, estimate, transcript-export, override, handoff, workstreams, changelog, defaults-table, gh (13 subcommands, nested forms as unions), stack (8), planning, project-hygiene, decision-queue, initiatives, sync-roadmap, deprecation, project-decline, project-accept, merge-driver, exec-context, global-config. 51 commands, 138 labels.
- `flag-guard-fixtures.cjs`: PROBES grew from 57 to 138 argv, one per label. Anything that could act outside the temp project if it were not rejected first names something that does not exist (`/nonexistent/df-flag-probe`, a missing manifest), so the RED run could do no more than fail.
- `flag-guard-cli.test.cjs`: test 15 now loops the whole spec; an `ownParser` entry is accepted when its module's own message names the flag; the gh-call check is a per-probe delta; test 19 asserts the spawn loop skips exactly `handoff create` (tailFrom) and `state patch` (anyFlags); test 20 holds the positive controls (`migrate plan --dry-run`, `changelog update --dry-run --version v9.9.9`, `planning mode`, `exec-context check --repo <root>`). The loop went from 37.6 s (unguarded commands really running) to about 9 s.
- `flag-spec.repo.test.cjs` (new): tests 4-9 plus sensitivity controls (below).
- Measured: the scan reads 196 files, extracts 1016 `df-tools` invocations, 820 of a writing command, 360 of those with at least one flag (122 distinct command:flag pairs), and the spec accepts every one.

## Task Commits

1. **Task 1: probes and spec for the remaining writing commands** - `e73f5996` (test, RED), `3de18791` (feat, GREEN)
2. **Task 2: the repo test** - `791924de` (test), `21a4c343` (test, sensitivity controls)

## Decisions Made

- See `key-decisions`. The one that departs from the TRD text is decision-queue (explicit rules, not ownParser).
- The scan set is exactly the TRD's: `plugins/devflow/{skills,agents,hooks}`, `plugins/devflow/devflow/{workflows,references,templates}`, `docs/USER-GUIDE.md`, `CLAUDE.md`. Within it, `*.test.*` files, `__fixtures__` and `node_modules` are skipped (a test names a bad flag on purpose); no directory was dropped to make the scan pass. `.planning/`, CHANGELOG.md and `site/` stay out as the TRD says.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] decision-queue is not an ownParser command**
- **Found during:** Task 1, probing the TRD's ownParser list before writing the spec
- **Issue:** The TRD lists decision-queue as `ownParser` (a probe on 2026-10-08 "confirmed exit 1"). That probe was `decision-queue --zz-unknown`, which fails only because `--zz-unknown` sits where the subcommand goes. `decision-queue list --zz-unknown` exits 0: `_parseFlags` stores any unknown `--x` as a boolean.
- **Fix:** explicit rules per subcommand from `_parseFlags` and the subcommand bodies: `add` (`--objective --trd --wave --title --context --options --recommendation --blocks --independent`), `list` (`--status`), `resolve`, `notify`. The error_recovery clause of the TRD (change to an explicit rule) applies.
- **Files modified:** plugins/devflow/devflow/bin/lib/flag-spec.cjs
- **Commit:** 3de18791

**2. [Rule 2 - Missing critical] stack verify also gets an explicit rule**
- **Found during:** Task 1
- **Issue:** Not required (its parser rejects), but `ownParser` entries are rejected in the module's own words and skip the documented-invocation check; `verify` has a small closed flag set that the docs use (`--run`).
- **Fix:** `stack verify: { values: --include --keys --timeout, bools: --run --draft }`.
- **Commit:** 3de18791

### Additions within the TRD's files

- Test 15 expectation for `ownParser` entries, per-probe gh delta, test 19 and test 20 (above).
- In `flag-spec.repo.test.cjs`: the gates are pure functions (`completenessGaps`, `rulesWithoutReason`, `exemptionProblems`, `scanFindings(spec)`) so each has a "sensitivity" test on a broken input, including `structuredClone(FLAG_SPEC)` minus `exec-context check --base` reported at `docs/USER-GUIDE.md`, `agents/executor.md`, `workflows/execute-objective.md` and `workflows/quick.md`. The TRD's "temporarily delete a flag" check is therefore a permanent test. This is why the last commit is a `test(...)` and not the TRD's suggested `fix(...)`: no spec row or doc line needed fixing.
- Extractor refinement: a `<placeholder>`, `{placeholder}` or `${VAR}` is kept as one non-flag token (the TRD says "dropped"), so `--from <draft> --no-flush` still checks `--no-flush`.

### Doc fixes and findings from the scan

- Spec rows added from scan failures: none. The scan passed on its first run against the spec as written from the code.
- Plugin doc lines corrected: none.
- EXEMPT entries: none (the list is empty; test 9 fails if one stops matching).
- Sensitivity runs done by hand before they became tests: `exec-context check` without `--base` -> test 7 failed naming 5 file:line sites; deleting the `sync-roadmap` entry -> tests 4 and 5 failed; blanking the `handoff create` reason -> test 6 failed; an invented EXEMPT entry -> test 9 failed. The spec and tree were restored with `git checkout` each time.

### Spec entries by kind

- `ownParser` (9, each with a reason): upgrade, doctor, tokens, calibrate, estimate, transcript-export, override, stack report, stack mcp. The probe loop proves each exits 1 naming `--zz-unknown`, tree unchanged, no gh call (estimate and tokens check flags per subcommand in their parser, read in `estimate-cli.cjs` / `tokens-cli.cjs`).
- `anyFlags`: `state patch`. `tailFrom`: `handoff create`. Not spawned by the loop (test 19).
- `migrate plan` accepts `--kind --default-work --work-choices --dry-run` although the arm ignores them (help.cjs documents one list for both; plan is read-only).

## Observations (not acted on)

- Documented calls to `ownParser`/`anyFlags`/`tailFrom` commands (`upgrade`, `tokens --write`, `estimate wave ... --start`, ...) are not judged by test 7, since the spec cannot say what they accept; their modules reject at run time.
- The 68-03 note stands: `agents/executor.md` shows `state add-blocker "Blocker description"` with a positional where the arm reads `--text`. No flag is involved, so the guard and this scan do not see it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: spec and probes | `node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (31 tests) | 0 | PASS |
| 2: repo test | `node --test plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs` (14 tests) | 0 | PASS |
| scoped gate | `node --test flag-guard-cli.test.cjs flag-guard.test.cjs flag-spec.repo.test.cjs help.test.cjs dispatch-completeness.test.cjs gh-project.test.cjs` (100 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs` (15, 15b, 19 fail: about 80 group-2 labels exit 0, write, or are not in the spec; 20 passes as a control) | 1 | FAIL (correct) |
| GREEN (task 1) | same command (16 tests, then 31 with flag-guard.test.cjs) | 0 | PASS (correct) |
| Task 2 | `node --test plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs`: passed at first run (the spec landed in task 1); the hand-run sensitivity edits above failed tests 4, 5, 6, 7, 9 and are now permanent tests | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the six files above | 0 | PASS |
| test (full) | `npm test` | 1 | PASS at baseline (see below) |

Full suite: 11263 tests, 11202 pass, 11 fail, 50 skipped. The failures are the `devflow-watch` daemon start/stop and multi-project CLI suites, the `handoff pipeline end-to-end` tests (including `route-results` idempotency and multi-record), and `roadmap-reconcile` E2E1. These are the 68-03 baseline set (11 to 12 failures varying by run). E2E1 reports drift only between the SUMMARY checkpoint and `roadmap update-job-progress`, which runs at the end of this TRD. No test mentions an unknown-flag rejection of a documented call. `lint`, `typecheck` and `build` are `none` in the stack profile.

## Discovered commands

None. The profile (`general`) names `npm test` and `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (every writing command has an entry and nothing else does: test 4; every entry exits 1 naming an unknown flag, `ownParser` ones included, with an unchanged tree and no gh call: test 15; every documented invocation is accepted: test 7 over 820 invocations; every anyFlags/ownParser/tailFrom rule has a reason and the EXEMPT list is empty with no stale entry: tests 6 and 9)
- Gate failures: None caused by this TRD (the remaining failures are the baseline daemon/handoff suites and the transient E2E1)

## Progress
- [x] Task 1: Spec entries and probes for the remaining writing commands (tests 1-3) — e73f5996 (RED), 3de18791 (GREEN)
- [x] Task 2: The repo test that keeps the spec complete and the docs accepted (tests 4-9) — 791924de (test), 21a4c343 (sensitivity controls)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/flag-spec.cjs, flag-spec.repo.test.cjs, flag-guard-cli.test.cjs, __fixtures__/flag-guard-fixtures.cjs
- FOUND commits: e73f5996, 3de18791, 791924de, 21a4c343
