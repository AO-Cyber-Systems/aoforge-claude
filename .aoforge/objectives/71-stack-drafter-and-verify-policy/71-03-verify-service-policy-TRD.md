---
objective: 71-stack-drafter-and-verify-policy
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/stack-ci.cjs
  - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-verify.cjs
  - plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs
  - plugins/devflow/devflow/bin/lib/flag-spec.cjs
autonomous: true
requirements: [SDR-10]
must_haves:
  truths:
    - "`df-tools stack verify --run --include test --raw` on a repo whose `test` command is run by a CI job that declares `services:` (or service env such as `DATABASE_URL`) prints `test resolved skipped=env_required` and never spawns the command"
    - "A gate whose command, one-level task-runner body or wrapper script references a service (`postgres://`-style URL, a `DATABASE_URL` / `TEST_DATABASE_URL` / `*_DSN`-style variable, or a loopback host with a port such as `localhost:5432`) is skipped `env_required`; for `test` and `e2e` a `.env.test`, `.env.test.local` or `.env.testing` naming one does the same"
    - "`--allow-services` (only with `--run`) runs such a gate and marks it: JSON `run.services_allowed` lists the signals and `--raw` appends ` services=allowed`; `--allow-services` without `--run` is a usage error (exit 1)"
    - "The skip detail names the signal (file, job, service names, variable names, scheme or host:port) and the opt-in flag, and never echoes a URL, a password or an env value"
    - "Precedence is unchanged where it already decided: a key not selected or not included is `not-included`/`not-selected`; a deny (for example `git push` in the body) still wins over `env_required`; a gate with no service signal runs exactly as before"
    - "`parseWorkflows` steps carry `services` (the job's service container names, sorted) and `envNames` (workflow, job and step env names in scope, sorted); a service container's own `env:` is not in `envNames`"
    - "`RUN_POLICY.services` states the policy (reason, opt-in flag, schemes, env-name pattern, env files and the keys env files apply to), frozen"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/stack-verify.cjs
      provides: "RUN_POLICY.services; scanText/analyzeText service findings; serviceSignals(item, ctx) (CI + env-file layers); runOne env_required skip and allowServices; parseVerifyArgs --allow-services; rawTable services=allowed"
      exports: ["serviceSignals", "RUN_POLICY", "parseVerifyArgs", "runCommands"]
    - path: plugins/devflow/devflow/bin/lib/stack-ci.cjs
      provides: "step.services and step.envNames"
      contains: "envNames"
    - path: plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs
      provides: "CLI-spawn and in-process tests for the service policy (cases 1-17)"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
      provides: "gitRepo({ files, modes }) and serviceWorkflow({ job, services, env, defaultsCwd, runs }) hand-built builders"
      exports: ["gitRepo", "serviceWorkflow"]
    - path: plugins/devflow/devflow/bin/lib/flag-spec.cjs
      provides: "stack verify bools include --allow-services"
      contains: "--allow-services"
  key_links:
    - from: "stack-verify.cjs runOne"
      to: "stack-verify.cjs serviceSignals"
      via: "after the deny/unverifiable pick, before the effect guard; skipped env_required unless opts.allowServices"
      pattern: "env_required"
    - from: "stack-verify.cjs serviceSignals"
      to: "stack-ci.cjs parseWorkflows step.services / step.envNames"
      via: "a step whose invocation text and cwd equal the gate's command and cwd"
      pattern: "parseWorkflows\\("
    - from: "flag-spec.cjs stack.verify"
      to: "stack-verify.cjs parseVerifyArgs"
      via: "the flag guard and the parser accept the same flag"
      pattern: "--allow-services"
---

# TRD 71-03: `stack verify --run` never reaches a service silently (SDR-10, services)

