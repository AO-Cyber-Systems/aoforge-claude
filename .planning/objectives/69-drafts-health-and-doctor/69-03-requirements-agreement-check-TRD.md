---
objective: 69-drafts-health-and-doctor
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/requirements-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/requirements-agreement.cjs
  - plugins/devflow/devflow/bin/lib/requirements-agreement.test.cjs
  - plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs
  - .planning/objectives/58-estimation-engine-and-surfacing/58-02-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-03-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-05-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-06-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-07-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-08-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-09-SUMMARY.md
  - .planning/objectives/58-estimation-engine-and-surfacing/58-10-SUMMARY.md
autonomous: true
requirements: [TOOL-10]
must_haves:
  truths:
    - "`scan(planningDir)` reports a finding for each requirement that an objective's VERIFICATION (Requirements Coverage table) marks SATISFIED and that no SUMMARY in that objective lists in `requirements-completed`, naming the objective, the requirement, the VERIFICATION file and the TRDs whose `requirements` field lists it"
    - "Only IDs defined in a REQUIREMENTS document (`.planning/REQUIREMENTS.md` or `.planning/milestones/*-REQUIREMENTS.md`) are checked; other satisfied IDs (SC-N, AC-N, pre-REQUIREMENTS-doc families) are listed as skipped, never as findings"
    - "Rows marked NOT SATISFIED, PARTIALLY SATISFIED, BLOCKED or NEEDS HUMAN are not treated as satisfied"
    - "SUMMARY entries are matched by their leading ID token, so `[EST-03]`, block lists, quoted free text (`\"STK-02 (part b)\"`) and an inline list with a trailing `# comment` all parse"
    - "On this repository, before the correction `scan` reports exactly EST-02 and EST-04 for objective 58; after it, `scan` reports no finding (`requirements-agreement.repo.test.cjs` passes)"
    - "Every objective 58 SUMMARY's `requirements-completed` equals its TRD's `requirements` field, and each corrected file differs from HEAD by that one line only"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/requirements-agreement.cjs
      provides: "knownRequirementIds, parseSatisfied, parseCompleted, scanObjective, scan, findingMessage, findingFix"
      exports: ["knownRequirementIds", "parseSatisfied", "parseCompleted", "scanObjective", "scan", "findingMessage", "findingFix"]
    - path: plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs
      provides: "this repository's .planning/ has no requirements-completed disagreement, and objective 58 is actually checked"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/requirements-fixtures.cjs
      provides: "makeRequirementsProject plus verificationText / summaryText / trdText builders mirroring real file shapes"
  key_links:
    - from: "requirements-agreement.cjs parseCompleted"
      to: "frontmatter.cjs extractFrontmatter"
      via: "array entries as-is; a string value has its trailing YAML comment stripped and is split on commas"
      pattern: "extractFrontmatter"
    - from: "requirements-agreement.repo.test.cjs"
      to: ".planning/objectives/58-estimation-engine-and-surfacing/*-SUMMARY.md"
      via: "scan(REPO_ROOT/.planning).findings deep-equals []"
      pattern: "findings"
---

# TRD 69-03: Flag a satisfied requirement no SUMMARY lists, and correct objective 58 (TOOL-10)

<objective>
Objective 58's VERIFICATION marks EST-02, EST-03, EST-04 and EST-05 SATISFIED, but across its ten SUMMARYs
`requirements-completed` lists only EST-03 (58-01) and EST-05 (58-04). Anything that audits completion from SUMMARY
frontmatter (audit-milestone's three-source cross-reference, a requirements tally) is misled, and nothing notices.

Build the check as a pure module: for every objective with a VERIFICATION, every requirement its Requirements Coverage
table marks SATISFIED must appear in some SUMMARY's `requirements-completed` in that objective. Scope it to IDs defined
in a REQUIREMENTS document: a planning-session scan of this repository showed that this isolates exactly the 58 case,
while older objectives use SC-N/AC-N labels or requirement families that predate REQUIREMENTS.md. Then correct 58's
SUMMARY frontmatter by the summary template's rule (copy the TRD's `requirements` field), with a repository test that
was RED before the correction and keeps it fixed. 69-05 wires the module into `validate health` (W065) and a
`validate requirements` command.

