---
objective: 72-install-and-naming-cleanup
trd: "05"
type: standard
wave: 3
depends_on: ["72-04"]
files_modified:
  - "plugins/aoforge/aoforge/bin/** (planning pass: libs, aof-tools.cjs, lib tests and fixtures)"
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/validate.cjs
  - plugins/aoforge/aoforge/bin/lib/init.cjs
  - plugins/aoforge/aoforge/bin/lib/help.cjs
autonomous: true
requirements: [INST-02, INST-03]
must_haves:
  truths:
    - "In a project with only `.aoforge/`, every aof-tools verb in the contract list reads and writes under `.aoforge/`; `init new-project` and `adopt scaffold` in an empty repo create `.aoforge/` (never `.planning/`)"
    - "In a legacy project with only `.planning/`, the same verbs work and write under `.planning/` (no stray `.aoforge/` is created by a read or a write): init plan-objective/execute-objective/progress, state load/update, roadmap analyze, objective add, planning draft + doc put, summary post, config-get/config-set, commit --files, validate health, planning mode, stack resolve"
    - "`validate health` in a legacy project reports W066 `legacy-planning-dir` whose fix names `aof-tools upgrade --apply --only 0012`; with both directories it reports W066 saying `.planning/` is ignored; with only `.aoforge/` there is no W066"
    - "`init plan-objective` / `init execute-objective` in a legacy project carry the W066 line in `advisories_warnings`"
    - "No `path.join(<root>, '.planning'` remains in `plugins/aoforge/aoforge/bin/**` non-test code; project-root discovery in libs goes through `compat.findProjectRoot`"
    - "The full suite passes at the 72-04 baseline"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
      provides: "outside-in contract: aof-tools verbs on .aoforge, legacy .planning, both, none"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
      provides: "minimal valid planning trees in each layout"
      exports: ["planningProject"]
    - path: plugins/aoforge/aoforge/bin/lib/validate.cjs
      provides: "Check 21: W066 legacy-planning-dir"
      contains: "W066"
  key_links:
    - from: "bin/lib/*.cjs path construction"
      to: "compat.cjs planningRoot"
      via: "codemod planning pass + residual fixes"
      pattern: "planningRoot\\("
    - from: "validate.cjs Check 21"
      to: "compat.isLegacyPlanning / bothPlanningDirs"
      via: "W066 with fix `aof-tools upgrade --apply --only 0012`"
      pattern: "W066"
---

# TRD 72-05: Every aof-tools verb resolves `.aoforge/` first and falls back to `.planning/` (libs)

<objective>
Run the codemod's `planning` rules over `plugins/aoforge/aoforge/bin/**`, so the CLI and its libraries find a
project's planning tree at `.aoforge/` (the new default) or, for one release, at a legacy `.planning/`. Prove it with an
outside-in contract over the verbs that matter, and make `validate health` and the init advisories name the migration
(W066). Hooks and prose follow in 72-06.

Purpose: INST-03's `.planning/` fallback and INST-02's new default directory.
Output: resolver adopted across the libs, the legacy-layout contract suite, W066.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md
@.planning/objectives/72-install-and-naming-cleanup/72-04-SUMMARY.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read narrowly: `compat.cjs` (72-02) exports; `scripts/aoforge-rename.cjs --help`; `validate.cjs` around
`// ─── Check 20` (the last check; add Check 21 after it, same `addIssue('warning', code, message, fix, repairable)`
shape); `init.cjs` `advisories_warnings` (two init commands push into it); `planning-mode.cjs` `resolveMainRoot`;
`estimate-run-store.cjs` 157 (`findProjectRoot`); `session-audit.cjs` 372 (`findPlanningRoot`).

Planning-time measurements: ~370 `path.join(<root>, '.planning'` sites (handled by the rule) and ~270 `.planning/`
string literals in non-test code across ~80 files (rewritten to `.aoforge/` and listed as residuals). Residual hot
spots: init.cjs 32, adopt.cjs 27, help.cjs 16, planning-verbs.cjs 10 (`no .planning/ directory at or above` x7),
0010-store-gitignore.cjs 9, validate.cjs 8, roadmap/project-hygiene/micro 6 each.
</context>

## Test list

Outside-in: spawn `node plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <root> ...` with a fake HOME. One at a time.

