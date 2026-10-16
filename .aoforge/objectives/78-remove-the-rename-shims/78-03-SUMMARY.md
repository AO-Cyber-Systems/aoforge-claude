---
objective: 78-remove-the-rename-shims
trd: "03"
status: checkpoint
---

# Objective 78 TRD 03: GitHub markers and status contexts Summary

## Progress
- [x] Task 1: Fixtures and RED tests for single-namespace readers — 3e558748
- [x] Task 2: GREEN — gh-body, gh-trd, gh-cache read one namespace; gh-rebrand self-contained — (this commit)
- [ ] Task 3: GREEN — one status context, AOForge reconcile line, PR-template refusal — next step: in plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs make `statusContexts` return `[context]`, delete CONTEXT_NAMESPACES, make RECONCILE_LINE_RE AOForge-only; in gh-setup.cjs planPrTemplate return a `conflict` action with `reason: 'legacy-pr-template'` for the pre-rename block; run gh-checks.legacy and gh-markers.legacy tests
