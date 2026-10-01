---
objective: 48-planning-write-path-migration
trd: "22"
subsystem: planning-verbs
tags: [sc3, d-01, gwp-01, gwp-03, gwp-04, e2e, parity, store-mode, tdd]

requires:
  - objective: 48-07
    provides: "gh-cache materialize of todo/quick entities, listOwnedLocal (wiki/** is not cache)"
  - objective: 48-08
    provides: "gate-edits store-mode cacheDeny"
  - objective: 48-09
    provides: "validate health W055 cache drift"
  - objective: 48-10
    provides: "migration 0010 (store .gitignore block), cmdCommit ignore filter"
  - objective: 48-12
    provides: "todo/quick entity verbs"
  - objective: 48-13
    provides: "store-aware generated-view writers"
  - objective: 48-14
    provides: "store-aware objective complete; store-cli-fixtures offlineTable"
  - objective: 48-15
    provides: "planning-verbs-cli cmd* functions (the in-process driver)"
provides:
  - "lib/planning-verbs.e2e.test.cjs: SC3 scenario on the fake GitHub, gh pull round trip, W055 + edit-gate and offline negatives, store-off parity against a pre-48 twin"
  - "__fixtures__/planning-e2e-fixtures.cjs: makeE2eRepo({store}) — real git repo, config/STACK (+ROADMAP/STATE locally), hand-written drafts, offline gh shim for spawned df-tools"
affects: [48-23]

tech-stack:
  added: []
  patterns:
    - "One scenario function, run twice: store mode asserts git status after every step; store-off compares the whole .planning/ tree against a twin driven the pre-48 way"
    - "In-process verbs (fake GitHub through the gh-client seam) + spawned git/local df-tools children (commit, upgrade, validate health, objective complete) with an offline, call-recording gh shim"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-e2e-fixtures.cjs
  modified: []

key-decisions:
  - "The store repo starts without ROADMAP.md/STATE.md (generated views only gh pull writes); the local repo carries hand-written ones so today's `objective complete` has something to edit. config.json differs only by `github.store`"
  - "The round trip (test 4) snapshots planning-paths class `cache` minus `wiki/**`: wiki/ is the local clone gh pull reads pages from, not a cache file (same rule as gh-cache.listOwnedLocal)"
  - "Parity compares every .planning/ file except OBJECTIVE.md byte-for-byte with the twin (drafts written in place + spawned `objective complete 7`); OBJECTIVE.md must equal the draft with `status: complete`; set-status stdout must equal the twin's `objective complete --raw` stdout"
  - "The edit-gate check spawns the real hooks/gate-edits.js as a devflow:executor Edit: deny naming `plan put-trd` in store mode (test 6), no deny with the store off (test 9)"

