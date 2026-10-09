---
objective: 61-store-mode-rough-edges-and-observability
job: "04"
subsystem: observability
tags: [telemetry, session-audit, cli, strict-flags, backfill, validate-health]

requires:
  - objective: 39
    provides: "audit-cli.cjs (parseAuditArgs, resolveRoot, validateLimit, runSessionAudit) and the session-audit wiring"
  - objective: 38
    provides: "telemetry.cjs collect() with the sessionReport parameter"
provides:
  - "audit-cli.runTelemetry({argv, cwd, userHome}) -> {ok, result, text} | {ok:false, message}"
  - "df-tools telemetry --scan [--limit N] [--since D] [--root R]: a session audit folded into telemetry (blocks, scan)"
  - "strict flag handling for telemetry: every token is understood or exits 1"
  - "collect() fills blocks from a session report even outside a DevFlow project"
  - "backfilled 09-03 SUMMARY (I001 cleared)"
affects: [telemetry, docs-guides-telemetry, status-views]

tech-stack:
  added: []
  patterns:
    - "Pure run* function in audit-cli.cjs returning {ok, result, text}; the dispatcher case only maps it onto output()/error()"
    - "A backfilled SUMMARY carries backfilled/backfill_source and omits duration and token fields so calibrate gains no sample"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs
    - .planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/audit-cli.cjs
    - plugins/devflow/devflow/bin/lib/telemetry.cjs
    - plugins/devflow/devflow/bin/lib/telemetry.test.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - .planning/ROADMAP.md

key-decisions:
  - "Make `telemetry --scan` work rather than reject it: the docs already show it and collect() already takes the report"
  - "--limit, --since and --root without --scan are an error, not ignored; an unknown flag or stray argument exits 1"
  - "collect() with a null planningDir and a report fills blocks and keeps the not-a-DevFlow-project advisory; without a report the early return is byte-identical"
  - "The 09-03 backfill records no duration or tokens (none exist), so calibrate gains no sample"

