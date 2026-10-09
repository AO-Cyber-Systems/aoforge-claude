---
objective: 72-install-and-naming-cleanup
trd: "05"
subsystem: tooling
---

# Objective 72 TRD 05: Libs resolve `.aoforge/` first, `.planning/` as fallback Summary

## Progress
- [x] Task 1: Fixture builder: minimal planning trees in every layout — 812d378f
- [x] Task 2: Contract suite RED, planning pass over bin/**, residuals GREEN — 26c92021 (RED), 9ba85278 (GREEN)
- [ ] Task 3: W066 in validate health and the init advisories — RED committed (this commit); next step: new lib/planning-layout.cjs (`legacyPlanningIssue(root)`), validate.cjs Check 21 after Check 20, the W066 push in init.cjs's two advisories_warnings builders, the help.cjs validate entry; then rerun planning-layout.legacy.test.cjs, validate.test.cjs, init.test.cjs
