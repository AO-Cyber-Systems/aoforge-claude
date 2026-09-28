---
objective: 38-doc-auto-correction
job: "02"
subsystem: infra
tags: [devflow, validate.cjs, health-check, regex, workstreams, cli-fix-text]

# Dependency graph
requires:
  - objective: 38-doc-auto-correction (TRD 38-01)
    provides: doc-refs resolver groundwork for this objective's stale-command sweep
provides:
  - "W002 rewritten to read live STATE.md position lines (POSITION_RES) instead of a dead `[Pp]hase\\s+N` regex"
  - "W002 is non-repairable and no longer pushes `regenerateState` — cannot destroy a user's STATE.md"
  - "W002's known-objective set includes archived `.planning/milestones/**/<NN-name>` dirs, not just current `.planning/objectives/`"
  - "All ten `/df:` fix-text strings in validate.cjs replaced with live `/devflow:` command names"
  - "misc.cjs CONTEXT scaffold names `/devflow:discuss-objective N`"
  - "workstreams.cjs `filteredState` template extracted into exported pure function `buildWorkstreamState({ ws, relMain, today })`, fixing the `/devflow:workstreams merge` line"
affects: [38-10 (adds Check 14 to validate.cjs after this TRD), any objective touching validate.cjs health checks or workstreams provisioning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anchored multiline regex set (POSITION_RES) for parsing STATE.md position conventions instead of loose prose-matching regex"
    - "Non-repairable addIssue pattern: never push a repair action string for warnings that would require destructive whole-file regeneration"
    - "Pure-function extraction for testability: inline template-literal generators pulled into exported, parameter-object functions"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/workstreams.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs

key-decisions:
  - "W002 uses three narrowly-anchored /gm regexes tied to the exact current STATE.md position-line conventions, rather than a broader `objective\\s+(\\d+)` pattern that would match decisions prose referencing archived/future objectives"
  - "W002 known-objective comparison uses parseFloat on both sides rather than string Set membership, so zero-padding (07 vs 7) is transparent"
  - "Archived objectives are discovered one OR two levels under .planning/milestones/ (both flat and milestone-version-nested layouts)"

patterns-established:
  - "Non-repairable warning pattern for checks whose only possible fix is destructive: addIssue(..., repairable=false) and never push the corresponding action to `repairs`"

requirements-completed:
  - "DOC-03: stale-text generators fixed (validate.cjs fix text + regenerateState line, misc.cjs CONTEXT scaffold, workstreams.cjs worktree STATE)"
  - "DOC-07: W002 retargeted to current Objective wording, archived milestone dirs counted, not repairable, first tests"

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 55min
completed: 2026-09-28
---

# Objective 38 TRD 02: Stop generating stale text; retarget W002 Summary

**W002 rewritten from a dead `[Pp]hase\s+N` regex to a live, non-repairable STATE.md position-line check; every remaining `/df:` fix-text string across validate.cjs, misc.cjs, and workstreams.cjs replaced with live `/devflow:` command names**

## Performance

- **Duration:** 55 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- W002 now reads only the three anchored position-line conventions current STATE.md files actually use, ignores prose entirely, counts archived objectives under `.planning/milestones/**`, and can never trigger a destructive `--repair` (no `regenerateState` push, `repairable=false`)
- All ten `/df:` strings in `validate.cjs` (E001, E002, E003, E004, W003, E005, W008 fix, W009 fix, the `regenerateState` Session Log line, plus the old W002 fix text it replaced) now name live `/devflow:` commands
- `misc.cjs`'s CONTEXT scaffold and `workstreams.cjs`'s worktree STATE.md generator (now an exported pure function `buildWorkstreamState`) no longer emit `/df:` anywhere
- Zero regressions: 10 failures in the full 4,032-test suite, all an exact subset of `baseline-failures.tsv`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: W002 retarget + non-repairable (tests 1-5) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (55/55) |
| 2: Live fix text + generators (tests 6-10) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (195/195) |

## Task Commits

Each task was committed atomically (RED then GREEN, per `tdd="true"`):

1. **Task 1 RED: W002 tests** - `3524f7d` (test) - "W002 on current Objective wording, archived dirs, no destructive repair"
2. **Task 1 GREEN: W002 implementation** - `3508a5a` (fix) - "W002 matches current STATE.md position fields and never regenerates STATE.md"
3. **Task 2 RED: live command name tests** - `0db1c28` (test) - "live command names in health fix text and generated files"
4. **Task 2 GREEN: fix text + generator extraction** - `d9e6c06` (fix) - "generators and health fix text name live /devflow: commands"

**Plan metadata:** (this commit) `docs(38-02): complete stale-text generators and W002 retarget TRD`

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| targeted tests (validate + df-tools) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (195/195) |
| no stale `/df:` strings | `rg -n "/df:" plugins/devflow/devflow/bin/lib/validate.cjs plugins/devflow/devflow/bin/lib/misc.cjs plugins/devflow/devflow/bin/lib/workstreams.cjs` | 1 (rg: no matches) | PASS (empty) |
| this repo's own health check clean of W002 | `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw \| grep -c W002` | — | PASS (0 hits) |
| full regression suite (baseline-relative) | `node --test --test-reporter=spec 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 (10 known-baseline failures) | PASS (0 regressions) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, cases 1-5) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 1 | FAIL (correct — old dead regex never matched new fixtures) |
| GREEN (Task 1, cases 1-5) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (correct — POSITION_RES + milestones set + non-repairable) |
| RED (Task 2, cases 6-10 + test 24 update) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` | 1 | FAIL (correct — old `/df:` strings still present) |
| GREEN (Task 2, cases 6-10 + test 24 update) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (correct — all live `/devflow:` strings, buildWorkstreamState exported) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 (all `must_haves.truths` from TRD frontmatter confirmed: no `/df:` in the three files; live command names for E001-E005/W003/W008/W009/regenerateState; POSITION_RES-only matching with prose exclusion; milestones-inclusive known-objective set; W002 non-repairable with byte-identical `--repair`)
- **Gate failures:** None outside the pre-existing baseline

## Regression Tallies

Regression gate run: `node --test --test-reporter=spec 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` from the worktree root.

- **Baseline:** 4,023 tests (`.planning/objectives/38-doc-auto-correction/baseline-failures.tsv`, 20 known pre-existing/flaky failures listed)
- **This run:** 4,032 tests / 579 suites / 3,972 pass / 10 fail / 0 cancelled / 50 skipped / 0 todo / duration 75.4s
- **Test delta:** +9 (8 new cases in `validate.test.cjs`'s new describe block + 1 new `buildWorkstreamState` case in `df-tools.test.cjs`; the scaffold-context and W008-test-24 changes extended existing tests rather than adding new ones) — 4023 + 9 = 4032, matches exactly
- **Failure comparison:** the 10 observed failures' `file:line` locations are an exact subset of `baseline-failures.tsv`'s locations — `comm -23 actual-failures.txt baseline-locs.txt` produced empty output (all failures already known: `devflow-watch.test.cjs` daemon-timing tests, `handoff-e2e.test.cjs` SIGTERM/daemon-lifecycle tests — the same classes of known-flaky daemon/timing tests the TRD calls out)
- **Zero new failures introduced by this TRD's changes.**

## W002 Before/After Behavior

**Before:**
- Matched a loose, unanchored `/[Pp]hase\s+(\d+(?:\.\d+)?)/g` regex across the entire STATE.md body — dead code, since no current STATE.md format uses "Phase N" wording (untested: `grep -c W002 validate.test.cjs` → 0 prior to this TRD)
- Compared matched numbers only against `.planning/objectives/` — archived objectives under `.planning/milestones/` were invisible to it and would have false-positived
- Was `repairable: true` and unconditionally pushed `'regenerateState'` into the `repairs` array — a single stray "Phase N" string anywhere in prose (e.g., "Phase A handoff snapshot") would have let `--repair` overwrite a user's entire STATE.md with a 12-line stub

**After:**
- Matches only three line-anchored, multiline (`/gm`) regexes tied to the actual current position-line conventions: `^\*\*Objective complete:\*\*\s*(\d+(?:\.\d+)?)`, `^\*\*Current [Oo]bjective:\*\*\s*(\d+(?:\.\d+)?)`, `^Objective:\s*(\d+(?:\.\d+)?)\s+of\b`
- Known-objective set is `.planning/objectives/<NN-…>` UNION `<NN-…>` dirs found one or two levels under `.planning/milestones/`, compared via `parseFloat` (so `07` == `7`)
- Is `repairable: false` with fix text `Correct the objective number in STATE.md (or restore the objective directory)`, and never pushes `regenerateState` — `--repair` on a W002-only project leaves STATE.md byte-identical (verified by test case 6/case 5 in TRD numbering)
- Prose containing objective-like numbers (`objectives 27–36 complete`, `Phase 9 handoff`, `Phase A handoff snapshot`) never matches (verified by test case 4/5 in TRD numbering)
- This repo's own `validate health --raw` reports zero W002 issues post-change, confirmed against this repo's real STATE.md (objectives 0-36, all present on disk)

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/validate.cjs` - W002 rewritten (POSITION_RES, milestones-inclusive known set, non-repairable); all remaining `/df:` fix-text strings replaced with live `/devflow:` commands
- `plugins/devflow/devflow/bin/lib/validate.test.cjs` - New `describe('objective 38 — W002 + live fix text', …)` block with 8 cases; existing W008 test (case 24) text assertion updated
- `plugins/devflow/devflow/bin/lib/misc.cjs` - CONTEXT scaffold's `_Decisions will be captured during..._` line now names `/devflow:discuss-objective`
- `plugins/devflow/devflow/bin/lib/workstreams.cjs` - `filteredState` template literal extracted into exported pure function `buildWorkstreamState({ ws, relMain, today })`; merge-command line fixed; `module.exports` updated
- `plugins/devflow/devflow/bin/df-tools.test.cjs` - `scaffolds context file` test extended with 2 new assertions; new `describe('buildWorkstreamState', …)` block added with 1 case

## Decisions Made
- Chose three narrowly-anchored regexes over a single broad `objective\s+(\d+)` pattern specifically to satisfy the TRD's anti-pattern guidance — a broad pattern would match decisions prose referencing archived/future objectives and reintroduce false positives
- Used `parseFloat` for numeric objective-number comparison rather than a Set of zero-padded strings, since it handles `07` == `7` without extra normalization logic
- Extracted `buildWorkstreamState` as a pure, parameter-object function (not a class method or closure) so it could be tested directly without provisioning a real git worktree

## Deviations from Plan

None — TRD executed exactly as written. One operational note (not a scope deviation): the `~/.claude/devflow/bin/df-tools.cjs` mirror on this machine predates TRD 37-02's `--cwd` flag addition (this feature branch), so all `df-tools --cwd` invocations (commits, health checks) in this session used the worktree's own copy at `plugins/devflow/devflow/bin/df-tools.cjs` by absolute path instead of the home-mirrored binary. This did not change any code path touched by the TRD and produced identical commit/verification behavior.

## Issues Encountered
None outside the expected RED-phase failures. One self-caught authoring slip: while inserting the sixth new `validate.test.cjs` case, an Edit call briefly left a stray unused helper (`function found_or(fn, arr) { return arr; }`) and a malformed assertion in the diff — caught by re-reading the edit output before any test run, and corrected with an immediate follow-up Edit. No test run was spent on the broken state.

## Next Objective Readiness
- `validate.cjs` Check 4 (W002) is now live, tested, and safe for TRD 38-10 to add Check 14 after it in the same file
- All four stale-text generation paths named in the objective (CONTEXT scaffold, workstream STATE.md, validate.cjs fix text, W002 itself) are closed
- No blockers for downstream objectives touching `validate.cjs` or `workstreams.cjs`

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: `.planning/objectives/38-doc-auto-correction/38-02-SUMMARY.md`
- FOUND: `3524f7d` (test — Task 1 RED)
- FOUND: `3508a5a` (fix — Task 1 GREEN)
- FOUND: `0db1c28` (test — Task 2 RED)
- FOUND: `d9e6c06` (fix — Task 2 GREEN)
- FOUND: `3934be2` (docs — this SUMMARY commit)
