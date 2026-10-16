---
objective: 46-github-sync-foundations
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-project.cjs
  - plugins/devflow/devflow/bin/lib/gh-project.test.cjs
autonomous: true
requirements: [GSF-07]
must_haves:
  truths:
    - "Project fields (single-select options and iterations) are discovered from GitHub via GraphQL for the given `org_project` node id, following `pageInfo` pagination"
    - "Discovered fields are cached out of the repo at `$DEVFLOW_GH_CACHE_DIR/<projectId>.json` (default `~/.claude/devflow/state/gh-project/`) with a TTL (default 360 minutes, `github.project_cache_ttl_minutes`); a fresh cache makes zero gh calls"
    - "A wanted option missing from a fresh cache triggers exactly one refresh; still missing after refresh is a warning, never a failure"
    - "Option names are never hardcoded: `Q3 2028` resolves whenever the mocked project offers it"
    - "`updateItemFields` adds the issue to the project first, then sets each field with the right value shape (`singleSelectOptionId` or `iterationId`)"
    - "Nothing under `lib/` outside tests reads `__fixtures__/` (this module included)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-project.cjs
      provides: "DEFAULT_TTL_MINUTES, cacheDir, readCache, writeCache, discoverProjectFields, getProjectFields, resolveFieldValue, updateItemFields"
  key_links:
    - "46-07 replaces gh.cjs updateProjectFields' PRODUCT_ROADMAP_FIELDS lookup with gh-project.getProjectFields + updateItemFields, passing gh-client ghRead/ghWrite as `run`"
---

# TRD 46-04: Project field discovery with a TTL cache (GSF-07)

<objective>
Create `lib/gh-project.cjs`: discover a Projects v2 board's field ids, single-select options and
iterations from GitHub (GraphQL), cache them out of the repo with a TTL, resolve a field/value pair to
ids, and apply field values to an issue's project item. Dependency-injected gh access (`opts.run`) so
this TRD does not depend on 46-01; 46-07 wires in gh-client.

Purpose: defect 7 (field ids read at runtime from a test fixture with a hardcoded project id; quarter
options frozen to whatever the cassette captured).
Output: `gh-project.cjs` + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Tests set `DEVFLOW_GH_CACHE_DIR` to a `fs.mkdtempSync` dir and pass `opts.env`/`opts.now`; nothing reads or writes the real `~/.claude`.
- The cassette `__fixtures__/gh-cassettes/product-roadmap-fields.json` may be loaded BY THE TEST to build a mocked GraphQL response; the module must not read it.
- No real GitHub; no property-based tests; no `.feature` files. Never port 8080.
- Research reference: `46-RESEARCH.md` → "Pattern 7: Project field discovery", Pitfall 13.

<embedded_context>

<codebase_examples>
Current shape being replaced (gh.cjs:1193-1308): `PRODUCT_ROADMAP_FIELDS` IIFE reads the cassette at
module load with `_project_id: 'PVT_kwDODwqLrc4BRsOP'`; `updateProjectFields(issueRef, projectId, fields)`
calls `addToProject` then, per field, the mutation:
```
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) { updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId } }) { projectV2Item { id } } }
```
invoked as `['api','graphql','-f',`query=${mutation}`,'-F',`projectId=...`,'-F',`itemId=...`,'-F',`fieldId=...`,'-F',`optionId=...`]`.
Unknown field/option → warning. Keep these semantics.

GraphQL pagination reference: gh.cjs `walkProject` (1557-1686) — `pageInfo { hasNextPage endCursor }` loop with a MAX_PAGES guard.

Out-of-repo state + env override precedent: `lib/awareness-store.cjs` `stateDir(env, home)`.
Atomic write: `require('./sync-state.cjs').atomicWrite`.
</codebase_examples>

<anti_patterns>
- Querying `dataType`, `duration` or `completedIterations` (unverified schema fields, research open question 4). Classify fields by `__typename` and only request `id name`, `options { id name }`, `configuration { iterations { id title startDate } }`.
- Putting the cache in `.planning/` (hooks audit forbids runtime dotfiles there; objective 47 makes it a cache).
- Failing the sync on a missing option or missing project scope. Warn and continue.
</anti_patterns>

<error_recovery>
- GraphQL errors (`{"errors":[...]}` in stdout, or ok:false) → `{ok:false, error, warnings}`; callers treat as warning.
- Corrupt cache JSON → treat as a miss and overwrite on the next successful discovery.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/awareness-store.cjs
</context>

<research_context>
Discovery query (node id; no org/number lookup):
```graphql
query($id: ID!, $cursor: String) {
  node(id: $id) { ... on ProjectV2 {
    fields(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on ProjectV2Field { id name }
        ... on ProjectV2SingleSelectField { id name options { id name } }
        ... on ProjectV2IterationField { id name configuration { iterations { id title startDate } } }
      }
    }
  } }
}
```
Invoke: `['api','graphql','-f',`query=${Q}`,'-F',`id=${projectId}`]` plus `'-F', `cursor=${c}`` after the first page.
Value shapes: single select `{ singleSelectOptionId: $v }`; iteration `{ iterationId: $v }`. The item must be added
(`addProjectV2ItemById`) before any update; the two cannot be combined in one mutation.
</research_context>

## Test list

1. `discoverProjectFields('PVT_x', {run})` with a mocked single-page response built from the cassette → model
   `{project_id, fetched_at, fields: {Status:{id, kind:'single_select', options:{Todo:'f75ad846',...}}, Title:{id, kind:'field'}, ...}}`.
