---
objective: 50-github-enforcement-and-setup
verified: 2026-10-01T18:20:00Z
status: passed
score: 4/4 success criteria verified (13/13 TRDs' must-haves verified)
gaps: []
notes:
  - kind: orchestrator_action_required
    note: "ROADMAP.md line 297 still has `- [ ] 50-13-...` although 50-13-SUMMARY.md is committed. roadmap-reconcile.test.cjs E2E1 (self-test: zero drift in this repo's ROADMAP) fails on exactly that one line. Tick 50-13 (the usual `docs(50): wave 5 roadmap progress` step) and E2E1 passes. Bookkeeping, not code."
  - kind: environmental
    note: "handoff-e2e.test.cjs MA-7 fails identically at faa79fe5 (the commit before objective 50): a real /opt/homebrew/bin/doctl returns {status:done, exit_code:0}. Pre-existing and environmental."
  - kind: flake
    note: "planning-writes.audit.test.js test 10 (upgrade-project.js fast path) hit spawnSync EPIPE once under full-suite load; it passes 2/2 when run on its own."
  - kind: warning
    note: "Printed `df-tools commit` follow-ups are refused by the GEN-01 gate in store mode (default or unlinked branch). Affected: migration 0010, doctor check 20, and gh-setup-cli.cjs:92 (objective 50's own output: 'Commit them on a branch...'). Judged not a gap; see the report. Recommended todo: make these instructions gate-aware."
  - kind: warning
    note: "Gate refusal messages (gh-gate.cjs) point to `gh pr start` but do not mention the DEVFLOW_SKIP_GH_GATE=1 escape. The USER-GUIDE documents it."
---

# Objective 50: GitHub enforcement and setup — Verification Report

**Objective goal:** Branch and PR discipline is enforced locally and on GitHub, and `df-tools gh setup` configures a repository for it.
**Verified:** 2026-10-01
**Status:** passed
**Re-verification:** No, this is the initial verification.

## Success criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | A commit on the default branch or an unlinked branch is refused locally; the escape is logged | VERIFIED | Independent probe (temp repo, fake HOME, failing gh shim) through the real `df-tools commit`. On `main`: `default_branch`, exit 1, index empty, HEAD unchanged. On `feature-x`: `unlinked_branch`, exit 1, index empty. With `DEVFLOW_SKIP_GH_GATE=1` the commit lands, `.planning/.override-log.jsonl` gets `{"gate":"gh","reason":"env DEVFLOW_SKIP_GH_GATE=1 (unlinked_branch on feature-x)"}`, and `override --list` shows it. In local mode on `main` the commit lands. Zero gh calls. |
| 2 | `gh setup --dry-run` prints the exact rulesets/types/fields it would create; apply is idempotent | VERIFIED | `df-tools gh setup` is dispatched at df-tools.cjs:1132 and listed in the unknown-subcommand list and in help. Independent probe against the fake: the dry-run prints every action with its exact `gh` command and JSON payload: repo settings, 6 labels, 5 issue types, the `work`/`kind` single-select fields, workflow, PR template, and a ruleset on `~DEFAULT_BRANCH` with deletion, non_fast_forward, pull_request, required_status_checks (`devflow/linked-issue`, `devflow/planning-consistency`) and merge_queue (SQUASH). Then "Dry run ... nothing was changed", 0 writes, no `.github/`. The first `--apply` makes 15 writes. The second makes 0 writes ("18 already in place, 1 advisory") and leaves the files byte- and mtime-identical. With the merge queue refused (422), the ruleset is applied without it, the run reports "merge queue unavailable on this plan" and exits 0, and a second apply makes 0 writes. Only `--refresh` retries it, which is by design. |
| 3 | The linked-issue check fails a PR without a closing reference | VERIFIED | Independent probe of `gh-check-cli.main(['linked-issue'])` with hand-built events. An empty body and a body that only says "Related to #3" both post `devflow/linked-issue:failure` and exit 1. `Fixes #3` and `this resolved #3` post success and exit 0. `Closes #99` (no such issue) fails, and `Closes #3` against base `dev` fails because `dev` is not the default branch. |
| 4 | `npm test` green | VERIFIED (with a caveat) | Full suite at HEAD: 8299 tests, 8264 passed, 3 failed, 32 skipped. Each failure was triaged. MA-7 is pre-existing and environmental. EPIPE is a load flake that passes alone. E2E1 is the unticked 50-13 roadmap box, which the orchestrator must tick. No failure comes from objective 50 code. The 17 objective-50 test files on their own: 517/517 pass. |

**Score:** 4/4

## TRD must-haves

| TRD | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| 50-01 fake GitHub routes | GEN-04, GEN-05 | VERIFIED | gh-fake.test.cjs passes. The probes used `mergeQueueAllowed:false` and got the 422 path. |
| 50-02 gate decision | GEN-01 | VERIFIED | gh-gate.cjs `evaluateGate`/`readGateInputs`; `df/exec-*` inherits the main checkout's objective; the escape only applies to refusals; override.cjs:32 `gh: null`. Tests pass. |
| 50-03 check logic | GEN-05 | VERIFIED | gh-check.test.cjs passes; the SC3 probe confirms closing-reference parsing and the base-branch rule. |
| 50-04 store health | GEN-03 | VERIFIED | gh-health.test.cjs passes (W057-W061, local mode not applicable, never calls gh). |
| 50-05 gh-flush hook | GEN-02 | VERIFIED | Registered in hooks.json under PostToolUse(Bash) at :50 and Stop at :126. gh-flush.test.js passes, including the fail-open cases. |
| 50-06 gate wiring | GEN-01 | VERIFIED | misc.cjs:623-637 gates in store mode before `git add`; escape logging at :773-780; `refsFor` objective fallback. misc-commit-gate and commit-trailer tests pass; the SC1 probe confirms. |
| 50-07 health/doctor | GEN-03 | VERIFIED | validate.cjs Check 16 at :723; doctor 25-gh-store-sync; 22-validate-health defers W057-W061 at :25. Tests pass. |
| 50-08 check runner | GEN-05 | VERIFIED | gh-check-cli.test.cjs passes; the SC3 probe confirms. |
| 50-09 setup plan | GEN-04 | VERIFIED | gh-setup.test.cjs passes; the dry-run output matches the payload truths. |
| 50-10 workflows/templates | GEN-04, GEN-05 | VERIFIED | devflow-checks.yml is `workflow_call` with 3 jobs running gh-check-cli.cjs and `create-github-app-token@v3` with `client-id`, gated on the input. The caller template is `# devflow:managed` with pull_request and merge_group triggers. The PR template carries the managed markers and `Closes #`. The repo test passes. |
| 50-11 apply + CLI | GEN-04 | VERIFIED | Apply and CLI tests pass; the SC2 probe confirms. config.json has `app_id` and `checks_workflow`. |
| 50-12 e2e + parity | GEN-01..05 | VERIFIED | gh-enforcement.e2e and parity tests pass. |
| 50-13 docs + suite | GEN-01..05 | VERIFIED | CLAUDE.md, CHANGELOG, USER-GUIDE (16 hits), proposal and the gh-sync skill document the gate, `gh setup` and W057-W061. The help skill was left unchanged, which is justified: it enumerates no gh verbs, and the df-tools help string lists `gh setup`. |

## Requirements coverage

There is no `.planning/REQUIREMENTS.md`. ROADMAP.md:277 defers to OBJECTIVE.md for GEN-01..GEN-05.

| ID | Claimed by | Status |
|----|-----------|--------|
| GEN-01 | 50-02, 50-06, 50-12, 50-13 | SATISFIED (SC1 probe) |
| GEN-02 | 50-05, 50-12, 50-13 | SATISFIED (hook tests, e2e flush then no W057) |
| GEN-03 | 50-04, 50-07, 50-12, 50-13 | SATISFIED |
| GEN-04 | 50-01, 50-09, 50-10, 50-11, 50-12, 50-13 | SATISFIED (SC2 probe) |
| GEN-05 | 50-01, 50-03, 50-08, 50-10, 50-12, 50-13 | SATISFIED offline. Live run on a real repo is an open item recorded in the proposal. |

No requirements are orphaned.

## Open item judgment: printed `df-tools commit` instructions vs GEN-01

**Decision: not a gap. Recorded as a warning with a recommended follow-up.**

- SC1 and GEN-01 require the gate to refuse these commits, and it does. The refusal is GEN-01 working, not contradicting itself. It applies only in store mode, never in the D-01 local default.
- No user is stranded. The refusal is explicit (reason plus `gh pr start` hint). The escape exists and is logged. The USER-GUIDE, CHANGELOG and proposal document the case. upgrade-project.js already reports a refused background commit as "not committed ... commit them yourself" instead of failing.
- It is still a real UX defect. Following the instruction exactly fails. The worst case is gh-setup-cli.cjs:92, which is objective 50's own output: "Commit them on a branch ... df-tools commit ...". On an unlinked branch in store mode, the objective's own gate refuses that.
- The same bootstrap hazard (the workflow must reach the default branch before the ruleset can be satisfied) is already documented as an open item.

Recommended todo: make the three printed instructions gate-aware. In store mode, either prefix `DEVFLOW_SKIP_GH_GATE=1` or say "on a linked objective branch (`df-tools gh pr start`)". Also mention the escape in gh-gate.cjs refusal messages.

## Anti-patterns

| File | Line | Pattern | Severity |
|------|------|---------|----------|
| gh-setup-cli.cjs | 92 | Instruction refused by the gate in store mode | Warning |
| migrations/0010-store-gitignore.cjs | 67 | Same | Warning (predates objective 50) |
| doctor-checks/20-legacy-runtime-state.cjs | 36 | Same | Warning (predates objective 50) |

## Functional verification

Not applicable: no UI. Backend CLI probes stand in for it. Probe scripts were kept in the session scratchpad: sc1-probe.sh, sc2-probe.cjs, sc3-probe.cjs. No real GitHub API was used, the real ~/.claude was not touched, and no port was bound.

## Human verification

None is required for this objective's goal. Live behaviour of the reusable workflow and the status contexts on a real GitHub repo is an acknowledged open item in the proposal and is out of scope here.

## Gaps summary

None. Before marking the objective complete, the orchestrator must tick 50-13 in ROADMAP.md so that roadmap-reconcile E2E1 passes.

---

_Verified: 2026-10-01_
_Verifier: Claude (verifier)_
