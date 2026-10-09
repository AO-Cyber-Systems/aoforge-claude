---
objective: 66-executor-token-stamp
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js
  - plugins/devflow/hooks/gate-executor-stop.js
  - plugins/devflow/hooks/gate-executor-stop.test.js
  - plugins/devflow/agents/executor.md
autonomous: true
requirements: [EST-09]
must_haves:
  truths:
    - "A `devflow:executor` that stops naturally while its TRD's FINAL SUMMARY (one with a `## Self-Check` heading) has no `tokens_input`/`tokens_output` frontmatter is blocked once, with a reason that names the exact `planning draft`, `tokens stamp <id> --draft` and `summary post <id> --from` commands and the SUMMARY path"
    - "No block when any final SUMMARY of the TRD carries both token fields (live or backfill), when the SUMMARY is a `## Progress` checkpoint (no `## Self-Check`), on `stop_hook_active`, on a deliberate structured stop, with `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1`, or on any read error (fail open). The 44-04 'no SUMMARY anywhere' block is unchanged"
    - "Commented template lines (`# tokens_input: N`) do not count as token fields, so a SUMMARY carrying only those is blocked"
    - "The block reason tells the agent that if `tokens stamp` reports `stamped: false`, it should stop, because the gate does not ask twice. It also says never to type token numbers by hand"
    - "agents/executor.md `<self_check>` still runs `tokens stamp {objective}-{trd} --draft` before `summary post` (tokens-cli test 11 stays green) and now says the SubagentStop gate sends the executor back once if the stamp was skipped"
  artifacts:
    - path: plugins/devflow/hooks/gate-executor-stop.js
      provides: "summaryFiles(id, roots), hasTokenFields(text), isFinalSummary(text), tokenBlockReason(id, summaryRel, draftRel), and the token branch in decide()"
    - path: plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js
      provides: "summaryText kinds (checkpoint, final_stamped, final_backfill, final_unstamped, final_template_comments) and makePlanningRepo summaryKinds"
    - path: plugins/devflow/hooks/gate-executor-stop.test.js
      provides: "the 66-02 describe blocks (unit + e2e + executor.md prose)"
  key_links:
    - "SubagentStop payload -> decide(): identifyTrd(first prompt) -> candidateRoots -> summaryFiles -> isFinalSummary + hasTokenFields -> tokenBlockReason"
    - "tokenBlockReason -> executor runs df-tools planning draft / tokens stamp / summary post (executor.md self_check)"
    - "64-09/64-10 root cause (stamp step skipped, transcripts exist) -> this gate"
---

# TRD 66-02: The executor stop gate sends an unstamped final SUMMARY back once (EST-09)

<objective>
Make the token stamp structural for executors. Today it is one prose step in `<self_check>`, and executors skip it:
64-09 and 64-10 ran `summary post` with no `tokens stamp` even though their transcripts exist (`tokens trd 64-09`
recovers the totals today). The SubagentStop gate already gives an executor one more turn when its TRD has no
SUMMARY. This TRD extends it: when the final SUMMARY exists but carries no token fields, the gate blocks once with
the exact commands to stamp and re-post.

