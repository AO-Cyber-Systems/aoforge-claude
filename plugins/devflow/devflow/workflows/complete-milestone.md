---
status: active
---
<purpose>

Mark a shipped version (v1.0, v1.1, v2.0) as complete. Records the historical MILESTONES.md entry (`df-tools milestone put`), performs full PROJECT.md evolution review, presents the entry and PROJECT.md drafts in plan mode before publishing either, regroups ROADMAP.md by milestone, and tags the release in git.

</purpose>

<required_reading>

1. templates/milestone.md
2. templates/milestone-archive.md
3. `.planning/ROADMAP.md`
4. `.planning/REQUIREMENTS.md`
5. `.planning/PROJECT.md`

</required_reading>

<archival_behavior>

When a milestone completes:

1. Extract full milestone details to `.planning/milestones/v[X.Y]-ROADMAP.md`
2. Archive requirements to `.planning/milestones/v[X.Y]-REQUIREMENTS.md`
   (local: `df-tools milestone complete` builds both; store: each is published with `df-tools doc put milestones/v[X.Y]-<KIND>.md`)
3. Collapse ROADMAP.md — replace milestone details with one-line summary
4. Delete REQUIREMENTS.md (fresh one for next milestone)
5. Perform full PROJECT.md evolution review; the MILESTONES entry and PROJECT.md drafts are presented in plan mode (review_drafts) before they are published
6. Show the command that starts the next milestone (the offer_next step already prints it)

**Context Efficiency:** Archives keep ROADMAP.md constant-size and REQUIREMENTS.md milestone-scoped.

**Store mode (D-05):** In store mode the milestone is a native GitHub milestone; its description holds a short summary and links the wiki page `Milestone-vX_Y` with the full entry. `df-tools milestone put` sets both; `df-tools milestone complete <version>` closes the milestone and publishes the `milestones/v[X.Y]-*.md` archives as wiki pages.

**ROADMAP archive** uses `templates/milestone-archive.md` — includes milestone header (status, objectives, date), full objective details, milestone summary (decisions, issues, tech debt).

**REQUIREMENTS archive** contains all requirements marked complete with outcomes, traceability table with final status, notes on changed requirements.

</archival_behavior>

<process>

<step name="verify_readiness">

**Use `roadmap analyze` for comprehensive readiness check:**

```bash
ROADMAP=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap analyze)
```

This returns all objectives with job/summary counts and disk status. Use this to verify:
- Which objectives belong to this milestone?
- All objectives complete (all jobs have summaries)? Check `disk_status === 'complete'` for each.
- `progress_percent` should be 100%.

**Requirements completion check (REQUIRED before presenting):**

Parse REQUIREMENTS.md traceability table:
- Count total v1 requirements vs checked-off (`[x]`) requirements
- Identify any non-Complete rows in the traceability table

Present:

```
Milestone: [Name, e.g., "v1.0 MVP"]

Includes:
- Objective 1: Foundation (2/2 jobs complete)
- Objective 2: Authentication (2/2 jobs complete)
- Objective 3: Core Features (3/3 jobs complete)
- Objective 4: Polish (1/1 job complete)

Total: {objective_count} objectives, {total_jobs} jobs, all complete
Requirements: {N}/{M} v1 requirements checked off
```

**If requirements incomplete** (N < M):

```
⚠ Unchecked Requirements:

- [ ] {REQ-ID}: {description} (Objective {X})
- [ ] {REQ-ID}: {description} (Objective {Y})
```

Ask how to continue with AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Gaps",
    question: "{M-N} v1 requirements are not checked off. How do you want to continue?",
    multiSelect: false,
    options: [
      { label: "Run audit first (Recommended)", description: "/devflow:milestone audit to assess gap severity" },
      { label: "Proceed anyway", description: "Mark the milestone complete with known gaps" },
      { label: "Abort", description: "Return to development" }
    ]
  }
])
```

If "Run audit first": stop and tell the user to run `/devflow:milestone audit`.
If "Abort": stop; the user returns to development.
If "Proceed anyway": note incomplete requirements in MILESTONES.md under `### Known Gaps` with REQ-IDs and descriptions.

