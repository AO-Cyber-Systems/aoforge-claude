---
objective: 72-install-and-naming-cleanup
trd: "23"
subsystem: install
tags: [install, global-claude-md, marketplace, approval-gates]
requirements: [INST-06]
requires:
  - objective: 72
    provides: "72-21: AOForge 3.0.0 installed and the global block moved to AOFORGE v4 at the first AOForge session; 72-22: active docs in AOForge terms"
provides: []
affects: [72-24, 72-25, 72-26]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions: []
requirements-completed: []
metrics:
  started: 2026-10-09T14:00:42Z
---

# Objective 72 TRD 23: Move the user's global CLAUDE.md and marketplace entry over (approval gates) Summary

**Checkpoint: Task 1 (read-only inspection) is done. Tasks 2 and 3 are human-action gates waiting on the user's literal replies.**

## Progress
- [x] Task 1: Inspect the global block and preview the outside-block change (read-only) — (this commit)
- [ ] Task 2: Approval gate: apply the outside-block change to ~/.claude/CLAUDE.md — next step: on the user's literal reply `approved`, run `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --confirm` once, then verify `upgrade --global` shows `outside.lines: 0`, `rg -n devflowops ~/.claude/CLAUDE.md` still matches line 16, and a new `~/.claude/aoforge/backups/global-*` directory holds the previous file
- [ ] Task 3: Decision gate: re-point the aocyber marketplace at aoforge-claude (separate reply: `approved`, `skip`, or hold)

## Task 1: block state and outside-block preview (2026-10-09T14:00-14:05Z, AOForge 3.0.0 session)

Preflight: `exec-context check --repo /Users/justin/dev/devflow-claude --base feat/stack-profile-loader --id 72-23` exit 0; main checkout, branch feat/stack-profile-loader, head 701742cc03b194202c37a4e58569ae4848fb3f59, `base_visible: true`, claim 72-23. The dispatch named no explicit WAVE_BASE, so the objective branch tip was used.

| Check | Result |
|---|---|
| `rg -n -e 'AOFORGE:START' -e 'DEVFLOW:START' -e 'AOFORGE:END' -e 'DEVFLOW:END' ~/.claude/CLAUDE.md` | line 24 `<!-- AOFORGE:START v=4 src=global-claude-md -->`, line 47 `<!-- AOFORGE:END -->`. One block, AOFORGE markers, v=4, no DEVFLOW marker |
| `rg -c 'AOFORGE:START' ~/.claude/CLAUDE.md` (Task 1 verify) | `1` |
| `rg -n '/aoforge:' ~/.claude/CLAUDE.md` | lines 30-46: build, plan-objective, execute-objective, verify-work, debug, quick, micro, new-project, adopt, status, doctor, milestone, todo, gh-sync, discuss-objective, help. Heading line 25 `# AOForge Routing` |
| `aof-tools upgrade --global` (preview, JSON) | `dryRun: true`; `legacy.moved: []`; `block: {action: "none", from: null, to: "4"}` (already current, nothing to rewrite); `outside: {lines: 2, applied: false, backup: null}` |
| Block-rewrite backup | `~/.claude/aoforge/backups/global-2026-10-09T13-42-43-820Z/CLAUDE.md` (12465 bytes) holds the pre-rewrite file: `<!-- DEVFLOW:START v=3 src=global-claude-md -->` / `# DevFlow Routing` at lines 24-25. The rewrite ran at the first AOForge session (72-21 Task 2), so error_recovery was not needed |
| Other backups | `global-2026-10-06T19-29-44-185Z` (an earlier global upgrade) |
| `rg -n -i -e devflowops -e '^# Import Paths' -e devflow ~/.claude/CLAUDE.md` | line 14 `# Import Paths — Vanity Domains (decided 2026-09-28)`; line 16 `... a later devflowops move ...` (PRESERVE token, not in the diff); lines 51 and 53 (the diff). No other legacy wording |
| `ls -l ~/.claude/aoforge/references/defaults-table.md` | exists (22738 bytes), so the proposed path resolves |

### The exact outside-block diff (verbatim from `upgrade --global --raw`)

```diff
--- ~/.claude/CLAUDE.md
+++ ~/.claude/CLAUDE.md (proposed)
@@ -48,9 +48,9 @@
 
 ## TDD & Quality
 
-DevFlow's intent model splits testing rigor by project kind. For `library`, `api`, and `cli` kind projects: write the failing test before the implementation, then implement to green — a strict pairing. For `app` and `ui-lib` kind projects: tests are written alongside the code they cover, not necessarily ahead of it — a pragmatic pairing. Prototype and spike work is exempt from both postures.
+AOForge's intent model splits testing rigor by project kind. For `library`, `api`, and `cli` kind projects: write the failing test before the implementation, then implement to green — a strict pairing. For `app` and `ui-lib` kind projects: tests are written alongside the code they cover, not necessarily ahead of it — a pragmatic pairing. Prototype and spike work is exempt from both postures.
 
-The machine-enforced version of this split lives in DevFlow's (kind, work) defaults table (`~/.claude/devflow/references/defaults-table.md`); this section is human-readable policy, not a resolver override.
+The machine-enforced version of this split lives in AOForge's (kind, work) defaults table (`~/.claude/aoforge/references/defaults-table.md`); this section is human-readable policy, not a resolver override.
 
 # AO Cyber Systems — Brand Guide
```

## Task 3 pre-check facts (read-only, gathered with Task 1)

| Check | Result |
|---|---|
| `claude plugin marketplace --help` | subcommands `add <source>`, `list`, `remove\|rm <name>`, `update [name]`. No subcommand changes a source in place: re-pointing is remove + add |
| `claude plugin marketplace remove --help` | options `--json`, `--scope user\|project\|local` ("Omit to remove it from every scope"). The help text does **not** say whether removing a marketplace uninstalls its plugins: unclear, so assume it may |
| `claude plugin marketplace add --help` | `--scope` (user default), `--sparse`, `--json`, `--claudeai` |
| `claude plugin marketplace list --json` | `aocyber`: `source: github`, `repo: AO-Cyber-Systems/devflow-claude`, installLocation `~/.claude/plugins/marketplaces/aocyber` |
| `~/.claude/plugins/known_marketplaces.json` | same source, `lastUpdated` 2026-10-09T13:41:15.600Z (72-21's refresh) |
| Local clone remote | `https://github.com/AO-Cyber-Systems/devflow-claude.git` |
| `gh api repos/AO-Cyber-Systems/devflow-claude --jq .full_name` | `AO-Cyber-Systems/aoforge-claude`: the old slug redirects |
| Repo manifest `.claude-plugin/marketplace.json` | `"name": "aocyber"`, so a re-added marketplace keeps the name and the `@aocyber` plugin ids |
| `claude plugin list` (aocyber plugins) | `aoforge@aocyber` 3.0.0 ✔ enabled; `devflow@aocyber` 2.15.0 ✘ disabled; `eden-ui-flutter@aocyber` 1.0.0 ✔ enabled |
| `~/.claude/settings.json` (read only, not edited) | `enabledPlugins`: `devflow@aocyber: false`, `eden-ui-flutter@aocyber: true`, `aoforge@aocyber: true` |
