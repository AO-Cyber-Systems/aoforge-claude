---
objective: 49-objective-branch-and-pr-lifecycle
trd: "13"
subsystem: workflow-prose
tags: [execute-objective, complete-milestone, pr-lifecycle, branching-strategy-deprecation, prose-contract, repo-test]
requires:
  - objective: 49-06
    provides: gh trd start (store-gated, queues a label write)
  - objective: 49-08
    provides: init pr_lifecycle, objective_branch, pr_number, branching_strategy_ignored, deprecations
  - objective: 49-09
    provides: gh pr start|sync|status
  - objective: 49-11
    provides: summary post / verification post drive the PR; objective complete defers the issue close
  - objective: 49-12
    provides: gh pr merge|reconcile
provides:
  - "execute-objective runs the store-mode lifecycle: gh pr start, gh trd start per spawn, gh pr sync once per wave, sync before verify, gh pr merge then reconcile"
  - "complete-milestone handle_branches is skipped when pr_lifecycle is true"
  - "settings.md and planning-config.md mark git.branching_strategy deprecated in store mode"
  - "pr-lifecycle-prose.repo.test.cjs pins the prose contract (21 tests)"
affects: [49-14, 49-15]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs
  modified:
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/complete-milestone.md
    - plugins/devflow/devflow/workflows/settings.md
    - plugins/devflow/devflow/references/planning-config.md
key-decisions:
  - "Branching is on init `pr_lifecycle` only; the new behaviour sits in labelled `If pr_lifecycle is true` blocks beside the untouched local text"
  - "The merge is offered through AskUserQuestion and never run without a yes; gh pr reconcile follows it, or runs later for a merge queue or a human merge on GitHub"
  - "gh pr sync failures do not stop a wave (the commits are local and safe) but they do gate verification: the verifier is not started until a sync exits 0"
  - "gh trd start exit 1 is a warning, not a stop: it only queues a label"
requirements-completed: [GPR-06, GPR-01, GPR-02, GPR-03, GPR-04]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: about 40 min
completed: 2026-10-01
---

# Objective 49 TRD 13: Workflow prose runs the PR lifecycle Summary

**In store mode execute-objective now drives one branch and one pull request per objective end to end (start, TRD in progress, one sync per wave, sync before verify, merge, reconcile), complete-milestone no longer merges branches locally, and `git.branching_strategy` is documented as deprecated in store mode; local mode reads as before plus a deprecation notice.**

## Accomplishments

- **initialize / handle_branching.** Parses `pr_lifecycle`, `objective_branch`, `pr_number`, `branching_strategy_ignored`, `deprecations`. When `pr_lifecycle` is true it runs `gh pr start "${OBJECTIVE_NUMBER}"` once before wave 1: exit 1 stops and reports (offline, tracked changes, an objective with no issue yet, a refused branch name), exit 3 is re-run, and `branching_strategy` is said to be ignored. When false it is the old step verbatim, preceded by printing each init `deprecations` entry.
- **execute_waves.** Step 0: the checkout `gh pr start` left is on `objective_branch`, so `HEAD` is the objective branch tip and is `WAVE_BASE` for every wave (sequential or parallel); a per-wave `git rev-parse --abbrev-ref HEAD` check stops on a mismatch. Item 4: `gh trd start {plan_id}` per TRD just before its `Task(...)` (exit 3 pending, exit 1 a warning; the executor and its prompt are unchanged). Item 5b: `df/exec-*` branches are never pushed and each is deleted locally with `git branch -d df/exec-{plan_id}` after its merge and worktree removal; then `gh pr sync` once per wave (every wave, a sequential one included) with exits 0/3/2/1 spelled out.
- **verify_objective_goal.** `gh pr sync` runs before the verifier (and before every gap-closure re-verify) so the status lands on the verified head; the verifier is not started until it exits 0. The verifier prompt now requires VERIFICATION frontmatter `status: passed|gaps_found|human_needed` (optional `score:`). `verification post` is named as the owner of the comment, status, ready and wiki diff, and prose calls none of them.
- **update_roadmap.** States that `objective complete` leaves the issue open with a deferred-close warning and that the objective issue closes on merge, not at verify. Offers `gh pr merge` (method `github.pr.merge_method`, default squash) with exits 0/3/2/1 and stderr warnings, then `gh pr reconcile` (after a merge queue or a human merge on GitHub; idempotent; exits 0/3/1). The "Auto-push to GitHub" step that `execute-objective-gh-sync.test.cjs` extracts is untouched.
- **complete-milestone `handle_branches`.** First paragraph skips the step when `pr_lifecycle` is true (each objective already merged through its PR; an open PR is reported, never merged here). The local text is unchanged under "If `pr_lifecycle` is false".
- **settings.md / planning-config.md.** `git.branching_strategy` is deprecated in store mode (the objective PR lifecycle replaces it), still honoured in local mode; `objective_branch_template` names the linked branch. planning-config.md also gets a store-mode paragraph at the top of `<branching_strategy_behavior>`. settings.md notes the Branching question has no effect in store mode.
- **`pr-lifecycle-prose.repo.test.cjs`** (21 tests, skipped outside a devflow checkout): the TRD's tests 1-8, including a real-process dispatch check for every `df-tools gh <sub> <verb>` the four files name (empty PATH and throwaway HOME, so neither gh nor git is reachable) and a non-vacuity check that the lifecycle verbs are named at all.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | `c7cb7d5b` | test(49-13): prose runs the objective PR lifecycle (14 of 21 failing) |
| 1 | GREEN | `628aa288` | docs(49-13): execute-objective drives the objective PR in store mode |
| 2 | GREEN | `ec18d0af` | docs(49-13): branching_strategy is replaced by the objective PR in store mode |

