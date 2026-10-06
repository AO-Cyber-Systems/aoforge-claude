---
objective: 62-built-in-sweep
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - docs/built-in-sweep.md
  - plugins/devflow/devflow/references/built-ins.md
autonomous: true
requirements: [BLTN-01, BLTN-02, BLTN-03]
must_haves:
  truths:
    - "docs/built-in-sweep.md lists every discrete-choice, free-text, explanatory, subagent, ask-misuse and schema prompt found in the 34 skills and 40 active workflows, one row each, with its group, file, a verbatim Before excerpt, its kind and the exact planned conversion"
    - "Every one of the 74 scanned files appears in the inventory, either in a Prompts row or under Files with no prompt"
    - "The inventory states the planned progress tasks for micro, quick, build, debug, plan-objective and verify-work, the plan-mode reviews for plan-objective, new-project and milestone complete, and every allowed-tools change"
    - "references/built-ins.md states one rule set for progress (TaskCreate/TaskUpdate, availability), plan-mode draft review (the loop and the skip rule) and questions (AskUserQuestion limits, runtime lists, free text, subagents, the allow marker)"
  artifacts:
    - path: docs/built-in-sweep.md
      provides: "the BLTN-03 inventory and conversion list (machine-checked by 62-03's repo test, closed by 62-10)"
    - path: plugins/devflow/devflow/references/built-ins.md
      provides: "the conventions every conversion TRD (62-04..62-09) and future prose follows"
  key_links:
    - "Prompts table columns, in order: ID | Group | File | Detect | Kind | Before | Conversion (62-03 parses it)"
    - "Group names match builtin-audit.cjs GROUPS (62-01) exactly"
    - "Each group's rows are the work list of its conversion TRD (62-04..62-09)"
---

# TRD 62-02: Inventory the sweep and write the conventions

<objective>
BLTN-03 requires "the sweep lists each prompt it converted", produced by an inventory pass first. This TRD is that pass,
plus the rule set the conversions follow.

1. **Inventory** (`docs/built-in-sweep.md`). Read every candidate prompt in the 34 skills and 40 active workflows,
   classify it, and decide its conversion now, concretely (header, question, option labels), so the six conversion
   TRDs in wave 3 are mechanical. Also record the planned progress tasks (BLTN-01), plan-mode draft reviews (BLTN-02)
   and allowed-tools changes.
2. **Conventions** (`plugins/devflow/devflow/references/built-ins.md`). One short reference for progress, plan mode and
   questions, written so the three draft-flow skills can load it with `@`.

This runs beside 62-01 (the scanner). 62-03 reconciles the two: every inventory row the scanner can see must be
flagged by it, and every scanner finding must have a row.

Purpose: the BLTN-03 list and the shared rules. Output: two documents. No skill or workflow changes here.
</objective>

<file_tree>
docs/
└── built-in-sweep.md                          ← CREATE
plugins/devflow/devflow/references/
└── built-ins.md                               ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Read only. Change no skill, workflow or agent. If a reading shows a bug unrelated to prompts, note it in the SUMMARY.
- Read narrowly: locate with `rg -n`, then read each hit's surroundings with offset/limit (±15 lines). Do not read a
  1,000-line workflow end to end.
- Every Before excerpt is copied verbatim from one line of the file: at least 12 characters, no backtick, and a `|`
  written as `\|`. Pick the most distinctive part of the line.
- Use real command names only (doc-refs.repo.test.cjs checks `/devflow:` references in docs).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

<embedded_context>

<codebase_examples>
A planner pre-scan on 2026-10-06 (approximate patterns, so treat it as a starting list, not the answer) found ~53
candidate lines. Known items the inventory must cover, by group:

- `micro-quick-debug`: micro.md `AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")`
  and quick.md's `AskUserQuestion(` / `header: "Quick Task"` / `followUp: null` call (both ask-misuse: free text through
  a tool that needs 2-4 options); quick.md `Offer: 1) Force proceed, 2) Abort`; debug SKILL.md
  `- User picks number to resume OR describes new issue`, `After all gathered, confirm ready to investigate.`, the two
  `- Offer options:` blocks in `## 4. Handle Agent Return`, `- Present checkpoint details to user` / `- Get user response`.
