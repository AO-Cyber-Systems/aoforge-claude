---
objective: 62-built-in-sweep
trd: "02"
subsystem: docs
tags: [built-ins, askuserquestion, plan-mode, progress, inventory]
requires: []
provides:
  - docs/built-in-sweep.md (the BLTN-03 inventory and conversion list, 120 rows)
  - plugins/devflow/devflow/references/built-ins.md (one rule set for progress, plan mode and questions)
affects: [62-03, 62-04, 62-05, 62-06, 62-07, 62-08, 62-09, 62-10, 62-11]
tech-stack:
  added: []
  patterns: [inventory table machine-checked by a repo test, runtime-list rule for AskUserQuestion]
key-files:
  created:
    - docs/built-in-sweep.md
    - plugins/devflow/devflow/references/built-ins.md
  modified: []
key-decisions:
  - "Free-text prompts stay prose; a row the scanner window already passes uses keep, not a marker, because a marker above a clean line is a stale bad marker"
  - "Bare Options: list heads cannot be quoted under the 12-character minimum, so each is covered by the neighbouring prompt row that deletes it"
  - "AskUserQuestion calls with no header, and the 6-question settings call, are recorded as schema rows even though the scanner's three checks do not see them"
metrics:
  duration: 14 min
  completed: 2026-10-06
tokens_input: 20678746
tokens_output: 124792
tokens_cache_read: 20416112
tokens_cache_write: 262418
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 02: Sweep inventory and conventions Summary

A 120-row inventory of every prompt in the 34 skills and 40 active workflows with its exact planned conversion, plus a 70-line rules reference for progress, plan mode and questions.

## Progress
- [x] Task 1: Inventory every prompt and plan its conversion — e4d9d06b
- [x] Task 2: Write references/built-ins.md — baa0a6ca

## What was built

- `docs/built-in-sweep.md`: the `## Prompts` table (columns `ID | Group | File | Detect | Kind | Before | Conversion`), `## Files with no prompt`, `## Progress (BLTN-01)`, `## Plan-mode draft reviews (BLTN-02)`, `## allowed-tools`, `## Out of scope`. 35 files have rows and 39 have none; 35 + 39 = 74 (34 skills + 40 active workflows).
- `plugins/devflow/devflow/references/built-ins.md`: Progress, Plan-mode draft review (the numbered loop, the skip rule, `## Requested changes`), Questions (limits, runtime lists, free text, subagents, the allow marker) and Enforcement.

Row counts. Per group: micro-quick-debug 8, verify-work 6, plan-build 9, new-project 8, milestone 18, execute-and-map 26, todo-status-objective 26, remaining 19 (120 total). Per kind: choice 84, schema 12, explanatory 10, free-text 8, subagent 4, ask-misuse 2. Detect: 68 `scan`, 52 `manual`.

## Notes for TRD 62-03 (reconcile)

- The scanner (62-01) is not in this worktree, so `Detect` was computed with a scratch replica of 62-01's CHOICE patterns, the 12-above and 6-below window, negation and the three schema checks. 62-03 settles the column against the real module.
- Five bare `Options:` list heads are scanner findings that cannot have a row of their own (a `Before` needs 12 characters). The `## Prompts` preamble lists each with the row whose Conversion deletes it: execute-objective.md line 1154 (BS-061), security-audit.md line 59 (BS-112), transition.md lines 102 and 519 (BS-073, BS-074), workstreams-merge.md line 53 (BS-093). 62-03's "a finding is satisfied by a row whose Before is contained in its text" rule needs an exception for them, or the pattern needs narrowing.
- BS-002 (quick.md `AskUserQuestion(`) is `manual` on purpose: the converted prompts in quick.md may also be written as `AskUserQuestion(` calls, so the text may never leave the file and the "Before gone" check would fail.
- BS-039 and BS-042 (new-milestone.md free-text `Ask:` lines) are `keep`, not marker rows: an `AskUserQuestion` mention within 6 lines below satisfies the scanner window, so a marker would be stale.
- Schema breaks the three scanner checks do not see, recorded as `schema` rows with `manual` detect: AskUserQuestion prose with no header (new-milestone x3, complete-milestone branches, cleanup, doctor, gh-sync), and settings.md's single call with 6 questions (the tool takes 1-4).
- Four subagent rows are recorded: execute-trd.md (marker) and, in discovery-objective.md, the confidence-gate AskUserQuestion, the medium-confidence line and `Acknowledge and proceed?` (each a checkpoint:decision return).

## Deviations from Plan

None - TRD executed as written, with two process notes:

1. The `df-tools` calls used `~/.claude/devflow/bin/df-tools.cjs --cwd <checkout>` (the dispatch's worktree rule) instead of the repo-relative path in the TRD text.
2. The doc was generated from a scratch row list and validated by script (every excerpt verbatim and unique, IDs sequential, 74-file union); the scripts are in the session scratchpad and are not committed.

Unrelated bugs found: none.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Inventory every prompt | node self-check (IDs sequential, Group in GROUPS, File exists, Before verbatim, 12+ chars, no backtick, union = 74) | 0 | PASS (prints `no error`, `74`) |
| 1: row count | `rg -c "^\| BS-" docs/built-in-sweep.md` | 0 | PASS (120, at least 50) |
| 1: headings | `rg -n "^## " docs/built-in-sweep.md` | 0 | PASS (six headings in order) |
| 2: Write references/built-ins.md | `wc -l plugins/devflow/devflow/references/built-ins.md` | 0 | PASS (70, under 140) |
| 2: required terms | `rg -n "CLAUDE_CODE_ENABLE_TODO_TOOLS\|EnterPlanMode\(\)\|ExitPlanMode\(\)\|Requested changes\|builtin-audit: allow\|12 characters\|allowed-tools"` | 0 | PASS (every term matches) |
| 2: doc refs | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 | PASS (24 tests, run after each task) |

## Discovered commands

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (inventory rows per prompt, all 74 files accounted for, progress / plan-mode / allowed-tools plans, one rule set in built-ins.md)
- Gate failures: None

## Self-Check: PASSED

- FOUND: docs/built-in-sweep.md
- FOUND: plugins/devflow/devflow/references/built-ins.md
- FOUND: e4d9d06b
- FOUND: baa0a6ca
