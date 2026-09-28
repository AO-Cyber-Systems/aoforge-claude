---
status: resolved
trigger: "Investigate issue: roadmap-progress-row-corruption -- df-tools objective complete <N> and df-tools roadmap update-job-progress <N> corrupt .planning/ROADMAP.md, and objective complete resets STATE.md status. Happened twice (objectives 35, 36), fixed by hand both times."
created: 2026-09-28T03:05:14Z
updated: 2026-09-28T03:50:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED — see Resolution
test: full regression gate held (3791 tests, 1 pre-existing classified failure); committed test: b2d372c then fix: cbf238d, both SSH-signed
expecting: n/a — resolved
next_action: none — archive to .planning/debug/resolved/

## Symptoms

expected: |
  - `update-job-progress N` updates only objective N's Plans count and Status in the `## Progress` table and ticks its job boxes.
  - `objective complete N` marks objective N complete: Progress row Status = Complete, the Completed date is set, and the section header is marked done.
  - Both preserve every other column, especially Milestone, and keep the `**Jobs:**` detail line and the `Jobs:` checklist intact.
  - STATE.md status moves forward sensibly: to the next objective, or "complete", never back to "Ready to plan" for an objective that was just finished.
actual: |
  (1) The objective's Progress row has shifted columns. The Milestone column is dropped or misaligned. Real header: `| Objective | Milestone | Plans | Status | Completed |`; corrupted rows look like `| 36. Upgrade in place | v1.3 | 10/10 | Complete | 2026-09-27 |` (need to confirm exact corruption vs correct-looking value -- diff to be examined).
  (2) The objective section's `**Jobs:**` line and/or Jobs checklist detail is overwritten or wiped.
  (3) `objective complete` sets STATE.md status to "Ready to plan" (regression backward).
errors: none -- commands exit 0, silently produce wrong output.
reproduction: |
  Run against a SCRATCH copy of this repo's ROADMAP.md format:
  - 5-column Progress table with Milestone column.
  - Objective sections: `### Objective NN: ...`, `**Goal:**`, `**Depends on:**`, `**Jobs:** ...` line, and `Jobs:` checklist of `- [x] NN-MM-TRD.md -- Wave N: ...` including suffixed TRD ids like `36-04a`.
  - Collapsed `<details>` milestone blocks above, with duplicate objective numbers inside them (e.g. several "Objective 10" entries in comments/history).
started: shows up on every objective completion (at least objectives 35 and 36 so far)

## Eliminated

(none — first hypothesis, formed from reading the code, was confirmed directly; no false leads)

## Evidence

- timestamp: 2026-09-28T03:20:00Z
  checked: plugins/devflow/devflow/bin/lib/roadmap.cjs cmdRoadmapUpdateJobProgress (lines 272-344)
  found: |
    tablePattern = `(\|\s*${objectiveEscaped}\.?\s[^|]*\|)[^|]*(\|)\s*[^|]*(\|)\s*[^|]*(\|)` — captures the
    Objective cell, then 3 more `|...|` groups and rewrites them as Plans/Status/(date). This is correct
    ONLY for the 4-column shape (`| Objective | Plans | Status | Completed |`). Against the real 5-column
    shape (`| Objective | Milestone | Plans | Status | Completed |`) group1 swallows Milestone into the
    literal cell text is untouched but the 3 replacement groups land on Plans/Status/Completed's neighbors
    one column early — Milestone's own cell is never in a capture group so it silently becomes plain text
    outside the replacement, but Plans gets the new fraction shoved into what was Milestone's slot depending
    on group boundaries. (Confirmed empirically below rather than by regex tracing alone.)
  implication: positional pipe-counting regex assumes exactly 4 columns; needs to be column-name-aware.

- timestamp: 2026-09-28T03:20:00Z
  checked: plugins/devflow/devflow/bin/lib/roadmap.cjs jobCountPattern (lines 316-323); objective.cjs
    identical pattern (lines 738-745)
  found: "(#{2,4}\\s*Objective\\s+N[\\s\\S]*?\\*\\*Jobs:\\*\\*\\s*)[^\\n]+" replaced with "$1N/M jobs complete"
    — replaces the ENTIRE rest of the line, discarding any hand-authored detail after the counter
    (wave layout, split rationale, requirement IDs).
  implication: must preserve existing detail; only refresh the machine-owned "N/M jobs complete" prefix.

