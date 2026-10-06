---
objective: 62-built-in-sweep
trd: "08"
subsystem: prompts
tags: [builtin-audit, askuserquestion, disallowed-tools, checkpoints, execute-objective, transition, map-codebase, adopt]

requires:
  - "62-01: builtin-audit.cjs scanner (disallowed-tools counts as covered)"
  - "62-02: docs/built-in-sweep.md inventory (execute-and-map rows BS-050..BS-075)"
  - "62-03: builtin-sweep.repo.test.cjs ratchet and the execute-and-map baseline"
provides:
  - "execute-and-map group converted: every discrete choice in execute-objective, transition, discuss-objective and map-codebase is an AskUserQuestion"
  - "discovery-objective.md gates return a checkpoint:decision instead of asking (planner subagent)"
  - "skills/adopt declares disallowed-tools: AskUserQuestion (unattended, enforced)"
  - "execute-and-map baseline emptied and deleted"
affects: [62-10]

tech-stack:
  added: []
  patterns:
    - "Subagent-run prompts become `## CHECKPOINT REACHED` (type decision) returns that the orchestrator asks"
    - "A skill that must never ask lists `disallowed-tools: AskUserQuestion`; the scanner treats it as covered, so ALLOWED_TOOLS_EXEMPT stays empty"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/transition.md
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/execute-trd.md
    - plugins/devflow/devflow/workflows/discovery-objective.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/devflow/workflows/discuss-objective.md
    - plugins/devflow/skills/execute-objective/SKILL.md
    - plugins/devflow/skills/map-codebase/SKILL.md
    - plugins/devflow/skills/adopt/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json

key-decisions:
  - "adopt is kept unattended by `disallowed-tools: AskUserQuestion` in its frontmatter, not by an ALLOWED_TOOLS_EXEMPT entry; `claude plugin validate` passes with it"
  - "execute-trd.md's plan confirmation keeps its line under an allow marker (BS-064), not a checkpoint return: a checkpoint per TRD in interactive mode would change the gating, and execute-objective owns the plan confirmation"
  - "Gating is unchanged everywhere: transition's confirmation stays interactive-only, the incomplete-jobs safety rail asks in every mode, autonomous mode never asks on a TRD failure"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true

duration: 12min
completed: 2026-10-06
tokens_input: 17177683
tokens_output: 72287
tokens_cache_read: 16954701
tokens_cache_write: 222774
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 62 TRD 08: Questions in execution, transition, discussion and codebase mapping Summary

**The execute-and-map group's 26 inventory rows are resolved. Transition, the incomplete-jobs safety rail, partial completion, TRD failures, dependents, decision checkpoints, the codebase-map menu, the document pick, the STACK.md draft and the secrets pause all ask with AskUserQuestion. The planner's discovery gates return decision checkpoints. adopt can never ask (`disallowed-tools`), and the execute-and-map baseline is gone.**

## Progress
- [x] Task 1: execute-objective, transition, execute-trd and discovery-objective — RED 91cb1a0d, GREEN 247fb0ca
- [x] Task 2: map-codebase, discuss-objective and adopt — RED cd058b77, GREEN 0861a6f2

## Accomplishments

Inventory rows resolved (all 26 `execute-and-map` rows):

