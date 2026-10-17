---
objective: quick-37
trd: 01
subsystem: estimation, release
tags: [pricing, calibration, release-workflow, changelog]
requires: []
provides:
  - "model-rates.json: claude-sonnet-5-5 cache_read 0.1, every as_of 2026-10-16"
  - "release.yml: top-level + job contents: write, workflow_dispatch dry run"
  - "scripts/release-tag.cjs: runDryRun, dryRunTag, dry-run tag kind, --dry-run CLI"
  - "scripts/tag-rules.cjs: read-only tag ruleset inspector"
  - "3.1.0 and pack 1.0.0 dated 2026-10-16"
affects: [estimate, calibrate, release.yml]
tech-stack:
  added: []
  patterns: ["injected exec + fake runner with array results", "fnmatch ref matching done locally"]
key-files:
  created:
    - scripts/tag-rules.cjs
    - scripts/tag-rules.test.cjs
  modified:
    - plugins/aoforge/aoforge/references/model-rates.json
    - plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/calibrator.test.cjs
    - .github/workflows/release.yml
    - scripts/release-tag.cjs
    - scripts/release-tag.test.cjs
    - CLAUDE.md
    - CHANGELOG.md
    - plugins/aoforge-stack-flutter/CHANGELOG.md
    - plugins/aoforge-stack-web/CHANGELOG.md
    - plugins/aoforge/hooks/changelog-on-tag.test.js
decisions:
  - "Sonnet 5.5 cache hits are priced at 0.05x input (0.1 per MTok), per the pricing page read 2026-10-16"
  - "The release dry run pushes a lightweight aoforge--v0.0.0-dryrun-<run id> tag at HEAD and never calls gh"
  - "Tag rulesets are matched locally (GitHub has no rules-for-a-tag endpoint); tag-rules.cjs only runs GETs"
metrics:
  duration: 16min
  completed: 2026-10-16
---

# Quick 37: Sonnet 5.5 cache rate, release dates, release tag permissions and dry run Summary

Sonnet 5.5 cache hits are now priced at the published $0.10 per million (0.05x input), and a test holds every rate to
the pricing page's multipliers. The user's calibration.json was rebuilt with those rates. release.yml gains explicit
`contents: write` permissions and a `workflow_dispatch` dry run that pushes a throwaway tag, checks it on origin and
deletes it. A read-only `scripts/tag-rules.cjs` lists the tag rulesets that apply. 3.1.0 and the stack packs' 1.0.0
are dated 2026-10-16.

## Progress
- [x] Task 1: Sonnet 5.5 cache-hit rate, multiplier test, recalibrate — RED 236dcf91, GREEN cd6bbbc5
- [x] Task 2: release.yml permissions and dispatch dry run, runDryRun, tag-rules inspector — RED 1cfa11ac, GREEN bea4d66b
- [x] Task 3: date 3.1.0 and the packs' 1.0.0, quick 37 CHANGELOG entry, gate proof — RED 50e46057, GREEN 51c29758

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | 236dcf91 | test(rates): cache-hit and cache-write multipliers from the pricing page (RED) |
| 2 | cd6bbbc5 | fix(rates): Sonnet 5.5 cache hits are 0.05x input; rates re-read 2026-10-16 |
| 3 | 1cfa11ac | test(release): dispatch dry run, explicit permissions and a tag ruleset inspector (RED) |
| 4 | bea4d66b | feat(release): workflow_dispatch dry run for the tag push, explicit permissions, tag-rules inspector |
| 5 | 50e46057 | test(release): 3.1.0 and pack 1.0.0 headings are dated; the gate passes every release tag (RED) |
| 6 | 51c29758 | docs(release): date 3.1.0 and the packs' 1.0.0; quick 37 changelog |

All six went through `aof-tools commit` (worktree `fix/post-77-verification`, base 03901bc8). Nothing was pushed.

## Test totals

