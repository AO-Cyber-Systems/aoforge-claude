---
objective: 52-store-mode-polish
trd: "06"
type: standard
wave: 2
depends_on: ["52-01", "52-02", "52-03", "52-04", "52-05"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - plugins/devflow/skills/doctor/SKILL.md
autonomous: true
requirements: ["52-1", "52-2", "52-3", "52-4", "52-5", "52-6"]
must_haves:
  truths:
    - "CHANGELOG [Unreleased] has a Fixed entry for each of items 52-1..52-6 and an Added entry for `github.mirror_only`"
    - "USER-GUIDE describes the gate-aware follow-ups (gh setup, doctor 21, 0010, doctor 20, all naming `gh pr start`), the raw-mode stderr refusal and its new wording, micro's store-mode behaviour, and the `github.mirror_only` opt-out; the 'no opt-out key yet' sentence and the multi-line `decision answer` known issue are gone"
    - "USER-GUIDE Known issues records the two follow-ups this objective found but did not fix: micro's source commit bypasses the store-mode commit gate, and resolved decisions written before the fix keep their mangled multi-line resolutions"
    - "The doctor skill's commit step covers the pending-migrations (check 21) fix as well as legacy-runtime-state"
    - "CLAUDE.md 'Where we left off' names objective 52 done, and 'Next' drops the opt-out and decision-answer items"
    - "Full `npm test` is green apart from the known MA-7 failure, recorded with the pass/fail/skip counts in the SUMMARY"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 52"
  key_links:
    - "docs/USER-GUIDE.md:941 quotes the refusal message: must match gh-gate.cjs START_HINT after 52-02"
    - "docs/USER-GUIDE.md:746-760 (0010 step 5) and :853 show the store-mode commit steps: must match commit-steps.cjs output after 52-01"
---

# TRD 52-06: Docs and full suite for objective 52

<objective>
Bring the docs in line with what TRDs 52-01..52-05 changed, record the two follow-ups the objective surfaced, and run the full suite.

Purpose: the user-facing text quotes exact strings that this objective changed (the refusal message, the printed commit steps), and
two known-issue lines and the CLAUDE.md "Next" line describe bugs that are now fixed.

Output: CHANGELOG [Unreleased], USER-GUIDE, the doctor skill, and CLAUDE.md, all updated; full `npm test` results in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Read the five 52-0N SUMMARYs first, and quote the real strings from the code (gh-gate.cjs `START_HINT`, `commit-steps.cjs`
  `branchCommitSteps` output, 0011's `MIRROR_ONLY` text), never the TRD drafts.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(52-06): ..." --files <paths>`.
- CLAUDE.md is resident on every turn: change only the "Where we left off" heading/body and the **Next** line. Add no new sections.
- House prose style: plain declaratives, no hype.

<embedded_context>

<codebase_examples>
CHANGELOG [Unreleased] already has `### Added` (line 9), `### Changed` (178) and `### Fixed` (252) subsections. Append to them. Do not start a new [Unreleased].

USER-GUIDE anchors: :191 and :252 (W040); :746-760 (0011 "Commit the switch" step 5 with the escaped commit block at :750);
:763 (the "there is no opt-out key yet" bullet); :853 (0010 / doctor 20 store-mode commit prose); :941 (quoted refusal message);
:946 (the escape paragraph); :1107-1111 (Known issues).

CLAUDE.md:205 `## Where we left off (2026-10-01, branch ...)`; :209 `**Next:** ...`.

skills/doctor/SKILL.md step 4 (lines ~56-64) handles only the `legacy-runtime-state` commit note.
</codebase_examples>

<anti_patterns>
- Documenting `github.mirror_only` as a generic migration decline. It applies to 0011 only, and only while the store is off.
- Rewriting whole USER-GUIDE sections. Make targeted edits at the anchors.
</anti_patterns>

<error_recovery>
- If doc-refs.repo.test.cjs or dispatch-completeness flags a new command reference, check the spelling against `df-tools` help. `config-set` exists.
- If `npm test` shows a failure other than MA-7, find its owning TRD from the file name, fix it there if it is a 52-0N regression,
  and record it in the SUMMARY. Do not mark the objective done with a new failure.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/52-store-mode-polish/OBJECTIVE.md
@.planning/objectives/52-store-mode-polish/52-01-SUMMARY.md
@.planning/objectives/52-store-mode-polish/52-02-SUMMARY.md
@.planning/objectives/52-store-mode-polish/52-03-SUMMARY.md
@.planning/objectives/52-store-mode-polish/52-04-SUMMARY.md
@.planning/objectives/52-store-mode-polish/52-05-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG, USER-GUIDE, doctor skill, CLAUDE.md</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, plugins/devflow/skills/doctor/SKILL.md, CLAUDE.md</files>
  <action>
- CHANGELOG [Unreleased]:
  - Added: `github.mirror_only` (52-04).
  - Fixed: printed commit follow-ups are gate-aware and name `gh pr start` (52-01); refusals name both remedies, and `--raw` writes the
    message to stderr (52-02); micro makes no STATE.md change in store mode (52-03); debugger commits via df-tools, with a CI guard (52-02);
    multi-line `decision answer` round-trips, via frontmatter block scalars and import (52-05).
- USER-GUIDE:
  - :941 refusal quote = the new START_HINT text. :946 mentions that `--raw` puts the message on stderr.
  - :746-760 and :853: the steps now include the `gh pr start` alternative line. gh setup (store mode: branch `devflow-setup` + escape;
    mirror: plain branch sequence) and doctor 21 (store mode: branch `devflow-upgrade`) print the same form.
  - :763: replace "there is no opt-out key yet" with the `df-tools config-set github.mirror_only true` opt-out. It holds while the store
    is off; it stops 0011 and W040; `/devflow:gh-sync migrate` and `/devflow:status check --migrate` offer it.
  - Known issues: delete the multi-line `decision answer` bullet. Add two bullets: (a) `micro commit` commits with raw git, so the store-mode
    commit gate does not check its branch; (b) resolved decisions written before this fix keep their mangled multi-line `resolution`
    (re-answer them before a backfill).
  - Where micro is described: the STATE.md row is local mode only.
- doctor SKILL step 4: also handle a `pending-migrations` fix entry whose notes carry `commit with: ...` (local) or the store-mode sequence.
  Same rule: run the commit lines, show push/PR to the user, never raw `git commit`.
- CLAUDE.md: heading becomes `## Where we left off (<today>, branch feat/stack-profile-loader)`. Body: objective 52 (store-mode polish) done.
  **Next**: drop the opt-out and decision-answer items; keep the backfill UAT and the USER-GUIDE open items; add the micro gate-bypass follow-up.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs; rg -n 'no opt-out key yet|keeps only its first line' docs/USER-GUIDE.md returns nothing; node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased 2>&1 | head -5</verify>
  <done>Every must_haves doc truth holds: the quoted strings match the code, the two stale lines are gone, the two new known issues are recorded, the doctor skill covers check 21, and CLAUDE.md "Next" is current. The docs repo tests pass.</done>
  <recovery>If `changelog check Unreleased` is not a valid form, run `node plugins/devflow/devflow/bin/df-tools.cjs changelog check --help` and use what it accepts. The check is advisory for [Unreleased].</recovery>
</task>

<task type="auto">
  <name>Task 2: full suite gate</name>
  <files>(none modified; results go in 52-06-SUMMARY.md)</files>
  <action>
Run the full suite once with `npm test` (timeout 900 s; run it in the background if the harness requires that). Record pass/fail/skip
counts in the SUMMARY. The only allowed failure is the pre-existing MA-7 (handoff-e2e / doctl, environmental). Any other failure: identify
the owning 52-0N TRD from the failing file, fix the regression with a `fix(52-0N): ...` commit, and re-run. Never skip or delete a test to get green.
  </action>
  <verify>npm test   (the summary line shows fail = 1 and that failure is MA-7, or fail = 0)</verify>
  <done>The full suite is green apart from MA-7, with counts recorded in 52-06-SUMMARY.md.</done>
  <recovery>A watch/handoff/daemon test that times out intermittently: re-run only that file with `node --test <file>`. If it passes alone and fails on base too, record it as pre-existing with the evidence.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n 'no opt-out key yet' docs/USER-GUIDE.md` and `rg -n 'keeps only its first line' docs/USER-GUIDE.md` return nothing.
- `rg -n 'mirror_only' docs/USER-GUIDE.md CHANGELOG.md` shows the opt-out documented.
- Full `npm test`: only MA-7 fails.
</verification>

<success_criteria>
The docs match the shipped behaviour of 52-01..52-05, the two follow-ups are recorded as known issues, and `npm test` is green apart from the known MA-7.
</success_criteria>

<output>
After completion, create `.planning/objectives/52-store-mode-polish/52-06-SUMMARY.md` via `df-tools summary post`.
</output>