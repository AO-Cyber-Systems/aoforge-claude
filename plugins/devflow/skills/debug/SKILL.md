---
name: debug
description: |
  Investigate bugs using a structured approach that survives context resets. Tracks hypotheses, evidence, and progress across sessions.
  Use when the user reports a bug, error, or something not working as expected.
  Triggers on: "debug this", "something's broken", "fix this bug", "not working", "there's an error", "why isn't this working?"
argument-hint: [issue description]
allowed-tools:
  - Read
  - Bash
  - Task
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
---

<objective>
Debug issues using scientific method with subagent isolation.

**Orchestrator role:** Gather symptoms, spawn debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.
</objective>

<context>
User's issue: $ARGUMENTS

Check for active sessions:
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>

## 0. Initialize Context

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs state load)
```

Extract `commit_docs` from init JSON. Resolve debugger model:
```bash
DEBUGGER_MODEL=$(node ~/.claude/devflow/bin/df-tools.cjs resolve-model debugger --raw)
```

## 1. Check Active Sessions

If active sessions exist AND no $ARGUMENTS:
- List sessions, numbered, with status, hypothesis, next action
- Use AskUserQuestion:
  - header: "Session"
  - question: "Resume a debug session, or describe a new issue under Other?"
  - multiSelect: false
  - options: one per active session, up to 4 (label: the slug; description: status and next action), e.g.
    - "{slug}" — {status}; next: {next action}
  - More than 4 sessions: the numbered list above shows them all; offer the first 4, and the user may type a number under Other.
- A session (or its number under Other): resume it. Create the `Investigate: {slug}` task as in step 3, then run a continuation round (step 5) on its debug file.
- Any other text under Other: that is the new issue.

If $ARGUMENTS provided OR user describes new issue:
- Continue to symptom gathering

## 2. Gather Symptoms (if new issue)

**Progress tracking (if available):** the first time through step 2, create the task; on a return to step 2 ("Add more detail", "Add more context"), only set it in_progress again.

```
TaskCreate(subject="Gather symptoms", description="Collecting what happens, its impact, expected behavior, errors and reproduction", activeForm="Gathering symptoms")
TaskUpdate(taskId=symptoms_task_id, status="in_progress")
```

**Step 2a: What happens? (structured)**

Use AskUserQuestion:
- header: "Symptom"
- question: "What happens when the issue occurs?"
- multiSelect: false
- options:
  - "Nothing happens" — Expected action produces no result
  - "Wrong output" — Something happens but it's incorrect
  - "Error displayed" — An error message or crash occurs
  - "Partial success" — Some parts work, others don't

**Step 2b: Impact (structured)**

Use AskUserQuestion:
- header: "Impact"
- question: "How does this affect your workflow?"
- multiSelect: false
- options:
  - "Completely blocked" — Cannot continue without fixing this
  - "Workaround exists" — Can work around it but it's painful
  - "Cosmetic issue" — Functionality works, appearance is wrong
  - "Intermittent" — Sometimes works, sometimes doesn't

**Step 2c: Expected behavior (freeform)**

Ask inline: "What should happen instead? Describe the expected behavior."

**Step 2d: Error details (freeform)**

Ask inline: "Any error messages? Paste them or describe what you see."

**Step 2e: Reproduction (freeform)**

Ask inline: "How do you trigger this? What steps reproduce the issue?"

**Step 2f: Ready to investigate**

After all gathered, use AskUserQuestion:
- header: "Ready?"
- question: "Symptoms recorded. Start the investigation?"
- multiSelect: false
- options:
  - "Investigate (Recommended)" — Spawn the debugger with these symptoms
  - "Add more detail" — Add or correct symptoms before investigating

- **If "Investigate":** `TaskUpdate(taskId=symptoms_task_id, status="completed")` (if available), continue to step 3.
- **If "Add more detail":** return to step 2 and update the symptoms the user names.

## 3. Spawn debugger Agent

**Progress tracking (if available):** set the task in_progress as the agent is spawned. On a re-spawn after "Add more context" the task already exists: only set it in_progress.

```
TaskCreate(subject="Investigate: {slug}", description="Debugger investigation of {slug}", activeForm="Investigating {slug}")
TaskUpdate(taskId=investigate_task_id, status="in_progress")
```

Fill prompt and spawn:

```markdown
<objective>
Investigate issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

