---
objective: 46-github-sync-foundations
trd: "08"
subsystem: github-sync
tags: [gh, sync, command-surface, mapping-v3, markers, enabled-gate, tdd]
requires: [46-01-gh-client, 46-02-gh-mapping-v3, 46-03-gh-body-markers, 46-05-gh-issue-resolution, 46-07-sync-core-rewire]
provides:
  - "gh.cmdGhSync(cwd, args, raw) and gh.syncAll(root): one push command, one run context for --all"
  - "cmdGhSyncObjectives as a deprecated delegate; skill-route DF_TOOLS_DEPRECATIONS {'gh sync-objectives': 'gh sync --all'}"
  - "comment / close-issue / sync-release / resolve / status on gh-client, mapping v3, comment markers, the enabled gate and the exit-code rule"
  - "gh-seam.repo.test.cjs: gh is spawned only by gh-client, and no parseInt is applied to objective ids"
  - "initiatives.syncInitiatives project id from PROJECT.md org_project or awareness.org_project_id"
  - "templates/config.json github.project_cache_ttl_minutes = 360 (documented config-get default)"
affects: [46-09-e2e-push-pull, 46-10-sync-step-and-docs]
tech-stack:
  added: []
  patterns:
    - "Target rule: an objective id is tried first, `#N` forces a raw issue, and a bare number that is no objective falls back to an issue"
    - "Every command checks the enabled gate first (disabled means skipped, exit 0, no gh calls); emitResult gives exit 1 on ok:false without skipped"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-commands.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/initiatives.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/devflow/bin/lib/gh.test.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
    - plugins/devflow/devflow/bin/lib/help.test.cjs
    - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
    - plugins/devflow/devflow/bin/lib/config.test.cjs
    - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs
decisions:
  - "syncAll shares one run context. Auth is checked once per scope set (runCtx._authChecked) and the mapping is written once, at the end. A GhAuthError partway through saves what was synced, then the error is re-thrown."
  - "`gh sync --all` under --raw prints '' as the legacy sync-objectives did. Only the exit code changed."
  - "`gh sync --help` usage is printed by cmdGhSync. The dispatcher's generic gh help still answers first on the CLI, so OWN_HELP is unchanged."
  - "gh-pull keeps its 46-06 output contract: prose unless --raw, and exit 0 by returning. Test 14 calls it with --raw."
  - "sync-release git calls go through helpers.execGit, so gh.cjs has no spawnSync or child_process."
metrics:
  duration: "~45 min"
  completed: 2026-09-30
tokens_input: 14958720
tokens_output: 78458
tokens_cache_read: 14744678
tokens_cache_write: 213862
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 08: One push command and a consistent command surface Summary

**Result:** `gh sync [<objective>|--all]` is now the one push command. `--all` runs every objective through a single run context, so the label is bootstrapped once and there is one marker scan. It keeps going past a failing objective and exits 1 if any objective failed. `sync-objectives` still works as a deprecated alias.

`comment`, `close-issue`, `sync-release`, `resolve` and `status` now all go through the gh-client seam, mapping v3, the `devflow:id` comment markers, the enabled gate and the exit-code rule. The gen-1 code is deleted.

## Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 9fe1ddd | test(46-08): add failing gh sync --all, alias, deprecation registry and help tests (tests 1-6) |
| 1 | GREEN | 15a2070 | feat(46-08): gh sync [--all\|<objective>] with one run context; sync-objectives becomes a deprecated alias |
| 2 | RED | 463a8e4 | test(46-08): add failing comment/close-issue/sync-release/resolve/status seam, marker, gate and exit-code tests (tests 7-15) |
| 2 | GREEN | 9207214 | feat(46-08): comment/close-issue/sync-release/resolve/status on the gh-client seam, mapping v3, markers, enabled gate and exit codes |
| 3 | RED | f72b151 | test(46-08): add failing single-seam repo guard and gen-1 removal tests (tests 17-19) |
| 3 | GREEN | cee1f30 | refactor(46-08): delete gen-1 gh code; gh.cjs owns no spawn site and readMappingV2/writeMappingV2 speak v3 |
| ext | RED | 3d677c7 | test(46-08): add failing initiatives project-id and project_cache_ttl_minutes default tests |
| ext | GREEN | dd90f5d | feat(46-08): initiatives resolves its project from PROJECT.md org_project or awareness.org_project_id; document github.project_cache_ttl_minutes (360) |
| fix | test | ca39c96 | test(46-08): move W2 alias push test onto gh-fake; 0001 stamp test allows documented template defaults |

