---
objective: 37-adopt-existing-repos
trd: "02"
subsystem: cli
tags: [df-tools, cwd, flag-parsing, tdd]

# Dependency graph
requires: ["37-01"]
provides:
  - "cwd-flag.cjs: extractCwdFlag(args, {originalCwd}) -> {args, dir, error}; OWN_CWD = Set(['dup-detect'])"
  - "df-tools.cjs main(): global --cwd <dir> flag, chdir before dispatch, leading and trailing (flag-region-bounded) forms"
  - "help.cjs topLevelUsage(): documents --cwd"
affects: ["37-05", "37-07", "37-08", "37-09"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duplicate-before-validate ordering: a leading+trailing --cwd reports 'given twice' before either value is resolved/validated"
    - "Reuse of help.cjs's helpScanLimit as the single definition of 'the part of argv df-tools reads', shared between --help and --cwd flag-region boundaries"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/cwd-flag.cjs
    - plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/help.test.cjs

key-decisions:
  - "help.cjs already exported helpScanLimit at TRD-execution time (no additive export needed) — the TRD's codebase_examples predates a prior change; verified by grep before writing code."
  - "help.test.cjs's 3 assertions on the literal old usage-line string ('Usage: df-tools <command>') were updated to the new bracketed form, per the TRD's own gotcha permitting this when a test asserts the exact old string verbatim."

patterns-established:
  - "extractCwdFlag never mutates its args argument; df-tools.cjs main() applies the result via args.splice(0, args.length, ...cwdFlag.args) rather than reusing extractCwdFlag's internals directly."

requirements-completed: ["ADP-02"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 24min
completed: 2026-09-28
tokens_input: 8355186
tokens_output: 64373
tokens_cache_read: 8228765
tokens_cache_write: 126269
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 02: Global `--cwd <dir>` for df-tools Summary

**One global `--cwd <dir>` flag, parsed once before dispatch (`extractCwdFlag`), that `chdir`s df-tools into a target directory for every subcommand — leading or trailing, flag-region-bounded so it never swallows a forwarded tail, a literal `--`, or `dup-detect`'s own `--cwd`.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `cwd-flag.cjs`: `extractCwdFlag(args, {originalCwd}) -> {args, dir, error}` — pure, non-mutating parser. Leading `--cwd <d>` / `--cwd=<d>` always read (precedes any command name); a trailing form is scanned only within `helpScanLimit`'s flag region and only when the command isn't in `OWN_CWD` (`dup-detect`). A leading+trailing pair reports `--cwd given twice` before either value is existence-checked, so the error names the real problem rather than whichever path happens not to exist.
- `df-tools.cjs` `main()`: `--cwd` is extracted and `chdir`s the process immediately after the `--raw` splice and before `const command = args[0]` — so the `--help` pre-switch, and every subcommand, see the new cwd. A bad `--cwd` exits 1 with `Error: --cwd ...` on stderr and runs nothing.
- `help.cjs` `topLevelUsage()` documents the flag: first line is now exactly `Usage: df-tools [--cwd <dir>] <command> [args] [--raw]`, with a one-line explanation underneath.
- 19/19 cwd-flag.test.cjs cases pass (the TRD's 17 plus 2 supplemental: never-mutates and a bad-leading-value message check). `help.test.cjs` (49 combined with help-delegation) and `help-delegation.test.cjs` remain green after 3 literal-string assertions were updated to the new usage line.
- Repo-wide regression gate: 3859 tests, 3826 pass, 1 fail (pre-existing, verbatim baseline entry `MA-7`), 32 skipped — zero new regressions.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Pure parser extractCwdFlag (tests 10-17) | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` | 0 | PASS |
| 2: Wire into df-tools main() + usage line (tests 1-9) | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/help-delegation.test.cjs` | 0 | PASS |

## Task Commits

TDD: test (RED) → feat (GREEN) per task, exactly as specified.

1. **Task 1 RED** — `9c6df0e` `test(37-02): --cwd flag parser cases`
2. **Task 1 GREEN** — `ee02a63` `feat(37-02): extractCwdFlag parser with flag-region boundary`
3. **Task 2 RED** — `ea72a25` `test(37-02): df-tools --cwd end-to-end cases`
4. **Task 2 GREEN** — `e74754b` `feat(37-02): global --cwd flag for df-tools`

_No REFACTOR commit was needed — both GREEN phases matched the TRD's codebase_examples target shape without further cleanup._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Fast verify (19/19 cwd-flag cases) | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` | 0 | PASS |
| Sibling parity: help.test.cjs + help-delegation.test.cjs | `node --test plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/help-delegation.test.cjs` | 0 (49/49) | PASS |
| CLI usage-line check | `node plugins/devflow/devflow/bin/df-tools.cjs --help \| head -1` | — | `Usage: df-tools [--cwd <dir>] <command> [args] [--raw]` (exact match) |
| CLI bad-path check | `node plugins/devflow/devflow/bin/df-tools.cjs --cwd /nonexistent state load` | 1 | `Error: --cwd: not a directory: /nonexistent` |
| Wave regression gate (repo-wide, baseline-relative) | see below | 1 (baseline, classified) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` (before cwd-flag.cjs existed — implementation moved to scratchpad first) | 1 (`MODULE_NOT_FOUND: ./cwd-flag.cjs`) | FAIL (correct) |
| Task 1 GREEN | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` | 0 (10/10 pass) | PASS (correct) |
| Task 2 RED | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` (spawned tests 1-9 added, before df-tools.cjs wiring) | 1 (9/9 new spawned tests fail: `Error: Unknown command: --cwd`) | FAIL (correct) |
| Task 2 GREEN | `node --test plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/help-delegation.test.cjs` | 0 (19 + 49 pass) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0 — no Rule 1-3 fixes were needed to TRD-authored production code.
- **Must-haves verified:** 5/5 truths, 2/2 artifacts, all 4 wiring notes hold (main() ordering, helpScanLimit reuse, OWN_CWD passthrough for future 37-05/07/08/09 `--cwd` calls, df-tools.cjs left otherwise untouched for 37-05's later `adopt` case).
- **Gate failures:** None (the one repo-wide test failure is the known baseline entry `handoff-e2e.test.cjs:795:3` / `MA-7`).

## Regression Gate (baseline-relative)

Ran from the repo root: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (excludes `micro.test.cjs` per binding rules), output written to the session scratchpad (never the repo).

- **Observed totals:** 3859 tests, 549 suites, **3826 pass**, **1 fail**, 32 skipped.
- **Failure classification:**
  | File:line | Name | Classification |
  |---|---|---|
  | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** — present verbatim in `baseline-failures.tsv` line 16 |
- No candidate regressions. `baseline-failures.tsv` was read only, never edited (21 lines, unchanged).
- Test count grew from 3816 (37-01's run) to 3859 (+43), consistent with this TRD's 19 new cwd-flag.test.cjs cases plus incidental growth from 37-03 landing between runs; all new tests pass.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/cwd-flag.cjs` - `extractCwdFlag`, `OWN_CWD`, `isCwdToken`/`tokenValue`/`resolveDir` internals
- `plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs` - full 17-case TRD test list (header comment) plus 2 supplemental cases; spawned-CLI helpers (`run`, `makeProject`, `mkdtemp`) and pure-parser fixtures
- `plugins/devflow/devflow/bin/df-tools.cjs` - `require('./lib/cwd-flag.cjs')`; `main()` pre-dispatch block: extract → chdir → splice, before `const command = args[0]`
- `plugins/devflow/devflow/bin/lib/help.cjs` - `topLevelUsage()` first line + one documentation line for `--cwd`
- `plugins/devflow/devflow/bin/lib/help.test.cjs` - 3 assertions on the literal old usage-line string updated to the new bracketed form (no case added, no other test touched)

## Decisions Made

- Confirmed via `grep -n "module.exports" plugins/devflow/devflow/bin/lib/help.cjs` that `helpScanLimit` was **already exported** before this TRD ran — the TRD's codebase_examples ("It is not exported today") predates that change. No help.cjs export edit was needed; only the usage-line text changed.
- Duplicate-detection (`--cwd given twice`) is checked before either candidate value is existence-validated, matching test 15's expectation that the "twice" error fires even when the first value (`'a'`) is not a real directory.
- `help.test.cjs`'s 3 literal-string assertions were updated rather than loosened to a wildcard regex, keeping the test as a precise pin on the exact usage line (per the TRD's own gotcha, permitted since each asserted the exact old string verbatim).

## Deviations from Plan

None — TRD executed exactly as written. `helpScanLimit`'s export turned out to already exist (see Decisions above), which is a discovery, not a deviation: no extra code was written or removed as a result, the TRD's own instruction ("export it, additive") was simply already satisfied.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Objective Readiness

- `df-tools --cwd <dir> <command>` is ready for 37-05 (`adopt preflight|scaffold|report`) and 37-07/08/09 to target `[path]` without any per-subcommand `--cwd` parsing.
- `df-tools.cjs`'s `main()` pre-dispatch block is intentionally minimal — 37-05 adds the `adopt` case elsewhere in the same switch statement without touching this block.
- No blockers identified for downstream wave-2+ TRDs in objective 37.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/cwd-flag.cjs
- FOUND: plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs
- FOUND: .planning/objectives/37-adopt-existing-repos/37-02-SUMMARY.md
- FOUND: commit 9c6df0e (test(37-02): --cwd flag parser cases)
- FOUND: commit ee02a63 (feat(37-02): extractCwdFlag parser with flag-region boundary)
- FOUND: commit ea72a25 (test(37-02): df-tools --cwd end-to-end cases)
- FOUND: commit e74754b (feat(37-02): global --cwd flag for df-tools)

---
*Objective: 37-adopt-existing-repos*
*Completed: 2026-09-28*
