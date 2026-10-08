---
objective: 41-retroactive-verification
trd: "08"
job: 41-08
requirements: [VER-30]
status: complete
gap_closure: true
subsystem: agents / planner / plan-objective workflow
tags: [spawn, subagents, planner, research, tools-allowlist, tdd]
dependency-graph:
  requires: [41-07]
  provides:
    - "Spawn-capability guard: Task(/Agent(/subagent_type= in an agent body requires Task|Agent in its tools: (test)"
    - "planner -> plan-objective/build RESEARCH NEEDED return contract (test)"
    - "Executable novel-domain research path: planner signals, orchestrator spawns"
  affects:
    - 30-agent-environment-hygiene (follow-up F1 in 30-VERIFICATION.md no longer reproduces)
tech-stack:
  added: []
  patterns:
    - "Subagents signal, orchestrators spawn: a subagent that needs another agent returns a structured header the orchestrator handles"
    - "Return-header contract test: a header an agent emits must be handled by its consuming workflow"
key-files:
  created:
    - .planning/objectives/41-retroactive-verification/41-08-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/agent-tools.test.cjs
    - plugins/devflow/agents/planner.md
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/build.md
    - CHANGELOG.md
decisions:
  - "Task/Agent were not added to planner's tools: - subagents cannot spawn, so declaring them would only silence the guard"
  - "Novel-domain detection (df-tools detect novel-domain) stays in the planner; only the spawn moved to plan-objective step 10"
  - "The planner prompt (plan-objective step 9) now carries a **Flags:** line so the planner can see --skip-research and never emits RESEARCH NEEDED under it"
metrics:
  started: 2026-09-28T16:47:28Z
  completed: 2026-09-28T16:50:29Z
  duration: ~3m (excluding one full-suite run)
  tasks: 2
  files: 5
tokens_input: 2692489
tokens_output: 21363
tokens_cache_read: 2627534
tokens_cache_write: 64881
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 41 TRD 08: Planner signals RESEARCH NEEDED instead of spawning the researcher — Summary

**One-liner:** The planner's novel-domain step now returns `## RESEARCH NEEDED` with the `detect novel-domain` signals and writes no TRDs. plan-objective step 10 (and `/devflow:build` through it) runs objective-researcher with those signals and re-spawns the planner once. `agent-tools.test.cjs` now fails on any `Task(` / `Agent(` / `subagent_type=` in an agent whose `tools:` cannot spawn.

Closes gap VER-30 (follow-up F1 in `30-agent-environment-hygiene/30-VERIFICATION.md`).

## What changed

| File | Change |
|---|---|
| `plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | Added `Task` and `Agent` to `KNOWN_TOOLS`. Added a per-agent `subagent_type=` test that requires Task or Agent in `tools:`. Added a contract test: if planner.md contains `## RESEARCH NEEDED`, plan-objective.md must contain it and build.md must route it. |
| `plugins/devflow/agents/planner.md` | `mandatory_discovery` Step 0 keeps the `detect novel-domain` block but drops the "Auto-spawn" comment. The Task/`subagent_type=` instruction is replaced by: STOP, write no TRDs, return `## RESEARCH NEEDED`, because subagents cannot spawn. Added a `## Research Needed` template to `<structured_returns>`, within the 300-token budget. |
| `plugins/devflow/devflow/workflows/plan-objective.md` | Step 10 has a `## RESEARCH NEEDED` bullet. It spawns objective-researcher as in step 6 with the Signals appended, re-runs the step 1 init, then re-spawns the planner (step 9). There is at most one re-spawn; a second RESEARCH NEEDED is handled as PLANNING INCONCLUSIVE. Step 9's planner prompt now carries `**Flags:**`. |
| `plugins/devflow/devflow/workflows/build.md` | The planner step now says to handle the return as in plan-objective step 10, including `## RESEARCH NEEDED`. |
| `CHANGELOG.md` | Added one `### Fixed` bullet under `[Unreleased]`. There is no version bump. |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | 1 (29 tests, 27 pass, 2 fail) | FAIL on planner only (correct) |
| RED window | `node --test --test-name-pattern "RESEARCH NEEDED\|planner" .../agent-tools.test.cjs` after the planner edit, before the workflow edit | 1 (contract test fails) | FAIL (correct; the contract guard bites) |
| GREEN | `node --test .../agent-tools.test.cjs .../model-profiles.test.cjs` | 0 (45/45 pass) | PASS (correct) |

RED output at HEAD `8e7b625` (commit `12702e7`), quoted:

