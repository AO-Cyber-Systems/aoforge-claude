---
objective: 62-built-in-sweep
trd: "10"
type: standard
wave: 4
depends_on: ["62-04", "62-05", "62-06", "62-07", "62-08", "62-09"]
files_modified:
  - plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
  - docs/built-in-sweep.md
  - plugins/devflow/devflow/workflows/help.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: [BLTN-01, BLTN-02, BLTN-03]
must_haves:
  truths:
    - "The baseline directory is gone and the repo test fails if it returns; with no pending list, any prose prompt, missing progress, missing draft review or undeclared built-in fails CI outright"
    - "Every docs/built-in-sweep.md row, manual rows included, is resolved in its file, and the document's status line says the sweep is closed and lists what each row became"
    - "Each success criterion is observed outside the unit tests: progress counts and plan-mode spans printed for the real flows, zero scanner findings on the real tree, and best-effort live runs of /devflow:micro (task tools enabled) and of the ExitPlanMode pre-approval probe"
    - "CHANGELOG [Unreleased], USER-GUIDE and help.md describe the shipped behaviour (progress tasks and how to enable the task tools, plan-mode draft reviews and their skip rules, AskUserQuestion conventions, the CI check); CLAUDE.md grows by one bullet"
    - "Full `npm test` passes except failures proven pre-existing on the objective's base commit"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
      provides: "the closed ratchet: baseline directory must not exist; manual inventory rows checked"
    - path: docs/built-in-sweep.md
      provides: "the final BLTN-03 list of converted prompts"
    - path: docs/USER-GUIDE.md
      provides: "a section on progress, plan mode and questions"
  key_links:
    - "Precedent: TRD 48-23 deleted __fixtures__/planning-writes-baseline/ and made its presence a failure"
    - "doc-refs.repo.test.cjs keeps every /devflow: reference in the edited docs valid"
---

# TRD 62-10: Close the ratchet, dogfood, document, full suite

<objective>
Close objective 62.

1. **Close the ratchet.** The six conversion TRDs deleted the eight group baseline files. Make the directory's absence a
   test (as 48-23 did for planning-writes), drop the pending branches so every check fails outright, and check the
   inventory's `manual` rows too. Mark the inventory closed and make each Conversion cell say what shipped.
2. **Dogfood.** Observe each success criterion outside the unit tests: static measurements on the real flows, plus two
   best-effort live Claude Code runs in scratch directories (micro with the task tools enabled; a probe of whether a
   skill's `allowed-tools: ExitPlanMode` pre-approves a plan). The interactive checks that headless runs cannot do
   (approving a plan, answering an AskUserQuestion) are handed to `/devflow:verify-work 62` as UAT items.
3. **Document and run everything.** CHANGELOG, USER-GUIDE, help.md, one CLAUDE.md bullet; full `npm test`.

Purpose: SC1-SC3 hold, are enforced without exceptions, and are documented. Output: the closed test, the final
inventory, doc edits, dogfood evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- No skill or workflow changes except help.md's documentation text. If closing the ratchet or the dogfood finds an
  unconverted prompt, a missing progress or draft review, or a leftover baseline entry, stop: record it in the SUMMARY
  as a gap with the exact command and output, for the verifier and gap closure. Do not patch it here.
- Scratch work lives under the session scratchpad with a scratch HOME, never this checkout's `.planning/` or the real
  `~/.claude`. Use the repo copy of df-tools (`node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs`).
- No transcript content, credentials or other-repo paths in any doc.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call (no `&&`, `;`, pipes or `cd`). Set an env var for one run with an inline prefix (`HOME=<dir> claude ...`).
  Never use port 8080; nothing here starts a server.

## Test list

`builtin-sweep.repo.test.cjs` after this TRD:

1. `__fixtures__/builtin-sweep-baseline/` does not exist.
2. Every scanPrompts finding fails (no baseline to consult), listed `file:line: kind: text`.
3. Every PROGRESS_FLOWS and DRAFT_FLOWS check must pass outright.
4. Every skill's coverage has no missing and no forbidden tool (ALLOWED_TOOLS_EXEMPT entries still allowed, with the
   needed and reason checks).
