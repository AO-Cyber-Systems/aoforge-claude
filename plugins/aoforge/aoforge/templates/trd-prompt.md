# Task Requirements Document (TRD) Template

> **Note:** Planning methodology is in `agents/planner.md`.
> This template defines the TRD.md output format that the agent produces.
> TRD replaces JOB.md as the primary execution document. Old JOB.md files still work for backward compatibility.

Template for `.aoforge/objectives/XX-name/{objective}-{trd}-TRD.md` - self-contained task documents optimized for parallel execution.

**Naming:** Use `{objective}-{trd}-TRD.md` format (e.g., `01-02-TRD.md` for Objective 1, TRD 2)

---

## File Template

```markdown
---
objective: XX-name
trd: NN
type: standard                # standard | tdd | ui
wave: N                       # Execution wave (1, 2, 3...). Pre-computed at plan time.
depends_on: []                # TRD IDs this task requires (e.g., ["01-01"]).
files_modified: []            # Files this TRD modifies.
autonomous: true              # false if TRD has checkpoints requiring user interaction
requirements: []              # REQUIRED — Requirement IDs from ROADMAP. MUST NOT be empty.
user_setup: []                # Human-required setup Claude cannot automate (see below)

# Goal-backward verification (derived during planning, verified after execution)
must_haves:
  truths: []                  # Observable behaviors that must be true
  artifacts: []               # Files that must exist with real implementation
  key_links: []               # Critical connections between artifacts

# ── Stack fields (OPTIONAL — defined by an active stack pack) ──
# Core reads `platform`: a pack's soft dependency selects another pack for these platforms.
# `type: ui`, `stack` and any further fields, and which are required, come from the active pack's planner
# fragment: node ~/.claude/aoforge/bin/aof-tools.cjs stack context planner
stack: <pack id>
platform: [<platform>, ...]
api_contract:                  # SHA pinning for referenced API contract files (api-contract.cjs)
  - path: "<contract file>"
    sha: "ab12cd34ef..."       # SHA256, populated at plan time by api-contract.cjs helper
---

<objective>
[What this TRD accomplishes]

Purpose: [Why this matters for the project]
Output: [What artifacts will be created]
</objective>

<file_tree>
<!-- Optional: Include when TRD creates 2+ new files -->
Files created/modified by this TRD:
```
src/
├── middleware/
│   └── auth.ts          ← CREATE
├── lib/
│   └── jwt.ts           ← CREATE
└── app/api/auth/
    └── login/route.ts   ← MODIFY
