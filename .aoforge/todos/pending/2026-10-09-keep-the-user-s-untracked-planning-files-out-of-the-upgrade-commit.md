---
title: keep the user's untracked planning files out of the upgrade commit
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/hooks/upgrade-project.js, plugins/aoforge/aoforge/bin/lib/misc.cjs]
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
