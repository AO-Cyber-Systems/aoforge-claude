---
objective: 62-built-in-sweep
trd: "10"
subsystem: prompts
tags: [builtin-sweep, ratchet, dogfood, docs, bltn-01, bltn-02, bltn-03]
---

# Objective 62 TRD 10: Close the ratchet, dogfood, document, full suite Summary

## Progress
- [x] Task 1a: close the ratchet in builtin-sweep.repo.test.cjs (baseline directory absent, no pending branches, manual rows checked); BS-104 help.md plan-mode paragraph reworded so the manual check passes — 59a53986
- [x] Task 1b: docs/built-in-sweep.md closed (status line, cells reconciled with what shipped, BS-121 added, counts, Shipped progress figures, "Reconciled at close"); tests 8a and 8d added — f205fee4
- [x] Task 2: dogfood D1-D6 (no commit; evidence below) — no commit
- [x] Task 3a: CHANGELOG, USER-GUIDE section, help.md plan-objective bullet, CLAUDE.md bullet — (this commit)
- [ ] Task 3b: full npm test and classify every failure — next step: run `npm test` (Bash timeout 600000) from /Users/justin/dev/devflow-claude, then prove any failure pre-existing at base 6ca818a8 in a scratch worktree

## Dogfood evidence (Task 2, scratchpad only)

| # | SC | Result |
|---|----|--------|
| D1 | 1 | micro 1/1/1, quick 4/6/4, build 7/5/5, debug 4/5/4, plan-objective 6/5/5, verify-work 5/8/4 (creates/completed/in_progress; floors 1, 2, 4, 2, 4, 2); every flow's skill declares TaskCreate and TaskUpdate; no missing built-in |
| D2 | 2 | plan-objective 1 span (enter 769, skip rule 752, exit 779), new-project 3 spans (395/392/399, 972/969/992, 1115/1112/1121), milestone-complete 1 span (367/359/377), every span presents a draft; each of the three skills declares EnterPlanMode and none ExitPlanMode; 34 skills checked, `forbidden` empty |
| D3 | 3 | 74 files scanned, 0 findings; 121 inventory rows (69 scan, 52 manual) by kind choice 85, explanatory 10, free-text 8, schema 12, subagent 4, ask-misuse 2 |
| D4 | 1 | skipped (live micro): `claude -p` with a scratch HOME answered `Not logged in · Please run /login`; no credentials were copied. The run did start: the init event shows the plugin loaded inline from the checkout (devflow 2.13.2) and, with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, the tools TaskCreate, TaskGet, TaskList, TaskStop and TaskUpdate; the same run without the variable listed only TaskStop. The progress behaviour is checked statically (D1) and handed to UAT |
| D5 | 2 | skipped (ExitPlanMode probe): same login failure, and the headless `-p` tool list holds no EnterPlanMode, ExitPlanMode or AskUserQuestion, so a probe skill cannot call them there. The rule (never declare ExitPlanMode) stands: omitting it costs nothing |
| D6 | 2, 3 | UAT handoff list below |
