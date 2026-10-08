---
status: active
---
<trigger>
Use this workflow when:
- Starting a new session on an existing project
- User says "continue", "what's next", "where were we", "resume"
- Any planning operation when .planning/ already exists
- User returns after time away from project
</trigger>

<purpose>
Instantly restore full project context so "Where were we?" has an immediate, complete answer.
</purpose>

<required_reading>
@~/.claude/aoforge/references/continuation-format.md
</required_reading>

<process>

<step name="initialize">
Load all context in one call:

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init resume)
```

Parse JSON for: `state_exists`, `roadmap_exists`, `project_exists`, `planning_exists`, `has_interrupted_agent`, `interrupted_agent_id`, `commit_docs`.

**If `state_exists` is true:** Proceed to load_state
**If `state_exists` is false but `roadmap_exists` or `project_exists` is true:** ask whether to rebuild it:

```
AskUserQuestion([
  {
    header: "Rebuild?",
    question: "STATE.md is missing, but the project has other planning files. Reconstruct STATE.md from them?",
    multiSelect: false,
    options: [
      { label: "Reconstruct (Recommended)", description: "Rebuild STATE.md from PROJECT.md, ROADMAP.md, summaries and todos" },
      { label: "Continue without", description: "Resume from the files that exist; STATE.md stays missing" }
    ]
  }
])
```

On "Reconstruct", follow <reconstruction>, then proceed to load_state. On "Continue without", skip the STATE.md
read in load_state and carry on from PROJECT.md and ROADMAP.md.

**If `planning_exists` is false:** This is a new project - route to /aoforge:new-project
</step>

<step name="load_state">

Read and parse STATE.md, then PROJECT.md:

```bash
cat .planning/STATE.md
cat .planning/PROJECT.md
```

**From STATE.md extract:**

- **Project Reference**: Core value and current focus
- **Current Position**: Objective X of Y, Plan A of B, Status
- **Progress**: Visual progress bar
- **Recent Decisions**: Key decisions affecting current work
- **Pending Todos**: Ideas captured during sessions
- **Blockers/Concerns**: Issues carried forward
- **Session Continuity**: Where we left off, any resume files

**From PROJECT.md extract:**

- **What This Is**: Current accurate description
- **Requirements**: Validated, Active, Out of Scope
- **Key Decisions**: Full decision log with outcomes
- **Constraints**: Hard limits on implementation

</step>

<step name="check_incomplete_work">
Look for incomplete work that needs attention:

```bash
# Check for continue-here files (mid-plan resumption)
ls .planning/objectives/*/.continue-here*.md 2>/dev/null

# Check for jobs without summaries (incomplete execution)
for jobfile in .planning/objectives/*/*-JOB.md; do
  summary="${jobfile/JOB/SUMMARY}"
  [ ! -f "$summary" ] && echo "Incomplete: $jobfile"
done 2>/dev/null

# Check for interrupted agents (use has_interrupted_agent and interrupted_agent_id from init)
if [ "$has_interrupted_agent" = "true" ]; then
  echo "Interrupted agent: $interrupted_agent_id"
fi
```

**If .continue-here file exists:**

- This is a mid-plan resumption point
- Read the file for specific resumption context
- Flag: "Found mid-job checkpoint"

**If JOB without SUMMARY exists:**

- Execution was started but not completed
- Flag: "Found incomplete job execution"

**If interrupted agent found:**

- Subagent was spawned but session ended before completion
- Read agent-history.json for task details
- Flag: "Found interrupted agent"
  </step>

<step name="present_status">
Present complete project status to user:

```
╔══════════════════════════════════════════════════════════════╗
║  PROJECT STATUS                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Building: [one-liner from PROJECT.md "What This Is"]         ║
║                                                               ║
║  Objective: [X] of [Y] - [Objective name]                            ║
║  Plan:  [A] of [B] - [Status]                                ║
║  Progress: [██████░░░░] XX%                                  ║
║                                                               ║
║  Last activity: [date] - [what happened]                     ║
╚══════════════════════════════════════════════════════════════╝

[If incomplete work found:]
⚠️  Incomplete work detected:
    - [.continue-here file or incomplete plan]

[If interrupted agent found:]
⚠️  Interrupted agent detected:
    Agent ID: [id]
    Task: [task description from agent-history.json]
    Interrupted: [timestamp]

    Resume with: Task tool (resume parameter with agent ID)

[If pending todos exist:]
📋 [N] pending todos — /aoforge:todo list to review

[If blockers exist:]
⚠️  Carried concerns:
    - [blocker 1]
    - [blocker 2]