Purpose: success criterion 3. Output: `lib/requirements-agreement.cjs`, fixtures, unit and repo tests, eight corrected
58 SUMMARYs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/58-estimation-engine-and-surfacing/58-VERIFICATION.md

Read with offset/limit:
- `plugins/devflow/devflow/templates/verification-report.md` 55-66 (the coverage table: `| Requirement | Status | Blocking Issue |`,
  first cell `{REQ-01}: {description}`, status `✓ SATISFIED` / `✗ BLOCKED` / `? NEEDS HUMAN`).
- `plugins/devflow/devflow/templates/summary.md` around line 43 (`requirements-completed: []  # REQUIRED — Copy ALL
  requirement IDs from this TRD's requirements frontmatter field.`).
- `plugins/devflow/devflow/bin/lib/frontmatter.cjs` 44-130 (`extractFrontmatter`): it returns arrays for inline and
  block lists but returns the raw string for an inline list followed by a comment, e.g.
  `"[AUT-03, AUT-07]  # This TRD's share only: ..."` (observed on 44-02-SUMMARY.md).
- `plugins/devflow/devflow/bin/lib/helpers.cjs` 200-240: `normalizeObjectiveName`, `objectiveDirMatches`,
  `parseObjectiveDirName`.
- `plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` 35-45: how a repo test finds `REPO_ROOT` and skips
  outside a DevFlow checkout.

## Binding rules
- Strict TDD on tasks 2 and 3; one test at a time.
- Hand-built fixtures mirroring the real shapes listed in the test list; no generated data.
- Parallel wave: 69-01 edits planning-verbs*.cjs, 69-02 edits validate.cjs and doctor-git.cjs. Do not edit validate.cjs,
  df-tools.cjs, help.cjs or flag-spec.cjs (69-05 wires the module). One plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- The 58 SUMMARYs are planning files: change them only through `planning draft` + `summary post`, never by writing
  `.planning/` directly.

## Correction table (task 3; `requirements` of each 58 TRD, read from its frontmatter on 2026-10-08)

| SUMMARY | today | becomes |
|---|---|---|
| 58-01 | `[EST-03]` | unchanged |
| 58-02 | `[]` | `[EST-03]` |
| 58-03 | `[]` | `[EST-03]` |
| 58-04 | `[EST-05]` | unchanged |
| 58-05 | `[]` | `[EST-02, EST-03]` |
| 58-06 | `[]` | `[EST-03]` |
| 58-07 | `[]` | `[EST-03]` |
| 58-08 | `[]` | `[EST-02, EST-03, EST-05]` |
| 58-09 | `[]` | `[EST-04, EST-05]` |
| 58-10 | `[]` | `[EST-02, EST-03, EST-04, EST-05]` |

Re-read each TRD's `requirements:` line before editing (`rg -n "^requirements:" .planning/objectives/58-*/58-*-TRD.md`);
if one differs from the table, the TRD wins and the SUMMARY records the difference.
</context>

## Test list

`requirements-agreement.test.cjs` (task 2), each against `makeRequirementsProject` or a literal string:
1. `scan` on a 58-shaped project (EST-02..05 defined in REQUIREMENTS.md; VERIFICATION SATISFIED for all four; SUMMARYs
   list only EST-03 and EST-05; TRDs as in the correction table) -> findings for EST-02 and EST-04 only, each with
   `objective: '58-est'`, `number: '58'`, `verification: '58-VERIFICATION.md'`, and `candidates` `['58-05','58-08','58-10']`
   / `['58-09','58-10']`; sorted by objective then requirement.
