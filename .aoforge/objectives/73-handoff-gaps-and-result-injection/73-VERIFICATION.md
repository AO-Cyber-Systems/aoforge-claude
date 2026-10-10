---
objective: 73-handoff-gaps-and-result-injection
verified: 2026-10-10T02:27:01Z
status: passed
score: 3/3 success criteria verified; G5 closed, G1/G2/G3 closed
re_verification:
  previous_status: gaps_found
  previous_score: "3/3 success criteria verified (1 regression gap outside the criteria)"
  gaps_closed:
    - "G5: running aoforge-watch leaves gating unchanged for repositories under $HOME ($HOME is never a project root, and the watcher, service, pid and log files live in ~/.claude/aoforge/state/watch)"
    - "G3 (follow-up): gate-interactive matches only real invocations, not quoted text or heredoc bodies written to files"
    - "G1/G2 (follow-up): ssh-keygen read-only forms pass; flags and the reason are read per call"
  gaps_remaining: []
  regressions: []
notes:
  - kind: advisory
    note: "session-audit.findPlanningRoot keeps walking above $HOME one directory at a time (findProjectRoot with maxUp 0 per directory). $HOME itself is never returned and directories above it do not hold planning dirs in practice. This is offline analytics, not gating. Cosmetic."
  - kind: advisory
    note: "watcher-allowlist accepts a whole compound command when ANY call in it is a gated one. The raw-text CMD_POS regex had the same behaviour before 73-10. The deny list still runs on the whole text, and the daemon is attended (the user sees the command). Not a regression."
  - kind: advisory
    note: "Read fallbacks to ~/.aoforge (3.0.0) and ~/.devflow (pre-rename) for the pid file, log, allowlist, defaults.json and brave_api_key stay for one release (compat.resolveUserFile). They are read-only: nothing writes ~/.aoforge any more (grep plus the live probe)."
  - kind: carried_from_previous
    note: "`exit ?` for a record with no exit code, and keys typed between commands going to the next command: still documented follow-ups (USER-GUIDE Known issues), outside the success criteria."
  - kind: scope
    note: "Unchanged from the first verification: SC3 used ssh-keygen's passphrase prompt (sudo is denied by design); PostToolUse delivery is covered by tests and the first verifier's probe, not by the live demo."
evidence:
  - type: log
    path: "scratchpad npmtest.log (session e5890170)"
    truth: "Full suite at 933de900: tests 12506, suites 2033, pass 12474, fail 0, cancelled 0, skipped 32, todo 0, exit 0"
  - type: log
    path: "scratchpad probe-home.cjs output"
    truth: "G5: spawned gate-edits and classify-session under temp homes holding ~/.aoforge (new name), ~/.planning (legacy name), and a symlinked home in both directions: findProjectRoot null, no deny, no classify output; positive control (a real project below a dirty home) still denies"
  - type: log
    path: "scratchpad probe-watch.cjs output"
    truth: "G5: a fresh start writes only .claude/aoforge/state/watch/aoforge-watch.{pid,log}, no ~/.aoforge; a running 3.0.0 daemon (pid file in ~/.aoforge) is seen by status and isWatcherLive, add-project rewrites its file, stop terminates it and clears the file; doctor check 17 is report-only (fixable false, fix_command names stop) while it runs, then fixes (moves the log, removes the empty dir)"
---

# Objective 73: Handoff gaps and result injection Verification Report

**Objective Goal:** A command that needs a TTY goes from detection, to the user's shell, to a result back in context, with no manual paste.
**Verified:** 2026-10-10T02:27:01Z
**Status:** passed
**Re-verification:** Yes, after gap closure (TRDs 73-09 to 73-14, HEAD 933de900)

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each of the three PTY gaps has a regression test that fails on the old behaviour and passes now | VERIFIED (regression check) | `git diff f597ccfd..HEAD` touches none of watcher-shell.cjs, wrappers/, handoff-results.cjs or their tests. watcher-daemon.cjs changed in one comment only (the log path). The RED replay from the first verification stands, and the gap tests pass in the full run. |
| 2 | inject-handoff-results.js is registered in hooks.json, delivers a completed result, and is in the coexistence suite | VERIFIED (regression check) | hooks.json: PostToolUse `*` and Stop (timeout 150) entries for inject-handoff-results.js, and PreToolUse Bash for gate-interactive.js. inject-handoff-results.js, hooks.json and handoff-results.cjs are unchanged since f597ccfd. The coexistence and inject tests pass in the full run. |
| 3 | Live aoforge-watch demo: a TTY command is detected, handed off, run by the user, and its result reaches context; AOForge never types or reads a secret | VERIFIED (unchanged) | The 73-07 evidence stands. The gap closure changed where the daemon keeps its pid and log, not the dispatch or delivery path. The live probe below confirms that start, status, stop and add-project work with the new state directory. |

