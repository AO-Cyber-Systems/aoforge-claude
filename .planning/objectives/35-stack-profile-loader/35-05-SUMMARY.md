---
objective: 35-stack-profile-loader
trd: "05"
subsystem: validate
tags: [stack-profile, validate-health, df-tools, stk-codes]

# Dependency graph
requires:
  - objective: 35-stack-profile-loader (TRD 35-03)
    provides: "stack-profile.cjs validateProfile()/validateProfileText() and the STK001-STK009 code catalog"
  - objective: 35-stack-profile-loader (TRD 35-01)
    provides: "project-state.cjs detectManifest()"
provides:
  - "cmdValidateHealth Check 12: maps STK001/003/004/006/008/009 -> E030 (aggregate), STK002 -> W030 (per issue), STK005 -> W031 (per issue), STK007 -> W032 (per issue), missing-but-detectable manifest -> I030"
  - "Check 12 is structurally never repairable — no addIssue call passes a 5th (repairable) argument, and nothing ever pushes a stack-related kind into the `repairs` array"
  - "health.md offer_repair step documents the stack-init preview/confirm/--write flow for I030/W030/W031/E030, including under --migrate"
affects: [35-stack-profile-loader (later TRDs consuming validate health output), health/migrate workflows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Health-check codes (E0xx/W0xx/I0xx) built by re-mapping an underlying subsystem's own error codes (STK0xx) rather than duplicating validation logic — validate.cjs never re-implements STK005/STK007 detection, it just re-labels validateProfile()'s output"
    - "Lazy require() inside a try/catch check block to avoid a load-order cycle between validate.cjs and stack-profile.cjs/project-state.cjs"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/workflows/health.md

key-decisions:
  - "E030 is one aggregate issue per run (first offending STK code + message, plus a '(+N more)' suffix when N>1), matching the locked mapping table rather than one E030 per STK error"
  - "W030's <id> and W031's <field>/<key> are extracted via regex from validateProfile()'s existing issue.msg text (e.g. \"extends 'missing' not found at ...\", \"gates.task names 'nosuch', which is not a defined command\") rather than plumbing new structured fields through stack-profile.cjs — keeps 35-03's return shape untouched"
  - "detectManifest(cwd, { userHome: homeDir }) is called with the TRD-specified second argument even though the current detectManifest(rootDir) signature ignores it (JS silently drops extra args) — this is the documented placeholder for 35-09's org-profile markers, not a bug"

requirements-completed: ["STK-05"]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~20min
completed: 2026-09-27
---

# Objective 35 TRD 05: `validate health` Check 12 — the stack profile Summary

**Check 12 in `cmdValidateHealth` maps STK001-STK009 from `stack-profile.cjs`'s `validateProfile()` onto E030/W030/W031/W032, and flags a missing-but-detectable manifest as I030 — no code path in Check 12 ever sets `repairable: true` or pushes a repair action.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- Check 12 inserted into `cmdValidateHealth` between the engine-lag block and the repair-execution block, exactly at the TRD's locked insertion point
- 10 new H-group tests (H1-H10) covering valid profiles, schema violations, cycles, unresolved `extends`, undefined command keys, over-length bodies, manifest-present/absent, `--repair` never touching STACK.md, and `homeDir` plumbing
- `health.md` documents the stack-init preview/confirm/`--write` flow for Check 12, including under `--migrate`, plus new error-code table rows for E030/W030/W031/W032/I030

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Check 12 in cmdValidateHealth (H1-H10) | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (40/40, 0 fail) |
| 2: health.md — act on Check 12 and --migrate | `rg -n "Check 12\|stack init --write\|--migrate" plugins/devflow/devflow/workflows/health.md` | 0 | PASS (all 3 patterns match) |

DoD check (temp dir, checkout's CLI): `node df-tools.cjs validate health --raw` in a fresh dir containing only `package.json` produced `info: [{"code":"I030", "message":"stack-profile-absent: a javascript manifest is present but .planning/STACK.md is not (general profile in use)", "fix":"Draft one with \`df-tools stack init\`, review it, then \`df-tools stack init --write\`"}]` — confirmed.

## Task Commits

1. **Task 1 (RED): validate health Check 12 tests** - `c68b139` (test)
2. **Task 1 (GREEN): validate health Check 12 — stack profile** - `3af6516` (feat)
3. **Task 2: health workflow offers stack init for Check 12** - `5f5c6fe` (docs)

**Plan metadata:** (this commit, following SUMMARY.md creation)

_Note: Task 1 is TDD (RED -> GREEN); Task 2 is a standard doc task._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| fast verify | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS |
| wave regression gate | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | PASS (baseline-relative — see below) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 1 | FAIL (correct — 8/10 new H-tests failed: H2-H7, H9, H10; H1/H8 assert absence and passed trivially before Check 12 existed) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (correct — 40/40 tests, 0 fail) |

No REFACTOR commit — the GREEN implementation matched the codebase example / mapping table directly with no cleanup pass needed.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/7 (all `must_haves.truths` from the TRD frontmatter — E030/W030/W031/W032 mapping, I030 with `stack init` in the fix text, `repairable: false` / no STACK.md write under `--repair`, valid-or-no-manifest project gets no Check 12 issue, existing validate.test.cjs cases unchanged, health.md documents the offer including under `--migrate`)
- **Gate failures:** None (see regression gate detail below — both observed failures are non-blocking)

## Regression Gate (baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`

**Observed totals (informational):** tests 3581, pass 3547, fail 2, skipped 32, cancelled 0, duration ~43.2s.

| Failing test | In baseline TSV? | Classification | Evidence |
|---|---|---|---|
| `handoff-e2e.test.cjs:795` — "MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path" | Yes (exact name match) | **Pre-existing** | Listed verbatim in `.planning/objectives/35-stack-profile-loader/baseline-failures.tsv` |
| `lib/roadmap-reconcile.test.cjs:984` — "E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift" | No | **Environment/repo-state flake — not a regression, does not block** | Re-ran `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` alone — still fails identically (not a timing flake). `git diff --stat` from wave base `d4f13b7` to HEAD touches only `validate.cjs`, `validate.test.cjs`, `health.md` — none of which is `.planning/ROADMAP.md` or `lib/roadmap-reconcile.cjs`. The failure is a self-test comparing this repo's actual `.planning/ROADMAP.md` against SUMMARY files on disk: the immediately-prior wave TRD (35-04, this wave's base commit) left its ROADMAP.md checkbox unchecked for `35-04-TRD.md` despite its SUMMARY existing, because updating STATE.md/ROADMAP.md is explicitly reserved to the orchestrator (binding constraint on both 35-04's and this TRD's executor) rather than the per-TRD executor. This drift predates and is orthogonal to this TRD's diff. |

Per the "known pre-existing" note in this TRD's binding constraints (up to 11 daemon/handoff-timing failures reproduced on a clean worktree of base `0fb49ae` with none of objective 35's code): none of those additional ~10 failures reproduced in this run — only MA-7 (already independently confirmed pre-existing via the TSV) appeared.

