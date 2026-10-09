---
objective: 46-github-sync-foundations
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-body.cjs
  - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
autonomous: true
requirements: [GSF-02, GSF-06]
must_haves:
  truths:
    - "Every DevFlow-built issue body starts with `<!-- devflow:id=<id> -->`; every DevFlow comment starts with `<!-- devflow:id=<id> kind=<kind> -->`"
    - "`mergeManaged(existing, sections, id)` replaces only the inner text of `<!-- devflow:begin NAME -->…<!-- devflow:end NAME -->` pairs; human text above, below and between sections is byte-identical after two consecutive merges (success criterion 3)"
    - "Merging identical content twice returns `changed:false`, so callers skip the `issue edit`"
    - "A body whose marker names a different id is refused with an error, never overwritten"
    - "A legacy body with no markers is preserved whole; managed sections are appended below it"
    - "The sticky-comment finder recognises both `<!-- devflow:id=N kind=state -->` and the legacy `<!-- df:state -->`"
    - "`indexByMarker(issues)` maps id → issue and reports duplicates instead of choosing one"
    - "Bodies at or above 60,000 characters are refused (GitHub caps at 65,536)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-body.cjs
      provides: "SECTION_ORDER, MAX_BODY_CHARS, markerLine, commentMarker, extractMarker, buildObjectiveSections, mergeManaged, buildStateComment, isStateComment, withCommentMarker, indexByMarker, parseTitleNumber"
  key_links:
    - "46-05 uses extractMarker/indexByMarker/parseTitleNumber for find-or-create; 46-07 uses buildObjectiveSections/mergeManaged/buildStateComment/isStateComment; 46-08 uses withCommentMarker for comment/close-issue"
---

# TRD 46-03: Markers and managed body sections (GSF-02, GSF-06)

<objective>
Create `lib/gh-body.cjs`: the single body builder for objective issues and DevFlow comments.
It stamps a stable `devflow:id` marker, writes only inside DevFlow-managed sections, and leaves
every other byte of an issue body alone. Pure functions only (no gh calls, no fs).

Purpose: defect 6 (`formatIssueBody` and `buildIssueBody` overwrite each other and human edits) and
the marker half of GSF-02 (lookup by marker is 46-05).
Output: `gh-body.cjs` + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Pure module: no `require('fs')`, no `child_process`. Tests use hand-written body strings.
- No property-based tests, no `.feature` files, no generated fixtures. Never port 8080.
- Research reference: `46-RESEARCH.md` → "Pattern 3: Marker and managed sections", "Pattern 4", "Code Examples: Marker scan", Pitfalls 7-8.

<embedded_context>

<codebase_examples>
Current gen-2 body content to carry into sections (gh.cjs:1053-1089 `buildIssueBody(state)`):
title line `**Objective ${state.number}: ${state.name}**`, `**Goal:** ...`,
`**Status:** ${trd_done}/${trd_total} TRDs done, current wave ${current_wave||1}, last commit ${sha|'none'}`,
success criteria `- [x] ${sc.id}: ${sc.text}`, TRDs `- [ ] ${t.name} — ${t.brief}`, footer
`_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/<dir>/\` in this repo._`
`state` comes from gh.cjs `readObjectiveState` (fields: number, name, goal, trd_done, trd_total,
current_wave, last_commit{sha,subject}, success_criteria[{id,text,done}], trds[{name,brief,done}], summary_count, branch, objectiveId).

Current sticky comment (gh.cjs:1092-1110 `buildStickyComment(state, iso)`): first line `<!-- df:state -->`, then
`**DevFlow state — last synced ${iso}**`, blank, `- Wave:`, `- TRDs:`, `- SUMMARY count:`, optional `- Last commit:`, `- Branch:`.

Target layout:
```
<!-- devflow:id=46 -->
<!-- devflow:begin summary -->
**Objective 46: GitHub sync foundations**

**Goal:** ...

**Status:** 2/5 TRDs done, current wave 1, last commit abc1234
<!-- devflow:end summary -->

<!-- devflow:begin criteria -->
- [x] SC-1: ...
<!-- devflow:end criteria -->

<!-- devflow:begin trds -->
- [ ] 46-01-gh-client — brief
<!-- devflow:end trds -->

<!-- devflow:begin footer -->
_Tracked by DevFlow. ..._
<!-- devflow:end footer -->
```
</codebase_examples>

<anti_patterns>
- Parsing and stripping old generated text from legacy bodies (it may contain human edits). Append below it.
- Reordering sections or human paragraphs. Only inner text of existing pairs changes; missing sections append at the end.
- Global regex replacement across the body (a human might paste a second copy of a marker). Replace the FIRST well-formed pair per name only.
- Normalising whitespace in human text. Only `\r\n` → `\n` for the equality comparison.
</anti_patterns>

<error_recovery>
- Malformed pair (begin without end, or end before begin): treat the section as absent, append a fresh pair, push a warning `malformed section <name>`; never delete text.
- Marker id mismatch: return `{ok:false, error:'body marker devflow:id=<x> does not match <id>'}`.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/OBJECTIVE.md
</context>

<gotchas>
- Marker regex must accept `devflow:id=2.1`, `devflow:id=0`, and (for objective 47) `devflow:id=46-02`:
  `/<!--\s*devflow:id=([0-9]+(?:\.[0-9]+)?(?:-[0-9]+)?)(?:\s+kind=([a-z-]+))?\s*-->/`.
