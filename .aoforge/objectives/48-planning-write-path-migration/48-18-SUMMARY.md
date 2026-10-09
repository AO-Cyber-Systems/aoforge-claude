---
objective: 48-planning-write-path-migration
trd: "18"
subsystem: prose (verify group)
tags: [planning-verbs, verification, uat, ratchet, GWP-02]
requires:
  - 48-04 (planning-audit scanner + per-group ratchet baselines)
  - 48-15 (verification post / doc put / todo add / planning draft / objective set-status CLI)
provides:
  - verify audit group at zero findings (verify.json holds only _comment)
  - verifier publishes VERIFICATION once via `verification post` from a single run draft
  - UAT lifecycle (verify-work, diagnose-issues, generated UAT) through `planning draft` + `doc put`
  - UI/design-debt todos through `planning draft` + `todo add --from --stem`
affects:
  - 48-23 (deletes baselines; verify group already zero)
  - 48-17 (orchestrator owns `objective set-status`; verifier prose now points there)
tech-stack:
  added: []
  patterns: [one draft per run published once, draft path noted literally across Bash calls, commit kept for local mode (store mode skips gitignored cache paths)]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/devflow/workflows/verify-work.md
    - plugins/devflow/skills/verify-work/SKILL.md
    - plugins/devflow/devflow/workflows/verify-objective.md
    - plugins/devflow/devflow/workflows/diagnose-issues.md
    - plugins/devflow/devflow/workflows/ui-eval.md
    - plugins/devflow/devflow/workflows/design-review.md
    - plugins/devflow/devflow/workflows/security-audit.md
    - plugins/devflow/skills/security-audit/SKILL.md
    - plugins/devflow/devflow/templates/UAT.md
    - plugins/devflow/devflow/templates/verification-report.md
decisions:
  - "The verifier does not set objective status or tick success criteria. That is the orchestrator's job, done with `objective set-status`. Adding a verifier-side set-status would change OBJECTIVE.md in local mode, which breaks the local-mode invariant."
  - "In store mode the verifier skips the legacy `gh comment --kind verification` and `gh close-issue` calls. `verification post` already queues the sticky comment, and `objective set-status complete` closes the issue. Legacy sync mode (local mode with github.enabled) keeps both calls."
  - "Top-level SECURITY-AUDIT.md stays a direct write. planning-paths classifies it as `runtime`, so `doc put` refuses it. Only an objective-scoped copy goes through `doc put objectives/<dir>/<NN>-SECURITY-AUDIT.md`."
  - "Evidence under objectives/<obj>/evidence/ (ui_eval judge/report JSON, design-review-report, screenshots) is `runtime` and stays a direct write. ui-evaluator, integration-checker and security-auditor needed no edits."
metrics:
  duration: ~11m
  completed: 2026-10-01
tokens_input: 7088718
tokens_output: 50861
tokens_cache_read: 6944159
tokens_cache_write: 144431
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 18: Prose migration — verify group Summary

**The verify flows now send every planning write through a df-tools verb:**

- The verifier keeps one VERIFICATION draft for the whole run. It publishes the draft once with `verification post` (store mode: the sticky `devflow:verification` comment).
- UAT create, update, diagnosis and generation go through `planning draft` + `doc put`.
- UI and design-debt todos go through `todo add --from <draft> --stem`.

In local mode each verb writes the same `.planning/` file as before. The `verify` audit group went from 15 findings to 0.

## Group counts (planning-writes ratchet, `verify`)

| File | Before (48-04 baseline) | After |
|---|---|---|
| agents/verifier.md | 7 | 0 |
| workflows/verify-work.md | 4 | 0 |
| workflows/diagnose-issues.md | 3 | 0 |
| templates/UAT.md | 1 | 0 |
| **Total** | **15** | **0** |

`verify.json` now holds only `_comment`. No inline allow markers were added: every finding was either rewritten to name a verb or reworded. The two existing EXEMPT entries (verifier and UAT.md, both describing the UAT generator refusing an overwrite) still match.

## What changed

- **verifier.md:**
  - Drift, orphan-flow notes and evidence (Steps 4.5, 8b and the shared evidence contract) are recorded into the one report rather than appended to the file.
  - Output is a three-step flow: `planning draft objectives/{dir}/{NN}-VERIFICATION.md`, fill the draft with Write, then `verification post "$OBJECTIVE_NUM" --from <draft>`.
  - Step 8d design-debt todos use `planning draft todos/pending/<date>-<slug>.md` + `todo add --from "$DRAFT" --stem <date>-<slug>`. The `commit` call is kept for local mode.
  - A generated Flutter UAT is published through `doc put`.
  - The GitHub sync section branches on `planning mode`.
  - A note says objective status is the orchestrator's to set, via `objective set-status`.
