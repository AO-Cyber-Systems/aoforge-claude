---
objective: 72-install-and-naming-cleanup
trd: "27"
type: standard
wave: 19
depends_on: ["72-26"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-client.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - .aoforge/REQUIREMENTS.md
  - .aoforge/todos/pending/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md
  - .aoforge/todos/completed/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md
autonomous: true
gap_closure: true
requirements: [INST-04]
must_haves:
  truths:
    - "gh-client's spawn runner reads a gh answer larger than 1 MiB intact: ghPaginate over the real spawn runner (the gh shim first on PATH) returns every item of a slurped issues answer of more than 2 MiB"
    - "Every gh spawn gets maxBuffer 256 MiB; a call whose args contain `--paginate` gets a 300 s timeout and any other call keeps 30 s; caller opts still win; fake runners still receive opts exactly as passed (gh-client test 23 unchanged)"
    - "A gh call that overflows its buffer or outlives its timeout fails with a named cause, `gh output exceeded the read buffer of <size> (ENOBUFS)` or `gh timed out after <n> s (ETIMEDOUT)`, which gh rebrand already prefixes with the read and the repository"
    - "The read-only dry run of `gh rebrand` against AO-Cyber-Systems/eden-biz (from /Users/justin/dev/eden-biz/go, using this checkout's aof-tools) exits 0 with ok:true and apply:false; its operation and section counts are recorded in the SUMMARY, and eden-biz's `git status --porcelain` is the same before and after"
    - "Only when that dry run succeeded: REQUIREMENTS.md shows INST-04 `[x]` and `Complete`, the SUMMARY's requirements-completed lists INST-04, and the maxBuffer todo is under todos/completed; the SUMMARY says plainly that no live `--apply` was run and why"
    - "CHANGELOG `## [Unreleased]` has a `### Fixed` entry for the gh rebrand ENOBUFS failure on large repositories"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/gh-client.cjs
      provides: "GH_MAX_BUFFER, PAGINATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, _spawnOptions, named ENOBUFS/ETIMEDOUT causes in defaultRunGh"
      contains: "GH_MAX_BUFFER"
    - path: plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs
      provides: "regression tests over the real spawn runner with the gh shim, plus pure _spawnOptions tests"
      contains: "ENOBUFS"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs
      provides: "optional delay_ms per table entry"
      contains: "delay_ms"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-fixtures.cjs
      provides: "buildGhResponse_issuesSlurp: a hand-built slurped issues answer of a chosen size"
      contains: "buildGhResponse_issuesSlurp"
  key_links:
    - from: "gh-rebrand.cjs ghRebrandClient().list"
      to: "gh-client.cjs defaultRunGh"
      via: "ghClient.ghPaginate -> ghRead -> attemptLoop -> runGhImpl (default) -> spawnSync(gh, args, _spawnOptions(args, opts))"
      pattern: "maxBuffer"
    - from: "gh-rebrand.cjs snapshotRepo read()"
      to: "the named runner cause"
      via: "paginateFailure error = runner stderr -> `could not read the <what> of <repo>: <cause>`"
      pattern: "could not read the"
---

# TRD 72-27: Give gh-client a read buffer large enough for `gh rebrand`, and prove it on eden-biz (gap closure)

<objective>
Close the one gap in 72-VERIFICATION.md: INST-04 is partial because `aof-tools gh rebrand` cannot read a large
repository. `defaultRunGh` in `gh-client.cjs` calls `spawnSync('gh', ...)` with no `maxBuffer`, so Node's 1 MiB default
applies, and the 72-25 dry run against eden-biz died with `could not read the issues of AO-Cyber-Systems/eden-biz:
spawnSync gh ENOBUFS` (eden-biz has about 876 issues and pull requests; `--paginate --slurp` returns them all in one
spawn). The 30 s timeout is a second ceiling for the same reads.

Fix it test-first at the one spawn site, give the overflow and timeout failures a named cause, then run the read-only
dry run against eden-biz with this checkout's aof-tools and record its plan. Only when that dry run succeeds, reconcile
the tracker: INST-04 ticked through `requirements mark-complete`, listed in this SUMMARY's `requirements-completed`,
and the todo completed through `todo complete`.

No `--apply` is run against any repository. No fleet repository is in store mode (72-25), and a live apply needs its own
explicit user approval, so it is out of scope here. The SUMMARY records that limit plainly.

Purpose: INST-04 (store-mode GitHub artefacts renamed by a verb that previews with a dry run): the dry run must work on
a real repository of the size the fleet has.
Output: the gh-client fix with regression tests, a recorded eden-biz dry-run plan, a CHANGELOG Fixed entry, a
one-sentence USER-GUIDE limit, and (on success) the reconciled tracker.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
The one spawn site today (`plugins/aoforge/aoforge/bin/lib/gh-client.cjs`, lines 46-73). Caller `opts` are spread last,
so a caller can already override `timeout`; the defaults are what change:

```js
function defaultRunGh(args, opts = {}) {
  let r;
  try {
    r = spawnSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
      ...opts,
    });
  } catch (err) {
    return { ok: false, status: null, stdout: '', stderr: String((err && err.message) || err) };
  }
  if (r.error) {
    const missing = r.error.code === 'ENOENT';
    return {
      ok: false,
      status: null,
      stdout: (r.stdout || '').trim(),
      stderr: missing ? 'gh: command not found' : ((r.stderr || '').trim() || String(r.error.message || r.error)),
    };
  }
  ...
}
```

How a gh-client test reaches the REAL runner hermetically (`gh-client.test.cjs` test 1): restore the default runner and
pass `env` through `opts`, which flows untouched through `ghRead` / `ghPaginate` to `spawnSync`:

```js
client._setRunGh(null);
const r = client._runGh(['--version'], { env: { PATH: '/nonexistent-gh-client-test-dir' } });
assert.match(r.stderr, /gh: command not found/);
```

The gh PATH shim (`__fixtures__/gh-shim.cjs`, TRD 46-01) answers argv from a JSON table, longest key prefix wins:

```js
const { installGhShim } = require('./__fixtures__/gh-shim.cjs');
const shim = installGhShim({ table: { 'api --paginate --slurp repos/o/r/issues?state=all': { code: 0, stdout: big } } });
client._setRunGh(null);
const r = client.ghPaginate('repos/o/r/issues?state=all', { env: shim.env() });   // shim.env() puts shim/bin first on PATH
shim.cleanup();
```

`shimMain` is serialised with `Function#toString`, so anything added to it must be self-contained (no closure over
module scope; `require` inside is fine). It writes stdout/stderr and sets `process.exitCode` (never `process.exit()`),
so a large stdout to a pipe drains before the process ends.

Fixture builder naming (`__fixtures__/gh-fixtures.cjs`): `buildGhResponse_<what>({...} = {})` returns a runner-shaped
result `{ ok: true, status: 0, stdout, stderr: '' }`, and is added to the `module.exports` block with a `// TRD 72-27:`
comment line like the existing `// TRD 01-04:` groups.

gh rebrand already names the read and the repository (`gh-rebrand.cjs` lines 240-246); the runner only has to supply a
clear cause, which reaches it as `paginateFailure(r).error = r.stderr`:

```js
const read = (what, apiPath) => {
  const r = c.list(apiPath);
  if (r.ok) return { items: r.items };
  const out = { error: `could not read the ${what} of ${repo}: ${errorOf(r)}` };
  ...
};
```

Sibling modules that already set a buffer on their own spawns: `gh-wiki.cjs:342` and `objective-branch.cjs:42`
(`maxBuffer: 64 * 1024 * 1024`), `session-audit.cjs:479` (`256 << 20`). Named timeout causes elsewhere:
`objective-branch.cjs:52`, `gh-wiki.cjs:352` (`if (r.error.code === 'ETIMEDOUT') ...`).
</codebase_examples>

<anti_patterns>
- **Do not add defaults above the spawn site.** `ghRead`, `ghWrite`, `ghPaginate` and `attemptLoop` must keep passing
  `opts` through untouched: gh-client test 23 asserts a fake runner receives exactly `{ input }`, and dozens of suites
  inspect `call.opts.input`. Defaults live only in `_spawnOptions` / `defaultRunGh`.
- **Do not per-call patch gh-rebrand** (for example passing `{ maxBuffer }` from `ghRebrandClient.list`). Every large
  read in the store (gh pull, backfill, hierarchy) has the same exposure; the fix belongs at the one seam.
- **Do not return partial stdout on ENOBUFS or ETIMEDOUT.** It is truncated JSON, possibly hundreds of MiB; return `''`.
- **No LLM-generated test data** (`no_llm_test_data`): issue bodies are `'x'.repeat(n)`, numbers and ids are sequential,
  titles are `Issue <n>`. No property-based testing (`no_property_based_default`), no `.feature` files
  (`no_gherkin_layer`): descriptive `it('...')` names carry the meaning.
- **Never run `gh rebrand --apply`** and never pass `--apply` anywhere in this TRD, against eden-biz or any repository.
- **Do not copy eden-biz issue content into this repository.** The dry-run payload holds another repository's issue
  bodies; keep it in a scratch file outside the repo and record only counts, section states and op kinds.
- **Do not tick INST-04 or complete the todo on a failed or partial dry run.** The tracker follows the evidence.
</anti_patterns>

<error_recovery>
- **The ETIMEDOUT test is flaky on a slow machine:** the assertion is on the cause text, not on elapsed time, and a shim
  delay of 5000 ms against a 300 ms timeout leaves a wide margin. If node startup alone exceeds the timeout the result is
  still ETIMEDOUT, so the test holds either way. Do not shorten the delay below 2000 ms.
- **The dry run fails with `wait_ms` (secondary rate limit):** it runs with `maxRetries: 0` by design. Wait the printed
  seconds and run the same command once more. Record both attempts.
- **The dry run fails on another read** (comments, rulesets): if the cause is the buffer or the timeout again, the
  limits are not enough; raise the constant under a new RED test and re-run. Any other cause (auth, 404, a parse
  error) is a new gap: stop, record the exact error in the SUMMARY, leave INST-04 Pending and the todo pending.
- **`requirements mark-complete` ticks the checkbox but leaves the traceability row `Pending`:** fix the row through
  `planning draft REQUIREMENTS.md` + Edit on the draft + `doc put REQUIREMENTS.md --from <draft>`; never edit
  `.aoforge/REQUIREMENTS.md` directly.
</error_recovery>

</embedded_context>

<context>
@.aoforge/objectives/72-install-and-naming-cleanup/72-VERIFICATION.md
@.aoforge/todos/pending/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md
@plugins/aoforge/aoforge/bin/lib/gh-client.cjs
@plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs

Prior evidence: 72-25-SUMMARY.md line 148 is the "before" (the ENOBUFS failure, read-only dry run from
`~/dev/eden-biz/go`); 72-16 built the verb (`lib/gh-rebrand.cjs`), unit-tested on fixtures only.

Resolved intent: kind `plugin`, work `feature` (from OBJECTIVE.md): tdd strict, test_list_first required,
fixture_strategy generators (hand-built builders before the first RED test). The user's global CLAUDE.md "TDD & Quality"
playbook applies: write the failing test before the implementation, one test at a time, then implement to green.

Paths: this TRD runs in the moved checkout `/Users/justin/dev/aoforge-claude` (72-26). In a worktree, use that
worktree's root wherever this TRD says `<checkout>`. eden-biz lives at `/Users/justin/dev/eden-biz`; its `go/`
component still uses the pre-rename `.planning/` directory (72-25 skipped it, dirty), which the CLI resolves through the
compat shim. That is expected; do not upgrade eden-biz.
</context>

<gotchas>
- **The mirror does not carry this fix.** `~/.claude/aoforge/bin/aof-tools.cjs` is the installed 3.0.0 plugin's mirror.
  The live dry run must run `<checkout>/plugins/aoforge/aoforge/bin/aof-tools.cjs`, or it reproduces the old failure.
- **One plain command per Bash call** (the worktree isolation guard refuses compound commands): no `&&`, no `;`, no
  `$(...)`. A single `>` redirect to a scratch file outside the repo is one command.
- **gh-seam.repo.test.cjs** allows `gh` spawns only in `gh-client.cjs` among the guarded modules. Tests and fixtures may
  spawn the shim; library code must not gain a second spawn site.
- **`roadmap-reconcile.test.cjs` E2E1** fails while this TRD's SUMMARY exists and its ROADMAP box is unticked (seen in
  72-22). Run the full suite before writing the SUMMARY, or tick the box first, as 72-22 did.
