---
objective: 62-built-in-sweep
trd: "09"
subsystem: skills-and-workflows
tags: [built-ins, AskUserQuestion, BLTN-03, built-in-sweep]
requires: [62-01, 62-02, 62-03]
provides:
  - "todo-status-objective group prose choices converted to AskUserQuestion (BLTN-03)"
  - "todo-status-objective builtin-sweep baseline emptied and deleted"
affects: [62-10]
tech-stack:
  added: []
  patterns:
    - "runtime-list AskUserQuestion (todos, objectives, decisions): first 4 as options, the rest typed under Other"
    - "destructive confirmations put the safe option first as (Recommended)"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/check-todos.md
    - plugins/devflow/devflow/workflows/health.md
    - plugins/devflow/devflow/workflows/pause-work.md
    - plugins/devflow/devflow/workflows/resume-project.md
    - plugins/devflow/devflow/workflows/remove-objective.md
    - plugins/devflow/devflow/workflows/workstreams-merge.md
    - plugins/devflow/devflow/workflows/workstreams-setup.md
    - plugins/devflow/skills/objective/SKILL.md
    - plugins/devflow/skills/decide/SKILL.md
    - plugins/devflow/skills/handoff/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json
decisions:
  - "health.md 0011 GitHub store question lists Not now (Recommended) first, per the built-ins.md order rule, where the inventory row wrote Migrate now first"
  - "handoff's rejected-command question follows inventory BS-101 (Run it myself (Recommended) / Extend allowlist), not the TRD gotcha's Run it myself / Stop; neither offers Retry"
metrics:
  duration: 7m
  completed: 2026-10-06
tokens_input: 11485915
tokens_output: 59738
tokens_cache_read: 11318204
tokens_cache_write: 167551
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 09: Questions in todo, status, objective, decide, handoff and workstreams Summary

Every discrete choice in the todo-status-objective group (todo list, health/migrate, pause, resume, remove-objective, decide, handoff, workstreams setup and merge) now asks with a well-formed AskUserQuestion. Destructive confirmations recommend the safe option. The group's sweep baseline is empty and deleted.

## Progress
- [x] Task 1 RED: todo and status entries leave the baseline — a73a1a21
- [x] Task 1 GREEN (todo): check-todos asks with AskUserQuestion — 4eeae608
- [x] Task 1 GREEN (status): health, pause-work, resume-project — ecf4b7f5
- [x] Task 2 RED: objective, decide, handoff, workstreams entries leave the baseline — 41ef5bd1
- [x] Task 2 GREEN (objective): remove-objective — 55ec1f1f
- [x] Task 2 GREEN (decide) — c29b2840
- [x] Task 2 GREEN (handoff) — b1561bb0
- [x] Task 2 GREEN (workstreams) and baseline deleted — 5d57c6d1
- [x] Final SUMMARY, state and roadmap — (docs commit)

## Inventory rows resolved (26 of 26)

| Row | File | Detect | Resolution |
|-----|------|--------|------------|
| BS-076 | workflows/check-todos.md | scan | "Todo" runtime-list AskUserQuestion. Area filter, number or q typed under Other. The printed `Reply with a number` footer is gone |
| BS-077 | workflows/check-todos.md | scan | replaced by the Todo question |
| BS-078 | workflows/check-todos.md | scan | reworded: a typed answer that matches no todo asks the same question again |
| BS-079 | workflows/health.md | manual | "Migrations": Apply (Recommended) / Skip. The question keeps "(a backup is taken outside the repo first)" |
| BS-080 | workflows/health.md | manual | one call, two questions. "Kind": api/app/library/cli, with ui-lib and plugin named for Other. "Work type": Skip (Recommended)/feature/port/refactor, with the other four named for Other. Never guess the kind |
| BS-081 | workflows/health.md | manual | "GitHub store": Not now (Recommended) / Migrate now / Keep mirror mode. Migrate now hands off to `/devflow:gh-sync migrate` |
| BS-082 | workflows/health.md | manual | "Migration": Apply (Recommended) / Skip |
| BS-083 | workflows/health.md | scan | "Repair": Run repairs (Recommended) / Not now. The printed question is deleted |
| BS-084 | workflows/health.md | scan | "Stack": Preview draft (Recommended) / Skip, then "Stack": Write it (Recommended) / Skip. Never auto-repaired |
| BS-085 | workflows/pause-work.md | scan | "Objective" runtime-list question, most recent first. A number is typed under Other |
| BS-086 | workflows/pause-work.md | manual | kept as prose: the clarifying conversation is free text. No marker |
| BS-087 | workflows/remove-objective.md | scan | "Remove?": Cancel (Recommended) / Remove objective {target}. The renumbering summary is still printed |
| BS-088 | workflows/remove-objective.md | scan | replaced by the Remove? question |
| BS-089 | workflows/remove-objective.md | manual | "Executed": Cancel (Recommended) / Force remove |
| BS-090 | workflows/resume-project.md | scan | "Rebuild?": Reconstruct (Recommended) / Continue without |
| BS-091 | workflows/resume-project.md | manual | "Next step": the primary action (Recommended) plus the 3 most relevant others. Something else is typed under Other. The state-dependent logic is unchanged |
| BS-092 | workflows/resume-project.md | scan | replaced by the Next step question |
| BS-093 | workflows/workstreams-merge.md | scan | "Merge": Merge completed only (Recommended) / Wait for all / Force merge all. The printed bare `Options:` list is deleted |
| BS-094 | workflows/workstreams-setup.md | scan | "Workstreams": View status (Recommended) / Set up anyway |
| BS-095 | workflows/workstreams-setup.md | manual | the printed `Proceed with workstream setup?` is deleted |
| BS-096 | workflows/workstreams-setup.md | scan | "Worktrees": Not yet (Recommended) / Create them. Interactive mode only; yolo still auto-approves |
| BS-097 | skills/decide/SKILL.md | scan | display template reworded to `Choices:` |
| BS-098 | skills/decide/SKILL.md | scan | "Decision" (runtime list; skipped when only one decision is pending), then "Option" with the recommendation first. With arguments the skill resolves directly, as before |
| BS-099 | skills/decide/SKILL.md | scan | allow marker on the line above the DECISION file format's `**Options:**`. The label is data written by decision-queue.cjs |
| BS-100 | skills/handoff/SKILL.md | manual | "Handoff": Retry / Run it myself / Stop. Never retried silently |
| BS-101 | skills/handoff/SKILL.md | manual | "Handoff": Run it myself (Recommended) / Extend allowlist. No Retry for a rejected command |

