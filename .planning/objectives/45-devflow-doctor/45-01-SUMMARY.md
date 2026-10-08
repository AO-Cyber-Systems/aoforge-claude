---
objective: 45-devflow-doctor
job: 45-01
trd: "01"
subsystem: awareness
tags: [awareness, runtime-state, out-of-tree-cache, hooks, tdd]

requires: []
provides:
  - "awareness-store.cjs: builtins-only, atomic, per-repo out-of-tree awareness cache"
  - "readCache/writeCache and init preview and the populate hook all route through the store"
  - "store.listEntries / pruneStale({orphans}) / totalSize for doctor check 31-awareness-state (45-07)"
affects: [45-06 legacy-runtime-state check, 45-07 doctor awareness-state check, 45-09 docs/CHANGELOG]

tech-stack:
  added: []
  patterns:
    - "Runtime state lives under ~/.claude/devflow/state/<domain>/ with an env override for tests (mirrors progress-guard-store, quick-25)"
    - "Store modules loaded from hooks require node builtins only and fail open"
    - "Root-level node:test beforeEach/afterEach set and restore a throwaway state-dir env for a whole file"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/awareness-store.cjs
    - plugins/devflow/devflow/bin/lib/awareness-store.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs
    - plugins/devflow/hooks/awareness-cache-populate.js
    - plugins/devflow/hooks/awareness-cache-populate.test.js
    - plugins/devflow/skills/awareness/SKILL.md
    - plugins/devflow/skills/tui/SKILL.md
    - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs

key-decisions:
  - "No fallback read of the legacy in-tree .planning/.awareness-cache.json: it is dead state, a project with only the legacy file reads as 'no cache'"
  - "AWARENESS_CACHE_REL export kept (same name, legacy path) so the awareness.cjs export surface lock (L1) and migration/doctor can still name the dead file"
  - "init._buildAwarenessPreview wraps the awareness.cjs require in try/catch so a broken awareness.cjs can never break init (fail open)"
  - "repoKey is re-implemented in the store (never throws, falls back to path.resolve) and a test asserts it equals upgrade.repoKey"

requirements-completed: [DOC-01]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~50min
completed: 2026-09-30
tokens_input: 13087344
tokens_output: 64733
tokens_cache_read: 12872654
tokens_cache_write: 214512
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 01: Awareness cache leaves the repo Summary

**The cross-repo awareness cache now lives at `~/.claude/devflow/state/awareness/<repo-key>.json` (override `$DEVFLOW_AWARENESS_DIR`) behind a builtins-only atomic store, and the SessionStart hook, `df-tools awareness`/`tui`/`init` no longer create or read anything under `.planning/` for it.**

## Files changed

