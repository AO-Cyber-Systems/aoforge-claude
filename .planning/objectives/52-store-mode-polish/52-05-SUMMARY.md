---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN (this commit)
- [ ] Task 2: decision answer round-trips in local and store mode — next step: commit the RED tests 52-05 #1-#3 in plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs, then normalise `choice` (CRLF, trimEnd) in decision-queue.cjs resolveDecision and run `node --test planning-entity-verbs.test.cjs decision-queue.test.cjs planning-verbs-cli.test.cjs`
- [ ] Task 3: planning import carries a multi-line resolution to GitHub
