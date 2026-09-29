---
objective: 44-autonomy-hardening
trd: "02"
status: in-progress
---

# Objective 44 TRD 02: Drop legacy agent-path reads; synthesizer returns text; planner gets Edit (in progress)

## Progress

- [x] Task 1: Removed every legacy `~/.claude/agents/<name>.md` read instruction (plan-objective x3, quick x1, new-project x4, security-audit bullet + 3 prompts, research-objective x2 switched to typed `objective-researcher`). doc-refs/agent-tools/skill-route: 120/120 pass.
- [x] Task 2: Synthesizer returns marked text (`tools: Read, Bash`); new-project/new-milestone extract, Write and commit SUMMARY.md; planner `tools:` gains Edit. agent-tools/model-profiles/doc-refs/skill-route: 136/136 pass.
- [ ] Full `npm test` + final SUMMARY.