2. Two-page response (`hasNextPage:true, endCursor:'c1'` then false) → fields from both pages; second call carries `cursor=c1`; MAX_PAGES guard stops a runaway loop at 20.
3. Iteration field → `kind:'iteration'`, `iterations:{'Sprint 5':'it_5'}`.
4. GraphQL `errors` payload → `{ok:false}`, no throw.
5. `getProjectFields(projectId, {run, env, now})`: miss → one discovery + cache file written under `DEVFLOW_GH_CACHE_DIR`; second call within TTL → zero `run` calls.
6. Expired cache (now > fetched_at + TTL) → rediscovers; `ttlMinutes` option overrides the default 360.
7. `resolveFieldValue(model, 'Quarter', 'Q3 2028')`: present → `{fieldId, value:{singleSelectOptionId}}`; absent → null.
8. `getProjectFields(..., {want:{Quarter:'Q1 2028'}})` with a fresh cache lacking the option → exactly one refresh; option present after refresh → resolves; absent → `warnings:['unknown option for Quarter: Q1 2028']`.
9. `updateItemFields({issueRef:'o/r#5', projectId, fields:{Status:'In Progress', Quarter:'Q9 2099'}, run})`: add-item call first,
   then one mutation for Status with `singleSelectOptionId`; Quarter unknown → warning; result `{ok:true, fields_updated:['Status'], warnings:[...]}`.
10. Iteration field update uses `iterationId` in the mutation text.
11. Unknown field name → warning `unknown field: <name>`, no mutation.
12. Repo guard: read every non-test `*.cjs` under `lib/` (skip `__fixtures__/` and `*.test.cjs`) and assert none contains `__fixtures__` —
    mark this one `{ todo: 'enabled by 46-07' }` if gh.cjs still reads the cassette; 46-07 removes the `todo`. Assert here that `gh-project.cjs` itself does not.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: GraphQL discovery and TTL cache (tests 1-6, 12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-project.cjs, plugins/devflow/devflow/bin/lib/gh-project.test.cjs</files>
  <action>
RED: tests 1-6 and 12. Build mocked GraphQL stdout in the test from the cassette's `fields` array
(`{data:{node:{fields:{pageInfo:{hasNextPage:false,endCursor:null}, nodes: cassette.fields.map(f => ({__typename: f.type, id: f.id, name: f.name, ...(f.options ? {options: f.options} : {})}))}}}}`).
`run` is a recorded fake `(args) => ({ok:true, status:0, stdout, stderr:''})`. Commit RED.

GREEN:
- `cacheDir(env = process.env)` → `env.DEVFLOW_GH_CACHE_DIR || path.join(os.homedir(), '.claude','devflow','state','gh-project')`
  (read `os.homedir()` lazily inside the function, never at module load).
- `discoverProjectFields(projectId, {run})` → paginated query, `kind` from `__typename`
  (`ProjectV2SingleSelectField`→`single_select`, `ProjectV2IterationField`→`iteration`, else `field`).
- `readCache`/`writeCache` (atomic; file name = projectId with non `[A-Za-z0-9_-]` replaced by `_`).
- `getProjectFields(projectId, {run, env, now = Date.now, ttlMinutes = 360, refresh = false})` → `{ok, model, source:'cache'|'github', warnings}`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs</verify>
  <done>Tests 1-6 and 12 pass; TTL hit asserts `run` call count 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Value resolution, refresh-once and item updates (tests 7-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-project.cjs, plugins/devflow/devflow/bin/lib/gh-project.test.cjs</files>
  <action>
RED: tests 7-11. Commit RED.

GREEN:
- `resolveFieldValue(model, name, value)` → `{fieldId, value:{singleSelectOptionId}|{iterationId}}` or null.
- `getProjectFields(..., {want})`: after a cache hit, if any wanted (name,value) does not resolve, refresh once
  (`source:'github'`), then report still-missing pairs as warnings.
- `updateItemFields({issueRef, projectId, fields, run, env, now})`:
  1. `getProjectFields` with `want = fields`.
  2. Add item: `mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p, contentId:$c}) { item { id } } }` — needs the issue node id:
     first `['api','graphql','-f','query=query($o:String!,$n:String!,$num:Int!){repository(owner:$o,name:$n){issue(number:$num){id}}}','-F','o=..','-F','n=..','-F','num=..']`.
     (Port the logic of gh.cjs `addToProject` + the item-id fallback query from `updateProjectFields`; read those functions first.)
  3. One `updateProjectV2ItemFieldValue` mutation per resolvable field; per-field errors collected; `ok = errors.length === 0`.
# GOTCHA: `-F` is correct for GraphQL variables (typed); these are ids, never free text starting with `@`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs</verify>
  <done>Tests 1-12 pass (12 may be `todo` for gh.cjs only).</done>
  <recovery>If porting addToProject's semantics is unclear, keep gh.cjs `addToProject` untouched and accept an injected `addItem(issueRef, projectId) -> {ok,item_id}` option; 46-07 passes gh.cjs's. Record the choice in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-project.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "__fixtures__|PVT_kwDODwqLrc4BRsOP" plugins/devflow/devflow/bin/lib/gh-project.cjs` → no matches.
- Cache lives under `DEVFLOW_GH_CACHE_DIR` in tests; no path under `.planning/`.
</verification>

<success_criteria>
Project fields are live-discovered and cached with a TTL; new quarter options work without a release.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-04-SUMMARY.md`
</output>
