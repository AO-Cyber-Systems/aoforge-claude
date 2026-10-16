---
objective: 78-remove-the-rename-shims
trd: "04"
subsystem: rename-shims
tags: [rename, shims, stack-mcp, todo-sync, adopt, migration-0010]
---

# Objective 78 TRD 04: Identities in users' files Summary

## Progress
- [x] Task 1: RED — identities are ignored or reported — 326f8932
- [x] Task 2: GREEN — stack-mcp ownership, todo key, hook prefilter, 0010 slug — (this commit)
- [ ] Task 3: GREEN — adopt forgets the pre-rename branch and marker — next step: in plugins/aoforge/aoforge/bin/lib/adopt.cjs delete LEGACY_ADOPT_BRANCH, LEGACY_MARKER_NAME, the legacy_branch_exists fact (EMPTY_GIT_FACTS, gitFacts, preflight facts and report), readMarker's legacy fallback and decideRoute's branchConflict / legacy half of rule 11; rewrite the header and rule comments; run `node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/adopt*.test.cjs`
