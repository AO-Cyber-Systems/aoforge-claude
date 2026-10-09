---
objective: 57-estimation-data-foundation
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/context-audit.cjs
  - plugins/devflow/devflow/bin/lib/context-audit.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-identify.cjs
  - plugins/devflow/devflow/bin/lib/trd-identify.test.cjs
  - plugins/devflow/hooks/gate-executor-stop.js
  - plugins/devflow/devflow/bin/lib/token-usage.cjs
  - plugins/devflow/devflow/bin/lib/token-usage.test.cjs
autonomous: true
requirements: [EST-06, EST-07]
must_haves:
  truths:
    - "sumUsage counts each API message once: records that share message.id (one per content block) contribute a single usage, taking the record with the largest output_tokens"
    - "For the hand-built 3-message executor transcript, tokensForTrd returns tokens_input 140747, tokens_output 1370, tokens_cache_read 121144, tokens_cache_write 19596"
    - "Only devflow executor transcripts count: a planner or verifier transcript whose prompt names the same TRD is ignored"
    - "A transcript from another repository (REPO_ROOT names a different path) never contributes to this repo's TRD"
    - "When an objective number has two directories (10-alpha, 10-beta), a transcript counts for a directory only when its prompt names that directory; otherwise the result is unrecovered with reason ambiguous_objective"
    - "context-audit.analyze and the token reader parse transcripts through the same forEachRecord function"
    - "identifyTrd and readFirstUserPrompt live in lib/trd-identify.cjs; hooks/gate-executor-stop.js re-exports the same function objects and its tests pass unchanged"
    - "stampTokenFields appends the six token fields to a frontmatter block without changing any other byte, and a second identical stamp reports changed:false"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/token-usage.cjs
      provides: "normTrdId, sumUsage, identifyExecutorTrd, indexExecutorTranscripts, tokensForTrd, objectiveDirsFor, TOKEN_FIELDS, tokenFrontmatterFields, stampTokenFields, defaultTranscriptRoot"
    - path: plugins/devflow/devflow/bin/lib/trd-identify.cjs
      provides: "identifyTrd, readFirstUserPrompt, readFirstUserRecord, repoRootOf (moved out of the hook)"
    - path: plugins/devflow/devflow/bin/lib/context-audit.cjs
      provides: "forEachRecord(file, fn), now used by analyze()"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
      provides: "hand-built Claude Code projects tree: subagent transcripts + meta.json"
  key_links:
    - "token-usage.sumUsage -> context-audit.forEachRecord (EST-07: reuse the df-tools context parser)"
    - "token-usage.identifyExecutorTrd -> trd-identify.identifyTrd (strict tier) -> hook gate-executor-stop re-exports it"
    - "token-usage.stampTokenFields -> frontmatter.setFrontmatterField (comment-preserving scalar setter)"
    - "57-03 tokens stamp and 57-04 backfill both call tokensForTrd + stampTokenFields"
---

# TRD 57-01: Transcript token reader (foundation for EST-06 and EST-07)

<objective>
Build the one library that answers "how many tokens did the executor for TRD `NN-MM` of this repo spend", from Claude Code
session transcripts. Both the forward stamp (57-03, EST-06) and the historical backfill (57-04, EST-07) call it, so they
agree by construction.

1. **Reuse the `df-tools context` parser (EST-07).** context-audit.cjs reads JSONL inline inside `analyze()`. Extract that
   loop into an exported `forEachRecord(file, fn)` and have `analyze()` use it. The token reader parses through the same
   function.
2. **Count usage correctly.** Claude Code writes one transcript record per content block, and every record of one API
   message repeats the same `message.usage` (observed: three records of `msg_011Cfb...` carry output 8, 8 and 225). A naive
   per-record sum double or triple counts. `sumUsage` dedupes by `message.id`.
3. **Find the executor's transcripts.** Subagent transcripts live at
   `~/.claude/projects/<project-key>/<session>/subagents/agent-<id>.jsonl` with a sibling `agent-<id>.meta.json`
   (`{"agentType":"devflow:executor","description":"Execute TRD 48-01",...}`); meta.json exists from spawn, so a live
   executor can find itself. Identify the TRD from the first user prompt, check the repository, and disambiguate the
   objective directory.
