---
objective: 45-devflow-doctor
trd: "06"
job: 45-06
subsystem: doctor
tags: [doctor, doc-05, doc-06, git-guard, runtime-state, migrations, validate-health, skill-markers, tdd]

requires:
  - objective: 45-devflow-doctor
    provides: "45-02 m0008.discover/detect/apply at any .planning/ depth; 45-04 doctor engine + check contract + changedThisRun; 45-10 autonomous markers moved out of .planning/"
provides:
  - "lib/doctor-git.cjs: isGitRepo, lsFiles, stagedPaths, dirtyPaths, indexChangeGuard(root,{exclude,env}), worktreeGuard(root,pathspecs,{exclude,env}), rmCached, toExcluder"
  - "doctor check 20 legacy-runtime-state (with fix): tracked/present .progress-guard.json, .awareness-cache.json, .autonomous-retry-*, .autonomous-resume-* at any .planning/ depth"
  - "doctor check 21 pending-migrations (with fix = upgrade.apply, auto only)"
  - "doctor check 22 validate-health (with fix = validate health --repair); defers E020/I022/W040"
  - "doctor check 23 skill-markers (with fix = unlink stale .skill-active/.edit-override)"
  - "isLegacyRuntimePath / isAutonomousMarkerPath exported from check 20 for the other checks' worktree guards"
affects: [45-08 end-to-end SC4/SC5 through the CLI, 45-09 docs]

tech-stack:
  added: []
  patterns:
    - "Index-changing doctor fixes go through doctor-git.indexChangeGuard: refuse when anything outside ctx.changedThisRun is staged or .gitignore has an uncommitted change"
    - "Worktree-writing fixes go through worktreeGuard over the paths they write; legacy runtime-state paths are excluded as the doctor's own, never user work"
    - "Every fix re-checks its guard at fix time instead of trusting run()'s answer"
    - "The doctor never commits; an applied fix returns the exact df-tools commit command in notes"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doctor-git.cjs
    - plugins/devflow/devflow/bin/lib/doctor-git.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-pending-migrations.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs
  modified: []

key-decisions:
  - "pending-migrations and validate-health exclude legacy runtime-state paths from their worktree guard, so a hook-rewritten tracked .progress-guard.json does not make pending-migrations unfixable in the initial run (one --fix run converges on the aodex shape)"
  - "indexChangeGuard stays strict: only ctx.changedThisRun is excluded, never runtime-state paths, so a user's staged runtime file still blocks the index change"
  - "Outside a git repo indexChangeGuard answers ok:false (index change n/a) and worktreeGuard answers ok:true (worktree fixes proceed)"
  - "An untracked .gitignore counts as an uncommitted .gitignore change for the index guard"
  - "pending-migrations is not fixable while upgrade.check reports failed (apply would halt part-way)"
  - "EDIT_OVERRIDE_TTL_MS is mirrored, not required: hooks/ is not in the ~/.claude/devflow mirror; a test pins equality"
  - ".planning/.devflow-notices.json is never matched by the legacy check (orchestrator decision; regression test)"

patterns-established:
  - "Checks that need git go through doctor-git (one module, GIT_* redirect vars stripped, -z parsing, env from ctx.env)"

requirements-completed: [DOC-05, DOC-06]

metrics:
  duration: "about 12 minutes (11:28Z to 11:40Z)"
  completed: 2026-09-30
  tasks: 3
  files: 9

verification:
  gates_defined: 2
  gates_passed: 2
tokens_input: 8550642
tokens_output: 93592
tokens_cache_read: 8357585
tokens_cache_write: 192947
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 06: Doctor project checks + DOC-06 staged-changes guard Summary

**Four project doctor checks (legacy runtime state, pending migrations, validate health, stale edit-gate markers) plus a `doctor-git` guard. The index-changing untrack fix is refused whenever unrelated work is staged or `.gitignore` is dirty, and it leaves the tree untouched when it refuses.**

## What changed

