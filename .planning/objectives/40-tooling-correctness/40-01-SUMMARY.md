---
objective: 40-tooling-correctness
trd: "01"
subsystem: tooling
tags: [df-tools, roadmap, milestone, reconcile, checkboxes]

# Dependency graph
requires:
  - objective: 09 (roadmap-reconcile)
    provides: "LOCKED reconcile({projectRoot, mode}) export with per-TRD change records (line_index/before/after)"
provides:
  - "Status-aware getMilestoneInfo: parses `## Milestones` bullets (🚧 / in progress / current, then highest ✅, then lowest 📋), legacy regexes kept as fallback"
  - "`roadmap update-job-progress <N>` ticks objective N's nested `- [ ] NN-MM-TRD.md — ...` checkboxes, scoped to N only, no Status rollups"
  - "update-job-progress JSON gains `trd_checkboxes_ticked` + `trd_checkboxes`"
affects: [init milestone-op, init new-milestone/complete-milestone consumers, validate regenerateState, execute-trd, executor, roadmap-reconcile E2E1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse a LOCKED module in dry-run, then apply a filtered subset of its change records (before-equality guarded) instead of calling its write mode"

key-files:
  created:
    - .planning/objectives/40-tooling-correctness/40-01-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.test.cjs

key-decisions:
  - "Nested TRD ticking = reconcile dry-run + filter to this objective's trd_summary_exists/trd_summary_failed changes; write mode rejected because it rewrites every objective's TRD lines and applies Status/Progress rollups repo-wide"
  - "Milestone priority: first 🚧, then first NON-shipped entry whose trailing text says `in progress`/`current`, then highest ✅ (numeric per-dot compare), then lowest 📋, then first bullet; legacy first-match regexes only when no bullet parses"
  - "Ticking only runs for purely-integer objective ids (/^\\d+$/): reconcile's OBJECTIVE_RE knows only integer `### Objective N:` headers, so decimal/suffixed ids have no section of their own"

patterns-established:
  - "Scoped dry-run apply: `reconcile({mode:'dry-run'}).changes.filter(kind && objective)` then `if (lines[i] === c.before) lines[i] = c.after`"

requirements-completed: [TOOL-01, TOOL-06]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 7min
completed: 2026-09-28
tokens_input: 5146584
tokens_output: 44081
tokens_cache_read: 4997531
tokens_cache_write: 148957
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 40 TRD 01: Milestone version + nested TRD checkbox ticking (roadmap.cjs) Summary

**`getMilestoneInfo` now reads the `## Milestones` bullet list by status (this repo: v1.3 "Autonomy hardening, ...", was v1.1 "candidates"), and `roadmap update-job-progress N` ticks objective N's nested TRD checkboxes by applying a scoped subset of the LOCKED `reconcile()` dry-run.**

## Performance

- Start: 2026-09-28T15:48:10Z
- End: 2026-09-28T15:55Z (approx.)
- Tasks: 2/2 (4 TDD commits: RED + GREEN per task)
- Files modified: 2 (`roadmap.cjs` +92, `roadmap.test.cjs` +357)

## Accomplishments

1. **TOOL-01, status-aware `getMilestoneInfo`.** New `MILESTONE_BULLET_RE` (with the `u` flag and literal ✅/🚧/📋 characters, plus an optional U+FE0F) parses all three bullet shapes the codebase emits: `**v1.3 — Name**` (this repo), `**v1.0 MVP** - ...` (templates/roadmap.md) and `**v0.1 — Adopted** (date, current)` (adopt.cjs). Only the lines between `## Milestones` and the next `#`/`##` heading are read, so the `### 📋 v1.4 candidates` heading can no longer leak into the name. Versions compare numerically per dot segment (v1.10 > v1.9). The return shape `{version: 'vX.Y', name}` is unchanged for all 5 consumers.
2. **TOOL-06, nested TRD checkboxes.** After its existing write, `cmdRoadmapUpdateJobProgress` runs `reconcile({projectRoot: cwd, mode: 'dry-run'})`. It keeps only the `trd_summary_exists` / `trd_summary_failed` changes whose normalised `objective_num` equals N and applies each one only when `lines[line_index] === before`. Other objectives' TRD lines, every `**Status:**` rollup and reconcile's Progress-row rollup are all left alone. The command is idempotent, and `roadmap-reconcile.cjs` is untouched.

### `init milestone-op` before / after (read-only, real repo)

| Field | Before | After |
|---|---|---|
| `milestone_version` | `"v1.1"` | `"v1.3"` |
| `milestone_name` | `"candidates"` | `"Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction"` |
| `milestone_slug` | `"candidates"` | `"autonomy-hardening-stack-profile-upgrade-adopt-doc-auto-correction"` |

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 82ae49d | test(40-01): failing getMilestoneInfo milestone-status cases |
| 1 | GREEN | 2a22901 | fix(40-01): getMilestoneInfo reports the in-progress milestone |
| 2 | RED | d246975 | test(40-01): failing nested TRD checkbox cases for update-job-progress |
| 2 | GREEN | 8b39c32 | fix(40-01): update-job-progress ticks the objective's TRD checkboxes |

## Scoping Decision (dry-run + filter, not write mode)

`reconcile({mode: 'write'})` fixes drift everywhere at once. It rewrites every objective's TRD lines and applies `**Status:** complete YYYY-MM-DD` plus the Progress-row `complete` rollup across the whole file. For a per-TRD hook that runs after every autonomous TRD, that would silently close other objectives, and it would collide with `update-job-progress`'s own column-aware Progress writer. So:

- reconcile runs in **dry-run** and is re-used as the single source of truth for the per-TRD rules (PASSED → `[x]`, FAILED → `[ ] ... (failed)`, no SUMMARY → untouched).
- Only the `trd_summary_*` kinds for objective N are applied. `objective_rollup_status` and `objective_rollup_progress` are never applied. Test 10 proves this: reconcile still proposes the 40 rollup after the command, but the Status line stays `in flight`.
- `objective_num` is compared after `parseInt` normalisation (`'040'` == `'40'`).
- A second write happens only when at least one line changed, so the zero-change path writes nothing extra.

## Test Evidence

### Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Status-aware getMilestoneInfo | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` | 0 (26/26) | PASS |
| 1: dogfood | `node plugins/devflow/devflow/bin/df-tools.cjs init milestone-op` | 0 (`v1.3`, `Autonomy hardening, ...`) | PASS |
| 2: nested TRD checkboxes | `node --test .../roadmap.test.cjs .../roadmap-reconcile.test.cjs .../objective.test.cjs` | 0 (97/97, incl. E2E1 zero drift) | PASS |
| 2: untouched files | `git diff --stat HEAD~4 -- .../roadmap-reconcile.cjs .planning/ROADMAP.md .planning/STATE.md` | 0 (empty) | PASS |

### TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test --test-name-pattern=getMilestoneInfo .../roadmap.test.cjs` | 1 (5 fail: cases 1-5; 6-7 pass) | FAIL (correct). Case 1 reproduced `{v1.1, candidates}` |
| T1 GREEN | `node --test .../roadmap.test.cjs` | 0 (26/26) | PASS (correct) |
| T2 RED | `node --test --test-name-pattern=nested .../roadmap.test.cjs` | 1 (3 fail: 8, 10, 11; 9 passes) | FAIL (correct) |
| T2 GREEN | `node --test .../roadmap.test.cjs .../roadmap-reconcile.test.cjs .../objective.test.cjs` | 0 (97/97) | PASS (correct) |
| REFACTOR | none needed (a comment reword only, re-verified 134/134 before the GREEN commit) | n/a | n/a |

Case 9 (scoping) passes in RED by design: before the fix nothing ticks, so it is a guard against over-application. Its fixture-sanity assertion shows that reconcile still proposes the 39-01 change after the command. The untouched line therefore proves scoping rather than an absent change.

### Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD verification: tests | `node --test .../roadmap.test.cjs .../roadmap-reconcile.test.cjs .../init.test.cjs` (+ objective.test.cjs) | 0 (134/134) | PASS |
| TRD verification: dogfood | `df-tools init milestone-op` reports v1.3 | 0 | PASS |
| TRD verification: single dry-run call | `rg -n -e 'reconcile\(' .../roadmap.cjs` → exactly one line, `mode: 'dry-run'` (line 405) | 0 | PASS |

Regression sweep across the other `getMilestoneInfo` / `update-job-progress` consumers:
- `init.test.cjs` + `validate.test.cjs`: 103/103
- `agent-shell-harness.test.cjs` + `df-tools.test.cjs`: 177/177

Test counts: roadmap.test.cjs went from 19 to 30 (+7 getMilestoneInfo, +4 nested-TRD). The scoped 3-file set went from 86 to 97. The full `npm test` suite was not re-run here, since this TRD's scope was covered by the scoped files above (baseline: 4168 / 4135 pass / 1 pre-existing MA-7 fail / 32 skipped).

## Deviations from Plan

### Implementation refinements (no Rule 1-4 triggers)

**1. Applied-list in outer scope.** Following the orchestrator's job-checker note, `const trdCheckboxes = []` is declared before the `if`. In the TRD snippet it was declared inside `if (mine.length)`, which would throw a ReferenceError on the zero-change path (case 11).
- Files: roadmap.cjs. Commit: 8b39c32

**2. Integer-only guard is `/^\d+$/`, not `!objectiveNum.includes('.')`.** This is stricter: a letter-suffixed id such as `12A` would have gone through `parseInt` to `12` and ticked objective 12's lines. Decimal ids are still skipped, as the TRD intended.
- Files: roadmap.cjs. Commit: 8b39c32

**3. `in progress` / `current` text only marks non-✅ entries, and any 🚧 entry beats a text-marked one.** A shipped entry whose trailing prose happens to contain "current" cannot hijack the pick. The adopt scaffold (no emoji, `(date, current)`) still resolves as in progress (case 5).
- Files: roadmap.cjs. Commit: 2a22901

**4. Comments reworded so the TRD's `rg 'reconcile\('` check returns exactly one line.** Three explanatory comments had mentioned `reconcile()`. This was a wording change only, made before the Task 2 GREEN commit.
- Files: roadmap.cjs. Commit: 8b39c32

**5. Extra regression assertion in case 2.** The existing `FIVE_COLUMN_ROADMAP` (`**v1.0**` with an empty name) returns `{v1.0, milestone}`. This covers the rule "an empty name gives 'milestone'".
- Files: roadmap.test.cjs. Commit: 82ae49d

The existing 5-column / 4-column / Jobs-line / computeJobsLineText tests passed unmodified (Test list case 12). roadmap-reconcile.cjs, `.planning/ROADMAP.md` and `.planning/STATE.md` were not touched.

## Issues Encountered

None.

## Deferred Issues

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths (status-aware pick + fallback; real-repo v1.3; three bullet shapes; tick/failed/untouched; scoping + no rollups + idempotent; new output fields with roadmap-reconcile.cjs unmodified)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/roadmap.cjs
- FOUND: plugins/devflow/devflow/bin/lib/roadmap.test.cjs
- FOUND: 82ae49d, 2a22901, d246975, 8b39c32 (git log)
