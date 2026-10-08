---
objective: 68-milestone-and-objective-verbs
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/flag-guard.cjs
  - plugins/devflow/devflow/bin/lib/flag-guard.test.cjs
  - plugins/devflow/devflow/bin/lib/flag-spec.cjs
  - plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [TOOL-01]
must_haves:
  truths:
    - "`df-tools milestone complete v1.0 --zz-unknown` exits 1 before anything runs, stderr names `--zz-unknown` and `milestone complete`, and the project tree is unchanged"
    - "Every command/subcommand in FLAG_SPEC (the planning and state writers: state, commit, template, frontmatter, config-ensure-section, config-set, roadmap, requirements, objective, milestone, plan, summary, verification, doc, decision, debug, quick, todo, scaffold, validate, skill-active, micro) rejects an unknown flag the same way, with zero gh calls and no file written"
    - "Known flags still work: `--flag value`, `--flag=value`, repeated and multi-word values (`commit --files a b`, `milestone complete --name Store Demo`), the global `--raw`/`--help`, a literal `--` and `state patch --<field> <value>`"
    - "The guard runs in the dispatcher after the --help pre-switch and before the switch, only for commands HELP_TABLE marks `mutates: true` that have a FLAG_SPEC entry"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flag-guard.cjs
      provides: "checkFlags(args, spec) -> null | {flag, label, accepted}; formatUnknownFlag(result)"
      exports: ["checkFlags", "formatUnknownFlag"]
    - path: plugins/devflow/devflow/bin/lib/flag-spec.cjs
      provides: "FLAG_SPEC: the accepted flags of each writing command and subcommand (group 1)"
      exports: ["FLAG_SPEC"]
    - path: plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs
      provides: "spawns every FLAG_SPEC entry with an unknown flag (PROBES) and asserts exit 1, the named flag, an unchanged tree and no gh call"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs main()"
      to: "lib/flag-guard.cjs checkFlags + lib/flag-spec.cjs FLAG_SPEC"
      via: "guard call between the help pre-switch and `switch (command)`"
      pattern: "checkFlags\\(args, FLAG_SPEC\\)"
    - from: "lib/__fixtures__/flag-guard-fixtures.cjs PROBES"
      to: "lib/flag-spec.cjs FLAG_SPEC"
      via: "one probe per spec entry (68-05 makes the sets equal by test)"
      pattern: "PROBES"
---

# TRD 68-03: Writing commands reject an unknown flag (guard and the planning writers) (TOOL-01)

<objective>
Most df-tools commands that write ignore a flag they do not know and carry on writing: `milestone complete v1.0
--dry-runn` archives the milestone. A probe of 120 writing subcommands (planning session, 2026-10-08) found 13 that
reject an unknown flag (doctor, upgrade, calibrate, estimate, tokens, transcript-export, override, stack report/mcp,
decision-queue, and three that only "named" it because it was swallowed as data) and about 110 that ignore it.

Fix it the way issue #87 fixed `--help`: once, in the dispatcher, before any subcommand runs. A declarative spec lists
each writing command's accepted flags per subcommand; a pure checker walks argv and stops at the first flag the spec
does not accept; the dispatcher prints an error naming it and exits 1, so nothing is written. This TRD builds the
checker, the wiring and the spec for the planning and state writers; 68-05 adds the remaining writing commands and the
tests that keep the spec complete and in step with the docs.

Purpose: success criterion 3. Output: flag-guard.cjs, flag-spec.cjs (group 1), dispatcher wiring, unit and CLI tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/help.cjs
@plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs

Read `plugins/devflow/devflow/bin/df-tools.cjs` with offset/limit: `main()` (around lines 316-362) and the switch arms
of the group-1 commands (state 362, commit 438, template 461, frontmatter 487, config 660-670, roadmap 775,
requirements 789, objective 799, milestone 822, plan..quick 830-864, validate 865, todo 983, scaffold 1026,
skill-active 1424, micro 1432). Modules they delegate to: planning-verbs-cli.cjs, skill-active.cjs, micro.cjs.

## Binding rules
- Strict TDD on tasks 2 and 3; one test at a time.
- Hand-built fixtures; temp projects with a fake HOME and the gh PATH shim; never this repository's `.planning/`.
- Parallel wave: 68-01 edits roadmap.cjs, planning-verbs-cli.cjs and help.cjs, 68-02 edits helpers.cjs and
  milestone-scope.cjs. Do not edit those files; read them. Address your checkout explicitly if a worktree was
  provisioned; one plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `milestone complete` accepts `--dry-run` in the spec from the start (68-01 implements it in the same wave).

