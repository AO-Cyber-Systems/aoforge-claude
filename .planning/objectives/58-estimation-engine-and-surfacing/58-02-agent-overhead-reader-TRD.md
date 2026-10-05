---
objective: 58-estimation-engine-and-surfacing
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/agent-overhead.cjs
  - plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs
  - plugins/devflow/devflow/bin/lib/token-usage.cjs
autonomous: true
requirements: [EST-03]
must_haves:
  truths:
    - "Every subagent transcript whose meta.json agentType is a non-executor DevFlow agent (planner, job-checker, verifier, objective-researcher, integration-checker, roadmapper; devflow: or df- prefix) is one overhead spawn; executor and non-DevFlow agents are ignored"
    - "A spawn belongs to a repository by the same rule the executor index uses (REPO_ROOT line, first-record cwd in the repo or its .df-worktrees, or a <repo>/.planning/ path); spawns of other repositories are counted as foreign"
    - "Planner spawns whose description starts with 'Quick' are excluded and counted, so quick plans never inflate objective planning overhead"
    - "A spawn sample has wall minutes from its first to its last record timestamp and token totals counted once per API message (token-usage.sumUsage), split by model so the calibrator can price it"
    - "collectOverhead is deterministic (samples sorted by agent, project, session, agent id) and never reads ~/.claude unless given that root"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/agent-overhead.cjs
      provides: "OVERHEAD_AGENTS, normalizeAgentType, isQuickSpawn, transcriptSpanMinutes, spawnSample, indexOverheadTranscripts, collectOverhead"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
      provides: "timestamp-aware records, writeOverheadTranscript, PLANNER_SPAWN and VERIFIER_SPAWN literal spawns"
  key_links:
    - "agent-overhead.cjs -> token-usage.sumUsage / repoMatcher / repoMatch and trd-identify.readFirstUserRecord / textOfContent"
    - "58-03 calibrator.cjs -> collectOverhead (agent_overhead block in calibration.json)"
---

# TRD 58-02: Agent overhead reader (EST-03 input)

<objective>
EST-03 adds agent overhead to objective and milestone estimates. Executor overhead is already inside the task values
(calibration.json note: "do not add executor overhead on top"), but the planner, plan checker, verifier, researcher,
integration checker and roadmapper are not measured anywhere. Their transcripts are: this repository alone has 36 planner,
31 verifier and 20 job-checker subagent transcripts with an `agentType` in meta.json.

This TRD reads them: one sample per spawn, with wall minutes, tokens (counted once per API message, as 57-01 does) and
the per-model split the calibrator needs to price it. 58-03 aggregates the samples into an `agent_overhead` block of
calibration.json. Pricing stays in calibrator.cjs, so this module does not require it (calibrator will require this one).

Purpose: the measured input behind "adds agent overhead" (EST-03).
Output: agent-overhead.cjs (+ test), timestamp-aware transcript fixtures, two token-usage exports.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── agent-overhead.cjs                     ← CREATE
├── agent-overhead.test.cjs                ← CREATE
├── token-usage.cjs                        ← MODIFY (export repoMatcher, repoMatch)
└── __fixtures__/transcript-fixtures.cjs   ← MODIFY (timestamps, writeOverheadTranscript, PLANNER_SPAWN, VERIFIER_SPAWN)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(58-02): ...` RED before `feat(58-02): ...` for each task. The fixture-builder change is committed with
  the first RED (`test(58-02): ...`), since it adds no production behaviour.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- Fixtures are hand-built and literal (no generated data, no property-based tests). Every projects root is
  `makeProjectsRoot()` (mkdtemp); nothing reads the real `~/.claude`. `collectOverhead` and `indexOverheadTranscripts`
  take the root as a required argument; resolving `~/.claude/projects` is the CLI's job (58-03).
- transcript-fixtures.cjs is shared with token-usage, token-backfill and tokens-cli tests: every change is additive with
  defaults that keep today's output byte-identical (`FIXED_TIMESTAMP` stays the default).
- Same wave: 58-01 owns estimate-math; 58-04 owns the run store and statusline. Touch only the four files above.

## Test list

Outermost first; `agent-overhead.test.cjs`. World: `root = makeProjectsRoot()`; repo `R` = a realpath'd mkdtemp dir with
`.planning/objectives/` (label `repo-r`); foreign repo `F` likewise. Project keys via `projectKeyFor(cwd)`.

Fixture constants (add to transcript-fixtures.cjs, literal):

```js
PLANNER_SPAWN = { agentType: 'devflow:planner', description: 'Plan Objective 80', start: '2026-10-01T10:00:00.000Z',
  messages: [
    { id: 'msg_P1', model: 'claude-opus-5-5', input: 10, cacheWrite: 1000, cacheRead: 50000, output: 2000, blocks: 2, at: '2026-10-01T10:03:00.000Z' },
    { id: 'msg_P2', model: 'claude-opus-5-5', input: 5, cacheWrite: 0, cacheRead: 60000, output: 4000, blocks: 1, at: '2026-10-01T10:06:00.000Z' },
  ] }
