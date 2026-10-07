---
objective: 60-edit-gate-enforces-the-action
trd: "06"
subsystem: telemetry
tags: [bash-write-gate, session-audit, false-positive-rate, gate-05, evidence]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "session-audit `bash_edit_gate` replay (60-05) and recommendDefault / FP_THRESHOLD / BASH_EDIT_GATE_DEFAULT (60-03)"
provides:
  - "references/bash-edit-gate-evidence.json: the real-corpus measurement (aggregates only) behind the shipped default"
  - "BASH_EDIT_GATE_DEFAULT = 'warn', backed by 633/17957 = 0.035251 against the 0.02 threshold"
  - "bash-write-gate.test.cjs describe 11: CI fails if the constant, the evidence default and recommendDefault(evidence rate) disagree, or the evidence stops being aggregates only"
affects: [60-07]

tech-stack:
  added: []
  patterns:
    - "The shipped default is a number with a source: evidence file, constant and the recommendation function are pinned together by one test"
    - "Evidence is committed as aggregates only; the raw audit output and every triage script stay in the scratchpad"

key-files:
  created:
    - plugins/devflow/devflow/references/bash-edit-gate-evidence.json
  modified:
    - plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
    - plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs

key-decisions:
  - "The Bash rule ships `warn`, not `strict`: the measured upper-bound false-positive rate is 3.5251% of ambient Bash calls, above the 2% threshold. No ambient definition, threshold or tracked-at-time rule was touched to move the number."
  - "No detector fix was made: triage of all 633 would-denies found zero misparses, so the 60-05 replay JSON is the evidence source unchanged."

requirements-completed: [GATE-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-06
tokens_input: 8636419
tokens_output: 51392
tokens_cache_read: 8478080
tokens_cache_write: 158211
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 60 TRD 06: Measure and set default Summary

**`session-audit --limit 0` over all 2,263 retained transcripts measured 633 would-denies in 17,957 ambient Bash calls (0.035251, an upper bound) against the 2% threshold, so the Bash edit gate ships default `warn`, and a test now pins the evidence, the constant and `recommendDefault` to agree.**

## Progress
- [x] Task 1: Replay over the real corpus, triage, detector fixes — (no commit: 633 would-denies triaged, 0 misparses)
- [x] Task 2: Evidence file, BASH_EDIT_GATE_DEFAULT and the agreement test — RED a844edb3, GREEN a8658b35

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-06T18:22Z
- **Completed:** 2026-10-06T18:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Measurement

Command: `df-tools session-audit --limit 0` (no file limit, no `--since`), run once for the evidence; a second pass with a scratchpad script that prints every would-deny reproduced the same counts (633 and 17,957).

| Quantity | Value |
|---|---|
| Transcript files scanned / sessions | 2,263 / 2,258 |
| Bash calls | 138,304 |
| Ambient Bash calls (the denominator) | 17,957 |
| Excluded: devflow_agent / devflow_skill / not_devflow_project | 81,522 / 29,162 / 9,663 |
| Excluded: history_unavailable / error | 0 / 0 |
| Would-deny | 633 |
| By form | python 489, cp 54, redirect 41, sed-i 32, perl-i 14, mv 3, tee 0, node 0 |
| false_positive_rate (upper bound) | 633 / 17,957 = **0.035251** |
| Threshold | 0.02 |
| recommended_default = shipped default | **warn** |

History reading was healthy: `history_unavailable` is 0, so the 20% guard in the TRD's error recovery never applied.

`by_period` note (not part of the evidence file): all 633 would-denies fall in 2026-09 (633 of 17,366 ambient calls, 3.65%). 2026-07 (127 ambient) and 2026-10 (464 ambient) have none. The hits come from 93 sessions in 6 DevFlow project roots (392, 112, 107, 19, 2, 1 hits), between 2026-09-06 and 2026-09-25, and the biggest single session has 31.

## Triage (Task 1)

All 633 would-denies were checked structurally by script; every second one (316) was also read by hand.

| Class | Count |
|---|---|
| write: a real write to a then-tracked file at a position the shell executes | 633 |
| misparse | 0 |

What the 633 are, by shape: agents editing tracked source in an ambient session through a `python3 -` heredoc that reads a file and writes it back with `open(p, 'w')` or `Path.write_text` (590 gated python write calls, 510 hits), `cat > file <<EOF` and `cat >> file` heredocs, `sed -i` and `perl -pi` edits, `printf ... >> file`, `git show REV:file > file`, and `cp backup file` restores in manual mutation testing. This is the behaviour the rule exists to stop, so each is the rule working, whether or not the edit was innocent.

Misparse shapes looked for, and what was found:

- A write call in a python comment or triple-quoted string: 0 of 590 located write calls.
- A bound python name rebound in a way the detector cannot see (tuple target, def or lambda parameter, `for a, p in`, `global`, walrus): 0. Five hits tripped a naive `p :=` search; each was Go source text inside a python string literal, and each script ends in a real `open(p, 'w')`.
- A `>` that is not a redirect: 0. All 47 hits with a gated redirect are `cat >`, `cat >>`, `printf >>`, `> file` after a command, or `git show X > X`.
- `cp` or `mv` into a directory deriving the target name: 0 of 161 gated cp/mv writes.
- A write inside a shell function that is defined and never called: 0. The `run`/`runacc` helpers in the hits only wrap test commands; the gated writes sit outside their bodies. (Other "functions" were Go or JS text inside python strings.)
- Four hits mention `python3 /tmp/<script>.py` but were gated by `cp /tmp/<backup> <tracked file>` restores, which are real writes.

Because no misparse was found, no detector, shell-words, fixture or test change was made, and Task 1 has no commit, as the TRD specifies. The first (and only) real-corpus run is the evidence source.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: replay and triage | `df-tools session-audit --limit 0` -> `ambient_bash_calls` 17,957 (>= 1000); `node --test bash-write-detect.test.cjs bash-write-gate.test.cjs shell-words.test.cjs` | 0 | PASS |
| 2: evidence, default, agreement test | `node --test bash-write-gate.test.cjs gate-bash-writes.test.js`; `node -e` agreement print: `0.035251 warn warn warn` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task gate) | `node --test bash-write-gate.test.cjs bash-write-detect.test.cjs gate-bash-writes.test.js shell-words.test.cjs` (284 tests) | 0 | PASS |

