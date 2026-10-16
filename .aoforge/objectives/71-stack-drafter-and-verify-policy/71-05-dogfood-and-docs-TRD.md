---
objective: 71-stack-drafter-and-verify-policy
trd: "05"
type: standard
wave: 3
depends_on: ["71-01", "71-02", "71-03", "71-04"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - plugins/devflow/devflow/templates/stack.md
  - plugins/devflow/devflow/workflows/adopt.md
  - plugins/devflow/devflow/workflows/map-codebase.md
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [SDR-09, SDR-10]
must_haves:
  truths:
    - "SC-1 on the real aodex checkout, read-only: the installed runtime's `stack init` drafts `audit` as `bash scripts/check-govulncheck.sh --self-test` (cwd go) and the repository df-tools drafts `bash scripts/check-govulncheck.sh` (cwd go); aodex's HEAD and `git status --porcelain` are unchanged"
    - "SC-2 read-only: the repository df-tools drafts `lint: make lint` for justinforme and smartWellness (installed runtime: inherited), dfip's lint stays inherited, `stack-fleet-tables.cjs` has no `aodex.audit` row, and the fleet harness passes against `~/dev`"
    - "SC-3 on a scratch clone of trades with a stub `npx` first on PATH: the installed runtime's `stack verify --run --keys test --include test` runs the stub; the repository df-tools prints `test resolved skipped=env_required` and the stub is not called; with `--allow-services` the stub runs once and the line ends `services=allowed`. No real test suite runs and nothing connects to a database"
    - "SC-4 on a scratch clone of eden-circle with stub `go`, `gofmt` and `flutter`: the installed runtime removes `bin/circle-api` and skips the `client/` Flutter gate `side-effect-unsafe`; the repository df-tools prints `build … mutated=1 build_outputs=1` and runs the `client/` gate; the clone's `git status --porcelain` is unchanged"
    - "71-01..71-04 have landed on this branch (their last commits are ancestors of HEAD; created files exist at HEAD)"
    - "CHANGELOG [Unreleased], CLAUDE.md, docs/USER-GUIDE.md and templates/stack.md state the drafter rules and the `--run` policy (env_required, --allow-services, build outputs); adopt.md and map-codebase.md say an `env_required` skip is a finding and never re-run with `--allow-services` unattended; `df-tools stack --help` usage lists `verify` with `--allow-services`"
    - "The two pending todos for SDR-09/SDR-10 are completed, and a new todo records the justinforme/smartWellness committed-file refresh (a commit in each repo, needs the user; then remove the OPEN refresh rows)"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] objective 71 lead paragraph plus Added/Changed entries"
      contains: "Objective 71"
    - path: plugins/devflow/devflow/templates/stack.md
      provides: "the stated --run policy: env_required, --allow-services, build outputs"
      contains: "env_required"
    - path: CLAUDE.md
      provides: "Stack profile bullet names --allow-services, env_required and build_outputs"
      contains: "allow-services"
    - path: plugins/devflow/devflow/bin/lib/help.cjs
      provides: "stack usage lists verify and its flags"
      contains: "--allow-services"
  key_links:
    - from: "71-05-SUMMARY.md evidence table"
      to: "objective 71 success criteria 1-4"
      via: "one before (installed runtime) and after (repository df-tools) command per criterion"
      pattern: "SC-"
---

# TRD 71-05: Dogfood SC-1..SC-4 on the real fleet and scratch clones, and document the policy (SDR-09, SDR-10)

<objective>
Show each success criterion as a before/after pair: the installed runtime (`~/.claude/devflow/bin/df-tools.cjs`, the
released plugin) against the repository df-tools (`plugins/devflow/devflow/bin/df-tools.cjs`). The drafter criteria
run read-only against the real fleet repos. The `--run` criteria run only on scratch clones with stub tools first on
PATH, so no real suite runs and nothing reaches a database or builds a real binary. Then state the policy in the
user-facing docs, close the two todos, and record the committed-file refresh the new lint rule needs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Read first: the 71-01..71-04 SUMMARYs (`.planning/objectives/71-stack-drafter-and-verify-policy/71-0N-SUMMARY.md`),
especially 71-01's `## Fleet read-only check` and 71-02's harness diagnostics.

Names used below: `OLD=~/.claude/devflow/bin/df-tools.cjs`, `DF=<repo>/plugins/devflow/devflow/bin/df-tools.cjs`, `S` = a
scratch directory outside the repository (the session scratchpad, or `mktemp -d`). Shell variables do not survive
between Bash calls: write the literal paths in each command.

Doc locations (read narrowly):
- `CHANGELOG.md`: `## [Unreleased]` line 7; the objective 70 lead paragraph 9-13 (style: objective number and
  requirement IDs, one-sentence outcome, one mechanics sentence, the installed-plugin sentence); `### Added` 26,
  `### Changed` 70, `### Fixed` 89.
