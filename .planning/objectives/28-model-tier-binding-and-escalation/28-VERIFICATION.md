---
objective: 28-model-tier-binding-and-escalation
verified: 2026-09-28
verified_at: 2026-09-28T16:36:55Z
status: passed
score: 6/6
re_verification:
  re_verified_at: 2026-09-28
  previous_status: gaps_found
  previous_score: 5/6
  closed_by: "TRD 41-07"
  closing_commits: [eef1486, 3d8e25f, 4f77a36]
  gaps_closed:
    - "28-03 effort: planner.md:4 `effort: xhigh` and ui-evaluator.md:4 `effort: high` restored (3d8e25f); all 6 haiku-incapable agents now declare effort"
    - "Canonical `ui-evaluator` key restored: 0 `df-ui-evaluator` hits in ui-evaluator.md"
    - "Docs parity: model-profiles.md planner=xhigh / ui-evaluator=high rows match frontmatter, and a new test ('documented effort equals frontmatter effort for every row', plus a df- prefix ban) enforces it (eef1486)"
  gaps_remaining: []
  regressions: []
verified_by: TRD 41-01 (retroactive, independent); re-verified after TRD 41-07
gaps: []
deferred:
  - id: 28-06
    what: "Haiku replay eval (rung 0 decision)"
    why: "Deferred by decision — 63 Haiku turns is no basis to decide; needs a replay harness"
  - id: orchestrator-respawn-loop
    what: "Orchestrator-side escalation (execute-objective re-spawns one rung up on an ESCALATION REQUESTED return)"
    why: "28 SUMMARY 'Also not done' — touches live orchestration and wants its own objective"
notes:
  - kind: live_runtime
    note: "Live-runtime confirmation pending release. guard-no-progress.js and the resolve-model changes run from the plugin cache and go live only after a plugin version bump + sync-runtime. Verified against repo code and tests."
  - kind: model_id_currency
    where: plugins/devflow/devflow/references/model-profiles.json:14
    note: "models.opus = claude-opus-5 (refreshed 2026-08-18). This verifier ran as claude-opus-5-5, so a newer Opus id exists. That is not a 28 gap: the 28-01 refresh held when it shipped, and nothing shows the id is invalid. models{} is live (flutter-ui-eval.cjs:510-514), so re-pin it at the next model refresh. Human decision."
  - kind: guard_fail_open
    note: "guard-no-progress.js handles bad stdin and a corrupt state file by returning or no-op. main() is not wrapped in a top-level try, but every I/O path is individually guarded. The probe confirmed exit 0 on garbage input."
---

# Objective 28: Model tier binding and escalation. Verification report

**Objective goal (ROADMAP):** Make the model profile table actually bind, since it was inert for every skill caller. Refresh the live model ids, and give DevFlow an escalation signal that is not raw tool-error rate.
**Verified:** 2026-09-28, against `feat/stack-profile-loader` at HEAD `0912720`
**Status:** passed (6/6), after re-verification. The initial run (41-01) found gaps_found (5/6); gap-fix TRD 41-07 closed the truth 3 regression.
**Re-verification:** Yes, 2026-09-28, after TRD 41-07 (eef1486, 3d8e25f, 4f77a36).

## Tests re-run

| Command | Result |
|---|---|
| `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs` | 13/13 pass |
| `node --test plugins/devflow/devflow/bin/lib/progress-guard.test.cjs` | 16/16 pass |
| `node --test plugins/devflow/hooks/guard-no-progress.test.js` | 10/10 pass |

All three pass, and the gap in truth 3 is still real. The suite does not cover it (see the gap entry).

## Observable truths

