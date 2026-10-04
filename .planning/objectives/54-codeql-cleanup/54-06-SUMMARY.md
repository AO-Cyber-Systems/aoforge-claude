# Objective 54 TRD 06: Objective-number regexes in objective.cjs, roadmap.cjs, workstreams.cjs (in progress)

## Progress
- [x] Task 1 RED: failing tests for roadmap analyze and workstreams analyze — (this commit)
- [ ] Task 1 GREEN: roadmap.cjs and workstreams.cjs on objectiveNumPattern — next step: add `const { objectiveNumPattern } = require('./text-escape.cjs');` to roadmap.cjs and workstreams.cjs and replace the escapes at roadmap.cjs:105, :146, :281, :380 and workstreams.cjs:48, :357, :363, :397; run `node --test` on roadmap.test.cjs and workstreams.test.cjs
- [ ] Task 2: objective.cjs on the shared helper; section-anchored, escaped Requirements update
