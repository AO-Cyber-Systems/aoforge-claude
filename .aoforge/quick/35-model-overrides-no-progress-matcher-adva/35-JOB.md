---
objective: quick-35
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/config.cjs
  - plugins/aoforge/aoforge/bin/lib/config.test.cjs
  - plugins/aoforge/aoforge/bin/lib/init.cjs
  - plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs
  - plugins/aoforge/aoforge/references/model-profiles.md
  - plugins/aoforge/hooks/hooks.json
  - plugins/aoforge/hooks/__fixtures__/claude-matcher.js
  - plugins/aoforge/hooks/pre-bash.test.js
  - plugins/aoforge/hooks/hook-coexistence.test.js
  - site/data/aoforge.json
  - plugins/aoforge/aoforge/bin/lib/state.cjs
  - plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs
  - plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs
  - plugins/aoforge/aoforge/workflows/execute-trd.md
  - plugins/aoforge/aoforge/workflows/execute-objective.md
  - plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "With config {model_profile: quality, agent_models: {planner: {quality: haiku}}, model_overrides: {debugger: haiku}}, `resolve-model planner --raw` and `resolve-model debugger --raw` both print `haiku`. At 5e26f7c0 both print `inherit`"
    - "`init execute-objective <N>` and `init quick` give executor_model `haiku` under model_overrides {executor: haiku}, the same value as `resolve-model executor --raw`. The CLI and init compute the model with one function"
    - "Precedence, highest first: --escalate-from, then model_overrides (unfloored), then the project agent_models tier, then the focus tier, then the package table row. The verdict floor applies to the last three. model-profiles.md documents this order and each case has a test"
    - "The 76-06 verdict-floor test now also proves that agent_models is read: in the same project a non-verdict agent's agent_models entry changes its tier"
    - "guard-no-progress's PreToolUse matcher is `^(?!Bash$).*`. Under Claude Code's documented matcher rule it matches Read, BashOutput, Monitor, ToolSearch, SendMessage, mcp__gopls__x and mcp__plugin_p_s__t, and it does not match Bash. pre-bash.test.js and hook-coexistence.test.js both use one helper that models that rule"
    - "advance-job (both paths, local mode) reports `files_changed` and `archive_updated` in its JSON. When it writes STATE.md it also leaves STATE_ARCHIVE.md in place, so a --files list naming the archive cannot fail on a missing path"
    - "Every `aof-tools commit --files` list in workflows, agents and skills that commits STATE.md after an archive-writing command also names STATE_ARCHIVE.md. A repo test enforces this and fails on execute-trd.md:235 and execute-objective.md:610 at 5e26f7c0"
    - "`stack verify --all --task ../../escaped` and `stack verify --all --task` (no value) exit 1, run no pack command and write no file"
    - "If config stacks.enabled names a pack that is not mirrored, has a broken manifest, or has its plugin disabled, `stack verify --all` exits 2 and names the pack, and `stack doctor` exits 1 and names it. At 5e26f7c0 they print `pass` and `No active stack packs.`, both with exit 0"
    - "`npm test` has 0 failures, compared with a baseline taken at 5e26f7c0 before any change. Nothing is pushed, tagged or released, and nothing is written under ~/.claude"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/init.cjs
      provides: "resolveAgentModel(cwd, agentType, {objective, focus, escalateFrom}) -> {model, tier, tier_source, profile, profile_source, agent, model_id, ...}; resolveModelInternal and cmdResolveModel both call it"
    - path: plugins/aoforge/hooks/__fixtures__/claude-matcher.js
      provides: "matcherFires(matcher, value): Claude Code's documented tool-event matcher rule"
      exports: ["matcherFires"]
    - path: plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs
      provides: "a repo test: a STATE.md commit after an archive-writing command also commits STATE_ARCHIVE.md"
    - path: plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
      provides: "unavailableSelectedPacks({projectRoot, userHome}) -> [{name, reason: not_installed|plugin_not_enabled|broken, issues, plugin, install_hint}]"
  key_links:
    - from: "config.cjs loadConfig"
      to: "init.cjs agentTierMap / resolveAgentModel"
      via: "loadConfig now returns agent_models and model_overrides (plain objects, default {})"
    - from: "hooks.json PreToolUse guard-no-progress group"
      to: "pre-bash.js DISPATCHED_HOOKS (Bash)"
      via: "the matcher excludes exactly Bash, so each tool call is counted once"
    - from: "state.cjs advanceFromDisk / cmdStateAdvanceJob"
      to: "workflows execute-trd.md + execute-objective.md commit --files"
      via: "files_changed in the JSON, STATE_ARCHIVE.md in the --files list"
    - from: "stack-packs-cli.cjs verifyPacks / doctor"
      to: "stack-packs.cjs unavailableSelectedPacks"
      via: "a synthetic missing/error entry for each selected pack that cannot run"
