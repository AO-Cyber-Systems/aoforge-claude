---
objective: 59-state-and-merge-plumbing
trd: "01"
subsystem: state-merge
tags: [merge-driver, state-json, plmb-02]
---

# Objective 59 TRD 01: State merge driver Summary (in progress)

## Progress
- [x] Task 1: Fixture builders for state.json, the archive and a hermetic wave repository — 63f5b61c
- [ ] Task 2: mergeStateJson pure 3-way merge (tests 1-10) — RED committed (this commit); next step: write lib/state-merge.cjs (mergeStateJson, canonicalJson) so state-merge.test.cjs goes green, commit `feat(59-01): JSON-aware 3-way merge for state.json`
- [ ] Task 3: df-tools merge-driver state-json | install | uninstall | resolve, then dogfood install (tests 11-20) — next step: after Task 2, write merge-driver-cli.test.cjs with tests 11-20 and run it RED