Full suite, HOME = `<scratch>/q37/home`, the npm test globs minus `watcher-shell.test.cjs`
(`<scratch>/q37/run-suite.sh`):

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline at 03901bc8 | 12074 | 12044 | 0 | 30 |
| Final at 51c29758 | 12097 | 12068 | 0 | 29 |

tests +23, exactly the cases added here. pass +24 and skipped -1 because one environment-dependent test changed path:
MA-7 (`doctl auth init with unset DIGITALOCEAN_TOKEN`, the handoff e2e suite) skipped at baseline as its
"architectural gap" branch and passed in the final run. It picks its branch from doctl's runtime behaviour and does not
touch any file changed here (STATE.md already records MA-7 as environment-dependent). Logs:
`<scratch>/q37/baseline.log`, `<scratch>/q37/final.log`.

Per file (tests/fail/skipped):

| File | 03901bc8 | Final | Added |
|---|---|---|---|
| calibration-inputs.test.cjs | 96/0/0 | 101/0/0 | +5 (cases 1-5) |
| calibrator.test.cjs | 75/0/0 | 75/0/0 | 0 (one expectation changed) |
| estimate-cli.test.cjs | 83/0/0 | 83/0/0 | 0 |
| estimate-backtest.test.cjs | 47/0/0 | 47/0/0 | 0 |
| model-currency.test.cjs | 13/0/0 | 13/0/0 | 0 |
| release-tag.test.cjs | 18/0/0 | 28/0/0 | +10 (cases 6-15) |
| tag-rules.test.cjs | absent | 6/0/0 | +6 (cases 16, 17, 18 x4) |
| workflow-permissions.test.cjs | 4/0/0 | 4/0/0 | 0 |
| changelog-on-tag.test.js | 30/0/0 | 32/0/0 | +2 (cases 19, 20) |
| stack-packs.test.cjs | 32/0/0 | 32/0/0 | 0 |
| changelog.test.cjs | 7/0/0 | 7/0/0 | 0 |

## RED failures

Task 1 (`calibration-inputs.test.cjs`, describe `shipped rates follow the pricing page (quick 37)`):
- 1: `claude-sonnet-5-5.cache_read is 0.2, expected 0.1 (0.05x of input 2)`
- 4: deepStrictEqual, actual `cache_read: 0.2`, expected `cache_read: 0.1`
- 5: `no _comment line names Opus 5.5 and Sonnet 5.5 with 0.05x`
- 2 and 3 passed (guards), as planned.

Task 2 (`release-tag.test.cjs`, `tag-rules.test.cjs`); the 18 existing release-tag cases passed throughout:
- 6: `top-level block must be exactly "permissions:" / "  contents: write"`
- 7: `on: has workflow_dispatch`
- 8: `load(...).runDryRun is not a function`; 9-13 fail on the same missing export (their message predicates see the
  TypeError)
- 14: `dryRunTag is not a function`
- 15: `release-tag: "--dry-run" is not a release tag: expected vX.Y.Z or <plugin>--vX.Y.Z` (no run id message)
- 16, 17, 18 (x4): `Cannot find module './tag-rules.cjs'`

Task 3 (`changelog-on-tag.test.js`, describe `this repository: release tags pass the gate (quick 37)`):
- 20: `CHANGELOG.md: ## [3.1.0] - Unreleased` (expected `## [3.1.0] - 2026-10-16`)
- 19 passed (guard), as planned.

## Task 1: pricing and recalibration