5. Inventory test 9 checks every row, `manual` rows included, for resolution; there is no pending state.
6. Tests 1, 8, 10 and 11 unchanged.

<embedded_context>

<codebase_examples>
`planning-writes.repo.test.cjs` test 10 is the shape for test 1: "The planning-writes-baseline/ directory does not exist
(no ratchet left)", with `BASELINE_DIR = path.join(__dirname, '__fixtures__', 'planning-writes-baseline')` kept as a
constant whose presence is the failure.

Docs to update:
- `CHANGELOG.md` `## [Unreleased]` has `### Added`, `### Changed`, `### Fixed`.
- `docs/USER-GUIDE.md`: add a `### Progress, plan mode and questions` section (near `## Hooks and what they enforce`
  or under `## Command Reference`, wherever the outline reads best).
- `plugins/devflow/devflow/workflows/help.md` ~line 483: "Claude Code's built-in plan mode (`EnterPlanMode`) is used by
  `/devflow:build` and `/devflow:plan-objective` to present the execution strategy before spawning expensive agent
  pipelines." Now: build presents its strategy; plan-objective, new-project and milestone complete present their drafts.
- `CLAUDE.md` `### Core Tool` list: one bullet in the existing style, for example
  `- **Built-in sweep** (Unreleased) — \`builtin-sweep.repo.test.cjs\` fails CI on a discrete-choice prose prompt outside AskUserQuestion, an AskUserQuestion schema break, missing TaskCreate/TaskUpdate progress in micro/quick/build/debug/plan-objective/verify-work, a missing plan-mode draft review in plan-objective/new-project/milestone complete, or an undeclared built-in (ExitPlanMode is never pre-approved). Inventory: \`docs/built-in-sweep.md\`; rules: \`references/built-ins.md\`.`
</codebase_examples>

<anti_patterns>
- Do not restate numbers from memory; quote the commands' output captured in Task 2.
- Do not document behaviour the dogfood did not observe; if a live run is skipped, say the shipped behaviour is checked
  statically and name the UAT item.
- Do not grow CLAUDE.md by more than the one bullet: it is resident context on every turn.
- Do not run the live checks against the real HOME (sync-runtime would mirror this branch over the installed runtime).
</anti_patterns>

<error_recovery>
- If the live micro run cannot start (auth, network, `--plugin-dir` unknown, the installed `devflow@aocyber` shadowing
  the clone), record `live micro: skipped — <exact reason>`; the static counts are the required evidence.
- If the ExitPlanMode probe cannot run, record `probe: skipped — <reason>`; the rule (never declare ExitPlanMode) holds
  either way because omitting it costs nothing.
- Pre-existing `npm test` failures: run the failing file at the objective's base commit in a scratch worktree
  (`git worktree add <scratch> <base>`, `node --test <file>` there, `git worktree remove <scratch>`) and record the
  comparison. MA-7 (`doctl auth init`) and the devflow-watch / handoff-e2e environmental failures are known from
  objectives 35 and 44.
</error_recovery>

</embedded_context>

<gotchas>
- `<base>`: the parent of the first `(62-01)` commit: `git log --format=%H --reverse --grep="(62-01)"`, take the first
  line, then `git rev-parse <that>^`. Two plain commands.
- Scratch project for the live micro run: a temp dir with `git init`, a `README.md` holding the word `teh`, and a
  minimal `.planning/` (PROJECT.md with `kind: cli`, ROADMAP.md, STATE.md, config.json with `"mode": "yolo"`), committed
  once. The run needs the scratch project as its cwd, and Bash calls here are one plain command each, so put it in a
  script `<scratchpad>/run-micro.sh` (written with the Write tool) whose two lines are `cd <scratch project>` and
  `HOME=<scratch home> CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p --plugin-dir <checkout>/plugins/devflow --output-format stream-json --verbose --dangerously-skip-permissions "/devflow:micro fix the typo teh -> the in README.md" > <scratchpad>/micro-stream.jsonl`,
  then run `bash <scratchpad>/run-micro.sh` (Bash timeout 300000). Skipping permissions is acceptable only because the
  cwd and HOME are both scratch. Pass: the stream has `tool_use` entries named `TaskCreate` and `TaskUpdate` (with
  `in_progress` and `completed`) and the scratch repo has a `chore(micro): ...` commit.