<config-check>

```bash
cat .planning/config.json 2>/dev/null
```

</config-check>

<if mode="yolo" OR="autonomous">

```
⚡ Auto-continuing: Milestone scope verification
[Show breakdown summary without prompting]
Proceeding to stats gathering...
```

Proceed to gather_stats.

</if>

<if mode="interactive" OR="custom with gates.confirm_milestone_scope true">

Ask with AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Ship it?",
    question: "Ready to mark this milestone as shipped?",
    multiSelect: false,
    options: [
      { label: "Ship it", description: "Mark the milestone complete and continue to stats gathering" },
      { label: "Wait", description: "Stop here; you return when ready" },
      { label: "Adjust scope", description: "Change which objectives the milestone includes" }
    ]
  }
])
```

- "Ship it": proceed to gather_stats.
- "Adjust scope": ask which objectives to include (plain prose; the answer is a list the user types).
- "Wait": stop, user returns when ready.

</if>

</step>

<step name="gather_stats">

Calculate milestone statistics:

```bash
git log --oneline --grep="feat(" | head -20
git diff --stat FIRST_COMMIT..LAST_COMMIT | tail -1
find . -name "*.swift" -o -name "*.ts" -o -name "*.py" | xargs wc -l 2>/dev/null
git log --format="%ai" FIRST_COMMIT | tail -1
git log --format="%ai" LAST_COMMIT | head -1
```

Present:

```
Milestone Stats:
- Objectives: [X-Y]
- Plans: [Z] total
- Tasks: [N] total (from objective summaries)
- Files modified: [M]
- Lines of code: [LOC] [language]
- Timeline: [Days] days ([Start] → [End])
- Git range: feat(XX-XX) → feat(YY-YY)
```

</step>

<step name="extract_accomplishments">

Extract one-liners from SUMMARY.md files using summary-extract:

```bash
# For each objective in milestone, extract one-liner
for summary in .planning/objectives/*-*/*-SUMMARY.md; do
  node ~/.claude/devflow/bin/df-tools.cjs summary-extract "$summary" --fields one_liner | jq -r '.one_liner'
done
```

Extract 4-6 key accomplishments. Present:

```
Key accomplishments for this milestone:
1. [Achievement from objective 1]
2. [Achievement from objective 2]
3. [Achievement from objective 3]
4. [Achievement from objective 4]
5. [Achievement from objective 5]
```

</step>

<step name="create_milestone_entry">

Draft the full MILESTONES.md entry now; the archive_milestone step records it with `milestone put`, after review_drafts has presented it. `node ~/.claude/devflow/bin/df-tools.cjs planning draft milestones/v[X.Y].md` prints the draft path (`$ENTRY_DRAFT` below; shell variables do not survive between Bash calls, so pass the printed path). Follow `templates/milestone.md`: version, date, objective/job/task counts, accomplishments from the SUMMARY.md files, plus any user-provided "Delivered" summary, git range, LOC stats and — if the user proceeded with gaps — `### Known Gaps`.

In local mode `df-tools milestone complete` first adds a base entry with the counts and accomplishments; `milestone put` then replaces it, because both carry the same `## v[X.Y]` heading.

</step>

<step name="evolve_project_full_review">

Full PROJECT.md evolution review at milestone completion.

Read all objective summaries:

```bash
cat .planning/objectives/*-*/*-SUMMARY.md
```

**Full review checklist:**

1. **"What This Is" accuracy:**
   - Compare current description to what was built
   - Update if product has meaningfully changed

2. **Core Value check:**
   - Still the right priority? Did shipping reveal a different core value?
   - Update if the ONE thing has shifted

