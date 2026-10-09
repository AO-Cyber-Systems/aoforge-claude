---
objective: 47-github-authoritative-store
trd: "06"
subsystem: github-store
tags: [capability-detection, degraded-mode, ttl-cache, offline, tdd, hermetic]
requires:
  - gh-client.ghRead / resolveRepo / readConfig (46)
  - gh-wiki.probeRemote / resolveWikiRemote (47-04)
  - gh-project.cacheDir / DEFAULT_TTL_MINUTES (46)
  - sync-state.atomicWrite
  - __fixtures__/gh-fake.cjs capability variants (47-02)
provides:
  - "gh-capability.cjs: detectCapabilities(cwd, {probeIssue, refresh, now, env}) -> one cached probe per repo"
  - "gh-capability.cjs: resolveModes(caps), a pure map to {types, types_by_name, fields, hierarchy, dependencies, pages, pages_message, writable, degraded}"
  - "gh-capability.cjs: describeDegraded(caps), one sentence per degraded capability"
  - "gh-capability.cjs: cachePath, readCachedCapabilities, invalidate, listFieldDefinitions, ISSUE_FIELDS_PATH, REQUIRED_TYPES, REQUIRED_FIELDS"
affects:
  - 47-07 gh-outbox-flush (detect once per flush; re-detect when the answer is provisional)
  - 47-09 gh-hierarchy (choose type vs label, field values vs meta, link vs task list, wiki vs docs)
  - 47-11 store-cli (`gh outbox status` prints describeDegraded)
  - 47-12 sync-store-wiring (refuse to enqueue when writable is false)
tech-stack:
  added: []
  patterns:
    - "one read-only module: every gh call is ghRead, the only git is gh-wiki's probe"
    - "probe results classified once (ok / offline / absent / transient) and only definitive answers are cached"
    - "pure mode resolution kept apart from the probe so handlers branch on one small object"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-capability.cjs
    - plugins/devflow/devflow/bin/lib/gh-capability.test.cjs
  modified: []
key-decisions:
  - "D-07 held: issue-field definitions are read from ISSUE_FIELDS_PATH ('orgs/{owner}/issue-fields') by listFieldDefinitions only; any failure is fields:'meta'"
  - "D-08 held: types are native per name; exact name match; the overall `types` is native only when all three are enabled"
  - "D-22 held: cache at <gh cache dir>/capabilities/<owner>__<repo>.json, TTL github.project_cache_ttl_minutes (default 360)"
  - "Only a `final` answer is cached: a blocked wiki, push:false, a 5xx/rate-limit probe and a missing probe issue all re-probe next time"
  - "An offline answer anywhere in a detection makes the whole detection offline (stale cache, else provisional); a half-probed repo is not a capability report"
metrics:
  duration: "~1 session"
  completed: "2026-10-01"
  tasks: 2
  files: 2
tokens_input: 5846901
tokens_output: 79820
tokens_cache_read: 5688004
tokens_cache_write: 158807
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 06: Capability detection and degraded-mode selection Summary

**One read-only probe per repo (owner type, push, org issue types, issue fields, sub-issues, dependencies, wiki) cached for 360 minutes outside the repo, plus a pure `resolveModes` that turns it into `{types, fields, hierarchy, pages}`; a user-owned repo comes out as labels + meta + docs with sub-issues and dependencies still native.**

## What was built

