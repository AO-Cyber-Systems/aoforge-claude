---
objective: 52-store-mode-polish
trd: "01"
subsystem: github-store
tags: [commit-gate, store-mode, doctor, migrations, gh-setup]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: the GEN-01 commit gate and its logged escape (DEVFLOW_SKIP_GH_GATE, gate gh)
  - objective: 51-github-migration-and-docs
    provides: the TRD 51-04 store-mode follow-up text in migration 0010 and doctor check 20
provides:
  - lib/commit-steps.cjs: DF_TOOLS_CMD, commitCommand(message, files), branchCommitSteps({branch, command, reason})
  - gate-aware commit follow-ups from gh setup --apply, doctor 21, migration 0010 (and 0011 through it) and doctor 20
  - an as-printed store-mode git fixture that runs each emitter's real output
affects: [52-02-gate-remedies, 52-06-docs-and-full-suite, gh-setup, doctor, upgrade]

tech-stack:
  added: []
  patterns:
    - "One pure builder for printed shell follow-ups; callers pick the form with planningMode.isStoreMode(root)"
    - "As-printed tests: execute the emitted lines through sh -c, substituting only the df-tools prefix"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/commit-steps.cjs
    - plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-pending-migrations.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs

key-decisions:
  - "Every printed df-tools commit follow-up is built by commit-steps.cjs branchCommitSteps. Store mode prints new branch, logged escape, push, PR, then the gh pr start route. Mirror and local gh setup print a plain branch sequence."
  - "The text is static and never evaluates the gate at print time. The gh pr start line covers the linked-branch case."
  - "Doctor 21 store branch is devflow-upgrade with reason 'DevFlow upgrade'. gh setup uses devflow-setup with 'gh setup workflow'."

patterns-established:
  - "commit-steps.cjs is pure (no fs, no git, no config); emitters read store mode only through planningMode.isStoreMode"

