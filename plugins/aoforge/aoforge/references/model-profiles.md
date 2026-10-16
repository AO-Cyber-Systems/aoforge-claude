# Model Profiles

Model profiles control which Claude model each AOForge agent uses. This allows balancing quality vs token spend.

> **Source of truth:** `aoforge/references/model-profiles.json` — the table below is derived from that file. To add a new agent or change tier assignments, edit the JSON; do not change `aof-tools.cjs`.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` | frontmatter `effort` |
|-------|-----------|------------|----------|----------------------|
| `planner` | opus | opus | sonnet | xhigh |
| `roadmapper` | opus | sonnet | sonnet | high |
| `executor` | opus | sonnet | sonnet | xhigh |
| `objective-researcher` | opus | sonnet | haiku | — |
| `project-researcher` | opus | sonnet | haiku | — |
| `research-synthesizer` | sonnet | sonnet | haiku | — |
| `debugger` | opus | sonnet | sonnet | xhigh |
| `codebase-mapper` | sonnet | haiku | haiku | — |
| `verifier` | sonnet | sonnet | sonnet | — |
| `job-checker` | sonnet | sonnet | sonnet | — |
| `integration-checker` | sonnet | sonnet | haiku | — |
| `security-auditor` | opus | sonnet | sonnet | xhigh |

Agent keys are canonical **without** a `df-` prefix. `aof-tools resolve-model`
normalises either spelling (TRD 28-02) — before that fix, un-prefixed callers
missed the table entirely and silently fell back to `sonnet`.

## Per-focus tiers and the verdict floor (TRD 76-06)

`focus{}` gives a spawn's focus its own tiers, overlaid on the agent's row when the spawn names it
(`resolve-model <agent> --focus <f>`; `init map-codebase` emits `mapper_models`, and `init
new-project` / `init new-milestone` emit `researcher_models`, one model per focus):

| Agent | Focus | `quality` | `balanced` | `budget` |
|-------|-------|-----------|------------|----------|
| `codebase-mapper` | `concerns` | sonnet | sonnet | haiku |
| `project-researcher` | `architecture` | opus | sonnet | sonnet |
| `project-researcher` | `pitfalls` | opus | sonnet | sonnet |

A focus entry only raises a tier where the focus is judgment work (concerns: security and debt
calls; architecture and pitfalls: trade-offs). Lowering one waits on a recorded eval;
`model-profiles.test.cjs` refuses a focus entry below its agent's row.

`verdict_floor` keeps the pass/fail verdicts (`verifier`, `job-checker`) at `sonnet` or above on
every profile, a project's `agent_models` included: a false pass ships, and a false fail costs two
gap-closure cycles. `model_overrides` stays the explicit, unfloored escape.

## Tier → model id

`models{}` is live, not documentation: a stack pack's vision judge reads it and
sends the id to the Messages API. A stale id here is a runtime defect, not a
cosmetic one.

| Tier | Model id |
|------|----------|
| `opus` | `claude-opus-5-5` |
| `sonnet` | `claude-sonnet-5-5` |
| `haiku` | `claude-haiku-5-5` |

Doctor check 13 (`model-profiles`) and `validate health` W063 flag a pin that
`references/model-rates.json` shows superseded (a newer version of the same
family is priced there) or does not price at all, so the rate table and these
pins cannot drift apart silently.

The `opus` tier resolves to the Task alias `inherit`, so the agent keeps the
session model rather than pinning one.

## Why `effort` lives in frontmatter, not this table

`Task()` takes no effort argument — reasoning effort is declared in each agent's
own frontmatter, so it cannot vary by profile.

**Haiku 4.5 rejects the `effort` parameter.** Any agent that can resolve to the
`haiku` tier in *any* profile therefore must not declare `effort`, or that run
fails. Only these never reach haiku and can carry it: `planner`,
`roadmapper`, `executor`, `debugger`, `security-auditor`, and since TRD 76-06 `verifier` and
`job-checker`. Stack pack agents (a pack's visual judge, for example) take their
tiers from the pack manifest's `models`, not this table.
`model-profiles.test.cjs` enforces this.

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation
- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical objectives

## Resolution Logic

Orchestrators resolve the model before spawning, through one resolver (`resolveAgentModel` in `lib/init.cjs`):
`aof-tools resolve-model <agent> [--objective N] [--focus f] [--escalate-from m] --raw` and every compound init
command call it, so they cannot disagree. Pass the result as the Task model.

The profile comes first: OBJECTIVE.md/TRD override > config `model_profile` > `"auto"` → the (kind, work)
defaults-table cell > `balanced`. Then the tier, highest first (the JSON names the winner in `tier_source`):

1. `--escalate-from <model the attempt ran on>`: one rung above that model, whatever supplied it, an override
   included. `tier_source: escalation`.
2. `model_overrides[agent]`: a tier, `inherit` or a concrete model id. It applies on every profile and focus, and
   to an agent missing from the table too. It is **not floored**. `tier_source: model_overrides`.
3. The project's `agent_models[agent][profile]`. `tier_source: agent_models`.
4. The `focus{}` tier for `--focus`. `tier_source: focus`.
5. The package table row, then its `balanced` entry, then `sonnet`. `tier_source: table`.

Over 3-5 the verdict floor raises `verifier` and `job-checker` to `verdict_floor.tier`
(`tier_source: verdict_floor`). The `opus` tier resolves to the `inherit` alias.

`"auto"` is opt-in on purpose: neither adopt nor the config template writes `model_profile`, and the
table puts every feature and port objective on `quality` (TRD 76-01).

## Per-Agent Overrides

Override specific agents without changing the entire profile using `agent_models` in `.aoforge/config.json`. Partial overrides are supported — only specified agents/tiers are replaced:

```json
{
  "model_profile": "balanced",
  "agent_models": {
    "planner": { "quality": "sonnet" },
    "executor": { "balanced": "opus", "budget": "sonnet" }
  }
}
```

Keys are the bare agent names; the `df-` prefixed spelling (`"df-planner"`) is still accepted, and the bare key wins
when both are present. An `agent_models` tier beats the focus tier and the package default, and stays under the
verdict floor. Valid tier values: `opus`, `sonnet`, `haiku`.

`model_overrides` is a flat per-agent pin (a tier, `inherit` or a model id) that wins over the profile and is not
floored:

```json
{ "model_overrides": { "debugger": "haiku" } }
```

`--escalate-from` still goes one rung above it.

## Switching Profiles

Runtime: `/aoforge:set-profile <profile>`

Per-project default: Set in `.aoforge/config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Complexity-Based Overrides

