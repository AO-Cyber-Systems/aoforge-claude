---
objective: 47-github-authoritative-store
trd: "04"
subsystem: github-store
tags: [wiki, git, docs-backend, page-mapping, tdd, hermetic-fixture]
requires:
  - gh-mapping.toObjectiveId (46-02)
  - gh-client.readConfig / resolveRepo (46)
  - sync-state.atomicWrite
provides:
  - "gh-wiki.cjs: one wiki page table (PAGE_TABLE, pageForCachePath, cachePathForPage, objectivePage)"
  - "gh-wiki.cjs: wiki store (ensureClone, ensureExcluded, probeRemote, push, fetch, headSha) behind a single runGit seam"
  - "gh-wiki.cjs: docs/devflow backend with the same interface; openStore(root, {mode})"
  - "gh-wiki.cjs: pageRevisionUrl, the only place the LOW-confidence revision URL format lives"
  - "__fixtures__/wiki-remote.cjs: createWikiRemote, gitAvailable, gitTestEnv, applyGitTestEnv"
affects:
  - 47-06 gh-capability (calls probeRemote)
  - 47-07 gh-outbox-flush (executes wiki-push ops via openStore().push)
  - 47-09 gh-hierarchy (writes objective pages, pins headSha into the objective body)
  - 47-10 gh-cache-pull-all (fetch + cachePathForPage)
  - 47-12 sync-store-wiring (extends the git-seam guard to enforce runGit-only spawning)
tech-stack:
  added: []
  patterns:
    - "single injectable seam (_setRunGit) with a forwarding wrapper export, mirroring gh-client _setRunGh"
    - "ordered rule table with match + invert, inversion guarded by a forward round-trip"
    - "hermetic git: local bare repo over file://, isolated config/HOME/identity, applyGitTestEnv with restore()"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
    - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/wiki-remote.cjs
  modified: []
key-decisions:
  - "D-17: clone at .planning/wiki/, excluded via info/exclude resolved with `git rev-parse --git-path` (worktree-safe), one line appended only if absent"
  - "D-18: docs backend writes docs/devflow/<Page>.md, push is a no-op {ok:true, committed:false, note}; an uninitialised wiki is reported, never silently switched to docs"
  - "D-09: pageRevisionUrl is the only revision-URL site; on the docs backend the revision is the repo path"
  - "Decimal objective pages: '.' -> '_' so 02.1-b -> Objective-2_1-b and 02-1-b -> Objective-2-1-b are distinct pages"
  - "push retries a non-fast-forward as initial try + 3 retries (4 pull/push rounds max); a conflict on any round is reported, never retried away"
metrics:
  duration: "~35 min"
  completed: "2026-10-01"
  tasks: 3
  files: 3
tokens_input: 4480968
tokens_output: 84857
tokens_cache_read: 4346441
tokens_cache_write: 134447
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 04: Wiki store and docs backend Summary

**Wiki store for GitHub-as-system-of-record: one page table, a clone at `.planning/wiki/` with rebase-and-push on `master` (never forced), a `docs/devflow/` backend with the identical interface, and a hermetic local-bare-repo fixture, all behind one `runGit` seam.**

## What was built

- **Page mapping (GST-06).** `PAGE_TABLE` is an ordered rule list, each rule `{name, match(rel), invert(page, {objectiveDirs})}`.
  It covers PROJECT, REQUIREMENTS, Roadmap, `codebase/<NAME>`, objective OBJECTIVE/CONTEXT/RESEARCH, ADRs and retros.
  `cachePathForPage` only returns a candidate that maps forward to the same page, so the two directions cannot drift.
  A bare `CONTEXT.md` round-trips as `<dir prefix>-CONTEXT.md` (documented, tested).
- **Git seam.** `runGit(args, {cwd, env})` never throws (missing git, missing cwd and timeout are all results). `_setRunGit`
  replaces it; every git call in the module goes through it. The only `spawnSync('git'` in the gh-* modules is here.
- **Write path.** add -> `diff --cached --quiet` -> commit (identity falls back to DevFlow when `user.email` is empty) ->
  `pull --rebase origin master` -> `push origin HEAD:master`. Conflict: conflicted files are read, then `rebase --abort`,
  then `{ok:false, conflict:true, files}`; the local commit is kept. No `--force`/`-f`/`--ours`/`--theirs` anywhere.
- **Read path.** `fetch` runs `reset --hard origin/master` only when nothing is ahead and the tree is clean; otherwise it
  rebases and reports `ahead` so the outbox `wiki-push` op can finish.
- **Probe.** `probeRemote` -> `ok` | `uninitialised` (repository not found) | `unavailable` (stderr included, `offline`/`auth` flags).
- **Stores.** `openStore(root, {mode:'wiki'|'docs', remote})` -> `{mode, readPage, writePage, listPages, push, fetch, headSha, revisionRef}`.
  `writePage` byte-compares first (`changed:false`, mtime untouched) and writes atomically; page names cannot escape the store dir.
- **Fixture.** `createWikiRemote` builds a seeded bare repo (`init --bare -b master`) with `commitPage` (a human edit),
  `readRemotePage`, `headSha`, `goOffline/goOnline`, plus `missingUrl` and `notARepoUrl` (a regular file, which git reports as
  `invalid gitfile format` rather than "not a git repository").

## Task Commits

