---
objective: 47-github-authoritative-store
trd: "06"
type: tdd
wave: 2
depends_on: ["47-02", "47-04"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-capability.cjs
  - plugins/devflow/devflow/bin/lib/gh-capability.test.cjs
autonomous: true
requirements: [GST-08, GST-01]
must_haves:
  truths:
    - "One probe per repo detects owner type, push permission, org issue types (Objective/TRD/Decision enabled), issue fields (`work`, `kind`), sub-issues, dependencies and wiki state, and caches the answer for `project_cache_ttl_minutes` (default 360) outside the repo"
    - "A 403/404 on any single capability probe degrades that capability and never fails detection; `degraded` lists what fell back"
    - "`resolveModes(caps)` is pure and yields `{types:'native'|'labels', fields:'native'|'meta', hierarchy:'native'|'tasklist', pages:'wiki'|'docs'|'blocked'}`"
    - "`has_wiki:false` selects `docs`; a wiki that exists but is `uninitialised` or `unavailable` selects `blocked` with an actionable message, never a silent switch to `docs/`"
    - "On a user-owned repo (`owner.type:'User'`) the detected modes are labels + meta + docs (if no wiki), with sub-issues/dependencies still native (SC5 unit level)"
    - "Offline detection returns the stale cache (flagged `stale:true`) or, without a cache, `{provisional:true}` defaults that the flusher re-detects before executing"
    - "Issue-field definition discovery is one constant path behind one function; any failure means `fields:'meta'` (LOW-confidence API isolated)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-capability.cjs
      provides: "ISSUE_FIELDS_PATH, REQUIRED_TYPES, REQUIRED_FIELDS, cachePath, detectCapabilities, resolveModes, readCachedCapabilities, invalidate, describeDegraded"
  key_links:
    - "47-07 handlers call detectCapabilities/resolveModes once per flush to choose type vs label, field values vs meta, link vs task list, wiki vs docs; 47-09 calls it for planning and reporting; 47-11 `gh outbox status` prints describeDegraded"
---

# TRD 47-06: Capability detection and degraded-mode selection (GST-08)

<objective>
Create `lib/gh-capability.cjs`: one probe that learns what the target repo supports and one pure function that turns that into
the store's operating modes. Degraded mode (labels + body metadata for types/fields, `docs/` for wiki content) is selected
automatically from the probe, cached per repo, and reported.

Purpose: GST-08 (automatic degraded mode) and the type/field half of GST-01. Output: module + tests on the 47-02 fake and
47-04 wiki fixture.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- All gh calls via `gh-client.ghRead` (no writes in this module). Wiki probing via `gh-wiki.probeRemote` (git stays in gh-wiki).
- Tests install the fake only with `gh-client._setRunGh(fake.runGh)`, set `HOME`, `DEVFLOW_GH_CACHE_DIR`, `DEVFLOW_WIKI_REMOTE` to temp
  values (use `hermeticEnv()` from `__fixtures__/gh-store-fixtures.cjs`), and call `_resetClient()` in afterEach.
- No property-based tests, no generated data, never port 8080, never the real GitHub.
- Research reference: `47-RESEARCH.md` → "Capability detection (GST-08)", Open Questions 1, 2, 6.

## Decisions taken in planning

- **D-07 (LOW) Issue-field definitions** are read from `ISSUE_FIELDS_PATH = 'orgs/{owner}/issue-fields'` through
  `listFieldDefinitions(owner)` only. Any non-2xx or unparseable answer → `issue_fields.available:false` → `fields:'meta'`. A human may
  confirm the real path later (one-line change); tests depend only on the 47-02 fake.
- **D-08 Types** are native only when the owner is an Organization, `GET orgs/{o}/issue-types` succeeds, and `Objective`, `TRD`,
  `Decision` are all present and enabled. Partial sets are reported per type and treated as `labels` for the missing ones
  (`types_enabled` lists which). The flusher additionally checks each create response's `type` (D-08 runtime half, 47-07).
- **D-22 Cache.** `$DEVFLOW_GH_CACHE_DIR/capabilities/<owner>__<repo>.json` (default `~/.claude/devflow/state/gh-project/capabilities/`,
  the dir gh-project already uses). TTL = `.planning/config.json` `github.project_cache_ttl_minutes` (default 360). `{refresh:true}` bypasses.
- **Sub-issue/dependency probes need a known issue.** `detectCapabilities(cwd, {probeIssue})` probes `GET .../issues/{n}/sub_issues` and
  `.../dependencies/blocked_by` on that issue (the objective issue — 46's find-or-create guarantees it exists before a push). Without a
  probe issue the value is `unknown`, treated as native, and NOT cached as final.
- **Wiki states:** `disabled` (has_wiki false) → pages `docs`; `ok` → `wiki`; `uninitialised` → `blocked` with message
  "create the first wiki page in the GitHub web UI, then run `df-tools gh outbox flush`"; `unavailable` (e.g. private repo without a
  wiki plan) → `blocked` with git stderr. Wiki plan availability for private repos (proposal open item) is therefore reported, not guessed.
- **No push permission** → `push:false`; `resolveModes` returns `{writable:false}` and callers refuse to enqueue with a clear error.

<embedded_context>

<codebase_examples>
Reads through the client (`gh-client.cjs:243`): `ghRead(['api', 'repos/o/r'])` → `{ok, status, stdout, stderr}`; parse `stdout` JSON.
Cache-dir convention to mirror (`gh-project.cjs:152-159`):
```js
function cacheDir(env = process.env) {
  const override = env && env.DEVFLOW_GH_CACHE_DIR;
  ...default ~/.claude/devflow/state/gh-project
}
```
TTL convention: `github.project_cache_ttl_minutes` read via `client.readConfig(cwd)`.

Capability record:
```json
{ "repo":"o/r", "owner_type":"Organization", "push":true, "private":false,
  "org_types":{"available":true,"enabled":["Objective","TRD","Decision"]},
  "issue_fields":{"available":true,"ids":{"work":11,"kind":12}},
  "sub_issues":"ok", "dependencies":"ok", "wiki":"ok", "wiki_detail":null,
  "checked_at":"2026-10-01T00:00:00.000Z", "stale":false, "provisional":false }
```
</codebase_examples>

<anti_patterns>
- Failing the whole detection because one probe returned 403/404.
- Treating `wiki: uninitialised` as `docs` (proposal: never silently fall back from a configured wiki).
- Probing with GitHub search or GraphQL introspection in this TRD (keep the LOW path in one REST constant).
- Caching a `provisional` or `offline` answer as if it were final.
</anti_patterns>

<error_recovery>
- `GET repos/o/r` offline → if a cache file exists (any age) return it with `stale:true`; else return provisional defaults
  (`owner_type:'unknown'`, everything native/wiki) with `provisional:true`; never write the cache in either case.
- `GET repos/o/r` 404 → `{ok:false, error:'repository o/r not found or not accessible'}` (this is fatal for a push, unlike a capability probe).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@plugins/devflow/devflow/bin/lib/gh-project.cjs
</context>

<gotchas>
- A user-owned repo still supports sub-issues and dependencies (same-owner rule) — SC5's "same workflow" depends on that.
- `GET orgs/{o}/issue-types` for a user login returns 404 — that is "types unavailable", not an error.
- Clock: take `now` from an injectable parameter so TTL tests do not sleep.
</gotchas>

## Test list

1. Org repo, all types/fields, sub-issues and wiki ok → every capability native; `resolveModes` → `{types:'native', fields:'native', hierarchy:'native', pages:'wiki', writable:true}`; `degraded:[]`.
2. `ownerType:'User', hasWiki:false` → `{types:'labels', fields:'meta', hierarchy:'native', pages:'docs'}`; `degraded` names types, fields, wiki.
3. Org with types missing `Decision` → `org_types.enabled` lacks it; `resolveModes(...).types_by_name.Decision === 'labels'`, others native.
4. `orgs/o/issue-fields` failing (fake `failNext` 404 or 500) → `fields:'meta'`, detection ok.
5. `subIssuesApi:false` with a probe issue → `sub_issues:'absent'` → `hierarchy:'tasklist'`.
6. No probe issue → `sub_issues:'unknown'`, treated native, cache not marked final (a later call with a probe issue re-probes despite TTL).
7. `hasWiki:true` + `DEVFLOW_WIKI_REMOTE` = fixture `missingUrl` → `wiki:'uninitialised'`, `pages:'blocked'`, message names the web-UI step.
8. `hasWiki:true` + fixture remote ok → `wiki:'ok'`.
9. `push:false` → `writable:false`.
10. Cache: second call within TTL makes zero gh calls; after TTL (injected `now`) re-probes; `{refresh:true}` re-probes; `invalidate(repo)` deletes the file.
11. Offline (`fake.setOffline(true)`) with a cache → stale cache returned, `stale:true`; without a cache → `provisional:true`; no cache file written.
12. `GET repos/o/r` 404 → `{ok:false}`.
13. `describeDegraded(caps)` returns one human sentence per degraded capability (used by `gh outbox status`).
14. Hygiene: no write argv in `fake.writes()` after any detection; the real `~/.claude/devflow/state` untouched.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Probes and pure mode resolution (tests 1-9, 12, 13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-capability.cjs, plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</files>
  <action>
RED: tests 1-9, 12, 13 using `createFakeGitHub({...})` variants and `createWikiRemote()` from `__fixtures__/wiki-remote.cjs`. Commit RED.
GREEN: `REQUIRED_TYPES = ['Objective','TRD','Decision']`, `REQUIRED_FIELDS = ['work','kind']`, `ISSUE_FIELDS_PATH`,
`listFieldDefinitions(owner)`, `detectCapabilities(cwd, {probeIssue, refresh, now, env})` (repo from `client.resolveRepo(cwd)`),
`resolveModes(caps)` (pure; includes `types_by_name`), `describeDegraded(caps)`.
Approach:
1. `repo = ghRead(['api', 'repos/'+repo])` → owner_type, push, private, has_wiki (404 → fatal error result; offline → see error_recovery).
2. Org only: types via `orgs/{owner}/issue-types`; fields via `listFieldDefinitions`.
3. With `probeIssue`: `api repos/o/r/issues/{n}/sub_issues?per_page=1` and `.../dependencies/blocked_by?per_page=1` (404 → absent; 200 → ok).
4. Wiki: `has_wiki` false → `disabled`; else `gh-wiki.probeRemote(gh-wiki.resolveWikiRemote(cwd))`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</verify>
  <done>Tests 1-9, 12, 13 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TTL cache, offline behaviour, hygiene (tests 10, 11, 14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-capability.cjs, plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</files>
  <action>
RED: tests 10, 11, 14. Commit RED.
GREEN: `cachePath(repo, env)`, `readCachedCapabilities(repo, env)`, cache write via `sync-state.atomicWrite` only for final
(non-provisional, non-stale, probe-complete) answers, `invalidate(repo, env)`; offline classification of the `repos/o/r` read uses the
same patterns as research (`status === null` or `/could not resolve host|connection refused|timed out|network is unreachable|dial tcp/i`).
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</verify>
  <done>Tests 1-14 pass.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "ghWrite|spawnSync" plugins/devflow/devflow/bin/lib/gh-capability.cjs` → no matches.
- Test 2 demonstrates the user-owned-repo mode set used by SC5.
</verification>

<success_criteria>
Degraded mode is detected automatically, cached, explained in one sentence per capability, and never fails a push for a
missing org feature.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-06-gh-capability-SUMMARY.md`
</output>
