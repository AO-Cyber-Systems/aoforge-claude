---
objective: 78-remove-the-rename-shims
trd: "12"
type: standard
wave: 4
depends_on: ["78-01", "78-02", "78-03", "78-04", "78-05", "78-06", "78-07", "78-08", "78-09", "78-10", "78-11"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
  - docs/MIGRATING-TO-AOFORGE.md
  - site/content/docs/getting-started/migrating-to-aoforge.md
  - docs/USER-GUIDE.md
  - CHANGELOG.md
  - CLAUDE.md
autonomous: true
requirements: [SC-1, SC-2, SC-3, SC-4, SC-5]
must_haves:
  truths:
    - "compat.cjs exports no aliasLegacyEnv and imports nothing from legacy-names (SC-1 complete)"
    - "legacy-names.cjs: SHIM_REMOVAL = '3.1.0' documented as the release that removed the shims; SHIM_RELEASE = '3.0.x'; every LEGACY key that remains has at least one consumer (a test enforces it, counting legacy-rewrite's shared-key loop as a consumer of every key NAMES shares); the header lists what still needs LEGACY (detectors, gh rebrand, history readers, PRESERVE)"
    - "The rename guard still fails on a legacy name outside its ALLOW list; ALLOW reasons describe the 3.1 roles (legacy tests feed old names as input to prove they are ignored or reported); the `.gitignore` entry stays, with the reason that `main` still uses the legacy planning directory until the reconcile"
    - "An end-to-end test proves SC-4: a project with only `.planning/` (a pre-rename stamp in its config) and a `DEVFLOW_*` variable gets one global notice from upgrade-project and one from coexistence-guard, each naming its fix; aof-tools refuses with the same layout message; `--only 0012|0013|0014` give the retired message; nothing creates `.aoforge/`"
    - "docs/MIGRATING-TO-AOFORGE.md (and its site mirror) says the shims were removed in 3.1.0, lists what 3.1 still reports and how, and has an `Upgrading from 2.x` section with the 3.0.x path and the manual steps; USER-GUIDE, CHANGELOG [Unreleased] and CLAUDE.md describe the removal and every per-check decision"
    - "The full suite passes with watcher-shell.test.cjs excluded (the known W-3 fish hang) and the exclusion is stated"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs
      provides: "SC-4 end-to-end"
    - path: docs/MIGRATING-TO-AOFORGE.md
      provides: "the removal and the 2.x upgrade path"
  key_links:
    - from: docs/MIGRATING-TO-AOFORGE.md "Upgrading from 2.x"
      to: planning-layout.MIGRATION_GUIDE / legacyLayoutMessage
      via: "every 3.1 legacy message points at this section"
      pattern: "Upgrading from 2.x"
---

# TRD 78-12: Close-out — the last shim, the name map, the old-layout contract, the docs, the full suite

<objective>
Delete the last one-release shim (`aliasLegacyEnv`, whose callers 78-10 removed), set `SHIM_REMOVAL` to say the
removal is done, trim `legacy-names.cjs` to what is still used, prove SC-4 end to end, and write the docs: the migration
guide (and its site mirror), USER-GUIDE, CHANGELOG and CLAUDE.md. Finish with the full suite.

Purpose: SC-1 (aliasLegacyEnv gone), SC-2 (legacy-names trimmed, SHIM_REMOVAL done), SC-4 (end-to-end proof), SC-5
(docs and suite), plus SC-3's record (every per-check decision written down in one place).
Output: final code edits, one e2e test, five docs, a green suite.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/78-remove-the-rename-shims/78-01-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-02-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-03-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-04-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-05-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-06-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-07-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-08-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-09-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-10-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-11-SUMMARY.md
(Read each SUMMARY's Decisions table only; do not reread the TRDs.)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-12): <desc>" --files <paths>`.
  RED commit before GREEN for code.
- Tests use mkdtemp projects and a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag, release
  or bump versions (3.1.0 is released separately).
- Rename guard: CLAUDE.md is scanned and may NOT hold an ignore region: describe the removal without spelling a legacy
  name there (say "the pre-rename ..."). docs/USER-GUIDE.md and docs/MIGRATING-TO-AOFORGE.md (and the site mirror)
  may spell legacy names only inside `rename-guard:ignore-start` / `ignore-end` regions. CHANGELOG.md is outside the
  guard (history) but keep new entries in AOForge wording where possible.
- `site/`: edit only the hand-maintained migration page (it mirrors docs/MIGRATING-TO-AOFORGE.md below its front
  matter). Do not touch `site/data/` (generated at docs build by scripts/gen-docs-data.cjs).
</context>

<embedded_context>

<codebase_examples>
legacy-names.cjs today ends with:
```js
const PRESERVE = Object.freeze(['devflowops', 'devFlowOps', 'DevFlowOps', 'devflow-desktop', 'devflow.cloud']);
const SHIM_REMOVAL = 'the release after 3.0.0';
module.exports = { NAMES, LEGACY, PRESERVE, SHIM_REMOVAL };   // 78-01 added SHIM_RELEASE
```
The guide's section to rewrite is "## Removing the shims" (future tense today) and "## What keeps working until the
next release". CHANGELOG has an `## [Unreleased]` section with `### Added`; add `### Removed` and `### Changed`.
CLAUDE.md sections to update: the "Rename shims" bullet, the "Upgrade" bullet (0012/0013/0014), the "Doctor" bullet
(checks 15/16/17/27), "Validation" (W066/W067, new W069), "Runtime sync" (no runtime-state migration),
coexistence-guard / gate-edits / verify-commits / gate-executor-stop bullets (no pre-rename namespace), the
"Marketplace" paragraph (no pointer plugin), and "Where we left off" / "Still deferred".
</codebase_examples>

<anti_patterns>
- Do not reintroduce any reader while trimming legacy-names (a removed key with a remaining consumer is a bug: run the
  consumer test first).
- Do not invent decisions: copy them from the 78-0x SUMMARY Decisions tables; if two disagree, stop and report.
- Do not delete the `.gitignore` legacy lines or their ALLOW entry (see truths).
- Do not edit `.aoforge/` planning files directly (STATE/ROADMAP are updated by the execute workflow).
</anti_patterns>

<error_recovery>
- If the full suite fails in a file no 78 TRD touched, check `git log main..HEAD -- <file>` and the 78 SUMMARYs; if it
  is pre-existing, show it failing at the objective's base commit (5b98026e) and list it; otherwise fix it here.
- If doc-refs.repo.test.cjs or the built-in sweep fails on new doc text, fix the text, not the test.
</error_recovery>

</embedded_context>

<gotchas>
- The site mirror must stay identical to the guide below its front matter (`diff` them after editing).
- The guide's "Check it" table changes: W066 (legacy) is now a broken health result with a manual/3.0.x fix; W067 has
  two fixes; W069 is new; checks 15/16 are report-only; check 17 keeps its fix; no `--only 0012/0013`.
- Mention for `main`'s reconcile (CLAUDE.md "Where we left off" and the SUMMARY): `main` still keeps its planning tree
  in the legacy directory, so the reconcile must move it to `.aoforge/` (git mv) before 3.1 tools run there; the legacy
  `.gitignore` lines can go after that; W069 must not collide with any new code on `main` (it uses W068).
- Full suite: `node --test 'plugins/aoforge/**/!(watcher-shell).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`
  (fallback with `git ls-files ... | grep -v watcher-shell.test.cjs | xargs node --test`). If micro.test.cjs hangs on a
  signing prompt, exclude it too and say so.
</gotchas>

## Test list

1. SC-4 end to end (`old-layout.legacy.test.cjs`, scratch HOME, hand-built project with only the legacy planning
   directory whose config.json carries the pre-rename stamp, env with one `DEVFLOW_*` variable):
   a. upgrade-project hook -> exactly one global notice with `legacyLayoutMessage(root)`;
   b. coexistence-guard hook -> one notice naming the variable and its `AOFORGE_*` form;
   c. route-results on the next prompt emits both once; a second prompt emits nothing;
   d. `aof-tools state update-progress` and `aof-tools init plan-objective 1` -> exit 1 with the layout message;
   e. `aof-tools validate health --raw` -> broken, W066 with the fix; `aof-tools doctor --raw` -> the note;
   f. `aof-tools upgrade --apply --only 0012`, `0013`, `0014` in an `.aoforge/` scratch project -> the retired message;
   g. after a-f, no `.aoforge/` exists under the legacy project and its legacy directory is byte-identical.
2. compat: `aliasLegacyEnv` is not exported; compat.cjs does not require legacy-names.
3. legacy-names: `SHIM_REMOVAL === '3.1.0'`; every LEGACY key has a consumer under plugins/aoforge or scripts (direct
   `LEGACY.<key>` / destructuring, or legacy-rewrite's shared-key loop for keys NAMES also has).
4. Rename guard: still fails on a sample legacy line in a non-ALLOWed path (existing test 5a), every ALLOW entry live
   (test 4).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED + GREEN — last shim, name map, SC-4 end to end</name>
  <files>plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/compat.cjs, plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/legacy-names.cjs, plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs</files>
  <action>
RED: cases 1-3 (case 1 reuses `legacy-layout-fixtures.cjs` and the hook-spawn helpers the 78-07/78-06 tests use; no
new fixture module unless one is missing — hand-built only). Commit failing (case 1 may already pass: it is the
regression contract; cases 2-3 must fail).
GREEN:
- compat.cjs: delete `aliasLegacyEnv`, its export, its header entry and the legacy-names import; delete its cases in
  compat.legacy.test.cjs.
- legacy-names.cjs: `SHIM_REMOVAL = '3.1.0'` with the comment "the release that removed the one-release shims; 3.1
  code spells a legacy name only to detect and report it, in gh rebrand, and in readers of history recorded before the
  rename"; remove any LEGACY key case 3 shows unused (expected candidates: `commandNsShort`, `commandDash`, `notices`,
  `pagesProject` — verify each with rg before removing); rewrite the header to list the remaining consumer groups:
  detectors (planning-layout, coexistence, legacy-layout-guard, managed-block, global-upgrade, gh-setup, gh-legacy-labels,
  checks-pin, stack-mcp, doctor checks 15/16), the converter (gh-rebrand + legacy-rewrite), history readers
  (session-audit, agent-overhead), PRESERVE, and the rename guard/codemod.
- rename-guard.repo.test.cjs: update ALLOW reasons (`**/*.legacy.test.*`: "tests feed legacy names as input to prove
  3.1 ignores or reports them"; `__fixtures__/legacy-*`: "fixtures that build pre-rename projects, homes and GitHub
  artefacts as input"; `.gitignore`: "keeps the legacy ignore lines until main, which still uses the legacy planning
  directory, is reconciled with 3.1").
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs` passes; `rg -n "aliasLegacyEnv" plugins/aoforge scripts` finds nothing.</verify>
  <done>Cases 1-4 green; no one-release shim remains in code.</done>
  <recovery>If case 1c is flaky because route-results also emits project notices, assert on the two notice keys only.</recovery>
</task>

<task type="auto">
  <name>Task 2: Docs — guide (+ site mirror), USER-GUIDE, CHANGELOG, CLAUDE.md, doctor-checks README</name>
  <files>docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md, docs/USER-GUIDE.md, CHANGELOG.md, CLAUDE.md, plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md</files>
  <action>
- MIGRATING-TO-AOFORGE.md: intro says the one-release shims were removed in 3.1.0. Replace "What keeps working until
  the next release" with "What 3.1.0 removed" (each item, past tense) and "What 3.1 still reports" (W066/W067/W069,
  the CLI refusal, the SessionStart notices, checks 15/16/17/27, gh rebrand kept, the 3.0.0 watch daemon refusal).
  Add "## Upgrading from 2.x" (the anchor the 3.1 messages name): Option A, install AOForge 3.0.x once (how to get it:
  the `v3.0.0` tag of the repository) and follow the 3.0.0 checklist; Option B, by hand: `git mv .planning .aoforge`
  on a clean tree, rename the `devflow` stamp key in `.aoforge/config.json` to `aoforge` (or delete it when an
  `aoforge` key exists), rename the `DEVFLOW:START/END` CLAUDE.md markers to `AOFORGE`, update `.gitignore` lines that
  name `.planning/`, rename `DEVFLOW_*` variables, move `~/.claude/devflow/` aside after copying what you need, then
  `aof-tools upgrade --apply` and `aof-tools gh rebrand --apply` per repository. Keep every legacy spelling inside
  ignore regions. Update "Check it" and replace "Removing the shims" with a short "Removed in 3.1.0" note.
  Mirror the body into the site page (front matter unchanged); `diff` the two bodies.
- USER-GUIDE.md: the shim-layer paragraph (~line 30-55), the pointer plugin paragraph (~97), the doctor table rows
  15/16/17/27 (~119-122), the migrations table 0012/0013/0014 (~382-389: mark retired, ids reserved), "Health checks for
  the legacy layout" (~433-441: W066 broken/warning, W067 both fixes, W069), the hooks table rows (~976-983), the GitHub
  rebrand section (~1637: required now, not optional; the un-rebranded refusal). Legacy spellings only inside ignore
  regions.
- CHANGELOG.md `[Unreleased]`: `### Removed` (each shim, migrations 0012/0013/0014, NAMESPACE_RENAMES, the pointer
  plugin, the runtime-state migration, doctor fixes of checks 15/16, the dual GitHub readers and second status
  context, the global outside-text rewrite) and `### Changed` (the legacy-layout refusal and notice, W066 broken, W067,
  new W069, the un-rebranded-repository refusal, the stale `.mcp.json` report, the 3.0.0 daemon refusal), each with
  its objective/TRD.
- CLAUDE.md: the sections listed in codebase_examples; no legacy spelling; state the per-check decisions in one
  sentence each; "Still deferred": drop the shim removal, add the main reconcile note and "remove gh rebrand and the
  legacy detectors in a later release once no repository needs them".
- doctor-checks/README.md: check list (15/16 report-only, 17 fix kept, 27 adds W069) and the `legacyMirrorDir` comment
  (now from coexistence.cjs).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/builtin-sweep.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rg-flag-guard.test.cjs` passes (skip absent); `diff <(sed '1,/^---$/d' site/content/docs/getting-started/migrating-to-aoforge.md | sed '1,/^---$/d') <(sed '1,/^# Migrating/d' docs/MIGRATING-TO-AOFORGE.md)` shows only the title line difference, if any; `rg -n "Upgrading from 2.x" docs/MIGRATING-TO-AOFORGE.md` finds the heading.</verify>
  <done>Every doc says the shims are gone, names what 3.1 reports and how to upgrade from 2.x; every decision is recorded.</done>
  <recovery>If the guard fails on CLAUDE.md, rephrase with "pre-rename" instead of the name; never add an ignore region there.</recovery>
</task>

<task type="auto">
  <name>Task 3: Full suite and the decisions roll-up</name>
  <files>(no source changes expected; fixes only if the suite finds a regression)</files>
  <action>
Run the full suite with watcher-shell excluded (gotchas). Fix any regression caused by objective 78 in the file that
regressed (with a failing test first if behaviour is involved). Then assemble, for the SUMMARY, one table of every
removal/keep decision across 78-01..78-11 (item, decision, reason, TRD), and the reconcile notes for `main`.
  </action>
  <verify>The full suite exits 0 with only watcher-shell.test.cjs excluded (and micro.test.cjs if it hung on signing, stated); counts recorded.</verify>
  <done>SC-5 met: suite green, exclusions named; the decisions table exists.</done>
  <recovery>If a failure is pre-existing, prove it at base commit 5b98026e and record it; do not mask it with an exclusion.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (full suite; watcher-shell.test.cjs excluded — known W-3 fish hang)</test>
</validation_gates>

<verification>
- `rg -n "aliasLegacyEnv|isLegacyPlanning|bothPlanningDirs|legacyRuntimeHome|resolveUserFile|NAMESPACE_RENAMES|labelForms" plugins/aoforge scripts --glob '!*.legacy.test.*'`
  finds only planning-layout's own isLegacyPlanning/bothPlanningDirs (detectors) and its callers.
- `git ls-files plugins/devflow 'plugins/aoforge/aoforge/bin/lib/migrations/001[234]*'` prints nothing.
- Full suite green with the stated exclusion.
</verification>

<success_criteria>
- All five objective success criteria hold, with evidence in the SUMMARY (SC-1..SC-5 each mapped to tests/commands).
</success_criteria>

<output>
After completion, write `78-12-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-12 --from <draft>`
(after `tokens stamp 78-12 --draft <draft>`). Include the objective-wide decisions table, SC-1..SC-5 evidence, the
full-suite counts with exclusions, and the reconcile notes for `main`.
</output>
