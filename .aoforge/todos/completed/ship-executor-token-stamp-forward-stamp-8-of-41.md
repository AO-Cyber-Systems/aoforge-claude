completed: 2026-10-10
---
created: 2026-10-07T12:37:00.000Z
title: Ship the executor token stamp (forward stamp reached 8 of 41 SUMMARYs)
area: estimation
files: [plugins/devflow/agents/executor.md, plugins/devflow/devflow/templates/summary.md, plugins/devflow/devflow/workflows/execute-trd.md]
---

## Problem

EST-06's forward token stamp (`tokens stamp {objective}-{trd} --draft <path>` before `summary post`) reached 8 of the 41 executor SUMMARYs of objectives 59-63 (19.5%: 61-02, 61-04, 61-05, 62-01, 62-05, 62-08, 63-01, 63-02), and none in 59 or 60. The other 33 were recovered by `tokens backfill` (EST-07) in 64-03. The step is in the repository's `plugins/devflow/agents/executor.md` (the `tokens stamp ... --draft` line), the mirrored `execute-trd.md` workflow and `templates/summary.md`, but no installed executor agent prompt carries it: `rg -l "tokens stamp"` over `~/.claude/plugins/cache/aocyber/devflow/{2.7.1,2.10.1,2.11.0,2.12.0,2.13.1}/agents/executor.md` and the marketplace copy matches none. A spawned executor stamps only when it happens to follow the @-referenced workflow or template text. Report: `.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` (Defects found, item 1).

## Solution

Release a plugin version that ships the repository's current `agents/executor.md` (no code change is needed), re-sync the runtime, then confirm: `rg -l "tokens stamp" ~/.claude/plugins/cache/aocyber/devflow/<new version>/agents/executor.md` matches, and after the next objective `rg --files-without-match '^tokens_input:' .planning/objectives/<N>-*/*-SUMMARY.md` prints nothing without a backfill. Consider a repo test that fails when `agents/executor.md` lacks the stamp step.

## Resolution (objective 75, 2026-10-10)

The stamp step now ships in the installed executor prompt, a repository test fails without it, and the forward stamp reaches executor SUMMARYs without a backfill. Objective 66 built it (EST-09 built) and the 3.0.0 plugin carries it. Checked in TRD 75-04:

- Installed prompt: `rg -n "tokens stamp" ~/.claude/plugins/cache/aocyber/aoforge/3.0.0/agents/executor.md` matches at lines 969, 1066 and 1073 (line 1066 is `node ~/.claude/aoforge/bin/aof-tools.cjs tokens stamp {objective}-{trd} --draft <draft path>`). The todo's problem ("no installed executor agent prompt carries it") no longer holds.
- Repository test (the todo's "consider a repo test"): `plugins/aoforge/aoforge/bin/lib/tokens-cli.test.cjs` tests 11 ("executor.md <self_check> runs tokens stamp before summary post, and says never type the numbers") and 12 ("execute-trd.md create_summary_with_evidence names tokens stamp before summary post") assert the step and its order. `node --test --test-name-pattern='executor.md <self_check>|create_summary_with_evidence' .../tokens-cli.test.cjs` printed `✔ 11.`, `✔ 12.`, `pass 2`, `fail 0`. Objective 66 also added the SubagentStop gate `gate-executor-stop.js`, which sends an executor back once when its final SUMMARY has no `tokens_input`/`tokens_output`.
- Coverage: `node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --raw`, first line verbatim: `v1.6 forward-stamped 89/91 = 0.978021 (target 95%: met) · live 89 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)`. The two missing are `65-02` and `65-03` (`no_transcript`). The todo measured 8 of 41 (19.5%) on objectives 59-63; v1.6 executor SUMMARYs now carry live stamps with no backfill.

Whether EST-09 is marked complete is a separate decision: it is made in TRD 75-05 (the requirement reads Pending in `.aoforge/REQUIREMENTS.md`, "built; coverage 6/8 = 0.75, re-measured by 75"). This todo's work, shipping the step, is done.
