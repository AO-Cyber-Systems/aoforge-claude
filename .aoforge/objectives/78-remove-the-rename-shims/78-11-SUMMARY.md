---
objective: 78-remove-the-rename-shims
trd: "11"
subsystem: compat
tags: [rename-shims, compat, planning-dir, agent-namespace, user-files, hooks]
requires: ["78-03", "78-04", "78-05", "78-06", "78-07", "78-08", "78-10"]
provides:
  - compat.cjs resolves `.aoforge/` only (planningDirName, planningRoot, planningRel, PLANNING_DIR_NAMES, isPlanningDirName, planningDirLabel, findProjectRoot)
  - compat.isOwnAgentType / isOwnExecutor accept the `aoforge:` namespace only
  - compat.userDotFile(home, name) is <home>/.claude/aoforge/<name>, no fallback
  - compat exports no isLegacyPlanning, bothPlanningDirs, legacyRuntimeHome or resolveUserFile
  - a `.planning/`-only project is no project for every hook (gate-edits, gate-commits, gate-executor-stop, route-intent, verify-completion, classify-session, statusline)
affects: [78-12]
tech-stack:
  added: []
  patterns: ["history readers (session-audit) keep their own legacy-aware namespace list instead of using the gate helper"]
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
    - plugins/aoforge/aoforge/bin/lib/config.cjs
    - plugins/aoforge/aoforge/bin/lib/init.cjs
    - plugins/aoforge/aoforge/bin/lib/session-audit.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/merge-driver-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs
    - plugins/aoforge/aoforge/bin/lib/awareness.test.cjs
    - plugins/aoforge/aoforge/bin/lib/merge-driver-cli.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs
    - plugins/aoforge/hooks/agent-types.legacy.test.js
    - plugins/aoforge/hooks/planning-layout.legacy.test.js
    - plugins/aoforge/hooks/home-project-detection.test.js
key-decisions:
  - "Keep the module name compat.cjs and every surviving signature: ~80 modules and every hook import it; renaming would multiply conflicts with main (lazy CLI, one-process hooks) for no behaviour change. The header says why the name stays"
  - "PLANNING_DIR_NAMES / isPlanningDirName are single-name: a list that still held .planning would keep scans, attributes and ignore lines treating the old directory as a planning tree, i.e. a reader. No scan was found that must still skip a stray .planning/ (stack-detect skips every dot-directory anyway)"
  - "userDotFile ignores ~/.aoforge/ and the pre-rename dot directory: user decision (remove the dot-dir fallbacks); doctor check 17 (kept with its fix, 78-06) moves 3.0.0's files and 78-06's notice points at it"
  - "session-audit keeps a local namespace list (aoforge: and the pre-rename one) instead of compat.isOwnAgentType: it reads transcripts recorded before the rename, a history reader (OBJECTIVE goal: history names stay); the gates trust aoforge: alone"
  - "config-get stays unguarded; in a .planning/-only project it now exits 1 with its own 'No config.json found at <root>/.aoforge/config.json' error (config.test.cjs case 4 pins that a missing config.json is an error, so a default answer was not an option). The two legacy tests that expected exit 0 were updated"
duration: 19min
completed: 2026-10-17
status: complete
requirements-completed: [SC-1, SC-4]
tokens_input: 44132669
tokens_output: 120111
tokens_cache_read: 43790901
tokens_cache_write: 341424
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 11: compat single name Summary

**compat.cjs now names `.aoforge/`, the `aoforge:` namespace and the runtime home alone: a `.planning/`-only project is no project for any hook or for the CLI's readers, the pre-rename executor is no longer trusted by the gates, user files come only from `~/.claude/aoforge/`, and the four legacy-only exports are deleted, with aliasLegacyEnv as the one shim left for 78-12.**

## Progress
- [x] Task 1: RED — the shims are gone (unit, hooks, user files) — 4d7018c9
- [x] Task 2: GREEN — planning directory, project root and agent namespace — ccdf399b
- [x] Task 3: GREEN — user files from the runtime home only — 637ce2b6
- [x] Refactor: two stale comments in files this TRD touches — 1ea269c7

