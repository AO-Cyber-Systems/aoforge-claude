---
objective: 53-worktree-and-health-hygiene
trd: "04"
subsystem: gate-commits
tags: [gate-commits, merge, execute-objective, complete-milestone, workstreams-merge, squash, MERGE_HEAD, replay-test]

requires:
  - objective: 53-worktree-and-health-hygiene
    provides: "53-01: SUMMARYs travel with the wave merges, so the 5b merge no longer collides with a main-checkout SUMMARY copy and the wave-merge prose is stable for 53-04 to edit"
  - objective: 44-gate-correctness
    provides: "allTargetsMidOperation (MERGE_HEAD / rebase-* / CHERRY_PICK_HEAD) and the inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix"
provides:
  - "gate-commits.chainsGitOpAndCommit(cmd) and CHAINED_MERGE_HINT: a merge-like git op chained before a git commit keeps its deny, and the reason now names the separate-call form"
  - "execute-objective 5b documents the wave merge one command per call, with a planning-file conflict path (take ours, add, git commit --no-edit) and a roadmap/state refresh"
  - "complete-milestone and workstreams-merge document each merge step as its own call; squash completions carry the inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix"
  - "gate-commits-merge-sequence.test.js: the documented sequence replayed through the hook in a real scratch repo, plus a prose guard over three workflows"
affects: [53-07-docs-and-full-suite, execute-objective, complete-milestone, workstreams-merge]

tech-stack:
  added: []
  patterns:
    - "Gate allow/deny DECISIONS are never widened to fix a doc; the prose changes and a replay test pins the prose to the gate"
    - "Shared git-invocation parsing (gitInvocations) behind commitInvocations and chainsGitOpAndCommit, so the guard and the gate parse alike"

key-files:
  created:
    - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
  modified:
    - plugins/devflow/hooks/gate-commits.js
    - plugins/devflow/hooks/gate-commits.test.js
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/complete-milestone.md
    - plugins/devflow/devflow/workflows/workstreams-merge.md

key-decisions:
  - "53-04: gate-commits keeps denying a merge chained with a raw git commit; only the deny reason gains a hint (CHAINED_MERGE_HINT). A no-op merge creates no MERGE_HEAD, so a commit chained after a merge cannot be predicted safe from the command text"
  - "53-04: a squash completion uses the inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix, not SQUASH_MSG detection: git can leave SQUASH_MSG behind after an aborted squash, so detecting it would be a standing bypass"
  - "53-04: a wave-merge conflict confined to STATE.md, ROADMAP.md and REQUIREMENTS.md is resolved by taking ours; STATE.md keeps the integration copy, ROADMAP is recomputed by roadmap update-job-progress, STATE progress by state update-progress"

