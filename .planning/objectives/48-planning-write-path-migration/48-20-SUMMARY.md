---
objective: 48-planning-write-path-migration
trd: "20"
subsystem: planning-prose
tags: [gwp-02, prose-migration, todo, decision, debug, quick, micro, ratchet, tdd]

requires:
  - objective: 48-04
    provides: "planning-audit scanner, the `work` group baseline (14 findings) and the inline allow marker"
  - objective: 48-15
    provides: "exact CLI lines: todo add/complete, decision open/answer, debug put/resolve, quick put/summary, planning draft/mode"
provides:
  - "work.json baseline holds only `_comment` (group at zero)"
  - "todo, decide, debug, quick and micro prose route every planning write through the entity verbs"
  - "planning-paths quick deny hint names the slug: `quick put <N> <slug> --from <draft>`"
affects: [48-22, 48-23]

tech-stack:
  added: []
  patterns:
    - "Draft-then-verb: `planning draft <rel>` gives a temp path, the agent writes it, the verb saves it (`--from \"$DRAFT\"`)"
    - "Generated-view guard: hand edits of STATE.md sections with no state verb run only when `planning mode` prints `local`"
    - "Debug save points: `debug put` at session start, before any return or checkpoint, on pause and before `debug resolve` (not per hypothesis)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
    - plugins/devflow/devflow/workflows/add-todo.md
    - plugins/devflow/devflow/workflows/check-todos.md
    - plugins/devflow/skills/todo/SKILL.md
    - plugins/devflow/skills/decide/SKILL.md
    - plugins/devflow/agents/debugger.md
    - plugins/devflow/skills/debug/SKILL.md
    - plugins/devflow/devflow/templates/DEBUG.md
    - plugins/devflow/devflow/templates/debug-subagent-prompt.md
    - plugins/devflow/devflow/workflows/quick.md
    - plugins/devflow/skills/quick/SKILL.md
    - plugins/devflow/devflow/workflows/micro.md
    - plugins/devflow/skills/micro/SKILL.md
    - plugins/devflow/devflow/bin/lib/planning-paths.cjs
    - plugins/devflow/devflow/bin/lib/planning-paths.test.cjs

key-decisions:
  - "check-todos completes a todo with `todo complete` (moves to todos/completed/), not a hand `mv` to todos/done/; add-todo no longer creates todos/done. Existing done/ files stay readable (classified closed)"
  - "STATE.md \"Pending Todos\" and quick's \"Quick Tasks Completed\" edits have no state verb, so they run only in local mode (`planning mode`); in store mode STATE.md is a generated view and the issue is the record"
  - "Quick orchestrator owns the verbs: planner and executor write JOB/SUMMARY drafts, the orchestrator runs `quick put` / `quick summary`"
  - "Quick VERIFICATION.md is runtime-class in planning-paths (no verb owns it): one inline allow marker, not a rewrite"

