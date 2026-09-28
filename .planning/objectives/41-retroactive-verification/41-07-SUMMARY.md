---
objective: 41-retroactive-verification
trd: "07"
job: 41-07
requirements: [VER-28]
status: complete
gap_closure: true
subsystem: agents / model-profiles
tags: [effort, frontmatter, model-profiles, merge-drift, tdd]
dependency-graph:
  requires: []
  provides:
    - "Reference effort column pinned to agent frontmatter (test)"
    - "Obsolete df-<agent> profile-key guard across agents/skills/workflows (test)"
  affects:
    - 28-model-tier-binding-and-escalation (gap truth 3 in 28-VERIFICATION.md now holds at HEAD)
tech-stack:
  added: []
  patterns:
    - "Docs-to-frontmatter parity test: parse the reference table, compare against each agent file, collect every mismatch, assert once"
key-files:
  created:
    - .planning/objectives/41-retroactive-verification/41-07-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/model-profiles.test.cjs
    - plugins/devflow/agents/planner.md
    - plugins/devflow/agents/ui-evaluator.md
    - plugins/devflow/devflow/workflows/ui-eval.md
    - plugins/devflow/devflow/workflows/design-review.md
    - plugins/devflow/skills/ui-eval/SKILL.md
    - plugins/devflow/skills/design-review/SKILL.md
    - CHANGELOG.md
decisions:
  - "references/model-profiles.md stays the canonical effort source. model-profiles.json keeps no effort field, and the test compares the .md table with the frontmatter."
  - "The table parser is scoped to the '## Profile Definitions' section, because the 'Tier → model id' table rows match the same row regex"
metrics:
  started: 2026-09-28T16:42:07Z
  completed: 2026-09-28T16:46:11Z
  duration: ~4m (excluding two full-suite runs)
  tasks: 2
  files: 8
---

# Objective 41 TRD 07: Restore the 28-03 effort declarations and pin them to the reference — Summary

**One-liner:** `planner` gets `effort: xhigh` back and `ui-evaluator` gets `effort: high` back. Merge b657033 had dropped both. Six prompt lines go back to the canonical `ui-evaluator` profile key. `model-profiles.test.cjs` now fails when the reference effort column drifts from agent frontmatter, and when any prompt names a `df-<agent>` profile key.

## What changed

- **Test (RED, eef1486).** Added `describe('TRD 41-07 — reference effort column matches agent frontmatter')` with 3 tests:
  1. Every `profiles.agents` key has exactly one row in the Profile Definitions table. Missing or duplicate rows are named.
  2. For every row, the documented effort ('—'/'-' = none) equals the frontmatter `effort:` (absent = none). The test collects all mismatches and asserts once. It catches drift in both directions, including a documented '—' next to a declared effort. It also guards against a parser that finds fewer rows than there are profile keys.
  3. No `agents/*.md`, `skills/**/SKILL.md` or `workflows/**/*.md` file contains a backticked `` `df-<key>` `` for any key in `profiles.agents`. The regex is built from the keys, so `df-tools`, hook names and `/devflow:` never match. Hits are reported as `file:line`.
- **Fix (GREEN, 3d8e25f).**
  - `planner.md`: `effort: xhigh` after `description:`.
  - `ui-evaluator.md`: `effort: high` after `description:`.
  - `` `df-ui-evaluator` `` → `` `ui-evaluator` `` on the 6 listed lines. No other wording changed.
  - CHANGELOG `[Unreleased]` → `### Fixed`: one bullet.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 1 | FAIL (correct): 14 pass, 2 fail |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 0 | PASS (correct): 16/16 |

RED failure output (commit eef1486, before the fix):

```
✖ documented effort equals frontmatter effort for every row (— means none)
  AssertionError [ERR_ASSERTION]: agent frontmatter effort drifted from references/model-profiles.md:
    planner: documented xhigh, frontmatter none
    ui-evaluator: documented high, frontmatter none

✖ no agent, skill or workflow prompt names a profile key with the obsolete df- prefix
  AssertionError [ERR_ASSERTION]: obsolete df- profile keys (canonical keys have no prefix):
    plugins/devflow/agents/ui-evaluator.md:13 (`df-ui-evaluator`)
    plugins/devflow/agents/ui-evaluator.md:107 (`df-ui-evaluator`)
    plugins/devflow/devflow/workflows/design-review.md:21 (`df-ui-evaluator`)
    plugins/devflow/devflow/workflows/ui-eval.md:19 (`df-ui-evaluator`)
    plugins/devflow/skills/design-review/SKILL.md:43 (`df-ui-evaluator`)
    plugins/devflow/skills/ui-eval/SKILL.md:41 (`df-ui-evaluator`)
```