- **`micro.test.cjs` hangs when commit signing prompts.** Use the suite form in `<verification>` that excludes it.
- **ripgrep:** never fold `-E` into an `rg` flag cluster; use `rg -n -e 'a|b'`.
- **The project STACK.md Layout section still says `plugins/devflow/`** and `df-tools`. Out of scope here; note it in the
  SUMMARY as a proposed correction.
</gotchas>

## Test list

Behaviour cases, outermost first. Each is one `it(...)` with a descriptive name; write and run one at a time.

**Fixture self-tests (Task 1, `gh-shim.test.cjs`):**

1. F1 (happy): a shim table entry with `delay_ms: 300` answers after at least about 300 ms (assert elapsed >= 250 ms),
   with its stdout intact.
2. F2 (failure): `spawnSync('gh', ..., { timeout: 300 })` against an entry with `delay_ms: 5000` ends with
   `error.code === 'ETIMEDOUT'`: the shim can be killed while it waits.
3. F3 (edge): an entry with no `delay_ms`, or `delay_ms: 0` or a non-integer, answers at once (existing behaviour kept).
4. F4 (happy): `buildGhResponse_issuesSlurp({ count: 300, bodyBytes: 8000 })` returns `ok:true` and a stdout that parses
   to an array of three pages of 100 issues each, is more than 2 MiB (`Buffer.byteLength`), and is the same on a second
   call (deterministic). Each issue has `number`, `id`, `title`, `body`, `labels: []` and `updated_at`.
