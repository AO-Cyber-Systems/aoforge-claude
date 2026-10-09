---
objective: 72-install-and-naming-cleanup
trd: "19"
subsystem: release
tags: [release, rename, github, approval-gates, ci]
requirements: [INST-05, INST-06]
requires:
  - objective: 72
    provides: "72-18 validated 3.0.0 release branch (02da6829)"
provides:
  - "GitHub repository AO-Cyber-Systems/aoforge-claude (renamed; old name redirects); origin on the new URL"
  - "feat/stack-profile-loader published at 11e98cf4"
  - "Release PR #128 (Release 3.0.0: DevFlow is now AOForge), OPEN into main, all 7 checks green at 11e98cf4"
affects: [72-20, 72-21, 72-24, 72-26]
tech-stack:
  added: []
  patterns:
    - "Hook test template repos set maintenance.auto=false before committing (no detached git maintenance lock racing cpSync)"
key-files:
  created: []
  modified:
    - plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js
    - plugins/aoforge/hooks/hook-coexistence.test.js
    - plugins/aoforge/hooks/planning-writes.audit.test.js
    - plugins/aoforge/aoforge/bin/lib/milestone-complete.test.cjs
    - .planning/ROADMAP.md
decisions:
  - "Red PR checks were fixed locally first, then a separate push approval was asked (user: Fix locally, then ask)"
  - "E2E1 went green by ticking 72-19 in ROADMAP.md before the second push (user: Tick 72-19 now)"
  - "CodeQL #161 and #162, path-change re-flags of #95 and #146 dismissed on main, dismissed with the same reasons (user: Dismiss both)"
  - "The validation of record moved from 72-18's 02da6829 to the green PR CI at 11e98cf4"
metrics:
  started: 2026-10-09T03:44:04Z
  completed: 2026-10-09T13:27:00Z
  duration: "9h43m wall clock (three approval gates, a CI failure, a gap fix and a second approved push)"
  tasks: 3
  files_modified: 5
tokens_input: 9928499
tokens_output: 70428
tokens_cache_read: 9415190
tokens_cache_write: 513147
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 19: Repository rename, push and 3.0.0 release PR Summary

## Progress
- [x] Task 1: Approval gate: rename the GitHub repository to aoforge-claude: no commit (live GitHub op + local remote config only)
- [x] Task 2: Approval gate: push feat/stack-profile-loader: no commit (live push only); first PUSHED_SHA 02da68293312e1812270259fde88668f72a9c848; final PUSHED_SHA 11e98cf4bf4a82083fd5b2af516e7e8e8cc278b6 after the gap fix (see "Final state")
- [x] Task 3: Approval gate: open the 3.0.0 release PR, then wait for green checks: PR #128 opened at 02da6829 with `test` and `CodeQL` red; gap fix 9f149c8b + 17d02395 (records 027312be, 72a16984), roadmap tick 11e98cf4, second approved push 72bb78be..11e98cf4, CodeQL #161/#162 dismissed; all 7 checks green at 11e98cf4 — 72bb78be, 9f149c8b, 17d02395, 027312be, 72a16984, 11e98cf4

## Approvals (literal replies)

