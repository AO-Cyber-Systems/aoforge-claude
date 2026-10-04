---
objective: 46-github-sync-foundations
trd: "06"
subsystem: github-sync
tags: [frontmatter, sync-state, gh-pull, conflict, objective-id, gh-client]
requires: ["46-01", "46-02"]
provides:
  - "frontmatter.setFrontmatterField(filePath, key, value, opts) -> {ok, changed, conflict?, existing?, warning?, error?}"
  - "sync-state keys normalised to objective ids (readSyncState / recordSync / getLastSync)"
  - "gh pull on resolveObjective + mapping v3 (read-only) + resolveRepo + requireEnabled + gh-client seam"
affects: ["46-07"]
tech-stack:
  added: []
  patterns:
    - "byte-exact single-line frontmatter setter (no extract/reconstruct round trip)"
    - "lazy require of gh-mapping inside sync-state (gh-mapping requires sync-state at top: a top-level require is a cycle)"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/devflow/bin/lib/sync-state.cjs
    - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-pull.cjs
    - plugins/devflow/devflow/bin/lib/gh-pull.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/conflict.cjs
    - plugins/devflow/devflow/bin/lib/conflict.test.cjs
key-decisions:
  - "gh-pull owns no gh spawn site: _setRunGh installs on gh-client; the gh.cjs auth bridge now forwards to gh-client's _runGh wrapper"
  - "Pull reads the mapping with readMappingV3WithReport so a mapping newer than v3 (error) and per-objective conflicts are reported instead of being misreported as 'no GitHub issue'"
  - "A bare `key:` counts as absent for setFrontmatterField; replacing a key that holds a block list also removes the orphaned continuation lines"
requirements-completed: [GSF-01, GSF-04, GSF-08]
duration: ~29 min
completed: 2026-09-30
---

# Objective 46 TRD 06: Pull, sync-state and conflict resolution on one objective id

`gh pull 2`, `pull 02-a` and `pull 002` now resolve to one objective id and directory, read the same v3 mapping entry and the same sync-state baseline push records, honour `github.enabled`, go through the gh-client seam, and write frontmatter with a new comment-preserving `setFrontmatterField`.

## Commits

| Commit | Message |
|---|---|
| 6fbe4af | test(46-06): failing tests for setFrontmatterField and id-normalised sync-state keys (RED) |
| 81e6c92 | feat(46-06): setFrontmatterField and objective-id sync-state keys (GREEN) |
| c792e7b | test(46-06): failing tests for gh pull on objective ids ... (RED) |
| 29e0af1 | feat(46-06): gh pull on one objective id, mapping v3, resolveRepo, enabled gate and gh-client seam (GREEN) |
| 5ae5e07 | test(46-06): regression guard for conflict resolvers on dir paths with id-keyed sync-state |
| f014c64 | docs(46-06): document that conflict resolvers take the objective dir and sync-state keys by id |

## What changed

- **`setFrontmatterField`** (`frontmatter.cjs`): finds the first `---` block, replaces or appends one `key: value` line, splices back at the same offsets. Comments, key order, blank lines, CRLF and the body survive byte for byte; the file is written only when content changes (equal value leaves bytes and mtime alone). `ifAbsentOrEqual` reports `conflict` instead of overwriting a different value. No frontmatter returns `{ok:true, changed:false, warning}`; a missing file returns `{ok:false, error}`. Keys are regex-escaped; a newline in key or value is refused.
- **sync-state**: `readSyncState` passes objectives through `gh-mapping.normalizeSyncStateKeys` (newest `last_synced_at` wins when `02-a` and `2` both exist); `recordSync` / `getLastSync` key through `toObjectiveId`. `writeSyncState` unchanged (`version: 1`). A file written by an older version is merged in memory on read and rewritten with only id keys on the next `recordSync`.
- **`cmdGhPull`**: usage/flag checks, then `requireEnabled` (skipped returns `{ok:false, skipped:true, reason}`, exit 0, zero gh calls including auth), then `resolveObjective` (unknown returns `objective not found: <arg>`, exit 1), then the existing gh.cjs auth bridge, then read-only `readMappingV3WithReport` + `getEntry(resolved.id)`, then `issueRef = ${gate.repo}#${issue_id}` (repo from config `github.repo`, then PROJECT.md `github_repo`). `resolved.dir` builds every OBJECTIVE.md path and is passed to the conflict resolvers as `objectiveId`; sync-state calls use `resolved.id`. The missing-mapping message is now "has no GitHub issue. Run `df-tools gh sync <id>` first".
- **`applyDrift`** writes each drifted field through `setFrontmatterField` (same `{ok, applied}` shape).
- **`conflict.cjs`**: no logic change. Header comments now state that resolver `objectiveId` is the objective directory and that sync-state normalises it to the id. There was no `gh sync-objectives` text in `conflict.cjs` to change.
- **Fixture**: `buildTempProject` accepts `{githubEnabled = true, repo = 'o/r'}` and writes `.planning/config.json` (`repo: null` omits the config repo so PROJECT.md is the source).

## Deviations from Plan

**1. [Rule 1 - Bug] Existing tests that encoded defects, changed**
- `sync-state.test.cjs` S2, R1, R3, R4 read `objectives['21-foo']` (dir-name key); now read `'21'` (the id key). S2 still seeds the dir-name key on disk, which proves lazy normalisation.
- `gh-pull.test.cjs` C2 title and regexp (`/no GitHub issue|sync-objectives/` to `/no GitHub issue/`): the hint is now `gh sync <id>`.
- No test encoded the PROJECT.md-only repo or pull-with-github-disabled defects directly; the fixture now enables github so existing assertions keep their meaning.

