---
objective: 36-upgrade-in-place
trd: "07"
subsystem: init
tags: [init, bootstrap, workflows, cli, devflow-self-hosting]

# Dependency graph
requires:
  - objective: 36-upgrade-in-place
    provides: "existing bootstrapProjectMd/bootstrapObjectiveMd in project-bootstrap.cjs (self-healing PROJECT.md / OBJECTIVE.md)"
provides:
  - "bootstrap_objectives.paths in init execute-objective and init plan-objective JSON"
  - "One-line bootstrap surface printed by both plan-objective.md and execute-objective.md workflows when init silently changed a file"
  - "Dead backfillAllObjectives import removed from init.cjs (project-bootstrap.cjs still exports it for 36-04b's migration 0004)"
affects: [36-04b, plan-objective, execute-objective]

# Tech tracking
tech-stack:
  added: []
  patterns: ["init commands report project-relative created-file paths alongside applied/skipped counts, so workflows can name what changed instead of just counting it"]

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/execute-objective.md

key-decisions:
  - "paths computed as path.relative(cwd, _bootstrapR.path) with POSIX separators, matching the TRD's codebase_examples exactly"
  - "Bootstrap surface paragraph text is identical in both workflows per the TRD (only heading level context differs)"

patterns-established:
  - "TDD test list appended near the existing FIX-1 tests using the same makeFixture/execSync integration-test style already established in init.test.cjs"

requirements-completed: ["UPG-07"]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 5min
completed: 2026-09-27
---

# Objective 36 TRD 07: Surface init's bootstrap results; drop the dead import Summary

**`init execute-objective`/`init plan-objective` now report which OBJECTIVE.md path they silently created, and both orchestrator workflows print one line about it instead of staying silent; the unused `backfillAllObjectives` import is gone from init.cjs.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-27T22:41:59Z
- **Completed:** 2026-09-27T22:46:03Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `bootstrap_objectives.paths` (project-relative, POSIX-separated, empty array when nothing applied) added to both `cmdInitExecuteObjective` and `cmdInitPlanObjective` in init.cjs
- `plan-objective.md` and `execute-objective.md` each gained a "Bootstrap surface" instruction that prints exactly one line — naming the PROJECT.md fields added and/or the OBJECTIVE.md path created — right after the init JSON is parsed, and nothing when neither bootstrap applied
- Removed the dead `backfillAllObjectives` import from init.cjs line 10 (still exported by project-bootstrap.cjs for 36-04b's migration 0004)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: bootstrap_objectives.paths + drop dead import | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 0 | PASS |
| 2: workflows print one-line bootstrap surface | `rg -c "Bootstrap surface" plugins/devflow/devflow/workflows/plan-objective.md plugins/devflow/devflow/workflows/execute-objective.md` | 0 | PASS (1 each) |

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: bootstrap paths test list** - `0abeeba` (test)
2. **Task 1 GREEN: init reports created OBJECTIVE.md paths; drop unused import** - `1c42500` (feat)
3. **Task 2: workflows surface init bootstrap changes in one line** - `befc7be` (docs)

**Plan metadata:** (this commit) — SUMMARY + STATE.md + ROADMAP.md

_Note: Task 1 is TDD (`tdd="true"`); Task 2 is a standard doc task with no separate REFACTOR commit needed._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| init + project-bootstrap unit tests | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs` | 0 | PASS (56/56) |
| Bootstrap surface paragraph count | `rg -c "Bootstrap surface" plugins/devflow/devflow/workflows/plan-objective.md plugins/devflow/devflow/workflows/execute-objective.md` | 0 | PASS (1, 1) |
| dead import removed | `rg -n backfillAllObjectives plugins/devflow/devflow/bin/lib/init.cjs` | 1 (no match, expected) | PASS |
| Wave regression gate | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | PASS (see Regression Gate Classification below — the sole failure is baseline) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (with test cases 36-07-1/2/3 added, `paths` field not yet implemented) | 1 | FAIL (correct — 3 new assertions failed with `paths` undefined) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (after `paths` field added to both init commands) | 0 | PASS (correct — 37/37) |

Task 2 is `type="auto"` (no `tdd` attribute) — standard verification only, no RED/GREEN pairing.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 4/4 (paths in both commands' JSON; both workflows print the one-liner; dead import gone / project-bootstrap.cjs still exports it; existing FIX-1 tests unchanged and still pass)
- **Gate failures:** None (regression gate's sole failure, MA-7, is baseline — see below)

## Regression Gate Classification (baseline-relative)

Full suite: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`, run from repo root, output written to session scratchpad only.

**Observed totals:** 3658 tests, 3625 pass, 1 fail, 32 skipped, 514 suites (44.5s).

**Failures and classification:**

| Test | File:Line | Classification | Reason |
|---|---|---|---|
| `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Pre-existing (baseline)** | Present verbatim in `baseline-failures.tsv` (line: `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3<TAB>MA-7 doctl auth init...`) — one of objective 35's known 1Password-signing-timeout failures, unrelated to this TRD's diff. |

No other failures observed this run (the 11 daemon/PID worktree failures in the 21-line baseline did not fire — expected, since this executor ran in the main checkout, not a worktree). All 3 new `36-07-*` test cases (paths field) and all existing FIX-1/18I* init tests pass. `baseline-failures.tsv` was not edited.

**Gate verdict: HOLDS.** Zero regressions.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/init.cjs` — added `bootstrap_objectives.paths` to both `cmdInitExecuteObjective` and `cmdInitPlanObjective`; trimmed `backfillAllObjectives` from the `require('./project-bootstrap.cjs')` destructure
- `plugins/devflow/devflow/bin/lib/init.test.cjs` — 3 new integration tests (36-07-1/2/3) covering `paths` on first run, second-run no-op, and plan-objective parity
- `plugins/devflow/devflow/workflows/plan-objective.md` — "Bootstrap surface" one-line instruction after the init "Parse JSON for:" paragraph; `bootstrap`/`bootstrap_objectives` added to the parsed-field list
- `plugins/devflow/devflow/workflows/execute-objective.md` — same insertion in `<step name="initialize">`

## Decisions Made
None beyond the TRD's own codebase_examples — implementation followed the TRD's specified paths field expression and workflow paragraph text verbatim.

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness
- Wave 3 continues with 36-08 (dogfood `upgrade` on this repo, CHANGELOG, USER-GUIDE, `intent.cjs:249` pointer). No blockers from this TRD.
- `backfillAllObjectives` remains exported from `project-bootstrap.cjs` for 36-04b's migration 0004 to revive, as required.

---
*Objective: 36-upgrade-in-place*
*Completed: 2026-09-27*
