---
objective: 72-install-and-naming-cleanup
trd: "10"
type: standard
wave: 5
depends_on: ["72-06"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-plugin-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/coexistence.cjs
  - plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs
  - plugins/aoforge/hooks/coexistence-guard.js
  - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
  - plugins/aoforge/hooks/hooks.json
  - CLAUDE.md
  - plugins/aoforge/hooks/gate-edits.js
  - plugins/aoforge/hooks/verify-commits.js
  - plugins/aoforge/hooks/gate-executor-stop.js
  - plugins/aoforge/hooks/agent-types.legacy.test.js
  - plugins/aoforge/aoforge/bin/lib/agent-overhead.cjs
  - plugins/aoforge/aoforge/bin/lib/session-audit.cjs
  - plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
autonomous: true
requirements: [INST-03, INST-05]
must_haves:
  truths:
    - "On SessionStart, when `devflow@aocyber` is installed and enabled (installed_plugins.json + settings `enabledPlugins`) beside AOForge, the new coexistence-guard hook queues one notice per session naming the installed devflow version and the exact disable command (`claude plugin disable devflow@aocyber`); when it is absent or disabled, nothing; stdout stays empty, exit 0, fail open; `AOFORGE_SKIP_COEXISTENCE=1` skips it"
    - "coexistence-guard is registered in hooks.json SessionStart and listed in CLAUDE.md's Hooks section (the hook-inventory test passes)"
    - "gate-edits and gate-bash-writes allow a `devflow:*` agent type exactly as an `aoforge:*` one; verify-commits and gate-executor-stop act on `devflow:executor` exactly as on `aoforge:executor`"
    - "Transcript readers keep counting history: agent-overhead normalises `aoforge:<agent>`, `devflow:<agent>` and `df-<agent>`; session-audit classifies the legacy gate names and denial texts and the legacy skill prefix the same as the new ones"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/coexistence.cjs
      provides: "detectLegacyPlugin({ userHome, fsImpl }) -> { installed, enabled, version, pointer }; coexistenceMessage(result)"
      exports: ["detectLegacyPlugin", "coexistenceMessage"]
    - path: plugins/aoforge/hooks/coexistence-guard.js
      provides: "SessionStart notice when the old plugin is still enabled"
  key_links:
    - from: "hooks/coexistence-guard.js"
      to: "notices.cjs (route-results emits on the next prompt)"
      via: "global notice, kind coexistence"
      pattern: "notices"
    - from: "gate-edits.js / verify-commits.js / gate-executor-stop.js"
      to: "compat.isOwnAgentType"
      via: "agent-type predicate"
      pattern: "isOwnAgentType"
---

# TRD 72-10: AOForge beside the old plugin, and old identities still recognised

<objective>
Two plugins will be installed side by side at least once (the user installs `aoforge@aocyber` while `devflow@aocyber`
is still enabled). AOForge must say so and name the disable command, and must treat the old identities as its own for
one release: `devflow:*` agent types in its gates, and the old agent and gate names in the historical transcripts its
calibration and audit tools read.

Purpose: INST-05 (coexistence guard, AOForge side) and INST-03 (gates accept `devflow:` agent types).
Output: `coexistence.cjs` + `coexistence-guard.js` (registered), agent-type shims in three hooks, legacy names in two
transcript readers.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

**Coexistence design (planner's discretion, locked here).** AOForge side: a SessionStart hook reads
`~/.claude/plugins/installed_plugins.json` (`plugins["devflow@aocyber"]` entries with `version`) and
`~/.claude/settings.json` `enabledPlugins["devflow@aocyber"]`; installed and not explicitly `false` = enabled. Devflow
side: the final pointer release (72-14) ships only a notice hook that no-ops when `~/.claude/aoforge/.plugin-version`
exists, so the pointer never gates anything twice. An un-updated devflow 2.x beside AOForge cannot be changed; the
notice is how the user is told to disable it.

Read narrowly: `hooks/route-results.js` (how notices are emitted), `bin/lib/notices.cjs` (global notice writer),
`hooks/classify-session.js` (a small SessionStart hook to mirror), `hooks/gate-edits.js` 260-270 and ~417
(`isAoforgeAgent`), `hooks/verify-commits.js` and `hooks/gate-executor-stop.js` (`rg -n "executor'" ...`),
`bin/lib/agent-overhead.cjs` 24-41, `bin/lib/session-audit.cjs` 80-110, 275-285, 355-360, `hooks/hook-inventory`
test (`rg -l "hook-inventory" plugins/aoforge`).
</context>

## Test list

**coexistence.legacy.test.cjs** (fake home)
1. No installed_plugins.json -> `{ installed: false, enabled: false }`.
2. devflow 2.15.0 installed, settings has no entry -> enabled true, version '2.15.0', pointer false.
3. Same with `enabledPlugins["devflow@aocyber"] = false` -> enabled false.
4. devflow 3.0.0 (the pointer) installed and enabled -> pointer true.
5. `coexistenceMessage` names the version, says gates may run twice (non-pointer only), and gives
   `claude plugin disable devflow@aocyber`; null when not enabled.

**coexistence-guard.legacy.test.js** (spawn, fake HOME)
6. Enabled legacy -> one global notice queued (read back through notices.cjs), stdout empty, exit 0.
7. Disabled or absent -> no notice. 8. Corrupt installed_plugins.json -> no notice, exit 0.
9. `AOFORGE_SKIP_COEXISTENCE=1` -> nothing read, nothing written.

**agent-types.legacy.test.js** (spawn each hook with the payloads the existing suites use)
10. gate-edits ambient Write with `agent_type: 'devflow:executor'` -> allowed (same as `aoforge:executor`).
11. gate-bash-writes with `agent_type: 'devflow:planner'` -> allowed.
12. verify-commits SubagentStop autonomous path with `devflow:executor` -> same decision shape as `aoforge:executor`.
13. gate-executor-stop with `devflow:executor` and a missing SUMMARY -> one block, as for `aoforge:executor`.
14. A non-ours type (`Explore`) -> unchanged behaviour.

**transcript-names.legacy.test.cjs**
15. `normalizeAgentType('devflow:planner')`, `('aoforge:planner')`, `('df-planner')` -> `planner`; `('Explore')` -> null.
16. session-audit `classify` maps the legacy edit-gate denial text and the new one to the same category id; the
    skill-prefix check counts `devflow:quick` and `aoforge:quick` Skill calls as routed.

<embedded_context>

<codebase_examples>
gate-edits' predicate after 72-04 (to replace):
```js
function isAoforgeAgent(agentType) { /* startsWith('aoforge:') */ }
```
Target: `const { isOwnAgentType } = require('../aoforge/bin/lib/compat.cjs');` and `isAoforgeAgent = isOwnAgentType`
(keep the exported name; gate-bash-writes imports it).

agent-overhead today: `const AGENT_PREFIX_RE = /^(?:aoforge:|df-)/;` (post-72-04). Target: built from
`NAMES.agentNs`, `LEGACY.agentNs` and `LEGACY.installPrefix` with escapeRegExp.
</codebase_examples>

<anti_patterns>
- The coexistence hook never edits settings or uninstalls anything; it only tells the user.
- No SessionStart stdout. No per-prompt nagging: SessionStart only.
- Do not re-baseline calibration or touch `calibration.json`: the shim exists so history keeps counting.
- Legacy names come from LEGACY; literals only in fixtures and `*.legacy.test.*`.
</anti_patterns>

<error_recovery>
- If `enabledPlugins` lives elsewhere in the running Claude Code version, read both `~/.claude/settings.json` and
  `~/.claude/settings.local.json`; absent everywhere = enabled (Claude Code's default for an installed plugin).
- If the hook-inventory test pins hook counts in other docs, update only CLAUDE.md here; 72-17 updates the user docs.
</error_recovery>

</embedded_context>

<gotchas>
- `hooks.json` SessionStart order: add the guard as the last SessionStart entry (after classify-session).
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- CLAUDE.md's transition note region is not to be edited.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: fake homes with plugin installs</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-plugin-fixtures.cjs</files>
  <action>
`pluginHome({ devflow = null | { version, enabled } , aoforge = { version: '3.0.0' }, corrupt = false })` -> `{ home,
cleanup }` writing `<home>/.claude/plugins/installed_plugins.json` in the real v2 shape (`{ version: 2, plugins: {
"devflow@aocyber": [{ scope: 'user', installPath, version, installedAt, lastUpdated }] } }`), optional
`<home>/.claude/settings.json` `enabledPlugins`, and `<home>/.claude/aoforge/.plugin-version`. Also export the executor
and planner hook payload builders the agent-type tests need (`subagentStopPayload`, `preToolUsePayload`), typed out from
the existing hook tests' shapes. Check with `node -e`. Commit (`test(72-10): plugin install fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-plugin-fixtures.cjs');const h=f.pluginHome({devflow:{version:'2.15.0',enabled:true}});console.log(require('fs').readFileSync(h.home+'/.claude/plugins/installed_plugins.json','utf8').length>0);h.cleanup()"</verify>
  <done>Fixture homes build in every shape the tests need.</done>
  <recovery>Copy the installed_plugins.json shape from a real file's keys only (never its paths).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Coexistence detection and the SessionStart guard</name>
  <files>plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/coexistence.cjs, plugins/aoforge/hooks/coexistence-guard.legacy.test.js, plugins/aoforge/hooks/coexistence-guard.js, plugins/aoforge/hooks/hooks.json, CLAUDE.md</files>
  <action>
RED: tests 1-9. Run: fail. Commit RED.

GREEN: `coexistence.cjs` (pure on an injected `userHome`/`fsImpl`; plugin id from `LEGACY.plugin`);
`coexistence-guard.js` (alias env first; `AOFORGE_SKIP_COEXISTENCE`; queue a global notice of kind `coexistence`
through notices.cjs; try/catch -> exit 0); register in hooks.json; add a CLAUDE.md Hooks bullet:
"`coexistence-guard.js` — SessionStart; when the old devflow plugin is still enabled beside AOForge, queues one notice
naming `claude plugin disable devflow@aocyber` (objective 72). Escape: `AOFORGE_SKIP_COEXISTENCE=1`". Run the
hook-inventory and route-results suites. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs plugins/aoforge/hooks/coexistence-guard.legacy.test.js && node --test $(rg -l "hook-inventory|hooksSection" plugins/aoforge --glob '*.test.cjs')</verify>
  <done>Tests 1-9 pass; hook-inventory passes with the new hook.</done>
  <recovery>If notices.cjs has no global-notice kind for this, reuse the kind global-upgrade uses and set a distinct
`id` so dedupe works.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Old agent types in the gates, old names in the transcript readers</name>
  <files>plugins/aoforge/hooks/agent-types.legacy.test.js, plugins/aoforge/hooks/gate-edits.js, plugins/aoforge/hooks/verify-commits.js, plugins/aoforge/hooks/gate-executor-stop.js, plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/agent-overhead.cjs, plugins/aoforge/aoforge/bin/lib/session-audit.cjs</files>
  <action>
RED: tests 10-16. Run: 10-13, 15, 16 fail; 14 passes. Commit RED.

GREEN: gate-edits uses `compat.isOwnAgentType`; verify-commits and gate-executor-stop compare the executor role with
`compat.isOwnExecutor(t)` = `isOwnAgentType(t) && t.endsWith(':executor')`, added to compat.cjs with a case in
compat.legacy.test.cjs (this TRD is the only W5 TRD that edits compat.cjs); agent-overhead's
prefix regex from NAMES/LEGACY/installPrefix; session-audit's category table gains the legacy gate names and denial
texts mapped to the same ids, and its skill-prefix test accepts both namespaces. Run the existing suites of every file
touched and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/hooks/agent-types.legacy.test.js plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs plugins/aoforge/hooks/gate-edits.test.js plugins/aoforge/hooks/verify-commits.test.js plugins/aoforge/hooks/gate-executor-stop.test.js plugins/aoforge/aoforge/bin/lib/agent-overhead.test.cjs plugins/aoforge/aoforge/bin/lib/session-audit.test.cjs</verify>
  <done>Tests 10-16 pass; existing suites pass; full suite at baseline.</done>
  <recovery>If session-audit's category ids themselves changed name in 72-04 (e.g. the edit-gate id), keep the new id
and map both texts to it; reports keyed by the old id are history.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node -e "console.log(require('./plugins/aoforge/hooks/hooks.json').hooks.SessionStart.flatMap(e=>e.hooks.map(h=>h.command)).join('\n'))"` lists coexistence-guard.js.
- `rg -n "isOwnAgentType" plugins/aoforge/hooks` shows gate-edits and the executor checks.
</verification>

<success_criteria>
- A user with both plugins enabled is told how to disable the old one; old agent types and old transcript names keep
  working everywhere AOForge reads them.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-10-SUMMARY.md` through
`df-tools summary post`.
</output>
