---
objective: 70-cli-defects-and-hook-shape
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/state.cjs
  - plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: [TOOL-07]
must_haves:
  truths:
    - "`df-tools state update-progress` on a STATE.md whose `## Current Position` section holds the template's plain `Progress: [░░░░░░░░░░] 0%` line rewrites that line to the computed bar (label kept), exits 0 with `updated: true`, and leaves every other byte of the file unchanged"
    - "On a STATE.md that has a `## Current Position` section but no Progress line (this repository's shape), it inserts `**Progress:** <bar>` after the last non-blank line of that section (before the first following heading of any level), exits 0 with `updated: true, inserted: true`, writes `progress_pct` to state.json, and a second run updates that line in place, leaving exactly one Progress line"
    - "With no Progress line and no `## Current Position` heading, or with no STATE.md in local mode, it exits 1 with an `Error:` line on stderr and writes neither STATE.md nor state.json"
    - "A bold `**Progress:**` field is updated exactly as before: the 48-13 characterization test 2c in state.test.cjs passes unchanged, and store mode is unchanged (test 6c)"
    - "`df-tools verify trd-pre 99` run with cwd `<root>/.planning/objectives/99-test`, or any other directory below the project root, reports the same `checks` as from `<root>`, and requirement coverage reads `<root>/.planning/ROADMAP.md`"
    - "`verify trd-pre <path to an objective directory>` (relative or absolute, trailing slash allowed) resolves that objective from any cwd"
    - "`verify trd-pre` for an objective that does not exist exits 1 with JSON `error: \"Objective not found\"` and `project_root`; with `--raw` it prints `Objective not found` and exits 1"
    - "`objective-job-index` puts a boolean `gap_closure` on every job: `true` for a TRD (or legacy JOB) whose frontmatter has `gap_closure: true`, `false` otherwise"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs
      provides: "hand-built builders: STATE.md variants, a temp project with objectives/TRDs/SUMMARYs, TRD text with frontmatter, a spawned df-tools runner under a fake HOME"
      exports: ["stateMd", "makeProject", "trdText", "runDfTools", "cleanupAll"]
    - path: plugins/devflow/devflow/bin/lib/state.cjs
      provides: "setProgressLine(content, bar) -> {content, how} | null; cmdStateUpdateProgress updates, inserts or exits 1"
      exports: ["setProgressLine", "cmdStateUpdateProgress"]
    - path: plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs
      provides: "spawned-CLI and in-process tests for the four STATE.md shapes and the two error exits"
    - path: plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
      provides: "resolveTarget(cwd, arg) -> {root, name}; not-found exits 1"
    - path: plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs
      provides: "spawned objective-job-index tests for gap_closure"
  key_links:
    - from: "state.cjs cmdStateUpdateProgress"
      to: "state.cjs setProgressLine"
      via: "bold field, then plain line in ## Current Position, then insertion; null -> error()"
      pattern: "setProgressLine\\("
    - from: "trd-pre-check.cjs cmdVerifyTrdPre"
      to: "estimate-run-store.cjs findProjectRoot"
      via: "resolveTarget walks up to the directory that holds .planning/"
      pattern: "findProjectRoot\\("
    - from: "misc.cjs cmdObjectiveJobIndex job object"
      to: "TRD frontmatter gap_closure"
      via: "boolean read like estimate.cjs"
      pattern: "gap_closure:"
    - from: "workflows/execute-objective.md discover_and_group_plans"
      to: "objective-job-index jobs[].gap_closure"
      via: "--gaps-only filter names the field"
      pattern: "gap_closure"
---

# TRD 70-01: `state update-progress`, `verify trd-pre` and `objective-job-index` do what they say (TOOL-07)

<objective>
The v1.5 audit (`.planning/milestones/v1.5-MILESTONE-AUDIT.md` line 50) logged three df-tools defects as noise. Each one
reports success, or a confident "not found", while doing nothing useful. Root causes, all confirmed while planning:

1. **`state update-progress` silent no-op.** `cmdStateUpdateProgress` (`lib/state.cjs` 462-506) only matches a bold
   `**Progress:**` field. The bundled template (`devflow/templates/state.md` line 26) writes a plain
   `Progress: [░░░░░░░░░░] 0%` line, and this repository's STATE.md has no Progress line at all. Either way the command
   prints `{updated: false, reason: 'Progress field not found in STATE.md'}` and **exits 0**. A missing STATE.md also
   exits 0 with `{error}`.
