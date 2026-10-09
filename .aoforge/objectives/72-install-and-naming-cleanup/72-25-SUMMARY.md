---
objective: 72-install-and-naming-cleanup
trd: "25"
subsystem: install
tags: [install, fleet-sweep, upgrade, approval-gates]
requirements: [INST-04, INST-06]
requires:
  - objective: 72
    provides: "72-08/72-09/72-13: migrations 0012/0013/0014/0007; 72-16: gh rebrand; 72-21: AOForge 3.0.0 installed"
provides:
  - "Fleet table for ~/dev (33 DevFlow repositories: 17 ready, 16 skipped dirty), ambiguous directories listed for the user"
affects: [72-26]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions: []
requirements-completed: []
metrics:
  started: 2026-10-09T15:05:00Z
---

# Objective 72 TRD 25: Fleet sweep Summary (CHECKPOINT: Task 1 done, Task 2 awaiting the first repository's approval)

## Progress
- [x] Task 1: Discover the fleet and preview each repository — 52e92ced (read-only, recorded after 72-24 finished)
- [ ] Task 2: Approval gate. User's literal reply (AskUserQuestion, relayed by the orchestrator): "Approve 1–16, hold 17 (Recommended)" — approves, by name and in order, dfip, quanta-local, torrentConsole, aocyber-deploy, trades, EdenDocs, ao-terminal, devflow, eden-press, qrCodeBuilder, aostudio, aoid, aoinference, aofamily, justin-donnaruma-us-go, navigators; github-enterprise-migration HELD; the 16 dirty repositories and the ambiguous items skipped with no action. Progress is the "Task 2 outcomes" table below. Next step: the first approved repository (in the order dfip ... navigators) without an outcomes row: re-check it, then `aof-tools upgrade --apply --path /Users/justin/dev/<repo>` and its commit
- [ ] Task 3: Verify the upgraded repositories

## Preflight

- `exec-context check --repo /Users/justin/dev/devflow-claude` (no `--id`/`--base`: the dispatch gave no WAVE_BASE, and a claim would write `.git/aoforge-exec-claims` in the main checkout) -> ok, checkout /Users/justin/dev/devflow-claude, branch feat/stack-profile-loader, HEAD d04c698d, claim null. Base: UNPROVEN (no WAVE_BASE in the dispatch).

## Method (read-only)

- Discovery: one `ls -la ~/dev`, then a scratchpad script (outside every repository): `.git` kind (dir/file), top-level `.planning/`, `.aoforge/` + legacy `devflow` stamp, `-wt-` names, symlinks; per candidate: branch, `git --no-optional-locks status`, in-progress operation files, linked worktrees, skill marker, last commit, `aof-tools upgrade --check --path <repo>` (JSON form, `GIT_OPTIONAL_LOCKS=0`).
- Store mode: `.planning/config.json` `github.store` read directly. **No repository has store mode on**, so no `gh rebrand --apply` is offered, no outbox flush is needed, and the 72-11 backfill-halt note does not apply (no 0011 pending anywhere). No fleet repository has a legacy or AOForge checks caller under `.github/workflows/`.
- 0012 blocks on any TRACKED change anywhere in the repository (untracked files never block). A runtime file that 0008 untracks in the same run (`**/.planning/.progress-guard.json`, `.awareness-cache.json`) counts as the upgrade's own change. "Blocking dirt" below applies exactly that rule.

## Fleet table

Ready = no blocking dirt, no operation in progress. Task 2 order = this order (smallest change set first). `0006` (kind, `confirm`) is held per the TRD anti-pattern: `--apply` without `--confirm` never runs it.

