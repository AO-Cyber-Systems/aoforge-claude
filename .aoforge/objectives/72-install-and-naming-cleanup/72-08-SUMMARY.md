---
objective: 72-install-and-naming-cleanup
trd: "08"
subsystem: tooling
tags: [aoforge-rename, migrations, planning-dir, config-key, upgrade-hook, W067]

requires:
  - phase: 72-05
    provides: "compat.cjs planningRoot/planningRel/isLegacyPlanning/bothPlanningDirs/PLANNING_DIR_NAMES; W066 (planning-layout.cjs); legacy-layout-fixtures planningProject"
  - phase: 72-06
    provides: "hooks resolve both planning directories; hook contract test 7"
  - phase: 72-10
    provides: "legacy identities in gates and transcript readers"
provides:
  - "Migration 0012 (auto, since 3.0.0): legacy planning directory -> .aoforge/ with git mv (fs rename outside git), backup first, AOForge ignore lines added after the legacy ones, deferral on dirty/busy/exists"
  - "Migration 0013 (auto, since 3.0.0): config.json devflow{} -> aoforge{} (in place; merge with aoforge winning)"
  - "upgrade.cjs: readStamp reads aoforge then the legacy key; stamp writes leave only aoforge; ctx.changedSoFar; report.deferred; changed paths collapse under a moved directory"
  - "upgrade-project.js: leaves the fast path for a legacy layout, commits the move as one rename commit, writes a deferral notice naming the reason and `aof-tools upgrade --apply --only 0012`"
  - "0010: readBlock recognises either marker slug, upsertBlock writes AOForge markers, the block covers both directory names, storeCommitSteps(root)"
  - "W067 legacy-config-key (validate health Check 22, validate --help)"
  - "lib/git-busy.cjs: BUSY_MARKERS + busyOperation shared by the hook and 0012"
  - "__fixtures__/legacy-migration-fixtures.cjs legacyProject({state, store, stamp})"
affects: [72-09, 72-15, 72-17, 72-21, 72-25]

tech-stack:
  added: []
  patterns:
    - "A migration may return `{ changed: [], deferred: <code>, notes }`: it wrote nothing; the runner keeps it pending, holds later writes, does not stamp, and removes a backup it claimed only for it"
    - "ctx.changedSoFar tells a dirty-tree guard the run's own changes from the user's"
    - "A changed directory in the hook's skip rule counts as dirty when anything under it was dirty or untracked before the run"
    - "The commit child keeps a path only HEAD still has, so a git mv commits as renames"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/git-busy.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs
    - plugins/aoforge/hooks/upgrade-project.legacy.test.js
  modified:
    - plugins/aoforge/aoforge/bin/lib/upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/validate.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/aoforge/hooks/upgrade-project.js
    - plugins/aoforge/hooks/planning-layout.legacy.test.js

key-decisions:
  - "0012's dirty guard is staged or unstaged changes to tracked files anywhere in the work tree, minus the paths earlier migrations of the same run changed (ctx.changedSoFar). Without that exclusion, 0001 normalising a legacy config.json would make every such project defer forever"
  - "A deferred 0012 halts the later migrations of the run (as a failure does), so 0013 and the stamp never write a legacy config.json that a later session would then commit apart from the move"
  - "The 0010 block is current when it covers the project's resolved directory (not byte-equal), so a legacy store project's legacy-marker block is not offered a second write before 0012 rewrites it with AOForge markers and both directory names"
  - "Outside git, 0012 leaves ignore files alone and reports only the two directories"
  - "The upgrade hook's fast path reads only the new stamp key; a legacy key or a legacy directory always takes the slow path"
  - "Untracked, unignored files under the legacy directory make the hook skip the commit (the move stays applied and staged, with a notice); the commit stages whole directories and must not sweep them in"
  - "The deferral notice rides in notices.cjs's fixed schema: kind, reason, id and command go in `detail`; key `upgrade-deferred-<id>` replaces it while it stays deferred"

