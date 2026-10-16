---
objective: 72-install-and-naming-cleanup
trd: "07"
subsystem: runtime
tags: [aoforge-rename, runtime-home, state-migration, repo-key, rekey, shims]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY; compat.cjs runtimeHome/legacyRuntimeHome"
  - phase: 72-04
    provides: "sync-runtime mirrors to ~/.claude/aoforge; the stores' default roots are under ~/.claude/aoforge"
  - phase: 72-06
    provides: "hooks on the compat resolver; sync-runtime.test.js stub-runtime pattern"
  - phase: 72-10
    provides: "coexistence notice (72-21 disables the old plugin right after verifying this migration)"
provides:
  - "bin/lib/runtime-state-migrate.cjs: migrateLegacyRuntime({ userHome, now, fsImpl }) -> { ran, copied, moved, skipped, moved_by_copy, marker }; migrationPending({ userHome }); copyNoClobber(src, dst, { fsImpl, rel }); COPY_ENTRIES; MOVE_ENTRIES; MARKER_FILE (.legacy-state-migrated.json)"
  - "hooks/sync-runtime.js: migrateLegacyRuntimeOnce() after a good mirror and before the fast-path exit when the migration is pending; one `[aoforge] runtime state migration skipped: <msg>` stderr line on error, exit 0, stdout empty"
  - "bin/lib/state-rekey.cjs: keyForPath(p), resolveReal(p), planRekey({ from, to, userHome, env, tmpDir }), applyRekey(plan, { now }), runStateRekey, KEYED_STATE (estimate-run, estimate-history, awareness, hook-markers, outbox, backups, drafts) plus the backups-registry entry"
  - "`aof-tools state rekey --from <old checkout path> [--to <new path>] [--dry-run] [--raw]`: help.cjs details, flag-spec entry (--from, --to, --dry-run), flag-guard PROBES entry"
  - "backup-prune.cjs exports backupsRoot and registryPath"
  - "__fixtures__/legacy-runtime-fixtures.cjs: legacyRuntimeHome({ repoKey, withAoforge }), writeKeyedState(runtimeRoot, key, { projectPath }), LEGACY_FILES, DEFAULT_KEY, HISTORY_FILE"
affects: [72-15, 72-17, 72-21, 72-26]

tech-stack:
  added: []
  patterns:
    - "Runtime state that two plugins could both act on (the outbox) is MOVED, never copied; everything else is copied and the old copy is the backup"
    - "A one-shot SessionStart migration writes its marker last, so a failure part-way retries next session and every step is idempotent (no-clobber copies, per-child moves)"
    - "A keyed-state table takes each directory from the store's own path function and is pinned to the store's per-project path by a test"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
    - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs
    - plugins/aoforge/hooks/sync-runtime.legacy.test.js
    - plugins/aoforge/aoforge/bin/lib/state-rekey.cjs
    - plugins/aoforge/aoforge/bin/lib/state-rekey.test.cjs
  modified:
    - plugins/aoforge/hooks/sync-runtime.js
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/flag-spec.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/flag-guard-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/backup-prune.cjs

key-decisions:
  - "Moves are per child of each MOVE entry (one outbox file, one repository's backup directory, the registry): an existing ~/.claude/aoforge/backups/ never blocks the move, and only a same-named child stays behind (listed in skipped)"
  - "The marker carries moved_by_copy only when an EXDEV fallback happened; the result always carries the array"
  - "keyForPath realpaths the nearest existing ancestor and appends the rest (the TRD's fallback was path.resolve), so a checkout under a symlinked parent (macOS /tmp, /var) keeps its key after it is gone; on /Users paths the two agree"
  - "state rekey merges directories (copies only missing files, action merge) instead of skipping a directory that already exists at the new key, so backups made by the first session in the new checkout do not hide the old ones"
  - "state rekey never copies the outbox `.lock` (it belongs to a live process); the migration moves it with the rest of the outbox"
  - "state rekey follows the state family's output convention: JSON by default, prose plan with --raw"
  - "Planning drafts (<tmpdir>/aoforge-drafts/<key>/) are a KEYED_STATE entry; the planning ledger and drift cache index ride the outbox entry's `<key>.*` match"

requirements-completed: [INST-03, INST-06]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 23min
completed: 2026-10-09
tokens_input: 17091868
tokens_output: 118702
tokens_cache_read: 16845341
tokens_cache_write: 246329
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 07: The runtime home moves to ~/.claude/aoforge, and repo-keyed state can follow a moved checkout Summary