```
✖ planner: every called tool is declared
  AssertionError [ERR_ASSERTION]: planner.md instructs Task but does not declare it in tools:
  + [
  +   'Task'
  + ]
  - []
✖ planner: subagent_type= only in agents that can spawn
  AssertionError [ERR_ASSERTION]: planner.md passes subagent_type= but declares neither Task nor Agent in tools: (subagents cannot spawn; return a signal to the orchestrator instead)
ℹ tests 29
ℹ pass 27
ℹ fail 2
```

**No other agent was flagged.** codebase-mapper, debugger, executor, integration-checker, job-checker, objective-researcher, project-researcher, research-synthesizer, roadmapper, security-auditor, ui-evaluator and verifier passed both new checks unchanged, so no exemptions were needed. The contract test passed vacuously at HEAD, as the TRD predicted.

RED-window output, after the planner edit and before the plan-objective edit:

```
✖ planner RESEARCH NEEDED return is handled by plan-objective and build
  AssertionError [ERR_ASSERTION]: planner.md returns ## RESEARCH NEEDED but plan-objective.md step 10 does not handle it
```

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED guard | `node --test plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | 1 (exactly 2 failures, both planner) | PASS (RED as specified) |
| 2: GREEN | `node --test .../agent-tools.test.cjs .../model-profiles.test.cjs` | 0 (45/45) | PASS |
| 2: GREEN | `rg -n -e 'subagent_type\|\bTask\(\|\bAgent\(' plugins/devflow/agents/` | 1 (no matches) | PASS |
| 2: GREEN | `rg -n -e 'RESEARCH NEEDED' planner.md plan-objective.md build.md` | 0 (hits in all three: planner.md:729,1141; plan-objective.md:520; build.md:129) | PASS |
| 2: GREEN | `git status --short` (version files) | 0 (package.json, plugin.json and marketplace.json not modified) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| agent-tools | `node --test plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | 0 | PASS |
| model-profiles | `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 0 | PASS (41-07 still green after the planner.md edit) |
| full suite | `npm test` | 1 (MA-7 only) | PASS (4251 tests, 4218 pass, 1 fail = MA-7, 32 skipped) |

**Full suite versus the post-41-07 baseline.** The baseline was 4237 tests, 1 fail (MA-7) and 32 skipped. After this TRD there are 4251 tests, 4218 pass, 1 fail (MA-7 handoff-e2e, `doctl auth init` with an unset token, which is environmental) and 32 skipped. That is +14 tests: 13 per-agent `subagent_type=` checks plus 1 contract test. All of them pass. The fail count holds at 1. The dispatch quoted a baseline pass count of 4203, but 4237 − 1 − 32 = 4204, so the true pass delta is +14.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The planner could not see `--skip-research`**
- **Found during:** Task 2
- **Issue:** The TRD states that "if `--skip-research` was passed, the planner never emits this", but plan-objective step 9's planner prompt passed no flags. Step 0's `--skip-research` condition could therefore not be evaluated. A user who passed `--skip-research` on a novel domain would get RESEARCH NEEDED, and the orchestrator would run the researcher against the user's flag.
- **Fix:** Added `**Flags:** {--skip-research if passed, otherwise none}` to step 9's `<planning_context>`. `/devflow:build` inherits it through "same as plan-objective step 9". As a backstop, step 10 treats a RESEARCH NEEDED that arrives under `--skip-research` as PLANNING INCONCLUSIVE rather than overriding the flag.
- **Files modified:** `plugins/devflow/devflow/workflows/plan-objective.md`
- **Commit:** aa54b18

**2. [Scope extension - test] The contract test also asserts build.md**
- **Found during:** Task 1
- **Issue:** The TRD's test 3 names plan-objective.md only. The must-have "build.md's planner step defers return handling to plan-objective step 10" had no mechanical guard.
- **Fix:** The same contract test also asserts that build.md mentions `RESEARCH NEEDED`. It covers the same return header, so this adds no handling for any other planner return (the anti-pattern is respected).
- **Files modified:** `plugins/devflow/devflow/bin/lib/agent-tools.test.cjs`
- **Commit:** 12702e7

The rest of the TRD was executed as written. Line references moved by one line compared with the TRD (planner.md:731 instead of :730) because of 41-07's frontmatter edit.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7
- Gate failures: None (MA-7 handoff-e2e is the expected pre-existing failure)

## Commits

- `12702e7`: test(41-08): agent-tools guard covers Task/Agent spawns (RED)
- `aa54b18`: fix(41-08): planner signals RESEARCH NEEDED instead of spawning the researcher

## Self-Check: PASSED

- FOUND: 12702e7, aa54b18 (`git log --oneline -3`)
- FOUND: all 5 modified files in `git diff --stat 8e7b625 HEAD` (62 insertions, 5 deletions). The version files are absent from the diff.
- STATE.md and ROADMAP.md were not touched, per the dispatch (the orchestrator and 41-06 own them).