5. F5 (happy): that stdout, served by the shim, round-trips byte-identical through `spawnSync` with `maxBuffer` 64 MiB.

**Regression tests over the real spawn runner (Task 2, `gh-client.test.cjs`), with the shim first on PATH:**

6. R1 (happy, outermost; RED today with ENOBUFS): `client._setRunGh(null)`, then
   `client.ghPaginate('repos/o/r/issues?state=all', { env: shim.env() })` over a >2 MiB slurped answer returns `ok:true`
   and all 300 items, in order (`items[299].number === 300`).
7. R2 (happy; RED today): `client._runGh(['api', 'repos/o/r/issues/comments'], { env: shim.env() })` over a >1 MiB
   answer returns `ok:true` and stdout equal to the canned stdout (trimmed).
8. R3 (failure; RED today, the text differs): `client._runGh([...], { env, maxBuffer: 1024 })` over a 4 KiB answer
   returns `ok:false`, `status:null`, `stdout:''` and `stderr === 'gh output exceeded the read buffer of 1024 bytes (ENOBUFS)'`.
9. R4 (failure; RED today): `client._runGh([...], { env, timeout: 300 })` against a `delay_ms: 5000` entry returns
   `ok:false`, `status:null`, `stdout:''` and `stderr === 'gh timed out after 0.3 s (ETIMEDOUT)'`.
