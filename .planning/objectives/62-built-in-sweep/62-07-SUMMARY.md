---
objective: 62-built-in-sweep
trd: "07"
subsystem: prompts
tags: [builtin, plan-mode, askuserquestion, milestone, ratchet, BLTN-02, BLTN-03]

requires:
  - "62-01: builtin-audit.cjs scanner"
  - "62-02: docs/built-in-sweep.md inventory and references/built-ins.md conventions"
  - "62-03: builtin-sweep.repo.test.cjs ratchet and the per-group baselines"
provides:
  - "complete-milestone.md review_drafts step: one plan-mode review of the MILESTONES entry and PROJECT.md evolution drafts before either is published"
  - "The milestone group's discrete choices as AskUserQuestion calls with headers of at most 12 characters (BS-032..BS-049)"
  - "skills/milestone declares EnterPlanMode (never ExitPlanMode) and loads references/built-ins.md"
affects: [62-10]

tech-stack:
  added: []
  patterns:
    - "Skip rule on one line (`**Skip if:** --auto ... workflow.auto_advance`) within the 20 lines above EnterPlanMode(); publish after ExitPlanMode, never inside the span"
    - "Two named draft paths ($ENTRY_DRAFT, $PROJECT_DRAFT) where a step needs both, passed as the printed paths because shell variables do not survive between Bash calls"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/complete-milestone.md
    - plugins/devflow/devflow/workflows/new-milestone.md
    - plugins/devflow/devflow/workflows/plan-milestone-gaps.md
    - plugins/devflow/skills/milestone/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json

key-decisions:
  - "review_drafts sits right after evolve_project_full_review; the doc put PROJECT.md moved out of that step into review_drafts (approval branch and skip branch); milestone put stays in archive_milestone"
  - "The ship confirmation stays first, in verify_readiness, under its interactive-mode gate; it is not merged into the plan-mode review"
  - "The tag push is behind its own AskUserQuestion: Keep local (Recommended) first, Push to origin the only path to git push origin"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true

duration: 4min
completed: 2026-10-06
tokens_input: 8134637
tokens_output: 39292
tokens_cache_read: 7989050
tokens_cache_write: 145453
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 07: milestone complete presents its drafts in plan mode Summary

**`/devflow:milestone complete` now puts the MILESTONES entry and the PROJECT.md evolution in one plan-mode review before publishing either, skipped under `--auto` or `workflow.auto_advance`; the four milestone workflows ask every discrete choice with AskUserQuestion, and the milestone baseline is deleted.**

## Progress
- [x] Task 1: review_drafts in complete-milestone — a1b2d645 (RED), 4faafb57 (GREEN)
- [x] Task 2: The milestone workflows' prompts — f7d089b1 (RED), 6fa385b0 (GREEN)

## What changed

**review_drafts (BLTN-02).** New step after `evolve_project_full_review`: a `**Skip if:** --auto ... workflow.auto_advance` line (publishes the PROJECT.md draft as today), then `EnterPlanMode()`, the two drafts and an "On approval" list in the plan, `ExitPlanMode()`, then the `doc put PROJECT.md --from "$PROJECT_DRAFT"` publish. "No, keep planning" becomes `## Requested changes`, applied to the drafts and presented again. `evolve_project_full_review` no longer publishes; `archive_milestone` still records the entry (`milestone put ... --from "$ENTRY_DRAFT"`). `<purpose>` and `<archival_behavior>` describe the new order. skills/milestone gained `EnterPlanMode` and `@~/.claude/devflow/references/built-ins.md`.

**Prompts (BLTN-03).** Inventory rows resolved:

| Row | File | Result |
|-----|------|--------|
| BS-032 | complete-milestone.md | "6. Offer to create next milestone inline" reworded to point at the offer_next step |
| BS-033 | complete-milestone.md | incomplete requirements: header "Gaps", Run audit first (Recommended) / Proceed anyway / Abort; routing kept (Proceed anyway records `### Known Gaps`) |
| BS-034, BS-035 | complete-milestone.md | ship confirmation: header "Ship it?", Ship it / Wait / Adjust scope; still under the interactive-mode gate, yolo branch untouched |
| BS-036 | complete-milestone.md | header "Archive"; Yes option now marked (Recommended) |
| BS-037 | complete-milestone.md | printed Options list removed; AskUserQuestion with header "Branches" |
| BS-038 | complete-milestone.md | header "Push tag": Keep local (Recommended) / Push to origin; only Push to origin runs `git push origin v[X.Y]` |
| BS-039, BS-042 | new-milestone.md | kept (free text asked just before an AskUserQuestion); no marker |
| BS-040 | new-milestone.md | header "Version": suggested version (Recommended) / the other bump |
| BS-041, BS-043, BS-045 | new-milestone.md | headers "Research", "Gaps", "Roadmap" added; options unchanged; the Roadmap routing lines now name the real labels |
| BS-044 | new-milestone.md | header "Scope": Looks right (Recommended) / Adjust; the printed question left the fence |
| BS-046 | plan-milestone-gaps.md | purpose reworded: prints the plan command for each objective |
| BS-047 | plan-milestone-gaps.md | multiSelect "Nice-to-have" question over the nice-to-have gaps; table cell points to it |
| BS-048, BS-049 | plan-milestone-gaps.md | header "Gap plan": Create them (Recommended) / Adjust / Defer optional; printed question and wait line removed |

## Deviations from Plan

None - TRD executed as written. Notes for the verifier:

- audit-milestone.md: the inventory has no `milestone` row for it and the scanner finds nothing there, so it is unchanged although `files_modified` lists it.
- Where a converted prompt had implicit routing (incomplete-requirements Run audit first / Abort, gap-plan Adjust / Defer optional), the routing is now stated in a line under the call; outcomes are the same as before.
- plan-milestone-gaps: the nice-to-have question needs 2-4 options per question, so the text says a lone gap is a plain Include / Defer question and a longer list is split across questions.
- BS-036 keeps the one-line call form the file already used (header "Archive"), per the inventory's "options unchanged".

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: review_drafts | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 (26/26) | PASS |
| 1: placement | `rg -n "review_drafts\|EnterPlanMode\(\|doc put PROJECT.md" workflows/complete-milestone.md` | 0 | PASS: one EnterPlanMode(), publish at the skip branch and after ExitPlanMode, none in evolve_project_full_review |
| 2: milestone prompts | same two test files | 0 (26/26) | PASS, baseline file gone |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 | FAIL (correct): milestone-complete has no plan-mode draft review |
| GREEN (task 1) | same | 0 | PASS (correct) |
| RED (task 2) | same | 1 | FAIL (correct): 10 prompt findings and 10 scan rows neither pending nor resolved |
| GREEN (task 2) | same | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs` | 0 (26 pass) | PASS |
| scanner + sweep | `node --test builtin-audit.test.cjs builtin-sweep.repo.test.cjs` | 0 (112 pass) | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 (148 pass) | PASS |

## Discovered commands

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (review_drafts before publish with skip rule; every milestone choice an AskUserQuestion with a header of at most 12 characters; skills/milestone declares EnterPlanMode, not ExitPlanMode, and loads built-ins.md; baseline deleted)
- Gate failures: None
- Files changed outside the TRD's `files_modified`: none

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/workflows/complete-milestone.md, new-milestone.md, plan-milestone-gaps.md, plugins/devflow/skills/milestone/SKILL.md
- FOUND: builtin-sweep-baseline/milestone.json is deleted (7 baseline files remain)
- FOUND commits: a1b2d645, 4faafb57, f7d089b1, 6fa385b0
