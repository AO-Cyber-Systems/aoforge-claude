---
objective: 66-executor-token-stamp
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/token-coverage.cjs
  - plugins/devflow/devflow/bin/lib/token-coverage.test.cjs
  - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
  - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [EST-09]
must_haves:
  truths:
    - "`df-tools tokens coverage` with no scope flag reports the current milestone of ROADMAP.md (the one `pickMilestone` picks, 🚧 first). Every TRD SUMMARY (`<id>-SUMMARY.md` or `<id>-<slug>-SUMMARY.md`) in that milestone's objective directories, current or archived, is classified exactly once as live, backfill, unlabeled, missing or in_progress"
    - "Forward-stamp coverage is live / counted, where counted = live + backfill + unlabeled + missing. in_progress is listed but not counted. The report prints the exact fraction and `ratio_text`, the decimal floored at 6 places with integer arithmetic, so a number is never rounded up. `met` is `live * 100 >= 95 * counted`, compared as integers, and null when counted is 0"
    - "A SUMMARY with no token fields is `missing` whether or not it has `## Self-Check`. The orchestrator-written 65-02 shape (no `## Self-Check`, no `## Progress`) counts as missing and is never excluded. Only a `## Progress` checkpoint with no `## Self-Check` is in_progress. Commented template lines (`# tokens_input: N`) are not token fields"
    - "Each missing entry carries a reason: `stamp_skipped` when an executor transcript of that TRD exists for this repository (token-usage.tokensForTrd recovers it), otherwise tokensForTrd's own reason (`no_transcript`, `ambiguous_objective`, `zero_usage`). The command is read-only: it writes no file and never stamps"
    - "`--milestone <v>` and `--objective <N>` choose the scope, and passing both is a usage error. A report exits 0 whatever the coverage. Exit 1 only for a usage error, an unknown milestone, a missing ROADMAP.md or an objective with no directory"
    - "Run from the repository copy against this repo, `tokens coverage --milestone v1.6` reports 65-01 and 65-04 as live and 65-02 and 65-03 as missing (no_transcript)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/token-coverage.cjs
      provides: "TARGET_PERCENT, classifySummary, collectSummaries, coverageOf, explainMissing, formatCoverage, buildCoverage (read-only, pure except for directory reads)"
    - path: plugins/devflow/devflow/bin/lib/token-coverage.test.cjs
      provides: "in-process tests 8-14 of the Test list"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs
      provides: "hand-built SUMMARY texts per class and a mkdtemp project with ROADMAP milestones, current and archived objective dirs"
    - path: plugins/devflow/devflow/bin/lib/tokens-cli.cjs
      provides: "the `coverage` subcommand: parse, scope resolution, read-root resolution, text/JSON result"
  key_links:
    - "tokens-cli runTokens('coverage') -> milestone-scope.selectMilestoneObjectives (--milestone / default) or objective dirs (--objective) -> token-coverage.buildCoverage"
    - "token-coverage.explainMissing -> token-usage.indexExecutorTranscripts + tokensForTrd (missing entries only; one index per run)"
    - "66-03 aggregate_results calls `df-tools.cjs tokens coverage --objective <N> --raw`; 66-04 runs `tokens coverage --milestone v1.6` and records the number"
---

# TRD 66-01: `df-tools tokens coverage`, the forward-stamp coverage report (EST-09, SC-3)

<objective>
Add a read-only command that answers one question: of the TRDs executed in a milestone (or one objective), how many
SUMMARYs were token-stamped at write time (`tokens_source: "live"`)? It prints the measured number exactly, separates
forward stamps from backfilled, unlabeled and missing ones, and says why each missing one is missing.

Purpose: EST-09 sets a target of at least 95% forward-stamp coverage over v1.6, so the number has to be measurable.
SC-3 asks for a command that prints it and records it with no rounding up. Today nothing can tell a live stamp from a
backfill short of grepping frontmatter by hand.

