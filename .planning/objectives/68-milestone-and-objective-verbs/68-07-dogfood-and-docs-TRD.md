---
objective: 68-milestone-and-objective-verbs
trd: "07"
type: standard
wave: 3
depends_on: ["68-01", "68-02", "68-03", "68-04", "68-05", "68-06"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs
  - .planning/todos/pending/objective-complete-next-objective.md
autonomous: true
requirements: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05]
must_haves:
  truths:
    - "On a scratch copy of this repository's `.planning/`, run with the repository df-tools: `milestone complete v1.6 --dry-run` leaves the copy identical to a reference copy (`diff -r` empty)"
    - "On a scratch copy: `milestone complete v1.5` (already recorded) and two runs of `milestone complete v1.6` leave one `## v1.5` and one `## v1.6` heading in MILESTONES.md and one archive set per version"
    - "On a scratch copy: `milestone complete v1.6 --dry-runn` and `objective remove 70 --confrim` exit 1 naming the flag, and the copy is unchanged"
    - "On a scratch copy: `objective remove 25 --confirm --force` renumbers 26-75 and every ISO date outside objective 25's own lines survives (date multisets equal)"
    - "On a scratch copy: `objective complete 68` reports `next_objective: \"69\"` and `is_last_objective: false`"
    - "CHANGELOG [Unreleased], USER-GUIDE (milestone complete paragraph, Known issues, command reference) and CLAUDE.md describe the new behaviour; the two fixed Known issues are gone and the prose-range limitation is listed; the objective-complete todo is completed"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] Added/Fixed entries for objective 68"
      contains: "milestone complete --dry-run"
    - path: docs/USER-GUIDE.md
      provides: "dry run, re-run safety, unknown-flag rejection, objective remove/complete behaviour"
      contains: "--dry-run"
  key_links:
    - from: "68-07-SUMMARY.md evidence table"
      to: "success criteria 1-5"
      via: "one scratch-copy command per criterion with its output"
      pattern: "SC-"
---

# TRD 68-07: Dogfood on a scratch copy of this repository, then document (TOOL-01..TOOL-05)

<objective>
Prove the five success criteria on this repository's real planning data (the data that exposed the defects: a ROADMAP
full of 2026 dates, objectives 69-75 that exist only in ROADMAP.md, a MILESTONES.md that already records v1.5), always
on scratch copies, never the live `.planning/`. Then update the documentation: CHANGELOG [Unreleased], USER-GUIDE,
CLAUDE.md's Core Tool bullet, the df-tools.cjs usage header, and close the pending todo this objective resolves.

Purpose: evidence for verification; documentation. Output: SUMMARY evidence table, doc edits, the todo completed.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/68-milestone-and-objective-verbs/68-01-SUMMARY.md
@.planning/objectives/68-milestone-and-objective-verbs/68-03-SUMMARY.md
@.planning/objectives/68-milestone-and-objective-verbs/68-04-SUMMARY.md
@.planning/objectives/68-milestone-and-objective-verbs/68-05-SUMMARY.md
@.planning/objectives/68-milestone-and-objective-verbs/68-06-SUMMARY.md

## Binding rules
- Agent-only work (EST-11 scored objective): no checkpoint, no push, no merge, no tag, no release, no version bump.
- **Never run `milestone complete`, `objective remove` or `objective complete` against this repository's `.planning/`.**
  Every such command takes `--cwd <scratch>/run` where `<scratch>` comes from `mktemp -d` and `<scratch>/run/.planning`
  and `<scratch>/ref/.planning` are copies of the repository's `.planning/` (`cp -R`). Use the repository runtime,
  `node plugins/devflow/devflow/bin/df-tools.cjs` (the installed runtime does not carry objective 68), with
  `HOME=<scratch>/home` as an env prefix. Recopy `run` from the repository between scenarios.
- Compare with `diff -r <scratch>/ref/.planning <scratch>/run/.planning`, not git (no commits in scratch dirs).
- One plain command per Bash call. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
  Planning writes go through verbs (`todo complete`).
