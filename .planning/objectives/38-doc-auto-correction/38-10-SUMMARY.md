---
objective: 38-doc-auto-correction
trd: "10"
subsystem: validate
tags: [validate, doc-staleness, cli, health-check]
dependency-graph:
  requires: ["38-02", "38-07", "38-09"]
  provides: ["validate-health-check-14", "validate-docs-command"]
  affects: ["38-11"]
tech-stack:
  added: []
  patterns: ["advisory-only health check", "read-only status-view command"]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/doc-staleness.cjs
    - plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs
decisions:
  - "Check 14 reads .planning/config.json's docs.* overrides locally (not via Check 5's parsed config, which is scoped to its own if-block) so config threshold overrides actually take effect through cmdValidateHealth, per test 3."
  - "Rule 1 auto-fix: doc-staleness.cjs's _checkRemovedRefs dropped the { liveSkills: [] } option entirely rather than passing a Set, since this check never consults the 'unknown' kind that liveSkills produces."
metrics:
  duration: "~1h"
  completed: 2026-09-28
---

# Objective 38 TRD 10: Health Check 14 and `df-tools validate docs` Summary

`validate health` now surfaces doc-staleness advisories (W050-W054) as non-repairable warnings, and a new `df-tools validate docs` gives the default `/devflow:status` view a cheap, read-only doc-staleness report without Check 11's best-effort `git fetch`.

## What Was Built

- **Check 14** in `cmdValidateHealth` (`validate.cjs`), placed after Check 13 and before repairs: calls `doc-staleness.collect({ projectRoot, userHome, config })` (config sourced from `.planning/config.json`'s `docs.*` block, falling back to `doc-staleness.cjs`'s own defaults on missing/malformed JSON) and adds every returned issue as a `warning` with `repairable: false`. Nothing is ever pushed to `repairs`.
- **W054 fallback**: if `collect()` throws, Check 14 adds exactly one `W054 doc-staleness-check-failed: <msg>` warning with fix text `` Run `df-tools validate docs` to see why `` — a check that cannot run is never silent.
- **`cmdValidateDocs(cwd, raw)`** in `validate.cjs`: read-only, no network/git-fetch. Prints JSON `{issues, checked}` (or with `--raw`, one line per issue as `<code> <message>`, `no documentation advisories` when empty). A cwd without `.planning/` returns exactly `{issues: [], checked: {}, note: 'no .planning/'}` and exits 0.
- **CLI wiring**: `df-tools validate docs [--raw]` dispatches to `cmdValidateDocs`; the unknown-subcommand error now lists `consistency, health, docs`.
- **`help.cjs`**: `validate` usage is now `df-tools validate <consistency|health [--repair]|docs> [--raw]`; summary mentions documentation staleness. `mutates: true` left untouched per TRD gotcha.

## W05x Code Table

| Code | Meaning | Repairable |
|---|---|---|
| W050 | Removed-command reference (e.g. `/devflow:update`) found in a live doc | No |
| W051 | STACK.md review date is stale | No |
| W052 | Declared language (STACK.md) vs. detected manifest language mismatch | No |
| W053 | Codebase maps under `.planning/codebase/` are N commits behind threshold | No |
| W054 | `doc-staleness.collect()` threw — the check itself could not run | No |

## TDD Evidence

| Task | Phase | Commit | Command | Result |
|---|---|---|---|---|
| 1 | RED | `f51fd21` | `node --test validate.test.cjs` | 6/7 new tests fail (test 5 trivially passes — no W05x pre-implementation) |
| 1 | GREEN | `b82eff4` | `node --test validate.test.cjs` | 62/62 pass |
| 2 | RED | `c23b520` | `node --test validate.test.cjs` | 4/4 new tests fail (`Unknown validate subcommand`) |
| 2 | GREEN | `202d835` | `node --test validate.test.cjs help.test.cjs help-delegation.test.cjs doc-refs.repo.test.cjs` | 125/125 pass |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Check 14 | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 | PASS (62/62) |
| 1: done criterion | `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` (this repo) | 0 | PASS — no W054 |
| 2: `validate docs` | `node --test validate.test.cjs help.test.cjs help-delegation.test.cjs doc-refs.repo.test.cjs` | 0 | PASS (125/125) |
| 2: done criterion | `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw` (this repo) | 0 | PASS — prints `no documentation advisories` |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| doc-staleness.test.cjs | `node --test doc-staleness.test.cjs` | 0 | PASS (24/24, incl. new regression test 17b) |
| validate.test.cjs | `node --test validate.test.cjs` | 0 | PASS (125/125) |
| help.test.cjs, help-delegation.test.cjs, doc-refs.repo.test.cjs | `node --test <files>` | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 1 (Rule 1 — see Deviations)
- Must-haves verified: 6/6 (Check 14 wiring, W054 fallback, `cmdValidateDocs` contract, help.cjs usage/summary + error list, `--repair` byte-identical on W051+W053 fixture, fix text names only live commands)
- Gate failures: None