Output: `lib/token-coverage.cjs` (library), the `coverage` subcommand of `df-tools tokens`, the help and header usage
lines, and a hand-built fixture module.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                               ← MODIFY (header usage block only: "Estimation data")
└── lib/
    ├── __fixtures__/token-coverage-fixtures.cjs ← CREATE
    ├── token-coverage.cjs                     ← CREATE
    ├── token-coverage.test.cjs                ← CREATE
    ├── tokens-cli.cjs                         ← MODIFY (coverage subcommand)
    ├── tokens-cli.test.cjs                    ← MODIFY (append a `66-01` describe; tests 1-7 below)
    └── help.cjs                               ← MODIFY ('tokens' entry usage/summary/details)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- **This TRD's own SUMMARY is SC-2 evidence.** Run the `<self_check>` step `tokens stamp 66-01 --draft <draft path>`
  before `summary post`. Never run `tokens backfill --write` in this objective, and never type token numbers.
- **Read-only command.** `tokens coverage` never writes a file and never calls `stampTokenFields`, `summaryPost` or
  `applyBackfill`. Its only reads are ROADMAP.md, objective directories, SUMMARY files and (for missing entries) the
  transcript index.
- **Honest numbers.** The denominator holds every counted SUMMARY. A missing SUMMARY lowers the number and is never
  dropped from the denominator. A backfilled or unlabeled stamp is never a forward stamp. Nothing is rounded up: the
  fraction is exact and the decimal is floored.
- **One plain command per Bash call.** The worktree-isolation guard refuses compound commands.
- Hand-built fixtures only (constraint `no_llm_test_data`): literal SUMMARY text, literal ROADMAP bullets.
  No property-based tests and no Gherkin.
- Never use port 8080. No server is involved.

## Test list

Behavior cases, outermost first. Each is one `test(...)` named with its number. Tests 1-7 go in a new
`describe('66-01 tokens coverage (end to end)', …)` appended to `tokens-cli.test.cjs`. They spawn df-tools with
`HOME` = a fake home, like the existing `makeProject().run`. Tests 8-14 go in-process in `token-coverage.test.cjs`.

End to end (spawned `df-tools --cwd <repo> tokens coverage …`):
1. **Default scope is the current milestone.** The fixture ROADMAP has `- ✅ **v1.5 — Gate & Plumbing** — Objectives 55–64 (completed)`
   and `- 🚧 **v1.6 — Hardening & Release** — Objectives 65–75 (in progress)`, and objective dirs 64 (archived),
   65 and 66. With no flag the JSON has `scope.kind: "milestone"` and `scope.version: "v1.6"`, and the entries cover
   only 65-* and 66-*. The counts match the fixture: 65-01 live, 65-02 missing (orchestrator shape), 65-03 missing
   (final, no tokens), 65-04 live, 66-01 backfill, 66-02 unlabeled, 66-03 in_progress. So counted = 6, live = 2, and
   `forward` = `{numerator: 2, denominator: 6, ratio_text: "0.333333", met: false, target_percent: 95}`. Exit 0.
2. **`--raw` text.** Line 1 is exactly
   `v1.6 forward-stamped 2/6 = 0.333333 (target 95%: not met) · live 2 · backfill 1 · unlabeled 1 · missing 2 · in progress 1 (not counted)`.
   Then one line per non-live entry in id order: `  65-02 missing (no_transcript)`, `  65-03 missing (no_transcript)`,
   `  66-01 backfill`, `  66-02 unlabeled`, `  66-03 in progress`. No trailing newline is required, and the existing
   output() helper writes none.
3. **`--milestone v1.5`** selects the archived objective under `.planning/milestones/v1.5-objectives/64-…/`. Its
   SUMMARY is read from the archived path and `scope.version` is `"v1.5"`. The milestone may be given as `1.5` too.
4. **`--objective 65`** scopes to objective 65's directory only (`scope.kind: "objective"`). The text starts with
   `objective 65 forward-stamped 2/4 = 0.5 (target 95%: not met)`.
5. **Missing reasons from transcripts.** With an executor transcript for 65-03 under the fake projects root (written
   with `transcript-fixtures.writeSubagentTranscript`, `executorPrompt('plan_id', …)`, cwd = repo), 65-03 is
   `missing (stamp_skipped)` and 65-02 stays `missing (no_transcript)`. `--root <dir>` and `--repo <path>` are honored,
   as in `tokens trd`.