## What changed

- **compat.cjs**
  - Removed `OLD_PLAN_DIR`, `hasOldPlanDir`, `isLegacyPlanning`, `bothPlanningDirs`, `legacyRuntimeHome`, `resolveUserFile` and the now-unused `isFile`.
  - `planningDirName(root, fsImpl)` always returns `.aoforge`; it keeps its signature and reads nothing from disk.
  - `PLANNING_DIR_NAMES` is `['.aoforge']`. `isPlanningDirName` accepts `.aoforge` only. `planningDirLabel()` is `.aoforge/`.
  - `findProjectRoot` checks for `.aoforge/` only and walks past a legacy directory. The $HOME stop rules are unchanged.
  - `isOwnAgentType` accepts `aoforge:<name>` only. `isOwnExecutor` accepts `aoforge:executor` only.
  - `userDotFile(home, name)` is `path.join(runtimeHome(home), name)`.
  - The header was rewritten: what the module provides, why the name stays, and that `aliasLegacyEnv` is the last shim (78-12). Apart from `aliasLegacyEnv`, nothing in the module uses LEGACY.
- **gh-rebrand.cjs** takes `isLegacyPlanning` from `planning-layout.cjs`, with a comment saying the converter still recognises a pre-rename checkout.
- **watcher-allowlist.cjs** reads `userDotFile(home, \`${NAMES.watch}-allow.json\`)` only. The LEGACY import is gone and the header and doc comments were updated.
- **config.cjs / init.cjs**: comments only, saying user files come from the runtime home only.
- **session-audit.cjs**: a local `isAoforgeName` keeps accepting both namespaces, because this module reads history (see Deviations).
- **Behaviour that changes through compat, with no code edit in the caller:**
  - gh-check-cli reads `.aoforge/config.json` only.
  - merge-driver install writes the `.aoforge` pair only.
  - 0008 detects and ignores runtime state under `.aoforge/` only.
  - The 0010 block lists `.aoforge` only. A 3.0.x block that still lists both directories still counts as current.
  - awareness and `init --branch` read a branch's `.aoforge/STATE.md` only.
  - Comments updated where the behaviour changed: gh-check-cli, merge-driver-cli, 0008, 0010, init.
- **Handed-off comments fixed:**
  - 0007 `stateRel` (from 78-08).
  - `handoff-fixtures.cjs` `writePidFile` doc (from 78-05).
- **Hooks:** none edited. Every hook change comes through compat.

### Test files whose expectations changed

