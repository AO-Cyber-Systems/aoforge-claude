---
objective: 47-github-authoritative-store
trd: "05"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-body.cjs
  - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
autonomous: true
requirements: [GST-02, GST-04, GST-01, GST-08]
must_haves:
  truths:
    - "The objective body supports two more managed sections, `wiki` and `meta`, merged with the same human-text-preserving rules; bodies built by 46 without them are unchanged until a caller provides them"
    - "The `wiki` section carries `<!-- devflow:dir=<objective dir> -->` and a link to the wiki page at a pinned revision; `parseDirMarker(body)` reads the dir back"
    - "The `meta` section (degraded mode) carries `type:`, `work:` and `kind:` lines; `parseMeta` reads them back"
    - "With `preserveTicks:true`, re-merging the `criteria` section keeps every `- [x]` the verifier ticked on GitHub, matched by criterion text (Pitfall 10)"
    - "`buildTrdsSection` renders a one-line count for native sub-issues or a `- [ ] #N` task list for hosts without the sub-issues API"
    - "Marker ids accept the Decision form `47-01-d1` in addition to `47`, `2.1` and `47-01`; all 46 marker cases still pass"
    - "`findCommentsByMarker(comments, id, kind)` returns every matching comment ordered by `devflow:part` (then by comment id)"
    - "The v3 mapping `trds` map has accessors `getTrd/setTrd` keyed by canonical TRD/Decision id with `{issue_number, rest_id, role, comment_ids}`; `rest_id` is the GitHub database id and is never confused with the number"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-body.cjs
      provides: "adds OPTIONAL_SECTIONS, extractSection, buildWikiSection, parseDirMarker, buildMetaSection, parseMeta, buildTrdsSection, findCommentsByMarker, mergeManaged(..., {preserveTicks})"
    - path: plugins/devflow/devflow/bin/lib/gh-mapping.cjs
      provides: "adds toTrdId, getTrd, setTrd, listTrds"
  key_links:
    - "47-09 builds wiki/meta/trds/criteria sections and stores TRD numbers+ids via setTrd; 47-07's handlers call getTrd/setTrd and mergeManaged; 47-08 and 47-10 use findCommentsByMarker; 47-10 uses parseDirMarker/parseMeta on pull"
---

# TRD 47-05: Objective body sections and TRD mapping accessors (GST-02, GST-04 primitives)

<objective>
Extend `gh-body.cjs` and `gh-mapping.cjs` — do not rewrite them — with the primitives the store needs: `wiki` and `meta`
managed sections, the dir marker that lets `pull --all` rebuild paths from an empty cache, tick-preserving criteria merge,
the TRD-list section in both native and task-list forms, Decision-form marker ids, a multi-part comment finder, and
accessors for the `trds` map that objective 46 reserved.

Purpose: GST-02 (objective body), GST-04 (comment lookup), GST-01/08 (ids, degraded meta). Output: two modules + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Both modules stay pure/dependency-free as today (gh-body: no fs/child_process; gh-mapping: its existing requires only).
- Every existing 46 test in `gh-body.test.cjs` and `gh-mapping.test.cjs` passes unchanged. Do NOT change `SECTION_ORDER`'s value
  (46 tests and `buildObjectiveSections` depend on it); add `OPTIONAL_SECTIONS = ['wiki', 'meta']` instead.
- Hand-written body strings only. No property-based tests. Never port 8080.
- Research reference: `47-RESEARCH.md` → Pattern 2 ("Objective body" bullet), Pitfall 10; 46-03 TRD for the section contract.

## Decisions taken in planning

- **D-12 Dir marker.** The `wiki` section's first line is `<!-- devflow:dir=<dir> -->` (e.g. `07-store-demo`). It is the only place
  the cache directory name is stored on GitHub; `pull --all` needs it to place OBJECTIVE.md and TRD files from an empty cache.
- **D-19 Decision ids** are `<trd id>-d<k>` (`47-01-d1`). The marker regex becomes
  `([0-9]+(?:\.[0-9]+)?(?:-[0-9]+(?:-d[0-9]+)?)?)`. Decisions share the mapping `trds` map with `role:'decision'` (no new top-level
  mapping key, so no mapping migration is needed).
- **D-20 Sub-issue fallback.** When the host lacks the sub-issues API, the objective's `trds` section is a task list
  `- [ ] #12 07-01 alpha` (ticked when the TRD issue is closed); otherwise one line: `3 TRDs, tracked as sub-issues.`
