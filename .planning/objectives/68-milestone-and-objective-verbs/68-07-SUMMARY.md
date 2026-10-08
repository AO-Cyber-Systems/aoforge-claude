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
---

# Objective 68 TRD 07: Dogfood on a scratch copy of this repository, then document Summary

## Progress
- [x] Task 1: Scratch-copy evidence for SC-1..SC-5 — (no repository change, no commit)
- [x] Task 2: Documentation and the resolved todo — (this commit)

## Success-criteria evidence (scratch copies only)

Every command ran with the repository runtime `plugins/devflow/devflow/bin/df-tools.cjs`, `--cwd <scratch>/run` and `HOME=<scratch>/home`; `<scratch>/ref` was an untouched copy of `.planning/` (21 MB). `git status --porcelain .planning` afterwards shows only the nine pre-existing untracked `.gitkeep` files.

| SC | Command (on `<scratch>/run`) | Exit | Result | Verdict |
|---|---|---|---|---|
| SC-1 | `milestone complete v1.6 --dry-run` | 0 | First line `DRY RUN — nothing has been modified.`; `would_write`: create `.planning/milestones/v1.6-ROADMAP.md`, create `.planning/milestones/v1.6-REQUIREMENTS.md`, append `.planning/MILESTONES.md`, update `.planning/STATE.md`; `would_move: []`, `would_keep: []`; `dry_run: true`, `milestones_updated: false`, `state_updated: false`. `diff -r ref/.planning run/.planning` empty. | PASS |
| SC-2a | `milestone complete v1.5` (already recorded) | 0 | `milestones_updated: false`, `milestones_reason: "entry_exists"`, `kept`: `v1.5-ROADMAP.md` (`exists`), `v1.5-REQUIREMENTS.md` (`exists`), `MILESTONES.md` (`entry_exists`); `grep -c '^## v1\.5 '` is 1. Only STATE.md differs from ref (`**Status:**` line), reported as `state_updated: true`. | PASS |
| SC-2b | `milestone complete v1.6 --name "Hardening & Release"` twice | 0, 0 | Run 1: `written` the two archives, MILESTONES.md and STATE.md, `milestones_reason: null`. Run 2: `written: []`, `kept` both archives (`exists`) and MILESTONES.md (`entry_exists`), `milestones_updated: false`, `state_updated: false`. `grep -c '^## v1\.6 '` is 1; `ls milestones` lists one `v1.6-ROADMAP.md` and one `v1.6-REQUIREMENTS.md`; `diff -r` of the archives between run 1 and run 2 empty; `cmp` of MILESTONES.md between runs silent. | PASS |
| SC-3a | `milestone complete v1.6 --dry-runn` | 1 | `Error: unknown flag --dry-runn for \`milestone complete\`; nothing was written (accepted: --archive-objectives, --dry-run, --name, --no-flush, --no-wait)` | PASS |
| SC-3b | `objective remove 70 --confrim` | 1 | `Error: unknown flag --confrim for \`objective remove\`; nothing was written (accepted: --confirm, --force)`. `diff -r ref run` empty after both. | PASS |
| SC-4 | `objective remove 25 --confirm --force` | 0 | `removed: "25"`, `directory_deleted: "25-fleet-audit-fixes"`, 43 directories and 757 files renamed (`68-milestone-and-objective-verbs` -> `67-...`, `27-gate-correctness` -> `26-gate-correctness`, and so on; `ls objectives` shows `25-github-issue-auto-build-monitor` where `26-` was), `roadmap_updated: true`. ISO-date multiset equal in ROADMAP.md (22 of 22 outside objective 25's checkbox line 52 and progress row 298; 7 distinct dates), STATE.md (150 of 150), REQUIREMENTS.md (1 of 1) and MILESTONES.md (14 of 14). The former objective 26 (`Gate correctness`) is now `- [x] Objective 26: Gate correctness (5/6; 26-03 deferred -> DECISION-001)` with its date row intact. Control (installed pre-68 runtime, same command on a fresh copy): the ROADMAP multiset differs in 14 cells (`2026-05-06` -> `2025-05-06`, `2026-07-22` -> `2025-07-22`, ...), i.e. the defect this objective fixes. | PASS |
| SC-5a | `objective complete 68` | 0 | `next_objective: "69"`, `next_objective_name: "drafts-health-and-doctor"`, `is_last_objective: false`, `roadmap_updated: true`, `state_updated: true`. Control (installed pre-68 runtime): `next_objective: null`, `is_last_objective: true`. | PASS |
| SC-5b | `rg -n "DIR_RE\|function canonical" lib/milestone-scope.cjs` / `rg -n "objectiveDirMatches" lib/milestone-scope.cjs` | 1 / 0 | First prints nothing (exit 1); second finds the import (line 28) and the use (line 127). | PASS |

### Notes on SC-4

- The former objective 26 is now objective 25 and the former 27 is now 26: `- [—] Objective 25: GitHub issue auto-build monitor` and `- [x] Objective 26: Gate correctness (5/6; 26-03 deferred -> DECISION-001)`. The `| 27–41 (15 objectives) |` progress row kept its range label but its Status cell was renumbered (`27-03, 28-06 deferred` -> `26-03, 27-06 deferred`); the `| 25. Fleet audit fixes |` row went with the removed objective.
- Prose ranges and milestone bullets are not renumbered by `objective remove` (out of scope in 68-04): after removing 25, `Objectives 27–41` (v1.3 bullet), `Objectives 42–54`, the `27–41 (15 objectives)` row label and the sequencing paragraph's `Objectives 67-72` stay as written, so they no longer name the same objectives. This is recorded in Known issues, it is not a failure.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: scratch-copy evidence | `git status --porcelain .planning` shows only the nine pre-existing untracked `.gitkeep` files; the table above has one row per SC with command, exit code and result | 0 | PASS |

## Validation Gate Results

Baseline taken before the first change: `npm test` -> 11287 tests, 11253 pass, 0 fail, 34 skipped.
