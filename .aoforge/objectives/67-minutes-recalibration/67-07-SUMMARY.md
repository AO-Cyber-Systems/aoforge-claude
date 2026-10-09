---
objective: 67-minutes-recalibration
job: "07"
subsystem: release
tags: [release, v2.15.0, push, pull-request, ci, approval-gates, v1.6, EST-10]

requires:
  - objective: 67-minutes-recalibration
    provides: "67-06: release commit f0df50dc (2.15.0) and the pre-live validation evidence"

provides:
  - "origin/feat/stack-profile-loader at PUSHED_SHA bcd255b28af8de33cdcd369946e2668d4b03d3ce (62 commits published, release commit f0df50dc included)"
  - "open release PR #127 feat/stack-profile-loader -> main, headRefOid == PUSHED_SHA"
  - "PR CI finished: 7 of 7 checks SUCCESS"

affects: [67-08, 67-09]

tech-stack:
  added: []
  patterns:
    - "two separate human-action approval gates (push, PR), each recorded with the user's literal reply"

key-files:
  created: []
  modified: []

key-decisions:
  - "The PR body upgrade note uses the CHANGELOG's wording (entries that need an installed plugin take effect once the installed plugin is at 2.15.0) instead of the TRD example's `/plugin update` instruction, because neither the CHANGELOG nor the 67-06 SUMMARY states that instruction (the same call 67-06 made)."
  - "The PR body states the npm test numbers without an explanation of the 34 skipped tests, because the 67-06 SUMMARY gives none."
  - "The duplicate lead paragraph in CHANGELOG `## [2.15.0]` (lines 11-17 and 19-21) was left alone: the user did not ask for it, and fixing it needs a new commit and a new push approval."

requirements-completed: []

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 10min
completed: 2026-10-08
tokens_input: 2304343
tokens_output: 31806
tokens_cache_read: 2158191
tokens_cache_write: 146084
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 07: Push the branch and open the release PR Summary

**The 2.15.0 release branch is on origin at `bcd255b2`, release PR #127 is open against `main`, and all 7 PR checks are SUCCESS.** The push and the PR were two separate approvals, each given as a literal reply. Nothing was merged, tagged or released.

## Result for 67-08

- **PUSHED_SHA:** `bcd255b28af8de33cdcd369946e2668d4b03d3ce` (contains the 67-06 release commit `f0df50dc`)
- **PR:** #127, https://github.com/AO-Cyber-Systems/devflow-claude/pull/127
- **PR title:** `Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)`
- **PR head:** `headRefOid` = `bcd255b28af8de33cdcd369946e2668d4b03d3ce` (equals PUSHED_SHA)
- **CI:** green, 7 of 7 checks SUCCESS (table below)
- **Merge, tag, release:** none (67-08)

## Progress
- [x] Task 1: Approval gate: push feat/stack-profile-loader to origin — no repo commit (live push)
- [x] Task 2: Approval gate: open the release PR feat/stack-profile-loader -> main — no repo commit (live PR)
- [x] Task 3: Wait for PR CI and record each check — no repo commit (read-only)

## Approvals (literal replies)

| Gate | Relayed reply | Action run once |
|---|---|---|
| Task 1: push | `approved` | `git push origin feat/stack-profile-loader` |
| Task 2: open PR | `APPROVED` | `gh pr create --repo AO-Cyber-Systems/devflow-claude --base main --head feat/stack-profile-loader --title "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" --body-file <planning-draft path>` |

The replies were relayed by the coordinator. The first approval did not cover the PR, and the PR checkpoint was presented separately with the full body and the exact command.

## Task 1: push

- **Pre-checks:** `git fetch origin`; local `feat/stack-profile-loader` = `bcd255b2` (PUSHED_SHA); the 67-06 release commit `f0df50dc chore(release): 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)` found on the branch; remote-only commits (`local..origin`) = 0; commits to publish (`origin..local`) = **62**; `origin/feat/stack-profile-loader` was `e7dc109c` (not equal to PUSHED_SHA, so not already done).
- **Command output:** `e7dc109c..bcd255b2  feat/stack-profile-loader -> feat/stack-profile-loader` (a fast-forward; no `--force`, no `--tags`, no other refspec).
- **Verify:** after a fresh `git fetch origin`, `origin/feat/stack-profile-loader` = `bcd255b28af8de33cdcd369946e2668d4b03d3ce` (equals PUSHED_SHA); `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` = 0.

