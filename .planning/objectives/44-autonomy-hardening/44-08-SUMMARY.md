---
objective: 44-autonomy-hardening
trd: "08"
job: 44-08
status: in-progress
---

# Objective 44 TRD 08: Checkpoint-aware job index and the legacy agent-path CI guard — Summary

Checkpoint. This file is not final until it carries a `## Self-Check` heading.

## Progress

- [x] Task 1 RED: job index checkpoint-aware + XML task_count tests (this commit)
- [ ] Task 1 GREEN: misc.cjs cmdObjectiveJobIndex
- [ ] Task 2 RED: LEGACY agent-path gate tests (doc-refs.repo.test.cjs 11-14)
- [ ] Task 2 GREEN: doc-refs.cjs scanLegacyAgentPaths + LEGACY_AGENT_PATH_RE
- [ ] Validation gates, `npm test`, final SUMMARY with Self-Check

Next step: Task 1 GREEN.
