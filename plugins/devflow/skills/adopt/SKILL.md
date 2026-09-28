---
name: adopt
description: |
  Turn an existing repository into a DevFlow project, unattended: map the code, infer PROJECT.md
  and STACK.md, scaffold config/STATE/ROADMAP, add the CLAUDE.md block, and make one recorded
  change on a devflow/adopt branch. Never asks a question — uncertain inferences are written down
  with their confidence and evidence for review.
  Use when the user has an existing repository they want DevFlow set up in, without answering
  setup questions themselves.
  Triggers on: "adopt this repo", "set up devflow here", "bootstrap this repo"
argument-hint: "[path]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Edit
  - Glob
  - Grep
  - Task
---

<objective>
Turn the repository at [path] (default: the current directory) into a DevFlow project, unattended:
map the code, infer PROJECT.md and STACK.md, scaffold config/STATE/ROADMAP (no invented objectives),
add the CLAUDE.md block, stamp the version, and make ONE recorded change on a `devflow/adopt`
branch. Never pushes. Never asks: uncertain inferences go to `.planning/ADOPT-REPORT.md` under
"Needs review". Already a DevFlow project → upgrade. No source code yet → /devflow:new-project.
Dirty tree, rebase/merge in progress, detached HEAD, or not a git repo → stops with the reason,
changes nothing.
</objective>

<execution_context>
@~/.claude/devflow/workflows/adopt.md
@~/.claude/devflow/workflows/map-codebase.md
@~/.claude/devflow/templates/project.md
</execution_context>

<process>
Execute the adopt workflow from @~/.claude/devflow/workflows/adopt.md end-to-end for the target in
$ARGUMENTS. Never call AskUserQuestion.
</process>
