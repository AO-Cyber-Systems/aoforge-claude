---
objective: 52-store-mode-polish
kind: plugin
work: bugfix
status: registered
milestone: v1.4
gap_closure: v1.4-MILESTONE-AUDIT
---

# Objective 52 — Store-mode polish

Registered 2026-10-01 from the v1.4 milestone audit's tech-debt list (`milestones/v1.4-MILESTONE-AUDIT.md`). No requirement is unsatisfied; these are rough edges in the GitHub system-of-record work (46-51) that a store-mode user hits first.

## Items

1. **Printed `df-tools commit` follow-ups are refused by GEN-01 in store mode.** Migration 0010, doctor check 20 and `gh-setup-cli.cjs:92` print "commit them" instructions that the commit gate refuses on the default or an unlinked branch. Make each instruction gate-aware (name the branch step, `gh pr start`) (50-VERIFICATION).
2. **Gate refusals omit the escape.** `gh-gate.cjs` refusal messages point to `gh pr start` but not to `DEVFLOW_SKIP_GH_GATE=1` (documented only in USER-GUIDE) (50-VERIFICATION).
3. **`micro.cjs` appends a STATE.md Quick Tasks row in store mode**, though STATE.md is a generated view there; it shows up as W055 drift. Route it through the quick/state verb or skip it in store mode (48-VERIFICATION).
4. **`agents/debugger.md:404` instructs a raw `git commit`** that gate-commits blocks; switch to `df-tools commit` (48-VERIFICATION).
5. **No opt-out for projects that keep GitHub in mirror mode.** Migration 0011 stays a pending confirm migration and `validate health` reports W040 forever. Add a recorded opt-out that 0011 and W040 respect (51 / CLAUDE.md "Next").
6. **Multi-line `decision answer` bug** (CLAUDE.md "Next").

## Success

In a store-mode fixture, every printed follow-up succeeds as printed on a linked branch, gate refusals name both remedies, `micro` leaves no W055 drift, a mirror-mode project with the opt-out shows no W040, and a multi-line `decision answer` round-trips intact. `npm test` green apart from the known MA-7.
