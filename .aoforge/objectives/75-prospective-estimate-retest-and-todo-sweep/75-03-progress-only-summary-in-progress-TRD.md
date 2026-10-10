---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/summary-completion-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs
  - plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs
  - plugins/aoforge/aoforge/bin/lib/objective.test.cjs
  - plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs
  - plugins/aoforge/aoforge/bin/lib/objective.cjs
  - plugins/aoforge/aoforge/bin/lib/roadmap.cjs
  - plugins/aoforge/aoforge/bin/lib/state.cjs
autonomous: true
requirements: [TODO-01]
must_haves:
  truths:
    - "A SUMMARY whose `## Progress` section lists at least one unticked task (`- [ ]`) and that has no `## Self-Check` heading is not completion evidence: reconcile emits no `trd_summary_exists` tick for it, and `completedSummaryFiles` (roadmap counts, `objective complete`, `state advance-job`/`update-progress`) leaves it out"
    - "A SUMMARY with every Progress task ticked and no Self-Check (09-03's backfilled shape) still counts as complete; PASSED still ticks; FAILED is still annotated; frontmatter `deferred`/`checkpoint` behave as objective 74 made them"
    - "Run over this repository, reconcile's E2E1 self-test shows zero drift, and `roadmap analyze` reports the same completion counts for every objective before and after the change"
    - "`tokens coverage`'s in-progress classification is unchanged (token-coverage.cjs untouched), so the EST-09 measurement method does not move in the objective that re-measures it"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs
      provides: "_summaryNotComplete also returns true for a progress checkpoint (unticked Progress task, no Self-Check)"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/summary-completion-fixtures.cjs
      provides: "hand-built SUMMARY text builders for completion shapes"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/objective.cjs completedSummaryFiles
      to: roadmap-reconcile.cjs _summaryNotComplete
      via: "the one completion parser; roadmap.cjs and state.cjs reach it through completedSummaryFiles"
      pattern: "_summaryNotComplete"
---

# TRD 75-03: A mid-TRD progress checkpoint is not a completed SUMMARY

<objective>
Close todo `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md`. Objective 74
made a SUMMARY whose frontmatter `status:` is `deferred` or `checkpoint` count as not complete. The todo's actual case
is different, and it still ticks: the per-task `summary checkpoint` writes a SUMMARY with a `## Progress` list,
unticked tasks remaining and no `## Self-Check`. That SUMMARY carries no `status:` field, so a mid-TRD commit trips
E2E1, and a reconcile `--apply` would tick an unfinished TRD (72-26 at abc18a9f).

Extend the one predicate, `_summaryNotComplete`, so every consumer agrees. Today that is reconcile, plus `roadmap`
counts, `objective complete` and `state advance-job` / `update-progress` through `objective.cjs`
`completedSummaryFiles`.

Purpose: TODO-01, a small fix in scope.
Output: the predicate change, hand-built fixtures, and RED-then-GREEN tests across the consumers.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
@~/.claude/aoforge/references/tdd.md
</execution_context>

<context>
@.aoforge/todos/pending/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md

Read narrowly with `rg -n`, then `offset`/`limit`:
- `plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs` lines 115-185 (`_checkSummaryFailed`,
  `INCOMPLETE_SUMMARY_STATUSES`, `_summaryNotComplete`), lines 520-560 (Rules 2, 1b and 1 in that order: failed first,
  then not-complete, which un-ticks a [x] and leaves a [ ] alone, then exists), lines 600-620 (exports; EX1 locks the
  export list).
- `plugins/aoforge/aoforge/bin/lib/objective.cjs` lines 15-40 (`completedSummaryFiles`). Its consumers are
  `roadmap.cjs` around lines 273 and 375, and `state.cjs` around lines 358 and 526.
- `plugins/aoforge/aoforge/bin/lib/token-coverage.cjs` lines 15-25 and 44-45, 83: the in-progress rule there
  (`PROGRESS_HEADING_RE` and not `SELF_CHECK_HEADING_RE`). It is the source of the heading regexes. **Do not edit that
  file.**
