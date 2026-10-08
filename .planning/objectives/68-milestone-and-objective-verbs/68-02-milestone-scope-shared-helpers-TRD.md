---
objective: 68-milestone-and-objective-verbs
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-scope-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/helpers.cjs
  - plugins/devflow/devflow/bin/lib/helpers.test.cjs
  - plugins/devflow/devflow/bin/lib/milestone-scope.cjs
  - plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs
autonomous: true
requirements: [TOOL-05]
must_haves:
  truths:
    - "milestone-scope.cjs has no directory-name parser of its own (no DIR_RE, no canonical()): it reads a directory's number through helpers.parseObjectiveDirName and accepts the directory only when helpers.objectiveDirMatches(name, normalizeObjectiveName(number)) holds"
    - "For every objective milestone-scope reports with a current directory, that directory is the one findObjectiveInternal (find-objective) returns for the same number"
    - "Decimal objectives stay exact: 4.1 resolves to 04.1-one and never to 04.10-ten, in selectMilestoneObjectives, sectionObjectives and currentDirObjectives"
    - "milestone-complete.test.cjs, estimate-milestone.test.cjs and token-coverage.test.cjs pass unchanged (same numbers, names, dirs and status hints)"
    - "roadmapSections is exported from milestone-scope.cjs for 68-04's next-objective lookup"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/helpers.cjs
      provides: "parseObjectiveDirName(dirName) and canonicalObjectiveNumber(n), beside objectiveDirMatches"
      exports: ["parseObjectiveDirName", "canonicalObjectiveNumber"]
    - path: plugins/devflow/devflow/bin/lib/milestone-scope.cjs
      provides: "objective-directory resolution through the shared helpers"
      contains: "objectiveDirMatches"
    - path: plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs
      provides: "static no-local-parser guard, find-objective parity and decimal tests"
  key_links:
    - from: "milestone-scope.cjs objectiveDirectories"
      to: "helpers.cjs objectiveDirMatches / normalizeObjectiveName / parseObjectiveDirName"
      via: "require('./helpers.cjs')"
      pattern: "objectiveDirMatches"
    - from: "milestone-scope.cjs (module.exports)"
      to: "68-04 objective.cjs nextObjective"
      via: "roadmapSections export"
      pattern: "roadmapSections"
---

# TRD 68-02: milestone-scope.cjs resolves objective directories through the shared helpers (TOOL-05)

<objective>
Objective 56 made one rule for choosing an objective directory (`helpers.objectiveDirMatches`, with
`normalizeObjectiveName`) and moved every lookup in objective.cjs and misc.cjs onto it. milestone-scope.cjs, written in
59-04, kept its own parser (`DIR_RE = /^(\d+(?:\.\d+)?)-?(.*)$/` and `canonical()`), so `milestone complete`,
`estimate milestone` and `tokens coverage --milestone` can pick a directory that `find-objective` would not (an
unpadded `4-d`, a `04x` with no hyphen). The v1.5 audit listed it as tech debt.

Add the missing shared parse to helpers.cjs (a directory name's leading number, and the no-leading-zeros form used to
compare numbers), and make milestone-scope.cjs resolve directories only through the shared helpers.

Purpose: success criterion 5 (second half). Output: two helpers, a refactored milestone-scope.cjs, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/milestone-scope.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs

## Binding rules
- Strict TDD on tasks 2 and 3 (RED commit, then GREEN commit); one test at a time.
- Hand-built fixtures only. Temp projects only; nothing reads this repository's `.planning/`.
- The output contract of `selectMilestoneObjectives`, `sectionObjectives`, `currentDirObjectives` and
  `milestoneObjectiveNumbers` does not change: same entry shape `{number, name, dir, status_hint}`, `number` in the
  no-leading-zeros form (`'4'`, `'4.1'`), `dir` POSIX and project-relative.
- `milestone-complete.test.cjs`, `__fixtures__/milestone-complete-fixtures.cjs` and roadmap.cjs belong to 68-01 (same
  wave). Import the fixture module read-only; do not edit those files.
- Parallel wave: address your checkout explicitly if a worktree was provisioned; one plain command per Bash call; commit
  with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decided behaviour
- A directory counts as objective N only when `objectiveDirMatches(name, normalizeObjectiveName(N))` is true. So `04-d`
  is objective 4; `4-d` (unpadded) and `04x` (no hyphen) are not objectives here, exactly as `find-objective 4` cannot
  find them. This is the intended alignment; record it in the SUMMARY under decisions.
