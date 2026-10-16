---
work: refactor
---

# Model efficiency and stack-specific content

## Goal

Each agent spends top-model tokens only on judgment. The configured tier is the tier that runs, mechanical work runs as aof-tools code, each spawn loads only the instructions it needs, and stack-specific procedure lives in the stack profiles rather than in agent prompts.

## Why

An audit on 2026-10-15 read all 13 agents step by step. Findings that shaped the TRDs:

- The intent `model_profile` from the (kind, work) defaults table never reaches `resolve-model`; `build.md` reads `verifier_model` from an init that does not emit it; `diagnose-issues.md` spawns debuggers with no model; the UI judge reads `AOFORGE_MODEL_PROFILE`, not the config.
- `verify trd-pre` already computes five of the job-checker's eight dimensions, but no workflow runs it before the spawn.
- Executor and planner spawns list about 80 KB of `@` references that do not cross the Task boundary (plan-objective.md says so); codebase-mapper loads all 8 templates in each of 4 parallel spawns, project-researcher all 5 in each of 4.
- Flutter-only procedure is about 21% of the executor prompt, 30% of the verifier and 12% of the planner, resident for every project.
- Opus 5.5 cache reads cost the same as Sonnet 5.5, so the saving from a tier downgrade on long agent loops is far below 2x; moving mechanical work to code saves more than moving it to Haiku.
- The budget profile runs the verifier's pass/fail verdict on Haiku; a false pass ships, a false fail triggers two gap-closure cycles.

## Out of scope

- Changing a tier assignment without a measurement (TRD 76-06 records the eval first).
- The orchestrator hand-offs between workflows (general-purpose, inherit): pinning them would drag every inheriting opus-tier agent down.
