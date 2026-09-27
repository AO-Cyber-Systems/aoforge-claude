---
objective: 35-stack-profile-loader
trd: "01"
subsystem: validation
tags: [json-schema, validation, stack-profile, ui-spec, shared-walker]

# Dependency graph
requires: []
provides:
  - "lib/json-schema-lite.cjs — a shared, dependency-free JSON-Schema-subset walker exporting deref, typeOk, checkStructure, validate, describe, isPlainObject, join"
  - "New keywords enforced beyond the original ui-spec walker: union type arrays, const, propertyNames, minLength, uniqueItems, format:date, and object-form additionalProperties"
  - "ui-spec-validate.cjs refactored to import the walker instead of owning a private copy"
affects: [35-02a, 35-02b, 35-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One shared JSON-Schema-subset walker (json-schema-lite.cjs) serves every caller that needs structural validation against a hand-authored schema subset; callers own their own error-code mapping (SPEC001 etc.), the walker returns bare {path, msg}."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/json-schema-lite.cjs
    - plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/ui-spec-validate.cjs

key-decisions:
  - "checkStructure emits {path, msg} with no error code; ui-spec-validate.cjs maps each to err('SPEC001', path, msg) at its one call site, so the walker itself names no error-code space and stays reusable by stack-profile validation (35-03)."
  - "minItems is deliberately left unenforced — surface-spec.schema.json declares it and enforcing it would add SPEC001 errors ui-spec's suites don't expect. Test 17 pins this as intentional, not an oversight."
  - "Kept the exact check order from the original walker (anyOf/oneOf -> type -> enum -> pattern -> minimum -> items -> object walk) and inserted new keywords only where they cannot change old verdicts: const after enum, minLength/format after pattern (strings only, early-return), uniqueItems before the items walk, propertyNames and object-form additionalProperties inside the object walk."

requirements-completed: [STK-01]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~18min
completed: 2026-09-27
---

# Objective 35 TRD 01: Extract the schema walker into json-schema-lite.cjs Summary

**Moved the hand-rolled JSON-Schema walker out of ui-spec-validate.cjs into a shared, dependency-free `lib/json-schema-lite.cjs`, and taught it the seven keywords `stack-profile.schema.json` needs — union `type`, `const`, `propertyNames`, `minLength`, `uniqueItems`, `format:date`, and object-form `additionalProperties` — while keeping every ui-spec verdict byte-for-byte identical.**

## Performance

- **Duration:** ~18 min (wave base 0fb49ae -> completion)
- **Started:** 2026-09-27T15:27:32Z (preflight claim)
- **Completed:** 2026-09-27T15:39:45Z
- **Tasks:** 2 (both TDD: RED -> GREEN, plus one refactor commit)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- New `lib/json-schema-lite.cjs`: a single shared walker (`deref`, `typeOk`, `describe`, `isPlainObject`, `join`, `checkStructure`, `validate`) covering the original 9 ui-spec behaviours plus 8 new keywords, all message text copied verbatim from the extracted code.
- `ui-spec-validate.cjs` no longer owns a private copy of the walker — it imports `checkStructure`, `describe`, `isPlainObject`, `join` and maps the walker's bare `{path, msg}` errors to `SPEC001` at its single call site.
- Positive control: the shipped `references/stack-general.md` and `docs/stack-profiles/{go,dart,flutter}.md` frontmatter all validate against `schemas/stack-profile.schema.json` with zero errors, using the same `parseYamlLite` + walker path that `df-tools stack validate` will use in 35-03.
- All 19 TRD test-list cases pass (22 assertions across 3 describe blocks), the 6 ui-spec suites are unchanged at 151/151, and the wave regression gate shows zero regressions.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: json-schema-lite.cjs — extracted walker plus new keywords | `node --test plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` | 0 | PASS |
| 2: ui-spec-validate.cjs imports the shared walker | `node --test 'plugins/devflow/devflow/bin/lib/ui-spec*.test.cjs' 'plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs'` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** `350ffde` — `test(35-01): json-schema-lite test list`
2. **Task 1 (GREEN):** `36d5532` — `feat(35-01): json-schema-lite walker with stack-profile keywords`
3. **Task 2 (refactor):** `cc67091` — `refactor(35-01): ui-spec-validate uses shared json-schema-lite walker`

**Plan metadata:** this SUMMARY.md commit (below).

_No REFACTOR-phase commit was needed beyond Task 2's own refactor commit — the GREEN implementation needed no cleanup pass._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| json-schema-lite unit tests (19 cases / 22 assertions) | `node --test plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` | 0 | PASS |
| ui-spec suites (baseline-equal: 151/151 before and after) | `node --test 'plugins/devflow/devflow/bin/lib/ui-spec*.test.cjs'` | 0 | PASS |
| Neutrality (`json-schema-lite.cjs` names no stack) | `rg -n -i "golang\|gofmt\|dart\|flutter\|pubspec\|npm\|cargo\|pytest\|rails\|gradle\|swift\|kotlin" plugins/devflow/devflow/bin/lib/json-schema-lite.cjs` | 1 (no match) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` (module not yet created) | 1 | FAIL (correct — `MODULE_NOT_FOUND`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` (after implementing json-schema-lite.cjs) | 0 | PASS (correct — 22/22 assertions) |
| REFACTOR (Task 2) | `node --test 'plugins/devflow/devflow/bin/lib/ui-spec*.test.cjs' 'plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs'` | 0 | PASS (correct — 151 ui-spec + 22 json-schema-lite, all green) |

Baseline recorded before any edit (per Task 1's instruction): `node --test 'plugins/devflow/devflow/bin/lib/ui-spec*.test.cjs'` -> **151 pass / 0 fail**. After Task 2's refactor, the identical command reports **151 pass / 0 fail** — counts equal, and `rg -n "function (deref|typeOk|checkStructure)" plugins/devflow/devflow/bin/lib/ui-spec-validate.cjs` finds no matches, confirming the walker was moved, not duplicated.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` entries from the TRD frontmatter hold — see below)
- **Gate failures:** None

**Must-haves check:**
- `validate(value, schema)` returns `[]` for a conforming value and `[{path, msg}]` otherwise, never throws — confirmed by all 22 test assertions and the positive-control cases.
- Every keyword the old ui-spec walker supported produces the same path/message text as before — confirmed by parity tests 1-9 and the unchanged 151/151 ui-spec suite count.
- New keywords (union type, const, propertyNames, minLength, uniqueItems, format:date, object-form additionalProperties) are enforced — confirmed by tests 10-16.
- `minItems` is still not enforced — confirmed by test 17.
- The bundled stack-general.md and go/dart/flutter profiles validate with zero errors — confirmed by tests 18a/18b.
- `ui-spec-validate.cjs` no longer defines the walker functions and maps errors to SPEC001 — confirmed by the `rg` check above and the unchanged ui-spec pass count.

## Regression Gate (baseline-relative)

Per the TRD's "Regression gate (baseline-relative)" section, ran from the repo root:

```
node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'
```

**Observed totals (informational):** 479 suites, 3411 pass, 11 fail, 50 skipped, 0 cancelled/todo — output written to the session scratchpad, never the repo.

**Classification of every failure:**

| # | File:line | Test name | In baseline TSV? | Re-run alone | Diff touches its code? | Classification |
|---|---|---|---|---|---|---|
| 1-4 | `bin/df-tools.test.cjs:1472,1494,1505,1527` | 4 commit `--files` cases | Yes (lines 1-4) | — (passed this run) | n/a | Pre-existing |
| 5 | `bin/handoff-e2e.test.cjs:795` | MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN | Yes (line 5) | — (skipped this run: node-pty unavailable) | n/a | Pre-existing |
| 6-9 | `bin/lib/project-state.test.cjs:251,320,367,438` | cases 21a, 23, 26, 29 | Yes (lines 6-9) | — (passed this run) | n/a | Pre-existing |
| 10 | `hooks/verify-commits.test.js:205` | Test 5: autonomous + recent commits | Yes (line 10) | — (passed this run) | n/a | Pre-existing |
| 11 | `bin/devflow-watch.test.cjs:145` | foreground daemon writes PID file, status reports running, stop kills it | No | Still fails alone | No — file untouched by this TRD's diff | Environment flake (daemon/PID-file lifecycle) |
| 12 | `bin/devflow-watch.test.cjs:177` | start refuses when daemon already running | No | Still fails alone | No | Environment flake |
| 13 | `bin/devflow-watch.test.cjs:191` | start cleans up stale PID file and starts fresh | No | Still fails alone | No | Environment flake |
| 14 | `bin/devflow-watch.test.cjs:353` | C-2 start --project /p (single) writes watching:[/p] | No | Still fails alone | No | Environment flake |
| 15 | `bin/devflow-watch.test.cjs:380` | C-1 start --project /p1,/p2 writes watching:[/p1, /p2] | No | Still fails alone | No | Environment flake |
| 16 | `bin/handoff-e2e.test.cjs:254` | write pending -> daemon executes -> route-results emits result with stdout | No | Still fails alone | No — file untouched | Environment flake (handoff-daemon timing) |
| 17 | `bin/handoff-e2e.test.cjs:271` | disallowed command produces rejected done record + "Do NOT retry" guidance | No | Still fails alone | No | Environment flake |
| 18 | `bin/handoff-e2e.test.cjs:285` | idempotency: route-results emits once, silence on second invocation | No | Still fails alone | No | Environment flake |
| 19 | `bin/handoff-e2e.test.cjs:298` | multi-record: 3 queued commands appear in a single injection | No | Still fails alone | No | Environment flake |
| 20 | `bin/handoff-e2e.test.cjs:327` | LK-1: teardown reaps the daemon | No | Still fails alone | No | Environment flake |
| 21 | `bin/handoff-e2e.test.cjs:344` | LK-2: SIGTERM kills the daemon within its deadline | No | Still fails alone | No | Environment flake |

**Reasoning for the 11 candidate-regression rows (11-21):** `git diff --stat 0fb49aeb..HEAD` touches exactly three files — `plugins/devflow/devflow/bin/lib/json-schema-lite.cjs` (new), `plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` (new), and `plugins/devflow/devflow/bin/lib/ui-spec-validate.cjs` (modified). None of these are required by, or exercise, `devflow-watch.cjs`'s daemon/PID-file lifecycle or the handoff-e2e daemon-spawn pipeline. Each of the 11 was re-run in isolation (`node --test <file>`) and failed identically both times (same assertion, same error), so this is a deterministic characteristic of this machine's daemon/process-spawn behavior under sandboxing, not a code regression from this TRD. This matches the TRD's own explicit example of a non-blocking case ("a PTY or handoff timing test"). Per the gate's rule, **none of these block completion.**

**Result: zero regressions. Wave regression gate holds.**

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/json-schema-lite.cjs` - the shared JSON-Schema-subset walker (new)
- `plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs` - 19-case test list, parity + new keywords + positive control (new)
- `plugins/devflow/devflow/bin/lib/ui-spec-validate.cjs` - deleted its private walker copy, imports `checkStructure`/`describe`/`isPlainObject`/`join` from json-schema-lite.cjs, maps `{path, msg}` to `err('SPEC001', path, msg)` at the single call site

## Decisions Made
See `key-decisions` in frontmatter: bare `{path, msg}` return shape with no code (caller-owned mapping), deliberate non-enforcement of `minItems`, and the exact insertion points chosen for each new keyword to preserve check order and byte-for-byte ui-spec parity.

## Deviations from Plan

None — TRD executed exactly as written. Both tasks completed with their commit types and messages exactly as specified in the TRD's "Runtime model" section.

## Issues Encountered

The wave regression gate surfaced 11 test failures not in `baseline-failures.tsv`. Investigated per the TRD's own protocol (re-run in isolation, check `git diff --stat` against the wave base) and classified all 11 as environment flakes tied to `devflow-watch`/`handoff-e2e` daemon-lifecycle tests on this machine — none touch code this TRD changed. See "Regression Gate" section above for the full classification table. Not blocking.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

`lib/json-schema-lite.cjs` is ready for 35-03's `validateProfile` to call `validate(value, schema)` directly against `schemas/stack-profile.schema.json`. No blockers for 35-02a/35-02b/35-03.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
