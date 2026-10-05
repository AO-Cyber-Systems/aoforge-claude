---
objective: 55-store-live-smoke-fixes
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/objective-branch.cjs
  - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs
autonomous: true
requirements: ["55-5"]
must_haves:
  truths:
    - "`objective-branch.unpushedCommits(root, branch)` reports the local branch's commits that origin does not have: 0 when in sync or behind, N after N local commits, every commit when the branch was never pushed, and no guard (count 0) when the branch does not exist locally or the checkout is not a git work tree"
    - "`gh pr merge <obj>` with the local linked branch ahead of origin exits 1 before anything is queued or written, with a message naming `df-tools gh pr sync <obj>` and the number of unpushed commits"
    - "`verification post` in store mode, for an objective with an unmerged PR on record and a local linked branch ahead of origin, fails before writing the VERIFICATION cache file or queueing any op, with a message naming `df-tools gh pr sync <obj>`; this holds for every verdict that would post a devflow/verification status"
    - "With the branch pushed (or absent locally), merge and verification post behave exactly as before: every pre-existing 49-11 and 49-12 test passes unchanged"
    - "Local mode is unaffected: verification post writes today's bytes with zero gh and zero git calls"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective-branch.cjs
      provides: "unpushedCommits(root, branch) through the git seam"
    - path: plugins/devflow/devflow/bin/lib/gh-pr.cjs
      provides: "mergeObjectivePr unpushed guard + shared unpushedRefusal message"
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      provides: "verificationPost unpushed guard (store mode, PR on record, before writeThrough)"
  key_links:
    - "gh pr merge -> mergeObjectivePr -> objective-branch.unpushedCommits(prs[obj].branch) -> refuse naming gh pr sync"
    - "verification post -> verificationPost -> prOnRecord + unpushedCommits -> refuse before writeThrough/verificationEnqueue"
---

# TRD 55-03: Refuse to verify or merge while the linked branch has unpushed commits (item 55-5)

<objective>
Stop DevFlow from certifying and merging a pull-request head that lacks the code that was verified.

The live smoke had an unpushed code commit on the local linked branch, because the workflow's `gh pr sync` was skipped. Then:
- `verification post` queued `post-status devflow/verification success` and `pr-ready`. The flusher resolves the PR head at flush
  time, which was the remote start commit (planning-verbs.cjs:753-761 says "so `gh pr sync` first").
- `gh pr merge` checked only the remote head's status (gh-pr.cjs:957-962) and merged.
- The reconcile closed TRDs #3 and #4 as completed. Only reconcile's branch cleanup warned, afterwards.

Guard both write points: when the local linked branch has commits origin does not, refuse with a message naming `gh pr sync`.
The objective allows "refuse, or push via `gh pr sync`". Refusing was chosen: an implicit push from a verify or merge verb is a
surprising write, and `gh pr sync` also refreshes the PR body. Reconcile keeps its existing after-the-fact warning. TRD 55-05
changes how reconcile compares squash merges.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(55-03): ...` (failing) before `fix(55-03): ...`, per task.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Real git through `__fixtures__/git-remote.cjs` (`makeGitRemote`) for objective-branch and gh pr tests. The objective-branch
  `_setRunGit` seam is fine for planning-verbs-pr unit tests. Hand-built fixtures, no property-based tests.
- Every git call goes through objective-branch's `git(root, args)` seam. No `spawnSync('git')` in gh-pr.cjs or
  planning-verbs.cjs.
- Do not edit `__fixtures__/gh-fake.cjs` (TRD 55-01 owns it in this wave).
- One refusal text, built in one place: export a small `unpushedRefusal(id, branch, info)` from gh-pr.cjs. Neither gh-pr.cjs
  nor planning-verbs.cjs requires the other today, so put it on objective-branch.cjs instead if requiring gh-pr from
  planning-verbs would create a cycle. Check with `node -e "require('./plugins/devflow/devflow/bin/lib/planning-verbs.cjs')"`.

## Test list

Outermost first.

gh pr merge (gh-pr-reconcile.test.cjs, inside `describe('49-12 gh pr merge')`, reusing its makeGitRemote + fake + recorded-PR harness):
1. Ready PR, `success` verification on its head, and the local linked branch has one commit not on origin. `mergeObjectivePr`
   returns `ok:false`. The error contains `gh pr sync` and the objective id, and says 1 unpushed commit. Zero fake writes, the
   outbox is empty, and the PR is still open. RED today: it merges.
2. The linked branch does not exist in this clone (another developer's checkout): merge proceeds as in existing test 3.
3. Existing tests 1-5f pass unchanged.

verification post (planning-verbs-pr.test.cjs, inside `describe('49-11 verification post ...')`):
4. Store mode, PR on record and not merged, `passed` verdict, local linked branch 1 commit ahead (stub the objective-branch git
   seam). `verificationPost` returns `ok:false` with `gh pr sync` in the error. The VERIFICATION cache file is not created, and
   the outbox has no `post-status`, `pr-ready` or `upsert-comment` op. RED today.
5. Same with a `gaps_found` verdict: refused. A `failure` status would land on a head without the code.
6. No PR on record: no guard, no git call (assert the stub saw zero calls). A merged PR (`merged_at` set): no guard.
7. The checkout is not a git work tree (the existing store fixture): no guard, no warning, and the existing tests 3-7 keep their
   exact assertions.

objective-branch (objective-branch.test.cjs, makeGitRemote):
8. No local branch `df/x`: `{ok:true, count:0, local:null}`.
9. Branch pushed with `-u`, nothing new: count 0.
10. One commit after the push: count 1, and `commits` lists that sha.
11. Branch never pushed, 2 commits on top of main: count 2 (commits on no `origin/*` ref).
12. Another clone pushed to `origin/df/x` and the local branch has nothing new (local behind): count 0.
13. Origin unreachable (rename `g.origin` away for the call): `ok:true`, `fetched:false`, counted against the existing tracking
    refs. The fetch failure is in `fetch_error`.
14. Root is not a git work tree: `{ok:true, count:0, local:null, reason:'not a git work tree'}`.

<embedded_context>

<codebase_examples>
Seam and existing helpers (objective-branch.cjs): `git(root, args)` -> `{ok, status, stdout, stderr}`;
`branchTip(root, b)` -> `{ok, sha|null}`; `trackingTip(root, b)` (not exported today; export it);
`fetchBranch(root, b)` runs `git fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`.

New helper. Follow the module's validate-then-run style:

```js
/**
 * Commits on the local `branch` that origin does not have: `{ok:true, count, commits, local, remote, fetched, fetch_error?}`.
 * No local branch, or a root that is not a git work tree, is count 0 (nothing here can be unpushed). Fetches the branch
 * first (best effort, so offline still answers from the tracking refs). With origin/<branch> present the count is
 * `<remote>..<local>`; without it (never pushed) it is every commit on no origin ref.
 */