- `CLAUDE.md` line 68: the **Stack profile** bullet (`stack verify` checks each command, `--run` executes safe keys only
  and is effect-based …).
- `plugins/devflow/devflow/templates/stack.md` 149-152: the `stack verify` bullet in `<guidelines>`.
- `docs/USER-GUIDE.md` 435: the `df-tools stack init|validate|resolve|context|command` table row.
- `plugins/devflow/devflow/workflows/adopt.md` 150-160 (step 4 runs `stack verify --run --raw` unattended, step 5
  records discrepancies); `plugins/devflow/devflow/workflows/map-codebase.md` 372-376 (the same step, interactive).
- `plugins/devflow/devflow/bin/lib/help.cjs` 339-341: the `stack` usage line (no `verify` today).
- Todos: `.planning/todos/pending/2026-10-03-stack-drafter-self-test-and-buf-lint.md` and
  `.planning/todos/pending/2026-10-04-stack-verify-run-policy-services-and-artifacts.md`.
</context>

<embedded_context>

<codebase_examples>
CHANGELOG lead-paragraph style (objective 70, lines 9-13):
```
Objective 70 (TOOL-07, TOOL-08): three df-tools commands that reported success while doing nothing now do their job or
fail, and verify-commits.js blocks in the shape Claude Code reads. `state update-progress` writes the Progress line or
exits 1, … Entries that need an installed plugin take effect once the installed plugin carries objective 70.
```

The templates/stack.md bullet to extend (149-152):
```
- `df-tools stack verify` checks every command statically (binary resolves, runner target exists).
  `--run` executes only safe keys (`format`, `lint`, `typecheck`, `build`); `--include test,audit`
  opts heavier keys in. It never runs `codegen`, `deps`, an `apply` form or any push/deploy/apply
  command.
```

A stub tool for the scratch runs (each its own file, chmod 755):
```sh
#!/bin/sh
echo "$*" >> "<S>/stubs/npx.calls"
exit 0
```
A stub `go` that honours `-o` (SC-4): append `$*` to `go.calls`; when `$1` is `build`, find the word after `-o`,
`mkdir -p "$(dirname "$out")"` and write one line to it; exit 0.
</codebase_examples>

<anti_patterns>
- Never run `stack verify --run` in a real fleet checkout (`~/dev/<repo>`), never `stack init --write`, never commit
  in a fleet repo. `--run` runs only in scratch clones under `S`, with stubs first on PATH.
- Never let a real test suite or a real `go build` run: confirm `command -v npx go gofmt flutter` resolve to `S/stubs`
  under the PATH you pass before any `--run`.
- Do not describe internal function names (`selfTestArgs`, `linterToolOf`, `serviceSignals`, `isBuildOutput`) in
  USER-GUIDE, templates/stack.md or CLAUDE.md. Describe commands, flags, statuses and behaviour. The CHANGELOG may name
  files and TRDs.
- Do not repeat CHANGELOG text in CLAUDE.md (it is resident every turn: add the fewest words that keep it true).
- Do not tell readers to edit `.planning/` files by hand (`planning-writes.repo.test.cjs` fails CI on that); todos go
  through `df-tools todo add|complete`.
- Never use port 8080.
</anti_patterns>

<error_recovery>
- `OLD` rejects `--cwd` (too old) or lacks a command: run the before command from the target directory instead, or
  record "not available in the installed runtime" with the error's first line. The before half is context; the after
  half is the evidence.
- The scratch trades `test` is `not-resolved`: `npx vitest` needs `node_modules/.bin/vitest` (an executable stub; trades
  ignores `node_modules/`). Check with `stack verify --raw` (no `--run`) until `test` is `resolved`.
- The scratch eden-circle `client/` gate is `needs-pub-get`: create `client/.dart_tool/package_config.json`
  (`{"configVersion":2,"packages":[]}`; ignored by `client/.gitignore`).
- A doc guard fails (`doc-refs.repo.test.cjs`, `planning-writes.repo.test.cjs`): reword (current command names; verbs,
  not hand edits of `.planning/`) and rerun.
- The full suite fails outside the baseline: rerun the failing file alone. If it is a 71-01..71-04 file, record it and
  stop; this TRD does not patch code.
</error_recovery>

</embedded_context>

<gotchas>
- `git clone -q --depth 1 file://$HOME/dev/<repo> <S>/<repo>` reads the fleet repo and writes only under `S`. The clone
  has no ignored files (no `node_modules`, no `.dart_tool`), which is why the stubs and the package config are created.
- Pass PATH inline per command (`PATH=<S>/stubs:$PATH node <DF> --cwd <S>/trades stack verify …`): one plain command per
  Bash call (the worktree guard refuses compound commands it cannot verify).
