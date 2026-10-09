---
objective: 62-built-in-sweep
trd: "10"
subsystem: prompts
tags: [builtin-sweep, ratchet, dogfood, docs, bltn-01, bltn-02, bltn-03]

requires:
  - "62-03: builtin-sweep.repo.test.cjs and the per-group baselines"
  - "62-04..62-09, 62-11: the seven conversion TRDs, which deleted all eight baseline files"
provides:
  - "builtin-sweep.repo.test.cjs with no baseline and no exceptions list: the baseline directory must not exist, every finding, flow and built-in fails outright, and manual inventory rows are checked"
  - "docs/built-in-sweep.md closed: status line, 121 rows each saying what shipped, BS-121 added, measured progress figures, a Reconciled at close section"
  - "CHANGELOG [Unreleased], a USER-GUIDE section (Progress, plan mode and questions), the help.md plan-mode paragraph and one CLAUDE.md bullet"
affects: []

tech-stack:
  added: []
  patterns:
    - "A manual inventory row is resolved when its text is gone, or stays on purpose (a keep, a header present in the file, or a reworded bare list head)"
    - "Closed ratchet: a constant for the deleted baseline directory whose presence is the failure (precedent 48-23)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
    - docs/built-in-sweep.md
    - plugins/devflow/devflow/workflows/help.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md

key-decisions:
  - "Manual rows are checked by their Conversion cell: text gone, `keep:`, every `header \"X\"` named present as an AskUserQuestion header in the file, or a reworded bare list head. Nothing else counts as resolved"
  - "BS-121 was appended (not inserted) so no existing BS number moved"
  - "The help.md plan-mode rewrite (BS-104) landed in Task 1, not Task 3, because the new manual-row check needs it and Task 1's verify must pass"
  - "built-ins.md and the live D4/D5 runs were left alone (see Observations)"

requirements-completed: []

duration: 17min
completed: 2026-10-06
tokens_input: 31840572
tokens_output: 120167
tokens_cache_read: 31509258
tokens_cache_write: 331038
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 10: Close the ratchet, dogfood, document, full suite Summary

**The built-in sweep ratchet is closed: no baseline directory, no pending list, no exceptions, manual inventory rows checked, and the inventory says what each of its 121 prompts became. The success criteria are measured on the real tree (progress counts, plan-mode spans, zero scanner findings), CHANGELOG, USER-GUIDE, help.md and CLAUDE.md describe the shipped behaviour, and the full suite passes apart from one failure that fails identically at the base commit. The two live Claude Code runs were skipped (no login under a scratch HOME).**

## Progress
- [x] Task 1a: close the ratchet in builtin-sweep.repo.test.cjs (baseline directory absent, no pending branches, manual rows checked); BS-104 help.md plan-mode paragraph reworded so the manual check passes — 59a53986
- [x] Task 1b: docs/built-in-sweep.md closed (status line, cells reconciled with what shipped, BS-121 added, counts, Shipped progress figures, "Reconciled at close"); tests 8a and 8d added — f205fee4
- [x] Task 2: dogfood D1-D6 (scratchpad only, no commit; evidence below) — no commit
- [x] Task 3a: CHANGELOG, USER-GUIDE section, help.md plan-objective bullet, CLAUDE.md bullet — dc8f5a78
- [x] Task 3b: full `npm test`, planning-writes fix to the help.md paragraph — 06761797

## What changed

