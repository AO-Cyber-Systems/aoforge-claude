---
objective: 55-store-live-smoke-fixes
trd: "06"
subsystem: github-store
tags: [gh-setup, rulesets, github-actions, reusable-workflow, live-smoke]

requires:
  - objective: 55-01
    provides: ruleset admin bypass + devflow-ref follows checks_workflow pin
  - objective: 55-02
    provides: sparse checkout includes references/ for the check runner
provides:
  - live proof that a setup-created ruleset lets the workflow PR merge with `gh pr merge <n> --admin --squash`
  - live proof that the check runner loads from the sparse checkout (0 ENOENT, real verdicts)
  - 55-6 bootstrap minor closed by `upgrade --apply` (state.json seeded, project stamped 2.13.1)
affects: [55-07, 55-08]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 1 = A (push-branch), user answer relayed by orchestrator: feat/stack-profile-loader pushed to origin; the smoke repo pins the pushed SHA d4147b8c1dd00af210b09a90c2af87dce0bf1010"

patterns-established: []

requirements-completed: ["55-1", "55-4", "55-6"]

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 4min
completed: 2026-10-05
tokens_input: 6964953
tokens_output: 31083
tokens_cache_read: 6845208
tokens_cache_write: 119591
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 55 TRD 06: Live setup re-run Summary

**On AO-Cyber-Systems/devflow-store-smoke, `gh setup --apply` re-created the default-branch ruleset (id 24502205) with the repository-admin bypass, the caller workflow pins devflow-claude@d4147b8c on both `uses:` and `devflow-ref:`, the DevFlow jobs posted real verdicts with 0 ENOENT, and workflow PR #6 merged with `gh pr merge 6 --admin --squash`.**

## Performance

- Started: 2026-10-05T12:19:04Z
- Completed: 2026-10-05T12:23:02Z
- Duration: ~4 min
- Tasks: 3 (1 decision, 2 live-ops); files in this repository: SUMMARY only

## Progress
- [x] Task 1: Approve the push that makes the fixed workflow reachable — decision A (push-branch), user answer relayed by orchestrator (no commit: decision only)
- [x] Task 2: Push, bootstrap the smoke clone, re-create the ruleset with `gh setup --apply` — c7498b7f
- [x] Task 3: Merge the workflow PR with the printed admin-bypass command; the checks run without ENOENT — c61e266f

## Task 1 facts (reads only)

- Decision: **A (push-branch), user answer relayed by orchestrator.** Nothing was pushed before the answer.
- `git status -sb`: `## feat/stack-profile-loader...origin/feat/stack-profile-loader [ahead 33]` (only unrelated untracked files).
- `git log --oneline origin/feat/stack-profile-loader..HEAD`: 33 commits, `8df03afc docs(roadmap): add objective 55` through `d4147b8c docs(55-05): complete objective put hint and reconcile-by-content TRD` (all 55-01..55-05 work).
- `node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs`: 19 pass, 0 fail (includes the 55-02 sparse-checkout suite).

## Task 2 record

