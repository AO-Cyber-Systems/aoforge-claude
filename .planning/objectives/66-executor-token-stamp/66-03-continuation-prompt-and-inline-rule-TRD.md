---
objective: 66-executor-token-stamp
trd: "03"
type: standard
wave: 2
depends_on: ["66-01"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs
autonomous: true
requirements: [EST-09]
must_haves:
  truths:
    - "execute-objective `checkpoint_handling` states that every TRD runs in an executor, checkpoint-only TRDs included, and that the orchestrator never executes a TRD's tasks or writes its SUMMARY itself. It gives the reason: `tokens stamp` reads the executor's own transcript, and 65-02/65-03 ran inline and can never be stamped"
    - "The dangling `continuation-prompt.md` reference is gone. `checkpoint_handling` carries an explicit continuation `Task(` spawn with `subagent_type=\"executor\"`, `description=\"Execute TRD {plan_id} (continuation)\"`, `<completed_tasks>`, the embedded TRD, `REPO_ROOT:` / `PLAN_ID:` lines and the `exec-context check … --id {plan_id}` line"
    - "Filled with literal values, both the continuation prompt and the execute_waves item-4 spawn prompt are identified as the TRD by `trd-identify.identifyTrd` (with repoRoot) and by `token-usage.identifyExecutorTrd`. With an initial and a continuation executor transcript of the same TRD, `tokensForTrd` returns the sum of both"
    - "`aggregate_results` shows a `**Token stamp:**` line from `df-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw` (one plain command, omitted if it fails or the runtime is older). The workflow says a missing stamp is reported as it is and never backfilled to raise the number"
  artifacts:
    - path: plugins/devflow/devflow/workflows/execute-objective.md
      provides: "the never-inline rule, the continuation spawn prompt, the aggregate token-stamp line"
    - path: plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs
      provides: "prose + identification + transcript-sum contract tests 1-9"
  key_links:
    - "continuation Task( prompt -> PLAN_ID/REPO_ROOT lines -> trd-identify.identifyTrd -> token-usage index -> tokensForTrd sums initial + continuation -> the continuation executor's `tokens stamp` covers the whole TRD"
    - "continuation prompt -> gate-executor-stop identifies the TRD (66-02 token branch applies to continuations)"
    - "aggregate_results -> `tokens coverage --objective N --raw` (66-01) -> unstamped SUMMARYs visible in every objective report"
---

# TRD 66-03: Every TRD runs in an executor; continuation prompts name their TRD; the report shows stamp coverage

<objective>
Close the two orchestrator-side gaps behind unstamped SUMMARYs:

1. **Inline execution (65-02, 65-03).** The orchestrator ran both checkpoint TRDs itself in the main session, wrote their
   SUMMARYs and committed them as `220769c5`. No executor ever ran, so there is no executor transcript and
   `tokens trd 65-02` returns `no_transcript`. Nothing in `checkpoint_handling` forbids that, and the checkpoint-only
   shape of those TRDs made it tempting.
2. **Dangling continuation template.** `checkpoint_handling` says "Spawn continuation agent (NOT resume) using
   continuation-prompt.md template", but no such template exists. An improvised continuation prompt may not carry
   `PLAN_ID:` / `REPO_ROOT:`. Its transcript is then never attributed to the TRD (the stamp undercounts), and the stop
   gate cannot identify it, so 66-02 would not apply.

Then make misses visible: the objective report gains a `**Token stamp:**` line from 66-01's `tokens coverage`.

Purpose: EST-09 forward-stamp coverage. These changes affect every v1.6 objective after the next release.
Output: execute-objective.md edits and one repo contract test file.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- **This TRD's own SUMMARY is SC-2 evidence.** Run `tokens stamp 66-03 --draft <draft path>` before `summary post`.
  Never run `tokens backfill --write`, and never type token numbers.
- **Workflow prose is the product.** Keep the house voice: plain declaratives, short reasons, exact commands. Every
  df-tools call is one plain command, with no `&&`, pipe or `$(`. The `builtin-sweep`, `estimate-surfacing`,
  `planning-writes`, `pr-lifecycle-prose`, `state-merge-wiring` and `executor-isolation` repo tests read this file and
  must stay green.
- **The continuation prompt contains no double-quote character** between `prompt="` and its closing `"`, as the item-4
  prompt does. The test cuts the prompt at the closing quote.
- **No release here.** The installed 2.14.0 workflow is unchanged until the next release (66-04 records the follow-up).
- Hand-built literal fixtures only. No property-based tests and no Gherkin. Never use port 8080.

## Test list

All in the new `plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs`. It is read-only against the
repo and skipped outside a DevFlow checkout (the `IS_DEVFLOW_CHECKOUT` guard of tokens-cli.test.cjs). Outermost first:

1. **Never-inline rule.** `<step name="checkpoint_handling">` contains `Every TRD runs in an executor` and
   `Never write a TRD's SUMMARY yourself`, and names `tokens stamp` and `transcript` in the same paragraph.
2. **No dangling template.** No file under `plugins/devflow/` (`.md`, recursive) mentions `continuation-prompt.md`,
   and `plugins/devflow/devflow/templates/continuation-prompt.md` does not exist. (If someone later adds the template,
   this test should be updated together with it. Say so in the test comment.)
3. **Continuation spawn shape.** `checkpoint_handling` has a fenced block containing `Task(`,
   `subagent_type="executor"` and `description="Execute TRD {plan_id} (continuation)"`. Its prompt contains
   `<completed_tasks>`, `{completed_tasks_table}`, `{user_response}`, `{resume_task_number}`, `--- BEGIN TRD ---`,
   `{TRD_CONTENT}`, a line `REPO_ROOT:  {REPO_ROOT}`, a line `PLAN_ID:    {plan_id}` and an
   `exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}` line.
4. **The continuation prompt is identified.** Fill the placeholders with literal values: `{plan_id}` → `77-02`,
   `{REPO_ROOT}` → `/fixture/repo`, `{WAVE_BASE}` → `abc1234`, `{CHECKOUT}` → `/fixture/repo`,
   `{objective_number}` → `77`, `{objective_name}` → `x`, `{plan_number}` → `02`, and `{TRD_CONTENT}` →
   a 6-line literal TRD whose frontmatter is `objective: 77-x`, `trd: "02"`. Every other `{…}` stays literal.
   `identifyTrd(filled)` deep-equals `{id: '77-02', repoRoot: '/fixture/repo'}`.
   `identifyExecutorTrd({prompt: filled, description: 'Execute TRD 77-02 (continuation)'}).id === '77-02'`.
5. **Regression pin for item 4.** Filled the same way, the first `prompt="…"` of `<step name="execute_waves">`
   (item 4) is identified identically.
6. **Initial and continuation transcripts are summed.** In a mkdtemp fake projects root, use
   `__fixtures__/transcript-fixtures.cjs` `writeSubagentTranscript` to write two `devflow:executor` transcripts for
   `77-02`. The REPO_ROOT is a mkdtemp repo with `.planning/objectives/77-x/`. One prompt is the filled item-4 prompt
   and one is the filled continuation prompt, and both carry `THREE_MESSAGES`.
   `indexExecutorTranscripts({root, repoRoot})` identifies both. `tokensForTrd(index, {id: '77-02', dir: '77-x'})`
   recovers `transcripts.length === 2` and `tokens_output === 2 * 1370`.
7. **Stamp before post in the continuation prompt.** In the continuation prompt, `tokens stamp {plan_id} --draft`
   precedes `summary post {plan_id} --from`, and the prompt mentions `## Self-Check`.
8. **Aggregate token line.** `<step name="aggregate_results">` contains
   `node ~/.claude/devflow/bin/df-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw` as one plain
   command (no `&&`, `|` or `$(` on that line). `coverage` appears in `require('./tokens-cli.cjs').USAGE`. The step
   carries a fail-soft clause (`/omit the line/i`) and a no-backfill clause (`/never .*backfill/i`).
9. **Matcher sensitivity.** The helper used in test 8 rejects `df-tools.cjs tokens coverge --objective 1 --raw`
   (unknown subcommand) and `df-tools.cjs tokens coverage --objective 1 --raw | head -1` (pipe), and accepts the real
   line.

<embedded_context>

<codebase_examples>
**Today's checkpoint_handling step 6** (execute-objective.md ~line 985). Replace the template reference with an
explicit spawn:
```
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
```

**The item-4 spawn prompt to mirror** (execute_waves, ~line 413). Reuse its `<execution_context>`,
`<plan_content>`, `<repo_and_base>` and `<worktree_protocol>` blocks verbatim in the continuation prompt, so a
continuation runs under the same contract:
```
   Task(
     subagent_type="executor",
     model="{resolved_executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of objective {objective_number}-{objective_name}.
       …
       </objective>
       …
       <repo_and_base>
       REPO_ROOT:  {REPO_ROOT}
       WAVE_BASE:  {WAVE_BASE}
       PLAN_ID:    {plan_id}
       CHECKOUT:   {CHECKOUT}
         node ~/.claude/devflow/bin/df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}
       …
     "
   )
```
`exec-context check` accepts the continuation's claim: "overwrite — the claim is already ours" (exec-context.cjs
~line 182). The same `--id` on the same checkout passes.

