---
title: fix 0012 failing after 0002 in the same upgrade run, then finish or undo trades
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.cjs]
---

## Problem

TRD 72-25: `aof-tools upgrade --apply --path ~/dev/trades` applied 0001, 0002, 0004, 0005, 0007 and 0008, then failed:

```
0012: git mv .planning .aoforge failed: fatal: bad source, source=.planning/objectives/055-post-deploy-refresh-rotation-grace/055-JOB.md, destination=.aoforge/objectives/055-post-deploy-refresh-rotation-grace/055-JOB.md
```

0002 renames `NN-JOB.md` to `NN-TRD.md` with `fs.renameSync` (`0002-job-to-trd.cjs:118`) and stages nothing, so the index still lists the JOB.md paths. 0012 then runs `git mv -- .planning .aoforge` (`0012-planning-dir-move.cjs:260`), which refuses a tracked source missing from disk. The runner stops: 0014 never runs and nothing is stamped. Every earlier migration's change is left uncommitted. Any repository with 0002 and 0012 both pending hits this, including through the SessionStart hook: recycling-oracle is the other one in the fleet.

trades was left exactly as the failed apply left it (HEAD 30c2c5b1, not committed, nothing reverted):
- tracked edits: `.gitignore`, `.planning/STATE.md`, `CLAUDE.md`
- staged removals (0008): `.planning/.awareness-cache.json`, `.planning/.progress-guard.json`
- unstaged deletions (0002): `055/057/058-*-JOB.md`
- 19 new untracked files: `.planning/config.json`, three `*-TRD.md`, fifteen `OBJECTIVE.md`

The tree was clean (0 tracked, 0 untracked) before the apply, so every entry is the upgrade's. The backup is `~/.claude/aoforge/backups/trades-2a5e5779/`.

## Solution

1. Fix: in 0012, stage the legacy directory's own working-tree changes before the move (`git add -A -- .planning`, limited to paths the run changed), or have 0002 use `git mv` when the source is tracked. Add a runner test with 0002 and 0012 both pending.
2. trades, with the user's approval, either:
   - finish: commit the partial state (`aof-tools --cwd ~/dev/trades commit "chore: AOForge upgrade, pre-move migrations" --files .gitignore .planning CLAUDE.md`), then `aof-tools upgrade --apply --path ~/dev/trades` (0012 and 0014 now run on a clean tree) and commit its changed files; or
   - undo: unstage the two removals, restore the five tracked paths and the three JOB.md files from HEAD, and delete the 19 new files, which returns trades to 30c2c5b1 with a clean tree.
