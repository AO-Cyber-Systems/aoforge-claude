---
objective: 56-objective-number-correctness
trd: "03"
subsystem: df-tools requirement ids
tags: [requirements, roadmap, trd-pre, objective-complete, depends-on, regex]

requires:
  - objective: 56-objective-number-correctness
    provides: "56-02 text-escape.boldLabelPattern and the zero-tolerant objectiveNumPattern"
provides:
  - "lib/requirement-ids.cjs: extractRequirementIds(value, {objective}) and roadmapRequirementIds(section, {objective}) -> {found, ids}"
  - "verify trd-pre and objective complete read ROADMAP requirement IDs through one extractor (both colon placements, block form, ranges)"
  - "objective remove renumbers later objectives once each, including every item of a **Depends on** list"
  - "requirements mark-complete compiles CLI-supplied ids literally"
affects: [56-05, 57-calibration, 59-milestone-stats]

tech-stack:
  added: []
  patterns:
    - "IDs come only from the leading token of an ID-shaped list item; prose is never scanned"
    - "one pure extractor shared by the checker and the mutator"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/requirement-ids.cjs
    - plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs

key-decisions:
  - "The ID-shape contract (below) lives in requirement-ids.cjs's header and is the one rule trd-pre and objective complete share"
  - "A found-but-empty Requirements line stays a pass ('no requirements declared'); free text is the documented way to declare none"
  - "objective remove's ROADMAP renumber loop now ascends, so each objective moves down by exactly one"

patterns-established:
  - "A Requirements value never crosses a newline; block form is read only when the label line's value is empty"

