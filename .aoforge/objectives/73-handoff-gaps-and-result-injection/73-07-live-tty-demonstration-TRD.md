---
objective: 73-handoff-gaps-and-result-injection
trd: "07"
type: standard
wave: 4
depends_on: ["73-05", "73-06"]
files_modified: []
autonomous: false
requirements: [HND-03]
must_haves:
  truths:
    - "With aoforge-watch running from this checkout in the user's own terminal and a Claude Code session running this checkout's plugin in a scratch project, a TTY-required command asked for in that session (`ssh-keygen`, which prompts for a passphrase) is denied and queued by gate-interactive, shows its prompt in the aoforge-watch terminal, is answered there by the user, and its result reaches Claude's context with no paste"
    - "The evidence is recorded in the SUMMARY: the done record (status done, exit 0, consumed true, consumed_by naming the hook that delivered it, the session_id), the daemon log lines for that handoff id, the scratch session transcript showing the result arriving as hook context and not as a user message, and the fingerprint Claude reported equal to the one computed from the public key"
    - "AOForge never types, reads or records a secret: the only input to the command is the user's own keystrokes in their terminal (an empty passphrase), the private key file is never read, and it is deleted at cleanup"
    - "The machine is left as it was: the demo daemon stopped, the key pair deleted, and the user given the exact steps to return to the published plugin build"
  artifacts: []
  key_links:
    - from: "gate-interactive deny (scratch session)"
      to: "aoforge-watch attended terminal"
      via: ".aoforge-handoff/pending/<id>.json picked up by the checkout daemon"
      pattern: "dispatching h-"
    - from: ".aoforge-handoff/done/<id>.json"
      to: "Claude's context in the scratch session"
      via: "inject-handoff-results.js (PostToolUse or Stop), or route-results.js on the next prompt"
      pattern: "Deferred command results"
---

# TRD 73-07: Live demonstration, a TTY command from detection to the user's terminal to Claude's context

<objective>
SC-3: "With the aoforge-watch daemon running, a TTY-required command (auth login, token paste or sudo prompt) is
detected, handed off, run by the user, and its result appears in context. The live run is a user checkpoint and AOForge
never types or reads a secret."

The tests in 73-01 to 73-06 prove each piece, including 73-05's PTY test that plays the user. This TRD runs the real
thing once, with the user at the keyboard: a real Claude Code session, the real gate, the real daemon in the user's
terminal, a real prompt answered by a person, and the result arriving in the session by itself.

The command is `ssh-keygen -t ed25519 -f <demo>/demo-key -C aoforge-73-demo`. It is on gate-interactive's TTY list and
the daemon's default allowlist, it reads its passphrase from the terminal (the class of prompt gap 2 broke: under the
old wrapper the passphrase read swallowed a wrapper line), and the user answers it with an empty passphrase, so there is
no secret to handle at all. Its output (a fingerprint and randomart) is public. `sudo` is not used: the daemon's deny list
refuses it by design (objective 19, locked decision 6). An optional second run shows gap 1 closing on `doctl auth init`
against a local mock on port 8091 with a fake token.

The run needs this checkout's code in two places the installed 3.0.0 plugin cannot provide: the daemon (run straight from
the checkout) and the session's hooks (the checkout's plugin loaded for the scratch session). Loading the plugin is a
user action in Claude Code; the steps are below.

Purpose: HND-03 / SC-3. Output: evidence in the SUMMARY; nothing in the repo changes.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
@~/.claude/aoforge/references/checkpoints.md
</execution_context>

