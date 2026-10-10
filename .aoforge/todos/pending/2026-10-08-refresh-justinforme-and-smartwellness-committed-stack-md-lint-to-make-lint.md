---
title: refresh justinforme and smartWellness committed STACK.md lint to make lint
area: stack-drafter
files: [plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs]
disposition: re-scoped
disposition_reason: "It is a commit in each of two other repositories (justinforme, smartWellness) that needs the user's per-repository approval (43-ROLLOUT option (c)), and objective 75 has no live or cross-repository step."
disposition_target: "Fleet follow-up on the user's per-repository approval; then remove the two OPEN pending-refresh rows from stack-fleet-tables.cjs."
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
---

## Problem

The committed `.planning/STACK.md` in justinforme and smartWellness (reviewed 2026-09-29) carry no `lint` key, so they inherit the go tier default `go vet ./...`. Their Makefile `lint:` target runs `go vet ./...` and `buf lint`, and since objective 71 (TRD 71-01) the drafter writes `lint: make lint` for both. The fleet harness reports each as `OPEN, refresh pending (conflict): lint: committed go vet ./... vs draft make lint` (TRD 71-02).

## Solution

Refresh each repository's committed STACK.md so `lint` is `make lint`. That is a commit in each repo and needs the user's approval (43-ROLLOUT option (c)); nothing in the fleet is edited from this repo. After both land, remove the two OPEN `pending: 'refresh'` rows (justinforme `lint`, smartWellness `lint`) from `plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs`; the ratchet then fails each row with `remove it from OPEN` until it is gone, and the harness guards the files as matches.

## Disposition (objective 75, 2026-10-10)

Re-scoped by the objective 75 todo sweep (TRD 75-04), not completed. Reason and target are in the frontmatter above; the detail follows.

- **Done already.** The drafter side is finished: TRD 71-01 writes `lint: make lint` where the Makefile `lint:` target runs `go vet ./...` and `buf lint`, and TRD 71-02 reports the two repositories as `OPEN, refresh pending`. The fixture the todo names under the old plugin directory is now `plugins/aoforge/aoforge/bin/lib/__fixtures__/stack-fleet-tables.cjs`. It still holds both `pending: 'refresh'` rows (`justinforme` and `smartWellness`, key `lint`, lines 151-168), checked 2026-10-10.
- **Why it is not done here.** The remaining change edits the committed STACK.md inside two other repositories. 43-ROLLOUT.md option (c) says: "refresh later: change that repo's committed file to the draft value. This is a separate approval and a commit in that repo". Objective 75's scope forbids acting on another repository.
- **What resuming needs.** The user's approval per repository. Then, in each repository, set `lint` to `make lint` in the committed STACK.md and commit it there; then delete the two OPEN rows from the fixture (the ratchet fails each row with "remove it from OPEN" until they are gone) and run the stack fleet tests.
