---
objective: 43-stack-drafter-rules
trd: "08"
job: 43-08
subsystem: stack-drafter
tags: [stack, drift, fleet, harness, ratchet, gap-closure]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-07 dry-run drift scope and table (43-ROLLOUT.md), 43-06 HAND_ONLY and KEY_ALIASES"
provides:
  - "compareDrift/formatRow: the 43-07 drift comparison as a pure function"
  - "stack-fleet-tables.cjs: FLEET (33), ACCEPTED, KNOWN_DRIFT with a closing TRD per entry"
  - "stack-drafter-fleet.test.cjs: real-fleet regression harness with a KNOWN_DRIFT ratchet"
affects: ["43-09", "43-10", "43-11", "43-12", "43-13", "43-14", "43-15"]
tech-stack:
  added: []
  patterns:
    - "Real-fleet test with a ratchet: new conflicts fail, closed ones must be removed from the table"
    - "Committed STACK.md is read from HEAD (git show), never from the work tree"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs
    - plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
  modified: []
key-decisions:
  - "KNOWN_DRIFT is { repo: [ { keys, closes, reason, residual? } ] }: one entry per closing TRD, because several repos have rows closed by different TRDs"
  - "A committed `run: none` against a draft command is a conflict (a concrete decision, not a gap); only a committed `discover` or a missing key lets the draft be more specific"
  - "The table guards run even when the fleet harness is skipped, so ACCEPTED cannot be widened unnoticed on a machine without the fleet"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 35min
completed: 2026-10-03
tokens_input: 6982645
tokens_output: 54352
tokens_cache_read: 6825797
tokens_cache_write: 156726
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 08: Drift comparison helper and the real-fleet regression harness Summary

**A pure drift comparison helper plus a real-fleet harness that redrafts 33 repos read-only and pins today's 38 non-accepted conflict keys (12 repos, each with the TRD that closes it) in a ratchet, so any new conflict fails and every closed row must be removed.**

## Progress
- [x] Task 1 RED: helper tests (items 1-11) — a1f8cb37
- [x] Task 1 GREEN: compareDrift and formatRow in __fixtures__/stack-drift-compare.cjs — 686c110b
- [x] Task 2: fleet tables and the real-fleet harness with the seeded KNOWN_DRIFT ratchet — 5de8e4ae

## What was built

- `__fixtures__/stack-drift-compare.cjs`: `compareDrift({ committed, draft, committedTier, draftTier, handOnly, keyAliases })` returns `{ rows, skipped }`. Scope is exactly 43-07's: extends, the components set, and per key the effective run/apply/cwd over the union of both files' own keys, HAND_ONLY skipped, `helm_lint` aliased to `lint_helm`. It requires nothing (a test asserts that). `formatRow` writes the 43-07 wording.
- `__fixtures__/stack-fleet-tables.cjs`: `FLEET` (33), `ACCEPTED` (devcluster lint and test only, user remedy (c)), `KNOWN_DRIFT` (ratchet).
- `stack-drafter-fleet.test.cjs`: one test per repo. It runs the checkout's `df-tools --cwd <repo> stack init` (no `--write`, no `--run`, real `process.env`), reads the committed file with `git show HEAD:.planning/STACK.md`, resolves each file's extends tier with the real HOME, asserts HEAD and `git status --porcelain=v1 -uall` are identical before and after, then fails on any conflict outside ACCEPTED and KNOWN_DRIFT and on any KNOWN_DRIFT key that no longer conflicts. More-specific rows and skipped HAND_ONLY keys are `t.diagnostic`.

## Seeded KNOWN_DRIFT (real run, 2026-10-03)

Seeded from a real run, not from the 43-ROLLOUT.md table: a scratch script (same logic as the harness, outside the repo) drafted all 33 repos read-only and dumped every row as JSON; the table was written from that dump and the harness then ran green. The harness was not separately run red against an empty table; the two mutation checks below prove the red direction instead.

| repo.key | closes |
|---|---|
| devflowops.format, devflowops.tidy | 43-09 |
| aodex.codegen | 43-09 |
| aodex.build | 43-10 |
| aocore.lint_helm | 43-09 |
| aocore.lint, aocore.audit | 43-12 |
| aocore.build, aocore.test | 43-13 |
| eden-biz.build, eden-biz.test | 43-10 |
| eden-biz.codegen, eden-biz.e2e_env | 43-11 |
| eden-libs.build, eden-libs.test, eden-libs.codegen, eden-libs.format | 43-10 |
| justinforme.codegen | 43-11 |
| smartWellness.codegen | 43-11 |
| ao-terminal.deps | 43-11 |
| aoedge.lint | 43-12 |
| aoinference.extends, .components, .audit, .build, .codegen, .fix, .format, .tidy | 43-14 (stale committed file) |
| opsCluster.extends, .components, .audit, .codegen, .fix, .format, .tidy | 43-14 (stale committed file) |
| politihub.build, politihub.test | out-of-scope (recorded, not targeted) |

