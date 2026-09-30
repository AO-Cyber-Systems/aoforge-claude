---
objective: 42-codebase-aware-stack-drafter
trd: "01"
job: 42-01
subsystem: stack-profile
tags: [stack-profile, validate, cli, dates, dispatch]

requires: []
provides:
  - "helpers.localDate(now = new Date()) -> local-calendar 'YYYY-MM-DD'"
  - "STK010 validator warning for placeholder skill pins (any whole-string <...>), at every chain tier"
  - "validate health W032 carries STK007 and STK010, each with its own fix hint"
  - "stack validate rejects a positional path (exit 1, names --profile)"
  - "STACK_EXTENSIONS + loadStackExtension: lazy `stack verify|report|mcp` dispatch to stack-<sub>.cjs"
affects: [42-02, 42-06, 42-08, 42-09]

tech-stack:
  added: []
  patterns:
    - "Extension modules export cli(cwd, args, raw, { userHome }); cmdStack lazy-requires them inside the dispatch branch"
    - "Dates a human reads come from helpers.localDate, never toISOString().slice(0, 10)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/helpers.cjs
    - plugins/devflow/devflow/bin/lib/helpers.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-validate.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs

key-decisions:
  - "draftProfile/initProfile take an optional `now`; adopt scaffold passes its own `now` through, so STATE, ROADMAP and STACK.md provenance.reviewed agree on one clock"
  - "cmdStack gained an optional 4th arg { libDir } (default __dirname), so tests can check the exact cli(...) call against a stub without depending on a shipped stack-verify.cjs"
  - "W032 message text stays `stack-profile-warning: <msg>` (STK007 output byte-identical); only the fix hint varies per code"
  - "STK010 labels the layer (`org layer 'acme'`, `project layer`) and sets `file` to that layer's path, so an inherited placeholder points at the org profile, not STACK.md"

patterns-established:
  - "Local-constructor dates in tests (new Date(2026, 8, 28, 23, 30) and 00:30) so date assertions hold in every time zone"

requirements-completed: [SDR-07]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-09-28
---

# Objective 42 TRD 01: Validation fixes, local date, and stack-extension dispatch Summary

**`stack validate` now warns STK010 on `<sha>`-style skill pins (shown as W032 in health) and rejects positional paths. `provenance.reviewed` and adopt's STATE/ROADMAP dates use the local calendar day. `stack verify|report|mcp` dispatch lazily to sibling modules.**

## Performance

- Tasks: 3/3, each committed as RED then GREEN
- Commits: 6 task commits, plus this SUMMARY

## Accomplishments

- **Local date (Task 1).** `helpers.localDate()` builds the date from the local getters. `draftProfile` and `initProfile` accept `now`, and adopt `scaffold` uses `localDate` and threads its `now` into `initProfile`. `report` uses it too. The bug reproduced live during RED: at 22:29 EDT on 2026-09-28 the old code drafted `reviewed: 2026-09-29`.
- **STK010 (Task 2).** `runValidationRules` walks every resolved layer's `agent_tooling.skills`, plus the target's own parse if it is not already a layer. For any pin matching `/^<[^<>]+>$/` it pushes `{ code: 'STK010', path, msg, file }`, deduped per (source, pin, layer path). `ok` is never flipped.
- **W032 (Task 2).** A per-code fix map: STK007 keeps "Trim the profile body; ...", and STK010 gets "Pin agent_tooling.skills[].pin to a real commit SHA".
- **Positional rejection (Task 2).** `stack validate <non-flag>` errors with `stack validate takes --profile <path>, not a positional path` before any validation runs.
- **Extension dispatch (Task 3).** `STACK_EXTENSIONS = { verify, report, mcp }` maps to `stack-<sub>.cjs`, and a comment above it documents the module contract. `loadStackExtension` returns null for a missing file or a non-extension name, and it does not swallow load errors. The unknown-subcommand error lists all eight subcommands.

## Commits

