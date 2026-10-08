---
name: adopt
description: |
  Turn an existing repository into an AOForge project, unattended: map the code, infer PROJECT.md
  and STACK.md, scaffold config/STATE/ROADMAP, add the CLAUDE.md block, and make one recorded
  change on an aoforge/adopt branch. Never asks a question — uncertain inferences are written down
  with their confidence and evidence for review.
  Use when the user has an existing repository they want AOForge set up in, without answering
  setup questions themselves.
  Triggers on: "adopt this repo", "set up aoforge here", "bootstrap this repo"
argument-hint: "[path]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Edit
  - Glob
  - Grep
  - Task
  - mcp__gopls__*
  - mcp__dart__*
disallowed-tools:
  - AskUserQuestion
---

<objective>
Turn the repository at [path] (default: the current directory) into an AOForge project, unattended:
map the code, infer PROJECT.md and STACK.md, scaffold config/STATE/ROADMAP (no invented objectives),
add the CLAUDE.md block, stamp the version, and make ONE recorded change on an `aoforge/adopt`
branch. Never pushes. Never asks: uncertain inferences go to `.planning/ADOPT-REPORT.md` under
"Needs review". Already an AOForge project → upgrade. No source code yet → /aoforge:new-project.
Dirty tree, rebase/merge in progress, detached HEAD, or not a git repo → stops with the reason,
changes nothing.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/adopt.md
@~/.claude/aoforge/workflows/map-codebase.md
@~/.claude/aoforge/templates/project.md
</execution_context>

<process>
Execute the adopt workflow from @~/.claude/aoforge/workflows/adopt.md end-to-end for the target in
$ARGUMENTS. Never call AskUserQuestion.
</process>
