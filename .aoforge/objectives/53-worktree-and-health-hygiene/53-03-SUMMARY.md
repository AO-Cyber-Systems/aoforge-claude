---
objective: 53-worktree-and-health-hygiene
trd: "03"
subsystem: micro
tags: [micro, store-mode, gh-gate, df-tools-commit, override-log, raw-commit]

requires:
  - objective: 50-gh-enforcement
    provides: "misc.cjs cmdCommit store-mode GEN-01 branch gate, its logged DEVFLOW_SKIP_GH_GATE escape and the Refs trailer"
  - objective: 52-store-mode-polish
    provides: "commitMicro store-mode skip of the STATE.md row (state_row: 'skipped_store_mode')"
provides:
  - "micro's default runner spawns `df-tools commit <message> --files <list>` instead of a raw `git commit` with DEVFLOW_ALLOW_RAW_COMMIT=1"
  - "Store-mode `micro commit` on the default branch, an unlinked branch or a detached HEAD is refused with the gate message, with nothing committed or staged and the marker kept"
  - "commitMicro refusal result: {ok: false, reason: 'gate-refused', gate_reason, message, removed_marker: false}; cmdMicro prints it as JSON on stdout (exit 1) and the message on stderr"
  - "The logged DEVFLOW_SKIP_GH_GATE=1 escape works for micro and writes one gate:gh override entry"
affects: [53-07-docs-and-full-suite, micro]

tech-stack:
  added: []
  patterns:
    - "Reuse cmdCommit by spawning the df-tools CLI next to the module (path.join(__dirname, '..', 'df-tools.cjs')), never by calling it in-process (it exits through output()) and never by copying the gate"
    - "Gate-reason allow-list in micro.cjs guarded against drift by a test that scans gh-gate.cjs for its refuse() codes"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/micro.cjs
    - plugins/devflow/devflow/bin/lib/micro.test.cjs
    - plugins/devflow/devflow/workflows/micro.md

key-decisions:
  - "53-03: spawn the df-tools CLI from micro rather than call cmdCommit in-process or copy the gate, so the gate, the override log and the Refs trailer have one owner"
  - "53-03: only the three gh-gate refusal codes (detached_head, default_branch, unlinked_branch) become gate-refused; every other failed commit stays commit-failed. G-5 fails if gh-gate.cjs gains a code micro does not map"
  - "53-03: the no-files list is resolved in micro (staged, else tracked modifications, never untracked) with `git diff --relative`, because df-tools commit with no --files commits .planning/ only and resolves paths from the project root"

