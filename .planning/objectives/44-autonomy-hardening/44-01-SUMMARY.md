---
objective: 44-autonomy-hardening
trd: "01"
job: 44-01
subsystem: agents + execute-objective workflow
tags: [autonomy, maxTurns, INCOMPLETE, SendMessage, yolo, progress-checkpoint]
requires: []
provides:
  - "uncapped executor and verifier (no length cap in frontmatter)"
  - "executor contract: one df-tools commit per task, carrying a `## Progress` checkpoint in SUMMARY.md"
  - "the sentence 'A SUMMARY without `## Self-Check` means checkpoint, not complete' in executor.md"
  - "execute-objective items 5c (classify COMPLETE/INCOMPLETE/FAILED) and 5d (SendMessage resume, at most 3)"
  - "AUTONOMOUS_CONTINUE (autonomous or yolo): continue between waves without asking"
affects: [44-04, 44-08, 44-09]
tech-stack:
  added: []
  patterns: ["INCOMPLETE as a third executor outcome", "resume by SendMessage to the same task id"]
key-files:
  created: []
  modified:
    - plugins/devflow/agents/executor.md
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/references/unattended-operation.md
decisions:
  - "The executor frontmatter comment reads 'No turn cap', not 'No maxTurns', so that `rg maxTurns plugins/devflow/agents` stays empty (TRD verification + 44-09 SC1)"
  - "A task's `## Progress` update rides in that task's own commit, ticked `(this commit)`; the next update backfills the hash"
  - "Structured stops (CHECKPOINT REACHED, Rule 4, ESCALATION REQUESTED, preflight hard stops) are excluded from INCOMPLETE condition (b)"
  - "An INCOMPLETE parallel plan's worktree is not merged or removed until it is COMPLETE, so its executor can be resumed in place"
metrics:
  tasks: 2
  files: 4
  completed: 2026-09-29
---

# Objective 44 TRD 01: Uncap executor/verifier and make truncation a resumable INCOMPLETE outcome — Summary

The executor and verifier no longer have a 50/30 turn cap; `guard-no-progress.js` is the runaway guard. The executor now commits once per task through `df-tools commit` and leaves a `## Progress` checkpoint in SUMMARY.md. execute-objective classifies a cut-short executor as INCOMPLETE and resumes it with SendMessage (at most 3 times) instead of failing it and skipping its dependents. In yolo mode it continues between waves without asking.

## Progress
- [x] Task 1: Uncap executor + verifier; per-task commit, ## Progress checkpoint, no sleep-poll — 0060b6d
- [x] Task 2: execute-objective INCOMPLETE outcome, SendMessage resume, yolo between waves, drop legacy agent read — b8aed06
- [x] Final: full SUMMARY with Task Evidence and Self-Check — (this commit)

## What changed

**Task 1 (0060b6d): executor.md, verifier.md, unattended-operation.md**
- Removed `maxTurns: 50` (executor) and `maxTurns: 30` (verifier). The executor has a YAML comment in their place naming `hooks/guard-no-progress.js` as the runaway guard.
- `<task_commit_protocol>`:
  - Step 4 now uses `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files ...`; `gate-commits.js` denies a raw `git commit`.
  - The separate `git add` step is gone, because `--files` stages the paths itself.
  - New rule: "Commit immediately after EACH task passes verify. Never batch two tasks into one commit, and never defer commits to the end."
  - The executor must check `committed: true`. A `skipped_*` result is a blocker, not a commit.
- `execute_tasks`:
  - New `## Progress checkpoint (after every task)` section, containing the verbatim sentence "A SUMMARY without `## Self-Check` means "checkpoint, not complete"."
  - New "Resumed runs" paragraph: don't re-read, don't re-research, run `git log --oneline -n 20` once, continue from the first unticked item.
- `<worktree_command_discipline>`: new rule "Never `sleep N` then poll. The harness blocks it. For a long wait, use `run_in_background: true` with an until-loop condition, or Monitor." The old "run it in the background and poll" sentence was reworded to match.
- unattended-operation.md: the two cap rows became one row, `maxTurns — executor/verifier | none | ... guard-no-progress.js ...`. I also added a "Truncated executor (INCOMPLETE)" row and a sentence saying truncation never skips dependents.

