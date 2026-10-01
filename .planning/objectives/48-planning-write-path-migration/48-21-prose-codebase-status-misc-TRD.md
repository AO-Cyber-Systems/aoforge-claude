---
objective: 48-planning-write-path-migration
trd: "21"
type: tdd
wave: 5
depends_on: ["48-04", "48-15"]
files_modified:
  - plugins/devflow/agents/codebase-mapper.md
  - plugins/devflow/devflow/templates/claude-md.md
  - plugins/devflow/devflow/templates/codebase/architecture.md
  - plugins/devflow/devflow/templates/codebase/concerns.md
  - plugins/devflow/devflow/templates/codebase/conventions.md
  - plugins/devflow/devflow/templates/codebase/integrations.md
  - plugins/devflow/devflow/templates/codebase/patterns.md
  - plugins/devflow/devflow/templates/codebase/stack.md
  - plugins/devflow/devflow/templates/codebase/structure.md
  - plugins/devflow/devflow/templates/codebase/testing.md
  - plugins/devflow/devflow/templates/continue-here.md
  - plugins/devflow/devflow/templates/global-claude-md.md
  - plugins/devflow/devflow/templates/stack.md
  - plugins/devflow/devflow/templates/user-setup.md
  - plugins/devflow/devflow/workflows/cleanup.md
  - plugins/devflow/devflow/workflows/health.md
  - plugins/devflow/devflow/workflows/help.md
  - plugins/devflow/devflow/workflows/map-codebase.md
  - plugins/devflow/devflow/workflows/pause-work.md
  - plugins/devflow/devflow/workflows/progress.md
  - plugins/devflow/devflow/workflows/resume-project.md
  - plugins/devflow/devflow/workflows/set-profile.md
  - plugins/devflow/devflow/workflows/settings.md
  - plugins/devflow/devflow/workflows/workstreams-merge.md
  - plugins/devflow/devflow/workflows/workstreams-run.md
  - plugins/devflow/devflow/workflows/workstreams-setup.md
  - plugins/devflow/devflow/workflows/workstreams-status.md
  - plugins/devflow/skills/awareness/SKILL.md
  - plugins/devflow/skills/cleanup/SKILL.md
  - plugins/devflow/skills/doctor/SKILL.md
  - plugins/devflow/skills/flow/SKILL.md
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/skills/handoff/SKILL.md
  - plugins/devflow/skills/help/SKILL.md
  - plugins/devflow/skills/initiatives/SKILL.md
  - plugins/devflow/skills/map-codebase/SKILL.md
  - plugins/devflow/skills/set-profile/SKILL.md
  - plugins/devflow/skills/settings/SKILL.md
  - plugins/devflow/skills/status/SKILL.md
  - plugins/devflow/skills/sync-roadmap/SKILL.md
  - plugins/devflow/skills/tui/SKILL.md
  - plugins/devflow/skills/workstreams/SKILL.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
autonomous: true
requirements: [GWP-02]
must_haves:
  truths:
    - "The `misc` audit group has zero violations (`misc.json` holds only `_comment`; SC1 repo test green)"
    - "Codebase maps are published with `doc put codebase/<NAME>.md --from <draft>` — the mapper agents write drafts, the orchestrator publishes; STACK.md stays tracked config and is still never written by the mapper (U-1)"
    - "gh-sync's OBJECTIVE.md write uses `objective put`; sync-roadmap explains store mode makes it a no-op (48-13); status/resume only read, or use `state` commands to record a session"
    - "help.md lists the planning verbs (`plan put-trd`, `summary post`, `doc put`, `todo add`, ...) with one line each and the rule 'in store mode `.planning/` is a read-only cache; use the verbs'"
    - "No df-tools verb line in these files redirects stderr; local-mode outputs unchanged"
  artifacts:
    - path: plugins/devflow/devflow/workflows/map-codebase.md
      provides: "doc put for codebase maps"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
      provides: "empty misc-group baseline"
  key_links:
    - "Last prose group; with 48-16..48-20 it brings every baseline to empty so 48-23 can delete them"
---

# TRD 48-21: Prose migration — codebase map, sync, status, help, workstreams (audit group `misc`)

<objective>
Rewrite the remaining skills and workflows that write planning files — codebase mapping, GitHub/roadmap sync skills, status/resume, health,
help and workstream merge — to use the verbs, and document the verbs in the help workflow. Drive the `misc` group to zero.

Purpose: GWP-02 completion. Output: prose edits + empty `misc.json`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape for prose: the test is planning-writes.repo.test.cjs (48-04). RED = empty this group's baseline; GREEN = rewrite until green. -->

## Binding rules

- RED first: empty `misc.json`, run, commit `test(48-21): misc group must have zero planning writes`. `files_modified` enumerates EVERY
  `misc`-group file in the scan set (computed at planning time), so every listed violation is in scope; edit only the files the failure list names.
- Every violation in this group is resolved in this TRD — no leftover: rewrite it to the verb, rephrase an explanatory line so it no
  longer reads as a write, or mark a genuinely read-only / runtime / tracked-config line with `<!-- planning-audit: allow <reason> -->` (48-04's
  inline mechanism; never for a real write). The group baseline ends as `{"_comment": ...}` only.
- Targeted `Edit`s; exact 48-15 command lines. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Never port 8080; no real GitHub.

## Rewrite recipe

