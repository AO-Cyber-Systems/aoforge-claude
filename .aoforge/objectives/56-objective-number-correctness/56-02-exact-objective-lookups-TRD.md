---
objective: 56-objective-number-correctness
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/helpers.cjs
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
  - plugins/devflow/devflow/bin/lib/text-escape.cjs
  - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
  - plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
autonomous: true
requirements: [ONUM-02, ONUM-03]
must_haves:
  truths:
    - "`find-objective 4.1` with only `04.10-ten` on disk returns found:false. With `04.1-one` present it returns `04.1-one`, never `04.10-*`"
    - "findObjectiveInternal('4.1') skips a current `04.10-ten` and returns an archived `04.1-one` from milestones/v*-objectives"
    - "`find-objective 4` never returns `04.1-*` or `045-*`. `objectives list --objective 4.1` and `objective-job-index 4.1` never select `04.10-*`"
    - "No production lib file selects an objective directory with a bare `startsWith(normalized)` / `startsWith(padded)`. All of them go through helpers.objectiveDirMatches"
    - "objectiveNumPattern tolerates leading zeros: `4` and `04` both match `Objective 4:` and `Objective 04:`, while `4` still never matches 14, 40, 041, 4.1 or 4.10"
    - "`detect novel-domain 4` and `verify trd-pre 4` find a `### Objective 4:` ROADMAP section for an `04-*` directory. So do `4.1` and `04.1-*` with `### Objective 4.1:`"
    - "boldLabelPattern(label) matches both `**Label:**` and `**Label**:`, escapes the label, and is exported from text-escape.cjs for TRDs 56-03 and 56-04"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/helpers.cjs
      provides: "objectiveDirMatches(dirName, normalized): exact name or name + '-'"
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: "searchObjectiveInDir, cmdFindObjective, cmdObjectivesList, cmdObjectiveRemove select dirs via objectiveDirMatches"
    - path: plugins/devflow/devflow/bin/lib/text-escape.cjs
      provides: "leading-zero-tolerant objectiveNumPattern + boldLabelPattern"
  key_links:
    - "find-objective / init / novel-domain / trd-pre -> findObjectiveInternal -> searchObjectiveInDir -> objectiveDirMatches"
    - "novel-domain / trd-pre-check / roadmap / objective / workstreams / project-bootstrap -> objectiveNumPattern (0*N, trailing boundary)"
    - "text-escape.boldLabelPattern -> consumed by 56-03 (Requirements) and 56-04 (Goal, Depends on)"
---

# TRD 56-02: Exact objective lookups and leading-zero-tolerant ROADMAP headings (ONUM-02, ONUM-03)

<objective>
Make objective lookups resolve exactly the objective asked for:

1. **Directories (ONUM-02).** `searchObjectiveInDir` picks `dirs.find(d => d.startsWith(normalized))`. That makes `4.1` (normalized
   `04.1`) select `04.10-ten` whenever `04.1-*` is absent or sorts later. Because the current-objectives search "finds" the wrong
   directory, an archived `04.1-*` is never reached. The same bare prefix test is in `cmdFindObjective`,
   `cmdObjectivesList` and misc.cjs `cmdObjectiveJobIndex`. Other sites (objective remove, roadmap analyze, workstreams,
   intent) already use `d === n || d.startsWith(n + '-')`. Give that rule one name in helpers.cjs and use it everywhere
   objective.cjs and misc.cjs choose a directory.
