---
objective: 39-telemetry-audit-cli
job: "05"
subsystem: testing
tags: [context-audit, changelog, full-suite-gate, telemetry]

# Dependency graph
requires:
  - objective: 39-01..04
    provides: wired `df-tools context`/`session-audit`/`transcript-export`/`override`, hook-inventory + dispatch-completeness tests, CLAUDE.md CLI inventory flipped to live
provides:
  - Fresh, dated, caveated `read_share_pct` re-measurement (24.5%, ok) replacing objective 29's stale 53.6% figure, without rewriting objective 29's own records
  - CHANGELOG `[Unreleased]` entries for the four newly-wired commands, the two new gate tests, and the hook-inventory/site-example fix
  - Full-suite regression gate re-confirmed at 4168/4135/1/32 (unchanged from post-39-04 baseline)
affects: [41-retroactive-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["dated append-only re-measurement blocks in reference docs (do not edit prior dated audits in place)"]

key-files:
  created:
    - .planning/objectives/39-telemetry-audit-cli/39-05-SUMMARY.md
  modified:
    - plugins/devflow/devflow/references/context-discipline.md
    - CLAUDE.md
    - CHANGELOG.md

key-decisions:
  - "Reported both the JSON (24.5%) and --raw (24.4%) read_share figures verbatim rather than picking one; used the JSON targets.read_share_pct (24.5%) as the canonical figure in prose since it is unrounded-once vs raw's second rounding pass."
  - "Bash-per-Read call ratio recomputed from scratch (9,479/672 ≈ 14x) rather than reusing the stale 7x — the underlying by_tool composition shifted enough (Read share 59%→24.5%) that the old ratio no longer holds."

patterns-established: []

requirements-completed: ["AUD-10", "AUD-11", "AUD-12"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 6min
completed: 2026-09-28
tokens_input: 6310130
tokens_output: 30531
tokens_cache_read: 6219462
tokens_cache_write: 90516
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 39 TRD 05: Re-baseline `read_share_pct`, CHANGELOG, full-suite gate Summary

**Re-ran the now-wired `df-tools context --limit 150` against real `~/.claude/projects` transcripts (`read_share_pct` 53.6%→24.5%, still under the 40% target), recorded it dated/caveated in context-discipline.md and CLAUDE.md, added four CHANGELOG `[Unreleased]` entries, and confirmed the full suite still holds at 4168/4135/1/32 with only the pre-existing MA-7 failure.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-09-28T15:05:44Z
- **Completed:** 2026-09-28T15:11:00Z
- **Tasks:** 2
- **Files modified:** 3 (context-discipline.md, CLAUDE.md, CHANGELOG.md)

## Accomplishments
- Objective 29's acceptance metric re-baselined with a real, dated, caveated CLI run (not the ad hoc lib-direct 24.6% from RESEARCH.md)
- CHANGELOG `[Unreleased]` now documents all four previously-"Unknown command" CLI entries plus the two new gate tests and the hook-inventory/site-example fix
- Full-suite gate re-confirmed with zero new failures

## Re-baseline: `df-tools context --limit 150`

Run 2026-09-28 against the real `~/.claude/projects` (150 files scanned — this repo's own real session history, same root as objective 29's original 2026-08-19 measurement).

**JSON (`df-tools context --limit 150`):**
```json
{
  "files_scanned": 150,
  "total_tokens": 12114011,
  "composition": {
    "tool_results_pct": 58.1,
    "tool_inputs_pct": 33.4,
    "assistant_text_pct": 5.7,
    "images_pct": 2.7
  },
  "by_tool": [
    { "tool": "Bash", "calls": 9479, "tokens": 4876528, "share_pct": 66.1, "avg_per_call": 514, "max": 7395 },
    { "tool": "Read", "calls": 672, "tokens": 1803868, "share_pct": 24.5, "avg_per_call": 2684, "max": 15836 },
    { "tool": "WebSearch", "calls": 281, "tokens": 289192, "share_pct": 3.9, "avg_per_call": 1029, "max": 3097 },
    { "tool": "WebFetch", "calls": 223, "tokens": 100095, "share_pct": 1.4, "avg_per_call": 449, "max": 9496 },
    { "tool": "Artifact", "calls": 65, "tokens": 72553, "share_pct": 1, "avg_per_call": 1116, "max": 12500 },
    { "tool": "mcp__plugin_playwright_playwright__browser_evaluate", "calls": 108, "tokens": 63842, "share_pct": 0.9, "avg_per_call": 591, "max": 7684 },
    { "tool": "mcp__plugin_playwright_playwright__browser_take_screenshot", "calls": 98, "tokens": 34116, "share_pct": 0.5, "avg_per_call": 348, "max": 1609 },
    { "tool": "Agent", "calls": 109, "tokens": 26475, "share_pct": 0.4, "avg_per_call": 243, "max": 267 },
    { "tool": "Edit", "calls": 292, "tokens": 14318, "share_pct": 0.2, "avg_per_call": 49, "max": 232 },
    { "tool": "mcp__claude_ai_Gmail__search_threads", "calls": 2, "tokens": 13857, "share_pct": 0.2, "avg_per_call": 6929, "max": 6980 },
    { "tool": "Write", "calls": 251, "tokens": 11329, "share_pct": 0.2, "avg_per_call": 45, "max": 101 },
    { "tool": "mcp__plugin_playwright_playwright__browser_snapshot", "calls": 8, "tokens": 9775, "share_pct": 0.1, "avg_per_call": 1222, "max": 3742 }
  ],
  "result_size_tokens": { "p50": 232, "p90": 1500, "p99": 5989, "max": 15836 },
  "context_per_turn": {
    "subagent": { "turns": 9668, "p50": 229326, "p90": 362835, "p99": 481585, "max": 558848, "over_200k_pct": 57.3 },
    "main_thread": { "turns": 13618, "p50": 464875, "p90": 799734, "p99": 967886, "max": 997001, "over_200k_pct": 95.2 }
  },
  "targets": { "read_share_pct": 24.5, "read_share_target": 40, "read_share_ok": true },
  "note": "Images priced per block (~1500 tok), NOT by base64 length — chars/4 over-states them ~25x."
}
```

**`--raw`:**
```
files_scanned: 150
composition: tool_results 58.2%, tool_inputs 33.4%, assistant_text 5.7%, images 2.7%
read_share: 24.4% of tool-result tokens (target < 40%: ok)
context/turn subagent: p50 229326, p90 362835, over_200k 57.3%
context/turn main_thread: p50 464600, p90 799734, over_200k 95.2%
```

**Old vs new:** `read_share_pct` was **53.6%** (`read_share_ok: false`, 2026-08-19, lib-direct, objective 29's own audit). It is now **24.5%** (JSON `targets.read_share_pct`; `--raw` rounds to 24.4%), **`read_share_ok: true`**. Read's per-call cost is up slightly (2,311→2,684 tokens/call) but its overall share of tool-result tokens dropped because Bash call volume grew far faster (7×→14× Read's call count at 514 tokens/call) — consistent with the "locate narrowly with rg, read narrowly" guidance landing in practice.

**Caveats (recorded verbatim in both context-discipline.md and CLAUDE.md):**
1. This measurement predates the pending version bump/re-mirror — nothing shipped since v2.10.1 is live in real sessions yet (v1.3 audit).
2. `--limit 150` caps by directory order, not recency, so this is a mixed before/after sample relative to objective 29's 2026-08-19 baseline and objective 39's own work; a post-release re-run is expected to move these numbers again.

context-discipline.md's original 2026-08-18 audit tables and Rule 4 figures were **not edited** — the new block is appended, separately dated, after the existing `## Checking` paragraph.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Re-baseline read_share_pct | `node plugins/devflow/devflow/bin/df-tools.cjs context --limit 150 --raw` | 0 | PASS |
| 1: dispatch-completeness + hook-inventory tests still pass | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 0 | PASS (12/12) |
| 2: CHANGELOG + full suite | `npm test` | 1* | PASS (see below) |

\* `npm test` exits non-zero only because of the single pre-existing MA-7 failure, which is the allowed/expected exception per the TRD gate — see Post-TRD Verification.

## Task Commits

1. **Task 1: Re-baseline read_share_pct via the wired CLI; record it in context-discipline.md and CLAUDE.md** - `db57340` (docs)
2. **Task 2: CHANGELOG [Unreleased] + full-suite regression gate** - `6656f0e` (docs)

_Note: no TDD tasks in this TRD (docs/measurement only, per the TDD-EXCEPTION marker in the TRD's `<objective>`)._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| context CLI reachable | `node plugins/devflow/devflow/bin/df-tools.cjs context --limit 150 --raw` | 0 | PASS |
| full suite | `npm test` | 1 (1 pre-existing failure only) | PASS |

## Full-suite gate

| Metric | f0702de baseline | post-39-04 | This run (39-05) |
|---|---|---|---|
| tests | 4119 | 4168 | **4168** |
| pass | 4086 | 4135 | **4135** |
| fail | 1 (MA-7) | 1 (MA-7) | **1 (MA-7, unchanged)** |
| skipped | 32 | 32 | **32** |

The sole failure is `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` — the same pre-existing failure named in the objective baseline. No new failing test names. Totals are ≥ the 4119-test floor.

Also verified per the TRD's `<verification>` section: `session-audit --limit 20 --raw` exits 0; `override --help` exits 0; `transcript-export --help` exits 0.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (context-discipline.md dated append; CLAUDE.md figures + caveat + recomputed line count; objective 29 records untouched; CHANGELOG under `[Unreleased]` only; full-suite gate holds; no version-file changes)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/references/context-discipline.md` - appended a dated "Latest re-measurement (2026-09-28...)" block under `## Checking`, before `**Measurement trap:**`; original 2026-08-18 audit untouched
- `CLAUDE.md` - `Measured composition` sentence updated to the new percentages + dated caveat parenthetical; self-referential `currently ~N lines / ~NK tokens` recomputed to `~194 lines / ~4.6K tokens` (`wc -l` 194, `wc -c` 18591 / 4 ≈ 4648)
- `CHANGELOG.md` - `[Unreleased]` gained 5 `### Added` bullets (context, session-audit, transcript-export, override, dispatch-completeness+hook-inventory tests) and 1 `### Fixed` bullet (hook inventory draft marking + `--gate edits` site fix); no version heading added

## Decisions Made
- Used the JSON `targets.read_share_pct` (24.5%) as the canonical prose figure rather than the `--raw` text's independently-rounded 24.4%, and recorded both verbatim so neither reading is lost.
- Recomputed the Bash/Read call-count ratio (14×) from the new data instead of reusing the stale "7×" — the composition shifted enough that carrying the old multiplier forward would have been wrong, not just stale.

## Deviations from Plan

None - TRD executed exactly as written. No Rule 1-4 deviations, no auth gates, no checkpoints.

## Issues Encountered
None. `npm test`'s non-zero exit code is expected (the one pre-existing MA-7 failure), not an issue — confirmed identical to the post-39-04 baseline with no re-run needed to separate flake from regression.

## Follow-ups (recorded, not actioned — out of this TRD's scope)
1. Wire `telemetry --scan` / `sessionReport` from `session-audit` — site docs (`reference/df-tools.md`, `guides/telemetry.md`) already advertise `--scan` but it is not implemented.
2. No agent/workflow prompt currently tells anyone to run `df-tools override` — the command exists and is documented in CLAUDE.md/site docs but has no in-flow trigger.
3. Re-run `df-tools context --limit 150` after the next release re-mirrors the runtime — this sample predates that re-mirror and mixes before/after sessions.

## Next Objective Readiness
- Objective 39 is fully executed (5/5 TRDs). Objective 41 (retroactive verification of 27–34) was blocked on 29-31's commands being unreachable from the CLI — they are now reachable and this TRD's fresh evidence is available for that verification pass.
- Objective 39's own verifier pass (not run by this executor) decides whether to mark the objective complete in ROADMAP.md.

---
*Objective: 39-telemetry-audit-cli*
*Completed: 2026-09-28*
