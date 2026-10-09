---
objective: 51-github-migration-and-docs
trd: "07"
type: standard
wave: 4
depends_on: ["51-04", "51-06"]
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs
autonomous: true
requirements: [GMD-01]
must_haves:
  truths:
    - "The drain phase flushes in a bounded loop (`wait:true`, injected `now`/`sleep`): minute-budget and short retry-after waits continue; the hour budget, offline or `maxOps` stop with refusal `pending` stating ops remaining, the earliest resume time and `df-tools upgrade --apply --only 0011 --confirm` (or let the gh-flush hook drain it); a halt stops with refusal `halted` and `gh outbox status` / `gh outbox resolve` guidance"
    - "After a drained flush the verify phase runs `gh pull --all` and the orphan report per objective; any TRD without an issue, issue without a TRD, or pull exit 1 refuses with code `verify` and 0010 does not run"
    - "When verify passes, `migrate` calls `0010.migrate(ctx)` in-process and returns its `changed`/`notes` plus the 0010 store-mode commit steps (STORE_COMMIT_STEPS from 51-04)"
    - "SC1 happy path: on the 20-objective fixture the first apply stops on the hour budget, the clock advances by `wait_ms`, the second `--only 0011` apply completes: 20 Objective issues, 100 TRD sub-issues, blocked-by edges equal the wave edges, SUMMARY comments, shipped work closed `completed`, objective 19 and deferred TRDs closed `not_planned`, open work open, wiki pages pushed, cache baselined, journal empty, cache gitignored and untracked"
    - "Pacing over the whole run (from `fake.writeTimes()`): consecutive writes >= 1,000 ms apart, <= 80 in any 60 s, <= 450 in any 3,600 s"
    - "SC2: after completion `upgrade --check` reports 0011 and 0010 not applicable; another `--apply --only 0011 --confirm` applies nothing, makes zero gh writes and leaves the tree snapshot, config bytes and journal unchanged; a never-enabled project sees zero gh calls and a byte-identical tree"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
      provides: "drain, verify, handoff to 0010; complete migrate"
  key_links:
    - "Composes gh-outbox-flush.flush, gh-store-cli.flushResult/settleLedger, gh pull --all (gh-cache), gh-hierarchy.reportOrphans, 0010.migrate"
---

# TRD 51-07: migration 0011, part 2 — drain, verify, switch to the cache model (SC1 happy path, SC2)

<objective>
Finish the phase machine: drain the outbox within the budgets and stop resumably, verify GitHub matches the local plan, then hand off to
0010 to gitignore and untrack the cache. Prove SC1's happy path (completes under the limits across a resume) and SC2 (re-run no-op).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(51-07): ...` before each `feat(51-07): ...`. New test file `0011-github-store-backfill.apply.test.cjs`.
- Fake time only (`useBackfillEnv`: `client._setNow`/`_setSleep` advance a counter); no real sleep. Never the real GitHub or
  `~/.claude`. Never port 8080.
- Do not raise `outbox.BUDGET` or the client's pacing; the hour budget is a stop, not a wait.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Drain loop**: up to 20 iterations of `flushLib.flush(main, {wait:true, now, sleep, maxOps})` then `storeCli.flushResult(...)`
  (so a drained flush settles the ledger exactly as `gh outbox flush` does). Continue when the result is `pending` with
  `reason: 'budget'` and `budget: 'minute'`, or `rate_limited` with `retry_after` <= 60 s (sleep it through the injected sleep).
  Stop on `pending` with `budget: 'hour'`, `offline`, `max_ops` or a longer retry-after → refusal `pending` with
  `{remaining, wait_ms, resume_at}`; on `halted` → refusal `halted`; on error → refusal `pending` with the error (work stays queued).
  An apply that stops on the hour budget is reported by the runner as `failed` (not stamped) with the text "not an error: N of M ops
  remain"; this is the documented resumable shape (research §1.3 phase 4).
- **Verify**: call the library behind `gh pull --all` (find it via the `gh pull` dispatch in gh.cjs/gh-cache.cjs; use the function, not
  a child process) with the hand-maintained-ROADMAP protection intact; accept exit 0 and 2 (rebuilt with attention items — list them in
  notes); exit 1 refuses. Then `ghHierarchy.reportOrphans` (L659) for every imported objective; any orphan refuses `verify`.
- **Handoff**: `require('./0010-store-gitignore.cjs').migrate(ctx)`; merge its `changed` into 0011's result; append
  `STORE_COMMIT_STEPS` (51-04) and the `gh setup` ordering note (P7: migrate, commit via PR, merge the workflow PR with a one-time
  admin bypass, then require the checks; never fold `gh setup` into 0011).
- **detect completion**: once 0010 no longer applies and the journal is drained and every cache file is baselined, 0011 `detect` is
  `applies:false` (`already on GitHub`). Verify this against the 51-06 rule; adjust only if the handoff path needs it.

## Test list

