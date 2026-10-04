# Objective 54 TRD 06: Objective-number regexes in objective.cjs, roadmap.cjs, workstreams.cjs (in progress)

## Progress
- [x] Task 1 RED: failing tests for roadmap analyze and workstreams analyze — ee583e5e
- [x] Task 1 GREEN: roadmap.cjs and workstreams.cjs on objectiveNumPattern — b2933690
- [x] Task 2 RED: objective.test.cjs items 4-7 (4 and 5 fail, 6 and 7 are regression guards) — (this commit)
- [ ] Task 2 GREEN: objective.cjs on the shared helper — next step: in objective.cjs import `{ escapeRegExp, objectiveNumPattern }` from ./text-escape.cjs, delete the local escapeRegExp at ~:1069, swap :742 and :876 to objectiveNumPattern, delete dead `objectiveEscaped` at :883, replace the :902-905 lookup with the section-anchored one, wrap reqId in escapeRegExp at :914 and :919; run `node --test` on objective.test.cjs, objective-branch.test.cjs and text-escape.test.cjs
