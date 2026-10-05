---
objective: 57-estimation-data-foundation
trd: "01"
subsystem: telemetry
tags: [transcripts, token-usage, claude-code, estimation, frontmatter]

# Dependency graph
requires:
  - objective: 29-context-discipline
    provides: context-audit.cjs (the df-tools context transcript parser)
  - objective: 44-autonomous-executor
    provides: hooks/gate-executor-stop.js identifyTrd / readFirstUserPrompt
  - objective: 46-github-store
    provides: frontmatter.setFrontmatterField (comment-preserving scalar setter)
provides:
  - "token-usage.cjs: per-TRD executor token totals from Claude Code transcripts (tokensForTrd) and the SUMMARY frontmatter stamp (stampTokenFields)"
  - "trd-identify.cjs: executor TRD identification shared by the SubagentStop hook and df-tools"
  - "context-audit.forEachRecord: the one JSONL transcript reader"
  - "__fixtures__/transcript-fixtures.cjs: hand-built Claude Code projects tree"
affects: [57-03 forward token stamp, 57-04 token backfill, 57-05 calibrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Usage counted once per API message (message.id dedupe, largest output_tokens wins)"
    - "Index reads meta.json first, then only the first user record; bodies only for kept transcripts"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/token-usage.cjs
    - plugins/devflow/devflow/bin/lib/token-usage.test.cjs
    - plugins/devflow/devflow/bin/lib/trd-identify.cjs
    - plugins/devflow/devflow/bin/lib/trd-identify.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/context-audit.cjs
    - plugins/devflow/devflow/bin/lib/context-audit.test.cjs
    - plugins/devflow/hooks/gate-executor-stop.js

key-decisions:
  - "Index counts partition executor_transcripts: unidentified | ambiguous | foreign | identified (identified == entries.length, identified AND this repo)"
  - "tokensForTrd returns ambiguous_objective when nothing is kept for a shared objective number and any candidate has no directory evidence; no_transcript when every candidate names another directory"
  - "A first-record cwd under <dirname(repo)>/.df-worktrees/<basename(repo)>/ matches the repo (match 'worktree'); REPO_ROOT still decides alone when present"
  - "Unrecovered results share one shape: {status:'unrecovered', reason, transcripts, totals:null}; reasons invalid_id | no_transcript | ambiguous_objective | zero_usage"
  - "stampTokenFields reports ok:false (nothing written) for a file with no frontmatter block"

patterns-established:
  - "Executor transcript lookup: <root>/<key>/<session>/subagents/agent-*.meta.json, three levels, sorted, no recursive walk"
  - "Token frontmatter fields: tokens_input (input + cache_creation + cache_read), tokens_output, tokens_cache_read, tokens_cache_write, token_model (raw id), tokens_source"

requirements-completed: [EST-06, EST-07]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 15min
completed: 2026-10-05
---

# Objective 57 TRD 01: Transcript token reader Summary

**Per-TRD executor token totals from Claude Code subagent transcripts: usage deduped by `message.id` through the shared `context-audit.forEachRecord` parser, scoped to one repository and one objective directory, with a byte-preserving SUMMARY frontmatter stamp.**

## Progress
- [x] Task 1: Transcript fixture builder + context-audit.forEachRecord + sumUsage with message-id dedupe — 799f10d9 (RED bc28c347)
- [x] Task 2: Move identifyTrd/readFirstUserPrompt to lib/trd-identify.cjs; hook re-exports — 50a38882 (RED e93703e8)
- [x] Task 3: Executor transcript index, repo/objective matching, tokensForTrd and the frontmatter stamp — c79e005b (RED d1eef146)
- [x] Deviation (Rule 2): DevFlow worktree cwd counts as this repo — 38608b95 (RED 8c1103ab)

## Performance

- Started: 2026-10-05T17:14:09Z
- Completed: 2026-10-05T17:28:51Z (15 min)
- Tasks: 3 of 3, plus one Rule 2 deviation
- Commits: 8 code commits (4 RED, 4 GREEN)
- Real-data index: 856 executor transcripts in 0.27-0.58 s

## Accomplishments

- `context-audit.forEachRecord(file, fn)` is the one JSONL reader; `analyze()` and `sumUsage()` both parse through it (EST-07 reuse). `rg -n forEachRecord plugins/devflow/devflow/bin/lib/token-usage.cjs` finds the call.
- `sumUsage` counts each API message once. The hand-built three-message transcript gives exactly input 7, cache_creation 19596, cache_read 121144 and output 1370 (tokens_input 140747). The naive per-record sum is output 1410, cache_read 317782.
- `identifyTrd`, `readFirstUserPrompt` and the bounded scanner moved verbatim into `lib/trd-identify.cjs` (checked mechanically against the pre-move hook). The scanner now takes a `pick(rec)` callback, which adds `readFirstUserRecord` and `repoRootOf`. The hook re-exports the same function objects, and all 71 of its tests pass unchanged.
- `indexExecutorTranscripts` → `tokensForTrd` → `tokenFrontmatterFields` / `stampTokenFields` are ready for 57-03 (forward stamp) and 57-04 (backfill).

### Final exported signatures (token-usage.cjs)

```
normTrdId(id) -> 'NN-MM' | null                         // '4-1' -> '04-01', '4.1-2' -> '04.1-02'
sumUsage(file) -> {readable, messages, input, cache_creation, cache_read, output,
                   by_model: {[rawModel]: {messages, input, cache_creation, cache_read, output}}}
pickModel(byModel) -> rawModelId | null                 // largest output; tie -> smaller id
identifyExecutorTrd({prompt, description}) -> {id, dirs} | {ambiguous: true} | null
indexExecutorTranscripts({root = defaultTranscriptRoot(), repoRoot}) ->
  {entries: [{file, session, agent_id, id, dirs, match: 'repo_root'|'cwd'|'worktree'|'path'}],
   counts: {executor_transcripts, identified, unidentified, ambiguous, foreign}}   // throws without repoRoot
tokensForTrd(index, {id, dir = null, sharedNumber = false}) ->
  {status: 'recovered', transcripts: [{file, session, agent_id}],
   totals: {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model}}
  | {status: 'unrecovered', reason: 'invalid_id'|'no_transcript'|'ambiguous_objective'|'zero_usage',
     transcripts, totals: null}
objectiveDirsFor(checkoutRoot, id) -> string[]          // sorted; [] without .planning/objectives
TOKEN_FIELDS = ['tokens_input','tokens_output','tokens_cache_read','tokens_cache_write','token_model','tokens_source']
tokenFrontmatterFields(totals, source) -> [[key, serialised], ...]   // integers bare, model/source JSON-quoted
stampTokenFields(filePath, fields, {force = false}) -> {ok, changed, conflicts, error?}
defaultTranscriptRoot() -> path.join(os.homedir(), '.claude', 'projects')   // resolved at call time
```

trd-identify.cjs: `identifyTrd(text)`, `readFirstUserPrompt(file, opts)`, `readFirstUserRecord(file, opts)`, `repoRootOf(text)`, `textOfContent(content)`.
context-audit.cjs: `forEachRecord(file, fn) -> boolean`.

### Smoke run against real transcripts (read-only)

`indexExecutorTranscripts({repoRoot: '/Users/justin/dev/devflow-claude'})` on this machine:

| count | before the worktree rule | after (final) |
|---|---|---|
| executor_transcripts | 856 | 856 |
| identified (this repo) | 233 | 236 |
| unidentified | 74 | 74 |
| ambiguous | 3 | 3 |
| foreign | 546 | 543 |

Matches by rule (final): repo_root 199, cwd 34, worktree 3. `tokensForTrd(56-02, dir 56-objective-number-correctness)` gives
**recovered**: 1 transcript, tokens_input 10978149, tokens_output 44884, tokens_cache_read 10831247, tokens_cache_write 146736,
token_model `claude-sonnet-5-5`. Index time 0.27-0.58 s.

A read-only diagnostic broke the non-matches down. The 543 foreign transcripts are other repositories (404 by cwd, 138 by
REPO_ROOT) plus one e2e scratch fixture (`Execute TRD 99-01` under a scratchpad `proj/`). The 15 unidentified transcripts in
the devflow-claude project key are `/devflow:quick` executors (`Execute quick 21`), which are not TRDs. 57-04 should expect
them as `unidentified`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + forEachRecord + sumUsage | `node --test .../context-audit.test.cjs .../token-usage.test.cjs` | 0 | PASS (18/18) |
| 1: analyze() unchanged | `node --test .../audit-cli.test.cjs` | 0 | PASS (39/39) |
| 2: trd-identify move | `node --test .../trd-identify.test.cjs hooks/gate-executor-stop.test.js .../summary-pairing.test.cjs .../summary-worktree.test.cjs .../regex-escape.repo.test.cjs` | 0 | PASS (102/102) |
| 3: index + tokensForTrd + stamp | `node --test .../token-usage.test.cjs .../context-audit.test.cjs .../trd-identify.test.cjs` | 0 | PASS (34/34) |
| 3: real-data smoke | `node -e "...indexExecutorTranscripts({repoRoot:'/Users/justin/dev/devflow-claude'})..."` | 0 | PASS (identified 236, 56-02 recovered) |
| Deviation: worktree rule | `node --test .../token-usage.test.cjs` | 0 | PASS (15/15) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test token-usage.test.cjs trd-identify.test.cjs context-audit.test.cjs hooks/gate-executor-stop.test.js` (+ regex-escape.repo.test.cjs) | 0 | PASS (111/111) |
| test | `npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/57-01 test` | 1 | PASS modulo baseline: 9329 tests, 9294 pass, 3 fail, 32 skipped (104 s). The 3 failures are the known baseline: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration (real fleet), roadmap-reconcile E2E1 (clears once `roadmap update-job-progress 57` ticks this TRD) |
| lint / build | none in the stack profile | n/a | not_available |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED (bc28c347) | `node --test context-audit.test.cjs token-usage.test.cjs` | 1 | FAIL: `forEachRecord is not a function`, `Cannot find module './token-usage.cjs'` |
| T1 GREEN (799f10d9) | same | 0 | PASS 18/18 |
| T2 RED (e93703e8) | `node --test trd-identify.test.cjs` | 1 | FAIL: `Cannot find module './trd-identify.cjs'` |
| T2 GREEN (50a38882) | T2 verify set | 0 | PASS 102/102 |
| T3 RED (d1eef146) | `node --test token-usage.test.cjs` | 1 | FAIL 12/14: `tu.indexExecutorTranscripts is not a function` (etc.); 1a and 8 stay green |
| T3 GREEN (c79e005b) | T3 verify set | 0 | PASS 34/34 |
| Dev RED (8c1103ab) | `node --test --test-name-pattern=5b token-usage.test.cjs` | 1 | FAIL: entries `{}` instead of `{'99-10':'worktree'}` |
| Dev GREEN (38608b95) | `node --test token-usage.test.cjs` | 0 | PASS 15/15 |

REFACTOR: none needed. Task 2's move was itself the refactor commit.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (dedupe; exact fixture totals; executor-only; foreign repo excluded; shared objective number → dir evidence or ambiguous_objective; shared forEachRecord; trd-identify single source with hook re-export; byte-preserving idempotent stamp)
- Gate failures: none of this TRD's. Full suite: 3 known baseline failures only (MA-7, stack-drafter-fleet, roadmap-reconcile E2E1)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/token-usage.cjs`: the token reader (created)
- `plugins/devflow/devflow/bin/lib/token-usage.test.cjs`: tests 1-13 plus 1a and 5b (created)
- `plugins/devflow/devflow/bin/lib/trd-identify.cjs`: identification moved from the hook, plus `readFirstUserRecord` and `repoRootOf` (created)
- `plugins/devflow/devflow/bin/lib/trd-identify.test.cjs`: tests 14-15 (created)
- `plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs`: projects-tree fixture builder (created)
- `plugins/devflow/devflow/bin/lib/context-audit.cjs`: `forEachRecord`, now used by `analyze()` (modified)
- `plugins/devflow/devflow/bin/lib/context-audit.test.cjs`: test 16 (modified)
- `plugins/devflow/hooks/gate-executor-stop.js`: requires and re-exports identification from lib; header comment updated (modified)

## Decisions Made

- **Counts are a partition.** `executor_transcripts = identified + unidentified + ambiguous + foreign`. `identified` means identified AND in this repo, so it always equals `entries.length`. A missing or unreadable jsonl next to an executor meta.json counts as `unidentified`.
- **ambiguous_objective rule.** With `dir` set, a shared number and nothing kept, the result is `ambiguous_objective` whenever any candidate had no directory evidence. It is `no_transcript` only when every candidate named another directory. The TRD's wording ("all dropped for missing directory evidence") is the special case of this rule. In test 6, the mixed index (one 10-beta transcript, one with no evidence) gives `ambiguous_objective` for 10-alpha.
- **Directory evidence** ignores `objective NN-MM` phrases, because they name a TRD rather than a directory.
- **Hook requires two names, not four.** The TRD said "require the four names from lib". The hook only uses `identifyTrd` and `readFirstUserPrompt`, so it requires just those two (the shape in the TRD's codebase_examples) and avoids unused bindings.
- **Input validation.** `indexExecutorTranscripts` throws without `repoRoot`. `tokensForTrd` returns `invalid_id` for an id that `normTrdId` rejects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] Executors whose cwd is one of the repo's DevFlow worktrees were counted foreign**
- **Found during:** Task 3 real-data smoke run (diagnostic of the 546 foreign transcripts)
- **Issue:** The TRD gotcha said the first-record cwd always names the main checkout. Three real devflow-claude executors (gap-closure TRDs 42-13, 42-14, 42-15) ran with cwd `/Users/justin/dev/.df-worktrees/devflow-claude/42-12` and no REPO_ROOT line, so the backfill (57-04) would have reported `no_transcript` for TRDs whose transcripts exist.
- **Fix:** Without a REPO_ROOT line, a cwd under `<dirname(repo)>/.df-worktrees/<basename(repo)>/` (the exact path `exec-context worktree` provisions, exec-context.cjs:423) now matches with `match: 'worktree'`. A REPO_ROOT line still decides on its own. Test 5b proves the match, rejects another repo's worktree directory with the same layout, and shows a foreign REPO_ROOT still wins over a worktree cwd.
- **Result:** identified 233 → 236; 42-13/14/15 recover (output 118364 / 90996 / 109135).
- **Files modified:** token-usage.cjs, token-usage.test.cjs
- **Commits:** 8c1103ab (RED), 38608b95 (GREEN)

## Issues Encountered

- One wasted call: `git show --output=<file>` printed the whole pre-move hook to stdout. The verbatim check was then done with a scratch script that reads the source through `execFileSync('git', ['show', ...])`.

## Known limitations for 57-04

- When the number is not shared (`sharedNumber:false`), a transcript whose prompt names a directory is still filtered on it, which follows the TRD's rule. If an objective directory was renamed after the run, its transcript drops out (`no_transcript`).
- Prompts that give only the bare TRD number ("Execute plan 15 of objective 43-...") are identified from the meta.json description tier (`Execute TRD 43-15 to checkpoint`).
- Model ids are raw (`claude-sonnet-5-5`, `claude-opus-5[1m]`); 57-02 owns normalisation for pricing.

## Next Objective Readiness

57-03 and 57-04 can call `indexExecutorTranscripts({repoRoot: <main checkout>})` once, then `tokensForTrd(index, {id, dir, sharedNumber: objectiveDirsFor(checkout, id).length > 1})` and `stampTokenFields(summaryPath, tokenFrontmatterFields(totals, source), {force})`, with no changes here.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/token-usage.cjs, token-usage.test.cjs, trd-identify.cjs, trd-identify.test.cjs, __fixtures__/transcript-fixtures.cjs
- FOUND commits on df/exec-57-01 (bcd424a0..HEAD): bc28c347, 799f10d9, e93703e8, 50a38882, d1eef146, c79e005b, 8c1103ab, 38608b95
- Working tree clean before the final metadata commit
