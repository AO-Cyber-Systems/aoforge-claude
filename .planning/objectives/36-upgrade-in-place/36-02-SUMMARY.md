---
objective: 36-upgrade-in-place
trd: "02"
subsystem: upgrade
tags: [upgrade, managed-block, claude-md, notices, primitives]

# Dependency graph
requires: []
provides:
  - "lib/managed-block.cjs — read, render, upsert, isStale, parseStartMarker, compareVersions, ManagedBlockError (+ START_RE, END_RE). Requires nothing."
  - "lib/notices.cjs — projectNoticesPath, globalNoticesPath, readNotices, appendNotice, takeUnconsumed, renderNotices (+ LEVELS). Requires only fs, path, crypto."
affects: [36-04c, 36-05, 36-06, 38]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Byte-exact block replacement: output = text.slice(0, start) + render(...) + text.slice(end); never split/join lines, so CRLF and trailing whitespace outside the block survive"
    - "Malformed input is an exception, not a best guess: two START markers or an unterminated START throw ManagedBlockError, and upsert rethrows so callers never write on that path"
    - "One-shot notice queue: atomic tmp+rename writes, keyed replace of unconsumed notices, mark-consumed-on-take, 7-day prune; unreadable files are never overwritten"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/managed-block.cjs
    - plugins/devflow/devflow/bin/lib/managed-block.test.cjs
    - plugins/devflow/devflow/bin/lib/notices.cjs
    - plugins/devflow/devflow/bin/lib/notices.test.cjs
  modified: []

key-decisions:
  - "Only an END that comes after the START closes it. An END before the START is ignored, and a stray END after the block stays in the untouched trailing text (it is not an error)."
  - "render() requires meta.v; src is optional. Attribute values containing whitespace or '>' throw ManagedBlockError, because they could not be parsed back."
  - "upsert on '' returns block + '\\n' whatever the position. Appending adds only as many newlines as are needed to leave one blank line, so the existing bytes are never rewritten."
  - "isStale(rawText) rethrows ManagedBlockError for malformed text. A missing block is not stale."
  - "appendNotice on a malformed file returns null and leaves the file byte-identical (it does not throw, because hooks must not crash). An invalid notice (bad level, empty source or message) throws a TypeError, because that is a programming error."
  - "takeUnconsumed prunes by the notice's ts, and only among notices that were already consumed before this call. If a file's write fails, that file contributes nothing, so its notices show up later instead of twice."
  - "A keyed replace keeps the entry's position in the array but gets a new id and ts. renderNotices turns newlines in the message into spaces, indents the detail by 2 spaces, JSON-stringifies a detail that is not a string, and renders an empty list as ''."

requirements-completed: [UPG-02]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~10min
completed: 2026-09-27
tokens_input: 2738942
tokens_output: 34137
tokens_cache_read: 2667989
tokens_cache_write: 70883
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 36 TRD 02: Managed-block and notices primitives Summary

**`lib/managed-block.cjs` parses both the legacy unversioned `DEVFLOW:START` marker and the new `v=<ver> src=<template>` marker. It rewrites only the bytes between the markers, which the tests check byte-for-byte including CRLF, and throws `ManagedBlockError` on duplicate or unterminated blocks. `lib/notices.cjs` is an atomic one-shot notice queue with a project file and a global file, keyed de-duplication, mark-consumed-on-take and a 7-day prune. Both modules use Node built-ins only.**

## Performance

- **Started:** 2026-09-27T22:36:54Z (preflight claim)
- **Code complete:** 2026-09-27T22:40Z
- **Tasks:** 2, both TDD (RED then GREEN; no refactor commit needed)
- **Files:** 4 created, 0 modified

## Accomplishments

- **managed-block:**
  - `read` collects every START match. More than one throws `multiple DEVFLOW blocks`. A START with no END after it throws `unterminated DEVFLOW block`.
  - `content` has exactly one `\n` or `\r\n` stripped from each side.
  - `upsert` slices, so the text before and after the block is byte-identical, CRLF included. It is idempotent on the append, replace and prepend paths.
  - `compareVersions` compares dotted versions numerically (`10 > 9`, `1.10 > 1.2`, missing parts count as 0).
  - The module is generic: it has no CLAUDE.md knowledge (objective 38 reuses it).
- **notices:**
  - `globalNoticesPath` has no default home and throws without one.
  - The `id` is `n-<ms>-<hex6>`. Writes go through `<file>.tmp-<pid>-<rand>` and a rename.
  - `takeUnconsumed` merges any number of files in ts order (ties keep file order). It returns each notice exactly once.
  - Missing and malformed files, or a file whose `notices` is not an array, read as `[]` and are never written.
