---
name: research-objective
description: |
  Research how to build something before planning it — discovers best practices, architecture patterns, and pitfalls for the domain.
  Use when the user wants to investigate, research, or explore options before planning an objective.
  Triggers on: "research objective", "investigate before planning", "look into how to build", "what's the best approach for objective"
argument-hint: "[objective]"
allowed-tools:
  - Read
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Research how to implement an objective. Spawns objective-researcher agent with objective context.

**Note:** This is a standalone research command. For most workflows, use `/aoforge:plan-objective` which integrates research automatically.

**Use this command when:**
- You want to research without planning yet
- You want to re-research after planning is complete
- You need to investigate before deciding if an objective is feasible

**Orchestrator role:** Parse objective, validate against roadmap, check existing research, gather context, spawn researcher agent, present results.

**Why subagent:** Research burns context fast (WebSearch, Context7 queries, source verification). Fresh 200k context for investigation. Main context stays lean for user interaction.
</objective>

<context>
Objective number: $ARGUMENTS (required)

Normalize objective input in step 1 before any directory lookups.
</context>

<process>

## 0. Initialize Context

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init objective-op "$ARGUMENTS")
```

Extract from init JSON: `objective_dir`, `objective_number`, `objective_name`, `objective_found`, `commit_docs`, `has_research`.

Resolve researcher model:
```bash
RESEARCHER_MODEL=$(node ~/.claude/aoforge/bin/aof-tools.cjs resolve-model objective-researcher --raw)
```

## 1. Validate Objective

```bash
OBJECTIVE_INFO=$(node ~/.claude/aoforge/bin/aof-tools.cjs roadmap get-objective "${objective_number}")
```

**If `found` is false:** Error and exit. **If `found` is true:** Extract `objective_number`, `objective_name`, `goal` from JSON.

## 2. Check Existing Research

```bash
ls .aoforge/objectives/${OBJECTIVE}-*/RESEARCH.md 2>/dev/null
```

**If exists:** ask:

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
- **Update research:** continue to step 2.5.
- **Skip:** stop.

**If doesn't exist:** Continue.

## 2.5 Run Cross-Repo Considerations Scan

Run the org-awareness scan to surface sibling-repo / eden-libs / org-Project signals BEFORE the researcher reads CONTEXT.md. This populates a durable `## Cross-Repo Considerations` section in CONTEXT.md that the researcher reads as upstream input.

```bash
CONSIDERATIONS=$(node ~/.claude/aoforge/bin/aof-tools.cjs org-awareness considerations "${objective_number}" 2>/dev/null || echo "")
```

If CONSIDERATIONS is empty (aof-tools failed or scanners returned nothing), proceed to step 3 without writing.

If CONSIDERATIONS is non-empty:

The section is assembled in a draft and published with `doc put` — never edited in place under `.aoforge/` (in store
mode the gate denies that; in local mode `doc put` lands on the same CONTEXT.md file as before):

```bash
CONTEXT_PATH="${objective_dir}/${padded_objective}-CONTEXT.md"
CONTEXT_REL="objectives/$(basename "${objective_dir}")/${padded_objective}-CONTEXT.md"
SECTION_HEADER="## Cross-Repo Considerations"
DRAFT=$(node ~/.claude/aoforge/bin/aof-tools.cjs planning draft "$CONTEXT_REL")
# Start from the current file, never a stale draft left by an earlier run
if [[ -f "$CONTEXT_PATH" ]]; then cp "$CONTEXT_PATH" "$DRAFT"; else rm -f "$DRAFT"; fi

if [[ ! -f "$DRAFT" ]]; then
  # New CONTEXT.md draft with just this section as a starting scaffold
  cat > "$DRAFT" <<EOF
---
objective: ${objective_number}-${objective_slug}
title: ${objective_name}
created: $(date -u +%Y-%m-%dT%H:%M:%SZ)
status: in_progress
---

# Objective ${objective_number} — Context

${SECTION_HEADER}

${CONSIDERATIONS}
EOF
elif grep -q "^${SECTION_HEADER}" "$DRAFT"; then
  # Replace existing section body in-place
  # Write body to a temp file first (avoids macOS BSD awk -v newline limitation)
  BODY_TMP=$(mktemp)
  printf '%s\n' "${CONSIDERATIONS}" > "$BODY_TMP"
  awk -v section="${SECTION_HEADER}" -v bodyfile="$BODY_TMP" '
    BEGIN {
      in_section = 0
      body = ""
      while ((getline line < bodyfile) > 0) { body = body line "\n" }
      close(bodyfile)
    }
    {
      if ($0 == section) {
        printf "%s\n%s", $0, body
        in_section = 1
        next
      }
      if (in_section && /^## /) { in_section = 0 }
      if (!in_section) print $0
    }
  ' "$DRAFT" > "$DRAFT.tmp" && mv "$DRAFT.tmp" "$DRAFT"
  rm -f "$BODY_TMP"
else
  # Add the section at the end of the draft
  echo "" >> "$DRAFT"
  echo "${SECTION_HEADER}" >> "$DRAFT"
  echo "" >> "$DRAFT"
  echo "${CONSIDERATIONS}" >> "$DRAFT"
fi

node ~/.claude/aoforge/bin/aof-tools.cjs doc put "$CONTEXT_REL" --from "$DRAFT"
```