ACCEPTED (not in KNOWN_DRIFT): devcluster.lint, devcluster.test (user decision 2026-10-03, remedy (c)).

## Differences from the 43-07 table

None in repos or keys. The 11 non-devcluster conflict repos and every key match 43-ROLLOUT.md `## Dry-run drift` (ao-terminal, aocore, aodex, aoedge, aoinference, devflowops, eden-biz, eden-libs, justinforme, opsCluster, smartWellness), and the 18 match repos still match. The more-specific rows are also identical (aodex audit and lint, aofamily build, deps, lint, eden-biz deps, e2e, lint, EdenDocs deps, justinforme e2e). Only the wording differs: the helper prints `components: committed `none` vs draft `control-plane/|go`` where 43-07 wrote `committed-only=[] draft-only=[control-plane|go]`. Every HEAD equals the 43-07 pin except politihub.

**politihub** (43-07 skipped it: HEAD moved from the pinned `686cb0b82a9f` to `30be797fb85b`). Evaluated now, it is a conflict on `build` (draft `discover` vs committed `make build (cwd go)`) and `test` (draft `flutter test (cwd flutter-navigators)` vs committed `make test (cwd go)`), and more specific on `codegen`, `deps` and `lint` (draft resolves a committed `discover` or adds a key). Seeded as `closes: 'out-of-scope'`. Its state does not change the 43-07 conflict set.

## Run time

The fleet describe takes about 7.5 s (33 repos, 0.1 to 1.0 s each; EdenDocs is the slowest at about 1 s). The two new files together take about 7.6 s.

## Deviations from Plan

### Auto-fixed Issues

None.

### Interpretations

1. **Table guards run when the harness is skipped.** The verify line says `DEVFLOW_SKIP_FLEET_HARNESS=1 ... (all skipped)`. The fleet describe is skipped (the output shows the skip with its reason), but the three table-guard tests (FLEET count, ACCEPTED exact, KNOWN_DRIFT entry shape) read no repository and still run. This keeps the "never widen ACCEPTED" guard alive on machines and CI runners without the fleet.
2. **KNOWN_DRIFT shape.** The TRD text shows `{ repo: { keys, closes, reason } }` but its own seed table has several `closes` values per repo (aocore has three, aodex and eden-biz two). The table is `{ repo: [ { keys, closes, reason } ] }`.
3. **Extra helper tests.** 4b (committed `none` is a conflict), 6b (a draft adding an apply is more specific), 7b, 9b, 10b and a `formatRow` test were added beside items 1-11.
4. **Transient roadmap drift.** The `## Progress` checkpoint creates `43-08-SUMMARY.md` before the TRD is complete, so `roadmap-reconcile.test.cjs` E2E1 (zero drift in this repo's ROADMAP) reported 43-08 as `[ ]` with a SUMMARY on disk while the full run was in progress. It clears when `roadmap update-job-progress` ticks 43-08 at the end; it is not a defect in the new code.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: helper tests | `node --test plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs` (MODULE_NOT_FOUND) | 1 | PASS (RED is the expected result) |
| 1 GREEN: helper | `node --test plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs` (18 of 18) | 0 | PASS |
| 2: fleet harness | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (36 of 36, 0 skipped) | 0 | PASS |
| 2: skip switch | `DEVFLOW_SKIP_FLEET_HARNESS=1 node --test ...stack-drafter-fleet.test.cjs` (fleet describe skipped, 3 guards pass) | 0 | PASS |
| 2: absent root | `DEVFLOW_FLEET_ROOT=/nonexistent-fleet-root node --test ...stack-drafter-fleet.test.cjs` (skipped, never fails) | 0 | PASS |

Mutation checks of the ratchet (tables temporarily edited, restored afterwards, harness re-run green): removing aoedge's entry failed with `new conflict: lint: committed ...`; adding a non-conflicting key to smartWellness failed with `smartWellness.format no longer drifts: remove it from KNOWN_DRIFT`.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs` | 1 | FAIL (correct: module does not exist) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none defined for this repo | - | not_available |
| scoped | `node --test plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (54 of 54) | 0 | PASS |
| stack-* | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs'` (1158 of 1158) | 0 | PASS |
| golden | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` (14 of 14) | 0 | PASS |
| test | `npm test` (8651 tests: 8617 pass, 2 fail, 32 skipped) | 1 | the two failures are MA-7 (doctl PTY, known environmental) and E2E1 (transient, deviation 4) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (helper scope; conflict versus more_specific classification; real-fleet read-only redraft from HEAD; ratchet and ACCEPTED guard; HEAD and porcelain unchanged for all 33 repos; skips on absent root, repo, committed file and env switch; seed equals the 43-07 set plus politihub)
- Gate failures: MA-7 only (environmental); E2E1 clears once ROADMAP.md ticks 43-08
- No drafter module changed. No fleet repo was written, staged or committed; every repo's HEAD and porcelain were identical before and after each draft.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-drift-compare.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
- FOUND commits: a1f8cb37, 686c110b, 5de8e4ae