---

# Quick 35: model overrides, no-progress matcher, advance-job archive, stack verify path and broken packs

## Objective

Five defects, each reproduced at 5e26f7c0 in the worktree
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
(branch `fix/post-77-verification`). Every path below is relative to that root, called `<repo>`. Work only there.
Run aof-tools as `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`.

1. **Model settings are ignored.** `loadConfig` (`config.cjs:50-66`) returns a fixed key list without `agent_models`
   or `model_overrides`. The readers at `init.cjs:303` and `:406` therefore always get `undefined`.
   `cmdResolveModel` (`init.cjs:420-461`) never reads `model_overrides` at all, so the CLI and the init commands
   would disagree even once the config loads.
2. **No-progress guard lost tools.** Its matcher is a list of exact names (`Edit|Write|…|mcp__`). Under Claude Code's
   rule a matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is compared as exact names, so `mcp__`
   matches no MCP tool, and unlisted tools such as BashOutput, Monitor, ToolSearch and SendMessage get no guard.
   v3.0.0 used `*`. The 3.1.0 perf commit d80cec4e meant to cover "every other tool".
3. **advance-job archive loss.** advance-job rotates decisions into STATE_ARCHIVE.md (`state.cjs:428,486`), and
   record-metric writes there too. The commits that follow (`execute-trd.md:235`, `execute-objective.md:610`) list
   STATE.md but not the archive, so in a worktree those rows never reach the branch.
4. **Path escape.** `stack verify --task ../../escaped` writes `<project>/escaped.json`, outside the verify directory
   (`stack-packs-cli.cjs:139-151`). A bare `--task` is silently treated as no task.
5. **Expected pack passes.** A pack named in config `stacks.enabled` that is missing, broken or disabled gives
   `stack verify --all` → `pass` with exit 0, and `stack doctor` → `No active stack packs.` with exit 0. The
   module's own comment says "a pack that is expected but cannot run blocks".

Intent: kind `plugin`, work `feature` (inherited from PROJECT.md default_work). tdd strict, test_list_first required,
outside_in. Test first in every task: commit RED, then GREEN.

## Locked decisions

- **D1 Model precedence, highest first** (one function, `resolveAgentModel`, used by `resolve-model` and every
  `init` command):
  1. `--escalate-from <model the attempt ran on>`: one rung above that model, whatever supplied it (an override
     included). `tier_source: escalation`.
  2. `model_overrides[agent]`: a tier, `inherit`, or a concrete model id. It applies on every profile and focus, and
     also to an agent missing from the table (no unknown-agent warning when an override names it). It is **not
     floored**: this is the explicit escape that model-profiles.md:44-46 and init.cjs:390-392 already promise.
     `tier_source: model_overrides`.
  3. Project `agent_models[agent][profile]`. Keys may be bare (`planner`) or `df-`-prefixed (`df-planner`), and the
     bare key wins when both are present. It beats the focus tier. `tier_source: agent_models`.
  4. `focus{}` tier for `--focus`. `tier_source: focus`.
  5. The package table row, then its `balanced` entry, then `sonnet`. `tier_source: table`.
  Over 3-5 the verdict floor raises `verifier` and `job-checker` to `verdict_floor.tier`, and then
  `tier_source: verdict_floor`. The output keeps today's keys (`model`, `profile`, `profile_source`, `agent`, `tier`,
  `model_id`, `focus`, `escalated_from`, `ceiling`, `unknown_agent`, `requested`) and adds `tier_source`.
  `model: 'inherit'` still stands for opus.
- **D2** The guard-no-progress matcher is `^(?!Bash$).*`. It contains regex characters, so Claude Code runs it as an
  unanchored JS RegExp: every tool except exactly `Bash`, BashOutput included. Bash stays covered once, through
  pre-bash.js.
- **D3** In local mode advance-job runs `ensureArchive` on the paths that write STATE.md (after the `no_position`
  and `no_trds` returns), so a commit naming STATE_ARCHIVE.md never fails on a missing pathspec. Its JSON gains
  `files_changed` (posix paths relative to the repo, from `planningRel(cwd, name)`, listing exactly the planning files
  this run wrote) and `archive_updated` (boolean). Store mode is unchanged: it writes no STATE.md and seeds no
  archive.