allowed-tools: `AskUserQuestion` was added to objective, decide and handoff. todo, status and workstreams already declared it.

The 9 "no prompt" files (todo/status/workstreams skills, add-todo, add-objective, progress, workstreams-run, workstreams-status) were not edited.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (tests 2 and 9a: 8 findings, 8 rows) | FAIL (correct) |
| 1 GREEN | `node --test builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 (40/40) | PASS |
| 2 RED | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (tests 2 and 9a: 9 findings, 8 scan rows) | FAIL (correct) |
| 2 GREEN | `node --test builtin-sweep.repo.test.cjs builtin-audit.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 (136/136) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 | FAIL (correct) |
| GREEN (Task 1) | same | 0 | PASS (correct) |
| RED (Task 2) | same | 1 | FAIL (correct) |
| GREEN (Task 2) | same, baseline deleted | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| built-in tests | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 0 (112/112) | PASS |
| task (scoped) | `node --test builtin-sweep.repo.test.cjs doc-refs.repo.test.cjs` (with planning-writes) | 0 | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs'` | 0 (135/135) | PASS |
| prose suite + adopt contract | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 (148/148) | PASS |

## Deviations from Plan

### Recorded for 62-10 (inventory reconciliation, docs/built-in-sweep.md not edited)

1. **BS-081 option order.** The inventory lists `Migrate now / Not now (Recommended) / Keep mirror mode`. built-ins.md says the recommended option comes first, so health.md has `Not now (Recommended) / Migrate now / Keep mirror mode`. BS-116 (gh-sync, TRD 62-11) carries the same list, so 62-10 should check that the two flows agree.
2. **BS-101 options.** The TRD gotcha says `Run it myself / Stop` for a rejected command. The inventory says `Run it myself (Recommended) / Extend allowlist`. I followed the inventory, which keeps the existing outcome ("run it manually or extend the allowlist"). Neither version offers Retry. "Extend allowlist" names `~/.devflow/devflow-watch-allow.json` and does not re-hand the command off by itself.
3. **Commit granularity.** Per the dispatch, each task has one RED commit (as the TRD specifies) and then one GREEN commit per skill group. The intermediate GREEN commits (4eeae608, 55ec1f1f, c29b2840, b1561bb0) leave the repo test red only for groups not yet converted. The last GREEN commit of each task (ecf4b7f5, 5d57c6d1) is fully green.
4. **Not converted (no row):** workstreams-merge.md `3. Ask user to resolve` (conflict strategy). The user resolves a code conflict by hand, which is an open action and not a discrete choice. The scanner does not flag it, so it stays prose. check-todos.md's empty-list `Would you like to:` block and remove-objective.md's `## What's Next` block print next commands and are not flagged. Both are unchanged.

### Auto-fixed Issues

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. Every discrete choice is an AskUserQuestion within the limits, including runtime lists. health 0006 offers 4 options per question and never guesses. Remove, merge and worktree creation put the safe option first. pause-work's clarifications stay prose. The baseline is deleted, and objective, decide and handoff declare AskUserQuestion.
- Gate failures: None
- Files changed outside the TRD's `files_modified`: none

## Self-Check: PASSED

- FOUND: all 10 modified files under plugins/devflow/ (tests read them)
- GONE: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json (the directory lists the 7 other groups only)
- FOUND commits on df/exec-62-09-todo-status-workstreams-prompts: a73a1a21, 4eeae608, ecf4b7f5, 41ef5bd1, 55ec1f1f, c29b2840, b1561bb0, 5d57c6d1
