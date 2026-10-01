---
objective: 49-objective-branch-and-pr-lifecycle
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/objective-branch.cjs
  - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/git-remote.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GPR-01, GPR-02, GPR-03, GPR-04]
must_haves:
  truths:
    - "`objective-branch.cjs` is the one git seam for the objective branch: `fetchBranch`, `switchTo`, `isTrackedClean`, `startCommit`, `push`, `headSha`, `remoteTip`, `currentBranch`, `branchTip`, `isAncestor`, `deleteLocal(root, branch, {force})`, `listLocal(pattern)`, `syncDefault`, all through one named `spawnSync('git'` site with `_setRunGit`"
    - "`startCommit(root, message)` makes an empty commit with the exact message given (the caller supplies the `Refs` trailer) and returns its sha"
    - "`switchTo` tracks `origin/<branch>` when no local branch exists and refuses (ok:false) when tracked files are modified"
    - "`deleteLocal` never deletes the current branch or the default branch; without `force` it uses `git branch -d` (refuses an unmerged branch, ok:false), with `{force:true}` `git branch -D`"
    - "`isAncestor(root, commit, of)` runs `git merge-base --is-ancestor` and returns `{ok:true, ancestor:boolean}` (exit 1 = false, other failures ok:false); `branchTip(root, branch)` returns the local branch sha"
    - "`gh-wiki.diff(root, fromSha, toSha='HEAD')` returns the unified diff of `.planning/wiki` between two revisions through gh-wiki's existing `local()` runner; no clone → `{ok:false, reason:'no-wiki-clone'}`"
    - "`__fixtures__/git-remote.cjs` `makeGitRemote()` builds a temp bare origin plus a clone on `main` with one commit, hermetic (`GIT_CONFIG_GLOBAL=/dev/null`, local identity)"
    - "The seam guard names `objective-branch.cjs` as a git site with a reason, and lists it in GUARDED and NO_DIRECT_WRITE"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective-branch.cjs
      provides: "objective-branch git seam"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/git-remote.cjs
      provides: "makeGitRemote() for 49-09, 49-12, 49-14"
    - path: plugins/devflow/devflow/bin/lib/gh-wiki.cjs
      provides: "diff(root, fromSha, toSha)"
  key_links:
    - "Consumed by 49-09 (start: fetch/switch/startCommit/push), 49-11 (wiki diff on verify pass), 49-12 (reconcile: syncDefault, deleteLocal, listLocal df/exec-*)"
---

# TRD 49-04: Objective-branch git seam and wiki diff

<objective>
Give the PR lifecycle a single, testable place that runs git against the objective branch, a shared temp-remote fixture, and a wiki diff
that verify-pass can post to the PR.

Purpose: GPR-01 (switch to the linked branch, start commit, push), GPR-02 (the orchestrator stands on the objective branch so worktrees
branch from and merge into it), GPR-03 (wiki diff), GPR-04 (local branch cleanup). Output: one new module, one gh-wiki function, fixture.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-04): ...`), then implementation (`feat(49-04): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Tests run real git only inside temp dirs from `makeGitRemote()` with `GIT_CONFIG_GLOBAL=/dev/null`, `HOME` set to a temp dir and a
  local `user.name`/`user.email`. Never touch the real `~/.claude` or the repo's own `.git`; never port 8080.
- No `gh` calls in this module (NO_DIRECT_WRITE, and it does not require gh-client at all).

## Decisions

- **One git site**: `objective-branch.cjs` holds `const GIT_SITE = 'objective-branch'` and a single `spawnSync('git', ...)` in `runGit`,
  replaceable via `_setRunGit(fn)` / `_resetRunGit()`. gh-seam test 20 names it, with the reason "the objective branch / PR lifecycle
  (objective 49): fetch, switch, empty start commit, push, local cleanup".
- **Start commit is DevFlow's own commit** inside a df-tools verb (`gh pr start`), so it does not go through `df-tools commit`; the
  `gate-commits` hook only intercepts the Bash tool and is unaffected. The caller passes the full message including `Refs #N`.
- **Dirty check** is tracked files only (`git status --porcelain --untracked-files=no`): in store mode `.planning/` is gitignored cache.
- **Return shapes**: every function returns `{ok:true, ...}` or `{ok:false, error, stderr}`; none throws for git failures.
- **Force delete is the caller's decision**: after a squash merge every objective/exec branch is "unmerged" to git (`-d` refuses), so
  `deleteLocal` offers `{force}`; the seam does not decide safety. Reconcile (49-12) forces only when `isAncestor(branchTip, prHeadSha)`.
- **Wiki diff**: `git -C .planning/wiki diff --no-color <from>..<to>`; an empty string is a valid "no changes" result.

## Test list