3. **Requirements audit:**

   **Validated section:**
   - All Active requirements shipped this milestone → Move to Validated
   - Format: `- ✓ [Requirement] — v[X.Y]`

   **Active section:**
   - Remove requirements moved to Validated
   - Add new requirements for next milestone
   - Keep unaddressed requirements

   **Out of Scope audit:**
   - Review each item — reasoning still valid?
   - Remove irrelevant items
   - Add requirements invalidated during milestone

4. **Context update:**
   - Current codebase state (LOC, tech stack)
   - User feedback themes (if any)
   - Known issues or technical debt

5. **Key Decisions audit:**
   - Extract all decisions from milestone objective summaries
   - Add to Key Decisions table with outcomes
   - Mark ✓ Good, ⚠️ Revisit, or — Pending

6. **Constraints check:**
   - Any constraints changed during development? Update as needed

Make these PROJECT.md changes in the draft `node ~/.claude/devflow/bin/df-tools.cjs planning draft PROJECT.md` prints (seeded with the current file; `$PROJECT_DRAFT` below, passed as the printed path). Set the "Last updated" footer:

```markdown
---
*Last updated: [date] after v[X.Y] milestone*
```

Leave the draft unpublished here: the review_drafts step presents it, with the MILESTONES entry, before `doc put PROJECT.md` runs.

**Example full evolution (v1.0 → v1.1 prep):**

Before:

```markdown
## What This Is

A real-time collaborative whiteboard for remote teams.

## Core Value

Real-time sync that feels instant.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Canvas drawing tools
- [ ] Real-time sync < 500ms
- [ ] User authentication
- [ ] Export to PNG

### Out of Scope

- Mobile app — web-first approach
- Video chat — use external tools
```

After v1.0:

```markdown
## What This Is

A real-time collaborative whiteboard for remote teams with instant sync and drawing tools.

## Core Value

Real-time sync that feels instant.

## Requirements

### Validated

- ✓ Canvas drawing tools — v1.0
- ✓ Real-time sync < 500ms — v1.0 (achieved 200ms avg)
- ✓ User authentication — v1.0

### Active

- [ ] Export to PNG
- [ ] Undo/redo history
- [ ] Shape tools (rectangles, circles)

### Out of Scope

- Mobile app — web-first approach, PWA works well
- Video chat — use external tools
- Offline mode — real-time is core value

## Context

Shipped v1.0 with 2,400 LOC TypeScript.
Tech stack: Next.js, Supabase, Canvas API.
Initial user testing showed demand for shape tools.
```

**Step complete when:**

- [ ] "What This Is" reviewed and updated if needed
- [ ] Core Value verified as still correct
- [ ] All shipped requirements moved to Validated
- [ ] New requirements added to Active for next milestone
- [ ] Out of Scope reasoning audited
- [ ] Context updated with current state
- [ ] All milestone decisions added to Key Decisions
- [ ] "Last updated" footer reflects milestone completion

</step>

<step name="review_drafts">

Review the two drafts built above, the MILESTONES entry (`$ENTRY_DRAFT`) and the PROJECT.md evolution (`$PROJECT_DRAFT`), in one plan-mode review before either is published. Follow `@~/.claude/devflow/references/built-ins.md` section 2.

**Skip if:** `--auto` was passed or config `workflow.auto_advance` is true (`node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance`). Then publish the PROJECT.md draft now and continue to reorganize_roadmap; archive_milestone records the entry as usual:

```bash
node ~/.claude/devflow/bin/df-tools.cjs doc put PROJECT.md --from "$PROJECT_DRAFT"
```

Both drafts are finished and every command the review needs has run (plan mode blocks edits and prompts on shell commands outside the read-only set).

EnterPlanMode()

Put in the plan, as the drafts for review:

- the MILESTONES entry draft (full text)
- the PROJECT.md evolution: each section that changed, before → after (Validated, Active, Out of Scope, Key Decisions, Context, and "What This Is" if changed)
- **On approval:**
  1. publish the PROJECT.md draft (`doc put PROJECT.md --from`)
  2. archive_milestone archives the roadmap and requirements, then records the entry (`milestone put`)

