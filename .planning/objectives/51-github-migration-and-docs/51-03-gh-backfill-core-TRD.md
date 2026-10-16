---
objective: 51-github-migration-and-docs
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-backfill.cjs
  - plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GMD-01, GMD-02]
must_haves:
  truths:
    - "`historyOf(root)` classifies every objective as shipped, cancelled or open, and every TRD as done (SUMMARY), deferred (no SUMMARY in a shipped objective) or open, from local files only"
    - "`historyOps(root, ids)` returns `patch-issue` ops: `state: closed, state_reason: completed` for done TRDs and shipped objectives, `not_planned` for cancelled objectives, their un-summarised TRDs and deferred TRDs; open work gets no op"
    - "`estimate(input)` is pure and total: it folds a list of planned ops plus live creates and wiki pushes into `{ops, writes_max, reads_approx, minutes_min, hour_windows, hours_min, by_kind, ...counts}` using an upper-bound cost table"
    - "`hasPendingOps(root)` reads the outbox journal and reports pending, blocked and halted counts without a gh call"
    - "`recordLiveWrites(root, n, now)` adds `n` writes to the journal's budget window (G5) through `outbox.recordWrite` + `outbox.writeJournal`"
    - "gh-backfill.cjs spawns neither gh nor git and never calls `ghWrite(` (seam guard)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-backfill.cjs
      provides: "historyOf, historyOps, COST, estimate, renderEstimate, hasPendingOps, recordLiveWrites"
  key_links:
    - "51-05 calls estimate/historyOps from planImport; 51-06/07 call hasPendingOps, recordLiveWrites and historyOps from migration 0011"
---

# TRD 51-03: `gh-backfill.cjs` core — history closes, estimate, journal helpers

<objective>
The genuinely new pieces of the backfill, as a pure, unit-testable module: close the issues of finished work instead of opening them
(gap G1), an honest upper-bound request estimate (G3), resume detection, and budget bookkeeping for live creates (G5).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(51-03): ...`) before each GREEN (`feat(51-03): ...`).
- Pure module: reads local files and the journal; returns ops; never enqueues, flushes or calls gh. Hand-built inline fixtures
  (write a few files into an `fs.mkdtempSync` dir; `makeStoreProject` for an objective with TRDs). This TRD runs in parallel with
  51-02, so do not depend on `makeBackfillProject`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **OQ1 (user decision):** shipped v1.1-v1.3 style history is backfilled as CLOSED issues. No wiki-only history option.
- **Shipped objective** iff any of: OBJECTIVE.md frontmatter `status: complete`; the ROADMAP `## Progress` row covering it has a
  status cell starting `Complete`; or it has >= 1 TRD and every TRD has a SUMMARY. Progress first cells take three shapes, all parsed:
  `42. Name`, `27–41 (15 objectives)` (en dash or hyphen) and `0–9, 6, 8, 24 (13 objectives)` (comma list of numbers and ranges).
  **Cancelled** iff `status: cancelled` or the Progress status starts `Cancelled`. Otherwise open.
- **TRD done** iff its SUMMARY exists (`<obj>-<NN>-SUMMARY.md`; reuse the TRD/summary pairing helper the hierarchy uses, grep
  `SUMMARY` in gh-hierarchy.cjs). **Deferred** = no SUMMARY in a shipped objective → `not_planned`.
- **Op shape**: `{kind:'patch-issue', target:{role:'trd'|'objective', id}, payload:{state:'closed', state_reason}}` exactly as
  `outbox.validateOp` accepts (gh-outbox.cjs L224-246); validate every returned op in the tests. Objective ops come after its TRD ops.
- **Milestones**: no op here; planImport already queues `## vX.Y` MILESTONES.md sections. 51-05 checks whether those ops close the
  native milestone and adds a close only if not.
- **COST table (upper bounds, writes per op)**: `upsert-issue` 2 (create + one label/milestone ensure amortised), `link-sub-issue` 1,
  `block` 1, `upsert-comment` 1, `patch-issue` 1, `patch-body` 1, `set-fields` = payload field count (default 4), `wiki-push` 0,
  milestone ops 2, unknown kinds 2 (never under-estimate; list unknown kinds in `estimate.unknown_kinds`). A live objective create
  (`gh.syncObjective` for an unmapped objective) costs 3. Reads: 2 per op (informational). 51-05's calibration test pins the table.
- **Time**: `minutes_min = ceil(writes_max / 80)`, `hour_windows = ceil(writes_max / 450)` (`outbox.BUDGET`, never hard-coded),
  `hours_min = hour_windows - 1` (full hourly waits). `renderEstimate(e)` → one line, e.g.
  `~540 writes (upper bound) in 612 ops; at 80/min and 450/h at least 1 h of hourly-budget waits`.
