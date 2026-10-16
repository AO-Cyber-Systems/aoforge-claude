---
objective: 44-autonomy-hardening
trd: "06"
subsystem: upgrade
tags: [migration, git, commit, hooks, runtime-state, AUT-05]
requires: []
provides:
  - "migration 0008 (auto): gitignore + git rm --cached for .planning/.progress-guard.json and .planning/.awareness-cache.json"
  - "df-tools commit: staged-removal path (whole-index commit, foreign-index refusal)"
  - "upgrade-project.js: RUNTIME_STATE_FILES exempt from the dirty-before skip"
affects: [upgrade runner, upgrade-project hook, df-tools commit, every executor commit]
tech-stack:
  added: []
  patterns:
    - "check-ignore --no-index (global excludes off) decides 'already ignored'"
    - "whole-index commit only when the index holds nothing outside --files"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
    - plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/upgrade-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/hooks/upgrade-project.js
    - plugins/devflow/hooks/upgrade-project.test.js
status: complete
decisions:
  - "0008 since is '2.12.0': no registry/contract test compares since to the package version"
  - "0008 uses git rm --cached --force: plain rm --cached refuses when a staged copy differs from HEAD and the working file, which is routine for a hook-rewritten file after git add .planning/"
  - "0008 check-ignore runs with core.excludesFile=os.devNull: a personal global ignore must not stand in for the repo .gitignore entry"
  - "cmdCommit counts a staged removal only when its working copy still exists; a plain git rm (file gone) keeps the old pathspec commit"
metrics:
  tasks: 3
  completed: 2026-09-29
tokens_input: 12632931
tokens_output: 68688
tokens_cache_read: 12454816
tokens_cache_write: 177941
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 44 TRD 06: Migration 0008 untracks DevFlow runtime state files Summary

Migration 0008 gitignores and `git rm --cached`s the two DevFlow runtime-state files and leaves the
working copies alone. It applies only when a file is tracked, or is on disk and not ignored. Two
fixes make the result actually land. `df-tools commit` now commits a staged removal through the
whole index, so the pathspec `--only` re-stage can't resurrect it, and it refuses when other
paths are staged. The upgrade hook no longer skips its auto-commit because the always-dirty guard
file was modified.

## Progress

- [x] Task 1 step 1: `makeTrackedRuntimeStateProject` fixture builder — 8efe860
- [x] Task 1 step 2: RED tests 5-8 — 2af55e3
- [x] Task 1 step 3: GREEN migration 0008 — f9aaafd
- [x] Task 2: RED tests 2-4 — 5d98d40; GREEN in `cmdCommit` — 0a98921
- [x] Task 3: RED hook test 1 + `skipReason` unit test — a4aa988; GREEN — 582bfa3
- [x] Validation gates, `npm test`, final SUMMARY with Self-Check

Next step: none. The TRD is complete.

## What was built

- **`migrations/0008-runtime-state-untrack.cjs`**: `{ id:'0008', safety:'auto', since:'2.12.0', detect, apply, RUNTIME_STATE_FILES }`.
  - `detect` runs `rev-parse --is-inside-work-tree`, then one batched `ls-files -z`, then one batched `check-ignore --no-index --stdin -z` over the files on disk.
  - `apply` appends only the missing entries under `# DevFlow runtime state (migration 0008)`. It creates `.gitignore` if needed and is newline-safe.
  - `apply` then runs `git rm --cached --force --quiet -- <tracked>` and returns `changed = ['.gitignore'?, ...untracked]`.
  - `dryRun` writes nothing and runs no mutating git command.
  - Git runs with the `GIT_DIR`/`GIT_WORK_TREE`/... redirect vars stripped, so it can only touch `ctx.projectRoot`.
- **`misc.cjs` `cmdCommit`** (non-amend only):
  - One `git diff --cached --name-only --no-renames --diff-filter=D -z -- <files>` finds staged deletions whose working copy still exists. If there are none, behaviour is unchanged.
  - Otherwise those paths are not `git add`ed. The `mergeInProgress` guard still runs first.
  - If `git diff --cached` shows staged paths outside `--files`, it returns `{committed:false, reason:'staged_removal_with_foreign_index', staged, foreign, removals, error}` and exits 1.
  - Otherwise it runs `git commit -m msg` with no pathspec.