requirements-completed: [INST-03, INST-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 36min
completed: 2026-10-09
tokens_input: 33305381
tokens_output: 143076
tokens_cache_read: 32653446
tokens_cache_write: 651663
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 08: Projects move themselves: `.planning/` -> `.aoforge/` and `devflow{}` -> `aoforge{}` Summary

**A legacy project's next session start moves its planning tree to `.aoforge/` with `git mv` and commits it as one rename commit (R100 for every file but config.json, plus `M .gitignore`), renames the config stamp key, and on a dirty or mid-operation tree changes nothing and leaves a notice naming the reason and `aof-tools upgrade --apply --only 0012`.**

## Progress
- [x] Task 1: Fixture builder: legacy git projects in each state — b6ae4d34
- [x] Task 2: Migration 0012 and the 0010 block's legacy markers — c0a7f0ea (RED), c86531ce (GREEN)
- [x] Task 3: 0013, the runner, the hook, W067 — fe0d9529 (RED), 6920a68a (GREEN)

## Estimate

`aof-tools estimate trd 72-08` before execution: 10 min (P90 19 min), $3.79 (P90 $6.30), 3 tasks, confidence low (n=73 TRD-level samples; Tasks 2 and 3 classed schema_tdd with no class samples). Measured: 36 min.

## What was built

- **Fixture** `legacy-migration-fixtures.cjs`: `legacyProject({ state: 'clean'|'dirty'|'merge'|'nogit', store, stamp })` builds the 72-05 legacy tree plus `state.json` and `STACK.md`, a full-template-shape config.json carrying the legacy stamp (`devflow: {version, migrations_applied, upgraded_at}`), the 0008-era `.gitignore` line, and an untracked `.planning/.skill-active` excluded through `.git/info/exclude`. `store: true` writes the legacy-marker 0010 block and untracks the cache the way 0010 did. Only 0012 and 0013 apply to it (`upgrade --check`: `2 pending (0012,0013)`).
- **0012** (`auto`, `3.0.0`): detect applies only to the legacy layout (both -> not, reason names W066). apply: guards (`exists`, `rebase|merge|cherry-pick|revert|bisect` via `git-busy.cjs`, `dirty`) -> `upgrade.backup` plus `0012-gitignore.before` / `0012-info-exclude.before` -> store block re-upsert -> `git mv` (fs rename when git tracks nothing there, or outside git; leftovers moved entry by entry) -> `.aoforge/` counterpart after every legacy ignore line in `.gitignore` and info/exclude. `changed` = `['.aoforge', '.gitignore', '.planning']`.
- **0010**: markers built from NAMES/LEGACY; `readBlock` finds either slug (two blocks of any slug still refuse); `upsertBlock` replaces in place with AOForge markers; `blockLines` lists `.aoforge` then the legacy directory; "current" = covers the resolved directory. `storeCommitSteps(root)` prints the project's own directory (STORE_COMMIT_STEPS stays the `.aoforge/` constant); 0011's dedupe uses it. Notes name the resolved directory (the 72-05 hand-off).
- **0013** (`auto`, `3.0.0`): renames the legacy key in place, merges when both exist (aoforge wins), not applicable without the legacy key or config.json.
- **Runner** (`upgrade.cjs`): `readStamp` / the stamp's `prev` read `aoforge` then the legacy key; `writeStamp` drops the legacy key (the new key takes its slot); `ctx.changedSoFar`; a `deferred` apply is reported in `report.deferred`, kept pending, holds later writes, and removes a backup claimed only for it; `changed_files` collapse under a changed directory. The planning directory is resolved per call (nothing cached), so 0013 and the stamp land in `.aoforge/` after 0012. `upgrade --apply --raw` prints `deferred 0012 (dirty): ...`.
- **Hook** (`upgrade-project.js`): fast path needs the new stamp key at the bundled version and `!isLegacyPlanning(root)`; re-excludes the notices file after apply; one `action` notice per deferral; skip rule treats a changed directory as dirty when anything under it was; the commit child keeps HEAD-only paths. Busy markers come from `git-busy.cjs`.
- **W067** `legacy-config-key` (validate health Check 22, warning, not repairable): only the legacy key present; fix `aof-tools upgrade --apply --only 0013`. `aof-tools validate --help` lists it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The commit child dropped the legacy directory from `--files`**
- **Found during:** Task 3 (design, before GREEN)
- **Issue:** after `git mv`, `.planning` is neither on disk nor in the index, so the child's keep filter dropped it and the commit would have recorded additions only, leaving the deletions staged.
- **Fix:** the keep filter also keeps a path HEAD still has (`inHead`). `aof-tools commit` needed no change: its pathspec commit matches HEAD entries, and test 1 shows R100 renames.
- **Files modified:** plugins/aoforge/hooks/upgrade-project.js
- **Commit:** 6920a68a

**2. [Rule 1 - Bug] 0012 would defer forever after an earlier migration of the same run**
- **Found during:** Task 3 (hook contract test 7, legacy layout: 0001 rewrites config.json before 0012)
- **Issue:** the run's own change made the tree "dirty", so 0012 deferred on every session.
- **Fix:** the runner passes `ctx.changedSoFar`; 0012 ignores those paths. `upgrade.test.cjs` test 24 (which pins the exact ctx keys) and `REPORT_KEYS` were updated for `changedSoFar` and `deferred`.
- **Files modified:** upgrade.cjs, upgrade.test.cjs, 0012-planning-dir-move.cjs
- **Commit:** 6920a68a

**3. [Rule 1 - Bug] Two repository gates failed on Task 1/2 files**
- **Found during:** the full-suite gate
- **Issue:** `regex-escape.repo.test.cjs` (0012 hand-rolled `escapeRegExp`) and `repo-state-delegation.test.cjs` test 9 (the fixture's `const EXCLUDE_LINE` matched its `const EXCLUDE` needle).
- **Fix:** 0012 uses `text-escape.cjs` `escapeRegExp`; the fixture constant is `INFO_EXCLUDE_LINE`.
- **Files modified:** 0012-planning-dir-move.cjs, legacy-migration-fixtures.cjs, 0012-planning-dir-move.legacy.test.cjs
- **Commit:** 6920a68a

**4. [Rule 2 - Missing] Shared busy list, 0010 commit steps, CLI and help text**
- New `lib/git-busy.cjs` (the TRD allowed moving BUSY_MARKERS to a shared lib). 0011's dedupe and 0010's notes use `storeCommitSteps(root)` (72-05 hand-off). `upgrade-cli.cjs` prints deferrals. `help.cjs` lists W067. None of these files were in `files_modified`.
- **Commits:** c86531ce, 6920a68a

**5. Test expectations updated (not behaviour regressions)**
- `0010-store-gitignore.test.cjs` BLOCK constant: both directory names (built from LEGACY).
- `hooks/planning-layout.legacy.test.js` test 7: a legacy project's notices now land in `.aoforge/` (0012 moves it in the same run); the 72-06 hand-off.
- Hook test 2's TRD wording "`kind: 'deferred'`" is carried as `detail.kind` because notices.cjs keeps only source/level/message/detail/key.

## Hand-off

- **72-09 (0014 CLAUDE.md rebrand)**: a deferred 0012 holds every later migration in the run (0013, 0014). 0014 runs after the move, so it sees `.aoforge/`.
- **72-15 (doctor legacy checks)**: `report.deferred` and W067 exist; doctor can surface a deferred 0012. The upgrade backups now include `0012-gitignore.before` / `0012-info-exclude.before`. A legacy move makes two backups in one run (the runner's and 0012's own, as 0010 does).
- **72-17 (docs)**: document 0012/0013, W067, the deferral notice, and that legacy ignore lines are kept beside the new ones for one release.
- **72-21 (dogfood)**: running the hook on this repository moves `.planning/` only on a clean tree with no operation in progress. Untracked, unignored files under `.planning/` (this repo has `.gitkeep`s in several objective dirs) make the hook skip the commit and leave the staged move for a manual commit; commit or remove them first, or run `aof-tools upgrade --apply --only 0012` and commit by hand.
- **Shim removal (release after 3.0.0)**: 0012, 0013, the legacy-key read in `readStamp`/`stampObject`, the legacy 0010 markers and the both-names block go together.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | `node -e "…legacyProject({state:s})…"` for clean, dirty, merge, nogit (+ a scratch check: clean and store `git status` empty, store cache ignored, `upgrade --check` -> `2 pending (0012,0013)` after Task 3) | 0 | PASS |
| 2: 0012 + 0010 | `node --test 0012-planning-dir-move.legacy.test.cjs 0010-store-gitignore.test.cjs` (+ 0011 x3, commit-steps, rename-guard) | 0 (116/116) | PASS |
| 3: 0013, runner, hook, W067 | `node --test hooks/upgrade-project.legacy.test.js hooks/upgrade-project.test.js 0013-config-key-rename.legacy.test.cjs upgrade.test.cjs` (+ 0012, 0010) | 0 (129/129) | PASS |
| 3: layout contracts | `node --test hooks/planning-layout.legacy.test.js` (+ 0013 suite, hook legacy suite) | 0 (41/41) | PASS |
| verification | `aof-tools upgrade --check --raw --path <scratch legacy project>` | 0 (`2 pending (0012,0013)`; dirty apply: `deferred 0012 (dirty): …`; store: 0010 not offered) | PASS |
| repo gates | `node --test rename-guard.repo doc-refs.repo planning-writes.repo planning-writes.audit` (+ regex-escape.repo, repo-state-delegation) | 0 (100/100; 31/31) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test migrations/0012-planning-dir-move.legacy.test.cjs` | 1 (16 fail: 15 module not found, 9b `.gitignore block missing`) | FAIL (correct) |
| GREEN (Task 2) | same + `0010-store-gitignore.test.cjs` | 0 (16 + 25 pass after the BLOCK constant update) | PASS (correct) |
| RED (Task 3) | `node --test 0013-config-key-rename.legacy.test.cjs hooks/upgrade-project.legacy.test.js hooks/planning-layout.legacy.test.js` | 1 (15 of 41 fail; 11b and 13b pass as controls) | FAIL (correct) |
| GREEN (Task 3) | same | 0 (41 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 1: 11,736 tests, 11,674 pass, 51 skipped, 11 fail. All 11 are the aoforge-watch daemon and handoff-pipeline tests (node-pty is absent in a worktree, the known baseline). The first run also failed regex-escape.repo and repo-state-delegation test 9; both were fixed (deviation 3) and pass. | PASS (baseline) |

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 7/7 (truths 1-7: tests 7/8, 7c-7e + hook 2/3, 9/9b, 10/11, 12/12c, hook 1-5, 13)
- Gate failures: None beyond the node-pty daemon baseline

## Self-Check: PASSED

- FOUND: the 7 created files (fixture, git-busy.cjs, 0012 + test, 0013 + test, hook legacy test)
- FOUND: b6ae4d34, c0a7f0ea, c86531ce, fe0d9529, 6920a68a on `df/exec-72-08-planning-dir-and-config-key-migrations`
- Work tree clean after the last task commit; repo gates (rename-guard, doc-refs, planning-writes, regex-escape, repo-state-delegation) pass on the committed tree
