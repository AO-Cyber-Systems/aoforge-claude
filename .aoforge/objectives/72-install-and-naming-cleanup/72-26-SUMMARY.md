---
objective: 72-install-and-naming-cleanup
trd: "26"
subsystem: install
tags: [install, checkout-move, rekey, approval-gates]
requirements: [INST-06]
requires:
  - objective: 72
    provides: "72-07: aof-tools state rekey; 72-25: fleet sweep done"
provides:
  - "Checkout at /Users/justin/dev/aoforge-claude (moved by the user), origin https://github.com/AO-Cyber-Systems/aoforge-claude.git"
  - "Claude memory (10 files incl. MEMORY.md) copied to ~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/; old copy kept"
  - "Repo-keyed AOForge state copied devflow-claude-d3dccfe9 -> aoforge-claude-df646fc2 (estimate history 8, backups 5276, drafts 14); old key kept"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions: []
requirements-completed: []
metrics:
  started: 2026-10-09T15:51:54Z
---

# Objective 72 TRD 26: Checkout move and rekey Summary

## Progress
- [x] Task 1: Approval gate: move the checkout to ~/dev/aoforge-claude and restart there — e2782c2a
- [x] Task 2: Carry the path-keyed state over and check the new location — (this commit)
- [ ] Task 3: Approval gates (push, then PR) — next step: Gate 1 is presented to the user; on `approved` run `git -C /Users/justin/dev/aoforge-claude push origin feat/stack-profile-loader`, confirm `git rev-parse origin/feat/stack-profile-loader` equals the local head, then draft the PR body in the scratchpad and present Gate 2

## Task 1: move (already done)

The user moved the checkout and restarted Claude Code in the new location before this run. There was no reply to
record in this session, because the move happened before it; the orchestrator re-spawned this TRD in the new session.

| Check | Command | Result |
|---|---|---|
| cwd | `pwd -P` | `/Users/justin/dev/aoforge-claude` |
| old path gone | `ls -d /Users/justin/dev/devflow-claude` | exit 1, No such file or directory |
| remote | `git remote -v` | `origin https://github.com/AO-Cyber-Systems/aoforge-claude.git` (fetch and push) |
| worktrees | `git worktree list --porcelain` | one entry, the main checkout at 4b1bc2d3 on feat/stack-profile-loader |
| prunable | `git worktree prune --dry-run --verbose` | nothing to prune |
| merge driver | `aof-tools merge-driver install --check` | installed, attributes_ok, driver_ok; the driver calls `/Users/justin/.claude/aoforge/bin/aof-tools.cjs`, which exists (no repair needed) |
| tree | `git status --porcelain` | clean |
| preflight | `exec-context check --repo /Users/justin/dev/aoforge-claude --base 4b1bc2d3` | ok, base visible, not a worktree |

Run state under the old key (`~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json`): objective `72`,
`started_at` `2026-10-08T22:24:56.615Z`, 18 waves. 72-01 recorded `run_state: unscored (accepted: unscored)`, so this
objective takes the unscored path for EST-11.

## Task 2: keyed state carried over

Git and the merge driver:

- `git worktree repair`: no output (nothing to repair). `git worktree list` after it: the main checkout only. No
  prunable entries, so nothing was pruned.
- `git remote get-url origin`: `https://github.com/AO-Cyber-Systems/aoforge-claude.git`.
- `aof-tools merge-driver install`: `installed: true, changed: false`; `--check`: `attributes_ok`, `driver_ok`. The
  driver points at `/Users/justin/.claude/aoforge/bin/aof-tools.cjs`, a path that does not depend on the checkout.

Claude memory: `cp -Rn ~/.claude/projects/-Users-justin-dev-devflow-claude/memory/ ~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/`.
The new-key directory existed but was empty, so all 10 files were copied and none conflicted: MEMORY.md,
feedback_dftools_objective_ops.md, feedback_no_rails.md, project_context_budget.md, project_gate_false_positives.md,
project_gemma4_orchestrator.md, project_model_tier_findings.md, project_opencode_harness_fit.md,
project_store_live_smoke.md, user_stack.md. `diff -r` of the two directories prints nothing. The old directory is kept.

AOForge runtime state: `aof-tools state rekey --from /Users/justin/dev/devflow-claude --to /Users/justin/dev/aoforge-claude`
(dry run first, then applied; key `devflow-claude-d3dccfe9` -> `aoforge-claude-df646fc2`):

| Store | Action | Result |
|---|---|---|
| estimate-run | skip | The new key already had a run state: the new session's orchestrator wrote it at wave start (objective 72, `started_at` 2026-10-09T15:51:08.860Z, wave 18 only). Not overwritten. The old file (`started_at` 2026-10-08T22:24:56.615Z, 18 waves) is kept under the old key. |
| estimate-history | copy | 8 copied, 0 kept (objectives 63, 65-71) |
| awareness | skip | The new key already had a cache written by the new session's SessionStart hook. It is a regenerated cache, so nothing is lost |
| backups | copy | 5276 copied, 0 kept (85M old, 86M new) |
| drafts | merge | 14 copied, 0 kept; this TRD's own draft was untouched |
| hook markers, outbox | none | no old-key entries exist |
| backup registry | none | `.registry.json` holds only a stale adopttest entry, no entry for either checkout path |