- Push: `git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader` -> `36c38a9c..d4147b8c  feat/stack-profile-loader -> feat/stack-profile-loader`.
- **Pinned SHA:** `d4147b8c1dd00af210b09a90c2af87dce0bf1010` (`gh api repos/AO-Cyber-Systems/devflow-claude/commits/<SHA> -q .sha` echoed it).
- `upgrade --check` (smoke): pending `0003` only, `from: null`, `to: 2.13.1`.
- `upgrade --apply` (smoke): applied `0003` (changed `.planning/state.json`, `seeded_fields: []`); `changed_files: [.planning/config.json, .planning/state.json]`; stamp now `devflow: {version: "2.13.1", migrations_applied: ["0003","0010"]}`; backup `/Users/justin/.claude/devflow/backups/devflow-store-smoke-a2f7fa2d/2026-10-05T12-19-33-984Z`.
- `validate health` (smoke): `warnings: []`, `info: []` (no W009, no W040). Only `E020 mirror-stale: ~/.claude/devflow is 2.12.0 but the installed plugin is 2.13.1` (machine, not project; ignored per TRD).
- `test -f <SMOKE>/.planning/state.json`: exit 0.
- `config-set github.checks_workflow AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@d4147b8c1dd00af210b09a90c2af87dce0bf1010` -> `updated: true`.
- Saved ruleset: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/f71ea5d2-ce23-49f6-b435-44ae5637b57b/scratchpad/ruleset-24476250.json` (old id 24476250, bypass `[{actor_id:5, RepositoryRole, always}]`). A writable-fields restore payload was staged beside it (`ruleset-24476250-restore.json`); not needed.
- `gh api -X DELETE .../rulesets/24476250`: no output (204).
- `gh setup` dry run: `[create] ruleset devflow: default branch` with `bypass_actors: [{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]`, rules deletion / non_fast_forward / pull_request / required_status_checks (`devflow/linked-issue`, `devflow/planning-consistency`) / merge_queue; `[update] workflow .github/workflows/devflow.yml (33 lines)`. Plan: 21 actions (1 create, 1 update, 18 exists, 1 advisory). The dry run does not print the workflow body, so the pin was previewed read-only with `gh-setup.renderTemplates(config.github, '2.13.1')`: `uses: ...devflow-checks.yml@d4147b8c...` and `devflow-ref: d4147b8c...`.
- `gh setup --apply`: `Applied 21 actions: 1 created, 1 updated, 18 already in place, 1 advisory.` Advisory: `required checks are not pinned to an App; anyone with write access can post these contexts (set github.app_id to pin them)`.
- Printed commit steps (verbatim):
  ```
  Written to the working tree, not committed: .github/workflows/devflow.yml.
  Commit them through a pull request:
  commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked branches), then merge it through a pull request:
    git switch -c devflow-setup
    DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="gh setup workflow" node ~/.claude/devflow/bin/df-tools.cjs commit "chore: add the DevFlow checks workflow and pull request template" --files .github/workflows/devflow.yml
    git push -u origin devflow-setup
    then open a pull request for that branch
    or, on an objective's linked branch (`df-tools gh pr start <objective>`), commit there with: node ~/.claude/devflow/bin/df-tools.cjs commit "chore: add the DevFlow checks workflow and pull request template" --files .github/workflows/devflow.yml
  The ruleset requires devflow/linked-issue and devflow/planning-consistency, and those checks exist only once the workflow is on the default branch.
  ```
- Guidance line (verbatim): `Merge the workflow pull request first. Its required checks cannot pass until the workflow is on the default branch, so merge it with the repository-admin bypass the ruleset grants: gh pr merge <number> --admin --squash (or "Merge without waiting for requirements to be met" in the web UI). Every later pull request goes through the checks and the merge queue.`
- **New ruleset id: 24502205** (`devflow: default branch`, created 2026-10-05T08:20:20-04:00). `-q '{bypass: .bypass_actors, can: .current_user_can_bypass}'` -> `{"bypass":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],"can":"always"}`. Rule types: deletion, non_fast_forward, pull_request, required_status_checks, merge_queue.
- `grep -n "devflow-ref\|uses:" <SMOKE>/.github/workflows/devflow.yml`: line 28 `uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@d4147b8c1dd00af210b09a90c2af87dce0bf1010`, line 30 `devflow-ref: d4147b8c1dd00af210b09a90c2af87dce0bf1010`.

## Task 3 record

- `git -C <SMOKE> switch -c devflow-setup` (printed step 1) first failed: `fatal: a branch named 'devflow-setup' already exists`. The local branch was the leftover of the first run's PR #2 (0bb7c99); `git diff --stat c3b6517 devflow-setup` was empty (its tree equals the squash commit on main), so it was deleted locally (`git branch -D devflow-setup`) and the printed step re-run: `Switched to a new branch 'devflow-setup'`. See Deviations.
- Printed commit (run with this checkout's df-tools via `--cwd`, same escape): `DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="gh setup workflow" node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs --cwd <SMOKE> commit "chore: add the DevFlow checks workflow and pull request template" --files .github/workflows/devflow.yml` -> `{"committed":true,"hash":"79d0350","gate_escaped":true}`.
- 0010 leftovers, same escape form: `... commit "chore: store-mode ignore rules, config stamp and checks_workflow pin" --files .gitignore .planning/config.json` -> `{"committed":true,"hash":"af541a7","gate_escaped":true}` (2 files, +104). Working tree clean afterwards.
- `git -C <SMOKE> push -u origin devflow-setup` -> `* [new branch] devflow-setup -> devflow-setup`.
- The printed steps say only "then open a pull request for that branch", so the TRD fallback was used: `gh pr create --repo AO-Cyber-Systems/devflow-store-smoke --base main --head devflow-setup --title "chore: DevFlow checks workflow (re-pin)" --body "Workflow PR for objective 55 live re-run."` -> **PR #6** (https://github.com/AO-Cyber-Systems/devflow-store-smoke/pull/6).
- PR head SHA: `af541a7241af532931977dceff96d8657c54772c`. Run `DevFlow` id **37309000176** (event pull_request), waited with `gh run watch 37309000176 --interval 10` (finished in under a minute).
- Jobs: `devflow / planning-consistency` success (job 111759511827), `devflow / linked-issue` failure (job 111759512151), `devflow / reconcile` skipped (not a merged PR).
- Statuses on the head (`gh api .../commits/af541a7.../status -q '.statuses[] | {context, state, description}'`):
  - `devflow/planning-consistency` = **success**, "not a DevFlow objective PR"
  - `devflow/linked-issue` = **failure**, "no closing reference (Closes #N) to an issue of AO-Cyber-Systems/devflow-store-smoke in the pull request body"
  - No `error` state; no crash message.
- Job log (linked-issue) confirms the pinned ref and the 55-02 sparse set: `Uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@d4147b8c...`, `devflow-ref: d4147b8c...`, `git sparse-checkout set plugins/devflow/devflow/bin plugins/devflow/devflow/references`, `git checkout --progress --force d4147b8c...`, then the runner's verdict line `failure: no closing reference (Closes #N) ...`.
- **ENOENT count: 0** in the linked-issue job log (`gh run view 37309000176 --log --job 111759512151`, `grep -c ENOENT` -> 0) and 0 in the planning-consistency job log (saved to `<scratchpad>/run-37309000176-planning-consistency.log`, `grep -c ENOENT` -> 0).
- **Merge command used:** `gh pr merge 6 --admin --squash --repo AO-Cyber-Systems/devflow-store-smoke` (the printed guidance's command plus `--repo`). No output, exit 0. `gh pr view 6 --json state,mergedAt,mergeCommit` -> `{"state":"MERGED","mergedAt":"2026-10-05T12:22:32Z","sha":"20c3bd5684f9c979e30feb1b8c5e1ac80ff64b57"}`. The admin bypass was accepted with the merge_queue and required_status_checks rules active.
- `git -C <SMOKE> switch main` + `pull --ff-only`: `83dd15d..20c3bd5` fast-forward (`.github/workflows/devflow.yml` 4 +-, `.gitignore` +5, `.planning/config.json` +99). `grep -n "devflow-ref\|uses:"` on main: line 28 `uses: ...devflow-checks.yml@d4147b8c1dd00af210b09a90c2af87dce0bf1010`, line 30 `devflow-ref: d4147b8c1dd00af210b09a90c2af87dce0bf1010`.
- After the merge: remote heads are `main` (20c3bd5) and the unrelated `compass-github-importer`; `devflow-setup` was deleted on GitHub by the repo's delete-on-merge setting. The local `devflow-setup` (af541a7, tree equal to main) was deleted so the next `gh setup` re-run does not hit the same `switch -c` failure. Ruleset 24502205 still `active`, `current_user_can_bypass: always`. `validate health` on the clone: `warnings: []` (E020 only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale local `devflow-setup` branch blocked the printed `git switch -c devflow-setup`**
- **Found during:** Task 3, step 1
- **Issue:** the first live run's PR #2 was squash-merged on GitHub (remote branch auto-deleted), but the smoke clone kept its local `devflow-setup` branch, so the first printed step failed with `fatal: a branch named 'devflow-setup' already exists`.
- **Fix:** verified the local branch's tree equals the squash commit c3b6517 on main (`git diff --stat` empty), deleted it locally, re-ran the printed step unchanged. Local-only; no GitHub write.
- **Files modified:** none (smoke clone refs only)
- **Commit:** none in this repository
- **Finding for 55-08 (docs):** `gh setup --apply`'s printed steps assume `devflow-setup` does not exist locally. On any re-run of setup in a clone that ran it before, the first step fails. Either the guidance should say `git switch -C devflow-setup` (or delete a merged local `devflow-setup` first), or the docs should mention it. Not fixed here (no code change in scope for this TRD).

### Observations (not deviations)

- The `gh setup` dry run prints `write .github/workflows/devflow.yml (33 lines)` but not the rendered `uses:` / `devflow-ref:` lines, so the TRD's step 4 check ("a workflow update with `@<SHA>` and `devflow-ref: <SHA>`") cannot be read from the dry run itself. It was checked read-only by calling `gh-setup.renderTemplates(config.github, '2.13.1')` before `--apply`, and confirmed on the written file after. Candidate for 55-08: the dry run could print the two pin lines.
- The printed commit step names `~/.claude/devflow/bin/df-tools.cjs` (the stale 2.12.0 mirror on this machine). Per the binding rules the same command was run with this checkout's df-tools via `--cwd`.
- The printed steps stop at "then open a pull request for that branch" without a command; the TRD's `gh pr create` fallback was used.
- `validate health` reports E020 (home mirror 2.12.0 vs plugin 2.13.1) on this machine; it is not a project issue and was ignored per the TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Approve the push | user reply relayed by orchestrator: A (push-branch); reads: `git status -sb`, `git log origin/feat/stack-profile-loader..HEAD` (33 commits), `node --test .../devflow-workflows.repo.test.cjs` (19/19) | 0 | PASS |
| 2: Push, bootstrap, re-create ruleset | `gh api repos/AO-Cyber-Systems/devflow-store-smoke/rulesets/24502205 -q .current_user_can_bypass` -> `always`; `grep -n "devflow-ref\|uses:" <SMOKE>/.github/workflows/devflow.yml` -> SHA on lines 28 and 30; `test -f <SMOKE>/.planning/state.json` | 0 / 0 / 0 | PASS |
| 3: Merge workflow PR, no ENOENT | `gh pr view 6 --repo AO-Cyber-Systems/devflow-store-smoke --json state,mergedAt -q .state` -> `MERGED`; `grep -c ENOENT` on both job logs -> 0; main's devflow.yml pins `d4147b8c...` on both lines | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| workflow repo test (Task 1 precondition) | `node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` | 0 | PASS (19/19) |
| stack task gates | (none run) | n/a | not_available: this TRD changes no code in this repository (SUMMARY only) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - push approved before anything was pushed (A, relayed by orchestrator)
  - `upgrade --apply` seeded `.planning/state.json` and stamped `devflow.version: 2.13.1`; `validate health` has no W009/W040
  - setup re-created `devflow: default branch` (24476250 deleted, JSON saved; new 24502205) with bypass RepositoryRole 5 / always; `current_user_can_bypass: always`
  - main's `.github/workflows/devflow.yml` pins `@d4147b8c...` and `devflow-ref: d4147b8c...`
  - DevFlow jobs posted real verdicts (success / failure, no `error`), 0 ENOENT; PR #6 merged with `gh pr merge 6 --admin --squash`
- Gate failures: None

## Self-Check: PASSED

- FOUND: commit c7498b7f (Task 2), c61e266f (Task 3) in `git log`
- FOUND: pushed SHA d4147b8c1dd00af210b09a90c2af87dce0bf1010 on GitHub (`gh api .../devflow-claude/commits/<SHA> -q .sha`)
- FOUND: `<scratchpad>/ruleset-24476250.json` (1645 bytes)
- FOUND: `<SMOKE>/.planning/state.json`
- FOUND: ruleset 24502205 active, `current_user_can_bypass: always`
- FOUND: PR #6 `MERGED` (merge commit 20c3bd5684f9c979e30feb1b8c5e1ac80ff64b57); main's devflow.yml pins the SHA on both lines
