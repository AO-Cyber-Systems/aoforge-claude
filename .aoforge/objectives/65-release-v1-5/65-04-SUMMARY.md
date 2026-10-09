---
objective: 65-release-v1-5
trd: "04"
subsystem: release
tags: [release, v2.14.0, installed-runtime, mirror, verification]

requires:
  - objective: 65-03
    provides: "main = 8295a169 (Merge #126, release 2.14.0), tag v2.14.0, GitHub release"

provides:
  - "installed plugin devflow@aocyber 2.14.0 (installPath …/cache/aocyber/devflow/2.14.0, gitCommitSha 8295a169) and runtime mirror ~/.claude/devflow 2.14.0 with an equal content digest"
  - "verification record: six v1.5 libs in the mirror, three v1.5 hooks in the installed plugin and registered on the right events, doctor runtime-mirror ok, validate health free of E020/W021/I022/W040"

affects: [66, 74]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 1 found the update and restart already done at pre-check (installed record 2.14.0, .plugin-version 2.14.0), so it continued to Task 2 without asking"
  - "Task 2 step 6 was skipped: W040 was already cleared by the SessionStart stamp 2db21cbf, and `upgrade --check` reports up to date with no pending migrations"
  - "The remaining doctor warnings (plugin-cache, legacy-runtime-state, guard-state, validate-health W006) are classified as unrelated to mirror lag and left alone (report mode only, no --fix, no rm -rf on stale cache dirs)"

requirements-completed: [REL-02]

duration: 8min
completed: 2026-10-08
tokens_input: 3631376
tokens_output: 27289
tokens_cache_read: 3522540
tokens_cache_write: 108750
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 65 TRD 04: Installed runtime verification Summary

**Installed devflow@aocyber 2.14.0 (8295a169), re-mirrored by a session restart: all six v1.5 libs and the three v1.5 hooks are present and registered, and doctor and validate health both report 2.14.0 everywhere with no mirror lag (no E020, W021, I022 or W040).**

## Progress
- [x] Task 1: Human action: update the installed plugin to 2.14.0 and restart Claude Code — 11a360a9
- [x] Task 2: Verify the installed runtime carries the v1.5 libs and hooks, and doctor and health report no mirror lag — 18a775a4

## Task 1 pre-check (already done, found at pre-check)

The user ran `/plugin` (printed "✔ Updated devflow."), then `/reload-plugins`, then `/restart` in this session. Their replies were "updated plugin" and "restarted". SessionStart reported "DevFlow upgraded this project from v2.13.1 to v2.14.0 (stamp only)", committed as 2db21cbf (`.planning/config.json`).

| Check | Command | Output | Status |
|---|---|---|---|
| Installed record | `node -e '…installed_plugins.json…["devflow@aocyber"]'` | `[{"scope":"user","installPath":"/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0","version":"2.14.0","installedAt":"2026-04-28T16:16:41.715Z","lastUpdated":"2026-10-08T11:37:09.838Z","gitCommitSha":"8295a169fe108c3af2d76d2480d1c0f95c1f6dcf"}]` | PASS |
| Mirror version | `cat /Users/justin/.claude/devflow/.plugin-version` | `2.14.0` | PASS |
| Mirror digest | `cat /Users/justin/.claude/devflow/.plugin-digest` | `sha256:2589d10773f588c607457720b9b444f89120769b6d5d8c8b858289b321fce65f` | recorded |
| Mirror marker mtimes | `stat -f "%Sm %N" … .plugin-version .plugin-digest` | both `2026-10-08T07:37:55-0400` (11:37:55Z), 46 s after the record's `lastUpdated` 11:37:09Z | PASS |
| Cache dirs | `ls /Users/justin/.claude/plugins/cache/aocyber/devflow/` | `2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 2.7.1` | PASS (2.14.0 present) |
| Project stamp commit | `git show --stat 2db21cbf` | `chore(devflow): upgrade project to v2.14.0`, `.planning/config.json` 3+/3- | PASS |

The installed gitCommitSha 8295a169 is the 65-03 merge commit on main.

## Task 2 verification (installed runtime, mirror df-tools)

