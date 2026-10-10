---
objective: 73-handoff-gaps-and-result-injection
job: "07"
subsystem: handoff-watcher
tags: [live-demonstration, pty, attended, user-checkpoint, ssh-keygen, stop-hook]

requires:
  - objective: 73-05
    provides: the attended aoforge-watch terminal
  - objective: 73-06
    provides: hook registration and coexistence (inject-handoff-results.js on PostToolUse and Stop)
provides:
  - "SC-3 / HND-03 demonstrated live: a passphrase prompt answered by the user in the attended aoforge-watch terminal, the result delivered into Claude's context by inject-handoff-results@Stop with no paste"
  - "Evidence: two done records (status done, exit 0, consumed, claim file), daemon log lines, scratch-session transcript records, fingerprints recomputed from the public keys"
  - "Three gate-interactive false positives recorded for verify-work (the ssh-keygen pattern has no read-only exemption and scans quoted arguments)"
affects: [73-08 docs and close-out, objective 73 verify-work]

tech-stack:
  added: []
  patterns:
    - "A live checkpoint demo is run with --plugin-dir in a scratch directory, the installed plugin disabled only at local scope there, so the two copies never run together"
    - "A demo runbook names the prompt it wants the user to see and forbids the flag that pre-answers it (no -N)"

key-files:
  created: []
  modified: []

key-decisions:
  - "Run 2 (h-abe054d2, no -N, the user pressed Enter twice in terminal A) is the SC-3 evidence; run 1 (h-c824c40a, Claude added -N \"\") is kept as evidence of delivery for a command that did not prompt"
  - "The gate-interactive false positives found during the demo are recorded as gaps for verify-work and gap closure, not fixed here: this TRD changes no repository file"
  - "Option B (claude --plugin-dir, aoforge@aocyber disabled at local scope in the demo directory only) was used; the pre-rename homelab watcher was stopped for the demo and restored with the same command"

patterns-established:
  - "A handoff demo reads its evidence from three independent places: the done record and claim, the daemon log, and the session transcript"

