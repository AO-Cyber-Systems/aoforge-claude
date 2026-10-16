---
objective: 56-objective-number-correctness
trd: "03"
type: standard
wave: 2
depends_on: ["56-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/requirement-ids.cjs
  - plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs
autonomous: true
requirements: [ONUM-04]
must_haves:
  truths:
    - "`verify trd-pre` reads requirement IDs only from ID-shaped list items: `**Requirements:** none (tech debt; see OBJECTIVE.md)` yields no IDs (requirement_coverage passed, note 'no requirements declared'), never a free-text 'requirement'"
    - "`verify trd-pre` reads `**Requirements**: ONUM-01, ONUM-02` (v1.5 colon placement) and reports a missing ONUM-02 when no TRD lists it"
    - "A range `GWP-01..GWP-05` expands to five IDs; a mixed line `SDR-08 (note), SDR-03 hardening (...); defects in ...` yields [SDR-08, SDR-03]"
    - "A block-form `**Requirements:**` followed by `- REQ-10-01: free text ...` bullets yields the bullets' leading IDs only"
    - "`objective complete` ticks the REQUIREMENTS.md entries named in a `**Requirements**:` line through the same extractor, and `objective remove` renumbers `**Depends on**: Objective N, ...`"
    - "`requirements mark-complete REQ.01` does not tick `REQ-01`, and `requirements mark-complete 'A(1'` does not crash"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/requirement-ids.cjs
      provides: "extractRequirementIds(value, {objective}) and roadmapRequirementIds(section, {objective}) -> {found, ids}"
    - path: plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
      provides: "extractRoadmapRequirements via roadmapRequirementIds"
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: "objective complete Requirements via roadmapRequirementIds; Depends-on renumber via boldLabelPattern"
  key_links:
    - "verify trd-pre -> checkRequirementCoverage -> extractRoadmapRequirements -> requirement-ids.roadmapRequirementIds -> text-escape.boldLabelPattern('Requirements')"
    - "objective complete -> requirement-ids.roadmapRequirementIds -> REQUIREMENTS.md checkbox/table updates (escapeRegExp(reqId))"
    - "requirements mark-complete -> escapeRegExp(reqId) in all three RegExp sources"
---

# TRD 56-03: Requirement IDs come only from ID-shaped tokens (ONUM-04)

<objective>
Make `verify trd-pre` (and `objective complete`) read requirement IDs from ID-shaped list items only.

Today trd-pre-check matches `/\*\*Requirements:\*\*\s*(\[?[^\]\n]+\]?)/`. It splits whatever follows on commas and treats
every piece as a requirement ID. That goes wrong in three ways:
- Free text becomes "requirements". `**Requirements:** none (tech debt; see ...)` (v1.4 objectives 52-54) yields one ID
  `none (tech debt; see ...)` that no TRD can cover.
- `\s*` crosses the newline. A block-form `**Requirements:**` followed by bullets (v1.2 objective 10) reads the first
  bullet's prose up to the first `]`.
- The v1.5 ROADMAP writes `**Requirements**:` (colon outside the bold). The line is never found, so `verify trd-pre 56`
  passes requirement coverage trivially today.

Extract one pure module, `lib/requirement-ids.cjs`, and use it from trd-pre-check and from `objective complete`. That command
parses the same line with the same flaws and ticks REQUIREMENTS.md from it. Also fix the two neighbouring sites that have the
same defects: the `**Depends on**` renumber in `objective remove` (colon placement), and `requirements mark-complete`, which
compiles CLI-supplied IDs unescaped.

Purpose: requirement coverage must be real for the rest of v1.5. Every objective there uses `**Requirements**:`.
Output: requirement-ids.cjs (new), trd-pre-check and objective complete switched, Depends-on renumber and mark-complete fixed.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(56-03): ...` commit (RED) before the `feat(56-03): ...` / `fix(56-03): ...` commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Use one plain command per Bash call.
- Fixtures are hand-built: literal ROADMAP section strings and literal REQUIREMENTS.md text. Do not use generated data or
  property-based tests. Use the real-world shapes quoted in the Test list.
- Requires 56-02: `boldLabelPattern` and the zero-tolerant `objectiveNumPattern` from text-escape.cjs. Do not edit text-escape.cjs.
- Do NOT touch roadmap.cjs, gh.cjs, project-bootstrap.cjs or roadmap-reconcile.cjs. TRD 56-04 owns them in this wave.
- Leave `parseTrdRequirements` (TRD frontmatter `requirements:`) as it is. ONUM-04 concerns the ROADMAP line only.

## ID shape (the contract this TRD implements)

A requirement ID is an uppercase token:
- **Hyphenated:** `[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+`. Examples: `ONUM-01`, `R-1`, `REQ-10-03`, `F1-CONFIG`, `PHASE-B1`, `PTY-BACKEND`,
  `GATE-PTY-MESSAGE`.
- **Letter-digit:** `[A-Z]{1,8}\d+`. Examples: `F1`, `C1`, `A1`.
- **Objective-scoped numeric:** `<this objective's number>-<n>`, matched with `objectiveNumPattern(objective) + '-\\d+'`.
  Example: `55-1` for objective 55. It is accepted only when an objective is given, so a date such as `2026-10` is never an ID.
- **Range:** `<ID>..<ID>` or `<ID>..<digits>` with the same prefix, for example `GWP-01..GWP-05` or `DOC-01..07`. It expands
  inclusive and keeps the start token's zero-pad width. A descending range, one with more than 50 items, or one whose
  prefixes differ yields just the two endpoints.

ID-shaped means the item starts with the ID. Inline form: strip one surrounding `[...]`, split on `,` and `;` outside
parentheses and backticks, and take each item's leading token after stripping leading `(`, `*` and backticks. Accept it only
when the whole token is ID-shaped: it must be followed by end, whitespace, `:`, `)`, `]`, `,`, `;` or a non-ASCII marker such
as ✅. Block form, when the label line's value is empty: read the immediately following `- ` / `* ` bullet lines and take
each bullet's leading token the same way. Stop at the first line that is not a bullet. Lowercase IDs (`req-01`) are not
accepted; document this in the module header. The result is de-duplicated, in first-seen order.

## Test list

Outermost first.

trd-pre-check (trd-pre-check.test.cjs, `runCheck`, ROADMAP overwritten with exact text):
1. `### Objective 99: T` + `**Requirements**: ONUM-01, ONUM-02`, with one TRD listing `[ONUM-01]`: `passed:false, missing:['ONUM-02']`.
   RED (the line is not found, so the check passes).
2. `**Requirements:** none (tech debt; see \`.planning/objectives/99-test/OBJECTIVE.md\`)` and a TRD with no requirements:
   `passed:true`, `note:'no requirements declared'`. RED (today `missing` holds the free text).
3. `**Requirements:** GWP-01..GWP-03`, with TRDs covering GWP-01 and GWP-02: `missing:['GWP-03']`. RED.
4. Every pre-existing requirement_coverage test passes unchanged, including `[F1, F2]`, `F1, F2`, the 14.1 decimal guard and
   56-02's single-digit tests.

objective complete / remove (objective.test.cjs, spawned CLI):
5. A section `**Requirements**: R-1, R-2` and REQUIREMENTS.md with `- [ ] **R-1**`, `- [ ] **R-2**`, `- [ ] **R-3**`:
   `objective complete` ticks R-1 and R-2 only. RED.
6. The existing 54-06 test 5 (free-text `none (tech debt; see OBJECTIVE.md)` changes nothing) passes unchanged.
7. Dirs `03-c`..`06-f` and objective 6's section has `**Depends on**: Objective 4, Objective 5`:
   `objective remove 3 --confirm` leaves `**Depends on**: Objective 3, Objective 4`. RED (`Objective 4,` survives today).

requirements mark-complete (misc-requirements.test.cjs, `storeCliProject({store:false})`, REQUIREMENTS.md overwritten):
8. `- [ ] **REQ-01**` present and `mark-complete REQ.01`: REQ-01 stays unticked and `not_found` is `['REQ.01']`. RED (`.` wildcard).
9. `mark-complete 'A(1'`: exits 0 with `not_found:['A(1']`. RED (SyntaxError today).
10. Existing 48-14 characterization tests pass byte for byte.

requirement-ids (requirement-ids.test.cjs, pure unit; all RED until the module exists):
11. `ONUM-01, ONUM-02, ONUM-03, ONUM-04` gives four IDs.
12. `[F1, F1-CONFIG, F2]` gives `[F1, F1-CONFIG, F2]`. `[C1, C2]` gives both.
13. `[PTY-BACKEND, TOKEN-PASSING, GATE-PTY-MESSAGE]` gives all three. `[DAEMON-NOTIFICATIONS ✅, DAEMON-AUTO-LAUNCH ✅]` gives both.
14. `none (tech debt; see \`.planning/objectives/53-worktree-and-health-hygiene/OBJECTIVE.md\`)` with objective `53` gives `[]`.
15. `TBD`, `N/A`, `-` and `` (empty) give `[]`. `req-01, onum-01` gives `[]`.
16. `SDR-08 (confirm each proposed command runs), SDR-03 hardening (\`stack verify --run\` side-effect safe); defects in \`.planning/x\``
    gives `[SDR-08, SDR-03]`.
17. Ranges: `GWP-01..GWP-05 (see \`x\`)` gives GWP-01..GWP-05. `DOC-01..07` gives seven. `F1..F3` gives three. `A-05..A-02`,
    `A-01..A-99` and `A-01..B-03` each give their two endpoints.
18. `55-1, 55-2` with objective `55` gives both. With objective `56`, or none, it gives `[]`. With objective `055` it gives both
    (zero-tolerant).
19. `F1, F1` gives `[F1]`.
20. `roadmapRequirementIds(section)`. `**Requirements**: ONUM-01, ONUM-02` gives `{found:true, ids:[ONUM-01, ONUM-02]}` and
    `**Requirements:** ONUM-01` gives `{found:true, ids:[ONUM-01]}`. A section without the label gives
    `{found:false, ids:[]}`. A label with only free text gives `{found:true, ids:[]}`.
21. Block form: `**Requirements:**\n- REQ-10-01: TRD frontmatter schema … \`platform: [mobile, web]\` …\n- REQ-10-04: RED-GREEN ordering enforced …\n\n**Plans:** 2`
    gives `[REQ-10-01, REQ-10-04]`. `RED-GREEN` in the prose is not taken.
22. The value never crosses a newline: `**Requirements:** none\n- X-01 something` gives `{found:true, ids:[]}`.

<embedded_context>

<codebase_examples>
Today's extractor (trd-pre-check.cjs:124-158). Replace its last 10 lines (from the `**Requirements:**` match on):

```js
  const reqLineMatch = section.match(/\*\*Requirements:\*\*\s*(\[?[^\]\n]+\]?)/i);
  if (!reqLineMatch) return { ids: [], found: false };
  const rawReqs = reqLineMatch[1].replace(/^\[|\]$/g, '').trim();
  if (!rawReqs) return { ids: [], found: true };
  const ids = rawReqs.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  return { ids, found: true };
```

with `return roadmapRequirementIds(section, { objective: objectiveNum });`. Keep the section-bounding code above it unchanged.

objective complete (objective.cjs:899-930). Same defect, plus `split(/[,\s]+/)` turns prose into "IDs":

```js
        reqMatch = section.match(/\*\*Requirements:\*\*\s*([^\n]+)/i);
      ...
      if (reqMatch) {
        const reqIds = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
```

becomes `const { found, ids: reqIds } = header ? roadmapRequirementIds(section, { objective: objectiveNum }) : { found: false, ids: [] };`.
Only rewrite REQUIREMENTS.md when `found && reqIds.length > 0`. Keep the existing `escapeRegExp(reqId)` checkbox and table
replacements.

Depends-on renumber (objective.cjs:795-799):

```js
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Depends on:\\*\\*\\s*Objective\\s+)${oldStr}\\b`, 'gi'),
        `$1${newStr}`
      );
