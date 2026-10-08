---
status: active
---
<purpose>
Add a new integer objective to the end of the current milestone in the roadmap. Automatically calculates next objective number, creates objective directory, and updates roadmap structure.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the objective description
- Example: `/aoforge:objective add Add authentication` → description = "Add authentication"
- Example: `/aoforge:objective add Fix critical performance issues` → description = "Fix critical performance issues"

If no arguments provided:

```
ERROR: Objective description required
Usage: /aoforge:objective add <description>
Example: /aoforge:objective add Add authentication system
```

Exit.
</step>

<step name="init_context">
Load objective operation context:

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init objective-op "0")
```

Check `roadmap_exists` from init JSON. If false:
```
ERROR: No roadmap found (.planning/ROADMAP.md)
Run /aoforge:new-project to initialize.
```
Exit.
</step>

<step name="add_objective">
**Delegate the objective addition to aof-tools:**

```bash
RESULT=$(node ~/.claude/aoforge/bin/aof-tools.cjs objective add "${description}")
```

The CLI handles:
- Finding the highest existing integer objective number
- Calculating next objective number (max + 1)
- Generating slug from description
- Creating the objective directory (`.planning/objectives/{NN}-{slug}/`)
- Inserting the objective entry into ROADMAP.md with Goal, Depends on, and Plans sections

Extract from result: `objective_number`, `padded`, `name`, `slug`, `directory`.
</step>

<step name="update_project_state">
Check `node ~/.claude/aoforge/bin/aof-tools.cjs planning mode`.

**Store:** `objective add` opened the objective's issue and created its directory. The issue is titled from the objective id, not the description, so give it the description and goal: draft OBJECTIVE.md at the path `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft objectives/<dir>/OBJECTIVE.md` prints, then run `node ~/.claude/aoforge/bin/aof-tools.cjs objective put {N} --from "$DRAFT"`. STATE.md is generated — `node ~/.claude/aoforge/bin/aof-tools.cjs gh pull --all` refreshes it; no hand edit.

**Local:** edit STATE.md as today to reflect the new objective:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Objective {N} added: {description}
   ```

If "Roadmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Objective {N} added to current milestone:
- Description: {description}
- Directory: .planning/objectives/{phase-num}-{slug}/
- Status: Not planned yet

Roadmap updated: .planning/ROADMAP.md

---

## ▶ Next Up

**Objective {N}: {description}**

`/aoforge:plan-objective {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/aoforge:objective add <description>` — add another objective
- Review roadmap

---
```
</step>

</process>

<success_criteria>
- [ ] `aof-tools objective add` executed successfully
- [ ] Objective directory created
- [ ] Roadmap updated with new objective entry
- [ ] STATE.md updated with roadmap evolution note
- [ ] User informed of next steps
</success_criteria>