2. The same project after the SUMMARYs list EST-02 and EST-04 -> `findings: []`, `checked: { objectives: 1, requirements: 4 }`.
3. IDs not in any REQUIREMENTS document (`SC-1`, `AC-2`, `STK-02a`) are reported under `skipped`, never in findings; an
   archived `.planning/milestones/v1.5-REQUIREMENTS.md` ID is checked like a current one.
4. No REQUIREMENTS document at all -> findings empty, every satisfied ID skipped.
5. `parseSatisfied`: only rows under a `Requirements Coverage` heading (a `Observable Truths` table row whose first cell
   is an ID is ignored); `✓ SATISFIED`, `SATISFIED (checkbox deliberately left for orchestrator)` count; `NOT SATISFIED`,
   `PARTIALLY SATISFIED`, `✗ BLOCKED`, `? NEEDS HUMAN` do not; first cell `EST-02: description`, `**EST-02**` and
   `` `EST-02` `` all give `EST-02`; the header and separator rows are skipped; the section ends at the next heading.
6. `parseCompleted` shapes: `requirements-completed: [EST-03]`; `requirements-completed: []`;
   `requirements-completed: ["STK-02 (part b)"]` -> `STK-02`; a block list whose entry is a long quoted sentence with
   `: ` inside; `requirements-completed: [AUT-03, AUT-07]  # This TRD's share only: AUT-03 closes with 44-01` ->
   `['AUT-03','AUT-07']`; key absent -> `[]`; a `requirements:` key (wrong key) -> `[]`.
7. `knownRequirementIds` reads `- [x] **ID**:` and `- [ ] **ID**:` lines from REQUIREMENTS.md and every
   `milestones/*-REQUIREMENTS.md`; it ignores traceability-table rows and prose mentions.
8. `scan(dir, { objective: '58' })` checks only objective 58; `{ objective: '5' }` matches `05-*`, not `58-*`
   (helpers.objectiveDirMatches); an objective with no VERIFICATION is not counted.
9. Multiple VERIFICATION files in one objective are unioned; a SUMMARY in another objective does not satisfy this one.
10. `findingMessage` -> `requirements-unlisted: objective 58 (58-VERIFICATION.md) marks EST-02 satisfied, but no SUMMARY in 58-est lists it in requirements-completed`;
    `findingFix` names the candidate TRDs and the `planning draft` + `summary post` commands; with no candidates it says
    "the SUMMARY of the TRD that completed it".

`requirements-agreement.repo.test.cjs` (task 3):
11. On this repository (`REPO_ROOT/.planning`, skipped outside a DevFlow checkout): `scan(...).findings` deep-equals `[]`,
    and objective 58 is actually checked (`scanObjective` for its directory has `satisfied` containing EST-02 and EST-04).
    RED today: two findings (EST-02, EST-04).

<embedded_context>

<codebase_examples>
Real shapes the fixtures must mirror (copied from this repository on 2026-10-08):

```
58-VERIFICATION.md   ## Requirements Coverage
                     | Req | Plans | Status |
                     |-----|-------|--------|
                     | EST-02 | 58-05, 58-08, 58-10 | SATISFIED (checkbox deliberately left for orchestrator) |
                     | EST-03 | 58-01,02,03,05,06,07,08,10 | SATISFIED |
35-02a-SUMMARY.md    requirements-completed:
                       - "STK-02 (part a): a loader parses stack profiles and resolves them through bundled general → org/pack (extends chain) → project → component tiers, with per-field provenance."
35-02b-SUMMARY.md    requirements-completed: ["STK-02 (part b)"]
44-02-SUMMARY.md     requirements-completed: [AUT-03, AUT-07]  # This TRD's share only: AUT-03 closes with 44-01 (execute-objective.md:818) + 44-08 (CI guard)
44-05-SUMMARY.md     requirements: [AUT-06]                    (wrong key: not a requirements-completed entry)
REQUIREMENTS.md      - [ ] **TOOL-06**: `doc put` never publishes stale content. ...
                     | TOOL-06 | Objective 69 | Pending |   (traceability row: not a definition)
```

