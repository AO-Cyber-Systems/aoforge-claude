---
objective: 48-planning-write-path-migration
trd: "08"
type: tdd
wave: 2
depends_on: ["48-01"]
files_modified:
  - plugins/devflow/hooks/gate-edits.js
  - plugins/devflow/hooks/gate-edits.test.js
autonomous: true
requirements: [GWP-03]
must_haves:
  truths:
    - "SC2: in store mode, Write/Edit/MultiEdit to `.planning/objectives/<dir>/<NN>-<MM>-<slug>-TRD.md` is DENIED with a reason containing `plan put-trd`, even when a skill marker is live and when `agent_type` is `devflow:executor`"
    - "In store mode every `cache` path is denied naming its verb (OBJECTIVE → `objective put`, SUMMARY → `summary post`, VERIFICATION → `verification post`, docs/research/milestones/wiki → `doc put`, todos → `todo add`, debug → `debug put`, quick → `quick put`, decisions → `decision open`) and `generated` paths (ROADMAP/STATE/MILESTONES) are denied naming `gh pull --all`"
    - "In store mode `.planning/config.json`, `.planning/STACK.md` and runtime paths (`.skill-active`, `state.json`, `.trd-progress/x.md`) are allowed"
    - "With store off (default) behaviour is byte-identical: every `.planning/` path is allowed as 'planning artifact'; all pre-existing gate tests pass unchanged"
    - "`DEVFLOW_SKIP_EDIT_GATE=1` and `gates.editGate: off` still disable the gate; `warn` turns the cache deny into `ask`; the `.edit-override` phrase allows a cache edit; no new escape exists (D-18)"
    - "A worktree file path classifies the same as the main checkout's, and mode is read from the MAIN checkout config"
    - "Regression (D-10): `agent_type: 'devflow:executor'` writing a non-planning code file in the main checkout is allowed"
    - "The hook fails open: if the planning libs cannot be loaded or throw, the store check is skipped and today's logic runs"
  artifacts:
    - path: plugins/devflow/hooks/gate-edits.js
      provides: "readStoreMode, classifyCachePath, cache deny branch in shouldGate (opt `storeMode`)"
  key_links:
    - "Requires `../devflow/bin/lib/planning-mode.cjs` and `planning-paths.cjs` (48-01) inside try/catch, like guard-no-progress.js requires bin/lib modules"
---

# TRD 48-08: Edit gate denies cache edits in store mode and names the verb (GWP-03, SC2)

<objective>
Make the edit gate the backstop for the write-path migration: in store mode a direct Edit/Write/MultiEdit of any cached or generated
planning file is denied with a message naming the df-tools verb to use, regardless of skill markers or agent identity. Store off, the
gate is unchanged.

Purpose: GWP-03 first half and SC2. Output: gate change + tests (pure `shouldGate` cases and one spawn-level `main()` case).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED (new failing cases) before GREEN. The whole existing `gate-edits.test.js` must pass unchanged — it is the local-mode parity proof
  for the gate (including "ALLOW: any path matching /.planning/").
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Fail open: wrap the `require`s and the classification in try/catch; on any error behave as store off.
- Hook cost: no git spawn, no network; mode read is one JSON read via `planning-mode`.
- Tests: temp project dirs; spawn test feeds `realPreToolUsePayload` JSON to `node gate-edits.js` with `cwd` set to the temp project and a
  clean env (no `DEVFLOW_SKIP_EDIT_GATE`). Never touch the real `~/.claude`, never port 8080.

## Decisions

D-18 (gate placement and escapes), D-10 (plugin lag: no allowance change, add regression), D-14 (main checkout). Settled here:

- **Placement**: in `shouldGate`, right after the empty-path check and BEFORE the `/\/\.planning\//` allow: if `storeMode` and the path is under a
  `.planning/` dir of this project (nearest `planningDir` or `sharedPlanningDir`), compute `rel` with `planningPaths.relToPlanning` and
  `classify(rel)`. Class `cache` or `generated` → unless `overrideActive`, return
  `{decision:'deny', reason: '<rel> is a read-only cache of GitHub in store mode (github.store: true). Change it with: <hint>. Direct edits are overwritten by gh pull --all and flagged by validate (W055).'}`.
  Other classes fall through to today's logic (which allows `.planning/`).
- **Inputs**: `shouldGate` gains optional `storeMode` (default false) — existing callers/tests unaffected. `main()` computes
  `storeMode = readStoreMode(process.cwd())` via `planningMode.isStoreMode` (it resolves the main checkout).
- **editGate warn**: unchanged mechanism (`main()` maps deny → ask), so the cache deny becomes ask too.
- **Docs**: update the file header comment block (decision order) with the new first rule and its escapes.

## Test list