```

becomes `new RegExp(\`(${boldLabelPattern('Depends on')}\\s*Objective\\s+)${oldStr}\\b\`, 'gi')`. `oldStr` is a loop
integer, digits only.

misc.cjs:951/958/962 interpolate `${reqId}` raw. Wrap each with `escapeRegExp(reqId)` and import it from `./text-escape.cjs`.

Module skeleton:

```js
'use strict';
// lib/requirement-ids.cjs: requirement IDs from a ROADMAP Requirements line (TRD 56-03, ONUM-04).
// An ID is taken only from an ID-shaped list item; free text yields none. IDs are uppercase (req-01 is not an ID).
const { objectiveNumPattern, boldLabelPattern } = require('./text-escape.cjs');

const ID_SRC = '[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z]{1,8}\\d+';
const LABEL_RE = new RegExp(boldLabelPattern('Requirements') + '[ \\t]*([^\\n]*)', 'i'); // never crosses a newline

function extractRequirementIds(value, { objective } = {}) { /* items -> leading token -> ID or range -> dedupe */ }
function roadmapRequirementIds(section, { objective } = {}) { /* LABEL_RE; inline value or following bullets -> {found, ids} */ }
module.exports = { extractRequirementIds, roadmapRequirementIds };
```

Test harnesses: trd-pre-check.test.cjs `setupObjectiveDir` + `runCheck` (overwrite ROADMAP.md as in 'decimal 14.1 ignores a
preceding 14.10 section'). objective.test.cjs `tmpProject()` + `run([...], project)` (the 54-06 describe near :907 has the
REQUIREMENTS.md fixture shape). misc-requirements.test.cjs `withProject({store:false}, (p) => p.run([...]))`, and writes
`fs.writeFileSync(path.join(p.root, '.planning', 'REQUIREMENTS.md'), text)` for a custom file.
</codebase_examples>

<anti_patterns>
- Do not scan the whole line for anything ID-shaped. Prose such as `RED-GREEN` or `TRD-level` would become requirements.
  Use only the leading token of each item.
- Do not accept bare `\d+-\d+`. Without the objective scope, dates and TRD ids (`2026-10`, `53-02`) become requirements.
- Do not drop the "no requirements declared" pass for a found-but-empty line. That is the documented free-text outcome.
- Do not use property-based or generated inputs. The real ROADMAP shapes above are the corpus.
</anti_patterns>

<error_recovery>
- If splitting on `,` / `;` outside parentheses gets complicated, write a small character loop that tracks `(` depth and
  backtick state. Do not use one large regex. Pin it with tests 14 and 16.
- If an existing objective.test.cjs test (54-06 describe) changes behaviour, check whether its fixture relied on
  whitespace-splitting prose. Report such a change in the SUMMARY rather than bending the extractor.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
@plugins/devflow/devflow/bin/lib/text-escape.cjs
@.planning/objectives/56-objective-number-correctness/56-02-SUMMARY.md
</context>

<gotchas>
- trd-pre-check's section ends at the next `#{2,4}` heading of any kind, while objective.cjs ends at the next
  `#{2,4} Objective N`. Both stay as they are. The extractor works on whatever section it is handed.
- `objectiveNum` in trd-pre-check is the directory's digits (`04`, `55`). The scoped-numeric rule goes through the
  zero-tolerant `objectiveNumPattern`, so `55-1` and `055-1` both work.
- The worktree-isolation harness guard refuses compound Bash commands. Use one plain command per call.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built ROADMAP-line fixtures + lib/requirement-ids.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/requirement-ids.cjs, plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs</files>
  <action>
Fixture builder first. In requirement-ids.test.cjs add a `section({ label = '**Requirements:**', value, bullets, after })`
helper. It joins `### Objective 99: T`, the label line, any bullet lines and trailing text into one literal string. Write
every value by hand from the Test list (the real v1.2/v1.4/v1.5 shapes).

RED: tests 11-22 (the module does not exist yet). Commit `test(56-03): requirement IDs only from ID-shaped list items`.

GREEN: implement requirement-ids.cjs to the "ID shape" contract above. Use a character loop for the item split. Build the
leading-token regex once from ID_SRC: `^(?:ID)(?:\.\.(?:ID|\d+))?`, then check the boundary. Use a separate scoped-numeric
alternative when `objective` is given. Implement range expansion as described. Commit
`feat(56-03): requirement-ids extracts IDs from ID-shaped tokens only`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs` passes (tests 11-22).</verify>
  <done>requirement-ids.cjs exports `extractRequirementIds` and `roadmapRequirementIds`. Free text yields `[]`, the v1.5 colon form is found, and the block form and ranges work.</done>
  <recovery>If a range or boundary case fights the regex, split it into a two-step tokenize-then-validate. The tests are the contract, not the regex shape.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: verify trd-pre reads requirements through requirement-ids</name>
  <files>plugins/devflow/devflow/bin/lib/trd-pre-check.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</files>
  <action>
RED: add tests 1-3 to trd-pre-check.test.cjs in a new `describe('56-03 requirement IDs are ID-shaped')`. Write each ROADMAP
literally. Commit `test(56-03): verify trd-pre ignores free-text Requirements lines and reads **Requirements**:`.

GREEN: in `extractRoadmapRequirements`, replace the line match and split with
`return roadmapRequirementIds(section, { objective: objectiveNum });` (import from `./requirement-ids.cjs`). Update the
function's doc comment to say what it does now. Update the file's Test-list header comment by adding a "56-03" entry.
Commit `fix(56-03): verify trd-pre takes requirement IDs only from ID-shaped tokens`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` passes, including every pre-existing requirement_coverage test and 56-02's tests.</verify>
  <done>Tests 1-3 went RED then GREEN. ONUM-04 holds at the CLI: a free-text Requirements line yields no IDs, and `**Requirements**:` is read.</done>
  <recovery>If the 48-03 characterization test (test 9, a deep-equal of the four original checks) moves, compare the old and new requirement_coverage objects. Only fields for inputs that changed may differ. Fix the extractor if an unchanged fixture moves.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: objective complete / remove and requirements mark-complete use the same rules</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs</files>
  <action>
RED: add tests 5 and 7 to objective.test.cjs (new `describe('56-03 ...')`) and tests 8-9 to misc-requirements.test.cjs.
Commit `test(56-03): objective complete reads **Requirements**:, remove renumbers **Depends on**:, mark-complete matches literally`.

GREEN:
- objective.cjs complete (:899-930): use `roadmapRequirementIds` as in codebase_examples.
- objective.cjs remove (:795-799): `boldLabelPattern('Depends on')` (import it beside `escapeRegExp, objectiveNumPattern`).
- misc.cjs `cmdRequirementsMarkComplete` (:951, :958, :962): `escapeRegExp(reqId)` in all three RegExp sources.
Commit `fix(56-03): one requirements rule for objective complete; escape mark-complete ids; renumber **Depends on**:`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` passes.</verify>
  <done>Tests 5, 7, 8 and 9 went RED then GREEN. Test 6 and the 48-14 characterization tests pass unchanged.</done>
  <recovery>If df-tools.test.cjs (around :2416, `**Requirements:** AUTH-01, AUTH-02`) changes, the extractor must still return both IDs. A mismatch there is a bug in requirement-ids, not in the fixture.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/requirement-ids.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 4: `verify trd-pre` takes requirement IDs only from ID-shaped tokens, and a free-text Requirements line yields none.
- Dogfood after merge (TRD 56-05 repeats this): `node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 56` reports
  `requirement_coverage.passed: true` against objective 56's real `**Requirements**: ONUM-01, ONUM-02, ONUM-03, ONUM-04` line.
</verification>

<success_criteria>
- ONUM-04 holds, with RED-then-GREEN tests at the module, CLI (trd-pre) and objective-complete levels.
- One extractor serves trd-pre-check and objective complete. mark-complete compiles IDs literally.
</success_criteria>

<output>
After completion, publish `56-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Quote the final ID-shape rules (they are the contract later objectives rely on).
</output>
