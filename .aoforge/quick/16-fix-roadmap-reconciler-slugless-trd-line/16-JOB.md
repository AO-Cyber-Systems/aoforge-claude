---
objective: quick-16
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
  - .planning/ROADMAP.md
  - .planning/objectives/34-ui-oracle-loop-w1b-surface-spec-schema-validator-renderer-re/34-06-SUMMARY.md
  - .planning/STATE.md
autonomous: true
must_haves:
  truths:
    - "sync-roadmap recognises slugless TRD lines (`- [ ] 32-01-TRD.md — ...`) and flips them to [x] when a PASSED SUMMARY exists"
    - "Slugged TRD lines (`01-01-foo-TRD.md`) still parse exactly as before (existing tests green)"
    - "ROADMAP 32-0x and 33-0x lines are [x]; Objective 34 no longer says checkpoints are outstanding"
    - "34-06-SUMMARY.md records the human-verify approval (2026-09-26) with all three answers"
    - "STATE.md Current Position reflects v1.3 in flight, 27-34 complete, v2.9.0 last release"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
      provides: "TRD_LINE_RE and rollup regex with optional slug"
    - path: plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
      provides: "regression tests for slugless TRD lines"
  key_links:
    - from: "TRD_LINE_RE group 4 (trd_id)"
      to: "_summaryExists / findSummary (startsWith `${trdId}-` && endsWith '-SUMMARY.md')"
      via: "32-01-SUMMARY.md already matches that filter — no change needed there"
---

# Quick 16 — Reconciler accepts slugless TRD lines + close out obj 32/33/34 bookkeeping

<objective>
Fix `roadmap-reconcile.cjs` so ROADMAP lines of the form `- [ ] NN-MM-TRD.md — desc` (no slug)
are reconciled, run `sync-roadmap` so objectives 32/33 flip to [x], then record the 34-06
human-verify approval and bring ROADMAP.md / STATE.md current.

Project kind is `plugin` → strict TDD for the code fix: failing test committed first (`test:`),
then the fix (`fix:`). Documentation tasks are not testable (no `tdd` attribute).
</objective>

<embedded_context>
<codebase_examples>
Current regexes (plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs):

```js
// line 48 — groups: 1=indent, 2=x|' ', 3=filename, 4=NN-NN trd_id, 5=desc, 6=' (failed)'
const TRD_LINE_RE = /^(\s*)- \[([x ])\] ((\d+-\d+)-[^.\s]+-TRD\.md)\s+—\s+(.+?)(\s+\(failed\))?\s*$/;
// line ~284 — objective rollup
const trdMatch = line.match(/^\s*- \[([x ])\] (\d+-\d+)-[^.\s]+-TRD\.md/);
```

SUMMARY/TRD lookups (lines ~110, ~220, ~241) filter by
`e.startsWith(`${trdId}-`) && e.endsWith('-SUMMARY.md')` / `'-TRD.md'`. A slugless
`32-01-SUMMARY.md` satisfies both predicates, so those do NOT need changing — verify this
with the new test rather than assuming.

