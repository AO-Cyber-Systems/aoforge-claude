---
objective: quick-28
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/micro.cjs
  - plugins/devflow/devflow/bin/lib/micro.test.cjs
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "`commitMicro({ files: ['b.md'] })` with an unrelated staged a.md produces a source commit containing exactly b.md"
    - "After that commit a.md is still staged (`git diff --cached --name-only` lists it) with its staged content unchanged"
    - "The STATE.md follow-up commit holds only .planning/STATE.md (plus the .planning/.skill-active deletion when the marker was tracked), never the unrelated staged file"
    - "A tracked .planning/.skill-active deleted by endSkill is recorded as a deletion in the STATE.md commit (no ` D .planning/.skill-active` left in the tree)"
    - "A `--files` path with no changes fails with reason commit-failed instead of committing whatever else was staged"
    - "Without --files (files: null) behaviour is unchanged: commit what is staged, else tracked modifications, never untracked (NS-1..NS-3, F1-6..F1-10 still green)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/micro.cjs
      provides: "_defaultGitRunner appends `-- <files...>` to `git commit` when opts.files is non-empty"
    - path: plugins/devflow/devflow/bin/lib/micro.test.cjs
      provides: "describe('commitMicro: --files scopes the commit (#120)') cases FS-1..FS-4"
    - path: CHANGELOG.md
      provides: "[Unreleased] ### Fixed bullet for #120"
  key_links:
    - from: "commitMicro source commit (~line 330) and STATE.md commit (~line 434)"
      to: "_defaultGitRunner (~line 158)"
      via: "both call runner(projectRoot, { message, files }), so one pathspec fix scopes both commits"
---

# Quick 28: `micro commit --files` commits only the named paths (#120)

## Objective

`df-tools micro commit --files <paths>` stages the named paths and then runs a whole-index
`git commit -m <message>` (`micro.cjs` `_defaultGitRunner`, commit at ~line 191, no pathspec).
Anything the user had already staged goes into the micro's commit. The STATE.md follow-up commit
in `commitMicro` (~line 434) goes through the same runner with
`files: ['.planning/STATE.md'(, '.planning/.skill-active')]`, so it sweeps in the same way.

Fix: when `opts.files` is non-empty, run `git commit -m <message> -- <files...>`. Unrelated staged
changes stay staged and stay out of both commits. The `files: null` path is not touched.

Diagnosis is confirmed. Do not re-investigate broadly. Kind `plugin`, work `bugfix`: RED commit,
then GREEN commit.

## Context

Current runner (`plugins/devflow/devflow/bin/lib/micro.cjs`, lines 158-201, abridged):

```js
function _defaultGitRunner(cwd, opts) {
  const safeEnv = { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' };
  if (opts.files && opts.files.length > 0) {
    for (const f of opts.files) {
      const addResult = spawnSync('git', ['add', f], { cwd, encoding: 'utf8', env: safeEnv });
      if (addResult.status !== 0) return { exitCode: addResult.status ?? 1, stdout: '', stderr: addResult.stderr || '' };
    }
  } else {
    // files: null → commit what is staged, else `git add -u`; refuse if still nothing. LEAVE AS IS.
  }
  // Commit
  const commitResult = spawnSync('git', ['commit', '-m', opts.message], { cwd, encoding: 'utf8', env: safeEnv });
  return { exitCode: commitResult.status ?? 1, stdout: (commitResult.stdout || '').trim(), stderr: (commitResult.stderr || '').trim() };
}
```

STATE.md follow-up (`commitMicro`, ~lines 405-437): `endSkill()` deletes `.planning/.skill-active`
first. If `git ls-files --error-unmatch .planning/.skill-active` succeeds (the marker is tracked),
the marker is pushed onto `stateFiles`, and `git add` on that deleted tracked path stages the
deletion. A pathspec commit must still record it. It will, because the path is in HEAD.

Test harness (`micro.test.cjs`): `mkGitAmbient()` (lines 25-39) makes a temp repo with
`README.md` committed and an **untracked** 5-column `.planning/STATE.md`. Tests drive real git
with `spawnSync('git', [...], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } })`.
The `describe('commitMicro: atomic STATE.md (F1)')` block (line 371) sets
`process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1'` in `beforeEach` and deletes it plus calls
`_resetMocks()` in `afterEach`. Mirror that exactly. `headFiles(root)` (line 409) is local to that
block, so define your own helpers in the new block. Baseline: `node --test .../micro.test.cjs`
reports 32 pass / 0 fail.

## Test list (outermost = `commitMicro` with the real git runner, `gitRunner: null`)

