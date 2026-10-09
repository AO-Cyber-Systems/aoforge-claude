---
objective: 46-github-sync-foundations
trd: "04"
subsystem: github-sync
tags: [github, projects-v2, graphql, cache, gh-cli]

requires:
  - objective: 46-github-sync-foundations
    provides: "nothing from this objective; wave 1 and dependency-injected on purpose (opts.run)"
provides:
  - "lib/gh-project.cjs: live discovery of Projects v2 field ids, single-select options and iterations"
  - "Out-of-repo TTL cache of the discovered model with refresh-once for unseen options"
  - "updateItemFields: add issue to project, then set single-select / iteration values"
affects: [46-07-sync-core-rewire, 47-github-cache-and-offline]

tech-stack:
  added: []
  patterns:
    - "Dependency-injected gh runner (opts.run) returning { ok, status, stdout, stderr }"
    - "Every GitHub-side failure is { ok:false, error, warnings }; nothing throws"
    - "Runtime state under ~/.claude/devflow/state/<name>/ with a DEVFLOW_* env override, os.homedir() read lazily"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-project.cjs
    - plugins/devflow/devflow/bin/lib/gh-project.test.cjs
  modified: []

key-decisions:
  - "Ported addToProject/updateProjectFields into gh-project.cjs instead of accepting an injected addItem (the TRD recovery option was not needed)"
  - "A cache miss or expiry counts as the one refresh, so a missing option after a fresh discovery never triggers a second discovery"
  - "A failed refresh keeps the cached model and warns, rather than failing the sync"
  - "A runaway hasNextPage loop at 20 pages is ok:false, so a partial model is never cached"

patterns-established:
  - "Pair-level warnings use the gh.cjs strings: `unknown field: <name>` and `unknown option for <field>: <value>`"

requirements-completed: [GSF-07]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-09-30
tokens_input: 4998064
tokens_output: 61727
tokens_cache_read: 4870899
tokens_cache_write: 127073
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 04: Project field discovery with a TTL cache Summary

**`lib/gh-project.cjs` reads a Projects v2 board's fields, options and iterations from GitHub by node id, caches them outside the repo for 360 minutes, refreshes once when a wanted option is unseen, and applies field values to an issue's project item; no option name or project id is hardcoded.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-09-30T17:55:51Z (preflight claim)
- **Completed:** 2026-09-30T18:10:22Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (both new)

## Accomplishments

- `discoverProjectFields(projectId, {run, now})` runs the paginated `node(id:)` query, classifies fields by `__typename` (`single_select`, `iteration`, `field`) and returns `{project_id, fetched_at, fields}`. It requests only `id name`, `options { id name }` and `configuration { iterations { id title startDate } }`; `dataType`, `duration` and `completedIterations` are never queried (a test asserts this).
- `getProjectFields` caches at `$DEVFLOW_GH_CACHE_DIR/<projectId>.json` (default `~/.claude/devflow/state/gh-project/`, read lazily), TTL 360 minutes overridable by `ttlMinutes`. A fresh cache makes zero gh calls. Corrupt JSON, or a file whose `project_id` differs (two ids sanitising to one file name), reads as a miss.
- `want` support: a fresh cache that cannot resolve a wanted pair is refreshed exactly once; pairs still missing become warnings, never failures. `Q3 2028` resolves whenever the mocked board offers it, with no release needed.
- `updateItemFields` resolves the issue node id, adds it to the project (`addProjectV2ItemById`), then sends one `updateProjectV2ItemFieldValue` per resolvable field with `singleSelectOptionId` or `iterationId`. Per-field failures are collected in `errors` and do not stop the other fields.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: GraphQL discovery and TTL cache (tests 1-6, 12) | `node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs` | 0 | PASS |
| 2: Value resolution, refresh-once and item updates (tests 7-11) | `node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs` | 0 | PASS |

Final run of that file: 35 tests, 34 pass, 0 fail, 1 todo (X2, see below).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs` | 0 | PASS |
| verification grep | `rg -n "__fixtures__\|PVT_kwDODwqLrc4BRsOP\|\.planning" plugins/devflow/devflow/bin/lib/gh-project.cjs` | 1 (no matches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-project.test.cjs` | 1 (`MODULE_NOT_FOUND`) | FAIL (correct) |
| GREEN (task 1) | `node --test .../gh-project.test.cjs` | 0 (17 pass, 1 todo) | PASS (correct) |
| RED (task 2) | `node --test .../gh-project.test.cjs` | 1 (16 fail: missing `resolveFieldValue`, `updateItemFields`, `want` handling) | FAIL (correct) |
| GREEN (task 2) | `node --test .../gh-project.test.cjs` | 0 (34 pass, 1 todo) | PASS (correct) |

R2c ("everything wanted is already in a fresh cache -> no gh call") passed during the task 2 RED run because that behaviour already held from task 1; it is kept as a regression guard. No REFACTOR commit was needed.

