---
objective: 78-remove-the-rename-shims
trd: "09"
subsystem: github-integration
status: checkpoint
---

# Objective 78 TRD 09: GitHub label lookups use one label; an un-rebranded repository stops with the fix Summary

## Progress
- [x] Task 1: RED + GREEN — the rebrand check module — (this commit)
- [ ] Task 2: RED + GREEN — store and mirror lookups — next step: rewrite the 72-11 twin cases in gh-issue.test.cjs (SCAN_LISTS 1, twin -> refusal), gh-markers.legacy.test.cjs section 7 and gh-outbox.test.cjs to cases 1, 2, 3, 5, add the `repos/o/r/labels/<name>` GET route to __fixtures__/gh-fake.cjs, commit RED, then call checkRebranded in gh-issue/gh-cache/gh-hierarchy/gh-outbox-flush
- [ ] Task 3: RED + GREEN — checks lookup, in-progress label, gh-body helpers removed
