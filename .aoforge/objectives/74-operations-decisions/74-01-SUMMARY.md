---
objective: 74-operations-decisions
trd: "01"
---

# Objective 74 TRD 01: The live visual judge job in CI Summary

## Progress
- [x] Task 1: Capture the real docs screenshots and write the fixture builders — 7a2a07ee
- [ ] Task 2: scripts/ci-visual-judge.cjs, the assertion that the live model really looked — next step: write test case 1 (no credential, exitCode 1, spawn never called) in scripts/ci-visual-judge.test.cjs, run `node --test scripts/ci-visual-judge.test.cjs` to see it fail, commit RED with only the test file
- [ ] Task 3: .github/workflows/visual-judge.yml, held to the read-only permissions guard
