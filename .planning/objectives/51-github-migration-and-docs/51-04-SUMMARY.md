---
objective: 51-github-migration-and-docs
trd: "04"
subsystem: migrations
tags: [upgrade, migration-0010, store-mode, outbox, doctor, commit-gate]

requires:
  - objective: 48-github-planning-writes
    provides: migration 0010 store-gitignore and its outbox/cache preconditions
  - objective: 50-github-enforcement-and-setup
    provides: the store-mode commit gate and the DEVFLOW_SKIP_GH_GATE logged escape
provides:
  - "0010 detect defers (applies:false) while the outbox holds only pending ops, naming `df-tools upgrade --apply --only 0011 --confirm`"
  - "0010 exports STORE_COMMIT_STEPS (branch -> logged-escape commit -> push -> PR) and prints it after apply and dry run"
  - "doctor check 20 prints the same escape form in store mode; local mode byte-identical"
affects: [51-07, 51-08, 51-10, doctor check 24]

tech-stack:
  added: []
  patterns:
    - "detect = assess + deferral; migrate calls the undeferred assess so a direct call still refuses"
    - "store/local branching of printed guidance goes through planningMode.isStoreMode only"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs

key-decisions:
  - "Split 0010 detect into assess (the old detect) + a pending-only deferral; migrate uses assess, so the runner skips 0010 during a drain while a direct migrate/apply still refuses with the unchanged text"
  - "Any pending-only journal defers, backfill or an ordinary unflushed write; blocked, halted or unreadable journals keep applying so a human sees the refusal"
  - "0010 COMMIT_COMMAND was internal and never imported, so it is removed; STORE_COMMIT_STEPS replaces it and is exported for 51-07"
  - "Doctor check 20 builds its own store-mode steps (branch devflow-untrack-runtime-state, reason 'untrack DevFlow runtime state') rather than importing 0010, so the legacy check stays independent of the store migration"

patterns-established:
  - "Printed follow-up commands in store mode are a branch + DEVFLOW_SKIP_GH_GATE=1 (with a reason) + push + PR sequence, and a test parses the printed line back and runs it against the real gate"

requirements-completed: [GMD-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 35min
completed: 2026-10-01
tokens_input: 8337600
tokens_output: 51324
tokens_cache_read: 8172017
tokens_cache_write: 165455
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 04: 0010 defers to an in-progress backfill; store-mode commit guidance Summary

**Migration 0010 now skips with a resume reason while the outbox holds only pending ops (G4), so a bare `upgrade --apply --confirm` reaches 0011 instead of halting. 0010 and doctor check 20 also print a branch, logged-escape commit, push and PR sequence that the store-mode commit gate accepts (G6).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-01T20:11Z
- **Completed:** 2026-10-01
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- **G4 (the resume trap):** `detect` = `assess` + `backfillDeferral`. When the journal has `pending > 0`, `blocked === 0`, is not halted and parses, `detect` returns `{applies:false, deferred:true, tracked, reason}`. The reason reads: `GitHub backfill in progress: N outbox op(s) pending. Resume it with \`df-tools upgrade --apply --only 0011 --confirm\`, or let the gh-flush hook drain it; 0010 runs after the drain.` The upgrade runner therefore records 0010 as *skipped* rather than *failed*, so it no longer halts later migrations. A finished migration (block current, nothing tracked) still reports "nothing to do" ahead of any deferral.
- **migrate unchanged:** `migrate` calls `assess`, so a direct `migrate`/`apply` still refuses on a pending, blocked or halted journal with byte-identical blocker text. `journalState()` now backs both `journalBlockers` and the deferral; it reads the local journal only, makes no gh call and never calls into 0011.
- **G6 (0010):** `STORE_COMMIT_STEPS` (exported) replaces the internal `COMMIT_COMMAND`, printed after apply and in dry run:
  ```
  commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked branches), then merge it through a pull request:
    git switch -c devflow-store-cache
    DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration" node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/
    git push -u origin devflow-store-cache
    then open a pull request for that branch
  ```
- **G6 (doctor check 20):** `commitNote(root, files)` uses `planningMode.isStoreMode(root)`. In local mode it prints `commit with: ${COMMIT_COMMAND} <files>` byte for byte (the exported `COMMIT_COMMAND` is unchanged). In store mode it prints the same sequence with branch `devflow-untrack-runtime-state` and reason `untrack DevFlow runtime state`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: 0010 detect defers on a pending journal | `node --test .../migrations/0010-store-gitignore.test.cjs .../upgrade.test.cjs` | 0 (57/57) | PASS |
| 2: store-mode commit guidance | `node --test .../migrations/0010-store-gitignore.test.cjs .../doctor-checks/20-legacy-runtime-state.test.cjs .../doctor.test.cjs` | 0 (67/67) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1, a1dbbcb2) | `node --test .../0010-store-gitignore.test.cjs` | 1 (tests 1 and 9b fail; 2, 3, 3b, 4, 4b pass as guards) | FAIL (correct) |
| GREEN (task 1, 83539160) | `node --test .../0010-store-gitignore.test.cjs .../upgrade.test.cjs` | 0 (57/57) | PASS (correct) |
| RED (task 2, a0ce1b96) | `node --test .../0010-store-gitignore.test.cjs .../20-legacy-runtime-state.test.cjs` | 1 (5, 5b, 6b fail; 6 and 6c pass as local-parity guards) | FAIL (correct) |
| GREEN (task 2, 837e75d5) | `node --test .../0010-store-gitignore.test.cjs .../20-legacy-runtime-state.test.cjs .../doctor.test.cjs` | 0 (67/67) | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

