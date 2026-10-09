---
objective: 53-worktree-and-health-hygiene
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/helpers.cjs
  - plugins/devflow/devflow/bin/lib/helpers.test.cjs
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
  - plugins/devflow/devflow/bin/lib/verify.cjs
  - plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs
  - plugins/devflow/hooks/gate-executor-stop.js
  - plugins/devflow/hooks/gate-executor-stop.test.js
autonomous: true
requirements: ["53-2"]
must_haves:
  truths:
    - "`validate health` reports no I001 for a TRD `NN-MM-<slug>-TRD.md` that has a summary named either `NN-MM-SUMMARY.md` or `NN-MM-<slug>-SUMMARY.md`, and still reports I001 when neither exists"
    - "`objective-job-index` reports `has_summary: true` for a named TRD whose complete SUMMARY uses the short name (today it reports false for every TRD in 47-52)"
    - "`find-objective`'s `incomplete_jobs`, `verify objective-completeness` and `validate consistency` (the 'Summary … has no matching TRD' warning) pair named TRDs with short-name summaries"
    - "gate-executor-stop's summaryExists accepts `<id>-SUMMARY.md` and `<id>-<slug>-SUMMARY.md`"
    - "One agreement test runs health, objective-job-index, find-objective, verify objective-completeness, roadmap-reconcile and gate-executor-stop on the same fixture and they agree on which TRDs have a summary"
    - "Legacy shapes still pair: `NN-MM-TRD.md`/`NN-MM-SUMMARY.md`, `NN-MM-JOB.md`/`NN-MM-SUMMARY.md`, bare `TRD.md`/`SUMMARY.md`, and decimal objectives (`07.1-02-x-TRD.md`/`07.1-02-SUMMARY.md`)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/helpers.cjs
      provides: "trdKey(filename): the `NN-MM` key of a TRD/JOB/SUMMARY file name, else the legacy suffix-stripped base"
    - path: plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs
      provides: "cross-reader agreement test on one fixture"
  key_links:
    - from: plugins/devflow/devflow/bin/lib/validate.cjs
      to: plugins/devflow/devflow/bin/lib/helpers.cjs
      via: "trdKey in Check 7 (I001) and the consistency orphan check"
      pattern: "trdKey"
    - from: plugins/devflow/devflow/bin/lib/misc.cjs
      to: plugins/devflow/devflow/bin/lib/helpers.cjs
      via: "trdKey in cmdObjectiveJobIndex completedJobIds"
      pattern: "trdKey"
    - "roadmap-reconcile.cjs _checkSummaryExists (prefix `${trdId}-` + suffix `-SUMMARY.md`) is the reference rule: every reader now agrees with it"
---

# TRD 53-02: One rule for which TRDs have a summary (item 53-2)

<objective>
Make every reader pair a TRD with its SUMMARY on the `NN-MM` key, so `NN-MM-<slug>-TRD.md` counts as complete whether the summary is
`NN-MM-SUMMARY.md` (what executors and `summary post` write) or `NN-MM-<slug>-SUMMARY.md`.

Purpose: `validate health` I001 fires for every named TRD in 47-52 (145 I001 lines in this repo today). The planner found that the same pairing bug
is in four more readers. The most serious is `objective-job-index`, which execute-objective uses for resume and completion. It reports
`has_summary: false` for every completed named TRD (verified: `objective-job-index 52` shows `52-01-commit-follow-ups` with
`has_summary: false` though `52-01-SUMMARY.md` is complete). roadmap-reconcile already pairs on the `NN-MM` key and is the reference.

The buggy pattern, in five places:
```js
const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));
const jobBase = stripPlanSuffix(jobFile);            // '52-01-commit-follow-ups'
if (!summaryBases.has(jobBase)) ...                  // summaryBases has '52-01'
```
- validate.cjs:344-349 (health Check 7, I001)
- validate.cjs:148-157 (consistency: "Summary … has no matching TRD.md or JOB.md")
- misc.cjs:264-303 (cmdObjectiveJobIndex `has_summary`)
- objective.cjs:30-36 (searchObjectiveInDir `incomplete_jobs`)
- verify.cjs:192-200 (cmdVerifyObjectiveCompleteness)

gate-executor-stop.js:289-300 (summaryExists) only accepts the exact `${id}-SUMMARY.md`. Widen it too so that it agrees with the others.

