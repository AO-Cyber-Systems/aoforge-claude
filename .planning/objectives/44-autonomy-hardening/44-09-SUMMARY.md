---
objective: 44-autonomy-hardening
trd: "09"
job: 44-09
subsystem: hooks registration + docs
tags: [hooks.json, SubagentStop, Stop, CLAUDE.md, HOOK_DOCS, CHANGELOG, USER-GUIDE, AUT-01, AUT-02, AUT-03, AUT-04, AUT-05, AUT-06, AUT-07]
requires: ["44-01", "44-02", "44-03", "44-04", "44-05", "44-06", "44-07", "44-08"]
provides:
  - "hooks.json: auto-continue.js under Stop (after verify-completion.js), gate-executor-stop.js under SubagentStop (after verify-commits.js)"
  - "CLAUDE.md hook inventory + Core Tool notes current for objective 44"
  - "gen-docs-data.cjs HOOK_DOCS rows for both new hooks; gate-commits / gate-edits / upgrade-project text updated"
  - "CHANGELOG [Unreleased] entries for every AUT requirement, including the config-get auto_advance behaviour change"
  - "docs/USER-GUIDE.md: no `export` escape for agents; hooks table covers the new hooks"
affects: [execute-objective, every DevFlow session once the plugin is re-mirrored]
tech-stack:
  added: []
  patterns: ["new hooks appended to the existing inner `hooks` array of their event"]
key-files:
  created: []
  modified:
    - plugins/devflow/hooks/hooks.json
    - CLAUDE.md
    - scripts/gen-docs-data.cjs
    - CHANGELOG.md
    - docs/USER-GUIDE.md
decisions:
  - "CLAUDE.md Core Tool: config-get defaults and the commit staged-removal path share one new `Config & commit` bullet; `git rm --cached` is written without backticks there because dispatch-completeness.test.cjs reads the first word of every Core Tool backtick span as a df-tools command"
  - "site/data/devflow.json is not regenerated in this TRD: it is rebuilt in chore(release) commits, so the generator was run once to prove it loads and the output was restored"
  - "USER-GUIDE.md also gained the two new hook rows and the gate-edits agent_type / upgrade-project runtime-state notes, so its hooks table matches hooks.json"
metrics:
  duration: 7min
  tasks: 3
  files: 5
  completed: 2026-09-29
---

# Objective 44 TRD 09: Register the new hooks, update the docs and changelog, and run the full suite — Summary

**`gate-executor-stop.js` (SubagentStop) and `auto-continue.js` (Stop) are now registered in hooks.json. CLAUDE.md, the gen-docs HOOK_DOCS table, CHANGELOG [Unreleased] and USER-GUIDE.md describe what objective 44 actually shipped, including the `config-get workflow.auto_advance` behaviour change and the corrected raw-commit escape. `npm test` fails only in the known pre-existing set.**

## Progress

- Started: 2026-09-29T14:53:48Z (worktree `/Users/justin/dev/.df-worktrees/devflow-claude/44-09`, branch `df/exec-44-09`, base `a01d779`)
- [x] Task 1: hooks.json registers auto-continue (Stop) + gate-executor-stop (SubagentStop); CLAUDE.md hook inventory + Core Tool notes — ee682d4
- [x] Task 2: HOOK_DOCS + CHANGELOG [Unreleased] (+ USER-GUIDE export correction) — d19a23a
- [x] Task 3: full `npm test`, hook smoke runs, `upgrade --check`, `validate health` (verification only, no file changes)
- [x] Final SUMMARY with Task Evidence and Self-Check — (this commit)

## What changed

