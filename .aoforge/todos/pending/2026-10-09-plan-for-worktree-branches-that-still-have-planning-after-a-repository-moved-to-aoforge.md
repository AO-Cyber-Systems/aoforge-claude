---
title: plan for worktree branches that still have .planning/ after a repository moved to .aoforge/
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, docs/MIGRATING-TO-AOFORGE.md]
---

## Problem

0012 runs in one checkout and commits the rename on that branch. Every other branch, including those in linked worktrees, keeps `.planning/`. Linked worktree counts in the 72-25 preview: aodex 127, opsCluster 68, eden-biz 32, aoid 24, aocore 22, eden-circle 18, recycling-oracle 13, devflowops 10.

When such a branch merges with one that already has `.aoforge/`, git's directory-rename detection decides where files the branch added under `.planning/` go. Its default (`merge.directoryRenames=conflict`) reports a conflict for every such file. Edits to files that existed before the rename follow the rename. Separately, a worktree's own SessionStart upgrade moves its `.planning/` on its branch, so two branches can both carry the rename commit. That merges cleanly but doubles the history.

## Solution

1. Reproduce in a scratch repository: rename on main, add a TRD under `.planning/` on a branch, merge both ways, and record exactly what git does with default and `true` `merge.directoryRenames`.
2. Document the outcome in `docs/MIGRATING-TO-AOFORGE.md` (which order to merge in, whether to set `merge.directoryRenames=true` for the transition, how to finish a conflicted merge).
3. Consider an `aof-tools` helper or doctor finding that lists a repository's branches/worktrees still carrying `.planning/` after the main checkout moved.
