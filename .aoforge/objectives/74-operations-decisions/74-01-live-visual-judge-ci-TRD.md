---
objective: 74-operations-decisions
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - scripts/__fixtures__/visual-judge/manifest.json
  - scripts/__fixtures__/visual-judge/labels.json
  - scripts/__fixtures__/visual-judge/docs-home.png
  - scripts/__fixtures__/visual-judge/docs-home-broken.png
  - scripts/__fixtures__/visual-judge-rollups.cjs
  - scripts/ci-visual-judge.cjs
  - scripts/ci-visual-judge.test.cjs
  - .github/workflows/visual-judge.yml
  - scripts/workflow-permissions.test.cjs
autonomous: true
requirements: [OPS-01]
must_haves:
  truths:
    - "A committed fixture holds two real screenshots of the Hugo docs site home page (one as built, one with a hand-injected blatant overflow and blank region), each a PNG at least 360 px wide and over 10 KB, never a placeholder"
    - "`node scripts/ci-visual-judge.cjs <manifest>` exits 1 with a message naming ANTHROPIC_API_KEY when no credential is in the environment, and never starts the judge"
    - "Given a live rollup, the assertion passes only when gate is binding, every state carries evidence 'vision' and no errors, the known-broken state was judged broken, no expect-pass state failed, nothing is unjudged and input tokens are above zero"
    - "`.github/workflows/visual-judge.yml` runs the script on every push to main, on workflow_dispatch, and on same-repository pull requests that touch the judge's own files, with the ANTHROPIC credentials mapped from secrets and a token grant of exactly `contents: read`"
    - "No test makes a network call: every test strips ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL or injects the runner"
  artifacts:
    - path: scripts/ci-visual-judge.cjs
      provides: "assertLiveRollup (pure) + CLI main with injected env/spawn"
      exports: ["assertLiveRollup", "renderSummary", "main"]
    - path: scripts/ci-visual-judge.test.cjs
      provides: "Test list cases 1-17, no network"
    - path: scripts/__fixtures__/visual-judge/manifest.json
      provides: "Two-state manifest (docs-home expect pass, docs-home-broken expect fail), samples 3, unjudgedPolicy fail"
    - path: .github/workflows/visual-judge.yml
      provides: "The live visual judge job in CI"
  key_links:
    - from: .github/workflows/visual-judge.yml
      to: scripts/ci-visual-judge.cjs
      via: "run: node scripts/ci-visual-judge.cjs scripts/__fixtures__/visual-judge/manifest.json"
      pattern: "ci-visual-judge.cjs"
    - from: scripts/ci-visual-judge.cjs
      to: plugins/aoforge/aoforge/bin/aof-tools.cjs
      via: "spawn: verify flutter-ui-eval <manifest> --judge live --raw"
      pattern: "--judge', 'live'"
    - from: .github/workflows/visual-judge.yml
      to: "repository secret ANTHROPIC_API_KEY"
      via: "env mapping"
      pattern: "secrets.ANTHROPIC_API_KEY"
---

# TRD 74-01: The live visual judge job in CI (fixtures, assertion, workflow)

<objective>
Give OPS-01 something to run. Today no workflow calls `verify flutter-ui-eval --judge live`, so the visual judge has
never been exercised against a real model in CI (objectives 32/33 left it advisory-only). This TRD builds, offline and
without any live step, a CI job that judges two real screenshots of this repository's own docs site with the live
model and fails unless the model genuinely looked at them.

Purpose: OPS-01 needs a CI job that runs the live judge on a push to `main`. The secret is set by the user in TRD 74-05,
and the job reaches `main` through TRD 74-04/74-08.
Output: fixture screenshots and manifest, `scripts/ci-visual-judge.cjs` (+ tests), `.github/workflows/visual-judge.yml`.
</objective>

<file_tree>
scripts/
├── ci-visual-judge.cjs                     ← CREATE
├── ci-visual-judge.test.cjs                ← CREATE
├── workflow-permissions.test.cjs           ← MODIFY (READ_ONLY_WORKFLOWS += visual-judge.yml)
└── __fixtures__/
    ├── visual-judge-rollups.cjs            ← CREATE (hand-built rollup builders)
    └── visual-judge/
        ├── manifest.json                   ← CREATE
        ├── labels.json                     ← CREATE
        ├── docs-home.png                   ← CREATE (real capture)
        └── docs-home-broken.png            ← CREATE (real capture, injected defect)
