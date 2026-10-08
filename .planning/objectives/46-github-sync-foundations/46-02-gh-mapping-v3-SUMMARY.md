---
objective: 46-github-sync-foundations
trd: "02"
subsystem: github-sync
tags: [gh-mapping, migration, objective-id, atomic-write, idempotent]

requires:
  - objective: 46-github-sync-foundations
    provides: "46-RESEARCH.md Patterns 1 and 2 (identity function, mapping v3) and the Migration mechanics section"
provides:
  - "lib/gh-mapping.cjs: one objective id (toObjectiveId / resolveObjective / listObjectiveIndex) and one mapping shape (v3) with a pure v1/v2 converter, lazy reader and atomic writer"
  - "normalizeSyncStateKeys: sync-state re-keyed by objective id, still version 1"
  - "migration 0009 gh-mapping-v3 (auto, since 2.13.0)"
affects: [46-05 gh-issue, 46-06 pull/sync-state/conflict, 46-07 sync-core rewire, 46-08 command surface, objective 47 trds map]

tech-stack:
  added: []
  patterns:
    - "One pure converter shared by the lazy reader and the migration (migrateMapping); I/O only in the read/write wrappers"
    - "Hand-rendered JSON object keys, because JSON.stringify orders integer-like keys first and cannot produce 2, 2.1, 3, 10"
    - "Refuse-rather-than-clobber on write: newer-version and unparseable files on disk are never overwritten"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs

key-decisions:
  - "Id rule is the ROADMAP number with leading zeros stripped on the integer part only; the decimal part is kept verbatim (02.10 -> 2.10)"
  - "parseInt-collapse repair is narrower than the TRD text: re-key only when exactly one decimal objective sharing the key's integer part names the issue and no objective with the key's own id does"
  - "Keys that cannot be made into an id are dropped from the mapping with a note, but left alone in sync-state (a derived baseline)"
  - "Migration detect is gated on the mapping file existing and parsing; sync-state is never normalised on its own"

requirements-completed: [GSF-01]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 13min
completed: 2026-09-30
tokens_input: 9709588
tokens_output: 97741
tokens_cache_read: 9523051
tokens_cache_write: 186409
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 02: Mapping v3, one objective id, migration 0009 Summary

**One objective-id function and one v3 mapping shape (pure v1/v2 converter, lazy in-memory reader, atomic numerically-sorted writer that refuses to clobber newer or unreadable files), plus auto migration 0009 that converts `.gh-mapping.json` and re-keys `.gh-sync-state.json` by id.**

## Performance

- **Duration:** about 13 min (claimed 2026-09-30T17:55:39Z, last code commit before 18:08Z)
- **Tasks:** 3/3, each RED then GREEN
- **Files:** 4 created, 1 modified (+1498 / -2 lines)

## Accomplishments

- `toObjectiveId` maps `46`, `046`, `46-github-sync-foundations` to `46`; `2.1` and `02.1-foo` to `2.1`; `0` and `00-refine-defaults-table` to `0`; junk to null. `resolveObjective` returns `{id, dir, roadmapNumber}` (dir null for a ROADMAP-only objective).
- `migrateMapping(raw, index)` turns v1, v2, mixed, dir-name-keyed, padded-key and parseInt-collapsed mappings into the single v3 shape. It is pure and idempotent (`migrate(migrate(x).mapping)` equals `migrate(x).mapping`, `changed:false` the second time). Colliding keys with different issues land in `conflicts` and are omitted from `objectives`; nobody picks a winner.
- `readMappingV3` converts in memory and never writes. `writeMappingV3` is tmp+rename, sorts keys numerically, and refuses a version above 3, a newer file already on disk, and an unparseable file on disk.
- Migration 0009 (`auto`) shares one `plan()` between `detect`, `apply` and dry-run, so they cannot disagree. It runs cleanly through the real `upgrade.check` / `upgrade.apply` with a fake HOME and a backup.

### Real-mapping conversion check (success criterion)

This repository's own tracked `.planning/.gh-mapping.json` (`{"milestone_id":null,"objectives":{"0":{"issue_id":20,"state_comment_id":4374249280}}}`) was converted in memory with `readMappingV3WithReport` (read-only; nothing written). Result: `changed: true`, no warnings, no notes, and `objectives["0"] = {issue_id: 20, state_comment_id: 4374249280, verified_at: null}`. No data lost. `serializeMapping` output for it is the 12-line v3 document with `milestones: {}` and `trds: {}`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Objective identity (tests 1-3) | `node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs` | 0 (10/10 at that point) | PASS |
| 2: v1/v2 to v3 conversion, sync-state keys, reader/writer (tests 4-15) | `node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs` | 0 (41/41) | PASS |
| 3: Migration 0009 (tests 16-20) | `node --test plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` | 0 (23/23 for 0009; upgrade and doctor e2e green) | PASS |

