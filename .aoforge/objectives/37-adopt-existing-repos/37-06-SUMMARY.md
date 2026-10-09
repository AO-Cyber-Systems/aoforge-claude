---
objective: 37-adopt-existing-repos
trd: "06"
subsystem: adopt
tags: [adopt, upgrade, backup-prune, session-start, tdd]

# Dependency graph
requires: ["37-03", "37-05"]
provides:
  - "upgrade-project.js: step 0 calls backup-prune.runThrottled({userHome, now}) as the first statement of main(), before DEVFLOW_SKIP_UPGRADE, project lookup and the stamp fast path — runs every SessionStart, DevFlow project or not"
  - "df-tools upgrade --prune [--dry-run]: runs runPrune unthrottled, prints the report"
  - "df-tools upgrade --register [--path dir]: calls register({userHome, projectRoot}), prints {key, path, created}"
  - "HELP_TABLE upgrade usage/details name --prune [--dry-run] and --register"
affects: ["37-09"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook-choice justification lives in the file header comment (upgrade-project.js), not just the SUMMARY: sync-runtime.js exits at its own version fast path in almost every session so its global-upgrade call rarely runs, whereas upgrade-project.js runs on every SessionStart with all its own early returns AFTER the new prune call."
    - "Prune call wrapped in its own try/catch, independent of the DEVFLOW_SKIP_UPGRADE early-return chain, so a broken backups dir or missing lib never blocks the upgrade path — matches the objective-36 hook contract (stdout empty, never throws, exit 0)."
    - "CLI dispatch order in cmdUpgrade: --prune, else --register, else --global, else project — mutually exclusive with --apply/--check/--global, checked in parseUpgradeArgs before any IO."

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/upgrade-project.js
    - plugins/devflow/hooks/upgrade-project.test.js
    - plugins/devflow/devflow/bin/lib/upgrade-cli.cjs
    - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "This TRD was executed and committed in a prior session (commits ce5efdb, f8f986f, 677bebd, efd17f5, already on feat/stack-profile-loader before this session started). This session's job was to verify both task verify commands, run the wave regression gate once, and produce this SUMMARY — no code was changed."
  - "TDD RED/GREEN evidence below is read from `git show --stat` on the four existing commits (test-only commit immediately followed by a feat commit, per the TRD's task <action> blocks), not from a fresh replay of history — consistent with the dispatch instruction to report TDD evidence 'as far as git show --stat shows it.'"

patterns-established: []

requirements-completed: ["ADP-05"]

# Verification evidence
verification:
  tasks_passed: 2
  tasks_total: 2
  deviations: 0
  auth_gates: 0

metrics:
  duration: "~1 session (verification-only continuation)"
  completed: 2026-09-28
tokens_input: 11863707
tokens_output: 68828
tokens_cache_read: 11591174
tokens_cache_write: 272295
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 06: Backup-Prune Wiring (SessionStart + CLI) Summary

Verified the already-implemented wiring of `backup-prune.runThrottled` into `upgrade-project.js`'s
SessionStart hook (step 0, ahead of every early return) and the `df-tools upgrade --prune
[--dry-run]` / `--register [--path dir]` CLI surface, per ADP-05. Both task verify commands pass
(51/51 and 31/31), the full wave regression gate shows one failure and it is the same
file:line:name already present in `baseline-failures.tsv`, and no code changes were required.

## What Changed

- **`upgrade-project.js`**: header comment gained a "0. Prune" step documenting the throttled
  `backup-prune.runThrottled({userHome: os.homedir(), now: new Date()})` call and, explicitly, why
  this hook rather than `sync-runtime.js` (sync-runtime exits at its own version fast path in
  almost every session; upgrade-project.js runs every SessionStart with its own early returns all
  coming after the new call). `main()` now calls the prune first, gated only by
  `DEVFLOW_SKIP_PRUNE=1`, wrapped in try/catch (`[devflow] backup prune skipped: <msg>` to stderr
  on error, stdout untouched, exit 0 preserved). `DEVFLOW_SKIP_UPGRADE=1` still skips steps 1-4 but
  no longer skips the prune.
- **`upgrade-project.test.js`**: new `objective 37 — backup prune` describe block, 7 cases (DoD
  prune-and-idempotent-rerun, `DEVFLOW_SKIP_PRUNE`, `DEVFLOW_SKIP_UPGRADE` does not skip prune,
  backups-path-is-a-file, fast-path project still prunes, no backups dir).
- **`upgrade-cli.cjs`**: `--prune`, `--dry-run`, `--register` added to `BOOL_FLAGS`; `parseUpgradeArgs`
  rejects `--prune` combined with `--apply`/`--check`/`--global`, and rejects bare `--dry-run`
  without `--prune`. `runPruneCmd` calls `backup-prune.runPrune({userHome, dryRun})` and prints via
  `helpers.output` with a `pruned N backup(s)` / `would prune N` / `no backups` raw summary.
  `runRegister` resolves `--path` (default cwd) and calls `backup-prune.register({userHome,
  projectRoot})`, printing `{key, path, created}`. `cmdUpgrade` dispatch order: prune, else
  register, else global, else project.
- **`upgrade-cli.test.cjs`**: 6 new cases (`--prune --dry-run`, `--prune` real run + idempotent
  rerun, no-backups-dir, mutual-exclusion errors, `--register` + re-register + `--path`, `--help`
  usage names both flags).
- **`help.cjs`**: `upgrade` entry's `usage` gained `[--prune [--dry-run]] [--register]`; `details`
  gained a sentence naming what `--prune`/`--dry-run`/`--register` do and where the retention
  config lives (`backups.retain_days` / `backups.keep_min` in global-config.json).

## Deviations from Plan

None — the TRD's two tasks were already implemented exactly as specified; this session verified
them without touching code.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: SessionStart prune in upgrade-project.js (tests 1-8) | `node --test plugins/devflow/hooks/upgrade-project.test.js plugins/devflow/hooks/classify-session.test.js` | 0 | PASS (51/51) |
| 2: `upgrade --prune [--dry-run]` and `--register` (tests 9-14) | `node --test plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` | 0 | PASS (31/31) |

## TDD Evidence

Read from `git show --stat` on the existing commits (not re-replayed this session):

| Phase | Commit | Stat | Expected |
|---|---|---|---|
| Task 1 RED | ce5efdb `test(37-06): SessionStart backup prune cases` | `upgrade-project.test.js` +117, test-only | FAIL (per TRD action: new cases fail before the prune block exists) |
| Task 1 GREEN | f8f986f `feat(37-06): prune backups once per 24h...` | `upgrade-project.js` +23/-1, `upgrade-project.test.js` +16/-2 | PASS (51/51 observed this session) |
| Task 2 RED | 677bebd `test(37-06): upgrade --prune and --register cases` | `upgrade-cli.test.cjs` +116 (new), `help.cjs` +4/-2 (usage/details text only, no parser change) | FAIL (per TRD action: non-zero before the parser/dispatch exists) |
| Task 2 GREEN | efd17f5 `feat(37-06): df-tools upgrade --prune...` | `upgrade-cli.cjs` +36/-2 | PASS (31/31 observed this session) |

## Post-TRD Verification

- Auto-fix cycles used: 0 (no code changes made this session)
- Must-haves verified:
  - Prune call is the first statement of `main()`, before `DEVFLOW_SKIP_UPGRADE`, project lookup and
    the stamp fast path — confirmed by reading `upgrade-project.js` (the call at the top of `main()`
    precedes `if (process.env.DEVFLOW_SKIP_UPGRADE === '1') return;`).
  - Hook-choice justification recorded in the file header comment (quoted verbatim in "What
    Changed" above) — PASS.
  - try/catch around the prune call; stderr-only on error, stdout empty, exit 0 — PASS (test 5:
    "backups path is a FILE -> prune skipped via stderr; the upgrade still applies").
  - DoD fake-HOME cases (oldest-2-pruned; immediate rerun removes nothing, stamp byte-identical) —
    PASS (tests 1, 2).
  - `--prune` unthrottled + report; `--prune --dry-run` removes nothing, no stamp; `--prune` with
    `--check`/`--apply`/`--global` -> exit 1; bare `--dry-run` -> exit 1 — PASS (tests 9, 10, 12).
  - `--register [--path dir]` calls `register({userHome, projectRoot})`, prints `{key, path,
    created}`, allowed outside a DevFlow project — PASS (test 13).
  - HELP_TABLE `upgrade` usage names `--prune [--dry-run]` and `--register`; `help.test.cjs`
    passes — PASS (test 14, and full `help.test.cjs` run this session).
  - All pre-existing `upgrade-cli.test.cjs` and `upgrade-project.test.js` cases pass unchanged —
    PASS (both verify commands ran old + new cases together, 0 failures).
  - `rg -n "service-installer|launchctl|crontab"` across the three named files: nothing — PASS
    (re-checked this session, no matches).
- Gate failures: none outside baseline (see Regression Gate below).

## Regression Gate

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs'
'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (run from repo root, output written to
session scratchpad, never the repo).

- **Observed totals:** 3919 tests, 3886 pass, 1 fail, 32 skipped, 0 cancelled.
- **Failures classified:**

| Test | File:Line | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Baseline** — present verbatim in `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`. Pre-existing, unrelated to this TRD's five files. No re-run needed per the gate rule (TSV match short-circuits classification). |

- **New/undeclared regressions: 0.** The single observed failure is a name-for-name match against
  the baseline TSV; none of this TRD's task verify runs (82 tests across the two task-scoped
  commands) showed any failure.
- `baseline-failures.tsv` was not edited.

## Commits

| Hash | Message |
|---|---|
| ce5efdb | test(37-06): SessionStart backup prune cases |
| f8f986f | feat(37-06): prune backups once per 24h from the SessionStart upgrade hook |
| 677bebd | test(37-06): upgrade --prune and --register cases |
| efd17f5 | feat(37-06): df-tools upgrade --prune [--dry-run] and --register |

## Self-Check: PASSED

- `plugins/devflow/hooks/upgrade-project.js` — FOUND (modified, prune step 0 present)
- `plugins/devflow/hooks/upgrade-project.test.js` — FOUND (modified, backup-prune describe block present)
- `plugins/devflow/devflow/bin/lib/upgrade-cli.cjs` — FOUND (modified, --prune/--register present)
- `plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs` — FOUND (modified, new cases present)
- `plugins/devflow/devflow/bin/lib/help.cjs` — FOUND (modified, usage/details updated)
- Commit ce5efdb — FOUND in `git log`
- Commit f8f986f — FOUND in `git log`
- Commit 677bebd — FOUND in `git log`
- Commit efd17f5 — FOUND in `git log`
