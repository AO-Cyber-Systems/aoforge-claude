---
objective: 75-prospective-estimate-retest-and-todo-sweep
type: todo-sweep
requirement: TODO-01
swept: 14
completed: 4
re_scoped: 9
follow_up: 1
generated: 2026-10-10T07:58:17Z
---

# Objective 75: todo sweep (TODO-01)

Every todo pending when the sweep started (14) has an outcome. Four were completed through `todo complete`, each after a `## Resolution (objective 75, 2026-10-10)` section citing checkable evidence. Ten are still pending: nine re-scoped by this sweep and one follow-up created earlier in this objective by TRD 75-01. Each of the ten carries `disposition`, `disposition_reason`, `disposition_target`, `disposition_date`, `disposition_by` in its frontmatter and a `## Disposition (objective 75, 2026-10-10)` section. 14 = 4 + 9 + 1.

Method: `list-todos` for the inventory; `planning draft todos/pending/<stem>.md`, edit, `todo add --stem <stem> --from <draft>` to rewrite a todo in place; `todo complete <stem>.md` to move a completed one. Nothing under `.aoforge/todos/` was moved or edited by hand. No live step was taken: nothing pushed, merged, tagged or released, no other repository touched, no `doctor --fix`.

## Sweep table

Stem is the filename without `.md`. A todo with no `created:` field shows the date in its filename.

| # | Stem | Created | Outcome | Evidence or reason | Target |
|---|---|---|---|---|---|
| 1 | `2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming` | 2026-05-23 | completed | No `df-*` entry under `~/.claude/skills` or `~/.claude/agents` (`rg -c '^df-'` exit 1); `enabledPlugins`: pre-rename plugin false, `aoforge@aocyber` true; `doctor --global --json` check 15 `legacy-df-install` ok; INST-01 Complete. The leftover old runtime home (doctor check 16 warn) registers nothing and moving it is the user's own call | none |
| 2 | `2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release` | 2026-10-08 | re-scoped | Zero qualifying records: 802 files searched (2026-09-23 to 2026-10-10), the verify-commits reason is in 36 records (10 since the 3.0.0 install at 2026-10-09T13:42:43Z), all file reads or edits; no SubagentStop block of any hook is recorded (the known gate-executor-stop text is in 13 records, all reads or edits; 561 stop_hook_summary records, none blocked). This repository is `mode: yolo`, where the hook only warns | Observe on the next autonomous-mode executor stop with no commit in 10 minutes, in any project with `mode: autonomous` |
| 3 | `2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint` | 2026-10-08 | re-scoped | A commit in each of two other repositories, needing the user's per-repository approval (43-ROLLOUT option (c)); objective 75 has no cross-repository step | Fleet follow-up on the user's approval, then remove the two OPEN rows from `stack-fleet-tables.cjs` |
| 4 | `2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured` | 2026-10-09 | re-scoped | The user's words (TRD 72-24, 2026-10-09): "Defer that until we are completely done - that vanity URL is not configured yet." The vanity mapping is decided, not yet deployed | When git.aocyber.ai is configured and the user resumes it, with explicit approval for the push and the PR |
| 5 | `2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main` | 2026-10-09 | re-scoped | OPS-03, deferred by the user on 2026-10-10 (TRD 74-06): "Skip this for now - we aren't doing this right now." PR #130 stays open | OPS-03 resume on the user's go-ahead (74-06 Tasks 2 and 3, production deploy at the 74-08 merge) |
| 6 | `2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades` | 2026-10-09 | re-scoped (remainder) | Code fix done by TRD 75-02 (`165a01ed`, RED `92e5e671`, GREEN `c1080db5`). It reaches users only with the next release; redoing trades and recycling-oracle needs the release plus per-repository approval | After the next release and runtime re-sync, per-repository approval; keep `AOFORGE_SKIP_UPGRADE=1` advice until then |
| 7 | `2026-10-09-keep-the-user-s-untracked-planning-files-out-of-the-upgrade-commit` | 2026-10-09 | re-scoped | A medium change to 0012's changed-paths contract, the hook's background commit and `upgrade --check`; larger than a sweep fix. Five repositories stay held | An upgrade-hardening objective (not yet planned) before the shim removal in the release after 3.0.0 |
| 8 | `2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl` | 2026-10-09 | re-scoped (remainder) | Steps 1 and 2 done by TRD 75-02 (RED `58bea6e7`, GREEN `db76dcb0`; RED `985ca558`, GREEN `dfb15a97`; dotfile audit in the 75-02 SUMMARY). Step 3 is the fleet. Open question recorded, not decided: whether `.gh-sync-state.json` is per-machine | After the next release, per-repository approval (EdenDocs `git rm --cached` first) |
| 9 | `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete` | 2026-10-09 | completed | TRD 75-03: fix `73144415`, RED `ed1ef0f4`, fixtures `8092b23c`; objective 74's status rule `2586fbc4`, `8bcf11cc`, `fea136f9`; E2E1 `✔ ... zero drift`, `pass 1`, `fail 0` re-run in TRD 75-04; 577 SUMMARYs scanned, only 74-06 (deferred) and 75-03's own in-progress checkpoint not complete | none |
| 10 | `2026-10-09-migrate-sub-project-planning-directories-component-planning-below-the-repository-root` | 2026-10-09 | re-scoped | Needs a policy decision (migrate nested component projects or report them) and a feature; it blocks `SHIM_REMOVAL` | The same upgrade-hardening objective, before the shim removal |
| 11 | `2026-10-09-plan-for-worktree-branches-that-still-have-planning-after-a-repository-moved-to-aoforge` | 2026-10-09 | re-scoped | Needs a scratch-repository experiment, a documented merge order and possibly a doctor helper | The same upgrade-hardening objective, before the shim removal |
| 12 | `est-11-follow-up-objective-75` | 2026-10-10 | follow-up | Created by TRD 75-01 because EST-11 is not met (objective 72 unscored; the four scored objectives meet the EST-08 rule). It already carried all five disposition fields and a Disposition section; unchanged by this sweep | The next estimation objective (next milestone) |
| 13 | `recalibrate-estimate-minutes-est-08-not-met` | 2026-10-07 | completed | Objective 67 recalibrated by a frozen method (EST-10 Complete, DECISION-003, `67-FREEZE.md`: `trd_level`, window 10, through 66). Objective 75 ran the todo's "next check": `75-RETEST-REPORT.md` says "EST-11 not met ... S has four" and "No SC failed on the scored set"; further work is carried by `est-11-follow-up-objective-75` | none (carried by row 12) |
| 14 | `ship-executor-token-stamp-forward-stamp-8-of-41` | 2026-10-07 | completed | Installed 3.0.0 `agents/executor.md` has the `tokens stamp` step (lines 969, 1066, 1073); `tokens-cli.test.cjs` tests 11 and 12 pass; `tokens coverage --raw`: `v1.6 forward-stamped 89/91 = 0.978021 (target 95%: met) · live 89 · backfill 0 ...`. EST-09 itself is decided in TRD 75-05 | none |

