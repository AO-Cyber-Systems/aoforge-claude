---
objective: 62-built-in-sweep
trd: "04"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/micro/SKILL.md
  - plugins/devflow/devflow/workflows/micro.md
  - plugins/devflow/skills/quick/SKILL.md
  - plugins/devflow/devflow/workflows/quick.md
  - plugins/devflow/skills/debug/SKILL.md
  - plugins/devflow/skills/verify-work/SKILL.md
  - plugins/devflow/devflow/workflows/verify-work.md
  - plugins/devflow/devflow/workflows/diagnose-issues.md
  - plugins/devflow/devflow/workflows/verify-objective.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/micro-quick-debug.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json
autonomous: true
requirements: [BLTN-01, BLTN-03]
must_haves:
  truths:
    - "/devflow:micro creates one progress task after `micro start`, sets it in_progress, completes it after `micro commit` and deletes it on `micro abort`"
    - "/devflow:quick tracks Plan and Execute (plus Check and Verify under --full) as tasks moving through in_progress to completed"
    - "/devflow:debug tracks Gather symptoms, the investigation, one task per hypothesis round and the fix"
    - "/devflow:verify-work shows one task per UAT test that goes in_progress when presented and completed with its result; diagnosis and gap-closure planning are tasks too; a resumed session re-creates tasks only for pending tests"
    - "micro and quick ask for a missing description in plain prose, not through an AskUserQuestion call without options"
    - "Every discrete choice in the four flows is an AskUserQuestion (plan-check stop, session picks, ready-to-investigate, root-cause and inconclusive next steps, resume-or-restart, max-iterations stop); free text (symptoms, 'pass or describe') stays prose"
    - "micro, quick, debug and verify-work declare the built-ins they call; the micro-quick-debug and verify-work baselines are empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/micro.md
      provides: "one progress task around the edit and commit; plain-text description prompt"
    - path: plugins/devflow/devflow/workflows/quick.md
      provides: "per-step progress tasks; AskUserQuestion for the plan-check stop"
    - path: plugins/devflow/skills/debug/SKILL.md
      provides: "symptom/investigation/hypothesis/fix tasks; AskUserQuestion for every next-step choice"
    - path: plugins/devflow/devflow/workflows/verify-work.md
      provides: "per-test progress through in_progress/completed; AskUserQuestion for the session pick, resume/restart and revision stop"
  key_links:
    - "builtin-sweep.repo.test.cjs PROGRESS_FLOWS micro (min 1), quick (min 2), debug (min 2), verify-work (min 2) pass without baseline entries"
    - "docs/built-in-sweep.md micro-quick-debug and verify-work rows are resolved (test 9)"
---

# TRD 62-04: Progress and questions in micro, quick, debug and verify-work

<objective>
Four of BLTN-01's six flows. Each reports progress with TaskCreate/TaskUpdate, and every discrete choice in them is an
AskUserQuestion (BLTN-03). This TRD owns two sweep groups, `micro-quick-debug` and `verify-work`.

- **micro** (`workflows/micro.md`): one task for the change. Its cost target is ~2k tokens, so exactly one task and
  three short calls. Step 1's description prompt is an AskUserQuestion call with no options (the tool needs 2-4); it
  becomes a plain-text question.
- **quick** (`workflows/quick.md`): one task per major step (Plan, Execute; Check and Verify under `--full`). Same
  description-prompt fix. `Offer: 1) Force proceed, 2) Abort` becomes an AskUserQuestion.
- **debug** (`skills/debug/SKILL.md`, no workflow file): tasks for gathering symptoms, the investigation, each
  hypothesis round and the fix. The session pick, the ready-to-investigate confirmation and the two `Offer options:`
  blocks become AskUserQuestion; the three freeform symptom questions stay prose.
