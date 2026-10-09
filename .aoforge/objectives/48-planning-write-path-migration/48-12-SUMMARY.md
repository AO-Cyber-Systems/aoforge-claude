---
objective: 48-planning-write-path-migration
trd: "12"
subsystem: planning-verbs
tags: [gwp-01, gwp-04, entity-verbs, todo, debug, quick, decision, milestone, planning-import, store-mode, local-invariant, tdd]

requires:
  - objective: 48-02
    provides: "encodeEntityBody, ENTITY_ROLES (label/type per role), entity ids"
  - objective: 48-05
    provides: "gh-milestone-store milestoneDescription/milestonePageUrl/upsertMilestone/closeMilestone; milestone wiki pages"
  - objective: 48-06
    provides: "flusher entity upserts, Debug/Quick native-or-label types, entity comments and patch-issue"
  - objective: 48-07
    provides: "gh-cache.materialize for entities, quick summary, decisions (## Answer); round-tripped here"
  - objective: 48-11
    provides: "writeThrough, docPut, flushResult/settleLedger"
provides:
  - "lib/planning-entity-verbs.cjs: todoAdd, todoComplete, debugPut, debugResolve, quickPut, quickSummary, decisionOpen, decisionAnswer, milestonePut, milestoneComplete, entityIdFor, docsPut, importEntity, removeThrough, spliceMilestoneEntry"
  - "lib/planning-import.cjs: planImport(root, {dryRun}) -> {queued, skipped, kept_local, refused, ...}, milestoneSections, BUDGET_HINT"
affects: [48-15, 48-19, 48-20, 48-22]

tech-stack:
  added: []
  patterns:
    - "Moves in store mode: writeThrough(new rel, noFlush) -> removeThrough(old rel: file, ledger entry, cache baseline) -> one flush whose settle baselines the new rel"
    - "Batch import: every queued file is ledgered (writeThrough or ledger.record after the enqueue), then ONE flush; gh-store-cli settleLedger baselines them all"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-import.cjs
    - plugins/devflow/devflow/bin/lib/planning-import.test.cjs
  modified: []

key-decisions:
  - "Local decision open delegates to decision-queue addDecision (sync until its fire-and-forget notify), keeping today's notification; the id is nextDecisionId read just before the call"
  - "Store decision cache text is exactly what gh-cache.materialize rebuilds: question (leading blank lines dropped, trimEnd) + '\\n'; after an answer, + '\\n\\n## Answer\\n\\n' + answer.trimEnd() + '\\n'. The answer comment carries the plain answer (no file line), as the 48-06 D-09 pin does"
  - "milestone put in local mode guarantees a `## <version>` heading on the entry so the section can be replaced later; store mode does not write MILESTONES.md (a generated view)"
  - "milestone complete in local mode returns {delegate:'milestone complete'} (48-11 objective-complete precedent)"
  - "removeThrough drops the old rel's cache-index baseline as well as its ledger entry: the file no longer exists in the cache"
  - "planning import: an objective is triggered only by non-doc objective files; docs not covered by a hierarchy push go in one wiki-push; a MILESTONES.md section is skipped once milestones/<v>.md is baselined with the same hash (idempotency); legacy decision files with trd: are replaced in the cache by decisions/<trd>-d<k>.md"

