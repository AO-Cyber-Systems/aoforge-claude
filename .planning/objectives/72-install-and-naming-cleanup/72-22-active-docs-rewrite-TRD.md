---
objective: 72-install-and-naming-cleanup
trd: "22"
type: standard
wave: 14
depends_on: ["72-21"]
files_modified:
  - .aoforge/PROJECT.md
  - .aoforge/ROADMAP.md
  - .aoforge/REQUIREMENTS.md
  - .aoforge/STATE.md
  - CLAUDE.md
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
autonomous: true
requirements: [INST-06]
must_haves:
  truths:
    - "PROJECT.md, ROADMAP.md, REQUIREMENTS.md and STATE.md describe this project as AOForge in their live parts (titles, project reference, current focus, the v1.6 milestone and its open objectives 73-75, requirement texts HND-03 and OPS-03 now naming `aoforge-watch` and `aoforge-docs`, paths `.aoforge/`), while archived milestone sections, historical decision and session-log entries keep their DevFlow wording"
    - "The separate DevFlow platform product (devflowops, the local platform CLI/daemon) keeps its name wherever these documents mention it"
    - "CLAUDE.md no longer carries the objective 72 transition note; its 'Where we left off' section states objective 72's position and the rollout steps still open (global CLAUDE.md, vanity PR and Pages, fleet sweep, checkout move); the rename guard no longer lists CLAUDE.md as an ignore-region file unless another region remains"
    - "PROJECT.md and REQUIREMENTS.md changed through the planning verbs, ROADMAP.md and STATE.md through targeted in-place edits (local mode); the rename guard, doc-refs gate and full suite pass"
  artifacts:
    - path: .aoforge/STATE.md
      provides: "AOForge state header and live sections"
      contains: "AOForge"
    - path: CLAUDE.md
      provides: "transition note removed; current position"
  key_links:
    - from: "REQUIREMENTS.md HND-03 / OPS-03"
      to: "ROADMAP.md Objectives 73 and 74 success criteria"
      via: "same external names (aoforge-watch, aoforge-docs)"
      pattern: "aoforge-docs"
---

# TRD 72-22: Rewrite the active planning docs and CLAUDE.md in AOForge terms

<objective>
72-CONTEXT locks it: this repo's active docs (PROJECT.md, ROADMAP.md, STATE.md, REQUIREMENTS.md and CLAUDE.md) read
AOForge; archived milestones and past TRD/SUMMARY/VERIFICATION files keep their DevFlow wording as history (only their
paths changed). Now that the AOForge runtime is live and the tree is `.aoforge/`, rewrite the live parts and remove
CLAUDE.md's transition note.

Purpose: INST-06 ("this repo ... active docs in AOForge wording").
Output: four planning docs and CLAUDE.md updated.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/72-install-and-naming-cleanup/72-CONTEXT.md
@.aoforge/objectives/72-install-and-naming-cleanup/72-21-SUMMARY.md

Project kind `plugin`, work `feature`. Documentation; the guard edit is checked by the existing repo tests.

AOForge session: `node ~/.claude/aoforge/bin/aof-tools.cjs`. Write paths by class (planning-paths.cjs): PROJECT.md and
REQUIREMENTS.md are verb-owned (`aof-tools planning draft <rel>`, confirm the draft equals the live file, Edit the draft,
`aof-tools doc put <rel> --from <draft>`); ROADMAP.md and STATE.md are `generated` files that `doc put` refuses, so in
local mode (this repo) edit them in place with targeted Edit-tool hunks and commit with `aof-tools commit --files`. Never
copy a whole draft over a live file. Read narrowly with `rg -n` + offset.
</context>

<embedded_context>

<codebase_examples>
Telling the two products apart (STATE.md today):
`**Ecosystem:** AODex (...) + AOSentry (...) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)`
becomes `... + DevFlow (local platform CLI/daemon) + AOForge (this — Claude Code plugin, formerly DevFlow Claude)`.
</codebase_examples>

<anti_patterns>
- Do not rewrite history: `<details>` archived milestone blocks in ROADMAP.md, completed-objective lines' past wording,
  STATE.md's dated decisions and session log, milestone archives, past objective files.
- Do not rename the devflowops product.
- PROJECT.md and REQUIREMENTS.md only through the verbs; ROADMAP.md and STATE.md only through targeted Edit hunks.
</anti_patterns>

<error_recovery>
- A hunk that changed more than intended: `git restore <file>` (each file is clean before its edit) and redo it.
- Stale draft: `planning draft <rel>` again and reapply.
</error_recovery>

</embedded_context>

<gotchas>
- Commit with `node ~/.claude/aoforge/bin/aof-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: PROJECT.md, REQUIREMENTS.md and ROADMAP.md live parts</name>
  <files>.aoforge/PROJECT.md, .aoforge/REQUIREMENTS.md, .aoforge/ROADMAP.md</files>
  <action>
Through the planning verbs:
- PROJECT.md: name, one-line description and any live path or command in AOForge form; constraints/decisions history
  untouched.
- REQUIREMENTS.md: HND-03 `aoforge-watch`; OPS-03 Pages project `aoforge-docs`; header paths.
- ROADMAP.md: title/intro if it names the product; the v1.6 section intro; Objectives 73-75 text (`aoforge-watch`,
  `aoforge-docs`, `/aoforge:` commands, `.aoforge/` paths); leave the `<details>` archives and completed objectives'
  wording alone.
PROJECT.md and REQUIREMENTS.md through `doc put`; ROADMAP.md through Edit hunks committed with `aof-tools commit --files .aoforge/ROADMAP.md`.
  </action>
  <verify>rg -n -e 'devflow-watch' -e 'devflow-docs' .aoforge/REQUIREMENTS.md .aoforge/ROADMAP.md | rg -v '<details>' | head</verify>
  <done>No live mention of `devflow-watch`/`devflow-docs` remains in REQUIREMENTS.md or ROADMAP.md outside archives.</done>
  <recovery>If a line is ambiguous (history vs live), leave it and list it in the SUMMARY.</recovery>
</task>

<task type="auto">
  <name>Task 2: STATE.md and CLAUDE.md, and the guard's ignore-region list</name>
  <files>.aoforge/STATE.md, CLAUDE.md, plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs</files>
  <action>
STATE.md with targeted Edit hunks (generated file, local mode): heading `# AOForge State`, Project Reference (`.aoforge/PROJECT.md`), Building and
Current focus lines, Ecosystem line (codebase_examples), Current Position; dated decision entries untouched.
CLAUDE.md (Edit tool): delete the transition-note region; rewrite "Where we left off" with objective 72's state and the
open rollout steps; scan the rest for any remaining live legacy wording the guard allows only because of the region.
Guard: if CLAUDE.md has no other `rename-guard:ignore` region, remove it from IGNORE_REGION_FILES. Run the guard,
doc-refs, hook-inventory, dispatch-completeness and the full suite. Commit (`docs(72-22): active docs in AOForge terms`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Truths hold; gates and full suite green.</done>
  <recovery>If dispatch-completeness's CLAUDE.md scan loses names when the note goes, the note was the only place they
were listed: document them in the Core Tool bullets instead.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `rg -n "rename-guard:ignore" CLAUDE.md` prints nothing (or only a remaining, justified region).
- `head -3 .aoforge/STATE.md` shows the AOForge heading.
</verification>

<success_criteria>
- The live project documents speak AOForge; history keeps its words.
</success_criteria>

<output>
After completion, create `72-22-SUMMARY.md` in the objective directory through `aof-tools summary post`.
</output>
