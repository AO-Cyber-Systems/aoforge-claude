---
objective: 48-planning-write-path-migration
trd: "06"
subsystem: github-sync
tags: [outbox, flusher, capability, entity-issues, todo, debug, quick, decision-answer, node-test, tdd]

requires:
  - "48-02: ENTITY_ROLES, toEntityId, getEntity/setEntity, encodeEntityBody/decodeEntityBody"
provides:
  - "gh-outbox-flush.cjs: upsert-issue for roles todo/debug/quick (create, or find by label scan + devflow:id marker; mapped under entities); labelFor/typeNameFor by role; issueRef resolves entity ids (kind 'entity'); patch-issue type by role; entity comment ids recorded; entity bodies fully managed, never frozen"
  - "gh-capability.cjs: OPTIONAL_TYPES ['Debug','Quick'], probed and named in types_by_name when enabled; aggregate/degraded over REQUIRED only; advisoriesOf / describeAdvisories with the optional_types advisory"
  - "gh-body.cjs: entity ids are devflow:id marker ids (markerLine, commentMarker, indexByMarker, findCommentsByMarker, extractMarker); ENTITY_ID_SOURCE exported and pinned to gh-trd's"
affects: [48-07, 48-12, 48-22]

tech-stack:
  added: []
  patterns:
    - "Role-dispatched mapping writer (getMapped/setMapped): trd/decision -> trds, todo/debug/quick -> entities"
    - "Optional capability = absent from the per-type record; consumer reads absence as labels, so every pre-48 record keeps its shape"
    - "Advisories kept apart from degraded notices so 47's notice output is unchanged"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-capability.cjs
    - plugins/devflow/devflow/bin/lib/gh-capability.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.test.cjs

key-decisions:
  - "types_by_name names an optional type only when the org has it enabled; an absent Debug/Quick entry means labels (flusher typeMode). Chosen over always naming it 'labels' because 47's capability tests pin types_by_name to exactly three keys for orgs without Debug/Quick"
  - "The optional_types notice is a separate advisory (advisoriesOf/describeAdvisories), not part of describeDegraded, so 47's describeDegraded output is byte-identical"
  - "An entity upsert always carries its role label (labels.<role> or ENTITY_ROLES label), because the label scan is how a lost mapping entry is recovered"
  - "A todo never gets a type or a devflow:type/* label; a payload.type on a todo (upsert-issue or patch-issue) is a warning, not an error"
  - "gh-body accepts entity ids as marker ids (exact spelling, never normalised); required for the label scan and for entity comments"

