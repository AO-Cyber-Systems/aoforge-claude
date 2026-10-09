---
objective: 41-retroactive-verification
trd: "01"
job: 41-01
status: complete
completed: 2026-09-28
requirements: [VER-27, VER-28]
files_created:
  - .planning/objectives/27-gate-correctness/27-VERIFICATION.md
  - .planning/objectives/28-model-tier-binding-and-escalation/28-VERIFICATION.md
  - .planning/objectives/41-retroactive-verification/41-01-SUMMARY.md
---

# 41-01 SUMMARY: Retroactive verification of objectives 27 and 28

## Verdicts

| Objective | Status | Score | Report |
|---|---|---|---|
| 27 Gate correctness | **passed** | 6/6 | `27-gate-correctness/27-VERIFICATION.md` |
| 28 Model tier binding and escalation | **gaps_found** | 5/6 | `28-model-tier-binding-and-escalation/28-VERIFICATION.md` |

## Gaps

1. **28-03 effort was partially lost in a merge. This warrants a fix TRD.**
   - `plugins/devflow/agents/planner.md:1-6`: `effort: xhigh` is missing.
   - `plugins/devflow/agents/ui-evaluator.md:1-6`: `effort: high` is missing. Its body also reverted to the `df-ui-evaluator` key.
   - Both lines were added in `55d1a82` (28-03) and dropped by the PR #68 merge `b657033` (2026-08-27). `ddc50b4` carried the drop forward.
   - `plugins/devflow/devflow/references/model-profiles.md:11,23` still claims xhigh and high.
   - `model-profiles.test.cjs` has no reference-vs-frontmatter check, so CI stayed green. The safety invariant still holds: no haiku-capable agent declares effort.
   - Fix: restore the two lines, or deliberately drop them and correct the reference. Add a test tying the reference's effort column to agent frontmatter.

There are no gaps for objective 27.

## Deferred (by decision, not gaps)

- **27-03:** gate posture. DECISION-001 is pending.
- **28-06:** Haiku replay eval.
- **28 orchestrator re-spawn loop:** `execute-objective` does not yet act on `ESCALATION REQUESTED`.

## Notes (informational)

- **Both objectives:** live-runtime confirmation is pending release. The hooks go live only after a plugin version bump + `sync-runtime`.
- **27:** CLAUDE.md:31,35 has stale counts ("12 subagent prompts" and "7 other hooks"; 13 agents and 16 other hook files ship).
- **27:** the git-worktree integration tests pass vacuously when git is absent (`gate-edits.test.js:695`). Suggest `t.skip()`.
- **27:** `skill-active.test.cjs` pins `ttlAnchorMs`, so the 27-01a regression is guarded only by `micro.test.cjs`.
- **28:** `models.opus = claude-opus-5`, while `claude-opus-5-5` is in use. This needs a human decision at the next model refresh. It is not a 28 gap.

## Tests run (targeted only)

| Test file | Pass/Total |
|---|---|
| `plugins/devflow/hooks/gate-edits.test.js` | 63/63 |
| `plugins/devflow/hooks/gate-commits.test.js` | 25/25 |
| `plugins/devflow/devflow/bin/lib/skill-active.test.cjs` | 24/24 |
| `plugins/devflow/devflow/bin/lib/micro.test.cjs` | 32/32 |
| `plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 10/10 |
| `plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 13/13 |
| `plugins/devflow/devflow/bin/lib/progress-guard.test.cjs` | 16/16 |
| `plugins/devflow/hooks/guard-no-progress.test.js` | 10/10 |

**Total: 193/193 pass.** The full `npm test` was not run. There were also three independent scratchpad probes that drive the real hook processes: real git worktree + marker, TTL, symlink paths, the commit gate on heredoc/quoted/real invocations, and guard thresholds/fail-open/escape. The repo-copy `df-tools` was used for `resolve-model` (planner, df-planner, executor, bogus) and for `init plan-objective`.

## Scope check

`git status --porcelain .planning/objectives/27-gate-correctness .planning/objectives/28-model-tier-binding-and-escalation .planning/objectives/41-retroactive-verification .planning/ROADMAP.md .planning/STATE.md`:

```
?? .planning/objectives/27-gate-correctness/.gitkeep
?? .planning/objectives/27-gate-correctness/27-VERIFICATION.md
?? .planning/objectives/28-model-tier-binding-and-escalation/.gitkeep
?? .planning/objectives/28-model-tier-binding-and-escalation/28-VERIFICATION.md
```

The `.gitkeep` files were already untracked before this job started. No existing 27/28 file shows ` M`, and ROADMAP.md and STATE.md are clean. This SUMMARY is also new (`??`). Nothing was committed.
