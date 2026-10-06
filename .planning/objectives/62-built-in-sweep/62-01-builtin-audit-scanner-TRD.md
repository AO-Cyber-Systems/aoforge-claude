---
objective: 62-built-in-sweep
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
  - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
autonomous: true
requirements: [BLTN-01, BLTN-02, BLTN-03]
must_haves:
  truths:
    - "scanPrompts flags a discrete-choice prose prompt (`Proceed? (y/n)`, `Reply with a number`, `Offer: 1) ... 2) ...`, `Wait for user response.`) unless a non-negated AskUserQuestion sits within 12 lines above or 6 below"
    - "scanPrompts flags AskUserQuestion schema breaks: a call with no options, a header over 12 characters, a question with more than 4 options"
    - "An inline `<!-- builtin-audit: allow <reason> -->` marker on or directly above a flagged line suppresses it; a short or stale marker is reported as bad"
    - "skillCoverage follows a skill's workflow references transitively and reports built-ins it uses but does not declare in allowed-tools (minus disallowed-tools), and reports ExitPlanMode declared in allowed-tools as forbidden"
    - "progressCounts and planModeSpans measure TaskCreate/TaskUpdate wiring and EnterPlanMode/ExitPlanMode draft reviews from prose"
    - "GROUPS partitions every skill and active workflow into the eight conversion groups, one owner per file"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/builtin-audit.cjs
      provides: "scanPrompts, splitFrontmatter, parseToolList, builtinsUsed, workflowRefs, skillCoverage, progressCounts, planModeSpans, scanSet, groupOf, GROUPS"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs
      provides: "hand-built skillMd, workflowMd, askCall, askProse, makeTree builders"
    - path: plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
      provides: "tests 1-20 below"
  key_links:
    - "62-03 builds builtin-sweep.repo.test.cjs on scanSet/scanPrompts/skillCoverage/progressCounts/planModeSpans/groupOf"
    - "Mirrors planning-audit.cjs (TRD 48-04): pure text-in/findings-out scanner, inline allow marker, group table"
---

# TRD 62-01: The built-in audit scanner

<objective>
Build the pure scanner that makes the built-in sweep enforceable. It answers four questions about DevFlow's prose
(skills and active workflows):

1. **Questions (BLTN-03).** Which lines are discrete-choice prompts written as prose (`(y/n)`, `Reply with a number`,
   `Offer: 1) ... 2) ...`, `Options:` + `Wait for user response.`) instead of AskUserQuestion? Which AskUserQuestion
   calls break the tool's schema (no options, header over 12 characters, more than 4 options)?
2. **Declarations.** Which built-ins does a skill use (in its own body and every workflow it references, transitively)
   that its `allowed-tools` does not declare? Which skill pre-approves `ExitPlanMode` (forbidden, see gotchas)?
3. **Progress (BLTN-01).** How many `TaskCreate(` calls, and `TaskUpdate(` calls with status `completed` and
   `in_progress`, does a flow's prose carry?
4. **Plan mode (BLTN-02).** Where does a flow enter and exit plan mode, does that span present a draft, and is it
   preceded by a skip rule naming `--auto`?

Plus the scan set and the group table that partitions the sweep's files between the conversion TRDs (62-04..62-09).

This TRD writes no prose and touches no skill. 62-03 turns the scanner into the CI ratchet.

Purpose: one tested module every later TRD and the CI test rely on. Output: the module, its fixture builders, its
unit tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── builtin-audit.cjs                       ← CREATE
├── builtin-audit.test.cjs                  ← CREATE
└── __fixtures__/
    └── builtin-audit-fixtures.cjs          ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: tests go RED (`test(62-01): ...`) before the code they cover (`feat(62-01): ...`).
- Hand-built fixtures only (no generated data, no property-based libraries, no `.feature` files). Every positive and
  negative literal below is copied by hand from a real DevFlow file or written for the case.
- Pure module: text in, results out. Only `skillCoverage` and `scanSet` read the filesystem, read-only. No git, no gh,
  no network, no child processes.
- CommonJS, synchronous fs, `'use strict'`, Node native test runner. Follow `planning-audit.cjs` for layout and the
  header comment style.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call (no `&&`, `;`, pipes or `cd`). Never use port 8080.

## Test list

`builtin-audit.test.cjs`. Hand-written strings; tests 16 and 19 build temp trees with `makeTree`.

**Prompt scanner (Task 2)**