**Layout `aoforge` (only `.aoforge/`)**
1. `state load --raw`, `roadmap analyze --raw`, `init plan-objective 1` succeed; `objective add "Second"` creates
   `.aoforge/objectives/02-second/`; no `.planning/` exists afterwards.
2. `init new-project` in an empty git repo creates `.aoforge/config.json`; `adopt scaffold` in an adopt-ready fixture
   writes `.aoforge/` (reuse `adopt-fixtures.cjs` if it exposes a ready repo).

**Layout `legacy` (only `.planning/`)**
3. Read verbs: `state load`, `roadmap analyze`, `init plan-objective 1`, `init execute-objective 1`, `init progress`,
   `planning mode`, `config-get workflow.auto_advance`, `stack resolve` (STACK.md under `.planning/`) succeed with the
   same output they give for layout `aoforge` (paths aside).
4. Write verbs: `objective add "Second"`, `planning draft PROJECT.md` + `doc put PROJECT.md --from <draft>`,
   `summary post 01-01 --from <file>`, `state update-progress`, `config-set workflow.x true`, and
   `commit "docs: x" --files .planning/STATE.md` (in a git fixture) all write under `.planning/`; `.aoforge/` is never
   created.
5. `validate health --raw` includes `W066` with `legacy-planning-dir` and the fix `aof-tools upgrade --apply --only 0012`.
6. `init plan-objective 1` JSON `advisories_warnings` contains the W066 line.

**Layout `both`**
7. Verbs use `.aoforge/`; `validate health` W066 says both exist and `.planning/` is ignored.

**Layout `aoforge`, no regression**
8. `validate health --raw` has no W066.

<embedded_context>

<codebase_examples>
Codemod usage:
```bash
node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/aoforge/bin --report <scratchpad>/planning-libs.json
node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/aoforge/bin --write --report <scratchpad>/planning-libs.json
```
Residual categories and the fix for each:
- Human text (help, messages, errors): keep the codemod's `.aoforge/` but, where the text names a location the user
  must find, use the resolved name: `` `no .aoforge/ (or legacy .planning/) directory at or above ${root}` `` is built
  from `NAMES.planningDir` / `LEGACY.planningDir`, never a literal.
- Relative paths for git (pathspecs, `--files`, gitignore lines, `path.join('.planning', ...)`): use
  `planningDirName(root)` from compat.
- Project-root discovery (`findUp(start, '.planning')`, `findProjectRoot`, `findPlanningRoot`): `compat.findProjectRoot`.
- `pathExistsInternal(cwd, '.planning')`: `fs.existsSync(planningRoot(cwd))` semantics (a dir named either way).
- Regex literals over paths: build from `NAMES.planningDir` and `LEGACY.planningDir` with `escapeRegExp`
  (`text-escape.cjs`).
- Remote reads (`gh-check-cli.cjs` reads `repos/<repo>/contents/.planning/config.json`): try the `.aoforge` path, then
  the legacy one.
- Migrations 0001-0011 keep working on either layout (they take `planningRoot(root)`); 0010's gitignore block is
  72-08's.
</codebase_examples>

<anti_patterns>
- Do not cache a resolved directory at module load: 72-08's migration moves it mid-process.
- Do not create `.aoforge/` when a legacy `.planning/` exists (that splits the project). `planningRoot` already
  prefers an existing dir; any `mkdirSync(path.join(root, '.aoforge'))` literal is a bug.
- Do not touch hooks, skills, agents, workflows, templates or references (72-06).
- Do not spell `.planning` in non-test code: build it from `LEGACY.planningDir` (the 72-06 guard extension will enforce
  it).
</anti_patterns>

<error_recovery>
- A contract case that fails only in layout `legacy` points at a residual string path: grep the verb's module for
  `.aoforge/` literals and convert per the categories.
- Tests asserting old messages: the codemod rewrote test files in `bin/**` consistently; a mismatch means the code
  message became dynamic. Assert on the layout-specific text.
- `roadmap-reconcile.test.cjs` E2E1 is a known transient (71-05 baseline).
</error_recovery>

</embedded_context>