Pure `shouldGate` (store mode on unless noted)
1. SC2: Write `/p/.planning/objectives/07-x/07-01-a-TRD.md`, planningDir `/p/.planning` → deny; reason contains `plan put-trd`.
2. Same with `skillActive:true` → deny; with `agentType:'devflow:executor'` → deny; with `overrideActive:true` → allow (falls through to planning-artifact allow).
3. Same path with `storeMode:false` → allow 'planning artifact' (today).
4. OBJECTIVE.md → reason contains `objective put`; `07-01-SUMMARY.md` → `summary post`; `07-VERIFICATION.md` → `verification post`; `07-RESEARCH.md` → `doc put`; `research/a.md` → `doc put`; `todos/pending/a.md` → `todo add`; `debug/x.md` → `debug put`; `quick/1-x/1-JOB.md` → `quick put`; `decisions/pending/DECISION-001.md` → `decision open`.
5. ROADMAP.md, STATE.md, MILESTONES.md → deny, reason contains `gh pull --all`.
6. config.json, STACK.md, `.skill-active`, `state.json`, `.trd-progress/07-01.md`, `quick/1-x/DECISION-001.md` → allow.
7. Edit and MultiEdit behave like Write; Read → noop.
8. Worktree: file `/wt/.planning/objectives/07-x/07-01-a-TRD.md` with planningDir `/wt/.planning` → deny (rel computed against the nearest .planning).
9. Non-planning file `/p/src/a.cjs` in store mode → today's decision (deny ambient / allow with marker / allow devflow agent).
10. D-10 regression: `agentType:'devflow:executor'`, `/p/src/a.cjs`, no marker, store off and on → allow 'devflow agent'.

Spawn-level `main()`
11. Temp project with `.planning/config.json` `{"github":{"enabled":true,"store":true,"repo":"o/r"}}`; payload Write of its TRD path → stdout JSON `permissionDecision: 'deny'`, reason contains `plan put-trd`.
12. Same project with `gates.editGate: 'warn'` → `ask`; with `DEVFLOW_SKIP_EDIT_GATE=1` → no output; with `store:false` → no output.
13. Fail-open: `storeMode` computation throws (inject via a `_setPlanningLibs` test seam returning a throwing classifier) → today's behaviour, no crash.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Store-mode cache deny in shouldGate (tests 1-10, 13)</name>
  <files>plugins/devflow/hooks/gate-edits.js, plugins/devflow/hooks/gate-edits.test.js</files>
  <action>
RED: add tests 1-10 and 13 in a new `describe('48-08 store-mode cache deny')`. Commit `test(48-08): edit gate denies cache edits in store mode`.
GREEN: add lazy, fail-open loading of `planning-mode.cjs`/`planning-paths.cjs` (`path.join(__dirname, '..', 'devflow', 'bin', 'lib', ...)`) with a
`_setPlanningLibs(libs)` test seam; add the `storeMode` option and the deny branch at the placement above, building the reason from
`classify(rel).hint`. Update the header comment. Commit `feat(48-08): edit gate denies cached planning files in store mode`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-edits.test.js</verify>
  <done>Tests 1-10 and 13 pass; every pre-existing gate test passes unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: main() reads store mode from the main checkout (tests 11-12)</name>
  <files>plugins/devflow/hooks/gate-edits.js, plugins/devflow/hooks/gate-edits.test.js</files>
  <action>
RED: tests 11-12 spawning `node plugins/devflow/hooks/gate-edits.js` with `input` = JSON payload and `cwd` = temp project (copy the existing
spawn-test helper in the same file). Commit `test(48-08): gate main() in store mode`.
GREEN: add `readStoreMode(cwd)` (try/catch → false) and pass `storeMode` into `shouldGate` in `main()`; export `readStoreMode`. Commit
`feat(48-08): gate reads store mode`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/route-intent.test.js</verify>
  <done>Tests 11-12 pass; route-intent suite (shares edit-override) green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `hooks/gate-edits.js` L265 `shouldGate`, L272 the `.planning` allow, L320 `main()`, L104 `sharedPlanningDir`.
- `hooks/gate-edits.test.js` L41 `realPreToolUsePayload`; L713 worktree test for `sharedPlanningDir`.
- `hooks/guard-no-progress.js` — precedent for a hook requiring `../devflow/bin/lib/*.cjs`.
</codebase_examples>
<anti_patterns>
- Letting `skillActive` or `isDevflowAgent` bypass the cache deny: those are exactly the actors the verbs constrain (D-18).
- Adding a new env escape for the cache deny: D-18 says no new escape.
</anti_patterns>
<error_recovery>
- If requiring planning-paths from the hook is slow in the spawn test (> 200 ms), keep the require lazy (only when the path contains `/.planning/`).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/hooks/gate-edits.test.js</test>
<regression>node --test plugins/devflow/hooks/*.test.js</regression>
</validation_gates>

<verification>
- SC2: test 1 and test 11 assert the reason contains `plan put-trd`.
- `git diff plugins/devflow/hooks/gate-edits.test.js` shows only additions.
</verification>

<success_criteria>
In store mode nothing but a df-tools verb can change a cached planning file through Edit/Write; store off, the gate is exactly what it was.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-08-SUMMARY.md`
</output>
