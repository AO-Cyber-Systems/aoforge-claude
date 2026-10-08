---
objective: 68-milestone-and-objective-verbs
trd: "01"
subsystem: milestone-verbs
tags: [milestone-complete, dry-run, idempotence, plan-apply]
requires: []
provides:
  - "planMilestoneComplete / applyMilestonePlan in roadmap.cjs (read-only plan, executor of that plan)"
  - "milestone complete --dry-run (local mode)"
  - "milestoneHeadingPattern(version) in text-escape.cjs, the one MILESTONES.md heading rule"
  - "re-run safe milestone complete: kept archives, kept entry, kept occupied destinations"
affects: [68-06 store-mode milestone dry-run, 68-03 flag guard, 68-07 dogfood]
tech-stack:
  added: []
  patterns: [plan-then-execute (computeRemovalPlan shape), keep-not-overwrite idempotence]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/text-escape.cjs
    - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs
key-decisions:
  - "A real run executes the plan object the dry run prints; applyMilestonePlan decides nothing, so dry-run and real run cannot drift."
  - "An existing archive file is kept, never refreshed: a re-run after ROADMAP.md was reorganised must not destroy the archive."
  - "Dotted versions are normalised (1.0 -> v1.0) with gh-milestone normaliseVersion; any other argument is kept as given."
requirements-completed: [TOOL-01, TOOL-02]
duration: 11min
completed: 2026-10-08
tokens_input: 8452169
tokens_output: 60418
tokens_cache_read: 8262117
tokens_cache_write: 189928
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 01: milestone complete plans before it writes Summary

**`milestone complete` is now a read-only plan plus an executor of that plan: `--dry-run` prints it and writes nothing, and a second run keeps the existing MILESTONES.md entry and archive files instead of duplicating or overwriting them.**

## Progress
- [x] Task 1: Fixture builders for dry-run and re-run projects — 6f6f5f95
- [x] Task 2: Plan, apply and --dry-run (tests 1-6) — RED 07e1c191, GREEN 21d1841d
- [x] Task 3: Re-run safety and version normalisation (tests 7-14) — RED cc8012e6, GREEN 60d65c5d

## What changed

- `roadmap.cjs`: `cmdMilestoneComplete` split into `planMilestoneComplete(cwd, version, options)` (reads only; returns the stats, the exact `milestone_entry`, the ordered `ops`, `kept` and `warnings`) and `applyMilestonePlan(cwd, plan)` (loops over `ops`; creates a parent directory only for an op that writes there, so a dry run or a run with nothing to archive no longer creates `.planning/milestones/`). `renderMilestonePlan` writes the `DRY RUN — nothing has been modified.` text to stderr, the `objective remove` convention.
- Output contract: a real run keeps every existing key and adds `dry_run: false`, `written`, `moved`, `kept`, `milestones_reason`, `warnings`; `milestones_updated` now means "MILESTONES.md bytes changed". A dry run prints the same stats plus `dry_run: true`, `would_write`, `would_move`, `would_keep`, `milestone_entry`, `warnings`. Paths are project-relative POSIX.
- Re-run rules: existing archive file -> kept (`exists`); MILESTONES.md already holding the version heading (`milestone put` entry, earlier run, legacy `## 1.0`) -> kept byte for byte (`entry_exists`, `milestone_entry: null` in the dry run); audit file or objective directory whose destination exists -> stays put (`destination_exists` plus a warning), which also removes the ENOTEMPTY crash.
- `text-escape.cjs`: `milestoneHeadingPattern(version)`, `^## +v?<digits>(?=\s|$)` with the dot escaped; `v1.0` and `1.0` give the same source, `## v1.0.1`, `## v1.00`, `## v10.0`, `### v1.0` do not match.
- Wiring: `planning-verbs-cli.cjs` local branch passes `dryRun: has(args, '--dry-run')`; `help.cjs` usage lists `[--dry-run]`.
- Fixtures: `makeMilestoneProject(..., {files})` seeds arbitrary files; `planningTree(root)` returns files and directories; MILESTONES/audit constants exported for 68-06.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "...makeMilestoneProject(undefined,{files:...}); planningTree..."` prints `true true`; `node --test milestone-complete.test.cjs` | 0 | PASS |
| 2: plan/apply/--dry-run | `node --test milestone-complete.test.cjs` (D1-D6 plus S1-S4, 1-10); `node --test df-tools.test.cjs --test-name-pattern "milestone complete"`; `node --test planning-verbs-cli.test.cjs help.test.cjs text-escape.test.cjs` | 0 | PASS |
| 3: re-run safety | `node --test milestone-complete.test.cjs text-escape.test.cjs` (R7-R13, TE-25..27); `node --test df-tools.test.cjs --test-name-pattern "milestone complete"` | 0 | PASS |

TDD order held for tasks 2 and 3: RED commits 07e1c191 (D1-D6 failed: 6/6) and cc8012e6 (R7-R13 failed 7/7, TE-25..27 failed 3/3 with `milestoneHeadingPattern is not a function`), then GREEN commits.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test milestone-complete.test.cjs text-escape.test.cjs planning-verbs-cli.test.cjs help.test.cjs` | 0 | PASS (66 -> 82 tests, 0 failures) |
| test (df-tools) | `node --test df-tools.test.cjs --test-name-pattern "milestone complete"` | 0 | PASS (3/3) |
| test (full) | `npm test` | 1 | PASS vs baseline: 11 failures after, 12 before, all in the known-environment set (devflow-watch daemon start, handoff pipeline, E2E1 reconcile self-test); the membership of the flaky ones differs between runs (C-1 vs C-2 start, upgrade-project test 10, SC1 audit), none touches files this TRD owns. Tests: 11188 -> 11204 (+16 = D1-D6, R7-R13, TE-25..27). |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