## What was built

### Sync
- **`syncAll(root)`:**
  - Calls `createRunContext` once. A disabled project returns `{ok:false, skipped:true}` without calling gh.
  - Walks `listObjectiveIndex` in numeric order, including decimals, and calls `syncObjective(id, root, {runCtx})` for each.
  - Returns `{ok: failed===0, repo, results:[{id, dir, ok, issue_number, created, issue_updated, comment_action | error, message}], failed, mapping_written, warnings}`.
- **`syncObjective(arg, root, opts)`:**
  - Accepts `opts.runCtx`.
  - With a shared context, the auth check runs once per scope set and the mapping write is left to the caller.
  - A single `gh sync <id>` behaves as it did in 46-07.
- **`cmdGhSync(cwd, args, raw)`:**
  - `--help` anywhere prints usage on stdout and exits 0.
  - `--all`, or no positional argument, runs `syncAll` and emits through `emitResult`.
  - Otherwise it calls `cmdGhSyncObjective`.
  - A GhAuthError is rendered to stderr by the shared `renderAuthError`, with exit 1.
- **`cmdGhSyncObjectives`:** prints one stderr line, ``Note: `gh sync-objectives` is deprecated; use `gh sync --all`.`` (the target text comes from `DF_TOOLS_DEPRECATIONS`), then delegates.

### Other commands
- **`resolveTarget`:**
  - `#N` is taken as a raw issue.
  - Any spelling of an objective resolves to its mapped `issue_id`.
  - An objective that has no mapping entry is an error: "no GitHub issue for objective X; run gh sync X".
  - A bare number that is not an objective falls back to an issue. Anything else is an error.
  - Legacy v1/v2 mapping files are migrated in memory by `readMappingV3WithReport`.
- **`cmdGhComment`:**
  - Takes either the argv array (`<target> <body|@file:path> [--kind k]`) or the legacy positional shape.
  - A body for a known objective is prefixed with `<!-- devflow:id=<id> kind=<kind> -->`; `kind` defaults to `comment`.
  - A raw `#N` is posted with no marker and reports `marker:false`.
  - Posts with `ghWrite`.
- **`cmdGhCloseIssue`:** uses the same resolution. The closing comment gets a `kind=close` marker.
- **`cmdGhSyncRelease`:**
  - Checks the gate first. A missing tag is a usage error with exit 1.
  - `release view` uses `ghRead`; `release edit` and `release create` use `ghWrite`.
  - git runs through `execGit`.
- **`cmdGhResolve`:** checks the gate after help and usage, accepts any objective spelling, and emits through `emitResult`.
- **`ghStatus`:** checks `requireEnabled`, then `ghRead(['--version'])`, then `ghRead(['auth','status'])`. It no longer runs `which`.
- **Seam:**
  - Every remaining gh call site now uses `client.ghRead` or `client.ghWrite`: `requireGhAuth`, `_walkParent`, `findRoadmapIssue`, `addToProject`, `linkSubIssue`, `walkProject` and `readIssueState`.
  - `_setRunGh` installs on gh-client only. The exported `_runGh` just forwards to gh-client.
- **Deleted gen-1 code:** `readMapping`, `writeMapping`, `runGh` (the spawn), `getProjectName`, `getMilestoneVersion`, `formatIssueBody`, `_findObjectiveDir`, the old `cmdGhSyncObjectives` body, the local `readConfig` and `MAPPING_REL`.
- **Kept for importers:** `readMappingV2` now returns `readMappingV3`, and `writeMappingV2` now calls `writeMappingV3(migrateMapping(m).mapping)`.
- **Registry, dispatch and help:**
  - `skill-route.DF_TOOLS_DEPRECATIONS` is exported, making 10 exports; the LOCKED banner and the EX1-EX5 tests were updated together.
  - df-tools `gh sync` passes `args.slice(2)`, and so does `comment`.
  - The unknown-subcommand error now lists `sync-objectives` as a deprecated alias.
  - The help usage line is the one from the TRD.

