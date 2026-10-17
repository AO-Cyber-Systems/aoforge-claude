---
objective: 79-reconcile-and-release-3-1-0
trd: "02"
type: standard
wave: 2
depends_on: ["79-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
  - "79-02 domain (only files a 79-01 triage row or a guard finding names): plugins/aoforge/aoforge/bin/** EXCEPT the files 79-03, 79-04 and 79-05 list; plugins/aoforge-stack-flutter/** EXCEPT profiles/flutter.md and profiles/dart.md; plugins/aoforge-stack-web/**; plugins/aoforge/skills/**; plugins/aoforge/agents/**; plugins/aoforge/aoforge/{workflows,references,templates}/**; scripts/**"
autonomous: true
requirements: [SC-2, SC-3]
must_haves:
  truths:
    - "A repo test fails when any tracked JS file under plugins/ or scripts/ references a compat export that does not exist, naming file:line:name; it covers destructuring, member calls (including the hooks' fail-open try/catch form), a bound module identifier, and a stack pack's `core('compat.cjs')` form, and ignores absence assertions and same-named exports of other modules"
    - "The same test fails, with an SC-2 message, if any of aliasLegacyEnv, bothPlanningDirs, isLegacyPlanning, legacyRuntimeHome or resolveUserFile is used as a compat export again; the names are built from parts so a search of the tree finds no call"
    - "The same test fails if any path under the pre-rename planning directory is tracked"
    - "A mutation proof (a scratch repo with one call to a removed export) makes the tree check fail, and the real tree passes"
    - "The rename guard and the stack-neutrality guard pass on the merged tree with no new ALLOW entry"
    - "Every 79-01 triage row routed to 79-02 passes, fixed at its source (caller or test), with the reason per row in the SUMMARY"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs
      provides: "compat-import, removed-export and legacy-planning-path guard"
      contains: "Test list"
  key_links:
    - from: "reconcile-guard.repo.test.cjs"
      to: "plugins/aoforge/aoforge/bin/lib/compat.cjs"
      via: "Object.keys(require('./compat.cjs')) is the export list"
      pattern: "compat.cjs"
    - from: "reconcile-guard.repo.test.cjs"
      to: "plugins/aoforge/aoforge/bin/lib/legacy-names.cjs"
      via: "LEGACY.planningDir names the directory without spelling it"
      pattern: "LEGACY"
---

# TRD 79-02: A repo guard for compat imports and the legacy planning path, and the wave-2 sweep of main's code

<objective>
Objective 78 deleted compat exports that main's new code still called (the merge did not flag them: git merges text,
not imports). 79-01 fixed the two load blockers. This TRD makes the class impossible to reintroduce: one repo test that
checks every compat reference in the tree against compat's real export list, forbids the five removed names explicitly,
and forbids a tracked pre-rename planning path. Then it runs that guard, the rename guard and the stack-neutrality guard
over the merged tree, and fixes every triage row 79-01 routed here.

Purpose: SC-2 ("a repo test fails if one returns") and the guard part of SC-3.
Output: `reconcile-guard.repo.test.cjs`, source fixes for the routed rows, a SUMMARY with a per-row ledger.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/compat.cjs
@plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs

Read the 79-01 SUMMARY's triage table first: the rows routed to 79-02 are this TRD's work list. Files listed in 79-03
(hooks), 79-04 (planning-mode, planning-verbs tests, model and compat tests) and 79-05 (requirements tests, stack
profile text) are NOT yours even when a guard finding lands there: record such a finding in the SUMMARY for that TRD
and leave the file alone (parallel worktrees: touching it causes a wave-merge conflict).

Run the CLI and tests from the checkout you were given (CHECKOUT): `node plugins/aoforge/aoforge/bin/aof-tools.cjs`.
Tests use an empty `mktemp -d` HOME (pass `HOME=<dir>` in the env); never write the real `~/.claude`.

compat.cjs (objective 78, single-name) exports exactly: planningDirName, planningRoot, planningRel, PLANNING_DIR_NAMES,
isPlanningDirName, planningDirLabel, findProjectRoot, userHomeDir, isUserHome, isOwnAgentType, isOwnExecutor,
userDotFile, runtimeHome, watchStateDir. The test must read the list from the module, never hard-code it.

Legitimate same-named functions that are NOT compat exports (no false positives): planning-layout.cjs exports
`isLegacyPlanning`, `bothPlanningDirs`, `findLegacyLayoutRoot`, `legacyLayoutMessage` (78-01 detectors, used by
doctor-cli, gh-rebrand, upgrade, legacy-layout-guard, stack-drafter-fleet.test); coexistence.cjs exports
`legacyRuntimeHome` (78-06 detector, used by doctor.cjs); `__fixtures__/legacy-runtime-fixtures.cjs` exports a
`legacyRuntimeHome` fixture.
</context>

<embedded_context>