**The continuation prompt to add.** Shape it like this, adapting the wording to the house voice:
```
   Task(
     subagent_type="executor",
     model="{resolved_executor_model}",
     description="Execute TRD {plan_id} (continuation)",
     prompt="
       <objective>
       Execute TRD {plan_id} of objective {objective_number}-{objective_name}: continuation after a checkpoint.
       Resume at Task {resume_task_number} ({resume_task_name}). Do not redo committed tasks.
       </objective>

       <checkpoint_reply>
       {user_response}
       </checkpoint_reply>

       <completed_tasks>
       {completed_tasks_table}
       </completed_tasks>

       <resume_instructions>
       {resume_instructions}
       </resume_instructions>

       <execution_context> … same five @ lines as item 4 … </execution_context>
       <plan_content> … --- BEGIN TRD --- {TRD_CONTENT} --- END TRD --- … </plan_content>
       <repo_and_base> … same as item 4, including PLAN_ID and the exec-context check line … </repo_and_base>
       <worktree_protocol> … same as item 4 … </worktree_protocol>

       <success_criteria>
       - [ ] Remaining tasks executed, each committed
       - [ ] SUMMARY finished with ## Self-Check; token usage stamped with `node ~/.claude/devflow/bin/df-tools.cjs tokens stamp {plan_id} --draft <draft path>`, then published once with `node ~/.claude/devflow/bin/df-tools.cjs summary post {plan_id} --from <draft path>`
       - [ ] If another checkpoint is reached: return ## CHECKPOINT REACHED with ALL completed tasks (previous + new)
       </success_criteria>
     "
   )
```
`agents/executor.md` `<continuation_handling>` keys on `<completed_tasks>` in the prompt ("If spawned as continuation
agent (`<completed_tasks>` in prompt)"), so that tag must be present.

**The never-inline rule.** Put it at the top of `checkpoint_handling`, right after "Plans with `autonomous: false`
require user interaction.":
> **Every TRD runs in an executor, checkpoints included.** Never execute a TRD's tasks yourself, even when it is made
> only of `checkpoint:human-action` gates and the executor's first act is to return the first checkpoint. Spawn the
> executor (execute_waves item 4), present each `## CHECKPOINT REACHED`, and spawn a continuation executor (step 6
> below) with the user's literal reply. Never write a TRD's SUMMARY yourself. The executor's `tokens stamp` reads the
> executor's own transcript: a TRD run inline has no transcript, so its SUMMARY can never be stamped (65-02 and 65-03,
> EST-09).