- `verify-work`: `Reply with a number to resume, or provide an objective number to start new.`,
  `If yes, offer to resume or restart.`, `→ Type "pass" or describe what's wrong` (twice, free text by design),
  `Wait for user response (plain text, no AskUserQuestion).`, `Offer options:` + `1. Force proceed` in revision_loop.
- `plan-build`: plan-objective.md `Offer: 1) Add more TRDs, 2) View existing, 3) Replan from scratch.`,
  `Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon`, the PLANNING INCONCLUSIVE bullet
  `offer: Add context / Retry / Manual`, the CHECKPOINT REACHED bullet `Present to user, get response`; build.md's three
  `--pause` waits (`wait for confirmation`).
- `new-project`: `Does this capture what you're building? (yes / adjust)` (becomes a plan-mode review),
  `"Write this as .planning/STACK.md? (yes / edit / skip)"`, `then offer to customize`,
  `Ask: "What are the main things users need to be able to do?"` (free text), `header: "Default work type"` (17 chars),
  the `Project kind` question (6 options) and the default-work question (7 options).
- `milestone`: complete-milestone.md `MUST present 3 options:`, `(yes / wait / adjust scope)`,
  `Ask: "Push tag to remote? (y/n)"`, `header="Archive Objectives"` (18 chars), `6. Offer to create next milestone inline`;
  new-milestone.md `Does this capture what you're building? (yes / adjust)`; plan-milestone-gaps.md
  `Create these {X} objectives? (yes / adjust / defer all optional)`, `Wait for user confirmation.`,
  the table cell `Ask user: include or defer?`.
- `execute-and-map`: transition.md `Ask: "Objective [X] complete — all [Y] plans finished. Ready to mark done...`, two
  `Options:` blocks with `Wait for user decision.`; execute-objective.md `Options:` (~line 1154), the
  `escalate to user ... Wait for user response` checkpoint line (~851), `report and ask the user how to proceed` (~1276);
  discovery-objective.md `Acknowledge and proceed? (yes / address first)` (runs inside the planner: subagent);
  map-codebase.md `What's next?` + `1. Refresh` + `Wait for user response.`, the STACK.md `(yes / edit / skip)` prompt,
  `Reply "safe to proceed"` + `Wait for user confirmation`; skills/map-codebase `offer to refresh or skip`.
- `todo-status-objective`: check-todos.md `Reply with a number to view details, or:` and
  `Invalid selection. Reply with a number (1-[N])`; health.md `Ask user if they want to run repairs:`, the 0006
  `ask the user to choose` kind prompt, `ask with three options: **Migrate now** / **Not now** / **Keep mirror mode**`;
  pause-work.md `ask user which objective they're pausing work on`, `Ask user for clarifications if needed`;
  resume-project.md `Offer to reconstruct STATE.md`, `[Secondary options:]` + `Wait for user selection.`;
  remove-objective.md `Proceed? (y/n)`; skills/decide `Ask the user which decision they want to resolve`,
  `**Options:**`; skills/handoff `ask the user what they'd like to do`.
- `remaining`: workstreams-merge.md `Options:` + `Wait for user decision.`; workstreams-setup.md
  `Offer to view status instead.`, `Wait for user confirmation before creating worktrees.`; security-audit.md
  `Options:` + `Wait for user response.`; skills/research-objective `Offer: 1) Update research, 2) View existing, 3) Skip.`;
  research-objective.md (2 hits); list-objective-assumptions.md `Wait for user response.`, `Wait for user selection.`;
  help.md `Presents tests one at a time (yes/no responses)` (explanatory) and the plan-mode paragraph
  (`EnterPlanMode` ... "present the execution strategy", ~line 483, explanatory, reworded by 62-10).

Current allowed-tools gaps (planner coverage run, transitive over `~/.claude/devflow/workflows/<n>.md` references):
build declares ExitPlanMode; cleanup lacks AskUserQuestion; execute-objective lacks TaskUpdate; flow lacks
AskUserQuestion; new-project lacks TaskCreate, TaskUpdate; plan-objective lacks TaskCreate, TaskUpdate and declares
ExitPlanMode; quick lacks TaskCreate, TaskUpdate; verify-work lacks TaskCreate, TaskUpdate.

Current progress wiring (creates / completed updates / in_progress updates): micro 0/0/0, quick 1/1/0, build 2/0/0
(both ui-eval follow-ups), debug 0/0/0, plan-objective 5/3/0, verify-work + diagnose-issues 3/2/0.
</codebase_examples>