| File | Change |
|---|---|
| `bin/lib/compat.legacy.test.cjs` | Rewritten for the single-name world: 9-19, 12a-12g, 13/13a/13b, 14/14b/14e, 15, 16/16b, plus a new CLI case 20 (validate W066 broken, `state load` refused, doctor note, no `.aoforge/`). The aliasLegacyEnv cases 5-8 are unchanged. |
| `bin/lib/compat.home.test.cjs` | The 73-11 resolveUserFile cases became userDotFile cases: `~/.aoforge/` is not read, a directory at the path does not fall back, and resolveUserFile is not exported. Case 10's comment was updated. |
| `bin/lib/file-identities.legacy.test.cjs` | Tests 4-6 rewritten: defaults.json, the Brave key and the watch allowlist are read only from `~/.claude/aoforge/` and never from the pre-rename directory or `~/.aoforge/`. Test 7 also checks that `~/.aoforge/` is left untouched. |
| `hooks/agent-types.legacy.test.js` | Inverted: the pre-rename executor and planner are not trusted (gate-edits and gate-bash-writes deny; verify-commits and gate-executor-stop say nothing). |
| `hooks/planning-layout.legacy.test.js` | Rewritten. The aoforge-layout contract 1-8 is kept. New legacy cases 9-14 (gate-edits allows, gate-commits passes, gate-executor-stop does not block, route-intent and verify-completion say nothing, classify-session matches layout none, the statusline has no estimate segment) each assert that no `.aoforge/` is created. The skipped case-7 legacy variant and the 0012 header lines are gone. |
| `hooks/home-project-detection.test.js` | New case 7: a repo below $HOME that holds only the legacy directory prints the control's output for classify-session, gate-edits, gate-commits and route-intent. |
| `bin/lib/watcher-allowlist.test.cjs` | The `~/.aoforge/` copy is ignored. When both files exist, only the runtime-home file is read. |
| `bin/lib/awareness.test.cjs` | G2: the `.aoforge/` line appears exactly once, and only its legacy twin may sit beside it. This repository's .gitignore keeps that twin until main is reconciled (78-12). |
| `bin/lib/merge-driver-cli.test.cjs` | BLOCK holds the `.aoforge` pair only. |
| `bin/lib/migrations/0008-runtime-state-untrack.test.cjs` | 7b: a nested legacy log is no longer runtime state and gets no `.gitignore` line. 8: `isRuntimeStatePath` returns false for it. |
| `bin/lib/migrations/0010-store-gitignore.test.cjs` | BLOCK has the `.aoforge` lines only. |
| `bin/lib/planning-layout.legacy.test.cjs` | Case 3: config-get (unguarded) fails with its own missing-config error. See Deviations: the TRD said not to edit this file. |
| `bin/lib/legacy-layout-guard.legacy.test.cjs` | Case 6: config-get moved out of RUN_NORMALLY into its own case, which expects exit 1 with the missing-config error and not the guard's message. |

## Decisions Made

| Decision | Reason |
|---|---|
| Keep the module name `compat.cjs` and every surviving signature (`planningDirName(root, fsImpl)`, `userDotFile(home, name)`) | About 80 modules and every hook import it. Renaming would multiply conflicts with `main` (lazy CLI, one-process hooks) and change no behaviour. The header says why the name stays. |
| `PLANNING_DIR_NAMES` / `isPlanningDirName` are single-name | A list that still held `.planning` would keep scans, attributes and ignore lines treating the old directory as a planning tree, which makes it a reader. No scan was found that must still SKIP a stray `.planning/`: stack-detect skips every dot-directory, and repo-state counts code extensions only. So no local LEGACY constant was needed. |
| userDotFile ignores `~/.aoforge/` and the pre-rename dot directory | User decision: remove the dot-dir fallbacks. Doctor check 17, kept with its fix in 78-06, moves 3.0.0's files, and 78-06's notice points at it. |
| session-audit keeps its own two-namespace matcher | It is a history reader: transcripts from before objective 72 use the pre-rename agent and skill names, and the OBJECTIVE says history names stay. 78-12 already lists session-audit as a history consumer of LEGACY. The gates trust `aoforge:` alone. |
| config-get stays unguarded and errors in a legacy-only project | `config.test.cjs` case 4 pins "a missing config.json keeps the existing error". 78-07's two cases assumed config-get would still exit 0 after 78-11. That cannot hold without breaking case 4 or reading the legacy config, so they now expect exit 1 with "No config.json found at `<root>/.aoforge/config.json`". |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] session-audit lost its pre-rename history**
- **Found during:** Task 2 full suite (transcript-names.legacy 16b, 16d ×3).
- **Issue:** session-audit aliased `isAoforgeName = compat.isOwnAgentType`. With compat single-name, `devflow:quick` Skill calls and `devflow:executor` transcripts recorded before the rename no longer counted as AOForge's own.
- **Fix:** a local `OWN_AGENT_NAMESPACES = [NAMES.agentNs, LEGACY.agentNs]` with the same non-empty-name rule. The compat import is now just `findProjectRoot`.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/session-audit.cjs
- **Commit:** ccdf399b