1. `Proceed? (y/n)` → one finding `{ line: 1, kind: 'prose-choice', text: 'Proceed? (y/n)' }`; `allowed` and
   `badMarkers` empty.
2. Each positive literal yields exactly one `prose-choice` finding:
   - `Does this capture what you're building? (yes / adjust)`
   - `Otherwise show the draft and ask: "Write this as .planning/STACK.md? (yes / edit / skip)".`
   - `(yes / wait / adjust scope)` (alone on its line)
   - `Ask: "Push tag to remote? (y/n)"`
   - `Reply with a number to resume, or provide an objective number to start new.`
   - `Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.`
   - `→ Type "pass" or describe what's wrong`
   - `Offer: 1) Force proceed, 2) Abort`
   - `**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.` (one finding per line, not two)
   - `- Offer options:`
   - `Options:` (alone on its line)
   - `MUST present 3 options:`
   - `Ask user if they want to run repairs:`
   - `Ask the user which decision they want to resolve and which option to pick.`
   - `Wait for user decision.` and `Wait for user confirmation before creating worktrees.`
   - `Check if session exists for that objective. If yes, offer to resume or restart.`
   - `- User picks number to resume OR describes new issue`
   - plan-objective.md's step 10 bullet, copied whole: it starts with the bold `## PLANNING INCONCLUSIVE` label and
     ends `Show attempts, offer: Add context / Retry / Manual`
3. Negatives yield no finding:
   - `- options:` and `  - "Nothing happens" — Expected action produces no result`
   - `    question: "Verify work satisfies requirements after each objective? (adds tokens/time)",` (a field line)
   - `      { label: "Approve", description: "Commit and continue" },`
   - `Do NOT offer to plan the next sequential objective — this worktree only owns its assigned objectives.`
   - `Subcommand options:`
   - `` `planning mode` prints `local` or `store`. ``
   - `| Option | Meaning |`
4. Window: `Use AskUserQuestion:` on line 1 and `Wait for user response.` on line 8 → 0 findings; on line 14 → 1.
   `Wait for user response.` on line 1 and `Use AskUserQuestion:` on line 6 → 0; on line 8 → 1.
5. A negated mention does not satisfy: `Wait for user response (plain text, no AskUserQuestion).` → 1 finding; so does
   `Never call AskUserQuestion here.` two lines above `Proceed? (y/n)` → 1 finding.
