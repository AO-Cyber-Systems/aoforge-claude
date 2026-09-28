---
objective: 40-tooling-correctness
trd: "06"
subsystem: tooling
tags: [dogfood, df-tools, roadmap, state-md, changelog, regression-gate]

# Dependency graph
requires:
  - objective: 40 (TRD 40-01)
    provides: "status-aware getMilestoneInfo (TOOL-01) + update-job-progress nested TRD ticking (TOOL-06)"
  - objective: 40 (TRD 40-02)
    provides: "objective complete narrative log line + truthful state_updated (TOOL-02)"
  - objective: 40 (TRD 40-03)
    provides: "intent resolve bare-number objective lookup (TOOL-05)"
  - objective: 40 (TRD 40-04)
    provides: "state record-session plain Session Continuity lines (TOOL-07)"
  - objective: 40 (TRD 40-05)
    provides: "ripgrep -E rule + rg-flag guard (TOOL-03), remove-objective integer wording (TOOL-04), .edit-override gitignore + guard (TOOL-08)"
provides:
  - "All eight objective-40 fixes demonstrated on this repo's own planning files via the repo df-tools (TOOL-02 on a scratchpad copy)"
  - "ROADMAP.md Objective 40: 40-01..40-05 ticked and Progress row 5/6 In Progress, written by `roadmap update-job-progress 40`"
  - "STATE.md Session Continuity written by `state record-session` (recorded: true)"
  - "CHANGELOG [Unreleased]: 8 Fixed bullets (TOOL-01..TOOL-08) + 1 Added bullet (the two guard tests)"
  - "Full-suite gate: 4234 tests / 4201 pass / 1 fail (MA-7, pre-existing) / 32 skipped"
affects: [objective 40 verification, objective 41, next release (runtime re-mirror)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dogfood-as-closure: the final TRD changes planning files only through the df-tools commands it is proving, so the diff is the evidence"

key-files:
  created:
    - .planning/objectives/40-tooling-correctness/40-06-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - CHANGELOG.md

key-decisions:
  - "40-06 is NOT ticked by this TRD. At 6/6 summaries, `update-job-progress 40` also writes the Progress row `6/6 | Complete | <date>` and the Jobs line `6/6 jobs complete`, which marks objective 40 complete. The TRD assigns that tick to the execute workflow after this SUMMARY lands, and the orchestrator reserves completion for after verification"
  - "The standard executor state_updates (advance-job, update-progress, record-metric, add-decision, requirements mark-complete) were not run. The TRD limits STATE/ROADMAP changes to its dogfood commands, and its `requirements` entries are prose, not REQUIREMENTS.md IDs"
  - "The `objective.cjs:913` `roadmap_updated: fs.existsSync(roadmapPath)` defect found during TOOL-02 dogfood is recorded as a follow-up, not fixed: it is new work outside this TRD's files_modified"

patterns-established:
  - "The final TRD of a fix objective re-proves every fix on the repo's real files, with a scratch copy for anything that would complete the objective"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, TOOL-08]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-09-28
---

# Objective 40 TRD 06: Dogfood the fixes, CHANGELOG [Unreleased], full-suite gate Summary

**All eight tooling fixes were proven on this repo's own planning files with the repo df-tools:**

- `init milestone-op` reports v1.3.
- `intent resolve --objective 40` reads `bugfix` from OBJECTIVE.md.
- `update-job-progress 40` ticked 40-01..40-05, and nothing changed outside Objective 40 and its Progress row.
- `state record-session` wrote the narrative STATE.md with `recorded: true`.
- On a scratch copy, `objective complete 40` appended exactly one log line and then reported `already_logged`.
- The rg-flag and gitignore guards pass, and `.edit-override` is ignored at `.gitignore:50`.

CHANGELOG `[Unreleased]` records the fixes. The full suite is at 4234/4201/1/32, and the one failure is the pre-existing MA-7. The roadmap-reconcile E2E1 self-test is green again.

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-28T16:17:24Z
- **Completed:** 2026-09-28T16:21:06Z
- **Tasks:** 2/2
- **Files modified:** 3 (`.planning/ROADMAP.md`, `.planning/STATE.md`, `CHANGELOG.md`) plus this SUMMARY

## Accomplishments

