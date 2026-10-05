---
objective: 59-state-and-merge-plumbing
trd: "02"
type: standard
wave: 2
depends_on: ["59-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/state-position-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/state.cjs
  - plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [PLMB-01]
must_haves:
  truths:
    - "`state advance-job --objective N` derives the position from objective N's TRD and SUMMARY files on disk: STATE.md `**Status:**` reads `Executing objective N — D/T TRDs complete` while any TRD lacks a SUMMARY, and says `ready for verification` only when every TRD has one"
    - "`state advance-job` with no `--objective` and no usable position (state.json 0/0, or no counters) writes nothing and reports `reason: no_position` — the observed bug (0 >= 0 rewrote Status to `Objective complete — ready for verification`) is gone"
    - "The legacy counter path (STATE.md or state.json counters with total > 0, no --objective) behaves exactly as before: the 48-13 characterization tests pass unchanged"
    - "In store mode `--objective` writes state.json only (current_objective, current_job, total_jobs, status) and never STATE.md"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/state.cjs
      provides: "cmdStateAdvanceJob(cwd, options, raw) with the --objective (disk-derived) path and the no_position guard"
    - path: plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs
      provides: "spawn-level tests over hand-built narrative, legacy and store-mode projects"
  key_links:
    - "df-tools.cjs `state advance-job [--objective <N>]` -> cmdStateAdvanceJob(cwd, {objective}, raw)"
    - "cmdStateAdvanceJob -> objective.findObjectiveInternal(cwd, N).jobs / .incomplete_jobs (NN-MM pairing via trdKey, objectiveDirMatches lookups from objective 56)"
    - "59-06 makes executor.md, execute-trd.md and the post-merge regeneration in execute-objective.md call `state advance-job --objective`"
---

# TRD 59-02: `state advance-job` stops writing "ready for verification" mid-objective (PLMB-01)

<objective>
`state advance-job` reads its counters from state.json first, then STATE.md. In this repository state.json holds
`current_job: 0, total_jobs: 0` and the narrative STATE.md has no `**Current Job:**` field, so every executor's call hits
`currentJob >= totalJobs` (0 >= 0) and rewrites `**Status:**` to `Objective complete — ready for verification` — after
the first TRD of every objective. STATE.md line 52 says exactly that today.

The fix makes the position a fact read from disk rather than a counter carried between calls:

- `state advance-job --objective <N>`: count objective N's TRDs and the TRDs that have a SUMMARY (the NN-MM pairing
  `findObjectiveInternal` already does). Status is `Executing objective N — D/T TRDs complete`, or
  `Objective N executed — T/T TRDs complete, ready for verification` once D equals T. It is idempotent, so the
  orchestrator can rerun it after a wave merge (59-06) and get the merged truth.
- No `--objective` and no usable position (total ≤ 0): write nothing, say `no_position`, and name the flag.
- No `--objective` with real counters (total > 0): unchanged legacy behaviour.

Purpose: success criterion 1. Output: the new path in state.cjs, the dispatch flag, the help usage, tests, fixtures.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                   ← MODIFY (advance-job parses --objective)
└── lib/
    ├── state.cjs                                  ← MODIFY
    ├── state-advance-job.test.cjs                 ← CREATE
    ├── help.cjs                                   ← MODIFY (state usage line)
    └── __fixtures__/state-position-fixtures.cjs   ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(59-02): ...`) before each GREEN commit (`feat(59-02)` / `fix(59-02)`).
- Hand-built fixtures; temp projects under os.tmpdir() only. Never run a state mutator against this repository's
  `.planning/` from a test (59-07 dogfoods it deliberately).
- Spawn the real binary with a fake HOME (copy the `run` / `fakeHomeEnv` pattern from `lib/state.test.cjs`).
- One plain command per Bash call; commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit ... --files ...`.
- `lib/state.test.cjs` is not in this TRD's files: its 48-13 characterization tests must pass UNCHANGED. If one fails,
  the legacy path changed; fix the code, not the test.
- This TRD runs in a parallel wave (with 59-03, 59-04, 59-05). Address your CHECKOUT explicitly in every command if the
  dispatch provisioned a worktree (`--cwd <checkout>` on df-tools, `git -C <checkout>`, absolute paths).