- timestamp: 2026-09-28T03:20:00Z
  checked: plugins/devflow/devflow/bin/lib/objective.cjs cmdObjectiveComplete STATE.md block (lines 804-846)
  found: unconditionally regex-replaces **Current Objective:**, **Current Objective Name:**, **Status:**,
    **Current Job:**, **Last Activity:**, **Last Activity Description:** fields. Confirmed via grep against
    the real .planning/STATE.md that only **Status:** exists by that name in this project (the others were
    dropped when the project moved to a narrative "**Objective complete:** N — ..." log convention). Because
    JS String.replace() no-ops when the regex doesn't match, only **Status:** actually gets clobbered — with
    a short templated value ("Ready to plan"/"Milestone complete") that destroys the accumulated narrative
    summary and moves status backward for an objective that was JUST completed.
  implication: need a schema discriminator (presence/absence of **Current Objective:**) to decide whether
    the legacy full-block update applies, or whether STATE.md should be left untouched.

- timestamp: 2026-09-28T03:25:00Z
  checked: plugins/devflow/devflow/templates/roadmap.md lines 85-208
  found: both 4-column (single-milestone) and 5-column (post-milestone-grouping, "Progress table includes
    milestone column") Progress-table shapes are officially documented/supported.
  implication: the fix must handle both shapes, not just the current 5-column one.

- timestamp: 2026-09-28T03:30:00Z
  checked: wrote plugins/devflow/devflow/bin/lib/roadmap-progress.cjs — a new dependency-free module with
    updateProgressTableRow() (reads the header row to map column names -> indices, falls back to positional
    mapping by column count for older/renamed headers) and updateJobsLine() (bounds the search to the target
    objective's own `#{2,4} Objective N` section so duplicate "Objective N" checklist mentions inside
    collapsed <details> blocks — which don't start with `#` — are never candidates; preserves existing detail
    text via computeJobsLineText()).
  implication: this module is designed to be shared by both roadmap.cjs and objective.cjs without a circular
    require (objective.cjs already gets required before roadmap.cjs in df-tools.cjs's top-level requires, and
    roadmap.cjs already requires objective.cjs for findObjectiveInternal — a new dependency-free module avoids
    the hazard entirely).

- timestamp: 2026-09-28T03:45:00Z
  checked: ran `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` (5 new tests, fixtures mirror
    real ROADMAP.md: 5-column table, suffixed TRD ids 12-04a/04b/04c, <details> block with duplicate
    "Objective 1" entries) against the UNFIXED roadmap.cjs
  found: 4/5 FAIL exactly as hypothesized — Milestone column corrupted to "10/10", Jobs-line detail wiped to
    bare "10/10 jobs complete", partial-completion row also corrupted. The 4-column-table backward-compat
    test also fails (Jobs-line wipe reproduces there too, since that bug is shape-independent). The
    duplicate-<details>-entries test PASSES (current code doesn't touch those lines either, by accident of
    the regex being header-anchored) — no new hazard there, just confirms it was never actually at risk.
  implication: hypothesis for roadmap.cjs fully confirmed empirically, not just by regex tracing.

- timestamp: 2026-09-28T03:50:00Z
  checked: ran `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` (5 new tests: 5-column table
    corruption, Jobs-line wipe, narrative-STATE.md regression, legacy-STATE.md backward-compat) against the
    UNFIXED objective.cjs
  found: 3/5 FAIL exactly as hypothesized — Completed date column not set (date landed in Status's old slot
    instead), Jobs-line detail wiped, and narrative STATE.md's **Status:** line clobbered to "Ready to plan"
    losing the whole narrative. The legacy/template-STATE.md backward-compat test and the duplicate-<details>
    test both PASS already, confirming those code paths are not at risk and must be preserved by the fix.
  implication: hypothesis for objective.cjs fully confirmed empirically; fix must special-case narrative vs
    legacy STATE.md schema, not remove the legacy path (transition.md documents it).

## Resolution

root_cause: |
  Three independent bugs, all in plugins/devflow/devflow/bin/lib/{roadmap,objective}.cjs:
  1. cmdRoadmapUpdateJobProgress (roadmap.cjs) and cmdObjectiveComplete (objective.cjs) both update the
     "## Progress" table row via a positional-pipe-counting regex written for the OLDER 4-column table shape
     (`| Objective | Plans | Status | Completed |`). This project's real ROADMAP.md (and every project using
     the documented milestone-grouped template) uses the 5-column shape
     (`| Objective | Milestone | Plans | Status | Completed |`). Run against 5 columns, the regex's capture
     groups land one column off, corrupting/dropping the Milestone value and misplacing Plans/Status/Completed.
  2. Both files also replace the entire "**Jobs:**" line's remainder with a bare "N/M jobs complete"/
     "N/M jobs executed" string, discarding any hand-authored planning detail (wave layout, TRD split
     rationale) that follows the counter.
  3. cmdObjectiveComplete's STATE.md block unconditionally overwrites **Status:** (plus 4 other fields) with
     short templated values designed for an older STATE.md schema keyed on **Current Objective:**. This
     project's STATE.md migrated to a narrative convention (repeating **Objective complete:** N — ... lines
     plus one free-text **Status:** summary) that dropped every field the code checks EXCEPT **Status:**,
     which still matches by name and gets destructively overwritten — explaining the reported "status resets
     to Ready to plan" regression.