- Every objective-40 defect is shown fixed against real repo state. The one exception is TOOL-02, which ran on a scratchpad copy because running it on the real repo would complete objective 40.
- ROADMAP.md and STATE.md were changed only by df-tools commands (no hand edits) and committed via `df-tools commit --files`.
- CHANGELOG `[Unreleased]` gained 8 `### Fixed` bullets and 1 `### Added` bullet. The diff is additions only (+25/−0), and the released sections are byte-identical.
- No regressions: +66 tests and +66 passes vs the 223dbf1 baseline. There are no new failing names, and the 40-05 in-flight E2E1 failure is cleared.

## Dogfood (verbatim, per TOOL id)

### TOOL-01: `node plugins/devflow/devflow/bin/df-tools.cjs init milestone-op`

```json
{
  "commit_docs": true,
  "milestone_version": "v1.3",
  "milestone_name": "Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction",
  "milestone_slug": "autonomy-hardening-stack-profile-upgrade-adopt-doc-auto-correction",
  "objective_count": 47,
  "completed_objectives": 41,
  "all_objectives_complete": false,
  "archived_milestones": [],
  "archive_count": 0,
  "project_exists": true,
  "roadmap_exists": true,
  "state_exists": true,
  "archive_exists": false,
  "objectives_dir_exists": true
}
```

PASS: `milestone_version: v1.3` (it was `v1.1` "candidates" before 40-01).

### TOOL-05: `node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 40`

Verbatim head and tail. The `sources`, `provenance`, `cell_provenance`, `constraints` and `directives` blocks between them are elided because they do not bear on TOOL-05. Every `sources` entry reads `defaults table (plugin, bugfix)`.

```json
{
  "kind": "plugin",
  "work": "bugfix",
  "workSource": "OBJECTIVE.md",
  "workInherited": false,
  "config": {
    "tdd": "regression per bug",
    "depth": "quick",
    "model_profile": "balanced",
    "verification": "bug-specific",
    "security_isolation": "n/a",
    "back_compat": "none",
    "tdd_default": "strict",
    "test_list_first": "required",
    "fixture_strategy": "inline",
    "verification_commands": []
  },
  ...
  "warnings": []
}
```

PASS: `work: bugfix`, `workSource: OBJECTIVE.md`, and no warnings.

### TOOL-06: `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo> roadmap update-job-progress 40`

First run:

```json
{
  "updated": true,
  "objective": "40",
  "job_count": 6,
  "summary_count": 5,
  "status": "In Progress",
  "complete": false,
  "trd_checkboxes_ticked": 5,
  "trd_checkboxes": [
    "40-01",
    "40-02",
    "40-03",
    "40-04",
    "40-05"
  ]
}
```

Second run (idempotency). `git diff --stat` was unchanged afterwards:

```json
{
  "updated": true,
  "objective": "40",
  "job_count": 6,
  "summary_count": 5,
  "status": "In Progress",
  "complete": false,
  "trd_checkboxes_ticked": 0,
  "trd_checkboxes": []
}
```

`git diff -- .planning/ROADMAP.md` (committed in 8f84ef6). It has 3 hunk regions: the Progress row, the Objective 40 `**Jobs:**` line, and the five TRD checkboxes. 40-06 stays `[ ]`, and no other objective's lines changed.

```diff
@@ -88,7 +88,7 @@ Candidate scope carried forward from v1.2 deferrals:
 | 39. Wire the telemetry & audit CLI | v1.3 | 5/5 | Complete | 2026-09-28 |
-| 40. Tooling correctness | v1.3 | 0/— | Registered (gap closure) | — |
+| 40. Tooling correctness | v1.3 | 5/6 | In Progress | — |
 | 41. Retroactive verification of 27–34 | v1.3 | 0/— | Registered (gap closure) | — |
@@ -330,14 +330,14 @@ Jobs:
-**Jobs:** 6 TRDs in 2 waves (planned 2026-09-28; ...
+**Jobs:** 5/6 jobs executed — 6 TRDs in 2 waves (planned 2026-09-28; ...
 Jobs:
-- [ ] 40-01-TRD.md — Wave 1: `roadmap.cjs` — status-aware `getMilestoneInfo` ...
-- [ ] 40-02-TRD.md — Wave 1: `objective complete` appends the narrative ...
-- [ ] 40-03-TRD.md — Wave 1: `intent resolve --objective <N>` prefix-matches ...
-- [ ] 40-04-TRD.md — Wave 1: `state record-session` updates plain-text ...
-- [ ] 40-05-TRD.md — Wave 1: ripgrep `-E` rule in trd-spec/verification-patterns ...
+- [x] 40-01-TRD.md — Wave 1: `roadmap.cjs` — status-aware `getMilestoneInfo` ...
+- [x] 40-02-TRD.md — Wave 1: `objective complete` appends the narrative ...
+- [x] 40-03-TRD.md — Wave 1: `intent resolve --objective <N>` prefix-matches ...
+- [x] 40-04-TRD.md — Wave 1: `state record-session` updates plain-text ...
+- [x] 40-05-TRD.md — Wave 1: ripgrep `-E` rule in trd-spec/verification-patterns ...
 - [ ] 40-06-TRD.md — Wave 2: dogfood all fixes on real planning files ...
```

