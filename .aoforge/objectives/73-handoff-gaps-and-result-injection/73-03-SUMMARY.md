---
objective: 73-handoff-gaps-and-result-injection
job: "03"
subsystem: handoff-watcher
tags: [pty, shell, listeners, prompt-detector, live-window, e2e]

requires:
  - objective: 73-01
    provides: the in-band PTY dispatch script and sentinelMarkers(id)
provides:
  - "watcher-shell.cjs makeLiveFilter({ begin, delim, protocol }): the pure live-window filter for one dispatch"
  - "ShellSession.attachDataListener(fn, { liveOnly: true }): a listener that sees only the active dispatch's live window"
  - "processOnce attaches the prompt detector live-only, so gap 3 (detector late match) is closed"
  - "handoff-e2e.test.cjs: MA-6-synth / MA-7 / MA-6 assert; no test skips on a gap"
affects: [73-05 attended watch terminal, 73-07 live TTY demonstration]

tech-stack:
  added: []
  patterns:
    - "A listener asks for the live window; the session, which owns the protocol, knows where it is"
    - "One filter per dispatch, fed every chunk once and shared by every liveOnly listener"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs
    - plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs
    - .aoforge/ROADMAP.md

key-decisions:
  - "The live-window filter is fed every chunk of an active dispatch whether or not a liveOnly listener is attached yet (the TRD computed it only when one exists), so a listener attached mid-dispatch starts from the right phase"
  - "_makePromptDetector is unchanged; the fix is where its bytes come from"
  - "MA-6 drops its status 'done' assert per error_recovery: doctl rejects the fake token; the observed outcome is a test diagnostic"

patterns-established:
  - "Held-back marker prefix: only the longest suffix that is a proper prefix of the awaited marker is withheld, and it is released whole when it turns out not to be one"