| Row | File | Resolution |
|-----|------|------------|
| BS-050 | discovery-objective.md | LOW-confidence gate returns a decision checkpoint (header "Low Conf.", Dig deeper / Proceed anyway / Pause); the old `Use AskUserQuestion:` is gone |
| BS-051 | discovery-objective.md | MEDIUM-confidence gate returns a decision checkpoint (Proceed (Recommended) / Dig deeper) |
| BS-052 | discovery-objective.md | open-questions gate returns a decision checkpoint (Proceed / Address first); "Address first" still revises the draft and runs `doc put` again |
| BS-053 | discuss-objective.md | "View it" re-asks the "Context" question with Update it / Skip |
| BS-054 | discuss-objective.md | "View existing jobs" re-asks the "Plans exist" question with Continue and replan after / Cancel |
| BS-055 | execute-objective.md | "Rebuild?": Reconstruct (Recommended) / Continue without |
| BS-056 | execute-objective.md | "Dup log": Continue without recording (Recommended) / Retry |
| BS-057 | execute-objective.md | "TRD failed" (spot-check): Retry (Recommended) / Continue with remaining waves; autonomous still never asks |
| BS-058 | execute-objective.md | "TRD failed" (non-autonomous failure): Continue (Recommended) / Stop |
| BS-059 | execute-objective.md | allow marker (free text): the verifier-escalated human-verify checkpoint is answered "approved" or with a description |
| BS-060 | execute-objective.md | checkpoint step 5: decision checkpoints ask "Checkpoint" with the checkpoint's options (runtime-list rule over 4); human-verify and human-action answers stay plain text |
| BS-061 | execute-objective.md | the bare `Options:` head under "Gaps Remain" reworded to `Next steps:` |
| BS-062 | execute-objective.md | failure_handling "TRD failed": Retry (Recommended) / Skip this TRD / Stop (not in autonomous mode) |
| BS-063 | execute-objective.md | "Dependents": Attempt them (Recommended) / Skip them (not in autonomous mode) |
| BS-064 | execute-trd.md | allow marker (subagent): execute-objective owns the plan confirmation |
| BS-065, BS-066 | map-codebase.md | "Codebase map": Update / Refresh / Skip; the printed menu and `Wait for user response.` are gone |
| BS-067 | map-codebase.md | one call, two multiSelect questions "Docs (1/2)" (STACK / INTEGRATIONS / ARCHITECTURE / STRUCTURE) and "Docs (2/2)" (CONVENTIONS / TESTING / PATTERNS / CONCERNS) |
| BS-068 | map-codebase.md | "Stack": Write it (Recommended) / Edit first / Skip; only a write choice runs `stack init --write` |
| BS-069, BS-070 | map-codebase.md | fenced line ends at "Pausing before commit."; "Secrets": Stop, I'll edit (Recommended) / Safe to proceed |
| BS-071, BS-072 | transition.md | "Transition": Mark done (Recommended) / Not yet, inside the interactive-only block |
| BS-073 | transition.md | "Incomplete" (safety rail, every mode): Continue objective (Recommended) / Review what's left / Mark complete anyway; printed Options list deleted |
| BS-074 | transition.md | "Partial": Stay and finish (Recommended) / Mark complete anyway / Defer to later objective; printed Options list deleted |
| BS-075 | skills/map-codebase | step 1 reworded to "ask Refresh / Update / Skip with AskUserQuestion, as map-codebase.md does" |

allowed-tools: skills/execute-objective adds `TaskUpdate`, skills/map-codebase adds `AskUserQuestion`, skills/discuss-objective already declared `AskUserQuestion`, skills/adopt adds `disallowed-tools: [AskUserQuestion]`. `ALLOWED_TOOLS_EXEMPT` stays empty.

`<non_interactive_mode>` in map-codebase.md is unchanged; each new question sits in a step it overrides (check_existing, publish_maps, draft_stack_profile, scan_for_secrets). adopt.md was not edited: it keeps exactly one `AskUserQuestion`, on its `Never` line.

`claude plugin validate plugins/devflow`: `✔ Validation passed with warnings`. The 21 warnings are pre-existing: the unknown `statusLine` field in plugin.json, and 20 unquoted `${CLAUDE_PLUGIN_ROOT}` in hooks.json. None names a skill. The output shows checks on the manifest and hooks only, so the validator neither confirmed nor rejected `disallowed-tools` by name. It is kept, as error_recovery directs when there is no rejection.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: execute-objective, transition, execute-trd, discovery-objective | `node --test builtin-sweep.repo.test.cjs gate-commits-merge-sequence.test.js estimate-surfacing.repo.test.cjs state-merge-wiring.repo.test.cjs` | 0 (16 + 39 pass) | PASS |
| 2: map-codebase, discuss-objective, adopt | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs` | 0 (29 pass) | PASS |
| 2: plugin validate | `claude plugin validate plugins/devflow` | 0 (passed with 21 pre-existing warnings) | PASS |
| 2: baseline gone | `git show --stat 0861a6f2` lists `execute-and-map.json` deleted | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test builtin-sweep.repo.test.cjs` with the Task 1 entries and `execute-objective:TaskUpdate` removed | 1 (tests 2, 7, 9a fail: 9 findings, 1 allowed-tools pair, 6 rows) | FAIL (correct) |
| GREEN (Task 1) | `node --test builtin-sweep.repo.test.cjs` | 0 (16/16) | PASS (correct) |
| RED (Task 2) | `node --test builtin-sweep.repo.test.cjs` with the remaining 5 prompts removed | 1 (tests 2 and 9a fail: 5 findings, 5 rows) | FAIL (correct) |
| GREEN (Task 2) | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs` | 0 (29/29) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task (scoped test) | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs gate-commits-merge-sequence.test.js` (with builtin-audit.test.cjs and the prose suite) | 0 | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs'` | 0 (135/135) | PASS |
| builtin audit + sweep | `node --test builtin-audit.test.cjs builtin-sweep.repo.test.cjs` | 0 (112/112) | PASS |
| other readers of the edited files | stack-agent-mcp-contract, adopt-e2e, adopt-scaffold, managed-block, route-intent, tokens-cli, execute-objective-gh-sync, executor-isolation | 0 | PASS |
| full suite | `npm test` | 1 (10485 tests: 10424 pass, 11 fail, 50 skipped) | PASS for this TRD (11 failures are environmental or self-referential, see below) |

