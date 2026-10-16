---
objective: 48-planning-write-path-migration
trd: "13"
type: tdd
wave: 2
depends_on: ["48-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/state.cjs
  - plugins/devflow/devflow/bin/lib/state.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs
autonomous: true
requirements: [GWP-01, GWP-04]
must_haves:
  truths:
    - "LOCAL MODE: every `state *`, `roadmap update-job-progress` and `sync-roadmap` command writes exactly what it writes today (characterization tests pin STATE.md / ROADMAP.md / state.json / STATE_ARCHIVE.md bytes)"
    - "STORE MODE: STATE.md mutators (`update`, `patch`, `advance-job`, `update-progress`, `record-metric`, `add-blocker`, `resolve-blocker`, `record-session`) never write STATE.md; they record the same fields in `state.json` and report `target: 'state.json'` with the note 'STATE.md is a generated view in store mode' (D-07)"
    - "STORE MODE: `state add-decision` still appends to STATE_ARCHIVE.md (runtime) and state.json, and its output adds a hint naming `decision open` for durable decisions (D-07)"
    - "STORE MODE: `roadmap update-job-progress` and every writing `sync-roadmap` subcommand are no-ops that exit 0 with 'ROADMAP.md is generated in store mode; run `df-tools gh pull --all`' and leave ROADMAP.md byte-identical; read-only roadmap commands are unchanged (D-19)"
    - "Mode is read once per command through `planning-mode` (main checkout), nowhere else"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/state.cjs
      provides: "store-mode branch for STATE.md mutators (state.json only), add-decision hint"
    - path: plugins/devflow/devflow/bin/lib/roadmap.cjs
      provides: "store-mode no-op for update-job-progress"
    - path: plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs
      provides: "store-mode no-op for writing sync-roadmap subcommands"
  key_links:
    - "STATE.md and ROADMAP.md are rendered by 47 `gh-cache.renderState/renderRoadmap` on `gh pull --all`; 48-08 gate denies direct edits to them; 48-09 W055 flags hand edits"
---

# TRD 48-13: Generated-view writers in store mode — state, roadmap, sync-roadmap

<objective>
In store mode ROADMAP.md and STATE.md are views generated from GitHub, so the df-tools commands that write them must stop doing so:
state mutators record into the per-clone `state.json`, roadmap writers become no-ops that point at `gh pull --all`. Local mode stays
byte-identical.

Purpose: GWP-01/GWP-04 for generated files, D-07, D-19. Output: store-mode branches in three modules with characterization + new tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Characterization first (refactor work): for each command touched, a test in a local-mode temp project pins today's written bytes; commit those
  green before any change. Then RED (store-mode tests) → GREEN.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Tests run commands through `node plugins/devflow/devflow/bin/df-tools.cjs <cmd> ... --raw` with `cwd` = temp project (they call `process.exit`),
  `HOME` set to a temp dir. Store-mode config `{github:{enabled:true, store:true, repo:'o/r'}}`; these commands make no gh calls, so tests assert
  STATE.md/ROADMAP.md bytes and stdout only. Never real `~/.claude`, never port 8080.
- Do not touch `cmdMilestoneComplete` (48-15 routes it in store mode) or read-only commands (`state load|get|snapshot`, `roadmap get-objective|analyze`, `progress`).

## Decisions

D-07, D-19. Settled here:

- **Field mapping for state.json** (store mode): `state update <field> <value>` → `state.json.fields[<field>] = value` (new `fields` object;
  `readStateJson` consumers ignore unknown keys); `patch` → same per pair; `advance-job` / `update-progress` / `record-metric` already maintain
  state.json counters — keep that half, skip the STATE.md half; `add-blocker`/`resolve-blocker` → `state.json.blockers`; `record-session` →
  `state.json.session_log`. Output keeps today's keys plus `target:'state.json'` and `note`.
- **Hint text** for add-decision: `"durable decisions belong in GitHub: df-tools decision open <trd> --question <text>"`.
- **sync-roadmap**: read `cmdSyncRoadmapRoute` to list its subcommands; those that write ROADMAP.md (e.g. reconcile/apply) no-op in store mode;
  check/dry-run style subcommands run unchanged. Record the list in the SUMMARY.

## Test list

Characterization (local mode, green before any change)
1. `state update "Status" "Executing"` → STATE.md line updated; bytes pinned.
2. `state patch`, `advance-job`, `update-progress`, `record-metric`, `add-blocker`, `resolve-blocker`, `record-session` → STATE.md / state.json bytes pinned (fixed clock where the command stamps time; if no clock seam exists, assert with the date masked).
3. `state add-decision --summary x` → STATE_ARCHIVE.md + state.json pinned.
4. `roadmap update-job-progress 7` → ROADMAP.md bytes pinned; writing `sync-roadmap` subcommand → pinned.

Store mode
5. `state update "Status" "Executing"` → STATE.md byte-identical to before; state.json `fields.Status === 'Executing'`; stdout JSON has `target:'state.json'`.
6. Each mutator in test 2 → STATE.md untouched; state.json updated as mapped.
7. `state add-decision --summary x` → STATE_ARCHIVE.md appended (runtime), output contains `decision open`.
8. `roadmap update-job-progress 7` → exit 0, message names `gh pull --all`, ROADMAP.md untouched.
9. Writing `sync-roadmap` subcommands → no-op exit 0; read-only ones unchanged.
10. `github.enabled:true` without `store` → local behaviour (mode is local).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: state.cjs store-mode branch (tests 1-3, 5-7, 10)</name>
  <files>plugins/devflow/devflow/bin/lib/state.cjs, plugins/devflow/devflow/bin/lib/state.test.cjs</files>
  <action>
Commit characterization tests 1-3 (green). RED: tests 5-7, 10; commit `test(48-13): state mutators in store mode`.
GREEN: add `const storeMode = (cwd) => require('./planning-mode.cjs').isStoreMode(cwd)`; at the top of each STATE.md mutator, in store mode,
perform the state.json half only and output with `target`/`note`. Keep `writeStateJson` as the single state.json writer. Add the add-decision
hint. Commit `feat(48-13): state mutators write state.json only in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/state.test.cjs</verify>
  <done>Tests 1-3, 5-7, 10 pass; all existing state tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: roadmap update-job-progress and sync-roadmap no-ops (tests 4, 8-9)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/roadmap.test.cjs, plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs, plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs</files>
  <action>
Commit characterization test 4 (green). RED: tests 8-9; commit `test(48-13): roadmap writers are no-ops in store mode`.
GREEN: early return in `cmdRoadmapUpdateJobProgress` and in the writing branches of `cmdSyncRoadmapRoute` when store mode:
`output({updated:false, skipped:'store-mode', message:'ROADMAP.md is generated in store mode; run `df-tools gh pull --all`'}, raw, 'skipped')`.
Commit `feat(48-13): roadmap writers defer to gh pull --all in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs</verify>
  <done>Tests 4, 8-9 pass; reconcile suites unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `state.cjs` L35 `writeStateJson(cwd, data)` (merge + metrics deep-merge), L229 `cmdStateUpdate`, L360 `cmdStateAddDecision` (archive + JSON mirror).
- `roadmap.cjs` L335 `cmdRoadmapUpdateJobProgress`; `roadmap-reconcile-cli.cjs` L199 `cmdSyncRoadmapRoute`.
- `gh-cache.cjs` L207 `renderState(model)` — carries position + objectives only (why decisions/blockers live in state.json).
</codebase_examples>
<anti_patterns>
- Writing STATE.md "just the position line" in store mode: the next pull overwrites it, and W055 flags it in between.
- Erroring (exit 1) from roadmap writers in store mode: workflows call them unconditionally today; a no-op with a message keeps them safe until the prose migrates.
</anti_patterns>
<error_recovery>
- If a characterization literal is time-dependent and no clock seam exists, mask `\d{4}-\d{2}-\d{2}` and ISO timestamps in both actual and expected.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/df-tools.test.cjs plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs</regression>
</validation_gates>

<verification>
- In this repo (store off) `node plugins/devflow/devflow/bin/df-tools.cjs state load --raw` output is unchanged by this TRD (compare before/after in the SUMMARY).
</verification>

<success_criteria>
In store mode nothing in df-tools writes the generated views, and the commands that used to say where they went now say how to regenerate them.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-13-SUMMARY.md`
</output>
