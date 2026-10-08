---
objective: 47-github-authoritative-store
trd: "02"
subsystem: gh-fixtures
tags: [fixture, fake-github, tdd, rest, sub-issues, dependencies, hermetic]
requires:
  - objective: 46-github-sync-foundations
    provides: "gh-client _setRunGh seam, isWriteArgs, the 46 gh-fake.cjs this extends in place"
provides:
  - "gh-fake REST issues (id = 1_000_000 + number), sub-issues, dependencies, repo meta, org issue types and fields, issue-field values, setOffline, humanEditComment, runGh(args, opts)"
  - "gh-store-fixtures: makeStoreProject, oversizedTrdText, hermeticEnv, STORE_FIXTURE"
affects: [47-06, 47-07, 47-08, 47-09, 47-10, 47-11, 47-12, 47-13]
tech-stack:
  added: []
  patterns:
    - "one fake GitHub for every 47 test, installed only through gh-client._setRunGh(fake.runGh)"
    - "capability variants as constructor options (ownerType, hasWiki, push, types, fields, subIssuesApi)"
    - "hand-built literal fixtures, exact env restore"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-store-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
key-decisions:
  - "ids are always 1_000_000 + number; sub-issue and dependency endpoints accept only an id and 404 on a number (Pitfall 1)"
  - "one internal updatedAt feeds gh --json updatedAt and REST updated_at; link, dependency, comment, label and field writes all bump it (Pitfall 2)"
  - "D-07: GET orgs/o/issue-fields serves [{id,name,data_type}] as configured; D-08: an unsettable type is dropped silently (type null on create, unchanged on PATCH)"
  - "makeStoreProject writes github.store only when store:true, as a strict boolean true, never false"
duration: "~2 sessions (resumed once)"
completed: 2026-09-30
tokens_input: 7686653
tokens_output: 86536
tokens_cache_read: 7529112
tokens_cache_write: 157425
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 02: Fake GitHub for the authoritative store Summary

**One in-place extension of `gh-fake.cjs` that speaks every REST shape objective 47 uses (ids never equal numbers, sub-issues, blocked-by, repo meta, org types and fields, offline switch), plus a hand-built 3-TRD, 2-wave store project builder with exact-length oversized TRDs and a hermetic env.**

No production code changed. Four files, all fixtures or their tests.

## What was built

**gh-fake.cjs (extended in place, never forked)**
- `runGh(args, opts)`: `--input -` parses `opts.input` as the JSON body (typed values); a missing body, bad JSON, a non-object body or a file path `--input` fails loudly. Only `args` are logged. `--search` and unknown flags stay `[gh-fake] unsupported`.
- Issue storage gains `id`, `type`, `owner`, `parent`, `subIssues`, `blockedBy`, `fieldValues`, `stateReason`. REST shape includes `type`, `sub_issues_summary`, `issue_dependencies_summary`, `parent_issue_url`, `html_url`, `node_id: 'I_' + id`.
- Routes: `repos/o/r/issues` (POST, GET with labels/state/direction/per_page), `issues/{n}` (GET, PATCH), `sub_issues` (GET, POST), `sub_issue` (DELETE), `parent` (GET, 404 when none), `dependencies/blocked_by` (GET, POST), `blocked_by/{id}` (DELETE), `dependencies/blocking` (GET), `issue-field-values` (GET, POST merge, PUT replace), `repos/o/r`, `orgs/{o}/issue-types`, `orgs/{o}/issue-fields`.
- GitHub rules: one parent, 100 children, duplicate link 422, second parent 422 unless `replace_parent`, same owner, self and cycle 422, number-as-id 404.
- Options: `ownerType`, `hasWiki`, `push`, `isPrivate`, `types`, `fields`, `subIssuesApi`. Controls: `setOffline`, `humanEditComment`, read-only `ownerType` / `subIssuesApi` getters.

**gh-store-fixtures.cjs**
- `STORE_FIXTURE` (deep-frozen literals), `makeStoreProject({ownerType, hasWiki, enabled, store})`, `oversizedTrdText(n, {id, file})`, `hermeticEnv()`.

## Task commits