**Pricing page.** No WebFetch tool was available, so the page was fetched read-only with `curl` into
`<scratch>/q37/pricing.html` (HTTP 200) and its rendered tables were extracted with a scratch script. Every row of the
planner's table matched: Fable 5.1 10 / 12.5 / 20 / 0.25 / 50; Opus 5.5 4 / 5 / 8 / 0.20 / 20; Opus 5 and Opus 4.8
5 / 6.25 / 10 / 0.50 / 25; Sonnet 5.5 2 / 2.50 / 4 / **0.10** / 10; Sonnet 5 2 / 2.50 / 4 / 0.20 / 10; Haiku 5.5 (up to
100K) 0.10 / 0.125 / 0.20 / 0.01 / 0.50, over 100K 0.50 / 0.625 / 1 / 0.05 / 2.50; Haiku 4.5 1 / 1.25 / 2 / 0.10 / 5.
Notes read verbatim: "Cache hits and refreshes on Claude Opus 5.5 and Claude Sonnet 5.5 are priced at 0.05x the base
input price.", "Cache hits and refreshes on Claude Fable 5.1 and Claude Mythos 5.1 are priced at 0.025x the base input
price.", "All other models use the standard 0.1x multiplier."

**Rates file (D1).** Only `claude-sonnet-5-5.cache_read` changed value (0.2 to 0.1). Every `as_of` is 2026-10-16, the
`_comment` cache line names Opus 5.5 and Sonnet 5.5 (0.05x) and Fable 5.1 (0.025x) plus the 1.25x / 2x write rule,
and the Haiku 5.5 note gives the full over-100K row. No model id was added.

**Backup.** `/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/calibration.backup.json`,
sha256 `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`, identical to the pre-write
`~/.claude/aoforge/calibration.json`.

**Dry run** (`calibrate --paths /Users/justin/dev/aoforge-claude --minutes trd_level --window 10 --through 66 --dry-run`,
repo copy of aof-tools): samples `{trds: 75, tasks: 177, with_tokens: 72}`; window `57-estimation-data-foundation` to
`66-executor-token-stamp` (10 kept, 52 dropped, 384 TRDs dropped); method `{minutes: trd_level, window_objectives: 10,
through_objective: 66}`; `unpriced_models: []`; overhead `{spawns: 579, matched: 16, foreign: 519, quick: 44}`. It matched
the gate, so the real write went ahead.

**Write.** `calibrate` with the same flags wrote `~/.claude/aoforge/calibration.json` (sha256
`8bf5e34e3784ac8a312f236c360e45ee81994e21bd0cf4e83c74882b6ee9ba59`), byte-identical (`cmp`) to
`<scratch>/calibration.newrates.json`. It has `models['claude-sonnet-5-5'].cache_read === 0.1` and
`rates_as_of === '2026-10-16'`, version 3, method trd_level/10/66.

**Comparison** (`node <scratch>/compare-calibration.cjs`). Drift = backup (built 2026-10-08) to today with the old
rates; price effect = today with the old rates to today with the new rates. Cost in USD, p50 / p90.