requirements-completed: [HND-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 16min
completed: 2026-10-09
tokens_input: 10165118
tokens_output: 67141
tokens_cache_read: 9988288
tokens_cache_write: 176688
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 73 TRD 03: Live-window listeners Summary

**`attachDataListener(fn, { liveOnly: true })` delivers only the running command's live bytes (in-band: after BEGIN up to DELIM; replay: start up to BEGIN), and processOnce attaches the prompt detector that way, so a tool's error text replayed after it has exited is never mistaken for a prompt (gap 3). MA-6-synth, MA-7 and MA-6 now assert; the e2e file is 13 pass, 0 skipped.**

## Progress
- [x] Task 1: RED, the late-match regressions and the live-only listener tests - 34bce9ad
- [x] Task 2: GREEN, makeLiveFilter, liveOnly listeners and the live-only detector - 705771ea
- [x] Task 3: The e2e tests assert instead of skipping, and the gates - 36dd82b7

## Performance

- **Tasks:** 3 of 3
- **Files modified:** 6 (the 5 in the TRD's files_modified, plus ROADMAP.md through `roadmap update-job-progress`)
- **Commits:** 34bce9ad (RED), 705771ea (GREEN), 36dd82b7 (e2e)

## Accomplishments

- Gap 3 closed. Error text that matches a secret's prompt regex only in replayed output never makes the daemon inject Ctrl+C or the secret, and never adds `secret resolution failed`.
- `makeLiveFilter` is a pure function with two phase maps (in-band: before, live, after; replay: live, after). A marker split across chunks is held back, and a held-back suffix that is not a marker is released whole.
- Listeners attached without options are unchanged (DL-1 to DL-8 pass untouched).
- A live prompt is still answered and redacted (resolved secret consumed by the command, `got=***REDACTED***`), and an unresolvable secret at a live prompt fails the dispatch in about half a second with `secret resolution failed`.
- No e2e test skips on a gap any more. The header block "ARCHITECTURAL FINDING (TRD 19-05)" is now a short "CLOSED IN OBJECTIVE 73" note naming 73-01 (gaps 1 and 2) and 73-03 (gap 3); `isArchitecturalGap` and `tryWaitForDoneRecord` are deleted.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (commit 34bce9ad) | `node --test plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` | 1 (125 tests: 109 pass, 14 fail, 2 skipped; every pre-existing test passed) | FAIL (correct) |
| GREEN (commit 705771ea) | same, plus `wrappers/bash.test.cjs` and `wrappers/index.test.cjs` | 0 (157 tests: 155 pass, 0 fail, 2 skipped = fish and pwsh not installed) | PASS (correct) |

RED failures on the pre-73-03 code, captured before any source change:

| Test (TRD item) | Observed on the old code |
|---|---|
| LM-1 (4) gap 3, unresolvable secret | stderr was `Error: unable to read access token\n\n[aoforge-watch] secret resolution failed for "AOFORGE_T73_UNSET" (env var "AOFORGE_T73_UNSET" unset or empty)`: the false message, and Ctrl+C injected |
| LM-2 (5) gap 3, resolved secret | `the daemon wrote to the shell: ["t73-token-abcdef123\r"]` (the secret typed into the shell's input) |
| LM-3 (16) wiring | `attachDataListener` options were `[undefined]`, expected `[{ liveOnly: true }]` |
| LV-1 (8) pipe, replay | the option was ignored: the listener saw `__DFW_BEGIN_lv-1__\nout\n__DFW_DELIM_lv-1__\nEnter your access token:\n__DFW_END_lv-1__:3\n` |
| LV-2 (9) PTY in-band | the listener saw `__DFW_BEGIN_lv-2__\r\nlive-73\r\n__DFW_DELIM_lv-2__\r\n__DFW_END_lv-2__:0\r\n` |
| LV-3 (10) PTY forced replay | the listener saw `Prompt-73: __DFW_BEGIN_lv-3__\r\nreplayed-73\r\n...` |
| LV-4 (11) outside a dispatch | the listener received the shell prelude (`stty -echo`, `PS1=''`, the readiness probe, the bash 3.2 banner) |
| MLF-1 to MLF-6 (13, 14, 15 and three more) | `makeLiveFilter is not a function` (7 tests, MLF-3 runs per protocol) |

LV-5 (a listener without options still sees every chunk, sentinels included) passed on the old code: it is a pin, not a RED case. LM-4 and LM-5 (TRD items 6 and 7) are the guards the TRD describes: written in Task 2, they pass because live prompts were never broken; neither was RED.

Test-list mapping: TRD item 4 = LM-1, 5 = LM-2, 6 = LM-4, 7 = LM-5, 8 = LV-1, 9 = LV-2, 10 = LV-3, 11 = LV-4, 12 = DL-1..DL-8 (unchanged), 13 = MLF-1, 14 = MLF-2, 15 = MLF-3, 16 = LM-3. LV-5 and MLF-4 to MLF-6 are additions. Items 1 to 3 are the e2e tests MA-6-synth, MA-7 and MA-6.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test .../watcher-daemon.test.cjs .../watcher-shell.test.cjs` (expected non-zero; only the new objective-73 tests failed) | 1 | PASS (RED as designed) |
| 2: GREEN | `node --test .../watcher-daemon.test.cjs .../watcher-shell.test.cjs .../wrappers/bash.test.cjs .../wrappers/index.test.cjs`; PTY tests ran (not skipped); `--test-name-pattern="objective 73"` 4 runs in a row, 42 of 42 each | 0 | PASS |
| 3: e2e and suite | `node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` 3 runs (13 pass, 0 skipped each), then `npm test` | 0, 0 | PASS |

### Handoff e2e before and after

`node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs`:

| Point | Tests | Pass | Skipped |
|---|---|---|---|
| Before objective 73 | 13 | 10 | 3 (MA-6-synth, MA-7, MA-6, each on a gap) |
| After 73-01 | 13 | 12 | 1 (MA-6, on a narrow temporary skip for the duplicate-prompt message) |
| After 73-03 | 13 | 13 | 0 |

MA-6-synth asserts `done`, exit 0, `got=***REDACTED***` and the token absent from stdout and stderr. MA-7 asserts a `failed` (never `timeout`) record within 20 s with `secret resolution failed` and `DIGITALOCEAN_TOKEN`; it completes in about 0.9 s. MA-6 follows error_recovery, below.

### MA-6 outcome (error_recovery applied)

MA-6 does not reach `status 'done'`. Observed on every run (4 of 4): `status failed`, `exit_code 1`, stderr `[aoforge-watch] duplicate prompt match for "DIGITALOCEAN_TOKEN" (likely incorrect value)`; stdout has no token. This is not one of the three gaps. A scratch probe (outside the repo, listener attached `liveOnly` against the same mock) showed why:

- With the e2e's 34-character fake token, doctl's bubble-tea input rejects the value, keeps the prompt on screen (a red cross) and redraws `Enter your access token:` on every cursor blink (about every 530 ms). The duplicate-prompt guard reads the redraw as a rejected value and sends Ctrl+C, which is what it is for. The same label in the *live* window is why `liveOnly` alone cannot make this case pass.
- With a 64-character token the input is accepted and doctl then validates against `https://cloud.digitalocean.com/v1/oauth/token/info` (a 401 from the real service in the probe), not against `DIGITALOCEAN_API_URL`, so the local mock never sees the request.

So MA-6 cannot reach `done` offline against this doctl, whatever the detector does. Nothing was widened. The kept asserts hold and are meaningful: no `unknown terminal` (gap 1 stays closed), status is not `timeout` (the detector's Ctrl+C reaches doctl), and the token is redacted from stdout and stderr. The observed outcome is written to the run with `t.diagnostic`.

**Follow-up for objective 75's todo sweep:** decide whether MA-6 should stay as a "doctl gets a terminal" smoke (as now) or be replaced by MA-6-synth plus a real-credential run in 73-07; a `done` assert would need a doctl that validates against `DIGITALOCEAN_API_URL`.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test watcher-shell.test.cjs watcher-daemon.test.cjs handoff-e2e.test.cjs` (and bash/index wrapper tests) | 0 | PASS |
| test (full) | `NODE_PATH=<main checkout>/node_modules npm test` | 0 | PASS: 12,101 tests, 12,069 pass, 0 fail, 32 skipped (73-01 reported 12,042 / 12,009 / 33 skipped; the base now also holds 73-02) |
| lint | not configured | not_available | not_available |
| build | not configured | not_available | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan's test commands] `exit 3` ends the shell**
- **Found during:** Task 1 (writing LM-1, LM-2, LV-1)
- **Issue:** The TRD's test commands end in `; exit 3`. The dispatch wrapper runs a command as `{ cmd ; } > out 2> err` in the shell's own process, so a bare `exit` ends the shell and there is no replay to test (73-01's PTY-12 pins this: `exit 3` gives `shell_died`).
- **Fix:** `(exit 3)`, which sets the status without leaving the shell. The intent (an exit code of 3 and error text on stderr) is unchanged.
- **Files modified:** `watcher-daemon.test.cjs`, `watcher-shell.test.cjs`
- **Commit:** 34bce9ad

**2. [Rule 1 - Bug in the plan's test command] TRD item 7 (LM-5) cannot use the shell's `read` builtin**
- **Found during:** Task 2
- **Issue:** With the TRD's command (`printf ... > /dev/tty; read TOK; ...`), the injected Ctrl+C never stopped the dispatch (8 s `timeout`). The 73-01 dispatch script holds `trap ':' INT`, and bash 3.2 (macOS `/bin/bash`) does not interrupt the `read` builtin for a trapped signal. A second attempt, with a child process doing the read but the shell printing the prompt, raced the fork (Ctrl+C landed before the reader existed) and timed out too.
- **Fix:** LM-5's command is `sh -c 'printf "Enter your access token: " > /dev/tty; read TOK; echo got=$TOK'`: the prompt and the reader are one child process, as a real tool is. 3 of 3 runs, then 4 more with the whole group, stable. LM-4 (TRD item 6) uses the TRD's `read` command unchanged and passes.
- **Files modified:** `watcher-daemon.test.cjs`
- **Commit:** 705771ea

**3. [Rule 3 - Design choice] The live filter is fed regardless of listeners**
- **Found during:** Task 2
- **Issue:** The TRD computes the filter's output only "if any liveOnly listener exists and a dispatch is active". A liveOnly listener attached after the dispatch started would then find the filter still in its first phase and receive nothing for the rest of the dispatch.
- **Fix:** `_emitExtData` feeds the active dispatch's filter on every chunk and shares the result between listeners. The cost is one small string scan per chunk; behaviour is identical when the listener is attached before the dispatch, which is how processOnce does it.
- **Files modified:** `watcher-shell.cjs`
- **Commit:** 705771ea

### Notes (not deviations)

- TRD test 10 (LV-3, bash forced onto the replay protocol in PTY mode) was reliable (passes on every run), so the `todo` fallback in error_recovery was not needed. On the wire the prompt and BEGIN share a line (`Prompt-73: __DFW_BEGIN_lv-3__`) and the filter emits `Prompt-73: `.
- MA-6 followed error_recovery (see above).
- `roadmap update-job-progress 73` was run before the full-suite run (72-27's E2E1 gotcha) and ticked this TRD's box.
- A bare worktree has no `node_modules`; tests ran with `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules`. Nothing under version control changed.
- bash 3.2's `read` builtin ignoring a trapped SIGINT (deviation 2) affects only commands that are a bare `read` in the dispatched shell; external tools (doctl, gh, ssh-keygen) are children and die on Ctrl+C. Worth knowing for 73-05 and 73-07, not a defect in this TRD.

## Auth gates

None.

## Discovered commands

None. `.aoforge/STACK.md` provides `npm test` with the scoped form `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (gap 3 closed with a regression test that failed first; liveOnly delivers only the live window for both protocols and holds back split markers; plain listeners unchanged, DL-1 to DL-8 untouched; processOnce attaches `{ liveOnly: true }`; live resolved prompt consumed and redacted, unresolvable one fails promptly; e2e MA-6-synth / MA-7 / MA-6 assert and no test skips except for a missing node-pty or doctl)
- `rg -n "liveOnly: true" plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs` finds the attach; `rg -n -e isArchitecturalGap -e "architectural gap" plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` finds nothing.
- Gate failures: None

## Issues Encountered

- The TRD's exit-3 commands and its LM-5 command did not behave as written (deviations 1 and 2); both were test-command problems, not implementation problems.
- MA-6 cannot reach `done` offline against this doctl (see MA-6 outcome).

## Next Phase Readiness

73-05's attended terminal mirror can attach `attachDataListener(mirror, { liveOnly: true })` to show exactly what the running command prints, with no sentinel text. HND-01 is complete: the isatty check (gap 1) and the stdin race (gap 2) are 73-01's, the late match (gap 3) is this TRD's, and each has a regression test.

## Self-Check: PASSED

- Files: watcher-shell.cjs, watcher-daemon.cjs, watcher-shell.test.cjs, watcher-daemon.test.cjs and handoff-e2e.test.cjs are present and modified in the worktree.
- Commits: 34bce9ad, 705771ea and 36dd82b7 exist on branch df/exec-73-03-live-window-listeners.
- `liveOnly: true` is at the processOnce attach; no `isArchitecturalGap` or "architectural gap" text remains in the e2e file.
