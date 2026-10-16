---
objective: 78-remove-the-rename-shims
trd: "11"
type: standard
wave: 4
depends_on: ["78-03", "78-04", "78-05", "78-06", "78-07", "78-08", "78-10"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs
  - plugins/aoforge/aoforge/bin/lib/config.cjs
  - plugins/aoforge/aoforge/bin/lib/init.cjs
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/hooks/agent-types.legacy.test.js
  - plugins/aoforge/hooks/planning-layout.legacy.test.js
  - plugins/aoforge/hooks/home-project-detection.test.js
  - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
  - plugins/aoforge/aoforge/bin/lib/merge-driver-cli.test.cjs
autonomous: true
requirements: [SC-1, SC-4]
must_haves:
  truths:
    - "compat.planningDirName(root) is always `.aoforge`; planningRoot/planningRel follow; PLANNING_DIR_NAMES is `['.aoforge']`; isPlanningDirName accepts only `.aoforge`; planningDirLabel() is `.aoforge/`"
    - "compat.findProjectRoot finds only a directory holding `.aoforge/` (the $HOME stop rules unchanged): a `.planning/`-only project is not a project"
    - "compat exports no isLegacyPlanning, bothPlanningDirs, legacyRuntimeHome or resolveUserFile; userDotFile(home, name) is `<home>/.claude/aoforge/<name>` with no fallback to `~/.aoforge/` or the pre-rename dot directory"
    - "isOwnAgentType accepts only `aoforge:<name>`; isOwnExecutor only `aoforge:executor`: gate-edits, verify-commits and gate-executor-stop no longer trust the pre-rename agent namespace"
    - "compat.cjs still exports aliasLegacyEnv (78-10 removes its callers in parallel; 78-12 deletes it); apart from that function it imports nothing from LEGACY"
    - "gh-rebrand takes isLegacyPlanning from planning-layout.cjs; watcher-allowlist resolves its file with userDotFile(home, name) only"
    - "In a `.planning/`-only project: validate health is broken with the W066 message, doctor notes it, the CLI refuses, and no command creates `.aoforge/` (78-01/78-07 behaviour still holds now that compat no longer finds the legacy root)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/compat.cjs
      provides: "AOForge-only planning, project-root, $HOME, agent and user-file helpers"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
      to: planning-layout.isLegacyPlanning
      via: "the converter still knows a pre-rename planning directory when it rewrites local files"
      pattern: "planning-layout"
---

# TRD 78-11: compat.cjs keeps no pre-rename reader

<objective>
Make compat.cjs AOForge-only: the planning directory and project root are `.aoforge/` alone, the agent namespace is
`aoforge:` alone, user files come from the runtime home alone, and the legacy-only exports are deleted. Keep the
module name and function signatures so the ~80 callers (and the reconcile with `main`) need no edits.

Purpose: SC-1 (every listed compat reader is gone; every caller works on AOForge names alone) and the last piece of
SC-4 (with compat no longer finding `.planning/`, the 78-01/78-07 messages are what an old-layout project sees).
Output: single-name compat.cjs, re-pointed gh-rebrand and watcher-allowlist, updated tests across suites.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@plugins/aoforge/aoforge/bin/lib/compat.cjs
@plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-11): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use mkdtemp projects and a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`.
- Runs in parallel with 78-10 (hooks, aof-tools.cjs, aoforge-watch.cjs, compat-entry.repo.test.cjs, gate-edits.test.js):
  do NOT edit those files. Leave `aliasLegacyEnv` and its tests in place (78-12 deletes them after both merge).

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Keep the module name `compat.cjs` and every surviving signature.** Reason: ~80 modules and every hook import it;
  renaming would multiply conflicts with `main` (lazy CLI, one-process hooks) for no behaviour change. The header says
  why the name stays.
- **`PLANNING_DIR_NAMES`/`isPlanningDirName` become single-name.** Reason: a list that still holds `.planning` would keep
  scans, attributes and ignore lines treating the old directory as a planning tree, i.e. a reader. Any scan that must
  still SKIP a stray `.planning/` (none known) takes the name from LEGACY with a comment.
- **userDotFile ignores `~/.aoforge/` and the pre-rename dot directory.** Reason: user decision (remove the dot-dir
  fallbacks); doctor check 17 (kept with its fix, 78-06) moves 3.0.0's files and 78-06's notice points at it.
</context>

<embedded_context>

<codebase_examples>
compat.cjs today (the parts that change):
```js
const { planningDir: NEW_PLAN_DIR } = NAMES;
const { planningDir: OLD_PLAN_DIR } = LEGACY;
function planningDirName(root, fsImpl = fs) {
  if (hasNewPlanDir(root, fsImpl)) return NEW_PLAN_DIR;
  if (hasOldPlanDir(root, fsImpl)) return OLD_PLAN_DIR;
  return NEW_PLAN_DIR;
}
const PLANNING_DIR_NAMES = Object.freeze([NEW_PLAN_DIR, OLD_PLAN_DIR]);
function findProjectRoot(start, { fsImpl = fs, maxUp = 64, home = userHomeDir() } = {}) {
  ... if (hasNewPlanDir(dir, fsImpl) || hasOldPlanDir(dir, fsImpl)) { return atHome.isHome(dir) ? null : dir; } ...
}
function isOwnAgentType(t) { for (const ns of [NAMES.agentNs, LEGACY.agentNs]) { ... } }
function resolveUserFile(home, name, { fsImpl = fs, legacyName = name, currentDir = runtimeHome(home) } = {}) { current -> interim -> legacy }
```
Callers of userDotFile: config.cjs (defaults.json, brave_api_key), init.cjs (brave_api_key), watcher-allowlist.cjs
(`userDotFile(home, \`${NAMES.watch}-allow.json\`, fs, \`${LEGACY.watch}-allow.json\`)`).
gh-rebrand.cjs line ~60: `const { planningRel, isLegacyPlanning, findProjectRoot } = require('./compat.cjs');`
</codebase_examples>