## Task 2: release PR

- **Pre-checks:** `gh auth status` logged in as `justindonnaruma` with `repo` and `workflow` scopes; `gh pr list --head feat/stack-profile-loader --base main --state open` returned `[]` (no PR to adopt).
- **Command output:** `https://github.com/AO-Cyber-Systems/devflow-claude/pull/127`
- **Verify:** `gh pr list --repo AO-Cyber-Systems/devflow-claude --head feat/stack-profile-loader --base main --state open --json number,title,headRefOid,url` returned exactly one PR: number 127, the release title above, `headRefOid` `bcd255b28af8de33cdcd369946e2668d4b03d3ce`. `gh pr view 127 --json body -q .body` ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Body drafting:** drafted with the Write tool at a `planning draft` path (nothing written under `.planning/`) and passed with `--body-file`. Every claim comes from `CHANGELOG.md` `## [2.15.0]`, the 67-06 SUMMARY or `67-VALIDATION.md`; the 1.021, 1.051, 160/165 and 152/165 figures were re-checked against `67-VALIDATION.md`.

### PR body (as opened)

```markdown
Release **2.15.0** — milestone v1.6, objectives 66 and 67 (objective 65 shipped 2.14.0). The full notes are in `## [2.15.0] - 2026-10-08` in `CHANGELOG.md`.

## Executor token stamp (objective 66, EST-09)
- `df-tools tokens coverage [--milestone <v> | --objective <N>]` reports forward-stamp coverage (`tokens_source: "live"` over the counted TRD SUMMARYs) as an exact fraction and a decimal floored at 6 places, checks the 95% target with integers, and is read-only.
- The SubagentStop gate (`gate-executor-stop.js`) also blocks a `devflow:executor` once when its final SUMMARY has no `tokens_input`/`tokens_output`. A checkpoint SUMMARY, a stamped or backfilled final and a second stop stay silent.
- `execute-objective` runs every TRD in an executor, checkpoint-only TRDs included, and never writes a TRD's SUMMARY itself. The objective report gains a `**Token stamp:**` line.
- Fixed: `execute-objective` pointed continuation spawns at a `continuation-prompt.md` template that does not exist (the prompt is now inline and carries `PLAN_ID:` and `REPO_ROOT:`), and the `PLAN_ID:` line carried a slug id that `trd-identify.identifyTrd` cannot read, so the stop gate failed open. It now takes the short `{objective_number}-{plan_number}` id.