2. **`verify trd-pre 64` -> "Objective not found".** The job-checker ran it from
   `.planning/objectives/64-estimate-accuracy-validation/` (transcript `2ff5b69b…/agent-a3ecd5611d95c61a4.jsonl`,
   2026-10-07). `cmdVerifyTrdPre` resolves objectives against `cwd` only. Any cwd below the project root fails, and so
   does a path argument (`verify trd-pre .planning/objectives/64-…`). Not-found also **exits 0**.
3. **`objective-job-index` `gap_closure` null.** The job object (`lib/misc.cjs` 300-308) has no `gap_closure` key, so
   `execute-objective --gaps-only` ("skip non-gap_closure plans") has nothing to filter on.

Fix all three: update or exit 1, resolve from anywhere inside the project, and report `gap_closure`. Success criteria
1-3 of objective 70.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── __fixtures__/cli-defects-fixtures.cjs   ← CREATE
├── state.cjs                               ← MODIFY (setProgressLine, cmdStateUpdateProgress)
├── state-update-progress.test.cjs          ← CREATE
├── trd-pre-check.cjs                       ← MODIFY (resolveTarget, not-found exit 1)
├── trd-pre-check.test.cjs                  ← MODIFY (new describe block)
├── misc.cjs                                ← MODIFY (gap_closure on each job)
└── misc-job-index.test.cjs                 ← CREATE
plugins/devflow/devflow/workflows/execute-objective.md   ← MODIFY (discover_and_group_plans prose)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (RED, then GREEN, then optional REFACTOR, as atomic commits per task),
test list first, hand-built fixture builders (`no_llm_test_data`), no property-based libraries, no `.feature` files.
User playbook (`~/.claude/CLAUDE.md`, TDD & Quality): write the failing test before the implementation. Write one test
at a time and watch it fail for the right reason.

Read narrowly (`rg -n` first, then `offset`/`limit`):
- `plugins/devflow/devflow/bin/lib/state.cjs`: requires 1-12, `stateReplaceField` 106-113, `sessionReplacePlainField`
  115-145 (the model for a section-scoped plain-line replace), `cmdStateUpdateProgress` 462-506, exports ~775-800.
- `plugins/devflow/devflow/bin/lib/state.test.cjs`: `tmpProject`/`run` 73-97, `CHAR_STATE` 400-420, test 2c 529-536,
  test 6c ~673. Do not edit this file; 2c and 6c must pass untouched.
- `plugins/devflow/devflow/bin/lib/trd-pre-check.cjs`: requires 25-33, `extractRoadmapRequirements` 129, `cmdVerifyTrdPre`
  410-492.
- `plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs`: test list 1-50, `runCheck` 71-106, the non-existent test
  539-563. Fixture: `lib/__fixtures__/trd-pre-fixtures.cjs` `setupObjectiveDir` 85-131 (returns the objective dir).
- `plugins/devflow/devflow/bin/lib/estimate-run-store.cjs` `findProjectRoot` 150-170 (exported, tested in
  `estimate-run-store.test.cjs` test 13; inclusive of `start`, bounded at `MAX_UP = 8`, never throws).
- `plugins/devflow/devflow/bin/lib/misc.cjs` `cmdObjectiveJobIndex` 231-341.
- `plugins/devflow/devflow/workflows/execute-objective.md` `discover_and_group_plans` 241-251.
</context>

## Test list

Outermost layer first (spawned `df-tools` with a fake HOME), then the in-process helper. Write and run one at a time.

**`state update-progress`** (`state-update-progress.test.cjs`; the project has objective `07-x` with 2 TRDs and 1
SUMMARY, so the bar is `[█████░░░░░] 50%`):
1. Plain template line `Progress: [░░░░░░░░░░] 0%` inside `## Current Position` -> becomes `Progress: [█████░░░░░] 50%`;
   exit 0; JSON `{updated: true, percent: 50, completed: 1, total: 2, bar: '[█████░░░░░] 50%'}`; the file equals the
   input with only that line changed; state.json `progress_pct` 50.
2. A plain `Progress:` line under `## Session Continuity` only (none in Current Position) -> that line is untouched, and
   a bold line is inserted in Current Position.