A planning-session prototype of this scan over `.planning/objectives/` produced, scoped to REQUIREMENTS-document IDs:
`58-estimation-engine-and-surfacing: sat=EST-02,EST-03,EST-04,EST-05 missing=EST-02,EST-04` and nothing else.
Unscoped it also flagged 03, 04, 08 (SC-N), 11 (AC-N), 23 (SCOPE-N), 35 (STK), 41 (VER), 44 (AUT): those are why the
scope rule exists.
</codebase_examples>

<anti_patterns>
- Do not scan every `ID-N` token in a VERIFICATION: truth tables and prose mention IDs that are not coverage claims.
- Do not treat `requirements:` (the TRD key) in a SUMMARY as `requirements-completed`.
- Do not count SUMMARYs of other objectives: the claim is per objective.
- Do not "fix" older objectives (35, 44, 45, ...) in this TRD: they are outside the scope rule, and TOOL-10 corrects 58.
- Do not edit any other line of a 58 SUMMARY (tokens, durations and verification blocks feed calibration).
</anti_patterns>

<error_recovery>
- `planning draft` returns a draft that is not identical to the live 58 SUMMARY (a leftover from an earlier session; the
  pre-69-01 df-tools never reseeds): `cmp <draft> <live>` before editing; if they differ, delete the draft file and run
  `planning draft` again.
- `summary post 58-NN` resolves the wrong file: check `trdTarget` found `58-NN`; pass `--file 58-NN-SUMMARY.md`.
- The repo test still reports a finding after the correction: print `scan(...)` for objective 58 and compare `listed`
  with the table; a YAML typo (missing bracket) makes extractFrontmatter return a string.
</error_recovery>

</embedded_context>

<gotchas>
- `extractFrontmatter` may return `[]`, an array, a string (inline list plus comment) or `undefined`; normalise all four.
- The leading-ID regex is `^[\s"'\`*]*([A-Z][A-Z0-9]*-\d+[a-z]?)\b`; it turns `STK-02 (part b)` into `STK-02` and
  `STK-02a` stays `STK-02a`.
- TRD ids for candidates come from the file name: `^(\d+(?:\.\d+)?-\d+[a-z]?)(?:-|$)` on `58-05-task-and-trd-estimates-TRD.md`
  gives `58-05`; a TRD's `requirements` may be an inline list string too; parse it with the same normaliser.
- `number` in a finding is the directory's leading number (`parseObjectiveDirName(dir).number`), so `58-est` -> `58`.
- In local mode `summary post` writes the checkout that runs it (a worktree commits its own SUMMARY); `planning draft`
  seeds from the main checkout. Both hold the same 58 SUMMARY text at the start of this objective.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── requirements-agreement.cjs                   ← CREATE
├── requirements-agreement.test.cjs              ← CREATE (tests 1-10)
├── requirements-agreement.repo.test.cjs         ← CREATE (test 11)
└── __fixtures__/requirements-fixtures.cjs       ← CREATE
.planning/objectives/58-estimation-engine-and-surfacing/
└── 58-{02,03,05,06,07,08,09,10}-SUMMARY.md      ← MODIFY (one frontmatter line each, via summary post)
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Requirements-project fixture builders</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/requirements-fixtures.cjs</files>
  <action>
Hand-built module:
- `makeRequirementsProject({ requirements = [], archived = {}, objectives = [] })` -> realpath'd mkdtemp root with
  `.planning/REQUIREMENTS.md` (`- [x] **<ID>**: <ID> text` per id, plus a traceability table repeating them, so test 7
  can prove rows are ignored), `.planning/milestones/<version>-REQUIREMENTS.md` per `archived` entry, and per objective
  `{ dir, verifications: { name: text }, summaries: { name: text }, trds: { name: text } }` written under
  `.planning/objectives/<dir>/`. Returns `{ root, planningDir, write(rel, text), cleanup() }`.