1. `makeGitRemote()` → `{origin, work, cleanup}`; `work` is on `main` with one commit; `git ls-remote origin` lists `refs/heads/main`.
2. `remoteTip(work, 'main')` equals `headSha(work)`; `remoteTip(work, 'nope')` → `{ok:true, sha:null}`.
3. Create `df/objective-49-x` on origin at main's tip (simulating `createLinkedBranch`), then `fetchBranch` + `switchTo` → current branch is
   `df/objective-49-x`, upstream `origin/df/objective-49-x`.
4. `switchTo` with a modified tracked file → `{ok:false}` with an error naming the file; untracked files do not block.
5. `startCommit(work, 'chore(49): start objective 49\n\nRefs #120')` → new sha, `git log -1 --format=%B` equals the message, no files changed.
6. `push(work, 'df/objective-49-x', {setUpstream:true})` → origin's branch tip equals local head.
7. `listLocal(work, 'df/exec-*')` lists two branches created in the test; `deleteLocal(work, 'df/exec-49-01')` removes a merged one;
   `deleteLocal` on the current branch or `main` → `{ok:false}` (also with `force`).
7a. A branch with a commit not on main: `deleteLocal(work, b)` → `{ok:false}`, branch kept; `deleteLocal(work, b, {force:true})` → deleted
    (argv `branch -D`).
7b. `isAncestor(work, branchTip(work, b), headSha(work))` → true when `b` is merged into HEAD's history, false for a diverged branch;
    a bad sha → `{ok:false}`.
8. `syncDefault(work, 'main')` switches to main and fast-forwards from origin (origin advanced by a second clone in the test).
9. `_setRunGit(stub)` captures argv: `push` sends `['push','-u','origin','df/objective-49-x']`; `_resetRunGit()` restores.
10. gh-wiki `diff`: temp wiki clone with two commits → diff contains the changed page; `diff(root, sha, sha)` → `''`; root without
    `.planning/wiki/.git` → `{ok:false, reason:'no-wiki-clone'}`.
11. gh-seam test 20 passes with `objective-branch.cjs` named; a copy of the module under another name would fail it (the guard is by name).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: makeGitRemote fixture and objective-branch seam (tests 1-9)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/git-remote.cjs, plugins/devflow/devflow/bin/lib/objective-branch.cjs, plugins/devflow/devflow/bin/lib/objective-branch.test.cjs</files>
  <action>
RED: write `__fixtures__/git-remote.cjs` (fixture, not production) and tests 1-9 (with 7a, 7b); commit `test(49-04): objective-branch seam`.
GREEN: implement `objective-branch.cjs` per the decisions. Commit `feat(49-04): objective-branch git seam`.
# PATTERN: mirror gh-wiki's `_setRunGit` (L354) and `local()` (L407) shape so both git seams read alike.
# GOTCHA: `git switch --track origin/<b>` needs the remote ref fetched first; `switchTo` fetches if `origin/<b>` is missing.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs</verify>
  <done>Tests 1-9 pass in temp repos only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh-wiki diff and seam-guard registration (tests 10-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</files>
  <action>
RED: test 10 in gh-wiki.test.cjs; in gh-seam.repo.test.cjs add `objective-branch.cjs` to `GIT_SITES` (L121, with the reason above),
`GUARDED` (L29) and `NO_DIRECT_WRITE` (L45). Commit `test(49-04): wiki diff; objective-branch is a named git site`.
GREEN: `gh-wiki.diff(root, fromSha, toSha = 'HEAD')` through `local()`; export it. Update test 20's title to mention three sites.
Commit `feat(49-04): wiki diff between revisions`. Run the gh-* suite and the seam guard.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Tests 10-11 pass; seam guard green; gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-wiki.cjs`: `pageRevisionUrl` L296, `_setRunGit` L354, `local(dir, args)` L407, `headSha(root)` L527.
- `gh-seam.repo.test.cjs`: GUARDED L29, NO_DIRECT_WRITE L45, test 20 `GIT_SITES` L121 (exceptions are named, not pattern-matched).
- `exec-context.cjs` L378-462: worktrees are created from an explicit `--base` and merged into the cwd checkout; no change needed there.
</codebase_examples>
<anti_patterns>
- `gh issue develop --checkout` (runs git inside gh, invisible to this seam).
- `git switch -c` on the objective branch: the branch is created on GitHub by `createLinkedBranch`; locally we only track it.
</anti_patterns>
<error_recovery>
- If test 20 fails because another module's `spawnSync('git'` appears, it is pre-existing and out of scope; report it, do not widen GIT_SITES.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- Seam guard green with three named git sites.
</verification>

<success_criteria>
Every git operation the PR lifecycle needs is one tested function behind one named seam, and verify-pass can compute the objective's wiki diff.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-04-SUMMARY.md`
</output>
