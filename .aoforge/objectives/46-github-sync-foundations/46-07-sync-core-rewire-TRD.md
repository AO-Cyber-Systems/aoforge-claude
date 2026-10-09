---
objective: 46-github-sync-foundations
trd: "07"
type: standard
wave: 3
depends_on: ["46-04", "46-05", "46-06"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.cjs
  - plugins/devflow/devflow/bin/lib/gh-project.test.cjs
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
autonomous: true
requirements: [GSF-01, GSF-02, GSF-04, GSF-06, GSF-07, GSF-08]
must_haves:
  truths:
    - "`gh.syncObjective(arg, root)` accepts any objective spelling (`2`, `02`, `02-a`, `2.1`), and creates the issue when none exists instead of demanding `github_issue` first"
    - "The issue body is merged with gh-body managed sections; a second sync with no state change performs no `issue edit`; human text outside sections survives (success criterion 3)"
    - "After a successful sync, OBJECTIVE.md carries `github_issue: owner/repo#N` (written only when absent or equal; a differing human value is reported as `frontmatter_conflict` and kept)"
    - "The mapping file is written once per sync in v3 shape keyed by id; `verified_at` is set once the issue body carries the `devflow:id` marker; sync-state is recorded under the same id"
    - "The sticky state comment is found across all comment pages, by the new marker or the legacy `<!-- df:state -->`, edited in place, and not re-PATCHed when only its timestamp would change"
    - "Project fields come from gh-project live discovery; `PRODUCT_ROADMAP_FIELDS` no longer reads the cassette at runtime; project scopes are required only when `org_project` resolves"
    - "`github.enabled:false` makes `syncObjective` return `skipped:true` with zero gh calls"
    - "`gh._setRunGh(fn)` installs `fn` on the gh-client seam; the gh-pull → gh.cjs bridge is gone"
    - "TRD progress counts match slugged TRD files (`46-01-gh-client-TRD.md`) to `46-01-SUMMARY.md`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh.cjs
      provides: "syncObjective / cmdGhSyncObjective rebuilt on gh-client, gh-mapping, gh-issue, gh-body, gh-project, gh-milestone, frontmatter.setFrontmatterField"
    - path: plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
      provides: "syncObjective behaviour tests on the stateful gh-fake"
  key_links:
    - "syncObjective → gh-issue.createRunContext/findOrCreateObjectiveIssue → gh-body.mergeManaged → gh-client.ghWrite(issue edit) → sticky comment → gh-project.updateItemFields → frontmatter.setFrontmatterField → gh-mapping.writeMappingV3 → sync-state.recordSync(id)"
    - "conflict.resolveDisk keeps calling gh.cmdGhSyncObjective(cwd, dir, true) (live require)"
---

# TRD 46-07: Rebuild `gh sync <objective>` on the foundations (GSF-01, 02, 04, 06, 07, 08)

<objective>
Replace the body of gh.cjs `syncObjective` with one pipeline built on the wave-1/2 modules: resolve
the objective, find-or-create its issue without duplicates, merge managed body sections, upsert the
sticky comment across all pages, set Project fields from live discovery, write `github_issue` back to
OBJECTIVE.md, and persist mapping v3 + sync-state under one id. Unify the gh seam and delete the
fixture-backed `PRODUCT_ROADMAP_FIELDS` runtime read.

`sync --all`, the `sync-objectives` alias, `comment`/`close-issue`/`sync-release`/`resolve`, dispatch and
help are 46-08. Do not touch them here beyond what compiles.
Output: rewired gh.cjs, new `gh-sync.test.cjs`, legacy tests updated.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN per task. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- New behaviour tests go in `gh-sync.test.cjs` using `createFakeGitHub` (46-05) installed via `gh._setRunGh(fake.runGh)`, a fake clock
  (`gh-client._setNow/_setSleep`), `DEVFLOW_GH_CACHE_DIR` and `HOME` set to temp dirs. Never real GitHub, never real `~/.claude`, never port 8080.
- Legacy `gh.test.cjs` groups that encoded the old contract (`syncObjective`, `cmdGhSyncObjective`, `updateProjectFields` seeding
  `PRODUCT_ROADMAP_FIELDS._captured`) are rewritten onto the new contract or deleted when `gh-sync.test.cjs` covers them — list each in the SUMMARY.
  Groups for untouched helpers (`resolveChain`, `requireGhAuth`, `buildIssueBody`, …) must stay green unchanged.
- Read gh.cjs by ranges (`rg -n` then `Read` with offset/limit); it is 1739 lines.
- Research reference: `46-RESEARCH.md` → "Code Map: lib/gh.cjs", "Command surface after consolidation" (row `gh sync <objective>`), Pitfalls 1, 7, 8, 13.

<embedded_context>

<codebase_examples>
Current `syncObjective(objectiveId, projectRoot)` (gh.cjs:1411-1505) in order: `requireGhAuth(['project','read:project','repo'])` →
read OBJECTIVE.md at `.planning/objectives/<arg>/` → `github_issue` required → PROJECT.md `github_repo`/`org_project` → `resolveChain(objFm, projectCtx)` →
`readObjectiveState(arg, root)` → `buildIssueBody` + raw `issue edit` (overwrites body) → `readMappingV2` keyed by `state.number` (parseInt) →
`buildStickyComment` + `upsertStickyComment(issueRef, body, entry)` → `writeMappingV2` → Status/Quarter field updates → `updateProjectFields`.
Return shape `{ok, issue_updated, comment_action, comment_id, project_fields_updated, chain, state, warnings}` — keep these keys and add
`issue_number, issue_source, created, frontmatter_written, mapping_written`.

`cmdGhSyncObjective(cwd, arg, raw)` (1507-1535): failure → JSON to stderr + exit 1; `GhAuthError` → structured stderr + exit 1. Add: `skipped` → stdout JSON, exit 0.

`readObjectiveState` (1311-1400) matches TRD→SUMMARY by full stem (`46-01-gh-client` vs `46-01`) — slugged TRDs never count as done. Match on the `^\d+(\.\d+)?-\d+` id prefix instead.

`findStickyComment(issueRef)` (1114-1140) fetches ONE page (`repos/o/r/issues/N/comments`) and checks `startsWith('<!-- df:state -->')`.
Sync-state record shape: see gh.cjs:828 `recordSync(cwd, item.number, {...})` in `cmdGhSyncObjectives` — record the same fields, keyed by `resolved.id`.
</codebase_examples>

<anti_patterns>
- Any `parseInt` of a dir prefix, any `readMappingV2` / `writeMappingV2` in the sync path (Pitfall 1).
- Calling `_runGh` directly for writes; every mutation is `ghWrite`.
- Overwriting a differing human `github_issue` value.
- Stripping legacy generated body text (Pitfall 8: first managed sync appends below it; documented in 46-10).
- Requiring `project` scopes when no `org_project` resolves (Pitfall 13).
</anti_patterns>

<error_recovery>
- gh-issue returns `duplicate_marker` / `duplicate_title` / `needs_human` → `{ok:false, error, issues}`; nothing written, mapping not saved.
- Project-field failures → warnings only; the sync is still `ok:true`.
- `mergeManaged` marker mismatch → `{ok:false, error}` (the mapped issue belongs to another objective); mapping entry left for a human.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/46-RESEARCH.md
@plugins/devflow/devflow/bin/lib/gh-issue.cjs
@plugins/devflow/devflow/bin/lib/gh-body.cjs
@plugins/devflow/devflow/bin/lib/gh-project.cjs
</context>

<gotchas>
- ROADMAP-only objective (no dir): build a minimal state from `roadmap.getRoadmapObjectiveInternal(root, id)` (name, goal; 0/0 TRDs) and skip write-back.
- `org_project` comes from `resolveChain` (OBJECTIVE.md → PROJECT.md inheritance); keep calling it.
- `verified_at`: set to the ISO time when the post-merge body contains `devflow:id=<id>` (after a successful edit, or when found by marker with no edit needed).
- Sticky upsert: PATCH `repos/R/issues/comments/<id>` with `-f body=...`; create with `api repos/R/issues/N/comments -f body=...`. Never `-F` for bodies.
- Sticky skip rule: compare bodies with the `last synced <iso>` line removed.
- `gh.cjs _setRunGh(fn)` must still set the local `_runGh` too (46-08 converts the remaining legacy call sites) AND `gh-client._setRunGh(fn)`. The exported `_runGh` wrapper forwards to gh-client.
</gotchas>

## Test list (`gh-sync.test.cjs`; temp project: config `github:{enabled:true, repo:'o/r'}`, objectives `02-a` (milestone v1.4, 2 TRDs, 1 SUMMARY, slugged TRD names) and `02.1-b`)

1. Disabled config → `{skipped:true}`, fake `calls()` empty.
2. First sync of `02-a` (no mapping, no frontmatter ref) → one `issue create` whose body starts `<!-- devflow:id=2 -->` and has all four managed sections; title `[Objective 2] a`; `--milestone v1.4`.
3. After (2): OBJECTIVE.md has `github_issue: o/r#1`, other frontmatter lines byte-identical; mapping file `{version:3, objectives:{"2":{issue_id:1, state_comment_id:<id>, verified_at:<iso>}}, milestones:{"v1.4":<n>}}`; sync-state has key `2`.
4. `syncObjective('2')`, `('02')`, `('02-a')` all update issue #1; `syncObjective('2.1')` creates #2 (never touches #1).
5. Second sync with no state change → zero `issue edit`, zero comment PATCH (writes limited to none).
6. Human edits #1 (`fake.humanEditBody`) adding paragraphs above, between and below sections; change a TRD SUMMARY; sync twice → human text byte-identical, summary section updated, second sync performs no `issue edit` (SC3).
7. Existing different `github_issue: o/r#9` in frontmatter with mapping → #1 → warning `frontmatter_conflict`, file keeps `#9`.
8. Legacy v2 mapping `{"objectives":{"2":{"issue_id":1,"state_comment_id":50}}}` and #1 body without marker, sticky comment 50 starting `<!-- df:state -->` on comments page 2 → body gains marker + sections appended below the legacy text, comment 50 PATCHed (no new comment), mapping rewritten as v3 with `verified_at` set.
9. Mapping lost (file deleted) after (3) → sync `2` finds #1 by frontmatter/marker, zero creates (SC2 at command level).
10. `org_project` set on PROJECT.md → project scopes required; gh-project discovery via mocked GraphQL (feed the cassette through the fake); Status `In Progress` applied; unknown Quarter → warning, `ok:true`. No `org_project` → auth requires only `repo`, no GraphQL calls.
11. Every write argv recorded by the fake came through `ghWrite` pacing: timestamps on the fake clock ≥ 1000 ms apart.
12. No argv element anywhere contains `[object Object]`.
13. `readObjectiveState` counts `46-01-gh-client-TRD.md` + `46-01-SUMMARY.md` as done (unit, in `gh.test.cjs` or `gh-sync.test.cjs`).
14. `gh._setRunGh(fake)` → `require('./gh-client.cjs').ghRead(['--version'])` hits the fake; `gh-pull` no longer calls `gh._setRunGh` (rg assertion in test).
15. `PRODUCT_ROADMAP_FIELDS`: gh.cjs source contains no `__fixtures__` path and no `PVT_kwDODwqLrc4BRsOP`; flip 46-04's repo guard test from `todo` to active.
16. `awareness.scanOrg` default project id comes from `opts.project_id` or PROJECT.md `org_project` (new `opts.cwd`), never the cassette; O2 updated accordingly.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Seam unification and the issue/body/write-back/mapping pipeline (tests 1-9, 12-14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-sync.test.cjs, plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
RED: tests 1-9 and 12-14 in `gh-sync.test.cjs` (extend gh-fake only for argv shapes it lacks). Commit RED.

GREEN — new `syncObjective(arg, projectRoot)`:
1. `runCtx = createRunContext(root)`; skipped → return `{ok:false, skipped:true, reason, warnings:[]}`.
2. `resolved = resolveObjective(root, arg)`; null → `{ok:false, error:'objective not found: '+arg}`.
3. objFm/projectFm → `chain = resolveChain(objFm, projectCtx)`; `requireGhAuth(chain.org_project ? ['project','read:project','repo'] : ['repo'])`.
4. `state = resolved.dir ? readObjectiveState(resolved.dir, root) : roadmapOnlyState(root, resolved)`; `sections = buildObjectiveSections({...state, objectiveId: resolved.id, dir: resolved.dir})`.
5. `found = findOrCreateObjectiveIssue(runCtx, resolved, {name: state.name, createBody: mergeManaged('', sections, resolved.id).body})`; error → return it.
6. Not created → `merged = mergeManaged(found.body, sections, resolved.id)`; `!merged.ok` → error; `merged.changed` → `ghWrite(['issue','edit',String(n),'--repo',repo,'--body',merged.body])`.
7. Sticky comment (task 2 implements; stub call site now).
8. Write-back: `setFrontmatterField(objPath, 'github_issue', `${repo}#${n}`, {ifAbsentOrEqual:true})` (dir only).
9. `setEntry` + `verified_at`; `writeMappingV3(root, runCtx.mapping)`; `recordSync(root, resolved.id, record)`.
Seam: `_setRunGh(fn)` sets local + gh-client; exported `_runGh` forwards to gh-client. Delete the bridge block in gh-pull.cjs (`ghSetRunGh(runGhBridge)`), keeping `requireGhAuth` import.
`cmdGhSyncObjective`: add the `skipped` → exit 0 branch (use `gh-client.emitResult` for success/skip; keep stderr+exit 1 for failures).
Fix `readObjectiveState` TRD/SUMMARY pairing by id prefix (test 13).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/conflict.test.cjs</verify>
  <done>Tests 1-9, 12-14 pass; pull and conflict suites still green without the bridge.</done>
  <recovery>If removing the bridge breaks gh-pull tests, check that gh-pull's `_setRunGh` installs on gh-client and that gh.cjs `requireGhAuth` now calls through gh-client; do not reinstate the bridge.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sticky comment across pages, Project fields from discovery, fixture read removed (tests 8 sticky part, 10, 11, 15, 16)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-sync.test.cjs, plugins/devflow/devflow/bin/lib/gh-project.test.cjs, plugins/devflow/devflow/bin/lib/awareness.cjs, plugins/devflow/devflow/bin/lib/awareness.test.cjs</files>
  <action>
RED: tests 10, 11, 15, 16 and the sticky assertions of 8. Commit RED.

GREEN:
- `findStickyComment(issueRef, id)` → `ghPaginate('repos/R/issues/N/comments')` + `isStateComment(body, id)`; `upsertStickyComment` uses `buildStateComment`, the skip rule, and `ghWrite`.
  Keep both function names exported (signatures may gain the id argument; update their legacy tests).
- Project fields: replace the body of `updateProjectFields(issueRef, projectId, fields)` with
  `gh-project.updateItemFields({issueRef, projectId, fields, run: ghRun})` (ghRun = gh-client read/write dispatcher). Status rule unchanged
  (Done / In Progress / Todo); Quarter from `chain.milestone.quarter` when present.
- Delete the `PRODUCT_ROADMAP_FIELDS` IIFE. Keep the export name as `Object.freeze({_captured:false, deprecated:'use gh-project discovery'})`
  so older requirers do not crash; `awareness.scanOrg({project_id, cwd})` resolves the default from `<cwd>/.planning/PROJECT.md` `org_project`, with `cwd` defaulting to `process.cwd()` (df-tools `--cwd` already chdirs), so the three call sites in `awareness-cli.cjs` / `org-awareness.cjs` stay unchanged.
- Flip the 46-04 repo-guard test (`todo`) to a normal test.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-project.test.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs</verify>
  <done>Tests 8, 10, 11, 15, 16 pass; `rg -n "__fixtures__" plugins/devflow/devflow/bin/lib/gh.cjs` → no matches.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Legacy gh.test.cjs groups onto the new contract</name>
  <files>plugins/devflow/devflow/bin/lib/gh.test.cjs</files>
  <action>
Run `node --test plugins/devflow/devflow/bin/lib/gh.test.cjs` and list failures. For each failing group:
- `syncObjective` / `cmdGhSyncObjective`: delete cases now covered by `gh-sync.test.cjs` (cite the covering test number in a comment at the group head); rewrite the rest to build a temp config with `github.enabled:true` and use gh-fake.
- `updateProjectFields`: drop `_captured` seeding; drive through a mocked GraphQL discovery.
- `findStickyComment` / `upsertStickyComment`: add the id argument and paginated response shape.
Do not weaken assertions for helpers whose behaviour did not change. This task is test-only (the RED/GREEN pair lives in tasks 1-2); commit as `test(46-07): move legacy gh sync tests onto v3 contract`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs</verify>
  <done>gh.test.cjs green; SUMMARY lists every deleted or rewritten group and why.</done>
  <recovery>If a legacy test exercises `cmdGhSyncObjectives`/`cmdGhComment`/`cmdGhCloseIssue`, leave it untouched — 46-08 owns those.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/conflict.test.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/gh-project.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "readMappingV2\(|writeMappingV2\(|buildIssueBody\(" plugins/devflow/devflow/bin/lib/gh.cjs` shows no call inside `syncObjective`.
- `rg -n "ghSetRunGh|runGhBridge" plugins/devflow/devflow/bin/lib/gh-pull.cjs` → no matches.
- Tests 6 and 9 demonstrate SC3 and SC2 at command level.
</verification>

<success_criteria>
`gh sync <objective>` is idempotent, marker-verified, rate-paced, writes `github_issue` back, and uses one mapping shape; the runtime no longer reads test fixtures.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-07-SUMMARY.md`
</output>
