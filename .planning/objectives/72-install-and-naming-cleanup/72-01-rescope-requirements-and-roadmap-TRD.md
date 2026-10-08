---
objective: 72-install-and-naming-cleanup
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
autonomous: false
requirements: [INST-01]
must_haves:
  truths:
    - "Before any other 72 TRD runs, `estimate start 72` recorded a run state for objective 72 (objective 72, non-null `started_at`, null `finished_at`), or, when no estimate could be made, the user chose at a checkpoint either (a) calibration regenerated with the frozen DECISION-003 method (`--minutes trd_level --window 10 --through 66`, backup first) and the run state then recorded, or (b) objective 72 accepted as unscored; the SUMMARY body carries `run_state: recorded <started_at>` or `run_state: unscored (accepted: <literal reply>)`, and execution never continued silently without one of them"
    - "REQUIREMENTS.md carries INST-01 rewritten to the `/aoforge:` scope and five new requirements INST-02..INST-06 under `### Install and naming (INST)`, each mapped to Objective 72 in the traceability table; the header coverage line counts 30 requirements"
    - "ROADMAP.md's Objective 72 section is titled `Rename to AOForge and naming cleanup`, lists `INST-01, INST-02, INST-03, INST-04, INST-05, INST-06`, and has the six success criteria below; its `TRDs:` list (written at planning time) is unchanged"
    - "The v1.6 milestone list line for 72 and the milestone intro (requirement count, and the sentence that 68-72 are agent-only) match the new scope"
    - "No line outside the Objective 72 section, the v1.6 intro paragraph and the 72 list line of ROADMAP.md changed"
  artifacts:
    - path: .planning/REQUIREMENTS.md
      provides: "INST-01 rewritten; INST-02..INST-06; traceability rows; coverage 30"
      contains: "INST-06"
    - path: .planning/ROADMAP.md
      provides: "Objective 72 rescoped to the AOForge rename"
      contains: "Rename to AOForge"
  key_links:
    - from: ".planning/REQUIREMENTS.md INST-01..INST-06"
      to: "TRD frontmatter `requirements:` of 72-02..72-26"
      via: "every ID is listed by at least one TRD; `validate requirements --objective 72` reads them"
      pattern: "INST-0[1-6]"
---

# TRD 72-01: Rescope INST-01 and the Objective 72 roadmap entry to the AOForge rename

<objective>
72-CONTEXT.md changed the scope of Objective 72 from "install and naming cleanup" to "rename DevFlow to AOForge, plus
the original INST-01 cleanup". The planning documents still describe the old scope. Rewrite INST-01, add the
requirements the rename needs (INST-02..INST-06), and rewrite the Objective 72 roadmap entry, through the planning
verbs. Before that, as a gate, record the run-state estimate that EST-11 scores: this TRD runs alone in wave 1 and
every other 72 TRD depends on it, so the estimate exists before any code changes.