Counts by outcome: completed 4 (rows 1, 9, 13, 14); re-scoped 9 (rows 2, 3, 4, 5, 6, 7, 8, 10, 11, of which rows 6 and 8 are remainders after a done code fix); follow-up 1 (row 12). Total 14.

## verify-commits search (row 2)

The search was run because the todo can be completed only on a real hook-feedback record. The window starts at the 3.0.0 install (TRD 72-21: installed 2026-10-09T13:38Z, first AOForge session migrated at 13:42:43Z).

- Files: 802 under `~/.claude/projects/-Users-justin-dev-aoforge-claude` and `-Users-justin-dev-devflow-claude` (668 `.jsonl` transcripts including every `subagents/` directory, plus tool-result text files), timestamps 2026-09-23T19:41Z to 2026-10-10T07:56Z.
- The reason string "executor produced no commits in the last 10 minutes": 36 records; 10 at or after 2026-10-09T13:42:43Z. All 36 are `tool_result` (30) or assistant `tool_use` (6) records. None is hook feedback.
- The known SubagentStop block (`gate-executor-stop.js`, "is final but has no tokens_input/tokens_output", objective 66) is in 13 records, all `tool_result` or `tool_use`; so the feedback record's shape cannot be learned from a recorded instance. The only Stop-family records are 561 `system` / `stop_hook_summary` records from main sessions, none with `preventedContinuation: true` or a non-empty `hookErrors`.
- Result: zero qualifying records. The hook source in the installed 3.0.0 plugin prints the top-level form (`verify-commits.js` line 210). This repository's `.aoforge/config.json` is `mode: yolo`, and the hook blocks only under `mode: autonomous`, so no stop here could have produced the block.

## SC-4 check

Read-only `node -e`-style script, not committed: it runs `list-todos`, opens each `path`, reads the frontmatter and prints one line per file. Run 2026-10-10 after the last todo was rewritten; exit code 0.

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

Cross-check: `rg -c -e '^disposition_reason: .+' .aoforge/todos/pending/` printed `:1` for each of the ten files.

`todo list` is not a subcommand of `aof-tools`; the inventory is `aof-tools list-todos` (what `/aoforge:todo list` reads). This check stands in for "`todo list` shows no pending todo without a recorded reason": it walks exactly the `list-todos` inventory (10 pending after the sweep, from 14) and requires a non-empty `disposition_reason` in each file. SC-4 passes.

## Observations recorded, not acted on

- REQUIREMENTS.md marks INST-06 Complete although its "a vanity-mapping PR is drafted for review" clause waits on row 4. Whether to reword it is the user's call.
- `.gh-sync-state.json` (row 8): per-machine or not is a human call.
- `docs/USER-GUIDE.md` line 378 and `CLAUDE.md` line 63 still name migration 0008's old two-file list (TRD 75-02, Deviation 4); correcting them belongs to TRD 75-05.
- A file named `amp` is untracked at the repository root. It is not part of this sweep and was never staged.
