---
status: active
---
<purpose>
Validate built features through conversational testing with persistent state. Keeps a UAT.md (every write goes through `aof-tools doc put`) that tracks test progress, survives /clear, and feeds gaps into /aoforge:plan-objective --gaps.

User tests, Claude records. One test at a time. Plain text responses.
</purpose>

<philosophy>
**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" / empty → pass
- Anything else → logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"
</philosophy>

<template>
@~/.claude/aoforge/templates/UAT.md
</template>

<process>

<step name="initialize" priority="first">
If $ARGUMENTS contains an objective number, load context:

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init verify-work "${OBJECTIVE_ARG}")
```

Parse JSON for: `planner_model`, `checker_model`, `commit_docs`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `has_verification`.
</step>

<step name="check_active_session">
**First: Check for active UAT sessions**

```bash
find .aoforge/objectives -name "*-UAT.md" -type f 2>/dev/null | head -5
```

**If active sessions exist AND no $ARGUMENTS provided:**

Read each file's frontmatter (status, objective) and Current Test section.

Display inline:

```
## Active UAT Sessions

| # | Objective | Status | Current Test | Progress |
|---|-------|--------|--------------|----------|
| 1 | 04-comments | testing | 3. Reply to Comment | 2/6 |
| 2 | 05-auth | testing | 1. Login Form | 0/4 |
```

Then ask, one option per active session (label: the objective, e.g. `04-comments`; description: current test and progress), up to 4:

```
AskUserQuestion([
  {
    header: "UAT session",
    question: "Resume an active UAT session, or type an objective number under Other to start a new one.",
    multiSelect: false,
    options: [
      { label: "{objective 1}", description: "Test {n}: {current test} — {progress}" },
      { label: "{objective 2}", description: "Test {n}: {current test} — {progress}" }
    ]
  }
])
```

With more than 4 sessions, the table above lists them all: offer the first 4, and the user may type another session's objective under Other.

- A listed session, or an active session's objective typed under Other → Load that file, go to `resume_from_file`
- Any other objective number under Other → Treat as new session, go to `create_uat_file`

**If active sessions exist AND $ARGUMENTS provided:**

Check if a session exists for that objective. If yes, ask:

```
AskUserQuestion([
  {
    header: "UAT session",
    question: "Objective {N} already has a UAT session at Test {n} ({progress}). Resume it or restart?",
    multiSelect: false,
    options: [
      { label: "Resume (Recommended)", description: "Continue from the first pending test" },
      { label: "Restart", description: "Start again from Test 1; the earlier results are replaced" }
    ]
  }
])
```

- If "Resume" → Load that file, go to `resume_from_file`
- If "Restart" → go to `create_uat_file`

If no, continue to `create_uat_file`.

**If no active sessions AND no $ARGUMENTS:**

```
No active UAT sessions.