requirements-completed: [GWP-01, GWP-03, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-01
---

# Objective 48 TRD 22: End-to-end SC3, store-off parity, drift and offline negatives Summary

**One hand-written objective (OBJECTIVE, 3 TRDs in 2 waves, CONTEXT, RESEARCH, 3 SUMMARYs, VERIFICATION, a todo, a quick task) runs through the df-tools planning verbs twice. With `github.store: true` and migration 0010 applied, git sees only `src/t<N>.cjs` before each commit and nothing after it, GitHub holds everything, and `gh pull --all` rebuilds the cache byte for byte. With the store off, the same script writes exactly the draft bytes, matches a twin driven by the pre-48 commands file for file (ROADMAP/STATE included), and makes zero gh calls. No earlier-wave code needed a fix.**

## Accomplishments

- **`makeE2eRepo({store})`:**
  - Builds a temp git repo (`gitTestEnv`) holding `.planning/config.json` (`github.enabled/repo` [+`store`]), a `STACK.md` stub and an empty `objectives/07-store-demo`.
  - The local repo also gets a hand-written `ROADMAP.md` and `STATE.md`.
  - The initial commit holds only those files.
  - Drafts live under `<base>/drafts`, outside `.planning/`. `run()` spawns df-tools with an offline gh shim that records calls, plus the caller's hermetic HOME/outbox/gh-cache.
- **Store scenario (tests 1-7):**
  - Setup is the TRD order: init, config + STACK commit, spawned `upgrade --apply --only 0010 --confirm`, then a `df-tools commit` of `.gitignore`.
  - Then the 18 verb lines run in order:
    - `objective put`, `plan put-trd --no-push` ×3 and `plan push`
    - `doc put` ×2
    - per TRD: code commit, `summary checkpoint` and `summary post`
    - `todo add`, `quick put`, `quick summary`, `verification post` and `objective set-status complete`
- **Parity (tests 8-9):**
  - The same `runScenario` runs on a local repo A.
  - Twin B is driven the pre-48 way: drafts written in place, the same code commits, and a spawned `objective complete 7 --raw`.
  - Test 9 commits `.planning/` with `df-tools commit --files .planning/`. It then proves the files are tracked and that the real edit gate does not deny.

## Test → criterion

| Test | Criterion | Asserts |
|---|---|---|
| 1 | SC3 setup | `git ls-files .planning` = config.json, STACK.md; the 0010 block is in .gitignore; the tree is clean |
| 2 | SC3 | After each of 18 verbs: exit 0 and `git status --porcelain --untracked-files=all` empty. Before each commit the status is exactly `?? src/t<N>.cjs`; after it, empty. Cache bytes = drafts |
| 3 | SC3 / GWP-04 | GitHub state: <ul><li>The objective issue is CLOSED/completed, with exactly the 3 TRD sub-issues.</li><li>7-03 is blocked by 7-01.</li><li>One `kind=summary` comment per TRD, carrying the final SUMMARY.</li><li>One verification comment.</li><li>Context and Research wiki pages.</li><li>One open `devflow:todo` issue.</li><li>One CLOSED quick issue, with its summary comment.</li></ul> |
| 4 | SC3 | Delete 13 cache files, then `gh pull --all`: the same rel set, byte-identical. The second pull changes no byte. Zero GitHub writes; git stays clean |
| 5 | GWP-03 | Spawned `validate health --raw` shows no W055 |
| 6 | GWP-03 | `fs.writeFileSync` to `07-01-alpha-TRD.md` produces exactly one W055, naming the file and `plan put-trd`. Restoring the bytes clears it. The spawned gate-edits hook denies an Edit, naming `plan put-trd` |
| 7 | GWP-04 | With the fake offline, `plan put-trd 7 07-04-delta-TRD.md` exits 3, with the op pending in the journal and the rel in the ledger. Back online, `gh outbox flush` exits 0: the journal drains, the ledger entry settles and the 7-04 issue exists |
| 8 | D-01 | Every local write equals its draft bytes, and OBJECTIVE.md is the draft with `status: complete`. Every other `.planning/` file equals twin B's, ROADMAP ticked and STATE advanced. set-status stdout equals `objective complete` stdout. 0 in-process fake calls, 0 shim calls, no outbox files, no ledger |
| 9 | D-01 | Status shows exactly 13 `??` files plus ` M` on ROADMAP.md and STATE.md. After `df-tools commit --files .planning/` it is clean and all 13 are tracked. There is no .gitignore, and the edit gate does not deny |

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 | d9078853 | test(48-22): e2e fixture and store setup |
| 2 | d473aa0b | test(48-22): SC3 plan-execute-verify leaves git clean |
| 3 | f42cda65 | test(48-22): store-off parity for every verb |
| verification | f3e43228 | test(48-22): drop port and host literals from e2e comments |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test lib/planning-verbs.e2e.test.cjs` | 0 | PASS (1/1) |
| 2 | `node --test lib/planning-verbs.e2e.test.cjs` | 0 | PASS (7/7) |
| 3 | `node --test lib/planning-verbs.e2e.test.cjs lib/gh-store-e2e.test.cjs ../../hooks/gate-edits.test.js` | 0 | PASS (136/136) |
| verification | `rg -n "8080\|api.github.com" lib/planning-verbs.e2e.test.cjs` | 1 (no match) | PASS |

## TDD Evidence

Every behaviour under test was built test-first in 48-01..48-15. As the TRD anticipates, each scenario test was committed as a test commit and passed on its first full run. The exception was test 4, whose first run failed because of a defect in the test itself, not the product (see Deviations).

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 | `node --test lib/planning-verbs.e2e.test.cjs` | 0 | PASS: the setup contract already holds |
| Task 2, first run | same | 1 (test 4) | Test bug: it deleted the wiki clone's working files |
| Task 2, fixed | same | 0 (7/7) | PASS |
| Task 3 | same + 47 e2e + gate suite | 0 (136/136) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/planning-verbs.e2e.test.cjs` | 0 | PASS (9/9) |
| regression | `node --test lib/gh-store-e2e.test.cjs lib/planning-verbs.test.cjs lib/planning-entity-verbs.test.cjs` | 0 | PASS (47 e2e green in the task 3 run; planning-verbs + entity-verbs 33/33) |
| full suite | `npm test` | 1 | PASS except the known flake: 7467 tests, 7434 pass, 1 fail, 32 skipped |

**Full suite:** the single failure is **MA-7** in `handoff-e2e.test.cjs` (doctl auth init PTY race, TRD 19-05), the pre-existing flake named in the dispatch. It was noted and not fixed. roadmap-reconcile E2E1 passed in this run. Once this SUMMARY lands, it is expected to fail while ROADMAP still shows `[ ]`, until the orchestrator ticks it.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs` and `__fixtures__/planning-e2e-fixtures.cjs` (9/9 green above)
- FOUND: commits d9078853, d473aa0b, f42cda65, f3e43228 (`git log da772beb..HEAD`)
- STATE.md and ROADMAP.md were deliberately not edited. The orchestrator updates them after the merge.

## Deviations from Plan

1. **[Test bug, fixed in the test] Test 4's first cut deleted `.planning/wiki/**` with the cache.**
   - `planning-paths` classifies `wiki/**` as `cache`, but it is the local clone of the wiki repo that `gh pull` reads pages from.
   - With its working files deleted, the pull could not rebuild OBJECTIVE.md, CONTEXT or RESEARCH.
   - Test 4 now treats `wiki/**` like the runtime files and keeps it, the same exclusion `gh-cache.listOwnedLocal` makes. This is not a product defect. A user would never delete the clone's files while keeping its `.git`.
2. **[Addition] The edit gate is exercised end to end.**
   - The constraints name "the edit gate cache deny is inactive" as part of the parity invariant.
   - Test 9 therefore spawns the real `hooks/gate-edits.js` for a `devflow:executor` Edit of a TRD and asserts no deny. Test 6 asserts the store-mode counterpart: deny, naming `plan put-trd`.
3. **[Interpretation] The parity scenario uses `--raw` for every verb.**
   - Test 8 compares the delegated `objective set-status 7 complete` stdout with the twin's `objective complete 7 --raw`.
   - Prose-mode set-status adds a stderr headline, which is today's 48-15 behaviour.
4. **No gap in `gh-fake.cjs`**, so `gh-fake.cjs` was not modified. It is listed in files_modified only conditionally.

## Notes

- In store mode, `summary checkpoint` writes runtime state (`.trd-progress/`), not a cache file, so git stays clean through the checkpoint too.
- Hermetic setup:
  - The suite uses `hermeticEnv()`, `applyGitTestEnv()`, a `file://` wiki remote and the fake clock.
  - Spawned children get the offline gh shim, and the wiki remote is the loopback discard port with nothing listening.
  - Nothing touches the network, a fixed port or the real `~/.claude`.

## Post-TRD Verification

- Auto-fix cycles used: 0 (no product fixes)
- Must-haves verified: 5/5
  - SC3 git-clean scenario (test 2)
  - The fake holds everything, and the pull round trip is byte-identical (tests 3-4)
  - Store-off parity (tests 8-9)
  - W055 and offline negatives (tests 6-7)
  - The suite is hermetic
- Gate failures: none from this TRD