| Gate | Reply | Action taken |
|---|---|---|
| 1. rename | "approved" (user's literal reply, relayed by the orchestrator) | `gh repo rename aoforge-claude --repo AO-Cyber-Systems/devflow-claude --yes` (run once, no output, exit 0); `git -C /Users/justin/dev/devflow-claude remote set-url origin https://github.com/AO-Cyber-Systems/aoforge-claude.git` |
| 2. push | "\approved" (user's literal reply, leading backslash; the orchestrator relayed it as a typo of "approved" and directed treating it as approval for Task 2 only) | `git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader` (run once): `bcd255b2..02da6829  feat/stack-profile-loader -> feat/stack-profile-loader` |
| 3. PR | "Bapproved" (user's literal reply, stray leading letter; the orchestrator relayed it as a typo of "approved" and directed treating it as approval for Task 3 only) | `gh pr create --repo AO-Cyber-Systems/aoforge-claude --base main --head feat/stack-profile-loader --title "Release 3.0.0: DevFlow is now AOForge" --body-file <72-19-PR-BODY.md draft>` (run once) -> https://github.com/AO-Cyber-Systems/aoforge-claude/pull/128 |
| Red checks: how to proceed | "Fix locally, then ask" (user choice, relayed by the orchestrator) | Gap fix committed locally (9f149c8b, 17d02395, records 027312be, 72a16984); nothing pushed during it |
| E2E1 roadmap drift | "Tick 72-19 now" (user choice) | Orchestrator commit 11e98cf4 ticked 72-19 in ROADMAP.md |
| 2nd push | "Approve push" (user, via AskUserQuestion, relayed by the orchestrator) | Orchestrator ran `git push origin feat/stack-profile-loader`: `72bb78be..11e98cf4`, plain fast-forward |
| CodeQL re-flags | "Dismiss both" (user, via AskUserQuestion) | Orchestrator dismissed #161 (won't fix, same as #95) and #162 (false positive, same as #146) |
| (none) | NO APPROVAL | 07:42:30 -0400 push of 72bb78be from this clone; see "Unapproved push" |

## Task 1 verify (2026-10-09)

| Check | Output |
|---|---|
| `gh repo view AO-Cyber-Systems/aoforge-claude --json nameWithOwner -q .nameWithOwner` | `AO-Cyber-Systems/aoforge-claude` |
| `gh repo view AO-Cyber-Systems/devflow-claude --json nameWithOwner -q .nameWithOwner` | `AO-Cyber-Systems/aoforge-claude` (redirect) |
| `git -C /Users/justin/dev/devflow-claude remote get-url origin` | `https://github.com/AO-Cyber-Systems/aoforge-claude.git` |
| `git -C /Users/justin/dev/devflow-claude ls-remote origin refs/heads/main` | `2f01cd77f5ad70518302ad53e35f5478b704fd5d refs/heads/main` (exit 0) |

## Task 2 pre-check facts (2026-10-09)

- Local `feat/stack-profile-loader` = 02da68293312e1812270259fde88668f72a9c848 = VALIDATED_SHA.
- `git fetch origin` exit 0. Remote branch head bcd255b28af8de33cdcd369946e2668d4b03d3ce (`docs(67-06): complete release artifacts and validation TRD`, 2026-10-08).
- `rev-list --count origin/..local` = 276; `rev-list --count local..origin/` = 0; `merge-base --is-ancestor` exit 0 (fast-forward).
- The 276 span objectives 67 (tail) to 72, not only 72: by scope 67: 9, 68: 37, 69: 32, 70: 15, 71: 27, 72: 110, plus 46 unscoped (27 wave merge commits, 16 `docs(objective-NN)`, 1 `docs(state)`, 1 `chore(devflow)`, 1 `docs(objective-67)`).
- No open PR has head feat/stack-profile-loader (#127, #126, #124, #123, #122, #121, #117, #114 all MERGED).
- No workflow runs on a push to this branch: test.yml and docs.yml run on push to main and on pull_request; release.yml on `v*` tags; agent-shell-harness on pull_request; auto-label on issues; aoforge-checks is workflow_call. CI first runs when the PR opens (Task 3). The TRD's "runs CI on the branch" wording is inaccurate.

## Task 2 verify

`git -C /Users/justin/dev/devflow-claude ls-remote origin refs/heads/feat/stack-profile-loader` -> `02da68293312e1812270259fde88668f72a9c848 refs/heads/feat/stack-profile-loader`. PUSHED_SHA == VALIDATED_SHA. No force, no tags.

## Task 3 pre-check facts (2026-10-09)

- `gh pr list --repo AO-Cyber-Systems/aoforge-claude --head feat/stack-profile-loader --base main --state open --json number,url` -> `[]` (nothing to adopt).
- `git merge-tree --write-tree origin/main feat/stack-profile-loader` -> `091d02c1...`, exit 0 (clean).
- `994b93ef` (67-09 fix: add-blocker/resolve-blocker spaced heading) is not on origin/main (`merge-base --is-ancestor` exit 1) and has no CHANGELOG 3.0.0 entry; the PR body names it. Not added to the CHANGELOG: that would need a new commit and a new push approval.
- PR body drafted at `/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/devflow-drafts/devflow-claude-d3dccfe9/objectives/72-install-and-naming-cleanup/72-19-PR-BODY.md`, scope corrected to objectives 67 (tail) to 72 per the orchestrator; every release claim sourced from CHANGELOG `## [3.0.0]` or the 72-18 SUMMARY; branch counts from git.

## Pre-check facts (2026-10-08)

- Preflight: `exec-context check --repo /Users/justin/dev/devflow-claude --base 02da6829...` exit 0, main checkout, branch feat/stack-profile-loader, head 02da68293312e1812270259fde88668f72a9c848, claim 72-19.
- Validated head: 72-18 validated the tree at d11aea36 (code); `git diff --name-only d11aea36 02da6829` lists only `.planning/` files (ROADMAP.md, STATE.md, STATE_ARCHIVE.md, 72-18-SUMMARY.md, state.json). VALIDATED_SHA = 02da68293312e1812270259fde88668f72a9c848. No commit may land before the push (it would break Task 2's precondition).
- Task 1: `gh repo view AO-Cyber-Systems/devflow-claude`: PUBLIC, not archived, default branch main. `gh repo view AO-Cyber-Systems/aoforge-claude`: exit 1, "Could not resolve" (name free; not already renamed). origin = https://github.com/AO-Cyber-Systems/devflow-claude.git. Permissions: admin true. GitHub Pages: not enabled (404, has_pages false).

## Task 3 result: PR #128 open, checks RED (TRD not complete)

`gh pr view 128 --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefOid,statusCheckRollup`: state OPEN, base main, headRefOid 02da68293312e1812270259fde88668f72a9c848 (== PUSHED_SHA).

| Check | Conclusion |
|---|---|
| test (npm test, gated) | FAILURE (4m39s, run 37922745685) |
| CodeQL | FAILURE (github-advanced-security: "3 new alerts including 2 high severity") |
| build | SUCCESS |
| harness | SUCCESS |
| Analyze (actions) | SUCCESS |
| Analyze (javascript-typescript) | SUCCESS |
| Analyze (ruby) | SUCCESS |

PR #127 (2.15.0) had all seven green, including `test` and `CodeQL`.

### test (npm test, gated): `gh run view 37922745685 --log-failed`

- `[ci-unit-gate] tests: 11963 reported  11930 executed (floor 3000)  failures: 11  skipped: 33` -> FAIL; runner exit 1, 255 s. 386 test files.
- "10 test(s) failed that are NOT in .github/known-test-failures.json", all in `plugins/aoforge/hooks/hook-coexistence.test.js`, all the `sync-runtime.js@SessionStart` cases:
  - `sync-runtime.js@SessionStart [session start on a warm runtime mirror]`: `Error: ENOENT, No such file or directory '/tmp/coexist-1SZtUz/project/.git/objects'` at `cpSync` in `makeWorld` (`plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js:103`), via `getWarm` (`hook-coexistence.test.js:616`) / `withWorld` (`:623`) / `runScenario` (`:649`). Its three subtests 10, 11, 12 are cancelled ("test did not finish before its parent").
  - `13. sync-runtime.js@SessionStart survives` empty stdin / malformed JSON / null / an array / a string / a payload whose cwd does not exist: the same ENOENT.
  - `14. sync-runtime.js@SessionStart`: the same ENOENT.
  - Every other hook's cases pass in CI.
- The 11th failure is `PW-9 exit 7 reports exit_code=7` (powershell.test.cjs), the one listed known failure (issue #95, expires 2026-12-31). Licensed, not a cause.
- Local (macOS, this checkout): `node --test plugins/aoforge/hooks/hook-coexistence.test.js` -> tests 227, pass 227, fail 0. The failure is Linux/CI-only. The test last changed in 72-04 (a15e2af5), 72-06 (e5f40291) and 72-10 (18594c35), so it is an objective 72 regression on the gate's environment (ubuntu-latest + node 26). **Superseded by the gap fix:** the cause is a race with git 2.55's detached auto-maintenance lock in the fixture template, not an objective 72 code change (see "Gap fix", Fix 1). `.github/known-test-failures.json` `$environment` gives the node:26 Docker reproduction recipe.

### CodeQL: check run 113794518988 annotations

| Alert | Severity | Location | Status on main |
|---|---|---|---|
| js/regex-injection "Regular expression injection" | high | `plugins/aoforge/aoforge/bin/lib/handoff.cjs:54` | Same code, same line, already dismissed on main as #95 "won't fix" at `plugins/devflow/devflow/bin/lib/handoff.cjs:54`; re-flagged because the rename changed the path |
| Incomplete string escaping or encoding | high | `plugins/aoforge/aoforge/bin/lib/milestone-complete.test.cjs:382` | New: 68-01's test helper `entryLines` builds `new RegExp` from `version.replace(/\./g, '\\.')` without escaping backslashes (test code) |
| js/shell-command-injection-from-environment | medium (warning) | `plugins/aoforge/aoforge/bin/lib/ui-spec-cli.test.cjs:781` | Same code, same line, already dismissed on main as #146 "false positive" at `plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs:781`; re-flagged by the path change |

Per the TRD error path, nothing was fixed here: a fix needs a gap TRD and a new push approval. Nothing was merged, tagged or force-pushed; no further push.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Rename | `gh repo view AO-Cyber-Systems/aoforge-claude ... -q .nameWithOwner`; same for `devflow-claude`; `git remote get-url origin`; `git ls-remote origin refs/heads/main` | 0 (x4: aoforge-claude, aoforge-claude, aoforge-claude.git, 2f01cd77) | PASS |
| 2: Push | `git -C /Users/justin/dev/devflow-claude ls-remote origin refs/heads/feat/stack-profile-loader` | 0 (02da6829... == VALIDATED_SHA) | PASS |
| 3: Release PR (at 02da6829) | `gh pr checks 128 --repo AO-Cyber-Systems/aoforge-claude --watch`; `gh pr view 128 --json state,baseRefName,headRefOid,statusCheckRollup` | 1 (2 of 7 checks FAILURE) | FAIL (superseded) |
| 3: Release PR (final, at 11e98cf4) | `gh pr view 128 --repo AO-Cyber-Systems/aoforge-claude --json state,headRefOid,statusCheckRollup` | 0 (OPEN, base main, headRefOid 11e98cf4..., 7 of 7 SUCCESS) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | CI `test (npm test, gated)` on PR #128 at 02da6829 | 1 | FAIL (superseded) |
| test | CI `test (npm test, gated)` on PR #128 at 11e98cf4 (local full-suite runs: see "Gap fix") | 0 | PASS |
| CodeQL | CI `CodeQL` on PR #128 at 11e98cf4 (#160 fixed, #161/#162 dismissed) | 0 | PASS |
| build | CI `build` on PR #128 at 11e98cf4 | 0 | PASS |

## Deviations from Plan

- TRD text corrected in what was presented: Task 2's checkpoint wording said the push publishes "objective 72" and "runs CI on the branch". The 276 commits span objectives 67 (tail) to 72, and no workflow runs on a push to this branch; the checkpoint and the PR body said so instead.
- Two approvals were relayed with typos ("\approved", "Bapproved"); the orchestrator directed each be treated as approval for its own gate only. Recorded verbatim above.
- The 67-09 fix `994b93ef` has no CHANGELOG 3.0.0 entry; named in the PR body, not added to the CHANGELOG (would need a new commit and push approval).
- PUSHED_SHA moved from the 72-18 validated head (02da6829) to 11e98cf4. This followed a CI failure at 02da6829, a gap fix chosen by the user ("Fix locally, then ask") and a second push that the user approved separately ("Approve push"). The must-have "PUSHED_SHA equals the local branch head that 72-18 validated" held for the first push. The green CI at 11e98cf4 is now the validation of record.
- An unapproved push of the planning-records commit 72bb78be happened at 07:42:30 (see "Unapproved push"; cause unconfirmed).
- The first-run analysis in "Task 3 result" named an objective 72 regression. The gap fix found a git 2.55 maintenance-lock race in the test fixtures instead; the earlier line is marked superseded in place.

## Issues Encountered

- `state add-blocker --text ...` on the installed 2.15.0 runtime returned `{"added": false, "reason": "Blockers section not found in STATE.md"}`: STATE.md's heading is `## Blockers / Concerns` (line 231), the spaced form that 67-09's `994b93ef` fixes on this branch but the installed runtime predates. The red-checks blocker is therefore recorded here and in the return to the orchestrator, not in STATE.md (no hand edit).

## Post-TRD Verification

- Auto-fix cycles used: 1 (one gap fix after the user's "Fix locally, then ask"; no fix inside an approval gate)
- Must-haves verified: 5/5, one with a recorded exception.
  1. Rename after a recorded reply; the new name resolves and the old name redirects.
  2. origin is on the new URL.
  3. The first push came after its own reply, with PUSHED_SHA == the 72-18 validated head (02da6829). The exception: PUSHED_SHA is now 11e98cf4 after a second, separately approved push, and the validation of record is the green PR CI at 11e98cf4.
  4. PR #128 into main, titled for 3.0.0, opened after its own reply, with its body built from the CHANGELOG and 72-18 and ending with the attribution line. It is green (7/7) before completion.
  5. No force push, no `--tags`, no merge, no tag. The 07:42 push was a plain fast-forward but unapproved; see "Unapproved push".
- Gate failures: none at the final head. At 02da6829: `test` (git 2.55 maintenance race in the hook fixtures) and `CodeQL` (1 new test-code alert, 2 path-change re-flags). Both are resolved.

## Gap fix (2026-10-09, local only)

The user chose to fix locally, commit locally and push nothing. Main checkout /Users/justin/dev/devflow-claude, branch feat/stack-profile-loader, base 72bb78be (1 commit ahead of origin before the fix). No CodeQL alert was dismissed; the PR was not touched; nothing was pushed, merged or tagged. The two re-flagged alerts (handoff.cjs:54, ui-spec-cli.test.cjs:781) are path-change re-flags of alerts already dismissed on main and are not addressed here.

### Fix 1: hook-coexistence `sync-runtime.js@SessionStart` ENOENT (CI test gate)

**Root cause: a race with git 2.55's detached auto-maintenance, not a Linux/node difference.**

- `ensureTemplate()` (`plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js`) runs `git commit` in a temp template repo, and the first `makeWorld()` then `fs.cpSync`s that template straight away. `git commit` starts `git maintenance run --auto --quiet --detach` (confirmed with `GIT_TRACE=1`). `maintenance_run_tasks` takes `.git/objects/maintenance.lock`, then `daemonize()`s.
- git 2.55.0 is the first release whose `daemonize()` hands the tempfile to the child (`reassign_tempfile_ownership`; `setup.c` at v2.49.0 to v2.54.0 has 0 hits, v2.55.0 has 2). Before 2.55 the exiting parent removed the lock before `git commit` returned. From 2.55 on the daemon holds the lock past `git commit`'s exit: in a GIT_TRACE2_PERF trace the daemon's `exit` is logged after the `git commit` process's `exit`.
- node 26's native `cpSync` (`CopyDirRecursive` in `src/node_file.cc` v26.11.1) lists `.git/objects`, sees `maintenance.lock` as a regular file, and the daemon removes it before `copy_file`. A failed `copy_file` is reported with the PARENT destination directory, so the error reads `ENOENT, No such file or directory '<world>/project/.git/objects'`. That is the CI message exactly.
- Why only sync-runtime: it is the first registration in hooks.json, so its warm world (`getWarm` at `hook-coexistence.test.js:606`) is the first `makeWorld` in the process, run microseconds after the template's `git commit`. Every later copy runs after the lock is long gone. All sync-runtime cases (10-12, 13 x6, 14) await that one rejected warm-world promise, so one race failed all of them.
- Why only CI: the CI runner has git 2.55.0 (`actions/checkout` log; node v26.11.1). macOS here has Apple Git 2.54.0 and the `node:26` image has git 2.47.3, so neither has the handoff. With a single file and no load the window is too short to hit; in the full suite under load it widens.
- The same latent defect was in `plugins/aoforge/hooks/planning-writes.audit.test.js` (same template + `cpSync` pattern). It passed CI by timing only. [Rule 1: same bug, fixed in the same commit.]

**Reproduction (Docker, before the fix).** `.github/known-test-failures.json`'s plain `node:26` recipe has git 2.47.3. With it the file passes 227/227, so it cannot reproduce this failure. A probe image was built instead: ubuntu:24.04 + ppa:git-core/ppa (git 2.55.0) + the node:26 binary (v26.11.1), which matches CI's versions. With the real fixture, each fresh process ran `makeWorld()` once under CPU contention (3 busy loops per CPU, process at nice 19). Result over 60 runs: 1 cpSync ENOENT, the same message as CI (`ENOENT, No such file or directory '/tmp/coexist-eMvXon/project/.git/objects'`), and 4 worlds that had a stale `maintenance.lock` copied into them. A minimal probe (`git commit` then `readdir .git/objects`) saw the lock right after commit in 9 of 30 loaded runs; with `maintenance.auto=false` it saw it in 0 of 30.

**Fix.** Both templates set `git config maintenance.auto false` before they commit, so `git commit` starts no maintenance and nothing is left holding a lock. It is set in the repo config, so every copied world inherits it, and no hook's git call in a world leaves a daemon running behind the test (which could also race `disposeWorld`'s `rmSync`). The test file gets a new `world template` guard. It asserts `git config --local --get maintenance.auto` is `false` (`--local`, so a developer's global setting cannot make it pass) and that the template's `.git/objects` holds no `*.lock`.

| Check | Environment | Result |
|---|---|---|
| guard test vs the PRE-fix fixture (`git checkout HEAD --` inside a container copy) | node 26.11.1, git 2.55.0 | FAIL as expected: `'(unset)' !== 'false'`, exit 1 (RED) |
| fixture race driver, 60 loaded runs, fixed fixture | node 26.11.1, git 2.55.0 | `cpSync_ENOENT=0 stale_lock_copied=0` |
| `node --test hook-coexistence.test.js planning-writes.audit.test.js` | node 26.11.1, git 2.55.0 (CI versions) | 289/289 pass, exit 0 |
| same | `node:26` recipe image (node 26.11.1, git 2.47.3) | 289/289 pass, exit 0 |
| same | macOS (node 24.13.1, Apple Git 2.54.0) | 289/289 pass, exit 0 |

Note: one run of both files under the artificial 12-busy-loop load (suite at nice 19) took 414 s, and 24 tests failed on hook-spawn timeouts. None of them was an ENOENT. That load starves the whole suite, so the race fix was measured with the targeted driver above, not with that run.

Files: `plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js`, `plugins/aoforge/hooks/planning-writes.audit.test.js`, `plugins/aoforge/hooks/hook-coexistence.test.js`. Commit: 9f149c8b `fix(72-19): turn off git auto-maintenance in hook test template repos`.

### Fix 2: CodeQL "Incomplete string escaping or encoding" (js/incomplete-sanitization), milestone-complete.test.cjs:382

**Cause.** 68-01's test helper `entryLines` built `new RegExp` from `version.replace(/^v/, '').replace(/\./g, '\\.')`. That escapes dots only. Backslashes and every other metacharacter reach the RegExp unescaped. `regex-escape.repo.test.cjs` skips test files by design, so the repo gate did not catch it, but CodeQL did.

**Fix.** The helper now uses the shared `escapeRegExp` from `lib/text-escape.cjs` (`const digits = escapeRegExp(version.replace(/^v/, ''))`), the same import that `builtin-status.repo.test.cjs` and `planning-layout.legacy.test.cjs` use. The heading rule is still the test's own (`^## v?<version>(?:\s|$)`). It deliberately does not reuse the production `milestoneHeadingPattern`, so the test stays independent of the writer it checks.

| Check | Result |
|---|---|
| old vs new helper on `## v1+0 Plus` / `## v110 Other` / `## v1.0 Real` | `v1.0`: both `["## v1.0 Real"]`. `v1+0`: old `["## v110 Other"]` (wrong line), new `["## v1+0 Plus"]` |
| `node --test milestone-complete.test.cjs regex-escape.repo.test.cjs` (macOS) | 34/34 pass, exit 0 |
| CodeQL | not run locally (`codeql` CLI not installed). The alert closes only on the next CodeQL analysis of a pushed head, and nothing is pushed |

Files: `plugins/aoforge/aoforge/bin/lib/milestone-complete.test.cjs`. Commit: 17d02395 `test(72-19): escape the milestone version with the shared escapeRegExp in entryLines`.

### Full suite after both fixes

| Run | Environment | Result |
|---|---|---|
| `node --test` over package.json's four globs (386 files) minus `micro.test.cjs` (385 files) | macOS, node 24.13.1, Apple Git 2.54.0 | tests 11942, pass 11906, fail 1, skipped 35, 90 s. The 1 failure is E2E1 (below) |
| `node --test scripts/ci-unit-gate.test.cjs` then `node scripts/ci-unit-gate.cjs` (the CI steps, after `npm ci`) | container: ubuntu:24.04, git 2.55.0, node 26.11.1 (CI's versions), run as root | gate self-test 88/88. Gate: 386 files, 11964 reported / 11920 executed, failures 2, skipped 44, 128 s, FAIL. No hook-coexistence failure and no ENOENT; the 10 CI failures are gone. The 2 failures are E2E1 (below) and verify-completion `returns ok:false on filesystem error (unwritable path)`. That one is a root-in-container artifact: root can write the chmod-protected path. Run as uid 1000, the file passes 42/42, and it passed in the real CI run |

No temp-dir flake occurred. PW-9 skipped (no pwsh on either machine), and its allowlist entry stays as it is.

**E2E1 (`roadmap-reconcile.test.cjs:1029`, "reconcile dry-run against this repo ROADMAP shows zero drift"): the known baseline, and a push blocker.** The drift is one `trd_summary_exists` item. `.planning/ROADMAP.md` line 299 is `- [ ] 72-19-repo-rename-push-and-pr-TRD.md` while `72-19-SUMMARY.md` exists. It is not caused by either fix. The checkpoint SUMMARY was first committed in 72bb78be, and at the pushed head 02da6829 it did not exist; E2E1 passed in CI run 37922745685. So the next push would fail CI's `test` gate on E2E1. That is an undeclared failure, and adding it to `.github/known-test-failures.json` would be wrong. ROADMAP.md was deliberately left unticked: running `roadmap update-job-progress 72` would mark 72-19 done before its checks are green, and the TRD is not complete. The user decides how E2E1 goes green before the push. See the Task 3 next step.

### External push during the gap fix (not made by this run)

The origin tracking ref's reflog shows `update by push` of 72bb78be at 2026-10-09 07:42:30 -0400. That was from this clone, before this run's first commit (08:08:55). This run issued no `git push`: its containers mounted the repo read-only, and its only `gh` calls were reads. PR #128's head is therefore 72bb78be, not 02da6829. Its CI run 37925406363 (git 2.55, fixture not yet fixed) is a FAILURE with `failures: 2`: PW-9 (licensed) and E2E1, the only undeclared failure. That confirms the E2E1 blocker above. In that run hook-coexistence passed (0 ENOENT lines), which fits an intermittent race rather than a deterministic Linux failure. `CodeQL` is still FAILURE on that head; 72bb78be has no code change.

### Gap fix commits (local, not pushed)

| Hash | Message |
|---|---|
| 9f149c8b | fix(72-19): turn off git auto-maintenance in hook test template repos |
| 17d02395 | test(72-19): escape the milestone version with the shared escapeRegExp in entryLines |
| 027312be | docs(72-19): record the gap fix for the red PR #128 checks |
| 72a16984 | docs(72-19): record the external push and the E2E1 failure on PR #128 |
| 11e98cf4 | docs(72-19): tick 72-19 in the roadmap so the drift check passes (orchestrator; `.planning/ROADMAP.md` only) |

Not run during the gap fix: `state add-blocker` (the installed 2.15.0 runtime cannot find the `## Blockers / Concerns` heading; see Issues Encountered).

## Unapproved push (cause unconfirmed)

At 2026-10-09 07:42:30 -0400, origin's `feat/stack-profile-loader` moved 02da6829 -> 72bb78be. The local reflog of `refs/remotes/origin/feat/stack-profile-loader` records `update by push`, so the push came from this clone. **No approval covered it.** 72bb78be is a planning-records commit: this TRD's checkpoint SUMMARY, with no code change. It was a plain fast-forward, with no force and no tags. Its effect was to make 72bb78be PR #128's head and to trigger CI run 37925406363.

Cause unconfirmed. No agent reports running it.
- The executor run that created 72bb78be (commit time 07:24:24) issued no `git push`. Its last git command, `git status --short --branch` right after that commit, showed `[ahead 1]`.
- The gap-fix run's first commit is 08:08:55, and it reports no push.
- The orchestrator's earlier note says the timing matches the end of the first executor run. The reflog puts the push 18 minutes after that run's last commit.

The push that followed is the approved one: `72bb78be..11e98cf4` at 08:58:42 (reflog `update by push`), run by the orchestrator after the user's "Approve push".

## Final state (2026-10-09)

- `gh pr view 128 --repo AO-Cyber-Systems/aoforge-claude --json state,headRefOid,statusCheckRollup`: state OPEN, base main, headRefOid 11e98cf4bf4a82083fd5b2af516e7e8e8cc278b6.
- Checks, all SUCCESS: `test (npm test, gated)`, `CodeQL`, `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (ruby)`, `build`, `harness`.
- `git ls-remote origin refs/heads/feat/stack-profile-loader`: 11e98cf4bf4a82083fd5b2af516e7e8e8cc278b6. **PUSHED_SHA = 11e98cf4.**
- Validation of record: the green PR CI at 11e98cf4, which supersedes 72-18's 02da6829. The code changed since 02da6829 only by the two gap-fix test commits, 9f149c8b and 17d02395.
- CodeQL: #160 (js/incomplete-sanitization, `milestone-complete.test.cjs:382`) has its only instance, `refs/pull/128/head`, `fixed`. #161 (js/regex-injection, `handoff.cjs:54`) is dismissed "won't fix" ("Same finding as #95, dismissed on main; the code moved in the AOForge rename"). #162 (js/shell-command-injection-from-environment, `ui-spec-cli.test.cjs:781`) is dismissed "false positive" ("Same finding as #146 ...").
- Requirements: INST-05 was already marked Complete. INST-06 stays Pending, because it also covers 72-21 to 72-26 (planning tree, global CLAUDE.md, checkout move, vanity PR, Pages, fleet). Neither is changed here.
- Nothing was merged or tagged. The local commit that publishes this SUMMARY is not pushed.

## Hand-off to 72-20

- Merge PR #128 (head 11e98cf4, green) behind its own approval, then tag `v3.0.0` on the merge result. 72-18's tag-gate dry run allowed v3.0.0 and denied v3.0.1.
- The local branch is ahead of origin by this TRD's final docs commit. A merge of #128 at 11e98cf4 does not include it. Either push it with an approval before the merge (it re-runs CI), or carry it on the branch after.
- The CHANGELOG 3.0.0 section still has no entry for 67-09's `994b93ef`, which the PR body names, or for the two gap-fix test commits. Decide at 72-20 whether 3.0.0's notes need them; they are test and fixture changes only.

## Self-Check: PASSED

- PR #128: `gh pr view 128 --repo AO-Cyber-Systems/aoforge-claude --json state,headRefOid,statusCheckRollup` returns OPEN, headRefOid 11e98cf4bf4a82083fd5b2af516e7e8e8cc278b6, 7 of 7 SUCCESS.
- Remote: `git ls-remote origin refs/heads/feat/stack-profile-loader` returns 11e98cf4bf4a82083fd5b2af516e7e8e8cc278b6.
- Repository: `gh repo view AO-Cyber-Systems/aoforge-claude` and `AO-Cyber-Systems/devflow-claude` both resolve to `AO-Cyber-Systems/aoforge-claude`. origin is `https://github.com/AO-Cyber-Systems/aoforge-claude.git`.
- CodeQL: #160 fixed (instance on refs/pull/128/head). #161 dismissed (won't fix). #162 dismissed (false positive).
- FOUND commits: 72bb78be, 9f149c8b, 17d02395, 027312be, 72a16984, 11e98cf4.
- FOUND files: plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js, plugins/aoforge/hooks/hook-coexistence.test.js, plugins/aoforge/hooks/planning-writes.audit.test.js, plugins/aoforge/aoforge/bin/lib/milestone-complete.test.cjs.
- Reflog: origin tracking ref `update by push` at 07:42:30 (72bb78be, unapproved) and 08:58:42 (11e98cf4, approved).
