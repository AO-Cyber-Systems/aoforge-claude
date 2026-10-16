---
objective: quick-37
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/references/model-rates.json
  - plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs
  - .github/workflows/release.yml
  - scripts/release-tag.cjs
  - scripts/release-tag.test.cjs
  - scripts/tag-rules.cjs
  - scripts/tag-rules.test.cjs
  - CLAUDE.md
  - CHANGELOG.md
  - plugins/aoforge-stack-flutter/CHANGELOG.md
  - plugins/aoforge-stack-web/CHANGELOG.md
  - plugins/aoforge/hooks/changelog-on-tag.test.js
autonomous: true
must_haves:
  truths:
    - "model-rates.json prices claude-sonnet-5-5 cache_read at 0.1 (0.05x of input 2), and every entry carries as_of 2026-10-16 after being checked against https://platform.claude.com/docs/en/about-claude/pricing. The `_comment` names Opus 5.5 and Sonnet 5.5 as the 0.05x models and Fable 5.1 as 0.025x. A test fails if any entry breaks the page's multipliers: cache hits 0.05x for Opus 5.5 and Sonnet 5.5, 0.025x for Fable 5.1 and 0.1x for every other model; 5-minute writes 1.25x and 1-hour writes 2x of input"
    - "~/.claude/aoforge/calibration.json is rebuilt from the repo copy of aof-tools with `--minutes trd_level --window 10 --through 66 --paths /Users/justin/dev/aoforge-claude`. It is rebuilt only after a byte-identical backup exists at <scratch>/calibration.backup.json and a --dry-run reports 75 TRDs, 177 tasks and 72 with tokens. Its minutes, tokens and sample counts for task_classes, trd_level and objective_level are unchanged; its cost_usd figures and claude-sonnet-5-5 rate are the new ones"
    - "The SUMMARY lists old and new dollar p50/p90 for trd_level, objective_level, every task class and every agent_overhead agent. It separates the price effect (same inputs, old rates against new rates) from drift since 2026-10-08 (transcripts added since then, the project renamed)"
    - "release.yml declares `permissions: contents: write` at the top level and in its job. It has a `workflow_dispatch` input `dry_run` (boolean, default true). A dispatch runs only the dry-run step: `node scripts/release-tag.cjs --dry-run \"$RUN_ID\"` pushes `aoforge--v0.0.0-dryrun-<run_id>` at HEAD, confirms that origin shows it at that commit, deletes it and creates no release. A tag push runs only the release step. No run: block contains `${{`"
    - "runDryRun never calls gh. It refuses a malformed run id and a dry-run tag that already exists on origin before any push. It deletes what it pushed even when verification fails. When the delete fails it throws, naming the leftover tag and the exact cleanup command. A push-triggered run on a dry-run tag is a skip with zero exec calls"
    - "release.yml and release-tag.cjs both state that a tag pushed with GITHUB_TOKEN starts no workflow and that no release path depends on one doing so: the alias needs no run, pack tags are pushed by a person, and no other workflow triggers on tags"
    - "`node scripts/tag-rules.cjs [--repo o/r] [--json] <tag>...` lists the tag-target rulesets, including inherited ones, whose ref_name conditions match each tag, with enforcement, rule types and bypass. It only ever runs `gh api` GET calls, which a test asserts"
    - "CHANGELOG.md reads `## [3.1.0] - 2026-10-16`, and both pack CHANGELOGs read `## [1.0.0] - 2026-10-16`. The 3.1.0 section has quick 34, 35, 36 and 37 headings. `changelog check 3.1.0` is ok. The changelog-on-tag gate allows `git tag -a` for v3.1.0, aoforge--v3.1.0, aoforge-stack-flutter--v1.0.0 and aoforge-stack-web--v1.0.0 against the working tree, and a repo test proves it"
    - "`npm test` has 0 failures compared with the baseline at 03901bc8. Nothing is pushed, tagged, released or dispatched, and no GitHub write API is called. The only write under ~/.claude is calibration.json, and nothing under /Users/justin/dev/aoforge-claude is written"
  artifacts:
    - path: plugins/aoforge/aoforge/references/model-rates.json
      provides: "claude-sonnet-5-5 cache_read 0.1; every as_of 2026-10-16; corrected _comment"
    - path: plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs
      provides: "describe 'shipped rates follow the pricing page (quick 37)': multiplier rules for every entry, exact Sonnet 5.5 row, comment names Sonnet 5.5"
    - path: scripts/release-tag.cjs
      provides: "dryRunTag(core, runId), runDryRun(runId, {root, exec, log}), the dry-run tag kind in parseTag/planTag/runRelease, and the `--dry-run <run_id>` CLI form"
      exports: ["parseTag", "planTag", "releaseNotes", "runRelease", "runDryRun", "dryRunTag"]
    - path: scripts/tag-rules.cjs
      provides: "read-only tag ruleset inspector: refMatches(ref, pattern), matchingRulesets(tag, rulesets), run(argv, {exec})"
      exports: ["refMatches", "matchingRulesets", "run"]
    - path: .github/workflows/release.yml
      provides: "top-level + job contents: write; workflow_dispatch dry_run input; push-only release step; dispatch-only dry-run step"
  key_links:
    - from: ".github/workflows/release.yml dry-run step"
      to: "scripts/release-tag.cjs runDryRun"
      via: "`node scripts/release-tag.cjs --dry-run \"$RUN_ID\"` with RUN_ID and DRY_RUN passed through env"
    - from: "aof-tools calibrate (repo copy)"
      to: "references/model-rates.json -> ~/.claude/aoforge/calibration.json models + cost_usd"
      via: "default --rates is the shipped file next to the running aof-tools"
    - from: "hooks/changelog-on-tag.js"
      to: "CHANGELOG.md and plugins/<pack>/CHANGELOG.md `## [X.Y.Z]` headings"
      via: "core and pack tag checks; the repo test runs the hook against the working tree"
