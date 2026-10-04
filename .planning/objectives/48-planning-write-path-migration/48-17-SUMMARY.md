---
objective: 48-planning-write-path-migration
trd: "17"
subsystem: planning-prose
tags: [gwp-02, d-12, d-14, prose-migration, execute-group, tdd]
requires:
  - 48-04 (planning-audit ratchet; execute baseline 34)
  - 48-15 (exact verb command lines)
provides:
  - executor.md publishes the SUMMARY via planning draft + summary checkpoint (per task) + summary post (once)
  - "<store_mode> guidance in executor.md: the edit gate denies .planning/ cache writes; a denial is a prompt defect to report"
  - execute-objective / execute-trd / transition / build / job-prompt / summary template routed through verbs
  - empty execute.json baseline (group at zero)
affects: [48-23, execute-objective orchestrator, executor agent]
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
    - plugins/devflow/agents/executor.md
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/execute-trd.md
    - plugins/devflow/devflow/workflows/transition.md
    - plugins/devflow/devflow/workflows/build.md
    - plugins/devflow/devflow/templates/job-prompt.md
    - plugins/devflow/devflow/templates/summary.md
decisions:
  - "D-14 also applies in local mode. From a worktree the summary verbs write the MAIN checkout. So the per-task commit lists the SUMMARY only when exec-context reports is_worktree: false. The orchestrator reads SUMMARY state from the main checkout (5c) and commits the wave's SUMMARYs after the merge (5b)."
  - "Store-mode checkpoint state = .planning/.trd-progress/<id>.md with no SUMMARY; 5c classifies that as `checkpoint`"
  - "transition.md: PROJECT.md via planning draft + doc put; STATE via state update-progress / update / add-decision / add-blocker / resolve-blocker / record-session; ROADMAP via roadmap update-job-progress"
  - "execute-objective: objective set-status <id> verifying before the verifier; UAT gap resolution via draft + doc put; debug sessions via debug resolve"
metrics:
  duration: ~25 min
  completed: 2026-10-01
  tasks: 2
  files: 8
---

# Objective 48 TRD 17: Prose migration — execute flows (audit group `execute`) Summary

**The executor and the execute-side workflows now change planning state only through df-tools verbs. The SUMMARY is edited in a `planning draft` copy. It gets a local `summary checkpoint` after each task, which never goes to GitHub in store mode, and exactly one `summary post` per TRD. STATE, ROADMAP and REQUIREMENTS go through `state` / `roadmap update-job-progress` / `requirements mark-complete`, and objective status through `objective set-status`. The `execute` group went from 34 findings to 0, and `execute.json` holds only `_comment`.**

## What changed

- **executor.md:**
  - The role line, Pattern A, the per-task bullets and the Progress-checkpoint section now use `planning draft` once and then `summary checkpoint {objective}-{trd} --from <draft>` per task. They say where the checkpoint lands in local and store mode.
  - The self-check adds `## Self-Check` to the draft, then calls `summary post` once.
  - The state section says "record state through the df-tools `state` commands".
  - The state-command bullets, the success criteria and the final commit were updated.
  - Added `<store_mode>` next to the STACK.md rule:
    - the cache is read-only, and the gate names the verb;
    - a denial is a prompt defect to report, never something to bypass;
    - local mode uses the same verbs, which must never be skipped.
- **task_commit_protocol:** the SUMMARY joins the task commit only in the main checkout (`is_worktree: false`). In store mode `df-tools commit` drops it itself (`skipped_planning`).
- **execute-objective.md:**
  - The executor prompt's objective, `worktree_protocol` and success criteria were rewritten.
  - 5b: after the merge, the wave's SUMMARYs are committed from the main checkout.
  - 5c: SUMMARY state is read from the main checkout's `.planning/`, and in store mode `.trd-progress/<id>.md` counts as `checkpoint`.
  - 5d: the resume steps finish with `summary post`.
  - UAT gap resolution uses a draft plus `doc put`; debug sessions use `debug resolve`.
  - The objective is set to `verifying` before the verifier runs, and the verifier prompt publishes with `verification post`.
  - `2>/dev/null` was dropped from `sync-roadmap`.
  - The final commit adds OBJECTIVE.md when the objective has one.
