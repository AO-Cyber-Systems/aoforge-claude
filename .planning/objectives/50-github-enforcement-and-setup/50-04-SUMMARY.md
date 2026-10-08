---
objective: 50-github-enforcement-and-setup
trd: "04"
subsystem: github-store
tags: [store-mode, health, outbox, mapping, offline, validate, doctor]

requires:
  - objective: 47-github-authoritative-store
    provides: outbox journal and sync bases (gh-outbox), TRD body codec and content hash (gh-trd), hierarchy reader (gh-hierarchy)
  - objective: 48-planning-writes
    provides: planning-mode store/local guard and the findCacheDrift pattern
  - objective: 49-objective-branch-and-pr
    provides: the mapping `prs` entries this collector checks
provides:
  - "collectStoreHealth(root, opts) -> {applicable, findings:[{code, message, fix, objective?, id?}]} and CODES (W057-W061)"
affects: [50-07 validate Check 16, 50-07 doctor check 25]

tech-stack:
  added: []
  patterns:
    - "Store-mode guard first, before any read (the planning-drift.findCacheDrift pattern)"
    - "Independent try/catch sections: one unreadable input costs one W061, never the whole check"
    - "Collaborators called through their module objects, so a test can prove local mode reads none of them"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-health.cjs
    - plugins/devflow/devflow/bin/lib/gh-health.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "Frozen-drift hash convention confirmed against the flusher: base.body_hash = contentHash(issue body) and a TRD issue body = encodeTrdBody({id,file,text}) (gh-hierarchy buildOps), so drift is contentHash(encodeTrdBody(file)) !== base.body_hash. The decode+normalise fallback in the TRD was not needed."
  - "W059 stays at the two cases the TRD lists (mapped TRD with no file, prs entry with no objective directory). An objectives-map entry with no directory is NOT reported: a ROADMAP-only objective legitimately has an issue before its directory exists."
  - "A TRD of an objective whose files could not be read is a W061, never an orphan."

requirements-completed: [GEN-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~30min
completed: 2026-10-01
tokens_input: 7482918
tokens_output: 63574
tokens_cache_read: 7316516
tokens_cache_write: 166284
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50 TRD 04: Store Health Collector Summary

**`collectStoreHealth` reports, from local state only, which store-mode writes GitHub has not received (W057), which TRDs/objectives/PRs are unlinked (W058), which mapping entries have nothing local behind them (W059), and which frozen TRDs have drifted from their recorded body hash (W060); any internal failure becomes a W061 finding instead of a throw.**

## Performance

- **Tasks:** 2/2 complete, strict TDD (RED committed before GREEN for both).
- **Tests:** 34 in `gh-health.test.cjs`, all passing; every gh call goes through a seam that throws, and none fired.

## Accomplishments

- Mode guard: local mode returns exactly `{applicable:false, findings:[]}` before the outbox, the mapping or the objective index is read (proved by mocks that throw, and by the outbox dir never being created).
- W057 from `outbox.status`: pending+blocked counts (fix `df-tools gh outbox flush`), a halt naming reason/op/detail (fix `df-tools gh outbox resolve <seq> --accept-remote|--overwrite`), and a recovered journal naming the `.corrupt-*` file.
- W058: a TRD file with no `trds` entry, an objective with TRDs and no `objectives` entry, a `prs` entry with no number.
- W059 (offline half): a mapped TRD with no file, a `prs` entry whose objective has no directory. Every fix names `df-tools gh orphans <objective>`. Decision entries are never orphans.
- W060: a base with `frozen:true` whose local file no longer encodes to `body_hash`; fix names `gh trd scope` and `gh pull --all --force`. CRLF copies are not drift; comment (`<id>#<kind>`) and PR (`pr:<n>`) bases are ignored.
- W061: each section runs in its own try/catch. An unparseable or too-new mapping skips only the sections that need it; frozen drift and unsynced writes still run.

## Task Commits

| Task | Name | Phase | Commit |
|---|---|---|---|
| 1 | mode guard, unsynced writes and links | RED | f4fd7f8f |
| 1 | mode guard, unsynced writes and links | GREEN | f0e3927e |
| 2 | orphans and frozen-body drift | RED | bc6f1426 |
| 2 | orphans and frozen-body drift | GREEN | ba0dacbd |
| - | register gh-health.cjs in the one-gh-seam guard (deviation, below) | fix | 61b51096 |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: mode guard, unsynced writes and links | `node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs` | 0 (21/21 at the time) | PASS |
| 2: orphans and frozen-body drift | `node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs` | 0 (34/34) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs` | 0 | PASS (34/34) |
| regression | `node --test plugins/devflow/devflow/bin/lib/planning-drift.test.cjs` | 0 | PASS (27/27) |
| extra (deviation) | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` | 0 | PASS (9/9) |
| extra | `planning-writes.repo.test.cjs`, `doc-refs.repo.test.cjs`, `df-tools-deprecations.repo.test.cjs` | 0 | PASS (10/10, 14/14, 4/4) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-health.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | same | 0 (21/21) | PASS (correct) |
| RED (task 2) | same | 1 (6 failed: 5a, 5b, 5c, 6b, 6g, 6h; 28 passed) | FAIL (correct) |
| GREEN (task 2) | same | 0 (34/34) | PASS (correct) |

In RED for task 2, the guard tests 5d, 5e, 6a, 6c, 6d, 6e and 6f already passed because they assert the absence of a finding; they exist to stop the implementation over-reporting and all still pass after GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gh-seam.repo.test.cjs rejected the new module**
- **Found during:** Task 2 verification (running repo-wide tests that scan `lib/`).
- **Issue:** `gh-seam.repo.test.cjs` test 23 fails for any `gh-*.cjs` not listed in `GUARDED`. Adding `gh-health.cjs` (Task 1) broke it. The file is outside this TRD's `files_modified`.
- **Fix:** Added `gh-health.cjs` to `GUARDED` and `NO_DIRECT_WRITE` (it never spawns gh/git and never writes). Entries were inserted mid-list, not at the tails, to lower merge-conflict odds with sibling wave-1 TRDs that also add `gh-*.cjs` modules.
- **Files modified:** plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
- **Commit:** 61b51096
- **Orchestrator note:** commit f0e3927e leaves test 23 red until 61b51096; expect a possible textual conflict in this file if another wave-1 TRD touched the same two arrays.

### Environment notes (not code deviations)

- The first `exec-context check` ran from the main checkout (the shell cwd), so it recorded a claim on the main checkout for 50-04. It was re-run against the worktree with `--cwd` (proved: checkout `.df-worktrees/devflow-claude/50-04`, branch `df/exec-50-04`, base visible) and the stray main-checkout claim was released with `exec-context release --id 50-04`. Siblings are not blocked by it.
- `outbox.status` quarantines an unparseable live journal by renaming it to `<journal>.corrupt-<ts>` (the outbox's own recovery, the same effect `gh outbox status` has). The collector reports it as W057 and never deletes the file. 50-07 should know that validate Check 16 can therefore perform this one rename, unlike W056 (`findCacheDrift`), which never quarantines.

## Authentication Gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (local-mode no-read; W057; W058; W059; W060; no-gh and W061 never-throw)
- Gate failures: None (the only red was the gh-seam registration above, fixed in 61b51096)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-health.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-health.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs (modified)
- FOUND commits: f4fd7f8f, f0e3927e, bc6f1426, ba0dacbd, 61b51096 (all on df/exec-50-04; worktree clean)