<codebase_examples>
Reference forms the scanner must recognise (all seen in the merged tree):
```js
const { planningRoot, planningRel } = require('../compat.cjs');                 // migrations/0015
const { PLANNING_DIR_NAMES } = require('./compat.cjs');                         // security-sweep.cjs
const { planningRoot } = require('./compat.cjs');                               // inside a function: stack-packs.cjs
require('./lib/compat.cjs').someExport();                                        // CLI entry (removed form)
try { require('../aoforge/bin/lib/compat.cjs').someExport(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; } // hooks
const compat = require('./compat.cjs'); compat.findProjectRoot(dir);            // bound identifier
const { watchStateDir } = require('./core.cjs')('compat.cjs');                   // stack pack (79-01 resolution)
```
Absence assertions the scanner must ignore (78's tests):
```js
assert.equal('resolveUserFile' in compat, false);     // compat.home.test.cjs
assert.strictEqual(compat[name], undefined);          // computed access is never a reference
```
How 78-12 kept a removed name out of `rg`: `const ALIAS = ['alias', 'Legacy', 'Env'].join('');`.

How existing repo tests enumerate the tree (rename-guard.repo.test.cjs): `git ls-files` from the repo root, with a
`describe(..., { skip: IS_PLUGIN_CHECKOUT ? false : 'not a plugin source checkout' })` guard so a mirror install skips.
</codebase_examples>

<anti_patterns>
- Restoring a removed export in compat.cjs, or adding a shim module, to satisfy a caller. Fix the caller to use the
  current name (or planning-layout's detector when the caller genuinely needs to DETECT the old layout).
- A regex that matches any `.isLegacyPlanning(` anywhere: that would flag planning-layout's own callers. Resolve the
  module a reference comes from.
- Adding ALLOW entries to the rename guard or the neutrality guard to make a finding go away. Fix the source; an entry
  is acceptable only for a file whose job is to spell the name (and then with a reason, recorded as a decision).
- Spelling a removed export name or the pre-rename directory as a literal in this test (build from parts / LEGACY).
- Editing CLAUDE.md, docs/, CHANGELOG or site/ (wave 3 owns them).
</anti_patterns>

<error_recovery>
- A guard finding in another TRD's file: record "for 79-0N: <file:line> <finding>" in the SUMMARY; do not edit it.
- A triage row whose fix is unclear (main's test asserts 3.0.0 behaviour, 78 changed it on purpose): the 78 behaviour
  wins (it is the 3.1 contract); rewrite the test's expectation to the 78 rule and cite the 78 TRD that set it
  (the 78-12 decisions table lists them). If the 78 decision does not cover the case, stop and return the question.
- The neutrality guard flags a core file that 73/78 wrote naming a pack-owned stack: move the wording to neutral terms
  or into the pack, as objective 77 did; record each.
</error_recovery>

</embedded_context>

## Test list

reconcile-guard.repo.test.cjs, outermost first:

1. repo: no tracked path under the pre-rename planning directory (`git ls-files -- <LEGACY.planningDir>` is empty)
2. repo: every compat reference in tracked `*.cjs`/`*.js` under `plugins/` and `scripts/` names a current compat export;
   a failure lists each `file:line name`
3. repo: none of the five removed names (built from parts) is referenced as a compat export; the message names SC-2 of
   objective 79 and says to fix the caller, not compat.cjs
4. mutation: a scratch git repo holding `lib/compat.cjs` (copied export list) and one file calling a removed export
   fails the tree check; the same repo with the call removed passes
5. scanner: destructuring from a compat require, including renames (`{ a: b }`) and a require inside a function
6. scanner: member call/read on `require(...compat.cjs)` directly, including the hooks' fail-open try/catch form
7. scanner: a bound identifier (`const compat = require(...)`) then `compat.x` reads and calls
8. scanner: a pack's `require('./core.cjs')('compat.cjs')` and `core('compat.cjs')` forms
9. scanner: absence assertions (`'x' in compat`, computed `compat[name]`, `typeof compat.x`, `compat.x === undefined`,
   `assert.equal(compat.x, undefined)`) are not references
10. scanner: a same-named export required from planning-layout.cjs, coexistence.cjs or a fixture is not a compat
    reference

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED then GREEN — reconcile-guard.repo.test.cjs with its scanner and mutation proof</name>
  <files>plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs</files>
  <action>
RED: write cases 5-10 (scanner, on hand-written source strings: no generated data) and case 4 (mutation, a `mktemp -d`
git repo built with `git init -b main` and `GIT_CONFIG_GLOBAL=/dev/null`, `commit.gpgsign=false` via `-c`, a fake
HOME) against functions `compatRefs(text)` -> `[{line, name}]` and `checkTree(root)` -> `{bad:[{file,line,name}],
removed:[...], legacyPaths:[...]}` that do not exist yet. Run `node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs`
and confirm they fail for that reason. Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "test(79-02): RED compat-import and legacy-path guard" --files plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs`.

GREEN: implement both functions inside the test file (it is the only consumer):
1. collect compat module paths: any `require('<...>/compat.cjs')` string, and `core('compat.cjs')` /
   `require('./core.cjs')('compat.cjs')`; 2. destructuring `const|let|var { ... } = <compat require>` -> keys (left side
   of `a: b`); 3. `<compat require>.name` -> name; 4. `const|let|var <id> = <compat require>;` then `<id>.name` (dot
   access only) -> names, skipping the absence forms of case 9; 5. report line numbers. Write a short header naming the
   reason (objective 79: the merge with main) and the Test list. Then cases 1-3 on the real tree (skip guard as in
   rename-guard for a non-checkout). Build the five removed names from parts.
Run the file (scratch HOME): all cases pass on the tree (79-01 removed the two known callers). If case 2 or 3 finds a
caller, fix it in Task 2, not by weakening the scanner. Commit: `... commit "test(79-02): GREEN compat-import and legacy-path guard" --files plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs`.
  </action>
  <verify>`env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` passes all 10 cases; `rg -n -e "alias""LegacyEnv" -e "resolve""UserFile" plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` prints nothing (names built from parts)</verify>
  <done>The guard exists, bites on a mutation, ignores absence assertions and other modules' detectors, and passes on the merged tree.</done>
  <recovery>If the scanner cannot distinguish a case with a reasonable regex, narrow it to the forms present in the tree (list them with `rg -n "compat\.cjs" plugins scripts`) and record the unsupported form in the header.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Run the three guards over the merged tree and fix every finding at its source</name>
  <files>plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs, files named by the guards inside the 79-02 domain</files>
  <action>
Run, with a scratch HOME, one per Bash call:
`node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs`
`node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`
`node --test plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`
`node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs`
For each finding in your domain: fix the source (current name; pack-neutral wording; or, for a caller that must detect
the old layout, planning-layout's detector). Each fix gets the failing guard output as its RED evidence and a scoped
re-run as GREEN. Also sweep prompts in your domain for prose that still describes a 3.0.0 shim as working in this
release: `rg -n -e "for one release" -e "only 0012" -e "only 0013" -e "only 0014" -e "pointer plugin" -e "or a legacy one" plugins/aoforge/skills plugins/aoforge/agents plugins/aoforge/aoforge/workflows plugins/aoforge/aoforge/references plugins/aoforge/aoforge/templates plugins/aoforge-stack-flutter plugins/aoforge-stack-web scripts`
and correct each true hit to the 3.1 fact (many "pointer" hits mean "Read pointer" and are fine; record what you kept).
Commit per logical fix with `aof-tools commit "fix(79-02): <what>" --files <paths>`.
  </action>
  <verify>All four commands above pass; the prose sweep's remaining hits are listed in the SUMMARY as intentional</verify>
  <done>The rename, neutrality, compat-entry, legacy-names and reconcile guards are green on the merged tree with no new ALLOW entry.</done>
  <recovery>A guard finding that needs a docs edit (CLAUDE.md, docs/, site/) goes to the SUMMARY for 79-07.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fix every triage row 79-01 routed to 79-02</name>
  <files>plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs, other files named by 79-02 triage rows</files>
  <action>
For each 79-02 row in the 79-01 SUMMARY: re-run that test file alone (scratch HOME) to confirm it still fails (RED
evidence), find the cause (most expected: main-side code or tests written against 3.0.0's one-release behaviour, which
objective 78 removed; main-side modules reading a moved path; stack-pack code reaching a core module 78 changed), fix
at the source following the 78 contract, re-run (GREEN). Main modified `file-identities.legacy.test.cjs` and
`planning-layout.legacy.test.cjs` after 3.0.0; check both pass and still describe 78's rules (e.g. W066 broken for a
legacy-only project, no 0012/0013 fix commands). Then run the whole domain once:
`node --test 'plugins/aoforge-stack-*/**/*.test.cjs' 'scripts/**/*.test.cjs'` and the lib files named in your rows,
scratch HOME. Commit per row or per cause.
  </action>
  <verify>Every 79-02 triage row's test file passes alone; `env HOME=$(mktemp -d) node --test 'plugins/aoforge-stack-*/**/*.test.cjs' 'scripts/**/*.test.cjs'` exits 0</verify>
  <done>The SUMMARY ledger has one line per routed row: test, cause, fix, commit; nothing routed here is left red.</done>
  <recovery>A row that turns out to belong to another TRD (its fix is in that TRD's files): re-route it in the SUMMARY and leave it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs {files})</test>
</validation_gates>

<verification>
- reconcile-guard 10/10; rename, neutrality, compat-entry and legacy-names guards green; mutation proof recorded.
- Every routed triage row green with its cause recorded.
</verification>

<success_criteria>
- A removed compat export or a tracked pre-rename planning path cannot come back without a red repo test, and main's
  code now runs on objective 78's single-name compat.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-02-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
