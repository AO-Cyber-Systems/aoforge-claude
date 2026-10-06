---
objective: 62-built-in-sweep
trd: "11"
subsystem: prompts
tags: [builtin-sweep, askuserquestion, allowed-tools, bltn-03, remaining]

requires:
  - "62-01: builtin-audit.cjs scanner"
  - "62-02: docs/built-in-sweep.md inventory (remaining rows BS-102..BS-120)"
  - "62-03: builtin-sweep.repo.test.cjs ratchet and the remaining.json baseline"
provides:
  - "Every discrete choice in the remaining group is an AskUserQuestion with a header (Audit scope, Archive, Research, Next step, Checkpoint, Inconclusive, Repair, GitHub store)"
  - "cleanup, flow, security-audit, research-objective and list-objective-assumptions declare AskUserQuestion"
  - "The remaining baseline is empty and deleted"
affects: [62-10]

tech-stack:
  added: []
  patterns:
    - "Object-form AskUserQuestion blocks with the recommended option first, followed by one routing bullet per label"
    - "Free-text follow-ups (Dig deeper, Add context, other checkpoint types) asked in plain prose, never an AskUserQuestion without options"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/security-audit.md
    - plugins/devflow/skills/security-audit/SKILL.md
    - plugins/devflow/devflow/workflows/cleanup.md
    - plugins/devflow/skills/cleanup/SKILL.md
    - plugins/devflow/skills/flow/SKILL.md
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/skills/research-objective/SKILL.md
    - plugins/devflow/devflow/workflows/research-objective.md
    - plugins/devflow/skills/list-objective-assumptions/SKILL.md
    - plugins/devflow/devflow/workflows/list-objective-assumptions.md
    - plugins/devflow/devflow/workflows/settings.md
    - plugins/devflow/skills/doctor/SKILL.md
    - plugins/devflow/skills/gh-sync/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json

key-decisions:
  - "cleanup gains an allowed-tools list holding only AskUserQuestion: allowed-tools pre-approves, it does not restrict, so adding Bash would have pre-approved the directory moves"
  - "gh-sync's migrate question puts Not now (Recommended) first, per the built-ins.md order rule, although the inventory row lists it second"
  - "gh-sync's AskUserQuestion prose was changed additively (header and order); the existing token, labels and routing stay, and gh-sync-skill.repo.test.cjs pins only the AskUserQuestion token"

requirements-completed: []

duration: 6min
completed: 2026-10-06
---

# Objective 62 TRD 11: Questions in the remaining skills and workflows Summary

**The remaining group's discrete choices (audit scope, archive confirmation, existing research, research outcomes, assumption next step, doctor repair, gh-sync migrate) are AskUserQuestion calls with headers. Settings asks its six questions in two calls of three. The remaining built-in sweep baseline is gone.**

## Progress
- [x] Task 1 RED: security-audit, cleanup, flow and help leave the baseline — 4a29c78b
- [x] Task 1 GREEN (a): security-audit asks with AskUserQuestion and declares it — 668d76c2
- [x] Task 1 GREEN (b): cleanup asks with a proper AskUserQuestion; cleanup and flow declare it — 85be87df
- [x] Task 1 GREEN (c): help.md describes verify-work's free-text answer — 257b32d5
- [x] Task 2 RED: research and assumption prompts leave the baseline — 97345ce0
- [x] Task 2 GREEN (a): research-objective asks with AskUserQuestion and declares it — 0d3330db
- [x] Task 2 GREEN (b): list-objective-assumptions: correction stays free text (marker), next step is an AskUserQuestion — 29973b08
- [x] Task 2 GREEN (c): settings splits its six questions into two calls of three — 747b0fac
- [x] Task 2 GREEN (d): doctor and gh-sync questions get headers; empty baseline deleted — 089b30d0

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-06T22:41:37Z
- **Completed:** 2026-10-06T22:47Z
- **Tasks:** 2 (9 commits: 2 RED, 7 GREEN split by skill group)
- **Files modified:** 13, plus 1 deleted

