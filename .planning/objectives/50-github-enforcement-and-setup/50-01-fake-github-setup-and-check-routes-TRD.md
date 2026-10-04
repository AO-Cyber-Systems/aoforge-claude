---
objective: 50-github-enforcement-and-setup
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
autonomous: true
requirements: [GEN-04, GEN-05]
must_haves:
  truths:
    - "The fake GitHub answers rulesets list/get/create/update, `PATCH repos/o/r`, repo labels list, org issue-type create/update, org issue-field create, PR commits and file contents, all through `_setRunGh`"
    - "A `merge_queue` rule is refused with HTTP 422 when the fake is built with `mergeQueueAllowed:false`; any repo-level write is refused with 403 when `isAdmin:false`; org writes are refused with 403 when `orgAdmin:false`"
    - "Issue-field create requires the `X-GitHub-Api-Version: 2026-03-10` header (400 without it) and refuses `options` with 422 when `fieldOptionsAccepted:false`"
    - "Every new shape has a case in gh-fake.test.cjs; an unknown argv still returns `[gh-fake] unsupported`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "routes: repos/o/r/rulesets (GET, POST), rulesets/{id} (GET, PUT), repos/o/r (PATCH has_wiki/delete_branch_on_merge), repos/o/r/labels (GET), orgs/o/issue-types (POST) + /{id} (PUT), orgs/o/issue-fields (POST), pulls/{n}/commits (GET), contents/{path}?ref= (GET); options rulesets, mergeQueueAllowed, isAdmin, orgAdmin, fieldOptionsAccepted, files, prCommits"
  key_links:
    - "Used by 50-08 (check runner reads PR, commits, contents, posts statuses) and 50-09/50-11 (setup read + apply) and 50-12 (e2e)"
---

# TRD 50-01: fake GitHub routes for setup and the required checks

<objective>
Extend the hand-built fake GitHub so objective 50's setup and check code can be tested end to end with no network. Every route is a
REST shape `gh api` uses. Output: new routes and options in `gh-fake.cjs` with a test case per shape. This TRD has no production code.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: the failing fake test first (`test(50-01): ...`), then the route (`feat(50-01): ...`).
- Follow the fake's own rule (header L13-16): add the shape HERE, never stub it in a later test.
- Hand-built data only (no generated fixtures, no property-based tests). Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Ruleset storage**: `rulesets` array of `{id, name, target, enforcement, conditions, bypass_actors, rules}`; ids start at 9001.
  `GET repos/o/r/rulesets` returns summaries (`id, name, target, enforcement`) like GitHub; `GET .../rulesets/{id}` returns the full object.
- **Merge queue refusal**: a POST/PUT whose `rules` contains `type:'merge_queue'` with `mergeQueueAllowed:false` returns
  `{ok:false, status:1, stderr:'gh: Validation Failed (HTTP 422)'}`. Use the same stderr shape the fake already uses for other HTTP
  errors (grep `HTTP 4` in gh-fake.cjs) so `gh-client.classify` reads the status.
- **Admin**: `isAdmin` (default `true`) gates repo-level writes on the new routes (rulesets, repo PATCH). `orgAdmin` (default `true`) gates
  the org POST/PUT routes. Existing routes are unchanged (no regression to 46-49 tests).
- **Issue fields**: POST body `{name, data_type, description, visibility, options?}`; header check is literal
  `X-GitHub-Api-Version: 2026-03-10` passed as `-H`. Stored rows join the existing `fieldDefs` list (so `detectCapabilities` sees them).
- **Issue types**: POST `{name, description, color, is_enabled}` appends to the `types` list with id `IT_<n>`; PUT `/{id}` patches it.
- **Contents**: option `files` = `{ '<ref>': { '<path>': '<text>' } }`; `GET repos/o/r/contents/<path>?ref=<sha>` returns
  `{type:'file', encoding:'base64', content}`, 404 when absent.
