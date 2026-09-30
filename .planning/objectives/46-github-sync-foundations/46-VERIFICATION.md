---
objective: 46-github-sync-foundations
verified: 2026-09-30T00:00:00Z
status: passed
score: 6/6 success criteria, 8/8 requirements, 8/8 original defects gone
---

# Objective 46: GitHub sync foundations - Verification Report

**Goal:** The existing GitHub sync is correct, idempotent and rate-safe, so the authoritative store can be built on it.
**Status:** passed (HEAD 14e3983). Initial verification.

## Test evidence
- Objective test files (gh-*.test.cjs, gh.test.cjs, execute-objective-gh-sync.test.cjs, migrations/0009-gh-mapping-v3.test.cjs): 487 tests, 483 pass, 0 fail, 4 skipped.
- `npm test`: 6187 tests, 6154 pass, 0 fail, 33 skipped. MA-7 did not fail in this run, so the baseline failure was not reproduced. There are no regressions and no load flakes.

## Original defects (docs/PROPOSAL-github-system-of-record.md)
| # | Defect | Status | Evidence |
|---|--------|--------|----------|
| 1 | Two mapping shapes | gone | `lib/gh-mapping.cjs` owns v3 (`readMappingV3` converts lazily). The 0009 probe on the real v2 file produced a single v3 shape. |
| 2 | Three mapping keys | gone | gh-mapping.cjs, `id`-keyed and discovered from dir names. gh-e2e.test.cjs covers push then pull. |
| 3 | Sync step passed a number and hid failures | gone | `workflows/execute-objective.md:1005-1010` runs `gh sync "${OBJECTIVE_DIR}"`, captures stderr, and prints a retry line on failure. There is no `2>/dev/null`. execute-objective-gh-sync.test.cjs passes. |
| 4 | No `github_issue` write-back | gone | gh-issue.cjs reads and verifies `github_issue` (lines 284, 425-438). The write-back is covered by gh-sync/gh-commands tests. |
| 5 | Milestone from first `vX.Y` | gone | `lib/gh-milestone.cjs` resolves from OBJECTIVE.md `milestone:`, caches by title, and never applies a default. |
| 6 | Two body builders | gone | `lib/gh-body.cjs` has managed sections and a `devflow:id` marker. gh-body tests pass. |
| 7 | Fixture read at runtime | gone | `gh.cjs:1048` `PRODUCT_ROADMAP_FIELDS` is a frozen deprecated stub. `gh-project.cjs` discovers via GraphQL with a cache. |
| 8 | No retry, pagination or enabled gate | gone | `gh-client.cjs`: `MIN_WRITE_INTERVAL_MS=1000`, retry-after parsing, `--paginate --slurp`, and an enabled gate that makes zero gh calls. `gh.cjs` exits 1 on `ok:false`. |

## Success criteria
1. Push then pull resolve the same issue: gh-e2e.test.cjs, which passes.
2. Deleting the mapping creates no duplicates: marker-search fallback, covered in gh-issue, gh-e2e and gh-sync tests, which pass.
3. A human edit survives two syncs: gh-body and gh-sync tests, which pass.
4. A 403 secondary limit is retried after `retry-after`, with paced serial writes: gh-client.test.cjs, which passes.
5. The execute-objective sync step reports failure: execute-objective-gh-sync.test.cjs, which passes.
6. `npm test` is green (0 failures).

## Requirements
GSF-01 to GSF-08 are all satisfied by the code and tests above. GSF-02 and GSF-06 are in gh-body.cjs and gh-issue.cjs. GSF-07 is in gh-project.cjs. GSF-08 is in gh-client.cjs and the gh.cjs exit paths.

## Alias and migration
- `gh sync-objectives` is a deprecated alias of `gh sync --all` (`gh.cjs:654-659`, dispatch at `df-tools.cjs:1071`). It prints one stderr deprecation line.
- Migration 0009 was run on a temp copy of the real v2 `.planning/.gh-mapping.json`. The result was `version:3`, with objective 0 (issue 20, comment 4374249280) preserved and `milestones`/`trds` added. It was idempotent: detect returned `applies:false` and the second apply changed nothing. The real file is unchanged (git clean).

## Hermeticity
gh-e2e.test.cjs points HOME and DEVFLOW_GH_CACHE_DIR at temp dirs. The tests mock gh through `_setRunGh` and fakes. gh-seam.repo.test.cjs guards the seam. The 0009 probe was run on a temp copy and was not checked for real ~/.claude writes.

## Scope
No outbox, wiki, issue-type, sub-issue, setup or lifecycle modules exist in bin/lib. There is no `gh setup` subcommand. Nothing from objectives 47+ was built.

## Gaps
None.

## Human verification
None required.