- **Ratchet.** `builtin-sweep.repo.test.cjs` lost the baseline machinery (reader, shape check, listed-or-stale checks, group files) and gained: test 2, the `__fixtures__/builtin-sweep-baseline/` directory does not exist (with a sensitivity test over a temp directory, empty or not); test 3, any scanPrompts finding fails, listed `file:line: kind: text`; tests 4 to 6, every progress flow, draft flow and allowed-tools pair passes outright (`ALLOWED_TOOLS_EXEMPT` stays empty); test 8a, the inventory's status line says `Status: closed (TRD 62-10).`; 8b, every row is resolved, manual rows included (`checkManualRow`); 8d, the row, kind and group counts the document states match its table; 9, a sensitivity test for `checkManualRow`. The tests were renumbered; the old tests 1, 8, 10 and 11 are tests 1, 7, 9 and 10 with their content unchanged.
- **Inventory.** Status line closed. Conversion cells changed to what shipped: BS-003, 004, 008, 009, 014, 022, 023, 028, 031, 047, 058, 067, 068, 081, 101, 116, with a `Reconciled at close` section naming each and why. BS-121 (execute-objective's unresolvable-checkpoint prompt, found and converted by 62-08, no row) was added. The Progress table's `Today` column is now `Shipped`, from D1. A `Rows per outcome` line was added (82 AskUserQuestion with a header, 10 replaced by a neighbouring one, 11 reworded, 6 marked, 4 kept, 2 plan-mode reviews, 2 plain-text asks, 3 checkpoint returns, 1 deleted).
- **Docs.** CHANGELOG `[Unreleased]` Added (4 bullets), Changed (3), Fixed (2); USER-GUIDE `### Progress, plan mode and questions`; help.md plan-mode paragraph rewritten and a plan-objective bullet added; one CLAUDE.md bullet.

## Dogfood evidence (Task 2, scratchpad only)

| # | SC | Run | Result |
|---|----|-----|--------|
| D1 | 1 | `node -e` over `progressCounts` and `skillCoverage` for each PROGRESS_FLOWS entry | micro 1/1/1, quick 4/6/4, build 7/5/5, debug 4/5/4, plan-objective 6/5/5, verify-work 5/8/4 (creates/completed/in_progress; floors 1, 2, 4, 2, 4, 2); every flow's skill declares TaskCreate and TaskUpdate; no missing built-in |
| D2 | 2 | `node -e` over `planModeSpans` for the three DRAFT_FLOWS files, and `skillCoverage(...).forbidden` for every skill | plan-objective 1 span (enter 769, skip rule 752, exit 779), new-project 3 spans (395/392/399, 972/969/992, 1115/1112/1121), milestone-complete 1 span (367/359/377), every span presents a draft; each of the three skills declares EnterPlanMode and none ExitPlanMode; 34 skills checked, `forbidden` empty |
| D3 | 3 | `node -e` running `scanPrompts` over `scanSet`, and counting inventory rows | 74 files scanned, 0 findings; 121 rows (69 scan, 52 manual) by kind choice 85, explanatory 10, free-text 8, schema 12, subagent 4, ask-misuse 2 |
| D4 | 1 | live `/devflow:micro` with `HOME=<scratch> CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p --plugin-dir <checkout>/plugins/devflow ...` in a scratch git project | skipped: the run answered `Not logged in · Please run /login` (a scratch HOME holds no credentials, and none were copied). It did start: the init event shows the plugin loaded inline from the checkout (devflow 2.13.2) and, with the variable, the tools TaskCreate, TaskGet, TaskList, TaskStop and TaskUpdate. The same run without the variable listed only TaskStop. No `chore(micro):` commit and no TaskCreate call were observed; the progress behaviour is checked statically (D1) and handed to UAT |
| D5 | 2 | ExitPlanMode probe plugin | skipped: same login failure, and the headless `-p` tool list holds no EnterPlanMode, ExitPlanMode or AskUserQuestion, so a probe skill cannot call them there. USER-GUIDE therefore makes no claim about pre-approval; the rule (never declare ExitPlanMode) holds because omitting it costs nothing |
| D6 | 2, 3 | UAT handoff list | below |

Afterwards `git status --porcelain` in the checkout showed only the nine untracked `.planning/objectives/*/.gitkeep` files that existed before this TRD. The scratch project, HOME, plugin directory, scripts and streams were removed. The live runs' upgrade hook committed a `chore(devflow): upgrade project` change inside the scratch project only.

## UAT handoff

For `/devflow:verify-work 62`. A headless run cannot do these (it cannot approve a plan or answer a question), so a person does them in an interactive session on a scratch project:

1. `/devflow:plan-objective` on a scratch project with `workflow.auto_advance: false`: the TRD drafts show in plan mode; "No, keep planning" with feedback produces a revision and a second review; approval pushes the TRDs.
2. `/devflow:new-project` shows reviews of PROJECT.md, the requirements and the roadmap (the roadmap review has no Review full file option).
3. `/devflow:milestone complete` shows the MILESTONES entry and the PROJECT.md draft in one review before either is published.
4. One converted prompt, for example `/devflow:objective remove`, renders as an AskUserQuestion with Cancel first.
5. With `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, `/devflow:micro` on a scratch project shows one `Micro:` task going `in_progress` then `completed` and ends in a `chore(micro):` commit (D4 could not run live).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The help.md plan-mode paragraph tripped the planning-writes audit**
- **Found during:** Task 3, the first full `npm test`
- **Issue:** The paragraph written in Task 1a ended a sentence with "the PROJECT.md update", a write verb beside a planning artifact, so `planning-writes.repo.test.cjs` read it as a direct write. The scoped task gate (`builtin-sweep` and `doc-refs`) does not include that file, so it did not show earlier.
- **Fix:** "update" became "proposed PROJECT.md changes".
- **Files modified:** plugins/devflow/devflow/workflows/help.md
- **Commit:** 06761797

### Interpretation choices (not rule deviations)

- **help.md reword moved into Task 1.** The TRD puts the help.md paragraph in Task 3, but the inventory assigns BS-104 to this TRD, the new manual-row check fails while the paragraph holds its old text, and Task 1's verify needs the test green. The first run of the closed test failed on exactly one row, BS-104, so wave 3 left nothing behind. Task 3 kept the check of the plan-objective and verify-work descriptions, and added one plan-objective bullet.
- **How manual rows are checked.** The TRD says only that manual rows are checked. The check reads the Conversion cell: text gone or on marked lines, a `keep:`, every `header "X"` the cell names found as a header in the file, or a bare `Options:` head reworded (BS-061). Rows quoting text that stays are covered by those rules (the 4 keeps, and rows whose call kept its opener).
- **BS-121 appended.** Table order is group then file then line, but renumbering would break every SUMMARY's references, so the new row sits at the end and the intro says so.
- **Test numbering.** The TRD's "tests 1, 8, 10 and 11 unchanged" uses the old numbers; they are tests 1, 7, 9 and 10 now, unchanged.
- **Dogfood D4 and D5 skipped** as the TRD's error_recovery allows, with the exact reason above.

## Observations for the verifier (nothing patched, per the binding rules)

- `plugins/devflow/devflow/references/built-ins.md` section 4 still says "their planned conversions"; the file is outside this TRD's `files_modified`.
- skills/gh-sync step 1 (a choice mixed with a free-text `owner/repo`) and its mirror-only question name an AskUserQuestion with no header (62-11's observation). The scanner accepts them; they have no inventory row.
- `state update-progress` reports `Progress field not found in STATE.md` (pre-existing, not in this TRD's scope).
- Prompts left as prose with no row are listed in `Reconciled at close` in the inventory.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: ratchet | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` (17 tests, test-list items 1-6 plus 8a, 8d) and `rg -n "pending\|baseline"` on it: only the absence test, its helper and comments | 0 | PASS |
| 1: inventory | same test (8a, 8b, 8c, 8d) plus `node --test builtin-sweep.repo.test.cjs doc-refs.repo.test.cjs` (31 pass) | 0 | PASS |
| 2: dogfood | D1-D3 `node -e` runs (above); D4, D5 skipped with reasons; `git status --porcelain` shows nothing new | 0 | PASS (D4, D5 not run) |
| 3: docs | `rg -c "CLAUDE_CODE_ENABLE_TODO_TOOLS\|plan mode\|AskUserQuestion\|builtin-sweep"` USER-GUIDE 7, CHANGELOG 17; `rg -n "present the execution strategy" help.md` prints nothing; `node --test doc-refs.repo.test.cjs builtin-sweep.repo.test.cjs planning-writes.repo.test.cjs` 41 pass | 0 | PASS |
| 3: full suite | `npm test` | 1 | PASS except MA-7 (pre-existing, below) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test builtin-sweep.repo.test.cjs` after the rewrite: 1 failing test, 8b, naming BS-104 only (help.md still held its old plan-mode paragraph) | 1 | FAIL (correct) |
| GREEN (Task 1) | same, after the BS-104 reword | 0 | PASS (correct) |
| GREEN (8a, 8d) | same, with the status-line and count tests added alongside the inventory edit (not observed red first) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 (31 pass) | PASS |
| test (objective) | `npm test` first run | 1 | 10486 tests, 10451 pass, 3 fail, 32 skipped: MA-7, `planning-writes.repo.test.cjs` "the repo has zero planning-write findings" (the help.md line, fixed in 06761797), `roadmap-reconcile.test.cjs` E2E1 (ROADMAP.md still had `[ ]` for 62-10 beside its SUMMARY; `roadmap update-job-progress 62` ticked it) |
| test (objective) | `npm test` after both fixes | 1 | 10486 tests, 10453 pass, 1 fail, 32 skipped |

The one remaining failure is `handoff-e2e.test.cjs` MA-7 (`doctl auth init with unset DIGITALOCEAN_TOKEN`), which does not touch a file changed in objective 62. It fails identically at the objective's base commit 6ca818a8: in a scratch worktree (`git worktree add --detach <scratch> 6ca818a8`, node_modules linked in so node-pty loads, removed afterwards) `node --test --test-name-pattern="MA-7" handoff-e2e.test.cjs` printed the same `stderr should match arch-gap, resolution-failure, or timeout+detector-msg path; got: {"status":"done","exit_code":0,"stderr":""}`. Without node_modules the worktree skips the PTY tests and the daemon tests there fail on startup, so that run is not a comparison. MA-7 is the known environmental failure from objectives 35 and 44.

## Discovered commands

None: the TRD's commands were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the help.md planning-writes finding; the roadmap tick was a state step, not a fix)
- Must-haves verified: 5/5 (baseline directory gone and its return fails CI; every inventory row resolved and the status line closed; success criteria observed as D1-D3 on the real tree with D4 and D5 skipped for lack of a login and handed to UAT; CHANGELOG, USER-GUIDE, help.md and CLAUDE.md describe the shipped behaviour; full suite green except the proven pre-existing MA-7)
- Gate failures: the first full run's three failures, two fixed here and one proven pre-existing
- Files changed outside `files_modified`: none (STATE.md, STATE_ARCHIVE.md, ROADMAP.md and state.json by the df-tools state and roadmap commands)
- `requirements mark-complete` not run for BLTN-01..03 (the orchestrator marks them at objective completion)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs, docs/built-in-sweep.md, plugins/devflow/devflow/workflows/help.md, CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md
- FOUND commits: 59a53986, f205fee4, dc8f5a78, 06761797 (`git log --oneline -6`)
- GONE (as required): plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/