.github/workflows/
└── visual-judge.yml                        ← CREATE
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Resolved intent: kind plugin, work feature, tdd strict, test_list_first required, fixture_strategy generators (Task 1 is
the fixture builder). Constraints: no_llm_test_data (fixtures are hand-built builders and real captures),
no_property_based_default, no_gherkin_layer. User playbook (~/.claude/CLAUDE.md): one failing test at a time, then green.

Hard rules for this objective: no live step in this TRD (no push, no PR, no secret, no workflow run, no Anthropic API
call). Never port 8080: the local docs server for the capture uses 8091. AOForge never reads or types a secret value.

**Commit discipline (TRD 74-04 cherry-picks these commits onto a branch off `origin/main`):** every code commit of this
TRD contains only files from `files_modified` above, never an `.aoforge/` file. The SUMMARY commit is separate. Use
`node ~/.claude/aoforge/bin/aof-tools.cjs commit "<type>(74-01): <msg>" --files <paths>`.

Facts read during planning (2026-10-10):
- `verify flutter-ui-eval <manifest> --judge live --raw` (plugins/aoforge/aoforge/bin/lib/flutter-ui-eval.cjs) runs N
  live samples per state through `anthropicMessagesCall` (one curl to `${ANTHROPIC_BASE_URL:-https://api.anthropic.com}/v1/messages`,
  `x-api-key: $ANTHROPIC_API_KEY`, or `authorization: Bearer $ANTHROPIC_AUTH_TOKEN`).
- **A credential-less live run still reports `gate: "binding"` and exits 0**: each state's call throws, the state drops
  to `verdict: review` with `errors: ["no credential — ..."]` and no `evidence`, and an `expect: fail` state counts as
  `known_failing`. Running the CLI alone in CI would therefore be green without the secret. That is why the assertion script
  exists and why it requires `evidence: 'vision'` on every state.
- Rollup fields: `gate`, `judge` ('live-vision'), `network` (true), `model`, `samples`, `verdict`
  ('pass'|'pass-with-reviews'|'fail'), `counts`, `reviews[]`, `fails[]`, `known_failing[]`, `resolved[]` (expect:fail
  states that passed), `unjudged[]`, `known_broken[]`, `usage {input_tokens, output_tokens}`, `states[]` (each:
  `state_id, verdict, is_broken, flake, votes {broken, ok}, defects[], evidence, known_broken?, max_severity?, errors?`).
  Output above 50 KB is written to a temp file and stdout is `@file:<path>`.
- Manifest states may carry `expect: "fail"`; `unjudgedPolicy: "fail"` hard-gates unjudged states. HIGH-only blocking:
  a broken majority with only medium/low defects is `verdict: pass` + `known_broken: true`.
- The existing fixture `plugins/aoforge/aoforge/bin/lib/__fixtures__/flutter-ui-eval/` uses 70-byte placeholder PNGs:
  useless for a live judge. Do not reuse it.
- Local tools: hugo v0.167 (`/opt/homebrew/bin/hugo`), Google Chrome at `/Applications/Google Chrome.app`, actionlint at
  `/opt/homebrew/bin/actionlint`. CI: `node-version: '26'`, `actions/checkout@v7`, `actions/setup-node@v7`.
- Cost: 2 states x 3 samples = 6 vision calls per run, about 1.4K input tokens per 1280x800 image. That is cents per push to `main`.
</context>

<embedded_context>

<codebase_examples>
Script shape to copy: `scripts/ci-unit-gate.cjs`: pure exported functions, `function main()`, `process.exitCode = 1`
(never `process.exit()`, which can truncate stdout), `module.exports = {...}`, `if (require.main === module) { main(); }`,
`spawnSync(process.execPath, args, {...})` for the child.

Credential stripping in a test (plugins/aoforge/aoforge/bin/lib/flutter-ui-eval-dogfood.test.cjs, Case G3):
```js
const strippedEnv = { ...process.env };
delete strippedEnv.ANTHROPIC_API_KEY;
delete strippedEnv.ANTHROPIC_AUTH_TOKEN;
delete strippedEnv.ANTHROPIC_BASE_URL;
let out;
try {
  out = execFileSync(process.execPath, [DF_TOOLS, 'verify', 'flutter-ui-eval', MANIFEST, '--judge', 'labels', '--raw'],
    { encoding: 'utf-8', env: strippedEnv });
} catch (err) { out = err.stdout; }   // verdict:'fail' exits 1 but stdout still carries the rollup
```

