---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-04"
subsystem: todos
tags: [todo-sweep, todo-01, disposition, planning-records, sc-4]
requires:
  - objective: 75-prospective-estimate-retest-and-todo-sweep
    provides: "75-01 retest verdict and follow-up todo, 75-02 upgrade fixes, 75-03 reconcile fix"
provides:
  - "Four todos completed through todo complete, each with a Resolution section citing checkable evidence"
  - "Every other pending todo (ten) carries the five disposition fields and a Disposition section"
  - "75-TODO-SWEEP.md: the sweep table (14 rows) and the SC-4 check output"
affects: [75-05-coverage-and-close-out]
key-files:
  created:
    - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md
    - .aoforge/todos/completed/2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming.md
    - .aoforge/todos/completed/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md
    - .aoforge/todos/completed/recalibrate-estimate-minutes-est-08-not-met.md
    - .aoforge/todos/completed/ship-executor-token-stamp-forward-stamp-8-of-41.md
  modified:
    - .aoforge/todos/pending/ (nine todos re-scoped in place)
decisions:
  - "The verify-commits todo is re-scoped, not completed: the retained transcripts hold no SubagentStop block of any hook, and this repository is mode yolo, where the hook only warns"
  - "The 0012 and 0008 todos are re-scoped as remainders after a done code fix: their fleet steps need a release plus per-repository approval"
  - "TODO-01 is not ticked here: TRD 75-05 ticks it only after the SC-4 check passes again at close-out"
metrics:
  duration: "about 10 minutes (2026-10-10T07:51Z to 08:01Z)"
  completed: 2026-10-10
requirements-completed: []
tokens_input: 12737764
tokens_output: 72683
tokens_cache_read: 12542868
tokens_cache_write: 194736
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 75 TRD 04: Sweep every pending todo (TODO-01) Summary

One-liner: all 14 todos pending at sweep start now have an outcome (4 completed with evidence, 9 re-scoped, 1 follow-up), and the mechanical SC-4 check passes: all 10 files still pending carry a non-empty `disposition_reason`.

## Progress
- [x] Task 1: Inventory, evidence and completions — 4b6b4858
- [x] Task 2: Re-scope the rest with a recorded reason and target, then publish the sweep table — ab52b873

## Counts

Inventory at sweep start: 14 (`list-todos`: the 13 the plan expected plus `est-11-follow-up-objective-75`, created by TRD 75-01). 14 = 4 completed + 9 re-scoped + 1 follow-up.

**Completed (4), each moved by `todo complete`, with a `## Resolution (objective 75, 2026-10-10)` section:**
1. `2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming`: no `df-*` under `~/.claude/skills` or `agents` (`rg -c '^df-'` exit 1); `enabledPlugins` has the pre-rename plugin false and `aoforge@aocyber` true; `doctor --global --json` check 15 `legacy-df-install` ok; INST-01 Complete. Doctor check 16 still warns about the leftover old runtime home, which registers nothing; moving it is the user's call and `--fix` was not run.
2. `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete`: TRD 75-03 (`73144415`, RED `ed1ef0f4`, fixtures `8092b23c`) on top of objective 74's status rule (`2586fbc4`, `8bcf11cc`, `fea136f9`); E2E1 re-run in this TRD: `✔ ... zero drift`, `pass 1`, `fail 0`.
3. `recalibrate-estimate-minutes-est-08-not-met`: objective 67 froze and applied the recalibration (EST-10 Complete, DECISION-003, `67-FREEZE.md`: `trd_level`, window 10, through 66); objective 75 ran the todo's "next check" (`75-RETEST-REPORT.md`: "EST-11 not met ... S has four"); remaining work is carried by `est-11-follow-up-objective-75`.
4. `ship-executor-token-stamp-forward-stamp-8-of-41`: installed 3.0.0 `agents/executor.md` has the `tokens stamp` step; `tokens-cli.test.cjs` tests 11 and 12 pass; `tokens coverage --raw` first line: `v1.6 forward-stamped 89/91 = 0.978021 (target 95%: met) · live 89 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)`. EST-09 itself is 75-05's decision.

**Re-scoped (9), each with the five disposition fields and a `## Disposition (objective 75, 2026-10-10)` section:**
1. `2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release`: see the search below.
2. `2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint`: a commit in each of two other repositories, needs the user's per-repository approval (43-ROLLOUT option (c)).
3. `2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured`: the user's deferral, quoted ("Defer that until we are completely done - that vanity URL is not configured yet.").
4. `2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main`: OPS-03, the user's deferral, quoted ("Skip this for now - we aren't doing this right now."); PR #130 stays open.
5. `2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades`: remainder; the code fix is done (`165a01ed`, `92e5e671`, `c1080db5`), the fleet redo needs a release and approval.
6. `2026-10-09-keep-the-user-s-untracked-planning-files-out-of-the-upgrade-commit`: a medium change to 0012's changed-paths contract, the hook's commit and `upgrade --check`; larger than a sweep fix.
7. `2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl`: remainder; steps 1 and 2 done (`58bea6e7`, `db76dcb0`, `985ca558`, `dfb15a97`), step 3 (fleet) waits for a release and approval. The `.gh-sync-state.json` per-machine question is recorded in the todo, not decided.
8. `2026-10-09-migrate-sub-project-planning-directories-component-planning-below-the-repository-root`: needs a policy decision and a feature; blocks the shim removal.
9. `2026-10-09-plan-for-worktree-branches-that-still-have-planning-after-a-repository-moved-to-aoforge`: needs a scratch-repository experiment, docs and possibly a helper.