function unpushedCommits(root, branch) {
  if (!validBranch(branch)) return branchError(branch);
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') return { ok: true, count: 0, commits: [], local: null, reason: 'not a git work tree' };
  const tip = branchTip(root, branch);
  if (!tip.ok) return tip;
  if (!tip.sha) return { ok: true, count: 0, commits: [], local: null };
  const f = fetchBranch(root, branch);
  const remote = trackingTip(root, branch);
  if (!remote.ok) return remote;
  const range = remote.sha ? [`${remote.sha}..${tip.sha}`] : [tip.sha, '--not', `--remotes=${REMOTE}`];
  const r = git(root, ['rev-list', ...range]);
  if (!r.ok) return fail(r);
  const commits = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  return { ok: true, count: commits.length, commits, local: tip.sha, remote: remote.sha, fetched: f.ok, ...(f.ok ? {} : { fetch_error: f.error }) };
}
```

A never-pushed branch makes fetch fail with "couldn't find remote ref". That is fine: `fetched:false`, and the
`--remotes=origin` form counts it.

Merge guard placement (gh-pr.cjs `mergeObjectivePr`, after the draft check at :954 and before `verificationAt` at :956):

```js
  if (pr.state === 'draft') return fail(`PR is still a draft; run verification first (${what})`);

  const ahead = branchLib.unpushedCommits(root, recorded.branch);
  if (!ahead.ok) return fail(`could not tell whether ${recorded.branch} has unpushed commits: ${ahead.error}; nothing was queued`);
  if (ahead.count > 0) return fail(unpushedRefusal(id, recorded.branch, ahead));