- **PR commits**: option `prCommits` = `{ <prNumber>: ['<message>', ...] }`; `GET repos/o/r/pulls/{n}/commits` returns
  `[{sha, commit:{message}}]`, honours `--paginate --slurp` the same way the existing list routes do.

## Test list

1. Rulesets: POST a ruleset → GET list shows `{id, name}`; GET by id returns the stored body; PUT replaces `rules`; writes are recorded.
2. Merge queue: `mergeQueueAllowed:false` + a `merge_queue` rule → 422 and nothing stored; the same body without it → stored.
3. `isAdmin:false` → ruleset POST and `PATCH repos/o/r` return 403; GET still works.
4. `PATCH repos/o/r {has_wiki:true, delete_branch_on_merge:true}` → later `GET repos/o/r` reflects both.
5. `GET repos/o/r/labels` lists labels created earlier with `gh label create`.
6. Issue types: POST adds an enabled type visible to `GET orgs/o/issue-types`; PUT `{is_enabled:true}` enables a disabled seeded type; a
   User-owned fake returns 404; `orgAdmin:false` → 403.
7. Issue fields: POST without the api-version header → 400; with it → stored and listed; `options` with `fieldOptionsAccepted:false` → 422.
8. PR commits and contents return the seeded data; an unseeded path → 404.
9. An argv the fake does not know still yields `[gh-fake] unsupported`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: repository-level routes (tests 1-5, 9)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 1-5 and 9 in a new `describe('50-01 setup routes')`; commit `test(50-01): fake rulesets, repo settings and labels routes`.
GREEN: in the REST router (the block that matches `repos/o/r` near L1290-1300), add rulesets, repo PATCH and labels GET before the
`orgs/` matcher. Parse `opts.input` as the JSON body (the existing POST routes show how). Document the new options and routes in the
header comment block (L33-56). Commit `feat(50-01): fake GitHub rulesets, repo PATCH and labels list`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</verify>
  <done>Tests 1-5, 9 pass; every pre-existing gh-fake test still passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: org writes, PR commits, contents (tests 6-8)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 6-8; commit `test(50-01): fake org type/field writes, PR commits, contents`.
GREEN: extend the `orgs/{o}/(issue-types|issue-fields)` matcher (L1305) to accept POST (and PUT `issue-types/{id}`) instead of returning
unsupported for non-GET; add `pulls/{n}/commits` and `contents/<path>`. Read `-H` values from the parsed api flags.
Commit `feat(50-01): fake org issue-type/field writes, PR commits and contents`.
# GOTCHA: the org routes must still 404 for a User owner or another org (existing guard L1308).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</verify>
  <done>Tests 6-8 pass; capability tests unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-fake.cjs` header L1-56 (storage shapes, extension rule), options doc L148-154, `respondList` and `notFound` helpers, org matcher L1305-1312.
- `gh-client.cjs` `isWriteArgs` (imported at L58): a `gh api -X POST|PUT|PATCH` is a write and lands in `fake.writes()`.
- `gh-capability.cjs` `ISSUE_FIELDS_PATH` L41, `probeOrgTypes` L110, `readFieldDefinitions` L125.
</codebase_examples>
<anti_patterns>
- Stubbing a route inside a test with a custom runGh wrapper (breaks the "fake is the contract" rule).
- Changing defaults of existing options (`push`, `ownerType`, `hasWiki`) — 46-49 tests depend on them.
</anti_patterns>
<error_recovery>
- If an existing test breaks because a route that used to be `unsupported` now answers, check that test was asserting the gap on
  purpose; if so, move its assertion to a still-unsupported argv.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</regression>
</validation_gates>

<verification>
- Each new route has a gh-fake.test.cjs case; `[gh-fake] unsupported` still fires for unknown argv.
</verification>

<success_criteria>
Setup and check code can be exercised against the fake for every endpoint the research names, including the 422/403/400 refusals.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-01-SUMMARY.md`
</output>
