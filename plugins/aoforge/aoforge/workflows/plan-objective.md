---
status: active
---
<purpose>
Produce executable objective prompts (TRD.md files, published by the planner with `plan put-trd`) for a roadmap objective with optional inline discussion, integrated research, and verification. Default flow: Discuss (brief, optional) -> Research (if needed) -> Plan -> Verify -> Review the TRD drafts in plan mode (interactive runs) -> Done. Orchestrates objective-researcher, planner, and job-checker agents with a revision loop (max 3 iterations).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/aoforge/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (include file contents to avoid redundant reads):

```bash
INIT_RAW=$(node ~/.claude/aoforge/bin/aof-tools.cjs init plan-objective "$OBJECTIVE" --include state,roadmap,requirements,context,research,verification,uat)
# Large payloads are written to a tmpfile — output starts with @file:/path
if [[ "$INIT_RAW" == @file:* ]]; then
  INIT_FILE="${INIT_RAW#@file:}"
  INIT=$(cat "$INIT_FILE")
  rm -f "$INIT_FILE"
else
  INIT="$INIT_RAW"
fi
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `job_checker_enabled`, `commit_docs`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `objective_slug`, `padded_objective`, `has_research`, `has_context`, `has_jobs`, `job_count`, `planning_exists`, `roadmap_exists`, `bootstrap`, `bootstrap_objectives`.

**Bootstrap surface (one line, only when something changed).** If `bootstrap.applied` is true or
`bootstrap_objectives.applied > 0`, print exactly one line and continue:
`AOForge bootstrap: PROJECT.md +<bootstrap.added_fields joined by ,> · created <bootstrap_objectives.paths joined by , > (uncommitted — folded into the next docs commit)`
Omit whichever half did not apply. Print nothing when neither applied.

> **Note:** `has_jobs` and `job_count` cover both TRD.md and legacy JOB.md files via `findPlanFiles()` in aof-tools.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`, `verification_content`, `uat_content`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/aoforge:new-project` first.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: objective number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**Intent override flags (one-shot overrides for the resolved (kind, work) configuration):**
- `--work <type>` — Override the resolved `work` value for this planning run. Valid: `feature | port | refactor | foundation | bugfix | prototype | spike`. Useful when the inherited `default_work` is wrong for this specific objective.
- `--tdd <posture>` — Override TDD posture: `strict | per-feature | skip`.
- `--depth <level>` — Override planning depth: `quick | standard | comprehensive`.
- `--model <profile>` — Override model profile: `quality | balanced | budget`.

If any of these flags are present, record a corresponding `overrides:` block in the objective's OBJECTIVE.md so the override persists for future executor runs (not just this planning invocation). Edit a draft (seeded from the current OBJECTIVE.md) and publish it — never a direct Write under `.planning/`:
```bash
DRAFT=$(node ~/.claude/aoforge/bin/aof-tools.cjs planning draft "objectives/${padded_objective}-${objective_slug}/OBJECTIVE.md")
node ~/.claude/aoforge/bin/aof-tools.cjs objective put "${objective_number}" --from "$DRAFT"
```
(Add the `overrides:` block to the draft with the Edit/Write tool between the two commands; `$DRAFT` is the printed path, passed literally. In local mode `objective put` lands on the same OBJECTIVE.md as before.)

**If no objective number:** Detect next unplanned objective from roadmap.

**If `objective_found` is false:** Validate objective exists in ROADMAP.md (a read). If valid, make the directory with `mkdir -p` using `objective_slug` and `padded_objective` from init:
```bash
mkdir -p ".planning/objectives/${padded_objective}-${objective_slug}"
```

**Existing artifacts from init:** `has_research`, `has_jobs` (covers TRD + JOB files), `job_count`.

## 3. Validate Objective

```bash
OBJECTIVE_INFO=$(node ~/.claude/aoforge/bin/aof-tools.cjs roadmap get-objective "${OBJECTIVE}")
```

**If `found` is false:** Error with available objectives. **If `found` is true:** Extract `objective_number`, `objective_name`, `goal` from JSON.

## 4. Brief Inline Discussion (Optional)

**If `context_content` is not null** (existing CONTEXT.md from a prior discussion):
Display: `Using objective context from: ${objective_dir}/*-CONTEXT.md`
Pass `context_content` to researcher, planner, checker, and revision agents. Skip to step 5.

**If `context_content` is null AND `--skip-discuss` flag is NOT set:**

Ask 2-3 brief clarifying questions using AskUserQuestion to capture key preferences before planning. Focus on:
1. **Key design choice** — if the objective has an obvious fork (e.g., "REST vs GraphQL", "client vs server rendering")
2. **Scope constraint** — anything the user wants explicitly in or out of scope
3. **Priority** — if multiple sub-features, which matters most

Example:
```
AskUserQuestion(
  questions=[{
    header: "Approach",
    question: "For Objective {X}: {objective_name} — any preferences on approach or scope?",
    options: [
      { label: "You decide", description: "Use your best judgment based on research" },
      { label: "Let me specify", description: "I'll provide specific preferences" }
    ],
    multiSelect: false
  }]
)
```

If user selects "You decide": Note `user_preferences: "Agent discretion"` and proceed to step 5.
If user selects "Let me specify": Capture their response as `user_preferences` text. Use this in planner/researcher prompts where `context_content` would go.

**If `--skip-discuss` flag is set:** Skip discussion, proceed directly to step 5.

> **Legacy CONTEXT.md support:** If a CONTEXT.md exists from a prior `/aoforge:discuss-objective` session, it is still loaded and honored. New projects use inline discussion instead.

## 5. Present Planning Strategy

**Skip if:** `--auto` flag, `--gaps` flag, or config `workflow.auto_advance` is true.

Print the planning strategy as a short block, then go straight on to step 6. It is information only: no plan mode and no approval wait. The user approves the TRD drafts once, in plan mode, at step 13.5.

**Planning strategy**
- **Objective {X}:** {objective_name} — {goal}
- **Steps:** {Research (if enabled)} → Plan → {Verify (if enabled)} → {Review drafts} → Done
- **Models:** researcher ({researcher_model}), planner ({planner_model}), checker ({checker_model})
- **Existing context:** {list any existing RESEARCH.md, CONTEXT.md, or TRDs}
- **User preferences:** {from discussion step, if any}

## 6. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, proceed to step 7.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► RESEARCHING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Research Objective {X}",
  description="Researching implementation approach for Objective {objective_number}: {objective_name}",
  activeForm="Researching Objective {X}"
)
TaskUpdate(taskId=research_task_id, status="in_progress")
```

**Complexity assessment for model selection:**

Evaluate research complexity:
- If `--gaps` mode (gap-closure research): well-scoped domain → consider downgrading researcher to sonnet
- If objective has > 10 requirements or spans multiple subsystems: keep profile model (or upgrade)
- Standard objectives: use `researcher_model` from profile

### Spawn objective-researcher

```bash
PHASE_DESC=$(node ~/.claude/aoforge/bin/aof-tools.cjs roadmap get-objective "${OBJECTIVE}" | jq -r '.section')
# Use requirements_content from INIT (already loaded via --include requirements)
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
OBJECTIVE_REQ_IDS=$(echo "$INIT" | jq -r '.roadmap_content // empty' | grep -i "Requirements:" | head -1 | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
STATE_SNAP=$(node ~/.claude/aoforge/bin/aof-tools.cjs state-snapshot)
# Extract decisions from state-snapshot JSON: jq '.decisions[] | "\(.objective): \(.summary) - \(.rationale)"'
```

Research prompt:

```markdown
<objective>
Research how to implement Objective {objective_number}: {objective_name}
Answer: "What do I need to know to plan this objective well?"
</objective>

<phase_context>
If context/preferences exist below, they contain user decisions.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Discretion areas** = Freedom — research options, recommend
- **Out of scope** = Ignore

{context_content or user_preferences}
</phase_context>

<additional_context>
**Objective description:** {PHASE_DESC}
**Objective requirement IDs (MUST address):** {OBJECTIVE_REQ_IDS}
**Requirements:** {REQUIREMENTS}
**Prior decisions:** {decisions from STATE_SNAP}
</additional_context>

<output>
Publish `objectives/<dir>/{padded_objective}-RESEARCH.md` (relative to `.planning/`; `<dir>` is the last segment of
{objective_dir}) as your Step 5 says: `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft <that path>`, Write the
draft, then `node ~/.claude/aoforge/bin/aof-tools.cjs doc put <that path> --from <draft>`.
</output>
```

```
Task(
  prompt=research_prompt,
  subagent_type="objective-researcher",
  model="{researcher_model}",
  description="Research Objective {objective}"
)
```

### Handle Researcher Return

**Update progress (if available):**
```
TaskUpdate(taskId=research_task_id, status="completed")
```

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 7
- **`## RESEARCH BLOCKED`:** Display the blocker, then call AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Research",
    question: "Research is blocked: {blocker}. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Provide context (Recommended)", description: "You give the missing context and the researcher retries" },
      { label: "Skip research", description: "Plan without research" },
      { label: "Abort", description: "Stop here without planning" }
    ]
  }
])
```

  - If "Provide context": ask for the context in plain prose, append it to the research prompt's `<additional_context>`, and spawn the researcher again.
  - If "Skip research": continue to step 6.5 with no RESEARCH.md.
  - If "Abort": stop and display `Research blocked: planning aborted.`

## 6.5 Run Duplicate-Work Detection (plan-time)

**Skip if:** `--gaps` flag (gap closure mode skips dup-detect — already-shipped plans are inherently their own).

After research completes (or was skipped because RESEARCH.md exists), run plan-time duplicate-work detection. Per `feedback_autopilot_after_setup` memory: only blocking matches gate the planner; advisory matches log silently.

```bash
DETECT_RAW=$(node ~/.claude/aoforge/bin/aof-tools.cjs dup-detect --mode plan "${OBJECTIVE}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  # Per CONTEXT.md locked decision #8: infrastructure failures are silent at plan-time.
  echo "Note: dup-detect skipped (aof-tools dup-detect failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,"matches":[],"advisory":[],"warnings":["dup-detect CLI failed"],"mode":"plan","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
fi
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
DETECT_MATCHES_LEN=$(echo "$DETECT_RAW" | jq -r '.matches | length')
DETECT_ADVISORY_LEN=$(echo "$DETECT_RAW" | jq -r '.advisory | length')
DETECT_WARNINGS_LEN=$(echo "$DETECT_RAW" | jq -r '.warnings | length')
```

**If `DETECT_WARNINGS_LEN > 0`:** Display warnings to user (do NOT block):

```
> **Note:** Duplicate-work detection ran with degraded signals:
> - {warning 1}
> - {warning 2}
```

**If `DETECT_BLOCKING == "false"`:** No blocking match. Log result + continue.

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs dup-detect log "${OBJECTIVE}" \
  --mode plan --blocking false --resolution none 2>/dev/null || true
```

If `DETECT_ADVISORY_LEN > 0`, display the advisory entries inline as informational (not blocking):

```
**Advisory (informational — no action required):**
- weak match: peer `<branch>` — `<signal>`
- ...
```

Continue to step 7.

**If `DETECT_BLOCKING == "true"`:** Blocking match. Display detection summary + ask user.

Display the detection markdown to the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► DUPLICATE-WORK MATCH DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For each match in `DETECT_RAW.matches[]`:

```
**Match {N}** — {strength} via {source}
- Peer: `{peer_branch}` — `{peer_objective}`
- Signal: {signal}
- Score: {score}
```

Then surface AskUserQuestion (4-option locked list per CONTEXT.md decision #3):

```
AskUserQuestion(
  questions=[{
    header: "Resolution",
    question: "Detected duplicate-work overlap with peer session(s). How do you want to resolve?",
    options: [
      { label: "Merge",      description: "Abort planning. Switch to peer branch and continue there." },
      { label: "Defer",      description: "Save planning state to .planning/.deferred/. Resume later." },
      { label: "Coordinate", description: "Continue planning. Add Coordination Note to CONTEXT.md naming the peer." },
      { label: "Proceed",    description: "Continue with full warning. Likely merge conflicts at commit time." }
    ],
    multiSelect: false
  }]
)
```

Map the user's label to a resolution string:

| Label | Resolution string |
|---|---|
| Merge | `merge` |
| Defer | `defer` |
| Coordinate | `coordinate` |
| Proceed | `proceed-anyway` |

Pick the first match's `peer_branch` and `peer_objective` for the dispatch (top match by score):

```bash
USER_LABEL="<from AskUserQuestion>"
case "$USER_LABEL" in
  Merge)      RESOLUTION="merge" ;;
  Defer)      RESOLUTION="defer" ;;
  Coordinate) RESOLUTION="coordinate" ;;
  Proceed)    RESOLUTION="proceed-anyway" ;;
  *)          RESOLUTION="proceed-anyway" ;;  # fallback per error_recovery
esac

PEER_BRANCH=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_branch // ""')
PEER_OBJECTIVE=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_objective // ""')

RESOLVE_RESULT=$(node ~/.claude/aoforge/bin/aof-tools.cjs dup-detect resolve "${OBJECTIVE}" \
  --resolution "$RESOLUTION" \
  --peer-branch "$PEER_BRANCH" \
  --peer-objective "$PEER_OBJECTIVE" \
  --raw 2>&1)
```

**Workflow routing based on `$RESOLUTION`:**

- **merge** → Display the abort message + suggested git checkout command (from `RESOLVE_RESULT`). EXIT the workflow cleanly. The planner agent is NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AOF ► PLAN ABORTED — MERGE WITH PEER
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```

  Run no further steps.

- **defer** → Display the deferred state file path. EXIT the workflow cleanly. Planner agent NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AOF ► PLAN DEFERRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  State persisted to: ${RESOLVE_RESULT.defer_path}
  Resume support is v1.2; for now, run `/aoforge:plan-objective ${OBJECTIVE}` again
  after the peer session completes (and consider rebasing).
  ```

- **coordinate** OR **proceed-anyway** → Coordination Note has been appended to CONTEXT.md by `aof-tools dup-detect resolve`. RE-READ `context_content` from disk before spawning the planner (so the planner sees the new note):

  ```bash
  CONTEXT_CONTENT=$(cat "${objective_dir}/${padded_objective}-CONTEXT.md" 2>/dev/null || echo "$CONTEXT_CONTENT")
  ```

  Continue to Step 7.

Note: `aof-tools dup-detect resolve` already calls `recordResolution`, so a JSONL log entry has been appended for the user's choice. No separate logging step needed.

## 7. Check Existing TRDs

```bash
ls "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null
```

**If exists:** call AskUserQuestion:

```
AskUserQuestion([
  {
    header: "TRDs exist",
    question: "Objective {X} already has {job_count} TRD(s). What do you want to do?",
    multiSelect: false,
    options: [
      { label: "Add more TRDs", description: "Keep the existing TRDs and plan what is missing" },
      { label: "View existing", description: "List the existing TRDs, then choose again" },
      { label: "Replan from scratch", description: "Replace the existing TRDs with a fresh plan" }
    ]
  }
])
```

- If "Add more TRDs": continue to step 8; the planner numbers the new TRDs after the existing ones.
- If "View existing": list each TRD file with its objective in one line, then ask this question again.
- If "Replan from scratch": continue to step 8 and tell the planner the existing TRDs are replaced.

## 8. Use Context Files from INIT

All file contents are already loaded via `--include` in step 1 (`@` syntax doesn't work across Task() boundaries):

```bash
# Extract from INIT JSON (no need to re-read files)
STATE_CONTENT=$(echo "$INIT" | jq -r '.state_content // empty')
ROADMAP_CONTENT=$(echo "$INIT" | jq -r '.roadmap_content // empty')
REQUIREMENTS_CONTENT=$(echo "$INIT" | jq -r '.requirements_content // empty')
RESEARCH_CONTENT=$(echo "$INIT" | jq -r '.research_content // empty')
VERIFICATION_CONTENT=$(echo "$INIT" | jq -r '.verification_content // empty')
UAT_CONTENT=$(echo "$INIT" | jq -r '.uat_content // empty')
CONTEXT_CONTENT=$(echo "$INIT" | jq -r '.context_content // empty')

# Extract Cross-Repo Considerations section from CONTEXT.md (TRD 03-06)
# Section was written by /aoforge:research-objective per TRD 03-05.
# Optional: missing section/CONTEXT.md → empty placeholder.
if [[ -n "$CONTEXT_CONTENT" ]]; then
  CROSS_REPO=$(printf '%s' "$CONTEXT_CONTENT" | awk '
    /^## Cross-Repo Considerations/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    in_section { print }
  ')
fi
if [[ -z "$CROSS_REPO" ]]; then
  CROSS_REPO="_(none — research-objective did not run, or scan returned empty)_"
fi

# Extract initiative context for current repo (TRD 05-04)
# Plan-time read is file-only — never calls gh. aof-tools initiatives format-for-planner
# loads from ~/.claude/aoforge/initiatives/, filters by PROJECT.md::github_repo,
# returns formatted markdown bounded by MAX_FORMATTED_PLANNER_CHARS per initiative.
PROJECT_GITHUB_REPO=""
if [[ -f .planning/PROJECT.md ]]; then
  PROJECT_GITHUB_REPO=$(awk '/^github_repo:/ { print $2; exit }' .planning/PROJECT.md | tr -d '"')
fi
INITIATIVES=""
if [[ -n "$PROJECT_GITHUB_REPO" ]]; then
  INITIATIVES=$(node ~/.claude/aoforge/bin/aof-tools.cjs initiatives format-for-planner --repo "$PROJECT_GITHUB_REPO" 2>/dev/null || echo "")
fi
if [[ -z "$INITIATIVES" ]]; then
  INITIATIVES="_(none — initiatives not synced or no matches for this repo. Run /aoforge:initiatives sync to refresh.)_"
fi
```

## 9. Spawn planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► PLANNING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Plan Objective {X}",
  description="Creating executable plans for Objective {objective_number}: {objective_name}",
  activeForm="Planning Objective {X}"
)
TaskUpdate(taskId=plan_task_id, status="in_progress")
```

**Model selection for gap-closure mode:**

If `--gaps` flag is set: gap-closure plans are scoped and diagnosed — downgrade planner to sonnet (unless user has a model_override for planner in config.json). Log: `Model override: planner {planner_model} → sonnet (reason: gap-closure mode)`

Planner prompt:

```markdown
<planning_context>
**Objective:** {objective_number}
**Mode:** {standard | gap_closure}
**Flags:** {--skip-research if passed, otherwise none}
**Push:** {only when step 13.5 will run (none of `--auto`, `--gaps` or `workflow.auto_advance`): "Do not run `plan push`; the orchestrator pushes after the user reviews the drafts." Otherwise omit this line}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Objective requirement IDs (every ID MUST appear in a TRD's `requirements` field):** {objective_req_ids}
**Requirements:** {requirements_content}

**Objective Context/Preferences:**
If context exists below, it contains user decisions. Honor them exactly.
- **Decisions** = LOCKED — implement exactly, do not revisit
- **Discretion areas** = Freedom — make implementation choices
- **Out of scope** = Do NOT include

{context_content or user_preferences}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<additional_context>
**Cross-Repo Considerations (from CONTEXT.md, advisory):**

{CROSS_REPO}

**Active Initiatives (from ~/.claude/aoforge/initiatives/, advisory):**

{INITIATIVES}
</additional_context>

<downstream_consumer>
Output consumed by /aoforge:execute-objective. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] TRD.md files created in objective directory
- [ ] Each TRD has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from objective goal
</quality_gate>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="planner",
  model="{planner_model}",
  description="Plan Objective {objective}"
)
```

## 10. Handle Planner Return

**Update progress (if available):**
```
TaskUpdate(taskId=plan_task_id, status="completed")
```

- **`## PLANNING COMPLETE`:** Display TRD count and the return's `**Estimate:**` block as is. If the return says `**Pushed:** no` and step 13.5 will be skipped (`--auto`, `--gaps` or `workflow.auto_advance`), push now: `node ~/.claude/aoforge/bin/aof-tools.cjs plan push "${objective_number}"` (in local mode it reports `local mode` and does nothing). When step 13.5 will run, push nothing yet: step 13.5 pushes after the user approves the drafts. If `--skip-verify` or `job_checker_enabled` is false (from init): skip to step 13.5. Otherwise: step 11.
- **`## CHECKPOINT REACHED`:** Present it to the user, get the response, then spawn a continuation of the planner with that response. A `decision` checkpoint is asked with the Checkpoint question below; other types are free text.
- **`## PLANNING INCONCLUSIVE`:** Show the attempts, then ask with the Inconclusive question below.
- **`## RESEARCH NEEDED`:** The planner detected a novel domain with no research and wrote no TRDs. It is a subagent and cannot spawn the researcher, so you do. Spawn objective-researcher exactly as in step 6 (same banner, prompt and spawn call; handle its return as in step 6), appending the returned **Signals** to the research prompt's `<additional_context>` as `**Novel-domain signals (why research was triggered):** {signals}`. Then re-run the step 1 init so `has_research` and `research_content` are refreshed, and re-spawn the planner (step 9) with the new research. Allow at most one re-spawn: a second `## RESEARCH NEEDED` is handled as `## PLANNING INCONCLUSIVE`. If `--skip-research` was passed, the planner never emits this (step 9 passes the flag); if it does anyway, handle it as `## PLANNING INCONCLUSIVE` rather than overriding the flag.

**Checkpoint question (a `decision` checkpoint only):** one option per option the checkpoint lists, up to 4. With more than 4, print the numbered list, offer the first 4 and say the user may type a number under Other. Use the checkpoint's own option names and descriptions:

```
AskUserQuestion([
  {
    header: "Checkpoint",
    question: "{the checkpoint's decision}",
    multiSelect: false,
    options: [
      { label: "{option 1}", description: "{its trade-off}" },
      { label: "{option 2}", description: "{its trade-off}" }
    ]
  }
])
```

The planner continues with the chosen option. A `human-verify` or `human-action` checkpoint is free text: show what it asks and take the user's reply as the response.

**Inconclusive question:**

```
AskUserQuestion([
  {
    header: "Inconclusive",
    question: "The planner could not finish after {N} attempts. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Retry (Recommended)", description: "Spawn the planner again with the same context" },
      { label: "Add context", description: "You give more context and the planner retries with it" },
      { label: "Manual", description: "Stop here and plan manually" }
    ]
  }
])
```

- If "Retry": spawn the planner again (step 9) with the same context.
- If "Add context": ask for the context in plain prose, add it to the planner prompt's objective context, and spawn the planner again.
- If "Manual": stop and display that planning stopped; the research and context files stay in place.

## 11. Spawn job-checker Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

**Progress tracking (if available):** create the task on the first spawn only; when the revision loop spawns the checker again, just set the same task back to `in_progress`.
```
TaskCreate(
  subject="Verify Objective {X} plans",
  description="Checking plans against objective goal and requirements",
  activeForm="Verifying Objective {X} plans"
)
TaskUpdate(taskId=checker_task_id, status="in_progress")
```

```bash
PLANS_CONTENT=$(cat "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Objective:** {objective_number}
**Objective Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Objective requirement IDs (MUST ALL be covered):** {objective_req_ids}
**Requirements:** {requirements_content}

**Objective Context/Preferences:**
Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Discretion areas** = Freedom — plans can choose approach
- **Out of scope** = Plans must NOT include

{context_content or user_preferences}
</verification_context>

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
  description="Verify Objective {objective} plans"
)
```

## 12. Handle Checker Return

**Progress tracking (if available):** Verify plans ends on the final verdict, either `## VERIFICATION PASSED` or `## ISSUES FOUND` with no revision left (iteration 3). While a revision is still coming, leave it in progress.
```
TaskUpdate(taskId=checker_task_id, status="completed", description="Checker verdict: {passed | issues remain}")
```

- **`## VERIFICATION PASSED`:** Display confirmation. If checker output contains low-confidence plans (score <7 in Confidence Assessment table), display a note: `Note: Plan(s) {NN} scored below 7/10 confidence. Consider /aoforge:research-objective for [topic] before execution.` Don't block — just inform. Proceed to step 13.5.
- **`## ISSUES FOUND`:** Display issues, check iteration count, proceed to step 13.

## 13. Revision Loop (Max 3 Iterations)

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

**Update progress (if available):** the revision loop reuses the Plan task, so reopen it:
```
TaskUpdate(taskId=plan_task_id, status="in_progress", description="Revision iteration {N}/3 — addressing checker issues")
```

**Model upgrade on 3rd iteration:**

If `iteration_count == 3` (final attempt): upgrade planner model to opus regardless of profile. The repeated failures suggest subtlety that needs stronger reasoning. Log: `Model override: planner {planner_model} → opus (reason: 3rd revision attempt)`

```bash
PLANS_CONTENT=$(cat "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Objective:** {objective_number}
**Mode:** revision

**Existing TRDs:** {plans_content}
**Checker issues:** {structured_issues_from_checker}
**User review changes:** {only when step 13.5 sent the drafts back (the `## Requested changes` text, in place of the checker issues) or the user gave guidance at the max-retries question (their guidance); otherwise omit this line}
**Push:** {only when step 13.5 will run: "Do not run `plan push`; the orchestrator pushes after the user reviews the drafts." Otherwise omit this line}

**Objective Context/Preferences:**
Revisions MUST still honor user decisions.
{context_content or user_preferences}
</revision_context>

<instructions>
Make targeted updates to address the checker issues, or the user's review changes when step 13.5 sent the drafts back.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt=revision_prompt,
  subagent_type="planner",
  model="{planner_model}",
  description="Revise Objective {objective} plans"
)
```

After planner returns, **update progress (if available):** `TaskUpdate(taskId=plan_task_id, status="completed")`. Then spawn checker again (step 11, which sets the Verify plans task back to in progress), increment iteration_count.

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:` + issue list

Then call AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Max retries",
    question: "The checker still reports issues after 3 revisions. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Provide guidance (Recommended)", description: "You give direction and the planner retries" },
      { label: "Force proceed", description: "Continue despite the remaining issues" },
      { label: "Abandon", description: "Stop here and plan manually" }
    ]
  }
])
```

- If "Provide guidance": ask for the guidance in plain prose, spawn the planner with the revision prompt above (the guidance goes in `**User review changes:**`), then spawn the checker again (step 11). Step 12 routes as usual, and with issues still open this question is asked again.
- If "Force proceed": continue to step 13.5 and note the remaining issues in the plan (`Verification: Passed with override` in `<offer_next>`).
- If "Abandon": stop and display that planning was abandoned; the TRDs written so far stay in place.

## 13.5 Review TRD Drafts (plan mode)

**Skip if:** `--auto` flag, `--gaps` flag, or config `workflow.auto_advance` is true. The TRDs are already pushed then (the planner pushed them, or step 10 did). If the last planner return said `**Pushed:** no`, push now with `node ~/.claude/aoforge/bin/aof-tools.cjs plan push "${objective_number}"`. Continue to step 14.

Otherwise the user reviews the TRD drafts here before they are published. In store mode nothing has reached GitHub yet, because the planner was told not to push (step 9). In local mode the planner has already written and committed the TRDs and every revision adds a commit; the approval then runs `plan push`, which reports `local mode` and does nothing.

**Progress tracking (if available):**
```
TaskCreate(
  subject="Review Objective {X} TRD drafts",
  description="Presenting the TRD drafts for Objective {objective_number}: {objective_name} for approval",
  activeForm="Reviewing Objective {X} TRD drafts"
)
TaskUpdate(taskId=review_task_id, status="in_progress")
```

Finish everything the plan needs first: read each TRD for its wave, `depends_on`, requirements, objective and task names, take the verdict and confidence scores from step 12 (or "checker skipped"), and run `node ~/.claude/aoforge/bin/aof-tools.cjs estimate objective {X} --table --raw` as one plain command (plan mode prompts for commands outside the read-only set; if it fails or prints `No estimate:`, put that line in the plan and carry on).

```
EnterPlanMode()
```

Put in the plan, as the draft for review:
- Objective {X}: {name} — {goal}; {N} TRDs in {M} waves; checker: {verdict, confidence}
- The wave table, then per TRD: file name, wave, `depends_on`, requirements, its objective in one line, task names and `files_modified`
- The estimate table
- On approval: push the TRDs (`plan push`), then step 14

```
ExitPlanMode()
```

Never push, spawn the planner or commit while in plan mode: approval exits it first. Then, on the user's answer:

- **Approved.** If the approved plan carries edits the user made to it (Ctrl+G opens the plan in an editor), apply them first: spawn the planner in revision mode with step 13's revision prompt, `**User review changes:**` holding those edits, and no `**Push:**` line, so it pushes the revised TRDs itself (it ends with `plan push`); with no edits, push now with `node ~/.claude/aoforge/bin/aof-tools.cjs plan push "${objective_number}"`. Then `TaskUpdate(taskId=review_task_id, status="completed")` (if available) and continue to step 14.
- **"No, keep planning" with feedback.** Add a `## Requested changes` section to the plan stating the feedback concretely, one item per change and naming the TRD, and call `ExitPlanMode()` again. Approving that plan authorises the changes. Spawn the planner in revision mode with step 13's revision prompt (reopen the Plan task as step 13 does), `**User review changes:**` holding the Requested changes in place of the checker issues, and the `**Push:**` line. When it returns, re-run the checker if it is enabled (steps 11 and 12, with `iteration_count` reset to 1: a user-requested change does not use up the checker's iterations), then return to the top of this step and present the revised drafts again.

## 14. Present Final Status

Route to `<offer_next>` OR `auto_advance` depending on flags/config.

## 15. Auto-Advance Check

Check for auto-advance trigger:

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/aoforge/bin/aof-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► AUTO-ADVANCING TO EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plans ready. Spawning execute-objective...
```

Spawn execute-objective as Task:
```
Task(
  prompt="Run /aoforge:execute-objective ${OBJECTIVE} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE}"
)
```

**Handle execute-objective return:**
- **OBJECTIVE COMPLETE** → Display final summary:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AOF ► OBJECTIVE ${OBJECTIVE} COMPLETE ✓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Auto-advance pipeline finished.

  Next: /aoforge:plan-objective ${NEXT_PHASE} --auto
  ```
- **GAPS FOUND / VERIFICATION FAILED** → Display result, stop chain:
  ```
  Auto-advance stopped: Execution needs review.

  Review the output above and continue manually:
  /aoforge:execute-objective ${OBJECTIVE}
  ```

**If neither `--auto` nor config enabled:**
Route to `<offer_next>` (existing behavior).

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► OBJECTIVE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Objective {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}
Confidence: {Display confidence scores if checker ran, e.g., "01: 8/10, 02: 7/10" | "N/A" if checker skipped}

### Estimate

{output of `node ~/.claude/aoforge/bin/aof-tools.cjs estimate objective {X} --table --raw`, run now (after any revisions); show a `No estimate:` line as is. If the estimate command fails or prints `No estimate:`, show that line (or nothing) and carry on; an estimate never blocks planning or execution.}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Objective {X}** — run all {N} plans

/aoforge:execute-objective {X}

───────────────────────────────────────────────────────────────

### Visual-Eval Gate (conditional — UI objectives only)

If the planner reported a visual-eval gate for this objective (i.e. `decideUIEvalDefault.emit`
was true / the plan contains a `## Visual-Eval Gate (auto-required)` section), then:

1. Surface the gate's `callout` line in this Next Up block, e.g.:

   > 👁 Visual-eval gate auto-required for {X}: author a ui_eval state-matrix manifest, then run /aoforge:ui-eval after build.

2. Create tracked session tasks via `TaskCreate` for EACH entry in the gate's `tasks` array
   (the planner surfaced them in the Visual-Eval Gate section), e.g.:

   ```
   TaskCreate(subject="Author ui_eval state-matrix manifest for {X}", description="...", activeForm="Authoring ui_eval manifest")
   TaskCreate(subject="Run /aoforge:ui-eval visual gate for {X}", description="...", activeForm="Running /aoforge:ui-eval gate")
   ```

   so the visual-eval steps are on the session task list and not forgotten.

Non-UI objectives (no visual-eval gate) get NEITHER the callout line NOR the session tasks —
this block is strictly conditional on the gate being on.

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/objectives/{objective-dir}/*-TRD.md — review plans
- /aoforge:plan-objective {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Objective validated against roadmap
- [ ] Objective directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] objective-researcher spawned with CONTEXT.md
- [ ] Existing jobs checked
- [ ] planner spawned with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] job-checker spawned with CONTEXT.md
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] TRD drafts approved in plan mode, then pushed (step 13.5; skipped under `--auto`, `--gaps` or `workflow.auto_advance`)
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>
