---
objective: 36-upgrade-in-place
trd: "04b"
subsystem: upgrade
tags: [upgrade, migrations, objective-backfill, kind-work, intent-model]

# Dependency graph
requires: ["36-01"]
provides:
  - "lib/migrations/0004-objective-md-backfill.cjs — migration 0004 (auto): OBJECTIVE.md for NN-named objective dirs that lack one"
  - "lib/migrations/0006-kind-work.cjs — migration 0006 (confirm): PROJECT.md kind (+ default_work) via migrate.cjs, kind from ctx.options.kind"
  - "project-bootstrap.backfillAllObjectives(cwd, {match, dryRun}) -> {scanned, applied, skipped, errors, paths}"
  - "migrate.apply({..., backup}) — backup:false skips the in-repo .migrate-backup-* dir"
affects: [36-03, 36-04c, 36-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry migrations wrap existing code rather than re-implementing it (0004 -> backfillAllObjectives, 0006 -> migrate.plan/apply)"
    - "detect = the same walk as apply in dryRun (0004), so detect and apply can never disagree about what is missing"
    - "Opt-in options keep old defaults byte-for-byte: match=null, dryRun=false, backup=true"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0004-objective-md-backfill.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0004-objective-md-backfill.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0006-kind-work.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0006-kind-work.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
    - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
    - plugins/devflow/devflow/bin/lib/migrate.cjs
    - plugins/devflow/devflow/bin/lib/migrate.test.cjs

key-decisions:
  - "0004 walks only dirs matching /^\\d+(?:\\.\\d+)?-/; non-matching dirs are not scanned or counted, so scratch dirs (UI-VISUAL-EVAL-CALLOUT) never get a stub."
  - "0006 apply is defensively a no-op when PROJECT.md already has a kind, even if called directly: objectives missing `work` on a kinded project are not 0006's business."
  - "0006's missing-kind error names the kinds from intent.cjs VALID_KINDS (imported, not copied)."

# Metrics
duration: 8min
completed: 2026-09-27
---

# Objective 36 TRD 04b: Migrations 0004 (objective backfill) and 0006 (kind/work, confirm) Summary

**Migration 0004 revives the dead `backfillAllObjectives` to stub OBJECTIVE.md for NN-named objective dirs only. Migration 0006 is a `confirm` wrapper over `migrate.cjs` that sets PROJECT.md `kind` from a human-chosen `--kind`, with no in-repo backup because the runner has already backed up outside the repo.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-09-27T22:57:37Z
- **Completed:** 2026-09-27T23:05Z
- **Tasks:** 2 (4 commits, TDD RED then GREEN each)
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `backfillAllObjectives(cwd, { match = null, dryRun = false } = {})`: this adds a `match` filter, where non-matching entries are neither scanned nor touched, and a `dryRun` that reports the would-be paths. The result always carries `paths` (project-relative posix paths). Called with no options, the old keys and behaviour are unchanged, and the pre-existing O8/O9 tests pass untouched.
- Migration 0004 (auto): `detect` is a dryRun backfill with the NN match. Its reason names the objective ids, e.g. `OBJECTIVE.md missing in: 02-beta`. `apply` runs the real backfill and sets `changed = paths`. It throws if the backfill reports errors, so the runner halts.
- `migrate.apply` gains `backup: doBackup = true`. With `backup: false` it writes no `.planning/.migrate-backup-*` and returns `backupDir: null`. The `df-tools migrate apply` CLI passes nothing and keeps today's in-repo backup.
- Migration 0006 (confirm): `detect` applies only when PROJECT.md exists and has no `kind`. `apply` throws `0006 needs --kind <kind> (one of: api, app, library, ui-lib, cli, plugin)` when `ctx.options.kind` is absent. Otherwise it calls `migrate.apply({projectRoot, kind, defaultWork, dryRun, backup:false})` and maps `changes` to relative paths, including on dryRun.
- Registry: `0001:auto 0002:auto 0003:auto 0004:auto 0006:confirm`.

## Task Commits

1. **Task 1 RED:** `b543598` test(36-04b): backfill opts and migration 0004 cases
2. **Task 1 GREEN:** `3ad2ddf` feat(36-04b): migration 0004 revives backfillAllObjectives for NN objective dirs
3. **Task 2 RED:** `6b21f92` test(36-04b): migrate backup option and migration 0006 cases
4. **Task 2 GREEN:** `7f36d03` feat(36-04b): migration 0006 kind-work (confirm) wraps migrate.cjs

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: backfill opts + 0004 | `node --test plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs plugins/devflow/devflow/bin/lib/migrations/0004-objective-md-backfill.test.cjs` | 0 (27/27) | PASS |
| 2: migrate backup + 0006 | `node --test plugins/devflow/devflow/bin/lib/migrate.test.cjs plugins/devflow/devflow/bin/lib/migrations/0006-kind-work.test.cjs` | 0 (26/26) | PASS |
| Registry | `node -e "...loadRegistry().map(m=>m.id+':'+m.safety)..."` | 0 | PASS: `0004:auto`, `0006:confirm` present |
| Adjacent | `node --test upgrade.test.cjs validate.test.cjs notices.test.cjs migrations/0001..0003.test.cjs` (after 0004 added) | 0 (114/114) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test project-bootstrap.test.cjs migrations/0004-objective-md-backfill.test.cjs` | 1 (8 fail: tests 4-8 MODULE_NOT_FOUND, O11-O13 `paths` undefined; 19 pre-existing pass) | FAIL (correct) |
| GREEN (T1) | same | 0 (27 pass) | PASS (correct) |
| RED (T2) | `node --test migrate.test.cjs migrations/0006-kind-work.test.cjs` | 1 (9 fail: test 9 backupDir non-null, tests 11-18; test 10 passes by design because it pins the unchanged default) | FAIL (correct) |
| GREEN (T2) | same | 0 (26 pass) | PASS (correct) |
| REFACTOR | n/a (no refactor needed) | — | — |

Test-list mapping: items 1-3 are O11/O12/O13 in `project-bootstrap.test.cjs` (Group O). Items 4-8 are in `0004-objective-md-backfill.test.cjs`, items 9-10 are in `migrate.test.cjs` under `migrate.apply backup option (36-04b)`, and items 11-18 are in `0006-kind-work.test.cjs`.

## Validation Gate Results (regression gate, baseline-relative)

Command (repo root, `bash -O extglob`): `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`. Output was written to the session scratchpad, and `micro.test.cjs` was confirmed absent from it.

Observed totals (information only): **tests 3705, pass 3672, fail 1, cancelled 0, skipped 32, todo 0**.

| Failing test | File | In baseline TSV? | Classification |
|---|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3 | yes (exact name match) | **pre-existing** |

There are no candidate regressions. Every test added by this TRD passes. The gate holds.

## Decisions Made

- Beyond the TRD sketch, `0006.apply` re-runs `migrate.plan` and returns `{changed: []}` when the project already has a kind. The runner always detects first, so this only guards direct callers. It enforces the key link that a kinded project's objectives are not 0006's business.
- 0004's `detect` reason lists the affected objective ids rather than a count. Test 5 requires `02-beta` to appear in it.

## Deviations from Plan

None. The TRD executed as written. The defensive no-op in 0006.apply is additive and is covered by the key_links constraint, not a behaviour change.

## Issues Encountered

None. The edit gate did not deny any edits, and every commit was signed on the first attempt.

## Next Objective Readiness

- 36-03 (`health --migrate`) can now ask for a kind and run `df-tools upgrade --apply --only 0006 --kind <k>`. This needs the CLI to pass `--kind` through as `options.kind`; that plumbing belongs to 36-03 and is not part of this TRD.
- 36-04c can add the remaining registry ids (0005, 0007+) alongside 0004/0006 with no changes to the runner.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (0004 NN-only detect/apply with `changed`; backfill old keys + `paths`; 0006 confirm + `needs --kind` + `backup:false`; migrate default backup unchanged; both honour dryRun, second apply no-op, both in `loadRegistry()`)
- Gate failures: None (1 pre-existing baseline failure)

## Self-Check: PASSED

- FOUND: all 4 created files (0004 / 0006 migration + test)
- FOUND: commits b543598, 3ad2ddf, 6b21f92, 7f36d03 (`git log --oneline -5`)
