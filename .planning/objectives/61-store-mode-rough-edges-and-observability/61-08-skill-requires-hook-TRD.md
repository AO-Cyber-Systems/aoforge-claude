---
objective: 61-store-mode-rough-edges-and-observability
trd: "08"
type: standard
wave: 2
depends_on: ["61-02"]
files_modified:
  - plugins/devflow/hooks/gate-skill-requires.js
  - plugins/devflow/hooks/gate-skill-requires.test.js
  - plugins/devflow/hooks/hooks.json
  - plugins/devflow/hooks/planning-writes.audit.test.js
  - CLAUDE.md
autonomous: true
requirements: [STOR-04]
must_haves:
  truths:
    - "Typing /devflow:gh-sync with no `gh` on PATH is blocked at UserPromptExpansion with `decision: block` and a reason that names gh, its install hint, /devflow:doctor and the DEVFLOW_SKIP_SKILL_REQUIRES=1 escape"
    - "Claude invoking the Skill tool for devflow:gh-sync with no `gh` on PATH gets `permissionDecision: deny` with the same reason"
    - "With the tool on PATH, for skills without `requires:`, for non-DevFlow commands and skills, and with DEVFLOW_SKIP_SKILL_REQUIRES=1, the hook prints nothing"
    - "The hook fails open: malformed input, a missing library or any exception produces no output and exit 0"
    - "The hook is registered on UserPromptExpansion (no matcher) and on PreToolUse with matcher Skill, inventoried in CLAUDE.md and covered by the planning-writes audit"
  artifacts:
    - path: plugins/devflow/hooks/gate-skill-requires.js
      provides: "UserPromptExpansion + PreToolUse(Skill) hook; exports run(input, {env, skillsDir}) -> output object | null"
    - path: plugins/devflow/hooks/hooks.json
      provides: "UserPromptExpansion group and PreToolUse Skill group naming gate-skill-requires.js"
  key_links:
    - "gate-skill-requires.js -> ../devflow/bin/lib/skill-requires.cjs (skillNameFromInvocation, readSkillRequires, missingTools, refusalReason, SKIP_ENV) from 61-02"
    - "skillsDir defaults to path.join(__dirname, '..', 'skills'): the same plugin version's SKILL.md files"
    - "hook-inventory.test.cjs pins the CLAUDE.md bullet; planning-writes.audit.test.js pins the RUNS entries"
---

# TRD 61-08: The `requires:` gate hook (STOR-04, part 2)

<objective>
Enforce 61-02's `requires:` at the two points where a DevFlow skill starts. Claude Code's hooks reference states that a
PreToolUse hook on the `Skill` tool "fires only when Claude calls the tool, but typing `/skillname` directly bypasses
`PreToolUse`. `UserPromptExpansion` fires on that direct path." So one hook script is registered on both:

```
env DEVFLOW_SKIP_SKILL_REQUIRES=1                         -> exit (no output)
stdin JSON (malformed -> exit)
name = skillNameFromInvocation(input)                     # null for anything that is not a devflow skill start
null -> exit
req = readSkillRequires(skillsDir, name); !found | error | no tools -> exit
missing = missingTools(req.tools, process.env); none -> exit
reason = refusalReason(name, missing)
UserPromptExpansion -> { decision: 'block', reason }                                   # shown to the user; the turn ends
PreToolUse(Skill)   -> { hookSpecificOutput: { hookEventName: 'PreToolUse',
                         permissionDecision: 'deny', permissionDecisionReason: reason } }   # Claude sees it and relays it
```

UserPromptExpansion input (from the hooks reference):
`{ hook_event_name: 'UserPromptExpansion', expansion_type: 'slash_command', command_name, command_args, command_source, prompt }`.
Its matcher is the command name. **No matcher is registered:** whether a plugin skill's `command_name` carries the
`devflow:` prefix is not documented, and 61-02's `skillNameFromInvocation` already accepts only `/devflow:<name>` in
`prompt` or `devflow:<name>` in `command_name`. The cost is one short node process per slash command.

