---
objective: 53-worktree-and-health-hygiene
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/micro.cjs
  - plugins/devflow/devflow/bin/lib/micro.test.cjs
  - plugins/devflow/devflow/workflows/micro.md
autonomous: true
requirements: ["53-3"]
must_haves:
  truths:
    - "In store mode, `df-tools micro commit` on an unlinked branch (or the default branch) is refused with the normal GEN-01 gate message from gh-gate (naming `df-tools gh pr start <objective>` and `DEVFLOW_SKIP_GH_GATE=1`), the index and HEAD are unchanged, and the micro marker is kept so the user can retry"
    - "In store mode on the objective's linked branch, `micro commit --files a.txt` makes exactly one commit holding only a.txt, leaves STATE.md byte-identical, and reports `state_row: 'skipped_store_mode'` (the 52-03 behaviour)"
    - "With `DEVFLOW_SKIP_GH_GATE=1`, a refused store-mode micro commit lands and the override is logged exactly as `df-tools commit` logs it"
    - "In local mode, micro still makes the source commit then the STATE.md row commit; an explicit `--files` list commits exactly those paths and leaves other staged changes staged (#120); with no list it commits what is staged, else tracked modifications, and never sweeps in untracked files"
    - "micro's default runner no longer runs raw `git commit` with DEVFLOW_ALLOW_RAW_COMMIT=1; every micro commit goes through `df-tools commit`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/micro.cjs
      provides: "_defaultGitRunner replaced by a runner that spawns `df-tools commit <message> --files <list>` and maps its JSON result"
  key_links:
    - from: plugins/devflow/devflow/bin/lib/micro.cjs
      to: plugins/devflow/devflow/bin/df-tools.cjs
      via: "spawnSync(process.execPath, [df-tools.cjs, 'commit', message, '--files', ...files])"
      pattern: "'commit'"
    - "misc.cjs cmdCommit owns the store gate (gh-gate.readGateInputs/evaluateGate), the override log and the Refs trailer; micro reuses it rather than re-implementing it"
---

# TRD 53-03: micro commits through `df-tools commit` (item 53-3)

<objective>
Route `df-tools micro commit` through `df-tools commit` so that the store-mode GEN-01 branch gate, its override log and its message
rules apply to micro too. Keep micro's commit shape: one source commit, a second STATE.md-row commit only in local mode (52-03 skips it
in store mode), and the #120 staging guarantees.

Purpose: micro's `_defaultGitRunner` runs `git add` + `git commit` with `DEVFLOW_ALLOW_RAW_COMMIT=1`, so in store mode a micro commit lands on
the default branch or an unlinked branch with no refusal and no override-log entry. USER-GUIDE lists this as a known issue, and the v1.4 re-audit as tech debt.

