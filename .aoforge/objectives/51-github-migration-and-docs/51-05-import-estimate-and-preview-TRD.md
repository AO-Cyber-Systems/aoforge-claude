---
objective: 51-github-migration-and-docs
trd: "05"
type: standard
wave: 2
depends_on: ["51-02", "51-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-import.cjs
  - plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
autonomous: true
requirements: [GMD-01, GMD-02]
must_haves:
  truths:
    - "`planning import --dry-run` reports an `estimate` block (counts, history_closes, ops, writes_max, minutes_min, hours_min, by_kind) plus `history` counts, `refused` and `kept_local`, with zero gh calls and an unchanged tree"
    - "`planning import --dry-run` also works with store OFF when `github.enabled` is true (labelled a preview of what the backfill would queue); a real import with store off still refuses"
    - "`planImport(root, {noFlush:true})` queues the hierarchy, decisions, entities, wiki and milestone ops and then the history close ops (after every create), without flushing and without settling the ledger"
    - "A default real `planImport` (no `noFlush`) queues history closes before its single flush, so `planning import` alone also closes shipped work"
    - "Calibration: on the 20-objective fixture, a real import drained against the fake GitHub makes `fake.writes().length <= estimate.writes_max` and `>= 0.6 * estimate.writes_max`"
    - "The prose of `planning import --dry-run` prints the per-kind counts, the one-line estimate, the history closes and the will-stay-local table; every existing planning-import test still passes"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-import.cjs
      provides: "report.estimate, report.history, opts.noFlush, store-off preview, history ops queued after creates"
  key_links:
    - "Uses 51-03 historyOps/estimate/renderEstimate and 51-02 makeBackfillProject; 51-06 calls planImport({dryRun}) from 0011 detect and planImport({noFlush}) from the queue phase"
---

# TRD 51-05: `planning import` prices and previews the backfill (GMD-02)

<objective>
Make the existing importer the single source of the backfill plan: an upper-bound request estimate and history closes in the dry run,
a preview that works before the store switch, a `noFlush` mode for the migration, and a calibration test that keeps the estimate honest.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(51-05): ...` first, then `feat(51-05): ...`. Additive changes only: existing report keys keep their meaning.
- New tests go in a new file `planning-import-backfill.test.cjs` (keeps `planning-import.test.cjs` untouched); CLI prose tests in
  `planning-verbs-cli.test.cjs`. Use `useBackfillEnv` (51-02) and the fake clock; never the real GitHub or `~/.claude`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Preview with store off**: the mode check (L170) becomes: store → as today; local AND `dryRun` AND `github.enabled === true` →
  continue, `report.preview = true`; anything else → today's refusal. Read `github.enabled` via `planning-mode.cjs` (or the existing
  config reader it uses); never parse config ad hoc. In preview the cache index may be empty, so every cache file counts: correct.
- **Ops for the estimate**: in dry run, for each objective already passing through `planPush` (L189), fold `buildOps(plan)` (pure,
  L392) into an op list; unmapped objectives also add one live create (`gh.syncObjective` path, L209). Decisions → `upsert-issue` +
  `block` (+ `upsert-comment` when answered); entities → 1 `upsert-issue` (+1 `patch-issue` when closed); docs → 1 `wiki-push`;
  milestone sections → the milestone op kind the importer queues. Then `historyOps(main, importedIds)` (51-03). Pass to
  `estimate()`; set `report.estimate` and `report.history = {closed_completed, closed_not_planned}`.
- **Queue order**: history ops are enqueued after step 6 and before step 7 (L318), so journal `seq` creates before it closes.
  Use `outbox.enqueue(main, ops)`. They carry no ledger bytes (state only).
- **noFlush**: skip step 7 entirely; `report.flush` absent; `exit` OK. The caller (0011) drains.
- **Milestones**: if the milestone op the importer queues for a `## vX.Y` MILESTONES.md section does not already set `state: closed`,
  add the close here (MILESTONES.md only records completed milestones). Check `gh-milestone-store.cjs` (`patchMilestone` ~L259).
- **Prose** (`importProse`, planning-verbs-cli.cjs L377): after the counts line add `estimate: <renderEstimate>`,
  `history: N closed (completed), M closed (not planned)`, and a `will stay local:` table of `kept_local` + `refused` rows
  (OQ5 default: print them; no extra flag). Preview runs open with `preview (store is off): this is what the GitHub backfill would queue.`

## Test list

1. Dry run on the fixture with store on (set `github.store: true` in the fixture config) → `estimate.objectives 20`, `trds 100`,
   `history.closed_completed` and `closed_not_planned` equal the fixture's intent (51-02 shape), `fake.calls().length === 0`,
   `snapshot()` unchanged.
2. Preview: store off + enabled → same estimate as test 1, `preview: true`, zero calls. Store off + enabled false → refusal unchanged.
   Store off, real import → refusal unchanged.
3. `noFlush`: journal holds the ops, history ops have the highest seqs, no write recorded by the fake except live creates of unmapped
   objectives, ledger unsettled.
4. Default real import on a 2-objective subset (`makeBackfillProject({objectives:2})`) → shipped TRD issues end closed in the fake.
5. Calibration (SC-backing): full fixture, store on, `planImport` real with `wait:true` flushes repeated (advance the fake clock past
   each hour window) until drained; `writes <= writes_max` and `>= 0.6 * writes_max`. Mark slow but keep it in the default run (fake
   time, no real sleep).
6. CLI: `df-tools --cwd <tmp> planning import --dry-run` prose contains `estimate:`, `history:` and `will stay local:` when the fixture
   has a decision without `trd:`; `--raw` JSON has `estimate`.
7. Existing `planning-import.test.cjs` and `planning-verbs-cli.test.cjs` pass unchanged.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: estimate, history and preview in the dry run (tests 1-2)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-import.cjs, plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs</files>
  <action>
RED: tests 1-2; commit `test(51-05): planning import prices the backfill`.
GREEN: preview mode check, op fold, `report.estimate`, `report.history`. Update the JSDoc report shape (L159). Commit
`feat(51-05): backfill estimate and preview in planning import --dry-run`.
# GOTCHA: `planPush` must stay offline here; if it reads capabilities through gh, pass the cached/offline option or compute
# ops without it, and assert zero calls (test 1 is the guard).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs</verify>
  <done>Tests 1-2 and 7 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: history queuing, noFlush, calibration (tests 3-5)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-import.cjs, plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs</files>
  <action>
RED: tests 3-5; commit `test(51-05): history closes queued after creates; calibration`.
GREEN: enqueue history ops before the flush; `noFlush`; milestone close if missing. If calibration fails, fix the COST table in
gh-backfill.cjs only if 51-03 is merged (it is: this TRD depends on it) and record the change in the SUMMARY. Commit
`feat(51-05): planning import closes finished work; noFlush for the migration`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs</verify>
  <done>Tests 3-5 pass; calibration bounds hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CLI prose (test 6)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
RED: test 6; commit `test(51-05): planning import --dry-run prints the plan`.
GREEN: extend `importProse`. Commit `feat(51-05): print the backfill plan and estimate`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Test 6 passes; CLI suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `planning-import.cjs`: report shape L159-166, mode refusal L170, objective loop L180-221 (planPush L189, live create L209),
  decisions L224, entities L262, docs L282, milestones ~L297, legacy names L311, flush L318-326, exports L335.
- `planning-verbs-cli.cjs` `importProse` L377-, `import` subcommand L409.
- `gh-hierarchy.cjs` `buildOps` L392 (pure).
- 51-03: `gh-backfill.estimate`, `historyOps`, `renderEstimate`.
</codebase_examples>
<anti_patterns>
- A second importer; flushing in `noFlush` mode; changing the meaning of existing `queued` counts.
</anti_patterns>
<error_recovery>
- If the calibration lower bound fails because the cost table is too pessimistic for one kind, lower that kind's cost only as far as
  the upper bound still holds on test 5; never drop below the measured value.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/planning-import.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- GMD-02: tests 1, 2, 6 (plan + request count before any write, zero calls). G1 through the importer: test 4. Estimate honesty: test 5.
</verification>

<success_criteria>
A user can see the full backfill plan and its request cost before anything is written, and the number is pinned to reality.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-05-SUMMARY.md` (via `summary post 51-05 --from <file>`)
</output>
