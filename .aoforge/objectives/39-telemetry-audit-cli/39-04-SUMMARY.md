---
objective: 39-telemetry-audit-cli
trd: "04"
subsystem: testing
tags: [dispatcher, claude-md, cli-inventory, doc-refs, tdd]

# Dependency graph
requires:
  - objective: 39-02
    provides: "context/session-audit/transcript-export/override all wired into df-tools.cjs's switch (COMMANDS + real dispatch)"
  - objective: 39-03
    provides: "CLAUDE.md ### Hooks section already corrected — this TRD edits the Core Tool and Context management sections only, avoiding merge conflict"
provides:
  - "lib/dispatch-completeness.test.cjs — spawns every COMMANDS key against the real binary and fails if any prints Error: Unknown command; also extracts df-tools command names from CLAUDE.md prose and context-discipline.md and holds them to the same bar"
  - "CLAUDE.md Core Tool + Context management sections now name context/session-audit/transcript-export/override as live df-tools commands, not just lib/*.cjs modules"
affects: [39-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prose-vs-dispatcher completeness gate: a narrow, hand-scoped extractor (Core Tool section bullets + a `df-tools[.cjs] <word>` whole-file regex) plus a hand-listed FLOOR and a justified EXEMPT map — mirrors doc-refs.repo.test.cjs's approach rather than a generic prose parser."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs
  modified:
    - CLAUDE.md

key-decisions:
  - "RED set was {session-audit, transcript-export, override} (3 names), not the TRD's predicted 4 — context-discipline.md already documented `df-tools context --raw` (line 92) before this TRD ran, so `context` was already extractable via the whole-file scan. Test 4's assertion and header comment were written against the observed RED, not the predicted one; the FLOOR array itself is unchanged (still includes `context`)."
  - "EXEMPT = {internals, auto, confirm, df-tools}: `internals` from the Plugin Layout code-block comment `# df-tools internals`; `auto`/`confirm` from the Upgrade bullet's backticked migration-kind list `` `auto` | `confirm` ``; `df-tools` from the tool's own name appearing as a bare backtick span in the old Telemetry bullet (`` `df-tools` CLI``) and, defensively, as a literal substring elsewhere in the file. All four were discovered by running the extractor against the real file, not guessed."
  - "extractCommands(claudeMd, contextDisciplineMd) is a pure function (no fs) exported from the test file itself — test 7's hand-written snippet exercises it directly, matching the TRD's `no_property_based_default` / narrow-extractor constraint."

patterns-established:
  - "Sensitivity + coverage + prose-pin in one file: tests 1-2 are pos/neg controls on the dispatch probe, test 3 is the exhaustive coverage sweep, tests 4-6 are the prose⇔dispatcher pin (FLOOR/EXEMPT), test 7 is a hermetic unit check on the extractor — same shape as hook-inventory.test.cjs's 1-5."

requirements-completed: [AUD-06, AUD-09]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 30min
completed: 2026-09-28
tokens_input: 9346367
tokens_output: 55759
tokens_cache_read: 9162552
tokens_cache_write: 183643
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 39 TRD 04: Dispatch-completeness gate + CLAUDE.md CLI inventory flip Summary

**New `dispatch-completeness.test.cjs` spawns all 71 `df-tools` COMMANDS against the real binary and cross-checks CLAUDE.md/context-discipline.md prose against the dispatcher; RED caught `session-audit`, `transcript-export`, `override` still described as unwired library modules, GREEN moved CLAUDE.md's Core Tool `Telemetry & audit` bullet and both Context management mentions to name all four as live commands.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `isDispatched(name)` spawns the real `df-tools.cjs` with `--cwd <mkdtemp>` and `HOME=<mkdtemp>`, never `--help` (an unknown name with `--help` would print the top-level listing and exit 0, hiding a gap).
- `extractCommands(claudeMd, contextDisciplineMd)`: a narrow Core-Tool-section bullet parser (first backtick-span word per `- **...** — ` line) unioned with a whole-file `df-tools[.cjs] <word>` regex scan of both files.
- FLOOR (15 names) ⊆ extracted, with a justified 4-entry EXEMPT map for genuine prose false positives.
- CLAUDE.md's Telemetry & audit bullet and both Context management sentences rewritten to name `context`, `session-audit`, `transcript-export`, `telemetry`, `override --gate <g> --reason <why>` (`--list`) as live commands fronted by `lib/audit-cli.cjs`; `not yet wired` / `CLI command is not wired` are gone from the file.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: dispatch-completeness test, RED on FLOOR | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 1 | RED (correct — test 4 only) |
| 2: CLAUDE.md CLI inventory flip, GREEN | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (34/34) |

## Task Commits

1. **Task 1 (RED)** - `29bd7f8` test(39-04): dispatch-completeness gate for documented df-tools commands
2. **Task 2 (GREEN)** - `c1faf99` docs(39-04): CLAUDE.md lists context/session-audit/transcript-export/override as live

**Plan metadata:** (this commit) docs(39-04): complete TRD

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Task 2 combined suite (34 tests) | see Task Evidence row 2 | 0 | PASS |
| Stale-wording grep | `rg -n -e "not yet wired\|CLI command is not wired" CLAUDE.md` | 1 (no matches) | PASS |
| Full regression suite | `npm test` | 1 (pre-existing, unrelated) | PASS — see below |

`npm test`: 4168 tests / 4135 pass / 1 fail / 32 skipped. Baseline before this TRD was 4161 / 4128 / 1 / 32 — totals moved up by exactly the 7 tests this TRD added (1-3, 7 unconditional + 4-6 IS_DEVFLOW_CHECKOUT-gated), and the single failure is the same pre-existing MA-7 (`handoff-e2e.test.cjs`, `doctl auth init` with unset `DIGITALOCEAN_TOKEN`), unrelated to this TRD.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 1 | FAIL (correct — test 4 reported `FLOOR names missing from CLAUDE.md/context-discipline.md prose: session-audit, transcript-export, override`; tests 1, 2, 3, 5, 6, 7 all passed) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 | PASS (7/7) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 — spawn-and-check covers every `Object.keys(COMMANDS)` entry with no exit-code assertion; extractor pulls names from both the Core Tool bullets and a whole-file scan of CLAUDE.md + context-discipline.md; FLOOR ⊆ extracted; sensitivity control (`no-such-command-39` → false) holds; every EXEMPT entry occurs in the scanned text; the Telemetry & audit bullet plus both Context management sentences name all four commands as live, and the two "not wired" strings are gone.
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` - New. `isDispatched`, `extractCommands` (+ `coreToolSection`/`coreToolCommands`/`wholeFileScan` helpers), `FLOOR`, `EXEMPT`, 7 tests (4 always-run, 3 `IS_DEVFLOW_CHECKOUT`-gated).
- `CLAUDE.md` - Telemetry & audit bullet (Core Tool section) rewritten to list `context`/`session-audit`/`transcript-export`/`telemetry`/`override --gate <g> --reason <why>` as live, fronted by `lib/audit-cli.cjs`. Context management section: "see `df-tools context`" replaces the not-yet-wired parenthetical; the closing sentence now reads `node ~/.claude/devflow/bin/df-tools.cjs context --limit 150` recomputes... instead of asserting the CLI command isn't wired. Nothing else in the file touched.

## Decisions Made
- Kept `extractCommands` and its helpers pure (string in, Set out) and exported them from the test file rather than pulling logic into a new `lib/*.cjs` — the TRD's anti_patterns explicitly say not to extend `doc-refs.cjs` for this separate concern, and there's no other caller yet.
- The observed RED set (3 names) differs from the TRD's predicted 4 (`context` was already documented in `context-discipline.md` prior to this TRD); test 4's failure-message comment documents the actual set rather than silently matching the TRD's prediction. The FLOOR array is unchanged — this is purely a difference in which names were already GREEN going in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - documentation drift] RED set was {session-audit, transcript-export, override}, not the predicted {context, session-audit, transcript-export, override}**
- **Found during:** Task 1, first test run
- **Issue:** The TRD's `<embedded_context>` predicted test 4 would fail on 4 names including `context`. `context-discipline.md` (lines 92 and 99) already documents `df-tools context --raw` / `` `df-tools context` `` as live commands, so the whole-file scan already extracted `context` before any edit in this TRD.
- **Fix:** No code change needed — `extractCommands` and `FLOOR` were written per spec; the actual RED output (3 names) was captured verbatim in the test's header comment and in this SUMMARY rather than forcing a match to the TRD's prediction.
- **Files modified:** none beyond the planned test file.
- **Verification:** `node --test .../dispatch-completeness.test.cjs` shows test 4 failing with exactly `session-audit, transcript-export, override`; the TRD's own anti-pattern guard ("If other names are missing, stop and report") was judged not to apply — this is a strict subset of the predicted gap, not an unexpected fifth name.
- **Committed in:** `29bd7f8` (Task 1 RED commit).

---

**Total deviations:** 1 auto-fixed (1 documentation-drift observation, no code impact)
**Impact on plan:** None on scope or correctness — the gate still fails exactly where CLAUDE.md under-documents live commands and passes once fixed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- Any future df-tools command documented in CLAUDE.md/context-discipline.md prose (or added to COMMANDS) that doesn't actually dispatch will now fail CI via `dispatch-completeness.test.cjs`, closing the gap `doc-refs.repo.test.cjs` (skill tokens only) and `help.test.cjs` (COMMANDS vs switch only) left open.
- 39-05 (CHANGELOG entries, CLAUDE.md measured-composition numbers) can proceed; this TRD deliberately left percentages/line-counts in Context management untouched per its own constraint.

---
*Objective: 39-telemetry-audit-cli*
*Completed: 2026-09-28*
