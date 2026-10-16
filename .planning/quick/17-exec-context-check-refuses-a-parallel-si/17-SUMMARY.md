---
objective: quick-17
trd: 01
github_issue: "#98"
status: complete
commits:
  - d8a4def test(98): exec-context check must refuse a sibling sharing one index
  - e81709f fix(98): exec-context check refuses a parallel sibling on a shared index
  - 22899c4 docs(98): executor preflight passes --id; document SHARED INDEX
---

# Quick 17 Summary: `exec-context check` refuses a parallel sibling on a shared index (#98)

## What changed
- `exec-context check --repo <abs> --base <ref> --id <plan_id>` now takes an exclusive claim on
  (checkout realpath, base sha), stored at `<git-common-dir>/devflow-exec-claims/<sha1(checkout)[:12]>-<base>.json`.
  Created with `openSync(..., 'wx')` (atomic). A different id on a live claim exits 1 with
  `SHARED INDEX —` naming the other id, checkout, base, the `exec-context worktree` fix for this id,
  and the `exec-context release` command. Same id refreshes; expired (TTL 4h,
  `DEVFLOW_EXEC_CLAIM_TTL_MS`) or unreadable claims are replaced. No `--id` or no `--base` → `claim: null`.
- New `exec-context release --repo <abs> [--id <id>]` removes this checkout's claims (all, or only
  those held by `--id`); outputs `{ok, checkout, released: [...]}`.
- Router lists `check, worktree, release`; help.cjs and the df-tools.cjs comment updated.
- execute-objective.md executor prompt passes `--id {plan_id}` (plus `PLAN_ID:` line); executor.md
  preflight passes `--id <plan_id>` and documents SHARED INDEX as the third hard stop. CHANGELOG
  Unreleased/Fixed entry added.

## Evidence
- RED (d8a4def): 7 new cases failed for the right reasons — (a) second id exited 0; (b)-(e) `claim`
  undefined; (f) no `claim` key; (g) `Unknown exec-context subcommand: release`. 21 existing passed.
- GREEN: exec-context 28/28; with executor-isolation, help, help-delegation, agent-shell-harness: 122/122.
- Full `npm test`: 3469 tests, 3436 pass, 1 fail, 32 skipped. Only failure: handoff-e2e MA-7
  (doctl auth / handoff pipeline) — in the known machine-state set, unrelated.

## Deviations
- `error()` prefixes stderr with `Error: `, so test (a) matches `/^(?:Error: )?SHARED INDEX —/m`
  rather than the plan's literal `/^SHARED INDEX —/m`. The message itself starts with `SHARED INDEX —`.
- `release` also refuses a relative `--repo` and a cwd in a different repo (mirrors `check`).
