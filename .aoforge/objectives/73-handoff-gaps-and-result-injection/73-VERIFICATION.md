---
objective: 73-handoff-gaps-and-result-injection
verified: 2026-10-10T00:36:41Z
status: gaps_found
score: 3/3 success criteria verified (1 regression gap outside the criteria)
gaps:
  - truth: "Running the aoforge-watch daemon (the SC3 deliverable) leaves the machine's gating behaviour unchanged for repositories under $HOME"
    status: failed
    reason: "aoforge-watch writes its log (and watcher-state its pid files) into ~/.aoforge/, the same name as the planning directory. compat.findProjectRoot walks up with no $HOME stop, so once ~/.aoforge exists $HOME is detected as an AOForge project for every non-AOForge repo under it (gate-edits strict deny, gate-commits, route-intent, classify-session, and so on). In 73-08's full run this caused 4 classify-session test failures on this machine. The orchestrator removed ~/.aoforge and the suite is clean now, but the next attended watcher start recreates the directory."
    artifacts:
      - path: "plugins/aoforge/aoforge/bin/aoforge-watch.cjs"
        issue: "LOG_DIR_NAME = '.aoforge' (line 57): the log goes to ~/.aoforge/aoforge-watch.log"
      - path: "plugins/aoforge/aoforge/bin/lib/watcher-state.cjs"
        issue: "PID_DIR_NAME = '.aoforge' (line 26): pid and state files go to ~/.aoforge/"
      - path: "plugins/aoforge/aoforge/bin/lib/compat.cjs"
        issue: "findProjectRoot (line 140) treats any ancestor holding .aoforge/ as a project root, including $HOME; nothing tells a user-dotfile dir apart from a planning dir"
    missing:
      - "Move the watcher's log and pid/state files out of ~/.aoforge, for example to ~/.claude/aoforge/state/watch/ with a one-release read fallback. userDotFile's watch allowlist and defaults.json use the same dir, so they need the same move."
      - "And/or make findProjectRoot (and the hooks' project detection) stop at, or skip, $HOME unless ~/.aoforge holds real planning files (STATE.md, ROADMAP.md or config.json)"
      - "A regression test: with HOME=<tmp> and <tmp>/.aoforge/aoforge-watch.log present, a repo under <tmp> is not detected as an AOForge project (classify-session, gate-edits)"
      - "A doctor/validate check that flags a ~/.aoforge left by an older watcher"
    origin: "The names come from 72-04's mechanical rename (~/.devflow became ~/.aoforge while the planning dir also became .aoforge). Objective 73's attended daemon is the first to create the dir in normal use and the first place the defect showed up."
notes:
  - kind: documented_follow_up
    id: G1/G2
    note: "gate-interactive.js:108, the ssh-keygen pattern `${CMD_POS}ssh-keygen\\b(?!.*\\s-N\\s)`, also gates read-only modes (-l, -F, -R, -y), and its reason can name the wrong call. This predates objective 73 (a15e2af5 rename; the pattern is older) and is documented in USER-GUIDE Known issues (line 1129). Candidate for gap closure in a later objective."
  - kind: documented_follow_up
    id: G3
    note: "gate-interactive matches inside quoted arguments (CMD_POS at line 54 treats a quoted `|` as a pipe). Reproduced during this verification: a grep pattern holding the word ssh-keygen was gated and left .aoforge-handoff/pending/h-b15fceb2.json, which the verifier deleted. gate-commits and changelog-on-tag already strip quotes and heredocs (stripQuoted/stripHeredocs); gate-interactive should reuse them. Documented in USER-GUIDE Known issues. Severity: warning. With a watcher running, a false positive is dispatched to the user's terminal."
  - kind: documented_follow_up
    note: "`✗ exit ?` for a record with no exit code (USER-GUIDE 1127), and keys typed between commands going to the next command: both documented."
  - kind: scope
    note: "SC3 names 'auth login, token paste or sudo prompt'. The demo used ssh-keygen's passphrase prompt (sudo is on the daemon's deny list by design). It is a secret prompt answered in the user's terminal, so it meets the intent. A real auth login was not run live."
  - kind: scope
    note: "PostToolUse delivery was not exercised live (only Stop). It is covered by inject-handoff-results.test.js and hook-coexistence.test.js, and the verifier's own probe showed it working."
evidence:
  - type: log
    path: "scratchpad/aoforge-73-demo/.aoforge-handoff/done/h-abe054d2.json (+ .claim)"
    truth: "SC3: status done, exit 0, consumed true, consumed_by inject-handoff-results@Stop, cmd without -N"
  - type: log
    path: "~/.claude/projects/-private-tmp-...-aoforge-73-demo/bafdfd7c-d8ff-4987-a367-9a7de0ee7608.jsonl"
    truth: "SC3: record 50 is isMeta Stop hook feedback carrying the result; user records 9/44/63 carry no output"
---

# Objective 73: Handoff gaps and result injection Verification Report

