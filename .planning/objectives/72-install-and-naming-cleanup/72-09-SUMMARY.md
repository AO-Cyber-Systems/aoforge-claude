---
objective: 72-install-and-naming-cleanup
trd: "09"
subsystem: upgrade
tags: [aoforge-rename, claude-md, managed-block, migrations, global-upgrade, shims]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY (blockTag, product, slug, cli, planningDir, ...)"
  - phase: 72-03
    provides: "scripts/aoforge-rename.cjs PRESERVE.global (the tokens legacy-names.PRESERVE must equal)"
  - phase: 72-05
    provides: "compat.isLegacyPlanning (0014 keeps the legacy planning directory name while the project still uses it)"
  - phase: 72-06
    provides: "sync-runtime test copies the global-upgrade lib closure into a fake plugin root"
provides:
  - "managed-block.cjs reads a block under either the AOFORGE or the legacy START/END tag (regexes built from NAMES.blockTag|LEGACY.blockTag), returns `tag` beside `meta`, renders only AOFORGE, and isStale is true for any legacy-tag block; one block under each tag is the existing `multiple` error"
  - "legacy-rewrite.cjs: rewriteLegacyNames(text, { planningDir = true }), hasLegacyNames(text, opts), diffLines(a, b) (LCS line ops), unifiedDiff(a, b, { fromFile, toFile, context }), PAIRS"
  - "legacy-names.cjs PRESERVE (frozen): devflowops, devFlowOps, DevFlowOps, devflow-desktop, devflow.cloud; equal to the codemod's PRESERVE.global ids (test 12)"
  - "migration 0014-claude-md-rebrand (auto, since 3.0.0): a project CLAUDE.md managed block (markers and body) to AOForge markers and names; changed ['CLAUDE.md']; text outside the block never touched"
  - "templates/global-claude-md.md template_version 4"
  - "global-upgrade: ROUTING_RE accepts both product names; planOutside(text); runGlobalUpgrade returns outside: { lines, diff, applied, backup } and queues KEYS.outside ('global-claude-md-outside'): action while pending, info once applied with confirm"
  - "upgrade-cli --global: JSON carries outside_diff; --raw prints the notice line and the unified diff after the summary"
  - "__fixtures__/legacy-claude-md-fixtures.cjs: globalClaudeMd, handWrittenRoutingClaudeMd, projectClaudeMd, fakeHomeWith, projectWith and the literal pieces"
affects: [72-08, 72-15, 72-17, 72-21, 72-23, 72-25]

tech-stack:
  added: []
  patterns:
    - "A rewrite of user text is computed outside the managed block only, shown as a unified diff in a keyed action notice, and written only on explicit confirm (backup first); the confirmed write supersedes the pending notice under the same key"
    - "A migration that rewrites a managed block runs one rewrite over the block bytes (START through END), then re-reads the result and refuses to write unless exactly one current-tag block sits at the same offset"
    - "Text that names a path keeps the legacy planning directory while the project still lives there, so a deferred directory move never leaves docs pointing at a directory that does not exist"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-rewrite.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
    - plugins/aoforge/aoforge/bin/lib/managed-block.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs
    - plugins/aoforge/aoforge/templates/global-claude-md.md
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs
    - plugins/aoforge/hooks/sync-runtime.test.js

key-decisions:
  - "The outside-block proposal is measured on the text the block step leaves (the update, the creation, the pending adoption's proposal, or the current file), so its diff never contains block lines and the one --confirm the user is told about covers adoption and the outside rewrite together"
  - "A legacy-tag block is always stale (managed-block.isStale), so both the global template step and 0005 move its markers even at the current version"
  - "managed-block.read reports the tag on the block object, not in meta: existing suites deepEqual meta {v, src, legacy}"
  - "PRESERVE is masked case-insensitively, as the codemod masks it; the rewrite also maps the capitalised slug, the upper-case CLI and the article before a renamed name, as the codemod does"
  - "0014 keeps the legacy planning directory name in the block while compat.isLegacyPlanning(root) is true (0012 deferred); once the directory has moved it applies again and rewrites the path"
  - "`upgrade --global` with no write flag stays a dry run (existing semantics): its diff is of the file as the block step would leave it, so the hunk line numbers refer to that text"

requirements-completed: [INST-03, INST-04, INST-06]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 27min
completed: 2026-10-09
tokens_input: 22757943
tokens_output: 121302
tokens_cache_read: 22494253
tokens_cache_write: 263456
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 09: CLAUDE.md blocks: old markers recognised, project blocks migrated, the global file changed only with approval Summary

