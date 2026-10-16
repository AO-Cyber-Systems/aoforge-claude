---
objective: 48-planning-write-path-migration
trd: "08"
subsystem: hooks
tags: [edit-gate, store-mode, cache-deny, planning-paths, planning-mode, fail-open, worktree, node-test, tdd]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-mode (isStoreMode, main-checkout resolution) and planning-paths (classify -> {class, verb, hint}, relToPlanning)"
provides:
  - "hooks/gate-edits.js: store-mode cache deny. Edit/Write/MultiEdit of a cache or generated .planning/ file is denied with a reason naming the df-tools verb"
  - "gate-edits exports readStoreMode(cwd) (fail-open, strict true) and the _setPlanningLibs(libs) test seam"
  - "shouldGate options storeMode (default off) and sharedDir (main checkout's .planning)"
affects: [48-09, 48-15, 48-22]

tech-stack:
  added: []
  patterns:
    - "Hook requires ../devflow/bin/lib/*.cjs lazily inside try/catch (guard-no-progress precedent); null libs = store off"
    - "Store-mode rule runs only when storeMode === true; with store off the planning libs are never consulted (asserted with exploding stubs)"
    - "main() reads the mode only for a target path containing '.planning', so non-planning edits do exactly the same I/O as before"

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/gate-edits.js
    - plugins/devflow/hooks/gate-edits.test.js

key-decisions:
  - "The cache deny comes before the planning-artifact, devflow-agent and skill-active allows (D-18). Only the override phrase skips it. DEVFLOW_SKIP_EDIT_GATE and editGate off still disable the whole gate, and warn maps it to ask. No new escape was added."
  - "rel is computed against the nearest .planning first, then the main checkout's (sharedDir). A .planning/ of some other project falls through to today's allow and is never denied by this project's mode."
  - "When the nearest .planning holds the file but classifies it as tracked-config or runtime, the rule returns at once and never falls on to sharedDir"
  - "readStoreMode takes only a literal true from isStoreMode; any throw or unavailable lib reads as store off"
  - "The reason keeps the TRD's format for both classes ('<rel> is a read-only cache of GitHub in store mode (github.store: true). Change it with: <hint>. ... (W055).'); for generated files the hint carries `df-tools gh pull --all`"

patterns-established:
  - "Later TRDs that harden this backstop (W055 in validate, 48-15 verb dispatch) can rely on gate-edits naming the same verb and hint strings planning-paths produces"