- ExitPlanMode probe: a scratch plugin `<scratch>/probe-plugin/` with `.claude-plugin/plugin.json`
  (`{"name":"probe","version":"0.0.1"}`) and `skills/probe/SKILL.md` whose frontmatter has
  `allowed-tools: [EnterPlanMode, ExitPlanMode]` and whose body says: call EnterPlanMode, put the one-line plan "probe
  plan" in the plan, call ExitPlanMode, then report whether the plan was approved. Run
  `HOME=<scratch home> claude -p --plugin-dir <scratch>/probe-plugin --output-format stream-json --verbose "/probe:probe"`
  (same script approach, cwd a scratch dir) twice: as written, and with ExitPlanMode removed from allowed-tools. Record each ExitPlanMode `tool_result`
  (approved, denied, or an error). If the first is approved and the second is not, allowed-tools pre-approves plan
  approval, which confirms the rule; say so in USER-GUIDE in one sentence.
- UAT items for `/devflow:verify-work 62` (write them in the SUMMARY under a `## UAT handoff` heading): an interactive
  `/devflow:plan-objective` on a scratch project with `workflow.auto_advance: false` shows the TRD drafts in plan mode,
  "keep planning" with feedback produces a revision and a second review, approval pushes; an interactive
  `/devflow:new-project` shows PROJECT.md, requirements and roadmap reviews; `/devflow:milestone complete` shows the
  entry and PROJECT.md review; one converted prompt (for example `/devflow:objective remove`) renders as an
  AskUserQuestion with the safe option first.
- USER-GUIDE section content: which flows report progress and the task subjects; that the task tools need
  `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` on models that do not provide them by default (Claude Code v2.1.268+), with nothing
  breaking when they are absent; the three draft reviews, their skip rules (and why new-project keys on `--auto` only),
  the "keep planning" loop, and that approval switches the permission mode; AskUserQuestion conventions in brief; the
  CI check and the inventory. Note it needs an installed plugin carrying objective 62.
- CHANGELOG: Added (builtin-audit scanner and builtin-sweep CI check; references/built-ins.md; docs/built-in-sweep.md;
  plan-mode draft reviews in plan-objective, new-project, milestone complete; progress tasks in the six flows;
  `disallowed-tools: AskUserQuestion` on adopt). Changed (plan-objective step 5 prints the strategy instead of a plan-mode
  approval, and TRDs are pushed after the review; every discrete-choice prompt converted to AskUserQuestion, with the
  count from the inventory). Fixed (AskUserQuestion calls with no options in micro and quick; headers over 12 characters;
  questions with more than 4 options in new-project; build and plan-objective no longer pre-approve ExitPlanMode).
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Close the ratchet and finalise the inventory</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs, docs/built-in-sweep.md</files>
  <action>
1. Confirm every wave-3 baseline is gone: `ls plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline`.
   A remaining file with entries is a gap: stop and record it (binding rules). An empty directory left on disk is
   untracked; remove it.
RED: rewrite the test to test-list items 1-6 (absence test; no pending branches; manual rows checked). Run it. If it
fails, the failures are gaps from wave 3: record and stop. If it passes at once (wave 3 left nothing), say so in the
commit body. Commit `test(62-10): close the built-in sweep ratchet`.
2. docs/built-in-sweep.md: status line `Status: closed (TRD 62-10). Every row below is converted or marked.`; update
   each Conversion cell whose wave-3 SUMMARY recorded a deviation (read the deviation lists in the SUMMARYs of 62-04 to 62-09); add a
   one-line count per kind under `## Prompts`. Run the repo test (test 9 must pass for every row). Commit
   `docs(62-10): the built-in sweep inventory is closed`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes with test-list items 1-6. `rg -n "pending|baseline" plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` shows only the absence test and its comment.</verify>
  <done>CI enforces BLTN-01..03 with no exceptions list; the inventory records what shipped.</done>