```

Suggested refusal text:
`${branch} has ${n} local commit(s) that are not on GitHub (${shortShas}): the pull request head does not contain them. Run
df-tools gh pr sync ${id} to push them, re-run verification on the pushed head, then try again. Nothing was queued.`

verification post guard (planning-verbs.cjs `verificationPost`, after `objectiveTarget` and the file-name check, BEFORE
`writeThrough`). Only in store mode (`planningMode.planningMode(main).mode === STORE`, the way summaryCheckpoint checks it),
only when `prOnRecord(main, id)` has a branch and no `merged_at`, and only when the VERIFICATION frontmatter `status:` maps to a
state in `VERDICT_STATE`. Any verdict that would post a status is guarded. A git failure here is a warning carried on the result,
never a refusal. A not-a-work-tree answer is silent (count 0).

Help text (gh-pr-cli.cjs:80): "merge refuses a draft PR, one without a success devflow/verification status, or a linked branch
with unpushed commits (run gh pr sync)". Keep the line lengths of the surrounding help block.
</codebase_examples>

<anti_patterns>
- Do not push from merge or verification post. Refuse and name `gh pr sync`.
- Do not use `git status -sb`/`ahead N` parsing. It depends on upstream config, which a branch created by `switchTo` from
  origin may not have.
- Do not guard on `remoteTip` alone (ls-remote): the sha may not be fetched locally, and `rev-list` then errors.
- Do not write the VERIFICATION file and then refuse. Refuse before `writeThrough`, or the cache and the outbox disagree.
- Do not change `reconcileLocal` here. TRD 55-05 owns the squash comparison.
</anti_patterns>

<error_recovery>
- If an existing 49-12 merge test fails because its fixture's local branch is ahead of origin (the start commit made locally
  but never pushed by the fake), inspect it. If the fixture legitimately models a pushed branch, push it in the fixture setup.
  Never weaken the guard to make an old test pass. Note any such fixture change in the SUMMARY.
- If `--is-inside-work-tree` is true for the store fixture because the temp root sits inside this repository's work tree, make
  the fixture root a real non-repo temp dir (`os.tmpdir()`), or stub the seam.
</error_recovery>

</embedded_context>

<context>
- Live evidence: `devflow/verification` success was posted on the remote start commit, the PR merged without the code, and
  reconcile closed TRDs #3 and #4 as completed. The local branch held an unpushed `feat` commit.
- execute-objective.md:973 and :1080 already tell the orchestrator to run `gh pr sync` before verification. This TRD enforces it.
- Worktrees share refs with the main checkout, so `unpushedCommits(main, branch)` sees commits made in an executor worktree.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: objective-branch.unpushedCommits through the git seam</name>
  <files>plugins/devflow/devflow/bin/lib/objective-branch.cjs, plugins/devflow/devflow/bin/lib/objective-branch.test.cjs</files>
  <action>
RED: tests 8-14 against `makeGitRemote()`. Commit `test(55-03): detect local commits origin does not have`.
GREEN: implement `unpushedCommits` (code example). Export it and `trackingTip`. Update the module header's list of reads.
Commit `fix(55-03): objective-branch reports unpushed commits`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs</verify>
  <done>Tests 8-14 pass; all pre-existing objective-branch tests pass.</done>
  <recovery>If test 13's offline simulation is flaky, point the remote URL at a missing path with `git remote set-url origin /nonexistent` for that test instead of renaming the bare repo.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh pr merge refuses an unpushed linked branch</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs, plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs</files>
  <action>
RED: tests 1-2. Commit `test(55-03): gh pr merge refuses unpushed work`.
GREEN: add `unpushedRefusal` and the guard in `mergeObjectivePr` (placement above). Update the JSDoc refusal list and the CLI
help line. Commit `fix(55-03): gh pr merge refuses while the linked branch has unpushed commits`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs plugins/devflow/devflow/bin/lib/gh-pr.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</verify>
  <done>Tests 1-3 pass; the refusal names `gh pr sync <id>`; every gh-pr suite passes.</done>
  <recovery>If gh-pr-e2e breaks because its lifecycle commits locally without syncing before merge, that test modelled the bug: insert the `gh pr sync` step it skipped and note it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: verification post refuses before writing when the linked branch is ahead</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs</files>
  <action>
RED: tests 4-7. Stub the git answers with objective-branch `_setRunGit` and restore them with `_resetRunGit` in `afterEach`.
Commit `test(55-03): verification post refuses unpushed work`.
GREEN: add the guard to `verificationPost` before `writeThrough` (conditions above), and update the `verificationEnqueue`
JSDoc to say the guard enforces the sync. Commit `fix(55-03): verification post refuses while the linked branch has unpushed commits`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</verify>
  <done>Tests 4-7 pass; local-mode verification post still makes zero gh/git calls; planning-writes.repo.test.cjs still passes.</done>
  <recovery>If the guard needs `prs[obj].branch` and the mapping entry lacks it (a PR recorded before 49-04), skip the guard with no warning: no branch on record means nothing to compare.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs</test_scoped>
</validation_gates>

<verification>
- Scoped suites pass; `npm test` has no new failures (MA-7 only).
- `rg -n "gh pr sync" plugins/devflow/devflow/bin/lib/gh-pr.cjs plugins/devflow/devflow/bin/lib/planning-verbs.cjs` shows the refusal text in the code paths.
</verification>

<success_criteria>
- An unpushed local commit blocks verify-ready and merge, with a message naming `gh pr sync` (OBJECTIVE Success, bullet 3).
- No false refusal when the branch is pushed, absent locally, or the checkout is not a repository.
</success_criteria>

<output>
After completion, publish `55-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Include the exact refusal text, because TRD 55-07 checks it live.
</output>