<anti_patterns>
- Do not change `userHomeDir`, `isUserHome`, `homeMatcher` or the $HOME stop rule of findProjectRoot (TRD 73-09).
- Do not add a new fallback anywhere (e.g. "if `.aoforge` is missing, try `.planning` and warn"): the warning is
  78-01/78-07's job and already exists.
- Do not delete `aliasLegacyEnv` or its tests here (parallel 78-10 still has callers in its tree).
- Do not edit hooks (78-10 owns every hook file in this wave); hook behaviour changes through compat only.
- "legacy" in `20-legacy-runtime-state` and in 0010's `found.legacy` is unrelated (see 78-01's note).
</anti_patterns>

<error_recovery>
- Expect expectation churn in suites that asserted both directory names: 0008 (pathspecs for both), 0010 (block lines
  for both), merge-driver-cli (attribute lines for both), adopt/repo-state (OWNED_PATHS), stack-detect (skip list),
  planning-audit/benchmark/token-usage (path regexes). Update each assertion to the single name in the same commit and
  list every file in the SUMMARY. If a test's purpose was the legacy directory, move it to a `*.legacy.test.*` that
  asserts "ignored", or delete it when 78-01/78-07 already cover the case.
- If the full suite shows a failure you cannot attribute to this TRD, check whether it is the known watcher-shell W-3
  fish hang (exclude it) or a node-pty skip; otherwise fix it here — this is the TRD that removes the fallback.
</error_recovery>

</embedded_context>

<gotchas>
- planning-layout.legacy.test.cjs (lib) and validate's legacy-only path were written in 78-01 to work before and after
  this change; run them as a regression check, do not edit them.
- hooks/planning-layout.legacy.test.js (the 72-06 hook contract) asserted that hooks resolve a legacy-only project;
  rewrite it: every hook treats it as "not a project" (gate-edits: no ambient gate; route-intent: no reminder;
  verify-completion: no check; statusline: no planning segment) and none creates `.aoforge/`.
- `legacy-fixtures.cjs` (projectTree, legacyEnv, fakeHome) serves compat.legacy.test; keep its builders, trim unused.
- Full suite command for the end of this TRD (exclude the known fish hang):
  `node --test 'plugins/aoforge/**/!(watcher-shell).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`;
  if the extglob is not honoured, use
  `git ls-files -co --exclude-standard -- 'plugins/aoforge/*.test.cjs' 'plugins/aoforge/*.test.js' 'scripts/*.test.cjs' | grep -v watcher-shell.test.cjs | xargs node --test`.
  If micro.test.cjs hangs on a signing prompt, exclude it too and say so.
</gotchas>

## Test list

Outermost first; fixtures from `legacy-fixtures.cjs` and `legacy-layout-fixtures.cjs` (hand-built).
1. Hooks over a `.planning/`-only project (spawned, scratch HOME): gate-edits allows a Write (no project = no ambient
   gate), route-intent injects nothing, verify-completion and statusline treat it as no project; `.aoforge/` is never
   created.
2. Hooks: gate-edits with `agent_type: '<LEGACY.agentNs>executor'` in an ambient AOForge project -> denied (not
   trusted); `aoforge:executor` -> allowed. verify-commits and gate-executor-stop ignore the pre-rename executor.
3. CLI in a `.planning/`-only project: `validate health --raw` broken with W066 (78-01), `state load` refused (78-07),
   `doctor` note (78-01); no `.aoforge/` afterwards.
4. compat unit: planningDirName/planningRoot/planningRel on a legacy-only root give `.aoforge`; findProjectRoot from
   inside a legacy-only project (below a fake HOME) -> null; from inside an `.aoforge/` project -> that root;
   PLANNING_DIR_NAMES deep-equals `['.aoforge']`; isPlanningDirName(LEGACY.planningDir) false; planningDirLabel() ===
   '.aoforge/'; isOwnAgentType/isOwnExecutor per truths; the deleted exports are undefined.