- **Probes (`detectCapabilities`).** `GET repos/o/r` gives owner type, push, private and `has_wiki`. Org owners only: `GET orgs/o/issue-types` (per-type: exact name, `is_enabled !== false`) and the field definitions via `listFieldDefinitions`. With a `probeIssue`: `.../issues/{n}/sub_issues?per_page=1` and `.../dependencies/blocked_by?per_page=1`. Wiki: `has_wiki:false` is `disabled`; otherwise `gh-wiki.probeRemote(resolveWikiRemote(cwd, {env}))`.
- **Failure handling.** Each gh read is classified once: `ok`, `offline` (no status or a network error), `absent` (a definitive 403/404/410) or `transient` (5xx, rate limit, unparseable 2xx). A capability probe that fails degrades that capability and never fails detection. Only the repository read is fatal (`repository o/r not found or not accessible`, or the gh message).
- **`resolveModes(caps)` (pure).** `types` native only when Objective, TRD and Decision are all enabled (`types_by_name` has the per-type answer); `fields` native only when `work` and `kind` are both defined; `hierarchy` is `tasklist` only when sub-issues are `absent`; `pages` is `docs` for a disabled wiki, `blocked` (with `pages_message`) for an uninitialised or unreachable one, `wiki` otherwise; `writable` is `push !== false`. `unknown` reads as native.
- **`describeDegraded(caps)`.** A sentence per degraded capability in a fixed order (types, fields, sub_issues, dependencies, wiki), preceded by one for a repo without push access. The uninitialised-wiki sentence names the step: create the first wiki page in the GitHub web UI, then run `df-tools gh outbox flush`.
- **Cache.** `cachePath`, `readCachedCapabilities` (TTL not applied, malformed or foreign records read as a miss), atomic best-effort write for final answers only, `invalidate`. Time comes from the injectable `now` (ms, Date or function).
- **Offline.** A stale cache is returned as written with `stale:true, offline:true, final:false`; with no cache, `provisional:true` defaults (everything native/wiki, `owner_type:'unknown'`). Neither writes anything, not even the directory.

## Task Commits

| Task | Phase | Commit | Subject |
|---|---|---|---|
| 1 | RED | b7cfce4 | test(47-06): add failing capability probe, mode resolution and degraded-sentence tests |
| 1 | GREEN | 5d870b6 | feat(47-06): capability probes, pure mode resolution and degraded sentences |
| 2 | RED | 85605b0 | test(47-06): add failing TTL cache, offline and hygiene tests for capability detection |
| 2 | GREEN | 1c58f5a | feat(47-06): capability TTL cache, offline stale/provisional answers and invalidate |

## API contract for 47-07 .. 47-12

```js
const caps = detectCapabilities(cwd, { probeIssue, refresh, now, env });
// {ok:false, error}                                   a missing/inaccessible repo: refuse the push
// {ok:true, repo, owner_type, push, private,
//  org_types:{available, enabled:[names]},            enabled is the subset of REQUIRED_TYPES
//  issue_fields:{available, ids:{work, kind}, missing?},
//  sub_issues, dependencies: 'ok'|'absent'|'unknown',
//  wiki: 'ok'|'disabled'|'uninitialised'|'unavailable'|'unknown', wiki_detail,
//  checked_at, stale, provisional, final, degraded:[...], cached, offline?}
const modes = resolveModes(caps);
// {types, types_by_name:{Objective,TRD,Decision}, fields, hierarchy, dependencies:'native'|'none',
//  pages:'wiki'|'docs'|'blocked', pages_message, writable, degraded}
```

- Call `resolveModes` only on an `ok:true` result (it throws `TypeError` on `ok:false` or a non-object).
- Pass the objective issue as `probeIssue`; without it sub-issues and dependencies are `unknown` and nothing is cached.
- **Provisional answers are for planning only.** A `provisional:true` result has `issue_fields.ids` empty and `owner_type:'unknown'`; the flusher must re-detect (`refresh:true` or simply call again once online) before executing, and must not write field values from it.
- `issue_fields.ids` holds the numeric field ids for the native path; they are keyed by the canonical `work` / `kind` whatever the org's casing.
- `degraded` entries are `types`, `fields`, `sub_issues`, `dependencies`, `wiki`. `pages:'blocked'` must be reported (use `modes.pages_message`), never rewritten to `docs`.
- After the user creates the first wiki page, the next detection sees it at once: blocked-wiki and `push:false` answers are never cached.
- `invalidate(repo, env)` is available for the CLI (47-11); `{refresh:true}` is the usual route.

## Deviations from Plan

### Auto-added (Rule 2, correctness)

**1. [Rule 2] Only definitive answers are cached**
- **Issue:** The TRD says final (non-provisional, non-stale, probe-complete) answers are cached. Caching a blocked wiki or `push:false` for 6 hours would defeat the instruction the same module prints ("create the first wiki page, then run `df-tools gh outbox flush`"), and a transient 5xx would pin labels mode for 6 hours.
- **Fix:** `final` is false, and the answer not written, for a blocked wiki, `push:false`, any `transient` probe (5xx, rate limit, unparseable) and a missing probe issue. A definitive 403/404 on org types or fields is cached (user-owned labels mode is a stable answer, not a failure). Covered by "what is never remembered" tests and `final` assertions in tests 4, 7, 9.

