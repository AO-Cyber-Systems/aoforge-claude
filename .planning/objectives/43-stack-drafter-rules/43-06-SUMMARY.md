---
objective: 43-stack-drafter-rules
trd: "06"
status: in-progress
---

# Objective 43 TRD 06: Golden equivalence for all 11 override shapes (in progress)

## Progress
- [x] Task 1: Golden fixtures and equivalence suite (RED) — 71acf0f0
- [x] Task 2: Close residual divergences with general rules (GREEN) — 84588fa0, 54da814b, 030ed34c, b884752b, caddcd4e, fa8d62be, fb7f561a, 6fce7ec9, 9658a0df, 9e2a17e7, 77614b14
- [x] Task 3: Docs and the full suite — (this commit)

## Status after Task 2

All 11 goldens pass; `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs plugins/devflow/devflow/bin/lib/adopt-*.test.cjs`
is 1195/1195. HAND_ONLY grew by 10 non-canonical, author-named keys (pending user acceptance at 43-07).

Next step: write the final SUMMARY with `summary post 43-06`, then STATE.md and `roadmap update-job-progress 43`.
