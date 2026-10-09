---
objective: 38-doc-auto-correction
trd: "09"
subsystem: testing
tags: [doc-refs, ci-gate, deprecation-map, node-test, tdd]

# Dependency graph
requires:
  - objective: 38-doc-auto-correction (38-01)
    provides: "doc-refs.cjs resolver (resolveToken/scanText/rewriteText/liveSkillNames/walkFiles)"
  - objective: 38-doc-auto-correction (38-02..38-06)
    provides: "a live-text tree already clean of stale /devflow:/df: references"
provides:
  - "plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs — the CI gate: npm test fails on any stale/unknown command reference in live DevFlow-owned text"
  - "the EXEMPT table (5 entries) with reason >= 20 chars and >= 1 matched path each, self-checked"
  - "help.md's fenced rename table asserted deep-equal to DEPRECATION_MAP"
affects: ["38-10", "38-11", "38-12"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EXEMPT: {pattern, reason} array, self-validated (reason length + walkFiles match) rather than trusted blindly"
    - "Legacy-workflow exemption computed from frontmatter status: legacy at test time, not hard-coded as a path"
    - "Manual mutation-check evidence captured by editing-running-reverting the target file, never committing the mutation"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs
  modified: []

key-decisions:
  - "No live stale references remained after 38-02..38-06 — the main gate (test 2) passed on first write with zero findings. No text was fixed and EXEMPT was not widened beyond the five must_haves entries."
  - "EXEMPT is exactly the five entries named in the TRD's must_haves (test.cjs, test.js, __fixtures__/**, skill-route.cjs, doc-refs.cjs). No sixth entry was added for the roadmap-reconcile npm-test failure below — that failure is orthogonal to doc-refs and is not fixed by widening EXEMPT."
  - "The legacy-workflow exemption is NOT a sixth EXEMPT array entry — it's computed from workflow frontmatter (status: legacy) at test time, per the must_haves' explicit 'computed from frontmatter, not hard-coded' requirement."

requirements-completed: [DOC-02]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 9min
completed: 2026-09-28
tokens_input: 7123709
tokens_output: 55578
tokens_cache_read: 7005518
tokens_cache_write: 118061
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 38 TRD 09: The CI gate — no stale command reference ships Summary

**`doc-refs.repo.test.cjs` (10 tests) fails `npm test` on any stale or unknown `/devflow:`/`/df:` reference in live DevFlow text, with a self-validated 5-entry EXEMPT list and a frontmatter-derived legacy-workflow carve-out; help.md's fenced rename table is asserted equal to `DEPRECATION_MAP`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-28T12:38:36Z
- **Completed:** 2026-09-28T12:47:40Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Wrote all 10 tests from the TRD's test list in `doc-refs.repo.test.cjs`, split across two commits matching the TRD's task boundary (controls first, then the gate).
- Confirmed the main gate (test 2) passes with **zero findings** on the tree left by 38-01..38-06 — no live stale references needed fixing, so no deviation was required.
- Manually mutation-tested tests 2, 4, 5 and 8 by editing the target file, observing the expected failure, and reverting with zero git diff before continuing (evidence below).
- Full suite run: 4061 tests, 3999 pass, 12 fail — all 11 daemon/handoff failures match `baseline-failures.tsv` exactly; the 1 unlisted failure (`roadmap-reconcile.test.cjs` E2E1) is pre-existing worktree ROADMAP drift, confirmed via `git status` showing zero diff on `.planning/ROADMAP.md` (untouched by this TRD, which is expressly forbidden from editing it).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Controls first (tests 3-10) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |
| 2: The gate (tests 1-2) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs && npm test 2>&1 \| tail -8` | 0 | PASS |

## Task Commits

1. **Task 1: Controls first (tests 3-10)** - `764320d` (test)
2. **Task 2: The gate (tests 1-2)** - `cfe7337` (test)

**Plan metadata:** (this commit) `docs(38-09): complete CI gate TRD`

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| doc-refs.repo.test.cjs (10 tests) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (10/10, 336ms) |
| full suite | `npm test` | 1 | 3999/4061 pass — 11 known-baseline daemon flakes + 1 pre-existing unrelated ROADMAP-drift self-test; zero new doc-refs failures |

## Mutation-Check Evidence (manual, uncommitted)

Per Task 1/2 instructions, each target file was temporarily edited, the specific test re-run to observe the expected failure, then restored (`git diff` confirmed zero residual diff before the next step).

| Test | Mutation | Observed result |
|---|---|---|
| 4 | Deleted the `<!-- doc-refs:ignore-end -->` line from help.md | FAILED — `AssertionError: help.md must contain exactly one ignore-end (0 !== 1)`; test 5 failed as a legitimate consequence (region regex no longer matches) |
| 5 | Changed one row's value: `/devflow:health → /devflow:status check` to `/devflow:health → /devflow:status wrong` | FAILED — `deepStrictEqual` diff on the `health` key; test 4 still passed (isolated the mutation) |
| 8 | Set `add-objective.md` frontmatter `status: active` → `status: legacy` | FAILED — `AssertionError: 'legacy' !== 'active'` |
| 2 | Appended `See /df:progress for status.` to help.md, outside the ignore-fenced table | FAILED — message named the exact line: `plugins/devflow/devflow/workflows/help.md:465  progress → /devflow:status`, followed by the full EXEMPT table |

All four mutations were reverted before the next step; `git status --short` showed no diff on `help.md` or `add-objective.md` at each restore point.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 write (tests 3-10) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS on current tree (no RED phase — these are gate/control tests, not new-feature TDD; correctness demonstrated via mutation, not via an initial failing state) |
| Task 1 mutation checks | (see Mutation-Check Evidence table) | 1 (each) | FAIL (correct — proves tests 4/5/8 are not vacuous) |
| Task 2 write (tests 1-2) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS on current tree — main gate found zero findings, no text fix needed |
| Task 2 mutation check | append stale token to help.md, run test 2 | 1 | FAIL (correct — names the injected line) |
| Full suite | `npm test` | 1 | 3999/4061 pass, 12 fail (11 baseline-listed + 1 pre-existing unrelated) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 10/10 (all `truths` entries in the TRD frontmatter map 1:1 to a passing test)
- **Gate failures:** None in `doc-refs.repo.test.cjs`. Full suite: 12 failures, all pre-existing (11 baseline-listed daemon/handoff flakes + 1 unrelated ROADMAP-drift self-test, see Deviations).

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` — the CI gate: 10 tests (scan-set anchors, main gate, EXEMPT sanity, ignore-region discipline ×2, sensitivity ×2, legacy-workflow derivation, single-source-of-truth, migration-target zero-findings), 359-file effective scan set, runs in ~0.3s.

## EXEMPT Table (final, 5 entries)

| Pattern | Reason (>= 20 chars, self-checked) |
|---|---|
| `**/*.test.cjs` | tests feed old command names as deliberate input fixtures (classifier.test.cjs, gh-pull.test.cjs and this file's own doc-refs.test.cjs suite) |
| `**/*.test.js` | tests feed old command names as deliberate input: route-intent prefix exclusion (route-intent.test.js:209-210) and the statusline text assertions |
| `plugins/devflow/devflow/bin/lib/__fixtures__/**` | frozen fixtures — intent-fixtures.cjs realCLAUDEMd is a faithful copy of an old CLAUDE.md kept for the B1 round-trip test |
| `plugins/devflow/devflow/bin/lib/skill-route.cjs` | declares DEPRECATION_MAP and REMOVED_COMMANDS themselves — the rename map, not a reference to it |
| `plugins/devflow/devflow/bin/lib/doc-refs.cjs` | declares the doc-refs:ignore-start/-end marker strings and the /df: prefix rule this very gate depends on |

Plus one **frontmatter-derived** (not hard-coded) carve-out: workflows with `status: legacy` (currently only `insert-objective.md`) are excluded from the effective scan set at test time (test 8).

No text required fixing (deviation from Task 1's gotcha clause never triggered — 38-01..38-06 already left the scan set clean); `references/command-renames.json` does not exist (test 9).

## Decisions Made
- Split the single test file into two commits matching the TRD's two `<task>` blocks (tests 3-10, then tests 1-2), rather than writing all 10 tests in one commit, so the commit history mirrors the TDD task boundary the TRD specifies.
- EXEMPT reasons are the literal justification text from the TRD's must_haves, not paraphrased, since they are graded on content as well as length.

## Deviations from Plan

### Unrelated pre-existing failure observed (not fixed, not a regression)

**1. `roadmap-reconcile.test.cjs` E2E1 fails in this worktree — orthogonal to doc-refs, not caused by this TRD**
- **Found during:** Task 2's full-suite run (`npm test`)
- **Issue:** `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` fails because `.planning/ROADMAP.md`'s checkboxes for 38-02..38-06 are still `[ ]` while their SUMMARY.md files already exist on disk (wave 1 merged, ROADMAP not yet resynced in this worktree).
- **Why not fixed:** The dispatch explicitly forbids editing `.planning/ROADMAP.md` in this TRD (38-07/38-08 run in parallel and own that file). `git status --short .planning/ROADMAP.md` shows zero diff — this TRD never touched it. The failure is not listed in `baseline-failures.tsv`; per the verification protocol it was re-run alone (isolated by name) and confirmed to depend only on `.planning/ROADMAP.md` vs SUMMARY files on disk, neither of which this TRD's commits touch.
- **Files modified:** None (out of scope by explicit instruction).
- **Verification:** `git status --short .planning/ROADMAP.md` → empty; `git log --oneline -1 -- .planning/ROADMAP.md` → `828b0b0` (predates this TRD's branch entirely).
- **Committed in:** N/A — no fix applied; documented for the orchestrator to resync ROADMAP.md when wave 2 lands.

---

**Total deviations:** 0 auto-fixed, 1 pre-existing failure documented (out of scope, not caused by this TRD).
**Impact on plan:** None on `doc-refs.repo.test.cjs` itself — the CI gate is fully green (10/10) and the only non-baseline full-suite failure is environmental to the worktree's mid-wave state, not to this TRD's work.

## Issues Encountered
None beyond the documented pre-existing ROADMAP-drift failure above.

## Next Objective Readiness
- The CI gate is live: any later TRD (38-10..38-12) that writes a stale `/devflow:`/`/df:` token into scanned text will fail `npm test` immediately, naming the exact file:line and the replacement.
- `references/command-renames.json` remains absent — confirmed by test 9, enforcing DOC-01's single-rename-source decision.

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs
- FOUND: commit 764320d
- FOUND: commit cfe7337
