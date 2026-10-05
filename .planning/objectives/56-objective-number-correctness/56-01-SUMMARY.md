---
objective: 56-objective-number-correctness
trd: "01"
---

# Objective 56 TRD 01: One regex escape, guarded in CI Summary

## Progress
- [x] Task 1: Hand-built planted fixtures + the regex-escape repo guard (RED) — (this commit)
- [ ] Task 2: Delete the five module-level escapeRe lambdas — next step: in gh-hierarchy.cjs, planning-verbs.cjs, planning-entity-verbs.cjs, frontmatter.cjs and stack-verify.cjs add `const { escapeRegExp } = require('./text-escape.cjs');`, delete `const escapeRe = ...`, rename `escapeRe(` to `escapeRegExp(`; wrap `blockName` in frontmatter.cjs parseMustHavesBlock; add the frontmatter.test.cjs artifacts case; run each module's tests.
- [ ] Task 3: Inline escapes and unescaped interpolations to GREEN
