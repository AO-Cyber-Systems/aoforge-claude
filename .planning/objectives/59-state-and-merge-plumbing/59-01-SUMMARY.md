---
objective: 59-state-and-merge-plumbing
trd: "01"
subsystem: state-merge
tags: [merge-driver, state-json, plmb-02]
---

# Objective 59 TRD 01: State merge driver Summary (in progress)

## Progress
- [x] Task 1: Fixture builders for state.json, the archive and a hermetic wave repository — 63f5b61c
- [x] Task 2: mergeStateJson pure 3-way merge (tests 1-10) — RED 3e1b22d9, GREEN 52810aff
- [ ] Task 3: df-tools merge-driver state-json | install | uninstall | resolve, then dogfood install (tests 11-20) — RED committed (this commit); next step: write lib/merge-driver-cli.cjs (cmdMergeDriver, driverCommand, driverBinPath), add the `case 'merge-driver':` arm to df-tools.cjs and HELP_TABLE['merge-driver'] to help.cjs, run the 4 scoped test files, commit `feat(59-01): df-tools merge-driver ...`, then dogfood install