<objective>
In the objective 43 follow-up run (43-ROLLOUT.md `## SDR-08 follow-up run`, 2026-10-04) trades' `test`
(`npx vitest --run`) ran against whatever was listening on 127.0.0.1:5432. The effect guard snapshots only the work
tree, so it cannot see database writes, and the run policy has no notion of a suite that needs a dedicated service.
trades' CI job for that exact command declares `services: postgres:` and `DATABASE_URL`, so the evidence was there.

State and enforce a policy: a gate with a service signal is skipped and reported `env_required`; `--allow-services`
runs it anyway, and the result says so. Signals come from three places: the gate's own text (command, one-level runner
body, wrapper script), the CI job that runs the same command, and (for test and e2e) a test env file. Success
criterion 3. Todo: `.planning/todos/pending/2026-10-04-stack-verify-run-policy-services-and-artifacts.md` (first bullet).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── __fixtures__/stack-verify-fixtures.cjs  ← MODIFY (gitRepo, serviceWorkflow)
├── stack-ci.cjs                            ← MODIFY (step.services, step.envNames)
├── stack-ci.test.cjs                       ← MODIFY (C18; step-key contract pin)
├── stack-verify.cjs                        ← MODIFY (policy, detection, opt-in, raw)
├── stack-verify-services.test.cjs          ← CREATE
└── flag-spec.cjs                           ← MODIFY (stack.verify bools)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (RED, GREEN, optional REFACTOR as atomic commits per task), test
list first, hand-built fixtures (`no_llm_test_data`), no property-based libraries, no `.feature` files. User playbook:
failing test first, one test at a time.

Read narrowly (`rg -n` first; lines from planning, HEAD fb2764bd):
- `stack-verify.cjs`: requires 20-27; `--run` policy comment 470-484; `EFFECT_REASONS` 491-495; `RUN_POLICY` 497-531;
  `logicalLines`/`scanText` 545-564; `analyzeText` 743-765 (findings `{ type, reason, detail }`; runner-body reasons get
  a `body:` prefix); `analyzeScript` 767-782; `analyzeRunner` 784-817; `FINDING_ORDER`/`pickFinding` 819-827;
  `keyVerdict` 829-836; `withSkip` 845-847; `runOne` 1148-1205; `runCommands` 1250-1254; `VERIFY_FLAGS` and
  `parseVerifyArgs` 1260-1293; `summarize` 1297; `verifyStack` 1321-1388; `rawTable` 1392-1403; `cli` 1410-1427;
  exports 1429-1439.
- `stack-ci.cjs`: `parseDoc` 451-624 (job-level keys 519-528: copy the `p.length === 3 && p[2] === 'env'` pattern;
  step creation 538; env merge for substitution 588; step object 610); `parseWorkflows` 663-683; exports 685.
- `stack-ci.test.cjs`: the step-key contract pin 413-419 (gains `envNames` and `services`); C14 env tests 424+ (the
  workflow/job/step env fixture style); last describe C17 736.
- `flag-spec.cjs` 318-335: `stack.subcommands.verify: { values: [...], bools: ['--run', '--draft'] }`.
- `__fixtures__/stack-verify-fixtures.cjs`: `makeRepo` (stack-runner-fixtures, `(files, { modes })`), `gitIn` 225,
  `mutatingToolBin`/`stubCalls` 238-262, `gitDartRepo` 275-296 (the init sequence to copy), exports 298-311.
- `stack-verify-run-guard.test.cjs` 40-66 (helpers `item`, `envWith`, `setup`) and 243-288 (the CLI spawn with
  `profileFx.profileMd({ yaml })` under a fake HOME): the models for the new test file.
- `stack-verify.test.cjs` 417 pins `['curl localhost:…/health', 'port-…-forbidden']`: that deny must keep winning over
  the new loopback signal (deny is checked first).
</context>

## Test list

Outermost first: spawned `df-tools stack verify` on a scratch git repo with a stub tool, then `runCommands` in-process,
then the CI reader. One at a time. In every test the gate command is a stub `svc-suite` (`fx.mutatingToolBin`) whose
calls are counted, so nothing real ever runs.

