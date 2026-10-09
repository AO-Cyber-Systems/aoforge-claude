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
  - "Follow-up PR #129 (https://github.com/AO-Cyber-Systems/aoforge-claude/pull/129): the 33 post-release commits into main, open, unmerged"
  - "Todo: make roadmap reconcile treat a checkpoint SUMMARY (no Self-Check) as incomplete"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .aoforge/todos/pending/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md
  modified: []
decisions:
  - "Gate 1 (push): user's reply `approved` (relayed by the orchestrator); pushed 11e98cf4..abc18a9f to feat/stack-profile-loader, 33 commits, no force, no tags"
  - "Gate 2 (PR): user's reply `approved` (relayed by the orchestrator); opened PR #129 into main at head abc18a9f; not merged"
  - "The rekey left the new-key estimate run state (written by the new session) in place instead of overwriting it; 72 is unscored, so EST-11 is unaffected and the original start time stays under the old key"
  - "roadmap reconcile ticking a checkpoint SUMMARY (E2E1 red on PR #129's mid-TRD head) is a code defect: filed as a todo, not fixed in this TRD"
requirements-completed: [INST-06]
metrics:
  started: 2026-10-09T15:51:54Z
  completed: 2026-10-09T16:19:36Z
  duration: "about 28 min, including two approval waits and the CI watch"
  tasks: 3
  files: 2
tokens_input: 7894500
tokens_output: 45688
tokens_cache_read: 7511554
tokens_cache_write: 382794
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 26: Checkout move and rekey Summary

**The checkout is at `~/dev/aoforge-claude`. Its Claude memory and repo-keyed AOForge state were copied to the new
keys (old copies kept), health and doctor show no layout or key errors, and the 33 post-release commits are on
follow-up PR #129, pushed and opened after two separate approvals. PR #129's unit gate fails only on the mid-TRD
roadmap self-test (E2E1), which is filed as a todo.**

## Progress
- [x] Task 1: Approval gate: move the checkout to ~/dev/aoforge-claude and restart there — e2782c2a
- [x] Task 2: Carry the path-keyed state over and check the new location — abc18a9f
- [x] Task 3: Approval gates (push, then PR) — Gate 1 push 11e98cf4..abc18a9f recorded in 35f71bf2; Gate 2 opened PR #129 (recorded in the final docs commit)

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

### Gate 1 (push): approved

- Reply: `approved`, the user's literal reply as relayed by the orchestrator. The executor did not receive it from
  the user directly.
- Command: `git -C /Users/justin/dev/aoforge-claude push origin feat/stack-profile-loader`. No force and no tags.
  Output: `11e98cf4..abc18a9f  feat/stack-profile-loader -> feat/stack-profile-loader`, a fast-forward of 33 commits.
- Verified: `git rev-parse origin/feat/stack-profile-loader` and `git ls-remote origin refs/heads/feat/stack-profile-loader`
  both give abc18a9fc7db208fbbf060f3b59d425005f18c5a, which equals the local head at push time.
- Branch CI: no run. The Unit suite and the agent shell harness trigger on `pull_request`, and the docs and test
  workflows on pushes to `main`. `gh run list --branch feat/stack-profile-loader` shows only the older PR #128 runs
  (11e98cf4: Unit suite, Agent shell harness and Docs site all succeeded).
- Local `npm test` on abc18a9f: 11,961 passed, 2 failed, 35 skipped, out of 11,998.
  - `misc-commit-gate.test.cjs` 5b is a flake: the afterEach `rmSync` hit ENOTEMPTY on its temp dir under parallel
    load. `node --test` on that file alone passes 28/28.
  - `roadmap-reconcile.test.cjs` E2E1 (the repository self-test) fails every time on this head. Run alone it still
    fails, reporting `trd_summary_exists` drift for 72-26 because the checkpoint SUMMARY exists while ROADMAP shows
    `- [ ]`. `roadmap-reconcile.cjs` ticks any SUMMARY that is not FAILED (`_checkSummaryFailed` returns false when
    there is no Self-Check). The executor contract instead treats a SUMMARY with no Self-Check as a checkpoint.
    That is a code defect, so it was filed as todo
    `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete` and not fixed in this
    TRD. Consequence: a PR opened on abc18a9f will show a red Unit suite on E2E1 until a later push carries the
    completed 72-26 (its ROADMAP tick).

### Gate 2 (PR): approved, PR #129 open

- Reply: `approved`, the user's literal reply as relayed by the orchestrator. The executor did not receive it from
  the user directly.
- Command: `gh pr create --repo AO-Cyber-Systems/aoforge-claude --base main --head feat/stack-profile-loader --title
  "Post-release: AOForge dogfood (.aoforge move, docs, rollout records)" --body-file
  /private/tmp/claude-501/-Users-justin-dev-aoforge-claude/7904456b-55e6-4fc5-858f-b59289af1567/scratchpad/72-26-pr-body.md`.
  The body lists the 33 commits and notes that 3.0.0 shipped in #128. It also gives the local test result with the
  E2E1 explanation and ends with the Claude Code attribution line.
- PR: https://github.com/AO-Cyber-Systems/aoforge-claude/pull/129
- `gh pr view 129 --json state,baseRefName,headRefOid,mergeable`: `OPEN`, base `main`, headRefOid
  abc18a9fc7db208fbbf060f3b59d425005f18c5a (== the pushed head), `MERGEABLE`.