5. User files: with `defaults.json` and `brave_api_key` only in `~/.aoforge/` or only in the pre-rename dot directory,
   `config-ensure-section` and `init new-project` do not see them; with them in `~/.claude/aoforge/`, they do. The
   watch allowlist is read only from `~/.claude/aoforge/aoforge-watch-allow.json`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — the shims are gone (unit, hooks, user files)</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs, plugins/aoforge/hooks/agent-types.legacy.test.js, plugins/aoforge/hooks/planning-layout.legacy.test.js, plugins/aoforge/hooks/home-project-detection.test.js, plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-fixtures.cjs</files>
  <action>
Fixtures exist; trim legacy-fixtures.cjs only if a builder becomes unused. Rewrite the listed tests to cases 1-5
(file-identities: tests 4-7 only; the other blocks were rewritten by 78-04/78-05). Keep the aliasLegacyEnv cases in
compat.legacy.test.cjs untouched (78-12). Commit failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/hooks/agent-types.legacy.test.js plugins/aoforge/hooks/planning-layout.legacy.test.js plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs` fails on the rewritten cases for the right reason.</verify>
  <done>RED commit.</done>
  <recovery>If home-project-detection.test.js uses LEGACY.envPrefix only to strip the environment, leave those lines; change only assertions about legacy layouts.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — planning directory, project root and agent namespace</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs, plugins/aoforge/aoforge/bin/lib/merge-driver-cli.test.cjs</files>
  <action>
- compat.cjs: remove OLD_PLAN_DIR, hasOldPlanDir, isLegacyPlanning, bothPlanningDirs; planningDirName returns
  NEW_PLAN_DIR (keep the `(root, fsImpl)` signature); PLANNING_DIR_NAMES single; isPlanningDirName single;
  planningDirLabel `${NEW_PLAN_DIR}/`; findProjectRoot checks hasNewPlanDir only; isOwnAgentType/isOwnExecutor
  AOForge-only. First `rg -n "isLegacyPlanning|bothPlanningDirs" plugins/aoforge --glob '!*.test.*'` and re-point any
  remaining caller (expected: gh-rebrand only) to planning-layout.cjs.
- Rewrite the header (see Decisions; list what the module provides now; say that until 3.1.0 it held the one-release
  shims and that `aliasLegacyEnv` is the last one, removed by 78-12).
- Run the full suite (command in gotchas) and update every expectation that asserted both planning directories (see
  error_recovery). Add the extra test files you touch to the SUMMARY.
  </action>
  <verify>Cases 1-4 green; the full suite (watcher-shell excluded) passes except failures you list as pre-existing with evidence.</verify>
  <done>No caller depends on the legacy directory; hooks and CLI see only `.aoforge/`.</done>
  <recovery>If a production module (not a test) genuinely needs to skip a stray `.planning/` directory (e.g. a scan that would otherwise index main's planning tree), give it a local constant from LEGACY with a comment; do not keep it in compat.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — user files from the runtime home only</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.cjs, plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs, plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs, plugins/aoforge/aoforge/bin/lib/config.cjs, plugins/aoforge/aoforge/bin/lib/init.cjs</files>
  <action>
- compat.cjs: delete resolveUserFile and legacyRuntimeHome (rg first: 78-05 and 78-06 removed their callers);
  userDotFile(home, name) -> `path.join(runtimeHome(home), name)`; keep runtimeHome and watchStateDir. After this the
  only LEGACY use left in compat is aliasLegacyEnv.
- watcher-allowlist.cjs: `userDotFile(home, \`${NAMES.watch}-allow.json\`)`; drop LEGACY import; update tests that
  seeded the pre-rename allowlist (now: ignored).
- config.cjs / init.cjs: comments only ("for one release (compat.userDotFile, TRD 73-11)" -> runtime home only).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs plugins/aoforge/aoforge/bin/lib/config.test.cjs plugins/aoforge/aoforge/bin/lib/init.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs` passes (skip absent); `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/compat.cjs` shows only the aliasLegacyEnv lines.</verify>
  <done>Case 5 green; compat holds one pre-rename reference (aliasLegacyEnv), removed by 78-12.</done>
  <recovery>If doctor check 17 imported compat.resolveUserFile/legacyRuntimeHome, re-point it to its own path builders (it only needs runtimeHome/watchStateDir).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (full suite at the end of Task 2 and Task 3; watcher-shell.test.cjs excluded — known fish hang)</test>
</validation_gates>

<verification>
- Cases 1-5 green; RED before GREEN.
- `node -e "const c=require('./plugins/aoforge/aoforge/bin/lib/compat.cjs'); console.log(['isLegacyPlanning','bothPlanningDirs','legacyRuntimeHome','resolveUserFile'].filter(k=>k in c).length, c.PLANNING_DIR_NAMES.length)"` prints `0 1`.
- Full suite passes with watcher-shell excluded; any other exclusion is named with its reason.
</verification>

<success_criteria>
- compat.cjs reads AOForge names only (aliasLegacyEnv aside, for 78-12); every caller works unchanged. Decisions recorded.
</success_criteria>

<output>
After completion, write `78-11-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-11 --from <draft>`
(after `tokens stamp 78-11 --draft <draft>`). Include the Decisions table, every test file whose expectations changed,
and the full-suite counts.
</output>
