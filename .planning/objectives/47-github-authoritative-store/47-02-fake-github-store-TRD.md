---
objective: 47-github-authoritative-store
trd: "02"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-store-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs
autonomous: true
requirements: [GST-01, GST-05, GST-08]
must_haves:
  truths:
    - "The fake accepts `runGh(args, opts)` and reads `opts.input` as the JSON body of `gh api --input -`"
    - "REST-created issues get an `id` that never equals their `number` (`1_000_000 + number`); sub-issue and dependency endpoints accept ONLY that id and 404 when a number is sent (Pitfall 1)"
    - "Sub-issues (list, add, parent, remove), dependencies (blocked_by list/add/remove, blocking list), repo meta, org issue types, issue-field definitions and values are implemented with GitHub's rules: one parent, 100 children, duplicate link 422, same owner"
    - "DevFlow's own link, dependency, comment and label writes bump the issue's `updated_at` exactly as GitHub does, so a test can prove `updated_at` alone is not a remote-edit signal (Pitfall 2)"
    - "`createFakeGitHub({ownerType:'User', hasWiki:false})` answers 404 for org issue types and fields; `subIssuesApi:false` answers 404 for sub-issue endpoints"
    - "`setOffline(true)` makes every call fail like a network outage (status null, `could not resolve host`) until `setOffline(false)`; `humanEditComment` edits a comment without a recorded call"
    - "`makeStoreProject()` builds, by hand, a temp project with one objective, 3 TRDs in 2 waves, OBJECTIVE/CONTEXT/RESEARCH, PROJECT/REQUIREMENTS and config; `oversizedTrdText(n)` builds a TRD whose encoded body is exactly n chars"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "createFakeGitHub extended in place: REST issues with ids/types/milestone numbers, sub_issues, dependencies, repo meta, org issue-types, issue-fields, setOffline, humanEditComment, runGh(args, opts)"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-store-fixtures.cjs
      provides: "makeStoreProject, oversizedTrdText, hermeticEnv, STORE_FIXTURE constants"
  key_links:
    - "Installed only through gh-client._setRunGh(fake.runGh); every 47 test (06, 07, 08, 09, 10, 11, 12, 13) drives the store through this one fake"
---

# TRD 47-02: Fake GitHub for the authoritative store + store fixture builder (fixture TRD)

<objective>
Extend `__fixtures__/gh-fake.cjs` IN PLACE (never fork it) so it speaks every REST shape objective 47 uses, and add a
hand-built fixture builder for a store-shaped project. This is the fixture-builder task required by
`fixture_strategy: generators`: all later 47 tests reuse these builders instead of inventing data.

Purpose: GST-01/05/08 cannot be tested without sub-issues, dependencies, ids-not-numbers, capability variants and an
offline switch. Output: extended fake + cases in `gh-fake.test.cjs`; new `gh-store-fixtures.cjs` + its test.
No production code changes.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: add the failing `gh-fake.test.cjs` / `gh-store-fixtures.test.cjs` cases first (RED commit), then extend the fixture (GREEN).
  Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built data only (`no_llm_test_data`): every title, body and id in the fixture is written literally in the builder.
- Keep the fake loud: any argv shape it does not implement still returns `[gh-fake] unsupported: <argv>`; `--search` stays unsupported.
- Existing 46 behaviour must not change: `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs` stays green.
- No network, no real `gh`, never port 8080.
- Research reference: `47-RESEARCH.md` → "GitHub API facts", "Test strategy", Pitfalls 1, 2.

## Decisions taken in planning

- **D-07 Issue-field definition path (LOW confidence, research Open Q1).** The fake serves `GET orgs/{o}/issue-fields` returning
  `[{id, name, data_type}]`. That path is UNCONFIRMED against GitHub; 47-06 keeps it in one constant and treats any failure as
  "fields unavailable". Tests never depend on the real shape — they depend only on this fake, configured per test.
- **D-08 Unknown or disabled type name (research Open Q2).** The fake mimics the documented behaviour: a `type` the repo cannot set
  (no push, user owner, type not enabled) is silently dropped → response `type: null`. Callers must check the response (47-07).
- **D-11 Scan labels.** TRD and Decision issues carry labels `devflow:trd` / `devflow:decision` in both modes (they are how DevFlow
  list-and-scans without search). The fake's REST list `GET repos/o/r/issues?labels=<l>&state=all` filters on them.

