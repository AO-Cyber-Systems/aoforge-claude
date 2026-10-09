---
name: plan-objective
description: |
  Create a detailed execution plan for an objective, breaking it into concrete tasks with success criteria.
  Use when the user wants to plan an objective, create execution plans, or prepare for building.
  Triggers on: "plan objective", "create plans", "plan the next objective", "let's plan", "prepare objective", "make plans for"
argument-hint: "[objective] [--auto] [--research] [--skip-research] [--gaps] [--skip-verify] [--work TYPE] [--tdd POSTURE] [--depth LEVEL] [--model PROFILE]"
agent: planner
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - TaskCreate
  - TaskUpdate
  - WebFetch
  - EnterPlanMode
  - AskUserQuestion
  - mcp__context7__*
---
<objective>
Create executable objective prompts (JOB.md files) for a roadmap objective with integrated research and verification.

**Default flow:** Research (if needed) → Plan → Verify → Review the TRD drafts in plan mode → Done

**Orchestrator role:** Parse arguments, validate objective, research domain (unless skipped), spawn planner, verify with job-checker, iterate until pass or max iterations, present results.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/plan-objective.md
@~/.claude/aoforge/references/ui-brand.md
@~/.claude/aoforge/references/built-ins.md
</execution_context>

<context>
Objective number: $ARGUMENTS (optional — auto-detects next unplanned objective if omitted)

**Flags:**
- `--research` — Force re-research even if RESEARCH.md exists
- `--skip-research` — Skip research, go straight to planning
- `--gaps` — Gap closure mode (reads VERIFICATION.md, skips research)
- `--skip-verify` — Skip verification loop

**Intent override flags** (one-shot overrides for the resolved (kind, work) configuration):
- `--work TYPE` — Override `work` for this objective. Valid: `feature | port | refactor | foundation | bugfix | prototype | spike`
- `--tdd POSTURE` — Override TDD posture: `strict | per-feature | skip`
- `--depth LEVEL` — Override planning depth: `quick | standard | comprehensive`
- `--model PROFILE` — Override model profile: `quality | balanced | budget`

When any intent override flag is set, the planner persists the override to `.aoforge/objectives/<id>/OBJECTIVE.md` so future executor runs honor it.

Normalize objective input in step 2 before any directory lookups.
</context>

<process>
Execute the job-objective workflow from @~/.claude/aoforge/workflows/plan-objective.md end-to-end.
Preserve all workflow gates (validation, research, planning, verification loop, routing).
</process>
