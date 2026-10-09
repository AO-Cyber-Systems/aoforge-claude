---
objective: 72-install-and-naming-cleanup
trd: "16"
subsystem: github-store
tags: [aoforge-rename, github-store, rebrand, labels, markers, wiki, rulesets, checks-pin]

requires:
  - phase: 72-07
    provides: "the AOForge runtime home and `state rekey` beside the other help/flag-spec entries"
  - phase: 72-09
    provides: "legacy-rewrite.cjs rewriteLegacyNames (PRESERVE masked) and unifiedDiff"
  - phase: 72-11
    provides: "dual-namespace gh-body readers, legacy-gh-fixtures (legacyCaller, legacyPrTemplate), checks-pin `legacy` flag and FIX_LEGACY pointing at `gh rebrand`"
provides:
  - "gh-rebrand.cjs: snapshotRepo, snapshotLocal, planRebrand, renderPlan, applyRebrand, ghRebrandClient, runRebrand, cmdGhRebrand"
  - "`aof-tools gh rebrand [--repo o/r] [--apply|--dry-run] [--raw]`: dispatched in aof-tools.cjs, in help.cjs (gh usage + details) and flag-spec.cjs; PROBES and the gh seam guard list it"
  - "__fixtures__/legacy-rebrand-fixtures.cjs: legacyRepoSnapshot, stubClient (applies and records writes), localRepo (hermetic checkout with the legacy caller, PR template, docs backend and legacy config labels)"
affects: [72-15, 72-17, 72-25]

tech-stack:
  added: []
  patterns:
    - "An injectable rebrand client (list, get, readWiki, write) separates the pure plan from GitHub; the real client is gh-client (ghPaginate/ghRead/ghWrite) plus a scratch wiki clone through gh-wiki"
    - "Resume by re-planning: apply stops at the first failed op, and a re-run re-reads the repository and plans only what is still legacy"
    - "Managed text: markers re-spelled, wording rewritten inside managed sections, only the legacy product name outside; PRESERVE tokens and the repository's own slug masked"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-rebrand-fixtures.cjs
  modified:
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/flag-spec.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/flag-guard-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "Managed means the first line is a marker in either namespace, or the text holds a managed section (`begin NAME`/`end NAME`, or the PR template's `NAME:start`/`NAME:end`). Only managed issues, pull requests and comments are edited. Their markers move to the AOForge namespace, the text inside managed sections gets the full wording rewrite, and the text outside them changes only where it names the legacy product (both prose spellings, with the article fixed). Titles of managed issues, wiki pages and docs-backend pages get the full wording rewrite"
  - "PRESERVE tokens are never rewritten, and neither is the repository's own owner/name (a repository whose name holds a legacy word keeps working links)"
  - "Labels: every label in the legacy namespace is renamed (PATCH new_name keeps the associations). When the AOForge label already exists, the legacy one is merged instead: the AOForge label is added to every issue carrying the legacy one, then the legacy label is deleted (marked destructive). A failed add stops the run before the delete"
  - "Rulesets: the repository's rulesets get one PUT each with only the writable fields, the legacy contexts switched (a duplicate after the switch kept once) and a legacy ruleset name rewritten, so gh setup still finds `aoforge: default branch` instead of creating a second ruleset. Organization rulesets are reported, not edited. A 403/404 on the list is `needs admin` and the rest still runs"
  - "Local files: the managed legacy caller is `git mv`ed to aoforge.yml and re-rendered from gh setup's template at the current release (new slug, workflow file, input name and pin). When aoforge.yml already exists, the legacy caller is removed (destructive). The docs backend is `git mv`ed and its pages rewritten. The PR template block is re-marked. In config.json, the legacy-namespace `github.labels` values (72-11 hand-off) and a legacy `checks_workflow` are rewritten in place, so the layout is kept. The local section runs only when the command's project is a checkout of the repository"
  - "Apply runs in the fixed order (labels, issues, comments, wiki, rulesets, local) under a zero-retry policy: a secondary rate limit stops the run with the wait time. Wiki pages are written to a scratch clone and count as done only when the one push succeeds. In store mode the outbox bases of rewritten issues and comment groups are refreshed (72-11 hand-off), so the next flush does not read the rewrite as a human edit"
  - "The commit steps are commit-steps.cjs's branch sequence on `aoforge-rebrand`, with the logged escape and the `gh pr start` route in store mode. The file list covers moved directories once"

requirements-completed: [INST-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: GATE_PENDING
completed: 2026-10-09
---

# Objective 72 TRD 16: `aof-tools gh rebrand` Summary

**`aof-tools gh rebrand` reads one repository and plans every rename. That covers labels (rename, or a destructive merge into an existing AOForge label), the markers and wording of managed issues, pull requests and comments, wiki pages, ruleset contexts and names, and in a checkout of the repository the caller workflow, docs backend, PR template and config.json labels. A dry run prints each change with a line diff. `--apply` runs the changes in a fixed order, stops at the first failure with what is done and what is left, and resumes on a re-run. It never commits.**

## Progress
- [x] Task 1: Fixture builder: a legacy store-mode repository snapshot — 9be0af0e
- [x] Task 2: Plan and dry run — 33219075 (RED), ef3ede76 (GREEN)
- [x] Task 3: Apply, idempotence and resume — 3e3f541d (RED), (this commit) (GREEN)
