---
objective: 44-autonomy-hardening
trd: "02"
job: 44-02
subsystem: agents-and-workflows
tags: [prompts, subagents, research-synthesizer, planner, security-audit, legacy-paths]

# Dependency graph
requires: []
provides:
  - "No spawn prompt (outside execute-objective.md, owned by 44-01) tells an agent to read ~/.claude/agents/<name>.md"
  - "research-objective spawns the typed objective-researcher agent (both initial and continuation)"
  - "research-synthesizer text-return contract: SUMMARY.md body between --- BEGIN SUMMARY.md --- / --- END SUMMARY.md --- markers, no Write tool"
  - "new-project / milestone new orchestrators extract, Write and commit .planning/research/SUMMARY.md (single commit of .planning/research/)"
  - "planner tools include Edit; revision_mode tells it to use Edit for targeted revisions"
affects: [44-01, 44-08, new-project, milestone-new, research-objective, plan-objective, quick, security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed subagents get their definition as the system prompt; spawn prompts carry only the task"
    - "Subagents that produce a report return it as marked text; the orchestrator writes and commits it"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/devflow/workflows/new-milestone.md
    - plugins/devflow/devflow/workflows/security-audit.md
    - plugins/devflow/devflow/workflows/quick.md
    - plugins/devflow/skills/research-objective/SKILL.md
    - plugins/devflow/agents/research-synthesizer.md
    - plugins/devflow/agents/planner.md

key-decisions:
  - "research-objective switched from general-purpose + read instruction to subagent_type=objective-researcher, so dropping the read line loses no role definition"
  - "research-synthesizer tools reduced to Read, Bash; the orchestrator writes SUMMARY.md verbatim and commits .planning/research/ with the same 'docs: complete project research' message the synthesizer used"
  - "Marker-missing fallback documented in both orchestrators: whole final message minus the leading ## SYNTHESIS COMPLETE header block; ## SYNTHESIS BLOCKED surfaces the blocker instead of writing"

patterns-established:
  - "Marked text return: --- BEGIN <FILE> --- / --- END <FILE> --- on their own lines, orchestrator writes verbatim"

requirements-completed: [AUT-03, AUT-07]  # This TRD's share only: AUT-03 closes with 44-01 (execute-objective.md:818) + 44-08 (CI guard); AUT-07 executor/config-get items belong to other TRDs.

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

# Metrics
duration: 5min
completed: 2026-09-29
tokens_input: 3212928
tokens_output: 25675
tokens_cache_read: 3127235
tokens_cache_write: 85615
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 44 TRD 02: Drop legacy agent-path reads; synthesizer returns text; planner gets Edit Summary

**Removed all 13 legacy `~/.claude/agents/<name>.md` read instructions from 5 spawn sites (typing research-objective's two spawns as `objective-researcher`), turned research-synthesizer into a text-returning agent whose SUMMARY.md the new-project and milestone-new orchestrators write and commit, and gave the planner `Edit`.**

## Progress

- [x] Task 1: legacy agent-path reads removed (e2a488b)
- [x] Task 2: synthesizer text return, orchestrator write+commit, planner Edit (d8ec4a7)
- [x] Full `npm test` run; SUMMARY complete

## Performance

- Started: 2026-09-29T14:20:48Z
- Completed: 2026-09-29T14:25:11Z
- Tasks: 2/2
- Files modified: 8 (+ this SUMMARY)

## Accomplishments

- **DF-04 (AUT-03):** every spawn in plan-objective.md (3), quick.md (1), new-project.md (4 project-researcher prompts), security-audit.md (the `@~/.claude/agents/security-auditor.md` bullet plus 3 prompts) and research-objective SKILL.md (2) no longer wastes a turn on a failing Read of the backed-up legacy agent file. security-audit prompts now open with "Run your security-audit process for the focus below."
- research-objective's two `Task` blocks changed from `subagent_type="general-purpose"` to `subagent_type="objective-researcher"`, matching plan-objective.md, so the role still comes through as the system prompt.
- **DF-08 (AUT-07):** research-synthesizer is `tools: Read, Bash`, composes the SUMMARY.md body (Step 6) and returns it between `--- BEGIN SUMMARY.md ---` / `--- END SUMMARY.md ---` markers under `## SYNTHESIS COMPLETE`, followed by the existing executive summary. The old Step 7 (commit) is gone and the success criteria read "returned" and "no file written and no commit made". It now also names `/devflow:milestone new` as a spawner.
- new-project.md and new-milestone.md tell the synthesizer "Return the SUMMARY.md content between the BEGIN/END markers. Do not write files." They then run three orchestrator steps: (a) extract between the markers, with the documented fallback; (b) Write the text verbatim to `.planning/research/SUMMARY.md`; (c) `df-tools commit "docs: complete project research" --files .planning/research/`, one commit for all 5 files as before. Both skills already allow `Write`.
- **DF-09 (AUT-07):** planner `tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, mcp__context7__*`. revision_mode Step 4 now says to use Edit for targeted revisions and to keep Write for new or wholly rewritten TRDs.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 | e2a488b | fix(44-02): drop legacy ~/.claude/agents read instructions from spawn prompts |
| 2 | d8ec4a7 | feat(44-02): research-synthesizer returns SUMMARY.md as text; orchestrators write+commit; planner gets Edit |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Remove legacy read instructions | `rg -n "claude/agents/" <5 files>` | 1 (no matches) | PASS |
| 1 | `rg -n 'subagent_type="general-purpose"' skills/research-objective/SKILL.md` | 1 (no matches) | PASS |
| 1 | `node --test doc-refs.repo.test.cjs agent-tools.test.cjs skill-route.test.cjs` | 0 (120/120) | PASS |
| 2: Synthesizer text return; planner Edit | `rg -n "^tools:" research-synthesizer.md planner.md` -> `Read, Bash` / `Read, Write, Edit, Bash, ...` | 0 | PASS |
| 2 | `rg -n "BEGIN SUMMARY.md" research-synthesizer.md new-project.md new-milestone.md` -> hits in all 3 | 0 | PASS |
| 2 | `node --test agent-tools.test.cjs model-profiles.test.cjs doc-refs.repo.test.cjs skill-route.test.cjs` | 0 (136/136) | PASS |

TRD-level verification: `rg -n "claude/agents/" plugins/devflow` hits only `workflows/execute-objective.md:818` (44-01's line), `lib/global-upgrade.cjs:10`, `lib/upgrade.test.cjs:142` and `lib/__fixtures__/upgrade-fixtures.cjs:179,190`, which is the allowed set.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test agent-tools.test.cjs doc-refs.repo.test.cjs skill-route.test.cjs` | 0 | PASS |
| wave | `npm test` | 1 | PASS (only known pre-existing failures) |

`npm test`: 5110 tests, 5049 pass, **11 fail**, 50 skipped. Every failure is in a known pre-existing family:
- handoff-e2e: 6 (`handoff pipeline — end-to-end`: write pending, disallowed command, idempotency, multi-record, LK-1, LK-2)
- devflow-watch: 4 cases across its 2 failing suites (`start (foreground) + stop`: 2; `multi-project CLI (TRD 20-03)`: C-1, C-2). These are daemon PID/process assertions.
- roadmap-reconcile E2E1: 1 (ROADMAP ticking drift)

`git diff --stat c88f347..HEAD` touches only `.md` files, so none of these can come from this TRD.

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written. Small in-scope additions:
- research-synthesizer: removed the stale `# Planning config loaded via df-tools.cjs in commit step` comment (no commit step remains) and changed Step 2 "Write 2-3 paragraphs" to "Compose ..." so the body has no write-sounding instruction. Added `/devflow:milestone new` to its spawner list, since new-milestone.md spawns it.
- Both orchestrators also handle `## SYNTHESIS BLOCKED` (surface it, write nothing), next to the marker-missing fallback the TRD required.

No skill-contract test pinned research-objective's `general-purpose` spawn (only `hooks/route-intent.test.js` mentions research-objective, and it doesn't reference `general-purpose`), so the `<recovery>` path wasn't needed.

## Observed, out of scope (not changed)

- security-audit.md still tells each security-auditor to write findings to `.security-audit-tmp/<focus>.md`. That is the same "subagent report file" class as DF-08 and may be blocked by the harness. Candidate for a follow-up TRD.
- The project-researcher spawns in new-project.md / new-milestone.md still say `Write to: .planning/research/<FILE>.md`. The TRD scopes only the synthesizer. If the harness blocks those writes as well, they need the same text-return treatment.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (no legacy read in the 5 files; typed objective-researcher spawns; synthesizer marker contract and orchestrator write+commit; planner Edit)
- Gate failures: None (wave gate failures are all pre-existing, listed above)

## Self-Check: PASSED

- FOUND: plugins/devflow/agents/research-synthesizer.md (`tools: Read, Bash`, markers present, no `Write(` call-form, no "Write to")
- FOUND: plugins/devflow/agents/planner.md (`Edit` in tools)
- FOUND: plugins/devflow/skills/research-objective/SKILL.md (2x `subagent_type="objective-researcher"`)
- FOUND: commit e2a488b
- FOUND: commit d8ec4a7
