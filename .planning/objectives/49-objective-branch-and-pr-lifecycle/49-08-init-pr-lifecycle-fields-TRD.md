---
objective: 49-objective-branch-and-pr-lifecycle
trd: "08"
type: standard
wave: 2
depends_on: ["49-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/init.cjs
  - plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs
autonomous: true
requirements: [GPR-06]
must_haves:
  truths:
    - "In store mode `init execute-objective` returns `pr_lifecycle: true`, `objective_branch` (from `prs[id].branch`, else the `objective_branch_template` rendering), `pr_number` (or null), `branch_name: null`, and `branching_strategy_ignored: <value>` when `git.branching_strategy` is not `none`"
    - "In store mode `init milestone-op` returns `pr_lifecycle: true` so complete-milestone skips the local branch merge"
    - "In local mode both inits keep every existing field and value; they add `pr_lifecycle: false`, and when `branching_strategy` is not `none` a `deprecations` entry saying `git.branching_strategy` is replaced by the objective PR lifecycle in store mode"
    - "Init makes zero gh calls in either mode"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/init.cjs
      provides: "pr_lifecycle / objective_branch / pr_number / branching_strategy_ignored / deprecations fields"
  key_links:
    - "Consumed by 49-13 prose (execute-objective `handle_branching`, complete-milestone `handle_branches` branch on `pr_lifecycle`)"
---

# TRD 49-08: Init tells the workflows when the PR lifecycle replaces `branching_strategy` (GPR-06)

<objective>
Expose one boolean the workflows branch on — `pr_lifecycle` — plus the objective branch and PR number, so execute-objective and
complete-milestone stop using `git.branching_strategy` in store mode, and local-mode users see a deprecation notice.

Purpose: GPR-06, decision 7. Output: init fields with tests; no prose (49-13).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-08): ...`), then implementation (`feat(49-08): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- New test file `init-pr-lifecycle.test.cjs` (avoid churn in init.test.cjs). Temp project dirs only; never `~/.claude`; never port 8080.
- Existing init tests must pass unchanged (they assert today's local-mode fields).

## Decisions

- **Decision 7 (orchestrator, adopted): replace `git.branching_strategy` in store mode only, with a deprecation notice in local mode.**
  D-01 keeps local mode working as today; objective 51's migration moves projects to store mode. `branching_strategy` keeps its value in
  the JSON in both modes (readers do not break); store mode sets `branch_name: null` so the legacy `git checkout -b` step has nothing to do.
- **Branch name**: render `objective_branch_template` (`df/objective-{objective}-{slug}`) with the padded objective number and slug,
  the same way `branch_name` is rendered today (init.cjs L380), unless `prs[id].branch` exists (the linked branch wins).
- **Deprecation text** (single line): `git.branching_strategy is deprecated: in store mode (github.store) each objective runs on one
  linked branch and pull request (gh pr start).`

## Test list

1. Store project (enabled+store), no `prs` entry → `pr_lifecycle:true`, `objective_branch:'df/objective-49-objective-branch-and-pr-lifecycle'`,
   `pr_number:null`, `branch_name:null`.
2. Store project with `prs['49'] = {branch:'df/objective-49-x', number:130}` → `objective_branch:'df/objective-49-x'`, `pr_number:130`.
3. Store project with `git.branching_strategy:'objective'` → `branching_strategy_ignored:'objective'`, `branch_name:null`.
4. Local project with `branching_strategy:'objective'` → `branch_name` exactly as today, `pr_lifecycle:false`, `deprecations` has the text.
5. Local project with `branching_strategy:'none'` → `pr_lifecycle:false`, no `deprecations` key.
6. `init milestone-op` store → `pr_lifecycle:true`; local → `false`.
7. Either mode: a `_setRunGh` spy records zero calls.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PR lifecycle fields in init execute-objective and milestone-op (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs, plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs</files>
  <action>
RED: tests 1-7; commit `test(49-08): init exposes the PR lifecycle`.
GREEN: in init.cjs (L360-387 for execute-objective; the milestone-op init) compute `planningMode.planningMode(resolveMainRoot(cwd))`;
store → fields per decisions (read `getPr` from the main-root mapping); local → `pr_lifecycle:false` and the deprecation entry.
Commit `feat(49-08): init reports pr_lifecycle and the objective branch`. Run init.test.cjs too.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs plugins/devflow/devflow/bin/lib/init.test.cjs</verify>
  <done>Tests 1-7 pass; init.test.cjs unchanged and green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `init.cjs` L360 `branching_strategy: config.branching_strategy`, L380-387 `branch_name` rendering for `objective`/`milestone`.
- `config.cjs` L16-18 defaults (`branching_strategy:'none'`, `objective_branch_template:'df/objective-{objective}-{slug}'`).
- `planning-mode.cjs` `planningMode(main)` returns `{mode}`; store iff `github.enabled === true && github.store === true` in the MAIN checkout.
</codebase_examples>
<anti_patterns>
- Changing `config.cjs` defaults or removing `branching_strategy` from settings: D-01, local mode is unchanged.
</anti_patterns>
<error_recovery>
- If milestone-op init has no objective context, emit only `pr_lifecycle` (no branch fields).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/init-pr-lifecycle.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/init.test.cjs</regression>
</validation_gates>

<verification>
- Local-mode JSON for an existing fixture differs only by the added `pr_lifecycle:false` (and `deprecations` when applicable).
</verification>

<success_criteria>
Workflows can tell from init alone whether to use the linked-branch PR lifecycle or the legacy local branching strategy.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-08-SUMMARY.md`
</output>