4. **Move TRD identification into lib.** `identifyTrd` and `readFirstUserPrompt` are in `hooks/gate-executor-stop.js`.
   The runtime mirror (`~/.claude/devflow/`) does not include `hooks/`, so df-tools cannot require the hook. Move both
   functions to `bin/lib/trd-identify.cjs`. The hook requires them from there and re-exports them. One source.

Purpose: EST-06 and EST-07 need trustworthy per-TRD token totals; calibration (57-05) turns them into medians and P90s.
Output: transcript-fixtures.cjs, trd-identify.cjs, token-usage.cjs (+ tests), context-audit.forEachRecord.
</objective>

<file_tree>
plugins/devflow/
├── hooks/gate-executor-stop.js                       ← MODIFY (require + re-export from lib)
└── devflow/bin/lib/
    ├── __fixtures__/transcript-fixtures.cjs          ← CREATE
    ├── context-audit.cjs / context-audit.test.cjs    ← MODIFY
    ├── trd-identify.cjs / trd-identify.test.cjs      ← CREATE
    └── token-usage.cjs / token-usage.test.cjs        ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(57-01): ...` commit (RED, failing for the right reason) before the `feat(57-01): ...` /
  `refactor(57-01): ...` commit. Write one test at a time inside a task when practical.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call (the worktree guard refuses compound commands: no `&&`, `;`, pipes or `$(...)`).
- Fixtures are hand-built by `transcript-fixtures.cjs`: literal prompt text, literal usage numbers. No generated data, no
  property-based tests, no `.feature` files. Tests never read or write the real `~/.claude`; every projects root is an
  `fs.mkdtemp` directory, realpath'd (macOS `/var` vs `/private/var`).
- Parallel wave: TRD 57-02 owns `calibration-inputs.cjs`, `calibration-fixtures.cjs` and `references/model-rates.json`.
  Do not touch them. Do not touch `df-tools.cjs` or `help.cjs` (57-03 and 57-06 wire the CLI).
- Do not normalize model ids here. `token_model` records the raw id the transcript reports (e.g. `claude-opus-5[1m]`);
  57-02 owns the one normalizer used for pricing.

## Test list

Outermost first. Expected numbers come from the fixture's literal usage values (shown in codebase_examples).

token-usage.test.cjs, `describe('57-01 executor token totals')`:
1. Fake projects root with one executor transcript for `99-01` (prompt style `plan_id`, REPO_ROOT = fixture repo, three API
   messages, each split over 2-3 records): `tokensForTrd(indexExecutorTranscripts({root, repoRoot}), {id:'99-01',
   dir:'99-demo', sharedNumber:false})` returns `status:'recovered'`, `transcripts.length===1` and totals
   tokens_input 140747, tokens_output 1370, tokens_cache_read 121144, tokens_cache_write 19596. RED.
2. Two executor transcripts for `99-01` in two sessions: values are the sum of both, `transcripts.length===2`.
3. A `devflow:planner` transcript whose prompt has `PLAN_ID: 99-01` is not in the index entries.
4. `REPO_ROOT: /elsewhere/repo` with `PLAN_ID: 99-01` is counted in `counts.foreign` and never matches.
5. No REPO_ROOT line: first-record `cwd` equal to the repo (or inside it) matches; a `cwd` elsewhere is foreign.
6. Objective `10` has `10-alpha` and `10-beta`. A `10-01` transcript whose prompt contains `.planning/objectives/10-beta/`
   recovers for `10-beta` only. A `10-01` transcript with no directory evidence gives `unrecovered`/`ambiguous_objective`
   for both directories when `sharedNumber:true`. With `dir:null` both `10-01` transcripts count (no directory filter).
7. Identification tiers (`identifyExecutorTrd`): `PLAN_ID: 48-01` gives `48-01`. `Execute plan 48-01 of objective
   48-planning-write-path-migration.` gives `48-01` with dirs `['48-planning-write-path-migration']`.
   `.planning/objectives/48-x/48-01-ledger-TRD.md` gives `48-01` with dirs `['48-x']`. A bare prompt plus description
   `Execute TRD 48-01` gives `48-01`. A prompt naming two TRD paths with different ids returns `{ambiguous:true}`. A
   prompt with no id and no description returns null.
8. Malformed JSONL lines, records without `message.usage`, and records whose model is `<synthetic>` are ignored.
9. `token_model` is the raw model id with the largest output total (`claude-opus-5[1m]` stays as written); a tie picks
   the lexicographically smaller id.
10. A matched transcript with no usage records gives `unrecovered`/`zero_usage`. No matching transcript gives
    `unrecovered`/`no_transcript`. An index over a missing root has zero entries and does not throw.
11. `normTrdId`: `'4-1'` gives `'04-01'`, `'48-01'` stays, `'4.1-2'` gives `'04.1-02'`, `'10-04a'` and `'x'` give null.
12. `tokenFrontmatterFields(totals, 'live')` returns the six fields in TOKEN_FIELDS order, with `token_model` JSON-quoted.
    `stampTokenFields(file, fields, {force:false})` on a literal SUMMARY with a `# comment` line in its frontmatter appends
    the six lines and leaves every other byte equal. A second identical call gives `changed:false`. With an existing
    different `tokens_input`, it reports `conflicts:['tokens_input']` and leaves that line alone. `{force:true}` replaces it.
