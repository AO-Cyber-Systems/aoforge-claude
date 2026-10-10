---
objective: 74-operations-decisions
trd: "01"
---

# Objective 74 TRD 01: The live visual judge job in CI Summary

## Progress
- [x] Task 1: Capture the real docs screenshots and write the fixture builders — 7a2a07ee
- [x] Task 2: scripts/ci-visual-judge.cjs, the assertion that the live model really looked — edccaca6 (RED), bb00d077 (GREEN)
- [ ] Task 3: .github/workflows/visual-judge.yml, held to the read-only permissions guard — next step: add 'visual-judge.yml' to READ_ONLY_WORKFLOWS in scripts/workflow-permissions.test.cjs, run `node --test scripts/workflow-permissions.test.cjs` to see it fail (ENOENT), commit RED with only that file