- `plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs` NC-H2 around line 1009 (the 74 tests to extend), EX1
  around 1138, E2E1 around 1171.
</context>

<embedded_context>

<codebase_examples>
The two real shapes the rule must tell apart (both checked at planning, 2026-10-10):

Mid-TRD checkpoint (72-26 at abc18a9f), which must be NOT complete:
```
## Progress
- [x] Task 1: Approval gate: move the checkout ... — e2782c2a
- [x] Task 2: Carry the path-keyed state over ... — (this commit)
- [ ] Task 3: Approval gates (push, then PR) — next step: ...
## Task 1: move (already done)
...
## Task Evidence
```
(no `## Self-Check` anywhere, no frontmatter `status:`)

Complete backfilled SUMMARY (`.aoforge/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md`),
which must STAY complete:
```
## Progress
- [x] Task 1: CLI module + df-tools integration + skill — d1e70c74
- [x] Task 2: ... — d48d60e7
- [x] Task 3: GREEN — ... — d48d60e7
- [x] Pre-test ROADMAP cleanup ... — e4a112d4
## What changed / ## Evidence / ## Deviations from Plan / ## Backfill note
```
(no `## Self-Check`). It is the only SUMMARY in `.aoforge/objectives/` with `## Progress` and no Self-Check, so a rule
of "Progress and no Self-Check" alone would wrongly flip objective 9 to 2/3. The unticked-task condition is what keeps
it complete.

The predicate today:
```js
function _summaryNotComplete(summaryContent) {
  if (typeof summaryContent !== 'string' || !summaryContent) return false;
  let fm; try { fm = extractFrontmatter(summaryContent); } catch { return false; }
  const raw = fm && fm.status;
  if (typeof raw !== 'string') return false;
  ...
  return INCOMPLETE_SUMMARY_STATUSES.includes(status);
}
```
</codebase_examples>

<anti_patterns>
- Do not adopt "no Self-Check means not complete". Many complete historical SUMMARYs have no Self-Check, and E2E1
  would show mass drift.
- Do not edit `token-coverage.cjs`. The EST-09 re-measure in 75-05 must use the method 66 built.
- Do not add a new export unless needed. If you do (e.g. `_progressCheckpointOnly`), update EX1's locked list in the
  same commit with a comment naming 75-03.
- Do not parse the Progress section with a regex spanning the whole file. Bound it at the next `## ` heading, and
  ignore `- [ ]` lines in other sections (a "Left for the user" checklist must not count).
- No generated fixture data and no property-based tests: name each shape.
</anti_patterns>