- **`preserveTicks` is opt-in** (default false) so 46's sync keeps its exact behaviour; 47 callers pass `true`.
- **Section placement.** A missing `wiki`/`meta` pair is appended at the end of the body (existing `appendBlock` behaviour); existing
  bodies are never re-ordered.

<embedded_context>

<codebase_examples>
Existing merge entry (`gh-body.cjs:325-381`): `mergeManaged(existingBody, sections, id)` filters `SECTION_ORDER` by provided
sections, rejects content containing a section marker, replaces the first well-formed pair per name via `findPair`, appends missing
pairs via `appendBlock`, preserves CRLF, and refuses bodies >= 60,000 chars. Extend `provided` to
`[...SECTION_ORDER, ...OPTIONAL_SECTIONS].filter(n => sections[n] !== undefined)`.

Marker source today (`gh-body.cjs:33-35`):
```js
const MARKER_SOURCE =
  '<!--\\s*devflow:id=([0-9]+(?:\\.[0-9]+)?(?:-[0-9]+)?)(?:\\s+kind=([a-z-]+))?\\s*-->';
const ID_RE = /^(\d+)((?:\.\d+)?)((?:-\d+)?)$/;
```
Mapping objective accessors to mirror (`gh-mapping.cjs:459-486`): `getEntry(mapping, arg)` / `setEntry(mapping, arg, patch)` merge
a patch onto the entry and always emit the canonical fields. `serializeMapping` already sorts `trds` with `naturalCompare`.

Target `wiki` section inner text:
```
<!-- devflow:dir=07-store-demo -->
Detail: [Objective-7-store-demo](https://github.com/o/r/wiki/Objective-7-store-demo/abc1234) (revision `abc1234`)
```
Target `meta` section inner text (degraded mode only):
```
type: Objective
work: feature
kind: plugin
```
</codebase_examples>

<anti_patterns>
- Changing `SECTION_ORDER` or the output of `buildObjectiveSections` (breaks 46 bodies already on GitHub).
- Matching ticked criteria by line position; match by criterion text after trimming and collapsing whitespace.
- Storing a TRD number in `rest_id` or vice versa. `setTrd` requires both to be positive integers but must NOT refuse
  `rest_id === issue_number` (they can coincide on GitHub); the protection is the unambiguous field names plus the fake's
  `id = 1_000_000 + number` rule (47-02).
</anti_patterns>

<error_recovery>
- `parseDirMarker` on a body without a `wiki` section → null; the caller (47-10) reports the objective as "no cache dir known".
- `setTrd` with an unparseable id → throws `TypeError` like `setEntry`.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/46-03-gh-body-markers-TRD.md
@.planning/objectives/46-github-sync-foundations/46-02-gh-mapping-v3-TRD.md
</context>

<gotchas>
- `<!-- devflow:dir=... -->` must not trip `SECTION_MARKER_RE` (that regex is for `devflow:begin|end`); add a test that a wiki section
  with the dir marker merges.
- `extractMarker` must not mistake `<!-- devflow:dir=... -->` or `<!-- devflow:file=... -->` for an id marker (they lack `id=`).
- `findCommentsByMarker` reads `<!-- devflow:part=i/n -->` on the line after the marker; comments without it sort as part 1.
</gotchas>

## Test list

gh-body
1. `OPTIONAL_SECTIONS` is `['wiki','meta']`; `SECTION_ORDER` unchanged (`['summary','criteria','trds','footer']`).
2. `mergeManaged(body46, {wiki: buildWikiSection({dir:'07-store-demo', page:'Objective-7-store-demo', url, sha:'abc1234'})}, '7')` appends a `wiki` pair at the end; human text and the four 46 sections byte-identical.
3. Second merge with a new sha → only the wiki inner text changes; `changed:true`; third identical merge `changed:false`.
4. `parseDirMarker(body)` → `'07-store-demo'`; body without wiki section → null.
5. `buildMetaSection({type:'Objective', work:'feature', kind:'plugin'})` / `parseMeta(extractSection(body,'meta'))` round-trip; missing keys omitted.
6. `extractSection(body, 'criteria')` returns the inner text; missing/malformed → null.
7. preserveTicks: existing criteria `- [x] a works` / `- [ ] b works`; new sections `- [ ] a works` / `- [ ] b works` / `- [ ] c new` with `{preserveTicks:true}` → a stays ticked, b unticked, c added; without the option → a unticked (46 behaviour).
8. preserveTicks matches by text with whitespace collapsed (`- [x]  a   works` matches `a works`).
9. `buildTrdsSection({mode:'native', trds:[3 items]})` → `3 TRDs, tracked as sub-issues.`; `mode:'tasklist'` → `- [ ] #12 07-01 alpha` lines, `[x]` for closed, sorted by TRD id.
10. `extractMarker('<!-- devflow:id=47-01-d1 -->')` → `{id:'47-01-d1', kind:null}`; `markerLine('47-01-d1')` valid; `047-01-d1` canonicalises to `47-01-d1`; `47-d1` invalid.
11. `extractMarker` ignores `<!-- devflow:dir=x -->` and `<!-- devflow:file=y -->`.
12. `findCommentsByMarker(comments, '07-01', 'summary')` returns the two part comments in part order even when given 2/2 before 1/2; ignores other ids and kinds.
13. Regression: every pre-existing gh-body test passes.