13. `objectiveDirsFor(checkoutRoot, '10-01')` returns `['10-alpha','10-beta']` (sorted) for the fixture and `[]` when
    `.planning/objectives` is absent.

trd-identify.test.cjs:
14. `require('../../../hooks/gate-executor-stop.js').identifyTrd === require('./trd-identify.cjs').identifyTrd`, and the
    same for `readFirstUserPrompt`. RED until the move.
15. `readFirstUserRecord(file)` returns the parsed first `type:'user'` record including its `cwd`. `readFirstUserPrompt`
    still returns its text. A first user record with empty content gives prompt null. `repoRootOf('REPO_ROOT:  /a/b\n')`
    gives `/a/b`, and a relative value gives null.

context-audit.test.cjs:
16. `forEachRecord(file, fn)` calls `fn` once per parsed row in file order, skips blank and malformed lines, and returns
    true. It returns false for an unreadable path without calling `fn`. Existing tokensOfResult/accumulate/summarize tests
    pass unchanged.

Regression guards (no new tests): `hooks/gate-executor-stop.test.js`, `summary-pairing.test.cjs`,
`summary-worktree.test.cjs`, `regex-escape.repo.test.cjs` pass.

<embedded_context>

<codebase_examples>
Real transcript shapes this objective reads (observed 2026-10-05 on this machine; reproduce them literally in fixtures):

```text
~/.claude/projects/-Users-justin-dev-devflow-claude/543de757-.../subagents/agent-a050c4d59de36e9d2.jsonl
~/.claude/projects/-Users-justin-dev-devflow-claude/543de757-.../subagents/agent-a050c4d59de36e9d2.meta.json
meta.json: {"agentType":"devflow:executor","description":"Execute TRD 48-01","toolUseId":"toolu_...","spawnDepth":2}
project key = absolute session cwd with every non [A-Za-z0-9] char replaced by '-'
  /Users/justin/dev/devflow-claude                -> -Users-justin-dev-devflow-claude
  /private/tmp/claude-501/-Users-justin-dev-x     -> -private-tmp-claude-501--Users-justin-dev-x
first line (user record, fields besides message):
  {"parentUuid":null,"isSidechain":true,"agentId":"a050...","type":"user","cwd":"/Users/justin/dev/devflow-claude",
   "sessionId":"543de757-...","timestamp":"2026-10-01T11:44:02.108Z",...}
assistant records of ONE API message (same message.id, usage repeated, output grows on the last block):
  {"type":"assistant","isSidechain":true,"message":{"model":"claude-opus-5-5","id":"msg_011CfbTZz...",
   "content":[{"type":"thinking",...}],"usage":{"input_tokens":2,"cache_creation_input_tokens":17701,
   "cache_read_input_tokens":27949,"output_tokens":8}}}
  ... same id, content [{"type":"text",...}], output_tokens 8
  ... same id, content [{"type":"tool_use",...}], output_tokens 225, stop_reason "tool_use"
```

Executor prompt shapes seen in history (853 executor transcripts; 500 lack PLAN_ID). Use literal versions in
`executorPrompt(style, ...)`:

```text
plan_id (current orchestrator):
  <objective>\nExecute plan 48-01 of objective 48-planning-write-path-migration.\n...</objective>
  ...  .planning/objectives/48-planning-write-path-migration/48-01-planning-mode-paths-ledger-TRD.md
  REPO_ROOT:  /Users/justin/dev/devflow-claude\nWAVE_BASE:  baad3946...\nPLAN_ID:    48-01
objective_tag (older):   <objective>\nExecute plan 48-01 of objective 48-planning-write-path-migration.\n...
trd_path:                Execute TRD /Users/justin/dev/devflow-claude/.planning/objectives/48-x/48-01-ledger-TRD.md
bare (description only): Execute ONE TRD to completion. Everything you need is inlined below.
```

Fixture usage numbers for tests 1 and 12 (three messages, model claude-opus-5-5):

| message | input | cache_creation | cache_read | output (final record) | records |
|---|---|---|---|---|---|
| msg_A | 2 | 17701 | 27949 | 225 (earlier records 8, 8) | 3 |
| msg_B | 2 | 1895 | 45650 | 222 (earlier 8) | 2 |
| msg_C | 3 | 0 | 47545 | 923 (earlier 8, 8) | 3 |

tokens_input = sum(input + cache_creation + cache_read) = 140747; tokens_output = 1370; cache_read 121144; cache_write 19596.
The naive per-record sum gives a different number, which is the point of test 1.

The loop to extract (context-audit.cjs:208-219, inside analyze):

```js
for (const file of files) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    accumulate(acc, row);
  }
  acc.toolNameById = {};
}
```

Target: `function forEachRecord(file, fn) { /* read; false on error; JSON.parse each non-blank line; skip bad */ return true; }`
and `analyze` becomes `if (!forEachRecord(file, (row) => accumulate(acc, row))) continue;`. Export it.

The hook's identification block to move verbatim (gate-executor-stop.js:43-188: ID, ID_END, the *_RE constants,
capturesOf, unique, frontmatterIds, identifyTrd, textOfContent, userTextOfLine, readFirstUserPrompt). After the move,
gate-executor-stop.js keeps `escapeRegExp` (summaryExists uses it) and does:

```js
const { identifyTrd, readFirstUserPrompt } = require('../devflow/bin/lib/trd-identify.cjs');
// ... module.exports keeps identifyTrd, readFirstUserPrompt (same function objects)
```

Hooks already require lib this way (`require('../devflow/bin/lib/text-escape.cjs')`). To add `readFirstUserRecord`
without duplicating the bounded chunked reader, parameterise the scanner. `userTextOfLine` becomes a `pick(rec)` callback:
`readFirstUserPrompt` picks `textOfContent(rec.message.content) || null` and `readFirstUserRecord` picks `rec`. The
hook test suite pins the existing behaviour, so it must stay green.

Comment-preserving setter to reuse (frontmatter.cjs:243):

```js
setFrontmatterField(filePath, key, value, { ifAbsentOrEqual })
// -> { ok, changed, conflict?, existing?, warning?, error? }; writes only on change; appends a missing key at block end
```

Directory helpers to reuse: `helpers.normalizeObjectiveName`, `helpers.objectiveDirMatches(dirName, normalized)`.
Regex text must go through `text-escape.cjs` `escapeRegExp` (regex-escape.repo.test.cjs fails on hand-rolled escapes).
</codebase_examples>

<anti_patterns>
- Summing `usage` per record. One API message is 1-4 records with identical input/cache numbers.
- Reading every transcript in full to find the executor. Read meta.json first (agentType must end in `executor`), then
  only the first user record. Sum usage only for transcripts that matched. ~2,000 subagent transcripts exist on this
  machine, many of them several MB.
- A recursive walk of `~/.claude/projects`. The layout is exactly `<root>/<key>/<session>/subagents/agent-*.meta.json`.
  Read those three levels and nothing deeper.
- Calling `os.homedir()` at module load. Resolve `defaultTranscriptRoot()` at call time (audit-cli does this; HOME-isolated
  tests depend on it).
- Matching only on the TRD id. Ids repeat across repositories (devflow-claude vs eden-biz both have `NN-MM`) and within one
  repository (three `10-*` objectives here).