ExitPlanMode()

**Approved:** if the approved plan carries edits the user made, apply them to the two drafts first. Then publish the PROJECT.md draft (pass the printed draft path):

```bash
node ~/.claude/devflow/bin/df-tools.cjs doc put PROJECT.md --from "$PROJECT_DRAFT"
```

Continue to reorganize_roadmap.

**"No, keep planning":** add a `## Requested changes` section to the plan that states the feedback concretely, and call ExitPlanMode again. When that plan is approved, apply the changes to the drafts and present the revised drafts again from the top of this step.

</step>

<step name="reorganize_roadmap">

Check `node ~/.claude/devflow/bin/df-tools.cjs planning mode`. **Store:** ROADMAP.md is a generated view — `gh pull --all` regroups it from the native milestones after archive_milestone; do not hand-edit it. **Local:** edit `.planning/ROADMAP.md` as today — group completed milestone objectives:

```markdown
# Roadmap: [Project Name]

## Milestones

- ✅ **v1.0 MVP** — Objectives 1-4 (shipped YYYY-MM-DD)
- 🚧 **v1.1 Security** — Objectives 5-6 (in progress)
- 📋 **v2.0 Redesign** — Objectives 7-10 (planned)

## Objectives

<details>
<summary>✅ v1.0 MVP (Objectives 1-4) — SHIPPED YYYY-MM-DD</summary>

- [x] Objective 1: Foundation (2/2 jobs) — completed YYYY-MM-DD
- [x] Objective 2: Authentication (2/2 jobs) — completed YYYY-MM-DD
- [x] Objective 3: Core Features (3/3 jobs) — completed YYYY-MM-DD
- [x] Objective 4: Polish (1/1 job) — completed YYYY-MM-DD

</details>

### 🚧 v[Next] [Name] (In Progress / Planned)

- [ ] Objective 5: [Name] ([N] plans)
- [ ] Objective 6: [Name] ([N] plans)

## Progress

| Objective             | Milestone | Jobs Complete | Status      | Completed  |
| ----------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation     | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 2. Authentication | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 3. Core Features  | v1.0      | 3/3            | Complete    | YYYY-MM-DD |
| 4. Polish         | v1.0      | 1/1            | Complete    | YYYY-MM-DD |
| 5. Security Audit | v1.1      | 0/1            | Not started | -          |
| 6. Hardening      | v1.1      | 0/2            | Not started | -          |
```

</step>

<step name="archive_milestone">

**Delegate archival to df-tools.** Check `node ~/.claude/devflow/bin/df-tools.cjs planning mode` first.

**Local mode** (as today):

```bash
ARCHIVE=$(node ~/.claude/devflow/bin/df-tools.cjs milestone complete "v[X.Y]" --name "[Milestone Name]")
```

The CLI handles:
- Creating `.planning/milestones/` directory
- Archiving ROADMAP.md to `milestones/v[X.Y]-ROADMAP.md`
- Archiving REQUIREMENTS.md to `milestones/v[X.Y]-REQUIREMENTS.md` with archive header
- Moving audit file to milestones if it exists
- Creating/appending MILESTONES.md entry with accomplishments from SUMMARY.md files
- Updating STATE.md (status, last activity)

Extract from result: `version`, `date`, `objectives`, `plans`, `tasks`, `accomplishments`, `archived`.

Verify: `✅ Milestone archived to .planning/milestones/`

Then record the full entry drafted in create_milestone_entry; it replaces the CLI's base entry:

```bash
node ~/.claude/devflow/bin/df-tools.cjs milestone put "v[X.Y]" --from "$ENTRY_DRAFT"
```

**Store mode:** `milestone complete` closes the native milestone and publishes the archives already under `milestones/`; it does not build them. Draft each archive first (`planning draft milestones/v[X.Y]-<KIND>.md` prints a path): the ROADMAP archive is the milestone's objectives and details from the current ROADMAP.md and the REQUIREMENTS archive is REQUIREMENTS.md under the archive header from `templates/milestone-archive.md` (audit-milestone already published `milestones/v[X.Y]-MILESTONE-AUDIT.md` in store mode). Then:

```bash
node ~/.claude/devflow/bin/df-tools.cjs doc put milestones/v[X.Y]-ROADMAP.md --from "$ROADMAP_DRAFT"
node ~/.claude/devflow/bin/df-tools.cjs doc put milestones/v[X.Y]-REQUIREMENTS.md --from "$REQUIREMENTS_DRAFT"
node ~/.claude/devflow/bin/df-tools.cjs milestone put "v[X.Y]" --from "$ENTRY_DRAFT"
node ~/.claude/devflow/bin/df-tools.cjs milestone complete "v[X.Y]"
```

The stats for the summary come from gather_stats.

**Objective archival (optional):** After archival completes, ask the user:

AskUserQuestion(header="Archive", question="Archive objective directories to milestones/?", options: "Yes — move to milestones/v[X.Y]-objectives/ (Recommended)" | "Skip — keep objectives in place")

If "Yes": move objective directories to the milestone archive:
```bash
mkdir -p .planning/milestones/v[X.Y]-objectives
# For each objective directory in .planning/objectives/:
mv .planning/objectives/{objective-dir} .planning/milestones/v[X.Y]-objectives/
```
Verify: `✅ Objective directories archived to .planning/milestones/v[X.Y]-objectives/`

If "Skip": Objective directories remain in `.planning/objectives/` as raw execution history. Use `/devflow:cleanup` later to archive retroactively.

After archival, the AI still handles:
- Reorganizing ROADMAP.md with milestone grouping (requires judgment)
- Full PROJECT.md evolution review (requires understanding)
- Deleting original ROADMAP.md and REQUIREMENTS.md
- These are NOT fully delegated because they require AI interpretation of content

</step>

<step name="reorganize_roadmap_and_delete_originals">

After `milestone complete` has archived, reorganize ROADMAP.md with milestone groupings, then delete originals:

**Reorganize ROADMAP.md** — group completed milestone objectives:

```markdown
# Roadmap: [Project Name]

## Milestones

- ✅ **v1.0 MVP** — Objectives 1-4 (shipped YYYY-MM-DD)
- 🚧 **v1.1 Security** — Objectives 5-6 (in progress)

## Objectives

<details>
<summary>✅ v1.0 MVP (Objectives 1-4) — SHIPPED YYYY-MM-DD</summary>

- [x] Objective 1: Foundation (2/2 jobs) — completed YYYY-MM-DD
- [x] Objective 2: Authentication (2/2 jobs) — completed YYYY-MM-DD

</details>
```

**Then delete originals:**

```bash
rm .planning/ROADMAP.md
rm .planning/REQUIREMENTS.md
```

</step>

<step name="update_state">

Check `node ~/.claude/devflow/bin/df-tools.cjs planning mode`. **Store:** STATE.md is generated — run `node ~/.claude/devflow/bin/df-tools.cjs gh pull --all` so it reflects the closed milestone, and leave the fields below to it. **Local:** most STATE.md fields were set by `milestone complete`; check them and edit the remaining ones:

**Project Reference:**

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current core value from PROJECT.md]
**Current focus:** [Next milestone or "Planning next milestone"]
```

**Accumulated Context:**
- Clear decisions summary (full log in PROJECT.md)
- Clear resolved blockers
- Keep open blockers for next milestone

</step>

<step name="handle_branches">

**If `pr_lifecycle` is true (store mode, from `init milestone-op`; the init call below returns it too), skip this step entirely and continue to git_tag:** each objective was already merged through its PR, so there is no local squash merge, no merge prompt and no branch deletion to offer, and `branching_strategy` is ignored. If an objective's PR is still open, do not merge it here; say which one, and have the user run `df-tools gh pr merge <objective>` (or `df-tools gh pr reconcile <objective>` after a human merge or a merge queue) first.

**If `pr_lifecycle` is false (local mode):** unchanged, continue below.

Check branching strategy and offer merge options.

Use `init milestone-op` for context, or load config directly:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "1")
```