Workflow conventions (`.github/workflows/test.yml`, `agent-shell-harness.yml`): a long header comment explaining why the
job exists and its known false-green risks; top-level `permissions:` block exactly `contents: read` (enforced by
`scripts/workflow-permissions.test.cjs` READ_ONLY_WORKFLOWS); `concurrency` group per ref with cancel-in-progress.
</codebase_examples>

<anti_patterns>
- Do not trust `gate: "binding"` or the CLI exit code as proof the model ran (see context: a credential-less run passes both).
- Do not print, log, echo or write any credential value. The script checks presence only (`Boolean(env.ANTHROPIC_API_KEY)`).
- Do not run the script or the CLI with `--judge live` locally with credentials present: always prefix local runs with
  `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL`. A real call costs money and is a live step.
- No generated or invented screenshots, labels or rollups: real captures, and rollups built by hand-written builder functions.
- No new npm dependency (the repo has no YAML or image library; read PNG width from the IHDR bytes).
- Do not add the legacy product word to any new file (the rename guard `plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`
  scans every tracked file; `devflow.cloud` is the only preserved form).
- Do not add the visual judge to any required-check list (it is path-filtered on pull requests and secret-dependent).
</anti_patterns>

<error_recovery>
- Chrome writes a 2560x1600 image on a Retina display: add `--force-device-scale-factor=1`; check with
  `sips -g pixelWidth -g pixelHeight <png>`.
- Port 8091 busy: `lsof -nP -iTCP:8091 -sTCP:LISTEN` and stop only a server this TRD started; never fall back to 8080.
- The site build fails on missing data: `site/data/aoforge.json` is tracked; do not run `scripts/gen-docs-data.cjs` (it
  rewrites a tracked file). Report the hugo error instead.
- actionlint flags shellcheck findings in `run:` blocks: fix them; do not add `# shellcheck disable` without a reason.
</error_recovery>

</embedded_context>

<gotchas>
- `spawnSync` of the CLI: the child's exit code is 1 on `verdict: fail`, yet its stdout still holds the rollup. Parse
  stdout regardless of status; treat empty stdout or a spawn `error` as a failure.
