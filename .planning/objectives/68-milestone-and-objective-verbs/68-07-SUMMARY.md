---
objective: 68-milestone-and-objective-verbs
trd: "07"
subsystem: tooling
tags: [dogfood, scratch-copy, docs, milestone-complete, objective-remove, objective-complete, TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05]
requires:
  - 68-01 (milestone complete --dry-run and re-run safety)
  - 68-02 (milestone-scope shared helpers)
  - 68-03 (flag guard)
  - 68-04 (objective remove / complete)
  - 68-05 (flag spec for every writer)
  - 68-06 (store-mode dry run, heading rule)
provides:
  - "SC-1..SC-5 evidence on scratch copies of this repository's real .planning/"
  - "CHANGELOG [Unreleased], USER-GUIDE, CLAUDE.md, df-tools.cjs header describe objective 68"
requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05]
key-files:
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - plugins/devflow/devflow/bin/df-tools.cjs
    - .planning/todos/completed/objective-complete-next-objective.md
key-decisions:
  - "Dogfood ran on scratch copies only, with the repository runtime, so the live .planning/ changed by the todo move alone"
  - "Each defect SC was also run against the installed pre-68 runtime as a control, so the PASS rows are shown to fail without the fix"
duration: 10min
completed: 2026-10-08
tokens_input: 11503560
tokens_output: 50340
tokens_cache_read: 11241417
tokens_cache_write: 261955
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 07: Dogfood on a scratch copy of this repository, then document Summary

**All five success criteria hold on scratch copies of this repository's real `.planning/` (dry run leaves the copy identical, a re-run keeps one entry and one archive set, a misspelled flag exits 1 naming it, `objective remove 25` keeps every date, `objective complete 68` reports `next_objective: "69"`), and CHANGELOG, USER-GUIDE, CLAUDE.md and the df-tools header describe the new behaviour.**

## Progress
- [x] Task 1: Scratch-copy evidence for SC-1..SC-5 — no repository change, no commit
- [x] Task 2: Documentation and the resolved todo — 23ccb9a6

## Task Commits

1. Task 1: no commit (nothing in the repository changed; evidence is in this SUMMARY)
2. Task 2: `23ccb9a6` docs(68-07): milestone and objective verb changes

## Success-criteria evidence (scratch copies only)

Every command ran with the repository runtime `plugins/devflow/devflow/bin/df-tools.cjs`, `--cwd <scratch>/run` and `HOME=<scratch>/home`; `<scratch>/ref` was an untouched copy of `.planning/` (21 MB). `git status --porcelain .planning` afterwards shows only the nine pre-existing untracked `.gitkeep` files.

