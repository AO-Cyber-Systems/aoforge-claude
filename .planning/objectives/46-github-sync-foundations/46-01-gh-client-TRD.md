---
objective: 46-github-sync-foundations
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-client.cjs
  - plugins/devflow/devflow/bin/lib/gh-client.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-shim.cjs
  - plugins/devflow/devflow/bin/lib/gh-shim.test.cjs
autonomous: true
requirements: [GSF-08]
must_haves:
  truths:
    - "Every gh invocation in the new modules goes through ONE seam: gh-client `_runGh`, replaceable with `_setRunGh(fn)` and restored with `_setRunGh(null)`"
    - "`ghWrite` spaces consecutive writes at least 1000 ms apart on the injected clock; no two writes overlap (df-tools is synchronous; nothing spawns gh asynchronously)"
    - "A 403 whose text says secondary rate limit / abuse detection is retried after the `retry-after` seconds when present (success criterion 4), else after >= 60 s with exponential growth, capped at MAX_RETRIES, then the failure is returned"
    - "A bare 403 without rate-limit wording (e.g. `Resource not accessible by integration`) is NOT retried"
    - "`ghPaginate(path)` returns one flat array from `gh api --paginate --slurp`, and falls back to a `per_page=100&page=N` loop when gh rejects `--slurp`"
    - "`requireEnabled(cwd)` returns `{skipped:true, reason}` when `.planning/config.json` github.enabled is not true or github.repo is unset; with `enabled:true` it returns `{enabled:true, repo, labels, milestone_prefix}` and makes zero gh calls"
    - "`emitResult` exits 0 for ok and for `skipped:true`, and exits 1 for `ok:false` without `skipped`"
    - "The gh PATH shim fixture records argv and answers from a canned table, so CLI-level tests never reach GitHub"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-client.cjs
      provides: "_runGh seam, _setRunGh, _setSleep, _setNow, _resetClient, ghRead, ghWrite, ghPaginate, isWriteArgs, isSecondaryLimit, parseRetryAfter, retryDelayMs, requireEnabled, resolveRepo, emitResult, constants"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-shim.cjs
      provides: "installGhShim({dir, table}) -> {binDir, callsFile, readCalls(), env(extra)}"
  key_links:
    - "46-05, 46-06, 46-07, 46-08 route every gh call through gh-client (ghRead/ghWrite/ghPaginate)"
    - "46-06 (gh-pull) and 46-07 (gh.cjs) make gh-pull `_setRunGh` and gh.cjs `_setRunGh` delegate to gh-client `_setRunGh` (one seam)"
    - "46-10 drives `df-tools gh sync` through the gh shim"
---

# TRD 46-01: `gh` client — one seam, pacing, retry, pagination, enabled gate (GSF-08)

<objective>
Create `lib/gh-client.cjs`: the only place DevFlow spawns `gh`. It paces writes (>= 1 s apart),
retries secondary-rate-limit failures honouring `retry-after`, paginates REST lists, gates every
write command on `github.enabled`, and maps results to exit codes. Also ship a `gh` PATH shim for
CLI-level tests. New files only; nothing is rewired here (46-05..46-08 consume this).

Purpose: defect 8 of the proposal (no retry/rate limiting, first comment page only, `enabled`
ignored, legacy commands exit 0 on `ok:false`).
Output: `gh-client.cjs` + tests, `__fixtures__/gh-shim.cjs` + a small self-test.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh-client.cjs                 ← CREATE
├── gh-client.test.cjs            ← CREATE
├── gh-shim.test.cjs              ← CREATE
└── __fixtures__/
    └── gh-shim.cjs               ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: commit the failing test (RED) before the implementation (GREEN), one behavior group
  at a time. Commit only via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Tests never call real GitHub and never touch the real `~/.claude`: inject `_setRunGh`, `_setSleep`,
  `_setNow`; point `HOME` at a temp dir for anything that spawns a process. No real sleeping.
- Hand-built fixtures only (no generated data). No property-based testing. No `.feature` files.
- Zero new npm dependencies. CommonJS, synchronous I/O. Never use port 8080.
- Research reference: `46-RESEARCH.md` → "Pattern 5: gh client" and "Common Pitfalls" 5, 6, 10.

<embedded_context>