---

# Quick 37: Sonnet 5.5 cache rate, release dates, release tag permissions and dry run

## Objective

Three user decisions, implemented in the worktree
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
(branch `fix/post-77-verification`, HEAD 03901bc8). This root is `<repo>` below; work only there. Its planning tree is
the legacy planning directory (`.planning/`). Run aof-tools as
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`. `<scratch>` is
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad`.

**Never write under `/Users/justin/dev/aoforge-claude`.** Task 1 reads it as calibration input, and that is all.
**No push, tag, release, workflow dispatch or GitHub write API call.** The only write outside `<repo>` and
`<scratch>` is `~/.claude/aoforge/calibration.json` in Task 1, which the user approved.

Purpose: the estimate's dollar figures are off for Sonnet 5.5 cache hits, 3.1.0 and the packs have no release date,
and the release workflow's tag push has never been exercised before a real release.

Task order: Task 1 is pricing (item 1). Task 2 is the release tag push (item 3). Task 3 is the release dates (item 2),
done last so that its CHANGELOG entry can record Task 1's numbers and Task 2's behaviour.

## Locked decisions

User decisions (already made; do not re-ask):

1. **Pricing: fix and recalibrate.** The planner read the official page on 2026-10-16. Only one shipped value is
   wrong: `claude-sonnet-5-5.cache_read` is 0.2 and must be **0.1**. Footnote 2: "Cache hits and refreshes on Claude
   Opus 5.5 and Claude Sonnet 5.5 are priced at 0.05x the base input price". Footnote 1 puts Fable 5.1 (and Mythos
   5.1) at 0.025x, and "All other models use the standard 0.1x multiplier". The page values for the ids in the file
   are below. Every other entry matches; the executor re-reads the page and confirms before editing.

   | id | input | 5m write | 1h write | cache hit | output |
   |---|---|---|---|---|---|
   | claude-fable-5-1 | 10 | 12.5 | 20 | 0.25 | 50 |
   | claude-opus-5-5 | 4 | 5 | 8 | 0.2 | 20 |
   | claude-opus-5 | 5 | 6.25 | 10 | 0.5 | 25 |
   | claude-opus-4-8 | 5 | 6.25 | 10 | 0.5 | 25 |
   | claude-sonnet-5-5 | 2 | 2.5 | 4 | **0.1** | 10 |
   | claude-sonnet-5 | 2 | 2.5 | 4 | 0.2 | 10 |
   | claude-haiku-5-5 (prompts up to 100K) | 0.1 | 0.125 | 0.2 | 0.01 | 0.5 |
   | claude-haiku-4-5-20251001 | 1 | 1.25 | 2 | 0.1 | 5 |

   Haiku 5.5 over 100K: 0.50 input, 0.625 / 1 writes, 0.05 cache hit, 2.50 output (note text only). Recalibrate with
   the existing method (DECISION-003: `trd_level`, window 10, through 66) so that only the prices change, and back up
   the real calibration.json to `<scratch>/calibration.backup.json` first.
2. **Release dates: date now.** `## [3.1.0] - 2026-10-16` in CHANGELOG.md, and `## [1.0.0] - 2026-10-16` in
   plugins/aoforge-stack-flutter/CHANGELOG.md and plugins/aoforge-stack-web/CHANGELOG.md. `changelog check 3.1.0`
   and the changelog-on-tag gate must still pass for `v3.1.0`, `aoforge--v3.1.0` and both pack tags. Add the quick
   34-37 entries under 3.1.0 if any is missing (34, 35 and 36 are present; 37 is this task).
3. **Release tag push: dry run plus explicit permissions.** Add an explicit `permissions: contents: write`, and a
   `workflow_dispatch` input `dry_run` that pushes a throwaway tag, verifies it, deletes it and creates no release.
   Unit-test the dry-run path with the fake runner. Add a read-only way to inspect the rules that apply to tags.

Derived design (planner):

- **D1 rates file.** Change only `claude-sonnet-5-5.cache_read` (0.2 to 0.1). Set every entry's `as_of` to
  `2026-10-16`, because every entry was re-read against the page today. Rewrite `_comment` line 7 to: `Cache hits
  cost 0.1x input, except Opus 5.5 and Sonnet 5.5 (0.05x) and Fable 5.1 (0.025x). Cache writes cost 1.25x (5 minutes)
  and 2x (1 hour) input. A [1m] id suffix is priced at standard rates.` Set the Haiku 5.5 `note` to the full
  over-100K row. Add no new model ids: the file lists only ids seen in transcripts.
- **D2 recalibration.** Use the repo copy of aof-tools with
  `FLAGS = --paths /Users/justin/dev/aoforge-claude --minutes trd_level --window 10 --through 66`. The planner's probe
  (`--no-overhead --dry-run`) found the same 75 TRDs, 177 tasks and 72 with tokens, window 57 to 66, as the
  2026-10-08 file. Two differences are expected and are not price changes: the project is now named
  `aoforge-claude`, and agent_overhead rescans `~/.claude/projects`, which neither the window nor the cutoff limits
  and which has gained transcripts. Attribute every change by building twice on today's inputs, once with the old
  rates and once with the new.