**2. [Rule 2 - Missing critical] Setter hardening beyond the TRD text**: CRLF line endings preserved; an empty `---\n---` block gets the key; replacing a key whose old value is a block list removes the orphaned `- item` lines (otherwise invalid YAML); newline in key/value refused; closing fence must be on its own line. Covered by tests F3b, F4b, F8-F11.

**3. [Rule 2] `readMappingV3WithReport` instead of `readMappingV3`** in pull, so a too-new mapping (`error`) and per-objective conflicts produce an accurate message rather than "no GitHub issue".

**4. TRD said to wrap `normalizeSyncStateKeys` so unparseable keys are kept verbatim.** It already keeps them (gh-mapping 46-02), so there is no wrapper; test 4 passes and guards it.

**5. Task 3 needed no production change** (test 13 passed after Tasks 1-2). The test was committed as a regression guard (plus a `resolveDisk` live-require guard, 13b) and the header comments updated.

**6. gh-pull's local spawn site removed.** The TRD said to keep a local runner and mirror it onto gh-client; I made gh-client the only seam (`_setRunGh(fn)` calls `ghClient._setRunGh(fn)`), which satisfies "installs fn on the gh-client seam" and removes a second `spawnSync('gh')`.

**7. SUMMARY filename** is `46-06-pull-syncstate-rewire-SUMMARY.md` as instructed by the dispatch (the TRD `<output>` names `46-06-SUMMARY.md`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: setFrontmatterField + id-keyed sync-state (F1-F7, 1-4) | `node --test frontmatter.test.cjs sync-state.test.cjs` | 0 (59/59) | PASS |
| 2: gh pull rewire (5-12) | `node --test gh-pull.test.cjs` | 0 (28/28 incl. 6b) | PASS |
| 3: conflict resolvers (13) | `node --test conflict.test.cjs gh-pull.test.cjs sync-state.test.cjs` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test frontmatter.test.cjs sync-state.test.cjs gh-pull.test.cjs conflict.test.cjs` | 0 (114/114) | PASS |
| grep | `rg "readMappingV2\|projectFm.github_repo\|spawnSync" gh-pull.cjs` | no matches | PASS |
| grep | `rg "sync-objectives" gh-pull.cjs conflict.cjs` | no matches | PASS |
| neighbours | gh-mapping, migrations/0009, gh.test | 222 pass, 0 fail (after Task 1) | PASS |

## TDD Evidence

RED commits (6fbe4af, c792e7b) preceded GREEN (81e6c92, 29e0af1). RED runs: frontmatter F-tests failed with `setFrontmatterField is not a function`; sync-state tests 1-3 failed (4 already held); gh-pull tests 5-12 failed (8 failures). Test 13 was green on arrival (expected by the TRD).

## Full suite

`NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test`: 6026 tests, 5991 pass, 2 fail, 32 skipped.
- **MA-7** (doctl auth init): accepted baseline.
- **J1 `tui --once --raw`**: `spawnSync ETIMEDOUT` (10 s) under full-suite load. `tui.cjs` / `tui.test.cjs` are not touched by this TRD (empty diff against the wave base); an isolated rerun of `tui.test.cjs` was intermittent (3 failures once, none on the next run). Environmental timing, not caused by 46-06.
- **X2 "no lib/ module outside tests reads `__fixtures__`"** is marked `# enabled by 46-07` and is listed separately from the fail count; `rg` shows `gh.cjs` among the non-test modules that mention `__fixtures__`. Not touched here.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (id-keyed sync-state, three spellings resolve identically, mapping via gh-mapping + resolveRepo, disabled skips with zero calls, setter byte-exactness, `ifAbsentOrEqual` conflict, `applyDrift` via setter, `_setRunGh` on the client seam)
- Gate failures: None

## Notes for 46-07

- **Setter contract:** the caller serialises `value` (written verbatim after `key: `). `github_issue` is `owner/repo#N`, unquoted. Check `r.conflict` (with `{ifAbsentOrEqual:true}`) and `r.warning` (file has no frontmatter block; `ok` is still true, `changed:false`).
- **Auth bridge still present** in `cmdGhPull`: it calls `gh.requireGhAuth(['repo'])` and sets `gh._setRunGh((...a) => ghClient._runGh(...a))` on every invocation. Delete it when gh.cjs moves onto gh-client.
- **`resolveDisk` passes the objective DIR** to `gh.cmdGhSyncObjective(cwd, dir, true)`; the 46-07 version must accept any spelling (resolve it with `resolveObjective`).
- **Pull's missing-mapping hint** says `df-tools gh sync <id>`; that command must exist after 46-07.
- **sync-state records** written by push must key by objective id (passing the ROADMAP number or dir name both work now, since `recordSync` normalises).
- **Fixtures:** `gh-pull-fixtures.buildTempProject` now writes an enabled config with repo `o/r`; pass `repo: null` to test the PROJECT.md fallback, `githubEnabled: false` for the skip path. `sync-state-fixtures.buildTempProjectWithObjective` was not changed (it writes no config; its only users do not call `cmdGhPull`).
- **Skipped output shape:** `{ok:false, skipped:true, reason}`, exit 0 (raw JSON or prose).

## Self-Check: PASSED

All nine files in `files_modified` exist and were committed; commits 6fbe4af, 81e6c92, c792e7b, 29e0af1, 5ae5e07, f014c64 are in the branch log.
