---
work: feature
---

# Reconcile and release 3.1.0

## Goal

`main` (objectives 76/77, perf #133), `fix/post-77-verification` (quick 34-39, 3.1.0 version), PR #129 (`feat/stack-profile-loader`: 72-19..75 and the `.aoforge/` move) and objective 78 (shim removal) are one tree on `integrate/3.1.0` (branched from `feat/remove-rename-shims`, merging `fix/post-77-verification` with a merge commit, no rebase), proven green, and released as 3.1.0 through a single PR that supersedes #129. Every push, PR, merge, tag and PR close is a checkpoint that runs only on explicit per-action approval (user decision 2026-10-17).

---
*Created: 2026-10-17 (auto-scaffold via bootstrapObjectiveMd)*