VERIFIER_SPAWN = { agentType: 'devflow:verifier', description: 'Verify objective 80', start: '2026-10-01T10:10:00.000Z',
  messages: [
    { id: 'msg_V1', model: 'claude-sonnet-5-5', input: 3, cacheWrite: 500, cacheRead: 20000, output: 1500, blocks: 3, at: '2026-10-01T10:14:00.000Z' },
  ] }
```

Transcripts written into `root` for tests 4-5:

| session/agent | agentType | description | cwd | note |
|---|---|---|---|---|
| s1/p1 | devflow:planner | Plan Objective 80 | R | PLANNER_SPAWN |
| s1/v1 | devflow:verifier | Verify objective 80 | R | VERIFIER_SPAWN |
| s1/c1 | devflow:job-checker | Verify Objective 80 plans | R | one message |
| s2/q1 | devflow:planner | Quick plan: fix X | R | excluded, counted `quick` |
| s2/e1 | devflow:executor | Execute TRD 80-01 | R | ignored, not counted |
| s2/g1 | general-purpose | Explore | R | ignored, not counted |
| s3/f1 | devflow:verifier | Verify objective 9 | F | `foreign` |
| s3/x1 | devflow:planner | Plan Objective 81 | R | meta only, no jsonl: `unreadable` |
| s3/l1 | df-verifier | Verify objective 79 | R | legacy prefix, counted as verifier |

1. `normalizeAgentType`: `'devflow:planner'` -> `'planner'`, `'df-verifier'` -> `'verifier'`, `'devflow:job-checker'` ->
   `'job-checker'`, `'devflow:executor'` -> null, `'general-purpose'` -> null, `undefined` -> null. `OVERHEAD_AGENTS` is
   the sorted frozen list `['integration-checker', 'job-checker', 'objective-researcher', 'planner', 'roadmapper',
   'verifier']`. `isQuickSpawn({description: 'Quick plan: x'})` is true, `'Plan Objective 80'` false.
2. `transcriptSpanMinutes(p1 file)` is 6; a user-record-only transcript gives null; records whose timestamp does not parse
   are skipped.
3. `spawnSample(p1 file)` is `{minutes: 6, tokens_input: 111015, tokens_output: 6000, tokens_cache_read: 110000,
   tokens_cache_write: 1000, by_model: {'claude-opus-5-5': {tokens_input: 111015, tokens_output: 6000,
   tokens_cache_read: 110000, tokens_cache_write: 1000}}}`. The v1 spawn gives minutes 4, tokens_input 20503,
   tokens_output 1500. A transcript with no assistant usage gives tokens null (not a token sample) and keeps its minutes.
   A two-model transcript splits `by_model` per model. `token-usage.cjs` exports `repoMatcher` and `repoMatch` (assert
   `typeof === 'function'`).
4. `indexOverheadTranscripts({root, projects: [{root: R, label: 'repo-r'}]})` returns entries for p1, v1, c1 and l1 (with
   `agent`, `project: 'repo-r'`, `session`, `agent_id`, `file`), and counts `{spawns: 7, matched: 4, foreign: 1,
   quick: 1, unreadable: 1, by_agent: {'job-checker': 1, planner: 1, verifier: 2}}` (spawns counts only overhead-typed
   meta files: p1, v1, c1, q1, f1, x1, l1). Passing both R and F as projects matches f1 to F.
5. `collectOverhead({root, projects})` returns `{samples, counts}`; samples are sorted by agent, then project, session,
   agent_id, and two calls are deep-equal. Calling either function without `root` throws an Error naming the argument.

<embedded_context>

<codebase_examples>
The executor index this mirrors (token-usage.cjs, 57-01), unchanged except for the new exports:

```js
const META_RE = /^agent-(.+)\.meta\.json$/;
for (const key of sortedNames(root, true)) {
  for (const session of sortedNames(path.join(root, key), true)) {
    const subagents = path.join(root, key, session, 'subagents');
    for (const name of sortedNames(subagents, false)) {
      const m = META_RE.exec(name);
      if (!m) continue;
      const meta = readJson(path.join(subagents, name));
      if (!meta || typeof meta.agentType !== 'string' || !meta.agentType.endsWith('executor')) continue;
      ...
      const rec = trdIdentify.readFirstUserRecord(file);
      const prompt = trdIdentify.textOfContent(rec.message && rec.message.content);
      const match = repoMatch(prompt, rec.cwd, repo);   // repo = repoMatcher(repoRoot)
```

`sumUsage(file)` returns `{readable, messages, input, cache_creation, cache_read, output, by_model: {<model>: {messages,
input, cache_creation, cache_read, output}}}`, each API message counted once. The SUMMARY convention (and the calibrator's
pricing) is `tokens_input = input + cache_creation + cache_read` (fresh input plus both cache counts).

Fixture writer to extend (transcript-fixtures.cjs): `assistantRecords({id, model, input, cacheWrite, cacheRead, output,
blocks})` stamps every record with `FIXED_TIMESTAMP`; `writeSubagentTranscript(projectsRoot, {projectKey, session,
agentId, agentType, description, prompt, cwd, records, extraLines})` writes the user record (also `FIXED_TIMESTAMP`) and
meta.json. Add an optional `timestamp` to both (default `FIXED_TIMESTAMP`) and a `writeOverheadTranscript(projectsRoot,
{projectKey, session, agentId, spawn, cwd, prompt})` that writes the user record at `spawn.start` and each message's
records at `message.at`.
</codebase_examples>

<anti_patterns>
- Summing usage per record. Records of one API message repeat its usage; `sumUsage` already dedupes by message id.
- Pricing in this module. calibrator.cjs owns `sampleCost`, and requiring it here would make a require cycle once 58-03
  makes the calibrator require this module.
- `os.homedir()` or a default transcripts root here. Tests must never reach the real `~/.claude/projects`.
- Matching a spawn to a repository by its project-key directory name. Keys are lossy (every non-alphanumeric becomes `-`);
  the first record's cwd and the prompt are the evidence, as for executors.
</anti_patterns>

<error_recovery>
- If an existing token-usage / token-backfill / tokens-cli test changes output after the fixture edit, a default moved:
  `timestamp` must default to `FIXED_TIMESTAMP` in both writers and no key order may change. Run those three suites after
  Task 1.
- If test 4's `foreign` count is 0, `repoMatch` was given the foreign repo as a project: only R is in `projects` there.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/token-usage.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
</context>

<gotchas>
- Real meta.json `agentType` values seen in this repo: `devflow:executor`, `devflow:planner`, `devflow:verifier`,
  `devflow:job-checker`, `devflow:objective-researcher`, `devflow:integration-checker`, `devflow:roadmapper`,
  `devflow:debugger`, `general-purpose`, `Explore`, `claude-code-guide`. Only the six in `OVERHEAD_AGENTS` count; the
  debugger is ad hoc work, not objective overhead.
- Real planner descriptions for quick work start with `Quick plan:`; objective ones start with `Plan Objective` /
  `Plan objective` / `Plan gap closure`. Only the `Quick` prefix is excluded.
- A resumed agent (SendMessage) keeps one transcript, so its span includes the idle gap. That is recorded wall time and
  is kept; the SUMMARY notes it as a known overstatement.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builder, agent-type rules, span and per-spawn sample</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs, plugins/devflow/devflow/bin/lib/agent-overhead.cjs, plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs, plugins/devflow/devflow/bin/lib/token-usage.cjs</files>
  <action>
Fixture builder first (generators strategy): add the optional `timestamp` parameter to `assistantRecords` and
`writeSubagentTranscript`, add `writeOverheadTranscript`, and export `PLANNER_SPAWN` and `VERIFIER_SPAWN` exactly as in
the Test list. Run `node --test plugins/devflow/devflow/bin/lib/token-usage.test.cjs
plugins/devflow/devflow/bin/lib/token-backfill.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` and confirm
they still pass.

RED: tests 1, 2 and 3. Commit (fixture + tests) `test(58-02): overhead spawn samples from subagent transcripts`.

GREEN:
1. token-usage.cjs: add `repoMatcher` and `repoMatch` to `module.exports`. No behaviour change.
2. agent-overhead.cjs: `OVERHEAD_AGENTS` (frozen, sorted), `normalizeAgentType(t)` (strip a leading `devflow:` or `df-`,
   keep the name only if it is in the list), `isQuickSpawn(meta)` (`/^\s*quick\b/i` on description).
3. `transcriptSpanMinutes(file)`: `context-audit.forEachRecord`; collect `Date.parse(row.timestamp)` where finite; null
   below two values; else `(max - min) / 60000`. Parsing a timestamp from the data is fine; never call `Date.now()`.
4. `spawnSample(file)`: `sumUsage(file)`; tokens null when `messages` is 0; else totals plus `by_model` mapped to
   `{tokens_input: input + cache_creation + cache_read, tokens_output: output, tokens_cache_read: cache_read,
   tokens_cache_write: cache_creation}`; `minutes` from the span.
Commit `feat(58-02): overhead spawn sample (span, tokens, per-model split)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs plugins/devflow/devflow/bin/lib/token-usage.test.cjs plugins/devflow/devflow/bin/lib/token-backfill.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` passes.</verify>
  <done>Tests 1-3 pass after a recorded RED; the three existing token suites are unchanged and green.</done>
  <recovery>If a token suite breaks after the fixture change, revert the fixture file (`git checkout -- plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs`) and re-add the parameters one at a time, re-running that suite after each.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Index overhead transcripts and collect samples per repository</name>
  <files>plugins/devflow/devflow/bin/lib/agent-overhead.cjs, plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs</files>
  <action>
RED: tests 4 and 5 (build the world in a `before` hook from the table; `t.after` removes the temp dirs). Commit
`test(58-02): overhead spawns matched to their repository`.

GREEN:
1. `indexOverheadTranscripts({root, projects})`: throw `Error('indexOverheadTranscripts: root is required')` without
   root. Walk `<root>/<key>/<session>/subagents/agent-*.meta.json` with sorted names at each level (copy the
   token-usage walk). For a meta whose `normalizeAgentType(agentType)` is non-null: `counts.spawns++`; quick planner
   spawns -> `quick`; no readable first user record -> `unreadable`; else try each project (sorted by root) with
   `repoMatch(prompt, rec.cwd, repoMatcher(project.root))`; first hit -> entry + `matched` + `by_agent[agent]`; none ->
   `foreign`. Entry: `{agent, project: label, session, agent_id, file}`.
2. `collectOverhead({root, projects})`: index, then `spawnSample(entry.file)` per entry merged with
   `{agent, project, session, agent_id}` (no file path in the sample). Sort samples by agent, project, session,
   agent_id. Return `{samples, counts}`.
Commit `feat(58-02): collect overhead samples per repository`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs` passes all 5 tests.</verify>
  <done>Tests 1-5 pass; samples carry no paths; the functions refuse a missing root.</done>
  <recovery>If `x1` (meta without jsonl) throws instead of counting as unreadable, guard `readFirstUserRecord` with the same null check token-usage uses (`if (!rec) { counts.unreadable++; continue; }`).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs plugins/devflow/devflow/bin/lib/token-usage.test.cjs plugins/devflow/devflow/bin/lib/token-backfill.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-03 input: overhead spawns are measured per agent type and per repository, with quick plans excluded.
- No test reads `~/.claude`; `rg -n "homedir" plugins/devflow/devflow/bin/lib/agent-overhead.cjs` prints nothing.
</verification>

<success_criteria>
- agent-overhead.test.cjs passes 5/5; token-usage, token-backfill and tokens-cli suites unchanged.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the sample shape (58-03 aggregates it) and the fixture constants added.
</output>