**Objective Goal:** A command that needs a TTY goes from detection, to the user's shell, to a result back in context, with no manual paste.
**Verified:** 2026-10-10T00:36:41Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each of the three PTY gaps has a regression test that fails on the old behaviour and passes now | VERIFIED | Independent replay in detached worktrees. At RED commit 96b5787a, watcher-shell.test.cjs: 18 fail, including 73-PTY-1 gap 1 [bash, zsh] and 73-PTY-2 gap 2 [bash, zsh]. At RED commit 34bce9ad, watcher-daemon.test.cjs: LM-1, LM-2 (gap 3 late match) and LM-3 fail. At HEAD all of them pass (127 tests, 125 pass, 0 fail, 2 skipped: fish and pwsh not installed). None of the gap tests skip. |
| 2 | inject-handoff-results.js is registered in hooks.json, delivers a completed result, and is in the coexistence suite | VERIFIED | hooks.json has a PostToolUse `*` entry and a Stop entry (timeout 150). hook-coexistence.test.js has RUNS entries `inject-handoff-results.js@PostToolUse` and `@Stop`, plus test 9 on registration and timeout. inject-handoff-results, handoff-results and hook-coexistence tests: 329/329 pass. Verifier probe: a done record in a temp project, fed a PostToolUse payload, produced `hookSpecificOutput.additionalContext` with `## Deferred command results`. A second invocation printed nothing (the O_EXCL `.claim` was written), so delivery is exactly once. |
| 3 | Live aoforge-watch demo: a TTY command is detected, handed off, run by the user, and its result reaches context; AOForge never types or reads a secret | VERIFIED | Read the 73-07 evidence on disk myself: done record h-abe054d2 (status done, exit 0, consumed_by inject-handoff-results@Stop, cmd without -N) and its .claim exist. In the demo transcript, record 50 is `isMeta` Stop hook feedback holding the result, record 54 is Claude reporting the fingerprint, and the user-typed records 9, 44 and 63 hold no output. The passphrase was empty and entered by the user in terminal A, and the private keys were deleted unread. |

**Score:** 3/3 success criteria verified. Status is gaps_found because of one regression (G5) that this objective's daemon brings out.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs` | script-file PTY dispatch, liveOnly listeners | VERIFIED | Gap 1 and gap 2 tests pass; the live filter is wired |
| `plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs` | ptyScript/sourceLine | VERIFIED | Used by watcher-shell |
| `plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs` | detector attached liveOnly | VERIFIED | LM-3 asserts the wiring |
| `plugins/aoforge/aoforge/bin/lib/handoff-results.cjs` | select/render/claim/address | VERIFIED | Used by inject-handoff-results.js and route-results |
| `plugins/aoforge/hooks/inject-handoff-results.js` | PostToolUse context and Stop block | VERIFIED | No longer a DRAFT, registered, probe passes |
| `plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs` / `aoforge-watch.cjs` | attended foreground terminal | VERIFIED (with G5) | Used live in 73-07. Log and pid dir is ~/.aoforge (G5) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| hooks.json | inject-handoff-results.js | PostToolUse `*` + Stop (timeout 150) | WIRED |
| inject-handoff-results.js | handoff-results.cjs | takeResults / claimRecord (O_EXCL) | WIRED |
| gate-interactive.js | pending record + session/agent address | PreToolUse deny | WIRED (reproduced live, see G3) |
| watcher-daemon processOnce | ShellSession.attachDataListener | `{ liveOnly: true }` | WIRED |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| HND-01 | 73-01, 73-03 (+73-05, 73-08) | SATISFIED | SC1 RED/GREEN replay |
| HND-02 | 73-02, 73-04, 73-06 (+73-08) | SATISFIED | SC2 registration, coexistence, probe |
| HND-03 | 73-05, 73-07 (+73-08) | SATISFIED | SC3 live evidence on disk |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| aoforge-watch.cjs / watcher-state.cjs | 57 / 26 | user dotfile dir with the same name as the planning dir | Blocker (G5) | $HOME detected as an AOForge project after the watcher runs |
| hooks/gate-interactive.js | 54, 108 | raw-text matching; ssh-keygen pattern with no read-only exemption | Warning (G1-G3, documented) | False-positive handoffs |

No TODO, FIXME, DRAFT or stub markers in the objective's hook and library files.

### Test Suite

`npm test` at HEAD (66b8b30a + clean tree): **12,187 tests, 12,155 pass, 0 fail, 0 cancelled, 32 skipped**, exit 0. This matches the baseline exactly. ~/.aoforge was absent during the run.

### Functional Verification

Skipped as a browser or Maestro drive: this is not a web or mobile UI objective. Runtime evidence comes from the hook probe above and the on-disk live-demo artifacts from 73-07.

### Human Verification Required

None beyond what 73-07 already collected (the live checkpoint was done by the user).

### Gaps Summary

All three success criteria hold, and I checked them independently: I replayed the RED commits, probed the hook, and read the live-demo records and transcript. One real gap remains, G5. The attended watcher writes `~/.aoforge/`, and project detection (`compat.findProjectRoot`) walks up past $HOME. After any watcher start, $HOME looks like an AOForge project to every hook in every repo under it. It made classify-session tests fail on this machine and changes gate behaviour for non-AOForge repos (gate-edits defaults to strict deny). The name collision comes from the 72-04 rename, but objective 73's daemon is the path that creates the dir. That needs a fix plus a regression test before the objective is complete. G1-G3, `exit ?` and keys between commands are documented follow-ups, not blockers. G3 should be fixed soon because it fires on ordinary grep commands.

---

_Verified: 2026-10-10T00:36:41Z_
_Verifier: Claude (verifier)_