| Hash | Message |
|---|---|
| 58fc481 | test(42-01): add failing tests for local-date provenance and adopt dates |
| 47d1e91 | fix(42-01): use the local calendar date for provenance.reviewed and adopt dates |
| a6810f6 | test(42-01): add failing tests for STK010 placeholder pins, W032 widening, positional-path rejection |
| acec089 | feat(42-01): warn on placeholder skill pins (STK010) and reject positional stack validate paths |
| cf21ba8 | test(42-01): add failing tests for lazy stack verify/report/mcp dispatch |
| c88b8bb | feat(42-01): lazy STACK_EXTENSIONS dispatch for stack verify/report/mcp |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: localDate + draftProfile/adopt | `node --test helpers.test.cjs stack-init.test.cjs adopt-scaffold.test.cjs` | 0 (41/41) | PASS |
| 1: done check | `rg -n "toISOString\(\)\.slice\(0, 10\)" stack-profile.cjs adopt.cjs` | 1 (no matches) | PASS |
| 2: STK010 + W032 + positional | `node --test stack-validate.test.cjs stack-cli.test.cjs validate.test.cjs stack-profile.test.cjs` | 0 | PASS |
| 3: extension dispatch | `node --test stack-cli.test.cjs stack-profile.test.cjs` | 0 (P11 green) | PASS |
| CLI: positional | `df-tools stack validate .planning/STACK.md` | 1 ("takes --profile <path>, not a positional path") | PASS |
| CLI: --profile | `df-tools stack validate --profile .planning/STACK.md --raw` | 0 (`ok`) | PASS |
| CLI: verify | `df-tools stack verify` | 1 ("stack verify is not available in this build") | PASS |

## TDD Evidence

| Task | Phase | Command | Exit Code | Expected |
|---|---|---|---|---|
| 1 | RED | `node --test helpers/stack-init/adopt-scaffold` | 1 (localDate missing; reviewed `2026-09-29`; STATE `2026-09-29`) | FAIL (correct) |
| 1 | GREEN | same | 0 | PASS (correct) |
| 2 | RED | `node --test stack-validate/stack-cli/validate` | 1 (no STK010; positional exit 0 on STACK.md; no W032) | FAIL (correct) |
| 2 | GREEN | same + stack-profile.test.cjs | 0 | PASS (correct) |
| 3 | RED | `node --test --test-name-pattern "L1[23]" stack-cli.test.cjs` | 1 (7/7 failing: exports missing, old subcommand list) | FAIL (correct) |
| 3 | GREEN | `node --test stack-cli.test.cjs stack-profile.test.cjs` | 0 | PASS (correct) |

REFACTOR: not needed. Each GREEN was minimal.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs' helpers.test.cjs validate.test.cjs` | 0 (321 tests) | PASS |
| wave | `NODE_PATH=<main>/node_modules npm test` | 1 (2 fails: 1 known, 1 orchestrator-owned) | PASS (no new code failures) |

npm test totals: **tests 4303, suites 642, pass 4269, fail 2, cancelled 0, skipped 32**. The baseline was tests 4278 / pass 4245 / skipped 32. The +25 tests are exactly the ones this TRD added (helpers 5, stack-init 3, adopt-scaffold 1, stack-validate 6, validate 2, stack-cli 8).

- `MA-7 doctl auth init ...` under `handoff pipeline — PTY-path mock auth (TRD 19-05)` is the known pre-existing handoff-e2e failure.
- `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` is expected and orchestrator-owned. It fires only because this SUMMARY exists while ROADMAP.md's `- [ ] 42-01-TRD.md` box is still unticked (`trd_summary_exists` drift). Per the dispatch, ROADMAP.md is updated by the orchestrator after the wave merges. That tick clears it.

**Environment note.** The provisioned worktree has no `node_modules` (it is gitignored, so it is not carried into a new worktree). The first plain `npm test` therefore failed 10 devflow-watch and handoff-e2e daemon tests with `Cannot find module 'node-pty'`, and skipped 50. Running with `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules` gives the baseline-comparable result above. Nothing was installed and no files changed.

