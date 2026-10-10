---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/upgrade-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
autonomous: true
requirements: [TODO-01]
must_haves:
  truths:
    - "In a git repository whose legacy planning directory tracks NN-JOB.md files, one `upgrade --apply` run with 0002 and 0012 both pending applies both: 0012 no longer fails with `git mv ... failed: fatal: bad source`, and committing the reported changed paths leaves `git status --porcelain` empty with every TRD tracked under `.aoforge/`"
    - "0012 stages only removals the run itself made (tracked files under the legacy directory that are missing from disk AND inside ctx.changedSoFar); a tracked file the user deleted still defers the move as `dirty`"
    - "Migration 0008 treats `.dup-detect-log.jsonl` as runtime state: it gitignores it under both planning directory names and untracks a tracked copy with `git rm --cached`, keeping the working file; `isRuntimeStatePath` returns true for it"
    - "With a tracked, modified `.dup-detect-log.jsonl` and 0008 + 0012 pending, the same run untracks the log and moves the directory instead of deferring 0012"
    - "Every new test failed before its fix (RED commit precedes GREEN commit) and the existing 0002, 0008 and 0012 suites still pass"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs
      provides: "RUNTIME_STATE_BASENAMES includes .dup-detect-log.jsonl"
      contains: ".dup-detect-log.jsonl"
    - path: plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
      provides: "moveDirectory stages the run's own removals before git mv"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs moveDirectory
      to: changedSoFarPredicate(ctx)
      via: "only paths an earlier migration of this run changed are staged"
      pattern: "changedSoFarPredicate"
    - from: plugins/aoforge/hooks/upgrade-project.js runtimeStatePredicate
      to: 0008 isRuntimeStatePath
      via: "the hook's dirty-before exemption follows the basename list automatically"
      pattern: "isRuntimeStatePath"
---

# TRD 75-02: Two upgrade migration defects from the 72-25 fleet sweep

<objective>
Fix the two small, well-specified upgrade defects that pending todos record, test first:
1. `2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades.md`: 0002 renames
   tracked `NN-JOB.md` files with `fs.renameSync` and stages nothing. 0012's `git mv` of the legacy directory then
   refuses the tracked source that is missing from disk, the runner stops half-applied, and nothing is stamped. Any
   repository with both pending hits it, and recycling-oracle will hit it through the SessionStart hook.
2. `2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl.md`: `.dup-detect-log.jsonl` is runtime
   state that `dup-detect.cjs` appends to, but 0008 does not cover it, so it deferred 0012 in devflowops and eden-biz
   and was swept into EdenDocs' upgrade commit.

Purpose: TODO-01 (complete what is small and in scope). The fleet steps in both todos (redo trades,
recycling-oracle, EdenDocs `git rm --cached`) need a release and per-repository approval, so 75-04 re-scopes them.
This TRD only lands the code.
Output: fixed migrations with RED-then-GREEN tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
@~/.claude/aoforge/references/tdd.md
</execution_context>

<context>
@.aoforge/todos/pending/2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades.md
@.aoforge/todos/pending/2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl.md

