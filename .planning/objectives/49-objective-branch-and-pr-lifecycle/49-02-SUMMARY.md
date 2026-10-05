---
objective: 49-objective-branch-and-pr-lifecycle
trd: "02"
subsystem: github-store
tags: [gh-mapping, gh-client, prs, objective-branch, pr-lifecycle, byte-stability]

requires:
  - objective: 48-store-mode-planning-verbs
    provides: the `entities` precedent for an optional top-level mapping map, and the byte-stable v3 serializer
provides:
  - "`prs` top-level map in the v3 mapping, keyed by objective id, with getPr / setPr / listPrs"
  - "gh-client classifies `gh issue develop --list|-l` as a read (unpaced, not counted against the write budget)"
affects: [49-05, 49-07, 49-08, 49-09, 49-11, 49-12]

tech-stack:
  added: []
  patterns:
    - "optional top-level mapping map rendered only when non-empty, so every pre-existing mapping file is byte-identical"
    - "merge-patch accessor with a closed field set, fixed storage order, TypeError on typos, null clears a field"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-client.cjs
    - plugins/devflow/devflow/bin/lib/gh-client.test.cjs

key-decisions:
  - "PR state is a top-level `prs` map, not fields on `objectives[id]` (readLegacyEntry and setEntry normalise objective entries to three fields and would drop it)"
  - "`prs` serialises after `entities` and before `conflicts`/extras, and only when it has at least one key"
  - "setPr: an explicit null removes a field (absence is the empty value; an entry never stores null); undefined is ignored; `branch` is the one required field and cannot be cleared"
  - "setPr keeps unknown fields already on disk (after the known ones) so a later objective's additive field survives a read-modify-write; a PATCH may still only name known fields"
  - "issue develop value-taking flags are skipped when scanning for --list, so `--name --list` is a write"

patterns-established:
  - "A new top-level map needs THREE edits, not two: KNOWN_TOP_LEVEL, serializeMapping, and an explicit carry-through in migrateMapping (otherwise adding it to KNOWN_TOP_LEVEL silently drops it on read)"