**CLI (stack-verify-services.test.cjs)**
1. STACK.md `test: { run: "svc-suite --all" }`; `.github/workflows/ci.yml` job `suite` with `services: postgres:` runs
   `svc-suite --all`. `stack verify --run --include test --raw` -> exit 0, a line `test resolved skipped=env_required`;
   `stubCalls` is empty.
2. Same repo, JSON: the test result has `skipped: 'env_required'`; `run.detail` contains `.github/workflows/ci.yml`,
   `suite`, `postgres` and `--allow-services`.
3. Same repo with `--allow-services`: the stub ran once; the raw line is `test resolved run=0 services=allowed`; JSON
   `run.services_allowed` is a non-empty list naming the CI signal.
4. `--allow-services` without `--run` -> exit 1, stderr names `--run`; nothing spawned.
5. Without `--include test` -> `test resolved skipped=not-included` (key policy first), no env_required.

**In-process `runCommands` (stack-verify-services.test.cjs)**
6. Text: command `DATABASE_URL=postgresql://app:s3cret@db.invalid:5432/app svc-suite` -> `env_required`; detail
   contains `DATABASE_URL` and not `s3cret`, not `postgresql://app`.
7. Runner body: Makefile `test:` -> `\tMIGRATIONS_TEST_DSN="postgres://u:p@localhost:5436/x" svc-suite`, command
   `make test` -> `env_required`, detail names `make test` and `MIGRATIONS_TEST_DSN`.
8. Wrapper script: `bash scripts/it.sh` whose text uses `"$TEST_DATABASE_URL"` -> `env_required`, detail names the
   script and `TEST_DATABASE_URL`.
9. Loopback: a body line `svc-suite --redis 127.0.0.1:6379` -> `env_required`, detail names `127.0.0.1:6379`.
10. CI job env without services (`env: DATABASE_URL: ${{ secrets.DB }}`) running the same command -> `env_required`,
    detail names `DATABASE_URL`.
11. CI negative: the services job runs a DIFFERENT command (`svc-suite --unit`) -> no signal; the gate runs (stub called).
12. CI cwd: job `defaults.run.working-directory: api` runs `svc-suite --all`; item cwd `''` -> runs; item cwd `api` ->
    `env_required`.
13. Env file: `.env.test` with `DATABASE_URL=postgres://…` -> a `test` item is `env_required` (detail `.env.test sets
    DATABASE_URL`, no value); a `lint` item with the same command and no other signal runs (env files apply to test
    and e2e only).
14. Precedence: a Makefile body with `git push` AND `DATABASE_URL` -> the deny reason (`body:git-push`), not
    env_required.
15. `allowServices: true` on case 7 -> spawned, `run.services_allowed` names `MIGRATIONS_TEST_DSN`; the effect guard
    still brackets the run (a git repo: no `mutated` for a stub that writes nothing).
16. No signal anywhere -> runs, no `services_allowed` key (regression).
17. `RUN_POLICY.services` is frozen; `reason === 'env_required'`, `optIn === '--allow-services'`, `envFileKeys` is
    `['test', 'e2e']`.

**CI reader (stack-ci.test.cjs, C18)**
18. A job with `services:` `postgres:` and `redis:` -> each of its steps has `services: ['postgres', 'redis']`; a step
    of another job has `services: []`.
19. `envNames`: workflow `env: A`, job `env:` block `B`, step flow `env: { C: x }`, job `D: ${{ secrets.D }}` -> that
    step's `envNames` is `['A', 'B', 'C', 'D']`; a sibling step without its own env has `['A', 'B', 'D']`.
20. A service container's own `env:` (`POSTGRES_USER`) is not in any step's `envNames`, and `services:` under a step's
    `with:` is not a job service.
21. The step-key contract pin lists `envNames` and `services`.

<embedded_context>