<anti_patterns>
- Do not convert free text into AskUserQuestion. An open answer (a description, an issue report, pasted errors,
  "pass or describe what's wrong") stays prose; the row is `free-text` and its conversion is the allow marker.
- Do not invent options the flow cannot route. A conversion keeps the prompt's existing outcomes; it changes the form.
- Do not plan to change a prompt's gating. A prompt skipped in yolo, autonomous or `--auto` stays skipped.
- Do not plan AskUserQuestion inside a flow a subagent runs (the planner runs discovery-objective.md, the executor
  runs execute-trd.md). Those rows are `subagent`: the subagent returns a checkpoint and the orchestrator asks.
- Do not use AskUserQuestion with more than 4 options or a header over 12 characters, and never add an "Other"
  option: the tool always offers one.
</anti_patterns>

<error_recovery>
- A line that is both a prompt and an explanation (for example a purpose list naming a later prompt): classify it
  `explanatory` and point at the row of the real prompt.
- A prompt whose choices depend on runtime data (sessions, todos, decisions, branches): conversion is the runtime-list
  rule (references/built-ins.md). Do not mark it free-text because the list is long.
- If a candidate is ambiguous after reading its context, classify it the safer way (`choice`, converted) and say why
  in the Conversion cell.
</error_recovery>

</embedded_context>

<gotchas>
- **Prompts table**, exactly these columns in this order, one header row, then rows:
  `| ID | Group | File | Detect | Kind | Before | Conversion |`.
  - `ID`: `BS-001`, `BS-002`, ... in table order (group order of GROUPS, then file, then line).
  - `Group`: a GROUPS key from 62-01 (`micro-quick-debug`, `verify-work`, `plan-build`, `new-project`, `milestone`,
    `execute-and-map`, `todo-status-objective`, `remaining`).
  - `File`: repo-relative path (`plugins/devflow/devflow/workflows/quick.md`).
  - `Detect`: `scan` when one of 62-01's CHOICE patterns or schema checks (listed in 62-01's gotchas; reproduce them
    with `rg -n -P`) matches the line, else `manual`. 62-03 finalises this column.
  - `Kind`: `choice` | `free-text` | `explanatory` | `subagent` | `ask-misuse` | `schema`.
  - `Before`: the verbatim excerpt in backticks. One row may cover identical lines in the same file; say `(x2)` in the
    Conversion cell.
  - `Conversion`: for `choice`, `AskUserQuestion header "<12 max>": <Label A (Recommended)> / <Label B> / ...;
    routing unchanged` (or the runtime-list rule); for `free-text` and `explanatory`, `allow marker: <reason, 20+ chars>`
    or `reword: <new text>`; for `subagent`, `checkpoint:decision return` (or a marker); for `ask-misuse`,
    `plain-text ask: "<question>"`; for `schema`, the corrected header or option set.
- **The two seven- and six-option questions in new-project.md** (kind and default work): four options each. Kind:
  `api`, `app`, `library`, `cli`, with the question text naming `ui-lib` and `plugin` as typed answers under Other.
  Default work: `Skip — work types vary (Recommended)`, `feature`, `port`, `refactor`, the question naming
  `foundation`, `bugfix`, `prototype` as typed answers. Header `Work type`.
