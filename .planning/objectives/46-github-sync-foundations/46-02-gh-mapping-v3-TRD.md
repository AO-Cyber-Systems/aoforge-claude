---
objective: 46-github-sync-foundations
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs
autonomous: true
requirements: [GSF-01]
must_haves:
  truths:
    - "`toObjectiveId` maps `46`, `046`, `46-github-sync-foundations` to `46`; `2.1` and `02.1-foo` to `2.1`; `0` and `00-refine-defaults-table` to `0`; junk to null"
    - "`resolveObjective(cwd, arg)` returns `{id, dir, roadmapNumber}` for a number, padded number or dir name, and null for an unknown objective"
    - "`migrateMapping(raw, index)` converts v1 (numbers), v2 (objects), mixed maps, dir-name keys and padded keys into ONE v3 shape; applying it twice equals applying it once"
    - "v2 keys that `parseInt` collapsed (`2` really `2.1`) are re-keyed only when an OBJECTIVE.md `github_issue` names that issue; otherwise kept with `verified_at: null`; two legacy keys landing on one id with different issues go to `conflicts`"
    - "`readMappingV3` converts lazily in memory and never writes; `writeMappingV3` writes atomically with numerically sorted keys and refuses a mapping whose version is above 3"
    - "Migration 0009 (auto) converts `.planning/.gh-mapping.json` to v3 and normalises `.planning/.gh-sync-state.json` keys to ids; a second run is a no-op (`detect` → applies:false); dry-run writes nothing"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-mapping.cjs
      provides: "MAPPING_VERSION, toObjectiveId, resolveObjective, listObjectiveIndex, migrateMapping, normalizeSyncStateKeys, readMappingV3, writeMappingV3, getEntry, setEntry"
    - path: plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.cjs
      provides: "id '0009', safety 'auto', since '2.13.0', detect, apply"
  key_links:
    - "46-05 gh-issue, 46-06 gh-pull/sync-state/conflict, 46-07/46-08 gh.cjs use toObjectiveId/resolveObjective at every entry point and read/write mapping only through gh-mapping"
    - "upgrade.cjs loadRegistry picks up migrations/0009-*.cjs by filename; upgrade-project.js commits `changed` files"
---

# TRD 46-02: Mapping v3, one objective id, migration 0009 (GSF-01)

<objective>
Create `lib/gh-mapping.cjs`: one identity function for objectives, one mapping shape (v3), one pure
converter from v1/v2, and an atomic writer. Add migration 0009 that converts the mapping on disk and
normalises sync-state keys. New files only; callers are rewired in 46-05..46-08.