## Deviations from Plan

**1. [Rule 1 - Bug] H11's status assertion was wrong in the new test**
- **Found during:** Task 2 GREEN
- **Issue:** The bare `makeProject` fixture has no PROJECT.md or STATE.md, so `validate health` reports `broken` for reasons unrelated to STK010. `status !== 'broken'` could never pass.
- **Fix:** The test now asserts that no error entry mentions STK010 or a placeholder, plus the existing "no E030" check. This is the TRD's actual intent: the pin warning is never an error. The fix was committed with the Task 2 GREEN commit (acec089). No pre-existing assertion was loosened.

**2. [Rule 2 - Consistency] adopt scaffold passes `now` into `initProfile`**
- Without this, adopt's STACK.md `reviewed` would read the wall clock while STATE and ROADMAP used the injected `now`. The change is one argument in adopt.cjs, which is in files_modified. Test 17 asserts all three dates.

**3. [Design seam] `cmdStack(cwd, args, raw, { libDir })`**
- The TRD asks the CLI-level "not available" and stub-call tests not to depend on a shipped `stack-verify.cjs`. An optional 4th arg that defaults to `__dirname` lets the tests drive `cmdStack` in-process against a temp libDir. df-tools still calls it with three arguments.

**Process note (not a code deviation).** The first preflight ran with the Bash cwd in the main checkout, so it claimed `/Users/justin/dev/devflow-claude` for 42-01. That stray claim was released at once with `exec-context release --id 42-01`, and the check was re-run from the worktree. It passed there: `is_worktree: true`, `base_visible: true`.

No files outside files_modified were touched, apart from this SUMMARY.

## Follow-up (out of scope per TRD anti_patterns)

These UTC date sites remain (`toISOString().slice/substring(0, 10)` or `.split('T')[0]`). Each should move to `helpers.localDate` where the value is a human-read "today":

- `bin/lib/misc.cjs:30, 547, 559`
- `bin/lib/init.cjs:712, 882`
- `bin/lib/objective.cjs:711`
- `bin/lib/state.cjs:256`
- `bin/lib/roadmap.cjs:357, 443`
- `bin/lib/roadmap-reconcile.cjs:539`
- `bin/lib/templates.cjs:41`
- `bin/lib/project-bootstrap.cjs:166`
- `bin/lib/validate.cjs:670` (STATE.md regenerate line)
- `bin/lib/micro.cjs:98`
- `bin/lib/ui-spec-lock.cjs:277`
- `bin/lib/changelog.cjs:159`
- `bin/lib/check-todos.cjs:640`
- `bin/lib/workstreams.cjs:258, 365, 409`
- `bin/lib/migrations/0002-job-to-trd.cjs:122`, `bin/lib/migrations/0007-doc-refs-fix.cjs:142`

Also: `help.cjs`'s `stack` usage line still lists only resolve/context/validate/command/init. 42-06, 42-08 and 42-09 should add verify/report/mcp there when they ship the modules (help.cjs is not in this TRD's files).

The shipped `docs/stack-profiles/{go,dart,flutter}.md` still carry `pin: "<sha>"`, so they now produce STK010 warnings (still `ok: true`; V13 asserts only `ok`). 42-02 re-pins them.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (STK010→W032 with ok true; positional rejection; localDate for reviewed and adopt; lazy verify/report/mcp dispatch with a clean "not available"; P11 green)
- Gate failures: None

## Self-Check: PASSED

- All 6 task commits found (`git cat-file -e`): 58fc481, 47d1e91, a6810f6, acec089, cf21ba8, c88b8bb
- `git diff --stat 51cf0b3 HEAD` touches exactly the 10 files in files_modified (534+/26-)
- Working tree clean apart from this SUMMARY; STATE.md and ROADMAP.md untouched (orchestrator-owned)
