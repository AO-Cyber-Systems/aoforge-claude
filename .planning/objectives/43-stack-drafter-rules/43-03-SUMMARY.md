---
objective: 43-stack-drafter-rules
trd: "03"
job: 43-03
subsystem: df-tools
tags: [frontmatter, verify, stack-mcp, commit-gate, gap-closure]
requires: []
provides:
  - "parseMustHavesBlock reads must_haves at its real child indent (2/4 and legacy 4/6), plus inline arrays, single quotes and inner quotes"
  - "verify key-links lists string key_links as 'not machine-checkable' with a separate `unchecked` count"
  - "buildServers keeps the earlier server on a name conflict when its --disable set is a strict subset of the later one's"
  - "cmdCommit probes every requested path (and the .planning dir) with ignoredPaths; new `skipped_ignored` result key"
affects: ["43-06"]
tech-stack:
  added: []
  patterns:
    - "block parser indents derived from the must_haves child level instead of hardcoded"
    - "stack-neutral conflict rule decided by the args' --disable sets, never by a stack name"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/devflow/bin/lib/verify.cjs
    - plugins/devflow/devflow/bin/lib/stack-mcp.cjs
    - plugins/devflow/devflow/bin/lib/stack-mcp.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs
decisions:
  - "D7 outcome: CODE FIX, not test-only. The residual reproduced on this branch (4 of 6 new tests red with commit_failed), so misc.cjs changed."
  - "key_links strings never fail a plan: all_verified and total count checkable links only; strings are reported in `unchecked`."
  - "The whole-dir `.planning` question moved from helpers.isGitIgnored (index-only) to ignoredPaths (index and HEAD), because a staged removal empties the index and made a `.planning/` rule read as wholly ignored."
  - "helpers.isGitIgnored stays exported; stack-init.test.cjs still uses it. Only cmdCommit stopped calling it."
metrics:
  duration: "~2h (two sessions; first stopped at the turn limit before the D7 GREEN change)"
  completed: 2026-10-03
  tasks: 3
  files: 7
---

# Objective 43 TRD 03: must_haves parsing (D11), mixed Flutter/Dart MCP (D9), commit ignore probe (D7) Summary

Three small defects, each fixed with regression tests written first:
- `verify artifacts` now finds `must_haves.artifacts` in every real TRD, because the parser follows the file's own indent.
- `stack mcp` keeps the Flutter tools enabled when a pure-Dart component is listed after a Flutter one.
- `df-tools commit --files` no longer fails as `commit_failed` when a path is gitignored and untracked. It reports the path under `skipped_ignored` and commits the rest.

**D7 outcome: code fix.** The TRD said to verify the residual first and make Task 3 test-only if it did not reproduce. It reproduced. Run against the unmodified `misc.cjs`, tests 12, 13, 15 and 15b failed with `commit_failed: pathspec 'build/out.txt' did not match any file(s) known to git`. Test 14b, added during verification, failed too (details below).

## What changed

- **frontmatter.cjs `parseMustHavesBlock`**
  - Finds `must_haves:` at column 0, takes the indent `C` of its first child line, and searches for the block header at `C`, only inside `must_haves`. Items sit at the first `- ` indent (`C+2`). The block ends at the first non-blank line with indent <= `C`.
  - With no column-0 `must_haves:` (a fixture that indents it), it falls back to the old 4-space search, so the legacy layout is unchanged.
  - Values: one surrounding quote pair is stripped (double or single), `\"` is unescaped, and inline arrays (`[a, "b, c"]`) become arrays. The number coercion is kept.
- **verify.cjs `cmdVerifyKeyLinks`**
  - A string key_link is pushed as `{ link, verified: false, status: 'not machine-checkable', detail }` instead of `continue`.
  - `total`, `verified` and `all_verified` are computed over checkable links only. A new `unchecked` count carries the rest.
- **stack-mcp.cjs `buildServers`**
  - New `disabledSet(args)` (values after `--disable`, also `--disable=x`) and `isStrictSubset`.
  - On a name conflict, if the earlier entry's set is a strict subset of the incoming one's, the earlier entry is kept. Equal or incomparable sets fall through to "later wins". No stack names appear in code.
- **misc.cjs `cmdCommit`**
  - `ignoredPaths` now runs over every requested path. Ignored planning paths go to `skipped_planning` and the rest to `skipped_ignored`. Both are dropped from `filesToStage`, with `dropReason = 'skipped_gitignored'`.
  - The whole-dir leg is `ignoredPaths(cwd, ['.planning']).has('.planning')`, so the whole-dir drop is preserved. `skipped_ignored` appears in the result only when non-empty. The all-dropped result is still the bare `{ committed, hash, reason }`.
  - `commit_docs: false` still skips planning paths with `skipped_commit_docs_false`. If an ignored code path is also left over, the first reason is kept.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline-array and single-quoted must_haves values parsed as raw text**
- **Found during:** Task 1, after the layout fix, by scanning all 353 TRD/JOB files in `.planning/objectives`.
- **Issue:** The layout fix makes `verify artifacts` read TRDs it never read before. 76 real artifacts use `exports: ["a", "b"]`, which parsed as one literal string and produced a false `Missing export: ["a", "b"]`. 7 use `contains: 'subagent_type="x"'`, which kept its quotes and produced a false `Missing pattern`. Fixing the layout alone would have turned "found nothing" into "found false failures".
- **Fix:** Parse inline arrays (comma split outside quotes) and strip one pair of single quotes (`''` unescaped). Tests #8 and #8b were committed red first; #8b reproduced the false `Missing export` through the CLI.
- **Files modified:** frontmatter.cjs, frontmatter.test.cjs
- **Commits:** 8477cacc (RED), 73dd9df2 (GREEN)

