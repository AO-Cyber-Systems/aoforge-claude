---
objective: 36-upgrade-in-place
trd: "04a"
subsystem: upgrade
tags: [upgrade, migrations, config, job-to-trd, state-json, validate-health]

# Dependency graph
requires: ["36-01"]
provides:
  - "lib/migrations/0001-config-stamp.cjs — migration 0001 (auto) + buildConfig(existing|null), FLAT_TO_NESTED"
  - "lib/migrations/0002-job-to-trd.cjs — migration 0002 (auto) + findLegacyJobFiles(projectRoot) -> [{from, to, conflict}]"
  - "lib/migrations/0003-state-json-seed.cjs — migration 0003 (auto) + seedFromStateMd(stateContent)"
  - "validate health --repair W003/E005, W008, W009 now delegate to 0001/0002/0003"
affects: [36-04b, 36-04c, 36-05, 38]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadConfig is the semantic oracle: 0001 is tested by loadConfig(before) deep-equal loadConfig(after) over six hand-built configs"
    - "Fill-under merge: the template fills only keys the config lacks; never overwrites, never adds keys loadConfig derives from `mode`"
    - "Conflict-aware rename: a JOB whose TRD exists is reported, never renamed or deleted, and invisible to detect (idempotent)"
    - "One copy of each repair: validate.cjs calls the migration's exported helper / apply(ctx)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0002-job-to-trd.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0002-job-to-trd.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0003-state-json-seed.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0003-state-json-seed.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs

key-decisions:
  - "0002 no longer forces STATE.md `Status: Resumed` (the old migrateJobFiles repair did). A session-start auto-migration must not rewrite the user's status; it only appends one Session Log line. The line text is now the migration's: `Migrated N JOB.md file(s) to TRD.md (DevFlow upgrade, migration 0002)`, also when reached through health --repair."
  - "0001 is not applicable when the project has no .planning/ directory, so the upgrade never turns an arbitrary directory into a DevFlow project."
  - "0001 skips adding the template's top-level `mode` when the config carries `workflow.mode` (a top-level mode would shadow it in loadConfig). A flat key whose target section exists but is not an object stays where it is."
  - "buildConfig(null) returns the template exactly (verifier_checkpoints/decision_queue included); for an existing config those two are never filled from the template."
  - "Health W008 now counts only renamable JOB files (conflicts excluded), so the warning always clears after --repair. The message text is byte-identical."
  - "0001 orders output keys: template sections first in template order, then any other keys in their original order."

requirements-completed: ["UPG-04 (part a)"]

# Metrics
duration: ~9min
completed: 2026-09-27
---

# Objective 36 TRD 04a: Migrations 0001-0003, moved out of validate.cjs Summary

Three auto, idempotent, dryRun-safe registry migrations now exist: 0001 config-stamp, 0002 job-to-trd and 0003 state-json-seed. 0001 nests a flat v1 config.json without changing any setting that `loadConfig` returns. 0002 renames JOB.md to TRD.md without touching conflicts. 0003 seeds state.json from STATE.md. `validate health --repair` now calls these migrations for its config, JOB and state.json repairs, and validate.cjs no longer contains its own copies of that logic.

## What was built

| Id | Safety | Detects | Does |
|---|---|---|---|
| 0001 config-stamp | auto | no config.json (with .planning/ present), movable flat v1 keys, a boolean `parallelization`, or a missing template section | Moves flat keys to their nested place (the flat value wins), expands `parallelization`, and fills in missing template keys. Unknown keys, `github` and `devflow` are kept. Unparseable JSON or a non-object config: not applicable, and the file is never rewritten |
| 0002 job-to-trd | auto | `objectives/*/*-JOB.md` or `JOB.md` without a TRD counterpart | Renames each file (and re-checks just before each rename), then inserts one dated line after the `## Session Log` heading. If STATE.md has no Session Log it is not written and not listed |
| 0003 state-json-seed | auto | STATE.md present and state.json absent | `writeStateJson(seedFromStateMd(STATE.md))` and returns `notes.seeded_fields` |

`upgrade.loadRegistry()` returns `0001:auto 0002:auto 0003:auto`.

How validate.cjs is wired now:
- Check 9 (W008) calls `m0002.findLegacyJobFiles(cwd)` and drops conflicts. The addIssue message and fix text are unchanged.
- `createConfig`/`resetConfig` write `JSON.stringify(m0001.buildConfig(null), null, 2) + '\n'`.
- `createStateJson` calls `m0003.apply(ctx)` and pushes `{action, success, path:'state.json', seeded_fields}`.
- `migrateJobFiles` calls `m0002.apply(ctx)` and pushes `{action, success, migrated}`.
- The ctx is `{ projectRoot: cwd, userHome: homeDir, pluginVersion: pluginVersion(), dryRun: false, options: {} }`.
- The state.cjs import line was removed; all five names on it are now unused. `rg -n "renameSync|STATE_JSON_DEFAULTS|job_checker: true" validate.cjs` finds nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The W009 blockers extraction captured the wrong section**
- **Found during:** Task 2 (test 18 GREEN)
- **Issue:** The old repair used the regex `##\s*Blockers[^#]*\n(...)`. Its `[^#]*` is greedy, so when a blank line came before the next heading it ran past the Blockers list and captured the *next* section's bullets. For the v1 fixture that seeded `blockers: ['2026-01-15: fixture session']` (a Session Log entry) instead of `['one']`. No existing test covered this.
- **Fix:** 0003 now uses `##\s*Blockers[^\n]*\n(...)`, so the body starts on the line after the heading. Everything else is copied verbatim from the old repair.
- **Files modified:** plugins/devflow/devflow/bin/lib/migrations/0003-state-json-seed.cjs
- **Commit:** eb6ac6a

