---
objective: 53-worktree-and-health-hygiene
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-mode.cjs
  - plugins/devflow/devflow/bin/lib/planning-mode.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/execute-trd.md
autonomous: true
requirements: ["53-1"]
must_haves:
  truths:
    - "In local mode, `summary checkpoint` and `summary post` run from a linked worktree write `<worktree>/.planning/objectives/<dir>/<NN-MM>-SUMMARY.md` and create no file under the main checkout's `.planning/objectives/`"
    - "From the main checkout (or a non-git dir), both verbs write exactly the bytes and path they write today (D-01 unchanged)"
    - "In store mode both verbs still resolve the MAIN checkout from a worktree: the cache file, `.trd-progress/<trd>.md`, ledger, journal and outbox are the main checkout's (D-14 unchanged)"
    - "A worktree with no `.planning/` directory (planning untracked) falls back to the main checkout, as today"
    - "E2E: a SUMMARY written and committed in an executor worktree merges into the main checkout with `git merge --no-ff` exit 0, arrives tracked, and leaves `git status --porcelain` empty in the main checkout"
    - "gate-executor-stop still finds the SUMMARY: `summaryExists(id, candidateRoots({cwd: <worktree>, gitWorktrees}))` is true for a SUMMARY that exists only in the worktree"
    - "executor.md, execute-objective.md and execute-trd.md tell a worktree executor to commit its SUMMARY with its task commits (local mode), and no longer say the SUMMARY lands in the main checkout or that the orchestrator commits the wave's SUMMARYs after the merge"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-mode.cjs
      provides: "resolveCheckoutRoot(cwd): the git checkout (worktree or main) holding cwd when it has .planning/, else resolveMainRoot(cwd)"
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      provides: "summaryPost / summaryCheckpoint write the current checkout in local mode"
    - path: plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs
      provides: "real-git E2E: worktree write, worktree commit, clean merge, executor-stop visibility, store-mode guard"
  key_links:
    - from: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      to: plugins/devflow/devflow/bin/lib/planning-mode.cjs
      via: "resolveCheckoutRoot"
      pattern: "resolveCheckoutRoot"
    - "gate-executor-stop.js candidateRoots -> gitWorktrees (git worktree list) already scans every worktree, so the hook needs no change"
    - "execute-objective.md 5c reads a parallel plan's SUMMARY state from its worktree before the 5b merge"
---

# TRD 53-01: Summary verbs write the checkout that commits them (item 53-1)

<objective>
Stop `summary checkpoint|post` from writing an untracked SUMMARY copy into the main checkout when they run inside an executor worktree.
In local mode each SUMMARY must land once, in the checkout that commits it. The executor then commits it on its `df/exec-*` branch, and
the wave merge brings it into the main checkout with nothing untracked in the way.

Purpose: objective 52 hit this five times. Every parallel executor copied the main-checkout SUMMARY into its worktree and committed it,
so `git merge` refused to overwrite the untracked main copy, and the orchestrator deleted the copies by hand. The v1.4 re-audit lists it
as the most material tech-debt item.

Why the main-checkout write existed, and why this design keeps it working:
- **gate-executor-stop** blocks an executor that stops with no SUMMARY. Its `candidateRoots` already adds every entry of ONE
  `git worktree list --porcelain` call (hooks/gate-executor-stop.js:245-275), so a SUMMARY that exists only in the worktree is found.
  The hook needs no change; a regression test pins this.
- **Orchestrator visibility.** execute-objective 5c classifies each executor (missing, checkpoint or final SUMMARY) BEFORE the 5b merge, and today it reads
  the main checkout. The orchestrator provisioned every worktree in step 0 and knows its path, so 5c reads the plan's worktree instead.
  This is a prose change.
- **Store mode is untouched.** There `.planning/` is a gitignored cache, and the journal, ledger and outbox live in the main checkout (D-14).
  A gitignored untracked file never blocks a merge, so store mode keeps today's resolution.

Output: `planning-mode.resolveCheckoutRoot`, the local-mode write-root change in the two summary verbs, a real-git E2E regression test, and updated
executor/orchestrator prose.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work bugfix): `test(53-01): ...` (failing) before `fix(53-01): ...`.
- Use the repo df-tools: `node plugins/devflow/devflow/bin/df-tools.cjs` (the home mirror is 2.12.0 and lacks the summary verbs).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash call.
- Scope is the two summary verbs only. Do NOT change where `plan put-trd`, `verification post`, `doc put` or the `state`/`roadmap`
  commands write. Do NOT edit hooks/gate-executor-stop.js or its test (TRD 53-02 owns them in this wave). Read the hook's exports from a test, but do not change the file.
