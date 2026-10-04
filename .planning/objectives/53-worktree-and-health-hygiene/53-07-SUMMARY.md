---
objective: 53-worktree-and-health-hygiene
trd: "07"
subsystem: docs
tags: [changelog, user-guide, claude-md, full-suite, item-53-6]

requires:
  - objective: 53-worktree-and-health-hygiene
    provides: "53-01..53-06 SUMMARYs: the changes this TRD documents"
provides:
  - "CHANGELOG [Unreleased] entries for every objective-53 change"
  - "USER-GUIDE: summary-verb rule, micro store-mode refusal, doctor check 33 and the decision repair text, template v3, trimmed Known issues"
  - "CLAUDE.md: planning-verbs and Doctor bullets, Where we left off, Next"
  - "Item 53-6 closed with evidence; npm test and validate health snapshots"
affects: [release of 42-53]

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md

key-decisions:
  - "A new `### Removed` subheading carries the AWARENESS_CACHE_REL removal; Keep-a-Changelog has it and Unreleased had none"
  - "Stale 53-affected sentences inside [Unreleased] (the 51 template-version note, the verbs-through-prose bullet, the 52 decision-answer fix-by-hand pointer) were corrected rather than left to contradict the new entries"

requirements-completed: ["53-1", "53-2", "53-3", "53-4", "53-5", "53-6", "53-7", "53-8"]

duration: 6min
completed: 2026-10-04
---

# Objective 53 TRD 07: Docs and the full suite for objective 53 Summary

**Objective 53 is recorded in the changelog, user guide and CLAUDE.md from what 53-01..53-06 actually shipped, item 53-6 is closed with evidence, and the full suite's only remaining failure is the known MA-7 (first run 9020 tests, 8985 pass, 3 fail; the two objective-53 failures fixed and re-verified).**

## Progress
- [x] Task 1: CHANGELOG, USER-GUIDE and CLAUDE.md for objective 53; item 53-6 closed with evidence — d952c8fa
- [x] Task 2: full npm test gate and final health snapshot — b042e8d4
- [x] Finalize: SUMMARY, state updates and docs commit — (this commit)

## What was done

