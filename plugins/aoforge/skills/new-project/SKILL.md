---
name: new-project
description: |
  Set up a new project from scratch — asks what you're building, researches the domain, defines requirements, and creates a development roadmap.
  Use when the user wants to start a new project or initialize AOForge for the first time.
  Triggers on: "start a new project", "initialize project", "let's build something new", "set up a new project", "new project"
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - EnterPlanMode
---
<context>
**Flags:**
- `--auto` — Automatic mode. After config questions, runs research → requirements → roadmap without further interaction. Expects idea document via @ reference.
</context>

<objective>
Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

**Creates:**
- `.aoforge/PROJECT.md` — project context
- `.aoforge/config.json` — workflow preferences
- `.aoforge/research/` — domain research (optional)
- `.aoforge/REQUIREMENTS.md` — scoped requirements
- `.aoforge/ROADMAP.md` — objective structure
- `.aoforge/STATE.md` — project memory

**After this command:** Run `/aoforge:plan-objective 1` to start execution.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/new-project.md
@~/.claude/aoforge/references/questioning.md
@~/.claude/aoforge/references/ui-brand.md
@~/.claude/aoforge/references/built-ins.md
@~/.claude/aoforge/templates/project.md
@~/.claude/aoforge/templates/requirements.md
</execution_context>

<process>
Execute the new-project workflow from @~/.claude/aoforge/workflows/new-project.md end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>