- Do NOT edit execute-objective.md's "Branch merge protocol" code fences or its conflict handling. TRD 53-04 rewrites them in wave 2.
  Keep every string `pr-lifecycle-prose.repo.test.cjs` pins (for example `git branch -d df/exec-{plan_id}` and the once-per-wave `gh pr sync`).
- Hand-built fixtures only (no generated data). No property-based tests.

## Test list

Outermost first.
1. **E2E, local mode, real git** (new `summary-worktree.test.cjs`, skip when git is absent). Set up a temp repo: `.planning/config.json` `{}`,
   `.planning/ROADMAP.md`, `.planning/objectives/07-demo/07-01-demo-TRD.md`, all committed on `main`. Run `git worktree add -b df/exec-07-01 <wt>`.
   From cwd `<wt>`, spawn `node <df-tools> summary checkpoint 07-01 --from <file>` and then `summary post 07-01 --from <file>`. Then:
   - `<wt>/.planning/objectives/07-demo/07-01-SUMMARY.md` holds the posted bytes;
   - `<main>/.planning/objectives/07-demo/07-01-SUMMARY.md` does not exist;
   - `node <df-tools> commit "docs(07-01): summary" --files .planning/objectives/07-demo/07-01-SUMMARY.md` from `<wt>` reports `committed: true`;
   - from `<main>`, `git merge --no-ff df/exec-07-01` exits 0, `git ls-files` lists the SUMMARY, and `git status --porcelain` is empty.
2. **E2E, executor-stop visibility.** With the SUMMARY only in `<wt>`, `require('../../../hooks/gate-executor-stop.js')`:
   `summaryExists('07-01', candidateRoots({ cwd: <main>, repoRoot: <main>, gitWorktrees }))` is true. Pass the hook's real `gitWorktrees`.
3. **E2E, store-mode guard.** Same repo with `.planning/config.json` `{github: {enabled: true, store: true}}` in the MAIN checkout:
   `summary checkpoint 07-01` from `<wt>` writes `<main>/.planning/.trd-progress/07-01.md` and creates nothing under `<wt>/.planning/`.
   Use `--no-flush`/offline-safe flags where the CLI offers them. If `summary post` would reach `gh`, cover store mode with
   checkpoint only and say so in the SUMMARY.
4. **Unit, planning-mode `resolveCheckoutRoot`**, using the fs-only worktree fixture pattern from planning-verbs.test.cjs test 15
   (a `.git` file `gitdir: <main>/.git/worktrees/wt1` plus `commondir`):
   - from inside a worktree that has `.planning/`, it returns the worktree root (realpath);
   - from inside a worktree with no `.planning/`, it returns `resolveMainRoot(cwd)` (the main checkout);
   - from the main checkout, and from a non-git dir holding `.planning/`, it equals `resolveMainRoot(cwd)`.
5. **Unit, local mode from the main checkout**: `summaryPost`/`summaryCheckpoint` write the same path and bytes as before. The existing
   planning-verbs tests must pass unchanged. If any existing test pins "a local worktree summary writes main", it encoded the bug:
   update it and name it in the SUMMARY.
6. **Unit, existing-name reuse in the worktree**: with `07-01-demo-SUMMARY.md` already committed in the worktree's objective dir,
   `summary post 07-01` from the worktree overwrites that file and creates no second `07-01-SUMMARY.md`. summaryFileOf
   must list the WRITE root's objective dir, not the main checkout's.

<embedded_context>

<codebase_examples>
planning-verbs.cjs today:
```js
// line ~100
function mainRoot(root) { return planningMode.resolveMainRoot(root); }

// writeThrough (line ~235): local mode = atomic write of <main>/.planning/<rel>, nothing else
const main = mainRoot(root);
const { mode } = planningMode.planningMode(main);
const file = planningFile(main, rel);
...
if (mode === LOCAL) return { ...base, ok: true, exit: EXIT.OK };

// summaryCheckpoint (line ~813), local branch
const t = trdTarget(main, o.trd);             // t.files = listDir(main/.planning/objectives/<dir>)
const { mode } = planningMode.planningMode(main);
if (mode === LOCAL) {
  const name = summaryFileOf(t, o.file);      // existing <prefix>-[...-]SUMMARY.md else <prefix>-SUMMARY.md
  return writeThrough(main, { rel: `objectives/${t.objective.dir}/${name}`, text: o.text, verb: 'summary checkpoint' });
}
```