- **D3 dry-run tag** `aoforge--v0.0.0-dryrun-<run_id>` (core name from plugins/aoforge plugin.json). It matches the
  alias's prefix, so it meets the same tag rulesets the real `aoforge--vX.Y.Z` push meets. It is lightweight, at
  `HEAD`. Call sequence (pinned by test): `git rev-parse HEAD^{commit}`; `git ls-remote --tags origin <ref>` (must
  be empty); `git tag <tag> <sha>`; `git push origin <ref>`; `git ls-remote --tags origin <ref>` (must show
  `<sha>\t<ref>`); `git push origin --delete <ref>`; `git ls-remote --tags origin <ref>` (must be empty);
  `git tag -d <tag>`. It never calls `gh`.
- **D4 workflow shape.** One job, two steps guarded by event: `Create release` has
  `if: github.event_name == 'push'`, and `Dry run (tag push check)` has
  `if: github.event_name == 'workflow_dispatch'`. Keep the job's `permissions: contents: write` and add the same block
  at the top level. `${{ }}` appears only under `env:` and is never inside a `run:` block. A dispatch with
  `dry_run: false` exits 1: "a release starts from a tag push; workflow_dispatch only runs the dry run".
- **D5 GITHUB_TOKEN tags start no workflow.** Nothing depends on one doing so. Only release.yml triggers on tags
  (checked: test, docs, agent-shell-harness, auto-label-issues and aoforge-checks do not). The alias tag needs no run,
  because the core run did the work. Pack tags are pushed by a person, so their push starts release.yml normally. The
  dry-run tag must not start a run; if one ever does, release-tag.cjs skips it. Document this in the release.yml and
  release-tag.cjs headers. No code change is needed for the pack path.
- **D6 tag-rules inspector.** GitHub has no "rules for a tag" endpoint (only
  `GET /repos/{owner}/{repo}/rules/branches/{branch}`). Use `GET repos/<r>/rulesets?targets=tag&includes_parents=true&per_page=100`,
  then `GET repos/<r>/rulesets/<id>` for each result, and match `conditions.ref_name.include/exclude` against
  `refs/tags/<tag>` locally. Without `--repo`, pass the literal `{owner}/{repo}` and gh fills it from the checkout.
- **D7 dates** are data, not logic. A repo test pins the three dated headings, which are historical and never change
  again, and another runs the gate on the working tree for all four tags.

Intent (resolver, kind `plugin`, work `feature`): `tdd: strict` (objective override), `test_list_first: required`,
`fixture_strategy: generators`, which here means the existing hand-built builders (`fixtureRoot`, `fakeExec`) plus
a hand-built `ruleset({...})` builder. Constraints: `no_llm_test_data`, `no_property_based_default` and
`no_gherkin_layer`. Write named `test('...')` cases only. Execution-time habit: one failing test at a time.

## Test list

Outermost first within each task. Every RED case must fail for the stated reason before its GREEN change.