## Inventory rows resolved

| Row | File | Resolution |
|-----|------|------------|
| BS-102 | workflows/cleanup.md | AskUserQuestion header "Archive": Cancel (Recommended) / Archive listed objectives; Cancel stops, Archive continues to archive_objectives |
| BS-103 | workflows/help.md | reworded: "Presents tests one at a time (pass, or describe what is wrong)" |
| BS-104 | workflows/help.md | not touched: plan-mode paragraph left for TRD 62-10 |
| BS-105 | workflows/list-objective-assumptions.md | allow marker (free-text: the user corrects the assumptions in their own words) on the line above `Wait for user response.` |
| BS-106 | workflows/list-objective-assumptions.md | AskUserQuestion header "Next step": Plan this objective (Recommended) / Discuss context / Re-examine assumptions / Done for now; printed menu deleted |
| BS-107 | workflows/list-objective-assumptions.md | `Wait for user selection.` replaced by the Next step question; existing If-routing kept, "Re-examine" routing renamed to the full label, Done for now stops |
| BS-108 | workflows/research-objective.md | AskUserQuestion header "Research": View existing (Recommended) / Update research / Skip |
| BS-109 | workflows/research-objective.md | AskUserQuestion header "Next step": Plan objective (Recommended) / Dig deeper / Review full / Done |
| BS-110 | workflows/research-objective.md | checkpoint:decision asks with header "Checkpoint" and the checkpoint's options (runtime-list rule for more than 4); other checkpoint types stay free text |
| BS-111 | workflows/research-objective.md | AskUserQuestion header "Inconclusive": Add context / Try another mode / Manual |
| BS-112 | workflows/security-audit.md | AskUserQuestion header "Audit scope": Re-scan (Recommended) / Cancel; the printed Options list and `Wait for user response.` deleted |
| BS-113 | workflows/settings.md | the six-question call split into two calls of three (Model, Research, Plan Check; then Verifier, Auto, Branching); options unchanged |
| BS-114 | workflows/settings.md | reworded: `- [ ] Save-as-defaults question asked (~/.devflow/defaults.json)` |
| BS-115 | skills/doctor/SKILL.md | header "Repair": Apply fixes (Recommended) / Skip; yolo still applies without asking |
| BS-116 | skills/gh-sync/SKILL.md | header "GitHub store": Not now (Recommended) / Migrate now / Keep mirror mode; the cost statement stays in the question |
| BS-117 | skills/research-objective/SKILL.md | AskUserQuestion header "Research", same as BS-108 |
| BS-118 | skills/research-objective/SKILL.md | AskUserQuestion header "Next step", same as BS-109 |
| BS-119 | skills/research-objective/SKILL.md | checkpoint:decision header "Checkpoint", same as BS-110 |
| BS-120 | skills/research-objective/SKILL.md | AskUserQuestion header "Inconclusive", same as BS-111 |

allowed-tools rows: cleanup, flow, list-objective-assumptions, research-objective and security-audit now declare AskUserQuestion. The baseline's `cleanup:AskUserQuestion` and `flow:AskUserQuestion` pairs are gone.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (tests 2, 7, 9a fail naming security-audit.md:59/64, cleanup/flow pairs, BS-112) | FAIL (correct) |
| 1 GREEN | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 (30/30) | PASS |
| 2 RED | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (tests 2, 9a fail naming 6 findings / BS-105, 107, 109, 111, 114, 117) | FAIL (correct) |
| 2 GREEN | `node --test builtin-sweep.repo.test.cjs gh-sync-skill.repo.test.cjs skill-requires.repo.test.cjs doc-refs.repo.test.cjs builtin-audit.test.cjs` | 0 (135/135) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../builtin-sweep.repo.test.cjs` | 1 | FAIL (correct) |
| GREEN (Task 1) | `node --test .../builtin-sweep.repo.test.cjs .../doc-refs.repo.test.cjs` | 0 | PASS (correct) |
| RED (Task 2) | `node --test .../builtin-sweep.repo.test.cjs` | 1 | FAIL (correct) |
| GREEN (Task 2) | `node --test .../builtin-sweep.repo.test.cjs .../gh-sync-skill.repo.test.cjs .../skill-requires.repo.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, task gate) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |
| builtin audit + sweep | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 0 (112 tests, 112 pass) | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 (148 tests, 148 pass) | PASS |
| test-list item 4 | `node --test gh-sync-skill.repo.test.cjs skill-requires.repo.test.cjs doc-refs.repo.test.cjs` | 0 | PASS |

