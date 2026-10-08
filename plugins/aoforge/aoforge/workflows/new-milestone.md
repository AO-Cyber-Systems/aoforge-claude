---
status: active
---
<purpose>

Start a new milestone cycle for an existing project. Loads project context, gathers milestone goals (from MILESTONE-CONTEXT.md or conversation), revises PROJECT.md (`aof-tools doc put`) and the STATE.md position, optionally runs parallel research, defines scoped requirements with REQ-IDs, spawns the roadmapper to plan the objectives, and commits all artifacts. Brownfield equivalent of new-project.

</purpose>

<required_reading>

Read all files referenced by the invoking prompt's execution_context before starting.

</required_reading>

<process>

## 1. Load Context

- Read PROJECT.md (existing project, validated requirements, decisions)
- Read MILESTONES.md (what shipped previously)
- Read STATE.md (pending todos, blockers)
- Check for MILESTONE-CONTEXT.md (from /discuss-milestone)

## 2. Gather Milestone Goals

**If MILESTONE-CONTEXT.md exists:**
- Use features and scope from discuss-milestone
- Present summary for confirmation

**If no context file:**
- Present what shipped in last milestone
- Ask: "What do you want to build next?"
- Use AskUserQuestion to explore features, priorities, constraints, scope

## 3. Determine Milestone Version

- Parse last version from MILESTONES.md
- Suggest next version (v1.0 → v1.1, or v2.0 for major)
- Confirm it with AskUserQuestion: the suggestion first, the other bump second. A custom version is typed under Other.

```
AskUserQuestion([
  {
    header: "Version",
    question: "Which version is this milestone?",
    multiSelect: false,
    options: [
      { label: "{suggested version} (Recommended)", description: "The suggested next version, e.g. v1.0 → v1.1" },
      { label: "{the other bump}", description: "The other bump, e.g. v2.0 for a major release" }
    ]
  }
])
```

## 4. Revise PROJECT.md

Work in the draft `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft PROJECT.md` prints (seeded with the current file). Add or revise:

```markdown
## Current Milestone: v[X.Y] [Name]

**Goal:** [One sentence describing milestone focus]

**Target features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]
```

Also revise the Active requirements section and the "Last updated" footer, then publish:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put PROJECT.md --from "$DRAFT"
```

## 5. Move STATE.md to the new milestone

Check `node ~/.claude/aoforge/bin/aof-tools.cjs planning mode`. **Store:** STATE.md is generated — `gh pull --all` refreshes it once the roadmapper has created this milestone's objectives; no hand edit here. **Local:** edit `.planning/STATE.md` as today:

```markdown
## Current Position

Objective: Not started (defining requirements)
Job: —
Status: Defining requirements
Last activity: [today] — Milestone v[X.Y] started
```

Keep Accumulated Context section from previous milestone.

## 6. Cleanup and Commit

Delete MILESTONE-CONTEXT.md if exists (consumed).

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: start milestone v[X.Y] [Name]" --files .planning/PROJECT.md .planning/STATE.md
```

## 7. Load Context and Resolve Models

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init new-milestone)
```

Extract from init JSON: `researcher_model`, `synthesizer_model`, `roadmapper_model`, `commit_docs`, `research_enabled`, `current_milestone`, `project_exists`, `roadmap_exists`.

## 8. Research Decision

```
AskUserQuestion([
  {
    header: "Research",
    question: "Research the domain ecosystem for new features before defining requirements?",
    multiSelect: false,
    options: [
      { label: "Research first (Recommended)", description: "Discover patterns, features, architecture for NEW capabilities" },
      { label: "Skip research", description: "Go straight to requirements" }
    ]
  }
])
```

**Persist choice to config** (so future `/aoforge:plan-objective` honors it):

```bash
# If "Research first": persist true
node ~/.claude/aoforge/bin/aof-tools.cjs config-set workflow.research true

# If "Skip research": persist false
node ~/.claude/aoforge/bin/aof-tools.cjs config-set workflow.research false
```

**If "Research first":**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 4 researchers in parallel...
  → Stack, Features, Architecture, Pitfalls
```

```bash
mkdir -p .planning/research
```

Spawn 4 parallel project-researcher agents. Each uses this template with dimension-specific fields:

**Common structure for all 4 researchers:**
```
Task(prompt="
<research_type>Project Research — {DIMENSION} for [new features].</research_type>

<milestone_context>
SUBSEQUENT MILESTONE — Adding [target features] to existing app.
{EXISTING_CONTEXT}
Focus ONLY on what's needed for the NEW features.
</milestone_context>

<question>{QUESTION}</question>

<project_context>[PROJECT.md summary]</project_context>

<downstream_consumer>{CONSUMER}</downstream_consumer>

<quality_gate>{GATES}</quality_gate>

<output>
Draft path: `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft research/{FILE}` — put the file there.
Publish: `node ~/.claude/aoforge/bin/aof-tools.cjs doc put research/{FILE} --from "$DRAFT"` (do not commit)
Use template: ~/.claude/aoforge/templates/research-project/{FILE}
</output>
", subagent_type="project-researcher", model="{researcher_model}", description="{DIMENSION} research")
```