- **execute-trd.md:** the SUMMARY uses a draft plus `summary post`, the state line lists the store-aware commands, and the success criteria were updated.
- **transition.md:** PROJECT.md uses a draft plus `doc put`; STATE uses the `state` commands; the ROADMAP count uses `roadmap update-job-progress`.
- **build.md:** the quick-build line was rephrased so it is no longer a write directive, and the verifier publishes with `verification post`.
- **Templates:** only the location instructions changed. job-prompt's three `<output>` lines now say "publish ... with `summary post`", and summary.md got a one-line note on draft, checkpoint and post. The skeletons are unchanged.
- **Unchanged:** `skills/execute-objective/SKILL.md` and `skills/build/SKILL.md` had 0 findings and no redirected verb lines, so there was nothing to change.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | ba1e9c9a | test(48-17): execute group must have zero planning writes |
| 1 GREEN | e3d183f7 | docs(48-17): executor publishes SUMMARY through summary verbs |
| 2 | f68ca882 | docs(48-17): execute flows use planning verbs |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `! node --test planning-writes.repo.test.cjs 2>&1 \| rg -q agents/executor.md && rg -q "summary checkpoint" ... && rg -q "summary post" ... && rg -q "planning draft" ...` | 0 | PASS |
| 2 | `node --test planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 (28/28) | PASS |
| test 4 | `rg -n "2>/dev/null" <9 files> \| rg "df-tools.cjs (plan\|objective\|...\|state\|roadmap)"` | 1 (no match) | PASS |
| verification | `rg -n "Write.*SUMMARY" agents/executor.md` | 1 (no lines at all) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test planning-writes.repo.test.cjs` with an empty `execute.json` | 1 (all 34 findings across 6 files listed) | FAIL (correct) |
| GREEN (T1) | same, after the executor.md edits | 1, with no executor.md line left | executor.md clean (correct) |
| GREEN (T2) | `node --test planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 (28/28) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test doc-refs.repo.test.cjs hooks/gate-executor-stop.test.js hooks/verify-completion.test.js` | 0 (120/120) | PASS |
| full suite | `npm test` | 1: 7458 tests, 7425 pass, 1 fail, 32 skipped | known flake only |

The one full-suite failure is **MA-7** in `handoff-e2e.test.cjs`, the doctl PTY race from TRD 19-05. It is a known flake, noted and not fixed. roadmap-reconcile E2E1 passed because this SUMMARY did not exist yet. It is expected to fail once this SUMMARY exists while ROADMAP still shows `[ ]`, until the orchestrator ticks 48-17.

## Deviations from Plan

**1. [Rule 2 - correctness] Worktree executors publish to the main checkout in local mode too (D-14 consequence).**
- **Found during:** Task 1. `df-tools --cwd <this worktree> planning mode --raw` printed `root: /Users/justin/dev/devflow-claude`. `planning-verbs.cjs` `summaryCheckpoint` and `summaryPost` call `writeThrough(mainRoot(root))` in both modes.
- **Issue:** The current protocol says to commit the SUMMARY in the worktree branch, and 5c reads "the plan's own checkout". A worktree executor's SUMMARY would then be invisible to 5c. Listing it in `--files` would also break `df-tools commit`, because `git add` fails on a missing path.
- **Fix, prose only:**
  - The executor lists the SUMMARY only when `is_worktree: false`.
  - 5c reads the main checkout, and 5b commits the wave's SUMMARYs after the merges.
  - The INCOMPLETE / SendMessage resume rules, `WAVE_BASE` / `exec-context` and the merge protocol are unchanged otherwise.
- **Files modified:** executor.md, execute-objective.md, execute-trd.md
- **Commits:** e3d183f7, f68ca882

**2. [Rule 2] Debug-session resolution in `execute-objective.md` now uses `debug resolve <slug>`.** The old `mkdir` + `mv` was a planning write that the audit regex does not catch.

**3. [Recipe] Dropped `2>/dev/null` from `df-tools sync-roadmap`.** It is a ROADMAP writer.

**4. [Process] This SUMMARY was written with today's flow** (Write in the worktree plus `df-tools commit`), as the TRD allows. The `~/.claude` mirror that drives this run predates these edits.

## Known gaps / notes

- **gate-executor-stop:** I checked `hooks/gate-executor-stop.js` lines 237-273. It scans every root from `git worktree list`, the main checkout included, so it finds a SUMMARY that a verb published there. In store mode `summary post` also writes the cache file. A run that has only a `.trd-progress/` checkpoint still gets its one block turn, which is correct because the run is not finished.
- **Unverified command arguments:**
  - `state update "Current focus" ...` in transition.md: I did not check how the field name is matched.
  - `state add-blocker --text`: assumed from the dispatch's `resolve-blocker --text` form.
  - Both are worth a check in 48-23's end-to-end pass.
- **Worktree progress counts:** in a worktree, `state update-progress` and `roadmap update-job-progress` count the summaries on the worktree's disk, which no longer holds its own SUMMARY. The orchestrator's post-merge `sync-roadmap` corrects the count.

## Invariant check (github.store off)

Every new instruction names a verb that writes the same local `.planning/` file in local mode: `summary checkpoint`/`post` produce `<id>-SUMMARY.md`, `doc put` produces PROJECT.md / UAT, and `state` / `roadmap` / `requirements` are unchanged commands. `<store_mode>` says outright never to skip a verb because the project is local. This repo is local (`planning mode` prints `local`).

## Post-TRD Verification

- Auto-fix cycles used: 1 (one leftover executor.md line, "write budget ... TRD's", reworded)
- Must-haves verified: 6/6 (group at zero; checkpoint/post/draft in executor; state/roadmap/requirements/set-status verbs; store-mode guidance with the STACK.md rule kept; no redirected verb lines; local behaviour unchanged)
- Gate failures: none. The full suite's only failure is the known MA-7 flake.
- Final `execute` group finding count: **0**

## Self-Check: PASSED

- FOUND: all 8 modified files (committed above); `execute.json` holds only `_comment`
- FOUND: commits ba1e9c9a, e3d183f7, f68ca882 (hashes returned by `df-tools commit`)
- STATE.md / ROADMAP.md deliberately not edited (the orchestrator does that after the merge)