- **verify-work** (`workflows/verify-work.md`, `diagnose-issues.md`): per-test tasks already exist and complete; add the
  `in_progress` state, progress for diagnosis and gap planning, and re-creation on resume. Prompts: the active-sessions
  `Reply with a number to resume, or provide an objective number to start new.` (runtime list),
  `If yes, offer to resume or restart.`, and the revision loop's `Offer options:` (Force proceed / Provide guidance /
  Abandon). The two `→ Type "pass" or describe what's wrong` lines and `Wait for user response (plain text, no
  AskUserQuestion).` are free text by design (severity is inferred from the user's words): they stay free text.

Work list: the `micro-quick-debug` and `verify-work` rows of `docs/built-in-sweep.md` and the two baselines.

Purpose: SC1 for micro, quick, debug and verify-work; their part of SC3. Output: prose edits and two emptied, deleted
baselines.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (groups `micro-quick-debug` and `verify-work`). Six other conversion TRDs
  run in parallel on their own files and baselines: never touch theirs. Do not edit agents.
- Read first: `plugins/devflow/devflow/references/built-ins.md` (the rules) and your groups' rows of
  `docs/built-in-sweep.md` (the work list; each Conversion cell is the spec). Do not edit the inventory. If a planned
  conversion is wrong in context, do the minimal correct thing and record it in the SUMMARY; 62-10 reconciles the doc.
- Ratchet TDD per task. RED: delete from the baseline the entries the task resolves (prompts, `progress` flows,
  `allowed_tools_missing` pairs), run the repo test, see it fail naming exactly those, commit `test(62-04): ...`.
  GREEN: edit the prose until it passes, commit `feat(62-04): ...`. When a baseline holds nothing, delete it:
  `git rm -q -- <file>`, then commit with df-tools `--files <file>`.
- Convert the form, not the gating: keep each prompt's outcomes and its `If "<label>"` routing (renamed to the new
  labels), and keep every skip (yolo, autonomous, `--auto`).
- Read narrowly (`rg -n`, then offset/limit). verify-work.md is ~665 lines: `rg -n "<step name"` first. Use targeted Edits.
- The UAT file is a draft saved with `df-tools doc put`; do not add write wording near `UAT` without a df-tools verb
  within 3 lines (planning-writes.repo.test.cjs).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

Assertions of `builtin-sweep.repo.test.cjs` (62-03) that this TRD turns green without a baseline entry:

1. Test 5, `micro`: creates ≥ 1, completes ≥ 1, in_progress ≥ 1; skills/micro declares TaskCreate and TaskUpdate.
2. Test 5, `quick`: creates ≥ 2, completes ≥ 2, in_progress ≥ 1; skills/quick declares both.
3. Test 5, `debug`: creates ≥ 2, completes ≥ 2, in_progress ≥ 1; skills/debug declares both.
4. Test 5, `verify-work` (SKILL.md + verify-work.md + diagnose-issues.md): creates ≥ 2, completes ≥ 2, in_progress ≥ 1;
   skills/verify-work declares both, and AskUserQuestion.
5. Test 2: no scanPrompts finding in the nine group files (`ask-without-options` in micro.md and quick.md included).
6. Test 7: no `micro:`, `quick:`, `debug:` or `verify-work:` pair missing or forbidden.
7. Test 9: every row of both groups resolved; test 8: no bad marker.
8. Neither baseline file exists, and test 4 still passes.

<embedded_context>

<codebase_examples>
Existing progress block in quick.md step 5 (keep the heading convention):

```
**Progress tracking (if available):**

TaskCreate(
  subject="Quick Task: ${DESCRIPTION}",
  description="Planning and executing quick task: ${DESCRIPTION}",
  activeForm="Executing quick task"
)
```

and its close in step 8: `TaskUpdate(taskId=quick_task_id, status="completed")`. An in_progress update, one call per
line: `TaskUpdate(taskId=plan_task_id, status="in_progress")`.

AskUserQuestion object form (new-project.md style):

```
AskUserQuestion([
  {
    header: "Plan check",
    question: "The checker still reports issues after 2 iterations. How do you want to proceed?",
    multiSelect: false,
    options: [
      { label: "Force proceed", description: "Execute the plan despite the remaining issues" },
      { label: "Abort", description: "Stop here; fix the description and run /devflow:quick again" }
    ]
  }
])
```

skills/debug/SKILL.md steps 2a-2b use the bullet form (`Use AskUserQuestion:` / `- header:` / `- options:`); stay with
it there.

micro.md step 1: `AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")`. quick.md
step 1: `AskUserQuestion(` / `header: "Quick Task",` / `question: "What do you want to do?",` / `followUp: null` / `)`.
Both are free text: ask in plain prose and wait.

debug SKILL.md: `## 1. Check Active Sessions` (`- User picks number to resume OR describes new issue`), `## 2. Gather
Symptoms` (2a, 2b AskUserQuestion; 2c-2e freeform `Ask inline:`; `After all gathered, confirm ready to investigate.`),
`## 3. Spawn debugger Agent`, `## 4. Handle Agent Return` (ROOT CAUSE FOUND → `- Offer options:` Fix now / Plan fix /
Manual fix; CHECKPOINT REACHED → present and get the response; INVESTIGATION INCONCLUSIVE → `- Offer options:` Continue
investigating / Manual investigation / Add more context), `## 5. Spawn Continuation Agent`.

