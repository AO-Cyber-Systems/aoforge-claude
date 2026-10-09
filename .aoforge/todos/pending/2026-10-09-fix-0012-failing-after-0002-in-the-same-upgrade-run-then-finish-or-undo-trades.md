---
title: fix 0012 failing after 0002 in the same upgrade run, then redo trades
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.cjs]
---

## Problem

TRD 72-25: `aof-tools upgrade --apply --path ~/dev/trades` applied 0001, 0002, 0004, 0005, 0007 and 0008, then failed:

```
0012: git mv .planning .aoforge failed: fatal: bad source, source=.planning/objectives/055-post-deploy-refresh-rotation-grace/055-JOB.md, destination=.aoforge/objectives/055-post-deploy-refresh-rotation-grace/055-JOB.md
```

0002 renames `NN-JOB.md` to `NN-TRD.md` with `fs.renameSync` (`0002-job-to-trd.cjs:118`) and stages nothing, so the index still lists the JOB.md paths. 0012 then runs `git mv -- .planning .aoforge` (`0012-planning-dir-move.cjs:260`), which refuses a tracked source missing from disk. The runner stops: 0014 never runs and nothing is stamped. Every earlier migration's change is left uncommitted. Any repository with 0002 and 0012 both pending hits this.

**recycling-oracle will hit the same failure through the SessionStart hook** once its tree is clean. It has 0001, 0002, 0008 and 0012 pending (72-25 preview) and was skipped only because 202 tracked files are dirty. `upgrade-project.js` defers 0012 while the tree is dirty. But the first Claude session opened there after the tree is committed or stashed runs the auto migrations: 0002 renames its JOB.md files, then 0012's `git mv` fails, and the session leaves the same half-applied, uncommitted state. Until the fix ships, open sessions there with `AOFORGE_SKIP_UPGRADE=1`, or upgrade it by hand in two steps (see step 3).

trades was **undone on 2026-10-09** with the user's approval ("Undo it (Recommended)"):
- the two 0008 removals were unstaged (`.planning/.awareness-cache.json`, `.planning/.progress-guard.json`);
- five tracked paths (`.gitignore`, `.planning/STATE.md`, `CLAUDE.md` and those two runtime files) and the three `055/057/058-*-JOB.md` files were restored from HEAD;
- exactly the 19 files the failed apply created were deleted. They were checked against the apply report first: `.planning/config.json` (0001; not in HEAD), three `*-TRD.md` (0002; byte-identical to HEAD's JOB.md blobs) and fifteen `OBJECTIVE.md` (0004).

Result: `git status --porcelain` is empty, HEAD is 30c2c5b1, and nothing else was touched. The backup `~/.claude/aoforge/backups/trades-2a5e5779/` (two snapshots) is kept. trades is still on `.planning/` with 0001, 0002, 0004, 0005, 0007, 0008, 0012 and 0014 pending.

## Solution

1. Fix: in 0012, stage the legacy directory's own working-tree changes before the move (`git add -A -- .planning`, limited to paths the run changed), or have 0002 use `git mv` when the source is tracked. Add a runner test with 0002 and 0012 both pending.
2. **Redo trades after the fix ships** (and after re-syncing the runtime), with a fresh per-repository approval: re-check (main, 30c2c5b1, clean), `aof-tools upgrade --apply --path ~/dev/trades`, then `aof-tools --cwd ~/dev/trades commit "chore: move to AOForge (3.0.0 upgrade)" --files <changed_files>`. Mind the untracked-file sweep todo (trades had no untracked files on 2026-10-09).
3. Workaround if trades or recycling-oracle cannot wait for the fix: run the migrations before 0012 (`upgrade --apply --only 0001,0002,...`), commit them, then run `upgrade --apply` so 0012 meets a clean index. This needs its own approval.