### 1. Mirror libraries (criterion 3)

`ls -l /Users/justin/.claude/devflow/bin/lib/{todo-sync,todo-session,checks-pin,estimate-backtest,skill-requires,builtin-audit}.cjs` (listed as six explicit paths), exit 0:

```
-rw-r--r--@ 1 justin  staff  25143 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/builtin-audit.cjs
-rw-r--r--@ 1 justin  staff   9894 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/checks-pin.cjs
-rw-r--r--@ 1 justin  staff  25343 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/estimate-backtest.cjs
-rw-r--r--@ 1 justin  staff  10683 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/skill-requires.cjs
-rw-r--r--@ 1 justin  staff  12492 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/todo-session.cjs
-rw-r--r--@ 1 justin  staff  18206 Oct  8 07:37 /Users/justin/.claude/devflow/bin/lib/todo-sync.cjs
```

PASS: all six exist, written by the 07:37 SessionStart mirror.

### 2. Installed hooks (criterion 3)

`ls -l` on the three hook files under `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/`, exit 0:

```
-rw-r--r--@ 1 justin  staff  8101 Oct  8 07:37 /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/gate-bash-writes.js
-rw-r--r--@ 1 justin  staff  5862 Oct  8 07:37 /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/gate-skill-requires.js
-rw-r--r--@ 1 justin  staff  6604 Oct  8 07:37 /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/todo-sync.js
```

The registration one-liner from the TRD against `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/hooks.json`, exit 0:

```
{"bash":true,"skillPre":true,"skillExp":true,"todoStop":true}
```

An extra one-liner that prints event(matcher) for each v1.5 hook, exit 0:

```
Stop(*) -> todo-sync.js
UserPromptExpansion(*) -> gate-skill-requires.js
PreToolUse(Bash) -> gate-bash-writes.js
PreToolUse(Skill) -> gate-skill-requires.js
```

PASS: gate-bash-writes on PreToolUse(Bash), gate-skill-requires on UserPromptExpansion and PreToolUse(Skill), todo-sync on Stop.

### 3. Verbs live in the mirror

- `node /Users/justin/.claude/devflow/bin/df-tools.cjs todo sync --help`, exit 0. First line: `Usage: df-tools todo add --from <path|-> [--stem <stem>] | todo complete <stem|filename> | todo sync (--transcript <path>... | --session <id>) [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait] [--raw]`. No `Unknown command`. PASS.
- `node /Users/justin/.claude/devflow/bin/df-tools.cjs estimate backtest --help`, exit 0. First line: `Usage: df-tools estimate <task (…) | trd <trd-id|path> | objective <N> […] | milestone […] | start <N> | wave <N> <wave> (--start|--done) | finish <N> | backtest <N[,N...]>> [--calibration <file>] [--raw]`. The body describes `backtest <N[,N...]>` and the EST-08 verdict. No `Unknown command`. PASS.

### 4. doctor (criterion 4)

`node /Users/justin/.claude/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/devflow-claude doctor --json` (report mode), exit 0. `engine_version` 2.14.0, `mode` report, `status` degraded, summary ok 12 / warn 4 / error 0 / fixable 2, `fixes: []`.