**Aggregate line pattern to copy** (aggregate_results today):
```
**Time:** {output of `node ~/.claude/devflow/bin/df-tools.cjs estimate finish ${OBJECTIVE_NUMBER} --raw`; omit the line if it fails}
```
Add directly below it:
```
**Token stamp:** {output of `node ~/.claude/devflow/bin/df-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw`; omit the line if it fails or the runtime has no `tokens coverage`}
```
After the template block, add one sentence: a `missing` entry is reported as it is, and the orchestrator never runs
`tokens backfill --write` to raise the number, because EST-09 counts only stamps written when the SUMMARY is published.

**Repo prose test helpers to copy** (estimate-surfacing.repo.test.cjs / tokens-cli.test.cjs):
```js
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
function blockOf(text, openRe, closeTag) { … }          // tokens-cli.test.cjs ~line 377
const aggregate = between(src, rel, '<step name="aggregate_results">', '</step>');   // estimate-surfacing
```
</codebase_examples>

<anti_patterns>
- Do NOT create `templates/continuation-prompt.md` instead. A template the orchestrator must remember to read is what
  failed. An inline spawn block in the step is read every time the step runs.
- Do NOT weaken the rule to "prefer an executor". It must be an unconditional "never execute a TRD yourself".
  Checkpoint-only TRDs are exactly the case that slipped.