3. No Progress line, `## Current Position` with bold fields, then `## Next` -> `**Progress:** [█████░░░░░] 50%` inserted
   directly after the last non-blank line of the section, before the blank line and `## Next`; exit 0; JSON has
   `inserted: true`.
4. Current Position followed by a `### Blockers` subheading inside it -> the insertion lands before `### Blockers`, not
   under it.
5. Running twice after an insertion -> exactly one line matches `/Progress:/`, and the second JSON has no `inserted`.
6. `--raw` on an insertion prints `[█████░░░░░] 50%` only.
7. No Progress line and no `## Current Position` heading -> exit 1; stderr starts `Error:` and names `## Current Position`;
   STATE.md byte-identical; state.json not created (and unchanged when it existed).
8. Local mode, no STATE.md -> exit 1; stderr contains `STATE.md not found`; no state.json written.
9. In-process `setProgressLine` table: bold -> `how: 'bold'`; plain -> `'plain'`; missing -> `'inserted'`; empty
   section (heading straight into the next heading) -> inserted after the heading with a blank line; no section -> `null`.

**`verify trd-pre`** (`trd-pre-check.test.cjs`, new `describe('resolution from inside the project (TRD 70-01)')`, using
`setupObjectiveDir`):
10. cwd = the objective dir, arg `99` -> `result.checks` deep-equals the run from the root; no `error` key.
11. cwd = `<root>/src/deep` (created, no `.planning/`) -> resolves.
12. Requirement coverage from a nested cwd reads the root ROADMAP: with `roadmap_requirements: ['F1','F2']` and only F1
    covered, `missing` is `['F2']` from both cwds.
13. Arg = `.planning/objectives/99-test` from the root, `<abs objective dir>/` from `os.tmpdir()` -> both resolve.
14. A cwd that has its own `.planning/` is used as-is: `<root>/inner/.planning/objectives/` (empty) with cwd
    `<root>/inner` -> not found with `project_root` = `<root>/inner` (no walk past an existing `.planning/`).
15. Not found -> exit 1, JSON `error: 'Objective not found'`, `project_root` = the resolved root. `--raw` -> stdout
    `Objective not found`, exit 1. Tighten the existing test at 539 to `assert.equal(exitCode, 1)`.

**`objective-job-index`** (`misc-job-index.test.cjs`, spawned):
16. `07-01-a-TRD.md` with `gap_closure: true`, `07-02-b-TRD.md` without the key, `07-03-c-TRD.md` with
    `gap_closure: false` -> `gap_closure` `true`, `false`, `false` (booleans, `strictEqual`).
17. Every job object has the key (`'gap_closure' in job`), including a legacy `07-04-JOB.md` with `gap_closure: true` ->
    `true`.
18. `jobs.filter(j => j.gap_closure).map(j => j.id)` is exactly `['07-01-a', '07-04']`, the `--gaps-only` selection.

<embedded_context>

<codebase_examples>
The current progress write (`state.cjs` 494-505). The bold branch must stay byte-for-byte, because test 2c pins it:
```js
  let content = fs.readFileSync(statePath, 'utf-8');
  const progressPattern = /(\*\*Progress:\*\*\s*).*/i;
  if (progressPattern.test(content)) {
    content = content.replace(progressPattern, `$1${progressStr}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    writeStateJson(cwd, { progress_pct: percent });
    output({ updated: true, percent, completed: totalSummaries, total: totalJobs, bar: progressStr }, raw, progressStr);
  } else {
    writeStateJson(cwd, { progress_pct: percent });
    output({ updated: false, reason: 'Progress field not found in STATE.md' }, raw, 'false');
  }
```
The section-scoped plain-line pattern already in `state.cjs` (`sessionReplacePlainField`, 122-145): find the heading
with `/^## Session Continuity[ \t]*$/m`, slice to the next `/^## /m`, then match `^(Label:[ \t]*)(.*)$` with `im`.

`output(result, raw, rawValue, exitCode = 0)` and `error(message)` (stderr `Error: …`, exit 1) live in `helpers.cjs` 25-46.

