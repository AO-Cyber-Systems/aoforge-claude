---
objective: 68-milestone-and-objective-verbs
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/text-escape.cjs
  - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
autonomous: true
requirements: [TOOL-01, TOOL-02]
must_haves:
  truths:
    - "`milestone complete <v> --dry-run` in local mode exits 0, writes `DRY RUN — nothing has been modified.` and the plan to stderr, prints JSON with `dry_run: true`, `would_write`, `would_move`, `would_keep`, `milestone_entry` and the same counts a real run reports, and leaves every file under `.planning/` byte-identical with no new file or directory"
    - "A real run executes the plan the dry run printed: for the same project state, a real run's `written`/`moved`/`kept` paths equal the dry run's `would_write`/`would_move`/`would_keep` paths"
    - "Running `milestone complete <v>` twice leaves exactly one MILESTONES.md entry for the version (second run: `milestones_updated: false`, `milestones_reason: entry_exists`) and one set of archive files whose bytes are those of the first run"
    - "`1.0` and `v1.0` name the same milestone: archives are `v1.0-*`, the entry heading is `## v1.0 ...`, and running both forms leaves one entry and one archive set"
    - "An entry written by `milestone put` (same `## v<X.Y>` heading, richer text) survives a later `milestone complete` byte for byte"
    - "Existing milestone-complete.test.cjs tests (S1-S4, 1-10), df-tools.test.cjs `milestone complete command` and planning-verbs-cli.test.cjs test 7 pass unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/roadmap.cjs
      provides: "planMilestoneComplete (reads only) and applyMilestonePlan (executes the plan); cmdMilestoneComplete prints the plan for --dry-run and executes it otherwise"
      contains: "planMilestoneComplete"
    - path: plugins/devflow/devflow/bin/lib/text-escape.cjs
      provides: "milestoneHeadingPattern(version): the one rule for a version's MILESTONES.md heading"
      exports: ["milestoneHeadingPattern"]
    - path: plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
      provides: "dry-run and re-run tests on temp projects (tests 1-13 of this TRD's list)"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs cmdMilestoneVerb (local branch)"
      to: "roadmap.cjs cmdMilestoneComplete"
      via: "options.dryRun = has(args, '--dry-run')"
      pattern: "dryRun"
    - from: "roadmap.cjs planMilestoneComplete"
      to: "text-escape.cjs milestoneHeadingPattern"
      via: "the entry_exists check before the MILESTONES.md append"
      pattern: "milestoneHeadingPattern"
---

# TRD 68-01: `milestone complete` plans before it writes: `--dry-run` and re-run safety (TOOL-01, TOOL-02)

<objective>
`milestone complete` writes as it goes: archives, the audit move, the MILESTONES.md append, STATE.md and the optional
directory moves happen in one pass, with no way to preview them, and a second run appends a second MILESTONES.md entry
and overwrites the archives (59-07 reproduced the duplicate on a scratch copy; the v1.5 audit hit the missing preview
live). Split the command into a read-only plan and an executor of that plan, the shape `objective remove` already uses
(`computeRemovalPlan` → print or execute), add `--dry-run`, and make every write in the plan idempotent: an existing
entry or archive file is kept, never duplicated or overwritten.

Purpose: success criteria 1 and 2 (local mode). Store mode's `--dry-run` is 68-06; the unknown-flag guard is 68-03/68-05.
Output: roadmap.cjs plan/apply split, `milestoneHeadingPattern` in text-escape.cjs, `--dry-run` wired through the
milestone verb and help, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/roadmap.cjs
@plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs

## Binding rules
- Strict TDD on tasks 2 and 3: a RED commit with the failing tests, then a GREEN commit. One test at a time is the
  user's playbook habit (CLAUDE.md TDD & Quality): write the next failing test, make it pass, repeat.
- Temp fixtures only. Never run `milestone complete` against this repository's `.planning/` (68-07 dogfoods on a scratch
  copy). Every spawn uses `--cwd <temp project>` and a fake `HOME`, as `complete()` in milestone-complete.test.cjs does.
