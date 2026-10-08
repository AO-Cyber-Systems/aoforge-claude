---
objective: 72-install-and-naming-cleanup
trd: "06"
type: standard
wave: 4
depends_on: ["72-05"]
files_modified:
  - "plugins/aoforge/hooks/** (planning pass + residuals)"
  - plugins/aoforge/hooks/planning-layout.legacy.test.js
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
  - "plugins/aoforge/skills/**, plugins/aoforge/agents/** (prose)"
  - "plugins/aoforge/aoforge/workflows/**, references/**, templates/** (prose)"
  - "plugins/eden-ui-flutter/**, plugins/monorepo-standards/** (prose references)"
  - docs/USER-GUIDE.md
  - "site/content/**"
  - README.md
  - CLAUDE.md
  - .gitignore
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
autonomous: true
requirements: [INST-02, INST-03]
must_haves:
  truths:
    - "gate-edits treats a Write under `.aoforge/` and under a legacy `.planning/` the same way it treated `.planning/` before (planning artifact rules, store-mode cache denials), and finds a live skill marker in `.aoforge/.skill-active` or a legacy `.planning/.skill-active`, locally and in the main checkout of a worktree"
    - "gate-executor-stop finds a TRD's SUMMARY under `.aoforge/objectives/` or a legacy `.planning/objectives/`; verify-completion, route-intent, classify-session and upgrade-project's notices path work in both layouts"
    - "Every skill, agent, workflow, reference and template names `.aoforge/` (not `.planning/`) and `@.aoforge/...` references"
    - "`.gitignore` carries the `.aoforge/` form of each legacy ignore line next to the legacy line"
    - "The rename guard also fails on the legacy planning directory name outside its allowlist and ignore regions; it passes on the tree"
    - "The full suite passes at the 72-05 baseline"
  artifacts:
    - path: plugins/aoforge/hooks/planning-layout.legacy.test.js
      provides: "hook contract over the .aoforge, legacy and both layouts"
    - path: plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
      provides: "guard extended with the planning directory token"
      contains: "planningDir"
  key_links:
    - from: "hooks/gate-edits.js"
      to: "compat.cjs planningRoot/findProjectRoot + LEGACY/NAMES.planningDir"
      via: "artifact path test and marker lookup built from both names"
      pattern: "planningDir"
---

# TRD 72-06: Hooks and prose speak `.aoforge/`, with the legacy fallback in the hooks