## Spec shape (lib/flag-spec.cjs)

```js
// command -> rule, or command -> { subcommands: { name -> rule }, default?: rule }
// rule: { values?: [flag], bools?: [flag], anyFlags?: true, ownParser?: true, tailFrom?: n, reason?: string }
//   values: takes the next token (or =value); bools: no value; anyFlags: every --x accepted (needs reason);
//   ownParser: the command's own parser rejects unknown flags (needs reason; 68-05 uses it);
//   tailFrom: argv index from which tokens are carried, not read (needs reason).
const FLAG_SPEC = {
  milestone: { subcommands: {
    put:      { values: ['--from'], bools: ['--no-flush', '--no-wait'] },
    complete: { values: ['--name'], bools: ['--archive-objectives', '--dry-run', '--no-flush', '--no-wait'] },
  } },
  ...
};
```

Starting table for group 1 (verify every row against the code before relying on it; a flag the code reads but the
table omits breaks a caller, a flag the table lists but no code reads is a lie):

| command | subcommand → values / bools |
|---|---|
| state | load, get, update, update-progress: none; patch: anyFlags (reason: `--<field> <value>` pairs name arbitrary STATE.md fields); advance-job: `--objective`; record-metric: `--objective --job --duration --tasks --files`; add-decision: `--objective --summary --rationale`; add-blocker, resolve-blocker: `--text`; record-session: `--stopped-at --resume-file`; default (no subcommand = load): none |
| commit | values `--files` (the following non-flag tokens are files too); bools `--amend` |
| template | select: none; fill: `--objective --job --name --type --wave --fields` |
| frontmatter | get: `--field`; set: `--field --value`; merge: `--data`; validate: `--schema` |
| config-ensure-section, config-set | none |
| roadmap | get-objective, analyze, update-job-progress: none |
| requirements | mark-complete: none |
| objective | next-decimal, add, insert, complete: none; remove: bools `--force --confirm`; put: `--from` + `--no-flush --no-wait`; set-status: `--no-flush --no-wait` |
| milestone | as above |
| plan | put-trd: `--from` + `--no-push --no-flush --no-wait`; push: `--no-flush --no-wait` |
| summary | post: `--from --file` + flush bools; checkpoint: `--from --file` + flush bools |
| verification | post: `--from --file` + flush bools |
| doc | put: `--from --message` + flush bools |
| decision | open: `--question` + flush bools; answer: `--from --text` + flush bools |
| debug | put: `--from` + flush bools; resolve: flush bools |
| quick | put: `--from` + flush bools; summary: `--from` + flush bools |
| todo | add: `--from --stem` + flush bools; complete: flush bools; sync: values `--transcript --session --projects-root`, bools `--dry-run --no-flush --no-wait` |
| scaffold | (first positional is the type, not a subcommand) values `--objective --name` |
| validate | consistency, docs: none; health: bools `--repair` |
| skill-active | (no subcommand; the flag is the action) values `--start`, bools `--end --status` |
| micro | start, abort: none; commit: values `--files` |

"flush bools" = `--no-flush --no-wait`. Global flags accepted everywhere: `--raw`, `--help`, `-h` (single-dash tokens are
never checked), `--cwd` (normally already removed by extractCwdFlag).
</context>

## Test list

`flag-guard.test.cjs` (task 2, pure, no spawn):
1. A known value flag consumes its value: `['milestone','complete','v1','--name','X']` → null.
2. `--flag=value` is accepted for a value flag (`--from=-`) and the name before `=` is what is checked.
3. A known bool flag: `['objective','remove','2','--confirm','--force']` → null.
4. An unknown flag: `['milestone','complete','v1','--zz']` → `{ flag: '--zz', label: 'milestone complete', accepted: [...] }`,
   `accepted` sorted.