- Hand-built fixtures only (no generated test data, no property-based libraries, no `.feature` files).
- This TRD runs in a parallel wave (68-02, 68-03 run beside it). If the dispatch provisioned a worktree, address that
  checkout explicitly. One plain command per Bash call. Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- 68-03 adds a dispatcher guard that rejects unknown flags; its spec already lists `--dry-run` for `milestone complete`.
  Do not touch df-tools.cjs, lib/flag-guard.cjs or lib/flag-spec.cjs here.
- `milestone-scope.cjs` is 68-02's file. Read it, do not edit it.

## Output contract (keep existing keys and their meaning)
A real run keeps every key it prints today (`version`, `name`, `date`, `objectives`, `objective_numbers`, `jobs`,
`tasks`, `cancelled`, `absent`, `scope_source`, `accomplishments`, `archived{roadmap,requirements,audit,objectives}`,
`milestones_updated`, `state_updated`) and adds `dry_run: false`, `written: [path]`, `moved: [{from,to}]`,
`kept: [{path, reason}]`, `milestones_reason: null | 'entry_exists'`, `warnings: [string]`. `milestones_updated` now
means "MILESTONES.md bytes changed" (the PLMB-05 rule `state_updated` already follows).

A dry run prints the same stats keys plus `dry_run: true`, `would_write: [{path, action}]` (`action`: `create` |
`append` | `update`), `would_move: [{from, to}]`, `would_keep: [{path, reason}]`, `milestone_entry` (the exact text a real
run would add, or null when the entry exists), `warnings`, `milestones_updated: false`, `state_updated: false`. Paths are
project-relative POSIX (`.planning/milestones/v1.0-ROADMAP.md`), the form `scope.objectives[].dir` already uses.
stderr gets a human-readable plan whose first line is `DRY RUN — nothing has been modified.` (the `renderPlanText`
convention of `objective remove`).

## Re-run rules (TOOL-02)
- MILESTONES.md: when it already holds a heading matching `milestoneHeadingPattern(version)` the file is kept
  (`reason: 'entry_exists'`); a `milestone put` entry and a legacy unprefixed `## 1.0 ...` entry both count.
- `milestones/<v>-ROADMAP.md`, `milestones/<v>-REQUIREMENTS.md`: an existing file is kept (`reason: 'exists'`), never
  overwritten. A first run that stopped half way is resumed: only the missing pieces are written.
- Audit: `.planning/<v>-MILESTONE-AUDIT.md` is moved only when the destination does not exist; when both exist the
  source stays (`kept`, `reason: 'destination_exists'`) and a warning names it.
- `--archive-objectives`: a directory whose destination under `milestones/<v>-objectives/` already exists is not moved
  (`kept`, `destination_exists`, warning) instead of crashing on ENOTEMPTY. Already-archived directories are not current
  and are skipped, as today.
- STATE.md: unchanged rule (written only when the replacement changes its bytes).
- Version: normalise with `gh-milestone.cjs` `normaliseVersion` (`1.0` → `v1.0`); when it returns null (not a dotted
  version) keep the argument as given, so today's tolerance is unchanged.
</context>

## Test list

Outside-in: every behaviour test spawns the real binary (`df-tools --cwd <temp> milestone complete ...`) on a project
from the fixture builder; unit tests only for the pattern helper.

`milestone-complete.test.cjs`, dry run (task 2):
1. `v1.0 --dry-run` on TWO_MILESTONE_SPEC: exit 0; stderr starts with `DRY RUN — nothing has been modified.`; JSON
   `dry_run: true`; `planningTree(root)` before equals after (files and directories), `.planning/milestones` absent.
2. The dry-run JSON carries the real run's counts (`version: 'v1.0'`, `objectives: 2`, `objective_numbers: ['4','5']`,
   `jobs: 3`, `tasks: 6`, `cancelled: ['6']`) and `would_write` paths `.planning/milestones/v1.0-ROADMAP.md` (create),
   `.planning/milestones/v1.0-REQUIREMENTS.md` (create), `.planning/MILESTONES.md` (create), `.planning/STATE.md` (update).
3. `milestone_entry` equals the text a following real run appends (read MILESTONES.md after the real run).
4. With `.planning/v1.0-MILESTONE-AUDIT.md` seeded and `--archive-objectives`: `would_move` lists the audit move and the
   `04-d`, `05-e`, `06-f` moves; nothing moved, tree unchanged.
