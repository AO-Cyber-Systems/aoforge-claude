---
objective: 72-install-and-naming-cleanup
trd: "05"
subsystem: tooling
---

# Objective 72 TRD 05: Libs resolve `.aoforge/` first, `.planning/` as fallback Summary

## Progress
- [x] Task 1: Fixture builder: minimal planning trees in every layout — 812d378f
- [ ] Task 2: Contract suite RED, planning pass over bin/**, residuals GREEN — RED committed (this commit); next step: `node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/aoforge/bin --write --report <scratchpad>/planning-libs.json`, then convert the 329 residuals by category until planning-layout.legacy.test.cjs cases 1-4 and 7 pass
- [ ] Task 3: W066 in validate health and the init advisories
