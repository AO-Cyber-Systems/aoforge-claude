---
objective: 55-store-live-smoke-fixes
job: "01"
subsystem: gh-setup
tags: [github, rulesets, bypass, gh-setup, workflow-pin]
requirements-completed: []
started: 2026-10-05T11:56:00Z
---

# Objective 55 TRD 01: setup ruleset bypass and pin Summary

IN PROGRESS (checkpoint, not complete).

## Progress
- [ ] Task 1: Admin bypass in the desired ruleset, satisfies and union; fake reports current_user_can_bypass — RED committed (this commit); next step: add ADMIN_BYPASS and isAdminBypass to plugins/devflow/devflow/bin/lib/gh-setup.cjs, wire desiredRuleset, rulesetSatisfies and unionRuleset, then run the three setup test files
- [ ] Task 2: Printed guidance names the admin-bypass merge; devflow-ref follows a pinned checks_workflow
