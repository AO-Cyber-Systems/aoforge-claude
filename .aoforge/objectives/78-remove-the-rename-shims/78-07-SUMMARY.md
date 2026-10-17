---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
tags: [rename-shims, migrations, legacy-layout, upgrade-hook, cli-guard, SC-2, SC-4]
requires: ["78-01"]
provides:
  - "Migrations 0012 (planning-dir move) and 0013 (config-key rename) removed with their tests and legacy-migration-fixtures.cjs"
  - "upgrade.RETIRED_MIGRATIONS: --only 0012|0013|0014 names AOForge 3.0.x and the manual step (docs/MIGRATING-TO-AOFORGE.md)"
  - "upgrade.readStamp/writeStamp: the aoforge key only; the pre-rename key is never read, moved or deleted"
  - "upgrade.apply/check on a legacy-only root: nothing written, `legacy_layout` plus one failed entry {id: layout}"
  - "legacy-layout-guard.cjs: legacyLayoutGuard + EXEMPT_COMMANDS, called once in aof-tools main() before dispatch"
  - "upgrade-project.js: one global `legacy-layout:<realpath>` notice for a legacy-only project; exported legacyRootFor"
affects: [78-08, 78-11, 78-12]
tech-stack:
  added: []
  patterns:
    - "A legacy-only project is refused once, before dispatch, with planning-layout.legacyLayoutMessage(root)"
    - "Retired migration ids stay reserved: a map id -> title answers --only instead of 'unknown migration id'"
    - "A legacy-only root is told through the GLOBAL notices file; a project notice would create .aoforge/"
    - "planning-layout.cjs is loaded lazily in upgrade.cjs so repoKey (status line path) keeps its small dependency set"
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-retired.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs
    - plugins/aoforge/aoforge/bin/lib/git-busy.cjs
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
    - plugins/aoforge/hooks/upgrade-project.js
    - plugins/aoforge/hooks/upgrade-project.legacy.test.js
    - plugins/aoforge/hooks/planning-layout.legacy.test.js
    - plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs
  deleted:
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
decisions:
  - "Migrations 0012 and 0013: REMOVED (user decision). Ids 0012-0014 stay reserved in RETIRED_MIGRATIONS, so --only names the 3.0.x path instead of 'unknown migration id'"
  - "The runner's generic deferred mechanism and the hook's HEAD-only-path commit handling: KEPT. They name no legacy name and serve any migration that defers or deletes (0002 renames with fs)"
  - "The stamp writer no longer removes the pre-rename key. 3.1 code touches old names only to report them; W067 (78-01) tells the user to delete it. A pre-rename-only stamp reads as no stamp, which is safe because every migration is detection-based"
  - "Guard scope: commands that read or write the project's planning tree refuse (help.cjs mutates, plus init); doctor and validate report; commands that touch only ~/.claude/aoforge, git config or files outside the planning tree run. Each exemption carries its reason in the module"
  - "tokens is guarded, not exempt: tokens backfill --write posts SUMMARY frontmatter into the planning tree (token-backfill.cjs applyBackfill -> summaryPost)"
  - "exec-context, project-decline and project-accept are exempt (grep: their libraries never resolve the planning root)"
  - "A legacy-only root also gets a failed entry {id: layout} in apply/check, so a caller that reads only failed (upgrade-cli --path, doctor) treats the run as not done"
requirements-completed: [SC-2, SC-4]
metrics:
  duration: 28min
  completed: 2026-10-17
  tasks: 3
  files: 17
status: complete
tokens_input: 42568478
tokens_output: 147194
tokens_cache_read: 42226439
tokens_cache_write: 341699
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

**Migrations 0012 and 0013 are gone. `--only 0012|0013|0014` names AOForge 3.0.x and the manual step, and the stamp lives under the `aoforge` key only. A legacy-only project gets the one legacy-layout message from both the CLI (exit 1 before dispatch) and the SessionStart hook (one global notice). No second planning tree is written anywhere.**

## Progress
- [x] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED b7a8dad1, GREEN cb3e6582, deferred-path coverage 7f245202
- [x] Task 2: the SessionStart hook tells a legacy-only project once — RED 3005f4ff, GREEN 043ba685
- [x] Task 3: the aof-tools guard — RED 05fadeea, GREEN 265c4501, full-suite follow-up 70a293a1

## What was built