10. R5 (failure, kept): a missing gh is still `gh: command not found` (existing test 1 stays green; no new test).

**Pure spawn options (Task 2, innermost):**

11. U1: `client._spawnOptions(['issue', 'view', '1'])` deep-equals
    `{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 268435456 }`.
12. U2: args containing `--paginate` (for example `['api', '--paginate', '--slurp', 'repos/o/r/issues']`) get
    `timeout: client.PAGINATE_TIMEOUT_MS` (300000) and the same `maxBuffer`.
13. U3: caller opts win and nothing is dropped: `_spawnOptions(['api', 'x'], { timeout: 5, maxBuffer: 10, input: 'i',
    env: { A: '1' } })` has exactly those four values plus `encoding` and `stdio`.
14. U4: the constants are exported: `GH_MAX_BUFFER === 256 * 1024 * 1024`, `PAGINATE_TIMEOUT_MS === 300000`,
    `DEFAULT_TIMEOUT_MS === 30000`.
15. S1 (seam, kept): test 23 still passes unchanged: a fake runner receives `opts` exactly as passed.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built fixtures: a delaying gh shim entry and a sized, slurped issues answer</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs</files>
  <action>
Build the two fixtures the regression tests need, test-first (Test list F1-F5), before any gh-client change.

RED: add F1-F5 to `gh-shim.test.cjs` in a new `describe('installGhShim delay_ms and sized answers (TRD 72-27)', ...)`
(numbered `21g`-`21k` after the existing `21`-`21f`), reusing its `install()` helper and `afterEach` cleanup. Use
`spawnSync('gh', args, { env: shim.env(), encoding: 'utf-8', timeout, maxBuffer })` directly, as the existing `gh()`
helper does. Run the file; F1, F2, F4 and F5 fail (no delay, no builder). Commit:
`test(72-27): shim delay_ms and sized issues answer self-tests (RED)`.

