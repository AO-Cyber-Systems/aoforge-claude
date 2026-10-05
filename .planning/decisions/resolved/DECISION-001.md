---
id: DECISION-001
objective: 27
trd: 27-03
status: resolved
raised: 2026-08-18
blocks: []
recommendation: option-c
resolution: |-
  option-a: enforce properly. Extend the edit gate from the tool name to the action, so writes to tracked repo source through Bash (redirection, tee, sed -i, cp/mv onto a file, inline python/node writes) are gated like Edit/Write.

  Decided by the user on 2026-10-05, after a clarifying review:
  - the gate's purpose is a routing nudge;
  - the user's own small asks should still route through micro/quick;
  - the decision sets the shipped default for every DevFlow user.

  Evidence (quick-31 `session-audit` bypass counter, 2026-10-05):
  - since 2.11.0 (2026-09-28): 36 denials, 0 bypasses, 31 routed, 5 abandoned;
  - all retained history: 135 denials, 9 bypasses (6.7%, all 2026-09-06..14, before the 27-01/27-02 fixes).

  Option A is therefore a preventive guarantee rather than a fix for current behaviour. Its main risk is false positives from a Bash content analyser (see the commit gate's substring history, 27-04). Implementing objectives must bound that risk with:
  - invocation-aware parsing (strip heredoc bodies and quoted arguments);
  - tracked-source scope only (never `.planning/`, `.md`, out-of-repo, tmp or scratchpad paths);
  - the existing escapes (skill marker, devflow:* agent_type, override phrases, DEVFLOW_SKIP_EDIT_GATE) and gates.editGate severity;
  - a measured false-positive rate via `session-audit` before it ships as default strict.
resolved_at: "2026-10-05T15:07:04.769Z"
---

# DECISION-001 — Edit-gate posture for source files

## Context

The Autonomy Blocker Audit found the edit gate pays its full cost while
enforcing almost nothing (F-03): 89.5% of denials were followed by a Bash call,
and **331 of those wrote the blocked file anyway** via `cat > f <<'EOF'` — one
transcript literally used the delimiter `DEVFLOW_EOF`. The gate binds a tool
name, not an action, so shell redirection sails through.

The remediation plan proposed making `.planning/` strict and source `warn`.
Reading the code during 27-03 showed that framing was wrong:

- `gate-edits.js:129` **already allows** `.planning/**` unconditionally
- `gate-edits.js:132` **already allows** all `.md`
- the gate therefore only ever denied non-markdown source

Making `.planning/` strict would *invert* deliberate long-standing behaviour
(planning artifacts are meant to be edited directly), so it was not done
unilaterally.

## What changed underneath this decision

TRD 27-01 fixed the marker so worktree subagents are no longer denied, and
27-02 stopped gating paths outside the repo. Together those addressed the
mechanisms behind ~1,328 of the 1,357 measured edit-gate denials. **The bypass
pressure that motivated a posture change may now be largely gone** — a
sanctioned agent that is never wrongly denied has no reason to route around the
gate.

## Options

- **option-a — Enforce properly.** Extend gating to the *action*: any write to
  tracked repo source, including Bash redirection, `sed -i`, `tee`. Honest, but
  needs a Bash PreToolUse content analyser and will produce its own false
  positives (the commit gate's substring bug is the cautionary tale).
- **option-b — Downgrade source to `warn` now.** One-line change; `gates.editGate`
  already supports it. Keeps the routing nudge, removes the hard stop. But it
  softens the default for every DevFlow user on the strength of pre-fix data.
- **option-c — Re-measure first, then decide.** (recommended) Leave the posture
  at `strict`. Objective 31 ships block telemetry; after a week of real use,
  re-run the audit scanners. If edit-gate denials have collapsed, no posture
  change is warranted. If Bash-heredoc bypasses persist, take option-a.

## Recommendation

**option-c.** The evidence that justified changing posture was collected before
the marker was fixed, and 27-01/27-02 removed the dominant cause. Deciding now
would be acting on stale data — and option-b permanently softens a default for
all users based on it. The cost of waiting is one measurement cycle.

## Resolve with

`/devflow:decide DECISION-001 option-<a|b|c>`
