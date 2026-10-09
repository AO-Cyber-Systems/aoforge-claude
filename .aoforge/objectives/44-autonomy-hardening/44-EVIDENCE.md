# DevFlow Session Review & Error Catalogue

**Date:** 2026-09-29 · **Data:** every retained Claude Code transcript on this machine
(1,860 files = 162 main sessions + 1,698 subagent transcripts, 64 projects,
2026-07-01 → 2026-09-29; earlier transcripts were removed by retention).
**Installed plugin:** devflow 2.10.1 (repo is at 2.11.0, tagged 2026-09-28, not installed).

Method: a custom extractor (`scratchpad/extract.py`) walked every record. It split each subagent
transcript into invocation segments, so a `SendMessage` resume counts as a new run. It paired
every `is_error` tool result with the call that produced it. On top of that sit `df-tools
session-audit` and hand classification. All counts below are reproducible from `scratchpad/data/*.jsonl`.

---

## 1. Headline findings

| # | Finding | Evidence |
|---|---------|----------|
| 1 | **The "50-turn limit" is DevFlow's own setting, not Claude Code's.** `agents/executor.md` sets `maxTurns: 50` and `agents/verifier.md` sets `maxTurns: 30`. No other agent sets a cap. | `general-purpose` agents ran up to **182 turns in a single run** (294 runs > 50). Planner ran up to 106, objective-researcher up to 150. Executor's longest single run: 52. Verifier's: exactly 30. |
| 2 | **The cap truncates 38% of executor runs.** | 506 of 1,337 executor runs ended at the cap mid-tool-call. **429 of 575 executor transcripts (75%) needed ≥1 resume**, for 762 resumes in total. The verifier hit its cap in 37% of runs (50/136). |
| 3 | **The orchestrator can't tell "truncated" from "failed".** `execute-objective.md` step 7 treats a capped executor as a failure. It respawns *fresh* (discarding context, redoing work) once, then **skips every dependent TRD**. | The prior aodex memory documents 2–3 manual `SendMessage` resumes per large TRD, and agents stopping with zero commits after 76 tool calls. |
| 4 | **Autonomy leaks to the human.** 13.2% of all human prompts (186/1,410) are bare nudges: `continue` ×92, `yes` ×35, `do it` ×26. | 81 followed the main loop *announcing* an action and then ending its turn ("Writing the predicate."). 58 followed an unneeded permission ask ("Ready for wave 4 on your word"). 22 followed API errors. |
| 5 | **The fleet is on 2.10.1, so recent fixes aren't deployed.** The auto-upgrade hook (`upgrade-project.js`) ships only in 2.11.0. | Only `devflow-claude` has a `devflow.version` stamp; aodex, politihub, eden-biz and aocore have none. There were 38 `Unknown command:` errors from stale runtimes (`exec-context`, `override`, `--cwd`). |
| 6 | **DevFlow's own state files dirty the tree.** `guard-no-progress.js` writes `.planning/.progress-guard.json` on every tool call. It and `.awareness-cache.json` are **git-tracked** in aodex, eden-biz, aocore and opsCluster. | They appear as modified in **791 transcripts**. That is noise in every `git status` and trips "dirty tree" refusals and merges. |
| 7 | 64.7% of sessions hit ≥1 blocking event (3,725 events). 81.7% of those events come from subagents. DevFlow-owned gate blocks: 312 all-time, 150 since 09-15. | `df-tools session-audit` |

---

## 2. Error catalogue

3,725 errored tool results. Categories are ordered by volume within each owner. **Owner** says who
can fix the category: **DF** = DevFlow code/prompts, **CC** = Claude Code harness, **ENV** = local
environment, **WORK** = legitimate work signal (a test failing is the loop working).

### 2.1 DevFlow-owned

