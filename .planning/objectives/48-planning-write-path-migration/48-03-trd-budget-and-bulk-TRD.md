---
objective: 48-planning-write-path-migration
trd: "03"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/trd-bulk.cjs
  - plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
  - plugins/devflow/agents/job-checker.md
autonomous: true
requirements: [GWP-05]
must_haves:
  truths:
    - "`checkTrd({id, file, text})` measures the ENCODED body via `gh-trd.encodeTrdBody` + `budget` and returns `status ok|warn|over` at 40,000 / 60,000 characters (D-06)"
    - "Linked-bulk (U-2): any fenced block whose content exceeds 8,000 characters is a warning naming its start line and length; a TRD of 40,000+ characters whose fenced content exceeds 40% of it is a warning naming the share; neither ever sets `passed:false`"
    - "Prose that merely says 'inline fixtures' produces no finding; only fenced blocks (``` or ~~~, any info string) are measured"
    - "`df-tools verify trd-pre <objective>` gains a `trd_budget` check reporting per-TRD chars/status/bulk findings, with `severity: {store:'blocker', local:'warning'}` for over-budget TRDs; existing four checks and their JSON are unchanged"
    - "job-checker.md has a Dimension 8 'TRD Size and Linked Bulk' that reads `checks.trd_budget`, picks store vs local severity from `.planning/config.json`, and tells the planner to split rather than trim"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/trd-bulk.cjs
      provides: "BULK_BLOCK_MAX, BULK_SHARE_MAX, BULK_SHARE_MIN_CHARS, fencedBlocks, bulkFindings, checkTrd"
    - path: plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
      provides: "adds checkTrdBudget and checks.trd_budget"
    - path: plugins/devflow/agents/job-checker.md
      provides: "Dimension 8: TRD Size and Linked Bulk"
  key_links:
    - "`plan put-trd` (48-11) calls `trd-bulk.checkTrd` so the verb, the preflight and the job-checker share one measurement"
---

# TRD 48-03: TRD scope budget and linked-bulk checker (GWP-05)

<objective>
Give the job-checker a deterministic size check: one pure module measures a TRD's encoded size against the 40K target / 60K ceiling and
finds inline bulk (U-2), `verify trd-pre` reports it, and the job-checker prompt turns it into a dimension.

Purpose: GWP-05. Output: `trd-bulk.cjs`, a `trd_budget` check in `trd-pre-check.cjs`, Dimension 8 in `agents/job-checker.md`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED before GREEN. Characterization first: pin today's `verify trd-pre` JSON keys (`requirement_coverage`,
  `task_completeness`, `dependency_correctness`, `scope_sanity`, `passed`, `needs_agent`) for an existing fixture so the addition is provably additive.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `trd-bulk.cjs` is pure (requires only `gh-trd.cjs`); no fs. `trd-pre-check` stays under 2 s on this repo's objectives.
- Fixtures are hand-built strings (use `'x'.repeat(n)` padding inside a fenced block, like 47's `oversizedTrdText`); no generated data,
  no property-based tests, never port 8080.
- Do NOT read `github.store` here (D-01: only planning-mode does). Report both severities; the consumer picks.

## Decisions

U-2 (thresholds, warning only), D-06 (budget severity). Settled here:

- **Measurement**: `text.length` of `encodeTrdBody({id, file, text})` (JS `.length`, D-05 of 47). `id`/`file` derive from the filename the same
  way `gh-hierarchy.parseTrdFile` does; for a filename that does not parse, fall back to raw `text.length` and add a note.
- **Fenced blocks**: a line matching `/^ {0,3}(`{3,}|~{3,})/` opens; the closing fence is the same char, length >= opener, alone on its line.
  An unclosed fence runs to end of text. Content length excludes the fence lines. Nested different-char fences are content.
- **Thresholds** (exported constants): `BULK_BLOCK_MAX = 8000` (finding when `> 8000`), `BULK_SHARE_MIN_CHARS = 40000` (encoded length `>=`),
  `BULK_SHARE_MAX = 0.40` (finding when fenced total / encoded length `> 0.40`).
- **Severity**: bulk findings are always `warning`. Budget `over` → `{store:'blocker', local:'warning'}`; `warn` → warning in both.
- **Message text** names the fix: "move the listing to the repo or wiki and link it; never trim prose to fit".

## Test list

trd-bulk
1. Encoded length: a 100-char TRD named `07-01-a-TRD.md` → `chars === encodeTrdBody({id:'7-01', file:'07-01-a-TRD.md', text}).length`, status ok.
2. Boundaries via hand-built padding: encoded 39,999 → ok; 40,000 → warn; 60,000 → warn; 60,001 → over.
3. One fenced block of exactly 8,000 content chars → no finding; 8,001 → one finding `{kind:'block', line:<opening line 1-based>, chars:8001}`.
4. `~~~` fence and a ```` ```js ```` info string are measured; an unclosed fence runs to EOF.
5. TRD of 45,000 encoded chars with 18,000 fenced (40.0%) → no share finding; 18,100 fenced → share finding `{kind:'share', share:0.402...}`.
6. TRD of 30,000 chars with 80% fenced → no share finding (below 40K).
7. Prose `use inline fixtures` with no fence → zero findings.
8. `checkTrd` never returns `passed:false` for bulk alone; `passed:false` only when status is over.