| # | Truth | Evidence command | Observed | Verdict |
|---|---|---|---|---|
| 1 | 28-01: `models{}` pins current ids and is documented as live | `node -e` dump of model-profiles.json. `rg -n` over flutter-ui-eval.cjs and model-profiles.md | `models{opus: claude-opus-5, sonnet: claude-sonnet-5, haiku: claude-haiku-4-5}`. The JSON `_comment` and model-profiles.md:31 both say `models{}` is live. flutter-ui-eval.cjs:510-514 reads `profiles.models[tier]` | VERIFIED (currency advisory in notes) |
| 2 | 28-02: both caller forms bind, unknown agents are loud, and a key-drift guard exists | `node plugins/devflow/devflow/bin/df-tools.cjs resolve-model planner`, `… df-planner`, `… executor`, `… bogus-agent-xyz`, and `init plan-objective 41` | `planner` and `df-planner` both give `{model: inherit, tier: opus, model_id: claude-opus-5}` with no `unknown_agent`. `executor` gives sonnet. The bogus agent gives a stderr warning ("configured profile … is NOT being applied") plus `unknown_agent: true`. init.cjs passes the `df-` form (lines 351-1123), and `init plan-objective` emits `planner_model: inherit`, `researcher_model/checker_model: sonnet`. The drift guard is in model-profiles.test.cjs (13 pass) | VERIFIED |
| 3 (re) | 28-03 re-check after 41-07 | `rg -n -e '^effort:' plugins/devflow/agents`. `rg` for the planner/ui-evaluator rows in model-profiles.md. `rg -n -e 'df-ui-evaluator'` in ui-evaluator.md | planner xhigh, executor xhigh, debugger xhigh, security-auditor xhigh, roadmapper high, ui-evaluator high: all 6 declare effort. The reference rows are `planner … xhigh` and `ui-evaluator … high`. There are 0 `df-ui-evaluator` hits. The parity test passes | **VERIFIED (closed)** |
| 3 | 28-03: `effort` only on haiku-incapable agents (planner, executor, debugger, security-auditor xhigh; roadmapper, ui-evaluator high), and the test fails if a haiku-capable agent gains it | `rg -n -e '^effort:' plugins/devflow/agents`, the tier map from JSON, `git show 55d1a82`, and `git log --diff-merges=first-parent -S'effort: xhigh'` | At HEAD only **roadmapper high, executor xhigh, debugger xhigh, security-auditor xhigh** declare effort. **planner** and **ui-evaluator** do not: both lines were added in 55d1a82 and dropped by merge b657033 (PR #68). The safety half holds: none of the 7 haiku-capable agents declares effort, and the test at model-profiles.test.cjs:127 enforces it. model-profiles.md:11 and :23 still claim xhigh and high | **PARTIAL (gap)** |
| 4 | 28-04: progress-guard lib + hook registered as PreToolUse; warns at 3, asks at 5, fails open, escape `DEVFLOW_SKIP_PROGRESS_GUARD=1` | `rg -n -e 'guard-no-progress' plugins/devflow/hooks/hooks.json`. progress-guard.cjs:29/31 (`DEFAULT_WARN_AT = 3`, `DEFAULT_STUCK_AT = 5`). Probe `probe28.cjs` | Registered under PreToolUse `matcher: "*"`. Probe: identical calls 1-2 were silent, call 3 wrote a stderr warning, call 5 returned `permissionDecision: ask`, and a varied call after that reset it. Corrupt state gave exit 0 with no decision. The escape env gave nothing across 5 identical calls. Non-JSON stdin gave exit 0 with empty stdout | VERIFIED |
| 5 | 28-05: `references/escalation-policy.md` exists and executor.md carries the request protocol | `wc -l` on the policy. `rg -n -i -e 'escalation' plugins/devflow/agents/executor.md` | The policy is 104 lines. executor.md:743-787 has `<escalation_protocol>`, which links the policy and defines the `## ESCALATION REQUESTED` return | VERIFIED |
| 6 | Escalation is not keyed on raw tool-error rate | `rg -n -e 'PostToolUse' -e 'tool_response' -e 'is_error'` over hooks.json, the guard hook and the lib. `rg -n -i -e 'tool.error' -e 'trigger'` over the policy | 0 hits: the guard never reads tool results and runs PreToolUse only. The policy says "Never escalate on a raw tool error" (:10). Its trigger table lists "Single tool error — do not escalate" (:29), and the triggers are `tests-red-after-2 | verifier-fail | no-progress-stuck` (:73) | VERIFIED |

**Score: 6/6** (truth 3 was partial in the initial run; 41-07 closed it. See the re-verification section)

## Superseded vs missing

- **Truth 3 is missing, not superseded.** No later objective decided to remove effort from planner or ui-evaluator. The drop came in a merge that also reverted ui-evaluator prose to the pre-28-02 `df-ui-evaluator` key. That is typical of a merge that took the older side of a conflict, not a deliberate change. The reference doc and the 28 SUMMARY still assert the 28-03 state.
- **Truth 2:** CLAUDE.md now documents a global `--cwd` flag. That is additive and does not affect binding.

## Re-verification 2026-09-28 (after TRD 41-07)

| Check | Result |
|---|---|
| `node --test plugins/devflow/devflow/bin/lib/model-profiles.test.cjs plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | 45/45 pass. The new suite "TRD 41-07: reference effort column matches agent frontmatter" is included |
| `rg -n -e '^effort:' plugins/devflow/agents` | 6 hits: planner/executor/debugger/security-auditor xhigh, roadmapper/ui-evaluator high |
| `rg -n -e 'df-ui-evaluator' plugins/devflow/agents/ui-evaluator.md` | 0 hits |
| Regression, truth 2: `resolve-model planner` / `resolve-model df-ui-evaluator` | `inherit`/opus/claude-opus-5 and sonnet/claude-sonnet-5. Neither is `unknown_agent` |
| Regression, truths 4 and 6: `node --test` on progress-guard, guard-no-progress, classifier and override | 87/87 pass. hooks.json still registers guard-no-progress |
| Regression, truth 5: escalation-policy.md | 104 lines, unchanged |

Truth 3 is closed and there are no regressions. The deferrals (28-06, the orchestrator re-spawn loop) and the notes still stand.

## Deferred (not gaps)

- **28-06:** Haiku replay eval.
- **Orchestrator re-spawn loop:** the executor can request escalation, but `execute-objective` does not yet act on the request.

## Notes

- Live-runtime confirmation is pending release.
- `models.opus` may trail the newest Opus id (`claude-opus-5-5` is in use). Re-pin at the next refresh; this needs a human decision.

---
_Verified: 2026-09-28T16:36:55Z · Verifier: Claude (verifier, TRD 41-01)_
_Re-verified: 2026-09-28 · Verifier: Claude (verifier, after TRD 41-07)_