- **D4** A `--task` id must match `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` and must not contain `..`. A missing value or
  one that starts with `-` is a usage error. Validation runs before any pack command or file write. writeVerifyRecord
  also refuses to write anywhere but `<planning dir>/verify/` (defense in depth).
- **D5** A pack is *selected but unavailable* when its name is in `stacks.enabled`, is not in `stacks.disabled`
  (disabled wins), and is not active. Each reason maps to a verify status:
  - `not_installed`: no mirror directory → `missing`
  - `plugin_not_enabled`: mirror present and valid, plugin off → `missing`
  - `broken`: manifest issues → `error`

  Exit codes stay the same: 2 for missing or error, 1 for doctor not-ok. Selection by an `extends` chain or
  `select.runtime` is out of scope (profile resolution reports those).

## Test list

Outermost first. Fixtures come from the existing hand-built builders: `project()`/`resolveIn()` in
model-profiles.test.cjs, `makePack`/`makeProject`/`run`/`mirrorPack` in stack-packs.test.cjs, the fixture helpers in
state-advance-job.test.cjs, and literal markdown strings. No generated data, no property-based tests, no `.feature`
files.

**Task 1: models** (model-profiles.test.cjs, new `describe('quick 35 — project model settings bind')`)
1. CLI: `{model_profile: quality, agent_models: {planner: {quality: haiku}}}` → `resolve-model planner` gives tier
   `haiku` and `tier_source: agent_models`, and `--raw` prints `haiku`.
2. CLI: `{model_overrides: {debugger: haiku}}` → `resolve-model debugger --raw` prints `haiku`, and the JSON has
   `tier_source: model_overrides`.
3. init agrees with the CLI: with `{model_profile: quality, model_overrides: {executor: haiku}}` and an empty
   `.aoforge/objectives/01-x/`, `init execute-objective 1` gives executor_model `haiku`, `init quick "x"` gives
   executor_model `haiku`, and both equal `resolve-model executor --raw`.
4. The override is unfloored: `{model_profile: budget, model_overrides: {verifier: haiku}}` → verifier tier `haiku`.
5. The 76-06 test made real (edit the existing test at :306-316). In the same
   `{model_profile: budget, agent_models: {verifier: {budget: haiku}, planner: {budget: haiku}}}` project, verifier
   is floored to `sonnet` with `tier_source: verdict_floor`, and planner resolves to `haiku`, which proves the
   setting is read.
6. agent_models beats focus: `{model_profile: balanced, agent_models: {'codebase-mapper': {balanced: haiku}}}` →
   `--focus concerns` gives tier `haiku`.
7. A `df-` key works (the documented spelling): `{agent_models: {'df-planner': {quality: haiku}}, model_profile:
   quality}` → planner `haiku`.
8. Escalation beats the override: `{model_overrides: {planner: haiku}}` plus `--escalate-from haiku` → tier `sonnet`
   with `tier_source: escalation`.
9. Unit (config.test.cjs): `loadConfig` returns `agent_models`/`model_overrides` objects as written. A string, an
   array or a missing key gives `{}`, and so does unreadable config (defaults).

**Task 2: hooks and state workflows**
1. Helper self-test (pre-bash.test.js): `matcherFires` follows the documented table. `*`, `''` and `undefined`
   match all. `Bash` matches `Bash` but not `BashOutput`. `Edit|Write` and `Edit, Write` match exactly `Edit` and
   `Write`. `mcp__` does not match `mcp__gopls__x`, while `mcp__.*` does. `^Notebook` matches `NotebookEdit`.
2. Registration (rewrite pre-bash.test.js:191-195 using the helper): the guard matcher does not fire on `Bash`. It
   fires on Read, Edit, BashOutput, Monitor, ToolSearch, SendMessage, Task, mcp__gopls__x and
   mcp__plugin_p_s__t. RED at 5e26f7c0: BashOutput, Monitor and the MCP names fail under the real rule.
3. hook-coexistence.test.js: replace its local `matcherFires` (:392-395) with the shared helper. All 198 tests still
   pass.
4. Repo test (`state-archive-commit.repo.test.cjs`):
   - (a) A detector function on inline fixtures: a fence with `aof-tools.cjs state advance-job` followed by a commit
     whose `--files` has `.aoforge/STATE.md` and no archive is flagged. The same commit with
     `.aoforge/STATE_ARCHIVE.md` passes. A prose mention outside a fence is not a writer. STATE_ARCHIVE.md alone does
     not count as STATE.md.
   - (b) Run over `plugins/aoforge/aoforge/workflows/*.md`, `plugins/aoforge/agents/*.md` and
     `plugins/aoforge/skills/*/SKILL.md`: no violations, and at least 3 checked sites (execute-trd,
     execute-objective, executor.md:921), so it cannot pass vacuously. RED at 5e26f7c0: execute-trd.md:235 and
     execute-objective.md:610.