The last row was run as two invocations: the 0009 file alone (23/23), then `upgrade.test.cjs` + `doctor.e2e.test.cjs` + the 0008 test (67 of 68, the one failure being the 0008 registry-position assertion described under Deviations, since fixed).

## Task Commits

1. **Task 1** RED `f54416b` (test), GREEN `a5544c5` (feat)
2. **Task 2** RED `0996730` (test), GREEN `a775245` (feat)
3. **Task 3** RED `e2ea783` (test), GREEN `985be33` (feat)
4. **Recovery commit** `6379c41` (test): 0008 contract assertion, see Deviations

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs` | 0 (41 + 23 pass, run as two files in this environment) | PASS |
| verification grep | `rg -n "parseInt\(" plugins/devflow/devflow/bin/lib/gh-mapping.cjs` | 0 | PASS: only `toObjectiveId` (integer part) and `compareIds` (numeric sort), plus two comment lines |
| full suite | `npm test` (run via `npm --prefix <worktree> test`) | 1 | 11 failures, all daemon/handoff, none in this TRD's files (below) |

### Full-suite result

5872 tests: **5811 pass, 11 fail, 50 skipped**, 0 cancelled (137 s). Every failure is a spawned-daemon test:

- `devflow-watch start (foreground) + stop`: 3 (foreground daemon writes PID file; start refuses when daemon already running; start cleans up stale PID file)
- `devflow-watch multi-project CLI (TRD 20-03)`: 2 (C-1, C-2 `start --project ...`)
- `handoff pipeline — end-to-end`: 6 (write pending / daemon executes; disallowed command; idempotency; multi-record; LK-1 teardown reaps the daemon; LK-2 SIGTERM within deadline)

Per the coordinator these are the pre-existing MA-7 handoff/daemon baseline and were recorded, not investigated. I did not re-run them at the wave base to confirm independently. None of them imports `gh-mapping.cjs` or migration 0009, and every test that does (41 + 23), plus `upgrade.test.cjs`, `doctor.e2e.test.cjs` and all 0008 tests, passes.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-mapping.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | same | 0 (10/10) | PASS (correct) |
| RED (task 2) | same | 1 (10 pass, 31 "is not a function") | FAIL (correct) |
| GREEN (task 2) | same | 0 (41/41, after fixing one test-side assertion) | PASS (correct) |
| RED (task 3) | `node --test .../0009-gh-mapping-v3.test.cjs` | 1 (0/23, module not found) | FAIL (correct) |
| GREEN (task 3) | same | 0 (23/23) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (every `must_haves.truths` line maps to a passing test: ids 1-2, `migrateMapping` 4-11, collapse/collision 8-9, read/write 13-14, migration 16-20)
- **Gate failures:** None in this TRD. 11 baseline daemon/handoff failures in the full suite (above).

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh-mapping.cjs`: identity, converter, sync-state normaliser, serializer, reader, writer, getEntry/setEntry
- `plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs`: 41 tests (hand-built temp projects, no network, no `gh`)
- `plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.cjs`: auto migration, `since` 2.13.0
- `plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs`: 23 tests incl. a real `upgrade.check` / `upgrade.apply` pass with a fake HOME
- `plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs`: one assertion relaxed (not in the TRD's `files_modified`; authorised by the task 3 recovery clause)

## Decisions Made

- **Exports beyond the TRD's `provides` list:** `MAPPING_REL`, `compareIds`, `emptyMapping`, `serializeMapping`, `readMappingV3WithReport`. The migration needs `serializeMapping` and the rewire TRDs need `readMappingV3WithReport` for warnings, conflicts and the version error.
- **`roadmapNumber`** is the number exactly as the ROADMAP header spells it, falling back to `id` for a directory with no header.
- **`setEntry` merges** onto the existing entry (a named field wins, including explicit `null`), always yields the three v3 fields, and throws on an unrecognised objective or a missing `issue_id`. `writeMappingV3` also runs its argument through `migrateMapping`, so even a legacy-shaped argument lands on disk as v3.
- **Unknown top-level fields pass through** a read-modify-write; per-entry fields are canonical-only (`issue_id`, `state_comment_id`, `verified_at`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registering 0009 broke the 0008 contract test**
- **Found during:** Task 3 verification
- **Issue:** `0008-runtime-state-untrack.test.cjs` asserted `ids[ids.length - 1] === '0008'`, which is false once 0009 exists.
- **Fix:** Replaced with "0008 is registered and is the newest id at or below itself". The neighbouring "registry is in id order" assertion is unchanged. Done in its own commit as the TRD's recovery clause asks.
- **Files modified:** `plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs`
- **Verification:** `node --test --test-name-pattern="8. contract" ...` green; the full file was green apart from this assertion beforehand.
- **Committed in:** `6379c41`

**2. [Rule 2 - Missing critical] Collapse repair tightened beyond the TRD wording**
- **Issue:** The TRD says to re-key when an index objective's `github_issue` names the issue "and its id differs". Taken literally that would move an unrelated objective's entry onto another objective that merely references the same issue number.
- **Fix:** Re-key only when the key has no decimal part, exactly one decimal objective sharing the key's integer part names the issue, and no objective with the key's own id does. It also ignores a `github_issue` that names a different `owner/repo` than the mapping. Covered by tests 8, 8b, 8c.
- **Committed in:** `a775245`

**3. [Rule 2 - Missing critical] Writer also refuses to overwrite a newer or unparseable file on disk**
- **Issue:** The TRD only refuses a mapping argument with `version > 3`. But `readMappingV3` returns an empty v3 for a version-4 or unparseable file, and writing that back would destroy the original.
- **Fix:** `writeMappingV3` inspects the file on disk first and refuses in both cases. Tests 14d and 14e.
- **Committed in:** `a775245`

### Test-side fix inside the same task

One of my own tests (14) asserted the `.planning` directory listing was exactly the mapping file; `tmpProject()` also creates `objectives/`. Changed it to assert no `.tmp.` leftovers. Fixed before the GREEN commit, no implementation change.

**Total deviations:** 3 auto-fixed (1 Rule 3, 2 Rule 2). **Impact on plan:** all necessary for correctness; no scope creep, and the only file touched outside `files_modified` is the 0008 test the TRD anticipated.

## Issues Encountered

- **Preflight, first attempt:** my shell's default cwd was the main checkout, so `exec-context check` resolved `checkout` to `/Users/justin/dev/devflow-claude` and reported `SHARED INDEX` (claimed by `46-01-gh-client`). The dispatch said to run it from the worktree; re-running with `--cwd <worktree>` passed (`checkout` = the worktree, branch `df/exec-46-02-gh-mapping-v3`, `base_visible: true`). I did not release the other executor's claim. All work and commits used the worktree via `--cwd` / `git -C` / absolute paths; I confirmed the main checkout's HEAD was untouched.
- **SUMMARY filename:** the TRD's `<output>` names `46-02-SUMMARY.md`, but plan files are slug-named (`46-02-gh-mapping-v3-TRD.md`) and the coordinator asked for `46-02-gh-mapping-v3-SUMMARY.md`, so that is what is written here.
- The 11 baseline daemon/handoff failures (above).

## User Setup Required

None - no external service configuration required.

## Notes for the rewire TRDs (46-05..46-08)

- Call `resolveObjective` at every entry point, use `.id` for mapping/sync-state keys and `.dir` for file paths. `trds` keys (`46-02`) are out of scope here: `toObjectiveId("46-02")` returns `"46"`.
- Always check `readMappingV3WithReport(cwd).error` before writing; a non-empty `mapping.conflicts[id]` means refuse to write to GitHub for that id ("needs human").
- Per-entry extra fields are dropped on write. Any later objective that adds one must extend the entry handling in `migrateMapping` / `setEntry` and add a test.
- The lazy read consults the project index, so it re-keys a collapsed entry without writing; the first-sync marker check (46-05) remains the authority and `verified_at: null` is how it knows to run.

## Next Objective Readiness

Ready: 46-05 through 46-08 can import `gh-mapping.cjs` now. No blockers from this TRD.

## Self-Check: PASSED

- Files: `gh-mapping.cjs`, `gh-mapping.test.cjs`, `0009-gh-mapping-v3.cjs`, `0009-gh-mapping-v3.test.cjs` all present (checked with `ls`).
- Commits: `f54416b`, `a5544c5`, `0996730`, `a775245`, `e2ea783`, `985be33`, `6379c41` all on `df/exec-46-02-gh-mapping-v3` (checked with `git log cb51578..HEAD`).

---
*Objective: 46-github-sync-foundations*
*Completed: 2026-09-30*
