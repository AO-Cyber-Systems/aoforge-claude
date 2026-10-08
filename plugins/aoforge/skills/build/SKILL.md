---
name: build
description: |
  Build a feature from start to finish — plans the work, executes it, and verifies the result in one command.
  Use when the user wants to build something, implement a feature, or work on an objective end-to-end.
  Triggers on: "build this", "build objective", "let's build", "implement this", "ship this", "make this work", "build the", "work on objective", "start building", "let's implement"
argument-hint: "<objective-number-or-description> [--pause] [--skip-research] [--work TYPE] [--tdd POSTURE] [--depth LEVEL] [--model PROFILE]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, EnterPlanMode
---

<objective>
Build an objective from start to finish: research → plan → execute → verify → done.

This is the primary way to build with AOForge. One command, shipped code.

Usage:
- `/aoforge:build 3` — Build objective 3 from the roadmap
- `/aoforge:build "add user authentication"` — Build from description (creates temporary objective if no match)
- `/aoforge:build 3 --pause` — Stop between phases for review
- `/aoforge:build 3 --skip-research` — Skip research phase
- `/aoforge:build 3 --work refactor` — Override the resolved work type for this objective
- `/aoforge:build 3 --tdd skip` — Override TDD posture (use sparingly; documents itself in OBJECTIVE.md)

**Intent override flags** are forwarded to the planner phase and persisted in OBJECTIVE.md so the executor honors them. See `/aoforge:plan-objective` for full enum values.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/build.md
@~/.claude/aoforge/references/ui-brand.md
@~/.claude/aoforge/references/built-ins.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/config.json
</context>
