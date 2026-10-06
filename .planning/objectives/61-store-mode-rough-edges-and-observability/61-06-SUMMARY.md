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
affects: [objective-61 documentation]

key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs

requirements-completed: [STOR-01]
---

# Objective 61 TRD 06: setup dry run pins and PR step Summary

**In progress.**

## Progress
- [x] Task 1: renderPlan prints the workflow pins (tests 1-6) — (this commit)
- [ ] Task 2: A runnable PR-create step in every printed sequence, previewed by the dry run (tests 7-14) — next step: change line 5 of both branchCommitSteps forms in commit-steps.cjs to `  gh pr create --head ${branch} --fill`, after updating tests 6a-6c in commit-steps.test.cjs