GREEN:
1. `gh-shim.cjs` `shimMain`: after the entry is found and before it writes anything, wait when
   `Number.isInteger(entry.delay_ms) && entry.delay_ms > 0`:
   `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, entry.delay_ms);`
   It must stay inside `shimMain` (it is serialised with `toString`). Document `delay_ms` in the header comment next to
   the table-entry shape: "`delay_ms` (optional) waits that long before answering, so a test can drive a timeout".
2. `gh-fixtures.cjs`: add
   `function buildGhResponse_issuesSlurp({ count = 3, bodyBytes = 64, perPage = 100 } = {})` returning
   `{ ok: true, status: 0, stdout: JSON.stringify(pages), stderr: '' }`, where issue n (1-based) is
   `{ number: n, id: 1000 + n, title: \`Issue ${n}\`, body: 'x'.repeat(bodyBytes), labels: [], updated_at: '2026-10-09T00:00:00Z' }`
   and `pages` chunks the issues into arrays of `perPage` (the `gh api --paginate --slurp` shape: one outer array, one
   inner array per page). JSDoc it as a hand-built answer whose size is roughly `count * (bodyBytes + 120)` bytes.
   Export it under a `// TRD 72-27:` line.
Run the file until green. Commit: `test(72-27): shim delay_ms and buildGhResponse_issuesSlurp fixtures (GREEN)`.

# PATTERN: existing self-tests in gh-shim.test.cjs (21-21f); builders in gh-fixtures.cjs (buildGhResponse_commentsList).
# GOTCHA: assert elapsed time only as a lower bound (F1); never an upper bound.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs</verify>
  <done>F1-F5 pass; the existing 21-21f still pass; the two commits are RED then GREEN; no library module changed yet.</done>
  <recovery>If F2 does not see ETIMEDOUT, check that the wait happens before any write and that `shimMain` uses
