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
  - "This repository's planning tree is .aoforge/ (4f0ed6b8, 1406 renames, stamp aoforge.version 3.0.0); runtime mirror 3.0.0 and runtime-state migration done; merge driver re-installed for .aoforge/"
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

CHECKPOINT (Tasks 1-2 of 3 done, disable approval pending): the restarted AOForge 3.0.0 session migrated this repository to `.aoforge/` in one rename commit (4f0ed6b8), carried the runtime state over, and showed the coexistence notice. devflow@aocyber 2.15.0 is still enabled, waiting for Task 3's approval.

## Progress
- [x] Task 1: Approval gate: install aoforge@aocyber, then restart Claude Code on it. Install done, user restarted on AOForge. Checkpoint commit: de827412
- [x] Task 2: Verify the AOForge session: runtime, state, this repository, health. Done (this commit). Every truth except the disable holds; the stale merge driver was re-installed per error_recovery
- [ ] Task 3: Approval gate: disable devflow@aocyber. Next step: pre-check done (`claude plugin list` at about 2026-10-09T13:44Z: devflow@aocyber 2.15.0 ✔ enabled, aoforge@aocyber 3.0.0 ✔ enabled, so not `already done`). On the user's literal `approved`, run `claude plugin disable devflow@aocyber` once, then `claude plugin list` and confirm devflow@aocyber shows disabled and aoforge@aocyber enabled

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

## Task 2: AOForge session verification (2026-10-09T13:43-13:45Z, AOForge 3.0.0 session)

Preflight: `exec-context check --repo /Users/justin/dev/devflow-claude --base 4f0ed6b8 --id 72-21` exit 0; main checkout, branch feat/stack-profile-loader, head 4f0ed6b8cf207695afca053572589e6b075395d3, `base_visible: true`, claim 72-21.

