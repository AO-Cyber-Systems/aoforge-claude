---
objective: 59-state-and-merge-plumbing
job: "06"
trd: "06"
subsystem: execute-objective
tags: [merge-driver, state-json, state-archive, advance-job, wave-merge, replay-test, prose-pins]

requires: ["59-01", "59-02", "59-03"]
provides:
  - "execute-objective step 0 installs the merge driver once per objective run, from the main checkout, before the first parallel wave's worktrees"
  - "Branch merge protocol classifies conflicts three ways: take ours (STATE.md, ROADMAP.md, REQUIREMENTS.md), `merge-driver resolve` (state.json, STATE_ARCHIVE.md), abort (anything else)"
  - "post-merge regeneration after EVERY parallel wave: advance-job --objective, update-progress, roadmap update-job-progress, one commit of STATE.md ROADMAP.md state.json"
  - "every documented `state advance-job` carries --objective; executor.md's state block carries --cwd <checkout>"
affects: [59-07 dogfood-and-docs]

tech-stack:
  added: []
  patterns:
    - "replay of the documented command sequence through gate-commits and a real scratch repo, now running `merge-driver resolve` for real through the repo's df-tools"
    - "prose pins in a .repo.test.cjs that reads the markdown (install before first worktree fence, resolve line, --objective, --cwd)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs
  modified:
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/agents/executor.md
    - plugins/devflow/devflow/workflows/execute-trd.md
    - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
    - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs

key-decisions:
  - "The install lives in step 0 only, never inside the Branch merge protocol section, so the replay's classifier is unaffected"
  - "A failed or unknown `merge-driver install` is reported and the wave goes on: the resolve path still covers a conflict, and an older runtime keeps today's behaviour"
  - "The regeneration is unconditional after every parallel wave (advance-job is idempotent), no longer tied to a resolved planning-file conflict"

