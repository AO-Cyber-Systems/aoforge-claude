---
objective: 49-objective-branch-and-pr-lifecycle
trd: "04"
subsystem: git-seam
tags: [objective-branch, git-seam, pr-lifecycle, wiki-diff, seam-guard, temp-remote-fixture, tdd]

requires:
  - objective: 47-github-store
    provides: "gh-wiki.cjs: the git runner pattern (_setRunGit, local(), failureResult/classifyGitFailure), cloneDir, headSha"
  - objective: 46-github-sync
    provides: "gh-seam.repo.test.cjs guard (GUARDED / NO_DIRECT_WRITE / test 20 named git sites)"
provides:
  - "objective-branch.cjs: the one git seam for the objective branch (fetchBranch, switchTo, isTrackedClean, startCommit, push, headSha, remoteTip, currentBranch, branchTip, isAncestor, deleteLocal, listLocal, syncDefault, defaultBranch) behind one spawnSync('git' site with _setRunGit/_resetRunGit"
  - "gh-wiki.diff(root, fromSha, toSha='HEAD'): unified diff of .planning/wiki between two revisions"
  - "__fixtures__/git-remote.cjs makeGitRemote(): hermetic bare origin + clone on main, for 49-09, 49-12, 49-14"
  - "gh-seam.repo.test.cjs: objective-branch.cjs named as the third git site with a reason, in GUARDED and NO_DIRECT_WRITE"
affects: [49-09, 49-11, 49-12, 49-14]

tech-stack:
  added: []
  patterns:
    - "One git site per module family: a single spawnSync('git' in runGit, replaceable via _setRunGit, exposed through a forwarding wrapper"
    - "Every seam function returns {ok:true, ...} or {ok:false, error, stderr}; git failures are results, never throws"
    - "The seam reports facts and enforces only hard refusals (current/default branch, dirty tracked tree, non-ref branch names); force-delete safety is the caller's decision"
    - "Hermetic git tests: bare origin + clone under os.tmpdir(), GIT_CONFIG_GLOBAL=/dev/null, temp HOME, local identity, env installed on process.env and restored by cleanup()"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/objective-branch.cjs
    - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/git-remote.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
    - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "Tip functions (headSha, branchTip, remoteTip) return {ok:true, sha} with sha:null for a missing branch; isAncestor accepts those objects as well as plain shas, so the TRD's shorthand isAncestor(branchTip(b), prHead) works either way"
  - "gh-wiki.diff returns the diff TEXT as a plain string on success ('' = no changes) and {ok:false, reason, error} on failure, exactly as the TRD specifies; callers must test typeof result === 'string', not result.ok"
  - "startCommit refuses when the index has staged changes (git commit --allow-empty would otherwise commit them into the 'empty' start commit)"
  - "deleteLocal protects origin/HEAD's branch plus main and master, with or without force; defaultBranch() is exported so 49-09/49-12 can ask the same question"
  - "fetchBranch uses the explicit refspec +refs/heads/<b>:refs/remotes/origin/<b> so it works in single-branch clones; switchTo tracks origin/<b> and never creates a branch on GitHub's behalf"
  - "No hooks are bypassed by startCommit and no credential helper is injected: the push uses the user's own git credentials for origin"

patterns-established:
  - "Seam guard names a git site by file name with a reason; test 20b pins a new site to exactly one spawn and no gh, and checks that the same source under another name is flagged"
  - "wiki diff validates revisions before git runs (no leading dash: git diff --output=<file> would write a file) and terminates the argv with --"