<error_recovery>
- E2E1 fails after the change: list the drifted entries. If a real SUMMARY that is complete matches the new rule,
  the rule is too broad; narrow it, never edit the historical SUMMARY. If an in-progress SUMMARY of objective 75 itself
  appears (a parallel executor's checkpoint), that is the rule working. Re-run after that TRD finishes, and note it.
- `roadmap analyze` counts differ before/after for a completed objective: same diagnosis as above.
</error_recovery>

</embedded_context>

## Test list

Behaviour cases, written before any test code, outermost first (repository and consumers, then the predicate):

1. Repository: `roadmap analyze --raw` (repo copy) gives identical per-objective completion counts before and after
   (saved JSON, compared in the SUMMARY, not as a committed test).
2. Repository: E2E1 (reconcile dry-run on this ROADMAP) shows zero drift after the change.
3. Reconcile: ROADMAP line `- [ ] NN-02-...` plus a progress-checkpoint SUMMARY produces no change of any kind.
4. Reconcile: `- [x] NN-02-...` plus a progress-checkpoint SUMMARY produces `trd_summary_not_complete`, the same as a
   `status: checkpoint` SUMMARY in 74.
5. Reconcile: a PASSED SUMMARY still ticks (`trd_summary_exists`). A FAILED one is still annotated
   (`trd_summary_failed`).
6. `completedSummaryFiles`: an objective dir with SUMMARYs {complete PASSED, progress checkpoint, 09-03 shape} returns
   the complete one and the 09-03-shape one.
7. `state advance-job --objective N` (or `update-progress`) with one progress-checkpoint SUMMARY does not count that
   TRD as done (state-advance-job.test.cjs style).
8. Predicate: progress checkpoint gives true. All ticked and no Self-Check gives false. Unticked plus `## Self-Check:
   PASSED` gives false (Self-Check wins). No Progress section and no Self-Check (legacy) gives false. An unticked `- [ ]`
   only outside Progress (e.g. a "Left for the user" list) gives false. Frontmatter `deferred`/`checkpoint` still give
   true. Non-string or empty gives false.

<tasks>

<task type="auto">
  <name>Task 1: Hand-built SUMMARY completion fixtures</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/summary-completion-fixtures.cjs</files>
  <action>
Create `__fixtures__/summary-completion-fixtures.cjs` (CommonJS, sync, no I/O). Export a builder
`summaryDoc({ status = null, progress = null, selfCheck = null, sections = [] })` that returns SUMMARY text:
frontmatter (with `status:` only when given), a `# ... Summary` title, a `## Progress` list when `progress` is an array
of `{done: boolean, name}`, any extra `sections` (`{heading, body}`), and `## Self-Check: PASSED|FAILED` when
`selfCheck` is set. Export named presets built with it:
- `PROGRESS_CHECKPOINT`: 72-26's shape (2 ticked, 1 unticked, task sections, Task Evidence, no Self-Check).
- `COMPLETE_PASSED`: all ticked plus `## Self-Check: PASSED`.
- `COMPLETE_FAILED`: all ticked plus `## Self-Check: FAILED`.
- `COMPLETE_ALL_TICKED_NO_SELF_CHECK`: 09-03's shape.
- `LEGACY_NO_PROGRESS`: neither section.
- `UNTICKED_OUTSIDE_PROGRESS`: all Progress ticked, Self-Check absent, and a `## Left for the user` section with `- [ ]`
  lines.
- `STATUS_DEFERRED`, `STATUS_CHECKPOINT`.
Hand-write every string. Write a short JSDoc citing the real files each preset mirrors.
Commit: `test(75-03): SUMMARY completion fixture builders`.
  </action>
  <verify>`node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/summary-completion-fixtures.cjs'); console.log(Object.keys(f).join(' '))"` lists the builder and the eight presets; `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes</verify>
  <done>Every shape the rule distinguishes has a named, hand-built fixture.</done>
  <recovery>If a fixtures-directory convention test requires a header or registration, follow the failing test's message.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: _summaryNotComplete recognises a progress checkpoint (cases 3-8)</name>
  <files>plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs, plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs, plugins/aoforge/aoforge/bin/lib/objective.test.cjs, plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs, plugins/aoforge/aoforge/bin/lib/objective.cjs (comments), plugins/aoforge/aoforge/bin/lib/roadmap.cjs (comments), plugins/aoforge/aoforge/bin/lib/state.cjs (comments)</files>
  <action>
Before any edit, save the baseline: `node plugins/aoforge/aoforge/bin/aof-tools.cjs roadmap analyze --raw` to a scratch
file (case 1).

RED: add case 8 as `NC-P*` tests next to NC-H2 in `roadmap-reconcile.test.cjs`, cases 3-5 as reconcile tests (temp
project with a ROADMAP line and the fixture SUMMARY, the same harness the NC tests use), case 6 in `objective.test.cjs`
and case 7 in `state-advance-job.test.cjs`. Use the Task 1 presets. Run them, and confirm the progress-checkpoint cases
fail and the guard cases pass. Commit `test(75-03): RED a progress checkpoint SUMMARY counts as complete`.

GREEN, in `roadmap-reconcile.cjs`:
```
# PATTERN: same heading regexes as token-coverage.cjs (copy them; do not import token-coverage)
function progressCheckpointOnly(text):
  if SELF_CHECK_HEADING_RE.test(text): return false        # a Self-Check verdict decides completion
  section = text from the first /^##[ \t]+Progress\b/im line to the next /^## / heading (or EOF)
  return section has a line matching /^\s*- \[ \]/m          # an unticked task remains
_summaryNotComplete(text) = (existing frontmatter rule) || progressCheckpointOnly(text)
# GOTCHA: keep the existing defensive returns (non-string/empty -> false) first
```
Update the JSDoc of `_summaryNotComplete` and `INCOMPLETE_SUMMARY_STATUSES` (a SUMMARY is also not complete when it is
a progress checkpoint), the reconcile header comment's rule list (Rule 1b), and the comments in `objective.cjs`,
`roadmap.cjs` and `state.cjs` that say "deferred or checkpoint SUMMARY", so they also name the progress checkpoint.
Comment-only edits in those three files are allowed; list them in the SUMMARY.
Commit `fix(75-03): a progress-checkpoint SUMMARY (unticked task, no Self-Check) is not complete`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs plugins/aoforge/aoforge/bin/lib/objective.test.cjs plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs plugins/aoforge/aoforge/bin/lib/roadmap.test.cjs plugins/aoforge/aoforge/bin/lib/state.test.cjs` all pass, E2E1 included; the RED commit precedes the fix commit</verify>
  <done>Every consumer of the one parser treats a mid-TRD progress checkpoint as unfinished, and the existing tests keep their meaning.</done>
  <recovery>If EX1 fails because you exported a helper, either unexport it (preferred) or update the locked list with a 75-03 comment.</recovery>
</task>

<task type="auto">
  <name>Task 3: Repository regression proof (cases 1-2)</name>
  <files>(none: evidence only, recorded in the SUMMARY)</files>
  <action>
1. `node plugins/aoforge/aoforge/bin/aof-tools.cjs roadmap analyze --raw` after the change, saved next to the baseline.
   Compare per-objective `summaries`/completion fields with a read-only `node -e`. Every objective must be identical.
   If any differs, apply the error_recovery diagnosis.
2. Scan every SUMMARY in the repository with the new predicate (read-only `node -e` requiring
   `roadmap-reconcile.cjs`; iterate `.aoforge/objectives/*/*-SUMMARY.md` and `.aoforge/milestones/**/*-SUMMARY.md` if
   present). Print the files for which `_summaryNotComplete` is true, and the reason (frontmatter status or progress
   checkpoint). Expect only 74-06 (deferred) and any objective-75 TRD in progress at that moment. Record the list.
3. `node --test --test-name-pattern E2E1 plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs`, the todo's own
   reproduction step.
No commit unless a fix was needed. The evidence goes in the SUMMARY.
  </action>
  <verify>The analyze comparison prints no difference; the scan lists only the expected files; E2E1 passes</verify>
  <done>The change is proven harmless to every recorded objective, and it fixes the todo's exact case.</done>
  <recovery>A completed TRD flips: narrow the rule in a new RED/GREEN pair (add a fixture for the shape found), then re-run this task.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs plugins/aoforge/aoforge/bin/lib/objective.test.cjs plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs plugins/aoforge/aoforge/bin/lib/roadmap.test.cjs plugins/aoforge/aoforge/bin/lib/state.test.cjs</test_scoped>
</validation_gates>

<verification>
- Test list cases 3-8 exist by name and pass; cases 1-2 are recorded as evidence.
- `git diff --stat <base>..HEAD -- plugins/aoforge/aoforge/bin/lib/token-coverage.cjs` is empty.
- The rename and doc-refs guards pass.
</verification>

<success_criteria>
- A commit in the middle of a TRD no longer makes E2E1 fail, and no recorded objective's completion count changes.
</success_criteria>

<output>
After completion, write `75-03-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 75-03 --from <draft>`
(after `tokens stamp 75-03 --draft <draft>`). Include the before/after analyze comparison, the scan list and the commit
hashes, so 75-04 can complete the todo on that evidence.
</output>