- `gh pr checks 129 --watch` (exit 1):

| Check | Result |
|---|---|
| Analyze (actions) | pass (45s) |
| Analyze (javascript-typescript) | pass (2m45s) |
| Analyze (ruby) | pass (47s) |
| CodeQL | pass |
| test (npm test, gated) | **fail** (4m35s), as predicted at Gate 2 |

  The CI unit gate reported 11,964 tests, 11,930 executed, 2 failures and 34 skipped. Only one failure is not in
  `.github/known-test-failures.json`: `roadmap-reconcile.test.cjs` E2E1, the self-test drift on 72-26 explained
  above. The other, `wrappers/powershell.test.cjs` PW-9, is a known failure. E2E1 clears when a push carries the
  completed 72-26 (this TRD's final commit ticks its ROADMAP line through `roadmap update-job-progress`). That push
  is not part of this TRD and needs its own approval. The underlying defect is the filed todo.
- Not merged. Merging is the user's call.

Not in PR #129: 35f71bf2, the final docs commit of this TRD, and the objective-completion commits made after it
(VERIFICATION, final state) all come after the approved push. They are local only and go in the next push and PR.
Unmerged at the end of this TRD: `git log --oneline origin/feat/stack-profile-loader..feat/stack-profile-loader`
lists 35f71bf2 and the final docs commit.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: move gate | `pwd -P` -> /Users/justin/dev/aoforge-claude; `ls -d /Users/justin/dev/devflow-claude` | 0 / 1 (absent, correct) | PASS (already done) |
| 2: keyed state | `aof-tools validate health --raw` (0 errors, 3 expected W006, no W066/W067) | 0 | PASS |
| 3a: Gate 1 push | `git rev-parse origin/feat/stack-profile-loader` == abc18a9f (local head at push) | 0 | PASS |
| 3b: Gate 2 PR | `gh pr view 129 --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefOid` -> OPEN, main, abc18a9f | 0 | PASS (PR checks: 4 pass, unit gate fails on the expected E2E1) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| (stack profile `general` defines no task gates) | - | - | not_available |
| unit suite, local (informational) | `npm --prefix /Users/justin/dev/aoforge-claude test --silent` | 1 | FAIL: E2E1 (expected mid-TRD, todo filed) plus a cleanup flake that passes alone |
| unit suite, PR #129 CI | `test (npm test, gated)` | 1 | FAIL: E2E1 only beyond the known-failure list |

This TRD changed no code: all its repository writes are planning records. The unit runs were evidence for the PR
body, not task gates.

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written for its actions.

### Execution notes

**1. Task 1 recorded as already done (orchestrator instruction).** The user moved the checkout before this session,
so no move reply was collected here. The SUMMARY records the evidence instead.

**2. Gate replies relayed by the orchestrator.** Both `approved` replies (push, PR) reached the executor through the
orchestrator, not from the user directly. They are recorded as relayed.

**3. The estimate run state was not carried over.** The new session's orchestrator had already written a run state
under the new key, so the rekey skipped it instead of overwriting it, per the TRD's no-overwrite rule. Objective 72
is unscored (72-01), so EST-11 is unaffected. The original start time stays readable under the old key.

### Deferred Issues

**1. [Code defect] roadmap reconcile ticks a checkpoint SUMMARY.** Found during Task 3's local `npm test`.
`roadmap-reconcile.cjs` treats any SUMMARY that is not FAILED as complete, including a `summary checkpoint` with no
`## Self-Check`. As a result, the repository self-test E2E1 fails on any mid-TRD commit, including PR #129's head.
Per the TRD's recovery rule, a code defect becomes follow-up work, so it was filed as todo
`2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete` (35f71bf2).

**2. [Housekeeping, user's call] old-key leftovers.** The rekey and the memory copy keep the old copies on purpose.
They remain under the old key: the old run state, awareness entry (doctor: orphaned), estimate history, backups (85M,
doubling backup usage to 635.7 MiB over the 500 MiB threshold) and drafts. The old Claude projects directory also
remains. Pruning them is a later decision, as is moving `~/.claude/devflow` (`doctor --global --fix`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - The checkout is at the new path with no worktrees to repair; origin is aoforge-claude; the merge driver path
    exists.
  - Memory was copied (10 files, MEMORY.md present, old copy kept).
  - The rekey copied every repo-keyed entry without deleting. On the unscored path the run state was not carried,
    and that is recorded.
  - PR #129 is open after two separate approvals, and later commits go in the next PR.
  - `validate health` and `doctor` report no W066/W067 and no path or key errors.
- Gate failures: none at the task level. PR #129's unit gate fails on the expected E2E1 (deferred issue 1).

## Self-Check: PASSED

- FOUND: /Users/justin/.claude/projects/-Users-justin-dev-aoforge-claude/memory/MEMORY.md
- FOUND: /Users/justin/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2 (8 files)
- FOUND: /Users/justin/.claude/aoforge/backups/aoforge-claude-df646fc2
- FOUND: .aoforge/todos/pending/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md
- FOUND commits: e2782c2a, abc18a9f, 35f71bf2
- FOUND: PR #129 OPEN, base main, head abc18a9f