requirements-completed: ["53-4"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-04
tokens_input: 9364683
tokens_output: 69038
tokens_cache_read: 9220185
tokens_cache_write: 144350
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 53 TRD 04: The documented merge sequence passes gate-commits

**gate-commits still refuses a merge chained with a raw `git commit`, but now says to run them as separate calls; execute-objective, complete-milestone and workstreams-merge document every merge step as its own call, and a replay test runs the execute-objective sequence (clean, planning-file conflict, abort) through the hook in a real scratch repo.**

## Progress
- [x] Task 1 RED: failing tests for chainsGitOpAndCommit and the explained deny — 54315d36
- [x] Task 1 GREEN: chainsGitOpAndCommit + CHAINED_MERGE_HINT appended to the final deny; decisions unchanged — 5fb2dad5
- [x] Task 2 RED: replay of execute-objective's Branch merge protocol through the hook in a scratch repo, plus the execute-objective prose guard — 7652cbaa
- [x] Task 2 GREEN: Branch merge protocol rewritten one command per call, with the planning-file conflict path — 124bf39b
- [x] Task 3 RED: prose guard extended to complete-milestone.md and workstreams-merge.md (chain, squash prefix, MERGE_HEAD reason, no-commit completion) — 3f01121c
- [x] Task 3 GREEN: complete-milestone merge blocks rewritten as per-branch single-command steps; squash completions carry the inline prefix; workstreams-merge step 4 likewise — fafa56b3
- [x] Finalize: SUMMARY, state updates and docs commit — (this commit)

## What changed

- **gate-commits.js.** `commitInvocations` is now a filter over a new `gitInvocations(cmd)` (same heredoc strip, quote mask and `&& || ; & | ( )` newline segmentation, now also reporting each invocation's subcommand and segment). `chainsGitOpAndCommit(cmd)` is true when a `merge | cherry-pick | revert | rebase | am` invocation precedes a `git commit` in a later simple command. `run()` changed in one place: the final `deny` appends `CHAINED_MERGE_HINT` when the predicate is true. Every allow path (df-tools commit, inline prefix, MERGE_HEAD / rebase / cherry-pick in progress, non-DevFlow repo) is untouched, and so is the exact base text for a plain commit.
- **execute-objective.md, 5b.** "Branch merge protocol" now reads: merge as its own call; a clean merge needs nothing more; on a conflict, `git diff --name-only --diff-filter=U`; if EVERY path is STATE.md, ROADMAP.md or REQUIREMENTS.md, `git checkout --ours -- <path>` and `git add <path>` per path (separate calls), then `git commit --no-edit` as its own call (allowed by MERGE_HEAD); any other path means `git merge --abort` and the existing planning-error route. After the wave, `state update-progress`, `roadmap update-job-progress "${OBJECTIVE_NUMBER}"` and a `df-tools commit` of ROADMAP.md and STATE.md. `requirements mark-complete <ids>` is named for a conflicted REQUIREMENTS.md. 53-01's text (worktree_protocol, 5b intro, SUMMARY paragraph, 5c) and the `git branch -d` / once-per-wave `gh pr sync` strings are unchanged. An HTML anchor, `<!-- merge-sequence:end -->`, bounds the section for the test.
- **complete-milestone.md.** The squash and merge-with-history blocks (loops, chained merge and commit) are six numbered single-command steps each. The squash commit is `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "feat: <branch> for v[X.Y]"` with the reason (a squash leaves no MERGE_HEAD, only SQUASH_MSG); the `--no-ff --no-commit` completion is a plain `git commit` on its own call.
- **workstreams-merge.md, step 4.** The commit carries the inline prefix and the same one-sentence reason.
- **Tests.** `gate-commits.test.js` gained the `chainsGitOpAndCommit` unit table and the e2e deny-reason cases. `gate-commits-merge-sequence.test.js` (new) extracts the 5b commands from the markdown, feeds each to the hook spawned with `cwd` set to a scratch repo (inherited `DEVFLOW_ALLOW_RAW_COMMIT` deleted), asserts no deny, then runs it for real. Cases: clean merge, STATE.md conflict, all three planning files conflicting, a code-file conflict (abort), a code-plus-planning conflict (abort), the documented order, and a control that the improvised chained forms are still denied with the hint. The prose guard covers the three workflows: no fence chains a merge-like op with a commit, a bare `git commit` after a squash must carry the prefix, and a no-commit merge is completed by a plain commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A prose sentence tripped the planning-writes audit**
- **Found during:** Task 2 GREEN verify
- **Issue:** `pr-lifecycle-prose.repo.test.cjs` test 8 flagged "every executor updates `.planning/STATE.md`" in execute-objective.md as a direct planning-write instruction.
- **Fix:** reworded to "every executor touches"; the sentence is a description, not an instruction.
- **Files modified:** plugins/devflow/devflow/workflows/execute-objective.md
- **Commit:** 124bf39b

### Notes (not behaviour deviations)

- **No existing test pinned the DENY_MESSAGE bytes for a chained merge+commit**, so no existing gate-commits case was changed. The existing case 10 pins the plain-commit text, and it still passes untouched (the hint is appended only for the chained form).
- **`commitInvocations` was refactored** into a filter over `gitInvocations` so the new predicate reuses the segmentation (the TRD asked for reuse). Every 44-03 and 27-04 case passes unchanged.
- **Task 2 RED failed more broadly than "no conflict path".** The extractor bounds the section at the next bold paragraph, so before the GREEN edit it also picked up the unrelated `git worktree remove <worktree_path>` fence, and the strict replay rejects an unknown command. The clean and abort cases therefore failed for that reason, the conflict cases for the missing list/ours/add/complete commands. GREEN added the `<!-- merge-sequence:end -->` anchor (the TRD's sanctioned fallback), which fixes both.
- **Follow-up, not done (outside the TRD's three-file list).** Executors also write `.planning/STATE_ARCHIVE.md` (`state record-metric`, `add-decision`) and `.planning/state.json` (`state update-progress`). If peers in one wave conflict on those, the documented rule sends the orchestrator down the abort path. If that shows up in practice, extend the planning-only list.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: explained deny | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs` | 0 (117 pass, 0 fail) | PASS |
| 2: execute-objective sequence | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 0 (43 pass, 0 fail) | PASS |
| 3: complete-milestone and workstreams-merge | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 (44 pass, 0 fail) | PASS |
| All | the six test files above plus `pr-lifecycle-prose.repo.test.cjs` | 0 (182 pass, 0 fail) | PASS |

Extra, beyond the verify lines: `planning-writes.audit.test.js`, `changelog-on-tag.test.js`, `execute-objective-gh-sync`, `executor-isolation`, `df-tools-deprecations.repo`, `agent-shell-harness`, `skill-route`, `planning-writes.repo` (all pass).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED, task 1 (54315d36) | `node --test plugins/devflow/hooks/gate-commits.test.js` | 1 | FAIL (correct): 22 of 110 fail; `chainsGitOpAndCommit` is not a function, the deny reason has no hint |
| GREEN, task 1 (5fb2dad5) | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs` | 0 | PASS (correct), 117/117 |
| RED, task 2 (7652cbaa) | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js` | 1 | FAIL (correct): 6 of 8 fail; no documented list/ours/add/complete commands, and the unbounded section holds `git worktree remove` |
| GREEN, task 2 (124bf39b) | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 0 | PASS (correct), 43/43 |
| RED, task 3 (3f01121c) | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js` | 1 | FAIL (correct): 6 of 16 fail; complete-milestone's chained loops, bare squash commits, no MERGE_HEAD explanation |
| GREEN, task 3 (fafa56b3) | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (correct), 44/44 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 1) | scoped `node --test` on the task's verify files | 0 | PASS |
| test (task 2) | scoped `node --test` on the task's verify files | 0 | PASS |
| test (task 3) | scoped `node --test` on the task's verify files | 0 | PASS |
| test (objective) | `npm test` | not run | not_available: runs once in 53-07 per the TRD |

## Must-haves

1. Gate protection unchanged, chained merge+commit still denied: unit table plus e2e cases in gate-commits.test.js, and the control case in the replay file (PASS)
2. The denial explains itself (separate calls, `git commit --no-edit` allowed once MERGE_HEAD exists): e2e test 4 (PASS)
3. execute-objective documents one command per call with a planning-only conflict path, the roadmap refresh, and the abort for any other path: the documented-order test and the prose (PASS)
4. Replay in a real scratch DevFlow repo: clean, STATE.md conflict, three-file conflict, two abort variants, every command through the hook with no deny and the merge completing with two parents and an empty `git status --porcelain` (PASS)
5. complete-milestone and workstreams-merge: no chained merge-and-commit, squash completions carry the inline prefix, no-commit completion is a plain commit: the three-workflow prose guard (PASS)

## Discovered commands

None. The stack profile is `general`; the scoped test command `node --test {files}` came from it.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one prose rewording, found by a verify run, not a fix cycle)
- Must-haves verified: 5/5
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
- FOUND: chainsGitOpAndCommit and CHAINED_MERGE_HINT exported from plugins/devflow/hooks/gate-commits.js
- FOUND commits: 54315d36 (test), 5fb2dad5 (fix), 7652cbaa (test), 124bf39b (fix), 3f01121c (test), fafa56b3 (fix)
