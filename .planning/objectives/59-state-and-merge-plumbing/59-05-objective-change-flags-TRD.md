---
objective: 59-state-and-merge-plumbing
trd: "05"
type: standard
wave: 2
depends_on: ["59-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/objective-flags-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs
autonomous: true
requirements: [PLMB-05]
must_haves:
  truths:
    - "`objective remove N --confirm` reports `roadmap_updated: true` only when ROADMAP.md's bytes changed, and does not rewrite ROADMAP.md when they did not"
    - "`objective complete N` reports `roadmap_updated` the same way (it was `fs.existsSync(roadmapPath)`); an idempotent second run reports false"
    - "Existing objective.test.cjs cases (TOOL-02 state_updated, 48-14 local-mode characterization bytes) pass unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: "cmdObjectiveRemove and cmdObjectiveComplete compute roadmap_updated from a before/after comparison and write only on change"
    - path: plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs
      provides: "spawn-level tests on temp projects, never this repository's roadmap"
  key_links:
    - "the TOOL-02 pattern already used for state_updated in both commands (compare original vs new content, write only when different)"
---

# TRD 59-05: `objective remove` and `objective complete` report whether ROADMAP.md changed (PLMB-05)

<objective>
`objective remove --confirm` always writes ROADMAP.md and returns `roadmap_updated: true`; `objective complete` returns
`roadmap_updated: fs.existsSync(roadmapPath)`. Both report that the file exists, not that it changed, so a caller cannot
tell a no-op from an edit (the same defect TOOL-02 fixed for `state_updated` in both commands; 59-04 fixes it for
`milestone complete`).

Make both compare the ROADMAP text before and after their edits, write only when it differs, and report that.

Purpose: success criterion 5 (objective half). Output: objective.cjs changes, tests, a small fixture module.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit, then GREEN commit.
- **Temp fixtures only.** `objective remove` cascade-renumbers every objective above the removed one (directories,
  ROADMAP headings, TRD file names). Never run it, or `objective complete`, against this repository's `.planning/`. 59-07
  dogfoods on a scratch copy.
- `objective.test.cjs` is not in this TRD's files; it must pass unchanged.
- This TRD runs in a parallel wave; address your CHECKOUT explicitly if the dispatch provisioned a worktree. One plain
  command per Bash call; commit through `node plugins/devflow/devflow/bin/df-tools.cjs commit ... --files ...`.

## Test list

`objective-change-flags.test.cjs` (spawns the real binary, fake HOME, temp projects):

1. remove, ROADMAP mentions the objective: ROADMAP with sections, checkboxes and progress rows for objectives 1-3 and
   directories `01-a`, `02-b`, `03-c` (no SUMMARYs); `objective remove 2 --confirm` → `roadmap_updated: true`, ROADMAP no
   longer has `### Objective 2:` and objective 3 became 2 (unchanged behaviour).
2. remove, ROADMAP never mentions it: ROADMAP covers 1-2 only, directory `03-c` exists (highest, nothing above);
   `objective remove 3 --confirm` → `roadmap_updated: false`; ROADMAP bytes AND mtime unchanged (set the mtime to a fixed
   past value first with `fs.utimesSync`, then compare).
3. remove dry run (no `--confirm`) still reports `roadmap_updated: false` and writes nothing (existing rail, control).
4. complete, first run: objective 1 with 1 TRD + SUMMARY, ROADMAP checkbox `- [ ] Objective 1: A` → `roadmap_updated:
   true`, checkbox ticked.
5. complete, second run (already ticked, progress row already Complete, jobs line unchanged) → `roadmap_updated: false`,
   ROADMAP bytes unchanged.
6. complete with no ROADMAP.md → `roadmap_updated: false` (unchanged).
7. Regression: `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` passes without edits (48-14 pins local
   output bytes; where its fixture's ROADMAP changes, `roadmap_updated` stays `true`).

<embedded_context>

<codebase_examples>
remove today (`lib/objective.cjs` `cmdObjectiveRemove`, after the cascade):

```js
  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  // ... section / checkbox / table-row removal, then the renumber loop ...
  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');
  ...
  const result = { removed: targetObjective, ..., roadmap_updated: true, state_updated: stateUpdated };
```

complete today (`cmdObjectiveComplete`):

```js
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    // checkbox tick, updateProgressTableRow, updateJobsLine
    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');
    // REQUIREMENTS.md traceability ...
  }
  ...
    roadmap_updated: fs.existsSync(roadmapPath),
```

The TOOL-02 pattern both functions already use for STATE.md:

```js
    if (stateContent !== originalState) {
      fs.writeFileSync(statePath, stateContent, 'utf-8');
      stateUpdated = true;
    }
```

Spawn pattern and temp-project helpers: `lib/objective.test.cjs` (`tmpProject`, `fakeHomeEnv`, `run(args, cwd)`).
</codebase_examples>

<anti_patterns>
- Do not touch the REQUIREMENTS.md write inside `objective complete` or add new output keys beyond what this TRD needs;
  keep the change to the two ROADMAP writes and the two flags.
- Do not compare by mtime in code; compare text. Tests use mtime only to prove no write happened.
</anti_patterns>

<error_recovery>
- If a 48-14 characterization test fails, its pinned JSON includes `roadmap_updated`; check whether that fixture's ROADMAP
  really changes. If it does not change and the pin says `true`, the pin recorded the old defect: stop and report it in the
  SUMMARY rather than editing objective.test.cjs (it is outside this TRD's files).
</error_recovery>

</embedded_context>

<gotchas>
- In `objective complete`, the REQUIREMENTS.md block runs inside the same `if (fs.existsSync(roadmapPath))` and reads
  `roadmapContent` for the requirement IDs. Keep that read of the updated content; only the ROADMAP write becomes
  conditional.
- `objective remove`'s write happens after directory renames; a ROADMAP that does not change must still leave the
  renames done (only the ROADMAP write is skipped).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder for remove/complete projects</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/objective-flags-fixtures.cjs</files>
  <action>
Hand-built: `roadmapFor(objectives)` → a ROADMAP with, per `{num, name, done}`, a checkbox line
`- [ ] Objective N: Name` (`[x]` when done), a `### Objective N: Name` section with `**Goal**:` and a jobs line, and a
progress table row; `flagsProject({ roadmap, objectives: [{dir, trds, summaries}], state })` → temp project (fake-HOME
friendly, realpath'd) with `.planning/ROADMAP.md` (omitted when `roadmap === null`), STATE.md, and the objective
directories with minimal TRD/SUMMARY files. Returns `{ root, read(rel), mtime(rel), cleanup() }`.
Commit `test(59-05): objective flags fixture builder`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/objective-flags-fixtures.cjs'); const p=f.flagsProject({roadmap:f.roadmapFor([{num:1,name:'A'}]),objectives:[{dir:'01-a',trds:['01'],summaries:[]}]}); console.log(p.read('ROADMAP.md').includes('### Objective 1: A')); p.cleanup()"` prints `true`.</verify>
  <done>The builder creates and removes temp projects; nothing is written under this repository.</done>
  <recovery>If `objective remove` rejects the fixture, compare with `removableProject` in objective.test.cjs (FIVE_COLUMN_ROADMAP shape) and match its table columns.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: roadmap_updated reports a real change (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs</files>
  <action>
RED: tests 1-6 (2 and 5 fail today; the others are controls). Commit
`test(59-05): roadmap_updated tracks a real change`.

GREEN:
- `cmdObjectiveRemove`: keep `const originalRoadmap = roadmapContent` right after the read; after the edits,
  `const roadmapUpdated = roadmapContent !== originalRoadmap; if (roadmapUpdated) fs.writeFileSync(...)`; result
  `roadmap_updated: roadmapUpdated`.
- `cmdObjectiveComplete`: `let roadmapUpdated = false;` before the block; same comparison around its ROADMAP write;
  result `roadmap_updated: roadmapUpdated`.
- Extend the TOOL-02 comment above each result to say `roadmap_updated` follows the same rule (PLMB-05).
Commit `fix(59-05): roadmap_updated reports whether ROADMAP.md changed`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs` passes.</verify>
  <done>Tests 1-6 pass (2 and 5 went RED then GREEN); objective.test.cjs passes unchanged (test 7).</done>
  <recovery>If objective.test.cjs fails, run it alone with `--test-name-pattern` on the failing name and read the pinned bytes before changing anything; see error_recovery.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-05 (objective half): tests 2 and 5 show `roadmap_updated: false` with ROADMAP.md untouched when nothing changed;
  tests 1 and 4 show `true` when it did.
</verification>

<success_criteria>
- 7 named tests pass; objective.test.cjs unchanged; full `npm test` at baseline.
</success_criteria>

<output>
After completion, publish `59-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes.
</output>
