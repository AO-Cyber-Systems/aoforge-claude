---
objective: 48-planning-write-path-migration
trd: "23"
subsystem: planning-verbs
tags: [sc1, sc4, d-01, d-10, d-21, gwp-01, gwp-02, gwp-03, gwp-04, gwp-05, docs, tdd]

requires:
  - objective: 48-16
    provides: "plan group at zero"
  - objective: 48-17
    provides: "execute group at zero; SUMMARY verbs write the main checkout"
  - objective: 48-18
    provides: "verify group at zero"
  - objective: 48-19
    provides: "bootstrap group at zero"
  - objective: 48-20
    provides: "work group at zero; todo complete -> todos/completed/"
  - objective: 48-21
    provides: "misc group at zero"
  - objective: 48-22
    provides: "SC3 end-to-end + store-off parity"
provides:
  - "planning-writes.repo.test.cjs: SC1 asserts zero planning-write findings outright and that __fixtures__/planning-writes-baseline/ does not exist"
  - "CLAUDE.md Planning verbs bullet + store-mode edit-gate line; CHANGELOG Unreleased entry for objective 48; USER-GUIDE 'The planning write path (objective 48)'; proposal status + objective 48 refinements"
affects: []

tech-stack:
  added: []
  patterns:
    - "Ratchet retirement: RED asserts the baseline dir is absent while it still exists, GREEN deletes it"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-audit.cjs
    - CLAUDE.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-github-system-of-record.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json

key-decisions:
  - "SC1 is now a plain zero rule (checkZero): every finding listed file:line, sorted; no baseline, and the baseline directory's presence is itself a failure"
  - "The scanner was not widened (48-04 verb-form gap). A wider scanner would surface new findings whose fix is prose edits, which this TRD forbids; recorded as deferred"
  - "CLAUDE.md prose avoids `df-tools <word>` and backticked bare words that dispatch-completeness reads as commands"

metrics:
  duration: ~45m
  completed: 2026-10-01
  tasks: 3
  files: 13
---

# Objective 48 TRD 23: Ratchet to zero, documentation, full suite (SC1 final, SC4) Summary

**The SC1 audit no longer has a ratchet. `planning-writes.repo.test.cjs` asserts zero direct planning-write instructions across skills, non-legacy workflows, agents and templates, and fails if `__fixtures__/planning-writes-baseline/` exists. The six `_comment`-only baselines are deleted. CLAUDE.md, CHANGELOG (Unreleased), USER-GUIDE and the proposal now document the planning verbs, store mode, the store-mode gate deny, W055/W056, migration 0010, `planning import` and the U-1 tracked set. Store off is described as the default and unchanged. `npm test`: 7463 tests, 7430 pass, 32 skipped, 1 fail. The failure is MA-7, the known handoff flake, and it fails the same way at WAVE_BASE.**

## Ratchet totals

| Group | Owner TRD | Findings at 48-04 | Now |
|---|---|---|---|
| plan | 48-16 | 27 | 0 |
| execute | 48-17 | 34 | 0 |
| verify | 48-18 | 15 (159 minus the other five) | 0 |
| bootstrap | 48-19 | 42 | 0 |
| work | 48-20 | 14 | 0 |
| misc | 48-21 | 27 | 0 |
| **Total** | | **159** | **0** (no baseline files remain) |

Precondition held: all six baseline files held only `_comment` at WAVE_BASE.

## What changed

- **Task 1 (SC1 to zero).** The repo test drops `OWNER`, `baselineComment`, `measuredBaselines`, `loadBaselineFiles` and `checkRatchet`. It now has `checkZero` + `formatZeroFailure`, and these tests:
  - GATE: zero findings on the real repo.
  - The injected-line test names `file:line`.
  - Test 9: every finding is listed, sorted.
  - Test 10: the baseline dir must not exist.
  - Test 13: planner.md has zero findings, and an injected `Create the TRD file …` line yields exactly one.

  EXEMPT, inline-marker, 48-15 verbs-exist and GROUP-table checks are kept. The stale "ratchets the counts" comment in `planning-audit.cjs` was corrected.
- **Task 2 (docs).**
  - CLAUDE.md: one "Planning verbs (Unreleased)" bullet in the df-tools list, and one sentence on the gate-edits bullet. The agent count is corrected 12 → 13 in two places, and the resident-size note is updated.
  - CHANGELOG `## [Unreleased]`: objective 48 lines under Added, Changed and Fixed, with no second heading. The D-10 plugin-version note (doctor check 11) is under Changed, and the `todos/done` → `todo complete` (`todos/completed/`) fix is under Fixed.
  - USER-GUIDE: the Store mode intro is updated, and a new "The planning write path (objective 48)" subsection covers:
    - store off;
    - turning it on: config, `gh pull --all`, `planning import`, `gh outbox flush`, `upgrade --apply --only 0010 --confirm`;
    - what git tracks;
    - a verb table;
    - the worktree→main SUMMARY note (48-17);
    - the gate message;
    - W055/W056;
    - the D-10 note.
  - Proposal: the status paragraph says objective 48 is implemented. A new "Planning refinements (objective 48)" list covers U-1, U-1/U-3 entity issues, D-05, research pages, U-2 and D-12. The Decisions table is unchanged.