The spawned-CLI test shape (`state.test.cjs` 87-97):
```js
function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd, env: fakeHomeEnv(), encoding: 'utf-8', timeout: 30000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
```
The job-index frontmatter reads (`misc.cjs` ~270-300). `extractFrontmatter` returns `'true'` (a string) for
`gap_closure: true`. `estimate.cjs` 289 reads it as `fm.gap_closure === true || fm.gap_closure === 'true'`, and
`calibration-inputs.cjs` 493 as `String(fm.gap_closure).trim().toLowerCase() === 'true'`.
</codebase_examples>

<anti_patterns>
- Do not walk up from cwd for every df-tools command, and do not change `normalizeObjectiveName` or
  `findObjectiveInternal`. Both are shared by about 20 callers. The walk-up is local to `verify trd-pre`.
- Do not copy a third root finder: `estimate-run-store.findProjectRoot` exists and is tested; `session-audit.cjs` has a
  cached variant. Require the exported one.
- Do not change the success JSON of `verify trd-pre` (the 48-03 characterization test deep-equals `checks`). Add
  `project_root` only to the not-found result.
- Do not change the bold-field branch, the store-mode branch, or the JSON shape of a bold/plain update (`inserted` appears
  only on an insertion).
- An error path must write nothing: decide the outcome before the first `writeFileSync` / `writeStateJson`.
- No generated fixture data. STATE.md variants are literal strings in the fixture file.
</anti_patterns>

<error_recovery>
- Test 2c in `state.test.cjs` fails: the bold branch changed. Restore the exact `progressPattern` replace and keep
  `setProgressLine`'s first branch identical to it.
- The trd-pre in-process harness (`runCheck`) throws `__process_exit_1__` and returns `exitCode: 1` on a not-found
  result: `output(..., 1)` calls `process.exit(1)` after writing, so capture works unchanged.
- A tmp-dir test that expects "no `.planning/` anywhere" resolves a root above `os.tmpdir()`. Assert only exit 1 and
  `error`, not `project_root`, for that case.
</error_recovery>

</embedded_context>

<gotchas>
- `^` with the `m` flag also matches at offset 0 of a sliced string. Slice the section *after* the heading line's end,
  and search the next heading with `/^#{1,6}[ \t]/m` on that slice.
- The bold search is file-wide (unchanged). The plain search and the insertion are scoped to `## Current Position`, so a
  `Progress:` line in another section is never rewritten.
- This repository's STATE.md (Current Position 12-64, then `## Branch State (post-merge)`) gets the inserted line on its
  first run. Do not run the repository df-tools `state update-progress` against the live `.planning/` here; 70-03 dogfoods
  on a scratch copy.
- `findProjectRoot` lives in `estimate-run-store.cjs`. Its only lazy require (`upgrade.cjs`) is inside another function,
  so requiring it from `trd-pre-check.cjs` is cheap.
- `misc-job-index.test.cjs` must use a fake HOME and a mkdtemp project; never the real `~/.claude`.
- One plain command per Bash call (the worktree guard refuses compound commands). Commit with `df-tools commit`, never
  raw `git commit`. Never use port 8080.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builders, then `state update-progress` updates, inserts or exits 1</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs, plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs, plugins/devflow/devflow/bin/lib/state.cjs</files>
  <action>
First create the hand-built fixture file `lib/__fixtures__/cli-defects-fixtures.cjs` (CommonJS, node core only, header
comment "TRD 70-01, hand-built; nothing generated"). Tasks 1 and 3 share it. Exports:
- `stateMd(variant)`: literal STATE.md strings for `'plain'` (template shape: `## Current Position`, `Objective: 7 of 9`,
  `Status: Planning`, blank, `Progress: [░░░░░░░░░░] 0%`, blank, `## Accumulated Context`), `'bold-no-field'`
  (`**Status:** Planning` and `**Last Activity:** 2026-01-01` lines, blank, `## Next`), `'subheading'` (bold lines, then
  `### Blockers` with a bullet inside the section, then `## Next`), `'plain-elsewhere'` (bold-no-field plus a
  `## Session Continuity` section holding `Progress: elsewhere`), `'no-position'` (`# Project State` and
  `## Notes` only), `'empty-position'` (`## Current Position` directly followed by `## Next`). Throw on an unknown variant.
- `trdText(frontmatter, body = <one <task type="auto"> with name/action/verify/done>)`: `---`, one `key: value` line per
  entry (arrays as `[a, b]`), `---`, body.
