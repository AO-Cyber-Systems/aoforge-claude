---
status: active
---
<purpose>
Execute small features with AOForge guarantees (atomic commits, STATE.md tracking) at the small-feature tier of the AOForge ladder.

**Cutoff (advisory):** <5 files, <200 LOC, no new abstractions. For sub-30-LOC single-file changes, prefer `/aoforge:micro` (~2k token floor). For multi-subsystem features, use `/aoforge:build`.

Quick mode spawns planner (quick mode) + executor(s). Each task's JOB and SUMMARY go through `aof-tools quick put` / `quick summary` (local mode: `.aoforge/quick/<N>-<slug>/`; with `github.store` on: a Quick issue). In local mode the task also gets a row in STATE.md's "Quick Tasks Completed" table.

With `--full` flag: enables job-checking (max 2 iterations) and post-execution verification for quality guarantees without full milestone ceremony.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>
**Step 1: Parse arguments and get task description**

Parse `$ARGUMENTS` for:
- `--full` flag → store as `$FULL_MODE` (true/false)
- Remaining text → use as `$DESCRIPTION` if non-empty

If `$DESCRIPTION` is empty after parsing, ask in plain text: "What do you want to do?" The answer is free text: store it as `$DESCRIPTION`.

If still empty, re-prompt: "Please provide a task description."

