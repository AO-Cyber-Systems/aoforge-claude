---
objective: 78-remove-the-rename-shims
trd: "02"
subsystem: rename-shims
tags: [rename, pointer-plugin, doc-refs, marketplace]
status: in-progress
---

# Objective 78 TRD 02: Old commands and pointer plugin Summary

## Progress
- [x] Task 1: RED — repo contract for the removal — (this commit)
- [ ] Task 2: GREEN — delete the pointer release and its entries — next step: `git rm -r plugins/devflow` plus the three gen-pointer files, drop the marketplace entry and the package.json glob, delete the four pointer ALLOW entries in rename-guard.repo.test.cjs (synthetic span entry for 9a-9c), single manifest in changelog-on-tag.js, then run old-commands/rename-guard/changelog-on-tag/ci-unit-gate tests.
- [ ] Task 3: GREEN — doc-refs reads the AOForge namespace only