- Section inner text is written with a newline after the begin line and before the end line, so a
  round trip is byte-stable.
- The whole-body size guard counts characters of the MERGED body (human text included).
</gotchas>

## Test list

Markers
1. `markerLine('46')` = `<!-- devflow:id=46 -->`; `commentMarker('46','state')` = `<!-- devflow:id=46 kind=state -->`.
2. `extractMarker` returns `{id:'2.1', kind:null}`, `{id:'46', kind:'verification'}`, `{id:'46-02', kind:null}`; null on none.
3. `withCommentMarker('46','comment','hello')` prefixes the marker line; a body already starting with a devflow marker for the same id is unchanged.

Sections
4. `buildObjectiveSections(state)` returns `{summary, criteria, trds, footer}` in `SECTION_ORDER`; empty criteria/trds produce `_None yet._`.

mergeManaged
5. Empty/null existing → marker + four sections in order, `changed:true`.
6. Existing managed body, new status text → only the summary inner text changes; everything else identical.
7. Human paragraph above the first section, between `criteria` and `trds`, and below `footer`: after merge #1 (new status) and merge #2 (another new status), the three human paragraphs are byte-identical to the originals.
8. Merging the same sections twice → second result `changed:false` and body identical to the first.
9. Missing `trds` section in an otherwise managed body → appended at the end, earlier content untouched.
10. Malformed `criteria` (begin without end) → fresh pair appended, warning reported, original text retained.
11. Existing body with marker `devflow:id=45` merged as `46` → `ok:false` with mismatch error.
12. Legacy gen-1/gen-2 body (no markers, contains `**Objective 46: ...**`) → marker becomes line 1, legacy text kept verbatim, sections appended below.
13. CRLF existing body equal to LF merge output → `changed:false`.
14. Merged body of 60,000+ characters → `ok:false, error:/60000/`.

Comments and lookup
15. `buildStateComment('46', state, iso)` first line `<!-- devflow:id=46 kind=state -->`; remaining lines match today's sticky content.
16. `isStateComment(body, '46')` true for the new marker, true for a body starting `<!-- df:state -->`, false for `kind=verification` and for another id's state marker.
17. `indexByMarker([{number:3, body:'<!-- devflow:id=2 -->…'}, {number:4, body:'<!-- devflow:id=2.1 -->'}, {number:5, body:'none'}])`
    → `{byId:{'2':3,'2.1':4}, duplicates:{}, unmarked:[5]}`; two issues with id 2 → `duplicates:{'2':[3,9]}` and `byId` lacks `2`.
18. `parseTitleNumber('[Objective 2.1] foo')` → `'2.1'`; `'[Objective 046] x'` → `'46'`; `'random'` → null.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Markers, section builder and comment helpers (tests 1-4, 15-18)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs</files>
  <action>
RED: tests 1-4 and 15-18 with a hand-built `state` object factory `makeState(overrides)` inside the test file. Commit RED.

GREEN: implement `markerLine`, `commentMarker`, `extractMarker`, `withCommentMarker`, `SECTION_ORDER = ['summary','criteria','trds','footer']`,
`buildObjectiveSections(state)` (content per the codebase example; footer names `.planning/objectives/${state.dir || state.objectiveId}/`),
`buildStateComment(id, state, iso)`, `isStateComment(body, id)`, `indexByMarker(issues)` (uses `extractMarker`, ignores comment kinds — only
`kind === null` counts as an issue-body marker), `parseTitleNumber(title)` (`/^\[Objective\s+([\d.]+)\]/`, normalise leading zeros like `toObjectiveId`;
do NOT import gh-mapping — keep this module dependency-free, duplicate the 3-line normaliser with a comment).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs</verify>
  <done>Tests 1-4, 15-18 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: mergeManaged (tests 5-14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs</files>
  <action>
RED: tests 5-14. Test 7 is success criterion 3 at unit level: build the human paragraphs as constants and assert with `includes` + index ordering, and that `result.body.split(HUMAN_MID)` yields exactly 2 parts. Commit RED.

GREEN: `mergeManaged(existingBody, sections, id)` → `{ok, body, changed, warnings}`.
Approach:
1. `norm = (existingBody || '').replace(/\r\n/g, '\n')`.
2. Empty → `[markerLine(id), ...SECTION_ORDER.map(n => block(n, sections[n]))].join('\n\n') + '\n'`.
3. Marker: `m = extractMarker(norm)` (issue-body kind only). m && m.id !== id → error. !m → `norm = markerLine(id) + '\n' + norm`.
4. For each name in order: find first `<!-- devflow:begin NAME -->` index; find the first `<!-- devflow:end NAME -->` AFTER it.
   Both present → splice inner text to `\n${content}\n`. Otherwise (absent or malformed) → append `\n\n` + block; warn if malformed.
5. `body.length >= MAX_BODY_CHARS (60000)` → `{ok:false, error}`.
6. `changed = body !== norm_original` (compare against the CRLF-normalised input, not the raw input).
# CRITICAL: use indexOf-based splicing, not a global regex, so only the first pair per name changes.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs</verify>
  <done>Tests 1-18 pass; module has no fs/child_process import.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "require\('(fs|child_process)'\)" plugins/devflow/devflow/bin/lib/gh-body.cjs` → no matches.
- Test 7 demonstrates human text surviving two consecutive merges.
</verification>

<success_criteria>
One body builder exists; managed-section merging is idempotent and never loses human text; marker helpers are ready for lookup.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-03-SUMMARY.md`
</output>
