---
objective: 43-stack-drafter-rules
trd: "07"
job: 43-07
subsystem: stack-drafter
tags: [stack, rollout, fleet, verify-run, effect-guard, dry-run-drift]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-02 effect guard in stack-verify.cjs (shipped to the runtime mirror) and 43-06 golden equivalence and HAND_ONLY table"
provides:
  - "43-ROLLOUT.md: run plan, verbatim approval, per-repo `stack verify --run` results for 32 of 33 fleet repos, dry-run drift table, summary"
affects: ["/devflow:milestone audit (re-audit v1.4)", "any follow-up on the drafter rules for the 12 conflict rows"]
tech-stack:
  added: []
  patterns:
    - "Fleet runs are read-only: harness snapshot (porcelain plus content hash of every listed path) before and after each repo, in addition to the D8 guard"
    - "Re-verify the runtime mirror against the checkout before every repo, not once"
key-files:
  created: []
  modified:
    - .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md
key-decisions:
  - "Dry-run drift is measured in the 43-06 golden scope (extends, components set, per key effective run/apply/cwd), skipping the accepted HAND_ONLY keys, and split into conflicts (hand-fix needed) and more-specific (draft adds a key or resolves a `discover`)"
  - "devcluster is reported as drift on lint and test, not a match: known hand-fix row (remedy (c), user decision 2026-10-03)"
  - "A repo whose HEAD moved after the plan was pinned is skipped and recorded, not re-pinned (politihub)"
requirements-completed: [SDR-03]
requirements-partial: [SDR-08]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true
duration: 30min (this continuation; Task 1 ran in an earlier session)
completed: 2026-10-03
---

# Objective 43 TRD 07: Fleet `stack verify --run` Summary

**Real `stack verify --run` results for 32 of 33 fleet repos with zero mutations and zero harness deltas, and a dry-run drift table showing 12 repos still need a hand-fix, so the objective's "no row needing a hand-fix" success line is not met.**

## Progress
- [x] Task 1: Sync the runtime mirror and draft the run plan (no gates run) — eeaebfba
- [x] Task 2: Human approves the repo list, the --include set and HAND_ONLY additions — f40af070
- [x] Task 3: Run the approved gates read-only and record results; dry-run drift table — 657e6757

## Performance

- **Duration:** about 30 min for this continuation (17:36Z to 18:06Z); the gates themselves took 642 s
- **Started:** 2026-10-03T17:36:11Z (continuation), Task 1 earlier the same day
- **Completed:** 2026-10-03T18:06Z
- **Tasks:** 3 of 3
- **Files modified in this repository:** 2 (43-ROLLOUT.md, this SUMMARY). No fleet repo was modified.

## Accomplishments

- Recorded the user's `approve-edited` reply verbatim under `## Approval` and committed it (f40af070, 13:38 EDT) about three minutes before the first gate ran (17:41:28Z).
- Ran the approved gates in 32 repos, in plan order: `--keys lint,format` for videoArchive and eden-libs, `--include test` for dfip, eden-circle, EdenDocs, qrCodeBuilder, smartWellness and trades, default keys for the rest. No audit, e2e, e2e_env, codegen, deps, apply, deploy or port-8080 command ran.
- 161 gates ran: 63 exit 0, 98 non-zero, 0 timeouts. 0 mutations caught, 0 unrestored, 0 harness deltas, no HEAD moved in any repo that ran.
- Ran the `stack init` dry run (no `--write`) in the same 32 repos and compared each draft with the committed `.planning/STACK.md` (read from HEAD): 18 match, 14 drift (12 conflicts that need a hand-fix, 2 where the draft is only more specific).
- Classified every red gate by cause: 79 repo state, 15 host toolchain, 4 deps not installed.

## Results in numbers

| measure | value |
|---|---|
| repos in plan / ran / skipped (HEAD moved) / absent | 33 / 32 / 1 (politihub) / 0 |
| repos with at least one gate that ran | 27 (5 had nothing to run) |
| gates ran / exit 0 / non-zero / timeout | 161 / 63 / 98 / 0 |
| non-zero by cause: repo state / host toolchain / deps not installed | 79 / 15 / 4 |
| gates run with the `--no-pub` rewrite | 30 |
| items not run | 591: 9 policy refusals (8 `unverifiable-body`, 1 `body:container-build`), 0 effect-guard refusals, 582 outside the approved key set or without a command |
| mutations caught by the guard / unrestored | 0 / 0 |
| harness deltas / HEADs moved in repos that ran | 0 of 32 / 0 |
| dry run: match / drift (conflict, more specific) | 18 / 14 (12, 2) |

Conflict rows (a hand-fix is needed): ao-terminal, aocore, aodex, aoedge, aoinference, devcluster, devflowops, eden-biz, eden-libs, justinforme, opsCluster, smartWellness. More-specific only: aofamily, EdenDocs. Not evaluated: politihub.

## What this means for SDR-08 and the objective

