---
status: active
---
<purpose>
Plan every objective needed to close gaps identified by `/aoforge:milestone audit`. Reads MILESTONE-AUDIT.md, groups gaps into logical objectives, registers them (ROADMAP.md entries in local mode, `aof-tools objective add` in store mode), and prints the plan command for each objective (step 10 does). One command covers all fix objectives — no manual `/aoforge:objective add` per gap.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 1. Load Audit Results

```bash
# Find the most recent audit file
ls -t .aoforge/v*-MILESTONE-AUDIT.md 2>/dev/null | head -1
```

Parse YAML frontmatter to extract structured gaps:
- `gaps.requirements` — unsatisfied requirements
- `gaps.integration` — missing cross-objective connections
- `gaps.flows` — broken E2E flows

If no audit file exists or has no gaps, error:
```
No audit gaps found. Run `/aoforge:milestone audit` first.
```

## 2. Prioritize Gaps

Group gaps by priority from REQUIREMENTS.md:

| Priority | Action |
|----------|--------|
| `must` | Create objective, blocks milestone |
| `should` | Create objective, recommended |
| `nice` | Include or defer, per the question below |

For integration/flow gaps, infer priority from affected requirements.

**Nice-to-have gaps:** when any exist, ask which to include with AskUserQuestion, `multiSelect: true`: one option per nice-to-have gap (the label is its REQ-ID or a short name, the description says what it closes). The tool takes up to 4 options per question and up to 4 questions per call: split a longer list across questions, never leaving a question with a single option, and group related gaps if there are more than 16. A lone nice-to-have gap is a plain Include / Defer question instead.

```
AskUserQuestion([
  {
    header: "Nice-to-have",
    question: "Which of these optional gaps should get a fix objective now? Unselected gaps stay deferred.",
    multiSelect: true,
    options: [
      { label: "{REQ-ID or short name}", description: "{what the gap closes}" },
      { label: "{REQ-ID or short name}", description: "{what the gap closes}" }
    ]
  }
])
```

Selected gaps are included in the objectives below; the rest are deferred and listed in the plan.

## 3. Group Gaps into Objectives

Cluster related gaps into logical objectives:

**Grouping rules:**
- Same affected objective → combine into one fix objective
- Same subsystem (auth, API, UI) → combine
- Dependency order (fix stubs before wiring)
- Keep objectives focused: 2-4 tasks each

**Example grouping:**
```
Gap: DASH-01 unsatisfied (Dashboard doesn't fetch)
Gap: Integration Objective 1→3 (Auth not passed to API calls)
Gap: Flow "View dashboard" broken at data fetch

→ Objective 6: "Wire Dashboard to API"
  - Add fetch to Dashboard.tsx
  - Include auth header in fetch
  - Handle response, update state
  - Render user data
```

## 4. Determine Objective Numbers

Find highest existing objective:
```bash
# Get sorted objective list, extract last one
OBJECTIVES=$(node ~/.claude/aoforge/bin/aof-tools.cjs objectives list)
HIGHEST=$(echo "$OBJECTIVES" | jq -r '.directories[-1]')
```

New objectives continue from there:
- If Objective 5 is highest, gaps become Objective 6, 7, 8...

## 5. Present Gap Closure Plan

```markdown
## Gap Closure Plan

**Milestone:** {version}
**Gaps to close:** {N} requirements, {M} integration, {K} flows

### Proposed Objectives

**Objective {N}: {Name}**
Closes:
- {REQ-ID}: {description}
- Integration: {from} → {to}
Tasks: {count}

**Objective {N+1}: {Name}**
Closes:
- {REQ-ID}: {description}
- Flow: {flow name}
Tasks: {count}

{If nice-to-have gaps were deferred:}

### Deferred (nice-to-have)

These gaps are optional and were not selected:
- {gap description}
- {gap description}
```

Then confirm the plan with AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Gap plan",
    question: "Create these {X} objectives?",
    multiSelect: false,
    options: [
      { label: "Create them (Recommended)", description: "Register the objectives and continue to step 6" },
      { label: "Adjust", description: "Change the grouping, names or scope first" },
      { label: "Defer optional", description: "Drop the optional gaps from the plan, then create the rest" }
    ]
  }
])
```

- "Create them": continue to step 6.
- "Adjust": ask what to change (plain prose), revise the plan, and present it again.
- "Defer optional": remove the included nice-to-have gaps from the objectives, then continue to step 6. Leave this option out when no nice-to-have gap is included.

## 6. Register the New Objectives (ROADMAP.md in local mode)

```bash
MODE=$(node ~/.claude/aoforge/bin/aof-tools.cjs planning mode)
```
- **`store`:** ROADMAP.md is generated (`gh pull --all`) — do not edit it. For each objective run
  `node ~/.claude/aoforge/bin/aof-tools.cjs objective add "{Name}"`, then record its Goal / Requirements / Gap Closure
  lines in its OBJECTIVE.md: draft from `planning draft objectives/{NN}-{name}/OBJECTIVE.md`, then
  `node ~/.claude/aoforge/bin/aof-tools.cjs objective put {N} --from <draft>`. Skip step 8 (`objective add` made the directories).
- **`local`:** add the new objectives to the current milestone in ROADMAP.md, as before:

```markdown
### Objective {N}: {Name}
**Goal:** {derived from gaps being closed}
**Requirements:** {REQ-IDs being satisfied}
**Gap Closure:** Closes gaps from audit