**The managed block now reads the pre-rename markers and replaces them in place, so the rename can never add a second block. Migration 0014 moves a project's block to the AOForge markers and names automatically. `upgrade --global` bumps the global block to template v4, and shows hand-written text outside the block as a unified diff that is written only with `--confirm`.**

## Progress
- [x] Task 1: Fixture builder: legacy CLAUDE.md shapes; PRESERVE in legacy-names — 7ca9b197
- [x] Task 2: legacy-rewrite, managed-block dual markers, migration 0014 — 120812b6 (RED), 883b1a46 (GREEN)
- [x] Task 3: Global template v4 and diff-then-confirm for outside text — 088569df (RED), 781575c4 (GREEN)
- [x] Deviation (Rule 2): 0014 keeps the legacy planning directory name while the project still uses it — 0ad8e898 (RED), 05373f10 (GREEN)

## What was built

- **Dual markers** (`managed-block.cjs`). `START_RE`, `END_RE` and `SINGLE_START_RE` are built from a capturing alternation of `NAMES.blockTag` and `LEGACY.blockTag`.
  - `read` returns `tag` beside `meta`.
  - `render` writes only `NAMES.blockTag`, so `upsert` over a legacy block replaces it in place under AOFORGE markers.
  - `isStale` is true for any legacy-tag block.
  - A legacy block plus an AOFORGE block throws the existing `multiple AOFORGE blocks` error, which 0005's test matches.
  - The module now requires `legacy-names.cjs` and `text-escape.cjs`. Neither requires anything.
- **`legacy-rewrite.cjs`**. The rewrite masks PRESERVE case-insensitively, fixes the article ("a" before a renamed name becomes "an"), then applies the pairs longest first and unmasks.
  - The pairs are every key NAMES and LEGACY share, plus the capitalised slug and the upper-case CLI.
  - The planning directory is bounded: no identifier character on either side. `{ planningDir: false }` skips it.
  - `diffLines` is an LCS over the lines between the common prefix and suffix. `unifiedDiff` prints `---`/`+++`/`@@` hunks with 3 lines of context. No legacy name is spelled in the module, and it adds no dependency.
- **`legacy-names.PRESERVE`**: frozen, five tokens. It equals the codemod's `PRESERVE.global` ids case-insensitively, and each token is matched whole by its codemod pattern (test 12, skipped in a mirror install).
- **Migration 0014** (auto, since 3.0.0). It locates the block with `managed-block.read` and runs `rewriteLegacyNames` over the block bytes, START through END.
  - The `v=`/`src=` attributes are kept as written, and so is the text of an unversioned marker.
  - It re-reads the result and throws (nothing written) unless one AOFORGE block sits at the same offset.
  - Text outside the block is byte-identical. `changed` is `['CLAUDE.md']`.
  - It does not apply with no CLAUDE.md, with no block, with a malformed block (the reason names it), or when nothing is left to map.
  - While the project still has only the legacy planning directory, that name stays in the block.
- **Global template v4**. The body was already AOForge after the codemod: `/aoforge:` routing, `aoforge@aocyber`, `aoforge/adopt`. `ROUTING_RE` accepts "AOForge Routing" and the heading under the old product name.
- **Diff-then-confirm** (`global-upgrade.cjs`). `planOutside(text)` rewrites every byte outside the block and copies the block bytes. `runGlobalUpgrade` returns `outside: { lines, diff, applied, backup }`.
  - Without `confirm`: the block step behaves as before (template bump, backup, no confirmation), and one `action` notice (`global-claude-md-outside`) names `aof-tools upgrade --global --confirm`, with the diff as its detail.
  - With `confirm`: the outside rewrite is written in the same write as the block (backup first), and an `info` notice under the same key supersedes the pending one.
  - sync-runtime never passes `confirm`.
- **CLI** (`upgrade-cli.cjs`). JSON output carries `outside_diff`. `--raw` adds the notice line and the unified diff after the one-line summary. `--global` alone is still a dry run.

Run by hand on a fake HOME holding the fixture (`HOME=<fake> node plugins/aoforge/aoforge/bin/aof-tools.cjs upgrade --global --raw`):

```
legacy: none; CLAUDE.md block: updated; check only; nothing written
1 hand-written line(s) outside the managed block still name the old product. Nothing outside the block changes until you run `aof-tools upgrade --global --confirm` (a backup is kept).
--- ~/.claude/CLAUDE.md
+++ ~/.claude/CLAUDE.md (proposed)
@@ -35,7 +35,7 @@
...
-DevFlow's intent model splits testing rigor by project kind; its defaults table is `~/.claude/devflow/references/defaults-table.md`.
+AOForge's intent model splits testing rigor by project kind; its defaults table is `~/.claude/aoforge/references/defaults-table.md`.
```

