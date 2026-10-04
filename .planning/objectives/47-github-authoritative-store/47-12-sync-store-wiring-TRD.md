---
objective: 47-github-authoritative-store
trd: "12"
type: tdd
wave: 4
depends_on: ["47-04", "47-06", "47-07", "47-09", "47-10"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GST-01, GST-02, GST-05, GST-06, GST-07]
must_haves:
  truths:
    - "With `github.store: true`, `gh sync <objective>` keeps 46's objective-issue find-or-create, then pushes the hierarchy through the outbox: the objective body's managed sections are written by ONE `patch-body` op (46 summary/criteria/footer + derived wiki/trds/meta), TRDs become sub-issues with blocked-by edges, SUMMARY/VERIFICATION become comments, reference docs become wiki pages"
    - "After a flush that completes, sync renders the wiki `Roadmap` page from the issues (47-10 renderer) and pushes it, and records the cache baseline for every pushed file"
    - "In store mode the TRD budget check runs before ANY gh call, so an over-budget TRD means no issue at all is created, not even the objective issue (SC2)"
    - "With `github.store` false or absent, `gh sync` behaves exactly as in objective 46 (every 46 test passes unchanged)"
    - "`gh sync --all` enqueues every objective and flushes once at the end"
    - "When the network is down and the objective is already mapped, `gh sync` still enqueues the hierarchy ops, skips the live 46 steps with a warning, and reports `outbox: pending` instead of failing"
    - "The seam guard covers every new gh-* module: only gh-client spawns `gh`, only gh-wiki spawns `git`, and gh-hierarchy/gh-comments/gh-cache/gh-capability never call `ghWrite`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh.cjs
      provides: "syncObjective/syncAll store branch (pushHierarchy + flush + Roadmap page + baseline)"
    - path: plugins/devflow/devflow/templates/config.json
      provides: "github.store (false), github.labels.trd, github.labels.decision, github.wiki.remote"
  key_links:
    - "Calls gh-hierarchy.pushHierarchy (47-09), gh-outbox-flush.flush (47-07), gh-cache.readRemoteModel/renderRoadmap/recordCacheBaseline (47-10), gh-wiki.openStore (47-04), gh-capability (47-06); 47-13 drives SC1/SC4/SC5 through `gh sync`"
---

# TRD 47-12: Wire the store into `gh sync`; config defaults; seam guard (GST-01, GST-02, GST-05, GST-06, GST-07)

<objective>
Make `gh sync` the push path for the authoritative store, behind an explicit `github.store` switch: the objective issue is still
found or created by objective 46's code, but its body edit, the TRD sub-issues, edges, comments and wiki pages all go through the
outbox, and a completed flush refreshes the wiki `Roadmap` page. Add the config defaults and extend the repo seam guard to the new
modules.

Purpose: one user-facing push command; one writer for the objective body; hermetic seam guarantees. Output: `gh.cjs` change + new
`gh-sync-store.test.cjs`; config template; seam guard.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Every existing test in `gh-sync.test.cjs`, `gh-e2e.test.cjs`, `gh-commands.test.cjs`, `gh.test.cjs`, `execute-objective-gh-sync.test.cjs`
  passes UNCHANGED (store mode is off in their fixtures).
- `gh.cjs` gains no process spawning (seam test 17 already asserts it).
- Tests: `makeStoreProject({store:true})` (47-02 builder option that writes `github.store: true`),
  `hermeticEnv()`, fake via `gh._setRunGh(fake.runGh)`, fake clock, `DEVFLOW_WIKI_REMOTE` → wiki fixture.
- No property-based tests, no generated data, never port 8080.

## Decisions taken in planning

- **D-15 Outbox scope and rollout.** `github.store` (template default `false`) gates the new push path. Existing DevFlow projects with
  `github.enabled:true` keep 46 behaviour until they opt in (objective 50 `gh setup` / objective 51 migration turn it on). In store mode, every
  write 47 introduces plus the objective body edit goes through the outbox. Still direct `ghWrite` (deferred to objective 48's write-path
  migration): 46's objective-issue create, label/milestone bootstraps, the sticky `kind=state` comment, and Project v2 field updates — all
  idempotent or best-effort today.
- **One body writer.** In store mode, step 6 of `syncObjective` (direct `issue edit`) is replaced by `pushHierarchy(root, id, {objectiveSections})`
  where `objectiveSections` = 46's `buildObjectiveSections(...)` WITHOUT `trds` (store mode derives `trds` as native line / task list).
- **D-28 Roadmap page.** Written only when the flush returns `flushed`: `renderRoadmap(readRemoteModel(root))` → page `Roadmap` via
  `gh-wiki.openStore(root, {mode})` (wiki or docs) → `push`. A pending/halted flush skips it with a warning (the next complete sync refreshes it).
  `pull --all` never pushes it.
