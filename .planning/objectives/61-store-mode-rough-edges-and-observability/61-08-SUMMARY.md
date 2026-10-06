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
- [x] Task 2: Register on UserPromptExpansion and PreToolUse(Skill), inventory and audit — (this commit)
- [ ] Finish: complete the SUMMARY sections, self-check, `summary post`, state commands, requirements mark-complete STOR-04 — next step: run `df-tools summary post 61-08 --from <draft>`
