---
objective: 56-objective-number-correctness
trd: "05"
type: standard
wave: 3
depends_on: ["56-01", "56-03", "56-04"]
files_modified:
  - .planning/objectives/56-objective-number-correctness/OBJECTIVE.md
  - CHANGELOG.md
autonomous: true
requirements: [ONUM-01, ONUM-02, ONUM-03, ONUM-04]
must_haves:
  truths:
    - "Against this repo's live .planning: `roadmap get-objective 56` has a non-null goal, `roadmap analyze` has a non-null goal for every objective 55-64, and `verify trd-pre 56` reports requirement_coverage passed with ONUM-01..04 actually checked"
    - "`find-objective 56` resolves 56-objective-number-correctness, and `detect novel-domain 56 --raw` exits 0 with JSON"
    - "Objective 56's OBJECTIVE.md carries the ROADMAP goal instead of the `_(extract from ROADMAP.md ...)_` placeholder, written through `objective put`"
    - "CHANGELOG.md [Unreleased] has a Fixed entry for each user-visible change in 56-01..56-04"
    - "The full suite passes (npm test, or the micro-excluded form when commit signing hangs micro.test.cjs)"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] Fixed entries for objective 56"
    - path: .planning/objectives/56-objective-number-correctness/OBJECTIVE.md
      provides: "real Goal section"
  key_links:
    - "df-tools objective put 56 --from <draft> -> .planning/objectives/56-objective-number-correctness/OBJECTIVE.md"
    - "verify trd-pre 56 -> requirement-ids.roadmapRequirementIds('**Requirements**: ONUM-01, ...') -> 4 IDs covered by 56-01..56-05 frontmatter"
---

# TRD 56-05: Dogfood on this repo, fix objective 56's OBJECTIVE.md, changelog

<objective>
Prove objective 56 on the repository that motivated it, repair the one artifact the bug left behind, and record the
changes in the changelog.

Before this objective: `roadmap get-objective 56` and `roadmap analyze` reported `goal: null` for every v1.5 objective.
`verify trd-pre 56` passed requirement coverage without reading `**Requirements**: ONUM-01, ...`. Objective 56's
OBJECTIVE.md was scaffolded with a placeholder goal. This TRD runs each of those commands against the live `.planning/`
and writes the results into the SUMMARY.

Purpose: an end-to-end check that does not depend on test fixtures, plus the release notes.
Output: OBJECTIVE.md goal repaired through the planning verb, CHANGELOG [Unreleased] entries, full-suite result.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Planning files change only through verbs: `planning draft` + `objective put`. Never Write or Edit under `.planning/` directly.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Use one plain command per Bash call.
- Use the repo's own CLI: `node plugins/devflow/devflow/bin/df-tools.cjs ...`, not the `~/.claude/devflow` mirror, which
  does not have these fixes until release and re-sync.
- If a dogfood check fails, do not patch 56-01..56-04's files here. Record the failure (command, output, expected) in the
  SUMMARY as a gap and stop. `/devflow:verify-work` routes it to gap closure.
- No tdd flag: this TRD adds no logic. It runs commands and edits prose.

## Test list

Not applicable: no production logic. The dogfood checks in Task 1 are the acceptance tests, and each has an exact expected
output.

<embedded_context>

<codebase_examples>
Objective 56's ROADMAP section (the input every dogfood check reads):

```
### Objective 56: Objective-number correctness

**Goal**: Objective lookups resolve exactly the objective asked for, and no regex in df-tools is built from unescaped text, so everything later in the milestone can rely on objective resolution.
**Requirements**: ONUM-01, ONUM-02, ONUM-03, ONUM-04
**Depends on**: Nothing (Objective 55 shipped)
```

OBJECTIVE.md as scaffolded (the placeholder to replace):

```
---
work: feature
---

# Objective-number correctness

## Goal

_(extract from ROADMAP.md "### Objective N:" entry)_
```

Changelog style (CHANGELOG.md `## [2.13.2]`): one bullet per user-visible fix. It names the command, says what it does now,
and gives the before and after in plain words. Wrap at about 125 columns. Put new bullets under `## [Unreleased]` in a
`### Fixed` heading below the existing `### Added`.
</codebase_examples>

<anti_patterns>
- Do not bump versions or tag. Release is a separate step that needs approval.
- Do not hand-write `**Goal:**` into OBJECTIVE.md's frontmatter. The goal goes in the `## Goal` body section only.
- Do not describe internal refactors as user-facing fixes. The shared escape and repo guard get one line under `### Changed`.
</anti_patterns>