</anti_patterns>

<error_recovery>
- Hook tests fail after the move: diff the moved block against `git show HEAD:plugins/devflow/hooks/gate-executor-stop.js`.
  The move must be verbatim apart from the scanner parameterisation. Revert the scanner change first and re-add it under
  the tests.
- A `realpath` mismatch makes repo matching fail in tests on macOS: realpath both sides (`fs.realpathSync`, falling back
  to `path.resolve` when the path does not exist).
- context-audit tests regress: `forEachRecord` must keep `analyze`'s skip semantics (unreadable file → skip whole file;
  bad line → skip line) and the per-file `toolNameById` reset.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/context-audit.cjs
@plugins/devflow/hooks/gate-executor-stop.js
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
</context>

<gotchas>
- `identifyTrd` is the hook's conservative identifier: its TRD-path tier matches only `NN-MM-TRD.md`, not
  `NN-MM-<slug>-TRD.md`. Do not loosen it; the hook depends on its fail-open behaviour. The extra tiers for historical
  prompt shapes go in `token-usage.identifyExecutorTrd`, which calls `identifyTrd` first.
- Directory evidence from a prompt is filtered to directories whose objective number equals the id's. Executor prompts
  often cite other objectives' paths (for example "read the 56-02 SUMMARY").
- Executors run in worktrees, but REPO_ROOT and the first-record `cwd` name the main checkout. Repo matching compares
  against the main checkout path the caller passes as `repoRoot`.
- Known baseline `npm test` failures on this machine: stack-drafter-fleet (github-enterprise-migration / real fleet) and
  handoff-e2e MA-7 (PTY mock auth). Anything else that fails is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Transcript fixture builder + context-audit.forEachRecord + sumUsage with message-id dedupe</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs, plugins/devflow/devflow/bin/lib/context-audit.cjs, plugins/devflow/devflow/bin/lib/context-audit.test.cjs, plugins/devflow/devflow/bin/lib/token-usage.cjs, plugins/devflow/devflow/bin/lib/token-usage.test.cjs</files>
  <action>
Fixture builder first (no test of its own; tests 1-13 exercise it). transcript-fixtures.cjs exports:
- `makeProjectsRoot()`: realpath'd mkdtemp dir standing in for `~/.claude/projects`. `makeFakeHome()`:
  `{home, projectsRoot: home/.claude/projects}`.
- `projectKeyFor(absPath)`: `absPath.replace(/[^A-Za-z0-9]/g, '-')`.
- `assistantRecords({id, model, input, cacheWrite, cacheRead, output, blocks})`: `blocks` records sharing `message.id`.
  Earlier records carry output 8; the last carries `output` and `stop_reason:'tool_use'`. `isSidechain:true`.
- `executorPrompt(style, {id, objectiveDir, slug, repoRoot})`: the literal shapes from codebase_examples.
- `writeSubagentTranscript(projectsRoot, {projectKey, session, agentId, agentType='devflow:executor', description, prompt,
  cwd, records, extraLines=[]})`: writes the user record line (with `cwd`, `sessionId`, a fixed timestamp
  `2026-10-01T00:00:00.000Z`), then the records and the raw `extraLines` (for malformed-line tests), plus `agent-<id>.meta.json`.
  Returns the jsonl path.
- `THREE_MESSAGES`: the msg_A/B/C table from codebase_examples as `assistantRecords` arrays, model `claude-opus-5-5`.

RED: test 16 (context-audit.test.cjs, new `describe('forEachRecord')`) and tests 1 (sumUsage half only: call
`sumUsage(file)` and assert input/cache/output totals), 8 and 9 in token-usage.test.cjs. Commit
`test(57-01): transcript usage is counted once per API message`.

GREEN:
- context-audit.cjs: add and export `forEachRecord`; switch `analyze` to it (codebase_examples).
- token-usage.cjs: `sumUsage(file)` → `{readable, messages, input, cache_creation, cache_read, output, by_model}`, built on
  `forEachRecord`. Only `type:'assistant'` rows with `message.usage` and a model other than `<synthetic>` count. The key is
  `message.id`, else `uuid`. Per key keep the usage of the record with the largest `output_tokens`. `by_model[rawModel]`
  holds the same five numbers. Also `pickModel(by_model)` (largest output; tie → smaller id).
