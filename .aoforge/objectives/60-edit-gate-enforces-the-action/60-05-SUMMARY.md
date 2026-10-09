---
objective: 60-edit-gate-enforces-the-action
trd: "05"
subsystem: telemetry
tags: [session-audit, bash-write-gate, replay, false-positive-rate, gate-05]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "lib/bash-write-gate.cjs evaluateBashWrites, recommendDefault, FP_THRESHOLD, BASH_GATE_CLASSIFIER, realpathDeep (60-03) and makeTrackedRepo with dated history"
provides:
  - "session-audit summary key `bash_edit_gate` (appended last): the Bash-gate replay and its false-positive upper bound"
  - "session-audit.cjs: newHistoryTracker({spawn}), trackBashGate, summarizeBashGate, findPlanningRoot; analyze() reads the sibling .meta.json agentType; RULES and DEVFLOW_OWNED gain devflow-bash-edit-gate"
  - "`session-audit --raw` last line: bash_edit_gate: ambient_bash_calls N, would_deny N, false_positive_rate R (upper bound), threshold 0.02, recommended_default M"
  - "lib/__fixtures__/bash-replay-fixtures.cjs: bashRow, skillToolRow, gateDenialRow, writeTranscriptTree (with subagent .meta.json), REPLAY_HISTORY"
affects: [60-06, 60-07]

tech-stack:
  added: []
  patterns:
    - "The replay calls the hook's own evaluateBashWrites with injected, history-accurate predicates"
    - "One read-only `git log` per project root, cached by realpath; unreadable git is an unavailable root, never an error"
    - "Counters change only after a whole row decision succeeds, so bash_calls = ambient + every exclusion"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/session-audit.cjs
    - plugins/devflow/devflow/bin/lib/session-audit.test.cjs
    - plugins/devflow/devflow/bin/lib/audit-cli.cjs
    - plugins/devflow/devflow/bin/lib/audit-cli.test.cjs

key-decisions:
  - "A would-deny is counted as a false positive in full (rate = would_deny / ambient_bash_calls, an upper bound), and recommended_default is computed from the reported, 6-decimal rate so a reader checking the report gets the same answer"
  - "attributionSkill excludes a row only when it starts with `devflow:`; a row attributed to another plugin's skill is still ambient, because only DevFlow skills set the skill-active marker the live hook honours"
  - "Errors are caught per Bash block inside trackBashGate (and again in accumulate as a net), so one failing call in a row of parallel Bash calls does not drop its siblings"