6. **Usage errors exit 1** with the USAGE line on stderr: `--milestone v1.6 --objective 65` together, a positional
   argument (`tokens coverage 65-01`), an unknown flag (`--since 65`), `--write` (backfill only), `--objective x1`,
   `--milestone v9.9` (`milestone v9.9 not in ROADMAP.md`), `--objective 99` with no directory, and a project with no
   ROADMAP.md (default scope).
7. **Read-only.** A sha256 of every file under the fixture repo (and the fake projects root) is identical before and
   after a run that has missing entries, so the transcript index is consulted.

In-process (`token-coverage.cjs`):
8. `classifySummary(text)`: both `tokens_input` and `tokens_output` filled + `tokens_source: "live"` → `live`;
   `"backfill"` → `backfill`; fields present with no `tokens_source` or another value → `unlabeled`; no token fields and
   a `## Progress` heading with no `## Self-Check` heading → `in_progress`; no token fields otherwise → `missing`. That
   covers a final SUMMARY with `## Self-Check: PASSED` and the orchestrator shape with neither heading. Only
   `tokens_input` present (no `tokens_output`) → `missing`. Template comment lines `# tokens_input: N` / `# tokens_output: N`
   → `missing`. Text without a frontmatter block → `missing`.
9. `coverageOf(entries)`: counted 0 → `{numerator: 0, denominator: 0, ratio: null, ratio_text: null, met: null}`.
   38 live / 40 counted → `met: true` (the boundary: 3800 >= 3800) and `ratio_text: "0.95"`. 37/39 → `met: false` and
   `ratio_text: "0.948717"`, which is floored: the true value is 0.948717948…, and rounding would print 0.948718.
   5/7 → `"0.714285"`, floored, not `0.714286`. 2/4 → `"0.5"` (trailing zeros trimmed). 4/4 → `"1"`.
10. in_progress entries are listed but excluded from the denominator. backfill and unlabeled count in the denominator
    and never in the numerator.
11. `collectSummaries(readRoot, dirs)`: pairs `65-02-SUMMARY.md` and `65-02-push-branch-SUMMARY.md` to id `65-02`
    (`helpers.trdKey` + `token-usage.normTrdId`). An unkeyed file (`SUMMARY.md`, `notes-SUMMARY.md`) goes to `skipped`
    with reason `unkeyed` and is not counted. Two files pairing to the same id in one directory count once: the first
    in sorted order wins and the other goes to `skipped` with reason `duplicate`. A missing directory contributes
    nothing and does not throw.
12. `explainMissing(entries, {index, readRoot})`: adds `reason` to missing entries only, `stamp_skipped` when
    tokensForTrd recovers and tokensForTrd's reason otherwise. Non-missing entries are untouched. Called with no
    missing entry, the index factory is never invoked: pass a counting stub and assert it ran 0 times.
13. `formatCoverage(report)` produces exactly the strings of tests 2 and 4, and for counted 0
    `objective 70 forward-stamped 0/0 (no executed TRDs in scope) · in progress 0 (not counted)`.
14. `buildCoverage` entry order: by objective number (numeric, decimals such as `4.1` after `4`), then TRD number.

<embedded_context>

<codebase_examples>
**CLI shape to follow** (`lib/tokens-cli.cjs`). `runTokens` is pure and returns `{ok, result, text, exit}` or
`{ok:false, message}`. The dispatcher's `case 'tokens'` (df-tools.cjs:911) prints with
`output(result, raw, text, exit)`: without `--raw` the JSON, with `--raw` the text. The dispatcher needs NO change for
a new subcommand.

```js
const VALUE_FLAGS = {
  trd: ['objective-dir', 'repo', 'root'],
  stamp: ['draft', 'objective-dir', 'repo', 'root'],
  backfill: ['repo', 'root'],
};
const BOOL_FLAGS = { trd: [], stamp: [], backfill: ['write', 'force'] };
const BACKFILL_ONLY = ['write', 'force'];
// parseArgs: backfill takes no positional (id: null); trd/stamp need exactly one TRD id.
```
Add `coverage: ['milestone', 'objective', 'repo', 'root']` / `coverage: []`. Make `coverage` positional-free like
`backfill`. Update the "needs a subcommand" / "unknown tokens subcommand" messages to list `coverage`.