| # | Repo | Branch (default) | Upstream behind/ahead | Tree | Mode | Pending (auto) | Note |
|---|---|---|---|---|---|---|---|
| 1 | dfip | main (main) | 0/0 | clean | local | 0012 | 0006 held |
| 2 | quanta-local | main | no remote | clean | local | 0001, 0012 | |
| 3 | torrentConsole | main | no remote | clean | local | 0001, 0003, 0012 | |
| 4 | aocyber-deploy | main (main) | 1/14 | clean | local (no config.json) | 0001, 0012 | 14 unpushed commits already |
| 5 | trades | main (main) | 0/0 | clean | local (no config.json) | 0001, 0002, 0004, 0005, 0007, 0008, 0012, 0014 | CLAUDE.md DEVFLOW block |
| 6 | EdenDocs | eden-main (main) | 0/0 | 4 untracked | local | 0001, 0007, 0008, 0012 | not on origin's default branch |
| 7 | ao-terminal | ao-main (ao-main) | 0/0 | 1 untracked | local | 0001, 0005, 0007, 0008, 0012, 0014 | CLAUDE.md DEVFLOW block |
| 8 | devflow | main (main) | 0/0 | 2 untracked | local | 0001, 0007, 0008, 0012 | |
| 9 | eden-press | main (main) | 0/0 | 3 untracked | local | 0001, 0003, 0008, 0012 | |
| 10 | qrCodeBuilder | main (main) | 0/0 | 2 untracked | local (no config.json) | 0001, 0005, 0007, 0012, 0014 | CLAUDE.md DEVFLOW block |
| 11 | aostudio | main | no remote | 3 untracked | local | 0001, 0003, 0007, 0008, 0012 | |
| 12 | aoid | main (main) | 0/0 | only `.planning/.awareness-cache.json` M (0008 absorbs it) + 13 untracked | local | 0001, 0004, 0007, 0008, 0012 | 24 linked worktrees |
| 13 | aoinference | fix/obj31-oci-source-label (main) | 0/0 | 3 untracked | local | 0001, 0003, 0007, 0008, 0012 | commit lands on a feature branch |
| 14 | aofamily | df/riverpod3-rebase (main) | 0/0 | 4 untracked | local | 0001, 0004, 0005, 0007, 0008, 0012, 0014 | feature branch; component projects ai/browser/connect not covered |
| 15 | justin-donnaruma-us-go | df/riverpod3-bump (main) | 0/0 | clean | local (no config.json) | 0001, 0004, 0007, 0012 | feature branch; personal remote |
| 16 | navigators | df/riverpod3-bump (main) | 0/0 | 25 untracked | local | 0001, 0003, 0004, 0008, 0012 | feature branch; 0006 held |
| 17 | github-enterprise-migration | main | no remote | 2 untracked | local | 0012, 0013 | **active**: commit 11:08 today; live executor worktrees `.df-worktrees/github-enterprise-migration/01-03` (dirty) and `01-04`. Recommend hold |
| 18 | AOSignal | main | no remote | blocking: `.planning/config.json` M | local | 0001, 0003, 0007, 0012 | skipped: dirty |
| 19 | aocore | df/110-developer-console (main) | 14/10 | blocking: `.planning/.dup-detect-log.jsonl`, `admin/analysis_options.yaml` | local | 0007, 0012, 0013 | skipped: dirty; 22 linked worktrees; component go/ |
| 20 | aodex | fix/ci-listtile-material (main) | no upstream | blocking: 27 (CLAUDE.md, flutter/...) | local | 0007, 0012, 0013 | skipped: dirty; 127 linked worktrees; components flutter/, go/ |
| 21 | aoedge | chore/objective-trusted-client-ip (main) | 0/0 | blocking: `.planning/.dup-detect-log.jsonl`, `.planning/PROJECT.md` | local | 0001, 0004, 0007, 0008, 0012 | skipped: dirty |
| 22 | devcluster | main (main) | 0/0 | blocking: `config/apps.yaml`, `t2-cluster/ctl.sh` | local (no config.json) | 0001, 0008, 0012 | skipped: dirty |
| 23 | devflow-test | main | no remote | blocking: `.planning/config.json` M | local | 0001, 0003, 0012 | skipped: dirty |
| 24 | devflowops | main (main) | 0/0 | blocking: `.planning/.dup-detect-log.jsonl` only | local | 0001, 0003, 0004, 0007, 0008, 0012 | skipped: dirty (one runtime log); 10 linked worktrees |
| 25 | eden-biz | main (main) | 327/851 | blocking: `.planning/.dup-detect-log.jsonl` only | local | 0007, 0012, 0013 | skipped: dirty; 32 linked worktrees; components flutter/, go/ (GitHub mirror on) |
| 26 | eden-circle | obj-36-initstate-audit (main) | no upstream | blocking: 4 (.claude/agent-memory, test jpgs) | local | 0001, 0004, 0007, 0008, 0012 | skipped: dirty; 18 linked worktrees |
| 27 | eden-libs | main (main) | 3/0 | blocking: 4 (`.planning/.micro-description` D, pubspec.lock, .dart_tool) | local (no config.json) | 0001, 0004, 0007, 0008, 0012 | skipped: dirty |
| 28 | justinforme | df/riverpod3-bump | no remote | blocking: 6 (dup-detect log, two 39-* TRDs) | local | 0001, 0007, 0008, 0012 | skipped: dirty; 0006 held |
| 29 | opsCluster | main (main) | 0/0 | blocking: `.claude/agent-memory/devflow-verifier/MEMORY.md` only | local | 0007, 0008, 0012, 0013 | skipped: dirty; 68 linked worktrees |
| 30 | politihub | main (main) | 0/0 | blocking: 6 incl. STAGED (`.gitignore`, `.planning/config.json` MM, new OBJECTIVE.md) | local | 0007, 0012, 0013 | skipped: dirty (staged work) |
| 31 | recycling-oracle | main (main) | 0/0 | blocking: 202 (.env, bin/dev, ...) | local | 0001, 0002, 0008, 0012 | skipped: dirty; 0006 held |
| 32 | smartWellness | df/riverpod3-bump | no remote | blocking: `.planning/.micro-description` D only | local | 0001, 0005, 0007, 0008, 0012, 0014 | skipped: dirty |
| 33 | videoArchive | main (main) | 1/190 | blocking: 4 (ios/Podfile.lock, pbxproj, pubspec.lock) | local | 0001, 0005, 0007, 0008, 0012, 0014 | skipped: dirty |