### Authorized scope extensions (added by the orchestrator)
1. **`initiatives.cjs`:**
   - `syncInitiatives` no longer reads `gh.PRODUCT_ROADMAP_FIELDS`.
   - Its project id comes from, in order: `opts.project_id`, then `<cwd>/.planning/PROJECT.md` `org_project`, then `<cwd>/.planning/config.json` `awareness.org_project_id`, and otherwise nothing.
   - With no id, it returns `ok:false` and a warning naming where to set one.
   - `initiatives-cli` passes `cwd`.
   - Tests S46-1 to S46-3 are hermetic.
2. **`github.project_cache_ttl_minutes`:**
   - Set to `360` in `templates/config.json`.
   - `config-get` defaults are read from the template itself (config.cjs `documentedDefault`, TRD 44-07), so the template entry is the only change needed.
   - Test: `documentedDefault('github.project_cache_ttl_minutes')` returns `{known:true, value:360}`.

## Legacy test groups updated

| File / group | Change | Why |
|---|---|---|
| gh.test `cmdGhResolve` H1-H4 | `beforeEach` writes an enabled `config.json` | resolve is now behind the enabled gate |
| gh.test `cmdGhResolve — auth hard-fail` D1, D2 | `beforeEach` writes an enabled `config.json` | same reason |
| gh.test D3 | Deletes that `config.json` before the call; assertions unchanged | keeps the "no config means skipped, no exit 1" test for the alias |
| gh.test `addToProject / linkSubIssue` | `beforeEach`/`afterEach` reset gh-client with a no-op sleep | the mutations are paced `ghWrite` now; without this the group spent 4s in real sleeps |
| skill-route.test EX1, EX3, EX4, EX5 | Expect 10 exports, including `DF_TOOLS_DEPRECATIONS` | locked export surface changed on purpose |
| sync-state.test W2 | The hand-rolled argv mock is replaced by gh-fake; the issue number is read from the fake | the alias now runs the one sync (marker scan with `issue list`), which the mock did not support |
| migrations/0001 test 5 | User github values must survive; any extra key must equal its template default | 0001 fills template leaves, and the new TTL key is one |

No tests were deleted. The deleted gen-1 helpers had no direct tests: `formatIssueBody` and `getMilestoneVersion` were never exported, and no test imported `readMapping` or `writeMapping`.

## Deviations from Plan

**1. [Rule 3 - Blocking] The `comment` dispatch moved in task 2, not task 1.** Task 1 left `cmdGhComment(cwd, args[2], args[3], raw)` in place so the task 1 commit did not break `gh comment`. Task 2 switched it to `args.slice(2)` once `cmdGhComment` accepted an argv array (9207214).

**2. [Rule 3 - Blocking] gh-pull is called with raw=true in test 14.** gh-pull prints prose unless `--raw` and exits 0 by returning (its 46-06 contract). The test reads the JSON under `--raw` and treats "no exit call" as exit 0. gh-pull was not changed.

**3. [Rule 1 - Bug] git calls in `readObjectiveState` and `sync-release`.** Both called `spawnSync('git')` directly, which conflicted with the done criterion that `rg spawnSync gh.cjs` finds nothing. They now go through `helpers.execGit`.

**4. [Rule 3 - Blocking] Two tests outside the TRD's file list failed on the full suite.** sync-state W2 and migration 0001 test 5 were fixed in ca39c96; see the table above.

**5. Scope note: test 18 passed at RED.** 46-07 had already removed the last parseInt of a directory prefix, so the test is a forward guard. Tests 17 and 19 failed at RED as intended.