- **`lib/doctor-git.cjs`** (new): git queries that spawn with `cwd: root`, the GIT_* redirect vars stripped (the 0008 pattern), `-z` parsing, and `env` taken from `ctx.env`.
  - `stagedPaths` runs `diff --cached --no-renames`.
  - `dirtyPaths` runs `status --porcelain=v1 --untracked-files=no` over the given pathspecs. It reports untracked files only when asked.
  - `indexChangeGuard` refuses when anything is staged or `.gitignore` has an uncommitted change (staged, unstaged or untracked). Outside a git repo it answers "n/a".
  - `worktreeGuard` checks a list of pathspecs. Outside a git repo it answers ok.
  - `exclude` accepts a Set, an array or a predicate.
  - `lsFiles` and `rmCached` keep all git spawning in this one module.
- **`20-legacy-runtime-state`**:
  - **Discovery.** `m0008.discover()` finds the two 0008 files at any depth. Autonomous markers are found with the `:(glob)**/.planning/.autonomous-{retry,resume}-*` pathspecs, both tracked and `--others`. Outside a git repo, only the root `.planning/` is scanned on disk.
  - **Severity.** Tracked → error. Present → warn.
  - **Fixability.** The fix is fixable only when `indexChangeGuard` passes, and the guard is consulted only when an index change is actually needed. Dead files are always fixable.
  - **Fix steps.** The fix runs `upgrade.backup`, then copies nested files to `<bk>/nested/<rel>`. It runs `m0008.apply` only when a 0008 file is tracked or unignored, and runs `rmCached` on tracked markers. Then it unlinks every working copy.
  - **Output.** It returns `changed`, `backup`, and notes that end with `commit with: node ~/.claude/devflow/bin/df-tools.cjs commit "chore: untrack DevFlow runtime state" --files .gitignore <untracked paths>`. `.gitignore` appears only when 0008 changed it. When nothing needs committing, the notes say so.
- **`21-pending-migrations`**:
  - **Severity.** `upgrade.check` failed → error. Pending auto migrations or a stamp behind the engine → warn, fixable. Only `pending_confirm` → warn, not fixable, with `fix_command` set to the exact `upgrade --apply --only <id> --confirm` command (0006 adds `--kind <kind>`).
  - **Guards.** The fix runs behind `worktreeGuard(['.planning','CLAUDE.md','.gitignore'])`, plus `indexChangeGuard` when 0008 is pending.
  - **Fix.** `upgrade.apply` (auto migrations only). It returns `changed_files`, `backup` and a commit command.
- **`22-validate-health`**:
  - **How it runs.** It spawns `node <dfToolsPath> --cwd <root> validate health` with `HOME=ctx.userHome` (`ctx.exec` can be injected). It parses the JSON and follows `@file:`.
  - **Mapping.** E020, I022 and W040 go to `details.deferred` and never set the severity. The remaining errors → error, warnings → warn.
  - **Fix.** Fixable when `repairable_count > 0` and `.planning/` is clean. The fix runs `--repair`, and `changed` comes from `repairs_performed[].path`.
- **`23-skill-markers`**:
  - **`.skill-active` is stale when:** it has expired (`skill-active.isExpired`), it cannot be parsed, or it has no usable `expires_at` and is older than `DEFAULT_TTL_MS` (measured from `started_at`, falling back to mtime).
  - **`.edit-override` is stale when:** its mtime is older than the 5-minute TTL.
  - **Fix.** It re-classifies each marker immediately before unlinking it, so a marker that became live is left alone.

Not edited: doctor.cjs, doctor-cli.cjs, doctor-fixtures.cjs, the README, 0008, upgrade.cjs, validate.cjs, skill-active.cjs.

## End-to-end check through the real CLI (scratch, fake HOME)

I ran the worktree's `df-tools doctor --json` on an aodex-shaped fixture with a garbage `.skill-active` present.

