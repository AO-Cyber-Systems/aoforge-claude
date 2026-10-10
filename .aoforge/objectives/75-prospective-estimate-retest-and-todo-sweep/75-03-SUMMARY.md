---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-03"
---

# Objective 75 TRD 03: A mid-TRD progress checkpoint is not a completed SUMMARY

## Progress
- [x] Task 1: Hand-built SUMMARY completion fixtures — 8092b23c
- [x] Task 2: _summaryNotComplete recognises a progress checkpoint (cases 3-8) — RED ed1ef0f4; GREEN (this commit)
- [ ] Task 3: Repository regression proof (cases 1-2) — next step: record the analyze comparison, the scan list and the E2E1 run in the final SUMMARY, then run the post-fix gates and post

## Evidence gathered so far (Task 3, pre-commit of GREEN)

- Case 1, `roadmap analyze --raw` before vs after (repo copy, worktree): 11 objectives, every completion field identical, whole document byte-identical (completed_objectives 9, total_jobs 93, total_summaries 87, progress_percent 94). Objective 75 reads 0/5 in both, because the new rule keeps this TRD's own checkpoint out of the count.
- Scan of 577 SUMMARY files with the new `_summaryNotComplete`: 2 not complete, 74-06 (frontmatter status deferred) and 75-03 (this progress checkpoint). No completed SUMMARY matches.
- Case 2, E2E1 run from the worktree with this checkpoint on disk: pass. The pre-fix module (RED commit ed1ef0f4) over the same tree reports one drift entry, `trd_summary_exists 75-03`, which is the todo's exact case.
