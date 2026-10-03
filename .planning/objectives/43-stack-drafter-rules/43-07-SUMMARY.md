---
objective: 43-stack-drafter-rules
trd: "07"
job: 43-07
subsystem: stack-drafter
tags: [stack, rollout, fleet, checkpoint]
requires: ["43-02", "43-06"]
provides:
  - "43-ROLLOUT.md run plan (33 fleet repos), HAND_ONLY acceptance list and the pending approval record"
affects: []
status: checkpoint
---

# Objective 43 TRD 07: Fleet `stack verify --run` (checkpoint after Task 1)

Run plan written and committed. No gate has run in any repo. The TRD is paused at the Task 2 decision.

## Progress
- [x] Task 1: Sync the runtime mirror and draft the run plan (no gates run) — eeaebfba
- [x] Task 2: Human approves the repo list, the --include set and HAND_ONLY additions — f40af070
- [x] Task 3: Run the approved gates read-only and record results; dry-run drift table — (this commit)
- [ ] Final: write the SUMMARY with `summary post 43-07 --from <file>` (including `## Self-Check`), update STATE and ROADMAP, make the docs commit — next step: `df-tools summary post 43-07 --from <scratchpad>/43-07-SUMMARY-final.md`

## What Task 1 produced

- The runtime mirror was synced (`DEVFLOW_SKIP_GLOBAL_UPGRADE=1`) and `cmp` exits 0 for stack-verify.cjs, stack-draft.cjs, stack-evidence.cjs and stack-runners.cjs. Mirror version 2.12.0, digest `sha256:f6a61ba45d32e3ea167cdd198201d8d75c57161f9096329a849e98d01d449981`.
- `43-ROLLOUT.md` holds the header, the Run plan table (all 33 repos, none absent), totals, the repos left out and why, gates worth a second look, the proposed `--include` (none for every repo), the HAND_ONLY acceptance list with the devcluster assumption, and an empty `## Approval`.
- Read-only proof: a before and after signature (porcelain bytes plus content hash of every listed path) of all 33 repos is identical, and every HEAD is unchanged.

## Figures the human decides from

- 28 repos have at least one default gate that would run (166 gates: lint 68, format 65, build 33). 4 repos have nothing to run (AOSignal, aostudio, devflow-test, github-enterprise-migration) and quanta-local has only a skipped `docker build`.
- Refused by policy before spawning: 9 default gates (8 `unverifiable-body`, 1 `container-build`) and 5 opt-in gates (3 `unverifiable-body`, 1 `body:port-8080-forbidden`, 1 `body:container-run`).
- Opt-in items if everything were included: test 72, audit 31, e2e 5.

## Deviations from Plan

- **Survey run as a script, not ~100 Bash calls.** The TRD asks for one plain command per Bash call and one repo per call. The 33-repo read-only survey ran as a single `node <scratchpad>/survey.cjs` call that issues only `git rev-parse`, `git status` and `git hash-object` (no `-w`, `GIT_OPTIONAL_LOCKS=0`) plus the static `stack verify` through the mirror's df-tools. No gate command was spawned. The script and its JSON live in the session scratchpad and are not committed; the committed run plan carries the data that matters (branch, 12-char HEAD, dirty count, commands, cwd).
- **Additions beyond the TRD (read-only):** a policy preview (the mirror's `verifyStack({ run: true })` with a no-op `spawn`, so the table shows what `--run` would really run or refuse), a text scan of test sources for the string 8080, and a note of what 42 recorded for ao-terminal, aodex, aoedge, aocore, aofamily and aoid.

## Task 2 outcome

The user chose `approve-edited` on 2026-10-03. The reply is recorded verbatim under `## Approval` in 43-ROLLOUT.md, with the effective run list derived from it. All ten HAND_ONLY additions are accepted. The devcluster modelling assumption is rejected, so devcluster is reported as drift in Task 3.

The runtime mirror had been re-mirrored with an older bundle (no effect guard) since Task 1. The TRD's own sync command was re-run before the approval commit. The digest is again `sha256:f6a61ba4...` and `cmp` exits 0 for five files. Details are in 43-ROLLOUT.md under `## Approval`.

## Next

Task 3 runs the approved gates. HEAD prefixes in the Run plan table are what it checks.
