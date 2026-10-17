---
objective: 78-remove-the-rename-shims
trd: "09"
subsystem: github-integration
status: checkpoint
---

# Objective 78 TRD 09: GitHub label lookups use one label; an un-rebranded repository stops with the fix Summary

## Progress
- [x] Task 1: RED + GREEN — the rebrand check module — 1f6c8dc4 (RED), 5abc90b0 (GREEN)
- [x] Task 2: RED + GREEN — store and mirror lookups — a0a721eb (RED), (this commit)
- [ ] Task 3: RED + GREEN — checks lookup, in-progress label, gh-body helpers removed — next step: flip gh-markers.legacy.test.cjs section 8 and planning-verbs-pr.test.cjs IN_PROGRESS_FORMS to `[aoforge:in-progress]`, add a gh-check-cli findObjectiveIssue twin case (gh-checks.legacy.test.cjs) and a gh-body "no twin helpers" case, commit RED, then switch gh-check-cli/planning-verbs to checkRebranded / `[label]` and delete the gh-body label helpers