requirements-completed: [GWP-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-01
tokens_input: 10274005
tokens_output: 57998
tokens_cache_read: 10099520
tokens_cache_write: 174317
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 20: Prose migration for todos, decisions, debug sessions, quick and micro Summary

**Audit group `work` is at zero, down from 14 findings, and `work.json` holds only `_comment`. Todos are added with `todo add --from <draft>` and completed with `todo complete`; check-todos no longer does a hand `mv` to `todos/done/`. Decisions use `decision open` / `decision answer`. Debug sessions are saved with `debug put` at defined save points and archived with `debug resolve`. Quick JOB and SUMMARY files go through `quick put` / `quick summary`. Micro's STATE row stays with `micro commit`. The `quick` deny hint now names the slug.**

## Accomplishments

- **Todos (U-3):**
  - add-todo: the agent writes the todo to a `planning draft` path, and `todo add --from "$DRAFT"` saves it. The verb derives `<date>-<slug>` from the `title:` frontmatter, the same name as before.
  - check-todos: "Work on it now" runs `todo complete [filename]`.
  - The commit lists both the pending path (which records the removal) and the completed path. This replaces the old `git rm --cached ... 2>/dev/null || true` line.
- **Decisions (D-09):**
  - The decide skill answers with `decision answer <id> --text "<choice>"`, or `--from <path>`, and documents both id forms: `DECISION-NNN` locally and `<trd>-d<k>` in store mode.
  - `decision-queue list` and `decision-queue notify` stay for reading and notification. `decision open` is named as the way to park a decision.
- **Debug (U-1):**
  - debugger.md's file protocol is now draft-based. `planning draft debug/{slug}.md` survives /clear, and `debug put` runs at the save points, never on every hypothesis.
  - archive_session runs `debug put` and then `debug resolve`, with no hand `mv`. Its commit lists the active and resolved paths.
  - The checkpoint, diagnose and context-management steps each save before returning.
  - The debug skill, debug-subagent-prompt and DEBUG.md template carry the same verbs.
- **Quick (U-1):**
  - Step 4 gets the JOB and SUMMARY draft paths. The planner and executor write those drafts.
  - The orchestrator runs `quick put <N> <slug> --from` (after the planner and after each revision) and `quick summary <N> --from`.
  - Step 7's STATE.md row is guarded by `planning mode`.
- **Micro:**
  - The explanatory lines now say that `micro commit` itself records the STATE row, and that STATE.md and ROADMAP.md are never edited by hand.
  - The code-edit line no longer reads as a planning write.
- **planning-paths quick hint:** the hint now reads `` `df-tools quick put 12 fix-x --from <draft>` ``, built from the directory slug that `QUICK_DIR_RE` captures. Before, it was missing the slug, so following it exited 1.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | 213fa139 | test(48-20): work group must have zero planning writes |
| 1 GREEN | cc080dcf | docs(48-20): todos and decisions use entity verbs |
| 2 | 1da4da29 | docs(48-20): debug, quick and micro use entity verbs |
| hint RED | 28841084 | test(48-20): quick deny hint must name the slug quick put takes |
| hint GREEN | 4561cce7 | fix(48-20): quick deny hint names the slug quick put takes |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test lib/planning-writes.repo.test.cjs` (no add-todo / check-todos / skills/todo / skills/decide in failures) | 1 (only Task 2 files listed) | PASS |
| 2 | `node --test lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs` | 0 (28/28) | PASS |
| 2 | `rg -n "debug (put\|resolve)" agents/debugger.md` | 0 (both present) | PASS |
| hint | `node --test lib/planning-paths.test.cjs lib/planning-writes.repo.test.cjs` | 0 (93/93) | PASS |
| verification | `rg -n "todos/done" workflows skills` | 1 (none) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/planning-writes.repo.test.cjs` with an empty `work.json` | 1 (14 findings across 7 files) | FAIL (correct) |
| GREEN | same | 0 (14/14) | PASS (correct) |
| RED (hint) | `node --test --test-name-pattern 5e lib/planning-paths.test.cjs` | 1 (`quick put 12 --from` lacks `fix-x`) | FAIL (correct) |
| GREEN (hint) | `node --test lib/planning-paths.test.cjs` | 0 (79/79) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/planning-writes.repo.test.cjs` | 0 | PASS: `work` group 0 findings (baseline 14 → 0) |
| regression | `node --test lib/doc-refs.repo.test.cjs lib/micro.test.cjs lib/check-todos.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 | PASS except the known flake: 7458 tests, 7425 pass, 1 fail (MA-7), 32 skipped |

**Full suite:** the single failure is **MA-7** in `handoff-e2e.test.cjs` (the doctl PTY race, TRD 19-05), a pre-existing flake. It was noted, not fixed. The suite ran before this SUMMARY existed, so roadmap-reconcile E2E1 passed. It will fail while this SUMMARY exists and ROADMAP shows `[ ]`, until the orchestrator ticks it.

## Invariant check (github.store off)

- **Same files as before:**
  - Each verb the prose now names writes the file the prose used to write by hand: `todos/pending/<date>-<slug>.md`, `debug/<slug>.md` → `debug/resolved/<slug>.md`, `quick/<N>-<slug>/<N>-JOB.md|SUMMARY.md` and `decisions/pending|resolved/DECISION-NNN.md`.
  - 48-12 and 48-15 pin these files byte-for-byte.
- **One location change:** todos now complete into `todos/completed/` (the df-tools location) instead of `todos/done/`.
- **No local-mode skips:** no prose tells an agent to skip a write in local mode. The only mode guard is around STATE.md section edits: local runs them as before, and store mode skips them because STATE.md is a generated view there.
- **No stderr redirects:** no df-tools verb line in these files redirects stderr. The remaining `2>/dev/null` uses are `ls`, `grep` and `cat` reads.

## Deviations from Plan

1. **[Rule 1 - Bug] planning-paths quick hint omitted the slug** (the known gap from 48-15).
   - `QUICK_DIR_RE` now captures the slug, and the hint is `quick put <N> <slug> --from <draft>`.
   - The test went in first (28841084) and the fix followed (4561cce7).
   - This touches files outside files_modified (`planning-paths.cjs` / `.test.cjs`), as the dispatch directed.
2. **[Rule 1 - Bug] STATE.md hand edits in store mode.**
   - add-todo, check-todos and quick Step 7 edited STATE.md sections that no `state` verb covers.
   - Following the TRD's error_recovery, each edit is now guarded by `planning mode`: local behaves as today, store skips the edit.
   - Without the guard, store mode would write into a generated view.
3. **[Interpretation] Micro has no prose-level STATE write to guard.**
   - The "Quick Tasks Completed" row is written by `df-tools micro commit` (`micro.cjs`), not by the agent.
   - The prose now says so, and forbids hand edits of STATE.md and ROADMAP.md.
   - `micro.cjs` still appends that row in store mode too. Changing that needs code outside this TRD's files (see Deferred).
4. **[Process] skills/todo/SKILL.md placement.** The verb note went into `<objective>` rather than at the end of `<process>`. Placed at the end, its verb lines sat within ±3 lines of the line that the GATE sensitivity test appends to this file, which masked the injected finding.
5. **[Process] Preflight first ran from the main checkout.**
   - The agent's cwd resets between Bash calls, so the first `exec-context check` claimed `/Users/justin/dev/devflow-claude` for 48-20.
   - That claim was released at once (`exec-context release --id 48-20`), and the check was re-run with `--cwd <worktree>`. It reported checkout = worktree and `base_visible: true`.
   - No other claim was touched.

## Deferred Issues

- **`micro.cjs` is not store-aware:** `commitMicro` appends a row to `STATE.md` in store mode as well, which writes into a generated view. A later code TRD should skip that write when `planning mode` is `store`.
- **Raw `git commit` in debugger.md:** archive_session still shows a raw `git commit -m` for the code fix. `gate-commits` blocks that. It is outside this TRD's planning-write scope.

## Post-TRD Verification

- Auto-fix cycles used: 1 (quick.md:78 named `quick put` without the `df-tools` prefix; fixed by naming the verb)
- Must-haves verified: 6/6
  - `work` group at zero
  - todos via verbs, no `mv`
  - decisions via `decision open|answer`
  - debug via `debug put|resolve`
  - quick via `quick put|summary`, and micro's STATE via df-tools
  - no stderr redirect on verb lines
- Gate failures: none from this TRD

## Self-Check: PASSED

- FOUND: commits 213fa139, cc080dcf, 1da4da29, 28841084, 4561cce7 (`git log --oneline da772beb..HEAD`)
- FOUND: `work.json` holds only `_comment`; ratchet GATE green
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after the merge