<codebase_examples>
`runOne`'s current order (stack-verify.cjs 1148-1162): key policy, static resolution, cwd, then text findings:
```js
const why = keyVerdict(it.key, it.form, opts);
if (why) return withSkip(it, why, `key "${it.key}" is not run by --run (${why})`);
if (it.resolve && MISSING_STATUSES.has(it.resolve.status)) { return withSkip(it, 'not-resolved', …); }
… cwd-outside-repo …
const finding = pickFinding(analyzeText(it.command, it.cwd || '', ctx, { mode: 'command', label: 'command' }));
if (finding) return withSkip(it, finding.reason, finding.detail);
```

`scanText` (545-564) and the finding push in `analyzeText`:
```js
function scanText(text) {
  const lines = logicalLines(text);
  for (const line of lines) {
    for (const d of RUN_POLICY.deny) if (d.re.test(line)) return { deny: { reason: d.reason, line }, skip: null };
  }
  for (const line of lines) {
    for (const s of RUN_POLICY.skip) if (s.re.test(line)) return { deny: null, skip: { reason: s.reason, line } };
  }
  return { deny: null, skip: null };
}
// analyzeText:
if (scan.deny) out.push({ type: 'deny', reason: `${prefix}${scan.deny.reason}`, detail: `${label}: ${scan.deny.line}` });
```

stack-ci job-level capture (519-528), the pattern for `services`:
```js
} else if (p[0] === 'jobs' && p.length >= 2) {
  const job = p[1];
  if (p.length === 2 && key === 'continue-on-error') jobCoe.set(job, isTrue(value));
  else if (p.length === 2 && key === 'env') mergeFlowEnv(jobEnvOf(job), value);
  else if (p.length === 3 && p[2] === 'env') setEnv(jobEnvOf(job), key, value, block);
  …
}
// step object (610):
const step = { file, job: s.job, name: s.name, uses: s.uses, cwd, external, checkouts, continueOnError, scheduled, invocations, envSubstituted, runtimeVars };
```

The CLI spawn (stack-verify-run-guard.test.cjs 247-262):
```js
const yaml = ['schema: 1', 'extends: general', 'commands:', '  lint: { run: "flutter analyze --fatal-infos" }'].join('\n');
const root = track(fx.gitDartRepo({ files: { '.planning/STACK.md': profileFx.profileMd({ yaml }) } }));
const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'stack', 'verify', '--run', ...extra], {
  encoding: 'utf-8', env: { ...envWith(bin), HOME: home }, timeout: 60000,
});
```
</codebase_examples>

<anti_patterns>
- Never echo a URL, password or env value in a detail: name the variable, the scheme (`a postgres:// URL`) or the
  host:port. A fixture's invented credential (`s3cret`) must not appear in any output (case 6).
- Do not probe the network or a port (no connect, no `lsof`): detection is static, from text, CI and env files.
- Do not scrub or rewrite the spawned environment to "make it safe": skipping is the policy; `--allow-services` is the
  user saying they accept the service.
- Do not apply env files to every key: a repo-level `.env.test` says nothing about `lint` or `build`.
- Do not weaken a deny or change FINDING_ORDER's existing order; insert `service` after `unverifiable`, before `skip`.
- Do not reference port 8080 in any new test or fixture (the hard rule); the existing deny test already covers it.
- Do not use LLM-generated data; all fixture text is hand-written.
</anti_patterns>

<error_recovery>
- An existing stack-verify test now skips `env_required`: read its command; if it contains a loopback host:port or a
  service variable it is a real signal (the 8080 deny is the only one known, and deny wins). Otherwise the regex is too
  loose: tighten it and add the shape as a negative case.
- stack-ci.test.cjs fails beyond the key pin: a `services:`/env child was captured at the wrong depth; check the `p`
  path lengths (job service names are `p.length === 3`, their own env is depth 5).
- `parseWorkflows` throws in a test with a fake `fs`: wrap the CI layer in try/catch and treat it as no signal (the
  policy is an additional refusal; a reader failure must not run the gate silently, but must not crash `--run`
  either; record the read failure in the detail of no item, just skip the CI layer).
