---
objective: 72-install-and-naming-cleanup
trd: "23"
subsystem: install
tags: [install, global-claude-md, marketplace, approval-gates]
requirements: [INST-06]
requires:
  - objective: 72
    provides: "72-21: AOForge 3.0.0 installed and the global block moved to AOFORGE v4 at the first AOForge session; 72-22: active docs in AOForge terms"
provides:
  - "~/.claude/CLAUDE.md: one AOFORGE v4 managed block routing to /aoforge: commands, and the two hand-written TDD & Quality lines now name AOForge and ~/.claude/aoforge/references/defaults-table.md (approved; backup global-2026-10-09T14-03-31-298Z)"
  - "Marketplace decision recorded: skip. The aocyber entry keeps its redirecting source AO-Cyber-Systems/devflow-claude"
affects: [72-24, 72-25, 72-26]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - "~/.claude/CLAUDE.md (outside this repo; lines 51 and 53, via upgrade --global --confirm)"
    - CLAUDE.md
decisions:
  - "Global CLAUDE.md outside-block rewrite approved (\"approved\") and applied once with upgrade --global --confirm; only the two TDD & Quality lines changed"
  - "aocyber marketplace re-point skipped (\"skip (Recommended)\"): the old slug redirects to aoforge-claude, and remove + add could uninstall aoforge, eden-ui-flutter and the disabled pre-rename plugin"
requirements-completed: []
metrics:
  started: 2026-10-09T14:00:42Z
  completed: 2026-10-09T14:04:37Z
  duration: "about 4 min of executor time, plus the approval wait"
  tasks: 3
  files: 2
tokens_input: 3815926
tokens_output: 24761
tokens_cache_read: 3725115
tokens_cache_write: 90729
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 23: Move the user's global CLAUDE.md and marketplace entry over (approval gates) Summary

**`~/.claude/CLAUDE.md` now routes to AOForge throughout. The managed block was already AOFORGE v4 from the first AOForge session. After the user approved the shown diff, `upgrade --global --confirm` rewrote the two hand-written TDD & Quality lines to AOForge, with a backup first. The `aocyber` marketplace re-point was skipped by the user's choice, so its redirecting entry is unchanged.**

## Progress
- [x] Task 1: Inspect the global block and preview the outside-block change (read-only) — 2c92f943
- [x] Task 2: Approval gate: apply the outside-block change to ~/.claude/CLAUDE.md. Reply "approved"; `upgrade --global --confirm` run once; only lines 51 and 53 changed — e355e010
- [x] Task 3: Decision gate: re-point the aocyber marketplace at aoforge-claude. Reply "skip (Recommended)"; no marketplace command run; recorded in the final docs commit

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

## Approvals (literal replies)

