---
objective: 57-estimation-data-foundation
trd: "06"
subsystem: estimation
tags: [cli, calibrate, tokens-backfill, df-tools, deterministic-output, node-test]

requires:
  - objective: 57-estimation-data-foundation
    provides: calibrator.cjs (buildCalibration, writeCalibration, defaultCalibrationPath) from 57-05, token-backfill.cjs (planBackfill, applyBackfill, formatBackfillReport) from 57-04, tokens-cli.cjs from 57-03
provides:
  - "df-tools calibrate [--paths] [--out] [--rates] [--dry-run]: writes calibration.json, byte-identical on unchanged inputs"
  - "df-tools tokens backfill [--write] [--force]: dry run by default, stamps recovered SUMMARYs through summary post"
affects: [57-07-backfill-dogfood-and-docs, 58-estimation-engine]

tech-stack:
  added: []
  patterns:
    - "Pure run* front end returning {ok, result, text, exit} (tokens-cli / audit-cli shape); the dispatcher case only maps it onto output()/error()"
    - "stdout is a summary, the file is the artifact: calibrate never prints the calibration object"
    - "Spawned tests set HOME to a fresh temp dir and strip DEVFLOW_CALIBRATION_PATH, so the real ~/.claude/devflow/calibration.json is unreachable"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
    - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "calibrate refuses (exit 1, nothing written) when no project is found under the paths, so an empty history can never overwrite a good calibration.json"
  - "Under --dry-run, `changed` reports whether a write WOULD change the file (read and compare); the text slot still says `dry run`"
  - "result.classes omits `all` (it is samples.tasks); the --raw line lists classes by samples descending, then name"
  - "backfill with no project and no --repo is a usage error; with --repo and cwd outside a project, the repository is also the checkout"

requirements-completed: [EST-07, EST-01]

duration: 7min
completed: 2026-10-05
tokens_input: 6302515
tokens_output: 52257
tokens_cache_read: 6156941
tokens_cache_write: 145478
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 57 TRD 06: tokens backfill and calibrate CLI Summary

**`df-tools calibrate` writes a deterministic calibration.json and `df-tools tokens backfill` recovers historical token usage as a dry run unless `--write`, both spawn-tested against a fake HOME.**

## Progress
- [x] Task 1: df-tools calibrate (calibrate-cli.cjs, dispatch, help) — df4cd866 (RED 42348c45)
- [x] Task 2: df-tools tokens backfill [--write] [--force] — 53503a46 (RED 7c717de7)

## Accomplishments

- `calibrate-cli.cjs` exports `runCalibrate({argv, cwd, env}) -> {ok, result, text, exit}`. `case 'calibrate'` and
  `COMMANDS.calibrate` are wired; the header doc has a new entry under "Estimation data:".
- `tokens-cli.cjs` gained the `backfill` subcommand (bool flags `--write` and `--force`, rejected for `trd` and `stamp`
  with "is only valid for tokens backfill"). It takes no TRD id. The `COMMANDS.tokens` usage and details name it.
- Test 2 (success criterion 4 at the command level): two runs over the same inputs give `Buffer.equals` files, the second
  reports `changed:false`, and the mtime is unchanged.
- Read-only smoke over this repo (nothing written): `tokens backfill` finds 396 SUMMARYs, 1 already stamped, 232
  recovered, 163 unrecovered (no_transcript 156, unkeyed 7), JSON stdout 23,414 bytes (under the 50,000 `@file:`
  threshold). `calibrate --dry-run`: 249 TRDs, 559 tasks, 1 with tokens, 12 classes. 57-07 runs the real `--write`.

## Usage and output formats

```
df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--dry-run] [--raw]
df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path> | backfill [--write] [--force]> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]
```

`calibrate --raw` prints one line, no trailing newline:
`calibration <out>: changed · 5 TRDs, 7 tasks, 1 with tokens · classes code_tdd 5, doc 1, prompt 1`
(second slot `changed`, `unchanged` or `dry run`; classes by samples descending, then name; `classes none` when empty).
calibrate JSON: `{out, dry_run, changed, samples, classes, sources, data_as_of, inputs_digest, unpriced_models}`.

`tokens backfill --raw` prints `formatBackfillReport`: two lines for a dry run, a third `written N · unchanged N · skipped N ·
failed N` with `--write`. backfill JSON: `{checkout, repo, transcripts_root, counts, index_counts, recovered: [ids],
unrecovered: [{id, objective_dir, reason}], applied?: {written, unchanged, skipped, write_failed}}`. Exit 0 for any
amount of unrecoverable history; exit 1 for usage errors and when `applied.write_failed` is non-empty.

