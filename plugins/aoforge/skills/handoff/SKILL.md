---
name: handoff
description: |
  Hand off a TTY-required or shell-env-dependent command to the user's shell.
  Use for auth flows (gh auth login, doctl auth init, npm login) or shell-init commands (nvm/mise/conda activate, direnv). Non-disruptive when aoforge-watch is running.
  Triggers on: "auth init", "log in to", "needs my password", "needs my shell environment".
argument-hint: <command to run interactively or via user shell>
allowed-tools:
  - Bash
  - Write
  - AskUserQuestion
---
<objective>
Route a command that needs the user's shell — either because it requires a TTY (auth flows, password prompts) or because it depends on the user's interactive shell env (aliases, mise/nvm/conda activations, sourced rc files) — through that shell without losing session context.

Use this when:
- A command will prompt for credentials, a token, a passphrase, or open a browser flow
- A command depends on shell-init state Claude's sub-shell doesn't have (nvm, mise, conda, direnv, pyenv, asdf, rbenv)
- A previous Bash attempt was denied by `gate-interactive.js` (PreToolUse hook)
- You want to pre-empt the friction before the harness fights an interactive prompt

Out of scope: commands that can run non-interactively via flags or env vars (e.g. `gh auth login --with-token < tokenfile`). Prefer the non-interactive form when available.

## Triggers

Triggers on: "auth init", "log in to", "interactive command", "needs my password", "I need to paste a token", "needs my shell environment", "nvm/mise/conda activate".

When the aoforge-watch daemon is running, the handoff is fully non-disruptive — Claude continues executing while the daemon runs the command in the user's aoforge-watch terminal (where the user answers any prompt), and the result comes back by itself: after Claude's next tool call, when Claude ends its turn, or at the latest on the user's next prompt.
</objective>

<execution_context>
$ARGUMENTS
</execution_context>

<process>

<step name="detect_watcher_mode">
This skill behaves differently based on whether the `aoforge-watch` daemon is running:

```bash
node ~/.claude/aoforge/bin/aoforge-watch.cjs status
```

The status JSON has a `running: true|false` field. Branch on that for the next steps.

- If `running: true` → **Approach B (non-disruptive)**: write pending record, tell the user in one line where it waits, continue with other work; the result arrives by itself (see branch_b_continue).
- If `running: false` → **Approach A (paste-driven)**: write pending record AND instruct user to paste `! cmd`.
</step>