requirements-completed: [PLMB-01, PLMB-02, PLMB-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-05
tokens_input: 8676555
tokens_output: 46776
tokens_cache_read: 8422653
tokens_cache_write: 253770
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 59 TRD 06: Merge and state wiring Summary

**The build now installs the state.json/STATE_ARCHIVE.md merge driver before its first parallel wave, resolves those two files with `merge-driver resolve` instead of aborting, and regenerates the position with `state advance-job --objective` after every wave; the replay proves the documented sequence for real, with and without the driver installed.**

## Progress
- [x] Task 1: Replay and prose pins for install, resolve and the regeneration (tests 1-12, RED) — 74c38071
- [x] Task 2: Prose — install, resolve, regeneration, --objective (GREEN) — c387301c

## What was built

### execute-objective.md
- **Step 0 (parallel wave):** "once per objective run, before the first parallel wave's worktrees" with the fence `node ~/.claude/devflow/bin/df-tools.cjs merge-driver install`, ahead of the `exec-context worktree --repo` fence. Prose (outside any fence) says state.json then merges JSON-aware and STATE_ARCHIVE.md by union, a failure or `Unknown command` is reported and the wave goes on, the install and every wave merge run in the main checkout and never inside an executor worktree, and `merge-driver uninstall` reverses the install.
- **Branch merge protocol:** lead-in names the main checkout (the integration checkout `merge_back` names) and "never inside an executor worktree". Conflicts are classified three ways: `git checkout --ours` + `git add` for STATE.md/ROADMAP.md/REQUIREMENTS.md; `node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve <planning_path>` for `.planning/state.json` and `.planning/STATE_ARCHIVE.md`; `git merge --abort` for anything else. The `ours`/`add`/`complete`/`abort` spellings the replay classifies are unchanged.
- **Regeneration (before `<!-- merge-sequence:end -->`):** after EVERY parallel wave's merges: `state advance-job --objective "${OBJECTIVE_NUMBER}"`, `state update-progress`, `roadmap update-job-progress "${OBJECTIVE_NUMBER}"`, then `commit ... --files .planning/ROADMAP.md .planning/STATE.md .planning/state.json`.
- **Spawn prompt `<worktree_protocol>`:** `state advance-job --objective {objective_number}`.

### executor.md and execute-trd.md
- `state_updates` in both run `state advance-job --objective "${OBJECTIVE_NUMBER}"`; execute-trd.md's intro line names it with the flag too.
- executor.md's state block puts `--cwd <checkout>` on every df-tools call (advance-job, update-progress, record-metric, add-decision, record-session, roadmap update-job-progress, requirements mark-complete, add-blocker) with a one-sentence reason; the behaviour line reads "`state advance-job --objective N`: derives Current/Total TRDs and Status from the objective's TRD and SUMMARY files; never says ready for verification until every TRD has a SUMMARY".

### Tests
- `hooks/gate-commits-merge-sequence.test.js`: `TAKE_OURS` / `RESOLVE` lists, a `resolve` category ahead of `df-tools`, per-path handling (resolve runs for real through `plugins/devflow/devflow/bin/df-tools.cjs` after the hook sees the documented line), `mkScratch({base})`, `gitEnv()` keeps the running node on PATH for an installed driver, builders `stateJsonWith` / `archiveWith`. New scenarios: state.json conflict, STATE_ARCHIVE.md conflict, all three planning files together, state.json + src/a.js abort, driver installed first (clean path, `git check-attr merge` asserted), and the order test now pins `resolve` after `list` and before `complete`.
- `lib/state-merge-wiring.repo.test.cjs` (new): pins 7-12 (install before the first worktree fence; resolve line and both paths in the protocol; regeneration with `--objective` and state.json in `--files`; no conditional-on-conflict wording; every `state advance-job` line carries `--objective` in executor.md, execute-trd.md and execute-objective.md; `--cwd <checkout>` on every df-tools call in the state block; main-checkout/never-in-a-worktree prose in step 0 and the protocol lead-in; `merge-driver uninstall` named).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs` | 1 (33 tests: 16 fail on missing prose, 17 pass incl. scenarios 4 and 5 as controls) | FAIL (correct) |
| GREEN | `node --test` over the two files plus executor-isolation, doc-refs.repo, planning-writes.repo | 0 (68/68) | PASS (correct) |

RED failures all named missing prose (`no documented ... merge-driver resolve <planning_path>`, install line absent, `--objective` absent, no main-checkout note), not fixture errors: scenario 5 (real install in the scratch repo, real driver merge) and the abort scenario 4 passed against today's prose.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: replay and pins (RED) | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs` | 1 (expected) | PASS (failures name missing prose) |
| 2: prose (GREEN) | `node --test` gate-commits-merge-sequence, state-merge-wiring.repo, executor-isolation, doc-refs.repo, planning-writes.repo | 0 | PASS (68 tests) |
| 2: token pin | `node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` | 0 | PASS (23 tests) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test` gate-commits-merge-sequence, state-merge-wiring.repo, executor-isolation | 0 | PASS |
| test (first run, before the tokens-cli fix) | `npm test` | 1 | tokens-cli test 14 failed (Deviation 2) on top of the baseline set; the baseline set that run also included the handoff PTY-path flake and the fleet twin of github-enterprise-migration |
| test (final) | `npm test` | 1 | PASS against baseline: 9808 tests, 9773 pass, 3 fail, 32 skipped; the 3 are the known baseline failures (MA-7 doctl handoff, roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration) |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

## Discovered commands

None. The stack profile (`general`) supplied `npm test` and `node --test {files}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] planning-writes.repo.test.cjs flagged the roadmap comment in executor.md**
- **Found during:** Task 2 verify (`the repo has zero planning-write findings`)
- **Issue:** the comment `# Update ROADMAP.md progress for this objective` is satisfied by a df-tools verb within 3 lines, but the audit's `VERB_CALL_RE` expects `df-tools.cjs` directly followed by the verb, so `df-tools.cjs --cwd <checkout> roadmap update-job-progress` no longer satisfies it.
- **Fix:** reworded the comment to `# Recompute this objective's roadmap progress row (TRD counts, status)` (the TRD's own recovery instruction). Not changed: `planning-audit.cjs`. Follow-up worth considering: let `VERB_CALL_RE` accept an optional global `--cwd <dir>` before the verb, since 59-03 and this TRD put `--cwd` in front of df-tools calls.
- **Files modified:** plugins/devflow/agents/executor.md
- **Commit:** c387301c

**2. [Rule 3 - Blocking] tokens-cli.test.cjs test 14 pinned the substring `df-tools.cjs state record-metric`**
- **Found during:** Task 2 full `npm test` gate (test "executor.md record-metric example passes --job "${TRD}", never --trd")
- **Issue:** the required `--cwd <checkout>` between `df-tools.cjs` and `state` removed the substring the test searches for, so it found no record-metric example.
- **Fix:** the test now searches for `state record-metric` on lines that name `df-tools.cjs`; its `--job "${TRD}"` / no `--trd` assertions are unchanged.
- **Files modified:** plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs (outside the TRD's files_modified list)
- **Commit:** c387301c

### Other notes (not deviations)
- Extra named replay scenarios beyond the TRD's six: none; extras in the repo test: 9b (regeneration no longer conditional on a conflict) and per-file variants of pin 10 (execute-objective.md also covered).
- `merge-driver install` was run only in hermetic scratch repositories; this repository's git configuration was not touched (the test asserts the scratch root differs from the repo root and sits under the temp dir).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs
- FOUND: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
- FOUND: plugins/devflow/devflow/workflows/execute-objective.md
- FOUND: plugins/devflow/agents/executor.md
- FOUND: plugins/devflow/devflow/workflows/execute-trd.md
- FOUND: plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
- FOUND commits: 74c38071, c387301c

## Post-TRD Verification

- Auto-fix cycles used: 0 (two inline Rule 3 fixes, listed above)
- Must-haves verified: 5/5 (install in step 0 with the main-checkout note and uninstall; resolve in the protocol and the replay; unconditional regeneration with state.json in the commit; `--objective` and `--cwd <checkout>` in executor.md/execute-trd.md; installed-driver clean path)
- Gate failures: None beyond the 3 known baseline failures (MA-7 doctl handoff, roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration)
