---
objective: 49-objective-branch-and-pr-lifecycle
trd: "12"
type: standard
wave: 4
depends_on: ["49-04", "49-09", "49-10"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-pr.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: [GPR-04]
must_haves:
  truths:
    - "`gh pr merge <obj>` refuses a draft PR or one without a success `devflow/verification` status (exit 1), else queues `pr-merge` with `github.pr.merge_method` (default `squash`) and flushes; with a merge queue the PR is enqueued and the verb exits 3 (pending) telling the user to run `gh pr reconcile` after the queue merges"
    - "`gh pr reconcile <obj>` exits 3 while the PR is open (queued or not), exits 1 if it was closed unmerged, and on a merged PR: closes every objective/TRD issue the merge left open (never relying on the closing-keyword cap), sets the objective's Project Status to Done, deletes the remote branch, switches the checkout to the default branch and fast-forwards it, deletes the local objective branch and leftover `df/exec-*` branches, runs `gh pull --all`, and records `merged_at`/`reconciled_at`"
    - "Reconcile force-deletes a local objective or `df/exec-<obj>-*` branch only when its tip is an ancestor of the merged PR's head sha (`pulls/{n}` `head.sha`); otherwise it keeps the branch and reports a warning naming it (unpushed or unmerged work is never lost)"
    - "Reconcile is idempotent: a second run makes zero GitHub writes and exits 0"
    - "When `gh pr merge` merges directly (no queue), it runs reconcile in the same invocation"
    - "Local mode: merge/reconcile return skipped (exit 0), zero gh calls, no git changes"
    - "`github.pr.merge_method` (default `squash`) is documented in templates/config.json"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-pr.cjs
      provides: "mergeObjectivePr, reconcileObjectivePr (the function the objective 50 merge-time Action will call)"
    - path: plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
      provides: "`gh pr merge|reconcile`"
  key_links:
    - "Uses 49-10 pr-merge/delete-branch, 49-04 syncDefault/deleteLocal/listLocal, gh.updateProjectFields (Project → Done), gh-cache.pullAll; the objective issue close deferred by 49-11 happens here"
---

# TRD 49-12: `gh pr merge` and `gh pr reconcile` (GPR-04)

<objective>
Finish the lifecycle: merge the objective PR (through the merge queue where the repo has one), then reconcile GitHub and the local
checkout to the merged state — every issue closed, Project → Done, branch gone remotely and locally, cache pulled.

Purpose: GPR-04, decisions 5 and 6. Output: two library functions and their CLI verbs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-12): ...`), then implementation (`feat(49-12): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- New test file `gh-pr-reconcile.test.cjs`. Fake (`mergeQueue`, `closeKeywordCap`, `humanMergePr`), `makeGitRemote()`, `hermeticEnv()`,
  `makeStoreProject({store:true})`; stub `gh.updateProjectFields` / `gh-cache.pullAll` via injectable deps (`opts.deps`) where the fake
  cannot model Projects. Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Decision 5 (orchestrator, adopted)**: squash by default, `github.pr.merge_method` overrides; merge queue used where supported (the
  `pr-merge` handler detects it, 49-10). Add `"pr": { "merge_method": "squash" }` under `github` in templates/config.json.
- **Decision 6 (orchestrator, adopted): reconcile always verifies issue closure and closes stragglers.** It reads every issue in the
  PR's closes set (objective + mapped TRDs) and queues `patch-issue {state:'closed', state_reason:'completed'}` for each still open. It
  does not trust keyword closing (documented 10-link cap; unconfirmed behaviour beyond it; objectives reach 23 TRDs).
- **Online**: merge and reconcile read GitHub first (PR state); offline → exit 1 with nothing queued for merge; reconcile is re-runnable.
- **Project → Done**: `gh.updateProjectFields(objectiveIssueRef, <project>, {Status: 'Done'})`, resolving the project the way `gh sync`
  does; no project configured → skip with `project: 'none'` in the result. This is the existing legacy writer (gh.cjs), not a new direct
  write in gh-pr.cjs.
- **Local cleanup order**: queue+flush GitHub ops first; then `syncDefault`; then for the objective branch and each `df/exec-<obj>-*`:
  take the PR head sha from `pulls/{n}` (present locally because DevFlow pushed it; if `isAncestor` reports a missing object, keep the
  branch and warn), `isAncestor(branchTip(b), prHeadSha)` → `deleteLocal(b, {force:true})`, else keep `b` and add `kept: [{branch, reason:'not in the
  merged PR'}]` with a warning; then `pullAll`. Force is required because a squash merge leaves every branch "unmerged" to git.
  A dirty tree skips the local steps with a warning (GitHub side still reconciled).
- **Merge gate**: requires PR ready and the latest `devflow/verification` status `success` (a verified objective only). No bypass
  flag here: objective 50 owns enforcement and escapes; `gh pr merge` simply refuses and tells the user to verify first. A human can
  still merge on GitHub, and `gh pr reconcile` handles that the same way.

## Test list

