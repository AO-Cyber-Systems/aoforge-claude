---
objective: 37-adopt-existing-repos
trd: 37-07
subsystem: adopt
tags: [adopt, scaffold, planning-bootstrap, claude-md, tdd]
requirements: [ADP-03]
dependency-graph:
  requires: [37-05]
  provides: [adopt-scaffold]
  affects: [adopt-cli, adopt.cjs, planning-bootstrap]
tech-stack:
  added: []
  patterns:
    - "pure/IO split: renderState/renderRoadmap are pure and total; scaffold() does IO"
    - "reuses migration runner (upgrade.apply) for config.json/state.json instead of hand-rolling them"
    - "reuses managed-block.cjs for the CLAUDE.md DEVFLOW block instead of hand-rolled markers"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-cli.cjs
decisions:
  - "Test 6 ('marker's scaffold summary unchanged apart from `at`') is interpreted as comparing two consecutive steady-state no-op runs (2nd vs 3rd), not the creating run vs the first no-op — the creating run necessarily changes stack.action ('written'->'existing') and created/skipped, so that comparison could never hold."
metrics:
  duration: "~40 turns"
  completed: 2026-09-28
tokens_input: 15799601
tokens_output: 142958
tokens_cache_read: 15278851
tokens_cache_write: 520442
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 07: df-tools adopt scaffold Summary

`df-tools adopt scaffold` writes the deterministic post-adopt project skeleton — STATE.md,
ROADMAP.md, STACK.md, `.planning/config.json`/`state.json` (via the existing migration runner),
a versioned CLAUDE.md DEVFLOW block, and backup-pruner registration — idempotently and
resumably, refusing cleanly on bad PROJECT.md/kind/work or a bad preflight route.

## Context

A previous executor had already drafted the full `scaffold()` implementation in
`adopt.cjs`/`adopt-cli.cjs` (+257 lines) but left it **uncommitted with no tests written**,
in violation of this project's TDD posture. This run's first responsibility was recovering
honest TDD evidence before committing anything.

## Deviations from Plan

### Process deviation (documented, not a Rule 1-4 code deviation)

**Implementation was drafted before its test.** To recover an honest RED evidence trail
without discarding working code: the WIP implementation was `git stash push`-ed (isolating
it from the tree), the 16-case test file was written against the TRD spec and run against
the **stashed-out** (pre-scaffold) `adopt.cjs`/`adopt-cli.cjs` — i.e. the state left by
37-05 (preflight/begin only, `scaffold` subcommand stubbed as "not implemented yet") — to
confirm a genuine RED, then the test file was committed. Only then was the WIP
implementation restored (`git stash pop`) and run to GREEN. No implementation fixes were
required: all 16 tests passed on the first run against the restored WIP code.

### Interpretation decision

Test 6 ("a third scaffold's marker.scaffold, minus `at`, is stable relative to the
second's") is written comparing the **second run's** marker against the **third run's**
marker — both steady-state no-ops — rather than the first (creating) run against the
second. Comparing the creating run to the first no-op cannot hold: `stack.action` changes
from `'written'` to `'existing'` and `created`/`skipped` necessarily differ between a run
that writes files and one that doesn't. This is recorded as a `decisions` entry above.

None of the four deviation rules (auto-fix bug / auto-add missing functionality / auto-fix
blocking / stop-for-architecture) applied — the implementation needed no changes once
honestly tested.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: scaffold core (STATE/ROADMAP/STACK/config/state/CLAUDE.md/register) | `node --test plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` | 0 | PASS |
| 2: idempotent/resumable scaffold + refusals | `node --test plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` | 0 | PASS |
| Verification: no forced stack init | `rg -n "force: true\|--force" plugins/devflow/devflow/bin/lib/adopt.cjs` | 0 (no matches) | PASS |
| Adjacent regression check | `node --test adopt-preflight.test.cjs migrations/0005-claude-md-block.test.cjs upgrade.test.cjs` | 0 (88/88 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` (against stashed-out, preflight/begin-only `adopt.cjs`) | 1 (16 tests, 0 pass, 16 fail) | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` (WIP implementation restored via `git stash pop`) | 0 (16 tests, 16 pass, 0 fail) | PASS (correct) |
| REFACTOR | none needed — GREEN on first restore | n/a | n/a |

RED failures were the expected kind: `Error: adopt scaffold: not implemented yet` (the
37-05 stub) for CLI-invoking tests, and `TypeError: renderState/renderRoadmap is not a
function` for the two pure-renderer tests — confirming the tests exercise code that did
not yet exist, not a fixture or harness bug.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| New tests | `node --test plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` | 0 | PASS (16/16) |
| Adjacent tests | `node --test adopt-preflight.test.cjs 0005-claude-md-block.test.cjs upgrade.test.cjs` | 0 | PASS (88/88) |
| Full regression gate (baseline-relative, `micro.test.cjs` excluded) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 1 failure, baseline-classified (see below) |

**Full-gate observed totals:** tests 3935, suites 564, pass 3902, fail 1, cancelled 0, skipped 32.

**Failure classification** (against `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`, not edited):

| Failing test | Location | Classification |
|---|---|---|
| `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Pre-existing baseline failure** — exact match, TSV row 16. Not a regression introduced by this TRD. |

No candidate regressions, no environment flakes beyond the one baseline row above.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (all TRD must_haves covered by tests 1-16, all passing)
- Gate failures: 1, and it is the pre-existing `MA-7 doctl auth init` baseline row (TSV #16) — not attributable to this TRD

## Commits

- `5a02c6a` — `test(37-07): adopt scaffold cases (RED)`
- `94df712` — `feat(37-07): df-tools adopt scaffold (STATE, ROADMAP, STACK, CLAUDE.md block, stamp, register)`

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/adopt.cjs` (scaffold implementation) — FOUND, modified
- `plugins/devflow/devflow/bin/lib/adopt-cli.cjs` (scaffold wiring) — FOUND, modified
- Commit `5a02c6a` — FOUND in `git log`
- Commit `94df712` — FOUND in `git log`