| Check id | Scope | Severity | Finding |
|---|---|---|---|
| runtime-mirror | global | **ok** | runtime mirror 2.14.0 matches installed plugin 2.14.0 (content digest equal). installed_digest = mirror_digest = marker_digest = `sha256:2589d107…fce65f` |
| plugin-cache | global | warn | 5 stale plugin cache dir(s) besides installed 2.14.0: 2.7.1, 2.10.1, 2.11.0, 2.12.0, 2.13.1 |
| hooks-registry | global | **ok** | 20 registered hook file(s) resolve; 2 DRAFT hook(s) intentionally unregistered (root …/devflow/2.14.0; missing [], unregistered []) |
| model-profiles | global | **ok** | models: opus=claude-opus-5-5, sonnet=claude-sonnet-5-5, haiku=claude-haiku-4-5 (source mirror, installed models equal, stale []) |
| skill-requires | global | **ok** | every required tool is on PATH: gh (gh-sync), found /opt/homebrew/bin/gh |
| legacy-runtime-state | project | warn (fixable) | leftover files nothing reads any more: .planning/.awareness-cache.json, .planning/.progress-guard.json |
| pending-migrations | project | ok | project is up to date (v2.14.0) |
| validate-health | project | warn | 0 errors, 10 warnings: W006 objectives 66–75 in ROADMAP.md but no directory on disk |
| skill-markers | project | ok | no stale skill or edit-override marker |
| store-cache-tracked | project | ok | local mode: .planning/ stays tracked |
| gh-store-sync | project | ok | not a store-mode project |
| checks-workflow-pin | project | **ok** | no .github/workflows/devflow.yml (state absent, installed 2.14.0, version_source installed-plugin) |
| guard-state | global | warn (fixable) | 1 stale guard session file in ~/.claude/devflow/state/progress-guard (older than 24h) |
| awareness-state | global | ok | 4 awareness cache entries, 0.6 MiB, none stale |
| backups | global | ok | 294.8 MiB of backups across 10 repos, all within retention |
| decision-resolution | project | ok | 2 resolved decision(s) checked: every resolution is intact |

PASS: engine 2.14.0. runtime-mirror ok with installed == mirror == 2.14.0 and equal digests. hooks-registry ok with 20. model-profiles ok. `skill-requires` and `checks-workflow-pin` present.

### 5. validate health (criterion 4)

`node /Users/justin/.claude/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/devflow-claude validate health`, exit 0:

- `engine_version` 2.14.0. `engine`: `{"running":"2.14.0","mirror":"2.14.0","installed":"2.14.0","main":"2.14.0"}`
- `errors`: [] (no E020)
- `warnings`: W006 x10 only (objectives 66, 67, 68, 69, 70, 71, 72, 73, 74 and 75 are in ROADMAP.md with no directory on disk)
- `info`: [] (no I022)
- No W021, no W040, `repairable_count` 0

PASS: no E020, W021 or I022, so there is no mirror lag.

### 6. W040 (project stamp)

W040 is absent. The SessionStart upgrade-project hook stamped the project at 2.14.0 (2db21cbf). The `upgrade --apply` step was not needed. Read-only confirmation: `node /Users/justin/.claude/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/devflow-claude upgrade --check`, exit 0: `"from":"2.14.0","to":"2.14.0","up_to_date":true,"applied":[],"pending":[],"pending_confirm":[],"failed":[],"changed_files":[],"backup":null`. Migrations 0001 to 0011 were all skipped as not applicable.

## Before / after

Baseline: the 65-01 SUMMARY (repo-copy health and doctor at fad0442b, 2026-10-07) plus this TRD's context baseline (mirror doctor and health at planning time). After: this run, 2026-10-08, installed runtime only.

