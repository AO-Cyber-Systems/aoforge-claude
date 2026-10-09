---
objective: 58-estimation-engine-and-surfacing
trd: "07"
type: standard
wave: 4
depends_on: ["58-06"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
  - plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
autonomous: true
requirements: [EST-03]
must_haves:
  truths:
    - "estimateMilestone picks the milestone from ROADMAP.md's ## Milestones bullets (the current one by default, or a named version) and reads its objectives from the bullet's 'Objectives A–B, C' text"
    - "Done objectives are counted and left out; cancelled objectives (OBJECTIVE.md status: cancelled) are counted and left out; planned and partial objectives use their remaining-TRD estimate; objectives with no TRDs or no directory use the unplanned fallback"
    - "The milestone total is the correlated sum of the remaining objectives' totals plus one integration-checker spawn, with a confidence label and the weakest objective named"
    - "When the bullet names no objectives, the milestone falls back to every ### Objective section in ROADMAP.md and says so (range_source)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
      provides: "milestoneObjectiveNumbers, selectMilestoneObjectives, estimateMilestone"
    - path: plugins/devflow/devflow/bin/lib/roadmap.cjs
      provides: "parseMilestoneBullets and pickMilestone exported (no behaviour change)"
  key_links:
    - "estimate-milestone -> roadmap.parseMilestoneBullets / pickMilestone, estimate-rollup.estimateObjective / estimateUnplanned (58-06)"
    - "58-08 `df-tools estimate milestone [vX.Y]` -> estimateMilestone"
---

# TRD 58-07: Milestone estimates (EST-03)

<objective>
`estimate milestone` (EST-03) composes the remaining objectives of a milestone and adds milestone-level agent overhead
(one integration-checker spawn, the milestone audit).

Scope comes from the ROADMAP bullet this repo and the template already write:

```
- ✅ **v1.4 — GitHub as system of record, ...** — Objectives 42–54 (completed 2026-10-05; ...)
- 🚧 **v1.5 — Gate & Plumbing** — Objectives 55–64 (in progress)
- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
```

`roadmap.cjs` already parses these bullets (`parseMilestoneBullets`, `pickMilestone`, used by `getMilestoneInfo`) but
does not export them; this TRD exports both unchanged and adds a parser for the "Objectives ..." text.

Per objective in scope: cancelled (OBJECTIVE.md `status: cancelled`) and done objectives are counted and excluded;
planned/partial use `estimateObjective` (remaining TRDs); no TRDs, or a ROADMAP section without a directory, use
`estimateUnplanned`. Objectives run one after another, so the total is `sumCorrelated` of their totals (each fitted from
its p50/P90 per metric) plus the integration checker, one flat list.

Purpose: the milestone layer of EST-03.
Output: estimate-milestone.cjs (+ test), two roadmap.cjs exports, the MILESTONE fixture.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-07): ...` RED, then `feat(58-07): ...`. Fixture additions go in the first RED commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- roadmap.cjs: add `parseMilestoneBullets` and `pickMilestone` to `module.exports`; change nothing else in it (Objective 59
  owns milestone-scoping fixes in `milestone complete`).
- Fixtures literal; never read the real `~/.claude` or this repo's `.planning` in tests.

## Test list

Outermost first; `estimate-milestone.test.cjs`. `MILESTONE_SPEC` = 58-06's `ROLLUP_SPEC` plus objective `84-epsilon`
(OBJECTIVE.md with frontmatter `status: cancelled`, no TRDs) and this ROADMAP.md (export the spec from
estimate-fixtures.cjs):

```markdown
# Roadmap: Fixture

## Milestones

- ✅ **v0.9 — Old** — Objectives 70–79 (shipped 2026-09-01)
- 🚧 **v1.0 — Now** — Objectives 80–84 (in progress)

## Objectives

