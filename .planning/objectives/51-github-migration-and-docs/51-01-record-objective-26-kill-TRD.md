---
objective: 51-github-migration-and-docs
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - .planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/PROJECT.md
  - .planning/decisions/
autonomous: true
requirements: [GMD-04]
must_haves:
  truths:
    - "Objective 26's OBJECTIVE.md frontmatter reads `status: cancelled`, written by `objective set-status 26 cancelled` (never `objective remove`; no directory is renamed or renumbered)"
    - "Objective 26's OBJECTIVE.md has a `## Disposition` section stating it was killed on 2026-10-01 by user decision (GMD-04), with the rationale, and its locked-design text is kept below it"
    - "ROADMAP.md says objective 26 is killed in the milestone list line, the Other v1.4 candidates bullet and the Progress row; objective 51 success criterion 2 reads `objective 26 killed; decision recorded`"
    - "STATE.md Recent Decisions and PROJECT.md's v1.4 open-decision list record the kill as resolved"
    - "A decision-queue entry attached to TRD 51-01 records the question and its answer (decision open + decision answer), so the decision survives the GitHub backfill as a closed Decision issue"
    - "`validate consistency` and the doc-refs repo test stay green"
  artifacts:
    - path: .planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md
      provides: "status: cancelled + Disposition section"
  key_links:
    - "51-03 history ops map `status: cancelled` to closed `not_planned`, so a later backfill of this repo files objective 26 as a closed, not-planned issue"
---

# TRD 51-01: record the kill of objective 26 (GMD-04)

<objective>
Record the user's decision to KILL objective 26 (GitHub issue auto-build monitor) everywhere the plan names it, through the planning
verbs, so the record is durable in local mode now and flows to GitHub as a closed `not_planned` issue when the repo is backfilled.
No code changes.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- The installed mirror `~/.claude/devflow` is stale (no `doc`/`decision`/`plan` verbs). Run every verb from the repo:
  `node plugins/devflow/devflow/bin/df-tools.cjs <verb> ...`. Drafts and temp files under `/private/tmp/claude-501/` only.
- Planning files change only through verbs (`objective set-status`, `objective put --from`, `doc put --from`, `decision open|answer`).
  `planning draft <rel>` gives a temp copy to edit. This repo is local mode (`planning mode` prints `local`).
- **Never** `objective remove` (it cascade-renumbers every objective above 26; memory note `feedback_dftools_objective_ops`).
- ROADMAP.md edits are confined to the lines named below. Do not touch any other objective's section (objective 51's TRD list was
  written by the planner; leave it).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No TDD: this TRD changes planning records only. <!-- TDD-EXCEPTION: decision record, no code -->

## Decisions

- **Status**: `cancelled` is the repo's designed terminal state (`STATUSES`, planning-verbs.cjs L416); store mode maps it to
  `state: closed, state_reason: not_planned`.
- **Rationale text (user-supplied, use verbatim in substance):** "Killed 2026-10-01 by user decision (GMD-04). The GitHub store
  (objective 47) and the objective branch and PR lifecycle (objective 49) already cover most of its value: the issue graph, the linked
  branch and the one PR per objective. An unattended issue-driven builder is not worth its trust and safety surface now (the
  unattended runner is a prompt-injection surface that the trusted-author gate only narrows). Not re-based. The locked design below is
  kept as the record of the constraints for any future restart."
- **Decision file (research default, OQ3/§4 item 4)**: `decision open 51-01 --question @<file>` then
  `decision answer DECISION-NNN --from <file>` (local ids are `DECISION-NNN`; read the id from the `decision open` output). Question:
  "Objective 26 (GitHub issue auto-build monitor): re-base on objectives 47 and 49, or kill?" Answer: "Kill." plus the rationale.
- **MILESTONES.md**: no entry (v1.4 is not complete).
- The untracked `.gitkeep` files under `.planning/objectives/26-31/` are unrelated; do not add them.

## Test list

1. `objective set-status 26 cancelled` → OBJECTIVE.md frontmatter has `status: cancelled`; `git diff` shows only that change.
2. After `objective put 26`: the Disposition section is present above `## Locked decisions`; every original line is still present.
3. ROADMAP: `rg -n "26" .planning/ROADMAP.md` shows the four edited places say killed/cancelled and nothing else changed.
4. `node plugins/devflow/devflow/bin/df-tools.cjs validate consistency` reports no new error.
5. `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` green.

<tasks>

