---
objective: 46-github-sync-foundations
trd: "07"
subsystem: github-sync
tags: [gh, sync, mapping-v3, gh-project, gh-issue, gh-body, tdd]
requires: [46-01-gh-client, 46-02-gh-mapping-v3, 46-03-gh-body-markers, 46-04-gh-project-discovery, 46-05-gh-issue-resolution, 46-06-pull-syncstate-rewire]
provides:
  - "gh.syncObjective / cmdGhSyncObjective rebuilt on gh-client, gh-mapping v3, gh-issue, gh-body, gh-project, gh-milestone and setFrontmatterField"
  - "gh-sync.test.cjs: syncObjective behaviour tests on the stateful gh-fake"
  - "gh-fake `graphql` handler option for `gh api graphql`"
affects: [46-08-command-surface, 46-09-e2e-push-pull, 46-10-sync-step-and-docs]
tech-stack:
  added: []
  patterns:
    - "one gh seam: gh._setRunGh installs on gh-client too; the local default forwards to gh-client"
    - "every sync mutation is gh-client ghWrite (paced); reads are ghRead / ghPaginate"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-pull.cjs
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-project.test.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
decisions:
  - "The state comment is written in task 1, not task 2, because tests 3 and 5 need it"
  - "verified_at is stamped once and kept on later syncs, so the mapping does not change on every run"
  - "Project fields are updated only when org_project resolves; project scopes are required only then"
metrics:
  duration: "~40 min"
  completed: 2026-09-30
tokens_input: 9314241
tokens_output: 86464
tokens_cache_read: 9105735
tokens_cache_write: 208368
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 07: Sync core rewire Summary

**What changed:** `gh sync <objective>` now runs as a single pipeline.

1. It accepts any spelling of the objective id.
2. It finds or creates the issue through gh-issue, so it never makes a duplicate.
3. It merges the managed body sections and sends `issue edit` only when a section changed. Human text outside the sections is kept byte for byte.
4. It reads every page of comments to find the sticky state comment and edits that comment in place.
5. It sets Project fields from gh-project live discovery.
6. It writes `github_issue` back to OBJECTIVE.md.
7. It saves mapping v3 once, with `verified_at`, and records sync-state under the same id.

The runtime no longer reads `__fixtures__`.

## Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | a4d62ce | test(46-07): add failing syncObjective tests on gh-fake (tests 1-9, 12-14) |
| 1 | GREEN | e1294bb | feat(46-07): rebuild syncObjective on gh-client/gh-issue/gh-body/mapping v3 |
| 2 | RED | 6182287 | test(46-07): add failing project-discovery, pacing, fixture-guard and scanOrg default tests |
| 2 | GREEN | 2f6efba | feat(46-07): project fields from gh-project discovery; drop runtime fixture read |
| 3 | test-only | 96036a5 | test(46-07): move legacy gh sync tests onto v3 contract |

## What was built

- **`syncObjective(arg, root)`** runs these steps in order:
  1. `createRunContext`. If GitHub sync is disabled it returns `{ok:false, skipped:true, reason}` and makes no gh calls.
  2. `resolveObjective`.
  3. `requireGhAuth`. It needs `['repo']`, plus the project scopes only when `org_project` resolves (Pitfall 13).
  4. `resolveChain`.
  5. `readObjectiveState`. A ROADMAP-only objective gets a minimal state instead.
  6. `buildObjectiveSections`.
  7. `findOrCreateObjectiveIssue`. The create body is `mergeManaged('', sections, id)`.
  8. `mergeManaged`, then `ghWrite(issue edit)` only when `changed` is true.
  9. `upsertStickyComment`.
  10. `updateProjectFields`, only when a project resolves.
  11. `setFrontmatterField(github_issue, {ifAbsentOrEqual:true})`.
  12. `setEntry`, then one `writeMappingV3`, then `recordSync(root, resolved.id, …)`.
- **Return shape:** the old keys are kept (`ok, issue_updated, comment_action, comment_id, project_fields_updated, chain, state, warnings`). The new ones are `issue_number, issue_source, created, frontmatter_written, mapping_written`.
- **Errors:** gh-issue errors (`duplicate_marker`, `duplicate_title`, `needs_human`, `verify_failed`, `scan_failed`, …) are returned unchanged. Nothing is written in that case, including the mapping. If `mergeManaged` refuses, the result is `{ok:false, error}`. If the human `github_issue` value differs, the result gets a `frontmatter_conflict: …` warning and the value is kept.
- **`cmdGhSyncObjective`:** a `skipped` result is printed to stdout with exit 0 via `gh-client.emitResult`. Failures still go to stderr as JSON with exit 1, and so does `GhAuthError`. It resolves any spelling, including the objective dir that `conflict.resolveDisk` passes in.
- **Sticky comment:**
  - `findStickyComment(issueRef, id)` and `upsertStickyComment(issueRef, body, mappingState, id)` read every page with `ghPaginate`. They match the new `devflow:id=<id> kind=state` marker or the legacy `<!-- df:state -->`.
  - The mapped comment id is preferred when it is still a state comment.
  - Updates PATCH with `-f body=`. New comments go to `api repos/R/issues/N/comments -f body=`, which returns the id as JSON.
  - A body that differs only in its `last synced` line is not re-PATCHed. That case returns `'unchanged'`.
