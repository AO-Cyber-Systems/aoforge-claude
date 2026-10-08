---
objective: 61-store-mode-rough-edges-and-observability
trd: "06"
type: standard
wave: 2
depends_on: ["61-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-setup.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/commit-steps.cjs
  - plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
  - plugins/devflow/skills/gh-sync/SKILL.md
autonomous: true
requirements: [STOR-01]
must_haves:
  truths:
    - "`df-tools gh setup` (the dry run) prints the workflow's pinned `uses:` and `devflow-ref:` lines under the workflow action, for create, update (with the previous pins as `was` lines) and exists"
    - "The dry run, when it would write the workflow or the PR template, previews the follow-up steps apply will print, ending in a runnable `gh pr create --head devflow-setup --fill`"
    - "Every printed branch-and-PR sequence (gh setup apply, migration 0010, doctor check 20) ends its PR step with `gh pr create --head <branch> --fill` instead of the prose 'then open a pull request for that branch'"
    - "The dry run still makes zero GitHub writes and writes no local file; `--raw` actions carry the pins"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-setup.cjs
      provides: "planWorkflow attaches pins/previous_pins; renderPlan prints them"
    - path: plugins/devflow/devflow/bin/lib/commit-steps.cjs
      provides: "branchCommitSteps PR step is a gh pr create command"
    - path: plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
      provides: "dryRun previews the follow-up steps (filesLines preview form)"
  key_links:
    - "gh-setup.planWorkflow -> checks-pin.parseWorkflowPins(text).lines (61-01), the one reader of the pin lines"
    - "gh-setup-cli.dryRun -> filesLines(cwd, files, outcomes, {preview:true}) -> commit-steps.branchCommitSteps"
---

# TRD 61-06: The `gh setup` dry run shows the pins and a PR-create step (STOR-01)

<objective>
Two gaps the live re-run (2026-10-05) left open, both listed under USER-GUIDE "Known issues":

1. The dry run prints `write .github/workflows/devflow.yml (32 lines)` but not what it pins, so you cannot see before
   `--apply` which DevFlow ref the checks will run. That ref is exactly what broke every v2.13.1 repository.
2. The printed follow-up ends with the prose `then open a pull request for that branch`. There is no command, so the
   USER-GUIDE has to tell people to type `gh pr create` themselves.

Changes:

```
[create] workflow .github/workflows/devflow.yml - add the DevFlow checks workflow
    write .github/workflows/devflow.yml (32 lines)
    uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v2.14.0
    devflow-ref: v2.14.0
[update] workflow .github/workflows/devflow.yml - refresh the managed DevFlow checks workflow
    write .github/workflows/devflow.yml (32 lines)
    uses: ...@v2.14.0
    devflow-ref: v2.14.0
    was uses: ...@v2.13.1
    was devflow-ref: v2.13.1
[exists] workflow .github/workflows/devflow.yml - the DevFlow checks workflow is current
    uses: ...@v2.14.0
    devflow-ref: v2.14.0
...
Dry run for o/r: nothing was changed. Run `df-tools gh setup --apply` to apply this plan.

After --apply: it writes .github/workflows/devflow.yml, .github/pull_request_template.md to the working tree, not committed.
Commit them through a pull request:
commit on a new branch, then merge it through a pull request:
  git switch -c devflow-setup
  node ~/.claude/devflow/bin/df-tools.cjs commit "chore: add the DevFlow checks workflow and pull request template" --files ...
  git push -u origin devflow-setup
  gh pr create --head devflow-setup --fill
```

The PR step changes in the shared builder `commit-steps.branchCommitSteps` (TRD 52-01), so migration 0010 and doctor
check 20 print the same runnable command. `gh pr create --head <branch> --fill` opens the PR against the repository's
default branch, with the title and body taken from the commit. It runs after the push, so the branch exists on the
remote.

Purpose: STOR-01 and the first half of success criterion 1. Output: renderPlan pins, the dry-run follow-up preview,
the builder change, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(61-06): ...`) before GREEN (`feat(61-06): ...`).
- Hand-built fixtures only. Workflow texts come from `setup.renderTemplates(cfg, version)`; states come from the test
  file's own `baseState()` / `satisfiedState()`; GitHub is the existing fake that `gh-setup-cli.test.cjs` installs. No
  generated data, no property-based libraries, no `.feature` files.
- Depends on 61-01: import `parseWorkflowPins` from `./checks-pin.cjs`. Do not parse pins a second way.
- The dry run must stay read-only: `gh-setup-cli.test.cjs` test 1 (zero writes, no `.github/`) must stay green and
  unchanged.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080. Nothing here talks to real GitHub.

## Test list

`gh-setup.test.cjs` (pure; extend `describe('renderPlan (test 10)')` or add a sibling describe):

1. `planSetup(baseState({ templates: renderTemplates({}, '2.14.0') }))` → the workflow action has
   `pins: ['uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v2.14.0', 'devflow-ref: v2.14.0']`.
   `renderPlan` prints both, indented four spaces, after the `write .github/workflows/devflow.yml` line and before the
   next action line.
2. Update: `local.workflow` is the managed file rendered at `2.13.1`, templates at `2.14.0` → the action has
   `previous_pins` with the v2.13.1 lines. renderPlan prints the new pins, then `was uses: ...@v2.13.1` and
   `was devflow-ref: v2.13.1`.
3. Exists: local and templates both at `2.14.0` → the `[exists] workflow` line is followed by the two pin lines and
   nothing else (no `write`).
4. A configured `checks_workflow: 'me/fork/.github/workflows/devflow-checks.yml@main'` → the pins show `@main` and
   `devflow-ref: main`.
5. Conflict (unmanaged local file) → no pins printed (the file will not be touched).
6. Every other action renders byte-identically to before. The existing renderPlan tests, including the purity test,
   pass unchanged.

`commit-steps.test.cjs` (update 6a-6c, add one):

7. Plain form (6c): line 5 is `  gh pr create --head devflow-setup --fill`, still 5 lines.
8. Store form (6a, 6b): lines 1-4 are the 51-04 texts' first four lines; line 5 is
   `  gh pr create --head <branch> --fill`; line 6 is still the `gh pr start` route. The escaped-line count stays 1.
   Rename the 51-04 constants so the test says which lines are historical.
9. In both forms, `gh pr create` appears exactly once and after the `git push -u origin <branch>` line.

`gh-setup-cli.test.cjs` (fake GitHub, local mode unless stated):

10. A bare dry run's stdout contains the two pin lines, `After --apply`, `git switch -c devflow-setup` and
    `gh pr create --head devflow-setup --fill`. The test 1 assertions (zero writes, no `.github/`) still hold.
11. A dry run where the workflow and the PR template both already exist and are current → no `After --apply` block and
    no `gh pr create`.
12. `--apply` stdout ends its commit steps with `gh pr create --head devflow-setup --fill` and no longer contains
    `then open a pull request for that branch`.
13. A store-mode dry run (config `github.store: true`) → the preview uses the store form: the
    `DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="gh setup workflow"` line, then `gh pr create`, then the
    `gh pr start` route.
14. `--raw` dry run → the JSON `actions` entry for the workflow carries `pins`.

Also run unchanged: `migrations/0010-store-gitignore.test.cjs`, `doctor-checks/20-legacy-runtime-state.test.cjs`.

<embedded_context>

<codebase_examples>
gh-setup.cjs `planWorkflow` (lines 364-376). Attach the pins here, where both texts are in hand:

```js
function planWorkflow(state) {
  const want = state.templates.workflow;
  const have = localText(state, 'workflow');
  if (have === null) {
    return action('workflow', WORKFLOW_PATH, 'create', 'add the DevFlow checks workflow', { file: { path: WORKFLOW_PATH, content: want } });
  }
  if (have === want) return action('workflow', WORKFLOW_PATH, 'exists', 'the DevFlow checks workflow is current');
  if (have.split(/\r?\n/).slice(0, 5).some((line) => MANAGED_HEADER.test(line))) {
    return action('workflow', WORKFLOW_PATH, 'update', 'refresh the managed DevFlow checks workflow', { file: { path: WORKFLOW_PATH, content: want } });
  }
  return action('workflow', WORKFLOW_PATH, 'conflict', ...);
}
```

`renderPlan` (lines 520-538) `continue`s for anything that is not create or update. The exists case needs the pin lines
printed before that `continue`.

gh-setup-cli.cjs: `dryRun(state, actions, requireWiki)` (line 129) has no `cwd`; `runSetup(cwd, args)` calls it.
`filesLines(cwd, files, outcomes)` (line 111) builds the apply follow-up. It checks
`outcomes.find(o => o.kind === 'ruleset')` for status `created|updated|exists` to add the admin-bypass merge
paragraph. `filesLines` is exported.

commit-steps.cjs `branchCommitSteps` (lines 43-69). Both forms end with `'  then open a pull request for that branch'`.
</codebase_examples>

<anti_patterns>
- Do not print pins for a `conflict` workflow. Setup will not touch that file, and showing pins implies it will.
- Do not change the dry run's exit codes, its `ok` / `problems` logic, or what it reads from GitHub.
- Do not add `--base`. The default branch is gh's default, and naming it would need a GitHub read the steps do not do.
- Do not leave the old prose anywhere in code or skills. `rg -n "then open a pull request for that branch" plugins/devflow`
  must be empty. The gh-sync SKILL.md code block (line ~66, the 0010 store-mode sequence it quotes) is updated here;
  docs/USER-GUIDE.md is updated in 61-09.
- In gh-sync SKILL.md change only that one line of the code block. Its frontmatter belongs to 61-02, and Objective 62
  sweeps the rest of the body.
</anti_patterns>

<error_recovery>
- If `0010-store-gitignore.test.cjs` or `20-legacy-runtime-state.test.cjs` asserts the old line 5 text, update only that
  assertion to the new command, and name it in the SUMMARY.
- If the `filesLines` wording for apply must stay byte-identical (an existing test pins `Written to the working tree,
  not committed:`), add the preview as an option (`{ preview: true }`) that changes only the first line.
</error_recovery>

</embedded_context>

<gotchas>
- Action fields: `pins` (array of the literal lines, from `parseWorkflowPins(want).lines` for create and update, and
  from `have` for exists) and `previous_pins` (update only, from `have`). Omit a field when it would be empty.
- renderPlan prints pins as `    <line>` and previous pins as `    was <line>`, in that order, after the `write` line for
  create and update and directly under the action line for exists.
- Dry-run preview in gh-setup-cli `dryRun(cwd, state, actions, requireWiki)`:
  - `files` = the targets of `workflow` / `pr-template` actions with status `create` or `update`;
  - map action statuses to outcome statuses for `filesLines` (`create → created`, `update → updated`, others as is);
  - with `{ preview: true }` the first line reads
    `After --apply: it writes <files> to the working tree, not committed.`;
  - append the lines after the existing `Dry run for ...` line and before any problem lines;
  - with no files to write, append nothing.
- The `--raw` payload of the dry run already includes `actions`, so the pins appear there with no further change.
- Header comments: gh-setup.cjs's action shape doc (lines 18-24) gains `pins` / `previous_pins`. commit-steps.cjs's
  doc comment names the `gh pr create` step and STOR-01.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: renderPlan prints the workflow pins (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</files>
  <action>
RED: write tests 1-6 and watch 1-4 fail. Commit `test(61-06): the setup plan shows the workflow pins`.

GREEN: require `parseWorkflowPins` from `./checks-pin.cjs`, attach `pins` / `previous_pins` in `planWorkflow`, and print
them in `renderPlan`. Commit `feat(61-06): gh setup dry run shows the pinned uses: and devflow-ref: lines`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/checks-pin.test.cjs` passes.</verify>
  <done>The plan text shows the pins for create, update (with `was` lines) and exists, and nothing else in it changed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: A runnable PR-create step in every printed sequence, previewed by the dry run (tests 7-14)</name>
  <files>plugins/devflow/devflow/bin/lib/commit-steps.cjs, plugins/devflow/devflow/bin/lib/commit-steps.test.cjs, plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs, plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
RED: update commit-steps tests 6a-6c to the new line 5 and add test 9. Write gh-setup-cli tests 10-14. Run them and
watch them fail. Commit `test(61-06): printed steps end with gh pr create and the dry run previews them`.

GREEN: change line 5 of both `branchCommitSteps` forms to `  gh pr create --head ${branch} --fill`. Thread `cwd` into
`dryRun`, add the preview option to `filesLines`, and append the preview. In gh-sync SKILL.md, replace the quoted line
`then open a pull request for that branch` with `gh pr create --head devflow-store-cache --fill`, keeping its
indentation. Commit `feat(61-06): setup steps open the pull request with gh pr create; the dry run previews them`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/commit-steps.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes. `rg -n "then open a pull request for that branch" plugins/devflow` prints nothing.</verify>
  <done>Every printed sequence ends with a runnable `gh pr create`, and the dry run shows the whole sequence before anything is written.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/commit-steps.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs`.
</validation_gates>

<verification>
- The dry-run stdout in test 10 contains the pins and `gh pr create --head devflow-setup --fill`, with zero writes.
- The commit-steps, setup, 0010 and doctor-20 suites pass.
</verification>

<success_criteria>
- [ ] The dry run shows `uses:` and `devflow-ref:` (and the previous pins on a re-pin)
- [ ] The dry run previews the follow-up, ending in `gh pr create`
- [ ] Apply, 0010 and doctor 20 print the same runnable PR step
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-06-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
