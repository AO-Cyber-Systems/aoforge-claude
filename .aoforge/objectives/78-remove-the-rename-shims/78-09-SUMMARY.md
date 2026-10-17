---
objective: 78-remove-the-rename-shims
trd: "09"
subsystem: github-integration
status: checkpoint
---

# Objective 78 TRD 09: GitHub label lookups use one label; an un-rebranded repository stops with the fix Summary

## Progress
- [x] Task 1: RED + GREEN — the rebrand check module — 1f6c8dc4 (RED), 5abc90b0 (GREEN)
- [x] Task 2: RED + GREEN — store and mirror lookups — a0a721eb (RED), 6a72e793 (GREEN)
- [x] Task 3: RED + GREEN — checks lookup, in-progress label, gh-body helpers removed — dd88a0f9 (RED), (this commit)
- [ ] Close-out — next step: run the full suite (minus watcher-shell.test.cjs) with node_modules symlinked, then finish this SUMMARY, self-check, tokens stamp, summary post, state advance-job --objective 78, roadmap update-job-progress 78
