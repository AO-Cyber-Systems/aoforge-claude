---
objective: 56-objective-number-correctness
trd: "04"
type: standard
wave: 2
depends_on: ["56-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
  - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
autonomous: true
requirements: [ONUM-03]
must_haves:
  truths:
    - "`roadmap get-objective 56` returns a non-null `goal` for a section written `**Goal**: ...` (v1.5 colon placement) as well as `**Goal:** ...`"
    - "`roadmap analyze` reports `goal` and `depends_on` for both `**Goal**:` / `**Goal:**` and `**Depends on**:` / `**Depends on:**`"
    - "getRoadmapObjectiveInternal (init plan-objective, gh-pr, gh) and gh readObjectiveState return the goal for `**Goal**:` sections"
    - "bootstrapObjectiveMd writes the ROADMAP goal into a new OBJECTIVE.md for a `**Goal**:` section instead of the `_(extract from ROADMAP.md ...)_` placeholder"
    - "A section with no Goal never borrows the next section's `**Goal**:`"
    - "`roadmap get-objective 4` finds `### Objective 04:`, and project-bootstrap finds `### Objective 05:` for `05-*`, through 56-02's zero-tolerant objectiveNumPattern"
    - "roadmap-reconcile's progress-row matcher uses objectiveNumPattern instead of a hand-built `N|0N` alternation, and still updates `| 5 |`, `| 05 |`, `| Objective 5 |` but never `| 15 |` or `| 50 |`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/roadmap.cjs
      provides: "Goal (x3) and Depends on read via boldLabelPattern"
    - path: plugins/devflow/devflow/bin/lib/gh.cjs
      provides: "listObjectives Goal via boldLabelPattern"
    - path: plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
      provides: "bootstrapObjectiveMd Goal via boldLabelPattern"
    - path: plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
      provides: "_updateProgressTable row matcher via objectiveNumPattern"
  key_links:
    - "roadmap get-objective / analyze / getRoadmapObjectiveInternal -> text-escape.boldLabelPattern('Goal' | 'Depends on')"
    - "init plan-objective -> project-bootstrap.bootstrapObjectiveMd -> boldLabelPattern('Goal') -> OBJECTIVE.md ## Goal"
    - "gh sync -> readObjectiveState -> listObjectives -> boldLabelPattern('Goal') -> issue body goal"
---

# TRD 56-04: ROADMAP field labels with the colon outside the bold (plan-time fix, attached to ROADMAP lookups)

<objective>
Read `**Goal**:` and `**Depends on**:`, the v1.5 ROADMAP form, everywhere df-tools reads `**Goal:**` and `**Depends on:**`.

This defect was found at plan time and has no requirement ID. The user locked it into this objective and attached it to the
TRD that touches the ROADMAP lookups. `requirements: [ONUM-03]` records that attachment: this TRD also pins ONUM-03 at the
roadmap and bootstrap level. No new requirement ID is created.

Today `roadmap.cjs` matches `/\*\*Goal:\*\*\s*([^\n]+)/i` at :118, :193 and :246, and `/\*\*Depends on:\*\*/` at :249.
`gh.cjs:651` and `project-bootstrap.cjs:168` use the same Goal pattern. The v1.5 ROADMAP writes `**Goal**: ...`, so
`roadmap get-objective 56` and `roadmap analyze` report `goal: null` for every v1.5 objective. `init plan-objective` scaffolded
objective 56's OBJECTIVE.md with the `_(extract from ROADMAP.md "### Objective N:" entry)_` placeholder. gh issue bodies lose
the goal as well.

Survey of the other field parsers (done at plan time):
- `**Success Criteria**`: `\*\*Success Criteria\*\*[^\n]*:` already accepts both forms. Leave it.
- `**Requirements**`: TRD 56-03 fixes it (trd-pre-check, objective complete).
- `**Depends on**`: roadmap analyze (here) and objective remove's renumber (56-03). workstreams.cjs already accepts both forms.

Also route roadmap-reconcile's progress-row matcher through `objectiveNumPattern`. That removes the last hand-built
objective-number alternation in a ROADMAP regex.

Purpose: ROADMAP-derived goals feed planning (init, OBJECTIVE.md bootstrap), gh issue bodies and status.
Output: four modules read both label forms through `boldLabelPattern`, and roadmap-reconcile uses the shared number pattern.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(56-04): ...` commit (RED) before the `fix(56-04): ...` / `refactor(56-04): ...` commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Use one plain command per Bash call.
- Fixtures are hand-built: literal ROADMAP text in the v1.5 shape (copy the Objective 56 section's field lines). Do not use
  generated data or property-based tests.
- Requires 56-02 (`boldLabelPattern`, the zero-tolerant `objectiveNumPattern`). Do not edit text-escape.cjs.
- Do NOT touch trd-pre-check.cjs, objective.cjs, misc.cjs or requirement-ids.cjs. TRD 56-03 owns them in this wave.
- Out of scope; record these in the SUMMARY as follow-ups and do not fix them here: roadmap-progress's `**Jobs:**` line
  (v1.5 writes `**TRDs**:`, a different label), roadmap-reconcile's `**Status:**` read and write (its writer emits
  `**Status:**`, and v1.5 sections have no Status line), and `_findObjectiveSections`' integer-only `### Objective (\d+):`.

## Test list

Outermost first.

roadmap (roadmap.test.cjs, spawned `run([...], project)` and a direct require for the internal helper):
1. v1.5 section:
   ```
   ### Objective 56: Objective-number correctness

   **Goal**: Objective lookups resolve exactly the objective asked for.
   **Requirements**: ONUM-01, ONUM-02
   **Depends on**: Nothing (Objective 55 shipped)
   **Success Criteria** (what must be TRUE):
     1. No df-tools module hand-rolls a regex escape.
   ```
   `roadmap get-objective 56` returns `goal: 'Objective lookups resolve exactly the objective asked for.'`, and
   `success_criteria` has one item. RED for goal.
2. The same ROADMAP plus `### Objective 57: Next` with `**Goal:** Old form.` and `**Depends on:** Objective 56`:
   `roadmap analyze --raw` reports 56 with the v1.5 goal and `depends_on: 'Nothing (Objective 55 shipped)'`, and 57 with
   `'Old form.'` and `'Objective 56'`. RED for 56.
3. `require('./roadmap.cjs').getRoadmapObjectiveInternal(project, '56').goal` is the v1.5 goal. RED.
4. `### Objective 58: No goal` (no Goal line) followed by `### Objective 59: X` with `**Goal**: Borrowed?`: get-objective 58 gives
   `goal: null` (guard).
5. Heading `### Objective 04: Four` with `**Goal**: Fourth.`: `roadmap get-objective 4` gives `found:true`, `goal:'Fourth.'`.
   This passes once 56-02 and this TRD are in, and pins ONUM-03 at roadmap level.
6. The existing 54-06 tests (get-objective 4.1 vs 4.10, analyze boundaries) pass unchanged.

gh (gh-sync.test.cjs):
7. Rewrite the fixture ROADMAP's `02-a` section to `**Goal**: Build a`. `gh.readObjectiveState('02-a', root).goal` is `'Build a'`. RED.

project-bootstrap (project-bootstrap.test.cjs, `makeRepo` + `bootstrapObjectiveMd`):
8. O12: `### Objective 5: Foo Bar` + `**Goal**: baz quux integration layer` gives a stub that contains `baz quux integration layer`
   and not `_(extract from ROADMAP.md`. RED.
9. O13: `### Objective 05: Foo Bar` + `**Goal:** baz` for dir `05-foo-bar` gives `# Foo Bar` and `baz` (guard via 56-02).
10. O6 (`**Goal:**`) passes unchanged.

roadmap-reconcile (roadmap-reconcile.test.cjs, `reconcile._rollupObjectiveStatus(lines, today)`):
11. `### Objective 5: Five`, `**Status:** in flight`, `- [x] 05-01-TRD.md`, then `## Progress` with rows `| 15 | x | in flight |`,
    `| 05 | x | in flight |`, `| 50 | x | in flight |`: only the `| 05 |` row becomes `complete 2026-05-04`. Repeat with `| 5 |`
    and `| Objective 5 |` first cells (guard, pins the swap).

<embedded_context>

<codebase_examples>
`boldLabelPattern` (added by 56-02 to text-escape.cjs) returns a RegExp source fragment that matches `**Label:**` and
`**Label**:`, with the label escaped:

```js
const { objectiveNumPattern, boldLabelPattern } = require('./text-escape.cjs');
const GOAL_RE = new RegExp(boldLabelPattern('Goal') + '\\s*([^\\n]+)', 'i');
const DEPENDS_RE = new RegExp(boldLabelPattern('Depends on') + '\\s*([^\\n]+)', 'i');
```

Hoist the two regexes to module scope in roadmap.cjs and reuse them at :118, :193, :246 and :249. In gh.cjs:651 and
project-bootstrap.cjs:168, build the same Goal regex locally. Keep project-bootstrap's case-sensitivity: it has no `i` flag
today, so leave the flag off there.

An existing parser that already accepts both forms (workstreams.cjs:31-35), shown for comparison:

```js
// Match both **Depends on:** and **Depends on**:
const dependsMatch = section.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
```

roadmap-reconcile `_updateProgressTable` (:322-326) today and target:

```js
const paddedNum = String(objectiveNum).padStart(2, '0');
const objMatch = line.match(
  new RegExp(`^\\s*\\|\\s*(Objective\\s+${objectiveNum}|Objective\\s+${paddedNum}|${objectiveNum}|${paddedNum})\\s*\\|`, 'i'),
);
// target: one shared, leading-zero-tolerant number rule
const objMatch = line.match(new RegExp(`^\\s*\\|\\s*(?:Objective\\s+)?${objectiveNumPattern(objectiveNum)}\\s*\\|`, 'i'));
```

`objMatch` is only tested for truthiness below, so dropping the capture group is safe. Confirm with
`rg -n "objMatch" plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs`.

Test harnesses: roadmap.test.cjs `tmpProject()`, `writeRoadmap(project, text)`, `run(args, project)` with `r.json`.
gh-sync.test.cjs has a module-level `root` fixture with objectives `02-a` and `02.1-b` and a ROADMAP with `**Goal:** Build a`
(:29). Overwrite that ROADMAP inside the test and restore it afterwards, or build a separate root with the same fixture
helper. project-bootstrap.test.cjs `makeRepo({ projectMd, roadmap, objectives })` (see O6 at :274).
roadmap-reconcile.test.cjs Group RU (:683) calls `reconcile._rollupObjectiveStatus(lines, '2026-05-04')` on a lines array.
</codebase_examples>

<anti_patterns>
- Do not write `(?::\*\*|\*\*:)` inline again. Use `boldLabelPattern` so there is one definition.
- Do not widen the Goal capture across newlines. `[^\n]+` stays.
- Do not change the Success Criteria regex. It already accepts both forms, and a rewrite risks the structured-array output.
- Do not "fix" roadmap-reconcile's Status read here (see Binding rules).
</anti_patterns>

<error_recovery>
- If gh-sync.test.cjs's shared `root` makes the test order-dependent, build a dedicated root for test 7 instead of mutating
  the shared one.
- If roadmap analyze output changes for an existing fixture, check that fixture's Goal or Depends line for a form that was
  silently ignored before. A newly non-null goal is the intended change; anything else is a regression.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/roadmap.cjs
@plugins/devflow/devflow/bin/lib/text-escape.cjs
@.planning/objectives/56-objective-number-correctness/56-02-SUMMARY.md
</context>

<gotchas>
- `getRoadmapObjectiveInternal` builds its section the same way as `cmdRoadmapGetObjective`: from the header to the next
  `#{2,4} Objective \d` heading. A missing Goal therefore cannot borrow the next objective's (test 4 pins it).
- project-bootstrap stops its section at `\n#{2,4}\s*Objective\s+\d|\n##\s`. Keep that boundary.
- The worktree-isolation harness guard refuses compound Bash commands. Use one plain command per call.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built v1.5 ROADMAP fixture + roadmap.cjs reads **Goal**: and **Depends on**:</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/roadmap.test.cjs</files>
  <action>
Fixture builder first. In roadmap.test.cjs add a `v15Section(num, name, { goal, requirements, dependsOn, criteria, form })`
helper. `form: 'outside'` writes `**Goal**:` and `form: 'inside'` writes `**Goal:**`. It returns the literal lines shown in
Test list item 1.

RED: tests 1-5 in a new `describe('56-04 ROADMAP labels with the colon outside the bold')`. Commit
`test(56-04): roadmap get-objective/analyze read **Goal**: and **Depends on**:`.

GREEN: hoist GOAL_RE and DEPENDS_RE (codebase_examples) and use them at :118, :193, :246 and :249. Commit
`fix(56-04): roadmap reads **Goal**: and **Depends on**: as well as the colon-inside form`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs roadmap get-objective 56` (repo root) prints a non-null goal.</verify>
  <done>Tests 1-3 went RED then GREEN, and tests 4-6 pass. `rg -n -F -e 'Goal:\*\*' -e 'Depends on:\*\*' plugins/devflow/devflow/bin/lib/roadmap.cjs` prints nothing.</done>
  <recovery>If `roadmap get-objective 56` against the live ROADMAP still prints null, the live line may have a variant (extra space, non-ASCII colon). Print it with `rg -n "^\*\*Goal" .planning/ROADMAP.md` and add a hand-built test for that exact form.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh listObjectives, OBJECTIVE.md bootstrap and the reconcile progress row use the shared patterns</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-sync.test.cjs, plugins/devflow/devflow/bin/lib/project-bootstrap.cjs, plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs, plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs, plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs</files>
  <action>
RED: test 7 (gh-sync.test.cjs), tests 8-9 (project-bootstrap.test.cjs, numbered O12 and O13) and test 11 (roadmap-reconcile.test.cjs,
named `RU-56a` and so on). Commit `test(56-04): gh, bootstrap and reconcile read the v1.5 ROADMAP shape`.

GREEN:
- gh.cjs:651: Goal via `boldLabelPattern('Goal')` (import from `./text-escape.cjs`; check whether gh.cjs already imports from it).
- project-bootstrap.cjs:168: Goal via `boldLabelPattern('Goal')`, no `i` flag. Update the comment at :163 to name both forms.
- roadmap-reconcile.cjs `_updateProgressTable`: the target matcher from codebase_examples. Import `objectiveNumPattern`.
Commit `fix(56-04): gh issue goal, OBJECTIVE.md bootstrap goal and the reconcile row matcher use the shared patterns`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs` passes. `rg -n -F 'Goal:\*\*' plugins/devflow/devflow/bin/lib --glob '!*.test.cjs' --glob '!**/__fixtures__/**'` prints nothing. That fixed string is the escaped regex source a colon-inside-only reader uses. Template writers emit a plain `**Goal:**` and do not match.</verify>
  <done>Tests 7-8 went RED then GREEN, and tests 9-11 pass. No df-tools reader of Goal or Depends on depends on the colon placement.</done>
  <recovery>If test 11's `| 50 |` row is updated, the pattern lost its trailing boundary. Check that `objectiveNumPattern(objectiveNum)` is used verbatim, with nothing appended between it and `\s*\|`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs roadmap get-objective 56` prints the objective 56 goal (not null).
- `node plugins/devflow/devflow/bin/df-tools.cjs roadmap analyze --raw` reports a non-null goal for each of objectives 55-64.
- ONUM-03 is pinned at roadmap and bootstrap level: `### Objective 04:` and `### Objective 05:` are found for single-digit objectives.
</verification>

<success_criteria>
- The plan-time `**Goal**:` defect is fixed in every reader (roadmap x3, gh, project-bootstrap) and in `**Depends on**:`
  (roadmap analyze). It is recorded in must_haves, with no new requirement ID.
- roadmap-reconcile's row matcher shares objectiveNumPattern.
</success_criteria>

<output>
After completion, publish `56-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. List the out-of-scope follow-ups from Binding rules (`**Jobs:**` vs `**TRDs**:`, the reconcile Status form, and
integer-only reconcile sections) under "Next".
</output>
