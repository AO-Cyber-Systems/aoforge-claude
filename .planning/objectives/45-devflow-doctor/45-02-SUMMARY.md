---
objective: 45-devflow-doctor
trd: "02"
job: 45-02
subsystem: upgrade-migrations
tags: [migration, gitignore, runtime-state, nested-planning, upgrade-hook]
requires: []
provides:
  - "0008.discover(ctx) -> {tracked, present, unignored} (project-relative posix paths, any depth)"
  - "0008.isRuntimeStatePath(rel) and RUNTIME_STATE_BASENAMES exports"
  - "upgrade-project.js dirty-before exemption is a predicate, so nested runtime state lands unattended"
affects: [45-06]
tech-stack:
  added: []
  patterns:
    - "git glob pathspecs (`:(glob)**/.planning/<name>`) for discovery instead of a filesystem walk"
    - "check-ignore --no-index decides ignored-ness; nested coverage via `**/.planning/<name>` entries"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
    - plugins/devflow/hooks/upgrade-project.js
    - plugins/devflow/hooks/upgrade-project.test.js
decisions:
  - "Nested paths get `**/.planning/<basename>` ignore entries; root paths keep their root-form entries, so existing projects' .gitignore output is byte-identical to before"
  - "`git rm --cached` runs with `--literal-pathspecs`: the paths are exact names git itself listed, so a directory name containing glob characters is never re-read as a pattern"
  - "Migration `since` stays 2.12.0 (the existing contract test pins it and the runner does not require a bump)"
metrics:
  duration: "8 min"
  completed: 2026-09-30
  tasks: 2
  files: 4
---

# Objective 45 TRD 02: Migration 0008 covers nested `.planning/` runtime state Summary

Migration 0008 now finds every tracked or unignored `**/.planning/.progress-guard.json` and `**/.planning/.awareness-cache.json` through git glob pathspecs, untracks them from the index only, and ignores them, so aodex's `flutter/.planning/.progress-guard.json` is covered and a second run is a no-op.

## What was built

**Task 1 — nested discovery and apply in 0008.**
- `isRuntimeStatePath(rel)` is a lexical check: the last two posix segments are `.planning` and one of `RUNTIME_STATE_BASENAMES`.
- `discover(ctx)` returns `{tracked, present, unignored}`. `tracked` comes from `git ls-files -z`, and untracked files from `git ls-files -z --others`. Neither uses `--exclude-standard`, so ignored files still show up as "present". `unignored` is decided by `git check-ignore --no-index` with the global excludes file off, as before. A non-git directory gives empty lists.
- `detect` uses discovery, and the reason keeps its `tracked: …; present and not ignored: …` format.
- `apply` covers the two root paths plus every discovered path, appends one deduped block under the 0008 header, then runs `git rm --cached --force --quiet` on all tracked matches. `changed` is `.gitignore` (when written) plus the sorted tracked paths.
- `RUNTIME_STATE_FILES` is exported unchanged. `id`, `title`, `since` and `safety: auto` are unchanged.
- The listing pathspecs also carry the two literal root paths, so the root answer does not depend on `**/` matching zero directories. If a git build rejects the glob pathspec, listing falls back to plain `ls-files` filtered in JS (the TRD's error-recovery path). The fallback is not needed on git 2.50.1 and has no dedicated test.

**Task 2 — upgrade-project.js exemption.**
- The fixed Set of root paths became `runtimeStatePredicate()`, which uses the bundled module's `isRuntimeStatePath`. It falls back to membership in `RUNTIME_STATE_FILES` when the export is missing, and to "exempt nothing" if the module cannot be loaded. Both are the fail-safe direction: a skip, never a swept-in dirty file.
- A dirty nested guard file no longer blocks the detached upgrade commit.

## Deviations from Plan

None to the TRD's scope. Three small points:

1. **Test 5 strengthened.** As first written it passed vacuously in RED, because root-only 0008 reports `applies:false` while nested files were still tracked. I added an assertion that no runtime file is tracked at any depth after the first apply, before the RED commit. Test 7 (nested file already ignored by `**/.planning/`) passes in RED too. That is expected: it is a guard-rail on unchanged behaviour.
2. **Extra tests.** I added a `discover` on a non-git directory case, and a `skipReason` unit case for nested and lookalike paths (`flutter/.planning/config.json` is not exempt).
3. **`--literal-pathspecs`** on the `git rm --cached` call (Decisions above).

No fixture change was needed: `makeTrackedRuntimeStateProject` already handles nested paths (`writeRel` creates parent directories, and `contentFor` falls back for unknown paths).

## Known cost

`git ls-files --others` without `--exclude-standard` walks every untracked directory that is not a nested repo, including ignored ones such as `node_modules` or `build/`. A glob pathspec cannot prune directories. This is deliberate: the TRD wants ignored copies classified through check-ignore, and `--exclude-standard` would also apply the user's global excludes, which the migration deliberately does not honour. The cost is one extra `ls-files` listing per migration `detect` or `apply` run.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: nested discovery + apply (RED bead151, GREEN b4fa18e) | `node --test plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs` (60 tests) | 0 | PASS |
| 2: hook exemption (RED 389ad64, GREEN 1e1be60) | `node --test plugins/devflow/hooks/upgrade-project.test.js` (31 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../0008-runtime-state-untrack.test.cjs` | 1 | FAIL (correct): 8 nested tests failed, 16 existing passed |
| GREEN (task 1) | `node --test .../0008-runtime-state-untrack.test.cjs .../upgrade.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test .../upgrade-project.test.js` | 1 | FAIL (correct): test 10 timed out waiting for a commit that the dirty-before skip suppressed, and the skipReason unit test failed |
| GREEN (task 2) | `node --test .../upgrade-project.test.js` | 0 | PASS (correct): 31/31 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (wave) | `npm test` | 1 | 5387 pass / 9 fail. All 9 are in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` (daemon "failed to spawn shell"). None touch this TRD's files. |

The `devflow-watch.test.cjs` failures reproduce in this worktree in isolation and pass when the same file runs from the main checkout. The daemon exits 3 with "failed to spawn shell" from this worktree path. That points at the worktree or sandbox environment, not at these changes. This diff touches neither `devflow-watch.cjs` nor any handoff code.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. Nested detect (tests 2, 6), nested apply index-only with the working file intact (3, 4), idempotent re-run (5), root behaviour and existing tests unchanged (8), hook exemption (10 and the unit case).
- Gate failures: the 9 environment-related daemon tests above; no failure in any file this TRD touched.

## Commits

- bead151: test(45-02): 0008 nested runtime state (RED)
- b4fa18e: feat(45-02): 0008 untracks nested .planning runtime state
- 389ad64: test(45-02): nested runtime state lands unattended (RED)
- 1e1be60: fix(45-02): upgrade-project exempts nested runtime state from dirty-before

## Self-Check: PASSED

Files verified present in the worktree (`0008-runtime-state-untrack.cjs`, its test, `upgrade-project.js`, its test). All four commit hashes verified on `df/exec-45-02` via `git log`.