<codebase_examples>
Current runner to copy as the default (gh.cjs:60-80):
```js
function runGh(args, opts = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf-8', stdio: ['pipe','pipe','pipe'], timeout: 30000, ...opts });
  return { ok: r.status === 0, status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}
let _runGh = runGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : runGh; }
```
gh.cjs exports the seam as a forwarding wrapper so other modules see later injections:
`_runGh: (...args) => _runGh(...args)`. Do the same in gh-client.

Config read (gh.cjs:33-40, `readConfig`) and repo fallback (gh-pull.cjs ~320 reads PROJECT.md
`github_repo`). `resolveRepo(cwd)` = `config.github.repo` if it matches `^[^/]+/[^/]+$`, else
PROJECT.md frontmatter `github_repo` (use `extractFrontmatter` from `./frontmatter.cjs`), else null.

Result emitter to build on: `helpers.cjs` `output(result, raw, rawValue, exitCode = 0)`.

Existing shim precedent for the PATH shim: `__fixtures__/launchctl-shim.cjs`, `osascript-shim.cjs`
(read one before writing `gh-shim.cjs`; copy its structure: write an executable into a temp bin dir,
record argv as JSON lines, answer from a table).
</codebase_examples>

<anti_patterns>
- Retrying every 403: masks permission errors. Only rate-limit wording or `HTTP 429` qualifies.
- Busy-wait loops for sleeping. Use `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)`.
- `gh api --paginate` without `--slurp`: prints `[..][..]`, which `JSON.parse` rejects.
- `-F body=...` for free text: `-F` treats a leading `@` as a file path. Callers use `-f`/`--body`.
- Reading `which gh` via `spawnSync` (not mockable). Presence is observable through the seam
  (`_runGh(['--version'])` ok:false / status null).
</anti_patterns>

<error_recovery>
- `spawnSync` ENOENT (gh missing): runner returns `{ok:false, status:null, stderr:'gh: command not found'}`;
  never throw from the runner.
- A JSON parse failure in `ghPaginate` returns `{ok:false, error:'unparseable page', stdout}`; do not throw.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/helpers.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs
</context>

<research_context>
GitHub REST docs (rate limits): secondary limits are 80 content-creating requests/min and 500/h;
on a secondary limit honour `retry-after` (seconds) if present; else if `x-ratelimit-remaining: 0`
wait until `x-ratelimit-reset` (epoch seconds); else wait at least 60 s, then back off exponentially.
`gh` exits 1 for every HTTP failure; only `gh api --include` puts response headers on stdout.
</research_context>

## Test list (write in this order; each group is one RED→GREEN cycle)

Seam
1. `_setRunGh(fake)` routes `ghRead`/`ghWrite` to `fake`; `_setRunGh(null)` restores the spawn runner.
2. The exported `_runGh` wrapper picks up an injection made after `require`.

Write classification (`isWriteArgs(args)`)
3. true: `issue create|edit|comment|close|reopen`, `label create`, `release create|edit`,
   `api ... -X POST|PATCH|PUT|DELETE`, `api` with any `-f`/`-F` and no `--method GET`/`-X GET`,
   `api graphql` whose query text starts with `mutation`.
4. false: `issue view|list`, `api repos/o/r/issues/1/comments`, `api graphql -f query=query{...}`,
   `auth status`, `--version`, `release view`.

Pacing (fake clock via `_setNow`, recording fake sleep via `_setSleep`)
5. Three consecutive `ghWrite` calls: call timestamps on the fake clock are >= 1000 ms apart.
6. A `ghRead` between writes is not delayed and does not reset the write timer.
7. Writes past `WRITE_BUDGET_PER_RUN` (450) return `{ok:false, error:/write budget/}` without calling gh.

Retry (`isSecondaryLimit`, `parseRetryAfter`, `retryDelayMs`)
8. stderr `HTTP 403: You have exceeded a secondary rate limit` + stdout header `retry-after: 2`:
   first attempt fails, sleep recorded == 2000 ms, second attempt succeeds, result `attempts: 2`.
9. Same failure without a header: delays are 60000, 120000, 240000, 480000 (cap 900000), then the
   last failure is returned with `attempts: MAX_RETRIES + 1` (MAX_RETRIES = 4).