**Task 1: calibration-inputs.test.cjs, `describe('shipped rates follow the pricing page (quick 37)')`.** The test
holds `CACHE_HIT = { 'claude-fable-5-1': 0.025, 'claude-opus-5-5': 0.05, 'claude-sonnet-5-5': 0.05 }` (default 0.1),
with a comment that quotes the two page footnotes and the date 2026-10-16. Compare with `Math.abs(a - b) < 1e-9`,
because 0.1 * 0.1 is not 0.01 in floating point.
1. Opus 5.5 and Sonnet 5.5: `cache_read` is 0.05x `input`. RED: Sonnet 5.5 has 0.2, expected 0.1.
2. Fable 5.1 is 0.025x, and every other entry in `loadRates().models` is 0.1x (the page's "all other models"). This
   passes already and guards the rest.
3. Every entry: `cache_write_5m` is 1.25x `input` and `cache_write_1h` is 2x `input` (passes already).
4. `rateFor(rates, 'claude-sonnet-5-5')` deepEquals
   `{ id, input: 2, output: 10, cache_read: 0.1, cache_write_5m: 2.5, cache_write_1h: 4 }`. RED.
5. The raw file's `_comment` array has a line naming both `Opus 5.5` and `Sonnet 5.5` with `0.05x`. RED.

**Task 2: scripts/release-tag.test.cjs and scripts/tag-rules.test.cjs.**
6. release.yml text: the top-level block is exactly `permissions:` / `  contents: write`, and the job still has its
   own. Every `<scope>: write` line is `contents: write`, and there is no `write-all`. RED: no top-level block.
7. release.yml text: `workflow_dispatch:` with input `dry_run:` of `type: boolean` and `default: true`. The step
   that runs `node scripts/release-tag.cjs "$GITHUB_REF_NAME"` carries `if: github.event_name == 'push'`. A step
   carrying `if: github.event_name == 'workflow_dispatch'` runs `node scripts/release-tag.cjs --dry-run "$RUN_ID"`.
   No run: block contains `${{` at all (stricter than the existing ref_name check). RED.
8. `runDryRun('4242', ...)` happy path: the exact eight calls of D3 in order, no call whose cmd is `gh`, and the
   result `{ action: 'dry-run', tag: 'aoforge--v0.0.0-dryrun-4242', sha: SHA, pushed: true, verified: true, deleted: true }`.
   RED: `runDryRun` is not exported.
9. Push refused (`git push origin <ref>` with status 1 and stderr
   `GH013: Repository rule violations found for refs/tags/aoforge--v0.0.0-dryrun-4242`): it throws, and the message
   names the tag and quotes the stderr. There is no `ls-remote` after the push and no `--delete`, and `git tag -d`
   is still called.
10. Pushed, but the second `ls-remote` is empty (or shows OTHER sha): `--delete`, the third `ls-remote` and
    `git tag -d` still run, then it throws, naming the tag and "did not reach origin" (or both shas).
11. Delete refused (`--delete` status 1): it throws, and the message contains
    `git push origin --delete refs/tags/aoforge--v0.0.0-dryrun-4242`.
12. The tag already exists on origin (first `ls-remote` shows it): it throws, and there is no `git tag`, no push and
    no delete.
13. A run id of `''`, `undefined`, `'abc'`, `'12;rm -rf /'` or `'-1'` throws before any exec call
    (`calls.length === 0`).
14. `parseTag('aoforge--v0.0.0-dryrun-4242')` gives `{ plugin: 'aoforge', version: '0.0.0', dry_run: '4242' }`.
    `planTag` gives kind `dry-run`. `runRelease` returns `action: 'skip'` with zero exec calls.
    `planTag('aoforge-stack-demo--v0.0.0-dryrun-1')` throws, because dry-run tags are core-only. The existing
    parseTag deepEquals for `v3.1.0` and pack tags are unchanged, with no `dry_run` key.
15. CLI: `node scripts/release-tag.cjs --dry-run` with no id, and with `--dry-run abc`, exits 1 from the fixture root
    with stderr naming the run id problem, before any git call.
16. tag-rules `refMatches`: `refs/tags/aoforge--v*` matches `refs/tags/aoforge--v3.1.0` and
    `refs/tags/aoforge--v0.0.0-dryrun-1`. `refs/tags/v*` does not match `refs/tags/aoforge--v3.1.0`. `~ALL` matches
    any tag. `refs/tags/*` does not match `refs/tags/a/b`, while `refs/tags/**` does. `?` matches exactly one
    character. Regex metacharacters in a pattern (`.`, `+`, `(`) are literal.
17. tag-rules `matchingRulesets(tag, rulesets)` over hand-built rulesets: include matches and no exclude matches. An
    exclude match wins. `enforcement: 'disabled'` is dropped. `target: 'branch'` is dropped. `evaluate` is kept and
    labelled. Each hit carries `{ id, name, source_type, source, enforcement, rules: [<type>...],
    current_user_can_bypass, bypass_actors }`.
18. tag-rules `run(['--repo', 'o/r', 'aoforge--v3.1.0'], { exec })` with a fake exec makes the list call with
    `targets=tag` and `includes_parents=true`, then one detail call per listed id. Every call is `['gh', 'api', ...]`
    with none of `-X`, `--method`, `-f`, `-F`, `--field`, `--raw-field` or `--input`. Without `--repo` the paths
    carry the literal `{owner}/{repo}`. A gh failure gives exit 1 with its stderr.

**Task 3: plugins/aoforge/hooks/changelog-on-tag.test.js, `describe('this repository: release tags pass the gate (quick 37)')`.**
19. Core and pack versions are read from package.json and `plugins/aoforge-stack-*/.claude-plugin/plugin.json`. For
    each of `v<core>`, `aoforge--v<core>` and `<pack>--v<packVersion>`, runHook(`git tag -a <tag> -m x`) with cwd at
    the repo root does not deny. This passes before and after; it is a guard.
20. CHANGELOG.md contains `## [3.1.0] - 2026-10-16`, and each pack CHANGELOG contains `## [1.0.0] - 2026-10-16`.
    RED: all three read `Unreleased`.

<embedded_context>
<codebase_examples>
Existing fake runner (scripts/release-tag.test.cjs:56). Extend it so a script entry's result may be an **array**,
consumed one per matching call with the last element repeating. Keep the single-object form working for every
existing test.

```js
function fakeExec(script = []) {
  const calls = [];
  const exec = (cmd, args) => {
    const call = [cmd, ...args];
    calls.push(call);
    for (const [prefix, result] of script) {
      if (prefix.every((p, k) => call[k] === p)) return { status: 0, stdout: '', stderr: '', ...result };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { exec, calls, notes };
}
```

`must(result, what)` in release-tag.cjs throws `${what} failed: <stderr>`. Reuse it. `readPluginJson(root, CORE_DIR)`
gives the core name. The existing step shape in release.yml:

```yaml
      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          git fetch --tags --force --quiet
          node scripts/release-tag.cjs "$GITHUB_REF_NAME"
```

The dry-run step passes values through env, the same way:

```yaml
      - name: Dry run (tag push check)
        if: github.event_name == 'workflow_dispatch'
        env:
          DRY_RUN: ${{ inputs.dry_run }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -euo pipefail
          if [ "$DRY_RUN" != "true" ]; then
            echo "a release starts from a tag push; workflow_dispatch only runs the dry run (dry_run: true)" >&2
            exit 1
          fi
          node scripts/release-tag.cjs --dry-run "$RUN_ID"
```

`runHook(payload, cwd)`, `isDeny(stdout)` and `denyReason(stdout)` already exist in changelog-on-tag.test.js
(line 103 onward). A repo test passes `path.join(__dirname, '..', '..', '..')` as cwd: hooks/ to plugins/aoforge/ to
plugins/ to `<repo>`.

The shipped-file test (calibration-inputs.test.cjs, test 9) already checks the field types and the `as_of` format.
Put the new describe after test 10 and use `ci.loadRates()` / `ci.rateFor()`. Read `_comment` with
`JSON.parse(fs.readFileSync(ci.RATES_PATH))`.
</codebase_examples>

<file_tree>
scripts/
├── release-tag.cjs          ← MODIFY (dryRunTag, runDryRun, dry-run kind, --dry-run CLI, header)
├── release-tag.test.cjs     ← MODIFY (fakeExec arrays, cases 6-15)
├── tag-rules.cjs            ← CREATE (read-only ruleset inspector)
└── tag-rules.test.cjs       ← CREATE (cases 16-18)
.github/workflows/release.yml ← MODIFY
plugins/aoforge/aoforge/references/model-rates.json ← MODIFY
</file_tree>

<anti_patterns>
- Do not run `calibrate` without `--dry-run` or `--out <scratch>/...` until the comparison passes: its default output
  is the real `~/.claude/aoforge/calibration.json`.
- Do not write anything else under `~/.claude`: not `~/.claude/aoforge/references/`, the mirror, and not the
  installed runtime. The installed mirror keeps the old rate until the next plugin release; say so in the SUMMARY.
- Do not run a real `git tag`, `git push`, `gh release`, `gh workflow run` or any `gh api` with
  `-X/--method/-f/-F/--input`. Only `tag-rules.cjs`'s GET calls may reach GitHub (Task 2 evidence step).
- Do not interpolate `${{ ... }}` inside a `run:` block. Pass through `env:`.
- Do not add a CHANGELOG date gate, or change the changelog-on-tag hook's rules. The decision is to date the
  headings, not to add a gate (note it as a follow-up idea in the SUMMARY if you think it is worth it).
- Do not add model ids that are not already in the file, and do not copy any rate from memory: re-read the page.
- Do not write a legacy product name in new code, comments or the CHANGELOG entry; `rename-guard.repo.test.cjs`
  fails CI on it. Call the old calibration project "the pre-rename project name".
</anti_patterns>

<error_recovery>
- A calibrator, estimate or backtest test fails after the rate change: if it hard-codes a Sonnet 5.5 dollar figure
  computed from 0.2, recompute the expectation from the page rate and record the test name and old/new value in the
  SUMMARY. If it fails for any other reason, stop and report.
- The `--dry-run` sample counts differ from 75/177/72 or the window is not 57 to 66: do not write the real file.
  Leave `<scratch>/calibration.newrates.json` and report the difference.
- The real write turns out wrong: restore it with `cp <scratch>/calibration.backup.json ~/.claude/aoforge/calibration.json`
  and confirm with `shasum -a 256`.
- `gh auth status` fails, or tag-rules gets a 403/404: record that as evidence. A 404 on rulesets usually means the
  token cannot read them. Do not retry with other credentials.
</error_recovery>

<gotchas>
- `aof-tools stack command test --files <list>` puts source files on the `node --test` line. `node --test
  scripts/release-tag.cjs` runs the CLI with no tag and exits 1. Scope test runs to `*.test.*` files only.
- `TAG_RE` in hooks/changelog-on-tag.js matches `git tag ... aoforge--v0.0.0` inside a dry-run tag name, so a typed
  `git tag aoforge--v0.0.0-dryrun-*` would be gated. Nothing here runs one; tests use the fake exec.
- `PLUGIN_TAG_RE` ends in `$`, so the dry-run tag parses as nothing today. Check `DRY_RUN_TAG_RE`
  (`/^([a-z][a-z0-9-]*)--v0\.0\.0-dryrun-(\d+)$/`) first in `parseTag`, and add `dry_run` only to that result.
- `inputs.dry_run` arrives in env as the string `true` or `false`.
- On workflow_dispatch, `GITHUB_REF_NAME` is the branch name, so the release step must be push-only.
- `actions/checkout` persists the GITHUB_TOKEN credential, which the dry run's `git push` uses. A lightweight tag
  needs no git identity.
- A ruleset that restricts deletion of `aoforge--v*` would leave the dry-run tag behind. Case 11's message must give
  the manual cleanup, and the release.yml comment must say to run `node scripts/tag-rules.cjs aoforge--v0.0.0-dryrun-1`
  first.
- GitHub ruleset patterns are fnmatch: `*` stops at `/`, `**` crosses it, `~ALL` is everything (`~DEFAULT_BRANCH` is
  branch-only, so it never matches a tag). `bypass_actors` is returned only when the caller can edit the ruleset;
  print `not visible` otherwise. The GitHub Actions app usually shows as `Integration` actor 15368; mention that in the
  header comment as "check in the ruleset UI".
- The `_comment` array and the Haiku 5.5 entry use different formatting (multi-line). Keep the file valid JSON and keep
  the other entries one line each.
- In a linked worktree `.git` is a file; the hook's `findRepoRoot` uses `existsSync`, so the repo test works.
</gotchas>
</embedded_context>

<validation_gates>
- task: `npm test` (`aof-tools stack command test`; `gates.task: [test]`). Scoped form: `node --test <test files>`.
- Per-file baselines at 03901bc8 (tests/fail/skipped): calibration-inputs 96/0/0, calibrator 75/0/0,
  estimate-cli 83/0/0, estimate-backtest 47/0/0, model-currency 13/0/0, release-tag 18/0/0,
  workflow-permissions 4/0/0, changelog-on-tag 30/0/0, stack-packs 32/0/0, changelog 7/0/0.
- Before Task 1, run `npm test` once at 03901bc8 and record tests/pass/fail/skipped as the baseline.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sonnet 5.5 cache-hit rate, a test for the page multipliers, then recalibrate</name>
  <files>plugins/aoforge/aoforge/references/model-rates.json, plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs</files>
  <action>
RED: add Test list cases 1-5 to calibration-inputs.test.cjs. Run
`node --test plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs`. Cases 1, 4 and 5 must fail on the Sonnet
5.5 value or the comment, and 2 and 3 must pass. Commit with
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> commit "test(rates): cache-hit and cache-write multipliers from the pricing page (RED)" --files plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs`.

GREEN: re-read https://platform.claude.com/docs/en/about-claude/pricing (WebFetch) and confirm each row of the
Locked-decisions table. If the page differs from the table, stop and report; do not guess. Then apply D1 to
model-rates.json. Run the five related test files (calibration-inputs, calibrator, estimate-cli, estimate-backtest,
model-currency). Commit with `... commit "fix(rates): Sonnet 5.5 cache hits are 0.05x input; rates re-read 2026-10-16" --files plugins/aoforge/aoforge/references/model-rates.json`.

Recalibrate (D2). `A` is `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo>` and `FLAGS` is
`--paths /Users/justin/dev/aoforge-claude --minutes trd_level --window 10 --through 66`. Use one plain command per
Bash call.
1. `cp ~/.claude/aoforge/calibration.json <scratch>/calibration.backup.json`, then `shasum -a 256` on both. The two
   hashes must match.
2. `git -C <repo> show 03901bc8:plugins/aoforge/aoforge/references/model-rates.json > <scratch>/model-rates.old.json`.
3. `A calibrate FLAGS --dry-run`. It must report samples `{trds: 75, tasks: 177, with_tokens: 72}`, a window from
   `57-` to `66-`, and method `{minutes: trd_level, window_objectives: 10, through_objective: 66}`. Anything else
   stops the recalibration (see error_recovery).
4. `A calibrate FLAGS --rates <scratch>/model-rates.old.json --out <scratch>/calibration.oldrates.json`, then
   `A calibrate FLAGS --out <scratch>/calibration.newrates.json`.
5. Write `<scratch>/compare-calibration.cjs`, a scratch file that is never committed. It reads the backup, oldrates
   and newrates files and prints, for each of `trd_level`, `objective_level`, every `task_classes` key and every
   `agent_overhead` agent, `cost_usd.p50`/`p90` as backup, oldrates and newrates. It asserts that `samples` and every
   non-cost stat (`minutes`, `tokens_input`, `tokens_output`, `files`, `tasks`, `trds`) are equal across all three for
   task_classes, trd_level and objective_level. Agent overhead may differ between the backup and today; print its
   spawns before and after. Run it with `node <scratch>/compare-calibration.cjs`.
   Price effect = oldrates to newrates. Drift = backup to oldrates.
6. If step 5's assertions pass, run `A calibrate FLAGS` to write the real file, then
   `cmp ~/.claude/aoforge/calibration.json <scratch>/calibration.newrates.json`. If they differ, show which keys
   differ; a transcript that landed between the runs is acceptable, so say so. Confirm that the written file has
   `models['claude-sonnet-5-5'].cache_read === 0.1` and `rates_as_of === '2026-10-16'`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/calibration-inputs.test.cjs plugins/aoforge/aoforge/bin/lib/calibrator.test.cjs plugins/aoforge/aoforge/bin/lib/estimate-cli.test.cjs plugins/aoforge/aoforge/bin/lib/estimate-backtest.test.cjs plugins/aoforge/aoforge/bin/lib/model-currency.test.cjs` passes, with calibration-inputs at 96 + the new cases. `node -e` on `~/.claude/aoforge/calibration.json` prints the Sonnet 5.5 cache_read as 0.1. The compare script's table is in the SUMMARY.</verify>
  <done>The shipped rate and comment match the page. A test fails if any entry breaks the page's multipliers. The user's calibration.json is rebuilt with the same method and samples, the backup sits in the scratchpad, and the old and new dollar figures are recorded with the price effect and drift separated.</done>
  <recovery>Restore the calibration with `cp <scratch>/calibration.backup.json ~/.claude/aoforge/calibration.json`. If the page differs from the planner's table, commit only the RED test and report the differences.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: release.yml permissions and dispatch dry run, runDryRun, tag-rules inspector</name>
  <files>.github/workflows/release.yml, scripts/release-tag.cjs, scripts/release-tag.test.cjs, scripts/tag-rules.cjs, scripts/tag-rules.test.cjs, CLAUDE.md</files>
  <action>
RED: extend `fakeExec` (array results, see codebase_examples), add cases 6-15 to release-tag.test.cjs, and create
tag-rules.test.cjs with cases 16-18. Build hand-made rulesets with a `ruleset({ id, target = 'tag', enforcement = 'active', include, exclude = [], rules = ['creation'] })`
builder that returns the API's shape (`conditions.ref_name.include/exclude`, `rules: [{ type }]`,
`current_user_can_bypass: 'never'`). The test loads the module per test, so a missing file fails each case by name.
Run `node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs`, then confirm that each new case fails for
the right reason and that the 18 existing cases still pass. Commit:
`... commit "test(release): dispatch dry run, explicit permissions and a tag ruleset inspector (RED)" --files scripts/release-tag.test.cjs scripts/tag-rules.test.cjs`.