## Commits

- `6146d82` test(46-04): add failing tests for project field discovery and TTL cache
- `feade19` feat(46-04): discover Projects v2 fields over GraphQL with a TTL cache
- `8691c9a` test(46-04): add failing tests for value resolution, refresh-once and item updates
- `a789bca` feat(46-04): resolve field values, refresh once for unseen options, update project items

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected two behaviours while porting `updateProjectFields`**
- **Found during:** Task 2, reading `gh.cjs` `addToProject` and `updateProjectFields` as the TRD instructed
- **Issue:** The old fallback lookup only ran when the add error did NOT match `already exists`, so the very case it existed for skipped the fallback. It also fell back to `nodes[0]`, an item from a different board, when no item matched the project id.
- **Fix:** On any add failure, look up the issue's existing item and accept only an item whose `project.id` matches. Covered by U5 and U5b. The lookup page size went from 5 to 20.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-project.cjs`
- **Commit:** `a789bca`

**2. [Rule 2 - Missing critical] Failure paths the TRD left implicit**
- **Issue:** The TRD names GraphQL errors and corrupt cache only.
- **Fix:** Also handled: a throwing `run`, `data.node === null` (missing `read:project` scope), a `hasNextPage` without `endCursor`, an unwritable cache dir (warning `cache write failed: ...`), and a failed refresh on a fresh cache (keeps the cached model, warns).
- **Commit:** `feade19`, `a789bca`

### Scope notes

- `github.project_cache_ttl_minutes` is not read here. `config.json` is outside this TRD's `files_modified`, so the module takes `ttlMinutes` and exports `DEFAULT_TTL_MINUTES = 360`; 46-07 passes the configured value.
- The issue node id lookup uses the `gh.cjs` variable names (`owner`, `name`, `number`) rather than the shorter `o`/`n`/`num` in the TRD sketch, since the instruction was to port that logic.
- Result shape: `updateItemFields` always returns `warnings` as an array and adds `item_id`; `errors` appears only when non-empty.

## Test 12 (repo guard)

- X1 (enforced): `gh-project.cjs` contains no `__fixtures__`, no hardcoded project node id and no `.planning` path.
- X2 (`todo: 'enabled by 46-07'`): scans every non-test `.cjs` under `lib/`. Today it reports three files, and only one is a real read: `gh.cjs:1194` loads the cassette. `runtime-digest.cjs:39` is an exclusion regex and `flutter-ui-eval-bootstrap.cjs:88` is a comment. **46-07 must remove the `gh.cjs` read and either allowlist those two files or narrow the check to actual reads before dropping the `todo`.**

## Notes for 46-07

- Pass gh-client `ghRead`/`ghWrite` as `run` (a single runner per call). `updateItemFields` runs its discovery query, issue lookup, add-item and mutations all through that one `run`, so pass the write-capable runner there.
- `getProjectFields(projectId, {run, env, now, ttlMinutes, refresh, want})` returns `{ok, model, source, warnings}`; `updateItemFields({issueRef, projectId, fields, run, env, now, ttlMinutes})` replaces `gh.cjs` `updateProjectFields`.

## Full-suite result and pre-existing failures

`npm test` (run from the worktree): 5843 tests, 5781 pass, 11 fail, 1 todo, the rest skipped.

All 11 failures are in `devflow-watch.test.cjs` (5) and `handoff-e2e.test.cjs` (6), which spawn the watcher daemon. They are **not** caused by this TRD: I exported the base commit `cb51578` (`git archive` into the session scratchpad, no repo changes) and ran both files there, getting the same 5 and 6 failures. The cause is visible in the LK-2 output: `Cannot find module 'node-pty'`. A fresh worktree has no `node_modules`, so the daemon cannot start. The TRD's accepted failure, MA-7, shows as skipped (`node-pty unavailable`) rather than failed for the same reason. These 11 are a wider set than the single accepted failure, so the orchestrator should expect them in any worktree that lacks `node_modules`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (discovery with pagination; out-of-repo TTL cache with zero calls on a fresh hit; refresh-once with warning fallback; no hardcoded option names; add-item before field updates with correct value shapes; no `__fixtures__` read in this module)
- Gate failures: None

## Preflight note

My first `exec-context check` ran from the main checkout's directory, so it passed there and recorded a claim for this plan id against the main checkout (`is_worktree: false`). Nothing was written there. I released only my own claim (`exec-context release --id 46-04-gh-project-discovery`) and re-ran the check with `--cwd` set to the worktree, which reported the worktree as `checkout`. All work and commits were made in the worktree on `df/exec-46-04-gh-project-discovery`.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/gh-project.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/gh-project.test.cjs`
- FOUND commits: `6146d82`, `feade19`, `8691c9a`, `a789bca`