The gate is not scoped to DevFlow projects. A missing `gh` breaks `/devflow:gh-sync` everywhere.

Purpose: STOR-04 success criterion 4 in the harness. Output: the hook, its tests, its two registrations, the inventory
and audit entries.
</objective>

<file_tree>
plugins/devflow/hooks/
├── gate-skill-requires.js           ← CREATE
├── gate-skill-requires.test.js      ← CREATE
├── hooks.json                       ← MODIFY (new UserPromptExpansion event; PreToolUse Skill group)
└── planning-writes.audit.test.js    ← MODIFY (RUNS entries)
CLAUDE.md                            ← MODIFY (### Hooks, Enforcement bullet)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: the hook tests go RED (`test(61-08): ...`) before the hook exists (`feat(61-08): ...`).
- Hand-built fixtures only. Payloads are literal objects in the test file. PATH directories are temp dirs, with or
  without a literal executable `gh` script (`#!/bin/sh\nexit 0\n`, 0o755). Fixture skills for in-process tests are
  temp `skills/<name>/SKILL.md` files. No generated data, no property-based libraries, no `.feature` files.
- Never depend on the machine's PATH. Every spawn sets `env.PATH` explicitly; the hook is spawned with
  `process.execPath` (absolute), so PATH does not need node. Delete `DEVFLOW_SKIP_SKILL_REQUIRES` from the spawn env
  unless a test sets it.
- The session running this TRD uses the INSTALLED plugin, which has no such hook, so nothing here gates your own
  skills.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

## Test list

`gate-skill-requires.test.js`. Subprocess tests spawn `process.execPath gate-skill-requires.js` with the payload on
stdin; they use the REAL `plugins/devflow/skills/` (gh-sync declares `requires: [gh]` after 61-02).

1. UserPromptExpansion `{ expansion_type: 'slash_command', command_name: 'devflow:gh-sync', command_args: 'status',
   command_source: 'plugin', prompt: '/devflow:gh-sync status', cwd }` with PATH = an empty temp dir → stdout parses to
   `{ decision: 'block', reason }`. The reason contains `/devflow:gh-sync`, `gh`, `https://cli.github.com`,
   `/devflow:doctor` and `DEVFLOW_SKIP_SKILL_REQUIRES=1`. Exit 0.
2. The same payload with PATH = a temp dir holding an executable `gh` → stdout `''`.
3. PreToolUse `{ tool_name: 'Skill', tool_input: { skill: 'devflow:gh-sync' } }` with an empty PATH →
   `hookSpecificOutput.permissionDecision === 'deny'`, `hookEventName === 'PreToolUse'`, and the reason equals test 1's.
4. Test 3 with `gh` on PATH → `''`.
5. `DEVFLOW_SKIP_SKILL_REQUIRES=1` with an empty PATH → `''` for the payloads of tests 1 and 3.
6. A skill without `requires:` (`/devflow:status`, and Skill `devflow:status`) with an empty PATH → `''`.
7. Not ours → `''`:
   - `command_name: 'review'`, `prompt: '/review'`;
   - `command_name: 'gh-sync'`, `prompt: '/gh-sync'`;
   - Skill `other:gh-sync`;
   - `expansion_type: 'mcp_prompt'`.
8. Other events and tools → `''`: `tool_name: 'Bash'`, `hook_event_name: 'UserPromptSubmit'`, malformed stdin
   (`not json`), empty stdin. Exit 0 every time.
9. An unknown DevFlow skill (`/devflow:nope`) → `''`.
10. Fail open: copy `gate-skill-requires.js` alone into a temp `hooks/` dir with no `devflow/` sibling and run test 1's
    payload → `''`, exit 0.
11. In-process `run(input, { env: { PATH: dirWithGhOnly }, skillsDir: tmpSkills })` with a fixture skill
    `requires: [gh, docker]` → a reason naming `docker` and not `gh`. A fixture skill with an invalid `requires:` value →
    `null` (fail open).
12. Only `command_name: 'devflow:gh-sync'` (no `prompt` field) with an empty PATH → block.

Registration (Task 2):

13. hooks.json: the `UserPromptExpansion` event has one group with no `matcher` whose only hook is
    `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-skill-requires.js`. PreToolUse has a group `{ matcher: 'Skill' }` with the
    same command. Every other registration is unchanged.
14. `hook-inventory.test.cjs` and `planning-writes.audit.test.js` pass with the new bullet and RUNS entries.

<embedded_context>

<codebase_examples>
`hooks/gate-bash-writes.js` (60-04) is the template for structure. Libraries are loaded lazily inside try/catch from
`path.join(__dirname, '..', 'devflow', 'bin', 'lib', '<name>.cjs')`, so a missing lib makes `run` return null. The
module exports `run(input, opts)`. `main()` reads stdin, calls `run` in try/catch, writes
`JSON.stringify(out)` only when non-null, and runs only under `require.main === module`.

PreToolUse deny shape (same as gate-edits / gate-bash-writes):

```js
{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
```

UserPromptExpansion block shape (hooks reference, "UserPromptExpansion decision control"):

```json
{ "decision": "block", "reason": "This slash command is not available" }
```

hooks.json today has no `UserPromptExpansion` key. PreToolUse groups are `Bash`, `Edit|Write|MultiEdit` and `*`. Add
the Skill group before the `*` group. Add the new event key after `UserPromptSubmit`, and keep the file's two-space
JSON style.

planning-writes.audit.test.js has the helpers `envelope(event, ctx, extra)`, `prompt(text)` and
`preTool(tool, input, extra)` (lines ~300-330) and a `RUNS` map keyed by hook file (line ~355). gate-bash-writes'
entries (line ~439) are the latest example. PreToolUse and prompt entries carry no `expect`.

CLAUDE.md `### Hooks` → `**Enforcement (active gates):**` bullets read
`` - `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); ... ``.
</codebase_examples>

<anti_patterns>
- Do not scope the gate to `.planning/` projects. The required tool is missing regardless of the cwd.
- Do not register a `matcher` on UserPromptExpansion that guesses the command_name format. Filter in code.
- Do not spawn anything from the hook (no `which`, no `gh --version`). 61-02's `findOnPath` is stat-only.
- Do not write any file. The hook is read-only; the audit's behavioural run must show no changed dotfile.
- Never exit non-zero, and never write stderr on the allow path.
</anti_patterns>

<error_recovery>
- If `claude plugin validate plugins/devflow` (Bash timeout 90000) rejects the `UserPromptExpansion` key or the `Skill`
  matcher, record the exact message. Fall back to registering only the PreToolUse(Skill) group, keep the hook's
  UserPromptExpansion branch, and name the missing registration as a gap in the SUMMARY. Baseline (2026-10-06): the
  current hooks.json validates with only unquoted-`${CLAUDE_PLUGIN_ROOT}` warnings, and 61-02's SUMMARY records its
  last line.
- If the audit's static scan (test 11 there) flags a literal in the new hook, remove the literal. Do not add an
  allowlist row.
- To back the gate out without reverting code: remove its two lines from hooks.json. Users can set
  `DEVFLOW_SKIP_SKILL_REQUIRES=1`.
</error_recovery>

</embedded_context>

<gotchas>
- `run(input, { env = process.env, skillsDir = path.join(__dirname, '..', 'skills') } = {})`. The env check is
  `env[SKIP_ENV] === '1'`, using the lib's constant. If the lib fails to load, check the literal
  `'DEVFLOW_SKIP_SKILL_REQUIRES'` first, then return null.
- Branch on `input.hook_event_name`. For UserPromptExpansion, also require `input.expansion_type === 'slash_command'`
  when the field is present.
- Header comment: the decision order above; why both events (quote the hooks reference sentence); why there is no
  UserPromptExpansion matcher; fail-open; the escape; STOR-04 and TRD 61-02/61-08.
- CLAUDE.md bullet, in the Enforcement group after `gate-bash-writes.js`:
  `` - `gate-skill-requires.js` — UserPromptExpansion + PreToolUse(Skill); refuses a `/devflow:<skill>` whose SKILL.md `requires:` names a tool that is not on PATH (block on a typed command, deny on a Skill call), naming the install hint and `/devflow:doctor` (check `skill-requires`). Not project-scoped; fails open. Escape: `DEVFLOW_SKIP_SKILL_REQUIRES=1` ``
  61-09 finalises the wording. This TRD needs only enough for hook-inventory to pass.
- RUNS entries:
  ```js
  'gate-skill-requires.js': [
    { label: 'typed /devflow:gh-sync', payload: (ctx) => envelope('UserPromptExpansion', ctx, { expansion_type: 'slash_command', command_name: 'devflow:gh-sync', command_args: 'status', command_source: 'plugin', prompt: '/devflow:gh-sync status' }) },
    { label: 'Skill tool devflow:gh-sync', payload: (ctx) => preTool('Skill', { skill: 'devflow:gh-sync' })(ctx) },
  ],
  ```
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: gate-skill-requires.js with subprocess and in-process tests (tests 1-12)</name>
  <files>plugins/devflow/hooks/gate-skill-requires.js, plugins/devflow/hooks/gate-skill-requires.test.js</files>
  <action>
RED: write tests 1-12. Create the temp PATH dirs and fixture skills in `before`, and remove them in `after`. Run and
watch them fail (no hook file). Commit `test(61-08): skill requires gate on typed commands and Skill calls`.

GREEN: create the hook per the objective's decision order and the gotchas. Export `{ run }`; `main()` only under
`require.main === module`. Commit `feat(61-08): refuse a DevFlow skill whose required tool is not installed`.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-skill-requires.test.js plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` passes.</verify>
  <done>Tests 1-12 went RED then GREEN in separate commits.</done>
</task>

<task type="auto">
  <name>Task 2: Register on UserPromptExpansion and PreToolUse(Skill), inventory and audit (tests 13-14)</name>
  <files>plugins/devflow/hooks/hooks.json, CLAUDE.md, plugins/devflow/hooks/planning-writes.audit.test.js</files>
  <action>
1. hooks.json: add `"UserPromptExpansion": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-skill-requires.js" }] }]`
   and a PreToolUse group `{ "matcher": "Skill", "hooks": [ <same command> ] }`. Change nothing else.
2. CLAUDE.md: add the bullet from the gotchas.
3. planning-writes.audit.test.js: add the RUNS entries from the gotchas.
4. Run `claude plugin validate plugins/devflow` (Bash timeout 90000) and record the last line plus any line that
   mentions UserPromptExpansion or Skill.
5. Run the inventory and audit tests, and any other test that reads hooks.json (`rg -l "hooks\.json" plugins --glob '*.test.*'`).
   Fix only what the new registration legitimately changes.

Commit `feat(61-08): register gate-skill-requires on UserPromptExpansion and PreToolUse(Skill)`.
  </action>
  <verify>`node -e "const h=require('./plugins/devflow/hooks/hooks.json').hooks; console.log(JSON.stringify(h.UserPromptExpansion), JSON.stringify(h.PreToolUse.find(g=>g.matcher==='Skill')))"` prints both groups. `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs` passes. `claude plugin validate plugins/devflow` ends with `Validation passed` (warnings allowed).</verify>
  <done>The gate is registered on both entry points, documented in the inventory and covered by the audit.</done>
  <recovery>If the audit's behavioural run shows a changed file for the new hook, that is a real bug (the hook must write nothing). Fix the hook, not the allowlist.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/hooks/gate-skill-requires.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs`.
</validation_gates>

<verification>
- The hook blocks or denies a gh-sync start without gh, and is silent with gh, with the escape, and for anything else.
- `claude plugin validate plugins/devflow` passes. The inventory and audit suites are green.
</verification>

<success_criteria>
- [ ] A skill with `requires:` is refused without the tool, on both the typed and the Skill-tool path
- [ ] The refusal names the install hint and `/devflow:doctor`
- [ ] Fails open, with its own escape
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-08-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