`npm test` failures, none in a file this TRD touches:
- 9 daemon tests (`devflow-watch.test.cjs` x4, `handoff-e2e.test.cjs` x6, one suite overlap): `Cannot find module 'node-pty'`. A fresh executor worktree has no `node_modules`. They fail the same way when rerun in isolation.
- `stack-drafter-fleet.test.cjs` (github-enterprise-migration): reads `~/dev/github-enterprise-migration`, outside this repo.
- `roadmap-reconcile.test.cjs` E2E1: reports this TRD's own 62-08 SUMMARY while ROADMAP still shows `- [ ] 62-08`. That is mid-run drift, which the state step's `roadmap update-job-progress` addresses.

## Discovered commands

None. The test commands come from the TRD and STACK (`node --test {files}`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The document pick has eight documents, not seven**
- **Found during:** Task 2
- **Issue:** The TRD and BS-067 list seven candidates (3 + 4), but map-codebase.md produces eight: PATTERNS.md (quality mapper) was missing.
- **Fix:** "Docs (2/2)" has four options, CONVENTIONS / TESTING / PATTERNS / CONCERNS, which is within the 4-option limit.
- **Files modified:** plugins/devflow/devflow/workflows/map-codebase.md
- **Commit:** 0861a6f2

**2. [Rule 1 - Bug] "Edit first" on the STACK.md draft would have lost the edits**
- **Found during:** Task 2
- **Issue:** `stack init --write` regenerates the draft from evidence and takes no edited input. A route of "revise the draft, then ask again" would drop the user's changes on the later write.
- **Fix:** "Edit first" gets the changes in plain text, runs the same write command, applies the changes to `.planning/STACK.md` and shows the result. "Write it" and "Skip" are unchanged.
- **Files modified:** plugins/devflow/devflow/workflows/map-codebase.md
- **Commit:** 0861a6f2

**3. [Rule 2 - Missing] The unresolvable-checkpoint prompt had no inventory row**
- **Found during:** Task 1
- **Issue:** The TRD names `"Skip this job?" or "Abort objective execution?"` in execute-objective.md's `<failure_handling>`, but docs/built-in-sweep.md has no row for it (manual line, not flagged by the scanner).
- **Fix:** It is now an AskUserQuestion, header "Unresolved": Stop execution (Recommended) / Skip this TRD. Partial progress is still recorded in STATE.md. The inventory is not edited; TRD 62-10 may add the row.
- **Files modified:** plugins/devflow/devflow/workflows/execute-objective.md
- **Commit:** 247fb0ca

**4. [Rule 3 - Blocking] planning-writes audit flagged the discuss-objective re-ask**
- **Found during:** Task 2
- **Issue:** `If "View it": Display CONTEXT.md, then ask ... "Update it"` put a write verb within 80 characters of CONTEXT, so planning-writes.repo.test.cjs read it as a direct write.
- **Fix:** The option labels were moved to the next line.
- **Files modified:** plugins/devflow/devflow/workflows/discuss-objective.md
- **Commit:** 0861a6f2

### Notes against the inventory (not edited, per the binding rules)

- **BS-058 gating.** The Conversion cell says "never asked in autonomous or yolo mode (unchanged)". The workflow asks on a real failure in yolo: execute_waves item 9 says "A real FAILURE in yolo still follows the non-autonomous failure handling in item 7". I kept the existing gating (asked whenever `MODE` is not `"autonomous"`), so the cell's "or yolo" is inaccurate.
- **BS-064** follows the inventory (an allow marker) rather than a checkpoint return. A checkpoint on every TRD in interactive mode would change the gating.
- **Routing made explicit.** The old transition, incomplete-jobs and partial-completion menus had no `If "<label>"` lines. The new ones route exactly as the menus describe. "Defer to later objective" applies the existing "marking complete with incomplete jobs" bookkeeping and names the objective that takes the work. "Reconstruct" runs `df-tools validate health --repair`, which regenerates a missing STATE.md (E004).
- **publish_maps** (map-codebase.md) pointed at the old "safe to proceed" reply. It now names the same "Secrets" question. This line was not an inventory row.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4. (1) Every discrete choice in the four flows is an AskUserQuestion. (2) The subagent prompts return checkpoints or carry a marker. (3) non_interactive_mode is intact and adopt declares `disallowed-tools`. (4) TaskUpdate is declared and the baseline is deleted.
- Gate failures: None

## Self-Check: PASSED

- FOUND: commits 91cb1a0d, 247fb0ca, cd058b77, 0861a6f2 (`git log --oneline -6`)
- FOUND: all nine modified files; MISSING (by design): `__fixtures__/builtin-sweep-baseline/execute-and-map.json`, deleted in 0861a6f2
- builtin-audit + builtin-sweep 112/112, prose suite 135/135, adopt-skill-contract 13/13, merge-sequence + estimate + state-merge 39/39
