---
objective: 49-objective-branch-and-pr-lifecycle
trd: "13"
type: standard
wave: 5
depends_on: ["49-06", "49-08", "49-09", "49-11", "49-12"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/complete-milestone.md
  - plugins/devflow/devflow/workflows/settings.md
  - plugins/devflow/devflow/references/planning-config.md
  - plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs
autonomous: true
requirements: [GPR-06, GPR-01, GPR-02, GPR-03, GPR-04]
must_haves:
  truths:
    - "execute-objective `handle_branching`: when init `pr_lifecycle` is true it runs `df-tools gh pr start <objective>` (online required; on exit 1 it stops and reports) and ignores `branching_strategy`; when false it is today's step verbatim, plus printing init `deprecations` if present"
    - "execute-objective wave step: in PR-lifecycle mode each TRD gets `df-tools gh trd start <trd>` at spawn; worktrees are created with `--base` = the objective branch tip; after merge-back the `df/exec-<id>` branch is deleted locally (never pushed) and `df-tools gh pr sync <objective>` runs once per wave"
    - "execute-objective verify: in PR-lifecycle mode `gh pr sync` runs before the verifier posts verification (so the status lands on the verified head); `verification post` handles status/ready/wiki diff — no separate prose call"
    - "execute-objective `update_roadmap`: in PR-lifecycle mode `objective complete` no longer closes the issue (49-11) and the step offers `df-tools gh pr merge <objective>`, then `df-tools gh pr reconcile <objective>` (or reconcile later when a merge queue is used)"
    - "complete-milestone `handle_branches` is skipped entirely when init `pr_lifecycle` is true (no local squash merge, no branch deletion prompt); local mode unchanged"
    - "settings.md and references/planning-config.md mark `git.branching_strategy` / branch templates as deprecated in store mode (replaced by the objective PR lifecycle), still honoured in local mode; `objective_branch_template` supplies the linked branch name"
    - "planning-writes, doc-refs and dispatch-completeness audits are green; every `df-tools gh pr|trd` command named in prose dispatches"
  artifacts:
    - path: plugins/devflow/devflow/workflows/execute-objective.md
      provides: "PR-lifecycle branches in handle_branching, wave spawn/merge, verify, update_roadmap"
    - path: plugins/devflow/devflow/workflows/complete-milestone.md
      provides: "handle_branches skipped in store mode"
    - path: plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs
      provides: "repo test pinning the prose contract"
  key_links:
    - "Consumes 49-08 init fields and the 49-06/49-09/49-12 verbs; 49-14 exercises the same sequence in code"
---

# TRD 49-13: Workflow prose runs the PR lifecycle; `branching_strategy` retired in store mode (GPR-06)

<objective>
Make the execute-objective and complete-milestone workflows drive the objective branch and PR in store mode — start, TRD in-progress,
wave sync, verify, merge, reconcile — and stop complete-milestone from merging branches locally. Local mode reads exactly as before.

Purpose: GPR-06 and the orchestration half of GPR-01..04. Output: four prose files and a repo test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- TDD for prose: write `pr-lifecycle-prose.repo.test.cjs` first (it fails on today's prose), commit `test(49-13): ...`; then edit prose
  until it passes, commit `docs(49-13): ...` per workflow.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Branch on init JSON (`pr_lifecycle`), never on a shell probe of config (Pitfall 11).
- No direct planning-file write instructions (planning-writes audit); use verbs or an inline
  `<!-- planning-audit: allow <reason of 20+ chars> -->` marker only where unavoidable.
- Local-mode text stays: wrap new behaviour in clearly labelled "If `pr_lifecycle` is true" blocks; do not rewrite the local path.
- Never port 8080.

## Decisions

- **Decision 7 (orchestrator, adopted)**: `branching_strategy` is replaced in store mode only; local mode keeps it with a deprecation
  notice (from init `deprecations`). complete-milestone no longer merges branches locally in store mode.
- **One sync per wave**, not per TRD: keeps pushes and PR-body writes low (Pitfall 10).
- **`gh trd start` at spawn** is issued by the orchestrator (decision 3); the executor agent does not change.
- **Worktree base**: `exec-context worktree --base` gets the objective branch HEAD; merge-back goes into the orchestrator's checkout,
  which is the objective branch (no exec-context change).

## Test list (repo test assertions)

1. execute-objective.md `handle_branching` contains `pr_lifecycle` and `df-tools gh pr start`; the local `git checkout -b` text is still
   present under the local branch.
2. The wave step contains `gh trd start` and `gh pr sync`; it says `df/exec-*` branches are never pushed and are deleted after merge.
3. The verify step mentions running `gh pr sync` before verification is posted in PR-lifecycle mode.
4. `update_roadmap` mentions `gh pr merge` and `gh pr reconcile` and states the objective issue closes on merge.
5. complete-milestone.md `handle_branches` starts with a skip when `pr_lifecycle` is true.
6. settings.md and planning-config.md contain the deprecation sentence for `branching_strategy` in store mode.
7. Every `df-tools gh <sub> <verb>` mentioned in the four files is a dispatched subcommand (reuse the dispatch-completeness helper or
   parse df-tools.cjs `case 'gh'` + gh-pr-cli/gh-store-cli verbs).
8. planning-writes.repo.test, doc-refs.repo.test and dispatch-completeness.test pass.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Repo test, then execute-objective prose (tests 1-4, 7)</name>
  <files>plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: the full repo test (tests 1-8); commit `test(49-13): prose runs the objective PR lifecycle`.
GREEN: execute-objective.md — `initialize` (L18-37) parses `pr_lifecycle`, `objective_branch`, `pr_number`, `deprecations`;
`handle_branching` (L39-50) store branch → `gh pr start`; wave step 0 (L221-268) `--base` = objective branch HEAD and `gh trd start <trd>`
per spawned TRD; merge 5b (L423-480) adds `git branch -d df/exec-{plan_id}` and a once-per-wave `gh pr sync`; `verify_objective_goal`
(L866-1000) `gh pr sync` before verification post; `update_roadmap` (L1001-1047) merge/reconcile offer and the closes-on-merge note.
Commit `docs(49-13): execute-objective drives the objective PR in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs</verify>
  <done>Tests 1-4, 7 pass; planning-writes and execute-objective-gh-sync green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: complete-milestone, settings, planning-config (tests 5, 6, 8)</name>
  <files>plugins/devflow/devflow/workflows/complete-milestone.md, plugins/devflow/devflow/workflows/settings.md, plugins/devflow/devflow/references/planning-config.md</files>
  <action>
complete-milestone.md `handle_branches` (L494+): first line skips the step when init `pr_lifecycle` is true ("each objective already
merged through its PR"); local text unchanged. settings.md (L35, L117, L156) and planning-config.md (L12-24, L104-194): add the
deprecation sentence and note `objective_branch_template` names the linked branch. Commit
`docs(49-13): branching_strategy is replaced by the objective PR in store mode`. Run the repo audits.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>All repo test assertions pass; audits green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `workflows/execute-objective.md`: `initialize` L18-37, `handle_branching` L39-50, wave step 0 L221-268 (`exec-context worktree --base <WAVE_BASE>`), merge 5b L423-480, `verify_objective_goal` L866-1000, `update_roadmap` L1001-1047.
- `workflows/complete-milestone.md` `handle_branches` L494-560+ (local squash merge).
- 48-17 (prose-execute) is the precedent for editing execute prose under the planning-writes audit.
</codebase_examples>
<anti_patterns>
- `git push` of `df/exec-*` (creates stray remote branches and possibly PRs; violates SC2).
- Calling `gh pr ready` or posting a status from prose: `verification post` owns it.
</anti_patterns>
<error_recovery>
- If execute-objective-gh-sync.test asserts on exact text you moved, keep that text in the local branch of the step rather than editing the test.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs</regression>
</validation_gates>

<verification>
- Read the store-mode path of execute-objective top to bottom: start → per-TRD start → wave sync → verify (sync + post) → merge → reconcile.
</verification>

<success_criteria>
In store mode the workflows run one branch and one PR per objective end to end; complete-milestone never merges branches locally; local
mode reads as before plus a deprecation notice.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-13-SUMMARY.md`
</output>
