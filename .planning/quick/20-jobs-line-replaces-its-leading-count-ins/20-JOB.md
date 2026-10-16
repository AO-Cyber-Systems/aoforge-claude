---
mode: quick
id: 20-jobs-line-replaces-its-leading-count-ins
title: "`updateJobsLine()` replaces an existing leading count instead of prepending a second one"
type: standard
tasks: 3
context_target: ~30%
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap-progress.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
autonomous: true
must_haves:
  observable_truths:
    - "A `**Jobs:**` value that starts with a count fragment (`0/16 complete`, `5/6 complete`, `10/10 complete,`, `11/11 TRDs executed`, `15/16 jobs executed`) has only that fragment replaced by the new counter; every byte after the fragment is unchanged."
    - "A value with no leading count (`registered, not planned.`, `10 TRDs in 4 waves (...)`, `3 TRDs in 3 waves (...)`) still gets `N/M jobs complete — ` prepended, as it does today."
    - "The `0 jobs` placeholder and an empty value still become the bare counter."
    - "Already-corrupted stacked counts (`15/16 jobs executed — 0/16 complete — 16 TRDs ...`) heal to one count (`16/16 jobs complete — 16 TRDs ...`)."
    - "Running `roadmap update-job-progress` twice gives the same line as running it once (idempotent)."
    - "Replay on a SCRATCH copy of .planning: after `roadmap update-job-progress 37` + `objective complete 37`, the Obj 37 Jobs line is `**Jobs:** 16/16 jobs complete — 16 TRDs in 13 waves (planned 2026-09-28; ...)`, the Progress row is `| 37. /devflow:adopt + backup pruning | v1.3 | 16/16 | Complete | <today> |`, and `diff` shows no other ROADMAP line changed."
  artifacts:
    - "plugins/devflow/devflow/bin/lib/roadmap-progress.cjs: `computeJobsLineText` rewritten around a leading-count pattern with a stacked-count self-heal. `updateJobsLine`'s section bounding does not change. Exports stay the same."
    - "plugins/devflow/devflow/bin/lib/roadmap.test.cjs: a new `describe` block of direct `computeJobsLineText` unit cases, plus CLI cases for `roadmap update-job-progress` on a seeded leading-count fixture."
    - "plugins/devflow/devflow/bin/lib/objective.test.cjs: a CLI case for `objective complete 12` on the same seeded leading-count fixture."
  key_links:
    - "Both callers, `roadmap.cjs:317` (`jobs complete` / `jobs executed`) and `objective.cjs:737` (`jobs complete`), go through `updateJobsLine` -> `computeJobsLineText`. The fix goes in ONE place and neither caller changes."
---

<objective>
Fix `computeJobsLineText()` (which `updateJobsLine()` calls) in `plugins/devflow/devflow/bin/lib/roadmap-progress.cjs`. It was added by debug fix cbf238d.

Today it strips only an `N/M jobs (complete|executed)` prefix. Real ROADMAP lines write `0/16 complete` with no "jobs", so the strip misses and the new counter is PREPENDED. The result is `**Jobs:** 15/16 jobs executed — 0/16 complete — 16 TRDs in 13 waves (...)`.

Correct behaviour:
- **Leading count present:** replace only that fragment and keep the rest of the value byte-identical.
- **No leading count:** prepend `N/M jobs complete — ` as it does today.

TDD applies: failing tests first (commit `test:`), then the fix (commit `fix:`).
</objective>

<context>
Real `**Jobs:**` shapes in .planning/ROADMAP.md that must hold (line numbers as of cd56574):
- L256 `**Jobs:** 10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (...)`: leading count followed by `,`
- L275 `**Jobs:** 0/16 complete — 16 TRDs in 13 waves (...)`: leading count followed by ` —` (this is Objective 37, the replay target)
- L100 `**Jobs:** 6/6 complete`: count only
- L117 `**Jobs:** 5/6 complete`: count only, stale
- L69 `**Jobs:** 0 jobs`: placeholder
- L299 `**Jobs:** registered, not planned.`: no count
- L215 `**Jobs:** 11/11 TRDs executed in 9 waves (...)`: leading count with noun `TRDs`, followed by ` in`
- L198 `**Jobs:** 3 TRDs in 3 waves (sequential — 33-02 ...)`: NOT a count (no slash), so prepend

Callers build the counter as `${summaryCount}/${jobCount} jobs complete` or `... jobs executed`.