planning-mode.cjs resolveMainRoot (line ~156). `findGitHolder(start)` walks up to the first dir holding `.git`. For a linked
worktree, that holder is the worktree root, and its `.git` is a file:
```js
function resolveMainRoot(cwd) {
  const start = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
  let candidate = null;
  try {
    const holder = findGitHolder(start);
    if (holder) candidate = holder.st.isDirectory() ? holder.dir : rootFromGitFile(holder.dir);
  } catch { candidate = null; }
  if (candidate && isDir(path.join(candidate, '.planning'))) return realOrResolved(candidate);
  const nearest = nearestPlanningRoot(start);
  return nearest ? realOrResolved(nearest) : null;
}
```

Suggested shape (adapt to the file's helpers):
```js
/** The checkout (linked worktree or main) holding cwd, when it has .planning/; else resolveMainRoot(cwd). fs-only, no git spawn. */
function resolveCheckoutRoot(cwd) {
  const start = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
  try {
    const holder = findGitHolder(start);
    if (holder && isDir(path.join(holder.dir, '.planning'))) return realOrResolved(holder.dir);
  } catch { /* fall through */ }
  return resolveMainRoot(start);
}
```
Export it beside resolveMainRoot.

In planning-verbs.cjs, add an optional `writeRoot` to writeThrough, honoured ONLY when `mode === LOCAL`. Store mode ignores it, so
the cache, ledger and journal stay on `main`. In summaryPost/summaryCheckpoint, compute
`const writeRoot = mode === LOCAL ? planningMode.resolveCheckoutRoot(root) : main`, build `t.files` from
`listDir(path.join(writeRoot, '.planning', 'objectives', t.objective.dir))` for summaryFileOf, and pass `writeRoot` through.
`trdTarget(main, …)` still resolves the objective dir name from the main checkout's ROADMAP and dirs, which is correct because the dir name is the same in both trees.
Update the header comment ("Every verb resolves the MAIN checkout first (D-14)") to name this one local-mode exception and why.

Real-git worktree fixture: copy the `HAS_GIT` guard and `spawnSync('git', …)` helpers from misc-commit-gate.test.cjs (lines ~34-50).
Set `user.name`/`user.email` with `git config` in the temp repo, and pass `GIT_CONFIG_GLOBAL=/dev/null` in the spawn env so the
user's global config cannot interfere.
</codebase_examples>

<anti_patterns>
- Do not "fix" this by deleting the main copy after the fact, or by adding a cleanup step to the orchestrator. The SUMMARY must be written once.
- Do not make store mode write the worktree: the outbox, ledger and journal are single-writer files in the main checkout (D-14).
- Do not spawn git inside planning-mode.cjs. It is fs-only by design (48-01).
- Do not change gate-executor-stop.js. It already scans every worktree.
</anti_patterns>

<error_recovery>
- If the E2E merge still refuses, run `git status --porcelain` in `<main>` before merging. A `?? .planning/...SUMMARY.md` line means a
  verb still wrote the main checkout: trace which call resolved `main`.
- If an existing planning-verbs test fails because it expected a local-mode worktree write in main, that test pinned the bug.
  Update its expectation and record it under Deviations.
- macOS temp dirs resolve through `/private`. Compare realpaths (`fs.realpathSync`) in assertions.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: resolveCheckoutRoot and local-mode worktree writes for the summary verbs</name>
  <files>plugins/devflow/devflow/bin/lib/planning-mode.cjs, plugins/devflow/devflow/bin/lib/planning-mode.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs</files>
  <action>
RED: write Test list items 1-6. Put items 1-3 and 6 in the new summary-worktree.test.cjs and item 4 in planning-mode.test.cjs.
Item 5 is the existing planning-verbs suite. Run them: items 1, 4 and 6 must fail for the right reason (the SUMMARY lands in main,
or `resolveCheckoutRoot` is not a function). Items 2 and 3 may pass already, as guards. Commit `test(53-01): ...`.

GREEN:
1. planning-mode.cjs: add and export `resolveCheckoutRoot(cwd)` (see codebase_examples). It is fs-only.
2. planning-verbs.cjs: writeThrough accepts `writeRoot`, used only for the LOCAL atomic write. summaryPost and summaryCheckpoint
   compute the write root (local mode: `resolveCheckoutRoot(root)`; store: `main`), list that root's objective dir for summaryFileOf,
   and pass it on. summaryPost's store-mode `.trd-progress` removal still uses `main`. Update the header comment.
3. Run the scoped tests until green. Commit `fix(53-01): ...`.

# CRITICAL: store mode behaviour is byte-for-byte unchanged (planning-verbs store tests, test 15 'a worktree writes the MAIN checkout').
# GOTCHA: summaryFileOf reads `t.files`. Build it from the write root, or a worktree's existing named SUMMARY is missed (item 6).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs plugins/devflow/devflow/bin/lib/planning-mode.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</verify>
  <done>All four files pass. The E2E proves a worktree SUMMARY merges cleanly with no untracked copy in main, and the store-mode and main-checkout paths are unchanged.</done>
  <recovery>If an existing planning-verbs test breaks, check whether it pinned the bug (a local worktree write landing in main). If it did, update it. If it did not, revert the writeThrough change and keep the write-root logic inside the two summary verbs only.</recovery>
</task>

<task type="auto">
  <name>Task 2: executor and orchestrator prose: commit the SUMMARY where it is written</name>
  <files>plugins/devflow/agents/executor.md, plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/devflow/workflows/execute-trd.md</files>
  <action>
Rewrite every passage that says a worktree SUMMARY lands in the main checkout:
- executor.md: line ~245, "Both modes resolve the MAIN checkout, from a worktree too". Make it: local mode writes the checkout you are in; store mode writes the main checkout's cache.
  Line ~929-934 (task_commit_protocol step 4): in local mode ALWAYS add the SUMMARY path to `--files`, in the main checkout or a
  worktree. Delete "From a worktree … leave the SUMMARY path out … The orchestrator reads it there and commits it after the merge."
  Keep the store-mode sentence (`df-tools commit` drops it as `skipped_planning`). Line ~1123: drop "From a worktree, drop the SUMMARY path from `--files`".
- execute-trd.md line ~218: drop "From a worktree, drop the SUMMARY path from the commit below: it was published to the main checkout."
- execute-objective.md:
  - `<worktree_protocol>` (line ~398-401): the SUMMARY lands in your worktree, so commit it with your task commits.
  - 5b intro (line ~454-455): 5c reads each parallel plan's SUMMARY state from that plan's worktree (`<worktree_path>/.planning/...`,
    local mode) before the merge.
  - Replace the "**Commit the wave's SUMMARYs (local mode).**" paragraph and its fence (line ~500-507). The SUMMARYs arrive with the merges:
    each executor committed its own on its branch, so there is nothing more to commit, and no main-checkout copy exists to collide with the merge.
    Store mode: the SUMMARY is the main checkout's gitignored cache, as before.
  - 5c "SUMMARY state" bullet (line ~549-550): a parallel plan's state comes from its worktree in local mode, a sequential plan's from the current tree,
    and in store mode from the main checkout's `.planning/` and `.trd-progress/` as today.
Do not touch the "Branch merge protocol" fences or the conflict handling (53-04 owns them).
  </action>
  <verify>rg -n -i "lands there, not in your tree|leave the SUMMARY path out|published to the main checkout|commits it after the merge|wave \{N\} summaries" plugins/devflow/agents/executor.md plugins/devflow/devflow/workflows/execute-objective.md plugins/devflow/devflow/workflows/execute-trd.md  (expect no output), then node --test plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>No prose tells an executor that its SUMMARY lands in the main checkout or that the orchestrator commits it. 5c reads worktree SUMMARY state. The prose repo tests pass.</done>
  <recovery>If a repo test pins an old phrase, keep the pinned token if it is still true. If it encodes the old behaviour, update the test in this task and record it under Deviations.</recovery>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in each task's `<verify>`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs` passes: worktree write, worktree commit, clean merge, executor-stop visibility, store guard.
- The planning-verbs and planning-mode suites pass.
- The prose repo tests pass, and the rg check in Task 2 prints nothing.
</verification>

<success_criteria>
An executor worktree run in local mode leaves no SUMMARY copy in the main checkout. Its SUMMARY is committed on its branch and arrives through
`git merge --no-ff` without an untracked-file collision. gate-executor-stop and the orchestrator still see it. Store mode is unchanged.
</success_criteria>

<output>
After completion, write the SUMMARY through `summary checkpoint` / `summary post` 53-01 (it will land in your own checkout, which proves the fix).
Commit it with your docs commit.
</output>