<task type="auto">
  <name>Task 1: objective 26 status, disposition and decision record</name>
  <files>.planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md, .planning/decisions/</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs objective set-status 26 cancelled` (local mode: frontmatter write, no gh call).
2. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md` → edit the
   printed temp copy: insert `## Disposition` (the rationale from Decisions) directly after `## Goal`'s paragraph and before
   `## Locked decisions`. Then `objective put 26 --from <draft>`.
3. Write the question to `/private/tmp/claude-501/obj26-question.md`, run `decision open 51-01 --question @<that file>`, then
   `decision answer <DECISION-id> --from <answer file>`.
4. Commit `docs(51-01): kill objective 26 (GMD-04)` with the OBJECTIVE.md and the decision file(s) the verbs wrote
   (`git status --short .planning/decisions` lists them).
  </action>
  <verify>head -5 .planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md | grep -q "status: cancelled" && grep -q "^## Disposition" .planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md && git log -1 --stat</verify>
  <done>Test list 1-2 hold; the decision file exists with the question and the answer; one commit.</done>
</task>

<task type="auto">
  <name>Task 2: ROADMAP, STATE and PROJECT lines</name>
  <files>.planning/ROADMAP.md, .planning/STATE.md, .planning/PROJECT.md</files>
  <action>
ROADMAP.md (hand-maintained in local mode; edit through `planning draft .planning/ROADMAP.md`-style draft + `doc put ROADMAP.md --from`,
or a targeted Edit if `doc put` does not own ROADMAP.md: check `planning-paths.classify('ROADMAP.md').verb` first and use the verb it names):
- milestone list line 8: replace "Objective 26 (moved from v1.3 2026-09-28; kill candidate)" with "Objective 26 (KILLED 2026-10-01)".
- "Other v1.4 candidates" bullet: lead with "**KILLED 2026-10-01** (user decision, GMD-04; see its OBJECTIVE.md Disposition)" and drop
  "candidate for killing".
- Progress row 26: status `Cancelled (killed by user decision 2026-10-01; GMD-04)`, Completed `2026-10-01`.
- Objective 51 success criterion 2: `Docs pass doc-refs; objective 26 killed; decision recorded`.
STATE.md `## Recent Decisions`: prepend one dated bullet: "**Objective 26 killed (2026-10-01, GMD-04)** — user decision; status
cancelled, Disposition in its OBJECTIVE.md, decision <DECISION-id>."
PROJECT.md: replace "Objective 26 ... moved to v1.4 as a kill candidate." with "Objective 26 (GitHub issue auto-build monitor) was killed
on 2026-10-01 (resolved; GMD-04)." Use the verb `planning-paths` names for STATE.md/PROJECT.md (`doc put` for PROJECT.md).
Commit `docs(51-01): record objective 26 kill in roadmap, state and project`.
# GOTCHA: ROADMAP has several `26` substrings (dates, `2026`); edit only the four places above.
  </action>
  <verify>node plugins/devflow/devflow/bin/df-tools.cjs validate consistency; node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs</verify>
  <done>Test list 3-5 pass; `git diff HEAD~1 -- .planning/ROADMAP.md` touches only the four named places.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `planning-verbs-cli.cjs` L8-24: usage of every verb (`objective set-status <id> <status>`, `objective put <id> --from`,
  `doc put <rel> --from`, `decision open <trd-id> --question <text|@path>`, `decision answer <id> --from`, `planning draft <rel>`).
- `planning-verbs.cjs` `objectiveSetStatus` L492, `STATUSES` L416, `STATUS_PATCH` ~L419 (cancelled → not_planned).
- `.planning/decisions/pending/DECISION-001.md` — existing decision file shape (`trd: 27-03`).
</codebase_examples>
<anti_patterns>
- `objective remove 26` (destructive renumber) or deleting the directory.
- Rewriting the locked-design text of objective 26 (it is the only record of the allowlist constraint).
</anti_patterns>
<error_recovery>
- If a verb refuses a path, run `planning-paths` classification (`node -e "console.log(require('./plugins/devflow/devflow/bin/lib/planning-paths.cjs').classify('ROADMAP.md'))"`)
  and use the verb it names; record the route in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs</test>
</validation_gates>

<verification>
- GMD-04: status cancelled, Disposition, ROADMAP/STATE/PROJECT lines, decision record; consistency green.
</verification>

<success_criteria>
Anyone reading the plan sees objective 26 is killed, when, why and by whom; nothing was renumbered.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-01-SUMMARY.md` (via `summary post 51-01 --from <file>`)
</output>
