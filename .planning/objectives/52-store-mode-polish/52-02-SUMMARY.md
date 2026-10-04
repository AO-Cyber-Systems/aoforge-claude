---
objective: 52-store-mode-polish
trd: "02"
subsystem: commit-gate
tags: [gh-gate, df-tools-commit, store-mode, agent-prompts, ci-guard]

requires:
  - objective: 50-github-enforcement
    provides: gh-gate.cjs evaluateGate and the store-mode commit gate in misc.cjs cmdCommit
provides:
  - Every gh-gate refusal (all five shapes) names `df-tools gh pr start <objective>` and the inline DEVFLOW_SKIP_GH_GATE=1 escape with its DEVFLOW_SKIP_GH_GATE_REASON variable
  - "`df-tools commit --raw` refusals keep the bare reason code on stdout and write the full message to stderr"
  - agents/debugger.md commits code fixes through `df-tools commit ... --files`
  - prompt-raw-commit.repo.test.cjs, a CI guard against raw `git commit` lines in agent and skill prompts
affects: [52-06-docs-and-full-suite, gate-commits, debugger agent]

tech-stack:
  added: []
  patterns:
    - "Raw-mode refusals put the human message on stderr before output() exits, so stdout stays machine-comparable"
    - "Repo guard over fenced code in prompts, using CommonMark fence rules (same char, closing length >= opener)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-gate.cjs
    - plugins/devflow/devflow/bin/lib/gh-gate.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs
    - plugins/devflow/agents/debugger.md

key-decisions:
  - "The escape is worded as an inline prefix on the commit (never `export`), naming DEVFLOW_SKIP_GH_GATE_REASON=<why>"
  - "The raw-commit guard covers agents/*.md and skills/*/SKILL.md only; workflows/ hold merge-completion commits that gate-commits allows"
  - "The guard honours ~~~ fences and nested longer fences, so an instruction cannot hide in a fence the scanner does not recognise"

patterns-established:
  - "Raw-mode stderr for refusals: write the message to stderr inside the refusal branch, immediately before output()"