- `makeProject({ stateMd, stateJson, objectives, config })`: mkdtemp `df-cli-defects-`, writes `.planning/STATE.md`
  when `stateMd` is a string, `state.json` when given, and `objectives` as `{ '07-x': { '07-01-a-TRD.md': '<text>' } }`.
  Tracks dirs for `cleanupAll()`.
- `runDfTools(args, cwd)`: spawn `bin/df-tools.cjs` with a mkdtemp fake HOME (the `state.test.cjs` `run` shape) and
  return `{status, stdout, stderr, json}`.

Then RED: write `state-update-progress.test.cjs` with test-list cases 1-9, one at a time. Each case uses a project with
`07-x` holding `07-01-TRD.md`, `07-02-TRD.md` and `07-01-SUMMARY.md` (50%). Commit the failing tests.

GREEN in `state.cjs`:
```
setProgressLine(content, bar):                       # pure, exported
  bold = /(\*\*Progress:\*\*\s*).*/i                 # unchanged pattern
  if bold matches -> return { content: content.replace(bold, `$1${bar}`), how: 'bold' }
  h = content.match(/^## Current Position[ \t]*$/m); if !h -> return null
  start = h.index + h[0].length; rest = content.slice(start)
  n = rest.search(/^#{1,6}[ \t]/m); end = n === -1 ? content.length : start + n
  section = content.slice(start, end)
  if /^(Progress:[ \t]*)(.*)$/im matches section -> replace in section, return how 'plain'
  body = section.replace(/\s+$/, ''); tail = section.slice(body.length)
  line = `**Progress:** ${bar}`
  inserted = body === '' ? `\n\n${line}` : `${body}\n${line}`
  if tail has no newline (EOF straight after) -> tail = '\n'
  return { content: content.slice(0,start) + inserted + tail + content.slice(end), how: 'inserted' }
```
In `cmdStateUpdateProgress`: keep the store branch unchanged. Local mode: a missing STATE.md is
`error('STATE.md not found at .planning/STATE.md')`. Compute the bar as today, then `r = setProgressLine(content, bar)`.
If `r` is null, call `error('STATE.md has no Progress line and no "## Current Position" heading to add one under')`
before writing anything. Otherwise write STATE.md and `writeStateJson(cwd, { progress_pct })`, then output
`{ updated: true, ...(r.how === 'inserted' ? { inserted: true } : {}), percent, completed, total, bar }` (a bold or
plain update keeps exactly today's five keys, which test 2c deep-equals). `--raw` keeps printing the bar. Export
`setProgressLine`. Update the one-line JSDoc above the function.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs
  </verify>
  <done>Cases 1-9 pass. The RED commit precedes GREEN. `state.test.cjs` 2c and 6c pass with that file unchanged
(`git diff --quiet HEAD -- plugins/devflow/devflow/bin/lib/state.test.cjs`). No code path prints `updated: false`.</done>
  <recovery>If a STATE.md shape outside the test list breaks the insertion, add it as a new fixture variant and test
before changing the regex. Revert with `git checkout -- plugins/devflow/devflow/bin/lib/state.cjs` and redo GREEN.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `verify trd-pre` resolves the objective from anywhere inside the project, and not-found exits 1</name>
  <files>plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.cjs</files>
  <action>
RED: append `describe('resolution from inside the project (TRD 70-01)')` to `trd-pre-check.test.cjs` with test-list
cases 10-15. Use `setupObjectiveDir(tmpDir, { objective: '99-test', roadmap_requirements: [...], trds: [...] })`, the
existing hand-built builder; no new fixture file is needed. Use the existing `runCheck(cwd, objective)` and add a
small `runCheckRaw` beside it that passes `raw = true` and returns `{ stdout, exitCode }`. Tighten the existing
non-existent test (539) to `assert.equal(exitCode, 1)`. Add the test-list lines for section 9 to the comment at the top
of the file. Commit RED.

GREEN in `trd-pre-check.cjs`:
```
const { findProjectRoot } = require('./estimate-run-store.cjs');

// verify trd-pre <arg> from any cwd inside the project (TRD 70-01): the job-checker ran it from the objective directory.
function resolveTarget(cwd, arg):
  if /[\\/]/.test(arg):                        # a path to an objective directory
    dir = path.resolve(cwd, arg)
    return { root: findProjectRoot(dir) || cwd, name: path.basename(dir) }
  return { root: findProjectRoot(cwd) || cwd, name: arg }   # inclusive: a cwd with .planning/ is itself the root
```
In `cmdVerifyTrdPre`, call `resolveTarget` first, then `findObjectiveInternal(root, name)`. Replace the other two `cwd`
uses (the objective-dir join and `checkRequirementCoverage(cwd, …)`) with `root`. Not found:
`output({ error: 'Objective not found', objective, project_root: root, elapsed_ms }, raw, 'Objective not found', 1)`.
Keep `objective` in every result as the argument the caller passed. Leave the empty-TRD branch and the success shape
as they are.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
  </verify>
  <done>Cases 10-15 and every earlier trd-pre test pass, including the 48-03 characterization. With the repository df-tools,
`node plugins/devflow/devflow/bin/df-tools.cjs --cwd .planning/objectives/64-estimate-accuracy-validation verify trd-pre 64 --raw`
prints `valid — 5/5 dimensions passed` (read-only on the live tree).</done>
  <recovery>If the 48-03 characterization fails, the success output changed. Diff the result keys against `HEAD` and remove
anything added outside the not-found branch.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: `objective-job-index` reports `gap_closure` from frontmatter, and execute-objective reads it</name>
  <files>plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: create `misc-job-index.test.cjs` (header test list = cases 16-18) using `makeProject` / `trdText` / `runDfTools`
from the Task 1 fixture file. Objective `07-x` holds `07-01-a-TRD.md` (`gap_closure: true`), `07-02-b-TRD.md` (no key),
`07-03-c-TRD.md` (`gap_closure: false`) and `07-04-JOB.md` (`gap_closure: true`). Run `objective-job-index 07` with
the project root as cwd. Commit RED.

GREEN in `misc.cjs` `cmdObjectiveJobIndex`, beside the `autonomous` parse:
```js
// TRD 70-01: --gaps-only filters on this; absent means a planned (non-gap) TRD.
const gapClosure = fm.gap_closure === true || String(fm.gap_closure ?? '').trim().toLowerCase() === 'true';
```
and add `gap_closure: gapClosure` to the job object directly after `autonomous`.

Docs in `workflows/execute-objective.md` `discover_and_group_plans`: the parse line says `plans[]`, but the JSON key is
`jobs`. Change it to `jobs[]` (each with `id`, `wave`, `autonomous`, `gap_closure`, `objective`, `files_modified`,
`task_count`, `has_summary`). Change the filter sentence to: "If `--gaps-only`: also skip jobs whose `gap_closure` is
not `true`." Leave the rest of the step alone.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs
  </verify>
  <done>Cases 16-18 pass, and so do the existing job-index tests (df-tools.test.cjs `objective-job-index command`,
summary-pairing, objective.test 7). `rg -n "gap_closure" plugins/devflow/devflow/workflows/execute-objective.md` shows
the parse and filter lines. The repository df-tools `objective-job-index 64` reports `gap_closure: true` for 64-07 to
64-10 and `false` for 64-01 to 64-06.</done>
  <recovery>If df-tools.test.cjs is slow or flaky, run it alone to separate a real failure from a known worktree-only
daemon failure (see 70-03 baseline). Revert with `git checkout -- plugins/devflow/devflow/bin/lib/misc.cjs`.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line names its files)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs` passes.
- `rg -n "updated: false" plugins/devflow/devflow/bin/lib/state.cjs` has no hit inside `cmdStateUpdateProgress`.
- `rg -n "findProjectRoot\\(" plugins/devflow/devflow/bin/lib/trd-pre-check.cjs` and
  `rg -n "gap_closure:" plugins/devflow/devflow/bin/lib/misc.cjs` each have a hit.
- The full suite shows no new failure against the 70-03 baseline.
</verification>

<success_criteria>
- `state update-progress` never exits 0 without changing the progress figure (SC-1).
- `verify trd-pre <N>` resolves an existing objective from the project root, any directory below it, or a path argument;
  not-found exits 1 (SC-2).
- `objective-job-index` reports a boolean `gap_closure` read from frontmatter on every job (SC-3).
</success_criteria>

<output>
After completion, create `.planning/objectives/70-cli-defects-and-hook-shape/70-01-SUMMARY.md` through
`df-tools summary post` (with `summary checkpoint` before it if the run is interrupted).
</output>
