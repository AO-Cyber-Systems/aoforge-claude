---
mode: quick
id: 24-objective-44-follow-ups
title: "Objective-44 follow-ups: files_modified in job index, planning-only commit gates, REBASE_HEAD fixture comment"
type: standard
tasks: 3
context_target: ~30%
files_modified:
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/df-tools.test.cjs
  - plugins/devflow/hooks/__fixtures__/gate-fixtures.js
  - CHANGELOG.md
must_haves:
  observable_truths:
    - "`df-tools objective-job-index <N>` on a TRD whose frontmatter has a `files_modified:` YAML block list reports those paths in `jobs[i].files_modified`. The legacy `files-modified:` key still works. When both keys are present, `files_modified` wins."
    - "`df-tools commit <msg> --files src/a.js .planning/STATE.md` with `commit_docs: false` commits src/a.js, leaves .planning/STATE.md out of HEAD, and returns `{committed: true, hash, reason: 'committed', skipped_planning: ['.planning/STATE.md']}`."
    - "The same holds when `.planning` is gitignored: the code file is committed and the planning path is listed in `skipped_planning`."
    - "When every requested path is a planning path (including the no --files default of `.planning/`), the result is exactly today's: `{committed: false, hash: null, reason: 'skipped_commit_docs_false' | 'skipped_gitignored'}`, raw output `skipped`, and HEAD does not move."
    - "When nothing was dropped, the result has no `skipped_planning` key. Result shapes seen by existing callers do not change."
    - "The existing commit suites (pathspec isolation, commit-failure, commit-staged-removal) still pass."
    - "The gate-fixtures.js header comment no longer names REBASE_HEAD as an in-progress marker. It says only `rebase-merge/` and `rebase-apply/` count, and that the `rebase-head` state models a stale marker."
  artifacts:
    - "misc.cjs: cmdObjectiveJobIndex (around lines 297-300) reads `fm.files_modified ?? fm['files-modified']`."
    - "misc.cjs: cmdCommit (around lines 509-520) applies the gates to `.planning/` paths only, through a small `isPlanningPath(cwd, p)` helper."
    - "df-tools.test.cjs: new cases in the existing `describe('objective-job-index command')` (line ~627) and `describe('commit command pathspec isolation')` (line ~1581) blocks."
    - "CHANGELOG.md: two `### Fixed` lines under `## [Unreleased]`."
  key_links:
    - "The planning-path filter runs BEFORE `stagedRemovalsOnDisk(cwd, filesToStage)`, so the TRD 44-06 removal detection, `removal.specs`, and the foreign-index check see only the filtered list. A staged planning path then counts as foreign and is never swept in."
    - "`merge_in_progress` and `commit_failed` report `staged: filesToStage`, which is the filtered list."
---

<objective>
Close three follow-ups from objective 44 under strict TDD. Commit each failing test (RED) before its fix (GREEN).

1. `objective-job-index` ignores the `files_modified` key that TRDs actually use. As a result, `files_modified` is always `[]` and the ">8 files → opus" executor-model rule never fires.
2. `commit_docs: false` or a gitignored `.planning` currently skips the whole commit, including code passed via `--files`. Those gates should apply to `.planning/` paths only.
3. A stale fixture comment still lists REBASE_HEAD as an in-progress marker.

Also add a CHANGELOG `[Unreleased]` entry for items 1 and 2.
</objective>