- Do NOT add a backfill step to the orchestrator. Coverage is reported, not repaired.
- Do NOT put double quotes inside the continuation prompt (use backticks), and do NOT pipe the coverage command.
</anti_patterns>

<error_recovery>
- If `builtin-sweep.repo.test.cjs` / `builtin-audit.test.cjs` flags the continuation block (for example a free-text
  prompt rule), read the failing message. The existing "Get the response" item already carries the allowed free-text
  marker, so keep the new prose descriptive, not a user prompt.
- If `estimate-surfacing.repo.test.cjs` test 5 flags the new line (it scans `df-tools.cjs estimate` calls only), you
  matched the wrong pattern. The token line must not contain `estimate`.
- If identification in test 4 returns null (ambiguous), the filled TRD_CONTENT probably names a different id
  (`…-TRD.md` path or frontmatter). Keep the literal TRD minimal, with id 77-02 only. PLAN_ID is tier 1 and wins
  anyway.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/66-executor-token-stamp/OBJECTIVE.md
@.planning/objectives/66-executor-token-stamp/66-01-SUMMARY.md

Read execute-objective.md narrowly: lines 385-480 (item 4), 863-998 (checkpoint_handling) and 1000-1036
(aggregate_results). Read `lib/trd-identify.cjs` lines 1-90 and `lib/token-usage.cjs` lines 136-200 and 287-386 for
the identification and sum contracts.
</context>

<gotchas>
- 66-01 changed `tokens-cli.cjs` USAGE to include `coverage`. Test 8 reads it, which is why this TRD is wave 2. If 66-01's
  SUMMARY reports a different subcommand name or flag, follow the SUMMARY and note it.
- `identifyExecutorTrd` tier 1 is `trd-identify.identifyTrd`. A `PLAN_ID:` line must be line-anchored
  (`^[ \t]*PLAN_ID:`), and the indentation inside the fenced prompt is fine.
- `transcript-fixtures.writeSubagentTranscript` sets the first record's `cwd`. Pass the mkdtemp repo so the repo match
  is `repo_root` via the REPO_ROOT line. The REPO_ROOT in the filled prompt must be that same mkdtemp path, not
  `/fixture/repo`, in test 6.