| Stat | backup | today, old rates | today, new rates | drift | price effect |
|---|---|---|---|---|---|
| trd_level | 3.0198 / 5.3949 | 3.0198 / 5.3949 | 2.1375 / 4.0386 | 0.0% / 0.0% | -29.2% / -25.1% |
| objective_level | 23.8786 / 45.7525 | 23.8786 / 45.7525 | 16.7875 / 36.4292 | 0.0% / 0.0% | -29.7% / -20.4% |
| task_classes.all | 1.3056 / 2.1484 | 1.3056 / 2.1484 | 0.8938 / 1.6833 | 0.0% / 0.0% | -31.5% / -21.6% |
| task_classes.code | 1.2176 / 1.9833 | 1.2176 / 1.9833 | 0.8459 / 1.2156 | 0.0% / 0.0% | -30.5% / -38.7% |
| task_classes.code_tdd | 1.2705 / 2.004 | 1.2705 / 2.004 | 0.9001 / 1.5743 | 0.0% / 0.0% | -29.2% / -21.4% |
| task_classes.config | 0.9185 / 1.7944 | 0.9185 / 1.7944 | 0.6531 / 1.7944 | 0.0% / 0.0% | -28.9% / 0.0% |
| task_classes.doc | 0.9203 / 1.7983 | 0.9203 / 1.7983 | 0.6344 / 1.5546 | 0.0% / 0.0% | -31.1% / -13.6% |
| task_classes.doc_tdd | 2.1772 / 2.1772 | 2.1772 / 2.1772 | 1.7077 / 1.7077 | 0.0% / 0.0% | -21.6% / -21.6% |
| task_classes.other | 1.3206 / 1.9833 | 1.3206 / 1.9833 | 0.8938 / 1.5546 | 0.0% / 0.0% | -32.3% / -21.6% |
| task_classes.prompt | 2.7772 / 2.9938 | 2.7772 / 2.9938 | 1.7269 / 1.973 | 0.0% / 0.0% | -37.8% / -34.1% |
| task_classes.prompt_tdd | 1.3185 / 2.1484 | 1.3185 / 2.1484 | 0.891 / 2.1484 | 0.0% / 0.0% | -32.4% / 0.0% |
| task_classes.test | 1.1804 / 2.004 | 1.1804 / 2.004 | 0.8022 / 1.3615 | 0.0% / 0.0% | -32.0% / -32.1% |
| task_classes.test_tdd | 1.8401 / 2.7772 | 1.8401 / 2.7772 | 1.2199 / 1.7269 | 0.0% / 0.0% | -33.7% / -37.8% |
| agent_overhead.integration-checker | 0.2859 / 1.5718 | - / - | - / - | no samples today | - |
| agent_overhead.job-checker | 0.213 / 1.5977 | 0.2692 / 1.7978 | 0.2503 / 1.7978 | +26.4% / +12.5% | -7.0% / 0.0% |
| agent_overhead.objective-researcher | 1.8358 / 3.2655 | - / - | - / - | no samples today | - |
| agent_overhead.planner | 6.8052 / 11.2531 | 6.8667 / 15.5691 | 6.8667 / 15.5691 | +0.9% / +38.4% | 0.0% / 0.0% |
| agent_overhead.roadmapper | 0.3153 / 0.4854 | - / - | - / - | no samples today | - |
| agent_overhead.verifier | 0.4414 / 1.7374 | 0.3743 / 2.7308 | 0.3097 / 2.7308 | -15.2% / +57.2% | -17.3% / 0.0% |

The script's assertions passed: `samples` and every non-cost stat (minutes, tokens_input, tokens_output, files, tasks,
trds) are equal across all three builds for trd_level, objective_level and every task class. So for the executor
statistics the whole change is the price effect: the TRD-level cost falls 29.2% at p50 and 25.1% at p90, and
objective-level 29.7% / 20.4%. Executors run mostly on Sonnet 5.5 and most of their tokens are cache reads, which is
why halving that one rate moves the totals this much. Top-level keys that differ between the old- and new-rate builds:
agent_overhead, inputs_digest, models, objective_level, task_classes, trd_level (prices only).

**Drift, backup to today (not a price change).** The project source is now named `aoforge-claude` (the backup carries
the pre-rename project name), the notes name AOForge, and `rates_as_of` is 2026-10-16 even with the old rates file
(its Haiku 5.5 entry was already dated 2026-10-16). Executor samples and statistics are unchanged. **agent_overhead
changed a lot more than the plan expected:**

| agent | backup samples | today |
|---|---|---|
| integration-checker | 5 | 0 |
| job-checker | 32 | 5 |
| objective-researcher | 11 | 0 |
| planner | 36 | 6 |
| roadmapper | 2 | 0 |
| verifier | 41 | 5 |