- **verify-work.md:**
  - The UAT draft is opened at session start and re-opened on resume.
  - Every batched write is "edit the draft, then `doc put`", stated once in `<update_rules>` and at create and complete time.
- **diagnose-issues.md:** the diagnosis goes into the shared UAT draft and is published with `doc put` before the existing commit.
- **templates/UAT.md:** the generator output is published with `doc put --from <generated file>`, and later edits go through draft + `doc put`.
- **verify-objective.md and verification-report.md:** both use the draft → `verification post` flow.
- **ui-eval.md and design-review.md:** the manifest and design-debt todos use `todo add --from <draft>`.
- **security-audit workflow and SKILL:** the runtime-class note, plus an optional objective-scoped `doc put`.
- **verify-work SKILL:** the Output line names the draft + `doc put` flow.

No write-verb line in these files redirects stderr. The two `init verify-work ... 2>/dev/null` lines in ui-eval.md and design-review.md are read-only `init` calls, not write verbs, so they were left unchanged.

## Deviations from Plan

**1. [Interpretation] `objective set-status` named as the orchestrator's route, not a new verifier write.**
- **Found during:** Task 1.
- **Issue:** Must-have 2 says the verifier sets status with `objective set-status`, but no file in this group ticked criteria or set status before. Adding a verifier call would write OBJECTIVE.md in local mode, which the local-mode invariant forbids.
- **Fix:** The verifier prose now states that status and criteria are the orchestrator's job, using `objective set-status <id> verifying|complete`. Store-mode GitHub sync defers the issue close to that verb.
- **Commit:** 89733709

**2. [Interpretation] Security-audit report stays a direct write.**
- **Found during:** Task 2.
- **Issue:** `.planning/SECURITY-AUDIT.md` classifies as `runtime` (no wiki page), so `doc put` refuses it. The audit is also standalone and has no objective.
- **Fix:** The workflow and SKILL document this. An objective-scoped copy goes through `doc put objectives/<dir>/<NN>-SECURITY-AUDIT.md`.
- **Commit:** 76dfe94b

**3. [Process] Preflight first ran from the main checkout.**
- **Issue:** The harness resets cwd between Bash calls, so the first `exec-context check` claimed the main checkout.
- **Fix:** I released only the 48-18 claim there (`exec-context release --id 48-18`). I then re-ran the check with `--cwd <worktree>`: `checkout` was the worktree, `is_worktree: true`, `base_visible: true`. No file was written before the corrected check.

**4. [Scope] Files not edited:** `agents/integration-checker.md`, `agents/ui-evaluator.md`, `agents/security-auditor.md`, `skills/ui-eval/SKILL.md` and `skills/design-review/SKILL.md`. Each had 0 findings and contains only runtime-path writes (evidence, `.security-audit-tmp/`) or reads.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED baseline + verifier/checker agents | `! node --test .../planning-writes.repo.test.cjs \| rg -q "agents/(verifier\|integration-checker\|ui-evaluator\|security-auditor)"` (failure list held only UAT.md, diagnose-issues, verify-work) | 0 | PASS |
| 2: workflows, skills, templates — group green | `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 (28/28) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test .../planning-writes.repo.test.cjs` with `verify.json` emptied | 1 (GATE lists 15 verify-group findings) | FAIL (correct) |
| GREEN (T1) | same | 1 (agents absent; 8 workflow/template findings left) | partial, as planned |
| GREEN (T2) | `node --test .../planning-writes.repo.test.cjs .../doc-refs.repo.test.cjs` | 0 (28/28) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |
| full suite | `npm test` (worktree) | 1 | 7425 pass, 32 skipped, 1 fail: MA-7 (`handoff-e2e.test.cjs:795`, known flaky, not fixed) |

roadmap-reconcile E2E1 is expected to fail once this SUMMARY exists while ROADMAP still shows `[ ]`. The run above was taken before the SUMMARY existed.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4. Truth 2's `objective set-status` clause is met as described in Deviation 1.
- Gate failures: none (MA-7 is a known flake)

## Commits

- 1416bb1f test(48-18): verify group must have zero planning writes
- 89733709 docs(48-18): verifier publishes through verification post
- 76dfe94b docs(48-18): verification flows use planning verbs

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json (only `_comment`)
- FOUND: commits 1416bb1f, 89733709, 76dfe94b on df/exec-48-18
- `rg -n "Write.*VERIFICATION" plugins/devflow/agents/verifier.md`: no matches. The only Write-tool instruction left is the draft-fill step.
