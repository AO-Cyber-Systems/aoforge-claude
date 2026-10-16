---
objective: 48-planning-write-path-migration
trd: "06"
type: tdd
wave: 2
depends_on: ["48-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-capability.cjs
  - plugins/devflow/devflow/bin/lib/gh-capability.test.cjs
autonomous: true
requirements: [GWP-01]
must_haves:
  truths:
    - "`upsert-issue` for roles todo/debug/quick creates (or finds by label scan + `devflow:id` marker) one issue per entity id, records it with `setEntity`, and is idempotent on re-flush (D-03, U-3)"
    - "Debug and Quick issues get the native `Debug`/`Quick` issue type when the org has it enabled, else the `devflow:type/debug`/`devflow:type/quick` label; todos get only the `devflow:todo` label and never a type"
    - "Debug and Quick are OPTIONAL types: an org lacking them still reports `modes.types === 'native'` when Objective/TRD/Decision are native, and `degradedNotices` is unchanged for that case"
    - "`issueRef` resolves entity ids through `getEntity`, so `upsert-comment` (summary on `quick-N`) and `patch-issue` (close `todo-x`, `debug-x`) work on entities"
    - "An entity body edited on GitHub since DevFlow's last write halts the flush like a TRD body (fully managed); a human comment on the issue does not"
    - "D-09 pinned: `upsert-comment {id:'7-01-d1', kind:'answer'}` followed by `patch-issue {id:'7-01-d1', state:'closed', state_reason:'completed'}` posts the answer on the Decision issue and closes it"
    - "Every existing flusher and capability test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
      provides: "entity branches in handleUpsertIssue/createIssue/issueRef/handlePatchIssue; labelFor/typeNameFor by role"
    - path: plugins/devflow/devflow/bin/lib/gh-capability.cjs
      provides: "OPTIONAL_TYPES; typesByName covers Debug/Quick without changing the aggregate"
  key_links:
    - "Consumes 48-02 `ENTITY_ROLES`, `toEntityId`, `getEntity`/`setEntity`, `decodeEntityBody`; consumed by 48-12 entity verbs and the 48-22 e2e"
---

# TRD 48-06: Flusher and capability support for todo, debug and quick issues; decision answers

<objective>
Teach objective 47's single GitHub writer to create and update the new entity issues (todo, debug, quick) with the right label and
issue type, resolve them for comments and state changes, and treat their bodies as fully DevFlow-managed. Make Debug/Quick optional
issue types in the capability probe. Pin the decision-answer path (D-09) with a test.

Purpose: U-1, U-3, D-03, D-09. Output: additive flusher + capability changes with tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD; characterization first: the D-09 decision-answer test (test 1) is written against today's code and is expected to PASS — commit it
  as `test(48-06): pin decision answer path`. If it fails, the fix is part of this TRD (RED → GREEN, separate commits).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Every gh call stays inside `gh-client` (`ghRead/ghWrite/ghPaginate`); flusher remains the only GitHub writer (seam guard).
- Tests: `createFakeGitHub({...project.fakeOptions, types:[...]})` with explicit types per test, `client._setRunGh(fake.runGh)`, fake clock
  (`_setNow/_setSleep`), `_resetClient()` afterEach, `hermeticEnv()`, `makeStoreProject({store:true})`, modes injected via `flush(root, {modes})`.
  Never real GitHub/`~/.claude`, never port 8080, hand-written bodies.
- Keep TRD/Decision/objective behaviour byte-identical: the existing 47 flusher tests are the guard.

## Decisions

D-03, D-09, U-3. Settled here:

- **Role → label**: `labelFor(ctx, role)`: trd/decision unchanged; entity roles use `ctx.labels[role] || ENTITY_ROLES[role].label`.
- **Role → type name**: `typeNameFor(role)`: decision → `Decision`, trd → `TRD`, debug → `Debug`, quick → `Quick`, todo → `null`. When null, no
  native type and no `devflow:type/*` label are added even if `payload.type` is set (todo issues are label-only per the proposal table); a
  `payload.type` on a todo op is reported as a warning, not an error.
- **Id resolution**: `handleUpsertIssue` accepts `toTrdId(id)` (today) OR `toEntityId(id)`; entity entries use `getEntity`/`setEntity`.
  Rename the private `createTrdIssue` to `createIssue(ctx, id, role, ...)` with a mapping writer chosen by role; keep messages for TRDs identical.
- **issueRef** order: TRD/Decision id → entity id → objective id. Entity ref `kind: 'entity'`, `rest_id` from the mapping. In `handlePatchIssue`,
  `typeName` for an entity ref = `typeNameFor(entry.role)`.
- **Remote-edit rule**: entity bodies are fully managed (TRD rule of D-24 in 47): a differing `body_hash` halts. Frozen logic does not apply.
- **Capability**: `OPTIONAL_TYPES = ['Debug','Quick']`; `typesByName` returns entries for REQUIRED + OPTIONAL; `modes.types` aggregate and
  `degradedList`/`degradedNotices` consider REQUIRED only. Add one advisory line in the existing notice set ONLY when an optional type is missing
  AND the required ones are native: "Issue types Debug/Quick are not enabled; DevFlow labels those issues devflow:type/<name>" (separate key
  `optional_types`, so 47's notice tests are unchanged).

## Test list

1. (D-09, characterization) `makeStoreProject({store:true})`, mapping has decision `7-01-d1` (seed fake issue + `setTrd`); enqueue
   `upsert-comment {id:'7-01-d1', kind:'answer', text:'Use option B'}` and `patch-issue {id:'7-01-d1', state:'closed', state_reason:'completed'}`;
   flush → one comment with `devflow:answer` marker on that issue, issue closed/completed; re-flush writes nothing.
2. Todo create: enqueue `upsert-issue {id:'todo-2026-07-31-a', role:'todo'}` with an `encodeEntityBody` body → fake has one issue labelled
   `devflow:todo`, no type, mapping `entities['todo-2026-07-31-a']` = `{issue_number, rest_id, role:'todo'}`.
3. Re-flush of the same op after clearing the mapping entry → no second issue (found by label scan + marker); mapping restored.
4. Debug create with types `[Objective, TRD, Decision, Debug]` enabled → native type `Debug` + label `devflow:debug`; without `Debug` →
   labels `devflow:debug` + `devflow:type/debug`, warning-free.
5. Quick: `upsert-issue {id:'quick-12', role:'quick', type:'Quick'}`, then `upsert-comment {id:'quick-12', kind:'summary'}`, then
   `patch-issue {id:'quick-12', state:'closed', state_reason:'completed'}` → issue with summary comment, closed.
6. Todo with `payload.type:'Todo'` → no type and no type label; result warnings mention it.
7. Entity body edited on the fake after the last flush; a new upsert for it halts with a report naming the issue; nothing else written.
8. A human comment added to a todo issue does not halt the next body update.
9. `patch-issue` on an unknown entity id → error `todo-x has no issue yet; run the verb again after a flush` (no throw).
10. Capability: caps with Objective/TRD/Decision enabled and no Debug/Quick → `types:'native'`, `types_by_name.Debug === 'labels'`,
    `degradedList` has no `types`, `optional_types` notice present.
11. Capability: caps with all five enabled → all native, no optional notice; caps with none → 47's existing degraded notice text unchanged.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin decision answers; optional Debug/Quick types (tests 1, 10, 11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs, plugins/devflow/devflow/bin/lib/gh-capability.cjs, plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</files>
  <action>
Write test 1 in `gh-outbox-flush.test.cjs` (`describe('48-06 decision answer (D-09)')`), run it on today's code, commit as characterization.
RED: tests 10-11 in `gh-capability.test.cjs`; commit `test(48-06): optional Debug/Quick types`.
GREEN: add `OPTIONAL_TYPES`, extend `typesByName`, keep aggregate/degraded over `REQUIRED_TYPES`, add the `optional_types` notice. Commit
`feat(48-06): Debug and Quick as optional issue types`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</verify>
  <done>Test 1 green on unchanged flusher code (or fixed test-first); tests 10-11 pass; 47 capability tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Entity upserts, refs, types and halts in the flusher (tests 2-9)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 2-9 in a `describe('48-06 entity issues')`. Commit `test(48-06): entity issues in the flusher`.
GREEN, in this order: `labelFor` + `typeNameFor`; `handleUpsertIssue` id branch (TRD id or entity id; entity uses getEntity/setEntity);
`createTrdIssue` → `createIssue` with role-aware mapping writes; `issueRef` entity branch; `handlePatchIssue` type name by role; confirm the
base/halt path (`saveBase`, remote-edit check) treats `kind:'entity'` refs as fully managed. Update the module's header comment (roles list).
Commit `feat(48-06): flusher writes todo, debug and quick issues`. Then run the whole gh-* suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 2-9 pass; every 47 gh-* test still passes.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox-flush.cjs` L370 `labelFor`, L412 `handleUpsertIssue`, L498 `createTrdIssue`, L270 `issueRef`, L646 `handlePatchIssue`, L823 `handleUpsertComment`.
- `gh-capability.cjs` L30 `REQUIRED_TYPES`, L414 `typesByName`, L433 degraded list, L445 notices.
- `gh-mapping.cjs` `toTrdId` already accepts `-dK` ids, so `issueRef` resolves Decisions via `mapping.trds` (why test 1 should pass unchanged).
</codebase_examples>
<anti_patterns>
- Adding Debug/Quick to `REQUIRED_TYPES`: every org without them would flip to degraded `types` for Objective/TRD/Decision too.
- A separate scan path for entities: reuse `scanByLabel` + `indexByMarker`; the marker is the same `devflow:id` line.
</anti_patterns>
<error_recovery>
- If renaming `createTrdIssue` breaks a test that spies on it by name, keep a `createTrdIssue` alias delegating to `createIssue`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green (no new spawn, flusher still the only writer among store modules).
</verification>

<success_criteria>
The outbox can create, comment on and close todo, debug and quick issues with correct types or degraded labels, and decision answers are proven to work.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-06-SUMMARY.md`
</output>
