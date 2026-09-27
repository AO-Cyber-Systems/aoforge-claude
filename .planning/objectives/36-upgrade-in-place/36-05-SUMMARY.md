---
objective: 36-upgrade-in-place
trd: "05"
subsystem: hooks — SessionStart upgrade, UserPromptSubmit notices
tags: [upgrade, hooks, sessionstart, notices, detached-commit]
requires: ["36-01 upgrade.cjs apply() + fixtures", "36-02 notices.cjs", "36-04a/b/c migrations 0001-0006"]
provides: ["hooks/upgrade-project.js (SessionStart; --commit-child mode)", "route-results.js emits project + global notices once", "hooks.json SessionStart index 1 = upgrade-project.js"]
affects: ["36-08 dogfood (the hook fires on the next session in a behind project)"]
tech-stack:
  added: []
  patterns: ["detached child commit via bundled df-tools commit --files", "spawned-hook tests with cwd=fixture, HOME=fake, CLAUDE_PLUGIN_ROOT=repo plugin (read-only)", "poll for the child's notice instead of sleeping"]
key-files:
  created:
    - plugins/devflow/hooks/upgrade-project.js
    - plugins/devflow/hooks/upgrade-project.test.js
  modified:
    - plugins/devflow/hooks/route-results.js
    - plugins/devflow/hooks/route-results.test.js
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/classify-session.test.js
    - .gitignore
key-decisions:
  - "The hook's own `info` notice carries `detail.changed_files` (plus from/to/applied/backup); the commit child adds a second notice from source `upgrade-commit` (info on success, warn `not committed: <reason>` otherwise)."
  - "Dirty-before counts untracked files as uncommitted content, and maps changed_files through `git rev-parse --show-prefix` because porcelain paths are repo-top relative."
  - "DEVFLOW_SKIP_HANDOFF_RESULTS now suppresses only handoff results (symmetric with DEVFLOW_SKIP_NOTICES)."
metrics:
  duration: "~25 min"
  completed: 2026-09-27
---

# Objective 36 TRD 05: SessionStart upgrade hook, detached commit, one-shot notices Summary

**A behind DevFlow project now upgrades itself at session start: a fast-path version check, a synchronous apply of the auto migrations through the bundled `upgrade.cjs`, then one detached `df-tools commit --files <changed_files>` unless a skip rule holds. Results reach the user once through `route-results.js`.**

## What was built

- `hooks/upgrade-project.js`
  - Exits without writing anything when `DEVFLOW_SKIP_UPGRADE=1`, when there is no `.planning/` dir in cwd or any ancestor, or when `config.json` `devflow.version` equals the bundled `plugin.json` version (the fast path). Only `upgrade.cjs` is required after the fast path.
  - `pluginRoot` = `CLAUDE_PLUGIN_ROOT` or `path.resolve(__dirname, '..')`. Code is never loaded from `~/.claude/devflow`.
  - Lock `<home>/.claude/devflow/locks/<slug>-<hash8>.lock` (realpath + sha1, same naming as the backup dir). It is created with `wx`, a lock older than 120 s is stolen once, and the lock is released in `finally`.
  - The git state is read BEFORE apply: busy (from `--git-path` rebase-merge/rebase-apply/MERGE_HEAD/CHERRY_PICK_HEAD/REVERT_HEAD/BISECT_LOG), detached (`symbolic-ref -q HEAD`), and dirty (porcelain v1 `-z --untracked-files=all`, rename sources included).
  - `apply({ projectRoot, userHome: os.homedir(), pluginVersion })`. It emits an `action` notice for pending confirm (names `/devflow:status check --migrate`), a `warn` notice for failures, and an `info` notice with the `changed_files` detail.
  - Skip reasons are `not a git repository`, `<op> in progress`, `detached HEAD`, and `uncommitted edits existed before the upgrade in <files>`. Each one produces a `warn` notice "…not committed: <reason>…" and no child.
  - Otherwise it runs `ensureExcluded` (adds `.planning/.devflow-notices.json` to `info/exclude` unless it is already ignored), then `spawn(process.execPath, [__filename, '--commit-child', root, to, ...changed], {detached:true, stdio:'ignore'}).unref()`.
  - `--commit-child` keeps only the files that exist or are tracked, runs the bundled `df-tools.cjs commit "chore(devflow): upgrade project to v<to>" --files …` (120 s timeout), then writes an `upgrade-commit` notice. Signing is never bypassed: `rg "gpgsign|no-gpg-sign|ALLOW_RAW_COMMIT"` on the hook prints nothing.