**2. [Rule 1 - Bug] The old JOB rename could overwrite an existing TRD**
- **Found during:** Task 2
- **Issue:** The old `migrateJobFiles` called `fs.renameSync(JOB, TRD)` without checking whether the TRD existed, and on POSIX that silently replaces the TRD. The TRD's conflict rule covers this. Health W008 now also excludes conflicts, so its warning always clears after `--repair`.
- **Commit:** eb6ac6a, 6518b73

**3. [Rule 1 - Bug] A Session Log heading on the last line would have inserted the note at the start of the file**
- **Issue:** In the old logic, `indexOf('\n') + 1` returns 0 when the heading is the last line with no newline after it, so the note went to byte 0 of STATE.md.
- **Fix:** 0002 appends after the heading in that case. The heading match is now anchored (`^##\s+Session Log`), so it no longer matches inside `### Session Log`.
- **Commit:** eb6ac6a

### Deliberate behaviour changes (from the TRD)
- **The Status rewrite was dropped:** the JOB migration no longer sets STATE.md `Status: Resumed`, whether it runs from upgrade or from health --repair. Test 23 locks this in: after `--repair`, state.json `status` is still `In progress`.
- The Session Log line reached through health --repair now carries the migration's text in place of the old `format via /df:health --repair` wording.

### Minor notes
- The TRD's verify command `node --test .../migrations/` fails on Node v24.13.1, because it treats a directory argument as a module path. Every verification below lists the test files explicitly instead.
- Test 5 (unknown keys survive) uses a complete custom `github` object. A *partial* user section would gain the template keys it lacks (fill-under); its existing values are never changed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: 0001 config-stamp | `node --test plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs` | 0 (15/15, incl. 6 equivalence fixtures) | PASS |
| 2: 0002 + 0003 | `node --test .../0002-job-to-trd.test.cjs .../0003-state-json-seed.test.cjs` | 0 (11/11) | PASS |
| 2: registry | `node -e "...loadRegistry().map(m=>m.id+':'+m.safety)..."` | 0, prints `0001:auto 0002:auto 0003:auto` | PASS |
| 3: validate rewiring | `node --test .../validate.test.cjs` + 3 migration test files + `upgrade.test.cjs` | 0 | PASS |
| 3: logic moved | `rg -n "renameSync\|STATE_JSON_DEFAULTS\|job_checker: true" validate.cjs` | 1 (no matches) | PASS |

validate.test.cjs: 40 tests passed before the change and 43 after (+3), with 0 failures.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test .../0001-config-stamp.test.cjs` | 1 (15 fail: module missing) | FAIL (correct), commit 06420be |
| GREEN (T1) | same | 0 (15 pass) | PASS (correct), commit 9a2e859 |
| RED (T2) | `node --test .../0002-job-to-trd.test.cjs .../0003-state-json-seed.test.cjs` | 1 (11 fail: modules missing) | FAIL (correct), commit e6af5fb |
| GREEN (T2) | same | 1 on the first run (test 18: blockers bug, see Deviation 1), then 0 (11 pass) | PASS (correct), commit eb6ac6a |
| RED (T3) | `node --test --test-name-pattern="delegate to migrations" .../validate.test.cjs` | 1 (22 fails: flat literal; 23 fails: `Status: Resumed`; 24 passes) | FAIL (correct), commit 23d8c4a |
| GREEN/REFACTOR (T3) | `node --test .../validate.test.cjs` + migrations + upgrade | 0 (validate 43/43) | PASS (correct), commit 6518b73 |

## Validation Gate Results (baseline-relative regression gate)

Command (from the repo root, output kept in the session scratchpad):
`node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`

Observed totals (for information only): **tests 3687, suites 519, pass 3654, fail 1, cancelled 0, skipped 32, todo 0.**

| Failing test | File:line | In baseline-failures.tsv | Classification |
|---|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795 | yes (line 16) | **pre-existing** |

There were no candidate regressions and no environment flakes to record. The other 20 baseline entries passed in this run, which is expected: they depend on the environment. baseline-failures.tsv was not edited, and every test added by this TRD passes.

## Post-TRD Verification

- Auto-fix cycles used: 1 (test 18, blockers regex)
- Must-haves verified: 5/5 (0001 equivalence and unparseable handling; 0002 rename, log line and conflict handling; 0003 seed; dryRun, idempotence and registry load for all three; health repairs delegate and the old logic is gone)
- Gate failures: None (1 pre-existing)

## Commits

- 06420be test(36-04a): migration 0001 config-stamp cases
- 9a2e859 feat(36-04a): migration 0001 normalises config.json to the nested shape
- e6af5fb test(36-04a): migrations 0002 and 0003 cases
- eb6ac6a feat(36-04a): migrations 0002 job-to-trd and 0003 state-json-seed
- 23d8c4a test(36-04a): health repairs delegate to migrations
- 6518b73 refactor(36-04a): validate health repairs call migrations 0001-0003

## Self-Check: PASSED

- The 6 created and 2 modified files exist on disk.
- All 6 commits are present on feat/stack-profile-loader (checked with `git log --oneline`).
