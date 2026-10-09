---
objective: 51-github-migration-and-docs
trd: "02"
subsystem: testing
tags: [fixtures, backfill, store-mode, fake-github, fake-clock, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "gh-store-fixtures (oversizedTrdText, hermeticEnv), gh-fake createFakeGitHub, wiki-remote"
  - objective: 48-planning-verbs
    provides: "planning-import useProject pattern, planning-paths class table, planning-mode"
provides:
  - "makeBackfillProject(opts): a deterministic, git-initialised, local-mode project with 20 objectives x 5 TRDs, github {enabled, repo:'o/r'}, store OFF, stamped through 0009 so no earlier migration still applies"
  - "BACKFILL_SHAPE: frozen default counts (20 objectives, 100 TRDs, 80 SUMMARYs, 8 VERIFICATIONs, 15 shipped, 1 cancelled, 3 todos, 1 debug, 1 quick, 1+1 decisions, 2 shipped milestones, 224 files)"
  - "useBackfillEnv(t, opts): hermetic env + git isolation + fake GitHub on the gh seam + local bare wiki remote + fake clock, restored by t.after; null (t.skip) without git"
  - "BACKFILL_T0 (fake clock start) and MILESTONE_PLAN"
affects: [51-03, 51-05, 51-06, 51-07, 51-08]

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-backfill-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs

key-decisions:
  - "config.json is the real templates/config.json (nested shape) with github overlaid (enabled true, repo o/r, `store` deleted) plus the devflow stamp, and the project carries state.json: with the bare `{github, devflow}` config the TRD sketched, `upgrade --check` still reported 0001 and 0003 pending, so an SC2 'a re-run changes nothing' assertion could fail for a reason unrelated to the backfill. Test 3 now pins `upgrade --check` → nothing pending"
  - "A third milestone, v0.3 (objectives 16+), is listed in the ROADMAP `## Milestones` as in progress and set as `milestone:` on those OBJECTIVE.md files. Without it gh-milestone would resolve objectives 16-20 through the ROADMAP fallback onto a shipped milestone. MILESTONES.md still has exactly the two shipped sections, so BACKFILL_SHAPE.milestones is 2 (shipped sections, what planImport turns into milestone puts); a full store push will see three milestone titles"
  - "objectiveMd/planMd in upgrade-fixtures.cjs are not exported and do not fit (no status/milestone, fixed wave 1, no depends_on), so the builder has its own hand-written bodies; it reuses makeFakeHome, initGitFixture, FIXTURE_STAMP_TIME, oversizedTrdText, hermeticEnv, createWikiRemote, applyGitTestEnv, gitTestEnv and createFakeGitHub by require"
  - "Statuses are by objective number (1-15 complete, 16-18 in_progress, 19 cancelled, 20+ planned), so a smaller build (objectives: 2 or 3, as 51-05/51-08 plan) is all shipped; the decision with `trd:` blocks 16-03, or the last objective's TRD in a smaller build so it always names a TRD that exists"
  - "Variants add an extra (T+1)-numbered file to the LAST objective: `20-06-TRD-legacy-step.md` (matches LEGACY_TRD_RE, classified runtime) and `20-06-big-step-TRD.md` (encoded body exactly 61,000 chars, objective line rewritten to its own objective); the oversize file counts as a TRD (shape.trds 101), the legacy one does not"
  - "The decision with `trd:` is pending (an open question on the in-progress objective's next TRD); the decision without `trd:` is resolved"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-01
tokens_input: 11292290
tokens_output: 79822
tokens_cache_read: 11115118
tokens_cache_write: 177002
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 02: The 20-objective backfill fixture Summary

**`makeBackfillProject()` builds a deterministic, git-tracked, local-mode project with 20 objectives x 5 TRDs of mixed history (15 shipped, 3 in progress, 1 cancelled, 1 planned) and stamps it through 0009. No earlier migration still applies to it. `useBackfillEnv(t)` adds a fake GitHub, a fake clock and a local wiki remote around it, all hermetic and all restored by `t.after`.**

## What was built

- `__fixtures__/gh-backfill-fixtures.cjs`
  - `layout(opts)` is pure: it returns the ordered `[rel, text]` list plus the counts and named paths, all derived by the same loops. `BACKFILL_SHAPE = layout().shape`, so the shape is never read back from a tree.
  - `makeBackfillProject({objectives=20, trdsPerObjective=5, git=true, legacyTrd=false, oversizeTrd=false, home})` writes the layout under a temp root and runs `initGitFixture` (one `git add -A` commit). It returns `{root, home, shape, files, paths, cleanup}`.
  - Tree, default build:
    - `config.json`, `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` (milestone list, `### Objective N:` headers, TRD checklists, a `## Progress` table reading Complete / In progress / Cancelled / Registered), `STATE.md`, `state.json`, `MILESTONES.md` (`## v0.1`, `## v0.2`) and `research/a.md`.
    - 20 `NN-objective-NN/` dirs, each with `OBJECTIVE.md` (`status`, `milestone`) and `NN-MM-step-MM-TRD.md` files (~1 KB, waves 1,1,2,2,3, `depends_on: []`).
    - SUMMARYs for every TRD of objectives 1-15 except the deferred `03-05`, and for TRDs 01-02 of objectives 16-18. `NN-VERIFICATION.md` (passed) for odd shipped objectives.
    - 3 todos (2 pending, 1 completed), 1 debug session, 1 quick task (JOB + SUMMARY), and 2 decisions: one pending with `trd: 16-03`, one resolved with no `trd:`.
  - `useBackfillEnv(t, opts)` sets up `hermeticEnv()`, then `applyGitTestEnv(home)`, then the project (`home` = the hermetic home, so HOME, git and `env.home` agree). It adds `createFakeGitHub({hasWiki:true, ...opts.fake})` on `gh._setRunGh`, `createWikiRemote()` (seeded `Home.md`) as `DEVFLOW_WIKI_REMOTE`, and the fake clock at `BACKFILL_T0`. A LIFO teardown on `t.after` resets the client, restores `_setRunGh(null)` and the env, and removes every temp dir. It returns `{root, home, shape, files, paths, fake, clock, wiki, env}`. `env` is the overlay a child process needs (for 51-08's CLI e2e).
- `gh-backfill-fixtures.test.cjs` covers tests 1-7 of the TRD's test list, plus a smoke case and a realism check (`upgrade --check` on the fixture leaves nothing pending).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: builder and shape (tests 1-6) | `node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs` | 0 | PASS (6/6, 4.6-7.8 s under load) |
| 2: useBackfillEnv harness (test 7) | `node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs` | 0 | PASS (11/11; planning-import 3/3 unchanged) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-backfill-fixtures.test.cjs` | 1 | FAIL: Cannot find module `./__fixtures__/gh-backfill-fixtures.cjs` (commit 5fb14f31) |
| GREEN (task 1) | `node --test .../gh-backfill-fixtures.test.cjs` | 0 | PASS 6/6 (commit 4a5a595f) |
| RED (task 2) | `node --test .../gh-backfill-fixtures.test.cjs` | 1 | FAIL: 7a `useBackfillEnv is not a function`; 7b skipped because it depends on 7a (commit 1feea69c) |
| GREEN (task 2) | `node --test .../gh-backfill-fixtures.test.cjs .../planning-import.test.cjs` | 0 | PASS 11/11 (commit ae47c467) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs` | 0 | PASS (8/8) |
| full suite | `npm test` | 1 | 8247 pass / 10 fail / 50 skipped (8307 tests). All 10 failures are pre-existing and environmental, in daemon tests this TRD does not touch: `devflow-watch.test.cjs` (5; the spawned daemon never writes its PID file, and it reproduces when the file runs alone) and `handoff-e2e.test.cjs` (5; same daemon, timeouts waiting on its PID/done files). Both 51-02 suites pass inside the full run. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The fixture's stamp was not true. Migrations 0001 and 0003 still applied.**
- **Found during:** Task 1, a realism check before the GREEN commit (`df-tools upgrade --check --path <fixture>` with the fixture's fake HOME).
- **Issue:** The TRD sketched the bare config `{github, devflow}`. On that config, 0001 reported missing template sections. With no `state.json` on disk, 0003 would seed one. Any later `upgrade --apply` would then change the tree, which breaks SC2's "re-run is a no-op" for reasons unrelated to the backfill.
- **Fix:** `config.json` is now the real `templates/config.json` with github overlaid (`store` deleted) plus the devflow stamp. A hand-written `state.json` is added. Test 3 asserts that `upgrade --check` reports nothing pending or pending-confirm.
- **Files modified:** both 51-02 files.
- **Commit:** 4a5a595f

**2. [Rule 2 - Missing critical] A third, in-progress milestone (v0.3) for objectives 16+.**
- **Found during:** Task 1, reading `gh-milestone.resolveObjectiveMilestone`.
- **Issue:** Objectives 16-20 had no milestone of their own. The resolver would fall back to the ROADMAP list, which only named shipped milestones, and put open work in a shipped milestone.
- **Fix:** Added a v0.3 bullet to the ROADMAP list (marked in progress) and set `milestone: v0.3` on those objectives. MILESTONES.md keeps exactly two shipped sections, and `BACKFILL_SHAPE.milestones` stays 2.
- **Commit:** 4a5a595f

**3. [Plan note] I did not reuse `objectiveMd`/`planMd` from upgrade-fixtures.**
- They are not exported, and their shape is wrong here (no status or milestone, wave fixed at 1, no `depends_on`). The builder has its own fixed bodies. Every exported helper the TRD named is reused by `require`.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 5/5. Default 20x5 local-mode git project with store off. Statuses and the deferred 03-05. Entities and documents. Legacy and oversize variants, absent by default. Byte-identical rebuilds.
- Gate failures: None

## Notes for downstream TRDs

- The ids the store uses are `16-03` (unpadded objective). The legacy and oversize variants sit in objective 20 as TRD `06`.
- A full store push of the default build sees three milestone titles (v0.1, v0.2, v0.3). `BACKFILL_SHAPE.milestones` (2) counts only the shipped MILESTONES.md sections.
- `useBackfillEnv` forces `git: true` and its own `home`. Pass builder options plus `fake` and `wikiSeed`.
