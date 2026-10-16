---
objective: 47-github-authoritative-store
trd: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-trd.cjs
  - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
autonomous: true
requirements: [GST-03]
must_haves:
  truths:
    - "A TRD issue body is `<!-- devflow:id=<id> -->\\n<!-- devflow:file=<name> -->\\n` + the verbatim TRD file; `decodeTrdBody(encodeTrdBody(x))` returns `x` byte-for-byte (after CRLF normalisation)"
    - "`budget(body)` reports `ok` below 40,000 chars, `warn` at 40,000-60,000, `over` above 60,000, measured on the FINAL encoded body"
    - "`checkObjectiveBudgets(trds)` refuses the whole objective if any TRD is over 60,000 chars or there are more than 100 TRDs, and names every offender (SC2 unit level)"
    - "Scope comments are ordered strictly by `n`; gaps and duplicates are reported; the effective spec is body + scope comments in `n` order, ignoring `n <= folded_through` (SC3 unit level)"
    - "`planFold` produces a folded body only when the effective spec fits in 60,000 chars and returns a `fold` spec-rev entry carrying the before and after hashes and `folded_through`"
    - "spec-rev is an append-only log; appending an entry whose event and hash already appear is a no-op; `isFrozen` is true once a `freeze` entry exists; `detectDrift` compares the current body hash with the last logged hash"
    - "`splitParts(text, max)` splits on blank-line boundaries into parts that each fit `max`, never trimming text; `joinParts` reverses it exactly"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-trd.cjs
      provides: "TRD_TARGET_CHARS, TRD_MAX_CHARS, COMMENT_MAX_CHARS, MAX_TRDS_PER_OBJECTIVE, normalise, contentHash, fileLine, parseFileLine, encodeTrdBody, decodeTrdBody, budget, checkObjectiveBudgets, scopeMarker, buildScopeComment, parseScopeComments, effectiveSpec, specRevLine, parseSpecRev, appendSpecRev, isFrozen, assertEditable, detectDrift, planFold, partLine, splitParts, joinParts"
  key_links:
    - "47-08 gh-comments builds scope/spec-rev/summary comments with these helpers; 47-09 gh-hierarchy calls checkObjectiveBudgets before any write and encodeTrdBody for TRD issue bodies; 47-10 gh-cache calls decodeTrdBody/joinParts on pull; 47-07 flush uses contentHash for remote-edit detection"
---

# TRD 47-01: TRD codec, scope budget, scope comments, fold, spec-rev (GST-03)

<objective>
Create `lib/gh-trd.cjs`: the ONE pure codec for TRD issue bodies and their comment protocol. It encodes a TRD
file into an issue body and back byte-exactly, measures the scope budget on the final posted string, orders
scope comments by `n`, computes the effective spec, decides a fold, and maintains the append-only `devflow:spec-rev`
log. It also owns the numbered-parts splitter used for oversized SUMMARY/VERIFICATION comments.

Purpose: GST-03 and the unit half of SC2/SC3. Every later TRD (hierarchy, comments, cache, flush) depends on these
functions; keeping one codec avoids the two-writer bugs objective 46 fixed.
Output: `gh-trd.cjs` + `gh-trd.test.cjs`. Pure: no fs, no child_process, no gh calls.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: commit the failing test (RED) before the implementation (GREEN). Commit via
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Pure module: only `require('crypto')` (and nothing from gh-client / fs). `rg -n "require\('(fs|child_process)'\)"` on it returns nothing.
- Hand-built test strings only (`'x'.repeat(n)` for size boundaries is fine). No property-based tests, no `.feature` files,
  no generated fixtures. Never port 8080.
- Research reference: `47-RESEARCH.md` → "Pattern 1: TRD codec", Pitfalls 4, 5, 11; Open Questions 3 and 4.

## Decisions taken in planning (recorded here; do not revisit)

