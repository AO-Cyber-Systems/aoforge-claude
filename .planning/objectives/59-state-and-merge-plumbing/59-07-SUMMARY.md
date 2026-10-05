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

requirements-completed: [PLMB-01, PLMB-02, PLMB-03, PLMB-04, PLMB-05]

duration: in progress
completed: 2026-10-05
---

# Objective 59 TRD 07: Dogfood and docs Summary

**In progress.**

## Progress
- [x] Task 1: Live merge, position and preflight on this repository (evidence 1-4) — bbd0053b
- [x] Task 2: Milestone and change flags on a scratch copy of .planning (evidence 5) — (this commit)
- [ ] Task 3: Docs, help details and the full test run (evidence 6) — next step: add the CHANGELOG [Unreleased] entries, then CLAUDE.md, USER-GUIDE and the help.cjs exec-context lines

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

`milestone complete` is not idempotent for MILESTONES.md: the second run printed `milestones_updated: true` and appended a SECOND `## v1.4 GitHub as system of record (Shipped: 2026-10-05)` entry (scratch MILESTONES.md lines 117 and 243). `state_updated` is truthful (PLMB-05 as written), but the entry is duplicated on a re-run. Worth a TRD of its own: skip the append when an entry for the version already exists, or report `milestones_updated: false`.
