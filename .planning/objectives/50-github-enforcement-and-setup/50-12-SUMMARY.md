---
objective: 50-github-enforcement-and-setup
trd: "12"
subsystem: enforcement
tags: [e2e, parity, commit-gate, flush-hook, check-runner, gh-setup, d-01, store-mode]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: "50-05 gh-flush hook, 50-06 commit gate, 50-07 validate Check 16 and doctor check 25, 50-08 check runner, 50-10 reusable workflow, 50-11 gh setup"
provides:
  - "gh-enforcement.e2e.test.cjs: SC1, SC2, SC3, the GEN-02/03 flow and the workflow-script check, through the real entry points"
  - "gh-enforcement-parity.test.cjs: D-01 store-off parity for every new behaviour except gh setup, and gh setup's disabled case"
affects: [50-13 docs-and-full-suite]

tech-stack:
  added: []
  patterns:
    - "child-process runs of the real df-tools.cjs / gh-flush.js / gh-check-cli.cjs behind the gh PATH shim, with temp HOME, outbox, gh cache and hook-marker dirs"
    - "parity by deep-equal against a baseline project with no `github` block, plus a shim that must stay empty"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs
  modified: []

key-decisions:
  - "The GEN-02/03 flow queues its write with `verification post` (no `status:` in the file), not `summary post`: summary post also queues an in-progress label removal, and flushing a patch-issue first reads the repository's capabilities (several extra gh reads), so the shim table would have to model the capability endpoints. verification post queues one comment, which is the single cheap op kind the TRD's error_recovery named."
  - "SC2 runs `cmdGhSetup` in-process against the fake GitHub (the fake does not cross a process boundary); the dispatch of `df-tools gh setup` is exercised as a child in the parity suite (test 9), where no gh call is expected."
  - "The fixture objective is 7 (issue #700), not 50: the PR entry that links the branch is `prs[7]`. Nothing in the gate depends on the objective number."

patterns-established:
  - "10c asserts the check runner's whole require graph stays under plugins/devflow/devflow/bin, because the reusable workflow sparse-checks-out only that directory"

requirements-completed: [GEN-01, GEN-02, GEN-03, GEN-04, GEN-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: ~10min
completed: 2026-10-01
tokens_input: 8716490
tokens_output: 67394
tokens_cache_read: 8529177
tokens_cache_write: 187197
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50: GitHub Enforcement and Setup, TRD 12: Enforcement end to end and store-off parity Summary

**Objective 50's three success criteria hold through the real entry points (df-tools commit as a child process, the spawned gh-flush hook, the Actions check runner, `gh setup`), the GEN-02/03 flow drains a queued write and clears W057, and a store-off project sees no change and makes no gh call.**

## Accomplishments

- **SC1 (tests 1-4):** in a store-mode git repo, `df-tools commit` on `main` and on `feat/x` exits 1 with `default_branch` / `unlinked_branch`, stages nothing and leaves HEAD untouched; `DEVFLOW_SKIP_GH_GATE=1` lands the commit with `gate_escaped` and `df-tools override --list --raw` shows the `gh` entry (also read from `.override-log.jsonl`); on the branch an unmerged `prs` entry names, an unscoped message gets `Refs #700`. Zero gh calls throughout.
- **SC2 (test 5):** `gh setup` prints `devflow: default branch`, both required status contexts, the `Objective`/`TRD` types and the `work`/`kind` fields with zero writes; `--apply` creates the ruleset and the workflow; the second `--apply` makes zero GitHub writes and writes no file.
- **SC3 (test 6):** the runner posts `devflow/linked-issue` failure on the head sha for a PR with no closing reference (exit 1) and success for `Closes #12` (exit 0); run as the script Actions runs (spawned, gh answered by the shim) the exit code is 1 and exactly one status POST is made.
- **GEN-02/03 (test 7):** commit on the linked branch, `verification post` queues offline (exit 3, `validate health` reports one W057 naming `df-tools gh outbox flush`), the spawned gh-flush hook flushes it (`synced N GitHub write(s)`, no `decision` key), the outbox reports `pending: 0` and `validate health` has no W057.
- **Workflow script (test 10):** every `gh-check-cli.cjs <name>` in `devflow-checks.yml` points at a file that exists, names a subcommand the runner accepts (an unrelated event is a clean skip, exit 0), and the runner loads nothing outside `plugins/devflow/devflow/bin`.
- **D-01 parity (tests 8-9):** for a project with no `github` block (baseline), `github` enabled with no `store` key, and `store:false`, `df-tools commit` on `main` and on an unlinked branch returns exactly `committed/hash/reason` with a bare message and no override log; the gh-flush hook is silent on PostToolUse and Stop, even over a journal left by an earlier store-mode life; `validate health` equals the baseline and carries no W057-W061; doctor check 25 is ok "not a store-mode project"; no outbox, mapping or override log appears on disk; `gh setup` with `github.enabled:false` or no block is skipped, exit 0, zero gh calls, no file written.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: success criteria end to end (tests 1-7, 10) | `node --test plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs` | 0 (12 pass) | PASS |
| 2: store-off parity (tests 8-9) | `node --test plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs` | 0 (7 pass) | PASS |

## Task Commits

1. **Task 1: e2e** - `f37ac15c` (test)
2. **Task 2: parity** - `94d79c56` (test)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../gh-enforcement.e2e.test.cjs .../gh-enforcement-parity.test.cjs` (with gh-seam.repo, planning-writes.repo, doc-refs.repo: 52 tests) | 0 | PASS |
| dependent | `node --test gh-check-cli, gh-setup-cli, misc-commit-gate, validate-gh-health, doctor-checks/25-gh-store-sync, hooks/gh-flush.test.js` | 0 | PASS (127 tests, 0 fail) |

Full `npm test` was not run, as instructed.

## TDD Evidence

Not applicable as RED to GREEN: this is an e2e/parity TRD over code that already exists, and the TRD said the tests may pass at once. They did, apart from one fixture iteration inside Task 1 (test 7 first failed because the shim table did not model what the flusher reads, see below); no production code changed.

## Deviations from Plan

None to the production code, and no defect was found in any owning module, so there is no `fix(50-12)` commit.

Choices inside the TRD's latitude, recorded for the reader:

1. **Test 7 queues with `verification post`, not `summary post`.** The first attempt used `summary post 7-01`; the flush stopped with `blocked: could not resolve repository capabilities` because that verb also queues a `patch-issue` (the in-progress label coming off), and flushing a patch-issue reads the repository's capabilities first. This is intended behaviour, not a defect; `verification post` queues a single `upsert-comment`, whose flush needs three shim entries (issue read for the database id, comment list, comment POST). The TRD's "e.g. `summary post` or `gh trd start`" allowed another verb.
2. **SC2 is in-process**, as 50-11's own tests are (the fake cannot cross a process boundary); the child-process dispatch of `df-tools gh setup` is covered by test 9.
3. **Objective 7 instead of 50** for the linked-branch fixture.
4. **Extra tests beyond the TRD's list:** 6c (the check runner spawned as a script), 8b2 (a leftover journal is not flushed in store-off mode), 8e (nothing store-shaped on disk), 10b/10c (subcommand acceptance and the sparse-checkout require graph).

## Issues Encountered

None outstanding. Note for 50-13: the SUMMARY of 50-06 listed that `df-tools commit` follow-ups printed by migration 0010 and doctor check 20 are refused on a store-mode default branch; this TRD did not address it.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (SC1, SC2, SC3, GEN-02/03 flow, D-01 parity, workflow script path)
- Gate failures: None

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs`
- FOUND commits: `f37ac15c`, `94d79c56`