<context>
Locked constraints (from the objective's planning context; do not revisit):
- The user runs the TTY command in their own shell. AOForge never types or reads a secret and never enters
  credentials. Record only non-secret output.
- Never use port 8080. The optional mock server uses 8091.
- No release, tag, push or deploy. Loading the checkout's plugin locally is reversible and is the user's own action.

Read narrowly:
- The SUMMARYs of 73-04 (delivery points, Stop wait), 73-05 (attended mode, `--no-attend`, startup lines) and 73-06
  (registration).
- `docs/USER-GUIDE.md` section "Trying a Local Checkout of AOForge" (the documented, reversible way to load the checkout).
- `plugins/aoforge/aoforge/bin/aoforge-watch.cjs` header (subcommands, `status`, `stop`, log path `~/.aoforge/aoforge-watch.log`).
</context>

<embedded_context>

<codebase_examples>
Paths used below. `<checkout>` is `/Users/justin/dev/aoforge-claude`. `<demo>` is a scratch directory the executor
creates and prints in full.

The demo daemon, run by the user in terminal A (attended because it owns a terminal):
```bash
node /Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/aoforge-watch.cjs start --foreground --project <demo>
```
The fingerprint, computed from the public key without `ssh-keygen` (a plain `ssh-keygen -l` is itself caught by
gate-interactive, because the pattern only exempts `-N`):
```bash
node -e "const [,b]=require('fs').readFileSync(process.argv[1],'utf8').trim().split(/\s+/);console.log('SHA256:'+require('crypto').createHash('sha256').update(Buffer.from(b,'base64')).digest('base64').replace(/=+$/,''))" <demo>/demo-key.pub
```
The scratch session's transcripts live in `~/.claude/projects/<key>/*.jsonl`, where `<key>` is `<demo>`'s absolute path
with every `/` and `.` replaced by `-` (this repo's key is `-Users-justin-dev-aoforge-claude`). If the directory is not
found by that rule, list `~/.claude/projects/` and pick the entry ending in the demo directory's basename.
</codebase_examples>

<anti_patterns>
- Do not type into the user's terminal, answer the prompt, or start the daemon for the user. The user's hands are the
  point of SC-3.
- Do not read `<demo>/demo-key` (the private key). Only `demo-key.pub`.
- Do not run the checkout's plugin beside the installed one in the same session: gate-interactive would run twice,
  queue the command twice, and the user would be prompted twice.
- Do not stop a daemon you did not see started for this demo (check `status`: its `projects` must be `<demo>`).
- Do not commit anything; this TRD changes no repo file.
</anti_patterns>

<error_recovery>
- The result never reaches Claude: collect, without fixing anything, the pending and done directories of `<demo>`, the
  daemon log lines for the id, and the transcript lines around the gate's deny. Record it as a failed demonstration in
  the SUMMARY with that evidence; verify-work turns it into a gap-closure plan.
- aoforge-watch refuses to start (`already running`): another daemon owns the pid file. Ask the user to stop it
  (`aoforge-watch stop`), or to tell you to.
- The scratch session still runs 3.0.0's hooks (its gate reason says "inject the result into your next turn
  automatically"): the plugin was not reloaded. Use option C below and record that the delivery path seen was
  route-results.
</error_recovery>

</embedded_context>

<gotchas>
- The daemon defaults to `$SHELL` (zsh here). 73-01 required zsh coverage for exactly this run.
- With the checkout plugin installed through the marketplace path, `sync-runtime.js` re-mirrors `~/.claude/aoforge/`
  from the checkout at the next session start; this repo's own session keeps working (same major), and the revert
  re-mirrors 3.0.0.
- The Stop hook waits up to 120 s for a running handoff; if the user takes longer, the result arrives on their next
  prompt through route-results (still no paste). Record which path was seen.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Preflight and the demo kit</name>
  <files>(none in the repo; creates the scratch demo directory)</files>
  <action>
1. Run the handoff suites and confirm they are green with no gap skips:
   `node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/hooks/hook-coexistence.test.js`.
2. `node plugins/aoforge/aoforge/bin/aoforge-watch.cjs status`: record `running`. If a daemon is running, do not stop
   it; the checkpoint asks the user to.
3. Create `<demo>` under your scratchpad directory (print its absolute path), `git init` it, and write
   `<demo>/RUNBOOK.md` containing Task 2's steps with the real paths filled in. The runbook is input for the user, not a
   report.
4. Note the installed runtime version (`cat ~/.claude/aoforge/.plugin-version`) for the SUMMARY.
5. Record the time (ISO) as the demo start, for finding the transcript later.
  </action>
  <verify>the listed suites exit 0 with no skips on gaps; `<demo>/RUNBOOK.md` exists and names the real paths</verify>
  <done>The code is green, the demo directory and runbook exist, and the daemon state is known.</done>
  <recovery>If a suite fails, stop here and report the failure; a demo on red code proves nothing.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: The user runs the TTY command through aoforge-watch</name>
  <action>Load this checkout's plugin for a scratch session, start aoforge-watch from the checkout in your own terminal, ask Claude in the scratch session to run the ssh-keygen command, and answer its passphrase prompt (empty) in the aoforge-watch terminal. Claude has automated everything else; answering a prompt in your own terminal and loading a plugin in Claude Code have no CLI the executor may use on your behalf.</action>
  <instructions>
Already done by the executor: the handoff suites are green, `<demo>` and `<demo>/RUNBOOK.md` exist, and the daemon
state is known. Built by objective 73: the three PTY gaps closed (73-01, 73-03), results delivered after the next tool
call or at the end of the turn (73-04, 73-06), and an attended aoforge-watch terminal where you answer a queued
command's prompt (73-05).

Steps (also in `<demo>/RUNBOOK.md`):

0. If `aoforge-watch status` showed a running daemon, stop it first: `aoforge-watch stop`.
1. Load this checkout's plugin for the demo session. Pick one:
   - A (documented, reversible): USER-GUIDE "Trying a Local Checkout of AOForge", steps 0-1:
     `/plugin marketplace remove aocyber`, `/plugin marketplace add /Users/justin/dev/aoforge-claude`,
     `/plugin install aoforge@aocyber`, then in a terminal `rm ~/.claude/aoforge/.plugin-version`, and quit that session.
   - B (if your Claude Code has `--plugin-dir`): disable `aoforge@aocyber`, then start step 3's session with
     `claude --plugin-dir /Users/justin/dev/aoforge-claude/plugins/aoforge`. Never run both copies at once.
   - C (no plugin change): keep 3.0.0. The daemon is still the checkout's, but the result then arrives only on your
     next prompt (type `continue`), through 3.0.0's route-results.
2. Terminal A: `node /Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/aoforge-watch.cjs start --foreground --project <demo>`.
   It should print a line containing `attended`.
3. Terminal B: `cd <demo> && claude` (with step 1's plugin), and send:
   "Run `ssh-keygen -t ed25519 -f <demo>/demo-key -C aoforge-73-demo`, then tell me the key's SHA256 fingerprint."
4. Claude's Bash call is denied and queued, and Claude says the command is waiting in your aoforge-watch terminal. In
   terminal A the prompt `Enter passphrase (empty for no passphrase):` appears. Press Enter, then Enter again at
   `Enter same passphrase again:`. Type nothing else and no real secret.
5. In terminal B, type nothing. Watch for Claude to continue by itself and report the fingerprint (it arrives after
   Claude's next tool call, or the end-of-turn hook holds the turn for up to 2 minutes until it lands).
6. Leave terminal A running; the executor stops it at cleanup.

Optional, gap 1 on a real TUI (skip unless you want it): in a third terminal run
`node -e "require('/Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/__fixtures__/mock-auth-servers.cjs').mockDoctlServer().listen(8091,'127.0.0.1')"`,
then ask Claude in terminal B to run `doctl auth init --context aoforge-73-demo --api-url http://127.0.0.1:8091`, and
in terminal A type the fake token `aoforge-73-demo-not-a-secret` at doctl's prompt. Afterwards run
`doctl auth remove --context aoforge-73-demo` yourself.
  </instructions>
  <verification>Afterwards the executor checks, without any input from you: `<demo>/.aoforge-handoff/done/<id>.json` is status done, exit 0, consumed; the daemon log has the dispatch and completion lines; the scratch session transcript shows the result arriving as hook context; the fingerprint matches the public key (Task 3).</verification>
  <resume-signal>Reply `done`, with: the option you used in step 1 (A, B or C); whether Claude continued by itself or
needed a prompt from you; the handoff id Claude mentioned; anything unexpected. Or reply `failed: <what happened>`.
Do not paste any secret; this demo has none.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Evidence, the no-secret check, cleanup and revert steps</name>
  <files>(none in the repo; deletes the demo key pair)</files>
  <action>
1. Done record: read `<demo>/.aoforge-handoff/done/<id>.json`. Record `status`, `exit_code`, `consumed`,
   `consumed_by`, `session_id`, `completed_at`, `consumed_at`, and confirm `<id>.claim` exists. Quote from stdout only
   the line `Your identification has been saved in ...` and the `SHA256:` fingerprint line.
2. Fingerprint: compute it from `<demo>/demo-key.pub` with the node one-liner and compare it with the done record's and
   with what Claude reported (from the user's reply or the transcript).
3. Daemon log: the `dispatching <id>` and `completed <id> status=done exit=0` lines from `~/.aoforge/aoforge-watch.log`.
4. Transcript: in the scratch session's newest `*.jsonl` after the demo start, find the records holding the handoff id
   and `Deferred command results`. Record each one's type and role, and whether it is hook-injected context (a
   PostToolUse hook context, or Stop hook feedback) rather than text the user typed. Assert that no user-typed message
   contains the fingerprint or the ssh-keygen output.
5. No-secret check: the passphrase was empty; `rg -n "passphrase" <done record>` shows only ssh-keygen's own prompt
   text, if any; the private key was never opened.
6. Cleanup: `node /Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/aoforge-watch.cjs status`; if its
   `projects` is `<demo>`, run `... aoforge-watch.cjs stop`. Delete `<demo>/demo-key` and `<demo>/demo-key.pub`.
7. Write the SUMMARY evidence table (each item above, with the delivery path seen: inject-handoff-results@PostToolUse,
   @Stop, or route-results) and the revert steps for the user when option A or B was used (USER-GUIDE "Trying a Local
   Checkout", step 4: `/plugin marketplace remove aocyber`, `/plugin marketplace add AO-Cyber-Systems/aoforge-claude`,
   `/plugin install aoforge@aocyber`, re-enable what was enabled, `rm ~/.claude/aoforge/.plugin-version`, new session).
  </action>
  <verify>the done record shows status done, exit 0, consumed true; the computed fingerprint equals the recorded one; the transcript shows the result as hook context; the demo daemon is stopped and the key pair deleted</verify>
  <done>SC-3 is demonstrated with evidence, no secret was handled, and the machine is back to its prior state apart from the user's plugin revert (listed for them).</done>
  <recovery>If the user replied `failed`, do steps 1, 3, 4 and 6 for whatever exists, record the failure with that evidence, and leave SC-3 unmet for verify-work.</recovery>
</task>

</tasks>

<verification>
- The SUMMARY's evidence table has every row of Task 3 with values, and names the delivery path.
- `git status --short` in the repo shows no change made by this TRD.
</verification>

<success_criteria>
- A TTY command went from detection to the user's terminal to Claude's context with the user answering the prompt
  and no paste: SC-3 / HND-03.
- No secret was typed, read or stored by AOForge.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-07-SUMMARY.md` (through
`aof-tools summary post`) with the evidence table and the revert steps.
</output>
