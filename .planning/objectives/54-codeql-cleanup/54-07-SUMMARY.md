---
objective: 54-codeql-cleanup
trd: "07"
---

# Objective 54 TRD 07: Objective and version regexes in detectors, bootstrap, changelog and the tag hook (checkpoint)

## Progress
- [x] Task 1: novel-domain and trd-pre-check header regexes on objectiveNumPattern — RED c3e0075d, GREEN 0294c935
- [x] Task 2: project-bootstrap heading and section-bounded Goal lookup — RED b15737d5, GREEN (this commit)
- [ ] Task 3: changelog version match via escapeRegExp, plus the tag hook — next step: create plugins/devflow/devflow/bin/lib/changelog.test.cjs (node:test, mkdtemp per test, items 8-12 on hasVersionEntry), run `node --test` on it to see item 8 RED, commit, then import escapeRegExp in changelog.cjs and in hooks/changelog-on-tag.js
