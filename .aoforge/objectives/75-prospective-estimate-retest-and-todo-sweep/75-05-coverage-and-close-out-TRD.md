---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "05"
type: standard
wave: 3
depends_on: ["75-04"]
files_modified:
  - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
  - .aoforge/todos/pending/est-09-coverage-follow-up-objective-75.md
  - .aoforge/REQUIREMENTS.md
  - .aoforge/STATE.md
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
autonomous: true
requirements: [EST-09, EST-11, TODO-01]
must_haves:
  truths:
    - "75-RETEST-REPORT.md's `## Forward-stamp coverage (EST-09)` section, beside the verdict, carries `tokens coverage` output verbatim for milestone v1.6 (fraction, floored decimal, target line, each missing SUMMARY with its reason), measured after 75-01..75-04 ran, with 75-05's own SUMMARY named as not yet counted"
    - "REQUIREMENTS: EST-09 is ticked only if that measurement prints `target 95%: met`, and its traceability row carries the measured fraction either way; EST-11 is ticked only if the report's verdict is met, otherwise it stays `[ ]` with 'Not met' and the report path, as EST-08 was in v1.5; TODO-01 is ticked only after the SC-4 check passes again"
    - "STATE.md: the 67 freeze blocker ('do not run aof-tools calibrate until objective 75 has scored 68-72') is resolved, and a decision records the EST-11 verdict and the EST-09 number"
    - "CHANGELOG [Unreleased] ### Fixed records the 0012-after-0002, 0008 dup-detect-log and progress-checkpoint fixes with their objective 75 references; CLAUDE.md and USER-GUIDE describe 0008's third file and the progress-checkpoint rule; CLAUDE.md 'Where we left off' states objective 75's outcome"
    - "npm test passes with no new failure; the rename, doc-refs and rg-flag guards pass"
  artifacts:
    - path: .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
      provides: "EST-09 coverage section beside the EST-11 verdict"
      contains: "Forward-stamp coverage (EST-09)"
    - path: .aoforge/REQUIREMENTS.md
      provides: "EST-09, EST-11, TODO-01 status from evidence"
  key_links:
    - from: .aoforge/REQUIREMENTS.md EST-09 row
      to: "tokens coverage --milestone v1.6 output in 75-RETEST-REPORT.md"
      via: "tick only on `target 95%: met`"
      pattern: "EST-09"
    - from: .aoforge/REQUIREMENTS.md EST-11 row
      to: "75-RETEST-REPORT.md frontmatter verdict"
      via: "tick only when verdict is met"
      pattern: "EST-11"
---

# TRD 75-05: Re-measure EST-09 beside the verdict, record outcomes, close out

<objective>
Measure forward-stamp coverage over every v1.6 TRD and put it next to the EST-11 verdict (SC-3). Then record what the
evidence supports in REQUIREMENTS and STATE, document the 75-02 and 75-03 fixes, and run the full suite.

Purpose: SC-3, the requirement bookkeeping for EST-09 / EST-11 / TODO-01, and the documentation the code changes need.
Output: the report's coverage section, REQUIREMENTS / STATE updates through verbs, CHANGELOG, CLAUDE.md, USER-GUIDE.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/OBJECTIVE.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-02-SUMMARY.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-03-SUMMARY.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-04-SUMMARY.md

Read narrowly (`rg -n`, then `offset`/`limit`):
- `75-RETEST-REPORT.md`: frontmatter, `## Verdict`, and the placeholder `## Forward-stamp coverage (EST-09)`.
- `.aoforge/REQUIREMENTS.md`: EST-09 (line ~17), EST-11 (~19), TODO-01 (~62), traceability rows (~82, ~108, ~109).
  v1.5's EST-08 pattern for a not-met requirement is in `.aoforge/milestones/v1.5-REQUIREMENTS.md` lines 74 and 131.
- `CHANGELOG.md`: `## [Unreleased]` at line 7, `### Fixed` at about line 75. Entries are one bold lead sentence, then
  detail and an "(objective 75, TODO-01)" reference.