(Line bodies after `...` are unchanged and are truncated here for width. The full diff is `git show 8f84ef6 -- .planning/ROADMAP.md`. The `**Jobs:**` rewrite is the pre-existing `updateJobsLine` prefix, which sits inside `### Objective 40:`.)

`rg -n -e '^- \[x\] 40-0[1-5]-TRD\.md' .planning/ROADMAP.md` prints 5 lines (336-340). PASS.

### TOOL-07: `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo> state record-session --stopped-at "Completed 40-06-TRD.md; objective 40 6/6 TRDs, awaiting verification" --resume-file ".planning/SESSION_PICKUP.md"`

```json
{
  "recorded": true,
  "updated": [
    "Last session",
    "Stopped At",
    "Resume File"
  ]
}
```

`git diff -- .planning/STATE.md` (committed in 8f84ef6):

```diff
@@ -228,6 +228,6 @@ See: .planning/PROJECT.md (updated 2026-07-22 after v1.2 milestone)
 ## Session Continuity

-Last session: 2026-09-28 — Objective 39 TRD 39-05 executed (final TRD, 5/5): re-ran `df-tools context --limit 150` ...
+Last session: 2026-09-28T16:17:42.605Z
 Resume file: `.planning/SESSION_PICKUP.md`
-Stopped at: Completed 39-05-TRD.md (2026-09-28); objective 39 all 5 TRDs done (db57340 docs, 6656f0e docs). ...
+Stopped at: Completed 40-06-TRD.md; objective 40 6/6 TRDs, awaiting verification
```

PASS: `recorded: true`, and only Session Continuity lines changed. The diff shows 2 lines because `Resume file:` was rewritten with its identical current value (backticks kept). The same thing was observed and explained in 40-04, whose second scratch run proved all 3 lines are written. Nothing outside `## Session Continuity` changed.

### TOOL-02 (scratchpad copy only): `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <S> objective complete 40`

`<S>` = `<scratchpad>/dogfood-40-06`. It holds copies of `STATE.md`, `ROADMAP.md` and `objectives/40-tooling-correctness/`.

First run:

```json
{
  "completed_objective": "40",
  "objective_name": "tooling-correctness",
  "jobs_executed": "5/6",
  "next_objective": null,
  "next_objective_name": null,
  "is_last_objective": true,
  "date": "2026-09-28",
  "roadmap_updated": true,
  "state_updated": true,
  "state_update_reason": null
}
```

`rg -n -e 'Objective complete:\*\* 40' <S>/.planning/STATE.md` prints exactly 1 line:

```
32:**Objective complete:** 40 — Tooling correctness (completed 2026-09-28, 5/6 TRDs)
```

`diff <repo>/.planning/STATE.md <S>/.planning/STATE.md` gives `31a32` plus that one line and nothing else. The line sits directly after the last log line (36).

Second run:

```json
{
  "completed_objective": "40",
  "objective_name": "tooling-correctness",
  "jobs_executed": "5/6",
  "next_objective": null,
  "next_objective_name": null,
  "is_last_objective": true,
  "date": "2026-09-28",
  "roadmap_updated": true,
  "state_updated": false,
  "state_update_reason": "already_logged"
}
```

PASS. `rg -c -e 'Objective complete:\*\* 40' .planning/STATE.md` on the real repo prints nothing (0 matches), so the real STATE.md has no objective-40 log line. Note: `roadmap_updated: true` on the idempotent second run is the existsSync defect class. See follow-up 4.

### TOOL-03 / TOOL-04 / TOOL-08

`git check-ignore -v .planning/.edit-override`:

```
.gitignore:50:.planning/.edit-override	.planning/.edit-override
```

`node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs`:

```
ℹ tests 21
ℹ suites 4
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

This includes `4: zero rg invocations with E in a short-flag cluster across the scan set`, `5: guidance present` for both references (TOOL-03), and `7: every file-backed override marker has a .planning/<name> line in .gitignore` (TOOL-08).

TOOL-04: `rg -n -e 'integer' plugins/devflow/devflow/workflows/remove-objective.md` gives
`16:- Argument is the objective number to remove (integer). Legacy decimal directories created before v1.2 (e.g. `12.1`) are still accepted for removal; decimal objectives are no longer created.`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood + commit planning changes | `node plugins/devflow/devflow/bin/df-tools.cjs init milestone-op` | 0 (`v1.3`) | PASS |
| 1: done | `node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 40` | 0 (`bugfix`, `OBJECTIVE.md`) | PASS |
| 1: done | `rg -n -e '^- \[x\] 40-0[1-5]-TRD\.md' .planning/ROADMAP.md` | 0 (5 lines) | PASS |
| 1: done | `git check-ignore -v .planning/.edit-override` | 0 (`.gitignore:50`) | PASS |
| 1: done | scratch `rg -n -e 'Objective complete:\*\* 40' <S>/.planning/STATE.md` | 0 (1 line) | PASS |
| 1: done | real `rg -c -e 'Objective complete:\*\* 40' .planning/STATE.md` | 1 (0 matches) | PASS |
| 1: TRD verification | `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` | 0 (60/60, E2E1 zero drift) | PASS |
| 2: CHANGELOG + gate | `npm test` | 1 (only MA-7) | PASS (gate allows exactly MA-7) |
| 2: done | `git diff --stat HEAD~1 -- CHANGELOG.md` (at 74753a0) | 0 (`25 insertions(+)`, 0 deletions) | PASS |
| 2: done | `git diff --stat 223dbf1 -- package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` | 0 (empty) | PASS |
| 2: done | `git diff --stat 223dbf1 -- .planning/objectives/41-retroactive-verification .planning/objectives/38-doc-auto-correction` | 0 (empty) | PASS |

## Task Commits

1. **Task 1: Dogfood every fix and commit the df-tools-made planning changes** - `8f84ef6` (docs)
2. **Task 2: CHANGELOG [Unreleased]** - `74753a0` (docs)

**TRD metadata:** this SUMMARY (docs commit, hash in the orchestrator return)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| full suite | `npm test` | 1 | PASS: 4234 tests / 4201 pass / 1 fail (MA-7) / 32 skipped |
| roadmap-reconcile (E2E1) | `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` | 0 | PASS: 60/60 |

### Full suite vs baseline

| | Baseline (223dbf1) | Post-40-05 (reported) | 40-06 |
|---|---|---|---|
| tests | 4168 | 4234 | 4234 |
| pass | 4135 | 4200 | 4201 |
| fail | 1 (MA-7) | 2 (MA-7 + E2E1 drift) | 1 (MA-7) |
| skipped | 32 | 32 | 32 |

The only failure is `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` in `plugins/devflow/devflow/bin/handoff-e2e.test.cjs`, which is in the baseline. `micro.test.cjs` did not hang (the run took 65s), so the STACK.md exclusion glob was not needed. The +66 tests all come from 40-01..40-05, and 40-06 adds no tests (no production code).

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 truths:
  1. TOOL-01/05/06/07 dogfood recorded verbatim, with the expected values
  2. TOOL-02 scratch-only, with no log line in the real STATE.md
  3. TOOL-03/04/08 guard tests and check-ignore
  4. ROADMAP/STATE changed by df-tools only, and the ROADMAP diff is limited to Objective 40 plus its Progress row
  5. CHANGELOG has 8 Fixed and 1 Added, additions only, and no version heading
  6. the npm test gate, with the version files unchanged
- **Gate failures:** None. MA-7 is the allowed pre-existing failure.

## TDD Exceptions

- Whole TRD: `<!-- TDD-EXCEPTION: no production code; dogfood, changelog and regression gate. Behavior tests live in 40-01..40-05. -->`

## Files Created/Modified

- `.planning/ROADMAP.md`: Objective 40 Progress row 5/6 In Progress, Jobs line, and 40-01..40-05 ticked (written by `roadmap update-job-progress 40`)
- `.planning/STATE.md`: Session Continuity `Last session:` / `Stopped at:` / `Resume file:` (written by `state record-session`)
- `CHANGELOG.md`: `[Unreleased]` gained 8 `### Fixed` bullets (TOOL-01..08) and 1 `### Added` bullet (rg-flag-guard + gitignore-markers tests)
- `.planning/objectives/40-tooling-correctness/40-06-SUMMARY.md`: this file

