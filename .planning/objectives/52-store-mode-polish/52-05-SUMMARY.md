---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [ ] Task 1: block scalars in the shared frontmatter serializer and parser — RED (this commit); next step: GREEN in plugins/devflow/devflow/bin/lib/frontmatter.cjs — `|-` emit in reconstructFrontmatter (top level + nested subval) and block-scalar collection in extractFrontmatter, then `node --test frontmatter.test.cjs decision-queue.test.cjs`
- [ ] Task 2: decision answer round-trips in local and store mode
- [ ] Task 3: planning import carries a multi-line resolution to GitHub
