completed: 2026-10-10
---
title: make roadmap reconcile treat a checkpoint SUMMARY (no Self-Check) as incomplete
area: roadmap
files: [plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs, plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs]
---

## Problem

TRD 72-26 pushed `feat/stack-profile-loader` at abc18a9f between its push gate and its PR gate. At that commit,
`.aoforge/objectives/72-install-and-naming-cleanup/72-26-SUMMARY.md` exists only as a `summary checkpoint`: it has
`## Progress` and no `## Self-Check`. ROADMAP.md still lists 72-26 as `- [ ]`. `npm test` then fails the repository
self-test:

```
roadmap-reconcile.test.cjs:1029  E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift
kind: trd_summary_exists, trd_id: 72-26, before "- [ ] 72-26-...", after "- [x] 72-26-..."
```

`roadmap-reconcile.cjs` (around line 482) marks a TRD `[x]` whenever a SUMMARY exists and `_checkSummaryFailed` is
false. `_checkSummaryFailed` returns false when there is no Self-Check section (line 147, "assume not failed"). The
header comment (line 431) says "SUMMARY.md present + PASSED", but the code only checks for FAILED. The executor
contract says the opposite: a SUMMARY with no `## Self-Check` is a checkpoint, not a complete TRD. Because per-task
`summary checkpoint` writes the SUMMARY in local mode, any commit in the middle of a TRD trips E2E1 (and a reconcile
`--apply` would tick an unfinished TRD). The PR's Unit suite fails the same way while a pushed head sits mid-TRD.

## Solution

1. In reconcile, treat a SUMMARY with no Self-Check verdict as in progress: leave the checkbox alone and emit no
   `trd_summary_exists` change. Only `PASSED` ticks it, and `FAILED` keeps today's rule.
2. Check `roadmap.cjs:427` (`update-job-progress` and other consumers of the change kinds) and the other SUMMARY
   counters (`state advance-job`, progress) for the same assumption.
3. Tests: a checkpoint SUMMARY (only `## Progress`) produces no drift; a PASSED SUMMARY still ticks; a FAILED one is
   still annotated.
4. Re-run `node --test --test-name-pattern E2E1 plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs` on a
   mid-TRD commit.

## Resolution (objective 75, 2026-10-10)

Fixed by TRD 75-03 (`.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-03-SUMMARY.md`, `## Self-Check: PASSED`).

- Commits: fixtures `8092b23c`, RED `ed1ef0f4` (6 progress-checkpoint tests failed, all guard cases passed), GREEN `73144415` (`_summaryNotComplete` also returns true for a SUMMARY with an unticked `## Progress` task and no `## Self-Check`). `git log --oneline --no-walk` lists all three.
- This builds on objective 74's status rule, which already excluded `status: deferred` and `status: checkpoint` SUMMARYs from completion in reconcile, the roadmap counts and `state advance-job` / `update-progress`: commits `2586fbc4`, `8bcf11cc`, `fea136f9`.
- Solution steps: (1) reconcile leaves the checkbox alone for a checkpoint SUMMARY; (2) `roadmap.cjs`, `objective.cjs` and `state.cjs` consumers read the same predicate, so `update-job-progress`, `objective complete` and `state advance-job` agree (tests NC-P1 to NC-P10, two `completedSummaryFiles` tests, one `objective complete` Jobs-count test, test 7c); (3) tests cover a checkpoint SUMMARY with no drift, a PASSED SUMMARY still ticking, and a FAILED one still annotated; (4) E2E1 was re-run on a mid-TRD tree.
- Regression proof in 75-03: `roadmap analyze --raw` identical before and after the fix (11 objectives, `total_jobs` 93, `total_summaries` 87); a scan of 577 SUMMARYs under `.aoforge/` finds only `74-06-SUMMARY.md` (`status: deferred`) and 75-03's own in-progress checkpoint as not complete; the full suite ran 12,569 tests with 0 failures.
- Re-run in TRD 75-04 on the current tree: `node --test --test-name-pattern=E2E1 plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs` printed `✔ E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift`, `pass 1`, `fail 0`.

The installed 3.0.0 runtime does not carry this fix until the next release, so the repository copy of aof-tools is still the one to use for those commands (CLAUDE.md). That is a release matter, not an open part of this todo.
