---
objective: 78-remove-the-rename-shims
trd: "02"
subsystem: rename-shims
tags: [rename, pointer-plugin, doc-refs, marketplace]
status: in-progress
---

# Objective 78 TRD 02: Old commands and pointer plugin Summary

## Progress
- [x] Task 1: RED — repo contract for the removal — 0842a2db
- [x] Task 2: GREEN — delete the pointer release and its entries — (this commit)
- [ ] Task 3: GREEN — doc-refs reads the AOForge namespace only — next step: delete NAMESPACE_RENAMES from skill-route.cjs (definition, export, LEGACY import, EX export-lock lists in skill-route.test.cjs), make doc-refs.cjs NAMESPACES = [NAMES.slug] with no DASH_RE/prefix kind/LEGACY import, drop legacy assertions in doc-refs.test.cjs, drop the legacy-names EXEMPT entry in doc-refs.repo.test.cjs, switch /df: fixtures in 0007-doc-refs-fix.test.cjs and doc-staleness.test.cjs to renamed /aoforge: commands, then run the task 3 verify set.