GREEN:
1. release-tag.cjs: add `DRY_RUN_TAG_RE`, `dryRunTag(core, runId)`, the `dry-run` kind in parseTag, planTag and
   runRelease (a skip with no exec call; a dry-run tag for another plugin throws), and `runDryRun`:
   ```
   validate runId /^\d{1,20}$/ else throw (no exec)
   core = readPluginJson(root, CORE_DIR).name; tag = dryRunTag(core, runId); ref = `refs/tags/${tag}`
   sha = must(git rev-parse HEAD^{commit})
   if must(git ls-remote --tags origin ref).stdout.trim() -> throw "already on origin; refusing to touch a tag this run did not create"
   must(git tag tag sha)
   pushed = verified = deleted = false; failure = null
   try {
     push = exec(git push origin ref)            # not must(): a refusal is the finding
     if push.status != 0 -> failure = `push of ${tag} refused: ${stderr}`
     else pushed = true; seen = must(git ls-remote ...); verified = a line equals `${sha}\t${ref}`
          if !verified -> failure = `${tag} did not reach origin at ${sha}: ${seen || 'absent'}`
   } finally {
     if pushed: del = exec(git push origin --delete ref); after = exec(git ls-remote ...)
                deleted = del ok && after ok && after.stdout.trim() === ''
                if !deleted -> failure += `${tag} is still on origin; delete it by hand: git push origin --delete ${ref}`
     exec(git tag -d tag)                        # best effort, local only
   }
   if failure -> throw new Error(failure)
   return { action: 'dry-run', tag, sha, pushed, verified, deleted }
   ```
   CLI: when `argv[2] === '--dry-run'`, call `runDryRun(argv[3], ...)` and print the JSON result; exit 1 with
   `release-tag: <message>` on error. Update the header: the dry run, D5 (the GITHUB_TOKEN note), and the advice to
   run tag-rules first.
