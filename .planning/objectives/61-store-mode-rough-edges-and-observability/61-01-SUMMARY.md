---
objective: 61-store-mode-rough-edges-and-observability
trd: "01"
status: in-progress
---

# Objective 61 TRD 01: Stale checks-workflow pins in validate health and doctor Summary

## Progress
- [x] Task 1: checks-pin.cjs, the pin parser and the stale decision — (this commit)
- [ ] Task 2: validate health Check 17 (W062) — next step: write tests 9-11 in plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs (runHealth capture + installedPluginFn 2.14.0), watch them fail, then add Check 17 after Check 16 in validate.cjs calling checks-pin.collectPinFindings with installedVer || runningVer
- [ ] Task 3: doctor check 26-checks-workflow-pin and the W062 deferral