</error_recovery>

</embedded_context>

<gotchas>
- `parseWorkflows(root)` uses the real `fs` (not the injected one). Read it lazily and once per `runCommands` call
  (cache on `ctx`), only when an item reaches the service check.
- Match a CI invocation by its normalised text (`squash`) and cwd (`null`, `''` and a trailing slash are the root).
  `inv.text` is already normalised by stack-shell; a STACK.md command from `renderCommand` is the verbatim CI text in a
  drafted file, so equality works for the drafted case. A hand-edited command that differs from CI is not matched:
  that is the documented limit of the CI layer.
- `scanText` is called for the command text, each runner body and each script text through `analyzeText`, so one
  added `service` result covers all three text layers. Keep the reason exactly `env_required` (no `body:` prefix): the
  success criterion names it.
- `env_required` items count as `skipped` in `summarize`; exit code stays 0 (a skipped gate is not a failure).
- `micro.test.cjs` hangs on commit signing: use the `!(micro)` full-suite form. The fleet harness may be red while
  71-01 is in flight in another worktree; it is not this TRD's: run the full suite with `DEVFLOW_SKIP_FLEET_HARNESS=1`.
- Never use port 8080 (8091 if a server is ever needed; none is). Commit with `df-tools commit`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders: a committed scratch repo and a CI workflow with services</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs</files>
  <action>
Add two hand-built builders, documented in the file's style, and export them:

1. `gitRepo({ files = {}, modes = {} } = {})`: `makeRepo(files, { modes })`, then the exact init sequence of
   `gitDartRepo` (init, user.email/name, `commit.gpgsign false`, `core.autocrlf false`, `add -A`, `commit -q -m
   fixture`). Returns the root. Do not change `gitDartRepo`.
2. `serviceWorkflow({ job = 'suite', services = [], env = {}, defaultsCwd = null, runs = [] } = {})` -> workflow YAML
   text: `name: CI`, `on: [push]`, `jobs:`, `  <job>:`, `    runs-on: ubuntu-latest`, then (when set)
   `    defaults:` / `      run:` / `        working-directory: <defaultsCwd>`, then (when non-empty) `    services:` with
   each `      <name>:` / `        image: <name>:16` / `        env:` / `          <NAME>_USER: app`, then (when non-empty)
   `    env:` with `      KEY: value` lines (values written verbatim, so a test can pass `${{ secrets.DB }}`), then
   `    steps:` / `      - uses: actions/checkout@v4` and one `      - run: <cmd>` per entry of `runs`.

Check with `node -e` that `serviceWorkflow({ services: ['postgres'], env: { DATABASE_URL: 'x' }, runs: ['a'] })` prints
the expected lines, and that `gitRepo({ files: { 'a.txt': 'x' } })` gives a clean `git status --porcelain`. Commit
(`test(71-03): verify fixtures for service-backed gates`).
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
  </verify>
  <done>Both builders are exported; the existing verify suites pass unchanged.</done>
  <recovery>If an existing test breaks, an existing export changed: restore it and only add.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CI steps carry their job's service containers and the env names in scope</name>
  <files>plugins/devflow/devflow/bin/lib/stack-ci.test.cjs, plugins/devflow/devflow/bin/lib/stack-ci.cjs</files>
  <action>
RED (cases 18-21): add `describe('C18 job services and env names (TRD 71-03)')` using `_parseWorkflowText` (and
`serviceWorkflow` from the verify fixtures where it fits), and update the step-key contract pin at 413-419 to include
`envNames` and `services` with a comment ("`services` and `envNames` in TRD 71-03"). Run: they fail. Commit RED.