| Gate | Reply | Run |
|---|---|---|
| A. Task 2, the change outside the block | "approved" (user's AskUserQuestion reply, relayed by the orchestrator) | `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --confirm` (run once): `outside.applied: true`, `outside.lines: 2`, `block.action: none`, backup `/Users/justin/.claude/aoforge/backups/global-2026-10-09T14-03-31-298Z/CLAUDE.md` |
| B. Task 3, the marketplace re-point | "skip (Recommended)" (user's AskUserQuestion reply, relayed by the orchestrator) | nothing: no `claude plugin marketplace remove/add`, no install or uninstall |

## Task 2: apply the approved diff (2026-10-09T14:03Z)

| Check | Result |
|---|---|
| `diff <backup> ~/.claude/CLAUDE.md` | exactly `51c51` and `53c53`: the two TDD & Quality lines, DevFlow's to AOForge's and `~/.claude/devflow/references/defaults-table.md` to `~/.claude/aoforge/references/defaults-table.md`. Nothing else differs; both files are 106 lines |
| `ls -l ~/.claude/aoforge/backups/global-2026-10-09T14-03-31-298Z` | `CLAUDE.md`, 12468 bytes: the file as it was just before the rewrite |
| `aof-tools upgrade --global --raw` (TRD verify) | `legacy: none; CLAUDE.md block: none; check only; nothing written`: no outside-block diff remains |
| `rg -n -i -e devflowops -e devflow -e '^# Import Paths' -e 'AOFORGE:' ~/.claude/CLAUDE.md` | line 14 `# Import Paths — Vanity Domains (decided 2026-09-28)` and line 16 `... a later devflowops move ...` unchanged; markers at 24 (`AOFORGE:START v=4`) and 47. No other legacy wording left in the file |
| Notice | `global-upgrade` info notice queued: "AOForge v3.0.0 rewrote 2 hand-written line(s) outside the managed block ... as approved with --confirm" |

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

Re-point sequence offered (not run): `claude plugin marketplace remove aocyber`, then `claude plugin marketplace add AO-Cyber-Systems/aoforge-claude`, then `claude plugin install aoforge@aocyber` and `claude plugin install eden-ui-flutter@aocyber`. The disabled pre-rename plugin would not have been reinstalled.

## Task 3: decision recorded (2026-10-09T14:04Z)

| Step | Command | Result |
|---|---|---|
| Gate | (orchestrator relay) | the user's literal reply: "skip (Recommended)". Recorded as **skip** |
| Run | none | no marketplace, install or settings command was run |
| Verify | `claude plugin list` | `aoforge@aocyber` 3.0.0, user, **✔ enabled**; `eden-ui-flutter@aocyber` 1.0.0 ✔ enabled; the pre-rename plugin 2.15.0 ✘ disabled (unchanged since 72-21) |
| Verify | `claude plugin marketplace list --json` | `aocyber`: `source: github`, `repo: AO-Cyber-Systems/devflow-claude`. Unchanged; GitHub redirects it to `AO-Cyber-Systems/aoforge-claude` |

## Must-haves

| # | Truth | Evidence | Status |
|---|---|---|---|
| 1 | One managed block, AOFORGE markers, template v4, routing to `/aoforge:`, rewritten by the global upgrade with a backup | Task 1: markers at lines 24/47 `v=4`, `rg -c` = 1, `/aoforge:` lines 30-46; block-rewrite backup `global-2026-10-09T13-42-43-820Z/CLAUDE.md` holds the v3 block | PASS |
| 2 | Outside text changed only after the shown diff was approved; `devflowops` and Import Paths unchanged; backup under `~/.claude/aoforge/backups/` | Approval A; `diff` backup vs live = `51c51`, `53c53` only; lines 14 and 16 intact; backup `global-2026-10-09T14-03-31-298Z/CLAUDE.md` (12468 bytes) | PASS |
| 3 | The user decided the marketplace re-point with the facts in front of them | Task 3 pre-check facts were presented in the checkpoint; reply "skip (Recommended)"; `claude plugin list` shows aoforge@aocyber enabled | PASS |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Inspect the block, preview the diff | `rg -c 'AOFORGE:START' ~/.claude/CLAUDE.md` (prints `1`) | 0 | PASS |
| 2: Apply the approved diff | `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --raw` (no outside-block diff) and `rg -n devflowops ~/.claude/CLAUDE.md` (line 16) | 0 | PASS |
| 3: Marketplace decision | `claude plugin list` (aoforge@aocyber ✔ enabled) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| CLAUDE.md guards (after the "Where we left off" edit) | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs dispatch-completeness.test.cjs` | 0 | PASS: tests 45, pass 45, fail 0 |
| stack task gates (test/lint/build) | not run | n/a | not_available: no source file changed. The only repo changes are this SUMMARY, CLAUDE.md prose and the planning state |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing, 72-22 hand-off] Project CLAUDE.md "Where we left off" updated**
- **Found during:** finishing the TRD. 72-22 asked that each rollout step update this section as it lands.
- **Fix:** "at TRD 72-22 of 26" became "72-23", and the 72-23 bullet now records the outcome: the block is v4, the two lines were rewritten after approval (with the backup path), and the re-point was skipped. No legacy spelling was added, because the rename guard scans CLAUDE.md line for line.
- **Files modified:** `CLAUDE.md`
- **Commit:** the final docs commit

**2. [Dispatch] No explicit WAVE_BASE**
- The dispatch named no WAVE_BASE, so the preflight used the objective branch tip `feat/stack-profile-loader` (701742cc, the 72-22 completion commit).

Otherwise the TRD ran as written. `~/.claude/CLAUDE.md` was written only by `aof-tools upgrade --global --confirm`. No marketplace command, settings.json edit or push was made.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3
- Gate failures: none
- INST-06 stays Pending: 72-24 (vanity PR, Pages), 72-25 (fleet) and 72-26 (checkout move) still carry it.

## Hand-offs

- **72-24..72-26:** the project CLAUDE.md "Where we left off" now reads 72-23 of 26. Update it as each step lands.
- **Marketplace:** the entry still names the pre-rename slug. If GitHub ever drops the redirect (for example, a new repository created under the old name), `claude plugin marketplace update aocyber` will fail. The re-point sequence is recorded above.
- **User's call (unchanged from 72-21):** `aof-tools doctor --global --fix` moves the old runtime home into `~/.claude/aoforge/backups/`.
- Nothing was pushed.

## Self-Check: PASSED

- FOUND: commits 2c92f943 (Task 1 checkpoint) and e355e010 (Task 2 checkpoint), `git cat-file -t` = commit
- FOUND: `~/.claude/aoforge/backups/global-2026-10-09T14-03-31-298Z/CLAUDE.md` (12468 bytes, pre-confirm) and `global-2026-10-09T13-42-43-820Z/CLAUDE.md` (12465 bytes, pre-block-rewrite)
- FOUND: `~/.claude/CLAUDE.md` has one `AOFORGE:START v=4`; `rg -c -i devflow` = 1 (line 16, the preserved `devflowops`); `upgrade --global --raw` shows no outside-block diff
- FOUND: `claude plugin list` shows aoforge@aocyber 3.0.0 enabled; the marketplace source is unchanged (skip)
- MISSING: none