- **Report:** `legacy-runtime-state=error*`, `pending-migrations=warn*`, `validate-health=warn`, `skill-markers=warn*` (`*` = fixable).
- **`--fix`:** the legacy, pending-migrations and skill-markers fixes were all applied in one run. Afterwards all three read ok.
- **Index:** only the two staged removals are staged, and the backup landed under the fake home.
- **validate-health stays warn:** the stamped fixture has W001 (`PROJECT.md` has no `## Requirements` section). 45-08 needs to add that section for health to come back clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] The worktree guards exclude legacy runtime-state paths**
- **Found during:** Task 2
- **Issue:** On the aodex shape, hooks keep rewriting the tracked `.planning/.progress-guard.json`. With a plain `worktreeGuard(['.planning',…])`, pending-migrations would come back unfixable in the initial run, and the engine only calls fix() for results that were fixable at the start. So `--fix` could not converge in one run, which is what 45-08 test 3 expects.
- **Fix:** The pending-migrations and validate-health worktree guards exclude `ctx.changedThisRun` plus `isLegacyRuntimePath(rel)`. `indexChangeGuard` still excludes only `changedThisRun`.
- **Files modified:** 21-pending-migrations.cjs, 22-validate-health.cjs, 20-legacy-runtime-state.cjs (exports the predicate)
- **Commit:** 99c5ac1 (tests: "a modified tracked runtime-state file is not user work", "one --fix run converges")

**2. [Rule 2 - Correctness] pending-migrations is not fixable while `upgrade.check` reports `failed`**
- **Found during:** Task 2
- **Issue:** `upgrade.apply` halts at the first failure, so promising a fix would be false.
- **Fix:** In that case the check is not fixable, and `fix_command` is `df-tools upgrade --check`.
- **Commit:** 99c5ac1

**3. [Rule 2 - Correctness] A `.skill-active` with an unparseable `expires_at` is aged like one with no `expires_at`**
- **Found during:** Task 3
- **Issue:** `isExpired` treats an unparseable `expires_at` as never expiring, which would hold the edit gate open forever.
- **Commit:** c63a2df

### Other notes
- **Extra exports.** `doctor-git` exports `lsFiles`, `rmCached` and `toExcluder` beyond the artifact list, so checks never spawn git themselves.
- **Mirrored constant.** `EDIT_OVERRIDE_TTL_MS` is copied into check 23 rather than required, because `hooks/` is not in the runtime mirror. A test asserts it equals the hooks constant.
- **Verify paths.** The TRD's `<verify>` commands point at REPO_ROOT paths. I ran them against the worktree, where this work lives.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: doctor-git guard + legacy-runtime-state | `node --test <wt>/…/doctor-git.test.cjs <wt>/…/doctor-checks/20-legacy-runtime-state.test.cjs` | 0 (33/33) | PASS |
| 2: pending-migrations + validate-health | `node --test <wt>/…/doctor-checks/21-22-project.test.cjs` | 0 (19/19) | PASS |
| 3: skill-markers | `node --test <wt>/…/doctor-checks/23-skill-markers.test.cjs` | 0 (12/12) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED T1 (0675dc5) | `node --test doctor-git.test.cjs 20-legacy-runtime-state.test.cjs` | 1 (Cannot find module) | FAIL (correct) |
| GREEN T1 (b8f1a3c) | same | 0 | PASS (correct) |
| RED T2 (52cd2a6) | `node --test 21-22-project.test.cjs` | 1 (Cannot find module) | FAIL (correct) |
| GREEN T2 (99c5ac1) | same | 0 | PASS (correct) |
| RED T3 (46db555) | `node --test 23-skill-markers.test.cjs` | 1 (Cannot find module) | FAIL (correct) |
| GREEN T3 (c63a2df) | same | 0 | PASS (correct) |

No REFACTOR commits were needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test doctor-git.test.cjs doctor-checks/2*.test.cjs` (+ doctor.test.cjs) | 0 (90/90) | PASS |
| wave | `npm --prefix <worktree> test` | 1 (5723 tests, 5662 pass, 11 fail) | PASS (only known pre-existing failures) |

The 11 wave failures are all known and pre-existing: devflow-watch start/stop and multi-project CLI (5), and handoff pipeline e2e plus LK-1/LK-2 (6). They fail because the worktree has no node_modules. No doctor, upgrade or hook test failed. `doctor-cli.test.cjs` and `hooks/planning-writes.audit.test.js` pass with the four new checks loaded (70/70).

## Post-TRD Verification

- Auto-fix cycles used: 0 (every GREEN passed on its first run)
- Must-haves verified: 7/7 truths. Tests cover each one: DOC-06 refusal leaves the tree byte-identical (test 6, 7, 9b); commit command (5, 9b); pending/confirm/refusal (10-12); validate-health mapping and HOME (13-14); markers (15-18).
- Gate failures: None

## Self-Check: PASSED