- `@file:<path>` stdout: read the JSON from that path (the CLI's 50 KB fallback).
- The broken fixture must be blatant enough that a live model calls it broken on a majority of 3 samples: hide the
  page's main content (a large blank region) AND force the headline to `white-space: nowrap; font-size: 160px` so it runs
  off the right edge mid-word. Subtle defects make CI flaky.
- `expect` lives on the manifest state (`"expect": "fail"`), not in labels.json.
</gotchas>

## Test list

Behaviour cases for `scripts/ci-visual-judge.test.cjs`, outermost first. Each is one `test('...')`; write one, see it
fail, make it pass, then the next. Inject `{ env, spawn, readFile, out, err }` into `main` so no case touches the network.

CLI `main(argv, deps)`:
1. No `ANTHROPIC_API_KEY` and no `ANTHROPIC_AUTH_TOKEN` → exitCode 1, stderr names both variables and says to set a
   repository secret, and `spawn` is never called.
2. Credential present (fake value `test-only-not-a-key`), spawn returns a passing live rollup → exitCode 0; stdout carries
   `gate=binding`, the model, one line per state and the token totals; neither stdout nor stderr contains the fake value.
3. Spawn is called with `[<repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs, 'verify', 'flutter-ui-eval', <manifest>, '--judge', 'live', '--raw']`.
4. Spawn stdout `@file:<tmp>` → the rollup is read from that file.
5. Spawn stdout empty or not JSON (or spawn `error` set) → exitCode 1, "could not parse the judge's output".
6. Missing manifest argument → exitCode 1 with usage.

`assertLiveRollup(rollup, manifest)` → `{ ok, failures[], warnings[] }`:
7. Happy path (docs-home not broken, docs-home-broken broken with a high overflow, both `evidence: 'vision'`) → ok.
8. `gate !== 'binding'` or `judge !== 'live-vision'` or `network !== true` → failure "not a live run".
9. A state with `errors` or without `evidence: 'vision'` → failure naming the state and its first error.
10. An expect-pass state in `fails[]` (judged broken with a HIGH defect) → failure naming it.
11. An expect-pass state judged broken below HIGH (`known_broken`) → ok, with a warning naming it.
12. An expect-pass state with `verdict: review` and `flake: true`, `is_broken: false` → ok, with a flake warning.
13. The expect-fail state judged not broken (in `resolved[]`, `is_broken: false`) → failure "the judge missed the known defect".
14. `unjudged[]` non-empty → failure.
15. `states.length` differs from `manifest.states.length`, or a manifest state_id is missing → failure.
16. `usage.input_tokens` missing or 0 → failure "no tokens were spent".

Fixture (real files, no network):
17. The committed manifest resolves through the real CLI offline (`--judge labels`, credentials stripped): 2 states,
    `known_failing` = [docs-home-broken], verdict pass; each `screenshot_path` is a PNG (magic bytes) with IHDR width ≥ 360
    and file size > 10 KB.

<tasks>

<task type="auto">
  <name>Task 1: Capture the real docs screenshots and write the fixture builders</name>
  <files>scripts/__fixtures__/visual-judge/manifest.json, scripts/__fixtures__/visual-judge/labels.json, scripts/__fixtures__/visual-judge/docs-home.png, scripts/__fixtures__/visual-judge/docs-home-broken.png, scripts/__fixtures__/visual-judge-rollups.cjs</files>
  <action>
Capture (one plain command per Bash call; `<scratch>` is the session scratchpad):
1. `hugo --source site --minify --baseURL http://127.0.0.1:8091/ --destination <scratch>/site-8091`
2. Make the broken variant: copy `<scratch>/site-8091/index.html` to `<scratch>/site-8091/broken/index.html` and insert,
   just before `</head>`, a `<style>` that hides the page's main content (inspect the built HTML for the main/content
   container selector) and sets the first `h1` to `white-space:nowrap; font-size:160px` with `!important`. Use the Edit
   tool on the scratch copy (it is outside the repo).
3. Start `python3 -m http.server 8091 --bind 127.0.0.1 --directory <scratch>/site-8091` in the background
   (run_in_background). Never 8080.
4. `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 --screenshot=<repo>/scripts/__fixtures__/visual-judge/docs-home.png http://127.0.0.1:8091/`
   and the same for `.../docs-home-broken.png` from `http://127.0.0.1:8091/broken/`.
5. Stop the server you started. Look at both PNGs with the Read tool: the first is the normal home page; the second
   visibly overflows and is mostly blank. Check `sips -g pixelWidth -g pixelHeight` gives 1280x800 for both.

Write `manifest.json`: `objective: "OPS-01-LIVE-JUDGE"`, a `note` with the provenance (capture date, `git rev-parse --short HEAD`,
the hugo, server and Chrome commands, what the injected style does, "hand-built; no generated data"), `samples: 3`,
`flakeBudget: 1`, `unjudgedPolicy: "fail"`, and two states: `docs-home` (route `/`, data_state `populated`, viewport
1280x800, `screenshot_path: "./docs-home.png"`) and `docs-home-broken` (same, `screenshot_path: "./docs-home-broken.png"`,
`"expect": "fail"`). Both share one `expected` text: "The AOForge documentation home page: the site header with the AOForge
brand and navigation links, a large headline and introductory text that fit inside the viewport, and readable content
sections below. Nothing is cut off at the viewport edge, nothing overlaps, and there are no large blank regions."
Write `labels.json`: `docs-home` `{ "is_broken": false }`; `docs-home-broken` `{ "is_broken": true, "type": "overflow", "severity": "high" }`.

Write `scripts/__fixtures__/visual-judge-rollups.cjs` (CommonJS, hand-written builder functions, no randomness):
`liveState(overrides)` (default: verdict pass, is_broken false, flake false, votes {broken:0, ok:3}, defects [],
evidence 'vision'), `brokenLiveState(overrides)` (is_broken true, verdict fail, votes {broken:3, ok:0}, one high overflow
defect), `downgradedState(stateId, error)` (verdict review, is_broken null, defects [], errors [error], no evidence),
`liveRollup(overrides)` (gate binding, judge live-vision, network true, model 'claude-test-model', samples 3, verdict pass,
fails [], reviews [], known_failing ['docs-home-broken'], resolved [], unjudged [], known_broken [], usage
{input_tokens: 8400, output_tokens: 900}, states [liveState({state_id:'docs-home'}), brokenLiveState({state_id:'docs-home-broken'})]),
and `fixtureManifest()` (reads the committed manifest.json). Export them.