**Root resolution, as `runBackfill` and the summary verbs do it:**
```js
const base = path.resolve(cwd);
const main = planningMode.resolveMainRoot(base);
const repoRoot = flags.repo ? realOrResolved(path.resolve(base, flags.repo)) : main;
const checkoutRoot = planningMode.resolveCheckoutRoot(base) || repoRoot;
const transcriptRoot = flags.root ? path.resolve(base, flags.root) : (root || tokenUsage.defaultTranscriptRoot());
// planning-verbs.summaryWriteRoot: store mode reads/writes `main`; local mode the checkout holding cwd.
function summaryWriteRoot(root, main) {
  if (planningMode.planningMode(main).mode !== LOCAL) return main;
  return planningMode.resolveCheckoutRoot(root) || main;
}
```
Use the same rule for the coverage READ root: store mode → `main`, local → the checkout holding cwd. Keep it a small
exported pure helper, `readRootFor({mode, main, checkout})`, so it is unit-testable without a store-mode fixture.

**Scope selection** (`lib/milestone-scope.cjs`):
```js
const { selectMilestoneObjectives } = require('./milestone-scope.cjs');
// selectMilestoneObjectives(cwd, {version}) -> {version:'v1.6', name, range_source,
//   objectives:[{number:'65', name, dir:'.planning/objectives/65-release-v1-5' | '.planning/milestones/v1.5-objectives/64-x' | null, status_hint}], absent}
// throws 'ROADMAP.md not found', 'no milestone in ROADMAP.md', 'milestone v9.9 not in ROADMAP.md'
```
`dir` is relative to the root passed in and uses forward slashes. Entries with `dir: null` contribute nothing. For
`--objective N`, list `<readRoot>/.planning/objectives/*` directories matching
`helpers.objectiveDirMatches(name, helpers.normalizeObjectiveName(N))`, plus archived ones from
`objective.getArchivedObjectiveDirs(readRoot)` with the same match. None means a usage error.

**Classification inputs already in the codebase** (`lib/token-backfill.cjs`):
```js
function filled(v) {
  return (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
}
function frontmatterOf(text) {
  try { return extractFrontmatter(text); } catch { return {}; }
}
// planBackfill: id = tu.normTrdId(trdKey(file)); `already_stamped` iff filled(tokens_input) && filled(tokens_output)
```
Reuse the same `filled` rule, so `tokens coverage` and `tokens backfill` agree on "has token fields". Copy the 3-line
helpers or export them from token-backfill.cjs, whichever is smaller. `extractFrontmatter` ignores `#` comment lines;
test 8 pins that.

**Missing-reason lookup** (`lib/token-usage.cjs`):
```js
const index = tu.indexExecutorTranscripts({ root: transcriptRoot, repoRoot });  // scans <root>/<key>/<session>/subagents/*.meta.json
const found = tu.tokensForTrd(index, { id, dir: objectiveDirBasename, sharedNumber: tu.objectiveDirsFor(readRoot, id).length > 1 });
// found.status === 'recovered' -> 'stamp_skipped'; else found.reason ('no_transcript' | 'ambiguous_objective' | 'zero_usage')
```
`explainMissing` takes an index FACTORY (`() => index`) so the scan runs at most once and only when something is
missing (test 12). If the factory throws, every missing entry gets reason `transcripts_unreadable`. Still exit 0.

**Fixture style** (`lib/__fixtures__/transcript-fixtures.cjs`, reuse; do not copy): `makeFakeHome()`,
`projectKeyFor(abs)`, `writeSubagentTranscript(projectsRoot, {projectKey, session, agentId, description, prompt, cwd, records})`,
`executorPrompt('plan_id', {id, objectiveDir, repoRoot})`, `THREE_MESSAGES`. The ROADMAP milestone bullet format that
`parseMilestoneBullets` reads is the one in this repo's ROADMAP.md:
`- 🚧 **v1.6 — Hardening & Release** — Objectives 65–75 (in progress)` (en dash in the range).
</codebase_examples>

