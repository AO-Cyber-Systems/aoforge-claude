---
objective: 40-tooling-correctness
trd: "02"
subsystem: tooling
tags: [df-tools, objective-complete, objective-remove, state-md, narrative-log]

# Dependency graph
requires: []
provides:
  - "`objective complete <N>` on a narrative STATE.md inserts one `**Objective complete:** N — <title> (completed <date>, S/J TRDs)` line directly after the LAST existing log line (idempotent, never touches `**Status:**`)"
  - "`objective complete` JSON: `state_updated` = an actual write happened; new `state_update_reason` ∈ null | already_logged | no_log_anchor | state_missing | unchanged"
  - "`objective remove --confirm` JSON: `state_updated` = an actual write happened (was file existence)"
affects: [execute-objective workflow (objective complete call), transition workflow, remove-objective workflow, TRD 40-06 (objective completion / STATE backfill)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Truthful mutation flag: read `original`, derive `next`, write and set `*_updated` only when `next !== original`; carry a `*_reason` string when nothing was written"

key-files:
  created:
    - .planning/objectives/40-tooling-correctness/40-02-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs

key-decisions:
  - "Narrative append is additive only: insert after the last `**Objective complete:**` line; with no such line write nothing (`no_log_anchor`), never EOF or before `## Session Continuity`"
  - "Log number keeps the decimal part (`12.1` stays `12.1`, `07` becomes `7`) instead of the TRD's `parseInt` shape, which collapsed 12.1 into 12 and made an inserted objective look already logged"
  - "Title = first `#{2,4} Objective N:` ROADMAP heading (codebase-wide heading convention, a superset of the TRD's `###`) with trailing ✅/U+FE0F stripped; fallback objective_name with hyphens as spaces; last resort `Objective N`"
  - "Legacy schema no-op reports `state_updated: false, state_update_reason: 'unchanged'` (a reason the TRD left unspecified)"
  - "Tightened, approved by the job-checker: the existing narrative test moved from byte-identical STATE.md to 'byte-identical apart from exactly one appended objective-12 log line, Status line byte-identical'"

patterns-established:
  - "`state_update_reason` alongside `state_updated` so callers can tell 'already recorded' from 'nowhere to record it'"

requirements-completed: [TOOL-02]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-09-28
tokens_input: 4699799
tokens_output: 40612
tokens_cache_read: 4592165
tokens_cache_write: 107542
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 40 TRD 02: `objective complete` writes the narrative log line and reports truthfully Summary

**`objective complete N` on a narrative STATE.md now inserts one idempotent `**Objective complete:** N — <ROADMAP title> (completed <date>, S/J TRDs)` line after the last log line. `**Status:**` is never touched. `state_updated` now reports an actual write, with a `state_update_reason` when there was none. The same existsSync-based flag is also fixed in `objective remove`.**

## Performance

- Start: 2026-09-28T15:56:50Z
- End: 2026-09-28T16:00Z (approx.)
- Tasks: 2/2 planned (4 TDD commits: RED + GREEN for the TRD, RED + GREEN for the Rule 1 `objective remove` fix)
- Files modified: 2 (`objective.cjs` +112/−20 across both fixes, `objective.test.cjs` +278)

## Accomplishments

1. **Narrative log append (TOOL-02).** In `cmdObjectiveComplete`, the narrative branch (no `**Current Objective:**`) now does one of three things:
   - It inserts the log line after the last `^\*\*Objective complete:\*\*.*$` match.
   - It skips when `^\*\*Objective complete:\*\*\s*0*N\s*[—–-]` already exists (`already_logged`).
   - It skips when there is no log line to anchor to (`no_log_anchor`).

   The line's EOL follows the file (`\r\n` only if the file already uses it). The legacy field replaces are byte-for-byte unchanged, but they now share the `next !== original` write check.
2. **Truthful flag.** `state_updated: fs.existsSync(statePath)` is gone. The flag is set only on an actual write, and `state_update_reason` is `null` when a write happened. `rg -n -e 'state_updated: fs.existsSync' objective.cjs` prints nothing.
3. **Helpers.**
   - `logObjectiveNumber` handles zero-padded and decimal numbers.
   - `objectiveTitle` does the ROADMAP heading lookup with ✅ stripping and the fallbacks.
   - `escapeRegExp` is a local helper.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 324d27b | test(40-02): failing narrative-log and state_updated cases |
| 2 | GREEN | 6c2b1a2 | fix(40-02): objective complete appends narrative log line; state_updated is truthful |
| Rule 1 | RED | 8531287 | test(40-02): failing objective remove state_updated case |
| Rule 1 | GREEN | 9a52a62 | fix(40-02): objective remove reports state_updated from an actual write |

## Tightened test (job-checker approved)

The only edit to an existing assertion is `objective.test.cjs` → "objective complete — STATE.md narrative schema". It previously asserted `state === NARRATIVE_STATE` (byte-identical). The *intent* of that assertion was "narrative content survives, and Status is not clobbered back to a legacy template value". TOOL-02 legitimately adds one line. So the test now asserts four things:
- The two original `doesNotMatch` Status assertions are kept.
- The `**Status:**` line is byte-identical to the fixture.
- Exactly one `^\*\*Objective complete:\*\* 12 — ` line exists.
- With that line removed, the file equals `NARRATIVE_STATE` byte for byte.

This is stricter than before about everything except the one anchored, idempotent line. The legacy test was only *extended*, with `state_updated === true` and `state_update_reason === null`. It was not relaxed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Decimal objectives collapsed by `parseInt` in the target shape**
- **Found during:** Task 1 (test design)
- **Issue:** The TRD's target shape normalizes with `String(parseInt(objectiveNum, 10))`. For an inserted objective `12.1` that yields `12`. The idempotency regex would then match objective 12's existing log line (`already_logged`), and the line would be written as `12 —`.
- **Fix:** `logObjectiveNumber` strips leading zeros from the integer part only and keeps the decimal part. The number is regex-escaped for both the idempotency check and the heading lookup. Covered by the test "decimal objective 12.1 is not mistaken for an already-logged objective 12".
- **Files modified:** objective.cjs, objective.test.cjs
- **Commit:** 324d27b (test), 6c2b1a2 (fix)

**2. [Rule 1 - Bug] `objective remove --confirm` had the same `state_updated: fs.existsSync(statePath)` defect**
- **Found during:** Task 2 done-criterion check. `rg -n -e 'state_updated: fs.existsSync' objective.cjs` still printed line 690 (`cmdObjectiveRemove`). The criterion and must-have ("never computed from `fs.existsSync(statePath)` again") are file-wide.
- **Issue:** remove rewrote STATE.md unconditionally and reported `true` even when neither the `**Total Objectives:**` nor the `of N objectives` pattern matched.
- **Fix:** Write only when content changed, and report that. There is no `state_update_reason` on remove, to keep the change minimal. The existing df-tools.test.cjs dry-run assertion (`state_updated: false`) is unaffected.
- **Files modified:** objective.cjs, objective.test.cjs
- **Commit:** 8531287 (test), 9a52a62 (fix)

### Additions beyond the Test list (coverage for must-have truths, no scope change)

- 2b: a trailing ✅ is stripped from the heading title. This repo's real `### Objective 39: ... ✅` needs it.
- 2c: with no ROADMAP heading, the title falls back to objective_name.
- Zero-padded `07` writes `7 —`, and a later `7` is `already_logged`.
- Legacy second run gives `state_updated: false`, `state_update_reason: 'unchanged'`. This is the must-have "legacy `state_updated: true` only when the file content actually changed".

**Total deviations:** 2 auto-fixed (Rule 1). **Impact:** both bring the file in line with the TRD's own must-haves. There is no structural change, and no files outside `files_modified` were touched.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` | 1 | PASS (17 tests: 12 fail, all new/tightened TOOL-02 cases; 5 untouched cases pass) |
| 2: GREEN | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` | 0 | PASS (47/47) |
| 2: done | `rg -n -e 'state_updated: fs.existsSync' plugins/devflow/devflow/bin/lib/objective.cjs` | 1 (no output) | PASS (after Rule 1 fix 2) |
| 2: done | `git diff --stat ca2ccee -- .planning/STATE.md .planning/ROADMAP.md` | 0 (empty) | PASS |
| Rule 1 RED | `node --test --test-name-pattern "objective remove" .../objective.test.cjs` | 1 | PASS (no-count case: `true !== false`) |
| Rule 1 GREEN | `node --test .../objective.test.cjs .../roadmap.test.cjs` | 0 | PASS (49/49) |
| Regression | `node --test --test-reporter=dot plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (no failures) |
| Regression | `node --test ... df-tools.test.cjs --test-name-pattern "remove\|complete"` | 0 | PASS (140/140, including all 11 `objective remove` + 6 `objective complete` cases) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (TOOL-02) | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` | 1 | FAIL (correct): 12 failures on missing line / absent `state_update_reason` / `state_updated` true from existsSync |
| GREEN (TOOL-02) | `node --test .../objective.test.cjs .../roadmap.test.cjs` | 0 | PASS (correct): 47/47 |
| RED (remove) | `node --test --test-name-pattern "objective remove" .../objective.test.cjs` | 1 | FAIL (correct): 1/2 fails |
| GREEN (remove) | `node --test .../objective.test.cjs .../roadmap.test.cjs` | 0 | PASS (correct): 49/49 |
| REFACTOR | n/a | — | none needed |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| scoped tests | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` | 0 | PASS (19/19) |
| sibling regression | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` | 0 | PASS (30/30, in the combined 49/49 run) |
| scratch dogfood | `df-tools.cjs --cwd <scratch> objective complete 39` | 0 | PASS (below) |

## Scratch dogfood (not the repo)

The scratch dir `<scratchpad>/dogfood-40-02/.planning/` held copies of `STATE.md`, `ROADMAP.md` and `objectives/39-telemetry-audit-cli/`, each made with its own `cp`.

First run of `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <S> objective complete 39`:

```json
{ "completed_objective": "39", "objective_name": "telemetry-audit-cli", "jobs_executed": "5/5",
  "is_last_objective": true, "date": "2026-09-28", "roadmap_updated": true,
  "state_updated": true, "state_update_reason": null }
```

`<S>/.planning/STATE.md` diff vs the repo copy: `1 file changed, 1 insertion(+)`:

```
31: **Objective complete:** 36 — Upgrade in place (verified 2026-09-27 ...)
32: **Objective complete:** 39 — Wire the telemetry & audit CLI (completed 2026-09-28, 5/5 TRDs)
33: **Status:** Objective complete — ready for verification
```

The trailing ✅ on the real heading is stripped and the Status line is untouched. The second run gave `"state_updated": false, "state_update_reason": "already_logged"`, and the file was unchanged.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths (narrative insert-after-last, heading title and fallback, idempotent, no_log_anchor / state_missing, legacy truthful, no `state_updated: fs.existsSync` in objective.cjs)
- Gate failures: None
- Repo `.planning/STATE.md` / `.planning/ROADMAP.md`: untouched (all runs were in tmp dirs and the scratchpad)

## Follow-ups (not this TRD)

- **This repo's STATE.md log is missing 37, 38 and 39.** Backfilling them is a STATE-editing action for the objective-completion flow (TRD 40-06) or a human, not this TRD. Running `objective complete 37|38|39` with this fix appends each once, in run order, after the current last log line (36).
- **`roadmap.cjs:561` still reports `state_updated: fs.existsSync(statePath)`** in another command. That file is owned by TRD 40-01 and is outside this TRD's `files_modified`, so it was deliberately left alone. It is the same defect class and worth a small follow-up.
- The dispatch did not name a `WAVE_BASE`. Preflight used `ca2ccee` (the 40-01 completion tip on `feat/stack-profile-loader`), which was HEAD at dispatch.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/objective.cjs
- FOUND: plugins/devflow/devflow/bin/lib/objective.test.cjs
- FOUND: 324d27b, 6c2b1a2, 8531287, 9a52a62
