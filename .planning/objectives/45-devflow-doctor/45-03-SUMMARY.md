---
objective: 45-devflow-doctor
job: 45-03
trd: "03"
subsystem: runtime-sync
tags: [sync-runtime, content-digest, plugin-marker, sha256, mirror]

requires: []
provides:
  - "runtime-digest.cjs: SUBDIRS, MIRROR_EXCLUDE, shouldExclude, digestTree, readMarkerDigest, DIGEST_FILE"
  - "sync-runtime writes .plugin-digest beside .plugin-version after a good mirror"
  - "equal-version content changes (and pre-45 mirrors with no marker) re-mirror"
affects: [45-05 runtime-mirror doctor check]

tech-stack:
  added: []
  patterns:
    - "shared allowlist + exclusion filter imported by both the mirror hook and its verifier, so the digest covers exactly the copied set"
    - "fail-safe optional module load with a literal fallback pinned to the module by a test"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/runtime-digest.cjs
    - plugins/devflow/devflow/bin/lib/runtime-digest.test.cjs
  modified:
    - plugins/devflow/hooks/sync-runtime.js
    - plugins/devflow/hooks/sync-runtime.test.js

key-decisions:
  - "The digest hashes `path \\0 bytes \\0` per file over SUBDIRS minus the mirror exclusions, sorted posix paths, no mtimes/perms/absolute paths"
  - ".plugin-version stays the bare version string; the digest lives in its own .plugin-digest file"
  - "The hook loads runtime-digest.cjs from its own plugin tree (__dirname), not CLAUDE_PLUGIN_ROOT"
  - "The bundled digest is computed before any copy, so the marker never claims more than the bundle held when the mirror started"
  - "With no digest available the hook removes any old .plugin-digest so a stale marker cannot vouch for content it did not describe"

patterns-established:
  - "Marker writes (version, then digest) happen only after every subdir swap succeeds, each in its own failure scope"

