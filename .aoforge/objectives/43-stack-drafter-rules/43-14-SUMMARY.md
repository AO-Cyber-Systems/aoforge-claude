---
objective: 43-stack-drafter-rules
trd: "14"
job: 43-14
subsystem: stack-drafter
tags: [stack, rollout, gap-closure, checkpoint, fleet-harness, known-drift]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-05 D3 rule (no supported area at the root: extends general plus a component); 43-09..43-13 final drafter; 43-08 fleet harness and KNOWN_DRIFT ratchet; 42-11 per-repo write discipline"
provides:
  - "aoinference `.planning/STACK.md` and `.planning/STACK-REPORT.md` refreshed to the objective 43 drafter, committed as 87ea0e1 on fix/obj31-oci-source-label (not pushed)"
  - "opsCluster `.planning/STACK.md` and `.planning/STACK-REPORT.md` refreshed to the objective 43 drafter, committed as 9f22c0d on main (not pushed)"
  - "43-ROLLOUT.md `## Gap closure: stale STACK.md refresh (TRD 43-14)`: preflight, previews, the human reply verbatim, results"
  - "stack-fleet-tables.cjs KNOWN_DRIFT without aoinference and opsCluster"
affects: ["43-15"]
tech-stack:
  added: []
  patterns:
    - "Record the human approval verbatim and commit it before the first write in another repo"
    - "Snapshot P0 (porcelain plus hash-object of every listed path) before a cross-repo write and diff it after, so the user's in-progress work is proven untouched"
key-files:
  created: []
  modified:
    - .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
    - /Users/justin/dev/aoinference/.planning/STACK.md
    - /Users/justin/dev/aoinference/.planning/STACK-REPORT.md
    - /Users/justin/dev/opsCluster/.planning/STACK.md
    - /Users/justin/dev/opsCluster/.planning/STACK-REPORT.md
key-decisions:
  - "The refresh accepts the drafter's output as it is. The `extends: go` shape that objective 42 committed is replaced by `extends: general` plus a `control-plane/` component (43-05 D3), and audit, fix, format and tidy are no longer written as explicit keys. No hand edits to keep the old keys"
  - "opsCluster's P0 snapshot was retaken immediately before its write (the first one was several minutes old, taken before aoinference was written). The two were identical"
  - "SDR-08 stays `requirements-partial`: politihub is still unrun, and aocore.test and ao-terminal.deps are open flag-only residuals for 43-15. Nothing was marked complete in REQUIREMENTS"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false
duration: 3min (Task 3 continuation after the checkpoint; Task 1 ran in the earlier session)
completed: 2026-10-03
tokens_input: 7310716
tokens_output: 50755
tokens_cache_read: 7119391
tokens_cache_write: 191155
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 14: Refresh the stale committed STACK.md in aoinference and opsCluster Summary

**aoinference and opsCluster now carry the objective 43 drafter's STACK.md (`extends: general`, `control-plane/` as a `go` component) and a matching STACK-REPORT.md, each as one two-file local commit on its current branch (aoinference 87ea0e1, opsCluster 9f22c0d), with the user's in-progress work provably untouched. Both rows left KNOWN_DRIFT and the fleet harness is 36/36.**

## Progress
- [x] Task 1: Preflight and preview (read-only) — 4ebc3a49
- [x] Task 2: Human approves each repo's refreshed STACK.md before any write — 3cdee2af (reply "approved" recorded verbatim under ### Approval in 43-ROLLOUT.md)
- [x] Task 3: Write, verify, report and commit (approved repos only); clear KNOWN_DRIFT — 7153c778 (aoinference 87ea0e1, opsCluster 9f22c0d)

## What was done

**Approval.** The human replied `approved` in chat on 2026-10-03, which covers both repos. It is recorded verbatim under `### Approval` in 43-ROLLOUT.md and was committed (3cdee2af) before the first write in either repo.

**Per repo (checkout df-tools, `--cwd <repo>`, one plain command per call).** HEAD and the staged index were re-checked against the Task 1 pins (both unchanged, index empty). A P0 snapshot was taken. Then `stack init --write --force`, `stack validate`, a static `stack verify`, `stack report --write`, a delta check against P0, and `commit --files .planning/STACK.md .planning/STACK-REPORT.md` on the current branch. `git show --name-only` listed exactly the two files each time. Nothing was pushed.