Full `npm test` was not run: the TRD's gates are scoped, and 62-03 recorded 3 unrelated `npm test` failures on this base.

## Deviations from Plan

### Interpretations (no Rule 1-4 fix needed)

**1. gh-sync migrate question changed additively despite the "do not change its AskUserQuestion prose" rule**
- **Found during:** Task 2
- **Issue:** The TRD's binding rules say not to change gh-sync's existing AskUserQuestion prose because gh-sync-skill.repo.test.cjs pins it, but Task 2 and inventory row BS-116 ask for a header. The test pins only the `AskUserQuestion` token, plus `requires:` and allowed-tools.
- **Fix:** Added `header "GitHub store"` and moved **Not now (Recommended)** first. The token, the labels, the cost statement and every routing sentence are unchanged. gh-sync-skill.repo.test.cjs and skill-requires.repo.test.cjs pass.
- **Commit:** 089b30d0

**2. BS-116 option order follows built-ins.md, not the inventory row**
- The row lists `Migrate now / Not now (Recommended) / Keep mirror mode`. built-ins.md requires the recommended option first, so the order is Not now (Recommended) / Migrate now / Keep mirror mode. 62-10 may want to update the row's text.

**3. cleanup's new allowed-tools holds AskUserQuestion only**
- cleanup had no `allowed-tools` key. allowed-tools pre-approves and does not restrict (builtin-audit.cjs header), so declaring only AskUserQuestion leaves the skill's other tools as they were. It does not pre-approve the Bash moves.

**4. Routing added where the old prose had none**
- The research-objective outcomes (Plan objective, Dig deeper, Review full, Done; Add context, Try another mode, Manual) and the existing-research choice had no explicit routing. Each label now has one routing bullet that matches what the old wording implied. Dig deeper and Add context ask their follow-up in plain prose (free text). Try another mode picks the mode that fits what was missing and says which, so no unguided prose choice is added.

**5. Extra commits**
- The orchestrator asked for one commit per skill group, so the TRD's single GREEN commit per task became 3 for Task 1 and 4 for Task 2. help.md's reword is a `docs(62-11)` commit.

### Observations for 62-10 (not changed: no inventory row, scanner does not flag)
- skills/gh-sync step 1 ("ask (AskUserQuestion) whether to enable GitHub and for `owner/repo`") mixes a choice with a free-text repo name. Step 2a's mirror_only question has no header. Neither has an inventory row.

None of the deviation rules (Rules 1-4) were triggered.

## Discovered commands

None: the TRD's commands were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4. Discrete choices are AskUserQuestion. cleanup has a proper option list with Cancel first, and cleanup and flow declare AskUserQuestion. Corrections and descriptions stay prose, and help.md's plan-mode paragraph is untouched. Every group skill declares its built-ins, and the baseline is deleted.
- Gate failures: None
- Files changed outside `files_modified`: none (the SUMMARY aside)
- `requirements mark-complete` not run for BLTN-03 (the orchestrator marks it at objective completion)

## Self-Check: PASSED

- FOUND: every modified file in key-files (13); MISSING as intended: builtin-sweep-baseline/remaining.json
- FOUND commits: 4a29c78b, 668d76c2, 85be87df, 257b32d5, 97345ce0, 0d3330db, 29973b08, 747b0fac, 089b30d0