5. advance-job (state-advance-job.test.cjs):
   - (a) `--objective`, local mode, more than DEFAULT_KEEP decisions in STATE.md → `archive_updated: true` and
     `files_changed` includes `.aoforge/STATE.md`, `.aoforge/STATE_ARCHIVE.md` and `.aoforge/state.json`.
   - (b) STATE.md with no archive file and nothing to rotate → the archive exists afterwards and `files_changed`
     names it.
   - (c) Store mode → STATE.md byte-identical, no archive created, and `files_changed` does not name STATE.md.
   - (d) The legacy counter path reports `files_changed` too.
   - All existing 17 tests keep passing.

**Task 3: stack-packs CLI** (stack-packs.test.cjs, `describe('stack verify --changed|--all')` and a new doctor
describe)
1. `stack verify --all --task ../../escaped` → exit 1, stderr names the rule, and no `escaped.json` exists anywhere
   under the project or its parent.
2. `--task a/b`, `--task ..`, `--task .hidden` and `--task` (last arg) → exit 1. `--task --all` → exit 1. None of
   them writes `.aoforge/verify/`.
3. `--task 77-01-1` and `--task quick-35.1` still write `.aoforge/verify/<id>.json` (the existing test keeps passing).
4. Config `stacks.enabled: ['ghost']` with no mirror → `stack verify --all` exits 2,
   `packs[0] = {pack: 'ghost', status: 'missing'}`, and an install_hint names `stacks.enabled`. `stack doctor` exits
   1 and its text names `ghost`.
5. A mirrored pack with a broken manifest (name mismatch), selected → verify `status: error`, exit 2. Doctor exits 1.
6. A mirrored pack whose plugin the registry says is not installed, selected → verify `missing`, exit 2.
7. The same name in `stacks.enabled` and `stacks.disabled` → nothing reported and exit 0 (disabled wins).
8. Unit: `packs.unavailableSelectedPacks` returns the reason for each of cases 4-6 and `[]` when everything
   selected is active.

<embedded_context>
<codebase_examples>
Model resolution today (`init.cjs`). `agentTierMap` merges base, focus and agent_models; `profileTier` applies the
floor. Reuse both:
```js
const merged = Object.assign({}, base || {}, focusTiers,
  config.agent_models?.[key] || config.agent_models?.[`df-${key}`] || {});      // :300-305
function profileTier(agentModels, profile, key) {                               // :396
  let tier = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  ... floor for VERDICT_FLOOR.agents ...
}
const override = config.model_overrides?.[key] ?? config.model_overrides?.[`df-${key}`];   // :406, resolveModelInternal only
```
`escalationRung(value)` (:374) maps a tier, `inherit` or a model id to a rung. Use it to report `tier`/`model_id` for
an override. `normalizeAgentKey` only strips `df-`.

loadConfig's `get(key, nested)` reads top-level keys (config.cjs:31-37). Add both keys to `defaults` as `{}` and to the
returned object, passing a value through only if it is a plain object.

Hook matcher rule (code.claude.com/docs/en/hooks, read 2026-10-16), for `__fixtures__/claude-matcher.js`:
```js
function matcherFires(matcher, value) {
  if (matcher === undefined || matcher === null || matcher === '' || matcher === '*') return true;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) {
    return matcher.split(/[|,]/).map((s) => s.trim()).filter(Boolean).includes(value);
  }
  return new RegExp(matcher).test(value);   // unanchored, RegExp.prototype.test
}
```
(FileChanged/StopFailure use a narrower set. This helper is for tool events only; say so in its header.)

advance-job write sites (`state.cjs`): `advanceFromDisk` writes STATE.md at :427-445 after `rotateDecisionsOnDisk` at
:428, and writeStateJson at :447. The legacy path rotates at :486 *before* the `no_position` return at :501, then writes
at :507-523. `rotateDecisionsOnDisk` returns `{applies, moved}`. `ensureArchive(cwd)` (:90) seeds ARCHIVE_SEED.

Archive-writing commands for the repo test: `state advance-job`, `state rotate-decisions`, `state record-metric`,
`state add-decision`, `trd finalize` (it runs advance-job and record-metric). Commit sites today:
`execute-trd.md:235` and `execute-objective.md:610` (both missing the archive) and `agents/executor.md:921` (already
lists `.aoforge/STATE_ARCHIVE.md`, so it is the pattern to copy).