Purpose: defects 1 and 2 (two mapping shapes → `issue edit "[object Object]"`; three key spaces →
pull never finds push's entries, decimals collide).
Output: `gh-mapping.cjs`, migration 0009, tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh-mapping.cjs                      ← CREATE
├── gh-mapping.test.cjs                 ← CREATE
└── migrations/
    ├── 0009-gh-mapping-v3.cjs          ← CREATE
    └── 0009-gh-mapping-v3.test.cjs     ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN per behavior group. Commit via
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Temp project dirs only (`fs.mkdtempSync`); migration tests use `__fixtures__/upgrade-fixtures.cjs`
  helpers (`makeFakeHome`, and project builders) — never this repo's `.planning/` or real `~/.claude`.
- Hand-built fixtures; no property-based tests; no `.feature` files. No network. Never port 8080.
- Research reference: `46-RESEARCH.md` → "Pattern 1", "Pattern 2", "Migration mechanics", "Code Examples: Id normalisation".

<embedded_context>

<codebase_examples>
v3 shape (write exactly this; keep `issue_id`/`state_comment_id` names so older v2 readers still parse):
```json
{
  "version": 3,
  "repo": "owner/name",
  "milestones": { "v1.4": 7 },
  "objectives": { "46": { "issue_id": 123, "state_comment_id": 456, "verified_at": null } },
  "trds": {}
}
```
Optional top-level `conflicts: { "<id>": [ { "legacy_key": "2", "issue_id": 20, "state_comment_id": null } ] }`
— present only when non-empty.

This repo's real v2 file (use as a hand-copied fixture):
`{"milestone_id":null,"objectives":{"0":{"issue_id":20,"state_comment_id":4374249280}}}`

Migration module contract (see `migrations/0008-runtime-state-untrack.cjs` exports at line 216):
```js
module.exports = { id: '0008', /* name/description */, since: '2.12.0', safety: 'auto', detect, apply };
// detect(ctx) -> { applies, reason }   apply(ctx) -> { changed: [relPaths], notes }   ctx.projectRoot, ctx.dryRun
```
Atomic write helper: `require('./sync-state.cjs').atomicWrite(filePath, content)` (tmp + rename).
Frontmatter parse: `require('./frontmatter.cjs').extractFrontmatter(content)`.
ROADMAP headers: `### Objective N: name` (gh.cjs `listObjectives`, regex `[\d.]+`).
</codebase_examples>

<anti_patterns>
- `parseInt(dirPrefix)` anywhere: `parseInt("02.1")` is 2. Use `toObjectiveId`.
- Using the dir name as a mapping or sync-state key.
- Guessing a re-key for an ambiguous legacy key. Keep it, mark `verified_at: null`, let 46-05's
  marker verification decide.
- Writing on read. `readMappingV3` is pure in-memory conversion; only writers persist.
- Silently downgrading an unknown higher version.
</anti_patterns>

<error_recovery>
- Unparseable mapping JSON: `readMappingV3` returns an empty v3 mapping plus `{warnings:['unparseable .gh-mapping.json']}`;
  the migration's `detect` reports `applies:false, reason:'unparseable mapping — left untouched'` (never overwrite a file it cannot read).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/sync-state.cjs
@plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.cjs
@plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
</context>

<gotchas>
- TRD ids (`46-02`) are reserved for objective 47's `trds` map. `toObjectiveId` handles objective ids
  only; `46-02` would read as objective 46 with slug `02` — document that `trds` keys are out of scope.
- `listObjectiveIndex(cwd)` must include ROADMAP-only objectives (no dir yet) with `dir: null`.
- Sync-state stays `version: 1` on disk; only keys change. When two keys normalise to one id, keep
  the record with the newest `last_synced_at`.
</gotchas>

## Test list

toObjectiveId / resolveObjective
1. Table: `46`→`46`, `046`→`46`, `46-github-sync-foundations`→`46`, `2.1`→`2.1`, `02.1-foo`→`2.1`,
   `0`→`0`, `00-refine-defaults-table`→`0`, `  7 `→`7`, `abc`→null, `''`→null, `null`→null.
2. `resolveObjective(tmp, '02.1')`, `('2.1')`, `('02.1-foo')` all return `{id:'2.1', dir:'02.1-foo', roadmapNumber:'2.1'}`
   in a temp project with dirs `02-a`, `02.1-foo`, `03-b`; an objective present only in ROADMAP returns `dir:null`;
   unknown → null.
3. `listObjectiveIndex(tmp)` returns `[{id, dir, roadmapNumber, github_issue}]` sorted numerically
   (`2`, `2.1`, `3`, `10`), `github_issue` read from each OBJECTIVE.md frontmatter.

migrateMapping (pure; input `(raw, index)`)
4. v1 `{milestone_id: 5, objectives: {"2": 11}}` → v3 `objectives["2"] = {issue_id:11, state_comment_id:null, verified_at:null}`,
   `milestones:{}` (a bare `milestone_id` has no title → dropped, noted in `notes`), `trds:{}`.
5. v2 real fixture (this repo's shape) → `objectives["0"] = {issue_id:20, state_comment_id:4374249280, verified_at:null}`.
6. Mixed v1/v2 entries → one shape; no value is ever a bare number or `[object Object]` string.
7. Dir-name key `"02.1-foo"` and padded key `"046"` → re-keyed to `"2.1"`, `"46"`.
8. parseInt-collapsed v2 key `"2"` whose issue 31 appears as `github_issue: o/r#31` on objective `2.1` → re-keyed `"2.1"`.
   Without such a frontmatter hit → stays `"2"`, `verified_at:null`.
9. Collision: keys `"02-a"` (issue 11) and `"2"` (issue 12) → `objectives["2"]` absent, `conflicts["2"]` lists both;
   same issue under two keys → merged silently.
10. Idempotent: `migrate(migrate(x).mapping)` deep-equals `migrate(x).mapping` for fixtures 4-9; `changed:false` on the second run.
11. `version: 4` input → `{error: /unsupported mapping version 4/}`.
12. `normalizeSyncStateKeys({version:1, objectives:{"02-a":{last_synced_at:'2026-01-01T00:00:00Z'}, "2":{last_synced_at:'2026-02-01T00:00:00Z'}}})`
    → single key `"2"` holding the newer record.

read / write
13. `readMappingV3` on a missing file → empty v3; on a v2 file → v3 in memory and the file bytes are unchanged.
14. `writeMappingV3` writes sorted keys (`"2"`, `"2.1"`, `"10"`), trailing newline, via tmp+rename; refuses `version > 3`.
15. `getEntry(m, '046')` / `setEntry(m, '02.1-foo', {...})` normalise the key through `toObjectiveId`.

Migration 0009 (follow the 0008 test file's structure)
16. Contract: `id '0009'`, `safety 'auto'`, `since '2.13.0'`, functions exported.
17. `detect`: no mapping → applies:false; v3 mapping and normalised sync-state → applies:false; v1 or v2 → applies:true;
    v3 mapping but sync-state has a dir-name key → applies:true.
18. `apply` on v2 fixture → file is v3, `changed` lists `.planning/.gh-mapping.json` (and `.planning/.gh-sync-state.json` when rewritten);
    `dryRun:true` → nothing written, same `changed` report.
19. Idempotency: apply, then detect → applies:false; second apply → `changed: []`.
20. Registry: `upgrade.loadRegistry()` includes `0009` after `0008` (import `upgrade.cjs`; read-only).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Objective identity (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-mapping.cjs, plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</files>
  <action>
RED: tests 1-3 with hand-built temp projects (ROADMAP with `### Objective 2: a`, `### Objective 2.1: foo`,
`### Objective 3: b`, `### Objective 10: z`; dirs with OBJECTIVE.md frontmatter). Commit RED.

GREEN:
- `toObjectiveId(arg)`: `String(arg ?? '').trim()`; match `/^(\d+)(\.\d+)?(?:-.*)?$/`; return
  `String(parseInt(m[1],10)) + (m[2] || '')`. (parseInt on the integer part only is correct here.)
- `listObjectiveIndex(cwd)`: union of `.planning/objectives/*` dirs whose name yields an id and ROADMAP
  `### Objective ([\d.]+):` headers; dedupe by id (dir wins); `github_issue` from OBJECTIVE.md frontmatter; numeric sort
  (compare integer part, then decimal part).
- `resolveObjective(cwd, arg)`: `id = toObjectiveId(arg)`; find index entry by id; null if absent.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</verify>
  <done>Tests 1-3 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pure v1/v2→v3 conversion, sync-state key normaliser, reader and writer (tests 4-15)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-mapping.cjs, plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</files>
  <action>
RED: tests 4-15. Commit RED.

GREEN: `migrateMapping(raw, index = [])` → `{ mapping, changed, conflicts, notes, error? }`.
Approach:
1. `raw` null/undefined → empty v3, `changed:false`. `raw.version > 3` → `{error}`. `raw.version === 3` → re-run step 3 only (normalise keys), so the function is idempotent.
2. Carry `repo` if present; carry `milestones` if present; v1/v2 `milestone_id` is dropped with a note (no title → cannot key it; GSF-05 re-resolves by title).
3. For each `[key, val]` in `raw.objectives`: `entry = typeof val === 'number' ? {issue_id: val, state_comment_id: null} : {issue_id: val.issue_id ?? null, state_comment_id: val.state_comment_id ?? null}`;
   `verified_at = val.verified_at ?? null`; `id = toObjectiveId(key)`; skip entries with no issue_id (note).
   parseInt-collapse repair: if the index has an objective whose `github_issue` ends with `#<issue_id>` and its id differs from `id`, use that id.
4. Group by id: same issue_id → merge (prefer non-null `state_comment_id`, non-null `verified_at`); different issue_ids → move all to `conflicts[id]` and omit `objectives[id]`.
5. `changed` = deep-inequality of output vs input (JSON of sorted keys).
`normalizeSyncStateKeys(state)` → `{state, changed}` (test 12).
`readMappingV3(cwd)` → `{...migrateMapping(raw, listObjectiveIndex(cwd)).mapping}`; attach non-enumerable or separate `warnings` via a second function `readMappingV3WithReport(cwd)` returning `{mapping, conflicts, notes, warnings}`.
`writeMappingV3(cwd, mapping)` → sorted serialisation, `atomicWrite`, `{ok:true}` or `{ok:false, error}` for version &gt; 3.
`getEntry`/`setEntry` normalise keys.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</verify>
  <done>Tests 1-15 pass; `migrate∘migrate == migrate` for every fixture.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Migration 0009 gh-mapping-v3 (tests 16-20)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.cjs, plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs</files>
  <action>
RED: tests 16-20 modelled on `0008-runtime-state-untrack.test.cjs` (fake HOME, temp project, ctx `{projectRoot, dryRun}`). Commit RED.

GREEN: `0009-gh-mapping-v3.cjs` with header comment explaining GSF-01 and why `auto` (local, deterministic,
no judgement; lazy read covers anyone who skips it). `detect` / `apply` call `gh-mapping.migrateMapping` and
`normalizeSyncStateKeys`; write with `atomicWrite` unless `ctx.dryRun`. `changed` lists only files whose bytes change.
Conflicts are preserved in the file (`conflicts` block) and summarised in `notes` — the migration never picks a winner.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs</verify>
  <done>0009 tests pass; existing upgrade and doctor e2e tests stay green with the new migration registered.</done>
  <recovery>If an existing upgrade/doctor test hard-codes the migration count or last id, update that assertion in a separate commit and note it in the SUMMARY (do not weaken other assertions).</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "parseInt\(" plugins/devflow/devflow/bin/lib/gh-mapping.cjs` shows only the integer-part use inside `toObjectiveId` and numeric sorting.
- Migration 0009 detect/apply/idempotency/dry-run tests green.
</verification>

<success_criteria>
One mapping shape and one id function exist, fully tested, ready for the rewire TRDs; this repo's
own v2 mapping converts to `objectives["0"]` without loss.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-02-SUMMARY.md`
</output>
