---
objective: 55-store-live-smoke-fixes
trd: "08"
subsystem: docs
tags: [docs, changelog, store-mode, gh-setup, merge-queue]

requires:
  - objective: 55-store-live-smoke-fixes
    provides: "55-01..55-07 fixes and the live results of 55-06 and 55-07"
provides:
  - "USER-GUIDE store-mode docs that match the fixed and live-verified behaviour"
  - "CHANGELOG [Unreleased] ### Fixed entries for items 55-1..55-6"
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - docs/USER-GUIDE.md
    - CHANGELOG.md
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/devflow/workflows/execute-objective.md

key-decisions:
  - "The SUMMARYs win over the TRD wording: the merge refusal order (draft check first) and the live ids are documented as shipped"
  - "Gaps that would need a code change are listed under Known issues, not described away in prose"

requirements-completed: ["55-1", "55-2", "55-3", "55-4", "55-5", "55-6"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 30min
completed: 2026-10-05
---

# Objective 55 TRD 08: docs and changelog Summary

**USER-GUIDE, the gh-sync skill and the execute-objective workflow now describe the store-mode fixes as the 2026-10-05 smoke and its re-run proved them (admin-bypass merge with `gh pr merge <n> --admin --squash`, the `gh pr sync` refusals in their real order, the merge queue run, content-aware reconcile), and CHANGELOG [Unreleased] carries one Fixed entry per item 55-1..55-6. No code changed.**

## Progress
- [x] Task 1: USER-GUIDE, gh-sync skill and execute-objective prose — 7351855d
- [x] Task 2: CHANGELOG [Unreleased] and the full-suite gate — d87b5ffe

## What changed

**docs/USER-GUIDE.md** (extended existing store-mode subsections; no new top-level section; CLAUDE.md untouched):
- **Migration step 6** and **Enforcement and setup**: the "one-time admin bypass" and "an administrator may need to bypass" wording is gone. The ruleset bullet lists the repository-admin bypass (`bypass_mode: always`); the union paragraph says the union adds it when missing and never changes an existing admin entry's mode.
- New run-in paragraphs under **Committing the written files**: **Opening the workflow pull request** (the `gh pr create --base main --head devflow-setup ...` step the printed commit steps lack, and deleting a leftover local `devflow-setup` branch before `git switch -c devflow-setup`), **Merging the workflow pull request** (GitHub CLI's own `gh pr merge <number> --admin --squash`, distinct from `df-tools gh pr merge`; PR #6 live), **Picking up a fixed checks workflow** (upgrade the plugin, `gh setup` plans `[update]` `refresh the managed DevFlow checks workflow`, `--apply`, merge; `github.checks_workflow` ending in `@<ref>` pins `devflow-ref` to the same ref; how to read the pinned lines because the dry run does not print them). The `github.checks_workflow` config row says `devflow-ref` follows the same `@ref`.
- **Verify** and **Merge**: the unpushed refusal (exit 1, names `df-tools gh pr sync <objective>`, exact live text), the real check order (draft check first, so a draft PR gets `PR is still a draft; run verification first`; only a ready PR gets the unpushed refusal), and the exit table row.
- **Reconcile**: a branch whose changes are already on the default branch is deleted even when it is not an ancestor (squash); read-only `git merge-tree`, git 2.38+; unknown, unpushed and conflicting branches are kept; live `kept: []`.
- **The outbox**: the next `flush` retries a blocked wiki push once, so `resolve --overwrite` is not needed; a wiki still empty halts again after one attempt.
- New **An objective the verbs do not know** paragraph: the `objective add` hint text; `objective add` in store mode titles the issue after the description and writes the store footer.
- **Known behaviour** (migration): a from-scratch store project gets `state.json` and the version stamp from `upgrade --apply` (the SessionStart hook also runs it); a one-command bootstrap in `new-project` is deferred, with its reason.
- **Not yet verified on a real repository** replaced by **Verified on a real repository**: ruleset plus admin-bypass merge, real verdicts through `workflow_call` with 0 `ENOENT`, merge_group run 37310333089 (success, merge commit `34ba818e`), reconcile `kept: []`. Still not verified live: the issue-field option shape, and the wiki first-page retry (test only; the smoke wiki already had its first page).
- **Known issues**: dry run does not print the pinned `uses:`/`devflow-ref:` lines; printed steps give no PR-open command and assume no local `devflow-setup` branch; the draft-PR merge refusal does not name `gh pr sync`; the PR title keeps the slug while the issue title uses the name, and existing issues are not renamed.

**plugins/devflow/skills/gh-sync/SKILL.md** step 6: names the PR-open step, the leftover-branch trap, the admin-bypass merge command (GitHub CLI, not the df-tools verb) and how to read the pinned lines.

**plugins/devflow/devflow/workflows/execute-objective.md**: the sync-before-verify paragraph, the re-verify step and the merge exit-1 list carry the unpushed refusal, its remedy and the draft-check-first order.

**CHANGELOG.md** `[Unreleased]` `### Fixed`: six bullets (55-1 admin bypass and guidance; 55-4 checks sparse checkout and `devflow-ref` pin; 55-5 unpushed refusal; 55-3 wiki retry; 55-2 `objective add` hint; 55-6 issue title, store footer, content-aware reconcile). No version bump, no tag.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: USER-GUIDE, skill, workflow | `rg -n "may need to bypass\|Not yet verified on a real repository" docs/USER-GUIDE.md plugins/devflow` | 0 (only 3 `doesNotMatch(/may need to bypass/)` assertions in `gh-setup-cli.test.cjs`; no prose) | PASS |
| 1: repo guards | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 (24 pass, 0 fail) | PASS |
| 1: rg flag guard | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` | 0 (16 pass, 0 fail) | PASS |
| 2: changelog | `node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased` | 0 (`present: true`) | PASS |
| 2: full suite | `npm test` | 1 (9165 tests: 9132 pass, 1 fail, 32 skipped) | PASS: the one failure is MA-7 (doctl), the accepted one |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | 9165 tests, 9132 pass, 1 fail (MA-7 only), 32 skipped, 0 cancelled |

## Deviations from Plan

### Auto-fixed Issues

None needing a fix. Notes:

**1. [Transient, not a defect] E2E1 failed on the first `npm test`**
- **Found during:** Task 2, first full run (9165 tests: 9131 pass, 2 fail, 32 skipped).
- **Issue:** `roadmap-reconcile.test.cjs` E2E1 (reconcile dry-run against this repo's ROADMAP shows zero drift) flagged `55-08` as `[ ]` while its checkpoint SUMMARY already existed.
- **Resolution:** `roadmap update-job-progress 55` ticked the 55-08 checkbox and set the objective row to 8/8 Complete. The second full run had only MA-7 failing. This ran before `summary post` because the final counts had to be in the published SUMMARY.

### Observations and gaps (no code changed, as the TRD requires)

- **Verification line is not literally empty.** `rg -n "may need to bypass|Not yet verified on a real repository" docs/USER-GUIDE.md plugins/devflow` matches three lines in `plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs` (55-01 regression assertions `doesNotMatch(r.stdout, /may need to bypass/)`). Those assert the phrase is absent from output. No prose or code emits it.
- **Gap, `gh setup` dry run:** it prints the workflow's line count, not the pinned `uses:` and `devflow-ref:` lines (55-06). Documented how to read them after `--apply`; listed under Known issues.
- **Gap, printed commit steps:** they stop at "then open a pull request for that branch" and assume no local `devflow-setup` branch (55-06). Documented the `gh pr create` step and the delete-first rule; listed under Known issues.
- **Gap, draft merge refusal:** `gh pr merge` on a draft PR with unpushed commits names verification, not `gh pr sync`, because the draft check runs first (55-07; test 3d pins it). Documented the real order; listed under Known issues.
- **Gap, PR title:** the objective PR title keeps the directory slug while the issue title uses the name (55-07 observation). Listed under Known issues.
- **Stale wording left in code (not changed):** `plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs:87` still prints "merge its workflow pull request with a one-time admin bypass". It is not wrong, but it does not name the command. `docs/PROPOSAL-github-system-of-record.md:131` carries the same phrase and is a historical proposal. A one-line follow-up for the owner of 0011.
- **Issue-field option shape:** neither live run exercised it, so USER-GUIDE lists it as not yet verified live.
- **Wiki first-page retry (55-3):** documented as covered by a test only; the smoke wiki already had its first page (55-07).
- The printed commit step names `~/.claude/devflow/bin/df-tools.cjs`, which is the home mirror (2.12.0 on the smoke machine). Not documented as a user concern, per the TRD anti-pattern.

## Discovered commands

None. All commands came from the TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - USER-GUIDE says the setup ruleset grants repository admins a bypass and gives `gh pr merge <number> --admin --squash` as used live (PR #6); no sentence says an admin may need to bypass.
  - USER-GUIDE says how an existing store repository picks up a fixed checks workflow and that `checks_workflow@<ref>` pins `devflow-ref`.
  - USER-GUIDE documents the unpushed refusal (verification and merge, naming `gh pr sync`), the wiki retry, the `objective add` hint, content-aware reconcile and `upgrade --apply` as the fresh-store bootstrap; the "Not yet verified" paragraph is replaced.
  - The deferred automatic store bootstrap is in Known behaviour with its reason.
  - CHANGELOG has a Fixed entry per item 55-1..55-6; doc-refs, planning-writes and rg-flag-guard tests pass; `npm test` fails only on MA-7.
- Gate failures: None beyond the accepted MA-7.

## Self-Check: PASSED

- FOUND: `docs/USER-GUIDE.md`, `CHANGELOG.md`, `plugins/devflow/skills/gh-sync/SKILL.md`, `plugins/devflow/devflow/workflows/execute-objective.md` (all modified, in `git show --stat` of the two task commits)
- FOUND: commits 7351855d (Task 1) and d87b5ffe (Task 2)
- FOUND: `rg -n "gh pr sync" docs/USER-GUIDE.md` shows 12 matches, including the Verify paragraph, the Merge paragraph with its exit table row and the Known issues entry
- `npm test`: 9165 tests, 9132 pass, 1 fail (MA-7), 32 skipped
