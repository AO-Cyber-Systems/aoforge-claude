---
objective: 61-store-mode-rough-edges-and-observability
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-requires.cjs
  - plugins/devflow/devflow/bin/lib/skill-requires.test.cjs
  - plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs
  - plugins/devflow/skills/gh-sync/SKILL.md
autonomous: true
requirements: [STOR-04]
must_haves:
  truths:
    - "A SKILL.md can declare `requires:` (a tool name or a list of them) in its frontmatter, and skill-requires.cjs reads it; an invalid value is an error the callers fail open on"
    - "skill-requires.cjs finds a tool on PATH without spawning anything (executable regular file in a PATH directory), so the hook in 61-08 stays cheap"
    - "The refusal text names the skill, every missing tool, a concrete install hint per tool, `/devflow:doctor` (check skill-requires) and the DEVFLOW_SKIP_SKILL_REQUIRES=1 escape"
    - "`df-tools doctor` (global check 14, skill-requires) warns when a tool any installed DevFlow skill requires is not on PATH, naming the tool, the skills that need it and how to install it"
    - "/devflow:gh-sync declares `requires: [gh]`, and a repo test pins that every declared tool has an install hint"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/skill-requires.cjs
      provides: "parseRequires, readSkillRequires, listSkillRequires, skillNameFromInvocation, findOnPath, missingTools, refusalReason, INSTALL_HINTS, SKIP_ENV"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.cjs
      provides: "global doctor check `skill-requires`"
  key_links:
    - "skill-requires.cjs -> frontmatter.cjs extractFrontmatter (the parser every skill contract test uses)"
    - "14-skill-requires.cjs -> helpers.installedPlugin installPath/skills, else DEVFLOW_DOCTOR_PLUGIN_ROOT (the 12-hooks-registry rule)"
    - "61-08's hooks/gate-skill-requires.js -> skillNameFromInvocation, readSkillRequires, missingTools, refusalReason"
---

# TRD 61-02: `requires:` in skill frontmatter, the tool lookup and the doctor check (STOR-04, part 1)

<objective>
A skill cannot refuse itself: by the time its body runs, the model is already executing it. So STOR-04 needs an
enforcement point outside the skill. **Decision:** a hook, `hooks/gate-skill-requires.js` (61-08), on two events:

- `UserPromptExpansion`, which fires when the user types `/devflow:<skill>` and can block the expansion; its `reason`
  is shown to the user;
- `PreToolUse` with matcher `Skill`, which fires when Claude invokes a skill through the Skill tool (typing the slash
  command bypasses PreToolUse, per the Claude Code hooks reference).

Both fail open. The alternative, a `df-tools` preflight that each SKILL.md body calls, was rejected: it depends on the
model obeying the body, costs a Bash call per invocation, and would put edits in every skill that Objective 62 is
about to sweep.

This TRD builds everything the hook needs, plus the doctor check that the refusal points at:

```
SKILL.md frontmatter        requires: [gh]              (or a block list, or a single string)
skill-requires.cjs          parse -> which skill was invoked -> which tools are missing -> refusal text
doctor check 14             every installed skill's requires, each tool looked up on PATH, install hints
```

Only `/devflow:gh-sync` declares `requires:` today: every one of its modes talks to GitHub through `gh`. Skills that
use a tool for only some subcommands (`initiatives sync`, `awareness`) do not declare it, because `requires:` refuses
the whole skill.

Purpose: STOR-04's declaration, lookup, message and doctor remediation. Output: the module, doctor check 14, the
gh-sync declaration. The hook and its registration are 61-08.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── skill-requires.cjs                     ← CREATE
├── skill-requires.test.cjs                ← CREATE
├── skill-requires.repo.test.cjs           ← CREATE
└── doctor-checks/
    ├── 14-skill-requires.cjs              ← CREATE
    └── 14-skill-requires.test.cjs         ← CREATE
plugins/devflow/skills/gh-sync/SKILL.md    ← MODIFY (frontmatter only)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature): RED commit (`test(61-02): ...`) before GREEN (`feat(61-02): ...`).
- Hand-built fixtures only (fixture_strategy generators, no_llm_test_data). Skills dirs are temp directories with
  literal SKILL.md text written by the test. PATH directories are temp directories holding literal shell scripts
  (`#!/bin/sh\nexit 0\n`, mode 0o755). No generated data, no property-based libraries, no `.feature` files.
