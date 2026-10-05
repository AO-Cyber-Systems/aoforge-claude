---
objective: 59-state-and-merge-plumbing
job: "07"
trd: "07"
subsystem: dogfood-and-docs
tags: [dogfood, merge-driver, advance-job, wrong-checkout, milestone-complete, docs]

requires: ["59-01", "59-02", "59-03", "59-04", "59-05", "59-06"]
provides:
  - "live evidence for PLMB-01..05 on this repository and on scratch copies"
  - "CHANGELOG [Unreleased], CLAUDE.md, USER-GUIDE and exec-context help describing the state and merge plumbing"
affects: [objective 59 verification, release notes]

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "The Known issues bullet for the state.json/STATE_ARCHIVE.md wave-merge conflict is replaced by a short 'fixed in objective 59' note, and the two defects the dogfood surfaced (objective remove rewriting dates, milestone complete appending a duplicate entry) are listed as open there instead of being fixed here"
  - "Core Tool bullets in CLAUDE.md never backtick a workflow name: dispatch-completeness reads the first word of every backtick span as a df-tools command"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: n/a (docs and live evidence; the code is tested by 59-01..59-06)

duration: 10min
completed: 2026-10-05
---

# Objective 59 TRD 07: Dogfood and docs Summary

**The five state and merge fixes ran on real data (this repository's driver and wave-2 merges, a scratch-clone two-branch merge with live uninstall, advance-job on this repository, WRONG CHECKOUT then a `--cwd` pass, `milestone complete v1.4` giving 13 objectives and 158 TRDs on a scratch copy) and are now written up in CHANGELOG, CLAUDE.md, USER-GUIDE and the exec-context help.**

## Progress
- [x] Task 1: Live merge, position and preflight on this repository (evidence 1-4) — bbd0053b
- [x] Task 2: Milestone and change flags on a scratch copy of .planning (evidence 5) — e85f5114
- [x] Task 3: Docs, help details and the full test run (evidence 6) — d1ccf50b

## Task 1 evidence

Scratchpad: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/6c7e66cf-c48d-4863-a7a5-da98117cd302/scratchpad`. `df` below is `node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs` (the repo copy).

### Evidence 1: this repository's driver and wave 2's merges

| step | command | exit | result |
|---|---|---|---|
| 1 | `df merge-driver install --check --raw` | 0 | `true` |
| 2 | `git config --get merge.devflow-state-json.driver` | 0 | wrapper quoting `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs` |
| 3 | `git rev-parse --path-format=absolute --git-common-dir` | 0 | `/Users/justin/dev/devflow-claude/.git` (parent = the main checkout, so the quoted bin is the main checkout's; no `.df-worktrees` path) |
| 4 | `git log --merges --format='%h %s' -8` | 0 | the four wave-2 merges, below |
| 5 | `node -e "JSON.parse(...state.json...)"` | 0 | `ok` |

```
a49e8b16 merge: wave 2 TRD 59-05
a5dea1a6 merge: wave 2 TRD 59-04
3944f3a4 merge: wave 2 TRD 59-03
ef9dcb1c merge: wave 2 TRD 59-02
```

The subjects read `merge: wave 2 TRD 59-0x` (the orchestrator's wording), not `df/exec-59-0x`. Per the orchestrator's note, in those live merges with the driver installed `.planning/state.json` and `.planning/STATE_ARCHIVE.md` merged with NO conflict in all three conflicting merges; only STATE.md, ROADMAP.md and REQUIREMENTS.md conflicted, were taken as ours and then regenerated (commit fb6b91ec). This is the real-world evidence for PLMB-02 (this repository's own wave 2, four parallel branches).

### Evidence 2: scratch clone demonstration (from scratch)

| step | command | exit | result |
|---|---|---|---|
| 1 | `git clone --quiet /Users/justin/dev/devflow-claude <scratch>/clone` | 0 | HEAD 2c6ac708, branch `feat/stack-profile-loader` (the `<base-branch>`) |
| 2 | `df --cwd <clone> merge-driver install` | 0 | `installed: true, changed: true`, bin = main checkout's df-tools.cjs |
| 3 | `git switch -c demo-a`; `state add-decision --objective 59 --summary "demo A"`; `state record-metric --objective 59 --job 91 --duration 1min --tasks 1 --files 1` | 0 | `added: true`; `recorded: true` |
| 4 | `df --cwd <clone> commit "chore(demo): branch a" --files .planning/state.json .planning/STATE_ARCHIVE.md` | 0 | `committed: true`, 3a5ebe6b |
| 5 | `git switch -c demo-b feat/stack-profile-loader`; the same two state commands with `--summary "demo B"` and `--job 92` | 0 | `added: true`; `recorded: true` |
| 6 | `df --cwd <clone> commit "chore(demo): branch b" --files ...` | 0 | `committed: true`, ce6d7c67 |
| 7 | `git switch feat/stack-profile-loader`; `git merge --no-ff -m "merge demo-a" demo-a` | 0 | `Merge made by the 'ort' strategy` (2 files, +7) |
| 8 | `git merge --no-ff -m "merge demo-b" demo-b` | 0 | `Auto-merging .planning/STATE_ARCHIVE.md`, `Auto-merging .planning/state.json`, `Merge made by the 'ort' strategy` |
| 9 | `git diff --name-only --diff-filter=U` | 0 | empty (no unmerged path) |
| 10 | `df --cwd <clone> merge-driver uninstall` | 0 | `installed: false, changed: true` |
| 11 | the same again | 0 | `installed: false, changed: false` |
| 12 | `df --cwd <clone> merge-driver install --check --raw` | 0 | `false` |
| 13 | `df merge-driver install --check --raw` (this repository, after the clone's uninstall) | 0 | `true` (the clone's undo touched nothing here) |

What the second merge added on top of the first (`git diff HEAD~1 HEAD`): state.json `decisions` gained a `demo B` entry after `demo A`; STATE_ARCHIVE.md gained the `- [Objective 59]: demo B` decision line and the `| Objective 59 P92 | 1min | 1 tasks | 1 files |` metrics row. The clone's state.json decisions end `["demo A","demo B"]`, STATE_ARCHIVE.md ends with both `P91` and `P92` rows. Without the driver, both of those files conflict (59-01's control test; the pre-59 Known issue).

### Evidence 3: position (PLMB-01)

| step | command | exit | result |
|---|---|---|---|
| 1 | `rg -n '^\*\*Status:\*\*' .planning/STATE.md` (before) | 0 | line 52: `**Status:** Executing objective 59 — 6/7 TRDs complete` |
| 2 | `df state advance-job --objective 59 --raw` | 0 | `executing` |
| 3 | `df state advance-job --objective 59` | 0 | JSON below |
| 4 | `git status --porcelain .planning/STATE.md .planning/state.json` | 0 | empty |

```json
{ "advanced": false, "objective": "59", "previous_job": 6, "current_job": 6, "total_jobs": 7,
  "status": "executing", "status_text": "Executing objective 59 — 6/7 TRDs complete", "state_md_updated": false }
```

The orchestrator's post-wave regeneration (fb6b91ec, which runs `advance-job --objective 59`) had already written the line, so the dogfood run is the idempotent case: the verb derived the same 6/7 from the TRD and SUMMARY files on disk and wrote nothing. There was therefore nothing to commit for STATE.md and state.json in this step (an unchanged-file `commit` is a no-op by construction); the verb's from-disk result equals the TRD's expected `Executing objective 59 — 6/7 TRDs complete`, and 07's own SUMMARY did not exist yet, as the TRD's gotcha predicts.

### Evidence 4: preflight (PLMB-03)

| step | command | exit | result |
|---|---|---|---|
| 1 | `df exec-context worktree --repo /Users/justin/dev/devflow-claude --id 59-07-dogfood --base HEAD` | 0 | `worktree_path` `/Users/justin/dev/.df-worktrees/devflow-claude/59-07-dogfood`, `base_sha` 2c6ac708710cca3f2f3611a771ec15327db21e6b, `preflight` printed |
| 2 | `df exec-context check --repo ... --base 2c6ac708... --id 59-07-dogfood` (main checkout) | 1 | `Error: WRONG CHECKOUT — a worktree was provisioned for 59-07-dogfood and this check ran somewhere else.` ... `No claim was taken here.` |
| 3 | `df --cwd <worktree_path> exec-context check --repo ... --base 2c6ac708... --id 59-07-dogfood` | 0 | `ok: true`, `checkout` = the worktree, `is_worktree: true`, `branch: df/exec-59-07-dogfood`, `base_visible: true`, claim taken for the worktree |
| 4 | `df --cwd <worktree_path> exec-context release --repo ... --id 59-07-dogfood` | 0 | `released: ["59-07-dogfood"]` |
| 5 | `git worktree remove <worktree_path>`; `git branch -D df/exec-59-07-dogfood` | 0 | removed; `Deleted branch df/exec-59-07-dogfood (was 2c6ac708)` |
| 6 | `git worktree list`; `git branch --list df/exec-59-07-dogfood` | 0 | the main checkout plus the pre-existing `.claude/worktrees/mystifying-gates`; branch list empty |

WRONG CHECKOUT output, verbatim:

```
Error: WRONG CHECKOUT — a worktree was provisioned for 59-07-dogfood and this check ran somewhere else.
  your worktree : /Users/justin/dev/.df-worktrees/devflow-claude/59-07-dogfood (branch df/exec-59-07-dogfood)
  checked here  : /Users/justin/dev/devflow-claude
Every Bash call starts in the session's directory, not in your worktree, so the check must name it:
  node ~/.claude/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/.df-worktrees/devflow-claude/59-07-dogfood exec-context check --repo /Users/justin/dev/devflow-claude --base 2c6ac708710cca3f2f3611a771ec15327db21e6b --id 59-07-dogfood
No claim was taken here.
```

The printed `preflight` and WRONG CHECKOUT commands name the `~/.claude/devflow` mirror, which lacks the guard until release; the run above substituted the repo bin, as the TRD's binding rules direct. After the cleanup an empty `/Users/justin/dev/.df-worktrees/devflow-claude/` directory remains (the parent that provisioning creates; earlier waves used it too).

## Task 2 evidence (scratch copy of `.planning/`)

`cp -R /Users/justin/dev/devflow-claude/.planning <scratch>/ms/.planning`; every command below carries `--cwd <scratch>/ms`. The copy is not a git repository.

### Evidence 5: milestone scope and truthful flags (PLMB-04, PLMB-05)

| step | command | exit | result |
|---|---|---|---|
| 1 | `df --cwd <scratch>/ms milestone complete v1.4 --name "GitHub as system of record"` | 0 | `objectives: 13`, `objective_numbers` 42..54, `jobs: 158`, `tasks: 396`, `cancelled: []`, `absent: []`, `scope_source: "milestone bullet"`, `state_updated: true`, `milestones_updated: true` |
| 2 | the same command again | 0 | same counts; `state_updated: false` |
| 3 | `df --cwd <scratch>/ms objective complete 58` (this repository's ROADMAP already has 58 complete) | 0 | `roadmap_updated: false` |
| 4 | reopen 58 in the scratch ROADMAP only (checkbox `[ ]`, progress row `In Progress`), then `objective complete 58` | 0 | `roadmap_updated: true` |
| 5 | `objective complete 58` again | 0 | `roadmap_updated: false` |
| 6 | `git status --porcelain .planning/MILESTONES.md .planning/ROADMAP.md .planning/milestones` (this repository) | 0 | empty |

Against the hand-written v1.4 entry (MILESTONES.md line 79: "13 objectives (42–54), 158 TRDs, all executed"): objective count 13 and numbers 42..54 match, and the TRD total 158 matches exactly (no per-objective recount needed). (Per 59-04's RED run, the pre-59-04 code counted every objective directory; it was not re-run on this repository's data.) `cancelled` lists in-range objectives whose OBJECTIVE.md says `status: cancelled`; the killed objective 26 lies outside the bullet's 42–54, so `cancelled` and `absent` are empty. The entry the command appended to the scratch MILESTONES.md:

```
## v1.4 GitHub as system of record (Shipped: 2026-10-05)

**Objectives completed:** 13 objectives (42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54), 158 plans, 396 tasks
```

(117 accomplishments, taken from the SUMMARYs' one-liners.) The wording is the existing "plans", the hand-written entry says "TRDs"; the numbers agree.

Steps 3-5 are the two directions of PLMB-05: a no-op reports `false` (step 3, step 5) and a real ROADMAP change reports `true` (step 4). Step 4's reopening was done by hand in the scratch copy to have a real change to report.

### Observation recorded for gap closure (not fixed here, outside the TRD's flags)

`milestone complete` is not idempotent for MILESTONES.md: the second run printed `milestones_updated: true` and appended a SECOND `## v1.4 GitHub as system of record (Shipped: 2026-10-05)` entry (scratch MILESTONES.md lines 117 and 243). `state_updated` is truthful (PLMB-05 as written), but the entry is duplicated on a re-run. Worth a TRD of its own: skip the append when an entry for the version already exists, or report `milestones_updated: false`. Also listed under Known issues in USER-GUIDE.

## Task 3: what was documented (evidence 6)

- **CHANGELOG `[Unreleased]`.** Added: `merge-driver install|uninstall|resolve|state-json` (with the live wave-2 and scratch-clone results) and `exec-context worktree` printing `preflight`. Changed: `state advance-job --objective N`, the execute-objective wiring and the executor `CHECKOUT`/`--cwd` dispatch, `milestone complete` scope. Fixed: advance-job's mid-objective `ready for verification` and `no_position`, `exec-context check` WRONG CHECKOUT, and the `milestone complete` accomplishments, task counts, `state_updated` and `roadmap_updated`.
- **CLAUDE.md.** `state advance-job [--objective N]` in State operations; one Merge driver bullet in the Core Tool list; the wave-merge conflict is no longer named as open in "Where we left off".
- **docs/USER-GUIDE.md.** A "Parallel wave merges (`df-tools merge-driver`)" subsection in the Command Reference: install from the main checkout, what each file does on merge, the fail-safe wrapper, `merge-driver resolve`, uninstall, advance-job `--objective`, the executor `--cwd` preflight and WRONG CHECKOUT, the `milestone complete` keys. The Known issues bullet is replaced by a short "fixed in objective 59" note pointing at it, and two newly observed open issues are listed there (the `objective remove` date rewrite from 59-05, the duplicate MILESTONES.md entry from Task 2). There was no existing prose describing `state advance-job` or the `milestone complete` keys in USER-GUIDE, so both are described in the new subsection.
- **`help.cjs`.** `exec-context` details gained the WRONG CHECKOUT line under `check` and the `preflight` line under `worktree`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: live merge, position, preflight | clone: both `git merge --no-ff` exit 0, `git diff --name-only --diff-filter=U` empty, state.json decisions `["demo A","demo B"]`, archive rows P91 and P92, `merge-driver uninstall` `changed: true` then `false`, `install --check --raw` `false`; here: Status `Executing objective 59 — 6/7 TRDs complete`; preflight WRONG CHECKOUT exit 1 then `--cwd` check exit 0; `git worktree list` and `git branch --list df/exec-59-07-dogfood` clean | 0 / 1 (the WRONG CHECKOUT check, expected) | PASS |
| 2: milestone and flags | `milestone complete v1.4` on the scratch copy: `objectives: 13`, `jobs: 158`; second run `state_updated: false`; `objective complete 58` second run `roadmap_updated: false`; `git status --porcelain .planning/MILESTONES.md .planning/ROADMAP.md .planning/milestones` empty | 0 | PASS |
| 3: docs, help, suite | `node --test dispatch-completeness.test.cjs doc-refs.repo.test.cjs help.test.cjs` (34 tests); `df-tools validate docs --raw` printed `no documentation advisories`; `npm test` | 0 / 0 / 1 | PASS against baseline (3 known failures) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` | 0 | PASS: 34/34 (first run 33/34, see Deviations 1) |
| test (task 3, before commit) | `npm test` | 1 | PASS against baseline: 9808 tests, 9773 pass, 3 fail, 32 skipped; the 3 are the known baseline failures (MA-7 doctl handoff; roadmap-reconcile E2E1; stack-drafter-fleet github-enterprise-migration, TRD 43-08) |
| test (tasks 1 and 2) | n/a | n/a | not run per task: those commits change no code, only the SUMMARY checkpoint; the full gate ran before the Task 3 commit |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

Failing tests, by name, in the final run: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`; `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` (it names `59-07`: this TRD's SUMMARY exists in the checkout while the ROADMAP box is still `[ ]`, which `roadmap update-job-progress 59` ticks); `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md` (stack-drafter-fleet). (The `handoff pipeline — PTY-path mock auth (TRD 19-05)` line in the stream is MA-7's parent suite.) Totals equal 59-06's final run (9808 / 9773 / 3 / 32), as expected for a docs-only change.

## Discovered commands

None. The stack profile (`general`) supplied `npm test` and `node --test {files}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] My CLAUDE.md Merge driver bullet failed dispatch-completeness test 5**
- **Found during:** Task 3 scoped gate
- **Issue:** The first draft of the bullet wrote `` `execute-objective` `` in backticks inside a Core Tool bullet. `dispatch-completeness.test.cjs` reads the first word of every backtick span in those bullets as a df-tools command, so it reported `execute-objective: not a COMMANDS key`.
- **Fix:** wrote the workflow name without backticks ("the execute-objective workflow installs it and falls back to `merge-driver resolve <path>`"). The scoped gate then passed 34/34.
- **Files modified:** CLAUDE.md
- **Commit:** the Task 3 commit (the bullet was never committed in the failing form)

### Observations (no TRD code changed; recorded for gap closure)

**2. `milestone complete` appends a duplicate MILESTONES.md entry on a re-run** (Task 2). The command: `df --cwd <scratch>/ms milestone complete v1.4 --name "GitHub as system of record"` twice. Output: the second run printed `milestones_updated: true, state_updated: false`, and the scratch MILESTONES.md held two `## v1.4 GitHub as system of record (Shipped: 2026-10-05)` entries. Outside PLMB-05 as written (`state_updated`); listed under USER-GUIDE Known issues.

**3. `objective remove` still rewrites `NN-NN` date tokens (59-05's Deferred Issue)** was not exercised: the TRD names only `milestone complete` and `objective complete` for the scratch copy, and the orchestrator said to record it only if hit. It is listed under USER-GUIDE Known issues, with 59-05's reproduction (`2026-03-15` became `2025-02-15`).

**4. The advance-job dogfood was a no-op.** The TRD expected the verb to move Status to `Executing objective 59 — 6/7 TRDs complete`. The orchestrator's post-wave regeneration (fb6b91ec) had already written exactly that, so the run printed `advanced: false`, `state_md_updated: false` and left STATE.md and state.json byte-identical; there was nothing to commit. The result is the same fact, read from disk.

**5. Printed commands name the mirror.** `exec-context worktree`'s `preflight` and the WRONG CHECKOUT message print `node ~/.claude/devflow/bin/df-tools.cjs --cwd <worktree> ...`. The mirror lacks the guard until release, so the dogfood ran the same commands through the repo bin, as the TRD's binding rules say. Not a defect; it resolves at re-sync.

**6. Wave 2's merge subjects** read `merge: wave 2 TRD 59-0x` rather than the `df/exec-59-0*` branch names the TRD's evidence line expected; the four merges are present. The `.claude/worktrees/mystifying-gates` worktree in `git worktree list` pre-dates this run and is not mine; an empty `/Users/justin/dev/.df-worktrees/devflow-claude/` directory remains from provisioning.

### Auth gates

None.

## Release note

After re-sync, execute-objective's `merge-driver install` runs the mirror's df-tools and re-points this repository's driver from the repo copy to `~/.claude/devflow/bin/df-tools.cjs` (`changed: true` once). This repository's driver stays installed (`install --check` is `true`); only the scratch clone's was uninstalled.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one inline doc fix, Deviation 1)
- Must-haves verified: 6/6 (clone merge with uninstall; driver bin is the main checkout's; Status at 6/7; WRONG CHECKOUT then pass with cleanup; v1.4 at 13 objectives, 158 TRDs and the two truthful flags; docs and suite at baseline)
- Gate failures: None beyond the 3 known baseline failures

## Self-Check: PASSED

- FOUND: CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, plugins/devflow/devflow/bin/lib/help.cjs (each carries the new merge-driver / Parallel wave merges text)
- FOUND commits: bbd0053b, e85f5114, d1ccf50b (`git log --oneline`; d1ccf50b holds the four files plus this SUMMARY)
- This repository's `.planning/MILESTONES.md`, `ROADMAP.md` and `milestones/` were untouched by the scratch runs (`git status --porcelain` empty before the Task 3 edits).
- No scratch worktree, branch or claim remains (`git worktree list`, `git branch --list df/exec-59-07-dogfood`, `exec-context release` output).