**6. Scope note: `gh sync --help` on the CLI.** It is answered by the dispatcher's generic `gh` usage, which contains `sync [<objective>|--all]`, with exit 0. `cmdGhSync`'s own usage is used when it is called directly (test 6).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test gh-commands.test.cjs skill-route.test.cjs help.test.cjs doc-refs.test.cjs gh.test.cjs gh-sync.test.cjs` | 0 (244 pass) | PASS |
| 2 | `node --test gh-commands.test.cjs gh.test.cjs gh-sync.test.cjs gh-pull.test.cjs` | 0 (170 pass) | PASS |
| 3 | `node --test gh-seam.repo.test.cjs gh.test.cjs gh-commands.test.cjs gh-sync.test.cjs gh-pull.test.cjs conflict.test.cjs awareness.test.cjs pm-backend.test.cjs` | 0 (318 pass) | PASS |
| 3 done | `rg -n "spawnSync" plugins/devflow/devflow/bin/lib/gh.cjs` | 1 (no matches) | PASS |
| ext | `node --test initiatives.test.cjs config.test.cjs initiatives-cli.test.cjs` | 0 (157 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-commands skill-route help` | 1 (11 fail) | FAIL (correct) |
| GREEN (task 1) | same, plus doc-refs, gh, gh-sync | 0 | PASS (correct) |
| RED (task 2) | `node --test gh-commands.test.cjs` | 1 (11 fail) | FAIL (correct) |
| GREEN (task 2) | `node --test gh-commands gh gh-sync gh-pull` | 0 | PASS (correct) |
| RED (task 3) | `node --test gh-seam.repo.test.cjs` | 1 (17 and 19 fail) | FAIL (correct) |
| GREEN (task 3) | task 3 verify set | 0 | PASS (correct) |
| RED (ext) | `node --test initiatives.test.cjs config.test.cjs` | 1 (4 fail) | FAIL (correct) |
| GREEN (ext) | same, plus initiatives-cli | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` (covers gh*.test.cjs, skill-route, help and doc-refs.repo) | 0: 6146 tests, 6113 pass, 0 fail, 33 skipped | PASS |
| verification 1 | `node df-tools.cjs gh sync --help` | 0, prints `sync [<objective>\|--all]` | PASS |
| verification 2 | `node df-tools.cjs --cwd <tmp without config> gh comment 2 hi` | 0, `skipped: true` | PASS |

The known flakes (MA-7, J1 tui, 45-02 test 10) did not fail on this run.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the full-suite follow-ups in ca39c96).
- Must-haves verified: 8/8. The `gh-commands.test.cjs` tests covering each:
  - `--all` with one context and exit 1: tests 1-3
  - the alias and its registry entry: tests 4 and 5
  - spelling resolution and `#N`: tests 7-9 and 12
  - markers and kinds: tests 7, 10 and 11
  - disabled means skipped with zero calls: test 14
  - exit codes: tests 3, 13 and 14b
  - hermetic status: test 15
  - one seam and gen-1 removed: tests 17 and 19
- Gate failures: none.

## Notes for later TRDs

- **46-09:** `syncAll` result entries carry `issue_number`/`created`/`issue_updated`/`comment_action`; e2e can assert on them. `cmdGhSync` emits `--all` failures on **stdout** (JSON, exit 1); single `gh sync <id>` failures still go to stderr (46-07 contract).
- **46-10:** verifier can call `gh comment <id> @file:<path> --kind verification` and `gh close-issue <id> "<text>"`; an objective with no mapping entry fails with "run gh sync <id>" (exit 1). `gh sync <dir>` exit codes are unchanged from 46-07.
- `DF_TOOLS_DEPRECATIONS` is not yet read by doc-refs; if doc correction should rewrite `gh sync-objectives` in prose, doc-refs needs a df-tools-argv pass (separate from the slash-command map).

## Self-Check: PASSED

- Created files exist and ran green in the full suite: `gh-commands.test.cjs` and `gh-seam.repo.test.cjs`.
- All nine commits (9fe1ddd, 15a2070, 463a8e4, 9207214, f72b151, cee1f30, 3d677c7, dd90f5d, ca39c96) are in `git log 9cb12f4..HEAD`.
- The unrelated untracked files were not staged: docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md and the .gitkeep files.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched. The orchestrator reconciles them for this sequential wave. The requirements to mark complete are GSF-01, GSF-02 and GSF-08.
