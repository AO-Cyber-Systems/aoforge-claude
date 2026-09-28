---
objective: 39-telemetry-audit-cli
job: "01"
subsystem: cli
tags: [df-tools, context-audit, session-audit, transcripts, tdd]

# Dependency graph
requires:
  - objective: 29-context-discipline
    provides: lib/context-audit.cjs (analyze()) — unit-tested but unreachable before this TRD
  - objective: 31-telemetry-and-retention
    provides: lib/session-audit.cjs (analyze()) — unit-tested but unreachable before this TRD
provides:
  - "lib/audit-cli.cjs — pure CLI front-end (parseAuditArgs, defaultTranscriptRoot, resolveRoot, runContext, runSessionAudit, formatContextRaw, formatSessionAuditRaw, DEFAULT_LIMIT)"
  - "df-tools context [--limit N] [--root <dir>] [--raw] — dispatches to context-audit.analyze()"
  - "df-tools session-audit [--since YYYY-MM-DD] [--limit N] [--root <dir>] [--raw] — dispatches to session-audit.analyze()"
  - "help.cjs entries for both commands"
affects: [39-02 (extends audit-cli.cjs with transcript-export and override)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure run*() functions returning {ok, result, text} or {ok:false, message} so process.exit-calling output()/error() logic stays out of unit-testable code (mirrors the telemetry case block from TRD 38-11)."
    - "Value-flag parser (parseAuditArgs) with a declarative {values, bools} spec, purely-numeric coercion, and named unknown-flag/positional-arg/missing-value errors."
    - "Transcript root resolved at CALL time (os.homedir() inside the function, never a module-level constant) so HOME-isolated tests and --root overrides both work."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/audit-cli.cjs
    - plugins/devflow/devflow/bin/lib/audit-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "parseAuditArgs coerces purely-numeric value-flag values (/^\\d+$/) to Number and leaves everything else as a string, so --limit 20 yields the number 20 while --since 2099-01-01 and --limit abc stay strings for their own validators."
  - "Limit and --since validation run before root resolution, so a malformed flag reports its own message even against a HOME with no .claude/projects (tests 5, 6, 9 don't need a valid root fixture)."
  - "--limit 0 means 'no cap': validated as a non-negative integer, then falls through `limit || undefined` into analyze(), which already treats 0/undefined identically. No special-casing needed."
  - "telemetry.collect() intentionally does NOT call context-audit — recorded in the TRD as an explicit scope decision, not something this TRD needed to implement."

patterns-established:
  - "CLI-spawn tests (tests 1-11) spawn the real df-tools.cjs binary with --cwd <mkdtemp> and env: {...process.env, HOME: <fixtureHome>} — never a bare cwd:, per the telemetry.test.cjs precedent — so HOME isolation actually reaches the child process."

requirements-completed: [AUD-01, AUD-02, AUD-05]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 20min
completed: 2026-09-28
---

# Objective 39 TRD 01: Wire `df-tools context` and `df-tools session-audit` Summary

**`lib/audit-cli.cjs` front-end wires the previously-orphaned `context-audit.analyze()` and `session-audit.analyze()` into `df-tools context` / `df-tools session-audit`, with flag parsing, HOME-isolated transcript-root resolution, and fixed `--raw` text formats — both commands went from `Error: Unknown command` to exit 0.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-28T14:19:01Z
- **Completed:** 2026-09-28T14:26:27Z (implementation); summary/state finalized shortly after
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `df-tools context [--limit N] [--root <dir>] [--raw]` now dispatches to `context-audit.analyze()` — that module's first production caller since TRD 29-04.
- `df-tools session-audit [--since YYYY-MM-DD] [--limit N] [--root <dir>] [--raw]` now dispatches to `session-audit.analyze()`.
- `lib/audit-cli.cjs`: a pure, unit-testable front-end (`parseAuditArgs`, `defaultTranscriptRoot`, `resolveRoot`, `runContext`, `runSessionAudit`, `formatContextRaw`, `formatSessionAuditRaw`) that the dispatcher only maps onto `output()`/`error()`.
- Both commands got `help.cjs` entries; `--help` on either prints its own usage line and exits 0 with no side effects.
- 18 new tests (7 unit + 11 CLI-spawn), all HOME-isolated — none read the real `~/.claude/projects` corpus.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: audit-cli parser, root resolution, raw formatters (tests 12-15) | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 0 | PASS |
| 2: dispatch context + session-audit, help entries, CLI tests (tests 1-11) | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/context-audit.test.cjs plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` | 0 | PASS (69/69) |

## Task Commits

Each task was committed atomically (RED then GREEN, per strict TDD):

1. **Task 1 RED** - `8cfd62a` test(39-01): audit-cli parser, transcript root and raw formatters
2. **Task 1 GREEN** - `57648f2` feat(39-01): lib/audit-cli.cjs front-end for context and session-audit
3. **Task 2 RED** - `38ff795` test(39-01): df-tools context and session-audit CLI
4. **Task 2 GREEN** - `bb1b8e3` feat(39-01): wire df-tools context and session-audit

**Plan metadata:** (this commit) docs(39-01): complete TRD

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Task 2 verify (5-file suite) | `node --test plugins/devflow/devflow/bin/lib/{audit-cli,help,context-audit,session-audit,doc-surfaces}.test.cjs` | 0 | PASS (69/69) |
| session-audit --help smoke | `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --help` | 0 | PASS |
| Full regression suite | `npm test` | 1 (pre-existing) | PASS — see below |

`npm test`: 4137 tests / 4104 pass / 1 fail / 32 skipped. Baseline (f0702de) was 4119 / 4086 / 1 / 32 — totals moved up by exactly the 18 new tests this TRD added (7 unit + 11 CLI-spawn), and the single failure is the same pre-existing MA-7 (`handoff-e2e.test.cjs`, `doctl auth init` with unset `DIGITALOCEAN_TOKEN`), unrelated to this TRD.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` (module missing) | 1 | FAIL (correct — `Cannot find module './audit-cli.cjs'`) |
| Task 1 GREEN | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 0 | PASS (7/7 unit tests) |
| Task 2 RED | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` (dispatcher cases missing) | 1 | FAIL (correct — 11/11 new CLI tests failed on `Error: Unknown command: context` / `session-audit`; 7 unit tests still passed) |
| Task 2 GREEN | `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/context-audit.test.cjs plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` | 0 | PASS (69/69) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` from TRD frontmatter — unknown-command→exit 0, call-time root resolution with `--root` override and not-found error, `--limit` default/0/validation, `--since` validation and unknown-flag/positional rejection, `--raw` fixed text vs full JSON, help.cjs entries with `help.test.cjs` passing)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/audit-cli.cjs` - Pure CLI front-end: flag parsing, transcript-root resolution, `--raw` formatters, `runContext`/`runSessionAudit`.
- `plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` - Hand-built fixture builders + 7 unit tests (parser, root resolution, raw formatting) + 11 CLI-spawn tests (dispatcher wiring, HOME isolation, `--help`).
- `plugins/devflow/devflow/bin/df-tools.cjs` - Added `case 'context':` and `case 'session-audit':` dispatcher arms, placed directly after `telemetry` per the codebase pattern.
- `plugins/devflow/devflow/bin/lib/help.cjs` - Added `context` and `session-audit` entries to `COMMANDS` (no `mutates` — both read-only).

## Decisions Made
- Purely-numeric value-flag coercion in `parseAuditArgs` (rather than a separate numeric-parsing step) keeps the parser generic across `--limit`/`--root`/`--since` while still producing a `Number` for `--limit`.
- Flag/format validation (limit, since) runs before filesystem root resolution, so malformed-flag tests don't need a real transcript fixture.
- `--limit 0` needs no special "no cap" branch — it validates as a non-negative integer and then naturally becomes `undefined` going into `analyze()`'s existing falsy-limit check.

## Deviations from Plan

None — TRD executed exactly as written. The `parseAuditArgs`/`runContext`/`runSessionAudit` bodies were left unspecified in the TRD skeleton (marked `/* ... */`); filling them in per the Test list and gotchas is implementation, not a deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `lib/audit-cli.cjs` is ready for TRD 39-02 to extend with `transcript-export` and `override` per the objective plan.
- `context-audit.analyze()` now has a production caller, closing objective 29's `targets.read_share_ok` acceptance-signal gap.

---
*Objective: 39-telemetry-audit-cli*
*Completed: 2026-09-28*
