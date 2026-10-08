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
- [x] Task 1: Check 23 over skill-marker-health (tests 1-8) — 8d38a342 (RED 916826c8)
- [x] Task 2: Check 22 defers E006/W064 and counts only its own repairs (tests 9-11) — (this commit) (RED 916826c8 for test 9, 7cebaca1 for tests 10-11)