- **Migrations 0012 and 0013 removed.** Both sources and both `*.legacy.test.cjs` files were removed with `git rm`, along with `__fixtures__/legacy-migration-fixtures.cjs`. Its only users were those two tests and the hook legacy test, which Task 2 rewrote. The registry loads without them; its ids are sorted and unique, with a gap at 0012-0013.
- **upgrade.cjs**
  - `LEGACY_STAMP_KEY` and the `LEGACY` import are gone (`rg -n LEGACY upgrade.cjs` finds nothing).
  - `stampObject` reads the `aoforge` key only. `writeStamp` sets that key in place, or appends it when absent, and touches no other key.
  - `RETIRED_MIGRATIONS = Object.freeze({ '0012': 'planning-dir move', '0013': 'config-key rename', '0014': 'CLAUDE.md rebrand' })` is exported. For an `--only` id the registry lacks, a retired id throws a RegistryError whose one problem line is `migration <id> (<title>) was retired after AOForge 3.0.x: run it with AOForge 3.0.x, or do it by hand (docs/MIGRATING-TO-AOFORGE.md, "Upgrading from 2.x")`. An id the registry still carries (0014, until 78-08 deletes it) resolves normally. A never-assigned id is still "unknown migration id".
  - `apply` and `check` check the root after the registry and `--only` are validated. When `isLegacyPlanning(root)` holds, they return the usual report with nothing considered, `legacy_layout: legacyLayoutMessage(root)` and `failed: [{ id: 'layout', phase: 'layout', error: <same text> }]`. They write nothing and take no backup.
  - `planning-layout.cjs` is loaded lazily, inside those paths only. See deviation 2.
  - The header comment was rewritten; it no longer says "one release".
- **git-busy.cjs**: the comment no longer names 0012.
- **upgrade-project.js (SessionStart)**
  - After the `AOFORGE_SKIP_UPGRADE` check, a found root without `.aoforge/` (or no root at all) is checked with the new exported `legacyRootFor(start, { find, layout })`. While compat still resolves `.planning/`, it calls `isLegacyPlanning` on the found root. After 78-11, when the finder returns null, it calls `findLegacyLayoutRoot(start)`.
  - A legacy root gets ONE global notice in `<HOME>/.claude/aoforge/.aoforge-notices.json`: `{ source: 'upgrade-project', level: 'action', key: 'legacy-layout:<realpath>', message: legacyLayoutMessage(realpath) }`. Then the hook returns. No migration runs, nothing is committed, info/exclude is untouched and there is no project notice.
  - `planning-layout.cjs` is loaded from the bundled LIB. MODULE_NOT_FOUND fails open; any other load error writes one stderr line.
  - The fast path is now `stamp === to`. A root holding `.aoforge/` loads nothing more than before.
  - The compat `isLegacyPlanning` import and the second `ensureExcluded` call are gone; the second call existed only because 0012 renamed the notices directory.
  - The header steps and the 0012 comments were rewritten. The deferral notice stays generic.