**2. [Rule 3 - Blocking] the config-get expectation in two legacy tests (one of them "do not edit")**
- **Found during:** Task 2 full suite.
- **Issue:** `planning-layout.legacy.test.cjs` case 3 (lib) and `legacy-layout-guard.legacy.test.cjs` case 6 expected `config-get workflow.auto_advance` to exit 0 in a legacy-only project "before and after TRD 78-11". After 78-11 the command reads `.aoforge/config.json`, which does not exist there. `config.test.cjs` case 4 requires that a missing config.json stays an error.
- **Fix:** both cases now expect exit 1 with "No config.json found at `<root>/.aoforge/config.json`", without the guard message, and with no `.aoforge/` created. The TRD's gotcha said to run the lib file as a regression check and not edit it. That one assertion could not hold, so only the config-get expectation and its comment changed. Every other case in the file runs unchanged and passes.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs
- **Commit:** ccdf399b

**3. [Rule 3 - Blocking] expectation churn outside files_modified**
- **Found during:** Task 2 full suite.
- **Issue:** these suites asserted both planning-directory names, as the TRD's error_recovery foresaw: awareness G2, merge-driver-cli 12-14, 0008 7b and 8, 0010 11.
- **Fix:** each was updated to the single name in the same commit (see the table above). Production comments that the new behaviour made false were updated in the same modules (merge-driver-cli, 0008, 0010, gh-check-cli), along with the two comments handed off by 78-05 and 78-08.
- **Commit:** ccdf399b, with comments in 1ea269c7.

**4. Test-list placement**
- The TRD's case 3 (CLI in a legacy-only project) is in `compat.legacy.test.cjs` as case 20. It passed at RED by design: it is the 78-01/78-07 regression contract, now checked with the compat fallback gone.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test compat.legacy.test.cjs compat.home.test.cjs hooks/agent-types.legacy.test.js hooks/planning-layout.legacy.test.js hooks/home-project-detection.test.js file-identities.legacy.test.cjs` | 1 (120 tests, 41 fail, every one for the right reason; controls such as the aoforge statusline segment, the gate-commits deny and CLI case 20 pass) | PASS (fails correctly) |
| 2: GREEN | same set | 1, with 12 failures, all of them Task 3's user-file cases; cases 1-4 green | PASS |
| 2: GREEN | full suite (392 files, watcher-shell excluded) after the churn fixes | 1 (12603 tests: 12540 pass, 13 fail = 11 Task-3 cases + 2 known noise) | PASS |
| 3: GREEN | `node --test compat.legacy.test.cjs file-identities.legacy.test.cjs watcher-allowlist.test.cjs config.test.cjs init.test.cjs doctor-checks/17-user-dot-dir.test.cjs compat.home.test.cjs` | 0 (273/273) | PASS |
| 3: GREEN | `rg -n "LEGACY" compat.cjs` | 0 (the import line, one header comment and the two aliasLegacyEnv lines only) | PASS |
| Verification | `node -e "...filter(k=>k in c).length, c.PLANNING_DIR_NAMES.length"` | 0, prints `0 1` | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (4d7018c9) | the 6-file set above | 1 | FAIL (correct). Example failures: planningDirName gave `.planning`; findProjectRoot returned the legacy root; `devflow:executor` was allowed and blocked; gate-commits denied in the legacy repo; the statusline showed `⏱ 78 W2/3` for the legacy root; the legacy defaults applied `quality` |
| GREEN (ccdf399b) | same set, plus the full suite | 1 | Cases 1-4 PASS; only Task 3's cases still red |
| GREEN (637ce2b6) | Task 3 set, plus the full suite | 0 / 1 | PASS; the full suite has only the 2 known noise failures |
| REFACTOR (1ea269c7) | `node --test init.test.cjs 0010-store-gitignore.test.cjs` | 0 (70/70) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (final, 637ce2b6) | full suite: `git ls-files -co --exclude-standard -- 'plugins/aoforge/*.test.cjs' 'plugins/aoforge/*.test.js' 'scripts/*.test.cjs'` minus watcher-shell.test.cjs, run through `node --test` (392 files) | 1 | 12603 tests, 12551 pass, **2 fail**, 50 skipped, 0 cancelled. Both failures are known noise: requirements-agreement 11 and validate-requirements 9 (EST-11, objective 75). The 4 planning-layout.legacy failures handed over by 78-10 are gone |
| rename guard | `node --test rename-guard.repo.test.cjs` | 0 (20/20) | PASS |

