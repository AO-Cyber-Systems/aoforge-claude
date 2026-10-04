---
objective: 53-worktree-and-health-hygiene
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/templates/global-claude-md.md
  - plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs
  - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs
  - plugins/devflow/hooks/sync-runtime.test.js
  - .planning/PROJECT.md
  - .planning/objectives/UI-VISUAL-EVAL-CALLOUT
  - .planning/objectives/UI-VISUAL-EVAL-DEVFLOW
  - .planning/objectives/UI-VISUAL-EVAL-JUDGE
  - .planning/milestones/v1.2-objectives
autonomous: true
requirements: ["53-5", "53-7"]
must_haves:
  truths:
    - "awareness.cjs no longer defines or exports AWARENESS_CACHE_REL; migration 0008 and doctor still recognise the legacy file through awareness-store's LEGACY_CACHE_REL"
    - "templates/global-claude-md.md routes to `/devflow:doctor` and its template_version is \"3\", so existing managed `~/.claude/CLAUDE.md` blocks pick up the doctor line and the earlier gh-sync line at the next global upgrade"
    - "This repo's PROJECT.md has `## Core Value` and `## Requirements` sections built only from content already in PROJECT.md (no invented requirements), and `validate health` reports no W001"
    - "The three UI-VISUAL-EVAL-* directories are moved with `git mv` to `.planning/milestones/v1.2-objectives/`, every file intact and its history reachable with `git log --follow`, and `validate health` reports no W005"
  artifacts:
    - path: plugins/devflow/devflow/templates/global-claude-md.md
      provides: "template_version 3 with a /devflow:doctor routing line"
    - path: .planning/PROJECT.md
      provides: "## Core Value and ## Requirements sections"
    - path: .planning/milestones/v1.2-objectives/UI-VISUAL-EVAL-DEVFLOW/OBJECTIVE.md
      provides: "archived ad-hoc objective (moved, not rewritten)"
  key_links:
    - "global-upgrade.cjs: block staleness is the template version alone, so the doctor line only reaches existing blocks because of the version bump"
    - "objective.cjs getArchivedObjectiveDirs scans milestones/v*-objectives, so `find-objective UI-VISUAL-EVAL-JUDGE` still locates the archived dir"
---

# TRD 53-05: Objective 45 leftovers and this repo's health warnings (items 53-5, 53-7)

<objective>
Close two small leftovers from objective 45 and this repo's W001/W005 health warnings.

- 53-5a: `AWARENESS_CACHE_REL` in awareness.cjs is a dead export. Its own comment says "Nothing reads or writes it any more". The legacy
  path that migration 0008 and doctor recognise is `awareness-store.LEGACY_CACHE_REL`. Only awareness.test.cjs references the export.
- 53-5b: templates/global-claude-md.md lacks `/devflow:doctor`. Block staleness is the template version alone (global-upgrade.cjs),
  so adding a line without bumping `template_version` reaches new blocks only. That is exactly the USER-GUIDE known issue for the
  gh-sync line. Bump the version to "3" (precedent: TRD 37-10 bumped it to "2" for `/devflow:adopt`).
- 53-7 W001: PROJECT.md lacks `## Core Value` and `## Requirements`. The core value already exists as an inline `**Core value:**` line under
  "What This Is". The requirements are already stated in `## Scope`, `## Out of Scope` and `## Context` (milestone history; requirement IDs live in each
  OBJECTIVE.md, and there is no REQUIREMENTS.md). Restructure them. Do not invent anything.
- 53-7 W005: `UI-VISUAL-EVAL-CALLOUT`, `-DEVFLOW` and `-JUDGE` don't follow `NN-name`.

