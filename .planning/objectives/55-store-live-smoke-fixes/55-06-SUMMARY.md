---
objective: 55-store-live-smoke-fixes
trd: "06"
---

# Objective 55 TRD 06: Live setup re-run Summary

## Progress
- [x] Task 1: Approve the push that makes the fixed workflow reachable — decision A (push-branch), user answer relayed by orchestrator (no commit: decision only)
- [x] Task 2: Push, bootstrap the smoke clone, re-create the ruleset with `gh setup --apply` — (this commit)
- [ ] Task 3: Merge the workflow PR with the printed admin-bypass command; the checks run without ENOENT — next step: in the smoke clone run `git -C <SMOKE> switch -c devflow-setup`, then the printed `DEVFLOW_SKIP_GH_GATE=1 ... df-tools commit ... --files .github/workflows/devflow.yml` (with this checkout's df-tools via `--cwd`)

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