requirements-completed: [DOC-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-09-30
---

# Objective 45 TRD 03: sync-runtime content digest marker Summary

**sync-runtime now records a sha256 content digest of the bundled runtime in `.plugin-digest`, so a same-version rebuild re-mirrors while the downgrade guard and the bare-semver `.plugin-version` are unchanged.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-30T11:11:42Z
- **Completed:** 2026-09-30T11:18:27Z
- **Tasks:** 2 of 2 (each RED then GREEN)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `runtime-digest.cjs`: one module that both sync-runtime and the 45-05 doctor check use. It exports `SUBDIRS`, `MIRROR_EXCLUDE`, `shouldExclude`, `digestTree(rootDir)`, `readMarkerDigest(targetDir)` and `DIGEST_FILE`. A faithful mirror digests equal to its bundle even with `.plugin-version`, `.plugin-digest`, `state/`, `stacks/` and `backups/` present.
- `sync-runtime.js`: on the equal-version, intact-sentinel path it exits only when the bundled digest equals the marker; otherwise it logs `same version X, content changed; re-mirroring` and mirrors. After all swaps and the `.plugin-version` write it writes `.plugin-digest`.
- Downgrade refusal (Quick 21) is untouched and runs before the digest check: an older plugin never re-mirrors, whatever the digest.
- Fail-safe: if `runtime-digest.cjs` cannot be loaded the hook behaves exactly as before (version-only), verified by running a copy of the hook in a tree that lacks the module.
- Digest cost on the real bundle: `digestTree(devflow/)` = **11.8 ms** (`sha256:278e79e2...59a9`), well under the 1 s budget.

## Task Commits

| Task | Commit | Subject |
|---|---|---|
| 1 RED | c76f1ca | test(45-03): runtime digest contract (RED) |
| 1 GREEN | f86caaf | feat(45-03): shared runtime digest |
| 2 RED | 4040205 | test(45-03): sync-runtime digest marker (RED) |
| 2 GREEN | 2e99d03 | feat(45-03): sync-runtime re-mirrors same-version content changes |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../runtime-digest.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | `node --test .../runtime-digest.test.cjs` | 0 (37/37) | PASS (correct) |
| RED (task 2) | `node --test .../sync-runtime.test.js` (new describe) | 1 (8, 8b, 10, 11, 12b, 15 failed) | FAIL (correct) |
| GREEN (task 2) | `node --test .../sync-runtime.test.js` | 0 (48/48) | PASS (correct) |

Tests 9, 12, 12c and 14 passed in RED by design: they pin behavior that must not change (matching-digest no-op, downgrade refusal, failed mirror leaves markers, fail-safe fallback), so they are regression guards rather than RED drivers.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: runtime-digest.cjs shared module | `node --test plugins/devflow/devflow/bin/lib/runtime-digest.test.cjs` | 0 | PASS |
| 2: sync-runtime uses version + digest | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (per task) | `node --test` on each task's files | 0 | PASS |
| wave | `npm test` (5482 tests: 5422 pass, 10 fail, 50 skipped) | 1 | PASS (only known environmental failures) |

The 10 `npm test` failures are all in `devflow-watch.test.cjs` (foreground daemon start, multi-project start) and `handoff-e2e.test.cjs` (handoff pipeline, LK-1/LK-2). They need the PTY-backed watcher daemon (`watcher-shell.cjs` requires `node-pty`), and this worktree has no `node_modules`. None of them touches `sync-runtime.js` or `runtime-digest.cjs`. Full log: session scratchpad `npm-test-45-03.log`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TRD contradiction: "existing tests pass unchanged" vs "no digest => re-mirror once"**
- **Found during:** Task 2 (RED planning)
- **Issue:** TRD test 13 says every existing test passes unchanged, but test 11 (and the must-have "equal versions with a missing digest -> re-mirror") means a mirror seeded with an equal version and no `.plugin-digest` is now re-mirrored. Four existing "equal version + intact sentinel => no-op, canary kept" cases seed exactly that (Test 2; Quick 21 cases 6 and 16; 36-06 case 18), so they could not both hold.
- **Fix:** Kept the must-have behavior (test 11) and gave those four cases a matching `.plugin-digest` via a new `seedDigest(targetDir, devflowSrc)` helper. Their assertions are unchanged; only the seeded fixture now looks like a current (post-45) mirror.
- **Files modified:** `plugins/devflow/hooks/sync-runtime.test.js`
- **Commit:** 4040205

**2. [Rule 3 - Blocking] Objective 34 drift guard read SUBDIRS from the hook source text**
- **Found during:** Task 2 (anticipated by the TRD's error_recovery note)
- **Issue:** The guard regex `const SUBDIRS = [...]` no longer matches once the hook imports SUBDIRS from the module.
- **Fix:** As the TRD directed, the guard now reads `runtimeDigest.SUBDIRS` with the same assertion (no real `devflow/` subdir absent from the allowlist). To keep the hook's literal fallback from drifting, added test 15, which pins `FALLBACK_SUBDIRS` in the hook to the module's `SUBDIRS`.
- **Files modified:** `plugins/devflow/hooks/sync-runtime.test.js`
- **Commit:** 4040205

### Additions beyond the test list (Rule 2)

- Marker I/O is in its own try/catch, so a digest write error warns (`digest marker skipped`) and never undoes a good mirror or skips the global upgrade.
- When no digest is available the hook removes any stale `.plugin-digest` rather than leaving it.
- Extra tests: 8b (marker equals a digest of what actually landed in the mirror), 12b (newer plugin mirrors and writes the marker), 12c (read-only target: a failed mirror moves neither marker; skipped when running as root), 14 (fail-safe load), 15 (fallback literal pinned).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (digest shape and exclusions, faithful-mirror equality, marker written only after a good mirror with a bare `.plugin-version`, equal-version digest gate, unchanged downgrade refusal, load-failure fallback)
- Gate failures: none attributable to this TRD (10 environmental `node-pty` failures listed above)
- SC3 (change a bundled file without a version bump -> re-mirror): test 10

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/runtime-digest.cjs
- FOUND: plugins/devflow/devflow/bin/lib/runtime-digest.test.cjs
- FOUND: commits c76f1ca, f86caaf, 4040205, 2e99d03 on df/exec-45-03