Commit the four fixture files and the builder module with `aof-tools commit "test(74-01): add the live visual judge fixtures" --files <the five paths>`.
  </action>
  <verify>sips -g pixelWidth -g pixelHeight scripts/__fixtures__/visual-judge/docs-home.png scripts/__fixtures__/visual-judge/docs-home-broken.png (1280x800 each); ls -l scripts/__fixtures__/visual-judge/ (each PNG over 10 KB); env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node plugins/aoforge/aoforge/bin/aof-tools.cjs verify flutter-ui-eval scripts/__fixtures__/visual-judge/manifest.json --judge labels --raw (resolution resolved, 2 states, known_failing [docs-home-broken], verdict pass)</verify>
  <done>Two real 1280x800 screenshots (good and blatantly broken), the manifest, labels and builder module are committed in one code-only commit.</done>
  <recovery>If Chrome headless cannot capture, use the Playwright CLI already cached (`npx --yes playwright screenshot --viewport-size "1280, 800" <url> <png>`); record which tool produced the files in the manifest note.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: scripts/ci-visual-judge.cjs, the assertion that the live model really looked</name>
  <files>scripts/ci-visual-judge.cjs, scripts/ci-visual-judge.test.cjs</files>
  <action>
Strict TDD through the Test list (cases 1-17), one case at a time: RED commit
(`test(74-01): ...` with only the test file), GREEN commit (`feat(74-01): ...` with the script and test). Test fixtures
come only from `scripts/__fixtures__/visual-judge-rollups.cjs` and the committed manifest.

Module shape:
```
assertLiveRollup(rollup, manifest) -> { ok, failures, warnings }
  live-run check: gate === 'binding' && judge === 'live-vision' && network === true
  index rollup.states by state_id; every manifest state present; lengths equal
  for each manifest state s (expect = s.expect || 'pass'), r = state detail:
    r.errors?.length || r.evidence !== 'vision'  -> failure "<id>: not judged by the live model: <first error>"
    expect pass: rollup.fails includes id -> failure; r.known_broken -> warning; r.verdict==='review' && r.flake -> warning
    expect fail: r.is_broken !== true -> failure "<id>: the judge missed the known defect"
  rollup.unjudged non-empty -> failure; !(rollup.usage?.input_tokens > 0) -> failure
  rollup.verdict === 'fail' and no failure recorded yet -> failure naming fails[]/reviews[]
renderSummary(rollup, result) -> string (one header line "live visual judge: gate=<g> judge=<j> model=<m> samples=<n>",
  one line per state "<id> expect=<e> verdict=<v> is_broken=<b> votes=<broken>/<total> evidence=<ev>[ (<sev> <type>)]",
  "tokens: input=<i> output=<o>", then WARN/FAIL lines and a final PASS or FAIL line)
main(argv = process.argv.slice(2), deps = { env: process.env, spawn: spawnSync, readFile: fs.readFileSync, out, err })
  manifest arg required (usage -> exitCode 1)
  credential = deps.env.ANTHROPIC_API_KEY || deps.env.ANTHROPIC_AUTH_TOKEN; absent -> stderr
    "ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) is not available to this run: set it as a repository secret" ; exitCode 1
  spawn(process.execPath, [AOF_TOOLS, 'verify','flutter-ui-eval', manifest, '--judge','live','--raw'], { encoding:'utf-8', env: deps.env, maxBuffer: 64 MiB })
  stdout '@file:' prefix -> readFile; JSON.parse; on failure exitCode 1 "could not parse the judge's output"
  print a ::group::rollup / ::endgroup:: block with the JSON (no secrets in it), then renderSummary; exitCode = ok ? 0 : 1
# CRITICAL: never print any env value; only presence is checked
# PATTERN: scripts/ci-unit-gate.cjs main()/exports/require.main
```
AOF_TOOLS resolves from `__dirname` (`path.join(__dirname, '..', 'plugins', 'aoforge', 'aoforge', 'bin', 'aof-tools.cjs')`).
Case 17 runs the real CLI with `--judge labels` and stripped credentials (no network) and reads PNG width from bytes
16-19 of the file (IHDR, big-endian).
  </action>
  <verify>node --test scripts/ci-visual-judge.test.cjs (17 pass); env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node scripts/ci-visual-judge.cjs scripts/__fixtures__/visual-judge/manifest.json; echo "exit=$?" (exit=1 with the not-available message, nothing else run)</verify>
  <done>All 17 cases pass with no network; RED then GREEN commits exist; the credential-less run fails loudly.</done>
  <recovery>If a case cannot be expressed without the network, inject the dependency instead of skipping the case.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: .github/workflows/visual-judge.yml, held to the read-only permissions guard</name>
  <files>.github/workflows/visual-judge.yml, scripts/workflow-permissions.test.cjs</files>
  <action>
