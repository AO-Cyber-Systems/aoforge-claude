---
name: help
description: |
  Show available AOForge commands and usage guide.
  Use when the user asks about AOForge capabilities, available commands, or how to use the system.
  Triggers on: "what can you do?", "how do I use AOForge?", "show commands", "aoforge help", "what commands are available?"
---
<objective>
Display the complete AOForge command reference.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<execution_context>
@~/.claude/aoforge/workflows/help.md
</execution_context>

<process>
Output the complete AOForge command reference from @~/.claude/aoforge/workflows/help.md.
Display the reference content directly — no additions or modifications.
</process>
