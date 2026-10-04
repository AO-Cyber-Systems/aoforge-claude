---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN 0788b0c1
- [x] Task 2: decision answer round-trips in local and store mode — RED 84458e03, GREEN 47c806ef
- [ ] Task 3: planning import carries a multi-line resolution to GitHub — RED (this commit); next step: in plugins/devflow/devflow/bin/lib/planning-import.cjs `frontmatterField`, return `extractFrontmatter(text.replace(/\r\n/g, '\n'))[key]` when the captured value matches `/^[|>][+-]?$/`, then `node --test planning-import.test.cjs planning-import-backfill.test.cjs`
