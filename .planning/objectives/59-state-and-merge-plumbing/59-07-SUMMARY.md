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
- [x] Task 1: Live merge, position and preflight on this repository (evidence 1-4) — (this commit)
- [ ] Task 2: Milestone and change flags on a scratch copy of .planning (evidence 5) — next step: `cp -R .planning` into the scratchpad `ms/` dir, then run `milestone complete v1.4 --name "GitHub as system of record"` with `--cwd <scratch>/ms`
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