1. Drain on a small fixture (`objectives: 2`): one apply completes all phases; result `changed` includes `.gitignore`; notes include
   `DEVFLOW_SKIP_GH_GATE=1`; config stamp lists 0011 and 0010.
2. SC1 full run: apply #1 throws `refusal.code === 'pending'` with `budget` hour info and `wait_ms > 0`; nothing stamped; journal has
   pending ops. Advance `clock.t += wait_ms`; apply #2 (`--only 0011` semantics: call `upgrade.apply` with `only:['0011'], confirm:true`)
   completes. Assert the end state listed in must_haves (compare by `devflow:id` markers, not numbers).
3. Pacing: rolling-window assertions over `fake.writeTimes()` (code example below).
4. Verify refusal: delete one TRD issue in the fake before apply #2 completes verification (`fake` seed/delete helper) → refusal
   `verify`, `.gitignore` unchanged, 0010 not run.
5. SC2: after test 2's state, `upgrade.check` → 0011 and 0010 skipped with reasons; `upgrade.apply({only:['0011'], confirm:true})` →
   `applied: []`, `fake.writes().length` unchanged (reads allowed), `diffSnapshots` empty, config bytes and journal bytes equal.
6. Parity: a fixture with `github.enabled: false` → `upgrade.check`/`apply --confirm` make zero gh calls and leave the tree identical.

```js
// pacing (Source: gh-fake.cjs writeTimes(); budgets gh-outbox.cjs:47)
const t = fake.writeTimes();
for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= client.MIN_WRITE_INTERVAL_MS);
const within = (ms) => Math.max(0, ...t.map((x) => t.filter((y) => y >= x && y < x + ms).length));
assert.ok(within(60_000) <= outbox.BUDGET.minute);
assert.ok(within(3_600_000) <= outbox.BUDGET.hour);
```

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: drain, verify, handoff (tests 1, 4)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs</files>
  <action>
RED: tests 1 and 4; commit `test(51-07): migration 0011 drains, verifies and hands off to 0010`.
GREEN: replace the `not_implemented` stop with phases 4-6 per Decisions; remove the `not_implemented` code and update the 51-06 test
that expected it. Commit `feat(51-07): migration 0011 drains the outbox and switches to the cache model`.
# CRITICAL: a refusal after the switch must leave everything resumable: no ledger settle on a partial flush, no 0010 on a gap.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs</verify>
  <done>Tests 1 and 4 pass; 51-06 tests pass with the updated expectation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SC1 full run across the hour budget, pacing (tests 2-3)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs</files>
  <action>
RED: tests 2-3; commit `test(51-07): 20-objective backfill completes under the limits across a resume`.
GREEN: fix whatever the full run exposes (expected candidates: resume-time messaging, `wait_ms` propagation, verify on a large
mapping). Commit `fix(51-07): ...` per defect, or none if green on first run (then say so in the SUMMARY).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs</verify>
  <done>Tests 2-3 pass in fake time (wall clock under ~60 s).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: SC2 no-op and store-off parity (tests 5-6)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs</files>
  <action>
RED: tests 5-6; commit `test(51-07): re-running the backfill is a no-op`.
GREEN: adjust `detect` if the completed state still applies. Commit `fix(51-07): ...` if needed.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs</verify>
  <done>Tests 5-6 pass (SC2).</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox-flush.cjs` `flush` L1560 (options doc L1546-1556; hour budget pending L1593-1600; `maxOps` L1589; retry_after ~L1624).
- `gh-store-cli.cjs` `EXIT` L35, `flushResult` ~L196, `settleLedger` ~L210.
- `gh-hierarchy.cjs` `reportOrphans` L659; `waveEdges` (blocked-by expectations).
- `0010-store-gitignore.cjs` `migrate` L338 and (51-04) `STORE_COMMIT_STEPS`.
- `upgrade-fixtures.cjs` `snapshot` L407, `diffSnapshots` L430; `upgrade.cjs` `check`/`apply`.
</codebase_examples>
<anti_patterns>
- Sleeping through the hour budget; settling the ledger on a partial flush; spawning `df-tools` as a child process inside `migrate`.
- Asserting zero gh calls in SC2 (upsert handlers read before writing): assert zero writes.
</anti_patterns>
<error_recovery>
- If the full run is slow, reduce TRD body sizes in the fixture call (not the counts) and profile with `--test-reporter=spec`.
- If `gh pull --all` would overwrite the fixture's hand-maintained ROADMAP, that is a defect in the protection, not the test: stop
  and record it rather than weakening the assertion.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs</regression>
</validation_gates>

<verification>
- SC1 (completes under the secondary limits, resumes across the hour budget): tests 2-3. SC2: tests 5-6.
</verification>

<success_criteria>
`upgrade --apply --only 0011 --confirm`, run until it stops refusing, moves a 20-objective project onto GitHub with history closed and
the cache untracked; running it again changes nothing.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-07-SUMMARY.md` (via `summary post 51-07 --from <file>`)
</output>