- **Built-ins rule:** `rg -n "require\(" managed-block.cjs notices.cjs` finds only `fs`, `path` and `crypto` (all in notices.cjs). managed-block.cjs requires nothing.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: managed-block.cjs (tests 1-14) | `node --test plugins/devflow/devflow/bin/lib/managed-block.test.cjs` | 0 (18/18) | PASS |
| 2: notices.cjs (tests 15-23) | `node --test plugins/devflow/devflow/bin/lib/notices.test.cjs plugins/devflow/devflow/bin/lib/managed-block.test.cjs` | 0 (28/28) | PASS |
| 2: built-ins rule | `rg -n "require\(" .../managed-block.cjs .../notices.cjs` | 0 (fs, path, crypto only) | PASS |

## TDD Evidence

| Task | Phase | Command | Exit Code | Expected | Commit |
|---|---|---|---|---|---|
| 1 | RED | `node --test .../managed-block.test.cjs` | 1 (`Cannot find module './managed-block.cjs'`) | FAIL (correct) | f00a46d |
| 1 | GREEN | `node --test .../managed-block.test.cjs` | 0 (18 pass) | PASS (correct) | f52914d |
| 2 | RED | `node --test .../notices.test.cjs` | 1 (`Cannot find module './notices.cjs'`) | FAIL (correct) | 56ea0f6 |
| 2 | GREEN | `node --test .../notices.test.cjs .../managed-block.test.cjs` | 0 (28 pass) | PASS (correct) | 0c41891 |

The 28 tests cover all 23 TRD cases plus five extras:
- 2b: CRLF content strips exactly one `\r\n`.
- 5b: render then read round-trips the content and meta.
- 13b: `isStale` accepts raw text, and `null` or no block is not stale.
- 13c: `compareVersions` direct cases.
- 22b: an empty list renders as `''`.

Case 20 also covers append on a malformed file (left untouched) and a `notices` field that is not an array.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD fast verify | `node --test plugins/devflow/devflow/bin/lib/managed-block.test.cjs plugins/devflow/devflow/bin/lib/notices.test.cjs` | 0 (28/28) | PASS |
| Built-ins only | `rg -n "require\(" plugins/devflow/devflow/bin/lib/managed-block.cjs plugins/devflow/devflow/bin/lib/notices.cjs` | 0 (fs/path/crypto) | PASS |
| Wave regression (baseline-relative) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (output in the session scratchpad) | 1 | PASS: 0 regressions |

**Observed totals (for information only):** 3655 tests, 514 suites. 3622 passed, 1 failed, 0 cancelled, 32 skipped. The run took about 46s. That is 28 more tests than 36-01's 3627, which matches the 28 added here.

**How each failure was classified:**

| File:line | Test name | Classification |
|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | **pre-existing** (`baseline-failures.tsv` line 16) |

- Regressions: none.
- Environment flakes: none.
- The other 20 baseline entries passed in this run. This was the main checkout, not a worktree, and 1Password was unlocked.
- The 28 new `managed-block.test.cjs` and `notices.test.cjs` tests are not in the TSV, and all of them pass.
- `bin/lib/micro.test.cjs` was excluded by the `!(micro)` glob.
- `baseline-failures.tsv` was not edited.

## Deviations from Plan

None. The TRD was executed as written. The extra sub-cases (2b, 5b, 13b, 13c, 22b) add to the test list and change no behaviour it specified.

## Issues Encountered

None. All four commits were signed through `df-tools commit` with no 1Password prompt or hang. The `.skill-active` marker was already live, so the edit gate did not fire.

## Next Phase Readiness

- 36-04c (migration 0005) can call `upsert(text, body, {v: template_version, src: 'claude-md'})` and `isStale(text, template_version)`.
- 36-06 (global upgrade) can use the same primitives with `globalNoticesPath(userHome)`.
- 36-05 can call `appendNotice(projectNoticesPath(root), ...)` from the hook, and `takeUnconsumed([project, global])` + `renderNotices` from route-results.js.
- Callers must catch `ManagedBlockError` and skip the write, then report it (for example as a `warn` notice).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (read/legacy parse, byte-exact upsert and idempotence, isStale, malformed throws, atomic keyed append, exactly-once take with prune and malformed tolerance, built-ins only)
- Gate failures: none. The only suite failure is the pre-existing MA-7 handoff-e2e entry.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/managed-block.cjs, managed-block.test.cjs, notices.cjs, notices.test.cjs
- FOUND commits (8c545b7..HEAD): f00a46d, f52914d, 56ea0f6, 0c41891