10. `x-ratelimit-remaining: 0` + `x-ratelimit-reset: <epoch>` → delay = reset*1000 − now (min 1000).
11. `HTTP 429 ... rate limit` retried; `abuse detection` and `temporarily blocked from content creation` retried.
12. `HTTP 403: Resource not accessible by integration` → not retried, `attempts: 1`.
13. `ghRead` also retries on the same classifier (without pacing).

Pagination (`ghPaginate(apiPath)`)
14. Calls `['api', '--paginate', '--slurp', apiPath]`; `[[a,b],[c]]` → `[a,b,c]`.
15. Fallback: when stderr matches `/unknown flag: --slurp/`, loops `apiPath?per_page=100&page=N`
    (use `&` if `apiPath` already has `?`) until a page shorter than 100; returns the flat array.
16. Unparseable output → `{ok:false}` shape, no throw.

Enabled gate (`requireEnabled(cwd)`, temp project dirs)
17. No config / no `github` block / `enabled:false` → `{skipped:true, reason:/github.enabled/}`, zero gh calls.
18. `enabled:true` without a valid repo and no PROJECT.md `github_repo` → `{skipped:true, reason:/github.repo/}`.
19. `enabled:true`, repo in config → `{enabled:true, repo, labels:{}, milestone_prefix:'v'}`; PROJECT.md
    `github_repo` used when config lacks repo (`resolveRepo`).

Exit codes (`emitResult(result, raw, rawValue)`; monkey-patch `process.exit`/`process.stdout.write`)
20. `{ok:true}` → exit 0; `{skipped:true, ok:false}` → exit 0; `{ok:false, error}` → exit 1 and the
    JSON is still printed (to stdout, like `output`).