The RED names exactly the two expected agents and the six expected lines. The row-count test passed at RED, which is expected: all 13 rows were already present, so it guards the table rather than this drift. All 14 pre-existing tests passed at RED, including the haiku-no-effort rule (`model-profiles.test.cjs:127`).

Counterfactual: at merge b657033, `references/model-profiles.md` documents `planner | … | xhigh` and `ui-evaluator | … | high`. Neither agent file has an `effort:` line there (`git show b657033:plugins/devflow/agents/{planner,ui-evaluator}.md`). The parity test would have failed on that merge.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 1 (expected) | PASS: RED for exactly planner, ui-evaluator and the 6 lines |
| 2: GREEN fix | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 0 | PASS: 16/16 |
| 2: effort inventory | `rg -n -e '^effort:' plugins/devflow/agents` | 0 | PASS: 6 agents. planner, executor, debugger, security-auditor at xhigh; roadmapper, ui-evaluator at high |
| 2: stale key gone | ``rg -n -e '`df-ui-evaluator`' plugins/devflow/agents plugins/devflow/skills plugins/devflow/devflow/workflows`` | 1 (no matches) | PASS |
| 2: version files | `git diff HEAD~2 -- package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` | 0 (empty) | PASS |
| 2: CHANGELOG scope | `git diff HEAD~2 -- CHANGELOG.md` | 0 | PASS: one bullet, inside [Unreleased] → ### Fixed only |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| file | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 0 | PASS (16/16) |
| suite | `npm test` | 1 | 4237 tests / 4203 pass / **2 fail** / 32 skipped (see below) |

Baseline given: 4234 / 4201 / 1 fail (MA-7) / 32 skipped. The 3 new tests from this TRD all pass (+3). One test that passed in the baseline now fails (−1), so passes are net +2 (4203). The fail count is **2**, not 1.

1. `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795`: the known MA-7 baseline failure.
2. `plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs:984`, `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift`. **This failure predates the TRD.** This test reads the live `.planning/ROADMAP.md` and the objective directories, and reports 5 `trd_summary_exists` drifts: `41-01`…`41-05` are `- [ ]` in ROADMAP.md (lines 351–355) while their SUMMARY.md files are committed. `git diff 0211298 -- .planning/ROADMAP.md .planning/objectives/41-retroactive-verification` was empty when I checked, before writing this SUMMARY. So the drift already existed at dispatch base `0211298`, and this TRD's code changes could not have caused it. The baseline count was most likely taken before the 41-01..05 SUMMARY commits landed. 41-07 has no ROADMAP line, so this SUMMARY adds no further drift. The fix belongs to the orchestrator / TRD 41-06: `df-tools roadmap update-job-progress 41`. This executor was told not to touch ROADMAP.md.

## Deviations from Plan

**1. [Rule 1 - Bug] Table parser scoped to the Profile Definitions section**
- **Found during:** Task 1
- **Issue:** The TRD's row regex `` /^\|\s*`([a-z-]+)`\s*\|/ `` also matches the "Tier → model id" table rows (`` `opus` ``, `` `sonnet` ``, `` `haiku` ``). Test 2 would then look for `agents/opus.md` and so on and report bogus mismatches.
- **Fix:** Parsing starts at `## Profile Definitions` and stops at the next `## ` heading. Row shape and cell handling are unchanged (first cell with backticks stripped, last non-empty cell as effort, '—'/'-' → null).
- **Files modified:** plugins/devflow/devflow/bin/lib/model-profiles.test.cjs
- **Commit:** eef1486

**2. [Out of scope - pre-existing] Second `npm test` failure (roadmap-reconcile E2E1)**
- See Validation Gate Results. This is planning-state drift from earlier objective-41 TRDs. It is not caused by this TRD, and fixing it would mean editing ROADMAP.md, which is outside this dispatch. It is left for 41-06 / the orchestrator.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - planner `effort: xhigh` and ui-evaluator `effort: high` match model-profiles.md lines 11 and 23
  - parity + missing-row test present and GREEN
  - RED observed on HEAD naming planner and ui-evaluator (quoted above)
  - no `` `df-<key>` `` in agents/skills/workflows, enforced by test
  - haiku-no-effort rule still passes
  - CHANGELOG: one `### Fixed` bullet under [Unreleased]; released sections untouched; no version bump
- Gate failures: `npm test` fail count 2 vs baseline 1. The extra failure is pre-existing ROADMAP drift, not a regression from this TRD.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/model-profiles.test.cjs (TRD 41-07 describe block)
- FOUND: plugins/devflow/agents/planner.md (`effort: xhigh`, line 4)
- FOUND: plugins/devflow/agents/ui-evaluator.md (`effort: high`, line 4)
- FOUND: commit eef1486 test(41-07): … (RED)
- FOUND: commit 3d8e25f fix(41-07): …
