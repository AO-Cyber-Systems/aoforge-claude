---
objective: 71-stack-drafter-and-verify-policy
trd: "05"
subsystem: stack-drafter
tags: [dogfood, docs, stack-init, stack-verify, run-policy, changelog]
requires:
  - objective: 71-stack-drafter-and-verify-policy
    provides: "71-01 drafter rules, 71-02 fleet tables, 71-03 service policy, 71-04 build outputs"
provides:
  - "SC-1..SC-4 shown as before (installed runtime) and after (repository df-tools) pairs"
  - "the drafter rules and the --run policy stated in CHANGELOG, CLAUDE.md, USER-GUIDE and the stack guide"
affects: []
key-files:
  created: []
  modified:
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - plugins/devflow/devflow/templates/stack.md
    - plugins/devflow/devflow/workflows/adopt.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/devflow/bin/lib/help.cjs
key-decisions: []
requirements-completed: [SDR-09, SDR-10]
completed: 2026-10-08
---

# Objective 71 TRD 05: Dogfood SC-1..SC-4 and document the policy Summary

Each success criterion of objective 71 is shown as a before (installed runtime) and after (repository df-tools) command pair against the real fleet (read-only) and scratch clones with stub tools; the policy is then stated where users and agents read it.

## Progress
- [x] Task 1: Dogfood SC-1..SC-4 (before on the installed runtime, after on the repository) and record landed state — ab375aef
- [x] Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE, stack guide, workflows, help usage, todos; full suite — (this commit)

## Landed state

71-01..71-04 are ancestors of HEAD (`git merge-base --is-ancestor` exit 0 for dc8f7b34, 9317a233, cc7b5421, 1241b09e) and `stack-verify-services.test.cjs` is tracked at HEAD.

## Evidence (Task 1)

`OLD` = `~/.claude/devflow/bin/df-tools.cjs` (installed plugin). `DF` = `plugins/devflow/devflow/bin/df-tools.cjs` (repository). `S` = the session scratchpad. Stubs are first on PATH for every `--run`; `command -v` was checked to resolve each tool to `S/stubs` or `S/stubs2` before any run. For each fleet repo, `HEAD` plus `git status --porcelain=v1 -uall` was hashed before and after (`S/snap.sh`); the four hashes are identical.

| SC | Command | Before (OLD) | After (DF) | Verdict |
|---|---|---|---|---|
| SC-1 | `stack init --raw` in `~/dev/aodex` | `audit: { run: "bash scripts/check-govulncheck.sh --self-test", cwd: "go" }` | `audit: { run: "bash scripts/check-govulncheck.sh", cwd: "go" }`; the self-test is a `self_test` note (`... the step bash scripts/check-govulncheck.sh runs it as the gate, so this never fills audit`). aodex HEAD c4214932..., status hash 3918c3ec... before and after | met |
| SC-2a | `stack init --raw` in `~/dev/justinforme` | no `lint` line (inherited) | `lint: { run: "make lint" }`, note `root lint: make lint - info (runs the go default go vet ./... and buf lint; the target is the lint entry point)` | met |
| SC-2b | same in `~/dev/smartWellness` | no `lint` line (inherited) | `lint: { run: "make lint" }` | met |
| SC-2c | same in `~/dev/dfip` | no `lint` line | no `lint` line (build and test only), unchanged | met |
| SC-2d | `rg -n "audit" __fixtures__/stack-fleet-tables.cjs` | n/a | hits: header comment line 38 (explains `aodex.audit` left ACCEPTED) and a `npm ci --no-audit` reason on line 71; no aodex `audit` entry | met |
| SC-2e | `node --test stack-drafter-fleet.test.cjs` against `~/dev` | n/a | 50 tests, 49 pass, 0 fail, 1 skipped (aoedge has no committed STACK.md); `OPEN, refresh pending (conflict): lint` for justinforme and smartWellness | met |
| SC-3a | `stack verify --run --keys test --include test --raw` in scratch `trades` (stub `npx`, stub `node_modules/.bin/vitest`) | `test resolved run=0`; `npx.calls` = `vitest --run` (the suite would have run) | n/a | context |
| SC-3b | same, repository df-tools | n/a | `test resolved skipped=env_required`; `npx.calls` does not exist. JSON `run.detail`: ``CI job `test` (.github/workflows/ci.yml) runs it with services postgres; CI job `test` (.github/workflows/ci.yml) runs it with env DATABASE_URL (pass --allow-services to run it against whatever service is listening)`` | met |
| SC-3c | same plus `--allow-services` | n/a | `test resolved run=0 services=allowed`; `npx.calls` = one line, `vitest --run` | met |
| SC-4a | `stack verify --run --raw` in scratch `eden-circle` (stub `go`, `gofmt`, `flutter`, plus a no-op `dart`) | `build resolved run=0 mutated=1`; `lint@client/` and `format@client/` `skipped=side-effect-unsafe`; no `flutter.calls` | n/a | context |
| SC-4b | same, repository df-tools | n/a | `build resolved run=0 mutated=1 build_outputs=1`; `lint@client/ resolved run=0`, `format@client/ resolved run=0`; `flutter.calls` = `analyze --fatal-infos --no-pub`; `bin/circle-api` absent; scratch `git status --porcelain` empty before and after | met |

Scratch `trades` and `eden-circle` clones both end with an empty `git status --porcelain`. The only files written were the stub call files (`npx.calls`, `go.calls`, `flutter.calls`) and the stubs themselves, under `S`.

## Observation (not a gap)