Excluded: `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`. Its W-3 fish-shell test hangs until timeout on this machine. micro.test.cjs did not hang and was not excluded.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the Task 2 churn round)
- Must-haves verified: 7/7
  - planningDirName, planningRoot, planningRel, PLANNING_DIR_NAMES, isPlanningDirName and planningDirLabel are single-name.
  - findProjectRoot finds `.aoforge/` only.
  - The 4 exports are gone, and userDotFile is runtime-home only.
  - isOwnAgentType and isOwnExecutor accept the aoforge namespace only.
  - aliasLegacyEnv is kept, and it is the only use of LEGACY.
  - gh-rebrand uses planning-layout, and watcher-allowlist uses `userDotFile(home, name)`.
  - In a legacy-only project: validate reports W066 broken, doctor gives the note, the CLI refuses, and no `.aoforge/` is created (compat case 20 and the hook cases).
- Gate failures: only the 2 known requirements-agreement items.
- 78-07 hand-off confirmed: gate-commits treats a `.planning/`-only project as no project. A raw `git commit` passes there (hooks case 10, home-project-detection case 7), so `AOFORGE_ALLOW_RAW_COMMIT=1` is no longer needed.

## Left for 78-12

- Delete `aliasLegacyEnv`, its four cases in compat.legacy.test.cjs (5-8), the header entry, the LEGACY import and test 16b's aliasLegacyEnv exception. Its only caller is its own test.
- Stale comments that still say a resolved planning directory may be "a legacy one". The behaviour is already single-name through compat. They were left alone so the ~30 caller modules need no edit, which is the same reason compat keeps its name.
  - Hook: hooks/gate-executor-stop.js:80. It is a hook, so this TRD did not touch it.
  - skill-active.cjs:48
  - migrations 0001:17, 0002:21, 0003:14, 0009:31, 0011:82
  - decision-queue.cjs:38
  - stack-profile.cjs:1053
  - awareness.cjs:364
  - benchmark.cjs:240
  - misc.cjs:523
  - planning-verbs-cli.cjs:149
  - doctor-checks 21:37, 23:38, 33:29
  - roadmap.cjs:517
  - gh-wiki.cjs:40
  - repo-state.cjs:30
  - planning-audit.cjs:55
  - skill-marker-health.cjs:53
  - stack-report.cjs:1245
  - session-audit.cjs:405
  - estimate-run-store.cjs:143
  - adopt.cjs:39
  - ui-metrics.cjs:20
  - flutter-ui-eval-bootstrap.cjs:47
  - roadmap-reconcile.cjs:26
  - scripts/estimate-window-eval.cjs:81
- Docs: CLAUDE.md's compat bullet (planningDirName/findProjectRoot "then the legacy directory", userDotFile/resolveUserFile, isOwnAgentType for one release) and the gate-edits/verify-commits/gate-executor-stop lines that still mention the pre-rename namespace.
- Note for the docs: benchmark and token-usage now see `.aoforge/` paths only. Git history and transcripts recorded under the legacy directory before objective 72 no longer count for those two readers (this follows the TRD's single-name decision). session-audit and agent-overhead still read the old names.

## Self-Check: PASSED

- FOUND: 4d7018c9 (RED), ccdf399b (GREEN, Task 2), 637ce2b6 (GREEN, Task 3), 1ea269c7 (REFACTOR)
- FOUND: plugins/aoforge/aoforge/bin/lib/compat.cjs, compat.legacy.test.cjs, hooks/planning-layout.legacy.test.js, hooks/agent-types.legacy.test.js, hooks/home-project-detection.test.js, watcher-allowlist.cjs, gh-rebrand.cjs
- The working tree is clean apart from the untracked `amp`, which was never staged.
