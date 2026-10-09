---
objective: 68-milestone-and-objective-verbs
trd: "04"
type: standard
wave: 2
depends_on: ["68-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/objective-renumber-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs
  - plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs
autonomous: true
requirements: [TOOL-03, TOOL-04]
must_haves:
  truths:
    - "`objective remove N --confirm` renumbers objective headings, checkboxes, progress rows, Depends-on references and NN-MM TRD references, and leaves every date (2026-03-15, 2026-10-08, 2026-10-08T12:30:00Z), status, plan count, milestone column and requirement ID of the renumbered objectives byte-identical"
    - "Removing objective 25 from a ROADMAP holding objective 26 and dates in 2026 renumbers 26 to 25 and leaves every `2026-` date intact"
    - "`objective complete N` reports the next objective from objective directories AND `### Objective M:` sections of ROADMAP.md: with later objectives only in ROADMAP.md it returns that number, `is_last_objective: false`, and a legacy STATE.md moves to it with Status `Ready to plan`"
    - "The next objective is the numerically smallest later one (99 before 100), skipping a directory whose OBJECTIVE.md says `status: cancelled`; store-mode `objective complete` uses the same lookup"
    - "objective.test.cjs and objective-change-flags.test.cjs pass unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: "renumberRoadmapText (the bounded renumber pass) and nextObjective (directories + ROADMAP sections), both exported"
      exports: ["renumberRoadmapText", "nextObjective"]
    - path: plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs
      provides: "date/metadata preservation tests for objective remove"
    - path: plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs
      provides: "next_objective / is_last_objective tests with ROADMAP-only objectives"
  key_links:
    - from: "objective.cjs cmdObjectiveRemove"
      to: "objective.cjs renumberRoadmapText"
      via: "replaces the inline renumber loop"
      pattern: "renumberRoadmapText\\("
    - from: "objective.cjs cmdObjectiveComplete and storeObjectiveComplete"
      to: "objective.cjs nextObjective -> helpers.parseObjectiveDirName/objectiveDirMatches + milestone-scope.roadmapSections"
      via: "one next-objective lookup for both modes (nextObjectiveDir removed)"
      pattern: "nextObjective\\("
---

# TRD 68-04: `objective remove` keeps dates and metadata; `objective complete` sees ROADMAP-only objectives (TOOL-03, TOOL-04)

<objective>
Two defects in objective.cjs, both reproduced on this repository's own data:

- `objective remove` renumbers with a whole-file pass whose TRD-reference rule (`${oldPad}-(\d{2})`) also matches inside
  dates: removing objective 1 turned a progress row's `2026-03-15` into `2025-02-15` (59-05 Deferred Issues). Any
  objective numbered 26 rewrites every `2026-` date.
- `objective complete` finds the next objective by scanning `.planning/objectives/` only, so when the later objectives
  exist in ROADMAP.md but have no directory yet it reports `next_objective: null, is_last_objective: true` and does not
  advance STATE.md (pending todo `objective-complete-next-objective.md`, seen on objectives 56 and 57). Its scan also
  takes the first directory in lexicographic order (`100-x` before `99-y`).

Bound the TRD-reference rule so it cannot match inside a date or a longer token, and make the next-objective lookup
read directories (through 68-02's shared helpers) and ROADMAP.md sections, in number order, for local and store mode.

Purpose: success criteria 4 and 5 (first half). Output: two exported functions in objective.cjs, a fixture module, two
test files.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/68-milestone-and-objective-verbs/68-02-SUMMARY.md
@.planning/todos/pending/objective-complete-next-objective.md

Read `plugins/devflow/devflow/bin/lib/objective.cjs` with offset/limit: `nextObjectiveDir` + `storeObjectiveComplete`
(around 365-406), `cmdObjectiveRemove`'s ROADMAP pass (around 741-806) and `cmdObjectiveComplete`'s next-objective scan
and STATE update (around 956-1094).

## Binding rules
- Strict TDD on tasks 2 and 3; one test at a time.
- **Temp fixtures only.** `objective remove` cascade-renumbers everything above the removed objective. Never run it or
  `objective complete` against this repository's `.planning/` (68-07 dogfoods on a scratch copy).
- objective.test.cjs, objective-change-flags.test.cjs and their fixtures are not in this TRD's files: they must pass
  unchanged. Import `flagsProject`/`roadmapFor` from `__fixtures__/objective-flags-fixtures.cjs` read-only if useful.
- 68-02 (a dependency) added `parseObjectiveDirName` and `canonicalObjectiveNumber` to helpers.cjs and exports
  `roadmapSections` from milestone-scope.cjs. Use them; do not edit those files.
- 68-03's dispatcher guard is merged: `objective remove` accepts `--force`/`--confirm`; tests pass no other flags.
- Parallel wave (68-05, 68-06 beside it, no shared files). Address your checkout explicitly if a worktree was
  provisioned; one plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decided behaviour
- TRD-reference rule: `(?<![\w.-])${oldPad}-(\d{2})(?!\d|-\d)`: no word character, `.` or `-` before it, and not
  followed by a digit or by `-<digit>`. `18-01`, `` `18-01-TRD.md` ``, `/18-01-slug-TRD.md`, `(18-01)` and
  `18-01's` still renumber; `2026-03-15`, `03-15-2026`, `v1.18-01`, `AUTH-18-01` do not.
- Renumbering prose ranges (`Objectives 65-75` in a paragraph, `Objectives 55–64` in a milestone bullet) is out of
  scope: ranges are not renumbered by any rule today and this TRD does not add one (68-07 records it as a known issue).
- Objective files inside renamed directories keep their content (frontmatter `objective: 18-foo` is not rewritten);
  out of scope, unchanged.
- `nextObjective(root, objectiveNum)` → `{ num, name } | null`: candidates are current directories (a name counts when
  `parseObjectiveDirName` gives a number and `objectiveDirMatches(name, normalizeObjectiveName(number))` holds) and
  ROADMAP.md sections (`roadmapSections`). A directory whose OBJECTIVE.md frontmatter `status` is `cancelled` removes
  that number from the candidates. Pick the smallest number greater than `objectiveNum` (`parseFloat`). `num` is the
  directory's number as written when a directory exists (back-compat: `'13'`, `'05'`), else the section number;
  `name` is the directory slug, else `generateSlugInternal(section title)`.
</context>

## Test list

`objective-remove-renumber.test.cjs` (task 2; spawns `objective remove N --confirm --force` on temp projects; the
renumber helper also gets direct unit cases):
1. 59-05's reproduction: objectives 1-3, objective 2 done with checkbox suffix `(completed 2026-03-15)` and progress
   row date `2026-03-15`; remove 1 → objective 2 is now `Objective 1`, its row `| 1. B | v1.0 | 2/2 | Complete | 2026-03-15 |`
   byte for byte, checkbox suffix `(completed 2026-03-15)` intact.
2. The 2026 collision: objectives 24, 25, 26 with dates `2026-10-08` on rows and checkboxes; remove 24 → 25 → 24,
   26 → 25, `26-01-TRD.md` reference → `25-01-TRD.md`, and every `2026-10-08` survives.
3. Multiset of ISO date tokens (`\d{4}-\d{2}-\d{2}`, with timestamps `2026-10-08T12:30:00Z`) in ROADMAP.md after =
   before minus the tokens that sat in the removed objective's section, checkbox and row.
4. Metadata of renumbered objectives unchanged apart from their number: status cell, plans cell (`2/2`), milestone
   cell, `**Requirements**: AUTH-01, AUTH-02` line, a `Shipped: 2026-10-05` details line, a US-style `03-15-2026` token
   and `AUTH-03-01` are byte-identical.
5. Still renumbered: headings, checkboxes, table numbers, `**Depends on**: Objective 3` lines, `03-01` TRD references
   in prose, backticks, parentheses and paths, `03-01's`.
6. `renumberRoadmapText(text, 1)` unit: the same cases as 1-5 on a string, no fs.
7. Dry run (no `--confirm`) still writes nothing (control).

`objective-complete-next.test.cjs` (task 3; spawns `objective complete N`):
8. Dirs `01-a`, `02-b`; ROADMAP sections 1-4: complete 2 → `next_objective: '3'`, `next_objective_name: <slug of
   section 3's title>`, `is_last_objective: false`.
9. Dirs `01-a`..`03-c`, sections 1-3: complete 3 → `next_objective: null`, `is_last_objective: true` (control).
10. Dir and section both present for 3: complete 2 → `next_objective: '03'`, name `c` (directory form, as today).
11. Dir `03-c` cancelled (OBJECTIVE.md `status: cancelled`), section 4 with no dir: complete 2 → `'4'`.
12. Section `2.1` only in ROADMAP: complete 2 → `'2.1'`.
13. Dirs `98-x`, `99-y`, `100-z`: complete 98 → `'99'` (today: `'100'`).
14. Legacy STATE.md (`**Current Objective:**`) with next only in ROADMAP: `Current Objective: 3`, Status `Ready to plan`
    (today: `Milestone complete`).
15. `nextObjective(root, '2')` unit on a temp project returns `{num: '3', name: ...}`; storeObjectiveComplete calls
    `nextObjective(` and `nextObjectiveDir` no longer exists (source check).

Regression: objective.test.cjs, objective-change-flags.test.cjs unchanged.

<embedded_context>

<codebase_examples>
The renumber loop today (`cmdObjectiveRemove`), the rule at fault marked:

```js
for (let oldNum = removedInt + 1; oldNum <= maxObjective; oldNum++) {   // ascending, one step each
  ...
  roadmapContent = roadmapContent.replace(new RegExp(`(#{2,4}\\s*Objective\\s+)${oldStr}(\\s*:)`, 'gi'), `$1${newStr}$2`);
  roadmapContent = roadmapContent.replace(new RegExp(`(Objective\\s+)${oldStr}([:\\s])`, 'g'), `$1${newStr}$2`);
  roadmapContent = roadmapContent.replace(new RegExp(`${oldPad}-(\\d{2})`, 'g'), `${newPad}-$1`);   // <- matches inside dates
  roadmapContent = roadmapContent.replace(new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'), `$1${newStr}. `);
  roadmapContent = roadmapContent.replace(dependsOnLine, (line) => line.replace(/* Objective N on Depends-on lines */));
}
```
Move the loop body unchanged into `renumberRoadmapText(text, removedInt)` (pure), then change only the TRD-reference
rule. Keep the ascending order and its comment.

Today's next-objective scans (both replaced by `nextObjective`):

```js
function nextObjectiveDir(objectivesDir, objectiveNum) {           // store mode
  const dirs = fs.readdirSync(objectivesDir, ...).filter(isDirectory).map(e => e.name).sort();  // lexicographic
  for (const dir of dirs) { const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/); if (dm && parseFloat(dm[1]) > current) return {...} }
}
// cmdObjectiveComplete repeats the same loop inline.
```

The cycle-safe lazy require (milestone-scope.cjs requires objective.cjs at load), as roadmap.cjs does:

```js
const { roadmapSections } = require('./milestone-scope.cjs');   // inside nextObjective, not at the top
```

Cancelled check (frontmatter.cjs is cycle-free): `extractFrontmatter(text).status` trimmed, lower-cased, `=== 'cancelled'`,
the rule `isCancelled` in milestone-scope.cjs uses.
</codebase_examples>

<anti_patterns>
- Do not mask dates by replacing them with placeholders and restoring: the bounded rule fixes the cause and keeps the
  pass a set of plain replaces.
- Do not add rules for prose ranges or rewrite file contents inside renamed directories (out of scope, see context).
- Do not change the narrative STATE.md branch of `objective complete`: it never touches `**Status:**`.
- Do not keep a second copy of the next-objective scan for store mode.
</anti_patterns>

<error_recovery>
- If objective.test.cjs's 48-14 characterization (exact output bytes of `objective complete 7`) fails, its fixture has
  no later objective in ROADMAP or directories, so `next_objective: null` must still hold; a failure means a candidate
  is being picked up from somewhere unexpected (a section number lower than or equal to 7, or a decimal parse). Do not
  edit that test.
- If the legacy STATE test in objective.test.cjs (`next_objective '13'`) fails, the directory form must win over the
  ROADMAP section form for the same number (context: `num` rule).
</error_recovery>

</embedded_context>

<gotchas>
- `findObjectiveInternal` must still find the objective being completed; `nextObjective` only looks above it.
- Section keys from `roadmapSections` are canonical (`'3'`, `'2.1'`); directory numbers are as written (`'03'`). Compare
  with `parseFloat`, merge by `canonicalObjectiveNumber`, and keep the directory's spelling for `num`.
- `objective remove`'s removal of the target's own section/checkbox/row happens before renumbering; dates inside the
  removed section disappear with it (test 3 accounts for that).
- 59-05's fixture note: objective-flags-fixtures.cjs deliberately has no dates. The new fixture module is where dated
  ROADMAPs live.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── objective.cjs                                   ← MODIFY (renumberRoadmapText, nextObjective)
├── objective-remove-renumber.test.cjs              ← CREATE (tests 1-7)
├── objective-complete-next.test.cjs                ← CREATE (tests 8-15)
└── __fixtures__/objective-renumber-fixtures.cjs    ← CREATE
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for dated ROADMAPs and next-objective projects</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/objective-renumber-fixtures.cjs</files>
  <action>
Hand-built module (no generated data):
- `datedRoadmap(objectives, extras)` → ROADMAP text. Each objective `{num, name, done, completed, milestone, plans,
  requirements, dependsOn, trds}` gives a checkbox (`- [x] Objective N: Name (completed <date>)` when done), a progress
  row `| N. Name | <milestone> | <plans> | Complete|Planned | <date or —> |`, and a section with `**Goal**:`,
  `**Requirements**:`, `**Depends on**: Objective M` and TRD lines `- [x] NN-01-slug-TRD.md — text (03-01's note)`.
  `extras` lines are appended verbatim (e.g. `Shipped: 2026-10-05`, `03-15-2026`, `AUTH-03-01`,
  `stamped 2026-10-08T12:30:00Z`).
- `datedProject({ roadmap, dirs: [{dir, cancelled?, trds?, summaries?}], state })` → temp project via
  `flagsProject` (imported read-only from `./objective-flags-fixtures.cjs`) plus OBJECTIVE.md `status: cancelled` for
  cancelled dirs; returns its handle.
- `isoDates(text)` → the sorted array of ISO date/timestamp tokens in a text (test 3's multiset).
- `LEGACY_STATE` constant with `**Current Objective:**`, `**Status:**`, `**Current Job:**`, `**Last Activity:**` fields.
Commit `test(68-04): dated ROADMAP and next-objective fixtures`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/objective-renumber-fixtures.cjs'); const t=f.datedRoadmap([{num:1,name:'A',done:true,completed:'2026-03-15'},{num:26,name:'Z',done:true,completed:'2026-10-08'}],['stamped 2026-10-08T12:30:00Z']); console.log(f.isoDates(t).length>=4, t.includes('| 26. Z |'))"` prints `true true`.</verify>
  <done>Dated ROADMAPs and next-objective projects are built in temp dirs only.</done>
  <recovery>If `flagsProject` cannot express a cancelled objective, write the OBJECTIVE.md into the returned root after it is built rather than editing objective-flags-fixtures.cjs.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The renumber pass leaves dates and metadata alone (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs</files>
  <action>
RED: tests 1-7 (1-4 and 6 fail today). Commit `test(68-04): objective remove keeps dates and metadata`.

GREEN: extract the loop into exported `renumberRoadmapText(text, removedInt)` (pure; same ascending order, same rules)
and call it from `cmdObjectiveRemove` (`if (!isDecimal) roadmapContent = renumberRoadmapText(roadmapContent, removedInt)`).
Change only the TRD-reference rule to the bounded form from the context section, with a comment citing the 59-05
reproduction and TOOL-03. Commit `fix(68-04): objective remove no longer rewrites dates`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs` passes.</verify>
  <done>Tests 1-7 pass (1-4 and 6 went RED first); existing objective suites pass unchanged.</done>
  <recovery>If a "still renumbered" case in test 5 fails, the lookbehind is too wide: list the character before each expected match in that fixture and narrow `[\w.-]` only by the character that blocks a real TRD reference; record it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: One next-objective lookup over directories and ROADMAP sections (tests 8-15)</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs</files>
  <action>
RED: tests 8-15 (8, 11-15 fail today; 9 and 10 are controls). Commit `test(68-04): objective complete sees ROADMAP-only objectives`.

GREEN in objective.cjs:

```
nextObjective(root, objectiveNum):
  current = parseFloat(objectiveNum); cands = Map(canonical -> {num, name, n})
  for name in sorted current dirs:
    p = parseObjectiveDirName(name); if (!p || !objectiveDirMatches(name, normalizeObjectiveName(p.number))) continue
    key = canonicalObjectiveNumber(p.number)
    if (cancelled(root, name)) { cands.set(key, null); continue }        // null = excluded number
    if (!cands.has(key)) cands.set(key, { num: p.number, name: p.slug, n: parseFloat(p.number) })
  for [key, title] of roadmapSections(roadmapText or ''):                 // lazy require
    if (!cands.has(key)) cands.set(key, { num: key, name: generateSlugInternal(title), n: parseFloat(key) })
  best = smallest c.n > current among non-null cands; return best ? { num, name } : null
```
Replace the inline scan in `cmdObjectiveComplete` and `nextObjectiveDir` in `storeObjectiveComplete` with it; delete
`nextObjectiveDir`; export `nextObjective`. The legacy STATE branch keeps using `nextObjectiveNum`/`nextObjectiveName`
(the `-` → space rewrite of the name stays). Commit `fix(68-04): objective complete finds the next objective in ROADMAP.md`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs` passes; `rg -n "nextObjectiveDir" plugins/devflow/devflow/bin/lib/objective.cjs` prints nothing; full suite at baseline.</verify>
  <done>Tests 8-15 pass (8, 11-15 went RED first); local and store mode share nextObjective; existing suites unchanged.</done>
  <recovery>If planning-verbs-cli.test.cjs test 8 (`set-status complete` equals `objective complete`) fails, both paths must reach cmdObjectiveComplete with the same arguments; do not special-case set-status.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Take the failing set before the first change; only those known
     environment failures may remain. -->
</validation_gates>

<verification>
- SC-4: tests 1-5 show completion dates and other metadata of renumbered objectives survive `objective remove`,
  including the 2026 collision.
- SC-5 (first half): tests 8, 11-14 show the right `next_objective` / `is_last_objective` when later objectives exist
  only in ROADMAP.md; test 15 shows store mode uses the same lookup.
</verification>

<success_criteria>
- Tests 1-15 pass (RED first where listed); objective.test.cjs and objective-change-flags.test.cjs unedited; full suite
  at baseline.
</success_criteria>

<output>
After completion, publish `68-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first). Note in it that the pending todo `objective-complete-next-objective.md` is
resolved by this TRD (68-07 completes the todo).
</output>
