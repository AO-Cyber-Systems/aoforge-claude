---
objective: 72-install-and-naming-cleanup
job: "01"
subsystem: planning
tags: [requirements, roadmap, aoforge-rename, est-11, run-state]

requires: []
provides:
  - "run state for objective 72 recorded before any other 72 TRD (EST-11 gate)"
  - "REQUIREMENTS.md: INST-01 rewritten to the /aoforge: scope, INST-02..INST-06 added and mapped to Objective 72"
  - "ROADMAP.md: Objective 72 rescoped to the AOForge rename (title, goal, six requirement ids, six success criteria)"
affects: [72-02, 72-03, 72-26, 75-estimation-retest]

tech-stack:
  added: []
  patterns: ["REQUIREMENTS.md via planning draft + doc put; ROADMAP.md (generated) via targeted Edit hunks in local mode"]

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Run state for 72 was already recorded when this TRD started (started_at 2026-10-08T22:24:56.615Z), so Task 1 took the idempotent path and asked nothing."
  - "No requirement is marked complete: INST-01 is only rescoped here and is delivered by later TRDs, so requirements-completed is empty and `requirements mark-complete` was not run."

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 0min
completed: 2026-10-08
---

# Objective 72 TRD 01: Rescope INST-01 and the Objective 72 roadmap entry Summary

**Planning documents now describe the AOForge rename scope: INST-01 rewritten, INST-02..INST-06 added, Objective 72's roadmap entry rewritten, and the EST-11 run state for 72 confirmed recorded before any other 72 TRD runs.**

## Progress
- [x] Task 1: Gate: record the run-state estimate for 72 before anything else runs — (no repo files; run state already recorded)
- [x] Task 2: Rewrite INST-01 and add INST-02..INST-06 in REQUIREMENTS.md — (this commit)
- [ ] Task 3: Rewrite the Objective 72 roadmap entry — next step: Edit the list line, the v1.6 intro paragraph and the `### Objective 72:` section of /Users/justin/dev/devflow-claude/.planning/ROADMAP.md in targeted hunks, then check `git diff -U0 .planning/ROADMAP.md`.

run_state: recorded 2026-10-08T22:24:56.615Z