`process.exitCode`, not `process.exit()`. Revert with `git checkout -- <file>` on the three files if the approach must
change; nothing else depends on them yet.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh-client spawn runner: 256 MiB buffer, 300 s paginated timeout, named ENOBUFS/ETIMEDOUT causes</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-client.cjs, plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs</files>
  <action>
Fix the defect at the one spawn site, test-first (Test list R1-R4, U1-U4; R5 and S1 are existing tests that must stay
green).

RED: in `gh-client.test.cjs` add `describe('72-27 spawn runner limits', ...)`. Install the shim with
`installGhShim` from `./__fixtures__/gh-shim.cjs` and payloads from `buildGhResponse_issuesSlurp`; push each shim to a
local list and `cleanup()` it in the existing `afterEach` (which already calls `client._resetClient()`). In every R test
call `client._setRunGh(null)` first and pass `{ env: shim.env(), ... }`. Write R1 first and watch it fail with
`spawnSync gh ENOBUFS` (the defect, reproduced hermetically), then R2-R4 and U1-U4. Commit:
`test(72-27): gh-client spawn runner reads >1 MiB and names ENOBUFS/ETIMEDOUT (RED)`.

GREEN, in `gh-client.cjs`:
1. Constants next to the others: `const GH_MAX_BUFFER = 256 * 1024 * 1024;`, `const DEFAULT_TIMEOUT_MS = 30000;`,
   `const PAGINATE_TIMEOUT_MS = 300000;` with a one-line comment each (why: `--paginate --slurp` returns every page in
   one spawn; eden-biz's issue list alone was over Node's 1 MiB default).
2. `function spawnOptions(args, opts = {})` returns
   `{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: isPaginated(args) ? PAGINATE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER, ...opts }`
   where `isPaginated(args)` is `Array.isArray(args) && args.some((a) => String(a) === '--paginate')`.
3. `defaultRunGh(args, opts = {})`: `const o = spawnOptions(args, opts); r = spawnSync('gh', args, o);`. In the
   `r.error` branch, before the generic fallback:
   - `ENOBUFS` -> `{ ok: false, status: null, stdout: '', stderr: \`gh output exceeded the read buffer of ${describeBytes(o.maxBuffer)} (ENOBUFS)\` }`
   - `ETIMEDOUT` -> `{ ok: false, status: null, stdout: '', stderr: \`gh timed out after ${o.timeout / 1000} s (ETIMEDOUT)\` }`
   - `ENOENT` and every other code keep today's behaviour exactly.
   `describeBytes(n)`: `n >= MiB && n % MiB === 0 ? \`${n / MiB} MiB\` : \`${n} bytes\`` (so 256 MiB reads
   `256 MiB` and a forced 1024 reads `1024 bytes`).
4. Export `GH_MAX_BUFFER`, `DEFAULT_TIMEOUT_MS`, `PAGINATE_TIMEOUT_MS` with the constants and
   `_spawnOptions: spawnOptions` next to the seam exports. Extend the module header comment with one bullet: limits
   live at the spawn site only, so fake runners still see caller opts untouched.
Leave `ghRead`, `ghWrite`, `ghRun`, `ghPaginate`, `attemptLoop` and gh-rebrand.cjs unchanged.

Run the gh-client file, then the gh suites (`node --test 'plugins/aoforge/aoforge/bin/lib/gh*.test.cjs'`), until green.
Commit: `fix(72-27): gh-client gives every gh spawn a 256 MiB buffer and paginated reads 300 s (GREEN)`.
REFACTOR only if a duplicate appears; commit separately as `refactor(72-27): ...`.

# CRITICAL: defaults only inside spawnOptions; test 23 must pass unchanged.
# GOTCHA: on ENOBUFS/ETIMEDOUT `r.stdout` may hold a truncated answer; return stdout ''.
# PATTERN: named timeout cause as in objective-branch.cjs:52 and gh-wiki.cjs:352.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs plugins/aoforge/aoforge/bin/lib/gh-seam.repo.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs</verify>
  <done>R1-R4 and U1-U4 pass after failing first (RED commit precedes GREEN); tests 1 and 23 pass unchanged; every
