---
objective: 55-store-live-smoke-fixes
kind: plugin
work: bugfix
status: registered
milestone: v1.5
---

# Objective 55 — Store live-smoke fixes

Registered on 2026-10-05 from the first live store-mode smoke. That run used a fresh store on a real private org repo, `AO-Cyber-Systems/devflow-store-smoke`, with the 2.13.1 code and the full `gh setup --apply`. The core lifecycle worked:
- typed issues and sub-issues;
- wiki pages with pinned revisions;
- `Refs #` trailers and the GEN-01 gate;
- verify, merge and reconcile;
- 0010.

These defects only appear against real GitHub; the fake-GitHub tests can't see them. Memory: `project_store_live_smoke`. The smoke repo is kept so the run can be repeated.

## Blocking store adoption

1. **The `gh setup` ruleset has no bypass actors.** The default-branch ruleset is created with `bypass_actors: []` and a `merge_queue` rule, so `current_user_can_bypass` is `never`. The "admin may need to bypass the ruleset once for the workflow PR" step it prints is impossible, and the workflow PR can't merge. Give the ruleset a repository-admin bypass (`RepositoryRole` 5, `bypass_mode: always`, or `pull_request` if that suffices), keep the superset-idempotency semantics, and make the printed guidance match. The smoke fixed this by hand in ruleset 24476250.
4. **The required checks crash on every store repo.** `.github/workflows/devflow-checks.yml` sparse-checks out only `plugins/devflow/devflow/bin` at :110, :170 and the reconcile job. But `bin/lib/helpers.cjs:10` reads `../../references/model-profiles.json`, which `gh-check-cli` loads through `gh-client`, so it throws ENOENT. Add `plugins/devflow/devflow/references` to every sparse checkout, or remove the dependency. Add a guard test that runs `gh-check-cli` from a sparse copy, so a missing file fails CI.
5. **Unpushed work gets verified, merged and closed as completed.** `verification post` (verify → status and ready), `gh pr merge` and `gh pr reconcile` only check the remote PR head. In the smoke, the linked branch had an unpushed code commit (the workflow's `gh pr sync` was skipped). The verification status was posted against a head without the code, the PR merged without it, and TRDs #3 and #4 closed as *completed*. Only reconcile warned, afterwards. Refuse, or push via `gh pr sync`, when the local linked branch is ahead of its remote. That applies at least before posting the verification status and marking the PR ready, and before `gh pr merge`. The refusal message should name `gh pr sync`.

## Friction

3. **A blocked wiki op isn't retried after the wiki exists.** A `wiki-push` op blocked on "no first page" stays blocked after the page is created. `gh outbox flush` doesn't retry it, even though its own message says "create the first wiki page … then run `df-tools gh outbox flush`". Re-probe the wiki on flush and unblock automatically, or change the message to the `resolve --overwrite` route that works.
2. **Creating the first objective on a fresh store is a dead end.** `objective put N` refuses an unknown objective ("not known (no ROADMAP entry or directory)") without naming `objective add`, which is the step that works. Name it in the error, or let `put` register a new objective.
6. **Minor:**
   - Objective issue titles use the directory slug ("[Objective 1] 01-hello-cli") instead of the objective name.
   - The managed issue footer says "Source of truth: `.planning/objectives/…` in this repo", which is wrong in store mode.
   - A fresh store project has no `state.json` or stamp (W009, W040), and nothing bootstraps a store project from scratch.
   - `gh pr reconcile` always warns "kept local branch … tip not in the merged pull request" after the default squash merge, even when everything was pushed. Compare tree or patch content, not ancestry, for squash merges.

## Success

- A fresh `gh setup --apply` on a new repo lets the workflow PR merge with the documented admin bypass.
- The required checks run green on a correct PR in a real store repo.
- An unpushed local commit blocks verify-ready and merge, with a message naming `gh pr sync`.
- The wiki-first-page and `objective put` paths work or point to what does.
- The minor items are fixed or explicitly deferred.
- **Re-run the live smoke** on `AO-Cyber-Systems/devflow-store-smoke` (objective 2) through `gh pr sync`, and confirm that the checks pass, the code lands on `main`, and the merge goes through the merge queue. That run writes to GitHub and is approved for this repo only.
- `npm test` is green apart from MA-7. Releasing is a separate approval.
