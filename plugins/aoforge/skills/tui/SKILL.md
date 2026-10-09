---
name: tui
description: |
  Open the program-aware TUI viewer — read-only terminal UI showing parallel sessions, org tree, and active initiatives in three stacked panels. tmux-safe; reflows narrow terminals.
  Triggers on: "open tui", "show tui", "what's running across sessions", "show org tree".
argument-hint: "[--once] [--raw] [--no-color] [--reset-only]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Open the program-aware TUI viewer (`aof-tools tui`). Read-only; composes obj 2 peer awareness + obj 5 initiatives + obj 2 cached org chain into a 3-panel stacked terminal view.

Modes:

- **Default (interactive):** opens alternate-screen, hides cursor, enters raw mode. `r` re-fetches data and re-renders. `q` (or Ctrl-C) exits cleanly with terminal state restored.
- **`--once`:** renders once + exits without entering raw mode. Useful when you want a snapshot but not an interactive session.
- **`--raw`:** renders once + writes ANSI to stdout WITHOUT entering alternate screen. Pipe-friendly. Implies `--once`.
- **`--no-color`:** strips foreground color codes (keeps box drawing + cursor positioning). Useful in pipelines that re-render the output.
- **`--reset-only`:** recovery hatch. Emits cursor-show + alt-screen-leave + SGR-reset escapes then exits. Use after a previous TUI session was killed -9 (terminal state stuck).

Auto-fallback: when stdout is non-TTY (piped, redirected, running in a non-interactive environment), `aof-tools tui` automatically switches to `--once --raw` mode.

Locked v1.1 limitations: read-only (no mutations), manual refresh only (no auto-poll), 3 stacked panels (no multi-pane layouts), `r` and `q` are the only keystrokes accepted.

Composes obj 1 (gh chain) + obj 2 (peer awareness) + obj 5 (initiatives) + obj 6 (todo aggregation cache) into a single screen.
</objective>

<execution_context>
@.aoforge/STATE.md
</execution_context>

<process>
**Run the TUI CLI with arg passthrough:**

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs tui $ARGUMENTS
```

The CLI:

1. Parses flags: `--once`, `--raw`, `--no-color`, `--reset-only`.
2. Detects TTY: non-TTY stdout/stdin auto-falls back to `--once --raw` (warning to stderr).
3. Loads data from existing sources (no new fetchers): obj 2 `readCache(cwd)` for peer + cached org sections; obj 5 `loadInitiatives({})` for global initiatives home.
4. For interactive mode: writes alt-screen + hide-cursor escapes; registers cleanup on `process.on('exit')` + SIGINT + SIGTERM; enters raw mode; renders; awaits keystrokes.
5. For one-shot/raw mode: renders to stdout once + exits 0.

**After the command runs:**

- If invoked from chat (non-TTY context): the output is rendered ANSI; present it in a code block so it preserves verbatim. Do NOT summarize the panels — the user wants the structured view, not a paraphrase.
- If invoked from an interactive terminal: control returns when the user presses `q` or Ctrl-C. The user has already seen the TUI; no further presentation needed.

If the user reports their terminal is "stuck" (cursor missing, screen weird) after a previous TUI session: run `node ~/.claude/aoforge/bin/aof-tools.cjs tui --reset-only`.
</process>

<context>
The TUI is a read-only viewer. To act on anything visible:

- **Peer sessions** — `git checkout <branch>` to switch to a peer's work, or `gh issue view <issue>` for the GH context.
- **Initiatives** — `/aoforge:initiatives show <slug>` to see the full initiative body (Why, Open Questions, Sub-issues).
- **Org tree entries** — `gh issue view <issue>` for the upstream tracking issue.

Locked v1.1 decisions (relevant to user expectations):

- Hand-rolled ANSI rendering (no TUI library dependency); ~600-line render module.
- Refresh model: manual only (`r` keypress); no auto-poll. By design — eliminates flicker + battery drain in idle terminals.
- Snapshot-tested: every render scenario has a committed expected ANSI fixture; pure-function renderer is deterministic.
- Future TUI features (selection, drill-down, mutations) are explicitly v1.2+ scope.

Subcommand options:

- `aof-tools tui` — interactive mode (default).
- `aof-tools tui --once` — render once, exit cleanly. No alt-screen, no raw mode.
- `aof-tools tui --raw` — render once, write ANSI to stdout. Pipe-friendly. Implies `--once`.
- `aof-tools tui --no-color` — strip foreground color codes. Useful with `--raw` for pipelines.
- `aof-tools tui --reset-only` — emit recovery escapes (cursor-show + alt-screen-leave + SGR-reset). Use after a killed session.

Requires obj 2 awareness cache (`/aoforge:awareness scan-peer`) and obj 5 initiatives (`/aoforge:initiatives sync`) for the richest view. With neither cached, the TUI still renders — it just shows "(no peer sessions)" / "(no org context)" / "(no initiatives)" placeholders. Never crashes (SC-8 resilience).

## Triggers

Use when the user wants to see what's happening across parallel sessions, get a high-level view of the program/initiative landscape, or visualize where their current work sits in the org. Also fires on: "show tui", "program viewer", "show peer sessions", "what's everyone working on", "tui viewer".
</context>