- `verificationText({ coverage = [], truths = [], heading = '## Requirements Coverage', header = '| Requirement | Status | Blocking Issue |' })`
  -> frontmatter (`status: passed`), an `## Observable Truths` table (`truths` rows verbatim), then the coverage heading,
  header, separator and `coverage` rows verbatim, then `## Anti-Patterns Found`.
- `summaryText(rcBlock)` -> frontmatter with `objective`, `trd`, then `rcBlock` verbatim (the raw YAML: an inline line, a
  block list, a commented line, or `''` for absent), then a `verification:` block with `gates_defined: 2`; then a body.
- `trdText(requirementsLine)` -> frontmatter with `requirements: <line>` and a one-line body.
- `fiftyEightShape()` -> the arguments for test 1 (EST-02..05; SUMMARYs `58-01 [EST-03]`, `58-04 [EST-05]`, others `[]`;
  TRDs with the correction table's lists; the VERIFICATION rows of 58-VERIFICATION.md).
Commit `test(69-03): requirements agreement fixtures`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/requirements-fixtures.cjs'); const p=f.makeRequirementsProject(f.fiftyEightShape()); console.log(require('fs').readdirSync(p.planningDir+'/objectives/58-est').length); p.cleanup()"` prints `21` (10 TRDs, 10 SUMMARYs, 1 VERIFICATION).</verify>
  <done>Every shape in tests 1-10 can be built from literal text.</done>
  <recovery>If the count differs, list the directory and fix fiftyEightShape's file names (`58-NN-<slug>-TRD.md`, `58-NN-SUMMARY.md`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: requirements-agreement.cjs (tests 1-10)</name>
  <files>plugins/devflow/devflow/bin/lib/requirements-agreement.cjs, plugins/devflow/devflow/bin/lib/requirements-agreement.test.cjs</files>
  <action>
RED: tests 1-10. Commit `test(69-03): requirements-completed agrees with VERIFICATION`.

GREEN `lib/requirements-agreement.cjs` (fs, path, `./frontmatter.cjs` extractFrontmatter, `./helpers.cjs`
normalizeObjectiveName / objectiveDirMatches / parseObjectiveDirName):
```
REQ_ID_RE = /^[\s"'`*]*([A-Z][A-Z0-9]*-\d+[a-z]?)\b/
leadingId(s) -> id | null
knownRequirementIds(planningDir): Set of /^- \[[ xX]\] \*\*([A-Z][A-Z0-9]*-\d+[a-z]?)\*\*/gm over REQUIREMENTS.md
  and milestones/*-REQUIREMENTS.md (missing files are fine)
parseSatisfied(text): walk lines; a heading (^#{1,6}\s) sets inSection = /requirements coverage/i.test(title);
  in section, a `|` row that is not a separator: cells = split('|') minus the outer empties, trimmed;
  id = leadingId(cells[0]); rest = cells.slice(1).join(' | ');
  satisfied = /\bSATISFIED\b/.test(rest) && !/\b(NOT|PARTIALLY)\s+SATISFIED\b/i.test(rest)
  -> unique ids in order
listValue(v): Array -> v; string -> strip /\s+#.*$/, strip one pair of [ ], split ',', trim; else []
parseCompleted(text): listValue(extractFrontmatter(text)['requirements-completed']).map(leadingId).filter(Boolean)
scanObjective(objDir, known): files = readdir; verifications /-VERIFICATION\.md$/ (none -> null);
  satisfied = union parseSatisfied; listed = union parseCompleted over /-SUMMARY\.md$/;
  trdReqs = { trdId: listValue(fm.requirements).map(leadingId) } over /-TRD\.md$/;
  checkedIds = satisfied ∩ known; skipped = satisfied − known;
  missing = checkedIds − listed, each { id, verification: first verification file whose rows list it, candidates: sorted trdIds whose list has it }
scan(planningDir, { objective } = {}): known = knownRequirementIds; dirs = sorted readdir(objectives) that are
  directories with parseObjectiveDirName non-null (and objectiveDirMatches(dir, normalizeObjectiveName(String(objective))) when given);
  -> { checked: { objectives, requirements }, findings: [{ objective: dir, number, requirement, verification, candidates }], skipped: [{ objective, ids }] }
findingMessage(f), findingFix(f): the texts in test 10; the fix uses `df-tools planning draft objectives/<dir>/<trd>-SUMMARY.md`
  and `df-tools summary post <trd> --from <draft>`.
```
Header comment: what agreement means, the scope rule and why (the prototype result in codebase_examples), the parse
rules, and that 69-05 renders findings as W065.
Commit `feat(69-03): requirements agreement scan`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/requirements-agreement.test.cjs` passes.</verify>
  <done>Tests 1-10 went RED then GREEN; the module is pure (reads files, no output, no exit).</done>
  <recovery>If test 5's `✓ SATISFIED` row fails, the `\b` before SATISFIED is fine but check the split did not keep the leading `|` as an empty first cell.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Repository test and objective 58 correction (test 11)</name>
  <files>plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs, .planning/objectives/58-estimation-engine-and-surfacing/58-02-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-03-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-05-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-06-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-07-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-08-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-09-SUMMARY.md, .planning/objectives/58-estimation-engine-and-surfacing/58-10-SUMMARY.md</files>
  <action>
RED: `requirements-agreement.repo.test.cjs` (test 11; `REPO_ROOT` and the skip exactly as planning-writes.repo.test.cjs).
Run it: it must fail listing EST-02 and EST-04 for objective 58. Commit `test(69-03): this repository's SUMMARYs agree with VERIFICATION`.

GREEN, for each SUMMARY in the correction table that changes (58-02, 03, 05, 06, 07, 08, 09, 10), one command per call:
1. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/58-estimation-engine-and-surfacing/58-NN-SUMMARY.md`
   (prints the draft path D).
2. `cmp D .planning/objectives/58-estimation-engine-and-surfacing/58-NN-SUMMARY.md` must report no difference (see
   error_recovery if it does).
3. Edit tool on D: replace the exact line `requirements-completed: []` with the table's value. Nothing else.
4. `node plugins/devflow/devflow/bin/df-tools.cjs summary post 58-NN --from D`.
Then `git diff --numstat -- .planning/objectives/58-estimation-engine-and-surfacing/` must list exactly the eight files,
each `1	1`. Run the repo test: GREEN. Commit the eight SUMMARYs with
`fix(69-03): list EST-02 and EST-04 in objective 58 SUMMARY frontmatter`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs plugins/devflow/devflow/bin/lib/requirements-agreement.test.cjs` passes; `git diff --numstat HEAD~1 -- .planning/objectives/58-estimation-engine-and-surfacing/` shows eight `1	1` rows; `git show --stat HEAD` lists only those eight files.</verify>
  <done>Test 11 went RED (EST-02, EST-04) then GREEN; every 58 SUMMARY's requirements-completed equals its TRD's requirements.</done>
  <recovery>If `summary post` rewrites more than the one line (a trailing newline or encoding change), restore the file with `git checkout -- <path>`, re-draft, and compare D with the live file byte for byte before posting.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/requirements-agreement.test.cjs plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Record the failing set before the first change; only known
     environment failures (MA-7 handoff-e2e doctl) may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-3: test 1 flags the 58 case on a fixture; test 11 flagged it on this repository (RED) and passes after the
  correction; tests 3-4 show the scope rule keeps older label families out.
</verification>

<success_criteria>
- Tests 1-11 pass (RED first where listed); full suite at baseline.
- `rg -n "^requirements-completed:" .planning/objectives/58-estimation-engine-and-surfacing/` shows the correction
  table's values.
</success_criteria>

<output>
After completion, publish `69-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-03 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-10]`. Record the RED output
of test 11 (the two findings) in the SUMMARY.
</output>