Commit `feat(57-01): sumUsage reads transcripts through context-audit.forEachRecord`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/context-audit.test.cjs plugins/devflow/devflow/bin/lib/token-usage.test.cjs` passes.</verify>
  <done>Tests 8, 9, 16 and the sumUsage half of test 1 pass after a recorded RED. analyze() output is unchanged (existing context-audit tests pass).</done>
  <recovery>If a fixture record shape does not parse, compare it to the observed record in codebase_examples (usage sits under `message.usage`, model under `message.model`). Never loosen sumUsage to accept a shape real transcripts do not have.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Move identifyTrd/readFirstUserPrompt to lib/trd-identify.cjs; hook re-exports</name>
  <files>plugins/devflow/devflow/bin/lib/trd-identify.cjs, plugins/devflow/devflow/bin/lib/trd-identify.test.cjs, plugins/devflow/hooks/gate-executor-stop.js</files>
  <action>
RED: tests 14-15 in trd-identify.test.cjs. Build transcript files with `writeSubagentTranscript` (Task 1). Commit
`test(57-01): TRD identification is a lib module the hook re-exports`.

GREEN: create trd-identify.cjs (`'use strict'`, requires only fs and path) and move the identification block from the
hook verbatim. Add `repoRootOf(text)` (REPO_ROOT_RE; absolute paths only, else null) and `readFirstUserRecord` through a
parameterised scanner (codebase_examples). In the hook, delete the moved block, require the four names from lib, and keep
`identifyTrd` and `readFirstUserPrompt` in its module.exports. Update the hook header comment to say where identification
lives now. Commit `refactor(57-01): move executor TRD identification to lib/trd-identify.cjs`.

Then run the hook suite and both lib suites that import the hook.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/trd-identify.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs plugins/devflow/devflow/bin/lib/summary-worktree.test.cjs plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs` passes.</verify>
  <done>Tests 14-15 pass after a recorded RED. The hook's own suite passes unchanged and the hook no longer defines identifyTrd/readFirstUserPrompt itself.</done>
  <recovery>If regex-escape.repo.test.cjs flags the new file, it is because a pattern built from text skipped `escapeRegExp`. Import it from text-escape.cjs as the hook did. If its scanned-file list must name the new file, add it there rather than exempting it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Executor transcript index, repo/objective matching, tokensForTrd and the frontmatter stamp</name>
  <files>plugins/devflow/devflow/bin/lib/token-usage.cjs, plugins/devflow/devflow/bin/lib/token-usage.test.cjs</files>
  <action>
RED: tests 1 (full), 2-7 and 10-13. Commit `test(57-01): executor token totals per TRD, scoped to repo and objective`.

GREEN in token-usage.cjs. Approach:
1. `normTrdId(id)`: `/^(\d+(?:\.\d+)?)-(\d+)$/` → `normalizeObjectiveName(obj) + '-' + trd.padStart(2,'0')`, else null.
2. `identifyExecutorTrd({prompt, description})`:
   - tier 1 `trdIdentify.identifyTrd(prompt)`;
   - tier 2: ids from `\bExecute\s+(?:plan|TRD)\s+`?(ID)`?(?![\w-])` and from
     `objectives\/[^\/\s]+\/(ID)(?:-[^\/\s]*)?-TRD\.md`;
   - tier 3: `description` matching `^Execute\s+(?:TRD|plan)\s+`?(ID)`?(?![\w-])` (case-insensitive).
   The first tier that yields ids decides: one distinct normalized id gives `{id, dirs}`, more than one gives
   `{ambiguous:true}`, none in any tier gives null. `dirs` = unique `objectives/<dir>/` segments and
   `objective <NN-slug>` phrases from the prompt, kept only when `normalizeObjectiveName(dir)` equals the id's objective
   part. Sort them.
3. `indexExecutorTranscripts({root = defaultTranscriptRoot(), repoRoot})`: for each `<root>/<key>/<session>/subagents/*.meta.json`
   (sorted) with `agentType` ending in `executor`, read `readFirstUserRecord` on the sibling jsonl. Identify. Then match the
   repo: `repoRootOf(prompt)` present → it must realpath-equal repoRoot (`match:'repo_root'`), else foreign. Absent →
   record `cwd` equal to or inside repoRoot (`'cwd'`), or the prompt contains `<repoRoot>/.planning/` (`'path'`), else
   foreign. Return `{entries:[{file, session, agent_id, id, dirs, match}], counts:{executor_transcripts, identified,
   unidentified, ambiguous, foreign}}`. A missing root gives zero counts.
