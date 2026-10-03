---
objective: 43-stack-drafter-rules
trd: "05"
---

# Objective 43 TRD 05: Multi-stack and manifest-less roots, primary component placement (D3, D6, D2)

## Progress
- [x] Task 1: Literal manifest-less rule and primary-component selection (D3 + D6 selection) — a7fea63e
- [x] Task 2: Primary-component candidates fill root keys; single-component fallback; off_primary gate (D6) — (this commit)
- [ ] Task 3: Effective-area facts (D2) and e2e shapes; re-baseline e2e 11 — next step: add RED stack-evidence tests 14/15 to plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs and the three e2e builders (manifestlessShellShape, recipeWrapsComponentShape, componentMakefileShape) plus e2e 22/23/24 to the fixtures and stack-drafter-e2e.test.cjs, then implement the pseudo-area and script-dir area in scopeOf in stack-evidence.cjs

## Interim notes (resume trail)
- Sequencing deviation (Rule 3): removing the lone-sub-area promotion breaks D15c, D17b, e2e 4, e2e 14 and stack-report G2 immediately, so Task 1's GREEN commit also carries primary-candidate placement, the single-component build/test/lint fallback, and the re-baselines of those five tests. Task 2 holds the off_primary gate and its tests; Task 3 holds the effective-area facts, e2e 22/23/24 and the e2e 11 check.
- Re-baselined so far: D15c, D17b (stack-draft.test.cjs), e2e 4 and e2e 14 (stack-drafter-e2e.test.cjs), G2 (stack-report.test.cjs, not in the TRD's expected list: it asserted `components: []` for one supported sub-area, which is the replaced promotion).
- D31b needed no change (a go ROOT with a flutter component is a tier root: no primary); D31c was added for the general-root, non-primary case. e2e 11 (ao-terminal-shaped) has a root go.mod and is unchanged.
- Task 2 RED commit ecb160ec: only D17h (off_primary) failed; D17d-i and D31c were regression guards for Task 1's placement and passed at once.
