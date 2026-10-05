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
- [x] Task 1: Admin bypass in the desired ruleset, satisfies and union; fake reports current_user_can_bypass — RED f88e283b, GREEN eb808dd3
- [ ] Task 2: Printed guidance names the admin-bypass merge; devflow-ref follows a pinned checks_workflow — RED committed (this commit); next step: replace the second guidance string in filesLines of plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs (merge method from client.readConfig) and derive devflow_ref from the checks_workflow @ref in renderTemplates of gh-setup.cjs, then run the four setup test files