GREEN, stack-ci.cjs `parseDoc`:
- `const jobServices = new Map();` beside `jobEnv`. In the jobs branch:
  `else if (p.length === 3 && p[2] === 'services' && key) { if (!jobServices.has(job)) jobServices.set(job, []); jobServices.get(job).push(key); }`
  (block spelling only; a flow `services: { … }` is not read: say so in the header list of recognised shapes).
- On the step object: `services: [...new Set(jobServices.get(s.job) || [])].sort()` and
  `envNames: Object.keys({ ...wfEnv, ...(jobEnv.get(s.job) || {}), ...s.env }).sort()` (names only; runtime-valued
  entries are recorded with a null literal and still count as names).
- Update the `parseWorkflows` doc comment's field list and the header's recognised shapes
  (`jobs: <job>: services: <name>:`).
Run stack-ci, stack-evidence and the drafter suites (they consume steps). Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-ci.test.cjs plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs plugins/devflow/devflow/bin/lib/stack-report.test.cjs
  </verify>
  <done>Cases 18-21 pass; every listed suite passes with only the contract pin edited.</done>
  <recovery>If stack-evidence or the drafter suites change, a new field leaked into evidence items: the fields are on
steps only; check `readCi` did not spread the step.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The `env_required` policy, the three signal layers and `--allow-services`</name>
  <files>plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs, plugins/devflow/devflow/bin/lib/stack-verify.cjs, plugins/devflow/devflow/bin/lib/flag-spec.cjs</files>
  <action>
RED (cases 1-17): create `stack-verify-services.test.cjs` with a header test list (cases 1-17), helpers copied from
stack-verify-run-guard.test.cjs (`track`/`afterEach` cleanup, `envWith`, `item`), `t.skip` without git, and the stub
`svc-suite` via `fx.mutatingToolBin('svc-suite', ':')`. Run: every service case fails (the gates run), 5/14/16 pass
(they pin unchanged behaviour). Commit RED.

GREEN, stack-verify.cjs:
1. Policy constants near RUN_POLICY:
```js
// Service-backed gates (TRD 71-03, SDR-10). A gate that needs a database or another service is never run silently:
// it is skipped `env_required` unless `--allow-services` is passed, and then the result lists the signals.
const SERVICE_SCHEMES = Object.freeze(['postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongodb+srv', 'redis', 'rediss', 'amqp', 'amqps', 'nats', 'kafka', 'clickhouse']);
const SERVICE_URL = new RegExp(`(?:^|[^A-Za-z0-9+.-])(${SERVICE_SCHEMES.map(escapeRegExp).join('|')})://`, 'i');
const LOOPBACK_PORT = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b/;
const SERVICE_ENV_NAME = /^(?:[A-Z][A-Z0-9_]*_)?(?:DATABASE_URL|DATABASE_URI|DB_URL|DSN|POSTGRES_URL|PG_URL|PGHOST|MYSQL_URL|MONGO_URL|MONGO_URI|MONGODB_URL|MONGODB_URI|REDIS_URL|REDIS_ADDR|AMQP_URL|RABBITMQ_URL|NATS_URL|KAFKA_BROKERS)$/;
```
   and `RUN_POLICY.services = Object.freeze({ reason: 'env_required', optIn: '--allow-services', schemes:
   SERVICE_SCHEMES, envName: SERVICE_ENV_NAME, envFiles: Object.freeze(['.env.test', '.env.test.local', '.env.testing']),
   envFileKeys: Object.freeze(['test', 'e2e']) })`.
2. `serviceIn(line) -> string | null`: the first of: a service env name referenced (`$NAME`, `${NAME}`) or assigned
   (`NAME=`) -> `references NAME`; a scheme -> `a <scheme>:// URL`; a loopback -> `<host>:<port>`. Never the line.
   `scanText` returns `service: { what }` for the first logical line with one (deny still checked first and returned
   alone). `analyzeText` pushes `{ type: 'service', reason: 'env_required', detail: \`${label}: ${what}\` }`.
   `FINDING_ORDER = ['deny', 'name-deny', 'unverifiable', 'service', 'skip']`.