<step name="record_pending">
Write a pending handoff record:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs handoff create "$ARGUMENTS"
```

The command returns JSON with `{id, path, record}`. Capture the `id`.

If aof-tools is unavailable, fall back to writing the record manually:

```bash
mkdir -p .aoforge-handoff/pending
id="h-$(date +%s)-$RANDOM"
cat > ".aoforge-handoff/pending/${id}.json" <<EOF
{"id":"${id}","cmd":"$ARGUMENTS","cwd":"$(pwd)","status":"pending","source":"hook","created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
echo "$id"
```
</step>

<step name="branch_a_paste">
**ONLY when watcher is NOT running.**

Print the user-facing instruction in a single short message. Use this exact shape so the user can copy with one click:

```
I need to run this in your shell. Please paste:

! $ARGUMENTS

(The `!` prefix runs it in your shell — output returns inline and I'll continue from there. Tip: run `aoforge-watch start` once to skip this paste step in future.)
```

Do not retry the command via the Bash tool. Wait for the user's next message containing the command's output.
</step>

<step name="branch_b_continue">
**ONLY when watcher IS running.**

The daemon will pick up the pending record from `.aoforge-handoff/pending/<id>.json` and run it in the user's shell. When the daemon was started attended (`aoforge-watch start --foreground` in a terminal), the command's live output appears in that aoforge-watch terminal and the user answers its prompt there; Ctrl+C there interrupts the command. The daemon writes the result to `.aoforge-handoff/done/<id>.json`, and it reaches you once, with no paste, at the first of these:

- **after your next tool call**: `inject-handoff-results.js` (PostToolUse) adds it as `additionalContext`;
- **when you end your turn**: `inject-handoff-results.js` (Stop) blocks the stop with the result and tells you to continue. If the command is still running, it waits up to 120 s for it;
- **on the user's next prompt**: `route-results.js` (UserPromptSubmit), the catch-all, adds whatever is still undelivered.

What you should do RIGHT NOW:
1. Tell the user in one line that the command is waiting in their aoforge-watch terminal: e.g. `"\`gh auth login\` is waiting in your aoforge-watch terminal (handoff h-abc123); answer its prompt there. Continuing with other work."`
2. **Do NOT instruct the user to paste anything.**
3. **Do NOT retry the Bash tool for this command.**
4. **Do NOT pre-answer the prompt** by adding a flag the user did not ask for (such as an empty passphrase); the handoff exists so the user answers it.
5. Continue with any non-blocking work you can do without the result. If there is none, end your turn: the result arrives at the end of the turn.
6. When the result arrives, pick up whatever depended on this command.
</step>

<step name="resume">
When the result arrives:

- **Approach B** (most common when watcher is running): the result arrives under `## Deferred command results`, as `additionalContext` after a tool call or on the user's next prompt, or as Stop hook feedback when you ended your turn. Read the stdout/stderr/exit_code, validate success, and continue the deferred work. On a bash or zsh daemon the command's stderr is inside its stdout. A header of `✗ exit ?` means the record has no exit code: judge success from its status and output.
- **Approach A** (fallback): the result is in the user's message body (whatever the harness echoed back from `! cmd`). Same continuation logic.

In either case:
1. Read the output as if you had run the command yourself
2. Continue with whatever follow-on work was queued (e.g. for `doctl auth init`, the next step would be `doctl account get` or `doctl apps list`)
3. If the command failed (`exit_code != 0`) or was cancelled, never retry it silently. Ask with AskUserQuestion:

   ```
   AskUserQuestion([
     {
       header: "Handoff",
       question: "`{cmd}` failed (exit {exit_code}) or was cancelled. What next?",
       multiSelect: false,
       options: [
         { label: "Retry", description: "Hand the command off again from record_pending" },
         { label: "Run it myself", description: "You paste `! {cmd}` and I continue from its output" },
         { label: "Stop", description: "Drop it and continue without the result" }
       ]
     }
   ])
   ```

   On "Retry", go back to record_pending with the same command. On "Run it myself", print the Approach A paste
   instruction. On "Stop", report what could not run and carry on with what does not depend on it.
4. If the daemon **rejected** the command (status: rejected), do NOT retry — the allowlist excluded it. Ask with
   AskUserQuestion, which offers no Retry:

   ```
   AskUserQuestion([
     {
       header: "Handoff",
       question: "The aoforge-watch allowlist rejected `{cmd}`. How do you want to run it?",
       multiSelect: false,
       options: [
         { label: "Run it myself (Recommended)", description: "You paste `! {cmd}` and I continue from its output" },
         { label: "Extend allowlist", description: "You add it to ~/.aoforge/aoforge-watch-allow.json; I do not retry it" }
       ]
     }
   ])
   ```

   On "Run it myself", print the Approach A paste instruction. On "Extend allowlist", say where the file is and stop:
   a new handoff is the user's call once the pattern is added.

</step>

</process>

<success_criteria>
- [ ] Pending handoff record written to `.aoforge-handoff/pending/<id>.json`
- [ ] Watcher-on path: user gets one line saying the command waits in their aoforge-watch terminal, no paste instruction, no Bash retry
- [ ] Watcher-off path: user receives a one-line copy-paste instruction
- [ ] Session continues from the captured output without the user retyping context
- [ ] No wasted Bash retries against the interactive/shell-flow command
</success_criteria>