| File | Change |
|---|---|
| `bin/lib/awareness-store.cjs` (new) | `stateDir(env, home)`, `repoKey`, `cacheFile(root, {env, home})`, `readEntry`, `writeEntry` (atomic `<file>.<pid>.tmp` + rename), `listEntries`, `pruneStale(dir, now, ttl, {orphans})`, `totalSize`, `LEGACY_CACHE_REL`. Requires only fs/os/path/crypto (a test asserts it). |
| `bin/lib/awareness.cjs` | `readCache` reads `store.readEntry(store.cacheFile(cwd))` and returns only `{peer, org}`; `writeCache` merges then writes `{project: realpath, updated, ...merged}`; no longer creates `.planning/`. `AWARENESS_CACHE_REL` kept as the legacy path only. |
| `bin/lib/init.cjs` | `_buildAwarenessPreview` reads via `awareness.readCache`; parse-warning branch dropped (`warning` slot is always null). |
| `hooks/awareness-cache-populate.js` | `_readCache(cwd, env)` reads the store; `CACHE_REL` dropped; env passed to the child spawn unchanged. Still gated on `.planning/` existing. |
| `skills/awareness/SKILL.md`, `skills/tui/SKILL.md` | Every mention of the in-tree cache path replaced with the store path; the `@.planning/.awareness-cache.json` execution_context lines removed. |
| Tests | `awareness-store.test.cjs` (28 tests); `awareness.test.cjs` Groups C/W rewritten plus C6/C6b/C7/W5b/W7/W8 and an env-isolation guard; `init.test.cjs` fixture seeds the store, plus 18I11-18I14; `awareness-cache-populate.test.js` H5-H7 seed via the store, plus H9-H13; `initiatives-cli.test.cjs` I2 isolated. |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: awareness-store.cjs | `node --test bin/lib/awareness-store.test.cjs` | 0 (28/28) | PASS |
| 2: reroute awareness.cjs + init | `node --test awareness.test.cjs init.test.cjs awareness-cli.test.cjs` | 0 (190 tests, 181 pass, 9 skipped, 0 fail) | PASS |
| 3: hook + skills + isolation sweep | `node --test awareness-cache-populate.test.js tui.test.cjs help-delegation.test.cjs org-awareness.test.cjs initiatives-cli.test.cjs` | 0 (hook 16/16; tui, help-delegation, org-awareness, org-awareness-cli, awareness-cli: 289 tests, 283 pass, 6 skipped, 0 fail; initiatives-cli 21/21) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test awareness-store.test.cjs` | 1 (MODULE_NOT_FOUND) | FAIL (correct) — commit 6b56418 |
| GREEN (task 1) | same | 0 (28/28) | PASS (correct) — commit 6a8350d |
| RED (task 2) | `node --test awareness.test.cjs init.test.cjs` | 1 (C3/C4/C6/C6b/C7, W1-W7, CT3, 18I5/18I9/18I11/18I12/18I14 failing) | FAIL (correct) — commit d0f0642 |
| GREEN (task 2) | `node --test awareness.test.cjs init.test.cjs awareness-cli.test.cjs` | 0 | PASS (correct) — commit 5fca0ee |
| RED (task 3) | `node --test awareness-cache-populate.test.js` | 1 (H5, H6, H10, H11, H13 failing) | FAIL (correct) — commit 41c82c9 |
| GREEN (task 3) | same, plus the sweep set | 0 | PASS (correct) — commit 6c88332 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (per task) | `node --test` on each task's verify files | 0 | PASS |
| wave | `npm --prefix <worktree> test` | 1 (10 failures, all pre-existing devflow-watch / handoff-e2e daemon tests) | PASS (only known failures) |

## Isolation sweep and real-home canary

Files that needed the isolation env:

- **`awareness.test.cjs`** and **`init.test.cjs`**: file-level (root) `beforeEach`/`afterEach` set `DEVFLOW_AWARENESS_DIR` to a fresh temp dir and restore the previous value. The init integration tests spawn `df-tools` via `execSync`, which inherits `process.env`, so the children are covered too.
- **`awareness-cache-populate.test.js`**: each test builds its own state dir and passes it in the `env` handed to `_main`.
- **`initiatives-cli.test.cjs`** (I2): spawns `df-tools awareness scan-peer --no-fetch`, which calls `writeCache`. The child env now carries a throwaway `DEVFLOW_AWARENESS_DIR`.

Files inspected and left unchanged (they never write the awareness cache): `tui.test.cjs` (reads only; its fallback runs `scanPeer` without persisting), `help-delegation.test.cjs` (`--help` paths change nothing), `org-awareness.test.cjs`, `org-awareness-cli.test.cjs`, `awareness-cli.test.cjs`, `dup-detect*`, `roadmap-reconcile*`, `check-todos*`, `config`, `initiatives`, `upgrade-project`, migration 0008 tests. After running all of them, the real-home listing stayed absent.

**Canary result:** `~/.claude/devflow/state/awareness` did not exist before the work and does not exist now. It did appear once mid-task: the first run of `initiatives-cli.test.cjs`, before I2 was isolated, wrote one entry (`45-01-6dbf1592.json`, `project` = this worktree). That is precisely the leak the sweep exists to catch. I fixed I2, removed that single artifact and rmdir'd the empty directory it had created (both verified as produced by my own run), and re-ran: the listing stays absent.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Fail-open require in `init._buildAwarenessPreview`**
- **Found during:** Task 2
- **Issue:** The TRD routes the preview through `awareness.readCache`. `init.cjs` already guards `awareness.cjs` loading with `_awarenessLoadable()` because a broken module must not break init; a bare `require` in the preview would have thrown.
- **Fix:** Wrapped the require/readCache call in try/catch returning `{line: null, warning: null}`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/init.cjs`
- **Commit:** 5fca0ee