- **`upgrade-project.js`**: `skipReason` filters `RUNTIME_STATE_FILES` (loaded lazily from the bundled 0008 module; `[]` on error) out of the dirty-before check. Every other skip rule is unchanged, and the fast path still requires nothing.
- **`upgrade-fixtures.cjs`**: `makeTrackedRuntimeStateProject({ tracked, untrackedPresent, gitignore, version, home })` returns `{ root, home }`. The `.gitignore` is committed after the tracked files, which is the real-world tracked-then-ignored shape.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture + migration 0008 | `node --test 'lib/migrations/*.test.cjs' lib/upgrade.test.cjs lib/upgrade-cli.test.cjs` | 0 | PASS (138/138) |
| 2: cmdCommit staged removals | `node --test lib/commit-staged-removal.test.cjs lib/commit-failure.test.cjs bin/df-tools.test.cjs` | 0 | PASS (150/150) |
| 3: hook dirty exemption | `node --test --test-name-pattern=44-06 hooks/upgrade-project.test.js` | 0 | PASS (2/2) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test lib/migrations/0008-runtime-state-untrack.test.cjs` | 1 | FAIL: 15/15, module missing; runner test `applied: []` |
| GREEN (T1) | same | 0 | PASS: 16/16 |
| RED (T2) | `node --test lib/commit-staged-removal.test.cjs` | 1 | FAIL: tests 2, 2b and 3. Test 2 showed trap 1, with HEAD still tracking the guard after the pathspec commit. Regression tests 4/4b/4c passed. |
| GREEN (T2) | same + commit-failure | 0 | PASS: 10/10 |
| RED (T3) | `node --test --test-name-pattern=44-06 hooks/upgrade-project.test.js` | 1 | FAIL: 2/2. No commit notice after 20 s; `skipReason` returned "uncommitted edits … .progress-guard.json". |
| GREEN (T3) | same | 0 | PASS: 2/2 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | n/a | n/a |
| test | migrations + upgrade* + adopt* + commit-staged-removal + commit-failure + upgrade-project.test.js | 0 | PASS (268/268) |
| build | `df-tools upgrade --check` (worktree) | 0 | PASS: 0008 skipped ("no runtime state file is tracked or present without an ignore rule"); porcelain empty before and after |
| wave | `npm test` | 1 | 5073 pass / 11 fail / 50 skipped (5134). All 11 failures are outside this TRD; see below. |

### `npm test` failures (none caused by this TRD)

- **handoff-e2e.test.cjs (6):** the known pre-existing failures the TRD allows.
- **devflow-watch.test.cjs (4 in the full run; 5 when rerun alone, with the same cause):** the daemon never writes its PID file. The worktree has no `node_modules`, so `node-pty`, which the watcher shell needs, is missing. It is present in the main checkout. `devflow-watch.cjs` requires none of the files this TRD changed. `npm install` was not run in the worktree.
- **roadmap-reconcile.test.cjs E2E1 (1):** the self-test on this repo reports drift, because `44-06-SUMMARY.md` exists while ROADMAP.md still shows `- [ ] 44-06-TRD.md`. The dispatch forbids editing ROADMAP.md. This clears once the orchestrator ticks the line.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `git rm --cached` refuses a staged copy that differs from both HEAD and the working file**
- **Found during:** Task 1 GREEN
- **Issue:** `git add .planning/` followed by a hook rewrite leaves the guard file's index entry differing from both HEAD and the working file. This is routine in the affected repos. In that state a plain `git rm --cached` exits non-zero, so 0008 would fail and halt the upgrade.
- **Fix:** `git rm --cached --force --quiet`. With `--cached`, `--force` only drops the index entry and never touches the working file. Test 6f proves a plain `rm --cached` refuses in that state and that `apply` then succeeds and keeps the latest bytes.
- **Files modified:** `0008-runtime-state-untrack.cjs`, `0008-runtime-state-untrack.test.cjs`
- **Commit:** f9aaafd

**2. [Rule 2 - Correctness] Global excludes and git redirect env vars neutralized in 0008**
- **Found during:** Task 1 GREEN
- **Issue:** `check-ignore` honours the user's global `core.excludesFile`, so a personal ignore could hide a missing repo entry. An inherited `GIT_DIR`, for example from a git hook, could point `rm --cached` at another repository.
- **Fix:** `-c core.excludesFile=<os.devNull>` on the check, and the `GIT_*` redirect vars stripped from the migration's git env.
- **Commit:** f9aaafd

**3. [Design within TRD latitude] How `removals` is computed in `cmdCommit`**
- The TRD sketched `ls-tree HEAD` plus `ls-files`. I used one `git diff --cached --diff-filter=D --no-renames`, which yields exactly "in HEAD, not in the index". It also covers directory pathspecs such as the default `.planning/`, and on an unborn branch it simply returns nothing, which is the TRD's recovery rule. Only removals whose working copy still exists are counted. A plain `git rm` of a deleted file keeps the old pathspec commit beside foreign staged work, and test 4b pins that.

No existing upgrade or adopt test changed: none of their fixtures contain either runtime file, so 0008 detects `applies:false` there.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - 0008 detect rule: tests 5a-5e.
  - apply appends only missing entries and returns the right `changed`: tests 6a-6e.
  - Idempotency: test 7 and test 6b's `.planning/` rule.
  - commit records the removal and refuses a foreign index: tests 2, 2b and 3.
  - Hook commits over a dirty guard file: hook test 1.
- Gate failures: none in the TRD's gate list. The `npm test` failures are environmental, pre-existing, or the ROADMAP self-test (see Validation Gate Results).

## Self-Check: PASSED

- Files: all 7 key files exist (`ls` confirmed each one).
- Commits: 8efe860, 2af55e3, f9aaafd, 5d98d40, 0a98921, a4aa988 and 582bfa3 all appear in `git log c88f347..HEAD` on `df/exec-44-06`.
- STATE.md and ROADMAP.md were not edited, per the dispatch rules.