<objective>
Finish the planning-directory rename: the hooks resolve `.aoforge/` first and a legacy `.planning/` second (same
contract as 72-05's libs), and every piece of prose an agent or a user reads names `.aoforge/`. Extend the rename guard
to the planning directory name so it cannot creep back.

Purpose: INST-02 and INST-03 for the hooks, which gate every session once 3.0.0 is installed.
Output: hook contract suite, planning pass over hooks and prose, guard extension.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-05-SUMMARY.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read narrowly: `hooks/gate-edits.js` (`rg -n "planning|skill-active|isAoforgeAgent|mainCheckout" plugins/aoforge/hooks/gate-edits.js`),
`hooks/gate-executor-stop.js` 60-130 and 150-290, `hooks/upgrade-project.js` 55-130 and 214-260 (`ensureExcluded`),
`hooks/route-intent.js` around the "project (.aoforge/ exists)" line, `hooks/verify-completion.js` 320-330.

Planning-time hook sites: gate-edits.js 24 `.planning` mentions (one path regex `/\/\.planning\//` at ~398),
gate-executor-stop.js 15 (`findUp(start, '.planning')`, `path.resolve(root, '.planning', 'objectives')`),
verify-completion.js 9, upgrade-project.js 7 (NOTICES_REL, `ensureExcluded`), route-intent.js 1.
</context>

## Test list

**hooks/planning-layout.legacy.test.js** (spawn each hook with a JSON payload on stdin, fake HOME, per layout)
1. gate-edits, ambient (no marker), Write to `src/a.js` in layout `aoforge`: denied (strict default) — baseline.
2. Same with a live marker at `.aoforge/.skill-active`: allowed; layout `legacy` with the marker at
   `.planning/.skill-active`: allowed.
3. Worktree of a `legacy` main checkout (gitignored marker only in the main checkout's `.planning/`): allowed; same for
   `aoforge`.
4. Write to `<root>/.aoforge/objectives/01-first/x.md` and `<root>/.planning/objectives/01-first/x.md` (legacy) ->
   treated as planning artifacts exactly as the pre-rename `.planning/` path was (same decision as the existing
   gate-edits test for that path).
5. gate-executor-stop: an executor transcript naming `01-01-x-TRD.md`; SUMMARY present under the layout's objectives
   dir -> no block; absent -> one block. Both layouts.
6. route-intent: a prompt in layout `legacy` gets the project reminder (project detected); layout `none` gets none.
7. upgrade-project: notices land in the resolved planning dir; `ensureExcluded` writes exclude lines for the resolved
   dir's runtime files.

**rename-guard (extension)**
8. The guard's token set includes the legacy planning directory name (built from `LEGACY.planningDir`); a sample line
   `cat .planning/STATE.md` yields one finding; the tree passes with ALLOW entries for `.gitignore`,
   `plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js` and the existing ones.

<embedded_context>

<codebase_examples>
The single path regex in gate-edits today (post-72-04 names):
```js
if (/\/\.planning\//.test(filePath)) return { decision: 'allow', reason: 'planning artifact' };
```
Replace with a module-level regex built once from names (not from the filesystem):
```js
const { NAMES, LEGACY } = require('../aoforge/bin/lib/legacy-names.cjs');
const { escapeRegExp } = require('../aoforge/bin/lib/text-escape.cjs');
const PLANNING_SEGMENT_RE = new RegExp(`/(?:${escapeRegExp(NAMES.planningDir)}|${escapeRegExp(LEGACY.planningDir)})/`);
```
Codemod for the hooks and the prose:
```bash
node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/hooks --write --report <scratchpad>/planning-hooks.json
node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/skills --only plugins/aoforge/agents --only plugins/aoforge/aoforge/workflows --only plugins/aoforge/aoforge/references --only plugins/aoforge/aoforge/templates --only plugins/eden-ui-flutter --only plugins/monorepo-standards --only docs/USER-GUIDE.md --only site/content --only README.md --only CLAUDE.md --write --report <scratchpad>/planning-prose.json
```
</codebase_examples>

<anti_patterns>
- A path test against only `.aoforge/` in a hook: a legacy project would lose its planning-artifact allowance and its
  marker. Always both names, `.aoforge` first.
- Do not resolve the planning dir once at hook load in a long-lived process; hooks are short-lived, but libs they call
  must not cache either.
- Do not rewrite the CLAUDE.md transition note region (it names `.planning/` on purpose until 72-22).
- Do not remove legacy `.gitignore` lines.
- Do not change gate severities, escape variables or the hook output shapes.
</anti_patterns>

<error_recovery>
- `gate-edits.test.js` (81 `.planning` uses) was rewritten by the codemod to `.aoforge`; if a case now fails, the hook
  still has a literal: grep the hook for `.aoforge` literals and switch to the resolved name.
- `planning-writes.audit.test.js` allowlists the in-tree runtime files by name; the names pass changed the notices file
  name. Keep the allowlist consistent with `NAMES.notices`.
- The prose pass may touch a `status: legacy` workflow; that is fine (it is prose).
</error_recovery>

</embedded_context>

<gotchas>
- Hooks live outside `bin/lib`: their compat import is `require('../aoforge/bin/lib/compat.cjs')`.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- Full suite: `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: main checkout plus worktree in each layout</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs</files>
  <action>
Add `worktreePair({ layout, marker = 'main' | 'local' | 'none' })` -> `{ main, worktree, cleanup }`: a git
`planningProject` (Task 1 of 72-05), a `git worktree add` on a new branch, the skill marker written (with a future
`expires_at`, same JSON shape the skill-active lib writes) in the main checkout's or the worktree's planning dir per
`marker`, and the marker file excluded via `.git/info/exclude` the way the real hook does. Check with `node -e`. Commit
(`test(72-06): worktree pair fixture`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs');const p=f.worktreePair({layout:'legacy'});console.log(require('fs').existsSync(p.worktree));p.cleanup()"</verify>
  <done>`worktreePair` builds both layouts with the marker where asked.</done>
  <recovery>Use `skill-active.cjs`'s writer function to produce the marker if its shape is unclear.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Hooks resolve both layouts</name>
  <files>plugins/aoforge/hooks/planning-layout.legacy.test.js, plugins/aoforge/hooks/*.js</files>
  <action>
RED: cases 1-7 (header test list first). Run: the `aoforge` layout cases fail (hooks still look for the legacy dir),
legacy cases pass. Commit RED.

GREEN: run the hooks planning pass (codebase_examples), then fix residuals: project-root lookups via
`compat.findProjectRoot`; path tests via a both-names regex; marker lookup via `planningRoot(root)` for the local root
and for the main checkout root; `NOTICES_REL` and `ensureExcluded` via `planningDirName(root)`; messages built from
`NAMES.planningDir`. Run the hooks suites and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/hooks/planning-layout.legacy.test.js 'plugins/aoforge/hooks/*.test.js'</verify>
  <done>Cases 1-7 pass; `rg -n "'\.planning'|\\\\\.planning" plugins/aoforge/hooks -g '!*.test.js'` prints nothing.</done>
  <recovery>If case 3 fails only for `aoforge`, the main-checkout resolver still joins a literal; it must call
`planningRoot(mainRoot)`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Prose pass and the guard's planning token</name>
  <files>plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs, plugins/aoforge/skills/**, plugins/aoforge/agents/**, plugins/aoforge/aoforge/workflows/**, plugins/aoforge/aoforge/references/**, plugins/aoforge/aoforge/templates/**, plugins/eden-ui-flutter/**, plugins/monorepo-standards/**, docs/USER-GUIDE.md, site/content/**, README.md, CLAUDE.md, .gitignore</files>
  <action>
RED: case 8 (add the planning token and the two ALLOW entries). Run: the guard fails across prose. Commit RED.

GREEN: run the prose planning pass (codebase_examples). `.gitignore`: add the `.aoforge/` line after each legacy
`.planning/` line. CLAUDE.md: the codemod must skip the transition-note region; check it by eye. Run the guard, the
doc-refs gate, `planning-writes.repo.test.cjs`, `builtin-sweep.repo.test.cjs` and the full suite. Commit GREEN
(`docs(72-06): prose names .aoforge/`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/planning-writes.repo.test.cjs</verify>
  <done>Case 8 passes; the guard and the other repo gates are green; full suite at baseline;
`git diff HEAD~1 -- CLAUDE.md` does not touch the transition note.</done>
  <recovery>If the codemod has no notion of the ignore region, add it to `scripts/aoforge-rename.cjs` with a test
(skip lines between the rename-guard markers) before re-running.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node --test plugins/aoforge/hooks/planning-layout.legacy.test.js` passes 7/7.
- `rg -n '\.planning' plugins/aoforge -g '!*legacy*' | head` prints only allowlisted lines.
</verification>

<success_criteria>
- Hooks and prose are on `.aoforge/`; a legacy project is still gated and served correctly for one release.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-06-SUMMARY.md` through
`df-tools summary post`.
</output>
