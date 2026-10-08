---
objective: 48-planning-write-path-migration
trd: "15"
subsystem: planning-verbs
tags: [gwp-01, gwp-02, gwp-05, cli, dispatch, help, seam-guard, verb-audit, local-invariant, tdd]

requires:
  - objective: 48-04
    provides: "planning-audit VERB_CALL_RE (the verbs a satisfied directive may name)"
  - objective: 48-11
    provides: "planning-verbs putTrd, planPush, objectivePut, objectiveSetStatus (local complete -> delegate), summaryPost, summaryCheckpoint, verificationPost, docPut, draftPath, STATUSES"
  - objective: 48-12
    provides: "planning-entity-verbs todoAdd/todoComplete/debugPut/debugResolve/quickPut/quickSummary/decisionOpen/decisionAnswer/milestonePut/milestoneComplete; planning-import planImport"
  - objective: 48-13
    provides: "store-aware state/roadmap mutators (unchanged dispatch)"
  - objective: 48-14
    provides: "store-aware objective add/remove/complete, frontmatter, template fill, requirements; __fixtures__/store-cli-fixtures.cjs"
provides:
  - "lib/planning-verbs-cli.cjs: cmdPlan, cmdObjectiveVerb, cmdSummary, cmdVerification, cmdDoc, cmdDecision, cmdTodoVerb, cmdDebug, cmdQuick, cmdMilestoneVerb, cmdPlanningVerb, readFrom, positionals, flagValue, report"
  - "df-tools top-level commands plan, summary, verification, doc, decision, debug, quick; subcommands objective put|set-status, todo add, milestone put, planning draft|import|mode; store routing of todo complete / milestone complete"
  - "help.cjs entries for every new command (VERB_DETAILS shared block)"
  - "gh-seam guard over the planning modules (PLANNING_MODULES); planning-writes verbsExist/auditVerbs (exported)"
affects: [48-16, 48-17, 48-18, 48-19, 48-20, 48-21, 48-22, 48-23]

tech-stack:
  added: []
  patterns:
    - "Thin dispatch: each new case is `require('./lib/planning-verbs-cli.cjs').cmdX(cwd, args.slice(1), raw)`"
    - "The CLI module sets process.exitCode and returns it (never process.exit); local delegates run today's command unchanged"
    - "Characterization by twin projects: dispatch output vs a direct library call / vs `objective complete`, compared byte for byte"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs

key-decisions:
  - "Local `todo complete`, `milestone complete` and `objective set-status <id> complete` delegate to today's cmdTodoComplete / cmdMilestoneComplete / cmdObjectiveComplete, which keep stdout and the exit code; store mode routes to the entity verbs"
  - "`objective set-status <id> complete` (local) writes `status: complete`, prints its headline to stderr, then runs `objective complete <id>`: stdout and every file but OBJECTIVE.md are byte-identical to `objective complete`"
  - "Local `todo complete` also accepts a bare stem (appends `.md` only when `<stem>`.md is pending and `<stem>` is not); a file name is passed through unchanged"
  - "--raw prints the verb's result object (`{ok, mode, rel, path, warnings, exit, ...}`); prose puts the headline and flush report on stdout and errors/warnings on stderr"
  - "The `planning` help entry is `mutates: true` because `planning import` writes; its details say `mode` and `draft` write nothing under .planning/ (the flag is per top-level command)"

