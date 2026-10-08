---
objective: 37-adopt-existing-repos
job: "12"
subsystem: testing
tags: [adopt, e2e, node, cli, simulated-run, idempotency, structural-checker]

requires:
  - objective: 37-01..37-11
    provides: the adopt skill, adopt.md/map-codebase.md workflows, adopt-cli.cjs, adopt.cjs, the node-cli/adopt-e2e-assert fixtures, and 37-11's proven command sequence for the Go-service fixture
provides:
  - "E2E proof (a), Node: the simulated run on a Node CLI fixture passes the structural checker, and a SECOND /devflow:adopt on the adopted repo routes to upgrade and changes nothing (idempotency)"
affects: [37-13]

tech-stack:
  added: []
  patterns:
    - "Task-tool-unavailable mapper fallback (reused from 37-11): perform each of the 4 mapper foci (tech, arch, quality, concerns) directly in sequence, writing the same 8 .planning/codebase/*.md documents the parallel agents would have written"
    - "Idempotency proof: snapshot the fixture before a second /devflow:adopt run, let preflight route to upgrade, run upgrade --check, then compare(after, before) and assert changed: []"

key-files:
  created:
    - ".planning/objectives/37-adopt-existing-repos/37-12-SUMMARY.md"
  modified: []

key-decisions:
  - "Ran the second `/devflow:adopt` invocation as the workflow's own three steps (preflight -> upgrade --check -> stop) rather than re-running the full adopt pipeline, exactly as adopt.md's upgrade route specifies — no re-scaffold was attempted."
  - "Reused 37-11's exact command sequence and cwd/HOME/--cwd discipline for the first run rather than re-deriving it, per this TRD's binding rules."

requirements-completed: ["ADP-06"]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: ~70min
completed: 2026-09-28
tokens_input: 4967063
tokens_output: 31513
tokens_cache_read: 4875204
tokens_cache_write: 91749
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 12: Simulated `/devflow:adopt` run — Node CLI, then adopt again (E2E proof a) Summary

**An agent followed the checkout's `skills/adopt/SKILL.md` + `workflows/adopt.md` verbatim, unattended, against a scratch Node-CLI fixture; the structural checker reports every check `ok: true` after the first run, and a second `/devflow:adopt` on the same fixture routes to `upgrade`, reports `up_to_date: true`, and leaves the fixture byte-identical (`compare` → `changed: []`) — no real repo or real `~/.claude` touched.**

## Runtime paths

