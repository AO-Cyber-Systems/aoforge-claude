---
objective: 72-install-and-naming-cleanup
trd: "05"
subsystem: tooling
---

# Objective 72 TRD 05: Libs resolve `.aoforge/` first, `.planning/` as fallback Summary

## Progress
- [x] Task 1: Fixture builder: minimal planning trees in every layout — 812d378f
- [x] Task 2: Contract suite RED, planning pass over bin/**, residuals GREEN — 26c92021 (RED), (this commit) (GREEN)
- [ ] Task 3: W066 in validate health and the init advisories — next step: add cases 5, 6, 7 (W066 part) and 8 to plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs, run them (fail), commit RED; then validate.cjs Check 21 after Check 20, the W066 push in init.cjs's two advisories_warnings builders, and the help.cjs validate entry
