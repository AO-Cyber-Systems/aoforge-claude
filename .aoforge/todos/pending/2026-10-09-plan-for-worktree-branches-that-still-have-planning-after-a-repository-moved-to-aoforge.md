---
title: plan for worktree branches that still have .planning/ after a repository moved to .aoforge/
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, docs/MIGRATING-TO-AOFORGE.md]
disposition: re-scoped
disposition_reason: "It needs a scratch-repository experiment, a documented merge order and possibly a doctor helper, none of which fits a todo sweep."
disposition_target: "The same upgrade-hardening objective, not yet planned, done before the shim removal in the release after 3.0.0."
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
---

## Problem

0012 runs in one checkout and commits the rename on that branch. Every other branch, including those in linked worktrees, keeps `.planning/`. Linked worktree counts in the 72-25 preview: aodex 127, opsCluster 68, eden-biz 32, aoid 24, aocore 22, eden-circle 18, recycling-oracle 13, devflowops 10.

When such a branch merges with one that already has `.aoforge/`, git's directory-rename detection decides where files the branch added under `.planning/` go. Its default (`merge.directoryRenames=conflict`) reports a conflict for every such file. Edits to files that existed before the rename follow the rename. Separately, a worktree's own SessionStart upgrade moves its `.planning/` on its branch, so two branches can both carry the rename commit. That merges cleanly but doubles the history.

## Solution

1. Reproduce in a scratch repository: rename on main, add a TRD under `.planning/` on a branch, merge both ways, and record exactly what git does with default and `true` `merge.directoryRenames`.
2. Document the outcome in `docs/MIGRATING-TO-AOFORGE.md` (which order to merge in, whether to set `merge.directoryRenames=true` for the transition, how to finish a conflicted merge).
3. Consider an `aof-tools` helper or doctor finding that lists a repository's branches/worktrees still carrying `.planning/` after the main checkout moved.

## Disposition (objective 75, 2026-10-10)

Re-scoped by the objective 75 todo sweep (TRD 75-04), not completed. Reason and target are in the frontmatter above; the detail follows.

- **Nothing done here.** The three steps are an experiment (a scratch repository: rename on main, add a TRD under `.planning/` on a branch, merge both ways, record what git does with the default `merge.directoryRenames=conflict` and with `true`), documentation (`docs/MIGRATING-TO-AOFORGE.md`: merge order, whether to set `merge.directoryRenames=true` for the transition, how to finish a conflicted merge) and possibly an `aof-tools` helper or doctor finding that lists branches and worktrees still carrying `.planning/`. Each is small, but together they are a planned piece of work with a verification of its own.
- **Exposure.** Linked-worktree counts from the 72-25 preview: aodex 127, opsCluster 68, eden-biz 32, aoid 24, aocore 22, eden-circle 18, recycling-oracle 13, devflowops 10. A branch that adds files under `.planning/` conflicts on merge with one that already moved to `.aoforge/`, and two worktrees can each carry the rename commit.
- **Target.** An upgrade-hardening objective in the next milestone, with the other two upgrade todos; the migration guide update is the cheapest first step and does not depend on the helper.