requirements-completed: [GWP-01, GWP-02, GWP-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 35min
completed: 2026-10-01
tokens_input: 8290867
tokens_output: 87477
tokens_cache_read: 8110453
tokens_cache_write: 180298
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 15: CLI wiring for the planning verbs Summary

**Every planning write now has a df-tools command with one argument shape: content from `--from <path|->`, prose or `--raw` JSON, and the verb result's exit code (local 0/1; store 0/1/2/3). In local mode every verb writes the same `.planning/` file with the input bytes. `todo complete`, `milestone complete` and `objective complete` print exactly what they printed before. The SC1 audit now proves that every verb the gate or the audit names is a documented df-tools command.**

## Exact command lines for the prose TRDs (48-16..48-21)

```
df-tools plan put-trd <objective> <file-name> --from <path|-> [--no-push] [--no-flush]
df-tools plan push <objective> [--no-flush]
df-tools objective put <id> --from <path|->
df-tools objective set-status <id> <planned|in_progress|verifying|complete|cancelled|reopened>
df-tools summary post <trd-id> --from <path|-> [--file <name>]
df-tools summary checkpoint <trd-id> --from <path|->
df-tools verification post <objective> --from <path|-> [--file <name>]
df-tools doc put <rel-under-.planning> --from <path|-> [--message <text>]
df-tools decision open <trd-id> --question <text|@path>
df-tools decision answer <trd-id>-d<k> --from <path|-> | --text <t>     (local ids: DECISION-NNN)
df-tools todo add --from <path|-> [--stem <stem>]
df-tools todo complete <stem|filename>
df-tools debug put <slug> --from <path|->
df-tools debug resolve <slug>
df-tools quick put <N> <slug> --from <path|->
df-tools quick summary <N> --from <path|->
df-tools milestone put <version> --from <path|->
df-tools milestone complete <version> [--name ...] [--archive-objectives]
df-tools planning draft <rel>          prints a draft path (os.tmpdir()/devflow-drafts/<repo-key>/<rel>), seeded from the current file
df-tools planning import [--dry-run]   store mode only (local exits 1: "planning import needs github.store: true")
df-tools planning mode                 prints `local` or `store`; --raw -> {mode, reason, root}
```

- **All commands** accept `--raw`. Store-mode verbs also take `--no-flush` and `--no-wait`, which do nothing locally.
- **Input:**
  - `--from -` reads stdin, and `--from <path>` resolves against the cwd.
  - A missing `--from` is exit 1. The message names `df-tools planning draft <rel>`.
  - `--from=<path>` also works.
- **Unknown subcommands** exit 1 with `Error: Unknown <group> subcommand: <sub>. Available: ...`.
- **Unchanged commands:** `objective add|insert|remove|complete|next-decimal` keep today's dispatch, which 48-14 made store-aware.
- **`summary post`** and **`verification post`** reuse an existing SUMMARY or VERIFICATION file. Otherwise they write `<NN-MM>-SUMMARY.md` and `<NN>-VERIFICATION.md`.
- **`doc put`** refuses files that another verb owns, and names that verb. This applies to OBJECTIVE.md, TRDs, SUMMARY/VERIFICATION, todos/debug/quick/decisions and generated views.

## Accomplishments

- **planning-verbs-cli.cjs** covers 11 command groups:
  - Each one parses the arguments, reads `--from`, calls one library verb and reports the result.
  - `report` uses one format. The headline is `<verb>: wrote .planning/<rel> (<mode> mode).`, with `moved A -> B` for moves. Errors and warnings go to stderr. The queued-only note and gh-store-cli's flush prose go to stdout.
  - A budget refusal says `refused: the TRD is over the store budget (N encoded chars; the limit is 60,000). Nothing was written.`, followed by trd-bulk's "split it ..." fix.
  - The module never calls `process.exit`.
- **df-tools.cjs:**
  - New thin cases: `plan`, `summary`, `verification`, `doc`, `decision`, `debug`, `quick`.
  - `objective` gains `put` and `set-status`.
  - `todo` and `milestone` delegate wholesale to the CLI module. It keeps the old `--name` multi-word parse.
  - `planning` gains `draft`, `import` and `mode`.
  - Every `Available:` list is updated.
- **help.cjs:** each new or extended entry uses the usage strings above, plus a shared `VERB_DETAILS` block covering input, `--raw`, store flags and exit codes. Every new top-level entry has `mutates: true`.
- **gh-seam.repo.test.cjs:**
  - `PLANNING_MODULES` lists the 9 planning-*.cjs modules. They are added, together with `trd-bulk.cjs` and `gh-milestone-store.cjs`, to `GUARDED`, so tests 17, 18 and 20 now cover them: no gh spawn, no `runGh(`, no `parseInt(` of an id, no git spawn.
  - The planning modules are also in `NO_DIRECT_WRITE`.
  - New test 22:
    - Every listed module exists.
    - `gh-milestone-store` is guarded but is a direct writer (D-05).
    - Every `planning-*.cjs` on disk is listed, so a new module cannot skip the guard.
- **planning-writes.repo.test.cjs:**
  - `auditVerbs()` expands `VERB_CALL_RE` (for example `plan (put-trd|push)` → `plan put-trd`, `plan push`; `state [a-z-]+` → `state *`).
  - `verbsExist()` requires a top-level `case` in df-tools.cjs and a help usage that documents every further word.
  - Both are asserted over `VERB_TABLE` plus every expanded audit verb.
  - A sensitivity case expects `plan bogus` and `nope put` to fail by name.
  - Both functions are exported for 48-23.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1+2 RED | 0aed8bb8 | test(48-15): verb CLI layer and verb commands end to end |
| 1+2 GREEN | 8b532142 | feat(48-15): planning verb CLI layer and df-tools planning verbs |
| 3 | a72f4475 | test(48-15): guard new modules; verbs must exist |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test lib/planning-verbs-cli.test.cjs` (tests 1-4) | 0 | PASS |
| 2 | `node --test lib/planning-verbs-cli.test.cjs lib/help.test.cjs` | 0 | PASS (22/22) |
| 2 | `node --test df-tools.test.cjs` | 0 | PASS (153/153) |
| 3 | `node --test lib/gh-seam.repo.test.cjs lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs` | 0 | PASS (34/34) |
| verify | `df-tools --cwd <worktree> planning mode` | 0 | prints `local` |
| verify | `df-tools plan --help` | 0 | prints the put-trd usage |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/planning-verbs-cli.test.cjs` | 1 (8 fail: module and dispatch missing; test 7 passes) | FAIL (correct) |
| GREEN | `node --test lib/planning-verbs-cli.test.cjs lib/help.test.cjs` | 0 (22/22) | PASS (correct) |
| Task 3 | `node --test gh-seam/planning-writes/doc-refs` | 0 (34/34) | PASS: the guard found nothing to move; the sensitivity case proves the checker fails on a missing verb |

Test 7, the characterization, passed at RED against today's dispatch, before any wiring. That RED run is its "captured before" evidence. After wiring it still passes, byte-identically.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-verbs-cli.test.cjs help.test.cjs gh-seam.repo.test.cjs planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test df-tools.test.cjs doc-refs.repo.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 | PASS except the known flake: 7458 tests, 7425 pass, 1 fail, 32 skipped |

**Full suite:** the single failure is **MA-7** in `handoff-e2e.test.cjs` (the doctl auth init PTY race, TRD 19-05), a pre-existing flake unrelated to these files. It was noted and not fixed, as instructed. roadmap-reconcile E2E1 passed in this run. It is expected to fail once this SUMMARY exists while ROADMAP still shows `[ ]`, until the orchestrator ticks it.

## Invariant check (github.store off)

- **Test 5** runs every verb line in a local project (`github.enabled: true`, no `store`). Each exits 0 and writes its file with the input bytes, and `planning mode` prints `local`.
- **Test 7, todo:** `todo complete` output is byte-identical to the library call in prose (JSON) and `--raw` (`completed`) form, and so is the not-found error.
- **Test 7, milestone:** `milestone complete v1.0 --name Store Demo --archive-objectives` has the same stdout and the same `.planning/` tree as a direct `cmdMilestoneComplete` call on a twin project.
- **Test 8:** `objective set-status 7 complete` leaves stdout and every file except OBJECTIVE.md identical to `objective complete 7`, and OBJECTIVE.md says `status: complete`.
- **Temp copy of this repo's `.planning/`** (scratchpad, never the real one), with all three writes byte-identical to their input:
  - `planning mode --raw` → `local` ("github.enabled is not true").
  - `plan put-trd 48 48-99-verify-TRD.md --from <draft>`.
  - `doc put research/zz-verify.md`.
  - `todo add --stem` then `todo complete <stem>`.
  - `summary checkpoint 48-99` wrote `48-99-SUMMARY.md`.
  - A put-trd without `--from` exited 1 naming `planning draft`.
  - No journal or ledger was created.
- **In this repo:** `.planning/` tracking is unchanged, and this TRD writes nothing to it except this SUMMARY.

## Deviations from Plan

1. **[Process] Tasks 1 and 2 share one RED and one GREEN commit.** The 50-turn session cap did not leave room for four commits. All tests (1-9) went in failing first; test 7 was green at RED, as a characterization should be. The implementation followed in one commit.
2. **[Process] Task 3 is one commit.** The extended guard found no spawn, `runGh(` or `ghWrite(` in any planning module. The conditional "move it behind the 47 library" step therefore had nothing to do, and no second "green" commit was needed.
3. **[Rule 2] Local `todo complete <stem>`** accepts the stem form the TRD's usage names. Today's command takes only a file name, and a file name still passes through unchanged.
4. **[Interpretation] Local `planning import` exits 1** (48-12's refusal). Test 5 asserts that rather than exit 0. In store mode it is the 48-12 batch import.
5. **[Interpretation] `planning` help is `mutates: true`.** `mutates` is a per-top-level flag and `import` writes. The details state that `mode` and `draft` write nothing under `.planning/`.

## Known gaps / notes for later TRDs

- **planning-paths quick hint mismatch (for 48-20 / 48-23).** `planning-paths.cjs`'s `quick` rule hints `` `df-tools quick put <N> --from <draft>` ``, but the command is `quick put <N> <slug> --from <path|->`. The `<slug>` is missing, so a gate deny message would suggest a call that exits 1 with a usage error. This is a one-word fix in the hint (48-01's file, outside this TRD's files_modified). `verbsExist` checks verb names, not argument shapes.
- **48-06's Debug/Quick optional-types advisory** (`advisoriesOf`/`describeAdvisories`) is still not shown by `gh outbox status`. It needs wiring in gh-store-cli.cjs, which is outside this TRD's files, so it is left for a later TRD.
- **New-objective title in store mode** (48-14 note: `readObjectiveState` reads ROADMAP) is unchanged here.
- **48-22 can drive these command lines end to end.** Store-mode subprocess tests should use `__fixtures__/store-cli-fixtures.cjs` with `NOTIFIER_DISABLE=1` and `TMPDIR` under a temp root (drafts), as `cliProject()` in planning-verbs-cli.test.cjs does.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7
  - every GWP-01 + U-1 verb exposed
  - one input/output/exit shape
  - local routing byte-identical
  - store todo/milestone complete route to the entity verbs
  - `--help` for every new command, with mutates flags
  - verbs-exist audit
  - seam guard over the new modules
- Gate failures: none from this TRD

## Self-Check: PASSED

- FOUND: planning-verbs-cli.cjs, planning-verbs-cli.test.cjs (run green above)
- FOUND: commits 0aed8bb8, 8b532142, a72f4475 (returned by df-tools commit)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after the merge
