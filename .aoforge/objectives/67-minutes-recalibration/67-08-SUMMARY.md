---
objective: 67-minutes-recalibration
job: "08"
subsystem: release
tags: [release, v2.15.0, merge, tag, github-release, approval-gates, v1.6, EST-10]

requires:
  - objective: 67-minutes-recalibration
    provides: "67-07: release PR #127 at PUSHED_SHA bcd255b28af8de33cdcd369946e2668d4b03d3ce, 7 of 7 checks SUCCESS"

provides:
  - "release PR #127 MERGED into main by merge commit MERGE_SHA 2f01cd77f5ad70518302ad53e35f5478b704fd5d (parents 8295a169 and bcd255b2, tree identical to PUSHED_SHA)"
  - "annotated tag v2.15.0 on MERGE_SHA, locally and on origin"
  - "GitHub release v2.15.0, non-draft, created by release.yml, body = CHANGELOG 2.15.0 section"
  - "main-branch runs on MERGE_SHA recorded: Unit suite success, CodeQL success, Docs site failure (OPS-03, objective 74)"

affects: [67-09]

tech-stack:
  added: []
  patterns:
    - "two separate human-action approval gates (merge, tag), each recorded with the user's literal reply"

key-files:
  created: []
  modified: []

key-decisions:
  - "The Docs site failure on MERGE_SHA is recorded as an objective 74 (OPS-03) follow-up and not rolled back, as the TRD requires: it is the same Cloudflare `Project not found [code: 8000007]` that failed the 2.14.0 merge run, and the release content did not cause it."
  - "The CHANGELOG `## [2.15.0]` heading count at the merge commit was taken with `git grep -c` instead of piping `git show` into `rg -c`, to keep to one plain command per Bash call. It prints 1, the value the TRD expects."
  - "The branch was not pushed: local commit 807fbb16 (the 67-07 SUMMARY) stays unpublished until a separately approved push."

requirements-completed: []

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 15min
completed: 2026-10-08
tokens_input: 1921723
tokens_output: 17887
tokens_cache_read: 1785545
tokens_cache_write: 136124
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 08: Merge the release PR, tag v2.15.0, verify the GitHub release Summary

**Release PR #127 is merged into main as `2f01cd77`, the annotated tag `v2.15.0` sits on that commit locally and on origin, and release.yml published the non-draft GitHub release.** The merge and the tag were two separate approvals, each given as a literal reply, and nothing live ran before its approval.

## Result for 67-09

- **MAIN_BEFORE:** `8295a169fe108c3af2d76d2480d1c0f95c1f6dcf` (the 2.14.0 merge, unchanged since 67-06)
- **PUSHED_SHA:** `bcd255b28af8de33cdcd369946e2668d4b03d3ce`
- **MERGE_SHA:** `2f01cd77f5ad70518302ad53e35f5478b704fd5d` (`origin/main` and local `main` both equal it)
- **Tag:** `v2.15.0`, annotated, peels to MERGE_SHA locally and on origin
- **Release:** https://github.com/AO-Cyber-Systems/devflow-claude/releases/tag/v2.15.0 (non-draft, published 2026-10-08T15:09:16Z)
- **2.15.0 is on main and tagged.** The `aocyber` marketplace serves it now; 67-09 can run the plugin update.
- **Not pushed:** local commit `807fbb16` (the 67-07 SUMMARY) and the branch `feat/stack-profile-loader` are unpublished.

## Progress
- [x] Task 1: Approval gate: merge release PR #127 into main (merge commit) — no repo commit (live merge)
- [x] Task 2: Approval gate: annotated tag v2.15.0 on MERGE_SHA and push it — no repo commit (live tag)
- [x] Task 3: Verify the GitHub release, record the main-branch runs, fast-forward the local main ref — no repo commit (read-only plus a local ref update)

## Approvals (literal replies)

| Gate | Relayed reply | Action run once |
|---|---|---|
| Task 1: merge | `approved` | `gh pr merge 127 --repo AO-Cyber-Systems/devflow-claude --merge --subject "Merge #127: release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" --body "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)"` |
| Task 2: tag | `approved` | (1) `git -C /Users/justin/dev/devflow-claude tag -a v2.15.0 -m "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" 2f01cd77f5ad70518302ad53e35f5478b704fd5d`, then (2) `git -C /Users/justin/dev/devflow-claude push origin v2.15.0` |