2. release.yml (D4): add the top-level `permissions:` / `  contents: write` block after `on:`, the
   `workflow_dispatch` input (description: "Push a throwaway aoforge--v0.0.0-dryrun-<run id> tag, check it reached
   origin, delete it. Creates no release."), the push-only guard on `Create release`, and the dispatch-only dry-run
   step. Update the header comment with the dispatch path, the GITHUB_TOKEN note, and
   `node scripts/tag-rules.cjs aoforge--v0.0.0-dryrun-1 aoforge--v3.1.0`.
3. tag-rules.cjs (D6): use CommonJS, sync, no dependencies, the same layout as release-tag.cjs (an injected `exec`,
   `realExec` only in the CLI entry). Usage is `node scripts/tag-rules.cjs [--repo owner/name] [--json] <tag>...`.
   With no tag it exits 1. The text output gives, per tag, each matching ruleset as `<id> "<name>" (<source_type>
   <source>, <enforcement>): <rule types>; you can bypass: <current_user_can_bypass>; bypass actors: <list|not visible>`,
   or `no tag ruleset matches`. The header says that it only runs GETs and why GitHub needs local matching (D6).
4. CLAUDE.md, Publishing line 27: append one sentence. "`workflow_dispatch` with `dry_run` pushes and deletes a
   throwaway `aoforge--v0.0.0-dryrun-<run id>` tag to prove the token can push one, and `node scripts/tag-rules.cjs
   <tag>` lists the tag rulesets that match (read-only)."
Run the scoped tests and `node --test scripts/workflow-permissions.test.cjs`, then commit:
`... commit "feat(release): workflow_dispatch dry run for the tag push, explicit permissions, tag-rules inspector" --files .github/workflows/release.yml scripts/release-tag.cjs scripts/tag-rules.cjs CLAUDE.md`.

Evidence (read-only, not a gate): if `gh auth status` succeeds, run
`node <repo>/scripts/tag-rules.cjs --repo AO-Cyber-Systems/aoforge-claude aoforge--v3.1.0 aoforge--v0.0.0-dryrun-1 v3.1.0 aoforge-stack-flutter--v1.0.0`
from `<repo>` and put its output in the SUMMARY.
  </action>
  <verify>`node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs scripts/workflow-permissions.test.cjs` passes, with release-tag at 18 + the new cases and workflow-permissions at 4/0/0. `rg -n '\$\{\{' .github/workflows/release.yml` shows matches only on `env:` value lines.</verify>
  <done>A dispatch of release.yml with dry_run proves, or disproves, that GITHUB_TOKEN can push and delete an `aoforge--v*` tag, without creating a release and without leaving a tag. A tag push still releases exactly as before. Tag rulesets can be inspected read-only. The GITHUB_TOKEN no-trigger behaviour is documented, and no path depends on it.</done>
  <recovery>If `workflow-permissions.test.cjs` rejects the top-level block's position, put it directly after the `on:` mapping, before `jobs:`, with a blank line after it. If an existing release.yml text test breaks because it matched the single permissions block, make its regex accept both blocks rather than removing either.</recovery>
</task>

<task type="auto">
  <name>Task 3: date 3.1.0 and the packs' 1.0.0, add the quick 37 CHANGELOG entry, prove the gate passes</name>
  <files>CHANGELOG.md, plugins/aoforge-stack-flutter/CHANGELOG.md, plugins/aoforge-stack-web/CHANGELOG.md, plugins/aoforge/hooks/changelog-on-tag.test.js</files>
  <!-- TDD-EXCEPTION: the dates are data, not logic. Case 20 still goes RED first; case 19 is a guard that passes before and after. -->
  <action>
RED: add cases 19 and 20 to changelog-on-tag.test.js in a new describe. Run
`node --test plugins/aoforge/hooks/changelog-on-tag.test.js`: case 20 fails on `Unreleased` and case 19 passes.
Commit: `... commit "test(release): 3.1.0 and pack 1.0.0 headings are dated; the gate passes every release tag (RED)" --files plugins/aoforge/hooks/changelog-on-tag.test.js`.

GREEN:
1. Make the three heading edits of decision 2. Leave the empty `## [Unreleased]` above 3.1.0 in place.
2. Check that `### ... (quick 34)`, `(quick 35)` and `(quick 36)` exist under 3.1.0 (`rg -n '\(quick 3[4-7]\)' CHANGELOG.md`).
   Add `### Pricing and release workflow (quick 37)` directly after the quick 36 block, before
   `### Model efficiency (objective 76)`, in the existing house style: bold lead-in, wrapped near 120 columns, plain
   declaratives. Use these bullets:
   - **Sonnet 5.5 cache hits cost $0.10 per million.** model-rates.json had $0.20, the 0.1x rule. The pricing page
     prices cache hits on Opus 5.5 and Sonnet 5.5 at 0.05x input. Every entry was re-read on 2026-10-16, and a test
     pins the page's multipliers (cache hits 0.05x for Opus 5.5 and Sonnet 5.5, 0.025x for Fable 5.1 and 0.1x
     otherwise; writes 1.25x and 2x). calibration.json keeps the rates it was built with, so re-run `aof-tools
     calibrate` to reprice. Give the measured TRD p50/p90 dollar change from Task 1, or say it was unchanged and why.
   - **Release dry run.** release.yml grants `contents: write` at the top level and in its job. A `workflow_dispatch`
     with `dry_run` pushes `aoforge--v0.0.0-dryrun-<run id>` with GITHUB_TOKEN, checks origin, deletes it and creates
     no release. Note that a tag pushed with GITHUB_TOKEN starts no workflow and that no release path relies on one.
   - **`scripts/tag-rules.cjs`** lists the tag rulesets, including inherited ones, that match a tag, read-only.
     GitHub has no rules-for-a-tag endpoint.
   - **Release dates.** 3.1.0 and the stack packs' 1.0.0 are dated 2026-10-16.