**Score:** 3/3 success criteria verified. G5 is closed, and so are the G1/G2/G3 follow-ups.

### Gap closure

| Gap | Closed by | Status | Evidence |
|-----|-----------|--------|----------|
| G5a: $HOME detected as a project | 73-09: `compat.findProjectRoot` stops at $HOME (exact path, else a basename-gated realpath check on every step, plus a realpath check on each candidate); `isUserHome` | CLOSED | Every hook and lib root finder delegates to compat (upgrade-project, gate-executor-stop, estimate-run-store, session-audit, plus 13 hooks requiring compat). The other upward walks look for `.git` or `.aoforge-handoff` only. Live probe (spawned gate-edits and classify-session, temp homes): new name `~/.aoforge`, legacy `~/.planning`, HOME=link with cwd via real, and HOME=real with cwd via link all give null, no deny and no output. The positive control (a real project below a dirty home) denies. |
| G5b: watcher writes ~/.aoforge | 73-11 (`watchStateDir`, `resolveUserFile`: runtime home first, then 3.0.0, then legacy, read-only), 73-12 (pid and log in `~/.claude/aoforge/state/watch`), 73-13 (launchd and systemd logs in the same dir) | CLOSED | watcher-state `pidFilePath` and aoforge-watch `logFilePath` both use the watch dir. service-installer StandardOut/Err point at `watchStateDir` (systemd `%h/...`). No skill, workflow, agent or reference names `~/.aoforge`; settings.md saves to `~/.claude/aoforge/defaults.json`. Live probe: a fresh `start --foreground` creates only `.claude/aoforge/state/watch/aoforge-watch.{pid,log}`, and no `~/.aoforge` before or after stop. |
| G5c: a running 3.0.0 daemon | 73-12 (interim pid file read, rewritten by add/remove, cleared by stop/start; legacy pre-rename daemon refused) | CLOSED | Live probe with a stand-in process and a pid file in `<home>/.aoforge`: status reports running with the pid, `isWatcherLive` is true, `add-project` rewrites the 3.0.0 file (no new file created), and `stop` terminates the process and removes the file. |
| G5d: doctor check | 73-13 check 17 `user-dot-dir` | CLOSED | It is report-only for planning files, a live pid (EPERM counts as live), a service still logging there, a symlinked dir, and unknown files. It moves only known regular files, sends a file to `backups/aoforge-dot-dir-<ts>/` when the destination exists or the pid is stale, never overwrites or deletes, removes the dir only when it is empty and real, and never signals or reloads a service. Live: while the 3.0.0 daemon ran, the check gave `warn`, `fixable:false`, fix_command `... aoforge-watch.cjs stop`, and `--fix` left everything in place. After stop, `--fix` moved the log and removed the empty dir. |
| G3: matches inside quoted args | 73-10 `interactive-commands.cjs`: per simple command via shell-words.parseCommand; heredoc bodies are data unless fed to a shell; unterminated quote fails open | CLOSED | `rg "a\|<cmd>" f` and `cat > notes.md <<EOF` bodies are not gated (case table). The full suite run left no pending record in the repo (find returned none). |
| G1: ssh-keygen read-only forms | `sshKeygenNeverPrompts`: getopt-style flag parse; -l/-F/-R pass, -y needs -P, otherwise -N | CLOSED | Case table: `-lf`, `-l -f`, `-E sha256 -lf`, `-F host`, `-R host`, `-y -f k -P ""` pass. `-y -N "" -f k` is still gated (correct: -N does not answer -y's prompt). |
| G2: reason names the wrong call | hit carries `segment` + `compound`; skip rules read per call | CLOSED | `gh auth login; echo --with-token` is gated (the skip flag is in another call). Tests 3 and 20 check that the reason names the gated call. |
| Hook and daemon agree | 73-12: `watcher-allowlist` DEFAULT_PATTERNS = `INTERACTIVE_PATTERNS` (builtin) matched through `interactive.matchInvocations` | CLOSED | One module, one pattern table. watcher-allowlist.test 16/17 iterate the shared case table (`__fixtures__/interactive-command-cases.cjs`): everything the hook hands off is accepted, and everything it lets through is refused. |

### RED to GREEN per gap (replayed in detached worktrees, temp HOME)

| TRD | RED commit | Test files | Result at RED | At HEAD |
|-----|-----------|------------|---------------|---------|
| 73-09 | b5cb5e15 | compat.home, planning-mode, hooks/home-project-detection | 54 tests, 13 fail: new name, legacy name at $HOME, symlinked home (both directions, different basename), process.env.HOME default, isUserHome, planning-mode main root, spawned classify-session/gate-edits/route-intent | pass |
| 73-10 | 8944efc4 | interactive-commands, gate-interactive | 171 tests, 20 fail: G3 quoted pipe and heredoc bodies, G1 -l/-F/-R/-y -P, G2 per-call reason and flags, hook re-exports the shared module | pass |
| 73-11 | 61a4e031 | compat.home, compat.legacy, watcher-allowlist | 90 tests, 16 fail: watchStateDir, resolveUserFile order, userDotFile prefers the runtime home, allowlist default path | pass |
| 73-12 | c2121c3f | aoforge-watch, watcher-allowlist, watcher-state | 173 tests, 37 fail: pid and log in the watch dir and no `<home>/.aoforge`, a 3.0.0 log and a stale 3.0.0 pid handled, hook/daemon agreement (cases 16, 17, 19, 20) | pass |
| 73-13 | c9a02d10 | service-installer | 30 tests, 7 fail: launchd and systemd log paths, install creates no `<HOME>/.aoforge`, servicePaths | pass |
| 73-13 | b36341ff | doctor-checks/17-user-dot-dir | fails at load (the module did not exist yet: the RED for a new check) | pass |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `aoforge/bin/lib/compat.cjs` (findProjectRoot, isUserHome, userHomeDir, watchStateDir, resolveUserFile) | VERIFIED | Substantive and wired (all root finders delegate) |
| `aoforge/bin/lib/interactive-commands.cjs` | VERIFIED | Required by gate-interactive.js (fail-open) and watcher-allowlist.cjs |
| `aoforge/bin/lib/watcher-allowlist.cjs` | VERIFIED | Built-ins come from the shared module; used by watcher-daemon and aoforge-watch |
| `aoforge/bin/lib/watcher-state.cjs` / `aoforge-watch.cjs` | VERIFIED | Watch dir for pid and log; one-release 3.0.0 read; legacy daemon refused |
| `aoforge/bin/lib/service-installer.cjs` | VERIFIED | Service logs in the watch dir; `servicePaths` exported for doctor |
| `aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs` | VERIFIED | Global scope, safe fix (see above) |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| HND-01 | SATISFIED | SC1 (unchanged since the first verification) |
| HND-02 | SATISFIED | SC2 (unchanged) |
| HND-03 | SATISFIED | SC3, plus G5 closed so running the daemon no longer changes gating below $HOME |

No orphaned requirements.

### Anti-Patterns Found

None blocking. No TODO, FIXME or stub markers were found in the gap-closure files. The three advisories are in the frontmatter `notes:`.

### Test Suite

`npm test` at 933de900, clean tree (only the untracked `amp`): **12,506 tests, 2,033 suites, 12,474 pass, 0 fail, 0 cancelled, 32 skipped, 0 todo**, exit 0. This matches the expected totals exactly. Real `~/.aoforge` is absent after the run, and no `.aoforge-handoff/pending` record exists in the repo.

### Functional Verification

This is not a web or mobile UI objective, so there was no browser or Maestro drive. Runtime evidence comes from two live probes under temp HOMEs in the scratchpad: home detection through spawned hooks, and the watcher lifecycle including a stand-in 3.0.0 daemon and doctor check 17. Neither probe read or wrote the real HOME, and neither touched the user's running watchers.

### Human Verification Required

None.

### Gaps Summary

All gaps from the first verification are closed. G5: `$HOME` is never a project root, under the new name, the legacy name and symlinked homes, and this was confirmed through spawned hooks. The watcher, its service, its pid file and its log now live under `~/.claude/aoforge/state/watch`. A running 3.0.0 daemon is still found, updated and stopped. Doctor check 17 cleans up a leftover `~/.aoforge` without touching a live daemon, a service, planning files or unknown files. G1/G2/G3: gate-interactive and the watch daemon share one per-invocation matcher, so quoted text and file-bound heredoc bodies are not gated, ssh-keygen's read-only forms pass, and the two sides agree on one case table. Each gap TRD has a RED commit that fails on the old code, and the full suite is green.

---

_Verified: 2026-10-10T02:27:01Z_
_Verifier: Claude (verifier)_