6. A finding inside a fenced block counts the same as prose (a ```` ``` ```` block holding
   `Reply with a number to view details, or:`).
7. Markers. `<!-- builtin-audit: allow free-text: the answer is an open-ended description -->` on the line above
   `→ Type "pass" or describe what's wrong` → 0 findings, `allowed: [{ line: 2, reason }]`. The same marker at the end
   of the flagged line → allowed. The marker above a clean line → one bad marker (`why: 'stale'`). A marker with the
   reason `ok` → one bad marker (`why: 'short'`) and the finding stays.
8. `ask-without-options`: `AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")` →
   one finding of that kind; the multi-line call
   `AskUserQuestion(` / `  header: "Quick Task",` / `  question: "What do you want to do?",` / `  followUp: null` / `)`
   → one finding on the opening line; `askCall({ options: ['A', 'B'] })` → none. Prose mentions (`Use AskUserQuestion:`)
   are never checked for options.
9. `header-too-long`: `    header: "Default work type",` → one finding; `AskUserQuestion(header="Archive Objectives", ...)`
   → one; `header: "Roadmap"` → none; a 12-character header (`header: "Twelve chars"`) → none.
10. `too-many-options`: `askCall` with 5 options → one finding on its `question:` line; 4 options → none;
    `askProse` with 5 bullet options → one.
11. A line carrying two problems reports both kinds (sorted by line, then kind).

**Declarations, progress, plan mode, scan set (Task 3)**

12. `splitFrontmatter(text)` → `{ frontmatter, body, bodyStartLine }` (1-based line of the first body line); no
    frontmatter → `frontmatter: ''`, `bodyStartLine: 1`.
13. `parseToolList(fm, 'allowed-tools')`: YAML list → `['Read', 'Bash', 'AskUserQuestion']`; inline
    `allowed-tools: Read, Write, TaskCreate` → three names; space-separated `allowed-tools: Read Bash` → two; absent
    → `[]`. `parseToolList(fm, 'disallowed-tools')` on `disallowed-tools: AskUserQuestion` → `['AskUserQuestion']`.
14. `builtinsUsed(body)`: `TaskCreate(subject="x")` → `['TaskCreate']`; `create a progress task with TaskCreate` →
    `[]` (call form required for every built-in but AskUserQuestion); `Use AskUserQuestion:` → `['AskUserQuestion']`;
    `Never call AskUserQuestion.` → `[]`; `EnterPlanMode()` + `ExitPlanMode()` → both; ``built-in plan mode (`EnterPlanMode`)`` → `[]`.
15. `workflowRefs` on `@~/.claude/devflow/workflows/micro.md` plus
    `Read and follow ~/.claude/devflow/workflows/transition.md` plus a second `micro.md` mention → `['micro', 'transition']`.
16. `skillCoverage` (temp tree): skill `a` (allowed-tools `[Read]`) references `w1`; `w1` calls `TaskCreate(` and
    references `w2`; `w2` says `Use AskUserQuestion:` and references `w1` (a cycle) and `w9` (no such file) →
    `missing: ['AskUserQuestion', 'TaskCreate']`, `via.TaskCreate` names w1's path, the walk terminates. With
    `disallowed-tools: AskUserQuestion` → `missing: ['TaskCreate']`. A skill that calls `ExitPlanMode()` without
    declaring it → not missing; one that declares it → `forbidden: ['ExitPlanMode']`.
17. `progressCounts([t1, t2])` where t1 has two `TaskCreate(` calls and `TaskUpdate(taskId=a, status="completed")`, and
    t2 has a three-line `TaskUpdate(` / `  taskId=b,` / `  status="in_progress")` → `{ creates: 2, completes: 1, inProgress: 1 }`.
    `TaskUpdate({ taskId: c, status: "completed" })` (colon form) also counts as complete.
18. `planModeSpans`: `**Skip if:** \`--auto\` flag or config \`workflow.auto_advance\` is true.` three lines above
    `EnterPlanMode()`, `Put the REQUIREMENTS draft in the plan.` between, `ExitPlanMode()` after →
    `[{ enterLine, exitLine, mentionsDraft: true, skipLine }]` with the right line numbers. No skip line in the 20 lines
    above → `skipLine: null`. No `draft` between → `mentionsDraft: false`. No ExitPlanMode after → `exitLine: null`.
19. `scanSet(root)` on a temp tree with `plugins/devflow/skills/{a,b}/SKILL.md` and
    `plugins/devflow/devflow/workflows/{w1,old}.md` (`old.md` has `status: legacy`) → three entries, POSIX `rel`
    paths, sorted, each with `text`.
20. `groupOf('plugins/devflow/skills/micro/SKILL.md') === 'micro-quick-debug'`;
    `groupOf('plugins/devflow/devflow/workflows/complete-milestone.md') === 'milestone'`;
    `groupOf('plugins/devflow/devflow/workflows/insert-objective.md') === null`. `Object.keys(GROUPS)` equals the eight
    names in the gotchas, in that order, and no path appears in two groups.

<embedded_context>

<codebase_examples>
`plugins/devflow/devflow/bin/lib/planning-audit.cjs` (TRD 48-04) is the template:

```js
const MARKER_RE = /<!--\s*planning-audit:\s*allow\b\s*([\s\S]*?)\s*-->/;
// scanWrites(text) -> { findings: [{line, artifact, text}], allowed: [{line, reason}], badMarkers: [...] }
// A marker on the flagged line, or on the line directly above, suppresses that one finding.
// A marker with a reason under MIN_REASON (20) chars, or one that suppresses nothing, is a bad marker.
// scanSet(repoRoot) walks skills/<name>/SKILL.md and workflows/*.md minus `status: legacy`.
// GROUPS + groupOf(rel) pin which prose TRD owns which file.
```

`agent-tools.test.cjs` detects tool use in agent prose with the call form `\bTool\(` and notes that `\bTask\(` does not
match `TaskCreate(`. Use the same call form for every built-in except AskUserQuestion, which DevFlow prose names in
directive form (`Use AskUserQuestion:`, `ask with AskUserQuestion`) far more often than as a call.

Skill frontmatter comes in two shapes today: a YAML list (`allowed-tools:\n  - Read\n  - Bash`, most skills) and an
inline string (`allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, TaskCreate, ...`, skills/build/SKILL.md).
`scripts/gen-docs-data.cjs` `toolList()` normalises both; `gh-sync-skill.repo.test.cjs` line ~62 parses the list form.

AskUserQuestion appears in two shapes. Object form (new-project.md, plan-objective.md):

```
AskUserQuestion([
  {
    header: "Project kind",
    question: "What is this project?",
    multiSelect: false,
    options: [
      { label: "api", description: "backend API/service consumed by clients" },
      ...
    ]
  }
])
```

Bullet form (skills/debug/SKILL.md):

```
Use AskUserQuestion:
- header: "Symptom"
- question: "What happens when the issue occurs?"
- options:
  - "Nothing happens" — Expected action produces no result
```
</codebase_examples>

<anti_patterns>
- Do not make the scanner clever about semantics. It is a line scanner with a window; the inventory (62-02) is the
  manual half and the inline marker is the escape. Precision comes from tested patterns, not heuristics.
- Do not read `references/` or `templates/`. They explain and are copied into projects; they do not prompt.
- Do not scan agents. Subagents cannot reach the user; their questions return to the orchestrator as checkpoints.
- No `require` of anything outside Node's standard library and this directory.
</anti_patterns>

<error_recovery>
- A positive literal in test 2 that cannot be matched without also matching a test-3 negative: narrow the pattern
  (anchor it, require the `?`, require line start) rather than dropping the case. If it truly cannot be separated, keep
  the positive, drop nothing, and record the conflict in the SUMMARY for 62-03 (the inventory may classify it
  `manual`).
- If a regex is slow on the real files (it should not be: 74 files, under 15k lines), check for catastrophic
  backtracking in the slash-choice pattern; use possessive-style alternatives (`[\w-]+(?: [\w-]+)*`) without nested
  quantifiers over the same characters.
</error_recovery>

</embedded_context>

<gotchas>
- **Constants:** `MIN_REASON = 20`, `WINDOW_ABOVE = 12`, `WINDOW_BELOW = 6`, `MAX_OPTIONS = 4`, `MAX_HEADER = 12`,
  `BUILTINS = ['AskUserQuestion', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'EnterPlanMode', 'ExitPlanMode']`,
  `FORBIDDEN_ALLOWED = ['ExitPlanMode']`. Export them all.
- **Marker:** `<!--\s*builtin-audit:\s*allow\b\s*([\s\S]*?)\s*-->`. Mask the marker text before matching patterns, so
  a reason that says "yes/no" is never itself a finding.
- **Field lines are never prose prompts.** Skip CHOICE patterns on a line whose first token (after optional `-`/`*`
  and whitespace, and an optional `{`) is `question`, `header`, `label`, `description`, `options` or `multiSelect`
  followed by `:` or `=`. The schema checks (tests 9, 10) still read those lines.
- **Negation** for both a satisfying AskUserQuestion mention and a prompt trigger: the 24 characters before the token
  contain `never`, `no`, `not`, `without`, `n't` or `do not` as a word (case-insensitive). So `Do NOT offer to plan`
  is no finding and `no AskUserQuestion` satisfies nothing.
- **Starting CHOICE patterns** (one finding per line however many match; tune only under test):
  slash choice after a question mark, `\?\s*["'“]?\s*\(\s*[\w-]+(?: [\w-]+)*(?:\s*\/\s*[\w-]+(?: [\w-]+)*)+\s*\)`;
  the same parenthesised list alone on a line; `\[(?:y\/n|Y\/n|y\/N)\]`;
  `\b(?:Reply|Respond|Answer)\s+(?:with\b|")`; `\bType\s+"[^"]+"\s+(?:or|to)\b`;
  line-start list heads `^\s*(?:[-*]\s+)?(?:\*\*)?(?:Options|Offer options|Offer|Choose|Pick one|Select one)(?:\*\*)?:`;
  inline offers `\bOffer:\s*1[.)]` and `\boffer:\s+[^/\n]+\/`; `\b(?:present|offer)s?\s+(?:\d+|two|three|four)\s+options\b`;
  `\bask(?:s|ed)?\s+(?:the\s+)?user\s+(?:if|whether|which)\b`; `\bAsk:\s*"`;
  `\bWait for (?:the )?(?:user(?:'s)?\s+)?(?:response|decision|selection|choice|confirmation|reply)\b`;
  `\boffer(?:s|ed)? to\s+\w+`; `\bpicks? (?:a )?number\b`. Case-insensitive except `Ask:` and the list heads.
- **ask-without-options:** from `AskUserQuestion(` count parentheses until depth 0 or 40 lines; no `options` word in
  that block → finding on the opening line.
- **too-many-options:** from each `question` field line, count option entries (`{ label:` lines, or bullet options
  `^\s*[-*]\s+"[^"]+"\s+[—–-]`) until the next `question` field line, a heading (`^#{1,6} `), a `<step`/`</step>` tag,
  or 40 lines.
- **GROUPS** (repo-relative paths; this exact order of keys):
  - `micro-quick-debug`: skills micro, quick, debug; workflows micro, quick.
  - `verify-work`: skill verify-work; workflows verify-work, diagnose-issues, verify-objective.
  - `plan-build`: skills plan-objective, build; workflows plan-objective, build.
  - `new-project`: skill new-project; workflow new-project.
  - `milestone`: skill milestone; workflows complete-milestone, new-milestone, audit-milestone, plan-milestone-gaps.
  - `execute-and-map`: skills execute-objective, discuss-objective, map-codebase, adopt; workflows execute-objective,
    transition, execute-trd, discuss-objective, discovery-objective, map-codebase, adopt.
  - `todo-status-objective`: skills todo, status, objective, decide, handoff; workflows add-todo, check-todos, health,
    pause-work, progress, resume-project, add-objective, remove-objective.
  - `remaining`: skills workstreams, security-audit, cleanup, settings, set-profile, help, design-review, ui-eval,
    research-objective, list-objective-assumptions, flow, gh-sync, doctor, awareness, initiatives, sync-roadmap, tui;
    workflows workstreams-merge, workstreams-run, workstreams-setup, workstreams-status, security-audit, cleanup,
    settings, set-profile, help, design-review, ui-eval, research-objective, list-objective-assumptions.
  Skills map to `plugins/devflow/skills/<name>/SKILL.md`, workflows to `plugins/devflow/devflow/workflows/<name>.md`.
  The table covers all 34 skills and the 40 active workflows (insert-objective.md is legacy). 62-03's repo test checks
  that against the real tree; this TRD's test 20 checks only shape and uniqueness.
- **Why ExitPlanMode is forbidden in allowed-tools.** Claude Code's skills reference: `allowed-tools` lists "Tools Claude
  can use without asking permission during the turn that invokes this skill". The tools reference marks ExitPlanMode
  "Permission required: Yes", and its permission prompt is the plan approval itself. Pre-approving it risks approving
  the very draft the user is meant to review. EnterPlanMode, AskUserQuestion, TaskCreate and TaskUpdate need no
  permission, so declaring them is harmless. Put this reasoning in the module header.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Hand-built fixture builders</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs</files>
  <action>
Create the builders the tests use. Deterministic, no randomness except `fs.mkdtempSync` for temp roots:

- `skillMd({ name, allowed = [], disallowed = null, inline = false, body = '' })`: a SKILL.md string with `name:`,
  a one-line `description:`, `allowed-tools:` as a YAML list (or one comma-separated line when `inline`), an optional
  `disallowed-tools:` line, then the body.
- `workflowMd({ status = 'active', body = '' })`: `---\nstatus: <status>\n---\n<body>`.
- `askCall({ header = 'Pick', question = 'Which one?', options = ['A', 'B'], omitOptions = false })`: the object form in
  the codebase examples, one `{ label: "<x>", description: "<x> option" }` line per option.
- `askProse({ header, question, options })`: the bullet form, one `  - "<x>" — <x> option` line per option.
- `makeTree({ skills = {}, workflows = {}, repoLayout = false })`: writes `<root>/skills/<name>/SKILL.md` and
  `<root>/workflows/<name>.md` (or, with `repoLayout`, `<root>/plugins/devflow/skills/...` and
  `<root>/plugins/devflow/devflow/workflows/...`); returns `{ root, skillsDir, workflowsDir, cleanup }`.

Add a short header comment naming TRD 62-01 and the `no_llm_test_data` rule (every string is written by hand).
Commit `test(62-01): hand-built fixture builders for the built-in audit`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/builtin-audit-fixtures.cjs'); const t=f.makeTree({skills:{a:f.skillMd({name:'a',allowed:['Read']})},workflows:{w:f.workflowMd({body:f.askCall({})})}}); console.log(require('fs').readFileSync(t.skillsDir+'/a/SKILL.md','utf8').split('\n')[0]); t.cleanup()"` prints `---`.</verify>
  <done>The builders exist, produce well-formed SKILL.md and workflow text, and clean up their temp trees.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: scanPrompts — prose prompts, schema checks, markers (tests 1-11)</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs, plugins/devflow/devflow/bin/lib/builtin-audit.cjs</files>
  <action>
RED: write tests 1-11 against `require('./builtin-audit.cjs')`. Run them and watch them fail (module missing). Commit
`test(62-01): prose-choice, schema and marker cases for scanPrompts`.

GREEN: create `builtin-audit.cjs` with the constants and `scanPrompts(text)`:

```
lines = text.split('\n'); masked = lines with markers blanked
mentions = indexes of lines with a non-negated AskUserQuestion
for each line i:
  if not a field line and some CHOICE pattern matches a non-negated trigger:
     satisfied = any mention in [i - WINDOW_ABOVE, i + WINDOW_BELOW]
     if not satisfied: finding(i, 'prose-choice')
  header field longer than MAX_HEADER        -> finding(i, 'header-too-long')
  'AskUserQuestion(' with no options in block -> finding(i, 'ask-without-options')
  question field with > MAX_OPTIONS entries  -> finding(i, 'too-many-options')
apply markers (same line or the line above): suppress all findings on the target line; record allowed;
  short reason -> badMarker 'short' (finding stays); suppresses nothing -> badMarker 'stale'
return { findings (sorted by line, kind), allowed, badMarkers }
```

`text` in a finding is the original line, trimmed. Write the header comment: purpose (BLTN-01..03), what counts, the
window, the marker, the ExitPlanMode reasoning (gotchas), and that 62-03's repo test is the consumer.
Commit `feat(62-01): scanPrompts finds prose choice prompts and AskUserQuestion schema breaks`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` passes tests 1-11.</verify>
  <done>Tests 1-11 went RED then GREEN in separate commits.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Declarations, progress, plan mode, scan set and groups (tests 12-20)</name>
  <files>plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs, plugins/devflow/devflow/bin/lib/builtin-audit.cjs</files>
  <action>
RED: add tests 12-20. Commit `test(62-01): coverage, progress, plan-mode and group cases`.

GREEN: add `splitFrontmatter`, `parseToolList`, `builtinsUsed`, `workflowRefs`, `skillCoverage`, `progressCounts`,
`planModeSpans`, `scanSet`, `groupOf` and `GROUPS` per the test list and gotchas.

`skillCoverage({ skillsDir, workflowsDir, name })`:

```
{ frontmatter, body } = splitFrontmatter(read(skillsDir/name/SKILL.md))
used = builtinsUsed(body) (via: SKILL.md); queue = workflowRefs(body); seen = {}
while queue: n = shift; skip seen/missing files; b = body of workflowsDir/n.md;
             add builtinsUsed(b) (via: that file); queue += workflowRefs(b)
declared = parseToolList(fm, 'allowed-tools'); disallowed = parseToolList(fm, 'disallowed-tools')
missing = used - declared - disallowed - FORBIDDEN_ALLOWED   (sorted)
forbidden = declared ∩ FORBIDDEN_ALLOWED
return { declared, disallowed, used (sorted), missing, forbidden, via }
```

`scanSet(repoRoot)` returns `{ rel, text }` for `plugins/devflow/skills/*/SKILL.md` and
`plugins/devflow/devflow/workflows/*.md` whose frontmatter is not `status: legacy`, sorted by `rel`.
Commit `feat(62-01): skill coverage, progress counts, plan-mode spans and the sweep group table`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` passes tests 1-20. `node -e "const a=require('./plugins/devflow/devflow/bin/lib/builtin-audit.cjs'); const s=a.scanSet(process.cwd()); console.log(s.length, s.filter(f=>!a.groupOf(f.rel)).map(f=>f.rel))"` prints `74 []`.</verify>
  <done>Tests 12-20 went RED then GREEN; every real skill and active workflow has exactly one group.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs`.
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` passes (20 numbered tests).
- On the real repository, `scanSet` returns 74 files and every one has a group.
- No file outside the three in `files_modified` changed.
</verification>

<success_criteria>
- [ ] Prose choice prompts, AskUserQuestion schema breaks and bad markers are detected by tested patterns
- [ ] Skill built-in declarations, progress wiring and plan-mode draft spans are measurable from prose
- [ ] The eight-group partition covers every skill and active workflow exactly once
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-01-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. Record any pattern conflict (error_recovery) for 62-03.
</output>