- **Other sections** of `docs/built-in-sweep.md`, in order after `## Prompts`:
  - `## Files with no prompt`: per group, every scanned file with no row.
  - `## Progress (BLTN-01)`: one row per flow with the task subjects and when each is created, set `in_progress` and
    `completed` (or deleted when skipped). Planned design: micro one task (`Micro: {description}`, completed after
    `micro commit`, deleted on `micro abort`); quick Plan / Check (full only) / Execute / Verify (full only); debug
    `Gather symptoms`, `Investigate: {slug}`, one `Hypothesis: <hypothesis>` task per continuation round, `Fix: {slug}`
    on Fix now; verify-work one task per UAT test (exists) set `in_progress` when presented and `completed` with its
    result, plus Diagnose and Plan gap closure; build Research / Plan / Check / Execute / Verify created after step 3
    (skipped stages deleted); plan-objective Research / Plan / Verify plans / Review drafts, each `in_progress` at
    start.
  - `## Plan-mode draft reviews (BLTN-02)`: plan-objective (new step 13.5 after the checker, reviews the TRD set,
    pushes after approval; step 5 becomes a printed strategy block; skip on `--auto`, `--gaps` or
    `workflow.auto_advance`); new-project (PROJECT.md before its `doc put`, REQUIREMENTS.md replacing
    `(yes / adjust)`, ROADMAP.md replacing the Approve / Adjust / Review question; skip on `--auto` only, because
    new-project writes `workflow.auto_advance: true` into every new config, so keying on it would remove the roadmap
    approval for everyone); milestone complete (one review of the MILESTONES entry draft and the PROJECT.md
    evolution draft before either is published; skip on `--auto` or `workflow.auto_advance`).
  - `## allowed-tools`: per skill, tools to add, `ExitPlanMode` to remove (build, plan-objective), and adopt's new
    `disallowed-tools: AskUserQuestion` (adopt runs map-codebase.md unattended, and map-codebase.md gains
    AskUserQuestion in 62-08).
  - `## Out of scope`: agents (list each agent you checked with `rg -n -i "AskUserQuestion|ask the user|wait for user|\(y/n\)" plugins/devflow/agents`
    and why it stays: subagents return checkpoints), `references/` and `templates/` (they explain or are copied into
    projects), `workflows/insert-objective.md` (`status: legacy`).
  - A first line under the title: `Status: inventory (TRD 62-02). Conversions: TRDs 62-04 to 62-09. Closed: TRD 62-10.`
- **references/built-ins.md** sections, each a few short paragraphs or a list, the whole file under ~120 lines:
  1. *Progress.* TaskCreate when a stage starts (or all stages up front when the list is known), TaskUpdate
     `in_progress` as it starts and `completed` when it ends, delete a skipped stage's task. Subject imperative,
     `activeForm` present continuous. Head each block `**Progress tracking (if available):**`: since Claude Code
     v2.1.268 the task tools are provided by default only on older models (Claude 3.x, Opus 4-4.7, Sonnet 4-4.6,
     Haiku 4.5); newer models get them with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. Without them, skip the calls; the
     `DF ►` banners still show the stage. Progress belongs to the orchestrator; subagents do not create flow tasks.
  2. *Plan-mode draft review.* Finish the draft and run any command the plan needs first (plan mode blocks edits, and
     shell commands outside the read-only set prompt). `EnterPlanMode()`. Put the draft in the plan: full text for a
     short document, a structured summary with paths for a TRD set or a roadmap, then an "On approval" list of the
     exact publish steps. `ExitPlanMode()`. Approved: if the approved plan carries the user's own edits (Ctrl+G
     opens it in an editor), apply them to the draft, then publish. "No, keep planning" with feedback: add a
     `## Requested changes` section to the plan stating them concretely and call ExitPlanMode again; approving that
     plan authorises applying the changes (edit the draft, or re-run the agent in revision mode), after which the
     revised draft is presented again from EnterPlanMode. Approval switches the session's permission mode to the one
     the user picks. Never list ExitPlanMode in a skill's `allowed-tools`: its permission prompt is the approval.
     Skip rule: a flow skips the review exactly where it already auto-approves (`--auto`, and
     `workflow.auto_advance` for flows that chain); new-project keys on `--auto` only (reason above). Headless (`-p`)
     runs cannot approve a plan, so they use `--auto`.
  3. *Questions.* Every discrete choice uses AskUserQuestion: 1-4 questions per call, 2-4 options per question, header
     at most 12 characters, labels of 1-5 words, the recommended option first with ` (Recommended)`, `multiSelect`
     only for non-exclusive choices, no "Other" option (built in: the user can always type). Keep the prompt's
     outcomes and its `If "<label>"` routing, and its gating (yolo, autonomous, `--auto` skips stay). Runtime lists:
     up to 4 entries become the options; more than 4, print the numbered list, offer the first 4 and say the user may
     type a number under Other. Free text (descriptions, issue reports, pasted errors, "pass or describe") stays prose;
     if the scanner flags it, add `<!-- builtin-audit: allow free-text: <reason, 20+ chars> -->` on the line or the
     line above, except inside a fenced block Claude prints to the user (the comment would be printed): there,
     reword the line out of menu shape instead. Never call AskUserQuestion without options; ask free text in plain prose. Flows a subagent runs
     return a checkpoint; the orchestrator asks. Unattended flows (adopt, `--auto`, `--non-interactive`) never ask.
  4. *Enforcement.* `builtin-audit.cjs` and `builtin-sweep.repo.test.cjs` (CI); the inventory is
     `docs/built-in-sweep.md`.
