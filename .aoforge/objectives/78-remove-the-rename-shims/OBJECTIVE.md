---
work: feature
---

# Remove the rename shims

## Goal

The one-release compatibility for pre-rename names is gone in 3.1.0, the release after 3.0.0, as `SHIM_REMOVAL` and the migration guide promised. Only names that must stay (PRESERVE, history) remain, and a project still on the old layout gets a clear message naming the 3.0.x upgrade path instead of silent breakage. Numbered 78 because `main` already uses 76 and 77 (objectives 76/77 landed there on 2026-10-16); this branch is stacked on `feat/stack-profile-loader`.

---
*Created: 2026-10-16 (auto-scaffold via bootstrapObjectiveMd)*
