---
objective: 69-drafts-health-and-doctor
trd: "04"
subsystem: doctor
tags: [doctor, skill-active, edit-gate, validate-health, doctor-git]
requirements-completed: [TOOL-09]
---

# Objective 69 TRD 04: Doctor owns the skill-marker codes Summary

Doctor check 23 now runs on `skill-marker-health.cjs`: a tracked `.planning/.skill-active` is an error (E006) with a guarded untrack-and-remove fix, and check 22 defers E006/W064 and counts only its own repairs.

## Progress
- [x] Task 1: Check 23 over skill-marker-health (tests 1-8) — (this commit)
- [ ] Task 2: Check 22 header comment and README ownership row — next step: edit the header comment list and `fixable when` line in 22-validate-health.cjs, then the 20-29 row in doctor-checks/README.md
