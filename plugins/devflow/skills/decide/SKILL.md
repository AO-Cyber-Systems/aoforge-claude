---
name: decide
description: |
  Resolve a parked decision and resume autonomous execution.
  Use when you see a pending DECISION-NNN.md in .planning/decisions/pending/, when the user wants to choose an option for a blocked checkpoint:decision, or when you need to tell the executor which option to take.
  Triggers on: "resolve decision", "decide DECISION-", "pick option for DECISION-", "unblock DECISION-", "answer DECISION-", "choose option for decision", "I want option-a", "go with option-b", "my answer is".
argument-hint: "[<decision-id> <choice>]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Resolve a parked decision (or list pending decisions if no arguments given) and tell the user how to resume gated execution.

Decisions are opened with `df-tools decision open <trd-id> --question <text|@path>` when autonomous execution hits a `checkpoint:decision` it cannot auto-select, and answered with `df-tools decision answer <id> --text <choice>`. Never write or move a decision file by hand.

- **Local mode** (`github.store` off): a decision is `.planning/decisions/pending/DECISION-NNN.md`; answering it moves it to `.planning/decisions/resolved/` and unblocks the TRDs listed in its `blocks` field.
- **Store mode**: a decision is a Decision issue that blocks its TRD, with id `<trd-id>-d<k>` and the read cache `.planning/decisions/<id>.md`; answering it posts the answer and closes the issue.
</objective>

<process>
**Step 1 — No arguments: list pending decisions**

If `$ARGUMENTS` is empty, run:

```bash
node ~/.claude/devflow/bin/df-tools.cjs decision-queue list --raw
```

Parse the JSON array. If empty, report "No pending decisions." and stop.

Otherwise format each decision for the user:

```
DECISION-NNN: <title>
  Recommendation: <recommendation>
  Options: <option names joined by " | ">
  Blocks: <blocks array or "none">
  Context: <context field>

To resolve: /devflow:decide DECISION-NNN <option>
```

Ask the user which decision they want to resolve and which option to pick.

**Step 2 — With arguments: resolve and report**

Parse `$ARGUMENTS` as `<decision-id> <choice>` (first word is id, remainder is choice).

Run:

```bash
node ~/.claude/devflow/bin/df-tools.cjs decision answer <decision-id> --text "<choice>"
```

For a long answer, put it in a draft file and pass `--from <path>` instead of `--text`.

If exit 0, the verb prints `decision answer: wrote .planning/<rel> (<mode> mode).`:
- Read the decision file it names (local: `.planning/decisions/resolved/<decision-id>.md`; store: `.planning/decisions/<decision-id>.md`)
- Local: extract the `blocks` list from its frontmatter. Store: the id `<trd-id>-d<k>` names the TRD the decision blocked
- Report the resolution and list the newly-unblocked TRDs
- Suggest the next step:

```
Decision <id> resolved with: <choice>

Unblocked TRDs:
  - <trd-id>
  - ...

To resume execution:
  /devflow:execute-objective <objective>
```

If `blocks` is empty, report: "Decision resolved. No TRDs were blocked by this decision — execution was already able to continue independently."

If exit non-zero, show the error from stderr and suggest running `/devflow:decide` without arguments to list current pending decisions.

**Step 3 — Context note**

In local mode, decisions in `.planning/decisions/resolved/` are the permanent archive. They are NOT gitignored — parked decisions are durable planning state, not runtime markers. In store mode the closed Decision issue is the archive.
</process>

<context>
Decision files conform to the Pattern 3 format (TRD 10-03):

```
---
id: DECISION-001
objective: 10
wave: 2
trd: 10-03
type: checkpoint:decision
created: 2026-06-12T14:30:00Z
status: pending
blocks: [10-04, 10-05]
independent: [10-06]
recommendation: option-a
---

## Decision: [What's being decided]

**Context:** [Why this matters]

**Options:**

1. **option-a** — [Name]
   - Pros: [benefits]
   - Cons: [tradeoffs]

## To Resolve

Reply: `/devflow:decide DECISION-001 option-a`
```

The `blocks` array lists TRD ids gated on this decision (direct + transitive). `independent` lists TRDs that can proceed regardless. `recommendation` is the planner's suggested pick.

The local file above is what `decision open` writes in local mode (store mode keeps only the question in the cache file).

Writes go through the decision verbs:
- `df-tools decision open <trd-id> --question <text|@path>` — park a new decision
- `df-tools decision answer <id> --text <choice>` (or `--from <path|->`) — answer it; local ids are `DECISION-NNN`, store ids `<trd-id>-d<k>`

Reading and notification stay on `df-tools decision-queue`:
- `list [--raw] [--status resolved]` — list decisions
- `notify <id>` — re-fire OS notification for a pending decision
</context>
