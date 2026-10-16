---
objective: 53-worktree-and-health-hygiene
trd: "05"
subsystem: repo-hygiene
tags: [awareness, global-claude-md, template-version, project-md, health, archive]
requires: []
provides:
  - awareness.cjs without the dead AWARENESS_CACHE_REL export (13-entry surface)
  - global-claude-md template v3 routing to /devflow:doctor
  - PROJECT.md with `## Core Value` and `## Requirements` (W001 closed)
  - UI-VISUAL-EVAL-* ad-hoc objectives archived under milestones/v1.2-objectives (W005 closed)
affects: [global-upgrade, doctor, validate-health]
tech-stack:
  added: []
  patterns: ["template_version bump is the only thing that refreshes an existing managed block"]
key-files:
  created:
    - .planning/milestones/v1.2-objectives/
  modified:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/templates/global-claude-md.md
    - plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs
    - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs
    - plugins/devflow/hooks/sync-runtime.test.js
    - .planning/PROJECT.md
decisions:
  - "W005 closed by archiving (git mv) rather than by an ignore list in health Check 6"
  - "Archive commit kept to pure renames; the SUMMARY progress tick rides on the docs commit instead"
metrics:
  duration: "~20 min (includes one stream stall and resume)"
  completed: 2026-10-04
requirements-completed: ["53-5", "53-7"]
tokens_input: 5939226
tokens_output: 33821
tokens_cache_read: 5735703
tokens_cache_write: 203409
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 53 TRD 05: Objective 45 leftovers and repo health Summary

Removed the dead `AWARENESS_CACHE_REL` export, bumped the global CLAUDE.md template to v3 with a `/devflow:doctor` routing line, gave PROJECT.md the `## Core Value` and `## Requirements` sections, and archived the three `UI-VISUAL-EVAL-*` dirs with `git mv` so `validate health` shows no W001 and no W005.

## Progress
- [x] Task 1 RED: pin tests to the 13-entry awareness surface and template v3 — 62cbab37
- [x] Task 1 GREEN: delete AWARENESS_CACHE_REL from awareness.cjs; add the `/devflow:doctor` line to templates/global-claude-md.md and set template_version "3" — fdd79f08
- [x] Task 2a: PROJECT.md `## Core Value` and `## Requirements` — 67ef6a9e
- [x] Task 2b: `git mv` the three UI-VISUAL-EVAL-* dirs to .planning/milestones/v1.2-objectives/ — b46cfd23

## What changed

**53-5a.** `AWARENESS_CACHE_REL`, its comment and its export line are gone from awareness.cjs. The legacy path survives as `awareness-store.LEGACY_CACHE_REL` (`.planning/.awareness-cache.json`), which migration 0008 and doctor already used. awareness.test.cjs now locks a 13-entry export surface and asserts `AWARENESS_CACHE_REL === undefined`.

**53-5b.** templates/global-claude-md.md gains `- Diagnose and safely repair the install and project state → /devflow:doctor (doctor --fix)` and `template_version: "3"`. Block staleness is the template version alone, so existing managed `~/.claude/CLAUDE.md` blocks pick up both this line and the earlier gh-sync line at the next global upgrade. The three pins that render the real template moved from v=2 to v=3 (global-upgrade.test.cjs, upgrade-cli.test.cjs, sync-runtime.test.js). Fixture templates written by tests were left alone.

**53-7 W001.** PROJECT.md: the inline `**Core value:**` sentence moved verbatim under a new `## Core Value`; a new `## Requirements` (Validated, Active, Out of Scope) points at existing `## Scope`, `## Out of Scope`, `## Context` and the v1.4 audit. Nothing invented. Footer date updated.

**53-7 W005.** Ten files in three dirs moved with `git mv` to `.planning/milestones/v1.2-objectives/`. The commit is 10 renames with 0 insertions and 0 deletions. `git log --follow` reaches 31b4792d (#66).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test awareness.test.cjs global-upgrade.test.cjs upgrade-cli.test.cjs sync-runtime.test.js` (before the fix) | 1 | FAIL (correct): L1 export list, AWARENESS_CACHE_REL-gone, global-upgrade 4 and 13, upgrade-cli 10, sync-runtime 15 |
| 1 GREEN | same four files plus `doc-refs.repo.test.cjs` | 0 | PASS: 216 tests, 207 pass, 0 fail, 9 skipped (GIT_INTEGRATION-gated live-git tests) |
| 1 | `rg -n AWARENESS_CACHE_REL plugins/devflow/devflow/bin/lib/awareness.cjs` | 1 (no match) | PASS: no output, as expected |
| 2a | `df-tools validate health` | 0 | PASS: no W001 (W005 x3 still present, cleared by 2b) |
| 2b | `df-tools validate health` | 0 | PASS: warnings are W040 only; no W001, no W005 |
| 2b | `git show --stat -M HEAD` | 0 | PASS: 10 files changed, 0 insertions, 0 deletions, all renames |
| 2b | `git log --follow --oneline -- .planning/milestones/v1.2-objectives/UI-VISUAL-EVAL-DEVFLOW/OBJECTIVE.md` | 0 | PASS: b46cfd23, 31b4792d, 15ee8de9 |
| 2b | `findObjectiveInternal(cwd, 'UI-VISUAL-EVAL-JUDGE')` | 0 | PASS: found, `.planning/milestones/v1.2-objectives/UI-VISUAL-EVAL-JUDGE`, archived `v1.2` (see Deviations for the CLI) |
| 2b | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs` | 0 | PASS: 24/24 |

Archive commit stat (`git show --stat -M HEAD`, b46cfd23):

```
 .../UI-VISUAL-EVAL-CALLOUT/UI-VISUAL-EVAL-CALLOUT-01-TRD.md               | 0
 .../v1.2-objectives}/UI-VISUAL-EVAL-DEVFLOW/OBJECTIVE.md                  | 0
 .../UI-VISUAL-EVAL-DEVFLOW/UI-VISUAL-EVAL-DEVFLOW-01-TRD.md               | 0
 .../UI-VISUAL-EVAL-DEVFLOW/UI-VISUAL-EVAL-DEVFLOW-02-TRD.md               | 0
 .../UI-VISUAL-EVAL-DEVFLOW/UI-VISUAL-EVAL-DEVFLOW-03-TRD.md               | 0
 .../UI-VISUAL-EVAL-DEVFLOW/UI-VISUAL-EVAL-DEVFLOW-VERIFICATION.md         | 0
 .../v1.2-objectives}/UI-VISUAL-EVAL-JUDGE/OBJECTIVE.md                    | 0
 .../v1.2-objectives}/UI-VISUAL-EVAL-JUDGE/UI-VISUAL-EVAL-JUDGE-01-TRD.md  | 0
 .../v1.2-objectives}/UI-VISUAL-EVAL-JUDGE/UI-VISUAL-EVAL-JUDGE-02-TRD.md  | 0
 .../UI-VISUAL-EVAL-JUDGE/UI-VISUAL-EVAL-JUDGE-VERIFICATION.md             | 0
 10 files changed, 0 insertions(+), 0 deletions(-)
