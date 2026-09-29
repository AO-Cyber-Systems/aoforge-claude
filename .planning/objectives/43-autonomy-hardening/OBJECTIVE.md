---
objective: 43-autonomy-hardening
kind: plugin
work: feature
status: registered
milestone: v1.4
---

# Objective 43 — Autonomy hardening

Registered 2026-09-29 at the user's request, from the session review in `43-EVIDENCE.md`
(1,860 transcripts, 2026-07-01 → 2026-09-29). Research is skipped: the evidence file is the research.

## Goal

DevFlow executors and orchestrators run to completion without human nudges.

## Verified harness facts (Claude Code 2.1.284, experiment 2026-09-29)

These were measured in a throwaway project with a `maxTurns: 3` agent and logging hooks. Build on them; don't re-derive them.

- **There is no harness turn cap on subagents.** Uncapped agents ran 100–182 turns in a single run. The caps come from DevFlow's frontmatter only.
- **A `maxTurns` stop does NOT fire SubagentStop.** Across 3 capped runs it fired 0 times; it fired only on the natural finish. A hook therefore cannot extend a capped run.
- **What the parent sees on a cap:** the task-notification `<status>` is still `completed`, but `<summary>` reads
  `Agent "<desc>" stopped at its N-turn limit (partial result; SendMessage to task-id to continue)`.
- **SubagentStop `{"decision":"block","reason":"..."}` on a natural stop:** the subagent continues with the reason as its next
  instruction. The re-stop payload has `stop_hook_active: true`.
- **SubagentStop payload fields:** `session_id, transcript_path, cwd, prompt_id, permission_mode, agent_id, agent_type
  (e.g. "devflow:executor"), hook_event_name, stop_hook_active, agent_transcript_path, last_assistant_message,
  background_tasks`.
- **Stop payload fields:** `session_id, transcript_path, cwd, prompt_id, permission_mode, hook_event_name, stop_hook_active,
  last_assistant_message, background_tasks: [{id,type,status,description,agent_type}], session_crons`.
- **PreToolUse payload inside a subagent** carries `agent_id` and `agent_type` (per the hooks reference).
- **A PreToolUse hook cannot see env vars exported inside the Bash command it gates.**

## Requirements

- **AUT-01 (turn caps / INCOMPLETE):** Remove `maxTurns` from `agents/executor.md` and `agents/verifier.md`
  (`guard-no-progress.js` is the runaway guard). In `workflows/execute-objective.md`, add an INCOMPLETE outcome distinct from failure.
  - Detect it when the notification summary says "turn limit" or "partial result", or when SUMMARY.md is missing or lacks Self-Check while commits < tasks.
  - Resume via SendMessage (context intact, numbered remaining steps, "do not re-research") up to 3 times, then fall through to the existing fresh-respawn failure protocol.
  - Truncation never marks dependents skipped.
  - Executor prompt: commit after every task, and keep a `## Progress` checkpoint in SUMMARY.md.
- **AUT-02 (SubagentStop completion gate):** For `agent_type == "devflow:executor"` with `stop_hook_active == false`, find the TRD
  being executed; if it has no SUMMARY.md, block once, with a reason to finish or write the `## Progress` checkpoint. Never block when
  `stop_hook_active` is true, when the TRD can't be identified (fail open), or outside a DevFlow project.
  TRD identification: the agent transcript's first user prompt (via `agent_transcript_path`) names the TRD path/id.
- **AUT-03 (legacy agent-path instructions):** Remove "read ~/.claude/agents/<name>.md" spawn instructions from
  `workflows/plan-objective.md`, `new-project.md`, `security-audit.md`, `quick.md`, `execute-objective.md` and
  `skills/research-objective/SKILL.md` (typed subagents already have their definition). Add the pattern to the doc-refs repo test.
  Leave `lib/global-upgrade.cjs` and the upgrade fixtures alone: they legitimately reference the legacy location.
- **AUT-04 (gates):**
  - `gate-edits.js`: allow when the payload's `agent_type` starts with `devflow:`.
  - `gate-commits.js`: allow when `MERGE_HEAD`, `REBASE_HEAD`/`rebase-merge`/`rebase-apply` or `CHERRY_PICK_HEAD` exists in the git dir (resolve the git dir so worktrees work). Accept an inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …` prefix parsed from the command. Stop suggesting `export`; the message must explain that the inline prefix is the only in-command form.
- **AUT-05 (migration 0008, auto):** Add `.planning/.progress-guard.json` and `.planning/.awareness-cache.json` to
  `.gitignore`, and `git rm --cached` them when tracked. Idempotent, with a test, following 0001–0007 conventions.
- **AUT-06 (auto-continue):** A Stop hook for DevFlow projects that blocks once when all of these hold:
  - a skill marker is live;
  - `stop_hook_active` is false;
  - no `background_tasks` entry has status `running`;
  - `last_assistant_message` announces a next action ("Now …", "Next, …", "Running …", "Writing …", "Starting wave …", "Ready for wave … on your word") and doesn't end with a question to the user.

  The reason tells the model to take the step it announced. Escape hatch: `DEVFLOW_SKIP_AUTOCONTINUE=1`.
  Also treat `mode: "yolo"` as autonomous for between-wave continuation in execute-objective (never ask "continue?" between waves).
- **AUT-07 (small fixes):**
  - `research-synthesizer` returns text, and the orchestrator writes SUMMARY.md (the harness blocks subagent report files).
  - Add `Edit` to the planner's tools.
  - `executor.md`: never `sleep N` then poll; use `run_in_background`.
  - `config-get` returns the documented default with exit 0 for known-but-unset keys (e.g. `workflow.auto_advance`, `workflow.parallelization`); unknown keys still error.

## Constraints

- Strict TDD for hook and df-tools code: failing test committed first. `npm test` stays green.
- No version bump, tag, push or release. Never use port 8080.
- Update the CLAUDE.md hook inventory and `CHANGELOG.md` [Unreleased].
- Hooks are registered in `plugins/devflow/hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`.
- Hook I/O convention: read JSON on stdin; on error, fail open (exit 0, no output).
