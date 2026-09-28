---
objective: 38-doc-auto-correction
trd: "01"
subsystem: testing
tags: [doc-refs, skill-route, command-rename, regex, tdd, node-test]

# Dependency graph
requires: []
provides:
  - "lib/doc-refs.cjs: resolveToken, scanText, rewriteText, liveSkillNames, walkFiles, TOKEN_RE, DocRefsError"
  - "skill-route.cjs: REMOVED_COMMANDS export (['update', 'reapply-patches'])"
affects: [38-07, 38-08, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-resolver pattern: one module imports DEPRECATION_MAP + REMOVED_COMMANDS and exposes classify/scan/rewrite; no downstream re-declaration of rename logic."
    - "Slash-anchored token regex with negative lookbehind, shared by scanText and rewriteText via one exec loop over the same TOKEN_RE."
    - "String-slice rewrite (never split/join) to preserve CRLF and every untouched byte."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doc-refs.cjs
    - plugins/devflow/devflow/bin/lib/doc-refs.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/skill-route.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs

key-decisions:
  - "scanText's `token` field is the bare command name (group 2 of TOKEN_RE), matching the must_haves' own definition (\"/devflow:progress-bar is the token progress-bar\"); rewriteText's `changes[].from` is the full matched text (e.g. '/df:health') since that is what a caller needs to locate/replace in the source."
  - "Combined Task 1 and Task 2 into one RED commit and one GREEN commit (see Deviations) since doc-refs.cjs is a single small module and its test file was written whole in one pass."

patterns-established:
  - "Pattern: TOKEN_RE = /(?<![A-Za-z0-9_])\\/(devflow|df):([a-z][a-z0-9-]*)/g exported for reuse by 38-07/38-08/38-09."

requirements-completed: ["DOC-01"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 14min
completed: 2026-09-28
---

# Objective 38 TRD 01: `lib/doc-refs.cjs` — the command-reference resolver Summary

**Slash-anchored resolver/scanner/rewriter for stale `/devflow:`/`/df:` command references, keyed entirely off `skill-route.cjs`'s `DEPRECATION_MAP` and new `REMOVED_COMMANDS` export — zero re-declared rename logic.**

## Performance

- **Duration:** ~14 min (first RED commit 08:20:08 -0400 to this summary 12:23 UTC / 08:23 -0400)
- **Started:** 2026-09-28T08:20:08-04:00
- **Completed:** 2026-09-28T08:23:00-04:00 (approx)
- **Tasks:** 2/2 (combined into one RED + one GREEN commit — see Deviations)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `lib/doc-refs.cjs`: `resolveToken`, `scanText`, `rewriteText`, `liveSkillNames`, `walkFiles`, `TOKEN_RE`, `DocRefsError` — the one place command-rename classification/scanning/rewriting lives.
- `skill-route.cjs`: added `REMOVED_COMMANDS = ['update', 'reapply-patches']` next to (unchanged, 13-entry) `DEPRECATION_MAP`, exported it, and updated the export-lock banner/tests from 8 to 9 entries.
- 19 new tests (18 in `doc-refs.test.cjs` covering test-list items 1-16 plus a `TOKEN_RE` sanity check, 1 appended to `skill-route.test.cjs` for item 17) — all passing, no regressions.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: REMOVED_COMMANDS + resolveToken/scanText/rewriteText (tests 1-13, 16, 17) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.test.cjs plugins/devflow/devflow/bin/lib/skill-route.test.cjs` | 0 | PASS (99/99: 18 doc-refs + 81 skill-route) |
| 2: liveSkillNames + walkFiles (tests 14-15) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` | 0 | PASS (18/18) |

Task 2 done-criterion command:
```
$ node -e "console.log([...require('./plugins/devflow/devflow/bin/lib/doc-refs.cjs').liveSkillNames('plugins/devflow/skills')].length)"
33
```
(run from worktree root — matches the 33 `SKILL.md`-bearing directories under `plugins/devflow/skills`)

## Task Commits

Each task was committed atomically (TDD RED -> GREEN pairs; Task 1 and Task 2 share one RED/GREEN pair — see Deviations):

1. **RED (Tasks 1+2 test list, items 1-17)** - `bca5ec9` (test) — `doc-refs.test.cjs` created (all 16 doc-refs cases + TOKEN_RE sanity), `skill-route.cjs`/`skill-route.test.cjs` edited to add `REMOVED_COMMANDS` wiring and export-lock updates + item 17.
2. **GREEN (Tasks 1+2 implementation)** - `b9adac8` (feat) — `doc-refs.cjs` created implementing all seven exports.

No separate plan-metadata commit prior to this SUMMARY; this SUMMARY's own commit follows below.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| doc-refs + skill-route unit tests | `node --test plugins/devflow/devflow/bin/lib/doc-refs.test.cjs plugins/devflow/devflow/bin/lib/skill-route.test.cjs` | 0 | PASS (99/99) |
| literal-guard | `rg -n "'status check'\|'todo list'" plugins/devflow/devflow/bin/lib/doc-refs.cjs` | 1 (no match, expected) | PASS |
| full regression suite | `npm --prefix <worktree> test` | 1 (known-flaky failures only) | PASS (see Regression Gate) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` (before doc-refs.cjs existed) | 1 | FAIL (correct — `MODULE_NOT_FOUND`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/doc-refs.test.cjs plugins/devflow/devflow/bin/lib/skill-route.test.cjs` | 0 | PASS (correct — 99/99) |
| REFACTOR | n/a | — | No refactor pass needed; GREEN implementation shipped as written. |

## Regression Gate (baseline-relative)

- Full suite: `node --test --test-reporter=spec 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (via `npm --prefix <worktree> test`)
- **Total tests:** 4042 (baseline 4023 + 19 new: 18 in `doc-refs.test.cjs` + 1 appended `RC17` in `skill-route.test.cjs`)
- **Pass:** 3984 · **Fail:** 8 · **Skipped:** 50 · **Cancelled:** 0
- All 8 failures are pre-existing rows in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv` (daemon/PTY timing, rows 1, 2, 10-15):
  - `devflow-watch.test.cjs:145` (row 1), `:177` (row 2)
  - `handoff-e2e.test.cjs:254` (row 10), `:271` (row 11), `:285` (row 12), `:298` (row 13), `:327` (row 14), `:344` (row 15)
- None of this TRD's diff (`doc-refs.cjs`/`.test.cjs`, `skill-route.cjs`/`.test.cjs`) touches `devflow-watch.cjs` or `handoff-e2e.cjs` — the 8 failures are plainly unrelated (daemon start/PID-file/SIGTERM timing), consistent with their baseline-flaky classification. Zero new failures. `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 truths, 2/2 artifacts, 1/1 wiring note — all confirmed against source:
  - `REMOVED_COMMANDS` next to `DEPRECATION_MAP` (13 entries, unchanged), shared source-of-truth comment above both.
  - `resolveToken` precedence removed -> renamed -> prefix -> unknown -> ok, verified by RT1-RT5.
  - `TOKEN_RE` exact source matches spec (`RE1` test), full-token matching confirmed (`SC6`, `SC7`).
  - `scanText` line/col 1-based + ignore regions + unclosed-throws (`SC8`, `SC9a`, `SC9b`).
  - `rewriteText` prefix/renamed-only rewrite, removed/ignore preserved byte-identical, CRLF preserved, idempotent (`RW10`-`RW13`).
  - `liveSkillNames`/`walkFiles` stack-based walker, sorted posix paths, both include/exclude honoured (`LS14`, `WF15`); real repo run confirms 33 live skills.
  - Guard: no `DEPRECATION_MAP` value string literal in `doc-refs.cjs` (`G16`); doc-refs.cjs requires from skill-route.cjs and declares no mapping of its own.
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/doc-refs.cjs` - the command-reference resolver: `resolveToken`, `scanText`, `rewriteText`, `liveSkillNames`, `walkFiles`, `TOKEN_RE`, `DocRefsError`
- `plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` - 18 tests (test-list items 1-16 + `TOKEN_RE` sanity), hand-written fixtures, mkdtemp-based generators for the walker tests
- `plugins/devflow/devflow/bin/lib/skill-route.cjs` - added `REMOVED_COMMANDS` export, shared source-of-truth comment, bumped export-lock banner to 9 entries
- `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` - `EX1`/`EX3`/`EX4`/`EX5` updated to the 9-entry export list, appended `RC17` (test-list item 17)

## Decisions Made
- `scanText`'s `token` field carries the bare command name (not the full `/prefix:name` match) — this is the literal definition the must_haves truths use ("`/devflow:progress-bar` is the token `progress-bar`"). `rewriteText`'s `changes[].from`/`removed[].token` use the full match and bare name respectively, matching the worked examples in the TRD's `<codebase_examples>` exactly (verified by `RW10`/`RW11`).
- Ignore-region tracking allows a start and end marker on the same line (not just separate lines) for robustness, though this was not directly exercised by the test list.
- `walkFiles`'s glob support is intentionally minimal (`**/`, trailing `**`, `*`, literal segments) per the TRD's explicit scope — no external glob dependency, matching the runtime model's "no new npm dependencies" constraint.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; the implementation matched the TRD's worked examples directly.

### Process deviation (commit granularity)

**Task 1 and Task 2 were implemented and committed together** (one RED commit `bca5ec9`, one GREEN commit `b9adac8`) rather than as four separate commits (RED1/GREEN1/RED2/GREEN2) as the task breakdown implies. `doc-refs.cjs` is one small, cohesive module and its full test file (all 16 cases) was written in a single pass before any implementation existed, so splitting the RED phase into two commits would have meant committing a test file that half-fails to `require` for an artificial reason (the module doesn't exist yet either way) rather than a meaningfully different RED state. Both tasks' done-criteria are independently verified above (Task 1's combined-file verify command, Task 2's specific `liveSkillNames` count of 33), and no task's content, verification evidence, or requirement coverage was skipped or diluted by the combination.

---

**Total deviations:** 0 auto-fixed; 1 process deviation (commit granularity, documented above, no content impact).
**Impact on plan:** None on correctness or scope — all 17 test-list items plus the guard and TOKEN_RE sanity check pass; regression gate is clean against baseline.

## Issues Encountered

A duplicate/parallel agent message arrived mid-execution (from address `a500ddbd6656a4e2b`) instructing "Continue TRD 38-01 from the GREEN phase" as if this TRD's RED phase and GREEN phase had not yet started. By the time it arrived, this session had already committed RED (`bca5ec9`) and was about to commit GREEN (`b9adac8`). No `SendMessage` tool was available in this session to reply, so this executor proceeded with its own already-in-progress, already-committed work rather than duplicating or ceding it, and is recording the collision here for the orchestrator's visibility — a second executor may have been (or still be) dispatched against the same TRD/worktree, which risks duplicate or interleaved commits if it also writes here.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

`lib/doc-refs.cjs` is ready for 38-07 (doc-staleness W050 gate), 38-08 (migration 0007) and 38-09 (CI test) to call directly — `resolveToken`, `scanText`, `rewriteText`, `liveSkillNames`, `walkFiles`, `TOKEN_RE` and `DocRefsError` are all exported and none of those consumers need to declare their own rename mapping.

**Possible follow-up for the orchestrator:** verify whether a second executor was also dispatched for 38-01 in this same worktree (see Issues Encountered above) before merging this wave.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/doc-refs.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doc-refs.test.cjs
- FOUND commit: bca5ec9 (test(38-01): doc-refs resolver, scanner and rewriter cases)
- FOUND commit: b9adac8 (feat(38-01): doc-refs resolver keyed off DEPRECATION_MAP)

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*