stack-packs-cli verify loop (`:105-136`) and doctor (`:78-93`) iterate `activePacks` only. `readStacksConfig` is in
stack-packs.cjs:129. `discoverPacks` gives `{name, plugin, issues, enabled, manifest}`. Export the new function from
stack-packs.cjs `module.exports` (:237).
</codebase_examples>

<anti_patterns>
- Do not "fix" the 76-06 test by deleting its floor assertion. It must keep the floor check and gain a non-verdict
  agent_models assertion.
- Do not keep two model resolution paths. `resolveModelInternal` must return `resolveAgentModel(...).model`.
- Do not use `new RegExp(matcher)` alone (or the anchored `^(?:…)$` form) to model Claude Code matchers in tests.
  Use the shared helper.
- Do not guard against Bash inside guard-no-progress.js. Standalone use must still count Bash, and the matcher does
  the exclusion.
- Do not make `aof-tools commit` skip missing paths. D3 guarantees the archive exists instead (TRD 43-03's skip
  logic stays as it is).
- Do not let verify run any pack command before the `--task` validation.
- No new test dependencies, no LLM-generated fixtures, no property-based tests, no `.feature` files.
</anti_patterns>

<error_recovery>
- If adding keys to advance-job output breaks an existing `deepEqual` in state-advance-job.test.cjs or
  state.test.cjs, change that assertion to check the old keys plus the new ones explicitly. Never drop the old keys.
- If `hook-coexistence.test.js` changes count or fails after the helper swap, a registration's matcher is
  modelled differently: print the matcher and tool name, and fix the helper only if it disagrees with the documented
  table above.
- If the repo test flags a site other than the two known ones, decide per site. If an archive-writing command
  actually runs before that commit in local mode, add `.aoforge/STATE_ARCHIVE.md` and make sure a command earlier in
  the same sequence guarantees the file exists (record-metric, add-decision or advance-job after D3). If the match is
  spurious (prose, a different step), tighten the detector and add an inline fixture for that shape.
- `node scripts/gen-docs-data.cjs` always rewrites `generatedAt`. Commit site/data/aoforge.json only if, apart from
  that line, the diff is just the guard-no-progress `events` entry. Otherwise run `git checkout -- site/data` and
  note it in the SUMMARY.
</error_recovery>
</embedded_context>

<gotchas>
- `aof-tools commit --files` fails the whole commit with `pathspec … did not match` when a listed file does not exist
  (verified at 5e26f7c0). That is why D3 seeds the archive. In the commits for this task, list only files that exist.
- `loadConfig` is called from 26 sites. Adding keys is safe, but `config.test.cjs` may compare a key list, so check it.
- `init execute-objective 1` works on an empty `.aoforge/objectives/01-x/` (verified). `init quick "<desc>"` has no
  side effects in a scratch project.
- `context-budget.repo.test.cjs` caps skill footprint at 90K, and execute-objective is about 83K, so adding about 26
  characters is fine.
- Tests that spawn aof-tools must set `HOME` to a temp dir when they touch packs (the `run()` helper does). Nothing
  may write under the real `~/.claude`.
- The `.planning/` planning tree in `<repo>` is the project's own. Test fixtures use `.aoforge/`.
- Never use port 8080 (none of this needs a port).
</gotchas>

<validation_gates>
- task: `npm test` (`aof-tools stack command test`; `gates.task: [test]`). Scoped form: `node --test <files>`.
- Per-file baselines at 5e26f7c0 (tests/fail): model-profiles 24/0, config 30/0, pre-bash 7/0,
  guard-no-progress 19/0, hook-coexistence 198/0, state-advance-job 17/0, state 34/0, misc-commit 28/0,
  state-merge-wiring.repo 12/0, context-budget.repo 6/0, flag-spec.repo 14/0, stack-packs 24/0.
- Before Task 1, run `npm test` once at 5e26f7c0 and record tests/pass/fail/skipped as the baseline.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: agent_models and model_overrides bind, through one resolver with documented precedence</name>
  <files>plugins/aoforge/aoforge/bin/lib/config.cjs, plugins/aoforge/aoforge/bin/lib/config.test.cjs, plugins/aoforge/aoforge/bin/lib/init.cjs, plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs, plugins/aoforge/aoforge/references/model-profiles.md, CHANGELOG.md</files>
  <action>
RED: write Task 1 tests 1-9 from the Test list. Edit the existing 76-06 floor test (model-profiles.test.cjs:306-316)
as item 5 describes. Run them and confirm the failures: 1, 2, 3, 6, 7 and 9 fail, along with the planner half of 5
and the tier_source asserts. Commit `test(models): project agent_models and model_overrides must bind (RED)`.

