---
objective: 61-store-mode-rough-edges-and-observability
job: "06"
subsystem: gh-setup
tags: [gh-setup, dry-run, workflow-pins, commit-steps, pull-request]

requires:
  - objective: 61-01
    provides: checks-pin.cjs parseWorkflowPins, the one reader of the workflow's uses:/devflow-ref: lines
provides:
  - "gh-setup planWorkflow attaches pins / previous_pins; renderPlan prints them"
  - "commit-steps.branchCommitSteps ends both forms with a runnable gh pr create --head <branch> --fill"
  - "gh-setup-cli dry run previews the follow-up steps (filesLines preview form)"
affects: [objective-61 documentation]

key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/commit-steps.cjs
    - plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
    - plugins/devflow/skills/gh-sync/SKILL.md

requirements-completed: [STOR-01]
---

# Objective 61 TRD 06: setup dry run pins and PR step Summary

**In progress.**

## Progress
- [x] Task 1: renderPlan prints the workflow pins (tests 1-6) — RED f7deebe4, GREEN feb1b442
- [x] Task 2: A runnable PR-create step in every printed sequence, previewed by the dry run (tests 7-14) — RED f20b8d34, GREEN (this commit)
