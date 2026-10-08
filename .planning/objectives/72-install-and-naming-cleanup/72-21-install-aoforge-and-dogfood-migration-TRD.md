---
objective: 72-install-and-naming-cleanup
trd: "21"
type: standard
wave: 11
depends_on: ["72-20"]
files_modified:
  - ".planning/** -> .aoforge/** (moved by the AOForge upgrade hook with git mv)"
  - .gitignore
autonomous: false
requirements: [INST-01, INST-03, INST-04, INST-06]
must_haves:
  truths:
    - "aoforge@aocyber 3.0.0 was installed only after the user's explicit approval, and the session restarted on it: `~/.claude/aoforge/.plugin-version` reads 3.0.0"
    - "The runtime state migrated: `~/.claude/aoforge/.legacy-state-migrated.json` exists, and the objective 72 run state is under `~/.claude/aoforge/state/estimates/` with the same `started_at` the 72-01 SUMMARY recorded (EST-11 continuity)"
    - "This repository's planning tree is `.aoforge/` (tracked), moved with `git mv` in one commit whose name-status is renames plus ignore-file changes, and `.aoforge/config.json` carries `aoforge.version` 3.0.0 and no legacy stamp key"
    - "`aof-tools validate health` reports no W066/W067, `aof-tools merge-driver install --check` is current, and `ls ~/.claude/skills ~/.claude/agents` shows no `df-*` entry (INST-01 SC1)"
    - "The coexistence notice appeared while devflow@aocyber was still enabled, and devflow@aocyber was then disabled only after the user's explicit approval (`claude plugin list` shows it disabled)"
  artifacts:
    - path: .aoforge/config.json
      provides: "the migrated stamp"
      contains: "aoforge"
  key_links:
    - from: "SessionStart (AOForge 3.0.0) upgrade-project.js"
      to: "migration 0012 on this repository"
      via: "legacy layout keeps the hook off its fast path; clean tree -> git mv + background commit"
      pattern: "0012"
    - from: "sync-runtime.js (AOForge)"
      to: "~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json"
      via: "runtime-state migration copy"
      pattern: "estimates"
---

# TRD 72-21: Install AOForge 3.0.0, restart on it, and let it migrate this repository