Provide an objective number to start testing (e.g., /aoforge:verify-work 4)
```

**If no active sessions AND $ARGUMENTS provided:**

Continue to `create_uat_file`.
</step>

<step name="find_summaries">
**Find what to test:**

Use `objective_dir` from init (or run init if not already done).

```bash
ls "$objective_dir"/*-SUMMARY.md 2>/dev/null
```

Read each SUMMARY.md to extract testable deliverables.
</step>

<step name="extract_tests">
**Extract testable deliverables from SUMMARY.md:**

Parse for:
1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions

Focus on USER-OBSERVABLE outcomes, not implementation details.

For each deliverable, create a test:
- name: Brief test name
- expected: What the user should see/experience (specific, observable)

Examples:
- Accomplishment: "Added comment threading with infinite nesting"
  → Test: "Reply to a Comment"
  → Expected: "Clicking Reply opens inline composer below comment. Submitting shows reply nested under parent with visual indentation."

Skip internal/non-observable items (refactors, type changes, etc.).
</step>

<step name="create_uat_file">
**Draft the UAT with all tests:**

Open the UAT draft. It is the working copy for the whole session (and survives /clear); see `<update_rules>`:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning draft objectives/XX-name/{phase_num}-UAT.md
```

Note the printed path (`$UAT_DRAFT` below) — shell variables do not survive between Bash calls.

Build test list from extracted deliverables.

**Progress tracking (if available):**

Create a progress task for each test/deliverable upfront. Each goes in_progress when its box is shown (`present_test`) and completed with its result (`process_response`):
```
For each test (1..N):
  TaskCreate(
    subject="Test {n}/{total}: {test_name}",
    description="UAT: {expected_behavior}",
    activeForm="Testing {test_name}"
  )
```

Fill `$UAT_DRAFT` (Write tool; replace any seeded content) with:

```markdown
---
status: testing
objective: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [first test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: [pending]

...

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[none yet]
```

Publish it. Local mode writes `.aoforge/objectives/XX-name/{phase_num}-UAT.md`, the same file as before; store mode also queues its wiki page:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put objectives/XX-name/{phase_num}-UAT.md --from "$UAT_DRAFT"
```

Proceed to `present_test`.
</step>

<step name="present_test">
**Present current test to user:**

Read Current Test section from UAT file.

**Progress tracking (if available):** before showing this test's box:
```
TaskUpdate(taskId=test_task_id, status="in_progress")
```

**Browser pre-verification (for UI tests):**

If the test involves a UI feature and a dev server is running (or can be started):

1. Navigate to the relevant page:
   ```
   browser_navigate(url="http://localhost:{port}/{route}")
   ```

2. Take a snapshot to verify content renders:
   ```
   browser_snapshot()
   ```

3. If the test involves interactions, simulate them:
   ```
   browser_click(element="{relevant element}")
   browser_snapshot()  # Verify state changed
   ```

4. Take a screenshot for evidence:
   ```
   browser_take_screenshot()
   ```

5. Include pre-verification results in the checkpoint:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

**Pre-verified:**
- Page renders at {url}: {yes/no}
- Key elements found: {list from snapshot}
- {interaction tested}: {result}

Please verify the visual quality and UX:
──────────────────────────────────────────────────────────────
→ Pass, or describe what's wrong
──────────────────────────────────────────────────────────────
```

**For non-UI tests** (API, CLI, backend), skip browser pre-verification and present the standard checkpoint:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Pass, or describe what's wrong
──────────────────────────────────────────────────────────────
```

<!-- builtin-audit: allow free-text: the answer is pass or an open description of what differs; severity is inferred from the user's words -->
Wait for user response (plain text, no AskUserQuestion).
</step>

<step name="process_response">
**Process user response and update file:**

**If response indicates pass:**
- Empty response, "yes", "y", "ok", "pass", "next", "approved", "✓"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: pass
```

**If response indicates skip:**
- "skip", "can't test", "n/a"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: skipped
reason: [user's reason if provided]
```

**If response is anything else:**
- Treat as issue description

Infer severity from description:
- Contains: crash, error, exception, fails, broken, unusable → blocker
- Contains: doesn't work, wrong, missing, can't → major
- Contains: slow, weird, off, minor, small → minor
- Contains: color, font, spacing, alignment, visual → cosmetic
- Default if unclear: major

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: issue
reported: "{verbatim user response}"
severity: {inferred}
```

Append to Gaps section (structured YAML for plan-objective --gaps):
```yaml
- truth: "{expected behavior from test}"
  status: failed
  reason: "User reported: {verbatim user response}"
  severity: {inferred}
  test: {N}
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
```

**After any response:**

**Progress tracking (if available):** complete the test's task with its result: `pass`, `issue: {severity}` or `skipped`.
```
TaskUpdate(taskId=test_task_id, status="completed", description="{pass | issue: severity | skipped}")
```

Update Summary counts.
Update frontmatter.updated timestamp.

If more tests remain → Update Current Test, go to `present_test`
If no more tests → Go to `complete_session`
</step>

<step name="resume_from_file">
**Resume testing from UAT file:**

Read the full UAT file, then re-open its draft (the same path as before; seeded from the file if no draft exists):

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning draft objectives/XX-name/{phase_num}-UAT.md
```

Find first test with `result: [pending]`.

**Progress tracking (if available):** a resumed session starts with no tasks for these tests. Make a task again only for each test still `result: [pending]`; answered tests (pass, issue, skipped) get none:
```
For each pending test:
  TaskCreate(subject="Test {n}/{total}: {test_name}", description="UAT: {expected_behavior}", activeForm="Testing {test_name}")
```

Announce:
```
Resuming: Objective {objective} UAT
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

Update Current Test section with the pending test.
Proceed to `present_test`.
</step>

<step name="complete_session">
**Complete testing and commit:**

Update frontmatter:
- status: complete
- updated: [now]

Clear Current Test section:
```
## Current Test

[testing complete]
```

Publish the final draft, then commit the UAT file (local mode; in store mode `commit` skips the gitignored cache path):
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put objectives/XX-name/{phase_num}-UAT.md --from "$UAT_DRAFT"
node ~/.claude/aoforge/bin/aof-tools.cjs commit "test({phase_num}): complete UAT - {passed} passed, {issues} issues" --files ".aoforge/objectives/XX-name/{phase_num}-UAT.md"
```

Present summary:
```
## UAT Complete: Objective {objective}

| Result | Count |
|--------|-------|
| Passed | {N}   |
| Issues | {N}   |
| Skipped| {N}   |

[If issues > 0:]
### Issues Found

[List from Issues section]
```

**If issues > 0:** Proceed to `diagnose_issues`

**If issues == 0:**
```
All tests passed. Ready to continue.

- `/aoforge:plan-objective {next}` — Plan next objective
- `/aoforge:execute-objective {next}` — Execute next objective
```
</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

**Progress tracking (if available):**
```
TaskCreate(
  subject="Diagnose {N} UAT issues",
  description="Spawning parallel debug agents to investigate root causes",
  activeForm="Diagnosing UAT issues"
)
TaskUpdate(taskId=diagnose_task_id, status="in_progress")
```

```
---

{N} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @~/.claude/aoforge/workflows/diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Record root causes in the UAT gaps (draft + `aof-tools doc put`, as diagnose-issues does)
- Progress tracking (if available), only once the root causes are recorded: `TaskUpdate(taskId=diagnose_task_id, status="completed")`
- Proceed to `plan_gap_closure`

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously, so overhead is minimal and fixes are more accurate.
</step>

<step name="plan_gap_closure">
**Auto-plan fixes from diagnosed gaps:**

**Progress tracking (if available):** one task for planning and checking the fixes; it completes once the plans are checked (`verify_gap_plans` or `revision_loop`).
```
TaskCreate(subject="Plan gap closure", description="Planning and checking fixes for the diagnosed UAT gaps", activeForm="Planning gap closure")
TaskUpdate(taskId=gap_plan_task_id, status="in_progress")
```

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► PLANNING FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner for gap closure...
```

Spawn planner in --gaps mode:

```
Task(
  prompt="""
<planning_context>

**Objective:** {objective_number}
**Mode:** gap_closure

**UAT with diagnoses:**
@.aoforge/objectives/{objective_dir}/{phase_num}-UAT.md

**Project State:**
@.aoforge/STATE.md

**Roadmap:**
@.aoforge/ROADMAP.md

</planning_context>

<downstream_consumer>
Output consumed by /aoforge:execute-objective
Plans must be executable prompts.
</downstream_consumer>
""",
  subagent_type="planner",
  model="{planner_model}",
  description="Plan gap fixes for Objective {objective}"
)
```

On return:
- **PLANNING COMPLETE:** Proceed to `verify_gap_plans`
- **PLANNING INCONCLUSIVE:** Report and offer manual intervention; `TaskUpdate(taskId=gap_plan_task_id, status="completed", description="Planning inconclusive")` (if available)
</step>

<step name="verify_gap_plans">
**Verify fix plans with checker:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► VERIFYING FIX PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning job checker...
```

Initialize: `iteration_count = 1`

Spawn job-checker:

```
Task(
  prompt="""
<verification_context>

**Objective:** {objective_number}
**Objective Goal:** Close diagnosed gaps from UAT

**Plans to verify:**
@.aoforge/objectives/{objective_dir}/*-JOB.md

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
""",
  subagent_type="job-checker",
  model="{checker_model}",
  description="Verify Objective {objective} fix plans"
)
```

On return:
- **VERIFICATION PASSED:** `TaskUpdate(taskId=gap_plan_task_id, status="completed")` (if available), proceed to `present_ready`
- **ISSUES FOUND:** Proceed to `revision_loop`
</step>

<step name="revision_loop">
**Iterate planner ↔ checker until plans pass (max 3):**

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

Spawn planner with revision context:

```
Task(
  prompt="""
<revision_context>

**Objective:** {objective_number}
**Mode:** revision

**Existing jobs:**
@.aoforge/objectives/{objective_dir}/*-JOB.md

**Checker issues:**
{structured_issues_from_checker}

</revision_context>

<instructions>
Read existing JOB.md files. Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
</instructions>
""",
  subagent_type="planner",
  model="{planner_model}",
  description="Revise Objective {objective} plans"
)
```

After planner returns → spawn checker again (verify_gap_plans logic)
Increment iteration_count

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain.`

```
AskUserQuestion([
  {
    header: "Max retries",
    question: "The checker still reports {N} issues after 3 revisions. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Force proceed", description: "Execute the fix plans despite the remaining issues" },
      { label: "Provide guidance", description: "You give direction and the planner retries" },
      { label: "Abandon", description: "Stop here; run /aoforge:plan-objective manually" }
    ]
  }
])
```

- **If "Force proceed":** `TaskUpdate(taskId=gap_plan_task_id, status="completed", description="Forced past {N} remaining issues")` (if available), proceed to `present_ready`.
- **If "Provide guidance":** take the direction in plain text, add it to the revision prompt above, spawn the planner again, then the checker (verify_gap_plans logic).
- **If "Abandon":** `TaskUpdate(taskId=gap_plan_task_id, status="completed", description="Abandoned; plan manually")` (if available), exit; the user runs /aoforge:plan-objective manually.
</step>

<step name="present_ready">
**Present completion and next steps:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Objective {X}: {Name}** — {N} gap(s) diagnosed, {M} fix plan(s) created

| Gap | Root Cause | Fix Plan |
|-----|------------|----------|
| {truth 1} | {root_cause} | {objective}-04 |
| {truth 2} | {root_cause} | {objective}-04 |

Plans verified and ready for execution.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fixes** — run fix plans

`/clear` then `/aoforge:execute-objective {objective} --gaps-only`

───────────────────────────────────────────────────────────────
```
</step>

</process>

<update_rules>
**Batched writes for efficiency:**

Keep results in memory. A UAT write is always the same two steps — edit `$UAT_DRAFT` (the `planning draft` path), then publish it:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put objectives/XX-name/{phase_num}-UAT.md --from "$UAT_DRAFT"
```

Never edit the `.aoforge/` file directly. Publish only when:
1. **Issue found** — Preserve the problem immediately
2. **Session complete** — Final publish before commit
3. **Checkpoint** — Every 5 passed tests (safety net)

| Section | Rule | When Written |
|---------|------|--------------|
| Frontmatter.status | OVERWRITE | Start, complete |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test | OVERWRITE | On any file write |
| Tests.{N}.result | OVERWRITE | On any file write |
| Summary | OVERWRITE | On any file write |
| Gaps | APPEND | When issue found |

On context reset: File shows last checkpoint. Resume from there.
</update_rules>

<severity_inference>
**Infer severity from user's natural language:**

| User says | Infer |
|-----------|-------|
| "crashes", "error", "exception", "fails completely" | blocker |
| "doesn't work", "nothing happens", "wrong behavior" | major |
| "works but...", "slow", "weird", "minor issue" | minor |
| "color", "spacing", "alignment", "looks off" | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<success_criteria>
- [ ] UAT drafted with all tests from SUMMARY.md and published with `doc put`
- [ ] Tests presented one at a time with expected behavior
- [ ] User responses processed as pass/issue/skip
- [ ] Severity inferred from description (never asked)
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on completion
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: planner creates fix plans (gap_closure mode)
- [ ] If issues: job-checker verifies fix plans
- [ ] If issues: revision loop until plans pass (max 3 iterations)
- [ ] Ready for `/aoforge:execute-objective --gaps-only` when complete
</success_criteria>