| Task | Phase | Commit | Subject |
|---|---|---|---|
| 1 | RED | bcdbdd2 | test(47-04): add failing tests for wiki page mapping, revision url and remote resolution |
| 1 | GREEN | c876d4c | feat(47-04): add wiki page table, revision url and remote resolution |
| 2 | RED | fb60b3a | test(47-04): add failing tests for wiki push, fetch, probe and runGit sequences |
| 2 | GREEN | 7887cdc | feat(47-04): add wiki git seam, push/fetch/probe/clone and local bare-repo fixture |
| 3 | RED | 808b690 | test(47-04): add failing integration tests for wiki store against a local bare repo and docs backend |
| 3 | GREEN | b2ba014 | feat(47-04): add wiki page store, docs backend and openStore interface |

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 2 - Missing critical functionality] Authentication failures are their own class, not "offline"**
- **Found during:** Task 2 (classification design)
- **Issue:** The TRD's offline regex includes `unable to access`, which is also what git prints for HTTP 401/403 (`unable to access '...': The requested URL returned error: 403`). Classifying that as offline would make the outbox retry an auth failure forever.
- **Fix:** `classifyGitFailure` checks auth first (`requested url returned error: 401|403`, `authentication failed`, `could not read username`, ...) and returns `{ok:false, auth:true, error}`. Covered by test 10c. `probeRemote` exposes `auth`/`offline` booleans.
- **Commit:** 7887cdc

**2. [Rule 1 - Bug prevented] `fetch` must not destroy an uncommitted page**
- **Found during:** Task 3 (RED design)
- **Issue:** The TRD's read path only guards on "commits ahead". A page written with `writePage` but not yet committed is invisible to `rev-list --count`, so `reset --hard origin/master` (or a refused rebase) would silently drop it.
- **Fix:** `fetch` checks `status --porcelain` first; a dirty clone returns `{ok:true, ahead, dirty:true, updated:false}` and is left alone. Test 17b (RED in 808b690, GREEN in b2ba014).
- **Commit:** b2ba014

**3. [Additive] Extra tests and small API surface beyond the TRD list**
- Extra cases: 1b/1c/3b-3d (bare CONTEXT, `./` and backslash paths, unknown inversions), 7b-7e, 9b/9c, 10b/10c, 11b-11j, 13b-13f (idempotent clone, foreign origin, non-clone dir, missing wiki, linked worktree), 17b, 19b, 20b-20d.
- Extra exports: `runGit` (forwarding wrapper over the seam), `WIKI_BRANCH`, `applyGitTestEnv` in the fixture.
- Retry count: "retried up to 3 times" is implemented literally as the initial attempt plus 3 retries (4 rounds); test 9 (2 rejections, 3 rounds, ok) and 9b (all rejected, 4 pushes, error matches `non-fast-forward`).

**4. SUMMARY filename.** The dispatch named `47-04-SUMMARY.md`; the TRD `<output>` named `47-04-gh-wiki-store-SUMMARY.md`. The dispatch path was used.

## Auth gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Page mapping, remote resolution, revision URL (tests 1-6) | `node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs` | 0 (13/13) | PASS |
| 2: runGit seam, push/fetch/probe, fixture (tests 7-11) | `node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs` | 0 (35/35) | PASS |
| 3: Local bare-repo integration and docs backend (tests 12-20) | `node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs` | 0 (54/54; stable across 3 runs) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-wiki.test.cjs` | 1 (`Cannot find module './gh-wiki.cjs'`) | FAIL (correct) |
| GREEN (task 1) | `node --test .../gh-wiki.test.cjs` | 0 (13 pass) | PASS (correct) |
| RED (task 2) | `node --test .../gh-wiki.test.cjs` | 1 (22 fail, 13 pass) | FAIL (correct) |
| GREEN (task 2) | `node --test .../gh-wiki.test.cjs` | 0 (35 pass) | PASS (correct) |
| RED (task 3) | `node --test .../gh-wiki.test.cjs` | 1 (12 fail: `writePage`/`listPages`/`openStore` missing) | FAIL (correct) |
| GREEN (task 3) | `node --test .../gh-wiki.test.cjs` | 0 (54 pass) | PASS (correct) |

Note: tests 12-13f already passed at the task-3 RED because `probeRemote`/`ensureClone` shipped in task 2; they now exercise those against real git rather than the fake.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs` | 0 | PASS |
| verification 1 | `rg "spawnSync\(\s*'git'" plugins/devflow/devflow/bin/lib/gh-*.cjs` | - | only `gh-wiki.cjs` (plus fixture and test) |
| verification 2 | `rg -- "--force\|'-f'" plugins/devflow/devflow/bin/lib/gh-wiki.cjs` | 1 (no match) | PASS |
| full suite | `npm test` | 1 | 6241 tests, 6208 pass, 1 fail, 32 skipped; the one failure is the known pre-existing `handoff-e2e.test.cjs` MA-7 (doctl auth) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (clone path + single exclude line incl. worktree; add/commit/rebase/push order with conflict abort and no force; 3-retry non-ff and `{offline:true}`; probe classification; one page table with distinct decimal pages; docs backend never commits; revision URL in one function; git only via `runGit` with local-bare-repo tests)
- Gate failures: None attributable to this TRD

## Hermeticity

Tests never touch the network, `gh`, port 8080, this repo's `.planning/` or the real `~/.claude`. Every remote is a `file://` bare repo under `os.tmpdir()`; git runs with `GIT_CONFIG_GLOBAL/SYSTEM=/dev/null`, a temp `HOME`, `GIT_TERMINAL_PROMPT=0` and explicit identity (`applyGitTestEnv` also strips `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and restores everything afterwards). Integration tests skip visibly when `git` is missing. No temp directories are left behind.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-wiki.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/wiki-remote.cjs
- FOUND commits: bcdbdd2, c876d4c, fb60b3a, 7887cdc, 808b690, b2ba014