Rebrand counts: none (no store-mode repository). No operation (merge/rebase/cherry-pick/revert/bisect) is in progress in any candidate. Every skill marker found is expired except videoArchive's `build` marker, which has no expiry.

## Task 2 outcomes (one row per approved repository, in order)

Every row: re-checked against the preview first (same branch, same tracked dirt, no operation in progress, same pending ids), then exactly `aof-tools upgrade --apply --path <repo>` and `aof-tools --cwd <repo> commit "chore: move to AOForge (3.0.0 upgrade)" --files <changed_files>`. Local commits only, nothing pushed. Health codes other than W066/W067 are the repository's own advisories (W001 PROJECT.md sections, W065 requirements-unlisted, W040 only because a held `confirm` migration is pending).

| # | Repo | Re-check | Applied | Commit | Commit contents | `.aoforge/` / `.planning` gone | W066/W067 | Outcome |
|---|---|---|---|---|---|---|---|---|
| 1 | dfip | ok (main, 78c10ff) | 0012 (0006 held) | 12bf091 | 27 R100 + config.json R087 (stamp) + .gitignore (+`.aoforge/.skill-active`) | yes / yes | none (W001, W040, W065) | upgraded |
| 2 | quanta-local | ok (main, 3b9e5d3) | 0001, 0012 | dd98daa | 182 R + config.json D/A (0001 reshape + stamp) + .gitignore (+`.aoforge/.dup-detect-log.jsonl`, `.aoforge/.stack.lock/`) | yes / yes | none (W065) | upgraded |
| 3 | torrentConsole | ok (main, 3aca26f) | 0001, 0003, 0012 | da3236b | 28 R + state.json A (0003 seed) + config.json D/A (0001 + stamp) + .gitignore (3 `.aoforge/` twins) | yes / yes | none (W006: ROADMAP objectives without a directory) | upgraded |
| 4 | aocyber-deploy | ok (main, 787937f) | 0001, 0012 | 69e31b3 | 26 R + config.json A (0001 created it + stamp) + .gitignore (+`.aoforge/.skill-active`) | yes / yes | none. Health `broken` E002/E003/E004 predates the upgrade: the legacy directory held only `todos/` (HEAD~1) | upgraded |

## Ambiguous (listed for the user, not swept)