### Objective {N+1}: {Name}
...
```

## 7. Revise the REQUIREMENTS.md Traceability Table (REQUIRED)

Make these changes in a draft and publish it with `doc put` (both modes; in local mode it lands on the same
`.aoforge/REQUIREMENTS.md`):

```bash
DRAFT=$(node ~/.claude/aoforge/bin/aof-tools.cjs planning draft REQUIREMENTS.md)
```

For each REQ-ID assigned to a gap closure objective:
- Set the Objective column to the new gap closure objective
- Reset Status to `Pending`

Reset checked-off requirements the audit found unsatisfied:
- Change `[x]` → `[ ]` for any requirement marked unsatisfied in the audit
- Recount the coverage line at the top

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put REQUIREMENTS.md --from "$DRAFT"
```

`$DRAFT` stands for the path `planning draft` printed — pass it literally.

```bash
# Verify traceability table reflects gap closure assignments
grep -c "Pending" .aoforge/REQUIREMENTS.md
```

## 8. Create Objective Directories

```bash
mkdir -p ".aoforge/objectives/{NN}-{name}"
```

## 9. Commit Roadmap and Requirements Update

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs(roadmap): add gap closure objectives {N}-{M}" --files .aoforge/ROADMAP.md .aoforge/REQUIREMENTS.md
```

## 10. Offer Next Steps

```markdown
## ✓ Gap Closure Objectives Created

**Objectives added:** {N} - {M}
**Gaps addressed:** {count} requirements, {count} integration, {count} flows

---

## ▶ Next Up

**Plan first gap closure objective**

`/aoforge:plan-objective {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/aoforge:execute-objective {N}` — if plans already exist
- `cat .aoforge/ROADMAP.md` — see updated roadmap

---

**After all gap objectives complete:**

`/aoforge:milestone audit` — re-audit to verify gaps closed
`/aoforge:milestone complete {version}` — archive when audit passes
```

</process>

<gap_to_objective_mapping>

## How Gaps Become Tasks

**Requirement gap → Tasks:**
```yaml
gap:
  id: DASH-01
  description: "User sees their data"
  reason: "Dashboard exists but doesn't fetch from API"
  missing:
    - "useEffect with fetch to /api/user/data"
    - "State for user data"
    - "Render user data in JSX"

becomes:

objective: "Wire Dashboard Data"
tasks:
  - name: "Add data fetching"
    files: [src/components/Dashboard.tsx]
    action: "Add useEffect that fetches /api/user/data on mount"

  - name: "Add state management"
    files: [src/components/Dashboard.tsx]
    action: "Add useState for userData, loading, error states"

  - name: "Render user data"
    files: [src/components/Dashboard.tsx]
    action: "Replace placeholder with userData.map rendering"
```

**Integration gap → Tasks:**
```yaml
gap:
  from_objective: 1
  to_objective: 3
  connection: "Auth token → API calls"
  reason: "Dashboard API calls don't include auth header"
  missing:
    - "Auth header in fetch calls"
    - "Token refresh on 401"

becomes:

objective: "Add Auth to Dashboard API Calls"
tasks:
  - name: "Add auth header to fetches"
    files: [src/components/Dashboard.tsx, src/lib/api.ts]
    action: "Include Authorization header with token in all API calls"

  - name: "Handle 401 responses"
    files: [src/lib/api.ts]
    action: "Add interceptor to refresh token or redirect to login on 401"
```

**Flow gap → Tasks:**
```yaml
gap:
  name: "User views dashboard after login"
  broken_at: "Dashboard data load"
  reason: "No fetch call"
  missing:
    - "Fetch user data on mount"
    - "Display loading state"
    - "Render user data"

becomes:

# Usually same objective as requirement/integration gap
# Flow gaps often overlap with other gap types
```

</gap_to_objective_mapping>

<success_criteria>
- [ ] MILESTONE-AUDIT.md loaded and gaps parsed
- [ ] Gaps prioritized (must/should/nice)
- [ ] Gaps grouped into logical objectives
- [ ] User confirmed objective plan
- [ ] ROADMAP.md updated with new objectives
- [ ] REQUIREMENTS.md traceability table updated with gap closure objective assignments
- [ ] Unsatisfied requirement checkboxes reset (`[x]` → `[ ]`)
- [ ] Coverage count updated in REQUIREMENTS.md
- [ ] Objective directories created
- [ ] Changes committed (includes REQUIREMENTS.md)
- [ ] User knows to run `/aoforge:plan-objective` next
</success_criteria>