The replies were relayed by the coordinator. The merge approval did not cover the tag: the tag checkpoint was presented separately with the exact commands and what they trigger.

## Task 1: merge

- **Pre-checks:** `gh pr view 127 --json state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,mergeCommit` returned `OPEN`, base `main`, head `feat/stack-profile-loader`, `headRefOid` `bcd255b28af8de33cdcd369946e2668d4b03d3ce` (equal to PUSHED_SHA), `MERGEABLE`, `CLEAN`, `mergeCommit: null`, and 7 of 7 checks SUCCESS. After `git fetch origin`, `origin/main` was `8295a169fe108c3af2d76d2480d1c0f95c1f6dcf`, the value 67-06 recorded, so no extra log was needed. It was not already merged, so the idempotency path did not apply.
- **Command:** the exact command in the table above, once, with no `--admin`, `--squash`, `--rebase`, `--delete-branch` or `--auto`. It printed nothing.
- **Verify:**
  - `gh pr view 127 --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'` printed `MERGED 2f01cd77f5ad70518302ad53e35f5478b704fd5d`.
  - After a fresh fetch (`8295a169..2f01cd77  main -> origin/main`), `git rev-parse origin/main` = `2f01cd77f5ad70518302ad53e35f5478b704fd5d`.
  - `git rev-parse MERGE_SHA^1` = `8295a169fe108c3af2d76d2480d1c0f95c1f6dcf` (MAIN_BEFORE); `git rev-parse MERGE_SHA^2` = `bcd255b28af8de33cdcd369946e2668d4b03d3ce` (PUSHED_SHA).
  - `git diff --stat bcd255b2 2f01cd77` printed nothing: the merge tree is identical to PUSHED_SHA's.

## Task 2: tag

- **Pre-checks:** `git ls-remote --tags origin v2.15.0 "v2.15.0^{}"` empty; `git tag -l v2.15.0` empty; the tag-gate dry run `printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.15.0 -m x 2f01cd77f5ad70518302ad53e35f5478b704fd5d"}}' | node plugins/devflow/hooks/changelog-on-tag.js` printed nothing; `git grep -c -E "^## \[2\.15\.0\]" 2f01cd77… -- CHANGELOG.md` counted 1.
- **Commands:** the two commands in the table above, each its own Bash call. The real changelog-on-tag hook fired on the first and allowed it (the call was not denied). No escape variable was used. The push printed `* [new tag]  v2.15.0 -> v2.15.0`.
- **Verify:**
  - `git cat-file -t v2.15.0` printed `tag` (annotated).
  - `git rev-parse "v2.15.0^{commit}"` = `2f01cd77f5ad70518302ad53e35f5478b704fd5d`.
  - `git for-each-ref --format="%(contents:subject)" refs/tags/v2.15.0` printed `Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)`.
  - `git ls-remote --tags origin "v2.15.0^{}"` printed `2f01cd77f5ad70518302ad53e35f5478b704fd5d	refs/tags/v2.15.0^{}`.

## Task 3: GitHub release and main-branch runs

**release.yml** (run 37798350283, event: tag push `v2.15.0`): `gh run watch --exit-status` finished `success`, job `release` in 13s (checkout, Create release, complete).

**Release** (`gh release view v2.15.0 --json name,tagName,isDraft,publishedAt,url`):
- name `Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)`, `tagName` `v2.15.0`, `isDraft` false, `publishedAt` 2026-10-08T15:09:16Z
- the body's first non-blank line is the CHANGELOG lead paragraph (`Milestone v1.6, objectives 66 and 67 (objective 65 shipped 2.14.0). Executor SUMMARYs stamp their own token usage: …`), followed by `### Added`, `### Changed` and `### Fixed`.

**Main-branch runs on MERGE_SHA** (`gh run list --branch main`):

| Workflow | Run | Conclusion | Notes |
|---|---|---|---|
| Unit suite | 37797973567 | success | `test (npm test, gated)` in 3m52s |
| CodeQL | 37797969820 | success | Analyze (ruby) 1m2s, Analyze (actions) 44s, Analyze (javascript-typescript) 4m17s |
| Docs site | 37797973574 | **failure** | see below |