| ID | Category | Count | Root cause | Fix |
|----|----------|------:|------------|-----|
| DF-01 | **Executor/verifier turn cap** (runs truncated) | 506 exec + 50 verif runs | `maxTurns: 50/30` in agent frontmatter (commit `d7b8d11`, "harden frontmatter"). A turn carries parallel calls, so real TRDs (3 tasks + codegen + build/test) need 55–115 calls. | Remove or raise to ≥150. Runaway protection already exists in `guard-no-progress.js`. See §3. |
| DF-02 | **Commit gate blocks** | 170 | Five sub-causes: (a) main-loop orchestrators committing directly (40 since 09-14); (b) **merge/rebase completions** `git commit --no-edit` after merging agent branches, 32 cases, which df-tools commit can't do; (c) **`export DEVFLOW_ALLOW_RAW_COMMIT=1; git commit`**, 23 cases. The hook's own error text suggests this escape, but it *cannot work*: the hook reads its own process env, not the command's. (d) amend ×10; (e) executors ignoring the df-tools route. | Allow when `MERGE_HEAD`/`REBASE_HEAD` exists. Stop suggesting the env escape to agents, or honour an inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit` prefix parsed from the command. Make `df-tools commit --amend/--no-edit` cover the merge case. |
| DF-03 | **Edit gate denies DevFlow's own agents** | 114 (76 by executors, 70 of them in worktrees) | This persists after the 27-01 marker fix. The gate checks only for a `.skill-active` marker and never consults the hook payload's agent identity. Executors spawned by an ad-hoc orchestrator (no skill started), or after the 8h TTL, get denied. | Allow when the PreToolUse payload's agent type starts with `devflow:`. Also start the marker in the orchestrator on spawn. |
| DF-04 | **Prompts tell agents to read `~/.claude/agents/<name>.md`** | 109 failed reads (planner 43, researcher 34, executor 14, verifier 11…) | Legacy GSD spawn pattern ("First, read ~/.claude/agents/planner.md"). Agents now live in the plugin, and global-upgrade moved the legacy copies to backup. Each spawn wastes a turn, which costs capped agents the most. | Delete these instructions. Typed subagents already have their definition as system prompt. Files: `workflows/plan-objective.md`(3), `new-project.md`(4), `security-audit.md`(4), `quick.md`, `execute-objective.md`, `skills/research-objective/SKILL.md`(2). Add the pattern to `doc-refs` CI. |
| DF-05 | **Stale runtime / unknown command** | 38 | Plugin 2.10.1 installed, while skills or memories reference newer commands (`exec-context`, `override`, `--cwd`). The `~/.claude/devflow` mirror also lags the cache. | Install 2.11.0. Have `sync-runtime` warn when the marketplace has a newer tag. |
| DF-06 | **Brittle df-tools output contract** | 29 parse failures + 8 `@file:` | Output over 50KB becomes `@file:/tmp/df-….json`, which agents feed to `json.load` and jq. Unescaped control chars break jq. Callers guess wrong field names (`dimensions`, `.jobs`, iterating null). Pipelines exit non-zero even when the command succeeded (e.g. `commit` → `committed: true` but exit 1 from a later glob). | Add `--out <file>` and make `@file:` opt-in. Always emit strictly escaped JSON. Publish each command's schema via `df-tools <cmd> --schema`. Keep exit code tied to the df-tools result only. |
| DF-07 | **`config-get` errors on missing keys** | 7 | `Key not found: workflow.auto_advance / workflow.parallelization` exits 1. Workflows then fall back via `|| echo`, but the agent sees an error. | Return the schema default with exit 0, or add `--default`. |
| DF-08 | **Research-synthesizer told to write `SUMMARY.md`** | 4 | The harness blocks subagent "report files" ("Subagents should return findings as text"). The agent prompt contradicts the harness. | Return text; have the orchestrator write the file. |
| DF-09 | **Planner lacks the `Edit` tool** | 5 | `tools:` omits Edit, but revision mode tries targeted edits. It falls back to full-file Write, the expensive path the context policy warns about. | Add `Edit` to the planner's tools. |
| DF-10 | **Runtime state files tracked in git** | 791 dirty-tree transcripts | No migration gitignores `.progress-guard.json` / `.awareness-cache.json`. `adopt` excludes only `.skill-active`. | Migration 0008: gitignore and `git rm --cached` both files. Consider moving volatile state to `~/.claude/devflow/state/<repo-hash>/`. |
| DF-11 | **Missing PROJECT.md / config.json** | 3 | aodex and eden-biz predate PROJECT.md, so `intent resolve` hard-fails. | Fall back to defaults with a warning. Migration 0006 needs the fleet on 2.11. |
| DF-12 | **`micro commit` without `micro start`** | 3 | State dependency between two calls. | Accept `--description` on `micro commit`. |
| DF-13 | **exec-context guards firing** (BASE NOT VISIBLE / SHARED INDEX / WRONG REPOSITORY) | 16 | **Working as designed.** Each one caught a real mis-spawn. The residue points at orchestrator discipline: parallel TRDs spawned without `exec-context worktree`. | Keep. Make the orchestrator call `exec-context worktree` itself instead of trusting the prompt. |
| DF-14 | **Mode `yolo` ≠ `autonomous`** | (behavioural) | 30+ projects use `mode: "yolo"`, but the no-prompt failure protocol and decision queue key on `mode == "autonomous"`. So "yolo" projects still stop to ask between waves. That is where the 58 permission-ask nudges came from. | Treat yolo as autonomous for between-wave continuation, or run a migration that maps yolo to autonomous. |