requirements-completed: ["52-1"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-04
---

# Objective 52 TRD 01: Gate-aware printed commit follow-ups Summary

**In store mode, every `df-tools commit` follow-up that DevFlow prints (gh setup, doctor 21, migration 0010, doctor 20) now runs as printed. All four come from one pure `commit-steps.cjs` builder: new branch, then the commit with the logged `DEVFLOW_SKIP_GH_GATE` escape, push and PR, plus a `gh pr start` line for linked branches. A store-mode git fixture runs each emitter's real output, from `main` and from the linked branch.**

## Progress
- [x] Task 1: commit-steps.cjs builder and the as-printed store-mode fixture — RED ac41df61, GREEN 22f0c86e
- [x] Task 2: gh setup and doctor check 21 print the builder's sequence — RED 4c7ec99b, GREEN 6a56a923
- [x] Task 3: 0010 and doctor 20 use the builder; all four emitters run as printed — RED 87b7748d, GREEN a127631b

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-04T14:35:40Z
- **Completed:** 2026-10-04T14:50Z
- **Tasks:** 3/3
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- `lib/commit-steps.cjs` has three exports. `commitCommand` produces the exact `node ~/.claude/devflow/bin/df-tools.cjs commit "<m>" --files ...` line. `branchCommitSteps` has two forms:
  - **Store form, six lines.** Lines 1-5 match the TRD 51-04 text byte for byte. Line 6 is `or, on an objective's linked branch (\`df-tools gh pr start <objective>\`), commit there with: <command>`.
  - **Plain form, five lines.** No escape.
- **`gh setup --apply`** no longer prints the bare `df-tools commit` line, which the gate refused. It prints `Commit them through a pull request:` followed by the builder's sequence for branch `devflow-setup`: the store form in store mode, the plain form otherwise.
- **Doctor 21 fix notes.** In store mode the follow-up is now the store form for `devflow-upgrade`, appended last. Local mode still prints `commit with: ...`, byte-identical to before. New export: `commitNote(root, version, files)`.
- **Migration 0010 and doctor 20.** Migration 0010 `STORE_COMMIT_STEPS` and doctor 20's store `commitNote` are now built from the builder:
  - 0010 still exports the constant, computed once at load, so 0011's `includes()` dedupe still works.
  - Doctor 20 keeps `COMMIT_COMMAND` and now also exports `commitNote`.
- **Test 11** runs all four real emitter outputs as printed in fresh store-mode fixtures. Each one lands with `gate_escaped` and a `gate: "gh"` log entry carrying the printed reason from `main`. Each one also lands from the linked branch with no escape. The gh shim log stays empty in every scenario.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: commit-steps builder + as-printed fixture | `node --test plugins/devflow/devflow/bin/lib/commit-steps.test.cjs` | 0 (10/10) | PASS |
| 2: gh setup + doctor 21 print the builder's sequence | `node --test .../gh-setup-cli.test.cjs .../gh-setup-apply.test.cjs .../doctor-checks/21-22-project.test.cjs` | 0 (58/58) | PASS |
| 3: 0010 + doctor 20 use the builder; four emitters as printed | `node --test .../commit-steps.test.cjs .../migrations/0010-store-gitignore.test.cjs .../doctor-checks/20-legacy-runtime-state.test.cjs .../migrations/0011-github-store-backfill.apply.test.cjs .../gh-backfill.e2e.test.cjs` | 0 (69/69) | PASS |
| All scoped files together (final) | the 8 files above in one `node --test` | 0 (127/127) | PASS |
| Neighbours: seam, enforcement e2e, doctor | `node --test .../gh-seam.repo.test.cjs .../gh-enforcement.e2e.test.cjs .../doctor.test.cjs` | 0 (49/49) | PASS |
| TRD verification greps | `rg -n 'Commit them on a branch and open a pull request: df-tools commit' .../gh-setup-cli.cjs` gives no match. `rg -l branchCommitSteps lib --glob '!*.test.cjs'` lists exactly the 5 named files. | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test .../commit-steps.test.cjs`: 9 fail with MODULE_NOT_FOUND. Test 5, the shim check, needs no module and passes. | 1 | FAIL (correct) |
| T1 GREEN | same | 0 (10/10) | PASS (correct) |
| T2 RED | `node --test .../gh-setup-cli.test.cjs .../21-22-project.test.cjs`: 4 fail. Notes still printed `commit with:`, and `pending.commitNote is not a function`. | 1 | FAIL (correct) |
| T2 GREEN | Task 2 verify command | 0 (58/58) | PASS (correct) |
| T3 RED | `node --test .../commit-steps.test.cjs .../0010...test.cjs .../20-...test.cjs`: 7 fail. 0010 text lacked `gh pr start` (so the linked route ran 0 lines), and `commitNote is not a function`. | 1 | FAIL (correct) |
| T3 GREEN | Task 3 verify command | 0 (69/69) | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Task Commits

1. **Task 1: commit-steps builder.** `ac41df61` (test), `22f0c86e` (fix)
2. **Task 2: gh setup + doctor 21.** `4c7ec99b` (test), `6a56a923` (fix)
3. **Task 3: 0010 + doctor 20 + four-emitter table.** `87b7748d` (test), `a127631b` (fix)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test <task files>` | 0 | PASS |
| test (TRD gate) | `npm test` | 1 | FAIL: 8752 pass, 11 fail, 50 skipped. None of the failures involve this TRD's files. 10 already fail at WAVE_BASE and 1 was transient (see below). |

The 11 `npm test` failures:
- **5 in `bin/devflow-watch.test.cjs`, 6 in `bin/handoff-e2e.test.cjs`.** These are daemon spawn/stop tests. Against a `git archive` of WAVE_BASE 67f87a01 they fail the same way: 5/22 and 6/13. They already failed before this TRD and come from the environment (the daemon cannot start in this sandbox). This TRD does not touch either file.
- **1 in `lib/roadmap-reconcile.test.cjs`, E2E1 self-test.** This was transient. My SUMMARY existed while the ROADMAP still showed `- [ ] 52-01`. After `roadmap update-job-progress 52`, `roadmap-reconcile.test.cjs` passes 60/60.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5
  - gh setup store/mirror output runs as printed: test 11 plus gh-setup test 2s / 2.
  - Doctor 21 store form, with local bytes unchanged: 9a and 9b.
  - 0010 and doctor 20 keep five lines byte for byte and add the `gh pr start` line: 6a, 6b, 5c and 6b-ext.
  - Single builder: rg check.
  - Mirror gh setup prints the plain form with no escape: test 2 and test 4.
- **Gate failures:** `npm test`. Only the failures above, none related to this TRD.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/commit-steps.cjs`: the builder. Pure, with TypeErrors on unusable input.
- `plugins/devflow/devflow/bin/lib/commit-steps.test.cjs`: tests 1-7 and 11. It contains the store-mode fixture and the as-printed `sh -c` runner.
- `plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs`: `filesLines(cwd, files, outcomes)` now prints the builder's sequence. `cwd` is threaded through `runSetup → applied`, and `filesLines` is exported.
- `plugins/devflow/devflow/bin/lib/doctor-checks/21-pending-migrations.cjs`: `commitNote(root, version, files)`, exported. The store form goes last.
- `plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs`: `STORE_COMMIT_STEPS` now comes from the builder. It is still an exported string constant.
- `plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs`: the store branch of `commitNote` uses the builder, and `commitNote` is exported.
- The four test files gained the 52-01 assertions: gh-setup 2/2s, doctor-21 9a-9c, 0010 5c, doctor-20 6b-ext/6d.

## Decisions Made
See `key-decisions` in the frontmatter. The branch and reason names for doctor 21 and gh setup are the ones the TRD specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan bug] The existing gh-setup regex cannot match the builder's output**
- **Found during:** Task 2 RED
- **Issue:** Test-list item 8 says the new output "still matches the existing `df-tools commit .* --files ...` regex". The builder, as specified, prints `node ~/.claude/devflow/bin/df-tools.cjs commit ...`, and `df-tools.cjs commit` does not match the literal `df-tools commit`.
- **Fix:** Changed the regex to `SETUP_COMMIT_RE = /df-tools\.cjs commit .* --files .*devflow\.yml .*pull_request_template\.md/` and used it for both the store and mirror assertions. This was done in the RED commit, as the Task 2 recovery clause allows.
- **Files modified:** gh-setup-cli.test.cjs
- **Commit:** 4c7ec99b

**2. [Rule 2 - Correctness] The builder rejects input that would not run as printed**
- **Found during:** Task 1
- **Issue:** `commitCommand` puts the message inside double quotes, and the store form does the same with the reason. A `"`, `$`, backtick or backslash in either would break or change the printed shell line.
- **Fix:** Both functions throw a TypeError on those characters. `commitCommand` also throws on an empty message or an empty `files` array; the TRD only specified TypeErrors for `branchCommitSteps`. Every current caller passes constants or a non-empty file list.
- **Commit:** 22f0c86e

**3. [Rule 3 - Blocking] Doctor 20 had to export `commitNote` for the test-11 table**
- **Found during:** Task 3
- **Fix:** Added `commitNote` to the exports. `COMMIT_COMMAND` keeps its export and its value.
- **Commit:** a127631b

**4. [Scope note] The doctor-20 table entry uses its real fix shape**
- In test 11, the doctor-20 fixture tracks a runtime file, adds an ignore rule, runs `git rm --cached` and deletes the file. This is the exact state doctor 20's fix leaves, so the printed command is proven on a staged removal, not just a modified file.

## Notes for the orchestrator
- `summary checkpoint` / `summary post` resolve to the MAIN checkout. They wrote an untracked copy of this file at `/Users/justin/dev/devflow-claude/.planning/objectives/52-store-mode-polish/52-01-SUMMARY.md`, byte-identical to the one committed on `df/exec-52-01`. An untracked file at that path blocks `git merge` of this branch, so remove it before merging.
- `requirements mark-complete 52-1` reported `REQUIREMENTS.md not found`. The project keeps no REQUIREMENTS.md, so nothing was written.
- `state update-progress` reported `Progress field not found in STATE.md` and made no change.

## Self-Check: PASSED
- FOUND: plugins/devflow/devflow/bin/lib/commit-steps.cjs
- FOUND: plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
- FOUND commits: ac41df61, 22f0c86e, 4c7ec99b, 6a56a923, 87b7748d, a127631b