gh-mapping
14. `toTrdId('047-01')` → `'47-01'`; `toTrdId('07-01-d2')` → `'7-01-d2'`; `toTrdId('47')` → null; `toTrdId('x')` → null.
15. `setTrd(m, '07-01', {issue_number:12, rest_id:1000012, role:'trd'})` then `getTrd(m, '007-01')` returns it with `comment_ids:{}`; a patch merges (adds `comment_ids.summary:[55]`).
16. `setTrd` with missing/invalid `issue_number` or `rest_id` throws `TypeError`.
17. `serializeMapping` after `setTrd` round-trips through `readMappingV3`; `trds` keys are natural-sorted; objectives untouched.
18. `listTrds(m, '7')` returns the TRD ids for objective 7 (and its decisions when `{includeDecisions:true}`), sorted.
19. Regression: every pre-existing gh-mapping test passes.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: wiki/meta sections, dir marker, preserveTicks, trds section (tests 1-9, 13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs</files>
  <action>
RED: tests 1-9 appended to `gh-body.test.cjs` under `describe('47 store sections')`. Commit RED.
GREEN: add `OPTIONAL_SECTIONS`, `extractSection(body, name)` (reuse `findPair`), `buildWikiSection({dir, page, url, sha})`,
`parseDirMarker(body)`, `buildMetaSection`, `parseMeta`, `buildTrdsSection({mode, trds})`; extend `mergeManaged(existing, sections, id, opts = {})`:
`provided` covers optional sections; when `opts.preserveTicks` and the `criteria` pair exists, compute the ticked set from the existing inner
text and rewrite `- [ ] X` → `- [x] X` in the new content before splicing.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs</verify>
  <done>Tests 1-9 and every 46 gh-body test pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Decision ids and multi-part comment finder (tests 10-12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs</files>
  <action>
RED: tests 10-12. Commit RED.
GREEN: widen `MARKER_SOURCE` and `ID_RE` for the `-d<k>` suffix and update `canonicalId`; add
`findCommentsByMarker(comments, id, kind)` → array sorted by `(part, comment.id)`, each item `{comment, part, of}`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs</verify>
  <done>Tests 1-13 pass; gh-issue and gh-sync suites still green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Mapping `trds` accessors (tests 14-19)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-mapping.cjs, plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</files>
  <action>
RED: tests 14-19. Commit RED.
GREEN: `toTrdId(arg)` (objective part normalised like `toObjectiveId`, `-NN` kept as written, optional `-d<k>`), `getTrd(mapping, id)`,
`setTrd(mapping, id, patch)` → canonical entry `{issue_number, rest_id, role:'trd'|'decision', comment_ids:{}}` (merge semantics as
`setEntry`; `comment_ids` merged shallowly), `listTrds(mapping, objectiveArg, {includeDecisions=false})`. Update the header comment that
says `trds` is reserved for objective 47.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</verify>
  <done>Tests 14-19 and all 46 mapping tests pass.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs</regression>
</validation_gates>

<verification>
- All new and existing gh-body / gh-mapping tests pass; the 46 regression set is green.
- `SECTION_ORDER` value unchanged (`rg -n "SECTION_ORDER = " plugins/devflow/devflow/bin/lib/gh-body.cjs`).
</verification>

<success_criteria>
The objective body can carry a pinned wiki link, the cache dir, degraded metadata and tick-preserving criteria; TRD and
Decision issues have mapping entries that never confuse numbers with ids.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-05-body-mapping-extensions-SUMMARY.md`
</output>