requirements-completed: [GWP-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 11min
completed: 2026-10-01
tokens_input: 6068086
tokens_output: 65893
tokens_cache_read: 5894583
tokens_cache_write: 173417
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 06: Flusher and capability support for todo, debug and quick issues Summary

**The outbox's single writer now creates, finds, comments on and closes todo, debug and quick issues. Each entity is mapped under `entities` and found again by its role label plus `devflow:id` marker. Debug and Quick use the native issue type when the org has it and a `devflow:type/<name>` label otherwise. Todos carry the label only. Entity bodies are fully managed, so any remote edit halts the flush. Debug and Quick are optional types that never degrade Objective, TRD or Decision. A test pins the decision-answer path (D-09) on unchanged 47 code.**

## Performance

- **Duration:** about 11 min
- **Started:** 2026-10-01T12:06:45Z
- **Completed:** 2026-10-01T12:17:30Z
- **Tasks:** 2 of 2
- **Files modified:** 6 (3 modules, 3 test files)

## Accomplishments

- **D-09 pinned:** `upsert-comment {id:'7-01-d1', kind:'answer'}` then `patch-issue {state:'closed', state_reason:'completed'}` posts one `<!-- devflow:id=7-01-d1 kind=answer -->` comment on the Decision issue, records its id and closes the issue as completed. Running the same ops again writes nothing. The test passed on unchanged flusher code.
- **Entity upserts:**
  - `upsert-issue` with role todo, debug or quick creates one issue, or finds the existing one by label scan plus marker after its mapping entry is lost (zero writes).
  - The issue is recorded with `setEntity` and its base comes from the body GitHub returned.
  - A role/id mismatch is refused with `upsert-issue: "<id>" is not a <role> id`. The 47 message for trd/decision is unchanged.
- **Types:**
  - `typeNameFor(role)` maps decision to Decision, trd to TRD, debug to Debug, quick to Quick, and todo to null.
  - Debug and Quick are native when the org has them, and `devflow:type/<name>` labels otherwise, with no warning.
  - A todo never carries a type or a type label. A `payload.type` on a todo is reported as a warning.
- **Refs:** `issueRef` resolves TRD/Decision, then entity, then objective. Entity refs are `kind:'entity'` and carry `rest_id` and `role`. `upsert-comment` (a summary on `quick-12`) and `patch-issue` (closing `todo-x` or `debug-x`) work on entities. Entity comment ids are recorded in the mapping. An unknown entity id fails with `todo-x has no issue yet; run the verb again after a flush` and does not throw.
- **Remote edits:** a body edited on GitHub halts the next entity upsert, names the issue and writes nothing; the op after it does not run. A human comment, even one that bumps `updated_at`, does not halt. Entities are never frozen: no spec-rev read, no frozen base. A `patch-body` on an entity always uses the whole-body rule.
- **Capability:**
  - `OPTIONAL_TYPES` is probed alongside the required types.
  - `types_by_name` adds Debug/Quick only when they are enabled.
  - `modes.types`, `degraded` and `describeDegraded` consider only the required types.
  - `advisoriesOf(caps)` returns `['optional_types']` only when the required types are native and an optional type is missing. `describeAdvisories(caps)` gives "Issue types Debug/Quick are not enabled; DevFlow labels those issues devflow:type/<name>." (or the singular form when only one is missing).

## Task Commits

1. **Task 1: Pin decision answers; optional Debug/Quick types (tests 1, 10, 11)**: `0cd787b` (test, characterization: passed on 47 code), `eb02e52` (test, RED), `9dee47c` (feat, GREEN)
2. **Task 2: Entity upserts, refs, types and halts (tests 2-9)**: `120fe77` (test, RED flusher), `0aa1deb` (test, RED gh-body entity markers), `e053f5b` (feat, GREEN gh-body), `d40360e` (feat, GREEN flusher)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: decision answer + optional types | `node --test .../gh-capability.test.cjs .../gh-outbox-flush.test.cjs` | 0 | PASS (169/169) |
| 2: entity issues in the flusher | `node --test .../gh-outbox-flush.test.cjs` | 0 | PASS (102/102) |
| 2: regression | `node --test plugins/devflow/devflow/bin/lib/gh-*.test.cjs .../migrations/0009-gh-mapping-v3.test.cjs` | 0 | PASS (1215/1215) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| characterization (T1, test 1) | `node --test --test-name-pattern="D-09" .../gh-outbox-flush.test.cjs` | 0 | PASS on unchanged 47 flusher (correct) |
| RED (T1, tests 10-11) | `node --test --test-name-pattern="48-06" .../gh-capability.test.cjs` | 1 | FAIL 7/7 (correct): OPTIONAL_TYPES / advisoriesOf / describeAdvisories missing |
| GREEN (T1) | `node --test .../gh-capability.test.cjs .../gh-outbox-flush.test.cjs` | 0 | PASS 169/169 (correct) |
| RED (T2, tests 2-9) | `node --test --test-name-pattern="48-06 entity" .../gh-outbox-flush.test.cjs` | 1 | FAIL 11/11 (correct): the flusher refused entity roles |
| RED (T2, gh-body E1-E4) | `node --test --test-name-pattern="48-06" .../gh-body.test.cjs` | 1 | FAIL 3/4 (correct); E4 (numeric ids unchanged) is a guard and passes by design |
| GREEN (T2, gh-body) | `node --test .../gh-body.test.cjs` | 0 | PASS 102/102 (correct) |
| GREEN (T2, flusher) | `node --test .../gh-outbox-flush.test.cjs` | 0 | PASS 102/102 (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-outbox-flush.test.cjs gh-capability.test.cjs` | 0 | PASS |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` (includes gh-seam.repo.test.cjs) | 0 | PASS (1215/1215) |
| full suite | `npm test` (worktree) | 1 | 7167 pass, 1 fail (MA-7, known doctl-auth flake in handoff-e2e.test.cjs), 32 skipped |

## Files Modified

- `gh-outbox-flush.cjs`: header lists the roles; `OPTIONAL_TYPE_NAMES` + `typeMode` absent-optional rule; `issueRef` entity branch; `isEntityRole`, `labelFor` (labels.<role> over ENTITY_ROLES), `typeNameFor`, `typeIgnored`, `upsertIdOf`, `getMapped`/`setMapped`; `handleUpsertIssue` entity branch (role label, todo type warning, no freeze); `createTrdIssue` renamed `createIssue` (role-aware mapping writes, TRD messages unchanged); `patch-body` whole-body rule for entities; `handlePatchIssue` type by role; `recordCommentIds` for entities.
- `gh-capability.cjs`: `OPTIONAL_TYPES`; the probe records enabled optional types; `typesByName` names an optional type only when it is enabled; `requiredTypesNative` drives `types` and `degraded`; `advisoriesOf`, `describeAdvisories`.
- `gh-body.cjs`: `ENTITY_ID_SOURCE` (exported); entity alternative in `MARKER_SOURCE`; `canonicalId` returns an entity id exactly.
- Tests: `gh-outbox-flush.test.cjs` (test 1 and tests 2, 2b, 3, 4a, 4b, 5, 6, 7, 8, 9, 9b), `gh-capability.test.cjs` (10a-10d, 11a-11c), `gh-body.test.cjs` (E1-E4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gh-body did not accept entity ids as marker ids**
- **Found during:** Task 2 (planning the GREEN step)
- **Issue:** The TRD says to reuse `scanByLabel` + `indexByMarker` because "the marker is the same devflow:id line". gh-body's `MARKER_SOURCE` and `canonicalId` were numeric-only. As a result, `indexByMarker` treated every entity issue as unmarked, so the test-3 scan could never find one. `commentMarker` / `findCommentsByMarker` threw on `quick-12`, so test 5's summary comment was impossible.
- **Fix:** gh-body now carries a duplicated `ENTITY_ID_SOURCE`, kept dependency-free in the same way as gh-outbox's copy. Test E3 pins its source to gh-trd's `ENTITY_ID_RE`. The source is an alternative in `MARKER_SOURCE`, and `canonicalId` returns an entity id exactly, untrimmed and unnormalised. Numeric ids are unchanged (E4 plus every 46/47 gh-body test).
- **Files modified:** gh-body.cjs and gh-body.test.cjs, which are outside the TRD's `files_modified`.
- **Commits:** 0aa1deb, e053f5b

**2. [Plan conflict] Test 10's `types_by_name.Debug === 'labels'` contradicts "every existing capability test passes unchanged"**
- **Found during:** Task 1
- **Issue:** Three 47 tests (gh-capability.test.cjs L111, L182, L200) `deepEqual` `modes.types_by_name` to exactly `{Objective, TRD, Decision}`. Their fakes have no Debug/Quick, so they are the same situation as test 10. No design can both name `Debug: 'labels'` for such an org and keep those literals.
- **Resolution:** The must-have "existing tests unchanged" was kept, and test 10 adapted. `typesByName` names an optional type only when it is enabled. The flusher's `typeMode` reads an absent Debug/Quick in a per-type record as `labels`. Test 10b asserts that Debug is absent from `types_by_name`. Flusher test 4b proves the end-to-end result through `capability.resolveModes`: `devflow:debug` plus `devflow:type/debug`, no type sent, no warning.
- **Commits:** eb02e52, 9dee47c

**3. [Plan interpretation] The "optional_types notice" is a separate advisory, not part of describeDegraded**
- **Issue:** The 47 test `describeDegraded(NATIVE)` deepEquals `[]` for an org with the three required types and no Debug/Quick, which is exactly the case where the TRD wants the notice. Adding the notice to `describeDegraded` would break that test.
- **Resolution:** I added `advisoriesOf(caps)` (keys, here `optional_types`) and `describeAdvisories(caps)` (sentences). `degradedOf` / `describeDegraded` are byte-identical for every 47 case.
- **Follow-up:** `gh outbox status` (gh-store-cli.cjs L135) shows `describeDegraded` only. Showing the advisory there is a one-line change for a later TRD; gh-store-cli is outside this TRD's files.

**4. [Rule 2 - Missing critical] An entity upsert always carries its role label**
- **Issue:** A TRD relies on the enqueuer putting `devflow:trd` in `payload.labels`. For an entity, a missing label would make the issue invisible to the label scan, and a lost mapping entry would then create a duplicate.
- **Fix:** For entity roles only, `labelFor(ctx, role)` is always added, so TRD label handling is byte-identical. Test 2b covers a configured `labels.todo` with an empty `payload.labels`.

**5. [Rule 2] Entity comment ids are recorded in the mapping**
- `recordCommentIds` used to return early for anything but a TRD. Entity entries carry `comment_ids` (48-02's shape), so a summary on `quick-12` is now recorded, as test 5 asserts.

**Total deviations:** 5 (1 blocking fix outside the file list, 2 plan conflicts resolved toward "47 tests unchanged", 2 missing-critical). **Impact:** all changes are additive. Every 46/47 test passes unchanged, and the TRD/Decision/objective code paths in the flusher behave byte-identically. The `createTrdIssue` rename did not need an alias, because no test refers to it by name.

## Issues Encountered

- MA-7 (handoff-e2e, doctl auth) fails in the full suite. It is the known flake named in the dispatch: noted, not fixed.
- Capability records cached before this TRD list only the required types in `org_types.enabled`. Until the cache TTL expires and a re-probe runs, Debug/Quick read as `labels` for those repos. This is the safe direction: it adds a label and never sends a type GitHub would drop.

## Notes for downstream TRDs

- **48-12 (verbs):**
  - Enqueue `upsert-issue {id, role}` with an `encodeEntityBody` body; `payload.labels` may be empty, because the flusher adds the role label.
  - Pass `type: 'Debug'` or `'Quick'` for debug and quick; never pass a type for a todo, which only produces a warning.
  - Close an entity with `patch-issue {state:'closed', state_reason:'completed'}`.
  - The error `<id> has no issue yet; run the verb again after a flush` is the signal that the create has not been flushed yet.
- **48-07 (cache):** `gh-body.indexByMarker` now indexes entity issues by id, so a label scan of `devflow:todo` / `devflow:debug` / `devflow:quick` lists them.
- **Status:** wire `capability.describeAdvisories(caps)` next to `describeDegraded` in `gh outbox status`.
- **Store-off invariant:** nothing here reads `github.store` or writes under `.planning/` outside the flush path. The flusher runs only with `github.enabled`, and this repo's config (store off) is unaffected.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7
  - Entity upsert, scan and idempotence: tests 2, 3
  - Debug/Quick native or label, todo label only: tests 4a, 4b, 6
  - Optional types keep `types: 'native'` and `describeDegraded` unchanged: tests 10b, 11b
  - `issueRef` entity resolution for comments and close: tests 5, 9
  - Entity body edit halts, a human comment does not: tests 7, 8
  - D-09 pinned: test 1
  - Existing flusher and capability tests unchanged: regression 1215/1215
- Gate failures: none (MA-7 in the full suite is a known pre-existing flake outside scope)

## Self-Check: PASSED

- All 6 modified files are present in the worktree.
- All 7 commits are present in `git log fdfb4b4..HEAD`: 0cd787b, eb02e52, 9dee47c, 120fe77, 0aa1deb, e053f5b, d40360e.
