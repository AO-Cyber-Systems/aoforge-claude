---
objective: 68-milestone-and-objective-verbs
trd: "03"
subsystem: tooling
tags: [df-tools, dispatcher, flag-guard, TOOL-01]
requirements: [TOOL-01]
---

# Objective 68 TRD 03: Writing commands reject an unknown flag (guard and the planning writers) Summary

Work in progress; this checkpoint is replaced by the final SUMMARY.

## Progress
- [x] Task 1: Probe-project fixture and PROBES table — (this commit)
- [ ] Task 2: The pure checker (tests 1-13) — next step: write plugins/devflow/devflow/bin/lib/flag-guard.test.cjs with tests 1-13 against a unit-only spec, run it RED, commit, then write flag-guard.cjs
- [ ] Task 3: Group-1 spec and dispatcher wiring (tests 14-18) — next step: write flag-guard-cli.test.cjs tests 14-18 RED, then lib/flag-spec.cjs and the checkFlags call in df-tools.cjs main()