**Task 1 (ee682d4): hooks.json, CLAUDE.md**
- hooks.json: `node ${CLAUDE_PLUGIN_ROOT}/hooks/auto-continue.js` appended to `Stop[0].hooks`, and `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-executor-stop.js` to `SubagentStop[0].hooks`. No new matcher groups.
- CLAUDE.md `### Hooks`, under Enforcement:
  - two new bullets, for `gate-executor-stop.js` and `auto-continue.js`, each with its event, behaviour and escape;
  - gate-commits: merge/rebase/cherry-pick completion allow, the inline prefix, and "an exported variable never reaches the hook". The escape is now scoped to "the env Claude Code was launched from";
  - gate-edits: the `agent_type` `devflow:` allow;
  - upgrade-project: runtime-state paths (migration 0008) are exempt from the dirty-before skip.
- CLAUDE.md `### Core Tool`: the Upgrade bullet names migration 0008. A new `Config & commit` bullet covers the config-get documented defaults and `commit --files` staged removals.

**Task 2 (d19a23a): gen-docs-data.cjs, CHANGELOG.md, docs/USER-GUIDE.md**
- HOOK_DOCS:
  - new `gate-executor-stop.js` and `auto-continue.js` rows (Enforcement, with their escapes);
  - gate-commits text: merge/rebase/cherry-pick allow, the inline prefix, and why `export` can't work;
  - gate-edits text: the DevFlow `agent_type` allow;
  - upgrade-project text: the runtime-state exemption.
- CHANGELOG [Unreleased], appended to the existing Added / Changed / Fixed. Each entry cites objective 44, its AUT id and, where one exists, the DF id.
  - Added (5): SubagentStop gate; auto-continue; migration 0008; INCOMPLETE + SendMessage resume; doc-refs legacy agent-path guard.
  - Changed (8): no turn cap; per-task `df-tools commit` + `## Progress` + no sleep-poll; yolo between waves; synthesizer text return; planner Edit; typed objective-researcher; config-get defaults (with the **behaviour change**: `workflow.auto_advance` now returns the loader default `true` when unset, matching `loadConfig`); checkpoint-aware job index + `<task>` count.
  - Fixed (6): edit gate vs DevFlow agents (DF-03); commit gate merge/rebase + no `export` (DF-02); legacy `~/.claude/agents` reads (DF-04); runtime state dirtying repos (DF-10); `df-tools commit` re-tracking a `git rm --cached` file; `config-get constructor`.
  - No version heading was added.
- docs/USER-GUIDE.md ("DevFlow blocked my command"):
  - the agent uses the inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …` prefix;
  - `export` works only in the user's terminal before `claude` starts, and is explained as never working from the agent's Bash tool;
  - merge/rebase/cherry-pick completions are allowed automatically.
- USER-GUIDE hooks table: new gate-executor-stop / auto-continue rows; gate-commits, gate-edits and upgrade-project rows updated.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: register hooks + CLAUDE.md | `node -e "JSON.parse(...hooks.json)"` → `ok` | 0 | PASS |
| 1 | `node --test hook-inventory.test.cjs dispatch-completeness.test.cjs doc-refs.repo.test.cjs` (worktree paths) → 26/26 | 0 | PASS (after one fix, see Deviations) |
| 2: HOOK_DOCS + CHANGELOG + USER-GUIDE | `node --check scripts/gen-docs-data.cjs` | 0 | PASS |
| 2 | `node scripts/gen-docs-data.cjs` → `hooks=18`; generated rows: auto-continue.js `Stop`, gate-executor-stop.js `SubagentStop`, both Enforcement with escapes; output restored afterwards | 0 | PASS |
| 2 | `rg -n "objective 44\|AUT-0" CHANGELOG.md` → 19 entries in [Unreleased]; `rg "^## \["` → `[Unreleased]` then `[2.11.0]` (no new heading) | 0 | PASS |
| 2 | `node --test 'scripts/**/*.test.cjs' doc-refs.repo.test.cjs hook-inventory.test.cjs` → 107/107 | 0 | PASS |
| 3: full suite | `npm --prefix <worktree> test` → 5374 tests, 5314 pass, 10 fail, 50 skipped | 1 | PASS (known failures only) |

## Task 3: suite, smoke runs, upgrade, health

**`npm test`: 5374 tests, 5314 pass, 10 fail, 0 cancelled, 50 skipped.** All 10 failures are in the known pre-existing set:
- `bin/devflow-watch.test.cjs` ×3: foreground daemon PID, "refuses when already running", "cleans up stale PID file". node-pty is missing in worktrees.
- `bin/handoff-e2e.test.cjs` ×6: write-pending, disallowed command, idempotency, multi-record, LK-1, LK-2. Same daemon cause.
- `lib/roadmap-reconcile.test.cjs` E2E1 ×1: 9 drift items, i.e. the rows `44-01` … `44-09` are still `[ ]` in ROADMAP.md while their SUMMARYs exist. The dispatch forbids this executor from editing ROADMAP.md, so this clears when the orchestrator ticks the rows.

Delta vs the 44-08 baseline (5276 / 5216 pass / 10 fail / 50 skipped): +98 tests, +98 passes, the failure count unchanged at 10, and the same three families. Nothing failed outside the known set.

**Hook smoke runs** (run from the worktree root, payloads in the session scratchpad):

| Hook | Payload | Output | Expected |
|---|---|---|---|
| gate-executor-stop.js | `agent_type:"devflow:executor"`, `stop_hook_active:true` | empty, exit 0 | empty |
| auto-continue.js | `DEVFLOW_SKIP_AUTOCONTINUE=1`, `"Writing the predicate."` | empty, exit 0 | empty |
| gate-edits.js | `agent_type:"devflow:executor"`, Write to `<worktree>/x.js` | empty, exit 0 (allowed) | empty |
| gate-commits.js | `git commit -m x` (env var unset) | `permissionDecision:"deny"`. The reason names `df-tools commit`, says merge/rebase/cherry-pick completions are allowed, and gives the inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …` prefix as the only in-command form. It contains no `export`. | deny without export |