```

`validate health` after the archive: `warnings: [W040 project-behind (migration 0009 pending, a stated user action)]`. The I001 lines are the known false positive for named TRDs that 53-02 owns.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task) | `node --test` on the files in Task 1's `<verify>` | 0 | PASS |
| test (task, repo-wide scanners) | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs` | 0 | PASS |
| health (Task 2) | `df-tools validate health` | 0 | PASS: no W001, no W005 |
| test (objective gate) | `npm test` | not run | deferred to 53-07 by the TRD, so recorded as `not_available` here rather than PASS |

## Deviations from Plan

### Auto-fixed Issues

None. The TRD's code and content changes were applied as written.

### Divergences from the TRD text

**1. [Verification] Test list item 8 cannot pass through the CLI as written**
- **Found during:** Task 2b
- **Issue:** The TRD expected `df-tools find-objective UI-VISUAL-EVAL-JUDGE` to report found under `.planning/milestones/v1.2-objectives`. The CLI command (`cmdFindObjective` in objective.cjs) scans only `.planning/objectives/` and never the milestone archives, for any objective. It returns `found: false` after the move. The TRD's key_link described the archive-aware path, which is `findObjectiveInternal`, not the CLI verb.
- **Resolution:** Directory name is exactly `v1.2-objectives`, so the recovery branch (rename check) did not apply. Verified the intended property directly: `findObjectiveInternal` finds all three dirs, `archived: "v1.2"`. Did not revert and did not change `cmdFindObjective` (out of scope for this TRD). This is consistent with the TRD's own rationale that archiving removes the dirs from every current-objective scanner.
- **Follow-up for the orchestrator:** if `find-objective` should reach archived objectives, that is a separate small change to `cmdFindObjective`; it would also affect every other archived objective.

**2. [Process] Archive commit does not carry the SUMMARY progress tick**
- The TRD requires the archive commit to be pure renames (test list item 7). The protocol also asks for SUMMARY.md in every task commit. The renames won, so the Task 2b tick lands in the final docs commit.

**3. [Process] SUMMARY written with the Write tool, not `summary checkpoint|post`**
- The dispatch warns that those verbs may drop an untracked copy in the main checkout (the bug 53-01 is fixing). With the store off the verb writes the same file, so the file was written directly in the worktree and committed on `df/exec-53-05`. Nothing was touched in the main checkout.

**4. [Process] Preflight first run hit the main checkout**
- The first `exec-context check` ran with the session's working directory, which is the main checkout already claimed by 53-03, and reported SHARED INDEX. It was re-run against the worktree with `--cwd` (the dispatch said to run it from the worktree) and passed: checkout `/Users/justin/dev/.df-worktrees/devflow-claude/53-05`, branch `df/exec-53-05`, base visible. All work was done in the worktree.

## Auth gates

None.

## Discovered commands

None. The `test` gate resolved to `npm test` from the stack profile; the TRD scopes the task gate to specific files.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4
  - awareness.cjs no longer defines or exports AWARENESS_CACHE_REL; awareness-store LEGACY_CACHE_REL is still `.planning/.awareness-cache.json` (asserted by test)
  - template is v3 and contains `/devflow:doctor` (global-upgrade test 13)
  - PROJECT.md has both sections, `validate health` shows no W001
  - the three dirs were moved with `git mv` (R100 renames, history reachable with `--follow`), `validate health` shows no W005
- Gate failures: None

## Self-Check: PASSED

- FOUND: commits 62cbab37, fdd79f08, 67ef6a9e, b46cfd23 on `df/exec-53-05` (`git log --oneline ade74256..HEAD`)
- FOUND: `.planning/milestones/v1.2-objectives/{UI-VISUAL-EVAL-CALLOUT,UI-VISUAL-EVAL-DEVFLOW,UI-VISUAL-EVAL-JUDGE}` with all 10 files
- FOUND: no `UI-VISUAL-EVAL-*` left under `.planning/objectives/`
- FOUND: no `AWARENESS_CACHE_REL` in awareness.cjs