- **eden-platform-go** and **eden-ui-flutter**: symlinks in `~/dev` into `eden-libs/`, but each is its OWN repository (ignored by eden-libs) with a top-level `.planning/`. eden-platform-go (AO-Cyber-Systems/eden-platform-go, fix/cf-email-retry-on-throttle, tracked-clean; pending 0001, 0003, 0004, 0007, 0008, 0012, 0006 held) would be ready. eden-ui-flutter (main, 1 tracked change) would be skipped as dirty.
- **Component projects inside candidate repositories** (`upgrade --path <repo>` moves only the top-level directory; each is its own project root to `upgrade --check --path <repo>/<dir>`, which shows 0012 pending): aocore/go (149 tracked files), aodex/flutter (129), aodex/go (2), aofamily/ai, browser, connect (15/28/10, 0006 held), eden-biz/flutter (246, github.enabled, 0009 pending), eden-biz/go (1003, github.enabled, 0009 pending), opsCluster/control-plane (only `.progress-guard.json`).
- **aohealth**: a repository with only component projects (flutter/.planning, 216 tracked; go/.planning, 2) and no top-level planning directory (`upgrade --check --path aohealth` exits 1, "not an AOForge project").
- **aoCyberSecurity**: `.git` directory but no resolvable HEAD; sub-projects aoducky, aopineapple, aoreport, aoshield each have `.planning/`.

## Excluded

- This repository (devflow-claude).
- Worktrees (`-wt-` name or a `.git` FILE): aocore-627, aodex-clean, aodex-desktop, aodex-obj56, aodex-prodtest, aodex-wbfix, aodex-wt-654, aoedge-main, aoedge-wt-654, aoid-household, aoid-plans, eden-biz-103, eden-biz-autotrial, gitops-v1.1.305, gitops-v1.1.306, opsCluster-wt-ghscim-dotless, opscluster-gitops-wt-654, opscluster-gitops-wt-ghscim, opscluster-gitops-wt-rel311; in-repo worktrees eden-biz/.worktrees/obj65-reconcile, opsCluster/.worktrees/obj68-retire-tf, eden-libs/eden-ui-flutter-ctxmenu-fix.
- Worktree containers (not repositories): .df-worktrees, aocore-wave-b through aocore-wave-g.
- Everything else in `~/dev` has no legacy planning directory.

## Findings

1. **[Defect, not fixed: read-only task] `gh rebrand` cannot read a large repository.** `aof-tools --cwd ~/dev/eden-biz/go gh rebrand` (dry run) -> `could not read the issues of AO-Cyber-Systems/eden-biz: spawnSync gh ENOBUFS`. `gh-client.cjs:49` `defaultRunGh` passes no `maxBuffer` (Node default 1 MiB, timeout 30 s) and `gh-rebrand.cjs:249` reads `repos/<repo>/issues?state=all` paginated in one spawn. Not on this sweep's path (no store-mode repository), but it blocks any rebrand of eden-biz. Fix belongs in this repository once 72-24 has finished.
2. **The SessionStart hook can pre-empt the per-repository approval.** `upgrade-project.js` applies the auto migrations (0012 included) and background-commits in any DevFlow repository whose tracked tree is clean when a Claude session opens there. Until the sweep finishes, opening a session in a ready repository upgrades it without its checkpoint (launch with `AOFORGE_SKIP_UPGRADE=1` to avoid that).
3. **Component planning projects are not covered by any migration.** 0012, 0008's root list and W066 look at the top-level only; component `.planning/` directories keep working through the compat fallback until the release after 3.0.0 removes it.
4. **`.planning/.dup-detect-log.jsonl` is a tracked runtime log** in aocore, aoedge, devflowops, eden-biz, justinforme, and the only blocker in devflowops and eden-biz. 0008 does not untrack it.
5. **Linked worktrees keep `.planning/` on their branches** (aodex 127, opsCluster 68, eden-biz 32, aoid 24, aocore 22, eden-circle 18, recycling-oracle 13, devflowops 10). Merging such a branch after the move hits git's directory-rename detection (`merge.directoryRenames` default `conflict`) for files new under `.planning/` on that branch.
6. **The upgrade commit lands on the current branch.** Task 2 never switches branches: aoinference, aofamily, justin-donnaruma-us-go and navigators are on feature branches, EdenDocs on eden-main.

## Deviations from Plan

- Task 1 recorded its table in the planning draft only, not with `summary checkpoint`, and made no commit: the dispatch forbids publishing or writing in the main checkout while 72-24 may be finishing. The continuation publishes it.
- Preflight ran without `--id`/`--base` (no WAVE_BASE in the dispatch; a claim would write into the main checkout's git dir).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Discover the fleet | discovery script + `upgrade --check --path` per candidate; one row per repository above (33 rows, ambiguous listed) | 0 | PASS (table in draft, not yet published) |
