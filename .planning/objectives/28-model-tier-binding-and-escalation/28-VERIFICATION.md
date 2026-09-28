---
objective: 28-model-tier-binding-and-escalation
verified: 2026-09-28
verified_at: 2026-09-28T16:36:55Z
status: gaps_found
score: 5/6
re_verification: false
verified_by: TRD 41-01 (retroactive, independent)
gaps:
  - truth: "28-03: effort declared on the haiku-incapable agents planner xhigh, executor xhigh, debugger xhigh, security-auditor xhigh, roadmapper high, ui-evaluator high"
    status: partial
    reason: "Merge regression. 55d1a82 (28-03) added `effort: xhigh` to planner.md and `effort: high` to ui-evaluator.md. The PR #68 merge b657033 (2026-08-27) dropped both lines, and ddc50b4 (2026-09-01) carried the drop forward. At HEAD only 4 of the 6 agents declare effort. The safety rule still holds: no haiku-capable agent declares effort. The shipped reference now misstates the frontmatter."
    artifacts:
      - path: plugins/devflow/agents/planner.md
        issue: "frontmatter lines 1-6 have no `effort:`; 28-03 intended xhigh"
      - path: plugins/devflow/agents/ui-evaluator.md
        issue: "frontmatter has no `effort:`, 28-03 intended high. The same merge also reverted body text to the obsolete `df-ui-evaluator` key (still resolves, because both key forms bind)"
      - path: plugins/devflow/devflow/references/model-profiles.md
        issue: "lines 11 and 23 claim planner=xhigh and ui-evaluator=high in the frontmatter `effort` column; false at HEAD"
      - path: plugins/devflow/devflow/bin/lib/model-profiles.test.cjs
        issue: "the guard only forbids effort on haiku-capable agents and validates levels. Nothing asserts that the reference's effort column matches agent frontmatter, so the merge drop passed CI"
    missing:
      - "Restore `effort: xhigh` in planner.md and `effort: high` in ui-evaluator.md (or deliberately drop them and fix the reference)"
      - "Add a test tying the model-profiles.md effort column to agent frontmatter"
      - "Restore the canonical `ui-evaluator` key in ui-evaluator.md prose"
    warrants_fix_trd: true
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
**Status:** gaps_found (5/6). There is one partial regression; everything else holds.
**Re-verification:** No. This is the first VERIFICATION.md for 28; it was written retroactively by 41-01.

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
| 3 | 28-03: `effort` only on haiku-incapable agents (planner, executor, debugger, security-auditor xhigh; roadmapper, ui-evaluator high), and the test fails if a haiku-capable agent gains it | `rg -n -e '^effort:' plugins/devflow/agents`, the tier map from JSON, `git show 55d1a82`, and `git log --diff-merges=first-parent -S'effort: xhigh'` | At HEAD only **roadmapper high, executor xhigh, debugger xhigh, security-auditor xhigh** declare effort. **planner** and **ui-evaluator** do not: both lines were added in 55d1a82 and dropped by merge b657033 (PR #68). The safety half holds: none of the 7 haiku-capable agents declares effort, and the test at model-profiles.test.cjs:127 enforces it. model-profiles.md:11 and :23 still claim xhigh and high | **PARTIAL (gap)** |
| 4 | 28-04: progress-guard lib + hook registered as PreToolUse; warns at 3, asks at 5, fails open, escape `DEVFLOW_SKIP_PROGRESS_GUARD=1` | `rg -n -e 'guard-no-progress' plugins/devflow/hooks/hooks.json`. progress-guard.cjs:29/31 (`DEFAULT_WARN_AT = 3`, `DEFAULT_STUCK_AT = 5`). Probe `probe28.cjs` | Registered under PreToolUse `matcher: "*"`. Probe: identical calls 1-2 were silent, call 3 wrote a stderr warning, call 5 returned `permissionDecision: ask`, and a varied call after that reset it. Corrupt state gave exit 0 with no decision. The escape env gave nothing across 5 identical calls. Non-JSON stdin gave exit 0 with empty stdout | VERIFIED |
| 5 | 28-05: `references/escalation-policy.md` exists and executor.md carries the request protocol | `wc -l` on the policy. `rg -n -i -e 'escalation' plugins/devflow/agents/executor.md` | The policy is 104 lines. executor.md:743-787 has `<escalation_protocol>`, which links the policy and defines the `## ESCALATION REQUESTED` return | VERIFIED |
| 6 | Escalation is not keyed on raw tool-error rate | `rg -n -e 'PostToolUse' -e 'tool_response' -e 'is_error'` over hooks.json, the guard hook and the lib. `rg -n -i -e 'tool.error' -e 'trigger'` over the policy | 0 hits: the guard never reads tool results and runs PreToolUse only. The policy says "Never escalate on a raw tool error" (:10). Its trigger table lists "Single tool error — do not escalate" (:29), and the triggers are `tests-red-after-2 | verifier-fail | no-progress-stuck` (:73) | VERIFIED |

**Score: 5/6** (truth 3 partial)

## Superseded vs missing

- **Truth 3 is missing, not superseded.** No later objective decided to remove effort from planner or ui-evaluator. The drop came in a merge that also reverted ui-evaluator prose to the pre-28-02 `df-ui-evaluator` key. That is typical of a merge that took the older side of a conflict, not a deliberate change. The reference doc and the 28 SUMMARY still assert the 28-03 state.
- **Truth 2:** CLAUDE.md now documents a global `--cwd` flag. That is additive and does not affect binding.

## Deferred (not gaps)

- **28-06:** Haiku replay eval.
- **Orchestrator re-spawn loop:** the executor can request escalation, but `execute-objective` does not yet act on the request.

## Notes

- Live-runtime confirmation is pending release.
- `models.opus` may trail the newest Opus id (`claude-opus-5-5` is in use). Re-pin at the next refresh; this needs a human decision.

---
_Verified: 2026-09-28T16:36:55Z · Verifier: Claude (verifier, TRD 41-01)_