Items 6, 8 and 9 target an upgrade-hardening objective that is not yet planned (the next milestone), to be finished before the shim removal in the release after 3.0.0.

**Follow-up (1):** `est-11-follow-up-objective-75` (created by 75-01). It already carried `disposition: follow-up` and all four other fields plus a `## Disposition` section, so it was checked and left unchanged. Target: the next estimation objective.

## verify-commits search result

The todo can be completed only on a real hook-feedback record after the 3.0.0 install (TRD 72-21: installed 2026-10-09T13:38Z, first AOForge session 13:42:43Z).

- 802 files searched under `~/.claude/projects/-Users-justin-dev-aoforge-claude` and `-Users-justin-dev-devflow-claude` (668 `.jsonl` transcripts including every `subagents/` directory), timestamps 2026-09-23T19:41Z to 2026-10-10T07:56Z.
- The reason string appears in 36 records, 10 in the window. All 36 are `tool_result` (30) or assistant `tool_use` (6) records: file reads, commands and edits. Zero are hook feedback.
- The known `gate-executor-stop.js` block (objective 66) is in 13 records, all reads or edits, so no recorded SubagentStop block of any hook gave the record shape. The only Stop-family records are 561 `stop_hook_summary` entries, none with `preventedContinuation: true` or a non-empty `hookErrors`.
- Installed 3.0.0 `verify-commits.js` line 210 prints the top-level form. This repository's config is `mode: yolo`, where the hook only warns; it blocks only under `mode: autonomous`, so no stop here could have produced the block. Re-scoped with that evidence.

## SC-4 check output

Read-only script (not committed): `list-todos`, open each `path`, read the frontmatter. Run after the last todo was rewritten, exit 0:

```
2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release.md: OK
2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint.md: OK
2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured.md: OK
2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md: OK
2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades.md: OK
2026-10-09-keep-the-user-s-untracked-planning-files-out-of-the-upgrade-commit.md: OK
2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl.md: OK
2026-10-09-migrate-sub-project-planning-directories-component-planning-below-the-repository-root.md: OK
2026-10-09-plan-for-worktree-branches-that-still-have-planning-after-a-repository-moved-to-aoforge.md: OK
est-11-follow-up-objective-75.md: OK
pending: 10; missing disposition_reason: 0; lacking any of the five fields: 0
```

`rg -c -e '^disposition_reason: .+' .aoforge/todos/pending/` printed 1 for each of the ten files. The same output is in `75-TODO-SWEEP.md`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: completions | `rg -n -e '^## Resolution \(objective 75' .aoforge/todos/completed/` (4 matches, one per completed stem); line 1 of each is `completed: 2026-10-10`; `list-todos` count 14 to 10 | 0 | PASS |
| 2: re-scopes and sweep table | `node sc4.cjs` (SC-4: 10 of 10 OK); `rg -c -e '^disposition_reason: .+' .aoforge/todos/pending/` (1 per file); `rg -n -e 'type: todo-sweep' 75-TODO-SWEEP.md` (match); table rows `rg -c '^\| [0-9]+ \| `'` = 14 = sweep-start inventory | 0 | PASS |
| guards | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs planning-writes.repo.test.cjs` (49 tests) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | n/a | not_available for this TRD (planning records only, per the TRD; 75-05 runs the full suite). The three repository guards that read planning text ran green (above). |

## Discovered commands

None. The scoped `node --test {files}` form comes from the general stack profile.

## Deviations from Plan

**1. [Judgement] TODO-01 is not marked complete by `requirements mark-complete`**
- The TRD frontmatter lists `requirements: [TODO-01]`, but TRD 75-05 states "TODO-01 is ticked only after the SC-4 check passes again", because 75-05 may itself create a todo. The SC-4 check passes now (10 of 10), so 75-05 can tick it on a re-run.

**2. [Judgement] The verify-commits todo was re-scoped, not completed**
- The TRD allowed completion only on a real hook-feedback record. The search found none (see above), so the TRD's own fallback applied.

**3. [Detail] `list-todos --raw` prints the count, not the JSON**
- The plan said `--raw` gives `{count, todos}`; it gives `14`. `list-todos` without `--raw` gives the JSON. No effect on the result.

**4. [Detail] The est-11 follow-up todo was left byte-identical**
- All five fields and the Disposition section were already present, as the plan said to check, so it was not rewritten.

Otherwise the TRD was executed as written.

## Observations recorded, not acted on

- REQUIREMENTS.md marks INST-06 Complete although its vanity-PR clause waits on a deferred todo; wording is the user's call (noted in the vanity todo and the sweep table).
- `.gh-sync-state.json`: whether it is per-machine (and so belongs in migration 0008) is a human call (noted in the 0008 todo).
- `docs/USER-GUIDE.md` line 378 and `CLAUDE.md` line 63 still name migration 0008's old two-file list (75-02, Deviation 4): 75-05's close-out.
- No upgrade-hardening objective exists in ROADMAP.md yet; three todos name it as their target, so the next milestone's planning needs to create it before the shim removal.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (every todo has an outcome; no completion on intent; user-deferred items keep the user's words; the sweep table lists all 14; SC-4 passes)
- Gate failures: None

## Self-Check: PASSED

- Files found: `75-TODO-SWEEP.md` and the four completed todos under `.aoforge/todos/completed/`.
- Commits found in `git log`: `4b6b4858` and `ab52b873`.
- `git status --short` shows only the untracked `amp` file, which is not part of this TRD and was never staged.
