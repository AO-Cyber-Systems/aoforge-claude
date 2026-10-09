---
objective: 72-install-and-naming-cleanup
trd: "22"
subsystem: docs
tags: [docs, rename, planning-docs]
requirements: [INST-06]
---

# Objective 72 TRD 22: Rewrite the active planning docs and CLAUDE.md in AOForge terms Summary

## Progress
- [x] Task 1: PROJECT.md, REQUIREMENTS.md and ROADMAP.md live parts — (this commit)
- [ ] Task 2: STATE.md and CLAUDE.md, and the guard's ignore-region list — next step: Edit `.aoforge/STATE.md` lines 1, 5, 7, 9, 10, 14, 15 and the `df-tools calibrate` blocker (line 235); delete CLAUDE.md lines 5-8 (transition region) and rewrite "Where we left off"; drop `'CLAUDE.md'` from `IGNORE_REGION_FILES` in `rename-guard.repo.test.cjs`; run guard, doc-refs, dispatch-completeness, hook-inventory and the full suite