requirements-completed: [HND-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 337min
completed: 2026-10-09
tokens_input: 2152366
tokens_output: 18294
tokens_cache_read: 2085105
tokens_cache_write: 67209
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 73 TRD 07: Live TTY demonstration Summary

**ssh-keygen's passphrase prompt, queued by gate-interactive from a real Claude Code session, appeared in the user's attended aoforge-watch terminal, was answered there with two Enter presses, and its fingerprint reached Claude's context through inject-handoff-results@Stop 33 ms after the command finished, with no paste and no user prompt.**

## Progress
- [x] Task 1: Preflight and the demo kit - no commit (this task changes no repository file)
- [x] Task 2: The user runs the TTY command through aoforge-watch - no commit (user checkpoint; the user typed in terminal B and answered in terminal A, the orchestrator set up and tore down the terminals)
- [x] Task 3: Evidence, the no-secret check, cleanup and revert steps - no commit of its own (evidence and cleanup are outside the repository; this SUMMARY lands in the docs commit)

## Performance

- **Duration:** about 337 min wall clock (2026-10-09T18:39:54Z preflight to 2026-10-10T00:17Z SUMMARY), almost all of it waiting on the user's checkpoint
- **Live demonstration:** 2026-10-10T00:12:09Z (first prompt in terminal B) to 00:14:27Z (Claude reports the second fingerprint), 2 min 18 s
- **Tasks:** 3 (1 auto, 1 human-action checkpoint, 1 auto)
- **Repository files changed:** 0 (this SUMMARY and the planning records only)

## Accomplishments

- SC-3 / HND-03 met with the user's hands on the keyboard: detection (gate-interactive deny), handoff (pending record to the checkout daemon), the prompt answered by the user in the attended terminal, and the result in Claude's context by itself.
- Both delivery timings of the Stop path were seen: run 1 finished before the turn ended and was delivered at once; run 2 was still waiting on the user when the turn ended, and the Stop hook held the turn 5.8 s until it landed.
- No secret was typed, read or stored by AOForge; the private keys were never opened and are deleted.
- Three gate-interactive false positives were found and diagnosed to the line (Deferred to verify-work below).

## SC-3 / HND-03 verdict

**Met.** SC-3 asks for a TTY-required command to be "detected, handed off, run by the user, and its result appears in context", with AOForge never typing or reading a secret. The TRD chose `ssh-keygen` as the TTY command (on gate-interactive's TTY list and the daemon's allowlist, prompts for a passphrase from the terminal; `sudo` is refused by the daemon's deny list by design). Run 2 shows every step:

1. **Detected:** Claude's Bash call was denied by gate-interactive at PreToolUse (transcript record 47, reason "ssh-keygen prompts for a passphrase without -N; category: tty", queued to the daemon pid 70928).
2. **Handed off:** pending record `h-abe054d2` created 00:14:16.676Z; daemon log `dispatching h-abe054d2` at 00:14:16.871Z.
3. **Run by the user:** in terminal A the prompts `Enter passphrase for "demo-key2" (empty for no passphrase):` and `Enter same passphrase again:` appeared; the user pressed Enter twice; `completed h-abe054d2 status=done exit=0` at 00:14:24.355Z.
4. **Result in context:** the Stop hook claimed the record at 00:14:24.388Z and fed it back as Stop hook feedback (record 50, `## Deferred command results`); Claude reported the fingerprint at 00:14:27.306Z (record 54). The user typed nothing in terminal B between the request (record 44) and the report.

## Evidence

| Item | Run 1: h-c824c40a | Run 2: h-abe054d2 (SC-3 evidence) |
|---|---|---|
| Command (as queued) | `ls demo-key demo-key.pub 2>&1; ssh-keygen -t ed25519 -f demo-key -C aoforge-73-demo -N "" && ssh-keygen -lf demo-key.pub` (Claude rewrote the request and added `-N ""`) | `ssh-keygen -t ed25519 -f demo-key2 -C aoforge-73-demo-2` (exactly as the user asked) |
| Gate reason | `ssh-keygen prompts for a passphrase without -N` (false positive, see gap G1) | `ssh-keygen prompts for a passphrase without -N` |
| Queued (`created_at`) | 2026-10-10T00:12:13.770Z | 2026-10-10T00:14:16.676Z |
| Ran (`started_at` to `completed_at`) | 00:12:14.148Z to 00:12:14.202Z, no prompt | 00:14:16.870Z to 00:14:24.355Z, two prompts answered by the user |
| `status` / `exit_code` | done / 0 | done / 0 |
| `consumed` / `consumed_at` | true / 00:12:16.333Z | true / 00:14:24.389Z |
| `consumed_by` | `inject-handoff-results@Stop` | `inject-handoff-results@Stop` |
| `<id>.claim` | exists: `{"claimed_at":"2026-10-10T00:12:16.332Z","pid":73134,"by":"inject-handoff-results@Stop"}` | exists: `{"claimed_at":"2026-10-10T00:14:24.388Z","pid":73965,"by":"inject-handoff-results@Stop"}` |
| `session_id` | bafdfd7c-d8ff-4987-a367-9a7de0ee7608 | bafdfd7c-d8ff-4987-a367-9a7de0ee7608 |
| stdout save line | `Your identification has been saved in demo-key` | `Your identification has been saved in demo-key2` |
| stdout fingerprint | `SHA256:tRo2SSDnH0yq0HY68gNQYaK8AAofMPwuHDUfGQhMrOg aoforge-73-demo` | `SHA256:wLpZY/4ACNH9emGD6sKKGH8jiNQWy+thmYnWPfChMko aoforge-73-demo-2` |
| Fingerprint recomputed from the `.pub` (node one-liner, public key only) | matches | matches |
| Fingerprint Claude reported (transcript) | matches (record 40, 00:12:18.872Z) | matches (record 54, 00:14:27.306Z) |
| Daemon log (`~/.aoforge/aoforge-watch.log`) | line 4 `[2026-10-10T00:12:14.148Z] INFO dispatching h-c824c40a: ...`; line 5 `[2026-10-10T00:12:14.202Z] INFO completed h-c824c40a status=done exit=0` | line 6 `[2026-10-10T00:14:16.871Z] INFO dispatching h-abe054d2: ssh-keygen -t ed25519 -f demo-key2 -C aoforge-73-demo-2`; line 7 `[2026-10-10T00:14:24.355Z] INFO completed h-abe054d2 status=done exit=0` |
| Delivery path seen | inject-handoff-results@Stop. The command had finished before the turn ended (00:12:16.269Z), so the Stop hook delivered at once (63 ms after the turn's last text). | inject-handoff-results@Stop. The turn ended at 00:14:18.550Z with the command still waiting on the user; the Stop hook held the turn 5.8 s and claimed the result 33 ms after completion. |
| Claude continued without a user prompt | yes | yes |

PostToolUse delivery was not exercised live (Claude made no tool call between queueing and completion in either run), and route-results was not needed. Both are covered by 73-04's and 73-06's tests.

### Transcript records (scratch session `bafdfd7c-d8ff-4987-a367-9a7de0ee7608.jsonl`)

File: `/Users/justin/.claude/projects/-private-tmp-claude-501--Users-justin-dev-aoforge-claude-e5890170-1020-47c9-9d9a-b94d47e13631-scratchpad-aoforge-73-demo/bafdfd7c-d8ff-4987-a367-9a7de0ee7608.jsonl`

| Record | Timestamp | Type / role | What it is | Typed by the user? |
|---|---|---|---|---|
| 9 | 00:12:09.563Z | user, string | the user's request (run 1) | yes; no fingerprint or ssh-keygen output |
| 28 | 00:12:13.775Z | user, tool_result | `PreToolUse:Bash hook error`: gate-interactive deny, queued to daemon pid 70928 | no (tool result) |
| 36 | 00:12:16.269Z | assistant, text | Claude tells the user the command is waiting in the aoforge-watch terminal; turn ends | no |
| 37 | 00:12:16.337Z | user, string, `isMeta: true` | starts `Stop hook feedback:` ... `## Deferred command results`, holds the fingerprint | no: hook-injected Stop feedback |
| 38 | 00:12:16.337Z | attachment `hook_blocking_error` (Stop) | the Stop block carrying the result | no |
| 39 | 00:12:16.338Z | system `stop_hook_summary` | Stop hook summary | no |
| 40 | 00:12:18.872Z | assistant, text | Claude reports `SHA256:tRo2SSDn...` | no |
| 44 | 00:14:13.823Z | user, string | "Run exactly this, unchanged, with no -N flag: ..." (run 2) | yes; no fingerprint or ssh-keygen output |
| 47 | 00:14:16.681Z | user, tool_result | gate-interactive deny, queued to daemon pid 70928 | no (tool result) |
| 49 | 00:14:18.550Z | assistant, text | Claude says the command is waiting in the aoforge-watch terminal; turn ends | no |
| 50 | 00:14:24.393Z | user, string, `isMeta: true` | `Stop hook feedback:` ... `## Deferred command results`, holds the fingerprint | no: hook-injected Stop feedback |
| 51 | 00:14:24.393Z | attachment `hook_blocking_error` (Stop) | the Stop block carrying the result | no |
| 52 | 00:14:24.394Z | system `stop_hook_summary` | Stop hook summary | no |
| 54 | 00:14:27.306Z | assistant, text | Claude reports `SHA256:wLpZY/...` | no |
| 63 | 00:14:30.228Z | user, string | "done" (after the report) | yes; no fingerprint or ssh-keygen output |

The only user-typed messages are records 9, 44 and 63. None contains a fingerprint, randomart or any ssh-keygen output; every record carrying the result is Stop hook feedback (`isMeta: true`) or its attachment and summary.

### No-secret check

- The passphrase was empty in both runs. Run 1 never prompted (Claude passed `-N ""`). In run 2 the user pressed Enter twice in their own terminal; Claude and AOForge typed nothing.
- `rg passphrase` over the done records finds only the gate's reason string and, in `h-abe054d2.json`, ssh-keygen's own prompt text (`Enter passphrase for "demo-key2" (empty for no passphrase):`, `Enter same passphrase again:`), with nothing after either prompt (ssh-keygen does not echo).
- The private keys (`demo-key`, `demo-key2`) were never opened by Claude or the orchestrator; the fingerprints were recomputed from `demo-key.pub` and `demo-key2.pub` only, before deletion.

### Cleanup (done by the orchestrator, re-checked read-only by the executor)

- Demo daemon stopped (`aoforge-watch: stopped`). `aoforge-watch.cjs status` now shows only the restored homelab watcher: pid 74371, started 2026-10-10T00:15:02.262Z, projects `/Users/justin/dev/homelab`, same command as before the demo.
- `demo-key`, `demo-key.pub`, `demo-key2`, `demo-key2.pub` deleted. The demo directory holds only `.aoforge-handoff/` (both done records and claims, pending empty), `.git` and `RUNBOOK.md`; it is scratch, outside the repository.
- The demo's `.claude/settings.local.json` (the local-scope `claude plugin disable aoforge@aocyber`) removed, so the installed plugin is enabled everywhere again.
- The main checkout's `.aoforge-handoff/pending/` is empty (two stray records, h-a362251d and h-8701ab7f, were deleted; see gaps G2 and G3).
- `git status --short` in the repository shows only this SUMMARY and the unrelated untracked `amp`; the TRD changed no repository file.

## Preflight (Task 1 facts)

- Demo directory: `/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/e5890170-1020-47c9-9d9a-b94d47e13631/scratchpad/aoforge-73-demo` (git init; `RUNBOOK.md` with the real paths).
- Demo start (ISO): 2026-10-09T18:39:54Z.
- Installed runtime version before the demo: 3.0.0 (`~/.claude/aoforge/.plugin-version`); the checkout's plugin.json is also 3.0.0.
- Handoff suites: 354 tests, 354 pass, 0 fail, 0 skipped (handoff-e2e, aoforge-watch, watcher-attend, inject-handoff-results, hook-coexistence).
- Daemon state at preflight: running, pid 75982, started 2026-10-09T14:53:56Z, projects `/Users/justin/dev/homelab`: the pre-rename watcher (`node /Users/justin/.claude/devflow/bin/devflow-watch.cjs start --project /Users/justin/dev/homelab --shell /bin/zsh --foreground`, parent pid 1). Not stopped by the executor.
- No handoff was queued by accident at preflight; the main checkout's `.aoforge-handoff/pending` was empty.

## Revert steps (option B)

Option B left nothing global behind except the runtime mirror:

1. `--plugin-dir` applied only to the demo session, and the local-scope disable lived in the demo's `.claude/settings.local.json`, which is deleted. Nothing to undo for the plugin itself.
2. The demo session's `sync-runtime.js` re-mirrored `~/.claude/aoforge/` from the checkout at 2026-10-10T00:11Z (`.plugin-version` 3.0.0, `.plugin-digest` `sha256:2dc11b60...`; the objective 73 modules such as `bin/lib/handoff-results.cjs` are now in the mirror). The next session started with the installed `aoforge@aocyber` 3.0.0 re-mirrors the published bundle by itself because the digest differs. If it does not: `rm ~/.claude/aoforge/.plugin-version`, then start a new session.
3. The homelab watcher is already restored (pid 74371).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Preflight and the demo kit | `node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/hooks/hook-coexistence.test.js` | 0 (354 pass, 0 fail, 0 skipped) | PASS |
| 2: The user runs the TTY command | checkpoint:human-action; resume: option B, Claude continued by itself in both runs, ids h-c824c40a and h-abe054d2 | n/a | PASS |
| 3: Evidence, no-secret check, cleanup | `cat <demo>/.aoforge-handoff/done/h-*.json h-*.claim` (status done, exit 0, consumed true, claim by inject-handoff-results@Stop) | 0 | PASS |
| 3 | `grep -n -E "h-c824c40a\|h-abe054d2" ~/.aoforge/aoforge-watch.log` (dispatching and completed lines for both ids) | 0 | PASS |
| 3 | transcript classification with `node -e` over the scratch session jsonl (result records are Stop hook feedback, `isMeta: true`; user-typed records 9, 44, 63 hold no output) | 0 | PASS |
| 3 | fingerprint recomputed from each `.pub` by the orchestrator equals the done record's and Claude's | 0 | PASS |
| 3 | `ls -la <demo>` (no key files) and `aoforge-watch.cjs status` (only the homelab watcher, pid 74371) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (handoff suites, Task 1) | the five-file `node --test` run above | 0 | PASS |

The TRD changes no repository file, so no per-task gate had changed files to run against; Task 1's suite run on the demo's code is the gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The RUNBOOK needed an explicit "no -N" instruction**
- **Found during:** Task 2, run 1
- **Issue:** Asked to run `ssh-keygen -t ed25519 -f <demo>/demo-key -C aoforge-73-demo`, Claude in terminal B rewrote it to add `-N ""` (and an `ls` guard and a `-lf` fingerprint step), so ssh-keygen never prompted and the user had nothing to answer.
- **Fix:** A second run with the request "Run exactly this, unchanged, with no -N flag: ...". Run 2 prompted twice and the user answered in terminal A.
- **Files modified:** none in the repository (the scratch RUNBOOK flow only)

**2. [Process] Tasks 2 and 3 were carried out by the orchestrator, not this executor**
- Setup (stopping the homelab watcher with `aoforge-watch.cjs stop`, the local-scope disable, opening terminals A and B), evidence collection, fingerprint recomputation and cleanup were done by the orchestrator, per the dispatch. Claude never typed in either terminal. This executor re-read the done records, claims, daemon log and transcript read-only to build the tables above, and did not re-run the demo, start a watcher or run ssh-keygen.

**3. [Process] The runtime mirror was re-mirrored from the checkout**
- The TRD's gotcha expected this only for option A; with option B the `--plugin-dir` session's own `sync-runtime.js` mirrored the checkout into `~/.claude/aoforge/` at 00:11Z. Recorded in the revert steps.

**4. [Process] A stray pending record from this executor's own search**
- `rg -n "without -N|ssh-keygen" .../gate-interactive.js` in the main checkout was gated (gap G3) and queued `h-8701ab7f`; no watcher serves this checkout, so it never ran. The record was deleted.

### Deferred: new gaps for verify-work and gap closure (no fix in this TRD)

**G1. The ssh-keygen TTY pattern has no exemption for modes that never prompt, and its reason misleads.** `plugins/aoforge/hooks/gate-interactive.js:108` is `` `${CMD_POS}ssh-keygen\\b(?!.*\\s-N\\s)` ``. In run 1 the command carried `-N ""` on the generating call; the match was the trailing `&& ssh-keygen -lf demo-key.pub` (index 90), which has no `-N` after it. The reason then reads "prompts for a passphrase without -N" on a command that has `-N`. Checked by evaluating the gate's regex on the demo commands: `-N ""` alone does not match; `-lf <file>.pub` alone matches.

**G2. `ssh-keygen -lf <file>.pub` (fingerprint only) is gated.** The same root cause as G1. When the orchestrator ran it in the main checkout it left a stray pending record, `.aoforge-handoff/pending/h-a362251d.json`, which the orchestrator deleted. Read-only modes (`-l`, `-F`, `-R`, and `-y` on an unencrypted key) need an exemption.

**G3. gate-interactive matches inside quoted arguments.** `CMD_POS` (`gate-interactive.js:54`) counts `|` as a command position, so the alternation in `rg -n "without -N|ssh-keygen" <file>` is read as a pipe into ssh-keygen, and the search was gated (`h-8701ab7f`, deleted). gate-commits strips heredoc bodies and quoted arguments before matching (TRD 27-04); gate-interactive does not.

**G4. The model pre-answers prompts with flags.** Run 1 shows Claude may add `-N ""` (or similar) on its own, which removes the prompt the handoff exists for. This is behaviour, not a code bug; demos and docs should say so (input for 73-08).

**Prior follow-ups still open:** `✗ exit ?` shown for a result with no exit code; keys typed between commands go to the next command (73-08 documents it); MA-6 (doctl) unchanged. The optional doctl run (gap 1 on a real TUI) was not done.

## Discovered commands

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (the live detection-to-context run with the user answering; the evidence recorded from the done record, daemon log, transcript and fingerprint; no secret typed, read or recorded by AOForge; the machine left as it was with revert steps given)
- Gate failures: None
- SC-3 / HND-03: met (run 2)

## Self-Check: PASSED

- FOUND: `<demo>/.aoforge-handoff/done/h-c824c40a.json` and `.claim`, `h-abe054d2.json` and `.claim`
- FOUND: daemon log lines 4-7 for both ids
- FOUND: transcript records 28, 37, 40, 47, 50, 54
- MISSING as intended: `demo-key`, `demo-key.pub`, `demo-key2`, `demo-key2.pub`
- Demo daemon not running; homelab watcher pid 74371 running; both pending queues empty
- No task commits to check (no repository file changed)
