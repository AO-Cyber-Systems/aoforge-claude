---
objective: 62-built-in-sweep
trd: "03"
type: standard
wave: 2
depends_on: ["62-01", "62-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
  - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
  - docs/built-in-sweep.md
  - plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/micro-quick-debug.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json
autonomous: true
requirements: [BLTN-01, BLTN-02, BLTN-03]
must_haves:
  truths:
    - "CI fails when a skill or active workflow gains a discrete-choice prose prompt, an AskUserQuestion schema break or a bad allow marker that is not in its group's baseline"
    - "CI fails when micro, quick, build, debug, plan-objective or verify-work lacks TaskCreate/TaskUpdate progress (creates and completed updates at the flow's minimum, at least one in_progress update, both tools declared) and the flow is not pending in its owner's baseline"
    - "CI fails when plan-objective, new-project or milestone complete lacks a plan-mode draft review (EnterPlanMode ... draft ... ExitPlanMode after a skip rule naming --auto, EnterPlanMode declared, ExitPlanMode not declared) and the flow is not pending"
    - "CI fails when a skill uses a built-in it does not declare, or declares ExitPlanMode, unless pending; a pending entry that is already fixed fails as stale"
    - "Every docs/built-in-sweep.md row is either still pending in a baseline or resolved in its file (converted rows' Before text gone; free-text rows' Before on a marked line)"
    - "Every inventory row the scanner can detect is flagged by it, and every scanner finding has an inventory row"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
      provides: "the BLTN-01..03 ratchet over the real skills and workflows (tests 1-11)"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/
      provides: "one JSON per group listing what is still pending; each conversion TRD empties and deletes its own file"
  key_links:
    - "builtin-sweep.repo.test.cjs -> builtin-audit.cjs (scanSet, scanPrompts, skillCoverage, progressCounts, planModeSpans, groupOf, GROUPS)"
    - "builtin-sweep.repo.test.cjs -> docs/built-in-sweep.md (## Prompts table)"
    - "62-04..62-09 own the eight baseline files (one or two groups each); 62-10 deletes the directory and makes its absence a test"
---

# TRD 62-03: The sweep ratchet

<objective>
Turn the scanner (62-01) and the inventory (62-02) into a CI test over the real prose, with a per-group baseline of
what is still pending. The pattern is the planning-writes ratchet of objective 48 (TRDs 48-04 to 48-23): the test
fails on anything new, each conversion TRD deletes its own entries first (RED) and then converts (GREEN), and the
last TRD deletes the baseline directory.

1. **Reconcile.** Make the scanner flag every inventory row it can (extend patterns under test), give every scanner
   finding an inventory row, and settle the inventory's `Detect` column.
2. **Ratchet.** Write `builtin-sweep.repo.test.cjs` and the eight baseline files that make it pass today.

Purpose: BLTN-01..03 become enforceable, and wave 3 can run six conversion TRDs (eight groups) in parallel without touching each
other's files. Output: the repo test, the baselines, scanner refinements, the reconciled inventory.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── builtin-audit.cjs                       ← MODIFY (pattern refinements only)
├── builtin-audit.test.cjs                  ← MODIFY (sensitivity cases)
├── builtin-sweep.repo.test.cjs             ← CREATE
└── __fixtures__/builtin-sweep-baseline/
    ├── micro-quick-debug.json              ← CREATE
    ├── verify-work.json                    ← CREATE
    ├── plan-build.json                     ← CREATE
    ├── new-project.json                    ← CREATE
    ├── milestone.json                      ← CREATE
    ├── execute-and-map.json                ← CREATE
    ├── todo-status-objective.json          ← CREATE
    └── remaining.json                      ← CREATE
docs/built-in-sweep.md                      ← MODIFY (rows added, Detect column settled)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: tests go RED (`test(62-03): ...`) before the change that makes them pass.
- Do not change any skill or workflow. Pending work goes in a baseline; wave 3 converts it.
- Baseline files are data, written from a generation script you keep in the session scratchpad (not committed), then
  read by eye: every entry must be a real pending item, not noise.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

`builtin-sweep.repo.test.cjs` (Task 2). Repo root is five levels up from `bin/lib`; a mirror install (no `README.md`
there) skips the whole file, as `planning-writes.repo.test.cjs` does.

1. The real tree is found: `scanSet` returns at least 70 files; every file has a group; every GROUPS path exists on
   disk; no path is in two groups.
2. Every scanPrompts finding (all kinds) in every scanned file is listed in its group's baseline `prompts`. Matching
   is file + kind + exact trimmed text; entries are a multiset (each finding consumes one). The failure lists every
   unlisted finding as `file:line: kind: text (group <g>)`, not just the first.
3. No stale prompt entries: every baseline `prompts` entry is consumed by a current finding. The failure says
   `converted? remove it from <group>.json`.
4. Baseline shape: file names are GROUPS keys + `.json`; each file is
   `{ group, prompts, progress, plan_mode, allowed_tools_missing, allowed_tools_forbidden }` with `group` equal to its
   name; each prompt entry's file belongs to that group; a missing group file counts as empty.
5. Progress (BLTN-01). For each PROGRESS_FLOWS entry, `progressCounts(files)` must give `creates >= min`,
   `completes >= min`, `inProgress >= 1`, and the skill must declare TaskCreate and TaskUpdate. A failing flow must be
   listed in its owner group's `progress`; a listed flow that passes fails as stale.
6. Plan mode (BLTN-02). For each DRAFT_FLOWS entry, `planModeSpans(file)` must have at least one span with
   `mentionsDraft`, every span must have an `exitLine` and a `skipLine`, and the skill must declare EnterPlanMode and
   must not declare ExitPlanMode. Failing → listed in the owner's `plan_mode`; listed but passing → stale.
7. allowed-tools. For every skill, each `skillCoverage(...).missing` tool must appear as `"<skill>:<Tool>"` in the
   owner group's `allowed_tools_missing` and each `forbidden` tool in `allowed_tools_forbidden`, unless the pair is in
   `ALLOWED_TOOLS_EXEMPT` (empty today; each entry `{ skill, tool, reason }`, reason at least 20 characters, and an
   entry that exempts nothing fails). Listed pairs that no longer fail are stale.
8. Zero bad markers (short or stale `builtin-audit: allow`) in every scanned file.
9. Inventory. Parse the `## Prompts` table of `docs/built-in-sweep.md` (rows start `| BS-`; split on unescaped `|`;
   unescape `\|`; strip the backticks around Before). IDs are unique `BS-\d{3}`; every File is in the scan set and its
   Group equals `groupOf(File)`; Kind and Detect take only the documented values. A `scan` row is **pending** when an
   entry in its group's baseline has the same file and text containing Before. A non-pending `scan` row must be
   **resolved**: `choice`, `ask-misuse`, `schema` → Before no longer occurs in the file except on lines covered by an
   allow marker (a free-text twin of the same words may stay, marked); `free-text` → every line containing Before is
   covered by an allow marker (on it or directly above); `explanatory` and `subagent` → Before is gone, or every
   occurrence is marked. `manual` rows are not checked here (62-10 checks them).
10. Sensitivity: appending `Proceed? (y/n)` to the real text of `workflows/micro.md` adds one `prose-choice` finding;
    appending `AskUserQuestion(header: "A header that is too long", question: "Which?")` adds one
    `ask-without-options` and one `header-too-long`.
11. The flow tables are the objective's: PROGRESS_FLOWS keys are exactly `micro`, `quick`, `build`, `debug`,
    `plan-objective`, `verify-work`; DRAFT_FLOWS keys exactly `plan-objective`, `new-project`,
    `milestone-complete`; every file they name exists.

`builtin-audit.test.cjs` additions (Task 1): one positive case per inventory row the scanner first missed (the row's
real line, copied by hand), and one negative case per false positive you narrow.

<embedded_context>

<codebase_examples>
`planning-writes.repo.test.cjs` is the shape to copy: header comment with the test list and the rule; `REPO_ROOT =
path.resolve(__dirname, '..', '..', '..', '..', '..')`; `IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT,
'README.md'))` gating every test; failure messages that list every offender. Its history is the precedent: 48-04 started
a per-group baseline ratchet under `__fixtures__/planning-writes-baseline/`, 48-16..48-21 drove each group to zero, and
48-23 deleted the directory and made its presence a failure.

The flow tables (put them at the top of the test, with a comment naming BLTN-01 and BLTN-02):

```js
const SK = (n) => `plugins/devflow/skills/${n}/SKILL.md`;
const WF = (n) => `plugins/devflow/devflow/workflows/${n}.md`;
const PROGRESS_FLOWS = {
  micro:            { skill: 'micro',          files: [SK('micro'), WF('micro')],                                min: 1 },
  quick:            { skill: 'quick',          files: [SK('quick'), WF('quick')],                                min: 2 },
  build:            { skill: 'build',          files: [SK('build'), WF('build')],                                min: 4 },
  debug:            { skill: 'debug',          files: [SK('debug')],                                             min: 2 },
  'plan-objective': { skill: 'plan-objective', files: [SK('plan-objective'), WF('plan-objective')],              min: 4 },
  'verify-work':    { skill: 'verify-work',    files: [SK('verify-work'), WF('verify-work'), WF('diagnose-issues')], min: 2 },
};
const DRAFT_FLOWS = {
  'plan-objective':     { skill: 'plan-objective', file: WF('plan-objective') },
  'new-project':        { skill: 'new-project',    file: WF('new-project') },
  'milestone-complete': { skill: 'milestone',      file: WF('complete-milestone') },
};
```

A flow's owner is `groupOf(SK(skill))`.

Expected pending state today (planner measurement, 2026-10-06; your generation script is authoritative):
progress — all six flows fail (none has an `in_progress` update; micro and debug have no tasks at all);
plan_mode — all three fail (plan-objective's only span presents a strategy, not a draft; the other two have none);
allowed_tools_missing — `cleanup:AskUserQuestion`, `execute-objective:TaskUpdate`, `flow:AskUserQuestion`,
`new-project:TaskCreate`, `new-project:TaskUpdate`, `plan-objective:TaskCreate`, `plan-objective:TaskUpdate`,
`quick:TaskCreate`, `quick:TaskUpdate`, `verify-work:TaskCreate`, `verify-work:TaskUpdate`;
allowed_tools_forbidden — `build:ExitPlanMode`, `plan-objective:ExitPlanMode`.
</codebase_examples>

<anti_patterns>
- Do not baseline by line number. Lines move with every edit; match on file, kind and text.
- Do not loosen a check to make the baseline smaller. The baseline is supposed to list everything pending.
- Do not add a pattern that flags lines with no prompt just to catch one inventory row. Mark the row `manual` instead.
- Do not put anything in ALLOWED_TOOLS_EXEMPT. adopt's case is solved with `disallowed-tools` in 62-08.
</anti_patterns>

<error_recovery>
- If the inventory and the scanner disagree on a line you cannot classify, prefer the inventory's classification and
  record the disagreement in the SUMMARY.
- If a scanner change in Task 1 breaks a 62-01 test, the 62-01 case wins unless it is wrong about the real prose;
  then fix the case and say why in the commit message.
- If `docs/built-in-sweep.md`'s table does not parse (a stray `|` in a cell), fix the cell (escape it) rather than the
  parser.
</error_recovery>

</embedded_context>

<gotchas>
- Baseline JSON: two-space indent, trailing newline, arrays sorted (`prompts` by file, then kind, then text) so
  wave-3 diffs are small. The repo test must not care about order.
- New inventory rows go at the end of their group's rows with the next unused ID (IDs need only be unique). Set
  `Detect` to `scan` for every row the scanner now flags and `manual` otherwise. For a row that becomes `manual`, add
  one sentence to its Conversion cell on why no line pattern catches it.
- A finding can be satisfied by the inventory only through a row in the same file whose Before is contained in the
  finding's text. A finding with no row is either a new row or a pattern to narrow; never both.
- The generation script writes all eight files, including groups with nothing pending (empty arrays). Wave 3 deletes
  a file once it is empty, and test 4 treats a missing file as empty.
- Run every test file with `node --test <file>`; the whole prose suite (`node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs'`)
  must stay green.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reconcile the scanner with the inventory</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-audit.cjs, plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs, docs/built-in-sweep.md</files>
  <action>
1. In the scratchpad, write a script that runs `scanSet` + `scanPrompts` over the repo and parses the inventory
   table (same parsing as test 9). Print (a) `scan`-detectable rows with no matching finding, (b) findings with no
   matching row.
2. For each (a): if a narrow pattern can catch the line without flagging the 62-01 negatives, add the line as a
   positive case in `builtin-audit.test.cjs` (RED), commit `test(62-03): sensitivity cases from the inventory`, then
   extend the pattern (GREEN). Otherwise set the row's Detect to `manual`.
3. For each (b): a real prompt → add an inventory row; a false positive → a negative case (RED) and a narrower
   pattern (GREEN); an explanatory line → an `explanatory` row (its marker comes in wave 3).
4. Re-run the script until both lists are empty (apart from `manual` rows). Commit
   `feat(62-03): scanner flags every scan-detectable inventory row` with the module, the test and the doc.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` passes. The reconcile script prints two empty lists.</verify>
  <done>Scanner and inventory agree: every finding has a row and every `scan` row is found.</done>
  <recovery>If the reconcile shows dozens of false positives from one pattern, narrow that pattern first and re-run before touching rows.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: builtin-sweep.repo.test.cjs and the eight baselines</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/*.json</files>
  <action>
RED: write tests 1-11 with the header comment (BLTN-01..03, the ratchet rule, how wave 3 uses the baselines, the
marker, the ExitPlanMode rule, the precedent). Run it: it fails on tests 2, 5, 6 and 7 (no baselines). Commit
`test(62-03): built-in sweep ratchet over the real skills and workflows`.

GREEN: extend the scratchpad script to compute every failing item per group (prompts, progress, plan_mode,
allowed_tools_missing, allowed_tools_forbidden) and write the eight JSON files. Read each file. Run the repo test and
the whole prose suite. Commit `test(62-03): baseline what the built-in sweep still has to convert` with the eight
files.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes all 11 tests. `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` passes. Removing any one entry from any baseline makes the repo test fail naming it (try one, then restore it).</verify>
  <done>The ratchet is in CI: nothing new can land, and each group's pending work is listed in its own file.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- The repo test passes on today's tree with the eight baselines, and fails on a removed entry.
- The baselines list exactly the pending prompts, flows and allowed-tools pairs per group.
- The inventory and the scanner agree.
</verification>

<success_criteria>
- [ ] BLTN-01, BLTN-02 and BLTN-03 are each checked by CI against the real prose
- [ ] Wave 3's work is split into eight disjoint baseline files
- [ ] The inventory is reconciled with the scanner
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-03-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. Include the per-group pending counts.
</output>