## Test list

Spawn-level (`state-advance-job.test.cjs`), outermost first:

1. Narrative STATE.md (`**Status:** Planning objective 7`, no counter fields), objective `07-alpha` with TRDs 07-01..07-04
   and SUMMARYs for 01, 02: `state advance-job --objective 7` → exit 0; STATE.md Status line =
   `Executing objective 7 — 2/4 TRDs complete`; nothing else in STATE.md changes except `**Last Activity:**` when present;
   state.json has `current_objective: "07"`, `current_job: 2`, `total_jobs: 4`, `status: "executing"`.
2. Same project with all four SUMMARYs → `Objective 7 executed — 4/4 TRDs complete, ready for verification`;
   state.json `status: "ready_for_verification"`.
3. The reported bug: state.json `{current_job: 0, total_jobs: 0}`, narrative STATE.md, no `--objective` → STATE.md and
   state.json byte-identical; JSON `{advanced: false, reason: "no_position", hint: <names --objective>}`.
4. Legacy schema (`**Current Objective:** 7`, `**Current Job:** 2`, `**Total Jobs in Objective:** 4`, `**Status:**`) with
   `--objective 7` and three SUMMARYs → Current Job `3`, Total Jobs in Objective `4`, Status
   `Executing objective 7 — 3/4 TRDs complete`.
5. Named TRD pairing: `07-02-beta-TRD.md` with `07-02-SUMMARY.md` counts as done (NN-MM key).
6. Lookup exactness: dirs `07-alpha` and `70-other` both exist; `--objective 7` counts only `07-alpha` (objectiveDirMatches).
7. Idempotent: a second run with no new SUMMARY → STATE.md unchanged, `state_md_updated: false`, `advanced: false`.
8. `--objective 99` (no directory) → exit 1, stderr names objective 99; STATE.md and state.json untouched.
9. An objective with no TRDs → `{advanced: false, reason: "no_trds"}`, nothing written.
10. Store mode (`.planning/config.json` with `github: {enabled: true, store: true}`) + `--objective 7` → STATE.md
    byte-identical; state.json carries the four fields; output has `target: "state.json"`.
11. `--objective` with no value (or followed by another flag) → exit 1 with usage.
12. `--raw` prints the status key (`executing` or `ready_for_verification`).
13. Legacy control: the 48-13 characterization project (counters 2/4) without `--objective` → unchanged result
    (`{advanced: true, previous_job: 2, current_job: 3, total_jobs: 4}`), proving the old path is intact.

<embedded_context>

<codebase_examples>
Today's code (`lib/state.cjs`), the branch that misfires:

```js
  const stateJson = readStateJson(cwd);
  let currentJob = stateJson?.current_job ?? parseInt(stateExtractField(content, 'Current Job'), 10);
  let totalJobs  = stateJson?.total_jobs  ?? parseInt(stateExtractField(content, 'Total Jobs in Objective'), 10);
  if (isNaN(currentJob) || isNaN(totalJobs)) { output({ error: '...' }, raw); return; }
  if (currentJob >= totalJobs) {           // 0 >= 0 for this repository
    if (!store) {
      content = stateReplaceField(content, 'Status', 'Objective complete — ready for verification') || content;
```

The lookup to reuse (`lib/objective.cjs`, exported): `findObjectiveInternal(cwd, objective)` returns
`{ objective_number: '07', objective_name, directory, jobs: [TRD files], summaries, incomplete_jobs: [TRDs without a
SUMMARY by trdKey] }` or null. It normalises the argument (`7`, `07`, `07-alpha` all work) and matches directories with
`objectiveDirMatches` (objective 56), so `7` never selects `70-x` or `07.1-y`.

Field helpers already in state.cjs: `stateExtractField(content, name)`, `stateReplaceField(content, name, value)` (null
when the field is absent), `writeStateJson(cwd, partial)`, `storeMode(cwd)`, `storeOutput(result, raw, rawValue)`.