requirements-completed: [GATE-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-06
tokens_input: 9638258
tokens_output: 78879
tokens_cache_read: 9469789
tokens_cache_write: 168345
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 60 TRD 05: Replay false positives Summary

**`session-audit` now replays every Bash call in the transcripts through the hook's own `evaluateBashWrites` in dry-run, with git history at the row's timestamp deciding "tracked", and reports `bash_edit_gate` (ambient calls, would-denies by form, the false-positive upper bound, the 2% threshold and the strict-or-warn recommendation) in JSON and as the last `--raw` line.**

## Progress
- [x] Task 1: Hand-built replay fixtures: Bash rows, skill rows, a transcript tree with subagent meta — 05d19a7d
- [x] Task 2: The replay in session-audit: ambient detection, history-accurate tracking, rate, category — RED fac50f13, GREEN 000de86a
- [x] Task 3: session-audit --raw and JSON carry bash_edit_gate — RED 013512b3, GREEN c5b5f95e

## What was built

- **Replay (`session-audit.cjs`).** `trackBashGate` runs after `trackEditGate` in `accumulate` and touches only `acc.bashGate`. For each Bash `tool_use` it counts `bash_calls`, then excludes in the TRD's order: `skill-active --start|--end` rows (window open and close, both `devflow_skill`), a `devflow:*` agent transcript (`devflow_agent`), a `devflow:*` `attributionSkill` or an open window (`devflow_skill`), a cwd with no `.planning/` ancestor (`not_devflow_project`), and a project whose git history cannot be read (`history_unavailable`). Everything else is ambient and goes through `evaluateBashWrites`. A devflow `Skill` call opens the session's window until `--end`.
- **History-accurate tracking (`newHistoryTracker`).** One `git -C <root> log --no-renames --relative --diff-filter=AD --name-status --format=@%ct` per project root, cached by `realpathDeep(root)` and resolved once per root string. A path is tracked at time t iff its last add or delete at or before t is an add. A row with no usable timestamp sees the latest state. Git failure makes the root unavailable (`trackedAt` returns `null`).
- **Report (`summarizeBashGate`).** Keys in the documented order, appended last in `summarize()`. `false_positive_rate` is `null` with zero ambient calls (and the recommendation is then `warn`). `by_period` counts `{ ambient, would_deny }` per month; `sample` holds at most 10 `{ ts, command, gated }` with the command whitespace-collapsed to 200 characters and gated paths relative to the project root.
- **Category.** `devflow-bash-edit-gate` (from `BASH_GATE_CLASSIFIER`) sits before `devflow-edit-gate` in `RULES` and is in `DEVFLOW_OWNED`. A Bash-gate denial no longer opens an edit-gate denial, so `edit_gate_bypass.denials` is unaffected.
- **CLI.** `formatSessionAuditRaw` appends the `bash_edit_gate:` line after all others (4 lines with no denials, 6 in the bypass fixture).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: replay fixtures | `node -e "...writeTranscriptTree(...); console.log(fs.existsSync(.../agent-1.meta.json))"` | 0 (printed `true`) | PASS |
| 2: the replay | `node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs` | 0 (118 pass, 0 fail) | PASS |
| 3: raw line and JSON | `node --test .../audit-cli.test.cjs .../session-audit.test.cjs` | 0 | PASS |
| 3: raw line, real corpus | `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 5` | 0, last line starts `bash_edit_gate:` | PASS |
| 3: JSON, real corpus | `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --limit 20` | 0, `bash_edit_gate` is the last key | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test .../session-audit.test.cjs` | 1 (`bash_edit_gate` undefined, `newHistoryTracker` not exported) | FAIL (correct) |
| GREEN (Task 2) | `node --test .../session-audit.test.cjs` | 0 (118 pass) | PASS (correct) |
| RED (Task 3) | `node --test .../audit-cli.test.cjs` | 1 (test 10, C-3 and C-4 fail on the missing raw line) | FAIL (correct) |
| GREEN (Task 3) | `node --test .../audit-cli.test.cjs .../session-audit.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task gate, scoped) | `node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 0 | PASS |
| test (dependents) | `node --test` on shell-words, telemetry, transcript-export, dispatch-completeness and bash-write-gate tests | 0 | PASS |
| test (full `npm test`) | not run: 60-07 owns the full suite | n/a | not_available |

## Deviations from Plan

None - TRD executed as written. Items worth knowing, none of which changed the contract:

- **Pre-existing test edited (permitted by the TRD).** `session-audit.test.cjs` S-5 pinned "edit_gate_bypass is the last key". It now pins `edit_gate_bypass` second to last and `bash_edit_gate` last (`slice(0, -2)` and one more assertion). Every other pre-existing test is unedited.
- **60-04 dependency.** The TRD builds on the lib-level decision (`evaluateBashWrites` plus the ambient signals it specifies), not on `hooks/gate-bash-writes.js`, so nothing here needed the sibling's hook. `hooks/gate-bash-writes.js`, `hooks.json` and `CLAUDE.md` are untouched.
- **C-5 (JSON key order) was never RED.** The JSON side landed with Task 2, so the Task 3 test for it passed at RED. The two tests that exercise the formatter (test 10, C-3) and the new end-to-end case C-4 were RED, for the missing line.
- **Extra tests beyond the TRD list.** C-4 replays a real hermetic git project through the CLI and checks the JSON and the `--raw` line agree (3 ambient, 1 would-deny, rate 0.333333). Also: a non-devflow `attributionSkill` and a non-devflow `Skill` call stay ambient, a subagent with no `.meta.json` is ambient, a window does not leak across sessions, a row without a timestamp sees the latest state, a throwing row is skipped (`bash_calls = ambient + exclusions`), malformed rows, and "the replay never writes" (file content and `git status --porcelain` unchanged).
- **Small interpretive choices.** `git log` gets `-c core.quotePath=false`, so non-ASCII paths are not quoted. `cp`/`mv` into a directory use the live `fs.statSync` for "is a directory", as the hook will. `newAccumulator(opts)` and `analyze(roots, { trackedAt })` accept an injected history reader (the test seam the TRD describes).

## For 60-06

- Run `df-tools session-audit --limit 0` over `~/.claude/projects`. A bounded probe of the first 20 real transcripts (`--limit 20`) found 507 Bash calls, all `not_devflow_project` (they are `~/deepdives/*` and `~/911videos` sessions), so a small `--limit` says nothing about the rate: it depends on directory order.
- `false_positive_rate` is an upper bound. The numerator is every would-deny; `false_positive_basis` says so in the report.
- Cost: one read-only `git log` per distinct DevFlow project root found in the corpus (60 s timeout, 256 MB buffer). A root git cannot read lands in `excluded.history_unavailable`, so the denominator's provenance stays visible.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (key order and position, same `evaluateBashWrites` in dry-run, the four ambient signals, history-at-timestamp tracking, rate/recommendation/null case, `devflow-bash-edit-gate` classification without an edit-gate denial, the `--raw` line)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/session-audit.cjs, session-audit.test.cjs, audit-cli.cjs, audit-cli.test.cjs
- FOUND commits: 05d19a7d, fac50f13, 000de86a, 013512b3, c5b5f95e