- Tests never depend on the machine's real PATH: every lookup gets an explicit `env.PATH`.
- `skill-requires.cjs` must stay cheap to require from a hook: it may require only `fs`, `path` and `./frontmatter.cjs`.
- The SKILL.md change is frontmatter only. Objective 62 sweeps skill bodies; do not touch them here.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

## Test list

`skill-requires.test.cjs` (pure, in-process):

1. `parseRequires(fm)`: no `requires` → `{ ok: true, tools: [] }`; `'gh'` → `['gh']`; `['gh', 'docker', 'gh']` →
   `['gh', 'docker']` (deduped, order kept); `['Gh CLI']`, `[5]`, `{}`, `''` → `{ ok: false, error }` naming the bad
   value. A tool token is `/^[a-z0-9][a-z0-9._+-]*$/`.
2. `readSkillRequires(skillsDir, name)` on a temp skills dir:
   - `requires:` as a block list → its tools;
   - inline `[gh, docker]` → both;
   - no key → `[]`;
   - a missing skill → `{ found: false, tools: [] }`;
   - an invalid value → `{ found: true, tools: [], error }`;
   - a name with path characters (`../x`, `a/b`, `X`) → `{ found: false }`, with no file read outside `skillsDir`.
3. `skillNameFromInvocation(input)`:
   - `{ hook_event_name: 'UserPromptExpansion', prompt: '/devflow:gh-sync status', command_name: 'gh-sync' }` → `'gh-sync'`;
   - the same with only `command_name: 'devflow:gh-sync'` and no prompt → `'gh-sync'`;
   - `prompt: '/gh-sync'` with `command_name: 'gh-sync'` (another plugin's or the user's own skill) → `null`;
   - `{ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'devflow:gh-sync' } }` → `'gh-sync'`;
   - `tool_input.skill` `'/devflow:gh-sync'` → `'gh-sync'`; `'gh-sync'` and `'other:gh-sync'` → `null`;
   - `tool_name: 'Bash'`, `hook_event_name: 'UserPromptSubmit'`, null and non-object input → `null`.
4. `findOnPath(tool, env)`:
   - an executable `gh` in a temp bin dir → its absolute path;
   - a non-executable file `gh` → `null`; a directory named `gh` → `null`;
   - `env.PATH` empty or undefined → `null`; PATH entries that do not exist → skipped;
   - the first PATH directory that has it wins.
   Mark the executable-bit cases `skip` on win32.
5. `missingTools(['gh', 'docker'], { PATH: dirWithGhOnly })` → `['docker']`; `missingTools([], env)` → `[]`.
6. `refusalReason('gh-sync', ['gh'])` contains `/devflow:gh-sync`, `gh`, `https://cli.github.com`, `gh auth login`,
   `/devflow:doctor`, `skill-requires` and `DEVFLOW_SKIP_SKILL_REQUIRES=1`. Two missing tools → both named, with plural
   grammar. An unknown tool gets the generic hint (`install <tool> and make sure it is on PATH`).
7. `listSkillRequires(skillsDir)` → `[{ skill, tools }]` sorted by skill name, only skills with a non-empty list; a
   skill with an invalid value → `{ skill, tools: [], error }`.

`14-skill-requires.test.cjs` (doctor-fixtures `makeDoctorHome` + `makeInstalledPlugin(home, { files })` with literal
`skills/<name>/SKILL.md` contents; `ctx.env.PATH` set explicitly):

8. gh-sync requires gh, PATH has gh → `severity: 'ok'`, the finding names `gh`.
9. PATH without gh → `severity: 'warn'`, `fixable: false`. The finding names `gh` and `/devflow:gh-sync`. `fix_command`
   includes `https://cli.github.com`. `details.missing` is `[{ tool: 'gh', skills: ['gh-sync'], hint }]`.