The dispatch today (`df-tools.cjs`): `} else if (subcommand === 'advance-job') { cmdStateAdvanceJob(cwd, raw); }`.
The `record-metric` arm right below it shows the `args.indexOf('--flag')` parsing style.

The test runner pattern (`lib/state.test.cjs`):

```js
function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd, env: fakeHomeEnv(), encoding: 'utf-8', timeout: 30000 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
```
</codebase_examples>

<anti_patterns>
- Do not infer the objective from `**Current Objective:**` or state.json `current_objective` when `--objective` is absent:
  the legacy characterization project carries `**Current Objective:** 7`, and inferring would silently change the legacy
  path. Only the explicit flag selects the disk-derived path.
- Do not add a `require('./objective.cjs')` at the top of state.cjs if it introduces a load cycle; a lazy require inside
  the function (as `storeMode` does for planning-mode.cjs) is the house pattern.
- Do not import `logObjectiveNumber` (not exported, and objective.cjs belongs to 59-05 in this wave); strip leading
  zeros locally: `String(n).replace(/^0+(?=\d)/, '')` → `07` → `7`, `04.1` → `4.1`.
</anti_patterns>

<error_recovery>
- If a characterization test in state.test.cjs fails after GREEN, diff the bytes it pins: the legacy branch must still
  write `Ready to execute` / `Objective complete — ready for verification` exactly as before when total > 0.
- If store-mode detection does not trigger in test 10, check that config.json is in the temp project's `.planning/`
  and that both `github.enabled` and `github.store` are JSON booleans (planning-mode.cjs is strict).
</error_recovery>

</embedded_context>

<gotchas>
- `cmdStateAdvanceJob` changes signature to `(cwd, options, raw)`. Accept the old `(cwd, raw)` call too: when the second
  argument is a boolean, treat it as `raw` with no options (any out-of-tree caller keeps working).
- `**Last Activity:**` is set to today only when the field exists; it never gets added. Same for `**Current Job:**` and
  `**Total Jobs in Objective:**` (legacy schema only). The narrative schema's only rewritten line is `**Status:**`.
- `advanced` = D greater than the previous `current_job` recorded for the SAME objective in state.json (0 otherwise).
- `previous_job` / `current_job` / `total_jobs` keys stay in the output so existing readers keep working; add
  `objective`, `status`, `status_text`, `state_md_updated`.
- Status uses an em dash (`—`), as the old text did. Test the exact strings.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for position projects</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/state-position-fixtures.cjs</files>
  <action>
Hand-built builders (no generated data):

- `narrativeState({ status = 'Planning objective 7', lastActivity = '2026-01-01' })` → a narrative STATE.md text: a
  `# Project State` heading, two `**Objective complete:**` log lines, `**Status:**` and `**Last Activity:**`.
- `legacyState({ objective = 7, currentJob = 2, totalJobs = 4, status = 'Planning' })` → the 48-13 CHAR_STATE shape
  (Current Objective, Current Job, Total Jobs in Objective, Status, Last Activity, Progress).