Output: a shared `trdKey` helper, the five readers and the hook using it, and an agreement test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(53-02): ...` (failing) before `fix(53-02): ...`.
- Use the repo df-tools (`node plugins/devflow/devflow/bin/df-tools.cjs`). Commit with its `commit … --files`, one plain command per Bash call.
- Do NOT touch roadmap-reconcile.cjs (already correct) or planning-verbs.cjs (TRD 53-01 owns it). planning-verbs' SUMMARY_FILE_RE /
  summaryFileOf already pair on the key.
- Do NOT touch validate.cjs Check 6 (W005) or Check 2 (W001). TRD 53-05 closes those warnings by changing repo content, not code.
- The hook must stay self-contained (fast, no df-tools lib require), so inline its regex. Keep `<id>-SUMMARY.md` as the name it
  tells the executor to write (blockReason / summaryRelPath unchanged).
- Hand-built fixtures only.

## Test list

Outermost first.
1. **Agreement (new summary-pairing.test.cjs).** Build one temp project with `.planning/ROADMAP.md` (an `### Objective 07:` section listing
   the TRDs as `- [ ] 07-0N-…-TRD.md — x`) and `.planning/objectives/07-demo/` holding:
   - `07-01-alpha-TRD.md` + `07-01-SUMMARY.md` (short name, `## Self-Check: PASSED`);
   - `07-02-beta-TRD.md` + `07-02-beta-SUMMARY.md` (long name, PASSED);
   - `07-03-gamma-TRD.md` with no summary;
   - `07-04-TRD.md` + `07-04-SUMMARY.md` (unnamed, PASSED).
   Assert that every reader says 01, 02 and 04 have a summary and 03 does not:
   - `validate health`: I001 only for `07-03-gamma-TRD.md`;
   - `objective-job-index 07`: `has_summary` true for 01, 02 and 04, false for 03;
   - `find-objective 07`: `incomplete_jobs` (or the field it returns) is exactly `07-03-gamma-TRD.md`;
   - `verify objective-completeness 07`: only 07-03 is missing a summary, and no orphan-summary warning;
   - roadmap-reconcile `_checkSummaryExists(dir, '07-0N')`;
   - gate-executor-stop `summaryExists('07-0N', [root])`.
   Use the CLI (spawn the repo df-tools with cwd = fixture) for health, job-index, find-objective and completeness. Require the
   modules for reconcile and the hook.
2. **Health, Check 7:** a named TRD with a short-name summary gives no I001. With a long-name summary, no I001. With no summary, I001 (in validate.test.cjs).
3. **Consistency:** `07-01-SUMMARY.md` beside `07-01-alpha-TRD.md` produces no "has no matching TRD.md or JOB.md" warning. A
   `07-09-SUMMARY.md` with no 07-09 TRD still warns.
4. **helpers.trdKey unit (helpers.test.cjs):** `07-01-alpha-TRD.md` -> `07-01`; `07-01-SUMMARY.md` -> `07-01`; `07-01-alpha-SUMMARY.md` -> `07-01`;
   `01-02-JOB.md` -> `01-02`; `07.1-02-x-TRD.md` -> `07.1-02`; `TRD.md` -> `''`; `SUMMARY.md` -> `''`; `notes-SUMMARY.md` -> `notes`
   (falls back to the legacy strip). `07-1-x-TRD.md` and `07-10-SUMMARY.md` must give different keys.
5. **Job-index checkpoint rule kept:** a short-name SUMMARY with `## Progress` and no `## Self-Check` still means `has_summary: false`
   (misc.cjs `_isCheckpointOnlySummary`).
6. **Hook (gate-executor-stop.test.js):** summaryExists finds `07-01-alpha-SUMMARY.md` for id `07-01`. It does not count `07-010-SUMMARY.md`
   or `07-01x-SUMMARY.md` for `07-01`. Existing hook tests pass unchanged.
7. **This repo, smoke (manual, record in the SUMMARY):** `node plugins/devflow/devflow/bin/df-tools.cjs validate health` has no I001 for
   any 47-52 TRD whose summary exists, and `objective-job-index 52` shows `has_summary: true` for 52-01..52-06.

<embedded_context>

<codebase_examples>
helpers.cjs (line ~172):
```js
function findPlanFiles(dirFiles) {
  const trdFiles = dirFiles.filter(f => f.endsWith('-TRD.md') || f === 'TRD.md');
  const jobFiles = dirFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
  return trdFiles.length > 0 ? trdFiles : jobFiles;
}
function stripPlanSuffix(filename) {
  return filename.replace(/-?TRD\.md$/, '').replace(/-?JOB\.md$/, '');
}
```
Suggested helper (export it beside stripPlanSuffix):
```js
// `NN-MM` (objective may be decimal) of a TRD/JOB/SUMMARY file name; legacy names fall back to the suffix-stripped base.
const TRD_KEY_RE = /^(\d+(?:\.\d+)?-\d+)(?:-.+)?-(?:TRD|JOB|SUMMARY)\.md$/i;
function trdKey(filename) {
  const m = TRD_KEY_RE.exec(filename);
  if (m) return m[1];
  return String(filename).replace(/-?(?:TRD|JOB|SUMMARY)\.md$/i, '');
}
```
The `(?:-.+)?` group is greedy-safe because `\d+` cannot consume `-`. `07-01-alpha-TRD.md` -> `07-01`, and `07-010-…` -> `07-010`.

The reference rule, roadmap-reconcile.cjs:101-112:
```js
return entries.some((e) => e.startsWith(`${trdId}-`) && e.endsWith('-SUMMARY.md'));
```