**2. [Rule 2] A 404 on sub-issues or dependencies is only believed when the issue exists**
- **Issue:** `GET .../issues/{n}/sub_issues` answers 404 both for "no sub-issues API" and "no such issue". Taking the 404 at face value would flip a healthy org to the task-list hierarchy because of a wrong `probeIssue`.
- **Fix:** On a 404 one extra read of the issue itself decides; if it does not read back the answer is `unknown` (not final). A 403 is `absent` without the extra read. Tested with a non-existent probe issue.

**3. [Rule 2] Offline anywhere is offline everywhere**
- **Issue:** The TRD speaks of the `repos/o/r` read being offline. If the network drops after that read, later probes would silently degrade (labels, tasklist) and look like real capabilities.
- **Fix:** A no-answer from any probe (including the wiki's `ls-remote`) makes the whole detection offline: stale cache, else provisional. Tested for a mid-detection org-types outage, an offline wiki and a network error that carries an exit status.

### Additive surface beyond the TRD list

**4.** Extra exports/fields: `listFieldDefinitions` (named in the TRD body, not in `provides`), `modes.dependencies` (`native|none`, since the dependencies probe is required), `modes.pages_message`, `caps.final`, `caps.cached`, `caps.offline`, `caps.degraded`, `issue_fields.missing`. `describeDegraded` also emits a push-permission sentence first.

**5.** Matching rules: types by exact name (so the `type` we send is the name the org has); field names case-insensitively (only the id is used). A cache record is served only when it has every field `resolveModes` reads; the test for a thin record was adjusted accordingly in the Task 2 GREEN commit (a thin record is now a miss).

**6.** Task 1 GREEN commit also adds three `final` assertions to Task 1 tests (blocked wiki, unreachable wiki, `push:false`), written before the code that satisfies them, after the RED commit.

**7. SUMMARY filename.** The dispatch named `47-06-SUMMARY.md`; the TRD `<output>` named `47-06-gh-capability-SUMMARY.md`. The dispatch path was used.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Probes and pure mode resolution (tests 1-9, 12, 13) | `node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs` | 0 (40/40) | PASS |
| 2: TTL cache, offline, hygiene (tests 10, 11, 14) | `node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs` | 0 (71/71; stable over 4 runs) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-capability.test.cjs` | 1 (`Cannot find module './gh-capability.cjs'`) | FAIL (correct) |
| GREEN (task 1) | same | 0 (40 pass) | PASS (correct) |
| RED (task 2) | same | 1 (28 fail, 43 pass of 71: `cachePath`, `readCachedCapabilities`, `invalidate`, offline answers missing) | FAIL (correct) |
| GREEN (task 2) | same | 0 (71 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs` | 0 (71 pass) | PASS |
| verification 1 | `rg -n "ghWrite\|spawnSync" plugins/devflow/devflow/bin/lib/gh-capability.cjs` | 1 (no match) | PASS |
| verification 2 | test 2 ("user-owned repo") shows labels + meta + docs with native sub-issues and dependencies | 0 | PASS |
| full suite | `npm test` | 1 (6571 tests, 6570 pass, 1 fail, 32 skipped) | PASS apart from the known pre-existing `handoff-e2e.test.cjs` MA-7 (doctl auth) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (one cached probe with TTL outside the repo; a 403/404 degrades one capability and `degraded` lists it; `resolveModes` pure; `has_wiki:false` is docs and an uninitialised/unreachable wiki is blocked with the web-UI message; user-owned repo is labels + meta + docs with native sub-issues; offline is stale or provisional and never written; field-definition discovery is one constant path behind one function)
- Gate failures: None attributable to this TRD

## Hermeticity

Every test installs the 47-02 fake with `gh-client._setRunGh` and runs under `hermeticEnv()` (temp HOME, cache and outbox dirs). The wiki probe is a stubbed git seam except for two tests that use a local bare repo over `file://` (skipped visibly without git). No network, no port 8080, no real GitHub. Test 14 snapshots the real `~/.claude/devflow/state/gh-project/capabilities` before and after and asserts it is unchanged and that `fake.writes()` is empty.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-capability.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-capability.test.cjs
- FOUND commits: b7cfce4, 5d870b6, 85605b0, 1c58f5a
