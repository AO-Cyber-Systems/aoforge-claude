# Objective 43 TRD 10: Primary component and scope in multi-stack roots Summary

## Progress
- [x] Task 1 RED: realshape crossStackPrimaryShape and toolDirectPrimaryShape, B1 unit tests, eden-biz build/test removed from KNOWN_DRIFT — 236ccb04
- [x] Task 1 GREEN: primary component is chosen on build/test/lint evidence; D15c note text and the golden eden-biz fixture re-baselined; politihub test row closed — b4f16027
- [x] Task 2 RED: imageBuildRootShape, B2 tier unit tests, D17d re-baselined, aodex.build and politihub.build removed from KNOWN_DRIFT — 60b61146
- [x] Task 2 GREEN: root and primary candidates are tiered by source, unresolved tiers fall through; eden-libs test/codegen/format and eden-biz e2e_env closed as a side effect — (this commit)
- [ ] Task 3 RED: unitAreas, workspaceRunnerShape, the remaining eden-libs build row removed from KNOWN_DRIFT — next step: add unit-area tests to stack-evidence.test.cjs and workspaceRunnerShape to stack-realshape-fixtures.cjs, remove eden-libs.build from stack-fleet-tables.cjs
- [ ] Task 3 GREEN: workspace root and unit areas