| | aoinference | opsCluster |
|---|---|---|
| branch | `fix/obj31-oci-source-label` | `main` |
| HEAD before | `c9f1bdccc2da9747fbdd9d45a7c8f98d04e4f2a1` | `a547076a0daeaec58675ca2848c2ad1fd85d2d25` |
| staged before | none | none |
| `stack validate` | ok, 0 errors, 0 warnings | ok, 0 errors, 0 warnings |
| `stack verify` (static) | resolved 12, missing 0, unverifiable 0, discover 4, ran 0 | resolved 12, missing 0, unverifiable 0, discover 5, ran 0 |
| delta vs P0 | none outside the two stack files | none outside the two stack files |
| commit | `87ea0e1a2ff274e219cd48339c8593ab5669b020` | `9f22c0d62849566e6bc6efa7b443e734b4d34bf5` |
| user porcelain after (vs P0) | 3 lines, identical status and hashes | 8 lines, identical status and hashes |

**This repo.** aoinference and opsCluster were removed from KNOWN_DRIFT (a history line for 43-14 was added to the fixture's comment block), the Results section was added to 43-ROLLOUT.md, and both went in one `df-tools commit --files` (7153c778) together with this TRD's Progress update. The untracked `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`, `references/codex-agent-policy.md` and `objectives/*/.gitkeep` were not staged.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Preflight and preview | `grep -n "Gap closure: stale STACK.md refresh" 43-ROLLOUT.md` (line 294); both repos' porcelain counts equal the Task 1 record (3 and 8, confirmed by the Task 3 P0 snapshots) | 0 | PASS |
| 2: Human approval | reply `approved` exists in 43-ROLLOUT.md and was committed before the first write (3cdee2af precedes both repo commits) | n/a (checkpoint) | PASS |
| 3: Write, verify, report, commit | `git -C ~/dev/aoinference show --name-only --format=%H HEAD`; `git -C ~/dev/opsCluster show --name-only --format=%H HEAD` (each lists exactly `.planning/STACK-REPORT.md` and `.planning/STACK.md`); `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | not_available (no lint command in this repo) | n/a | not_available |
| test | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` | 0 (36 pass, 0 fail) | PASS |

## Fleet harness and KNOWN_DRIFT

The harness reads each committed `.planning/STACK.md` from HEAD, so it saw the two refresh commits. aoinference and opsCluster both report "draft has no unaccepted conflict with the committed STACK.md", and the ratchet raised nothing.

Remaining KNOWN_DRIFT (both residual, both closed by 43-15):

| Repo | Keys | Closes | Why it remains |
|---|---|---|---|
| aocore | `test` | 43-15 | flag-only residual: flag order and `-coverprofile` differ from the CI lane |
| ao-terminal | `deps` | 43-15 | flag-only residual: CI adds `--no-audit --no-fund`, the reviewed value dropped them |

ACCEPTED is unchanged (devcluster `lint`, `test`).

## Deviations from Plan

None. The TRD was executed as written. One precaution beyond the TRD: opsCluster's P0 was retaken right before its write and compared with the first (identical).

## Notes for the reader

- `git status -sb` in opsCluster shows `main...origin/main [ahead 207, behind 1]`. The gap existed before this commit (local `main` was already far ahead). The TRD's "ahead by 1 at most" check does not apply to a branch that was already ahead, and nothing was pushed. aoinference shows `ahead 6` (5 before this commit).
- Static `stack verify` records that each command resolves on this host; it ran no gate (`ran 0`).
- The preview said the STACK-REPORT.md `profile_source` would read `file` after the STACK.md write, not `draft`. It does.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (preflight before any write; approval before any write; the five-step sequence and a two-file commit per repo on the current branch with no push; user work tree identical to P0 in both repos; harness matches both repos and their KNOWN_DRIFT entries are gone)
- Gate failures: None

## Self-Check: PASSED

- FOUND: `/Users/justin/dev/aoinference/.planning/STACK.md`, `/Users/justin/dev/aoinference/.planning/STACK-REPORT.md`, `/Users/justin/dev/opsCluster/.planning/STACK.md`, `/Users/justin/dev/opsCluster/.planning/STACK-REPORT.md`
- FOUND commits: aoinference `87ea0e1a`, opsCluster `9f22c0d6`, devflow-claude `4ebc3a49`, `3cdee2af`, `7153c778`
- KNOWN_DRIFT has no `aoinference` or `opsCluster` entry