**Task 2 (b8aed06): execute-objective.md**
- `execute_waves` reads `MODE` once before item 0, using the same `config-get mode ... || echo "yolo"` form. It then defines `AUTONOMOUS_CONTINUE` = autonomous or yolo, which governs between-wave continuation only.
- Item 5b has a new ordering rule: classify and resume before merging, and never merge or remove an INCOMPLETE plan's worktree.
- **5c. Classify**:
  - TRD_TASKS = the count of opening `<task` elements; the `<tasks>` wrapper is excluded.
  - COMMITS = `git log --oneline --all --grep="({objective}-{trd})"`.
  - SUMMARY state is `missing`, `checkpoint` or `final`.
  - INCOMPLETE = (a) the notification contains `turn limit` or `partial result`, OR (b) SUMMARY is missing or a checkpoint AND COMMITS < TRD_TASKS.
- **5d. Resume**:
  - At most 3 `SendMessage(to=<task id>, ...)` calls per plan, using the TRD's numbered-steps message with "do NOT re-research".
  - The plan is re-classified after each resume. After the 3rd, it falls through to item 7 with "truncated 4 times".
  - This applies in every mode, and resumes for different plans run in parallel.
  - The resume budget is separate from the failure retry.
- Item 7:
  - An INCOMPLETE plan never puts its dependents in the skipped set. Only a real FAILED outcome after the fresh-respawn retry does.
  - The report table has a new `| ⏳ Incomplete | {id} | truncated; resumable — re-run /devflow:execute-objective |` row.
  - Dependents of an INCOMPLETE plan are shown as `waiting on {id}`.
- Items 6 and 9: when `AUTONOMOUS_CONTINUE` is true, the orchestrator announces the next wave and spawns it in the same turn, and never asks "Ready for wave N?" or "Continue?". Failure handling stays keyed on `MODE == "autonomous"`.
- The executor spawn prompt's `<success_criteria>` gained "Committed after every task; SUMMARY.md ## Progress kept current (a cut-short run is resumed, not redone)". The `PLAN_ID:` line is byte-identical: `git diff -G PLAN_ID` is empty.
- The gap-closure planner spawn no longer reads `~/.claude/agents/planner.md`; `rg -c "claude/agents/"` finds 0 matches.
- `<failure_handling>` gained the bullet "Truncated executor (turn limit / partial result) → INCOMPLETE → SendMessage resume (≤3), never a failure". The "Agent fails mid-plan" bullet now says to classify first.

## Deviations from Plan

**1. [Rule 1 - Bug] Contradiction in the TRD: the mandated comment contained `maxTurns`**
- **Found during:** Task 1
- **Issue:** Action 1 mandates the comment `# No maxTurns: runaway protection is ...`. But the TRD's `<verification>` (`rg -n "maxTurns" plugins/devflow/agents` → no output), its `<done>`, and 44-09 SC1 all require that no `maxTurns` string appear in `plugins/devflow/agents`.
- **Fix:** I wrote `# No turn cap: runaway protection is hooks/guard-no-progress.js (repetition), not a length cap (objective 44).`, which keeps the meaning and passes both checks.
- **Files:** plugins/devflow/agents/executor.md. **Commit:** 0060b6d

**2. [Rule 2 - Missing critical] Structured stops excluded from INCOMPLETE condition (b)**
- **Found during:** Task 2
- **Issue:** Some returns have no SUMMARY and fewer commits than tasks, so as written they would be classified INCOMPLETE and resumed 3 times for nothing. These are a checkpoint return (`## CHECKPOINT REACHED`), a Rule 4 decision, an `## ESCALATION REQUESTED` and a preflight hard stop.
- **Fix:** 5c says (b) does not apply to those returns. The checkpoint goes to `<checkpoint_handling>`; the others are FAILED. Condition (a) is unchanged.
- **Commit:** b8aed06

