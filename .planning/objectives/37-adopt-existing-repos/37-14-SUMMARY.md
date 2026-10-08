---
objective: 37-adopt-existing-repos
job: "14"
subsystem: testing
tags: [adopt, e2e, routing, refuse, new-project, upgrade, simulated-run]

requires:
  - objective: 37-01..37-13
    provides: the adopt skill, adopt.md workflow (preflight routing), upgrade runner, adopt-fixtures.cjs (devflow/empty/dirty kinds), adopt-e2e-assert.cjs (snapshot/compare)
provides:
  - "E2E proof (a), routing: an agent following the checkout's shipped adopt skill/workflow verbatim proves the already-DevFlow fixture routes to upgrade (never re-scaffolded), the empty fixture points at new-project, and the dirty fixture and a non-git directory refuse with their reason and are left byte-identical"
affects: [37-15]

tech-stack:
  added: []
  patterns:
    - "Routing-only cases stop at the preflight step of adopt.md without touching begin/map/scaffold — verified via snapshot/compare rather than the full structural checker, since nothing should change"

key-files:
  created:
    - ".planning/objectives/37-adopt-existing-repos/37-14-SUMMARY.md"
  modified: []

key-decisions:
  - "Ran the four routing cases in the TRD-specified order (dirty, non-git, empty, devflow) rather than skill-declaration order, since dirty/non-git are the highest-risk cases for accidental mutation and are best proven first"
  - "adopt-e2e-assert.cjs snapshot/compare work unmodified on the non-git fixture (pure content hash, no git call) — no 37-08 defect surfaced, so the gotcha's contingency (error_recovery) was not needed"