<anti_patterns>
- Do NOT treat "no `## Self-Check`" as "not executed". 65-02 and 65-03 have no `## Self-Check`. Excluding them would
  report 2/2 = 100% for objective 65 instead of the true 2/4.
- Do NOT print `Math.round`, `toFixed` or `toPrecision` output, or a bare `String(live / counted)`. `toFixed(6)` rounds
  5/7 up to 0.714286, and `String(5/7)` prints `0.7142857142857143`, which is above the true value in its last digit.
  Floor with integers: `Math.floor(live * 1e6 / counted)` is exact while `live * 1e6` stays below 2^53. Then format
  the integer part and the fractional digits by string, trimming trailing zeros.
- Do NOT compare `ratio >= 0.95` in floating point. Use `live * 100 >= 95 * counted`.
- Do NOT add a `--write`/`--fix` mode, and never call the backfill. A coverage report that can raise its own number
  defeats EST-09.
- Do NOT read the real `~/.claude` in tests. Spawned runs get `HOME=<fake home>`. In-process calls pass `root`
  explicitly.
</anti_patterns>

<error_recovery>
- `selectMilestoneObjectives` throws on an unknown version or a missing ROADMAP. Map the message to
  `{ok:false, message}` (exit 1); never print a stack.
- A SUMMARY that cannot be read (EACCES, a directory with that name): classify it as `missing` with
  reason `unreadable`, and keep going.
- `indexExecutorTranscripts` throws only when repoRoot is missing. Guard it anyway with the factory try/catch
  (`transcripts_unreadable`).
- If a test in another file starts failing because `parseArgs` changed its messages, update only the expectation that
  quotes the subcommand list. Do not loosen unrelated assertions.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/66-executor-token-stamp/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/tokens-cli.cjs
@plugins/devflow/devflow/bin/lib/token-backfill.cjs
@plugins/devflow/devflow/bin/lib/milestone-scope.cjs

Read narrowly: `token-usage.cjs` lines 287-402 (index, tokensForTrd, objectiveDirsFor) and `tokens-cli.test.cjs`
lines 1-140 (harness) are enough. Do not read whole large files.
</context>

<gotchas>
- `extractFrontmatter` returns strings for scalars. `tokens_source: "live"` may arrive as `live` or `"live"`
  depending on quoting. Compare after stripping one pair of surrounding quotes and trimming.
- `helpers.trdKey('65-02-push-branch-SUMMARY.md')` returns `65-02` (TRD 53-02 pairing). `normTrdId` pads, so
  `5-1` becomes `05-01`. Ids in this repo are already padded.
- `milestone-scope` lists an objective that has a ROADMAP section but no directory with `dir: null` (67-75 today).
  Skip those silently. They are not executed.
- In this repo, 66-01's own SUMMARY does not exist while you run the smoke check. Expect 66-* entries to vary by wave
  timing. Assert only the 65-* lines in the smoke check.
- `micro.test.cjs` can hang when git commit signing prompts. If `npm test` hangs there, run
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` and say
  so in the SUMMARY.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Hand-built coverage fixtures</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs</files>
  <action>
Create the fixture module that every test in this TRD uses. Everything is literal text with no generated data.

Exports:
- `SUMMARY_KINDS`: a frozen list of `'live' | 'backfill' | 'unlabeled' | 'missing_final' | 'missing_orchestrator' |
  'in_progress' | 'template_comments' | 'input_only'`.
- `summaryText(kind, { id, objectiveDir })` returns literal SUMMARY text:
  - every kind starts with a frontmatter block: `objective: <objectiveDir>`, `trd: "<NN>"`, `duration: 9min`,
    `completed: 2026-10-08`;
  - `live` / `backfill` add the six fields exactly as `tokenFrontmatterFields` serialises them (bare integers, quoted
    `token_model` and `tokens_source`) and end the body with `## Self-Check: PASSED`;
  - `unlabeled` has `tokens_input` / `tokens_output` and no `tokens_source`, plus `## Self-Check: PASSED`;
  - `missing_final` has no token fields, plus `## Self-Check: PASSED`;
  - `missing_orchestrator` has no token fields, a `## Outcome` section, and no `## Self-Check` or `## Progress` (the
    65-02 shape);
  - `in_progress` has no token fields, `## Progress` with one ticked and one unticked item, and no `## Self-Check`;
  - `template_comments` has the commented lines `# tokens_input: N` and `# tokens_output: N` inside the frontmatter, plus
    `## Self-Check: PASSED`;
  - `input_only` has `tokens_input` only, plus `## Self-Check: PASSED`.