| SC | Command (on `<scratch>/run`) | Exit | Result | Verdict |
|---|---|---|---|---|
| SC-1 | `milestone complete v1.6 --dry-run` | 0 | First line `DRY RUN — nothing has been modified.`; `would_write`: create `.planning/milestones/v1.6-ROADMAP.md`, create `.planning/milestones/v1.6-REQUIREMENTS.md`, append `.planning/MILESTONES.md`, update `.planning/STATE.md`; `would_move: []`, `would_keep: []`; `dry_run: true`, `milestones_updated: false`, `state_updated: false`. `diff -r ref/.planning run/.planning` empty. | PASS |
| SC-2a | `milestone complete v1.5` (already recorded) | 0 | `milestones_updated: false`, `milestones_reason: "entry_exists"`, `kept`: `v1.5-ROADMAP.md` (`exists`), `v1.5-REQUIREMENTS.md` (`exists`), `MILESTONES.md` (`entry_exists`); `grep -c '^## v1\.5 '` is 1. Only STATE.md differs from ref (`**Status:**` line), reported as `state_updated: true`. | PASS |
| SC-2b | `milestone complete v1.6 --name "Hardening & Release"` twice | 0, 0 | Run 1: `written` the two archives, MILESTONES.md and STATE.md, `milestones_reason: null`. Run 2: `written: []`, `kept` both archives (`exists`) and MILESTONES.md (`entry_exists`), `milestones_updated: false`, `state_updated: false`. `grep -c '^## v1\.6 '` is 1; `ls milestones` lists one `v1.6-ROADMAP.md` and one `v1.6-REQUIREMENTS.md`; `diff -r` of the archives between run 1 and run 2 empty; `cmp` of MILESTONES.md between runs silent. | PASS |
| SC-3a | `milestone complete v1.6 --dry-runn` | 1 | `Error: unknown flag --dry-runn for \`milestone complete\`; nothing was written (accepted: --archive-objectives, --dry-run, --name, --no-flush, --no-wait)` | PASS |
| SC-3b | `objective remove 70 --confrim` | 1 | `Error: unknown flag --confrim for \`objective remove\`; nothing was written (accepted: --confirm, --force)`. `diff -r ref run` empty after both. | PASS |
| SC-4 | `objective remove 25 --confirm --force` | 0 | `removed: "25"`, `directory_deleted: "25-fleet-audit-fixes"`, 43 directories and 757 files renamed (`68-milestone-and-objective-verbs` -> `67-...`, `27-gate-correctness` -> `26-gate-correctness`, and so on; `ls objectives` shows `25-github-issue-auto-build-monitor` where `26-` was), `roadmap_updated: true`. ISO-date multiset equal in ROADMAP.md (22 of 22 outside objective 25's checkbox line 52 and progress row 298; 7 distinct dates), STATE.md (150 of 150), REQUIREMENTS.md (1 of 1) and MILESTONES.md (14 of 14). The former objective 26 (killed, so it has a checkbox line and no progress row) is now `- [—] Objective 25: GitHub issue auto-build monitor — killed 2026-10-01 (GMD-04)` with its `2026-` date intact, and the former 27 is now `- [x] Objective 26: Gate correctness (5/6; 26-03 deferred → DECISION-001)`. The TRD's `| 25. ` check does not apply literally: the former 26 has no progress row, and the `| 25. Fleet audit fixes |` row went with the removed objective. Control (installed pre-68 runtime, same command on a fresh copy): all 22 ROADMAP dates are rewritten (`2026-05-06` → `2025-05-06`, `2026-07-22` → `2025-07-22`, ... 7 distinct dates), i.e. the defect this objective fixes. | PASS |
| SC-5a | `objective complete 68` | 0 | `next_objective: "69"`, `next_objective_name: "drafts-health-and-doctor"`, `is_last_objective: false`, `roadmap_updated: true`, `state_updated: true`. Control (installed pre-68 runtime): `next_objective: null`, `is_last_objective: true`. | PASS |
| SC-5b | `rg -n "DIR_RE\|function canonical" lib/milestone-scope.cjs` / `rg -n "objectiveDirMatches" lib/milestone-scope.cjs` | 1 / 0 | First prints nothing (exit 1); second finds the import (line 28) and the use (line 127). | PASS |

### Notes on SC-4

- The former objective 26 is now objective 25 and the former 27 is now 26 (see the row above). The `| 27–41 (15 objectives) |` progress row kept its range label but its Status cell was renumbered (`27-03, 28-06 deferred` → `26-03, 27-06 deferred`); the `| 25. Fleet audit fixes |` row went with the removed objective.
- Prose ranges and milestone bullets are not renumbered by `objective remove` (out of scope in 68-04): after removing 25, `Objectives 27–41` (v1.3 bullet), `Objectives 42–54`, the `27–41 (15 objectives)` row label and the sequencing paragraph's `Objectives 67-72` stay as written, so they no longer name the same objectives. This is recorded in Known issues, it is not a failure.

### Observations (not acted on)

- Re-running `milestone complete` for an already-recorded version (SC-2a, `v1.5`) keeps every MILESTONES.md entry and archive, but it still rewrites STATE.md's `**Status:**` line to `v1.5 milestone complete` once (`state_updated: true`; the second `v1.6` run reported `false`). That is the existing "true only when STATE.md changed" rule, not part of TOOL-02, and it matters only for a re-run of an older version while another objective is executing.
- `--raw` output of `objective remove` is large (83 KB: 43 directory and 757 file renames); the CLI hands it back as an `@file:` reference instead of inline JSON, so a script must read that file.
- Out of scope for this TRD, listed in USER-GUIDE Known issues: prose ranges and milestone bullets are not renumbered by `objective remove`.

## Documentation

- `CHANGELOG.md` `[Unreleased]`: an opening paragraph naming objective 68, `### Added` (`milestone complete --dry-run`, local and store; the unknown-flag guard, `lib/flag-guard.cjs`, `lib/flag-spec.cjs`, `flag-spec.repo.test.cjs`) and `### Fixed` (re-run safety and `1.0` = `v1.0`, `milestone put` heading rule, `objective remove` dates, `objective complete` next objective, `milestone-scope.cjs` shared helpers), each naming its objective and requirement, with "Needs an installed plugin carrying objective 68." where it applies.
- `docs/USER-GUIDE.md`: the `milestone complete` paragraph is followed by two bullets (`--dry-run`, `written`/`kept`/`milestones_reason` and the re-run rule; `objective remove` and `objective complete` behaviour); the Objective Management reference gains a paragraph on unknown-flag rejection; Known issues drops the two fixed bullets and adds the prose-range limitation.
- `CLAUDE.md` Objective operations bullet: two short sentences (the `--dry-run` preview and re-run rule; the unknown-flag guard and its two modules).
- `plugins/devflow/devflow/bin/df-tools.cjs` header: `[--dry-run]` under `milestone complete <version>` (68-01 left it out) and one line under `Usage:` that a writing command exits 1 on an unknown flag. `help.cjs` already listed `[--dry-run]`.
- Stale-doc exemptions from 68-05: none (the `EXEMPT` list in `flag-spec.repo.test.cjs` is empty), so that file is untouched.
- 68-05 recorded that `decision-queue` has explicit rules rather than `ownParser`; the CHANGELOG names the nine `ownParser` commands (upgrade, doctor, tokens, calibrate, estimate, transcript-export, override, stack report, stack mcp) and not `decision-queue`.
- `.planning/todos/pending/objective-complete-next-objective.md` completed with `todo complete` (git records the move to `todos/completed/`).

## Deviations from Plan

None - TRD executed exactly as written, with these notes:

- The TRD's SC-4 check "`| 25. ` now names the former objective 26" does not apply literally: the former 26 was a killed objective with a checkbox line and no progress row. The check was made on that checkbox line instead (date `2026-10-01` intact), and on the former 27 (`Gate correctness`).
- The CHANGELOG `[Unreleased]` entry first said `milestone complete <version> --dry-run`, which the TRD's own verify pattern (`rg "milestone complete --dry-run"`) did not find. The bullet now leads with the literal `milestone complete --dry-run`.
- CLAUDE.md's bullet is two short sentences, the binding rule's maximum; the task text said one.
- No code was changed (only the `df-tools.cjs` header comment), per error_recovery.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: scratch-copy evidence | `git status --porcelain .planning` shows only the nine pre-existing untracked `.gitkeep` files; the table above has one row per SC with command, exit code and result | 0 | PASS |
| 2: docs | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs` (35 tests) | 0 | PASS |
| 2: docs | `rg -n "Fixing the pass is open\|Skipping the append when the version already has an entry is open" docs/USER-GUIDE.md` | 1 (no matches, as required) | PASS |
| 2: docs | `rg -n "milestone complete --dry-run" CHANGELOG.md` | 0 (line 15) | PASS |
| 2: docs | `ls .planning/todos/completed/objective-complete-next-objective.md` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test doc-refs.repo.test.cjs dispatch-completeness.test.cjs flag-spec.repo.test.cjs` | 0 | PASS (35 tests) |
| test (full, baseline) | `npm test` before the first change | 0 | 11287 tests, 11253 pass, 0 fail, 34 skipped |
| test (full, after docs) | `npm test` after the docs commit's changes | 1 | 11287 tests, 11252 pass, 1 fail: `E2E1` only |
| test (reconcile) | `node --test roadmap-reconcile.test.cjs` after `roadmap update-job-progress 68` | 0 | PASS (63 tests, E2E1 included) |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

E2E1 (`roadmap-reconcile.test.cjs`, reconcile against this repository's ROADMAP.md) reported the unticked `68-07` line while the checkpoint SUMMARY existed. That is the same transient 68-04, 68-05 and 68-06 recorded; it cleared when `roadmap update-job-progress 68` ticked the line (63 of 63 pass afterwards). The baseline had no failures at all in this run (the daemon and handoff suites recorded as environment failures by 68-01 to 68-05 passed).

## Discovered commands

None. The profile (`general`) names `npm test` and `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (SC-1 dry run leaves the copy identical; SC-2 `v1.5` kept and `v1.6` twice gives one heading and one archive set; SC-3 both misspelled flags exit 1 naming the flag with the copy unchanged; SC-4 `objective remove 25 --confirm --force` keeps every ISO date; SC-5 `next_objective: "69"`, `is_last_objective: false` and the shared helpers in `milestone-scope.cjs`; docs updated, the two fixed Known issues gone, the prose-range limitation listed, the todo completed)
- Gate failures: none remaining (E2E1 cleared by the roadmap update)
- Live `.planning/` changes caused by this TRD: the todo move, this SUMMARY and the ROADMAP progress update, nothing else

## Self-Check: PASSED

- FOUND: CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, plugins/devflow/devflow/bin/df-tools.cjs, .planning/todos/completed/objective-complete-next-objective.md
- FOUND commit: 23ccb9a6
- The pending todo is gone from `.planning/todos/pending/`