Read narrowly with `rg -n`, then `offset`/`limit`:
- `plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs`: header lines 1-31 (guards; `changed` lists
  both directories; "never stages anything beyond what `git mv` stages"), `changedSoFarPredicate` around line 133,
  `deferral` around 145 (the `dirty` guard already exempts the run's own paths), `moveDirectory` around 253 (`git
  ls-files` then `git mv -- OLD_DIR NEW_DIR`).
- `plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.cjs` lines 105-135: `fs.renameSync(from, to)` and
  `changed.push(f.from, f.to)`, so both paths reach `ctx.changedSoFar`.
- `plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs` lines 1-60: `RUNTIME_STATE_BASENAMES`
  (line 44), `RUNTIME_STATE_FILES`, `GLOB_PATHSPECS`, `ALL_ROOT_FILES`, `isRuntimeStatePath`.
- `plugins/aoforge/aoforge/bin/lib/upgrade.cjs` `apply({...})` around line 438: `changedSoFar: [...changed]` (line 460)
  is passed to each later migration.
- `plugins/aoforge/hooks/upgrade-project.js` lines 238-260: `runtimeStatePredicate` loads 0008's `isRuntimeStatePath`,
  so extending the basename list also exempts the log from the hook's dirty-before skip. No hook edit is needed.
- `plugins/aoforge/aoforge/bin/lib/dup-detect.cjs` line 40: `DUP_DETECT_LOG_FILE = '.dup-detect-log.jsonl'`.
</context>

<embedded_context>

<codebase_examples>
0008's list today (line 44):
```js
const RUNTIME_STATE_BASENAMES = ['.progress-guard.json', '.awareness-cache.json'];
const RUNTIME_STATE_FILES = RUNTIME_STATE_BASENAMES.map((b) => `.aoforge/${b}`);
const GLOB_PATHSPECS = PLANNING_DIR_NAMES.flatMap((d) => RUNTIME_STATE_BASENAMES.map((b) => `:(glob)**/${d}/${b}`));
```

0012's move today (around line 253):
```js
function moveDirectory(ctx, inGit) {
  const from = path.join(ctx.projectRoot, OLD_DIR);
  const to = path.join(ctx.projectRoot, NEW_DIR);
  if (inGit) {
    const tracked = git(ctx, ['ls-files', '-z', '--', OLD_DIR]);
    ...
    if (tracked.out.length > 0) {
      const r = git(ctx, ['mv', '--', OLD_DIR, NEW_DIR]);
      if (r.status !== 0) throw new Error(`git mv ${OLD_DIR} ${NEW_DIR} failed: ${r.err || r.status}`);
```

Fixture builders to extend (hand-built, no generated data):
- `__fixtures__/upgrade-fixtures.cjs` `RUNTIME_STATE_CONTENT` (line ~333), keyed by basename, and
  `makeTrackedRuntimeStateProject({tracked, untrackedPresent, gitignore})` (0008 tests use it).
- `__fixtures__/legacy-migration-fixtures.cjs` `legacyProject({state, store, stamp})` (0012 tests use it). It builds a
  legacy-layout git project, commits everything as `init`, and offers `p.git([...])` and `p.run(...)`.
</codebase_examples>

<anti_patterns>
- Do not make 0012 stage arbitrary changes (`git add -A -- <legacy dir>`). That would sweep the user's untracked or
  edited files into the move. That is exactly the separate, re-scoped todo "keep the user's untracked planning files
  out of the upgrade commit". Stage only removals that are inside `ctx.changedSoFar`.
- Do not change 0002 to `git mv`. 0002 also runs outside git and on projects where the JOB.md is untracked. The 0012
  side is the general fix (any earlier migration's own deletions) and keeps 0002 unchanged.
- Do not spell the legacy planning directory or product name literally in a file the rename guard scans. Use
  `LEGACY.planningDir` / `PLANNING_DIR_NAMES` from `legacy-names.cjs` / `compat.cjs`, or put the test in a
  `*.legacy.test.cjs` file (ALLOW `**/*.legacy.test.*`).
- No property-based tests and no generated fixture data (`no_property_based_default`, `no_llm_test_data`): name each
  case.
- Do not touch the fleet (trades, recycling-oracle, EdenDocs). Those steps are 75-04's re-scope.
</anti_patterns>

<error_recovery>
- `git rm --cached` of a path with a still-present working file: never happens here, because the predicate requires
  the file to be missing from disk. If a test shows otherwise, tighten the selection
  (`git ls-files -z --deleted -- OLD_DIR`), do not widen it.
- A runner test with the real registry is slow or pulls in unrelated migrations: pass `only: ['0002', '0012']`, or
  `['0008', '0012']`, to `upgrade.apply` if the API supports it (it does for `--only`). Otherwise build a registry dir
  with `migrationSource`/`makeRegistryDir` copies of the two real modules.
- `rename-guard.repo.test.cjs` fails after your edit: move the literal into a `.legacy.test.cjs` file or use the
  constants. Never add an ALLOW entry.
</error_recovery>

</embedded_context>

<gotchas>
- `ctx.changedSoFar` paths are repository-root-relative from the project root. `changedSoFarPredicate` prefixes
  `git rev-parse --show-prefix` so a project in a sub-directory still matches. Reuse it; do not re-derive.
- The commit that follows (`aof-tools commit --files <changed>`, as the hook does) records staged removals explicitly
  (cmdCommit's staged-removal path). In the end-to-end assertion, commit with the same verb or with `git add -A && git
  commit` on the fixture, and assert the final tree, not the intermediate index.
- `legacyProject()` writes `.skill-active` inside the legacy dir and an info/exclude line. Keep those defaults when
  you add the `jobFiles` option, so existing 0012 tests are unaffected.
</gotchas>

## Test list

Behaviour cases, written before any test code, outermost first (runner, then migration):

0012 after 0002 (`0012-planning-dir-move.legacy.test.cjs`):
1. Runner: legacy git project tracking `objectives/055-x/055-JOB.md` and `objectives/057-y/057-JOB.md`, clean tree.
   `upgrade.apply` with 0002 + 0012 pending succeeds, 0012's report is not an error and not deferred, and
   `.aoforge/objectives/055-x/055-TRD.md` exists.
2. Runner, then commit of the reported `changed` paths: `git status --porcelain` is empty. `git ls-files .aoforge`
   lists both TRD.md files. `git ls-files` lists nothing under the legacy directory.
3. Migration: a tracked file the user deleted (not in changedSoFar) still defers as `dirty`, with nothing staged
   (regression guard for the predicate).
4. Migration: a tracked file missing from disk and listed in changedSoFar gets its removal staged, and `git mv`
   succeeds (unit-level, ctx built by hand).
5. Existing 0012 cases (clean, dirty, merge, nogit, store) unchanged.

0008 dup-detect log (`0008-runtime-state-untrack.test.cjs`):
6. A tracked `.aoforge/.dup-detect-log.jsonl` is detected, and apply untracks it (`git ls-files` empty) with the
   working file byte-identical.
7. An untracked, not-ignored log gets a `.gitignore` entry under both planning directory names (as the other basenames
   do), and `git check-ignore` reports it ignored.
8. `isRuntimeStatePath('.aoforge/.dup-detect-log.jsonl')` and the nested form `flutter/.aoforge/.dup-detect-log.jsonl`
   are true. An unrelated `.aoforge/STATE.md` is false.
9. Runner (`0012-planning-dir-move.legacy.test.cjs`): a legacy project with a tracked, modified log and 0008 + 0012
   pending. 0008 untracks it, and 0012 moves the directory instead of deferring `dirty`.
10. A project already stamped with 0008 in `migrations_applied` and a tracked log still detects 0008 as applicable
    (detection-based runner).

<tasks>

<task type="auto">
  <name>Task 1: Hand-built fixture builders for the two cases</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/upgrade-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs</files>
  <action>
1. `upgrade-fixtures.cjs`: add `'.dup-detect-log.jsonl'` to `RUNTIME_STATE_CONTENT`. The body is two literal JSONL
   lines shaped like what `dup-detect.cjs` appends (read its append function around line 543 for the field names;
   keep it tiny and literal).
2. `legacy-migration-fixtures.cjs`: give `legacyProject` two options, both defaulting to today's behaviour:
   - `jobFiles = []`: relative paths under the legacy objectives dir (e.g. `objectives/055-post-deploy/055-JOB.md`).
     Each is written with a minimal hand-built JOB body (reuse the `planMd` shape from upgrade-fixtures if it fits)
     BEFORE the `init` commit, so they are tracked.
   - `dupDetectLog = null | 'tracked' | 'tracked-modified' | 'untracked'`: writes the legacy dir's
     `.dup-detect-log.jsonl` before the init commit (tracked), before it plus an appended line after it
     (tracked-modified), or only after it (untracked).
   Export nothing new beyond what tests need. Update the JSDoc.
3. Run the existing suites that use these fixtures to prove nothing changed:
   `node --test plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
   plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
   plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.test.cjs`.
Commit: `test(75-02): fixture builders for 0002+0012 and the dup-detect log`.
  </action>
  <verify>The three suites pass unchanged (same pass count as before the edit); `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes</verify>
  <done>Both fixtures can build the 72-25 shapes (tracked JOB.md files; tracked, modified or untracked log), and every existing test is green.</done>
  <recovery>An existing test changes behaviour: a default changed. Restore the default and keep the new behaviour opt-in only.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 0012 stages the run's own removals before git mv (cases 1-5)</name>
  <files>plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs</files>
  <action>
RED: add test-list cases 1-4 to `0012-planning-dir-move.legacy.test.cjs` (a `describe('0012 after 0002 in one run')`
block). Run them. Cases 1, 2 and 4 must fail with the `bad source` error (case 3 may already pass; it is a guard).
Commit `test(75-02): RED 0012 fails after 0002 renamed tracked JOB.md files`.

GREEN, in `moveDirectory` before `git mv`:
```
# PATTERN: reuse changedSoFarPredicate(ctx) (the dirty guard's own notion of "the run's own change")
deleted = git ls-files -z --deleted -- OLD_DIR          # tracked, missing from disk
own     = deleted.filter(isOwn)                          # only what an earlier migration of THIS run removed
if own.length: git rm --cached --quiet -- ...own         # stage those removals; nothing else
# CRITICAL: a deleted path NOT in changedSoFar never reaches here (deferral() returned 'dirty');
#           assert that ordering with case 3, do not re-check it with a second staging rule
then git mv -- OLD_DIR NEW_DIR as today
```
Update the header comment: replace "never stages anything beyond what `git mv` stages" with the one exception (the
run's own removals) and why (72-25 trades). Record in the notes which paths were staged (for the apply report).
Commit `fix(75-02): 0012 stages the run's own removals so it survives 0002 in the same run`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs` all pass; `git log --format=%s -3` shows the RED commit before the fix commit</verify>
  <done>One upgrade run takes a legacy project with tracked JOB.md files through 0002 and 0012, and a commit of the changed paths leaves a clean tree. A user's own deletion still defers.</done>
  <recovery>If `git rm --cached` of a deleted path errors on some git version, use `git update-index --remove -- <paths>` (same effect: drop the index entry of a missing file). Record which was used.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 0008 covers .dup-detect-log.jsonl (cases 6-10)</name>
  <files>plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs</files>
  <action>
RED: cases 6-8 and 10 in `0008-runtime-state-untrack.test.cjs` (via `makeTrackedRuntimeStateProject` with the log path
built from the planning dir constant), and case 9 in `0012-planning-dir-move.legacy.test.cjs` (via
`legacyProject({dupDetectLog: 'tracked-modified'})`, `upgrade.apply` with 0008 + 0012). Confirm they fail. Commit
`test(75-02): RED 0008 ignores the dup-detect log`.

GREEN: add `'.dup-detect-log.jsonl'` to `RUNTIME_STATE_BASENAMES`. Everything else (root files, glob pathspecs, nested
discovery, `isRuntimeStatePath`, the hook's exemption) derives from that list. Check with `rg -n
"RUNTIME_STATE_BASENAMES|RUNTIME_STATE_FILES" plugins/aoforge` that no consumer hard-codes the old two-item list
(doctor, upgrade-project.js). Update the header comment's first paragraph to name the third file and its writer
(`dup-detect.cjs`).

Step 2 of the todo (other runtime dotfiles): run `rg -n -e "'\\.[a-z][a-z0-9-]*\\.(json|jsonl|lock)'" -e
'\.micro-description' -e 'autonomous-retry' plugins/aoforge/aoforge/bin/lib plugins/aoforge/hooks --glob '!*.test.*'`
and list each dotfile written under the planning directory, with its writer and a one-line decision (runtime state, so
add it; or committed by design, so leave it). Add ONLY files that are appended or rewritten at runtime on every
machine and are never meant to be shared, and only with a named test case each. Put the audit table in the SUMMARY.
75-04 cites it when it dispositions the todo.

Commit `fix(75-02): migration 0008 gitignores and untracks the dup-detect log`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs plugins/aoforge/hooks/upgrade-project.test.js` pass (if the hook test file has another name, find it with `rg --files plugins/aoforge/hooks | rg upgrade-project`); `node --test plugins/aoforge/aoforge/bin/lib/doctor*.test.cjs` pass; `rg -n -F '.dup-detect-log.jsonl' plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs` matches</verify>
  <done>The dup-detect log is runtime state for 0008, the hook and the doctor alike. A modified tracked log no longer blocks the move. The dotfile audit is recorded.</done>
  <recovery>A doctor or adopt fixture now reports an extra finding because it contains the log: that is the intended behaviour. Update the expectation with a comment naming 75-02, and never drop the basename.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0002-job-to-trd.test.cjs</test_scoped>
</validation_gates>

<verification>
- Test list cases 1-10 exist by name and pass. The RED commits precede the fix commits.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` pass.
- `npm test` shows no new failure (75-05 runs the full suite again).
</verification>

<success_criteria>
- The 72-25 trades failure cannot recur in one upgrade run, and the dup-detect log no longer blocks or pollutes an
  upgrade. Both todos' code steps are done. Their fleet steps are left for 75-04 to re-scope.
</success_criteria>

<output>
After completion, write `75-02-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 75-02 --from <draft>`
(after `tokens stamp 75-02 --draft <draft>`). Include the commit hashes per todo and the dotfile audit table, and say
what remains for the fleet in each todo.
</output>
