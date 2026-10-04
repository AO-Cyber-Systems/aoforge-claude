---
objective: 48-planning-write-path-migration
trd: "09"
subsystem: validate
tags: [store-mode, cache-drift, validate-health, W055, W056, content-hash, tdd, node-test]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-mode (planningMode), planning-paths (listByClass, classify), planning-ledger (readLedger)"
  - objective: 47-github-authoritative-store
    provides: "gh-outbox cache index (stateDir/repoKey + .cache.json), gh-trd contentHash, gh-cache GENERATED_HEADER / recordCacheBaseline"
provides:
  - "lib/planning-drift.cjs: findCacheDrift(root, {readIndex, readLedger, home, env, maxFiles}) -> {applicable, root, drift:[{rel, class, verb, reason, message, fix, hint}], checked, notes}; driftMessage; defaultReadIndex (read-only); _setDriftReaders seam; GENERATED_HEADER, MAX_FILES=5000, REASONS"
  - "validate.cjs Check 15: W055 per drifted cache/generated file (advisory, repairable:false); W056 planning-drift-check-failed when the check cannot run or is capped"
affects: [48-10, 48-11, 48-13, 48-14, 48-22, 48-23]

tech-stack:
  added: []
  patterns:
    - "Drift by content, not mtime or git: current hash vs cache-index baseline vs verb-write ledger"
    - "Read-only index reader: same file and shape check as gh-outbox.readCacheIndex, but throws instead of quarantining"
    - "A corrupt or malformed store throws so validate reports one W056, never a flood of false W055s"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-drift.cjs
    - plugins/devflow/devflow/bin/lib/planning-drift.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs

key-decisions:
  - "Default index reader parses <stateDir>/<repoKey>.cache.json itself: gh-outbox.readCacheIndex quarantines (renames) a corrupt index, and validate health / doctor must stay read-only"
  - "A corrupt index or a ledger reporting corrupt:true throws -> one W056, rather than flagging every cache file as drift"
  - "Reason precedence: generated without GENERATED_HEADER -> hand-edited; baseline match or ledger match -> clean; otherwise changed if either store knew the rel, else no-baseline (so a stale ledger with no baseline is `changed`)"
  - "Hand-edited generated views get an extra clause: gh pull skips a file without the generated header (hand_maintained, never forced), so the user must move it aside first"
  - "Check 15 scans the MAIN checkout (planningMode root), matching the ledger/journal D-14 resolution; it passes validate's homeDir to the readers"
  - "MAX_FILES cap note and check failures share the W056 `planning-drift-check-failed:` prefix"

patterns-established:
  - "Store-mode checks in validate are gated by planningMode and add nothing in local mode; pin local-mode issue codes before adding one"