- If 68-05 left EXEMPT entries with reason `stale doc: fixed in 68-07`, fix those USER-GUIDE / CLAUDE.md lines and remove
  the entries from `lib/flag-spec.repo.test.cjs` (listed in 68-05-SUMMARY). Otherwise do not touch that file.
- CLAUDE.md is resident context on every turn: add at most two short sentences.
</context>

<embedded_context>

<codebase_examples>
The 59-07 dogfood (scratch copy, `--cwd`) is the model; its SUMMARY recorded each command, its output and the verdict.

Current USER-GUIDE text to replace (docs/USER-GUIDE.md, Known issues, around line 1402):

```
- `objective remove` renumbers every later objective with a text pass over ROADMAP.md that also rewrites any `NN-NN`
  token that is a date (...). Run it only on a ROADMAP.md you have committed, and read the diff. Fixing the pass is open.
- `milestone complete` appends a new MILESTONES.md entry on every run, so running it twice for one version leaves two
  entries, although `state_updated` is `false` the second time. Skipping the append when the version already has an
  entry is open.
```

and the `milestone complete` paragraph (around line 335) that lists its output keys. CHANGELOG [Unreleased] is empty;
use the `### Added` / `### Fixed` structure of the 2.15.0 entry, one bullet per change, naming the objective and
requirement, and "Needs an installed plugin carrying objective 68." where it applies.
</codebase_examples>

<anti_patterns>
- Do not run any of the three commands with the repository root as cwd, and do not `cp` results back.
- Do not edit `.planning/ROADMAP.md`, REQUIREMENTS.md or STATE.md here (execute-objective and verify-work own them).
- Do not rewrite unrelated USER-GUIDE sections; change the lines this objective made wrong and add what is new.
</anti_patterns>

<error_recovery>
- If a scenario's result contradicts its TRD (for example a date changes under `objective remove 25`), stop, record the
  command, output and diff in the SUMMARY as a failed criterion, and do not edit code: verification decides on a gap
  cycle.
- If `objective remove 25` refuses because objective 25 has SUMMARYs, that is why `--force` is passed; if it refuses for
  another reason, record it and continue with the other scenarios.
</error_recovery>

</embedded_context>

<gotchas>
- `objective remove 25 --confirm --force` also renames directories and files in the scratch copy; compare dates with
  `grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]+Z)?' <file> | sort` before and after, excluding the lines of objective
  25's own section, checkbox and progress row (collect those from the reference copy first).
- Prose ranges such as `Objectives 65-75` and the milestone bullets are not renumbered (out of scope in 68-04); note it
  in the SUMMARY and in Known issues, it is not a failure.
- `milestone complete v1.5` on the scratch copy should keep everything (`milestones_reason: entry_exists`, archives
  `exists`); `v1.6` has no entry yet, so the first run writes and the second keeps.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Scratch-copy evidence for SC-1..SC-5</name>
  <files>(no repository file: scratch directories only; results go in the SUMMARY)</files>
  <action>
Create `<scratch>` with `mktemp -d`, copy `.planning/` to `<scratch>/ref` and `<scratch>/run`, make `<scratch>/home`.
Run each scenario on a fresh `run` copy and record command, exit code, the relevant output keys and the comparison:

1. SC-1: `milestone complete v1.6 --dry-run` → exit 0, stderr's first line, `would_write` paths; `diff -r` ref/run empty.
2. SC-2: `milestone complete v1.5` → `milestones_updated: false`, `milestones_reason: entry_exists`, archives kept;
   then `milestone complete v1.6 --name "Hardening & Release"` twice → `grep -c '^## v1\.6 ' run/.planning/MILESTONES.md`
   is 1, `ls run/.planning/milestones` lists one `v1.6-ROADMAP.md` and one `v1.6-REQUIREMENTS.md`, and the second run's
   archives are byte-identical to the first (`cmp`).
3. SC-3: `milestone complete v1.6 --dry-runn` and `objective remove 70 --confrim` → exit 1, stderr names the flag;
   `diff -r` empty after both.
4. SC-4: `objective remove 25 --confirm --force` → the date multisets (gotchas) are equal; show `| 25. ` now names the
   former objective 26 and a `2026-` date on it is intact.