On scratch `eden-circle` the repository df-tools also skips the root `lint` (`go vet ./...`) as `env_required` where the installed runtime ran it: ``CI job `go` (.github/workflows/ci.yml) runs it with services postgres``. That is the CI-job layer working as stated (the gate's job declares a service container), so a `go vet` that needs no database is skipped on the safe side and `--allow-services` runs it. It does not affect SC-4 (build and `client/` gates).

## What changed (Task 2)

- **`CHANGELOG.md` `[Unreleased]`:** an "Objective 71 (SDR-09, SDR-10)" lead paragraph above objective 70's (outcome, one mechanics sentence, the installed-plugin sentence). `### Added`: `stack verify --allow-services` and the `env_required` skip, and the `services` / `envNames` on CI steps (71-03). `### Changed`: the drafter self-test rule and declared-linters rule (71-01); `aodex.audit` leaving ACCEPTED, the two refresh-pending OPEN rows and the per-repo self-test guard (71-02); build outputs no longer halting Dart/Flutter gates (71-04).
- **`CLAUDE.md` Stack profile bullet:** `verify [--run [--allow-services]]`, the self-test and lint-target drafter rules, the `env_required` / `--allow-services` rule and `build_outputs`. No internal function names.
- **`templates/stack.md`:** the `stack verify` bullet states the service policy (what counts as a signal, `env_required`, `--allow-services`) and the build-output rule in command terms.
- **`docs/USER-GUIDE.md`:** the `df-tools stack` row now lists `verify` and the `--run` / `--allow-services` behaviour.
- **`workflows/adopt.md` and `workflows/map-codebase.md`:** one sentence each in the `stack verify --run` step: an `env_required` skip is a finding (adopt: a `low` confidence entry; map-codebase: tell the user) and is never re-run with `--allow-services` by the workflow.
- **`bin/lib/help.cjs`:** `df-tools stack --help` lists `verify [--run] [--include a,b] [--keys a,b] [--timeout <s>] [--draft] [--allow-services]`, matching `flag-spec.cjs`.
- **Todos:** `2026-10-03-stack-drafter-self-test-and-buf-lint` and `2026-10-04-stack-verify-run-policy-services-and-artifacts` completed (`.planning/todos/completed/`). New follow-up: `.planning/todos/pending/2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint.md` (refreshing the committed STACK.md in justinforme and smartWellness so `lint` is `make lint` is a commit in each repo and needs the user; afterwards the two OPEN `pending: 'refresh'` rows come out of `stack-fleet-tables.cjs`). No fleet repository was edited.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: dogfood SC-1..SC-4 | `node --test stack-drafter-fleet.test.cjs stack-verify-services.test.cjs stack-verify-run-guard.test.cjs` (95 tests, 94 pass, 1 skipped) | 0 | PASS |
| 2: docs, help, todos | `node --test doc-refs.repo, planning-writes.repo, rg-flag-guard, builtin-status.repo, help, dispatch-completeness` (85 tests) | 0 | PASS (after one reword, see Deviations) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, Task 1) | `node --test` fleet harness + services + run-guard suites (95 tests) | 0 | PASS |
| test (scoped, Task 2) | doc-guard, help and dispatch-completeness suites (85 tests) | 0 | PASS |
| test (full, main checkout, fleet harness against `~/dev`, `micro.test.cjs` excluded) | `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 11452 tests, 11416 pass, 1 fail, 35 skipped |

The one full-suite failure is `roadmap-reconcile.test.cjs` E2E1 (the 70-03 baseline failure): it reports `trd_summary_exists` for `71-05` because the checkpoint SUMMARY exists while the ROADMAP row is still `[ ]`. It clears after `roadmap update-job-progress` in the state step (same as 71-02). Nothing else failed, including the 8 to 12 environmental `devflow-watch` / `handoff-e2e` failures earlier TRDs saw in worktrees: this ran in the main checkout. `micro.test.cjs` was excluded as the TRD advises.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `dispatch-completeness.test.cjs` read two CLAUDE.md spans as commands**
- **Found during:** Task 2 verify
- **Issue:** the Core Tool section parser takes the first word of every backtick span in a `- **` bullet as a command name. The TRD's CLAUDE.md wording put `lint`, `buf lint` and `build` in backticks, so test 5 failed (`lint`, `buf` and `build` are not COMMANDS keys).
- **Fix:** reworded those three spans to plain text ("a lint target adding linters such as buf lint is kept"; "a build gate's new files under bin/build/dist/out/target ..."). The substance is the TRD's. `env_required` and `build_outputs` stay in backticks (the underscore keeps them out of the pattern).
- **Files modified:** `CLAUDE.md`
- **Commit:** (this task's commit)

### Additions beyond the written steps

- Task 1 SC-4 scratch run: a no-op `dart` stub beside `go`, `gofmt` and `flutter` (the `client/` format and fix gates call `dart`); the TRD named three stubs. Same hermeticity reason as 71-04.
- Task 1 SC-3 JSON run (no `--raw`) and a second `--keys lint,build` run on scratch eden-circle to read the root `lint` skip detail (see the Observation above).

## Known follow-ups

- Refresh the committed STACK.md in justinforme and smartWellness (todo above; needs the user).
- The CI-job layer treats any gate that shares a CI job with `services:` as service-backed, so `go vet ./...` in eden-circle's `go` job is skipped `env_required` (safe side); a gate-level override is `--allow-services`. Not changed here: 71-03 owns that rule.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the CLAUDE.md wording, Rule 3)
- Must-haves verified: 7/7 (SC-1 to SC-4 before/after rows; 71-01..71-04 ancestors of HEAD; CHANGELOG, CLAUDE.md, USER-GUIDE and stack guide state the rules; adopt.md and map-codebase.md carry the `env_required` sentence; `stack --help` lists `verify` with `--allow-services`; two todos completed and one added)
- Gate failures: None in scope (1 documented baseline transient, E2E1, cleared by the roadmap step)
