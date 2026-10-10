---
title: "The handoff watcher"
weight: 30
lede: "A local daemon that runs TTY-bound commands in your shell so Claude never has to stop and ask."
---

Some commands cannot run in an agent's non-interactive Bash. Without a mechanism,
Claude has to stop and ask you to paste `! cmd`, which breaks both its flow and
your concentration.

`aoforge-watch` is a small local daemon that closes that loop.

## Quick start

```bash
aoforge-watch start --foreground   # in a terminal you keep open: the attended terminal
aoforge-watch status               # verify (from another terminal)
aoforge-watch stop
```

That is the whole setup. From then on, when Claude tries to run something on the
allowlist, the `gate-interactive` hook queues it instead of failing, and Claude
tells you in one line that it is waiting in your aoforge-watch terminal. The
daemon runs it there, you answer its prompt there, and the result reaches Claude
by itself: after Claude's next tool call, when Claude ends its turn, or at the
latest on your next prompt.

## What gets intercepted

**TTY-interactive auth flows** — cloud and registry CLIs whose login is a browser
or prompt flow: DigitalOcean, GitHub, Google Cloud, AWS (including SSO),
1Password, npm, Vault.

**Password and passphrase prompts** — `passwd`, `ssh-keygen` without `-N ""`.

**Shell-flow tools** that depend on aliases, sourced rc files or shimmed shell
sessions — `nvm use`, `nvm install`, `pyenv shell`, `pyenv install`,
`conda activate`, `direnv exec`, `direnv allow`, `mise use`, `mise install`,
`mise run`, `asdf shell`, `asdf install`, `rbenv shell`.

## How it flows

```text
Claude runs a gated command (gate-interactive, PreToolUse Bash)
        │
        ▼
gate-interactive denies the Bash call
  → writes .aoforge-handoff/pending/<id>.json with the session and agent that asked
  → Claude tells you the command is waiting in your aoforge-watch terminal
        │
        ▼
aoforge-watch (started with `start --foreground` in a terminal: attended)
  → shows the command's live output there; you answer its prompt there
    (Ctrl+C interrupts the command, the daemon keeps running)
  → writes .aoforge-handoff/done/<id>.json
        │
        ▼
the result reaches Claude, once, with no paste:
  → after Claude's next tool call (inject-handoff-results, PostToolUse), or
  → when Claude ends its turn (inject-handoff-results, Stop; it waits up to
    120 s while the command is still running), or
  → on your next prompt (route-results, the catch-all)
```

A result goes to the session and agent that queued it, and only once: the hook
that claims it first delivers it. In the attended terminal each command is
framed by a start line with its id and the terminal bell, and an end line such as
`[aoforge-watch] <id> finished: done (exit 0)`. The daemon never types, logs or
stores what you type.

## Without the daemon

Everything still works, just with one manual step. `gate-interactive` prints the
command for you to run with `! cmd`, and Claude picks up the output inline. The
value even in this mode is that Claude recognises which commands need a shell and
does not waste a turn discovering it by failing.

## Configuration

```json
{
  "daemon": {
    "notifications": false,
    "notify_on_start": true,
    "notify_on_complete": true,
    "auto_launch": false,
    "multi_project": false,
    "cross_shell": [],
    "status_line": false
  }
}
```

| Variable | Effect |
|---|---|
| `AOFORGE_WATCH_ALLOW_FILE` | Path to a custom allowlist |
| `AOFORGE_WATCH_UNATTENDED=1` | Run the daemon unattended even in a terminal (same as `--no-attend`) |
| `AOFORGE_HANDOFF_PID_FILE` | Override the PID file location |
| `AOFORGE_HANDOFF_RESULT_TTL_MS` | How long an unconsumed result stays valid (default one hour) |
| `AOFORGE_HANDOFF_STOP_WAIT_MS` | How long the Stop hook waits for a running command (default `120000`; `0` disables the wait) |
| `AOFORGE_SKIP_HANDOFF_INJECT=1` | No delivery after a tool call or at the end of a turn; results wait for the next prompt |
| `AOFORGE_SKIP_HANDOFF_RESULTS=1` | No handoff delivery at all |
| `AOFORGE_SKIP_INTERACTIVE_GATE=1` | Disable interception entirely |

The hook variables are read by Claude Code's hooks: set them in the environment
Claude Code is launched from.

### Attended and unattended

`aoforge-watch start --foreground` run in a terminal (stdin and stdout are both
terminals) is attended: a queued command's live output appears there and the keys
you type there go to the command, so you answer its prompt yourself. Ctrl+C during
a command ends the command with exit 130 and the daemon keeps serving; between
commands Ctrl+C stops the daemon.

The detached `aoforge-watch start`, a launchd or systemd unit, `--no-attend`,
`AOFORGE_WATCH_UNATTENDED=1` or piped stdio run unattended: commands run with no
terminal for you to answer in. Use the attended terminal for anything that asks
for input. If the daemon's shell dies, the next command gets a new one (the log
says `respawned shell`).

### Allowlist and deny list

The allowlist is curated rather than open — the daemon runs commands in *your*
shell, so what it will accept is a security boundary, not a convenience setting.
Extend it with your own patterns via `AOFORGE_WATCH_ALLOW_FILE`. A deny list takes
precedence over the allowlist.

### Auto-launch

The daemon can install itself as a launchd (macOS) or systemd (Linux) unit so it
starts with your session:

```bash
aoforge-watch install
aoforge-watch uninstall
```

### Multi-project

One daemon can watch several projects, added and removed while it runs.
`aoforge-watch status` shows all watched projects with per-project pending and
done counts.

## Known limitations

- **fish and PowerShell** daemons keep the old command wrapper: a command there
  still sees files instead of a terminal on its output, and one that reads input
  can swallow the daemon's own lines. bash and zsh have the fixes.
- On a bash or zsh daemon a command's **stderr arrives with its stdout** (both are
  the terminal), and the result's stderr is empty.
- **No echo:** what you type is not shown unless the tool turns echo on itself.
- **Typeahead:** keys typed while no command runs go to the next command. Type
  nothing between commands.
- The command's terminal is **80x24** whatever the size of yours.
- During a command Ctrl+C goes to the command; stop the daemon with
  `aoforge-watch stop` from another terminal.
- **`sudo`** stays refused by the daemon's deny list.
- **Subagents:** a subagent's result reaches it on its next tool call, else your
  next prompt. The Stop wait is for the main conversation only.
- A result with no exit code (written by `aof-tools handoff complete` without
  `--exit-code`) is titled **`✗ exit ?`**, even when it succeeded.
- **Claude may answer the prompt with a flag**, such as `ssh-keygen -N ""` for an
  empty passphrase, and the command never prompts. Ask for the command exactly as
  written when you want to answer it yourself.

{{< callout title="A known gap" type="warn" >}}
`gate-interactive` matches against the raw command string, so a Bash call whose
*payload* mentions a gated command — a heredoc writing documentation about
`aws sso login`, say — can be intercepted even though nothing interactive would
run.

`gate-commits` solved this class of problem with invocation-aware detection that
strips heredoc bodies and quoted arguments before matching.
`gate-interactive` does not yet do the same: `rg "a|ssh-keygen" file` reads as a
pipe into `ssh-keygen`. It also gates `ssh-keygen -lf key.pub`, which only prints
a fingerprint and never prompts. A false positive is queued like a real one; with
no daemon serving the project, delete its record from
`.aoforge-handoff/pending/`. If you hit it, the escape hatch is
`AOFORGE_SKIP_INTERACTIVE_GATE=1`.
{{< /callout >}}