requirements-completed: [GPR-01, GPR-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 17min
completed: 2026-10-01
tokens_input: 8492657
tokens_output: 54348
tokens_cache_read: 8336282
tokens_cache_write: 156241
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 02: Mapping `prs` map and gh-client read classification Summary

**v3 mapping gains an optional top-level `prs` map (getPr/setPr/listPrs, byte-stable when empty) for objective branch and PR state, and gh-client now treats `gh issue develop --list` as an unpaced read.**

## Performance

- **Duration:** about 17 min
- **Started:** 2026-10-01T15:00:49Z
- **Completed:** 2026-10-01T15:17Z (approx.)
- **Tasks:** 2/2
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments

- Branch and PR state now has a home in `.planning/.gh-mapping.json`: `prs[<objective id>] = {branch, base, number, node_id, url, wiki_base_sha, merged_at, reconciled_at}`.
- Every mapping written before objective 49 serialises byte-for-byte after a read-modify-write (pinned by a hand-written fixture string covering entities, conflicts and an extra).
- `issue develop --list` no longer burns the 1 s write pacing or the per-run write budget, while `issue develop` that creates a branch stays a paced write.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: `prs` map in the mapping | `node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs` (93 pass, incl. 19 new) | 0 | PASS |
| 2: gh-client read classification | `node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs` (40 pass, incl. 5 new) then `node --test plugins/devflow/devflow/bin/lib/gh-*.test.cjs` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-mapping.test.cjs gh-client.test.cjs` | 0 | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/gh-*.test.cjs` (1244 tests, 0 fail; was 1220 at base) | 0 | PASS |
| verification | `node --test gh-seam.repo.test.cjs` (6 pass, no `parseInt` of ids; also inside the gh-* run) | 0 | PASS |

All commands were run with absolute worktree paths. An early relative-path regression run executed against the main checkout (the shell's cwd is not the worktree) and was discarded and redone; the numbers above are from the worktree.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern="49-02 prs map" gh-mapping.test.cjs` | 1 | FAIL (15 of 18 fail on a missing setPr/getPr/listPrs or missing behaviour; the 3 that pass are byte-stability pins 1, 7, 7c) |
| GREEN (Task 1) | `node --test gh-mapping.test.cjs` | 0 | PASS (93 pass) |
| RED (Task 2) | `node --test --test-name-pattern="49-02 isWriteArgs" gh-client.test.cjs` | 1 | FAIL (8 and 8e fail: `--list` classified as a write, paced 1000 ms twice; 8b/8c/8d are pins and pass) |
| GREEN (Task 2) | `node --test gh-client.test.cjs` | 0 | PASS (40 pass) |

Commit order is test then implementation for both tasks. Tests 1 and 7 of the TRD list, and the `pr`/graphql/`develop`-write cases of test 8, pass before the implementation by design: they are characterization pins that fail if the implementation over-widens or reorders the serializer.

## Commits

| Commit | Message |
|---|---|
| f2b2442a | test(49-02): mapping prs map |
| 75609f05 | feat(49-02): mapping stores objective branch and PR state |
| 93b7b1a5 | test(49-02): issue develop --list is a read |
| a60fceed | fix(49-02): classify issue develop --list as a read |

## Contract notes for downstream TRDs

- `setPr(mapping, objective, patch)` returns the mapping. Patch keys must be in `branch, base, number, node_id, url, wiki_base_sha, merged_at, reconciled_at`; anything else (including `title`) throws `TypeError` naming the key.
- **`branch` is required on the stored entry.** The first `setPr` for an objective must include it. 49-05's `setPr(m, id, {number, node_id, url})` is fine when 49-09 has already recorded the branch (and `upsert-pr` args carry the branch), but it will throw `needs a branch` if called for an objective with no entry and no `branch` in the patch.
- `number` is coerced to a positive integer (numeric strings accepted); every other field is a non-empty string. `setPr(m, id, {number: null})` removes `number` (49-05's "clear number and re-find by head" case).
- `getPr` returns the stored object (not a clone) or `null`; `listPrs` returns `[[id, entry], ...]` sorted numerically.
- `readMappingV3`/`writeMappingV3` carry `prs` through (`migrateMapping` clones it; a non-object `prs` is dropped with a note).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `migrateMapping` had to carry `prs` explicitly**
- **Found during:** Task 1 design (before RED)
- **Issue:** The TRD names `KNOWN_TOP_LEVEL`, `serializeMapping` and the accessors, but adding `prs` to `KNOWN_TOP_LEVEL` removes it from the unknown-keys carry-through loop in `migrateMapping`, so every `readMappingV3` would have silently dropped the map.
- **Fix:** carry-through block for `prs` next to `entities` (clone when a plain object, note when not). Covered by tests 7b, 7c and 8b.
- **Files modified:** gh-mapping.cjs, gh-mapping.test.cjs
- **Commit:** 75609f05

### Additions beyond the TRD's test list (no behaviour contradicts the TRD)

- Test 3d (unknown fields already on disk survive a `setPr`) was written AFTER the implementation that provides that behaviour, not before. It passes on first run; I did not revert the implementation to watch it fail. It is committed with 75609f05.
- Test 8b's `--worktree` case (installed `gh` has `--worktree path` as a value-taking flag) was added with the implementation in a60fceed, after reading `gh issue develop --help`.
- The TRD said "add only the cases that fail today" for test 8. The `pr` read/write, graphql and `issue develop` write cases pass today; they are kept as separate pins (8b, 8c, 8d) because `pr` classification had no coverage and the fix must not over-widen.

## Full-suite result and failure classification

`npm test` in the worktree: 7487 tests, 7429 pass, **8 fail**, 50 skipped. The 8 failures are all environmental to the worktree, not caused by this TRD:

| Failing test | Cause |
|---|---|
| devflow-watch.test.cjs: foreground daemon writes PID file...; start refuses when daemon already running (2) | daemon exits 3: `Cannot find module 'node-pty'` |
| handoff-e2e.test.cjs: write pending...; disallowed command...; idempotency...; multi-record...; LK-1; LK-2 (6) | same: daemon never writes its PID file |

Root cause: `watcher-shell.cjs` requires `node-pty`, which exists only in the main checkout's `node_modules`; the worktree has none (the daemon log line is `failed to spawn shell: node-pty not installed ... Cannot find module 'node-pty'`, required from the worktree's `watcher-shell.cjs`). The same condition also skips the PTY tests ("node-pty unavailable"), which is part of the 50 skips.

Evidence it is not this TRD's diff:
- The same two files pass in the main checkout at WAVE_BASE a22397a3 (one different PTY test, MA-7, failed there once; it is timing dependent and is a documented architectural-gap test, unrelated to this work).
- The same two files in the worktree at HEAD, run in isolation, still fail (so not load).
- The same two files in the worktree at HEAD with `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules` pass: 35 tests, 33 pass, 0 fail, 2 skipped (architectural-gap skips).
- This TRD touches only `gh-mapping` and `gh-client` and their tests; the daemon uses neither.

Nothing was fixed because nothing this TRD caused was failing. A full `npm test` run after the wave merges into a tree with `node_modules` is the right place to see a clean count.

## Side effect to disclose

While diagnosing the above I started the daemon by hand once (`devflow-watch start --project <scratchpad path> --foreground`) without `HOME`/`DEVFLOW_HANDOFF_PID_FILE` overrides. It used the real home: it appended three lines (pid 75940, the node-pty error) to `~/.devflow/devflow-watch.log` and wrote then removed its PID file via its own error path. No daemon was left running. The log lines were not edited out: it is a shared append-only log.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (prs map and accessors; `prs` only when non-empty, byte-stable; `setPr` via `toObjectiveId` and objective entries stay three fields; `issue develop --list|-l` read, `pr` reads, graphql query/mutation split)
- Gate failures: None for this TRD's gates. 8 environmental failures in unrelated daemon tests under `npm test` in a tree without `node_modules` (see above).

## Self-Check: PASSED

- Files found: gh-mapping.cjs, gh-mapping.test.cjs, gh-client.cjs, gh-client.test.cjs (all four present in the worktree).
- Commits found on `df/exec-49-02` (git log a22397a3..HEAD): f2b2442a, 75609f05, 93b7b1a5, a60fceed.
- Worktree clean (`git status --short` empty) before this SUMMARY was added.