Baseline failing set (taken before the first change, `scratchpad/baseline-full.txt`): devflow-watch start/stop (4), devflow-watch multi-project CLI, handoff pipeline end-to-end (5), E2E1 SELF-TEST reconcile against this repo ROADMAP, `10. upgrade-project.js [fast path ...]`, SC1 behavioral audit. C-1/C-2 also fail when run alone in this worktree (`.devflow/devflow-watch.pid` never appears: the daemon does not start here), and C-2 is in the pre-change baseline, so the failure is the environment's, not the change's.

## Discovered commands

None: `npm test` came from the bundled general profile and package.json.

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written, with these notes:

- Test names: the TRD numbers its new tests 1-13, which collide with the existing 1-10 in `milestone-complete.test.cjs`. The new tests are named `D1`-`D6` (dry run) and `R7`-`R13` (re-run); text-escape tests continue the file's numbering as `TE-25`..`TE-27` (the TRD's single "test 14" became three tests: matches, non-matches, 1.0 == v1.0).
- SUMMARY file name: `summary checkpoint|post 68-01` writes `68-01-SUMMARY.md`, which `helpers.trdKey` pairs with the named `68-01-<slug>-TRD.md`.
- `archived.objectives` is now "at least one objective directory was moved by this run" (previously `toArchive.length > 0`); identical for every previously reachable case.

## Authentication Gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (dry run leaves `.planning/` byte-identical with no new directory: D1, D4; parity of real run and dry run: D5; twice -> one entry and one archive set: R7, R8; `1.0` == `v1.0`: R9; `milestone put` entry survives: R10; existing tests pass unchanged: S1-S4, 1-10, df-tools.test.cjs `milestone complete command`, planning-verbs-cli test 7)
- Gate failures: none attributable to this TRD (see the full-suite row above)
- Success-criteria greps: `planMilestoneComplete` and `applyMilestonePlan` both present in `roadmap.cjs`; `mkdirSync(archiveDir` finds nothing.
- Not touched: `df-tools.cjs`, `flag-guard.cjs`, `flag-spec.cjs`, `milestone-scope.cjs`, `planning-entity-verbs.cjs` (68-02, 68-03, 68-06 own them). `df-tools.cjs` line 59 still documents `milestone complete` without `--dry-run`; that header comment is 68-03's file.

## Self-Check: PASSED

- Files: all seven modified files exist.
- Commits: 6f6f5f95, 07e1c191, 21d1841d, cc8012e6, 60d65c5d present in `git log`.
