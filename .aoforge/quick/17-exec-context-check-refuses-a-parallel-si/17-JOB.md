---
objective: quick-17
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/exec-context.test.cjs
  - plugins/devflow/devflow/bin/lib/exec-context.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/agents/executor.md
  - CHANGELOG.md
autonomous: true
github_issue: "#98"
must_haves:
  truths:
    - "Two executors with DIFFERENT --id, same checkout, same --base: the second `exec-context check` exits 1 with a message starting `SHARED INDEX —` naming the other id, the checkout, the base, the `exec-context worktree` fix and `exec-context release`"
    - "Same --id re-running check in the same checkout/base passes (retry is not a collision)"
    - "A later sequential wave (different --base) in the same checkout passes"
    - "Siblings in two linked worktrees provisioned by `exec-context worktree` with the same base both pass"
    - "An expired claim (age >= TTL) is replaced and the check passes"
    - "`check` without --id takes no claim and reports `claim: null` (back-compat)"
    - "`exec-context release --repo <abs> [--id <id>]` clears claims so a different id then passes"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/exec-context.cjs
      provides: "claim logic in cmdExecContextCheck, cmdExecContextRelease, router arm"
    - path: plugins/devflow/devflow/bin/lib/exec-context.test.cjs
      provides: "cases (a)-(g) for issue #98"
  key_links:
    - from: plugins/devflow/devflow/workflows/execute-objective.md
      to: "exec-context check --id"
      via: "executor prompt template passes --id {plan_id}"
    - from: plugins/devflow/agents/executor.md
      to: "exec-context check --id"
      via: "preflight command + SHARED INDEX failure row"
---

# Quick 17: `exec-context check` refuses a parallel sibling on a shared index (#98)

