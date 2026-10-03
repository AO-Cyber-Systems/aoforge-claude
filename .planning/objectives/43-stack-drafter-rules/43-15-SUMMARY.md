---
objective: 43-stack-drafter-rules
trd: "15"
status: checkpoint
---

# Objective 43 TRD 15: Final fleet dry run, residual decision, and docs (checkpoint)

Checkpoint, not complete. Task 1 is done and committed. The run stops at Task 2 (`checkpoint:decision`) until the human replies.

## Progress
- [x] Task 1: Read-only fleet dry run and residual list — ea95cf8c
- [x] Task 2: Human decides each residual row — 4daf6232 (reply `accept-all`, recorded verbatim under `### Decision` in 43-ROLLOUT.md)
- [x] Task 3: Apply the decision, retire KNOWN_DRIFT, CHANGELOG and the full suite — (this commit)
- [ ] Wrap-up: write the final SUMMARY with `## Self-Check`, then `state` updates, `roadmap update-job-progress 43` and the closing docs commit — next step: `node plugins/devflow/devflow/bin/df-tools.cjs summary post 43-15 --from <scratchpad file>`

## Task 1 result

- Fleet dry run (33 repos, `stack init` only, no `--write`, no `--run`) at devflow-claude HEAD `c3ad796c`.
- Totals: 24 match, 6 more_specific, 3 conflict (1 ACCEPTED: devcluster; 2 residual: ao-terminal.deps, aocore.test). 4 conflict rows, 9 more-specific rows. 43-07 baseline: 18 match, 14 drift (12 conflict, 2 more_specific), politihub not evaluated.
- Read-only proof: 33 of 33 signatures (HEAD, branch, porcelain, hash-object of every listed path) identical before and after; a second full pass after the investigation was identical again and its "before" equals the first pass "after" for 33 of 33. No repo changed since the 43-07 pins except aoinference and opsCluster (approved 43-14 refreshes) and politihub (43-08 record).
- politihub is evaluated and counted: no conflict, one more-specific row (`lint`).
- Only `43-ROLLOUT.md` changed in this task. No drafter module, table or test changed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Read-only fleet dry run and residual list | `grep -n "Gap closure cycle 1: dry-run drift" .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md` | 0 | PASS |
| 1: Read-only fleet dry run and residual list | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` | 0 | PASS (36/36) |

## Deviations from Plan

None. The residual list also carries the more-specific rows, the 43-12 lint-coverage observation and politihub, as the dispatch asked.

## Follow-ups for the SUMMARY of Task 3 (not done here)

- aodex.audit: the draft takes the `--self-test` CI step, not the gate (`go.yml:116` against `go.yml:127`). A general rule may exist; it is a drafter change and out of scope for this TRD.
- Lint coverage for justinforme and smartWellness (`buf lint` dropped) cannot be an OPEN table row: the harness sees no drift.
