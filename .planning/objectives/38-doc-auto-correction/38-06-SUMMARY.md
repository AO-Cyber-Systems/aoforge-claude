---
objective: 38-doc-auto-correction
trd: "06"
subsystem: docs
tags: [readme, user-guide, command-reference, deprecation]

requires:
  - objective: 38-05
    provides: "the fenced rename table in /devflow:help"
provides:
  - "README.md command tables and prose use only live command names"
  - "docs/USER-GUIDE.md command tables, ASCII diagrams, examples and troubleshooting use only live command names"
  - "both docs point to /devflow:help for the rename map instead of carrying a private copy of it"
affects: [38-09]

tech-stack:
  added: []
  patterns: ["consolidated command reference: base command + bracket/pipe subcommand form for flat lookup tables; base command + explicit subcommand rows for narrative/workflow tables"]

key-files:
  created: []
  modified: [README.md, docs/USER-GUIDE.md]

key-decisions:
  - "README/USER-GUIDE Core Workflow tables keep one row per milestone subcommand (`/devflow:milestone audit|complete|new`) to preserve the linear step-by-step narrative; flat reference tables (Navigation, Brownfield & Utilities) collapse same-base-command rows into a single consolidated row instead"
  - "Merged USER-GUIDE's bare `/devflow:health` row into the existing `/devflow:status check --migrate` row as `/devflow:status check [--migrate]`, since both described the same base invocation and duplicating it in the same table was the exact scenario the TRD flagged"
  - "README's redundant Navigation-table `/devflow:progress` row was deleted rather than renamed, since the fuller `/devflow:status [check|pause|resume]` row already exists in README's Status & Session section"
  - "Retitled USER-GUIDE's '### DevFlow Update Overwrote My Local Changes' section to '### Updating DevFlow' since the premise (installer clobbering local files) no longer applies under plugin-marketplace distribution"

requirements-completed: ["DOC-04", "DOC-01"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 35min
completed: 2026-09-28
---

# Objective 38 TRD 06: README and USER-GUIDE Summary

**README.md and docs/USER-GUIDE.md now document only live DevFlow commands — all 13 retired single-purpose names (progress, health, resume-work, pause-work, add/insert/remove-objective, new/audit/complete-milestone, plan-milestone-gaps, add-todo, check-todos) are renamed to their consolidated `/devflow:status|objective|milestone|todo` forms, `/devflow:update` and `/devflow:reapply-patches` are deleted with no successor, and both docs point to `/devflow:help` for the rename map instead of carrying their own copy of it.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- README.md: 8 edit sites renamed/deleted/merged across prose bullets, the milestone-loop code block, the Core Workflow and Navigation command tables, and the legacy-names note; `/devflow:health --migrate` → `/devflow:status check --migrate`
- docs/USER-GUIDE.md: ASCII lifecycle diagram, four command-reference tables, four example code blocks, three prose references, one troubleshooting section heading/body, and the Recovery Quick Reference table all updated; `/devflow:health` merged into the pre-existing `/devflow:status check --migrate` row as `/devflow:status check [--migrate]`
- Both `rg` done-criteria checks (retired-name regex) return zero matches on both files

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: README.md | `rg -n "/df:[a-z]\|/devflow:(add-objective\|insert-objective\|remove-objective\|new-milestone\|audit-milestone\|complete-milestone\|plan-milestone-gaps\|add-todo\|check-todos\|pause-work\|resume-work\|progress\|health\|update\|reapply-patches)\b" README.md` | 1 (no matches — pass) | PASS |
| 2: docs/USER-GUIDE.md | `rg -n "/df:[a-z]\|/devflow:(...same list...)\b\|df-local-patches" docs/USER-GUIDE.md` | 1 (no matches — pass) | PASS |

Note: ripgrep's `-E` flag means `--encoding`, not "extended regex" (that's a `grep`-ism); the TRD's verify commands were run with plain `rg -n "<pattern>"`, which already supports the same alternation/group syntax. Both invocations produced no output, i.e. exit code 1 from ripgrep signalling "no matches" — the documented pass condition.

## Task Commits

1. **Task 1: README.md** - `0a31bc1` (docs)
2. **Task 2: docs/USER-GUIDE.md** - `c8143b6` (docs)

**Plan metadata:** (this commit) `docs(38-06): complete README and USER-GUIDE TRD`

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| regression suite | `npm test` (4023 tests) | 1 (10 pre-existing failures) | PASS — no new failures vs baseline |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 (rg-clean on both files; README no longer both claims removal and documents 13 names live; consolidated command forms present in both docs' tables; USER-GUIDE's df-local-patches/reapply paragraph and troubleshooting row replaced by the plugin-marketplace + `/devflow:status check --migrate` line; README's old :581 line now reads `/devflow:status check --migrate`)
- **Gate failures:** None

## Files Created/Modified
- `README.md` - retired command names renamed to consolidated forms or deleted (`/devflow:update` row removed); legacy-names note reduced to one sentence pointing at `/devflow:help`; migrate line updated to `/devflow:status check --migrate`
- `docs/USER-GUIDE.md` - ASCII lifecycle diagram, 4 command tables, 4 example blocks, 3 prose mentions, and the Recovery Quick Reference table renamed/deleted/merged; `df-local-patches`/reapply section replaced by a plugin-marketplace + migrate one-liner

## Decisions Made
- Kept Core Workflow tables (README and USER-GUIDE) as three separate `/devflow:milestone audit|complete|new` rows rather than one merged bracket row, since that table is a linear step-by-step narrative (matches how `/devflow:plan-objective`, `/devflow:execute-objective` etc. already repeat verbatim across multiple sections of both docs without being treated as duplicates)
- Collapsed true same-table duplicates instead: README's Navigation-table `/devflow:progress` row (redundant with the existing `/devflow:status [check|pause|resume]` row in the Status & Session section) was deleted; USER-GUIDE's renamed `/devflow:health` row was merged into the adjacent pre-existing `/devflow:status check --migrate` row as `/devflow:status check [--migrate]`
- Renamed USER-GUIDE's troubleshooting heading from "DevFlow Update Overwrote My Local Changes" to "Updating DevFlow" — the old premise (a local installer clobbering edits) doesn't exist under plugin-marketplace distribution; no other document links to the old heading anchor

## Deviations from Plan

None - TRD executed exactly as written. The TRD's inventory gave exact line-level replacement instructions for every retired reference in both files; all were applied. The one judgment call not spelled out verbatim in the inventory — how to resolve the two same-table duplicate scenarios the TRD flagged generically ("look for rows that now duplicate each other in the same table... merge any duplicates") — is recorded above under Decisions Made rather than as a deviation, since it is exactly the behavior the TRD asked for.

## Issues Encountered
`rg -nE` (as literally written in the TRD's `<verify>` blocks) fails on this machine's ripgrep 15.2.0 because `-E` is `--encoding` in ripgrep, not "extended regex" as in GNU grep. Re-ran the identical pattern as plain `rg -n "<pattern>"` (ripgrep's default regex already supports alternation/groups), which is what the Task Evidence table above reports.

## Next Objective Readiness
- README.md and docs/USER-GUIDE.md are ready for TRD 38-09's no-ignore-region scan for retired command names — both files are clean of the 13 old names, `/devflow:update`, and `/devflow:reapply-patches`.

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: README.md
- FOUND: docs/USER-GUIDE.md
- FOUND: .planning/objectives/38-doc-auto-correction/38-06-SUMMARY.md
- FOUND: commit 0a31bc1 (Task 1)
- FOUND: commit c8143b6 (Task 2)