- The draft flows are documented with "draft" in the plan step on purpose: 62-03's check requires the word between
  EnterPlanMode and ExitPlanMode.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Inventory every prompt and plan its conversion</name>
  <files>docs/built-in-sweep.md</files>
  <action>
1. List the scan set: `ls plugins/devflow/skills` and
   `rg --files-without-match "^status: legacy" plugins/devflow/devflow/workflows` (34 + 40 = 74 files). Group them with the GROUPS table in 62-01's gotchas.
2. Candidate sweep, two passes over the 74 files:
   - the scanner patterns from 62-01's gotchas, combined into one `rg -n -P -i` per group of patterns;
   - a broad pass: `rg -n -i "\(y/n\)|yes ?/ ?no|\byes / |reply|respond with|type \"|wait for|offer|options:|\bask\b|choose|pick|select|confirm|proceed\?|continue\?|which (one|option)"`.
   Plus the schema checks: `rg -n "header[:=]\s*\""` (lengths), every `AskUserQuestion(` call (options present?),
   and option counts per question in object-form calls.
3. For each hit, read ±15 lines and classify per the gotchas. Skip lines inside an AskUserQuestion block that are
   already well-formed.
4. Decide each conversion concretely (header, question, labels) per the conventions in the gotchas.
5. Write `docs/built-in-sweep.md`: title, status line, a two-sentence purpose with links to
   `plugins/devflow/devflow/references/built-ins.md` and `plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs`,
   then the sections in the gotchas' order.
6. Self-check with a node one-liner: IDs unique and sequential, every Group a GROUPS key, every File exists, every
   Before excerpt occurs verbatim in its file (unescape `\|` first), and the union of row files plus `Files with no
   prompt` equals the 74-file scan set.

Commit `docs(62-02): inventory every skill and workflow prompt for the built-in sweep`.
  </action>
  <verify>The step-6 self-check prints no error and `74`. `rg -c "^\| BS-" docs/built-in-sweep.md` is at least 50. `rg -n "## Prompts|## Files with no prompt|## Progress \(BLTN-01\)|## Plan-mode draft reviews \(BLTN-02\)|## allowed-tools|## Out of scope" docs/built-in-sweep.md` shows all six headings in order.</verify>
  <done>Every candidate prompt has a classified row with a concrete conversion; every scanned file is accounted for; progress, plan-mode and allowed-tools plans are written down.</done>
</task>

<task type="auto">
  <name>Task 2: Write references/built-ins.md</name>
  <files>plugins/devflow/devflow/references/built-ins.md</files>
  <action>
Write the four sections in the gotchas, in DevFlow reference style (plain markdown, no frontmatter, short paragraphs,
examples as fenced blocks). Include one complete AskUserQuestion example in object form (header, question,
multiSelect, two or three options with descriptions), one TaskCreate/TaskUpdate example with an `in_progress` and a
`completed` update, and the plan-mode loop as a numbered list. Name `docs/built-in-sweep.md` and the repo test.

Commit `docs(62-02): built-in conventions for progress, plan mode and questions`.
  </action>
  <verify>`wc -l plugins/devflow/devflow/references/built-ins.md` is under 140. `rg -n "CLAUDE_CODE_ENABLE_TODO_TOOLS|EnterPlanMode\(\)|ExitPlanMode\(\)|Requested changes|builtin-audit: allow|12 characters|allowed-tools" plugins/devflow/devflow/references/built-ins.md` matches each. `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes.</verify>
  <done>One concise rule set exists that the conversion TRDs and the three draft-flow skills can load.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs`.
</validation_gates>

<verification>
- The inventory covers the 74-file scan set; each row is classified with a concrete conversion.
- The conventions are short, concrete and consistent with the inventory's plans.
</verification>

<success_criteria>
- [ ] Every prompt the sweep will touch is listed before any conversion starts (BLTN-03)
- [ ] Progress and plan-mode plans for the BLTN-01 and BLTN-02 flows are written down
- [ ] One rule set for the built-ins exists
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-02-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. Report the row count per group and per kind.
</output>
