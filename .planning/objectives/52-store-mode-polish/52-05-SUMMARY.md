---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN 0788b0c1
- [ ] Task 2: decision answer round-trips in local and store mode — RED (this commit); next step: GREEN in plugins/devflow/devflow/bin/lib/decision-queue.cjs resolveDecision — `const text = String(choice).replace(/\r\n/g, '\n').trimEnd()` for the options check and `fm.resolution`, then `node --test planning-entity-verbs.test.cjs decision-queue.test.cjs planning-verbs-cli.test.cjs`
- [ ] Task 3: planning import carries a multi-line resolution to GitHub