- `CLAUDE.md`: the **Upgrade** bullet (line ~63, migration 0008's files), the SUMMARY-completion paragraph (~221),
  `## Where we left off` (~215) and `**Next:**` (~223).
- `docs/USER-GUIDE.md`: the migration table row for 0008 (line ~378) and the 0012 row below it.
</context>

<embedded_context>

<codebase_examples>
`tokens coverage` text output (planning-time sample, 2026-10-10, before objective 75's TRDs existed; re-measure, never
copy this):
```
v1.6 forward-stamped 86/88 = 0.977272 (target 95%: met) · live 86 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)
  65-02 missing (no_transcript)
  65-03 missing (no_transcript)
```

Verbs (use the repository copy for state and requirements, per CLAUDE.md: the installed 3.0.0 lacks the
deferred/checkpoint SUMMARY fix that state counting relies on):
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs requirements mark-complete EST-09[,TODO-01]`
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs state resolve-blocker --text "EST-11 calibration frozen"`
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs state add-decision --objective 75 --summary "<...>" --rationale "<...>"`
- `planning draft REQUIREMENTS.md` then `doc put REQUIREMENTS.md --from <draft>` for traceability text (REQUIREMENTS.md
  is a top-level doc that `doc put` accepts; ROADMAP.md is not, and this TRD does not edit it).
</codebase_examples>

<anti_patterns>
- Do not tick EST-09 on a rounded number, and do not run `tokens backfill --write` (a backfill is not a forward stamp).
  The command's integer check (`target 95%: met|not met`) decides.
- Do not tick EST-11 unless the report's frontmatter says `verdict: met`. "Met on the scored objectives" is not EST-11.
- Do not edit ROADMAP.md (the orchestrator's `roadmap update-job-progress` owns the TRD checkboxes) or `token-coverage.cjs`.
- No legacy product name, legacy planning directory name or pre-rename command form in CLAUDE.md or USER-GUIDE outside
  their ignore regions. The rename guard scans them. CHANGELOG is exempt, but write AOForge terms anyway.
- Keep CLAUDE.md short. It is resident on every turn: change sentences, do not add paragraphs.
</anti_patterns>

<error_recovery>
- `requirements mark-complete` refuses or reports nothing changed: read its message, and fall back to `planning draft
  REQUIREMENTS.md` + `doc put`, editing only the checkbox and traceability cell.
- `state resolve-blocker` finds no match: run `state get` / read the Blockers section with `rg -n -e 'EST-11 calibration'
  .aoforge/STATE.md` and pass the exact substring.
- `npm test` fails: if the failure is caused by objective 75, fix it here with a `fix(75-05): ...` commit and re-run.
  If it is pre-existing (it also fails at the commit before objective 75's first commit: run that one test file in a
  temporary `git worktree add` of that commit, then remove the worktree), list it, do not fix it.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Re-measure EST-09 over v1.6 and report it beside the verdict</name>
  <files>.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md, .aoforge/todos/pending/est-09-coverage-follow-up-objective-75.md (only if not met)</files>
  <action>
1. From the installed runtime (byte-identical to the repository's token libs; OBJECTIVE.md "Runtime copy"):
   `node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude tokens coverage` and
   `node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude tokens coverage --milestone v1.6`.
   Save both. Their headline lines must be identical (the current milestone is v1.6). If they differ, report both and
   use `--milestone v1.6`. Also run `tokens coverage --objective 75` and save it.
2. Re-seed the report draft (`planning draft objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md`)
   and replace the placeholder section `## Forward-stamp coverage (EST-09)` with:
   - the `--milestone v1.6` output verbatim (in a fenced block);
   - one sentence saying what it covers: every executor SUMMARY of objectives 65-75 present at measurement time. Name
     75-05's own SUMMARY as absent or in progress, and therefore not counted, and say that its stamp is checked in the
     75-05 SUMMARY;
   - the EST-09 outcome in one line: met or not met, by the command's integer check, with the exact fraction;
   - each missing SUMMARY with its reason, as printed (65-02 and 65-03 have no transcript and can never be forward
     stamped, as 66 recorded).
   Add frontmatter `est09_coverage: "<live>/<counted> = <decimal>"` and `est09_target: met|not met`. Publish with
   `doc put`.
3. If not met: create `est-09-coverage-follow-up-objective-75` with `todo add --stem est-09-coverage-follow-up-objective-75
   --from <scratch draft>`. Give it `title`, `area: estimation`, the five disposition fields (`disposition: follow-up`,
   reason "EST-09 measured <fraction> under 95% in objective 75", target "the next estimation objective"), and a body
   listing every missing SUMMARY, its reason, and what would have stamped it.
4. Commit: `aof-tools commit "docs(75-05): EST-09 forward-stamp coverage over v1.6 beside the EST-11 verdict" --files
   <report> [<todo>] <summary>`.
  </action>
  <verify>`rg -n -e '^est09_coverage: ' -e '^est09_target: ' -e 'forward-stamped' .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md` all match, and the fraction equals the saved command output; the placeholder sentence "Measured in TRD 75-05" is gone</verify>
  <done>The measured coverage, unrounded and with its misses, sits next to the EST-11 verdict, and its outcome follows the command's own check.</done>
  <recovery>If `tokens coverage` errors on the milestone label, run `node ~/.claude/aoforge/bin/aof-tools.cjs roadmap analyze --raw` to read the milestone version string, and retry with it. Never compute coverage by hand.</recovery>
</task>

<task type="auto">
  <name>Task 2: REQUIREMENTS and STATE from the evidence</name>
  <files>.aoforge/REQUIREMENTS.md, .aoforge/STATE.md</files>
  <action>
1. Re-run the SC-4 check from 75-04 (read-only `node -e`: every file in `list-todos --raw` has a non-empty
   `disposition_reason`). It must exit 0. Save the output.
2. EST-09: if Task 1 printed `target 95%: met`, run `requirements mark-complete EST-09`. Either way, set the
   traceability cell to `Objective 66 (built); coverage <live>/<counted> = <decimal> measured by 75-05` (draft + `doc put`).
3. EST-11: if the report says `verdict: met`, run `requirements mark-complete EST-11`. Otherwise leave `[ ]`. Append to
   the requirement line `(re-tested prospectively in objective 75 on <S>; 72 unscored: not met, see 75-RETEST-REPORT.md)`,
   and set the traceability cell to `Not met: see objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md;
   follow-up todo est-11-follow-up-objective-75`. This follows v1.5's EST-08 record.
4. TODO-01: on step 1 passing, `requirements mark-complete TODO-01`. The traceability cell names `75-TODO-SWEEP.md`.
5. STATE, repository copy: `state resolve-blocker --text "EST-11 calibration frozen"` (the 67-FREEZE rule lifts once
   68-72 are scored; the calibration was not rebuilt). Then `state add-decision --objective 75 --summary "EST-11 <verdict>
   on <S> (72 unscored); EST-09 <fraction> <met|not met>; <N> todos completed, <M> re-scoped" --rationale "<one sentence:
   the pre-registered rule decided it, nothing tuned>"`.
6. Commit: `aof-tools commit "docs(75-05): EST-09, EST-11 and TODO-01 recorded from evidence" --files .aoforge/REQUIREMENTS.md
   .aoforge/STATE.md <summary>`.
  </action>
  <verify>`rg -n -e 'EST-09' -e 'EST-11' -e 'TODO-01' .aoforge/REQUIREMENTS.md` shows ticks exactly as the evidence allows (EST-11 `[ ]` unless verdict met); `rg -n -e 'EST-11 calibration frozen' .aoforge/STATE.md` no longer appears under Blockers; the SC-4 check output is saved with exit 0</verify>
  <done>The requirement record says exactly what the report and the sweep support, and the freeze blocker is closed with the reason.</done>
  <recovery>If a verb rewrote more of REQUIREMENTS than expected, inspect `git diff .aoforge/REQUIREMENTS.md` and fix it with a draft + `doc put` before committing. Never use a raw edit.</recovery>
</task>

<task type="auto">
  <name>Task 3: CHANGELOG, CLAUDE.md, USER-GUIDE, full suite</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md</files>
  <action>
1. CHANGELOG `## [Unreleased]` → `### Fixed`, three entries, real outcomes from the 75-02 and 75-03 SUMMARYs:
   - **Migration 0012 survives 0002 in the same upgrade run** (objective 75, TODO-01). It stages the removals an earlier
     migration of the run made (0002's renamed `*-JOB.md`) before `git mv`, so a repository with both pending no longer
     stops half-applied. A user's own deletion still defers the move.
   - **Migration 0008 covers the dup-detect log** (objective 75, TODO-01). `.dup-detect-log.jsonl` is gitignored and
     untracked like the other runtime-state files, and a modified tracked copy no longer defers 0012. Add any further
     basename the 75-02 audit added.
   - **A mid-TRD progress checkpoint is not a completed SUMMARY** (objective 75, TODO-01). A SUMMARY whose `## Progress`
     lists an unticked task and that has no `## Self-Check` is no longer ticked by `sync-roadmap` or counted by
     `roadmap`, `objective complete` or `state advance-job`/`update-progress`. A mid-TRD commit no longer trips the
     reconcile self-test.
   Do not add a CHANGELOG entry for the EST-11 report or the todo sweep. They are planning records, not shipped changes.
2. CLAUDE.md: in the **Upgrade** bullet, add the dup-detect log to 0008's file list, and add one clause for 0012's fix.
   Extend the SUMMARY-completion paragraph (line ~221) so it also names a progress checkpoint (unticked Progress task,
   no Self-Check). Keep the paragraph's repo-copy advice. Update `## Where we left off` (date) and replace **Next:** with
   objective 75's outcome in one sentence: the EST-11 verdict and its reason, the EST-09 number, the todo counts and
   follow-ups. Leave OPS-03 named as deferred. Commit `docs(75-05): CLAUDE.md status after objective 75`.
3. USER-GUIDE: the 0008 row adds `.dup-detect-log.jsonl`. Add one sentence to the 0012 row about the run's own removals.
   Change nothing else unless a sentence there states the old completion rule (`rg -n -e 'Self-Check' -e 'checkpoint SUMMARY'
   docs/USER-GUIDE.md`); if one does, extend it the same way.
4. Guards: `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
   plugins/aoforge/aoforge/bin/lib/rg-flag-guard.test.cjs`. Commit `docs(75-05): changelog and user guide for objective 75 fixes`
   with CHANGELOG.md and docs/USER-GUIDE.md.
5. Full suite, once, credentials stripped: `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL npm test`.
   Record the summary lines (tests, pass, fail, skipped). 74-09 recorded 12555 tests, 0 fail. Handle failures per
   error_recovery.
  </action>
  <verify>`rg -n -e 'objective 75' CHANGELOG.md` shows three entries under [Unreleased] ### Fixed; `rg -n -F '.dup-detect-log.jsonl' CLAUDE.md docs/USER-GUIDE.md` matches both; the three guard tests pass; `npm test` exits 0 (or only pre-existing failures, each listed with proof)</verify>
  <done>Users and the resident instructions describe the shipped fixes, the status line names objective 75's outcome, and the suite is green.</done>
  <recovery>A guard fails on wording you added: reword it, never add an ALLOW entry.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- SC-3: the EST-09 number is in the report beside the EST-11 verdict, verbatim from `tokens coverage`.
- REQUIREMENTS ticks match the evidence. STATE has the decision, and the freeze blocker is resolved.
- `npm test` and the guards pass.
</verification>

<success_criteria>
- A reader of the report sees the EST-11 verdict and the EST-09 coverage together. REQUIREMENTS, STATE, CHANGELOG and
  CLAUDE.md agree with them, and nothing claims more than was measured.
</success_criteria>

<output>
After completion, write `75-05-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 75-05 --from <draft>`
(after `tokens stamp 75-05 --draft <draft>`). After posting, run `tokens coverage --objective 75` and add its line to the
SUMMARY's self-check (one more `summary post` with the same draft). If 75-05 itself shows `missing`, record it; it does
not change the EST-09 decision recorded in Task 2.
</output>
