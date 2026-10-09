---
objective: 35-stack-profile-loader
job: "07"
subsystem: agents
tags: [verifier, debugger, integration-checker, stack-profile, agent-prompts]

# Dependency graph
requires:
  - objective: 35-stack-profile-loader
    provides: "`df-tools stack resolve` / `stack command` / `stack context <slice>` (TRD 35-03)"
provides:
  - "verifier.md Step 8 keys runtime selection on TRD `must_haves.platform` then resolved `verification.runtime`, with an honest skip reason instead of the dangling `.planning/project.md` read"
  - "verifier.md Step 8.0 runs `gates.objective` commands and reports `not_available` (never PASS) for missing/discover-failed commands"
  - "debugger.md loads the `debugger` stack slice at the start of evidence gathering and reproduces via its commands"
  - "integration-checker.md derives probe globs from the profile's Layout & architecture section, with the Next.js/TS probes relabelled as an explicit fallback"
affects: [verifier, debugger, integration-checker, future stack-profile consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agent prompts read `df-tools stack resolve`/`stack command`/`stack context <slice> --raw` and degrade to prior behaviour when the mirror's `stack` subcommand is unavailable"

key-files:
  created: []
  modified:
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/agents/debugger.md
    - plugins/devflow/agents/integration-checker.md

key-decisions:
  - "Kept the Flutter/web mapping bullets verbatim, relocated under a 'Backend mapping detail (unchanged)' heading, per the TRD's anti-pattern guard against deleting them"
  - "New Step 8.0 (objective gates) inserted between the rewritten Step 8 head and the untouched Step 8a, so the `### Step 8b`/`8c`/`8d` heading anchors used by verifier-ui-eval-invocation.test.cjs never move"

patterns-established:
  - "Objective gates always report `not_available` rather than PASS when a command can't be resolved or launched — never a false-positive gate pass"

requirements-completed: ["STK-07"]

# Verification evidence
verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 15min
completed: 2026-09-27
tokens_input: 2350676
tokens_output: 16688
tokens_cache_read: 2298889
tokens_cache_write: 51715
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 35 TRD 07: Verifier, debugger and integration-checker read the stack profile Summary

**Verifier Step 8 now selects its runtime check from TRD platform then the resolved `verification.runtime` (with honest skip reasons and `not_available`-never-PASS objective gates); debugger loads the stack slice for reproduction; integration-checker takes probe globs from the profile's Layout & architecture section with Next.js/TS as an explicit fallback.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-27T17:18:37Z
- **Completed:** 2026-09-27T17:33:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed the dangling `.planning/project.md` stack read and the "stack not detected" wording from verifier.md Step 8; replaced with a three-tier runtime-selection order (TRD platform -> `verification.runtime` -> stack-unavailable fallback) and honest per-case skip reasons (desktop, none/general, none/declared-none).
- Added Step 8.0 (Objective gates) which runs each `gates.objective` command via `stack command <key> --raw` and records PASS/FAIL/`not_available` (never a false PASS) in a VERIFICATION.md table.
- Reworded the single Functional-verification-status legend line after Step 8b to match the new skip reason, without touching any other Step 8b/8c/8d content (confirmed via single-hunk diff boundary check).
- debugger.md's `investigation_loop` Objective 1 now loads `stack context debugger --raw` first and reproduces with the profile's `test`/`build` commands, checking symptoms against Avoid rows and never hand-editing generated files.
- integration-checker.md now derives Steps 1-4 probe globs from the profile's `## Layout & architecture` section when present; the two Next.js probe blocks are explicitly labelled as the web/TS fallback.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: verifier.md Step 8 — runtime selection + objective gates | `node --test plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs` | 0 | PASS |
| 2: debugger.md + integration-checker.md — profile slice and probe globs | `rg -F "stack context debugger --raw" plugins/devflow/agents/debugger.md` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: verifier.md Step 8 — runtime selection + objective gates** - `d424cf1` (fix)
2. **Task 2: debugger.md + integration-checker.md — profile slice and probe globs** - `9f6360a` (feat)

**Plan metadata:** (this SUMMARY commit)

## Validation Gate Results

Task-level `<done>` grep checks (all TRD-specified, all passed):

| Gate | Command | Result | Status |
|---|---|---|---|
| No project.md stack reference | `rg -F "\`.planning/project.md\` stack" verifier.md` | no match | PASS |
| No "stack not detected" | `rg -F "stack not detected" verifier.md` | no match | PASS |
| General-profile skip wording present | `rg -F "no runtime declared in STACK.md; general profile" verifier.md` | matches | PASS |
| Step 8.0 heading present, before Step 8a | `rg -n -F "### Step 8.0: Objective gates"` at :449, `### Step 8a` at :458 | matches, ordered | PASS |
| not_available-never-PASS line present | `rg -F "**\`not_available\` is never PASS.**" verifier.md` | matches | PASS |
| runtime_check reference present | `rg -F "verification.runtime_check" verifier.md` | matches | PASS |
| Legend reworded exactly once | `rg -c -F "or the resolved stack profile declares no runtime" verifier.md` | 1 | PASS |
| Diff boundary past Step 8b is a single hunk | `git diff -U0 verifier.md` hunk at `@@ -564 +580 @@` — only the legend line changed | 1 hunk, 1 line | PASS |
| verifier-ui-eval-invocation.test.cjs | `node --test .../verifier-ui-eval-invocation.test.cjs` | 14/14 pass | PASS |
| debugger stack slice load | `rg -F "stack context debugger --raw" debugger.md` inside `investigation_loop` | matches | PASS |
| integration-checker probe-glob section before Step 1 | `rg -n -F "## Probe globs come from the stack profile"` :79, `## Step 1` :87 | matches, ordered | PASS |
| integration-checker stack context call | `rg -F "stack context integration-checker --raw"` | matches | PASS |
| Fallback label count | `rg -c -F "Fallback (web/TS profiles)"` | 2 | PASS |
| No bare Next.js headers remain | `rg -n "^# Next.js App Router$\|^# Next.js Pages Router$"` | no match | PASS |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 9/9 (all `must_haves.truths` from TRD frontmatter confirmed by the grep/diff evidence above and the passing test suite)
- **Gate failures:** None

## Regression Gate (baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
Output written to session scratchpad (not the repo): `35-07-full-run.txt`.

**Observed totals (informational):** tests 3581, suites 500, pass 3547, fail 2, skipped 32, todo 0.

**Every failure, classified:**

| Test | File:line | Classification | Reason |
|---|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Pre-existing** | Exact match against `baseline-failures.tsv` line 5, and also covered by the dispatch's KNOWN NOT-A-REGRESSION (a) (handoff-e2e.test.cjs daemon/timing tests reproduced on a clean worktree of base `0fb49ae` with none of objective 35's code). This TRD touched only `verifier.md`/`debugger.md`/`integration-checker.md` prose — no handoff/doctl code. |
| E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift | `plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs:984:1` | **Orchestrator-owned ROADMAP drift, not a regression** | Not in `baseline-failures.tsv`, but matches the dispatch's KNOWN NOT-A-REGRESSION (b) exactly: it fails because 35-06's SUMMARY.md exists while its ROADMAP checkbox is still unticked (`before`/`after` diff in the assertion shows only the 35-06 line toggling `[ ]` -> `[x]`). The orchestrator ticks ROADMAP boxes after each wave; this TRD did not touch ROADMAP.md or roadmap-reconcile code. |

**No new regressions.** `baseline-failures.tsv` was not edited. 8 of the 10 baseline-listed failures did not reproduce in this run (environment-dependent, per the TRD's note on the 1Password-signing-reachability difference) — this does not affect the gate, which only classifies failures that occurred here.

## Files Created/Modified
- `plugins/devflow/agents/verifier.md` — Step 8 head rewritten (runtime-selection order, honest skips), new Step 8.0 (objective gates), one legend line reworded; Step 8a/8b/8c/8d bodies untouched
- `plugins/devflow/agents/debugger.md` — one bullet added to `investigation_loop` Objective 1 (stack slice load + reproduction guidance)
- `plugins/devflow/agents/integration-checker.md` — new "Probe globs come from the stack profile" section before Step 1; two Next.js probe headers relabelled as fallback

## Decisions Made
- Followed the TRD's codebase_examples verbatim for both tasks; no design choices beyond what was specified.

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness
- All three consumer agents (verifier, debugger, integration-checker) now read the stack profile; this closes the last piece of objective 35's "stack profile loader" wiring across planner, executor, and verification agents.
- No blockers for subsequent waves.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
