# Objective 43 TRD 10: Primary component and scope in multi-stack roots Summary

## Progress
- [x] Task 1 RED: realshape crossStackPrimaryShape and toolDirectPrimaryShape, B1 unit tests, eden-biz build/test removed from KNOWN_DRIFT — 236ccb04
- [x] Task 1 GREEN: primary component is chosen on build/test/lint evidence; D15c note text and the golden eden-biz fixture re-baselined; politihub test row closed — b4f16027
- [x] Task 2 RED: imageBuildRootShape, B2 tier unit tests, D17d re-baselined, aodex.build and politihub.build removed from KNOWN_DRIFT — (this commit)
- [ ] Task 2 GREEN: tiered root/primary placement with fall-through — next step: in plugins/devflow/devflow/bin/lib/stack-draft.cjs split the rootByKey/primaryByKey buckets into tiers 1-4 and factor the per-key pipeline (from `parentEntry` to `entry`) into a function run once per tier
- [ ] Task 3 RED: unitAreas, workspaceRunnerShape, four eden-libs rows removed from KNOWN_DRIFT
- [ ] Task 3 GREEN: workspace root and unit areas