- **legacy-layout-guard.cjs (new)**: `legacyLayoutGuard({ command, args, cwd, commands, home })` returns `null` or `{ root, message }`.
  - It returns null for an unknown command, for an EXEMPT_COMMANDS entry and for a command that neither mutates nor is `init`.
  - It returns null for `upgrade` with `--global`, `--prune` or `--register`, and for any top-level help flag (issue #87: help is a question).
  - It also returns null when `findLegacyLayoutRoot(cwd)` is null.
  - Otherwise it refuses with `legacyLayoutMessage(root)`.
- **aof-tools.cjs**: one require, plus two lines after the unknown-flag check: `const legacy = legacyLayoutGuard({ command, args, cwd, commands: HELP_TABLE }); if (legacy) error(legacy.message);`

### EXEMPT_COMMANDS

| Command | Reason (as in the module) |
|---|---|
| doctor | reports the layout itself: no project is resolved for a legacy-only root and the note carries the message (TRD 78-01) |
| validate | reports the layout itself: `validate health` returns the one broken W066 and writes nothing, --repair included (TRD 78-01) |
| transcript-export | reads Claude Code transcripts and appends ~/.claude/aoforge/transcript-index.jsonl only |
| calibrate | writes ~/.claude/aoforge/calibration.json (or --out) only; planning trees are read to measure, never written |
| estimate | writes run state under ~/.claude/aoforge/state/estimates only; the roadmap is read, never written |
| handoff | the handoff queue in <cwd>/.aoforge-handoff/, never the planning tree |
| merge-driver | git config and the repository's info/attributes only; `resolve` merges the path git hands it |
| global-config | the user config under ~/.claude/aoforge only |
| changelog | CHANGELOG.md at the cwd only |
| exec-context | claims under the git common dir and worktrees beside the repository; exec-context.cjs never resolves the planning root |
| project-decline | ~/.claude/aoforge/declined-projects.json only (decline-tracker.cjs never resolves the planning root) |
| project-accept | ~/.claude/aoforge/declined-projects.json only (decline-tracker.cjs never resolves the planning root) |

Flag-based: `upgrade --global|--prune|--register` runs (they touch only the runtime home). Any help flag runs.

Refused in a legacy-only project: every other `mutates: true` command in help.cjs, plus `init`. That is adopt, commit, config-ensure-section, config-set, debug, decision, decision-queue, defaults-table, deprecation, doc, flutter-ui, frontmatter, generate, gh, init, initiatives, micro, migrate, milestone, objective, override, plan, planning, project-hygiene, quick, requirements, roadmap, scaffold, skill-active, stack, state, summary, sync-roadmap, template, todo, tokens, ui, upgrade, verification and workstreams. A new mutating command is refused by default.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Migrations 0012 and 0013 | REMOVED (user decision) | Their ids stay reserved: `RETIRED_MIGRATIONS` maps 0012/0013/0014 to a title, so `--only` names the 3.0.x path instead of "unknown migration id". |
| Runner's generic `deferred` mechanism; hook's HEAD-only-path commit handling | KEPT | They name no legacy name and serve any migration that defers or deletes (0002 renames with fs). The runner's deferred path lost its only tests with 0012, so upgrade.test.cjs case 27 now covers it (7f245202). |
| Stamp writer and the pre-rename key | No longer removes it | 3.1 code touches old names only to report them, and W067 (78-01) tells the user to delete the key. A pre-rename-only stamp reads as "no stamp", which is safe because every migration is detection-based. |
| Guard scope | Planning-tree commands (mutating + `init`) refuse; doctor/validate report; runtime-home/git-config/outside-tree commands run | Each exemption carries its reason in the module. `init` is read-only, but every skill calls it first, so it must refuse. |
| `tokens` | Guarded (the TRD listed it as exempt) | `tokens backfill --write` posts SUMMARY frontmatter into the planning tree (token-backfill.cjs `applyBackfill` -> `summaryPost`, planningRoot at line 207), so "transcripts and ~/.claude/aoforge state only" holds for `stamp` alone. |
| `exec-context`, `project-decline`, `project-accept` | Exempt (added to the TRD's starting list) | grep: exec-context.cjs and decline-tracker.cjs hold no planningRoot/planningRel/findProjectRoot reference. They write the git common dir, worktrees beside the repo, and ~/.claude/aoforge/declined-projects.json. |
| `handoff` reason | Corrected | The queue is `<cwd>/.aoforge-handoff/` (handoff.cjs HANDOFF_DIR), not ~/.claude/aoforge. It is still never the planning tree. |
| Legacy-only report shape | `legacy_layout` plus one `failed` entry `{id: 'layout', phase: 'layout'}` | A caller that reads only `failed` (upgrade-cli with `--path`, which the cwd-based guard does not see) exits 1 with the message instead of reporting "nothing pending". |
| Retired-id check order | After registry validation, before the legacy check | A broken registry still throws first. `--only 0012` in a legacy-only root names the retired path, which gives the same fix. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing coverage] The runner's `deferred` path had no test left**
- **Found during:** Task 2 (rewriting the hook legacy test)
- **Issue:** the only tests of the KEPT generic `deferred` mechanism were 0012's (runner) and the old hook legacy cases 2-3.
- **Fix:** upgrade.test.cjs case 27 covers it with a deferring registry migration: the migration stays pending, later writes are held, the backup claimed for it is removed, and nothing is written. The hook's `notifyDeferred` has no test that is not tied to a fixture: the hook loads only the bundled registry, so a test needs a fake plugin root. upgrade-project.test.js is outside this TRD.
- **Commit:** 7f245202

**2. [Rule 1 - Bug] upgrade.cjs's new require broke the status line estimate segment**
- **Found during:** full suite after Task 3
- **Issue:** the status line reaches `upgrade.repoKey` through estimate-run-store.cjs. `hooks/statusline-estimate.test.js` copies only compat, legacy-names, upgrade and estimate-run-store into its fake runtime. A top-level `require('./planning-layout.cjs')` therefore made the segment vanish (5 failures). The real mirror ships every lib, but the narrow dependency set of `repoKey` is the contract that test pins.
- **Fix:** upgrade.cjs loads planning-layout lazily, inside apply/check/`--only` only.
- **Commit:** 70a293a1

**3. [Rule 3 - Blocking] The real-fleet harness ran `stack init` in legacy-only repositories**
- **Found during:** full suite after Task 3
- **Issue:** `stack-drafter-fleet.test.cjs` runs `aof-tools --cwd ~/dev/<repo> stack init` against this machine's fleet. 23 fleet repos still have only `.planning/`, so the guard refused them (by design) and the harness treated a non-zero exit as a failure.
- **Fix:** a per-repo skip when `planning-layout.isLegacyPlanning(dir)`, with the reason. The header's skip list names it. The harness skips entirely in CI (no fleet root). The file is outside files_modified, and no TRD of objective 78 owns it.
- **Commit:** 70a293a1

**4. [Rule 3 - Blocking] hooks/planning-layout.legacy.test.js case 7, layout legacy**
- **Found during:** Task 2 (GREEN)
- **Issue:** it asserted that 0012 moves a legacy project during the hook run.
- **Fix:** the legacy variant is skipped with `RETIRED_BY_78_07`, naming the replacement (upgrade-project.legacy.test.js case 1). This follows 78-04's precedent. 78-11 owns the file and rewrites it; the aoforge variant still runs.
- **Commit:** 043ba685

**5. planning-layout.legacy.test.cjs case 6 also rewritten (beyond the TRD's cases 3-4)**
- 78-01's case 6 asserted the W066 advisory in `init plan-objective/execute-objective` JSON for a legacy-only root. `init` now refuses there, so case 6 asserts the refusal. The stderr names the legacy directory, 3.0.x, `git mv` and the guide, and no `--only`. The legacy parity block of case 3 was removed, together with its `normalise`/`comparable` helpers that nothing else used.
- **Commit:** 05fadeea (RED), green at 265c4501

### Notes
- **Must-have scope.** The "every command that reads or writes the planning tree" truth is implemented as the TRD's rule: `mutates` + `init`, minus the exemptions. Read-only commands that are not `init` (e.g. `config-get`, `progress`, `resolve-model`) still run in a legacy-only project, and the TRD's own case 6 requires `resolve-model` to run. They can still read `.planning/` until 78-11 drops the compat fallback. None of them writes or creates a planning tree.
- **Commits in a legacy-only project.** Until 78-11, `gate-commits.js` still treats a legacy-only project as an AOForge project (compat.findProjectRoot) and blocks raw `git commit`, while the guard refuses `aof-tools commit` there. Committing there needs `AOFORGE_ALLOW_RAW_COMMIT=1` until 78-11 lands. Objective 78 ships as one release, so released users never see this window.

## Left for later TRDs
- **78-08:** when it deletes 0014, `--only 0014` gives the retired line automatically. upgrade-retired.legacy.test.cjs case 3 already handles both states.
- **78-11:**
  - Rewrite `hooks/planning-layout.legacy.test.js`: drop the skipped case-7 legacy variant and the header lines about 0012.
  - Confirm that gate-commits/gate-edits treat a legacy-only project as no project.
  - Delete `COMMITTED_CANDIDATES`' legacy entry in stack-drafter-fleet.test.cjs if it wishes.
  - upgrade-project.js `noticesRel` and `findProjectRoot` comments still say "or a legacy one" (compat wording).
- **78-12 (docs):**
  - `docs/USER-GUIDE.md`, `docs/MIGRATING-TO-AOFORGE.md` and `CLAUDE.md` still describe migrations 0012/0013 as live. They need the CLI refusal, the hook's global notice and the `--only 0012|0013|0014` retired line.
  - These comments still name 0012:
    - `upgrade-cli.cjs:162`
    - `migrations/0008-runtime-state-untrack.cjs:8`
    - `migrations/0010-store-gitignore.cjs:51-59,95` (78-04's file)
    - `doctor-checks/README.md`
  - The CHANGELOG needs entries for the removal, the guard and the hook notice.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: retire 0012/0013 in upgrade.cjs | `node --test upgrade-retired.legacy.test.cjs upgrade.test.cjs upgrade-cli.test.cjs doctor-checks/21-22-project.test.cjs migrations/*.test.cjs` (21-pending-migrations.test.cjs does not exist; skipped per the TRD) — 300/300; `rg -n LEGACY upgrade.cjs` finds nothing | 0 / 1 (no match) | PASS |
| 2: hook legacy notice | `node --test hooks/upgrade-project.legacy.test.js hooks/upgrade-project.test.js hooks/route-results.test.js` — 74/74 | 0 | PASS |
| 3: aof-tools guard | `node --test legacy-layout-guard.legacy.test.cjs planning-layout.legacy.test.cjs help-delegation.test.cjs flag-spec.repo.test.cjs` — 122/122 | 0 | PASS |
| TRD verification | `git ls-files 'plugins/aoforge/aoforge/bin/lib/migrations/0012*' '.../0013*'` prints nothing; scratch `.planning/`-only repo: `aof-tools --cwd <repo> state load` exits 1 with the message and `<repo>/.aoforge` does not exist; `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs planning-writes.repo.test.cjs` 48/48 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED (b7a8dad1) | `node --test upgrade-retired.legacy.test.cjs upgrade.test.cjs` | 1 (11 of 51 fail: RETIRED_MIGRATIONS undefined, legacy stamp read, legacy key dropped by writeStamp, 0012 moved a legacy root, 0012/0013 in the registry) | FAIL (correct) |
| Task 1 GREEN (cb3e6582) | Task 1 verify set | 0 (300 pass) | PASS (correct) |
| Task 2 RED (3005f4ff) | `node --test hooks/upgrade-project.legacy.test.js` | 1 (3 of 5 fail: no global notice, legacyRootFor not exported) | FAIL (correct) |
| Task 2 GREEN (043ba685) | Task 2 verify set | 0 (74 pass) | PASS (correct) |
| Task 3 RED (05fadeea) | `node --test legacy-layout-guard.legacy.test.cjs planning-layout.legacy.test.cjs` | 1 (cases 5 and 8, the legacy variants of 3/4/6 fail; 6 and 7 already pass) | FAIL (correct) |
| Task 3 GREEN (265c4501) | Task 3 verify set | 0 (122 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | the three task verify sets above | 0 | PASS |
| test (full) | npm test globs minus `watcher-shell.test.cjs`: 393 files, 12538 tests, 12459 pass, 15 fail, 64 skipped | 1 | PASS (no new failures) |

The full run excluded `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`, because its W-3 fish-shell test hangs to timeout on this machine. The first full run found 42 failures. 28 of them were this TRD's, fixed in 70a293a1: 5 in statusline-estimate and 23 in the fleet harness. The other 14 were the known noise below (the watch daemon count varies by one with load timing). In the second run, 15 failures remain, all known noise:
- `bin/aoforge-watch.test.cjs` (7) and `bin/handoff-e2e.test.cjs` (6): node-pty is not installed in a worktree. Run alone, the pair gives the identical result at the wave base 5eb8c38e (checked in a scratch clone) and at this head: 46 tests, 8 fail.
- `requirements-agreement.repo.test.cjs` (1) and `validate-requirements.test.cjs` (1): the repository's W065 (objective 75 EST-11).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the full-suite follow-up 70a293a1)
- Must-haves verified: 6/6
  - 0012/0013 gone; the registry loads; a stamp listing 0012-0014 upgrades cleanly
  - `--only 0012|0013` (and 0014 once retired) exits 1 with the one retired line
  - readStamp/writeStamp use the aoforge key only
  - apply/check on a legacy-only root write nothing and report the layout
  - the CLI guard refuses with legacyLayoutMessage and creates no `.aoforge/`; doctor/validate report; global commands run
  - the hook queues one global `legacy-layout:<root>` notice, holding both before and after 78-11 (legacyRootFor)
- Gate failures: None introduced

## Discovered commands

None. The full suite ran through a scratchpad runner that applies `npm test`'s globs minus watcher-shell.test.cjs, as the dispatch instructed.

## Self-Check: PASSED

- FOUND: legacy-layout-guard.cjs, legacy-layout-guard.legacy.test.cjs, upgrade-retired.legacy.test.cjs, upgrade-project.legacy.test.js, upgrade.cjs, upgrade-project.js
- GONE (as intended): migrations/0012-planning-dir-move.cjs, migrations/0013-config-key-rename.cjs, __fixtures__/legacy-migration-fixtures.cjs (and both legacy tests)
- FOUND commits: b7a8dad1, cb3e6582, 7f245202, 3005f4ff, 043ba685, 05fadeea, 265c4501, 70a293a1
