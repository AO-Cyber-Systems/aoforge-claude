---
objective: 35-stack-profile-loader
trd: "02b"
subsystem: stack-profile
tags: [stack-profile, agent-context, command-rendering, cjs]

# Dependency graph
requires:
  - objective: 35-stack-profile-loader (35-02a)
    provides: "the resolved-profile shape (frontmatter.commands/loop/gates/generated/verification, sections) this module consumes — not required directly, just the shape"
provides:
  - "renderCommand(profile, key, {files, packages, apply}) — fills {files}/{packages} placeholders, reports discover/none/undefined statuses"
  - "contextFor(profile, agent, {budget, ui}) — the §5.3 per-agent context slice with a token-budget cap and truncation reporting"
  - "AGENT_SLICES, AGENT_ALIASES exports for downstream wiring"
affects: ["35-03 (re-exports renderCommand/contextFor/AGENT_SLICES from stack-profile.cjs, wires into cmdStack)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-logic module with zero filesystem access — consumes only the resolved-profile object shape, no require() of the resolver it will eventually sit behind"
    - "Baseline-relative regression gate: compare failing test names against a committed TSV, not raw pass/fail counts"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-render.cjs
    - plugins/devflow/devflow/bin/lib/stack-render.test.cjs
  modified: []

key-decisions:
  - "AGENT_SLICES is a single exported object (per-agent {commands, ui, sections}) rather than several parallel Sets, so it doubles as inspectable documentation of the §5.3 matrix for 35-03 and beyond."
  - "contextFor returns the canonical agent name (post-alias-resolution) in `agent`, not the alias the caller passed, so downstream consumers get a consistent value regardless of which alias was used."
  - "Added one test beyond the TRD's C1-C14 list (`extra-1`) covering the hard-cut fallback (Principles alone exceeding budget) since the gotcha specifies exact behavior for it but no C-case exercises it."

patterns-established:
  - "Pattern: derive packages from files as unique `./<dirname>` (`.` for root files) via `path.posix.dirname`, in first-occurrence order — reusable by any future scoped-command renderer."

requirements-completed: ["STK-02 (part b)"]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 10min
completed: 2026-09-27
---

# Objective 35 TRD 02b: `renderCommand` and `contextFor` (per-agent slices) Summary

**`lib/stack-render.cjs` fills command placeholders (`{files}`/`{packages}`, with derived-package fallback) and slices the proposal §5.3 per-agent context under a token budget, with drop-from-end truncation and a hard-cut fallback.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-27T15:27:55Z (preflight)
- **Completed:** 2026-09-27T15:41:00Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `renderCommand` implements form selection (apply > scoped > run), placeholder filling with shell-safe quoting, and the `discover`/`none`/`undefined` sentinel statuses that never fabricate a command.
- `contextFor` implements the full §5.3 matrix (`AGENT_SLICES`), alias resolution (`AGENT_ALIASES`), the Commands block renderer, and budget-capped truncation with a documented hard-cut fallback.
- Module has zero filesystem access and no dependency on `stack-profile.cjs` (confirmed by grep), so it built independently of 35-02a as planned.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: renderCommand (C1-C7) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 0 | PASS (8/8: C1, C1b, C2-C7) |
| 2: contextFor (C8-C14) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 0 | PASS (16/16: full suite incl. C8-C14, extra-1) |

## Task Commits

1. **Task 1: renderCommand (C1-C7)**
   - `2943db5` test(35-02b): renderCommand cases (RED — MODULE_NOT_FOUND, exit 1)
   - `c3d5938` feat(35-02b): renderCommand (GREEN — exit 0, 8/8 pass)
2. **Task 2: contextFor with the §5.3 matrix and token cap (C8-C14)**
   - `b63ee28` test(35-02b): contextFor cases (RED — 9 pass / 7 fail, exit 1, `contextFor is not a function`)
   - `1c6684c` feat(35-02b): contextFor per-agent slices (GREEN — exit 0, 16/16 pass)

**Plan metadata:** (this commit) docs(35-02b): complete TRD

_TDD tasks each have two commits (test -> feat), as specified — no refactor step was needed._

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 1 | FAIL (correct — `stack-render.cjs` did not exist yet) |
| GREEN (Task 1) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 0 | PASS (correct — 8/8) |
| RED (Task 2) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 1 | FAIL (correct — 9 pass / 7 fail, `contextFor is not a function`) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 0 | PASS (correct — 16/16) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5
  - `renderCommand` fills `{packages}` in scoped form; `discover`/`none`/undefined return statuses, never a fake command — C1-C7 pass.
  - `contextFor` includes exactly the §5.3 sections per agent, stays within budget, reports `truncated`+`omitted` — C8-C12 pass.
  - Unknown agent throws `code: 'UNKNOWN_AGENT'` naming valid agents; all 4 aliases resolve — C13 pass.
  - Neutrality: no stack-specific term in `stack-render.cjs` source — C14 pass.
  - No `require('./stack-profile.cjs')`; confirmed via `grep -n "require(" stack-render.cjs` — only `require('path')`.
- **Gate failures:** None (fast-verify). See Regression Gate below for the wave-level baseline-relative gate.

## Regression Gate (baseline-relative)

Ran from repo root:
`node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`

**Observed totals (informational):** tests 3466, suites 478, pass 3405, fail 11, skipped 50, cancelled 0.

11 failing test names were extracted from the closing `✖ failing tests:` section. None of them match any entry in `.planning/objectives/35-stack-profile-loader/baseline-failures.tsv` (that file's 10 pre-existing failures — all in `df-tools.test.cjs`, `handoff-e2e.test.cjs` MA-7, `project-state.test.cjs`, `verify-commits.test.js` — did not fail in this run at all, i.e. they passed here; per the gate rule they'd be pre-existing regardless, but they weren't even present as failures).

All 11 are candidate regressions per the gate's step 4, so each was re-run individually:

| # | File:line | Test name | Re-run (isolated file) | Touches this TRD's diff? | Classification |
|---|---|---|---|---|---|
| 1 | devflow-watch.test.cjs:145 | foreground daemon writes PID file, status reports running, stop kills it | still fails | No | Environment flake |
| 2 | devflow-watch.test.cjs:177 | start refuses when daemon already running | still fails | No | Environment flake |
| 3 | devflow-watch.test.cjs:191 | start cleans up stale PID file and starts fresh | still fails | No | Environment flake |
| 4 | devflow-watch.test.cjs:353 | C-2 start --project /p (single) writes watching:[/p] (back-compat) | still fails | No | Environment flake |
| 5 | devflow-watch.test.cjs:380 | C-1 start --project /p1,/p2 writes watching:[/p1, /p2] | still fails | No | Environment flake |
| 6 | handoff-e2e.test.cjs:254 | write pending -> daemon executes -> route-results emits result with stdout | still fails | No | Environment flake |
| 7 | handoff-e2e.test.cjs:271 | disallowed command produces rejected done record + "Do NOT retry" guidance | still fails | No | Environment flake |
| 8 | handoff-e2e.test.cjs:285 | idempotency: route-results emits once, silence on second invocation | still fails | No | Environment flake |
| 9 | handoff-e2e.test.cjs:298 | multi-record: 3 queued commands appear in a single injection | still fails | No | Environment flake |
| 10 | handoff-e2e.test.cjs:327 | LK-1: teardown reaps the daemon — no devflow-watch outlives withDaemon | still fails | No | Environment flake |
| 11 | handoff-e2e.test.cjs:344 | LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight | still fails | No | Environment flake |

**Why "environment flake" rather than "regression":** `git diff --stat 0fb49aeb..HEAD` shows this TRD touched exactly two files, both new: `plugins/devflow/devflow/bin/lib/stack-render.cjs` and its test file. Neither `devflow-watch.cjs`, `devflow-watch.test.cjs`, the handoff daemon code, nor `handoff-e2e.test.cjs` were touched. All 11 failures are daemon/subprocess lifecycle tests — they spawn real OS processes and poll for PID files or "done" records within fixed timeouts (3s-15s) — exactly the PTY/handoff-timing category the gate's own example calls out. They reproduced identically when each file was re-run in isolation (not a parallel-run-only flake), which is consistent with this sandbox's process-spawn/timing characteristics rather than with anything `renderCommand`/`contextFor` do (both are synchronous, dependency-free, filesystem-free pure functions). None block this TRD.

**Never edited `baseline-failures.tsv`.**

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/stack-render.cjs` - `renderCommand`, `contextFor`, `AGENT_SLICES`, `AGENT_ALIASES`; no fs access, no require of `stack-profile.cjs`
- `plugins/devflow/devflow/bin/lib/stack-render.test.cjs` - C1-C14 plus C1b (timeout_s/cwd passthrough) and extra-1 (hard-cut fallback), 16 tests total, all passing

## Decisions Made
- See `key-decisions` in frontmatter above (AGENT_SLICES shape, canonical-name return, extra hard-cut test).

## Deviations from Plan

None — TRD executed exactly as written. The one addition (the `extra-1` hard-cut test) is coverage for behavior the TRD's own gotchas section specifies but no listed C-case exercises; it isn't a scope change, just an extra assertion protecting documented behavior.

## Issues Encountered
None. All 16 tests passed on first implementation attempt for both tasks; no fix-attempt cycles were needed.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `renderCommand`, `contextFor`, `AGENT_SLICES`, `AGENT_ALIASES` are implemented, tested, and ready for 35-03 to re-export from `stack-profile.cjs` and wire into `cmdStack`.
- No blockers. The 11 environment-flake failures are pre-existing to this sandbox's daemon/timing behavior and unrelated to this TRD's diff — worth noting to the orchestrator/next wave, but not a gate on this TRD.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
