---
objective: 35-stack-profile-loader
trd: "03"
subsystem: stack-profile
tags: [validation, cli, json-schema, tdd]
dependency-graph:
  requires: ["35-01", "35-02a", "35-02b"]
  provides: ["validateProfile", "validateProfileText", "df-tools stack CLI"]
  affects: ["35-04 (init)", "35-05 (health)"]
tech-stack:
  added: []
  patterns:
    - "resolveFromParsed factoring: resolveProfile is now a thin disk-reading wrapper around a
       chain-walk+merge core that also accepts an in-memory parsed target, so a draft that has
       never been written to disk resolves identically to a saved .planning/STACK.md."
    - "Per-layer schema check with a no-id-required schema variant for project/component tiers
       (only bundled/org tiers are addressed by id via extends, so only they must declare one)."
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-validate.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-profile-fixtures.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
decisions:
  - "STK001 schema check runs per-layer (each file's own frontmatter), not on the merged result,
     so an error's `file` always points at the document that actually violates the schema."
  - "Project-tier and component-tier layers validate against a schema variant with `id` dropped
     from `required` — existing 35-02a fixtures establish that a project's .planning/STACK.md
     conventionally omits `id` and inherits it from the chain; only bundled/org tiers, which are
     addressed BY id via `extends`, must declare one."
  - "STK009 (component-missing) is checked twice on purpose with no double-count risk: once inside
     resolveFromParsed's own file-based component match (dormant during `validate`, since no
     `file` is ever passed there), and once as an eager loop over every declared components[]
     entry inside runValidationRules (the one that actually fires during validate)."
metrics:
  duration: "~50 min"
  completed: 2026-09-27
tokens_input: 14178183
tokens_output: 100425
tokens_cache_read: 13942211
tokens_cache_write: 235716
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 35 TRD 03: `validateProfile` and the `df-tools stack` CLI Summary

Added STK001-STK009 schema + cross-field validation for stack profiles
(`validateProfile`/`validateProfileText`) and exposed the 35-02a/35-02b loader through
`df-tools stack resolve|context|validate|command`. `stack init` is out of scope (35-04).

## Deviations from Plan

None — TRD executed exactly as written. Both tasks matched the code table and CLI surface on
the first GREEN run (V1-V13 passed after one schema-variant fix during GREEN itself, not a
post-hoc deviation; see Decisions above).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: validateProfile / validateProfileText | `node --test plugins/devflow/devflow/bin/lib/stack-validate.test.cjs` | 0 | PASS (16/16) |
| 2: cmdStack + dispatcher + HELP_TABLE | `node --test plugins/devflow/devflow/bin/lib/stack-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/help-delegation.test.cjs plugins/devflow/devflow/bin/lib/stack-profile.test.cjs plugins/devflow/devflow/bin/lib/stack-render.test.cjs` | 0 | PASS (107/107) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/stack-validate.test.cjs` | 1 | FAIL (correct — `TypeError: sp.validateProfile is not a function`) |
| GREEN (Task 1) | `node --test plugins/devflow/devflow/bin/lib/stack-validate.test.cjs` | 0 | PASS (16/16) |
| RED (Task 2) | `node --test plugins/devflow/devflow/bin/lib/stack-cli.test.cjs` | 1 | FAIL (correct — `stack` not yet a recognized df-tools subcommand; captured with GREEN implementation stashed) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/stack-cli.test.cjs` | 0 | PASS (12/12) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Fast verify | `node --test stack-validate.test.cjs stack-cli.test.cjs stack-profile.test.cjs stack-render.test.cjs help.test.cjs` | 0 | PASS (86/86) |
| Neutrality | `rg -n -i "golang\|gofmt\|\bdart\b\|flutter\|pubspec\|\bnpm\b\|cargo\|pytest\|rails\|gradle\|swift\|kotlin" stack-profile.cjs stack-render.cjs` | 1 (no matches) | PASS |
| Full regression gate | see below | 1 | 1 failure, pre-existing (see below) |

## Post-TRD Verification

- Auto-fix cycles used: 1 (schema-variant fix for `id` requirement during Task 1 GREEN, discovered
  via V1's own test failure — see Decisions)
- Must-haves verified: 7/7 (all `must_haves.truths` bullets exercised by V1-V13/L1-L10)
- Gate failures: None blocking

## Regression Gate (baseline-relative)

Ran `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
from the repo root, output written to the session scratchpad only.

**Totals (this run, informational):** 3546 tests, 3513 pass, 1 fail, 0 cancelled, 32 skipped.

**Failures and classification:**

| Test | File:Line | In baseline TSV? | Classification |
|---|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | Yes (line 5 of `baseline-failures.tsv`) | **Pre-existing** |

That is the only failure this run produced. The 11 known-flaky failures the orchestrator
reproduced on a clean base-`0fb49ae` worktree (devflow-watch.test.cjs daemon PID-lifecycle,
route-results, LK-1/LK-2 in handoff-e2e.test.cjs) did **not** reproduce in this run — this run's
`devflow-watch` suite passed in full, and the other 9 baseline-TSV entries (df-tools.test.cjs
commit-scoping cases, project-state.test.cjs cases 21a/23/26/29, verify-commits.test.js Test 5)
also passed in full this run. Per the TRD's rule, a baseline-TSV entry counts as pre-existing
"whether it passes or fails in your run" — none of them regressed, and no failure outside the
TSV appeared. `baseline-failures.tsv` was not edited.

**Verdict: no regressions.** `git diff --stat` against the wave base touches only
`plugins/devflow/devflow/bin/lib/stack-profile.cjs`, `stack-validate.test.cjs`, `stack-cli.test.cjs`,
`__fixtures__/stack-profile-fixtures.cjs`, `df-tools.cjs`, and `lib/help.cjs` — none of which the
one observed failure (a `doctl`/DigitalOcean-token handoff path) exercises.

## Commits

| Commit | Type | Message |
|---|---|---|
| `1c34eec` | test | test(35-03): validateProfile cases |
| `6ad592a` | feat | feat(35-03): validateProfile with STK codes |
| `871b4d6` | test | test(35-03): df-tools stack CLI cases |
| `54cc7a0` | feat | feat(35-03): df-tools stack resolve\|context\|validate\|command |

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-validate.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-cli.test.cjs
- FOUND: 1c34eec, 6ad592a, 871b4d6, 54cc7a0 (all present in `git log --oneline`)