4. `tokensForTrd(index, {id, dir, sharedNumber})`: candidates = entries with `entry.id === normTrdId(id)`. With `dir`
   null, keep every candidate (no directory filter). Otherwise keep those whose `dirs` include `dir`, or whose `dirs`
   are empty when `!sharedNumber`. If entries for the id exist but were all dropped
   for missing directory evidence while `sharedNumber`, the result is `ambiguous_objective`. Sum `sumUsage` over the kept
   files. All-zero gives `zero_usage`, none gives `no_transcript`. Recovered:
   `{status:'recovered', transcripts:[{file, session, agent_id}], totals:{tokens_input, tokens_output, tokens_cache_read,
   tokens_cache_write, token_model}}`.
5. `objectiveDirsFor(checkoutRoot, id)`: sorted dirs in `<checkoutRoot>/.planning/objectives` with
   `objectiveDirMatches(d, normalizeObjectiveName(idObjectivePart))`.
6. `TOKEN_FIELDS = ['tokens_input','tokens_output','tokens_cache_read','tokens_cache_write','token_model','tokens_source']`.
   `tokenFrontmatterFields(totals, source)` gives `[[key, serialisedValue], ...]` in that order (integers bare,
   `token_model` and `tokens_source` JSON-quoted).
   `stampTokenFields(filePath, fields, {force})` calls `setFrontmatterField` per field (`ifAbsentOrEqual: !force`) and
   returns `{ok, changed, conflicts}`.
7. Export everything listed in must_haves.artifacts plus `pickModel`.
# CRITICAL: never read a transcript body before meta.json says executor and the repo matched.
# PATTERN: pure functions over explicit paths; the only fs reads are meta.json, the first record, and matched jsonl files.
Commit `feat(57-01): tokensForTrd finds a TRD's executor transcripts and stamps token fields`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/token-usage.test.cjs plugins/devflow/devflow/bin/lib/context-audit.test.cjs plugins/devflow/devflow/bin/lib/trd-identify.test.cjs` passes. Then a read-only smoke against real data: `node -e "const t=require('./plugins/devflow/devflow/bin/lib/token-usage.cjs');const i=t.indexExecutorTranscripts({repoRoot:'/Users/justin/dev/devflow-claude'});console.log(i.counts, t.tokensForTrd(i,{id:'56-02',dir:'56-objective-number-correctness',sharedNumber:false}).status)"` prints counts with identified > 0 and a status (recovered expected; record the result in the SUMMARY either way).</verify>
  <done>Tests 1-13 pass after a recorded RED; test 1 proves the dedupe with exact numbers. The smoke run completes in seconds and reads only executor transcripts.</done>
  <recovery>If the smoke run is slow, check that meta.json filtering happens before any jsonl read and that only the first record is read during indexing. If 56-02 is unrecovered, inspect its index entry (id, dirs, match) and record why in the SUMMARY. Retention may have removed it, which is acceptable; a wrong match rule is not.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/token-usage.test.cjs plugins/devflow/devflow/bin/lib/trd-identify.test.cjs plugins/devflow/devflow/bin/lib/context-audit.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- The token reader parses transcripts through `context-audit.forEachRecord` (EST-07 reuse): `rg -n "forEachRecord" plugins/devflow/devflow/bin/lib/token-usage.cjs` finds the call.
- Exact totals for the hand-built transcript prove the per-message dedupe.
- Planner/verifier transcripts, foreign repositories and ambiguous objective numbers never contribute tokens.
- `hooks/gate-executor-stop.js` behaviour is unchanged; identification has one home in lib.
</verification>

<success_criteria>
- `tokensForTrd` + `stampTokenFields` are ready for 57-03 (forward stamp) and 57-04 (backfill) with no further changes.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the final exported signatures of token-usage.cjs and the smoke-run counts; 57-03 and 57-04
build on them.
</output>