Commit and safety rules (locked):
- Commit ONLY via `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Signing goes through 1Password. If signing fails, STOP and report. Never pass `--no-gpg-sign`, never use `DEVFLOW_ALLOW_RAW_COMMIT`, never run a raw commit.
- NEVER write to the real `/Users/justin/dev/devflow-claude/.planning/ROADMAP.md` (or anything else under the real `.planning/`, apart from this quick dir's SUMMARY).
- Use one plain command per Bash call: no `&&`, `;`, `|` chains, and no `cd`. Use `git -C <dir>` and the global `df-tools --cwd <dir>` flag (df-tools.cjs:270).
- Test data is hand-built strings and fixtures (no_llm_test_data). No property-based libraries.
</context>

<embedded_context>
<codebase_examples>
The current buggy implementation (roadmap-progress.cjs:114-123):
```js
const JOBS_PLACEHOLDER_PATTERN = /^\d+\s+jobs$/i;
const JOBS_MANAGED_PREFIX_PATTERN = /^\d+\/\d+\s+jobs\s+(?:complete|executed)\b[\s,;—-]*/i;
function computeJobsLineText(existingText, counterText) {
  const trimmed = (existingText || '').trim();
  if (trimmed === '' || JOBS_PLACEHOLDER_PATTERN.test(trimmed)) return counterText;
  const stripped = trimmed.replace(JOBS_MANAGED_PREFIX_PATTERN, '').trim();
  return stripped ? `${counterText} — ${stripped}` : counterText;
}
```
Test helpers already exist in roadmap.test.cjs and objective.test.cjs: `tmpProject()`, `run(args, cwd)`, `writeObjective12Dir(project, n)`, `writeObjective13Dir(project)`, `jobsLine(roadmap, n)`, `progressRow(roadmap, n)`, `FIVE_COLUMN_ROADMAP`, and `NARRATIVE_STATE` (objective.test.cjs). Build seeded fixtures by string `.replace` on `FIVE_COLUMN_ROADMAP`. Do not create a new fixture file.
</codebase_examples>
<anti_patterns>
- Do not rebuild the tail as `${counter} — ${rest.trim()}`. That turns `, verified passed ...` into ` — , verified ...`. Concatenate `counterText + rest`, where `rest` keeps its own leading separator.
- Do not match counts anywhere except the very start of the value. `verified passed 66/66` and `sequential — 33-02` must never be treated as the managed count.
- Do not touch `updateProgressTableRow` or the section-bounding logic in `updateJobsLine`.
</anti_patterns>
<error_recovery>
- If an existing assertion breaks after the fix (for example `roadmap.test.cjs:235`, `^\*\*Jobs:\*\*\s*10\/10 jobs complete`), the fixture is `10 TRDs in 4 waves`, which has no leading count. The prepend path must still produce `10/10 jobs complete — 10 TRDs in 4 waves (...)`. Fix the code, not the assertion.
- If the scratch replay's `objective complete 37` fails on something unrelated to ROADMAP (for example STATE parsing), record it in SUMMARY. Still check that the ROADMAP diff is limited to the 2 expected lines.
</error_recovery>
</embedded_context>

## Test list

These go in the `roadmap.test.cjs` new `describe('computeJobsLineText — leading count replace vs prepend')`, which requires `./roadmap-progress.cjs` directly. The counter is `16/16 jobs complete` unless stated.

1. `0/16 complete — 16 TRDs in 13 waves (x)` -> `16/16 jobs complete — 16 TRDs in 13 waves (x)`
2. `10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (y)`, counter `10/10 jobs complete` -> `10/10 jobs complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (y)`. The tail is byte-identical.
3. `6/6 complete`, counter `6/6 jobs complete` -> `6/6 jobs complete`
4. `5/6 complete`, counter `6/6 jobs complete` -> `6/6 jobs complete`
5. `11/11 TRDs executed in 9 waves (two roots)`, counter `11/11 jobs complete` -> `11/11 jobs complete in 9 waves (two roots)`
6. `9/10 jobs executed — 10 TRDs in 4 waves (z)`, counter `10/10 jobs complete` -> `10/10 jobs complete — 10 TRDs in 4 waves (z)` (the old managed shape still works)
7. Stacked heal: `15/16 jobs executed — 0/16 complete — 16 TRDs in 13 waves (x)` -> `16/16 jobs complete — 16 TRDs in 13 waves (x)`
8. Idempotent: `f(f(v, c), c) === f(v, c)` for cases 1, 2 and 7
9. No leading count: `registered, not planned.`, counter `0/0 jobs complete` -> `0/0 jobs complete — registered, not planned.`
10. No leading count: `3 TRDs in 3 waves (sequential — 33-02 and 33-03)` -> `16/16 jobs complete — 3 TRDs in 3 waves (sequential — 33-02 and 33-03)`
11. Placeholder `0 jobs`, and also the empty string `''` -> the bare counter

These are CLI cases, driven outermost through df-tools:

12. roadmap.test.cjs: take `FIVE_COLUMN_ROADMAP` with Obj 12's line seeded as `**Jobs:** 0/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)`. With 10 summaries, `roadmap update-job-progress 12` makes the line EXACTLY `**Jobs:** 10/10 jobs complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04 split into 04a/04b/04c; notes about wave rebalancing)`. Running it a second time leaves the file byte-identical. Obj 11's line is still `**Jobs:** 2/2 complete`.
13. roadmap.test.cjs: the same seed with 9 summaries gives the line EXACTLY `**Jobs:** 9/10 jobs executed — 10 TRDs in 4 waves (...)`.
14. objective.test.cjs: the same seed, 10 summaries, with `writeObjective13Dir` and `NARRATIVE_STATE`. `objective complete 12` gives the exact line from case 12.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED. Add failing leading-count cases, then commit test:</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.test.cjs, plugins/devflow/devflow/bin/lib/objective.test.cjs</files>
  <action>
Add Test-list cases 1-13 to roadmap.test.cjs:
- Cases 1-11 go in a new `describe`. It uses `const { computeJobsLineText } = require('./roadmap-progress.cjs');`, where the path is relative to the test file's `__dirname`, following how the file already locates DF_TOOLS.
- Cases 12-13 go in the existing 5-column `describe` or a new sibling one. Build the seeded fixture with `FIVE_COLUMN_ROADMAP.replace('**Jobs:** 10 TRDs in 4 waves (planned 2026-01-15; 12-04', '**Jobs:** 0/10 complete — 10 TRDs in 4 waves (planned 2026-01-15; 12-04')`. Assert that the replace actually changed the string, so the fixture cannot silently fail to seed.

Add case 14 to objective.test.cjs using the same seeding, with its own `FIVE_COLUMN_ROADMAP`.

Use exact `assert.equal` on full lines, not `match`. Byte-identity of the tail is the point.

Run the two files and confirm that the new cases fail for the right reason (a duplicated count, e.g. `16/16 jobs complete — 0/16 complete — ...`) and that all pre-existing cases still pass. Cases 3, 6 and 9-11 may already pass today; that is fine, they are regression guards.

Commit with `node ~/.claude/devflow/bin/df-tools.cjs commit "test(quick-20): failing cases for Jobs-line leading-count replace" --files plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs`. If signing fails, STOP.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` and `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` (separate calls) show the new leading-count cases failing and every pre-existing case passing. `git log -1` shows the signed test: commit.</verify>
  <done>At least cases 1, 2, 4, 5, 7, 12 and 14 fail on the duplicated-count output. The test: commit has landed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN. Replace the leading count in computeJobsLineText, then commit fix:</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-progress.cjs</files>
  <action>