**`df-tools upgrade --check`** lists `0008` under `skipped`, with the reason "no runtime state file is tracked or present without an ignore rule". That is correct for this repo: nothing is pending and nothing failed.

**`df-tools validate health`** reports status `broken` because of 1 error: `E020 mirror-stale: ~/.claude/devflow is 2.10.1 but the installed plugin is 2.11.0`.
- E020 is machine state (the home runtime mirror lags the installed plugin), and this TRD cannot cause it, because it touches no runtime-mirror code. It clears when a new session runs sync-runtime.
- The warnings are all pre-existing repo-planning conditions: W001 ×2 (PROJECT.md sections), W005 ×3 (UI-VISUAL-EVAL dirs), W007 ×42 (objectives 00-41 not in ROADMAP), and W040 (stamped 2.10.1, 0 pending).
- None of these relates to objective 44's files. No new errors.

## Deviations from Plan

**1. [Rule 1 - Bug] The Core Tool note tripped dispatch-completeness**
- **Found during:** Task 1 verify
- **Issue:** I first wrote the commit note as "(`git rm --cached`)". dispatch-completeness.test.cjs test 5 reads the first word of every backtick span in a Core Tool bullet as a df-tools command, so it failed with `git: not a COMMANDS key`.
- **Fix:** I rewrote it without backticks ("(git rm --cached)"). The rerun passed 26/26.
- **Commit:** ee682d4

**2. [Rule 3 - Path] Verify commands pointed at the main checkout**
- The TRD's `<verify>` blocks name `/Users/justin/dev/devflow-claude/...`, and the dispatch forbids touching that path. Every verify ran against the worktree path instead.

**3. [Recovery path] gen-docs-data.cjs writes on load**
- `require()`ing the script runs it and rewrites the tracked `site/data/devflow.json`. I used `node --check` as the recovery path. I also ran the script once to prove it loads and emits both hook rows, then restored `site/data/devflow.json` with `git checkout --`. Regenerating that file is a release-commit step (every past change to it is a `chore(release)` commit).

**4. [Extra scope, from the dispatch] USER-GUIDE.md**
- USER-GUIDE.md is not in the TRD's `files_modified`, but the dispatch's extra_scope required it. I corrected the `export` guidance there, and brought the hooks table in line with hooks.json: two new rows, plus the gate-commits, gate-edits and upgrade-project rows. The CHANGELOG Fixed entry for DF-02 mentions the correction.