GREEN:
1. config.cjs `loadConfig`: add `agent_models: {}` and `model_overrides: {}` to `defaults`. In the return value add
   `agent_models: plainObject(get('agent_models'))` and the same for `model_overrides`, where `plainObject(v)` returns
   `v` for a non-null, non-array object and `{}` otherwise.
2. init.cjs: add `resolveAgentModel(cwd, agentType, { objective, focus, escalateFrom } = {})` implementing D1 and
   returning the result object `cmdResolveModel` prints today, plus `tier_source`.
   - Unknown agent with no override: keep the loud stderr warning and `{model: 'sonnet', unknown_agent: true,
     requested}`. The warning text belongs in `cmdResolveModel` only, because init callers must not print it once per
     spawn. Pass a `{ warn }` option, or have cmdResolveModel print when `unknown_agent` is set.
   - `resolveModelInternal(cwd, agentType, objective, focus)` becomes
     `return resolveAgentModel(cwd, agentType, { objective, focus }).model;`.
   - `cmdResolveModel` calls it and `output(result, raw, result.model)`. The bad `--escalate-from` error is unchanged.
   - Fix agentTierMap's agent_models lookup so that `config.agent_models[key]` wins when both spellings exist. It
     already does through `||`, so keep that.
   - Compute `tier_source` by checking which layer supplied `agentModels[profile]`: agent_models entry → focus entry
     → table. Then `verdict_floor` if profileTier raised it.
3. model-profiles.md: rewrite "Resolution Logic" (:99-108) as the D1 list. Rewrite "Per-Agent Overrides" (:113-130)
   with a bare-key example (`"planner": {"quality": "sonnet"}`, noting that `df-` is still accepted) and replace the
   "Legacy" note with: `model_overrides` is a flat per-agent pin (tier, `inherit` or model id) that wins over the
   profile and is not floored, and `--escalate-from` still goes one rung above it.
4. CHANGELOG.md: under `## [3.1.0] - Unreleased`, after the quick 34 bullets, add a `### Fixes (quick 35)` heading
   with one bullet: project `agent_models` and `model_overrides` were silently ignored and now bind, with the
   precedence stated in one line.

Run Task 1 tests plus config, model-profiles and init-related files green. Commit
`fix(models): honour agent_models and model_overrides in resolve-model and init` with the five source and doc files.
# PATTERN: the 76-06 `project()`/`resolveIn()` helpers. Add `--raw` runs through spawnSync to check stdout.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs plugins/aoforge/aoforge/bin/lib/config.test.cjs` passes with the new tests. The Objective's repro config in a scratch project gives `haiku` for both `resolve-model planner --raw` and `resolve-model debugger --raw`.</verify>
  <done>CLI and init resolve through one function. agent_models and model_overrides change the result exactly as D1 says, and every D1 case has a passing test. The 76-06 test fails if agent_models is ignored again.</done>
  <recovery>If an existing model-profiles or init test breaks on the new `tier_source` key, extend its expectation. If one breaks because a project fixture had stray agent_models that now bind, the fixture was relying on the bug: fix the fixture and record it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: no-progress matcher covers every tool but Bash; advance-job's archive is committed</name>
  <files>plugins/aoforge/hooks/__fixtures__/claude-matcher.js, plugins/aoforge/hooks/hooks.json, plugins/aoforge/hooks/pre-bash.test.js, plugins/aoforge/hooks/hook-coexistence.test.js, plugins/aoforge/aoforge/bin/lib/state.cjs, plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs, plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs, plugins/aoforge/aoforge/workflows/execute-trd.md, plugins/aoforge/aoforge/workflows/execute-objective.md, site/data/aoforge.json, CHANGELOG.md</files>
  <action>
RED: create `hooks/__fixtures__/claude-matcher.js` (the codebase_examples helper; its header cites the docs URL and
says it covers tool events only). Write Task 2 tests 1-2 in pre-bash.test.js, 4a-4b in the new repo test, and 5a-5d
in state-advance-job.test.cjs. Leave the hook-coexistence swap (test 3) for GREEN, since it is a refactor. Confirm
that 2 fails on BashOutput/Monitor/mcp__, 4b on execute-trd.md:235 and execute-objective.md:610, and 5a-5d on the
missing keys. Commit `test(hooks,state): guard matcher under Claude Code's rule; archive in STATE commits (RED)`.

GREEN:
1. hooks.json: set the guard-no-progress group's matcher to `^(?!Bash$).*` (D2). Leave every other group alone.
2. hook-coexistence.test.js: replace the local `matcherFires` with
   `require('./__fixtures__/claude-matcher.js').matcherFires`. Keep the call sites.
