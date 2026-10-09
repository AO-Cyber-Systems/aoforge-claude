---
objective: 55-store-live-smoke-fixes
trd: "08"
type: standard
wave: 5
depends_on: ["55-07"]
files_modified:
  - docs/USER-GUIDE.md
  - CHANGELOG.md
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: ["55-1", "55-2", "55-3", "55-4", "55-5", "55-6"]
must_haves:
  truths:
    - "USER-GUIDE **Enforcement and setup** says the setup ruleset grants repository admins a bypass and gives the exact merge command for the workflow PR that the live run used (TRD 55-06 SUMMARY); no sentence says an admin `may need to bypass`"
    - "USER-GUIDE says how an existing store repository picks up a fixed checks workflow (upgrade the plugin, `gh setup` dry run shows the managed workflow as an update, `--apply`, merge the workflow PR) and that `github.checks_workflow` ending in `@<ref>` pins `devflow-ref` to the same ref"
    - "USER-GUIDE documents the unpushed-commit refusal of `verification post` and `gh pr merge` (naming `gh pr sync`), the wiki first-page retry on `gh outbox flush`, the `objective add` hint, the content-aware reconcile cleanup, and `df-tools upgrade --apply` as the fresh-store bootstrap; the 'Not yet verified on a real repository' paragraph is replaced by what the 2026-10-05 smoke and its re-run proved"
    - "The deferred item (an automatic store bootstrap in new-project) appears in USER-GUIDE Known behaviour/issues with its reason"
    - "CHANGELOG.md [Unreleased] has a ### Fixed entry per item 55-1..55-6; doc-refs.repo.test.cjs, planning-writes.repo.test.cjs and rg-flag-guard tests pass, and `npm test` fails on nothing but MA-7"
  artifacts:
    - path: docs/USER-GUIDE.md
      provides: "store-mode docs matching the fixed and live-verified behaviour"
    - path: CHANGELOG.md
      provides: "[Unreleased] Fixed entries for objective 55"
  key_links:
    - "55-06/55-07 SUMMARY facts -> USER-GUIDE Enforcement and setup / One branch and one pull request per objective"
---

# TRD 55-08: Document the fixes and the live results; changelog (all items)

<objective>
Bring the store-mode documentation in line with the fixed, live-verified behaviour and record objective 55 in the changelog. This
TRD runs last, so the docs cite what the live run proved (TRDs 55-06 and 55-07), not what was planned. Read all seven earlier
SUMMARYs first, plus the 55-01 and 55-03 refusal and guidance texts. Where a SUMMARY records a deviation, document the actual
behaviour.

Releasing is a separate approval: no version bump, no tag.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(55-08): ..." --files <paths>`.
- No code changes. If a doc statement would need one, it is a gap: record it in the SUMMARY and do not paper over it in prose.
- House style for USER-GUIDE: plain declaratives, bold run-in labels (`**Merge.**`), commands in backticks. The repo CLAUDE.md
  keeps resident context small, so do not add objective-55 detail to CLAUDE.md.
- `plugins/devflow/**` prose is checked by `planning-writes.repo.test.cjs` (no direct planning-write instructions),
  `doc-refs.repo.test.cjs` (no stale command names) and the rg flag guard. Run them.

<embedded_context>