3. `serviceSignals(item, ctx) -> [detail]` (exported), the non-text layers:
   - CI: `ctx.ciSteps` (lazy `parseWorkflows(ctx.root)`, try/catch -> `[]`). A step matches when one of its
     invocations has `squash(inv.text) === squash(item.command)` and the same normalised cwd. A matching step with
     `services.length` -> `CI job \`<job>\` (<file>) runs it with services <names>`; with service env names ->
     `… with env <NAMES>`.
   - Env files, only when `RUN_POLICY.services.envFileKeys` includes `item.key`: each `envFiles` entry at the root and
     at the item's cwd that exists; a line `NAME=…` with `SERVICE_ENV_NAME.test(NAME)` -> `<file> sets NAME`.
4. `runOne`: compute `findings` once; `pickFinding` over `opts.allowServices ? findings.filter((f) => f.type !== 'service')
   : findings`; a service finding's skip detail ends `; pass --allow-services to run it against whatever service is
   listening`. When no finding blocks, `signals = [...text service details, ...serviceSignals(it, ctx)]`; with signals
   and no `opts.allowServices` -> `withSkip(it, 'env_required', <first signal + the same hint>)`. Otherwise run as
   before, and when `signals.length` set `run.services_allowed = signals`.
5. `runCommands(…, { allowServices = false })` -> `opts.allowServices`; `verifyStack({ …, allowServices = false })`
   passes it; `parseVerifyArgs` accepts `--allow-services` (bool) and throws `UsageError('--allow-services needs --run')`
   when `--run` is absent; the unknown-flag message lists it. `rawTable`: after the `run=` part, append
   ` services=allowed` when `r.run.services_allowed`. Update the `cli` doc comment's usage.
6. Header: in the `--run policy` comment add a "Service-backed gates" paragraph stating the three layers, the skip
   reason, the opt-in and that detection is static (no probing).
7. flag-spec.cjs: `verify: { values: ['--include', '--keys', '--timeout'], bools: ['--run', '--draft', '--allow-services'] }`.

Run the new file, stack-verify, run-guard, stack-cli and flag-spec tests. Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
  </verify>
  <done>Cases 1-17 pass; every listed suite passes, including the port-8080 deny case in stack-verify.test.cjs. The
full suite (`DEVFLOW_SKIP_FLEET_HARNESS=1`, micro exclusion if signing prompts) shows no failure outside the 70-03
baseline.</done>
  <recovery>If flag-spec.repo.test.cjs complains, the flag-guard entry and the parser disagree: both must list
`--allow-services`. `git checkout -- plugins/devflow/devflow/bin/lib/stack-verify.cjs` returns to RED.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line)</test>
<test>npm test   (full suite before the last commit; DEVFLOW_SKIP_FLEET_HARNESS=1 while 71-01/71-02 are in flight; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs plugins/devflow/devflow/bin/lib/stack-ci.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` passes.
- `rg -n "env_required" plugins/devflow/devflow/bin/lib/stack-verify.cjs` hits RUN_POLICY.services, the finding and
  `runOne`; `rg -n "allow-services" plugins/devflow/devflow/bin/lib/flag-spec.cjs plugins/devflow/devflow/bin/lib/stack-verify.cjs` hits both.
- `rg -n "envNames|services:" plugins/devflow/devflow/bin/lib/stack-ci.cjs` hits the step object.
</verification>

<success_criteria>
- `stack verify --run` skips a service-backed gate and reports `env_required`; `--allow-services` is the explicit
  opt-in, and an allowed run is marked, so a local database is never reached silently (SC-3).
- The policy is stated in `RUN_POLICY.services` and the module header.
</success_criteria>

<output>
After completion, create `.planning/objectives/71-stack-drafter-and-verify-policy/71-03-SUMMARY.md` through
`df-tools summary post`. Note the CI layer's exact-command limit and the static (no probing) design.
</output>