| Item | Baseline | After update + restart | Status |
|---|---|---|---|
| installed_plugins.json devflow@aocyber | 2.13.1, installPath …/devflow/2.13.1, gitCommitSha d79fed0c | 2.14.0, installPath …/devflow/2.14.0, gitCommitSha 8295a169 | PASS |
| `~/.claude/devflow/.plugin-version` | 2.13.2 | 2.14.0 (digest sha256:2589d107…fce65f) | PASS |
| v1.5 libs in mirror | none of the six | all six present | PASS |
| v1.5 hooks in installed hooks.json | 16 scripts, without gate-bash-writes, gate-skill-requires or todo-sync | 20 registered, all three present on the right events | PASS |
| doctor runtime-mirror | warn, mirror 2.13.2 ahead of installed 2.13.1 | ok, 2.14.0 == 2.14.0, digests equal | PASS |
| doctor hooks-registry | ok, 17 registered (installed 2.13.1) | ok, 20 registered, 2 DRAFT unregistered | PASS |
| doctor model-profiles | warn, opus=claude-opus-5 / sonnet=claude-sonnet-5 superseded | ok, opus=claude-opus-5-5 / sonnet=claude-sonnet-5-5 / haiku=claude-haiku-4-5 | PASS |
| doctor skill-requires | absent from mirror doctor (TRD context). Repo copy: ok, no skill declares requires: | ok, gh (gh-sync) on PATH | PASS |
| doctor checks-workflow-pin | absent from mirror doctor (TRD context). Repo copy: ok | ok, no devflow.yml, installed 2.14.0 | PASS |
| doctor pending-migrations | warn (fixable), stamped v2.13.1 | ok, up to date (v2.14.0) | PASS |
| doctor validate-health | warn, W006 x10 + W021 | warn, W006 x10 only | PASS (W021 cleared) |
| doctor plugin-cache | warn, 4 stale (2.7.1, 2.10.1, 2.11.0, 2.12.0) | warn, 5 stale (adds 2.13.1) | unrelated |
| doctor legacy-runtime-state | warn (fixable), same two files | warn (fixable), same two files | unrelated |
| doctor guard-state | ok, 3 files, none stale | warn (fixable), 1 stale file older than 24h | unrelated |
| health engine | running 2.14.0, mirror 2.13.2, installed 2.13.1, main 2.13.2 | running, mirror, installed and main all 2.14.0 | PASS |
| health W021 | `installed 2.13.1, origin/main 2.13.2` | absent | PASS |
| health I022 | `mirror-ahead: ~/.claude/devflow is 2.13.2, installed plugin is 2.13.1` | absent | PASS |
| health E020 | absent | absent | PASS |
| health W040 | `stamped v2.13.1, DevFlow v2.14.0` | absent (stamp 2db21cbf) | PASS |
| health W006 | x10 (objectives 66–75) | x10 (objectives 66–75) | unrelated |
| health I001 | x3 (65-02, 65-03, 65-04 have no SUMMARY) | none | n/a |

## Remaining warnings, classified

None of these is mirror lag:
- **W006 x10** (health, and doctor validate-health): objectives 66–75 are on the v1.6 roadmap but not planned yet, so they have no directories. Expected.
- **plugin-cache** (warn, not fixable): five old cache dirs (2.7.1, 2.10.1, 2.11.0, 2.12.0, 2.13.1, about 39.5 MB in total). 2.13.1 joined the list because 2.14.0 replaced it. Recorded only. Per the hard rule, no `rm -rf`. Doctor's `fix_command` removes them after you quit the sessions that use them.
- **legacy-runtime-state** (warn, fixable): `.planning/.awareness-cache.json` and `.planning/.progress-guard.json` are untracked leftovers, also in the 65-01 baseline. Not touched (report mode only).
- **guard-state** (warn, fixable): one no-progress-guard session file is older than 24h. This is routine aging since the baseline. Not touched.

## Main-branch CI for the 65-03 merge commit 8295a169

- `gh run view 37770895806 --repo AO-Cyber-Systems/devflow-claude --json status,conclusion,name,headSha,headBranch,event,url` →
  `{"conclusion":"success","event":"push","headBranch":"main","headSha":"8295a169fe108c3af2d76d2480d1c0f95c1f6dcf","name":"Unit suite","status":"completed","url":"https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37770895806"}`. **Unit suite on main: completed, success.**
- `gh run view 37770895912 … --json …` →
  `{"conclusion":"failure","event":"push","headBranch":"main","headSha":"8295a169fe108c3af2d76d2480d1c0f95c1f6dcf","name":"Docs site","status":"completed","url":"https://github.com/AO-Cyber-Systems/devflow-claude/actions/runs/37770895912"}`. In `gh run view 37770895912 --log-failed`, step "Deploy to Cloudflare Pages" (`--project-name=devflow-docs --branch=main`) printed: `A request to the Cloudflare API (/accounts/***/pages/projects/devflow-docs) failed.` and `Project not found. The specified project name does not match any of your existing projects. [code: 8000007]`. **Docs site on main: failed.** The devflow-docs Cloudflare Pages project does not exist for the configured account. That is OPS-03, owned by Objective 74. The release content did not cause it, and it does not affect REL-02.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: plugin update + restart (pre-check) | installed-record one-liner | 0 (version 2.14.0, installPath …/devflow/2.14.0) | PASS |