- `positionProject({ state, stateJson, config, objectives: [{ dir, trds: [{ nn, slug }], summaries: ['01', ...] }] })`
  → temp project (mkdtemp, realpath'd) with `.planning/STATE.md`, optional `state.json` (`JSON.stringify(v, null, 2)`),
  optional `config.json`, and per objective `NN-MM-<slug>-TRD.md` (minimal valid frontmatter + one task element) and
  `NN-MM-SUMMARY.md` for the listed TRD numbers. Returns `{ root, read(rel), cleanup() }`.

Commit `test(59-02): position fixture builders`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/state-position-fixtures.cjs'); const p=f.positionProject({state:f.narrativeState({}),objectives:[{dir:'07-alpha',trds:[{nn:'01'},{nn:'02'}],summaries:['01']}]}); console.log(require('fs').readdirSync(p.root+'/.planning/objectives/07-alpha').join(',')); p.cleanup()"` lists two TRDs and one SUMMARY.</verify>
  <done>The builders create narrative, legacy and store-mode projects in temp dirs and remove them.</done>
  <recovery>If the TRD file names do not pair in findObjectiveInternal, use `07-01-<slug>-TRD.md` / `07-01-SUMMARY.md` exactly.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Disk-derived advance-job and the no_position guard (tests 1-13)</name>
  <files>plugins/devflow/devflow/bin/lib/state.cjs, plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 1-13 in `state-advance-job.test.cjs`. Run them: 1, 2, 4-12 fail (flag ignored), 3 fails (Status rewritten),
13 passes (control). Commit `test(59-02): advance-job derives position from disk`.

GREEN:

```
cmdStateAdvanceJob(cwd, optionsOrRaw, maybeRaw):
  [options, raw] = typeof optionsOrRaw === 'boolean' ? [{}, optionsOrRaw] : [optionsOrRaw || {}, maybeRaw]
  if (options.objective != null) return advanceFromDisk(cwd, String(options.objective), raw)
  ...existing legacy body, plus, right after the NaN check:
  if (totalJobs <= 0) { emit({ advanced: false, reason: 'no_position',
        hint: 'pass --objective <N> to derive the position from the objective\'s TRDs and SUMMARYs' }, raw, 'false'); return }

advanceFromDisk(cwd, objective, raw):
  info = require('./objective.cjs').findObjectiveInternal(cwd, objective)
  if (!info) error(`objective ${objective} not found under .planning/objectives`)
  total = info.jobs.length; done = total - info.incomplete_jobs.length
  if (total === 0) -> emit({ advanced: false, reason: 'no_trds', objective: info.objective_number }); return
  num = info.objective_number without leading zeros
  ready = done >= total
  statusText = ready ? `Objective ${num} executed — ${done}/${total} TRDs complete, ready for verification`
                     : `Executing objective ${num} — ${done}/${total} TRDs complete`
  statusKey  = ready ? 'ready_for_verification' : 'executing'
  prev = readStateJson(cwd); previous = prev && String(prev.current_objective) === info.objective_number ? prev.current_job || 0 : 0
  stateMdUpdated = false
  if (!store && STATE.md exists):
     c = original; for [field, value] of [Status, statusText], [Current Job, done], [Total Jobs in Objective, total],
       [Last Activity, today]: c = stateReplaceField(c, field, value) ?? c
     if (c !== original) write, stateMdUpdated = true
  writeStateJson(cwd, { current_objective: info.objective_number, current_job: done, total_jobs: total,
                        status: statusKey, last_activity: today })
  emit({ advanced: done > previous, objective: info.objective_number, previous_job: previous, current_job: done,
         total_jobs: total, status: statusKey, status_text: statusText, state_md_updated: stateMdUpdated }, raw, statusKey)
```

(`emit` = `storeOutput` in store mode, `output` otherwise, as the legacy body does.)

df-tools.cjs advance-job arm: read `--objective`; when present with no value or a `--` value →
`error('state advance-job --objective requires an objective number, e.g. --objective 59')`; call
`cmdStateAdvanceJob(cwd, { objective }, raw)`. Update the header comment line to
`state advance-job [--objective <N>]   Record TRD progress (position from disk with --objective)`.
help.cjs: in the `state` usage string, `advance-job` → `advance-job [--objective <N>]`.

Commit `fix(59-02): advance-job derives Status from the objective's TRDs and SUMMARYs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` passes.</verify>
  <done>Tests 1-13 pass (1-12 went RED then GREEN); state.test.cjs passes without edits; help.test.cjs green.</done>
  <recovery>If requiring objective.cjs from state.cjs throws at load (cycle), move the require inside advanceFromDisk. If test 6 counts the wrong directory, pass the raw argument to findObjectiveInternal unchanged; it normalises.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-01: tests 1-4 show Status describing the real position mid-objective and `ready for verification` only when every
  TRD has a SUMMARY; test 3 shows the 0/0 case no longer writes anything.
- The legacy path is byte-identical (state.test.cjs untouched and green).
</verification>

<success_criteria>
- 13 named tests pass; state.test.cjs unchanged and passing; full `npm test` at baseline (three known failures).
</success_criteria>

<output>
After completion, publish `59-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the exact status strings and the output shape; 59-06 and 59-07 depend on them.
</output>