- Fake HOME: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-12/home`
- Fixture repo (`$ARGUMENTS` / `$TARGET`): `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-12/node-cli`
- Invocation form: `[path]` from the repo root as cwd (cwd ≠ fixture) — every `df-tools.cjs` call used `--cwd "$TARGET"` from `/Users/justin/dev/devflow-claude`, with `HOME=<fake home>` prefixed to every `node`/`git` call touching the fixture.

## Setup

| Command | Result |
|---|---|
| `mkdir -p <scratch>/adopt-sim-37-12` | ok |
| `adopt-fixtures.cjs home <home>` | `{"home":"<home>"}` |
| `adopt-fixtures.cjs make node-cli <fixture> --home <home>` | `{"root":"<fixture>"}` |
| `ls -la ~/.claude/devflow/backups` (before) | `devflow-claude-d3dccfe9` only — saved to `real-backups-before.txt` |

Fixture contents (6 files, plain CommonJS Node, no runtime dependencies): `package.json` (`bin.todo`, `test`/`lint` scripts, no `build`), `bin/todo.js` (argv-dispatch CLI entry, shebang), `lib/store.js` (JSON-file persistence in `os.tmpdir()`), `lib/format.js` (pure display formatter), `test/store.test.js` (2 `node:test` cases, format-only), `README.md` (one line).

## RUN 1 — fresh adopt (workflow steps followed, adopt.md, verbatim, non-interactive)

| Step | Command | Result |
|---|---|---|
| `resolve_target` | n/a — target = fixture path (exists) | continue |
| `preflight` | `df-tools --cwd <fixture> adopt preflight` | `route: "adopt"`, `repo_state.state: "brownfield"` (not `scratch`, same as 37-11 — the fixture lives under `/private/tmp/...`, not a recognized scratch prefix), `is_scratch_dir: false` |
| `begin` | `df-tools --cwd <fixture> adopt begin` | `created_branch: true`, branch `devflow/adopt`, marker written, `base_sha: c5e775f` |
| `begin` (marker) | `df-tools --cwd <fixture> skill-active --start adopt` | `.planning/.skill-active` written |
| `map` | Task tool unavailable in this run → performed all 4 mapper foci (tech, arch, quality, concerns) directly, writing the same 8 documents to `<fixture>/.planning/codebase/` | STACK.md(45), INTEGRATIONS.md(38), ARCHITECTURE.md(42), STRUCTURE.md(47), CONVENTIONS.md(41), TESTING.md(40), PATTERNS.md(86), CONCERNS.md(52) — all >20 lines, none flagged short |
| `infer_project` | Wrote `<fixture>/.planning/PROJECT.md` (`kind: cli`, `default_work: feature`) and `<fixture>/.planning/.adopt-inferences.json` (12 entries: kind, default_work, core_value, 5 Validated, 4 Constraints) | kind=`cli` at **high** confidence (`package.json` `bin.todo` + shebang + argv-dispatch, no server evidence anywhere), default_work and core_value at **medium** (no repo doc states otherwise) |
| `scaffold` | `df-tools --cwd <fixture> adopt scaffold` | created `.planning/{STATE,ROADMAP,STACK}.md` + `CLAUDE.md`; `stack.action: "written"`, `ok: true`; upgrade migrations `0001`,`0003` applied; backup written under the **fake** home's `.claude/devflow/backups/node-cli-b7e0d682/...` |
| `health` | `df-tools --cwd <fixture> validate health --raw` | `status: "healthy"`, `errors: []` — repair step skipped (not needed) |
| `report` | `df-tools --cwd <fixture> adopt report` | `needs_review`: 3 rows — `no command evidence for 'build'` (low, none inferred), `default_work`→feature (medium), `core_value`→"Track to-dos from the shell (add/list/done) with zero-setup local JSON persistence" (medium); `redactions: 0`; `health_errors: []`; `commit_files`: 16 paths (all under `.planning/` or `CLAUDE.md`); `commit_message: "chore(devflow): adopt repository (DevFlow v2.10.1)"` |
| `commit` (end marker) | `df-tools --cwd <fixture> skill-active --end` | `removed: true` |
| `commit` | `df-tools --cwd <fixture> commit "chore(devflow): adopt repository (DevFlow v2.10.1)" --files <16 paths>` | `committed: true`, hash `46db75a` |
| `summary` | `git -C <fixture> log --oneline -3` (HOME=fake) | `46db75a chore(devflow): adopt repository (DevFlow v2.10.1)` / `c5e775f init` — exactly one adopt commit above `init` |

**No question was asked at any point.** The workflow reached its `summary` step unattended.

### Structural checker (RUN 1 acceptance command)

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
| `project_kind_valid` | true | kind="cli" default_work="feature" |
| `commit_contents` | true | 16 file(s), all under .planning/ or CLAUDE.md |
| `no_secrets` | true | clean |

### Needs-review rows (ADOPT-REPORT.md, from `adopt report` JSON, RUN 1)

| # | Field | Inferred | Confidence |
|---|---|---|---|
| 1 | `build` command evidence | (none) | low |
| 2 | default_work | feature | medium |
| 3 | core_value | "Track to-dos from the shell (add/list/done) with zero-setup local JSON persistence" | medium |

The "no command evidence for 'build'" row is the exact TRD gotcha: the fixture has `test`/`lint` scripts but no `build` script, and that correctly surfaces as a needs-review row rather than being silently invented or silently dropped. 10 `high`-confidence inferences (kind + 5 Validated + 4 Constraints) all landed in the accepted set. No secret-scan finding (0 redactions). Kind rubric landed on `cli` (evidence: `package.json` `bin.todo`, shebang, argv `switch`, zero server code) — the only kind with direct evidence; no other kind was plausible enough to record.

## RUN 2 — idempotency proof (same `$ARGUMENTS`, same fixture, after RUN 1's commit)

| Step | Command | Result |
|---|---|---|
| `snapshot` (before 2nd run) | `adopt-e2e-assert.cjs snapshot <fixture> --out before-second.json` | `{"ok":true,"out":"<path>"}` |
| `resolve_target` | n/a — same fixture path | continue |
| `preflight` | `df-tools --cwd <fixture> adopt preflight` | `route: "upgrade"`, `message: "already a DevFlow project"`, `repo_state.state: "devflow"` (`has_planning: true`, `has_codebase_map: true`) — the marker's full `steps`/`scaffold`/`inferences` from RUN 1 are still present, confirming state carried across the two runs |
| `upgrade --check` (per adopt.md's `upgrade` route) | `df-tools --cwd <fixture> upgrade --check` | `from: "2.10.1"`, `to: "2.10.1"`, `up_to_date: true`, `applied: []`, `pending: []`, `pending_confirm: []`, `skipped`: 6 migrations (0001-0006), each with a reason it no longer applies (config already nested, no legacy JOB.md, state.json exists, every objective dir has an OBJECTIVE.md, CLAUDE.md block v2 current, PROJECT.md already has `kind: cli`) |
| **stop** (per adopt.md: `pending_confirm` empty AND `pending` empty → nothing to apply, no commit, no re-scaffold) | — | workflow correctly stopped here; **no `adopt begin`/`scaffold`/`report`/`commit` was invoked in RUN 2** |
| `compare` | `adopt-e2e-assert.cjs compare <fixture> --before before-second.json` | `{"ok":true,"changed":[]}` — **exit 0**, byte-identical to the pre-run-2 snapshot |

**Finding:** `upgrade --check` reported `pending: []` and `up_to_date: true` on the very first check — the adopt scaffold in RUN 1 already stamped the project current (via its own internal `upgrade --apply` during `scaffold`), so RUN 2 needed no pending-auto-migration branch. This is the expected/best-case idempotency outcome per the TRD's task instructions, not the "finding" fallback branch (no additional error_recovery action needed).

**No question was asked at any point in RUN 2 either.** No branch was created, no commit was made, no `.planning/ADOPT-REPORT.md` was rewritten — `git log` on the fixture still shows exactly the two commits from RUN 1 (`46db75a` / `c5e775f`).

## Deviations

1. **[Expected, pre-declared, reused from 37-11] Task-tool mapper fallback.** `adopt.md`'s `map` step explicitly authorizes: *"If the Task tool is unavailable in this run, perform each mapper focus (tech, arch, quality, concerns) yourself in sequence instead of spawning agents."* As this executor agent cannot spawn subagents per this TRD's binding rules, all 4 mapper foci were performed inline in RUN 1, writing the same 8 `.planning/codebase/*.md` documents a parallel agent run would have produced. This is the only place the literal text could not be followed (a Task-tool spawn), and it is the exact fallback the workflow names.

No other deviations. No auto-fixes (Rules 1-3) were needed — every step succeeded on the first attempt in both runs.

## Real-home check

`ls -la ~/.claude/devflow/backups` before RUN 1 and after RUN 2 (i.e. spanning the entire simulation): identical — only `devflow-claude-d3dccfe9` present both times (`diff` of the two listings produced no output; saved at `<scratch>/adopt-sim-37-12/real-backups-before.txt` and `real-backups-after.txt`). The RUN-1 adopt-scaffold backup for the fixture landed under the **fake** home (`<fake home>/.claude/devflow/backups/node-cli-b7e0d682/...`), never the real one; RUN 2 wrote no backup at all (no `scaffold`/`upgrade --apply` executed).

## This repo's state

`git status --porcelain` in `/Users/justin/dev/devflow-claude` shows only the pre-existing untracked files named in this TRD's binding rules (`.planning/objectives/26-*`..`31-*`, `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`, `plugins/devflow/devflow/references/codex-agent-policy.md`) plus this SUMMARY.md — no code edits were made; no test-first fix was needed.

## Regression gate (baseline-relative)

Ran: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` from the repo root (via a self-contained `( cd /Users/justin/dev/devflow-claude && ... )` subshell, reusing 37-11's exact approach — this harness resets the Bash tool's cwd between calls, and the gate's globs/assertions are cwd-relative).

**Observed totals:** tests 3975, suites 568, pass 3942, fail 1, cancelled 0, skipped 32, todo 0.

**Failing test:** `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`.

**Classification: pre-existing.** This exact `file:line` + name pair is line 16 of `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` (confirmed by direct grep). No re-run or further investigation needed (TSV match is definitive per the gate's rule 3) — no candidate regressions, no fixes required, `baseline-failures.tsv` untouched. Identical result to 37-11's run of the same gate.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: First run — adopt on Node fixture | `adopt-e2e-assert.cjs check <fixture> --home <home>` | 0 | PASS (13/13 checks ok) |
| 2: Second run (idempotency) + SUMMARY | `adopt-e2e-assert.cjs compare <fixture> --before before-second.json` | 0 | PASS (`changed: []`) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| structural checker (RUN 1) | `adopt-e2e-assert.cjs check <fixture> --home <home>` | 0 | PASS |
| idempotency compare (RUN 2) | `adopt-e2e-assert.cjs compare <fixture> --before before-second.json` | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3 (DoD checker all-ok; idempotency route/up-to-date/no-op-compare; unattended/`[path]`-form/`HOME=<fake home>`/real-home-unchanged/this-repo-unchanged-except-SUMMARY)
- Gate failures: None (regression gate: 1 pre-existing failure, 0 regressions)

## Self-Check: PASSED

- FOUND: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-12/node-cli/.planning/ADOPT-REPORT.md`
- FOUND: fixture commit `46db75a` (`git -C <fixture> log` confirms)
- FOUND: `.planning/objectives/37-adopt-existing-repos/37-12-SUMMARY.md` (this file)