- `route-results.js`: `main()` gathers the handoff records (the existing functions are unchanged) and the notices (`findPlanningDir` walk-up → project path, plus `globalNoticesPath(os.homedir())`, via `takeUnconsumed` / `renderNotices`). It emits a single `additionalContext` and marks records consumed only after emitting. When there are no notices, the handoff-only output is byte-identical to `renderResults` (covered by a test).
- `hooks.json`: SessionStart = `sync-runtime, upgrade-project, awareness-cache-populate, classify-session`.
- `.gitignore`: `.planning/.devflow-notices.json`.

## Skip rule → test

| Rule | Test | Result |
|---|---|---|
| rebase in progress (`rebase-merge`) | 7 (DoD, 5 s wait) + 8 (notice once) | no commit, applied, warn |
| merge (`MERGE_HEAD`) | 9 | no commit, notice names merge |
| cherry-pick (`CHERRY_PICK_HEAD`) | 10, 18 | no commit |
| bisect (`BISECT_LOG`) | 11 | no commit |
| detached HEAD | 12 | no commit, notice names detached HEAD |
| dirty-before | 13 | no commit, names `.planning/config.json` |
| signing failure (fixture gpg.program exits 1) | 14 | no commit, `upgrade-commit` warn, fixture signing config still `true` |
| not a git repo | 17 | applied, notice, no child |
| held lock / stale lock | 16 | nothing applied / stolen and proceeds |

## Safety statement

The hook was **never run against this repository or the real `~/.claude`**. Every spawn in `upgrade-project.test.js` runs with `cwd` = a `mkdtemp` fixture, `HOME` = a `makeFakeHome()` directory (`gitEnv(fakeHome)`), and `CLAUDE_PLUGIN_ROOT` = this repo's `plugins/devflow`, which is only read. Every detached commit landed in a fixture repo. Signing was disabled on fixture repos only (by `initGitFixture`), and test 14 turns it back on for its own fixture. This session's live hooks run from the plugin cache, so the `hooks.json` edit did not make the hook fire here. `route-results.test.js` also got a fake HOME, so its runs never drain the real global notices file.

## Deviations from Plan

**1. [Rule 1 - Test bug] Test 4 compares with `git show --name-only --no-renames`.** With git's default rename detection, the JOB→TRD rename shows as one line (the new path). `changed_files` correctly lists both the old and new paths. Commit ef527ff.

**2. [Rule 2 - Safety] `route-results.test.js` `runHook` now sets `HOME` to a disposable dir.** It also clears `DEVFLOW_SKIP_NOTICES` / `DEVFLOW_SKIP_HANDOFF_RESULTS` in that helper. The hook now drains `~/.claude/devflow/.devflow-notices.json`, so without this the existing tests would read and consume the operator's real global notices. The existing assertions are unchanged. Commit 22249ca.

**3. Extra cases added:** 14b (hooks.json index), 21b (project notice found from a subdirectory), handoff byte-identity, and failed-migration → warn notice.

## TDD Evidence

| Phase | Command | Exit | Expected |
|---|---|---|---|
| RED T1 | `node --test plugins/devflow/hooks/upgrade-project.test.js` | 1 (0/20 pass) | FAIL (correct) — commit 3797248 |
| GREEN T1 | same | 1 (19/20; test 8 needs Task 2, as the TRD allows) | commit ef527ff |
| RED T2 | `node --test …/route-results.test.js …/classify-session.test.js` | 1 (47 pass, 6 new fail) | FAIL (correct) — commit 22249ca |
| GREEN T2 | `node --test …/route-results.test.js …/classify-session.test.js …/upgrade-project.test.js` | 0 (73/73) | PASS — commit 13cf7e6 |

Baseline before Task 2: route-results + classify-session had 47/47 passing.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: upgrade-project.js | `node --test plugins/devflow/hooks/upgrade-project.test.js` | 0 (after T2; 20/20) | PASS |
| 2: route-results + registration | `node --test` on the three hook suites | 0 (73/73) | PASS |
| hooks.json order | `node -e "…SessionStart.map(…)"` | 0 → `sync-runtime.js,upgrade-project.js,awareness-cache-populate.js,classify-session.js` | PASS |
| no signing bypass | `grep -nE "gpgsign\|no-gpg-sign\|ALLOW_RAW_COMMIT" upgrade-project.js` | 1 (no matches) | PASS |

## Validation Gate Results (regression gate, baseline-relative)

Full suite: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`, with output in the session scratchpad.

Observed totals (for information): tests 3781, pass 3748, fail 1, skipped 32, cancelled 0.

| Failure | Classification |
|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | pre-existing (listed in baseline-failures.tsv) |

No new failures. `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- Auto-fix cycles used: 1 (test 4 `--no-renames`)
- Must-haves verified: 9/9
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/upgrade-project.js, plugins/devflow/hooks/upgrade-project.test.js
- FOUND commits: 3797248, ef527ff, 22249ca, 13cf7e6