**Dimension-specific fields:**

| Field | Stack | Features | Architecture | Pitfalls |
|-------|-------|----------|-------------|----------|
| EXISTING_CONTEXT | Existing validated capabilities (DO NOT re-research): [from PROJECT.md] | Existing features (already built): [from PROJECT.md] | Existing architecture: [from PROJECT.md or codebase map] | Focus on common mistakes when ADDING these features to existing system |
| QUESTION | What stack additions/changes are needed for [new features]? | How do [target features] typically work? Expected behavior? | How do [target features] integrate with existing architecture? | Common mistakes when adding [target features] to [domain]? |
| CONSUMER | Specific libraries with versions for NEW capabilities, integration points, what NOT to add | Table stakes vs differentiators vs anti-features, complexity noted, dependencies on existing | Integration points, new components, data flow changes, suggested build order | Warning signs, prevention strategy, which objective should address it |
| GATES | Versions current (verify with Context7), rationale explains WHY, integration considered | Categories clear, complexity noted, dependencies identified | Integration points identified, new vs modified explicit, build order considers deps | Pitfalls specific to adding these features, integration pitfalls covered, prevention actionable |
| FILE | STACK.md | FEATURES.md | ARCHITECTURE.md | PITFALLS.md |

After all 4 complete, spawn synthesizer. It returns the SUMMARY.md content as text — the harness
blocks subagent report files, so the orchestrator (you) writes and commits it:

```
Task(prompt="
Synthesize research outputs into SUMMARY.md.

Read: .planning/research/STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

Use template: ~/.claude/aoforge/templates/research-project/SUMMARY.md
Return the SUMMARY.md content between the BEGIN/END markers. Do not write files.
", subagent_type="research-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

**Publish and commit SUMMARY.md (orchestrator):**

a. **Extract** the text strictly between the `--- BEGIN SUMMARY.md ---` and
   `--- END SUMMARY.md ---` lines of the synthesizer's final message (markers excluded).
   *Fallback — markers missing:* take the whole final message minus a leading
   `## SYNTHESIS COMPLETE` header block (the header line and the file list / `**Output:**` lines
   that follow it, up to the first line of the summary body).
   If the message is `## SYNTHESIS BLOCKED`, surface the blocker instead of writing anything.
b. **Publish** it verbatim. Run `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft research/SUMMARY.md`,
   put the extracted text at the printed path with the Write tool, then run
   `node ~/.claude/aoforge/bin/aof-tools.cjs doc put research/SUMMARY.md --from "$DRAFT"`.
   Do not summarise, reword or reformat it: local mode stores exactly those bytes in
   `.planning/research/SUMMARY.md`; store mode publishes the research wiki page.
c. **Commit** all research in one commit. The researchers published their four files without
   committing, so this single commit covers all 5 files:
   ```bash
   node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: complete project research" --files .planning/research/
   ```

Display key findings from SUMMARY.md:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► RESEARCH COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Stack additions:** [from SUMMARY.md]
**Feature table stakes:** [from SUMMARY.md]
**Watch Out For:** [from SUMMARY.md]
```

**If "Skip research":** Continue to Step 9.

## 9. Define Requirements

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Read PROJECT.md: core value, current milestone goals, validated requirements (what exists).

**If research exists:** Read FEATURES.md, extract feature categories.

Present features by category:
```
## [Category 1]
**Table stakes:** Feature A, Feature B
**Differentiators:** Feature C, Feature D
**Research notes:** [any relevant notes]
```

**If no research:** Gather requirements through conversation. Ask: "What are the main things users need to do with [new features]?" Clarify, probe for related capabilities, group into categories.

**Scope each category** via AskUserQuestion (multiSelect: true, header max 12 chars):
- "[Feature 1]" — [brief description]
- "[Feature 2]" — [brief description]
- "None for this milestone" — Defer entire category

Track: Selected → this milestone. Unselected table stakes → future. Unselected differentiators → out of scope.

**Identify gaps** via AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Gaps",
    question: "Is anything you need missing from these categories?",
    multiSelect: false,
    options: [
      { label: "No, research covered it", description: "Proceed" },
      { label: "Yes, let me add some", description: "Capture additions" }
    ]
  }
])
```

