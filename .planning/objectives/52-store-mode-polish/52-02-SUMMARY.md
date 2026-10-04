---
objective: 52-store-mode-polish
trd: "02"
status: in-progress
---

# Objective 52 TRD 02: Gate remedies Summary

## Progress
- [x] Task 1: every refusal names both remedies, including under --raw — RED 07e735bb, GREEN (this commit)
- [ ] Task 2: debugger commits through df-tools; CI guard on raw commits in prompts — next step: create plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs scanning fenced code in agents/*.md and skills/*/SKILL.md for raw `git commit` lines (sensitivity case on an in-memory string, skip without README.md), run it to see it fail on agents/debugger.md:404, commit test(52-02)