- **SDR-08:** real results exist for 32 of 33 repos (3 of 33 before), including ao-terminal, aodex and aoedge re-run under the guard. politihub stays open: the user committed `3f3c270` and `bede7bd` there after the plan was pinned, and the rule is skip and record. A re-run needs a new decision, so SDR-08 is listed under `requirements-partial`.
- **SDR-03:** the effect guard's first live run on aocore, aofamily and aoid (where 42's `flutter analyze --fatal-infos` rewrote `analysis_options.yaml` and bumped `pubspec.lock`) caught nothing: with `--no-pub` those gates ran normally and no work tree changed. The 15-case guard test passes. Listed as completed.
- **OBJECTIVE.md Success, "the full fleet dry run shows no row needing a hand-fix": not met.** 12 of 32 evaluated rows still conflict with the reviewed files (details and per-key diffs in 43-ROLLOUT.md under `## Dry-run drift`). The 43-06 golden tests pass on hand-built fixture shapes; the real repos still differ.
- 19 of the 98 red gates are host or dependency problems (cgo link failure against the macOS 27 SDK stubs, golangci-lint built with an older Go, Flutter `dot-shorthands`, missing `node_modules` and package configs). They say nothing about the repositories. Of the six `--include test` repos, only EdenDocs gives a repo-state test result (a failing `oidcauth` test); dfip, eden-circle, qrCodeBuilder and trades are host or deps blocked, and smartWellness passes `make test`.

## Task Evidence

| Task | Verify | Result | Status |
|---|---|---|---|
| 1: mirror sync and run plan | `cmp` on stack-verify, stack-draft, stack-evidence and stack-runners (exit 0, recorded in Task 1); 33 plan rows | commit eeaebfba | PASS |
| 2: approval recorded before any gate | commit time f40af070 (17:38:06Z) versus first gate (17:41:28Z) | approval verbatim under `## Approval` | PASS |
| 3: gates run, results and drift recorded | ROLLOUT holds Run plan, Approval, Results, Dry-run drift and Summary (5 of 5 headings); `git log -1` per repo equals the pinned prefix for 32 of 33; per-repo harness delta `none` for 32 of 32 | commit 657e6757; politihub differs (user's own commits before the run, skipped by rule) | PASS with one recorded exception |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs` | 0 (15 pass, 0 fail) | PASS |
| lint | none (TRD declares none) | - | not_available |
| build | none (TRD declares none) | - | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The runtime mirror no longer matched the checkout**
- **Found during:** start of this continuation, before recording the approval
- **Issue:** `~/.claude/devflow/.plugin-digest` read `sha256:eee82d8c...` instead of the `f6a61ba4...` Task 1 recorded; `cmp` differed for stack-verify.cjs, stack-draft.cjs, stack-evidence.cjs, stack-runners.cjs and df-tools.cjs; the mirror's `stack-verify.cjs` had no effect guard (0 occurrences of `restored`, 18 in the checkout). Running `--run` through it would have run gates on dirty repos with no guard. The cause (something re-mirroring an older bundle after Task 1) was not investigated.
- **Fix:** ran the TRD's own Task 1 sync command (`CLAUDE_PLUGIN_ROOT=<checkout>/plugins/devflow DEVFLOW_SKIP_GLOBAL_UPGRADE=1 node <checkout>/plugins/devflow/hooks/sync-runtime.js`), then `cmp` on all five files (exit 0) and the digest, which equals the Task 1 record. No gate ran on the stale mirror. The driver then compared six mirror files and the digest with the checkout before every repo.
- **Files modified:** `~/.claude/devflow/` only (the mirror), outside any repo
- **Commit:** none (recorded in 43-ROLLOUT.md under `## Approval`, commit f40af070)

### Other deviations

**2. One driver script instead of one Bash call per repo.** The TRD asks for one plain command per Bash call and one repo per call. A sequential Node script (scratchpad, not committed) ran each repo in plan order with the same steps and built-in stop conditions (mirror drift, a surviving harness delta, a guard `restored: false`, a moved HEAD). Same reason as Task 1's survey script; each call stays a plain command. It uses the JSON mode of `stack verify --run` and `stack init` (every gate then carries its exit code, duration and `mutated` record) instead of `--raw`, and reads results df-tools hands back as an `@file:` pointer.

**3. The drift comparison is wider than "commands (run/apply/cwd)".** It also compares `extends` and the `components` set, uses effective commands (own entry, else inherited), and splits drift into conflict and more-specific. That is the scope of the 43-06 golden test, and the narrower reading would have hidden aoinference's and opsCluster's `extends` and component difference. Both views are in the table.

**4. Red gates are classified by cause** (repo state, host toolchain, deps not installed), judged from the last 600 bytes of output the guard keeps. Not asked for; without it 98 red gates would read as repository health. A host cause that sits earlier than the kept tail would be labelled `repo state`.

**5. `requirements mark-complete` was not run.** `.planning/REQUIREMENTS.md` does not exist in this project. The frontmatter above records SDR-03 as completed and SDR-08 as partial for the orchestrator to apply.

### Authentication gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one Rule 3 repair of the environment, described above)
- Must-haves verified: 4 of 5. The mirror equals the checkout (re-established, then re-checked before every repo); the human approved the list before any gate (f40af070); every approved repo has a result row, except politihub (HEAD moved, skipped by rule); the porcelain and content hashes are identical before and after for all 32 repos that ran, and nothing was written or committed in any other repo; the dry run is compared with the committed STACK.md, and the table shows 12 rows that still need a hand-fix. The "every approved repo has a result row" truth is the one not met, by one repo.
- Gate failures: None among the TRD's own gates. Red fleet gates are results, not failures of this TRD.

## Self-Check: PASSED

- FOUND: .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md (Run plan, Approval, Results, Dry-run drift, Summary: 5 of 5 headings)
- FOUND: .planning/objectives/43-stack-drafter-rules/43-07-SUMMARY.md
- FOUND commits: eeaebfba, f40af070, 657e6757
- NOT PRESENT by design: any commit, staged change or stash in a fleet repo; untracked files docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md and objectives/*/.gitkeep were not staged.