- **Task 3 (full suite).** One Rule-1 fix was needed (below). `planning mode` → `local`. `validate health --raw` shows no W055/W056.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE.md bullet tripped dispatch-completeness test 5**
- **Found during:** Task 3 (first `npm test`)
- **Issue:** The whole-file scan read "a df-tools verb" as a command `verb`. The Core Tool parse read the backticked "`local`|`store`" as commands `local` and `store`. None of the three is a COMMANDS key.
- **Fix:** Reworded to "goes through one verb" and "(prints local or store)". The test was not changed.
- **Files modified:** CLAUDE.md
- **Commit:** 6b26d4ba

**2. [Rule 1 - Docs accuracy] CLAUDE.md agent count**
- **Found during:** Task 2. `plugins/devflow/agents/` holds 13 agents (ui-evaluator was added), but CLAUDE.md said 12. Corrected in both places, as the must-have requires ("skill/agent counts stay accurate"). Skills: 34, already correct.
- **Commit:** 574be92e

**3. [Process] Preflight claim on the main checkout.** The first `exec-context check` ran with the harness-reset cwd (the main checkout) and recorded a 48-23 claim there. I released it immediately with `exec-context release --repo … --id 48-23` and re-ran the check with `--cwd <worktree>`. That run passed with `checkout` = the worktree and `is_worktree: true`. Nothing was written in the main checkout.

**4. [Scope] planning-audit.cjs comment.** A one-line comment fix, outside the TRD's file list, committed with the GREEN step (d0e62d18).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test …/planning-writes.repo.test.cjs` (baselines present) | 1 (test 10 only) | FAIL (correct) |
| 1 GREEN | `node --test …/planning-writes.repo.test.cjs …/planning-audit.test.cjs` + baseline dir absent | 0 (27/27) | PASS |
| 2 | `node --test …/doc-refs.repo.test.cjs`; `rg '^## \[Unreleased\]\|plan put-trd' CHANGELOG.md` (3 hits, one heading) | 0 | PASS |
| 3 | `npm test` | 1: MA-7 only, which also fails at WAVE_BASE | PASS with known pre-existing failure |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 1 ("baseline files must be deleted … holding bootstrap.json, execute.json, misc.json, plan.json, verify.json, work.json") | FAIL (correct) |
| GREEN | same + `planning-audit.test.cjs` after `git rm -r` of the baseline dir | 0 | PASS (correct) |
| REFACTOR | none needed | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| regression | `node --test …/doc-refs.repo.test.cjs …/planning-writes.repo.test.cjs` | 0 (24/24) | PASS |
| regression | `node --test …/dispatch-completeness.test.cjs` (after fix) | 0 (7/7) | PASS |
| test | `npm test` | 1 | 7463 tests / 7430 pass / 32 skipped / 1 fail (MA-7), ~82 s |

**The MA-7 failure is pre-existing.** `node --test --test-name-pattern MA-7 plugins/devflow/devflow/bin/handoff-e2e.test.cjs` fails the same way (`got: {"status":"done","exit_code":0,"stderr":""}`) in the main checkout at WAVE_BASE 5ad76d9e. It is not touched here (known flaky, per dispatch).

**Other checks:**
- `df-tools planning mode` → `local`.
- `df-tools validate health --raw` (this repo) shows no W055 or W056. The other findings are environmental and predate this TRD: E020 mirror-stale (`~/.claude/devflow` 2.10.1), W021, W040, plus the existing W001/W005/I001.
- `git diff --stat 5ad76d9e -- package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` is empty, so no version bump.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 6/6. SC1 is final. The CLAUDE.md, CHANGELOG, USER-GUIDE and proposal content is as specified. SC4 is green apart from the pre-existing MA-7.
- Gate failures: none caused by this TRD.

## Deferred Issues (carried forward, out of scope here)

- **48-04: the scanner only matches the listed verb forms.** "writing", "created", "updated" and similar are not caught. "Zero" therefore means zero under today's regexes. Widening would surface new findings that need prose edits, and this TRD forbids prose edits. Any widening must also accept `df-tools.cjs --cwd X doc put` (48-19, adopt.md).
- **48-16: stale-draft hazard.** `planning draft` never refreshes an existing draft. Suggested fix: `planning draft --fresh`.
- **48-06:** `gh outbox status` does not show the Debug/Quick optional-type advisories (gh-capability `advisoriesOf`/`describeAdvisories`).
- **48-20:** `micro.cjs` appends the STATE row in store mode, and debugger.md's archive step tells the agent to run a raw `git commit`, which the gate blocks.
- **48-10:** `upgrade --apply --only 0010 --confirm` runs every applicable confirm migration (`upgrade.cjs` selects `named || confirm`). This is now documented in USER-GUIDE: `--only 0010` alone runs just 0010. Legacy `NN-MM-TRD-<slug>.md` names block 0010, and `planning import` keeps them `kept_local`.
- **Environment:** the MA-7 handoff-e2e failure (pre-existing), and the stale `~/.claude/devflow` mirror (E020).

## Self-Check: PASSED

- Baseline dir absent: `plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline` does not exist. Confirmed with `ls __fixtures__/` and test 10.
- Commits present on `df/exec-48-23`: 9269d21b, d0e62d18, 574be92e, 6b26d4ba (`git log --oneline 5ad76d9e..HEAD`).
- Docs present: CLAUDE.md "Planning verbs" bullet; CHANGELOG has a single `## [Unreleased]` heading with objective 48 entries; USER-GUIDE has "The planning write path (objective 48)"; the proposal has "Planning refinements (objective 48)".
