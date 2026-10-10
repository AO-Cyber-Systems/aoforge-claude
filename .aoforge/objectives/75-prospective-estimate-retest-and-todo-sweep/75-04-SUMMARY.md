---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-04"
subsystem: todos
tags: [todo-sweep, todo-01, disposition, planning-records]
requires:
  - objective: 75-prospective-estimate-retest-and-todo-sweep
    provides: "75-01 retest verdict and follow-up todo, 75-02 upgrade fixes, 75-03 reconcile fix"
provides:
  - "Four todos completed through todo complete, each with a Resolution section citing checkable evidence"
  - "Every other pending todo carries disposition fields and a Disposition section"
  - "75-TODO-SWEEP.md: the sweep table and the SC-4 check output"
affects: [75-05-coverage-and-close-out]
key-files:
  created: []
  modified:
    - .aoforge/todos/pending/
    - .aoforge/todos/completed/
requirements-completed: []

duration: "in progress"
completed: 2026-10-10
---

# Objective 75 TRD 04: Sweep every pending todo (TODO-01) Summary

In progress.

## Progress
- [x] Task 1: Inventory, evidence and completions — (this commit)
- [ ] Task 2: Re-scope the rest with a recorded reason and target, then publish the sweep table — next step: draft each of the ten remaining pending todos with `planning draft todos/pending/<stem>.md`, add the five disposition fields and a `## Disposition (objective 75, 2026-10-10)` section, and write each back with `todo add --stem`