- `parseObjectiveDirName` proposes a number; `objectiveDirMatches` confirms it. Both live in helpers.cjs.
- ROADMAP heading parsing (`SECTION_RE`) and the milestone-bullet parsing stay in milestone-scope.cjs: they read
  ROADMAP.md text, not directory names. `roadmapSections` is exported unchanged for 68-04.
</context>

## Test list

`helpers.test.cjs` (task 2, unit):
1. `parseObjectiveDirName('04-d')` → `{ number: '04', slug: 'd' }`; `'04.1-one'` → `{ number: '04.1', slug: 'one' }`;
   `'04'` → `{ number: '04', slug: null }`; `'40-decoy'` → `{ number: '40', slug: 'decoy' }`; `'100-big'` →
   `{ number: '100', slug: 'big' }`.
2. Returns null for `'notes'`, `'04x'`, `'.gitkeep'`, `'v1.2-objectives'`, `''`, `'-04'`.
3. Agreement: for every padded name in test 1, `objectiveDirMatches(name, normalizeObjectiveName(r.number))` is true;
   for `'4-d'` the parse gives `'4'` and `objectiveDirMatches('4-d', '04')` is false (documents why scope ignores it).
4. `canonicalObjectiveNumber`: `'04'`→`'4'`, `'4'`→`'4'`, `'040'`→`'40'`, `'04.1'`→`'4.1'`, `'4.10'`→`'4.10'`,
   `'0'`→`'0'`, `'00'`→`'0'`.

`milestone-scope.test.cjs` (task 3):
5. Static: the milestone-scope.cjs source has no `DIR_RE`, no `function canonical`, and no regular-expression literal
   beginning `/^(\d+` (directory parse); it destructures `objectiveDirMatches`, `normalizeObjectiveName` and
   `parseObjectiveDirName` from `require('./helpers.cjs')`.
6. Parity with find-objective: on the TWO_MILESTONE_SPEC project, for every entry of `currentDirObjectives(root)`,
   `entry.dir === toPosix(findObjectiveInternal(root, entry.number).directory)`.
7. Decimal exactness: current dirs `04.1-one` and `04.10-ten`, ROADMAP bullet `Objectives 4.1, 4.10`: 4.1 → `04.1-one`,
   4.10 → `04.10-ten`; with the bullet `Objectives 4.1` only `04.1-one` is selected.
8. An unpadded `4-d` beside a `### Objective 4: D` section: `selectMilestoneObjectives` reports objective 4 with
   `dir: null`, `status_hint: 'no_dir'` (no directory find-objective would not find).
9. Non-objective entries under `.planning/objectives/` (a `notes/` directory, a `README.md` file, `.gitkeep`) are not in
   `currentDirObjectives`.
10. Archived directories: `milestones/v0.9-objectives/01-a` is used for objective 1 only when no current `01-*` exists;
    with both present the current one wins.
11. `roadmapSections(text)` is exported and returns a Map of canonical number → title (`'4'` → `'D'`, `'4.1'` → title).

Regression (task 3): milestone-complete.test.cjs (S1-S4, 1-10), estimate-milestone.test.cjs, token-coverage.test.cjs
pass without edits.

<embedded_context>

<codebase_examples>
The shared rule (`lib/helpers.cjs`):

```js
function normalizeObjectiveName(objective) {          // '4' -> '04', '4.1' -> '04.1', '100' -> '100'
  const match = objective.match(/^(\d+(?:\.\d+)?)/);
  ...
}
function objectiveDirMatches(dirName, normalized) {
  return dirName === normalized || dirName.startsWith(normalized + '-');
}
```

The local parser to remove (`lib/milestone-scope.cjs`):

```js
const DIR_RE = /^(\d+(?:\.\d+)?)-?(.*)$/;
function canonical(text) {
  const [int, dec] = String(text).split('.');
  return dec === undefined ? String(parseInt(int, 10)) : `${parseInt(int, 10)}.${dec}`;
}
function objectiveDirectories(cwd) {
  const found = new Map();
  const add = (name, rel) => {
    const m = DIR_RE.exec(name);
    if (!m) return;
    const key = canonical(m[1]);
    if (found.has(key)) return;
    found.set(key, { dir: rel.split(path.sep).join('/'), slug: m[2] || null });
  };
  // current dirs (sorted), then getArchivedObjectiveDirs(cwd)
}
```
`canonical()` is also used for ROADMAP section keys (`roadmapSections`); switch those to `canonicalObjectiveNumber` too,
so the file keeps no number-normalising code of its own.