requirements-completed: [GWP-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-01
---

# Objective 48 TRD 09: validate flags Bash writes to the cache (W055) Summary

**`validate health` Check 15 hashes every store-mode cache and generated `.planning/` file and reports W055 for any whose bytes
match neither the 47 cache-index baseline nor a pending 48-01 verb-ledger write, naming the file, the reason and the verb to
publish it with (or `gh pull --all --force` to restore). Local mode adds nothing and reads no outbox state.**

## Performance

- Started 2026-10-01T12:34Z, finished about 2026-10-01T13:00Z
- 2 tasks, 5 commits (RED + GREEN for Task 1; characterization, RED and GREEN for Task 2), 2 files created, 2 modified

## Accomplishments

- `planning-drift.cjs`: `findCacheDrift(root, opts)` resolves the mode with `planningMode`, returns `{applicable:false}` in
  local mode before any reader runs, and otherwise checks `listByClass` cache files (minus `wiki/**`) plus generated views, sorted,
  capped at 5,000. Reasons `no-baseline`, `changed`, `hand-edited`; messages follow D-15 word for word, with `fix` equal to the
  message. Readers come from `opts`, then the `_setDriftReaders` seam, then the read-only defaults.
- `validate.cjs` Check 15, after Check 14, in Check 14's shape: one `W055` per drift (`repairable:false`), `W056
  planning-drift-check-failed: <why>` for a thrown check or the cap note, fix "Run `df-tools validate health --raw` after `gh pull --all`".
- Characterization pins the local-mode codes (errors `[]`, warnings `[W001]`, info `[I001]`) for three store-off config shapes,
  including this repo's (`github.enabled:false`), on a fixture whose cache-shaped files would all be W055 in store mode.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | 5f6111b8 | test(48-09): cache drift detection |
| 1 GREEN | ef2f044a | feat(48-09): cache drift detection |
| 2 characterization | 19af4d6a | test(48-09): pin local-mode validate health codes |
| 2 RED | 5a031236 | test(48-09): validate W055 |
| 2 GREEN | e59a1fbb | feat(48-09): validate health reports W055 cache drift |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planning-drift.cjs | `node --test plugins/devflow/devflow/bin/lib/planning-drift.test.cjs` | 0 | PASS (34/34) |
| 2: Check 15 | `node --test .../validate.test.cjs .../doctor-checks/21-22-project.test.cjs` | 0 | PASS (127/127, run together with the 34 drift tests: 161/161) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test .../planning-drift.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 1 | `node --test .../planning-drift.test.cjs` | 0 | PASS (correct) |
| Characterization (test 9) | `node --test --test-name-pattern "Check 15" .../validate.test.cjs` | 0 | PASS against unchanged validate.cjs (correct) |
| RED 2 | `node --test --test-name-pattern "Check 15" .../validate.test.cjs` | 1 (tests 10, 11, 12 fail: no W055/W056) | FAIL (correct) |
| GREEN 2 | `node --test .../validate.test.cjs .../21-22-project.test.cjs .../planning-drift.test.cjs` | 0 | PASS (correct) |

No REFACTOR commits. Test 10a (fully baselined store project gives no W055/W056) passed in RED too, because it guards against
false positives rather than asserting the new warning.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-drift.test.cjs validate.test.cjs` | 0 | PASS |
| regression | `node --test doctor-checks/*.test.cjs doc-staleness.test.cjs` | 0 | PASS (160/160) |
| verification | `df-tools validate health --raw` in this repo (store off) | 0 | PASS: no W055/W056; other codes are the repo's usual E020/W001/W005/W021/W040/I001 |
| full suite | `npm test` (worktree) | 1 | 7177 pass, 32 skipped, 2 failures, neither a 48-09 code regression (see below) |

Full-suite failures:

- **MA-7** in `handoff-e2e.test.cjs` (doctl auth, PTY path): the known pre-existing flake. Noted, not fixed.
- **E2E1** in `roadmap-reconcile.test.cjs` ("reconcile dry-run against this repo ROADMAP shows zero drift"): it flags
  `- [ ] 48-09-...` in ROADMAP.md because this SUMMARY already exists on disk. With the SUMMARY moved aside the file passes
  60/60. This is ordering, not code: it clears when the orchestrator ticks 48-09 in ROADMAP.md after the merge (executors may
  not edit ROADMAP.md). Until then E2E1 fails on this branch.

## Deviations from Plan

**1. [Rule 2 - Correctness] Read-only default index reader instead of `gh-outbox.readCacheIndex`**
- **Found during:** Task 1 design
- **Issue:** `readCacheIndex` goes through gh-outbox `readJsonFile`, which renames a corrupt index to `<file>.corrupt-<ms>`. As the
  default reader it would make `validate health` (and doctor, which composes it read-only) move state files, and the `{}` it then
  returns would flag every cache file `no-baseline`.
- **Fix:** `defaultReadIndex` reads the same `<stateDir>/<repoKey>.cache.json` with the same shape check and throws on corruption,
  so Check 15 reports one W056. Test 14 asserts it agrees with `readCacheIndex` on a valid index; test 15 asserts a corrupt index
  stays byte-identical with nothing quarantined. A ledger reporting `corrupt: true` throws the same way (test 16).
- **Files modified:** planning-drift.cjs
- **Commit:** ef2f044a

**2. [Rule 1 - Bug] Actionable text for a hand-edited generated view**
- **Found during:** Task 1
- **Issue:** D-15's generated-file text is "regenerate with `df-tools gh pull --all`", but gh-cache never overwrites a ROADMAP.md /
  STATE.md that lacks GENERATED_HEADER (`hand_maintained`, not even with `--force`), so for reason `hand-edited` that fix does nothing.
- **Fix:** the `hand-edited` message appends "(pull skips a file without the generated header: move it aside first)". `changed`
  and `no-baseline` generated messages are exactly D-15's text.
- **Commit:** ef2f044a

Neither changes the TRD's contract (`{applicable, drift:[{rel, verb, reason}]}`, W055 advisory, W056 on failure). The result also
carries `class`, `message`, `fix`, `hint`, `checked` and `notes`.

## Notes for later TRDs

- **48-11 / 48-14 (verbs):** a verb that writes a cache file must `planning-ledger.record` the exact bytes, or Check 15 flags its
  own write until the next flush baselines it.
- **48-13 (generated views):** MILESTONES.md is classed `generated`, so in store mode it must start with GENERATED_HEADER and be
  baselined, or it shows as W055 (`no-baseline` / `hand-edited`). gh-cache `GENERATED_FILES` today lists only ROADMAP.md and STATE.md.
- **Doctor:** W055/W056 are plain warnings, not in `22-validate-health.cjs` DEFERRED, so drift makes doctor's validate-health
  check `warn`. The doctor suite passes unchanged.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (W055 per drifted file naming the verb or `gh pull --all --force`; pending verb write and fresh baseline
  not flagged; no-baseline flagged; local mode adds nothing and calls no reader; W055 non-repairable and W056 on failure)
- Gate failures: None

## Self-Check: PASSED

- FOUND: planning-drift.cjs, planning-drift.test.cjs, validate.cjs, validate.test.cjs
- FOUND: commits 5f6111b8, ef2f044a, 19af4d6a, 5a031236, e59a1fbb (`git log fdfb4b4f..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merging the wave