<context>
Project kind is `plugin` (the DevFlow repo). The user asked for strict TDD, so the failing test lands in its own `test(...)` commit before each fix. Commit only through `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Raw git commit is gated.

Test runner: `npm test` runs the full suite. For a single file, use `node --test plugins/devflow/devflow/bin/df-tools.test.cjs`.

Do NOT create new test files or helpers. Extend the existing blocks:
- `describe('objective-job-index command')` at df-tools.test.cjs:627. The model case is `extracts single job with frontmatter` at ~:652. It uses `createTempProject()` and `runGsdTools('objective-job-index 03', tmpDir)`.
- `describe('commit command pathspec isolation')` at df-tools.test.cjs:1581. It has `initGitRepo(dir)` and a `beforeEach` that builds a temp git repo with an initial commit. Only temp repos, never this repo.

`extractFrontmatter` already parses YAML block lists. Verified: `files_modified:\n  - a.cjs\n  - b.cjs` gives `["a.cjs","b.cjs"]`. No parser change is needed.

Constraints: hand-built fixtures only (no generated data, no property-based tests, no .feature files).
</context>

<embedded_context>
<codebase_examples>
Current job-index read (misc.cjs ~297):
```js
let filesModified = [];
if (fm['files-modified']) {
  filesModified = Array.isArray(fm['files-modified']) ? fm['files-modified'] : [fm['files-modified']];
}
```

Current commit gates (misc.cjs ~509-524):
```js
if (!config.commit_docs) { output({ committed: false, hash: null, reason: 'skipped_commit_docs_false' }, raw, 'skipped'); return; }
if (isGitIgnored(cwd, '.planning')) { output({ committed: false, hash: null, reason: 'skipped_gitignored' }, raw, 'skipped'); return; }
const filesToStage = files && files.length > 0 ? files : ['.planning/'];
const removal = amend ? null : stagedRemovalsOnDisk(cwd, filesToStage);   // TRD 44-06
```

Temp-repo test pattern (df-tools.test.cjs ~1604):
```js
const result = runGsdTools('commit "test(quick-3): isolation" --files .planning/STATE.md', tmpDir);
const showResult = execSync('git show --name-only --format= HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
```
</codebase_examples>

<anti_patterns>
- Do not move the planning gate after `stagedRemovalsOnDisk`. The removal specs and foreign-index check must see the filtered list.
- Do not change the reason strings, the raw `skipped` output, or the no-`--files` default. Callers such as workflows and hooks match on them.
- Do not add `skipped_planning: []` when nothing was dropped.
- Do not call `isGitIgnored` when `commit_docs` is already false. Keep the gate order: commit_docs first, then gitignore.
- Do not touch the amend argument shape (`commit --amend --no-edit`, no pathspecs). Only the `git add` loop sees the filtered list.
</anti_patterns>

<error_recovery>
- If the gitignored test's `git add` of a planning path prints "paths are ignored" noise, the filter did not drop the path before the add loop. Fix the ordering.
- If a commit-staged-removal test fails, check that `filesToStage` (the filtered list) is what reaches `stagedRemovalsOnDisk`, and that `requested` is not what reaches it.
</error_recovery>
</embedded_context>

## Test list

Job index (outermost: CLI JSON):
1. A TRD with a `files_modified:` YAML block list gives `files_modified` equal to those paths.
2. `files_modified` and `files-modified` both present: `files_modified` wins.
3. Legacy `files-modified` inline array still works. Already covered by the existing test at ~:652, so keep it green.

Commit (outermost: CLI JSON plus temp-repo HEAD contents):
4. `commit_docs:false`, `--files src/a.js .planning/STATE.md`: committed. HEAD has src/a.js and not STATE.md. `skipped_planning` is `['.planning/STATE.md']`.
5. `.planning/` in .gitignore (commit_docs true), `--files src/a.js .planning/STATE.md`: committed. HEAD has src/a.js. `skipped_planning` is `['.planning/STATE.md']`.
6. `commit_docs:false`, only `--files .planning/STATE.md`: deepStrictEqual `{committed:false, hash:null, reason:'skipped_commit_docs_false'}`, and HEAD is unchanged.
7. `.planning` gitignored, no `--files`: deepStrictEqual `{committed:false, hash:null, reason:'skipped_gitignored'}`, and HEAD is unchanged.
8. `commit_docs:false`, only `--files src/a.js`: committed, and the result has no `skipped_planning` key.
9. `./.planning/STATE.md` spelling is treated as a planning path: dropped and listed in `skipped_planning`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: objective-job-index accepts files_modified (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs</files>
  <action>
RED: in `describe('objective-job-index command')` (df-tools.test.cjs ~:627), add test-list cases 1 and 2. Write `03-01-TRD.md` under `.planning/objectives/03-api/` with frontmatter `wave: 1`, `autonomous: true`, and
```
files_modified:
  - plugins/x/a.cjs
  - plugins/x/b.cjs
```
plus one `<task type="auto"><name>x</name></task>` body. Assert `output.jobs[0].files_modified` deepEquals both paths. Case 2 writes both keys with different values and asserts the `files_modified` values. Run `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` and confirm the new cases fail (actual `[]`). Commit: `test(quick-24): objective-job-index reads files_modified (RED)`.

GREEN: in misc.cjs (~:297-300), replace the read with:
```js
const fmFiles = fm.files_modified ?? fm['files-modified'];
if (fmFiles) filesModified = Array.isArray(fmFiles) ? fmFiles : [fmFiles];
```
Update the comment to "Parse files_modified (TRD key; legacy files-modified accepted)". Rerun and commit: `fix(quick-24): objective-job-index accepts files_modified key`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/df-tools.test.cjs` passes, including the existing `extracts single job with frontmatter` test.</verify>
  <done>A TRD's `files_modified` list shows up in the index. The legacy key still works. There are two commits, RED then GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: cmdCommit gates apply only to .planning/ paths (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs</files>
  <action>
RED: in `describe('commit command pathspec isolation')` (df-tools.test.cjs ~:1581), add test-list cases 4-9. Each case uses the block's `beforeEach` temp repo.
- Set commit_docs false by writing `.planning/config.json` = `{"commit_docs":false}`.
- Gitignore `.planning` by writing `.gitignore` = `.planning/\n` and committing it with `DEVFLOW_ALLOW_RAW_COMMIT=1` in the env, or include `.gitignore` in the `--files` of an earlier step. Pick one approach and use it consistently.
- Create `src/a.js` with fixed content.
- For "HEAD unchanged", capture `git rev-parse HEAD` before and after.
Run the new cases and confirm cases 4, 5, 8 and 9 fail. Cases 6 and 7 should already pass, since they are regression locks. Commit: `test(quick-24): commit gates apply to .planning paths only (RED)`.

GREEN: in misc.cjs cmdCommit, replace the two early returns (~:509-521):
```
const requested = files && files.length > 0 ? files : ['.planning/'];
const blocked = !config.commit_docs ? 'skipped_commit_docs_false'
              : isGitIgnored(cwd, '.planning') ? 'skipped_gitignored' : null;
let filesToStage = requested, skippedPlanning = [];
if (blocked) {
  skippedPlanning = requested.filter(f => isPlanningPath(cwd, f));
  filesToStage   = requested.filter(f => !isPlanningPath(cwd, f));
  if (filesToStage.length === 0) { output({ committed:false, hash:null, reason: blocked }, raw, 'skipped'); return; }
}
```
Then delete the old `const filesToStage = ...` line. Everything below (TRD 44-06 `stagedRemovalsOnDisk`, add loop, merge check, foreign-index check) keeps using `filesToStage` unchanged.

Add a module-private helper next to `stagedRemovalsOnDisk`: `isPlanningPath(cwd, p)`. It resolves `p` against `cwd`, takes `path.relative(cwd, abs)`, converts it to POSIX separators, and returns true when the result is `.planning` or starts with `.planning/`.

In the final success result, and in the `nothing_to_commit` result, spread `...(skippedPlanning.length ? { skipped_planning: skippedPlanning } : {})`. Raw output strings stay the same.

Add a short comment above the gate: "Gates cover planning docs only; code passed via --files still commits (quick-24)."

Rerun, then run `node --test plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs plugins/devflow/devflow/bin/lib/commit-failure.test.cjs`. Commit: `fix(quick-24): commit_docs/gitignore gates skip only .planning paths`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/df-tools.test.cjs plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs plugins/devflow/devflow/bin/lib/commit-failure.test.cjs` passes.</verify>
  <done>Test-list cases 4-9 pass. The all-planning skip results are byte-identical to before. The TRD 44-06 and merge suites are green. There are two commits, RED then GREEN.</done>
  <recovery>If the removal suite regresses, `git diff` misc.cjs and confirm `stagedRemovalsOnDisk` receives `filesToStage` (filtered), not `requested`.</recovery>
</task>

<task type="auto">
  <name>Task 3: Fixture comment + CHANGELOG</name>
  <files>plugins/devflow/hooks/__fixtures__/gate-fixtures.js, CHANGELOG.md</files>
  <action>
gate-fixtures.js header (~lines 6-9): rewrite the marker sentence. It should say git state is simulated by writing marker files/dirs inside a hand-made `.git` dir: `MERGE_HEAD` and `CHERRY_PICK_HEAD`, plus `rebase-merge/` or `rebase-apply/`, which are the only rebase markers that count as in progress after TRD 44-10. It should also say the `rebase-head` state writes a lone `REBASE_HEAD`, which models a STALE marker that git can leave behind and that must NOT read as a rebase in progress. Change the comment only; the code stays as is.

CHANGELOG.md `## [Unreleased]`: add a `### Fixed` subsection, or append to it if one exists. Add two lines:
- "`objective-job-index` reads the `files_modified` frontmatter key TRDs actually write (legacy `files-modified` still accepted), so the >8-files executor-model rule can fire."
- "`df-tools commit`: `commit_docs: false` and a gitignored `.planning` now skip only `.planning/` paths. Code passed via `--files` still commits, and the dropped paths are reported as `skipped_planning`."

Run `npm test`. Commit: `docs(quick-24): fix REBASE_HEAD fixture comment; changelog for job-index and commit gates`.
  </action>
  <verify>`npm test` passes. `rg -n "REBASE_HEAD" plugins/devflow/hooks/__fixtures__/gate-fixtures.js` shows the comment describing it as stale. `rg -n "skipped_planning" CHANGELOG.md` finds the line.</verify>
  <done>The comment matches the 44-10 semantics, and the CHANGELOG has both lines under [Unreleased].</done>
</task>

</tasks>

<verification>
- `npm test` is green.
- `node plugins/devflow/devflow/bin/df-tools.cjs objective-job-index 44 --raw` (this repo) shows non-empty `files_modified` for 44's TRDs. This is read-only.
- The git log shows a test(...) RED commit before each fix(...) commit for items 1 and 2.
</verification>

<success_criteria>
All test-list cases pass. No existing test changes behavior. The skip reasons and raw outputs are unchanged when only planning paths are requested. The three items are complete and the CHANGELOG is updated.
</success_criteria>