- **Seam:** `gh._setRunGh(fn)` sets the local `_runGh` and also `gh-client._setRunGh(fn)`. The local default forwards to gh-client, as does the exported `_runGh`. The bridge in `cmdGhPull` is deleted.
- **`readObjectiveState`:**
  - TRDs and SUMMARYs are now matched on the `^\d+(\.\d+)?-\d+` id prefix. Slugged TRDs such as `46-01-gh-client-TRD.md` therefore count as done.
  - Its objective number is the canonical id. `02.1-b` is now `2.1` and reads its own ROADMAP entry.
- **Project fields and `PRODUCT_ROADMAP_FIELDS`:**
  - `updateProjectFields(issueRef, projectId, fields, opts)` now calls `gh-project.updateItemFields({run: client.ghRun, env, ttlMinutes})`.
  - `syncObjective` passes `github.project_cache_ttl_minutes` from the config when it is set.
  - `PRODUCT_ROADMAP_FIELDS` is now `Object.freeze({_captured:false, deprecated:'use gh-project discovery'})`.
- **`awareness.scanOrg({project_id, cwd = process.cwd()})`:** the default project id comes from `<cwd>/.planning/PROJECT.md` `org_project`, never the cassette. The three CLI call sites are unchanged.
- **gh-fake:** a new `graphql(argv)` option answers `gh api graphql` with a stdout string, a full result, or null (unsupported). Without the option, GraphQL stays unsupported.

## Legacy test groups (task 3 and awareness)

| Group | Action | Why / covered by |
|---|---|---|
| gh.test `findStickyComment` C1-C4 | Rewritten on gh-fake | Takes the id argument and reads all pages. C1 finds the comment on page 2; C2 matches the legacy marker. |
| gh.test `upsertStickyComment` D1-D4 | Rewritten on gh-fake | D4 also checks that a timestamp-only change is not PATCHed. |
| gh.test `updateProjectFields` E1-E4 | Rewritten on mocked GraphQL discovery | The `_captured` seeding is gone; option ids now come from discovery. |
| gh.test `syncObjective` F1-F5 | Deleted | F1 is covered by gh-sync 2 and 3. F2 ("missing github_issue is an error") is obsolete because the issue is now created (test 2). F3 is covered by 13, F4 by 4 and 5, F5 by 3. A comment at the old group position records this. |
| gh.test `cmdGhSyncObjective` G1-G4 | Kept, plus G2b | `beforeEach` turns on `github.enabled`. G2 now asserts exit 1 and the `gh auth login` remediation. G2b checks that a disabled project returns skipped with exit 0 and makes no gh calls. |
| gh.test K1-K6 (01-06) | Deleted | They asserted the old cassette-backed contract. Now covered by gh-sync test 15, E1-E4 and gh-sync 10a/10d. |
| awareness.test O2 | Rewritten (test 16) | Covers the PROJECT.md `org_project` default, `opts.project_id` taking precedence, and no default plus a warning when PROJECT.md lacks the key. |
| awareness.test CR3 | Updated | It relied on the cassette's default project id; it now passes an explicit `project_id`. |
| gh-project.test X2 | Enabled | `todo` removed. `runtime-digest.cjs` and `flutter-ui-eval-bootstrap.cjs` are allowlisted, and `gh.cjs` now passes. |

Groups for helpers that did not change (resolveChain, requireGhAuth, buildIssueBody, buildStickyComment, walkProject, cmdGhSyncObjectives and others) were not modified.

## Deviations from Plan

**1. [Rule 3 - Blocking] The sticky comment was built in task 1, not task 2**
- **Found during:** task 1 RED.
- **Issue:** tests 3 (`state_comment_id` in the mapping) and 5 (zero comment PATCH) are task 1 tests, and they need a working sticky upsert.
- **Fix:** the full paginated sticky upsert went into task 1 GREEN (e1294bb), and test 8 went into task 1's RED set. Task 2 kept tests 10, 11, 15 and 16.

**2. [Rule 1 - Bug] `readObjectiveState` read the wrong ROADMAP entry for decimal objectives**
- **Found during:** task 1.
- **Issue:** the number came from `parseInt` of the leading digits, so `02.1-b` became `2` and was named after objective 2.
- **Fix:** the number is now the canonical id from `gh-mapping.toObjectiveId`, and ROADMAP entries are compared on that id. Test 13b covers this. Commit e1294bb.

**3. [Rule 3 - Blocking] gh-fake needed a GraphQL handler for test 10**
- **Fix:** added the `graphql` option (6182287). The fake's existing argv shapes are unchanged.

