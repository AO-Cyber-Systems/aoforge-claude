---
objective: 55-store-live-smoke-fixes
job: "05"
subsystem: github-store
tags: [planning-verbs, gh-pr, reconcile, objective-branch]
---

# Objective 55 TRD 05: objective put hint and reconcile by content Summary

(in progress)

## Progress
- [x] Task 1: Unknown-objective error names `objective add` — 3a23215a (RED), d5e56ae9 (GREEN)
- [ ] Task 2: Reconcile deletes a non-ancestor branch whose content is already on the default branch — (RED this commit) next step: add `contentMerged(root, tip, into)` to objective-branch.cjs (export it), then the fallback in gh-pr.cjs reconcileLocal's `!anc.ancestor` branch