5. The first unknown flag is reported when there are two.
6. Multi-value tails: `['commit','m','--files','a','b','--amend']` → null; `['milestone','complete','v1','--name','Store','Demo','--dry-run']` → null.
7. A value that looks like a flag is consumed as the value: `['frontmatter','set','f','--field','k','--value','--x']` → null.
8. A literal `--` stops checking: `['doc','put','x','--from','f','--','--zz']` → null.
9. `anyFlags` (`state patch --Status x`) → null; `ownParser` and `tailFrom` rules are honoured (unit-only spec entries).
10. Unknown subcommand → null (the dispatcher's own "Unknown ... subcommand" error stays in charge); a command with no
    spec entry → null.
11. Subcommand-taking command with a flag where the subcommand goes (`['milestone','--zz']`) → reported, label `milestone`;
    `['state','--zz']` → reported (state's default rule accepts nothing).
12. Globals: `--raw`, `--help`, `-h`, `--cwd x`, single-dash `-5` → null.
13. `formatUnknownFlag(r)` → `unknown flag --zz for \`milestone complete\`; nothing was written (accepted: --archive-objectives, --dry-run, --name, --no-flush, --no-wait)`;
    an entry with no accepted flags says `(it takes no flags)`.

`flag-guard-cli.test.cjs` (task 3, spawns the real binary):
14. Outermost: `df-tools --cwd <p> milestone complete v1.0 --zz-unknown` → exit 1; stderr
    `Error: unknown flag --zz-unknown for \`milestone complete\`...`; `planningTree`/snapshot unchanged; gh shim log empty.
15. Every FLAG_SPEC entry (each subcommand; a flags-only command once) via its PROBES argv + `--zz-unknown` → exit 1,
    stderr contains `--zz-unknown` and the entry's label, tree unchanged, no gh call. Failures collected and reported
    together. Entries whose rule is `anyFlags` (`state patch`) are skipped by the loop and the skip list is asserted;
    test 16 covers `state patch` positively.
16. Positive controls (exit code is not 1 because of the flag, stderr has no `unknown flag`):
    `objective remove 2 --force` (dry run), `scaffold context --objective 1 --name Ctx Name`,
    `state patch --Status x`, `skill-active --status`, `frontmatter get .planning/STATE.md --field status --raw`.
17. `milestone complete --help --zz-unknown` still prints usage and exits 0 (help is answered first).
18. A non-writing command is untouched: `find-objective 1 --zz-unknown` behaves as before the change (exit 0).

Regression: the full suite. Many existing tests spawn df-tools with flags; a failure naming `unknown flag` means the
spec misses a flag the code reads: add it (after confirming the code reads it), never weaken the guard.

<embedded_context>

<codebase_examples>
The structural precedent (`df-tools.cjs` `main()`, issue #87): a pre-switch check that no subcommand can bypass.

```js
if (hasTopLevelHelpFlag(args) && !ownsHelp(args)) {
  const name = command && !HELP_FLAGS.has(command) ? command : null;
  if (!name || HELP_TABLE[name]) printHelp(name);
}
if (!command) { process.stderr.write(topLevelUsage()); process.exit(1); }
// <-- the flag guard goes here
switch (command) {
```

A sub-CLI that already rejects unknown flags (`lib/tokens-cli.cjs`), the error style to match:

```js
if (!allowed.includes(name)) return usageError(`unknown flag ${tok} for tokens ${sub}`);
```

`helpers.error(message)` writes `Error: <message>\n` to stderr and exits 1; use it for the guard's exit.

The writing-command list is `help.cjs` `COMMANDS[name].mutates === true` (51 commands; `HELP_TABLE` in df-tools.cjs).
`help.cjs` `FREEFORM_TAIL` (`handoff create`) is the carried-argv precedent for `tailFrom` (68-05 uses it for handoff).

CLI test scaffolding to reuse: `installGhShim({dir, table})` (`lib/__fixtures__/gh-shim.cjs`, records argv to
`<dir>/gh-calls.jsonl`, unmatched calls fail, `shim.env()` gives PATH/HOME/cache isolation) and `snapshot` /
`diffSnapshots` (`lib/__fixtures__/upgrade-fixtures.cjs`). The `--help` no-write test in df-tools.test.cjs (around line
3850) is the model for test 14.
</codebase_examples>

<anti_patterns>
- Do not add per-command `args.includes('--x')` checks in each arm: the next command added would be unguarded again.
- Do not derive the spec by parsing help usage strings: they are prose and incomplete (`state patch --<field>`).
- Do not reject single-dash tokens or positional words; only tokens that start with `--` are flags.
- Do not guard read-only commands in this objective (`verify`, `find-objective`, `init`, ...): TOOL-01 covers writers, and
  read-only argv conventions vary (`init` takes `--include`).
- Do not exit 0 or warn: an unknown flag on a writer is an error (exit 1) and nothing runs.
</anti_patterns>

<error_recovery>
- A full-suite failure whose stderr says `unknown flag --x for \`cmd sub\``: grep the arm and its module for `'--x'`. If
  the code reads it, add it to the spec row (and to the SUMMARY's list of rows corrected from the starting table). If
  no code reads it, the test passes a dead flag: record it in the SUMMARY and add it to the spec only if removing it
  from the test would change what the test covers (otherwise stop and report).
- If a probe in test 15 exits 1 for another reason before the guard (it cannot: the guard runs first), check the probe
  argv reaches the guard (the subcommand name is spelled as in the spec).
</error_recovery>

</embedded_context>

<gotchas>
- `--raw` is spliced out by the dispatcher only once; a second `--raw` is still in argv, so it must be a global.
- `scaffold --name` and `milestone complete --name` take several words; the checker consumes one token as the value and
  sees the rest as positionals (they do not start with `--`), which is correct.
- `commit` refuses a message starting with `--` itself (issue #87); the guard runs before that, so `commit --fils` now
  reports `unknown flag --fils for \`commit\``. df-tools.test.cjs `a commit message beginning with -- is refused`
  asserts only exit 1, that stderr names `--fils`, and that HEAD did not move, so it still passes. A message of exactly
  `--` is a literal `--` to the guard (checking stops) and still reaches the existing refusal logic.
- `objective add <description...>` joins its words: an unquoted word starting with `--` inside a description is now an
  unknown flag. That is intended; a quoted description is one token and passes.
- The probe project needs a STATE.md, ROADMAP.md, REQUIREMENTS.md, `config.json` (`{}`: local mode) and objective
  `01-a` with a TRD so probe argv is realistic, but the guard rejects before any of it is read.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                              ← MODIFY (guard call)
└── lib/
    ├── flag-guard.cjs                        ← CREATE (checkFlags, formatUnknownFlag)
    ├── flag-guard.test.cjs                   ← CREATE (tests 1-13)
    ├── flag-spec.cjs                         ← CREATE (FLAG_SPEC, group 1)
    ├── flag-guard-cli.test.cjs               ← CREATE (tests 14-18)
    └── __fixtures__/flag-guard-fixtures.cjs  ← CREATE (probe project, PROBES)
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Probe-project fixture and PROBES table</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs</files>
  <action>
Hand-built module:
- `flagProbeProject()` → temp project (realpath'd mkdtemp) with `.planning/{config.json '{}', STATE.md, ROADMAP.md (one
  `## Milestones` bullet for v1.0 and `### Objective 1: A`), REQUIREMENTS.md}` and `.planning/objectives/01-a/01-01-TRD.md`;
  a fake HOME; a gh shim (`installGhShim` with an empty table) under the temp dir. Returns `{ root, run(argv),
  tree(), ghCalls(), cleanup() }`: `run` spawns `node df-tools.cjs --cwd <root> ...argv` with `shim.env()` and
  `stdio: ['ignore', ...]` and a 20 s timeout; `tree()` is `snapshot(root)` plus a sorted directory list; `ghCalls()`
  reads the shim log (empty array when absent).
- `PROBES`: `{ 'milestone complete': ['milestone', 'complete', 'v1.0'], 'state patch': ['state', 'patch'],
  'skill-active': ['skill-active'], 'commit': ['commit', 'msg'], ... }` — one key per group-1 spec entry (label =
  `command` or `command subcommand`), each argv the shortest realistic invocation without flags.
Commit `test(68-03): probe project and PROBES for the unknown-flag guard`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs'); const p=f.flagProbeProject(); const r=p.run(['find-objective','1']); console.log(r.status, p.ghCalls().length); p.cleanup()"` prints `0 0`.</verify>
  <done>The probe project runs df-tools in isolation (fake HOME, shimmed gh) and PROBES has a key per planned group-1 entry.</done>
  <recovery>If `find-objective 1` does not exit 0, the objective directory name or ROADMAP heading is malformed; compare with `flagsProject` in `__fixtures__/objective-flags-fixtures.cjs`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The pure checker (tests 1-13)</name>
  <files>plugins/devflow/devflow/bin/lib/flag-guard.cjs, plugins/devflow/devflow/bin/lib/flag-guard.test.cjs</files>
  <action>
RED: tests 1-13 against a small unit-only spec defined in the test file (not FLAG_SPEC), so the checker is tested apart
from the data. Commit `test(68-03): unknown-flag checker`.

GREEN `lib/flag-guard.cjs` (CommonJS, no requires beyond node built-ins):

```
GLOBAL_FLAGS = new Set(['--raw', '--help', '--cwd'])
checkFlags(args, spec):
  entry = spec[args[0]]; if (!entry) return null
  if (entry.subcommands):
     sub = args[1]
     if (sub === undefined) rule = entry.default || {}; label = cmd; start = 1
     else if (sub.startsWith('--')) rule = entry.default || {}; label = cmd; start = 1
     else if (!hasOwn(entry.subcommands, sub)) return null
     else rule = entry.subcommands[sub]; label = `${cmd} ${sub}`; start = 2
  else rule = entry; label = cmd; start = 1
  if (rule.anyFlags || rule.ownParser) return null
  end = rule.tailFrom ?? args.length
  for i in start..end-1:
    tok = args[i]; if (tok === '--') break; if (!tok.startsWith('--')) continue
    name = tok.split('=')[0]
    if (GLOBAL_FLAGS.has(name)) { if (name === '--cwd' && !tok.includes('=')) i++; continue }
    if (rule.values?.includes(name)) { if (!tok.includes('=')) i++; continue }
    if (rule.bools?.includes(name)) continue
    return { flag: name, label, accepted: sorted(values ∪ bools) }
  return null
formatUnknownFlag(r) -> the message in test 13
```
Document at the top: why the guard is structural (issue #87 precedent), the rule fields, and that `anyFlags`,
`ownParser` and `tailFrom` each need a `reason`. Commit `feat(68-03): unknown-flag checker`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` passes.</verify>
  <done>Tests 1-13 went RED then GREEN; flag-guard.cjs is pure (no fs, no process.exit).</done>
  <recovery>If test 11 conflicts with a real command where a flag legitimately comes first (only `skill-active`, which has no `subcommands` key, so it is a flags-only rule), keep the rule and model that command as flags-only.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Group-1 spec and dispatcher wiring (tests 14-18)</name>
  <files>plugins/devflow/devflow/bin/lib/flag-spec.cjs, plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs</files>
  <action>
RED: flag-guard-cli.test.cjs tests 14-18 (14 and 15 fail today: exit 0 and a write for most probes). Commit
`test(68-03): writing commands reject an unknown flag`.

GREEN:
1. `lib/flag-spec.cjs`: `FLAG_SPEC` for the 22 group-1 commands, built from the starting table after checking each
   row against its arm/module (grep `'--` literals in the arm and in planning-verbs-cli.cjs / skill-active.cjs /
   micro.cjs). Header comment: what the file is, that 68-05's repo test keeps it complete, and how to add a flag.
   `Object.freeze` the table deeply.
2. df-tools.cjs: require both modules at the top (next to the help.cjs import); after the `if (!command)` block:
   ```js
   if (HELP_TABLE[command] && HELP_TABLE[command].mutates) {
     const unknownFlag = checkFlags(args, FLAG_SPEC);
     if (unknownFlag) error(formatUnknownFlag(unknownFlag));
   }
   ```
   with a comment naming TOOL-01 and the issue #87 precedent.
3. Adjust PROBES if a row changed. Run the full suite; fix spec rows from real failures as error_recovery says.
Commit `feat(68-03): reject unknown flags on the planning and state writers`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs milestone complete v1.0 --zz-unknown` run from a scratch temp dir (`mktemp -d`, `--cwd`) exits 1 naming the flag; the full suite (validation_gates) shows no new failure.</verify>
  <done>Tests 14-18 went RED then GREEN; every group-1 entry rejects an unknown flag before writing; the full suite is at baseline.</done>
  <recovery>If many existing tests fail at once, revert only the df-tools.cjs guard call (keep the spec), run the suite with `--test-reporter=spec` to list every `unknown flag` message, fix the rows, then restore the call.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/flag-guard.test.cjs plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Take the failing set before the first change; only those known
     environment failures may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-3: test 14 shows `milestone complete` exits 1 naming the unknown flag with nothing written; test 15 shows the same
  for every group-1 writer.
- Tests 16-18 show the guard does not break known flags, help, or read-only commands.
</verification>

<success_criteria>
- Tests 1-18 pass (RED first where listed); full suite at baseline.
- `rg -n "checkFlags\(args, FLAG_SPEC\)" plugins/devflow/devflow/bin/df-tools.cjs` finds exactly one call, placed before
  `switch (command)`.
</success_criteria>

<output>
After completion, publish `68-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first). List every spec row that differs from the starting table and why.
</output>