Shared setup for every case: `env = mkGitAmbient()`, then seed `a.md` (`a\n`) and `b.md` (`b\n`)
and commit them (`chore: seed`) so both are tracked. Then
`startMicro({ planningDir, description, pid: 1, now: '2026-05-06T00:00:00Z' })`.
Unrelated staged change: write `a.md` = `a staged\n`, then `git add a.md`.

1. **FS-1 happy (the bug):** modify `b.md` (do not stage it). `commitMicro({ files: ['b.md'], gitRunner: null, now: '2026-05-06T00:01:00Z' })`.
   Expect: `ok:true`; `git show --name-only --format= HEAD~1` is exactly `['b.md']`;
   `git show --name-only --format= HEAD` is exactly `['.planning/STATE.md']`;
   `git diff --cached --name-only` is exactly `['a.md']`; `git show :a.md` is `a staged\n`.
2. **FS-2 happy (new file via --files):** create untracked `new.txt`. `files: ['new.txt']`.
   Expect: HEAD~1 is exactly `['new.txt']`; `a.md` is still the only staged path. This proves a
   pathspec commit works for a path that was untracked until the runner's `git add`.
3. **FS-3 edge (tracked marker deletion):** after `startMicro`, `git add .planning/.skill-active`
   and commit it (`chore: track marker`) so the marker is tracked. Then stage `a.md` and modify
   `b.md`, and call with `files: ['b.md']`. Expect: HEAD~1 is exactly `['b.md']`;
   `git show --name-status --format= HEAD` contains `D\t.planning/.skill-active` and a
   `.planning/STATE.md` line and no `a.md` line; no `git status --porcelain` line mentions
   `.skill-active`; the line `M  a.md` is present (it is staged and not committed).
4. **FS-4 failure (named path unchanged):** leave `b.md` untouched and call with `files: ['b.md']`.
   Expect: `ok:false`, `reason === 'commit-failed'`; `git rev-parse HEAD` unchanged;
   `a.md` still staged; `.planning/.skill-active` still exists on disk (the commit-failed path
   returns before `endSkill`).

Regression guards that must stay green without edits: NS-1, NS-2, NS-3, F1-6..F1-10, the mock-runner
`happy with files` test, and e2e-1.

<embedded_context>
<codebase_examples>
- Raw git inside tests: `spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } })` (micro.test.cjs:387).
- Name list of a commit: `spawnSync('git', ['show', '--name-only', '--format=', 'HEAD~1'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)` (micro.test.cjs:410).
- Suggested local helper for the new block: `const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });` and `const lines = (s) => s.split('\n').filter(Boolean);`. Do not `.trim()` porcelain output before splitting, because trimming eats the leading space of ` D`/` M` lines.
</codebase_examples>
<anti_patterns>
- Do not "fix" by unstaging the user's other paths (`git reset`, `git stash`, `git restore --staged`) and restoring them afterwards. That is destructive to the user's index and loses partial (`add -p`) staging.
- Do not use `git commit -a` or `git add -A` anywhere.
- Do not change the `files: null` branch or its refusal message.
- No property-based tests and no generated fixtures. Use hand-written file contents, as in the test list (constraints `no_property_based_default`, `no_llm_test_data`).
</anti_patterns>
<error_recovery>
- `pathspec '<p>' did not match any file(s) known to git` from the commit means a path was not `git add`ed first, or is a never-tracked path that was deleted. The runner adds every path before committing, and `commitMicro` only lists the marker when `ls-files` says it is tracked. Check that the `add` loop still runs before the commit.
- If FS-3 shows ` D .planning/.skill-active` lingering, the marker path was dropped from the STATE.md commit's pathspec. Confirm that `stateFiles` reaches the runner unchanged.
</error_recovery>
</embedded_context>

<gotchas>
- `git commit -- <paths>` has `--only` semantics. It commits the working-tree content of exactly those paths and leaves the rest of the index as it was. Paths must be known to git, in the index or in HEAD. Both hold here.
- `--` is required so that a path starting with `-` is not parsed as an option.
- A partial (pathspec) commit is refused during an in-progress merge ("cannot do a partial commit during a merge"). This is accepted: git's stderr surfaces through `commit-failed`. Do not add merge handling.
- The PreToolUse commit gate blocks raw `git commit` typed into Bash (including compound commands with an inline env prefix). Do not experiment with raw commits in the shell. Put the behaviour in tests (spawnSync is not gated) and commit through `df-tools commit`.
- Mock-runner tests inject `gitRunner` and never reach `_defaultGitRunner`, so they are unaffected.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>RED: --files scoping regression tests (FS-1..FS-4)</name>
  <files>plugins/devflow/devflow/bin/lib/micro.test.cjs</files>
  <action>