**W005 choice: archive, not ignore.** Move the dirs with `git mv` to `.planning/milestones/v1.2-objectives/`, the archive location that
complete-milestone already uses (`milestones/v[X.Y]-objectives/`). Reasons:
- History: `git mv` keeps every byte, and `git log --follow` reaches the original commit (31b4792d, #66).
- Every reader of `.planning/objectives/` sees these dirs today, and an ignore rule in health would fix only one of them. objective-job-index and find-objective see them,
  and the 0011 backfill would classify `objectives/UI-VISUAL-EVAL-*/OBJECTIVE.md` as cache owned by `objective put` and try to push them to GitHub
  as objectives. Archiving removes them from every objective scanner at once.
- They are finished ad-hoc work. They were merged 2026-06-16, inside v1.2's window (v1.2 shipped 2026-07-22), and nothing reads their
  paths: code mentions the names only in comments, and the 0004 migration / project-bootstrap rules that skip them stay valid for
  other repos.
- `objective.cjs getArchivedObjectiveDirs` scans `milestones/v*-objectives/`, so `find-objective UI-VISUAL-EVAL-JUDGE` still finds them.

Output: the export removed, template v3 with the doctor line (tests updated), PROJECT.md restructured, and the dirs archived.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Task 1 is TDD (`test(53-05): ...` failing first, then `fix(53-05): ...` / `chore(53-05): ...`). Task 2 is repo content, with no test seam.
  Its gate is `validate health`. <!-- TDD-EXCEPTION: Task 2 edits planning content and moves directories; no logic. -->
- Use the repo df-tools. Commit with its `commit … --files`, one plain command per Bash call. `git mv` is allowed (it is not a commit).
- Do NOT edit validate.cjs. TRD 53-02 owns it in this wave, and W001/W005 are closed by content here.
- PROJECT.md: restructure only. Every sentence in the new sections must be traceable to text already in PROJECT.md, CLAUDE.md, or
  the milestone audit. Update the footer `*Last updated:*` line.

## Test list

Task 1 (outermost first):
1. awareness.test.cjs L1: the export list is the current 14 minus `AWARENESS_CACHE_REL` (13 entries). It fails until the export is removed.
2. awareness.test.cjs: the "AWARENESS_CACHE_REL is kept only as the legacy in-tree path" test is replaced by: `require('./awareness.cjs').AWARENESS_CACHE_REL === undefined`,
   and `require('./awareness-store.cjs').LEGACY_CACHE_REL === '.planning/.awareness-cache.json'` (the surviving legacy name). L2 drops its AWARENESS_CACHE_REL type check.
3. global-upgrade.test.cjs #13: the real template is version `'3'` and its body includes `/devflow:doctor` (plus the existing commands).
4. The v=2 START-marker pins become v=3: global-upgrade.test.cjs ~145, upgrade-cli.test.cjs:27-28, hooks/sync-runtime.test.js:889-890. Change
   only the pins that render the REAL template. Fixture templates that write their own version (`writeTemplate(t, '2', …)`) stay as they are.
5. doc-refs.repo.test.cjs #10 (templates produce zero findings) stays green with the new line.

Task 2 (gate, not unit tests):
6. `node plugins/devflow/devflow/bin/df-tools.cjs validate health`: no W001, no W005.
7. `git show --stat -M HEAD` on the archive commit lists renames (`R100`) only, with no deletions without an add.
8. `node plugins/devflow/devflow/bin/df-tools.cjs find-objective UI-VISUAL-EVAL-JUDGE` reports found, under `.planning/milestones/v1.2-objectives`.

<embedded_context>

<codebase_examples>
awareness.cjs:33-36:
```js
// LEGACY (TRD 45-01): the pre-45 in-tree cache path. Nothing reads or writes it any more —
// readCache/writeCache use awareness-store. The export name is kept for migration/doctor,
// which need to recognise the dead file; it is not a live path.
const AWARENESS_CACHE_REL = path.join('.planning', '.awareness-cache.json');
```
`rg -n AWARENESS_CACHE_REL plugins/` finds only awareness.cjs:36/559 and awareness.test.cjs (15, 544-549, 1833, 1858). Migration 0008
and doctor use `awareness-store`'s `LEGACY_CACHE_REL`.

templates/global-claude-md.md frontmatter: `template: global-claude-md`, `template_version: "2"`. The routing list includes
`- Resume / status / progress / health → /devflow:status (...)`. Add, near it:
`- Diagnose and safely repair the install and project state → \`/devflow:doctor\` (\`doctor --fix\`)`.
skills/doctor/SKILL.md exists, so doc-refs resolves it.

PROJECT.md today has no `## Core Value` or `## Requirements` heading. "What This Is" ends with
`**Core value:** AI workflow orchestration for Claude Code sessions — skills, hooks, MCP integration, planning state, and program-aware coordination across the AO-Cyber-Systems org.`
Move that sentence under a new `## Core Value` heading placed right after "What This Is". Then add `## Requirements` after it, shaped like the
project template (templates/project.md: `### Validated`, `### Active`, `### Out of Scope`):
- Validated: the shipped capability areas, as already listed in `## Scope` (skills, subagents, hooks, templates, df-tools, the
  coordination layer v1.1+, project lifecycle v1.3+, self-measurement v1.3+). Reference `## Scope` rather than duplicating it if that
  reads better.
- Active: milestone v1.4 objectives 42-53, with their requirement IDs kept in each objective's OBJECTIVE.md (there is no REQUIREMENTS.md).
  This is stated in the v1.4 audit and in CLAUDE.md "Where we left off".
- Out of Scope: a pointer to the existing `## Out of Scope` section.
</codebase_examples>

<anti_patterns>
- Do not `rm` and re-add the UI-VISUAL-EVAL dirs. Use `git mv`, so the history follows.
- Do not add an ignore list to health Check 6.
- Do not invent requirements, metrics or goals in PROJECT.md.
- Do not bump `template_version` in fixture templates written by tests.
</anti_patterns>

<error_recovery>
- `df-tools commit` for the move: pass both the old dir paths and the new dir as `--files`. If the commit does not record the deletions
  (check with `git show --stat -M HEAD`), stage the removals with `git add -A -- .planning/objectives/UI-VISUAL-EVAL-CALLOUT …` before
  `df-tools commit`, and report it.
- If sync-runtime.test.js or upgrade-cli.test.cjs renders a fixture template rather than the real one, leave that pin at v=2.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: drop the dead AWARENESS_CACHE_REL export; global template v3 routes to /devflow:doctor</name>
  <files>plugins/devflow/devflow/bin/lib/awareness.cjs, plugins/devflow/devflow/bin/lib/awareness.test.cjs, plugins/devflow/devflow/templates/global-claude-md.md, plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs, plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs, plugins/devflow/hooks/sync-runtime.test.js</files>
  <action>
RED: update the tests per Test list items 1-4 and confirm they fail against the current code and template. Commit `test(53-05): ...`.
GREEN: delete the constant, its comment and its export line in awareness.cjs. In global-claude-md.md, add the doctor routing line and set
`template_version: "3"`. Run the scoped tests, then commit `fix(53-05): ...`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs plugins/devflow/hooks/sync-runtime.test.js plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs && rg -n AWARENESS_CACHE_REL plugins/devflow/devflow/bin/lib/awareness.cjs (expect no output)</verify>
  <done>No AWARENESS_CACHE_REL in awareness.cjs. The template is v3 with /devflow:doctor, and every pinned test passes.</done>
</task>

<task type="auto">
  <name>Task 2: PROJECT.md Core Value and Requirements; archive the UI-VISUAL-EVAL dirs</name>
  <files>.planning/PROJECT.md, .planning/objectives/UI-VISUAL-EVAL-CALLOUT, .planning/objectives/UI-VISUAL-EVAL-DEVFLOW, .planning/objectives/UI-VISUAL-EVAL-JUDGE, .planning/milestones/v1.2-objectives</files>
  <action>
1. PROJECT.md: add `## Core Value` (moving the existing inline line) and `## Requirements` (Validated / Active / Out of Scope from existing
   content; see codebase_examples). Edit it with the Edit tool (local mode: PROJECT.md is a tracked file, and the executor runs under a skill marker).
   Commit `docs(53-05): PROJECT.md core value and requirements sections`.
2. `mkdir -p .planning/milestones/v1.2-objectives`, then one `git mv .planning/objectives/<dir> .planning/milestones/v1.2-objectives/<dir>` per
   dir (three plain calls). Commit `chore(53-05): archive the UI-VISUAL-EVAL ad-hoc objectives under milestones/v1.2-objectives`, with
   `--files` naming the three old paths and the new dir.
3. Run Test list items 6-8 and paste their output into the SUMMARY.
  </action>
  <verify>node plugins/devflow/devflow/bin/df-tools.cjs validate health (no W001, no W005 lines); git show --stat -M HEAD; node plugins/devflow/devflow/bin/df-tools.cjs find-objective UI-VISUAL-EVAL-JUDGE</verify>
  <done>Health shows no W001 or W005. The archive commit is pure renames, and find-objective still locates the archived dirs.</done>
  <recovery>If find-objective cannot find the archived dir (the regex only accepts `v[\d.]+-objectives`), check the dir name is exactly `v1.2-objectives`. If the move breaks a test that reads `.planning/objectives/UI-VISUAL-EVAL-*`, revert with `git mv` back and record a Deviation.</recovery>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in Task 1's `<verify>`; Task 2 gate is `validate health`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- awareness, global-upgrade, upgrade-cli, sync-runtime and doc-refs tests pass.
- `validate health` in this repo: no W001, no W005.
- `git log --follow --oneline .planning/milestones/v1.2-objectives/UI-VISUAL-EVAL-DEVFLOW/OBJECTIVE.md` reaches 31b4792d.
</verification>

<success_criteria>
Objective 45's two leftovers are closed. This repo's W001 x2 and W005 x3 are gone, with no invented PROJECT.md content and no lost history.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-05 and commit it with your docs commit.
</output>
