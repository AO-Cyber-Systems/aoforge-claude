---
objective: 37-adopt-existing-repos
job: "11"
subsystem: testing
tags: [adopt, e2e, go, simulated-run, structural-checker]

requires:
  - objective: 37-01..37-10
    provides: the adopt skill, adopt.md/map-codebase.md workflows, adopt-cli.cjs, adopt.cjs, the go-service/adopt-e2e-assert fixtures
provides:
  - "E2E proof (a): an agent following the checkout's shipped adopt skill/workflow verbatim, unattended, against a scratch Go-service fixture, passes the structural checker with every check ok"
affects: [37-12, 37-13]

tech-stack:
  added: []
  patterns:
    - "Task-tool-unavailable mapper fallback: perform each of the 4 mapper foci (tech, arch, quality, concerns) directly in sequence, writing the same 8 .planning/codebase/*.md documents the parallel agents would have written"

key-files:
  created:
    - ".planning/objectives/37-adopt-existing-repos/37-11-SUMMARY.md"
  modified: []

key-decisions:
  - "Ran the regression gate via a self-contained `( cd <repo> && node --test ... )` subshell, since this harness resets the Bash tool's cwd to the objectives directory between every call and the TRD's gate command uses cwd-relative globs and cwd-relative test assertions"

requirements-completed: ["ADP-06"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: ~90min
completed: 2026-09-28
tokens_input: 7871939
tokens_output: 39559
tokens_cache_read: 7771688
tokens_cache_write: 100081
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 11: Simulated `/devflow:adopt` run — Go service (E2E proof a) Summary

**An agent followed the checkout's `skills/adopt/SKILL.md` + `workflows/adopt.md` verbatim, unattended, against a scratch Go-service fixture; the structural checker (`adopt-e2e-assert.cjs check`) reports every check `ok: true`, exit 0, with no real repo or real `~/.claude` touched.**

## Runtime paths

- Fake HOME: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-11/home`
- Fixture repo (`$ARGUMENTS` / `$TARGET`): `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-11/go-service`
- Invocation form: `[path]` from the repo root as cwd (cwd ≠ fixture) — every `df-tools.cjs` call used `--cwd "$TARGET"` from `/Users/justin/dev/devflow-claude`, with `HOME=<fake home>` prefixed to every `node`/`git` call touching the fixture.

## Setup

| Command | Result |
|---|---|
| `mkdir -p <scratch>/adopt-sim-37-11` | ok |
| `adopt-fixtures.cjs home <home>` | `{"home":"<home>"}` |
| `adopt-fixtures.cjs make go-service <fixture> --home <home>` | `{"root":"<fixture>"}` |
| `ls -la ~/.claude/devflow/backups` (before) | `devflow-claude-d3dccfe9` only — saved to `real-backups-before.txt` |

Fixture contents (6 files, Go 1.22, stdlib-only HTTP service): `main.go` (`http.Server` on `:8091`), `internal/orders/{handler.go,store.go,handler_test.go}`, `go.mod`, `Makefile`, `README.md`, `.github/workflows/ci.yml`.

## Workflow steps followed (adopt.md, verbatim, non-interactive)

| Step | Command | Result |
|---|---|---|
| `resolve_target` | n/a — target = fixture path (exists) | continue |
| `preflight` | `df-tools --cwd <fixture> adopt preflight` | `route: "adopt"`, `repo_state.state: "brownfield"` (not `scratch` — expected per TRD gotcha, since the fixture lives under `/private/tmp/...`, not a recognized scratch prefix; adopt proceeded normally per 37-05), `is_scratch_dir: false` |
| `begin` | `df-tools --cwd <fixture> adopt begin` | `created_branch: true`, branch `devflow/adopt`, marker written |
| `begin` (marker) | `df-tools --cwd <fixture> skill-active --start adopt` | `.planning/.skill-active` written |
| `map` | Task tool unavailable in this run → performed all 4 mapper foci (tech, arch, quality, concerns) directly, writing the same 8 documents to `<fixture>/.planning/codebase/` | STACK.md(33), INTEGRATIONS.md(31), ARCHITECTURE.md(43), STRUCTURE.md(41), CONVENTIONS.md(42), TESTING.md(47), PATTERNS.md(92), CONCERNS.md(44) — all >20 lines, none flagged short |
| `infer_project` | Wrote `<fixture>/.planning/PROJECT.md` (`kind: api`, `default_work: feature`) and `<fixture>/.planning/.adopt-inferences.json` (12 entries: kind, default_work, core_value, 5 Validated, 4 Constraints) | kind=`api` at **high** confidence (direct `net/http` `ListenAndServe` evidence, no UI entrypoint); default_work and core_value at **medium** (no repo doc states otherwise) |
| `scaffold` | `df-tools --cwd <fixture> adopt scaffold` | created `.planning/{STATE,ROADMAP,STACK}.md`; `stack.action: "written"`, `ok: true`; upgrade migrations `0001`,`0003` applied; backup written under the **fake** home's `.claude/devflow/backups/go-service-ed5a394d/...` |
| `health` | `df-tools --cwd <fixture> validate health --raw` | `status: "healthy"`, `errors: []` — repair step skipped (not needed) |
| `report` | `df-tools --cwd <fixture> adopt report` | `needs_review`: 2 rows (`default_work`→feature, `core_value`→"Accept and return orders over HTTP reliably", both medium); `redactions: 0`; `health_errors: []`; `commit_files`: 16 paths (all under `.planning/` or `CLAUDE.md`); `commit_message: "chore(devflow): adopt repository (DevFlow v2.10.1)"` |
| `commit` (end marker) | `df-tools --cwd <fixture> skill-active --end` | `removed: true` |
| `commit` | `df-tools --cwd <fixture> commit "chore(devflow): adopt repository (DevFlow v2.10.1)" --files <16 paths>` | `committed: true`, hash `c2531d5` |
| `summary` | `git -C <fixture> log --oneline -3` (HOME=fake) | `c2531d5 chore(devflow): adopt repository (DevFlow v2.10.1)` / `4244165 init` — exactly one adopt commit above `init` |

**No question was asked at any point.** The workflow reached its `summary` step unattended.

## Deviations

1. **[Expected, pre-declared] Task-tool mapper fallback.** `adopt.md`'s `map` step explicitly authorizes: *"If the Task tool is unavailable in this run, perform each mapper focus (tech, arch, quality, concerns) yourself in sequence instead of spawning agents."* As this executor agent cannot spawn subagents per this TRD's binding rules, all 4 mapper foci were performed inline, writing the same 8 `.planning/codebase/*.md` documents a parallel agent run would have produced. This is the only place the literal text could not be followed (a Task-tool spawn), and it is the exact fallback the workflow names.

No other deviations. No auto-fixes (Rules 1-3) were needed — every step succeeded on the first attempt.

## Structural checker (acceptance command)

`HOME=<fake home> node .../adopt-e2e-assert.cjs check <fixture> --home <fake home>` → **exit 0**, `"ok": true`, all 13 checks `ok: true`:

| Check | ok | Detail |
|---|---|---|
| `branch_is_adopt` | true | HEAD branch: devflow/adopt |
| `one_commit` | true | commit count since base_sha: 1 |
| `tree_clean` | true | clean |
| `not_pushed` | true | no upstream; no remote branch contains HEAD |
| `health_no_errors` | true | errors: [] |
| `stack_valid` | true | ok |
| `roadmap_zero_objectives` | true | 0 entries under .planning/objectives |
| `claude_block_versioned` | true | v=2 src=claude-md |
| `stamp_current` | true | stamp version 2.10.1, expected 2.10.1 |
| `report_needs_review` | true | heading present; 2 low/medium field(s) accounted for |
| `project_kind_valid` | true | kind="api" default_work="feature" |
| `commit_contents` | true | 16 file(s), all under .planning/ or CLAUDE.md |
| `no_secrets` | true | clean |

## Needs-review rows (ADOPT-REPORT.md, from `adopt report` JSON)

| Field | Confidence |
|---|---|
| default_work | medium |
| core_value | medium |

No `high`-confidence field was flagged as needs-review (10 `high` inferences all landed in the accepted set). No secret-scan finding (0 redactions).

## Real-home check

`ls -la ~/.claude/devflow/backups` before and after the entire run: identical — only `devflow-claude-d3dccfe9` present both times (saved before-listing at `<scratch>/adopt-sim-37-11/real-backups-before.txt`). The adopt-scaffold backup for the fixture landed under the **fake** home (`<fake home>/.claude/devflow/backups/go-service-ed5a394d/...`), never the real one.

## This repo's state

`git status --porcelain` in `/Users/justin/dev/devflow-claude` shows only the pre-existing untracked files named in this TRD's binding rules (`.planning/objectives/26-*`..`31-*`, `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`, `plugins/devflow/devflow/references/codex-agent-policy.md`) plus this SUMMARY.md — no code edits were made; no test-first fix was needed.

## Regression gate (baseline-relative)

Ran: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` from the repo root (via a self-contained `( cd /Users/justin/dev/devflow-claude && ... )` subshell — this harness resets the Bash tool's cwd to the objectives directory between calls, and the gate's globs/assertions are cwd-relative, so the bare relative-path invocation returned 0 matched tests on the first attempt until run from the true repo root).

**Observed totals:** tests 3975, suites 568, pass 3942, fail 1, cancelled 0, skipped 32, todo 0.

**Failing test:** `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`.

**Classification: pre-existing.** This exact `file:line` + name pair is line 16 of `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`. No re-run or further investigation needed (TSV match is definitive per the gate's rule 3) — no candidate regressions, no fixes required, `baseline-failures.tsv` untouched.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (DoD checker all-ok; unattended/no-questions; `[path]` form from repo root with `--cwd`; no real repo/home touched; this repo unchanged except SUMMARY)
- Gate failures: None (regression gate: 1 pre-existing failure, 0 regressions)

## Self-Check

- FOUND: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-11/go-service/.planning/ADOPT-REPORT.md`
- FOUND: fixture commit `c2531d5` (`git -C <fixture> log` confirms)
- FOUND: `.planning/objectives/37-adopt-existing-repos/37-11-SUMMARY.md` (this file)
