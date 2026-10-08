---
work: feature
---

# Executor token stamp

## Goal

Every executor SUMMARY records its own token usage at write time, so estimation data no longer depends on after-the-fact backfill.

Requirement: EST-09. Every new executor SUMMARY carries `tokens_input` / `tokens_output`. Forward-stamp coverage is at
least 95% over the TRDs executed in v1.6, and the coverage is measured and reported.

## Success criteria (ROADMAP)

1. The installed `agents/executor.md` (new plugin version) contains the `tokens stamp ... --draft` step, and a repo test
   fails if the repository copy lacks it.
2. A SUMMARY written by an executor in this milestone has `tokens_input` and `tokens_output` in its frontmatter with no
   backfill run.
3. A command reports forward-stamp coverage over the TRDs executed in v1.6. The target is at least 95%, and the measured
   number is printed and recorded (no rounding up).

## Findings at planning time (2026-10-08)

**SC-1 is mostly in place.** The stamp step is in the repository `agents/executor.md` `<self_check>` and in the
installed 2.14.0 copy. `tokens-cli.test.cjs` test 11 already fails if the repository copy lacks
`df-tools.cjs tokens stamp {objective}-{trd} --draft` before `summary post`, and test 12 does the same for
`execute-trd.md`. No new test for SC-1 is needed. 66-04 proves test 11 fails when the step is removed.

**Why SUMMARYs go unstamped.** There are three causes, each measured:

| Case | What happened | Evidence | Fix (TRD) |
|------|---------------|----------|-----------|
| 64-09, 64-10 | The executor skipped the prose `tokens stamp` step and ran `summary post` directly. The transcripts exist: `tokens trd 64-09` and `tokens trd 64-10` recover the totals today. | executor transcripts `ad4eb4f9…` and `acebcb31…` have no `tokens stamp` call | 66-02: the SubagentStop gate sends the executor back once when its final SUMMARY has no token fields |
| 65-02, 65-03 | The orchestrator ran both checkpoint TRDs inline in the main session, wrote the SUMMARYs itself, and committed them as `220769c5`. No executor ever ran, so there is no executor transcript to stamp from. | session `5cb099e2…` has executors only for 65-01 and 65-04. `tokens trd 65-02` and `tokens trd 65-03` return `no_transcript` | 66-03: execute-objective states that every TRD runs in an executor, including checkpoint-only TRDs, and the objective report shows unstamped SUMMARYs |
| latent | execute-objective tells the orchestrator to spawn continuation agents "using continuation-prompt.md template", but that template does not exist. A continuation prompt the orchestrator improvises may not name the TRD, so its tokens are never attributed and the stop gate cannot identify it. | `plugins/devflow/devflow/templates/` has no `continuation-prompt.md` | 66-03: an explicit continuation spawn prompt with `PLAN_ID` / `REPO_ROOT` lines |

**Honest coverage.** 65-02 and 65-03 can never be forward-stamped: they have no transcript, and a backfill is not a
forward stamp. Today v1.6 stands at 2 of 4 (65-01 and 65-04 are `live`). With those two misses permanent, 95% needs at
least 40 counted v1.6 TRDs and no further miss (38/40 = 0.95). The command reports whatever number is measured. This
objective never runs `tokens backfill --write`.

## Scope decisions

- `tokens coverage` (66-01) counts every TRD SUMMARY in scope. A SUMMARY with no `## Self-Check` still counts as
  executed unless it is a `## Progress` checkpoint. 65-02 and 65-03 have no `## Self-Check`, so excluding SUMMARYs
  without one would hide exactly the misses this objective is about.
- `tokens_source: "live"` is the only forward stamp. `backfill` and unlabeled values count in the denominator, never in
  the numerator.
- No release in this objective. The hook, the workflow, the executor prose and `tokens coverage` reach the installed
  runtime with the next plugin release. That release is a follow-up, recorded in 66-04. Until then, the objective's own
  measurements run the repository copy of df-tools.

---
*Created: 2026-10-08 (auto-scaffold via bootstrapObjectiveMd); findings added at planning, 2026-10-08*