Beyond static profiles, workflows can dynamically adjust model selection based on task complexity. These overrides augment — never replace — the profile system.

### When to Downgrade

| Scenario | From | To | Rationale |
|----------|------|----|-----------|
| Well-known domain research | profile model | haiku | Standard stack/feature research is pattern matching, not reasoning |
| Gap-closure planning (`--gaps`) | profile model | sonnet | Fixes are scoped and diagnosed — less architectural reasoning needed |
| Re-verification after fixes | profile model | sonnet | Checking known items against codebase, not open-ended analysis |
| Research synthesis (< 3000 words input) | profile model | haiku | Small input = simple aggregation task |

### When to Upgrade

| Scenario | From | To | Rationale |
|----------|------|----|-----------|
| 3rd revision attempt (job-checker loop) | profile model | opus | Repeated failures suggest subtlety that needs stronger reasoning |
| Complex debugging (3+ hypotheses failed) | profile model | opus | Deep investigation requires more capable model |
| Complex execution (> 5 tasks, > 8 files) | profile model | opus | Large plans benefit from stronger context management |

### Application Pattern

Orchestrators assess complexity before spawning agents:

```
1. Evaluate complexity indicators (task_count, files_modified, iteration_count, input_size)
2. Check override conditions from tables above
3. If override applies: pass adjusted model to Task() call
4. Log override: "Model override: {agent} {profile_model} → {override_model} (reason: {reason})"
```

### Safety Rules

- **Never downgrade df-executor below sonnet** — code-writing agents need sufficient reasoning
- **Never downgrade df-planner below sonnet** — architecture decisions require reasoning
- **Overrides are per-spawn, not persistent** — each spawn re-evaluates complexity
- **User model_overrides in config.json take precedence** over complexity-based overrides

## Design Rationale

**Why Opus for df-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for df-executor?**
Executors follow explicit JOB.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the objective promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for df-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why `inherit` instead of passing `opus` directly?**
Claude Code's `"opus"` alias maps to a specific model version. Organizations may block older opus versions while allowing newer ones. AOForge returns `"inherit"` for opus-tier agents, causing them to use whatever opus version the user has configured in their session. This avoids version conflicts and silent fallbacks to Sonnet.