## Regression Suite (full run vs. baseline)

`npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/38-10 test` — one full run before final commit:

```
ℹ tests 4096
ℹ suites 603
ℹ pass 4036
ℹ fail 10
```

All 10 failures are pre-existing daemon/timing flakes (`devflow-watch.test.cjs`, `handoff-e2e.test.cjs`) already named verbatim in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv`:

- `foreground daemon writes PID file, status reports running, stop kills it`
- `start refuses when daemon already running`
- `start cleans up stale PID file and starts fresh`
- `C-1 start --project /p1,/p2 writes watching:[/p1, /p2]`
- `write pending → daemon executes → route-results emits result with stdout`
- `disallowed command produces rejected done record + "Do NOT retry" guidance`
- `idempotency: route-results emits once, silence on second invocation`
- `multi-record: 3 queued commands appear in a single injection`
- `LK-1: teardown reaps the daemon — no devflow-watch outlives withDaemon`
- `LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight`

No unlisted failures — nothing required isolated re-run. The TSV was not edited. (Note: baseline lists 21 known-flaky entries; only 10 fired this run — the rest, e.g. `df-tools.test.cjs` commit tests and `project-state.test.cjs` cases, passed this time, which is a strict improvement, not a regression.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `liveSkills.has is not a function` crash in `doc-staleness.cjs` (pre-existing, from already-merged TRD 38-07)**

- **Found during:** Task 1, running this TRD's own done-criterion command (`validate health --raw` on this repo) after Check 14 passed all 62 unit tests.
- **Issue:** `doc-staleness.cjs`'s `_checkRemovedRefs` called `scanText(text, { liveSkills: [] })`, passing a plain array. `doc-refs.cjs`'s `resolveToken` does `if (liveSkills && !liveSkills.has(name))` — arrays have no `.has()`, so this throws for any token that reaches the `liveSkills` branch, i.e. any genuinely live `/devflow:xxx` reference (e.g. this repo's own CLAUDE.md managed block, `/devflow:status`). `doc-staleness.test.cjs`'s fixtures only ever used removed or `/df:`-prefixed tokens, which short-circuit before reaching that branch, so the bug was never exercised until Check 14 wired `collect()` into a real repo's health check.
- **Fix:** Dropped the `liveSkills` option entirely at both `scanText` call sites in `_checkRemovedRefs` (`scanText(block.content)` / `scanText(scanned)`), since this check only ever filters `hit.kind !== 'removed'` and never consults the `'unknown'` kind that `liveSkills` produces. Omitting it is both the documented default and functionally identical here. Added explanatory comments at both sites.
- **Files modified:** `plugins/devflow/devflow/bin/lib/doc-staleness.cjs`
- **Regression test added:** `doc-staleness.test.cjs` test `17b` — a live, valid `/devflow:status` reference alongside a removed `/devflow:reapply-patches` reference: asserts no throw, exactly one W050, and it names only the removed command.
- **Verified:** `doc-staleness.test.cjs` 24/24 pass; `validate health --raw | grep -c W054` on this repo → `0`.
- **Commit:** `b82eff4` (bundled with Task 1's GREEN commit, since Check 14's own done-criterion required it and the fix + regression test are inseparable from making that criterion true).

This was out of TRD 38-10's declared `files_modified` list (`doc-staleness.cjs` is owned by already-merged TRD 38-07), justified under the scope-boundary exception: my Check 14 wiring is what newly exercises this code path end-to-end against a real repo, and Task 1's own explicit done criterion cannot be satisfied without it.

No other deviations.

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/validate.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/validate.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/df-tools.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/help.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/doc-staleness.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` — FOUND
- Commit `f51fd21` — FOUND in git log
- Commit `b82eff4` — FOUND in git log
- Commit `c23b520` — FOUND in git log
- Commit `202d835` — FOUND in git log