Purpose: every later TRD of 72 cites INST-02..INST-06; verification and EST-11 read these documents.
Output: the run state for 72 (or the user's explicit unscored acceptance); REQUIREMENTS.md and ROADMAP.md rewritten.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`. No `tdd` tasks.

**Gate (Task 1).** It is a `checkpoint:decision` that asks only when `estimate start 72` cannot make an estimate. In yolo
mode the orchestrator auto-selects a decision's first option, which is (a): local, reversible from the backup, and the
frozen method, so nothing is fitted to the scored objectives. Option (b) (unscored) is never auto-selected: if (a) does
not produce an estimate, the task escalates to a `checkpoint:human-action`, which always stops for the user.

Read narrowly:
- `.planning/REQUIREMENTS.md`: lines 1-10 (header, coverage line), 45-48 (`### Install and naming (INST)`), 85-100
  (traceability table).
- `.planning/ROADMAP.md`: the v1.6 intro paragraph (`rg -n "Sequencing: 65 releases" .planning/ROADMAP.md`), the list
  line `- [ ] **Objective 72:`, and the `### Objective 72:` section. Its end is the next `### Objective ` heading.
</context>

<embedded_context>

<codebase_examples>
REQUIREMENTS.md is a verb-owned document (planning-paths class `cache`): planning verb round trip.
```bash
node ~/.claude/devflow/bin/df-tools.cjs planning draft REQUIREMENTS.md        # prints DRAFT path, seeded with the live file
# confirm the draft equals the live file (`cmp <DRAFT> .planning/REQUIREMENTS.md`), edit it with the Edit tool, then:
node ~/.claude/devflow/bin/df-tools.cjs doc put REQUIREMENTS.md --from <DRAFT path> --message "docs(72-01): rescope INST-01 to the AOForge rename"
```
`doc put` refuses a stale draft and names `planning draft <rel>`; re-run that and redo the edit. Shell variables do not
survive between Bash calls: pass the literal path.

ROADMAP.md is a `generated` file: `doc put` refuses it. In local mode (`df-tools planning mode` prints `local`, true for
this repo) edit `.planning/ROADMAP.md` directly with the Edit tool (targeted `old_string` hunks inside the bounds below)
and commit it with `df-tools commit ... --files .planning/ROADMAP.md`. Never copy a whole draft over it: at planning a
reused draft path held a stale ROADMAP and would have reverted other sections.

Run-state file (objective 58, schema v1): `~/.claude/devflow/state/estimates/<repo-key>.json` with keys
`version, objective, started_at, updated_at, finished_at, estimate, waves`. The repo key for this checkout is
`devflow-claude-d3dccfe9`.
</codebase_examples>

<anti_patterns>
- REQUIREMENTS.md only through `planning draft` + `doc put`; ROADMAP.md only through targeted Edit hunks (local mode).
- Do not touch Objective 73/74/75 text here (the `devflow-watch` / `devflow-docs` wording there changes in 72-22,
  after the rename ships).
- Do not mark any requirement complete. Do not change the `TRDs:` list under Objective 72.
- Never invent a start time, never hand-edit the run-state file, and never go past Task 1 without a recorded run state
  or the user's explicit unscored acceptance.
</anti_patterns>

<error_recovery>
- `doc put` exit 1 "stale draft": run `planning draft <rel>` again (it reseeds and keeps `<draft>.stale`), reapply.
- If `validate requirements --objective 72` (run in verify) reports W065 for INST ids, that is expected (nothing is
  satisfied yet) only if it names VERIFICATION; any parse error means the requirement line format is wrong: match the
  existing `- [ ] **ID**: text` shape exactly.
</error_recovery>

</embedded_context>

<gotchas>
- The ROADMAP edit must stay inside the 72 section, the 72 list line and the v1.6 intro paragraph. Check with
  `git diff -U0 .planning/ROADMAP.md` before committing.
- Live runtime during 72 is the installed DevFlow 2.15.0: `node ~/.claude/devflow/bin/df-tools.cjs`. Never port 8080.
</gotchas>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Gate: record the run-state estimate for 72 before anything else runs</name>
  <files>(none in the repo: writes the run state under ~/.claude/devflow/state/estimates/; option (a) rewrites ~/.claude/devflow/calibration.json after a backup)</files>
  <action>
Pre-check (idempotency): one `node -e` call on `~/.claude/devflow/state/estimates/devflow-claude-d3dccfe9.json` printing
`objective`, `started_at`, `finished_at`. If it already shows objective 72 with a non-null `started_at` and a null
`finished_at`, record `run_state: recorded <started_at>` and finish this task without asking.

Otherwise run `node ~/.claude/devflow/bin/df-tools.cjs estimate start 72 --raw` once.
- It records a run state (the state file now shows objective 72): record `run_state: recorded <started_at>` and the
  printed estimate line. Done; no question.
- It prints `No estimate: <reason>` (at planning, `estimate objective 72` printed "objective 72 has no minutes data in
  the calibration"): STOP. Never continue silently. Return `## CHECKPOINT REACHED` (decision) with the reason verbatim
  and exactly two options:
  (a) Regenerate the calibration with the frozen DECISION-003 method, then retry: copy
      `~/.claude/devflow/calibration.json` to `<scratchpad>/calibration.before-72.json` (the backup), run
      `node ~/.claude/devflow/bin/df-tools.cjs calibrate --minutes trd_level --window 10 --through 66` (the method objective
      67 froze; nothing from 68 on is fitted), record its `method` block, then run `estimate start 72 --raw` again.
  (b) Accept objective 72 as unscored for EST-11: record `run_state: unscored (accepted: <literal reply>)`; objective 75
      then reports 72 as unscored.
On (a): a retry that records a run state -> record `run_state: recorded <started_at>` and the backup path. A retry that
still prints `No estimate` -> return a `checkpoint:human-action` (it always stops, even in yolo): "Calibration regenerated
with the frozen method, but objective 72 still has no estimate (<reason>). Reply `unscored` to accept 72 as unscored,
`restore` to put the backed-up calibration back and hold, or anything else to hold." Never choose (b) on the user's
behalf, never edit the state file, never invent a start time.
  </action>
  <instructions>EST-11 scores objective 72 only if its run-state estimate exists before execution. No estimate could be
made; choose how to proceed.</instructions>
  <verification>The state file shows objective 72 with a non-null `started_at`, or the SUMMARY records the user's literal
acceptance of unscored.</verification>
  <resume-signal>Reply "a" (regenerate with the frozen method and retry), "b" (accept 72 as unscored), or anything else to hold.</resume-signal>
  <verify>`node -e` on the state file prints objective 72 and a non-null `started_at`, or the SUMMARY carries the line `run_state: unscored (accepted: ...)`</verify>
  <done>Exactly one of: the run state was recorded before any other 72 TRD ran; or the user accepted 72 as unscored in so
many words. The SUMMARY body carries the `run_state:` line that 72-07, 72-18, 72-21 and 72-26 read.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite INST-01 and add INST-02..INST-06 in REQUIREMENTS.md</name>
  <files>.planning/REQUIREMENTS.md</files>
  <action>
Through `planning draft REQUIREMENTS.md` + `doc put`:

1. Replace the INST-01 line with:
   `- [ ] **INST-01**: No legacy \`df-*\` skills or agents remain under \`~/.claude\` (they are moved to a backup, never deleted), and \`doctor\` flags any that reappear. Every user-facing reference uses the \`/aoforge:<name>\` form; a repo test fails on the \`/df-\`, \`/df:\` and \`/devflow:\` command forms in user-facing files, with changelogs and archives exempt.`
2. Rename the heading to `### Install, naming and the AOForge rename (INST)` and add, after INST-01:
   - INST-02: DevFlow is renamed AOForge everywhere it is a name: the plugin `aoforge@aocyber`, the `/aoforge:` slash
     namespace, `aoforge:<agent>` agent types, the `aof-tools` CLI, the `~/.claude/aoforge/` runtime, `AOFORGE_*`
     environment variables, the `.aoforge/` project directory, the `aoforge{}` config stamp, the `AOF ►` banner and the
     external names (`aoforge-claude`, `aoforge-docs`, `aoforge-checks.yml`, `aoforge-watch`, `aoforge/adopt`). A repo
     test fails on a legacy name outside the compatibility module, the history allowlist and the pointer plugin.
   - INST-03: Old names keep working for exactly one release: `DEVFLOW_*` variables are honoured (`AOFORGE_*` wins),
     `~/.claude/devflow/` state migrates to `~/.claude/aoforge/` with a backup first, gates accept `devflow:` agent
     types, every tool resolves `.aoforge/` first and falls back to `.planning/` with a W-code advisory naming the
     migration, old CLAUDE.md block markers and GitHub markers and labels are recognised so nothing is duplicated, and
     readers accept the `devflow{}` config key.
   - INST-04: Projects move forward in place: an auto migration moves `.planning/` to `.aoforge/` with `git mv` from
     the SessionStart upgrade hook (skipped on a dirty tree or mid-merge/rebase, backup first, store-mode cache
     handled), config `devflow{}` becomes `aoforge{}`, CLAUDE.md managed blocks and routing text are rewritten to
     AOForge, and store-mode GitHub artefacts (labels, hidden markers, wiki pages, wording, check contexts) are renamed
     by a verb that previews with a dry run and applies one repository at a time after approval.
   - INST-05: AOForge ships as 3.0.0: the three version files agree, the CHANGELOG 3.0.0 entry leads with the rename
     and links the migration guide, a final `devflow@aocyber` pointer release tells users to install `aoforge@aocyber`
     and forwards its skills to `/aoforge:`, an installed devflow plugin is detected and the user told to disable it
     (pointer hooks no-op beside aoforge), and the README and docs site show the real gold AO emblem with an AOForge
     wordmark.
   - INST-06: The user's setup is moved over, each live step only after explicit approval: this repository's planning
     tree is `.aoforge/` with its active docs in AOForge wording; the global CLAUDE.md block routes to `/aoforge:`
     (hand-written text changes only after a shown diff is approved); the GitHub repository is `aoforge-claude`; the
     local checkout is `~/dev/aoforge-claude` with its remote, Claude memory and keyed runtime state carried over; a
     vanity-mapping PR is drafted for review; the Pages project is `aoforge-docs`; and every fleet repository using
     DevFlow is upgraded with one checkpoint per repository.
   Write each as one `- [ ] **INST-0N**: …` line like INST-01.
3. Traceability: add `| INST-02 | Objective 72 | Pending |` through INST-06 after the INST-01 row.
4. Header: `**Coverage:**` and the "25 mapped" style counts become 30 (keep the completed count as it is today).
  </action>
  <verify>`rg -n -e 'INST-0[1-6]' .planning/REQUIREMENTS.md` shows six requirement lines and six traceability rows;
`node ~/.claude/devflow/bin/df-tools.cjs validate requirements --objective 72 --raw` exits 0 or reports only W065-free
output.</verify>
  <done>INST-01..INST-06 are in REQUIREMENTS.md in the existing line format, mapped to Objective 72.</done>
  <recovery>If `doc put` refuses, reseed with `planning draft REQUIREMENTS.md` and reapply the same three edits.</recovery>
</task>

<task type="auto">
  <name>Task 3: Rewrite the Objective 72 roadmap entry</name>
  <files>.planning/ROADMAP.md</files>
  <action>
With targeted Edit-tool hunks on `.planning/ROADMAP.md` (local mode; see codebase_examples), inside these bounds only:

1. List line: `- [ ] **Objective 72: Rename to AOForge and naming cleanup** - DevFlow becomes AOForge with one-release
   shims and in-place migrations, ships as 3.0.0, the user's setup and fleet move over, and no legacy \`df-*\` remains`.
2. v1.6 intro: "25 mapped to Objectives 65-75" becomes "30 mapped". In the sequencing paragraph, keep that 68-72 are
   the five EST-11 scores and that each records a run-state estimate first, but replace the claim that they are all
   agent-only with: "68-71 are agent-only work; 72 is scored in full, including the wait time of its rollout
   checkpoints (accepted 2026-10-08)".
3. Section heading `### Objective 72: Rename to AOForge and naming cleanup`.
   **Goal**: DevFlow becomes AOForge everywhere it is a name, old names keep working for one release, every project
   and the user's setup move over in place, and the legacy `df-*` install is gone and stays gone. Scored by EST-11 (all
   of it, including checkpoint wait time).
   **Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06
   **Depends on**: unchanged.
   **Success Criteria**:
   1. `ls ~/.claude/skills ~/.claude/agents` shows no `df-*` entries (moved to backup, never deleted), and `doctor`
      flags one that reappears.
   2. A repo test fails on `/df-`, `/df:` or `/devflow:` command forms in user-facing files (changelogs and archives
      exempt) and on any legacy DevFlow name outside the compatibility module, the history allowlist and the pointer
      plugin; every user-facing reference uses `/aoforge:<name>`.
   3. With only old names present (`DEVFLOW_*` set, a `.planning/` project with a `devflow{}` stamp, an old CLAUDE.md
      block, `devflow:` agent types and GitHub markers), every tool still works, `validate health` names the migration,
      and nothing is duplicated.
   4. A session start in a clean `.planning/` project moves it to `.aoforge/` with `git mv` and commits only the move;
      a dirty or mid-merge tree is skipped; config, CLAUDE.md and (after a dry run and approval) store-mode GitHub
      artefacts are renamed.
   5. 3.0.0 is tagged on `main` with the three version files in step and a CHANGELOG entry leading with the rename;
      the `devflow@aocyber` pointer release tells users to install `aoforge@aocyber`; aoforge flags an enabled devflow
      plugin.
   6. After approval of each step: this repo runs on `.aoforge/`, the global CLAUDE.md routes to `/aoforge:`, the repo
      is `aoforge-claude`, the checkout is `~/dev/aoforge-claude` with memory and run state carried over, the vanity PR
      is open for review, the Pages project is `aoforge-docs`, and each fleet repo was upgraded behind its own
      checkpoint.
   Keep the `**TRDs**:` count line and the `TRDs:` list exactly as planning wrote them.
  </action>
  <verify>`git diff -U0 .planning/ROADMAP.md` shows changes only in the three places above;
`node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective 72 --raw` prints the new title and goal.</verify>
  <done>The 72 entry describes the AOForge rename scope with six success criteria and six requirement ids.</done>
  <recovery>If a hunk landed outside the bounds, `git restore .planning/ROADMAP.md` (it was clean before this task) and
redo the edit; never commit an out-of-bounds change. Commit with
`df-tools commit "docs(72-01): rescope objective 72 to the AOForge rename" --files .planning/ROADMAP.md`.</recovery>
</task>

</tasks>

<validation_gates>
<test>node ~/.claude/devflow/bin/df-tools.cjs validate requirements --objective 72 --raw</test>
</validation_gates>

<verification>
- `rg -n -e 'INST-0[1-6]' .planning/REQUIREMENTS.md .planning/ROADMAP.md` lists every id in both files.
- `git diff --stat HEAD~2 -- .planning/` shows only REQUIREMENTS.md and ROADMAP.md (plus STATE/SUMMARY from the
  executor's own bookkeeping).
</verification>

<success_criteria>
- INST-01 is rewritten and INST-02..INST-06 exist and are mapped to 72.
- The roadmap entry for 72 matches 72-CONTEXT.md's scope.
- The run state for 72 was recorded before any other TRD ran, or the user accepted 72 as unscored in so many words.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-01-SUMMARY.md` through
`df-tools summary post`.
</output>