**2. [Rule 1 - Bug] Whole-dir `.planning` probe is index-only (D7)**
- **Found during:** Task 3, reading `isGitIgnored` while deciding what to change.
- **Issue:** `helpers.isGitIgnored` runs `git check-ignore` without HEAD awareness. With a `.planning/` rule and the only tracked planning file staged for removal (`git rm --cached`), the index holds nothing under `.planning`, so the dir reads as wholly ignored and the removal is dropped into `skipped_planning` instead of being committed. Test 14b reproduces it on unmodified code.
- **Fix:** The TRD already asked for the swap to `ignoredPaths(cwd, ['.planning'])`. 14b gives it evidence. The result is the same for the whole-dir drop (test 3), the tracked-child case (14) and the U-1 block (5-6).
- **Files modified:** misc.cjs, misc-commit.test.cjs
- **Commits:** dade6878 (RED), c22c2a31 (GREEN)

### Scope decisions

- **`all_verified` carve-out** (the TRD asked me to check it): strings do not count toward `total` or `all_verified`. A TRD whose key_links are all strings reports `all_verified: true, total: 0, unchecked: N`. That is vacuous by design, so a caller that wants to distinguish it should read `unchecked`.
- **Not touched:** `verify artifacts` still silently skips string artifact items (42 of them across older TRDs, e.g. `"path — description"`). It is outside this TRD and noted here for follow-up.

## Process note

The first preflight was run from the main checkout instead of the worktree, which recorded a 43-03 claim on the main checkout. I re-ran it from the worktree (passed), then released only the stray `43-03` claim with `exec-context release --repo <main> --id 43-03`. No other executor's claim was touched.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: must_haves parser + string key_links (D11) | `node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` (50 tests) | 0 | PASS |
| 1: CLI check | `df-tools verify artifacts .planning/objectives/42-codebase-aware-stack-drafter/42-12-TRD.md` (3 of 3 artifacts, all_passed) | 0 | PASS |
| 1: this TRD | `df-tools verify artifacts .planning/objectives/43-stack-drafter-rules/43-03-TRD.md --raw` prints `valid` | 0 | PASS |
| 2: mixed Flutter/Dart MCP (D9) | `node --test stack-mcp.test.cjs stack-agent-mcp-contract.test.cjs` (38 tests) | 0 | PASS |
| 3: commit ignore probe (D7) | `node --test misc-commit.test.cjs misc-commit-gate.test.cjs commit-failure.test.cjs` (58 tests) | 0 | PASS |

## TDD Evidence

RED was committed separately from GREEN for every task. Counts are from the run against unmodified source.

| Task | RED result (unmodified code) | GREEN result |
|---|---|---|
| D11 tests 1-7 | 7 of 8 red (the legacy-layout guard #4 passed, as intended) | 8 of 8 pass |
| D11 tests 8, 8b (deviation 1) | 2 of 2 red | pass |
| D9 tests 8, 9, strict-subset, `--disable=` | 4 of 7 red; guards 10, 11 and pure-dart-only passed, as intended | 7 of 7 pass |
| D7 tests 12, 13, 14b, 15, 15b | 5 of 7 red (`commit_failed` for 12, 13, 15, 15b; 14b dropped the removal); guards 13b and 14 passed, as intended | 7 of 7 pass |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (TRD gate) | `node --test frontmatter.test.cjs stack-mcp.test.cjs misc-commit.test.cjs misc-commit-gate.test.cjs commit-failure.test.cjs stack-agent-mcp-contract.test.cjs` (146 tests) | 0 | PASS |
| test (touched modules) | `node --test stack-cli.test.cjs validate.test.cjs misc-requirements.test.cjs` (112 tests) | 0 | PASS |
| test (CLI) | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` (153 tests) | 0 | PASS |
| lint / build | none declared in the TRD or the stack profile | n/a | not_available |

The full `npm test` was not run, per the dispatch (43-06 owns it).

## Discovered commands

None. The `general` stack profile supplied `node --test {files}`.

## Follow-ups for other TRDs

- `plugins/devflow/agents/verifier.md` (~line 321) and `workflows/verify-objective.md` (~line 143) document the key-links payload as `{ all_verified, verified, total, links: [{from, to, via, verified, detail}] }`. The shape is additive, but it now also carries `unchecked` and string-link entries `{ link, status, verified, detail }`. These files are outside 43-03's list, so I left them for 43-06.
- New result key `skipped_ignored` on `df-tools commit`. Any docs that list the commit result keys should mention it (`skipped_planning` is documented the same way).

## Post-TRD Verification

- Auto-fix cycles used: 2 (the two Rule 1 deviations above, each red-then-green)
- Must-haves verified: 5/5
  - `verify artifacts` finds 2/4-layout artifacts and still parses the legacy layout (tests 1, 3, 4).
  - All 15 of objective 42's TRDs return a non-empty artifact list (test 2; the file count is asserted >= 15).
  - String key_links are reported `not machine-checkable` (6a, 6b).
  - Flutter tools stay enabled in every component order (8, 9).
  - An ignored non-planning path reports `skipped_ignored` and commits the rest. Tracked files and staged removals under ignored dirs still commit (12, 13, 13b, 14, 14b, 15, 15b).
- Gate failures: None

## Self-Check: PASSED

- FOUND (7 of 7): frontmatter.cjs, frontmatter.test.cjs, verify.cjs, stack-mcp.cjs, stack-mcp.test.cjs, misc.cjs, misc-commit.test.cjs.
- FOUND (8 of 8 on `76d816aa..HEAD`): ab039dec, 9f93abde, 8477cacc, 73dd9df2, d1350a41, bf14ff00, dade6878, c22c2a31.
