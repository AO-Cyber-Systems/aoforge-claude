---
objective: 55-store-live-smoke-fixes
trd: "05"
type: standard
wave: 2
depends_on: ["55-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
  - plugins/devflow/devflow/bin/lib/objective-branch.cjs
  - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs
autonomous: true
requirements: ["55-2", "55-6"]
must_haves:
  truths:
    - "`df-tools objective put N` for an objective with no ROADMAP entry and no directory exits 1 with a message that names `df-tools objective add` (the step that registers a new objective); every verb sharing objectiveTarget carries the same hint"
    - "`gh pr reconcile` deletes a local objective branch whose tip is not an ancestor of the merged PR head when merging that tip into the updated default branch would change nothing (its changes are already on the default branch), with no `kept` warning"
    - "A local branch holding a change that is not on the default branch (real unpushed work) or that conflicts with it is still kept and warned about (existing test 10a unchanged)"
    - "A fully pushed branch after a squash merge is deleted with no warning (existing test 10, now also asserting zero `kept` warnings)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      provides: "objectiveTarget unknown-objective error naming objective add"
    - path: plugins/devflow/devflow/bin/lib/objective-branch.cjs
      provides: "contentMerged(root, tip, into) via git merge-tree --write-tree"
    - path: plugins/devflow/devflow/bin/lib/gh-pr.cjs
      provides: "reconcileLocal content fallback before keeping a non-ancestor branch"
  key_links:
    - "df-tools objective put -> planning-verbs.objectivePut -> objectiveTarget -> error naming objective add"
    - "gh pr reconcile -> reconcileLocal -> isAncestor false -> objective-branch.contentMerged(tip, synced.sha) -> delete or keep"
---

# TRD 55-05: `objective put` names `objective add`; reconcile compares content, not only ancestry (items 55-2, 55-6 last minor)

<objective>
**55-2.** On a fresh store, `objective put 1` failed with "objective 1 is not known (no ROADMAP entry or directory under
.planning/objectives)" and did not mention `objective add`, the step that works. The message comes from `objectiveTarget`
(planning-verbs.cjs:305-310), which every objective-scoped verb shares, and is duplicated at gh-hierarchy.cjs:95. Append the
hint in both places. Letting `put` register a new objective was rejected: `objective add` owns numbering, slugging and the
directory (objective.cjs `storeObjectiveAdd`), and a second registration path would split that logic.