</task>

<task type="auto">
  <name>Task 2: Dogfood every success criterion</name>
  <files>(none in the repository — scratchpad only)</files>
  <action>
Run each row; record the exact command and the relevant output in the SUMMARY.

| # | SC | Run | Expect |
|---|----|-----|--------|
| D1 | 1 | `node -e` printing `progressCounts` and the allowed-tools of each PROGRESS_FLOWS entry (require builtin-audit.cjs from the checkout) | each flow at or above its minimum, in_progress ≥ 1, TaskCreate and TaskUpdate declared |
| D2 | 2 | `node -e` printing `planModeSpans` for the three DRAFT_FLOWS files and `skillCoverage(...).forbidden` for every skill | each draft flow has a span mentioning a draft with a skip line; no skill declares ExitPlanMode |
| D3 | 3 | `node -e` running scanPrompts over scanSet; count rows per kind in docs/built-in-sweep.md | zero findings; the counts |
| D4 | 1 | The live micro run (gotchas) | TaskCreate and TaskUpdate tool_use in the stream; a `chore(micro):` commit; or `skipped — <reason>` |
| D5 | 2 | The ExitPlanMode probe (gotchas) | the two tool_results recorded; or `skipped — <reason>` |
| D6 | 2, 3 | Write the UAT handoff list | the four interactive checks for /devflow:verify-work 62 |

Afterwards `git status --porcelain` in this checkout shows nothing new. Remove the scratch dirs and homes. No commit.
  </action>
  <verify>The SUMMARY has the D1-D6 table with real outputs and the UAT handoff list.</verify>
  <done>Every success criterion is observed through the shipped prose and, where possible, a live run; the rest is handed to UAT.</done>
</task>

<task type="auto">
  <name>Task 3: CHANGELOG, USER-GUIDE, help.md, CLAUDE.md; full test suite</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, plugins/devflow/devflow/workflows/help.md, CLAUDE.md</files>
  <action>
1. CHANGELOG `## [Unreleased]` per the gotchas, numbers from Task 1-2 output.
2. USER-GUIDE: the new section per the gotchas (plus one sentence on the D5 result if it ran); add it to the Table of
   Contents if the section is top-level enough to appear there.
3. help.md: rewrite the plan-mode paragraph; check the verify-work and plan-objective descriptions still match.
4. CLAUDE.md: the one bullet.
5. Run `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs`.
Commit `docs(62-10): document progress tasks, plan-mode draft reviews and AskUserQuestion conventions`.
6. Full suite: `npm test` (Bash timeout 600000). For any failure, prove it pre-existing at `<base>` (error_recovery) or
   record it as a gap. Record the totals in the SUMMARY.
  </action>
  <verify>`rg -n "CLAUDE_CODE_ENABLE_TODO_TOOLS|plan mode|AskUserQuestion|builtin-sweep" docs/USER-GUIDE.md CHANGELOG.md` matches in both. `rg -n "present the execution strategy" plugins/devflow/devflow/workflows/help.md` prints nothing. doc-refs passes. `npm test` totals are in the SUMMARY with every failure classified.</verify>
  <done>Docs state the shipped behaviour; the full suite is green apart from proven pre-existing failures.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`.
- Objective gate (stack `gates.objective` → `test`): `npm test`.
</validation_gates>

<verification>
- The ratchet is closed; CI enforces BLTN-01..03 outright.
- Dogfood D1-D6 recorded; UAT items handed to verify-work.
- Docs updated; full `npm test` green apart from proven pre-existing failures.
</verification>

<success_criteria>
- [ ] No baseline remains and CI enforces the sweep without exceptions
- [ ] The inventory lists every converted prompt as shipped (BLTN-03)
- [ ] Success criteria observed and documented; full suite green
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-10-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`, with the D1-D6 table and the `## UAT handoff` list.
</output>