Objective 56's static guard to model test 5 on (`lib/objective.test.cjs` test 9): it walks `lib/` and fails on
`/\.startsWith\(\s*(normalized|padded)\s*\)/`. Test 5 reads only milestone-scope.cjs.

Fixture module to build on (read-only import): `makeMilestoneProject(spec, opts)` in
`lib/__fixtures__/milestone-complete-fixtures.cjs` returns `{root, read, exists, write, cleanup}`; `write(rel, text)`
creates parents, so archived directories are `write('.planning/milestones/v0.9-objectives/01-a/01-01-TRD.md', ...)`.
</codebase_examples>

<anti_patterns>
- Do not move the directory regex into helpers.cjs under a new name and call it from milestone-scope.cjs unchanged: the
  point is one rule, so the parse must agree with `objectiveDirMatches` (no hyphen-less `04x`).
- Do not change objective.cjs, roadmap.cjs or estimate-milestone.cjs here; other modules keep their own parsers until a
  TRD moves them (68-04 moves objective.cjs's next-objective scan).
- Do not change the bullet parsing (`milestoneObjectiveNumbers`, `OBJECTIVES_TEXT_RE`): it parses ROADMAP prose.
</anti_patterns>

<error_recovery>
- If estimate-milestone.test.cjs or token-coverage.test.cjs fails, print the selection both ways (old module from
  `git show HEAD~1:<path>` into a scratch file vs new) on the failing fixture; a difference is either an unpadded/hyphen-less
  directory in that fixture (expected alignment: record it, and stop to report if a shipped test depends on it) or a bug.
- If `findObjectiveInternal` parity (test 6) fails only on separators, compare POSIX forms (`split(path.sep).join('/')`).
</error_recovery>

</embedded_context>

<gotchas>
- `findObjectiveInternal` returns `directory` relative to the project root with the platform separator
  (`path.join('.planning', 'objectives', match)`); milestone-scope's `dir` is POSIX.
- Current directories are scanned in sorted order and the first directory of a number wins; keep that tie-break so a
  stray second `04-*` directory resolves the same way find-objective does (`dirs.find(...)` on the sorted list).
- milestone-scope.cjs requires roadmap.cjs and objective.cjs at load (roadmap.cjs requires it back lazily); requiring
  helpers.cjs adds no cycle.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── helpers.cjs                                   ← MODIFY (parseObjectiveDirName, canonicalObjectiveNumber)
├── helpers.test.cjs                              ← MODIFY (tests 1-4)
├── milestone-scope.cjs                           ← MODIFY (shared helpers; export roadmapSections)
├── milestone-scope.test.cjs                      ← CREATE (tests 5-11)
└── __fixtures__/milestone-scope-fixtures.cjs     ← CREATE
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder for directory-resolution projects</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/milestone-scope-fixtures.cjs</files>
  <action>
Create a hand-built fixture module on top of `makeMilestoneProject` (import it read-only from
`./milestone-complete-fixtures.cjs`):
- `scopeProject({ roadmap, current: [dirName...], archived: { 'v0.9': [dirName...] }, extra: { rel: text } })` →
  a temp project whose `.planning/objectives/<dir>` and `.planning/milestones/<v>-objectives/<dir>` each hold one
  `<NN>-01-TRD.md`, plus extra files (e.g. `.planning/objectives/README.md`, `.planning/objectives/notes/x.md`);
  returns the `makeMilestoneProject` handle.
- `bulletRoadmap(bulletObjectivesText, sections)` → ROADMAP text with a `## Milestones` bullet
  `- 🚧 **v1.0 — Now** — Objectives <text> (in progress)` and one `### Objective N: Title` section per entry of
  `sections` (`[{num, title}]`).
Commit `test(68-02): fixtures for objective-directory resolution`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/milestone-scope-fixtures.cjs'); const p=f.scopeProject({roadmap:f.bulletRoadmap('4.1',[{num:'4.1',title:'One'}]),current:['04.1-one','04.10-ten'],archived:{'v0.9':['01-a']}}); console.log(p.exists('.planning/objectives/04.10-ten/04.10-01-TRD.md'), p.exists('.planning/milestones/v0.9-objectives/01-a/01-01-TRD.md')); p.cleanup()"` prints `true true`.</verify>
  <done>The builder creates current and archived objective directories and stray entries in temp projects only.</done>
  <recovery>If the TRD file name for a decimal directory comes out wrong, derive the prefix from the directory name's leading number exactly as `makeMilestoneProject` does (`dirNumber`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: parseObjectiveDirName and canonicalObjectiveNumber in helpers.cjs (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/helpers.cjs, plugins/devflow/devflow/bin/lib/helpers.test.cjs</files>
  <action>
RED: tests 1-4 in helpers.test.cjs (new `describe` block). Commit `test(68-02): shared objective-directory name parse`.

GREEN in helpers.cjs, next to `objectiveDirMatches` under `// ─── Normalization`:
- `parseObjectiveDirName(dirName)` → `{ number, slug }` when the name is `<digits>[.<digits>]` alone or followed by
  `-<slug>` (slug non-empty), else null. One RegExp, e.g. `/^(\d+(?:\.\d+)?)(?:-(.+))?$/`, documented as the same
  boundary `objectiveDirMatches` uses.
- `canonicalObjectiveNumber(n)` → the integer part without leading zeros (`'0'` stays `'0'`), decimal part kept as
  written.
Export both. Commit `feat(68-02): parseObjectiveDirName and canonicalObjectiveNumber helpers`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs` passes.</verify>
  <done>Tests 1-4 went RED then GREEN; both helpers are exported from helpers.cjs.</done>
  <recovery>If an existing helpers.test.cjs case breaks, the new exports collided with a name; rename the new helper, never the existing one.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: milestone-scope.cjs on the shared helpers (tests 5-11)</name>
  <files>plugins/devflow/devflow/bin/lib/milestone-scope.cjs, plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs</files>
  <action>
RED: create milestone-scope.test.cjs with tests 5-11 (5 and 8 fail today; 6, 7, 9, 10 may pass as controls; 11 fails
until the export exists). Commit `test(68-02): milestone-scope resolves directories like find-objective`.

GREEN in milestone-scope.cjs:

```
const { objectiveDirMatches, normalizeObjectiveName, parseObjectiveDirName, canonicalObjectiveNumber } = require('./helpers.cjs');
objectiveDirectories(cwd):                 // same return shape: Map canonical -> {dir, slug}
  for each current dir name (sorted), then each archived {name, basePath}:
    p = parseObjectiveDirName(name); if (!p) continue
    if (!objectiveDirMatches(name, normalizeObjectiveName(p.number))) continue
    key = canonicalObjectiveNumber(p.number); first wins (current before archived)
    found.set(key, { dir: posix(rel), slug: p.slug })
roadmapSections(text): keys via canonicalObjectiveNumber (behaviour unchanged)
delete DIR_RE and canonical(); export roadmapSections
```
Update the header comment: directories resolve through helpers.cjs (objective 56 rule, TOOL-05). Commit
`refactor(68-02): milestone-scope resolves objective directories through the shared helpers`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` passes; `rg -n "DIR_RE|function canonical" plugins/devflow/devflow/bin/lib/milestone-scope.cjs` prints nothing.</verify>
  <done>Tests 5-11 pass (5, 8 and 11 went RED first); the three consumer suites pass unchanged; no local directory parser remains in milestone-scope.cjs.</done>
  <recovery>If test 7 fails on `04.10-ten` resolving for 4.1, the lookup is using a prefix test instead of `objectiveDirMatches`; if a consumer suite fails, follow error_recovery before changing any expectation.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/token-coverage.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Take the failing set before the first change; only those known
     environment failures may remain. -->
</validation_gates>

<verification>
- SC-5 (second half): test 5 proves there is no local parser; tests 6-8 prove resolution matches find-objective,
  including decimals and the unpadded case.
- Consumers (`milestone complete`, `estimate milestone`, `tokens coverage --milestone`) are unchanged on their suites.
</verification>

<success_criteria>
- Tests 1-11 pass; consumer suites pass unedited; full suite at baseline.
- `rg -n "objectiveDirMatches" plugins/devflow/devflow/bin/lib/milestone-scope.cjs` finds the require and the call.
</success_criteria>

<output>
After completion, publish `68-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first).
</output>