[If alignment is not ✓:]
⚠️  Brief alignment: [status] - [assessment]
```

</step>

<step name="determine_next_action">
Based on project state, determine the most logical next action:

**If interrupted agent exists:**
→ Primary: Resume interrupted agent (Task tool with resume parameter)
→ Option: Start fresh (abandon agent work)

**If .continue-here file exists:**
→ Primary: Resume from checkpoint
→ Option: Start fresh on current job

**If incomplete job (JOB without SUMMARY):**
→ Primary: Complete the incomplete job
→ Option: Abandon and move on

**If objective in progress, all jobs complete:**
→ Primary: Transition to next objective
→ Option: Review completed work

**If objective ready to plan:**
→ Check if CONTEXT.md exists for this objective:

- If CONTEXT.md missing:
  → Primary: Discuss objective vision (how user imagines it working)
  → Secondary: Plan directly (skip context gathering)
- If CONTEXT.md exists:
  → Primary: Plan the objective
  → Option: Review roadmap

**If objective ready to execute:**
→ Primary: Execute next job
→ Option: Review the job first
</step>

<step name="offer_options">
Ask for the next step with AskUserQuestion, built from the state determine_next_action found. The options are the
4 actions most relevant to that state, the primary action first with ` (Recommended)`:

- **Primary action**, by state: Resume interrupted agent [if interrupted agent found]; Execute objective
  (`/aoforge:execute-objective {objective}`); Discuss Objective 3 context (`/aoforge:discuss-objective 3`) [if
  CONTEXT.md missing]; or Plan Objective 3 (`/aoforge:plan-objective 3`) [if CONTEXT.md exists or discuss was declined].
- **The other three**: Review current objective status, Check pending todos ([N] pending) and Review brief alignment.
  Drop one that does not apply (no pending todos, alignment already ✓) and put the state's alternative from
  determine_next_action in its place (Start fresh, Abandon and move on, Plan directly, Review roadmap, Review the job
  first).

"Something else" is not an option: the user types it under Other.

```
AskUserQuestion([
  {
    header: "Next step",
    question: "What would you like to do? Pick one, or type something else under Other.",
    multiSelect: false,
    options: [
      { label: "{primary action} (Recommended)", description: "{the command it runs, or what it resumes}" },
      { label: "Review objective status", description: "Current objective's TRDs and their summaries" },
      { label: "Check pending todos", description: "{N} pending" },
      { label: "Review brief alignment", description: "Compare PROJECT.md with where the project stands" }
    ]
  }
])
```

**Note:** When choosing between discuss and plan for the primary action, check for CONTEXT.md existence first:

```bash
ls .planning/objectives/XX-name/*-CONTEXT.md 2>/dev/null
```

If missing, the primary action is discuss-objective (with Plan directly among the others). If it exists, the primary
action is plan-objective.
</step>

<step name="route_to_workflow">
Based on user selection, route to appropriate workflow:

- **Execute plan** → Show command for user to run after clearing:
  ```
  ---

  ## ▶ Next Up

  **{objective}-{job}: [Plan Name]** — [objective from JOB.md]

  `/aoforge:execute-objective {objective}`

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```
- **Plan objective** → Show command for user to run after clearing:
  ```
  ---

  ## ▶ Next Up

  **Objective [N]: [Name]** — [Goal from ROADMAP.md]

  `/aoforge:plan-objective [phase-number]`

  <sub>`/clear` first → fresh context window</sub>

  ---

  **Also available:**
  - `/aoforge:discuss-objective [N]` — gather context first
  - `/aoforge:research-objective [N]` — investigate unknowns

  ---
  ```
- **Transition** → ./transition.md
- **Check todos** → Read .planning/todos/pending/, present summary
- **Review alignment** → Read PROJECT.md, compare to current state
- **Something else** (typed under Other) → act on what they typed, or ask what they need
</step>

<step name="update_session">
Before proceeding to routed workflow, record session continuity with the state command (never by
editing STATE.md; the command works in local and store mode alike):

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs state record-session --stopped-at "Session resumed, proceeding to [action]" --resume-file "[path, if applicable]"
```

It stamps `Last session` with now and sets `Stopped At` / `Resume File` (omit `--resume-file` when
there is none). This ensures if session ends unexpectedly, next resume knows the state.
</step>

</process>

<reconstruction>
If STATE.md is missing but other artifacts exist:

"STATE.md missing. Reconstructing from artifacts..."

1. Read PROJECT.md → Extract "What This Is" and Core Value
2. Read ROADMAP.md → Determine objectives, find current position
3. Scan \*-SUMMARY.md files → Extract decisions, concerns
4. Count pending todos in .planning/todos/pending/
5. Check for .continue-here files → Session continuity

Then rebuild STATE.md and proceed normally:

- Store mode (`node ~/.claude/aoforge/bin/aof-tools.cjs planning mode` prints `store`): STATE.md is a
  generated view — `node ~/.claude/aoforge/bin/aof-tools.cjs gh pull --all` regenerates it from the store.
- Local mode: `node ~/.claude/aoforge/bin/aof-tools.cjs validate health --repair` regenerates a minimal
  STATE.md from ROADMAP.md; then record the position found above with
  `node ~/.claude/aoforge/bin/aof-tools.cjs state patch --<field> <value>` and `state record-session`.

This handles cases where:

- Project predates STATE.md introduction
- File was accidentally deleted
- Cloning repo without full .planning/ state
  </reconstruction>

<quick_resume>
If user says "continue" or "go":
- Load state silently
- Determine primary action
- Execute immediately without presenting options

"Continuing from [state]... [action]"
</quick_resume>

<success_criteria>
Resume is complete when:

- [ ] STATE.md loaded (or reconstructed)
- [ ] Incomplete work detected and flagged
- [ ] Clear status presented to user
- [ ] Contextual next actions offered
- [ ] User knows exactly where project stands
- [ ] Session continuity updated
      </success_criteria>