trd-pre-check
9. Characterization: existing fixture objective → the four existing checks' JSON unchanged (deep-equal against a captured literal).
10. `checks.trd_budget` present: `{passed, trds:[{trd, chars, status, bulk:[...]}], over:[...], warn:[...], severity:{store:'blocker', local:'warning'}}`.
11. An objective dir with a 60,001-char TRD (fixture written to a temp dir) → `trd_budget.passed === false`, `over` names the TRD; top-level counts include the new dimension.
12. A TRD with a 9,000-char fenced block → `passed:true`, `bulk` lists the block.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: trd-bulk.cjs — budget and linked-bulk measurement (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/trd-bulk.cjs, plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs</files>
  <action>
RED: tests 1-8 with hand-built texts. Commit `test(48-03): trd budget and linked-bulk measurement`.
GREEN: implement `fencedBlocks(text)` → `[{line, chars, fence}]`, `bulkFindings(text, encodedChars)`, `checkTrd({file, text})` →
`{trd, chars, status, bulk, passed, messages}`. Use `ghTrd.encodeTrdBody` and `ghTrd.budget`. Commit `feat(48-03): trd-bulk checker`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs</verify>
  <done>Tests 1-8 pass; module has no fs import.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `trd_budget` check in verify trd-pre (tests 9-12)</name>
  <files>plugins/devflow/devflow/bin/lib/trd-pre-check.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</files>
  <action>
Commit test 9 alone first (characterization, green on today's code). RED: tests 10-12 using temp objective dirs and the existing
`__fixtures__/trd-pre-fixtures.cjs` helpers. Commit `test(48-03): trd_budget check`.
GREEN: add `checkTrdBudget(trds)` (uses `trd.content` + filename already loaded by `loadTrds`) and add `trd_budget` to `checks` in
`cmdVerifyTrdPre`, including the early-return branch at L411 (empty objective → `{passed:true, trds:[], over:[], warn:[]}`). Update the module
header comment listing the checks. Do not change `scope_sanity`. Commit `feat(48-03): verify trd-pre reports trd_budget`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs && node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 47 --raw</verify>
  <done>Tests 9-12 pass; the live command on objective 47 shows `trd_budget` with all 14 TRDs `ok`.</done>
</task>

<task type="auto">
  <name>Task 3: job-checker Dimension 8 — TRD Size and Linked Bulk</name>
  <files>plugins/devflow/agents/job-checker.md</files>
  <action>
After Dimension 7, add `## Dimension 8: TRD Size and Linked Bulk` in the existing dimension format (Question / Process / Thresholds table /
Red flags / Example issue YAML). Process: run `node ~/.claude/devflow/bin/df-tools.cjs verify trd-pre <objective> --raw` (already the
preflight) and read `checks.trd_budget`; choose `severity.store` when `.planning/config.json` has `github.enabled: true` and
`github.store: true`, else `severity.local`. Thresholds table: target 40,000 / ceiling 60,000 encoded chars; fenced block > 8,000; fenced share
> 40% at >= 40,000. Fix hints: "split the TRD or move work to a follow-up TRD; move fixtures/sample data/long listings to the repo or wiki and
link them; never trim prose to fit." Bulk findings are always `warning`. Mention U-2/D-06 by name in one line. Add `trd_budget` to any list of
dimensions near the top of the file. This TRD adds no write directive to the file (keep the 48-04 audit count for job-checker.md unchanged or lower).
Commit `docs(48-03): job-checker dimension 8`.
  </action>
  <verify>rg -n "Dimension 8: TRD Size and Linked Bulk|trd_budget|8,000|40%" plugins/devflow/agents/job-checker.md</verify>
  <done>Dimension 8 present with thresholds, severity choice and split-not-trim hint.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-trd.cjs` L156 `budget(body)` → `{chars, status}` with `TRD_TARGET_CHARS`/`TRD_MAX_CHARS`; L111 `encodeTrdBody`.
- `trd-pre-check.cjs` L351 `checkScopeSanity` result shape; L379 `cmdVerifyTrdPre` assembling `checks`.
- Calibration (48-RESEARCH section 5): median fenced block 790 chars, p90 5,355, p99 12,315; 8 TRDs in this repo have a block over 8,000.
</codebase_examples>
<anti_patterns>
- Measuring `file.length` instead of the encoded body (the 65,536 cap applies to the body with its two header lines).
- Matching the words "fixture" or "sample data" in prose (40-02 and 40-04 mention them on purpose).
</anti_patterns>
<error_recovery>
- If the characterization literal for test 9 is unstable (timestamps), compare only `checks` minus `trd_budget` and the counts.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</regression>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 4 --raw` lists `04-01` (69K) as `over` with `severity.local: warning`.
</verification>

<success_criteria>
One measurement of TRD size and inline bulk is shared by the preflight, the job-checker and (later) `plan put-trd`; bulk only ever warns.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-03-SUMMARY.md`
</output>