`gh*.test.cjs` passes; `rg -n -e 'maxBuffer' plugins/aoforge/aoforge/bin/lib/gh-client.cjs` shows the default only in
spawnOptions.</done>
  <recovery>If a suite outside gh-client fails because it asserted the old `spawnSync gh ...` text for a spawn error,
check whether it spawns the real runner; fake-runner suites cannot see this change. Roll back with
`git revert <GREEN sha>` and re-plan if the seam contract itself has to change.</recovery>
</task>

<task type="auto">
  <name>Task 3: Prove it on eden-biz (read-only dry run), record the plan, then CHANGELOG, USER-GUIDE and the tracker</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, .aoforge/REQUIREMENTS.md, .aoforge/todos/pending/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md</files>
  <action>
Run the gap's live proof, read-only, with this checkout's aof-tools. One plain command per Bash call.

1. Before snapshot of eden-biz (read-only): `git -C /Users/justin/dev/eden-biz status --porcelain`. Keep the output.
2. The dry run (Bash timeout 600000; write the payload to the session scratchpad or `os.tmpdir()`, never the repo):
   `node <checkout>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/eden-biz/go gh rebrand --dry-run --raw > <scratch>/eden-biz-rebrand-dry-run.json`
   Exit 0 is the pass. On exit 1, read the file (`--raw` prints the error JSON there too) and follow
   `<error_recovery>`.
3. Summarise without printing bodies, with one `node -e` that `require`s the scratch file and prints `ok`, `apply`,
   `repo`, `ops.length`, the count per `section` and per `section/kind`, each entry of `sections` (state, needs_admin,
   notes), and `files` (local paths an apply would change). Record that table in the SUMMARY under
   "eden-biz dry-run plan", plus the elapsed time of the run.
4. After snapshot: the same `git -C /Users/justin/dev/eden-biz status --porcelain`; it must equal step 1. Record both.

Only if step 2 exited 0 with `ok:true` and `apply:false`, and step 4 matched:
5. `node ~/.claude/aoforge/bin/aof-tools.cjs requirements mark-complete INST-04`. Check that line 50 is `- [x] **INST-04**`
   and the traceability row reads `| INST-04 | Objective 72 | Complete |`; if the row did not change, fix it as
   `<error_recovery>` says (draft + `doc put`).
6. `node ~/.claude/aoforge/bin/aof-tools.cjs todo complete 2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories`.
7. If the plan has one or more operations, file a follow-up todo through `planning draft todos/pending/<stem>.md` and
   `todo add --from <draft>`: "Apply gh rebrand to AO-Cyber-Systems/eden-biz after explicit approval" (area github),
   naming the op counts, the prerequisites (flush any outbox first; eden-biz is still on `.planning/` and dirty) and
   that the apply needs its own approval. Do not run it.
8. Commit the tracker: `node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs(72-27): INST-04 complete after the eden-biz rebrand dry run" --files .aoforge/REQUIREMENTS.md .aoforge/todos/pending/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md .aoforge/todos/completed/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md`
   (add the new follow-up todo path when step 7 ran).