verify-work.md steps: `initialize`, `check_active_session`, `find_summaries`, `extract_tests`, `create_uat_file`
(`Test {n}/{total}: {test_name}` tasks up front), `present_test` (a printed CHECKPOINT box, then `Wait for user response
(plain text, no AskUserQuestion).`), `process_response` (`TaskUpdate(taskId=test_task_id, status="completed")` under
"After any response"), `resume_from_file`, `complete_session`, `diagnose_issues` (a `Diagnose {N} UAT issues` TaskCreate,
never completed), `plan_gap_closure`, `verify_gap_plans`, `revision_loop` (`Offer options:` + three numbered options),
`present_ready`. diagnose-issues.md creates (~line 83) and completes (~line 146) one task per gap.

Runtime-list question for verify-work's active sessions:

```
AskUserQuestion([
  {
    header: "UAT session",
    question: "Resume an active UAT session, or type an objective number under Other to start a new one.",
    multiSelect: false,
    options: [
      { label: "{objective 1}", description: "Test {n}: {current test} — {progress}" },
      { label: "{objective 2}", description: "..." }
    ]
  }
])
```

Free-text marker, on the line above a flagged line outside a fence:

```
<!-- builtin-audit: allow free-text: pass or a description; severity is inferred from the user's words -->
Wait for user response (plain text, no AskUserQuestion).
```
</codebase_examples>

<anti_patterns>
- Do not grow micro beyond one task: its value is the ~2k-token path.
- Do not make debug's freeform symptom questions (2c-2e) or verify-work's per-test answer AskUserQuestion.
- Do not give the debugger agent TaskCreate; progress is the orchestrator's.
- Do not create tasks for UAT tests already answered when resuming; do not complete Diagnose before root causes are
  recorded.
</anti_patterns>

<error_recovery>
- If the repo test still reports `ask-without-options` after the free-text rewrite, a literal `AskUserQuestion(`
  survived; the plain-text prompt must not contain that call form.
- A debug CHECKPOINT REACHED response: AskUserQuestion when the checkpoint carries options (checkpoint:decision), prose
  otherwise (human-verify answers are "approved" or a description).
- verify-work's `present_test` box sits in a fenced block Claude prints to the user, so a marker inside it would be
  printed. Reword those two lines out of menu shape instead (for example `→ Describe what's wrong, or say pass`); a
  free-text row is resolved either way (test 9). Mark only lines outside fences.
</error_recovery>

</embedded_context>

<gotchas>
- The task tools are absent on newer models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; every progress block keeps the
  `**Progress tracking (if available):**` (or `**Update progress (if available):**`) heading.
- micro: create the task right after `micro start` returns `ok` (`subject="Micro: ${DESCRIPTION}"`,
  `activeForm="Making the micro change"`), `in_progress` at once, `completed` after `micro commit`, delete it
  (`TaskUpdate(taskId=micro_task_id, status="deleted")`) on `micro abort`. Add a line to micro.md's `<success_criteria>`.
- quick: `Plan: ${DESCRIPTION}` and `Execute: ${DESCRIPTION}` (plus `Check plan` and `Verify` under `--full`) created at
  step 5; `in_progress` at the start of steps 5, 5.5, 6, 6.5; `completed` at their ends. Replace the old single
  `Quick Task:` task and its step-8 close.
