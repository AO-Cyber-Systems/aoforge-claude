---
objective: 53-worktree-and-health-hygiene
kind: plugin
work: bugfix
status: registered
milestone: v1.4
gap_closure: v1.4-MILESTONE-AUDIT (re-audit 2026-10-04)
---

# Objective 53 — Worktree and health hygiene

Registered 2026-10-04 from the tech-debt list in the v1.4 re-audit (`milestones/v1.4-MILESTONE-AUDIT.md`, status `tech_debt`). Every requirement is satisfied. These are rough edges that objective 52's execution ran into, plus small leftovers. Scope chosen by the user: the core four plus the optional items.

## Core items

1. **Summary verbs from a worktree write the main checkout.** `summary checkpoint|post` resolve the main checkout even inside an executor worktree, which leaves untracked SUMMARY copies that block the wave merge. Objective 52 hit this five times. Each summary should land once, in the checkout that commits it, while still meeting the original reason for main-checkout writes (summaries visible to `gate-executor-stop` and the orchestrator) (52 execution report).
2. **`validate health` I001 false positive for named TRDs.** For `NN-MM-<slug>-TRD.md`, health expects `NN-MM-<slug>-SUMMARY.md`, but executors write `NN-MM-SUMMARY.md`, so every TRD in 47-52 is reported missing. Health should accept both names, and agree with `objective-job-index` / roadmap reconcile on what counts as complete.
3. **`micro commit` uses raw git.** It bypasses `df-tools commit`, so the store-mode GEN-01 branch gate never checks it. Route it through the commit path, keeping its single-commit behaviour and store-mode STATE skip (52-03).
4. **gate-commits refuses a chained `git merge … && df-tools commit …`.** It checks before MERGE_HEAD exists. Either allow the chained merge-completion form safely, or make the execute-objective merge prose emit one command per call. Pick whichever keeps the gate's protection intact.

## Optional items (user opted in)

5. **Objective 45 leftovers:** remove the dead `AWARENESS_CACHE_REL` export; add `/devflow:doctor` to the global-claude-md template.
6. **Objective 42:** `df-tools verify artifacts` can't parse 42's must_haves blocks (nested/2-space shapes). Make the parser handle them, with a regression test using a 42 TRD shape.
7. **Repo health:**
   - W001: add `## Core Value` and `## Requirements` to this repo's PROJECT.md, from existing content and not invented.
   - W005: the `UI-VISUAL-EVAL-*` objective dirs don't follow `NN-name`. Archive them, or have health ignore them, without losing their history.
8. **Repair for decisions mangled before objective 52.** Add a command, or a `doctor --fix`, that detects a resolved decision whose `resolution` was flattened by the pre-52 one-line writer and repairs it where the full answer can be recovered. Otherwise report it for hand-fixing.

## Not in scope (user actions)

Release 42-53 and re-sync the runtime; run the live store-mode smoke on a throwaway repo; apply migration 0009 in this repo.

## Success

- An executor worktree run leaves no stray SUMMARY copies in the main checkout, and wave merges don't conflict on them.
- `validate health` reports no I001 for TRDs that have a summary under either name.
- In store mode, `micro commit` is refused on an unlinked branch with the normal gate message.
- The documented merge sequence passes gate-commits.
- The optional items are closed, or explicitly recorded as deferred with a reason.
- `npm test` is green apart from the known MA-7.