- The installed runtime resolves tier profiles from the real HOME; keep the real HOME for both before and after.
- Baseline (70-03 SUMMARY): 11389 tests, 1 fail (`roadmap-reconcile.test.cjs` E2E1, transient). `micro.test.cjs` hangs
  on commit signing: use `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`.
- Commit with `df-tools commit`, never raw `git commit`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood SC-1..SC-4 (before on the installed runtime, after on the repository) and record landed state</name>
  <files>(none in the repository: evidence goes in the SUMMARY; scratch clones live under S)</files>
  <action>
1. Landed state: `git log --oneline -40` and `git merge-base --is-ancestor <last 71-0N commit> HEAD` for 71-01..71-04;
   `git ls-files plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs` exists.
2. SC-1 (read-only): `node <OLD> --cwd ~/dev/aodex stack init` and `node <DF> --cwd ~/dev/aodex stack init`; extract the
   `audit:` line of each `text` (or the `@file:` pointer's JSON). Record HEAD and `git -C ~/dev/aodex status
   --porcelain` before and after; they must match.
3. SC-2 (read-only): the same pair for `~/dev/justinforme` and `~/dev/smartWellness` (`lint:` line; OLD shows none,
   i.e. inherited) and `~/dev/dfip` (no `lint:` line in both). `rg -n "audit" plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs`
   (no aodex audit entry). `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` passes.
4. SC-3 (scratch): clone trades into `<S>/trades`; create `<S>/stubs/npx` (records calls, exits 0) and an executable
   `<S>/trades/node_modules/.bin/vitest` stub; confirm `PATH=<S>/stubs:$PATH command -v npx` is the stub and
   `node <DF> --cwd <S>/trades stack verify --raw` shows `test resolved`. Then, with that PATH:
   (a) `node <OLD> --cwd <S>/trades stack verify --run --keys test --include test --raw` -> the stub was called
   (`npx.calls` has a line): the old behaviour would have run the suite;
   (b) clear `npx.calls`; `node <DF> … --raw` -> `test resolved skipped=env_required`; `npx.calls` empty; also run it
   without `--raw` and record the result's `run.detail` (it names `.github/workflows/ci.yml`, the job and `postgres`);
   (c) `node <DF> … --allow-services --raw` -> `test resolved run=0 services=allowed`; `npx.calls` has one line.
5. SC-4 (scratch): clone eden-circle into `<S>/eden-circle`; stubs `go` (writes the `-o` file), `gofmt` (prints
   nothing) and `flutter` (records calls) in `<S>/stubs2`; create `client/.dart_tool/package_config.json`. Record
   `git -C <S>/eden-circle status --porcelain` before. Then with `PATH=<S>/stubs2:$PATH`:
   (a) `node <OLD> --cwd <S>/eden-circle stack verify --run --raw` -> the build line shows `mutated=1` and the
   `client/` Flutter line `skipped=side-effect-unsafe`;
   (b) clear `flutter.calls`; `node <DF> … --raw` -> the build line ends `mutated=1 build_outputs=1`, the `client/`
   Flutter gate shows `run=0`, and `flutter.calls` has a line; `bin/circle-api` is absent afterwards and the status
   equals the before value.
6. Write the evidence table into the SUMMARY: SC, command, before (OLD), after (DF), verdict; one row per sub-step.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
  </verify>
  <done>Every SC row has a before and an after output, the after half meets the criterion, every fleet checkout is
unchanged, and the scratch clones show no real suite or build ran (only stub call files changed).</done>
  <recovery>See error_recovery. If an after result does not meet its criterion, stop and report it as a gap of the TRD
that owns it (71-01 drafter, 71-02 tables, 71-03 services, 71-04 build outputs); do not patch code here.</recovery>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE, stack guide, workflows, help usage, todos; full suite</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, plugins/devflow/devflow/templates/stack.md, plugins/devflow/devflow/workflows/adopt.md, plugins/devflow/devflow/workflows/map-codebase.md, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
1. `CHANGELOG.md` `[Unreleased]`: a lead paragraph above objective 70's: "Objective 71 (SDR-09, SDR-10): the stack drafter
   drafts the gate that actually scans, and `stack verify --run` has a stated policy for tests that need services and
   builds that write artifacts." Then one mechanics sentence (self-test steps are skipped when the gate step exists; a
   `lint` target that runs the tier default plus unconditional linters such as `buf lint` is kept; a service-backed gate
   is skipped `env_required` unless `--allow-services`; a build's own output is removed and listed as `build_outputs`
   without stopping other components' gates) and the installed-plugin sentence. `### Added`: `stack verify
   --allow-services` and the `env_required` skip (71-03); CI steps record their job's `services` and env names
   (71-03). `### Changed`: the drafter self-test rule and the declared-linters rule (71-01); `aodex.audit` left the
   fleet ACCEPTED table and two refresh-pending OPEN rows were added, with a per-repo self-test guard (71-02); build
   outputs under `bin/ build/ dist/ out/ target/` no longer halt Dart/Flutter gates (71-04).
2. `CLAUDE.md` line 68: change `verify [--run]` to `verify [--run [--allow-services]]`, and after "Flutter runs with
   `--no-pub`" add "; a gate with a service signal (its text, the CI job that runs it, or for test/e2e a `.env.test`
   file) is skipped `env_required` unless `--allow-services`; a `build`'s new files under bin/build/dist/out/target are
   removed and listed as `build_outputs` without halting". After "`stack init` drafts from CI/runner/manifest evidence"
   add "(a gate's `--self-test` step never beats the gate; a `lint` target adding linters such as `buf lint` is kept)".
3. `templates/stack.md` `stack verify` bullet: append two sentences stating the policy for users: a gate whose
   command, task-runner body or script names a database or service (a `postgres://`-style URL, a `DATABASE_URL` or
   `*_DSN`-style variable, a loopback `host:port`), whose CI job runs it with `services:` or such variables, or (test,
   e2e) a `.env.test` file naming one, is skipped `env_required`, and `--allow-services` runs it against whatever is
   listening; a `build`'s new untracked files under `bin/`, `build/`, `dist/`, `out/` or `target/` are removed and
   listed as `build_outputs`, and do not stop later Flutter or Dart gates, while any other change is put back and does.
4. `docs/USER-GUIDE.md` 435: the command cell becomes `df-tools stack init\|validate\|resolve\|context\|command\|verify`;
   the purpose cell adds "`verify --run` runs safe gates; service-backed gates are skipped `env_required` unless
   `--allow-services`".
5. `workflows/adopt.md` step 5 and `workflows/map-codebase.md` step 5: one sentence each: an `env_required` skip is a
   finding (adopt: record it as a `low` confidence entry; map-codebase: tell the user), and is never re-run with
   `--allow-services` by this workflow.
6. `help.cjs` `stack` usage: add `| verify [--run] [--include a,b] [--keys a,b] [--timeout <s>] [--draft] [--allow-services]`
   before `> [--raw]`.
7. Todos: `node <DF> todo complete 2026-10-03-stack-drafter-self-test-and-buf-lint` and
   `node <DF> todo complete 2026-10-04-stack-verify-run-policy-services-and-artifacts`. Then write `<S>/refresh-todo.md`
   (frontmatter `title`, `area: stack-drafter`, `files: [plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs]`;
   body: justinforme and smartWellness committed STACK.md inherit `go vet ./...` while the drafter now writes `lint:
   make lint` (go vet + buf lint). Refreshing each file is a commit in that repo and needs the user's approval. After
   both land, remove their OPEN `pending: 'refresh'` rows; the harness then guards them as matches.) and run
   `node <DF> todo add --from <S>/refresh-todo.md`.
8. Full suite (micro exclusion if signing prompts). Compare with the baseline.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs
  </verify>
  <done>The doc-guard and help suites pass. `rg -n "Objective 71" CHANGELOG.md`, `rg -n "allow-services" CLAUDE.md
plugins/devflow/devflow/templates/stack.md docs/USER-GUIDE.md plugins/devflow/devflow/bin/lib/help.cjs` and
`rg -n "env_required" plugins/devflow/devflow/workflows/adopt.md plugins/devflow/devflow/workflows/map-codebase.md` hit.
The two todos are under `.planning/todos/completed/`, the refresh todo is under `.planning/todos/pending/`, and the full
suite shows no failure outside the baseline.</done>
  <recovery>If `doc-refs.repo.test.cjs` or `planning-writes.repo.test.cjs` flags new prose, reword it and rerun. If
`todo complete` cannot find a stem, list `.planning/todos/pending/` and pass the exact filename.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line)</test>
<test>npm test   (objective gate; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- The SUMMARY's evidence table has before/after rows for SC-1..SC-4, each after row meeting its criterion.
- `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` passes against `~/dev`.
- Every fleet checkout read in Task 1 has the same HEAD and `git status --porcelain` as before.
- The doc-guard suites pass and the full suite shows no failure outside the baseline.
</verification>

<success_criteria>
- Each success criterion of objective 71 is demonstrated with a command and its output, before and after.
- The policy for service-backed gates and build outputs is stated where users and agents read it.
- No todo for SDR-09/SDR-10 is left pending without a reason; the committed-file refresh is a recorded follow-up.
</success_criteria>

<output>
After completion, create `.planning/objectives/71-stack-drafter-and-verify-policy/71-05-SUMMARY.md` through
`df-tools summary post`, with the evidence table and the follow-up todo's path.
</output>
