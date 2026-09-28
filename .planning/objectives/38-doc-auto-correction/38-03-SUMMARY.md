---
objective: 38-doc-auto-correction
trd: "03"
subsystem: testing
tags: [statusline, hooks, init-cjs, todo-preview, dead-code-removal]

# Dependency graph
requires: []
provides:
  - "statusline.js no longer reads or renders the dead ~/.claude/cache/df-update-check.json update segment"
  - "init.cjs todo preview and doc comments name the live /devflow:todo list command instead of retired /devflow:check-todos"
affects: [38-09]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/statusline.js
    - plugins/devflow/hooks/statusline.test.js
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs

key-decisions:
  - "Left `.check-todos-cache.json` filename and the internal 'check-todos pipeline' wording untouched — only the /devflow:check-todos command references were dead; the cache filename is an internal implementation detail per the TRD's own done criteria."

patterns-established: []

requirements-completed: ["DOC-04 (code surfaces): dead statusline /df:update segment removed; init todo preview names /devflow:todo list"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 15min
completed: 2026-09-28
---

# Objective 38 TRD 03: Dead statusline update segment and the init todo preview Summary

**Removed the dead `/df:update` statusline segment (no writer ever produced `df-update-check.json`) and repointed the init todo-lane preview from the retired `/devflow:check-todos` to `/devflow:todo list`.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-28T12:15:38Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `statusline.js` no longer checks for or renders a `⬆ /df:update` segment; an orphaned `df-update-check.json` cache file is now silently ignored.
- `init.cjs`'s `_buildCheckTodosPreview` line and its two doc comments now name `/devflow:todo list` instead of the retired `/devflow:check-todos` command; the `.check-todos-cache.json` filename and internal "check-todos pipeline" wording are intentionally left as-is (internal implementation names, not user-facing commands).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Remove the dead update segment | `node --test plugins/devflow/hooks/statusline.test.js` | 0 | PASS (25/25) |
| 2: Init todo preview names /devflow:todo list | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (84/84) |

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: statusline shows no update segment for an orphaned cache file** - `93a9542` (test)
2. **Task 1 GREEN: drop the dead /df:update statusline segment** - `8d0f5c8` (fix)
3. **Task 2 RED: init todo preview names /devflow:todo list** - `f7602f0` (test)
4. **Task 2 GREEN: init todo preview points at /devflow:todo list** - `8561788` (fix)

_TDD tasks: two commits each (test → fix)._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| combined targeted suite | `node --test plugins/devflow/hooks/statusline.test.js plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (109/109) |
| must_haves regex (statusline+init) | `rg -n '/df:\|/devflow:(check-todos\|update)\b' plugins/devflow/hooks/statusline.js plugins/devflow/devflow/bin/lib/init.cjs` | 1 (no match, expected) | PASS |
| must_haves repo scan | `rg -n df-update-check plugins scripts` | 0 | PASS (only hits are in statusline.test.js, which plants the orphaned file) |
| full regression suite | `npm test` | 0 | PASS (see Post-TRD Verification) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/hooks/statusline.test.js` | 1 (24/25 pass, 1 fail) | FAIL (correct — new assertion fails against old code) |
| Task 1 GREEN | `node --test plugins/devflow/hooks/statusline.test.js` | 0 (25/25 pass) | PASS (correct) |
| Task 2 RED | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 1 (36/37 pass, 1 fail) | FAIL (correct — new assertion fails against old code) |
| Task 2 GREEN | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 (84/84 pass) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 4/4 (all four `must_haves.truths` entries from TRD frontmatter confirmed by direct grep/rg above)
- **Gate failures:** None
- **Full regression suite:** `npm test` (worktree) → 4023 tests, 3963 pass, 10 fail, 0 cancelled, 50 skipped, 0 todo. Total test count matches baseline (4023). All 10 failures are pre-existing entries in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv` (known-flaky `devflow-watch.test.cjs` daemon-lifecycle and `handoff-e2e.test.cjs` timing tests): `devflow-watch.test.cjs:145,177,191,353` and `handoff-e2e.test.cjs:254,271,285,298,327,344`. No unlisted failures — no regressions introduced by this TRD.

## Files Created/Modified
- `plugins/devflow/hooks/statusline.js` - removed the `dfUpdate` cache-check block and its use in both output-assembly branches
- `plugins/devflow/hooks/statusline.test.js` - rewrote the planted-cache test (`P-3` → `objective 38: no update segment — nothing writes df-update-check.json`) to assert the segment is absent
- `plugins/devflow/devflow/bin/lib/init.cjs` - replaced the three `/devflow:check-todos` command references (line 191 doc example, line 197 doc prose, line 215 code) with `/devflow:todo list`; left the `.check-todos-cache.json` filename and "check-todos pipeline" internal naming untouched
- `plugins/devflow/devflow/bin/lib/init.test.cjs` - updated 18I1's test-list comment and assertion to expect `/devflow:todo list`

## Decisions Made
- Kept `.check-todos-cache.json` filename and "post-aggregate check-todos pipeline" prose unchanged — these are internal implementation names, not user-facing command references, per the TRD's own Task 2 done criteria ("The `.check-todos-cache.json` filename is internal and stays").

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness
- 38-09's CI scan (hooks/*.js and bin/lib/*.cjs, non-test) will no longer find `/df:update` or `/devflow:check-todos` in `statusline.js` or `init.cjs`.
- No blockers for downstream TRDs.

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/statusline.js
- FOUND: plugins/devflow/devflow/bin/lib/init.cjs
- FOUND: commit 93a9542 (test: statusline shows no update segment)
- FOUND: commit 8d0f5c8 (fix: drop the dead /df:update statusline segment)
- FOUND: commit f7602f0 (test: init todo preview names /devflow:todo list)
- FOUND: commit 8561788 (fix: init todo preview points at /devflow:todo list)
