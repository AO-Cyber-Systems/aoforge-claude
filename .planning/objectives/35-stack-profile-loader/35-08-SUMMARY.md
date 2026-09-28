---
objective: 35-stack-profile-loader
trd: "08"
subsystem: testing
tags: [testing-strategy, verification-patterns, checkpoints, planner, stack-profile, docs]

# Dependency graph
requires:
  - objective: 35-stack-profile-loader
    provides: "35-06 wired planner/executor to read the resolved stack profile via `df-tools stack context`"
provides:
  - "testing-strategy.md rewritten as a stack-neutral layer×routing reference with concrete stack cells moved under an Example stack profiles pointer"
  - "verification-patterns.md and checkpoints.md web/TS tables labelled as examples rather than presented as canonical"
  - "planner.md Step 4 reads the resolved Testing section via `df-tools stack context planner --raw` before consulting testing-strategy.md, with a documented fallback when `stack` is unavailable"
affects: [planning, verification, checkpoints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reference docs separate abstract verification layers from concrete per-stack tool examples, with examples pointing at docs/stack-profiles/ in the devflow-claude repo (never the ~/.claude/devflow mirror, which has no docs/)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/references/testing-strategy.md
    - plugins/devflow/devflow/references/verification-patterns.md
    - plugins/devflow/devflow/references/checkpoints.md
    - plugins/devflow/agents/planner.md

key-decisions:
  - "Kept the Flutter-web semantics gotcha and Codegen discipline sections verbatim (minus the Sorbet bullet) per the TRD's explicit scope boundary."
  - "Moved cells verbatim into the Example stack profiles table rather than inventing new tool claims."

patterns-established:
  - "Web/TS concrete examples in reference docs get an explicit 'Examples for web/TS profiles' label so they are never mistaken for the only supported stack."

requirements-completed: ["STK-08"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 4min
completed: 2026-09-27
---

# Objective 35 TRD 08: Neutral references Summary

**Stripped stack-guessing prose from testing-strategy.md, verification-patterns.md, checkpoints.md and planner.md Step 4 — the planner now reads the resolved Testing section from the stack profile first, and Rails/RSpec/Capybara/Sorbet are gone.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-27T17:22:58Z
- **Completed:** 2026-09-27T17:26:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `testing-strategy.md` rewritten: "Testing Strategy — Layers and Routing" with an abstract `## Verification layers` table, a stack-neutral "How the planner uses this document" section, and the former per-stack cells (Go, Flutter, Node) moved under `## Example stack profiles`, pointing at `docs/stack-profiles/` in the devflow-claude repo with an explicit note that the `~/.claude/devflow` mirror carries no `docs/`.
- Rails/RSpec/Capybara/Sorbet and the `kind`→stack "maps to likely" guess removed entirely; Platform routing and Out of scope sections reworded to be stack-neutral.
- `verification-patterns.md` and `checkpoints.md` (3 sections: Service CLI Reference, Environment Variable Automation, Dev Server Automation) now carry `Examples for web/TS profiles` labels; verifier Step-8 pointer reworded to name `must_haves.platform` then `verification.runtime` instead of "based on the project's stack".
- `planner.md` Step 4 rewritten to run `df-tools stack context planner --raw` first, route to the resolved `## Testing` section, then consult `testing-strategy.md` for abstract layer definitions/routing, with an explicit fallback to testing-strategy.md alone when `stack` is unavailable. The `:311` outside-in sentence now points at "the resolved stack profile (Step 4)" instead of "per stack" in the matrix. The `@~/.claude/devflow/references/testing-strategy.md` reference line at :317 was left untouched (dangling-reference guard).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: testing-strategy.md neutral layers | `rg -n -i "rails\|rspec\|capybara\|sorbet\|maps to likely" plugins/devflow/devflow/references/testing-strategy.md` | 1 (no matches) | PASS |
| 2: verification-patterns.md + checkpoints.md labels; planner.md Step 4 | `node --test plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs` | 0 (25/25 pass) | PASS |

All `<done>` bullet checks for both tasks were run individually and matched:
- `rg -F "## Example stack profiles"`, `rg -F "docs/stack-profiles/"`, `rg -F "## Platform routing"`, `rg -F "no stack is inferred from" -i` — all matched in testing-strategy.md.
- `rg -F "Examples for web/TS profiles"` matched in verification-patterns.md; `rg -c -F "Examples for web/TS profiles"` == 3 in checkpoints.md.
- `rg -F "based on the project's stack"` → no match in verification-patterns.md.
- `rg -F "stack context planner --raw"` matched in planner.md; `rg -F "The resolver's \`kind\` field anchors the project's stack family"` → no match; `rg -F "Rails: RSpec/Capybara"` → no match; `rg -F "@~/.claude/devflow/references/testing-strategy.md"` still matched.

## Task Commits

Each task was committed atomically:

1. **Task 1: testing-strategy.md — neutral layers, example-profiles pointer, no Rails** - `6d45c74` (docs)
2. **Task 2: verification-patterns.md + checkpoints.md labels; planner.md Step 4** - `4013792` (docs)

**Plan metadata:** SUMMARY commit (this file) is committed separately per instructions.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| flutter-ui-scope.test.cjs (planner.md reader) | `node --test plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs` | 0 | PASS |
| Full regression suite (see below) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 1 pre-existing failure (see Regression Gate) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` in TRD frontmatter confirmed by rg above)
- **Gate failures:** None (the one observed test failure is pre-existing, classified below)

## Regression Gate (baseline-relative)

Ran from repo root:
```
node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'
```
Output written to session scratchpad (`/private/tmp/claude-501/.../scratchpad/35-08-full-run.txt`), never the repo.

**Observed totals (informational only):** tests 3581, suites 500, pass 3548, fail 1, cancelled 0, skipped 32, todo 0, duration 40.2s.

**Failures and classification:**

| File:line | Test name | Classification | Basis |
|---|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** | Name matches verbatim the second column of `baseline-failures.tsv` (line for `handoff-e2e.test.cjs:795:3`). Per gate rule 3, a failure listed in the TSV is pre-existing regardless of pass/fail in this run — no re-run required. |

The other 9 baseline-listed entries (df-tools.test.cjs ×4, project-state.test.cjs ×4, verify-commits.test.js ×1) did not fail in this run — nothing further required; they remain in the baseline file untouched (rule 5: never edit `baseline-failures.tsv`).

No new (non-baseline) failure names were observed. `git diff --stat` against wave base (`ebb772d`) confirms only 4 doc/prose files changed (`testing-strategy.md`, `verification-patterns.md`, `checkpoints.md`, `planner.md`) — no code path touched by `handoff-e2e.test.cjs`'s daemon/doctl-auth flow was modified by this TRD, consistent with the pre-existing classification.

**Verdict: gate passes. No regression.**

## Files Created/Modified
- `plugins/devflow/devflow/references/testing-strategy.md` - Rewritten as stack-neutral layers/routing reference with Example stack profiles pointer
- `plugins/devflow/devflow/references/verification-patterns.md` - Added "Examples for web/TS profiles" note; reworded Step-8 pointer
- `plugins/devflow/devflow/references/checkpoints.md` - Added "Examples for web/TS profiles" label under 3 sections
- `plugins/devflow/agents/planner.md` - Step 4 rewritten to read resolved Testing section first; :311 sentence reworded

## Decisions Made
None beyond the TRD's own prescriptions - followed the `<codebase_examples>` target structure as specified.

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

The reference docs and planner Step 4 no longer guess a stack from `kind`; STK-08 is complete. Remaining objective-35 waves (if any) can build on a planner that consistently prefers the resolved stack profile over inferred defaults.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