- The repo tests run in CI with the repo checked out, so `IS_DEVFLOW_CHECKOUT` is true there. Do not skip them in CI.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Never-inline rule and the explicit continuation spawn (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: create `executor-token-stamp.repo.test.cjs`. Its header comment carries the purpose (EST-09, the 65-02/65-03 and
dangling-template evidence) and the Test list. Write tests 1-7 one at a time. Use a small `fill(prompt, values)`
helper that replaces only the listed `{placeholders}`. Run the file and see 1-4 and 7 fail. Test 5 already passes
(a regression pin), and test 6 fails until the continuation prompt exists. Commit as `test(66-03): …`.

GREEN: edit `execute-objective.md` `checkpoint_handling`:
1. Insert the never-inline paragraph from codebase_examples after the first sentence of the step.
2. Replace step 6's "using continuation-prompt.md template" list with: one sentence ("Spawn a fresh executor with the
   prompt below; fill it from the checkpoint return and the user's reply"), the fenced `Task(` block from
   codebase_examples (reusing item 4's blocks verbatim), and the field mapping as a short list under the block.
3. Leave Branch 1/2/3 wording ("spawn continuation agent") as is. They all now point at step 6's spawn. Add
   "(step 6's prompt)" where Branch 1 and Branch 2 first say "spawn continuation agent", so a reader finds the block.
Commit as `feat(66-03): …`.

# CRITICAL: no double quotes inside the continuation prompt body.
# PATTERN: the item-4 prompt's blocks are copied verbatim, not paraphrased, so a continuation runs under the same isolation and publish contract.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs` passes tests 1-7. `rg -n "continuation-prompt\\.md" plugins/devflow` finds nothing.</verify>
  <done>The rule is stated and pinned, and the continuation spawn is explicit and identifiable. Initial + continuation transcripts sum under one TRD. `git log` shows `test(66-03)` before `feat(66-03)`.</done>
  <recovery>If an existing repo test fails after the edit, run it alone. Read its assertion and adapt the new prose to it, never the other way around, unless the assertion pins the removed `continuation-prompt.md` sentence (none is known to). If one does, update that pin and record it as a deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Token-stamp line in aggregate_results (tests 8-9), then the full suite</name>
  <files>plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: add tests 8-9 with a `plainCall(line, sub)` matcher. It finds the line containing
`df-tools.cjs tokens <sub> `, checks that `<sub>` is in `tokens-cli.cjs` `USAGE`, and rejects `&&`, `|` and `$(` on
that line. Commit as `test(66-03): …`.

GREEN: add the `**Token stamp:**` line under `**Time:**` in the aggregate_results template, and the no-backfill
sentence after the template block, both from codebase_examples. Commit as `feat(66-03): …`.

Smoke: run the repository copy, which is what the line will run after release:
`node plugins/devflow/devflow/bin/df-tools.cjs tokens coverage --objective 66 --raw`. Paste its output verbatim
into the SUMMARY. 66-01 and 66-02 should read `live` if their executors stamped. Anything else is a finding to
report, not to fix here.

Then run the full suite.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs` passes. `npm test` passes, or the documented micro exclusion is used and noted.</verify>
  <done>The objective report shows stamp coverage after each objective. The no-backfill policy is written down. All 9 tests pass, the full suite is green, and the objective-66 smoke output is recorded. The 66-03 SUMMARY is live-stamped via `tokens stamp 66-03`.</done>
  <recovery>If `tokens coverage --objective 66` errors in the smoke run, include the error verbatim in the SUMMARY and check 66-01's SUMMARY for the flag name. Do not edit `tokens-cli.cjs` from this TRD (66-01 owns it). Report it instead.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/executor-token-stamp.repo.test.cjs`: 9 tests pass, and none are skipped in this checkout.
- `rg -n "Every TRD runs in an executor" plugins/devflow/devflow/workflows/execute-objective.md` finds the rule inside checkpoint_handling.
- `rg -n "continuation-prompt\\.md" plugins/devflow` finds nothing.
- The 66-03 SUMMARY frontmatter has `tokens_input`, `tokens_output` and `tokens_source: "live"`.
</verification>

<success_criteria>
- The orchestrator has an unconditional rule against inline TRD execution, with its reason, so the 65-02/65-03 failure has a written stop.
- Continuation executors are attributed to their TRD: their tokens are summed and the 66-02 gate covers them.
- Every objective report shows forward-stamp coverage, so a miss is seen the day it happens, not at milestone audit.
</success_criteria>

<output>
After completion, publish `.planning/objectives/66-executor-token-stamp/66-03-SUMMARY.md` through `planning draft` →
`tokens stamp 66-03 --draft <path>` → `summary post 66-03 --from <path>`. Include the verbatim smoke output.
</output>