### 2.2 Harness-owned (Claude Code)

| ID | Category | Count | Root cause | Mitigation available to DevFlow |
|----|----------|------:|------------|-------------------------------|
| CC-01 | **Worktree-isolation guard** | 741 (all executors) | The harness refuses compound or `cd`/`git -C`/env-prefixed commands inside `isolation: worktree` agents. Reasons: too complex 321, names git 157, changes dir 56, redirects git 48. | **Largely fixed.** Removing `isolation: worktree` (#86) took it from 142/week to 12/week. The remaining 12 come from older installs. |
| CC-02 | **`sleep N` blocked** | 127 | The harness forbids `sleep` followed by a poll command and wants Monitor or `run_in_background`. | Add one line to executor.md and the workflows: "never `sleep`; use run_in_background + until-loop". |
| CC-03 | **Context exhaustion** ("Prompt is too long" ×30, autocompact thrashing ×21) | 51 transcripts | Mostly `general-purpose` (38) and `Explore` (12), concentrated in quanta (22). None are DevFlow agents. | Low priority. |
| CC-04 | **Subagent tool unavailable** (SendMessage/TaskCreate/Edit disabled) | 17 | Agents try to message the parent or use tools absent from their list. | Remove SendMessage instructions from agent prompts. See DF-09. |
| CC-05 | **API errors** (529/503/500, sleep mid-response, unparseable tool call) | ~75 | Transient. 22 of them required a human "continue". | A Stop hook can auto-continue after a transient API error (§3.3). |
| CC-06 | **Concurrent subagent limit (20)** | 1 | — | Cap `max_concurrent_agents` (already 3 in newer configs). |

### 2.3 Environment

| ID | Category | Count | Cause / fix |
|----|----------|------:|------------|
| ENV-01 | **1Password SSH-signing failure** ("failed to fill whole buffer") | 42 | Commit signing needs an unlocked 1Password, and a locked vault halts the whole run. The agent then asks "unlock 1Password and I'll continue". DevFlow could classify `signing_unavailable` in `df-tools commit`, PushNotify the user, and wait for the unlock (poll `ssh-add -l`) instead of aborting. Longer 1Password auto-lock is a user choice. |
| ENV-02 | **zsh `no matches found`** | 96 | zsh errors on unmatched globs (`05-01-*.png`). Tell agents to use `ls … 2>/dev/null`/`find`, or `setopt nullglob`. |
| ENV-03 | **cwd drift / wrong absolute path** | 172 (27 guessed source paths, 31 into agent worktrees) | Relative paths after `cd`, and absolute paths into another agent's worktree. |
| ENV-04 | **kube-context guard** | 34 | Working as intended (opsCluster prod protection). |
| ENV-05 | **TTY-required commands** (ssh-keygen, passwd, doctl auth, op signin) | 23 | Working as intended: `gate-interactive` routes them to handoff. |
| ENV-06 | **Command not found / timeouts** | 54 | Tooling not on PATH in the agent shell (mise shims). |

### 2.4 Work signal (not defects)

`go test`/`go build` failures (126), flutter analyze/test (21), node test (77), and `grep`/`ls`/`cat` returning 1 on
a negative check (≈520 of the 1,728 exit-1s). These are the TDD loop working. **Recommendation:** extend
`session-audit` so these stop showing up as "blocks". 54% of events currently land in
`other-tool-error`, which hides the actionable categories above.

---

## 3. Making DevFlow more autonomous

### 3.1 Turn limits (highest value)
1. **Remove `maxTurns` from executor and verifier**, or raise it to ~150. The cap was added as a runaway
   guard in 10-07. `guard-no-progress.js` (28-04) now does that job properly by detecting *repetition*,
   not length. Uncapped agents in this data set completed fine at 100–180 turns.
2. If a cap stays, make truncation **first-class**:
   - Executor contract: commit after every task, and write a `## Progress` checkpoint to SUMMARY.md
     (tasks done, next step) *before* the budget runs out. Today this lives only in hand-written spawn prompts.
   - Orchestrator (`execute-objective.md` step 6/7): add a third outcome, **INCOMPLETE**. Detect it when
     the SUMMARY is missing or has no `Self-Check`, commits are fewer than tasks, or the final message
     has no completion marker. Handle it with `SendMessage` resume (context intact) up to N times, and
     only then run the fresh-respawn failure protocol. Never mark dependents skipped because of a truncation.
   - A `SubagentStop` hook (`verify-completion`, warn-only today) can *block* the stop of a
     `devflow:executor` with no SUMMARY and tell it to finish or checkpoint, bounded by a retry counter.
     *(Harness behaviour to confirm — see §5.)*
3. Split TRDs to fit. The planner should cap a TRD at ~3 tasks and move codegen/build loops into their
   own task. `trd-pre-check` can warn when estimated steps exceed the budget.

### 3.2 Gates that block the system's own agents
- Edit gate: allow `devflow:*` agent types unconditionally (DF-03).
- Commit gate: allow merge/rebase completion and amend-in-progress, and fix the misleading escape-hatch text (DF-02).
- Treat `yolo` as autonomous between waves (DF-14).

### 3.3 Premature stops in the main loop (81 cases)
Add a **Stop hook in DevFlow projects** that blocks ending the turn when all of these hold:
- a skill marker is live, or an objective is mid-execution per `state.json`;
- the last assistant text announces a next action ("Now…", "Running…", "Writing…") with no question and no pending background agents;
- a per-session retry counter is under its bound (the docs check did not confirm a `stop_hook_active` guard).

The reason it returns is "continue with the step you announced". The same hook can re-try once after a transient API error.

### 3.4 Unattended-safety prerequisites
- Ship 2.11.0 to the fleet so the auto-upgrade and migrations actually run (DF-05, DF-11).
- Migration 0008 for runtime state files (DF-10).
- 1Password signing: wait for the unlock and notify the user, rather than abort (ENV-01).

---

## 4. Prioritised backlog

| P | Item | Effort | Removes |
|---|------|--------|---------|
| P0 | Drop/raise `maxTurns`; add INCOMPLETE → SendMessage-resume path to execute-objective | S + M | ~506 truncations, 762 manual/fresh resumes, wrongly-skipped dependents |
| P0 | Install 2.11.0 fleet-wide | XS | DF-05, unblocks DF-10/11 migrations |
| P1 | Delete `~/.claude/agents/*.md` read instructions (9 files) + CI check | XS | 109 wasted turns |
| P1 | Edit gate: allow `devflow:*` agents; commit gate: merge/amend + fix escape text | S | ~190 gate blocks |
| P1 | Migration 0008: untrack runtime state files | S | 791 dirty-tree sessions |
| P1 | Stop-hook auto-continue + yolo≡autonomous between waves | M | most of the 186 human nudges |
| P2 | df-tools output contract (`--out`, schema, strict JSON, `config-get` defaults) | M | DF-06/07 |
| P2 | Agent prompt fixes: synthesizer returns text, planner gets Edit, no SendMessage, no `sleep` | XS | DF-08/09, CC-02/04 |
| P2 | session-audit: classify work-signal exits, and add turn-cap + nudge metrics | S | measurement blind spot |
| P3 | 1Password signing wait-and-notify in `df-tools commit` | S | ENV-01 |

---

## 5. Harness facts relied on (checked against code.claude.com docs)
- **`maxTurns`:** no documented default or cap on subagent turns. The only documented limits are spawn depth
  (3) and concurrency (20). When the cap is hit, the output is marked *partial* and resumable via
  `SendMessage`; it is **not flagged as an error**. That is why the orchestrator reads truncation as success-or-failure.
- **PreToolUse payload:** it carries `agent_id` (present only inside a subagent) and `agent_type` (e.g.
  `devflow:executor`). The DF-03 fix is therefore a one-line check.
- **SubagentStop/Stop `decision: block`:** the agent continues, with the reason injected. It is *not documented*
  whether SubagentStop fires on a `maxTurns` stop, so don't rely on it to extend capped runs.
  The docs check also did not confirm a `stop_hook_active` loop guard. Bound any auto-continue hook
  with its own counter file.
- **Env vars in the command** (`export X=1; git commit`) cannot affect a PreToolUse decision. That confirms DF-02(c).
