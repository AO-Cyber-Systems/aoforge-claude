---
objective: 57-estimation-data-foundation
trd: "03"
subsystem: telemetry
tags: [tokens, transcripts, summary-frontmatter, estimation, df-tools, executor-prose]

# Dependency graph
requires:
  - objective: 57-estimation-data-foundation
    provides: "TRD 57-01 token-usage.cjs (tokensForTrd, tokenFrontmatterFields, stampTokenFields, objectiveDirsFor) and trd-identify.cjs"
provides:
  - "df-tools tokens trd <trd-id>: read-only executor token totals of one TRD from Claude Code transcripts"
  - "df-tools tokens stamp <trd-id> --draft <path>: writes tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model, tokens_source: \"live\" into a SUMMARY draft"
  - "executor.md and execute-trd.md stamp tokens immediately before summary post; templates/summary.md documents the fields"
affects: [57-04 token backfill (never overwrites tokens_source live), 57-06 tokens backfill and calibrate CLI, 57-07 dogfood and docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure run* front end returning {ok, result, text, exit} (audit-cli shape); the dispatcher case only maps it onto output()/error()"
    - "Stamp the DRAFT, publish with the planning verb: the D-01 invariant (every planning write goes through summary post) is kept"
    - "Never block publication: no transcript, retention, an older runtime or another harness is stamped:false with exit 0"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
    - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/agents/executor.md
    - plugins/devflow/devflow/workflows/execute-trd.md
    - plugins/devflow/devflow/templates/summary.md

key-decisions:
  - "Repo for transcript matching is resolveMainRoot(cwd) (what REPO_ROOT names), not the executor's worktree cwd; .planning/ refusal and objectiveDirsFor use resolveCheckoutRoot(cwd)"
  - "A draft inside either checkout's .planning/ (realpath compared) exits 1; every other outcome, including a draft with no frontmatter, exits 0"
  - "Objective directory: --objective-dir, else the draft path segment after the last /objectives/, else the single directory of that number, else ambiguous_objective (stamped:false)"
  - "A stamp that cannot be written (no frontmatter block) restores the draft's original bytes and reports stamped:false / stamp_failed"
  - "Template token lines stay commented placeholders (N, model-id) so a copied template carries no fake numbers"

requirements-completed: [EST-06]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 13min
completed: 2026-10-05
tokens_input: 7538193
tokens_output: 49393
tokens_cache_read: 7377693
tokens_cache_write: 160388
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 57 TRD 03: Forward token stamp Summary

**`df-tools tokens trd|stamp` reads an executor's own Claude Code transcript and stamps tokens_input / tokens_output (plus cache, model and `tokens_source: "live"`) into the SUMMARY draft before `summary post`, and the executor agent, execute-trd workflow and SUMMARY template now say so.**

## Progress
- [x] Task 1: tokens-cli.cjs (`tokens trd`, `tokens stamp`) + dispatch + help — 7088e908 (RED ec3a4313)
- [x] Task 2: Executor and workflow prose stamp tokens before summary post; template documents the fields — 78feab88 (RED ee089386)

## Performance

- Started: 2026-10-05T17:32:16Z
- Completed: 2026-10-05T17:45:27Z (13 min)
- Tasks: 2 of 2
- Commits: 4 (2 RED `test`, 1 `feat`, 1 `docs`)

## Accomplishments

- `tokens stamp 99-01 --draft <draft>` writes `tokens_input: 140747`, `tokens_output: 1370`, `tokens_cache_read: 121144`, `tokens_cache_write: 19596`, `token_model: "claude-opus-5-5"` and `tokens_source: "live"` into the draft frontmatter from the `THREE_MESSAGES` fixture transcript. The body stays byte-identical. A following `summary post` publishes a SUMMARY that carries both required fields (test 2, real commands, local mode).
- Nothing blocks publication. No transcript for the TRD: exit 0, `stamped:false, reason:'no_transcript'`, draft bytes unchanged. A shared objective number with no draft-path evidence: `ambiguous_objective`. A draft inside `.planning/` is the one refusal (exit 1, names `--draft` and `summary post`).
- `tokens trd <id> --raw` prints `tokens_input=140747 tokens_output=1370 transcripts=1`; without `--raw` the JSON has `found`, `fields` and `transcripts`.
- The default transcript root is `os.homedir()/.claude/projects`, read at call time (test 10), so a HOME-isolated run reads the fake home.
- Prose: executor.md `<self_check>` step 3 now stamps then posts (two separate commands, one per Bash call) and says token numbers are never typed by hand; execute-trd.md `create_summary_with_evidence` does the same; templates/summary.md documents the six fields as commented placeholders in `# Metrics`.
- executor.md's `state record-metric` example now passes `--job "${TRD}"` (the flag the dispatcher reads) instead of `--trd`, so the STATE_ARCHIVE metric that EST-01 consumes can actually be recorded by the documented call.
- Live proof with the repo copy against this executor's own transcript: `node plugins/devflow/devflow/bin/df-tools.cjs tokens trd 57-03` found one transcript (`claude-sonnet-5-5`, 6244837 input, 41559 output at the time of the check). The stamp of this SUMMARY is recorded under "Token stamp of this SUMMARY" below.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: tokens-cli + dispatch + help | `node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 | PASS (31/31) |
| 2: prose + template | `node --test tokens-cli.test.cjs planning-writes.repo.test.cjs rg-flag-guard.test.cjs doc-refs.repo.test.cjs templates.test.cjs` | 0 | PASS (63/63 after fixing test 14's needle, see Deviations) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test tokens-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs planning-writes.repo.test.cjs` | 0 | PASS |
| test | `npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/57-03 test` | 1 | PASS modulo baseline: 9425 tests, 9390 pass, 3 fail, 32 skipped. The 3 failures are the known baseline: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration (real fleet), roadmap-reconcile E2E1 (clears once `roadmap update-job-progress 57` ticks the objective's TRDs) |
| lint / build | none in the stack profile | n/a | not_available |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED (ec3a4313) | `node --test tokens-cli.test.cjs` | 1 | FAIL 11/11: `Unknown command: tokens`, `Cannot find module './tokens-cli.cjs'` |
| T1 GREEN (7088e908) | `node --test tokens-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs` | 0 | PASS 31/31 |
| T2 RED (ee089386) | `node --test --test-name-pattern="^1[1-4]\." tokens-cli.test.cjs` | 1 | FAIL 4/4: no `tokens stamp` in `<self_check>` or the workflow step, no `tokens_input` in the template, `--trd` in the record-metric example |
| T2 GREEN (78feab88) | `node --test tokens-cli.test.cjs planning-writes.repo.test.cjs rg-flag-guard.test.cjs doc-refs.repo.test.cjs templates.test.cjs` | 0 | PASS |

REFACTOR: none needed.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (stamp writes the six fields; stamped draft publishes both fields via `summary post`; no transcript is exit 0 stamped:false with the draft byte-identical; a `.planning/` draft is refused with exit 1; executor.md and execute-trd.md stamp before `summary post` and forbid hand-typed numbers; the template documents the fields; record-metric passes `--job`)
- Gate failures: none of this TRD's. Full suite: the 3 known baseline failures only (MA-7, stack-drafter-fleet, E2E1)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/tokens-cli.cjs`: `runTokens({argv, cwd, root})` for `tokens trd` and `tokens stamp`, pure, returns `{ok, result, text, exit}` (created)
- `plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs`: tests 1-10 (spawned df-tools with a fake HOME, plus in-process) and the prose contract 11-14 (created)
- `plugins/devflow/devflow/bin/df-tools.cjs`: `case 'tokens'` and the "Estimation data" header block (modified)
- `plugins/devflow/devflow/bin/lib/help.cjs`: `COMMANDS.tokens` (modified)
- `plugins/devflow/agents/executor.md`: stamp-then-post in `<self_check>`, token usage in the Frontmatter line, `--job` in record-metric (modified)
- `plugins/devflow/devflow/workflows/execute-trd.md`: stamp before `summary post` in `create_summary_with_evidence` (modified)
- `plugins/devflow/devflow/templates/summary.md`: commented token fields in `# Metrics` and one sentence of instructions (modified)

## Decisions Made

- `--repo` defaults to `resolveMainRoot(cwd)`, not cwd: an executor runs in a worktree but its transcript names the main checkout as REPO_ROOT. The `.planning/` refusal checks both the holding checkout and the main checkout, by realpath.
- `fields` in the JSON result is a plain object (numbers as numbers, `token_model` and `tokens_source` as strings), not the serialised `[key, text]` pairs the frontmatter writer takes.
- `stamp` is `mutates: true` in the help table because it writes the draft; `trd` shares the entry and is read-only, which the details line says.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 14 matched the wrong executor.md line**
- **Found during:** Task 2 GREEN run
- **Issue:** The helper looked for any line containing `state record-metric`, which also matched the `- \`state record-metric\`: Appends to Performance Metrics table` description bullet in `<state_updates>`. The bullet carries no flags, so the assertion failed although the example was correct.
- **Fix:** The helper now matches only invocations (`df-tools.cjs state record-metric`) and still joins backslash continuation lines before checking `--job "${TRD}"` and the absence of `--trd`.
- **Files modified:** plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
- **Commit:** 78feab88

**2. [Rule 2 - Missing correctness] A stamp that cannot be written restores the draft**
- **Found during:** Task 1 design
- **Issue:** `stampTokenFields` sets keys one at a time. A failure after some keys were written would leave a half-stamped draft, which would break the "stamped:false leaves the draft byte-identical" promise.
- **Fix:** `tokens stamp` keeps the original bytes and writes them back when the stamp reports `ok:false` (for example a draft with no frontmatter block); the result is `stamped:false, reason:'stamp_failed'` with the error text, exit 0.
- **Files modified:** plugins/devflow/devflow/bin/lib/tokens-cli.cjs
- **Commit:** 7088e908

**3. [Prose] summary_creation intro adjusted to match**
- executor.md `<summary_creation>` said the self-check "adds `## Self-Check` and then publishes it once". It now also says it stamps the token usage, so an executor reading that section first does not skip the stamp. The block under it is unchanged.

## Issues Encountered

- `df-tools commit` and `summary checkpoint` ran from the repo copy (`node plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree>`), as the TRD's output spec says. The runtime mirror at `~/.claude/devflow` has no `tokens` command until the next release and re-sync; the prose tolerates "Unknown command" (post without the fields), and 57-07 proves the step live.
- The full `npm test` output exceeds the tool's display limit, so it was redirected to a scratchpad log and read by `rg` for the totals and failing-test names.

## Token stamp of this SUMMARY

`node plugins/devflow/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/.df-worktrees/devflow-claude/57-03 tokens stamp 57-03 --draft <draft path>` was run on this draft immediately before `summary post`; the frontmatter token fields above are its output, not typed (`stamped: true`, 1 transcript, `claude-sonnet-5-5`: tokens_input 7538193, tokens_output 49393, tokens_cache_read 7377693, tokens_cache_write 160388). Because the stamp counts the transcript up to the stamp call, the final turns (post, state updates, final commit) are not included.

## Next Objective Readiness

57-04 (backfill) must skip any SUMMARY whose `tokens_source` is `"live"`. 57-06 adds `tokens backfill` and `calibrate` to the same `case 'tokens'` and help entry. 57-07 proves the stamp from the runtime mirror once it is released.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/tokens-cli.cjs, tokens-cli.test.cjs, df-tools.cjs, lib/help.cjs, agents/executor.md, workflows/execute-trd.md, templates/summary.md
- FOUND commits on df/exec-57-03 (1b7642b6..HEAD): ec3a4313, 7088e908, ee089386, 78feab88
