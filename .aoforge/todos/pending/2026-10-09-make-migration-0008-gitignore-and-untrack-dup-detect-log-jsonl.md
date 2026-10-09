---
title: make migration 0008 gitignore and untrack .dup-detect-log.jsonl
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs, plugins/aoforge/aoforge/bin/lib/dup-detect.cjs]
---

## Problem

`dup-detect.cjs` (`DUP_DETECT_LOG_FILE = '.dup-detect-log.jsonl'`, line 40) appends a record per resolution to `.aoforge/.dup-detect-log.jsonl`, so it is runtime state. Migration 0008 only covers `.progress-guard.json` and `.awareness-cache.json` (`RUNTIME_STATE_BASENAMES`, line 44).

In the 72-25 fleet sweep the log was:
- a tracked file with uncommitted changes in aocore, aoedge, devflowops, eden-biz and justinforme. It was the only thing that made 0012 defer in devflowops and eden-biz.
- untracked and not ignored in EdenDocs, eden-press and aoinference. EdenDocs' upgrade commit picked it up as a new tracked file (121d2b35aa8). eden-press and aoinference were held because their commit would have done the same.

## Solution

1. Add `.dup-detect-log.jsonl` to `RUNTIME_STATE_BASENAMES`, so 0008 gitignores it (both directory names) and untracks it with `git rm --cached`, keeping the working copy. Because 0012 treats paths changed earlier in the same run as its own, a modified tracked log then no longer defers the move.
2. Check other runtime dotfiles the hooks or aof-tools write under the planning directory (e.g. `.micro-description`, `.stack.lock/`, `.autonomous-retry-*`) and decide which belong in the same list.
3. Fleet follow-up: once released, devflowops and eden-biz become movable without the user touching the log; in EdenDocs, `git rm --cached .aoforge/.dup-detect-log.jsonl` with the user's approval.