<embedded_context>

<codebase_examples>
Existing fake entry and controls (`__fixtures__/gh-fake.cjs:103`, `:449-497`):
```js
function createFakeGitHub({ repo = 'o/r', scopes = [...], commentPageSize = 30, graphql = null, now = null } = {}) { ... }
function runGh(args) { const argv = ...; log.push(argv); ...failures...; return dispatch(argv); }
return { runGh, issues, comments, milestones, labels, calls, writes, writeTimes, failNext, humanEditBody, seedIssue, seedComment, seedMilestone };
```
API routing pattern to follow (`gh-fake.cjs:351-430`): `runApi` parses with `parseArgs(args, 1, API_VALUE_FLAGS, API_BOOL_FLAGS)`,
computes `method` from `-X/--method` (else POST when fields present), then matches `rawPath` with one regex per route;
`notFound()` returns `gh: Not Found (HTTP 404)`; validation errors return `gh: Validation Failed (HTTP 422)` + JSON body.
`respondList(rows, p, qs)` already implements `--paginate --slurp`, `per_page`, `page` — reuse it for every list route.
`fieldMap(p)` reads `-f/-F`; `-F` values arrive as strings: coerce ints with `Number()` in the routes that need ids.

46 e2e harness to copy for hermetic env (`gh-e2e.test.cjs:56-100`): temp root via `fs.mkdtempSync(path.join(os.tmpdir(), ...))`,
`.planning/config.json` = `{github:{enabled, repo:'o/r'}}`, `capture(fn)` for process.exit/stdout, fake clock via
`client._setNow/_setSleep`, `HOME` and `DEVFLOW_GH_CACHE_DIR` pointed at temp dirs, `_resetClient()` in afterEach.
</codebase_examples>

<anti_patterns>
- Making ids equal to numbers "for convenience" — it hides Pitfall 1 in every later test.
- A second fake module. Extend `gh-fake.cjs` only.
- Generating fixture text programmatically from a model or random source. `'x'.repeat(n)` padding for size boundaries is fine.
- Implementing `--search` or GraphQL `addSubIssue` in the fake. 47 uses REST; GraphQL stays caller-handled.
</anti_patterns>

<error_recovery>
- If an existing 46 test breaks because `updated_at` now advances on link/comment writes, the 46 test was asserting an incidental
  value: adjust the fake to keep the existing `updatedAt` (gh `--json`) behaviour for the gh-noun commands and add REST
  `updated_at` as the SAME internal field. Do not edit 46 tests to weaken them; record the decision in the SUMMARY.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── __fixtures__/
│   ├── gh-fake.cjs                 ← MODIFY
│   └── gh-store-fixtures.cjs       ← CREATE
├── gh-fake.test.cjs                ← MODIFY
└── gh-store-fixtures.test.cjs      ← CREATE
</file_tree>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
</context>

<gotchas>
- `runGh(args, opts)` must still log `args` only; `opts.input` is parsed as JSON when `--input -` is present (and is an error when
  `--input -` is present without `opts.input`). `isWriteArgs` in gh-client already counts `--input` as a write.
- Milestone on REST create is the milestone NUMBER (not the title as with `gh issue create --milestone`). Store the title internally as today.
- `GET .../issues/{n}/parent` → 404 when the issue has no parent (GitHub behaviour), not `null`.
- A REST issue object must include `type` (`{id, name}` or `null`), `sub_issues_summary {total, completed}`,
  `issue_dependencies_summary {blocked_by, blocking}` so 47-07/09 can read them.
</gotchas>

## Test list

