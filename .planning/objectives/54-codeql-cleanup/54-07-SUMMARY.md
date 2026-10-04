---
objective: 54-codeql-cleanup
trd: "07"
---

# Objective 54 TRD 07: Objective and version regexes in detectors, bootstrap, changelog and the tag hook (checkpoint)

## Progress
- [x] Task 1: novel-domain and trd-pre-check header regexes on objectiveNumPattern — RED c3e0075d, GREEN (this commit)
- [ ] Task 2: project-bootstrap heading and section-bounded Goal lookup — next step: add tests 5-6 to plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs (decimal 04.1-right vs a preceding Objective 401, and 02-nogoal not borrowing the next Goal), run `node --test` on that file to see RED, commit, then edit bootstrapObjectiveMd in project-bootstrap.cjs
- [ ] Task 3: changelog version match via escapeRegExp, plus the tag hook