Purpose: forward-stamp coverage of at least 95% (EST-09) cannot survive a 20% skip rate (2 of objective 64's 10 TRDs).
A one-time block at the moment of the miss is cheap. The once-guard (`stop_hook_active`) bounds the cost to a single
turn, even where no transcript can be found.

Output: the token branch in `hooks/gate-executor-stop.js`, fixtures, tests, and one sentence in
`agents/executor.md` `<self_check>`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- **This TRD's own SUMMARY is SC-2 evidence.** Run `tokens stamp 66-02 --draft <draft path>` before `summary post`.
  Never run `tokens backfill --write`, and never type token numbers.
- **The hook stays light and fails open.** It reads files with `fs` and requires only `trd-identify.cjs` and
  `text-escape.cjs`, exactly as today. Never require `token-usage.cjs`, `frontmatter.cjs` or any df-tools module that
  scans transcripts: SubagentStop runs on every executor stop. Every error path returns null with no output.
- **No transcript reads in the hook.** The hook checks only whether the SUMMARY carries the fields. Whether a
  transcript exists is `tokens stamp`'s job.
- **The installed runtime is not changed here.** This hook reaches users with the next plugin release (a follow-up
  recorded in 66-04). Tests exercise the repository copy.
- **One plain command per Bash call.** Hand-built fixtures only (`no_llm_test_data`), no property-based tests and no
  Gherkin. Never use port 8080.

## Test list

Outermost first. New `describe('66-02 …')` blocks are appended to `gate-executor-stop.test.js`. Existing tests stay
unchanged and green: their fixture SUMMARYs are `## Progress` checkpoints, which this branch never blocks.

End to end (spawned hook, `runHook(payload, {cwd})` as in the existing e2e describe):
1. **Final SUMMARY with no token fields gives one top-level block.** `{decision: 'block', reason}` with exactly those
   two keys. The reason matches `/77-02/`, `/tokens_input/`, `/tokens stamp 77-02 --draft/`,
   `/summary post 77-02 --from/`, `/planning draft objectives\/77-x\/77-02-SUMMARY\.md/`, `/stamped: false/`,
   `/never type token numbers by hand/i` and `/8080/`.
2. **Final SUMMARY with live token fields gives no output** (exit 0, empty stdout).
3. **Same unstamped final SUMMARY with `stop_hook_active: true` gives no output** (the once-guard).

Unit (`decide`, in-process, `deps = {env: {}, gitWorktrees: () => []}`):
4. Final + backfill-stamped (`tokens_source: "backfill"`) gives null. The gate checks presence, not source.
5. `## Progress` checkpoint with no token fields gives null (44-04 semantics kept).
6. Final SUMMARY with only `# tokens_input: N` / `# tokens_output: N` comment lines gives a block.
7. Final SUMMARY with `tokens_input` only gives a block (both fields required).
8. A slugged name (`77-02-fixture-SUMMARY.md`) is found and checked. Unstamped gives a block naming that file in the
   `planning draft` path.
9. Two roots: an unstamped final SUMMARY in the main checkout and a stamped one in an injected linked worktree give
   null (any stamped final passes). An unstamped final in the worktree and none in main give a block.
10. Deliberate stop (`last_assistant_message` contains `## CHECKPOINT REACHED`) with an unstamped final gives null.
11. `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1` with an unstamped final gives null.
12. An unreadable SUMMARY gives null and does not throw. Inject an `fsImpl` whose `readFileSync` throws for the
    SUMMARY path and delegates otherwise.
13. A continuation-shaped first prompt identifies the TRD and makes the gate apply. That prompt is
    `executorPrompt({planId: '77-02', extra: '<completed_tasks>…</completed_tasks>'})` with the objective line
    `Execute TRD 77-02 (continuation after a checkpoint)`.
14. Helpers: `hasTokenFields(text)` is true only when the frontmatter block (first `---`…`---`) has both
    `^tokens_input:[ \t]*\d+[ \t]*$` and `^tokens_output:[ \t]*\d+[ \t]*$` lines. `isFinalSummary(text)` is true iff a
    line matches `^## Self-Check\b`. `summaryFiles(id, roots)` returns absolute paths of `<id>-SUMMARY.md` and
    `<id>-<slug>-SUMMARY.md` across roots, de-duplicated, with whole-id matching (`77-020-SUMMARY.md` never counts for
    77-02).

Prose (repo checkout only, skip otherwise, as other repo-prose tests do):
15. `agents/executor.md` `<self_check>` still has `df-tools.cjs tokens stamp {objective}-{trd} --draft` before
    `summary post {objective}-{trd} --from`, and mentions the SubagentStop gate sending the executor back once
    (`/SubagentStop/` and `/once/` inside the block).

<embedded_context>

<codebase_examples>
**Where the new branch goes** (`hooks/gate-executor-stop.js` `decide`, today):
```js
  const roots = candidateRoots({ cwd: start, repoRoot: trd.repoRoot, gitWorktrees: listWorktrees, fsImpl });
  if (summaryExists(trd.id, roots, fsImpl)) return null;          // <- today: any SUMMARY passes
  return { block: true, reason: blockReason(trd.id, summaryRelPath(trd.id, roots, fsImpl)) };
```
Change it to:
```js
  const files = summaryFiles(trd.id, roots, fsImpl);
  if (files.length === 0) {
    return { block: true, reason: blockReason(trd.id, summaryRelPath(trd.id, roots, fsImpl)) };   // unchanged path
  }
  const finals = [];
  for (const f of files) {
    let text;
    try { text = String(fsImpl.readFileSync(f, 'utf8')); } catch { return null; }   // fail open
    if (isFinalSummary(text)) finals.push({ file: f, stamped: hasTokenFields(text) });
  }
  if (finals.length === 0) return null;                 // checkpoint only: 44-04 semantics
  if (finals.some((x) => x.stamped)) return null;       // any stamped final passes
  const target = finals[0].file;                        // roots order: cwd's checkout first
  return { block: true, reason: tokenBlockReason(trd.id, relFromObjectives(target)) };
```
Keep `summaryExists` exported and behaving as before: other tests import it. It can delegate to
`summaryFiles(...).length > 0`.

**The pairing rule to reuse** (already in `summaryExists`):
```js
const paired = new RegExp(`^${escapeRegExp(id)}(?:-.+)?-SUMMARY\\.md$`);
```

**Block reason style** (`blockReason`): one string of `.join(' ')` sentences, with the exact commands, ending with
`'Never use port 8080.'`. The token reason should read:
```
DevFlow: TRD {id}'s SUMMARY ({.planning/objectives/<dir>/<file>}) is final but has no tokens_input/tokens_output.
Stamp it now, one command per Bash call, passing --cwd <checkout> as for every df-tools call:
node ~/.claude/devflow/bin/df-tools.cjs planning draft objectives/<dir>/<file>
node ~/.claude/devflow/bin/df-tools.cjs tokens stamp {id} --draft <draft path>
node ~/.claude/devflow/bin/df-tools.cjs summary post {id} --from <draft path>
then commit the SUMMARY with df-tools commit (local mode). If tokens stamp reports stamped: false, stop: this gate
does not ask twice. Never type token numbers by hand. Never use port 8080.
```

**Fixtures** (`hooks/__fixtures__/subagent-stop-fixtures.js`): `makePlanningRepo(root, {objectiveDir, trdIds, summaries})`
writes `## Progress`-only SUMMARYs. Add a `summaryKinds` option (`{ '77-02': 'final_unstamped' }`) and an exported
`summaryText(kind, id)` producing literal texts for `checkpoint`, `final_stamped`, `final_backfill`,
`final_unstamped`, `final_template_comments` and `final_input_only`. Stamped kinds use the exact serialisation of
`token-usage.tokenFrontmatterFields`:
```
tokens_input: 140747
tokens_output: 1370
tokens_cache_read: 121144
tokens_cache_write: 19596
token_model: "claude-opus-5-5"
tokens_source: "live"
```
Keep the existing default (`summaries` gives a checkpoint) byte-identical, because current tests depend on it.

**executor.md `<self_check>` step 3 today** (keep the commands and their order). Add one sentence after the
"`tokens stamp` reads your own executor transcript…" paragraph:
> If you skip the stamp, the SubagentStop gate sends you back once to run it on a draft of the posted SUMMARY; a
> `stamped: false` result ends that.
</codebase_examples>

<anti_patterns>
- Do NOT block on a `## Progress` checkpoint. A cut-short executor's checkpoint SUMMARY is meant to have no tokens,
  and the INCOMPLETE resume path handles it.
- Do NOT parse YAML with a library in the hook. A line regex over the first frontmatter block is enough and keeps the
  hook dependency-free.
- Do NOT read transcripts or spawn df-tools from the hook. That would turn a SubagentStop into a scan of
  `~/.claude/projects`.
- Do NOT block twice. `stop_hook_active` is the only once-guard, so do not add marker files (44-04 decision).
- Do NOT change the existing reason text of the no-SUMMARY block. Tests 44-04/44-10 pin it.
</anti_patterns>

<error_recovery>
- Store mode: the SUMMARY lives in the MAIN checkout's gitignored cache. `candidateRoots` already includes the main
  root, so no special case is needed. If a test shows otherwise, add the main root explicitly and say so in the
  SUMMARY.
- If `planning draft` needs the path relative to `.planning/`, derive `objectives/<dirname>/<basename>` from the
  absolute file path's last two segments rather than recomputing roots.
- If an existing test starts failing because its fixture SUMMARY now reads as final, the fixture changed. Revert it:
  the default must stay a checkpoint.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/66-executor-token-stamp/OBJECTIVE.md
@plugins/devflow/hooks/gate-executor-stop.js

Read `gate-executor-stop.test.js` only around `makeExecutorScenario`, `runHook`, `assertSilent` and the `decide`
describe, which are about lines 380-470 and 640-700. Read executor.md lines 1050-1080 only.
</context>

<gotchas>
- `gate-executor-stop.js` exports are imported by other tests (`identifyTrd`, `summaryExists`, `candidateRoots`,
  `isDeliberateStop`). Add exports and never remove one.
- The hook is registered in `hooks.json` already (SubagentStop). Do NOT edit hooks.json.
- `tokens-cli.test.cjs` test 11 (owned by 66-01's file, read-only for you) asserts the order of the stamp and post
  commands inside `<self_check>`. Add your sentence after both commands, and run test 11 to confirm:
  `node --test --test-name-pattern "11\\. executor.md" plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs`.
- Decimal objective ids (`12.1-03`): the pairing regex escapes the dot. Keep `escapeRegExp`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture kinds for final, stamped and unstamped SUMMARYs</name>
  <files>plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js</files>
  <action>
Add `summaryText(kind, id)` and a `summaryKinds` option to `makePlanningRepo`, as described in codebase_examples.
Each kind is literal text. `final_*` kinds have a frontmatter block (`objective: 77-x`, `trd: "02"`), a short body
and `## Self-Check: PASSED` at the end. `checkpoint` is exactly today's `## Progress` text, so the default path stays
byte-identical. Export `summaryText`. Update the file header to mention TRD 66-02 and the kinds. Hand-built only.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-executor-stop.test.js` is still fully green, since nothing uses the new kinds yet. `node -e "const F=require('./plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js'); console.log(['checkpoint','final_stamped','final_backfill','final_unstamped','final_template_comments','final_input_only'].map(k=>F.summaryText(k,'77-02').includes('## Self-Check')).join(','))"` prints `false,true,true,true,true,true`.</verify>
  <done>Six literal kinds exist and the default checkpoint is unchanged. Commit: `test(66-02): SUMMARY kinds for the token stop gate`.</done>
  <recovery>If `makePlanningRepo` default output changes by even one byte, `git diff` the fixture and restore the default branch.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Token branch in decide() (tests 1-14)</name>
  <files>plugins/devflow/hooks/gate-executor-stop.js, plugins/devflow/hooks/gate-executor-stop.test.js</files>
  <action>
RED: append the 66-02 describes with tests 1-14 (one at a time, each failing for the right reason). Commit them as
`test(66-02): …`. GREEN: implement `summaryFiles`, `hasTokenFields`, `isFinalSummary`, `tokenBlockReason` and the
`decide` change from codebase_examples. Export the four new helpers. Then commit `feat(66-02): …`.

Header comment updates in `gate-executor-stop.js`:
- Purpose: a second, once-only reason to block, "final SUMMARY without token fields (TRD 66-02, EST-09)", with the
  64-09/64-10 evidence in one line.
- Fail-open contract: extend the list (an unreadable SUMMARY, a checkpoint-only SUMMARY, any stamped final).
- The decision order in the `decide` JSDoc: `… → SUMMARY missing → block (44-04) → no final → null → any stamped
  final → null → block (66-02)`.

`hasTokenFields(text)`:
```
m = /^---\n([\s\S]*?)\n---/.exec(text); if (!m) return false
return /^tokens_input:[ \t]*\d+[ \t]*$/m.test(m[1]) && /^tokens_output:[ \t]*\d+[ \t]*$/m.test(m[1])
```
# CRITICAL: anchored at line start without `#`, so the template's commented lines never count.
# PATTERN: same `.join(' ')` reason style as blockReason; mention port 8080 last.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-executor-stop.test.js` passes, including all 14 new tests and every pre-existing test unchanged. `git log --oneline -4` shows `test(66-02)` before `feat(66-02)`.</verify>
  <done>An unstamped final SUMMARY blocks once with the three exact commands. Stamped, backfilled, checkpoint, guarded, deliberate, escaped and unreadable cases are all silent. The 44-04/44-10 block text is unchanged.</done>
  <recovery>If test 9 (two roots) is flaky because of root ordering, make the "any stamped final passes" check independent of order (it is a `some`). Only the reported `target` file depends on order, so pick the first final in `roots` order and assert on that.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: executor.md sentence and prose test 15, then the full suite</name>
  <files>plugins/devflow/agents/executor.md, plugins/devflow/hooks/gate-executor-stop.test.js</files>
  <action>
RED: add test 15 (prose, skipped outside a DevFlow checkout: guard on the repo README like tokens-cli.test.cjs
`IS_DEVFLOW_CHECKOUT`). It extracts `<self_check>`…`</self_check>` from `plugins/devflow/agents/executor.md`. It
asserts the stamp command precedes the post command, and that the block mentions `SubagentStop` and `once`. It fails
until the sentence exists.

GREEN: add the one sentence from codebase_examples to `<self_check>` step 3, after the existing "`tokens stamp` reads
your own executor transcript…" paragraph. Change nothing else in executor.md.

Then run the full suite. These existing tests read executor.md and must stay green:
`node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes. `npm test` passes, or the documented micro exclusion is used and noted in the SUMMARY.</verify>
  <done>executor.md tells the executor about the gate. Test 15 pins it, test 11 still passes, and the full suite is green. The 66-02 SUMMARY is live-stamped via `tokens stamp 66-02`.</done>
  <recovery>If `planning-writes.repo.test.cjs` flags the new sentence as a direct planning-write instruction, reword it so the only write named is `summary post` (for example "re-post it with `summary post`"), then rerun.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/hooks/gate-executor-stop.test.js</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/gate-executor-stop.test.js`: every test passes, and the count rises by 15.
- `rg -n "require\\(" plugins/devflow/hooks/gate-executor-stop.js` shows only fs, path, child_process, text-escape.cjs and trd-identify.cjs.
- `rg -n "SubagentStop" plugins/devflow/agents/executor.md` finds the new sentence inside `<self_check>`.
- The 66-02 SUMMARY frontmatter has `tokens_input`, `tokens_output` and `tokens_source: "live"`.
</verification>

<success_criteria>
- The 64-09/64-10 failure (stamp step skipped, transcript present) is caught at the executor's own stop and repaired in the same run.
- The cost is bounded to one extra turn per TRD, and the gate never blocks twice or blocks a checkpoint.
- The hook stays light and fail-open, and its existing behavior is unchanged.
</success_criteria>

<output>
After completion, publish `.planning/objectives/66-executor-token-stamp/66-02-SUMMARY.md` through `planning draft` →
`tokens stamp 66-02 --draft <path>` → `summary post 66-02 --from <path>`.
</output>