requirements-completed: [OBS-02, OBS-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-06
tokens_input: 5837449
tokens_output: 39863
tokens_cache_read: 5718117
tokens_cache_write: 119228
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 61 TRD 04: telemetry --scan and the 09-03 SUMMARY backfill Summary

**`df-tools telemetry --scan` now runs a session audit through `audit-cli.runTelemetry` (every unknown flag exits 1, plain `telemetry` is unchanged), and the missing 09-03 SUMMARY is backfilled from git history, clearing I001.**

## Progress
- [x] Task 1 (RED): telemetry-cli tests — 9a147ebd
- [x] Task 1 (GREEN): runTelemetry in audit-cli.cjs, collect() blocks outside a project, dispatcher and help — 8aa6b176
- [x] Task 2: backfill the 09-03 SUMMARY and clear I001 — 8252dbd3

## Accomplishments

- `runTelemetry` parses `--scan` (boolean) plus `--limit`, `--root`, `--since` through the existing `parseAuditArgs`, `validateLimit`, `resolveRoot` and `DEFAULT_LIMIT`; none were re-implemented. `--limit`/`--since`/`--root` without `--scan` fail with `--limit, --since and --root need --scan`.
- With `--scan`, the result is `collect({planningDir, sessionReport, userHome})` plus `scan: {root, limit, since, files_scanned}`. The text leads with `scan: <files> transcripts, <total> blocks (<devflow_owned> DevFlow-owned)`.
- `telemetry.cjs` factored `summarizeBlocks` and `blockAdvisories` out of `collect()`. With a null `planningDir` and a report, `blocks` is filled and the advisories are the not-a-DevFlow-project line followed by the block advisory.
- The dispatcher `telemetry` case is now the `runTelemetry` dispatch (the same shape as `context`), and `help.cjs` names `--scan` and its flags.
- The 09-03 SUMMARY exists as a marked backfill (`backfilled: 2026-10-06`, `backfill_source`), citing commits `d1e70c74`, `d48d60e7`, `e4a112d4` and `09-VERIFICATION.md`, with no duration or token fields. ROADMAP.md line 27's parenthetical now reads `(3/3 delivered; 09-03 SUMMARY backfilled 2026-10-06, objective 61)`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs` | 1 (19 fail, 2 pass) | PASS (RED is the expected outcome) |
| 1 GREEN | `node --test telemetry-cli.test.cjs telemetry.test.cjs audit-cli.test.cjs dispatch-completeness.test.cjs` | 0 (91/91) | PASS |
| 1 | `df-tools telemetry --scan --limit 20` in this repo | 0, `blocks` object, `scan.files_scanned` 20 | PASS |
| 1 | `df-tools telemetry --scna` | 1, `Error: unknown flag: --scna` | PASS |
| 2 | `df-tools validate health` | 0, no I001 for 09-03 | PASS |
| 2 | `node --test roadmap-reconcile.test.cjs roadmap-reconcile-cli.test.cjs telemetry-cli.test.cjs telemetry.test.cjs` | 0 (127/127) | PASS |

Also run and green: `help-delegation.test.cjs`, `doc-surfaces.test.cjs`, `df-tools-deprecations.repo.test.cjs` (43/43).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test telemetry-cli.test.cjs` | 1 (19 fail: no `runTelemetry`, flags ignored by the CLI) | FAIL (correct) |
| GREEN | `node --test telemetry-cli.test.cjs telemetry.test.cjs audit-cli.test.cjs dispatch-completeness.test.cjs` | 0 (91 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test telemetry-cli.test.cjs telemetry.test.cjs roadmap-reconcile.test.cjs` | 0 (106/106) | PASS |

## Calibrate baseline (OBS-04, no fabricated sample)

`df-tools calibrate --dry-run`, before and after the backfill:

| Field | Before | After |
|---|---|---|
| samples.trds / tasks / with_tokens | 338 / 784 / 237 | 338 / 784 / 237 |
| per-class counts | unchanged | unchanged |
| source `with_minutes` / `with_tokens` / `no_outcome` | 275 / 237 / 86 | 275 / 237 / 86 |
| source `summaries` | 415 | 416 |
| `inputs_digest` | sha256:8ef2bf77... | sha256:b8ba0486... |

The sample counts are identical. Only the raw SUMMARY count and the input digest moved, because the new file is an input that carries no outcome.

## Decisions Made

- `--scan` is implemented, not rejected (the TRD's decision): the guide and reference docs already show `telemetry --scan --limit 150`.
- With `--scan` outside a project, the DevFlow-owned block advisory is also emitted after the not-a-project line, since a user running the scan there still wants that signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing `--help` test pinned the old usage string**
- **Found during:** Task 1 GREEN
- **Issue:** `telemetry.test.cjs` test 7 asserted `/df-tools telemetry \[--raw\]/`. The usage line the TRD mandates (`df-tools telemetry [--scan [--limit N] [--since YYYY-MM-DD] [--root <dir>]] [--raw]`) no longer matches it.
- **Fix:** the regex is now `/df-tools telemetry \[--scan .*\] \[--raw\]/`. Not in the TRD's `files_modified`, but required by the mandated help text.
- **Files modified:** `plugins/devflow/devflow/bin/lib/telemetry.test.cjs`
- **Commit:** 8aa6b176

**2. [Test list inexact] CLI test 10 pairs `--raw` with JSON**
- **Issue:** the TRD's test 10 expects JSON on stdout from `telemetry --scan --root <root> --raw`, but `--raw` selects the text form (the TRD 38-11 test 5 contract: raw lines equal the advisories).
- **Fix:** test 10 runs without `--raw` and asserts the JSON (`blocks`, `scan`); test 10b runs with `--raw` and asserts the `scan:` first line.
- **Files modified:** `plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs`
- **Commit:** 9a147ebd

### Other notes

- The checkpoint path for this TRD is `.planning/objectives/61-.../61-04-SUMMARY.md` (the verb's canonical name), not the long TRD-named path shown by `planning draft`.
- The 09-03 TRD's tasks and commit mapping come from the git history only; the backfilled SUMMARY says so, including that Tasks 2 and 3 share one commit.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (scan JSON with `blocks` and `scan`; strict flag errors; scan outside a project; plain `telemetry` unchanged; backfilled SUMMARY with citations and no duration/token fields; no 09-03 I001)
- Gate failures: None

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs`, `audit-cli.cjs`, `telemetry.cjs`, and the 09-03 SUMMARY
- FOUND commits: 9a147ebd, 8aa6b176, 8252dbd3