requirements-completed: [ONUM-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

completed: 2026-10-05
---

# Objective 56 TRD 03: Requirement IDs from ID-shaped tokens Summary

**`verify trd-pre` and `objective complete` take requirement IDs only from ID-shaped list items through one extractor, `lib/requirement-ids.cjs`; a free-text `**Requirements:** none (tech debt; ...)` declares nothing, the v1.5 `**Requirements**:` label is finally read, and `requirements mark-complete` compiles ids literally.**

## Progress
- [x] Task 1: Hand-built ROADMAP-line fixtures + lib/requirement-ids.cjs — RED a116da63, GREEN 958391e6
- [x] Task 2: verify trd-pre reads requirements through requirement-ids — RED 402d6457, GREEN fed868b9
- [x] Task 3: objective complete / remove and requirements mark-complete use the same rules — RED 575ba4f3, GREEN f33cb80d

## What changed

- `requirement-ids.cjs` (new, pure, depends only on `text-escape.cjs`). `roadmapRequirementIds(section, {objective})` finds the label with `boldLabelPattern('Requirements')` (never crossing a newline) and returns `{found, ids}`.
- `trd-pre-check.cjs`: `extractRoadmapRequirements` keeps its section bounding and ends in `roadmapRequirementIds(section, { objective: objectiveNum })`.
- `objective.cjs complete`: the same extractor, and REQUIREMENTS.md is rewritten only when `found && ids.length > 0`. The existing `escapeRegExp(reqId)` checkbox and table replacements are unchanged.
- `objective.cjs remove`: Depends-on lines are matched with `boldLabelPattern('Depends on')`; see Deviations 1 and 2 for the loop fix.
- `misc.cjs cmdRequirementsMarkComplete`: all three RegExp sources use `escapeRegExp(reqId)`.
- Dogfood: `verify trd-pre 56` against the real `**Requirements**: ONUM-01, ONUM-02, ONUM-03, ONUM-04` line now reads those four IDs (`requirement_coverage.passed: true`, `missing: []`). Before this TRD the line was never found.

## Final ID-shape rules (the contract later objectives rely on)

A requirement ID is an uppercase token:
- **Hyphenated:** `[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+` (`ONUM-01`, `R-1`, `REQ-10-03`, `F1-CONFIG`, `PHASE-B1`, `GATE-PTY-MESSAGE`).
- **Letter-digit:** `[A-Z]{1,8}\d+` (`F1`, `C1`, `A1`).
- **Objective-scoped numeric:** `<this objective's number>-<n>` via `objectiveNumPattern(objective) + '-\d+'` (`55-1` for objective 55; zero-tolerant, so `055-1` also works). Accepted only when an objective is given, so `2026-10` and `53-02` are never IDs.
- **Range:** `<ID>..<ID>` or `<ID>..<digits>` with the same prefix (`GWP-01..GWP-05`, `DOC-01..07`, `F1..F3`). Expands inclusive and keeps the start token's zero-pad width. A descending range, one with more than 50 items, or one whose prefixes differ yields just the two endpoints.

ID-shaped means the item starts with the ID.
- **Inline:** strip one surrounding `[...]`, split on `,` and `;` outside parentheses and backticks (a character loop, not a regex), take each item's leading token after stripping leading whitespace, `(`, `[`, `*` and backticks.
- **Boundary:** the whole token must be ID-shaped, followed by end, whitespace, `:`, `)`, `]`, `,`, `;`, a closing `*` or backtick, or a non-ASCII marker such as a check mark.
- **Block form:** when the label line's value is empty, the immediately following `- ` / `* ` bullet lines each contribute their leading token. The first non-bullet line ends the list.
- **Case:** lowercase IDs (`req-01`) are not accepted.
- **Result:** de-duplicated, first-seen order. `found` is true whenever the label is present, even with no IDs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `objective remove` renumbered the ROADMAP in descending order and collapsed every later objective**
- **Found during:** Task 3 (RED, while building the test 7 fixture)
- **Issue:** the loop ran `oldNum` from 99 down to `removed+1`. A heading renamed 5 to 4 was renamed again 4 to 3 on the next pass, so removing objective 3 from a roadmap with objectives 3-6 left `### Objective 3:` three times (headings, checkbox items, job references and Depends-on lines all collapsed). The directory renames use a separate computed plan and were correct. TRD test 7 (`Objective 3, Objective 4`) cannot hold without this fix.
- **Fix:** loop ascends (`removed+1` up to 99). Pinned by new test 7a (headings 4, 5, 6 become 3, 4, 5).
- **Files modified:** plugins/devflow/devflow/bin/lib/objective.cjs, objective.test.cjs
- **Commit:** f33cb80d (RED 575ba4f3)

**2. [Rule 1 - Bug] The Depends-on rule renamed only the first `Objective N` after the label**
- **Found during:** Task 3
- **Issue:** the TRD's single regex `(label\s*Objective\s+)N\b` replaces the first item only. The generic `Objective N[:\s]` rule catches the last item (end of line) but not a middle one (`Objective 5,`), so `Objective 4, Objective 5, Objective 6` would still renumber wrongly.
- **Fix:** the label is matched with `boldLabelPattern('Depends on')` as prescribed, but the rename runs line-scoped over every `Objective N` on a Depends-on line, with the boundary `(?!\.?\d)` (so `Objective 4.1` is not read as 4). Pinned by test 7b (three items, colon-inside-bold form).
- **Files modified:** plugins/devflow/devflow/bin/lib/objective.cjs, objective.test.cjs
- **Commit:** f33cb80d

**3. [Clarification] Two small widenings of the "ID shape" contract**
- A leading `[` is stripped like `(`, `*` and backticks, so `[F1, F2] (note)` does not lose F1. A closing `*` or backtick is an accepted boundary, so `**ONUM-01**` and `` `ONUM-02` `` are IDs (the contract strips the leading marker but did not name the closer). Tests 16c and 16d pin both.

### Other notes
- The "56-03" entry in trd-pre-check.test.cjs's Test-list header went into the RED commit, not the GREEN one (it is a test-file comment).
- Extra tests beyond the TRD's list: requirement-ids 16b-16d, 17e-17f, 20e-20f, 21b-21c, 22b; trd-pre 3b (block form end to end); objective 7a, 7b.
- Observed, not touched (outside this TRD): the remove loop's job-reference rule `${oldPad}-(\d{2})` has no boundary, so a date such as `2018-01` in a ROADMAP would be rewritten when an earlier objective is removed. The 99-objective cap is also unchanged.

## Auth gates
None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: requirement-ids.cjs | `node --test plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs` (30 tests) | 0 | PASS |
| 2: trd-pre reads requirement-ids | `node --test plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` (41 tests) | 0 | PASS |
| 3: objective complete/remove, mark-complete | `node --test objective.test.cjs misc-requirements.test.cjs df-tools.test.cjs` (213 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test requirement-ids.test.cjs` | 1 (MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN (T1) | `node --test requirement-ids.test.cjs` | 0 | PASS (correct) |
| RED (T2) | `node --test trd-pre-check.test.cjs` | 1 (4 of 41 fail: tests 1, 2, 3, 3b) | FAIL (correct) |
| GREEN (T2) | `node --test trd-pre-check.test.cjs` | 0 | PASS (correct) |
| RED (T3) | `node --test misc-requirements.test.cjs`; `node --test --test-name-pattern=56-03 objective.test.cjs` | 1 (tests 8, 9; 5, 7a, 7, 7b fail) | FAIL (correct) |
| GREEN (T3) | same files plus df-tools.test.cjs | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test requirement-ids.test.cjs trd-pre-check.test.cjs objective.test.cjs misc-requirements.test.cjs` (all green; 213-test run above covers the same files) | 0 | PASS |
| test | `npm test` | 1 | PASS for this TRD; 9296 tests, 9261 pass, 3 fail, 32 skipped. The 3 failing tests: `MA-7 doctl auth init` (suite: handoff pipeline PTY-path mock auth) and `github-enterprise-migration` (suite: stack init against the real fleet), both known machine baseline; and E2E1 (below), which is not baseline |
| test (re-run) | `node --test --test-name-pattern="E2E1: SELF-TEST — reconcile" roadmap-reconcile.test.cjs` | 0 | PASS after `roadmap update-job-progress 56` |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

`E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` also failed in the `npm test` run, on a single drift line: the 56-03 ROADMAP checkbox was still `[ ]` while 56-03's SUMMARY existed. That is a state-ordering effect, not a code defect. `roadmap update-job-progress 56` (run after the first post of this SUMMARY) ticked the box (`trd_checkboxes_ticked: 1`) and the test then passed. Any TRD run through the same order hits the same transient until its checkbox is ticked.

## Discovered commands
None. Every command came from the stack profile (`npm test`, scoped `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0 (two Rule 1 deviations fixed in the same task, first attempt green)
- Must-haves verified: 6/6 truths (trd-pre free text and colon-outside-bold, ranges and mixed lines, block form, objective complete via the extractor plus Depends-on renumber, mark-complete literal ids)
- Gate failures: baseline only (MA-7, PTY-path mock auth, github-enterprise-migration fleet). E2E1 failed once as a state-ordering transient and passes after the ROADMAP checkbox is ticked.
- State: `state advance-job` read `total_jobs: 0` for objective 56 and set Status to "Objective complete — ready for verification" (the known bug); corrected with `state update Status` to the real position. The first metric row recorded an unmeasured duration (40min) and was corrected to 9min (claim 16:24:22Z to 16:33Z); STATE_ARCHIVE.md was edited by hand for that one number because `record-metric` can only append.
- This SUMMARY was posted twice (local mode: the same worktree file rewritten, zero GitHub calls) to add the E2E1 re-run result that the first post only promised.

## Self-Check: PASSED
- FOUND: plugins/devflow/devflow/bin/lib/requirement-ids.cjs
- FOUND: plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs
- FOUND commits: a116da63, 958391e6, 402d6457, fed868b9, 575ba4f3, f33cb80d
