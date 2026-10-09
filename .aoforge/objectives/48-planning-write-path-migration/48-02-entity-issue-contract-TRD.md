---
objective: 48-planning-write-path-migration
trd: "02"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-trd.cjs
  - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
autonomous: true
requirements: [GWP-01, GWP-04]
must_haves:
  truths:
    - "`encodeEntityBody({id, file, text})` / `decodeEntityBody(body)` round-trip todo, debug and quick bodies byte-exactly; `decodeTrdBody` still rejects an entity body and `decodeEntityBody` rejects a TRD body (U-1, U-3, D-03)"
    - "`toEntityId` accepts exactly `todo-<stem>`, `debug-<stem>`, `quick-<N>` and returns `{id, role}`; anything else is null"
    - "Mapping v3 gains an `entities` section (`{issue_number, rest_id, role, comment_ids}` per entity id) via `getEntity`/`setEntity`/`listEntities`; a mapping with no entities serialises byte-identically to today"
    - "`gh-outbox` `ROLES` includes `todo`, `debug`, `quick`; `ENTITY_ROLES` names each role's label and issue type (todo: `devflow:todo`, no type; debug: `devflow:debug`, `Debug`; quick: `devflow:quick`, `Quick`); `upsert-issue` validation refuses an entity id whose prefix disagrees with its role"
    - "Every existing gh-trd, gh-mapping and gh-outbox test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-trd.cjs
      provides: "adds encodeEntityBody, decodeEntityBody, ENTITY_ID_RE"
    - path: plugins/devflow/devflow/bin/lib/gh-mapping.cjs
      provides: "adds toEntityId, getEntity, setEntity, listEntities; entities in serializeMapping"
    - path: plugins/devflow/devflow/bin/lib/gh-outbox.cjs
      provides: "ROLES extended; ENTITY_ROLES exported; entity-aware upsert-issue check"
  key_links:
    - "48-06 (flusher) consumes ENTITY_ROLES, getEntity/setEntity; 48-07 (cache) consumes decodeEntityBody + ENTITY_ROLES labels; 48-12 (entity verbs) enqueues upsert-issue with these roles"
---

# TRD 48-02: Entity issue contract — codec, mapping, outbox roles (todo, debug, quick)

<objective>
Extend objective 47's contract layer so todos, debug sessions and quick tasks can be GitHub issues: a body codec for them, a mapping
section that records their issue numbers, and outbox roles that let an `upsert-issue` op target them. No GitHub calls happen here;
the flusher branch is 48-06 and materialisation is 48-07.

Purpose: U-1, U-3, D-03. Output: additive changes to gh-trd, gh-mapping, gh-outbox with tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: characterization first — before changing `serializeMapping` and `OP_KINDS`, add a test pinning today's output for a mapping
  with milestones/objectives/trds (no entities) and today's error string for `role:'todo'`; commit RED tests for the new behaviour, then GREEN.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Additive only. Do not change `ID_LINE_RE`, `encodeTrdBody`, `decodeTrdBody`, `setTrd`, `TRD_ROLES` or the order of existing keys.
  The 1107 gh-* tests from 47 must stay green.
- Tests: hand-written literal bodies and mappings; `hermeticEnv()` where the outbox journal is touched. No real GitHub, no real
  `~/.claude`, no port 8080, no property-based tests.

## Decisions

D-03 (entity ids, labels, types), U-1, U-3. Settled here:

- **Entity id grammar** (`ENTITY_ID_RE`): `^(todo|debug)-([a-z0-9][a-z0-9._-]{0,99})$` or `^quick-(\d+)$`. `<stem>` is the file stem
  lowercased (todo files are dated, e.g. `todo-2026-07-31-harden-df-tools-health`); the verb layer (48-12) builds ids, this layer only
  validates.
- **Entity codec**: header lines `<!-- devflow:id=<entity-id> -->` and `<!-- devflow:file=<rel-to-.planning> -->`, then the text
  normalised like TRD text (`normalise`). The file line carries the path relative to `.planning/` (e.g. `todos/pending/x.md`,
  `quick/12-fix-x/12-JOB.md`) so a pull rebuilds the exact location. Separate regex from `ID_LINE_RE` so TRD decoding stays strict.
- **Mapping**: `entities` is a new top-level key rendered after `trds` ONLY when it has at least one entry (so every existing mapping file
  is byte-identical after a read-modify-write). Entry shape mirrors `setTrd`: `{issue_number, rest_id, role, comment_ids}`; role must agree
  with the id prefix.
- **ENTITY_ROLES** (frozen):
  `{ todo: {label:'devflow:todo', type:null}, debug: {label:'devflow:debug', type:'Debug'}, quick: {label:'devflow:quick', type:'Quick'} }`.
  `config.github.labels.<role>` overrides the label exactly as 47's `labels.trd`/`labels.decision` do (the flusher applies it).

## Test list

gh-trd
1. Characterization: `encodeTrdBody`/`decodeTrdBody` on the 47 fixture TRD unchanged (existing tests cover; add none).
2. `encodeEntityBody({id:'todo-2026-07-31-a', file:'todos/pending/2026-07-31-a.md', text})` → two header lines + text; `decodeEntityBody` returns `{ok:true, id, file, text}` byte-identical, also for CRLF input (normalised) and empty text.
3. `decodeTrdBody(entityBody)` → `{ok:false}`; `decodeEntityBody(trdBody)` → `{ok:false}`; a human-written body → `{ok:false, error}`.
4. `encodeEntityBody` with an id outside the grammar (`todo-`, `quick-x`, `47-01`) throws `TypeError`.