requirements-completed: [GPR-01, GPR-02, GPR-03, GPR-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-01
tokens_input: 6301071
tokens_output: 65848
tokens_cache_read: 6159879
tokens_cache_write: 141086
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 04: Objective-branch git seam and wiki diff Summary

**One tested git seam (`objective-branch.cjs`, a single named `spawnSync('git'` site) for fetch/switch/empty start commit/push/ancestry/local cleanup of the objective branch, a hermetic `makeGitRemote()` temp-origin fixture, and `gh-wiki.diff()` so verify-pass can post the objective's wiki diff.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-01T15:15Z (preflight claim)
- **Completed:** 2026-10-01T15:23Z
- **Tasks:** 2 (both TDD, RED then GREEN)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `objective-branch.cjs` gives GPR-01 through GPR-04 a single place that runs git against the objective branch: `switchTo` tracks `origin/<branch>` (fetching first if needed) and refuses a dirty tracked tree, `startCommit` makes an empty commit with exactly the caller's message (the caller supplies `Refs #N`), `push` never forces, `deleteLocal` never removes the current or default branch and uses `-d` unless `{force:true}` (`-D`), `isAncestor`/`branchTip`/`remoteTip` give reconcile (49-12) the facts it needs to decide a safe force delete, and `syncDefault` fast-forwards the default branch from origin.
- `makeGitRemote()` builds a temp bare origin plus a clone on `main` (origin/HEAD set, as after `git clone`), installs the hermetic git environment on `process.env` for the module under test, and ships helpers for later TRDs: `commitFile`, `cloneOrigin`, `advanceOrigin`, `createRemoteBranch` (what `createLinkedBranch` does on GitHub), `git`, `run`, `cleanup`.
- `gh-wiki.diff(root, fromSha, toSha='HEAD')` returns the unified `.planning/wiki` diff through gh-wiki's existing `local()` runner; no clone returns `{ok:false, reason:'no-wiki-clone'}` and runs no git.
- The seam guard now names three git sites by file name, each with a reason, and test 20b pins `objective-branch.cjs` to exactly one git spawn, no `gh`, guarded and no-direct-write.

## Task Commits

1. **Task 1 RED:** `f02aaeaa` test(49-04): objective-branch seam (fixture + 25 tests, failing on the missing module)
2. **Task 1 GREEN:** `3a342ae8` feat(49-04): objective-branch git seam
3. **Task 2 RED:** `1ebf84c3` test(49-04): wiki diff; objective-branch is a named git site (4 failing diff tests + seam-guard registration)
4. **Task 2 GREEN:** `1d592902` feat(49-04): wiki diff between revisions

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/objective-branch.cjs` - the git seam (created)
- `plugins/devflow/devflow/bin/lib/objective-branch.test.cjs` - 25 tests, real git in temp repos (created)
- `plugins/devflow/devflow/bin/lib/__fixtures__/git-remote.cjs` - `makeGitRemote()` (created)
- `plugins/devflow/devflow/bin/lib/gh-wiki.cjs` - `diff`, `validRevision`, export (modified)
- `plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs` - tests 10, 10b, 10c, 10d (modified)
- `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` - `objective-branch.cjs` in GUARDED, NO_DIRECT_WRITE and GIT_SITES; test 20 retitled; test 20b added (modified)

## Interfaces for downstream TRDs (49-09, 49-11, 49-12, 49-14)

- Signatures take the checkout first: `listLocal(root, pattern)`, `deleteLocal(root, branch, {force})`, `isAncestor(root, commit, of)`, `push(root, branch, {setUpstream})`, `syncDefault(root, branch?)`.
- `headSha`, `branchTip`, `remoteTip` return `{ok:true, sha}` (`sha:null` when the branch does not exist); read `.sha`.
- `isTrackedClean` returns `{ok, clean, files}`; `switchTo` returns `{ok, branch, switched, created}` or `{ok:false, error, stderr, dirty?}`.
- `gh-wiki.diff` returns a string on success (possibly `''`) and `{ok:false, reason}` otherwise (`no-wiki-clone`, `bad-revision`, `git-failed`): branch on `typeof result === 'string'`.
- `realRunGit` is exported alongside `runGit` (a forwarding wrapper) so tests can wrap the real runner without recursing into their own stub.

## Decisions Made

See `key-decisions` above. The two that matter most downstream: return shapes (tips are objects, wiki diff is a string) and that force deletion is never decided by the seam.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Hardened inputs the TRD did not mention**
- **Found during:** Task 1 and Task 2 design
- **Issue:** `git diff <from>..<to>` with a revision beginning `--output=<file>` would write an arbitrary file; branch names beginning with `-` are options; `git commit --allow-empty` commits staged changes into the "empty" start commit.
- **Fix:** `validBranch`/`validRev` in the seam, `validRevision` plus a trailing `--` in `gh-wiki.diff`, a staged-changes refusal in `startCommit`. All covered by tests (9b, 5b, 10c).
- **Files modified:** objective-branch.cjs, gh-wiki.cjs
- **Commits:** 3a342ae8, 1d592902

**2. [Rule 1 - Bug] My own test 10c asserted the wrong thing for `toSha === undefined`**
- **Found during:** Task 2 GREEN, before running the implementation
- **Issue:** `diff(root, 'HEAD', undefined)` legitimately defaults `toSha` to `HEAD`; the RED commit asserted `bad-revision` for it, which no implementation of the specified default could satisfy.
- **Fix:** the assertion skips `undefined` for `toSha`. The correction is in the GREEN commit (1d592902), not the RED commit.

### Scope notes (additive, not corrections)

- Exported `defaultBranch` and `realRunGit`, which the TRD's function list does not name. `deleteLocal` needs the default-branch rule; 49-09/49-12 will need the same answer rather than re-deriving it.
- Test 20's `GIT_SITES` map and the git-spawn regex moved from inside the test to file scope so test 20b can assert against the same data. Test 20's assertions are unchanged apart from its title.
- The seam-guard registration in Task 2 is test-only configuration over the module written in Task 1, so the RED commit's failing tests are the four `wiki.diff` tests; the guard tests were green at that commit by construction.

### Process note (not a code deviation)

The first `exec-context check` ran from the main checkout's cwd and, passing, recorded a claim for plan 49-04 on the main checkout instead of the worktree. I released only that claim (`exec-context release --id 49-04`) and re-ran the check rooted in the worktree with the global `--cwd` flag (`checkout` = `.../.df-worktrees/devflow-claude/49-04`, branch `df/exec-49-04`, base visible). Because the Bash tool's cwd stays at the main checkout, every df-tools call in this run used `--cwd <worktree>` and every file path was absolute.

**Pre-existing, out of scope:** none found; test 20 reported no other module spawning git.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: makeGitRemote fixture and objective-branch seam | `node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs` | 0 (25 pass, 0 fail) | PASS |
| 2: gh-wiki diff and seam-guard registration | `node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` | 0 (70 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../objective-branch.test.cjs` | 1 (Cannot find module './objective-branch.cjs') | FAIL (correct) |
| GREEN (Task 1) | `node --test .../objective-branch.test.cjs` | 0 (25/25) | PASS (correct) |
| RED (Task 2) | `node --test .../gh-wiki.test.cjs` | 1 (4 fail: `wiki.diff is not a function`; 59 pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test .../gh-wiki.test.cjs .../gh-seam.repo.test.cjs` | 0 (70/70) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../objective-branch.test.cjs .../gh-wiki.test.cjs` | 0 | PASS |
| regression | `node --test ".../lib/gh-*.test.cjs" .../gh-seam.repo.test.cjs .../objective-branch.test.cjs` | 0 (1250 pass, 0 fail) | PASS |
| repo guards (extra) | `node --test ".../lib/*.repo.test.cjs"` | 0 (35 pass, 0 fail) | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 truths (seam functions and single named spawn site; startCommit; switchTo tracking and dirty refusal; deleteLocal rules; isAncestor/branchTip; wiki diff; makeGitRemote; guard registration)
- Gate failures: None

## Issues Encountered

None beyond the preflight cwd slip described above. No real `gh`, network, `~/.claude`, or port was touched; every git remote in the tests is a local bare repo under `os.tmpdir()`. `git status` in the worktree was clean after each test run (only the intended new files).

## Next Phase Readiness

49-09 can call `fetchBranch`/`switchTo`/`startCommit`/`push`; 49-11 can call `gh-wiki.diff(main, wiki_base_sha)`; 49-12 can call `syncDefault`, `listLocal`, `branchTip`, `isAncestor`, `deleteLocal`; 49-14 can build its e2e on `makeGitRemote()`.

## Self-Check: PASSED

- All 6 TRD files plus this SUMMARY exist in the worktree.
- Commits `f02aaeaa`, `3a342ae8`, `1ebf84c3`, `1d592902` are on `df/exec-49-04` in RED-then-GREEN order.
- `objective-branch.cjs` contains exactly one `spawnSync('git'` line.
