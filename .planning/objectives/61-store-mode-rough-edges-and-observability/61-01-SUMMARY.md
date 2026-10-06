---
objective: 61-store-mode-rough-edges-and-observability
trd: "01"
status: in-progress
---

# Objective 61 TRD 01: Stale checks-workflow pins in validate health and doctor Summary

## Progress
- [x] Task 1: checks-pin.cjs, the pin parser and the stale decision — 25e70912
- [x] Task 2: validate health Check 17 (W062) — (this commit)
- [ ] Task 3: doctor check 26-checks-workflow-pin and the W062 deferral — next step: write tests 12-15 in plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs (makeDoctorHome + makeInstalledPlugin 2.14.0 + makeDoctorProject), pin DEFERRED with W062 in 21-22-project.test.cjs, watch them fail, then create 26-checks-workflow-pin.cjs over checks-pin.collectPinFindings and add W062 to DEFERRED in 22-validate-health.cjs