agent_overhead_sources: backup `{spawns: 513, matched: 127, foreign: 347, quick: 39}`, today
`{spawns: 579, matched: 16, foreign: 519, quick: 44}`. The cause is the rename. `agent-overhead.cjs` assigns a spawn to a
repository by its REPO_ROOT line, its cwd or a `<repo>/.aoforge/` path, and the spawns recorded before the rename name
the pre-rename checkout path and planning directory. So 111 earlier spawns now count as foreign. The plan let
agent_overhead differ ("Agent overhead may differ between the backup and today") and the gate assertions passed, so the
real file was written. The effect on the user's estimates: `estimate objective` still has planner, job-checker and
verifier overhead, with 5 to 6 samples each instead of 32 to 41 (lower confidence). `estimate milestone` reads
`integration-checker` overhead, which now has no samples, so it leaves that overhead out and says so. To go back to
the 2026-10-08 file:
`cp /private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/calibration.backup.json ~/.claude/aoforge/calibration.json`
(then `shasum -a 256` should print `f4d1ffa9...8134`). That restores the old overhead samples but also the old
Sonnet 5.5 price.

## Task 2: release workflow

- release.yml: top-level `permissions:` / `  contents: write` after `on:`, the job keeps its own block, no other write
  scope. `workflow_dispatch` input `dry_run` (boolean, default true). `Create release` runs only on `push`;
  `Dry run (tag push check)` runs only on `workflow_dispatch`, exits 1 when `dry_run` is false, and runs
  `node scripts/release-tag.cjs --dry-run "$RUN_ID"`. `${{ }}` appears only on env lines (48 `GH_TOKEN`, 59 `DRY_RUN`,
  60 `RUN_ID`); no `run:` block contains `${{`. The header documents the dispatch path, the GITHUB_TOKEN note (D5) and
  the tag-rules command.
- release-tag.cjs: `DRY_RUN_TAG_RE` checked before `PLUGIN_TAG_RE`; `dryRunTag(core, runId)`; parseTag adds `dry_run`
  only for a dry-run tag; planTag gives kind `dry-run` and refuses a non-core prefix; runRelease skips a dry-run tag
  with zero exec calls; `runDryRun` makes exactly the eight D3 calls, never calls gh, validates the run id
  (`/^\d{1,20}$/`) before any exec call, refuses a tag already on origin, always deletes what it pushed and removes the
  local tag, and throws with `git push origin --delete refs/tags/<tag>` when the delete fails. CLI: `--dry-run <run_id>`.
- tag-rules.cjs: CommonJS, sync, no dependencies, injected exec. Only `gh api <path>` GETs: one list call
  (`targets=tag&includes_parents=true&per_page=100`) and one detail call per ruleset; `{owner}/{repo}` literal without
  `--repo`. fnmatch matching (`*`, `**`, `?`, bracket classes, `~ALL`, `~DEFAULT_BRANCH` never for tags), exclude wins,
  disabled and branch rulesets dropped, evaluate kept; text and `--json` output.
- CLAUDE.md Publishing: one sentence on the dispatch dry run and `tag-rules.cjs`.

**tag-rules evidence** (`gh auth status` ok, account justindonnaruma; read-only GETs only):

```
$ node scripts/tag-rules.cjs --repo AO-Cyber-Systems/aoforge-claude aoforge--v3.1.0 aoforge--v0.0.0-dryrun-1 v3.1.0 aoforge-stack-flutter--v1.0.0
0 tag ruleset(s) read from AO-Cyber-Systems/aoforge-claude (inherited ones included)
aoforge--v3.1.0 (refs/tags/aoforge--v3.1.0):
  no tag ruleset matches
aoforge--v0.0.0-dryrun-1 (refs/tags/aoforge--v0.0.0-dryrun-1):
  no tag ruleset matches
v3.1.0 (refs/tags/v3.1.0):
  no tag ruleset matches
aoforge-stack-flutter--v1.0.0 (refs/tags/aoforge-stack-flutter--v1.0.0):
  no tag ruleset matches
```

To rule out a visibility gap, one unfiltered read-only listing
(`gh api 'repos/AO-Cyber-Systems/aoforge-claude/rulesets?includes_parents=true&per_page=100'`) returned two rulesets,
neither with target tag: 11490149 "Private Repos" (target `repository`, Organization, active) and 24829006
"aoforge: default branch" (target `branch`, Repository, active). So no ruleset restricts creating or deleting
`aoforge--v*` tags today, and the dry run should be able to push and delete its tag.