Display: "Cross-Repo Considerations refreshed in ${CONTEXT_PATH}"

## 3. Gather Objective Context

```bash
# Objective section already loaded in OBJECTIVE_INFO
echo "$OBJECTIVE_INFO" | jq -r '.section'
cat .aoforge/REQUIREMENTS.md 2>/dev/null
cat .aoforge/objectives/${OBJECTIVE}-*/*-CONTEXT.md 2>/dev/null
grep -A30 "### Decisions Made" .aoforge/STATE.md 2>/dev/null
```

Present summary with objective description, requirements, prior decisions.

## 4. Spawn objective-researcher Agent

Research modes: ecosystem (default), feasibility, implementation, comparison.

```markdown
<research_type>
Objective Research — investigating HOW to implement a specific objective well.
</research_type>

<key_insight>
The question is NOT "which library should I use?"

The question is: "What do I not know that I don't know?"

For this objective, discover:
- What's the established architecture pattern?
- What libraries form the standard stack?
- What problems do people commonly hit?
- What's SOTA vs what Claude's training thinks is SOTA?
- What should NOT be hand-rolled?
</key_insight>

<objective>
Research implementation approach for Objective {objective_number}: {objective_name}
Mode: ecosystem
</objective>

<context>
**Objective description:** {phase_description}
**Requirements:** {requirements_list}
**Prior decisions:** {decisions_if_any}
**Objective context:** {context_md_content}
</context>

<downstream_consumer>
Your RESEARCH.md will be loaded by `/aoforge:plan-objective` which uses specific sections:
- `## Standard Stack` → Plans use these libraries
- `## Architecture Patterns` → Task structure follows these
- `## Don't Hand-Roll` → Tasks NEVER build custom solutions for listed problems
- `## Common Pitfalls` → Verification steps check for these
- `## Code Examples` → Task actions reference these patterns

Be prescriptive, not exploratory. "Use X" not "Consider X or Y."
</downstream_consumer>

<quality_gate>
Before declaring complete, verify:
- [ ] All domains investigated (not just some)
- [ ] Negative claims verified with official docs
- [ ] Multiple sources for critical claims
- [ ] Confidence levels assigned honestly
- [ ] Section names match what plan-objective expects
</quality_gate>

<output>
Publish `objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md` (relative to `.aoforge/`) as your Step 5 says:
`node ~/.claude/aoforge/bin/aof-tools.cjs planning draft <that path>`, Write the draft, then
`node ~/.claude/aoforge/bin/aof-tools.cjs doc put <that path> --from <draft>`.
</output>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="objective-researcher",
  model="{researcher_model}",
  description="Research Objective {objective}"
)
```

## 5. Handle Agent Return

**`## RESEARCH COMPLETE`:** Display the summary, then ask:

```
AskUserQuestion([
  {
    header: "Next step",
    question: "Research for Objective {objective_number} is complete. What next?",
    multiSelect: false,
    options: [
      { label: "Plan objective (Recommended)", description: "Plan it with /aoforge:plan-objective {objective_number}" },
      { label: "Dig deeper", description: "Continue the research on an area you name" },
      { label: "Review full", description: "Show the full RESEARCH.md" },
      { label: "Done", description: "Stop here" }
    ]
  }
])
```

- **Plan objective:** point the user to `/aoforge:plan-objective {objective_number}`.
- **Dig deeper:** ask in plain prose which area to dig into, then spawn a continuation (step 6) with that focus as the response.
- **Review full:** display RESEARCH.md.
- **Done:** stop.

**`## CHECKPOINT REACHED`:** Present the checkpoint details to the user and get a response, then spawn the continuation (step 6).
- **checkpoint:decision:** ask with AskUserQuestion, header "Checkpoint", the checkpoint's question and its options (label: option name, description: its pros and cons). Up to 4 options become the AskUserQuestion options; with more than 4, print the numbered list, offer the first 4, and say the user may type a number under Other.
- **Any other checkpoint type:** the response is free text; ask for it in plain prose.

**`## RESEARCH INCONCLUSIVE`:** Show what was attempted, then ask:

```
AskUserQuestion([
  {
    header: "Inconclusive",
    question: "The research for Objective {objective_number} was inconclusive. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Add context", description: "You add context and the researcher continues" },
      { label: "Try another mode", description: "Re-run as feasibility, implementation or comparison research" },
      { label: "Manual", description: "Stop here and research it yourself" }
    ]
  }
])
```

- **Add context:** ask in plain prose for the context, then spawn a continuation (step 6) with it as the response.
- **Try another mode:** re-spawn the researcher (step 4) in the mode that fits what was missing (feasibility, implementation or comparison), and say which mode you chose.
- **Manual:** stop.

## 6. Spawn Continuation Agent

```markdown
<objective>
Continue research for Objective {objective_number}: {objective_name}
</objective>

<prior_state>
Research file: @.aoforge/objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>
```

```
Task(
  prompt=continuation_prompt,
  subagent_type="objective-researcher",
  model="{researcher_model}",
  description="Continue research Objective {objective}"
)
```

</process>

<success_criteria>
- [ ] Objective validated against roadmap
- [ ] Existing research checked
- [ ] objective-researcher spawned with context
- [ ] Checkpoints handled correctly
- [ ] User knows next steps
</success_criteria>