| 1: plugin update + restart (pre-check) | `cat /Users/justin/.claude/devflow/.plugin-version` | 0 (`2.14.0`) | PASS |
| 2: v1.5 libs | `ls -l` six libs in the mirror | 0 | PASS |
| 2: v1.5 hook files | `ls -l` three hooks in the installed plugin | 0 | PASS |
| 2: v1.5 hook registration | hooks.json registration one-liner | 0 (all four flags true) | PASS |
| 2: verbs | `df-tools todo sync --help` (mirror) | 0 | PASS |
| 2: verbs | `df-tools estimate backtest --help` (mirror) | 0 | PASS |
| 2: doctor | `df-tools doctor --json` (mirror) | 0 (runtime-mirror ok, hooks-registry ok 20, model-profiles ok, skill-requires + checks-workflow-pin present, engine 2.14.0) | PASS |
| 2: health | `df-tools validate health` (mirror) | 0 (engine 2.14.0, no E020/W021/I022/W040) | PASS |
| 2: stamp | `df-tools upgrade --check` (mirror) | 0 (up_to_date true) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task gate, before the Task 2 commit) | `npm test` | 1 (tests 11075, pass 11040, fail 1, skipped 34) | FAIL, transient. The one failure is `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift`, with a single drift entry: ROADMAP line 146, `- [ ] 65-04-installed-runtime-verification-TRD.md` → `[x]`. Cause: the Task 1 checkpoint SUMMARY (11a360a9) exists, while the ROADMAP line is ticked only at completion. See Deferred Issues. |
| test (after the roadmap update) | `npm test` | 0 (tests 11075, pass 11041, fail 0, skipped 34) | PASS. `roadmap update-job-progress 65` ticked the 65-04 line (`trd_checkboxes_ticked: 1`), and E2E1 passes again |

## Deviations from Plan

None. The TRD executed as written. Task 1 was found done at pre-check, and Task 2 step 6 was not needed because W040 was already clear.

## Deferred Issues

- **The roadmap reconciler counts a checkpoint SUMMARY as complete.** `_checkSummaryFailed` in `plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs:128-145` returns false when there is no `## Self-Check` section ("assume not failed"). So a local-mode checkpoint SUMMARY that is committed mid-TRD (the executor's per-task `summary checkpoint` + commit) is reconciled as a ticked TRD. The repo self-test `E2E1` (`roadmap-reconcile.test.cjs:1029`) therefore fails between the first task commit and the final `roadmap update-job-progress` of any multi-task TRD in this repo. It contradicts the executor contract "A SUMMARY without `## Self-Check` means checkpoint, not complete". This is outside the scope of a release-verification TRD, so it was not fixed. Candidate for a hardening objective.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (installed record 2.14.0; .plugin-version 2.14.0; six v1.5 libs; three v1.5 hooks registered; doctor engine 2.14.0 with runtime-mirror, hooks-registry (20) and model-profiles ok plus skill-requires and checks-workflow-pin present; health engine 2.14.0 with no E020/W021/I022)
- Gate failures: `npm test` E2E1 failed once before the Task 2 commit. That was transient roadmap drift from the checkpoint SUMMARY, and it cleared after `roadmap update-job-progress 65` (re-run: fail 0). See Validation Gate Results and Deferred Issues.
- Not pushed (per instructions).
- State: `roadmap update-job-progress 65` set objective 65 to Complete (4/4). `state advance-job --objective 65` → "Objective 65 executed — 4/4 TRDs complete, ready for verification". `requirements mark-complete REL-02` → marked. `state update-progress` → `updated: false`, "Progress field not found in STATE.md" (no progress field in this repo's STATE.md, not an error).

## Self-Check: PASSED

- FOUND: commits 11a360a9 (Task 1), 18a775a4 (Task 2), 2db21cbf (SessionStart stamp)
- FOUND: /Users/justin/dev/devflow-claude/.planning/objectives/65-release-v1-5/65-04-SUMMARY.md
- FOUND: the six mirror libs under /Users/justin/.claude/devflow/bin/lib/ (todo-sync, todo-session, checks-pin, estimate-backtest, skill-requires, builtin-audit)
- FOUND: the three installed hooks under /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/ (gate-bash-writes.js, gate-skill-requires.js, todo-sync.js)
