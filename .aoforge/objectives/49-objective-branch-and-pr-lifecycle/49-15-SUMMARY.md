---
objective: 49-objective-branch-and-pr-lifecycle
trd: "15"
subsystem: github-store
tags: [docs, changelog, user-guide, proposal, full-suite, gh-pr, scope-gate]

requires:
  - objective: 49-13
    provides: workflow prose for the PR lifecycle (merge offered, never automatic)
  - objective: 49-14
    provides: end-to-end proof of the lifecycle and store-off parity
provides:
  - "CLAUDE.md GitHub-integration bullet extended for gh pr / gh trd confirm-scope|start / Refs #N / prs map / close-on-merge"
  - "CHANGELOG [Unreleased] objective 49 entry (Added, Changed, Fixed, Deprecated)"
  - "USER-GUIDE: One branch and one pull request per objective, merge_method and app_login config rows, branching_strategy deprecation"
  - "Proposal status block and Planning refinements (objective 49)"
affects: [objective-50]

tech-stack:
  added: []
  patterns:
    - "dispatch-completeness reads every backtick span in a CLAUDE.md Core Tool bullet: a bare lowercase single-word span (skipped, start, prs) is read as a df-tools command, so write `gh pr start`, `mapping.prs`, or plain prose"

key-files:
  created: []
  modified:
    - CLAUDE.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-github-system-of-record.md
    - plugins/devflow/skills/gh-sync/SKILL.md

key-decisions:
  - "CHANGELOG entries sit under the existing [Unreleased] Added, Changed, Fixed and Deprecated headings, not a second set of headings"
  - "gh-sync SKILL.md already describes store-mode verbs (gh trd, gh outbox), so it gets one sentence pointing at the gh pr verbs; no other skill text changed"
  - "The proposal's Decisions table and its Branch and PR lifecycle table are untouched; the refinements list records that verification is a commit status locally"

metrics:
  duration: "6min"
  completed: 2026-10-01
  tasks: 2
  files: 5
  tests-added: "none (docs only; the three audits plus the full suite are the tests)"
tokens_input: 4214639
tokens_output: 28334
tokens_cache_read: 4121407
tokens_cache_write: 93140
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 15: Documentation and the full suite Summary

The objective branch and PR lifecycle is now documented for maintainers (CLAUDE.md, CHANGELOG) and users (USER-GUIDE), objective 49's decisions are on record in the proposal, and the full suite is green except one test that depends on a locally installed `doctl` and is unrelated to objective 49.

## Performance

- Tasks: 2 of 2 (task 2 produced no file changes, so it has no commit)
- Commits: 1

## Accomplishments

- CLAUDE.md: the GitHub-integration bullet now covers `gh pr start|sync|status|merge|reconcile`, `gh trd confirm-scope|start`, the `Refs #N` paragraph, `mapping.prs`, the commit status `devflow/verification`, the merge method and queue (exit 3), reconcile, close-on-merge and the `branching_strategy` retirement. No new section; the resident-size note moved from ~27K to ~28K characters.
- CHANGELOG: one objective 49 entry under Added, plus Changed (execute-objective and complete-milestone behaviour, the auto-advance caveat), Fixed (early close of the objective issue) and Deprecated (`git.branching_strategy`).
- USER-GUIDE: new subsection under Store mode walking start, TRDs, scope confirmation, verify (commit status, why not a check run), merge (exit table, queue), reconcile, status; config rows for `github.pr.merge_method` and `github.app_login`; the Git Branching section says the strategy no longer applies in store mode; the sync table notes nothing closes at verify in store mode and lists the `gh pr` verbs.
- Proposal: status block says objective 49 is implemented; "Planning refinements (objective 49)" lists decisions 1-8, the `Refs #N` note, the scope-acceptance rule and the unverified live-API point (merge-queue probe via `PullRequest.isInMergeQueue` and `Repository.mergeQueue(branch:)`).
- gh-sync SKILL.md: scope covers store-mode verbs already, so one sentence now points at the `gh pr` verbs and `gh pr status`.

## Task Commits

| Task | Name | Commit |
|---|---|---|
| 1 | CLAUDE.md, CHANGELOG, USER-GUIDE, proposal, gh-sync skill | `30646012` |
| 2 | Full suite (SC4) | none (no changes) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: docs | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 (31 tests, 31 pass) before and after | PASS |
| 2: full suite | `npm test` | 1 (7885 tests, 7852 pass, 1 fail, 32 skipped) | PASS for objective 49; the one failure is pre-existing and environmental (below) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | doc-refs + dispatch-completeness audits | 0 | PASS |
| regression | `npm test` | 1 | One environmental failure, MA-7; 7852 pass |

## Full suite (SC4)

`npm test`: tests 7885, suites 1250, pass 7852, fail 1, cancelled 0, skipped 32, todo 0.

The one failure is `handoff-e2e.test.cjs` MA-7 "doctl auth init with unset DIGITALOCEAN_TOKEN". It re-fails identically when run alone. The test runs the real `doctl` (`/opt/homebrew/bin/doctl` is installed on this machine; the test skips when `doctl` is absent) and expects `doctl auth init` to fail without a token; here it exits 0 with `status: done`. Objective 49 touched no handoff, daemon, PTY, secret or doctl file: `git diff --name-only 47976835~1 HEAD` (from the first objective 49 commit) matches none of them, and the test file and its libraries are unchanged since `3e5ce435`. Not fixed here (unrelated to objective 49). The test could be made hermetic by stubbing `doctl` on PATH instead of depending on the host.

## Deviations from Plan

None - TRD executed as written. One implementation note, not a deviation: the first CLAUDE.md draft failed `dispatch-completeness` test 5 (`skipped`, `start`, `prs` read as commands). The bare backtick spans were reworded and the audit went green before the commit.

## Deferred Items

- `agents/verifier.md` (Sync Gaps to GitHub, store branch) says the issue closes "when the orchestrator runs `objective set-status <id> complete`". That is true only once the PR has `merged_at` (49-11); the sentence could say "after the PR merges". Not owned by this TRD and not wrong enough to fail an audit.
- The proposal's own "Branch and PR lifecycle" table still reads "Check run green" for verify pass. Left as written (the TRD forbids touching the decisions); the refinements list states the local mechanism is a commit status.
- MA-7 hermeticity (above).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (bullet in CLAUDE.md and `grep -n "gh pr" CLAUDE.md` shows it; CHANGELOG entry; USER-GUIDE section; proposal status block; gh-sync decision recorded; three audits green; SC4 recorded above)
- Gate failures: none caused by objective 49

## Self-Check: PASSED

- FOUND: CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/skills/gh-sync/SKILL.md (all modified)
- FOUND commit `30646012` on `feat/stack-profile-loader`