The full `npm test` is run by 60-07.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test bash-write-gate.test.cjs` (describe 11, evidence file absent) | 1 | FAIL on ENOENT (correct) |
| GREEN | `node --test bash-write-gate.test.cjs gate-bash-writes.test.js` | 0 | PASS (correct), 136 tests |

## Deviations from Plan

None. The TRD was executed as written. One process note: the first background audit was started with `--raw`, which prints the text summary and not the JSON; it was stopped and restarted without the flag before any number was used. The evidence derives only from the JSON run.

## Discovered commands

None. The stack profile (`general`) supplied the scoped test command.

## Flutter UI Evidence

Not applicable (TRD is not `type: ui`).

## Notes for 60-07

- Document where the default lives: `BASH_EDIT_GATE_DEFAULT` in `bash-write-gate.cjs`, used when `gates.bashEditGate` is unset or invalid; evidence beside it in `references/bash-edit-gate-evidence.json`; per project `gates.bashEditGate` overrides it, and `gates.editGate` `warn`/`off` always soften or disable it.
- The shipped default is `warn`. A project that wants enforcement sets `gates.bashEditGate: strict`.
- To revisit the decision, re-run `df-tools session-audit --limit 0`, regenerate the evidence, and change `BASH_EDIT_GATE_DEFAULT` together; the test fails until all three agree.
- The rate is an upper bound by design (every would-deny counts as a false positive), and about 77% of would-denies are python heredoc edits, so the number is mostly the volume of real bypass-style writes in ambient sessions, not detector noise.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (real-corpus run recorded as aggregates; default equals `recommendDefault(rate)`; agreement test in CI; no misparse found, so no detector change and the ambient definition, threshold and tracked rule are untouched)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/references/bash-edit-gate-evidence.json
- FOUND: plugins/devflow/devflow/bin/lib/bash-write-gate.cjs and bash-write-gate.test.cjs (modified)
- FOUND: a844edb3 (RED), a8658b35 (GREEN)
- Evidence file holds aggregates only: no `sample` key, no `/Users/` string, no newline in any string