- **CHANGELOG [Unreleased].** Fixed: worktree SUMMARY copies (53-1), named-TRD pairing across six readers (53-2), micro through `df-tools commit` (53-3), the wave-merge sequence and the `gate-commits` merge-and-commit refusal (53-4), PROJECT.md and the archived UI-VISUAL-EVAL dirs (53-7, repo only). Added: doctor check 33 `decision-resolution` (53-8). Changed: the explained `gate-commits` deny, global template v3 with `/devflow:doctor` (53-5). Removed (new subheading): the dead `AWARENESS_CACHE_REL` export (53-5). `changelog check Unreleased` passes.
- **USER-GUIDE.** The summary-verb paragraph now states the 53-01 rule (local mode writes the checkout that runs the verb, store mode writes the main checkout's cache) and the micro store-mode refusal with both remedies. The doctor row names check 33. A new paragraph, "Decisions answered before objective 52", holds the doctor repair text, with the hand fix kept only for what the check reports as unrecoverable. The global-upgrade paragraph says template v3 reaches existing blocks at the next global upgrade. Known issues lost the micro, mangled-decision and gh-sync routing-line items (all fixed by 53-03, 53-06, 53-05), kept the objective-1 orphan, and gained the merge-conflict follow-up below.
- **CLAUDE.md.** The planning-verbs sentence carries the 53-01 rule, the Doctor bullet names check 33, "Where we left off" describes objective 53 as done in one sentence, and "Next" dropped the micro raw-git item and gained the user actions (release 42-53 and re-sync the runtime; apply migration 0009 in this repo).

## Item 53-6: closed by 43-03

Commit 9f93abde (43-03, "must_haves parser follows the real indent; report string key_links (D11)") fixed the parser the item describes. `frontmatter.test.cjs` test `43-03 D11 #2: every objective-42 TRD yields a non-empty artifact list` pins every 42 TRD. Fresh evidence, `df-tools verify artifacts` on each of the 15 objective-42 TRDs:

| TRD | artifacts | passed | all_passed |
|---|---|---|---|
| 42-01 | 3 | 3 | true |
| 42-02 | 4 | 4 | true |
| 42-03 | 4 | 4 | true |
| 42-04 | 2 | 2 | true |
| 42-05 | 2 | 2 | true |
| 42-06 | 2 | 2 | true |
| 42-07 | 4 | 4 | true |
| 42-08 | 2 | 2 | true |
| 42-09 | 2 | 2 | true |
| 42-10 | 3 | 3 | true |
| 42-11 | 1 | 1 | true |
| 42-12 | 3 | 3 | true |
| 42-13 | 4 | 4 | true |
| 42-14 | 5 | 5 | true |
| 42-15 | 3 | 3 | true |

15 of 15 TRDs pass, 44 of 44 artifacts. 42's `key_links` are prose strings, which `verify key-links` reports as not machine-checkable rather than skipping. The audit's item is stale, and no code was written for it.

## Item 53-1 evidence: stray SUMMARY copies in a real run

Wave 1 ran the unfixed summary verbs in parallel worktrees. Exactly one stray untracked SUMMARY appeared in the main checkout: 53-06's, a 7-line early checkpoint written by `summary checkpoint` (not byte-identical to the committed final), which the orchestrator deleted before the merge. The other four executors wrote their SUMMARY with the Write tool and produced none. 53-01's own final `summary post` ran with the fixed verb from its worktree and left no main-checkout copy. Waves 2 and 3 ran sequentially in the main checkout, so a stray copy is impossible by construction, and none appeared. The worktree behaviour itself is pinned by `summary-worktree.test.cjs` (a real-git worktree, commit, `git merge --no-ff`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: docs, repo scanners | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs` | 0 (24 pass, 0 fail) | PASS |
| 1: stale phrases gone | `rg -n "commits with raw git\|even when run from a worktree\|even from a worktree\|reaches new and adopted blocks only" docs/USER-GUIDE.md CLAUDE.md` | 1 (no output, as required) | PASS |
| 1: changelog | `df-tools changelog check Unreleased` | 0 (`present: true`) | PASS |
| 1: item 53-6 | `df-tools verify artifacts` x15 | 0 each, 15/15 all_passed | PASS |
| 2: full suite | `npm test` | 1 (see below: 3 failures, 1 expected, 2 fixed) | PASS after fixes |
| 2: health | `df-tools validate health` | 0 | PASS |

## Full suite (`npm test`)

First run: tests 9020, suites 1453, pass 8985, fail 3, cancelled 0, skipped 32, 137s. The three failures, each classified:

| Test file | Test | Class | Resolution |
|---|---|---|---|
| `bin/handoff-e2e.test.cjs` | MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN | Known, environmental (a real `doctl` is installed, so the auth init exits 0) | Re-run alone (`--test-name-pattern MA-7`): fails identically. The only acceptable failure. |
| `bin/lib/dispatch-completeness.test.cjs` | 5: every extracted name is a dispatching COMMANDS key (`decision-resolution: not a COMMANDS key`) | Caused by objective 53 (my Task 1 CLAUDE.md edit): the test reads backticked words in Core Tool bullets as command names | Fixed in b042e8d4 by dropping the backticks around the check id. Re-run with doc-refs and planning-writes: 31 pass, 0 fail. |
| `bin/lib/roadmap-reconcile.test.cjs` | E2E1: reconcile dry-run against this repo ROADMAP shows zero drift | Caused by this TRD being in progress: its SUMMARY existed but the ROADMAP box for 53-07 was unticked | Fixed by `roadmap update-job-progress 53` (ticked the 53-07 box; objective 53 is 7/7 Complete). Re-run of `roadmap-reconcile.test.cjs`: 60 pass, 0 fail, E2E1 green. |

After the two fixes the suite's remaining failure is MA-7 alone. The full suite was run once, as the TRD asks; the two fixed tests were re-verified by running their own files, not by a second full run (the changes since the full run are one CLAUDE.md sentence and the ROADMAP tick).

## `validate health` snapshot

```
status: degraded
errors: []
warnings: W040 project-behind (stamped v2.12.0; 1 pending, 0 need confirmation: migration 0009, a user action)
info: I001 09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-TRD.md has no SUMMARY.md
```

No W001, no W005, no I001 for any objective-53 TRD. The one I001 is objective 09's real missing summary (it is not an objective-53 item).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE.md edit failed dispatch-completeness test 5**
- **Found during:** Task 2, the full `npm test`
- **Issue:** I named check 33 as a backticked `decision-resolution` inside the Doctor bullet. `dispatch-completeness.test.cjs` takes each backticked first word in a Core Tool bullet as a df-tools command, and `decision-resolution` is not one.
- **Fix:** removed the backticks ("33 (decision-resolution, which repairs ...)"). The guide and CHANGELOG keep the backticks; the test reads only CLAUDE.md and `context-discipline.md`.
- **Files modified:** CLAUDE.md
- **Commit:** b042e8d4

**2. [Rule 1 - Accuracy] Three stale sentences inside [Unreleased] corrected**
- **Issue:** the TRD named the USER-GUIDE and CLAUDE.md lines to change. Three CHANGELOG [Unreleased] sentences would have contradicted the new entries in the same release: the 51 note that the template version did not change, the "summary verbs write the main checkout even from a worktree" clause in the planning-verbs bullet, and the 52 decision-answer entry's "fix those by hand".
- **Fix:** each now states the 53 outcome and points at it. Entries describing released behaviour were not touched.
- **Files modified:** CHANGELOG.md
- **Commit:** d952c8fa

### Notes (not deviations)

- The TRD's "Removed" item has no existing subheading in [Unreleased], so a `### Removed` section was added after Deprecated.
- `df-tools` has no `roadmap reconcile` command; the changelog text names `sync-roadmap`, which is what `roadmap-reconcile.cjs` implements.

## Follow-ups (not done, outside this TRD)

1. **Wave merges also conflict on `STATE_ARCHIVE.md` and `state.json`.** 53-04's documented planning-file conflict path covers STATE.md, ROADMAP.md and REQUIREMENTS.md only. Parallel executors also write `.planning/STATE_ARCHIVE.md` (`state record-metric`, `add-decision`) and `.planning/state.json` (`state update-progress`), and both conflicted in this run's wave-1 merges; `state.json` needed a JSON-aware merge of the `decisions` array. Under the documented rule those conflicts take the abort path. Recorded in USER-GUIDE Known issues and in CLAUDE.md "Next". Extending the list needs a JSON-aware merge step, which is a code and prose change for a later TRD.
2. **`find-objective` does not reach archived objectives** (from 53-05): `cmdFindObjective` scans only `.planning/objectives/`. `findObjectiveInternal` does reach them. Not changed.
3. **micro's `commit_docs: false` warning wording** (from 53-03): it says "STATE.md commit failed" for what is a deliberate skip.
4. **User actions, per OBJECTIVE.md:** release 42-53 and re-sync the runtime; apply migration 0009 in this repo (the W040 above); run the live store-mode smoke on a throwaway repository.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (objective) | `npm test` | 1 (first run: 3 failures; MA-7 is the only one left after two fixes) | PASS apart from the known MA-7 |
| docs scanners | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs dispatch-completeness.test.cjs` | 0 (31 pass) | PASS |
| roadmap drift | `node --test roadmap-reconcile.test.cjs` | 0 (60 pass) | PASS |
| changelog | `df-tools changelog check Unreleased` | 0 | PASS |
| health | `df-tools validate health` | 0 | PASS |

## Discovered commands

None. The stack profile is `general`; the test commands came from the TRD and `.planning/STACK.md`.

## Post-TRD Verification

- Auto-fix cycles used: 1 (dispatch-completeness, deviation 1)
- Must-haves verified: 6/6 (CHANGELOG entries; Known issues trimmed; summary-verb rule in USER-GUIDE and CLAUDE.md; Where we left off and Next; item 53-6 evidence; `npm test` apart from MA-7)
- Gate failures: MA-7 only (known, environmental, reproduced in isolation)

## Self-Check: PASSED

- FOUND: CHANGELOG.md, docs/USER-GUIDE.md and CLAUDE.md modified, with `### Removed`, check 33 and the template v3 entries
- FOUND: no "commits with raw git", "even when run from a worktree", "even from a worktree" or "reaches new and adopted blocks only" in docs/USER-GUIDE.md or CLAUDE.md
- FOUND commits: d952c8fa (docs), b042e8d4 (fix)