3. state.cjs (D3), with the same keys on both paths:
   - In `advanceFromDisk`, capture `rot = rotateDecisionsOnDisk(...)` and whether the archive existed before it. Call
     `ensureArchive(cwd)` inside the `!store && exists(STATE.md)` block. Build `files_changed` with
     `planningRel(cwd, 'STATE.md')` when stateMdUpdated, `planningRel(cwd, 'STATE_ARCHIVE.md')` when it was created
     or `rot.moved > 0`, and `planningRel(cwd, 'state.json')` when writeStateJson ran. Add `files_changed` and
     `archive_updated` to the emitted object.
   - In `cmdStateAdvanceJob` (legacy path), do the same. Rotation at :486 can write before the `no_position` return,
     so that output includes files_changed when rotation moved entries. Seed the archive only on the two branches
     that write STATE.md.
   - Import `planningRel` from compat.cjs if state.cjs does not already have it.
4. Workflows: add `.aoforge/STATE_ARCHIVE.md` after `.aoforge/STATE.md` in the `--files` lists at execute-trd.md:235
   and execute-objective.md:610. In execute-objective, the advance-job right before the commit now guarantees the
   file exists (D3). In execute-trd, record-metric guarantees it. Fix any other site the repo test flags, following
   error_recovery.
5. Repo test detector rules:
   - Track ``` fences. Inside a fence, a line matching
     `/aof-tools(?:\.cjs)?\s+(?:--cwd\s+\S+\s+)?(?:state\s+(?:advance-job|rotate-decisions|record-metric|add-decision)|trd\s+finalize)\b/`
     sets `pendingWriter`.
   - A fenced line matching `/aof-tools(?:\.cjs)?\s+(?:--cwd\s+\S+\s+)?commit\b/` with `--files` is a commit site.
     If it names `STATE.md` (as a path segment, not `STATE_ARCHIVE.md`) while pendingWriter is set, it must also name
     `STATE_ARCHIVE.md`. Count it as checked, record a violation `{file, line}` if it fails, and reset pendingWriter.
   - Assert no violations and checked >= 3.
6. Run `node scripts/gen-docs-data.cjs` and handle site/data/aoforge.json per error_recovery.
7. CHANGELOG `### Fixes (quick 35)`: add two bullets, one for the guard matcher (restores every tool except Bash,
   MCP included) and one for advance-job reporting `files_changed` with the workflows committing STATE_ARCHIVE.md.

Commit `fix(hooks,state): no-progress guard on every non-Bash tool; commit the decision archive after advance-job`
with the changed files.
# CRITICAL: guard-no-progress must not run twice on Bash: pre-bash.js covers it, and the matcher excludes exactly `Bash`.
# GOTCHA: `Bash, Write`-style matchers with a comma or space are exact-name lists too. The helper must split on `,` as well as `|`.
  </action>
  <verify>`node --test plugins/aoforge/hooks/pre-bash.test.js plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/hooks/guard-no-progress.test.js plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs plugins/aoforge/aoforge/bin/lib/state.test.cjs plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs plugins/aoforge/aoforge/bin/lib/state-merge-wiring.repo.test.cjs plugins/aoforge/aoforge/bin/lib/context-budget.repo.test.cjs` passes (hook-coexistence still 198/198).</verify>
  <done>The guard registration matches every non-Bash tool under the real rule, including MCP tools. advance-job reports what it wrote and guarantees the archive exists. Every STATE.md commit after an archive write also commits the archive, and CI enforces it.</done>
  <recovery>If the matcher change makes a coexistence scenario fire guard-no-progress where it did not before, that is the restored v3.0.0 coverage: update the scenario's expectation and say so in the SUMMARY. Revert hooks.json only if a test shows Bash would run the guard twice.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: stack verify --task stays in the verify dir; selected packs that cannot run block verify and doctor</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-packs.cjs, plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs, plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs, CHANGELOG.md</files>
  <action>
RED: write Task 3 tests 1-8 in stack-packs.test.cjs. For test 1, run from a project nested one level inside a fresh
temp dir and assert no `escaped.json` exists under that temp dir. For test 6, use a registry fixture without the
plugin, as in the `discovery and enablement` describe (`homeWithPack`). Confirm the failures: 1 and 2 exit 0 and 1
writes the file, and 4-6 exit 0 or report pass. Commit `test(stack): --task path escape and unavailable selected
packs (RED)`.

