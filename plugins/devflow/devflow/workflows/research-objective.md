---
status: active
---
<purpose>
Research how to implement an objective. Spawns objective-researcher with objective context.

Standalone research command. For most workflows, use `/devflow:plan-objective` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

@~/.claude/devflow/references/model-profile-resolution.md

Resolve model for:
- `objective-researcher`

## Step 1: Normalize and Validate Objective

@~/.claude/devflow/references/objective-argument-parsing.md

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls .planning/objectives/${OBJECTIVE}-*/RESEARCH.md 2>/dev/null
```

If exists, ask:

```
AskUserQuestion([
  {
    header: "Research",
    question: "RESEARCH.md already exists for this objective. What next?",
    multiSelect: false,
    options: [
      { label: "View existing (Recommended)", description: "Show the current research" },
      { label: "Update research", description: "Re-run the researcher and replace it" },
      { label: "Skip", description: "Keep it and stop" }
    ]
  }
])
```

- **View existing:** display RESEARCH.md and stop.
- **Update research:** continue to Step 3.
- **Skip:** stop.

## Step 3: Gather Objective Context

```bash
# Objective section from roadmap (already loaded in OBJECTIVE_INFO)
echo "$OBJECTIVE_INFO" | jq -r '.section'
cat .planning/REQUIREMENTS.md 2>/dev/null
cat .planning/objectives/${OBJECTIVE}-*/*-CONTEXT.md 2>/dev/null
# Decisions from state-snapshot (structured JSON)
node ~/.claude/devflow/bin/df-tools.cjs state-snapshot | jq '.decisions'
```

## Step 4: Spawn Researcher

```
Task(
  prompt="<objective>
Research implementation approach for Objective {objective}: {name}
</objective>

<context>
Objective description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Objective context: {context_md}
</context>

<output>
Publish `objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md` (relative to `.planning/`) as your Step 5 says:
`node ~/.claude/devflow/bin/df-tools.cjs planning draft <that path>`, Write the draft, then
`node ~/.claude/devflow/bin/df-tools.cjs doc put <that path> --from <draft>`.
</output>",
  subagent_type="objective-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

**`## RESEARCH COMPLETE`:** Display the summary, then ask:

```
AskUserQuestion([
  {
    header: "Next step",
    question: "Research for Objective {objective} is complete. What next?",
    multiSelect: false,
    options: [
      { label: "Plan objective (Recommended)", description: "Plan it with /devflow:plan-objective {objective}" },
      { label: "Dig deeper", description: "Continue the research on an area you name" },
      { label: "Review full", description: "Show the full RESEARCH.md" },
      { label: "Done", description: "Stop here" }
    ]
  }
])
```

- **Plan objective:** point the user to `/devflow:plan-objective {objective}`.
- **Dig deeper:** ask in plain prose which area to dig into, then spawn a continuation researcher with that focus.
- **Review full:** display RESEARCH.md.
- **Done:** stop.

**`## CHECKPOINT REACHED`:** Present the checkpoint to the user, then spawn a continuation researcher with the response.
- **checkpoint:decision:** ask with AskUserQuestion, header "Checkpoint", the checkpoint's question and its options (label: option name, description: its pros and cons). Up to 4 options become the AskUserQuestion options; with more than 4, print the numbered list, offer the first 4, and say the user may type a number under Other.
- **Any other checkpoint type:** the response is free text; ask for it in plain prose.

**`## RESEARCH INCONCLUSIVE`:** Show what was attempted, then ask:

```
AskUserQuestion([
  {
    header: "Inconclusive",
    question: "The research for Objective {objective} was inconclusive. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Add context", description: "You add context and the researcher continues" },
      { label: "Try another mode", description: "Re-run as feasibility, implementation or comparison research" },
      { label: "Manual", description: "Stop here and research it yourself" }
    ]
  }
])
```

- **Add context:** ask in plain prose for the context, then spawn a continuation researcher with it.
- **Try another mode:** re-spawn the researcher (Step 4) in the mode that fits what was missing (feasibility, implementation or comparison), and say which mode you chose.
- **Manual:** stop.

</process>
