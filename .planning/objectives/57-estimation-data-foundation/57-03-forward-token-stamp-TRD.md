---
objective: 57-estimation-data-foundation
trd: "03"
type: standard
wave: 2
depends_on: ["57-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
  - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/workflows/execute-trd.md
  - plugins/devflow/devflow/templates/summary.md
autonomous: true
requirements: [EST-06]
must_haves:
  truths:
    - "`df-tools tokens stamp <trd-id> --draft <path>` writes tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model and tokens_source: \"live\" into the draft's frontmatter from the executor's own transcript"
    - "A SUMMARY published with `summary post` from a stamped draft carries tokens_input and tokens_output in its frontmatter (end-to-end, local mode)"
    - "When no transcript matches, stamp exits 0 with stamped:false and leaves the draft byte-identical, so SUMMARY publication is never blocked"
    - "stamp refuses a --draft path inside .planning/ (exit 1) and points at summary post, so it never writes the planning cache directly"
    - "The executor agent and the execute-trd workflow run `tokens stamp` on the draft immediately before `summary post`, and tell the executor never to type token numbers by hand"
    - "The SUMMARY template documents the token fields"
    - "executor.md's record-metric example passes --job (the flag the dispatcher reads), not --trd"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/tokens-cli.cjs
      provides: "runTokens({argv, cwd}) for `tokens trd` and `tokens stamp`; pure, returns {ok, result, text, exit}"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "case 'tokens' dispatch + header doc"
    - path: plugins/devflow/devflow/bin/lib/help.cjs
      provides: "COMMANDS.tokens"
    - path: plugins/devflow/agents/executor.md
      provides: "tokens stamp step before summary post"
  key_links:
    - "executor.md <self_check> / execute-trd.md create_summary_with_evidence -> df-tools tokens stamp -> tokens-cli.runTokens -> token-usage.tokensForTrd + stampTokenFields"
    - "tokens stamp (draft) -> summary post (planning verb) -> SUMMARY frontmatter tokens_input/tokens_output (EST-06)"
---

# TRD 57-03: Forward token instrumentation, `df-tools tokens stamp` (EST-06)

<objective>
Make every new executor SUMMARY carry its token usage:

1. **`df-tools tokens trd <trd-id>`** (read-only): the TRD's executor token totals from Claude Code transcripts (57-01).
2. **`df-tools tokens stamp <trd-id> --draft <path>`**: write those totals into the SUMMARY *draft*'s frontmatter. The
   executor runs it right before `summary post`, so the store-aware verb publishes the fields. Writing the draft keeps
   the D-01 invariant: every planning write still goes through `summary post`.
3. **Prose.** executor.md and execute-trd.md gain the stamp step, and templates/summary.md documents the fields. Also fix
   executor.md's `state record-metric` example, which passes `--trd` while the dispatcher reads `--job`. STATE_ARCHIVE
   metrics are a calibration input (EST-01), so the documented call must work.

The stamp counts the executor's transcript up to the stamp call; the last few turns (state updates, final commit) are not
included. `tokens_source: "live"` marks that, and a later backfill (57-04) never overwrites it.

Purpose: EST-06, executor SUMMARY frontmatter records `tokens_input` / `tokens_output`.
Output: tokens-cli.cjs (+ test), the `tokens` dispatch and help entry, and the prose updates.
</objective>

<file_tree>
plugins/devflow/
├── agents/executor.md                              ← MODIFY
└── devflow/
    ├── bin/df-tools.cjs                            ← MODIFY (case 'tokens', header doc)
    ├── bin/lib/help.cjs                            ← MODIFY (COMMANDS.tokens)
    ├── bin/lib/tokens-cli.cjs                      ← CREATE
    ├── bin/lib/tokens-cli.test.cjs                 ← CREATE
    ├── workflows/execute-trd.md                    ← MODIFY
    └── templates/summary.md                        ← MODIFY
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(57-03): ...` RED commit, then `feat(57-03): ...` / `docs(57-03): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash call.
- Fixtures: `transcript-fixtures.cjs` (57-01) for transcripts. Write literal SUMMARY/TRD text for the fixture repo. No
  generated data. Tests never touch the real `~/.claude`: spawned df-tools runs get `HOME=<fake home>`, and in-process
  calls pass `root` explicitly.
- Same wave: 57-04 owns token-backfill.cjs and 57-05 owns calibrator.cjs. Do not touch them. This TRD is the only wave-2
  editor of df-tools.cjs and help.cjs. 57-06 adds `tokens backfill` and `calibrate` after you.
- Use token-usage.cjs (57-01) as it is. If an export is missing or wrong, record a deviation; do not re-implement it here.

## Test list

Outermost first. tokens-cli.test.cjs.

End to end (spawn `plugins/devflow/devflow/bin/df-tools.cjs` with `HOME` set to a fake home):
1. Fixture repo `<tmp>/repo` (realpath) with `.planning/objectives/99-demo/99-01-demo-TRD.md` and the transcript
   `THREE_MESSAGES` for `99-01` (prompt style `plan_id`, REPO_ROOT = repo) under `<home>/.claude/projects/<key>/s1/subagents/`.
   A draft `<tmp>/drafts/objectives/99-demo/99-01-SUMMARY.md` with literal frontmatter (`objective`, `job`, `duration:
   7min`, `completed: 2026-10-05`) and a body. `df-tools --cwd <repo> tokens stamp 99-01 --draft <draft>` exits 0. Its
   JSON has `stamped:true` and `transcripts` length 1. The draft frontmatter now has `tokens_input: 140747`,
   `tokens_output: 1370`, `tokens_cache_read: 121144`, `tokens_cache_write: 19596`, `token_model: "claude-opus-5-5"`,
   `tokens_source: "live"`, and the body is byte-identical. RED (unknown command).
2. Then `df-tools --cwd <repo> summary post 99-01 --from <draft>` exits 0, and
   `.planning/objectives/99-demo/99-01-SUMMARY.md` contains `tokens_input: 140747` and `tokens_output: 1370`. RED.
3. No transcript for `99-02`: `tokens stamp 99-02 --draft <draft2>` exits 0 with `stamped:false, reason:'no_transcript'`,
   and draft2's bytes are unchanged.
4. `--draft <repo>/.planning/objectives/99-demo/99-01-SUMMARY.md` exits 1. stderr names `--draft` and `summary post`,
   and the file is unchanged.
5. The repo has `10-alpha` and `10-beta`, and a `10-01` transcript names `objectives/10-beta/`. Stamping a draft whose
   path contains `/objectives/10-beta/` succeeds. A draft path with no objective segment gives
   `stamped:false, reason:'ambiguous_objective'`.
6. `tokens trd 99-01 --raw` prints exactly `tokens_input=140747 tokens_output=1370 transcripts=1`. Without `--raw`, the
   JSON has `found:true`, `fields` and `transcripts`.
7. Re-stamping after appending a fourth message (output 100, cache_read 50000) updates the draft (drafts are overwritten).
   `tokens_output` becomes 1470.
8. Usage errors exit 1 with a usage line: `tokens`, `tokens bogus`, `tokens stamp 99-01` (no `--draft`),
   `tokens trd` (no id), and `tokens trd 99-01 --nope`.
9. `df-tools tokens --help` exits 0 and prints the usage line (help.test.cjs and dispatch-completeness.test.cjs pass).

In-process (`runTokens({argv, cwd, root})`): 10. The default transcript root is `os.homedir()/.claude/projects`, read at
call time (temporarily set `process.env.HOME`, restore in `finally`).

Prose contract (`describe(..., {skip: !IS_DEVFLOW_CHECKOUT})`, read-only):
11. agents/executor.md: inside `<self_check>`, a line containing `df-tools.cjs tokens stamp {objective}-{trd} --draft`
    appears before the `summary post {objective}-{trd} --from` line. The file says token numbers are never typed by hand.
12. workflows/execute-trd.md: the `create_summary_with_evidence` step names `tokens stamp` before `summary post`.
13. templates/summary.md names `tokens_input` and `tokens_output`.
14. agents/executor.md's `state record-metric` example uses `--job "${TRD}"` and contains no `record-metric` line with `--trd`.

<embedded_context>

<codebase_examples>
Thin CLI front end pattern (audit-cli.cjs): pure `run*` returns `{ok, result, text}` or `{ok:false, message}`, so flag
parsing is unit-testable in-process, and the dispatcher only maps the result onto output/error:

```js
case 'context': {
  const { output: outputAudit } = require('./lib/helpers.cjs');
  const { runContext } = require('./lib/audit-cli.cjs');
  const r = runContext({ argv: args.slice(1) });
  if (!r.ok) error(r.message);
  outputAudit(r.result, raw, r.text);
  break;
}
```

`--raw` is removed from `args` before dispatch (df-tools.cjs:266-268); `raw` is a boolean. `output(result, raw, rawValue,
exitCode)` prints `rawValue` when raw, else JSON, and JSON over 50,000 chars goes to an `@file:` temp path. Keep `tokens`
output small. For `tokens`:

```js
case 'tokens': {
  // df-tools tokens <trd|stamp> ... — TRD 57-03 (backfill: 57-06)
  const { output: outputTokens } = require('./lib/helpers.cjs');
  const { runTokens } = require('./lib/tokens-cli.cjs');
  const r = runTokens({ argv: args.slice(1), cwd });
  if (!r.ok) error(r.message);
  outputTokens(r.result, raw, r.text, r.exit || 0);
  break;
}
```

Paths: `planningMode.resolveMainRoot(cwd)` is the main checkout (what REPO_ROOT in executor prompts names; the repo for
transcript matching). `planningMode.resolveCheckoutRoot(cwd)` is the checkout holding cwd (a worktree for an executor).
Use the latter for `.planning/` refusal and `objectiveDirsFor`. Refuse a draft inside either checkout's `.planning/`.

Draft paths come from `df-tools planning draft objectives/<dir>/<file>`, e.g.
`/var/folders/.../T/devflow-drafts/devflow-claude-d3dccfe9/objectives/57-estimation-data-foundation/57-03-SUMMARY.md`.
The objective dir is the path segment after the last `/objectives/`. When the draft path has none, fall back to
`objectiveDirsFor(checkout, id)` and require exactly one.

token-usage.cjs (57-01) surface to call:
`indexExecutorTranscripts({root, repoRoot})`, `tokensForTrd(index, {id, dir, sharedNumber})`,
`tokenFrontmatterFields(totals, 'live')`, `stampTokenFields(file, fields, {force:true})`, `objectiveDirsFor`,
`normTrdId`, `defaultTranscriptRoot()`.

executor.md today (self_check step 3, around line 1060), where the stamp goes:

~~~markdown
**3. Add the result to the draft, then post it once:** `## Self-Check: PASSED` or `## Self-Check: FAILED` with missing items listed, then:

```bash
node ~/.claude/devflow/bin/df-tools.cjs summary post {objective}-{trd} --from <draft path>
```
~~~

and the metric example to fix (state_updates):

```bash
node ~/.claude/devflow/bin/df-tools.cjs state record-metric \
  --objective "${OBJECTIVE}" --trd "${TRD}" --duration "${DURATION}" \
```

The dispatcher reads `--job` (df-tools.cjs `record-metric` branch); `--trd` makes it fail with "objective, job, and
duration required". execute-trd.md already passes `--job`.

Prose to add (wording may be tightened; keep the facts). Put each command in its own fenced block, because executors run
one command per Bash call:

~~~markdown
Stamp your token usage into the draft, then post it once (two separate commands):

```bash
node ~/.claude/devflow/bin/df-tools.cjs tokens stamp {objective}-{trd} --draft <draft path>
```

```bash
node ~/.claude/devflow/bin/df-tools.cjs summary post {objective}-{trd} --from <draft path>
```

`tokens stamp` reads your own executor transcript and adds `tokens_input`, `tokens_output`, `tokens_cache_read`,
`tokens_cache_write`, `token_model` and `tokens_source` to the draft's frontmatter (EST-06). If it reports
`stamped: false`, or the command is unknown in an older runtime, post without them. Never type token numbers by hand.
~~~
</codebase_examples>

<anti_patterns>
- Letting the executor fill token numbers itself. The numbers come from the transcript or not at all.
- Failing (non-zero exit) when no transcript is found. Retention, an older runtime or a non-Claude-Code harness makes
  that normal, and SUMMARY publication must not block on it.
- Writing a `.planning/` file directly from `tokens stamp`. In store mode that path is a cache the edit gate guards; the
  draft plus `summary post` is the only write path.
- Prose lines that read as a planning-file write without a verb nearby. planning-writes.repo.test.cjs flags write verbs
  (write/create/update/append/save/edit/fill/overwrite/rewrite) near SUMMARY with no `df-tools summary post` within 3
  lines. Keep the stamp sentence next to the `summary post` block.
</anti_patterns>

<error_recovery>
- help.test.cjs fails "every dispatcher command has a help entry": add `COMMANDS.tokens` (usage must start with
  `df-tools tokens`, `mutates: true`).
- dispatch-completeness.test.cjs spawns every COMMANDS key with `HOME` isolated. `tokens` with no args must exit with a
  usage error, never `Unknown command`.
- planning-writes.repo.test.cjs / rg-flag-guard.test.cjs / doc-refs.repo.test.cjs fail on the prose: fix the wording.
  Never add an EXEMPT entry for a real write instruction.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/token-usage.cjs
@plugins/devflow/devflow/bin/lib/audit-cli.cjs
@.planning/objectives/57-estimation-data-foundation/57-01-SUMMARY.md
</context>

<gotchas>
- Executors call `node ~/.claude/devflow/bin/df-tools.cjs`, the runtime mirror. Until the next release and re-sync, the
  mirror lacks `tokens`, so the prose must tolerate "Unknown command" (post without fields). 57-07 proves the step live
  with the repo copy.
- The repo for transcript matching is the main checkout. An executor's cwd is its worktree, so `--repo` defaults to
  `resolveMainRoot(cwd)`, not cwd.
- `summary post` in the e2e test: build the fixture repo the way planning-verbs-cli.test.cjs's local-mode tests do
  (`.planning/` with the objective dir; no `github.store`). See also `__fixtures__/planning-e2e-fixtures.cjs`.
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: tokens-cli.cjs (`tokens trd`, `tokens stamp`) + dispatch + help</name>
  <files>plugins/devflow/devflow/bin/lib/tokens-cli.cjs, plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 1-10. Commit `test(57-03): tokens stamp writes executor token usage into a SUMMARY draft`.

GREEN:
1. tokens-cli.cjs: `runTokens({argv, cwd, root})`. Parse `argv[0]` as the subcommand, positionals and the value flags
   `--draft`, `--repo`, `--root`, `--objective-dir`. Unknown flags and missing values are usage errors
   (`{ok:false, message}`) whose message includes the usage line. Resolution:
   - `repo = --repo || resolveMainRoot(cwd)`; `checkout = resolveCheckoutRoot(cwd) || repo`;
     `root = --root || root arg || defaultTranscriptRoot()`.
   - id: `normTrdId(positional)`. Invalid gives a usage error.
   - dir: `--objective-dir`, else the draft path's segment after the last `/objectives/`, else the single entry of
     `objectiveDirsFor(checkout, id)`. With several candidates and no evidence, stamp gives
     `{stamped:false, reason:'ambiguous_objective'}`. With no directory at all, use `dir:null`.
   - `sharedNumber = objectiveDirsFor(checkout, id).length > 1`.
   - `trd`: `{ok:true, result:{trd:id, objective_dir, found, reason?, fields?, transcripts}, text}`. text is the one-line
     form from test 6, or `not found: <reason>`.
   - `stamp`: the draft must exist and not resolve (realpath) inside `<checkout>/.planning/` or `<repo>/.planning/`. Then
     `tokensForTrd` → `tokenFrontmatterFields(totals, 'live')` → `stampTokenFields(draft, fields, {force:true})`. Result:
     `{trd, draft, objective_dir, stamped, reason?, fields, transcripts}`; text is
     `stamped tokens_input=N tokens_output=M (K transcripts)` or `not stamped: <reason>`.
2. df-tools.cjs: `case 'tokens'` (codebase_examples), plus a header-doc block "Estimation data:" listing `tokens trd` and
   `tokens stamp`.
3. help.cjs: `COMMANDS.tokens` with usage
   `df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path>> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]`,
   a one-sentence summary, `mutates: true` and details naming the transcript root default and the exit codes (0 even
   when nothing was found; 1 for usage errors or a `.planning/` draft).
Commit `feat(57-03): df-tools tokens trd|stamp`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes.</verify>
  <done>Tests 1-10 pass after a recorded RED. Test 2 proves success criterion 1 end to end: a SUMMARY published from a stamped draft carries tokens_input and tokens_output.</done>
  <recovery>If `summary post` in the fixture refuses ("objective ... is not known"), the fixture needs the objective directory under `.planning/objectives` (and a ROADMAP if the verb wants one). Copy the minimal shape from planning-verbs-cli.test.cjs local tests instead of weakening the assertion.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Executor and workflow prose stamp tokens before summary post; template documents the fields</name>
  <files>plugins/devflow/agents/executor.md, plugins/devflow/devflow/workflows/execute-trd.md, plugins/devflow/devflow/templates/summary.md, plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs</files>
  <action>
RED: tests 11-14 (prose contract describe in tokens-cli.test.cjs). Commit
`test(57-03): executor prose stamps token usage before summary post`.

GREEN:
- executor.md `<self_check>` step 3: replace the single `summary post` block with the two-block stamp-then-post text
  (codebase_examples). In `<summary_creation>`, extend the **Frontmatter:** line with "token usage (stamped by
  `df-tools tokens stamp`, never typed)". In `<state_updates>`, change `--trd "${TRD}"` to `--job "${TRD}"` in the
  record-metric example.