Test-list mapping: TRD tests 1-4 are 0010 tests 1, 2, 3/3b, 4 (plus 4b), test 5 is 0010 tests 5/5b, and test 6 is check-20 tests 6/6b/6c. In 0010 test 5b the printed escaped line is parsed back out of `STORE_COMMIT_STEPS` and run on a new `devflow-store-cache` branch. Without the escape it is refused (`unlinked_branch`). With the escape the commit lands (`gate_escaped: true`) and logs `{gate: 'gh', reason: 'store migration'}`. A `gh` shim that always fails shows that no gh call is made.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../0010-store-gitignore.test.cjs .../20-legacy-runtime-state.test.cjs` | 0 | PASS |
| regression | `node --test .../upgrade.test.cjs .../doctor.test.cjs` (run together with check 24, misc-commit and misc-commit-gate: 114/114) | 0 | PASS |
| full suite | `npm test` (worktree) | 1 | 8310 tests, 8252 pass, **8 fail**, 50 skipped. All 8 are pre-existing/environmental, see below |

**Full-suite failures (unrelated, not fixed):** all 8 are in `bin/devflow-watch.test.cjs` (3) and `bin/handoff-e2e.test.cjs` (5): "PID file should be created" and "done record ... did not appear within 10000ms". The `devflow-watch` daemon needs `node-pty`, and this worktree has no `node_modules/` (`node_modules/node-pty` exists only in the main checkout). Neither file touches 0010, the doctor checks or the outbox.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing test 9b encoded the G4 trap**
- **Found during:** Task 1 RED
- **Issue:** 0010 test 9b asserted that `upgrade.apply --only 0010 --confirm` with a pending op *fails*, and that failure is what halts the runner before 0011.
- **Fix:** In the RED commit, the test now expects a skip whose reason names `--only 0011`, with no failure, no stamp, nothing untracked and no `.gitignore`. A comment cites G4. `upgrade.test.cjs` does not pin 0010 text, so it needed no change.
- **Commit:** a1dbbcb2

**2. [Rule 3 - Blocking] SUMMARY written in the worktree, not through `summary post`**
- **Issue:** `summary post` resolves the MAIN checkout (`planning-verbs.cjs` `mainRoot`), so from this worktree it would write an uncommitted file into the shared main tree. That conflicts with the binding rule to commit the SUMMARY on this branch, and with the merge.
- **Fix:** This repo is in local mode, where `summary post` writes exactly these bytes to exactly this path (D-01). The file was written at `.planning/objectives/51-github-migration-and-docs/51-04-SUMMARY.md` in the worktree and committed with `df-tools commit`. STATE.md and ROADMAP.md were not touched (the orchestrator updates them after the merge).

## Follow-ups for other TRDs (not changed here, outside files_modified)

- **`skills/doctor/SKILL.md` step 4** tells the agent the notes contain `commit with: node ... commit "<msg>" --files <paths>` and to run it. In store mode the notes now hold the multi-line sequence instead. 51-10 (docs) should add a sentence, for example: in store mode, run the `git switch -c` and escaped commit lines and show the push and pull-request steps to the user.
- **USER-GUIDE / CHANGELOG** still describe 0010's printed commit as refused (50-13 open item). 51-10 already plans "0010 defers during a backfill and prints the store-mode commit".
- **Doctor check 24** reuses 0010 `detect`. During a drain it now reports `ok` with `nothing to untrack: GitHub backfill in progress ...`. The reason is accurate, but the "nothing to untrack" prefix reads oddly. A later change could branch on the new `det.deferred` flag (for example `ok`/`info`: untrack waits for the drain).
- **51-07** can print `require('.../0010-store-gitignore.cjs').STORE_COMMIT_STEPS` after 0011. **51-08** can rely on a bare `--apply --confirm` skipping 0010 while ops are pending.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (deferral with the `--only 0011` reason; direct migrate refuses; blocked or halted still applies and refuses; 0010 prints branch, escape, push, PR; check 20 uses the escape form only in store mode and local mode is byte-identical)
- Gate failures: None in the TRD gates. The full suite has 8 environmental failures (node-pty missing in the worktree).

## Commits

- a1dbbcb2 test(51-04): 0010 defers to an in-progress backfill
- 83539160 fix(51-04): 0010 detect defers while the outbox has pending ops
- a0ce1b96 test(51-04): store-mode commit follow-up
- 837e75d5 fix(51-04): print the branch + logged escape commit in store mode (G6)

## Self-Check: PASSED

- FOUND: all 4 modified files and this SUMMARY in the worktree
- FOUND: a1dbbcb2, 83539160, a0ce1b96, 837e75d5 (`git log 20783986..HEAD` on df/exec-51-04)