10. Two skills need `docker` and neither is satisfied → one entry for `docker` listing both skills.
11. No skill declares `requires:` → `ok`, with the finding `no skill declares requires:`.
12. A skill with an invalid `requires:` → `warn` naming that skill and the bad value.
13. No installed plugin and no override → `ok` with `no installed plugin to check` (hooks-registry already warns about
    the install). With no installed plugin and `DEVFLOW_DOCTOR_PLUGIN_ROOT` pointing at a temp plugin root → that root's
    skills are checked.
14. Contract: `id: 'skill-requires'`, `scope: 'global'`, a non-empty title, no `fix`.

`skill-requires.repo.test.cjs` (reads the real `plugins/devflow/skills/`):

15. Every `skills/*/SKILL.md` parses (`readSkillRequires(...).error` is undefined for all of them).
16. `gh-sync` declares exactly `['gh']`.
17. Every tool any skill declares has an `INSTALL_HINTS` entry, so the refusal is always concrete.
18. `doctor` and `help` declare no `requires:`: they are the remedy and must always run.

<embedded_context>

<codebase_examples>
frontmatter parsing, verified against this repo's parser:

```js
const { extractFrontmatter } = require('./frontmatter.cjs');
extractFrontmatter('---\nname: x\nrequires: [gh, docker]\n---\nbody').requires   // ['gh', 'docker']
extractFrontmatter('---\nname: x\nrequires:\n  - gh\n---\nbody').requires         // ['gh']
```

gh-sync SKILL.md frontmatter today. Add `requires:` after `argument-hint`, as a block list like `allowed-tools`:

```yaml
---
name: gh-sync
description: |
  Operate the GitHub store, ...
argument-hint: "[migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]"
requires:
  - gh
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
```

Plugin-root resolution in `doctor-checks/12-hooks-registry.cjs` (copy the rule; do not import a private function):

```js
function resolveRoot(ctx) {
  const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
  if (installed && installed.installPath && isDir(installed.installPath)) return installed.installPath;
  const override = ctx.env && ctx.env.DEVFLOW_DOCTOR_PLUGIN_ROOT;
  if (override && isDir(override)) return override;
  return null;
}
```

doctor-fixtures: `makeInstalledPlugin(home, { version, files })`. `files` maps a path relative to the install path to
its content, so `{ 'skills/gh-sync/SKILL.md': '---\nname: gh-sync\nrequires:\n  - gh\n---\n' }` creates one.
</codebase_examples>

<anti_patterns>
- Do not spawn `which`, `command -v` or the tool itself. The hook runs on every slash command, so the lookup must be a
  handful of `stat` calls.
- Do not treat a bare `command_name` (no `devflow:` prefix, prompt not starting `/devflow:`) as a DevFlow skill. A user
  skill or another plugin's skill can share the name.
- Do not throw from any exported function on bad input. Return `null`, `[]` or `{ ok: false }`, because the hook must
  fail open.
- Do not add `requires:` to skills that only sometimes need a tool. It refuses the whole skill.
- Do not let doctor check 14 read `os.homedir()` or `process.env`. Use `ctx.userHome` and `ctx.env` (README rule).
</anti_patterns>

<error_recovery>
- If a real SKILL.md fails test 15 for a reason unrelated to `requires:` (the shared parser and a multi-line
  `description: |`), do not "fix" the skill. Narrow `readSkillRequires` so that only a `requires` problem is an
  `error`, and record it.
- If makeInstalledPlugin cannot write nested `skills/...` paths, write the files yourself under its returned install
  path in the test file. Do not edit doctor-fixtures.cjs: 61-07 owns it in wave 2.
</error_recovery>

</embedded_context>

<gotchas>
- `INSTALL_HINTS` (exported, frozen). At least:
  - `gh`: `install the GitHub CLI (https://cli.github.com), then run gh auth login`;
  - `docker`: `install Docker (https://docs.docker.com/get-docker/)`;
  - `flutter`: `install Flutter (https://docs.flutter.dev/get-started/install)`;
  - `go`: `install Go (https://go.dev/dl/)`.
- `SKIP_ENV = 'DEVFLOW_SKIP_SKILL_REQUIRES'`. The refusal names it as the escape for "the environment Claude Code is
  launched from". A hook runs in Claude Code's process, so an inline command prefix never reaches it.
