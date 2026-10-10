---
title: keep the user's untracked planning files out of the upgrade commit
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/hooks/upgrade-project.js, plugins/aoforge/aoforge/bin/lib/misc.cjs]
disposition: re-scoped
disposition_reason: "It is a medium change to 0012's changed-paths contract, the hook's background commit and the upgrade --check output, larger than this objective's sweep scope."
disposition_target: "An upgrade-hardening objective, not yet planned, before the shim removal in the release after 3.0.0."
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
---

## Problem

0012 renames the whole legacy directory, so untracked, non-ignored files inside it move with it. The changed path it reports is the directory `.aoforge`, and `aof-tools commit --files .aoforge` stages everything under it. So the upgrade commit also tracks files the user had never committed. The SessionStart hook's background commit uses the same `changed` list, so it has the same effect.

TRD 72-25: EdenDocs' commit 121d2b35aa8 picked up `.aoforge/.dup-detect-log.jsonl` and `.aoforge/state.json`. After that, five approved repositories were held untouched (no apply) because their commit would have swept:
- devflow: `.planning/journal.jsonl`
- eden-press: `.planning/.dup-detect-log.jsonl`
- aoinference: `.planning/.dup-detect-log.jsonl`
- navigators: three draft TRDs (`02-04`, `08-04`, `10-03`)
- aoid: 19 files, including an in-progress `50-16-SUMMARY.md`, `quick/5-.../5-JOB.md` and 16 report artifacts

## Solution

1. In 0012, record the legacy directory's untracked, non-ignored files before the move and report the moved tracked paths (or a pathspec that excludes those files) instead of the bare directory. Alternatively, have the commit step stage only `git add -u` plus the files migrations created in this run.
2. Have `upgrade --check` list "untracked planning files that will move but stay untracked", so a preview shows it.
3. Add tests: an untracked file in `.planning/` stays untracked after upgrade plus commit, and the hook path does the same.
4. Fleet follow-up, with the user's approval per repository: devflow, eden-press, aoinference, navigators, aoid. Either upgrade them once the fix ships, or commit/ignore their untracked planning files first and then run the two approved steps.

## Disposition (objective 75, 2026-10-10)

Re-scoped by the objective 75 todo sweep (TRD 75-04), not completed. Reason and target are in the frontmatter above; the detail follows.

- **Nothing done here.** Objective 75's scope (OBJECTIVE.md, "Scope decisions") fixes only small, well-specified todo fixes; this one changes what 0012 reports as `changed` (a pathspec instead of the bare directory, or staging only `git add -u` plus the run's created files), the SessionStart hook's background commit that reuses that list, and `upgrade --check` output, plus tests for both paths. That is larger than a sweep fix, and it touches the migration TRD 75-02 already changed.
- **State.** The five held repositories stay held and untouched: devflow, eden-press, aoinference, navigators, aoid. EdenDocs' commit `121d2b35aa8` already swept two files in.
- **Workaround meanwhile.** Commit or ignore the untracked planning files before upgrading a repository, then run the two approved steps. After TRD 75-02, `.dup-detect-log.jsonl` (and three other runtime dotfiles) are gitignored by migration 0008 once released, which removes the dup-detect case from the held list for eden-press and aoinference; the others still need this fix or a manual commit.
- **Target.** An upgrade-hardening objective, to be planned in the next milestone and finished before the shim removal in the release after 3.0.0 (`SHIM_REMOVAL` in `lib/legacy-names.cjs`). Solution step 4 (the fleet follow-up, per repository, with the user's approval) follows the fix.
