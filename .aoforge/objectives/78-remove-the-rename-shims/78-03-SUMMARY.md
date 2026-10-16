---
objective: 78-remove-the-rename-shims
trd: "03"
status: checkpoint
---

# Objective 78 TRD 03: GitHub markers and status contexts Summary

## Progress
- [x] Task 1: Fixtures and RED tests for single-namespace readers — (this commit)
- [ ] Task 2: GREEN — gh-body, gh-trd, gh-cache read one namespace; gh-rebrand self-contained — next step: in plugins/aoforge/aoforge/bin/lib/gh-body.cjs set `NS` to the AOForge namespace only, delete LEGACY_LINE_RE, the legacy SECTION_FORMS entry, respellPair and the legacy branches of withCommentMarker/mergeManaged; then gh-trd.cjs and gh-cache.cjs `NS`; run gh-rebrand.legacy.test.cjs
- [ ] Task 3: GREEN — one status context, AOForge reconcile line, PR-template refusal