- `makeCoverageProject({ roadmap, objectives, archived })` builds a realpath'd mkdtemp project:
  - `.planning/ROADMAP.md`: a `## Milestones` section from `roadmap.milestones` (literal bullet strings), then one
    `### Objective N: Name` section per objective number;
  - `.planning/objectives/<dir>/` per key of `objectives`. Each value is a list of `{id, kind, slug?}`, and each item
    gets a `<id>-<slug|demo>-TRD.md` (tiny literal frontmatter) and, when `kind` is not null, a SUMMARY named
    `<id>-SUMMARY.md`;
  - `.planning/milestones/<vX.Y>-objectives/<dir>/` for `archived` (same item shape);
  - a fake home via `transcript-fixtures.makeFakeHome()`.
  Return `{ repo, home, projectsRoot, run(args), transcript(id, objectiveDir), hashTree(dir), cleanup() }`.
  `run` spawns `df-tools --cwd <repo> …` with `HOME` = the fake home, as `tokens-cli.test.cjs` `makeProject().run`
  does. `transcript` writes an executor transcript for `id` with `executorPrompt('plan_id', …)`, `cwd: repo` and
  `THREE_MESSAGES`. `hashTree` returns a sorted `[relPath, sha256]` list.
- `V16_FIXTURE`: the scenario of tests 1-2. It has milestones v1.5 (✅, Objectives 55–64) and v1.6 (🚧, Objectives
  65–75), an archived `64-old` with `64-01` live, `65-release` with `65-01` live, `65-02` missing_orchestrator,
  `65-03` missing_final and `65-04` live, and `66-stamp` with `66-01` backfill, `66-02` unlabeled and `66-03` in_progress.

Header comment: purpose, the "hand-built only, no generated data" rule, and which tests use it.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs'); const p=f.makeCoverageProject(f.V16_FIXTURE); console.log(require('fs').readdirSync(p.repo + '/.planning/objectives').join(',')); p.cleanup()"` prints `65-release,66-stamp`, run from the repo root.</verify>
  <done>The module loads. `summaryText` returns a distinct literal text for each of the 8 kinds. `makeCoverageProject(V16_FIXTURE)` builds the current and archived layout and cleans up after itself. Commit: `test(66-01): hand-built fixtures for tokens coverage`.</done>
  <recovery>If `makeFakeHome` or `writeSubagentTranscript` signatures differ from the examples, read `__fixtures__/transcript-fixtures.cjs` lines 18-170 and adapt the calls. Do not copy those helpers.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: token-coverage.cjs library (tests 8-14)</name>
  <files>plugins/devflow/devflow/bin/lib/token-coverage.cjs, plugins/devflow/devflow/bin/lib/token-coverage.test.cjs</files>
  <action>
RED first: write `token-coverage.test.cjs` with tests 8-14 of the Test list, one at a time, using
`token-coverage-fixtures.cjs`. Run it, see it fail (module missing), and commit `test(66-01): …`. Then GREEN: create
`token-coverage.cjs` (CommonJS, sync fs) and commit `feat(66-01): …`.

Exports and contracts:
- `TARGET_PERCENT = 95`.
- `classifySummary(text)` returns `{class, source}`, where class is one of `live|backfill|unlabeled|missing|in_progress`.
  The rules are those of Test list 8. Token fields are present when both `tokens_input` and `tokens_output` are
  `filled` (the token-backfill rule). `source` is the unquoted, trimmed `tokens_source`, or null.