| # | Check | Result | Truth |
|---|---|---|---|
| 0 | `aof-tools init execute-objective 72` | `"objective_dir": ".aoforge/objectives/72-install-and-naming-cleanup"`; 72-21-SUMMARY.md listed (checkpoint), incomplete_jobs 72-22..72-26. Orchestrator resume point (relayed): `/aoforge:execute-objective 72` resumed at **72-21 Task 2** | 3 (manual resume): PASS |
| 1a | `cat ~/.claude/aoforge/.plugin-version` | `3.0.0` | 1: PASS |
| 1b | `cat ~/.claude/aoforge/.legacy-state-migrated.json` | exists: `from` `/Users/justin/.claude/devflow`, `at` 2026-10-09T13:42:43.792Z; 41 copied (incl. `calibration.json`, `audit.log`, `transcript-index.jsonl`, `state/estimates/devflow-claude-d3dccfe9.json`, 8 history files for 63-71), 18 moved (`backups/*` incl. `.registry.json`, `state/outbox/devflow-store-smoke-*`), 1 skipped (`state/transcript-export/last-run.json`) | 2: PASS |
| 2 | 72-01 `run_state:` line | `run_state: unscored (accepted: unscored)`: **no run state (unscored)**, so none is expected | 2: PASS (unscored path) |
| 2i | Informational (72-07 hand-off, not a must-have): `node -e` on `~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json` | `{"objective":"72","started_at":"2026-10-08T22:24:56.615Z","finished_at":null,"waves":18}`: reached the new home with the same `started_at` Task 1 recorded from the old home | info: YES |
| 3a | `git log -3 --format='%h %s'` | `4f0ed6b8 chore(aoforge): upgrade project to v3.0.0` / `de827412 docs(72-21): checkpoint after installing aoforge 3.0.0` / `9dd54b5e docs(72-20): complete merge, tag and release TRD` | 4 |
| 3b | `git show --name-status --format= 4f0ed6b8`, minus `R100` lines | 1406 entries: 1404 `R100`, plus `R099 .planning/STATE.md .aoforge/STATE.md` and `R092 .planning/config.json .aoforge/config.json`. Every entry is a rename; no A/M/D | 4: PASS |
| 3c | rename-aware diff of the two non-R100 files | `config.json`: `devflow{version 2.15.0, migrations_applied [0001,0004,0009]}` became `aoforge{version 3.0.0, migrations_applied [0001,0004,0007,0009,0012,0013], upgraded_at 2026-10-09T13:42:43.781Z}`. `STATE.md`: migration 0007 rewrote 7 `/devflow:<cmd>` references to `/aoforge:<cmd>` (objective 37 line, TRD 02-05, 03-05, 05-04, 12-02 entries, quick rows 13 and 15) | 4: PASS |
| 3d | `test -d .aoforge`; `test ! -e .planning` | both exit 0 | 4: PASS |
| 3e | `node -e` on `.aoforge/config.json` | `aoforge.version` `3.0.0`, `has_devflow_key: false` | 4: PASS |
| 3f | `git ls-files --error-unmatch .aoforge/config.json .aoforge/STATE.md .aoforge/objectives/72-.../72-21-SUMMARY.md` | all three tracked (exit 0) | 4: PASS |
| 3g | `.gitignore` | no change in 4f0ed6b8: the `.aoforge/` twin of every `.planning/` runtime line was already present (lines 28-68), so the move needed no ignore edit | 4: PASS |
| 4a | `aof-tools validate health --raw` | exit 0, `status: degraded`, errors `[]`; warnings only W006 x3 (objectives 73, 74, 75 in ROADMAP with no directory: planned objectives, not this TRD); **no W066/W067**; engine running/mirror/installed/main all 3.0.0 | 5: PASS |
| 4b | `aof-tools merge-driver install --check` | first run **stale**: `installed:false, attributes_ok:false, driver_ok:false` (`.git/info/attributes` held only the DevFlow block for `**/.planning/*`, `merge.devflow-state-json` pointed at `~/.claude/devflow/bin/df-tools.cjs`). error_recovery: `aof-tools merge-driver install` gave `installed:true, changed:true`; re-check `installed:true, attributes_ok:true, driver_ok:true` | 5: PASS after recovery |
| 4c | `ls ~/.claude/skills ~/.claude/agents` | `agents:` empty; `skills:` only `synced`. No `df-*` entry | 5: PASS (INST-01 SC1) |
| 5a | `aof-tools doctor --global --json` (read-only, no `--fix`) check 16 `legacy-plugin-runtime` | `severity: warn`, findings `plugin-enabled`: "The DevFlow plugin (devflow@aocyber v2.15.0) is still enabled beside AOForge, so its hooks and gates may run twice. Disable it: claude plugin disable devflow@aocyber", and `runtime-leftover`: "the DevFlow runtime home /Users/justin/.claude/devflow is left over after the migration; it cannot be moved while devflow@aocyber is enabled (it keeps writing there)"; `migrated: true`, `plugin: {installed, enabled, version 2.15.0, pointer false}`. Other checks ok (9 ok, 1 warn); check 15 `legacy-df-install` ok | 6 (notice half): PASS |
| 5b | The notice shown at the first prompt: `~/.claude/aoforge/.aoforge-notices.json` | `source: coexistence-guard`, `level: action`, `ts` 2026-10-09T13:42:43.698Z, `key: coexistence:1c14a6e5-33a1-4f35-adda-4ba2db358951` (this session), `consumed: true` (route-results emitted it). Text: "The DevFlow plugin (devflow@aocyber v2.15.0) is still enabled beside AOForge, so its hooks and gates may run twice. Disable it: claude plugin disable devflow@aocyber" | 6 (notice half): PASS |

### Task 2 observations (no action taken)

- The same session start also queued two `global-upgrade` notices (both consumed): `~/.claude/CLAUDE.md` block moved v3 to v4 (`<!-- AOFORGE:START v=4 src=global-claude-md -->`, `# AOForge Routing`, backup `~/.claude/aoforge/backups/global-2026-10-09T13-42-43-820Z/CLAUDE.md`), and 2 hand-written lines outside the block still name DevFlow (the `## TDD & Quality` paragraph), waiting for `aof-tools upgrade --global --confirm`. Not run here: that is 72-23's scope.
- `.aoforge/STATE.md` still reads `# DevFlow State` and `See: .planning/PROJECT.md`: migrations 0012/0007 move the tree and fix command references only, never prose. This is 72-22's (active docs) scope.
- `.git/info/attributes` keeps the old `# >>> devflow merge drivers` block above the new `aoforge` block, and `git config merge.devflow-state-json.*` is still set. Harmless: the AOForge block comes later, so for `**/.planning/state.json` it wins (`merge=aoforge-state-json`). Per-clone, untracked; left in place.
- Check 16's combined `fix_command` repeats the disable command: `claude plugin disable devflow@aocyber; claude plugin disable devflow@aocyber, then node ~/.claude/aoforge/bin/aof-tools.cjs doctor --global --fix`. Cosmetic (the per-finding `fix_command`s are correct); candidate for a gap/quick fix.
- 4f0ed6b8 was committed by the upgrade hook, not through an executor. Before this checkpoint the branch was 0 behind, 4 ahead of origin/feat/stack-profile-loader (8582fce9, 9dd54b5e, de827412, 4f0ed6b8); this checkpoint makes 5. Nothing was pushed.