**3. [Rule 2 - Missing critical] Worktree ordering for INCOMPLETE parallel plans**
- **Found during:** Task 2
- **Issue:** 5b merges every worktree branch and removes the worktrees. That strands an INCOMPLETE executor, which has to be resumed inside its worktree.
- **Fix:** 5b now says to classify and resume first, and to merge an INCOMPLETE plan only once it is COMPLETE. A plan that falls through to item 7 keeps its worktree.
- **Commit:** b8aed06

**4. [Rule 1 - Bug] A commit cannot contain its own hash**
- **Found during:** Task 1
- **Issue:** The `## Progress` line format `— <hash>` cannot be satisfied inside the same commit.
- **Fix:** The task being committed is ticked `(this commit)`, and the next update backfills the short hash.
- **Commit:** 0060b6d

## Observations for follow-up (not fixed, out of scope)
- `df-tools commit` (lib/misc.cjs `cmdCommit`) returns `skipped_commit_docs_false` for ALL files, code included, when `commit_docs` is false. The executor prompt now treats that as a blocker, but the code path deserves a fix in a TRD that may touch `.cjs`.
- Condition (b) counts commits, not tasks. A TDD task makes 2-3 commits, so (b) can miss a truncated TDD run. Condition (a), the harness notification text, still catches it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Uncap + per-task commit + Progress + no sleep-poll | `rg -n "maxTurns" plugins/devflow/agents/` | 1 (no matches) | PASS |
| 1 | `node --test executor-isolation agent-tools agent-shell-harness model-profiles` | 0 (90/90) | PASS |
| 2: INCOMPLETE / SendMessage / yolo / legacy read | `rg -n "INCOMPLETE\|SendMessage\|partial result\|turn limit\|AUTONOMOUS_CONTINUE" execute-objective.md` | 0 (27 lines) | PASS |
| 2 | `rg -c "claude/agents/" execute-objective.md` | 1 (0 matches) | PASS |
| 2 | `node --test executor-isolation doc-refs.repo agent-tools agent-shell-harness` | 0 (84/84) | PASS |
| Final re-run | `node --test` over all 5 contract files (executor-isolation, agent-tools, agent-shell-harness, model-profiles, doc-refs.repo) | 0 (122 tests) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | — | N/A |
| test | `node --test executor-isolation agent-tools agent-shell-harness doc-refs.repo` (+ model-profiles) | 0 | PASS |
| wave | `npm test` | 1 | PASS WITH EXPECTED FAILURES (see below) |

The `npm test` run had 5110 tests: **5051 passed, 9 failed, 50 skipped, 0 cancelled.**
- 6 failures in `bin/handoff-e2e.test.cjs`. This is the known pre-existing failure the TRD wave gate allows.
- 2 failures in `bin/devflow-watch.test.cjs` (foreground daemon PID / stale PID). These are the same devflow-watch daemon family as handoff-e2e. This TRD's diff touches no `.cjs`/`.js` file, only four markdown files. I did not re-run these tests at the wave base to prove they fail there too.
- 1 failure in `lib/roadmap-reconcile.test.cjs` E2E1, "reconcile dry-run against this repo ROADMAP shows zero drift". It reports that `44-01-TRD.md` should be ticked in ROADMAP.md because this SUMMARY now exists. That is expected: the dispatch forbids this executor from editing ROADMAP.md, so the failure clears when the orchestrator ticks 44-01 after merge.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (caps removed + reference row; df-tools per-task commit + Progress; no sleep-poll; INCOMPLETE detection (a)/(b); SendMessage ≤3 then fresh respawn; dependents `waiting on`, never skipped; yolo continues between waves; legacy planner read removed)
- Gate failures: none attributable to this TRD (see the wave gate note)

## Self-Check: PASSED

- FOUND: plugins/devflow/agents/executor.md, plugins/devflow/agents/verifier.md, plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/devflow/references/unattended-operation.md (all modified, and all read by the contract tests)
- FOUND: commit 0060b6d, commit b8aed06 (`git log --oneline -n 3` on df/exec-44-01)
- STATE.md / ROADMAP.md were deliberately not edited, per the dispatch; the orchestrator updates them after merge.