The file was byte-identical afterwards and no backups directory was created.

## Hand-off

- **72-23 (global rollout)**: run `aof-tools upgrade --global --raw` to preview the change. Then run `--global --apply`, which moves the v3 legacy block to v4 with a backup and no confirmation. Run `--global --raw` again: once the block is current, the diff's line numbers match the real file. Show that diff to the user, and only after approval run `--global --confirm`. The `devflowops` mention in the Import Paths section is preserved. The real file is not read by any test.
- **72-17 (docs)**: document migration 0014, the dual markers and the outside-block diff/confirm in the user guide, the migration guide and the CLAUDE.md Upgrade bullet. CLAUDE.md was not edited here, to avoid a parallel-wave merge conflict.
- **72-15 (doctor)**: a leftover legacy-tag block can be detected with `managedBlock.read(text).tag === LEGACY.blockTag`.
- **72-08**: 0014 does not depend on 0012 having run. While `compat.isLegacyPlanning(root)` it keeps the legacy planning directory name, and the next run after the move rewrites it.
- **72-25 (fleet sweep)**: the SessionStart upgrade applies 0014 automatically. A project's own hand-written CLAUDE.md text outside the block keeps its old wording, by design.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + PRESERVE | `node -e "…globalClaudeMd().split('\n').length…"` (35 lines; project 19; PRESERVE frozen) && `node --test legacy-names.legacy.test.cjs rename-guard.repo.test.cjs` | 0 (18/18) | PASS |
| 2: legacy-rewrite, dual markers, 0014 | `node --test legacy-rewrite.legacy.test.cjs managed-block.legacy.test.cjs managed-block.test.cjs migrations/0014-claude-md-rebrand.legacy.test.cjs migrations/0005-claude-md-block.test.cjs` (+ 0007, regex-escape, sync-runtime, rename-guard) | 0 (64/64, then 132/132 after the escape fix) | PASS |
| 3: template v4, diff-then-confirm | `node --test global-upgrade.legacy.test.cjs global-upgrade.test.cjs upgrade-cli.test.cjs` (+ sync-runtime, regex-escape, rename-guard) | 0 (108/108) | PASS |
| deviation: legacy planning dir | `node --test` all TRD verify suites + sync-runtime | 0 (141/141) | PASS |
| verification | `HOME=<fake> aof-tools upgrade --global --raw` prints the diff, file unchanged; `rg -n "blockTag" managed-block.cjs` shows both tags in the regex source (line 38) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test legacy-rewrite.legacy.test.cjs managed-block.legacy.test.cjs migrations/0014-claude-md-rebrand.legacy.test.cjs` | 1 (6 fail: the two modules missing; managed-block 6, 7, 7b, 8 fail on the unrecognised legacy markers) | FAIL (correct) |
| GREEN (Task 2) | same + managed-block.test, 0005, 0007 | 0 (64 pass) | PASS (correct) |
| RED (Task 3) | `node --test global-upgrade.legacy.test.cjs` | 1 (6 fail: template v3, no `outside`, the old routing heading not recognised) | FAIL (correct) |
| GREEN (Task 3) | same + global-upgrade.test, upgrade-cli.test, sync-runtime | 0 (108 pass) | PASS (correct) |
| RED (deviation) | `node --test legacy-rewrite.legacy.test.cjs migrations/0014-claude-md-rebrand.legacy.test.cjs` | 1 (11d2 and 9d fail) | FAIL (correct) |
| GREEN (deviation) | all TRD verify suites | 0 (141 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 1) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 1: 11,704 tests, 11,642 pass, 51 skipped, 11 fail, all daemon tests that need node-pty (absent in a worktree) | PASS (baseline) |
| test (Task 2, first run) | same | 1: 11,722 tests, 11 fail = daemon + E2E1 + regex-escape repo gate (hand-rolled escape in the two new modules; fixed before the GREEN commit) | fixed |
| test (Task 2, rerun) | same | 1: 11,728 tests, 18 fail = 10 daemon + E2E1 + the 6 uncommitted Task 3 RED tests | PASS (baseline) |
| test (after Task 3) | same | 1: 11,728 tests, 11,666 pass, 51 skipped, 11 fail = 10 daemon + E2E1 | PASS (baseline) |
| test (final) | same | 1: 11,730 tests, 11,668 pass, 51 skipped, 11 fail = 10 daemon + E2E1 | PASS (baseline) |

E2E1 is the known baseline: roadmap drift from a SUMMARY that exists in the worktree before `roadmap update-job-progress` runs. `npm test` was not run because it includes `micro.test.cjs` (excluded per the dispatch).

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Estimate

`estimate trd 72-09`: 10 min (P90 19 min), $3.79 (P90 $6.14), 3 tasks, confidence low. `estimate start` was not re-run, because wave 7's run state was already started by the orchestrator. Measured: 27 min.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The regex-escape repo gate rejected two hand-rolled escapes**
- **Found during:** Task 2 full-suite gate
- **Issue:** `regex-escape.repo.test.cjs` (TRD 56-01) allows one regex escape, `text-escape.cjs`. The first versions of managed-block.cjs and legacy-rewrite.cjs each carried their own escape.
- **Fix:** both use `require('./text-escape.cjs').escapeRegExp`. The sync-runtime test copies text-escape.cjs into its fake plugin root.
- **Files modified:** managed-block.cjs, legacy-rewrite.cjs, hooks/sync-runtime.test.js
- **Commit:** 883b1a46

**2. [Rule 3 - Blocking] The sync-runtime and global-upgrade suites pinned the old closure and version**
- **Found during:** Tasks 2 and 3
- **Issue:** `hooks/sync-runtime.test.js` copies global-upgrade's dependency closure into a fake plugin root and pinned `v=3`. `global-upgrade.test.cjs` tests 4, 13 and 14 and `upgrade-cli.test.cjs` also pinned `v=3` or the allowed requires.
- **Fix:** the copy list adds `text-escape.cjs` and `legacy-rewrite.cjs`. The START markers read the version from the template (the TRD's recovery note). Test 13 asserts `'4'`, and test 14 allows `./legacy-rewrite.cjs`, `./legacy-names.cjs` and `./text-escape.cjs`. Neither sync-runtime.test.js nor the two existing suites is in `files_modified`.
- **Commits:** 883b1a46, 781575c4

**3. [Rule 2 - Correctness] 0014 kept the block consistent with a deferred directory move**
- **Found during:** after Task 3, while reviewing 72-08's 0012 contract
- **Issue:** 0012 defers the `.planning` to `.aoforge` move on a dirty tree or mid-merge and writes nothing, but 0014 would still rewrite the block's planning path. The project's CLAUDE.md would then point at a directory that does not exist.
- **Fix:** `rewriteLegacyNames(text, { planningDir })`. 0014 passes `!compat.isLegacyPlanning(root)` and applies again once the directory has moved. Tests 9d and 11d2 cover it.
- **Files modified:** legacy-rewrite.cjs, migrations/0014-claude-md-rebrand.cjs and their tests
- **Commits:** 0ad8e898 (RED), 05373f10 (GREEN)

### Additions beyond the test list (no behaviour removed)

- `managed-block.isStale` is true for a legacy-tag block at the current version (test 7b). Without it, a v4 legacy-tag block could stay under the old markers.
- `read` returns `tag` on the block object.
- The rewrite maps the capitalised slug, the upper-case CLI and the article, as the codemod does (11b).
- The fixture also exports `handWrittenRoutingClaudeMd(heading)` and `projectWith(text)`. `legacy-names.legacy.test.cjs` needed no change.

## Post-TRD Verification

- Auto-fix cycles used: 2 (regex-escape gate; the sync-runtime closure)
- Must-haves verified: 5/5 truths, 3/3 artifacts, 2/2 key links (`rg -n blockTag managed-block.cjs` line 38; `rewriteLegacyNames` in global-upgrade.cjs planOutside)
- Gate failures: none beyond the baseline (daemon/node-pty, E2E1)

## Self-Check: PASSED

- Files: the 7 created files and the 8 modified files listed in key-files exist in the worktree; `templates/global-claude-md.md` holds `template_version: "4"`.
- Commits on `df/exec-72-09-claude-md-markers-and-global-block` since 412dcca3: 7ca9b197, 120812b6, 883b1a46, 088569df, 781575c4, 0ad8e898, 05373f10 (all FOUND); the worktree is clean.
- Tests 1-12 plus 7b, 9b-9d, 10b and 11d2 pass. The existing managed-block, 0005, 0007, global-upgrade, upgrade-cli and sync-runtime suites pass. The final full suite is at baseline (10 daemon tests that need node-pty, plus E2E1).
- The real `~/.claude/CLAUDE.md` was never read or written: every test uses a temp home with HOME fenced, and the manual check ran with HOME set to a scratchpad directory.