Regardless of the outcome:
9. `CHANGELOG.md` `## [Unreleased]`: add `### Fixed` with one entry, in the house voice of the 3.0.0 entries:
   "**`gh rebrand` reads large repositories** (objective 72, INST-04). Every `gh` call now gets a 256 MiB output buffer
   (Node's default is 1 MiB) and a paginated read gets 5 minutes instead of 30 seconds, so a dry run no longer fails
   with `spawnSync gh ENOBUFS` on a repository whose issue list is larger than 1 MiB. A read that still overflows or
   times out says so (`ENOBUFS` or `ETIMEDOUT`) after the read and the repository it was for."
10. `docs/USER-GUIDE.md` "Rebranding a repository", the **Not covered** bullet: append one clause, "or a single list
    read larger than 256 MiB or slower than 5 minutes". Nothing else in the guide changes.
11. Commit: `node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs(72-27): changelog and guide for the gh-client read limits" --files CHANGELOG.md docs/USER-GUIDE.md`.

The SUMMARY must state: the dry run was read-only and nothing was applied; no fleet repository is in store mode (72-25);
a live `--apply` needs a repository owner's explicit approval and was out of scope; `requirements-completed: [INST-04]`
only when steps 5-8 ran, else `[]` with the exact failure.

# CRITICAL: never `--apply`. Never commit the scratch payload or quote eden-biz issue text.
# GOTCHA: `~/.claude/aoforge/bin/aof-tools.cjs` (the mirror) still has the bug; use <checkout>'s for step 2 only.
  </action>
  <verify>The scratch payload has `"ok": true` and `"apply": false`; both porcelain snapshots match; `rg -n -e 'INST-04' .aoforge/REQUIREMENTS.md` shows `[x]` and `Complete`; `ls .aoforge/todos/completed/ | rg -e 'maxbuffer'` lists the todo; `rg -n -e 'ENOBUFS' CHANGELOG.md` hits under `## [Unreleased]`.</verify>
  <done>The eden-biz dry-run plan (op counts, section states, local files) is in the SUMMARY with the porcelain
evidence; on success INST-04 is ticked and Complete, the todo is completed and the SUMMARY lists INST-04 in
requirements-completed; CHANGELOG and USER-GUIDE are committed; no `--apply` ran anywhere.</done>
  <recovery>If the dry run fails for a reason other than the read limits, stop after steps 9-11: record the error, keep
INST-04 Pending and the todo pending, and report it as a new gap for the next gap-closure cycle. If
`requirements mark-complete` wrote the wrong line, `git checkout -- .aoforge/REQUIREMENTS.md` before the commit and redo
it through `planning draft` + `doc put`.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs (scoped, from `stack command test --files`); the full suite is `npm test` with micro.test.cjs excluded, as in `<verification>`</test>
</validation_gates>

<verification>
- `node --test plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs` passes,
  and the git log shows each RED commit before its GREEN commit.
- The full suite has no new failure: run
  `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
  once before Task 1 (baseline; the last recorded totals are 72-22's: 11942 tests, 1 transient roadmap-reconcile E2E1
  failure, 35 skipped) and again after Task 3, and record both totals.
- `rg -n -e 'GH_MAX_BUFFER' -e 'PAGINATE_TIMEOUT_MS' -e 'ENOBUFS' -e 'ETIMEDOUT' plugins/aoforge/aoforge/bin/lib/gh-client.cjs`
  shows the constants, the options helper and both named causes.
- The SUMMARY has the eden-biz dry-run table, both porcelain snapshots and the explicit "no --apply" statement.
- `rg -n -e 'INST-04' .aoforge/REQUIREMENTS.md` shows `[x]` and `Complete` (success path only).
</verification>

<success_criteria>
- gh-client reads gh answers larger than 1 MiB, proven over the real spawn runner with the shim (R1, R2).
- Buffer and timeout failures name their cause (R3, R4); the seam contract is unchanged (tests 1 and 23).
- `aof-tools gh rebrand --dry-run` completes against AO-Cyber-Systems/eden-biz and its plan is recorded; eden-biz is
  untouched.
- The tracker matches the evidence: INST-04 ticked and in requirements-completed only on a successful dry run; the todo
  completed; the live-apply limit stated.
- CHANGELOG `[Unreleased]` has the Fixed entry.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/72-install-and-naming-cleanup/72-27-SUMMARY.md` (via
`summary post`), with `requirements-completed: [INST-04]` on the success path, and tick this TRD's ROADMAP line.
</output>