- `collectSummaries(readRoot, dirs)`. `dirs` is a list of `{number, dir}`, with `dir` relative to readRoot. It returns
  `{entries: [{id, objective, objective_dir, file, path, class, source}], skipped: [{objective_dir, file, reason}]}`.
  `objective_dir` is the basename. Pairing, duplicates and unreadable files follow tests 8 and 11. Sort entries per
  test 14.
- `coverageOf(entries)` returns `{counts: {summaries, counted, live, backfill, unlabeled, missing, in_progress},
  forward: {numerator, denominator, ratio, ratio_text, target_percent, met}}`. `ratio` is `live / counted` (a raw
  number, JSON only) or null. `ratio_text` is floored at 6 decimals with integer arithmetic and has trailing zeros
  trimmed. `met` is `live * 100 >= TARGET_PERCENT * counted`, or null when counted is 0.
- `explainMissing(entries, {indexFactory, readRoot})` returns new entries, with `reason` on missing ones only
  (test 12).
- `formatCoverage(report)` returns the text of tests 2, 4 and 13. The scope label is `v1.6` for a milestone and
  `objective 65` for an objective. The detail lines are indented two spaces, `  <id> <class>[ (<reason>)]`, and
  `in_progress` prints as `in progress`. A `skipped` file adds `  skipped <objective_dir>/<file> (<reason>)` after the
  entries.
- `buildCoverage({readRoot, scope, indexFactory})`. `scope` is `{kind, version?, objective?, dirs}`. It calls
  collect, explain and coverageOf, and returns
  `{scope: {kind, version|objective, objectives: [{number, dir}]}, read_root, counts, forward, entries, skipped}`.

Pseudocode for ratio_text:
```
if (counted === 0) return null
scaled = Math.floor(live * 1000000 / counted)     # exact for live, counted < 2^53 / 1e6
intPart = Math.floor(scaled / 1000000); frac = String(scaled % 1000000).padStart(6, '0').replace(/0+$/, '')
return frac ? `${intPart}.${frac}` : String(intPart)
```
# CRITICAL: no `toFixed`, no `Math.round`, no float comparison against 0.95.
# PATTERN: header comment like token-backfill.cjs (purpose, contracts, what it never writes).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` passes, with tests 8-14 present and none skipped. `git log --oneline -3` shows the RED `test(66-01)` commit before the `feat(66-01)` commit.</verify>
  <done>All 7 in-process tests pass. 37/39 prints `0.948717`, 5/7 prints `0.714285`, and 38/40 is `met: true`. The library never writes: `rg -n "writeFileSync|stampTokenFields|summaryPost|applyBackfill" plugins/devflow/devflow/bin/lib/token-coverage.cjs` finds nothing.</done>
  <recovery>If `extractFrontmatter` does NOT ignore `#` comment lines inside frontmatter (test 8, template_comments), strip lines matching `/^\s*#/` from the frontmatter block before parsing, in classifySummary only. Record that in the SUMMARY as a deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: `tokens coverage` subcommand, help and header (tests 1-7), plus a smoke run on this repo</name>
  <files>plugins/devflow/devflow/bin/lib/tokens-cli.cjs, plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED: append `describe('66-01 tokens coverage (end to end)', …)` with tests 1-7 to `tokens-cli.test.cjs`, using
`makeCoverageProject`. Update the header Test list comment of that file (`66-01 1.`-`7.` lines). Commit the failing
tests. GREEN:

1. `tokens-cli.cjs`:
   - `VALUE_FLAGS.coverage = ['milestone', 'objective', 'repo', 'root']` and `BOOL_FLAGS.coverage = []`. `coverage`
     takes no positional; reject one with `tokens coverage takes no TRD id; use --objective <N> or --milestone <v>`.
     Passing both scope flags is a usage error. `--objective` must match `/^\d+(?:\.\d+)?$/`.
   - `runCoverage({flags, cwd, root})` resolves `main`, `repoRoot` (`--repo` or main), the checkout, `readRoot` via
     the exported `readRootFor({mode, main, checkout})` (store → main, local → checkout), and `transcriptRoot`. It
     builds the scope (milestone through `selectMilestoneObjectives(readRoot, {version})`, mapping a throw to
     `usageError`, or the `--objective` directories) and calls `tokenCoverage.buildCoverage` with
     `indexFactory = () => tokenUsage.indexExecutorTranscripts({root: transcriptRoot, repoRoot})`. It returns
     `{ok: true, result, text: formatCoverage(result), exit: 0}`. With no project and no `--repo`, return the same
     usage error as backfill.
   - Update `USAGE` to
     `df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path> | backfill [--write] [--force] | coverage [--milestone <v> | --objective <N>]> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]`
     and update the subcommand lists in the two parse messages. Extend the module header comment with the coverage
     contract (read-only, exit codes, classes).