3. Run `A changelog check 3.1.0` and `A changelog check v3.1.0` (both `ok: true, present: true`), then the scoped
   tests. Commit: `... commit "docs(release): date 3.1.0 and the packs' 1.0.0; quick 37 changelog" --files CHANGELOG.md plugins/aoforge-stack-flutter/CHANGELOG.md plugins/aoforge-stack-web/CHANGELOG.md`.
  </action>
  <verify>`node --test plugins/aoforge/hooks/changelog-on-tag.test.js scripts/release-tag.test.cjs plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs plugins/aoforge/aoforge/bin/lib/changelog.test.cjs` passes, with changelog-on-tag at 30 + the new cases. `rg -n '^## \[(3\.1\.0|1\.0\.0)\]' CHANGELOG.md plugins/aoforge-stack-*/CHANGELOG.md` shows three dated headings. Then the full `npm test`.</verify>
  <done>3.1.0 and both packs' 1.0.0 carry their release date. Every release tag passes the changelog gate and `changelog check` against the working tree. The 3.1.0 notes cover quick 34-37.</done>
  <recovery>If `doc-refs.repo.test.cjs` or `rename-guard.repo.test.cjs` flags the new CHANGELOG text, reword the flagged token; never add it to an ALLOW list.</recovery>
</task>

