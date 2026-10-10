---
title: make migration 0008 gitignore and untrack .dup-detect-log.jsonl
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs, plugins/aoforge/aoforge/bin/lib/dup-detect.cjs]
disposition: re-scoped
disposition_reason: "Steps 1 and 2 are done and committed (TRD 75-02); step 3 is the fleet follow-up, which needs the next plugin release and the user's approval per repository."
disposition_target: "After the next plugin release, with a per-repository approval (EdenDocs git rm --cached first; devflowops and eden-biz become movable by themselves after the release)."
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
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

## Disposition (objective 75, 2026-10-10)

Re-scoped by the objective 75 todo sweep (TRD 75-04), not completed. Reason and target are in the frontmatter above; the detail follows.

- **Done (Solution steps 1 and 2).** TRD 75-02 (`75-02-SUMMARY.md`, Self-Check PASSED). Step 1: `.dup-detect-log.jsonl` is in 0008's `RUNTIME_STATE_BASENAMES`, so 0008 gitignores it under both directory names and untracks it with `git rm --cached`, keeping the working copy. A modified tracked log no longer defers 0012, because the move treats paths changed earlier in the same run as its own (test 10e). Commits: RED `58bea6e7`, GREEN `db76dcb0`. Step 2: every dotfile the runtime writes under the planning directory was audited (table in the 75-02 SUMMARY, "Dotfile audit"); three more joined 0008's list (`.check-todos-cache.json`, `.deprecation-log.jsonl`, `.override-log.jsonl`), RED `985ca558`, GREEN `dfb15a97`.
- **Remaining: step 3, the fleet.** After a release and a runtime re-sync: devflowops and eden-biz become movable without the user touching the log; eden-press and aoinference get the log ignored instead of swept into an upgrade commit; EdenDocs already committed it (`121d2b35aa8`), so `git rm --cached .aoforge/.dup-detect-log.jsonl` there needs the user's approval. Neither fix reaches a project until the bundled runtime is released.
- **Open question, recorded and not decided.** 75-02 left `.gh-sync-state.json` out of 0008's list: it is the last-synced GitHub state used for drift detection and is not ignored in this repository, and nothing shows it is per-machine. Whether it is runtime state that belongs in 0008 is a human call. If the answer is yes it is a one-line addition with its own test.
- **Also noted.** 75-02 deliberately left two docs stale (`docs/USER-GUIDE.md` line 378 and `CLAUDE.md` line 63 still name 0008's old two-file list); 75-05's close-out is where they are corrected.