2. `help.cjs` `'tokens'` entry: set usage equal to the new USAGE. Add `coverage` to `summary`, and to `details` add one
   sentence on classes, live/counted, the floored decimal, the integer target check, exit 0 for a report and that it
   writes nothing.
3. `df-tools.cjs` header "Estimation data" block: add
   `tokens coverage [--milestone v | --objective N]  Forward-stamp coverage (live/counted) of TRD SUMMARYs; read-only`
   and a continuation line `[--repo p] [--root dir]`. Only the comment block changes: the `case 'tokens'` dispatch
   already passes argv through.
4. Smoke run on this repo, from the repo root, with the REPOSITORY copy (the installed 2.14.0 runtime does not have
   `coverage`):
   `node plugins/devflow/devflow/bin/df-tools.cjs tokens coverage --objective 65 --raw`
   Expected line 1: `objective 65 forward-stamped 2/4 = 0.5 (target 95%: not met) · live 2 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)`,
   with `  65-02 missing (no_transcript)` and `  65-03 missing (no_transcript)`. Paste the output verbatim into the
   SUMMARY. If it differs, investigate before changing any test: a different number here is a finding, never something
   to massage.

# GOTCHA: `--raw` prints the TEXT (helpers.output prints rawValue when raw). Without `--raw` the dispatcher prints JSON.
# GOTCHA: tests 1-9 in the existing file assert `USAGE` with `/df-tools tokens /`; keep that prefix.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/token-coverage.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs tokens --help` prints the usage with `coverage`. The smoke run prints the expected 65 line. `npm test` passes, or the documented micro exclusion is used and noted.</verify>
  <done>`df-tools tokens coverage` works with no flag, `--milestone` and `--objective`. Usage errors exit 1. A report always exits 0. The repo smoke run shows 65-01/65-04 live and 65-02/65-03 missing (no_transcript), recorded verbatim in the SUMMARY. The SUMMARY carries live-stamped `tokens_input`/`tokens_output` from `tokens stamp 66-01`.</done>
  <recovery>If the smoke run reports 65-02 or 65-03 as `stamp_skipped`, a transcript was matched that should not exist. Run `node plugins/devflow/devflow/bin/df-tools.cjs tokens trd 65-02` and record what it found. Do not change classification to hide it. If `help.test.cjs` or `dispatch-completeness.test.cjs` pin the old usage string, update only the pinned string.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs`: all pass and none are skipped except the existing prose-contract skip outside a DevFlow checkout.
- `node plugins/devflow/devflow/bin/df-tools.cjs tokens coverage --milestone v1.6 --raw`: line 1 names v1.6, and 65-02/65-03 are listed as `missing (no_transcript)`.
- `rg -n "toFixed|Math.round" plugins/devflow/devflow/bin/lib/token-coverage.cjs` finds nothing.
- The 66-01 SUMMARY frontmatter has `tokens_input`, `tokens_output` and `tokens_source: "live"`.
</verification>

<success_criteria>
- SC-3 has its command: forward-stamp coverage over a milestone or an objective, with an exact fraction, a floored decimal and an integer target check.
- Missing stamps are separated from backfilled and unlabeled ones, and each missing entry says why (stamp skipped or no transcript).
- No file is written by the command. Tests are hermetic, and all fixtures are hand-built.
</success_criteria>

<output>
After completion, publish `.planning/objectives/66-executor-token-stamp/66-01-SUMMARY.md` through `planning draft` →
`tokens stamp 66-01 --draft <path>` → `summary post 66-01 --from <path>`. Include the verbatim smoke-run output.
</output>