Test file style (roadmap-reconcile.test.cjs): flat `test('WTL1: ...', () => {...})` with
`node:test` + `node:assert`, fixtures from `./__fixtures__/awareness-fixtures.cjs`
(`buildReconcileFixtures`). See WTL1–WTL4 (~line 171) for `_walkTrdLines` parsing tests;
mirror them. Use hand-built fixture strings (no generated data).
</codebase_examples>
<anti_patterns>
- Do not make the slug group capturing — that shifts group numbers 4/5/6 used at line ~77. Use `(?:-[^.\s]+)?`.
- Beware: with an optional slug, `[^.\s]+` must not be able to swallow `-TRD`. `(\d+-\d+)(?:-[^.\s]+)?-TRD\.md` backtracks correctly, but add a test that `01-01-foo-TRD.md` still yields trd_id `01-01` and filename `01-01-foo-TRD.md`.
- Raw `git commit` is gated — use `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Do not rewrite STATE.md's historical decision log; only the Current Position header lines.
</anti_patterns>
<error_recovery>
- If `sync-roadmap` (write mode) touches lines outside objectives 32/33, inspect `git diff .planning/ROADMAP.md`; `git restore` and investigate before committing.
- If a 32/33 SUMMARY lacks a PASSED Self-Check verdict, the reconciler will (correctly) not flip it — report which one rather than hand-editing the checkbox.
</error_recovery>
</embedded_context>

## Test list (Task 1)
1. `_walkTrdLines` parses `- [ ] 32-01-TRD.md — Wave 1: foo` → trd_id `32-01`, filename `32-01-TRD.md`, description `Wave 1: foo`, unchecked.
2. Slugless checked line with ` (failed)` suffix parses failed flag.
3. Slugged line `- [x] 01-01-foo-TRD.md — bar` still yields trd_id `01-01`, filename `01-01-foo-TRD.md` (regression guard).
4. End-to-end reconcile on a fixture with slugless ROADMAP line + `NN-MM-SUMMARY.md` (PASSED Self-Check) proposes/applies the [ ] → [x] flip.
5. Objective rollup counts slugless TRD checkbox lines (objective with all slugless lines checked is treated as complete by the rollup path).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Make the TRD slug optional in the reconciler (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs, plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs</files>
  <action>
RED: add tests for Test list items 1-5 to roadmap-reconcile.test.cjs (prefix e.g. `SL1..SL5`),
following the WTL tests' style and `buildReconcileFixtures`. If the fixture builder can't emit a
slugless SUMMARY name, write the file directly into the tmp objective dir with fs.writeFileSync.
Run `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` — the new
slugless tests must FAIL, slugged regression test passes. Commit:
`node plugins/devflow/devflow/bin/df-tools.cjs commit "test(roadmap-reconcile): slugless TRD lines are reconciled" --files plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`

GREEN: in roadmap-reconcile.cjs change
- line 48: `((\d+-\d+)-[^.\s]+-TRD\.md)` → `((\d+-\d+)(?:-[^.\s]+)?-TRD\.md)`
- line ~284: `(\d+-\d+)-[^.\s]+-TRD\.md` → `(\d+-\d+)(?:-[^.\s]+)?-TRD\.md`
- update the two comments to say the slug is optional.
Grep the module (`rg -n "TRD\\.md|SUMMARY" roadmap-reconcile.cjs roadmap-reconcile-cli.cjs`) for
any other slug assumption; fix only if a test proves it wrong. Run the file's tests plus
`roadmap-reconcile-cli.test.cjs`. Commit:
`node plugins/devflow/devflow/bin/df-tools.cjs commit "fix(roadmap-reconcile): accept TRD lines without a slug" --files plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs`
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs` all pass;
`node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap --dry-run` now reports changes for 32-01..04 and 33-01..03.
  </verify>
  <done>Two commits (test: then fix:); dry-run shows 7 pending flips for objectives 32/33.</done>
  <recovery>If optional slug breaks a slugged test, revert the regex edit (`git restore` the .cjs) and inspect backtracking with a scratch node -e script.</recovery>
</task>