- **D-01 Body header.** The TRD issue body is two header lines then the verbatim file:
  `<!-- devflow:id=47-01 -->` and `<!-- devflow:file=47-01-gh-trd-codec-TRD.md -->`. The `file` line lets `gh pull --all`
  rebuild the exact filename from an empty cache without trusting a human-editable title. The `id` line is the 46 marker
  (`gh-body.markerLine` format); this module builds the same string itself (dependency-free, like gh-body duplicates
  gh-mapping's normaliser) and a test asserts equality with `gh-body.markerLine`.
- **D-02 Effective spec** = decoded TRD text + for each applied scope comment in ascending `n`: `"\n\n" + <full comment body>`
  (marker line included, so readers see the boundary). Comments with `n <= folded_through` are skipped.
- **D-03 Fold (research Open Q4).** Fold REPLACES the body of the TRD with `encodeTrdBody(effective text)` when the encoded
  result is <= 60,000 chars; scope comments are never deleted; spec-rev records `fold folded_through=K from=<old hash>`.
  "Frozen" governs execution-time edits; fold is the one sanctioned post-close body edit.
- **D-04 Oversized comments (research Open Q3).** A SUMMARY or VERIFICATION over 60,000 chars is split into numbered parts
  with a third header line `<!-- devflow:part=i/n -->`, split at blank-line boundaries, never trimmed. A single paragraph longer
  than the limit is split at the last newline before the limit, and only if there is none, at the limit (still lossless).
  A scope comment over 60,000 chars is refused with `{ok:false, overflow:true}` — per the proposal, overflow becomes a new TRD
  (the TRD-creating verb is objective 48).
- **D-05 Length unit.** JS `.length` (UTF-16 units) is used; it over-counts astral characters relative to GitHub, so it is conservative.
- **D-06 Hash.** `contentHash(text)` = `'sha256:' + hex(sha256(normalise(text)))`, matching `sync-state.cjs`'s `sha256:<hex>` convention.
  `normalise` only converts `\r\n` → `\n`; it never trims or touches trailing newlines.

<embedded_context>

<codebase_examples>
Marker conventions this codec must match (`gh-body.cjs:33-34`, `:64-75`):
```js
const MARKER_SOURCE =
  '<!--\\s*devflow:id=([0-9]+(?:\\.[0-9]+)?(?:-[0-9]+)?)(?:\\s+kind=([a-z-]+))?\\s*-->';
function markerLine(id) { /* -> `<!-- devflow:id=${id} -->` */ }
function commentMarker(id, kind) { /* -> `<!-- devflow:id=${id} kind=${kind} -->` */ }
```
Hash convention (`sync-state.cjs` `hashFrontmatter`): values are `sha256:<64 hex>`.

Body cap already enforced for objective bodies: `gh-body.cjs:260 const MAX_BODY_CHARS = 60000;` — reuse the same number.

spec-rev comment layout (decided here; 47-08 posts it with `commentMarker(id,'spec-rev')` as line 1):
```
<!-- devflow:id=47-01 kind=spec-rev -->
| rev | at | event | hash | chars |
|---|---|---|---|---|
| 1 | 2026-10-01T10:00:00Z | freeze | sha256:ab.. | 18234 |
| 2 | 2026-10-02T09:00:00Z | scope n=1 | sha256:cd.. | 19004 |
| 3 | 2026-10-03T12:00:00Z | fold folded_through=1 from=sha256:ab.. | sha256:ef.. | 19004 |
```
`parseSpecRev` reads only rows matching `^\| \d+ \| ` so a human note below the table is ignored (and kept by append).
</codebase_examples>

<anti_patterns>
- Ordering scope comments by `created_at` or comment id (Pitfall 5). Order by `n` only.
- Measuring the budget on the TRD file instead of the encoded body (Pitfall 4).
- Trimming, wrapping or re-flowing any text to fit a limit. Splitting is lossless; refusal is explicit.
- Stripping "the first line" on decode without checking it is the expected marker: decode must verify both header lines and
  return `{ok:false}` for a body that lacks them (a human-created issue).
</anti_patterns>

<error_recovery>
- `decodeTrdBody` on a body without the header → `{ok:false, error:'not a devflow TRD body'}`; never throws.
- `parseScopeComments` with `n=1, n=3` → `scopes` holds both, `errors` contains `gap before n=3`; duplicates `n=2,n=2` →
  first by comment id kept, `errors` names the duplicate. Callers decide whether to proceed (47-08 refuses fold on errors).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/OBJECTIVE.md
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@docs/PROPOSAL-github-system-of-record.md
</context>

<gotchas>
- Decode strips exactly `header + '\n'` for each header line; the remainder is the file text verbatim, including its own
  trailing newline (or absence of one). Round-trip tests must include a file without a trailing newline.
- `scopeMarker(n)` is `<!-- devflow:scope n=K -->` (locked form). It does NOT match gh-body's `MARKER_SOURCE`; the scanner here is
  `/^\s*<!--\s*devflow:scope\s+n=(\d+)\s*-->/`, applied to the first line of a comment only.
- Boundary values matter: 39,999 → ok, 40,000 → warn, 60,000 → warn, 60,001 → over.
</gotchas>

## Test list

Encoding and hashing
1. `normalise('a\r\nb\r\n')` → `'a\nb\n'`; `contentHash` of LF and CRLF variants is equal and matches `/^sha256:[0-9a-f]{64}$/`.
2. `encodeTrdBody({id:'47-01', file:'47-01-x-TRD.md', text})` starts with the two header lines; line 1 equals `require('./gh-body.cjs').markerLine('47-01')`.
3. `decodeTrdBody(encodeTrdBody(x))` → `{ok:true, id:'47-01', file:'47-01-x-TRD.md', text:x.text}` for: text with trailing newline, without, with frontmatter, with CRLF input (returns LF).
4. `decodeTrdBody('hello')` → `{ok:false}`; a body with only the id line → `{ok:false}`.
5. `parseFileLine('<!-- devflow:file=47-01-x-TRD.md -->')` → `'47-01-x-TRD.md'`; rejects names containing `/` or `..`.

Budget (SC2 unit)
6. `budget` boundaries on the encoded body: 39,999 ok; 40,000 warn; 60,000 warn; 60,001 over.
7. `checkObjectiveBudgets([{id,file,text}×3])` with one encoded body of 60,001 → `{ok:false, over:[{id,chars}]}` and lists ALL over-budget TRDs, not the first only; warns collected separately.
8. 101 TRDs → `{ok:false, error:/100/}`.

Scope comments and effective spec (SC3 unit)
9. `buildScopeComment(2, 'why')` → `'<!-- devflow:scope n=2 -->\nwhy'`; text of 60,000+ chars → `{ok:false, overflow:true}`.
10. `parseScopeComments` given comments in order n=2, n=1, n=3 (ids 30, 10, 20) → scopes ordered 1,2,3; non-scope comments ignored.
11. Gap (1,3) and duplicate (2,2) are reported in `errors`.
12. `effectiveSpec(text, comments)` = text + `\n\n` + c1 + `\n\n` + c2 + `\n\n` + c3 in `n` order; `applied:[1,2,3]`.
13. `effectiveSpec(..., {foldedThrough:2})` applies only n=3.
14. Effective encoded length over 60,000 → `overflow:true` (spec still returned).

spec-rev and fold
15. `appendSpecRev('', {at, event:'freeze', hash, chars})` creates header + row rev 1; appending a second distinct entry gives rev 2.
16. Appending an entry whose `event`+`hash` already exists returns the input unchanged (idempotent re-run).
17. `parseSpecRev` returns entries, `frozen:true` after a freeze row, `folded_through:3` from a `fold folded_through=3` row; human text after the table survives append.
18. `assertEditable({specRev})` → `{ok:false, reason:'frozen'}` when frozen, `{ok:true}` otherwise.
19. `detectDrift(body, specRevText)`: last logged hash equals `contentHash(body)` → `{drift:false}`; different → `{drift:true, expected, actual}`; empty log → `{drift:false, unlogged:true}`.
20. `planFold(body, comments, specRevText, at)` with scopes 1..3 that fit → `{ok:true, fits:true, newBody, entry:{event:'fold folded_through=3 from=<old>', hash:contentHash(newBody)}}`; `decodeTrdBody(newBody).text` equals the effective text.
21. `planFold` when effective > 60,000 → `{ok:true, fits:false}` and no `newBody`; with scope errors → `{ok:false, error}`.

Parts
22. `splitParts(text, 100)` on paragraphs of 40 chars → parts each ≤ 100 (part header included in the measurement), joined exactly by `joinParts`; a text under the limit → one part, no part header.
23. A single 250-char paragraph with no newline → lossless hard split; `joinParts(splitParts(x)) === x`.
24. `partLine(2,3)` → `<!-- devflow:part=2/3 -->`; `joinParts` orders by part index even if given out of order, and reports a missing part.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Encoding, hashing, budget (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: write tests 1-8 with a hand-built factory `makeTrd({id='47-01', file='47-01-x-TRD.md', text})` and a helper
`textOfEncodedLength(n, id, file)` that pads the text so the ENCODED body is exactly `n` chars. Commit RED
(`test(47-01): failing tests for TRD codec encoding and budget`).

GREEN: implement constants `TRD_TARGET_CHARS = 40000`, `TRD_MAX_CHARS = 60000`, `COMMENT_MAX_CHARS = 60000`,
`MAX_TRDS_PER_OBJECTIVE = 100`; `normalise`, `contentHash`, `fileLine`, `parseFileLine`, `encodeTrdBody`, `decodeTrdBody`,
`budget`, `checkObjectiveBudgets(trds)` → `{ok, over:[{id,chars}], warn:[{id,chars}], error?}`.
# CRITICAL: budget runs on encodeTrdBody(...) output, never on the raw file.
# GOTCHA: the id marker string must equal gh-body.markerLine(id); test 2 pins it.
Commit GREEN (`feat(47-01): TRD body codec and scope budget`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</verify>
  <done>Tests 1-8 pass; module requires only `crypto`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scope comments, effective spec, spec-rev, fold (tests 9-21)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: tests 9-21 with hand-built comment objects `{id, body}` (GitHub REST comment shape subset). Commit RED.

GREEN: `scopeMarker`, `buildScopeComment`, `parseScopeComments(comments)` → `{scopes:[{n,text,body,comment_id}], errors:[]}`,
`effectiveSpec(text, comments, {foldedThrough=0}={})` → `{text, chars, applied, overflow}` (chars measured on
`encodeTrdBody` of the effective text with a placeholder id/file of the same length as the real one — simplest: accept
`{id,file}` in the options and measure the real encoded body), `specRevLine`, `parseSpecRev`, `appendSpecRev`,
`isFrozen`, `assertEditable`, `detectDrift`, `planFold(body, comments, specRevText, at)`.

Approach for planFold:
1. `dec = decodeTrdBody(body)`; not ok → error.
2. `rev = parseSpecRev(specRevText)`; `ps = parseScopeComments(comments)`; `ps.errors.length` → `{ok:false, error}`.
3. `eff = effectiveSpec(dec.text, comments, {foldedThrough: rev.folded_through, id: dec.id, file: dec.file})`.
4. `eff.applied.length === 0` → `{ok:true, fits:true, noop:true}`.
5. `newBody = encodeTrdBody({id, file, text: eff.text})`; `newBody.length > TRD_MAX_CHARS` → `{ok:true, fits:false}`.
6. Return `{ok:true, fits:true, newBody, entry:{at, event:\`fold folded_through=${max(applied)} from=${contentHash(body)}\`, hash: contentHash(newBody), chars:newBody.length}}`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</verify>
  <done>Tests 1-21 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Numbered-parts splitter (tests 22-24)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: tests 22-24. Commit RED.

GREEN: `partLine(i, n)`, `splitParts(text, max = COMMENT_MAX_CHARS, {reserve = 0} = {})` → array of strings, each
already prefixed with `partLine(i,n) + '\n'` when n > 1 (`reserve` lets the caller account for its own marker/file header
lines, so the FINAL comment fits). Greedy pack of `\n\n`-separated paragraphs keeping the separators inside the parts so
`joinParts` is plain concatenation after stripping the part line. `joinParts(parts)` → `{ok, text, missing:[]}`.
# CRITICAL: joinParts(splitParts(x)).text === x for every test input (lossless).
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs && ! rg -n "require\('(fs|child_process)'\)" plugins/devflow/devflow/bin/lib/gh-trd.cjs</verify>
  <done>Tests 1-24 pass; module is pure.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` passes (24 cases).
- `rg -n "require\('(fs|child_process)'\)" plugins/devflow/devflow/bin/lib/gh-trd.cjs` → no matches.
- Git log shows a `test(47-01)` RED commit before each `feat(47-01)` GREEN commit.
</verification>

<success_criteria>
One pure codec encodes/decodes TRD bodies byte-exactly, enforces the 40K/60K budget on the posted string, orders scope
comments by `n`, decides folds and keeps the spec-rev log append-only.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-01-gh-trd-codec-SUMMARY.md`
</output>