<gotchas>
- This repo's own planning tree stays at `.planning/` (moved in 72-21). After this TRD the repo's aof-tools reads it
  through the fallback and `validate health` on this repo shows W066: expected until 72-21.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- Full suite: `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: minimal planning trees in every layout</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs</files>
  <action>
`planningProject({ layout = 'aoforge'|'legacy'|'both'|'none', git = true, files = {} })` -> `{ root, home, dir,
cleanup }`: mkdtemp root and a fake home; when the layout has a dir, write a minimal valid tree typed out by hand:
PROJECT.md (frontmatter `kind: plugin`, `default_work: feature`), ROADMAP.md (one milestone, `### Objective 1: First`
with goal, requirements `T-01`, one success criterion), REQUIREMENTS.md (`T-01`), STATE.md (Current Position block),
config.json (`{"mode":"yolo","github":{"enabled":false}}`), `objectives/01-first/OBJECTIVE.md` and one TRD
`01-01-x-TRD.md`. `git: true` -> `git init`, local user, commit with `-c commit.gpgsign=false`. Header: legacy
directory names may be spelled here. Check with `node -e`. Commit (`test(72-05): planning layout fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs');for(const l of ['aoforge','legacy','both','none']){const p=f.planningProject({layout:l});console.log(l,require('fs').readdirSync(p.root));p.cleanup()}"</verify>
  <done>The builder makes each layout; the trees load with the current aof-tools (`state load` on layout aoforge
fails today, which Task 2 fixes).</done>
  <recovery>If `state load` rejects the minimal STATE.md, copy the shape from `templates/state.md` sections it requires.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Contract suite RED, planning pass over bin/**, residuals GREEN</name>
  <files>plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/** (planning pass)</files>
  <action>
RED: cases 1-4 and 7 (header test list with all 8 first). Run: layout `aoforge` cases fail (code still reads
`.planning`), legacy cases pass. Commit RED.

GREEN: run the codemod (codebase_examples), dry run first, then `--write`. Work through the residual report by
category until cases 1-4 and 7 pass, then run the full suite and fix fallout. Every fix uses compat or the LEGACY/NAMES
constants. Commit GREEN (`feat(72-05): libs resolve .aoforge first, .planning as fallback`); split into two commits if
the residual fixes are large (mechanical pass, then residuals), each with the suite green.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs && node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</verify>
  <done>Cases 1-4 and 7 pass; `rg -n "path\.(join|resolve)\([^)]*'\.planning'" plugins/aoforge/aoforge/bin -g '!*.test.cjs' -g '!__fixtures__'` prints nothing; the full suite is at baseline.</done>
  <recovery>If a residual needs a design decision (e.g. a remote API path), take the dual-read option (new then legacy)
and note it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: W066 in validate health and the init advisories</name>
  <files>plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/validate.cjs, plugins/aoforge/aoforge/bin/lib/init.cjs, plugins/aoforge/aoforge/bin/lib/help.cjs</files>
  <action>
RED: cases 5, 6, 7 (W066 part) and 8. Run: fail. Commit RED.

GREEN:
- `validate.cjs` Check 21 "Legacy planning directory (objective 72, INST-03)": when `compat.isLegacyPlanning(cwd)`,
  `addIssue('warning', 'W066', 'legacy-planning-dir: this project still uses the legacy planning directory; AOForge reads it for one release', 'Run \`aof-tools upgrade --apply --only 0012\` (or start a session: the upgrade hook moves it)', false)`
  with the directory names built from LEGACY/NAMES; when `bothPlanningDirs(cwd)`, W066 with "both exist; the legacy
  one is ignored" and the fix "move anything you still need into .aoforge/, then remove the legacy directory".
- `init.cjs`: in both init commands that build `advisories_warnings`, push the same one-line W066 text when legacy.
- `help.cjs`: the `validate` entry lists W066.
Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/validate.test.cjs plugins/aoforge/aoforge/bin/lib/init.test.cjs</verify>
  <done>Cases 1-8 pass; full suite at baseline; `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate health --raw`
in this repo reports W066 (expected until 72-21).</done>
  <recovery>If `validate.test.cjs` counts warnings on fixtures, the fixtures were rewritten to `.aoforge` by the
codemod and should show no W066; a count change means a fixture still has `.planning` only.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs` passes all 8 cases.
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load --raw` still works in this repo (legacy fallback).
</verification>

<success_criteria>
- New projects get `.aoforge/`; a legacy `.planning/` project keeps working and is told how to migrate.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-05-SUMMARY.md` through
`df-tools summary post`.
</output>
