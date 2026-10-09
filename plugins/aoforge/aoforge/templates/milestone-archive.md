# Milestone Archive Template

The complete-milestone workflow uses this template for the archive files under `milestones/` (local: `aof-tools milestone complete` builds them; store: each is published with `aof-tools doc put milestones/<file>`).

---

## File Template

# Milestone v{{VERSION}}: {{MILESTONE_NAME}}

**Status:** ✅ SHIPPED {{DATE}}
**Objectives:** {{PHASE_START}}-{{PHASE_END}}
**Total Plans:** {{TOTAL_PLANS}}

## Overview

{{MILESTONE_DESCRIPTION}}

## Objectives

{{PHASES_SECTION}}

[For each objective in this milestone, include:]

### Objective {{PHASE_NUM}}: {{PHASE_NAME}}

**Goal**: {{PHASE_GOAL}}
**Depends on**: {{DEPENDS_ON}}
**Plans**: {{PLAN_COUNT}} plans

Jobs:

- [x] {{OBJECTIVE}}-01: {{PLAN_DESCRIPTION}}
- [x] {{OBJECTIVE}}-02: {{PLAN_DESCRIPTION}}
      [... all jobs ...]

**Details:**
{{PHASE_DETAILS_FROM_ROADMAP}}

**For decimal objectives, include (INSERTED) marker:**

### Objective 2.1: Critical Security Patch (INSERTED)

**Goal**: Fix authentication bypass vulnerability
**Depends on**: Objective 2
**Plans**: 1 plan

Jobs:

- [x] 02.1-01: Patch auth vulnerability

**Details:**
{{PHASE_DETAILS_FROM_ROADMAP}}

---

## Milestone Summary

**Decimal Objectives:**

- Objective 2.1: Critical Security Patch (inserted after Objective 2 for urgent fix)
- Objective 5.1: Performance Hotfix (inserted after Objective 5 for production issue)

**Key Decisions:**
{{DECISIONS_FROM_PROJECT_STATE}}
[Example:]

- Decision: Use ROADMAP.md split (Rationale: Constant context cost)
- Decision: Decimal objective numbering (Rationale: Clear insertion semantics)

**Issues Resolved:**
{{ISSUES_RESOLVED_DURING_MILESTONE}}
[Example:]

- Fixed context overflow at 100+ objectives
- Resolved objective insertion confusion

**Issues Deferred:**
{{ISSUES_DEFERRED_TO_LATER}}
[Example:]

- PROJECT-STATE.md tiering (deferred until decisions > 300)

**Technical Debt Incurred:**
{{SHORTCUTS_NEEDING_FUTURE_WORK}}
[Example:]

- Some workflows still have hardcoded paths (fix in Objective 5)

---

_For current project status, see .aoforge/ROADMAP.md_

---

## Usage Guidelines

<guidelines>
**When to create milestone archives:**
- After completing all objectives in a milestone (v1.0, v1.1, v2.0, etc.)
- Triggered by complete-milestone workflow
- Before planning next milestone work

**How to fill template:**

- Replace {{PLACEHOLDERS}} with actual values
- Extract objective details from ROADMAP.md
- Document decimal objectives with (INSERTED) marker
- Include key decisions from PROJECT-STATE.md or SUMMARY files
- List issues resolved vs deferred
- Capture technical debt for future reference

**Archive location:**

- Publish as `milestones/v{VERSION}-{NAME}.md`: `aof-tools doc put milestones/v{VERSION}-{NAME}.md --from <draft>`
- Example: `.aoforge/milestones/v1.0-mvp.md`

**After archiving:**

- Collapse the completed milestone in ROADMAP.md inside a `<details>` tag (local; in store mode `aof-tools gh pull --all` regenerates it)
- Move PROJECT.md to brownfield format with a Current State section, published with `aof-tools doc put PROJECT.md`
- Continue objective numbering in next milestone (never restart at 01)
  </guidelines>