Design choice: spawn the df-tools CLI, rather than calling `cmdCommit` in-process or copying the gate into micro.
- `cmdCommit` writes through `output()`, which calls `process.exit`. It cannot be called in-process from `commitMicro`.
- Copying the gate block would fork the gate logic, the override log and the Refs trailer, which is the drift this item exists to remove.
- micro already shells out (git), and the spawned process is not seen by the gate-commits hook (hooks only see Claude's Bash calls), so no escape is needed.
micro's "no `--files`" mode has no `df-tools commit` equivalent: with no files, df-tools commit commits `.planning/` only. micro therefore resolves
the list itself first: the staged paths (`git diff --cached --name-only --no-renames -z`), else the tracked modifications (`git diff --name-only --no-renames -z`), else the existing
"nothing staged" error. The commit is always pathspec-limited, as #120 requires.

Output: the new default runner, micro tests (store refusal, linked branch, escape, local regressions), and one line of micro workflow prose.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(53-03): ...` (failing) before `fix(53-03): ...`.
- Use the repo df-tools. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash call.
- Do NOT edit misc.cjs (cmdCommit). TRD 53-02 edits misc.cjs in this wave. If a micro case cannot be expressed through `df-tools commit`,
  stop, record it under Deviations, and say what cmdCommit would need. Do not patch misc.cjs.
- Keep the injectable `gitRunner` seam and its contract `(cwd, {message, files}) -> {exitCode, stdout, stderr}`, so the existing mock-runner tests
  keep working. The runner may add fields (`reason`, `json`).
- Locate df-tools as `path.join(__dirname, '..', 'df-tools.cjs')`, never via `~/.claude`.
- Hand-built fixtures only. Reuse misc-commit-gate.test.cjs's `storeRepo()` shape for a linked branch: a v3 mapping written after the init
  commit, with `gm.setPr(m, '<obj>', { branch: '<linked>' })` and a `gh` shim on PATH that fails.

## Test list

Outermost first.
1. **Store, unlinked branch (CLI e2e):** store fixture on branch `feat/x` with no `prs` entry. `micro start "fix typo"`, write a.txt, then
   `micro commit --files a.txt --raw` exits non-zero. The JSON has `ok: false` and a reason naming the gate (`gate-refused` or the gh-gate reason),
   and its message contains `df-tools gh pr start` and `DEVFLOW_SKIP_GH_GATE=1`. HEAD is unchanged, `git diff --cached --name-only` is
   empty, and `.planning/.skill-active` still exists.
2. **Store, default branch:** same as item 1 on `main`. The reason is `default_branch` (from the gate).
3. **Store, linked branch (updates the existing SM-1):** the fixture is on the linked branch. One new commit holding only a.txt, STATE.md
   byte-identical, `state_row: 'skipped_store_mode'`, marker removed. SM-1 today runs in store mode on the default branch. After this
   change that is refused, so move it onto a linked branch and say so in the SUMMARY.
4. **Store, escape:** item 1 with `DEVFLOW_SKIP_GH_GATE=1` and `DEVFLOW_SKIP_GH_GATE_REASON=test` in the env. The commit lands, and the
   override log in `.planning/` gains one `gh` gate entry (the same file misc-commit-gate.test.cjs test 5 reads).
5. **Local regressions (existing tests stay green):** F1-*, FS-*, e2e-1, #120 (explicit `--files` leaves other staged changes staged and
   out of the commit), "no files: commits staged; else tracked modifications; never untracked", and the staged-deletion case.
6. **Local, no-files resolution unit:** with `b.txt` staged and `c.txt` modified but unstaged, `micro commit` (no `--files`) commits b.txt
   only. With nothing staged and `c.txt` modified, it commits c.txt. With only an untracked file, it gives today's "nothing staged" error.
7. **No raw commit left:** `micro.cjs` contains no `spawnSync('git', ['commit'` call and no `DEVFLOW_ALLOW_RAW_COMMIT: '1'` in a commit env
   (a source-text assertion in micro.test.cjs).

<embedded_context>

<codebase_examples>
micro.cjs today (lines ~148-222): `_defaultGitRunner(cwd, {message, files})` stages each listed file with `git add`, or with no list
checks `git diff --cached --quiet` and falls back to `git add -u`. Then it runs `git commit -m <message> [-- files]` with
`DEVFLOW_ALLOW_RAW_COMMIT: '1'`. commitMicro (line ~302) computes
`const store = require('./planning-mode.cjs').isStoreMode(projectRoot)`, calls `runner(projectRoot, {message, files})`, and on
`exitCode !== 0` returns `{ok: false, reason: 'commit-failed', message: 'git commit failed: ' + stderr, removed_marker: false}`.
It then reads the hash with `git rev-parse --short HEAD` and, in local mode only, appends the STATE.md row and makes the second
runner call with `files: ['.planning/STATE.md', (tracked marker)]`.

`df-tools commit` result shapes (misc.cjs cmdCommit), JSON mode (no `--raw`):
- success: `{committed: true, hash, ...}`, exit 0
- gate refusal: `{committed: false, hash: null, reason: <gh-gate reason>, branch, error: <gate message>}`, exit 1
- wholly skipped (commit_docs false / gitignored): `{committed: false, hash: null, reason: 'skipped_*'}`, exit 0

Runner sketch:
```js
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
function _dfToolsCommitRunner(cwd, opts) {
  let files = opts.files && opts.files.length ? opts.files : _implicitFiles(cwd);   // staged, else tracked-modified (both --no-renames -z)
  if (!files.length) return { exitCode: 1, stdout: '', stderr: NOTHING_STAGED_MSG };
  const r = spawnSync(process.execPath, [DF_TOOLS, 'commit', opts.message, '--files', ...files], { cwd, encoding: 'utf8', env: process.env });
  let json = null; try { json = JSON.parse((r.stdout || '').trim()); } catch {}
  if (json && json.committed === true) return { exitCode: 0, stdout: json.hash || '', stderr: '' };
  if (json && json.committed === false && json.error) return { exitCode: 1, stdout: '', stderr: json.error, reason: json.reason };
  if (json && json.committed === false) return { exitCode: 1, stdout: '', stderr: `df-tools commit skipped: ${json.reason}`, reason: json.reason };
  return { exitCode: r.status || 1, stdout: '', stderr: (r.stderr || r.stdout || '').trim() };
}
```
In commitMicro, when the runner returns a gate `reason` (not `skipped_*` or `commit_failed`), return
`{ok: false, reason: 'gate-refused', gate_reason, message: <gate message verbatim>, removed_marker: false}`. Do not prefix it with "git commit failed".
</codebase_examples>

<anti_patterns>
- Do not call `cmdCommit` in-process (it calls process.exit through output()).
- Do not re-implement or import the gh-gate decision in micro.cjs. cmdCommit owns it.
- Do not sweep untracked files in the no-files mode (the old `git add .` bug).
- Do not remove the marker on a refusal. The user must be able to switch branch and rerun `micro commit`.
</anti_patterns>

<error_recovery>
- If a staged deletion fails through `df-tools commit` (`git add <deleted path>` errors), check whether cmdCommit's pathspec commit still
  records it. execGit returns a non-zero exit code rather than throwing, and the pathspec commit records a deletion of a path in HEAD. If it does not, record a Deviation (misc.cjs is off-limits here).
- The spawned df-tools inherits `process.env`. Tests must delete `DEVFLOW_SKIP_GH_GATE*` from the env they pass, the way
  misc-commit-gate.test.cjs `dfRun` does, or the escape leaks into the refusal tests.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: micro commits through df-tools commit, refused like any commit off the linked branch</name>
  <files>plugins/devflow/devflow/bin/lib/micro.cjs, plugins/devflow/devflow/bin/lib/micro.test.cjs</files>
  <action>
RED: write Test list items 1, 2, 4, 6 and 7, and move SM-1 onto a linked branch (item 3). Run micro.test.cjs: items 1, 2, 4 (no override
entry), 6 (if the resolution differs) and 7 fail for the right reason. Commit `test(53-03): ...`.
GREEN: replace `_defaultGitRunner` with the df-tools commit runner (see codebase_examples), including `_implicitFiles(cwd)`. Map gate
refusals to `reason: 'gate-refused'` with the verbatim gate message, keeping the marker. Keep the second (local-only STATE.md) runner call as it is:
it now also goes through df-tools commit. Remove `DEVFLOW_ALLOW_RAW_COMMIT` from commit envs. The read-only `rev-parse` and `ls-files` calls may keep
plain env. Commit `fix(53-03): ...`.
# CRITICAL: local-mode commit count and contents stay the same (Test list item 5).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/micro.test.cjs plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs</verify>
  <done>Store-mode micro is refused off the linked branch with the gate message, commits on it, and honours the logged escape. Local micro behaviour is unchanged. No raw git commit remains in micro.cjs.</done>
  <recovery>If the local regressions break because df-tools commit drops `.planning/STATE.md` (`commit_docs: false` fixtures), set `commit_docs: true` in those fixtures only if the old test was implicitly relying on raw git ignoring commit_docs. Record it.</recovery>
</task>

<task type="auto">
  <name>Task 2: micro workflow prose names the commit path</name>
  <files>plugins/devflow/devflow/workflows/micro.md</files>
  <action>
In workflows/micro.md, where the commit step is described, state that `micro commit` commits through `df-tools commit`. In store mode
it is therefore refused off an objective's linked branch with the normal gate message (remedy: `df-tools gh pr start <objective>`, or the
logged `DEVFLOW_SKIP_GH_GATE=1` escape), and the micro marker stays so it can be retried. Keep the existing 52-03 store-mode STATE.md wording.
Do not edit USER-GUIDE or CHANGELOG (53-07 owns them).
  </action>
  <verify>rg -n "df-tools commit" plugins/devflow/devflow/workflows/micro.md && node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>micro.md describes the commit path and the store-mode refusal, and the doc repo tests pass.</done>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in each task's `<verify>`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- micro.test.cjs passes, including the store refusal, linked-branch, escape and local-regression cases.
- `rg -n "DEVFLOW_ALLOW_RAW_COMMIT: '1'" plugins/devflow/devflow/bin/lib/micro.cjs` shows no commit-path use.
</verification>

<success_criteria>
In store mode, `micro commit` on an unlinked branch is refused with the normal gate message. micro keeps its single source commit, the
store-mode STATE.md skip and the #120 staging behaviour.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-03 and commit it with your docs commit.
</output>
