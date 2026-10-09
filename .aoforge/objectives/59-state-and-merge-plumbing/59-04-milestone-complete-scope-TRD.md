---
objective: 59-state-and-merge-plumbing
trd: "04"
type: standard
wave: 2
depends_on: ["59-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/milestone-scope.cjs
  - plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
autonomous: true
requirements: [PLMB-04, PLMB-05]
must_haves:
  truths:
    - "`milestone complete vX.Y` counts objectives, plans and tasks only for the objectives the ROADMAP `## Milestones` bullet for vX.Y names (the same selection `estimate milestone` uses); earlier and later milestones' directories on disk are not counted"
    - "The base MILESTONES.md entry reads `**Objectives completed:** N objectives (list), J plans, T tasks` and its accomplishments are the one-liners of those objectives' SUMMARYs, read from frontmatter `one-liner` or the template's bold line under the H1"
    - "Cancelled objectives (OBJECTIVE.md `status: cancelled`) are reported, not counted; `--archive-objectives` moves only the milestone's directories"
    - "With no bullet for the version the scope falls back to the ROADMAP's `### Objective N:` sections, and with no ROADMAP.md to every objective directory, and the output says which (`scope_source`)"
    - "`state_updated` is true only when STATE.md's bytes changed; STATE.md is not rewritten when nothing changes"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/milestone-scope.cjs
      provides: "selectMilestoneObjectives / milestoneObjectiveNumbers moved out of estimate-milestone.cjs unchanged, plus sectionObjectives(cwd) and currentDirObjectives(cwd) for the fallbacks"
    - path: plugins/devflow/devflow/bin/lib/roadmap.cjs
      provides: "cmdMilestoneComplete scoped to the milestone, task count from the TRDs' task elements, one-liner extraction, truthful state_updated"
    - path: plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
      provides: "spawn-level tests on a two-milestone fixture project"
  key_links:
    - "roadmap.cmdMilestoneComplete -> (lazy require) milestone-scope.selectMilestoneObjectives -> roadmap.parseMilestoneBullets / pickMilestone"
    - "estimate-milestone.cjs re-exports milestoneObjectiveNumbers and selectMilestoneObjectives from milestone-scope.cjs (estimate-milestone.test.cjs unchanged)"
    - "milestone-scope objective lookups -> helpers.objectiveDirMatches / text-escape.objectiveNumPattern (objective 56)"
---

# TRD 59-04: `milestone complete` counts only the milestone's objectives (PLMB-04, PLMB-05 part)

<objective>
`cmdMilestoneComplete` counts every directory under `.planning/objectives/`. This repository keeps the directories of
earlier milestones there (42-54 belong to v1.4, 55-64 to v1.5), so the stats and the base MILESTONES.md entry are wrong
and get hand-written (v1.4's entry says "13 objectives (42–54), 158 TRDs" by hand). Two more defects sit beside it:
accomplishments read only a frontmatter `one-liner` that the SUMMARY template never writes (the one-liner is the bold
line under the H1), and tasks are counted from `## Task N` headings no current SUMMARY has. And `state_updated` is
`fs.existsSync(statePath)` — true even when nothing changed (PLMB-05).

Objective 58 already solved milestone scope for `estimate milestone`: `selectMilestoneObjectives(cwd, {version})` reads the
`## Milestones` bullet ("Objectives 42–54"), keeps the numbers that have a directory or a section, flags cancelled ones,
and matches directories exactly (objective 56 lookups). This TRD moves that selection into its own module so a core verb
does not load the estimator, and makes `milestone complete` use it.

Purpose: success criteria 4 and (half of) 5. Output: milestone-scope.cjs, the rewritten counting in roadmap.cjs, tests,
fixtures.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── milestone-scope.cjs                         ← CREATE (selection moved from estimate-milestone.cjs)
├── estimate-milestone.cjs                      ← MODIFY (require + re-export; no behaviour change)
├── roadmap.cjs                                 ← MODIFY (cmdMilestoneComplete)
├── milestone-complete.test.cjs                 ← CREATE
└── __fixtures__/milestone-complete-fixtures.cjs ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commits before GREEN commits. The move (Task 2) is a refactor: estimate-milestone.test.cjs must pass
  before and after with no edits.
- Hand-built fixtures in temp dirs; never run `milestone complete` against this repository's `.planning/` (it archives
  and appends to MILESTONES.md). 59-07 dogfoods it on a scratch copy.
- The existing `milestone complete` tests in `df-tools.test.cjs` must pass unchanged (they are not in this TRD's files).
- This TRD runs in a parallel wave; address your CHECKOUT explicitly if the dispatch provisioned a worktree. One plain
  command per Bash call; commit through `node plugins/devflow/devflow/bin/df-tools.cjs commit ... --files ...`.

## Test list

Fixture: a two-milestone project. ROADMAP `## Milestones`:
`- ✅ **v0.9 — Old** — Objectives 1–3 (shipped 2026-01-01)` and `- 🚧 **v1.0 — Now** — Objectives 4–6 (in progress)`,
`### Objective N:` sections for 4-7. Directories: `01-a`, `02-b`, `03-c` (old milestone, each 1 TRD + SUMMARY),
`04-d` (TRDs 04-01 with 3 tasks and 04-02 with 2 tasks, both with template-shaped SUMMARYs whose bold one-liners are
`Alpha shipped` and `Beta shipped`), `05-e` (TRD 05-01 with 1 task; SUMMARY with frontmatter `one-liner: Gamma shipped`),
`06-f` (OBJECTIVE.md `status: cancelled`, no TRDs), `07-g` (next milestone, 1 TRD, no SUMMARY), `40-decoy` (1 TRD +
SUMMARY, outside every range). Narrative STATE.md with `**Status:**`, `**Last Activity:**`; REQUIREMENTS.md.

`milestone-complete.test.cjs` (spawns the real binary, fake HOME):

1. `milestone complete v1.0 --name Now` → `objectives: 2`, `objective_numbers: ["4", "5"]`, `jobs: 3`, `tasks: 6`,
   `cancelled: ["6"]`, `scope_source: "milestone bullet"`.
2. MILESTONES.md gains `**Objectives completed:** 2 objectives (4, 5), 3 plans, 6 tasks` and exactly the accomplishments
   `Alpha shipped`, `Beta shipped`, `Gamma shipped` — nothing from 01-03, 07-g or 40-decoy.
3. A TRD whose body has the `<tasks>` wrapper plus three task elements counts 3 (the wrapper never counts).
4. Version with no bullet (ROADMAP with sections only, as the df-tools.test.cjs fixture) → every section's objective that
   has a directory, `scope_source: "roadmap sections"`.
5. No ROADMAP.md → every current objective directory, `scope_source: "objective directories"`.
6. `--archive-objectives` moves `04-d`, `05-e`, `06-f` into `milestones/v1.0-objectives/`; `01-a`..`03-c`, `07-g` and
   `40-decoy` stay; `archived.objectives: true`.
7. PLMB-05: STATE.md without `**Status:**`, `**Last Activity:**` or `**Last Activity Description:**` → `state_updated:
   false` and STATE.md bytes and mtime unchanged; with the fields → `true`; a second run the same day → `false`; no
   STATE.md → `false`.
8. A SUMMARY whose bold line is still the template placeholder (`**[Substantive one-liner ...]**`) contributes nothing.
9. The scope is exact: `40-decoy` shares the leading digit `4` but is objective 40, outside 4–6, and is never counted
   or archived (directories are keyed by their full number, as objective 56's lookups require).

Regression: `node --test plugins/devflow/devflow/bin/df-tools.test.cjs --test-name-pattern "milestone complete"` and
`estimate-milestone.test.cjs` pass unchanged.

<embedded_context>

<codebase_examples>
The counting to replace (`lib/roadmap.cjs` `cmdMilestoneComplete`):

```js
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    for (const dir of dirs) {
      objectiveCount++;                                   // every directory, any milestone
      const plans = findPlanFiles(objectiveFiles);
      ...
          if (fm['one-liner']) accomplishments.push(fm['one-liner']);   // template never writes this key
          const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];  // no current SUMMARY has these
  ...
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Objectives completed:** ${objectiveCount} objectives, ${totalJobs} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;
  ...
    state_updated: fs.existsSync(statePath),
```

The selection to move (`lib/estimate-milestone.cjs`): `milestoneObjectiveNumbers`, `inScope`, `scopeIntegers`,
`roadmapSections`, `objectiveDirectories`, `isCancelled`, `selectMilestoneObjectives`, the constants `NUM`, `ITEM`,
`OBJECTIVES_TEXT_RE`, `ITEM_RE`, `SECTION_RE`, `DIR_RE`, `MAX_RANGE_WIDTH`, `canonical`, `byNumber`. It requires
`{ parseMilestoneBullets, pickMilestone }` from roadmap.cjs, `getArchivedObjectiveDirs` from objective.cjs and
`extractFrontmatter`. `selectMilestoneObjectives(cwd, {version})` returns `{version, name, range_source, objectives:
[{number, name, dir, status_hint: 'cancelled' | 'no_dir' | 'dir'}], absent}` and throws `ROADMAP.md not found`,
`no milestone in ROADMAP.md` or `milestone v<d> not in ROADMAP.md`.

The SUMMARY template's one-liner (`templates/summary.md`):

```
---
...frontmatter...
---

# Objective [X]: [Name] Summary

**[Substantive one-liner describing outcome - NOT "objective complete" or "implementation finished"]**
```

Task counting rule: reuse the regex in `trd-pre-check.cjs countTasks` (it matches each opening task tag, and its `\b`
after the tag name keeps the `<tasks>` wrapper out). Copy that regex literal from the source; it is not reproduced here
because this TRD's own task counter would count it. Count all tasks, checkpoints included.
</codebase_examples>

<anti_patterns>
- Do not require milestone-scope.cjs at the top of roadmap.cjs: milestone-scope requires roadmap.cjs, so require it lazily
  inside cmdMilestoneComplete (load-cycle safe).
- Do not change estimate-milestone.cjs behaviour or its export names; it re-exports the moved functions.
- Do not count an objective by `parseInt(dir)` prefix; use the `dir` the selection returns.
- Do not write MILESTONES.md or STATE.md from a test against this repository.
</anti_patterns>

<error_recovery>
- If estimate-milestone.test.cjs fails after the move, diff the moved text against `git show HEAD:<path>`; the move must
  be verbatim apart from the require lines.
- If the df-tools.test.cjs milestone test "archives roadmap, requirements, creates MILESTONES.md" fails on the objective
  count, check the sections fallback: its ROADMAP is `# Roadmap v1.0 MVP` + `### Objective 1: Foundation`, no bullet, and
  `01-foundation` exists, so the fallback must count 1.
</error_recovery>

</embedded_context>

<gotchas>
- `objectives` (the count) excludes cancelled and `no_dir` entries; `cancelled` and `absent` list them. Keep the existing
  output keys (`version`, `name`, `date`, `objectives`, `jobs`, `tasks`, `accomplishments`, `archived`,
  `milestones_updated`, `state_updated`) and add `objective_numbers`, `cancelled`, `absent`, `scope_source`.
- `dir` from the selection may be an archived path (`.planning/milestones/vX-objectives/NN-x`); count from it, but
  `--archive-objectives` moves only directories that live under `.planning/objectives/`.
- With zero objectives the line is `**Objectives completed:** 0 objectives, 0 plans, 0 tasks` (no parenthesised list).
- Placeholder one-liners start with `[`; skip them. Strip the `**` and trim.
- The STATE.md write: compute the replaced text, compare, write only if it differs (`state_updated` = differs).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Two-milestone fixture builder</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs</files>
  <action>
Hand-built builders:
- `trdWithTasks(objectiveDir, nn, taskCount)` → TRD text with valid frontmatter, a `<tasks>` wrapper and `taskCount`
  auto task elements (the same element shape as `taskElement` in `__fixtures__/estimate-fixtures.cjs`).
- `templateSummary(objectiveDir, nn, oneLiner)` → SUMMARY text in the template shape (frontmatter without `one-liner`,
  H1, blank line, `**<oneLiner>**`). `frontmatterSummary(objectiveDir, nn, oneLiner)` → `one-liner:` in frontmatter.
- `TWO_MILESTONE_SPEC` (frozen) and `makeMilestoneProject(spec = TWO_MILESTONE_SPEC, { roadmap = true, state })` → temp
  project with the directories, files, ROADMAP, STATE.md and REQUIREMENTS.md described in the test list; returns
  `{ root, read(rel), exists(rel), cleanup() }`.
Commit `test(59-04): two-milestone fixture builder`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs'); const p=f.makeMilestoneProject(); console.log(require('fs').readdirSync(p.root+'/.planning/objectives').join(',')); p.cleanup()"` lists 01-a..07-g and 40-decoy.</verify>
  <done>The builder creates the fixture in a temp dir and removes it.</done>
  <recovery>If a later test needs a variant, add an option to makeMilestoneProject rather than copying the spec.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Move milestone selection into milestone-scope.cjs (refactor, then fallbacks)</name>
  <files>plugins/devflow/devflow/bin/lib/milestone-scope.cjs, plugins/devflow/devflow/bin/lib/estimate-milestone.cjs, plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs</files>
  <action>
Refactor first (green to green): move the selection code listed above verbatim into `milestone-scope.cjs` with a header
comment (moved from estimate-milestone.cjs in TRD 59-04; one selection for estimates and milestone completion);
estimate-milestone.cjs requires it and keeps `module.exports = { milestoneObjectiveNumbers, selectMilestoneObjectives,
estimateMilestone }`. Run estimate-milestone.test.cjs before and after. Commit
`refactor(59-04): milestone objective selection in its own module`.

RED: in milestone-complete.test.cjs, unit tests for two new exports: `sectionObjectives(cwd)` (every `### Objective N:`
section with a directory, same entry shape, cancelled flagged) and `currentDirObjectives(cwd)` (every directory under
`.planning/objectives/`, same shape). Commit `test(59-04): scope fallbacks`.

GREEN: implement both in milestone-scope.cjs from the existing private helpers (`roadmapSections`,
`objectiveDirectories`, `isCancelled`). Commit `feat(59-04): section and directory scope fallbacks`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs` passes.</verify>
  <done>estimate-milestone.test.cjs passes unchanged before and after the move; the fallback unit tests went RED then GREEN.</done>
  <recovery>If moving creates a load cycle (estimate-milestone -> milestone-scope -> roadmap -> ...), confirm with `node -e "require('./plugins/devflow/devflow/bin/lib/estimate-milestone.cjs')"`; roadmap.cjs must not require milestone-scope at load time.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Scoped stats, true one-liners and task counts, truthful state_updated (tests 1-9)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs</files>
  <action>
RED: tests 1-9. Commit `test(59-04): milestone complete counts only its objectives`.

GREEN in roadmap.cjs:

```
completionScope(cwd, version):
  ms = require('./milestone-scope.cjs')
  try { s = ms.selectMilestoneObjectives(cwd, { version }); return { source: s.range_source, objectives: s.objectives, absent: s.absent } }
  catch (e):
    if /ROADMAP\.md not found/ -> { source: 'objective directories', objectives: ms.currentDirObjectives(cwd), absent: [] }
    if /not in ROADMAP\.md|no milestone in ROADMAP\.md/ -> { source: 'roadmap sections', objectives: ms.sectionObjectives(cwd), absent: [] }
    throw e

summaryOneLiner(text):
  fm['one-liner'] if non-empty
  else the first line after the H1 matching /^\*\*(.+)\*\*\s*$/, unless it starts with '['
  else null

cmdMilestoneComplete:
  scope = completionScope(cwd, version)
  counted = scope.objectives.filter(o => o.dir && o.status_hint === 'dir')
  cancelled = scope.objectives.filter(o => o.status_hint === 'cancelled').map(o => o.number)
  for o of counted: files = readdir(cwd/o.dir); plans = findPlanFiles(files)
     jobs += plans.length; tasks += sum(count of opening task tags in read(plan), countTasks' regex)
     for SUMMARY files (sorted): one = summaryOneLiner(read); if one: accomplishments.push(one)
  entry line: N > 0 ? `${N} objectives (${numbers.join(', ')}), ${jobs} plans, ${tasks} tasks` : `0 objectives, 0 plans, 0 tasks`
  STATE.md: replaced = (three replaces); stateUpdated = replaced !== original; write only then
  --archive-objectives: move only counted + cancelled entries whose dir is under .planning/objectives/
  result += { objective_numbers, cancelled, absent: scope.absent, scope_source: scope.source }, state_updated: stateUpdated
```

Commit `fix(59-04): milestone complete counts only the milestone's objectives`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs` passes, and `node --test --test-name-pattern "milestone complete" plugins/devflow/devflow/bin/df-tools.test.cjs` passes unchanged.</verify>
  <done>Tests 1-9 went RED then GREEN; the df-tools.test.cjs milestone tests and estimate-milestone tests pass without edits.</done>
  <recovery>If `selectMilestoneObjectives` throws for a version whose bullet exists but names no objectives, it already falls back to sections inside (range_source 'roadmap sections'); do not double-handle it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-04: tests 1-2 show stats and the base entry counting only v1.0's objectives in a project that also holds v0.9's
  and the next milestone's directories.
- PLMB-05 (milestone half): test 7 shows `state_updated` tracking a real change.
</verification>

<success_criteria>
- 9 named tests plus the fallback unit tests pass; df-tools.test.cjs and estimate-milestone tests unchanged and green;
  full `npm test` at baseline.
</success_criteria>

<output>
After completion, publish `59-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the new output keys; 59-07 compares a scratch-copy run of `milestone complete v1.4` with
the hand-written v1.4 entry (13 objectives, 158 TRDs).
</output>
