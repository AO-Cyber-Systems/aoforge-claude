---
objective: 72-install-and-naming-cleanup
trd: "23"
type: standard
wave: 15
depends_on: ["72-22"]
files_modified:
  - "~/.claude/CLAUDE.md (outside this repo; managed block and, after approval, hand-written text)"
autonomous: false
requirements: [INST-06]
must_haves:
  truths:
    - "`~/.claude/CLAUDE.md` carries exactly one managed block, AOFORGE markers, template v4, routing every request to `/aoforge:` commands (rewritten by the global upgrade with a backup)"
    - "The hand-written text outside the block (the TDD & Quality section's product name, and any other legacy product wording) changed only after the user saw the exact diff and approved it; `devflowops` and the Import Paths section are unchanged; a backup of the previous file exists under `~/.claude/aoforge/backups/`"
    - "The user decided, with the facts in front of them, whether the `aocyber` marketplace entry is re-pointed at `AO-Cyber-Systems/aoforge-claude`; if approved, `claude plugin list` still shows aoforge@aocyber installed and enabled afterwards"
  artifacts: []
  key_links:
    - from: "aof-tools upgrade --global [--confirm]"
      to: "~/.claude/CLAUDE.md"
      via: "global-upgrade.cjs (72-09): block by template bump, outside text only with confirm"
      pattern: "upgrade --global"
---

# TRD 72-23: Move the user's global CLAUDE.md and marketplace entry over (approval gates)

<objective>
The user's `~/.claude/CLAUDE.md` routes Claude to DevFlow commands. The AOForge global upgrade rewrote the managed block
at the first AOForge session (template v4, backup first); hand-written text outside the block (the TDD section names
the product) changes only after the user sees the diff and approves it. Separately, decide with the user whether to
re-point the `aocyber` marketplace entry at the renamed repository (GitHub redirects the old slug, so it is optional).

Purpose: INST-06 (global CLAUDE.md; marketplace slug).
Output: an AOForge global CLAUDE.md; a recorded marketplace decision.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/72-install-and-naming-cleanup/72-09-SUMMARY.md

## Approval protocol

Human-action checkpoints (yolo auto-approves the other types); literal replies recorded; `approved` runs the exact
command once; `done` verifies only; anything else holds. One plain command per Bash call. Never port 8080. The user's
global CLAUDE.md is the user's own file: read it narrowly (`rg -n` + offset) and never write it except through
`aof-tools upgrade --global [--confirm]`.
</context>

<embedded_context>

<codebase_examples>
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global            # preview: block state + outside-block diff
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --confirm  # writes the outside-block change (backup first)
claude plugin marketplace --help                                     # what re-pointing a marketplace needs
```
</codebase_examples>

<anti_patterns>
- No direct edit of `~/.claude/CLAUDE.md`; no change outside the block without the approved diff.
- Never remove a marketplace if doing so would uninstall aoforge@aocyber without the user knowing it in advance.
</anti_patterns>

<error_recovery>
- The block is still v3/legacy (the first-session upgrade skipped): `upgrade --global` rewrites it (template bump, no
  confirm needed); record why it had not run.
- The diff includes a line the user wants kept: the user edits the file themselves and replies `done`; never hand-merge.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Inspect the global block and preview the outside-block change</name>
  <files>(none: read-only)</files>
  <action>
`rg -n -e 'AOFORGE:START' -e 'DEVFLOW:START' -e 'AOFORGE:END' -e 'DEVFLOW:END' ~/.claude/CLAUDE.md` (one block, AOFORGE,
v=4); `rg -n '/aoforge:' ~/.claude/CLAUDE.md | head -3`; run `aof-tools upgrade --global` (preview) and capture the
outside-block diff verbatim for Task 2; `ls ~/.claude/aoforge/backups | rg -e global | tail -3` (the block rewrite's
backup). If the block is not yet v4, see error_recovery.
  </action>
  <verify>rg -c 'AOFORGE:START' ~/.claude/CLAUDE.md prints 1</verify>
  <done>Block state recorded; the exact outside diff captured.</done>
  <recovery>If `upgrade --global` errors on multiple blocks, stop and report the marker lines.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: apply the outside-block change to ~/.claude/CLAUDE.md</name>
  <files>~/.claude/CLAUDE.md</files>
  <action>
If Task 1 found no outside-block change, record `nothing to change` and skip. Otherwise STOP and present the diff from
Task 1 verbatim, then: "Approve this change to your hand-written text? Command: `node ~/.claude/aoforge/bin/aof-tools.cjs
upgrade --global --confirm`. A backup of the current file is written first. Reply `approved`, `done` (you edited it
yourself), or anything else to hold."
  </action>
  <instructions>Only the lines in the diff change; everything else in your global CLAUDE.md stays as written.</instructions>
  <verification>The outside text matches the approved diff; Import Paths and devflowops untouched; backup present.</verification>
  <resume-signal>Reply "approved" (I apply it), "done" (you edited it), or anything else to hold.</resume-signal>
  <verify>`node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global` now shows no outside-block diff, and `rg -n devflowops ~/.claude/CLAUDE.md` still matches</verify>
  <done>Reply recorded; outside text updated (or held).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Decision gate: re-point the aocyber marketplace at aoforge-claude?</name>
  <files>(none: local Claude Code marketplace settings)</files>
  <action>
Pre-checks: `claude plugin marketplace --help` and its `list` subcommand; record whether a source can be changed in
place, or only by remove + add, and whether removing a marketplace uninstalls its plugins (from the help text; if unclear,
say so). STOP and present the facts: the current entry uses `AO-Cyber-Systems/devflow-claude`, which GitHub redirects to
`aoforge-claude`, so updates keep working without a change. Offer the exact command sequence for re-pointing (and, if it
removes and re-adds, that aoforge@aocyber must then be reinstalled with `claude plugin install aoforge@aocyber`). "Reply
`approved` (I run the sequence), `skip` (keep the redirecting entry), or anything else to hold."
  </action>
  <instructions>Re-pointing is optional: the old slug redirects. Approve only if you want the entry to name the new repo.</instructions>
  <verification>`approved`: the marketplace lists the new source and aoforge@aocyber is installed and enabled. `skip`:
nothing changed.</verification>
  <resume-signal>Reply "approved", "skip", or anything else to hold.</resume-signal>
  <verify>`claude plugin list` shows aoforge@aocyber enabled (either answer)</verify>
  <done>The decision and, if approved, the new marketplace source are recorded.</done>
</task>

</tasks>

<verification>
- The SUMMARY records the block state, the approved diff (or `nothing to change`), the backup path, and the marketplace
  decision.
</verification>

<success_criteria>
- The user's global instructions route to AOForge, changed only where the user approved.
</success_criteria>

<output>
After completion, create `72-23-SUMMARY.md` in the objective directory through `aof-tools summary post`.
</output>
