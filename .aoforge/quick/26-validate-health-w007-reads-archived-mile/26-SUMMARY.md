---
objective: quick-26
trd: 01
subsystem: validate
tags: [validate-health, W007, roadmap, milestones, tdd]
requires: []
provides:
  - "W007 known-objective set = ROADMAP.md + .planning/milestones/*-ROADMAP.md, headings + checklist/bullet lines"
affects: [validate-health]
tech-stack:
  added: []
  patterns: ["per-call /g regex construction to avoid stateful lastIndex"]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - CHANGELOG.md
decisions:
  - "W007 gets its own w007KnownObjectives set; W006 keeps reading roadmapObjectives (ROADMAP.md headings only)"
  - "List-line pattern is anchored to a list marker so prose mentions never count"
metrics:
  duration: ~10 min
  completed: 2026-09-30
---

# Quick 26: W007 reads archived milestone roadmaps Summary

`validate health` W007 now treats an objective as known when any roadmap (current or `.planning/milestones/*-ROADMAP.md`) lists it as a heading or a checklist/bullet line, clearing the false W007s for objectives 00-41 on this repo.

## What changed

- `validate.cjs` Check 8: added `collectListedObjectives` (heading pattern + list-marker-anchored pattern) and a separate `w007KnownObjectives` set, seeded from `roadmapObjectives`, extended from ROADMAP.md list lines and every `*-ROADMAP.md` under `.planning/milestones/`. The W007 loop tests that set. Message text unchanged. W006, W001, W005 untouched.
- `validate.test.cjs`: new `describe('Check 8: W007 reads archived milestone roadmaps')` with the 8 planned cases.
- `CHANGELOG.md`: `### Fixed` entry under `[Unreleased]`.

## Commits

| Phase | Hash | Message |
|---|---|---|
| RED | d5bc391 | test(validate): W007 ignores archived milestone roadmaps |
| GREEN | 13be101 | fix(validate): W007 reads archived milestone roadmaps and checklist lines |

## Deviations from Plan

None - job executed as written. The edit gate denied the first test edit in ambient mode, so `df-tools skill-active --start quick` was run (as the dispatch allowed) and the marker is ended after the final commit.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 1 (cases 1-4 fail, 77 pass) | PASS (expected RED) |
| 2: GREEN fix | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 (81/81) | PASS |
| 2: live repo | `df-tools validate health` | 0 W007 warnings | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 1 | FAIL (correct; cases 1-4 fail, 5-8 regression guards pass) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | 5775 pass / 1 fail; the one failure is environmental (see below) |
| test (isolated) | `env -u DIGITALOCEAN_TOKEN -u DIGITALOCEAN_ACCESS_TOKEN node --test plugins/devflow/devflow/bin/handoff-e2e.test.cjs` | 0 | PASS (10 pass, 3 skipped) |
| health | `df-tools validate health` | 0 | PASS, zero W007 |

### Known unrelated failure

`npm test` reports one failure: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` in `handoff-e2e.test.cjs`. The test assumes `DIGITALOCEAN_TOKEN` is unset, and the shell that ran it has a `DIGITALOCEAN*` variable set, so the "unset token" path is never taken. With the variable removed the file passes. It does not import or exercise `validate.cjs`. Not caused by this change and not fixed here (out of scope).

## Live `validate health` result

W007 lines: none. Remaining output is unchanged from before this fix: W001 x2 (PROJECT.md sections), W005 x3 (`UI-VISUAL-EVAL-*` dirs), and I001 info lines.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3 (no W007 for 00-41; orphan dir 99 still warns; W006 unchanged)
- Gate failures: `npm test` MA-7 (pre-existing, environment-dependent, unrelated)

## Self-Check: PASSED