requirements-completed: ["53-3"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-04
tokens_input: 11770164
tokens_output: 63690
tokens_cache_read: 11467047
tokens_cache_write: 302961
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 53 TRD 03: micro commits through `df-tools commit` Summary

**`df-tools micro commit` now commits through `df-tools commit`, so in store mode it is refused off an objective's linked branch with the normal GEN-01 gate message, honours the logged `DEVFLOW_SKIP_GH_GATE=1` escape, and no raw `git commit` remains in micro.cjs.**

## Progress
- [x] Task 1 RED: failing tests for the store-mode gate, no-files resolution and raw-commit guard — 54501582
- [x] Task 1 GREEN: micro's default runner spawns `df-tools commit`; gate refusals map to `gate-refused`; no raw `git commit` left — b7153bf7
- [x] Task 2: micro.md names the `df-tools commit` path and the store-mode refusal — 37052155
- [x] Finalize: SUMMARY, state updates and docs commit — (this commit)

## What changed

- `micro.cjs`: `_defaultGitRunner` is gone. `_dfToolsCommitRunner` resolves the file list (explicit `--files`, else `_implicitFiles`: staged, else tracked modifications, both `--no-renames --relative -z`), spawns `df-tools commit <message> --files ...` with `cwd` set to the project root, and maps its JSON result onto the existing runner contract `(cwd, {message, files}) -> {exitCode, stdout, stderr}` plus `reason` and `json`. The injectable `gitRunner` seam is unchanged, so the mock-runner tests are untouched.
- `commitMicro`: a runner `reason` in `GATE_REASONS` returns `gate-refused` with the gate message verbatim (not prefixed "git commit failed"); the marker and `.micro-description` stay so the user can switch branch and rerun. Every other failure is still `commit-failed`.
- `cmdMicro commit`: a `gate-refused` result is printed like `df-tools commit`'s own refusal: JSON on stdout with exit 1, the message on stderr. Other failures still go through `error()`.
- `DEVFLOW_ALLOW_RAW_COMMIT` is removed from every env in micro.cjs, including the read-only `rev-parse` and `ls-files` calls.
- `workflows/micro.md`: Step 4 states the commit path, the store-mode refusal, both remedies and that the marker stays.
- `misc.cjs` was not touched. Every micro case is expressible through `df-tools commit`, including a staged deletion (R-4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SM-4 also moved onto a linked branch**
- **Found during:** Task 1 RED
- **Issue:** The TRD names SM-1 as the store test to move. SM-4 also runs `commitMicro` with `gitRunner: null` in store mode on the default branch, so it would now be refused.
- **Fix:** Added a `linkStoreBranch(env)` helper (checkout a branch, write a v3 mapping linking it to objective 50) and used it in SM-1 and SM-4. SM-1 and SM-4 now run on a linked branch; the refusal cases are the new G-1 and G-2.
- **Files modified:** plugins/devflow/devflow/bin/lib/micro.test.cjs
- **Commit:** 54501582

**2. [Rule 3 - Blocking] `spawnMicro` strips the gate environment variables**
- **Found during:** Task 1 RED
- **Issue:** micro now spawns df-tools with `process.env`, so a `DEVFLOW_SKIP_GH_GATE` in the ambient environment would leak into the refusal tests (the TRD's error_recovery note).
- **Fix:** `cleanGateEnv` removes `DEVFLOW_ALLOW_RAW_COMMIT`, `DEVFLOW_SKIP_GH_GATE` and `DEVFLOW_SKIP_GH_GATE_REASON` from the base env of `spawnMicro` and of the new gate fixture helper.
- **Commit:** 54501582

**3. [Rule 1 - Bug] `git diff --relative` for the implicit file list**
- **Found during:** Task 1 GREEN
- **Issue:** `git diff --name-only` prints repo-root-relative paths, but `df-tools commit` resolves paths from its cwd (the project root). A project whose `.planning/` sits in a subdirectory of its git repo would have failed with `pathspec 'proj/x.txt' did not match`. The old whole-index commit did not have this problem.
- **Fix:** `--relative` on both diff calls, and test R-5. Mutation-checked: with `--relative` removed R-5 fails with exactly that pathspec error; restored.
- **Files modified:** micro.cjs, micro.test.cjs
- **Commit:** b7153bf7

**4. [Rule 2 - Missing critical] Drift guard for the gate-reason allow-list**
- **Issue:** `GATE_REASONS` duplicates the three refusal codes of gh-gate.cjs. A new code would silently degrade to `commit-failed`.
- **Fix:** `_GATE_REASONS` is exported and test G-5 scans gh-gate.cjs for its `refuse('<code>'` calls and asserts every one is mapped. micro does not import or re-implement the gate decision.
- **Commit:** b7153bf7

### Additions beyond the Test list

- G-3 (refuse, switch to the linked branch, rerun: one commit, only a.txt, STATE.md byte-identical, no override logged) proves the "marker kept so the user can retry" claim end to end.
- R-4 covers the staged deletion case named in Test list item 5; no existing test did.
- X-2 asserts the runner locates df-tools next to micro.cjs and never through `~/.claude/devflow`.
- The SUMMARY was written with the Write tool rather than the `summary checkpoint|post` verb, to avoid the known bug that drops an untracked copy in the main checkout. The project is in local mode, so the file is the same bytes the verb would write.

### Behaviour change to know about

With `commit_docs: false` in a local-mode project, the source commit still lands, but the second (STATE.md row) commit is now skipped, because `df-tools commit` honours `commit_docs`. The old raw `git add`/`git commit` committed STATE.md regardless. micro prints `[micro] warning: STATE.md commit failed (df-tools commit did not commit (skipped_commit_docs_false)); STATE.md left dirty in working tree` and still returns `ok: true` with `state_commit_hash: null`. Checked with a scratch script (not committed). The warning's wording says "failed" for what is a deliberate skip. No existing fixture sets `commit_docs: false`, so no test needed the recovery step.

### Process note

The first `exec-context check` ran from the main checkout (the shell cwd is the primary directory), so it passed against the wrong tree and claimed the main checkout for 53-03. I released that claim with `exec-context release --id 53-03` and re-ran the check from the worktree with `--cwd`, which reported `checkout` as the worktree. All work then used the worktree and `--cwd`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: micro commits through df-tools commit | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs` | 0 (91 pass, 0 fail) | PASS |
| 2: micro workflow prose | `rg -n "df-tools commit" plugins/devflow/devflow/workflows/micro.md` then `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 0 (28 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern="53-03" plugins/devflow/devflow/bin/lib/micro.test.cjs` | 1 (7 fail: G-1..G-5, X-1, X-2; R-1..R-4 pass as regression guards) | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | 0 (55 pass) | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

RED reasons: G-1/G-2/G-3 saw the raw commit land (`{"ok":true,...,"state_row":"skipped_store_mode"}`, exit 0); G-4 saw no override entry; G-5 had no `_GATE_REASONS` export; X-1/X-2 matched `DEVFLOW_ALLOW_RAW_COMMIT: '1'` and the raw `commitArgs` in the source.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 1) | `node --test` on the three Task 1 files | 0 | PASS |
| test (task 2) | `node --test` on the two doc repo test files | 0 | PASS |
| test (objective) | `npm test` | not run | not_available here: TRD assigns the full suite to 53-07 |

Test list coverage: items 1 and 2 are G-1 and G-2, 3 is SM-1 (moved) plus G-3, 4 is G-4, 5 is the existing F1-*, FS-*, NS-*, e2e-1 plus R-4, 6 is R-1, R-2, R-3, and 7 is X-1.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (store refusal on unlinked and default branch; linked-branch single commit with STATE.md byte-identical and `state_row: 'skipped_store_mode'`; logged escape; local mode unchanged with #120 staging and no untracked sweep; no raw `git commit` or `DEVFLOW_ALLOW_RAW_COMMIT: '1'` in micro.cjs)
- Gate failures: None

## Discovered commands

None. Test commands came from the TRD `<verify>` elements and `.planning/STACK.md` (general profile: `node --test {files}`).

## Self-Check: PASSED

- Files found: plugins/devflow/devflow/bin/lib/micro.cjs, plugins/devflow/devflow/bin/lib/micro.test.cjs, plugins/devflow/devflow/workflows/micro.md, this SUMMARY.
- Commits found on df/exec-53-03: 54501582, b7153bf7, 37052155.
- `git diff --stat ade74256 HEAD` shows only the four expected files; misc.cjs and the protected docs were not touched.