RED: add `'visual-judge.yml'` to `READ_ONLY_WORKFLOWS` in `scripts/workflow-permissions.test.cjs` (the test fails: the file
does not exist). Commit `test(74-01): hold visual-judge.yml to contents: read`.

GREEN: create the workflow with a header comment in the house style: what it proves (the live model judges two real docs
screenshots and must agree with their labels; a credential-less run fails, not passes), why it is not a required check
(path-filtered on pull requests, needs a secret fork PRs never get), and the cost (6 vision calls per run).
```yaml
name: Live visual judge
on:
  push:
    branches: [main]
  pull_request:
    paths:
      - 'scripts/ci-visual-judge.cjs'
      - 'scripts/__fixtures__/visual-judge/**'
      - 'plugins/aoforge/aoforge/bin/lib/flutter-ui-eval*.cjs'
      - 'plugins/aoforge/aoforge/references/model-profiles.json'
      - '.github/workflows/visual-judge.yml'
  workflow_dispatch:
concurrency:
  group: visual-judge-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read

jobs:
  judge:
    name: live visual judge
    # Secrets never reach a fork's pull request; run only where they exist.
    if: github.repository == 'AO-Cyber-Systems/aoforge-claude' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '26'
      - name: Judge the fixture screenshots with the live model
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ANTHROPIC_AUTH_TOKEN: ${{ secrets.ANTHROPIC_AUTH_TOKEN }}
          ANTHROPIC_BASE_URL: ${{ secrets.ANTHROPIC_BASE_URL || vars.ANTHROPIC_BASE_URL }}
        run: node scripts/ci-visual-judge.cjs scripts/__fixtures__/visual-judge/manifest.json
```
Commit `ci(74-01): run the live visual judge on pushes to main`.
  </action>
  <verify>node --test scripts/workflow-permissions.test.cjs (passes, including "visual-judge.yml grants exactly contents: read"); actionlint .github/workflows/visual-judge.yml (no findings); node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs (passes)</verify>
  <done>The workflow exists, passes actionlint and the permissions guard, and no new file trips the rename guard.</done>
  <recovery>If actionlint rejects `secrets.X || vars.Y`, map ANTHROPIC_BASE_URL from `secrets.ANTHROPIC_BASE_URL` only and say so in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test scripts/ci-visual-judge.test.cjs scripts/workflow-permissions.test.cjs` passes with credentials stripped.
- `actionlint .github/workflows/visual-judge.yml` is clean.
- `git log --format='%h %s' -- scripts/ci-visual-judge.cjs scripts/__fixtures__/visual-judge .github/workflows/visual-judge.yml scripts/workflow-permissions.test.cjs scripts/__fixtures__/visual-judge-rollups.cjs`
  lists only `(74-01)` commits, and `git show --name-only --format= <sha>` for each lists no `.aoforge/` path (TRD 74-04 cherry-picks them).
- `npm test` passes, apart from the failures already known on this branch, which the SUMMARY names.
</verification>

<success_criteria>
- A CI job exists that can only go green when a live model judged both real screenshots and agreed with their labels.
- Nothing live happened: no push, no secret, no workflow run, no Anthropic call.
</success_criteria>

<output>
After completion, write `74-01-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-01 --from <draft>`,
listing every code commit SHA (TRD 74-04 cherry-picks exactly those).
</output>