fix: |
  1. New module plugins/devflow/devflow/bin/lib/roadmap-progress.cjs — column-name-aware table-row updater
     (updateProgressTableRow) and section-bounded Jobs-line updater (updateJobsLine) that preserves existing
     detail text. Shared by both callers to avoid duplicating the fix (and avoid a circular require between
     objective.cjs and roadmap.cjs).
  2. roadmap.cjs cmdRoadmapUpdateJobProgress and objective.cjs cmdObjectiveComplete both switched to call
     these shared functions instead of their own positional regexes.
  3. objective.cjs cmdObjectiveComplete gains a legacy-vs-narrative STATE.md schema check: only run the
     Current-Objective/Status/Current-Job/Last-Activity rewrite block when **Current Objective:** is present
     in STATE.md (the legacy template's anchor field, still documented in workflows/transition.md); otherwise
     leave STATE.md untouched.
  (fix not yet written to roadmap.cjs/objective.cjs as of this Evidence entry — tests are RED, confirming the
  bug, before the fix is applied, per TDD constraint.)
verification: |
  1. roadmap.test.cjs (5 tests) and objective.test.cjs (5 tests): RED before the fix (7/10 failing across both
     files, exactly matching the hypothesized corruption), GREEN after wiring in roadmap-progress.cjs and the
     STATE.md schema check (10/10 passing), with zero changes to the test files themselves between runs.
  2. Manual re-check against this repo's ACTUAL pre-fix ROADMAP.md/STATE.md content (git show fde30bd, the
     commit right before objective 36 was hand-fixed) in scratchpad copies:
     - `roadmap update-job-progress 36` -> diff shows ONLY row 36's Status ("Executed, verifying" -> "Complete")
       and Completed date ("—" -> "2026-09-28") changed; Milestone (v1.3) and every sibling row byte-identical;
       Jobs line kept its full wave/split detail with the "10/10 jobs complete" counter prepended.
     - `objective complete 36` -> same ROADMAP.md diff (Status -> Complete, Completed date set); STATE.md diff
       is EMPTY — the narrative Status line and full "Objective complete: N — ..." log survive byte-for-byte
       (this project's real STATE.md has no **Current Objective:** field, so it's correctly recognized as
       narrative schema and left untouched instead of being reset to "Ready to plan").
  3. Full regression gate: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs'
     'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` -> 3791 tests, 3758 pass, 1 fail, 32 skipped.
     The 1 failure (`handoff-e2e.test.cjs:795:3` "MA-7 doctl auth init...") is listed verbatim in
     `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` — a pre-existing, already-classified
     failure unrelated to this change. Gate holds.
files_changed:
  - plugins/devflow/devflow/bin/lib/roadmap-progress.cjs (new — shared column-name-aware Progress-table row
    writer + section-bounded Jobs-line writer)
  - plugins/devflow/devflow/bin/lib/roadmap.test.cjs (new — regression coverage for update-job-progress)
  - plugins/devflow/devflow/bin/lib/objective.test.cjs (new — regression coverage for objective complete)
  - plugins/devflow/devflow/bin/lib/roadmap.cjs (cmdRoadmapUpdateJobProgress switched to roadmap-progress.cjs)
  - plugins/devflow/devflow/bin/lib/objective.cjs (cmdObjectiveComplete switched to roadmap-progress.cjs; added
    legacy-vs-narrative STATE.md schema check gating the Current-Objective/Status/Current-Job/Last-Activity
    rewrite block)
