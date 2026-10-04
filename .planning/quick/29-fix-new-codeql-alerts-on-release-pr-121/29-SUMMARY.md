---
objective: quick-29
trd: 01
subsystem: security-hygiene
tags: [codeql, redos, regex-injection, incomplete-sanitization, stack-profile, gh-wiki]
requires: []
provides:
  - "CodeQL alerts 138-145 on release PR #121 fixed at the source (no suppressions)"
affects: [stack-classify, stack-evidence, gh-wiki, migration-0011, planning-verbs-cli]
tech-stack:
  added: []
  patterns:
    - "loop instead of a (?:...)+$ regex for a trailing-token strip"
    - "single-reading option alternatives in a composed regex"
    - "rename a method whose name collides with String.prototype.match rather than escape its argument"
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
    - CHANGELOG.md
decisions:
  - "One commit per task, with the tests inside the fix commit (no separate RED commits), so the branch is never red at a commit"
metrics:
  completed: 2026-10-04
---

# Quick 29: fix the 8 new CodeQL alerts on release PR #121 Summary

Linear-time `GIT_DIFF` option parsing and a loop-based `stripTrailingConnective` (js/redos, 138-139), backslash-before-pipe escaping in the 0011 and `planning import` stay-local cells (143-144), the gh-wiki rule method renamed `match` to `toPage` (js/regex-injection, 145), and three regex-free test assertions (140-142).

## Progress
- [x] Task 1: Remove the exponential backtracking in GIT_DIFF and TRAILING_CONNECTIVE (alerts 138, 139) — 1099ba85
- [x] Task 2: Rename the gh-wiki rule method and escape backslash in table cells (alerts 143, 144, 145) — 70a22d24
- [x] Task 3: Replace regex-built test assertions with substring checks, CHANGELOG bullet, full suite (alerts 140, 141, 142) — 43367482

## What changed

| Alert | Fix |
|---|---|
| 138 | `GIT_DIFF`: second alternative split into `--long-option` and `-(?![Cc]\s)short-option`, so a single-dash `-C`/`-c` followed by whitespace has exactly one reading. 50000-rep adversarial input now finishes in about 1 ms (the old pattern took 16 s at 28 reps). |
| 139 | `TRAILING_CONNECTIVE` regex replaced by `stripTrailingConnective` (exported). Output matches the old regex for all 16 characterization rows. |
| 143, 144 | `cell()` / `tableCell()` escape `\` before `|`. `stayLocalTable` exported from `planning-verbs-cli.cjs` for the test. |
| 145 | Every PAGE_TABLE rule (9 `match(rel)` rules, `fixedRule`, `objectiveDocRule`) now exposes `toPage`; `pageForCachePath` calls `rule.toPage(r)`. `objectiveDocRule` also escapes `kind` through a local `escapeRegExp`. Forward and inverse mappings unchanged. |
| 140, 141, 142 | `new RegExp(<string>.replace(/[.]/g, ...))` assertions replaced with `.includes`. |

CHANGELOG: one bullet at the end of `## [2.13.0]` `### Fixed` naming all eight alerts and their rule ids. `## [Unreleased]` untouched.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: GIT_DIFF + trailing connective | `node --test stack-classify.test.cjs stack-evidence.test.cjs` (393 tests); `rg TRAILING_CONNECTIVE stack-evidence.cjs` returns nothing | 0 | PASS |
| 2: gh-wiki rename + cell escaping | `node --test gh-wiki.test.cjs migrations/0011-github-store-backfill.test.cjs planning-verbs-cli.test.cjs` (102 tests); `rg "rule\.match\|^\s+match\(rel" gh-wiki.cjs` returns nothing | 0 | PASS |
| 3: test assertions + CHANGELOG | `node --test frontmatter.test.cjs gh-setup.test.cjs` (136 tests); `df-tools changelog check 2.13.0` | 0 | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern="K27e\|K27f\|E26" ...` | K27e failed at 16485 ms; E26a-c "stripTrailingConnective is not a function" | FAIL (correct) |
| GREEN (Task 1) | `node --test stack-classify.test.cjs stack-evidence.test.cjs` | 393 pass, 0 fail; N raised to 50000 | PASS (correct) |
| RED (Task 2) | `node --test --test-name-pattern="quick-29\|PAGE_TABLE" ...` | PAGE_TABLE toPage assertion, 8a (planText) and 8b (stayLocalTable not a function) failed | FAIL (correct) |
| GREEN (Task 2) | `node --test gh-wiki.test.cjs 0011...test.cjs planning-verbs-cli.test.cjs` | 102 pass, 0 fail | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS with the one known failure: 9028 tests, 8995 pass, 1 fail (MA-7 handoff-e2e), 32 skipped |

## Deviations from Plan

None - TRD executed as written, with these notes:
- The K27f guard cases are wrapped in a full drift shape (`out=<capture>; [ -n "$out" ] || exit 1`), because `driftCheckAt` only reports a capture that is tested and followed by a failing exit. Asserting on bare captures would have returned -1 for every case.
- The timing tests ran RED at the small N from the plan. The old code was slower than the plan's estimate (16 s at N=28, not 5 s); the verdict was the same.
- Test commits were not split from their fix commits: three commits total, as the success criteria ask.
- `29-JOB.md` was untracked when the run started; it is committed with this SUMMARY.
- STATE.md and ROADMAP.md were not touched (quick task; the orchestrator owns them).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8
- Gate failures: MA-7 handoff-e2e only (known, accepted)

## Self-Check: PASSED

All modified files present; commits 1099ba85, 70a22d24, 43367482 found in history; the unrelated untracked files (`.gitkeep` files, `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`, `plugins/devflow/devflow/references/codex-agent-policy.md`) were not touched.