**55-6, reconcile.** OBJECTIVE.md says reconcile "always warns 'kept local branch … tip not in the merged pull request' after the
default squash merge, even when everything was pushed". Planning found the fake already covers that exact case: test 10 in
gh-pr-reconcile.test.cjs, fully pushed and squash-merged, deletes the branch. In the smoke the branch did hold an unpushed
commit (item 55-5), so that warning was a true positive. The real false positive is narrower. The tip is not an ancestor of the
PR head, but its content is already on the default branch: for example, the user merged the updated default branch into the
objective branch after the last push, or re-made a commit that landed through the squash. Add a content check as a fallback: when
the ancestry check says no, delete the branch only if `git merge-tree --write-tree <default tip> <branch tip>` yields the default
tip's own tree (clean, and adding nothing). Otherwise keep it and warn as today. Task 2 starts by trying to reproduce the
"always" claim. Record the result in the SUMMARY either way.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(55-05): ...` (failing) before `fix(55-05): ...`, per task.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- This runs after TRD 55-03, which edited planning-verbs.cjs, objective-branch.cjs, gh-pr.cjs and gh-pr-reconcile.test.cjs.
  Read the current files first and keep 55-03's guard intact.
- Real git via `makeGitRemote` for the reconcile tests. Hand-built fixtures. Every git call goes through objective-branch's seam.
- `git merge-tree --write-tree` needs git 2.38 or later (this machine has 2.54). When git exits non-zero with a usage error
  (an older git), treat the content check as "unknown" and keep the branch with today's warning. Never delete on an unknown.

## Test list

55-2 (planning-verbs-cli.test.cjs, spawn the CLI the way its existing tests do):
1. Local-mode project with a ROADMAP holding no objective 9 and no `09-*` directory: `objective put 9 --from <file>` exits 1, and
   stderr contains `objective add`. RED today.
2. Same in a store-mode fixture: same exit and hint, and nothing queued.
3. An objective that exists still writes (existing put tests unchanged).

55-6 reconcile (gh-pr-reconcile.test.cjs, `describe('49-12 gh pr reconcile')`):
4. Reproduce first: fully pushed objective branch, PR squash-merged (the harness's `advanceOrigin({message: 'squash merge'})` on
   merge). Reconcile deletes the branch, and `warnings` holds no `was kept` entry. Add that assertion to existing test 10 if it
   lacks it. If this FAILS on today's code, the OBJECTIVE claim reproduces: say so in the SUMMARY and fix that cause first.
5. `10b`: after the push, the user merges origin/main into the local objective branch (an unpushed merge commit with nothing new).
   The PR then squash-merges. Reconcile deletes the branch with no `kept` warning. RED today: kept, "not in the merged PR".
6. `10c`: the local branch has an unpushed commit adding a file that main lacks. Kept and warned (the same as test 10a; keep 10a
   as it is).
7. `10d`: the local branch has an unpushed commit that conflicts with main. Kept and warned.

objective-branch (objective-branch.test.cjs):
8. `contentMerged(root, tip, into)`: `{ok:true, merged:true}` when `tip`'s changes are already in `into` (tip is an ancestor, or
   merge-tree tree == `into^{tree}`); `merged:false` for a new change; `merged:false, conflict:true` on a conflict; `ok:false` on
   invalid revisions.

<embedded_context>

<codebase_examples>
Message today (planning-verbs.cjs:305-310):

```js
function objectiveTarget(main, objective) {
  const resolved = ghMapping.resolveObjective(main, objective);
  const label = String(objective === undefined ? null : objective).trim();
  if (!resolved) return { error: `objective ${label} is not known (no ROADMAP entry or directory under .planning/objectives)` };
```

New text: `objective ${label} is not known (no ROADMAP entry or directory under .planning/objectives); register a new objective
with df-tools objective add "<description>", then run this again`. Mirror it at gh-hierarchy.cjs:95 (it throws there; keep the throw).

Keep-or-delete branch today (gh-pr.cjs `reconcileLocal`, ~:672-695):

```js
    const anc = branchLib.isAncestor(root, tip.sha, headSha);
    if (!anc.ok) { keep(... 'could not compare ...') }
    else if (!anc.ancestor) {
      keep(name, 'not in the merged PR', `${name} was kept: its tip is not in the merged pull request (unpushed or unmerged work); ...`);
    } else { ...deleteLocal(root, name, { force: true }) ... }
```

New flow for `!anc.ancestor`: `const c = branchLib.contentMerged(root, tip.sha, synced.sha);` If `c.ok && c.merged`, delete
(forced) the same way as the ancestor branch. Otherwise keep it with today's warning. On a conflict, add "(it conflicts with
<default>)" to the warning. `synced.sha` is the default branch tip after `syncDefault` fast-forwarded it.

Helper (objective-branch.cjs):

```js
/** Are `tip`'s changes already in `into`? merge-tree of the two equals into's own tree. `{ok, merged, conflict?}`. */
function contentMerged(root, tip, into) {
  // validRev both; isAncestor(tip, into) true -> merged
  // git merge-tree --write-tree <into> <tip>: exit 0 -> first stdout line is the tree; exit 1 -> conflict; other -> fail
  // git rev-parse <into>^{tree}; merged = tree === intoTree
}
```
</codebase_examples>

<anti_patterns>
- Do not use `git cherry` or patch-id. A squash commit is never patch-equivalent to the individual commits.
- Do not compare `tip^{tree}` with the merge commit's tree. Anything else merged in between makes it differ.
- Do not delete on an unknown (an error, an old git, a missing object). Keeping a branch is safe; deleting work is not.
- Do not make `objective put` create objectives.
</anti_patterns>

<error_recovery>
- If `merge-tree --write-tree` prints conflict info after the tree line, read only the first line as the tree OID.
- If test 5's fixture cannot reproduce "merged main locally" because `syncDefault` fails on a diverged local main, make the merge on
  the objective branch only, never on local main.
</error_recovery>

</embedded_context>

<context>
- Smoke: the reconcile warning followed an unpushed commit (true positive). TRD 55-03 now refuses that state before merge.
- The live re-run (TRD 55-07) reconciles a fully pushed squash merge and checks the warning is absent.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Unknown-objective error names `objective add`</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs, plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs</files>
  <action>
RED: tests 1-2. Commit `test(55-05): unknown objective error names objective add`.
GREEN: the new text in `objectiveTarget` and gh-hierarchy.cjs:95. Grep the tests for the old exact text
(`rg -n "is not known \(no ROADMAP entry" plugins/devflow/devflow/bin/lib`) and update any exact-match assertion to the new
text. Commit `fix(55-05): point an unknown objective at objective add`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</verify>
  <done>Tests 1-3 pass; `rg -n "objective add" plugins/devflow/devflow/bin/lib/planning-verbs.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs` shows both hints.</done>
  <recovery>If doc-refs.repo.test.cjs flags `objective add` as stale, check `DEPRECATION_MAP` in skill-route.cjs. `objective add` is a df-tools verb, not a slash command, so it should not match.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reconcile deletes a non-ancestor branch whose content is already on the default branch</name>
  <files>plugins/devflow/devflow/bin/lib/objective-branch.cjs, plugins/devflow/devflow/bin/lib/objective-branch.test.cjs, plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs</files>
  <action>
First run test 4 (the reproduction) on today's code and note the result. RED: tests 5, 7 and 8 (test 6 must already pass).
Commit `test(55-05): reconcile compares content for squash merges`.
GREEN: `contentMerged` in objective-branch.cjs (exported), and the fallback in `reconcileLocal`. Update the reconcileLocal JSDoc:
the ancestry gate, then the content fallback. Commit `fix(55-05): reconcile deletes branches whose changes are already merged`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</verify>
  <done>Tests 4-8 pass; 10a still keeps real unpushed work; the SUMMARY states whether the "always warns" claim reproduced.</done>
  <recovery>If merge-tree behaves differently than expected on this git, fall back to `git merge-tree --write-tree --merge-base=<base>` with an explicit base from `merge-base`, or keep the branch (unknown). Never delete on doubt.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs</test_scoped>
</validation_gates>

<verification>
- Scoped suites pass; `npm test` has no new failures (MA-7 only).
</verification>

<success_criteria>
- The `objective put` path points to what works (OBJECTIVE Success, bullet 4).
- Reconcile's branch cleanup is content-aware and still never loses unpushed work.
</success_criteria>

<output>
After completion, publish `55-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes.
</output>