**On the first AOForge session, sync-runtime carries the user's calibration, audit log, transcript index, stack overrides and state (estimate run state and history, awareness, hook markers) from the old runtime home by copying, and moves the store-mode outbox and the backups so no queued GitHub write can be flushed twice; `aof-tools state rekey` copies every repo-keyed state entry from a moved checkout's old key to its new one without deleting or overwriting anything.**

## Progress
- [x] Task 1: Fixture builder: a populated legacy runtime home — a99024be
- [x] Task 2: Runtime state migration and its sync-runtime wiring — 4de991ff (RED), 548f6d9c (GREEN)
- [x] Task 3: `aof-tools state rekey` — c3e4da2a (RED), bad292bf (GREEN)

## What was built

- **Fixture** `legacy-runtime-fixtures.cjs`: `legacyRuntimeHome({ repoKey = 'demo-1a2b3c4d', withAoforge })` builds a realpath'd temp home whose old runtime home holds calibration.json, audit.log, transcript-index.jsonl, stacks/go.md, the keyed state (estimates + history, awareness, hook markers, outbox journal + `.base.json` + `.verb-writes.json` + `.lock`, backups/<key>/2026-10-08/x, backups/.registry.json), locks/, one file in each of the six mirrored subdirs (`bin/` holds the old CLI name) and the old `.plugin-version` and notices file. `withAoforge` pre-creates files (or, with a trailing `/`, directories) under the new home. `writeKeyedState(runtimeRoot, key)` seeds the keyed entries into any runtime root (an existing registry gains the entry).
- **`runtime-state-migrate.cjs`**: `COPY_ENTRIES` = calibration.json, audit.log, transcript-index.jsonl, stacks, state; `MOVE_ENTRIES` = state/outbox, backups (left out of the copy walk). Copies use `COPYFILE_EXCL`, so nothing under `~/.claude/aoforge/` is overwritten; a file or symlink already there is `skipped`. Moves rename child by child; an existing target child stays in the old home and is `skipped`; EXDEV falls back to copy, verify (same `[rel, kind, size]` listing), remove the source, and records `moved_by_copy`. The marker `{ from, at, copied, moved, skipped[, moved_by_copy] }` (sorted) is written last; no old home means `{ ran: false }` and nothing written; a marker means `{ ran: false }` and nothing touched. The module spells no legacy name (paths come from `compat.runtimeHome`/`legacyRuntimeHome`).
- **sync-runtime.js**: `migrateLegacyRuntimeOnce()` loads the module from the hook's own plugin tree (a stub tree without it skips silently), checks `migrationPending` and runs the migration. Call sites: after the digest marker in the good-mirror path, before the global upgrade (a); on the equal-version fast path just before `exit(0)` (b), which also covers the no-digest-module case. Silent on success; one stderr line on any error; never changes the mirror result or exit code. The header comment describes the copy/move split and why.
- **`state-rekey.cjs`**: `keyForPath` (upgrade.repoKey's slug + sha1 formula over `resolveReal`); `KEYED_STATE` with seven entries whose directories come from the stores' own path functions (`estimateRunStore.statePath/historyDir`, `awarenessStore.cacheFile`, `hookMarkerStore.markerDir`, `outbox.journalPath`, each asked for the home's entry with the injected env and home, then `dirname`; `backupPrune.backupsRoot`; `<tmpDir>/DRAFTS_DIR`); the outbox entry matches every `<key>.*` except `.lock`. `planRekey` reads only and gives `{ from, to, from_key, to_key, notes, entries: [{ kind, src, dst, action: copy|merge|skip }] }` plus a `backups-registry` entry when the old key is registered (path = new realpath). `applyRekey` copies with `copyNoClobber`, never deletes, and adds `repos[to_key] = { path, registered_at }` to the registry, keeping the old key. The same key on both sides is an error. `--to` defaults to the project root above the cwd.
- **CLI wiring**: dispatch in the `state` arm of aof-tools.cjs (the TRD's recovery case did not apply: `state` subcommands dispatch there), the header comment, `help.cjs` usage + details, `flag-spec.cjs` `state.subcommands.rekey`, and the `state rekey` probe in `flag-guard-fixtures.cjs` PROBES (flag-guard-cli 15b requires every spec label to be probed).

## Hand-off

- **72-21 (install and dogfood)**: after the first AOForge session, check `~/.claude/aoforge/.legacy-state-migrated.json` and that `state/estimates/devflow-claude-d3dccfe9.json` (the 72 run state) and its `history/` reached the new home, then disable the old plugin straight away. The installed 2.15.0 keeps writing `~/.claude/devflow/` until then, and the migration runs once: an estimate written by the old runtime after the migration stays in the old home. Copies never overwrite, so a re-run (delete the marker) will not refresh a file that is already in the new home. To refresh one, remove that file from the new home first, then delete the marker.
- **72-26 (checkout move)**: `aof-tools state rekey --from ~/dev/devflow-claude --to ~/dev/aoforge-claude --dry-run`, then without `--dry-run`. Running it before or after the first session in the new path works, because directories merge. Run it only once the old checkout is retired: the old key's outbox journal is copied, not moved. The Claude memory directory (`~/.claude/projects/<path slug>/`) is not repo-keyed state and is not in KEYED_STATE.
- **72-15 (doctor)**: the old home can be cleaned up once the old plugin is disabled and the marker exists. The marker's `from` names the old home. After a move, `state/outbox/` and `backups/` are left as empty directories in the old home.
- **72-17 (docs)**: CLAUDE.md (Core Tool "State operations", Hooks "sync-runtime.js") and the user guide do not yet mention the migration, its marker or `state rekey`. `site/data/aoforge.json` was not regenerated.
- **Not carried**: the old home's global notices file (`<old home>/.devflow-notices.json`; the new runtime keeps its own notices file and pending notices are transient) and `state/backtest/` (keyed by calibration hash, not by repo, so it is copied with `state/**`, not rekeyed). `~/.devflow/` (the user dot directory, `gate-interactive`'s pid file) is `compat.userDotFile`'s and 72-12's, not the runtime home.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: legacy runtime home fixture | TRD `node -e "…legacyRuntimeHome()…readdirSync(h.legacy)…cleanup()"` plus a shape check (outbox files, backups, `withAoforge` file and dir, registry content, no leak after cleanup) | 0 | PASS |
| 2: migration + sync-runtime wiring | `node --test runtime-state-migrate.legacy.test.cjs hooks/sync-runtime.legacy.test.js hooks/sync-runtime.test.js` | 0 (61/61) | PASS |
| 3: state rekey | `node --test state-rekey.test.cjs flag-spec.repo.test.cjs dispatch-completeness.test.cjs` (+ help, help-delegation, flag-guard-cli, flag-guard, backup-prune, the migration suites: 118/118) | 0 (30/30) | PASS |
| verification | `env HOME=<empty fake home> node aof-tools.cjs state rekey --from /tmp/old --to /tmp/new --dry-run --raw` printed the plan header and "nothing to copy"; the fake home stayed empty. `rg -n migrateLegacyRuntime hooks/sync-runtime.js` shows the helper calling `rsm.migrateLegacyRuntime` and both call sites (lines 201 fast path, 344 after the mirror) | 0 | PASS |
| repo gates | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs` after the files were tracked | 0 (28/28) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test runtime-state-migrate.legacy.test.cjs hooks/sync-runtime.legacy.test.js` | 1 (module not found; hook tests 8-11 fail on the missing marker) | FAIL (correct) |
| GREEN (Task 2) | same + `hooks/sync-runtime.test.js` | 0 (61 pass) | PASS (correct) |
| RED (Task 3) | `node --test state-rekey.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (Task 3) | `node --test state-rekey.test.cjs flag-spec.repo.test.cjs dispatch-completeness.test.cjs` | 0 (30 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 2) | `node --test '<worktree>/plugins/aoforge/**/!(micro).test.cjs' '<worktree>/plugins/aoforge/**/*.test.js' '<worktree>/scripts/**/*.test.cjs'` | 1: 11,717 tests, 11,655 pass, 51 skipped, 11 fail = node-pty daemon tests (aoforge-watch.test.cjs x5, handoff-e2e.test.cjs x6; the worktree has no node_modules) | PASS (baseline) |
| test (after Task 3) | same | 1: 11,726 tests, 11,665 pass, 51 skipped, 10 fail = node-pty daemon tests (aoforge-watch x3, handoff-e2e x6) + hook-coexistence.test.js `user-slow` case 11 (a user-hook timeout under full-suite load; the file alone is 227/227) | PASS (baseline + flake) |

The E2E1 roadmap-drift baseline did not fail in either run. `npm test` was not run: it includes `micro.test.cjs`, which is excluded as in 72-04 to 72-10.

## Discovered commands

None. The test command came from the stack profile and the TRD. The gate globs were made absolute to the worktree: relative globs from a Bash call run against the main checkout.

## Estimate

`estimate trd 72-07`: 10 min (P90 19 min), $3.72 (P90 $6.01), 3 tasks, confidence medium. `estimate start` was not re-run, because the orchestrator had already started the wave run state. Measured: 23 min (01:34:47Z to 01:57:55Z), over P90. Two full-suite runs (about 4 min each) and the re-run of hook-coexistence account for most of the overrun.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] backup-prune.cjs exports backupsRoot and registryPath**
- **Found during:** Task 3
- **Issue:** KEYED_STATE must take each directory from the store's own path function. backup-prune.cjs did not export its backups root or registry path, and `upgrade.backupDirFor` refuses any probe directory that contains the home.
- **Fix:** Two names added to `module.exports` (no behaviour change; backup-prune.test.cjs 23/23).
- **Files modified:** plugins/aoforge/aoforge/bin/lib/backup-prune.cjs (not in files_modified)
- **Commit:** bad292bf

**2. [Rule 3 - Blocking] `state rekey` probe in flag-guard-fixtures.cjs**
- **Found during:** Task 3
- **Issue:** flag-guard-cli.test.cjs 15b fails unless PROBES covers every FLAG_SPEC label.
- **Fix:** `'state rekey': ['state', 'rekey', '--from', '/nonexistent-probe/old-checkout', '--dry-run']`.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/__fixtures__/flag-guard-fixtures.cjs (not in files_modified)
- **Commit:** bad292bf

**3. [Refactor] copyNoClobber shared from runtime-state-migrate.cjs**
- **Found during:** Task 3
- **Issue:** state-rekey needs the same no-clobber recursive copy. A second copy of the walker would also have been a third copier in the codebase.
- **Fix:** `copyNoClobber(src, dst, { fsImpl, rel })` exported and used by the migration's EXDEV path and by `applyRekey`.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
- **Commit:** bad292bf

### Choices the TRD left open, or where it was inexact

- **Test 11** uses a mode-000 old `state/` directory rather than "an injected env path", so the hook gains no env knob. It is skipped when running as root.
- **Tests added beyond the list**: 7b (EXDEV fallback), 7c (a failure part-way throws and leaves no marker), 12b (KEYED_STATE pinned to every store's per-project path function), 13b (a store env override relocates its entries). Test 9 also deletes a migrated copy and asserts it is not re-copied, and test 10 asserts the fast path did not re-mirror.
- **Test 12** keys `/x/<old repo name>` through `LEGACY.repo`, because state-rekey.test.cjs is not a `*.legacy.test.*` file and the rename guard would flag the literal.
- **Hook helper name**: `migrateLegacyRuntimeOnce` contains `migrateLegacyRuntime`, so the TRD's `rg` verification shows both call sites.
- **Fixture**: `bin/` holds the old CLI file name (`df-tools.cjs`), which is what the old mirror holds, not `bin/aof-tools.cjs` as the TRD sketched. The fixture also adds the old `.plugin-version` and notices file, so test 4 proves they are not carried.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (copy/move split and no-overwrite: tests 1-4, 7, 7b; marker and once-only: 5, 6, 9, 10; sync-runtime call sites and fail-open: 8-11; rekey copy/never-delete/never-overwrite/old path gone: 12-14; help, flag-spec, dispatch: 15 + flag-spec.repo + dispatch-completeness + help.test)
- Gate failures: None beyond the documented baseline (node-pty daemon tests) and one load-timing flake that passes alone

## Self-Check: PASSED

- FOUND: the six created files (fixture, runtime-state-migrate.cjs and its legacy test, sync-runtime.legacy.test.js, state-rekey.cjs and its test)
- FOUND: a99024be, 4de991ff, 548f6d9c, c3e4da2a, bad292bf on df/exec-72-07-runtime-home-move-and-rekey
- Worktree clean after bad292bf; rename-guard and doc-refs repo gates pass with the new files tracked