gh-fake (added to `gh-fake.test.cjs`)
1. `runGh(['api','--method','POST','repos/o/r/issues','--input','-'], {input: JSON.stringify({title:'t', body:'b', labels:['devflow:trd'], milestone:1, type:'TRD'})})` → 201-shaped JSON with `id === 1_000_000 + number`, labels, milestone `{number:1}`; type `{name:'TRD'}` when org types include an enabled `TRD`, else `null`.
2. `--input -` without `opts.input` → failure; unknown flag still unsupported; `--search` still unsupported.
3. `PATCH repos/o/r/issues/{n}` via `--input` updates body/title/state/state_reason/type/labels and advances `updated_at`; `GET` returns it.
4. `GET repos/o/r/issues?labels=devflow:trd&state=all` with `--paginate --slurp` lists only labelled issues.
5. `POST repos/o/r/issues/{p}/sub_issues -F sub_issue_id=<child id>` links; GET sub_issues lists the child; `GET issues/{child}/parent` returns the parent; parent `updated_at` advanced.
6. Sending the child NUMBER as `sub_issue_id` → 404; linking an already-linked child → 422; a child with another parent → 422 unless `replace_parent=true`; the 101st child → 422.
7. `DELETE .../sub_issue` with `sub_issue_id` unlinks; `GET parent` → 404 afterwards.
8. `POST .../issues/{b}/dependencies/blocked_by -F issue_id=<a id>` → b blocked_by a; `GET .../{a}/dependencies/blocking` lists b; duplicate → 422; number-as-id → 404; DELETE `.../blocked_by/{id}` removes.
9. `GET repos/o/r` → `{full_name, owner:{type}, has_wiki, permissions:{push}, private}` from options.
10. `GET orgs/o/issue-types` → configured types for `ownerType:'Organization'`; 404 for `'User'`.
11. `GET orgs/o/issue-fields` → configured fields; `GET/POST/PUT repos/o/r/issues/{n}/issue-field-values` read/merge/replace values; 404 for `'User'`.
12. `subIssuesApi:false` → every sub_issues/parent route 404.
13. `setOffline(true)` → `{ok:false, status:null, stderr:/could not resolve host/i}` for reads and writes, calls still logged; `setOffline(false)` restores.
14. `humanEditComment(id, body)` changes the body and `updated_at`, records no call.
15. Regression: the existing 46 cases in this file still pass unchanged.

Store fixture builder (`gh-store-fixtures.test.cjs`)
16. `makeStoreProject()` returns `{root, objectiveDir:'07-store-demo', trdFiles:[3 names], cleanup}`; TRDs `07-01`, `07-02` are wave 1, `07-03` is wave 2 with `depends_on: ["07-01"]`; OBJECTIVE.md has `work: feature`, `kind` comes from PROJECT.md `kind: plugin`; `07-CONTEXT.md` and `07-RESEARCH.md` exist (repo naming convention); config `github.enabled:true, repo:'o/r'`.
17. `makeStoreProject({ownerType:'User'})` writes the same files; the option is only carried for the fake (`project.fakeOptions`).
18. `oversizedTrdText(60001, {id:'07-04', file:'07-04-big-TRD.md'})` → text whose encoded length (header computed locally per D-01: two header lines + newlines) is exactly 60,001; `oversizedTrdText(60000, ...)` is exactly 60,000. 47-09 re-asserts the same lengths against the real `gh-trd.encodeTrdBody`.
19. `hermeticEnv()` returns `{env, restore}` setting `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_TERMINAL_PROMPT=0` to temp paths, and `restore()` puts every variable back exactly (including unset ones).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: REST issues with ids, sub-issues, dependencies (tests 1-8, 15)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: add tests 1-8 to `gh-fake.test.cjs` in a new `describe('47 store REST shapes')`. Commit RED.

GREEN in `gh-fake.cjs`:
- `createFakeGitHub` gains options `ownerType='Organization'`, `hasWiki=true`, `push=true`, `isPrivate=false`,
  `types=[{id:1,name:'Objective',is_enabled:true},{id:2,name:'TRD',is_enabled:true},{id:3,name:'Decision',is_enabled:true}]`,
  `fields=[{id:11,name:'work',data_type:'single_select'},{id:12,name:'kind',data_type:'single_select'}]`, `subIssuesApi=true`.
- `runGh(args, opts = {})`; add `--input` to `API_VALUE_FLAGS`; when `--input -` is present parse `opts.input` as JSON into the
  same `fields` object the routes read (JSON values keep their types).
- Issue storage gains `id`, `type`, `parent`, `subIssues` (numbers in link order), `blockedBy` (numbers). `seedIssue` and
  `gh issue create` assign ids too. One internal `updatedAt` field feeds both gh `--json updatedAt` and REST `updated_at`.