### Objective 80: Alpha
**Goal**: Alpha goal.
### Objective 81: Beta
**Goal**: Beta goal.
### Objective 82: Gamma
**Goal**: Gamma goal.
### Objective 83: Delta
**Goal**: Delta goal.
### Objective 84: Epsilon
**Goal**: Epsilon goal.
### Objective 85: Later
**Goal**: Later goal.
```

Config as in ROLLUP_SPEC (parallel on). Anchors within abs 0.1.

1. `estimateMilestone(CAL_V2, root)` (current milestone): `version` `v1.0`, `name` `Now`, `range_source`
   `milestone bullet`; objectives in order 80 (partial), 81 (unplanned), 82 (done), 83 (planned), 84 (cancelled); 85
   (outside 80–84) is not listed; `counts` `{done: 1, planned: 1, partial: 1, unplanned: 1, cancelled: 1, absent: 0}`; `overhead` is one
   integration-checker entry (samples 4, confidence low); `total.wall_minutes` 109.2527 / 276.3459; confidence `low`,
   weakest 81 (unplanned, the largest share).
2. Each remaining objective entry carries `{number, name, status, trds, total, confidence}`; 80's total wall is
   25.6464 / 69.1577 and 83's 8.9727 / 23.5003 (equal to 58-06's results); 82 and 84 have no total.
3. `estimateMilestone(CAL_V2, root, {version: 'v0.9'})`: no objective exists in 70–79, so objectives is empty,
   `counts.absent` 10, total `{p50: 0, p90: 0}`, confidence `n/a`, a note `no objectives left`. `{version: '0.9'}` is the
   same milestone. `{version: 'v3.0'}` throws `milestone v3.0 not in ROADMAP.md`.
4. `milestoneObjectiveNumbers(rest)`: `' — Objectives 55–64 (in progress)'` gives ranges `[[55, 64]]`, singles `[]`;
   `' — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)'` gives `[[0, 9]]` and `[6, 8, 24]`; `' - Objectives 1-4
   (shipped YYYY-MM-DD)'` gives `[[1, 4]]`; `' — Objective 3'` gives singles `[3]`; `' (2026-01-01, current): no
   objectives yet.'` gives null.
5. A ROADMAP whose current bullet has no objective text (`- 🚧 **v2.0 — Next** (in progress)`): `range_source`
   `roadmap sections`, objectives are every `### Objective` section (80-85), and 85 (section, no directory) is
   `unplanned`.
6. `roadmap.cjs` exports `parseMilestoneBullets` and `pickMilestone`; `getMilestoneInfo` on the fixture still returns
   `{version: 'v1.0', name: 'Now'}`.

<embedded_context>

<codebase_examples>
roadmap.cjs (TRD 40-01), to export as is:

```js
const MILESTONE_BULLET_RE = /^\s*[-*]\s+(?:(✅|🚧|📋)️?\s+)?\*\*v(\d+(?:\.\d+)+)\s*(?:[—–:-]\s*)?([^*]*?)\s*\*\*(.*)$/u;
/** Parse the bullets between `## Milestones` and the next `#`/`##` heading. [] when absent. */
function parseMilestoneBullets(roadmap) { ... bullets.push({ status, digits: m[2], name: m[3].trim(), rest: m[4] }) }
/** Choose the milestone the project is working in (first 🚧, then 'in progress'/'current', ...). */
function pickMilestone(bullets) { ... }
```

`rest` for the v1.5 bullet is `' — Objectives 55–64 (in progress)'`.

58-06 surface (estimate-rollup.cjs): `estimateObjective(cal, cwd, objective, {all, parallel})` -> `{status: 'done' |
'planned' | 'partial' | 'unplanned', name, trds, total: {wall_minutes, agent_minutes, tokens_input, tokens_output,
cost_usd}, confidence, weakest, notes, missing}`; `estimateUnplanned(cal, {objective, name})`; `objectiveOverhead(cal,
agents)`; `METHOD`. Throws `objective <N> not found` when there is no directory.

Objective lookup: `findObjectiveInternal(cwd, n)`; ROADMAP section name: `getRoadmapObjectiveInternal(cwd, n)`;
OBJECTIVE.md status: `extractFrontmatter(text).status` (`frontmatter.cjs`).
</codebase_examples>

<anti_patterns>
- Treating every number between the bounds as an objective to estimate. Only numbers with a directory or a ROADMAP
  section are objectives; the others are counted `absent` (killed or never created, like 26 in v1.4).
- A second milestone-bullet regex. Export and reuse roadmap.cjs's parser so both read the same thing.
- Summing objective P90s. Fit each objective's total and compose with `sumCorrelated` in one flat list with the
  integration checker.
</anti_patterns>

<error_recovery>
- If test 1's total misses by more than 0.1 while test 2's per-objective totals match, check that each objective total
  is refitted with `fitQuantiles({p50, p90})` and that the integration checker (6 / 9) is in the same flat list.
- If `getMilestoneInfo` changes in test 6, the export edit touched more than `module.exports`; revert and redo it.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/roadmap.cjs
@plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
@.planning/objectives/58-estimation-engine-and-surfacing/58-06-SUMMARY.md
</context>

<gotchas>
- Range text may use an en dash (`–`), an em dash or a hyphen; numbers may be decimals (`4.1`). Stop parsing at the first
  `(`. Membership: a number belongs if it lies within a range (inclusive) or equals a single.
- Candidate numbers are the union of `### Objective N:` section numbers and objective directory numbers, filtered by
  membership; integers in a range that have neither are `absent`. Sort numerically (`parseFloat`).
- A version argument may be `v1.0` or `1.0`; match on the bullet's digits.
- Overall confidence: `overallConfidence` over each remaining objective (`{name: number, label: its confidence, p50:
  its wall p50, status}`) and the integration checker (`{name: 'integration-checker', label, p50, n: samples}`); `n/a`
  when nothing remains. In test 1 `weakest` is `{name: '81', status: 'unplanned', ...}`.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Milestone scope from the ROADMAP bullet</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs, plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/estimate-milestone.cjs, plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs</files>
  <action>
Fixture first: `MILESTONE_SPEC` (ROLLUP_SPEC + 84-epsilon + the ROADMAP above) in estimate-fixtures.cjs.

RED: tests 4, 5 (scope part) and 6, plus the objective list, statuses and counts of tests 1 and 3. Commit
`test(58-07): milestone scope from the ROADMAP bullet`.

GREEN:
1. roadmap.cjs: export `parseMilestoneBullets` and `pickMilestone`.
2. estimate-milestone.cjs: `milestoneObjectiveNumbers(rest)` -> `{ranges, singles}` or null.
3. `selectMilestoneObjectives(cwd, {version})` -> `{version, name, range_source, objectives: [{number, name, dir,
   status_hint: 'cancelled' | 'absent' | 'no_dir' | 'dir'}], absent}`; throw `milestone <v> not in ROADMAP.md` for an
   unknown version.
Commit `feat(58-07): milestone objective selection`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` passes the Task 1 tests (skip roadmap.test.cjs if it does not exist).</verify>
  <done>Scope, statuses and counts are right for the fixture; roadmap.cjs behaviour unchanged.</done>
  <recovery>If an existing roadmap test fails after the export, the edit touched more than `module.exports`; `git diff plugins/devflow/devflow/bin/lib/roadmap.cjs` must show only the two added names.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Milestone totals, overhead and confidence</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-milestone.cjs, plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs</files>
  <action>
RED: the totals, overhead and confidence parts of tests 1, 2 and 3. Commit
`test(58-07): milestone totals compose remaining objectives`.

GREEN: `estimateMilestone(cal, cwd, {version} = {})`: select; per objective `estimateObjective` (dir), `estimateUnplanned`
(no dir) or skip (cancelled, done); per metric `sumCorrelated` of the remaining objectives' fitted totals plus
`objectiveOverhead(cal, ['integration-checker'])`; confidence per gotchas; `counts`, `notes` (`no objectives left`
when none remain; one note per unplanned objective), `missing`, `METHOD`. Result: `{version, name, range_source,
objectives, counts, overhead, total, confidence, weakest, notes, missing, method}`.
Commit `feat(58-07): milestone estimate`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` passes.</verify>
  <done>Tests 1-6 pass with the anchors; tests for totals went RED then GREEN.</done>
  <recovery>If `estimateObjective` throws for a ROADMAP-only objective, route `no_dir` entries to `estimateUnplanned` before calling it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-03 (milestone layer): remaining objectives composed, milestone overhead added, confidence and the weakest objective
  reported.
- `git diff` of roadmap.cjs shows only the export additions.
</verification>

<success_criteria>
- estimate-milestone.test.cjs passes 6/6.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-07-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the milestone result shape; 58-08 renders it.
</output>