requirements-completed: ["ADP-06"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: ~45min
completed: 2026-09-28
tokens_input: 4081736
tokens_output: 27418
tokens_cache_read: 4008362
tokens_cache_write: 73274
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 14: Simulated `/devflow:adopt` routing cases — DevFlow, empty, dirty, non-git (E2E proof a) Summary

**An agent followed the checkout's `skills/adopt/SKILL.md` + `workflows/adopt.md` verbatim against four scratch fixtures. The already-DevFlow fixture routed to `upgrade` and was never re-scaffolded; the empty fixture routed to `new-project`; the dirty fixture and a non-git directory both refused with their reason and were left byte-identical. No question was ever asked.**

## Runtime paths

- Fake HOME: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-14/home`
- Fixtures (all under the session scratchpad, `S = .../scratchpad/adopt-sim-37-14`):
  - `S/dirty` — dirty go-service fixture
  - `S/not-a-repo` — plain scratch directory (one `main.go` written by this agent, no git)
  - `S/empty` — empty git repo, no source
  - `S/devflow` — go-service fixture pre-scaffolded as a DevFlow project, stamped `2.10.0`
- Invocation form: `[path]` from the repo root as cwd (cwd ≠ fixture) — every `df-tools.cjs` call used `--cwd "$TARGET"` from `/Users/justin/dev/devflow-claude`, with `HOME=<fake home>` prefixed to every `node`/`git` call touching a fixture.

## Setup

| Command | Result |
|---|---|
| `mkdir -p S` | ok |
| `adopt-fixtures.cjs home S/home` | `{"home":"S/home"}` |
| `adopt-fixtures.cjs make devflow S/devflow --home S/home` | `{"root":"S/devflow"}` |
| `adopt-fixtures.cjs make empty S/empty --home S/home` | `{"root":"S/empty"}` |
| `adopt-fixtures.cjs make dirty S/dirty --home S/home` | `{"root":"S/dirty"}` |
| `mkdir -p S/not-a-repo` + Write `S/not-a-repo/main.go` (`package main\n\nfunc main() {}\n`) | ok, no git init |
| `ls -la ~/.claude/devflow/backups` (real home, before) | `devflow-claude-d3dccfe9` only, dated Sep 27 19:33 — saved to `real-backups-before.txt` |

## Case 1 — Dirty (refuse, `dirty-tree`)

| Step | Command | Result |
|---|---|---|
| pre-check | `git -C S/dirty status --short` | ` M main.go` / `?? notes.txt` |
| snapshot before | `adopt-e2e-assert.cjs snapshot S/dirty --out S/dirty-before.json` | `{"ok":true}` |
| `resolve_target` | target = `S/dirty` (exists) | continue |
| `preflight` | `HOME=<home> node df-tools.cjs --cwd S/dirty adopt preflight` | exit **3**; `route: "refuse"`, `reason: "dirty-tree"`, `message: "the working tree has uncommitted changes: main.go, notes.txt"`, `next: "commit or stash them yourself, then re-run /devflow:adopt (adopt never stashes)"` |
| workflow stop | per `adopt.md` step `preflight`, `refuse` → print reason/next verbatim, stop | stopped; no further df-tools call made |
| compare after | `adopt-e2e-assert.cjs compare S/dirty --before S/dirty-before.json` | exit 0, `{"ok":true,"changed":[]}` |
| post-check | `git -C S/dirty status --short` | identical to pre-check: ` M main.go` / `?? notes.txt` |

**DoD met:** route `refuse`, reason `dirty-tree`, names `main.go` and `notes.txt`, tree unchanged.

## Case 2 — Non-git directory (refuse, `not-a-git-repo`)

| Step | Command | Result |
|---|---|---|
| snapshot before | `adopt-e2e-assert.cjs snapshot S/not-a-repo --out S/not-a-repo-before.json` | `{"ok":true}` — snapshot works on a non-git dir (pure content hash, skips `.git`; no 37-08 defect) |
| `resolve_target` | target = `S/not-a-repo` (exists) | continue |
| `preflight` | `HOME=<home> node df-tools.cjs --cwd S/not-a-repo adopt preflight` | exit **3**; `route: "refuse"`, `reason: "not-a-git-repo"`, `message: "S/not-a-repo is not a git repository"`, `git.is_repo: false`, `next: "run git init yourself first, then re-run /devflow:adopt"` |
| workflow stop | `refuse` → print reason/next verbatim, stop | stopped |
| compare after | `adopt-e2e-assert.cjs compare S/not-a-repo --before S/not-a-repo-before.json` | exit 0, `{"ok":true,"changed":[]}` |

**DoD met:** non-git directory refuses with `not-a-git-repo` and is unchanged.

## Case 3 — Empty (route `new-project`)

| Step | Command | Result |
|---|---|---|
| snapshot before | `adopt-e2e-assert.cjs snapshot S/empty --out S/empty-before.json` | `{"ok":true}` |
| `resolve_target` | target = `S/empty` (exists) | continue |
| `preflight` | `HOME=<home> node df-tools.cjs --cwd S/empty adopt preflight` | exit 0; `route: "new-project"`, `reason: null`, `message: "no source code yet"`, `repo_state.state: "greenfield"`, `code_files: 0`, `next: "/devflow:new-project (this repo has no source code yet)"` |
| workflow stop | `new-project` → say so, point at `/devflow:new-project`, stop | stopped; no further df-tools call made |
| compare after | `adopt-e2e-assert.cjs compare S/empty --before S/empty-before.json` | exit 0, `{"ok":true,"changed":[]}` |

**DoD met:** preflight returns `route: new-project`, workflow stops naming `/devflow:new-project`, no change.

## Case 4 — DevFlow (route `upgrade`, never re-scaffolded)

| Step | Command | Result |
|---|---|---|
| snapshot before | `adopt-e2e-assert.cjs snapshot S/devflow --out S/devflow-before.json` | `{"ok":true}` |
| git log before | `git -C S/devflow log --oneline` | `f557dfb init` |
| git branch before | `git -C S/devflow branch --list` | `* main` |
| `resolve_target` | target = `S/devflow` (exists) | continue |
| `preflight` | `HOME=<home> node df-tools.cjs --cwd S/devflow adopt preflight` | exit 0; `route: "upgrade"`, `reason: null`, `message: "already a DevFlow project"`, `repo_state.state: "devflow"`, `next: "df-tools --cwd <target> upgrade --check"` |
| `upgrade --check` | `HOME=<home> node df-tools.cjs --cwd S/devflow upgrade --check` | `from: "2.10.0"`, `to: "2.10.1"`, `up_to_date: false`, `pending`: `0001` (config.json nested-shape, `safety: auto`), `0003` (seed state.json, `safety: auto`); `pending_confirm: []` |
| `upgrade --apply` (pending, no pending_confirm → apply per workflow) | `HOME=<home> node df-tools.cjs --cwd S/devflow upgrade --apply` | applied `0001`, `0003`; `changed_files: [".planning/config.json", ".planning/state.json"]`; `up_to_date: true`; backup written under the **fake** home's `.claude/devflow/backups/devflow-4f1797f7/...` |
| commit (fixture's own path) | `HOME=<home> node df-tools.cjs --cwd S/devflow commit "chore(devflow): upgrade project to v2.10.1" --files .planning/config.json .planning/state.json` | `{"committed":true,"hash":"d2c9dac"}` |
| verify commit file list | `git -C S/devflow show --name-only --format=%s HEAD` | `chore(devflow): upgrade project to v2.10.1` / `.planning/config.json` / `.planning/state.json` — exactly equals `changed_files` |
| verify no re-scaffold | `git -C S/devflow branch --list` (after) | `* main` — no `devflow/adopt` branch created |
| verify no re-scaffold | `test -f S/devflow/.planning/ADOPT-REPORT.md` | absent |
| verify PROJECT/ROADMAP/STATE unchanged | `git -C S/devflow diff --stat f557dfb d2c9dac -- .planning/PROJECT.md .planning/ROADMAP.md .planning/STATE.md` | empty diff — byte-identical |
| verify exactly one commit | `git -C S/devflow log --oneline` (after) | `d2c9dac chore(devflow): upgrade project to v2.10.1` / `f557dfb init` — exactly one commit above `init` |
| verify up to date | `HOME=<home> node df-tools.cjs --cwd S/devflow upgrade --check` (re-run) | `from/to: "2.10.1"`, `up_to_date: true`, `pending: []`, `changed_files: []` |
| compare (full snapshot, expected to differ) | `adopt-e2e-assert.cjs compare S/devflow --before S/devflow-before.json` | exit 1 (as expected per TRD gotcha), `{"ok":false,"changed":[".planning/config.json",".planning/state.json"]}` — exactly the two files the upgrade commit touched, nothing else |

**DoD met:** preflight returns `route: upgrade`; never re-scaffolded (no `devflow/adopt` branch, no `ADOPT-REPORT.md`); PROJECT/ROADMAP/STATE byte-identical; exactly one `chore(devflow): upgrade project to v2.10.1` commit whose file list equals `changed_files`; `upgrade --check` reports up to date afterwards. The `compare` diff (`config.json`, `state.json`) matches the TRD's pre-declared gotcha exactly — it is the assertion, not a failure.

## Real-home check

| Check | Before | After |
|---|---|---|
| `ls -la ~/.claude/devflow/backups` | `devflow-claude-d3dccfe9` only | `devflow-claude-d3dccfe9` only |
| `diff real-backups-before.txt real-backups-after.txt` | — | **identical**, no lines differ |

No real `~/.claude` state was read or written by any command in this run; the DevFlow fixture's upgrade backup landed under the fake home (`S/home/.claude/devflow/backups/devflow-4f1797f7/...`).

## No question was asked

At no point across the four cases did the workflow call `AskUserQuestion` or otherwise prompt — routing decisions and refusals were all made from the preflight JSON alone.

## Deviations

None. Every step of `adopt.md`'s `resolve_target`/`preflight` (and, for the DevFlow case, `upgrade --check`/`--apply`/commit) ran and routed exactly as specified on the first attempt. No Rule 1-3 auto-fixes were needed, and the `error_recovery` contingency was never triggered — no case misrouted and no refused tree changed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Run the four routing cases | `adopt-e2e-assert.cjs compare S/dirty --before S/dirty-before.json` | 0 | PASS |
| 1: (non-git, empty compares) | `compare S/not-a-repo ...` / `compare S/empty ...` | 0 / 0 | PASS |
| 1: DevFlow case must_haves | branch/log/diff/upgrade-check checks above | 0 (all) | PASS |
| 2: Regression gate + SUMMARY | `compare S/empty --before S/empty-before.json` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| regression (baseline-relative) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 (1 known-baseline failure) | PASS (gate holds) |

## Regression Gate Detail

- Observed totals: **tests 3975, pass 3942, fail 1** (information only — counts are environment-dependent per the TRD's gate rule).
- Failing test: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` at `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3`.
- Classification: **pre-existing** — this exact `file:line` + name pair is line 16 of `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`. No re-run needed (direct TSV match); no code touched by this TRD exercises that path.
- No other failures observed. No new regressions. `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (already-DevFlow DoD, empty DoD, dirty DoD, non-git DoD, repo-root/`[path]`-form + fake-HOME + real-backups-unchanged DoD, regression gate)
- Gate failures: None (the one observed failure is pre-existing per baseline-failures.tsv)
