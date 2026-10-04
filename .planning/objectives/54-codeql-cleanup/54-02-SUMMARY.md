---
objective: 54-codeql-cleanup
trd: "02"
subsystem: security
tags: [codeql, js/bad-tag-filter, js/prototype-pollution-utility, js/regex-injection, stack-profile, config-set, handoff]
requires: []
provides:
  - "noteLine neutralises every HTML comment terminator (`-->`, `--->`, `--!>`) in drafted stack notes"
  - "`df-tools config-set` refuses reserved segments (`__proto__`, `constructor`, `prototype`) with exit 1 and an unchanged config.json"
  - "handoff.cjs documents the intended prompt_match regex compile for the alert 95 dismissal in TRD 54-10"
affects: [54-10]
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
    - plugins/devflow/devflow/bin/lib/config.cjs
    - plugins/devflow/devflow/bin/lib/config.test.cjs
    - plugins/devflow/devflow/bin/lib/handoff.cjs
decisions:
  - "Alert 129: neutralise only terminator-shaped sequences with `/(--!?)>/g` -> `$1 >`, not every `--`, so note candidates keep copyable flags such as `--no-pub` (the TRD's flagged design choice)"
  - "Alert 89: explicit refusal (exit 1, names the segment) before config.json is read, plus an own-property walk; not a silent filter and not Object.create(null)"
  - "Alert 95: code comment only; the dismissal on GitHub is TRD 54-10's job"
metrics:
  completed: 2026-10-04
  tasks: 3
  commits: 5 task commits
  files: 5
---

# Objective 54 TRD 02: Single-site CodeQL fixes Summary

Closes CodeQL alerts 129 (`js/bad-tag-filter`) and 89 (`js/prototype-pollution-utility`) at source, and documents the one intended
pattern, alert 95 (`js/regex-injection`), for dismissal in TRD 54-10. Ordinary `config-set` keys and drafted notes carrying
`--flags` behave exactly as before.

## Progress
- [x] Task 1 (RED): failing tests for HTML comment terminators in stack notes — f635ebcd
- [x] Task 1 (GREEN): noteLine neutralises every HTML comment terminator — 6c9efc67
- [x] Task 2 (RED): failing tests for config-set prototype-pollution guard — e56b6a29
- [x] Task 2 (GREEN): config-set refuses __proto__, constructor and prototype segments — dee88bba
- [x] Task 3: document the intended prompt_match regex in handoff.cjs — 84b8a942

## What changed

- **C / alert 129** (`stack-profile.cjs` `noteLine`): `.replace(/-->/g, '-- >')` became `.replace(/(--!?)>/g, '$1 >')`. Worked
  outputs: `-->` -> `-- >`, `--->` -> `--- >`, `--!>` -> `--! >`, `--no-pub` unchanged.
- **E / alert 89** (`config.cjs` `cmdConfigSet`): a `RESERVED_KEY_SEGMENTS` set (`__proto__`, `constructor`, `prototype`) is
  checked against every dot segment right after the usage check, before config.json is read, via `error()` (stderr `Error: ...`,
  exit 1). The walk is now own-property based (`!hasOwn(current, key) || current[key] === null || typeof ... !== 'object'`), which
  also stops a `null` section from crashing the walk. `hasOwn` moved above `cmdConfigSet`. `config-get` is untouched.
- **D / alert 95** (`handoff.cjs`): the one-line comment above `new RegExp(s.prompt_match)` is now a five-line block. Comment lines
  only; `watcher-daemon.cjs:111` was confirmed to compile the same value, so the comment's claim holds.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: noteLine terminators | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs` (plus stack-init.test.cjs) | 0 (113 tests) | PASS |
| 2: config-set guard | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 (30 tests) | PASS |
| 3: handoff comment | `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs`; `git diff --stat` shows comment lines only (5 insertions, 1 deletion, all comments) | 0 (34 tests) | PASS |
| TRD verification | `df-tools --cwd <scratch dir> config-set __proto__.x 1` | 1, stderr `Error: config-set: refusing key segment "__proto__" ...` | PASS |
| TRD verification | `rg -n "replace\(/-->/g" plugins/devflow/devflow/bin/lib/stack-profile.cjs` | prints nothing | PASS |
| All touched files | `node --test` over stack-profile, stack-drafter-e2e, stack-init, config, handoff test files | 0 (177 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern="54-C" plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 1 (C1 fails: terminator at offset 106, closing line at 119) | FAIL (correct) |
| GREEN (Task 1) | `node --test` stack-profile + stack-drafter-e2e + stack-init tests | 0 (113/113) | PASS (correct) |
| RED (Task 2) | `node --test --test-name-pattern="54-E" plugins/devflow/devflow/bin/lib/config.test.cjs` | 1 (E5-E8 fail: status 0, `updated: true`) | FAIL (correct) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 (30/30) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` over the five touched test files | 0 | PASS |
| test (full suite) | `npm test` | not run | not_available here: the dispatch defers the full suite to TRD 54-09 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The TRD's suggested comment tripped the stack-neutrality test**
- **Found during:** Task 1 (GREEN), first run of stack-profile.test.cjs
- **Issue:** The suggested comment named `flutter test --no-pub`. P11 ("the module source names no specific stack") greps
  stack-profile.cjs for stack names and failed.
- **Fix:** The comment now says "a bare CLI flag such as `--no-pub`". The regex change itself is exactly as the TRD specifies.
- **Files modified:** plugins/devflow/devflow/bin/lib/stack-profile.cjs
- **Commit:** 6c9efc67

### TRD inaccuracies (no code impact)

- **Test-list item 3 does not fail on the old code.** The TRD expected items 1 and 3 to be RED. Only item 1 (`--!>`) is: `--->`
  contains `-->` as a substring, so the old `/-->/g` already rendered it as `--- >`. C3 stays in the suite as a regression guard;
  Task 1's RED commit therefore has one failing test (C1) and three passing guards (C2-C4).
- Test IDs in the code are C1-C4 and E5-E10 (the E numbering continues the TRD's list numbering).

## Execution notes

- **Preflight.** The first `exec-context check` ran with the shell's working directory in the main checkout, so it resolved
  `checkout` to `/Users/justin/dev/devflow-claude` and reported SHARED INDEX against 54-01's claim. The dispatch asked for the check
  to run from the worktree. Re-run with the global `--cwd /Users/justin/dev/.df-worktrees/devflow-claude/54-02` it passed: checkout
  was the worktree, branch `df/exec-54-02`, base visible, claim recorded for 54-02. No claim was released and nothing was written
  in the main checkout.
- **Design choice for C (flagged for the user, per the TRD).** OBJECTIVE.md prefers breaking any `--`. This TRD breaks only
  terminator-shaped sequences so copyable flags survive. The alternative, `.replace(/-(?=-)/g, '- ')`, would change test C2 only.
- No stack commands were discovered; the scoped test command came from `.planning/STACK.md`.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 5/5 (C1 and C3 for `-->`, `--->`, `--!>`; C2 for `--no-pub`; E5-E8 for exit 1 naming the segment with
  config.json byte-identical; E9 and E10 for ordinary keys and `prototype_x`; handoff comment present at the compile site)
- Gate failures: None (full `npm test` deferred to TRD 54-09)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-profile.cjs, stack-profile.test.cjs, config.cjs, config.test.cjs, handoff.cjs
- FOUND commits: f635ebcd, 6c9efc67, e56b6a29, dee88bba, 84b8a942 (`git log 8ff8401a..HEAD`)
- `git diff --stat 8ff8401a..HEAD` touches only the five TRD files plus this SUMMARY