**5. [Accuracy] Descriptions follow the SUMMARYs, not the TRDs**
- auto-continue is described as last-sentence based, with questions, `/devflow:` hand-offs, waits and reports ignored (44-05's narrowing).
- gate-executor-stop's never-block list includes checkpoint, escalation and preflight stops (`DELIBERATE_STOP_RE`).
- gate-commits requires every commit invocation to qualify, and fails open (44-03).
- config-get never overrides legacy or alias forms (44-07).
- The CHANGELOG notes that an executor in auto mode on an unset-`auto_advance` project now auto-approves human-verify checkpoints (look-lock excepted) and takes the first option at decision checkpoints.

## Observations (not fixed, out of scope)

- The USER-GUIDE hooks table has older drift that this TRD did not touch. It says hooks install into `settings.json`, and it lists `check-update.js`, which hooks.json doesn't register. It also omits `sync-runtime`, `classify-session`, `awareness-cache-populate`, `route-results`, `gate-interactive` and `guard-no-progress`.
- The header comment in `gate-executor-stop.js` still says "Registration … is done by TRD 44-09". That is now true history, and I left it alone.
- The follow-ups from earlier SUMMARYs are still open:
  - `files-modified` vs `files_modified` in objective-job-index (44-08);
  - `commit_docs:false` skipping code commits (44-01);
  - security-audit's report files (44-02);
  - REVERT_HEAD not allowed (44-03).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | — | N/A |
| test | `node --test hook-inventory.test.cjs doc-refs.repo.test.cjs` (+ dispatch-completeness) | 0 | PASS (26/26) |
| wave | `npm test` | 1 | PASS WITH KNOWN FAILURES (10: devflow-watch 3, handoff-e2e 6, roadmap-reconcile E2E1 1) |

## Objective 44 success criteria (from the merged tree)

- SC1: `rg maxTurns plugins/devflow/agents` is empty (44-01), and INCOMPLETE is in execute-objective.md (44-01).
- SC2: gate-executor-stop.test.js passes in `npm test` (44-04), and the hook is now registered under SubagentStop.
- SC3: doc-refs.repo.test.cjs LEGACY tests 11-14 pass (44-08).
- SC4: gate-edits / gate-commits tests pass (44-03). The smoke runs above confirm them.
- SC5: 0008 tests pass (44-06), and `upgrade --check` lists 0008.
- SC6: auto-continue tests pass (44-05), and the hook is now registered under Stop. The yolo rule is in execute-objective (44-01).
- SC7: the 44-02 / 44-07 changes are in place. `npm test` is green apart from the known set.

## Post-TRD Verification

- Auto-fix cycles used: 1 (dispatch-completeness Core Tool backtick)
- Must-haves verified: 5/5 (hooks.json registration and valid JSON; CLAUDE.md inventory + Core Tool, hook-inventory passing; HOOK_DOCS; CHANGELOG [Unreleased] with no version heading; `npm test` known failures only)
- Gate failures: none attributable to this TRD
- Not done, by rule: STATE.md and ROADMAP.md untouched. No version bump, tag or push. Nothing used port 8080.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/hooks.json (`auto-continue.js` in Stop, `gate-executor-stop.js` in SubagentStop; parses)
- FOUND: CLAUDE.md, scripts/gen-docs-data.cjs, CHANGELOG.md, docs/USER-GUIDE.md (modified in ee682d4 / d19a23a)
- FOUND: commit ee682d4 (`feat(44-09): register auto-continue and gate-executor-stop hooks; document objective 44 in CLAUDE.md`)
- FOUND: commit d19a23a (`docs(44-09): hook docs, CHANGELOG [Unreleased], USER-GUIDE raw-commit correction`)
- `site/data/devflow.json` was restored, and the worktree held only this SUMMARY's change before the final commit.