<objective>
After #86 removed forced `isolation: worktree`, parallel executors of one wave must each be
provisioned via `df-tools exec-context worktree`. If the orchestrator skips that, siblings run
in ONE checkout and race on one git index (interleaved commits, wrong-wave attribution). Today
only prose forbids it. Make the unsafe path FAIL (issue #98 option 1): `exec-context check`
with `--id` + `--base` takes an exclusive claim on (checkout, base_sha); a second, different
id on the same claim is refused with `SHARED INDEX —`.

Design is decided — implement exactly as below, do not re-litigate.
</objective>

<context>
Intent: kind=plugin, work=bugfix → strict TDD. RED commit (`test(98): ...`) must land before
GREEN (`fix(98): ...`). Fixtures are hand-built temp git repos (existing helpers `makeRepo`,
`landWaveOne`, `run`, `git`, `cleanupAll` in exec-context.test.cjs) — no generated data, no
property-based libs, no Gherkin.

Commits: ONLY via
`node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <explicit paths>`.
ALWAYS pass `--files` with explicit paths — the repo has unrelated untracked files
(`.planning/objectives/26-*`, `docs/CODEX-PORT.md`, etc.) that must never be committed.
Never use port 8080 (not relevant here, but pass it on).
</context>

<embedded_context>
<codebase_examples>
- `plugins/devflow/devflow/bin/lib/exec-context.cjs`
  - helpers: `git(dir,args)` → `{exitCode, stdout, stderr}` (L47); `realpath(p)` (L56);
    `repoIdentity(dir)` → `{checkout, commonDir, mainRoot, isWorktree}` (L68) — `commonDir` is
    the realpath of `git rev-parse --git-common-dir`, SHARED by all linked worktrees; `checkout`
    is the per-worktree root. `flag(args,name)` (L86) returns `null` when absent, `undefined`
    when present-without-value.
  - `cmdExecContextCheck(cwd,args,raw)` L97-205: validates repo, unborn HEAD, then `--base`
    (baseSha resolved ~L170, BASE NOT VISIBLE ~L178). Builds `result` at ~L191 and calls
    `output(result, raw, 'ok')`. The claim step goes AFTER base visibility passes and BEFORE
    `result` is built; add `claim` to `result`.
  - Error style: multi-line `error()` with a CAPS headline + `  key : value` lines + a
    runnable fix command using `expected.mainRoot` (see NO COMMITS / BASE NOT VISIBLE).
  - `cmdExecContextRoute` L297: `check` / `worktree` arms; unknown-subcommand error lists
    "Available: check, worktree" — add `release` there too. Export the new function in
    `module.exports` (L308).
- `plugins/devflow/devflow/bin/df-tools.cjs` ~L1214: `case 'exec-context'` comment block lists
  the subcommands — add the `release` line to the comment (dispatch itself goes via
  cmdExecContextRoute, so no new case is needed).
- `plugins/devflow/devflow/bin/lib/help.cjs` ~L313: `'exec-context'` entry with `usage` and
  `details` array. Update usage to `df-tools exec-context <check|worktree|release> ...` (must
  still start with `df-tools exec-context` — help.test.cjs L57) and add a `release` details
  block plus a line under `check` describing `--id` / SHARED INDEX.
</codebase_examples>

<anti_patterns>
- Do NOT use `fs.existsSync` then `writeFileSync` for the claim — that is racy. Create with
  `fs.openSync(file, 'wx')`; on `EEXIST` read and adjudicate; for the refresh/expired-replace
  paths, overwrite with `writeFileSync` (the claim is already ours or dead).
- Do NOT key the claim on `mainRoot` or `commonDir` — that would make correctly isolated
  linked-worktree siblings collide. Key on `actual.checkout` realpath.
- Do NOT take a claim when `--id` is absent or `--base` is absent — back-compat, `claim: null`.
- Do NOT store claims under `.planning/` or the working tree (would be committed / not shared
  across worktrees). Use `<commonDir>/devflow-exec-claims/`.
</anti_patterns>

<error_recovery>
- If a test for case (d) fails because the provisioned worktree path isn't under tmpRoots,
  reuse the pattern of the existing `exec-context worktree` tests (L182-237) including their
  `--path` usage and cleanup.
- If `executor-isolation.test.cjs` fails after prose edits: it asserts
  `/exec-context check[^\n]*--base/` and `/df-tools\.cjs exec-context check --repo/` — keep
  `--repo` immediately after `check` and keep `--base` on the same line; append `--id` AFTER
  `--base`.
</error_recovery>
</embedded_context>

## Test list

All in a new `describe('exec-context check — shared-index claim (issue #98)', ...)` in
`exec-context.test.cjs`. Setup per test: `repo = makeRepo('claim')`, `base = landWaveOne(repo)`.
Set `DEVFLOW_EXEC_CLAIM_TTL_MS` only in (e) (pass `env` through `run` — extend `run` with an
optional `env` param merged over `process.env`).

- (a) id `98-01` check `--repo repo --base base --id 98-01` → 0; id `98-02` same args → exit
  1, stderr matches `/^SHARED INDEX —/m`, contains `98-01`, the checkout path, the base sha,
  `exec-context worktree`, `--id 98-02`, and `exec-context release`.
- (b) same id `98-01` twice → both exit 0; second JSON `claim.id === '98-01'`.
- (c) `98-01` with base; then commit one more ("wave 2 tip"), `98-02` with `--base <new tip>`
  → 0 (sequential wave, different base, no collision).
- (d) `exec-context worktree --repo repo --id 98-01 --base base` and `--id 98-02` (same base);
  run check with its own id from inside each returned worktree path → both 0.
- (e) `98-01` claims; `98-02` with env `DEVFLOW_EXEC_CLAIM_TTL_MS=1` (after a ~10ms busy-wait
  or by backdating `claimed_at` in the claim file) → 0 and `claim.id === '98-02'`.
- (f) check with `--base` but no `--id` → 0, JSON has key `claim` equal to `null`; and no
  claim dir entries created. Also: `--id` without `--base` → `claim: null`.
- (g) `98-01` claims; `exec-context release --repo repo` (cwd repo) → 0; `98-02` → 0.
  Plus: `release --id 98-99` (non-matching) leaves `98-01`'s claim, so `98-02` still refused.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — failing tests for the shared-index claim (a)-(g)</name>
  <files>plugins/devflow/devflow/bin/lib/exec-context.test.cjs</files>
  <action>
Add the describe block from the Test list above, using the existing `makeRepo`,
`landWaveOne`, `run`, `git`, `beforeEach`/`afterEach(cleanupAll)` helpers. Extend
`run(argv, cwd, env)` with an optional env merged over `process.env` (existing callers
unchanged). Locate the claim file for (e)/(f) via
`path.join(git(repo,'rev-parse --git-common-dir' resolved against repo), 'devflow-exec-claims')`.
Parse stdout with `JSON.parse` (check emits JSON when not `--raw`; confirm against the existing
tests' parsing pattern before writing assertions).

Run `node --test plugins/devflow/devflow/bin/lib/exec-context.test.cjs` — the new cases must
FAIL (unknown `--id` is ignored today so (a) passes both checks; `release` is an unknown
subcommand; `claim` key absent). Existing cases must still pass.

Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "test(98): exec-context check must refuse a sibling sharing one index" --files plugins/devflow/devflow/bin/lib/exec-context.test.cjs`
  </action>
  <verify>New #98 tests fail, pre-existing exec-context tests pass; RED commit exists touching only the test file (`git show --stat HEAD`).</verify>
  <done>RED commit landed with 7 behaviour cases failing for the right reason.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — claim in `check`, new `release`, dispatcher + help</name>
  <files>plugins/devflow/devflow/bin/lib/exec-context.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
In exec-context.cjs add `const crypto = require('crypto');` and:

```
const CLAIM_TTL_MS_DEFAULT = 4 * 60 * 60 * 1000;
function claimTtlMs() { env DEVFLOW_EXEC_CLAIM_TTL_MS parsed as positive int, else default }
function claimDir(identity) { path.join(identity.commonDir, 'devflow-exec-claims') }
function claimFile(identity, baseSha) {
  key = sha1(realpath(identity.checkout)).hex.slice(0,12)
  return path.join(claimDir(identity), `${key}-${baseSha}.json`)
}
function takeClaim(identity, id, baseSha, mainRoot, baseArg):
  mkdirSync(dir, {recursive:true})
  record = {id, checkout: identity.checkout, base_sha: baseSha, claimed_at: new Date().toISOString()}
  try openSync(file,'wx'); write JSON; close; return record
  catch EEXIST:
    existing = JSON.parse(read) (on parse failure treat as expired)
    if existing.id === id → overwrite with refreshed record; return
    age = now - Date.parse(existing.claimed_at)
    if age < claimTtlMs() → error(SHARED INDEX message)
    else overwrite; return record
```

Put the rationale as a code comment above takeClaim: parallel siblings share WAVE_BASE by
construction; a later sequential wave has a DIFFERENT base (previous wave's tip) so it never
collides; linked worktrees have their own checkout key so correctly isolated siblings never
collide. Reference issue #98.

SHARED INDEX message (first line exactly starts `SHARED INDEX —`):
```
SHARED INDEX — another executor already claimed this checkout for this base.
  other id : <existing.id> (claimed <existing.claimed_at>)
  this id  : <id>
  checkout : <checkout>
  base     : <baseSha> (<baseArg>)
Parallel executors of one wave share one git index here: their commits interleave and
land under the wrong TRD. Each parallel TRD needs its own worktree:
  df-tools exec-context worktree --repo <mainRoot> --id <id> --base <baseArg>
If the other executor is dead (stale claim), clear it with:
  df-tools exec-context release --repo <mainRoot> --id <existing.id>
```

In `cmdExecContextCheck`: read `idArg = flag(args,'--id')` (undefined → usage error like
`--base`). After base visibility passes: `claim = (idArg && baseSha) ? takeClaim(actual, idArg, baseSha, expected.mainRoot, baseArg) : null`.
Add `claim` to `result`. Update the check usage strings to include `[--id <plan_id>]`.

`cmdExecContextRelease(cwd,args,raw)`: require absolute `--repo` (same checks/messages as
check: exists, git repo, cwd's repoIdentity commonDir matches). Optional `--id`. Scan
`claimDir(actual)` for files prefixed with this checkout's key; remove those whose JSON id
matches `--id` (or all if no `--id`). Output `{ok:true, checkout, released:[ids...]}`; missing
dir → `released: []`, exit 0.

Router: add `else if (sub === 'release')` arm; update the unknown-subcommand list to
`check, worktree, release`; export `cmdExecContextRelease`.

df-tools.cjs ~L1214: add `// df-tools exec-context release --repo <path> [--id <slug>]` to
the comment. help.cjs `'exec-context'`: usage `df-tools exec-context <check|worktree|release> --repo <path> [--base <ref>] [--id <slug>] [--path <dir>] [--raw]`;
under `check` details add `--id` claim / SHARED INDEX lines; add a `release` details block.

# CRITICAL: `wx` create is the atomicity guarantee — keep it.
# GOTCHA: `realpath` the checkout before hashing (macOS /var vs /private/var).
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/exec-context.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs` all pass; then `npm test` passes (no new failures vs. main).
  </verify>
  <done>Cases (a)-(g) green; help test green. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "fix(98): exec-context check refuses a parallel sibling on a shared index" --files plugins/devflow/devflow/bin/lib/exec-context.cjs plugins/devflow/devflow/bin/df-tools.cjs plugins/devflow/devflow/bin/lib/help.cjs`</done>
  <recovery>If help.test fails, it's likely usage prefix or a missing details/usage for the new arm — read the failing assertion in help.test.cjs and match its shape.</recovery>
</task>

<task type="auto">
  <name>Task 3: Prose + CHANGELOG — pass --id and document SHARED INDEX</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/agents/executor.md, CHANGELOG.md</files>
  <action>
- execute-objective.md ~L343 (executor prompt `<repo_and_base>`): command becomes
  `node ~/.claude/devflow/bin/df-tools.cjs exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}`
  (`{plan_id}` is the placeholder already used in this file). Add `PLAN_ID: {plan_id}` under
  WAVE_BASE and extend the "Exit 1 means ..." sentence to include SHARED INDEX.
  Near ~L439 (wave-base explanation) add one sentence: `--id` makes check refuse a second
  parallel TRD in the same checkout, so skipping `exec-context worktree` for parallel waves
  now fails loudly (#98); a dead executor's claim is cleared with `exec-context release`.
- executor.md ~L43: `... exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>`
  (keep `--repo` right after `check`, `--base` on same line — executor-isolation.test.cjs).
  Update "The two failures it reports" → "The three failures" and add a table row:
  `| \`SHARED INDEX\` | Another executor with a different plan id already claimed this checkout for this base — you are a parallel sibling sharing its git index. Commits would interleave. | Report it and stop. Each parallel TRD must be re-dispatched into its own tree from \`exec-context worktree --repo <REPO_ROOT> --id <plan_id> --base <WAVE_BASE>\`. Only if the other executor is known dead: \`exec-context release\`. |`
  Change "Both are hard stops" → "All three are hard stops".
- CHANGELOG.md `## [Unreleased]`: add under `### Fixed` (create the subsection inside
  Unreleased if the one at L52 belongs to a released version — check the heading above it):
  `- **\`exec-context check\` refuses a parallel sibling on a shared index** (#98) — with
  \`--id\` + \`--base\`, check claims (checkout, base); a second plan id on the same claim exits 1
  with \`SHARED INDEX\` instead of racing on one git index. New \`exec-context release\` clears a
  stale claim. Executor prompt and \`executor.md\` now pass \`--id\`.`
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs` pass (the harness test covers executor.md commands — if it annotates/executes the preflight line, confirm the new `--id <plan_id>` form still parses). `rg -n "exec-context check" plugins/devflow/agents/executor.md plugins/devflow/devflow/workflows/execute-objective.md` shows `--id` on every preflight invocation. `npm test` green.
  </verify>
  <done>Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(98): executor preflight passes --id; document SHARED INDEX" --files plugins/devflow/devflow/workflows/execute-objective.md plugins/devflow/agents/executor.md CHANGELOG.md`</done>
</task>

</tasks>

<verification>
- `npm test` passes.
- `git log --oneline -3` shows test(98) → fix(98) → docs(98) in that order.
- `git show --stat` on each commit lists only its declared files (no untracked strays).
- Manual: in a temp repo, `check --id A --base HEAD` then `check --id B --base HEAD` → second
  exits 1 with `SHARED INDEX —`; `release` then B passes.
</verification>

<success_criteria>
All 7 must_haves truths demonstrated by tests; no pre-existing test regresses; prose and help
describe `--id`, SHARED INDEX and `release`.
</success_criteria>

<output>
Write `.planning/quick/17-exec-context-check-refuses-a-parallel-si/17-SUMMARY.md` on
completion.
</output>
