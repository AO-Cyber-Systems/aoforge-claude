---
objective: 43-stack-drafter-rules
verified: 2026-10-04T15:00:00Z
status: passed
score: 36/36 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 35/36
  gaps_closed:
    - "SDR-08: confirm each proposed command runs (follow-up run 2026-10-04: politihub ran, cgo linker fixed, 104 of 105 gates pass or fail on repo state)"
  gaps_remaining: []
  regressions: []
follow_ups:
  - "Run policy: the trades test suite ran once against whatever listens on 127.0.0.1:5432. The effect guard watches the work tree only and cannot see a database write. Add a policy for service-backed gates (require a dedicated TEST_DATABASE_URL or skip), and look at the local database."
  - "Environment: trades `test` needs a dedicated test database before it says anything about the repo."
  - "Drafter-adjacent: a `build` that leaves an un-ignored artifact (eden-circle bin/circle-api) halts the later Flutter gates in the same root."
  - "Known drafter limitations (user-acknowledged 2026-10-03): .planning/todos/pending/2026-10-03-stack-drafter-self-test-and-buf-lint.md"
  - "qrCodeBuilder and eden-circle/client: pub get bumped pubspec.lock; the user decides whether to commit the bumps."
---

# Objective 43: Stack drafter rules Final Verification Report

**Goal:** Fix the drafter defects objective 42's rollout hand-fixed so re-drafting matches the 11 override files.
**Status:** passed. 36/36.
**Re-verification:** Yes, final pass after the 2026-10-03 decisions and the 2026-10-04 SDR-08 follow-up run.

## Carried forward (regression-checked)

- Success line (re-draft matches the 11 override files; no fleet row needs a hand-fix, user-accepted rows count as decided): still VERIFIED. `stack-drafter-fleet.test.cjs` 42/42.
- Golden and realshape suites: 28/28.
- TRD 43-08..43-15 must-haves and D20 purity: unchanged since the last pass; the suites above cover them.
- `npm test`: 8789 tests, 8756 pass, 1 fail, 32 skipped. The one failure is MA-7 (doctl PTY), the known environmental failure. No regression.

## SDR-08: SATISFIED

Verdict: satisfied. The requirement is that each proposed command is confirmed to run. It is not that every command exits 0.

Evidence (43-ROLLOUT.md, `## SDR-08 follow-up run` and its targeted re-run):
- 105 gates ran across 15 repos, including politihub, which had never run under `--run`. 104 of 105 pass or fail on the repo's own state (unformatted files, analyzer and shellcheck findings, dfip's own spec). None hit a wrong tool, wrong cwd or command-not-found.
- The cgo linker cause is fixed (`xcode-select -s /Library/Developer/CommandLineTools`): 11 of 12 link failures now pass and the twelfth (dfip) runs and fails on its own tests.
- The three other host blockers cleared: aocore lint (golangci-lint v2) exits 0; qrCodeBuilder test (`flutter pub get`) exits 0; eden-circle `test@client/` now runs and fails on repo state (pinned `livekit_client 2.6.1` does not compile on the installed Flutter).
- The one environment-blocked gate is trades `test`. The command ran: the suite loaded and executed (the 43-07 failure `ERR_MODULE_NOT_FOUND` is gone). It fails on HTTP 500 from DB-backed routes because no test database exists. That says nothing about the drafter, and the proposed command `npx vitest --run` is the repo's own. I count that as "runs", with a named environment exception.
- Safety: 0 effect-guard survivors, 0 harness deltas, 0 HEAD moves, 0 timeouts, 0 fleet writes. 1 mutation caught and restored (eden-circle `bin/circle-api`).
- Independent spot check today (read-only): HEADs of trades, politihub, qrCodeBuilder, eden-circle and aocore equal the recorded pins. The work-tree dirty counts for politihub (9 to 8), qrCodeBuilder (4 to 2) and aocore (137 to 22) differ from the recorded values. HEAD did not move and I did not touch these repos, so I attribute it to the user's own work after the run. The pinned-HEAD run records stand. It is noted, not a gap.

## Safety finding (follow-up, not a blocker)

The trades suite ran once against a local service on 127.0.0.1:5432. The effect guard watches the work tree only, so a database write is invisible to it, and the kept output cannot show whether any test connected. The 500 responses suggest the DB-backed routes did not get a usable database. I judge this a run-policy gap rather than a defect in the objective: the user approved the `--include test` run, the objective's deliverable is the drafter rules, and no fleet repo changed. Recommended: gate service-backed `test` runs on a dedicated `TEST_DATABASE_URL`, and have the user inspect the local database.

## Remaining items (none block the objective)

See `follow_ups` in the frontmatter.

_Verifier: Claude (verifier)_
