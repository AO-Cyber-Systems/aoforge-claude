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