<error_recovery>
- If `npm test` hangs in micro.test.cjs (commit-signing prompt), stop it and run
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`. Record which
  form ran.
- If `objective put` refuses (unknown objective), run `node plugins/devflow/devflow/bin/df-tools.cjs find-objective 56` first.
  A not-found there is itself a 56-02 regression: record it and stop.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/56-objective-number-correctness/56-01-SUMMARY.md
@.planning/objectives/56-objective-number-correctness/56-02-SUMMARY.md
@.planning/objectives/56-objective-number-correctness/56-03-SUMMARY.md
@.planning/objectives/56-objective-number-correctness/56-04-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood the fixes on this repo and repair objective 56's OBJECTIVE.md goal</name>
  <files>.planning/objectives/56-objective-number-correctness/OBJECTIVE.md</files>
  <action>
Run each check from the repo root, one command per Bash call. Record the command and the relevant output in the SUMMARY:
1. `node plugins/devflow/devflow/bin/df-tools.cjs roadmap get-objective 56`: `goal` starts "Objective lookups resolve exactly",
   and `success_criteria` has 4 items.
2. `node plugins/devflow/devflow/bin/df-tools.cjs roadmap analyze`: objectives 55-64 each have a non-null `goal`. Objective 57's
   `depends_on` starts "Objective 56".
3. `node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 56` (no `--raw`): `checks.requirement_coverage.passed` is true,
   with no `note`. That shows the four IDs were read and found in the TRDs' `requirements`, not skipped.
4. `node plugins/devflow/devflow/bin/df-tools.cjs find-objective 56`: directory `.planning/objectives/56-objective-number-correctness`.
5. `node plugins/devflow/devflow/bin/df-tools.cjs detect novel-domain 56 --raw`: exit 0 and parseable JSON.
6. `node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs`: passes.

Then repair OBJECTIVE.md:
`node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/56-objective-number-correctness/OBJECTIVE.md` prints
a draft path. Edit that draft, replacing the placeholder line under `## Goal` with the ROADMAP goal sentence verbatim. Then run
`node plugins/devflow/devflow/bin/df-tools.cjs objective put 56 --from <draft path>`. Commit
`docs(56-05): objective 56 OBJECTIVE.md carries its ROADMAP goal` with `--files
.planning/objectives/56-objective-number-correctness/OBJECTIVE.md`.
  </action>
  <verify>Checks 1-6 give the expected output. `rg -n -F "_(extract from ROADMAP.md" .planning/objectives/56-objective-number-correctness/OBJECTIVE.md` prints nothing.</verify>
  <done>All six dogfood checks pass and are recorded verbatim in the SUMMARY. OBJECTIVE.md has the real goal.</done>
  <recovery>A failing check is a gap in 56-01..56-04. Record command, actual and expected output, mark the TRD's self-check FAILED and stop without editing source.</recovery>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG [Unreleased] entries and the full suite</name>
  <files>CHANGELOG.md</files>
  <action>
Under `## [Unreleased]`, add a `### Fixed` heading after the existing `### Added`, with these bullets (take the facts from the
four SUMMARYs; keep each to 2-4 wrapped lines):
- Objective lookups match the exact directory: `4.1` no longer resolves to a `04.10-*` directory (`find-objective`,
  `objectives list --objective`, `objective-job-index` and every command that resolves an objective), and an archived `04.1-*` is
  found when only `04.10-*` is current.
- Single-digit objectives find their ROADMAP section with or without a leading zero (`### Objective 4:` / `### Objective 04:`) in
  `detect novel-domain`, `verify trd-pre`, `roadmap get-objective` and the OBJECTIVE.md scaffold.
- `verify trd-pre` takes requirement IDs only from ID-shaped list items. A free-text Requirements line (`none (tech debt; ...)`)
  yields none instead of a requirement no TRD can cover. `**Requirements**:` is read, `GWP-01..GWP-05` expands, and a bulleted
  Requirements block yields its leading IDs. `objective complete` uses the same rules.
- `roadmap get-objective`, `roadmap analyze`, the OBJECTIVE.md scaffold and gh issue bodies read `**Goal**:` and `**Depends on**:`
  (colon outside the bold). Before this, every v1.5 objective reported `goal: null`.
- `requirements mark-complete` matches IDs literally: `REQ.01` no longer ticks `REQ-01`, and `A(1` no longer crashes.
  `objective remove` renumbers `**Depends on**: Objective N, ...`.
Add `### Changed` with one line: every regex escape in df-tools and the hooks goes through `lib/text-escape.cjs`, and a
repository test fails CI on a hand-rolled one.

Run the full suite (`npm test`, or the micro-excluded form per error_recovery). Commit
`docs(56-05): changelog for objective 56 objective-number correctness` with `--files CHANGELOG.md`.
  </action>
  <verify>`node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased` exits 0 with `present: true`. `rg -n -F "verify trd-pre" CHANGELOG.md` finds the new bullet. The full suite passes.</verify>
  <done>CHANGELOG [Unreleased] describes objective 56. The full suite passes, and the SUMMARY records which form ran with pass/fail counts.</done>
  <recovery>If the full suite fails in a file that objective 56 did not touch, run that one test file on the objective's base commit, in a separate `git worktree add` under the session scratchpad. A failure there too means it is pre-existing: record it separately. Only failures introduced by 56-01..56-04 are gaps.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- All four objective success criteria hold on the live repo (checks 1-6) and in the full suite.
- OBJECTIVE.md and CHANGELOG.md changed only through the verb (OBJECTIVE.md) and a direct edit (CHANGELOG.md, which is not
  planning state).
</verification>

<success_criteria>
- Objective 56 is demonstrated end to end on this repository and documented for release.
</success_criteria>

<output>
After completion, publish `56-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Include the six dogfood outputs verbatim and the full-suite counts.
</output>