Extract `branching_strategy`, `objective_branch_template`, `milestone_branch_template`, and `commit_docs` from init JSON.

**If "none":** Skip to git_tag.

**For "objective" strategy:**

```bash
BRANCH_PREFIX=$(echo "$OBJECTIVE_BRANCH_TEMPLATE" | sed 's/{.*//')
OBJECTIVE_BRANCHES=$(git branch --list "${BRANCH_PREFIX}*" 2>/dev/null | sed 's/^\*//' | tr -d ' ')
```

**For "milestone" strategy:**

```bash
BRANCH_PREFIX=$(echo "$MILESTONE_BRANCH_TEMPLATE" | sed 's/{.*//')
MILESTONE_BRANCH=$(git branch --list "${BRANCH_PREFIX}*" 2>/dev/null | sed 's/^\*//' | tr -d ' ' | head -1)
```

**If no branches found:** Skip to git_tag.

**If branches exist:**

```
## Git Branches Detected

Branching strategy: {objective/milestone}
Branches: {list}
```

Then ask what to do with them:

```
AskUserQuestion([
  {
    header: "Branches",
    question: "How should the {objective/milestone} branch(es) be handled?",
    multiSelect: false,
    options: [
      { label: "Squash merge (Recommended)", description: "Merge each branch to main as one commit" },
      { label: "Merge with history", description: "Merge each branch to main and keep its commits" },
      { label: "Delete without merging", description: "Already merged or not needed" },
      { label: "Keep branches", description: "Leave them for manual handling" }
    ]
  }
])
```

**Squash merge:** run each step as its own Bash call. Never chain a merge with its commit in one call:
gate-commits decides before a command runs, so it refuses a raw `git commit` chained after a merge.
`<branch>` is each branch in `OBJECTIVE_BRANCHES` (objective strategy, one branch at a time, steps 3-5
repeated per branch) or `MILESTONE_BRANCH` (milestone strategy, steps 3-5 once).

1. Note the branch you are on (call it `CURRENT_BRANCH`):

```bash
git branch --show-current
```

2. Switch to main:

```bash
git checkout main
```

3. Squash the branch in:

```bash
git merge --squash <branch>
```

4. Only if `commit_docs` is false, strip `.planning/` from the staging area:

```bash
git reset HEAD .planning/
```

5. Commit it. A squash leaves no `MERGE_HEAD` (only `SQUASH_MSG`), so the gate cannot see a merge in
   progress and would deny a bare `git commit`. This one command carries the inline
   `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix, the sanctioned per-command escape; it has to be on the same
   command, since the gate cannot see a variable set in an earlier call:

```bash
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "feat: <branch> for v[X.Y]"
```

6. After the last branch, return to where you started:

```bash
git checkout <CURRENT_BRANCH>
```

**Merge with history:** the same one-command-per-call rule applies. `<branch>` and `CURRENT_BRANCH` mean the
same as above.

1. Note the branch you are on (call it `CURRENT_BRANCH`):

```bash
git branch --show-current
```

2. Switch to main:

```bash
git checkout main
```

3. Merge the branch without committing. This stops the merge, and git leaves `MERGE_HEAD` behind:

```bash
git merge --no-ff --no-commit <branch>
```

4. Only if `commit_docs` is false, strip `.planning/` from the staging area:

```bash
git reset HEAD .planning/
```

5. Complete the merge as its own call. No escape prefix is needed: the gate sees the stopped merge's
   `MERGE_HEAD` and allows the commit.

```bash
git commit -m "Merge branch '<branch>' for v[X.Y]"
```

6. After the last branch, return to where you started:

```bash
git checkout <CURRENT_BRANCH>
```

**Delete without merging:**

```bash
if [ "$BRANCHING_STRATEGY" = "objective" ]; then
  for branch in $OBJECTIVE_BRANCHES; do
    git branch -d "$branch" 2>/dev/null || git branch -D "$branch"
  done