- **Baseline.** After `flushed`, `recordCacheBaseline(root, [TRD files, SUMMARY files, VERIFICATION, OBJECTIVE/CONTEXT/RESEARCH, PROJECT, REQUIREMENTS, codebase/*])`
  so a later `pull --all` can tell "untouched locally" from "edited locally".
- **Offline sync.** If 46's live steps fail with an offline classification (`gh-outbox-flush.classifyFailure`) and the mapping already has the
  objective, sync skips them (warning `offline: state comment and Project fields not updated`), enqueues the hierarchy, and returns
  `{ok:true, outbox:'pending', warnings}` (exit 0; `gh outbox flush` finishes the job). An unmapped objective offline is still an error (it
  cannot be created offline).
- **Flush outcome in the sync result.** `flushed` → ok; `pending` → `{ok:true, outbox:'pending'}`; `halted` → `{ok:true, outbox:'halted'}` with a
  warning that names `df-tools gh outbox status` (sync did its part; the halt is the outbox's report, surfaced by `gh outbox flush` exit 2).
- **Config template additions:** `"store": false`, `"labels": {..., "trd": "devflow:trd", "decision": "devflow:decision"}`, `"wiki": {"remote": ""}`.
  No budget knobs: 40K/60K are fixed by the proposal.

<embedded_context>

<codebase_examples>
`syncObjective` today (`gh.cjs:1221-1330`), steps relevant here:
```js
// 4. Disk state and the managed sections.
const state = resolved.dir ? readObjectiveState(resolved.dir, projectRoot) : roadmapOnlyState(projectRoot, resolved);
const sections = bodyLib.buildObjectiveSections({ ...state, objectiveId: resolved.id, dir: resolved.dir });
// 5. Find or create (the only create path ...)
const found = issueLib.findOrCreateObjectiveIssue(runCtx, resolved, { name: state.name, createBody: initial.body });
// 6. Merge managed sections; edit only when one changed.
if (!found.created) { const merged = bodyLib.mergeManaged(found.body || '', sections, resolved.id); ... client.ghWrite(['issue','edit', ...]) }
// 7. Sticky state comment.  8. Project fields.
```
`syncAll(root)` (`gh.cjs:1454`) shares one `runCtx` across objectives and writes the mapping once at the end — keep that, add
`opts.deferFlush` so each objective only enqueues and `syncAll` flushes once.

Seam guard to extend (`gh-seam.repo.test.cjs:17-20`):
```js
const GUARDED = ['gh.cjs', 'gh-pull.cjs', 'gh-issue.cjs', 'gh-project.cjs', 'gh-mapping.cjs', 'gh-body.cjs',
  'gh-milestone.cjs', 'sync-state.cjs', 'conflict.cjs', 'awareness.cjs'];
```
Add: `gh-trd.cjs`, `gh-capability.cjs`, `gh-outbox.cjs`, `gh-outbox-flush.cjs`, `gh-hierarchy.cjs`, `gh-comments.cjs`, `gh-wiki.cjs`,
`gh-cache.cjs`. (`gh-store-cli.cjs` is created by 47-11 in this same wave, so it is added to GUARDED by 47-13 — reading a file that a
parallel executor has not written yet would make this guard flaky.)
</codebase_examples>

<anti_patterns>
- A second objective-issue create path (46 duplicate bug class).
- Writing the objective body both directly and through the outbox in store mode.
- Turning store mode on by default (silently creates TRD issues in every repo that already syncs).
- Relaxing the seam guard instead of naming the `git` exception explicitly.
</anti_patterns>

<error_recovery>
- If a 46 test breaks, the store branch leaked into non-store mode: guard every new step with `storeEnabled(cfg)`; do not edit the 46 test.
- Wiki Roadmap push conflict → warning only; sync result stays ok (the page is a view).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-09-gh-hierarchy-TRD.md
@.planning/objectives/47-github-authoritative-store/47-10-gh-cache-pull-all-TRD.md
@plugins/devflow/devflow/bin/lib/gh.cjs
</context>

<gotchas>
- `gh.cjs` is 1,724 lines: read only `syncObjective`, `syncAll`, `cmdGhSyncObjective`, `cmdGhSync` (use `rg -n` + offset/limit).
- `storeEnabled(cfg)` = `cfg.github && cfg.github.store === true` (strict boolean).
- Result shape additions: `hierarchy: {enqueued, outbox: flush.status, degraded}`, `roadmap_page: 'pushed'|'skipped'|'unchanged'`.
- Config template change can affect `config-get` defaults tests and `awareness.test.cjs` "existing blocks preserved"; run them.
</gotchas>

## Test list

1. Store off (template default): `gh sync 7` performs exactly 46's calls (assert no `api ... sub_issues`, no REST create, no journal file).
2. Store on, org repo, wiki ok: `gh sync 7` → objective issue found/created by 46 path; 3 TRD sub-issues; blocked-by 7-03←7-01; SUMMARY comment; wiki pages `Objective-7-store-demo`, `Project`, `Requirements`, `Roadmap`; objective body has ONE copy of each managed section (`summary`, `criteria`, `trds`, `wiki`, `footer`), `trds` is the native one-liner.
3. Store on: zero direct `issue edit` calls for the objective body (all body writes are `api --method PATCH repos/o/r/issues/<n>` from the flusher).
4. Re-run `gh sync 7` unchanged → zero writes except 46's idempotent bootstraps (assert the exact allowed set).
5. `gh sync --all` with two objectives → one flush at the end (journal drained once; ops ordered objective 7 before objective 8).
6. Offline with the objective mapped → `{ok:true, outbox:'pending'}`, warning names skipped live steps, journal holds the ops; `fake.setOffline(false)` + `gh outbox flush` (library `flush`) completes them and the Roadmap page is refreshed by the next sync.
7. Offline with the objective unmapped → `{ok:false}` error (cannot create offline).
8. Pending/halted flush → `roadmap_page:'skipped'` with a warning.
9. After a complete sync, `gh-outbox.readCacheIndex` has hashes for every pushed file.
10. User-owned repo, no wiki, store on → labels + `meta`, `docs/devflow/` pages including `Roadmap.md`.
10a. Store on with a 60,001-char `07-04-big-TRD.md` → `{ok:false, refused:'budget'}` and `fake.calls()` is EMPTY (no auth check, no objective create, no journal).
11. `templates/config.json` has `github.store === false`, `labels.trd`, `labels.decision`, `wiki.remote === ''`; `config-get github.store` returns `false`.
12. Seam guard: GUARDED includes the 8 new wave 1-3 modules; `spawnSync('git'` only in `gh-wiki.cjs`; `ghWrite(` absent from gh-hierarchy, gh-comments, gh-cache, gh-capability; existing tests 17-19 still pass.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Store branch in syncObjective/syncAll (tests 1-10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs</files>
  <action>
RED: new `gh-sync-store.test.cjs` with tests 1-10a (copy the `capture()` harness and shared env setup from `gh-e2e.test.cjs`). Commit RED.
GREEN in `gh.cjs`:
0. Store mode only: run `hierarchyLib.planPush(projectRoot, objectiveArg)` right after the enabled gate and objective resolution and BEFORE auth,
   find-or-create or any other gh call; a budget refusal returns `{ok:false, refused:'budget', over}` with zero gh calls (SC2: refused before
   any issue — including the objective issue — is created).
1. `storeEnabled(cfg)`; in `syncObjective`, when store mode: after step 5, skip step 6's direct edit; call
   `hierarchyLib.pushHierarchy(projectRoot, resolved.id, {objectiveSections: omit(sections, 'trds')})` (lazy require).
2. Unless `opts.deferFlush`: `flush(projectRoot, {wait:true})`; on `flushed` → Roadmap page (D-28) + `recordCacheBaseline`.
3. Offline handling per Decisions: wrap the live 46 steps; on an offline-classified failure with a mapped objective, warn and continue to (1).
4. `syncAll`: pass `deferFlush:true`, flush once after the loop, then Roadmap page + baseline.
5. Attach `hierarchy` and `roadmap_page` to the result.
Commit GREEN; run the 46 regression set.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs</verify>
  <done>Tests 1-10 pass; every 46 suite unchanged and green.</done>
  <recovery>If 46 suites fail, revert the gh.cjs hunk (`git restore -p plugins/devflow/devflow/bin/lib/gh.cjs`) and re-apply with every new step inside `if (storeEnabled(cfg))`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Config defaults and seam guard (tests 11-12)</name>
  <files>plugins/devflow/devflow/templates/config.json, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs, plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs</files>
  <action>
RED: test 11 in `gh-sync-store.test.cjs`; test 12 as new cases in `gh-seam.repo.test.cjs` (extend GUARDED; add test 20 "git only in gh-wiki"
and test 21 "store modules other than gh-outbox-flush never call ghWrite"). Commit RED.
GREEN: add the config keys (Decisions); confirm the guard passes against the real modules (if it fails, fix the module, not the guard). Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/config.test.cjs</verify>
  <done>Tests 11-12 pass; awareness and config (config-get defaults) suites green.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "storeEnabled" plugins/devflow/devflow/bin/lib/gh.cjs` shows every new step guarded.
- Test 1 proves 46 behaviour is unchanged with store off; test 3 proves one body writer with store on.
</verification>

<success_criteria>
`gh sync` pushes the whole hierarchy through the outbox when the store is enabled, behaves exactly as before when it is not, and the
repo guard keeps one gh seam and one git seam.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-12-sync-store-wiring-SUMMARY.md`
</output>
