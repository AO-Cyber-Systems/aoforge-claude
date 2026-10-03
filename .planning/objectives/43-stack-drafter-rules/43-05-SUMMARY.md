---
objective: 43-stack-drafter-rules
trd: "05"
---

# Objective 43 TRD 05: Multi-stack and manifest-less roots, primary component placement (D3, D6, D2)

## Progress
- [x] Task 1: Literal manifest-less rule and primary-component selection (D3 + D6 selection) — (this commit)
- [ ] Task 2: Primary-component candidates fill root keys; single-component fallback; off_primary gate (D6) — next step: add RED tests 10/11/12 (root candidate beats primary, off_primary gate, D31b with a non-primary component) to plugins/devflow/devflow/bin/lib/stack-draft.test.cjs, then add the off_primary gate for root-area candidates in stack-draft.cjs
- [ ] Task 3: Effective-area facts (D2) and e2e shapes; re-baseline e2e 11

## Interim notes (resume trail)
- Sequencing deviation (Rule 3): removing the lone-sub-area promotion breaks D15c, D17b, e2e 4, e2e 14 and stack-report G2 immediately, so Task 1's GREEN commit also carries primary-candidate placement, the single-component build/test/lint fallback, and the re-baselines of those five tests. Task 2 keeps the off_primary gate and its tests; Task 3 keeps the effective-area facts, e2e 22/23/24 and the e2e 11 check.
- Re-baselined so far: D15c, D17b (stack-draft.test.cjs), e2e 4 and e2e 14 (stack-drafter-e2e.test.cjs), G2 (stack-report.test.cjs, not in the TRD's expected list: it asserted `components: []` for one supported sub-area, which is the replaced promotion).