**Generate REQUIREMENTS.md:**
- v1 Requirements grouped by category (checkboxes, REQ-IDs)
- Future Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, NOTIF-02). Continue numbering from existing.

**Requirement quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

Present FULL requirements list for confirmation:

```
## Milestone v[X.Y] Requirements

### [Category 1]
- [ ] **CAT1-01**: User can do X
- [ ] **CAT1-02**: User can do Y

### [Category 2]
- [ ] **CAT2-01**: User can do Z
```

Then confirm with AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Scope",
    question: "Does this capture what you're building?",
    multiSelect: false,
    options: [
      { label: "Looks right (Recommended)", description: "Commit these requirements and continue" },
      { label: "Adjust", description: "Return to scoping and change the list" }
    ]
  }
])
```

If "Adjust": Return to scoping.

**Commit requirements:**
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: define milestone v[X.Y] requirements" --files .planning/REQUIREMENTS.md
```

## 10. Create Roadmap

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...
```

**Starting objective number:** Read MILESTONES.md for last objective number. Continue from there (v1.0 ended at objective 5 → v1.1 starts at objective 6).

```
Task(prompt="
<planning_context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/research/SUMMARY.md (if exists)
@.planning/config.json
@.planning/MILESTONES.md
</planning_context>

<instructions>
Create roadmap for milestone v[X.Y]:
1. Start objective numbering from [N]
2. Derive objectives from THIS MILESTONE's requirements only
3. Map every requirement to exactly one objective
4. Derive 2-5 success criteria per objective (observable user behaviors)
5. Validate 100% coverage
6. Persist immediately, per your Step 7: run `node ~/.claude/aoforge/bin/aof-tools.cjs planning mode`; `local` → write ROADMAP.md and STATE.md as today; `store` → `objective add` + `objective put` per objective, then `gh pull --all`; both → publish the REQUIREMENTS.md traceability with `doc put REQUIREMENTS.md`
7. Return ROADMAP CREATED with summary

Persist first, then return.
</instructions>
", subagent_type="roadmapper", model="{roadmapper_model}", description="Create roadmap")
```

**Handle return:**

**If `## ROADMAP BLOCKED`:** Present blocker, work with user, re-spawn.

**If `## ROADMAP CREATED`:** Read ROADMAP.md, present inline:

```
## Proposed Roadmap

**[N] objectives** | **[X] requirements mapped** | All covered ✓

| # | Objective | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| [N] | [Name] | [Goal] | [REQ-IDs] | [count] |

### Objective Details

**Objective [N]: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]
```

**Ask for approval** via AskUserQuestion:

```
AskUserQuestion([
  {
    header: "Roadmap",
    question: "Approve this roadmap?",
    multiSelect: false,
    options: [
      { label: "Approve (Recommended)", description: "Commit and continue" },
      { label: "Adjust objectives", description: "Tell me what to change" },
      { label: "Review full file", description: "Show raw ROADMAP.md" }
    ]
  }
])
```

**If "Adjust objectives":** Get notes, re-spawn roadmapper with revision context, loop until approved.
**If "Review full file":** Display raw ROADMAP.md, re-ask.

**Commit roadmap** (after approval):
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: create milestone v[X.Y] roadmap ([N] objectives)" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
```

## 11. Done

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AOF ► MILESTONE INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone v[X.Y]: [Name]**

| Artifact       | Location                    |
|----------------|-----------------------------|
| Project        | `.planning/PROJECT.md`      |
| Research       | `.planning/research/`       |
| Requirements   | `.planning/REQUIREMENTS.md` |
| Roadmap        | `.planning/ROADMAP.md`      |

**[N] objectives** | **[X] requirements** | Ready to build ✓

## ▶ Next Up

**Objective [N]: [Objective Name]** — [Goal]

`/aoforge:discuss-objective [N]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

Also: `/aoforge:plan-objective [N]` — skip discussion, plan directly
```

</process>

<success_criteria>
- [ ] PROJECT.md updated with Current Milestone section
- [ ] STATE.md reset for new milestone
- [ ] MILESTONE-CONTEXT.md consumed and deleted (if existed)
- [ ] Research completed (if selected) — 4 parallel agents, milestone-aware
- [ ] Requirements gathered and scoped per category
- [ ] REQUIREMENTS.md created with REQ-IDs
- [ ] roadmapper spawned with objective numbering context
- [ ] Roadmap files written immediately (not draft)
- [ ] User feedback incorporated (if any)
- [ ] ROADMAP.md objectives continue from previous milestone
- [ ] All commits made (if planning docs committed)
- [ ] User knows next step: `/aoforge:discuss-objective [N]`

**Atomic commits:** Each objective commits its artifacts immediately.
</success_criteria>
