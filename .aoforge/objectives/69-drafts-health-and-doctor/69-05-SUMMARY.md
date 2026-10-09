---
objective: 69-drafts-health-and-doctor
trd: "05"
subsystem: validate-health
tags: [validate-health, validate-requirements, requirements-agreement, w065, flag-spec]
requires: [69-03]
provides:
  - "validate health Check 20: W065 requirements-unlisted (warning, never repairable) and W065 requirements-check-failed"
  - "df-tools validate requirements [--objective <N>]: read-only, network-free report of the same findings (JSON, or W065 lines with --raw)"
  - "flag-spec entry and PROBES row for `validate requirements`; help usage and dispatcher error list updated"
affects: [69-04 doctor check 22 (defers W065 as it does the other health codes), 69-06 docs]
tech-stack:
  added: []
  patterns: [one scan per run rendered by two entry points, advisory exit 0 like validate docs, injected collaborator seam (options.requirementsAgreement)]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/flag-spec.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
key-decisions:
  - "W065 doubles as the failure code (requirements-check-failed), as W063 does, so a check that cannot run is never silent."
  - "`validate requirements` has no try/catch: a scan that cannot read the planning tree surfaces as a loud non-zero exit rather than a silent empty report. Findings themselves always exit 0."
  - "The `--objective` filter belongs to the standalone command only; `validate health` always scans every objective."
requirements-completed: [TOOL-10]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 10min
completed: 2026-10-08
tokens_input: 6906221
tokens_output: 38682
tokens_cache_read: 6786315
tokens_cache_write: 119786
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 69 TRD 05: validate requirements wiring Summary

`validate health` now reports each requirement a VERIFICATION marks satisfied that no SUMMARY lists as W065, and `validate requirements [--objective <N>]` prints the same findings read-only with no git fetch.

## Progress
- [x] Task 1: validate health Check 20 (tests 6-7) — af7acab4 (RED 6f27db01)
- [x] Task 2: `validate requirements` command (tests 1-5, 8-9) — 4dee746b (RED ca9b9caa)

## What was built

- `validate.cjs` Check 20 (after Check 19): one `scan(planningDir)` per run, each finding rendered with `findingMessage` / `findingFix` as a non-repairable W065 warning. A throwing scan becomes W065 `requirements-check-failed: <message>` with a fix pointing at `validate requirements`. `options.requirementsAgreement` is a test seam; the dispatcher still passes only `{ repair }`.
- `validate.cjs` `cmdValidateRequirements(cwd, { objective }, raw)`: JSON `{ findings: [{ objective, number, requirement, verification, candidates, message, fix }], checked, skipped }`; `--raw` prints `W065 <message>` then `  fix: <fix>` per finding, or `requirements-completed agrees with VERIFICATION (<n> objective(s), <m> requirement(s) checked)`; no `.planning/` gives `{ findings: [], checked: {}, note: 'no .planning/' }`. Exit 0 in every case.
- `df-tools.cjs`: import, a `requirements` arm that reads `--objective <N>` or `--objective=<N>`, the unknown-subcommand error now lists `requirements`, header comment line.
- `help.cjs` usage and summary, `flag-spec.cjs` `validate.subcommands.requirements: { values: ['--objective'] }`, and the `'validate requirements'` probe in `flag-guard-fixtures.cjs`. `validate requirements --zz` exits 1 naming the flag and the entry.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: validate health Check 20 | `node --test lib/validate-requirements.test.cjs lib/validate.test.cjs lib/validate-skill-marker.test.cjs` (118 tests; siblings validate-model-ids, validate-checks-pin, validate-gh-health 16 tests) | 0 | PASS |
| 2: validate requirements command | `node --test lib/validate-requirements.test.cjs lib/flag-spec.repo.test.cjs lib/flag-guard-cli.test.cjs lib/help.test.cjs lib/dispatch-completeness.test.cjs` (58 tests); `df-tools validate requirements --raw` in this checkout printed `requirements-completed agrees with VERIFICATION (60 objectives, 22 requirements checked)`; `validate requirements --zz` exited 1 naming `--zz` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test lib/validate-requirements.test.cjs` (tests 6, 7: `0 !== 2`, `0 !== 1`, no Check 20) | 1 | FAIL (correct) |
| GREEN (task 1) | same | 0 | PASS (correct) |
| RED (task 2) | `node --test lib/validate-requirements.test.cjs lib/flag-spec.repo.test.cjs lib/flag-guard-cli.test.cjs` (9 failures: tests 1-5, 9, flag-guard probe 15, 15b, spec/probe equality 5) | 1 | FAIL (correct) |
| GREEN (task 2) | the five-file verify set | 0 | PASS (correct) |

REFACTOR: none needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over validate-requirements, validate, flag-spec.repo, flag-guard-cli, help, dispatch-completeness | 0 | PASS |
| test (full, minus micro.test.cjs) | `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | known failures only, see below |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

Baseline on the untouched base (WAVE_BASE): 11333 tests, 13 failures. After Task 2: 11341 tests (+8 new), 14 failures.
- 13 are the baseline set, none caused by this TRD: ten `devflow-watch` / `handoff-e2e` daemon tests (no node_modules in the worktree) and `doctor.e2e.test.cjs` 1, 3, 6 (owned by 69-04, the 69-02 W064 interim).
- 1 was new and transient: `roadmap-reconcile.test.cjs` E2E1 (a TRD had a SUMMARY while its ROADMAP checkbox was unticked). `roadmap update-job-progress 69` ticked 69-05 and the file's 63 tests then passed. The same thing happened to 69-02.
- `micro.test.cjs` was excluded from the full run, per the TRD's validation_gates note (git signing prompts).

## Discovered commands

None. Every command came from the stack profile (`npm test`, scoped `node --test {files}`).

## Deviations from Plan

None - TRD executed exactly as written. Additions inside the TRD's scope:

- **[Test coverage] Test 4 also asserts the unfiltered scan** (`checked` of 2 objectives and 5 requirements), and test 1 asserts `checked` and `skipped`, so the report shape is pinned beyond the finding rows.
- **[Test seam] Test 3 closes the gap by rewriting two fixture SUMMARYs** (58-05, 58-09) instead of using `fiftyEightShape({ corrected: true })`, so it mirrors the TRD's wording ("after the fixture SUMMARYs list EST-02 and EST-04").

## Auth gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - W065 `requirements-unlisted` is a warning, never repairable, fix names candidates and `summary post` (test 6; `repairable_count` equals that of the corrected shape).
  - `validate requirements` JSON and `--raw` forms, the clean line and `--objective` / `--objective=` filters (tests 1-4); no `.planning/` note, exit 0 (test 5).
  - On this repository `validate requirements` reports no finding (test 9, and the CLI printed the "agrees" line over 60 objectives and 22 requirements) and an in-process `validate health` shows zero W065.
  - A throwing scan is W065 `requirements-check-failed: boom` (test 7).
  - `validate requirements --zz` exits 1 naming the flag, through the PROBES loop (flag-guard-cli test 15) and by hand.
- Gate failures: none caused by this TRD (baseline set above).

## Self-Check: PASSED

- Created file found: `plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs`.
- Modified files found: `validate.cjs`, `df-tools.cjs`, `help.cjs`, `flag-spec.cjs`, `__fixtures__/flag-guard-fixtures.cjs`.
- Commits found in `git log`: 6f27db01, af7acab4, ca9b9caa, 4dee746b.
- `requirements-agreement.cjs` and `doctor-checks/*` were not edited (69-04 owns the latter).