## Decisions Made

- **40-06's own checkbox is left for the execute workflow.** The TRD says the execute workflow ticks 40-06 after this SUMMARY lands. At 6/6 summaries, `update-job-progress 40` also writes the Progress row `6/6 | Complete | 2026-09-28` and the Jobs line `6/6 jobs complete`, which amounts to marking objective 40 complete. The orchestrator reserves that until the independent verifier passes. **Consequence:** once this SUMMARY is committed, the E2E1 reconcile self-test reports `trd_summary_exists` drift for 40-06 alone until the orchestrator runs `roadmap update-job-progress 40`.
- **Generic executor state_updates were not run.** `state advance-job`, `update-progress`, `record-metric`, `add-decision` and `requirements mark-complete` were skipped. The TRD restricts STATE.md/ROADMAP.md changes to the dogfood commands. The TRD's `requirements` field is prose, and the TOOL-NN IDs are objective-local (not in REQUIREMENTS.md).
- **CHANGELOG uses words, not the ✅/🚧/📋 glyphs,** for the milestone status order, which matches the file's existing plain style.

## Deviations from Plan

**None in code or files.** The TRD executed as written, and only its three `files_modified` (plus this SUMMARY) changed. Two evidence additions:

1. **Idempotency re-run of `update-job-progress 40` on the real ROADMAP.** It ticked 0 and left the diff unchanged. This is extra evidence for TOOL-06 and involved no hand edit.
2. **TOOL-07 diff shows 2 lines, not 3.** This matches the known 40-04 behaviour: the TRD's `--resume-file` equals the existing value, so the third line is rewritten to identical bytes. `updated` still lists `Resume File`. There was no code change, and the extra scratch proof already exists in 40-04-SUMMARY.

## Issues Encountered

None. No dogfood check failed, so the "stop and fix test-first" path was not needed.

## Follow-ups (recorded, not done in this TRD)

1. **Backfill the missing `**Objective complete:**` log lines for 37/38/39 in STATE.md** (human or completion flow). With 40-02's fix, `objective complete 37|38|39` appends each line once, after the current last line (36), in run order.
2. **adopt/new-project gitignore scaffolding for `.planning/.*` markers.** User projects get no `.planning/.edit-override`, `.skill-active` or `.override-log.jsonl` ignore lines. `workflows/new-project.md:491` ("No additional gitignore entries needed") is stale. Also, `adopt.cjs:691` `TRANSIENT_COMMIT_EXCLUDES` could add `.planning/.edit-override`.
3. **Re-mirror the runtime after the next release** so the installed df-tools (`~/.claude/devflow`, still 2.10.1) picks up these fixes. Until then, only the repo copy has them.
4. **Same existsSync defect class, two more sites:**
   - `roadmap.cjs:561` `state_updated: fs.existsSync(statePath)` (from 40-02).
   - `objective.cjs:913` `roadmap_updated: fs.existsSync(roadmapPath)` in `objective complete`. This one is new: it reported `roadmap_updated: true` on the idempotent second scratch run.
5. **Widen the rg-flag guard's scan set** (from 40-05) to cover hooks, README, CLAUDE.md, USER-GUIDE and site/content, with bin limited to non-test `.cjs`.

## User Setup Required

None. No external service configuration is required.

## Next Objective Readiness

- Objective 40 is ready for independent verification. After it passes, the orchestrator runs `roadmap update-job-progress 40` (ticks 40-06, and the Progress row becomes 6/6 Complete) and `objective complete 40` (appends the STATE.md log line).
- Objective 41 (retroactive verification of 27–34) is next. Its directory was not touched.

## Self-Check: PASSED

- FOUND: .planning/objectives/40-tooling-correctness/40-06-SUMMARY.md, CHANGELOG.md, .planning/ROADMAP.md, .planning/STATE.md
- FOUND commits: 8f84ef6 (ROADMAP.md + STATE.md, 9+/9−) and 74753a0 (CHANGELOG.md, 25+/0−) on feat/stack-profile-loader above base 105b877

---
*Objective: 40-tooling-correctness*
*Completed: 2026-09-28*