5. Parity: dry run, then a real run on the same project: `written` = `would_write` paths, `moved` = `would_move`,
   `kept` = `would_keep` (order-insensitive compare of paths).
6. A STATE.md whose replacement changes nothing (already `**Status:** v1.0 milestone complete`, today's Last Activity,
   the description line) is not in `would_write`.

`milestone-complete.test.cjs`, re-run (task 3):
7. Two runs of `v1.0 --name Now`: exactly one line matching `^## v1\.0 ` in MILESTONES.md; second run
   `milestones_updated: false`, `milestones_reason: 'entry_exists'`; every file under `.planning/milestones/` has the
   bytes it had after run one; the directory listing is unchanged.
8. ROADMAP.md edited between the runs: `v1.0-ROADMAP.md` keeps run one's bytes (`kept`, `reason: 'exists'`).
9. `1.0` then `v1.0`: one entry; `.planning/milestones/` holds `v1.0-ROADMAP.md` and `v1.0-REQUIREMENTS.md` and no
   `1.0-*` file; first run's JSON `version` is `v1.0`.
10. MILESTONES.md seeded with a `milestone put`-shaped entry (`## v1.0 Now` + rich notes): complete leaves MILESTONES.md
    byte-identical (`kept`, `entry_exists`).
11. A legacy `## 1.0 Old (Shipped: 2025-01-01)` entry counts as v1.0 (no second entry); a `## v1.0.1 Patch` entry does
    NOT count (the v1.0 entry is appended).
12. `--archive-objectives` twice: second run exit 0, `moved: []`, no ENOTEMPTY; seeded collision (`04-d` current AND
    `milestones/v1.0-objectives/04-d` present): `04-d` stays current, `kept` has it with `destination_exists`, one
    warning names it.
13. Audit present at both source and destination: both byte-identical after the run; `kept` lists the source.

`text-escape.test.cjs` (task 3):
14. `new RegExp(milestoneHeadingPattern('v1.0'), 'm')` matches `## v1.0 Now`, `## 1.0 Old`, `## v1.0` (end of line) and
    `##  v1.0 X`; does not match `## v1.0.1 X`, `## v1.00`, `### v1.0`, `## v10.0`, `## v1x0` (the `.` is escaped);
    `milestoneHeadingPattern('1.0')` behaves the same as `'v1.0'`.

Regression (every task): milestone-complete.test.cjs S1-S4 and 1-10, `node --test plugins/devflow/devflow/bin/df-tools.test.cjs --test-name-pattern "milestone complete"`
and planning-verbs-cli.test.cjs pass without edits to those expectations.

<embedded_context>

<codebase_examples>
The plan-then-execute shape to copy (`lib/objective.cjs`):

```js
const plan = computeRemovalPlan(objectivesDir, normalized, isDecimal, targetDir); // PURE: zero fs mutations
if (!confirm) {
  process.stderr.write(renderPlanText(targetObjective, plan));   // 'DRY RUN — nothing has been modified.' first
  output({ removed: targetObjective, dry_run: true, ... }, raw); // output() exits
}
// ... executes plan.renamed_directories / plan.renamed_files, never recomputes them
```

Today's writes, in order (`lib/roadmap.cjs` `cmdMilestoneComplete`):