Shim (`gh-shim.test.cjs`)
21. `installGhShim({table:{'issue view 7':{code:0,stdout:'{"number":7}'}}})` → spawning `gh issue view 7`
    with `env()` on PATH prints the canned stdout, exit 0; an unmatched argv exits 1 with
    `[gh-shim] no match: ...` on stderr; `readCalls()` returns every argv in order.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Seam, write classification, pacing and retry (tests 1-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-client.cjs, plugins/devflow/devflow/bin/lib/gh-client.test.cjs</files>
  <action>
RED first: write tests 1-13 in `gh-client.test.cjs` (node:test, node:assert/strict). Build a fake
clock helper inline: `let t = 0; client._setNow(() => t); client._setSleep(ms => { sleeps.push(ms); t += ms; });`
and a fake runner that also advances `t` by 0 and records `{args, at: t}`. Reset with
`client._resetClient()` in `afterEach` (restores runner, clock, sleep, lastWriteAt, write counter).
Commit RED.

GREEN: implement `gh-client.cjs`.
Constants (exported): `MIN_WRITE_INTERVAL_MS = 1000`, `MAX_RETRIES = 4`, `BASE_RETRY_MS = 60000`,
`MAX_RETRY_MS = 900000`, `WRITE_BUDGET_PER_RUN = 450`.

Approach:
1. `defaultRunGh(args, opts)` = gh.cjs `runGh` verbatim (plus `status:null` + stderr text on ENOENT).
2. `_runGh`, `_setRunGh(fn)`, `_setSleep(fn)`, `_setNow(fn)`, `_resetClient()`; default sleep via Atomics.wait.
3. `isWriteArgs(args)` per tests 3-4 (inspect `args[0]`/`args[1]`, `-X`/`--method`, `-f`/`-F`/`--field`/`--raw-field`, graphql `query=` text).
4. `isSecondaryLimit(r)`: `!r.ok` AND text = stderr + '\n' + stdout matches
   `/secondary rate limit|abuse detection|temporarily blocked from content creation/i`, or
   (`/HTTP (403|429)/` AND `/rate limit/i`).
5. `parseRetryAfter(r)` → ms or null from a `retry-after: N` header line (case-insensitive) in stdout/stderr.
   `retryDelayMs(r, attempt)`: retry-after ms if present; else reset-based wait if
   `x-ratelimit-remaining: 0` and `x-ratelimit-reset` present; else `min(BASE_RETRY_MS * 2**attempt, MAX_RETRY_MS)`.
6. `ghWrite(args, opts)`: budget check → pace (`wait = lastWriteAt + MIN − now()`) → call → set
   `lastWriteAt = now()` → return `{...r, attempts}` unless `isSecondaryLimit` and attempts remain,
   then `sleep(retryDelayMs)` and loop. Every retry attempt is itself paced.
7. `ghRead(args, opts)`: same retry loop, no pacing, no budget.
8. `ghRun(args, opts)` = `isWriteArgs(args) ? ghWrite : ghRead` (convenience for callers).

# CRITICAL: nothing in this module may spawn gh except through `_runGh`.
# GOTCHA: exported `_runGh` must be a wrapper `(...a) => _runGh(...a)`, not the value.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs</verify>
  <done>Tests 1-13 pass; RED commit precedes GREEN commit in `git log`.</done>
  <recovery>If the Atomics sleep misbehaves under node:test, keep it as the default but never exercise it in tests (all tests inject `_setSleep`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pagination, enabled gate, repo resolution and exit codes (tests 14-20)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-client.cjs, plugins/devflow/devflow/bin/lib/gh-client.test.cjs</files>
  <action>
RED: tests 14-20. Temp project dirs via `fs.mkdtempSync(path.join(os.tmpdir(), 'gh-client-'))`
writing `.planning/config.json` and `.planning/PROJECT.md` by hand. Exit-code tests monkey-patch
`process.exit` and `process.stdout.write` and restore them in `finally`. Commit RED.

GREEN:
- `ghPaginate(apiPath, opts)` → `{ok:true, items:[...]}` or `{ok:false, error, stderr}` (tests 14-16).
  Uses `ghRead`. Guard the fallback loop with `MAX_PAGES = 100`.
- `readConfig(cwd)` (local copy; tolerate missing/invalid JSON → null), `resolveRepo(cwd)`,
  `requireEnabled(cwd)` → `{enabled:true, repo, labels: gh.labels||{}, milestone_prefix: gh.milestone_prefix||'v', config: gh}`
  or `{skipped:true, ok:false, enabled:false, reason}`. No gh calls.
- `emitResult(result, raw, rawValue)`: `code = (result && result.ok === false && !result.skipped) ? 1 : 0`;
  delegate to `helpers.output(result, raw, rawValue, code)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs</verify>
  <done>Tests 1-20 pass; `requireEnabled` tests assert the fake runner's call list is empty.</done>
  <recovery>If `helpers.output` writes large payloads to a tmpfile, keep test payloads small (&lt; 1 KB).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: gh PATH shim fixture (test 21)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-shim.cjs, plugins/devflow/devflow/bin/lib/gh-shim.test.cjs</files>
  <action>
RED: test 21. Commit RED.

GREEN: `installGhShim({ dir, table, defaultCode = 1 })`:
- Creates `<dir>/bin/gh` (mode 0755) as a `#!/usr/bin/env node` script that appends
  `JSON.stringify(process.argv.slice(2))` + '\n' to `<dir>/gh-calls.jsonl`, looks up
  `argv.join(' ')` in a table JSON written to `<dir>/gh-table.json` (exact key, then longest
  prefix match, mirroring `gh-fixtures.cjs` `buildMockRunGh`), writes stdout/stderr, exits `code`.
- Returns `{ binDir, callsFile, readCalls(), setTable(table), env(extra) }` where `env()` returns
  `{...process.env, PATH: binDir + path.delimiter + process.env.PATH, HOME: <dir>/home, DEVFLOW_GH_CACHE_DIR: <dir>/gh-cache, ...extra}`.
Document at the top that it is for CLI-level tests only (unit tests use `_setRunGh`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-shim.test.cjs</verify>
  <done>Shim answers canned argv, records calls, unmatched argv exits 1; HOME in env() is a temp dir.</done>
  <recovery>If `#!/usr/bin/env node` is not resolvable in the test env, write the absolute `process.execPath` into the shebang.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs plugins/devflow/devflow/bin/lib/gh-shim.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "spawnSync\(" plugins/devflow/devflow/bin/lib/gh-client.cjs` shows exactly one spawn site (the default runner).
- Tests 1-21 green; `git log --oneline` shows a test-only commit before each implementation commit.
</verification>

<success_criteria>
- Success criterion 4 is proven at unit level: mocked 403 secondary-limit retried after `retry-after`, writes >= 1 s apart.
- `requireEnabled` and `emitResult` give downstream TRDs one enabled gate and one exit-code rule.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-01-SUMMARY.md`
</output>