- debug: `Gather symptoms` at step 2 (completed when the user confirms), `Investigate: {slug}` at step 3 (in_progress at
  spawn), one `Hypothesis: <hypothesis>` task per continuation round (subject from the agent's return or the debug
  file's Current Focus `hypothesis:` line), completed when the round returns; `Fix: {slug}` on Fix now. Headers:
  `Session`, `Ready?`, `Root cause`, `Next step`.
- verify-work: `TaskUpdate(... status="in_progress")` before showing each test's box; the existing completed update in
  `process_response` gains `description="{pass | issue: severity | skipped}"`; `resume_from_file` re-creates tasks for
  `[pending]` tests; Diagnose goes `in_progress` at once and `completed` after root causes are recorded; a
  `Plan gap closure` task in `plan_gap_closure`. Headers: `UAT session`, `Max retries`.
- Skills here declare tools as YAML lists; skills/verify-work has Playwright entries: add `AskUserQuestion`,
  `TaskCreate`, `TaskUpdate` after `Task`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: micro, quick and debug — progress, plain-text descriptions, AskUserQuestion choices</name>
  <files>plugins/devflow/skills/micro/SKILL.md, plugins/devflow/devflow/workflows/micro.md, plugins/devflow/skills/quick/SKILL.md, plugins/devflow/devflow/workflows/quick.md, plugins/devflow/skills/debug/SKILL.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/micro-quick-debug.json</files>
  <action>
RED: remove every entry from `micro-quick-debug.json` (its prompts, the `micro`, `quick`, `debug` progress flows, the
`quick:` pairs). Run the repo test (fails naming them). Commit `test(62-04): micro, quick and debug leave the built-in
sweep baseline`.

GREEN:
1. micro.md: plain-text step 1; the progress block after step 2; updates in steps 4-5 and on abort. skills/micro: add
   TaskCreate, TaskUpdate.
2. quick.md: plain-text step 1; progress per the gotchas; `Offer: 1) Force proceed, 2) Abort` → AskUserQuestion
   (codebase example) with routing for both labels. skills/quick: add TaskCreate, TaskUpdate.
3. debug SKILL.md: progress per the gotchas; step 1 runtime list (sessions as options, a new issue typed under Other);
   step 2 end `Ready?` (`Investigate (Recommended)` / `Add more detail`); step 4 `Root cause` (`Fix now` / `Plan fix` /
   `Manual fix`) and `Next step` (`Continue investigating` / `Add more context` / `Manual investigation`); CHECKPOINT
   REACHED per error_recovery. allowed-tools: add TaskCreate, TaskUpdate.
4. Follow the inventory's Conversion cells where they differ; say so in the SUMMARY. Delete the now-empty baseline.
Run the repo test, `micro.test.cjs` and the prose suite. Commit
`feat(62-04): micro, quick and debug report progress and ask with built-ins`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/micro.test.cjs` passes; `micro-quick-debug.json` is gone; `rg -n "AskUserQuestion\(" plugins/devflow/devflow/workflows/micro.md plugins/devflow/devflow/workflows/quick.md` shows only calls with options.</verify>
  <done>Test-list items 1-3 hold, and items 5-8 for the micro-quick-debug group.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: verify-work progress through in_progress and completed, including diagnosis, gap planning and resume</name>
  <files>plugins/devflow/skills/verify-work/SKILL.md, plugins/devflow/devflow/workflows/verify-work.md, plugins/devflow/devflow/workflows/diagnose-issues.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json</files>
  <action>
RED: remove the `verify-work` progress flow and the `verify-work:` allowed-tools pairs. Run the repo test (fails).
Commit `test(62-04): verify-work progress leaves the built-in sweep baseline`.

GREEN: the verify-work progress edits from the gotchas (diagnose-issues.md too, if its gap tasks need an in_progress
update at spawn); add AskUserQuestion, TaskCreate and TaskUpdate to skills/verify-work. Run the repo test and the prose
suite. Commit `feat(62-04): verify-work shows each UAT test as it runs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes with no verify-work progress or allowed-tools entry. `rg -c "in_progress" plugins/devflow/devflow/workflows/verify-work.md` is at least 3.</verify>
  <done>Test-list item 4 holds.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The verify group's prompts</name>
  <files>plugins/devflow/devflow/workflows/verify-work.md, plugins/devflow/devflow/workflows/diagnose-issues.md, plugins/devflow/devflow/workflows/verify-objective.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json</files>
  <action>
RED: remove the remaining prompt entries from `verify-work.json`. Run the repo test (fails). Commit
`test(62-04): verify prompts leave the baseline`.

GREEN, per the inventory rows:
1. `check_active_session`: the runtime-list AskUserQuestion; with `$ARGUMENTS` and an existing session,
   `header: "UAT session"`, options `Resume (Recommended)` / `Restart`. Keep the routing to `resume_from_file` and
   `create_uat_file`.
2. `revision_loop`: `header: "Max retries"`, options `Force proceed` / `Provide guidance` / `Abandon`.
3. Free text: reword the two in-fence box lines, mark the line outside the fence (error_recovery).
4. Any other verify-work row (diagnose-issues.md, verify-objective.md) per its Conversion cell.
5. Delete the now-empty baseline with the prose.
Commit `feat(62-04): verify-work asks discrete choices with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes; `verify-work.json` is gone; the prose suite passes.</verify>
  <done>Test-list items 5-8 hold for both groups.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/micro.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- micro, quick, debug and verify-work pass the repo test's progress check with no baseline entry.
- Every row of both groups is resolved; both baselines are deleted.
- The prose suite is green.
</verification>

<success_criteria>
- [ ] micro, quick, debug and verify-work show TaskCreate/TaskUpdate progress (BLTN-01)
- [ ] Their discrete choices use AskUserQuestion; free text stays prose (BLTN-03)
- [ ] The micro-quick-debug and verify-work baselines are gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-04-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation from
its Conversion cell.
</output>