gh-mapping
5. Characterization: `serializeMapping` of a hand-built v3 mapping with milestones/objectives/trds and no `entities` equals a pinned literal string (copy today's output first, commit as RED-free characterization).
6. `toEntityId`: `'todo-a'` → `{id:'todo-a', role:'todo'}`; `'quick-12'` → quick; `'quick-x'`, `'47-01'`, `'todo-'` → null.
7. `setEntity(m, 'debug-x', {issue_number:5, rest_id:9005})` → role defaults to debug; `role:'todo'` for a debug id throws; missing rest_id throws; `comment_ids` merges per kind like setTrd.
8. `serializeMapping` with entities renders `entities` after `trds`, keys natural-sorted; read back with `readMappingV3` round-trips.
9. `listEntities(m, 'todo')` returns only todo ids, sorted.

gh-outbox
10. Characterization: `validateOp` for `upsert-issue` with role `trd`/`decision` unchanged; error message for role `bogus` lists all roles.
11. `validateOp({kind:'upsert-issue', target:{id:'todo-a', role:'todo'}, payload:{title:'x', body:'', labels:[]}})` → valid; `target:{id:'todo-a', role:'debug'}` → error "entity id todo-a does not match role debug"; `target:{id:'47-01', role:'todo'}` → error.
12. `ENTITY_ROLES` is frozen and deep-equals the table above; `ROLES` deep-equals `['trd','decision','todo','debug','quick']`.
13. `upsert-comment` and `patch-issue` targets accept entity ids (`quick-12` with kind `summary`; `debug-x` with `{state:'closed', state_reason:'completed'}`).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Entity body codec in gh-trd (tests 2-4)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: add tests 2-4 to `gh-trd.test.cjs` in a new `describe('entity codec (48-02)')`. Commit `test(48-02): entity body codec`.
GREEN: add `ENTITY_ID_RE`, `ENTITY_ID_LINE_RE`, `encodeEntityBody`, `decodeEntityBody` next to the TRD codec, reusing `fileLine`, `normalise`
and the two-line parse in `decodeTrdBody` (factor a private `decodeHeader(body, idLineRe)` helper only if both callers keep their exact
results; the existing decodeTrdBody tests are the guard). Export them. Commit `feat(48-02): entity body codec`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</verify>
  <done>Tests 2-4 pass; every pre-existing gh-trd test passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mapping entities section (tests 5-9)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-mapping.cjs, plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</files>
  <action>
First commit test 5 alone (characterization, passes on today's code) as `test(48-02): pin mapping serialisation`.
RED: tests 6-9. Commit `test(48-02): mapping entities`.
GREEN: add `'entities'` to `KNOWN_TOP_LEVEL`; `toEntityId` (import `ENTITY_ID_RE` from gh-trd, or duplicate the literal with a comment if
gh-mapping must not require gh-trd — check the existing require graph first and avoid a cycle); `getEntity`, `setEntity` (validation copied
from `setTrd`, role from the id prefix), `listEntities(mapping, role)`. In `serializeMapping` push `['entities', ...]` after `trds` only when
`isPlainObject(mapping.entities) && Object.keys(mapping.entities).length`. Commit `feat(48-02): mapping entities section`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs</verify>
  <done>Tests 5-9 pass; migration 0009 suite green; pinned serialisation unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Outbox roles and entity-aware validation (tests 10-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</files>
  <action>
Commit test 10 (characterization) first. RED: tests 11-13; commit `test(48-02): outbox entity roles`.
GREEN: extend `ROLES` (L87) to `['trd','decision','todo','debug','quick']`; add and export frozen `ENTITY_ROLES`; in the `upsert-issue` check,
after the role check, when the role is an entity role require `toEntityId(t.id)` (or the regex) to return the same role, else return
`entity id <id> does not match role <role>`; when the role is trd/decision keep today's path. Commit `feat(48-02): outbox entity roles`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</verify>
  <done>Tests 10-13 pass; outbox and flusher suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-trd.cjs` L61 `ID_LINE_RE = /^<!--\s*devflow:id=([0-9]+(?:\.[0-9]+)?(?:-[0-9]+)?)\s*-->$/` — numeric only; keep it.
- `gh-mapping.cjs` L544 `setTrd` — validation and field order to mirror in `setEntity`; L380 `serializeMapping` — the render order.
- `gh-outbox.cjs` L121 `OP_KINDS['upsert-issue'].check` — where the role check lives.
</codebase_examples>
<anti_patterns>
- Widening `ID_LINE_RE`: `gh-cache.materialize` would decode entity bodies found under a TRD label as TRDs.
- Always rendering `entities: {}`: every existing `.gh-mapping.json` would change on the next write.
</anti_patterns>
<error_recovery>
- If gh-mapping cannot require gh-trd without a cycle, duplicate `ENTITY_ID_RE` and add a test asserting both regexes have the same `.source`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- The full gh-* suite is green (`node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'`).
- `git diff` shows no change to `ID_LINE_RE`, `TRD_ROLES`, or existing exports' signatures.
</verification>

<success_criteria>
Todo, debug and quick issues have an id, a body format and a mapping slot, and the outbox accepts ops targeting them, with 47's contract unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-02-SUMMARY.md`
</output>