<codebase_examples>
Sentences to replace (USER-GUIDE.md, line numbers at planning time):
- :977 "a weaker one is updated with the union and never loses a rule or a bypass actor". Keep it, and add that the union also adds
  the repository-admin bypass when it is missing (an existing admin entry's mode is never changed).
- :981 "an administrator may need to bypass the ruleset once for that pull request". Replace with the admin-bypass statement and the
  live-verified command.
- :929 **Verify.** "Run `gh pr sync` first …". Add: `verification post` refuses (exit 1, naming `gh pr sync`) while the linked
  branch has unpushed commits.
- :931 **Merge.** Add the same refusal to the refusal list.
- :940 **Reconcile.** "a local branch that holds unmerged work is kept and reported". Add that a branch whose changes are already on
  the default branch is deleted even when it is not an ancestor of the merged head (squash).
- :1004 **Not yet verified on a real repository.** Replace with a short **Verified on a real repository** paragraph: the
  2026-10-05 smoke and its re-run on `AO-Cyber-Systems/devflow-store-smoke`. State what was proven (statuses through
  `workflow_call`, the merge queue, the admin bypass) and what still is not (the issue-field option shape, if 55-06/07 did not
  touch it).
- **The outbox** (:786+): a blocked wiki push is retried by the next `gh outbox flush`, so create the first wiki page and flush.
  `resolve --overwrite` is no longer needed for it.
- **Turning it on** / **Known behaviour** (:763, :844): a store project created from scratch gets `state.json` and its version
  stamp from `df-tools upgrade --apply`, which the SessionStart hook runs when a session opens in the project. A one-command store
  bootstrap in new-project is deferred (reason: a feature, not a smoke defect; the hook plus `upgrade --apply` covers it).
- Picking up a fixed checks workflow (new short paragraph under **Enforcement and setup**): the caller pins `v<plugin version>`.
  After a plugin upgrade, `gh setup` plans `refresh the managed DevFlow checks workflow`; `--apply` writes it, then merge the
  workflow PR. To pin a branch or SHA, set `github.checks_workflow` to `<owner>/<repo>/.github/workflows/devflow-checks.yml@<ref>`;
  `devflow-ref` follows the same `@<ref>`.

gh-sync SKILL.md step 6 (`setup [--apply]`) says "merge its workflow pull request with a one-time admin bypass". Make it name the
ruleset's admin bypass and the command. execute-objective.md :1167 (merge exit-1 list) and :973/:1080 (sync before verification):
add the unpushed refusal and its remedy (`gh pr sync`, then verification again).

CHANGELOG [Unreleased] format (Keep a Changelog, as the 2.13.1 entry): `### Fixed` bullets, one per item, user-facing wording,
`gh setup`/`verification post`/`gh pr merge` in backticks.
</codebase_examples>

<anti_patterns>
- Do not document planned behaviour that the live run contradicted. The SUMMARYs win.
- Do not reference `~/.claude/devflow` paths for users' projects in a way that implies the stale 2.12.0 mirror matters to them.
- Do not add a new top-level USER-GUIDE section: extend the existing store-mode subsections.
</anti_patterns>

<error_recovery>
- doc-refs flags a command: check `DEPRECATION_MAP`/`REMOVED_COMMANDS` in skill-route.cjs and use the current name.
- If 55-06 or 55-07 ended in a gap, document the shipped behaviour only, and list the gap under Known issues with its TRD id.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: USER-GUIDE, gh-sync skill and execute-objective prose</name>
  <files>docs/USER-GUIDE.md, plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>Apply the edits listed in codebase_examples with targeted Edit calls, using facts from the 55-01..55-07 SUMMARYs (exact refusal text, guidance command, footer text, live ids). Commit `docs(55-08): store-mode docs for the live-smoke fixes`.</action>
  <verify>`rg -n "may need to bypass|Not yet verified on a real repository" docs/USER-GUIDE.md plugins/devflow` finds nothing; `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes.</verify>
  <done>Every truth about USER-GUIDE/skill/workflow prose in must_haves holds.</done>
  <recovery>If a repo test fails on a sentence, rephrase that sentence. Never weaken the test.</recovery>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG [Unreleased] and the full-suite gate</name>
  <files>CHANGELOG.md</files>
  <action>Add `### Fixed` under `## [Unreleased]` with one bullet each for 55-1 (setup ruleset admin bypass + guidance), 55-4 (checks sparse checkout + `devflow-ref` follows a pinned `checks_workflow`), 55-5 (unpushed refusal), 55-3 (wiki retry), 55-2 (`objective add` hint) and 55-6 (issue title, store footer, content-aware reconcile cleanup). Run `npm test`. Commit `docs(55-08): changelog for objective 55`.</action>
  <verify>`npm test` reports no failure other than MA-7 (doctl); `node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased` or a `rg -n "^## \[Unreleased\]" -A 12 CHANGELOG.md` read shows the entries.</verify>
  <done>Changelog complete; the suite is green apart from MA-7.</done>
  <recovery>If `npm test` shows a new failure, identify the owning TRD from the file, and record it as a gap for that TRD. Do not fix code here.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n "gh pr sync" docs/USER-GUIDE.md` shows the refusal documented under Verify and Merge.
- `npm test` green apart from MA-7.
</verification>

<success_criteria>
- OBJECTIVE Success bullets 5 (minor items fixed or explicitly deferred, with a reason) and 7 (`npm test` green apart from MA-7).
- Docs match the live-verified behaviour.
</success_criteria>

<output>
After completion, publish `55-08-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes.
</output>