**Gate result: PASS.** No regression introduced by this TRD's diff.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/validate.cjs` - Check 12 block (STK-to-health-code mapping, never repairable)
- `plugins/devflow/devflow/bin/lib/validate.test.cjs` - H1-H10 describe block (`Check 12: stack profile`), `stack-profile-fixtures.cjs` required read-only as `stackFx`
- `plugins/devflow/devflow/workflows/health.md` - `offer_repair` paragraph, `parse_args` note on `--migrate`, five new `<error_codes>` table rows

## Decisions Made
See `key-decisions` in frontmatter above (E030 aggregation, regex-based id/key extraction from existing STK messages, `detectManifest`'s ignored second argument).

## Deviations from Plan

None - TRD executed exactly as written. The only addition beyond the literal task text was five `<error_codes>` table rows in `health.md` for E030/W030/W031/W032/I030, added for documentation consistency with every other check's codes already listed there — no behavior change, same file already in scope for Task 2.

## Issues Encountered
None — every fixture (`profileMd`, `cycleHome`, `makeHome`, `longBodyProfile`) from 35-03/35-04's `stack-profile-fixtures.cjs` produced exactly the STK shapes the mapping table expected on first try (verified by hand against `validateProfile()` output before writing assertions).

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
Check 12 is live and its five codes (E030/W030/W031/W032/I030) are documented in `health.md`. Later 35-xx TRDs (e.g. 35-09's org-profile markers) can extend `detectManifest`'s second argument without touching Check 12's call site, since it already passes `{ userHome: homeDir }` today.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*

## Self-Check: PASSED

All three task commits (`c68b139`, `3af6516`, `5f5c6fe`) verified present via `git log --oneline --all`. All three modified files (`validate.cjs`, `validate.test.cjs`, `health.md`) and this SUMMARY.md verified present on disk.
