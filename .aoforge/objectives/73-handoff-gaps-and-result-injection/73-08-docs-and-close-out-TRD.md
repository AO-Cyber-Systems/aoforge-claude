---
objective: 73-handoff-gaps-and-result-injection
trd: "08"
type: standard
wave: 5
depends_on: ["73-07"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - site/content/docs/guides/handoff.md
  - plugins/aoforge/skills/handoff/SKILL.md
  - docs/built-in-integration-status.md
  - scripts/gen-docs-data.cjs
  - site/data/aoforge.json
autonomous: true
requirements: [HND-01, HND-02, HND-03]
must_haves:
  truths:
    - "CHANGELOG.md `## [Unreleased]` records objective 73: the three PTY gaps fixed (HND-01), handoff results delivered after the next tool call or at the end of a turn by the now-registered inject-handoff-results.js (HND-02), the attended aoforge-watch terminal and the shell respawn (HND-03), and the changed PTY output contract (stderr with stdout)"
    - "docs/USER-GUIDE.md's hooks table has rows for gate-interactive.js, route-results.js and inject-handoff-results.js, and a subsection explains the handoff flow end to end: attended vs unattended aoforge-watch, the delivery points and the Stop wait, the escape hatches and env vars, and the known limitations"
    - "The site handoff guide's 'How it flows' and the /aoforge:handoff skill body describe the new delivery (after the next tool call, at the end of the turn, else the next prompt) and the attended terminal; neither says the result only arrives on the next prompt"
    - "CLAUDE.md's Hooks bullets for gate-interactive.js, route-results.js and inject-handoff-results.js match the shipped behaviour, and `scripts/gen-docs-data.cjs` HOOK_DOCS plus the regenerated `site/data/aoforge.json` agree with them"
    - "docs/built-in-integration-status.md lists inject-handoff-results.js under PostToolUse and Stop"
    - "The pending todo `2026-04-27-seamless-interactive-command-handoff` is completed through `aof-tools todo complete` when 73-07 demonstrated SC-3, and left pending with a recorded reason otherwise"
    - "The full suite passes with no new failures against the pre-objective baseline (11,955 tests, 11,919 pass, 35 skipped), and the doc guards (doc-refs, rename guard, built-in sweep, hook inventory, planning writes) are green"
  artifacts:
    - path: CHANGELOG.md
      provides: "objective 73 entries under [Unreleased]"
    - path: docs/USER-GUIDE.md
      provides: "hooks table rows and the interactive-commands subsection"
    - path: scripts/gen-docs-data.cjs
      provides: "HOOK_DOCS entries for the three handoff hooks"
    - path: site/data/aoforge.json
      provides: "regenerated docs data"
  key_links:
    - from: "scripts/gen-docs-data.cjs HOOK_DOCS"
      to: "site/data/aoforge.json"
      via: "npm run docs:data"
      pattern: "inject-handoff-results"
    - from: ".aoforge/todos/pending/2026-04-27-seamless-interactive-command-handoff.md"
      to: ".aoforge/todos/completed/"
      via: "aof-tools todo complete"
      pattern: "seamless-interactive-command-handoff"
---

# TRD 73-08: Document the handoff flow, close the todo, run the full suite

<objective>
Objective 73 changed what a user and Claude see when a command needs a terminal: the daemon's terminal is where the
user answers, results arrive without a prompt, and three long-standing gaps are gone. The user-facing docs still
describe the objective-19 flow ("route-results injects the result on your next prompt"), CLAUDE.md and the generated
docs data still describe inject-handoff-results.js from before it was registered, and the CHANGELOG has nothing.

This TRD brings every description in line with the shipped behaviour, completes the 2026-04-27 seamless-handoff todo
(its Approach B is now real) if the live demonstration passed, and runs the full suite as the objective's final gate.
No release: the CHANGELOG entries sit under `[Unreleased]` and a release is a follow-up note.

Purpose: close HND-01..03 in the docs and the record. Output: updated docs, regenerated docs data, the todo moved, a
green suite.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Read the SUMMARYs of 73-01 to 73-07 first; the docs describe what they record (including any `todo` test, the MA-6
outcome, and the delivery path the live run showed). Do not document behaviour a SUMMARY does not record.

Read narrowly:
- `CHANGELOG.md` 1-20 (`[Unreleased]` holds a `### Fixed` entry from 72-27; add sections in Keep-a-Changelog order).
- `docs/USER-GUIDE.md`: TOC 7-17, `## Hooks and what they enforce` 949-980 (the table has no rows for gate-interactive,
  route-results or inject-handoff-results), `### "AOForge blocked my command — why?"` ~1067, `### Skills that need a
  tool` ~1085, "Trying a Local Checkout of AOForge" at the end.
- `site/content/docs/guides/handoff.md` (121 lines): Quick start 13-25, How it flows 39-56, Without the daemon 58,
  Configuration 65, the known-gap callout 111-121 (keep it).
- `plugins/aoforge/skills/handoff/SKILL.md` lines 20-110 (the "next turn" / route-results wording at 28, 46, 90, 97,
  101-103). Do not change its `name`, `description` or `argument-hint`: the pointer-skill generator keys on them.
- `CLAUDE.md` `### Hooks` 107-142 (73-06 already moved the inject bullet; refine wording only).
- `scripts/gen-docs-data.cjs` HOOK_DOCS 137-163 (`route-results.js`, `gate-interactive.js`, `inject-handoff-results.js`).
- `docs/built-in-integration-status.md` rows `PostToolUse` 78 and `Stop` 87.
- `.aoforge/todos/pending/2026-04-27-seamless-interactive-command-handoff.md` (Approach B is what objective 73 finished).
</context>

<embedded_context>

<codebase_examples>
The flow to document (one source of truth for every page):
```text
Claude runs a gated command (gate-interactive.js, PreToolUse Bash)
  -> denied; .aoforge-handoff/pending/<id>.json written with the session and agent that asked
  -> Claude tells you the command is waiting in your aoforge-watch terminal
aoforge-watch (started with `start --foreground` in a terminal: attended)
  -> shows the command's live output there; you answer its prompt there (Ctrl+C interrupts the command)
  -> writes .aoforge-handoff/done/<id>.json
The result reaches Claude, once, with no paste:
  -> after Claude's next tool call (inject-handoff-results.js, PostToolUse), or
  -> when Claude ends its turn (inject-handoff-results.js, Stop; waits up to 120 s while the command is still running), or
  -> on your next prompt (route-results.js, the catch-all)
```
Settings and escapes to list: `aoforge-watch start --foreground [--no-attend]`, `AOFORGE_WATCH_UNATTENDED=1`,
`AOFORGE_HANDOFF_STOP_WAIT_MS` (default 120000, `0` disables), `AOFORGE_SKIP_HANDOFF_INJECT=1` (PostToolUse/Stop
delivery only), `AOFORGE_SKIP_HANDOFF_RESULTS=1` (all handoff delivery), `AOFORGE_HANDOFF_RESULT_TTL_MS`,
`AOFORGE_SKIP_INTERACTIVE_GATE=1`.

Known limitations to state plainly (confirm each against the SUMMARYs before writing it):
- fish and powershell daemons keep the old wrapper, so gaps 1 and 2 remain there; bash and zsh are fixed.
- In PTY mode a command's stderr arrives with its stdout (both are the terminal).
- Typed answers are not echoed in the aoforge-watch terminal unless the tool echoes them itself (echo stays off so
  nothing you type lands in a result).
- The daemon's terminal is 80x24.
- `sudo` stays refused by the daemon's deny list.
- A result goes to the session and agent that queued it; a subagent's result reaches it on its next tool call, else the
  next prompt.
- gate-interactive still matches inside quoted arguments (the existing callout).
- Whatever 73-03 recorded for MA-6 (real doctl), if it is not a clean pass.

CHANGELOG style: bold lead, objective and requirement ids in parentheses, wrapped at 120 characters, no marketing
(see the 72-27 entry under `[Unreleased]`).
</codebase_examples>

<anti_patterns>
- Do not bump versions, tag, push or release. `[Unreleased]` only.
- Do not edit `site/data/aoforge.json` by hand; regenerate it with `npm run docs:data` (this runs only
  `scripts/gen-docs-data.cjs`; `docs:build` needs Hugo and is not needed).
- Do not rewrite CLAUDE.md beyond the three hook bullets; it is resident on every turn (context-discipline.md).
- Do not write a pre-rename product or path name anywhere: `rename-guard.repo.test.cjs` fails on it outside its allow
  list.
- Do not move the todo with a file move; use the verb.
</anti_patterns>

<error_recovery>
- `doc-refs.repo.test.cjs` fails on a command reference: use the current command names (`/aoforge:handoff`,
  `aoforge-watch`), never a deprecated one.
- `builtin-sweep.repo.test.cjs` fails on the skill edit: a discrete-choice question written as prose; keep any choice in
  AskUserQuestion as the skill already does.
- `roadmap-reconcile.test.cjs` E2E1 fails in the full run: an unticked TRD box in ROADMAP.md (72-27's gotcha); run
  `node ~/.claude/aoforge/bin/aof-tools.cjs roadmap update-job-progress 73` and re-run that test.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: User-facing docs: USER-GUIDE, the site handoff guide, the handoff skill, the integration status</name>
  <files>docs/USER-GUIDE.md, site/content/docs/guides/handoff.md, plugins/aoforge/skills/handoff/SKILL.md, docs/built-in-integration-status.md</files>
  <action>
USER-GUIDE: add table rows for `gate-interactive.js` (PreToolUse Bash), `route-results.js` (UserPromptSubmit) and
`inject-handoff-results.js` (PostToolUse `*`, Stop), each with its escape hatch; add a `### Interactive commands and
aoforge-watch` subsection under `## Hooks and what they enforce` with the flow, the attended terminal, the settings and
the known limitations from codebase_examples. Site guide: rewrite Quick start's last sentence and "How it flows" to the
same flow, add attended mode to Configuration (`--no-attend`, `AOFORGE_WATCH_UNATTENDED`), keep "Without the daemon"
and the known-gap callout. Skill: replace "on the next turn ... route-results" wording with the three delivery points
and tell Claude to say in one line that the command waits in the user's aoforge-watch terminal; keep frontmatter
untouched. Integration status: add `inject-handoff-results.js` to the PostToolUse and Stop rows with "73". Commit
`docs(73-08): ...`.
  </action>
  <verify>rg -n "next turn" plugins/aoforge/skills/handoff/SKILL.md site/content/docs/guides/handoff.md shows no claim that results arrive only on the next turn; node --test plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/builtin-sweep.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs scripts/gen-pointer-skills.legacy.test.cjs exits 0</verify>
  <done>Every user-facing page describes the attended terminal and the three delivery points, with the limitations stated.</done>
  <recovery>If `gen-pointer-skills --check` fails, the skill's description or argument-hint changed; revert the frontmatter.</recovery>
</task>

<task type="auto">
  <name>Task 2: Inventory docs: CLAUDE.md hook bullets, HOOK_DOCS, regenerated docs data, CHANGELOG</name>
  <files>CLAUDE.md, scripts/gen-docs-data.cjs, site/data/aoforge.json, CHANGELOG.md</files>
  <action>
CLAUDE.md: refine the three hook bullets (route-results: the catch-all for queued handoff results through
`lib/handoff-results.cjs`, exactly once, plus notices; gate-interactive: queues to aoforge-watch with the session and
agent, says where the command waits; inject-handoff-results: as 73-06 wrote it, corrected if a SUMMARY says otherwise).
HOOK_DOCS: matching purposes and escapes for the three hooks (`inject-handoff-results.js` escape
`AOFORGE_SKIP_HANDOFF_INJECT=1, AOFORGE_SKIP_HANDOFF_RESULTS=1`; `route-results.js` `AOFORGE_SKIP_HANDOFF_RESULTS=1,
AOFORGE_SKIP_NOTICES=1`; `gate-interactive.js` `AOFORGE_SKIP_INTERACTIVE_GATE=1`). Run `npm run docs:data` and check the
diff of `site/data/aoforge.json` is limited to these hooks. CHANGELOG `[Unreleased]`: `### Added` (attended aoforge-watch
terminal, HND-03; results delivered after the next tool call or at the end of the turn, HND-02), `### Fixed` (the three
PTY gaps, HND-01; a dead daemon shell is respawned), `### Changed` (PTY output contract; gate-interactive wording and
the session/agent fields), each naming objective 73. Commit `docs(73-08): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs exits 0; git diff --stat site/data/aoforge.json shows a small diff; rg -n "objective 73" CHANGELOG.md finds the new entries</verify>
  <done>CLAUDE.md, the generated docs data and the CHANGELOG all describe the shipped handoff behaviour.</done>
  <recovery>If `npm run docs:data` changes unrelated parts of `site/data/aoforge.json`, the data was stale before this objective: keep the regeneration (it is the source of truth) and note the unrelated delta in the SUMMARY.</recovery>
</task>

<task type="auto">
  <name>Task 3: Close the todo and run the final gate</name>
  <files>.aoforge/todos/pending/2026-04-27-seamless-interactive-command-handoff.md</files>
  <action>
Read 73-07's SUMMARY. If SC-3 was demonstrated, run
`node ~/.claude/aoforge/bin/aof-tools.cjs todo complete 2026-04-27-seamless-interactive-command-handoff` and commit the
move with `node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs(73-08): complete the seamless handoff todo" --files <the paths it moved>`.
If the demonstration failed, leave the todo pending and record why in the SUMMARY. Tick this TRD's ROADMAP box, then run
the full suite (`npm test`, or the STACK.md glob if `micro.test.cjs` hangs on commit signing) and record the totals
against the baseline. Add a "Release follow-up" line to the SUMMARY: objective 73 is unreleased; a later release carries
it (no tag, push or deploy here).
  </action>
  <verify>npm test (or the STACK.md glob) shows no new failures against 11,955 / 11,919 / 35 skipped plus the tests objective 73 added; the todo is under .aoforge/todos/completed/ (or pending with a recorded reason)</verify>
  <done>The objective's final gate is green, the todo reflects the outcome, and the release is noted as a follow-up only.</done>
  <recovery>If `todo complete` refuses (the stem is not found), run `node ~/.claude/aoforge/bin/aof-tools.cjs todo complete 2026-04-27-seamless-interactive-command-handoff.md` with the filename; never move the file by hand.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test   (full suite; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available (docs:build needs Hugo and is not part of this gate)</build>
</validation_gates>

<verification>
- `rg -n "inject-handoff-results" docs/USER-GUIDE.md docs/built-in-integration-status.md scripts/gen-docs-data.cjs site/data/aoforge.json CLAUDE.md` finds each.
- `rg -n -e "route-results injects the result on your next prompt" site/content/docs/guides/handoff.md` finds nothing.
- The full-suite totals are in the SUMMARY.
</verification>

<success_criteria>
- Docs, CLAUDE.md, generated data and CHANGELOG describe what objective 73 shipped, limitations included.
- The todo's state matches the live demonstration's outcome.
- Full suite green.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-08-SUMMARY.md` (through
`aof-tools summary post`), including the full-suite totals and the release follow-up line.
</output>
