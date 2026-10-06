---
objective: 61-store-mode-rough-edges-and-observability
job: "08"
subsystem: hooks
tags: [hook, UserPromptExpansion, PreToolUse, skill-requires, fail-open]
requires: ["61-02"]
provides:
  - "hooks/gate-skill-requires.js: UserPromptExpansion + PreToolUse(Skill) gate; exports run(input, {env, skillsDir})"
affects: [61-09 dogfood and docs]
---

# Objective 61 TRD 08: The `requires:` gate hook Summary

In progress.

## Progress
- [x] Task 1: gate-skill-requires.js with subprocess and in-process tests — RED 50646283, GREEN (this commit)
- [ ] Task 2: Register on UserPromptExpansion and PreToolUse(Skill), inventory and audit — next step: add the two hooks.json groups, the CLAUDE.md Enforcement bullet and the RUNS entries in planning-writes.audit.test.js
