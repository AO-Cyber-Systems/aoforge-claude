---
objective: 72-install-and-naming-cleanup
trd: "12"
subsystem: compat
tags: [rename, legacy-shims, inst-03]
---

# Objective 72 TRD 12: File-level legacy identities Summary

## Progress
- [x] Task 1: Fixture builder: legacy identities in user files — c2532f20
- [x] Task 2: MCP ownership and todo metadata read both keys — d66a8787 (RED), (this commit) (GREEN)
- [ ] Task 3: User dot files and the legacy adopt branch — next step: add tests 4-8 to file-identities.legacy.test.cjs (config-ensure-section and init new-project spawned with HOME = legacyDotHome; watcher-state/allowlist in-process with HOME set; adopt.preflight on legacyAdoptRepo), run red, commit RED