- Routes: `repos/o/r/issues` (POST create, GET list with `labels`/`state` filters), `repos/o/r/issues/{n}` (GET, PATCH),
  `.../sub_issues` (GET, POST), `.../sub_issue` (DELETE), `.../parent` (GET), `.../dependencies/blocked_by` (GET, POST),
  `.../dependencies/blocked_by/{id}` (DELETE), `.../dependencies/blocking` (GET). Rules per tests 5-8. Bump `updatedAt` on the
  parent (link) and on the blocked issue (dependency).
- Export a `toRestIssue(issue)` helper internally; responses include `type`, `sub_issues_summary`, `issue_dependencies_summary`,
  `html_url`, `node_id: 'I_' + id`.
Commit GREEN. Run the 46 regression trio from Binding rules.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</verify>
  <done>Tests 1-8 and 15 pass; all 46 fake consumers still green.</done>
  <recovery>If a 46 test asserts an exact call count or `updatedAt` that the new bumps change, see error_recovery; never relax a 46 assertion about writes.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Capability variants, offline, human comment edit (tests 9-14)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 9-14. Commit RED.

GREEN: routes `repos/o/r` (GET), `orgs/{o}/issue-types` (GET; 404 when `ownerType==='User'`), `orgs/{o}/issue-fields` (GET; 404 for User),
`repos/o/r/issues/{n}/issue-field-values` (GET list `[{field_id, value}]`, POST merge from `issue_field_values`, PUT replace; 404 for User);
type assignment on create/PATCH honours: User owner → null; `push:false` → null; name not in enabled types → null.
`subIssuesApi:false` → sub-issue routes return `notFound()`.
Controls: `setOffline(bool)` checked first in `runGh` (after logging): returns
`{ok:false, status:null, stdout:'', stderr:'error connecting to api.github.com: dial tcp: lookup api.github.com: could not resolve host'}`;
`humanEditComment(id, body)`; expose `ownerType`, `subIssuesApi` read-only for tests.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</verify>
  <done>Tests 1-15 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Store fixture builder and hermetic env (tests 16-19)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-store-fixtures.cjs, plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs</files>
  <action>
RED: `gh-store-fixtures.test.cjs` with tests 16-19. Commit RED.

GREEN: `gh-store-fixtures.cjs` exports:
- `STORE_FIXTURE` — literal file contents (hand-written): ROADMAP (milestone `v9.9 Store Demo`, `### Objective 7: Store demo` with
  2 success criteria), PROJECT.md (frontmatter `kind: plugin`, `default_work: feature`), REQUIREMENTS.md, OBJECTIVE.md
  (frontmatter `objective: 07-store-demo`, `work: feature`, `milestone: v9.9`, Goal, 2 Success Criteria), `07-CONTEXT.md`, `07-RESEARCH.md`,
  three TRDs (`07-01-alpha-TRD.md` wave 1, `07-02-beta-TRD.md` wave 1, `07-03-gamma-TRD.md` wave 2 `depends_on: ["07-01"]`),
  each 20-40 lines with real-looking frontmatter + one `<task>`; `07-01-alpha-SUMMARY.md`; one TRD without a trailing newline (round-trip edge).
- `makeStoreProject({ownerType='Organization', hasWiki=true, enabled=true, store=false} = {})` (`store` writes `github.store` into config.json for 47-12/47-13) → writes files into `fs.mkdtempSync(os.tmpdir()+'/gh-store-')`,
  returns `{root, objectiveDir, trdFiles, fakeOptions:{repo:'o/r', ownerType, hasWiki}, cleanup}`.
- `oversizedTrdText(n, {id, file})` — header length computed locally as
  `` `<!-- devflow:id=${id} -->\n<!-- devflow:file=${file} -->\n`.length `` (D-01 format) so this fixture does not import 47-01.
- `hermeticEnv()` → temp `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, git isolation vars; `restore()` exact.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs</verify>
  <done>Tests 16-19 pass; nothing is written outside os.tmpdir().</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-store-fixtures.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs</regression>
</validation_gates>

<verification>
- All test-list cases pass; the 46 regression set is green.
- `rg -n "search" plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs` shows only the unsupported-flag handling.
</verification>

<success_criteria>
One fake GitHub models ids vs numbers, sub-issues, dependencies, capability variants and an outage; one hand-built
fixture project exercises 3 TRDs in 2 waves.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-02-fake-github-store-SUMMARY.md`
</output>