gate-executor-stop.js summaryExists (line ~289) checks `fsImpl.existsSync(path.join(objectivesDir, entry, `${id}-SUMMARY.md`))` per
objective dir. Widen it to a readdir of each objective dir, matching `^${escapeRe(id)}(?:-.+)?-SUMMARY\.md$`. Keep the fsImpl seam,
and keep the exact-name fast path first.
</codebase_examples>

<anti_patterns>
- Do not pair on string prefix alone (`startsWith('07-1')` matches `07-10`). Pair on the extracted key, or prefix plus a `-` boundary.
- Do not rename existing SUMMARY files or change what executors write. The fix is in the readers.
- Do not change `_summaryIsComplete` / checkpoint semantics in job-index.
</anti_patterns>

<error_recovery>
- validate.test.cjs:1605-1618 pins a fixture's codes (`info: ['I001']` for `02-01-TRD.md` with no summary). That fixture has no summary, so it
  must still report I001. If it changes, the key extraction is wrong.
- df-tools.test.cjs `objective-job-index command` tests (line ~627) must pass unchanged. Run them with
  `node --test --test-name-pattern="objective-job-index" plugins/devflow/devflow/bin/df-tools.test.cjs`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: trdKey helper; health I001, consistency and objective-job-index pair on it</name>
  <files>plugins/devflow/devflow/bin/lib/helpers.cjs, plugins/devflow/devflow/bin/lib/helpers.test.cjs, plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs</files>
  <action>
RED: write Test list items 1 (the agreement test, all readers; items for find-objective, completeness and the hook stay red until Task 2), 2, 3, 4 and 5. Run them:
health, consistency, job-index and trdKey fail for the right reason. Commit `test(53-02): ...`.
GREEN: add and export `trdKey` in helpers.cjs. In validate.cjs Check 7 and the consistency orphan check, and in misc.cjs
cmdObjectiveJobIndex, build the summary set with `trdKey(s)` and look up `trdKey(jobFile)`. Keep job-index's `id` field as
`stripPlanSuffix(jobFile)`: its JSON shape is consumed by execute-objective and must not change. Only the `has_summary` lookup changes.
Commit `fix(53-02): ...`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs && node --test --test-name-pattern="objective-job-index" plugins/devflow/devflow/bin/df-tools.test.cjs</verify>
  <done>trdKey is unit-tested; health/consistency/job-index agreement assertions in summary-pairing.test.cjs pass; existing validate and job-index tests unchanged.</done>
  <recovery>If an existing test now fails, check whether its fixture really has a summary under either name. If it does, it pinned the bug: update it and record it. If it does not, the key regex is wrong.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: find-objective, verify objective-completeness and gate-executor-stop agree</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective.test.cjs, plugins/devflow/devflow/bin/lib/verify.cjs, plugins/devflow/hooks/gate-executor-stop.js, plugins/devflow/hooks/gate-executor-stop.test.js</files>
  <action>
RED: add Test list item 6 to gate-executor-stop.test.js, plus an objective.test.cjs case (a named TRD with a short-name summary is not in
incomplete_jobs). The Task 1 agreement test already holds the find-objective, completeness and hook assertions. Confirm they fail. Commit `test(53-02): ...`.
GREEN: objective.cjs searchObjectiveInDir and verify.cjs cmdVerifyObjectiveCompleteness use `trdKey` for both sides. In verify.cjs,
"Summaries without plans" must compare keys too. gate-executor-stop.js summaryExists accepts `<id>(-slug)?-SUMMARY.md` via an
inline regex with an escaped id. Run the agreement test until every reader agrees. Then run Test list item 7 against this repo and
paste the before/after I001 counts into the SUMMARY. Commit `fix(53-02): ...`.
# GOTCHA: verify.cjs uses case-insensitive regexes (`/-(TRD|JOB)\.md$/i`). trdKey's `/i` keeps that.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs</verify>
  <done>The agreement test is green for all six readers, the existing objective, hook and reconcile tests pass, and this repo's health has no I001 for 47-52 TRDs that have a summary.</done>
  <recovery>If the hook test's fsImpl mock has no readdirSync for objective dirs, keep the exact-name existsSync path first and add readdir only as the fallback, so old mocks still work.</recovery>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in each task's `<verify>`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- summary-pairing.test.cjs: six readers agree on one fixture.
- `node plugins/devflow/devflow/bin/df-tools.cjs validate health` in this repo: no I001 for TRDs whose summary exists.
- `node plugins/devflow/devflow/bin/df-tools.cjs objective-job-index 52`: every 52 TRD `has_summary: true`.
</verification>

<success_criteria>
`validate health` reports no I001 for TRDs that have a summary under either name. objective-job-index, find-objective, verify objective-completeness,
roadmap-reconcile and gate-executor-stop agree with it on what counts as complete.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-02 and commit it with your docs commit.
</output>