Add `describe('commitMicro: --files scopes the commit (#120)', ...)` directly after the
`describe('commitMicro: atomic STATE.md (F1)')` block closes (before `describe('abortMicro'`).
Give it the same beforeEach/afterEach as the F1 block (`mkGitAmbient()`,
`process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1'`, cleanup with `fs.rmSync`, delete the env var,
`_resetMocks()`). Add a local `seed(env)` that writes `a.md`/`b.md`, stages both and commits
`chore: seed`, and add the `git`/`lines` helpers from codebase_examples. Implement test-list cases
FS-1..FS-4 with `gitRunner: null`, and put the case id in each test name
(e.g. `'FS-1: --files b.md leaves an unrelated staged a.md staged and out of both commits'`).

Run the file. FS-1..FS-4 must all fail for the right reason: HEAD~1 contains `a.md`, or FS-4
returns ok:true. The other 32 tests must pass. Commit:
`node ~/.claude/devflow/bin/df-tools.cjs commit "test(micro): micro commit --files must not sweep unrelated staged changes (#120)" --files plugins/devflow/devflow/bin/lib/micro.test.cjs`
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` gives 4 failures (FS-1..FS-4), each from an a.md-swept or ok:true assertion rather than a setup error, and 32 passes.</verify>
  <done>RED commit exists with only micro.test.cjs; the failures demonstrate #120.</done>
  <recovery>If a case fails in setup (seed commit, startMicro), fix the fixture before committing. A RED caused by a broken fixture is not a valid RED.</recovery>
</task>

<task type="auto" tdd="true">
  <name>GREEN: pathspec-limit the --files commit + CHANGELOG</name>
  <files>plugins/devflow/devflow/bin/lib/micro.cjs, CHANGELOG.md</files>
  <action>
In `_defaultGitRunner`, replace the fixed commit argv:

```js
const commitArgs = ['commit', '-m', opts.message];
// Pathspec-limit an explicit list: a whole-index commit swept the user's
// unrelated staged changes into the micro (#120). `--` keeps paths from
// being read as options; a staged deletion of a listed path is still recorded.
if (opts.files && opts.files.length > 0) commitArgs.push('--', ...opts.files);
const commitResult = spawnSync('git', commitArgs, { cwd, encoding: 'utf8', env: safeEnv });
```

Also update the prose. Extend the staging comment (~line 161) to say that an explicit list is
staged and committed by pathspec, so other staged changes stay staged. Update the `commitMicro`
JSDoc `@param opts.files` (~line 285) to "files to stage and commit (pathspec-limited; unrelated
staged changes stay staged); null = …". Fix the stale comment at ~lines 415-420: it still says
the marker gets tracked by "`git add .` from a null `files` arg", but that fallback no longer
exists. It should say the marker is listed only when it is already tracked in the repository.
Make no other logic changes.

CHANGELOG.md: append a bullet at the end of `## [Unreleased]` → `### Fixed`, the list that ends just
before `### Deprecated`. Find it with `rg -n '^### (Fixed|Deprecated)' CHANGELOG.md`. Use this wording or something close:
"**`df-tools micro commit --files` commits only the named paths** (#120). It staged the named
files and then ran a whole-index `git commit`, so anything already staged went into the micro's
commit, and the STATE.md follow-up commit could sweep it in the same way. Both commits now pass the
paths as a pathspec (`git commit -- <files>`), and unrelated staged changes stay staged. A
`--files` path with no changes now fails instead of committing whatever else was staged. Without
`--files` nothing changes."

Commit:
`node ~/.claude/devflow/bin/df-tools.cjs commit "fix(micro): scope micro commit --files to the named paths (#120)" --files plugins/devflow/devflow/bin/lib/micro.cjs CHANGELOG.md`
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` gives 36 pass / 0 fail, then `npm test` is green.</verify>
  <done>FS-1..FS-4 pass, all prior micro tests pass, the full suite is green, and the GREEN commit contains only micro.cjs + CHANGELOG.md.</done>
  <recovery>If NS-*/F1-* regress, the null-files branch was touched. Revert to the single `commitArgs.push` guarded by `opts.files && opts.files.length > 0`. If e2e-1 fails, check that the CLI passes `files` as null (not `[]`) when `--files` is absent (micro.cjs ~line 579). It already does, so the cause is elsewhere.</recovery>
</task>

</tasks>

<validation_gates>
- `npm test` (stack profile `gates.task: [test]`; scoped form: `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs`)
</validation_gates>

## Success criteria

- FS-1..FS-4 fail at the RED commit and pass at the GREEN commit. The full suite is green.
- The diff to `micro.cjs` is the commit-argv change plus comments only. The `files: null` branch is byte-identical.
- There are two commits, both referencing #120: `test(micro): …` and then `fix(micro): …`.
