---
title: "Telemetry and auditing"
weight: 50
lede: "Measuring where context goes, where agents get blocked, and whether gates are earning their friction."
---

Everything here is local. It reads your own session transcripts on your own machine
and writes to your own filesystem. Nothing is transmitted.

## Context composition

```bash
aof-tools context --limit 150
aof-tools context --root /path/to/projects --raw
```

Recomputes where the context window actually goes, from your own transcripts: tool
results versus tool-call inputs versus assistant text versus images, plus per-tool
call counts and averages.

{{< callout title="Images are priced per block" >}}
`aof-tools context` prices images at roughly 1,500 tokens per block rather than by
base64 length. Counting base64 characters overstates image cost by about 25× —
that was the one real error in the original context audit.
{{< /callout >}}

See [context discipline](/docs/concepts/context-discipline/) for what to do with
the numbers.

## Session audit

```bash
aof-tools session-audit --limit 150
aof-tools session-audit --since 2026-08-01
```

Classifies blocking events across sessions: where agents got stuck, what stopped
them, and how often. This is the acceptance test for the gate-correctness and
model-tier work — "this gate false-positives" is either in this output or it is an
anecdote.

The JSON also carries an `edit_gate_bypass` block that gives every edit-gate denial
exactly one outcome. A denial is *bypassed* when a later Bash command in the same
session writes the denied file, *routed* when the agent goes through an AOForge skill,
a skill marker or a user override phrase instead, and *abandoned* when neither
happens. With `--raw` the same counts appear as an `edit_gate:` line, followed by a
per-month line and a few bypassing commands when there were any denials.

## Telemetry view

```bash
aof-tools telemetry
aof-tools telemetry --scan --limit 150
```

One status-facing view with advisories, combining planning state with session
analysis. `--scan` adds a fresh session audit of blocking events (the `blocks`
block, and a `scan` block recording the root, limit and `--since` date used).
`--limit`, `--since YYYY-MM-DD` and `--root` only mean something to the scan, so
they are rejected without it, and an unknown flag is an error instead of being
ignored. With `--raw` the first line reads
`scan: <n> transcripts, <n> blocks (<n> AOForge-owned)`.

## Transcript export

```bash
aof-tools transcript-export
aof-tools transcript-export --out ~/aoforge-index.jsonl --full ~/transcript-archive --limit 500
```

Writes a compact per-session index before retention deletes the underlying
transcripts. Default output is `~/.claude/aoforge/transcript-index.jsonl`.

You do not need to remember to run it. An AOForge session start runs it in a
detached background process at most once every 24 hours, with the default paths and
no raw copy, so the index keeps up with transcripts as they age out. Set
`AOFORGE_SKIP_TRANSCRIPT_EXPORT=1` in the environment Claude Code is launched from
to turn that off. Run the command yourself with `--full <dir>` when you also want
a raw copy of the transcripts, which the automatic run never makes.

## Override log

```bash
aof-tools override --gate edits --reason "hand-fixing a generated file"
aof-tools override --list --limit 20
```

Structured, logged gate overrides. The point is not bureaucracy — a gate that is
overridden constantly is a gate that is wrong, and this log is the evidence that
makes the case instead of an argument about it.

## The audit log

The `verify-completion` Stop hook emits a JSONL entry per completion to
`~/.claude/aoforge/audit.log`, or to `AOFORGE_AUDIT_LOG_PATH` if set. It is
best-effort and never blocks the Stop event.

## Benchmarks and duplication

```bash
aof-tools benchmark          # timing across recorded runs
aof-tools dup-detect         # duplicated planning artifacts
aof-tools survey decimal-objectives --root <path>
```