**2. [Rule 3 - Blocking] `initiatives-cli.test.cjs` I2 needed isolation**
- **Found during:** Task 3 sweep (canary caught a real write to `~/.claude`)
- **Fix:** described above. The TRD listed this file as a known candidate.
- **Commit:** 6c88332

**3. Test-plan additions beyond the TRD list (not deviations in behavior):** extra tests for `stateDir` empty-override/no-home, `repoKey` fallback for a missing path, `cacheFile` with `{home}`, unwritable-destination `writeEntry`, W5b/W7/W8, and hook H12/H13.

Otherwise the TRD executed as written. No auth gates. `awareness-cli.cjs` and `tui-cli.cjs` needed no edits (signatures unchanged). This repo's own in-tree `.planning/.awareness-cache.json` was left alone (doctor 45-06 owns cleanup). `hooks.json`, `CLAUDE.md`, `CHANGELOG.md`, migration 0008, STATE.md and ROADMAP.md were not touched.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (store path contract, repo-key parity with `upgrade.repoKey`, readCache/writeCache signatures and merge semantics, legacy file ignored, hook decides from the out-of-tree file and creates nothing under `.planning/`, init preview reads the store, no test writes the real `~/.claude/devflow/state/awareness`)
- Verification scan: `rg "'.planning'.*awareness|awareness-cache.json"` on the hook and `init.cjs` finds only comments; across the non-test plugin tree the path appears only in the store's `LEGACY_CACHE_REL`, `awareness.cjs`'s legacy constant, migration 0008, `upgrade-fixtures.cjs`, comments and one SKILL.md sentence that says the legacy file is dead.
- Gate failures: none new — the 10 wave-gate failures are the known pre-existing daemon tests (see "Wave gate")

## Self-Check: PASSED

- Created files present: `awareness-store.cjs`, `awareness-store.test.cjs`, this SUMMARY.
- Commits present on `df/exec-45-01`: 6b56418, 6a8350d, d0f0642, 5fca0ee, 41c82c9, 6c88332.

## Wave gate

`npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/45-01 test` (full suite, run from the worktree): 5480 tests, 5420 pass, 10 fail, 50 skipped.

All 10 failures are the known pre-existing daemon-environment set (devflow-watch start/multi-project and the handoff-e2e pipeline; the daemon never writes its PID file here). None touch awareness code. No MA-7 doctl failure appeared this run.

| Suite | Failing tests |
|---|---|
| `devflow-watch start (foreground) + stop` | 3 |
| `devflow-watch multi-project CLI (TRD 20-03)` | 1 (C-1) |
| `handoff pipeline — end-to-end` | 6 (4 pipeline cases, LK-1, LK-2) |

I did not re-run the suite at the base commit to diff the failure list; the classification rests on the failing suites matching the allowed set named in the TRD and on the assertion text (`PID file should be created`).

After the full suite the real-home canary was still clean (`~/.claude/devflow/state/awareness` absent).

End-to-end smoke (temp project, `DEVFLOW_AWARENESS_DIR` set): a real `df-tools awareness scan-peer --no-fetch` wrote `<slug>-<hash8>.json` into the state dir and left the project's `.planning/` empty.
