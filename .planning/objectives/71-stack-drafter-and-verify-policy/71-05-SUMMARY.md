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
- [x] Task 1: Dogfood SC-1..SC-4 (before on the installed runtime, after on the repository) and record landed state — (this commit)
- [ ] Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE, stack guide, workflows, help usage, todos; full suite — next step: add the Objective 71 lead paragraph above objective 70's in /Users/justin/dev/devflow-claude/CHANGELOG.md `## [Unreleased]`, then the CLAUDE.md line 68 edits

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

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: dogfood SC-1..SC-4 | `node --test stack-drafter-fleet.test.cjs stack-verify-services.test.cjs stack-verify-run-guard.test.cjs` (95 tests, 94 pass, 1 skipped) | 0 | PASS |