5. SC-5: `objective complete 68` → `next_objective: "69"`, `is_last_objective: false`; and in the repository (read-only)
   `rg -n "DIR_RE|function canonical" plugins/devflow/devflow/bin/lib/milestone-scope.cjs` prints nothing while
   `rg -n "objectiveDirMatches" plugins/devflow/devflow/bin/lib/milestone-scope.cjs` finds it.
Remove `<scratch>` at the end. No commit for this task (nothing in the repository changed).
  </action>
  <verify>`git status --porcelain .planning` shows no change caused by this task (only files other tasks of this objective committed); the SUMMARY draft has one row per SC with command, exit code and result.</verify>
  <done>Five scenarios recorded with PASS/FAIL; the live `.planning/` untouched.</done>
  <recovery>If a scenario fails, follow error_recovery: record and continue; do not patch code in this TRD.</recovery>
</task>

<task type="auto">
  <name>Task 2: Documentation and the resolved todo</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md, plugins/devflow/devflow/bin/df-tools.cjs, .planning/todos/pending/objective-complete-next-objective.md</files>
  <action>
- CHANGELOG [Unreleased]: `### Added` — `milestone complete --dry-run` (local and store; 68-01, 68-06; TOOL-01);
  writing commands reject an unknown flag with exit 1 before anything runs (`lib/flag-guard.cjs`, `lib/flag-spec.cjs`,
  `flag-spec.repo.test.cjs`; 68-03, 68-05; TOOL-01). `### Fixed` — `milestone complete` re-run keeps the existing
  entry and archives, `1.0` = `v1.0`, `milestone put` shares the heading rule (TOOL-02); `objective remove` keeps
  dates and metadata (TOOL-03); `objective complete` finds a ROADMAP-only next objective, in number order (TOOL-04);
  milestone-scope.cjs resolves directories through the shared helpers, so an unpadded or hyphen-less directory is no
  longer counted where find-objective cannot find it (TOOL-05). One opening paragraph naming objective 68.
- docs/USER-GUIDE.md: the `milestone complete` paragraph gains `--dry-run`, `written`/`kept`/`milestones_reason` and the
  re-run rule; Known issues: drop the two fixed bullets, add "prose ranges (`Objectives 65-75`) and milestone bullets
  are not renumbered by `objective remove`"; the command reference notes that a writing command exits 1 on an unknown
  flag.
- CLAUDE.md Core Tool → Objective operations bullet: one sentence on `milestone complete --dry-run` and that writing
  commands reject unknown flags (`lib/flag-guard.cjs` + `lib/flag-spec.cjs`).
- df-tools.cjs header comment: `milestone complete <version>` lines gain `[--dry-run]`; add one line under the usage
  header: writing commands reject unknown flags.
- Stale-doc exemptions from 68-05, if any (binding rules).
- `node plugins/devflow/devflow/bin/df-tools.cjs todo complete objective-complete-next-objective.md`.
Commit `docs(68-07): milestone and objective verb changes` with the changed paths (the todo's new location included).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs` passes; `rg -n "Fixing the pass is open|Skipping the append when the version already has an entry is open" docs/USER-GUIDE.md` prints nothing; `rg -n "milestone complete --dry-run" CHANGELOG.md` finds the [Unreleased] entry; `ls .planning/todos/completed/objective-complete-next-objective.md` exists.</verify>
  <done>Docs describe the new behaviour, the two fixed Known issues are gone, the todo is in `todos/completed/`, full suite at baseline.</done>
  <recovery>If doc-refs.repo.test.cjs fails on a command reference you wrote, use the command's current name from help.cjs; if flag-spec.repo.test.cjs fails on a new doc line, the line names a flag the spec does not accept: correct the line.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Take the failing set before the first change; only those known
     environment failures may remain. -->
</validation_gates>

<verification>
- SC-1..SC-5 each have a scratch-copy row with the command and result in 68-07-SUMMARY.md.
- The docs no longer describe the fixed defects as open.
</verification>

<success_criteria>
- Five PASS rows (or recorded FAIL rows for verification to act on); docs updated; the todo completed; full suite at
  baseline; the live `.planning/` changed only by the todo move.
</success_criteria>

<output>
After completion, publish `68-07-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first). Include the SC evidence table.
</output>