requirements-completed: [GWP-01, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 35min
completed: 2026-10-01
tokens_input: 7183612
tokens_output: 89255
tokens_cache_read: 6967663
tokens_cache_write: 215849
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 12: Entity verbs and planning import Summary

**Todos, debug sessions, quick tasks, decisions and milestones each have one verb. In local mode it writes today's file byte for byte with zero gh calls. In store mode it writes the U-1 GitHub home through writeThrough, and `gh pull --all` rebuilds the cache file byte-identically. `planning import [--dry-run]` moves existing local work into the store with one flush. It reports budget-refused TRDs, decisions with no TRD and legacy-named TRDs instead of skipping them, and it is idempotent.**

## Accomplishments

- **Todos.** Local `todoAdd` writes `todos/pending/<YYYY-MM-DD>-<slug(title)>.md` (the add-todo naming). Local `todoComplete` matches `df-tools todo complete` byte for byte; the test runs both in two temp projects. In store mode a `devflow:todo` issue is created (label only, no type). Completion moves the cache file, re-upserts the body with the new header path and closes the issue as completed.
- **Debug and quick.** Local mode uses the debugger and quick layouts. In store mode, debug and quick issues get the native Debug/Quick type, falling back to `devflow:type/<name>` labels when the org lacks it (tested both ways). `debugResolve` closes the issue. `quickSummary` posts a `summary` file comment and then closes.
- **Decisions.** Local mode delegates to decision-queue `addDecision`/`resolveDecision`, and parity is tested with a mocked Date. In store mode, `openDecision` (47) opens a Decision issue that blocks the TRD and writes the cache file `decisions/<trd>-d<k>.md`. The answer is posted as an `answer` comment and the issue is closed as completed (D-09). The store-mode verb refuses when no TRD id is given.
- **Milestones.** Local mode replaces the `## vX.Y` section of MILESTONES.md, or inserts it after `# Milestones`. Store mode upserts the native milestone first; its description is at most 1,000 chars and ends in `Full notes: https://github.com/o/r/wiki/Milestone-v1_4`. It then doc-puts `milestones/v1.4.md`. Offline, it exits 1 with zero gh writes, no cache file and no wiki commit. `milestoneComplete` closes the milestone and doc-puts the `milestones/<v>-*.md` archives as one wiki-push.
- **planning import.** Covered by tests 11, 11b and 11c.
  - Per-kind `queued` counts.
  - `refused` names the 61,000-char TRD with the hint "split it or move bulk to a linked file".
  - `kept_local` names the decision without `trd:` and the legacy TRD (`07-09-TRD-legacy.md`, with a suggested rename).
  - `--dry-run` makes zero writes and returns the same counts as the real run.
  - A second run queues nothing and makes no gh writes.
  - An importable objective is queued as one hierarchy push (syncObjective find-or-create when it has no issue). A decision with `trd:` and `resolution:` becomes an answered, closed Decision issue.
  - Local mode refuses.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1+2: todo, debug, quick, decision, milestone verbs | 9a69aee test(48-12): todo, debug, quick, decision and milestone verbs | 4196512 feat(48-12): todo, debug, quick, decision and milestone verbs |
| 3: planning import | 8f7cd6c test(48-12): planning import | fc42664 feat(48-12): planning import moves local work into the store |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1+2 | `node --test planning-entity-verbs.test.cjs` | 0 | PASS (12/12) |
| 2 | `node --test ... decision-queue.test.cjs` | 0 | PASS (suite unchanged) |
| 3 | `node --test planning-import.test.cjs planning-entity-verbs.test.cjs decision-queue.test.cjs check-todos.test.cjs` | 0 | PASS (153 pass, 1 skipped GH-live) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1+2 | `node --test planning-entity-verbs.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 1+2 | same | 0 (12/12) | PASS (correct) |
| RED 3 | `planning-import.test.cjs` requires `./planning-import.cjs`, which did not exist at 8f7cd6c | not run separately (turn budget) | FAIL by construction |
| GREEN 3 | `node --test planning-import.test.cjs ...` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-entity-verbs.test.cjs planning-import.test.cjs` | 0 | PASS |
| regression | decision-queue + check-todos directly; `gh-*` through the full suite | 0 | PASS |
| full suite | `npm test` | 1 | 7421 tests, 7388 pass, 1 fail, 32 skipped |

**Full suite:** the one failure is **MA-7** in `handoff-e2e.test.cjs` (doctl auth init PTY race, TRD 19-05), the known pre-existing flake. It was noted and not fixed. roadmap-reconcile E2E1 passed in this run because the SUMMARY did not exist yet. It is expected to fail until the orchestrator ticks ROADMAP.

## Deviations from Plan

1. **[Process] Tasks 1 and 2 share one RED and one GREEN commit.** The 50-turn session cap did not leave room for four separate commits. All tests for both tasks (1-10) were committed failing first, then the implementation. The RED run for Task 3 was by construction (missing module) and was not executed separately.
2. **[Rule 3 - Blocking] `gh-comments.enqueueFileComment` and planning-verbs' `wikiPushOp`/`patchIssueOp` are not exported.** The quick-summary op is built directly as `upsert-comment {id, kind:'summary'}` with `fileCommentText(name, text)`, which is the same payload. Close ops are merged over a pending `patch-issue` locally, and docs go through the exported `docPut`, which already unions wiki-push pages. No edits were made to files outside this TRD.
3. **[Rule 2] Legacy TRD names (`NN-MM-TRD-<slug>.md`) are reported in `kept_local` with a rename suggestion.** This is the known issue from 48-01/48-10. Test 11 covers it.
4. **[Rule 2] `planning import` also imports decision files that carry `trd:`.** It opens a Decision issue, answers and closes it when the file has `resolution:`, and replaces the legacy DECISION file in the cache. Without this, a second run would open a duplicate `d2` (idempotency). Test 11b covers it.
5. **[Addition] Extra exports for 48-15/48-22:** `importEntity`, `docsPut`, `removeThrough`, `spliceMilestoneEntry`, `milestoneSections`, `BUDGET_HINT`.
6. **Test 9's "blocks its TRD"** is asserted through the Decision issue and its type. The `block` edge itself is 47's openDecision behaviour, which gh-hierarchy's own tests pin.

## Invariant check (github.store off)

Tests 1-4 run with `github.enabled: true, store: false` and the fake installed. Every verb writes today's file: `todos/pending|completed`, `decisions/pending|resolved/DECISION-NNN.md`, `debug/` and `debug/resolved/`, `quick/<N>-<slug>/`, and MILESTONES.md. The tests assert zero gh calls, no outbox journal and no ledger. `planImport` refuses in local mode with nothing written. Neither module has a caller yet (48-15 wires the CLI), so `.planning/` tracking and the edit gate are unchanged.

## Notes for later TRDs

- **48-15 (CLI):** local `milestoneComplete` returns `{delegate:'milestone complete'}`. Local `decisionOpen` accepts the decision-queue options (title, context, options, recommendation, objective, wave, blocks). Store mode needs `trd` + `question`.
- **48-22:** `milestonePut` in store mode makes a DIRECT milestone write before the doc put (D-05). `planImport` objective pushes use syncObjective's direct find-or-create for objectives that have no issue yet (D-16).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (local invariant per verb; store todo/debug/quick upsert + close + quick summary; decision open/answer; milestone put/complete with offline exit 1 before any write; planning import counts/refused/kept_local/dry-run/idempotent)
- Gate failures: none from this TRD (MA-7 known flake)

## Self-Check: PASSED

- FOUND: planning-entity-verbs.cjs, planning-entity-verbs.test.cjs, planning-import.cjs, planning-import.test.cjs (all run green above)
- FOUND: commits 9a69aee, 4196512, 8f7cd6c, fc42664 (returned by df-tools commit)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after the merge