</tasks>

<verification>
- `npm test`: 0 failures compared with the 03901bc8 baseline. tests and pass grow only by the tests added here, and
  skipped is unchanged.
- `git log --oneline 03901bc8..HEAD` shows 6 commits (a RED and a GREEN per task), all made through
  `aof-tools commit`.
- `git diff 03901bc8 --stat` lists only files in `files_modified`.
- `shasum -a 256 <scratch>/calibration.backup.json` matches the hash recorded in Task 1 step 1, and
  `~/.claude/aoforge/calibration.json` has the Sonnet 5.5 cache_read at 0.1.
- No push, tag, release, dispatch or GitHub write call. `git -C <repo> tag --list '*dryrun*'` prints nothing.
  Nothing is written under `/Users/justin/dev/aoforge-claude`.
</verification>

<success_criteria>
- Estimates price Sonnet 5.5 cache hits at the published 0.05x rate, and a test keeps every rate on the page's rules.
- The user's calibration reflects the corrected price, with the same method and samples, and can be restored.
- The release workflow's tag push can be rehearsed safely before 3.1.0, and the tag rulesets can be inspected.
- 3.1.0 and the stack packs are dated and pass every release gate.
</success_criteria>

<output>
Write the SUMMARY text into the draft
`/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/aoforge-drafts/aoforge-claude-df646fc2/quick/37-sonnet-cache-rate-release-dates-release-/37-SUMMARY.md`.
Publish it only after Task 3 is GREEN:
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> quick summary 37 --from <that draft> --raw`.
Its JSON `path` must be under `<repo>`. If it is not, stop and report; do not retry. If any task is not GREEN, leave
the draft unpublished and report its path. Do not commit the SUMMARY; the orchestrator does.
Include:
- the npm test baseline and final totals, and the per-file counts before and after;
- each RED failure message;
- the six commit hashes;
- the backup path and its sha256, and the dry-run sample/window/method output;
- the compare table: old (backup), today with the old rates, and today with the new rates, for every cost_usd
  p50/p90, labelled by price effect and drift;
- the tag-rules evidence output, or the reason it was not run;
- any existing test whose expectation changed, and why;
- follow-ups: the installed mirror still carries the old rate until the next plugin release; whether a
  dated-heading gate on release tags is worth adding.
</output>
