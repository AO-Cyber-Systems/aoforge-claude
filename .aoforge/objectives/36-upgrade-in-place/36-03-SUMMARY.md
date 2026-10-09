---
objective: 36-upgrade-in-place
trd: "03"
subsystem: df-tools upgrade CLI / validate health / health workflow
tags: [upgrade, migrations, cli, health, W040]
requires: ["36-01 upgrade.cjs runner + fixtures", "36-04a/b/c migrations 0001-0006", "36-06 global-upgrade.cjs"]
provides: ["df-tools upgrade [--check|--apply] [--only] [--confirm] [--path] [--kind] [--default-work] [--global]", "validate health W040 (Check 13)", "/devflow:status check --migrate runs the upgrade"]
affects: ["36-05 (notices/route-results point users at these commands)", "36-08 dogfood runs `df-tools upgrade` against this repo"]
tech-stack:
  added: []
  patterns: ["spawned-CLI end-to-end tests with HOME=<fake>", "UsageError -> helpers.error; RegistryError -> JSON report exit 1"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/upgrade-cli.cjs
    - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/workflows/health.md
key-decisions:
  - "Project `--confirm` without `--apply` is a usage error; `--global --confirm` alone applies with adoption (per TRD gotchas); `--global --check --confirm` previews the adoption."
  - "`--global` rejects project-only flags (--only, --path, --kind, --default-work)."
  - "W040 also fires as `upgrade-check-not-available` when upgrade.check reports a detect failure, not only when it throws."
metrics:
  duration: "~7 min"
  completed: 2026-09-27
tokens_input: 6577358
tokens_output: 45603
tokens_cache_read: 6462613
tokens_cache_write: 114617
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 36 TRD 03: `df-tools upgrade`, health W040, and a `--migrate` that migrates Summary

**`df-tools upgrade` wires the migration runner (project) and global-upgrade (`--global`) onto the CLI. `validate health` now reports W040 when a project is behind or its upgrade check cannot run, and `/devflow:status check --migrate` runs check → apply → per-migration confirm (0006 asks for kind/work) → `df-tools commit --files`.**

## What was built

- `lib/upgrade-cli.cjs`: `parseUpgradeArgs(args)` and `cmdUpgrade(cwd, args, raw)`.
  - Flags: `--check` (default), `--apply`, `--only id[,id]` (repeatable, `=` form accepted), `--confirm`, `--path dir` (resolved against cwd), `--kind`, `--default-work` (passed through as `options.kind` / `options.defaultWork`), `--global`.
  - Uses `userHome = os.homedir()` and `pluginVersion = helpers.pluginVersion()`.
  - Output is the upgrade report plus `mode` and `project_root`. Exit code is 1 if `failed` is non-empty.
  - A `RegistryError` (for example an unknown `--only` id) prints a JSON `{error:'registry', problems}` and exits 1.
  - Usage errors (`--check` with `--apply`, unknown flag, missing value) exit 1 with a message on stderr. So does running outside a project: "not a DevFlow project".
  - `--raw` prints a one-line summary, e.g. `5 pending (0001,0002,0003,0004,0005); 1 needs confirmation (0006)` or `up to date (v2.10.1)`.
- `df-tools.cjs`: `    case 'upgrade':` next to `migrate`. `help.cjs`: HELP_TABLE `upgrade` entry (`mutates: true`).
- `validate.cjs` Check 13, placed after Check 12 and before repairs, calls `upgrade.check` with `options.upgradeRegistryDir` passed through:
  - A project that is behind gets `W040 project-behind: stamped v<from>|never, DevFlow v<to>; N pending, M need confirmation`.
  - A registry that throws, or a detect that fails, gets `W040 upgrade-check-not-available: …`.
  - W040 is not repairable, so `--repair` behaves exactly as before.
- `workflows/health.md` `--migrate` now:
  - runs a new `migrate` step: `upgrade --check` (falls back to the old behaviour if the command is unknown), shows the plan, asks, then `upgrade --apply`;
  - handles 0006 by asking for a kind and work, then `upgrade --apply --only 0006 --kind <k> --default-work <w>`; other confirm ids are asked about, then run with `--only <id>`;
  - commits `changed_files` via `df-tools commit --files`, stops if signing fails, then re-runs health;
  - keeps the stack-profile offer.
- Formatting and docs: W040 is shown in format_output, there is a W040 footer pointing to `--migrate`, and the error-code table has a W040 row.

## DoD test → bullet map

| DoD bullet | Test |
|---|---|
| `--check` on v1: pending 0001-0005 auto, pending_confirm [0006] | upgrade-cli 1 (and 6: default = check) |
| `--apply` changes exactly `changed_files`, stamps version, backup under fake HOME outside repo | upgrade-cli 2 |
| second `--apply` → `applied: []`, `changed_files: []`, `backup: null` | upgrade-cli 3 |
| `--apply --only 0006 --kind plugin` applies confirm; `--apply` alone never does | upgrade-cli 4, 2 (no `kind:` after plain apply), 5 (no `--kind` → exit 1) |
| `--global` plans without writing; `--global --confirm` adopts block | upgrade-cli 10 (snapshot of fake HOME unchanged; block marker + `## TDD & Quality` present) |
| error exits (`--check --apply`, unknown flag, non-project, RegistryError) | upgrade-cli 7, 7b, 8, 10b |
| `upgrade --help` + help.test | upgrade-cli 11, help.test.cjs, help-delegation.test.cjs |
| health W040 behind / cleared / stamped-older / not-available | validate 12, 13, 14, 15 |
| health.md `--migrate` runs upgrade | Task 3 rg (lines 137, 160, 174, 187) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: upgrade-cli + dispatcher + HELP_TABLE | `node --test .../upgrade-cli.test.cjs .../help.test.cjs .../help-delegation.test.cjs` | 0 (62/62) | PASS |
| 2: validate health W040 | `node --test .../validate.test.cjs` | 0 (47/47 = baseline 43 + 4) | PASS |
| 3: health.md --migrate | `rg -n "upgrade --check\|upgrade --apply\|--only 0006 --kind" .../health.md` | 0 (matches at 137, 160, 174; commit step at 187; stack init offer still at 212) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test .../upgrade-cli.test.cjs` | 1 (13/13 fail: unknown command) | FAIL (correct) |
| T1 GREEN | `node --test .../upgrade-cli.test.cjs .../help.test.cjs .../help-delegation.test.cjs` | 0 (62 pass) | PASS (correct) |
| T2 RED | `node --test .../validate.test.cjs` | 1 (3 fail: tests 12, 14, 15. Test 13 asserts that W040 is absent, so it passes before the check exists) | FAIL (correct) |
| T2 GREEN | `node --test .../validate.test.cjs` | 0 (47 pass) | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results (regression, baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (output in the session scratchpad).

Observed totals (information only): **3755 tests, 3722 pass, 1 fail, 32 skipped, 0 cancelled.**

| Failing test | File | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3 | **pre-existing** (baseline-failures.tsv line 16) |

No candidate regressions. Every test this TRD added passes: 13 CLI cases plus 4 W040 cases. `baseline-failures.tsv` was not edited.

## Deviations from Plan

None to the plan's scope. Three small additions, all inside the TRD's files:

1. **[Rule 2 - Critical] Two additional CLI cases beyond the 11 listed.**
   - 7b: an unknown `--only 9999` is a RegistryError and exits 1 with a report.
   - 10b: `--global` rejects project-only flags.
   - Both cover must-have truths ("a RegistryError … exits 1 with the report") that the list did not test directly. Commit 2cd5905.
2. **[Rule 2] W040 `upgrade-check-not-available` also covers a detect failure.** `upgrade.check` reports detect failures in `failed` rather than throwing. Without this they would have read as "project-behind" with misleading counts. Commit d0792fb.
3. **Project `--confirm` without `--apply` is a usage error.** The TRD did not define this case. Making it an error keeps "confirm migrations only run on an explicit apply" true. Commit 1f7f3d4.

No 36-04x migration needed fixing: the snapshot diff equalled `changed_files` on the first GREEN run.

## Open Issues / Carry-overs

- The `~/.claude/devflow` mirror does not have `upgrade` until release. Until then, health.md's `--migrate` hits `Unknown command` and falls back to the old behaviour.
- 36-08 owns the dogfood: `upgrade --apply` on this repo and `--global` on the real HOME. Neither was run here. Only fixture projects and a fake HOME were used.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9
- Gate failures: None (1 pre-existing baseline failure)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/upgrade-cli.cjs, upgrade-cli.test.cjs
- FOUND commits: 2cd5905, 1f7f3d4, 305ca3e, d0792fb, 637c979