<debug_file>
Session: .planning/debug/{slug}.md. Start and save it only with `node ~/.claude/devflow/bin/df-tools.cjs debug put {slug} --from "$DRAFT"` (draft path from `planning draft debug/{slug}.md`); archive with `debug resolve {slug}`.
</debug_file>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="debugger",
  model="{debugger_model}",
  description="Debug {slug}"
)
```

## 4. Handle Agent Return

**Progress tracking (if available):** if this return ends a continuation round, `TaskUpdate(taskId=hypothesis_task_id, status="completed")` first, whatever the return type.

**If `## ROOT CAUSE FOUND`:**
- Display root cause and evidence summary
- `TaskUpdate(taskId=investigate_task_id, status="completed", description="Root cause: {one line}")` (if available)
- Use AskUserQuestion:
  - header: "Root cause"
  - question: "Root cause found. How do you want to fix it?"
  - multiSelect: false
  - options:
    - "Fix now (Recommended)" — Spawn a fix subagent for this root cause
    - "Plan fix" — Plan the fix with /devflow:plan-objective --gaps
    - "Manual fix" — Stop here; you fix it yourself
- **If "Fix now":** spawn the fix subagent. Progress tracking (if available): `TaskCreate(subject="Fix: {slug}", description="Fixing the root cause of {slug}", activeForm="Fixing {slug}")`, `TaskUpdate(taskId=fix_task_id, status="in_progress")` at spawn, `TaskUpdate(taskId=fix_task_id, status="completed")` when the fix ends.
- **If "Plan fix":** suggest /devflow:plan-objective --gaps.
- **If "Manual fix":** done.

**If `## CHECKPOINT REACHED`:**
- Present checkpoint details to user, then get the response by checkpoint type:
  - `checkpoint:decision`: AskUserQuestion, header "Checkpoint", the checkpoint's options as the options (up to 4; with more, print them all numbered, offer the first 4, and the user may type a number under Other).
  - `checkpoint:human-verify`: AskUserQuestion, header "Verify", question "{what was built}: does it behave as expected?", options "Approved (Recommended)" (it works) / "Issues found" (then take the user's description in plain text).
  - `checkpoint:human-action`: ask in plain text for the action's result; the answer is free text.
- Spawn continuation agent with the response (see step 5)

**If `## INVESTIGATION INCONCLUSIVE`:**
- Show what was checked and eliminated
- Use AskUserQuestion:
  - header: "Next step"
  - question: "The investigation is inconclusive. What next?"
  - multiSelect: false
  - options:
    - "Continue investigating (Recommended)" — Spawn a new agent with additional context
    - "Add more context" — Gather more symptoms, then spawn again
    - "Manual investigation" — Stop here; you investigate yourself
- **If "Continue investigating":** spawn a new agent with additional context, as a continuation round (step 5).
- **If "Add more context":** gather more symptoms (step 2), spawn again.
- **If "Manual investigation":** `TaskUpdate(taskId=investigate_task_id, status="completed", description="Inconclusive; continued manually")` (if available), done.

## 5. Spawn Continuation Agent (After Checkpoint)

Each continuation agent is one hypothesis round. **Progress tracking (if available):** as the round starts, take the hypothesis from the agent's last return or from the `hypothesis:` line under the debug file's Current Focus, and create its task; step 4 completes it when the round returns.

```
TaskCreate(subject="Hypothesis: {hypothesis}", description="Testing a hypothesis for {slug}", activeForm="Testing a hypothesis")
TaskUpdate(taskId=hypothesis_task_id, status="in_progress")
```

When user responds to checkpoint, spawn fresh agent:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
```

```
Task(
  prompt=continuation_prompt,
  subagent_type="debugger",
  model="{debugger_model}",
  description="Continue debug {slug}"
)
```

</process>

<success_criteria>
- [ ] Active sessions checked
- [ ] Symptoms gathered (if new); every discrete choice asked with AskUserQuestion, free-text symptoms in prose
- [ ] (task tools available) Gather symptoms, Investigate, one Hypothesis per continuation round and Fix tracked as tasks
- [ ] debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing
</success_criteria>