| Old | New |
|---|---|
| Mapper agents write `.planning/codebase/<NAME>.md` directly | mapper writes to `$(df-tools planning draft codebase/<NAME>.md)`; the orchestrator (map-codebase workflow) runs `doc put codebase/<NAME>.md --from "$DRAFT"` per map |
| gh-sync writes `github_issue` into OBJECTIVE.md | `objective put <id> --from "$DRAFT"` (or leave to `gh sync`, which already writes it back — say so) |
| sync-roadmap "updates ROADMAP.md" | keep the command; add "in store mode ROADMAP.md is generated and this is a no-op; run `gh pull --all`" next to it |
| status/resume "update STATE.md with session" | `state record-session ...` |
| workstreams-merge edits ROADMAP/STATE | `planning mode` guard (local: as today; store: skip) or the matching `state`/`roadmap` command |
| help.md describes writing planning files | describe the verbs (one line each, 48-15 forms) and the store-mode rule |
| verb line with `2>/dev/null` | drop the redirect |

## Test list

1. (RED) repo test fails listing `misc`-group violations once `misc.json` is emptied.
2. After Task 1: codebase-mapper/map-codebase absent from failures; `rg -n "doc put codebase/" plugins/devflow/devflow/workflows/map-codebase.md` matches.
3. After Task 2: group clean; repo + doc-refs tests green.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED baseline + codebase mapping</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json, plugins/devflow/devflow/workflows/map-codebase.md, plugins/devflow/skills/map-codebase/SKILL.md, plugins/devflow/agents/codebase-mapper.md</files>
  <action>
Empty `misc.json`; run; commit RED. Rewrite the mapping flow per the recipe; keep codebase-mapper's "never write STACK.md yourself" rule.
Commit `docs(48-21): codebase maps publish with doc put`.
  </action>
  <verify>! node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg -q "map-codebase|codebase-mapper"</verify>
  <done>Mapping files absent from the failure list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Every remaining misc-group file (sync, status, help, workstreams, settings, templates, ...) — group green</name>
  <files>plugins/devflow/devflow/templates/claude-md.md, plugins/devflow/devflow/templates/codebase/architecture.md, plugins/devflow/devflow/templates/codebase/concerns.md, plugins/devflow/devflow/templates/codebase/conventions.md, plugins/devflow/devflow/templates/codebase/integrations.md, plugins/devflow/devflow/templates/codebase/patterns.md, plugins/devflow/devflow/templates/codebase/stack.md, plugins/devflow/devflow/templates/codebase/structure.md, plugins/devflow/devflow/templates/codebase/testing.md, plugins/devflow/devflow/templates/continue-here.md, plugins/devflow/devflow/templates/global-claude-md.md, plugins/devflow/devflow/templates/stack.md, plugins/devflow/devflow/templates/user-setup.md, plugins/devflow/devflow/workflows/cleanup.md, plugins/devflow/devflow/workflows/health.md, plugins/devflow/devflow/workflows/help.md, plugins/devflow/devflow/workflows/pause-work.md, plugins/devflow/devflow/workflows/progress.md, plugins/devflow/devflow/workflows/resume-project.md, plugins/devflow/devflow/workflows/set-profile.md, plugins/devflow/devflow/workflows/settings.md, plugins/devflow/devflow/workflows/workstreams-merge.md, plugins/devflow/devflow/workflows/workstreams-run.md, plugins/devflow/devflow/workflows/workstreams-setup.md, plugins/devflow/devflow/workflows/workstreams-status.md, plugins/devflow/skills/awareness/SKILL.md, plugins/devflow/skills/cleanup/SKILL.md, plugins/devflow/skills/doctor/SKILL.md, plugins/devflow/skills/flow/SKILL.md, plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/skills/handoff/SKILL.md, plugins/devflow/skills/help/SKILL.md, plugins/devflow/skills/initiatives/SKILL.md, plugins/devflow/skills/set-profile/SKILL.md, plugins/devflow/skills/settings/SKILL.md, plugins/devflow/skills/status/SKILL.md, plugins/devflow/skills/sync-roadmap/SKILL.md, plugins/devflow/skills/tui/SKILL.md, plugins/devflow/skills/workstreams/SKILL.md</files>
  <action>
Rewrite every remaining violation the failure list names (any file above) per the recipe. In `help.md` add a short "Planning verbs" section listing each 48-15 command with one line and the store-mode rule.
Commit `docs(48-21): sync, status and help use planning verbs`. Run repo + doc-refs tests; record counts in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Repo test green with an empty `misc.json`; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- Heuristic counts at planning time: help.md 9, map-codebase.md 9, gh-sync 4, status 3, codebase-mapper 2, map-codebase skill 2, resume 2, sync-roadmap 2, health 1, workstreams-merge 1.
</codebase_examples>
<anti_patterns>
- Letting mapper subagents call `doc put` in parallel: five concurrent wiki pushes race; publish from the orchestrator in one pass.
</anti_patterns>
<error_recovery>
- If help.md mentions write verbs only descriptively ("planner writes TRDs"), rephrase to name the verb instead of exempting.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</regression>
</validation_gates>

<verification>
- `cat plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json` → only `_comment`.
</verification>

<success_criteria>
The last group of prose writers uses verbs; every audit group is at zero.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-21-SUMMARY.md`
</output>