## Minutes recalibration (objective 67, EST-10)
- `df-tools calibrate --minutes <task_sum|trd_level>` and `--through <N>`. Calibration version 3 adds a `method` block, `{minutes, window_objectives, through_objective}`, inside `inputs_digest`, so two builds that differ in method never share a digest.
- The estimator reads calibration versions 1 to 3. With `method.minutes: trd_level` a TRD's minutes are the calibration's `trd_level.minutes` distribution whatever its task count; tokens and cost stay the per-task sum. A version 3 file with no `method` block, or one naming an unknown method, is refused with a reason that names `df-tools calibrate`.
- `trd_level` is now the default minutes method. `67-VALIDATION.md` scored `task_sum` against `trd_level` once, on leave-future-out calibrations of objectives 46 to 66, and the pre-registered ship rule returned `ship_default: true`. It fired on its first clause (the new method's own verdict is `met`), not on an improvement of the centre: the agent-minutes median ratio is 1.021 for `task_sum` and 1.051 for `trd_level`, while the P90 covers 160 of 165 TRDs against 152 of 165. `--minutes task_sum` keeps the previous behaviour.
- This is a retrospective reconstruction. EST-11, on objectives 68 to 72, is the prospective test; its calibration is built once with `--through 66` and is frozen until objective 75 has scored 68 to 72. EST-09 and EST-11 are not claimed met here.

**Upgrade note:** entries marked "Needs an installed plugin carrying objective N" take effect once the installed plugin is at 2.15.0. The 2.14.0 runtime refuses a version 3 calibration.

## Validation (at release commit `f0df50dc`)
- `npm test`: 11187 tests, 11153 pass, 34 skipped, 0 failing.
- Tag gate dry run for `v2.15.0` on the release commit: allowed. The control with `v2.16.0`: denied (no CHANGELOG entry).
- `changelog check 2.15.0`: `present`. `validate health`: 0 errors. `doctor --json`: 0 errors.
- `git merge-tree --write-tree origin/main feat/stack-profile-loader`: clean (exit 0).
- No tag, merge or release has happened. This PR only opens the release for review and CI.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Task 3: PR CI (read-only)

`gh pr checks 127 --repo AO-Cyber-Systems/devflow-claude --watch --interval 30` ran to completion in one call (no timeout). Final state from `gh pr checks 127 --json name,state,bucket,link`:

| Check | State | Bucket | Link |
|---|---|---|---|
| build | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796103273/job/113375841206 |
| harness | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796103731/job/113375843205 |
| test (npm test, gated) | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796103299/job/113375842038 |
| Analyze (actions) | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796135867/job/113375960441 |
| Analyze (javascript-typescript) | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796135867/job/113375960463 |
| Analyze (ruby) | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37796135867/job/113375960572 |
| CodeQL | SUCCESS | pass | https://github.com/AO-Cyber-Systems/devflow-claude/runs/113376336867 |

**Result: green.** Every check is SUCCESS. The watch output showed `CodeQL` as `skipping` for one refresh and `pass` once the analysis jobs finished; the final JSON reads SUCCESS. Durations from the watch: build 28s, harness 16s, `test (npm test, gated)` 3m55s, Analyze (actions) 1m2s, Analyze (javascript-typescript) 1m44s, Analyze (ruby) 57s, CodeQL 9s.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: push | `git fetch origin`; `git rev-parse origin/feat/stack-profile-loader` = `bcd255b2…`; `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` = 0 | 0 | PASS |
| 2: open PR | `gh pr list --head feat/stack-profile-loader --base main --state open --json number,title,headRefOid,url` (one PR, #127, `headRefOid` = PUSHED_SHA); `gh pr view 127 --json body -q .body` ends with the attribution line | 0 | PASS |
| 3: PR CI | `gh pr checks 127 --repo AO-Cyber-Systems/devflow-claude --json name,state,bucket,link` (7 checks, all SUCCESS) | 0 | PASS |

## Performance

- **Duration:** 10min (wall clock, including the two approval waits)
- **Started:** 2026-10-08T14:47:27Z (successful preflight claim)
- **Completed:** 2026-10-08T14:57:19Z
- **Tasks:** 3
- **Files modified:** 0 in the repo (the SUMMARY and planning state go into the docs commit)

## Deviations from Plan

### Auto-fixed Issues

None. The TRD executed as written.

### Notes

- **Preflight stop and retry.** The first `exec-context check --id 67-07` exited 1 (SHARED INDEX): a stale claim under the long id `67-07-push-branch-and-open-release-pr`, made at 14:36:19Z by a session from before a `/clear`. I stopped and reported it without writing anything. The coordinator confirmed that nothing was running, released the claim, and the re-run passed. This is a dispatch note, not a deviation: the claim id format (slug vs short id) differs between the dispatch and an earlier claim.
- **Upgrade-note wording and test line.** See key-decisions: the PR body follows the CHANGELOG's wording and states the test numbers without an explanation of the skips, because no source gives either.
- **Observation, left alone.** `CHANGELOG.md` `## [2.15.0]` has two overlapping lead paragraphs (lines 11-17 and 19-21). The second repeats the first. It is already in `f0df50dc` and now on the remote. The user did not ask for a fix, so it is untouched; a fix would be a new commit and a new push approval.

## Self-Check: PASSED

- origin/feat/stack-profile-loader = PUSHED_SHA `bcd255b28af8de33cdcd369946e2668d4b03d3ce`: FOUND (verified after a fresh fetch).
- Exactly one open PR feat/stack-profile-loader -> main (#127) with the release title and `headRefOid` == PUSHED_SHA: FOUND.
- PR body ends with the Claude Code attribution line: FOUND.
- 7 of 7 PR checks recorded, all SUCCESS: FOUND.
- No merge, no tag, no release: `git ls-remote --tags origin v2.15.0` was empty at 67-06 and this TRD ran no tag, merge or release command.
- Both approvals recorded with the literal replies (`approved`, `APPROVED`): FOUND.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (approvals recorded; origin == PUSHED_SHA containing the release commit; one release PR with title, head and attribution; CI recorded and green; no merge, tag or release)
- Gate failures: None