**Docs site failure (objective 74 follow-up, not rolled back).** The `Deploy to Cloudflare Pages` step ran `npx --yes wrangler@4 pages deploy site/public --project-name=devflow-docs --branch=main --commit-dirty=true` and exited 1:

```
✘ [ERROR] A request to the Cloudflare API (/accounts/***/pages/projects/devflow-docs) failed.
  Project not found. The specified project name does not match any of your existing projects. [code: 8000007]
```

This is the open OPS-03 item owned by objective 74 (make the `devflow-docs` Pages project exist, or fix the account and token). It is the same error that failed the 2.14.0 merge run (37770895912, recorded in the 65-03 SUMMARY), and the release content did not cause it. The `build` check on the PR passed; only the deploy step fails.

**Local main:** `git fetch origin main:main` fast-forwarded `c83b5961..2f01cd77`, and `git rev-parse main` = `2f01cd77f5ad70518302ad53e35f5478b704fd5d`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: merge | `gh pr view 127 --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'` = `MERGED 2f01cd77…`; `git rev-parse origin/main` = MERGE_SHA; `MERGE_SHA^1` = `8295a169…`; `MERGE_SHA^2` = `bcd255b2…`; `git diff --stat bcd255b2 2f01cd77` empty | 0 | PASS |
| 2: tag | `git cat-file -t v2.15.0` = `tag`; `git rev-parse "v2.15.0^{commit}"` = MERGE_SHA; tag subject = release title; `git ls-remote --tags origin "v2.15.0^{}"` = MERGE_SHA | 0 | PASS |
| 3: release and runs | `gh run watch 37798350283 --exit-status` (success); `gh release view v2.15.0` (title, `isDraft` false); Unit suite and CodeQL success, Docs site failure recorded; `git rev-parse main` = MERGE_SHA | 0 | PASS |

## Performance

- **Duration:** 15min (wall clock, including the two approval waits)
- **Started:** 2026-10-08T14:59:52Z (successful preflight claim)
- **Completed:** 2026-10-08T15:15:00Z
- **Tasks:** 3
- **Files modified:** 0 in the repo (the SUMMARY and planning state go into the docs commit)

## Deviations from Plan

### Auto-fixed Issues

None. The TRD executed as written.

### Notes

- **One command substitution.** The TRD pipes `git show <MERGE_SHA>:CHANGELOG.md` into `rg -c`. I ran `git grep -c -E "^## \[2\.15\.0\]" <MERGE_SHA> -- CHANGELOG.md` instead, one plain command with the same count (1).
- **Local `main` was behind.** Before Task 3 the local `main` ref was `c83b5961`, not the 2.14.0 merge `8295a169`; the fast-forward moved it to MERGE_SHA with no refusal.
- **Observation, left alone.** The release body repeats the two overlapping lead paragraphs of `CHANGELOG.md` `## [2.15.0]` (noted in 67-07). Fixing it is a CHANGELOG commit and a new push approval, so it is untouched; the release body can be edited later with its own approval.
- **Docs failure** is recorded above as an objective 74 follow-up, as the TRD directs.

## Self-Check: PASSED

- PR #127 state `MERGED`, merge commit `2f01cd77f5ad70518302ad53e35f5478b704fd5d`: FOUND.
- `origin/main` = MERGE_SHA with parents `8295a169…` and `bcd255b2…`, tree equal to PUSHED_SHA's: FOUND.
- Annotated tag `v2.15.0` peels to MERGE_SHA locally and on origin: FOUND.
- release.yml run 37798350283 `success`; `gh release view v2.15.0` non-draft with the release title and the CHANGELOG body: FOUND.
- Unit suite, CodeQL and Docs site conclusions on MERGE_SHA recorded; Docs site failure logged for objective 74 (OPS-03): FOUND.
- Local `main` = MERGE_SHA: FOUND.
- No escape variable used; `807fbb16` and the branch not pushed: FOUND.
- Both approvals recorded with the literal replies (`approved`, `approved`): FOUND.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (two approvals recorded; merge commit with the expected parents and tree; tag gate allowed and tag on MERGE_SHA locally and on origin; release.yml success with a non-draft release whose body is the CHANGELOG section; main-branch runs recorded with the docs failure logged for objective 74)
- Gate failures: None in this TRD. The Docs site run on main failed outside the TRD's control (OPS-03).