- Refusal text shape, one paragraph:
  `/devflow:<skill> needs <tools> on PATH, and <it is|they are> not installed: <hint per tool, '; '-joined>. Run /devflow:doctor to check every DevFlow skill's required tools (check skill-requires). To bypass, set DEVFLOW_SKIP_SKILL_REQUIRES=1 in the environment Claude Code is launched from.`
- `findOnPath`: split `env.PATH` on `path.delimiter`, ignore empty entries, and require `fs.statSync(p).isFile()` plus
  `fs.accessSync(p, fs.constants.X_OK)`. On win32, also try each `env.PATHEXT` extension (default `.EXE;.CMD;.BAT`).
- Valid skill names are `/^[a-z0-9][a-z0-9-]*$/`. Check the name before building any path.
- Doctor check 14: severity `warn` when any tool is missing or any skill's value is invalid; `fix_command` is the
  `'; '`-joined hints of the missing tools; `details: { checked: [{ tool, skills, found: <path|null> }], missing, invalid }`.
  The ok finding lists `tool (skill, ...)` pairs. The doctor runs in the user's shell, and a hook inherits Claude
  Code's PATH. Note that in the check's header comment, as the reason a tool can be found by one and not the other.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: skill-requires.cjs, the frontmatter field, skill-name resolution, PATH lookup and refusal text (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/skill-requires.cjs, plugins/devflow/devflow/bin/lib/skill-requires.test.cjs</files>
  <action>
RED: write tests 1-7. Build the temp skills dirs and temp bin dirs in the test file with literal content; remove them
in `after`. Run the file and watch it fail. Commit `test(61-02): skill requires parsing, lookup and refusal text`.

GREEN: create `skill-requires.cjs`. The header comment records the enforcement-point decision from the objective (both
events, why not a preflight), the fail-open contract and the consumers (61-08 hook, doctor check 14). Export the names
in the must_haves artifact. Commit `feat(61-02): skills can declare requires: and the missing tools are named`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` passes, and `node -e "require('./plugins/devflow/devflow/bin/lib/skill-requires.cjs')"` loads with no require beyond fs, path and frontmatter.cjs (check with `rg -n "require\(" plugins/devflow/devflow/bin/lib/skill-requires.cjs`).</verify>
  <done>Tests 1-7 went RED then GREEN in separate commits.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: doctor check 14-skill-requires, the gh-sync declaration and the repo contract (tests 8-18)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs, plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
RED: write tests 8-14 (doctor check) and 15-18 (repo contract). Run them; 8-14 fail (no check) and 16 fails (gh-sync
declares nothing). Commit `test(61-02): doctor skill-requires check and the skills requires contract`.

GREEN: create `14-skill-requires.cjs` (report only, no `fix`). Add `requires:\n  - gh` to gh-sync's frontmatter.
Commit `feat(61-02): doctor checks the tools skills require; gh-sync requires gh`.

Then run `claude plugin validate plugins/devflow` once (Bash timeout 90000). It does not validate skill frontmatter
today. Record its last line in the SUMMARY so 61-08 has a baseline.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs doctor --global --json` lists a `skill-requires` result.</verify>
  <done>Doctor check 14 reports missing required tools with install hints. gh-sync declares gh. The repo contract pins every declared tool to a hint.</done>
  <recovery>If `doctor.e2e.test.cjs` counts global checks or pins their ids, add `skill-requires` where it lists them. That is the only legitimate change there.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs`.
</validation_gates>

<verification>
- The new tests pass, and `doctor.e2e.test.cjs` and the other doctor-check tests are green.
- `git diff <base> -- plugins/devflow/skills/gh-sync/SKILL.md` touches only the frontmatter (two added lines).
</verification>

<success_criteria>
- [ ] `requires:` is a parsed, validated skill frontmatter field
- [ ] Missing tools are found without spawning, and the refusal text names doctor, the install hint and the escape
- [ ] `doctor` check 14 surfaces missing required tools
- [ ] gh-sync declares gh; a repo test keeps every declared tool documented
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-02-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
