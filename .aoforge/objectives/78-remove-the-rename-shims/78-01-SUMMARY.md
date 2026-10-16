---
objective: 78-remove-the-rename-shims
trd: "01"
subsystem: planning-layout
status: checkpoint
---

# Objective 78 TRD 01: Legacy-layout detectors and the one message Summary

## Progress
- [x] Task 1: Fixture builders for the 3.1 legacy layouts — b614aa00
- [x] Task 2: Detectors in planning-layout.cjs (independent of compat) — RED 33914301, GREEN (this commit)
- [ ] Task 3: Reporters — validate health, doctor 27/22, doctor project resolution, help text — next step: rewrite planning-layout.legacy.test.cjs cases 5-6 and add CLI cases 1-4 (validate health broken / both / W067 / W069), rewrite 27-legacy-planning-layout.legacy.test.cjs for cases 5-6 (doctor note, check 27 W066-both/W067/W069, check 22 defers W069), run red, commit RED
