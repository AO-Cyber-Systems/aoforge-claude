---
objective: 38-doc-auto-correction
trd: "07"
subsystem: testing
tags: [doc-staleness, stack-profile, codebase-map, doc-refs, tdd, node-test]

# Dependency graph
requires: ["38-01"]
provides:
  - "lib/doc-staleness.cjs: collect({projectRoot, userHome, now, config}), DEFAULTS, _setRunGit/_resetRunGit"
affects: [38-10, 38-11, 38-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Git seam via a module-level `runGit` function swapped by `_setRunGit`/`_resetRunGit` (the `_setRunFs` pattern from project-hygiene.cjs), so W053's git calls are mockable without touching a real repo."
    - "Each of the four checks (`_checkRemovedRefs`, `_checkStackReview`, `_checkStackDrift`, `_checkCodebaseMap`) is independent, catches its own dependency's typed error, and reduces to one `checked.<x>` status string plus zero-or-more pushed issues — `collect()` itself is a thin composition with no branching logic of its own."
    - "Session Log exclusion reuses migration 0002's exact `SESSION_LOG_RE`, then rescans from any LATER `## ` heading so a post-log section is never silently skipped."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doc-staleness.cjs
    - plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs

key-decisions:
  - "Combined all three tasks (W051+W052, W053, W050) into one RED commit and one GREEN commit rather than three RED/GREEN pairs (see Deviations) — the four checks share one `collect()` skeleton and were designed together from the full 18-case test list before any implementation existed."
  - "W050 message format reconstructs `/devflow:${token}` (canonical prefix) regardless of whether the source used `/devflow:` or `/df:`, since `doc-refs.scanText`'s `token` field is prefix-stripped and every reported case here is a `removed` command with no prefix-specific replacement anyway."
  - "A malformed CLAUDE.md managed block (`ManagedBlockError`) is tracked separately from STATE.md-sourced issues; `checked.removed_refs` only reports `skipped:malformed-block` when there are zero issues from either source, so a genuine STATE.md finding is never silently dropped by an unrelated CLAUDE.md parse failure."

requirements-completed: ["DOC-06"]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~20min
completed: 2026-09-28
tokens_input: 9665285
tokens_output: 91472
tokens_cache_read: 9440821
tokens_cache_write: 224272
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 38 TRD 07: `lib/doc-staleness.cjs` — the four advisories Summary

**One read-only, synchronous `collect()` computing W050 (removed-command refs), W051 (STACK.md review age), W052 (declared-vs-detected language drift), and W053 (codebase-map commits-behind) — all four advisory-only, nothing repaired.**

## Performance

- **Duration:** ~20 min (RED `6b00c89` at 08:41:29 -0400 to this SUMMARY at ~08:48 -0400)
- **Started:** 2026-09-28T08:41:29-04:00
- **Completed:** 2026-09-28T08:48:00-04:00 (approx)
- **Tasks:** 3/3 (combined into one RED + one GREEN commit — see Deviations)
- **Files modified:** 2 (both created)

## Accomplishments
- `lib/doc-staleness.cjs`: `collect()`, `DEFAULTS = {stack_review_stale_days: 90, codebase_map_stale_commits: 50}`, `_setRunGit`/`_resetRunGit` — the one module every surface (health, `validate docs`, telemetry, status) will call for documentation-staleness signals.
- W050 wired to `doc-refs.scanText` (CLAUDE.md's DEVFLOW block via `managed-block.read`, and `.planning/STATE.md` outside `## Session Log`); W051/W052 wired to `stack-profile.parseProfile` + `project-state.detectManifest`; W053 wired to a mockable git seam using `execFileSync` + the `:(exclude).planning` pathspec.
- 23 new tests in `doc-staleness.test.cjs` covering all 18 test-list items (several split into sub-cases: 3a/3b, 13a/13b, 15a/15b, 16a/16b) plus a `DEFAULTS` shape sanity check — all passing, no regressions in `doc-refs.test.cjs`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: STACK.md review age + drift (tests 1-9) | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` | 0 | PASS (23/23, includes 1-9) |
| 2: Codebase-map age (tests 10-14) | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` | 0 | PASS (23/23, includes 10-14) |
| 3: Removed-command refs (tests 15-18) | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` | 0 | PASS (41/41: 23 doc-staleness + 18 doc-refs) |

## Task Commits

Each task was designed together and committed as one RED/GREEN pair (see Deviations):

1. **RED (Tasks 1+2+3 test list, items 1-18)** - `6b00c89` (test) — `doc-staleness.test.cjs` created, all 23 cases (18 test-list items, 4 split sub-cases, 1 `DEFAULTS` sanity check).
2. **GREEN (Tasks 1+2+3 implementation)** - `f4b06c0` (feat) — `doc-staleness.cjs` created implementing `collect`, `DEFAULTS`, all four `_check*` functions, and the `_runGit` seam.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| doc-staleness + doc-refs unit tests | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` | 0 | PASS (41/41) |
| read-only guard | `rg -n "writeFileSync\|unlinkSync\|renameSync" plugins/devflow/devflow/bin/lib/doc-staleness.cjs` | 1 (no match, expected) | PASS |
| stale-literal guard (38-09's CI gate) | `rg -n "/df:health\|/devflow:update\|/devflow:reapply-patches" plugins/devflow/devflow/bin/lib/doc-staleness.cjs` | 1 (no match, expected) | PASS |
| full regression suite | `npm --prefix <worktree> test` | 1 (known-flaky + 1 pre-existing unrelated, see Regression Gate) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` (before doc-staleness.cjs existed) | 1 | FAIL (correct — `MODULE_NOT_FOUND`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.test.cjs` | 0 | PASS (correct — 41/41) |
| REFACTOR | n/a | — | No refactor pass needed; GREEN implementation shipped as written, all 23 new tests passed on first run. |

## Regression Gate (baseline-relative)

- Full suite: `npm --prefix <worktree> test` (`node --test 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`)
- **Total tests:** 4074 · **Pass:** 4013 · **Fail:** 11 · **Skipped:** 50 (approx, per runner summary) · **Cancelled:** 0
- **10 of the 11 failures are known-flaky rows already in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv`** (daemon/PID/SIGTERM timing):
  - `devflow-watch.test.cjs`: `:145` (foreground daemon...), `:177` (start refuses...), `:353` (C-2...), `:380` (C-1...)
  - `handoff-e2e.test.cjs`: `:254`, `:271`, `:285`, `:298`, `:327` (LK-1), `:344` (LK-2)
- **1 new failure not in the baseline TSV:** `roadmap-reconcile.test.cjs` — "E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift" (`4 !== 0`, four TRD checkbox mismatches for 38-02/38-03/38-04 in `.planning/ROADMAP.md`). Re-ran in isolation (`node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`) — fails identically alone, not flaky.
  - **Not a regression from this TRD.** `git show --stat` on both of this TRD's commits (`6b00c89`, `f4b06c0`) shows they touch only `doc-staleness.test.cjs` and `doc-staleness.cjs` — neither commit touches `.planning/ROADMAP.md` or any TRD/SUMMARY file this self-test reads. This wave's parallel TRDs (38-08, 38-09, and this one) are all explicitly forbidden from editing `.planning/ROADMAP.md`/`STATE.md`, so the checkbox-vs-SUMMARY drift this test detects (38-02/38-03/38-04 already have SUMMARY.md files on disk but their ROADMAP.md rows are still unchecked) predates and is independent of this TRD's work — inherited from `WAVE_BASE` (`cb1d123`). Documented here rather than fixed, per the hard constraint against editing ROADMAP.md; the eventual ROADMAP-reconciliation pass (outside this TRD's scope) will clear it.
  - **9 baseline rows did not reproduce this run** (passed): `devflow-watch.test.cjs:191`, `df-tools.test.cjs:1472/1494/1505/1527`, `project-state.test.cjs:251/320/367/438`, `verify-commits.test.js:205` — consistent with their baseline classification as timing/environment-flaky, not a concern (fewer failures than baseline, not more).
- `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 truths, 1/1 artifact, 1/1 wiring note — confirmed against source:
  - `collect({projectRoot, userHome=null, now=new Date(), config})` read-only/synchronous, returns `{issues:[{code,message,fix}], checked:{removed_refs,stack_review,stack_drift,codebase_map}}`, each `checked` value `'ok'|'stale'|'skipped:<why>'`, `config` defaults `{}` (test 18, `DEFAULTS` sanity test).
  - W050: one issue per (file, removed token), CLAUDE.md DEVFLOW block + STATE.md outside `## Session Log` only, renamed/prefix tokens NOT reported (tests 15a/15b/16a/16b/17).
  - W051: missing/unparseable/stale `provenance.reviewed` vs configurable threshold (default 90d), no-STACK.md -> `skipped:no-stack` (tests 1-5).
  - W052: declared `languages` vs `detectManifest().primary_lang`, alias-aware, undeclared -> `skipped:no-declared-languages` (tests 6-9).
  - W053: `.planning/codebase/*.md` + git `rev-list --count sha..HEAD -- . ':(exclude).planning'` vs configurable threshold (default 50), git/no-repo/uncommitted failures -> `skipped:<why>`, never thrown (tests 10-14).
  - No issue ever `repairable: true`; module exports no write path (test 18, `rg` read-only guard).
- **Gate failures:** None caused by this TRD's diff (see Regression Gate for the one pre-existing, unrelated failure).

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/doc-staleness.cjs` - `collect`, `DEFAULTS`, `_setRunGit`/`_resetRunGit`, four `_check*` functions, `_parseDateUTC`/`_daysBetween`/`_readConfig`/`_aliasMatches`/`_excludeSessionLog`/`_looksLikeNotAGitRepo` helpers
- `plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` - 23 tests (18 test-list items, 4 split sub-cases, 1 `DEFAULTS` sanity check), fixtures from `__fixtures__/stack-profile-fixtures.cjs` (W051/W052) and `__fixtures__/adopt-fixtures.cjs` (W053 real-git-history cases)

## Decisions Made
See `key-decisions` in frontmatter (commit granularity, W050 message-prefix reconstruction, malformed-block/STATE.md issue independence).

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; all 23 tests passed on the first implementation attempt.

### Process deviation (commit granularity)

**All three tasks were implemented and committed together** (one RED commit `6b00c89`, one GREEN commit `f4b06c0`) rather than as six separate commits (RED1/GREEN1/RED2/GREEN2/RED3/GREEN3). The full 18-item test list was written as a single reviewable artifact before any implementation existed (per the TRD's own `test_list_first=required` resolved intent), and the four checks share one `collect()` composition point, so splitting either phase further would have meant committing partial test files that fail to `require` for the same underlying reason (the module doesn't exist yet) rather than a meaningfully different RED state per task. Each task's own verify command and done-criterion (see Task Evidence) is independently satisfied by the combined result. This mirrors the identical, precedented deviation documented in `38-01-SUMMARY.md`.

### Pre-existing failure documented, not fixed

The `roadmap-reconcile.test.cjs` "E2E1: SELF-TEST" failure (see Regression Gate) is real, reproducible in isolation, and NOT caused by this TRD's diff — but fixing it would require editing `.planning/ROADMAP.md`, which is explicitly out of scope for this TRD (parallel-wave hard constraint). Documented rather than fixed.

---

**Total deviations:** 0 auto-fixed; 1 process deviation (commit granularity, no content impact); 1 pre-existing unrelated failure documented (not fixed, out of scope).
**Impact on plan:** None on correctness or scope — all 18 test-list items plus the `DEFAULTS` sanity check pass; regression gate shows zero failures attributable to this TRD's diff.

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/doc-staleness.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs` — FOUND
- Commit `6b00c89` — FOUND in `git log`
- Commit `f4b06c0` — FOUND in `git log`