**4. [Rule 3 - Blocking] Awareness test CR3 relied on the cassette's default project id**
- **Fix:** CR3 passes an explicit `project_id`. The assertions on the replayed items are unchanged (2f6efba).

**5. Scope note: the unknown-Quarter case is tested at the helper level**
- A Quarter only reaches the sync through `chain.milestone.quarter`, which the parent-issue walk produces.
- So test 10d uses `updateProjectFields` directly: an unknown `Q9 2099` gives `ok:true` with a warning.
- The sync-level test 10e checks that a failing project board gives `ok:true` with a `project fields not updated` warning.

**Operational note:** the edit gate refused the first `Write` because no skill marker was live. I ran `df-tools skill-active --start execute-objective` and continued.

## Notes for later TRDs

- **46-08 / 46-10: TTL config key.** `github.project_cache_ttl_minutes` is read and passed through. It is not yet in `templates/config.json` or the `config-get` defaults, because those files are outside this TRD. The gh-project default of 360 applies when it is unset.
- **46-08: `initiatives.cjs`.** It still reads `gh.PRODUCT_ROADMAP_FIELDS._project_id`, which is now `undefined`, so it falls through to its existing "no project_id" warning path. Its tests pass. It should get the same PROJECT.md `org_project` default as `scanOrg`.
- **46-08: legacy call sites.** `cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease`, `addToProject`, `linkSubIssue` and `walkProject` still call the local `_runGh`. That now forwards to gh-client, but these calls are not paced through `ghWrite`. The spawn-based `runGh` in gh.cjs is no longer the default and can be deleted with them.
- **46-09: sync-state timestamp.** `gh_updated_at` records local "now", as the legacy push did. If the pull side's drift check needs the real GitHub `updatedAt`, read it after the writes.
- **46-09: issue state.** The sync-state `status` is recorded as `'open'` (legacy behaviour). `syncObjective` does not read the issue's state.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test gh-sync.test.cjs gh-pull.test.cjs conflict.test.cjs` | 0 (70/70) | PASS |
| 2 | `node --test gh-sync.test.cjs gh-project.test.cjs awareness.test.cjs` (plus gh-pull, conflict) | 0 (223/223) | PASS |
| 3 | `node --test gh.test.cjs gh-sync.test.cjs` | 0 (126 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-sync.test.cjs` | 1 (13 fail / 2 pass) | FAIL (correct) |
| GREEN (task 1) | `node --test gh-sync.test.cjs` | 0 (15/15) | PASS (correct) |
| RED (task 2) | `node --test gh-sync gh-project awareness` | 1 (10a, 10d, 15, X2, O2 fail) | FAIL (correct) |
| GREEN (task 2) | same files | 0 (after the CR3 fix) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh.test.cjs gh-sync.test.cjs gh-pull.test.cjs conflict.test.cjs awareness.test.cjs gh-project.test.cjs` | 0 (340 tests: 327 pass, 0 fail, 13 live-only skipped) | PASS |
| verification 1 | no `readMappingV2(`, `writeMappingV2(`, `buildIssueBody(`, `parseInt` or `_runGh(` inside `syncObjective` | no matches | PASS |
| verification 2 | `rg -n "ghSetRunGh\|runGhBridge" gh-pull.cjs` | no matches | PASS |
| done (task 2) | `rg -n "__fixtures__" gh.cjs` | no matches | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 1 (CR3)
- Must-haves verified: 9/9. The `gh-sync.test.cjs` tests covering each:
  - spelling and create: 2, 4
  - idempotent body merge (SC3): 5, 6
  - write-back and conflict: 3, 7
  - mapping v3, `verified_at` and sync-state: 3, 8, 9
  - paginated sticky comment, legacy marker and timestamp skip: 5, 8, C1-C4, D1-D4
  - discovery, no fixture read and scopes: 10a-10e, 15
  - disabled means zero calls: 1, G2b
  - one seam and no bridge: 14
  - slugged TRD pairing: 13
- Gate failures: none.

## Full suite

`npm test` in the main checkout gave 6121 tests: 6088 pass, 1 fail, 32 skipped, 0 todo. The one failure is **MA-7** (`doctl auth init`), the accepted pre-existing failure. The known load-timing flakes (J1 tui, 45-02 test 10) did not fail on this run.

## Self-Check: PASSED

- The created file `plugins/devflow/devflow/bin/lib/gh-sync.test.cjs` exists and ran green in the gate and the full suite.
- All five task commits (a4d62ce, e1294bb, 6182287, 2f6efba, 96036a5) are in `git log 4b2364c..HEAD`.
- Before this SUMMARY, the working tree had no tracked modifications. The unrelated untracked files were not staged.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched; the orchestrator reconciles them for this sequential wave. The requirements to mark complete are GSF-01, 02, 04, 06, 07 and 08.
