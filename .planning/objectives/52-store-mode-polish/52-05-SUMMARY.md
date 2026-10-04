---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN 0788b0c1
- [x] Task 2: decision answer round-trips in local and store mode — RED 84458e03, GREEN (this commit)
- [ ] Task 3: planning import carries a multi-line resolution to GitHub — next step: add tests 52-05 #4/#5 next to the DECISION-001 seed in plugins/devflow/devflow/bin/lib/planning-import.test.cjs, commit RED, then make planning-import.cjs `frontmatterField` read a block-scalar value through extractFrontmatter