| Task | Phase | Hash | Subject |
|---|---|---|---|
| 1 | RED | 2b03367 | test(47-02): add failing REST issue, sub-issue and dependency cases to gh-fake |
| 1 | GREEN | 98d35ee | feat(47-02): gh-fake REST issues with ids, sub-issues and dependencies |
| 2 | RED | 822b7df | test(47-02): add failing capability, offline and human-edit cases to gh-fake |
| 2 | GREEN | 4a0033e | feat(47-02): gh-fake capability variants, offline switch and human comment edit |
| 3 | RED | d081fc5 | test(47-02): add failing store fixture builder and hermetic env cases |
| 3 | GREEN | d6a70d3 | feat(47-02): store fixture builder, oversized TRD text and hermetic env |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 1 (13 fail, 23 pass) | FAIL (correct) |
| GREEN (task 1) | same | 0 (36 pass) | PASS (correct) |
| RED (task 2) | same | 1 (9 fail, 36 pass) | FAIL (correct) |
| GREEN (task 2) | same | 0 (45 pass) | PASS (correct) |
| RED (task 3) | `node --test plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs` | 1 (Cannot find module) | FAIL (correct) |
| GREEN (task 3) | same | 0 (10 pass) | PASS (correct) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: REST issues, sub-issues, dependencies | `node --test gh-fake.test.cjs gh-e2e.test.cjs gh-sync.test.cjs gh-issue.test.cjs gh-commands.test.cjs gh.test.cjs sync-state.test.cjs` | 0 (293 tests, 289 pass, 4 pre-existing live skips) | PASS |
| 2: capability variants, offline, human edit | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 (45 pass) | PASS |
| 3: store fixtures, hermetic env | `node --test plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs` | 0 (10 pass) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-fake.test.cjs gh-store-fixtures.test.cjs` | 0 (55 pass, 0 fail) | PASS |
| regression | `node --test gh-e2e.test.cjs gh-sync.test.cjs gh-issue.test.cjs gh-commands.test.cjs` | 0 (114 pass, 0 fail) | PASS |
| full suite | `npm test` | 1 (6220 tests, 6187 pass, 1 fail, 32 skipped) | PASS apart from the known pre-existing MA-7 (doctl auth) |
| search check | `rg -n "search" __fixtures__/gh-fake.cjs` | 0 | One hit: the header comment about `--search` being unsupported |

Full-suite failure: only `handoff-e2e.test.cjs` MA-7, which also fails on the base checkout (confirmed by running that file at `882e3b7` in the main checkout).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node_modules missing in the worktree**
- **Found during:** full-suite run (task 3 wrap-up)
- **Issue:** The first `npm test` showed 9 failures in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs`. They pass at the base commit in the main checkout, and no changed file is imported by them.
- **Fix:** None in code. The orchestrator symlinked `node_modules` into the worktree (left uncommitted); the same files then showed only MA-7 failing.

### Choices within the TRD's latitude (not defects)

**2. Same-owner rule.** The fake is single-repo, so the rule needs a way to be exercised: `seedIssue({owner})` / `addIssue({owner})` accept another owner and linking it is 422. Default owner is the repo owner.

**3. Extra GitHub rules.** Cycle prevention (a sub-issue cannot be an ancestor of its parent), self-link 422 and self-block 422. REST create/PATCH register unknown labels implicitly, as GitHub does (the `gh issue create --label` path still refuses unknown labels, unchanged).

**4. Type rule split across tasks.** Task 1 resolves a type only from enabled `types`; the `ownerType !== 'Organization'` and `push:false` drops were added in Task 2 so its RED commit was genuinely red. A PATCH with an unsettable type leaves the type unchanged (D-08: dropped silently); `type: null` clears.

**5. hermeticEnv extras.** Beyond the six listed variables it sets `GIT_AUTHOR_*` / `GIT_COMMITTER_*` (a wiki commit has no author once `GIT_CONFIG_GLOBAL=/dev/null`), returns `root`, and `restore()` also removes the temp root and is idempotent. The outbox and cache dirs are not pre-created, so "journal absent" stays assertable.

**6. makeStoreProject extras.** Returns `summaryFile` too. `github.store` is written only for `store:true` (strict `true`), omitted otherwise, matching 47-12's `store === true` check. `07-03-gamma-TRD.md` is the TRD with no trailing newline; `07-02-beta-TRD.md` carries non-ASCII text.

**7. 46 internals touched.** `gh issue close` / `reopen` now also set the internal `stateReason` (needed for REST `state_reason`). No 46 test was edited or weakened; the `error_recovery` path was not needed.

**8. SUMMARY filename.** Written to `47-02-SUMMARY.md` as the dispatch specified, not the TRD's `47-02-fake-github-store-SUMMARY.md`.

**9. Not delivered.** Research lists `__fixtures__/wiki-remote.cjs` under 47-02, but this TRD's `files_modified` excludes it and 47-04 builds its own temp helper; it was not built here.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one environment fix, see deviation 1)
- Must-haves verified: 7/7
- Gate failures: None attributable to this TRD (MA-7 pre-existing)

## Self-Check: PASSED

- Files: gh-fake.cjs, gh-fake.test.cjs, gh-store-fixtures.cjs, gh-store-fixtures.test.cjs all FOUND.
- Commits 2b03367, 98d35ee, 822b7df, 4a0033e, d081fc5, d6a70d3 all FOUND in `git log`.
