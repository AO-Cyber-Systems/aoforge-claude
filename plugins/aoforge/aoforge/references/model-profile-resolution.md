# Model Profile Resolution

Resolve model profile once at the start of orchestration, then use it for all Task spawns.

## Resolution Pattern

Ask aof-tools, once per agent type. Never parse `config.json` yourself: the profile also comes from
an OBJECTIVE.md override or, under `"auto"`, the (kind, work) defaults table (TRD 76-01).

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs resolve-model <agent> --objective <N> --raw
```

It prints the Task `model` value (`inherit`, `sonnet` or `haiku`). Without `--raw` it prints JSON
with `profile`, `profile_source` (`objective_override`, `trd_override`, `config`, `defaults_table`,
`default`), `tier` and the concrete `model_id`. Leave `--objective` off when there is no objective.

Profile precedence, highest first: an OBJECTIVE.md or TRD `model_profile` override; `config.json`
`model_profile` set to `quality`, `balanced` or `budget`; `"auto"`, which takes the objective's
defaults-table cell; `balanced`.

## Lookup Table

@~/.claude/aoforge/references/model-profiles.md

Look up the agent in the table for the resolved profile. Pass the model parameter to Task calls:

```
Task(
  prompt="...",
  subagent_type="planner",
  model="{resolved_model}"  # "inherit", "sonnet", or "haiku"
)
```

**Note:** Opus-tier agents resolve to `"inherit"` (not `"opus"`). This causes the agent to use the parent session's model, avoiding conflicts with organization policies that may block specific opus versions.

## Usage

1. Resolve each agent type once at orchestration start with `resolve-model`
2. Pass the printed value as the `model` parameter of each Task call (values: `"inherit"`, `"sonnet"`, `"haiku"`)
