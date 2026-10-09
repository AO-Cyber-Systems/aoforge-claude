---
objective: 48-planning-write-path-migration
trd: "15"
type: tdd
wave: 4
depends_on: ["48-04", "48-11", "48-12", "48-13", "48-14"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
autonomous: true
requirements: [GWP-01, GWP-02, GWP-05]
must_haves:
  truths:
    - "df-tools exposes every GWP-01 verb plus the U-1 entity verbs: `plan put-trd|push`, `objective put|set-status`, `summary post|checkpoint`, `verification post`, `doc put`, `decision open|answer`, `todo add|complete`, `debug put|resolve`, `quick put|summary`, `milestone put|complete`, `planning draft|import|mode`"
    - "Each verb reads content from `--from <path>` or `--from -` (stdin), prints prose by default and JSON with `--raw`, and exits with the verb result's code (local 0/1; store 0/1/2/3 as 47's EXIT)"
    - "Store-off routing preserves today's commands exactly: `todo complete`, `milestone complete`, `objective add|insert|remove|complete|next-decimal` keep their current output in local mode; `objective set-status <id> complete` in local mode runs today's `cmdObjectiveComplete` after the frontmatter write"
    - "In store mode `todo complete` and `milestone complete` route to the entity verbs"
    - "`--help` works for every new top-level command (help.test.cjs passes: every `case` has an entry), and each new entry is `mutates: true` except `planning mode`/`planning draft`"
    - "Every verb string in `planning-paths.VERB_TABLE` and every df-tools verb the audit regex accepts resolves to a real dispatch path (asserted in planning-writes.repo.test.cjs), so a gate deny message never names a verb that does not exist"
    - "The seam guard covers the new modules: none spawns gh or git; planning-* modules never call `ghWrite`; gh-milestone-store may (direct milestone writes, D-05)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
      provides: "cmdPlan, cmdObjectiveVerb, cmdSummary, cmdVerification, cmdDoc, cmdDecision, cmdTodoVerb, cmdDebug, cmdQuick, cmdMilestoneVerb, cmdPlanningVerb, readFrom"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "dispatch cases for plan, summary, verification, doc, decision, debug, quick; new subcommands under objective, todo, milestone, planning"
  key_links:
    - "This is the ONLY TRD in objective 48 that edits df-tools.cjs (hotspot)"
    - "Prose TRDs 48-16..48-21 call these exact command lines; 48-22 drives them end to end"
---

# TRD 48-15: CLI wiring for the planning verbs (one df-tools.cjs edit)

<objective>
Expose the verb libraries (48-11, 48-12) and the store-aware existing commands (48-13, 48-14) as df-tools commands with one consistent
shape, register help for each, extend the seam guard to the new modules, and make the SC1 audit prove every verb it accepts exists.

Purpose: GWP-01 (the verbs exist as commands), GWP-02 (prose has real commands to call), GWP-05 (`plan put-trd` budget surfaced). Output:
`planning-verbs-cli.cjs` + tests, dispatch + help entries, seam and audit test extensions.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: CLI tests (subprocess `node plugins/devflow/devflow/bin/df-tools.cjs ...`) RED before the dispatch exists.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- df-tools.cjs gets thin cases only: each new case is `require('./lib/planning-verbs-cli.cjs').cmdX(cwd, args.slice(1), raw)`. Logic lives in the CLI module.
- Store-mode subprocess tests use `installGhShim` (`__fixtures__/gh-shim.cjs`, `defaultCode:1` → queued, exit 3) and `shim.env()`; in-process
  tests of `planning-verbs-cli` functions use `gh._setRunGh(fake.runGh)` + `hermeticEnv()`. Never real GitHub/`~/.claude`, never port 8080.

## Decisions

D-11, D-12, D-13. Settled here — the exact command lines prose will use:

```
df-tools plan put-trd <objective> <file-name> --from <path|-> [--no-push] [--no-flush]
df-tools plan push <objective> [--no-flush]
df-tools objective put <id> --from <path|->            df-tools objective set-status <id> <planned|in_progress|verifying|complete|cancelled|reopened>
df-tools summary post <trd-id> --from <path|-> [--file <name>]      df-tools summary checkpoint <trd-id> --from <path|->
df-tools verification post <objective> --from <path|-> [--file <name>]
df-tools doc put <rel-under-.planning> --from <path|-> [--message <text>]
df-tools decision open <trd-id> --question <text|@path>             df-tools decision answer <trd-id>-d<k> --from <path|-> | --text <t>
df-tools todo add --from <path|-> [--stem <stem>]                   df-tools todo complete <stem|filename>
df-tools debug put <slug> --from <path|->                           df-tools debug resolve <slug>
df-tools quick put <N> <slug> --from <path|->                       df-tools quick summary <N> --from <path|->
df-tools milestone put <version> --from <path|->                    df-tools milestone complete <version> [--name ...] [--archive-objectives]
df-tools planning draft <rel>        df-tools planning import [--dry-run]        df-tools planning mode
```
All accept `--raw`; store-mode verbs accept `--no-flush`/`--no-wait` (no-ops locally). `--from -` reads stdin. A missing `--from` is a usage
error naming the draft helper. `planning mode` prints `local` or `store` (`--raw` → `{mode, reason, root}`) — prose and the job-checker use it.
Unknown subcommands list the available ones (existing `error()` style).

## Test list

planning-verbs-cli (in-process, fake GitHub)
1. `readFrom(['--from', p])` reads the file; `--from -` reads injected stdin; missing → usage error mentioning `planning draft`.
2. `cmdPlan(['put-trd','7','07-04-x-TRD.md','--from',p], raw)` local → file written, exit 0, `--raw` JSON has `mode:'local'`.
3. Same in store mode over 60,000 chars → exit 1, prose names the budget and "split", nothing written.
4. Store mode `summary post 7-01 --from p` → exit 0, comment on the fake TRD issue.

subprocess (df-tools.cjs)
5. Local temp project: each verb line above (with a small `--from` file) exits 0 and writes the expected file; `planning mode` prints `local`.
6. Store temp project with gh shim offline: `plan put-trd ... ` exits 3 (pending) and the journal holds the op; `planning mode --raw` → `store`.
7. Local `todo complete <file>` and `milestone complete v1.0` outputs are byte-identical to before (characterization, captured before wiring).
8. Local `objective set-status 7 complete` → OBJECTIVE.md `status: complete` and today's `objective complete` effects on ROADMAP/STATE.
9. `--help` for `plan`, `summary`, `verification`, `doc`, `decision`, `debug`, `quick` prints usage, exits 0, writes nothing.

repo tests
10. `gh-seam.repo.test.cjs`: GUARDED gains `planning-mode.cjs`, `planning-paths.cjs`, `planning-ledger.cjs`, `planning-verbs.cjs`,
    `planning-entity-verbs.cjs`, `planning-import.cjs`, `planning-verbs-cli.cjs`, `planning-drift.cjs`, `trd-bulk.cjs`, `planning-audit.cjs`,
    `gh-milestone-store.cjs`; NO_DIRECT_WRITE gains every `planning-*.cjs` above.
11. `planning-writes.repo.test.cjs`: every `VERB_TABLE` entry and every alternative in the audit's verb regex maps to a df-tools top-level
    command + subcommand that `--help` documents (parse `help.cjs` COMMANDS usage strings). Includes `planning mode`, `state <sub>`,
    `roadmap update-job-progress`, `requirements mark-complete`, `template fill` accepted by 48-04's regex.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: planning-verbs-cli.cjs (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
RED: tests 1-4. Commit `test(48-15): verb CLI layer`.
GREEN: implement the `cmd*` functions: parse args (reuse `gh-store-cli.positionals` style), `readFrom`, call the library verb, print via
`helpers.output` for `--raw` or prose lines (headline, warnings, queued/flush report via `gh-store-cli` helpers), then `process.exitCode = result.exit`
(do not hard-exit inside the module; the dispatcher exits). Local `objective set-status ... complete` → after the verb, call
`objective.cmdObjectiveComplete`. Store `todo complete`/`milestone complete` → entity verbs; local → existing `cmdTodoComplete`/`cmdMilestoneComplete`.
Commit `feat(48-15): planning verb CLI layer`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</verify>
  <done>Tests 1-4 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dispatch + help (tests 5-9)</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
Commit test 7 first against today's dispatch (characterization). RED: tests 5-6, 8-9; commit `test(48-15): verb commands end to end`.
GREEN: add top-level cases `plan`, `summary`, `verification`, `doc`, `decision`, `debug`, `quick`; add subcommands `put`/`set-status` under
`objective`, `add` under `todo`, `put` under `milestone` (and store routing of `complete`), `draft`/`import`/`mode` under `planning`; update each
`Unknown ... Available:` list. Add COMMANDS entries in `help.cjs` (usage strings exactly as above). Commit `feat(48-15): df-tools planning verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs</verify>
  <done>Tests 5-9 pass; help and df-tools suites green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Seam guard and verb-existence audit (tests 10-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs, plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</files>
  <action>
RED: add the module names to the seam lists and a `verbsExist(verbs, commands)` checker with its assertion. Because Task 2 already landed,
prove sensitivity with a case that feeds `['plan bogus']` to the same checker and expects a failure naming it. Commit
`test(48-15): guard new modules; verbs must exist`.
GREEN: if the guard finds a spawn or direct write in a planning module, move it behind the 47 library that owns it (test-first, separate commit).
Commit `test(48-15): seam guard and verb audit green`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 10-11 pass; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `df-tools.cjs` L746 `case 'objective'`, L766 `case 'milestone'`, L876 `case 'todo'`, L1122 `case 'planning'` (sub `sibling-trd-scan`), L1067 `case 'gh'` (delegates to a CLI module — the pattern to copy).
- `gh-store-cli.cjs` L74 `positionals(args, valueFlags)`, L46 `emit(res, raw)`, L31 `EXIT`.
- `help.cjs` COMMANDS: `{usage, summary, mutates}`; `help.test.cjs` fails when a dispatch case lacks an entry.
</codebase_examples>
<anti_patterns>
- Logic in df-tools.cjs cases: it is the objective's hotspot and the only file every wave would otherwise touch.
- Hard `process.exit` inside the CLI module: tests call it in-process.
</anti_patterns>
<error_recovery>
- If `help.test.cjs` derives the case list by regex and the new nested subcommands confuse it, add entries for the top-level names only (that is its contract).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/df-tools.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</regression>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs planning mode` in this repo prints `local`.
- `node plugins/devflow/devflow/bin/df-tools.cjs plan --help` prints the put-trd usage.
</verification>

<success_criteria>
Every planning write has a df-tools command with one argument shape, local projects see no behaviour change, and the audit proves every named verb is real.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-15-SUMMARY.md`
</output>
