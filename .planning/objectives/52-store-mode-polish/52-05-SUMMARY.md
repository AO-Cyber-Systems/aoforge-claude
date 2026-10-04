---
objective: 52-store-mode-polish
trd: "05"
status: in-progress
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact (checkpoint)

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN 0788b0c1
- [x] Task 2: decision answer round-trips in local and store mode — RED 84458e03, GREEN 47c806ef
- [x] Task 3: planning import carries a multi-line resolution to GitHub — RED daa8b1b0, GREEN (this commit)
- [ ] Post-TRD verification — next step: run the `npm test` gate and the planner's scratch-dir reproduction (decision open, decision answer --from a 4-line file, extractFrontmatter), then `summary post 52-05`