## Task 3: release dates

`## [3.1.0] - 2026-10-16` (CHANGELOG.md:9), `## [1.0.0] - 2026-10-16` in both pack CHANGELOGs (line 5). The empty
`## [Unreleased]` stays. `### Pricing and release workflow (quick 37)` sits after the quick 36 block and before the
objective 76/77 block; quick 34, 35, 36 and 37 headings are all under 3.1.0. `changelog check 3.1.0` and
`changelog check v3.1.0` both print `{ok: true, version: "3.1.0", present: true}`. Case 19 runs the gate hook on the
working tree for `v3.1.0`, `aoforge--v3.1.0`, `aoforge-stack-flutter--v1.0.0` and `aoforge-stack-web--v1.0.0`: none is
denied.

## Task Evidence

| Task | Verify command | Exit | Status |
|---|---|---|---|
| 1 | `node --test` calibration-inputs, calibrator, estimate-cli, estimate-backtest, model-currency | 0 | PASS (101, 75, 83, 47, 13) |
| 1 | `node -e` on `~/.claude/aoforge/calibration.json`: Sonnet 5.5 cache_read | 0 | PASS (0.1) |
| 2 | `node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs scripts/workflow-permissions.test.cjs` | 0 | PASS (28, 6, 4) |
| 2 | `rg -n '\$\{\{' .github/workflows/release.yml` | 0 | PASS (env lines 48, 59, 60 only) |
| 3 | `node --test` changelog-on-tag, release-tag, stack-packs, changelog (+ doc-refs, rename-guard) | 0 | PASS (32, 28, 32, 7) |
| 3 | `rg -n '^## \[(3\.1\.0\|1\.0\.0)\]'` on the three CHANGELOGs | 0 | PASS (three dated headings) |

## Validation Gate Results

| Gate | Command | Exit | Status |
|---|---|---|---|
| test (full) | `<scratch>/q37/run-suite.sh` (npm test globs minus watcher-shell, HOME = scratch) | 0 | PASS (12097 tests, 0 fail) |
| test (repo guards) | `node --test` flag-spec, context-budget, rename-guard, doc-refs repo tests after the CLAUDE.md and CHANGELOG edits | 0 | PASS |

## Existing test expectations changed

- `calibrator.test.cjs` > `58-03 agent_overhead in calibration v2` > `8: the planner and verifier spawns are measured
  and priced per model`: `verifier.cost_usd.p50` 0.0203 to **0.0183**. The fixture's verifier spawn is Sonnet 5.5
  with 3 input, 500 cache writes, 20000 cache hits and 1500 output tokens: 3 x 2 + 500 x 2.5 + 20000 x 0.1 + 1500 x 10
  = 18256 per MTok = $0.0183 (it was 20256 = $0.0203 at the 0.2 rate). A comment in the test now shows the sum. This
  is the case `error_recovery` anticipated.

## Deviations from Plan

1. **[Rule 1 - error_recovery] calibrator.test.cjs updated in the Task 1 GREEN commit.** Not in `files_modified`; the
   hard-coded Sonnet 5.5 cost was computed from the 0.2 rate (see above). Commit cd6bbbc5.
2. **[Rule 1 - Test defect] tag-rules.test.cjs fixed in the Task 2 GREEN commit.** The `{owner}/{repo}` case used
   `v9.9.9`, which does match the fixture's `refs/tags/v*` ruleset, while asserting "no tag ruleset matches". The tag is
   now `other-1` and the case also checks the call count. The implementation was right. Commit bea4d66b.
3. **Test list case 2 scoped before the RED commit.** As first written it also checked the two 0.05x models, so it
   failed on Sonnet 5.5 too; the plan says case 2 covers Fable 5.1 and the 0.1x models and passes already. It now
   skips the 0.05x ids, which case 1 owns.