EST-11: no run state (unscored). 72-01 recorded `run_state: unscored (accepted: unscored)`, so there was no scored run
state to carry. The run state under the new key holds the new session's start time, not 72-01's. That does not matter
on the unscored path, and the original is still readable under the old key. `estimate objective 72 --line --raw` works
from the new path: "Objective 72 estimate: 14 min median (P90 34 min) wall · $1.97 (P90 $7.27) · 1 TRD left in 1
wave · confidence medium".

Final checks in the new checkout:

| Check | Result | Expected? |
|---|---|---|
| `validate health --raw` | degraded: 0 errors, 3 x W006 (objectives 73, 74, 75 are in ROADMAP.md with no directory yet). No W066/W067, no path or key errors | yes: those objectives are not planned yet |
| `doctor --json` (project + global) | 14 ok, 5 warn, 0 error | see below |
| doctor `legacy-plugin-runtime` | warn: the old runtime home `~/.claude/devflow` is left over (state already migrated); the pre-rename plugin 2.15.0 is installed but disabled | yes: moving it is the user's own call (`doctor --global --fix`) |
| doctor `legacy-runtime-state` | warn: `.aoforge/.awareness-cache.json` and `.aoforge/.progress-guard.json` are present on disk; untracked and ignored; nothing reads them | yes: leftovers that 0012 moved with the planning directory. Not touched here |
| doctor `validate-health` | warn: the same 3 x W006 | yes |
| doctor `awareness-state` | warn: `devflow-claude-d3dccfe9.json` is orphaned (its checkout path is gone) | yes: this TRD keeps old copies |
| doctor `backups` | warn: 635.7 MiB across 23 repos, over the 500 MiB threshold; none past retention | yes: the rekey copied the 85M old-key backups, so they exist twice until the old key is pruned |
| doctor `legacy-planning-layout`, `pending-migrations`, `runtime-mirror` | ok: `.aoforge/` and the `aoforge` config key; up to date at 3.0.0; mirror digest equals the installed plugin | yes |
| `state load --raw` | config, roadmap and state all exist (`model_profile=balanced`, `commit_docs=true`) | yes |
| `ls ~/.claude/skills ~/.claude/agents` | agents: empty; skills: `synced` only. No `df-*` | yes |
| `git status --porcelain` | clean | yes |

## Task 3: pre-checks (Gate 1 presented)

- `git fetch origin`: ok.
- `origin/feat/stack-profile-loader` is 11e98cf4, the release PR's last push. `origin/main` is b4a9d870, the 3.0.0
  merge. `git diff 11e98cf4 origin/main` is empty, so main's tree equals the branch's last pushed tree.
- `git merge-base --is-ancestor origin/feat/stack-profile-loader feat/stack-profile-loader`: exit 0, so the push is a
  fast-forward.
- `git merge-tree --write-tree origin/main feat/stack-profile-loader`: exit 0, no conflicts.
- `gh pr list --head feat/stack-profile-loader --base main --state open`: `[]`. No open PR to adopt.
- `git log --oneline origin/main..feat/stack-profile-loader`: 33 commits, including this one. All are local only.
  The two files outside the planning trees are CLAUDE.md and `plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`.
  The rest is the `.planning/` -> `.aoforge/` move (4f0ed6b8) and planning records. `git diff --shortstat -M`:
  1421 files changed, 1884 insertions, 109 deletions.

Commits before this one (newest first): e2782c2a, 4b1bc2d3, fa1155fc, 278ff7a1, 80e4b195, a088a3f8, 8b6832ce,
459db923, 131c1239, 53b0fdd3, 1d3c342a, 572ccd13, 0efd477c, 093e55c7, d9907148, 52e92ced, 9103a517, d04c698d,
19ffaaa1, cc0e27a1, 06494e55, e355e010, 2c92f943, 701742cc, 67993188, ce0b4385, 1fa7fa40, 21ce1b5c, 4f0ed6b8,
de827412, 9dd54b5e, 8582fce9.

Gate 1 (push) was presented to the user. Nothing has been pushed and no PR has been opened. Any objective-completion
commits made after this TRD (VERIFICATION, final state) are not in this push and will ride the next PR.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: move gate | `pwd -P` -> /Users/justin/dev/aoforge-claude; `ls -d /Users/justin/dev/devflow-claude` | 0 / 1 (absent, correct) | PASS (already done) |
| 2: keyed state | `aof-tools validate health --raw` (0 errors, 3 expected W006, no W066/W067) | 0 | PASS |
| 3: push/PR gates | pre-checks run; Gate 1 pending the user's reply | - | PENDING |