Rewrite `computeJobsLineText` and its patterns. Keep the function signature and exports unchanged.

Approach:
```js
const JOBS_PLACEHOLDER_PATTERN = /^\d+\s+jobs$/i;
// Machine-owned count fragment at the very start of the value.
const COUNT = String.raw`\d+\/\d+(?:\s+(?:jobs|TRDs|plans))?\s+(?:complete|executed|done)\b`;
const JOBS_LEADING_COUNT_PATTERN = new RegExp('^' + COUNT, 'i');
// A further count stacked right after a separator (self-heal for lines the
// old prepend-only code already corrupted).
const JOBS_STACKED_COUNT_PATTERN = new RegExp(String.raw`^\s*[—;,-]\s*` + COUNT, 'i');

function computeJobsLineText(existingText, counterText) {
  const trimmed = (existingText || '').trim();
  if (trimmed === '' || JOBS_PLACEHOLDER_PATTERN.test(trimmed)) return counterText;
  const lead = trimmed.match(JOBS_LEADING_COUNT_PATTERN);
  if (!lead) return `${counterText} — ${trimmed}`;       // no count: prepend (unchanged)
  let rest = trimmed.slice(lead[0].length);               // keeps its own ", " / " — " / " in"
  let m;
  while ((m = rest.match(JOBS_STACKED_COUNT_PATTERN))) rest = rest.slice(m[0].length);
  return counterText + rest;
}
```
- CRITICAL: `rest` is appended verbatim. Do not trim it and do not insert a separator.
- GOTCHA: `\b` after `complete` stops `completed` from matching as `complete`. Keep it.

