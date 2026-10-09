---
objective: 72-install-and-naming-cleanup
trd: "21"
subsystem: install
tags: [install, plugin, migration, dogfood, approval-gates]
requirements: [INST-01, INST-03, INST-04, INST-06]
requires:
  - objective: 72
    provides: "72-20: AOForge 3.0.0 on main (b4a9d870), tag v3.0.0, marketplace serves aoforge 3.0.0 + devflow pointer 3.0.0"
provides:
  - "aoforge@aocyber 3.0.0 installed (user scope, enabled) beside devflow@aocyber 2.15.0 (still enabled)"
affects: [72-22, 72-23, 72-25, 72-26]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions:
  - "The 9 untracked empty .planning/objectives/*/.gitkeep files were removed (user's choice, \"Remove them (Recommended)\") so the upgrade hook can commit the .planning/ -> .aoforge/ move"
metrics:
  started: 2026-10-09T13:38:21Z
---

# Objective 72 TRD 21: Install AOForge 3.0.0, restart on it, and let it migrate this repository Summary

CHECKPOINT (Task 1 of 3 done, restart pending): aoforge@aocyber 3.0.0 is installed and enabled beside devflow@aocyber 2.15.0. The tree is clean so the AOForge upgrade hook can move `.planning/` to `.aoforge/` at the next session start.

## Progress
- [x] Task 1: Approval gate: install aoforge@aocyber, then restart Claude Code on it. Install done (no code commit; this checkpoint is (this commit)). Restart handed to the user as the second human-action checkpoint
- [ ] Task 2: Verify the AOForge session: runtime, state, this repository, health. Next step: in the restarted AOForge session, run `node ~/.claude/aoforge/bin/aof-tools.cjs init execute-objective 72` and quote its `objective_dir` (must start with `.aoforge/`), then `cat ~/.claude/aoforge/.plugin-version` and `cat ~/.claude/aoforge/.legacy-state-migrated.json`
- [ ] Task 3: Approval gate: disable devflow@aocyber

## Approvals (literal replies)

| Gate | Reply | Run |
|---|---|---|
| 1a. untracked .gitkeeps | "Remove them (Recommended)" (user's AskUserQuestion reply, relayed by the orchestrator) | `rm` of exactly the 9 paths below (one command, exit 0); `git status --porcelain` then empty |
| 1b. install | "approved" (user's AskUserQuestion reply, relayed by the orchestrator) | `claude plugin marketplace update aocyber` (run once): `Cloning repository (timeout: 120s): git@github.com:AO-Cyber-Systems/devflow-claude.git` ... `✔ Successfully updated marketplace: aocyber`; `claude plugin install aoforge@aocyber` (run once): `✔ Successfully installed plugin: aoforge@aocyber (scope: user)` |

## Task 1 pre-check facts (2026-10-09T13:38Z, DevFlow 2.15.0 session)

- Preflight: `exec-context check --repo /Users/justin/dev/devflow-claude --base 9dd54b5e --id 72-21` exit 0; main checkout, branch feat/stack-profile-loader, head 9dd54b5e7ba2da4ae997b5a6195ae5597121e782, claim 72-21.
- `claude plugin list`: devflow@aocyber 2.15.0 enabled; aoforge@aocyber not installed (not `already done`). `~/.claude/aoforge/` absent.
- `claude plugin marketplace list`: `aocyber` source `GitHub (AO-Cyber-Systems/devflow-claude)` (old slug; 72-19 verified it redirects to aoforge-claude). Local marketplace manifest before the refresh: 2.15.0, no `aoforge` entry.
- `git status --porcelain`: 9 untracked, 0-byte `.gitkeep`s, each in a folder that already has tracked files:
  `.planning/objectives/{26-github-issue-auto-build-monitor,27-gate-correctness,28-model-tier-binding-and-escalation,29-context-discipline,30-agent-environment-hygiene,31-telemetry-and-retention,53-worktree-and-health-hygiene,54-codeql-cleanup,55-store-live-smoke-fixes}/.gitkeep`.
  Per the 72-08 and 72-18 hand-offs they would make the hook stage the move without committing it, and leave `.planning/` behind.
- Run state: 72-01 says `run_state: unscored (accepted: unscored)`, so no run state is expected. A run-state file exists anyway:
  `~/.claude/devflow/state/estimates/devflow-claude-d3dccfe9.json` with objective `72`, `started_at` `2026-10-08T22:24:56.615Z`, `finished_at` null, 18 waves, and estimate line "No estimate: objective 72 has no minutes data in the calibration; run df-tools calibrate" (confidence none).
  Recorded so Task 2 can check it reached the new home, as the 72-07 hand-off asks. This is informational, not a must-have on the unscored path.
- Branch vs origin: 0 behind, 2 ahead (8582fce9, 9dd54b5e). They touch only `.planning/` (ROADMAP.md, STATE.md, STATE_ARCHIVE.md, state.json, 72-19 and 72-20 SUMMARYs). Unpushed; this does not block the install, and nothing was pushed.

## Task 1 verify (after the install)

| Check | Result |
|---|---|
| `claude plugin list` | `aoforge@aocyber` Version 3.0.0, Scope user, ✔ enabled; `devflow@aocyber` Version 2.15.0, ✔ enabled (not updated by the refresh; not disabled) |
| refreshed `~/.claude/plugins/marketplaces/aocyber/.claude-plugin/marketplace.json` | marketplace 3.0.0; aoforge@3.0.0, devflow@3.0.0, social-media-generator@1.3.1, aosentry-mcp@1.0.1, eden-ui-flutter@1.0.1, eden-ui-web@1.0.1, monorepo-standards@0.1.1 |
| `git status --porcelain` | empty |
| `stat ~/.claude/aoforge` | No such file or directory (expected: AOForge mirrors its runtime at the next session start) |

## Hand-off to the AOForge session (Tasks 2-3)

- The restart is the user's step: restart Claude Code in `/Users/justin/dev/devflow-claude` and run `/aoforge:execute-objective 72`. devflow@aocyber stays enabled so the coexistence notice can be checked (Task 2 step 5); disabling it is Task 3's separate approval gate.
- devflow@aocyber is still 2.15.0 installed, although the marketplace now serves its 3.0.0 pointer. Nothing here updated it.
- The installed 2.15.0 keeps writing `~/.claude/devflow/` until Task 3 (72-07 hand-off). The run-state copy happens once, so anything the old runtime writes after the first AOForge session stays in the old home.
- Not run, by instruction: `claude plugin disable`, `doctor --global --fix`, any push.