```
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
[If TRD contains checkpoint tasks (type="checkpoint:*"), add:]
@~/.claude/aoforge/references/checkpoints.md
[If TRD has type: tdd, add:]
@~/.claude/aoforge/references/tdd.md
</execution_context>

<embedded_context>
<!-- Key code snippets pulled during planning — not just @path references -->
<!-- Include actual relevant code the executor needs to see -->
[Relevant existing implementations, type definitions, or patterns
that the executor needs to understand and follow]
</embedded_context>

<codebase_examples>
<!-- Existing patterns to follow — actual code, not descriptions -->
[Real code snippets from the codebase showing the patterns
this TRD should follow for consistency]
</codebase_examples>

<context>
@.aoforge/PROJECT.md
@.aoforge/ROADMAP.md
@.aoforge/STATE.md

# Only reference prior SUMMARY refs if genuinely needed
@src/relevant/source.ts
</context>

<research_context>
<!-- Optional: Include when RESEARCH.md exists and is relevant -->
[Key findings relevant to THIS TRD's scope]
</research_context>

<anti_patterns>
<!-- Task-specific anti-patterns to avoid -->
[What NOT to do for this specific task, with reasons]
See also: @~/.claude/aoforge/references/anti-patterns.md
</anti_patterns>

<gotchas>
<!-- Optional: Include when TRD touches areas with known issues -->
[Warnings about this TRD's specific domain/libraries]
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext, another/file.ext</files>
  <action>[Specific implementation — what to do, how to do it, what to avoid and WHY]</action>
  <verify>[Command or check to prove it worked]</verify>
  <recovery>[What to do if verification fails]</recovery>
  <done>[Measurable acceptance criteria]</done>
</task>

<!-- For TDD TRDs (type: tdd), use this task structure instead: -->
<task type="tdd">
  <name>Task 1: [Feature name]</name>
  <files>path/to/source.ts, path/to/source.test.ts</files>
  <test>[Test to write — what behavior to assert]</test>
  <verify_red>[Command to run test — MUST fail]</verify_red>
  <action>[Implementation to make test pass]</action>
  <verify_green>[Command to run test — MUST pass]</verify_green>
  <recovery>[What to do if stuck in RED or GREEN]</recovery>
  <done>[Feature works, tests pass, refactored]</done>
</task>

</tasks>

<validation_gates>
<!-- Populated from STACK.md with runnable commands. Run after all tasks complete. -->
<lint>[e.g., npm run lint]</lint>
<test>[e.g., npm test]</test>
<build>[e.g., npm run build]</build>
</validation_gates>

<error_recovery>
<!-- What to do when things go wrong -->
[Recovery steps for common failure modes in this TRD's domain]
[When to retry vs when to escalate]
[Max retry attempts before stopping]
</error_recovery>

<verification>
Before declaring TRD complete:
- [ ] [Specific test command]
- [ ] [Build/type check passes]
- [ ] [Behavior verification]
</verification>

<success_criteria>
- All tasks completed with evidence
- All verification checks pass
- No errors or warnings introduced
- [TRD-specific criteria]
</success_criteria>

<output>
After completion, publish `{objective}-{trd}-SUMMARY.md`: draft it from
`node ~/.claude/aoforge/bin/aof-tools.cjs planning draft objectives/XX-name/{objective}-{trd}-SUMMARY.md`, then
`node ~/.claude/aoforge/bin/aof-tools.cjs summary post {objective}-{trd} --from <draft>` (in local mode this lands on
`.aoforge/objectives/XX-name/{objective}-{trd}-SUMMARY.md`, as before)
</output>
```

---

## Key Differences from JOB.md

| Feature | JOB.md (legacy) | TRD.md (v2) |
|---|---|---|
| Field name | `job: NN` | `trd: NN` |
| Context | `@path` references only | `<embedded_context>` with actual code |
| Examples | None | `<codebase_examples>` with real patterns |
| Anti-patterns | None | `<anti_patterns>` per-TRD |
| Recovery | None | `<recovery>` per task + `<error_recovery>` |
| TDD tasks | `tdd="true"` attribute | `type="tdd"` with structured RED/GREEN |
| Evidence | Optional | Required per-task verification |
| Stack fields | None | Optional; defined by the active stack pack's planner fragment |

## Backward Compatibility

Old JOB.md files continue to work. The system detects file suffix:
- Files ending in `-TRD.md` use TRD format
- Files ending in `-JOB.md` use legacy JOB format
- When both exist for same objective, TRD takes precedence

---

## Frontmatter Fields

| Field | Required | Purpose |
|---|---|---|
| `objective` | Yes | Objective identifier (e.g., `01-foundation`) |
| `trd` | Yes | TRD number within objective (e.g., `01`, `02`) |
| `type` | Yes | `standard`, `tdd`, or `ui` |
| `wave` | Yes | Execution wave number (1, 2, 3...) |
| `depends_on` | Yes | Array of TRD IDs this task requires |
| `files_modified` | Yes | Files this TRD touches |
| `autonomous` | Yes | `true` if no checkpoints, `false` if has checkpoints |
| `requirements` | Yes | **MUST** list requirement IDs from ROADMAP |
| `user_setup` | No | Array of human-required setup items |
| `must_haves` | Yes | Goal-backward verification criteria |

### Stack fields (optional; defined by a stack pack)

| Field | Required | Purpose |
|---|---|---|
| `stack` | No | The stack family an active pack's planner fragment sets on its TRDs. |
| `platform` | No | Array of target platforms. Core reads it for pack selection: a pack's soft dependency selects another pack for these platforms. |
| `api_contract` | No | List of `{path, sha}` for SHA-pinning referenced contract files (core helper `api-contract.cjs`). Drift detection is advisory. |

These fields are not in `FRONTMATTER_SCHEMAS.trd.required`. A pack's planner fragment, read in `<step name="break_into_tasks">` (`stack context planner` lists it), adds its own fields and halts with `## PLANNING INCONCLUSIVE` when a required one is missing.