requirements-completed: [GWP-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-01
tokens_input: 3711093
tokens_output: 37153
tokens_cache_read: 3607853
tokens_cache_write: 103168
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 08: Edit gate denies cache edits in store mode Summary

**In store mode (`github.enabled` and `github.store` both true in the main checkout's config), the edit gate now denies any
Edit/Write/MultiEdit of a cached or generated planning file, even under a skill marker or a `devflow:*` agent, and its reason
names the df-tools verb to use (`plan put-trd`, `summary post`, `doc put`, `gh pull --all`, and so on). With store off the
gate is byte-identical to before.**

## Performance

- Started 2026-10-01T12:23:51Z, last code commit 12:27:41Z (about 5 min including verification)
- 2 tasks, 4 commits (RED and GREEN for each), 2 files modified, 0 created

## Accomplishments

- `shouldGate` takes two new options, `storeMode` and `sharedDir`, and has a new rule 0. The rule runs only when
  `storeMode === true` and no override is active. It resolves the target against the nearest `.planning/` and then the main
  checkout's, classifies it with `planning-paths.classify`, and denies the `cache` and `generated` classes. Other classes fall
  through to the old logic.
- `readStoreMode(cwd)` wraps `planning-mode.isStoreMode`, which resolves a linked worktree to its main checkout without spawning
  git. `main()` calls it only when the target path contains `.planning`.
- The planning libs load lazily and fail open: if a require fails, or if `relToPlanning`, `classify` or `isStoreMode` throws, the
  hook behaves as store off and does not crash. The `_setPlanningLibs` seam lets tests inject failures.
- The header comment documents rule 0 at the top of the decision order and lists its escapes.

## Store-off invariant (this repo: `github.enabled: false`)

Three separate checks show the store-off invariant holds:

1. **Unit parity:** for 23 paths and 7 option variants, `shouldGate` returns deep-equal results whether `storeMode` is absent,
   `false` or `undefined`. Every planning path is still `{allow, 'planning artifact'}`.
2. **Libs untouched:** with the planning libs replaced by stubs that throw on any call, all 19 planning paths still allow when
   `storeMode` is false. With store off, the new code never runs.
3. **Spawn level:** six store-off configs produce no output for TRD, OBJECTIVE, ROADMAP, STATE and todo paths, while a code file
   still gets the ambient deny. The configs were: no config.json, `{}`, `store:false`, `enabled:false` with `store:true`, this
   repo's `{enabled:false}`, and the strings `"true"`. A live run of the new hook from this worktree against the real repo config
   allowed this TRD, the main checkout's STATE.md and ROADMAP.md as `devflow:executor`, and `readStoreMode` returned `false` for
   both the worktree and the main checkout.

All 86 tests that were in `gate-edits.test.js` before this TRD pass unchanged (`--test-skip-pattern=48-08`: 86/86). This TRD
adds 28 tests (17 in Task 1, 11 in Task 2), for 114/114 in total. `git diff --numstat` on the test file shows 496 lines added
and 0 removed.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1: store-mode cache deny in shouldGate | 51c14015 test(48-08): edit gate denies cache edits in store mode | 163a716a feat(48-08): edit gate denies cached planning files in store mode |
| 2: main() reads store mode | b60b397c test(48-08): gate main() in store mode | 9765b8eb feat(48-08): gate reads store mode |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS (103/103: 86 pre-existing plus 17 new) |
| 2 | `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (gate-edits 114/114, route-intent all green) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test --test-name-pattern=48-08 .../gate-edits.test.js` | 1 (11 of 17 fail: allow instead of deny, `_setPlanningLibs` missing) | FAIL (correct) |
| GREEN 1 | `node --test .../gate-edits.test.js` | 0 | PASS (correct) |
| RED 2 | `node --test --test-name-pattern=48-08 .../gate-edits.test.js` | 1 (8 fail: main() emits nothing in store mode, `readStoreMode` missing; store-off spawn cases already pass) | FAIL (correct) |
| GREEN 2 | `node --test .../gate-edits.test.js .../route-intent.test.js` | 0 | PASS (correct) |

No REFACTOR commits were made because the GREEN code needed no cleanup.

## TRD test-list coverage

| TRD test | Covered by |
|---|---|
| 1 (SC2) | `test 1 (SC2)`: deny, reason contains `plan put-trd`, rel prefix, `github.store: true`, W055 |
| 2 | `test 2`: skill marker deny, devflow:executor deny, both together deny, override allows as `planning artifact` |
| 3 | `test 3` |
| 4 | `test 4`: all 9 cache verbs |
| 5 | `test 5`: ROADMAP, STATE, MILESTONES → `gh pull --all` |
| 6 | `test 6`: config.json, STACK.md, .skill-active, state.json, .trd-progress, quick DECISION |
| 7 | `test 7` |
| 8 | `test 8` (nearest .planning), `8b` (main checkout's file via sharedDir), `8c` (another project's .planning falls through) |
| 9 | `test 9` |
| 10 (D-10) | `test 10` at unit level with store on and off, plus `test 11c` at spawn level |
| 11 (SC2) | `test 11`, `11b` (marker plus devflow:executor, for Write, Edit and MultiEdit), `11c` |
| 12 | `test 12` (warn → ask), `12b` (env escape, editGate off), `12c` (single-use override marker), `12d` (store off) |
| 13 | `test 13`, `13b` (throwing classifier, throwing relToPlanning, null libs), `readStoreMode` fail-open test |
| must-have: mode read from MAIN config | spawn test on a real git worktree: main store on with worktree off → deny; main off with worktree on → allow |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS |
| regression | `node --test plugins/devflow/hooks/*.test.js` | 0 | PASS (every hook suite, 0 failures) |
| verification | `git diff --numstat fdfb4b4f -- plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS: 496 lines added, 0 removed |
| full suite | `npm test` (worktree) | 0 | PASS: 7205 tests, 7172 pass, 0 fail, 33 skipped |

The known MA-7 flake in `handoff-e2e.test.cjs` did not fire on this run.

## Deviations from Plan

None that change the TRD's contract. The TRD left room for these choices:

1. **`shouldGate` also takes `sharedDir`.** The TRD places the rule on "the nearest `planningDir` or `sharedPlanningDir`".
   `shouldGate` only received `planningDir`, so it now takes an optional `sharedDir`, and `main()` passes it in. Without it, an
   edit of the main checkout's cached file made from a worktree would get past the rule.
2. **The lazy check in `main()` uses `filePath.includes('.planning')`** rather than the `/\/\.planning\//` regex. A relative
   target is still classified, and every other edit skips the libs entirely. This applies the TRD's error-recovery note
   proactively.
3. **Extra tests beyond the list:** 8b and 8c, 11b, 11c, 12c and 12d, two explicit store-off invariant tests, and a real git
   worktree spawn test. The orchestrator asked for an explicit store-off proof, and the main-config must-have needed one too.

## Notes for later TRDs

- **Shipping:** hooks run from the installed plugin, so this change does not affect live sessions until the plugin is released and
  re-mirrored. It is inert in any project whose config is not store on.
- **W055:** the deny reason already says direct edits are "flagged by validate (W055)". The TRD that adds W055 to
  `validate health` should keep that code name.
- **Session-level escape:** the override phrase (`.edit-override`) is single-use. After a store-mode cache deny, a user who
  really wants a direct edit must say "skip devflow" again for each edit, or set `gates.editGate: off`. This follows D-18.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (SC2 deny under marker and agent; every verb named; config and runtime allowed; store-off
  byte-identical; escapes unchanged with no new one; worktree classification with mode from the main config; D-10 regression;
  fail-open)
- Gate failures: None

## Self-Check: PASSED

- FOUND: `plugins/devflow/hooks/gate-edits.js` and `plugins/devflow/hooks/gate-edits.test.js` (both exercised by the runs above)
- FOUND: commits 51c14015, 163a716a, b60b397c, 9765b8eb (`git log fdfb4b4f..HEAD`)
- STATE.md and ROADMAP.md were deliberately not edited. The orchestrator updates them after the wave merges.