- **hasPendingOps(root)** → `{pending, blocked, halted, any}` via `outbox.readJournal(main)`; a missing journal is all zeros.
- **recordLiveWrites(root, n, now)**: read journal, `recordWrite(journal, now)` x n, `writeJournal`; n <= 0 is a no-op (no write).

## Test list

1. Progress-row parser: the three first-cell shapes yield the right objective sets; a `Cancelled ...` status yields cancelled.
2. `historyOf`: status complete → shipped; all TRDs summarised and no status → shipped; progress `Complete` covering a range → shipped;
   `status: cancelled` → cancelled; partial SUMMARYs and no status → open; deferred TRD in a shipped objective → deferred.
3. `historyOps`: shipped objective with 3 TRDs (one deferred) → 2 `completed` + 1 `not_planned` TRD ops then 1 `completed` objective op;
   cancelled → all `not_planned`; open objective → TRD ops only for summarised TRDs, no objective op. Every op passes `validateOp`.
4. `estimate`: hand-built op list `{upsert-issue:3, link-sub-issue:2, block:1, patch-issue:2, wiki-push:1}` plus 1 live create →
   exact `writes_max` from COST; `by_kind` counts; unknown kind is counted at 2 and listed.
5. `estimate` time fields: 900 writes → `minutes_min 12`, `hour_windows 2`, `hours_min 1`; 0 writes → all zeros.
6. `hasPendingOps` on no journal → zeros; on a journal with pending/blocked/halted ops (write one with `outbox.enqueue`) → counts.
7. `recordLiveWrites(root, 3, t)` → `budgetCheck` sees 3 more writes in the window at `t`; n=0 leaves the journal file untouched.
8. Seam guard: gh-backfill.cjs is in `PLANNING_MODULES`-style guarded list (no `ghWrite(`, no `spawn`/`execFile`).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: history classification and close ops (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-backfill.cjs, plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs</files>
  <action>
RED: tests 1-3; commit `test(51-03): history classification and close ops`.
GREEN: `parseProgress(roadmapText)`, `historyOf(root)`, `historyOps(root, ids)`. Resolve objectives with `ghMapping.resolveObjective`
and list TRDs the way `gh-hierarchy.planPush` does (L305) so ids match what the hierarchy creates. Commit
`feat(51-03): close finished work in the backfill (G1)`.
# CRITICAL: no gh calls; ids must equal the ones buildOps targets, or the flusher patches the wrong issue.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs</verify>
  <done>Tests 1-3 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: estimate, journal helpers, seam guard (tests 4-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-backfill.cjs, plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</files>
  <action>
RED: tests 4-8 (add `gh-backfill.cjs` to the guarded list in gh-seam.repo.test.cjs with a `// objective 51 (TRD 51-03)` comment);
commit `test(51-03): backfill estimate and journal helpers`.
GREEN: `COST`, `estimate`, `renderEstimate`, `hasPendingOps`, `recordLiveWrites`. Commit
`feat(51-03): backfill request estimate and budget bookkeeping (G3, G5)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 4-8 pass; seam and outbox suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox.cjs`: `BUDGET` L47, `patch-issue` op schema L224-246, `readJournal` L591, `writeJournal` L617, `enqueue` L667,
  `budgetCheck` L1047, `recordWrite` L1064, exports L1161.
- `gh-hierarchy.cjs`: `planPush` L305, `buildOps` L392 (op kinds and targets to cost).
- `gh-mapping.cjs` `resolveObjective` L108-124.
- `planning-verbs.cjs` `STATUS_PATCH` ~L419 (cancelled → not_planned).
- `gh-seam.repo.test.cjs` `PLANNING_MODULES` / `GUARDED` lists (header L1-40).
</codebase_examples>
<anti_patterns>
- Enqueuing from this module (51-05/06 own queuing); hard-coding 80/450 instead of `outbox.BUDGET`.
- Under-estimating: any doubt uses the higher cost.
</anti_patterns>
<error_recovery>
- If the hierarchy's TRD-id derivation differs from file names (legacy names), skip those TRDs here; planImport already reports them
  in `kept_local`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</regression>
</validation_gates>

<verification>
- G1: shipped work yields close ops; G3: estimate is pure and upper-bound; G5 helper exists.
</verification>

<success_criteria>
The backfill can close finished work and price itself before any write.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-03-SUMMARY.md` (via `summary post 51-03 --from <file>`)
</output>