1. merge on a draft PR → exit 1 "PR is still a draft; run verification first"; nothing queued.
2. merge on a ready PR with no success status → exit 1 naming `devflow/verification`.
3. merge, ready + success, no queue → PR merged (squash), reconcile runs: all issues closed, remote ref deleted, local on `main` at
   origin's tip, local objective branch deleted, `prs['49'].merged_at`/`reconciled_at` set, `pullAll` called once.
4. `github.pr.merge_method:'merge'` → PUT body `merge_method:'merge'`.
5. merge with `mergeQueue:true` → PR queued, exit 3, message tells to run `gh pr reconcile 49`; no issues closed yet.
6. reconcile while open/queued → exit 3, zero writes. After `humanMergePr` → reconcile succeeds as in 3.
7. Stragglers: `closeKeywordCap:1` so only #100 closes on merge → reconcile closes #101, #102 (two patch-issue ops), not #100.
8. PR closed without merge → reconcile exit 1 "closed without merging"; nothing closed or deleted.
9. Second reconcile → exit 0, zero writes, no git changes.
10. Squash merge; leftover local `df/exec-49-01`, `df/exec-49-02` whose tips are ancestors of the PR head → force-deleted (git `-d`
    alone would refuse); `df/exec-50-01` (other objective) untouched.
10a. Local objective branch has one extra unpushed commit (tip not an ancestor of the PR head), and `df/exec-49-03` has a commit never
    merged → both kept, result `kept` names them, warning printed, exit 0; GitHub side still reconciled.
11. Dirty tracked file → GitHub side reconciled, local steps skipped, result `local: 'skipped (dirty tree)'`, exit 0 with warning.
12. Project configured → `updateProjectFields` called once with `{Status:'Done'}`; none → `project:'none'`.
13. Local mode → merge and reconcile skipped, zero gh calls. CLI: `gh pr merge|reconcile` dispatch; help usage lists them.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: reconcileObjectivePr (tests 6-12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs</files>
  <action>
RED: tests 6-12 (with 10a); commit `test(49-12): reconcile after merge`.
GREEN: `reconcileObjectivePr(root, obj, {deps})`:
1. Store gate; read PR (`pulls/{n}`): open → pending; closed unmerged → error.
2. Read each closes-set issue; queue close for stragglers; queue `delete-branch`; flush.
3. Project → Done (deps.updateProjectFields).
4. Local cleanup (tracked-clean check) via objective-branch: ancestry-gated force delete per decisions; `deps.pullAll(main)`.
5. `setPr` merged_at/reconciled_at; idempotent short-circuit when `reconciled_at` set and nothing open.
Commit `feat(49-12): reconcile the objective after its PR merges`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs</verify>
  <done>Tests 6-12 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: mergeObjectivePr, CLI verbs, config default (tests 1-5, 13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs, plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs, plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/templates/config.json</files>
  <action>
RED: tests 1-5 (gh-pr-reconcile.test.cjs) and 13 (gh-pr-cli.test.cjs); commit `test(49-12): gh pr merge`.
GREEN: `mergeObjectivePr(root, obj)` (gate on ready + success status; queue `pr-merge {method}`; flush; merged → reconcile, queued →
exit 3); `cmdGhPr` gains `merge` and `reconcile`; help.cjs `gh` usage `pr <start|sync|status|merge|reconcile> <objective>`;
templates/config.json `github.pr.merge_method: "squash"`. Commit `feat(49-12): gh pr merge and reconcile`. Run gh-*, help,
dispatch-completeness, config-get tests.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Tests 1-5, 13 pass; gh-*, help, dispatch-completeness green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh.cjs` `updateProjectFields(issueRef, projectId, fields, opts)` L1078 and `projectFieldUpdates` ~L1217 (how `gh sync` finds the project).
- `gh-cache.cjs` `pullAll(root, opts)` L946 (what `gh pull --all` runs).
- `gh-pr.cjs` / `gh-pr-cli.cjs` from 49-09: same store gate, result/emit and dispatch delegation (no df-tools.cjs edit needed).
</codebase_examples>
<anti_patterns>
- Treating `gh pr merge` returning as "merged" when a queue exists (Pitfall 8).
- Deleting local branches before GitHub is reconciled (a failed flush would leave no branch to retry from).
- Deleting `df/exec-*` of other objectives.
- `git branch -D` without the ancestry check (loses unpushed work); `git branch -d` alone (always refuses after a squash merge).
</anti_patterns>
<error_recovery>
- If `updateProjectFields` fails (Projects scope missing), record `project: 'error: <msg>'`, continue, and exit 0 with a warning: issue
  closure and branch cleanup are the load-bearing parts.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- After reconcile: zero open issues in the objective's closes set, no remote or local objective branch, `prs[obj].reconciled_at` set.
</verification>

<success_criteria>
A verified objective's PR merges (queued where required) and one reconcile leaves GitHub, the Project and the local checkout in the merged
state, idempotently.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-12-SUMMARY.md`
</output>