If `$FULL_MODE`:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► QUICK TASK (FULL MODE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Plan checking + verification enabled
```

---

**Step 2: Initialize**

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init quick "$DESCRIPTION")
```

Parse JSON for: `planner_model`, `executor_model`, `checker_model`, `verifier_model`, `commit_docs`, `next_num`, `slug`, `date`, `timestamp`, `quick_dir`, `task_dir`, `roadmap_exists`, `planning_exists`.

**If `roadmap_exists` is false:** Error — Quick mode requires an active project with ROADMAP.md. Run `/aoforge:new-project` first.

Quick tasks can run mid-objective - validation only checks ROADMAP.md exists, not objective status.

---

**Step 3: Create task directory**

```bash
mkdir -p "${task_dir}"
```

---

**Step 4: Name the quick task and get its drafts**

```bash
QUICK_DIR=".aoforge/quick/${next_num}-${slug}"
```

The JOB and SUMMARY are never written under `.aoforge/` directly: agents write drafts, and `aof-tools quick put` /
`quick summary` save them. Get both draft paths now (each command prints one path; note them as literals `JOB_DRAFT` and
`SUMMARY_DRAFT`, since shell variables do not survive between Bash calls):

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning draft quick/${next_num}-${slug}/${next_num}-JOB.md
node ~/.claude/aoforge/bin/aof-tools.cjs planning draft quick/${next_num}-${slug}/${next_num}-SUMMARY.md
```

Report to user:
```
Creating quick task ${next_num}: ${DESCRIPTION}
Directory: ${QUICK_DIR}
```

Store `$QUICK_DIR` for use in orchestration.

---

**Step 5: Spawn planner (quick mode)**

**Progress tracking (if available):** one task per step, created here in order. `Check plan` and `Verify` exist only when `$FULL_MODE`.

```
TaskCreate(subject="Plan: ${DESCRIPTION}", description="Planning the quick task", activeForm="Planning the quick task")
TaskCreate(subject="Check plan", description="Checking the quick plan (--full)", activeForm="Checking the quick plan")
TaskCreate(subject="Execute: ${DESCRIPTION}", description="Executing the quick task", activeForm="Executing the quick task")
TaskCreate(subject="Verify", description="Verifying the quick task (--full)", activeForm="Verifying the quick task")
TaskUpdate(taskId=plan_task_id, status="in_progress")
```

Skip the `Check plan` and `Verify` creates when NOT `$FULL_MODE`.

**If `$FULL_MODE`:** Use `quick-full` mode with stricter constraints.

**If NOT `$FULL_MODE`:** Use standard `quick` mode.

```
Task(
  prompt="
<planning_context>

**Mode:** ${FULL_MODE ? 'quick-full' : 'quick'}
**Directory:** ${QUICK_DIR}
**Description:** ${DESCRIPTION}

**Project State:**
@.aoforge/STATE.md

</planning_context>

<constraints>
- Create a SINGLE plan with 1-3 focused tasks
- Quick tasks should be atomic and self-contained
- No research objective
${FULL_MODE ? '- Target ~40% context usage (structured for verification)' : '- Target ~30% context usage (simple, focused)'}
${FULL_MODE ? '- MUST generate `must_haves` in plan frontmatter (truths, artifacts, key_links)' : ''}
${FULL_MODE ? '- Each task MUST have `files`, `action`, `verify`, `done` fields' : ''}
</constraints>

<output>
Put the plan in this draft file (outside .aoforge/; the orchestrator saves it): ${JOB_DRAFT}
Return: ## PLANNING COMPLETE with the draft path
</output>
",
  subagent_type="planner",
  model="{planner_model}",
  description="Quick plan: ${DESCRIPTION}"
)
```

After planner returns:
1. Save the plan from the draft. It writes `${QUICK_DIR}/${next_num}-JOB.md` (store mode: the Quick issue):
   ```bash
   node ~/.claude/aoforge/bin/aof-tools.cjs quick put ${next_num} ${slug} --from "${JOB_DRAFT}"
   ```
2. Extract job count (typically 1 for quick tasks)
3. Report: "Plan saved: ${QUICK_DIR}/${next_num}-JOB.md"
4. **Progress tracking (if available):** `TaskUpdate(taskId=plan_task_id, status="completed")`

If the draft is empty or `quick put` exits non-zero, error: "Planner did not produce ${next_num}-JOB.md"

---

**Step 5.5: Plan-checker loop (only when `$FULL_MODE`)**

Skip this step entirely if NOT `$FULL_MODE`.

**Progress tracking (if available):** `TaskUpdate(taskId=check_task_id, status="in_progress")`

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► CHECKING JOB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning job checker...
```

```bash
PLAN_CONTENT=$(cat "${QUICK_DIR}/${next_num}-JOB.md" 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Mode:** quick-full
**Task Description:** ${DESCRIPTION}

**Plan to verify:** ${PLAN_CONTENT}

**Scope:** This is a quick task, not a full objective. Skip checks that require a ROADMAP objective goal.
</verification_context>

<check_dimensions>
- Requirement coverage: Does the job address the task description?
- Task completeness: Do tasks have files, action, verify, done fields?
- Key links: Are referenced files real?
- Scope sanity: Is this appropriately sized for a quick task (1-3 tasks)?
- must_haves derivation: Are must_haves traceable to the task description?

Skip: context compliance (no CONTEXT.md), cross-plan deps (single plan), ROADMAP alignment
</check_dimensions>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="job-checker",
  model="{checker_model}",
  description="Check quick plan: ${DESCRIPTION}"
)
```

**Handle checker return:**

- **`## VERIFICATION PASSED`:** Display confirmation, `TaskUpdate(taskId=check_task_id, status="completed")` (if available), proceed to step 6.
- **`## ISSUES FOUND`:** Display issues, check iteration count, enter revision loop.

**Revision loop (max 2 iterations):**

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 2:**

Display: `Sending back to planner for revision... (iteration ${N}/2)`

```bash
PLAN_CONTENT=$(cat "${QUICK_DIR}/${next_num}-JOB.md" 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Mode:** quick-full (revision)

**Existing job:** ${PLAN_CONTENT}
**Checker issues:** ${structured_issues_from_checker}

</revision_context>

<instructions>
Make targeted changes to the draft at ${JOB_DRAFT} to address checker issues (outside .aoforge/; the orchestrator saves it).
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt=revision_prompt,
  subagent_type="planner",
  model="{planner_model}",
  description="Revise quick plan: ${DESCRIPTION}"
)
```

After planner returns → save the revision (`node ~/.claude/aoforge/bin/aof-tools.cjs quick put ${next_num} ${slug} --from "${JOB_DRAFT}"`), spawn checker again, increment iteration_count.

**If iteration_count >= 2:**

Display: `Max iterations reached. ${N} issues remain:` + issue list

```
AskUserQuestion([
  {
    header: "Plan check",
    question: "The checker still reports issues after 2 iterations. How do you want to proceed?",
    multiSelect: false,
    options: [
      { label: "Force proceed", description: "Execute the plan despite the remaining issues" },
      { label: "Abort", description: "Stop here; fix the description and run /aoforge:quick again" }
    ]
  }
])
```

No option is recommended: either can be right.

- **If "Force proceed":** `TaskUpdate(taskId=check_task_id, status="completed", description="Forced past ${N} remaining issues")` (if available), proceed to step 6.
- **If "Abort":** stop without executing; the plan stays at `${QUICK_DIR}/${next_num}-JOB.md`. Progress tracking (if available): `TaskUpdate(taskId=check_task_id, status="completed", description="Aborted with ${N} issues remaining")`, then `TaskUpdate(taskId=execute_task_id, status="deleted")` and `TaskUpdate(taskId=verify_task_id, status="deleted")`.

---

**Step 6: Spawn executor**

First read the repo root and the commit the work builds on, so the executor is told both
rather than left to infer them (issue #86 — inferred isolation put an executor in a
different repository and based it on the default branch):

**Progress tracking (if available):** `TaskUpdate(taskId=execute_task_id, status="in_progress")`

```bash
git rev-parse --show-toplevel
```
```bash
git rev-parse HEAD
```

Note both down as literals (`REPO_ROOT`, `BASE`); a shell variable does not survive into
the next Bash call. A quick task is a single executor on the current branch, so there is no
worktree to provision — the preflight is what proves that is actually where it landed.

Spawn executor with plan reference:

```
Task(
  prompt="
Execute quick task ${next_num}.

Job: @${QUICK_DIR}/${next_num}-JOB.md
Project state: @.aoforge/STATE.md

<repo_and_base>
Before anything else, prove you are in the right repository on the right base:

  node ~/.claude/aoforge/bin/aof-tools.cjs exec-context check --repo <REPO_ROOT> --base <BASE>

Exit 1 (WRONG REPOSITORY or BASE NOT VISIBLE) is a hard stop: report which fired, quote the
output, and end your turn without writing anything.
</repo_and_base>

<constraints>
- Execute all tasks in the job
- Commit each task atomically
- Put the summary in this draft file (outside .aoforge/; the orchestrator saves it with `quick summary`): ${SUMMARY_DRAFT}
- Do NOT touch ROADMAP.md (quick tasks are separate from planned objectives)
</constraints>
",
  subagent_type="executor",
  model="{executor_model}",
  description="Execute: ${DESCRIPTION}"
)
```

After executor returns:
1. Save the summary from the draft. It writes `${QUICK_DIR}/${next_num}-SUMMARY.md` (store mode: the summary comment on the Quick issue, which then closes):
   ```bash
   node ~/.claude/aoforge/bin/aof-tools.cjs quick summary ${next_num} --from "${SUMMARY_DRAFT}"
   ```
2. Extract commit hash from executor output
3. Report completion status
4. **Progress tracking (if available):** `TaskUpdate(taskId=execute_task_id, status="completed")`

**Known Claude Code bug (classifyHandoffIfNeeded):** If executor reports "failed" with error `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a real failure. Check whether the summary draft has content and git log shows commits. If so, treat as successful and save it as above.

If the summary draft is empty, error: "Executor did not produce ${next_num}-SUMMARY.md"

Note: For quick tasks producing multiple jobs (rare), spawn executors in parallel waves per execute-objective patterns.

---

**Step 6.5: Verification (only when `$FULL_MODE`)**

Skip this step entirely if NOT `$FULL_MODE`.

**Progress tracking (if available):** `TaskUpdate(taskId=verify_task_id, status="in_progress")`

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► VERIFYING RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning verifier...
```

```
Task(
  prompt="Verify quick task goal achievement.
Task directory: ${QUICK_DIR}
Task goal: ${DESCRIPTION}
Job: @${QUICK_DIR}/${next_num}-JOB.md
<!-- planning-audit: allow a quick task VERIFICATION.md is runtime-class in planning-paths: no verb owns it and it is a local file in both modes -->
Check must_haves against actual codebase. Create VERIFICATION.md at ${QUICK_DIR}/${next_num}-VERIFICATION.md.",
  subagent_type="verifier",
  model="{verifier_model}",
  description="Verify: ${DESCRIPTION}"
)
```

Read verification status:
```bash
grep "^status:" "${QUICK_DIR}/${next_num}-VERIFICATION.md" | cut -d: -f2 | tr -d ' '
```

Store as `$VERIFICATION_STATUS`.

| Status | Action |
|--------|--------|
| `passed` | Store `$VERIFICATION_STATUS = "Verified"`, continue to step 7 |
| `human_needed` | Display items needing manual check, store `$VERIFICATION_STATUS = "Needs Review"`, continue |
| `gaps_found` | Display gap summary, store `$VERIFICATION_STATUS = "Gaps"`, then ask the Gaps question below |

**Progress tracking (if available):** `TaskUpdate(taskId=verify_task_id, status="completed", description="${VERIFICATION_STATUS}")` once the status is stored (for `gaps_found`, after the Gaps answer below).

On `gaps_found`:

```
AskUserQuestion([
  {
    header: "Gaps",
    question: "Verification found gaps. Re-run the executor to fix them, or accept the task as it is?",
    multiSelect: false,
    options: [
      { label: "Re-run executor (Recommended)", description: "Spawn the executor again with the gaps from ${next_num}-VERIFICATION.md, then verify again" },
      { label: "Accept as-is", description: "Keep the result and record the task with Status Gaps" }
    ]
  }
])
```

- **If "Re-run executor":** go back to step 6 with the gap list from `${QUICK_DIR}/${next_num}-VERIFICATION.md` added to the executor prompt, then run this step again. Steps 6 and 6.5 set their tasks `in_progress` again as they start.
- **If "Accept as-is":** keep `$VERIFICATION_STATUS = "Gaps"`, continue to step 7.

---

**Step 7: Record the task in STATE.md (local mode only)**

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning mode
```
**`store`:** skip Step 7. STATE.md is a generated view there (`aof-tools gh pull --all` rebuilds it), and the closed Quick issue is the record.
**`local`:** update STATE.md with the quick task completion record, as below.

**7a. Check if "Quick Tasks Completed" section exists:**

Read STATE.md and check for `### Quick Tasks Completed` section.

**7b. If section doesn't exist, create it:**

Insert after `### Blockers/Concerns` section:

**If `$FULL_MODE`:**
```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
```

**If NOT `$FULL_MODE`:**
```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
```

**Note:** If the table already exists, match its existing column format. If adding `--full` to a project that already has quick tasks without a Status column, add the Status column to the header and separator rows, and leave Status empty for the new row's predecessors.

**7c. Append new row to table:**

Use `date` from init:

**If `$FULL_MODE` (or table has Status column):**
```markdown
| ${next_num} | ${DESCRIPTION} | ${date} | ${commit_hash} | ${VERIFICATION_STATUS} | [${next_num}-${slug}](./quick/${next_num}-${slug}/) |
```

**If NOT `$FULL_MODE` (and table has no Status column):**
```markdown
| ${next_num} | ${DESCRIPTION} | ${date} | ${commit_hash} | [${next_num}-${slug}](./quick/${next_num}-${slug}/) |
```

**7d. Update "Last activity" line:**

Use `date` from init:
```
Last activity: ${date} - Completed quick task ${next_num}: ${DESCRIPTION}
```

Use Edit tool to make these changes atomically

---

**Step 8: Final commit and completion**

Stage and commit quick task artifacts:

Build file list:
- `${QUICK_DIR}/${next_num}-JOB.md`
- `${QUICK_DIR}/${next_num}-SUMMARY.md`
- `.aoforge/STATE.md`
- If `$FULL_MODE` and verification file exists: `${QUICK_DIR}/${next_num}-VERIFICATION.md`

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs(quick-${next_num}): ${DESCRIPTION}" --files ${file_list}
```

Get final commit hash:
```bash
commit_hash=$(git rev-parse --short HEAD)
```

Display completion output:

**If `$FULL_MODE`:**
```
---

AOForge > QUICK TASK COMPLETE (FULL MODE)

Quick Task ${next_num}: ${DESCRIPTION}

Summary: ${QUICK_DIR}/${next_num}-SUMMARY.md
Verification: ${QUICK_DIR}/${next_num}-VERIFICATION.md (${VERIFICATION_STATUS})
Commit: ${commit_hash}

---

Ready for next task: /aoforge:quick
```

**If NOT `$FULL_MODE`:**
```
---

AOForge > QUICK TASK COMPLETE

Quick Task ${next_num}: ${DESCRIPTION}

Summary: ${QUICK_DIR}/${next_num}-SUMMARY.md
Commit: ${commit_hash}

---

Ready for next task: /aoforge:quick
```

</process>

<success_criteria>
- [ ] ROADMAP.md validation passes
- [ ] User provides task description (asked in plain text when missing)
- [ ] `--full` flag parsed from arguments when present
- [ ] (task tools available) Plan and Execute tasks, plus Check plan and Verify under --full, each go in_progress as their step starts and completed as it ends
- [ ] Slug generated (lowercase, hyphens, max 40 chars)
- [ ] Next number calculated (001, 002, 003...)
- [ ] `${next_num}-JOB.md` saved with `quick put` from the planner's draft (it makes `.aoforge/quick/NNN-slug/`)
- [ ] (--full) Job checker validates plan, revision loop capped at 2
- [ ] `${next_num}-SUMMARY.md` saved with `quick summary` from the executor's draft
- [ ] (--full) `${next_num}-VERIFICATION.md` produced by verifier
- [ ] (local mode) STATE.md has the quick task row (Status column when --full)
- [ ] Artifacts committed
</success_criteria>
