# Objective 56 TRD 03: Requirement IDs from ID-shaped tokens Summary

## Progress
- [x] Task 1: Hand-built ROADMAP-line fixtures + lib/requirement-ids.cjs — RED a116da63, GREEN 958391e6
- [x] Task 2: verify trd-pre reads requirements through requirement-ids — RED 402d6457, GREEN fed868b9
- [ ] Task 3: objective complete / remove and requirements mark-complete use the same rules — RED (this commit); next step: in objective.cjs complete (~:903-933) use roadmapRequirementIds, in remove (~:765-800) flip the renumber loop to ascending and match Depends-on lines via boldLabelPattern, in misc.cjs :951/:958/:962 wrap reqId in escapeRegExp