<objective>
Switch this machine and this repository onto the released AOForge: install `aoforge@aocyber`, restart Claude Code in
this checkout so the AOForge hooks run (runtime mirror, runtime-state migration, coexistence notice, and the upgrade hook
moving this repo's `.planning/` to `.aoforge/`), verify all of it, then disable the old plugin.

Purpose: INST-06 (this repo on `.aoforge/`), the live proof of INST-03/INST-04, and INST-01's "no df-* under ~/.claude".
Output: AOForge installed and running; this repo migrated; devflow disabled.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-20-SUMMARY.md
@.planning/objectives/72-install-and-naming-cleanup/72-01-SUMMARY.md

## The session switch (read before Task 1)

Task 1 runs in the current DevFlow 2.15.0 session. After it, the user restarts Claude Code in
`/Users/justin/dev/devflow-claude` and resumes with `/aoforge:execute-objective 72`; AOForge's orchestrator re-spawns this
TRD and Tasks 2-3 run in the AOForge session. Every task is idempotent (pre-checks first), so a re-spawn that starts at
Task 1 finds it `already done`. From Task 2 on, use `node ~/.claude/aoforge/bin/aof-tools.cjs` and paths under
`.aoforge/`; `summary post` and `commit` resolve the planning directory themselves.

Before the restart the working tree must be clean (everything committed), or the upgrade hook defers the move (by
design); the executor checks this in Task 1.

## Approval protocol

Human-action checkpoints (yolo auto-approves the other types); the user's literal reply is recorded; `approved` runs
the exact commands once; `done` verifies only; anything else holds. One plain command per Bash call. Never port 8080.
</context>

<embedded_context>

<codebase_examples>
Claude Code plugin CLI (available on this machine):
```bash
claude plugin marketplace update aocyber
claude plugin install aoforge@aocyber
claude plugin list
claude plugin disable devflow@aocyber
```
</codebase_examples>

<anti_patterns>
- Never uninstall devflow@aocyber here (disable is reversible; uninstall is the user's call).
- Never move `.planning/` by hand while the hook can do it; the manual path is only for a deferred move.
- Never edit `~/.claude/settings.json` directly.
</anti_patterns>

<error_recovery>
- The hook deferred (dirty tree at session start): make the tree clean (commit through `aof-tools commit`), then
  `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --only 0012` and commit the move with
  `aof-tools commit "chore(72-21): move the planning tree to .aoforge" --files .planning .aoforge .gitignore`.
- The 72 run state is missing under `~/.claude/aoforge/`: this is a home move, not a key change, so `state rekey` does
  not apply. Run the 72-07 migration (`aof-tools doctor --global --fix` runs it when the marker is missing); if the
  marker exists but the file is absent, copy that one file and record the deviation. Never edit it.
- `merge-driver install --check` stale: run `aof-tools merge-driver install`.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: install aoforge@aocyber, then restart Claude Code on it</name>
  <files>(none: Claude Code plugin install, local)</files>
  <action>
Pre-checks: `claude plugin list` (is aoforge@aocyber installed? then `already done`, go to the restart instruction);
`git -C /Users/justin/dev/devflow-claude status --porcelain` must be empty (if not, commit the executor's own pending
bookkeeping through df-tools commit first; anything else -> return blocked naming the files); record the 72 run-state
`started_at` from `~/.claude/devflow/state/estimates/devflow-claude-d3dccfe9.json`.

STOP and present: "Approve installing AOForge 3.0.0? Commands: `claude plugin marketplace update aocyber` then `claude
plugin install aoforge@aocyber`. Effects: the marketplace refresh may also update devflow@aocyber to its 3.0.0 pointer
release; AOForge takes effect at the next session start, when it mirrors its runtime to ~/.claude/aoforge/, copies your
runtime state there (the old home stays as the backup), and moves this repository's .planning/ to .aoforge/ in one
commit. Reply `approved`, `done`, or anything else to hold."

On `approved`: run both commands. Then return a second human-action checkpoint: "Restart Claude Code in
/Users/justin/dev/devflow-claude and run `/aoforge:execute-objective 72`. The devflow plugin stays enabled for now so the
coexistence notice can be checked. Reply `restarted` in the new session."
  </action>
  <instructions>Install AOForge, then restart on it so its hooks run against this repository.</instructions>
  <verification>`claude plugin list` shows aoforge@aocyber 3.0.0 installed.</verification>
  <resume-signal>Reply "approved" (I install), "done" (you installed); after the restart, the new session continues.</resume-signal>
  <verify>`claude plugin list` shows aoforge@aocyber 3.0.0</verify>
  <done>Reply recorded; AOForge installed; the user restarted on it (or `held at install`).</done>
</task>

<task type="auto">
  <name>Task 2: Verify the AOForge session: runtime, state, this repository, health</name>
  <files>.aoforge/** (verification; a deferred move only per error_recovery), .gitignore</files>
  <action>
In the AOForge session, one plain command per call, recording each result in the SUMMARY:
1. `cat ~/.claude/aoforge/.plugin-version` (3.0.0); `cat ~/.claude/aoforge/.legacy-state-migrated.json`.
2. `node -e` printing objective/started_at from `~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json`
   (= Task 1's record).
3. `git -C /Users/justin/dev/devflow-claude log -3 --format='%h %s'`; `git ... show --name-status --format= <move sha> | rg -v '^R100' | head`
   (only ignore files); `test -d .aoforge && test ! -e .planning`; `node -e` on `.aoforge/config.json` (aoforge key,
   no legacy key). Deferred? -> error_recovery.
4. `node ~/.claude/aoforge/bin/aof-tools.cjs validate health --raw` (no W066/W067);
   `aof-tools merge-driver install --check` (install if stale); `ls ~/.claude/skills ~/.claude/agents`.
5. The coexistence notice: `aof-tools doctor --global --json` shows check 16's devflow-enabled finding, and the notice
   text was shown at the first prompt (record it).
  </action>
  <verify>node ~/.claude/aoforge/bin/aof-tools.cjs validate health --raw</verify>
  <done>Every truth except the disable holds, with evidence in the SUMMARY.</done>
  <recovery>Any failed truth: record it, fix through error_recovery where listed, otherwise return failed (a gap TRD).</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: disable devflow@aocyber</name>
  <files>(none: local plugin setting)</files>
  <action>
Pre-check: `claude plugin list` (already disabled -> `already done`).

STOP and present: "Approve disabling the old plugin? Command: `claude plugin disable devflow@aocyber`. Effects: from the
next session only AOForge's hooks run; the plugin stays installed (re-enable any time); its old runtime home
~/.claude/devflow/ is left in place until you choose to run `aof-tools doctor --global --fix` (which moves it into
~/.claude/aoforge/backups/, never deletes). Reply `approved`,
`done`, or anything else to hold."
  </action>
  <instructions>Disabling stops the old plugin's hooks from running beside AOForge.</instructions>
  <verification>`claude plugin list` shows devflow@aocyber disabled.</verification>
  <resume-signal>Reply "approved" (I disable), "done" (you did), or anything else to hold.</resume-signal>
  <verify>`claude plugin list` shows devflow@aocyber disabled and aoforge@aocyber enabled</verify>
  <done>Reply recorded; devflow disabled, or `held at disable`.</done>
</task>

</tasks>

<verification>
- `test -d /Users/justin/dev/devflow-claude/.aoforge && git -C /Users/justin/dev/devflow-claude ls-files .aoforge | head -1`
- The SUMMARY holds the evidence for every truth.
</verification>

<success_criteria>
- This machine runs AOForge 3.0.0, its state and this repository moved over intact, and the old plugin is disabled.
</success_criteria>

<output>
After completion, create `72-21-SUMMARY.md` in the objective directory (now under `.aoforge/objectives/`) through
`aof-tools summary post`.
</output>