requirements-completed: ["52-2", "52-4"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-04
---

# Objective 52 TRD 02: Gate remedies Summary

**Every store-mode commit refusal now names both remedies, `gh pr start <objective>` and the inline, logged `DEVFLOW_SKIP_GH_GATE=1` escape with its reason variable, in JSON and `--raw` mode (stderr). debugger.md commits through `df-tools commit --files`, and a new repo test fails CI if a raw `git commit` instruction returns to any agent or skill prompt.**

## Progress
- [x] Task 1: every refusal names both remedies, including under --raw — RED 07e735bb, GREEN 3e2bde6b
- [x] Task 2: debugger commits through df-tools; CI guard on raw commits in prompts — RED b6a0bba5, GREEN cd64df96

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-04T14:32:20Z
- **Completed:** 2026-10-04T14:41:56Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `START_HINT` (gh-gate.cjs) now reads: run `df-tools gh pr start <objective>` and commit on its branch, or prefix the commit with DEVFLOW_SKIP_GH_GATE=1 (logged as gate gh; DEVFLOW_SKIP_GH_GATE_REASON=<why> records why). All five refusal shapes use it, and a table-driven test pins all five.
- `df-tools commit --raw` refusals write `verdict.message` to stderr (misc.cjs:650, inside the store-mode gate block). Stdout is still exactly the reason code and the exit code is still 1. Before this, a raw caller saw only `default_branch`.
- The JSON refusal keys (`committed`, `hash`, `reason`, `branch`, `error`) and the gate's result keys (`allow`, `reason`, `message`) are pinned unchanged.
- agents/debugger.md replaces its `git add` + `git commit -m` block with a `df-tools commit "fix: ..." --files ...` block, plus prose on gate-commits and the store-mode branch gate. The planning-docs commit block is unchanged.
- prompt-raw-commit.repo.test.cjs scans fenced code in agents and skills and reports every hit as `file:line: text`. Before the debugger fix it failed on exactly `plugins/devflow/agents/debugger.md:404`; it now reports zero findings.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: every refusal names both remedies, including under --raw | `node --test lib/gh-gate.test.cjs lib/misc-commit-gate.test.cjs lib/misc-commit.test.cjs lib/override.test.cjs` | 0 | PASS (108/108) |
| 2: debugger commits through df-tools; CI guard | `node --test lib/prompt-raw-commit.repo.test.cjs lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs` | 0 | PASS (31/31) |
| 2: no raw lines left | `rg -n '^git (commit\|add)' plugins/devflow/agents/debugger.md` | 1 (no match) | PASS |
| TRD verification | `rg -n 'or set DEVFLOW_SKIP_GH_GATE=1 \(logged\)' lib/gh-gate.cjs` | 1 (no match) | PASS |
| TRD verification | `rg -n 'process.stderr.write' lib/misc.cjs` | 0 (line 650, in the gate block) | PASS |

(`lib/` = `plugins/devflow/devflow/bin/lib/`.)

## Task Commits

1. **Task 1 RED:** `07e735bb` test(52-02): every gate refusal must name both remedies, also under --raw
2. **Task 1 GREEN:** `3e2bde6b` fix(52-02): gate refusals name the inline escape and its reason variable; --raw writes the message to stderr
3. **Task 2 RED:** `b6a0bba5` test(52-02): CI guard against raw git commit instructions in agent and skill prompts
4. **Task 2 GREEN:** `cd64df96` fix(52-02): debugger commits code fixes through df-tools commit --files

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test lib/gh-gate.test.cjs lib/misc-commit-gate.test.cjs` | 1 (7 failures: the 5 shapes lack DEVFLOW_SKIP_GH_GATE_REASON; raw stderr empty in 1b and 2c) | FAIL (correct) |
| T1 GREEN | `node --test` over the four Task 1 files | 0 (108/108) | PASS (correct) |
| T2 RED | `node --test lib/prompt-raw-commit.repo.test.cjs` | 1 (test 6: `plugins/devflow/agents/debugger.md:404: git commit -m "fix: {brief description}`) | FAIL (correct) |
| T2 GREEN | `node --test` over the three Task 2 repo tests | 0 (31/31) | PASS (correct) |
| REFACTOR | none needed | - | - |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` (worktree root) | 1 | FAIL, with no failure in this TRD's files: 8804 tests, 8742 pass, 12 fail, 50 skipped |

The 12 failures:
- **roadmap-reconcile.test.cjs E2E1 (1):** the self-test found ROADMAP drift because 52-02's SUMMARY exists while its ROADMAP line was still `- [ ]`. The state step (`roadmap update-job-progress 52`) fixes this, and E2E1 is re-run after it (see Post-TRD Verification).
- **devflow-watch.test.cjs (5) and handoff-e2e.test.cjs (6):** the watcher daemon never writes its PID file (`PID file should be created`, `daemon never wrote its PID file within 15000ms`, `done record h-001 did not appear`). The same 10 failures recur when the two files run on their own. `devflow-watch.cjs` loads only the watcher-* / notifier / service-installer modules, and the branch diff touches none of them. This is environmental (the daemon does not spawn here) and out of scope for this TRD.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 4/4 (five-shape refusal test; raw stderr with unchanged stdout; inline-prefix escape wording with the reason variable; debugger via df-tools plus the CI guard)
- **Gate failures:** `npm test` had 11 environmental daemon failures (devflow-watch, handoff-e2e). The 1 ROADMAP drift is resolved: after `roadmap update-job-progress 52`, E2E1 re-run from the worktree root passes (1/1).
- **Note for the orchestrator:** E2E1 reads `process.cwd()`. Run from the MAIN checkout, it reports drift for 52-01..52-05, because `summary checkpoint|post` write each wave's SUMMARY into the main checkout while that checkout's ROADMAP is not yet ticked. Merging the wave branches clears it.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/gh-gate.cjs`: `START_HINT` gives the inline-prefix escape and names DEVFLOW_SKIP_GH_GATE_REASON. The module header, `ESCAPE_ENV`, the reason codes and the result keys are unchanged.
- `plugins/devflow/devflow/bin/lib/misc.cjs`: a raw refusal writes the message to stderr before `output()`, inside the store-mode gate block, so local mode still never loads gh-gate.cjs (test 7a green).
- `plugins/devflow/devflow/bin/lib/gh-gate.test.cjs`: new describe `52-02 every refusal names both remedies`, table-driven over the five shapes, plus a result-keys pin.
- `plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs`: 1b extended (stderr names both remedies), new 1d (JSON keys unchanged, `error` names both remedies), new 2c (raw unlinked-branch refusal), and an `assertNamesBothRemedies` helper.
- `plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs`: new CI guard (tests 6, 6b, 7) that skips on a mirror install with no README.md.
- `plugins/devflow/agents/debugger.md`: the code fix is committed through `df-tools commit --files`, never a raw `git add`/`git commit`.

## Decisions Made
- **Escape wording:** an inline prefix with the reason variable, never `export` (TRD anti-pattern). A test asserts that the message does not contain `export DEVFLOW_SKIP_GH_GATE`.
- **Guard scope:** agents/*.md and skills/*/SKILL.md only. workflows/complete-milestone.md and workstreams-merge.md hold merge-completion commits that gate-commits allows.
- **Fence handling:** the guard follows CommonMark rules: ``` and ~~~ fences, a closing fence of the same character at least as long as the opener, and no backtick inside a backtick fence's info string. No agent or skill uses ~~~ or 4-backtick fences today; the rule stops a raw commit from hiding in one later.
- **Scan-set check (6b):** test 6b asserts that both agents and skills are scanned, so a broken glob cannot make test 6 pass on an empty set.

## Deviations from Plan

None. The TRD executed as written. The recovery step (update assertions that pin the old wording) was not needed, because no test pinned `or set DEVFLOW_SKIP_GH_GATE=1 (logged)`. docs/USER-GUIDE.md:941 still quotes the old message, and per the TRD's error_recovery that update belongs to TRD 52-06.

## Discovered commands

None. `npm test` and the scoped `node --test {files}` came from the stack profile.

## Next Objective Readiness
- TRD 52-06 (docs): update the refusal message quoted at docs/USER-GUIDE.md:941 to the new wording, and mention that `--raw` refusals now print the message on stderr.

## Self-Check: PASSED
- FOUND: all 6 files in files_modified (1 created, 5 modified); `git diff --stat` from WAVE_BASE touches only those six and this SUMMARY.
- FOUND: commits 07e735bb, 3e2bde6b, b6a0bba5, cd64df96 on df/exec-52-02 (`git log --oneline 67f87a01..HEAD`).
- FOUND: misc.cjs:650 `if (raw) process.stderr.write(...)` inside the `if (storeMode && !mergeOrRebaseInProgress(cwd))` block.