```js
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(archiveDir, `${version}-ROADMAP.md`), roadmapContent, 'utf-8');
fs.writeFileSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`), archiveHeader + reqContent, 'utf-8');
if (fs.existsSync(auditFile)) fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
fs.writeFileSync(milestonesPath, existing + '\n' + milestoneEntry, 'utf-8');   // the duplicate on a re-run
// STATE.md: written only when the replacement changes its bytes
// --archive-objectives: fs.renameSync(path.join(cwd, o.dir), path.join(phaseArchiveDir, path.basename(o.dir)));
```

The existing heading rule to share (`lib/planning-entity-verbs.cjs`, used by `milestone put`; 68-06 switches it to the
new helper):

```js
const head = new RegExp(`^## +${escapeRegExp(version)}(?:\\s|$)`);
```

The lazy-require pattern for a module that requires roadmap.cjs back (`completionScope` in roadmap.cjs):

```js
function completionScope(cwd, version) {
  const ms = require('./milestone-scope.cjs');   // milestone-scope requires roadmap.cjs at load
```
`gh-milestone.cjs` also requires roadmap.cjs at load, so require it inside the function the same way.

The milestone verb today (`lib/planning-verbs-cli.cjs`):

```js
const options = { name: milestoneName(args), archiveObjectives: has(args, '--archive-objectives') };
return require('./roadmap.cjs').cmdMilestoneComplete(cwd, args[1], options, raw);
```
`milestoneName` stops at the next `--` token, so `--name Now --dry-run` still yields `Now`.

Tree snapshots: `snapshot(root)` / `diffSnapshots(a, b)` in `lib/__fixtures__/upgrade-fixtures.cjs` (sha1 per file,
skips `.git/`). They record files only, so an empty directory created by a dry run would not show: the fixture task adds
a directory list beside it.
</codebase_examples>

<anti_patterns>
- Do not compute the plan twice (once to print, once to execute). `applyMilestonePlan` executes the plan object it is
  given; that is what makes test 5 hold.
- Do not `fs.mkdirSync(archiveDir)` before deciding anything: today's first line of the write phase creates
  `.planning/milestones/` even when nothing lands in it. The apply step creates a parent only for an op that writes there.
- Do not change `milestone-scope.cjs`, the scope selection or the counting rules; only where the results go.
- Do not make an unknown version an error (`milestone complete v2` stays accepted); only dotted versions are normalised.
- Do not overwrite an existing archive "to refresh it": that is how a re-run after the ROADMAP was reorganised for the
  next milestone would destroy the archive.
</anti_patterns>

<error_recovery>
- If df-tools.test.cjs `milestone complete command` fails on output shape, its assertions read individual keys
  (`output.version`, `output.archived.roadmap`); a failure means an existing key changed meaning. Restore it rather than
  editing that test (it is outside this TRD's files).
- If planning-verbs-cli.test.cjs test 7 (dispatch vs library byte comparison) fails, both paths must print the same
  JSON; check that the dispatch branch passes the same options object the library call gets.
- If a fixture project leaks files into the repository, `git status --porcelain` shows them: delete them and fix the
  fixture to use `fs.mkdtempSync(os.tmpdir())`.
</error_recovery>

</embedded_context>

<gotchas>
- The REQUIREMENTS archive header contains today's date, so its content differs across days. Keeping an existing archive
  (rather than comparing content) is what makes the re-run stable.
- STATE.md's `Last Activity` gets today's date; a second run on the same day leaves STATE.md unchanged, a run on a later
  day updates it. Both are correct (`state_updated` reports which).
- A dry run must not create `.planning/milestones/` or `milestones/<v>-objectives/`; assert their absence directly, since
  the snapshot helper does not see empty directories.
- `--raw` with no raw value prints JSON (output() behaviour); the dry run uses `output(result, raw)` the same way.
- The scope functions read archived objective directories too; after `--archive-objectives` a re-run still counts the
  milestone's objectives from `milestones/<v>-objectives/` (same counts), which test 12 relies on.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── roadmap.cjs                               ← MODIFY (plan / apply / dry run)
├── text-escape.cjs                           ← MODIFY (milestoneHeadingPattern)
├── text-escape.test.cjs                      ← MODIFY (test 14)
├── planning-verbs-cli.cjs                    ← MODIFY (dryRun pass-through, local branch only)
├── help.cjs                                  ← MODIFY (milestone usage)
├── milestone-complete.test.cjs               ← MODIFY (tests 1-13)
└── __fixtures__/milestone-complete-fixtures.cjs  ← MODIFY (extra files, planningTree, MILESTONES texts)
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for dry-run and re-run projects</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs</files>
  <action>
Extend the hand-built fixture module (no generated data):
- `makeMilestoneProject(spec, opts)` gains `opts.files: { [relPathFromRoot]: text }`, written after everything else
  (parents created), so a test can seed `.planning/MILESTONES.md`, `.planning/v1.0-MILESTONE-AUDIT.md`,
  `.planning/milestones/v1.0-ROADMAP.md` or `.planning/milestones/v1.0-objectives/04-d/OBJECTIVE.md`. Existing callers
  (no `files`) behave exactly as before.
- `planningTree(root)` → `{ files: snapshot(<root>/.planning), dirs: [sorted relative directory paths] }`, reusing
  `snapshot` from `./upgrade-fixtures.cjs` (require it; do not copy it) and walking directories itself.
- Constants: `MILESTONES_WITH_PUT_ENTRY` (`# Milestones` + `## v1.0 Now` + several lines of hand-written notes + `---`),
  `MILESTONES_LEGACY_UNPREFIXED` (`## 1.0 Old (Shipped: 2025-01-01)` entry), `MILESTONES_PATCH_ONLY`
  (`## v1.0.1 Patch (Shipped: 2025-02-01)` entry), `AUDIT_V1_0` (a short audit body). Export them; 68-06 imports the
  MILESTONES constants read-only.
Commit `test(68-01): milestone complete fixtures for dry-run and re-run projects`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/milestone-complete-fixtures.cjs'); const p=f.makeMilestoneProject(undefined,{files:{'.planning/MILESTONES.md':f.MILESTONES_WITH_PUT_ENTRY}}); const t=f.planningTree(p.root); console.log(Object.keys(t.files).includes('MILESTONES.md'), t.dirs.includes('objectives/04-d')); p.cleanup()"` prints `true true`; `node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs` still passes.</verify>
  <done>The builder seeds arbitrary extra files; planningTree reports files and directories; existing tests unchanged.</done>
  <recovery>If `planningTree` key shapes differ from the verify line (absolute vs relative), make both `files` keys and `dirs` relative to `<root>/.planning` and POSIX-separated, then re-run the verify.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Plan, apply and --dry-run (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs</files>
  <action>
RED: tests 1-6 in milestone-complete.test.cjs (add a `completeRaw(p, args)` helper next to `complete()` that returns
`{status, stdout, stderr}` without asserting exit 0). Commit `test(68-01): milestone complete --dry-run plans and writes nothing`.

GREEN, in roadmap.cjs:

```
planMilestoneComplete(cwd, version, options)        // reads only: no mkdir, write, rename
  scope + stats: today's code, moved unchanged (completionScope, counted, totals, accomplishments)
  entry = today's milestoneEntry text
  ops = []; kept = []; warnings = []
  ROADMAP archive    -> {op:'write', path:'.planning/milestones/<v>-ROADMAP.md', content, action:'create'}
  REQUIREMENTS archive -> same with the archive header
  audit              -> {op:'move', from:'.planning/<v>-MILESTONE-AUDIT.md', to:'.planning/milestones/<v>-MILESTONE-AUDIT.md'}
  MILESTONES.md      -> {op:'write', ..., content: existing ? existing + '\n' + entry : '# Milestones\n\n' + entry,
                         action: existing ? 'append' : 'create'}
  STATE.md           -> {op:'write', ..., action:'update'} only when the replacement changes the bytes
  archive-objectives -> {op:'move', from: o.dir, to: '.planning/milestones/<v>-objectives/<basename>'} per toArchive
  return { version, name, date, stats..., milestone_entry: entry, ops, kept, warnings }

applyMilestonePlan(cwd, plan)                       // executes plan.ops in order, nothing else
  mkdir -p the parent of each destination just before its op; writeFileSync / renameSync
  return { written: [paths], moved: [{from,to}] }

cmdMilestoneComplete(cwd, version, options, raw)
  plan = planMilestoneComplete(...)
  if (options.dryRun) { stderr <- renderMilestonePlan(plan); output({...stats, dry_run:true, would_write, would_move,
                        would_keep: plan.kept, milestone_entry, warnings, milestones_updated:false, state_updated:false}, raw) }
  done = applyMilestonePlan(cwd, plan)
  output({ ...today's keys, dry_run:false, written, moved, kept: plan.kept, milestones_reason, warnings }, raw)
```
`archived.*` keep their meaning (the file or directory exists after the run); `milestones_updated` and `state_updated`
come from the executed ops. `renderMilestonePlan` writes `DRY RUN — nothing has been modified.`, `Plan for: milestone
complete <v>`, then `Would write:` / `Would move:` / `Would keep:` lists, then `Re-run without --dry-run to execute.`
In this task the plan has no keep rules yet (task 3 adds them): it reproduces today's writes exactly.

planning-verbs-cli.cjs local branch: `options = { name, archiveObjectives, dryRun: has(args, '--dry-run') }` (the store
branch is 68-06's). help.cjs `milestone` usage: `... milestone complete <version> [--name ...] [--archive-objectives]
[--dry-run] [--raw]`. Commit `feat(68-01): milestone complete --dry-run prints its plan and writes nothing`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs` passes (1-6 plus every existing test); `node --test plugins/devflow/devflow/bin/df-tools.test.cjs --test-name-pattern "milestone complete"` and `node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` pass.</verify>
  <done>Tests 1-6 went RED then GREEN; a dry run leaves the tree identical; a real run's output keeps every existing key.</done>
  <recovery>If test 5 (parity) fails, the apply step is deciding something on its own: move every decision into planMilestoneComplete and make apply a loop over ops. If a STATE.md test regresses, compare the STATE replacement with the pre-change code byte for byte (`git show HEAD~1:plugins/devflow/devflow/bin/lib/roadmap.cjs`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Re-run safety and version normalisation (tests 7-14)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/text-escape.cjs, plugins/devflow/devflow/bin/lib/text-escape.test.cjs, plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs</files>
  <action>
RED: tests 7-13 (milestone-complete.test.cjs) and 14 (text-escape.test.cjs). Commit `test(68-01): a second milestone complete duplicates nothing`.

GREEN:
- text-escape.cjs: `milestoneHeadingPattern(version)` → a RegExp source string, no flags:
  `^## +v?${escapeRegExp(digits)}(?=\\s|$)` where `digits` is `version` without a leading `v`/`V`. Callers add `m`.
  Export it; keep the module dependency-free (header comment: shared by the MILESTONES.md writers).
- roadmap.cjs `planMilestoneComplete`: normalise the version first (lazy `require('./gh-milestone.cjs').normaliseVersion`;
  null → keep the argument); then apply the Re-run rules from the context section: kept archives (`exists`), kept
  MILESTONES.md (`entry_exists`, `milestone_entry: null` in the dry run), audit and objective-directory moves skipped
  when the destination exists (`destination_exists` + a warning naming the path). The real run reports
  `milestones_reason: 'entry_exists'` when the entry was kept, else null.
Commit `fix(68-01): milestone complete keeps an existing entry and archives on a re-run`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs` passes; `node --test plugins/devflow/devflow/bin/df-tools.test.cjs --test-name-pattern "milestone complete"` passes; then the full suite (see validation_gates) shows no new failure.</verify>
  <done>Tests 7-14 went RED then GREEN; a second run writes no MILESTONES.md entry and rewrites no archive; `1.0` and `v1.0` share one entry and one archive set.</done>
  <recovery>If df-tools.test.cjs `appends to existing MILESTONES.md` fails, its seeded `## v0.9 Alpha` must not match v1.0; check the pattern escapes `.` and anchors on `(?=\s|$)`. If a test that passes `1.0` elsewhere in the suite now expects `1.0-*` file names, record it in the SUMMARY and keep the normalisation (TOOL-02 needs one name per version).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Locally, if git signing prompts hang micro.test.cjs, run
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'.
     Take the failing set before the first change; only those known environment failures may remain. -->
</validation_gates>

<verification>
- SC-1 (local): tests 1-4 show a dry run prints the plan and leaves `.planning/` identical, with no new directory.
- SC-2: tests 7-12 show one entry and one archive set after two runs, with `1.0`/`v1.0` and `milestone put` entries.
- Test 5 shows the dry run is the plan the real run executes.
</verification>

<success_criteria>
- Tests 1-14 pass, each having been RED first; existing milestone tests pass unedited; full suite at baseline.
- `rg -n "planMilestoneComplete|applyMilestonePlan" plugins/devflow/devflow/bin/lib/roadmap.cjs` shows both functions,
  and `rg -n "mkdirSync\(archiveDir" plugins/devflow/devflow/bin/lib/roadmap.cjs` finds nothing.
</success_criteria>

<output>
After completion, publish `68-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first).
</output>
