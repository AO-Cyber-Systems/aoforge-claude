---
name: map-codebase
description: |
  Analyze an existing codebase to understand its stack, architecture, conventions, and concerns before starting new work.
  Use when the user wants to understand, analyze, or map an existing codebase.
  Triggers on: "understand this codebase", "map the code", "analyze architecture", "what does this codebase look like?", "explore the code structure"
argument-hint: "[optional: specific area to map, e.g., 'api' or 'auth'] [--non-interactive]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Task
  - AskUserQuestion
  - mcp__gopls__*
  - mcp__dart__*
---

<objective>
Analyze existing codebase using parallel codebase-mapper agents to produce structured codebase documents, then synthesize a prescriptive CLAUDE.md.

Each mapper agent explores a focus area and **writes its documents to drafts itself** (`df-tools planning draft codebase/<NAME>.md` prints each path). The orchestrator only receives confirmations, publishes each draft in one sequential pass with `df-tools doc put codebase/<NAME>.md --from <draft>`, then reads the 8 docs to generate CLAUDE.md with coding rules that Claude Code auto-loads every session.

Output: .planning/codebase/ folder with 8 structured documents + CLAUDE.md at project root.
</objective>

<execution_context>
@~/.claude/devflow/workflows/map-codebase.md
</execution_context>

<context>
Focus area: $ARGUMENTS (optional - if provided, tells agents to focus on specific subsystem)

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /devflow:new-project (brownfield codebases) - creates codebase map first
- After /devflow:new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use map-codebase for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (ask Refresh / Update / Skip with AskUserQuestion, as map-codebase.md does)
2. Resolve draft paths (`df-tools planning draft codebase/<NAME>.md`); nothing is created under `.planning/` by hand
3. Spawn 4 parallel codebase-mapper agents, each writing drafts only:
   - Agent 1: tech focus → STACK.md, INTEGRATIONS.md drafts
   - Agent 2: arch focus → ARCHITECTURE.md, STRUCTURE.md drafts
   - Agent 3: quality focus → CONVENTIONS.md, TESTING.md, PATTERNS.md drafts
   - Agent 4: concerns focus → CONCERNS.md draft
4. Wait for agents to complete, collect confirmations (NOT document contents)
5. Verify all 8 drafts exist with line counts, check them for secrets, then publish each one in turn:
   `node ~/.claude/devflow/bin/df-tools.cjs doc put codebase/<NAME>.md --from <draft>`
6. Synthesize CLAUDE.md from all 8 docs (prescriptive coding rules, marker-based merge)
7. Commit codebase map + CLAUDE.md
8. Offer next steps (typically: /devflow:new-project or /devflow:plan-objective)
</process>

<success_criteria>
- [ ] All 8 codebase drafts written by mapper agents
- [ ] Each draft published by the orchestrator with `doc put codebase/<NAME>.md`, one at a time
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] CLAUDE.md generated at project root with prescriptive coding rules
- [ ] CLAUDE.md uses versioned `<!-- DEVFLOW:START v=… src=claude-md -->` / `<!-- DEVFLOW:END -->` markers (preserves user content on re-run)
- [ ] User knows next steps
</success_criteria>