Paths and output for calibrate: `--paths` (comma separated), else `DEVFLOW_CALIBRATE_PATHS` (`path.delimiter`), else the
checkout holding cwd; `--out` (relative to cwd) wins over `DEVFLOW_CALIBRATION_PATH`, which wins over
`~/.claude/devflow/calibration.json`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: calibrate | `node --test lib/calibrate-cli.test.cjs lib/help.test.cjs lib/dispatch-completeness.test.cjs lib/doc-surfaces.test.cjs` (36 tests) | 0 | PASS |
| 2: tokens backfill | `node --test lib/tokens-cli.test.cjs lib/help.test.cjs lib/dispatch-completeness.test.cjs lib/doc-surfaces.test.cjs` (45 tests, 0 skipped) | 0 | PASS |
| real-repo dry runs | `df-tools tokens backfill --raw`; `df-tools calibrate --dry-run --raw` | 0 | PASS (no file written; `~/.claude/devflow/calibration.json` still absent) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1, 42348c45) | `node --test lib/calibrate-cli.test.cjs` | 1 | FAIL (`Error: Unknown command: calibrate`, correct) |
| GREEN (task 1, df4cd866) | same plus help and dispatch tests | 0 | PASS (14 calibrate tests; 36 in the gate) |
| RED (task 2, 7c717de7) | `node --test lib/tokens-cli.test.cjs` | 1 | FAIL 7 of 23 (tests 10, 11, 11b, 12, 13, 14b, 15: no `backfill` subcommand) |
| GREEN (task 2, 53503a46) | same plus help, dispatch, doc-surfaces | 0 | PASS (23 tokens tests; 45 in the gate) |

Test 14 (`--write` and `--force` only for backfill, backfill takes no TRD id) passed at RED because an unknown
subcommand and an unknown flag are already usage errors. It stays as a guard against a too-permissive parser; the RED
set above is the seven that genuinely failed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | calibrate-cli, tokens-cli, help, dispatch-completeness (and doc-surfaces) | 0 | PASS |
| test | `npm test`: 9495 tests, 9460 pass, 3 fail, 32 skipped | 1 | only the known baseline failures |

The three failures: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration (real fleet), and
roadmap-reconcile E2E1, which clears once `roadmap update-job-progress 57` ticks this TRD. None is in a file this TRD
touches. No test wrote the real `~/.claude/devflow/calibration.json`: it does not exist after the full run.

## Discovered commands

None. `npm test` and the scoped `node --test` form came from the stack profile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] calibrate refuses an empty project set**
- **Found during:** Task 1 design
- **Issue:** the TRD only specified the no-`--paths`/no-project error. `--paths <typo>` would build an empty history and
  overwrite a good `~/.claude/devflow/calibration.json` with zeros.
- **Fix:** when `buildCalibration` returns no `sources`, `runCalibrate` returns `{ok:false}` (exit 1, "no DevFlow project
  ... nothing written"). A project with no samples still has a source and still writes.
- **Files modified:** calibrate-cli.cjs, calibrate-cli.test.cjs (test 6e)
- **Commit:** df4cd866

### Choices within the TRD's silence

- `--dry-run` reports `changed` as "a write would change the file" (reads and compares), not an absent key.
- `result.classes` omits `all`; `samples.tasks` carries that total.
- Test 13 needed no `_deps` injection: a read-only objective directory (chmod 555, non-root) makes the real
  `summary post` fail, so the test runs end to end and is skipped only for root or Windows.
- Extra tests beyond the TRD list: 5b (dry run beside an existing file), 6b (dispatcher-style no-arg call), 6c
  (`DEVFLOW_CALIBRATE_PATHS`), 6d (comma paths, relative `--paths`/`--out`), 6e (empty-history refusal), 11b (`--force`),
  14b (outside a project names `--repo`).

## Issues Encountered

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (dry run default; `--write` stamps and a second `--write` writes nothing; `--out` beats
  `DEVFLOW_CALIBRATION_PATH` beats the home default; byte-identical second run with `changed:false`; `--dry-run` writes
  nothing; no test reaches the real home; help and dispatch tests pass)
- Gate failures: none beyond the three known baseline failures

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
- FOUND: plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/tokens-cli.cjs (backfill subcommand), tokens-cli.test.cjs (57-06 tests)
- FOUND: 42348c45, df4cd866, 7c717de7, 53503a46 (all on feat/stack-profile-loader)