<task type="auto">
  <name>Task 2: Run sync-roadmap, then close out Objective 34 in ROADMAP + 34-06-SUMMARY</name>
  <files>.planning/ROADMAP.md, .planning/objectives/34-ui-oracle-loop-w1b-surface-spec-schema-validator-renderer-re/34-06-SUMMARY.md</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap` (write mode). Check
   `git diff .planning/ROADMAP.md` — only 32-0x/33-0x lines (and any status lines the reconciler owns for 32/33) should change.
2. ROADMAP.md Objective 34 section (~line 204-222), edit only inside that section:
   - line ~209: replace the sentence starting `**Two checkpoints outstanding**` through `(tag \`v2.9.0\` not created).` with
     `Both checkpoints closed — 34-06 human-verify approved 2026-09-26; tag v2.9.0 created 2026-09-23.`
   - line ~217 (34-06): drop ` — **human-verify checkpoint OUTSTANDING** (verifier: Q2 pass, Q1/Q3 \`gaps_found\`)`.
   - line ~222 (34-11): drop `; **tag \`v2.9.0\` NOT created** (human-action checkpoint)`.
3. Progress table (~line 85-87): insert before the 34 row, keeping numeric order:
   `| 32. Visual-eval default path tells the truth | v1.3 | 4/4 | Complete | <date> |`
   `| 33. The visual gate actually runs in CI | v1.3 | 3/3 | Complete | <date> |`
   Expected date is 2026-09-22 per the request, BUT `git log -1 --format=%ad --date=short` on the 32/33 dirs shows 2026-08-27 — confirm from the last SUMMARY's `completed:` frontmatter (`rg -n "^completed:" .planning/objectives/3[23]-*/*-SUMMARY.md`) and use that; note the discrepancy in the job summary if it differs from 2026-09-22.
   Set the 34 row Status `Executed (2 checkpoints outstanding)` → `Complete`.
4. 34-06-SUMMARY.md:
   - heading line ~492 `## The human-verify checkpoint (OUTSTANDING)` → `## The human-verify checkpoint (APPROVED 2026-09-26)`.
   - add one line under the heading: approved by Justin Donnaruma, 2026-09-26, after opening `projects-rail.sheet.html` (sheet_hash `8befadf8851847d34666b3ae0a8fa81cfd0923083cf617723790dc2848716d7f`).
   - lines ~520/526/532 `> **Answer:** _(awaiting the human)_` → Q1 `> **Answer:** Yes — reads as English`, Q2 `> **Answer:** Yes — MISSING cells are unmistakable`, Q3 `> **Answer:** Yes — legible` (confirm order by reading the Q text above each).
   - top callout (~line 12) `> ### ⚠ The \`checkpoint:human-verify\` in task 3 is OUTSTANDING` and its body → `> ### The \`checkpoint:human-verify\` in task 3 was APPROVED 2026-09-26` with a one-line body pointing to the section. Read ~lines 10-25 first to see how far the callout body extends. Leave the historical mention at ~line 636 alone.
5. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(roadmap): reconcile obj 32/33, close obj 34 checkpoints" --files .planning/ROADMAP.md .planning/objectives/34-ui-oracle-loop-w1b-surface-spec-schema-validator-renderer-re/34-06-SUMMARY.md`
  </action>
  <verify>
`rg -n "OUTSTANDING|NOT created|awaiting the human" .planning/ROADMAP.md .planning/objectives/34-*/34-06-SUMMARY.md` returns only the historical ~line-636 reference;
`rg -n "^- \[ \] 3[23]-" .planning/ROADMAP.md` returns nothing;
`node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap --dry-run` reports 0 changes.
  </verify>
  <done>32/33 checked, progress rows added, 34 marked Complete, 34-06 approval recorded; one docs commit.</done>
</task>

<task type="auto">
  <name>Task 3: Refresh STATE.md Current Position</name>
  <files>.planning/STATE.md</files>
  <action>
Edit only header lines; do not touch the decision log or the `**Objective complete:**` history lines.
- line ~9 `**Current focus:** ...` → `**Current focus:** v1.3 in flight (not formally opened via /devflow:milestone new) — objectives 27–34 complete (27-03 and 28-06 deferred by decision); 26 locked but unplanned; release 2.10.0 being prepared`
- line ~14 `**Milestone:** ...` → `**Milestone:** v1.3 — in flight (v1.2 shipped 2026-07-22; v1.1 shipped 2026-05-06; both archived to .planning/milestones/). Last release v2.9.0 (2026-09-23)`
- line ~30 `**Status:** ...` → `**Status:** v1.3 in flight — objectives 27–34 complete; last release v2.9.0 (2026-09-23); 2.10.0 being prepared`
Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(state): current position reflects v1.3 in flight" --files .planning/STATE.md`
  </action>
  <verify>`sed -n 5,32p .planning/STATE.md` shows v1.3/v2.9.0 lines; `git diff HEAD~1 -- .planning/STATE.md` touches exactly 3 lines.</verify>
  <done>STATE.md Current Position current; history untouched.</done>
</task>

</tasks>

<verification>
- `npm test` (or at minimum the two roadmap-reconcile test files) passes.
- `sync-roadmap --dry-run` reports 0 changes after Task 2.
- Four commits: test:, fix:, docs(roadmap), docs(state).
</verification>

<success_criteria>
- Slugless TRD lines reconcile; slugged lines unchanged.
- ROADMAP, 34-06-SUMMARY, STATE reflect reality as of 2026-09-26.
</success_criteria>

<output>Write `.planning/quick/16-fix-roadmap-reconciler-slugless-trd-line/16-SUMMARY.md` on completion.</output>