GREEN:
1. stack-packs.cjs: add `unavailableSelectedPacks({ projectRoot, userHome = os.homedir() } = {})` implementing D5.
   - Read `readStacksConfig`, `discoverPacks` and `activePacks` (with the resolved profile from
     `stack-profile.cjs resolveProfile`, inside try/catch). For each name in `cfg.enabled` that is not in
     `cfg.disabled` and not active, return `{ name, reason, plugin, issues, install_hint }`.
   - Reasons:
     - `not_installed`: no discovered pack of that name. Hint: `no stack pack "<name>" is mirrored under
       <stacksDir>: install and enable its plugin (for AOForge's packs: /plugin install aoforge-stack-<name>@aocyber),
       or remove "<name>" from config.json stacks.enabled`.
     - `broken`: issues non-empty. Hint: the issues joined with `; `.
     - `plugin_not_enabled`: otherwise. Hint: `enable the <plugin> plugin`, plus the manifest install_hint if it
       has one.
   - Export it.
2. stack-packs-cli.cjs:
   - `verifyPacks`: after the active loop, push `{ pack: u.name, status: u.reason === 'broken' ? 'error' : 'missing',
     summary: 'selected in config stacks.enabled but <reason text>', install_hint: u.install_hint }` for each
     unavailable pack. Add `unavailable: [names]` to the merged result.
   - `doctor`: append `{ pack: u.name, ok: false, reason: u.reason, issues: u.issues, tools: [], command: null,
     install_hint: u.install_hint }`.
   - `doctorCli` text: print `No active stack packs.` only when `r.packs` is empty. A not-ok line shows the reason.
3. `--task` (D4): in `verifyPacksCli`, before `verifyPacks`, check whether `--task` is present. If it is, read the
   next arg, and call `error()` (exit 1) when it is missing, starts with `-`, fails the regex or contains `..`. The
   message is: `stack verify --task needs a task id (letters, digits, ".", "_", "-"; no path separators or ".."); got
   "<value>"`. In `writeVerifyRecord`, after `path.join`, throw unless `path.dirname(path.resolve(file)) ===
   path.resolve(dir)`.
4. CHANGELOG `### Fixes (quick 35)`: add two bullets, one for `--task` validation and one for selected-but-unavailable
   packs blocking verify (exit 2) and doctor (exit 1).

Commit `fix(stack): validate --task ids; selected packs that cannot run block stack verify and doctor`.
# CRITICAL: validation precedes any pack spawn or mkdir. A rejected --task leaves no `.aoforge/verify/` directory.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs plugins/aoforge/aoforge/bin/lib/flag-spec.repo.test.cjs` passes. The repro (config `stacks.enabled: ["ghost"]`, empty AOFORGE_STACKS_DIR, temp HOME) gives `stack verify --all` exit 2 and `stack doctor` exit 1, and `--task ../../escaped` exits 1 with no file written.</verify>
  <done>No `--task` value can write outside `<planning dir>/verify/`. A pack the project selects that cannot run is never reported as pass or as "no active packs".</done>
  <recovery>If an existing stack-packs test project lists a pack in stacks.enabled without mirroring it and now gets exit 2, that test relied on the bug: mirror the pack or drop the name, and record it in the SUMMARY.</recovery>
</task>

</tasks>

<verification>
- `npm test`: 0 failures, compared with the 5e26f7c0 baseline. tests and pass grow only by the tests added here, and
  skipped is unchanged.
- The Objective's repros, rerun in a scratch project under the session scratchpad (not /tmp, not ~/.claude):
  - planner and debugger resolve to `haiku`.
  - `stack verify --all` exits 2 for `ghost` and `stack doctor` exits 1.
  - `--task ../../escaped` exits 1 and leaves no `escaped.json`.
- `git log --oneline 5e26f7c0..HEAD` shows 6 commits (a RED and a GREEN per task), all made through `aof-tools commit`.
- `git diff 5e26f7c0 --stat` lists only files in `files_modified`.
- No push, no tag, no release, and nothing written under `~/.claude`.
</verification>

<success_criteria>
- The model a project configures is the model that runs, and the CLI and init cannot disagree.
- The no-progress guard covers every tool call again, each counted once.
- Decisions and metrics rotated in a worktree reach the branch.
- `stack verify` cannot write outside its directory, and a pack the project expects but cannot run blocks the gate.
</success_criteria>

<output>
Write `.planning/quick/35-model-overrides-no-progress-matcher-adva/35-SUMMARY.md` through the quick summary verb.
Include:
- the npm test baseline and final totals, and the per-file counts before and after;
- each RED failure message;
- the six commit hashes;
- the final D1 precedence as implemented;
- any extra commit site the repo test flagged and how it was resolved;
- whether site/data/aoforge.json was committed.
</output>