fi

if [ "$BRANCHING_STRATEGY" = "milestone" ]; then
  git branch -d "$MILESTONE_BRANCH" 2>/dev/null || git branch -D "$MILESTONE_BRANCH"
fi
```

**Keep branches:** Report "Branches preserved for manual handling"

</step>

<step name="git_tag">

Create git tag:

```bash
git tag -a v[X.Y] -m "v[X.Y] [Name]

Delivered: [One sentence]

Key accomplishments:
- [Item 1]
- [Item 2]
- [Item 3]

See .planning/MILESTONES.md for full details."
```

Confirm: "Tagged: v[X.Y]"

Ask whether to push the tag:

```
AskUserQuestion([
  {
    header: "Push tag",
    question: "Push tag v[X.Y] to the remote?",
    multiSelect: false,
    options: [
      { label: "Keep local (Recommended)", description: "Leave the tag on this machine; push it later yourself" },
      { label: "Push to origin", description: "Run git push origin v[X.Y] now" }
    ]
  }
])
```

Only "Push to origin" runs the push; "Keep local" (or any other answer) leaves the tag local:

```bash
git push origin v[X.Y]
```

</step>

<step name="git_commit_milestone">

Commit milestone completion.

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: complete v[X.Y] milestone" --files .planning/milestones/v[X.Y]-ROADMAP.md .planning/milestones/v[X.Y]-REQUIREMENTS.md .planning/milestones/v[X.Y]-MILESTONE-AUDIT.md .planning/MILESTONES.md .planning/PROJECT.md .planning/STATE.md
```
```

Confirm: "Committed: chore: complete v[X.Y] milestone"

</step>

<step name="offer_next">

```
✅ Milestone v[X.Y] [Name] complete

Shipped:
- [N] objectives ([M] plans, [P] tasks)
- [One sentence of what shipped]

Archived:
- milestones/v[X.Y]-ROADMAP.md
- milestones/v[X.Y]-REQUIREMENTS.md

Summary: .planning/MILESTONES.md
Tag: v[X.Y]

---

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/devflow:milestone new`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

</process>

<milestone_naming>

**Version conventions:**
- **v1.0** — Initial MVP
- **v1.1, v1.2** — Minor updates, new features, fixes
- **v2.0, v3.0** — Major rewrites, breaking changes, new direction

**Names:** Short 1-2 words (v1.0 MVP, v1.1 Security, v1.2 Performance, v2.0 Redesign).

</milestone_naming>

<what_qualifies>

**Create milestones for:** Initial release, public releases, major feature sets shipped, before archiving planning.

**Don't create milestones for:** Every objective completion (too granular), work in progress, internal dev iterations (unless truly shipped).

Heuristic: "Is this deployed/usable/shipped?" If yes → milestone. If no → keep working.

</what_qualifies>

<success_criteria>

Milestone completion is successful when:

- [ ] MILESTONES.md entry created with stats and accomplishments
- [ ] PROJECT.md full evolution review completed
- [ ] All shipped requirements moved to Validated in PROJECT.md
- [ ] Key Decisions updated with outcomes
- [ ] ROADMAP.md reorganized with milestone grouping
- [ ] Roadmap archive created (milestones/v[X.Y]-ROADMAP.md)
- [ ] Requirements archive created (milestones/v[X.Y]-REQUIREMENTS.md)
- [ ] REQUIREMENTS.md deleted (fresh for next milestone)
- [ ] STATE.md updated with fresh project reference
- [ ] Git tag created (v[X.Y])
- [ ] Milestone commit made (includes archive files and deletion)
- [ ] Requirements completion checked against REQUIREMENTS.md traceability table
- [ ] Incomplete requirements surfaced with proceed/audit/abort options
- [ ] Known gaps recorded in MILESTONES.md if user proceeded with incomplete requirements
- [ ] User knows next step (/devflow:milestone new)

</success_criteria>
