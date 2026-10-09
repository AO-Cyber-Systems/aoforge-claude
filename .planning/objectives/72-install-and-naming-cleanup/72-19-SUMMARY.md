---
objective: 72-install-and-naming-cleanup
trd: "19"
subsystem: release
tags: [release, rename, github, approval-gates]
requirements: [INST-05, INST-06]
---

# Objective 72 TRD 19: Repository rename, push and 3.0.0 release PR Summary

## Progress
- [x] Task 1: Approval gate: rename the GitHub repository to aoforge-claude: no commit (live GitHub op + local remote config only)
- [x] Task 2: Approval gate: push feat/stack-profile-loader: no commit (live push only); PUSHED_SHA 02da68293312e1812270259fde88668f72a9c848
- [ ] Task 3: Approval gate: open the 3.0.0 release PR, then wait for green checks: FAILED. PR #128 opened; `test (npm test, gated)` and `CodeQL` are red. next step: a gap TRD fixes the CI-only `plugins/aoforge/hooks/hook-coexistence.test.js` sync-runtime failure (reproduce with the node:26 Docker recipe in `.github/known-test-failures.json` `$environment`) and the `milestone-complete.test.cjs:382` escaping alert; the two re-flagged alerts (#95/#146 equivalents) are dismissed again on the PR; then a new push approval, then `gh pr checks 128 --repo AO-Cyber-Systems/aoforge-claude --watch` until green

## Approvals (literal replies)

| Gate | Reply | Action taken |
|---|---|---|
| 1. rename | "approved" (user's literal reply, relayed by the orchestrator) | `gh repo rename aoforge-claude --repo AO-Cyber-Systems/devflow-claude --yes` (run once, no output, exit 0); `git -C /Users/justin/dev/devflow-claude remote set-url origin https://github.com/AO-Cyber-Systems/aoforge-claude.git` |
| 2. push | "\approved" (user's literal reply, leading backslash; the orchestrator relayed it as a typo of "approved" and directed treating it as approval for Task 2 only) | `git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader` (run once): `bcd255b2..02da6829  feat/stack-profile-loader -> feat/stack-profile-loader` |
| 3. PR | "Bapproved" (user's literal reply, stray leading letter; the orchestrator relayed it as a typo of "approved" and directed treating it as approval for Task 3 only) | `gh pr create --repo AO-Cyber-Systems/aoforge-claude --base main --head feat/stack-profile-loader --title "Release 3.0.0: DevFlow is now AOForge" --body-file <72-19-PR-BODY.md draft>` (run once) -> https://github.com/AO-Cyber-Systems/aoforge-claude/pull/128 |

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
- Local (macOS, this checkout): `node --test plugins/aoforge/hooks/hook-coexistence.test.js` -> tests 227, pass 227, fail 0. The failure is Linux/CI-only. The test last changed in 72-04 (a15e2af5), 72-06 (e5f40291) and 72-10 (18594c35), so it is an objective 72 regression on the gate's environment (ubuntu-latest + node 26). `.github/known-test-failures.json` `$environment` gives the node:26 Docker reproduction recipe.

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
| 3: Release PR | `gh pr checks 128 --repo AO-Cyber-Systems/aoforge-claude --watch`; `gh pr view 128 --json state,baseRefName,headRefOid,statusCheckRollup` | 1 (2 of 7 checks FAILURE) | FAIL |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | not run locally (no code change in this TRD); CI `test (npm test, gated)` on PR #128 | 1 | FAIL |
| build | CI `build` on PR #128 | 0 | PASS |

## Deviations from Plan

- TRD text corrected in what was presented: Task 2's checkpoint wording said the push publishes "objective 72" and "runs CI on the branch". The 276 commits span objectives 67 (tail) to 72, and no workflow runs on a push to this branch; the checkpoint and the PR body said so instead.
- Two approvals were relayed with typos ("\approved", "Bapproved"); the orchestrator directed each be treated as approval for its own gate only. Recorded verbatim above.
- The 67-09 fix `994b93ef` has no CHANGELOG 3.0.0 entry; named in the PR body, not added to the CHANGELOG (would need a new commit and push approval).

## Issues Encountered

- `state add-blocker --text ...` on the installed 2.15.0 runtime returned `{"added": false, "reason": "Blockers section not found in STATE.md"}`: STATE.md's heading is `## Blockers / Concerns` (line 231), the spaced form that 67-09's `994b93ef` fixes on this branch but the installed runtime predates. The red-checks blocker is therefore recorded here and in the return to the orchestrator, not in STATE.md (no hand edit).

## Post-TRD Verification

- Auto-fix cycles used: 0 (the TRD forbids fixing here)
- Must-haves verified: 4/5. Rename with a recorded reply, new name resolves and old redirects; origin on the new URL; push after its own reply with PUSHED_SHA == validated head; no force, tags, merge or tag. NOT met: "its checks are green before the TRD completes".
- Gate failures: CI `test (npm test, gated)` (hook-coexistence sync-runtime, CI-only) and `CodeQL` (1 new test-code alert, 2 re-flagged dismissed alerts).