## Deviations from Plan

**1. [Test layout] One RED commit covers both tasks.** The TRD asks for the full repo test (tests 1-8) as the Task 1 RED, so tests 5 and 6, which belong to Task 2, were written and committed in `c7cb7d5b` and stayed red through Task 1's GREEN (3 failing) until Task 2's commit. There is no separate Task 2 RED commit.

**2. [Rule 3 - Blocking] `dispatch-completeness.test.cjs` does not scan these files.** It only reads CLAUDE.md and context-discipline.md, so it could not guard the workflow prose. Test 7 therefore carries its own dispatch check: top-level `gh` names come from the dispatcher's `case 'gh'` block, and `pr` / `trd` / `outbox` verbs are run for real (verb only, no objective argument) and must not print `Unknown gh <sub> subcommand`. Test 8 runs `scanWrites` on the two workflows directly; the full planning-writes, doc-refs and dispatch-completeness suites were run as well.

**3. [Rule 1 - Bug] The planning-writes audit misread one sentence.** "once per TRD keeps pushes and PR writes low" matched the write-verb regex (it saw a TRD being written). Reworded to "once per wave, not after every executor, keeps the number of pushes and PR updates low". No marker needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: repo test + execute-objective prose | `node --test .../pr-lifecycle-prose.repo.test.cjs .../planning-writes.repo.test.cjs .../execute-objective-gh-sync.test.cjs` | 0 for the guards; prose test 38/41 pass with only Task 2's tests 5, 6a, 6b red, as planned | PASS |
| 2: complete-milestone, settings, planning-config | `node --test` the prose test, planning-writes, doc-refs, dispatch-completeness, execute-objective-gh-sync | 0 (62 tests, 62 pass) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs` | 0 (21 tests, 21 pass) | PASS |
| regression | planning-writes, doc-refs, dispatch-completeness, execute-objective-gh-sync | 0 (within the 62-test run above) | PASS |
| all repo guards | `node --test plugins/devflow/devflow/bin/lib/*.repo.test.cjs` | 0 (58 tests, 58 pass) | PASS |
| other readers of the edited prose | `executor-isolation.test.cjs`, `skill-route.test.cjs` | 0 (90 tests, 90 pass) | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED | `node --test .../pr-lifecycle-prose.repo.test.cjs` | 21 tests, 7 pass, 14 fail (tests 1a-1c, 2a-2c, 3a, 3b, 4a, 4b, 5, 6a, 6b, 7b) | FAIL (correct) |
| GREEN (Task 1) | same | 38 of 41 with the two guard files; the 3 failures are Task 2's tests 5, 6a, 6b | PASS for tests 1-4, 7 |
| GREEN (Task 2) | same plus audits | 62 of 62 | PASS (correct) |

The seven RED passes are the controls: 3c, 4c (the untouched sync step), 7a (sensitivity), 7c, 7d and test 8 for each workflow.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one wording fix for the audit false positive, deviation 3)
- Must-haves verified: 7/7 (each pinned by a test above)
- Gate failures: None
- Not run: the full `npm test` (instructed to skip), and no real PR or GitHub call was made.

## Notes for 49-15

- Prose now names these commands, all verified to dispatch: `gh pr start|sync|merge|reconcile`, `gh trd start`, `gh sync`. `gh pr status` is not named anywhere in the four files.
- `git.branching_strategy` appears in no other `.md` under `plugins/devflow` besides these four files, so there is no further prose to retire. Docs (USER-GUIDE, CLAUDE.md, CHANGELOG) were not touched by this TRD.
- `transition.md` and the auto-advance chain were not edited (not owned). The new `update_roadmap` text warns that a dependent objective starts from the default branch, so an auto-advance chain that skips the merge builds the next objective without this one. 49-15 may want to say so in the user guide, or have transition gate on a merged PR.
- The merge is only ever offered (AskUserQuestion), never automatic. If a later TRD wants an autonomous-mode merge, it must change `update_roadmap` and the test 4 assertions together.
- Test 7 is a template for any later prose that names `df-tools gh ...`: add the file to `FILES` in `pr-lifecycle-prose.repo.test.cjs`.

## Self-Check: PASSED

Created and present: `plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs`. Commits `c7cb7d5b`, `628aa288` and `ec18d0af` are in `git log ee8150e2..HEAD` on `df/exec-49-13`.