4. **Pricing page read with curl, not WebFetch** (no WebFetch tool in this session). Read-only GET, saved under the
   scratchpad, tables extracted by a scratch script.
5. **agent_overhead drift larger than expected** (documented above). Not a code deviation: the plan's gate passed and
   the write went ahead, but the user may want to restore the backup or follow up on overhead matching.

## Follow-ups

- **The installed mirror still has the old rate.** `~/.claude/aoforge/references/model-rates.json` (the runtime the
  installed 3.0.0 plugin mirrors; read-only check: `.plugin-version` 3.0.0, Sonnet 5.5 cache_read 0.2) keeps the
  old price until the next plugin release. Running
  `calibrate` from the installed runtime before then writes the old price back into calibration.json; use the repo
  copy (`node plugins/aoforge/aoforge/bin/aof-tools.cjs calibrate ...`) until 3.1.0 is installed.
- **agent_overhead lost its pre-rename samples.** Spawns recorded under the pre-rename checkout path no longer match
  this repository. Options: a calibrate flag that lets a repository also claim a former path, or carry the mapping in
  `state rekey`. Until then `estimate milestone` omits integration-checker overhead.
- **Dated-heading gate on release tags.** Probably worth it as a small check: the changelog gate passes on a
  `## [X.Y.Z] - Unreleased` heading, so a release could still ship undated. A warning rather than a deny would fit
  (the hook is a hard gate today, and an undated heading is cosmetic). Not added here, per the plan.
- **First dispatch.** With no tag ruleset in place, a `workflow_dispatch` of release.yml with `dry_run: true` should
  pass. It was not dispatched here (no workflow dispatch allowed); it needs the user's go-ahead.

## Post-TRD Verification

- Auto-fix cycles used: 1 (calibrator expectation)
- Must-haves verified: 9/9 (see Self-Check)
- Gate failures: None
- `git log --oneline 03901bc8..HEAD`: 6 commits. `git diff 03901bc8 --stat`: 13 files, the 12 in `files_modified`
  plus calibrator.test.cjs (deviation 1).
- `git tag --list '*dryrun*'`: empty. No push, tag, release, dispatch or GitHub write call was made; the only
  GitHub calls were read-only `gh api` GETs and `gh auth status`.
- Writes under `~/.claude` by this task: `~/.claude/aoforge/calibration.json` only. A `find -newer` check found
  otherwise only harness and hook files (`.claude.json` backups, `skills/synced`, `aoforge/audit.log` route entries,
  `aoforge/state/progress-guard`). `/Users/justin/dev/aoforge-claude` status unchanged (`?? amp`, as before).

## Self-Check: PASSED

- FOUND: scripts/tag-rules.cjs, scripts/tag-rules.test.cjs (created), and the backup
  `<scratch>/calibration.backup.json` (sha256 f4d1ffa9...8134, unchanged since step 1).
- FOUND: commits 236dcf91, cd6bbbc5, 1cfa11ac, bea4d66b, 50e46057, 51c29758 (`git log --oneline 03901bc8..HEAD`).
- `~/.claude/aoforge/calibration.json` sha256 8bf5e34e...ba59, Sonnet 5.5 cache_read 0.1, rates_as_of 2026-10-16.
- Worktree clean apart from untracked planning directories (`.planning/quick/37-...`, which holds the JOB, and
  `.planning/quick/38-...`, which the orchestrator created).
- Full suite 12097 tests, 0 fail. No push, tag, release or dispatch.

## Orchestrator note (2026-10-16)

The recalibrated `~/.claude/aoforge/calibration.json` was rolled back to the backup (sha256 f4d1ffa9…). Agent-overhead
samples fell from 127 to 16 matched spawns. A dry run at v3.0.0 (b4a9d870) gives the same 16, so this branch did not
cause it: since the rename, overhead spawns recorded before it no longer match the repository. Recalibrate after that
matcher is fixed; until then the stored calibration keeps the old Sonnet 5.5 cache-read rate.