- execute-trd.md `create_summary_with_evidence`: before "publish it once with ... summary post", add the stamp command
  and the never-by-hand sentence.
- templates/summary.md: in the `# Metrics` block after `completed:`, add commented lines documenting `tokens_input`,
  `tokens_output`, `tokens_cache_read`, `tokens_cache_write`, `token_model` and `tokens_source` (`"live"` from
  `tokens stamp`, `"backfill"` from `tokens backfill`). Keep them commented, so a copied template never carries fake
  numbers. Mention in one sentence of the instructions above the code block that `tokens stamp` adds them.
Commit `docs(57-03): executor stamps token usage into its SUMMARY draft before posting`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/templates.test.cjs` passes.</verify>
  <done>Tests 11-14 pass after a recorded RED; the planning-writes, rg-flag, doc-refs and templates suites stay green.</done>
  <recovery>If planning-writes flags a new line, reword it so the write verb is the `summary post` call (e.g. "stamp ... then post it once") and keep it within 3 lines of the `df-tools ... summary post` block; do not add an EXEMPT entry.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 1: test 2 publishes a SUMMARY that carries `tokens_input` and `tokens_output`, through the real
  `tokens stamp` + `summary post` commands.
- The executor/workflow prose puts the stamp immediately before `summary post`, and the template documents the fields.
</verification>

<success_criteria>
- EST-06 holds for every executor that runs a runtime containing this TRD.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Before posting, run the repo copy on your own draft and record the result:
`node plugins/devflow/devflow/bin/df-tools.cjs tokens stamp 57-03 --draft <your draft path>`.
</output>