2. **ROADMAP headings (ONUM-03).** novel-domain and trd-pre-check pass `objective_number` (the directory's digits, `04`) into
   `objectiveNumPattern`. A ROADMAP that writes `### Objective 4:` therefore never matches. novel-domain falls back to the slug,
   and trd-pre-check reports "no requirements declared" and passes trivially. The 54-07 SUMMARY recorded this as a follow-up.
   Make `objectiveNumPattern` itself tolerate leading zeros, so every caller benefits: novel-domain, trd-pre-check, roadmap,
   objective, workstreams and project-bootstrap.
3. **Shared label pattern.** Add `boldLabelPattern(label)` to text-escape.cjs. TRDs 56-03 and 56-04 (wave 2) use it to read
   `**Requirements**:`, `**Goal**:` and `**Depends on**:`, the v1.5 ROADMAP form, as well as `**X:**`.

Purpose: later objectives in v1.5 (57 calibration, 59 milestone stats) walk objectives through these lookups.
Output: `objectiveDirMatches` in helpers.cjs, five call sites switched, `objectiveNumPattern` made zero-tolerant,
`boldLabelPattern` added.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(56-02): ...` commit (RED) before the `fix(56-02): ...` / `feat(56-02): ...` commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Use one plain command per Bash call.
- Fixtures are hand-built: mkdtemp projects with literal directory names and literal ROADMAP text. Do not use generated data or property-based tests.
- Do NOT touch the files TRD 56-01 owns in this wave (state, gh-hierarchy, planning-verbs, planning-entity-verbs, frontmatter,
  stack-verify, watcher-daemon, stack-ci, planning-import, hooks/gate-executor-stop.js). Do not touch `trd-pre-check.cjs`,
  `roadmap.cjs` or `novel-domain.cjs` source either. This TRD changes only their behaviour through text-escape.cjs and adds tests.
- `text-escape.cjs` must keep requiring nothing (hooks load it on every call). Keep `escapeRegExp`'s body byte-identical.
  CodeQL recognises that shape as a sanitizer (54-01 SUMMARY).

## Test list

Outermost first.

Directory lookups (objective.test.cjs, new `describe('56-02 objective directory lookups are exact')`. Spawn the repo's
`df-tools.cjs` the way the file's existing tests do):
1. Only `04.10-ten` exists: `find-objective 4.1` gives `found:false`. RED (it returns `04.10-ten`).
2. `04.1-one` and `04.10-ten` exist: `find-objective 4.1` gives `.planning/objectives/04.1-one` (guard).
3. Only `04.1-x` exists: `find-objective 4` gives `found:false`. RED.
4. Only `045-x` exists: `find-objective 4` gives `found:false`. RED.
5. Current `04.10-ten` and archived `.planning/milestones/v1.2-objectives/04.1-one`: `find-objective 4.1` (it uses the
   current directory only) gives `found:false`. `findObjectiveInternal(root, '4.1')` (require objective.cjs) returns
   `directory` ending `v1.2-objectives/04.1-one` with `archived: 'v1.2'`. RED for the internal call.
6. Only `04.10-ten`: `objectives list --objective 4.1 --type jobs` gives `objective_dir: null` and `error: 'Objective not found'`. RED.
7. Only `04.10-ten` (with a `04.10-01-TRD.md`): `objective-job-index 4.1` gives `error: 'Objective not found'` and `jobs: []`. RED.
8. The full directory name `04.1-one` as the argument resolves to itself (guard). A non-numeric `a(` with a directory `a(-thing`
   still resolves (guard; novel-domain test 25b also pins it).
9. Static guard: no production `.cjs` under `bin/lib` (skip `*.test.cjs` and `__fixtures__`) matches
   `/\.startsWith\(\s*(normalized|padded)\s*\)/`. RED today: objective.cjs:16,142,221 and misc.cjs:244.

objectiveDirMatches (unit, same describe):
10. `('04.1-one','04.1')` is true, `('04.1','04.1')` is true, `('04.10-ten','04.1')` is false, `('04.1-one','04')` is false,
    `('045-x','04')` is false, `('04-a','04')` is true.

objectiveNumPattern / boldLabelPattern (text-escape.test.cjs, continue the TE numbering at TE-18):
11. TE-18: `'04'` matches `Objective 4:` and `Objective 04:`. `'4'` matches `Objective 04:` and `Objective 004:`. RED.
12. TE-19: `'04.1'` matches `Objective 4.1:` and `Objective 04.1:`, and not `Objective 4.10`, `Objective 41`, `Objective 4.1.2`. RED.
13. TE-20: `'4'` and `'04'` never match `Objective 14:`, `Objective 40`, `Objective 041:`, `Objective 4.1`. Same for `| 14. x` with
    the table prefix `\|\s*`.
14. TE-21: `'0'` matches `Objective 0:` and `Objective 00:` and not `Objective 05:` or `Objective 10:`.
15. TE-22: non-numeric input stays literal with no zero prefix: `objectiveNumPattern('a(')` equals
    `escapeRegExp('a(') + '(?!\\.?\\d)'`.
16. TE-7..TE-11 pass unchanged.
17. TE-23: `boldLabelPattern('Goal') + '\\s*([^\\n]+)'` captures `X` from `**Goal:** X` and from `**Goal**: X`. It does not match
    `**Goals:** X`, `**Goal** X` or `Goal: X`.
18. TE-24: `boldLabelPattern('Depends on')` matches `**Depends on**: Objective 4`. `boldLabelPattern('a(b')` compiles and matches
    `**a(b:** y`.

ROADMAP integration (single-digit objectives, the case 54-07 could not reach):
19. novel-domain.test.cjs: directory `04-thing`, ROADMAP `### Objective 4: Thing` with "Use `left-pad` for padding."
    `detect novel-domain 4 --raw` gives `signals.new_dep.candidates` including `left-pad`. RED (description falls back to the slug).
20. novel-domain.test.cjs: directory `04.1-dec` and ROADMAP `### Objective 41`, `### Objective 4.10`, `### Objective 4.1` each
    naming a different package. Only `right-pkg` is a candidate. RED.
21. trd-pre-check.test.cjs: directory `04-test`, ROADMAP `### Objective 4: T` + `**Requirements:** [F1, F2]`, and one TRD
    covering F1. `requirement_coverage` gives `passed:false, missing:['F2']`. RED (today `found:false` passes trivially).
22. trd-pre-check.test.cjs: the same with the heading written `### Objective 04: T` gives the same result (guard).

<embedded_context>

<codebase_examples>
Normalization (helpers.cjs:203). `normalized` is a two-digit-padded number, or the raw argument when it has no leading digits:

```js
function normalizeObjectiveName(objective) {
  const match = objective.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return objective;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}
```

The new helper. Put it beside normalizeObjectiveName and export it:

```js
/**
 * True when `dirName` is the directory of objective `normalized` (from normalizeObjectiveName): the bare name or the name
 * followed by `-`. `04.1` never selects `04.10-ten`; `04` never selects `04.1-x` or `045-x`.
 */
function objectiveDirMatches(dirName, normalized) {
  return dirName === normalized || dirName.startsWith(normalized + '-');
}
```

The exact rule already in use (objective.cjs:650, roadmap.cjs:263, workstreams.cjs:60):

```js
targetDir = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
```

Sites to switch (all `dirs.find(d => d.startsWith(normalized))`): objective.cjs:16 (searchObjectiveInDir), :142
(cmdFindObjective), :221 (cmdObjectivesList), and misc.cjs:244 (cmdObjectiveJobIndex). Also switch objective.cjs:650 so there is
one definition. In cmdObjectivesList with `--include-archived`, entries look like `04.1-one [v1.2]`. Strip a trailing
` [vX.Y]` before matching: `objectiveDirMatches(d.replace(/ \[v[\d.]+\]$/, ''), normalized)`.

objectiveNumPattern today (text-escape.cjs:16) and the target:

```js
// today
function objectiveNumPattern(n) {
  return `${escapeRegExp(n)}(?!\\.?\\d)`;
}
// target: a numeric id matches with any number of leading zeros; a non-numeric id stays literal
function objectiveNumPattern(n) {
  const s = String(n);
  if (!/^\d/.test(s)) return `${escapeRegExp(s)}(?!\\.?\\d)`;
  return `0*${escapeRegExp(s.replace(/^0+(?=\d)/, ''))}(?!\\.?\\d)`;
}

/** A markdown bold label as a RegExp source fragment: `**Goal:**` and `**Goal**:` both match; the label is escaped. */
function boldLabelPattern(label) {
  return `\\*\\*${escapeRegExp(label)}(?::\\*\\*|\\*\\*:)`;
}
```

Every caller places the pattern after `Objective\s+`, `\|\s*` or `^`. None of them can let `0*` absorb a digit of a preceding
number (`\s+` / `\s*` cannot skip the `1` of `14`). Callers: novel-domain.cjs:333, trd-pre-check.cjs:132,
roadmap.cjs:106/147/282/381, objective.cjs:743/877/904, workstreams.cjs:49/358/364/398, project-bootstrap.cjs:158.

Test harness conventions: objective.test.cjs uses `tmpProject()` plus `fs.mkdirSync(path.join(project, '.planning',
'objectives', dir), { recursive: true })` and spawns df-tools (see its `describe('54-06 ...')` block near :990).
novel-domain.test.cjs uses `createTmp()`, `runCmd(tmpDir, objective, raw)` and `makePackageJson`. trd-pre-check.test.cjs uses
`setupObjectiveDir(tmpDir, {objective, roadmap_requirements, trds})` + `runCheck(tmpDir, objective)`, and overwrites
ROADMAP.md when a test needs an exact heading (see 'decimal 14.1 ignores a preceding 14.10 section').
</codebase_examples>

<anti_patterns>
- Do not "fix" lookups by sorting differently. `04.1-one` already sorts before `04.10-ten`. The bug is the bare prefix test,
  which shows when the right directory is absent or archived.
- Do not add zero-stripping at individual call sites (novel-domain, trd-pre-check). The fix belongs in the shared pattern.
- Do not change the `(?!\.?\d)` trailing boundary. TE-7..TE-11 pin it.
- Do not edit the existing 54-07 tests that deliberately use `14.1`. Add the single-digit cases beside them.
</anti_patterns>

<error_recovery>
- Making objectiveNumPattern zero-tolerant changes behaviour at about 14 call sites. After Task 2 GREEN, run
  `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/workstreams.test.cjs plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs`.
  If a test there asserted that `04` does NOT match `4`, stop and report it as a deviation rather than weakening the pattern.
- If `find-objective` output changes for an existing test (df-tools.test.cjs, summary-pairing.test.cjs), check whether
  that test relied on prefix leakage. Fix the fixture only if it named a directory that is not the objective it asked for.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/text-escape.cjs
@.planning/objectives/54-codeql-cleanup/54-07-SUMMARY.md
</context>

<gotchas>
- `searchObjectiveInDir` is exported (objective.cjs module.exports) and used through `findObjectiveInternal` by init,
  novel-domain, trd-pre-check, roadmap and gh code. A found-to-not-found change is intended for the wrong-prefix cases only.
- `cmdObjectivesList` sorts with parseFloat, so `04.1` and `04.10` compare as 4.1 vs 4.1. Exactness must come from
  objectiveDirMatches, not the sort.
- The worktree-isolation harness guard refuses compound Bash commands. Use one plain command per call with absolute paths.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built objective-tree fixtures + objectiveDirMatches at every directory lookup (ONUM-02)</name>
  <files>plugins/devflow/devflow/bin/lib/helpers.cjs, plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/objective.test.cjs</files>
  <action>
Fixture builder first. In objective.test.cjs add `objectiveTree(project, { current: [dirs...], archived: { 'v1.2': [dirs...] },
files: { '<dir>': ['04.10-01-TRD.md'] } })`. It creates each directory (archived ones under
`.planning/milestones/<v>-objectives/`) and empty named files. Every name is written literally by the test.

RED: write tests 1-10 from the Test list in a new `describe('56-02 objective directory lookups are exact')`. Commit
`test(56-02): objective lookups never select a longer number's directory`.

GREEN:
- helpers.cjs: add and export `objectiveDirMatches` (codebase_examples).
- objective.cjs: import it. Replace the finds at :16, :142 and :221 (strip the ` [vX.Y]` archive suffix at :221) and the
  inline rule at :650 with `objectiveDirMatches(d, normalized)`.
- misc.cjs: import it and replace :244.
Commit `fix(56-02): objective lookups match the exact directory (objectiveDirMatches)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` passes. `rg -n "startsWith\((normalized|padded)\)" plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` prints nothing.</verify>
  <done>Tests 1-10 pass. Tests 1, 3-7 and 9 went RED then GREEN. `4.1` never resolves to `04.10-*` in find-objective, findObjectiveInternal, objectives list or objective-job-index.</done>
  <recovery>If df-tools.test.cjs regresses, run it alone with `--test-name-pattern` on the failing name. Inspect its fixture directories: a fixture whose directory name differs from the requested number was relying on the bug. Fix the fixture name, not the matcher.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Leading-zero-tolerant objectiveNumPattern + boldLabelPattern, proven through novel-domain and trd-pre-check (ONUM-03)</name>
  <files>plugins/devflow/devflow/bin/lib/text-escape.cjs, plugins/devflow/devflow/bin/lib/text-escape.test.cjs, plugins/devflow/devflow/bin/lib/novel-domain.test.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</files>
  <action>
RED: add TE-18..TE-24 to text-escape.test.cjs (`describe('objectiveNumPattern')` and a new `describe('boldLabelPattern')`).
Add tests 19-20 to novel-domain.test.cjs, in the 'ROADMAP header regex' describe, numbered 27 and 28. Add tests 21-22 to
trd-pre-check.test.cjs beside 'decimal 14.1 ignores a preceding 14.10 section'. Build each ROADMAP and directory literally in
the test (hand-built fixture text). Commit `test(56-02): single-digit objectives find their ROADMAP section with or without a
leading zero`.

GREEN: in text-escape.cjs replace `objectiveNumPattern` with the target from codebase_examples, add `boldLabelPattern`, and
export it: `module.exports = { escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell }`. Update the file header comment
to mention both. Leave `escapeRegExp` byte-identical. Commit
`fix(56-02): objectiveNumPattern tolerates leading zeros; add boldLabelPattern`.

Then run the callers' suites listed in error_recovery.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs plugins/devflow/devflow/bin/lib/novel-domain.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/workstreams.test.cjs plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs` passes. `node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/text-escape.cjs')))"` prints the four exports.</verify>
  <done>Tests 11-22 pass. TE-18, TE-19, TE-21, TE-23, TE-24 and tests 19-21 went RED then GREEN. The callers' suites pass unchanged, and text-escape.cjs still requires nothing.</done>
  <recovery>If a caller suite fails because `0*` changed a match, compare that regex's prefix. A pattern placed after something other than `Objective\s+`, `\|\s*` or `^` needs a look at whether a zero can be absorbed. Report it in the SUMMARY as a deviation and fix that caller only if it is in this TRD's files; otherwise leave it for the owning TRD.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs plugins/devflow/devflow/bin/lib/novel-domain.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 2 (objective side): with `04.1-one` and `04.10-ten`, every objective lookup of `4.1` returns `04.1-*`. With
  only `04.10-ten`, it returns not found. (The roadmap side, `roadmap get-objective 4.1`, was pinned by 54-06 roadmap.test.cjs
  test 2 and is unchanged.)
- Success criterion 3: novel-domain and trd-pre-check find `### Objective 4:` and `### Objective 04:` for an `04-*` objective.
- `boldLabelPattern` is exported for TRDs 56-03 and 56-04.
</verification>

<success_criteria>
- ONUM-02 and ONUM-03 hold, with RED-then-GREEN tests for each.
- One directory-match rule (`objectiveDirMatches`) and one heading-number rule (`objectiveNumPattern`).
</success_criteria>

<output>
After completion, publish `56-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Record the final `objectiveNumPattern` and `boldLabelPattern` source, because TRDs 56-03 and 56-04 build on them.
</output>