Update the JSDoc above the patterns so it describes replace-vs-prepend, and mention quick-20 (the old comment says "prepending/refreshing"). Run both test files. All cases, old and new, must pass.

Commit with `node ~/.claude/devflow/bin/df-tools.cjs commit "fix(quick-20): Jobs line replaces its leading count instead of prepending a second one" --files plugins/devflow/devflow/bin/lib/roadmap-progress.cjs`. If signing fails, STOP.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` passes (0 fail). `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` passes (0 fail).</verify>
  <done>Test-list cases 1-14 pass, pre-existing cases pass, and the signed fix: commit has landed.</done>
  <recovery>If a pre-existing assertion fails, re-read anti_patterns and error_recovery. The prepend path for non-count values must be byte-identical to the old behaviour.</recovery>
</task>

<task type="auto">
  <name>Task 3: Scratch replay on Objective 37, plus baseline-relative regression gate</name>
  <files>(none committed; scratch only, plus the 20-SUMMARY.md written by the executor)</files>
  <action>
Let S=/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/quick20-replay. Run one plain command per Bash call:
1. `mkdir -p S`
2. `cp -R /Users/justin/dev/devflow-claude/.planning S/.planning`
3. `git -C S init -q`
4. `cp S/.planning/ROADMAP.md S/ROADMAP.before.md` (this is the pristine baseline for diffing)
5. `node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs --cwd S roadmap update-job-progress 37`. Use the CHECKOUT df-tools, not ~/.claude. Before running, confirm that `--cwd` really redirects every path. The output JSON's paths must be under S, and the real ROADMAP must be unchanged: `git -C /Users/justin/dev/devflow-claude status --short .planning/ROADMAP.md` is empty. If `--cwd` does not work, run with the Bash tool's cwd set to S instead. NEVER target the real repo.
6. `node .../df-tools.cjs --cwd S objective complete 37`
7. `diff S/ROADMAP.before.md S/.planning/ROADMAP.md`

Expected diff: EXACTLY two changed lines.
- L92 becomes `| 37. /devflow:adopt + backup pruning | v1.3 | 16/16 | Complete | 2026-09-28 |` (today's date).
- L275 becomes `**Jobs:** 16/16 jobs complete — 16 TRDs in 13 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; simulated runs 37-11→37-14 chained in depends_on so each runs alone and owns its own gate; 37-16 is a human-verify checkpoint, not autonomous)`. It has a single count.

Any other changed ROADMAP line is a failure. Report it verbatim.

Afterwards, confirm with `git -C /Users/justin/dev/devflow-claude status --short .planning` that the real .planning is untouched. The only new file should be this quick dir.

Regression gate: run `npm test --prefix /Users/justin/dev/devflow-claude` (or the equivalent `node --test` glob from package.json) and collect the failing test names. Compare them against `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`, which is tab-separated as `file:line	count	test name`. Ignore anything from `micro.test.cjs` on both sides. PASS means every current failure appears in the baseline. List any new failures by file and name.

Write `.planning/quick/20-jobs-line-replaces-its-leading-count-ins/20-SUMMARY.md` containing the two commit SHAs, the verbatim diff, and the gate result.
  </action>
  <verify>The `diff` output has exactly the 2 expected hunks (L92 and L275). The real `.planning/ROADMAP.md` is unmodified in `git status`. The regression gate has zero failures outside baseline-failures.tsv (excluding micro.test.cjs).</verify>
  <done>The Objective 37 Jobs line has a single `16/16 jobs complete` count with a byte-identical tail. The Progress row reads `16/16 | Complete | <today>`. No other ROADMAP line changed. The gate is baseline-clean.</done>
</task>

</tasks>

<verification>
- roadmap.test.cjs and objective.test.cjs both pass.
- The scratch replay diff is limited to Obj 37's Progress row and Jobs line.
- The full-suite gate is baseline-relative (37 baseline-failures.tsv, excluding micro.test.cjs) with no new failures.
- Two signed commits exist: test:, then fix:.
</verification>

<success_criteria>
The Jobs line never carries two counts again, including after repeated runs. Hand-authored detail after the count survives byte-for-byte. Lines without a count keep today's prepend behaviour.
</success_criteria>
