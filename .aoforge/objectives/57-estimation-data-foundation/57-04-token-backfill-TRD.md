---
objective: 57-estimation-data-foundation
trd: "04"
type: standard
wave: 2
depends_on: ["57-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/token-backfill.cjs
  - plugins/devflow/devflow/bin/lib/token-backfill.test.cjs
autonomous: true
requirements: [EST-07]
must_haves:
  truths:
    - "planBackfill reads every SUMMARY under the checkout's .planning/objectives and classifies each as already_stamped, recovered or unrecovered (no_transcript, ambiguous_objective, zero_usage, unkeyed), with counts"
    - "planBackfill writes nothing: every file's bytes and mtime are unchanged after it runs"
    - "applyBackfill adds exactly the six token fields (tokens_source: \"backfill\") to each recovered SUMMARY's frontmatter through the summary post verb; no other byte of any file changes"
    - "A SUMMARY that already has tokens_input and tokens_output is never rewritten unless force is set; a conflicting existing value is never overwritten without force"
    - "Running plan + apply twice gives recovered 0 on the second plan (idempotent)"
    - "Inside a linked worktree, transcripts are matched against the main checkout path while SUMMARYs are read from and written to the worktree"
    - "An unrecoverable SUMMARY (transcript deleted by retention) is an expected outcome reported in the counts, not an error"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/token-backfill.cjs
      provides: "planBackfill, applyBackfill, formatBackfillReport"
  key_links:
    - "token-backfill.planBackfill -> token-usage.indexExecutorTranscripts (one scan) + tokensForTrd per SUMMARY -> context-audit.forEachRecord (EST-07 parser reuse)"
    - "token-backfill.applyBackfill -> token-usage.stampTokenFields (temp copy) -> planning-verbs.summaryPost (store-aware write)"
    - "57-06 wires `df-tools tokens backfill [--write] [--force]` onto planBackfill/applyBackfill"
---

# TRD 57-04: Retroactive token backfill library (EST-07)

<objective>
Recover token usage for historical TRDs from the transcripts that survive, and say plainly how many could not be recovered.

- `planBackfill`: a dry run. Build one executor-transcript index (57-01), walk every SUMMARY in the checkout, and decide
  per SUMMARY: already stamped, recovered (with the fields it would add), or unrecovered with a reason. It writes nothing.
- `applyBackfill`: for each recovered SUMMARY, stamp the six token fields onto a temp copy, then publish the new text with
  the `summary post` verb (planning-verbs.summaryPost). Local mode writes the file byte for byte. Store mode queues the
  write, so the D-01 invariant holds and nothing writes `.planning/` behind the verbs' back. Only SUMMARY frontmatter
  changes.
- `formatBackfillReport`: the fixed text report the CLI (57-06) prints.

Retention deletes transcripts (the 2026-08-18 audit found 164 sessions already gone), so `unrecovered: no_transcript` is
normal. The report counts it; the command still exits 0.

Purpose: EST-07, a retroactive pass backfills token data for historical TRDs from transcripts, reusing the `df-tools
context` parser.
Output: token-backfill.cjs (+ test). The CLI wiring lands in 57-06; the live run in 57-07.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(57-04): ...` RED commit before `feat(57-04): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash call.
- Fixtures: `transcript-fixtures.cjs` (57-01) for transcripts. Write literal SUMMARY/TRD text in mkdtemp repos. For the
  worktree test, use the git helpers the existing worktree suites use (`summary-worktree.test.cjs`,
  `__fixtures__/upgrade-fixtures.cjs` `initGitFixture`/`gitEnv`), so the operator's git config (signing, hooks) is never
  read. No generated data. Never read the real `~/.claude` or this repo's `.planning/`.
- Same wave: 57-03 owns tokens-cli.cjs, df-tools.cjs, help.cjs and the prose; 57-05 owns calibrator.cjs. Touch only
  your two files.
- Use token-usage.cjs (57-01) as it is. If an export is missing or wrong, record a deviation; do not re-implement it.

## Test list

Outermost first. token-backfill.test.cjs. Fixture repo `R` (realpath, local mode) with objective dirs:
`98-old` (`98-01-SUMMARY.md`, no transcript), `99-demo` (`99-01-demo-SUMMARY.md` with transcript THREE_MESSAGES;
`99-02-SUMMARY.md` already carrying `tokens_input: 5` / `tokens_output: 6`), `10-alpha` and `10-beta` (each with a
`10-01-SUMMARY.md`; one `10-01` transcript with no directory evidence), and `97-x/notes-SUMMARY.md` (unkeyed). Each dir
has its TRD file. Transcripts live under a fake projects root with REPO_ROOT = R.

1. `planBackfill({checkoutRoot:R, repoRoot:R, root})` gives counts `{summaries:6, already_stamped:1, recovered:1,
   unrecovered:4, by_reason:{ambiguous_objective:2, no_transcript:1, unkeyed:1}}` (zero_usage absent or 0). Entries are
   sorted by objective_dir, then file. The recovered entry for `99-01` carries `fields` with tokens_input 140747 and
   tokens_output 1370 and `tokens_source "backfill"`. RED.
2. Snapshot `{path: [bytes, mtimeMs]}` for every file under R before and after `planBackfill`: identical.
3. `applyBackfill(plan, {checkoutRoot:R})` gives `{written:['99-01'], unchanged:[], skipped:[], write_failed:[]}`.
   `99-01-demo-SUMMARY.md` (the existing name; no second SUMMARY is created) now equals its old text with the six token
   lines inserted at the end of the frontmatter block. Assert the expected text literally. Every other file's bytes are
   unchanged.
4. Idempotent: a second `planBackfill` gives `recovered:0, already_stamped:2`, and `applyBackfill` on it writes nothing.
5. Force: with `force:true`, `99-02` (5/6) is recomputed only if a transcript exists. Add a `99-02` transcript in this
   test: without force it stays `already_stamped` and its values are untouched; with force it becomes recovered, and
   apply replaces 5/6 with the transcript totals.
6. Zero usage: a `99-03` transcript with no usage records gives `unrecovered`/`zero_usage`.
7. Directory guard: give the `10-01` transcript the evidence `.planning/objectives/10-beta/` so `10-beta/10-01` is
   recovered. applyBackfill writes it only when `ghMapping.resolveObjective(R, '10').dir === '10-beta'` (compute that in
   the test). Otherwise it lands in `skipped` with reason `ambiguous_objective_dir` and the file is unchanged. Assert
   whichever branch applies, and assert `10-alpha/10-01-SUMMARY.md` is untouched in both.
8. Worktree: R is a git repo with `.planning/` committed; W is `git worktree add` of R. `planBackfill({checkoutRoot:W,
   repoRoot:R, root})` recovers `99-01` (transcripts name R), and `applyBackfill(plan, {checkoutRoot:W})` changes
   `W/.planning/.../99-01-demo-SUMMARY.md` while `R/.planning/.../99-01-demo-SUMMARY.md` stays byte-identical.
9. No transcripts at all (empty projects root): every keyed SUMMARY is `no_transcript`, nothing throws, and apply
   writes nothing.
10. `formatBackfillReport(plan)` returns exactly two lines; with `applied` it returns three. Expected format:
    `summaries 6 · already stamped 1 · recovered 1 · unrecovered 4 (ambiguous_objective 2, no_transcript 1, unkeyed 1)`
    `executor transcripts N (identified I, unidentified U, ambiguous A, foreign F)`
    `written 1 · unchanged 0 · skipped 0 · failed 0`
    Reasons are listed in sorted key order, and zero-count reasons are omitted.

<embedded_context>

<codebase_examples>
token-usage.cjs (57-01) surface:

```js
const tu = require('./token-usage.cjs');
const index = tu.indexExecutorTranscripts({ root, repoRoot });       // one scan: meta.json + first record only
tu.tokensForTrd(index, { id, dir, sharedNumber })                     // {status:'recovered', transcripts, totals} | {status:'unrecovered', reason}
tu.objectiveDirsFor(checkoutRoot, id)                                 // sorted dirs sharing the id's objective number
tu.tokenFrontmatterFields(totals, 'backfill')                         // [[key, value], ...] in TOKEN_FIELDS order
tu.stampTokenFields(filePath, fields, { force })                      // {ok, changed, conflicts}
tu.TOKEN_FIELDS                                                       // ['tokens_input','tokens_output',...,'tokens_source']
```

`sharedNumber` for a SUMMARY = `objectiveDirsFor(checkoutRoot, id).length > 1`.

Pairing and keys (helpers.cjs): `trdKey('99-01-demo-SUMMARY.md') === '99-01'`. A name without `NN-MM` falls back to a
suffix strip (`'notes'`); treat a key that `normTrdId` rejects as `unkeyed`.

The store-aware SUMMARY write (planning-verbs.cjs:816). Local mode writes `text` byte for byte into the checkout that
holds `root` (a worktree's own copy, TRD 53-01); store mode writes the main cache and queues the GitHub write:

```js
const verbs = require('./planning-verbs.cjs');
const r = verbs.summaryPost(checkoutRoot, { trd: '99-01', text: newText, file: '99-01-demo-SUMMARY.md' });
// r: { ok, mode, path, exit, error? }. Resolves the objective through ghMapping.resolveObjective(main, '99').
```

`summaryPost` picks the objective directory from the id alone (`objectiveTarget` → `ghMapping.resolveObjective`). With
two `10-*` directories it can only pick one. That is why apply checks
`ghMapping.resolveObjective(planningMode.resolveMainRoot(checkoutRoot), objectivePart).dir === entry.objective_dir`
before posting and skips on a mismatch.

Stamping a temp copy, so the only write is the verb:

```js
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-backfill-'));
const copy = path.join(tmp, file);
fs.writeFileSync(copy, text);
tu.stampTokenFields(copy, entry.fields, { force });
const newText = fs.readFileSync(copy, 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
```

Already stamped = SUMMARY frontmatter (`extractFrontmatter`) has non-empty `tokens_input` AND `tokens_output`.
</codebase_examples>

<anti_patterns>
- `fs.writeFileSync` on a `.planning/` path. Every SUMMARY write goes through `summaryPost`.
- Treating `no_transcript` as an error or a non-zero exit. It is the expected outcome for most of history.
- Reading the whole transcript corpus per SUMMARY. Build the index once per plan.
- Archived objectives under `.planning/milestones/*-objectives/` are out of scope for v1 (summaryPost does not resolve
  them). Walk `.planning/objectives/*` only, and say so in the module header.
</anti_patterns>

<error_recovery>
- `summaryPost` returns `ok:false`: record `{id, file, error}` in `write_failed` and continue. The CLI exits 1 when any
  write failed, after reporting all of them.
- Store mode (`github.store: true`): apply still goes through `summaryPost`, so each written SUMMARY queues one outbox
  write. Do not special-case it. The plan's counts tell the user how many writes to expect.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/token-usage.cjs
@plugins/devflow/devflow/bin/lib/planning-verbs.cjs
@.planning/objectives/57-estimation-data-foundation/57-01-SUMMARY.md
</context>

<gotchas>
- In a worktree, `resolveMainRoot(W)` is R (what REPO_ROOT and the transcript `cwd` name), while
  `resolveCheckoutRoot(W)` is W (the tree that will commit the change). The caller passes both explicitly; this module
  never guesses from `process.cwd()`.
- `setFrontmatterField` appends missing keys at the end of the frontmatter block and preserves everything else. Test 3's
  expected text must show the six lines immediately before the closing `---`.
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: planBackfill (dry run) + formatBackfillReport</name>
  <files>plugins/devflow/devflow/bin/lib/token-backfill.cjs, plugins/devflow/devflow/bin/lib/token-backfill.test.cjs</files>
  <action>
Start with a test-local `buildBackfillRepo(spec)` helper in token-backfill.test.cjs. It writes the literal fixture repo
described in the Test list and uses `writeSubagentTranscript` from transcript-fixtures.cjs for transcripts.

RED: tests 1, 2, 6, 9, 10. Commit `test(57-04): backfill plan classifies every historical SUMMARY without writing`.

GREEN: `planBackfill({checkoutRoot, repoRoot, root, force = false})`:
1. `index = indexExecutorTranscripts({root, repoRoot})`.
2. For each dir in `<checkoutRoot>/.planning/objectives` (sorted), each `*-SUMMARY.md` (sorted): `id = normTrdId(trdKey(file))`.
   Null gives `unkeyed`. Already stamped and `!force` gives `already_stamped`. Otherwise
   `tokensForTrd(index, {id, dir, sharedNumber})` → recovered (`fields = tokenFrontmatterFields(totals, 'backfill')`)
   or unrecovered with its reason.
3. Return `{checkout, repo, transcripts_root, index_counts: index.counts, entries, counts:{summaries, already_stamped,
   recovered, unrecovered, by_reason}}`.
`formatBackfillReport(plan, applied)` produces the lines from test 10.
Commit `feat(57-04): planBackfill reports recoverable and unrecoverable SUMMARYs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/token-backfill.test.cjs` passes (tests 1, 2, 6, 9, 10).</verify>
  <done>The listed tests pass after a recorded RED. The no-write snapshot test (2) passes.</done>
  <recovery>If counts disagree with test 1, print the entries and compare each reason against the tokensForTrd rules from 57-01 (directory evidence, sharedNumber). Fix the fixture only when it does not match the spec in the Test list.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: applyBackfill through summaryPost, with the directory guard and worktree semantics</name>
  <files>plugins/devflow/devflow/bin/lib/token-backfill.cjs, plugins/devflow/devflow/bin/lib/token-backfill.test.cjs</files>
  <action>
RED: tests 3, 4, 5, 7, 8. Commit `test(57-04): backfill writes token fields only through summary post`.

GREEN: `applyBackfill(plan, {checkoutRoot, force = false})`. For each `recovered` entry, in plan order:
1. Read `<checkoutRoot>/.planning/objectives/<dir>/<file>` and stamp a temp copy (codebase_examples).
   An unchanged text goes to `unchanged`.
2. Guard: `ghMapping.resolveObjective(resolveMainRoot(checkoutRoot), objectivePart).dir !== dir` gives
   `skipped: {id, file, reason:'ambiguous_objective_dir'}`.
3. `summaryPost(checkoutRoot, {trd: id, text: newText, file})`. A not-ok result goes to `write_failed`, otherwise
   `written`.
Return `{written, unchanged, skipped, write_failed}` (ids, sorted in plan order).
# CRITICAL: no fs write under `.planning/` in this module; grep proves it (see verify).
Commit `feat(57-04): applyBackfill stamps recovered SUMMARYs through summary post`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/token-backfill.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs` passes. `rg -n "writeFileSync|appendFileSync|renameSync" plugins/devflow/devflow/bin/lib/token-backfill.cjs` shows only the temp-copy write.</verify>
  <done>Tests 1-10 all pass; 3, 4, 5, 7 and 8 went RED then GREEN. The worktree test proves writes land in the checkout that will commit them.</done>
  <recovery>If summaryPost writes a second SUMMARY (e.g. `99-01-SUMMARY.md` beside `99-01-demo-SUMMARY.md`), the `file` argument was not passed or not a plain name. Pass the existing basename. If the worktree test cannot create a worktree in the sandbox, copy the approach summary-worktree.test.cjs uses; do not drop the test.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/token-backfill.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 2 (library half): the plan fills token data from transcripts via the 57-01 reader (which parses with
  context-audit.forEachRecord) and reports recovered vs unrecovered counts by reason.
- Dry run by default (the plan writes nothing); writes only on an explicit apply, and only SUMMARY frontmatter.
</verification>

<success_criteria>
- 57-06 can expose `tokens backfill [--write] [--force]` with no further library changes.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the exported signatures and the report format; 57-06 prints it unchanged.
</output>
